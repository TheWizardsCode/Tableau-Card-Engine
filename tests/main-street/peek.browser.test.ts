/**
 * Main Street: Staff Peek Browser Tests (CG-0MSXOW6GN008ZSMN)
 *
 * Verifies the staff peek skill end to end in a real Phaser scene:
 *
 * 1. The face-down deck rendering (CG-0MSXOWLHU0099QF6): the Upcoming panel
 *    shows a card back + remaining count, and NO incident content is
 *    visible before its turn (no face-up event card textures in the queue
 *    container).
 * 2. Clicking the peek action (onPeekClick) consumes one daily action, sets
 *    the once-per-turn gate, exposes the revealed card via
 *    `state.revealedPeekedCard`, and plays `animatePeekReveal` from the
 *    face-down deck-stack position.
 * 3. After the reveal the card is returned face-down: the deck is unchanged,
 *    `revealedPeekedCard` is cleared, and the UI returns to the market
 *    phase.
 * 4. A second peek attempt in the same turn is rejected (once-per-turn gate).
 *
 * @module tests/main-street/peek.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';
import { createStaffDeck } from '../../example-games/main-street/MainStreetCards';

// ── Boot helpers (mirrors incident-reveal.browser.test.ts) ──

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

/** A negative incident event that sits at the top of the face-down deck. */
function makeTopIncident(): EventCard {
  return {
    family: 'event',
    id: 'inc-browser-peek-test',
    name: 'Blackout',
    trigger: 'Incident',
    cost: 0,
    effect: '-2 coins',
    target: 'All',
    coinDelta: -2,
    reputationDelta: 0,
  };
}

interface RevealCall {
  cardId: string;
  cardName: string;
  from: { x: number; y: number };
}

function spyOnPeekReveal(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: RevealCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animatePeekReveal: (params: RevealCall) => void;
  };
  const original = animator.animatePeekReveal.bind(animator);
  const calls: RevealCall[] = [];
  const spy = vi.spyOn(animator, 'animatePeekReveal').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { spy, calls };
}

