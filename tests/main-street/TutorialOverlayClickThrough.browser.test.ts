/**
 * Browser regression test for CG-0MSTB03U6009J2WV: real pointer events on the
 * tutorial tooltip (a Phaser DOMElement) must NOT pass through to the
 * interactive game objects beneath it.
 *
 * Mechanism under test
 * --------------------
 * Phaser 4 (RC.7) enables `input.windowEvents` by default (`createCardGame`
 * in `src/ui/createCardGame.ts` leaves it unset → `true`). The MouseManager
 * and TouchManager register `mousedown`/`mouseup` and `touchstart`/`touchend`
 * listeners on `window.top` that process ANY event whose `event.target` is
 * not the canvas — guarded only by `!event.defaultPrevented` (see
 * `node_modules/phaser/src/input/mouse/MouseManager.js` and
 * `touch/TouchManager.js`).
 *
 * `MainStreetTutorialHints.showStep()` is the only place in the repo that
 * creates interactive Phaser DOM elements (`s.add.dom`) for the tutorial
 * tooltip. Before the fix, a real pointer down/up on a tutorial button (or
 * anywhere on the tooltip box) reached those window listeners and Phaser
 * dispatched `pointerdown`/`pointerup` to whatever interactive game object
 * lay beneath the tooltip (hand card, market card, street slot, End Turn,
 * help button) — corrupting game state mid-tutorial.
 *
 * The fix intercepts pointer-ish events on the tooltip container and stops
 * their propagation (`stopPropagation`) so they never reach Phaser's window
 * listeners, while the button's own DOM `click` still fires (AC 3).
 *
 * Test strategy (AC 5)
 * --------------------
 * - Boot Main Street with the tutorial, start it, and advance to T3
 *   ("Buy the Laundromat"), whose required action is buying the highlighted
 *   dev-row card.
 * - Reposition the tooltip DOM element so the "Exit Tutorial" button sits
 *   exactly over the Laundromat card — an interactive object whose click
 *   WOULD mutate game state (buy to hand: coins deducted, card added) were
 *   the pointer event to leak through.
 * - Re-attach Phaser's REAL window input handlers (`onMouseDownWindow`,
 *   `onMouseUpWindow`, `onTouchStartWindow`, `onTouchEndWindow`) to the test
 *   iframe's `window`. Vitest runs tests inside an iframe, so events
 *   targeted at the tooltip bubble within the iframe document and never
 *   reach `window.top`, where Phaser originally attached the listeners.
 *   Re-attaching the same handlers to the iframe window reproduces the
 *   production topology (top-level page) where those listeners DO receive
 *   tooltip events — this is what makes the pass-through detectable.
 * - Dispatch real pointer events at the button's position — CDP
 *   `Input.dispatchMouseEvent` for mouse (identical to Playwright's
 *   `page.mouse`) and synthetic `TouchEvent`s for touch (headless Chromium
 *   cannot generate touch input without emulation) — the exact DOM event
 *   flow a user click takes.
 * - Assert the button's own action fired (tutorial exited) AND the game
 *   state beneath is untouched (no purchase: coins unchanged, hand empty,
 *   laundromat still in the dev row).
 *
 * Mouse (AC 1–3), touch (AC 4) and the tooltip box itself (AC 2) are
 * covered by independent cases, each with its own game boot so the leak
 * assertion stays unambiguous.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { cdp } from '@vitest/browser/context';
import {
  bootGameWithTutorial,
  destroyGame,
  findPhaserTextByLabel,
  getStepIndex,
  waitForTutorialOverlay,
  waitForOverlayVisible,
  clickOverlayButtonByText,
} from '../helpers/main-street-tutorial-e2e';
import { resolveMarketCardAnchor } from '../../example-games/main-street/scenes/MainStreetTutorialHints';

/** UNIFIED_TUTORIAL_STEPS[2] === T3 "Buy the Laundromat" (action: select-business). */
const T3_INDEX = 2;
/** Starting coin balance in STANDARD_TUTORIAL_SCENARIO. */
const START_COINS = 16;
/** Exit Tutorial button label (i18n `tutorial.overlay.exit`). */
const EXIT_LABEL = 'Exit Tutorial';
/** Next button label (i18n `tutorial.overlay.next`). */
const NEXT_LABEL = 'Next >';

