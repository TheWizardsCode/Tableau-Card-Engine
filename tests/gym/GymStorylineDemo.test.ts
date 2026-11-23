/**
 * GymStorylineDemo — unit tests for the demo's own branching wiring.
 *
 * `GymStorylineScene` plays the catalogue projected from the **authored**
 * content (`example-games/gym/content/storylines.csv`) by the Phaser-free
 * `GymStorylineDemo` module. The generic algorithms are covered by the core
 * story-line parity suite (`core/tests/story-line/*`); what is NOT covered
 * anywhere else — and what these tests pin — is the demo's *transitions*:
 * which options the first card offers, where each choice leads, which branch
 * ends the chain immediately, that an authored cost / extra effect / state
 * gate actually reaches play, that a beat's authored `cost` is charged (settled
 * with the beat's own effect), and that the seeded replay is deterministic.
 *
 * Everything here goes through the public `@story-line` API via the exported
 * runtime, so a change to the authored content (a renamed option, a re-pointed
 * successor, a dropped effect) fails a test instead of silently changing what
 * the demo teaches.
 *
 * No Phaser, no browser: the module under test has no rendering dependency.
 *
 * @module tests/gym/GymStorylineDemo
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import {
  DEMO_RNG_SEED,
  DEMO_START_CARD_ID,
  DEMO_STARTING_COINS,
  applyDemoChoice,
  buildDemoCardView,
  createDemoRuntime,
  createDemoState,
  demoCardCost,
  demoCardsFromCsv,
  drawDemoCard,
  getBaseTypeId,
  startDemo,
  type DemoCard,
  type DemoState,
  type DemoRuntime,
} from '../../example-games/gym/GymStorylineDemo';
import { DEFAULT_CONTENT_PATH } from '../../src/story-line/content/adapters';
import type { StorylineCard, StorylineOption } from '@story-line';

/** Repository root, resolved from this file rather than `process.cwd()`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The authored content the scene plays, read from the toolchain's own file. */
const CSV_TEXT = readFileSync(
  join(REPO_ROOT, ...DEFAULT_CONTENT_PATH.split('/')),
  'utf-8',
);

/** The demo catalogue, projected from the authored CSV exactly as the scene does. */
const DEMO_CATALOGUE = demoCardsFromCsv(CSV_TEXT);

/** The demo card template with `id`; fails loudly when the content lost it. */
function template(id: string): DemoCard {
  const card = DEMO_CATALOGUE.find((candidate) => candidate.id === id);
  if (card === undefined) throw new Error(`authored content has no card "${id}"`);
  return card;
}

/** Draws `card`, asserts it is a choice, and returns its option labels. */
function optionLabels(
  runtime: DemoRuntime,
  card: StorylineCard,
): string[] {
  const draw = drawDemoCard(runtime.system, runtime.state, card);
  expect(draw.finished).toBe(false);
  expect(draw.pending).not.toBeNull();
  return draw.options.map((o) => o.label);
}

/** Picks the option with `label` from the card's compiled options. */
function pick(
  runtime: DemoRuntime,
  card: StorylineCard,
  label: string,
): { option: StorylineOption<DemoState>; result: ReturnType<typeof applyDemoChoice> } {
  const draw = drawDemoCard(runtime.system, runtime.state, card);
  const option = draw.options.find((o) => o.label === label);
  if (!option) {
    throw new Error(
      `Option "${label}" not offered by ${card.id}; got ${draw.options
        .map((o) => o.label)
        .join(', ')}`,
    );
  }
  return {
    option,
    result: applyDemoChoice(runtime.system, runtime.state, card, option, draw.pending),
  };
}

