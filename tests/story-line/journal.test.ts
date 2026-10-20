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