describe('Tutorial tooltip click-through isolation (CG-0MSTB03U6009J2WV)', () => {
  let game: Phaser.Game | null = null;

  beforeEach(async () => {
    game = await bootGameWithTutorial();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene;
    const startBtn = await waitForStartButton(scene, 10_000);
    expect(startBtn).toBeTruthy();
    startBtn!.emit('pointerdown', {
      x: startBtn!.x,
      y: startBtn!.y,
      worldX: startBtn!.x,
      worldY: startBtn!.y,
    });
    await waitForTutorialOverlay(15_000);
    expect(getStepIndex(scene)).toBe(0);
  });

  afterEach(async () => {
    await destroyGame(game);
    game = null;
  });

  it('mouse pointer down/up on a tutorial button does not pass through to the card beneath', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await advanceToStep(scene, T3_INDEX);

    repositionButtonOverLaundromat(scene);
    await new Promise((r) => setTimeout(r, 150)); // let the DOMElement transform apply

    // Precondition: the tooltip button genuinely overlaps an interactive
    // object (the Laundromat dev card) — otherwise the test proves nothing.
    assertButtonOverLaundromat(scene);

    await withPhaserWindowHandlers(scene, async () => {
      await realMouseClickOnButton(findTooltipButton(EXIT_LABEL));

      // The button's own action (Exit Tutorial) processes via the DOM click;
      // any leaked buy-to-hand animation takes ~1.5s. Wait for the exit,
      // then wait out the animation window before asserting.
      await pollUntil(() => !(scene as any).tutorialController?.isActive, 3_000);
      await new Promise((r) => setTimeout(r, 2_500));

      assertNoPassThrough(scene);
    });
  }, 30_000);

  it('touch pointer down/up on a tutorial button does not pass through to the card beneath', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await advanceToStep(scene, T3_INDEX);

    repositionButtonOverLaundromat(scene);
    await new Promise((r) => setTimeout(r, 150));

    assertButtonOverLaundromat(scene);

    await withPhaserWindowHandlers(scene, async () => {
      await realTouchTapOnButton(findTooltipButton(EXIT_LABEL));

      await pollUntil(() => !(scene as any).tutorialController?.isActive, 3_000);
      await new Promise((r) => setTimeout(r, 2_500));

      assertNoPassThrough(scene);
    });
  }, 30_000);

  it('mouse pointer down/up on the tooltip box itself (not a button) does not pass through', async () => {
    const scene = game!.scene.getScene('MainStreetScene') as Phaser.Scene;
    await advanceToStep(scene, T3_INDEX);

    // Position the tooltip BOX centre (title/body area — not a button)
    // over the Laundromat card.
    repositionTooltipCenterOverLaundromat(scene);
    await new Promise((r) => setTimeout(r, 150));
    assertTooltipCenterOverLaundromat(scene);

    await withPhaserWindowHandlers(scene, async () => {
      await realMouseClickAtTooltipCenter();
      // No button was pressed, so the tutorial must remain active while the
      // game state beneath stays untouched. Wait out any leaked buy
      // animation before asserting.
      await new Promise((r) => setTimeout(r, 2_500));
      const s = scene as any;
      expect(s.tutorialController.isActive).toBe(true);
      expect(s.state.hand.length).toBe(0);
      expect(s.state.resourceBank.coins).toBe(START_COINS);
      expect(s.pendingHandIndex).toBeNull();
      expect(s.pendingBusinessCard).toBeNull();
      const laundromat = s.state.market.cards.find(
        (c: any) => c.id.startsWith('biz-laundromat'),
      );
      expect(laundromat).toBeTruthy();
    });
  }, 30_000);
});

// ── Helpers ────────────────────────────────────────────────

async function waitForStartButton(
  scene: Phaser.Scene,
  timeoutMs = 8_000,
): Promise<Phaser.GameObjects.Text | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const btn = findPhaserTextByLabel(scene, '[ Start Tutorial ]');
    if (btn) return btn;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Advance the tutorial overlay to a given step index via the Next button. */
