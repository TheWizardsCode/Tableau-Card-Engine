/**
 * Main Street: Card Utility Functions
 *
 * Pure helper functions for card operations: staff matching, incident
 * balance, card labelling, and type guards. No module-level mutable state.
 *
 * @module
 */

import type {
  EventCard,
  DurationEventCard,
  AnyCard,
  SynergyType,
  StaffCard,
  IncidentBalanceState,
  IncidentPolarity,
  StaffBusinessTarget,
} from './MainStreetCardsTypes';
import {
  DEFAULT_INCIDENT_REPEAT_SPACING,
  DEFAULT_INCIDENT_MAX_STREAK,
  MAX_TRACKED_INCIDENT_HISTORY,
} from './MainStreetCardsTypes';

// ── Staff Matching ──────────────────────────────────────────

/**
 * Business names and/or synergy type names a staff card may serve.
 *
 * Both specific business names (e.g. `Cafe`) and synergy type names
 * (e.g. `Food`) may appear in one list (CG-0MTIOLY2A0092OT1 AC1). An
 * absent/empty list marks a **generalist** — the staff member matches any
 * business (legacy hand-slot behaviour preserved; additive constraint).
 *
 * @param staff The staff card (template or instance).
 * @returns The parsed allowed-business list (empty = generalist).
 */
export function getAllowedBusinessTypesForStaff(staff: Pick<StaffCard, 'allowedBusinessTypes'>): readonly string[] {
  return Array.isArray(staff.allowedBusinessTypes) ? staff.allowedBusinessTypes : [];
}

/**
 * Returns true when the staff member may be employed at the given business
 * — its name (exact, case-insensitive) or any of its synergy types appears
 * in the staff's `allowedBusinessTypes` list. Staff without the field
 * (legacy saves / hand-built fixtures) are generalists and match any
 * business (additive constraint, CG-0MTIOLY2A0092OT1).
 *
 * @param staff    The staff card to check.
 * @param business The placed business/community-space card, or null.
 * @param _state   Reserved for future template resolution; unused currently.
 * @returns True when the staff may be employed at the business.
 */
export function staffMatchesBusiness(
  staff: Pick<StaffCard, 'allowedBusinessTypes'>,
  business: StaffBusinessTarget | null | undefined,
  _state?: unknown,
): boolean {
  const allowed = getAllowedBusinessTypesForStaff(staff);
  // Generalist: no restriction recorded → matches any business.
  if (allowed.length === 0) return business != null;
  if (!business) return false;

  const name = business.name;
  if (name && allowed.some(t => t.toLowerCase() === name.toLowerCase())) return true;

  for (const synergy of business.synergyTypes ?? []) {
    const lower = synergy.toLowerCase();
    if (allowed.some(t => t.toLowerCase() === lower)) return true;
  }
  return false;
}

// ── Type Guards ─────────────────────────────────────────────

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
 * Check whether an EventCard is available during the given game week.
 *
 * Cards without a week window are year-round (always available).
 * Cards with a window are available when `week` is in the inclusive
 * range [availableWeekStart, availableWeekEnd].
 *
 * @param card   The event card to check.
 * @param week   The current game week (1–52).
 * @returns `true` if the card is available this week.
 */
export function isCardAvailableInWeek(card: EventCard, week: number): boolean {
  const start = card.availableWeekStart;
  const end = card.availableWeekEnd;
  // No window defined → year-round
  if (start === undefined || end === undefined) return true;
  return week >= start && week <= end;
}

// ── Base Type ID ────────────────────────────────────────────

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

// ── Incident Balance ────────────────────────────────────────

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
 * Incident-trigger cards at all (or none eligible for the supplied week).
 *
 * @param deck    Incident-trigger cards to choose from (not mutated).
 * @param balance Balance state whose limits and recent history seed the choice.
 * @param week    Current game week (1–52). When supplied, windowed Incidents
 *                outside their window are skipped (year-round cards are always
 *                eligible). Omit to disable week gating.
 */
export function findConstrainedIncidentIndex(
  deck: EventCard[],
  balance: Pick<
    IncidentBalanceState,
    'repeatSpacing' | 'maxStreak' | 'recentNames' | 'polarityRun'
  >,
  week?: number,
): number {
  const incidentIndices: number[] = [];
  for (let i = 0; i < deck.length; i++) {
    if (deck[i].trigger !== 'Incident') continue;
    if (week !== undefined && !isCardAvailableInWeek(deck[i], week)) continue;
    incidentIndices.push(i);
  }
  if (incidentIndices.length === 0) return -1;

  const windowSize = Math.max(0, balance.repeatSpacing - 1);
  const windowNames = new Set(balance.recentNames.slice(0, windowSize));
  const run = balance.polarityRun;
  const m = balance.maxStreak;

  const inWindow = (i: number): boolean => windowNames.has(incidentTemplateName(deck[i]));
  const polarity = (i: number): IncidentPolarity => incidentPolarity(deck[i]);

  // Strict streak rule: when the run is at/over M, the next card must be the
  // opposite polarity (neutral does not satisfy).
  const streakStrict = (i: number): boolean => {
    if (!run || run.length < m) return true;
    const p = polarity(i);
    return p !== 'neutral' && p !== run.polarity;
  };

  // Invariant-only streak rule: never extend the run past M.
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
  // Final fallback: prefer a card outside the repeat window.
  for (const i of incidentIndices) {
    if (!inWindow(i)) return i;
  }
  return incidentIndices[0];
}

