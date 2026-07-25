import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createSushiGoGame } = await import('../../example-games/sushi-go/createSushiGoGame');
  const game = createSushiGoGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'SushiGoScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const step = () => {
      count += 1;
      if (count >= n) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Collect display objects from scene children and the HUD container.
 * Phaser 4 containers store children in .list (not .children).
 */
function collectFromSceneAndHud<T extends Phaser.GameObjects.GameObject>(
  scene: Phaser.Scene,
  predicate: (obj: Phaser.GameObjects.GameObject) => obj is T,
): T[] {
  const result: T[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (predicate(child)) result.push(child);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud && hud.list) walk(hud.list);
  return result;
}

describe('Sushi Go round-score overlay', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders Next Round button above overlay background depth', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 1,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showRoundScoreOverlay(fakeRoundResult, () => {});
    await waitFrames(3);

    // Find the "Next Round" button container
    const containers = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Container =>
      child instanceof Phaser.GameObjects.Container,
    );

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    const nextRoundBtn = containers.find((c) => findButtonLabel(c, 'Next Round'));
    expect(nextRoundBtn).toBeDefined();

    // The button must be above the overlay background depth (10)
    expect(nextRoundBtn!.depth).toBeGreaterThanOrEqual(11);

    // Verify the background rectangle is interactive
    const bg = (nextRoundBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(bg?.input?.enabled).toBe(true);

    // Verify the full-screen input blocker exists and is interactive
    const rects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10,
    );
    expect(rects.length).toBeGreaterThanOrEqual(2); // blocker + visible box
    const blocker = rects.find((r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();
  });
});

describe('Sushi Go overlay layering, input blocking, and dismissal', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('round score overlay renders above gameplay content', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 1,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showRoundScoreOverlay(fakeRoundResult, () => {});
    await waitFrames(5);

    // Verify gameplay containers exist at depth 0
    expect(scene.handContainer).toBeDefined();
    expect(scene.handContainer.depth).toBe(0);
    expect(scene.playerTableauContainer).toBeDefined();
    expect(scene.playerTableauContainer.depth).toBe(0);
    expect(scene.aiTableauContainer).toBeDefined();
    expect(scene.aiTableauContainer.depth).toBe(0);

    // Verify hudContainer depth is above gameplay
    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer.depth).toBeGreaterThan(0);

    // Verify the full-screen input blocker at depth 10 renders above gameplay
    const rectsAtDepth10 = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10,
    );
    expect(rectsAtDepth10.length).toBeGreaterThanOrEqual(2); // blocker + visible box

    const blocker = rectsAtDepth10.find(
      (r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled,
    );
    expect(blocker).toBeDefined();

    // Overlay depth (10) is above gameplay depth (0)
    expect(blocker!.depth).toBeGreaterThan(scene.handContainer.depth);
    expect(blocker!.depth).toBeGreaterThan(scene.playerTableauContainer.depth);
    expect(blocker!.depth).toBeGreaterThan(scene.aiTableauContainer.depth);

    // The overlay content (text, buttons) should be above the blocker
    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text,
    );
    const roundCompleteText = texts.find(
      (t) => (t.text as string).includes('Round') && (t.text as string).includes('Complete'),
    );
    expect(roundCompleteText).toBeDefined();
    expect(roundCompleteText!.depth).toBeGreaterThanOrEqual(11);
  });

  it('game-over overlay has correct z-ordering and input blocking', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session roundScores so computeDisplayedTotal can sum them
    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {});
    await waitFrames(5);

    // Verify the input blocker at depth 10
    const rectsAtDepth10 = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10,
    );
    expect(rectsAtDepth10.length).toBeGreaterThanOrEqual(2); // blocker + visible box
    const blocker = rectsAtDepth10.find(
      (r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled,
    );
    expect(blocker).toBeDefined();

    // Verify the Play Again button exists at correct depth
    const containers = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Container =>
      child instanceof Phaser.GameObjects.Container,
    );

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    const playAgainBtn = containers.find((c) => findButtonLabel(c, 'Play Again'));
    expect(playAgainBtn).toBeDefined();
    expect(playAgainBtn!.depth).toBeGreaterThanOrEqual(11);

    // Verify the button's background rectangle is interactive
    const playBg = (playAgainBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(playBg?.input?.enabled).toBe(true);

    // Verify game-over text ("You Win!") is above overlay background
    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text,
    );
    const winnerText = texts.find(
      (t) => (t.text as string).includes('You Win!') || (t.text as string).includes('AI Wins!'),
    );
    expect(winnerText).toBeDefined();
    expect(winnerText!.depth).toBeGreaterThanOrEqual(11);

    // Verify dismissal removes all overlay content
    scene.overlayManager.dismiss();
    await waitFrames(3);
    const textsAfterDismiss = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text &&
        ((child as Phaser.GameObjects.Text).text.includes('You Win!') ||
         (child as Phaser.GameObjects.Text).text.includes('AI Wins!')),
    );
    expect(textsAfterDismiss.length).toBe(0);
  });

  it('overlay button responds to pointerdown event', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    let callbackFired = false;

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      callbackFired = true;
    });
    await waitFrames(5);

    // Find the Play Again button
    const containers = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Container =>
      child instanceof Phaser.GameObjects.Container,
    );

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    const playAgainBtn = containers.find((c) => findButtonLabel(c, 'Play Again'));
    expect(playAgainBtn).toBeDefined();

    // Find the interactive Rectangle inside the button container and emit pointerdown
    const playBg = (playAgainBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    ) as Phaser.GameObjects.Rectangle | undefined;
    expect(playBg).toBeDefined();
    expect(playBg!.input?.enabled).toBe(true);

    // Emit pointerdown on the interactive rectangle to trigger the callback
    playBg!.emit('pointerdown');

    // Wait a frame for the callback to execute
    await waitFrames(2);

    expect(callbackFired).toBe(true);
  });

  it('input blocker intercepts pointer events with correct depth', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 1,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showRoundScoreOverlay(fakeRoundResult, () => {});
    await waitFrames(5);

    // Find all rectangles at depth 10 (overlay background zone)
    const rectsAtDepth10 = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10,
    );

    // Should have at least 2: the full-screen blocker and the visible box
    expect(rectsAtDepth10.length).toBeGreaterThanOrEqual(2);

    // The full-screen input blocker should be interactive
    const blocker = rectsAtDepth10.find(
      (r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled,
    );
    expect(blocker).toBeDefined();

    // Verify the blocker has pointer event handlers registered
    // Phaser registers 'pointerdown' when setInteractive() is called without 'topOnly'
    // Check that the blocker is positioned to cover the full viewport
    expect(blocker!.width).toBe(1280);
    expect(blocker!.height).toBe(720);

    // Verify that after dismissing the overlay, the blocker no longer exists
    scene.overlayManager.dismiss();
    await waitFrames(3);
    const rectsAfterDismiss = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10 &&
        child.width === 1280 && child.height === 720,
    );
    expect(rectsAfterDismiss.length).toBe(0);
  });
});

