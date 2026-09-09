/**
 * Main Street: Dual-Choice Event Dialog (UI slice, CG-0MTT7EFYH006N940 /
 * parent CG-0MTSHG8RP008E128)
 *
 * End-to-end browser verification of the event choice dialog overlay and its
 * end-of-turn integration:
 *
 * 1. Ending a turn when the drawn incident has `hasChoices` pauses the
 *    closing (choicePending) and presents the Accept/Reject dialog instead
 *    of starting the next day. The dialog shows the event name, an Accept
 *    button labelled "<event name> (Accept)", and a bare "Reject" button —
 *    all parented into the HUD container (overlay pattern compliance).
 * 2. Accept applies the event's effect, clears the pending choice, and the
 *    deferred closing advances to the next day.
 * 3. Reject refuses the effect (resources unchanged), clears the pending
 *    choice, and the deferred closing advances to the next day.
 *
 * @module tests/main-street/event-choice-dialog-slice.browser
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

/**
 * A choice incident that defers resolution when drawn at end of turn.
 * No chain links (accept/reject next ids absent) so escalation lookups are
 * not needed — the chain simply ends either way.
 */
function makeChoiceIncident(): EventCard {
  return {
    family: 'event',
    id: 'inc-browser-choice-test',
    name: 'Power Outage',
    trigger: 'Incident',
    cost: 0,
    effect: 'Lose 50 coins',
    target: 'All',
    coinDelta: -50,
    reputationDelta: 0,
    hasChoices: true,
  };
}

interface HudTextFinder {
  list: Phaser.GameObjects.GameObject[];
}

function hudTexts(scene: Phaser.Scene & Record<string, unknown>): Phaser.GameObjects.Text[] {
  const hud = scene.hudContainer as HudTextFinder | undefined;
  if (!hud || !hud.list) return [];
  return hud.list.filter(
    (child): child is Phaser.GameObjects.Text => child instanceof Phaser.GameObjects.Text,
  );
}

function findText(scene: Phaser.Scene & Record<string, unknown>, label: string): Phaser.GameObjects.Text | undefined {
  return hudTexts(scene).find((t) => t.text === label);
}

function sceneState(scene: Phaser.Scene & Record<string, unknown>): Record<string, any> {
  return scene.state as Record<string, any>;
}

describe('Main Street dual-choice event dialog (UI slice)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('pauses end-of-turn and shows the Accept/Reject dialog for a choice incident', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Queue a choice incident for resolution at end of turn.
    sceneState(scene).incidentDeck = [makeChoiceIncident()];

    const turnBefore = sceneState(scene).turn;
    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The closing pauses (choicePending): the dialog appears instead of the
    // next day starting. Wait for the Accept label in the HUD container.
    await waitForCondition(
      () => Boolean(findText(scene, 'Power Outage (Accept)') && findText(scene, 'Reject')),
      { timeoutMs: 12_000, label: 'event choice dialog buttons' },
    );

    // Dialog content: event-name title + the two buttons, all parented into
    // hudContainer (overlay pattern compliance, AC4).
    expect(findText(scene, 'Power Outage')).toBeDefined();
    const acceptBtn = findText(scene, 'Power Outage (Accept)')!;
    const rejectBtn = findText(scene, 'Reject')!;
    expect(acceptBtn.input?.enabled).toBe(true);
    expect(rejectBtn.input?.enabled).toBe(true);

    // Engine pause state: the incident is pending and the turn has not
    // advanced (deferred closing — EndCheck/next day have not run).
    const pending = sceneState(scene).pendingEventChoice;
    expect(pending).not.toBeNull();
    expect(pending.resolved).toBe(false);
    expect(pending.chosenOption).toBeNull();
    expect(sceneState(scene).turn).toBe(turnBefore);
  }, 30_000);

  it('Accept applies the incident effect and advances the day', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const coinsBefore = sceneState(scene).resourceBank.coins;
    const turnBefore = sceneState(scene).turn;
    sceneState(scene).incidentDeck = [makeChoiceIncident()];

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    await waitForCondition(() => Boolean(findText(scene, 'Reject')), {
      timeoutMs: 12_000,
      label: 'choice dialog (reject button)',
    });

    // Accept: the dialog's accept handler resolves the choice via the engine.
    const acceptBtn = findText(scene, 'Power Outage (Accept)')!;
    acceptBtn.emit('pointerdown');

    // Accept applies the event's effect (-50 coins), clears the pending
    // choice, and the deferred closing advances to the next market phase.
    await waitForCondition(() => {
      const st = sceneState(scene);
      return st.pendingEventChoice === null && st.phase === 'MarketPhase' && st.turn === turnBefore + 1;
    }, { timeoutMs: 15_000, label: 'accept resolution + next day' });

    expect(sceneState(scene).resourceBank.coins).toBe(coinsBefore - 50);
  }, 30_000);

  it('Reject refuses the consequence and advances the day without applying effects', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    const coinsBefore = sceneState(scene).resourceBank.coins;
    const turnBefore = sceneState(scene).turn;
    sceneState(scene).incidentDeck = [makeChoiceIncident()];

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    await waitForCondition(() => Boolean(findText(scene, 'Reject')), {
      timeoutMs: 12_000,
      label: 'choice dialog (reject button)',
    });

    const rejectBtn = findText(scene, 'Reject')!;
    rejectBtn.emit('pointerdown');

    await waitForCondition(() => {
      const st = sceneState(scene);
      return st.pendingEventChoice === null && st.phase === 'MarketPhase' && st.turn === turnBefore + 1;
    }, { timeoutMs: 15_000, label: 'reject resolution + next day' });

    // Reject = refuse the consequence: no coins changed.
    expect(sceneState(scene).resourceBank.coins).toBe(coinsBefore);
  }, 30_000);
});
