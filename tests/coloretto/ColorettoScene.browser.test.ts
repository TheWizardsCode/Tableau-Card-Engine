/**
 * Coloretto browser tests -- boots the Phaser scene and verifies the
/**
 * Coloretto browser tests -- boots the Phaser scene and verifies the
 * start overlay and round start flow (acceptance criteria 5/6), plus
 * the positive-color picker chip lifecycle (CG-0MSHF32FY007SNCJ), the
 * take-a-row fly animation (CG-0MSHFPC0J00155UN), and the animated card
 * placement: a normal place moves the card from the deck to the row slot
 * and then flips it face-up, while the Last Round card flips face-up ON
 * the deck and then settles at its resting position between the tableau
 * and deck (CG-0MSHI9EAR008SVPD).
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';
import { createColorettoDeck, COLORS } from '../../example-games/coloretto/ColorettoCards';

// Visual constants mirrored from ColorettoScene (deliberately kept in
// sync: the originals are module-private there).
const CARD_W = 58;
const CARD_H = 78;
const ROW_CARD_GAP = 10;
const ROW_STEP_MAX = 92;
const CHIP_W = 20;
const CHIP_H = 28;
/** Fixed width of the name+score column (mirrors NAME_COLUMN_W). */
const NAME_COLUMN_W = 200;
/** Tight name→chip gap (mirrors NAME_CHIP_GAP). */
const NAME_CHIP_GAP = 30;
/** Horizontal step between colour chips (mirrors CHIP_GAP). */
const CHIP_GAP = 26;
/** Gap after the last chip before the round-state marker (mirrors ROUND_MARKER_GAP). */
const ROUND_MARKER_GAP = 8;
/** Total width of the three row card slots (mirrors ROW_TOTAL_WIDTH). */
const ROW_TOTAL_WIDTH = 3 * CARD_W + 2 * ROW_CARD_GAP;

/** Round-score chip border colors (mirror colorHex('green') / colorHex('red')). */
const ROUND_POS_STROKE = 0x3aa655;
const ROUND_NEG_STROKE = 0xe04444;

/** SettingsStore localStorage key for reduced motion. */
const REDUCED_MOTION_KEY = 'tce-ui-reduced-motion';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createColorettoGame } = await import('../../example-games/coloretto/createColorettoGame');
  const game = createColorettoGame({ type: Phaser.CANVAS });
  await waitForScene(game, 'ColorettoScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
  localStorage.removeItem(REDUCED_MOTION_KEY);
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

/** Poll a predicate until it is true or the timeout elapses (16ms interval). */
function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitForCondition timed out'));
      }
      setTimeout(check, 16);
    };
    check();
  });
}

/** Collect display objects from scene children and the HUD container. */
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

function textObjects(scene: Phaser.Scene): Phaser.GameObjects.Text[] {
  return collectFromSceneAndHud(
    scene,
    (obj): obj is Phaser.GameObjects.Text => obj instanceof Phaser.GameObjects.Text,
  );
}

function texts(scene: Phaser.Scene): string[] {
  return textObjects(scene).map((t) => t.text);
}

/** All text contents inside a single container subtree. */
function textsInContainer(container: Phaser.GameObjects.Container): string[] {
  const out: string[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const child of list) {
      if (child instanceof Phaser.GameObjects.Text) out.push(child.text);
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk((container as any).list ?? []);
  return out;
}

/** Find a text object whose content includes the given substring. */
function findText(scene: Phaser.Scene, fragment: string): Phaser.GameObjects.Text | undefined {
  return textObjects(scene).find((t) => t.text.includes(fragment));
}

/** Text contents that look like a removed tableau row label (R1, R2, ...). */
function rowLabelTexts(scene: Phaser.Scene): string[] {
  return texts(scene).filter((t) => /^R\d+$/.test(t.trim()));
}

/** Colour chips inside the collections container (Rectangles of CHIP_W×CHIP_H). */
function collectionChipRectangles(scene: any): Phaser.GameObjects.Rectangle[] {
  const result: Phaser.GameObjects.Rectangle[] = [];
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const child of list) {
      if (
        child instanceof Phaser.GameObjects.Rectangle &&
        child.width === CHIP_W &&
        child.height === CHIP_H
      ) {
        result.push(child);
      }
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk((scene.collectionsContainer as any).list ?? []);
  return result;
}

/** Simulate a pointerdown on a text object. */
function clickText(scene: Phaser.Scene, fragment: string): boolean {
  const obj = findText(scene, fragment);
  if (!obj) return false;
  obj.emit('pointerdown');
  return true;
}


/**
 * Interactive rectangles at depth 201 uniquely identify the positive-color
 * picker chips (fill rect + count label + point label are created at depth
 * 201; the only other interactive rectangles -- row click zones -- sit at
 * depth 0, and Help/Settings panels live at depth 900+).
 *
 * Walks only `scene.children.list` (recursively): hudContainer is itself a
 * child of the scene display list, so walking it separately would double-
 * count every chip. This helper is used for exact counts, unlike the
 * presence-based `texts`/`findText` helpers.
 */
function pickerChipRectangles(
  scene: Phaser.Scene,
): Phaser.GameObjects.Rectangle[] {
  const result: Phaser.GameObjects.Rectangle[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 201 &&
        Boolean((child as any).input)
      ) {
        result.push(child);
      }
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  return result;
}

/**
 * Round-score overlay chips: small coloured rectangles at depth 201 with a
 * colour-coded border (green = positive group, red = negative group).
 * Non-interactive, so they never collide with `pickerChipRectangles()`
 * (which requires an input handler).
 */
function roundScoreChips(scene: Phaser.Scene): Phaser.GameObjects.Rectangle[] {
  const result: Phaser.GameObjects.Rectangle[] = [];
  const walk = (parent: Phaser.GameObjects.GameObject[]) => {
    for (const child of parent) {
      if (
        child instanceof Phaser.GameObjects.Rectangle &&
        child.depth === 201 &&
        child.isStroked &&
        (child.strokeColor === ROUND_POS_STROKE || child.strokeColor === ROUND_NEG_STROKE)
      ) {
        result.push(child);
      }
      if (child instanceof Phaser.GameObjects.Container && (child as any).list) {
        walk((child as any).list);
      }
    }
  };
  walk(scene.children.list);
  return result;
}

/** Collect the Text contents inside a container subtree (e.g. a card face). */
function containerTexts(container: Phaser.GameObjects.Container): string[] {
  const result: string[] = [];
  for (const child of (container as any).list ?? []) {
    if (child instanceof Phaser.GameObjects.Text) result.push(child.text);
    if (child instanceof Phaser.GameObjects.Container) {
      result.push(...containerTexts(child));
    }
  }
  return result;
}

/** Take-animation flyers: card-face containers rendered at depth 100. */
function flyerContainers(scene: Phaser.Scene): Phaser.GameObjects.Container[] {
  return collectFromSceneAndHud(
    scene,
    (obj): obj is Phaser.GameObjects.Container =>
      obj instanceof Phaser.GameObjects.Container && obj.depth === 100,
  );
}

/** Poll until the scene's phase manager reaches the given phase. */
async function waitForPhase(scene: any, phase: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (scene.phaseManager?.current === phase) return;
    await waitFrames(2);
  }
  throw new Error(
    `Timed out waiting for phase "${phase}" (current: ${scene.phaseManager?.current})`,
  );
}

