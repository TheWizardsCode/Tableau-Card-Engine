/**
 * Main Street: Upgrade hand-first click flow browser tests
 * (CG-0MT40CNO1002MSDC, parent CG-0MT3IYSRL001VVUP).
 *
 * Upgrades now follow the same two-step economy as business cards:
 *
 * 1. Click a market upgrade → the card moves to hand and spends the daily
 *    action. It rests in the hand UNselected (`pendingHandIndex === null`,
 *    `uiPhase === 'market'`).
 * 2. Click the upgrade in hand → it becomes the pending hand card and the
 *    scene enters `'placing-from-hand'` targeting.
 * 3. Click an eligible business on the street → the upgrade is applied. A
 *    same-day moved upgrade is a free composite (the move already spent the
 *    action); an upgrade held from a previous day spends one action.
 * 4. Click an ineligible business → illegal-move feedback and the upgrade
 *    stays selected so the player can pick another target.
 *
 * All assertions go through the scene's public interaction handlers
 * (`onUpgradeCardClick`, `onHandUpgradeCardClick`, `onSlotClick`) and the
 * observable state they mutate — never source greps.
 *
 * @module tests/main-street/upgrade-hand-flow.browser
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { TUTORIAL_STATE_STORAGE_KEY } from '../../example-games/main-street/TutorialState';
import {
  getBusinessTemplates,
  getUpgradeTemplates,
  type BusinessCard,
  type UpgradeCard,
} from '../../example-games/main-street/MainStreetCards';

const GAME_W = 1280;
const GAME_H = 720;

type Scene = Phaser.Scene & Record<string, any>;

async function bootGame(): Promise<Phaser.Game> {
  // Skip the tutorial so no tutorial step gates an interaction, and clear any
  // stale checkpoint so the resume overlay cannot swallow clicks.
  try { localStorage.clear(); } catch { /* ignore */ }
  try {
    localStorage.setItem(
      TUTORIAL_STATE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, status: 'skipped', completedAt: null, lastStepId: null }),
    );
  } catch { /* ignore */ }

  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({
    type: Phaser.CANVAS,
    parent: 'game-container',
    width: GAME_W,
    height: GAME_H,
  });
  await waitForScene(game, 'MainStreetScene');
  // Reduced motion makes the market→hand / hand→street transfer resolve
  // without waiting on RAF-driven tweens, keeping the suite deterministic.
  const scene = game.scene.getScene('MainStreetScene') as Scene;
  if (scene?.settingsPanel) scene.settingsPanel._reducedMotion = true;
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function getScene(game: Phaser.Game): Scene {
  return game.scene.getScene('MainStreetScene') as Scene;
}

/**
 * Finds a level-0 upgrade plus a matching base-level business template so the
 * upgrade flow can be exercised end to end (mirrors the fixture used by
 * upgrade-level-up.browser.test.ts).
 */
