/**
 * Story-line UI adapter parity tests (MS-0MVFM9HGI004XADO AC4).
 *
 * Ports Main Street's storyline-player-agency / journal cases onto the
 * generic API and pins the pluggable seam:
 *
 * - the default UI adapter's dialog titles, subtitles, story-update lines,
 *   journal title and summary match today's wording;
 * - a game-supplied adapter overrides presentation without touching core;
 * - the retired choice-clarity API is no longer part of the public surface.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import * as storylineApi from '../../src/story-line';
import {
  createDefaultStorylineUiAdapter,
  createStorylineSystem,
  defaultStorylineName,
  defaultStoryUpdateLine,
  formatOptionCost,
  formatOptionLabel,
} from '../../src/story-line';
import { makeAdapter, makeCard, type TestCard } from './helpers';

/** Non-storyline card factory (mirrors the agency test's `makeEvent`). */
function makeEvent(overrides: Omit<Parameters<typeof makeCard>[0], 'id'> & { id?: string }) {
  return makeCard({ id: 'evt-x', name: 'X', ...overrides });
}

/** A system with an optional UI override. */
function makeSystem(ui?: Parameters<typeof createStorylineSystem>[0]['ui']) {
  const engine = makeAdapter(new Map<string, TestCard>());
  return createStorylineSystem({ engine, ui });
}

// ── storylineName ───────────────────────────────────────────

describe('storylineName', () => {
  it('prefers the title, falls back to the id, then null', () => {
    expect(defaultStorylineName(makeEvent({ id: 's1', storylineId: 's1', storylineTitle: 'Arc One' }))).toBe('Arc One');
    expect(defaultStorylineName(makeEvent({ id: 's1', storylineId: 's1' }))).toBe('s1');
    expect(defaultStorylineName(makeEvent({ id: 's1' }))).toBeNull();
  });

  it('is reachable through the system UI adapter', () => {
    const system = makeSystem();
    expect(
      system.ui.storylineName(makeEvent({ id: 's1', storylineId: 's1', storylineTitle: 'Arc One' })),
    ).toBe('Arc One');
  });
});

// ── choiceDialogTitle / Subtitle ────────────────────────────

describe('choice dialog titles', () => {
  const system = makeSystem();

  it('shows the story-line name when available', () => {
    const card = makeEvent({
      id: 'evt-flu-outbreak',
      name: 'Flu Outbreak',
      storylineId: 'storyline-health',
      storylineTitle: 'Public Health Crisis',
    });
    expect(system.ui.choiceDialogTitle(card)).toBe('Public Health Crisis');
    expect(system.ui.choiceDialogSubtitle(card)).toBe('Flu Outbreak');
  });

  it('falls back to the card name for non-storyline choices', () => {
    const plain = makeCard({
      id: 'evt-plain',
      name: 'Plain Choice',
      options: 'Go|evt-next',
    });
    expect(system.ui.choiceDialogTitle(plain)).toBe('Plain Choice');
    expect(system.ui.choiceDialogSubtitle(plain)).toBe('');
  });
});

// ── storyUpdateLine ─────────────────────────────────────────

describe('storyUpdateLine', () => {
  const system = makeSystem();
  const tax = makeCard({
    id: 'evt-tax-error',
    name: 'Tax Error',
    storylineId: 'storyline-tax',
    storylineTitle: 'Tax Troubles',
    effect: 'Lose 200 coins',
    coinDelta: -200,
  });

  it('emits an accept line tied to the story-line title', () => {
    expect(system.ui.storyUpdateLine(tax, 'accept', -200, 0)).toBe(
      'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
    );
  });

  it('emits a reject line that keeps the thread open', () => {
    const line = system.ui.storyUpdateLine(tax, 'reject', 0, 0);
    expect(line).toContain('Tax Troubles');
    expect(line).toContain('refused');
  });

  it('returns null for cards without a storyline', () => {
    expect(
      system.ui.storyUpdateLine(makeEvent({ id: 'evt-plain', options: 'Go|evt-next' }), 'accept', -10, 0),
    ).toBeNull();
  });

  it('names a generalised multi-way option label and formats deltas', () => {
    const line = system.ui.storyUpdateLine(
      makeCard({ id: 'evt-multi', storylineId: 's1', storylineTitle: 'Arc' }),
      'Investigate',
      50,
      0,
    );
    expect(line).toContain('Investigate');
    expect(line).toContain('+50 coins');
  });

  it('formats reputation deltas too', () => {
    const line = system.ui.storyUpdateLine(tax, 'accept', 0, 3);
    expect(line).toContain('+3 rep');
  });

  it('uses the authored outcome prose verbatim, with no paraphrase or delta summary', () => {
    const prose = 'He does not look up, and the oar drips on the stones.';
    expect(defaultStoryUpdateLine(tax, 'accept', -200, 5, prose)).toBe(
      'Story update — Tax Troubles: He does not look up, and the oar drips on the stones.',
    );
  });

  it('exposes the prose through the adapter seam', () => {
    const prose = 'The thread closes; the ledger stays open.';
    expect(system.ui.storyUpdateLine(tax, 'Investigate', 50, 0, prose)).toBe(
      'Story update — Tax Troubles: The thread closes; the ledger stays open.',
    );
  });

  it('falls back to today’s wording when the prose is absent or blank (parity)', () => {
    expect(defaultStoryUpdateLine(tax, 'accept', -200, 0, null)).toBe(
      'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
    );
    expect(defaultStoryUpdateLine(tax, 'accept', -200, 0, undefined)).toBe(
      'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
    );
    expect(defaultStoryUpdateLine(tax, 'accept', -200, 0, '')).toBe(
      'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
    );
    expect(defaultStoryUpdateLine(tax, 'accept', -200, 0, '   ')).toBe(
      'Story update — Tax Troubles: you accepted the consequence (-200 coins).',
    );
  });

  it('still returns null for a card without a storyline, prose or not', () => {
    expect(
      defaultStoryUpdateLine(
        makeEvent({ id: 'evt-plain', options: 'Go|evt-next' }),
        'Go',
        0,
        0,
        'Some authored prose.',
      ),
    ).toBeNull();
  });
});