async function advanceToStep(scene: Phaser.Scene, targetIndex: number): Promise<void> {
  let guard = 0;
  while (getStepIndex(scene) < targetIndex && guard++ < targetIndex + 2) {
    await clickOverlayButtonByText(NEXT_LABEL);
    await waitForOverlayVisible();
  }
  expect(getStepIndex(scene)).toBe(targetIndex);
}

/** The Phaser DOMElement whose node is the `.ms-tutorial-tooltip` container. */
function findTooltipDomElement(scene: Phaser.Scene): Phaser.GameObjects.DOMElement {
  const found = (scene.children.list as Phaser.GameObjects.GameObject[]).find(
    (obj) => {
      const node = (obj as Phaser.GameObjects.DOMElement).node as HTMLElement | undefined;
      return !!node && node.classList?.contains('ms-tutorial-tooltip');
    },
  ) as Phaser.GameObjects.DOMElement | undefined;
  expect(found, 'tutorial tooltip DOMElement not found in scene children').toBeTruthy();
  return found!;
}

/** Find a tutorial overlay button by its text content. */
function findTooltipButton(text: string): HTMLButtonElement {
  const overlay = document.querySelector('.ms-tutorial-tooltip');
  expect(overlay, 'tutorial tooltip DOM element not found').toBeTruthy();
  const btn = Array.from(overlay!.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  expect(btn, `tutorial button "${text}" not found`).toBeTruthy();
  return btn as HTMLButtonElement;
}

/**
 * Reposition the tooltip so the "Exit Tutorial" button's centre lands on the
 * Laundromat card centre (the interactive dev-row card highlighted by T3).
 *
 * The DOMElement is re-positioned every render from its game-object x/y, so
 * we measure the button's offset within the container (container-local px,
 * scale-independent) and call `setPosition` with a world-space target. The
 * world→CSS scale comes from the FIT-scaled canvas rect (canvas.width is the
 * logical 1280×720 game space).
 */
function repositionButtonOverLaundromat(scene: Phaser.Scene): void {
  const dom = findTooltipDomElement(scene);
  const button = findTooltipButton(EXIT_LABEL);
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const cRect = canvas.getBoundingClientRect();
  const scaleX = cRect.width / 1280;
  const scaleY = cRect.height / 720;

  const b = button.getBoundingClientRect();
  const offX = (b.left + b.width / 2 - cRect.left - dom.x * scaleX) / scaleX;
  const offY = (b.top + b.height / 2 - cRect.top - dom.y * scaleY) / scaleY;

  const anchor = resolveMarketCardAnchor('laundromatCard', scene as any);
  expect(anchor, 'laundromatCard anchor must resolve').toBeTruthy();
  dom.setPosition(anchor!.x + anchor!.w / 2 - offX, anchor!.y + anchor!.h / 2 - offY);
}

/**
 * Reposition the tooltip so its box centre (title/body area, not a button)
 * lands on the Laundromat card centre. Same scale-aware math as
 * `repositionButtonOverLaundromat` but targeting the container itself.
 */
function repositionTooltipCenterOverLaundromat(scene: Phaser.Scene): void {
  const dom = findTooltipDomElement(scene);
  const container = document.querySelector('.ms-tutorial-tooltip') as HTMLElement;
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const cRect = canvas.getBoundingClientRect();
  const scaleX = cRect.width / 1280;
  const scaleY = cRect.height / 720;

  const box = container.getBoundingClientRect();
  const offX = (box.left + box.width / 2 - cRect.left - dom.x * scaleX) / scaleX;
  const offY = (box.top + box.height / 2 - cRect.top - dom.y * scaleY) / scaleY;

  const anchor = resolveMarketCardAnchor('laundromatCard', scene as any);
  expect(anchor, 'laundromatCard anchor must resolve').toBeTruthy();
  dom.setPosition(anchor!.x + anchor!.w / 2 - offX, anchor!.y + anchor!.h / 2 - offY);
}

/** Precondition: the tooltip box centre maps inside the Laundromat rect. */
function assertTooltipCenterOverLaundromat(scene: Phaser.Scene): void {
  const anchor = resolveMarketCardAnchor('laundromatCard', scene as any)!;
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const cRect = canvas.getBoundingClientRect();
  const scaleX = cRect.width / 1280;
  const scaleY = cRect.height / 720;

  const box = document.querySelector('.ms-tutorial-tooltip') as HTMLElement;
  const rect = box.getBoundingClientRect();
  const worldX = (rect.left + rect.width / 2 - cRect.left) / scaleX;
  const worldY = (rect.top + rect.height / 2 - cRect.top) / scaleY;

  expect(worldX).toBeGreaterThanOrEqual(anchor.x);
  expect(worldX).toBeLessThanOrEqual(anchor.x + anchor.w);
  expect(worldY).toBeGreaterThanOrEqual(anchor.y);
  expect(worldY).toBeLessThanOrEqual(anchor.y + anchor.h);
}

/**
 * Precondition check: the Exit Tutorial button's on-screen centre maps to a
 * world position inside the Laundromat card's world rect.
 */
function assertButtonOverLaundromat(scene: Phaser.Scene): void {
  const anchor = resolveMarketCardAnchor('laundromatCard', scene as any)!;
  const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement;
  expect(canvas).toBeTruthy();
  const cRect = canvas.getBoundingClientRect();
  const scaleX = cRect.width / 1280;
  const scaleY = cRect.height / 720;

  const b = findTooltipButton(EXIT_LABEL).getBoundingClientRect();
  const worldX = (b.left + b.width / 2 - cRect.left) / scaleX;
  const worldY = (b.top + b.height / 2 - cRect.top) / scaleY;

  expect(worldX).toBeGreaterThanOrEqual(anchor.x);
  expect(worldX).toBeLessThanOrEqual(anchor.x + anchor.w);
  expect(worldY).toBeGreaterThanOrEqual(anchor.y);
  expect(worldY).toBeLessThanOrEqual(anchor.y + anchor.h);
}

/**
 * Re-attach Phaser's real window input handlers to the test iframe's window
 * for the duration of `fn`.
 *
 * Vitest runs browser tests inside an iframe; events targeted at the tooltip
 * bubble within the iframe document and never reach `window.top`, where
 * Phaser originally attached `onMouseDownWindow`/`onTouchStartWindow` etc.
 * In production (top-level page) those listeners DO receive tooltip events.
 * Re-attaching the SAME handlers to the iframe window reproduces that
 * topology end-to-end: a leaked tooltip event is processed by the real
 * Phaser handlers and dispatched to the interactive game object beneath.
 */
async function withPhaserWindowHandlers(
  scene: Phaser.Scene,
  fn: () => Promise<void>,
): Promise<void> {
  const input = (scene as any).input as any;
  const manager = input?.manager;
  const mouseMgr = manager?.mouse;
  expect(mouseMgr?.onMouseDownWindow, 'Phaser MouseManager window handlers not found').toBeTruthy();

  // Headless Chromium reports no touch device, so Phaser never creates a
  // TouchManager (`input.manager.touch` is null). Construct one to simulate
  // a touch-capable device — its handlers bind to the SAME input manager, so
  // the touch path is exercised end-to-end against the real Phaser pipeline.
  let touchMgr = manager?.touch;
  let createdTouchMgr = false;
  if (!touchMgr) {
    const TouchManagerClass = (Phaser as any).Input?.Touch?.TouchManager;
    expect(TouchManagerClass, 'Phaser TouchManager class not exposed').toBeTruthy();
    touchMgr = new TouchManagerClass(manager);
    // Headless Chromium reports `Device.input.touch === false`, so the
    // manager's boot (already fired) never ran: `target` is unset and the
    // window handlers are still NOOPs. Set the same post-boot state a real
    // touch device has, then build the handlers.
    touchMgr.target = manager.game.canvas;
    touchMgr.enabled = true;
    touchMgr.startListeners();
    createdTouchMgr = true;
  }
  expect(touchMgr?.onTouchStartWindow, 'Phaser TouchManager window handlers not found').toBeTruthy();

  window.addEventListener('mousedown', mouseMgr.onMouseDownWindow);
  window.addEventListener('mouseup', mouseMgr.onMouseUpWindow);
  window.addEventListener('touchstart', touchMgr.onTouchStartWindow);
  window.addEventListener('touchend', touchMgr.onTouchEndWindow);
  try {
    await fn();
  } finally {
    window.removeEventListener('mousedown', mouseMgr.onMouseDownWindow);
    window.removeEventListener('mouseup', mouseMgr.onMouseUpWindow);
    window.removeEventListener('touchstart', touchMgr.onTouchStartWindow);
    window.removeEventListener('touchend', touchMgr.onTouchEndWindow);
    if (createdTouchMgr) {
      try { touchMgr.destroy(); } catch { /* ignore */ }
    }
  }
}

/**
 * Dispatch a REAL mouse click (CDP `Input.dispatchMouseEvent`) at the tooltip
 * box centre (an area of the container that is NOT a button).
 */
async function realMouseClickAtTooltipCenter(): Promise<void> {
  const container = document.querySelector('.ms-tutorial-tooltip') as HTMLElement;
  expect(container).toBeTruthy();
  const rect = container.getBoundingClientRect();
  await realMouseClickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * Dispatch a REAL mouse click (CDP `Input.dispatchMouseEvent`) at a position
 * given in iframe-local viewport coordinates (converted to top-page coords).
 */
async function realMouseClickAt(iframeX: number, iframeY: number): Promise<void> {
  const frame = window.frameElement as HTMLElement | null;
  const fRect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  const x = fRect.left + iframeX;
  const y = fRect.top + iframeY;
  // The Playwright provider augments the CDP session with `send(method, params)`
  // at runtime; the ambient `CDPSession` type is empty, so cast the narrow
  // surface we use.
  const session = cdp() as unknown as {
    send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

/**
 * Dispatch a REAL mouse click (CDP `Input.dispatchMouseEvent`) at the
 * button's on-screen centre, converted to top-page coordinates (the iframe
 * is same-origin and positioned inside the top page).
 */
async function realMouseClickOnButton(button: HTMLElement): Promise<void> {
  const rect = button.getBoundingClientRect();
  await realMouseClickAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/**
 * Dispatch a REAL touch tap at the button's on-screen centre.
 *
 * The events are dispatched on the button element (the same path a real tap
 * takes: button → tooltip container → window listeners) with `bubbles: true`
 * so they reach the re-attached Phaser TouchManager window handlers. CDP
 * `Input.dispatchTouchEvent` is not used because headless Chromium needs
 * `Emulation.setTouchEmulationEnabled` for touch input to be generated, and
 * the synthetic `TouchEvent` below is the deterministic equivalent that
 * exercises the exact same DOM event flow.
 */
async function realTouchTapOnButton(button: HTMLElement): Promise<void> {
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const touch = new Touch({
    identifier: 1,
    target: button,
    clientX: x,
    clientY: y,
    // Phaser's `transformPointer` reads pageX/pageY (see Pointer.touchstart),
    // so page coords must match the button position (no page scroll here).
    pageX: x,
    pageY: y,
  });
  button.dispatchEvent(
    new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch],
    }),
  );
  button.dispatchEvent(
    new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [touch],
    }),
  );
  // A real tap fires the compatibility `click` after touchend — the event
  // that triggers the button's own onclick action.
  button.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window,
      button: 0,
    }),
  );
}

/** Assert the tutorial exited (button action fired) and no game state changed. */
function assertNoPassThrough(scene: Phaser.Scene): void {
  const s = scene as any;
  // AC 3: the button's own action fired — Exit Tutorial deactivated the controller.
  expect(s.tutorialController.isActive).toBe(false);
  // AC 1/2/4: nothing leaked to the card beneath — no purchase, no selection.
  expect(s.state.hand.length).toBe(0);
  expect(s.state.resourceBank.coins).toBe(START_COINS);
  expect(s.pendingHandIndex).toBeNull();
  expect(s.pendingBusinessCard).toBeNull();
  const laundromat = s.state.market.cards.find(
    (c: any) => c.id.startsWith('biz-laundromat'),
  );
  expect(laundromat).toBeTruthy();
}

/** Poll until a predicate is true or the timeout elapses. */
async function pollUntil(
  predicate: () => boolean,
  timeoutMs = 6_000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  expect(predicate(), `predicate not true within ${timeoutMs}ms`).toBe(true);
}