describe('GymStorylineDemo — authored catalogue', () => {
  it('plays the four authored cards as a two-way branch into a terminal card', () => {
    expect(DEMO_CATALOGUE.map((c) => c.id)).toEqual([
      'gym-story-start',
      'gym-story-invest',
      'gym-story-ignore',
      'gym-story-end',
    ]);
    expect(DEMO_START_CARD_ID).toBe('gym-story-start');
    // Every non-terminal successor named by the content actually exists.
    for (const card of DEMO_CATALOGUE) {
      if (!card.options) continue;
      for (const segment of card.options.split(';')) {
        const successor = segment.split('|')[1]?.split('#')[0];
        if (!successor) continue;
        expect(template(successor), `${card.id} → ${successor}`).toBeDefined();
      }
    }
  });

  it('carries the authored prose and game columns off the CSV rows', () => {
    const start = template('gym-story-start');
    // Name, effect and context come from the content file, not a code fixture.
    expect(start.name).toBe('Town Roads');
    expect(start.effect).toBe('Lose 50 coins in expenses for the meeting.');
    expect(start.context).toContain('The people of the town are warning that');
    // The game columns are projected onto the demo's numeric deltas.
    expect(start.coinDelta).toBe(-50);
    expect(start.reputationDelta).toBe(0);
    expect(template('gym-story-end').reputationDelta).toBe(60);
  });

  it('projects the authored beat cost onto the demo card', () => {
    // The `cost` column is a real mechanic, not a label: Public Investment
    // costs 100 coins, and the two cost-free beats stay at 0.
    expect(template('gym-story-invest').cost).toBe(100);
    expect(demoCardCost(template('gym-story-invest'))).toBe(100);
    expect(demoCardCost(template('gym-story-start'))).toBe(0);
    expect(demoCardCost(template('gym-story-end'))).toBe(0);
    // A card that authors no `cost` column at all is free, never undefined.
    expect(demoCardCost({ id: 'bare', name: 'Bare' })).toBe(0);
  });

  it('starts below the authored state gate so every card stays reachable', () => {
    const a = createDemoState();
    expect(a.coins).toBe(DEMO_STARTING_COINS);
    // Below the 100-coin `Invest` gate (checked after the 50-coin effect and
    // the 5-coin cost), so the demo can actually reach `gym-story-invest`.
    expect(DEMO_STARTING_COINS - 50 - 5).toBeLessThan(100);
    // And above the cost, so the authored `Invest` option is affordable.
    expect(DEMO_STARTING_COINS - 50).toBeGreaterThanOrEqual(5);
    // Public Investment's own 100-coin beat cost needs no extra float: it
    // settles against that beat's +120 effect, so the branch nets +20 from a
    // balance that never has to hold 100 coins at once.
    const invest = template('gym-story-invest');
    expect(demoCardCost(invest)).toBe(100);
    expect((invest.coinDelta ?? 0) - demoCardCost(invest)).toBe(20);
  });

  it('starts with a deterministic seed and a clean journal', () => {
    const a = createDemoState();
    const b = createDemoState();
    expect(a).toEqual(b);
    expect(a.rngSeed).toBe(DEMO_RNG_SEED);
    expect(a.activityLog).toEqual([]);
    expect(a.deck).toEqual([]);
    expect(a.turn).toBe(1);
  });
});

describe('GymStorylineDemo — draw', () => {
  it('the first card compiles to the ordered Invest / Ignore options', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const draw = startDemo(runtime);

    expect(draw.card.id).toBe('gym-story-start');
    expect(draw.options.map((o) => o.label)).toEqual(['Invest', 'Ignore']);
    expect(draw.finished).toBe(false);
    // Drawing a branching card applies no effect.
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS);
  });

  it('a terminal card applies its effect, journals it and finishes the chain', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const terminal = template('gym-story-end');

    const draw = drawDemoCard(runtime.system, runtime.state, terminal);

    expect(draw.finished).toBe(true);
    expect(draw.options).toEqual([]);
    expect(draw.pending).toBeNull();
    expect(draw.reputationChange).toBe(60);
    expect(runtime.state.reputation).toBe(110);
    expect(runtime.state.activityLog).toHaveLength(1);
    expect(draw.storyUpdate).toContain('Gym Storyline');
  });
});

