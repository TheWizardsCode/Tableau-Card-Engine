/**
 * Main Street: Card Template Loading & Accessors
 *
 * Handles CSV import, parsing, template array management, and the
 * `get*Templates()` accessors. Module-level mutable state (`_csvRows`,
 * template arrays, lookup maps) is initialized from the bundled CSV at
 * module load time and can be replaced at runtime via `loadTemplatesFromCsv()`
 * when a saved checkpoint carries different card-data.csv content.
 *
 * @module
 */

import cardDataRaw from './card-data.csv?raw';
import { parseCsv } from '@core-engine/CsvLoader';
import { computeCsvChecksum } from './CsvChecksum';
import type {
  BusinessCard,
  CommunitySpaceCard,
  EventCard,
  DurationEventCard,
  UpgradeCard,
  StaffCard,
  SynergyType,
  EventTrigger,
  EventTarget,
} from './MainStreetCardsTypes';

// ── Raw CSV & Checksum ──────────────────────────────────────

/**
 * The raw text content of card-data.csv, bundled at build time via Vite's `?raw` import.
 * Exported so that save-game serializers can embed the CSV data in checkpoints.
 */
export const CARD_DATA_RAW: string = cardDataRaw;

/**
 * Deterministic checksum of the current card-data.csv content.
 * Computed once at module load time from the Vite-imported raw CSV.
 * Used to detect when the CSV has changed between saves/loads.
 */
export const CSV_CHECKSUM: string = computeCsvChecksum(cardDataRaw);

// ── Mutable CSV Rows Container ──────────────────────────────

/** Mutable CSV rows container, initialized from the module-level import. */
let _csvRows: Record<string, string>[] = parseCsv(cardDataRaw);

/**
 * Returns the currently active parsed CSV rows.
 * Initially loaded from the bundled card-data.csv at module load time.
 * When a saved checkpoint carries different CSV data (mismatched checksum),
 * loadTemplatesFromCsv() replaces this with the saved CSV's rows.
 */
export function getCsvRows(): readonly Record<string, string>[] {
  return _csvRows;
}

// ── Template Arrays ─────────────────────────────────────────

/** All Business card templates parsed from the CSV. Mutable for runtime CSV reload support. */
let _BUSINESS_TEMPLATES: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] = [];

/** All Community Space card templates parsed from the CSV. Mutable for runtime CSV reload support. */
let _COMMUNITY_SPACE_TEMPLATES: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'reputationBonus'>[] = [];

/** All Event card templates parsed from the CSV. Mutable for runtime CSV reload support. */
let _EVENT_TEMPLATES: EventCard[] = [];

/** All Upgrade card templates parsed from the CSV. Mutable for runtime CSV reload support. */
let _UPGRADE_TEMPLATES: UpgradeCard[] = [];

/** All Staff card templates parsed from the CSV. Mutable for runtime CSV reload support. */
let _STAFF_CARD_TEMPLATES: StaffCard[] = [];

/** Mutable map from card template ID to display name. Updated by rebuildTemplateArrays(). */
let _CARD_TEMPLATE_NAMES: Map<string, string> = new Map();

/** Mutable map from card template ID to tier number. Updated by rebuildTemplateArrays(). */
let _CARD_TIER_MAP: Map<string, string> = new Map();

// ── CSV Reload ──────────────────────────────────────────────

/**
 * Reloads all module-level card template arrays from the given CSV string.
 *
 * This allows the deserializer to use saved checkpoint CSV data when the
 * bundled card-data.csv has changed, ensuring card templates match the
 * saved game state. After a new game setup, resetTemplatesToDefault()
 * restores the bundled import.
 *
 * @param csvData  Raw CSV string (same format as card-data.csv).
 */
export function loadTemplatesFromCsv(csvData: string): void {
  _csvRows = parseCsv(csvData);
  rebuildTemplateArrays(_csvRows);
}

/**
 * Resets all module-level card template arrays to their original
 * values from the bundled card-data.csv import.
 */
export function resetTemplatesToDefault(): void {
  _csvRows = parseCsv(cardDataRaw);
  rebuildTemplateArrays(_csvRows);
}

// ── Template Rebuild ────────────────────────────────────────

/**
 * Rebuilds the module-level BUSINESS_TEMPLATES, COMMUNITY_SPACE_TEMPLATES,
 * EVENT_TEMPLATES, UPGRADE_TEMPLATES arrays from the given parsed CSV rows.
 * Also rebuilds derived lookup maps (CARD_TEMPLATE_NAMES, CARD_TIER_MAP).
 */