describe('Main Street staff peek skill', () => {
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

  /** Boots a scene with a peek-capable staff member employed and a known top incident. */
  async function bootPeekScene(): Promise<Phaser.Scene & Record<string, unknown>> {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Employ the Lookout (peek ability) and fix the incident deck top.
    const lookout = createStaffDeck(1).find(c => c.peekOncePerTurn);
    expect(lookout, 'a peek staff template must exist').toBeDefined();
    (scene.state as { staffCards: unknown[] }).staffCards.push({ ...lookout! });
    (scene.state as { incidentDeck: EventCard[] }).incidentDeck = [makeTopIncident()];
    (scene.state as { actionsRemaining: number }).actionsRemaining = 2;
    (scene.state as { peekUsedThisTurn: boolean }).peekUsedThisTurn = false;

    // Re-render so the queue reflects the injected state.
    (scene.msRenderer as unknown as { refreshIncidentQueue: () => void }).refreshIncidentQueue();
    return scene;
  }

  /** Flattens a container tree (depth 2) into a single object list. */
  function flatten(container: Phaser.GameObjects.Container): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [];
    for (const o of container.list) {
      out.push(o);
      const inner = o as Phaser.GameObjects.Container;
      if (inner.type === 'Container' && Array.isArray(inner.list)) {
        out.push(...inner.list);
      }
    }
    return out;
  }

  it('renders the incident deck face-down (card back + count, no incident content)', async () => {
    const scene = await bootPeekScene();
    const container = scene.incidentQueueContainer as Phaser.GameObjects.Container;
    const all = () => flatten(container);

    // No incident content is visible before its turn: no rendered image in
    // the queue panel carries the top incident's template id (AC2 of
    // CG-0MSXOWLHU0099QF6).
    const images = all().filter(o => o.type === 'Image');
    expect(images.some(img => (img as { texture?: { key?: string } }).texture?.key?.includes('inc-browser-peek-test'))).toBe(false);

    // A card back renders (texture rasterised asynchronously → refreshAll).
    await waitForCondition(
      () => all().some(
        o => o.type === 'Image' && typeof (o as { texture?: { key?: string } }).texture?.key === 'string'
          && ((o as { texture?: { key?: string } }).texture?.key ?? '').includes('card-back'),
      ),
      { label: 'face-down card back texture in queue panel' },
    ).catch((err: Error) => {
      const kids = all()
        .map(o => `${o.type ?? '?'}${(o as { texture?: { key?: string } }).texture?.key ? ':' + ((o as { texture?: { key?: string } }).texture?.key ?? '') : ''}`)
        .join(', ');
      throw new Error(`${err.message} — objects: [${kids}]`);
    });

    // Deck count label shows the remaining incident count.
    const deckText = all().find(
      o => o.type === 'Text' && typeof (o as { text?: string }).text === 'string'
        && (o as { text?: string }).text!.startsWith('Deck: '),
    );
    expect(deckText).toBeDefined();
    expect((deckText as unknown as { text: string }).text).toBe('Deck: 1');
  }, 30_000);

  it('peek consumes an action, reveals the top card face-up, and returns it face-down', async () => {
    const scene = await bootPeekScene();
    const top = (scene.state as { incidentDeck: EventCard[] }).incidentDeck[0];
    const actionsBefore = (scene.state as { actionsRemaining: number }).actionsRemaining;
    const deckIdsBefore = (scene.state as { incidentDeck: EventCard[] }).incidentDeck.map(c => c.id);

    const { calls } = spyOnPeekReveal(scene);
    const expectedFrom = (scene.msRenderer as unknown as { getFrontIncidentCardCenter: () => { x: number; y: number } }).getFrontIncidentCardCenter();

    (scene.msTurnController as unknown as { onPeekClick: () => void }).onPeekClick();

    // The reveal triggers from the face-down deck-stack position.
    await waitForCondition(() => calls.length >= 1, { label: 'peek reveal trigger' });
    expect(calls[0].cardId).toBe(top.id);
    expect(calls[0].cardName).toBe('Blackout');
    expect(calls[0].from).toEqual(expectedFrom);

    // Engine contract: one action spent, gate set, reveal exposed, deck untouched.
    expect((scene.state as { actionsRemaining: number }).actionsRemaining).toBe(actionsBefore - 1);
    expect((scene.state as { peekUsedThisTurn: boolean }).peekUsedThisTurn).toBe(true);
    expect((scene.state as { revealedPeekedCard: EventCard | null }).revealedPeekedCard?.id).toBe(top.id);
    expect((scene.state as { incidentDeck: EventCard[] }).incidentDeck.map(c => c.id)).toEqual(deckIdsBefore);

    // After the reveal the card is returned face-down: reveal cleared, phase back to market.
    await waitForCondition(
      () => (scene.state as { revealedPeekedCard: EventCard | null }).revealedPeekedCard === null
        && (scene as unknown as { uiPhase: string }).uiPhase === 'market',
      { timeoutMs: 6000, label: 'peek reveal completion (face-down return)' },
    ).catch((err: Error) => {
      throw new Error(`${err.message} — revealedPeekedCard=${JSON.stringify((scene.state as { revealedPeekedCard: EventCard | null }).revealedPeekedCard?.id ?? null)} uiPhase=${(scene as unknown as { uiPhase: string }).uiPhase} replayMode=${(scene as unknown as { replayMode: boolean }).replayMode} reducedMotion=${(scene as unknown as { settingsPanel?: { reducedMotion?: boolean } }).settingsPanel?.reducedMotion}`);
    });
    expect((scene.state as { incidentDeck: EventCard[] }).incidentDeck.map(c => c.id)).toEqual(deckIdsBefore);
  }, 30_000);

  it('blocks a second peek in the same turn (once-per-turn gate)', async () => {
    const scene = await bootPeekScene();
    const actionsBefore = (scene.state as { actionsRemaining: number }).actionsRemaining;

    (scene.msTurnController as unknown as { onPeekClick: () => void }).onPeekClick();
    await waitForCondition(
      () => (scene.state as { revealedPeekedCard: EventCard | null }).revealedPeekedCard === null
        && (scene as unknown as { uiPhase: string }).uiPhase === 'market',
      { timeoutMs: 6000, label: 'first peek completion' },
    );

    const actionsAfterFirst = (scene.state as { actionsRemaining: number }).actionsRemaining;
    const instruction = scene.instructionText as Phaser.GameObjects.Text;

    (scene.msTurnController as unknown as { onPeekClick: () => void }).onPeekClick();
    expect((scene.state as { actionsRemaining: number }).actionsRemaining).toBe(actionsAfterFirst);
    expect((scene.state as { peekUsedThisTurn: boolean }).peekUsedThisTurn).toBe(true);
    expect(instruction.text).toContain('already peeked');
    expect(actionsAfterFirst).toBe(actionsBefore - 1);
  }, 30_000);
});
