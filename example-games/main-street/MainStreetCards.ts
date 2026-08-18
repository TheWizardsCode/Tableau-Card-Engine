/**
 * Main Street: Card Type Definitions and Fixture Data
 *
 * Defines the five card families (Business, Community Space, Event, Upgrade,
 * Staff), synergy types, game constants, and the full card pool for
 * Milestones 1–3.
 *
 * Card template data is loaded from a single CSV file (`card-data.csv`)
 * at module load time. The CSV is bundled at build time via Vite's `?raw`
 * import suffix. Only the fixture data is externalised — type definitions,
 * constants, and helper functions remain in this module.
 *
 * @module
 */

// ── CSV import & parsing ────────────────────────────────────

import cardDataRaw from './card-data.csv?raw';
import { parseCsv } from '@core-engine/CsvLoader';
import { computeCsvChecksum } from './CsvChecksum';

/**
 * The raw text content of card-data.csv, bundled at build time via Vite's `?raw` import.
 * Exported so that save-game serializers can embed the CSV data in checkpoints.
 */
export const CARD_DATA_RAW: string = cardDataRaw;

/** Mutable CSV rows container, initialized from the module-level import.
 * Can be replaced at runtime by loadTemplatesFromCsv() when a saved
 * checkpoint carries different card-data.csv content.
 */
let _csvRows: Record<string, string>[] = parseCsv(cardDataRaw);

/**
 * Deterministic checksum of the current card-data.csv content.
 * Computed once at module load time from the Vite-imported raw CSV.
 * Used to detect when the CSV has changed between saves/loads.
 */
export const CSV_CHECKSUM: string = computeCsvChecksum(cardDataRaw);

/**
 * The currently active parsed CSV rows.
 * Initially loaded from the bundled card-data.csv at module load time.
 * When a saved checkpoint carries different CSV data (mismatched checksum),
 * loadTemplatesFromCsv() replaces this with the saved CSV's rows.
 *
 * This is a mutable reference so consumers (SVG regeneration, card lookups)
 * always use the currently active card data without needing per-call arguments.
 */
/**
 * Returns the currently active parsed CSV rows.
 * Initially loaded from the bundled card-data.csv at module load time.
 * When a saved checkpoint carries different CSV data (mismatched checksum),
 * loadTemplatesFromCsv() replaces this with the saved CSV's rows.
 *
 * This is a getter so consumers (SVG regeneration, card lookups)
 * always use the currently active card data without needing per-call arguments.
 */
export function getCsvRows(): readonly Record<string, string>[] {
  return _csvRows;
}

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
      reputationPerTurn: r.reputationPerTurn ? Number(r.reputationPerTurn) : undefined,
      refreshCostDiscount: r.refreshCostDiscount ? Number(r.refreshCostDiscount) : undefined,
      actionsPerTurn: r.actionsPerTurn ? Number(r.actionsPerTurn) : undefined,
    });
  }
}

// ── Synergy & Phase Enums ───────────────────────────────────

/** Synergy types used by Business cards for adjacency bonuses. */
export type SynergyType = 'Food' | 'Culture' | 'Commerce' | 'Service' | 'Entertainment' | 'Health';

/** When an Event card resolves. */
export type EventTrigger = 'Investment' | 'Incident';

/** Scope of an Event card's effect. */
export type EventTarget = 'All' | 'SpecificSynergy' | 'RandomBusiness';

/** Discriminator for the card families (business, event, upgrade, community-space, staff). */
export type CardFamily = 'business' | 'event' | 'upgrade' | 'community-space' | 'staff';

// ── Card Interfaces ─────────────────────────────────────────

/**
 * A Business card placed on the street grid.
 * Generates base income + synergy bonuses each turn.
 */