function rebuildTemplateArrays(rows: Record<string, string>[]): void {
  // Rebuild template arrays from parsed CSV rows
  const bizTemplates = rows
    .filter(r => r.family === 'business')
    .map(r => ({
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      baseIncome: Number(r.baseIncome) || 0,
      synergyTypes: (r.synergyTypes || '').split('|').filter(Boolean) as unknown as SynergyType[],
      upgradePath: r.upgradePath || undefined,
      maxLevel: Number(r.maxLevel) || 0,
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      synergyCoinBonus: r.synergyCoinBonus !== undefined && r.synergyCoinBonus !== '' ? Number(r.synergyCoinBonus) : undefined,
      synergyRepBonus: r.synergyRepBonus !== undefined && r.synergyRepBonus !== '' ? Number(r.synergyRepBonus) : undefined,
      ongoingCost: Number(r.ongoingCost) || 0,
      description: r.description,
    }));

  const csTemplates = rows
    .filter(r => r.family === 'community-space')
    .map(r => ({
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      baseIncome: Number(r.baseIncome) || 0,
      ongoingCost: Number(r.ongoingCost) || 0,
      synergyTypes: (r.synergyTypes || '').split('|').filter(Boolean) as unknown as SynergyType[],
      upgradePath: r.upgradePath || undefined,
      maxLevel: Number(r.maxLevel) || 0,
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      synergyCoinBonus: r.synergyCoinBonus !== undefined && r.synergyCoinBonus !== '' ? Number(r.synergyCoinBonus) : undefined,
      synergyRepBonus: r.synergyRepBonus !== undefined && r.synergyRepBonus !== '' ? Number(r.synergyRepBonus) : undefined,
      description: r.description,
    }));

  const evtTemplates: EventCard[] = rows
    .filter(r => r.family === 'event')
    .map(r => {
      // Parse optional week-window columns (CG-0MTT0K9RX0004QTE / F1)
      const ws = r.availableWeekStart ? Number(r.availableWeekStart) : undefined;
      const we = r.availableWeekEnd ? Number(r.availableWeekEnd) : undefined;
      // Parse choice-event columns (CG-0MTSHG8RP008E128)
      const hasChoices = r.hasChoices ? r.hasChoices.trim().toLowerCase() === 'true' : undefined;
      const acceptNextCardId = r.acceptNextCardId ? r.acceptNextCardId.trim() || null : undefined;
      const rejectNextCardId = r.rejectNextCardId ? r.rejectNextCardId.trim() || null : undefined;
      const base: EventCard = {
        family: 'event',
        id: r.id,
        name: r.name,
        cost: Number(r.cost) || 0,
        trigger: r.trigger as EventTrigger,
        effect: r.effect,
        target: r.target as EventTarget,
        targetSynergy: (r.targetSynergy || undefined) as SynergyType | undefined,
        coinDelta: Number(r.coinDelta) || 0,
        reputationDelta: Number(r.reputationDelta) || 0,
        ...(ws !== undefined && we !== undefined
          ? { availableWeekStart: ws, availableWeekEnd: we }
          : {}),
        ...(hasChoices === true ? { hasChoices: true } : {}),
        ...(acceptNextCardId !== undefined ? { acceptNextCardId } : {}),
        ...(rejectNextCardId !== undefined ? { rejectNextCardId } : {}),
      };
      if (r.duration) {
        return {
          ...base,
          duration: Number(r.duration),
          effectType: r.effectType,
          multiplier: Number(r.multiplier) || 0,
        } as DurationEventCard;
      }
      return base;
    });

  const upgTemplates: UpgradeCard[] = rows
    .filter(r => r.family === 'upgrade')
    .map(r => ({
      family: 'upgrade',
      id: r.id,
      name: r.name,
      targetBusiness: r.targetBusiness,
      cost: Number(r.cost) || 0,
      incomeBonus: Number(r.incomeBonus) || 0,
      synergyRangeBonus: Number(r.synergyRangeBonus) || 0,
      description: r.description,
      requiredLevel: r.requiredLevel ? Number(r.requiredLevel) : undefined,
      reputationBonus: r.reputationBonus ? Number(r.reputationBonus) : undefined,
      newDisplayName: r.newDisplayName || undefined,
    }));

  // Assign to the mutable module-level variables
  _BUSINESS_TEMPLATES.length = 0;
  _BUSINESS_TEMPLATES.push(...bizTemplates);
  _COMMUNITY_SPACE_TEMPLATES.length = 0;
  _COMMUNITY_SPACE_TEMPLATES.push(...csTemplates);
  _EVENT_TEMPLATES.length = 0;
  _EVENT_TEMPLATES.push(...evtTemplates);
  _UPGRADE_TEMPLATES.length = 0;
  _UPGRADE_TEMPLATES.push(...upgTemplates);

  // Rebuild derived lookup maps
  _CARD_TEMPLATE_NAMES.clear();
  for (const t of bizTemplates) _CARD_TEMPLATE_NAMES.set(t.id, t.name);
  for (const t of csTemplates) _CARD_TEMPLATE_NAMES.set(t.id, t.name);
  for (const t of evtTemplates) _CARD_TEMPLATE_NAMES.set(t.id, t.name);
  for (const t of upgTemplates) _CARD_TEMPLATE_NAMES.set(t.id, t.name);
  // Staff templates are also first-class cards in the general market
  // (CG-0MT3KZNQB0053K55); register them in the display-name lookup.
  for (const row of rows) {
    if (row.family === 'staff' && row.id) {
      _CARD_TEMPLATE_NAMES.set(row.id, row.name);
    }
  }

  _CARD_TIER_MAP.clear();
  for (const row of rows) {
    if (row.tier && row.tier.trim() !== '') {
      _CARD_TIER_MAP.set(row.id, row.tier.trim());
    }
  }

  // Rebuild STAFF_CARD_TEMPLATES
  _STAFF_CARD_TEMPLATES.length = 0;
  const staffRows = rows.filter(r => r.family === 'staff');
  for (const r of staffRows) {
    _STAFF_CARD_TEMPLATES.push({
      family: 'staff',
      id: r.id,
      name: r.name,
      cost: Number(r.cost) || 0,
      ongoingCost: Number(r.ongoingCost) || 0,
      handSlotsAdded: Number(r.handSlotsAdded) || 0,
      description: r.description,
      allowedBusinessTypes: (r.allowedBusinessTypes || '').split('|').filter(Boolean),
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      refreshCostDiscount: r.refreshCostDiscount ? Number(r.refreshCostDiscount) : undefined,
      actionsPerTurn: r.actionsPerTurn ? Number(r.actionsPerTurn) : undefined,
      peekOncePerTurn: r.peekOncePerTurn ? Number(r.peekOncePerTurn) > 0 : undefined,
    });
  }
}

