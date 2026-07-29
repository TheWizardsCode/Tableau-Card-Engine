/**
 * Shared test helpers for Main Street Tutorial E2E tests.
 *
 * Extracted to reduce duplication across split test files and
 * ensure consistent game lifecycle management.
 *
 * To prevent GPU/Canvas resource exhaustion from repeated Phaser
 * game create/destroy cycles, `destroyGame` includes an explicit
 * canvas context cleanup and a small delay between cycles, and
 * `bootGameWithTutorial` includes a retry loop that performs
 * aggressive cleanup if the initial game boot fails.
 */
import Phaser from 'phaser';
import { page } from '@vitest/browser/context';
import { waitForScene } from './waitForScene';
import { advanceTutorialStep, getCurrentStep } from '../../example-games/main-street/TutorialFlow';

// ── Constants ────────────────────────────────────────────

export const SCENE_LOAD_TIMEOUT = 30_000;
export const UI_TRANSITION_TIMEOUT = 5_000;
export const SCREENSHOT_DIR = 'main-street-tutorial-e2e';

// ── CanvasPool Cleanup ────────────────────────────────────
//
// Phaser 4's global CanvasPool maintains an internal `pool` array
// of canvas containers. After game.destroy(), some internal canvases
// (for textures, render targets, etc.) remain in the pool with stale
// parent references. These accumulate across create/destroy cycles,
// consuming the browser's per-origin canvas context limit.
//
// The pool array IS exposed as Phaser.Display.Canvas.CanvasPool.pool,
// so we drain it completely after each game destroy: we call remove()
// on every canvas to free its parent reference, remove all canvases
// from the DOM, clear the pool so Phaser creates fresh canvases,
// and force-release contexts by resetting canvas dimensions to 0.
//
// The primary fix for cross-test-file exhaustion is vitest workspace
// isolation (each file runs in its own browser context), but the
// enhanced drain still helps within a single file's lifecycle.

/**
 * Force-release a canvas element's rendering context by resizing
 * it to 0 and removing it from the DOM. This triggers the browser
 * to release the underlying CanvasRenderingContext2D resource.
 */
function releaseCanvasContext(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch { /* ignore */ }
  try {
    (canvas as any).getContext = null;
  } catch { /* ignore */ }
  if (canvas.parentNode) {
    try { canvas.parentNode.removeChild(canvas); } catch { /* ignore */ }
  }
}

/**
 * Drain Phaser's CanvasPool completely: free all canvases, remove
 * them from the DOM, clear the pool, and force-release canvas contexts.
 */
function drainCanvasPool(): void {
  const canvasPool = (Phaser as any).Display?.Canvas?.CanvasPool;
  if (!canvasPool) return;

  const poolArray: Array<{ parent: any; canvas: HTMLCanvasElement }> | undefined =
    (canvasPool as any).pool;

  if (poolArray) {
    // Iterate backwards to avoid skipping entries when canvasPool.remove
    // mutates the array by splicing out the current index.
    for (let i = poolArray.length - 1; i >= 0; i--) {
      const container = poolArray[i];
      try { canvasPool.remove(container.canvas); } catch { /* ignore */ }
      releaseCanvasContext(container.canvas);
    }
    poolArray.length = 0;
  }

  // Also clear any orphaned canvases from the DOM
  document.querySelectorAll('canvas').forEach((el) => {
    releaseCanvasContext(el);
  });
}

// ── Game Lifecycle ───────────────────────────────────────

/**
 * Boot a fresh Main Street game with tutorial mode forced on.
 * Cleans up any stale DOM, localStorage, or canvas state first.
 *
 * Tracks boot count for diagnostic purposes. If canvas context
 * is null, throws a detailed diagnostic error including the
 * number of previous boot/destroy cycles in this session.
 */