export interface BusinessCard {
  readonly family: 'business';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly baseIncome: number;
  readonly synergyTypes: readonly SynergyType[];
  readonly upgradePath?: string;
  readonly maxLevel: number;
  readonly description: string;
  /** Current upgrade level (starts at 0, incremented by upgrades). */
  level: number;
  /** Cumulative income bonus from applied upgrades. */
  incomeBonus: number;
  /** Cumulative synergy range extension from applied upgrades. */
  synergyRangeBonus: number;
  /**
   * Cumulative reputation bonus from applied upgrades.
   * Initialized to 0 for all cards.
   */
  reputationBonus: number;
  /**
   * Base reputation generated per turn by this business (without upgrades).
   * Fractional values are supported (e.g. 0.2 for the Clinic).
   */
  reputationPerTurn?: number;
  /**
   * Coin synergy contribution per matching neighbor, as a fraction of the
   * neighbor's base income. Defaults to 0.5 (50% of base income per matching
   * adjacency) when undefined. Set to 0 to exclude this card from
   * contributing synergy to neighbors.
   */
  readonly synergyCoinBonus?: number;
  /**
   * Reputation synergy contribution per matching neighbor.
   * Defaults to 0 (no reputation from adjacency synergy) when undefined.
   */
  readonly synergyRepBonus?: number;
  /**
   * IDs of upgrade cards that have been applied to this business instance,
   * in application order. Used to enforce multi-level chain requirements and
   * to prevent the same branch being applied twice.
   *
   * Omitting this field is treated as an empty array.
   */
  appliedUpgrades?: string[];
  /**
   * Cumulative cost of all upgrade cards applied to this business instance.
   * Used for sell value calculation. Defaults to 0 for cards without upgrades.
   */
  totalUpgradeCost?: number;

  /**
   * Current effective income per turn (base + upgrade bonus + synergy + same-type penalty).
   * Updated incrementally when neighbors are placed/sold, so the income phase
   * reads this cached value instead of recalculating from scratch every turn.
   * Undefined until the card is placed on the grid and recalculateCard is called.
   */
  currentIncome?: number;

  /**
   * Current effective reputation per turn (base repPerTurn + upgrade repBonus + synergy rep).
   * Updated incrementally when neighbors are placed/sold.
   * Undefined until the card is placed on the grid and recalculateCard is called.
   */
  currentReputationPerTurn?: number;
}

/**
 * An Event card that triggers a one-off effect.
 * Investment events are purchased and held until played; Incident events are drawn automatically.
 */
export interface EventCard {
  readonly family: 'event';
  readonly id: string;
  readonly name: string;
  readonly trigger: EventTrigger;
  readonly cost: number;
  readonly effect: string;
  readonly target: EventTarget;
  readonly targetSynergy?: SynergyType;
  readonly coinDelta: number;
  readonly reputationDelta: number;
}

/**
 * A Duration-based Event card that creates an ActiveEffect rather than
 * applying a one-shot coin/reputation delta.
 *
 * Extends EventCard with fields needed for duration-based modifiers:
 * - `duration`: number of turns the effect lasts
 * - `effectType`: discriminator for which aspect of the game is modified
 *   (e.g. 'income-multiplier', 'rep-multiplier')
 * - `multiplier`: the scalar value applied each turn (e.g. 0.8 for 80% income)
 */
export interface DurationEventCard extends EventCard {
  readonly duration: number;
  readonly effectType: string;
  readonly multiplier: number;
}

/**
 * Type guard: returns true if the given card is a DurationEventCard.
 *
 * Checks for the presence of the `duration` field (an optional field not
 * present on regular EventCard instances).
 *
 * @param card  Any card object to check.
 * @returns true if the card has DurationEventCard-specific fields.
 */
export function isDurationEventCard(card: unknown): card is DurationEventCard {
  if (card === null || card === undefined) return false;
  if (typeof card !== 'object') return false;
  const maybe = card as Record<string, unknown>;
  return (
    maybe.family === 'event' &&
    typeof maybe.duration === 'number'
  );
}

/**
 * An Upgrade card that enhances a specific Business card.
 *
 * Branching upgrades: multiple `UpgradeCard` entries may share the same
 * `targetBusiness` and `requiredLevel`, giving the player a choice of which
 * upgrade branch to take.
 *
 * Multi-level chains: set `requiredLevel > 0` so the card can only be applied
 * after the business has already been upgraded that many times.
 */
export interface UpgradeCard {
  readonly family: 'upgrade';
  readonly id: string;
  readonly name: string;
  readonly targetBusiness: string;
  readonly cost: number;
  readonly incomeBonus: number;
  readonly synergyRangeBonus: number;
  readonly description: string;
  /**
   * Minimum business level required before this upgrade may be applied.
   * 0 (default) = can be applied to the base (un-upgraded) business.
   * 1 = can only be applied after the business has been upgraded once, etc.
   *
   * Omitting this field is equivalent to setting it to 0.
   */
  readonly requiredLevel?: number;
  /**
   * Additional reputation generated per turn when this upgrade is applied.
   * Works like incomeBonus but for reputation instead of coins.
   * Fractional values are supported (e.g. 0.1 for the Medical Center upgrade).
   */
  readonly reputationBonus?: number;
}

