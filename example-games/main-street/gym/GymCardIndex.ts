/**
 * GymCardIndex -- Pure query / grouping / formatting helpers for the
 * Card Type Index Gym scene (`GymCardIndexScene`).
 *
 * These helpers flatten the Main Street card pool (business,
 * community-space, event, upgrade, staff) into a browsable index, provide
 * two grouping strategies, a simple case-insensitive text filter, and a
 * complete raw-data detail sheet for the card detail dialog.
 *
 * Keeping the logic pure (no Phaser dependency) means the index behaviour is
 * unit-testable without a browser, while the scene is a thin rendering layer
 * over these functions.
 *
 * ## Grouping semantics
 *
 * - `groupByFamily()` groups by `CardFamily` — each card belongs to exactly
 *   one group, matching the CSV `family` column ("group by type").
 * - `groupBySynergy()` groups by `SynergyType`. A card with more than one
 *   synergy type appears in **every** matching group (the "synergy view"),
 *   while cards with no synergies (event/upgrade/staff) land in the explicit
 *   {@link UNSYNERGISED_GROUP_KEY} catch-all.
 *
 * @module example-games/gym/GymCardIndex
 */

import {
  CARD_TIER_MAP,
  getBaseTypeId,
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getStaffCardTemplates,
  getUpgradeTemplates,
  isDurationEventCard,
  type AnyCard,
  type CardFamily,
  type EventCard,
  type StaffCard,
  type SynergyType,
  type UpgradeCard,
} from '../MainStreetCards';
import { buildCardTooltipInfo, resolveDescription, type SynergyRateCard } from '../MainStreetFormatting';
import { EASY_PRESET } from '../MainStreetDifficulty';
import { formatCurrency } from '@core-engine/I18n';

// ── Canonical group orders ──────────────────────────────────

/** Canonical card-family order used by the "By Type" grouping. */
export const CARD_FAMILIES: readonly CardFamily[] = [
  'business',
  'community-space',
  'event',
  'upgrade',
  'staff',
] as const;

/** Canonical synergy-type order used by the "By Synergy" grouping. */
export const SYNERGY_TYPES: readonly SynergyType[] = [
  'Food',
  'Culture',
  'Commerce',
  'Service',
  'Entertainment',
  'Health',
] as const;

/** Group key for cards that carry no synergy types. */
export const UNSYNERGISED_GROUP_KEY = 'unsynergised';

/** Human-readable label for the unsynergised catch-all group. */
export const UNSYNERGISED_GROUP_LABEL = 'Unsynergised';

/** Sentinel rendered in the detail sheet for a field that is absent. */
export const ABSENT_FIELD = '—';

/** Heading that introduces the player-facing tooltip block in the detail sheet. */
export const TOOLTIP_SECTION_HEADING = '── Player-facing tooltip ──';

// ── Types ───────────────────────────────────────────────────

/** A single row in the card index. */
export interface CardIndexEntry {
  /** The card template (never mutated). */
  readonly card: AnyCard;
  /** Card template id (e.g. `biz-bakery`). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Card family (the "type"). */
  readonly family: CardFamily;
  /** Progression tier from the CSV, or `-` when the card has none. */
  readonly tier: string;
  /** Lowercased `"{name} {id}"` used by {@link filterCards}. */
  readonly searchText: string;
}

/** A named group of index entries. */
export interface CardGroup {
  /** Stable group key (family id or synergy type or `unsynergised`). */
  readonly key: string;
  /** Human-readable group label. */
  readonly label: string;
  /** Entries belonging to this group, in index order. */
  readonly entries: readonly CardIndexEntry[];
}

// ── Index construction ──────────────────────────────────────

/** Human-readable label for a card family. */
export function cardFamilyLabel(family: CardFamily): string {
  switch (family) {
    case 'business': return 'Business';
    case 'community-space': return 'Community Space';
    case 'event': return 'Event';
    case 'upgrade': return 'Upgrade';
    case 'staff': return 'Staff';
  }
}

