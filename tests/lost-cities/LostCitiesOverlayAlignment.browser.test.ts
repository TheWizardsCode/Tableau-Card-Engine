/**
 * Lost Cities overlay column alignment tests.
 *
 * Verifies that the round-end and match-end score tables use individual
 * text objects per column with correct origins instead of a single padded
 * string, ensuring proportional fonts produce aligned columns.
 *
 * NOTE: Each test boots a fresh Phaser game which creates a WebGL context.
 * Browsers limit concurrent WebGL contexts (~8-16). We keep total boots
 * per file <= 4 to avoid context exhaustion.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { EXPEDITION_COLORS } from '../../example-games/lost-cities/LostCitiesCards';

// ── Helpers ─────────────────────────────────────────────────

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createLostCitiesGame } = await import(
    '../../example-games/lost-cities/createLostCitiesGame'
  );
  const game = createLostCitiesGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'LostCitiesScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSceneInternals(scene: Phaser.Scene) {
  return scene as any;
}

/**
 * Collect all Text objects from the scene and HUD container.
 */
function collectTexts(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  const result: Phaser.GameObjects.Text[] = [];
  const walk = (items: Phaser.GameObjects.GameObject[]) => {
    for (const child of items) {
      if (child instanceof Phaser.GameObjects.Text) {
        result.push(child);
      }
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  const hud = (scene as any).hudContainer as { list: Phaser.GameObjects.GameObject[] } | undefined;
  if (hud?.list) walk(hud.list);
  return result;
}

/**
 * Helper: set up session so the player's next draw ends the round.
 * Based on setupPlayerLastCard from LostCitiesRoundEnd.browser.test.ts.
 */
function setupPlayerLastCard(internals: any): void {
  const session = internals.session;
  session.round.drawPile = makeDrawPile('red');
  session.players[0].hand = makeHand(['blue', 5]);
  session.players[1].hand = makeHand(
    ['green', 3],
    ['white', 7],
    ['yellow', 2],
    ['red', 4],
    ['blue', 6],
    ['green', 8],
    ['white', 9],
    ['red', 10],
  );
  for (const p of session.players) {
    for (const color of EXPEDITION_COLORS) {
      p.expeditions.set(color, []);
    }
  }
  session.matchPhase = 'playing';
  session.round.currentPlayer = 0;
  session.round.turnPhase = 'PlayOrDiscard';
  session.round.justDiscardedColor = null;
  session.round.turnNumber = 1;
  session.roundNumber = 1;
  session.roundScores = [];
  session.cumulativeScores = [0, 0];
  internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
  internals.turnController.setPhase('waiting-for-card-select');
}

// ── Card creation helpers ───────────────────────────────────

let nextCardId = 2000;

function makeCard(color: string, rank: number): any {
  return { id: nextCardId++, color, type: 'numbered', rank, faceUp: true };
}

function makeHand(...ranks: [string, number][]): any[] {
  return ranks.map(([color, rank]) => makeCard(color, rank));
}

function makeDrawPile(...colors: string[]): any[] {
  const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  return colors.map((color, i) => ({
    id: nextCardId++,
    color,
    type: 'numbered' as const,
    rank: ranks[i % ranks.length],
    faceUp: false,
  }));
}

// ── Known column positions ──────────────────────────────────

const CX = 640; // GAME_W / 2 = 1280 / 2

// These replicate the column offsets defined in LostCitiesOverlays.ts:
//   COL_LABEL_X_OFFSET = -230  → absolute X = 640 - 230 = 410
//   COL_P0_X_OFFSET = -20      → absolute X = 640 - 20  = 620
//   COL_P1_X_OFFSET = 160      → absolute X = 640 + 160 = 800
const COL_LABEL_X = CX - 230;   // Label column, left-aligned (originX 0)
const COL_P0_X = CX - 20;       // Player 0 score, right-aligned (originX 1)
const COL_P1_X = CX + 160;      // Player 1 score, right-aligned (originX 1)

const POS_TOLERANCE = 1;

// ── Tests ───────────────────────────────────────────────────

describe('Lost Cities overlay column alignment', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('should create separate text objects per column in round-end overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);

    setupPlayerLastCard(internals);
    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(400);
    internals.turnController.onDrawPileClick();
    await wait(800);

    const allTexts = collectTexts(scene);

    // Header uses individual texts at correct positions & origins
    const headerColor = allTexts.find(t => t.text === 'Color' && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(headerColor).toBeDefined();
    expect(headerColor!.originX).toBe(0);

    const headerYou = allTexts.find(t => t.text === 'You' && Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE);
    expect(headerYou).toBeDefined();
    expect(headerYou!.originX).toBe(1);

    const headerAi = allTexts.find(t => t.text === 'AI' && Math.abs(t.x - COL_P1_X) <= POS_TOLERANCE);
    expect(headerAi).toBeDefined();
    expect(headerAi!.originX).toBe(1);

    // Data row labels are left-aligned at label column
    const blueLabel = allTexts.find(t => t.text === 'Blue' && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(blueLabel).toBeDefined();
    expect(blueLabel!.originX).toBe(0);

    const greenLabel = allTexts.find(t => t.text === 'Green' && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(greenLabel).toBeDefined();
    expect(greenLabel!.originX).toBe(0);

    // Data row score is right-aligned at player column
    // Blue/5 with no investments scores -15 (5 - 20 base)
    const blueScore = allTexts.find(t => t.text === '-15' && Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE);
    expect(blueScore).toBeDefined();
    expect(blueScore!.originX).toBe(1);
  });

  it('should use correct origins for total and cumulative rows in round-end overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);

    setupPlayerLastCard(internals);
    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(400);
    internals.turnController.onDrawPileClick();
    await wait(800);

    const allTexts = collectTexts(scene);

    // "Round Total" label left-aligned
    const totalLabel = allTexts.find(t => t.text.startsWith('Round Total') && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(totalLabel).toBeDefined();
    expect(totalLabel!.originX).toBe(0);

    // Player 0 total is -15 - right-aligned
    const totalP0Score = allTexts.find(t => t.text === '-15' && Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE);
    expect(totalP0Score).toBeDefined();
    expect(totalP0Score!.originX).toBe(1);

    // "Cumulative" label left-aligned
    const cumLabel = allTexts.find(t => t.text.startsWith('Cumulative') && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(cumLabel).toBeDefined();
    expect(cumLabel!.originX).toBe(0);

    // Cumulative score for player 0 is also -15 - right-aligned
    const cumP0Score = allTexts.find(t => t.text === '-15' && Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE);
    expect(cumP0Score).toBeDefined();
    expect(cumP0Score!.originX).toBe(1);
  });

  it('should create separate text objects per column in match-end overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);
    const session = internals.session;

    session.round.drawPile = makeDrawPile('red');
    session.players[0].hand = makeHand(['blue', 5]);
    session.players[1].hand = makeHand(['green', 3]);
    for (const p of session.players) {
      for (const color of EXPEDITION_COLORS) {
        p.expeditions.set(color, []);
      }
    }
    session.matchPhase = 'playing';
    session.roundNumber = 3; // Final round
    session.round.currentPlayer = 0;
    session.round.turnPhase = 'PlayOrDiscard';
    session.round.justDiscardedColor = null;
    session.round.turnNumber = 1;
    session.roundScores = [
      { totals: [10, 5], details: [[], []] },
      { totals: [8, 12], details: [[], []] },
    ];
    session.cumulativeScores = [18, 17];

    internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
    internals.turnController.setPhase('waiting-for-card-select');

    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(400);
    internals.turnController.onDrawPileClick();
    await wait(800);

    expect(session.matchPhase).toBe('match-over');

    const allTexts = collectTexts(scene);

    // Header uses individual texts at correct positions
    const headerRound = allTexts.find(t => t.text === 'Round' && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(headerRound).toBeDefined();
    expect(headerRound!.originX).toBe(0);

    const headerYou = allTexts.find(t => t.text === 'You' && Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE);
    expect(headerYou).toBeDefined();
    expect(headerYou!.originX).toBe(1);

    const headerAi = allTexts.find(t => t.text === 'AI' && Math.abs(t.x - COL_P1_X) <= POS_TOLERANCE);
    expect(headerAi).toBeDefined();
    expect(headerAi!.originX).toBe(1);

    // "Final Total" label left-aligned
    const finalTotalLabel = allTexts.find(t => t.text.startsWith('Final Total') && Math.abs(t.x - COL_LABEL_X) <= POS_TOLERANCE);
    expect(finalTotalLabel).toBeDefined();
    expect(finalTotalLabel!.originX).toBe(0);

    // There should be right-aligned score texts at player columns
    const rightAlignedScoreP0 = allTexts.find(t =>
      Math.abs(t.x - COL_P0_X) <= POS_TOLERANCE && t.originX === 1 &&
      t.text !== 'You' && t.text !== 'AI',
    );
    expect(rightAlignedScoreP0).toBeDefined();

    const rightAlignedScoreP1 = allTexts.find(t =>
      Math.abs(t.x - COL_P1_X) <= POS_TOLERANCE && t.originX === 1 &&
      t.text !== 'You' && t.text !== 'AI',
    );
    expect(rightAlignedScoreP1).toBeDefined();
  });

  it('should render Menu button in match-end overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('LostCitiesScene')!;
    const internals = getSceneInternals(scene);
    const session = internals.session;

    session.round.drawPile = makeDrawPile('red');
    session.players[0].hand = makeHand(['blue', 5]);
    session.players[1].hand = makeHand(['green', 3]);
    for (const p of session.players) {
      for (const color of EXPEDITION_COLORS) {
        p.expeditions.set(color, []);
      }
    }
    session.matchPhase = 'playing';
    session.roundNumber = 3; // Final round
    session.round.currentPlayer = 0;
    session.round.turnPhase = 'PlayOrDiscard';
    session.round.justDiscardedColor = null;
    session.round.turnNumber = 1;
    session.roundScores = [
      { totals: [10, 5], details: [[], []] },
      { totals: [8, 12], details: [[], []] },
    ];
    session.cumulativeScores = [18, 17];

    internals.lcRenderer.refreshAll((idx: number) => internals.turnController.onHandCardClick(idx));
    internals.turnController.setPhase('waiting-for-card-select');

    internals.turnController.onHandCardClick(0);
    await wait(50);
    internals.turnController.onExpeditionClick();
    await wait(400);
    internals.turnController.onDrawPileClick();
    await wait(800);

    expect(session.matchPhase).toBe('match-over');

    const allTexts = collectTexts(scene);

    // Verify Menu button exists
    const menuBtn = allTexts.find(t => t.text === '[ Menu ]');
    expect(menuBtn).toBeDefined();

    // Verify New Match button still exists
    const newMatchBtn = allTexts.find(t => t.text === '[ New Match ]');
    expect(newMatchBtn).toBeDefined();

  });
});