// ── retired choice-clarity API ─────────────────────────────

describe('retired choice-clarity API', () => {
  it('leaves the default UI adapter with exactly the documented methods', () => {
    const system = makeSystem();
    expect(Object.keys(system.ui).sort()).toEqual([
      'choiceDialogSubtitle',
      'choiceDialogTitle',
      'journalTitle',
      'storyUpdateLine',
      'storylineName',
      'storylineSummary',
    ]);
  });

  it('exports no clarity helper from the public barrel', () => {
    // The retired API was removed from the barrel. A shape guard keeps a stale
    // re-export from creeping back without naming the removed symbols.
    //
    // The guard matches the retired *clarity* vocabulary specifically, not the
    // word "label": `formatOptionLabel` is a current, supported export that
    // renders an option's authored cost (CG-0MWRVR4TP001I97I), and banning
    // every label-ish name would forbid legitimate presentation helpers.
    const clarityish = Object.keys(storylineApi).filter((key) => /clarity/i.test(key));
    expect(clarityish).toEqual([]);
  });
});

// ── journalTitle / storylineSummary ──────────────────────────

describe('journal formatting', () => {
  const system = makeSystem();

  it('names distinct story-line names in the journal title', () => {
    const entries = [
      { turn: 1, storyline: 'Tax Troubles', outcome: 'x', text: 'a' },
      { turn: 2, storyline: 'Tax Troubles', outcome: 'y', text: 'b' },
      { turn: 3, storyline: 'Public Health Crisis', outcome: 'z', text: 'c' },
    ];
    expect(system.ui.journalTitle(entries)).toBe(
      'Storyline Journal — Tax Troubles, Public Health Crisis',
    );
  });

  it('falls back to the plain journal title when empty', () => {
    expect(system.ui.journalTitle([])).toBe('Storyline Journal');
  });

  it('summarises a story-line card', () => {
    expect(
      system.ui.storylineSummary(makeCard({ id: 'evt-s', name: 'Card', storylineId: 'arc', storylineTitle: 'Arc One' })),
    ).toBe('Storyline: Arc One');
    expect(system.ui.storylineSummary(makeCard({ id: 'evt-s', name: 'Card' }))).toBe('Storyline: Card');
  });
});

// ── Pluggable seam ──────────────────────────────────────────

describe('pluggable UI adapter', () => {
  it('a game-supplied adapter overrides presentation without touching core', () => {
    const system = makeSystem({
      ...createDefaultStorylineUiAdapter(),
      storyUpdateLine: () => 'CUSTOM UPDATE',
      choiceDialogTitle: () => 'CUSTOM TITLE',
    });

    const card = makeCard({ id: 'evt-x', options: 'Go|evt-next', storylineId: 's1' });
    expect(system.ui.storyUpdateLine(card, 'accept', 0, 0)).toBe('CUSTOM UPDATE');
    expect(system.ui.choiceDialogTitle(card)).toBe('CUSTOM TITLE');
    // Unoverridden methods still use the default implementation.
    expect(system.ui.choiceDialogSubtitle(makeCard({ id: 'evt-y', name: 'Y', storylineId: 's1' }))).toBe('Y');
  });
});

// ── option cost labels ──────────────────────────────────────

describe('option cost labels', () => {
  it('renders a cost-free option with its bare label', () => {
    expect(formatOptionCost(undefined)).toBe('');
    expect(formatOptionCost({})).toBe('');
    expect(formatOptionLabel({ label: 'Ignore' })).toBe('Ignore');
  });

  it('appends a single-resource cost using the authored resource key', () => {
    expect(formatOptionCost({ coins: 5 })).toBe('5 coins');
    expect(formatOptionLabel({ label: 'Invest', cost: { coins: 5 } })).toBe(
      'Invest — 5 coins',
    );
  });

  it('lists several resources in the authored declaration order', () => {
    expect(
      formatOptionLabel({ label: 'Sail', cost: { charge: 1, stores: 2 } }),
    ).toBe('Sail — 1 charge, 2 stores');
    // Order is the map's own order, so the same content always reads the same.
    expect(formatOptionCost({ stores: 2, charge: 1 })).toBe('2 stores, 1 charge');
  });

  it('does not invent pluralisation for an arbitrary declared key', () => {
    // Resource keys are authored strings, not nouns with known plural rules.
    expect(formatOptionCost({ charge: 1 })).toBe('1 charge');
    expect(formatOptionCost({ stores: 1 })).toBe('1 stores');
  });

  it('omits zero and non-finite amounts instead of printing them', () => {
    expect(formatOptionCost({ coins: 0, stores: 2 })).toBe('2 stores');
    expect(formatOptionCost({ coins: Number.NaN })).toBe('');
  });

  it('keeps the authored label verbatim, adding only the separator', () => {
    expect(
      formatOptionLabel({ label: 'Pay up! (now)', cost: { coins: 3 } }),
    ).toBe('Pay up! (now) — 3 coins');
  });
});