/**
 * Builds a `CardIndexEntry` for a template, normalising the dropped
 * discriminated-union `family` field (Main Street template getters return
 * `Omit<...>' family ...>` objects without it at runtime) and capturing
 * the tier from the CSV-derived `CARD_TIER_MAP` (keyed by the base
 * template id).
 */
function toEntry(card: AnyCard, family: CardFamily): CardIndexEntry {
  const tier = CARD_TIER_MAP.get(getBaseTypeId(card.id));
  return {
    // Normalise the card so downstream consumers (tooltip/detail) can
    // switch on `family` reliably.
    card: { ...card, family } as AnyCard,
    id: card.id,
    name: card.name,
    family,
    tier: tier === undefined || tier === '' ? '-' : tier,
    searchText: `${card.name} ${card.id}`.toLowerCase(),
  };
}

/**
 * Flattens the five Main Street template pools into a single index.
 *
 * Each template appears exactly once; order follows the canonical family
 * order ({@link CARD_FAMILIES}) and the CSV order within each family.
 *
 * @returns The complete card index.
 */
export function buildCardIndex(): CardIndexEntry[] {
  const entries: CardIndexEntry[] = [];

  for (const t of getBusinessTemplates()) {
    entries.push(toEntry(t as AnyCard, 'business'));
  }
  for (const t of getCommunitySpaceTemplates()) {
    entries.push(toEntry(t as AnyCard, 'community-space'));
  }
  for (const t of getEventTemplates()) entries.push(toEntry(t, 'event'));
  for (const t of getUpgradeTemplates()) entries.push(toEntry(t, 'upgrade'));
  for (const t of getStaffCardTemplates()) entries.push(toEntry(t, 'staff'));

  return entries;
}

// ── Filtering ───────────────────────────────────────────────

/**
 * Filters index entries by a case-insensitive substring match against the
 * card name and id.
 *
 * A blank (or whitespace-only) query is inert and returns the input
 * entries unchanged.
 *
 * @param entries  The entries to filter.
 * @param query    The raw user query.
 * @returns The matching entries, in original order.
 */
export function filterCards(
  entries: readonly CardIndexEntry[],
  query: string,
): CardIndexEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...entries];
  return entries.filter((e) => e.searchText.includes(needle));
}

// ── Grouping ────────────────────────────────────────────────

/**
 * Groups entries by card family ("By Type" view).
 *
 * Always returns one group per entry in {@link CARD_FAMILIES}, including
 * empty groups, so the view shape is stable as the filter changes.
 */
export function groupByFamily(entries: readonly CardIndexEntry[]): CardGroup[] {
  return CARD_FAMILIES.map((family) => ({
    key: family,
    label: cardFamilyLabel(family),
    entries: entries.filter((e) => e.family === family),
  }));
}

/** Returns the synergy types declared by a card (empty for non-synergy families). */
export function cardSynergyTypes(card: AnyCard): readonly SynergyType[] {
  if (card.family === 'business' || card.family === 'community-space') {
    return card.synergyTypes ?? [];
  }
  return [];
}

/**
 * Groups entries by synergy type ("By Synergy" view).
 *
 * A card with multiple synergy types appears in each matching group — group
 * membership therefore sums to more than the index size. Cards with no
 * synergy types appear only in the {@link UNSYNERGISED_GROUP_KEY} catch-all.
 *
 * Always returns one group per entry in {@link SYNERGY_TYPES} plus the
 * catch-all, including empty groups.
 */
export function groupBySynergy(entries: readonly CardIndexEntry[]): CardGroup[] {
  const groups: CardGroup[] = SYNERGY_TYPES.map((synergy) => ({
    key: synergy,
    label: synergy,
    entries: entries.filter((e) => cardSynergyTypes(e.card).includes(synergy)),
  }));

  groups.push({
    key: UNSYNERGISED_GROUP_KEY,
    label: UNSYNERGISED_GROUP_LABEL,
    entries: entries.filter((e) => cardSynergyTypes(e.card).length === 0),
  });

  return groups;
}

