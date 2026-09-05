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
import { advanceTutorialStep, getCurrentStep, UNIFIED_TUTORIAL_STEPS } from '../../example-games/main-street/TutorialFlow';
import { PREMIUM_DIALOG_DISMISSED_KEY } from '../../example-games/main-street/MainStreetPrefs';

// ── Constants ────────────────────────────────────────────

/**
 * Scene-load wait inside bootGameWithTutorial. Under CPU contention the
 * scene boot + lifecycle init (TutorialOfferModal construction, HUD wiring,
 * SVG prewarm) stretches well past the old 30s; this only affects failure
 * latency, never correctness (CG-0MTG4EAVR005JB3W).
 */
export const SCENE_LOAD_TIMEOUT = 90_000;
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

  // Boot retry loop (CG-0MTGHZWOO001WWOU): under full-suite resource
  // pressure (dozens of Phaser game create/destroy cycles in one browser
  // context), a boot's async tutorial-offer chain can stall: checkAndResume()
  // (fire-and-forget inside the _campaignLoadPromise .then callback) may
  // take long enough that the offer modal's show() is delayed, or the
  // swallowed-error fallback paths in the lifecycle manager can silently
  // skip showing it entirely. A retry after a full destroy + GC-settling
  // delay usually boots cleanly. Only when all retries fail do we surface
  // the diagnostic error.
  const MAX_BOOT_ATTEMPTS = 3;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_BOOT_ATTEMPTS; attempt++) {
    try {
      return await attemptBoot(cycleNumber, attempt);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(
        `[bootGameWithTutorial #${cycleNumber}] Boot attempt ${attempt}/${MAX_BOOT_ATTEMPTS} failed: ` +
        `${lastError.message}. Destroying game and retrying after GC settle...`,
      );
      if (attempt < MAX_BOOT_ATTEMPTS) {
        try { await destroyGame(lastErrorBootGame); } catch { /* ignore */ }
        lastErrorBootGame = null;
        // Extended GC-settling delay between attempts: the browser needs
        // time to release canvas contexts / collect garbage before the next
        // Phaser boot can render.
        await new Promise((r) => setTimeout(r, 1_000));
        // Re-wipe stale saves so the retry boots clean.
        try { await clearStaleMainStreetSaves(); } catch { /* best-effort */ }
      }
    }
  }
  throw lastError ?? new Error('[bootGameWithTutorial] all boot attempts failed');
}

/** The most recently created game instance from attemptBoot (for retry cleanup). */
let lastErrorBootGame: Phaser.Game | null = null;

/**
 * Single boot attempt: clean DOM/localStorage/IndexedDB, create the game,
 * wait for the scene + campaign load, and verify the tutorial offer modal
 * (or resume overlay) rendered.
 */