function makeUpgradeFixture(): { biz: BusinessCard; upgrade: UpgradeCard } {
  const upgrades = getUpgradeTemplates();
  const upgrade = upgrades.find((u) => (u.requiredLevel ?? 0) === 0);
  if (!upgrade) throw new Error('No level-0 upgrade templates');
  const tpl = getBusinessTemplates().find((t) => t.name === upgrade.targetBusiness);
  if (!tpl) throw new Error(`No business template named "${upgrade.targetBusiness}"`);
  const biz: BusinessCard = {
    ...tpl,
    id: `handflow-biz-${tpl.id}`,
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
  return { biz, upgrade };
}

/**
 * Places a deterministic street/upgrade market setup on the live scene and
 * resets all interaction state, so each test starts from a known phase.
 */
function setupUpgradeScene(
  scene: Scene,
  opts: { actions?: number; coins?: number; businessLevel?: number; upgradeInHand?: boolean } = {},
): { biz: BusinessCard; upgrade: UpgradeCard } {
  const { biz, upgrade } = makeUpgradeFixture();
  const level = opts.businessLevel ?? 0;
  const placedBiz: BusinessCard = { ...biz, level, id: `${biz.id}-lvl${level}` };

  scene.state.streetGrid[0] = placedBiz;
  for (let i = 1; i < scene.state.streetGrid.length; i += 1) {
    scene.state.streetGrid[i] = null;
  }

  scene.state.market.cards = opts.upgradeInHand ? [] : [upgrade];
  scene.state.hand = opts.upgradeInHand ? [upgrade] : [];
  scene.state.resourceBank.coins = opts.coins ?? 2000;
  scene.state.actionsRemaining = opts.actions ?? 1;
  scene.state.justMovedUpgradeCardId = null;

  scene.pendingHandIndex = null;
  scene.pendingHandJustMoved = false;
  scene.uiPhase = 'market';
  scene.refreshAll();

  return { biz: placedBiz, upgrade };
}

/** The market card container for a given card id (renderer names every card). */
function findMarketCardContainer(scene: Scene, cardId: string): any | undefined {
  const list: any[] = scene.marketContainer?.list ?? [];
  return list.find((child) => child?.name === `ms-market-card-${cardId}`);
}

/** The text of the buy-and-place premium badge on a card container, if any. */
function premiumBadgeText(container: any): string | null {
  const children: any[] = container?.list ?? [];
  const badge = children.find((child) => child?.name === 'buyAndPlacePremiumLabel');
  return badge?.text ?? null;
}

/** `Math.ceil(cost * 1.5 * 2) / 2` — the business buy-and-place premium. */
function premiumOf(cost: number): number {
  return Math.ceil(cost * 1.5 * 2) / 2;
}

describe('Main Street upgrade hand-first click flow (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    try { localStorage.removeItem(TUTORIAL_STATE_STORAGE_KEY); } catch { /* ignore */ }
  });

  it('moving a market upgrade to hand spends one action and leaves it unselected', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1 });

    scene.onUpgradeCardClick(upgrade);

    await waitForCondition(
      () => scene.state.hand.some((c: any) => c.id === upgrade.id),
      'upgrade moved to hand',
    );

    // The move cost the daily action.
    expect(scene.state.actionsRemaining).toBe(0);
    // The market no longer holds the card.
    expect(scene.state.market.cards.some((c: any) => c.id === upgrade.id)).toBe(false);
    // No auto-selection: the card rests in the hand, back in the market phase.
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.pendingHandJustMoved).toBe(false);
    expect(scene.uiPhase).toBe('market');
    // The same-day composite tracker records the moved upgrade.
    expect(scene.state.justMovedUpgradeCardId).toBe(upgrade.id);
  }, 60_000);

  it('clicking the same-day upgrade in hand enters placing-from-hand targeting', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1 });

    scene.onUpgradeCardClick(upgrade);
    await waitForCondition(() => scene.pendingHandIndex === null && scene.uiPhase === 'market' &&
      scene.state.hand.some((c: any) => c.id === upgrade.id), 'upgrade resting in hand');

    scene.onHandUpgradeCardClick(0);

    expect(scene.pendingHandIndex).toBe(0);
    expect(scene.uiPhase).toBe('placing-from-hand');
    // Same-day: the selected card is the one just moved, so the play will be
    // a free composite.
    expect(scene.pendingHandJustMoved).toBe(true);
  }, 60_000);

  it('applying the same-day upgrade to an eligible business does not spend a second action', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1 });

    scene.onUpgradeCardClick(upgrade);
    await waitForCondition(
      () => scene.state.hand.some((c: any) => c.id === upgrade.id) && scene.uiPhase === 'market',
      'upgrade resting in hand',
    );
    expect(scene.state.actionsRemaining).toBe(0);

    scene.onHandUpgradeCardClick(0);
    expect(scene.uiPhase).toBe('placing-from-hand');

    scene.onSlotClick(0);

    await waitForCondition(
      () => scene.state.streetGrid[0]?.level === 1,
      'upgrade applied to the business',
    );

    // Free composite: the move already spent the action.
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.uiPhase).toBe('market');
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.pendingHandJustMoved).toBe(false);
    expect(scene.state.hand.some((c: any) => c.id === upgrade.id)).toBe(false);
    expect(scene.state.justMovedUpgradeCardId).toBeNull();
  }, 60_000);

  it('applying an upgrade held from a previous day spends one action', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1, upgradeInHand: true });

    scene.onHandUpgradeCardClick(0);
    expect(scene.uiPhase).toBe('placing-from-hand');
    // Held (not moved this turn) → not a composite.
    expect(scene.pendingHandJustMoved).toBe(false);

    scene.onSlotClick(0);

    await waitForCondition(
      () => scene.state.streetGrid[0]?.level === 1,
      'held upgrade applied to the business',
    );

    // Held-card play costs the daily action.
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.uiPhase).toBe('market');
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.state.hand.some((c: any) => c.id === upgrade.id)).toBe(false);
  }, 60_000);

  it('clicking an ineligible business keeps the upgrade selected and does not apply it', async () => {
    game = await bootGame();
    const scene = getScene(game);
    // The business sits at level 1 while the upgrade requires level 0 → the
    // upgrade cannot legally target it.
    const { upgrade } = setupUpgradeScene(scene, {
      actions: 1,
      upgradeInHand: true,
      businessLevel: 1,
    });

    scene.onHandUpgradeCardClick(0);
    expect(scene.uiPhase).toBe('placing-from-hand');
    expect(scene.pendingHandIndex).toBe(0);

    scene.onSlotClick(0);

    // Illegal target: no mutation, the upgrade stays selected for a retry.
    expect(scene.uiPhase).toBe('placing-from-hand');
    expect(scene.pendingHandIndex).toBe(0);
    expect(scene.state.streetGrid[0]?.level).toBe(1);
    expect(scene.state.hand.some((c: any) => c.id === upgrade.id)).toBe(true);
    expect(scene.state.actionsRemaining).toBe(1);
  }, 60_000);

  it('shows the premium badge on market upgrades and dims them when the budget is spent', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 1 });

    const container = findMarketCardContainer(scene, upgrade.id);
    expect(container).toBeTruthy();
    // The upgrade advertises the same +50% buy-and-place premium as business
    // cards, and is fully interactive while an action remains.
    expect(premiumBadgeText(container)).toContain(String(premiumOf(upgrade.cost)));
    expect(container!.alpha).toBeCloseTo(1, 5);

    // Spend the budget → the upgrade gates and dims like business cards.
    scene.state.actionsRemaining = 0;
    scene.refreshAll();

    const dimmed = findMarketCardContainer(scene, upgrade.id);
    expect(dimmed).toBeTruthy();
    expect(dimmed!.alpha).toBeCloseTo(0.45, 5);
  }, 60_000);

  it('rejects a market upgrade click when no actions remain', async () => {
    game = await bootGame();
    const scene = getScene(game);
    const { upgrade } = setupUpgradeScene(scene, { actions: 0 });

    scene.onUpgradeCardClick(upgrade);

    // The move is rejected before any transfer: the card stays in the market
    // and the phase is unchanged.
    expect(scene.state.hand.some((c: any) => c.id === upgrade.id)).toBe(false);
    expect(scene.state.market.cards.some((c: any) => c.id === upgrade.id)).toBe(true);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.pendingHandIndex).toBeNull();
    expect(scene.uiPhase).toBe('market');
  }, 60_000);
});
