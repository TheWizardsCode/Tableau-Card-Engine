/**
 * Beleaguered Castle variant popup browser tests.
 *
 * Boots the real BeleagueredCastleScene (reduced-motion test mode) and
 * exercises the pre-game variant selection popup (AC 1, AC 2):
 *  - the popup presents Classic and Citadel choices with the persisted
 *    selection highlighted;
 *  - choosing Citadel re-deals all 52 cards to the tableau with empty
 *    foundations and persists the choice to localStorage;
 *  - choosing Classic re-deals the classic layout (48 cards, aces on
 *    foundations) and persists the choice.
 *
 * The popup itself is skipped during reduced-motion test-mode boot (the
 * board starts instantly, matching the other browser suites), so the
 * tests drive `scene.showVariantPopup()` directly — the same entry point
 * the pre-game flow uses when no checkpoint exists.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { FOUNDATION_COUNT, TABLEAU_COUNT } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import type { BeleagueredCastleState } from '../../example-games/beleaguered-castle/BeleagueredCastleState';
import { FOUNDATION_SUITS } from '../../example-games/beleaguered-castle/BeleagueredCastleState';

const VARIANT_STORAGE_KEY = 'tce-bc-variant';
const VARIANT_HIGHLIGHT_COLOR = '#ffdd88';

async function bootGame(): Promise<Phaser.Game> {
  // Clean slate: no persisted variant and no checkpoint so the scene
  // boots into the reduced-motion test path (instant deal, no popup).
  try { localStorage.clear(); } catch { /* ignore */ }
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
  (window as any).__BC_TEST_REDUCED_MOTION__ = true;
  const { createBeleagueredCastleGame } = await import('../../example-games/beleaguered-castle/createBeleagueredCastleGame');
  const game = createBeleagueredCastleGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'BeleagueredCastleScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number, fallbackMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let left = n;
    const finish = () => { if (settled) return; settled = true; resolve(); };
    const fallback = setTimeout(finish, fallbackMs);
    const tick = () => {
      if (settled) return;
      left -= 1;
      if (left <= 0) { clearTimeout(fallback); finish(); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Collect display objects from scene children and the HUD container
 * (Phaser 4 containers store children in .list).
 */
function collectTexts(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  const result: Phaser.GameObjects.Text[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (child instanceof Phaser.GameObjects.Text) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud && hud.list) walk(hud.list);
  return result;
}

/** Find a popup button by its label text. */
function findButton(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text | undefined {
  return collectTexts(scene).find((t) => t.text === label);
}

/** Wait until the deal has completed (dealComplete true). */
async function waitForDeal(scene: any): Promise<void> {
  for (let i = 0; i < 100 && !scene.dealComplete; i++) {
    await waitFrames(1);
  }
  expect(scene.dealComplete).toBe(true);
}

function totalTableauCards(state: BeleagueredCastleState): number {
  return state.tableau.reduce((sum, col) => sum + col.size(), 0);
}

let game: Phaser.Game | null = null;

beforeAll(async () => {
  game = await bootGame();
}, 120_000);

afterAll(() => {
  destroyGame(game);
  game = null;
});

describe('Beleaguered Castle variant popup', () => {
  it('presents Classic and Citadel choices with the persisted selection highlighted', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // Default (no persisted variant): Classic is highlighted.
    (scene as any).showVariantPopup();
    await waitFrames(5);

    const title = collectTexts(scene).find((t) => t.text === 'Choose a Variant');
    expect(title).toBeDefined();

    const classicBtn = findButton(scene, '[ Classic ]');
    const citadelBtn = findButton(scene, '[ Citadel ]');
    expect(classicBtn).toBeDefined();
    expect(citadelBtn).toBeDefined();
    expect(classicBtn!.input?.enabled).toBe(true);
    expect(citadelBtn!.input?.enabled).toBe(true);

    // Persisted selection (classic by default) is highlighted.
    expect((classicBtn as any).style?.color).toBe(VARIANT_HIGHLIGHT_COLOR);

    // Dismiss so later tests start from a clean overlay state.
    (scene as any).overlayManager.dismiss();
    await waitFrames(3);
    expect(findButton(scene, '[ Citadel ]')).toBeUndefined();
  });

  it('selecting Citadel deals 52 cards with empty foundations and persists the choice', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    (scene as any).showVariantPopup();
    await waitFrames(5);

    const citadelBtn = findButton(scene, '[ Citadel ]');
    expect(citadelBtn).toBeDefined();
    citadelBtn!.emit('pointerdown');

    await waitForDeal(scene);

    const state = scene.getGameState() as BeleagueredCastleState;
    expect(totalTableauCards(state)).toBe(52);
    expect(state.tableau.length).toBe(TABLEAU_COUNT);
    // First four columns have 7 cards, the rest 6.
    for (let col = 0; col < 4; col++) expect(state.tableau[col].size()).toBe(7);
    for (let col = 4; col < TABLEAU_COUNT; col++) expect(state.tableau[col].size()).toBe(6);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(0);
    }

    // Popup dismissed and choice persisted.
    expect(findButton(scene, '[ Citadel ]')).toBeUndefined();
    expect(localStorage.getItem(VARIANT_STORAGE_KEY)).toBe('citadel');

    // The turn controller is rebuilt with a fresh recorder, so the
    // transcript's initialState describes the Citadel deal (52 cards in
    // the tableau, empty foundations) — not the classic placeholder state.
    const recorder = (scene as any).getRecorder();
    const initialState = (recorder as any).transcript?.initialState;
    expect(initialState).toBeDefined();
    const totalInitial = initialState.tableau.reduce(
      (sum: number, col: { cards: unknown[] }) => sum + col.cards.length, 0,
    );
    expect(totalInitial).toBe(52);
    expect(initialState.foundations.every((f: { size: number }) => f.size === 0)).toBe(true);
  });

  it('selecting Classic deals 48 cards with aces on foundations and persists the choice', async () => {
    const scene = game!.scene.getScene('BeleagueredCastleScene') as any;
    await waitFrames(8);

    // The popup should now highlight Citadel (persisted by the previous test).
    (scene as any).showVariantPopup();
    await waitFrames(5);
    const citadelBtn = findButton(scene, '[ Citadel ]');
    expect((citadelBtn as any).style?.color).toBe(VARIANT_HIGHLIGHT_COLOR);

    const classicBtn = findButton(scene, '[ Classic ]');
    expect(classicBtn).toBeDefined();
    classicBtn!.emit('pointerdown');

    await waitForDeal(scene);

    const state = scene.getGameState() as BeleagueredCastleState;
    expect(totalTableauCards(state)).toBe(48);
    for (let fi = 0; fi < FOUNDATION_COUNT; fi++) {
      expect(state.foundations[fi].size()).toBe(1);
      expect(state.foundations[fi].peek()!.rank).toBe('A');
      expect(state.foundations[fi].peek()!.suit).toBe(FOUNDATION_SUITS[fi]);
    }

    expect(localStorage.getItem(VARIANT_STORAGE_KEY)).toBe('classic');
  });
});