/** Boot the game, start a 2-player game (you + 1 AI) and await the human turn. */
async function startTwoPlayerGame(game: Phaser.Game): Promise<any> {
  const scene = game.scene.getScene('ColorettoScene') as any;
  await waitFrames(10);
  expect(clickText(scene, '2 (1 AI)')).toBe(true);
  // The randomized turn order may put the AI first, so strip the Last
  // Round card from the draw pile IMMEDIATELY (before any AI turn runs)
  // to prevent an AI turn from triggering an early round end mid-test
  // (these tests exercise animations, not the Last Round flow).
  scene.session.deck = createColorettoDeck().filter(
    (c) => c.type !== 'last-round',
  );
  await waitForCondition(() => scene.phaseManager?.current === 'human-turn');
  return scene;
}

/** Execute a human place action on the given row. */
function humanPlace(scene: any, rowIndex: number): void {
  scene.actionMode = 'place';
  scene.onRowClick(rowIndex);
}

/** Expected centre of a row slot in scene coordinates (mirrors rowSlotPosition). */
function slotCenter(scene: any, rowIndex: number, slotIndex: number): { x: number; y: number } {
  const rows = scene.session.rows.length;
  const step = Math.min(ROW_STEP_MAX, Math.floor(360 / rows));
  const startY = scene.layout.rowsCenterY - ((rows - 1) * step) / 2;
  const rowY = startY + rowIndex * step;
  const totalWidth = 3 * CARD_W + 2 * ROW_CARD_GAP;
  const startX = scene.layout.rowsCenterX - totalWidth / 2;
  const cardX = startX + slotIndex * (CARD_W + ROW_CARD_GAP);
  return { x: cardX + CARD_W / 2, y: rowY + CARD_H / 2 };
}

/** True when the flight card has been flipped (its '?' back swapped for the card face). */
function flightFaceShown(flight: any): boolean {
  if (!flight) return false;
  const inner = flight.getAt(0);
  if (!inner || !inner.list) return false;
  return inner.list.some(
    (o: any) => o instanceof Phaser.GameObjects.Text && o.text !== '?',
  );
}

/**
 * Card-face backgrounds rendered at world (0,0): createCardFace() builds its
 * objects with a depth-0 Rectangle of exactly CARD_W×CARD_H as the face
 * background. Before the fix, the face was created at scene level at (0,0)
 * and stayed there for the whole move phase, flashing in the top-left corner
 * of the screen. The empty-slot outlines live inside rowsContainer at
 * row-slot positions, so a top-level Rectangle of exactly CARD_W×CARD_H at
 * (0,0) uniquely identifies a stray face.
 */
function strayFaceBgsAtOrigin(scene: Phaser.Scene): Phaser.GameObjects.Rectangle[] {
  return (scene.children.list as Phaser.GameObjects.GameObject[]).filter(
    (obj): obj is Phaser.GameObjects.Rectangle =>
      obj instanceof Phaser.GameObjects.Rectangle &&
      obj.depth === 0 &&
      obj.width === CARD_W &&
      obj.height === CARD_H &&
      obj.x === 0 &&
      obj.y === 0,
  );
}

