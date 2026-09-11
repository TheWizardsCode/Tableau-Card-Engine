/**
 * Main Street: staff-applicant presentation browser/scene tests
 * (CG-0MSTOATDU006UGAX AC3/AC5 — walk-on/walk-off presentation,
 * hire/decline interaction, action-free economics, end-turn auto-decline).
 *
 * Engine-side coverage (trigger determinism, hire/decline/let-go, slot
 * capacity) lives in MainStreetApplicant.test.ts; these tests exercise the
 * Phaser scene layer — the applicant overlay renders, hiring employs at the
 * target slot without consuming an action, declining clears with no state
 * side-effects, and an unresolved applicant auto-declines on end turn.
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';

let game: Phaser.Game | null = null;

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Scene & Record<string, any>> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  game = createMainStreetGame(options);
  await waitForScene(game, 'MainStreetScene');
  return game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
}

function destroyGame(): void {
  if (game) {
    game.destroy(true, false);
  }
  game = null;
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Returns a synthetic applicant staff card (or the first real template). */
function makeApplicantCard(overrides: Partial<StaffCard> = {}): StaffCard {
  const template = createStaffDeck(2)[0];
  return {
    ...template,
    id: `applicant-${Math.random().toString(36).slice(2, 8)}`,
    specializationSkillIds: Array.isArray(template.specializationSkillIds) && template.specializationSkillIds.length
      ? template.specializationSkillIds
      : ['skill-town-gossip'],
    ...overrides,
  };
}

/** Ensures street slot 0 is a level-0 business (1 employment slot free). */
function ensureBusinessAtZero(scene: Phaser.Scene & Record<string, any>): void {
  if (!scene.state.streetGrid?.[0]) {
    scene.state.streetGrid[0] = {
      family: 'business',
      id: 'biz-applicant-test',
      name: 'Biz 0',
      synergyTypes: ['Food'],
      maxLevel: 4,
      level: 0,
      baseIncome: 2,
      currentIncome: 2,
      currentReputationPerTurn: 0,
    };
  }
}

afterEach(() => {
  destroyGame();
});

describe('MainStreet applicant presentation (CG-0MTFO4IQO005673N)', () => {
  it('renders the applicant overlay when uiPhase is applicant with a pendingApplicant', async () => {
    const scene = await bootGame();
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    scene.uiPhase = 'applicant';
    scene.refreshAll();

    const overlay = scene.applicantOverlayContainer as Phaser.GameObjects.Container | null;
    expect(overlay).toBeTruthy();
    expect(overlay && overlay.list.length).toBeGreaterThan(0);

    // The card face renders (container has children), the overlay lives in
    // the HUD container above gameplay.
    const inHud = (scene.hudContainer as Phaser.GameObjects.Container).list.some(
      (obj) => obj === overlay,
    );
    expect(inHud).toBe(true);
  });

  it('hire employs the applicant at the target slot and consumes no daily action', async () => {
    const scene = await bootGame();
    ensureBusinessAtZero(scene);
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    (scene.state as any).pendingApplicant = { card, targetSlotIndex: 0 };
    const actionsBefore = scene.state.actionsRemaining;
    const coinsBefore = scene.state.resourceBank.coins;
    const staffBefore = scene.state.staffCards.length;

    scene.uiPhase = 'applicant';
    scene.refreshAll();
    (scene as any).onHireApplicant?.();

    // Hire is action-free and costs no coins; the member is employed at slot 0.
    expect(scene.state.actionsRemaining).toBe(actionsBefore);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.staffCards.length).toBe(staffBefore + 1);
    const hired = scene.state.staffCards[scene.state.staffCards.length - 1];
    expect((hired as any).employedAtSlot).toBe(0);
  });

  it('decline walks the card off with no state side-effects', async () => {
    const scene = await bootGame();
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    (scene.state as any).pendingApplicant = { card, targetSlotIndex: 0 };
    const coinsBefore = scene.state.resourceBank.coins;
    const repBefore = scene.state.resourceBank.reputation;
    const staffBefore = scene.state.staffCards.length;
    // Reduced motion: the walk-off animation completes synchronously so the
    // uiPhase transition to 'market' is immediately observable.
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };
    scene.uiPhase = 'applicant';
    scene.refreshAll();
    (scene as any).onDeclineApplicant?.();

    expect((scene.state as any).pendingApplicant).toBeNull();
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.resourceBank.reputation).toBe(repBefore);
    expect(scene.state.staffCards).toHaveLength(staffBefore);
    expect(scene.uiPhase).toBe('market');
  });

  it('an unresolved applicant auto-declines when the player ends the turn', async () => {
    const scene = await bootGame();
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    (scene.state as any).pendingApplicant = { card, targetSlotIndex: 0 };
    scene.state.phase = 'MarketPhase';
    const staffBefore = scene.state.staffCards.length;
    const coinsBefore = scene.state.resourceBank.coins;

    const result = processEndOfTurn(scene.state as any);

    expect(result.choicePending).not.toBe(true);
    // The engine auto-declines an unresolved applicant without blocking end-turn.
    expect((scene.state as any).pendingApplicant).toBeNull();
    expect(scene.state.staffCards).toHaveLength(staffBefore);
    expect(scene.state.resourceBank.coins).toBeGreaterThanOrEqual(0);
    void coinsBefore;
  });
});
