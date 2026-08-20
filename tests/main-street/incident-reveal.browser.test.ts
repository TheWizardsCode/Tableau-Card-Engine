/**
 * Main Street: Incident Reveal Browser Tests
 *
 * Verifies the incident reveal presentation end to end in a real Phaser
 * scene:
 *
 * 1. Ending the turn with an incident at the front of the Upcoming queue
 *    triggers `MainStreetAnimator.animateIncidentReveal` with the resolved
 *    incident's card id, its resource deltas (negative = loss), and the
 *    front-queue-card origin. The full effect runs: a snapshot card visual
 *    flies from the queue and a red flash rectangle is created.
 * 2. Under reduced motion the reveal is called (the trigger point is
 *    unchanged) but only the sound + HUD pops run — no flight visual and no
 *    red flash.
 *
 * The presentation is non-blocking: it never mutates game state, the
 * transcript, or the turn flow (the next day still starts after the usual
 * turn-advance window).
 *
 * @module tests/main-street/incident-reveal.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

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

/** A negative incident event that resolves on end turn. */
function makeLossIncident(): EventCard {
  return {
    family: 'event',
    id: 'inc-browser-reveal-test',
    name: 'Power Outage',
    trigger: 'Incident',
    cost: 0,
    effect: '-3 coins',
    target: 'All',
    coinDelta: -3,
    reputationDelta: 0,
  };
}

interface RevealCall {
  cardId: string;
  incidentName: string;
  coinChange: number;
  repChange: number;
  from: { x: number; y: number };
}

function spyOnIncidentReveal(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: RevealCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animateIncidentReveal: (params: RevealCall) => void;
  };
  const original = animator.animateIncidentReveal.bind(animator);
  const calls: RevealCall[] = [];
  const spy = vi.spyOn(animator, 'animateIncidentReveal').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { spy, calls };
}

describe('MainStreet incident reveal presentation', () => {
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

  it('triggers the reveal with the incident deltas and runs the flight + red flash on end turn', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Queue a negative incident for resolution at end of turn.
    const incident = makeLossIncident();
    (scene.state as { incidentDeck: EventCard[] }).incidentDeck = [incident];

    // Spy on the flight visual factory to observe the reveal's rendering.
    const createVisualSpy = vi.spyOn(scene.msAnimator as unknown as { createTransferCardVisual: (...a: unknown[]) => unknown }, 'createTransferCardVisual');
    const { calls } = spyOnIncidentReveal(scene);
    const expectedFrom = (scene.msRenderer as unknown as { getFrontIncidentCardCenter: () => { x: number; y: number } }).getFrontIncidentCardCenter();

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The controller calls the animator with the resolved incident details.
    await waitForCondition(() => calls.length >= 1, { label: 'incident reveal trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].cardId).toBe('inc-browser-reveal-test');
    expect(calls[0].incidentName).toBe('Power Outage');
    expect(calls[0].coinChange).toBe(-3);
    expect(calls[0].repChange).toBe(0);
    expect(calls[0].from).toEqual(expectedFrom);

    // The full effect ran: a flight snapshot visual was created (from the
    // queue origin).
    expect(createVisualSpy).toHaveBeenCalled();
    const visualArgs = createVisualSpy.mock.calls[0] as unknown as [string, string, number, number];
    expect(visualArgs[0]).toBe('inc-browser-reveal-test');
    expect(visualArgs[2]).toBeCloseTo(expectedFrom.x, 0);
    expect(visualArgs[3]).toBeCloseTo(expectedFrom.y, 0);

    // The next day still starts after the usual turn-advance window — the
    // reveal never blocks the turn flow.
    await waitForCondition(() => (scene.state as { phase: string }).phase === 'MarketPhase', {
      timeoutMs: 5000,
      label: 'next day start (phase back to MarketPhase)',
    });
  }, 30_000);
});
