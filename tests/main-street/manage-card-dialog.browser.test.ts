/**
 * Main Street: Manage Card dialog browser tests (CG-0MTFWJUN5001F53Z)
 *
 * Verifies the street-card Manage dialog end to end in a real Phaser scene:
 *
 * 1. Clicking a non-sold street card during MarketPhase opens the dialog with
 *    [Sell] [Close] [Cancel], built through the shared overlay helpers
 *    (backdrop 199 / box 200 / interactive 201) and parented into the HUD
 *    container.
 * 2. [Close] commits the close: the card is removed from the grid into the
 *    discard pile, exactly one daily action is consumed, no coins change, the
 *    activity log gains an entry, `MainStreetAnimator.animateClose` fires, and
 *    the discard SFX plays.
 * 3. [Cancel] dismisses the dialog with no state change.
 * 4. Sold cards never open the dialog, and `animateClose` degrades safely in
 *    reduced-motion and replay/headless modes (resolves, no state mutation).
 *
 * The overlay presentation is non-blocking; the game state is committed
 * synchronously by `closeBusinessCommand` when [Close] is pressed.
 *
 * @module tests/main-street/manage-card-dialog.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { createStaffDeck, getBusinessTemplates, type BusinessCard, type StaffCard } from '../../example-games/main-street/MainStreetCards';

// ── Boot helpers (mirrors sell-demolition.browser.test.ts) ──

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

function makeBusiness(): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  return {
    ...tpl,
    id: `manage-dialog-${tpl.id}`,
    family: 'business',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

/** The subset of MainStreetScene state/fields this suite touches. */
interface ManageScene extends Phaser.Scene {
  state: {
    streetGrid: Array<BusinessCard | null>;
    resourceBank: { coins: number; reputation: number };
    soldSlots: boolean[];
    discardPile: Array<{ id: string }>;
    activityLog: Array<{ text: string }>;
    actionsRemaining: number;
    phase: string;
    staffCards: StaffCard[];
  };
  overlayObjects: Phaser.GameObjects.GameObject[];
  hudContainer?: Phaser.GameObjects.Container;
  uiPhase: string;
  refreshAll: () => void;
  msAnimator: {
    animateClose: (params: { slotIndex: number; cardId: string; family: string }) => Promise<void>;
  };
  msTurnController: { onSellCard: (slotIndex: number) => void };
  settingsPanel?: { _reducedMotion?: boolean };
}

/** All overlay text objects (buttons are Text objects with a `text` value). */
function overlayTexts(scene: ManageScene): Phaser.GameObjects.Text[] {
  return (scene.overlayObjects ?? []).filter(
    (o) => typeof (o as unknown as { text?: unknown }).text === 'string',
  ) as Phaser.GameObjects.Text[];
}

function findOverlayButton(scene: ManageScene, label: string): Phaser.GameObjects.Text {
  const btn = overlayTexts(scene).find((o) => o.text === label);
  if (!btn) {
    throw new Error(
      `Overlay button ${label} not found. Present: ${overlayTexts(scene).map((o) => o.text).join(', ')}`,
    );
  }
  return btn;
}

/** Places a fresh business card on the given slot and re-renders. */
function placeCard(scene: ManageScene, slotIndex: number): BusinessCard {
  const biz = makeBusiness();
  scene.state.streetGrid[slotIndex] = biz;
  scene.state.resourceBank.coins = 50;
  scene.state.actionsRemaining = 1;
  scene.refreshAll();
  return biz;
}

