import { afterEach, describe, expect, it } from 'vitest';
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

      const beforeBusinessAnimCount = scene.getTransferAnimationCountForTest();
      scene.onBusinessCardClick(business);
      scene.onSlotClick(targetSlot);

      // Business should not appear in street immediately while transfer is playing
      expect(state.streetGrid[targetSlot]).toBeNull();
      expect(scene.getHiddenTransferSourceCardCountForTest()).toBeGreaterThan(0);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(scene.getTransferAnimationCountForTest()).toBeGreaterThan(beforeBusinessAnimCount);

      await new Promise((resolve) => setTimeout(resolve, 1700));
      expect(state.streetGrid[targetSlot]?.id).toBe(business.id);
      expect(scene.getHiddenTransferSourceCardCountForTest()).toBe(0);

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

        await new Promise((resolve) => setTimeout(resolve, 1700));
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
});
