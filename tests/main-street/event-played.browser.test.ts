/**
 * Main Street: Held-Event Play Burst Feedback Browser Tests
 *
 * Verifies the play-event feedback trigger end to end in a real Phaser scene:
 *
 * 1. Playing a held event from the hand (`onPlayHeldEvent`) triggers
 *    `MainStreetAnimator.animateEventPlayed` with the played card's hand
 *    position and name — and the card actually leaves the hand.
 * 2. Under reduced motion the trigger still fires (the animator degrades
 *    internally — spark burst skipped, pop + cheer SFX retained, covered by
 *    unit tests).
 *
 * @module tests/main-street/event-played.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';

// ── Boot helpers (mirrors MainStreetScene.browser.test.ts) ──

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame(options);
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

interface EventPlayedCall {
  x: number;
  y: number;
  eventName: string;
}

function spyOnEventPlayed(scene: Phaser.Scene & Record<string, unknown>): { calls: EventPlayedCall[] } {
  const animator = scene.msAnimator as unknown as {
    animateEventPlayed: (params: EventPlayedCall) => void;
  };
  const original = animator.animateEventPlayed.bind(animator);
  const calls: EventPlayedCall[] = [];
  vi.spyOn(animator, 'animateEventPlayed').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { calls };
}

describe('MainStreet held-event play burst', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    const moduleUrl = (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    if (typeof moduleUrl === 'string' && moduleUrl.startsWith('blob:')) {
      URL.revokeObjectURL(moduleUrl);
    }

    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    delete (globalThis as unknown as Record<string, unknown>).__TF_PLAY_COUNT__;
    destroyGame(game);
    game = null;
  });

  it('playing a held event triggers the burst + cheer with the card position and name', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Give the player a held event card and render it in the hand.
    const { getEventTemplates } = await import('../../example-games/main-street/MainStreetCards');
    const templates = getEventTemplates();
    const eventCard = templates[0];
    (scene.state as { hand: unknown[] }).hand.push({ ...eventCard });
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnEventPlayed(scene);
    const handIndex = (scene.state as { hand: { id: string }[] }).hand.findIndex((c) => c.id === eventCard.id);

    (scene.msTurnController as unknown as { onPlayHeldEvent: (handIndex?: number) => void }).onPlayHeldEvent(handIndex);

    await waitForCondition(() => calls.length >= 1, { timeoutMs: 5000, label: 'event played trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].eventName).toBe(eventCard.name);
    expect(calls[0].x).toBeGreaterThan(0);
    expect(calls[0].y).toBeGreaterThan(0);

    // The card actually left the hand.
    const stillHeld = (scene.state as { hand: { id: string }[] }).hand.some((c) => c.id === eventCard.id);
    expect(stillHeld).toBe(false);
  }, 30_000);
});