async function attemptBoot(cycleNumber: number, attempt: number): Promise<Phaser.Game> {
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

  // Stale-checkpoint hardening (CG-0MTFREYSJ005EW43): each vitest browser
  // session runs its file queue sequentially in ONE browser context, so a
  // previously executed file's game can leave 'run-checkpoint'/'campaign'
  // records behind (a turn-end autosave resolving after its own destroyGame
  // clear, ~50% under parallel-browser CPU contention). That routes this
  // boot into checkAndResume(), suppressing the '[ Start Tutorial ]' offer
  // and failing waitForStartButton. Wipe the two slots with plain readwrite
  // transactions (NO deleteDatabase: a version-change delete would block
  // this boot's own SaveLoadStore.open() — see CG-0MTFREYSJ005EW43 wedge
  // note). Best-effort, race-capped so the boot can never hang on it.
  await clearStaleMainStreetSaves();
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
  lastErrorBootGame = game;

  // Same-turn buy-and-play charged a +50% premium and fired a one-time
  // explainer dialog (CG-0MT24X0SX007RLHN). The two-turn tutorial rework
  // (CG-0MT53NXGZ004H5AE) removed same-turn placements entirely: every
  // placement follows an End Turn, so no step ever requests the premium and
  // the dialog never fires. Pre-setting the dismissal key is therefore
  // redundant but harmless (kept so a stale manual save never interrupts).
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREMIUM_DIALOG_DISMISSED_KEY, 'true');
    }
  } catch { /* ignore */ }

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
  // (loadCampaignProgress) in the LifecycleManager — and crucially
  // checkAndResume() (itself async, fire-and-forget) runs inside that
  // callback, so _campaignLoadPromise can resolve BEFORE the modal's
  // show() executes. Wait for that promise, then poll for the modal:
  // (a) a late-but-healthy show must not be treated as a failure, and
  // (b) a stale checkpoint from a PREVIOUS test file routes the boot into
  // the resume overlay instead — detect its '[ New Game ]' button and
  // click it to clear (CheckpointManager.onNewGame → clear() →
  // freshStartFn → tutorial offer). See CG-0MTFREYSJ005EW43 /
  // CG-0MTGHZWOO001WWOU.
  const campaignPromise = (scene as any)?._campaignLoadPromise;
  if (campaignPromise) {
    await campaignPromise;
  }

  const modal = (scene as any).tutorialOfferModal as
    | { isVisible?: boolean; overlayObjects?: Phaser.GameObjects.GameObject[] }
    | undefined;

  const MODAL_POLL_TIMEOUT = 15_000;
  const modalDeadline = Date.now() + MODAL_POLL_TIMEOUT;
  while (Date.now() < modalDeadline && modal && !modal.isVisible) {
    // Stale-checkpoint path: if the resume overlay is showing, click
    // '[ New Game ]' to clear the checkpoint and surface the tutorial offer.
    const resumeBtn = findPhaserTextByLabel(scene, '[ Resume ]');
    const newGameBtn = findPhaserTextByLabel(scene, '[ New Game ]');
    if (newGameBtn && resumeBtn) {
      console.warn(
        `[bootGameWithTutorial #${cycleNumber}] Stale checkpoint detected: resume ` +
        `overlay shown instead of tutorial offer. Clicking '[ New Game ]' to clear.`,
      );
      newGameBtn.emit('pointerdown', {
        x: newGameBtn.x,
        y: newGameBtn.y,
        worldX: newGameBtn.x,
        worldY: newGameBtn.y,
      });
      // onNewGame clears async then shows the modal; give it a beat before
      // the next poll iteration re-checks isVisible.
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // Verify the tutorial offer modal was actually shown. Under resource
  // pressure from preceding browser tests, the scene can load but the
  // modal's async show() chain can stall or throw silently (errors are
  // swallowed by the lifecycle manager's catch-all), leaving
  // waitForStartButton to time out after 40 s. A diagnostic throw here
  // converts that silent flakiness into a clear, fast failure with
  // actionable context. See CG-0MTGHZWOO001WWOU.
  if (modal && !modal.isVisible) {
    const state = (scene as any).campaign?.tutorialState;
    const urlParam = new URL(window.location.href).searchParams.get('tutorial');
    const resumeBtn = findPhaserTextByLabel(scene, '[ Resume ]');
    const newGameBtn = findPhaserTextByLabel(scene, '[ New Game ]');
    // Diagnostic dump: what's on screen / in the scene when the modal
    // never appeared. NOTE: scene.displayList is a Layer wrapper in
    // Phaser 4 RC — the real object list lives on scene.add.displayList
    // (=== sys.displayList). Measure that one.
    const displayObjects = (() => {
      try {
        const list = (scene.add as any)?.displayList?.getAll?.() ?? [];
        const byType = new Map<string, number>();
        for (const o of list as Phaser.GameObjects.GameObject[]) {
          const t = (o as any).type ?? 'unknown';
          byType.set(t, (byType.get(t) ?? 0) + 1);
        }
        const types = [...byType.entries()].map(([k, v]) => `${k}x${v}`).join(', ');
        const texts = (list as Phaser.GameObjects.GameObject[])
          .filter((o) => o instanceof Phaser.GameObjects.Text)
          .map((t) => (t as Phaser.GameObjects.Text).text)
          .slice(0, 30)
          .join(' | ');
        return `count=${list.length} types=${types || '(empty)'} texts=${texts || '(no text)'}`;
      } catch { return '(failed to dump)'; }
    })();
    const s = scene as any;
    const checkpoint = await (async () => {
      try { return await s.checkpointManager?.load?.(); } catch (e) { return `load threw: ${String(e)}`; }
    })();
    throw new Error(
      `[bootGameWithTutorial #${cycleNumber} attempt ${attempt}] Tutorial offer modal not shown after ` +
      `_campaignLoadPromise resolved + ${MODAL_POLL_TIMEOUT / 1000}s poll. ` +
      `Modal exists: ${!!modal}. isVisible: ${modal.isVisible}. ` +
      `overlayObjects.length: ${modal.overlayObjects?.length ?? 'undefined'}. ` +
      `URL tutorial param: ${urlParam}. Campaign tutorialState: ${JSON.stringify(state)}. ` +
      `Resume overlay present: ${!!resumeBtn && !!newGameBtn} ` +
      `(resume='${resumeBtn?.text}', newGame='${newGameBtn?.text}'). ` +
      `checkpointManager exists: ${!!s.checkpointManager}. ` +
      `checkpointManager.load(): ${checkpoint === null || checkpoint === undefined ? 'none' : JSON.stringify(checkpoint)?.slice(0, 200)}. ` +
      `saveStore exists: ${!!s.saveStore}. deferredDayBanner: ${s.deferredDayBanner}. ` +
      `Display list (factory/sys): ${displayObjects}. ` +
      `This usually means the async checkAndResume → freshStartFn → show() ` +
      `chain stalled or threw silently (errors are swallowed), or the scene ` +
      `failed to render under resource pressure from preceding browser tests. ` +
      `Try running browser tests in smaller batches or increasing the canvas ` +
      `context limit.`,
    );
  }

  return game;
}

/**
 * Best-effort removal of stale Main Street 'run-checkpoint' and 'campaign'
 * records from the shared-session IndexedDB. Uses a plain readwrite
 * transaction on the same-version DB so it can never block subsequent opens
 * (unlike deleteDatabase). Abandoned (race-capped) wipes leave only an idle
 * connection in this context, which is torn down with the session.
 */
async function clearStaleMainStreetSaves(): Promise<void> {
  const deadline = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 5000));
  try {
    if (typeof indexedDB === 'undefined') return;
    const db = await Promise.race([
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('save-load-store', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('open timeout')), 5000),
      ),
    ]);
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          const tx = db.transaction('saves', 'readwrite');
          const store = tx.objectStore('saves');
          const index = store.index('domain_gameType_slot');
          const keysToDelete: IDBValidKey[] = [];
          for (const domain of ['run-checkpoint', 'campaign']) {
            const req = index.getAll(IDBKeyRange.only([domain, 'main-street']));
            req.onsuccess = () => {
              for (const r of req.result as Array<{ id: IDBValidKey }>) {
                keysToDelete.push(r.id);
              }
            };
            req.onerror = () => { /* keep going */ };
          }
          tx.oncomplete = () => {
            // Delete after reads complete, in a follow-up transaction so the
            // read transaction's completion carries the deletions atomically.
            const delTx = db.transaction('saves', 'readwrite');
            const delStore = delTx.objectStore('saves');
            for (const k of keysToDelete) delStore.delete(k);
            delTx.oncomplete = () => resolve();
            delTx.onerror = () => resolve();
            delTx.onabort = () => resolve();
          };
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        }),
        deadline(),
      ]);
    } finally {
      db.close();
    }
  } catch { /* non-browser / IndexedDB unavailable — proceed without wipe */ }
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
  // Clear any saved run checkpoint / campaign progress via the game's own
  // storage manager BEFORE destroying (the game's SaveLoadStore connection is
  // still open, so this works where a raw IndexedDB delete would block). This
  // prevents the next boot in the same file from showing the resume overlay
  // instead of the tutorial offer modal.
  if (game) {
    try {
      const scene = game.scene.getScene('MainStreetScene') as any;
      const store = scene?.saveStore;
      // Clear any saved run checkpoint / campaign progress via the game's own
      // store BEFORE destroying (its IndexedDB connection is still open, so
      // this works where a raw IndexedDB delete would block). Prevents the
      // next boot in the same file from showing the resume overlay instead of
      // the tutorial offer modal.
      await scene?.checkpointManager?.clear?.().catch?.(() => {});
      if (store?.removeBySlot) {
        await store.removeBySlot('run-checkpoint', 'main-street', 'turn-start').catch?.(() => {});
        await store.removeBySlot('campaign', 'main-street', 'campaign-default').catch?.(() => {});
      }
    } catch { /* ignore */ }
  }

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
 * Strip the copy-number suffix from a card ID for prefix matching.
 */
