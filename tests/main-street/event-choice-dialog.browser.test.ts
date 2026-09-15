/**
 * Test: UI Dialog Integration & Save/Load (CG-0MTT7DKM5007B4X1 / parent
 * CG-0MTSHG8RP008E128)
 *
 * Canonical browser suite for the event-choice dialog overlay, verifying the
 * UI acceptance criteria end to end in a real Phaser scene:
 *
 * 1. Overlay pattern compliance — backdrop 199 / box 200 / elements 201,
 *    ALL elements parented into `hudContainer`.
 * 2. Button text — Accept shows "<event name> (Accept)", Reject shows
 *    "Reject" (no escalation preview).
 * 3. Reduced motion — the dialog appears instantly (no fade-in choreography);
 *    it is present in the HUD right after the end-of-turn pause resolves.
 *
 * Save/load round-trip, legacy-save defaults, and undo-restores-pending are
 * covered by the engine-level unit suites (`event-choice.test.ts` AC7,
 * `MainStreetEventChoiceUndo.test.ts`) — see child comment.
 *
 * @module tests/main-street/event-choice-dialog.browser
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Boot helpers (mirrors incident-reveal.browser.test.ts) ──

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
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

function makeChoiceIncident(): EventCard {
  return {
    family: 'event',
    id: 'inc-browser-dialog-choice',
    name: 'Service Workers Strike',
    trigger: 'Incident',
    cost: 0,
    effect: 'Lose 40 coins',
    target: 'All',
    coinDelta: -40,
    reputationDelta: 0,
    hasChoices: true,
  };
}

type SceneWithHud = Phaser.Scene & Record<string, any>;

function hudTexts(s: SceneWithHud): Phaser.GameObjects.Text[] {
  const list = s.hudContainer?.list;
  if (!list) return [];
  return list.filter((c: Phaser.GameObjects.GameObject) => c instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[];
}

function hudText(s: SceneWithHud, label: string): Phaser.GameObjects.Text | undefined {
  return hudTexts(s).find((t) => t.text === label);
}

function triggerChoicePause(s: SceneWithHud): void {
  s.state.incidentDeck = [makeChoiceIncident()];
  (s.msTurnController as { endTurn: () => void }).endTurn();
}

describe('Main Street event-choice dialog overlay (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('presents Accept/Reject with the expected labels, HUD parenting and 199/200/201 depths', async () => {
    game = await bootGame();
    const s = game.scene.getScene('MainStreetScene') as SceneWithHud;

    triggerChoicePause(s);

    // Accept button text = "<event name> (Accept)"; Reject = bare "Reject".
    await waitForCondition(
      () => Boolean(hudText(s, 'Service Workers Strike (Accept)') && hudText(s, 'Reject')),
      { timeoutMs: 12_000, label: 'dialog buttons in hud' },
    );

    // AC1: backdrop 199 / box 200 / elements 201, all in the HUD container.
    const acceptBtn = hudText(s, 'Service Workers Strike (Accept)')!;
    const rejectBtn = hudText(s, 'Reject')!;
    const titleText = hudText(s, 'Service Workers Strike')!;
    expect(acceptBtn.depth).toBe(201);
    expect(rejectBtn.depth).toBe(201);
    expect(titleText.depth).toBe(201);
    expect(acceptBtn.input?.enabled).toBe(true);
    expect(rejectBtn.input?.enabled).toBe(true);

    // Backdrop + visible box were created by createOverlayBackground (depth
    // 199 and 200 game objects exist in the scene's overlay list).
    const overlayObjects = (s.overlayObjects ?? []) as Phaser.GameObjects.GameObject[];
    const depths = overlayObjects.map((o) => (o as Phaser.GameObjects.GameObject & { depth?: number }).depth ?? (o as any).getData?.('depth'));
    expect(depths).toContain(199);
    expect(depths).toContain(200);

    // Engine pause state is coherent while the dialog shows.
    const pending = s.state.pendingEventChoice;
    expect(pending).not.toBeNull();
    expect(pending.resolved).toBe(false);
  }, 30_000);

  it('appears instantly (no fade-in delay) and resolves on Reject', async () => {
    game = await bootGame();
    const s = game.scene.getScene('MainStreetScene') as SceneWithHud;

    triggerChoicePause(s);

    // Instant appearance: the dialog has NO fade-in choreography (reduced-motion
    // safe by construction) — it is present within a short window.
    await waitForCondition(() => Boolean(hudText(s, 'Reject')), {
      timeoutMs: 4000,
      label: 'instant dialog appearance',
    });
    expect(hudText(s, 'Service Workers Strike (Accept)')).toBeDefined();

    // Resolve via Reject: consequence refused, no resources change, and the
    // deferred closing advances the day (reduced-motion path still resolves).
    const coinsBefore = s.state.resourceBank.coins;
    const turnBefore = s.state.turn;
    hudText(s, 'Reject')!.emit('pointerdown');

    await waitForCondition(() => {
      const st = s.state;
      return st.pendingEventChoice === null && st.phase === 'MarketPhase' && st.turn === turnBefore + 1;
    }, { timeoutMs: 15_000, label: 'reject resolution + next day' });
    expect(s.state.resourceBank.coins).toBe(coinsBefore);
  }, 30_000);
});