/**
 * @deprecated Replaced by runtime selection via `findConstrainedIncidentIndex`.
 * The incident deck is now shuffled once at setup/reshuffle time and each
 * draw is selected at runtime by evaluating constraints against the
 * resolved-draw balance history.
 *
 * Orders an incident card pool into a face-down, balance-aware deck.
 * Retained only for reference.
 *
 * @param pool    Incident-trigger cards to arrange (not mutated).
 * @param balance Balance state whose limits and recent history seed the build.
 * @returns The ordered deck (always all Incident-trigger pool cards).
 */
export function orderIncidentDeck(
  pool: EventCard[],
  balance: Pick<
    IncidentBalanceState,
    'repeatSpacing' | 'maxStreak' | 'recentNames' | 'polarityRun'
  >,
): EventCard[] {
  const remaining = pool.filter(c => c.trigger === 'Incident');
  if (remaining.length === 0) return [];

  const windowSize = Math.max(0, balance.repeatSpacing - 1);
  const m = balance.maxStreak;

  const placedNames: string[] = [];
  let runPolarity: IncidentPolarity | null = balance.polarityRun?.polarity ?? null;
  let runLength = balance.polarityRun?.length ?? 0;

  const atRunLimit = (): boolean => runPolarity !== null && runLength >= m;
  const inWindow = (i: number): boolean => {
    const win = new Set(placedNames.slice(0, windowSize));
    return win.has(incidentTemplateName(remaining[i]));
  };
  const pol = (i: number): IncidentPolarity => incidentPolarity(remaining[i]);
  const streakStrict = (i: number): boolean => {
    if (!atRunLimit()) return true;
    const p = pol(i);
    return p !== 'neutral' && p !== runPolarity;
  };
  const streakInvariant = (i: number): boolean => {
    if (!atRunLimit()) return true;
    return pol(i) !== runPolarity;
  };

  const pickBalanced = (candidates: number[]): number => {
    const nameCounts = new Map<string, number>();
    for (const c of remaining) {
      const n = incidentTemplateName(c);
      nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
    }
    let bestIdx = candidates[0];
    let bestScore = -1;
    for (const i of candidates) {
      const p = pol(i);
      const extendsRun = runPolarity !== null && p === runPolarity && runLength > 0;
      let runPenalty = 0;
      if (extendsRun) {
        runPenalty = runLength >= m - 1 ? 1000 : 10;
      }
      const nameScore = nameCounts.get(incidentTemplateName(remaining[i])) ?? 0;
      const score = (nameScore * 2) - runPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return bestIdx === undefined ? 0 : bestIdx;
  };

  const deck: EventCard[] = [];
  while (remaining.length > 0) {
    const strict: number[] = [];
    const relaxRepeat: number[] = [];
    const invariantWindow: number[] = [];
    const invariantAny: number[] = [];
    for (let i = 0; i < remaining.length; i++) {
      if (!inWindow(i) && streakStrict(i)) strict.push(i);
      if (streakStrict(i)) relaxRepeat.push(i);
      if (!inWindow(i) && streakInvariant(i)) invariantWindow.push(i);
      if (streakInvariant(i)) invariantAny.push(i);
    }

    let idx: number;
    if (strict.length > 0) idx = pickBalanced(strict);
    else if (relaxRepeat.length > 0) idx = pickBalanced(relaxRepeat);
    else if (invariantWindow.length > 0) idx = pickBalanced(invariantWindow);
    else if (invariantAny.length > 0) idx = pickBalanced(invariantAny);
    else idx = 0;

    const card = remaining.splice(idx, 1)[0];
    deck.push(card);

    const p = incidentPolarity(card);
    if (p === 'neutral') { runPolarity = null; runLength = 0; }
    else if (p === runPolarity) { runLength += 1; }
    else { runPolarity = p; runLength = 1; }
    placedNames.push(incidentTemplateName(card));
  }

  // Bounded repair pass
  for (let i = 0; i < deck.length; i++) {
    const p = incidentPolarity(deck[i]);
    let runLen = 1;
    for (let k = i - 1; k >= 0 && incidentPolarity(deck[k]) === p; k--) runLen += 1;
    if (p === 'neutral' || runLen <= m) continue;

    for (let j = i + 1; j < deck.length; j++) {
      const q = incidentPolarity(deck[j]);
      if (q === 'neutral' || q !== p) {
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
        break;
      }
    }
  }
  return deck;
}

// ── Rendering Utilities ─────────────────────────────────────

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
