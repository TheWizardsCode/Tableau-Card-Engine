import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { executeDayStart, processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';
import { canPurchaseBusiness, canPurchaseEvent, getEmptySlots } from '../../example-games/main-street/MainStreetMarket';

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

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;

  if (aRight <= b.x || bRight <= a.x) return false;
  if (aBottom <= b.y || bBottom <= a.y) return false;
  return true;
}

describe('MainStreetScene browser tests', () => {
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

  it('re-renders activity log after scene restart', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    scene.logPrevEntryCount = 1;
    scene.logScrollOffset = 9999;
    scene.logAutoScroll = false;

    scene.scene.restart();
    await waitForScene(game, 'MainStreetScene');

    const restarted = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = restarted.state as { activityLog: Array<{ text: string }> };
    expect(state.activityLog).toHaveLength(1);

    const logContentContainer = restarted.logContentContainer as Phaser.GameObjects.Container;
    const textEntries = logContentContainer.list.filter((obj) => obj instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[];

    expect(textEntries.some((entry) => entry.text === 'Turn 1')).toBe(true);
    expect(logContentContainer.y).toBeGreaterThan(0);
  });

  it('shows new entries for the restarted run', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    scene.scene.restart();
    await waitForScene(game, 'MainStreetScene');

    const restarted = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = restarted.state as Parameters<typeof processEndOfTurn>[0];

    processEndOfTurn(state);
    executeDayStart(state);
    (restarted.refreshAll as () => void)();

    const logContentContainer = restarted.logContentContainer as Phaser.GameObjects.Container;
    const textEntries = logContentContainer.list.filter((obj) => obj instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[];

    expect(textEntries.some((entry) => entry.text === 'Turn 2')).toBe(true);
  });

  it('exposes major UI containers via scene accessors', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    expect(typeof scene.getStreetContainer).toBe('function');
    expect(typeof scene.getMarketContainer).toBe('function');
    expect(typeof scene.getIncidentQueueContainer).toBe('function');
    expect(typeof scene.getHandContainer).toBe('function');
    expect(typeof scene.getActionContainer).toBe('function');

    expect((scene.getStreetContainer as () => Phaser.GameObjects.Container)()).toBeInstanceOf(Phaser.GameObjects.Container);
    expect((scene.getMarketContainer as () => Phaser.GameObjects.Container)()).toBeInstanceOf(Phaser.GameObjects.Container);
    expect((scene.getIncidentQueueContainer as () => Phaser.GameObjects.Container)()).toBeInstanceOf(Phaser.GameObjects.Container);
    expect((scene.getHandContainer as () => Phaser.GameObjects.Container)()).toBeInstanceOf(Phaser.GameObjects.Container);
    expect((scene.getActionContainer as () => Phaser.GameObjects.Container)()).toBeInstanceOf(Phaser.GameObjects.Container);
  });

  it('renders the street as a 2x5 grid', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & { streetContainer?: Phaser.GameObjects.Container };

    const street = scene.streetContainer as Phaser.GameObjects.Container;
    const slots = street.list.filter((obj) => obj instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle[];

    expect(slots.length).toBe(10);

    const rows = new Map<number, number>();
    for (const slot of slots) {
      const y = Math.round(slot.y);
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }

    expect(rows.size).toBe(2);
    for (const count of rows.values()) {
      expect(count).toBe(5);
    }
  });

  it('keeps major zones non-overlapping at desktop and narrow mobile dimensions', async () => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 900, height: 1100 },
    ];

    for (const vp of viewports) {
      game = await bootGame(vp);
      const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & {
        getSectionRectsForTest: () => {
          market: { x: number; y: number; w: number; h: number };
          queue: { x: number; y: number; w: number; h: number };
          street: { x: number; y: number; w: number; h: number };
          hand: { x: number; y: number; w: number; h: number };
          action: { x: number; y: number; w: number; h: number };
          instruction: { x: number; y: number; w: number; h: number };
        };
      };

      const rects = scene.getSectionRectsForTest();

      expect(overlaps(rects.market, rects.queue), `market/queue overlap at ${vp.width}x${vp.height}`).toBe(false);
      expect(overlaps(rects.queue, rects.street), `queue/street overlap at ${vp.width}x${vp.height}`).toBe(false);
      expect(overlaps(rects.street, rects.hand), `street/hand overlap at ${vp.width}x${vp.height}`).toBe(false);
      expect(overlaps(rects.hand, rects.action), `hand/action overlap at ${vp.width}x${vp.height}`).toBe(false);
      expect(overlaps(rects.action, rects.instruction), `action/instruction overlap at ${vp.width}x${vp.height}`).toBe(false);

      destroyGame(game);
      game = null;
    }
  });

  it('loads placeholder texture and renders it without squashing', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown> & { marketContainer?: Phaser.GameObjects.Container };

    // Texture should be loaded by preload
    expect((scene.textures as Phaser.Textures.TextureManager).exists('ms_placeholder_card')).toBe(true);

    // Look for card containers in marketContainer (cards are rendered via drawMarketCard)
    const market = scene.marketContainer as Phaser.GameObjects.Container;
    const containers = market.list.filter((obj) => obj instanceof Phaser.GameObjects.Container) as Phaser.GameObjects.Container[];

    // Check that we have card containers rendered
    expect(containers.length).toBeGreaterThan(0);

    // Check aspect ratio on any image that might be rendered (placeholder or card texture)
    for (const c of containers) {
      const childImg = c.list.find((o) => o instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
      if (childImg) {
        // Cards should preserve aspect ratio - check the texture key format
        const key = childImg.texture.key;
        // Key should be either placeholder or a size-specific card texture
        const isValidKey = key === 'ms_placeholder_card' || key.startsWith('ms_card_');
        expect(isValidKey).toBe(true);

        // Check aspect ratio is roughly preserved (140x80 = 1.75)
        const srcRatio = 140 / 80; // 1.75
        const dispRatio = childImg.displayWidth / childImg.displayHeight;
        expect(Math.abs(dispRatio - srcRatio)).toBeLessThan(0.1);
        break;
      }
    }
  });

  it('uses DOM SVG rendering for held-event hand slot when DOM renderer is available', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;

    const eventCard = state.market.investments.find((card: any) => card && card.family === 'event');
    expect(eventCard).toBeTruthy();

    // Ensure the held card has an SVG source available for DOM rendering.
    const templateId = String(eventCard.id).replace(/-\d+$/, '');
    scene.cardSvgSources.set(templateId, '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="80" viewBox="0 0 140 80"><rect width="140" height="80" fill="#8B4513"/><text x="70" y="44" font-size="14" text-anchor="middle" fill="#fff">Held</text></svg>');

    state.heldEvent = eventCard;

    const domCalls: Array<{ id: string; width: number; height: number }> = [];
    scene.svgDom = {
      clear: () => {},
      createOrUpdate: (id: string, _svg: string, _cx: number, _cy: number, width: number, height: number) => {
        domCalls.push({ id, width, height });
      },
    };

    scene.refreshAll();

    const handCall = domCalls.find((call) => call.id.startsWith('ms_dom_hand_'));
    expect(handCall).toBeTruthy();
    expect(handCall!.width).toBeGreaterThan(0);
    expect(handCall!.height).toBeGreaterThan(0);

    // Hand slot should not fall back to Phaser image/rectangle rendering.
    const handContainer = scene.handContainer as Phaser.GameObjects.Container;
    const heldCardContainer = handContainer.list.find((obj) => obj instanceof Phaser.GameObjects.Container) as Phaser.GameObjects.Container | undefined;
    expect(heldCardContainer).toBeTruthy();
    const hasFallbackDisplayObject = heldCardContainer!.list.some((obj) =>
      obj instanceof Phaser.GameObjects.Image || obj instanceof Phaser.GameObjects.Rectangle,
    );
    expect(hasFallbackDisplayObject).toBe(false);
  });

  it('routes mapped SFX keys to tf-backed adapter when tf module is provided', async () => {
    const placePlaySpy = vi.fn();
    const cheerPlaySpy = vi.fn();

    (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__ = {
      factories: {
        'card-place': () => ({ play: placePlaySpy, stop: vi.fn() }),
        'crowd-cheer': () => ({ play: cheerPlaySpy, stop: vi.fn() }),
      },
    };

    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;

    scene.soundManager.play('ms-place');
    scene.soundManager.play('ms-event-cheer');
    expect(placePlaySpy).toHaveBeenCalled();
    expect(cheerPlaySpy).toHaveBeenCalled();

    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
  });

  it('only materializes purchased cards at destination after transfer animation completes (desktop + narrow viewports)', async () => {
    const viewports = [
      { width: 1280, height: 720 },
      { width: 900, height: 1100 },
    ];

    for (const vp of viewports) {
      game = await bootGame(vp);
      const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
      const state = scene.state;

      const emptySlots = getEmptySlots(state);
      expect(emptySlots.length).toBeGreaterThan(0);
      const targetSlot = emptySlots[0];

      const business = state.market.business.find((card: any) =>
        card && canPurchaseBusiness(state, card.id, targetSlot).legal,
      );
      expect(business).toBeTruthy();

      const hideSpy = vi.spyOn(scene.tooltipManager, 'hide');
      scene.tooltipManager?.show('tmp tooltip', 100, 100);

      const beforeBusinessAnimCount = scene.getTransferAnimationCountForTest();
      scene.onBusinessCardClick(business);
      scene.onSlotClick(targetSlot);

      // Business should not appear in street immediately while transfer is playing
      expect(state.streetGrid[targetSlot]).toBeNull();
      expect(scene.getHiddenTransferSourceCardCountForTest()).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(scene.getTransferAnimationCountForTest()).toBeGreaterThan(beforeBusinessAnimCount);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      expect(state.streetGrid[targetSlot]?.id).toBe(business.id);
      expect(scene.getHiddenTransferSourceCardCountForTest()).toBe(0);
      expect(hideSpy).toHaveBeenCalled();

      const eventCard = state.market.investments.find((card: any) =>
        card && card.family === 'event' && canPurchaseEvent(state, card.id).legal,
      );

      if (eventCard) {
        const beforeEventAnimCount = scene.getTransferAnimationCountForTest();
        scene.onEventCardClick(eventCard);

        // Event should not appear in hand immediately while transfer is playing
        expect(state.heldEvent).toBeNull();
        expect(scene.getHiddenTransferSourceCardCountForTest()).toBeGreaterThan(0);

        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(scene.getTransferAnimationCountForTest()).toBeGreaterThan(beforeEventAnimCount);

        await new Promise((resolve) => setTimeout(resolve, 2000));
        expect(state.heldEvent?.id).toBe(eventCard.id);
        expect(scene.getHiddenTransferSourceCardCountForTest()).toBe(0);

        // Verify held-event slot is on the left and fully within the viewport bounds
        const rects = (scene as any).getSectionRectsForTest();
        const layout = (scene as any).getLayoutMetricsForTest();
        const hand = rects.hand;

        expect(hand.x).toBeGreaterThanOrEqual(0);
        expect(hand.x + hand.w).toBeLessThanOrEqual(layout.gameW);
        expect(hand.y).toBeGreaterThanOrEqual(0);
        expect(hand.y + hand.h).toBeLessThanOrEqual(layout.gameH);
        // Ensure it is on the left half of the screen (not on the right)
        expect(hand.x + hand.w / 2).toBeLessThan(layout.gameW / 2);
      }

      destroyGame(game);
      game = null;
    }
  });

  it('allows pressing Enter to end the turn when legal', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;

    // Ensure we are in market phase
    expect(scene.uiPhase).toBe('market');
    const beforeTurn = scene.state.turn;

    // Dispatch Enter
    const ev = new KeyboardEvent('keydown', { key: 'Enter' });
    if (typeof window !== 'undefined') window.dispatchEvent(ev);

    // Allow engine to process
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(scene.state.turn).toBeGreaterThan(beforeTurn);

    destroyGame(game);
    game = null;
  });

  it('does not end the turn when overlays are open and Enter is pressed', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;

    // Open settings panel (overlay)
    try { scene.settingsPanel.open(); } catch (_) {}

    const beforeTurn = scene.state.turn;
    const ev = new KeyboardEvent('keydown', { key: 'Enter' });
    if (typeof window !== 'undefined') window.dispatchEvent(ev);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(scene.state.turn).toBe(beforeTurn);

    destroyGame(game);
    game = null;
  });
});