// ── Template Accessors ──────────────────────────────────────

/** Returns the currently active Business card template arrays. */
export function getBusinessTemplates(): typeof _BUSINESS_TEMPLATES {
  return _BUSINESS_TEMPLATES;
}

/** Returns the currently active Community Space card template arrays. */
export function getCommunitySpaceTemplates(): typeof _COMMUNITY_SPACE_TEMPLATES {
  return _COMMUNITY_SPACE_TEMPLATES;
}

/** Returns the currently active Event card template arrays. */
export function getEventTemplates(): EventCard[] {
  return _EVENT_TEMPLATES;
}

/** Returns the currently active Upgrade card template arrays. */
export function getUpgradeTemplates(): UpgradeCard[] {
  return _UPGRADE_TEMPLATES;
}

/** Returns the currently active Staff card templates. */
export function getStaffCardTemplates(): StaffCard[] {
  return _STAFF_CARD_TEMPLATES;
}

// Initialize all template arrays from the bundled CSV
rebuildTemplateArrays(_csvRows);

// ── Deprecated (kept for backward compatibility) ────────────

/**
 * @deprecated Use getCsvRows() instead.
 * Kept for backward compatibility. This reference is set at module init time
 * and will NOT update after loadTemplatesFromCsv() is called. Consumers
 * should use getCsvRows() for the live value.
 */
export const CSV_ROWS: readonly Record<string, string>[] = _csvRows;

/**
 * @deprecated Use getStaffCardTemplates() instead.
 * Kept for backward compatibility with existing test code.
 */
export const STAFF_CARD_TEMPLATES: StaffCard[] = _STAFF_CARD_TEMPLATES;

// ── Lookup Maps (Read-only references) ──────────────────────

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its display name
 * (e.g. `'Cafe'`). Updated at runtime when loadTemplatesFromCsv() is called.
 */
export const CARD_TEMPLATE_NAMES: ReadonlyMap<string, string> = _CARD_TEMPLATE_NAMES;

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its tier number
 * (as a numeric string, e.g. `'1'` through `'12'`).
 */
export const CARD_TIER_MAP: ReadonlyMap<string, string> = _CARD_TIER_MAP;
