/**
 * Unit tests for the scene-exit presentation planner and SFX resolver
 * (`src/ui/scene-exit-presentation.ts`; planner CG-0MWZCKY1W008JV83, SFX
 * resolver CG-0MWZCLIBF000SU2U).
 *
 * Everything here runs in a plain Node environment: both the planner and the
 * SFX resolver are pure and Phaser-free, so the step order, the reduced-motion
 * collapse, the default dwell times, the SFX mapping and the total (never
 * throwing) playback wrapper are asserted without a scene, a timer or a
 * browser. The rendered presentation is covered separately by the browser
 * suite.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  COMMON_SFX_KEYS,
  type CommonSfxKey,
} from '../../src/core-engine/SoundManager';
import {
  SCENE_EXIT_ACT_CLOSED_SFX,
  SCENE_EXIT_AUTO_ADVANCE_MS,
  SCENE_EXIT_SCENE_CLOSED_SFX,
  SCENE_EXIT_STEP_MS,
  SCENE_EXIT_TEXT_SEPARATOR,
  playSceneExitSfx,
  planSceneExitPresentation,
  resolveSceneExitSfxKey,
  type SceneExitPlan,
  type SceneExitPlanOptions,
  type SceneExitSoundPlayer,
  type SceneExitStepKey,
} from '../../src/ui/scene-exit-presentation';

const baseOptions: SceneExitPlanOptions = {
  actTitle: 'Act I',
  sceneTitle: 'The Arrival',
  outcome: 'success',
  route: 'The road south',
};

/** Call the planner with deliberately malformed input from a test. */
function planWith(options: unknown): SceneExitPlan {
  return planSceneExitPresentation(options as SceneExitPlanOptions);
}