/**
 * A Staff card that increases hand capacity.
 * Staff cards are a new card family distinct from business/event/upgrade.
 * They do NOT occupy hand slots and have an ongoing per-turn coin cost.
 */
export interface StaffCard {
  readonly family: 'staff';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly ongoingCost: number;
  readonly handSlotsAdded: number;
  readonly description: string;
  /**
   * Optional reputation granted per turn during the income phase
   * (e.g. the Socialite's +0.1 rep/turn ability — Group F,
   * CG-0MSQJ7VL9009JHF4).
   */
  readonly reputationPerTurn?: number;
  /**
   * Optional flat coin discount applied to each investment-row refresh
   * (e.g. the Accountant's "refresh costs 1 less" ability — Group F,
   * CG-0MSQJ7VL9009JHF4).
   */
  readonly refreshCostDiscount?: number;
  /**
   * Optional additional actions granted per turn.
   * (e.g. the General Manager's +1 action per day — CG-0MSTOF1N5005PK2R).
   */
  readonly actionsPerTurn?: number;
}

/** Union of all card types in Main Street. */
export type AnyCard = BusinessCard | CommunitySpaceCard | EventCard | DurationEventCard | UpgradeCard | StaffCard;

// ── Incident Balance (CG-0MSL0OP040043KKZ) ─────────────────

/**
 * Polarity of an Incident card's net effect (`coinDelta + reputationDelta`).
 * Used by the constrained incident-draw system to bound luck streaks.
 */
export type IncidentPolarity = 'good' | 'bad' | 'neutral';

/** A run of consecutive same-polarity drawn incidents (good/bad only; neutral breaks runs). */
export interface IncidentPolarityRun {
  polarity: 'good' | 'bad';
  length: number;
}

/**
 * Runtime-mutable state governing constrained Incident draws.
 *
 * The incident queue is a visible FIFO of upcoming events. To keep the
 * sequence of incidents the player actually resolves fair, draws are
 * constrained by two limits:
 *
 * - `repeatSpacing` (N): a card name cannot reappear within the last
 *   `N - 1` drawn cards (e.g. N=3 blocks a card drawn at position 1 from
 *   reappearing at positions 2 or 3).
 * - `maxStreak` (M): never more than M consecutive same-polarity cards
 *   (good = net > 0, bad = net < 0). Neutral cards (net == 0) break runs.
 *
 * Both limits are mutable at runtime via `setIncidentBalanceLimits` in
 * `MainStreetState.ts`; changes affect subsequent draws only.
 */
export interface IncidentBalanceState {
  /** Repeat-spacing window N (>= 1, default 3). */
  repeatSpacing: number;
  /** Max consecutive same-polarity (good/bad) cards M (>= 1, default 2). */
  maxStreak: number;
  /**
   * Names of recently drawn incidents, most recent first, bounded to
   * `MAX_TRACKED_INCIDENT_HISTORY` entries. The selector uses only the
   * most recent `repeatSpacing - 1` names for the repeat window, so
   * increasing N at runtime works up to the stored history depth.
   */
  recentNames: string[];
  /**
   * Current same-polarity run among recently drawn incidents.
   * `null` when the last drawn card was neutral or nothing has been drawn.
   */
  polarityRun: IncidentPolarityRun | null;
}

/** Default repeat-spacing window for constrained incident draws. */
export const DEFAULT_INCIDENT_REPEAT_SPACING = 3;

/** Default max consecutive same-polarity (good/bad) incidents. */
export const DEFAULT_INCIDENT_MAX_STREAK = 2;

/**
 * Cap on tracked recent incident names. The selector consumes only the most
 * recent `repeatSpacing - 1` entries, so runtime increases of N work up to
 * this depth; beyond it the constraint degrades gracefully (uses all history).
 */
export const MAX_TRACKED_INCIDENT_HISTORY = 10;

/**
 * Returns the polarity of an Incident card's net effect
 * (`coinDelta + reputationDelta`): > 0 good, < 0 bad, == 0 neutral.
 */
export function incidentPolarity(card: EventCard): IncidentPolarity {
  const net = card.coinDelta + card.reputationDelta;
  if (net > 0) return 'good';
  if (net < 0) return 'bad';
  return 'neutral';
}

/**
 * Identity key for the repeat-spacing rule: the named template
 * (e.g. 'Tax Audit'), not the copy id — the event deck holds multiple
 * copies per template with distinct serial-suffixed ids but equal names.
 */