// ── Tooltip ─────────────────────────────────────────────────

/**
 * Builds the player-facing tooltip text for an index entry using the same
 * Main Street formatter the game itself uses (resolved against the Easy
 * difficulty preset so synergy percentages are representative).
 *
 * @param entry  The index entry; the normalised card already carries the
 *               family discriminator dropped from raw templates.
 */
export function buildCardTooltip(entry: CardIndexEntry): string {
  return buildCardTooltipInfo(entry.card, EASY_PRESET);
}

// ── Detail sheet ────────────────────────────────────────────

/** Formats a value, substituting {@link ABSENT_FIELD} for null/undefined. */
function orAbsent(value: unknown): string {
  if (value === undefined || value === null || value === '') return ABSENT_FIELD;
  return String(value);
}

/**
 * Formats `value` with an explicit sign (+/-) so deltas read unambiguously.
 */
function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** Appends a `Label: value` line to `lines`. */
function field(lines: string[], label: string, value: unknown): void {
  lines.push(`${label}: ${orAbsent(value)}`);
}

/**
 * Builds the complete raw-data sheet for a card template.
 *
 * The sheet lists **every** field of the template for the card's family,
 * rendering absent optional fields as {@link ABSENT_FIELD} so the data shape
 * is explicit. It always ends with the player-facing tooltip block
 * (heading {@link TOOLTIP_SECTION_HEADING}), making the sheet a strict
 * superset of what the player sees in-game.
 *
 * @param entry  The index entry — provides the normalised card (with the
 *               family discriminator) and the tier.
 * @returns The detail sheet as an array of display lines.
 */