describe('MainStreet Manage Card dialog', () => {
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

  it('opens [Sell] [Close] [Cancel] for a non-sold street card, HUD-parented at depth 201', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    placeCard(scene, 0);

    scene.msTurnController.onSellCard(0);

    const sellBtn = findOverlayButton(scene, '[ Sell ]');
    const closeBtn = findOverlayButton(scene, '[ Close ]');
    const cancelBtn = findOverlayButton(scene, '[ Cancel ]');

    for (const btn of [sellBtn, closeBtn, cancelBtn]) {
      expect(btn.depth).toBe(201);
      // AC1: every interactive element must be parented into hudContainer.
      expect(scene.hudContainer?.list.includes(btn)).toBe(true);
    }

    // Title reflects the Manage dialog, and the Close cost is explicit.
    expect(overlayTexts(scene).some((o) => o.text === 'Manage Card')).toBe(true);
    expect(
      overlayTexts(scene).some((o) => o.text.includes('costs 1 action')),
    ).toBe(true);

    // Depth convention: backdrop 199, visible box 200.
    const depths = (scene.overlayObjects ?? []).map((o) => (o as unknown as { depth?: number }).depth);
    expect(depths).toContain(199);
    expect(depths).toContain(200);

    // Cleanup: cancel so the dialog does not leak into later assertions.
    cancelBtn.emit('pointerdown');
    expect(scene.overlayObjects).toHaveLength(0);
  }, 30_000);

  it('[Close] removes the card, spends one action, logs, and triggers animateClose + discard SFX', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    const biz = placeCard(scene, 0);

    const coinsBefore = scene.state.resourceBank.coins;
    const discardBefore = scene.state.discardPile.length;
    const logBefore = scene.state.activityLog.length;

    // Spy on the close animation and the SFX (run the real implementation).
    const animator = scene.msAnimator;
    const originalClose = animator.animateClose.bind(animator);
    const closeCalls: Array<{ slotIndex: number; cardId: string; family: string }> = [];
    vi.spyOn(animator, 'animateClose').mockImplementation((params) => {
      closeCalls.push(params);
      return originalClose(params);
    });

    const soundManager = (scene as unknown as { soundManager?: { play: (key: string) => void } }).soundManager;
    const sfxCalls: string[] = [];
    if (soundManager) {
      vi.spyOn(soundManager, 'play').mockImplementation((key: string) => {
        sfxCalls.push(key);
      });
    }

    scene.msTurnController.onSellCard(0);
    findOverlayButton(scene, '[ Close ]').emit('pointerdown');

    // State committed synchronously by the command.
    expect(scene.state.streetGrid[0]).toBeNull();
    expect(scene.state.discardPile).toHaveLength(discardBefore + 1);
    expect(scene.state.discardPile[scene.state.discardPile.length - 1].id).toBe(biz.id);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.activityLog).toHaveLength(logBefore + 1);
    expect(scene.state.activityLog[scene.state.activityLog.length - 1].text).toContain(biz.name);
    expect(scene.overlayObjects).toHaveLength(0);

    // Animation fired with the closed slot's identity.
    await waitForCondition(() => closeCalls.length >= 1, { label: 'animateClose trigger' });
    expect(closeCalls[0].slotIndex).toBe(0);
    expect(closeCalls[0].cardId).toBe(biz.id);
    expect(closeCalls[0].family).toBe('business');

    // Discard SFX follows the demolition tween (~380ms) in full-motion mode.
    if (soundManager) {
      await waitForCondition(() => sfxCalls.includes('sfx-discard'), {
        timeoutMs: 5000,
        label: 'discard SFX',
      });
    }
  }, 30_000);

  it('[Cancel] dismisses the dialog with no state change', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    const biz = placeCard(scene, 0);

    const coinsBefore = scene.state.resourceBank.coins;
    const discardBefore = scene.state.discardPile.length;

    scene.msTurnController.onSellCard(0);
    findOverlayButton(scene, '[ Cancel ]').emit('pointerdown');

    expect(scene.overlayObjects).toHaveLength(0);
    expect(scene.state.streetGrid[0]?.id).toBe(biz.id);
    expect(scene.state.actionsRemaining).toBe(1);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.discardPile).toHaveLength(discardBefore);
  }, 30_000);

  it('offers no lay-off affordance when the managed card employs nobody', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    placeCard(scene, 0);
    scene.state.staffCards = [];
    scene.refreshAll();

    scene.msTurnController.onSellCard(0);

    const labels = overlayTexts(scene).map((o) => o.text);
    expect(labels).not.toContain('[ Lay off ]');
    expect(labels.some((t) => t.includes('Employed here'))).toBe(false);
  }, 30_000);

  it('[ Lay off ] lists employed staff and lets the member go for 1 salary + 1 reputation', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    placeCard(scene, 0);

    // Employ one job applicant at slot 0, with fewer coins than its salary so
    // the salary deduction clamps at 0 (never negative).
    const member: StaffCard = {
      ...createStaffDeck(1)[0],
      id: 'manage-dialog-employed-member',
      name: 'Test Applicant',
      employedAtSlot: 0,
    };
    scene.state.staffCards = [member];
    scene.state.resourceBank.reputation = 5;
    scene.state.resourceBank.coins = 0;
    scene.refreshAll();

    scene.msTurnController.onSellCard(0);

    // The dialog names the employed member and offers the action.
    const listing = overlayTexts(scene).find((o) => o.text.includes('Employed here'));
    expect(listing?.text).toContain('Test Applicant');
    const logBefore = scene.state.activityLog.length;

    findOverlayButton(scene, '[ Lay off ]').emit('pointerdown');

    // Member removed, 1 reputation spent, salary clamped at 0 coins, logged,
    // and the overlay dismissed.
    expect(scene.state.staffCards).toHaveLength(0);
    expect(scene.state.resourceBank.reputation).toBe(4);
    expect(scene.state.resourceBank.coins).toBe(0);
    expect(scene.overlayObjects).toHaveLength(0);
    expect(scene.state.activityLog).toHaveLength(logBefore + 1);
    expect(scene.state.activityLog[scene.state.activityLog.length - 1].text).toContain('Laid off');
  }, 30_000);

  it('sold cards open no dialog; animateClose degrades safely under reduced motion and replay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as ManageScene;
    const biz = placeCard(scene, 0);

    // AC4: a sold card is never closeable and opens no Manage dialog.
    scene.state.soldSlots[0] = true;
    scene.refreshAll();
    scene.msTurnController.onSellCard(0);
    expect(scene.overlayObjects).toHaveLength(0);

    // AC5 (reduced motion): resolves with a sound-only fallback, no mutation.
    if (scene.settingsPanel) scene.settingsPanel._reducedMotion = true;
    await expect(
      scene.msAnimator.animateClose({ slotIndex: 0, cardId: biz.id, family: 'business' }),
    ).resolves.toBeUndefined();

    // AC5 (replay/headless): resolves immediately, no rendering or audio.
    (scene as unknown as { replayMode: boolean }).replayMode = true;
    await expect(
      scene.msAnimator.animateClose({ slotIndex: 0, cardId: biz.id, family: 'business' }),
    ).resolves.toBeUndefined();

    // The animator is presentation-only: the grid is untouched.
    expect(scene.state.streetGrid[0]?.id).toBe(biz.id);
  }, 30_000);
});
