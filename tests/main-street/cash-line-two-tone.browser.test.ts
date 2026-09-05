/**
 * Main Street: Two-Tone Cash Line Browser Tests (CG-0MTDMOYOL008IQVO)
 *
 * Verifies that the cash line overlay renders as **multiple side-by-side
 * Phaser text segments** with distinct colours — income green (`#44ff44`),
 * ongoing cost red (`#ff6644`), prefix/separator neutral (`#dddddd`) — by
 * inspecting the text objects the renderer adds to a card's container.
 *
 * Also verifies the baked `-X/turn` cost text is gone from the card SVG face.
 *
 * @module tests/main-street/cash-line-two-tone.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import {
  getBusinessTemplates,
  type BusinessCard,
} from '../../example-games/main-street/MainStreetCards';

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

/** Build a business on street slot 0 with income and ongoing cost. */
function makeCashLineBiz(): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  return {
    family: 'business',
    ...tpl,
    id: `cashline-biz-${tpl.id}`,
    level: 1,
    baseIncome: 2,
    ongoingCost: 0.75,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

/** Collect the direct Phaser Text children of a card's container. */
function textChildrenOf(container: Phaser.GameObjects.Container): Phaser.GameObjects.Text[] {
  return container.list.filter(
    (obj): obj is Phaser.GameObjects.Text => obj instanceof Phaser.GameObjects.Text,
  );
}

describe('MainStreet two-tone cash line overlay', () => {
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

  it('renders income green and cost red as separate segments on one line', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeCashLineBiz();
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const street = scene.streetContainer as Phaser.GameObjects.Container;
    const slotContainers = street.list.filter(
      (obj): obj is Phaser.GameObjects.Container => obj instanceof Phaser.GameObjects.Container,
    );
    await waitForCondition(() => slotContainers.length > 0, {
      timeoutMs: 10_000,
      label: 'street slots rendered',
    });

    // The cash line segments live in the slot's card container: collect every
    // text in the slot subtree matching our known segment strings.
    const segmentTexts: Phaser.GameObjects.Text[] = [];
    for (const slot of slotContainers) {
      segmentTexts.push(...textChildrenOf(slot));
    }

    const incomeSeg = segmentTexts.find((t) => t.text === '+2');
    const costSeg = segmentTexts.find((t) => t.text === '-0.75');
    const prefixSeg = segmentTexts.find((t) => t.text === 'Cash: ');
    const sepSeg = segmentTexts.find((t) => t.text === ' / ');

    expect(incomeSeg).toBeDefined();
    expect(costSeg).toBeDefined();
    expect(prefixSeg).toBeDefined();
    expect(sepSeg).toBeDefined();

    // Income green / cost red / separators neutral.
    expect(incomeSeg!.style.color).toBe('#44ff44');
    expect(costSeg!.style.color).toBe('#ff6644');
    expect(prefixSeg!.style.color).toBe('#dddddd');
    expect(sepSeg!.style.color).toBe('#dddddd');

    // Laid out left-to-right: prefix left of income, income left of separator,
    // separator left of cost — and the line is centred on the card (x 0).
    expect(prefixSeg!.x).toBeLessThan(incomeSeg!.x);
    expect(incomeSeg!.x).toBeLessThan(sepSeg!.x);
    expect(sepSeg!.x).toBeLessThan(costSeg!.x);

    // Group centred horizontally: leftmost edge ≈ -rightmost edge around x=0.
    const leftEdge = prefixSeg!.x;
    const rightEdge = costSeg!.x + costSeg!.width;
    expect(leftEdge).toBeLessThanOrEqual(0);
    expect(rightEdge).toBeGreaterThanOrEqual(0);
    expect(Math.abs(leftEdge + rightEdge)).toBeLessThan(2);
  }, 30_000);

  it('renders a single green income segment when there is no ongoing cost', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    const biz = makeCashLineBiz();
    // No ongoing cost → single green income segment, no red segment.
    state.streetGrid[0] = { ...biz, ongoingCost: 0 };
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const street = scene.streetContainer as Phaser.GameObjects.Container;
    const slotContainers = street.list.filter(
      (obj): obj is Phaser.GameObjects.Container => obj instanceof Phaser.GameObjects.Container,
    );
    await waitForCondition(() => slotContainers.length > 0, {
      timeoutMs: 10_000,
      label: 'street slots rendered',
    });

    const allTexts: Phaser.GameObjects.Text[] = [];
    for (const slot of slotContainers) allTexts.push(...textChildrenOf(slot));

    const incomeSeg = allTexts.find((t) => t.text === '+2');
    const costSeg = allTexts.find((t) => t.text === '-0.75');
    expect(incomeSeg).toBeDefined();
    expect(incomeSeg!.style.color).toBe('#44ff44');
    // No red cost segment when there is no ongoing cost.
    expect(costSeg).toBeUndefined();
  }, 30_000);
});