describe('planSceneExitPresentation', () => {
  describe('step ordering (AC1)', () => {
    it('returns title -> outcome -> route, with no interleaving or duplicates', () => {
      const plan = planSceneExitPresentation(baseOptions);
      const keys = plan.steps.map((step) => step.key);

      expect(keys).toEqual<SceneExitStepKey[]>(['title', 'outcome', 'route']);
      expect(new Set(keys).size).toBe(keys.length);
      expect(plan.steps).toHaveLength(3);
    });

    it('ends on the route, so the last thing read is where the story goes next', () => {
      const plan = planSceneExitPresentation(baseOptions);
      const last = plan.steps[plan.steps.length - 1];

      expect(last?.key).toBe('route');
      expect(last?.text).toBe(baseOptions.route);
    });

    it('carries the act and scene title in the title step and the word in the outcome step', () => {
      const plan = planSceneExitPresentation(baseOptions);

      expect(plan.steps[0]?.text).toBe(
        `Act I${SCENE_EXIT_TEXT_SEPARATOR}The Arrival`,
      );
      expect(plan.steps[1]?.text).toBe('success');
      expect(plan.steps[1]?.key).toBe('outcome');
    });

    it('presents the act alone when the optional scene title is absent', () => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        sceneTitle: undefined,
      });

      expect(plan.steps[0]?.text).toBe('Act I');
      expect(plan.steps).toHaveLength(3);
      expect(plan.instant).toBe(false);
    });

    it('normalises surrounding whitespace so the printed text is exact', () => {
      const plan = planSceneExitPresentation({
        actTitle: '  Act II  ',
        sceneTitle: '   ',
        outcome: 'partial',
        route: '  The harbour  ',
      });

      expect(plan.steps[0]?.text).toBe('Act II');
      expect(plan.steps[1]?.text).toBe('partial');
      expect(plan.steps[2]?.text).toBe('The harbour');
    });
  });

  describe('reduced motion (AC2)', () => {
    it('collapses to a single instant step merging all four fields', () => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        reducedMotion: true,
      });

      expect(plan.instant).toBe(true);
      expect(plan.steps).toHaveLength(1);

      const [step] = plan.steps;
      expect(step?.text).toContain(baseOptions.actTitle);
      expect(step?.text).toContain(baseOptions.sceneTitle as string);
      expect(step?.text).toContain(baseOptions.outcome);
      expect(step?.text).toContain(baseOptions.route);
    });

    it('is instant with zero durations, so no timer is implied', () => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        reducedMotion: true,
        stepMs: 400,
        autoAdvanceMs: 1000,
      });

      expect(plan.totalMs).toBe(0);
      expect(plan.stepMs).toBe(0);
      expect(plan.steps[0]?.ms).toBe(0);
      // Dismissal dwell is still reported for the caller that auto-advances.
      expect(plan.autoAdvanceMs).toBe(1000);
    });

    it('never repeats a field: the merged step contains each entry once', () => {
      const plan = planSceneExitPresentation({
        actTitle: 'Act III',
        sceneTitle: 'The Crossing',
        outcome: 'failure',
        route: 'The long erasure',
        reducedMotion: true,
      });
      const text = plan.steps[0]?.text as string;

      for (const field of [
        'Act III',
        'The Crossing',
        'failure',
        'The long erasure',
      ]) {
        expect(text.split(field)).toHaveLength(2);
      }
    });
  });

  describe('timing (AC3, AC4)', () => {
    it('uses 1200ms per step and 3000ms auto-advance by default', () => {
      const plan = planSceneExitPresentation(baseOptions);

      expect(plan.stepMs).toBe(SCENE_EXIT_STEP_MS);
      expect(SCENE_EXIT_STEP_MS).toBe(1200);
      expect(plan.autoAdvanceMs).toBe(SCENE_EXIT_AUTO_ADVANCE_MS);
      expect(SCENE_EXIT_AUTO_ADVANCE_MS).toBe(3000);
      expect(plan.steps.map((step) => step.ms)).toEqual([1200, 1200, 1200]);
    });

    it('reports totalMs as the sum of every step duration', () => {
      const plan = planSceneExitPresentation(baseOptions);
      const sum = plan.steps.reduce((total, step) => total + step.ms, 0);

      expect(plan.totalMs).toBe(sum);
      expect(plan.totalMs).toBe(3600);
    });

    it('honours explicit stepMs/autoAdvanceMs overrides', () => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        stepMs: 500,
        autoAdvanceMs: 750,
      });

      expect(plan.stepMs).toBe(500);
      expect(plan.autoAdvanceMs).toBe(750);
      expect(plan.steps.map((step) => step.ms)).toEqual([500, 500, 500]);
      expect(plan.totalMs).toBe(1500);
    });

    it('rounds fractional durations so no timer receives a fraction', () => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        stepMs: 1000.6,
        autoAdvanceMs: 2999.5,
      });

      expect(plan.stepMs).toBe(1001);
      expect(plan.autoAdvanceMs).toBe(3000);
      expect(plan.totalMs).toBe(3003);
    });

    it.each([
      ['0', 0],
      ['negative', -250],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('falls back to the default stepMs for a %s override', (_label, value) => {
      const plan = planSceneExitPresentation({
        ...baseOptions,
        stepMs: value,
        autoAdvanceMs: value,
      });

      expect(plan.stepMs).toBe(SCENE_EXIT_STEP_MS);
      expect(plan.autoAdvanceMs).toBe(SCENE_EXIT_AUTO_ADVANCE_MS);
      expect(plan.totalMs).toBe(SCENE_EXIT_STEP_MS * 3);
    });

    it('is not instant when reduced motion is false or omitted', () => {
      expect(planSceneExitPresentation(baseOptions).instant).toBe(false);
      expect(
        planSceneExitPresentation({ ...baseOptions, reducedMotion: false })
          .instant,
      ).toBe(false);
      expect(
        planSceneExitPresentation({ ...baseOptions, reducedMotion: true })
          .instant,
      ).toBe(true);
    });
  });

  describe('input validation (AC5)', () => {
    it('rejects a missing options object', () => {
      expect(() => planWith(undefined)).toThrow(TypeError);
      expect(() => planWith(null)).toThrow(/options must be an object/);
    });

    it.each([
      ['actTitle', { ...baseOptions, actTitle: '   ' }],
      ['actTitle', { ...baseOptions, actTitle: undefined }],
      ['route', { ...baseOptions, route: '' }],
      ['route', { ...baseOptions, route: 42 }],
    ])('rejects blank or non-string %s', (field, options) => {
      expect(() => planWith(options)).toThrow(TypeError);
      expect(() => planWith(options)).toThrow(new RegExp(`\`${field}\``));
    });

    it.each(['won', 'SUCCESS', '', undefined, null, 1])(
      'rejects an unknown outcome word (%s) rather than inventing one',
      (outcome) => {
        expect(() =>
          planWith({ ...baseOptions, outcome }),
        ).toThrow(/`outcome` must be one of/);
      },
    );

    it.each(['success', 'partial', 'failure'] as const)(
      'accepts the %s outcome word verbatim',
      (outcome) => {
        const plan = planSceneExitPresentation({ ...baseOptions, outcome });

        expect(plan.steps[1]?.text).toBe(outcome);
      },
    );

    it('treats a non-string scene title as absent instead of printing it', () => {
      const plan = planWith({ ...baseOptions, sceneTitle: 7 });

      expect(plan.steps[0]?.text).toBe('Act I');
    });
  });

  describe('purity (AC5)', () => {
    it('is deterministic: the same options always produce the same plan', () => {
      const first = planSceneExitPresentation(baseOptions);
      const second = planSceneExitPresentation(baseOptions);

      expect(second).toEqual(first);
      expect(second).not.toBe(first);
    });

    it('does not mutate the caller’s (frozen) options object', () => {
      const options = Object.freeze({ ...baseOptions });
      const snapshot = { ...options };

      planSceneExitPresentation(options);

      expect(options).toEqual(snapshot);
    });

    it('returns fresh step objects, so a caller cannot corrupt later plans', () => {
      const first = planSceneExitPresentation(baseOptions);
      (first.steps[0] as { text: string }).text = 'mutated';

      expect(planSceneExitPresentation(baseOptions).steps[0]?.text).not.toBe(
        'mutated',
      );
    });
  });
});