function matchesCardId(cardId: string, requiredCardId: string): boolean {
  const stripCopy = (id: string): string => id.replace(/-\d+$/, '');
  return stripCopy(cardId) === stripCopy(requiredCardId);
}

/**
 * Poll until a predicate is true or the timeout elapses.
 * Returns true when the predicate became true.
 */
async function pollUntil(
  predicate: () => boolean,
  timeoutMs = 6_000,
  intervalMs = 100,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return predicate();
}

/**
 * Click the business card that matches the current tutorial step's requiredCardId
 * and wait for the async buy-to-hand animation to land (card appears in hand or
 * the tutorial advances past the select step).
 */
export async function clickRequiredBusinessCard(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  const controller = s.tutorialController;
  // Single market row (CG-0MSTOATDT009BRX2): businesses and events share one
  // row; the tutorial select-business step targets a business/community card.
  const marketCards = s.state?.market?.cards ?? [];
  const devCards = marketCards.filter((c: any) => c.family === 'business' || c.family === 'community-space');
  if (devCards.length === 0) return;

  let cardToClick = devCards[0];
  let requiredId: string | undefined;
  if (controller?.isActive) {
    const step = getCurrentStep(controller);
    if (step?.requiredCardId) {
      requiredId = step.requiredCardId;
      const found = devCards.find((c: any) => matchesCardId(c.id, step.requiredCardId!));
      if (found) {
        cardToClick = found;
      }
    }
  }

  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  try { s.onBusinessCardClick(cardToClick); } catch (_) { /* ignore */ }

  // Wait for the async buy-to-hand to complete: the bought card appears in hand
  // (or the tutorial advances past the select step).
  if (requiredId) {
    await pollUntil(
      () => s.state.hand.some((c: any) => matchesCardId(c.id, requiredId!)),
      6_000,
    );
  } else {
    await pollUntil(() => s.state.hand.length > 0, 6_000);
  }
  // Belt-and-suspenders: if still on a select-business step after the click
  // (async animation may not have completed in the test env), force-advance.
  maybeAdvanceFromRequiredAction(scene, 'select-business');
}