export function incidentTemplateName(card: EventCard): string {
  return card.name;
}

/**
 * Creates a fresh incident-balance state with default limits
 * (N = `DEFAULT_INCIDENT_REPEAT_SPACING`, M = `DEFAULT_INCIDENT_MAX_STREAK`)
 * and empty draw history.
 */
export function createIncidentBalanceState(
  overrides?: Partial<Pick<IncidentBalanceState, 'repeatSpacing' | 'maxStreak'>>,
): IncidentBalanceState {
  return {
    repeatSpacing: overrides?.repeatSpacing ?? DEFAULT_INCIDENT_REPEAT_SPACING,
    maxStreak: overrides?.maxStreak ?? DEFAULT_INCIDENT_MAX_STREAK,
    recentNames: [],
    polarityRun: null,
  };
}

/**
 * Records a drawn Incident card into the balance state: appends its template
 * name to the recent history and extends/breaks the polarity run.
 *
 * Must be called for every constrained draw (setup, refill, reshuffle paths)
 * so the history mirrors the actual sequence the player resolves. Neutral
 * cards (net == 0) break streaks: the run resets to null.
 *
 * @param balance  Balance state to update (mutated in place).
 * @param card     The Incident card that was drawn.
 */
export function recordIncidentDraw(balance: IncidentBalanceState, card: EventCard): void {
  const name = incidentTemplateName(card);
  balance.recentNames.unshift(name);
  if (balance.recentNames.length > MAX_TRACKED_INCIDENT_HISTORY) {
    balance.recentNames.pop();
  }

  const p = incidentPolarity(card);
  if (p === 'neutral') {
    // Neutral cards break streaks: a neutral ends a good/bad run and the
    // next card can be anything.
    balance.polarityRun = null;
  } else if (balance.polarityRun && balance.polarityRun.polarity === p) {
    balance.polarityRun.length += 1;
  } else {
    balance.polarityRun = { polarity: p, length: 1 };
  }
}

/**
 * Creates an incident-balance state whose history is backfilled from an
 * existing incident queue (in draw order). Used when restoring legacy saves
 * that predate the balance state and when building tutorial scenarios that
 * place scenario-defined incidents directly into the queue.
 */
export function createIncidentBalanceFromQueue(queue: EventCard[]): IncidentBalanceState {
  const balance = createIncidentBalanceState();
  for (const card of queue) {
    recordIncidentDraw(balance, card);
  }
  return balance;
}

/**
 * Selects the next Incident card to draw from `deck`, honoring the
 * repeat-spacing and streak constraints encoded in `balance`.
 *
 * Returns the array index of the chosen card, or -1 when the deck holds no
 * Incident-trigger cards at all.
 *
 * Selection is deterministic: candidates are scanned in deck order (which is
 * itself deterministic under the game's seeded RNG shuffle) and the first
 * match at each constraint tier wins. No RNG is consumed here, preserving the
 * game's seeded determinism (same seed => same deck order => same draw).
 *
 * Constraint relaxation (documented, deterministic, never deadlocks):
 * 1. Strict: name not in the repeat window AND streak-legal. When the run is
 *    at/over M, streak-legal requires the opposite polarity (a neutral does
 *    NOT satisfy it — after two goods the third must be bad).
 * 2. Relax repeat only: streak-legal regardless of the repeat window.
 * 3. Relax streak to the invariant only (never > M same polarity in a row):
 *    name not in the repeat window AND not extending the run past M (a
 *    neutral is allowed here — it breaks the streak).
 * 4. Relax both to the invariant only.
 * 5. Final fallback: prefer an Incident card outside the repeat window (least
 *    violation), else the first Incident card in deck order. Guaranteed to
 *    exist, so a constrained draw can never hang or crash.
 */
