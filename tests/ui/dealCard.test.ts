/**
 * dealCard — motion-shaped tests.
 *
 * The deal flight is one continuous motion: a single tween drives a normalised
 * progress value across the whole duration and the card's transform is
 * evaluated from it on a single quadratic arc. These tests assert the
 * *motion* (continuity, no mid-flight stall, a single apex traversal,
 * endpoints, duration) rather than the retired two-tween, 40/60-split
 * implementation shape (CG-0MWC07OBB004YD5E).
 *
 * The tween is sampled deterministically: the recorded tween config drives a
 * plain `{ progress }` object, so the test sets that progress to the easing of
 * a sample time and invokes `onUpdate` — exactly what Phaser does each frame.
 *
 * @module tests/ui/dealCard.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dealCard,
  dealArcProfile,
  evaluateDealPath,
  DEFAULT_DEAL_DURATION,
  DEFAULT_DEAL_ARC_HEIGHT,
  DEFAULT_DEAL_EASE,
  DEAL_ARC_PEAK_PROGRESS,
  DEAL_MIN_INTERIOR_SPEED_RATIO,
  type DealCardOptions,
  type DealPathGeometry,
} from '../../src/ui/dealCard';
import { createMockScene, createMockSceneWithTweens } from '../helpers/MockFactory';

/** Number of samples used to drive a flight in the motion tests. */
const FLIGHT_SAMPLES = 200;

/** A target whose transform setters actually move it, so motion is observable. */
interface DrivenTarget {
  x: number;
  y: number;
  rotation: number;
  setPosition: (x: number, y: number) => DrivenTarget;
  setRotation: (r: number) => DrivenTarget;
}

function createDrivenTarget(x = 0, y = 0): DrivenTarget {
  const target: DrivenTarget = {
    x,
    y,
    rotation: 0,
    setPosition(px: number, py: number) {
      target.x = px;
      target.y = py;
      return target;
    },
    setRotation(r: number) {
      target.rotation = r;
      return target;
    },
  };
  return target;
}

type FlightSample = { s: number; x: number; y: number; rotation: number };

/** The tween config recorded by the mock scene for the flight. */
function flightConfig(scene: ReturnType<typeof createMockScene>) {
  return scene.tweensList[0] as Phaser.Types.Tweens.TweenBuilderConfig & {
    targets: { progress: number };
    onStart?: () => void;
    onUpdate?: () => void;
    onComplete?: () => void;
  };
}

/** Drive the recorded flight tween across `(0, 1)` and return its samples. */
function sampleFlight(
  scene: ReturnType<typeof createMockScene>,
  target: DrivenTarget,
  steps = FLIGHT_SAMPLES,
): FlightSample[] {
  const config = flightConfig(scene);
  const proxy = config.targets;
  const samples: FlightSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    // Phaser applies the tween's easing to the driven property; emulate that.
    proxy.progress = DEFAULT_DEAL_EASE(s);
    config.onUpdate?.();
    samples.push({ s, x: target.x, y: target.y, rotation: target.rotation });
  }
  return samples;
}

