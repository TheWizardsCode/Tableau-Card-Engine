/**
 * Story-line journal parity tests (MS-0MVFM9HGI004XADO AC4).
 *
 * Ports Main Street's storyline-journal cases onto the generic API:
 *
 * - `parseStoryUpdate` well-formed / non-story / malformed lines;
 * - `buildJournal` collects story updates most recent first, recording the
 *   turn and outcome text, and ignoring non-story lines;
 * - `journalIsEmpty` empty/non-empty state;
 * - `journalTitle` distinct story-line names.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  STORY_UPDATE_PREFIX,
  createStorylineSystem,
  truncateOutcome,
} from '../../src/story-line';
import { makeAdapter, makeState, type TestCard } from './helpers';

function makeSystem() {
  const map = new Map<string, TestCard>();
  const engine = makeAdapter(map);
  return { system: createStorylineSystem({ engine }), state: makeState() };
}

// ── parseStoryUpdate ────────────────────────────────────────

describe('parseStoryUpdate', () => {
  const { system } = makeSystem();

  it('parses a well-formed story update line', () => {
    expect(
      system.parseStoryUpdate(
        'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
      ),
    ).toEqual({
      storyline: 'Tax Troubles',
      outcome: 'you accepted the consequence (-200 coins).',
    });
  });

  it('returns null for non-story lines', () => {
    expect(system.parseStoryUpdate('Incident: Rainy Day (-100 coins)')).toBeNull();
    expect(system.parseStoryUpdate('')).toBeNull();
  });

  it('returns null for a malformed update (missing separator)', () => {
    expect(
      system.parseStoryUpdate(`${STORY_UPDATE_PREFIX}Tax Troubles without separator`),
    ).toBeNull();
  });

  it('exposes the canonical prefix', () => {
    expect(STORY_UPDATE_PREFIX).toBe('Story update — ');
  });
});

// ── buildJournal ────────────────────────────────────────────

describe('buildJournal', () => {
  it('collects story updates from the activity log in reverse order', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 1, text: 'Story update — Public Health Crisis: you refused the consequence; the thread continues.' },
      { turn: 2, text: 'Incident: Rainy Day (-100 coins)' },
      { turn: 3, text: 'Story update — Tax Troubles: you accepted the consequence (-200 coins).' },
    ];

    const journal = system.buildJournal(state);
    expect(journal.map((e) => e.storyline)).toEqual(['Tax Troubles', 'Public Health Crisis']);
  });

  it('records the turn and outcome text', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 7, text: 'Story update — Tax Troubles: you accepted the consequence (-200 coins).' },
    ];
    const entry = system.buildJournal(state)[0]!;
    expect(entry.turn).toBe(7);
    expect(entry.storyline).toBe('Tax Troubles');
    expect(entry.outcome).toContain('accepted');
    expect(entry.text).toBe(state.activityLog[0]!.text);
  });

  it('ignores non-story log lines', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 1, text: 'Incident: Rainy Day (-100 coins)' },
      { turn: 2, text: 'Tax collected (+50 coins)' },
    ];
    expect(system.buildJournal(state)).toEqual([]);
  });

  it('keeps a short outcome verbatim (parity with today’s rows)', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 7, text: 'Story update — Tax Troubles: you accepted the consequence (-200 coins).' },
    ];
    const entry = system.buildJournal(state)[0]!;
    expect(entry.outcome).toBe('you accepted the consequence (-200 coins).');
    expect(entry.outcomeFull).toBe(entry.outcome);
  });

  it('carries the full authored prose alongside a display-safe truncation', () => {
    const { system, state } = makeSystem();
    const prose =
      'He does not look up, and the oar drips on the stones, and the word on the sign above him has been freshly repainted in chalk.';
    const line = `Story update — The Lamplit Quay: ${prose}`;
    state.activityLog = [{ turn: 3, text: line }];

    const entry = system.buildJournal(state)[0]!;
    expect(entry.outcomeFull).toBe(prose);
    expect(entry.outcome).not.toBe(prose);
    expect(entry.outcome.endsWith('…')).toBe(true);
    expect(prose.startsWith(entry.outcome.slice(0, -1))).toBe(true);
    expect(entry.outcome).not.toMatch(/\s…$/);
    // The untruncated text stays available for the transcript artefact.
    expect(entry.text).toBe(line);
  });

  it('splits the envelope on the first separator only, so prose may contain `: `', () => {
    const { system, state } = makeSystem();
    const prose = 'He says: "no"; the ink is # 2.';
    state.activityLog = [{ turn: 3, text: `Story update — The Lamplit Quay: ${prose}` }];

    const entry = system.buildJournal(state)[0]!;
    expect(entry.storyline).toBe('The Lamplit Quay');
    expect(entry.outcome).toBe(prose);
  });
});

// ── truncateOutcome ─────────────────────────────────────────

describe('truncateOutcome', () => {
  it('returns a string within the limit unchanged', () => {
    expect(truncateOutcome('He does not look up.')).toBe('He does not look up.');
    expect(truncateOutcome('abcde', 5)).toBe('abcde');
  });

  it('uses a default limit of 80 characters', () => {
    const atLimit = 'A'.repeat(80);
    expect(truncateOutcome(atLimit)).toBe(atLimit);

    const overLimit = `${'A'.repeat(80)}B`;
    const cut = truncateOutcome(overLimit);
    expect(cut.length).toBe(80);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('truncates over-limit text at a word boundary with a single ellipsis', () => {
    const text = 'alpha beta gamma delta';
    expect(truncateOutcome(text, 15)).toBe('alpha beta…');
  });

  it('never leaves a trailing space before the ellipsis', () => {
    // The character budget ends exactly on a space.
    expect(truncateOutcome('alpha beta xyz', 12)).toBe('alpha beta…');
  });

  it('hard-cuts a string with no spaces to the budget', () => {
    expect(truncateOutcome('A'.repeat(80), 20)).toBe(`${'A'.repeat(19)}…`);
  });

  it('is a prefix-preserving single-line cut (no newline introduced)', () => {
    const text =
      'He does not look up, and the oar drips on the stones, and the word on the sign above him has been freshly repainted in chalk.';
    const cut = truncateOutcome(text, 40);
    expect(cut.length).toBeLessThan(text.length);
    expect(text.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.includes('\n')).toBe(false);
    expect(cut.slice(0, -1).endsWith(' ')).toBe(false);
  });
});

// ── journalIsEmpty ──────────────────────────────────────────

describe('journalIsEmpty', () => {
  it('is true before any choice is made', () => {
    const { system, state } = makeSystem();
    expect(system.journalIsEmpty(state)).toBe(true);
    expect(system.buildJournal(state)).toEqual([]);
    expect(system.journalTitle(state)).toBe('Storyline Journal');
  });

  it('is false after a story-line choice resolves', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 1, text: 'Story update — Tax Troubles: you accepted the consequence.' },
    ];
    expect(system.journalIsEmpty(state)).toBe(false);
  });
});

// ── journalTitle ────────────────────────────────────────────

describe('journalTitle', () => {
  it('lists distinct story-line names only', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 1, text: 'Story update — Public Health Crisis: you refused the consequence.' },
      { turn: 2, text: 'Story update — Public Health Crisis: you accepted the consequence.' },
    ];
    const title = system.journalTitle(state);
    expect(title).toContain('Storyline Journal');
    expect(title).toContain('Public Health Crisis');
    // Distinct names only (no duplicate).
    expect(title.split('Public Health Crisis').length - 1).toBe(1);
  });

  it('names multiple distinct story-lines', () => {
    const { system, state } = makeSystem();
    state.activityLog = [
      { turn: 1, text: 'Story update — Tax Troubles: you accepted the consequence.' },
      { turn: 2, text: 'Story update — Public Health Crisis: you refused the consequence.' },
    ];
    expect(system.journalTitle(state)).toContain('Public Health Crisis, Tax Troubles');
  });
});