/**
 * Force-advance the tutorial if the current step still requires the given
 * action (async Phaser animations may not have fired onTutorialActionComplete
 * in the headless test environment). No-op when already past the step.
 */
function maybeAdvanceFromRequiredAction(
  scene: Phaser.Scene,
  requiredAction: string,
): void {
  const s = scene as any;
  const controller = s.tutorialController;
  if (!controller?.isActive) return;
  const step = getCurrentStep(controller);
  if (!step || step.gate !== 'action') return;
  // Two-turn plan-ahead flow (CG-0MT53NXGZ004H5AE): no composite
  // buy-and-place steps — each action type completes its own step.
  if (step.requiredAction !== requiredAction) {
    return;
  }
  s.tutorialController = advanceTutorialStep(controller);
  s.showTutorialStepOverlay?.();
}

/**
 * Click the event card that matches the current tutorial step's requiredCardId
 * and wait for the async buy animation to land (event appears in hand).
 */
export async function clickRequiredEventCard(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  const controller = s.tutorialController;
  // Single market row (CG-0MSTOATDT009BRX2): events share the row with
  // businesses; filter the event-family cards for the buy-event step.
  const marketCards = s.state?.market?.cards ?? [];
  const investments = marketCards.filter((c: any) => c.family === 'event');
  if (investments.length === 0) return;

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

  // Wait for the async buy to land (event card appears in hand).
  await pollUntil(() => s.state.hand.some((c: any) => c.family === 'event'), 6_000);
  maybeAdvanceFromRequiredAction(scene, 'buy-event');
}