export function formatCardDetailLines(entry: CardIndexEntry): string[] {
  const card = entry.card;
  const tier = entry.tier;
  const lines: string[] = [];

  // ── Identity (all families) ──
  field(lines, 'Family', card.family);
  field(lines, 'ID', card.id);
  field(lines, 'Name', card.name);
  field(lines, 'Tier', tier === '-' ? ABSENT_FIELD : tier);
  field(lines, 'Cost', formatCurrency('cost' in card ? card.cost : 0));

  switch (card.family) {
    case 'business':
    case 'community-space': {
      const c = card;
      const incomeBonus = c.incomeBonus ?? 0;
      const reputationBonus = c.reputationBonus ?? 0;
      const totalRep = (c.reputationPerTurn ?? 0) + reputationBonus;
      const ongoing = c.ongoingCost ?? 0;

      field(lines, 'Base income', `+${c.baseIncome}/turn`);
      field(lines, 'Income', `+${c.baseIncome + incomeBonus}/turn`);
      lines.push(
        `Ongoing cost: ${ongoing > 0 ? `-${ongoing}/turn` : ABSENT_FIELD}`,
      );
      lines.push(
        `Reputation: ${totalRep > 0 ? `+${totalRep}/turn` : ABSENT_FIELD}`,
      );
      field(lines, 'Synergy types', (c.synergyTypes ?? []).join('/'));
      field(lines, 'Synergy coin bonus', orAbsent(c.synergyCoinBonus));
      field(lines, 'Synergy rep bonus', orAbsent(c.synergyRepBonus));
      field(lines, 'Upgrade path', orAbsent(c.upgradePath));
      field(lines, 'Max level', c.maxLevel);
      // Runtime/instance fields: absent on a fresh template.
      field(lines, 'Level (runtime)', orAbsent(c.level));
      field(lines, 'Current income (runtime)', orAbsent(c.currentIncome));
      field(
        lines,
        'Current reputation/turn (runtime)',
        orAbsent(c.currentReputationPerTurn),
      );
      field(lines, 'Display name (runtime)', orAbsent(c.displayName));
      field(
        lines,
        'Applied upgrades (runtime)',
        c.appliedUpgrades === undefined || c.appliedUpgrades.length === 0
          ? ABSENT_FIELD
          : c.appliedUpgrades.join(', '),
      );
      field(
        lines,
        'Total upgrade cost (runtime)',
        'totalUpgradeCost' in c ? orAbsent(c.totalUpgradeCost) : ABSENT_FIELD,
      );
      appendDescription(lines, c.description, c);
      break;
    }

    case 'event': {
      const e = card;
      field(lines, 'Trigger', e.trigger);
      field(lines, 'Effect', e.effect);
      field(lines, 'Target', e.target);
      field(lines, 'Target synergy', orAbsent(e.targetSynergy));
      field(lines, 'Coin delta', signed(e.coinDelta ?? 0));
      field(lines, 'Reputation delta', signed(e.reputationDelta ?? 0));
      const hasWeekWindow =
        e.availableWeekStart !== undefined && e.availableWeekEnd !== undefined;
      field(
        lines,
        'Available weeks',
        hasWeekWindow ? `${e.availableWeekStart}–${e.availableWeekEnd}` : ABSENT_FIELD,
      );

      const durationEvent = isDurationEventCard(card) ? card : null;
      field(lines, 'Has choices', orAbsent((e as EventCard).hasChoices));
      field(lines, 'Accept next card', orAbsent((e as EventCard).acceptNextCardId));
      field(lines, 'Reject next card', orAbsent((e as EventCard).rejectNextCardId));
      field(lines, 'Duration', orAbsent(durationEvent?.duration));
      field(lines, 'Effect type', orAbsent(durationEvent?.effectType));
      field(lines, 'Multiplier', orAbsent(durationEvent?.multiplier));
      break;
    }

    case 'upgrade': {
      const u = card as UpgradeCard;
      field(lines, 'Target business', u.targetBusiness);
      field(lines, 'Income bonus', signed(u.incomeBonus ?? 0));
      field(lines, 'Synergy range bonus', signed(u.synergyRangeBonus ?? 0));
      field(lines, 'Reputation bonus', orAbsent(u.reputationBonus));
      field(lines, 'Required level', orAbsent(u.requiredLevel));
      field(lines, 'New display name', orAbsent(u.newDisplayName));
      field(lines, 'Description', u.description);
      break;
    }

    case 'staff': {
      const s = card as StaffCard;
      field(lines, 'Hand slots', `+${s.handSlotsAdded}`);
      lines.push(
        `Ongoing cost: ${(s.ongoingCost ?? 0) > 0 ? `-${s.ongoingCost}/turn` : ABSENT_FIELD}`,
      );
      field(lines, 'Reputation/turn', orAbsent(s.reputationPerTurn));
      field(lines, 'Refresh cost discount', orAbsent(s.refreshCostDiscount));
      field(lines, 'Actions/turn', orAbsent(s.actionsPerTurn));
      field(lines, 'Peek once per turn', orAbsent(s.peekOncePerTurn));
      field(
        lines,
        'Specialization skills',
        s.specializationSkillIds === undefined || s.specializationSkillIds.length === 0
          ? ABSENT_FIELD
          : s.specializationSkillIds.join(', '),
      );
      field(lines, 'Employed at slot (runtime)', orAbsent(s.employedAtSlot));
      field(lines, 'Description', s.description);
      break;
    }
  }

  // ── Player-facing view (superset requirement) ──
  const tooltip = buildCardTooltip(entry);
  if (tooltip !== '') {
    lines.push('', TOOLTIP_SECTION_HEADING, tooltip);
  }

  return lines;
}

/**
 * Appends the raw template description, plus a resolved variant when the
 * template carries the `{SYNERGY_RATE}` token.
 *
 * The raw template is shown verbatim (it is data), while the resolved form
 * matches what the player actually reads in-game.
 */
function appendDescription(
  lines: string[],
  description: string,
  card: SynergyRateCard,
): void {
  if (!description) {
    field(lines, 'Description', undefined);
    return;
  }
  field(lines, 'Description', description);

  const resolved = resolveDescription(description, card, EASY_PRESET);
  if (resolved !== description) {
    field(lines, 'Description (resolved)', resolved);
  }
}