export function findConstrainedIncidentIndex(
  deck: EventCard[],
  balance: Pick<
    IncidentBalanceState,
    'repeatSpacing' | 'maxStreak' | 'recentNames' | 'polarityRun'
  >,
): number {
  const incidentIndices: number[] = [];
  for (let i = 0; i < deck.length; i++) {
    if (deck[i].trigger === 'Incident') incidentIndices.push(i);
  }
  if (incidentIndices.length === 0) return -1;

  const windowSize = Math.max(0, balance.repeatSpacing - 1);
  const windowNames = new Set(balance.recentNames.slice(0, windowSize));
  const run = balance.polarityRun;
  const m = balance.maxStreak;

  const inWindow = (i: number): boolean => windowNames.has(incidentTemplateName(deck[i]));
  const polarity = (i: number): IncidentPolarity => incidentPolarity(deck[i]);

  // Strict streak rule: when the run is at/over M, the next card must be the
  // opposite polarity (neutral does not satisfy — AC2: after two consecutive
  // goods the third must be bad, not good, not neutral).
  const streakStrict = (i: number): boolean => {
    if (!run || run.length < m) return true;
    const p = polarity(i);
    return p !== 'neutral' && p !== run.polarity;
  };

  // Invariant-only streak rule: never extend the run past M. Opposite polarity
  // or a neutral (which breaks the run) both satisfy this.
  const streakInvariant = (i: number): boolean => {
    if (!run || run.length < m) return true;
    return polarity(i) !== run.polarity;
  };

  for (const i of incidentIndices) {
    if (!inWindow(i) && streakStrict(i)) return i;
  }
  for (const i of incidentIndices) {
    if (streakStrict(i)) return i;
  }
  for (const i of incidentIndices) {
    if (!inWindow(i) && streakInvariant(i)) return i;
  }
  for (const i of incidentIndices) {
    if (streakInvariant(i)) return i;
  }
  // Final fallback (never deadlock): prefer a card outside the repeat window
  // (least violation) before accepting an in-window repeat.
  for (const i of incidentIndices) {
    if (!inWindow(i)) return i;
  }
  return incidentIndices[0];
}

// ── Constants ───────────────────────────────────────────────

/** Number of slots in the street grid. */
export const GRID_SIZE = 10;

/**
 * Legacy default turn cap (20). Kept for backward compatibility; default
 * difficulty presets no longer impose a turn limit (CG-0MSLXJCHH001DLIO) —
 * turn limits are opt-in via an explicit `config.maxTurns`.
 */
export const MAX_TURNS = 20;

/** Score required for a win via score threshold. */
export const WIN_THRESHOLD = 150;

/** Starting coin balance (Medium preset default). */
export const STARTING_COINS = 6;

/** Starting reputation. */
export const STARTING_REPUTATION = 3;

/**
 * Total number of cards visible in the single-row marketplace.
 * The market is one line of exactly 3 cards (CG-0MSTOATDT009BRX2 replaced
 * the legacy two-row model: 4 business slots + 3 investment slots).
 */
export const MARKET_TOTAL_SLOTS = 3;

/** Minimum number of business cards in the single-row market (community-space counts as business). */
export const MARKET_BUSINESS_MIN = 1;

/** Maximum number of business cards in the single-row market (community-space counts as business). */
export const MARKET_BUSINESS_MAX = 2;

/** Maximum number of upgrade cards in the single-row market. */
export const MARKET_UPGRADE_MAX = 1;

/** Maximum number of event cards in the single-row market. */
export const MARKET_EVENT_MAX = 1;

/** Number of Incident cards visible in the incident queue at game start. */
export const INCIDENT_QUEUE_SIZE = 2;

/**
 * Fixed coin cost to re-roll the single-row market (CG-0MSTOATDT009BRX2),
 * replacing the legacy per-row refresh costs (€2 each).
 * The Accountant's `refreshCostDiscount` (Group F) applies to this cost.
 */
export const REFRESH_MARKET_COST = 5;

/**
 * @deprecated Synergy is now percentage-based. Each BusinessCard and
 * CommunitySpaceCard has its own `synergyCoinBonus` rate (default 0.5 = 50%)
 * and `synergyRepBonus` (default 0). The difficulty preset
 * `synergyBonusPerNeighbor` value acts as a multiplier on the per-card
 * percentage rate.
 *
 * Kept for backward compatibility with existing test code.
 */
export const SYNERGY_BONUS_PER_NEIGHBOR = 1;

/** Multiplier applied to reputation in final score. */
export const REPUTATION_SCORE_MULTIPLIER = 5;

/** Points awarded per completed challenge. */
export const CHALLENGE_BONUS_POINTS = 10;

// ── Multi-Use Card Economy Ratios ───────────────────────────

/** Cost ratio when placing a card from hand to tableau (80% of purchase cost). */
export const PLACE_COST_RATIO = 0.8;

/** Value ratio when selling a card (75% of purchase value). */
export const SELL_VALUE_RATIO = 0.75;

// ── Card Fixture Data ───────────────────────────────────────