describe('ColorettoScene (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('boots and shows the player-count start overlay', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('How many players?'))).toBe(true);
    expect(allTexts.some((t) => t.includes('2 (1 AI)'))).toBe(true);
    expect(allTexts.some((t) => t.includes('5 (4 AI)'))).toBe(true);
  });

  it('starts a 3-player game after selecting the player count', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);
    expect(clickText(scene, '3 (2 AI)')).toBe(true);

    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('Round 1 of 5'))).toBe(true);
    expect(allTexts.some((t) => t.includes('Deck'))).toBe(true);
    // Row labels R1..Rn were removed (layout polish work item); no label
    // texts may render to the left of the tableau after game start.
    expect(rowLabelTexts(scene)).toHaveLength(0);
  });

  it('starts a 2-player game with 7 rounds and 3 rows', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as Phaser.Scene;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    await waitFrames(10);

    const allTexts = texts(scene);
    expect(allTexts.some((t) => t.includes('Round 1 of 7'))).toBe(true);
    // 3 shared rows for a 2-player game; row labels R1..Rn no longer render.
    expect((scene as any).session.rows).toHaveLength(3);
    expect(rowLabelTexts(scene)).toHaveLength(0);
  });


  it('destroys positive-color picker chips on confirm so none leak into the next round', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    // Await the human turn so no AI delayed turn is pending while the test
    // forces a round end (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Baseline: no interactive rectangles at the picker chip depth (201).
    expect(pickerChipRectangles(scene)).toHaveLength(0);

    // Force a round end with 3+ colors in the human player's collection
    // so the positive-color picker appears.
    const session = scene.session;
    session.players[0].collection = [
      { id: 901, type: 'chameleon', color: 'red', count: 1 },
      { id: 902, type: 'chameleon', color: 'yellow', count: 1 },
      { id: 903, type: 'chameleon', color: 'green', count: 1 },
    ];
    session.players[0].roundState = 'taken-row';
    session.players[1].roundState = 'taken-row';
    scene.handleRoundOver();

    await waitFrames(10);

    // Picker overlay is visible with one chip per present color.
    expect(findText(scene, 'Choose 3 colors to score POSITIVELY')).toBeDefined();
    expect(pickerChipRectangles(scene)).toHaveLength(3);

    // Confirm the selection.
    expect(clickText(scene, 'Confirm')).toBe(true);
    await waitFrames(10);

    // Round-score overlay appears and the picker chips are already gone.
    expect(findText(scene, 'Round 1 Scores')).toBeDefined();
    expect(pickerChipRectangles(scene)).toHaveLength(0);

    // Advance to the next round.
    expect(clickText(scene, 'Next Round')).toBe(true);
    await waitFrames(10);

    expect(findText(scene, 'Round 2 of 7')).toBeDefined();
    // Regression: no picker chips survive into the next round.
    expect(pickerChipRectangles(scene)).toHaveLength(0);
  });

  it('lets the player choose exactly 3 positives from 4+ colors and shows the negative breakdown', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    // Await the human turn so no AI delayed turn is pending while the test
    // forces a round end (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Round 2+ scenario: the human holds cards in 4 colors (accumulated
    // across rounds), so one color must score negatively.
    const session = scene.session;
    session.players[0].collection = [
      { id: 901, type: 'chameleon', color: 'red', count: 1 },
      { id: 902, type: 'chameleon', color: 'yellow', count: 1 },
      { id: 903, type: 'chameleon', color: 'green', count: 1 },
      { id: 904, type: 'chameleon', color: 'blue', count: 1 },
    ];
    session.players[0].roundState = 'taken-row';
    session.players[1].roundState = 'taken-row';
    scene.handleRoundOver();
    await waitFrames(10);

    // Picker appears with one chip per present color (4).
    expect(findText(scene, 'Choose 3 colors to score POSITIVELY')).toBeDefined();

    // The 3 optimal positives (red, yellow, green) start selected; blue is
    // the single negative (1-card colors → any 3 beat leaving the 4th out).
    // Note: textObjects() walks the HUD container twice (it is a child of
    // the scene display list), so dedupe by object identity before counting.
    const countPtsLabels = (label: string): number =>
      new Set(textObjects(scene).filter((t) => t.text === label)).size;
    let chips = pickerChipRectangles(scene);
    expect(chips).toHaveLength(4);
    expect(countPtsLabels('+1')).toBe(3);
    expect(countPtsLabels('−1')).toBe(1);

    // Clicking the unselected 4th chip (blue, index 3) while 3 are already
    // selected must be refused: no 4th positive is allowed. (The refused
    // path returns before drawChips(), so the chip references stay valid.)
    chips[3].emit('pointerdown');
    await waitFrames(10);
    expect(countPtsLabels('+1')).toBe(3);
    expect(countPtsLabels('−1')).toBe(1);
    expect(findText(scene, 'You may only pick 3 positive colors')).toBeDefined();

    // Swap: deselect red (index 0), then select blue (index 3). drawChips()
    // destroys and rebuilds the chip objects on every selection change, so
    // re-query the picker rectangles before each click.
    chips = pickerChipRectangles(scene);
    chips[0].emit('pointerdown');
    await waitFrames(10);
    expect(countPtsLabels('+1')).toBe(2);
    expect(countPtsLabels('−1')).toBe(2);
    chips = pickerChipRectangles(scene);
    chips[3].emit('pointerdown');
    await waitFrames(10);
    expect(countPtsLabels('+1')).toBe(3);
    expect(countPtsLabels('−1')).toBe(1);

    expect(clickText(scene, 'Confirm')).toBe(true);
    await waitFrames(10);

    // Round-score overlay shows the per-colour breakdown as chips: the
    // positive group (green borders) renders before the negative group
    // (red borders). Red was not chosen as positive, so it scores against
    // the player.
    expect(findText(scene, 'Round 1 Scores')).toBeDefined();
    const scoreChips = roundScoreChips(scene);
    expect(scoreChips).toHaveLength(4);
    expect(scoreChips.filter((c) => c.strokeColor === ROUND_POS_STROKE)).toHaveLength(3);
    expect(scoreChips.filter((c) => c.strokeColor === ROUND_NEG_STROKE)).toHaveLength(1);
    // Chip labels carry the +/− sign markers.
    expect(countPtsLabels('+1')).toBe(3);
    expect(countPtsLabels('−1')).toBe(1);
    // 1 + 1 + 1 (yellow, green, blue) − 1 (red) = 2.
    expect(findText(scene, '+2 (total 2)')).toBeDefined();
  });

  it('renders the round-score chips for all 7 colours without overlapping the score', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    // Await the human turn so no AI delayed turn is pending while the test
    // forces a round end (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Human holds one card in every colour: the 3 optimal positives
    // (red, yellow, green) and 4 negatives.
    const session = scene.session;
    session.players[0].collection = [
      { id: 901, type: 'chameleon', color: 'red', count: 1 },
      { id: 902, type: 'chameleon', color: 'yellow', count: 1 },
      { id: 903, type: 'chameleon', color: 'green', count: 1 },
      { id: 904, type: 'chameleon', color: 'blue', count: 1 },
      { id: 905, type: 'chameleon', color: 'purple', count: 1 },
      { id: 906, type: 'chameleon', color: 'orange', count: 1 },
      { id: 907, type: 'chameleon', color: 'brown', count: 1 },
    ];
    session.players[0].roundState = 'taken-row';
    session.players[1].roundState = 'taken-row';
    scene.handleRoundOver();
    await waitFrames(10);

    expect(findText(scene, 'Choose 3 colors to score POSITIVELY')).toBeDefined();
    expect(clickText(scene, 'Confirm')).toBe(true);
    await waitFrames(10);

    // All 7 colours render as chips: 3 positives (green border) then 4
    // negatives (red border).
    expect(findText(scene, 'Round 1 Scores')).toBeDefined();
    const scoreChips = roundScoreChips(scene);
    expect(scoreChips).toHaveLength(7);
    expect(scoreChips.filter((c) => c.strokeColor === ROUND_POS_STROKE)).toHaveLength(3);
    expect(scoreChips.filter((c) => c.strokeColor === ROUND_NEG_STROKE)).toHaveLength(4);

    // The positive group renders left of the negative group (gap between).
    const posMaxX = Math.max(...scoreChips.filter((c) => c.strokeColor === ROUND_POS_STROKE).map((c) => c.x));
    const negMinX = Math.min(...scoreChips.filter((c) => c.strokeColor === ROUND_NEG_STROKE).map((c) => c.x));
    expect(posMaxX).toBeLessThan(negMinX);

    // The rightmost chip stays clear of the right-aligned round score
    // (3 − 4 = −1, rendered as "-1 (total -1)").
    const rightmost = Math.max(...scoreChips.map((c) => c.x + c.width / 2));
    const scoreText = findText(scene, '-1 (total -1)');
    expect(scoreText).toBeDefined();
    expect(rightmost).toBeLessThan(scoreText!.x - scoreText!.width / 2);
  });

  it('animates taken row cards into the collector collection on a take', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;

    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    // Strip the Last Round card so an AI-first randomized turn order can
    // never end the round mid-test (these tests drive their own turns).
    scene.session.deck = createColorettoDeck().filter(
      (c) => c.type !== 'last-round',
    );
    // Await the human turn so no AI delayed turn is pending while the test
    // forces its own turn state (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Force a deterministic take: seed row 0 with two face-up cards and
    // make player 0 the current player.
    scene.session.rows[0].cards = [
      { id: 900, type: 'chameleon', color: 'red', count: 2 },
      { id: 901, type: 'chameleon', color: 'blue', count: 1 },
    ];
    scene.session.currentTurnIndex = 0;
    scene.session.players[0].roundState = 'active';
    scene.refreshAll();

    // Take row 0 exactly as a player would (click the row zone).
    scene.actionMode = 'take';
    expect(scene.phaseManager.current).toBe('human-turn');
    const zones = scene.rowZones as Phaser.GameObjects.Rectangle[];
    expect(zones[0]).toBeDefined();
    zones[0].emit('pointerdown');

    // Session state changes at action execution (pure-TS invariant):
    // cards move from the row into the collection immediately.
    const collectedIds = (scene.session.players[0].collection as { id: number }[]).map((c) => c.id);
    expect(collectedIds).toEqual([900, 901]);
    expect(scene.session.rows[0].cards).toHaveLength(0);

    // The 'animating' phase blocks input and holds the turn flow.
    expect(scene.phaseManager.current).toBe('animating');

    // Flyers show card faces (count + color labels), not backs.
    const flyers = flyerContainers(scene);
    expect(flyers).toHaveLength(2);
    const faces = flyers.flatMap((f) => containerTexts(f));
    expect(faces.some((t) => t.includes('×'))).toBe(true);
    expect(faces.some((t) => t === 'Red')).toBe(true);
    expect(faces.some((t) => t === 'Blue')).toBe(true);

    // The turn advances only after the last card lands.
    await waitForPhase(scene, 'ai-thinking');
    expect(flyerContainers(scene)).toHaveLength(0);
    expect(
      (scene.session.players[0].collection as { id: number }[]).map((c) => c.id),
    ).toEqual([900, 901]);
  });

  it('applies a take instantly without animation in reduced-motion mode', async () => {
    window.localStorage.setItem('tce-ui-reduced-motion', 'true');
    try {
      game = await bootGame();
      const scene = game.scene.getScene('ColorettoScene') as any;
      await waitFrames(10);

      expect(scene.reducedMotion).toBe(true);
      expect(clickText(scene, '2 (1 AI)')).toBe(true);
      // Strip the Last Round card so an AI-first randomized turn order can
      // never end the round mid-test (these tests drive their own turns).
      scene.session.deck = createColorettoDeck().filter(
        (c) => c.type !== 'last-round',
      );
      // Await the human turn so no AI delayed turn is pending while the test
      // forces its own turn state (turn order is randomized at game start).
      await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

      scene.session.rows[0].cards = [
        { id: 902, type: 'chameleon', color: 'green', count: 1 },
      ];
      scene.session.currentTurnIndex = 0;
      scene.session.players[0].roundState = 'active';
      scene.refreshAll();

      scene.actionMode = 'take';
      const zones = scene.rowZones as Phaser.GameObjects.Rectangle[];
      expect(zones[0]).toBeDefined();
      zones[0].emit('pointerdown');

      // Instant transfer: no 'animating' phase, no flyers, turn advances.
      expect(scene.phaseManager.current).toBe('ai-thinking');
      expect(flyerContainers(scene)).toHaveLength(0);
      expect(
        (scene.session.players[0].collection as { id: number }[]).map((c) => c.id),
      ).toEqual([902]);
      expect(scene.session.rows[0].cards).toHaveLength(0);
    } finally {
      window.localStorage.removeItem('tce-ui-reduced-motion');
    }
  });

  it('animates an AI take action the same way as a human take', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;
    await waitFrames(10);
    expect(clickText(scene, '2 (1 AI)')).toBe(true);
    // Strip the Last Round card so an AI-first randomized turn order can
    // never end the round mid-test (these tests drive their own turns).
    scene.session.deck = createColorettoDeck().filter(
      (c) => c.type !== 'last-round',
    );
    // Await the human turn so no AI delayed turn is pending while the test
    // forces its own turn state (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Make player 1 (the AI) the current player with a takeable row, then
    // drive the same code path runTurn uses for AI players.
    scene.session.rows[0].cards = [
      { id: 910, type: 'chameleon', color: 'purple', count: 2 },
      { id: 911, type: 'chameleon', color: 'yellow', count: 1 },
    ];
    scene.session.currentTurnIndex = 1;
    scene.session.players[1].roundState = 'active';
    scene.refreshAll();

    scene.executeTurn(1, { type: 'take', rowIndex: 0 });

    expect(
      (scene.session.players[1].collection as { id: number }[]).map((c) => c.id),
    ).toEqual([910, 911]);
    expect(scene.session.rows[0].cards).toHaveLength(0);
    expect(scene.phaseManager.current).toBe('animating');
    expect(flyerContainers(scene)).toHaveLength(2);

    // After the flyers land the turn passes back to the human.
    await waitForPhase(scene, 'human-turn');
    expect(flyerContainers(scene)).toHaveLength(0);
  });


  it('animates a human placement: card flies from the deck, moves to the row slot, then flips', async () => {
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);
    const deckX = scene.layout.deckCenterX;
    const deckY = scene.layout.deckCenterY;
    const dest = slotCenter(scene, 0, 0);

    humanPlace(scene, 0);

    // The turn is gated: the board enters the 'animating' phase and an
    // in-flight card is created at the deck position.
    expect(scene.phaseManager.current).toBe('animating');
    expect(scene.flightCard).not.toBeNull();
    expect(scene.flightCard.x).toBe(deckX);
    expect(scene.flightCard.y).toBe(deckY);

    // The card first moves to the destination row slot (move-then-flip):
    // by the time the face is swapped in, the flight is at the slot centre.
    await waitForCondition(
      () =>
        scene.flightCard &&
        flightFaceShown(scene.flightCard) &&
        Math.abs(scene.flightCard.x - dest.x) < 3 &&
        Math.abs(scene.flightCard.y - dest.y) < 3,
    );

    // The flight is destroyed after the flip completes (the AI turn then
    // begins; the human's card is on row 0 -- an AI card drawn before the
    // human's first turn may share the row).
    await waitForCondition(() => scene.flightCard === null);
    expect(scene.session.rows[0].cards.length).toBeGreaterThanOrEqual(1);

    // The turn continues: the AI thinks and then places; eventually the
    // human turn is restored.
    await waitForCondition(() => scene.phaseManager.current === 'human-turn');
    expect(scene.flightCard).toBeNull();
  }, 15000);

  it('never renders a card face at world (0,0) during a placement animation', async () => {
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);

    humanPlace(scene, 0);

    // The board gates behind 'animating' and an in-flight card is created.
    expect(scene.phaseManager.current).toBe('animating');
    expect(scene.flightCard).not.toBeNull();

    // Poll across the whole move-then-flip animation: a card-face background
    // (depth-0 Rectangle of CARD_W×CARD_H at world (0,0)) must never exist at
    // any point. (Regression for the top-left flash: createCardFace built its
    // objects at scene level at (0,0), where they rendered for the entire
    // move phase until the flip re-parented them.)
    while (scene.flightCard) {
      expect(strayFaceBgsAtOrigin(scene)).toHaveLength(0);
      await waitFrames(1);
    }

    // The placement still completes normally: the human's card is on row 0
    // (an AI card drawn before the human's first turn may share the row).
    expect(scene.session.rows[0].cards.length).toBeGreaterThanOrEqual(1);
  }, 15000);

  it('ignores row clicks while a placement animation is in flight', async () => {
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);

    // Snapshot row counts: the randomized turn order may put the AI first,
    // leaving an AI card on the board before the human's first turn.
    const rowCountsBefore = scene.session.rows.map((r: { cards: unknown[] }) => r.cards.length);

    humanPlace(scene, 0);
    expect(scene.phaseManager.current).toBe('animating');

    // The mode buttons disappear while the board is gated.
    expect(scene.placeButton).toBeNull();

    // A row click during the animation must be ignored.
    scene.onRowClick(1);
    expect(scene.session.rows[1].cards.length).toBe(rowCountsBefore[1]);

    // When the animation completes (before the AI acts), only the human's
    // card has been placed and the ignored click left row 1 untouched.
    await waitForCondition(() => scene.flightCard === null);
    expect(scene.session.rows[0].cards.length).toBe(rowCountsBefore[0] + 1);
    expect(scene.session.rows[1].cards.length).toBe(rowCountsBefore[1]);
  }, 15000);

  it('animates an AI placement and resumes the human turn', async () => {
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);

    // The board may already hold a card from the AI's lead turn when the
    // randomized turn order put the AI first (startTwoPlayerGame awaits the
    // human turn, so the AI's first placement precedes this point).
    const cardsBefore = [0, 1, 2].reduce(
      (sum, i) => sum + scene.session.rows[i].cards.length,
      0,
    );

    humanPlace(scene, 0);

    // Human placement completes and the AI turn begins.
    await waitForCondition(() => scene.phaseManager.current === 'ai-thinking');

    // The AI placement runs through the same animation pipeline. The flight
    // is created centred on the deck and the move tween starts immediately,
    // so catch it near the deck within a small tolerance (the flight can
    // already be a few pixels into the move when the poll fires).
    await waitForCondition(
      () =>
        scene.phaseManager.current === 'animating' &&
        scene.flightCard !== null &&
        Math.abs(scene.flightCard.x - scene.layout.deckCenterX) < 20,
    );
    expect(Math.abs(scene.flightCard.x - scene.layout.deckCenterX)).toBeLessThan(20);

    await waitForCondition(
      () => scene.flightCard === null && scene.phaseManager.current === 'human-turn',
    );
    // Exactly two placements happened since the snapshot: the human's and
    // the AI's (the AI may pick any non-full row).
    const totalCards = [0, 1, 2].reduce(
      (sum, i) => sum + scene.session.rows[i].cards.length,
      0,
    );
    expect(totalCards).toBe(cardsBefore + 2);
    expect(scene.session.currentTurnIndex).toBe(0);
  }, 15000);

  it('applies placements instantly when reduced motion is enabled', async () => {
    localStorage.setItem(REDUCED_MOTION_KEY, 'true');
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);
    expect(scene.reducedMotion).toBe(true);

    // The board may already hold a card from the AI's lead turn when the
    // randomized turn order put the AI first (see above).
    const cardsBefore = [0, 1, 2].reduce(
      (sum, i) => sum + scene.session.rows[i].cards.length,
      0,
    );

    humanPlace(scene, 0);

    // No in-flight card is created and the turn advances synchronously.
    expect(scene.flightCard).toBeNull();
    expect(scene.phaseManager.current).toBe('ai-thinking');

    await waitForCondition(() => scene.phaseManager.current === 'human-turn');
    // Both turns completed instantly in reduced-motion mode: the human's
    // card is on row 0 and the AI placed one card on some row. The AI's
    // row choice is RNG-dependent (all rows are equal value at game start),
    // so assert the total across rows rather than a specific row.
    const totalCards = [0, 1, 2].reduce(
      (sum, i) => sum + scene.session.rows[i].cards.length,
      0,
    );
    expect(totalCards).toBe(cardsBefore + 2);
    expect(scene.session.rows[0].cards.length).toBeGreaterThanOrEqual(1);
    expect(scene.flightCard).toBeNull();
  }, 15000);

  it('Last Round card: flips on the deck, settles at the resting position, and is omitted from its slot', async () => {
    game = await bootGame();
    const scene = await startTwoPlayerGame(game);

    // Force the human's next draw to be the Last Round card, leaving one
    // chameleon card so the AI can still take its final turn.
    const cards = createColorettoDeck();
    const lr = cards.find((c) => c.type === 'last-round')!;
    const chameleon = cards.find((c) => c.type === 'chameleon')!;
    scene.session.deck = [chameleon, lr];

    humanPlace(scene, 0);

    // Gated animation starts with the flight on the deck.
    expect(scene.phaseManager.current).toBe('animating');
    expect(scene.flightCard).not.toBeNull();
    expect(scene.flightCard.x).toBe(scene.layout.deckCenterX);
    expect(scene.flightCard.y).toBe(scene.layout.deckCenterY);

    // The Last Round card flips face-up ON the deck...
    await waitForCondition(
      () =>
        scene.flightCard &&
        flightFaceShown(scene.flightCard) &&
        Math.abs(scene.flightCard.x - scene.layout.deckCenterX) < 3 &&
        Math.abs(scene.flightCard.y - scene.layout.deckCenterY) < 3,
    );

    // ...then settles at the resting position between the tableau and deck.
    await waitForCondition(
      () =>
        scene.flightCard &&
        flightFaceShown(scene.flightCard) &&
        Math.abs(scene.flightCard.x - scene.layout.lastRoundCenterX) < 3 &&
        Math.abs(scene.flightCard.y - scene.layout.lastRoundCenterY) < 3,
    );

    await waitForCondition(() => scene.flightCard === null);
    expect(scene.session.lastRoundTriggered).toBe(true);
    // The Last Round card was placed onto row 0 (an AI card drawn before
    // the human's first turn may share the row).
    expect(scene.session.rows[0].cards.some((c: { type: string }) => c.type === 'last-round')).toBe(true);
    // The human's placement was their final turn; the AI (still active)
    // gets one more animated turn.
    expect(scene.phaseManager.current).toBe('ai-thinking');

    // Rendered state while the round is still in play: exactly one 'LR'
    // face in the scene, at the resting position (the row slot renders an
    // empty outline instead).
    expect(scene.lastRoundContainer.list.length).toBe(1);
    const resting = scene.lastRoundContainer.list[0];
    expect(resting.x).toBe(scene.layout.lastRoundCenterX - CARD_W / 2);
    expect(resting.y).toBe(scene.layout.lastRoundCenterY - CARD_H / 2);
    expect(textsInContainer(scene.rowsContainer)).not.toContain('LR');
    const lrTexts = textObjects(scene).filter((t) => t.text === 'LR');
    expect(lrTexts.length).toBe(1);

    // The AI's final turn is also animated; the round then ends.
    await waitForCondition(
      () => scene.phaseManager.current === 'animating' && scene.flightCard !== null,
    );
    await waitForCondition(() => scene.flightCard === null);
  }, 15000);

  it.each([2, 3, 4, 5])(
    'centres the collections block, tightens the name→chip gap, clears the tableau, and omits row labels (%i players)',
    async (count) => {
      game = await bootGame();
      const scene = game.scene.getScene('ColorettoScene') as any;
      await waitFrames(10);
      expect(clickText(scene, `${count} (${count - 1} AI)`)).toBe(true);
      // Await the human turn (turn order is randomized at game start), then
      // force identity order so the layout assertions below are
      // deterministic: the human's seeded chips render on the first row.
      await waitForCondition(() => scene.phaseManager?.current === 'human-turn');
      scene.session.turnOrder = Array.from({ length: count }, (_, i) => i);
      scene.session.roundStartPlayer = 0;

      // Row labels R1..Rn no longer render after game start.
      expect(rowLabelTexts(scene)).toHaveLength(0);

      // Fresh games start with empty collections; seed a full 5-colour
      // collection for the human so the chips render (and the rightmost
      // chip is as far right as it ever gets).
      scene.session.players[0].collection = ['red', 'yellow', 'green', 'blue', 'purple'].map(
        (color, i) => ({ id: 900 + i, type: 'chameleon', color, count: 1 }),
      );
      scene.refreshCollections();

      // The block of player rows (name + chips) is vertically centred on
      // the collections-area centre (tolerance 2px).
      const nameTexts = textObjects(scene).filter(
        (t) => t.text.includes(' — ') && t.text.includes('pts'),
      );
      expect(nameTexts).toHaveLength(count);
      const rowYs = nameTexts.map((n) => n.y);
      const blockTop = Math.min(...rowYs) - CHIP_H / 2;
      const blockBottom = Math.max(...rowYs) + CHIP_H / 2;
      const blockCentre = (blockTop + blockBottom) / 2;
      expect(Math.abs(blockCentre - scene.layout.collectionsCenterY)).toBeLessThanOrEqual(2);

      // Tight name→chip gap: the whitespace between the name's rendered
      // right edge and the first chip's left edge is ~20px (was ~260px).
      // Names are right-anchored to the fixed chip column, so a name's x
      // position IS its right edge.
      const chips = collectionChipRectangles(scene);
      expect(chips.length).toBeGreaterThanOrEqual(5); // the human holds 5 colours
      const firstName = nameTexts[0];
      const firstChip = chips.find((c) => Math.abs(c.y - firstName.y) < 1);
      expect(firstChip).toBeDefined();
      const nameRight = firstName.x;
      const chipLeft = firstChip!.x - CHIP_W / 2;
      const gap = chipLeft - nameRight;
      expect(gap).toBeGreaterThanOrEqual(15);
      expect(gap).toBeLessThanOrEqual(30);

      // Even a full 5-colour collection's rightmost chip stays clear of
      // the tableau's left edge (the tableau was shifted right).
      const maxChipRight = Math.max(...chips.map((c) => c.x + CHIP_W / 2));
      const tableauLeft = scene.layout.rowsCenterX - ROW_TOTAL_WIDTH / 2;
      expect(maxChipRight).toBeLessThan(tableauLeft);

      // The shifted tableau also stays clear of the Last Round resting
      // card (its left edge is the closest neighbour on the right).
      const tableauRight = scene.layout.rowsCenterX + ROW_TOTAL_WIDTH / 2;
      const lastRoundLeft = scene.layout.lastRoundCenterX - CARD_W / 2;
      expect(tableauRight).toBeLessThan(lastRoundLeft);

      // Mode buttons track the block's bottom: below the block and clear
      // of the instruction text.
      const placeButton = findText(scene, 'Place card')!;
      expect(placeButton).toBeDefined();
      expect(placeButton.y - placeButton.height / 2).toBeGreaterThan(blockBottom);
      const instruction = textObjects(scene).find(
        (t) => Math.abs(t.y - scene.layout.instructionY) < 2,
      )!;
      expect(instruction).toBeDefined();
      const instructionTop = instruction.y - instruction.height / 2;
      expect(placeButton.y + placeButton.height / 2).toBeLessThan(instructionTop);
      expect(blockBottom).toBeLessThan(instructionTop);
    },
  );

  it('aligns every hand at a fixed chip column and aligns round-state markers at the max hand length', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('ColorettoScene') as any;
    await waitFrames(10);
    expect(clickText(scene, '3 (2 AI)')).toBe(true);
    // Await the human turn so no AI delayed turn is pending while the test
    // mutates the panel (turn order is randomized at game start).
    await waitForCondition(() => scene.phaseManager?.current === 'human-turn');

    // Deliberately varied name/score widths and chip counts per player:
    // a short name with a low score, an overlong name with the max score,
    // and a mid-length name with a mid score.
    const players = scene.session.players as any[];
    players[0].name = 'You';
    players[0].totalScore = 0;
    players[1].name = 'Alexandrina van der Merwe'; // wider than the name column
    players[1].totalScore = 21;
    players[2].name = 'AI 2';
    players[2].totalScore = 7;

    // Varied chip counts: 1, 5 and 3 colours respectively.
    players[0].collection = [{ id: 100, type: 'chameleon', color: 'red', count: 1 }];
    players[1].collection = ['red', 'yellow', 'green', 'blue', 'purple'].map((color, i) => ({
      id: 200 + i,
      type: 'chameleon',
      color,
      count: 1,
    }));
    players[2].collection = ['red', 'yellow', 'green'].map((color, i) => ({
      id: 300 + i,
      type: 'chameleon',
      color,
      count: 1,
    }));

    // Mark two players as having taken a row so their markers render.
    players[1].roundState = 'taken-row';
    players[2].roundState = 'taken-row';
    scene.refreshCollections();

    // 1) Fixed chip start column: every row's first chip starts at the
    //    same x, regardless of name/score text width or chip count.
    const chips = collectionChipRectangles(scene);
    const nameTexts = textObjects(scene).filter(
      (t) => t.text.includes(' — ') && t.text.includes('pts'),
    );
    expect(nameTexts).toHaveLength(3);
    const expectedChipStart = scene.layout.collectionsTopX + NAME_COLUMN_W;
    for (const nameText of nameTexts) {
      const rowChips = chips.filter((c) => Math.abs(c.y - nameText.y) < 1);
      expect(rowChips.length).toBeGreaterThan(0);
      const firstChipX = Math.min(...rowChips.map((c) => c.x));
      expect(firstChipX).toBe(expectedChipStart);
    }

    // 2) Overlong name/score is truncated (name portion, ellipsis) while
    //    the score stays readable, and the label fits the fixed column.
    const longName = nameTexts.find((n) => n.text.includes('Alexandrina'))!;
    expect(longName).toBeDefined();
    expect(longName.text).toContain('…');
    expect(longName.text).toContain('21 pts');
    expect(longName.width).toBeLessThanOrEqual(NAME_COLUMN_W - NAME_CHIP_GAP);

    // 3) Round-state markers align at the max hand length (COLORS.length
    //    chips), independent of how many chips each player actually holds.
    const markers = textObjects(scene).filter(
      (t) => t.text === '(taken a row)' || t.text === '(done)',
    );
    expect(markers).toHaveLength(2);
    const expectedMarkerX = expectedChipStart + COLORS.length * CHIP_GAP + ROUND_MARKER_GAP;
    for (const marker of markers) {
      expect(marker.x).toBe(expectedMarkerX);
    }

    // 4) The take animation flies cards to the same fixed chip column
    //    (AC 5: animated destination == rendered chip position).
    expect(scene.fixedChipStartX()).toBe(expectedChipStart);
  });
});