/**
 * Click a street slot to place the pending business card and wait for the
 * async placement to land (slot filled or tutorial advances past the place step).
 *
 * The click is dispatched as REAL native mousedown/mouseup DOM events on the
 * canvas at the slot's coordinates (CSS-scale-aware), exercising Phaser's
 * actual input pipeline (topOnly hit-testing) rather than calling
 * onSlotClick() directly — the regression guard for CG-0MSN8ZZX2000B9UP
 * (drag-drop drop zones used to steal slot clicks).
 */
export async function clickStreetSlot(scene: Phaser.Scene, slotIdx: number): Promise<void> {
  const s = scene as any;
  const hand = s.state?.hand ?? [];

  // ── New flow (CG-0MSXIQIPJ000NDTL): hand cards are NOT auto-selected. ──
  // If a card is in hand but not yet selected (pendingHandIndex === null),
  // select the just-moved card (from justMovedHandCardId) — falling back to
  // the last card, the most recently added. We derive pendingHandJustMoved
  // from the justMovedHandCardId tracker so placing the just-moved card stays
  // free. We do NOT route through onHandBusinessCardClick here because that
  // triggers a full re-render which, combined with the street-grid refresh
  // below, can invalidate the slot objects under the pointer before the
  // dispatch (the tutorial flow is time-sensitive).
  if (s.pendingHandIndex === null && hand.length > 0) {
    const justMovedIdx = hand.findIndex((c: any) => c.id === s.justMovedHandCardId);
    s.pendingHandIndex = justMovedIdx >= 0 ? justMovedIdx : hand.length - 1;
    s.pendingHandJustMoved = justMovedIdx >= 0;
    s.uiPhase = 'placing-from-hand';
  }

  // If async buy-to-hand hasn't completed, execute it synchronously
  if (s.pendingHandIndex === null && hand.length === 0 && s.tutorialController?.isActive) {
    const step = getCurrentStep(s.tutorialController);
    if (step?.requiredAction === 'select-business' || step?.requiredAction === 'place-business') {
      // Execute the pick-up synchronously so the card is in hand for placement.
      // Cost-at-play (CG-0MSTOATDT009BRX2): taking a card to hand is FREE; the
      // listed cost is paid by placeFromHand when the card is placed.
      // Post-CG-0MSXIQIPJ000NDTL: after buying, the card is in hand but NOT
      // auto-selected; we must also call onHandBusinessCardClick.
      const marketCards = s.state?.market?.cards;
      const devCards = (marketCards ?? []).filter(
        (c: any) => c.family === 'business' || c.family === 'community-space',
      );
      if (devCards.length > 0) {
        let cardToBuy = devCards[0];
        if (step?.requiredCardId) {
          // Current step has a specific requiredCardId
          const found = devCards.find((c: any) => matchesCardId(c.id, step.requiredCardId!));
          if (found) cardToBuy = found;
        } else if (step?.requiredAction === 'place-business') {
          // place-business steps don't have requiredCardId. Find the card that
          // was specified by the preceding select-business step (e.g., T15 follows T11).
          const myIdx = UNIFIED_TUTORIAL_STEPS.findIndex(s => s.id === step.id);
          for (let i = myIdx - 1; i >= 0; i--) {
            const prev = UNIFIED_TUTORIAL_STEPS[i];
            if (prev.requiredAction === 'select-business' && prev.requiredCardId) {
              const found = devCards.find((c: any) => matchesCardId(c.id, prev.requiredCardId!));
              if (found) { cardToBuy = found; break; }
            }
          }
        }
        const cardIdx = marketCards.findIndex((c: any) => c.id === cardToBuy.id);
        if (cardIdx >= 0) {
          // Move to hand (free, mirrors moveToHand()); placement pays the cost.
          // Post-CG-0MSXIQIPJ000NDTL: record the just-moved card so a later
          // selection (clickStreetSlot below) places it free, without
          // auto-selecting it here.
          s.state.hand.push({ ...marketCards[cardIdx] });
          marketCards.splice(cardIdx, 1);
          s.justMovedHandCardId = cardToBuy.id;
        }
      }
    }
  }

  // Legacy flow: set pendingBusinessCard if hand is empty
  if (s.pendingHandIndex === null && s.pendingBusinessCard === null) {
    const controller = s.tutorialController;
    const devCards = (s.state?.market?.cards ?? []).filter(
      (c: any) => c.family === 'business' || c.family === 'community-space',
    );
    if (devCards.length > 0 && controller?.isActive) {
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

  // Rebuild the street grid so the empty-slot rectangles are interactive with
  // the correct phase AND rendered on top of the drag-drop zones (the fix for
  // CG-0MSN8ZZX2000B9UP). Without this refresh the slots may have been drawn
  // while the UI was in a non-placing phase and thus not interactive.
  try { s.refreshStreetGrid(); } catch (_) { /* ignore */ }
  // Let the renderer flush a frame so the newly created slot rectangles enter
  // the camera render list — Phaser's hit test skips objects that haven't been
  // rendered yet (willRender). Without this wait the click would silently miss.
  await new Promise((r) => setTimeout(r, 100));

  // Dispatch a real pointer click at the slot centre through the canvas so
  // Phaser's input pipeline (topOnly hit-test) resolves the target object.
  const center = s.getStreetSlotCenter(slotIdx);
  dispatchCanvasMouse('mousedown', center.x, center.y);
  await new Promise((r) => setTimeout(r, 120)); // separate frames, even under CI contention
  dispatchCanvasMouse('mouseup', center.x, center.y);

  // Wait for the async placement to land: the slot becomes filled (or the
  // tutorial advances past the place step). A timeout here means the real
  // pointer click did NOT place the card — a regression, not a flake.
  const placed = await pollUntil(() => s.state.streetGrid[slotIdx] != null, 6_000);
  if (!placed) {
    throw new Error(
      `clickStreetSlot: real pointer click on slot ${slotIdx} did not place the card ` +
      `(input pipeline regression — see CG-0MSN8ZZX2000B9UP)`,
    );
  }
  // Fallback: if still on a place-business step after the attempt, force-advance.
  maybeAdvanceFromRequiredAction(scene, 'place-business');
}

/**
 * Dispatch a native DOM MouseEvent on the game canvas at (world) coordinates.
 * The canvas may be CSS-scaled, so world coordinates are converted to client
 * coordinates via the canvas bounding rect (same convention as the drag tests).
 */
function dispatchCanvasMouse(type: string, worldX: number, worldY: number): void {
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('dispatchCanvasMouse: game canvas not found');
  const rect = canvas.getBoundingClientRect();
  const clientX = rect.x + (worldX / 1280) * rect.width;
  const clientY = rect.y + (worldY / 720) * rect.height;
  canvas.dispatchEvent(
    new MouseEvent(type, {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    }),
  );
}

/**
 * Dispatch a real pointer click at a street slot while a card is pending
 * WITHOUT asserting that it was placed — used to verify illegal-placement
 * rejection during the tutorial (e.g. T19: the Library must be built next
 * to the Bookshop).
 *
 * Mirrors `clickStreetSlot`'s setup (placing phase + street-grid refresh +
 * native mousedown/mouseup through Phaser's actual input pipeline) so the
 * rejection path is exercised end-to-end. The caller asserts the resulting
 * user-facing feedback (instruction message naming the synergy partner,
 * slot still empty, card still in hand, tutorial step not advanced).
 */
export async function clickStreetSlotExpectRejected(
  scene: Phaser.Scene,
  slotIdx: number,
): Promise<void> {
  const s = scene as any;
  // Post-CG-0MSXIQIPJ000NDTL: hand cards are not auto-selected after
  // market-to-hand. If no card is pending, select the just-moved card
  // (from justMovedHandCardId), falling back to the most recent hand card
  // — NOT index 0, which may be an un-placeable held event card (e.g. the
  // Local Festival held from T9 while the T13 Library is the just-moved one).
  if (s.pendingHandIndex === null && (s.state?.hand ?? []).length > 0) {
    const hand = s.state.hand;
    const justMovedIdx = hand.findIndex((c: any) => c.id === s.justMovedHandCardId);
    s.pendingHandIndex = justMovedIdx >= 0 ? justMovedIdx : hand.length - 1;
    s.pendingHandJustMoved = justMovedIdx >= 0;
  }
  s.uiPhase =
    s.pendingHandIndex !== null ? 'placing-from-hand' : 'placing-business';
  // Rebuild the street grid so the empty-slot rectangles are interactive
  // with the correct phase (same rationale as clickStreetSlot).
  try { s.refreshStreetGrid(); } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 100));

  const center = s.getStreetSlotCenter(slotIdx);
  dispatchCanvasMouse('mousedown', center.x, center.y);
  await new Promise((r) => setTimeout(r, 120)); // separate frames, even under CI contention
  dispatchCanvasMouse('mouseup', center.x, center.y);

  // Let the rejection handler run and set the blocked-move feedback text.
  await new Promise((r) => setTimeout(r, 300));
}