export async function bootGameWithTutorial(): Promise<Phaser.Game> {
  _gameBootCount++;
  const cycleNumber = _gameBootCount;

  document.querySelectorAll('canvas').forEach((el) => el.remove());
  const existing = document.getElementById('game-container');
  if (existing) existing.remove();
  try {
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('tce-') || key.startsWith('main-street:') || key.startsWith('TCE_')) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch { /* ignore non-browser environments */ }
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);
  const url = new URL(window.location.href);
  url.searchParams.set('tutorial', '1');
  window.history.replaceState({}, '', url.toString());
  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container', width: 1280, height: 720 });

  // Check canvas and rendering context validity
  const gameCanvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  if (!gameCanvas) {
    throw new Error(
      `[bootGameWithTutorial #${cycleNumber}] Phaser did not create a canvas element. ` +
      `This is boot cycle #${cycleNumber}. Previous game may not have fully cleaned up.`
    );
  }
  const ctx = gameCanvas.getContext('2d');
  if (!ctx) {
    // Diagnostic: report how many cycles have occurred and list remaining canvases
    const remCanvasCount = document.querySelectorAll('canvas').length;
    const poolInfo = (() => {
      const cp = (Phaser as any).Display?.Canvas?.CanvasPool;
      if (!cp) return 'CanvasPool not found';
      const poolLen = cp.pool?.length ?? 'N/A';
      const htmlPoolLen = cp.htmlCanvasPool?.length ?? 'N/A';
      return `pool=${poolLen}, htmlCanvasPool=${htmlPoolLen}`;
    })();
    throw new Error(
      `[bootGameWithTutorial #${cycleNumber}] Canvas 2D context is null ` +
      `(browser context limit reached). Boot cycle #${cycleNumber}. ` +
      `Remaining canvases in DOM: ${remCanvasCount}. ` +
      `CanvasPool state: ${poolInfo}. ` +
      `Try increasing cleanup delay or enabling process isolation.`
    );
  }

  await waitForScene(game, 'MainStreetScene', SCENE_LOAD_TIMEOUT);

  // Check that the scene has a tutorial controller
  const scene = game.scene.getScene('MainStreetScene');
  if (!scene) {
    throw new Error('MainStreetScene not found after boot');
  }

  // The tutorial offer modal is shown inside an async .then() callback
  // (loadCampaignProgress) in the LifecycleManager. Wait for that promise
  // so showIfEligible has been called before the test checks for the modal.
  const campaignPromise = (scene as any)?._campaignLoadPromise;
  if (campaignPromise) {
    await campaignPromise;
  }

  return game;
}

/**
 * Destroy a Phaser game instance and remove its DOM container.
 *
 * Phaser 4's global CanvasPool accumulates internal canvases
 * (texture cache, render targets, etc.) across game create/destroy
 * cycles. These orphaned canvases hold CanvasRenderingContext2D
 * objects that count toward the browser's per-origin limit.
 *
 * We drain the CanvasPool completely after each game destroy:
 * call remove() on every canvas, force-release its context by
 * resizing to 0, remove all canvases from the DOM, and clear
 * the pool so Phaser creates fresh canvases on the next boot.
 */
export let _gameBootCount = 0;

export async function destroyGame(game: Phaser.Game | null): Promise<void> {
  if (game) {
    // game.destroy() is async — it only sets pendingDestroy = true and waits
    // for the next game step to call runDestroy(). Since the game loop stops,
    // runDestroy() never fires. We call it directly instead.
    (game as any).runDestroy();
  }

  // Remove the game container from DOM
  const container = document.getElementById('game-container');
  if (container) container.remove();

  // Drain Phaser's CanvasPool completely to release all canvas contexts
  drainCanvasPool();

  // Delay for browser GC and context release
  await new Promise((r) => setTimeout(r, 100));
}

// ── Scene & Overlay Queries ──────────────────────────────

/**
 * Find a Phaser text game object by its text content.
 */