/**
 * Creates a fresh copy of a BusinessCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeBusiness(template: Omit<BusinessCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus' | 'currentIncome' | 'currentReputationPerTurn'>): BusinessCard {
  const card: BusinessCard = {
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
    ...template,
  };
  // Cached values (currentIncome, currentReputationPerTurn) are intentionally
  // left undefined until the card is placed on the grid. applyIncome falls back
  // to computing from scratch for cards with undefined cached values.
  // After placement, updateNeighborsOnPlacement calls recalculateCard which
  // sets both fields via syncCardCurrentIncome / syncCardCurrentRepPerTurn.
  return card;
}

/**
 * Creates a fresh copy of a CommunitySpaceCard from template data.
 * Mutable fields (level, incomeBonus, synergyRangeBonus, appliedUpgrades) are reset.
 */
function makeCommunitySpace(template: Omit<CommunitySpaceCard, 'family' | 'level' | 'incomeBonus' | 'synergyRangeBonus' | 'appliedUpgrades' | 'reputationBonus' | 'currentIncome' | 'currentReputationPerTurn' | 'ongoingCost'>): CommunitySpaceCard {
  const card: CommunitySpaceCard = {
    family: 'community-space',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    ongoingCost: 0,
    appliedUpgrades: [],
    ...template,
  };
  // Cached values left undefined until the card is placed on the grid.
  return card;
}

// ── Community Space Interface ───────────────────────────────

/**
 * A Community Space card placed on the street grid, parallel to BusinessCard.
 * Community spaces share the same mechanical behavior as businesses (grid placement,
 * synergy bonuses, upgrade path, level tracking) but are classified as 'community-space'
 * rather than 'business'.
 */
/**
 * Returns the base template ID for a card by stripping the serial suffix (`-\d+$`)
 * added during deck creation (e.g., `'biz-bakery-0'` → `'biz-bakery'`).
 *
 * Cards without a serial suffix are returned as-is.
 *
 * @param id  The card's `id` field (e.g. `'biz-bakery-0'` or `'cs-park-1'`).
 * @returns The base template ID (e.g. `'biz-bakery'` or `'cs-park'`).
 */
export function getBaseTypeId(id: string): string {
  return id.replace(/-\d+$/, '');
}

export interface CommunitySpaceCard {
  readonly family: 'community-space';
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly baseIncome: number;
  /**
   * Ongoing per-turn coin cost paid each IncomePhase (e.g. the Library costs
   * 0.25 coins/turn to run). Defaults to 0 for community spaces without a
   * running cost. Mirrors the StaffCard `ongoingCost` mechanic.
   */
  readonly ongoingCost: number;
  readonly synergyTypes: readonly SynergyType[];
  readonly upgradePath?: string;
  readonly maxLevel: number;
  readonly description: string;
  /** Current upgrade level (starts at 0, incremented by upgrades). */
  level: number;
  /** Cumulative income bonus from applied upgrades. */
  incomeBonus: number;
  /** Cumulative synergy range extension from applied upgrades. */
  synergyRangeBonus: number;
  /**
   * Cumulative reputation bonus from applied upgrades.
   * Initialized to 0 for all cards.
   */
  reputationBonus: number;
  /**
   * Base reputation generated per turn by this community space (without upgrades).
   * Fractional values are supported (e.g. 0.2).
   */
  reputationPerTurn?: number;
  /**
   * Coin synergy contribution per matching neighbor, as a fraction of the
   * neighbor's base income. Defaults to 0.5 (50% of base income per matching
   * adjacency) when undefined. Set to 0 to exclude this card from
   * contributing synergy to neighbors.
   */
  readonly synergyCoinBonus?: number;
  /**
   * Reputation synergy contribution per matching neighbor.
   * Defaults to 0 (no reputation from adjacency synergy) when undefined.
   */
  readonly synergyRepBonus?: number;
  /**
   * IDs of upgrade cards that have been applied to this community space instance,
   * in application order.
   *
   * Omitting this field is treated as an empty array.
   */
  appliedUpgrades?: string[];

  /**
   * Current effective income per turn (base + upgrade bonus + synergy + same-type penalty).
   * Updated incrementally when neighbors are placed/sold.
   * Undefined until the card is placed on the grid and recalculateCard is called.
   */
  currentIncome?: number;

  /**
   * Current effective reputation per turn (base repPerTurn + upgrade repBonus + synergy rep).
   * Updated incrementally when neighbors are placed/sold.
   * Undefined until the card is placed on the grid and recalculateCard is called.
   */
  currentReputationPerTurn?: number;
}

