/**
 * Unit tests for TheRisingAnimator (F4, AC5).
 *
 * The core movement helpers and the audio helpers are mocked so the animator's
 * own contract can be asserted in Node: it forwards reduced-motion, wires the
 * shared SFX keys, and provides a graceful reduced-motion reject path. These
 * are behavioural assertions on the public API, not source greps.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  dealCard: vi.fn((_opts: Record<string, unknown>) => ({ stop: vi.fn() })),
  placeCard: vi.fn((_opts: Record<string, unknown>) => ({ stop: vi.fn() })),
  shakeIllegalMove: vi.fn((_opts: Record<string, unknown>) => undefined),
  safePlaySound: vi.fn(),
}));

vi.mock('@ui', () => ({
  dealCard: mocks.dealCard,
  placeCard: mocks.placeCard,
  shakeIllegalMove: mocks.shakeIllegalMove,
}));

vi.mock('@core-engine', () => ({
  safePlaySound: mocks.safePlaySound,
}));

import {
  RISING_ANIM_DURATION,
  TheRisingAnimator,
} from '../../src/scenes/TheRisingAnimator';
import { THERISING_SFX_KEYS } from '../../src/scenes/TheRisingConstants';
import type { SoundManager } from '../../src/core-engine/SoundManager';

interface FakeScene {
  time: { delayedCall: ReturnType<typeof vi.fn> };
}

function makeScene(): FakeScene {
  return { time: { delayedCall: vi.fn() } };
}

function makeSoundManager(): SoundManager {
  return { play: vi.fn() } as unknown as SoundManager;
}

describe('TheRisingAnimator', () => {
  beforeEach(() => {
    mocks.dealCard.mockClear();
    mocks.placeCard.mockClear();
    mocks.shakeIllegalMove.mockClear();
    mocks.safePlaySound.mockClear();
  });

  it('deals from the market through dealCard with the shared SFX keys', () => {
    const scene = makeScene();
    const animator = new TheRisingAnimator(scene as never, null);
    const target = { x: 0, y: 0 } as never;

    animator.dealFromMarket({
      target,
      source: { x: 10, y: 20 },
      destination: { x: 100, y: 200 },
    });

    expect(mocks.dealCard).toHaveBeenCalledTimes(1);
    const options = mocks.dealCard.mock.calls[0][0];
    expect(options.sourceX).toBe(10);
    expect(options.sourceY).toBe(20);
    expect(options.destX).toBe(100);
    expect(options.destY).toBe(200);
    expect((options.sfx as Record<string, string>).start).toBe(THERISING_SFX_KEYS.SPIRIT_DEAL);
    expect((options.sfx as Record<string, string>).end).toBe(THERISING_SFX_KEYS.SPIRIT_REVEAL);
    expect(options.reducedMotion).toBe(false);
  });

  it('forwards reduced motion to the movement helpers', () => {
    const scene = makeScene();
    const animator = new TheRisingAnimator(scene as never, null);
    animator.reducedMotion = true;

    animator.dealFromMarket({
      target: {} as never,
      source: { x: 0, y: 0 },
      destination: { x: 1, y: 1 },
    });
    animator.placeOnTimeline({
      target: {} as never,
      destination: { x: 2, y: 2 },
    });

    expect(mocks.dealCard.mock.calls[0][0].reducedMotion).toBe(true);
    expect(mocks.placeCard.mock.calls[0][0].reducedMotion).toBe(true);
  });

  it('schedules a completion callback after the deal animation duration', () => {
    const scene = makeScene();
    const animator = new TheRisingAnimator(scene as never, null);
    const onComplete = vi.fn();

    animator.dealFromMarket({
      target: {} as never,
      source: { x: 0, y: 0 },
      destination: { x: 1, y: 1 },
      onComplete,
    });

    expect(scene.time.delayedCall).toHaveBeenCalledWith(RISING_ANIM_DURATION, onComplete);
  });

  it('plays the illegal-move SFX without shaking under reduced motion', () => {
    const scene = makeScene();
    const soundManager = makeSoundManager();
    const animator = new TheRisingAnimator(scene as never, soundManager);
    animator.reducedMotion = true;
    const onComplete = vi.fn();

    animator.rejectPlacement(null, onComplete);

    expect(soundManager.play).toHaveBeenCalledWith(THERISING_SFX_KEYS.ILLEGAL_MOVE);
    expect(mocks.shakeIllegalMove).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('delegates rejection feedback to shakeIllegalMove when motion is allowed', () => {
    const scene = makeScene();
    const animator = new TheRisingAnimator(scene as never, null);
    const onComplete = vi.fn();

    animator.rejectPlacement({} as never, onComplete);

    expect(mocks.shakeIllegalMove).toHaveBeenCalledTimes(1);
    const options = mocks.shakeIllegalMove.mock.calls[0][0];
    expect(options.soundKey).toBe(THERISING_SFX_KEYS.ILLEGAL_MOVE);
    expect(options.onComplete).toBe(onComplete);
  });
});
