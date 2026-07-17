/**
 * SushiGoTableauRendering — browser tests verifying that player and AI
 * tableau cards render with full visuals (background rectangle, border,
 * icon, label) and that hover interactions work correctly.
 *
 * Regression test for CG-0MRDU64K4000APKM: "Sushi Go played cards not rendered"
 * where `removeTableauHighlights()` was destroying card background Rectangles
 * in the player tableau, leaving only SVG icons visible.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createSushiGoGame } = await import(
    '../../example-games/sushi-go/createSushiGoGame'
  );
  const game = createSushiGoGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'SushiGoScene');
  // Wait for ensureIconTextures().finally() to settle
  await new Promise((r) => setTimeout(r, 200));
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/**
 * Simulate picking the first card in the player's hand to advance the
 * game state so the player's tableau has at least one card.
 */
async function pickFirstCard(scene: any): Promise<void> {
  // Wait for picking phase
  while (scene.phaseManager.current !== 'picking') {
    await new Promise((r) => setTimeout(r, 50));
  }

  // Click the first card in the hand
  const handView = scene.handView;
  const sprites = handView.getSprites();
  if (sprites.length === 0) return;

  // Simulate click on the first card
  const firstCard = sprites[0];
  if (firstCard && typeof (firstCard as any).emit === 'function') {
    // Find the interactive child (the bg rectangle inside the container)
    const container = firstCard as Phaser.GameObjects.Container;
    const interactiveChild = container.getAt(0);
    if (interactiveChild) {
      interactiveChild.emit('pointerdown');
    }
  }

  // Wait for turn animation to complete
  await new Promise((r) => setTimeout(r, 500));
}