describe('GymStorylineDemo — a beat charges its authored cost', () => {
  it('charges nothing when the beat is drawn; the cost settles on resolution', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const invest = template('gym-story-invest');

    const draw = drawDemoCard(runtime.system, runtime.state, invest);

    // Presenting a branching beat is not a purchase: the options are shown at
    // the current balance and only the chosen resolution pays the cost.
    expect(draw.finished).toBe(false);
    expect(draw.coinChange).toBe(0);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS);
  });

  it('nets the cost against a choice beat\'s effect in a single step', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const invest = template('gym-story-invest');

    const { result } = pick(runtime, invest, 'Celebrate');

    // +120 gained, 100 paid, reported as one +20 delta so the balance is never
    // transiently negative (public-investment trade, not a free reward).
    expect(result.coinChange).toBe(20);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS + 20);
  });

  it('charges a terminal card\'s cost with its own effect', () => {
    // The authored Gym content has no terminal beat with a cost, so a fixture
    // pins the terminal path: 30 paid against a -20 effect is a -50 delta.
    const feeBeat: DemoCard = {
      id: 'gym-story-fee',
      name: 'Filing Fee',
      effect: 'Settle the paperwork.',
      coinDelta: -20,
      cost: 30,
    };
    const runtime = createDemoRuntime([feeBeat]);

    const draw = drawDemoCard(runtime.system, runtime.state, feeBeat);

    expect(draw.finished).toBe(true);
    expect(draw.coinChange).toBe(-50);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS - 50);
  });

  it('charges nothing on a cost-free terminal beat', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const terminal = template('gym-story-end');

    const draw = drawDemoCard(runtime.system, runtime.state, terminal);

    expect(draw.coinChange).toBe(0);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS);
  });
});

describe('GymStorylineDemo — choices determine the next card', () => {
  it('Invest applies the choosing card\'s effect and deals Public Investment', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const start = template('gym-story-start');

    const { result } = pick(runtime, start, 'Invest');

    // Resolution applies the *drawn* card's effect (Town Roads: -50) plus the
    // option's own authored `#cost=coins:5`, not the successor's effect; the
    // successor's own effect applies when it is resolved.
    expect(result.coinChange).toBe(-55);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS - 55);
    // The option's authored `#extra=reputation:+2` is honoured too.
    expect(result.reputationChange).toBe(2);
    expect(result.pushedCard?.name).toBe('Public Investment');
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-invest');
    // The successor lands on the chain deck with a deterministic instance id.
    expect(runtime.state.deck).toHaveLength(1);
    expect(runtime.state.deck[0].id).toMatch(/^gym-story-invest-\d+$/);
  });

  it('takes the authored `#when` gate to the ending when the town is wealthy', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    // The content gates `Invest` on `coins>=100` (evaluated after the effect and
    // cost). A rich state therefore short-circuits straight to the ending — the
    // authored state gate is honoured rather than parsed and ignored.
    runtime.state.coins = 1_000;

    const { result } = pick(runtime, template('gym-story-start'), 'Invest');

    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-end');
  });

  it('Ignore deals Neglected Roads on the other branch', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const start = template('gym-story-start');

    const { result } = pick(runtime, start, 'Ignore');

    // Ungated, so only the drawn card's -50 applies.
    expect(result.coinChange).toBe(-50);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS - 50);
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-ignore');
  });

  it('the successor\'s own effect applies when that card is resolved', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const start = template('gym-story-start');

    const invest = pick(runtime, start, 'Invest').result.pushedCard!;
    const { result } = pick(runtime, invest, 'Celebrate');

    // Public Investment: +120 coins granted less its authored 100-coin beat
    // cost, settled in one step (a net +20), then the terminal card is pushed.
    expect(result.coinChange).toBe(120 - 100);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS - 55 + 20);
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-end');
  });

  it('a terminal option (Double down) ends the chain with no successor', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const invest = template('gym-story-invest');

    const { result } = pick(runtime, invest, 'Double down');

    expect(result.pushedCard).toBeNull();
    expect(runtime.state.deck).toHaveLength(0);
    // The beat still pays its 100-coin cost against its +120 effect.
    expect(result.coinChange).toBe(20);
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS + 20);
  });

  it('the full happy path ends on the terminal Transport Infrastructure card', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);

    const start = startDemo(runtime).card;
    const invest = pick(runtime, start, 'Invest').result.pushedCard!;
    const end = pick(runtime, invest, 'Celebrate').result.pushedCard!;
    expect(getBaseTypeId(end.id)).toBe('gym-story-end');

    const finalDraw = drawDemoCard(runtime.system, runtime.state, end);
    expect(finalDraw.finished).toBe(true);
    // 60 - 50 (Town Roads effect) - 5 (Invest cost) + 120 - 100 (Public
    // Investment's effect less its beat cost), then +60 reputation from the
    // terminal card, on top of the +2 the authored `#extra=reputation:+2`
    // granted on `Invest`.
    expect(runtime.state.coins).toBe(DEMO_STARTING_COINS - 55 + 20);
    expect(runtime.state.reputation).toBe(50 + 2 + 60);

    // The journal records the choice lines the scene renders.
    expect(runtime.state.activityLog.length).toBeGreaterThanOrEqual(3);
  });
});