describe('resolveSceneExitSfxKey', () => {
  const sharedKeys: readonly string[] = Object.values(COMMON_SFX_KEYS);

  it('plays ROUND_END when the act closes (AC1)', () => {
    const key = resolveSceneExitSfxKey({ actClosed: true });

    expect(key).toBe(COMMON_SFX_KEYS.ROUND_END);
    expect(key).toBe(SCENE_EXIT_ACT_CLOSED_SFX);
    expect(key).toBe('sfx-round-end');
  });

  it('plays TURN_CHANGE for a scene close within an act (AC2)', () => {
    expect(resolveSceneExitSfxKey({ actClosed: false })).toBe(
      COMMON_SFX_KEYS.TURN_CHANGE,
    );
    expect(resolveSceneExitSfxKey({})).toBe(COMMON_SFX_KEYS.TURN_CHANGE);
    expect(resolveSceneExitSfxKey()).toBe(COMMON_SFX_KEYS.TURN_CHANGE);
    expect(resolveSceneExitSfxKey(null)).toBe(COMMON_SFX_KEYS.TURN_CHANGE);
    expect(SCENE_EXIT_SCENE_CLOSED_SFX).toBe('sfx-turn-change');
  });

  it('selects the act key only for a strict `true`, so odd values stay on the scene key', () => {
    for (const actClosed of [undefined, false, 0, 1, 'true', {}]) {
      expect(
        resolveSceneExitSfxKey({
          actClosed: actClosed as unknown as boolean,
        }),
      ).toBe(COMMON_SFX_KEYS.TURN_CHANGE);
    }
  });

  it('returns null when muted, whichever stage is closing (AC3)', () => {
    expect(resolveSceneExitSfxKey({ actClosed: true, mute: true })).toBeNull();
    expect(resolveSceneExitSfxKey({ actClosed: false, mute: true })).toBeNull();
    expect(resolveSceneExitSfxKey({ mute: true })).toBeNull();
  });

  it('lets mute win over an explicit shared-key override', () => {
    expect(
      resolveSceneExitSfxKey({
        actClosed: true,
        mute: true,
        sfx: COMMON_SFX_KEYS.SCORE_REVEAL,
      }),
    ).toBeNull();
  });

  it('treats an explicit `sfx: null` as a request for silence', () => {
    expect(resolveSceneExitSfxKey({ actClosed: true, sfx: null })).toBeNull();
    expect(resolveSceneExitSfxKey({ sfx: null })).toBeNull();
  });

  it('honours an explicit shared-key override', () => {
    expect(
      resolveSceneExitSfxKey({
        actClosed: true,
        sfx: COMMON_SFX_KEYS.UI_CLICK,
      }),
    ).toBe(COMMON_SFX_KEYS.UI_CLICK);
    expect(resolveSceneExitSfxKey({ sfx: SCENE_EXIT_ACT_CLOSED_SFX })).toBe(
      COMMON_SFX_KEYS.ROUND_END,
    );
  });

  it.each(['sfx-game-scoped-bell', 'sfx-act-close', '', 'ROUND_END'])(
    'falls back to the stage key for the unknown/game-scoped string %j (AC4)',
    (sfx) => {
      expect(resolveSceneExitSfxKey({ actClosed: true, sfx })).toBe(
        COMMON_SFX_KEYS.ROUND_END,
      );
      expect(resolveSceneExitSfxKey({ actClosed: false, sfx })).toBe(
        COMMON_SFX_KEYS.TURN_CHANGE,
      );
    },
  );

  it('never returns more than one key, and always a shared key or null', () => {
    const selections = [
      resolveSceneExitSfxKey({ actClosed: true }),
      resolveSceneExitSfxKey({ actClosed: false }),
      resolveSceneExitSfxKey({ sfx: COMMON_SFX_KEYS.CARD_SWAP }),
      resolveSceneExitSfxKey({ sfx: 'sfx-game-scoped-bell' }),
      resolveSceneExitSfxKey({ mute: true }),
      resolveSceneExitSfxKey({ sfx: null }),
    ];

    for (const key of selections) {
      expect(key === null || sharedKeys.includes(key)).toBe(true);
      expect(Array.isArray(key)).toBe(false);
    }
  });

  it('is deterministic and does not mutate the caller’s (frozen) options', () => {
    const options = Object.freeze({
      actClosed: true,
      sfx: 'sfx-game-scoped-bell',
    });
    const snapshot = { ...options };

    expect(resolveSceneExitSfxKey(options)).toBe(
      resolveSceneExitSfxKey(options),
    );
    expect(options).toEqual(snapshot);
  });
});

