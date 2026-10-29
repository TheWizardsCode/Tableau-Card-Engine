/**
 * GymStorylineDemo — unit tests for the demo's own branching wiring.
 *
 * `GymStorylineScene` renders a fixture defined in the Phaser-free
 * `GymStorylineDemo` module. The generic algorithms are covered by the core
 * story-line parity suite (`core/tests/story-line/*`); what is NOT covered
 * anywhere else — and what these tests pin — is the demo's *fixture and
 * transitions*: which options the Town Meeting card offers, where each choice
 * leads, which branch ends the chain immediately, and that the seeded replay is
 * deterministic.
 *
 * Everything here goes through the public `@story-line` API via the exported
 * runtime, so a change to the fixture (a renamed option, a re-pointed
 * successor, a dropped effect) fails a test instead of silently changing what
 * the demo teaches.
 *
 * No Phaser, no browser: the module under test has no rendering dependency.
 *
 * @module tests/gym/GymStorylineDemo
 */
import { describe, expect, it } from 'vitest';
import {
  DEMO_CARDS,
  getBaseTypeId,
  DEMO_RNG_SEED,
  DEMO_START_CARD_ID,
  applyDemoChoice,
  createDemoRuntime,
  createDemoState,
  drawDemoCard,
  getDemoTemplate,
  startDemo,
  type DemoState,
  type DemoRuntime,
} from '../../example-games/gym/GymStorylineDemo';
import type { StorylineCard, StorylineOption } from '@story-line';

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

describe('GymStorylineDemo — fixture', () => {
  it('defines four cards forming a two-way branch into a terminal card', () => {
    expect(DEMO_CARDS.map((c) => c.id)).toEqual([
      'gym-story-start',
      'gym-story-invest',
      'gym-story-ignore',
      'gym-story-end',
    ]);
    expect(DEMO_START_CARD_ID).toBe('gym-story-start');
    // Every non-terminal successor named by the fixture actually exists.
    for (const card of DEMO_CARDS) {
      if (!card.options) continue;
      for (const segment of card.options.split(';')) {
        const successor = segment.split('|')[1];
        if (!successor) continue;
        expect(getDemoTemplate(successor), `${card.id} → ${successor}`).toBeDefined();
      }
    }
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
    const runtime = createDemoRuntime();
    const draw = startDemo(runtime);

    expect(draw.card.id).toBe('gym-story-start');
    expect(draw.options.map((o) => o.label)).toEqual(['Invest', 'Ignore']);
    expect(draw.finished).toBe(false);
    // Drawing a branching card applies no effect.
    expect(runtime.state.coins).toBe(1000);
  });

  it('a terminal card applies its effect, journals it and finishes the chain', () => {
    const runtime = createDemoRuntime();
    const terminal = getDemoTemplate('gym-story-end')!;

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

describe('GymStorylineDemo — choices determine the next card', () => {
  it('Invest applies the choosing card\'s effect and deals Public Investment', () => {
    const runtime = createDemoRuntime();
    const start = getDemoTemplate('gym-story-start')!;

    const { result } = pick(runtime, start, 'Invest');

    // Resolution applies the *drawn* card's effect (Town Meeting: -50), not the
    // successor's; the successor's own effect applies when it is resolved.
    expect(result.coinChange).toBe(-50);
    expect(runtime.state.coins).toBe(950);
    expect(result.pushedCard?.name).toBe('Public Investment');
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-invest');
    // The successor lands on the chain deck with a deterministic instance id.
    expect(runtime.state.deck).toHaveLength(1);
    expect(runtime.state.deck[0].id).toMatch(/^gym-story-invest-\d+$/);
  });

  it('Ignore deals Neglected Roads on the other branch', () => {
    const runtime = createDemoRuntime();
    const start = getDemoTemplate('gym-story-start')!;

    const { result } = pick(runtime, start, 'Ignore');

    expect(result.coinChange).toBe(-50);
    expect(runtime.state.coins).toBe(950);
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-ignore');
  });

  it('the successor\'s own effect applies when that card is resolved', () => {
    const runtime = createDemoRuntime();
    const start = getDemoTemplate('gym-story-start')!;

    const invest = pick(runtime, start, 'Invest').result.pushedCard!;
    const { result } = pick(runtime, invest, 'Celebrate');

    // Public Investment: +120 coins, then the terminal card is pushed.
    expect(result.coinChange).toBe(120);
    expect(runtime.state.coins).toBe(1070);
    expect(getBaseTypeId(result.pushedCard!.id)).toBe('gym-story-end');
  });

  it('a terminal option (Double down) ends the chain with no successor', () => {
    const runtime = createDemoRuntime();
    const invest = getDemoTemplate('gym-story-invest')!;

    const { result } = pick(runtime, invest, 'Double down');

    expect(result.pushedCard).toBeNull();
    expect(runtime.state.deck).toHaveLength(0);
    // Resolution still applies Public Investment's own effect (+120).
    expect(result.coinChange).toBe(120);
    expect(runtime.state.coins).toBe(1120);
  });

  it('the full happy path ends on the terminal New Beginning card', () => {
    const runtime = createDemoRuntime();

    const start = startDemo(runtime).card;
    const invest = pick(runtime, start, 'Invest').result.pushedCard!;
    const end = pick(runtime, invest, 'Celebrate').result.pushedCard!;
    expect(getBaseTypeId(end.id)).toBe('gym-story-end');

    const finalDraw = drawDemoCard(runtime.system, runtime.state, end);
    expect(finalDraw.finished).toBe(true);
    // 1000 - 50 (Town Meeting) + 120 (Public Investment), then +60 reputation.
    expect(runtime.state.coins).toBe(1070);
    expect(runtime.state.reputation).toBe(110);

    // The journal records the choice lines the scene renders.
    expect(runtime.state.activityLog.length).toBeGreaterThanOrEqual(3);
  });
});

describe('GymStorylineDemo — determinism', () => {
  it('replays identically from the same seed', () => {
    const play = () => {
      const runtime = createDemoRuntime();
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
    const first = optionLabels(createDemoRuntime(), getDemoTemplate('gym-story-start')!);
    const second = optionLabels(createDemoRuntime(), getDemoTemplate('gym-story-start')!);
    expect(first).toEqual(second);
    expect(first).toEqual(['Invest', 'Ignore']);
  });
});