describe('Sushi Go game-over overlay', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders Play Again button when game-over overlay is shown', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      scene.scene.restart();
    });

    await waitFrames(3);

    // Action buttons are Containers with Text children (migrated to shared Renderer API).
    const containers = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Container =>
      child instanceof Phaser.GameObjects.Container,
    );

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    const playAgainBtn = containers.find((c) => findButtonLabel(c, 'Play Again'));

    expect(playAgainBtn).toBeDefined();
    // Verify the background rectangle is interactive
    const playBg = (playAgainBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(playBg?.input?.enabled).toBe(true);

    // Verify the full-screen input blocker exists and is interactive
    const rects = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Rectangle =>
      child instanceof Phaser.GameObjects.Rectangle && child.depth === 10,
    );
    expect(rects.length).toBeGreaterThanOrEqual(2); // blocker + visible box
    const blocker = rects.find((r: any) => r.width === 1280 && r.height === 720 && r.input?.enabled);
    expect(blocker).toBeDefined();

    // Verify dismissal cleans up overlay
    scene.overlayManager.dismiss();
    await waitFrames(2);
    const textsAfterDismiss = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text && 
        (child as Phaser.GameObjects.Text).text.includes('You Win!'),
    );
    expect(textsAfterDismiss.length).toBe(0);
  });

  it('renders round-score text inside hudContainer for correct z-ordering', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 1,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showRoundScoreOverlay(fakeRoundResult, () => {});
    await waitFrames(3);

    // Verify hudContainer exists
    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    // Collect text from hudContainer specifically
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudTexts = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    // The round-score overlay text should be in hudContainer so it renders above the overlay box
    const roundScoreText = hudTexts.find((t) => (t.text as string).includes('Round') && (t.text as string).includes('Complete'));
    expect(roundScoreText).toBeDefined();
  });

  it('renders Next Round button inside hudContainer for correct z-ordering', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    const fakeRoundResult = {
      round: 1,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showRoundScoreOverlay(fakeRoundResult, () => {});
    await waitFrames(3);

    // Collect containers from hudContainer
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudContainers = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Container,
    ) as Phaser.GameObjects.Container[];

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    // The Next Round button container should be in hudContainer so it renders above the overlay box
    const nextRoundBtn = hudContainers.find((c) => findButtonLabel(c, 'Next Round'));
    expect(nextRoundBtn).toBeDefined();
  });

  it('renders game-over text inside hudContainer for correct z-ordering', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session roundScores so computeDisplayedTotal can sum them
    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      scene.scene.restart();
    });

    await waitFrames(3);

    // Verify hudContainer exists
    expect(scene.hudContainer).toBeDefined();
    expect(scene.hudContainer).toBeInstanceOf(Phaser.GameObjects.Container);

    // Collect text from hudContainer specifically
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudTexts = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Text,
    ) as Phaser.GameObjects.Text[];

    // The game-over text should be in hudContainer so it renders above the overlay box
    const winnerText = hudTexts.find((t) => (t.text as string).includes('You Win!') || (t.text as string).includes('AI Wins!'));
    const finalText = hudTexts.find((t) => (t.text as string).includes('Final:'));
    expect(winnerText).toBeDefined();
    expect(finalText).toBeDefined();
  });

  it('renders game-over buttons inside hudContainer for correct z-ordering', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session roundScores so computeDisplayedTotal can sum them
    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      scene.scene.restart();
    });

    await waitFrames(3);

    // Collect containers from hudContainer
    const hud = scene.hudContainer as { list: Phaser.GameObjects.GameObject[] };
    const hudContainers = hud.list?.filter(
      (child) => child instanceof Phaser.GameObjects.Container,
    ) as Phaser.GameObjects.Container[];

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    // The Play Again button should be in hudContainer so it renders above the overlay box
    const playAgainBtn = hudContainers.find((c) => findButtonLabel(c, 'Play Again'));
    expect(playAgainBtn).toBeDefined();
  });

  it('displays correct final totals including pudding bonuses when provided', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session roundScores so computeDisplayedTotal can sum them
    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 1 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [1, 0],
      puddingBonuses: [1, -1],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {
      scene.scene.restart();
    });

    await waitFrames(3);

    const texts = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Text =>
      child instanceof Phaser.GameObjects.Text,
    );

    const finalTextObj = texts.find((t) => (t.text as string).includes('Final: You'));

    expect(finalTextObj).toBeDefined();
    expect(finalTextObj!.text).toContain(`Final: You ${9 + 1} -- AI ${8 - 1}`);
  });

  it('renders Menu button in game-over overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('SushiGoScene') as any;

    // Prepare session roundScores so computeDisplayedTotal can sum them
    scene.session.players[0].roundScores = [9];
    scene.session.players[1].roundScores = [8];

    const fakeRoundResult = {
      round: 2,
      tableauScores: [9, 8],
      tableauBreakdowns: [
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
        { tempura: 0, sashimi: 0, dumpling: 0, nigiri: 0, chopsticks: 0, puddingCount: 0 },
      ],
      makiCounts: [0, 0],
      makiBonuses: [0, 0],
      roundScores: [9, 8],
      puddingCounts: [0, 0],
      puddingBonuses: [0, 0],
    };

    scene.overlayManager.showGameOverOverlay(fakeRoundResult, null, () => {});
    await waitFrames(3);

    // Collect containers from scene and hud
    const containers = collectFromSceneAndHud(scene, (child): child is Phaser.GameObjects.Container =>
      child instanceof Phaser.GameObjects.Container,
    );

    const findButtonLabel = (container: Phaser.GameObjects.Container, label: string): boolean => {
      return (container as any).list?.some(
        (child: any) => child instanceof Phaser.GameObjects.Text && child.text === label,
      );
    };

    // Verify Menu button exists
    const menuBtn = containers.find((c) => findButtonLabel(c, 'Menu'));
    expect(menuBtn).toBeDefined();

    // Verify Menu button is interactive
    const menuBg = (menuBtn as any)?.list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(menuBg?.input?.enabled).toBe(true);

    // Verify Play Again still exists
    const playAgainBtn = containers.find((c) => findButtonLabel(c, 'Play Again'));
    expect(playAgainBtn).toBeDefined();

    // Verify the Menu button's background rectangle is interactive
    const menuBg2 = (menuBtn as any)?.list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(menuBg2?.input?.enabled).toBe(true);
  });
});
