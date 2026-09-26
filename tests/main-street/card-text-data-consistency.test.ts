/**
 * Card text / card data consistency regression test
 * (CG-0MTW1EN0D003CSA0, AC3)
 *
 * The integer-economy migration (CG-0MTIO1M15001E9Y6) scaled every coin and
 * reputation *data* value ×100, but card *text* could silently drift out of
 * sync. This guard parses every coin/reputation amount a player can read on a
 * card and asserts it equals the corresponding `card-data.csv` data column
 * (producer decision OPEN QUESTION 1, answer A: `text == data`).
 *
 * Scope (per the parent brief):
 *   - Event `effect` (and non-empty `description`) coin/reputation amounts are
 *     asserted against `coinDelta` / `reputationDelta`. `coinDelta` is the
 *     per-matching-business value for `SpecificSynergy`; `reputationDelta` is
 *     flat.
 *   - Non-event `description` per-turn amounts are asserted against
 *     `reputationPerTurn` (business / community-space), `reputationBonus`
 *     (upgrade) and `ongoingCost` (community-space / staff running cost).
 *   - No fractional coin/reputation value may remain in any card text.
 *
 * Out of scope (AC2): percentages (`45%`), durations (`3 turns`), hand-slot
 * counts, levels and the `{SYNERGY_RATE}` token.
 *
 * The source of truth is `card-data.csv`; this test never rewrites data, it
 * only fails when the text and the data disagree.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import { getCsvRows } from '../../example-games/main-street/MainStreetCards';

// ── Text parsing helpers ─────────────────────────────────────

/** Matches an (optionally signed) magnitude immediately followed by "coin(s)". */
const COIN_RE = /([+\-])?(\d+(?:\.\d+)?)(?=\s*coins?\b)/gi;
/** Matches an (optionally signed) magnitude immediately followed by "reputation". */
const REPUTATION_RE = /([+\-])?(\d+(?:\.\d+)?)(?=\s*reputation\b)/gi;

interface ParsedAmount {
  /** Signed amount as a reader would understand it. */
  value: number;
  /** The matched text, for failure messages. */
  raw: string;
}

/**
 * True when an unsigned magnitude is governed by a negative word (e.g.
 * "Lose 200 coins", "Lose 600 coins and 100 reputation") earlier in the same
 * sentence/clause. Explicit `+`/`-` signs always take precedence.
 */
function hasNegativeWordBefore(text: string, matchIndex: number): boolean {
  const clauseStart = Math.max(
    text.lastIndexOf('.', matchIndex - 1),
    text.lastIndexOf(';', matchIndex - 1),
    text.lastIndexOf(':', matchIndex - 1),
  );
  const prefix = text.slice(clauseStart + 1, matchIndex).toLowerCase();
  return /\b(lose|loses|losing)\b/.test(prefix);
}

/** Extracts every signed amount the given unit regex matches in `text`. */
function extractAmounts(text: string, pattern: RegExp): ParsedAmount[] {
  const amounts: ParsedAmount[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const explicitSign = match[1];
    const magnitude = Number(match[2]);
    let sign = 1;
    if (explicitSign === '-') {
      sign = -1;
    } else if (explicitSign === '+') {
      sign = 1;
    } else if (hasNegativeWordBefore(text, match.index)) {
      sign = -1;
    }
    amounts.push({ value: sign * magnitude, raw: match[0] });
  }
  return amounts;
}

function parseCoinAmounts(text: string): ParsedAmount[] {
  return extractAmounts(text, COIN_RE);
}

function parseReputationAmounts(text: string): ParsedAmount[] {
  return extractAmounts(text, REPUTATION_RE);
}

function numberOrZero(value: string | undefined): number {
  return value ? Number(value) : 0;
}

const rows = getCsvRows();
const events = rows.filter(r => r.family === 'event');

// ── Event cards: effect text ↔ coinDelta / reputationDelta ───

describe('Event card text matches coinDelta / reputationDelta (AC1)', () => {
  it('covers every event card (guard is not vacuously passing)', () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it('every event coin/reputation amount equals its data column', () => {
    const failures: string[] = [];

    for (const row of events) {
      const coinDelta = numberOrZero(row.coinDelta);
      const reputationDelta = numberOrZero(row.reputationDelta);

      const texts = [row.effect, row.description].filter(
        (t): t is string => typeof t === 'string' && t.trim() !== '',
      );

      for (const text of texts) {
        for (const amount of parseCoinAmounts(text)) {
          if (amount.value !== coinDelta) {
            failures.push(
              `${row.id} [effect="${text}"]: coin text ${amount.raw} (${amount.value}) ` +
                `!= coinDelta ${coinDelta}`,
            );
          }
        }
        for (const amount of parseReputationAmounts(text)) {
          if (amount.value !== reputationDelta) {
            failures.push(
              `${row.id} [effect="${text}"]: reputation text ${amount.raw} (${amount.value}) ` +
                `!= reputationDelta ${reputationDelta}`,
            );
          }
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});

// ── Non-event cards: per-turn figures ↔ data columns ─────────

describe('Non-event card per-turn text matches data columns (AC1)', () => {
  const reputationPerTurnRe = /([+\-])?(\d+(?:\.\d+)?)(?=\s*reputation\s+per\s+turn)/gi;
  const ongoingCostRe = /costs\s+([+\-])?(\d+(?:\.\d+)?)\s+coins?\s+per\s+turn/gi;

  it('business / community-space / upgrade "reputation per turn" matches data', () => {
    const failures: string[] = [];

    for (const row of rows) {
      if (row.family === 'event' || !row.description) continue;

      // Business and community-space use `reputationPerTurn`; upgrades use
      // `reputationBonus` (a one-off reputation boost).
      const column = row.family === 'upgrade' ? 'reputationBonus' : 'reputationPerTurn';
      const expectedRaw = row[column];
      if (!expectedRaw) continue;
      const expected = numberOrZero(expectedRaw);

      reputationPerTurnRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = reputationPerTurnRe.exec(row.description)) !== null) {
        const value = Number(match[2]);
        if (value !== expected) {
          failures.push(
            `${row.id}: "${match[0]} reputation per turn" (${value}) ` +
              `!= ${column} ${expected}`,
          );
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('community-space / staff "Costs N coins per turn" matches ongoingCost', () => {
    const failures: string[] = [];

    for (const row of rows) {
      if (!row.description || !row.ongoingCost) continue;

      ongoingCostRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ongoingCostRe.exec(row.description)) !== null) {
        const value = Number(match[2]);
        const expected = numberOrZero(row.ongoingCost);
        if (value !== expected) {
          failures.push(
            `${row.id}: "Costs ${value} coins per turn" != ongoingCost ${expected}`,
          );
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});

// ── No fractional coin/reputation values anywhere ────────────

describe('No fractional coin/reputation value remains in card text (AC1)', () => {
  it('every card text field is free of fractional coin/reputation amounts', () => {
    const fractionalRe = /\d+\.\d+\s*(?:coins?|reputation)\b/i;
    const failures: string[] = [];

    for (const row of rows) {
      for (const field of ['description', 'effect'] as const) {
        const text = row[field];
        if (text && fractionalRe.test(text)) {
          failures.push(`${row.id}.${field}: "${text}"`);
        }
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});