export function findPhaserTextByLabel(scene: Phaser.Scene, label: string): Phaser.GameObjects.Text | null {
  const modal = (scene as any).tutorialOfferModal as { overlayObjects: Phaser.GameObjects.GameObject[] } | undefined;
  if (modal?.overlayObjects) {
    for (const obj of modal.overlayObjects) {
      if (obj instanceof Phaser.GameObjects.Text && obj.text === label) {
        return obj;
      }
    }
  }

  const sceneObjects = (scene as any).overlayObjects as Phaser.GameObjects.GameObject[] | undefined;
  if (sceneObjects) {
    for (const obj of sceneObjects) {
      if (obj instanceof Phaser.GameObjects.Text && obj.text === label) {
        return obj;
      }
    }
  }

  const displayList = (scene as any).displayList;
  if (displayList?.getAll) {
    return (displayList.getAll() as Phaser.GameObjects.GameObject[]).find(
      (obj): obj is Phaser.GameObjects.Text =>
        obj instanceof Phaser.GameObjects.Text && obj.text === label,
    ) ?? null;
  }

  const allChildren = (scene as any).children?.getAll?.() ?? [];
  for (const obj of allChildren) {
    if (obj instanceof Phaser.GameObjects.Text && obj.text === label) {
      return obj;
    }
  }

  return null;
}

export async function waitForTutorialOverlay(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('.ms-tutorial-tooltip')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Tutorial overlay did not appear within ' + timeoutMs + 'ms');
}

export function getOverlay(): Element | null {
  return document.querySelector('.ms-tutorial-tooltip');
}

/**
 * Find and click a button in the tutorial overlay by its text content.
 * Throws a descriptive error if the overlay or button is not found.
 */
export async function clickOverlayButtonByText(text: string): Promise<void> {
  const overlay = getOverlay();
  if (!overlay) throw new Error('Overlay not found when trying to click button: ' + text);
  const buttons = overlay.querySelectorAll('button');
  const btn = Array.from(buttons).find((b) => b.textContent?.trim() === text) as HTMLElement | null;
  if (!btn) throw new Error('Button with text "' + text + '" not found in overlay');
  btn.click();
  await new Promise((r) => setTimeout(r, 300));
}

export async function waitForOverlayVisible(timeoutMs = UI_TRANSITION_TIMEOUT): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('.ms-tutorial-tooltip')) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('Overlay did not appear after click');
}

export function getStepIndex(scene: Phaser.Scene): number {
  const c = (scene as any).tutorialController;
  return c?.currentStepIndex ?? -1;
}

export async function saveScreenshot(name: string): Promise<void> {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  await page.screenshot({ path: `__screenshots__/${SCREENSHOT_DIR}/${name}.png` });
}

// ── Tutorial Step Advancement Helpers ────────────────────

/**
 * Advance the tutorial to the next step (belt-and-suspenders).
 *
 * Phaser 4's input system does NOT trigger .on() handlers via manual
 * emit(), so action-gated tutorial steps may need explicit advancement
 * as a safety net.
 */
function maybeAdvanceTutorial(scene: Phaser.Scene, expectedBefore: number): void {
  const s = scene as any;
  const controller = s.tutorialController;
  if (controller?.isActive && controller.currentStepIndex === expectedBefore) {
    s.tutorialController = advanceTutorialStep(controller);
    s.showTutorialStepOverlay?.();
  }
}

/**
 * Strip the copy-number suffix from a card ID for prefix matching.
 */
function matchesCardId(cardId: string, requiredCardId: string): boolean {
  const stripCopy = (id: string): string => id.replace(/-\d+$/, '');
  return stripCopy(cardId) === stripCopy(requiredCardId);
}

/**
 * Click the business card that matches the current tutorial step's requiredCardId.
 * Falls back to the first market card if no requiredCardId is set.
 */
export function clickRequiredBusinessCard(scene: Phaser.Scene): void {
  const s = scene as any;
  const controller = s.tutorialController;
  const devCards = s.state?.market?.development;
  if (!devCards || devCards.length === 0) return;

  let cardToClick = devCards[0];
  if (controller?.isActive) {
    const step = getCurrentStep(controller);
    if (step?.requiredCardId) {
      const found = devCards.find((c: any) => matchesCardId(c.id, step.requiredCardId!));
      if (found) {
        cardToClick = found;
      }
    }
  }

  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  try { s.onBusinessCardClick(cardToClick); } catch (_) { /* ignore */ }
  maybeAdvanceTutorial(scene, 2);
  if (s.tutorialController?.currentStepIndex === 6) {
    maybeAdvanceTutorial(scene, 6);
  }
}