/** Euclidean distance between two consecutive flight samples. */
function stepLength(a: FlightSample, b: FlightSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Per-step travel speeds (index i is the step arriving at samples[i + 1]). */
function speeds(samples: FlightSample[]): { s: number; v: number }[] {
  const out: { s: number; v: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    out.push({ s: (samples[i].s + samples[i - 1].s) / 2, v: stepLength(samples[i - 1], samples[i]) });
  }
  return out;
}

function speedAt(list: { s: number; v: number }[], s: number, tolerance = 0.01): number {
  const hit = list.find((p) => Math.abs(p.s - s) <= tolerance);
  if (!hit) throw new Error(`no speed sample near s=${s}`);
  return hit.v;
}

let target: DrivenTarget;
let mockScene: ReturnType<typeof createMockScene>;
let mockGameEvents: { emit: ReturnType<typeof vi.fn> };

function baseOptions(overrides: Partial<DealCardOptions> = {}): DealCardOptions {
  return {
    scene: mockScene as unknown as Phaser.Scene,
    target: target as unknown as Phaser.GameObjects.Image,
    destX: 500,
    destY: 400,
    ...overrides,
  };
}

describe('dealCard', () => {
  beforeEach(() => {
    target = createDrivenTarget(50, 50);
    mockScene = createMockSceneWithTweens({}, { autoTweenComplete: false });
    mockGameEvents = { emit: vi.fn() };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ── Exported pacing knobs ────────────────────────────────────────────────

  describe('exported pacing knobs', () => {
    it('exports the documented default duration and arc height', () => {
      expect(DEFAULT_DEAL_DURATION).toBe(400);
      expect(DEFAULT_DEAL_ARC_HEIGHT).toBe(-50);
    });

    it('exports the arc peak progress and a documented non-zero-speed epsilon', () => {
      expect(DEAL_ARC_PEAK_PROGRESS).toBe(0.5);
      expect(DEAL_MIN_INTERIOR_SPEED_RATIO).toBeGreaterThan(0);
      expect(DEAL_MIN_INTERIOR_SPEED_RATIO).toBeLessThan(1);
    });

    it('exports a monotone sine ease-in-out default easing spanning 0 → 1', () => {
      expect(DEFAULT_DEAL_EASE(0)).toBe(0);
      expect(DEFAULT_DEAL_EASE(1)).toBe(1);
      expect(DEFAULT_DEAL_EASE(DEAL_ARC_PEAK_PROGRESS)).toBeCloseTo(0.5, 12);

      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const value = DEFAULT_DEAL_EASE(i / 100);
        expect(value).toBeGreaterThan(previous);
        previous = value;
      }
    });

    it('uses the exported default easing for the whole flight', () => {
      dealCard(baseOptions());
      expect(flightConfig(mockScene).ease).toBe(DEFAULT_DEAL_EASE);
    });

    it('passes a caller-supplied easing through unchanged (it now shapes the whole arc)', () => {
      dealCard(baseOptions({ ease: 'Cubic.easeOut' }));
      expect(flightConfig(mockScene).ease).toBe('Cubic.easeOut');
    });
  });

  // ── Single continuous flight ────────────────────────────────────────────

  describe('single continuous flight', () => {
    it('drives the whole flight with a single tween of the requested duration', () => {
      const tween = dealCard(baseOptions({ duration: 600 }));

      expect(mockScene.tweensList.length).toBe(1);
      const config = flightConfig(mockScene);
      expect(config.duration).toBe(600);
      expect(config.targets.progress).toBe(0);
      // The returned tween is the one driving the flight (cancellable by callers).
      expect(tween).toBe(mockScene.tweens.add.mock.results[0].value);
    });

    it('defaults the duration to DEFAULT_DEAL_DURATION', () => {
      dealCard(baseOptions());
      expect(flightConfig(mockScene).duration).toBe(DEFAULT_DEAL_DURATION);
    });

    it('never stalls or restarts its easing between launch and landing (AC1)', () => {
      dealCard(baseOptions({ sourceX: 900, sourceY: 80, destX: 300, destY: 600 }));

      const steps = speeds(sampleFlight(mockScene, target));
      const peak = Math.max(...steps.map((p) => p.v));

      // Every interior sample keeps moving: no zero-velocity stall at the arc peak.
      const interior = steps.filter((p) => p.s > 0.05 && p.s < 0.95);
      expect(interior.length).toBeGreaterThan(150);
      for (const sample of interior) {
        expect(sample.v).toBeGreaterThanOrEqual(DEAL_MIN_INTERIOR_SPEED_RATIO * peak);
      }

      // The motion accelerates to one mid-flight peak and then decelerates —
      // a single speed hump, so the easing never restarts part-way through.
      let localMaxima = 0;
      for (let i = 1; i < steps.length - 1; i++) {
        if (steps[i].v > steps[i - 1].v && steps[i].v >= steps[i + 1].v) localMaxima++;
      }
      expect(localMaxima).toBe(1);

      // The fastest moment is the arc peak, not a phase boundary near either end.
      expect(speedAt(steps, 0.5, 0.02)).toBeGreaterThan(peak * 0.9);
      expect(speedAt(steps, 0.5, 0.02)).toBeGreaterThan(speedAt(steps, 0.25, 0.02));
      expect(speedAt(steps, 0.5, 0.02)).toBeGreaterThan(speedAt(steps, 0.75, 0.02));
    });

    it('never reverses or dwells along the path (AC2)', () => {
      const startX = 900;
      const startY = 80;
      const destX = 300;
      const destY = 600;
      dealCard(baseOptions({ sourceX: startX, sourceY: startY, destX, destY }));

      const samples = sampleFlight(mockScene, target, 100);
      const chordX = destX - startX;
      const chordY = destY - startY;
      const chordLength = Math.hypot(chordX, chordY);

      // Progress along the chord must strictly increase: no backtracking, no dwell.
      for (let i = 1; i < samples.length; i++) {
        const prev =
          ((samples[i - 1].x - startX) * chordX + (samples[i - 1].y - startY) * chordY) / chordLength;
        const current =
          ((samples[i].x - startX) * chordX + (samples[i].y - startY) * chordY) / chordLength;
        expect(current).toBeGreaterThan(prev);
      }
    });
  });

  // ── One arc, one apex traversal ─────────────────────────────────────────

  describe('single arc geometry', () => {
    const geometry: DealPathGeometry = {
      startX: 900,
      startY: 80,
      destX: 300,
      destY: 600,
      arcHeight: DEFAULT_DEAL_ARC_HEIGHT,
      rotation: 0,
    };

    /** Signed perpendicular offset of a point from the source→destination chord. */
    function chordOffset(p: { x: number; y: number }, g: DealPathGeometry): number {
      const chordX = g.destX - g.startX;
      const chordY = g.destY - g.startY;
      const length = Math.hypot(chordX, chordY);
      return ((p.x - g.startX) * -chordY + (p.y - g.startY) * chordX) / length;
    }

    it('crosses its arc apex exactly once with no dwell (AC2)', () => {
      const n = 400;
      const offsets: number[] = [];
      for (let i = 0; i <= n; i++) {
        offsets.push(chordOffset(evaluateDealPath(geometry, i / n), geometry));
      }

      // The arc leaves the chord, bulges once and returns: no second excursion.
      expect(offsets[0]).toBeCloseTo(0, 9);
      expect(offsets[n]).toBeCloseTo(0, 9);

      const peakIndex = offsets.indexOf(Math.max(...offsets));
      expect(peakIndex).toBe(n / 2);
      // The arc's vertical lift is `arcHeight`; the perpendicular distance to
      // the chord is that lift projected onto the chord's normal.
      const chordLength = Math.hypot(geometry.destX - geometry.startX, geometry.destY - geometry.startY);
      const expectedBulge =
        (Math.abs(DEFAULT_DEAL_ARC_HEIGHT) * Math.abs(geometry.destX - geometry.startX)) / chordLength;
      expect(offsets[peakIndex]).toBeCloseTo(expectedBulge, 9);

      // The bulge's rate changes sign exactly once — up to the apex, down after.
      let signChanges = 0;
      let previousSign = 0;
      for (let i = 1; i < offsets.length; i++) {
        const delta = offsets[i] - offsets[i - 1];
        if (Math.abs(delta) < 1e-12) continue;
        const sign = Math.sign(delta);
        if (previousSign !== 0 && sign !== previousSign) signChanges++;
        previousSign = sign;
      }
      expect(signChanges).toBe(1);
      expect(Math.max(...offsets.slice(0, peakIndex))).toBeLessThan(offsets[peakIndex]);
      expect(Math.max(...offsets.slice(peakIndex + 1))).toBeLessThan(offsets[peakIndex]);
    });

    it('is continuous: consecutive path steps stay within the arc Lipschitz bound (AC2)', () => {
      const n = 1000;
      const bound =
        (Math.abs(geometry.destX - geometry.startX) +
          Math.abs(geometry.destY - geometry.startY) +
          4 * Math.abs(geometry.arcHeight)) /
        n;

      let previous = evaluateDealPath(geometry, 0);
      let maxStep = 0;
      for (let i = 1; i <= n; i++) {
        const current = evaluateDealPath(geometry, i / n);
        const step = Math.hypot(current.x - previous.x, current.y - previous.y);
        maxStep = Math.max(maxStep, step);
        expect(step).toBeLessThanOrEqual(bound * (1 + 1e-9));
        previous = current;
      }
      expect(maxStep).toBeGreaterThan(0);
    });

    it('arc peak profile runs 0 → 1 → 0 with a single maximum', () => {
      expect(dealArcProfile(0)).toBe(0);
      expect(dealArcProfile(DEAL_ARC_PEAK_PROGRESS)).toBeCloseTo(1, 12);
      expect(dealArcProfile(1)).toBe(0);

      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const value = dealArcProfile(i / 100);
        if (i / 100 <= DEAL_ARC_PEAK_PROGRESS) expect(value).toBeGreaterThan(previous);
        previous = value;
      }
    });

    it('honours the arcHeight option at the arc peak', () => {
      dealCard(baseOptions({ sourceX: 50, sourceY: 50, destX: 500, destY: 400, arcHeight: -100 }));

      const samples = sampleFlight(mockScene, target);
      const apex = samples.find((s) => Math.abs(s.s - DEAL_ARC_PEAK_PROGRESS) < 1e-9)!;
      expect(apex.y).toBeCloseTo((50 + 400) / 2 - 100, 9);
    });

    it('treats an explicitly undefined arcHeight as absent (uses the default)', () => {
      dealCard({
        ...baseOptions({ sourceX: 50, sourceY: 50, destX: 500, destY: 400 }),
        arcHeight: undefined,
      });

      const samples = sampleFlight(mockScene, target);
      const apex = samples.find((s) => Math.abs(s.s - DEAL_ARC_PEAK_PROGRESS) < 1e-9)!;
      expect(apex.y).toBeCloseTo((50 + 400) / 2 + DEFAULT_DEAL_ARC_HEIGHT, 9);
    });

    it('flies a straight line when arcHeight is 0', () => {
      const straight: DealPathGeometry = { ...geometry, arcHeight: 0 };
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const point = evaluateDealPath(straight, t);
        expect(point.x).toBeCloseTo(straight.startX + (straight.destX - straight.startX) * t, 9);
        expect(point.y).toBeCloseTo(straight.startY + (straight.destY - straight.startY) * t, 9);
      }
    });

    it('drives rotation from the same progress: 0 → peak → 0 with a single maximum', () => {
      const rotation = 0.3;
      dealCard(baseOptions({ rotation }));

      const samples = sampleFlight(mockScene, target);
      expect(samples[0].rotation).toBe(0);
      expect(samples[samples.length - 1].rotation).toBe(0);

      const apex = samples.find((s) => Math.abs(s.s - DEAL_ARC_PEAK_PROGRESS) < 1e-9)!;
      expect(apex.rotation).toBeCloseTo(rotation, 9);
      expect(Math.max(...samples.map((s) => s.rotation))).toBeCloseTo(rotation, 9);
    });
  });

  // ── Endpoints, duration and event contract ─────────────────────────────

  describe('endpoints and event contract', () => {
    it('starts at the given source and lands exactly on the destination', () => {
      const tween = dealCard(baseOptions({ sourceX: 100, sourceY: 120, destX: 700, destY: 500 }));
      expect(tween).toBeDefined();

      expect(target.x).toBe(100);
      expect(target.y).toBe(120);
      expect(target.rotation).toBe(0);

      const samples = sampleFlight(mockScene, target);
      expect(samples[0]).toMatchObject({ x: 100, y: 120, rotation: 0 });
      expect(samples[samples.length - 1].x).toBeCloseTo(700, 9);
      expect(samples[samples.length - 1].y).toBeCloseTo(500, 9);
    });

    it("defaults the source to the target's current position", () => {
      target = createDrivenTarget(321, 234);
      dealCard(baseOptions({ destX: 700, destY: 500 }));

      expect(target.x).toBe(321);
      expect(target.y).toBe(234);
    });

    it('pins the card exactly on the destination when the flight completes', () => {
      dealCard(baseOptions({ sourceX: 100, sourceY: 120, destX: 700, destY: 500 }));

      const config = flightConfig(mockScene);
      config.targets.progress = DEFAULT_DEAL_EASE(0.9);
      config.onUpdate?.();
      expect(target.x).not.toBe(700);

      config.onComplete?.();
      expect(target.x).toBe(700);
      expect(target.y).toBe(500);
      expect(target.rotation).toBe(0);
    });

    it('emits card:dealt with the card id and player index on completion', () => {
      dealCard(
        baseOptions({
          gameEvents: mockGameEvents as never,
          cardId: 'test-card-1',
          playerIndex: 0,
        }),
      );

      const config = flightConfig(mockScene);
      expect(mockGameEvents.emit).not.toHaveBeenCalled();
      config.onComplete?.();
      expect(mockGameEvents.emit).toHaveBeenCalledWith('card:dealt', {
        cardId: 'test-card-1',
        playerIndex: 0,
      });
    });
  });

  // ── SFX beats ──────────────────────────────────────────────────────────

  describe('SFX beats', () => {
    it('plays the start beat, the interval move beats and the end beat', () => {
      vi.useFakeTimers();
      const soundManager = { play: vi.fn() };
      dealCard(
        baseOptions({
          soundManager: soundManager as never,
          sfx: { start: 'sfx-start', move: 'sfx-move', end: 'sfx-end', moveIntervalMs: 100 },
        }),
      );

      const config = flightConfig(mockScene);
      config.onStart?.();
      expect(soundManager.play.mock.calls.map((c) => c[0])).toEqual(['sfx-start', 'sfx-move']);

      vi.advanceTimersByTime(150);
      config.onUpdate?.();
      expect(soundManager.play).toHaveBeenLastCalledWith('sfx-move');

      const callsBeforeComplete = soundManager.play.mock.calls.length;
      config.onComplete?.();
      expect(soundManager.play).toHaveBeenLastCalledWith('sfx-end');
      expect(soundManager.play.mock.calls.length).toBe(callsBeforeComplete + 1);
    });

    it('starts and stops a looping move beat around the flight', () => {
      const loopSound = { play: vi.fn(), stop: vi.fn() };
      (mockScene.sound.add as ReturnType<typeof vi.fn>).mockReturnValue(loopSound);

      dealCard(baseOptions({ sfx: { move: 'sfx-move', moveLoop: true } }));

      const config = flightConfig(mockScene);
      config.onStart?.();
      expect(mockScene.sound.add).toHaveBeenCalledWith('sfx-move', { loop: true });
      expect(loopSound.play).toHaveBeenCalledTimes(1);

      config.onComplete?.();
      expect(loopSound.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ── Reduced motion ─────────────────────────────────────────────────────

  describe('reduced motion', () => {
    it('snaps to the destination, plays no SFX and returns a 50 ms stub tween', () => {
      const soundManager = { play: vi.fn() };
      const tween = dealCard(
        baseOptions({
          sourceX: 10,
          sourceY: 20,
          destX: 700,
          destY: 500,
          reducedMotion: true,
          soundManager: soundManager as never,
          sfx: { start: 'sfx-start', move: 'sfx-move', end: 'sfx-end' },
          gameEvents: mockGameEvents as never,
          cardId: 'snap-card',
        }),
      );

      // Instant snap — the card is already at its destination.
      expect(target.x).toBe(700);
      expect(target.y).toBe(500);
      // No SFX from this helper in the reduced-motion branch.
      expect(soundManager.play).not.toHaveBeenCalled();
      // Completion is still signalled.
      expect(mockGameEvents.emit).toHaveBeenCalledWith('card:dealt', {
        cardId: 'snap-card',
        playerIndex: undefined,
      });
      // The stub tween keeps the historical 50 ms duration.
      expect(mockScene.tweensList.length).toBe(1);
      expect(mockScene.tweensList[0].duration).toBe(50);
      expect(tween).toBe(mockScene.tweens.add.mock.results[0].value);
    });
  });
});
