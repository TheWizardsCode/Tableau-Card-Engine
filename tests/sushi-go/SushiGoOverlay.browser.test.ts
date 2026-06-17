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

describe('Sushi Go game-over overlay', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders Play Again and Menu buttons when game-over overlay is shown', async () => {
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
    const menuBtn = containers.find((c) => findButtonLabel(c, 'Menu'));

    expect(playAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
    // Verify the background rectangle is interactive
    const playBg = (playAgainBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    const menuBg = (menuBtn as any).list?.find(
      (child: any) => child instanceof Phaser.GameObjects.Rectangle,
    );
    expect(playBg?.input?.enabled).toBe(true);
    expect(menuBg?.input?.enabled).toBe(true);

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

    // Both game-over buttons should be in hudContainer so they render above the overlay box
    const playAgainBtn = hudContainers.find((c) => findButtonLabel(c, 'Play Again'));
    const menuBtn = hudContainers.find((c) => findButtonLabel(c, 'Menu'));
    expect(playAgainBtn).toBeDefined();
    expect(menuBtn).toBeDefined();
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
});