// ── CSV → typed template arrays ─────────────────────────────

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

/**
 * Returns the currently active Business card template arrays.
 */
export function getBusinessTemplates(): typeof _BUSINESS_TEMPLATES {
  return _BUSINESS_TEMPLATES;
}

/**
 * Returns the currently active Community Space card template arrays.
 */
export function getCommunitySpaceTemplates(): typeof _COMMUNITY_SPACE_TEMPLATES {
  return _COMMUNITY_SPACE_TEMPLATES;
}

/**
 * Returns the currently active Event card template arrays.
 */
export function getEventTemplates(): EventCard[] {
  return _EVENT_TEMPLATES;
}

/**
 * Returns the currently active Upgrade card template arrays.
 */
export function getUpgradeTemplates(): UpgradeCard[] {
  return _UPGRADE_TEMPLATES;
}

/**
 * Returns the currently active Staff card templates.
 */
export function getStaffCardTemplates(): StaffCard[] {
  return _STAFF_CARD_TEMPLATES;
}

// Initialize all template arrays from the bundled CSV
rebuildTemplateArrays(_csvRows);

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

// ── Deck Building ───────────────────────────────────────────

/**
 * Creates the full Staff deck for a game.
 *
 * @param copies  Number of copies per template (default 1).
 * @returns Array of StaffCard instances.
 */
export function createStaffDeck(copies: number = 1): StaffCard[] {
  const deck: StaffCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of _STAFF_CARD_TEMPLATES) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

/**
 * Creates the full Business deck for a game (each template repeated
 * `copies` times to ensure adequate supply — sized for ~20 turns of play;
 * default presets impose no turn limit, CG-0MSLXJCHH001DLIO, and the market
 * cycles unpurchased cards back into the deck, so supply is effectively
 * unbounded).
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createBusinessDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): BusinessCard[] {
  const templates = unlockedCardIds
    ? _BUSINESS_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : _BUSINESS_TEMPLATES;

  const deck: BusinessCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push(makeBusiness({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}

/**
 * Creates the full Community Space deck for a game (each template repeated
 * `copies` times). Community space cards are mixed into the development market
 * row alongside business cards.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createCommunitySpaceDeck(
  copies: number = 3,
  unlockedCardIds?: string[],
): CommunitySpaceCard[] {
  const templates = unlockedCardIds
    ? _COMMUNITY_SPACE_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : _COMMUNITY_SPACE_TEMPLATES;

  const deck: CommunitySpaceCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push(makeCommunitySpace({ ...template, id: `${template.id}-${c}` }));
    }
  }
  return deck;
}

/**
 * Creates the full Event deck for a game.
 *
 * Supports an optional `positiveIncidentMultiplier` to increase the
 * relative frequency of positive Incident events by duplicating positive
 * Incident templates before deck assembly. This keeps selection deterministic
 * under the seeded RNG used throughout Main Street while allowing tuning
 * without changing core selection logic.
 *
 * @param copies          Number of copies per template (default 3).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 * @param positiveIncidentMultiplier Multiplier applied to positive Incident templates (>=1).
 * @param rng             Seeded random function used for deterministic fractional distribution.
 */