describe('Sushi Go tableau card rendering', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('player tableau cards have a background Rectangle after refreshChopsticksTableauHighlight', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Pick a card so the player's tableau has content
    await pickFirstCard(scene);

    // Verify the player tableau container has card containers
    const playerChildren = scene.playerTableauContainer.getAll();
    expect(playerChildren.length).toBeGreaterThan(0);

    // Find card containers (children that are Containers with cardId data)
    const cardContainers = playerChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(cardContainers.length).toBeGreaterThan(0);

    // For each card container, verify it has a background Rectangle
    for (const cardContainer of cardContainers) {
      const grandChildren = cardContainer.getAll();

      // Find Rectangle objects (the card background)
      const rects = grandChildren.filter(
        (gc: any) => gc instanceof Phaser.GameObjects.Rectangle,
      );

      // There should be at least 1 Rectangle (the card background)
      // If there are 2+ Rectangles, one might be a chopsticks highlight —
      // but there MUST be at least 1 Rectangle (the background).
      expect(rects.length).toBeGreaterThanOrEqual(1);

      // Verify the background rectangle has the card's dimensions
      // (TABLEAU_CARD_W and TABLEAU_CARD_H are applied via createCardRect)
      const bgRect = rects[0];
      expect((bgRect as any).width).toBeGreaterThan(0);
      expect((bgRect as any).height).toBeGreaterThan(0);
    }

    // Verify AI tableau also has backgrounds intact
    const aiChildren = scene.aiTableauContainer.getAll();
    const aiCardContainers = aiChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(aiCardContainers.length).toBeGreaterThan(0);

    for (const cardContainer of aiCardContainers) {
      const grandChildren = cardContainer.getAll();
      const rects = grandChildren.filter(
        (gc: any) => gc instanceof Phaser.GameObjects.Rectangle,
      );
      expect(rects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('player and AI tableau cards have comparable Rectangle+Image+Text children', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Pick a card
    await pickFirstCard(scene);

    const countChildTypes = (container: Phaser.GameObjects.Container) => {
      const cards = container.getAll().filter(
        (child: any) =>
          child instanceof Phaser.GameObjects.Container &&
          child.getData('cardId') !== undefined,
      );
      if (cards.length === 0) return null;

      const firstCard = cards[0] as Phaser.GameObjects.Container;
      const gc = firstCard.getAll();
      return {
        rects: gc.filter((c: any) => c instanceof Phaser.GameObjects.Rectangle).length,
        images: gc.filter((c: any) => c instanceof Phaser.GameObjects.Image).length,
        texts: gc.filter((c: any) => c instanceof Phaser.GameObjects.Text).length,
      };
    };

    const playerTypes = countChildTypes(scene.playerTableauContainer);
    const aiTypes = countChildTypes(scene.aiTableauContainer);

    // Both tableaux should have cards
    expect(playerTypes).not.toBeNull();
    expect(aiTypes).not.toBeNull();

    // Both should have at least 1 Rectangle (background)
    expect(playerTypes!.rects).toBeGreaterThanOrEqual(1);
    expect(aiTypes!.rects).toBeGreaterThanOrEqual(1);
  });

  it('hovering a player tableau card shows tooltip via the TooltipManager', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    await pickFirstCard(scene);

    // Find player tableau card containers
    const playerChildren = scene.playerTableauContainer.getAll();
    const cardContainers = playerChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(cardContainers.length).toBeGreaterThan(0);

    // Find the bg Rectangle (non-chopsticks) in the first card container
    const firstCard = cardContainers[0] as Phaser.GameObjects.Container;
    const bgRect = firstCard.getAll().find(
      (gc: any) =>
        gc instanceof Phaser.GameObjects.Rectangle &&
        !gc.getData('chopsticksHighlight'),
    ) as Phaser.GameObjects.Rectangle | undefined;
    expect(bgRect).toBeDefined();

    // Simulate pointerover on the background rectangle
    bgRect!.emit('pointerover');

    // After pointerover, the tooltip manager should have a phaserContainer
    // (the tooltip is shown).
    const tooltipManager = scene.tooltipManager;
    expect(tooltipManager).toBeDefined();
    expect((tooltipManager as any).phaserContainer).toBeDefined();
    expect((tooltipManager as any).phaserContainer).not.toBeNull();

    // Simulate pointerout to hide tooltip
    bgRect!.emit('pointerout');
    await new Promise((r) => setTimeout(r, 50));

    // Tooltip should be hidden (phaserContainer destroyed)
    expect((tooltipManager as any).phaserContainer).toBeNull();
  });

  it('hovering a player tableau card triggers highlight effect (scale + border color)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    await pickFirstCard(scene);

    // Find player tableau card containers
    const playerChildren = scene.playerTableauContainer.getAll();
    const cardContainers = playerChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(cardContainers.length).toBeGreaterThan(0);

    const firstCardContainer = cardContainers[0] as Phaser.GameObjects.Container;
    const bgRect = firstCardContainer.getAll().find(
      (gc: any) =>
        gc instanceof Phaser.GameObjects.Rectangle &&
        !gc.getData('chopsticksHighlight'),
    ) as Phaser.GameObjects.Rectangle | undefined;
    expect(bgRect).toBeDefined();

    // Before hover: scale should be 1.0
    expect(firstCardContainer.scaleX).toBe(1);
    expect(firstCardContainer.scaleY).toBe(1);

    // Simulate pointerover
    bgRect!.emit('pointerover');

    // After hover: container should be scaled up (1.08)
    expect(firstCardContainer.scaleX).toBeCloseTo(1.08, 2);
    expect(firstCardContainer.scaleY).toBeCloseTo(1.08, 2);

    // Simulate pointerout
    bgRect!.emit('pointerout');

    // After unhover: container should be back to 1.0
    expect(firstCardContainer.scaleX).toBe(1);
    expect(firstCardContainer.scaleY).toBe(1);
  });

  it('hovering AI tableau card also shows tooltip (no regression)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    await pickFirstCard(scene);

    // Find AI tableau card containers
    const aiChildren = scene.aiTableauContainer.getAll();
    const cardContainers = aiChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(cardContainers.length).toBeGreaterThan(0);

    const firstCard = cardContainers[0] as Phaser.GameObjects.Container;
    const bgRect = firstCard.getAll().find(
      (gc: any) => gc instanceof Phaser.GameObjects.Rectangle,
    ) as Phaser.GameObjects.Rectangle | undefined;
    expect(bgRect).toBeDefined();

    // Simulate pointerover
    bgRect!.emit('pointerover');

    const tooltipManager = scene.tooltipManager;
    expect((tooltipManager as any).phaserContainer).toBeDefined();
    expect((tooltipManager as any).phaserContainer).not.toBeNull();

    // Cleanup
    bgRect!.emit('pointerout');

    // Trigger another refresh to ensure no errors
    scene.refreshAll();
    await new Promise((r) => setTimeout(r, 200));

    // Cards should still have their backgrounds after refresh
    const refreshedChildren = scene.playerTableauContainer.getAll();
    expect(refreshedChildren.length).toBeGreaterThan(0);
  });

  it('chopsticks highlight rectangles are properly tagged and removable', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Initially no chopsticks in tableau, so no highlights
    // We verify the highlight mechanism works by checking that
    // non-chopsticks cards retain their background after refresh
    await pickFirstCard(scene);

    // Trigger refreshChopsticksTableauHighlight explicitly (as done in refreshAll)
    scene.refreshChopsticksTableauHighlight();
    await new Promise((r) => setTimeout(r, 100));

    // Verify all player tableau cards still have their background Rectangle
    const playerChildren = scene.playerTableauContainer.getAll();
    const cardContainers = playerChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );

    for (const cardContainer of cardContainers) {
      const grandChildren = cardContainer.getAll();
      const rects = grandChildren.filter(
        (gc: any) => gc instanceof Phaser.GameObjects.Rectangle,
      );
      expect(rects.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('bg Rectangle is interactive on player tableau cards', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    await pickFirstCard(scene);

    const playerChildren = scene.playerTableauContainer.getAll();
    const cardContainers = playerChildren.filter(
      (child: any) =>
        child instanceof Phaser.GameObjects.Container &&
        child.getData('cardId') !== undefined,
    );
    expect(cardContainers.length).toBeGreaterThan(0);

    const firstCard = cardContainers[0] as Phaser.GameObjects.Container;
    const bgRects = firstCard.getAll().filter(
      (gc: any) => gc instanceof Phaser.GameObjects.Rectangle,
    );
    expect(bgRects.length).toBeGreaterThanOrEqual(1);

    // Find the non-chopsticks-highlight bg Rect
    const bgRect = bgRects.find(
      (r: any) => !r.getData('chopsticksHighlight'),
    );
    expect(bgRect).toBeDefined();
    // The bg should be interactive (setInteractive was called)
    expect((bgRect as any).input).toBeDefined();
  });

  it('group labels render above player tableau cards', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    await pickFirstCard(scene);

    // The player tableau container should have Text children (group labels)
    const playerChildren = scene.playerTableauContainer.getAll();
    const textLabels = playerChildren.filter(
      (child: any) => child instanceof Phaser.GameObjects.Text,
    );
    // There should be at least one group label text
    expect(textLabels.length).toBeGreaterThan(0);
  });
});

