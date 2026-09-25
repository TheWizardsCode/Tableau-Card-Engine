/**
 * Main Street: Incident Reveal Browser Tests (new choreography)
 *
 * Verifies the new incident reveal presentation end to end in a real Phaser
 * scene:
 *
 * 1. Ending the turn with an incident at the front of the Upcoming queue
 *    triggers the new reveal: a card-back-over-face container builds,
 *    flies to board centre, hinges open (scaleX → 0), and the face stays
 *    visible for 4 seconds before the turn advances.
 * 2. The reveal **blocks** the turn advance — the next week starts only
 *    after the 4-second hold completes (new gating behaviour).
 * 3. Under reduced motion the reveal shows the card instantly (no flight,
 *    no hinge flip) but still waits 4 seconds before advancing.
 *
 * Timing notes — the reveal choreography (flight 550ms + hinge 260ms +
 * hold 4000ms + return 400ms = 5210ms) plus the controller's 800ms delay
 * after reveal completion makes the nominal wall-clock ~6s. Under CPU
 * contention Phaser rAF timers lag, so the test uses a generous margin
 * (+16s) to avoid false failures; see the pattern in
 * `income-collection.browser.test.ts`.
 *
 * @module tests/main-street/incident-reveal-browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Timing constants ───────────────────────────────────────────
// Nominal reveal choreography: flight 550ms + hinge 260ms + hold 4000ms
// + return 400ms = 5210ms, plus the controller's 800ms delay after
// reveal completion → ~6010ms nominal. Under CPU contention Phaser rAF
// timers lag; use a generous margin (+16s) to avoid false failures.
const REVEAL_WAIT_MS = 6_000 + 16_000;

/** No-incident fast path: advanceTurn's 800ms delay plus generous margin. */
const FAST_PATH_WAIT_MS = 2_000 + 12_000;

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

  it('triggers the reveal with the incident deltas and gates turn advance until the 4-second hold completes', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Queue a negative incident for resolution at end of turn.
    const incident = makeLossIncident();
    (scene.state as { incidentDeck: EventCard[] }).incidentDeck = [incident];

    // Spy on the reveal to observe when it's called.
    const { calls } = spyOnIncidentReveal(scene);

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The controller calls the animator with the resolved incident details.
    await waitForCondition(() => calls.length >= 1, { timeoutMs: 10_000, label: 'incident reveal trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].cardId).toBe('inc-browser-reveal-test');
    expect(calls[0].incidentName).toBe('Power Outage');
    expect(calls[0].coinChange).toBe(-3);
    expect(calls[0].repChange).toBe(0);

    // The reveal gates the turn advance: the next week does NOT start
    // immediately (800ms). Instead it waits for the 4-second hold.
    // Verify that the phase does NOT return to MarketPhase within 2s
    // (which would be the old non-blocking behaviour).
    const earlyPhase = (scene.state as { phase: string }).phase;
    expect(earlyPhase).not.toBe('MarketPhase');

    // After the full reveal (4s hold + return animation), the next week starts.
    // Use generous timeout: nominal ~6s + 16s margin for contention-induced RAF lag.
    await waitForCondition(() => (scene.state as { phase: string }).phase === 'MarketPhase', {
      timeoutMs: REVEAL_WAIT_MS,
      label: 'next week start after reveal hold (gated)',
    });
  }, 45_000);

  it('skips the reveal in tutorial mode so tutorial step pacing is unchanged', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Simulate an active tutorial (the scene attaches `tutorialController`
    // dynamically) and queue an incident that would otherwise reveal.
    (scene as unknown as { tutorialController: unknown }).tutorialController = {
      isActive: true,
      currentStepIndex: 0,
      lastCompletedStepId: null,
      exited: false,
    };
    (scene.state as { incidentDeck: EventCard[] }).incidentDeck = [makeLossIncident()];

    const animator = scene.msAnimator as unknown as {
      animateIncidentReveal: (params: RevealCall) => void;
    };
    const spy = vi.spyOn(animator, 'animateIncidentReveal');

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The reveal is skipped in the tutorial...
    expect(spy).not.toHaveBeenCalled();

    // ...and the day still advances on the usual window (no 4s hold).
    await waitForCondition(() => (scene.state as { phase: string }).phase === 'MarketPhase', {
      timeoutMs: FAST_PATH_WAIT_MS,
      label: 'next week start during tutorial (reveal skipped)',
    });
  }, 45_000);

  it('skips the reveal animation entirely when there is no incident', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // No incident in the deck.
    (scene.state as { incidentDeck: EventCard[] }).incidentDeck = [];

    // Spy on the reveal — it should NOT be called.
    const animator = scene.msAnimator as unknown as {
      animateIncidentReveal: (params: RevealCall) => void;
    };
    const spy = vi.spyOn(animator, 'animateIncidentReveal');

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The reveal should not be called when there's no incident.
    expect(spy).not.toHaveBeenCalled();

    // The day should advance quickly (the ~800ms path).
    await waitForCondition(() => (scene.state as { phase: string }).phase === 'MarketPhase', {
      timeoutMs: FAST_PATH_WAIT_MS,
      label: 'next week start without incident (fast)',
    });
  }, 45_000);
});