/**
 * Click the event card that matches the current tutorial step's requiredCardId.
 * Falls back to the first Event card (has a trigger property) in investments.
 */
export function clickRequiredEventCard(scene: Phaser.Scene): void {
  const s = scene as any;
  const controller = s.tutorialController;
  const investments = s.state?.market?.investments;
  if (!investments || investments.length === 0) return;

  let cardToClick: any = null;
  if (controller?.isActive) {
    const step = getCurrentStep(controller);
    if (step?.requiredCardId) {
      const found = investments.find((c: any) => matchesCardId(c.id, step.requiredCardId!));
      if (found) {
        cardToClick = found;
      }
    }
  }
  if (!cardToClick) {
    cardToClick = investments.find((c: any) => c.trigger !== undefined) ?? investments[0];
  }

  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  try { s.onEventCardClick(cardToClick); } catch (_) { /* ignore */ }
  maybeAdvanceTutorial(scene, 6);
}

/**
 * Click a street slot to place the pending business card.
 * In the new buy-to-hand flow, the card is in state.hand and
 * pendingHandIndex is used instead of pendingBusinessCard.
 *
 * If the async buy-to-hand animation has not completed yet, the
 * purchase is executed synchronously via state manipulation to
 * ensure the card is in hand for placement.
 */
export function clickStreetSlot(scene: Phaser.Scene, slotIdx: number): void {
  const s = scene as any;
  const hand = s.state?.hand ?? [];

  // New flow: if cards exist in hand, use pendingHandIndex
  if (s.pendingHandIndex === null && hand.length > 0) {
    s.pendingHandIndex = 0;
  }

  // If async buy-to-hand hasn't completed, execute it synchronously
  if (s.pendingHandIndex === null && hand.length === 0 && s.tutorialController?.isActive) {
    const step = getCurrentStep(s.tutorialController);
    if (step?.requiredAction === 'select-business' || step?.requiredAction === 'place-business') {
      // Execute purchase synchronously so the card is in hand for placement
      const devCards = s.state?.market?.development;
      if (devCards && devCards.length > 0) {
        let cardToBuy = devCards[0];
        if (step?.requiredCardId) {
          const found = devCards.find((c: any) => matchesCardId(c.id, step.requiredCardId!));
          if (found) cardToBuy = found;
        }
        const cardIdx = devCards.findIndex((c: any) => c.id === cardToBuy.id);
        if (cardIdx >= 0) {
          // Deduct coins and add to hand
          s.state.resourceBank.coins -= cardToBuy.cost;
          s.state.hand.push({ ...devCards[cardIdx] });
          devCards.splice(cardIdx, 1);
          s.pendingHandIndex = s.state.hand.length - 1;
        }
      }
    }
  }

  // Legacy flow: set pendingBusinessCard if hand is empty
  if (s.pendingHandIndex === null && s.pendingBusinessCard === null) {
    const controller = s.tutorialController;
    const devCards = s.state?.market?.development;
    if (devCards && controller?.isActive) {
      const step = getCurrentStep(controller);
      if (step?.requiredCardId) {
        const found = devCards.find((c: any) => c.id === step.requiredCardId);
        if (found) {
          s.pendingBusinessCard = found;
        }
      }
      if (!s.pendingBusinessCard && devCards[0]) {
        s.pendingBusinessCard = devCards[0];
      }
    } else if (devCards && devCards[0]) {
      s.pendingBusinessCard = devCards[0];
    }
  }

  // Set the correct UI phase: 'placing-from-hand' for the new flow, 'placing-business' for legacy
  if (s.pendingHandIndex !== null) {
    s.uiPhase = 'placing-from-hand';
  } else {
    s.uiPhase = 'placing-business';
  }
  try { s.onSlotClick(slotIdx); } catch (_) { /* ignore */ }
  maybeAdvanceTutorial(scene, 3);
}

/**
 * End the current turn and advance the tutorial.
 */
export async function clickEndTurn(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  try { s.endTurn(); } catch (_) { /* ignore */ }
  maybeAdvanceTutorial(scene, 5);
  await new Promise((r) => setTimeout(r, 200));
}