export function createEventDeck(
  copies: number = 3,
  unlockedCardIds: string[] | undefined,
  rng: () => number,
  positiveIncidentMultiplier: number = 1,
): EventCard[] {
  const templates = unlockedCardIds
    ? _EVENT_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : _EVENT_TEMPLATES;

  // If multiplier > 1, positive Incident templates should appear more often.
  // Implement fractional multipliers deterministically without introducing
  // a seeded RNG dependency: we give every positive Incident template
  // `baseDup = floor(multiplier)` repeats, then distribute the fractional
  // remainder by granting one extra repeat to `extraCount` templates. The
  // selection is deterministic (first N positive templates in template
  // order) so behavior is stable across runs.
  const deck: EventCard[] = [];
  let serial = 0;

  const mult = Math.max(1, positiveIncidentMultiplier);
  const baseDup = Math.floor(mult);
  const fraction = mult - baseDup;

  // Identify positions (indices) of positive Incident templates in the
  // `templates` array so we can select which ones receive the fractional
  // extra duplicates.
  const positiveIndices: number[] = [];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (t.trigger === 'Incident' && (t.coinDelta + t.reputationDelta) > 0) {
      positiveIndices.push(i);
    }
  }

  const positiveCount = positiveIndices.length;
  const extraCount = Math.round(fraction * positiveCount);

  // Decide which positive template indices receive the extra +1 duplicate.
  // Always use the provided seeded RNG to shuffle and choose extraCount
  // indices. This makes the fractional distribution deterministic per-game
  // seed and removes order bias.
  const extraSet = new Set<number>();
  if (extraCount > 0 && positiveCount > 0) {
    // Shuffle a copy of positiveIndices using Fisher-Yates with provided RNG
    const idxs = positiveIndices.slice();
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idxs[i]; idxs[i] = idxs[j]; idxs[j] = tmp;
    }
    for (let k = 0; k < extraCount; k++) extraSet.add(idxs[k]);
  }

  // Iterate templates and assign duplicates. For positive templates, add
  // `baseDup` plus 1 if the template's index is in extraSet. For all others, use 1.
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const net = template.coinDelta + template.reputationDelta;
    const isPositiveIncident = template.trigger === 'Incident' && net > 0;
    let dupCount = 1;
    if (isPositiveIncident) {
      dupCount = baseDup + (extraSet.has(i) ? 1 : 0);
    }

    const repeat = copies * dupCount;
    for (let r = 0; r < repeat; r++) {
      deck.push({ ...template, id: `${template.id}-${serial}` });
      serial += 1;
    }
  }

  return deck;
}

/**
 * Creates the full Upgrade deck for a game.
 *
 * @param copies          Number of copies per template (default 2).
 * @param unlockedCardIds Optional list of unlocked card IDs for tier filtering.
 *                        When provided, only templates whose ID is in this list
 *                        are included. When omitted, the full pool is used.
 */
export function createUpgradeDeck(
  copies: number = 2,
  unlockedCardIds?: string[],
): UpgradeCard[] {
  const templates = unlockedCardIds
    ? _UPGRADE_TEMPLATES.filter((t) => unlockedCardIds.includes(t.id))
    : _UPGRADE_TEMPLATES;

  const deck: UpgradeCard[] = [];
  for (let c = 0; c < copies; c++) {
    for (const template of templates) {
      deck.push({ ...template, id: `${template.id}-${c}` });
    }
  }
  return deck;
}

/**
 * Returns the synergy-type color used for placeholder card rendering.
 */
export function synergyColor(type: SynergyType): number {
  switch (type) {
    case 'Food':          return 0xE67E22; // Orange
    case 'Culture':       return 0x3498DB; // Blue
    case 'Commerce':      return 0x27AE60; // Green
    case 'Service':       return 0x9B59B6; // Purple
    case 'Entertainment': return 0xE74C3C; // Red
    case 'Health':        return 0x1ABC9C; // Teal/Cyan
  }
}

/**
 * Returns a short label for a card (used in UI rendering).
 */
export function cardLabel(card: AnyCard): string {
  switch (card.family) {
    case 'business':        return `${card.name} (€${card.cost})`;
    case 'community-space': return `${card.name} (€${card.cost})`;
    case 'event':           return card.cost > 0 ? `${card.name} (€${card.cost})` : card.name;
    case 'upgrade':         return `${card.name} (€${card.cost})`;
    case 'staff':           return `${card.name} (€${card.cost})`;
  }
}



// ---------------------------------------------------------------------------
// Card template ID → display-name lookup
// ---------------------------------------------------------------------------

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its display name
 * (e.g. `'Cafe'`). Updated at runtime when loadTemplatesFromCsv() is called.
 *
 * This is used by the meta-progression UI to show which cards a newly unlocked
 * tier adds to the player's card pool.
 *
 * NOTE: This is a mutable Map object that is cleared and re-populated when
 * templates are reloaded. Consumers receive a reference to the same Map object,
 * so they always see the current data without re-importing.
 */
export const CARD_TEMPLATE_NAMES: ReadonlyMap<string, string> = _CARD_TEMPLATE_NAMES;

// ---------------------------------------------------------------------------
// Card template ID → tier mapping (from CSV tier column)
// ---------------------------------------------------------------------------

/**
 * Read-only map from card template ID (e.g. `'biz-cafe'`) to its tier number
 * (as a numeric string, e.g. `'1'` through `'5'`).
 *
 * Built once at module load from the CSV `tier` column.
 * Cards without a tier assignment (e.g. staff cards) are omitted from this map.
 * Updated at runtime when loadTemplatesFromCsv() is called.
 */
export const CARD_TIER_MAP: ReadonlyMap<string, string> = _CARD_TIER_MAP;