/**
 * End the current turn and advance the tutorial.
 */

/**
 * End the current turn and advance the tutorial.
 */
export async function clickEndTurn(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  const stepBefore = getStepIndex(scene);
  const turnBefore = s.state?.turn ?? 0;
  try { s.endTurn(); } catch (_) { /* ignore */ }
  // Wait for the end-turn processing to complete AND the day-start transition
  // to land: the tutorial step overlay advances immediately, but the 800ms
  // delayed startDayPhase (market refill + tutorial market guarantee hook)
  // runs afterwards — reading state before then sees the previous day's row.
  await pollUntil(
    () =>
      (getStepIndex(scene) !== stepBefore || (s.state?.turn ?? 0) > turnBefore) &&
      s.state?.phase === 'MarketPhase',
    10_000,
  );
  maybeAdvanceFromRequiredAction(scene, 'end-turn');
  await new Promise((r) => setTimeout(r, 200));
}

/**
 * Perform the Community Favour rep→coins exchange (T13, CG-0MSTOATDQ005XDET).
 * Calls the turn controller's onCommunityFavourClick('rep-to-coins') — the
 * same dispatch the favour buttons use — then waits for the exchange to land
 * (gate spent) and lets the tutorial advance from the action-gated step.
 */
export async function clickCommunityFavour(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
  const coinsBefore = s.state?.resourceBank?.coins ?? 0;
  try { s.onCommunityFavourClick('rep-to-coins'); } catch (_) { /* ignore */ }
  // Wait for the exchange to land: coins increased by the config coin gain
  // and the once-per-turn gate spent.
  await pollUntil(
    () =>
      (s.state?.favourUsedThisTurn === true) &&
      (s.state?.resourceBank?.coins ?? 0) > coinsBefore,
    6_000,
  );
  maybeAdvanceFromRequiredAction(scene, 'community-favour');
  await new Promise((r) => setTimeout(r, 200));
}

/**
 * Play the held investment event from the hand (T20 "Triggering Events").
 * Finds the first event-family card in the player's hand and calls
 * onPlayHeldEvent with its index, then waits for the event to leave the hand.
 */
export async function clickPlayHeldEvent(scene: Phaser.Scene): Promise<void> {
  const s = scene as any;
  const hand = s.state?.hand ?? [];
  const idx = hand.findIndex((c: any) => c.family === 'event');
  if (idx >= 0) {
    if (s.uiPhase !== 'market') { s.uiPhase = 'market'; }
    try { s.onPlayHeldEvent(idx); } catch (_) { /* ignore */ }
  }
  // Wait for the held event to leave the hand (async command execution).
  await pollUntil(() => !s.state.hand.some((c: any) => c.family === 'event'), 6_000);
  maybeAdvanceFromRequiredAction(scene, 'play-event');
}
