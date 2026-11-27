/**
 * Unit tests for the scene-exit presentation planner
 * (`src/ui/scene-exit-presentation.ts`, CG-0MWZCKY1W008JV83).
 *
 * Everything here runs in a plain Node environment: the planner is pure and
 * Phaser-free, so the step order, the reduced-motion collapse, the default
 * dwell times and the input validation are all asserted without a scene, a
 * timer or a browser. The rendered presentation is covered separately by the
 * browser suite.
 */

import { describe, expect, it } from 'vitest';
import {
  SCENE_EXIT_AUTO_ADVANCE_MS,
  SCENE_EXIT_STEP_MS,
  SCENE_EXIT_TEXT_SEPARATOR,
  planSceneExitPresentation,
  type SceneExitPlan,
  type SceneExitPlanOptions,
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