describe('playSceneExitSfx', () => {
  function fakePlayer(result?: boolean | void) {
    const play = vi.fn((_key: string) => result);
    return { player: { play } as SceneExitSoundPlayer, play };
  }

  it('plays the resolved key through the injected backend', () => {
    const { player, play } = fakePlayer();
    const key = resolveSceneExitSfxKey({ actClosed: true }) as CommonSfxKey;

    expect(playSceneExitSfx(player, key)).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ROUND_END);
  });

  it('is a no-op for a silent key, so a muted exit never plays anything', () => {
    const { player, play } = fakePlayer();

    expect(playSceneExitSfx(player, null)).toBe(false);
    expect(playSceneExitSfx(player, undefined)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it('never throws without a backend (AC5)', () => {
    const key = resolveSceneExitSfxKey({ actClosed: true });

    expect(() => playSceneExitSfx(null, key)).not.toThrow();
    expect(() => playSceneExitSfx(undefined, key)).not.toThrow();
    expect(playSceneExitSfx(null, key)).toBe(false);
    expect(playSceneExitSfx(undefined, key)).toBe(false);
  });

  it('treats a backend without a usable play method as unavailable', () => {
    const bare = {} as SceneExitSoundPlayer;

    expect(playSceneExitSfx(bare, COMMON_SFX_KEYS.ROUND_END)).toBe(false);
    expect(
      playSceneExitSfx(
        { play: 42 } as unknown as SceneExitSoundPlayer,
        COMMON_SFX_KEYS.ROUND_END,
      ),
    ).toBe(false);
  });

  it('reports an unplayable key (backend returns false) without throwing', () => {
    const { player } = fakePlayer(false);

    expect(playSceneExitSfx(player, COMMON_SFX_KEYS.TURN_CHANGE)).toBe(false);
  });

  it.each([true, undefined])(
    'treats a %s result as accepted playback',
    (result) => {
      const { player } = fakePlayer(result as boolean | undefined);

      expect(playSceneExitSfx(player, COMMON_SFX_KEYS.TURN_CHANGE)).toBe(true);
    },
  );

  it('swallows a throwing backend so the presentation is never blocked (AC5)', () => {
    const throwing: SceneExitSoundPlayer = {
      play: () => {
        throw new Error('missing audio key');
      },
    };
    const key = resolveSceneExitSfxKey({ actClosed: true });

    expect(() => playSceneExitSfx(throwing, key)).not.toThrow();
    expect(playSceneExitSfx(throwing, key)).toBe(false);
  });

  it('leaves the textual channel unconditional when audio fails', () => {
    const throwing: SceneExitSoundPlayer = {
      play: () => {
        throw new Error('backend exploded');
      },
    };
    const plan = planSceneExitPresentation(baseOptions);

    playSceneExitSfx(throwing, resolveSceneExitSfxKey({ actClosed: true }));

    expect(plan.steps.map((step) => step.text)).toEqual([
      `Act I${SCENE_EXIT_TEXT_SEPARATOR}The Arrival`,
      'success',
      'The road south',
    ]);
  });
});