describe('GymStorylineDemo — determinism', () => {
  it('replays identically from the same seed', () => {
    const play = () => {
      const runtime = createDemoRuntime(DEMO_CATALOGUE);
      const start = startDemo(runtime).card;
      const invest = pick(runtime, start, 'Invest').result.pushedCard!;
      pick(runtime, invest, 'Celebrate');
      return {
        coins: runtime.state.coins,
        reputation: runtime.state.reputation,
        deck: runtime.state.deck.map((c) => c.id),
        rngSeed: runtime.state.rngSeed,
        log: runtime.state.activityLog.map((e) => e.text),
      };
    };

    expect(play()).toEqual(play());
  });

  it('offers the same option order on every draw of the same card', () => {
    const first = optionLabels(createDemoRuntime(DEMO_CATALOGUE), template('gym-story-start'));
    const second = optionLabels(createDemoRuntime(DEMO_CATALOGUE), template('gym-story-start'));
    expect(first).toEqual(second);
    expect(first).toEqual(['Invest', 'Ignore']);
  });
});

describe('GymStorylineDemo — authored prose view model', () => {
  /** The `#says` prose the demo's first-beat options author. */
  const INVEST_OUTCOME =
    'The vote passes, and the road crews are working before the week is out.';
  const IGNORE_OUTCOME =
    'The question is set aside, and the ruts deepen with every cart that passes.';

  it('surfaces the beat context, beat cost and the authored option outcomes', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const draw = startDemo(runtime);

    const view = buildDemoCardView(draw.card, draw.options);

    expect(view.context).toContain('The town meets in the hall above the market');
    // The first beat is free; the paid beat's cost reaches the view model the
    // scene renders on the card line.
    expect(view.cost).toBe(0);
    expect(buildDemoCardView(template('gym-story-invest'), []).cost).toBe(100);
    expect(view.options.map((option) => option.label)).toEqual(['Invest', 'Ignore']);
    expect(view.options.map((option) => option.outcome)).toEqual([
      INVEST_OUTCOME,
      IGNORE_OUTCOME,
    ]);
  });

  it('authors context on every authored card', () => {
    for (const card of DEMO_CATALOGUE) {
      const view = buildDemoCardView(card, []);
      expect(view.context, card.id).not.toBeNull();
      expect(view.context?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('reports a null context and null outcomes for a fixture that authors none', () => {
    const bare: readonly DemoCard[] = [
      {
        id: DEMO_START_CARD_ID,
        name: 'Bare Meeting',
        effect: 'No prose here',
        options: 'Go|nowhere',
      },
    ];
    const runtime = createDemoRuntime(bare);
    const draw = startDemo(runtime);

    const view = buildDemoCardView(draw.card, draw.options);

    expect(view.context).toBeNull();
    expect(view.options.map((option) => option.outcome)).toEqual([null]);
  });

  it('surfaces the chosen option’s authored outcome on the resolution result', () => {
    const runtime = createDemoRuntime(DEMO_CATALOGUE);
    const start = template('gym-story-start');

    const { result } = pick(runtime, start, 'Invest');

    expect(result.outcomeProse).toBe(INVEST_OUTCOME);
    // A card without `#says` resolves with no invented prose.
    const invest = result.pushedCard!;
    expect(pick(runtime, invest, 'Celebrate').result.outcomeProse).toBeNull();
  });
});
