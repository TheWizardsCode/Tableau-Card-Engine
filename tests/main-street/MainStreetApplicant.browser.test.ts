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
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';

let game: Phaser.Game | null = null;

/** Forces the reduced-motion path without replacing the SettingsPanel object. */
function forceReducedMotion(scene: Phaser.Scene & Record<string, any>): void {
  (scene.settingsPanel as { _reducedMotion: boolean })._reducedMotion = true;
}

/** Polls `predicate` until it is true, or throws after `timeoutMs`. */
async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

/**
 * Returns the labels of the buttons rendered inside the applicant overlay.
 * `createActionButton` returns a Container holding its Text label, so button
 * labels are found one level below the overlay container.
 */
function overlayButtonLabels(scene: Phaser.Scene & Record<string, any>): string[] {
  const overlay = scene.applicantOverlayContainer as Phaser.GameObjects.Container | null;
  if (!overlay) return [];
  const labels: string[] = [];
  for (const child of overlay.list as Phaser.GameObjects.GameObject[]) {
    if (child instanceof Phaser.GameObjects.Container) {
      for (const inner of child.list as Phaser.GameObjects.GameObject[]) {
        if (inner instanceof Phaser.GameObjects.Text) labels.push(inner.text);
      }
    }
  }
  return labels;
}

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Scene & Record<string, any>> {
  // Clear persisted checkpoints/tutorial state so each test boots a fresh
  // game rather than resuming one saved by an earlier test's end-turn.
  try { localStorage.clear(); } catch { /* ignore */ }

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

  it('offers Hire and Decline actions on the applicant overlay', async () => {
    const scene = await bootGame();
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    scene.uiPhase = 'applicant';
    scene.refreshAll();

    const labels = overlayButtonLabels(scene);
    expect(labels).toContain('Hire');
    expect(labels).toContain('Decline');
  });

  it('walks the applicant on from the left screen edge to the SLL anchor centre', async () => {
    const scene = await bootGame();
    // Explicitly exercise the animated (non-reduced-motion) path.
    (scene.settingsPanel as { _reducedMotion: boolean })._reducedMotion = false;
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    scene.uiPhase = 'applicant';
    scene.refreshAll();

    const overlay = scene.applicantOverlayContainer as Phaser.GameObjects.Container;
    expect(overlay).toBeTruthy();
    const targetX = scene.layout.applicantCenterX as number;

    // Enters from off the left edge — not already at its resting position.
    expect(overlay.x).toBeLessThan(0);

    // …and settles at the SLL applicantOverlay anchor centre.
    await waitFor(() => Math.abs(overlay.x - targetX) <= 2);
    expect(Math.abs(overlay.x - targetX)).toBeLessThanOrEqual(2);
    expect(overlay.y).toBe(scene.layout.applicantCenterY);
  });

  it('reuses the rendered overlay across refreshes instead of replaying the walk-on', async () => {
    const scene = await bootGame();
    const card = makeApplicantCard();
    scene.pendingApplicant = { card, targetSlotIndex: 0 };
    scene.uiPhase = 'applicant';
    scene.refreshAll();

    const first = scene.applicantOverlayContainer;
    expect(first).toBeTruthy();

    // Repeated refreshes must not rebuild the overlay — a rebuild restarts
    // the walk-on tween, yanking the card back off-screen on every refresh.
    scene.refreshAll();
    scene.refreshAll();

    expect(scene.applicantOverlayContainer).toBe(first);
    expect(scene.applicantRenderedId).toBe(card.id);
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
    // Reduced motion completes the walk-in synchronously so the post-hire
    // HUD update is observable immediately.
    forceReducedMotion(scene);

    scene.uiPhase = 'applicant';
    scene.refreshAll();
    (scene as any).onHireApplicant?.();

    // Hire is action-free and costs no coins; the member is employed at slot 0.
    expect(scene.state.actionsRemaining).toBe(actionsBefore);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore);
    expect(scene.state.staffCards.length).toBe(staffBefore + 1);
    const hired = scene.state.staffCards[scene.state.staffCards.length - 1];
    expect((hired as any).employedAtSlot).toBe(0);

    // The applicant decision is over: overlay gone, phase back to market.
    expect(scene.applicantOverlayContainer).toBeNull();
    expect(scene.pendingApplicant).toBeNull();
    expect(scene.uiPhase).toBe('market');
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
    forceReducedMotion(scene);
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
    // Reduced motion completes the walk-off synchronously, so the decline is
    // fully observable the moment endTurn() returns.
    forceReducedMotion(scene);

    const staffBefore = scene.state.staffCards.length;
    scene.uiPhase = 'applicant';
    scene.refreshAll();
    expect(scene.applicantOverlayContainer).toBeTruthy();

    (scene.msTurnController as unknown as { endTurn: () => void }).endTurn();

    // The applicant is declined (never employed) and its overlay torn down —
    // and crucially the turn proceeded instead of blocking on the applicant.
    expect((scene.state as any).pendingApplicant).toBeNull();
    expect(scene.pendingApplicant).toBeNull();
    expect(scene.applicantOverlayContainer).toBeNull();
    expect(scene.state.staffCards).toHaveLength(staffBefore);
    expect(scene.uiPhase).not.toBe('applicant');
  });
});
