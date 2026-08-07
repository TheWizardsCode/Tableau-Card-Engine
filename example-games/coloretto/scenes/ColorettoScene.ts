/**
 * ColorettoScene -- the main Phaser scene for Coloretto.
 *
 * Renders the shared rows tableau, draw deck, per-player collections,
 * score displays, turn indicators, and round/game-end overlays.
 *
 * Layout positions come from the SLL layout via
 * {@link computeColorettoLayout} (no hardcoded pixel positions).
 *
 * Game flow:
 *   - Start overlay asks for the player count (2-5, i.e. you + 1-4 AI).
 *   - On the human's turn, Place / Take buttons select the action mode,
 *     then clicking a row executes it.
 *   - AI turns run automatically with a short delay.
 *   - When a round ends, the human picks 3 colors to score positively
 *     (or all colors when holding fewer than 3), then the round result
 *     overlay appears. The final overlay shows the winner.
 */

import Phaser from 'phaser';
import type { ColorettoCard, ChameleonColor } from '../ColorettoCards';
import { colorLabel, colorHex, COLORS } from '../ColorettoCards';
import type {
  ColorettoSession,
  ColorettoAction,
  RoundResult,
  ActionResult,
} from '../ColorettoGame';
import {
  setupColorettoGame,
  executeAction,
  validateAction,
  getCurrentPlayerIndex,
  getRoundTurnOrder,
  beginRoundScoring,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../ColorettoGame';
import { ColorettoAiPlayer, HeuristicStrategy } from '../ColorettoAis';
import { ColorettoTranscriptRecorder } from '../GameTranscript';
import {
  colorCounts,
  presentColors,
  pointsForCount,
  selectBestPositiveColors,
  countJokers,
  countBonusCards,
  optimalJokerAssignment,
} from '../ColorettoScoring';
import type { JokerAssignment } from '../ColorettoScoring';
import { autoSaveTranscript, TranscriptStore } from '../../../src/core-engine/transcript';
import {
  markSceneValid,
  markSceneInvalid,
} from '../../../src/core-engine';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  dismissOverlay,
  PhaseManager,
  createSceneTitle,
  createOverlayBackground,
  createOverlayButton,
  shakeIllegalMove,
  moveGameObject,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';
import { computeColorettoLayout } from './ColorettoLayoutAdapter';

// ── Turn phases ────────────────────────────────────────────

export type ColorettoTurnPhase =
  | 'start'
  | 'human-turn'
  | 'ai-thinking'
  | 'animating'
  | 'round-scoring'
  | 'game-over';

// ── Visual constants ───────────────────────────────────────

const CARD_W = 58;
const CARD_H = 78;
const ROW_STEP_MAX = 92;
const ROW_CARD_GAP = 10;
const DECK_W = 58;
const DECK_H = 78;
const CHIP_W = 44;
const CHIP_H = 28;
const CHIP_GAP = 52;
const COLLECTION_STEP = 40;
/** Vertical step between collection rows for 4-player games (the centred block is tall there). */
const COLLECTION_STEP_4P = 36;
/** Vertical step between collection rows for 5-player games (the centred block is tallest there). */
const COLLECTION_STEP_5P = 30;
/** Tight horizontal gap between a player's name text and their first colour chip. */
const NAME_CHIP_GAP = 40;
/**
 * Fixed width of the name+score column. Every player's chips start at
 * `collectionsTopX + NAME_COLUMN_W` regardless of how wide their rendered
 * name+score text is, so all hands line up in a single column (see
 * {@link ColorettoScene.fixedChipStartX}). Sized with headroom for the
 * longest realistic name + "21 pts" score (and any future turn-order
 * prefix); overlong labels are truncated rather than widening the column.
 */
const NAME_COLUMN_W = 210;
/** Gap between the last colour chip and the round-state marker (after the chips). */
const ROUND_MARKER_GAP = 8;
/**
 * Number of non-color collection chip types rendered after the color
 * chips (a joker chip and a “+2” bonus chip). The round-state marker
 * aligns at the maximum possible hand length: every color chip plus
 * these two extra chip types.
 */
const EXTRA_CHIP_TYPES = 2;
/**
 * Mode-button offset below the collections block: half the button height
 * (~18px) plus an 8px breathing gap, so the buttons stay clear of both the
 * block and the instruction text for every player count.
 */
const MODE_BUTTON_OFFSET = 26;
/** Total width of the three row card slots (used for slot X and click zones). */
const ROW_TOTAL_WIDTH = 3 * CARD_W + 2 * ROW_CARD_GAP;
/** Duration of a single take flyer tween. */
const TAKE_ANIM_DURATION = 450;
/** Delay between consecutive take flyers (staggered departure). */
const TAKE_ANIM_STAGGER = 90;

/** Duration of the deck → destination movement in the place animation (ms). */
const PLACE_MOVE_DURATION = 450;
/** Duration of the face-up reveal flip in the place animation (ms). */
const FLIP_DURATION = 350;

const SFX_KEYS = {
  PLACE: 'place',
  TAKE: 'take',
  ROUND: 'round',
  SCORE: 'score',
  UI: 'ui',
} as const;

export class ColorettoScene extends CardGameScene {
  // Game state
  session!: ColorettoSession;
  aiPlayers: (ColorettoAiPlayer | null)[] = [];
  phaseManager!: PhaseManager<ColorettoTurnPhase>;
  recorder: ColorettoTranscriptRecorder | null = null;
  private transcriptStore = new TranscriptStore();

  /** Current human action mode (Place draws the deck card, Take collects a row). */
  actionMode: 'place' | 'take' = 'place';

  // Display containers
  rowsContainer!: Phaser.GameObjects.Container;
  collectionsContainer!: Phaser.GameObjects.Container;
  deckContainer!: Phaser.GameObjects.Container;
  /** Holds the Last Round card resting marker between the tableau and deck. */
  lastRoundContainer!: Phaser.GameObjects.Container;

  /** In-flight card visual during the place animation (null when idle). */
  flightCard: Phaser.GameObjects.Container | null = null;

  // UI text
  roundText!: Phaser.GameObjects.Text;
  turnText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;
  deckCountText!: Phaser.GameObjects.Text;

  // Mode buttons
  placeButton: Phaser.GameObjects.Text | null = null;
  takeButton: Phaser.GameObjects.Text | null = null;

  // Row click zones
  private rowZones: Phaser.GameObjects.Rectangle[] = [];

  // Overlay state
  overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private layout = computeColorettoLayout();

  get reducedMotion(): boolean {
    return this.settingsPanel?.reducedMotion ?? false;
  }

  constructor() {
    super({ key: 'ColorettoScene' });
  }

  // ── Preload ──────────────────────────────────────────────

  preload(): void {
    const ns = 'coloretto';
    this.load.audio(`${ns}:${SFX_KEYS.PLACE}`, this.audioPaths('card-draw.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.TAKE}`, this.audioPaths('card-swap.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.ROUND}`, this.audioPaths('round-end.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.SCORE}`, this.audioPaths('score-reveal.wav'));
    this.load.audio(`${ns}:${SFX_KEYS.UI}`, this.audioPaths('ui-click.wav'));
  }

  /** Audio load paths with fallback to the shared default directory. */
  private audioPaths(filename: string): string[] {
    return [
      `assets/audio/coloretto/${filename}`,
      `assets/audio/default/${filename}`,
    ];
  }

  // ── Create ───────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#15242b');
    markSceneValid(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      markSceneInvalid(this);
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      markSceneInvalid(this);
    });

    this.phaseManager = new PhaseManager<ColorettoTurnPhase>({
      initialPhase: 'start',
      phaseTextMap: {
        start: '',
        'human-turn': 'Your turn: choose Place or Take, then click a row',
        'ai-thinking': 'AI is thinking...',
        animating: '',
        'round-scoring': '',
        'game-over': '',
      },
      onPhaseChange: (phase) => {
        if (phase === 'human-turn') {
          this.phaseManager.setPhaseText(
            'human-turn',
            this.actionMode === 'place'
              ? 'PLACE: click a row to add the top deck card'
              : 'TAKE: click a non-empty row to collect it',
          );
        }
        this.refreshModeButtons();
      },
    });

    this.overlayObjects = [];
    this.recorder = null;
    this.aiPlayers = [];
    this.actionMode = 'place';

    super.create();

    if (this.replayMode) {
      // Replay mode is not supported for Coloretto (no replay adapter);
      // render a minimal static board so screenshot tooling does not crash.
      this.createHeader();
      this.createLabels();
      this.createContainers();
      this.roundText.setText('Round 1');
      this.instructionText.setText('Coloretto');
      return;
    }

    const mapping: EventSoundMapping = {
      'card:placed': SFX_KEYS.PLACE,
      'card-swapped': SFX_KEYS.TAKE,
      'game-ended': SFX_KEYS.SCORE,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping, { namespace: 'coloretto' });

    this.createHeader();
    this.createLabels();
    this.createContainers();
    this.initHelpPanel(helpContent as HelpSection[]);
    this.initSettingsPanel();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.phaseManager.current === 'human-turn') {
        this.actionMode = this.actionMode === 'place' ? 'take' : 'place';
        this.refreshModeButtons();
        this.phaseManager.set('human-turn');
      }
    });

    this.showStartOverlay();
  }

  // ── UI creation ──────────────────────────────────────────

  private createHeader(): void {
    createSceneTitle(this, 'Coloretto');
    this.roundText = this.add
      .text(GAME_W / 2, this.layout.roundY, '', {
        fontSize: '18px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.turnText = this.add
      .text(GAME_W / 2, this.layout.turnY, '', {
        fontSize: '15px',
        color: '#aaddbb',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.instructionText = this.add
      .text(GAME_W / 2, this.layout.instructionY, '', {
        fontSize: '15px',
        color: '#88ccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createLabels(): void {
    // Deck label
    this.add
      .text(this.layout.deckCenterX, this.layout.deckLabelY, 'Deck', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createContainers(): void {
    this.rowsContainer = this.add.container(0, 0);
    this.collectionsContainer = this.add.container(0, 0);
    this.deckContainer = this.add.container(0, 0);
    this.lastRoundContainer = this.add.container(0, 0);
  }

  // ── Start overlay ────────────────────────────────────────

  private showStartOverlay(): void {
    this.phaseManager.set('start');
    const { objects } = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.7 },
      { width: 460, height: 300, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const title = this.add
      .text(centerX, boxY - 105, 'Coloretto', {
        fontSize: '34px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(title);
    this.overlayObjects.push(title);

    const subtitle = this.add
      .text(centerX, boxY - 62, 'How many players?', {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(subtitle);
    this.overlayObjects.push(subtitle);

    const counts = [2, 3, 4, 5];
    const btnWidth = 130;
    const startX = centerX - ((counts.length - 1) * btnWidth) / 2;
    counts.forEach((count, i) => {
      const label = `${count} (${count - 1} AI)`;
      const btn = createOverlayButton(this, startX + i * btnWidth, boxY + 20, label, 201, {
        fontSize: '16px',
      });
      if (this.hudContainer) this.hudContainer.add(btn);
      this.overlayObjects.push(btn);
      btn.on('pointerdown', () => {
        this.soundManager?.play(SFX_KEYS.UI);
        this.startGame(count);
      });
    });
  }

  private startGame(playerCount: number): void {
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];

    const playerNames = ['You', ...Array.from({ length: playerCount - 1 }, (_, i) => `AI ${i + 1}`)];
    const isAI = [false, ...Array.from({ length: playerCount - 1 }, () => true)];

    this.session = setupColorettoGame({ playerCount, playerNames, isAI });
    this.aiPlayers = sessionToAiPlayers(this.session);
    this.recorder = new ColorettoTranscriptRecorder(this.session);

    this.refreshAll();
    this.phaseManager.setPhaseText('human-turn', 'Your turn: choose Place or Take, then click a row');
    this.runTurn();
  }

  // ── Refresh ──────────────────────────────────────────────

  private refreshAll(): void {
    this.refreshRows();
    this.refreshDeck();
    this.refreshCollections();
    this.refreshRoundInfo();
    this.refreshLastRoundCard();
    this.refreshModeButtons();
  }

  private refreshRoundInfo(): void {
    const round = this.session.currentRound + 1;
    this.roundText.setText(`Round ${round} of ${this.session.totalRounds}`);
    const current = getCurrentPlayerIndex(this.session);
    const lastRound = this.session.lastRoundTriggered ? ' — LAST ROUND!' : '';
    if (current >= 0) {
      const player = this.session.players[current];
      this.turnText.setText(`${player.name}'s turn${lastRound}`);
    } else {
      this.turnText.setText(`Round over${lastRound}`);
    }
  }

  // ── Row rendering ────────────────────────────────────────

  private refreshRows(): void {
    this.rowsContainer.removeAll(true);
    this.rowZones = [];

    const rowCount = this.session.rows.length;

    for (let i = 0; i < rowCount; i++) {
      const row = this.session.rows[i];
      const rowY = this.rowCenterY(i);

      // Cards
      const cardSlots = 3;
      for (let slot = 0; slot < cardSlots; slot++) {
        const cardX = this.rowSlotX(slot);
        const card = row.cards[slot];
        if (card && card.type !== 'last-round') {
          this.rowsContainer.add(this.createCard(cardX, rowY, card));
        } else {
          // Empty slot outline. The Last Round card is omitted from its
          // logical slot (visual-only, option A) and rendered at the resting
          // position by refreshLastRoundCard().
          this.rowsContainer.add(
            this.add
              .rectangle(cardX, rowY, CARD_W, CARD_H, 0x22343c)
              .setStrokeStyle(1, 0x3a5560),
          );
        }
      }

      // Click zone (whole row)
      const zone = this.add
        .rectangle(
          this.layout.rowsCenterX,
          rowY,
          ROW_TOTAL_WIDTH + 30,
          CARD_H + 12,
          0xffffff,
          0.001,
        )
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.onRowClick(i));
      if (this.hudContainer) {
        this.hudContainer.add(zone);
      }
      this.rowZones.push(zone);
    }
  }

  // ── Layout helpers (shared by rendering and take animation) ──

  /** Y of a row's center, derived from the SLL rows area and row-count step. */
  private rowCenterY(rowIndex: number): number {
    const rowCount = this.session.rows.length;
    const step = Math.min(ROW_STEP_MAX, Math.floor(360 / rowCount));
    return this.layout.rowsCenterY - ((rowCount - 1) * step) / 2 + rowIndex * step;
  }

  /** X of a card slot within a row (0-based slot index). */
  private rowSlotX(slotIndex: number): number {
    return this.layout.rowsCenterX - ROW_TOTAL_WIDTH / 2 + slotIndex * (CARD_W + ROW_CARD_GAP);
  }

  /**
   * Vertical step between collection rows: slightly tighter at 4- and
   * 5-player counts so the centred block clears the tableau rows and the
   * mode buttons / instruction text.
   */
  private collectionStep(): number {
    const n = this.session.players.length;
    if (n >= 5) return COLLECTION_STEP_5P;
    if (n >= 4) return COLLECTION_STEP_4P;
    return COLLECTION_STEP;
  }

  /** Height of the whole collections block (all player name rows + chips). */
  private collectionBlockHeight(): number {
    return (this.session.players.length - 1) * this.collectionStep() + CHIP_H;
  }

  /**
   * Top Y of the collections block, vertically centred on the SLL
   * collectionsArea centre anchor (collectionsCenterY).
   */
  private collectionBlockTopY(): number {
    return this.layout.collectionsCenterY - this.collectionBlockHeight() / 2;
  }

  /** Bottom Y of the collections block (below the last player's chips). */
  private collectionBlockBottomY(): number {
    return this.collectionBlockTopY() + this.collectionBlockHeight();
  }

  /**
   * X of the first collection chip, shared by every player row. A fixed
   * column: the name+score text occupies [collectionsTopX, fixedChipStartX -
   * NAME_CHIP_GAP] (right-aligned, truncated if overlong) so chips never
   * shift with name/score width. The take animation flies cards to this
   * same x, keeping animated destinations identical to the rendered chips.
   */
  private fixedChipStartX(): number {
    return this.layout.collectionsTopX + NAME_COLUMN_W;
  }

  /** Y of a collection row, derived from the SLL collections area (matches refreshCollections).
   *
   * `row` is the DISPLAY row (0..n-1) -- the collections panel renders
   * players in the current round's play order, not array order -- so
   * callers must map a player index through {@link displayRowForPlayer}.
   * The row lines are centred on collectionsCenterY so the chips (which
   * extend CHIP_H/2 above and below each row) keep the whole block's
   * visual centre exactly on the collections-area centre.
   */
  private collectionRowY(row: number): number {
    const n = this.session.players.length;
    return (
      this.layout.collectionsCenterY -
      ((n - 1) * this.collectionStep()) / 2 +
      row * this.collectionStep()
    );
  }

  /**
   * Display row (0..n-1) for a player index: the collections panel renders
   * rows in the current round's play order (rotation of the randomized
   * turn order from the round's start player), so the take animation maps
   * player indices through this to land flyers on the correct row.
   */
  private displayRowForPlayer(playerIndex: number): number {
    return getRoundTurnOrder(this.session).indexOf(playerIndex);
  }

  private createCard(x: number, y: number, card: ColorettoCard): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    container.add(this.createCardFace(card));
    return container;
  }

  /** Build the display objects for a card face (card-local coordinates). */
  private createCardFace(card: ColorettoCard): Phaser.GameObjects.GameObject[] {
    if (card.type === 'last-round') {
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x555555);
      bg.setStrokeStyle(2, 0xcccccc);
      const text = this.add
        .text(0, 0, 'LR', {
          fontSize: '22px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      return [bg, text];
    }

    if (card.type === 'joker') {
      // Wild chameleon: purple face with a star; declared to a color at
      // scoring time (counts as 1 card of that color).
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x2e2a55);
      bg.setStrokeStyle(2, 0xbb88ff);
      const star = this.add
        .text(0, -8, '★', {
          fontSize: '28px',
          color: '#e8c1ff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      const name = this.add
        .text(0, 22, 'Joker', {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      return [bg, star, name];
    }

    if (card.type === 'bonus') {
      // Flat “+2” bonus point card, independent of color scoring.
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x3d3a22);
      bg.setStrokeStyle(2, 0xffdd66);
      const plus = this.add
        .text(0, -8, '+2', {
          fontSize: '26px',
          color: '#ffdd66',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const name = this.add
        .text(0, 22, 'Bonus', {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      return [bg, plus, name];
    }

    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1b2a33);
    bg.setStrokeStyle(1, 0x4a6a7a);
    const colorRect = this.add.rectangle(0, -8, CARD_W - 8, CARD_H - 24, Phaser.Display.Color.HexStringToColor(colorHex(card.color)).color);
    const countText = this.add
      .text(0, 14, `${card.count}×`, {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const nameText = this.add
      .text(0, 32, colorLabel(card.color), {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    return [bg, colorRect, countText, nameText];
  }

  // ── Deck rendering ───────────────────────────────────────

  private refreshDeck(): void {
    this.deckContainer.removeAll(true);

    if (this.session.deck.length > 0) {
      const back = this.add.rectangle(this.layout.deckCenterX, this.layout.deckCenterY, DECK_W, DECK_H, 0x2c3e50);
      back.setStrokeStyle(2, 0x7f8c9d);
      this.deckContainer.add(back);
      const mark = this.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY, '?', {
          fontSize: '30px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(mark);
      this.deckCountText = this.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY + DECK_H / 2 + 14, `${this.session.deck.length} cards`, {
          fontSize: '14px',
          color: '#aacccc',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(this.deckCountText);
    } else {
      this.deckCountText = this.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY, 'Deck empty', {
          fontSize: '14px',
          color: '#888888',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(this.deckCountText);
    }
  }

  /**
   * Render the Last Round card at its resting position between the tableau
   * and the deck (omitted from its logical row slot by refreshRows()).
   */
  private refreshLastRoundCard(): void {
    this.lastRoundContainer.removeAll(true);
    if (this.session.phase !== 'playing' || !this.session.lastRoundTriggered) return;
    for (const row of this.session.rows) {
      const lr = row.cards.find((c) => c.type === 'last-round');
      if (lr) {
        // createCard() positions the card's top-left at the given point, so
        // offset by half the card size to centre on the resting anchor.
        this.lastRoundContainer.add(
          this.createCard(
            this.layout.lastRoundCenterX - CARD_W / 2,
            this.layout.lastRoundCenterY - CARD_H / 2,
            lr,
          ),
        );
        return;
      }
    }
  }

  // ── Collections rendering ────────────────────────────────

  private refreshCollections(): void {
    this.collectionsContainer.removeAll(true);

    const currentIdx = getCurrentPlayerIndex(this.session);
    // Render the player list top-to-bottom in the current round's play
    // order (turn order rotated from the round's start player) so the
    // player can see at a glance who plays when.
    const order = getRoundTurnOrder(this.session);

    // Every player row shares one fixed chip-start column. The name+score
    // text is right-aligned into the fixed column ahead of it (and
    // truncated when overlong) so hands never shift with name/score width.
    const chipStartX = this.fixedChipStartX();
    const nameColumnW = NAME_COLUMN_W - NAME_CHIP_GAP;

    order.forEach((playerIndex, row) => {
      const player = this.session.players[playerIndex];
      const y = this.collectionRowY(row);
      const isCurrent = playerIndex === currentIdx && this.session.phase === 'playing';
      const isHuman = playerIndex === 0;

      // Name + score, right-anchored NAME_CHIP_GAP before the fixed chip
      // column, so its right edge is always the same distance from the
      // chips and every hand starts at the same x.
      const nameColor = isCurrent ? '#ffdd66' : isHuman ? '#ffffff' : '#b8d8c8';
      const label = `${player.name} — ${player.totalScore} pts`;
      const name = this.add
        .text(chipStartX - NAME_CHIP_GAP, y, label, {
          fontSize: '16px',
          color: nameColor,
          fontFamily: FONT_FAMILY,
          fontStyle: isCurrent ? 'bold' : 'normal',
        })
        .setOrigin(1, 0.5);
      this.collectionsContainer.add(name);
      // Truncate overlong labels (name portion first, score kept readable)
      // so the right-anchored text never overshoots the fixed column.
      if (name.width > nameColumnW) {
        name.setText(this.fitNameScoreLabel(label, nameColumnW, name));
      }

      const counts = colorCounts(player.collection);
      let chipX = chipStartX;
      for (const color of presentColors(counts)) {
        const chip = this.add.rectangle(chipX, y, CHIP_W, CHIP_H, Phaser.Display.Color.HexStringToColor(colorHex(color)).color);
        this.collectionsContainer.add(chip);
        // Count (top) + colour name (bottom): the name satisfies the
        // 'showing chameleon count and color name' requirement.
        const label = this.add
          .text(chipX, y - 6, `${counts[color]}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        const nameLabel = this.add
          .text(chipX, y + 10, colorLabel(color), {
            fontSize: '9px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      // Joker chip: wild chameleons held (declared to colors at scoring).
      const jokers = countJokers(player.collection);
      if (jokers > 0) {
        const chip = this.add.rectangle(chipX, y, CHIP_W, CHIP_H, 0x2e2a55);
        chip.setStrokeStyle(2, 0xbb88ff);
        this.collectionsContainer.add(chip);
        const label = this.add
          .text(chipX, y - 6, `${jokers}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        const nameLabel = this.add
          .text(chipX, y + 10, 'Joker', {
            fontSize: '9px',
            color: '#e8c1ff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      // “+2” bonus chip: flat bonus point cards held.
      const bonus = countBonusCards(player.collection);
      if (bonus > 0) {
        const chip = this.add.rectangle(chipX, y, CHIP_W, CHIP_H, 0x3d3a22);
        chip.setStrokeStyle(2, 0xffdd66);
        this.collectionsContainer.add(chip);
        const label = this.add
          .text(chipX, y - 6, `${bonus}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        const nameLabel = this.add
          .text(chipX, y + 10, '+2', {
            fontSize: '9px',
            color: '#ffdd66',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      // Round-state marker aligned at the maximum possible hand length
      // (all deck colours, COLORS.length) so markers line up across
      // players regardless of how many chips each player holds.
      if (player.roundState === 'taken-row' || player.roundState === 'final-turn-done') {
        const markerText = player.roundState === 'taken-row' ? '(taken a row)' : '(done)';
        const markerX = chipStartX + (COLORS.length + EXTRA_CHIP_TYPES) * CHIP_GAP + ROUND_MARKER_GAP;
        const done = this.add
          .text(markerX, y, markerText, {
            fontSize: '12px',
            color: '#77998a',
            fontFamily: FONT_FAMILY,
          })
          .setOrigin(0, 0.5);
        this.collectionsContainer.add(done);
      }
    });
  }

  /**
   * Shorten an overlong name+score label so it fits the fixed name column:
   * the score ("21 pts") stays fully readable and the name portion is cut
   * with an ellipsis. Mutates the given text object (which is right-anchored
   * with origin x = 1, so its right edge stays put as the label shrinks).
   * Called only when the full label already exceeds the column width.
   */
  private fitNameScoreLabel(
    label: string,
    maxWidth: number,
    text: Phaser.GameObjects.Text,
  ): string {
    const sep = ' — ';
    const sepIndex = label.lastIndexOf(sep);
    if (sepIndex === -1) return label;
    const scorePart = label.slice(sepIndex); // " — 21 pts"
    const namePart = label.slice(0, sepIndex);
    for (let len = namePart.length; len > 0; len--) {
      const candidate = `${namePart.slice(0, len)}…${scorePart}`;
      text.setText(candidate);
      if (text.width <= maxWidth) return candidate;
    }
    // Even the shortest name+ellipsis overflows; keep only the score.
    text.setText(scorePart);
    return scorePart;
  }

  // ── Mode buttons ─────────────────────────────────────────

  private refreshModeButtons(): void {
    this.destroyModeButtons();
    if (this.phaseManager.current !== 'human-turn') return;

    // Track the block's bottom so the buttons stay clear of both the
    // collections block and the instruction text for every player count.
    const y = this.collectionBlockBottomY() + MODE_BUTTON_OFFSET;
    const placeX = GAME_W / 2 - 90;
    const takeX = GAME_W / 2 + 90;

    this.placeButton = createModeButton(this, placeX, y, 'Place card', this.actionMode === 'place', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      this.actionMode = 'place';
      this.refreshModeButtons();
      this.phaseManager.set('human-turn');
    });
    this.takeButton = createModeButton(this, takeX, y, 'Take a row', this.actionMode === 'take', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      this.actionMode = 'take';
      this.refreshModeButtons();
      this.phaseManager.set('human-turn');
    });
  }

  private destroyModeButtons(): void {
    if (this.placeButton) {
      this.placeButton.destroy();
      this.placeButton = null;
    }
    if (this.takeButton) {
      this.takeButton.destroy();
      this.takeButton = null;
    }
  }

  // ── Human input ──────────────────────────────────────────

  private onRowClick(rowIndex: number): void {
    if (this.phaseManager.current !== 'human-turn') return;
    if (getCurrentPlayerIndex(this.session) !== 0) return;

    const action: ColorettoAction =
      this.actionMode === 'take'
        ? { type: 'take', rowIndex }
        : { type: 'place', rowIndex };

    const validation = validateAction(this.session, 0, action);
    if (!validation.legal) {
      this.instructionText.setText(validation.reason);
      const zone = this.rowZones[rowIndex];
      if (zone) {
        shakeIllegalMove({
          scene: this,
          target: zone as unknown as Phaser.GameObjects.Image,
          duration: 200,
        });
      }
      this.soundManager?.play(SFX_KEYS.ROUND); // reuse a subtle feedback sound
      return;
    }

    this.soundManager?.play(this.actionMode === 'take' ? SFX_KEYS.TAKE : SFX_KEYS.PLACE);
    this.executeTurn(0, action);
  }

  // ── Turn execution ───────────────────────────────────────

  private runTurn(): void {
    if (isGameOver(this.session)) return;
    const playerIndex = getCurrentPlayerIndex(this.session);
    if (playerIndex < 0) {
      this.handleRoundOver();
      return;
    }
    this.refreshAll();
    this.refreshRoundInfo();

    const player = this.session.players[playerIndex];
    if (player.isAI) {
      this.phaseManager.set('ai-thinking');
      const delay = this.reducedMotion ? 150 : 750;
      this.time.delayedCall(delay, () => {
        const ai = this.aiPlayers[playerIndex];
        if (!ai) return;
        const action = ai.chooseAction(this.session, playerIndex);
        this.executeTurn(playerIndex, action);
      });
    } else {
      this.actionMode = 'place';
      this.phaseManager.set('human-turn');
    }
  }

  private executeTurn(playerIndex: number, action: ColorettoAction): void {
    if (this.session.phase !== 'playing') return;

    // Snapshot the taken row cards before the action moves them into the
    // player's collection -- the take animation replays them as flyers
    // from their captured row-slot positions.
    const takenCards =
      action.type === 'take' ? [...this.session.rows[action.rowIndex].cards] : [];

    const result = executeAction(this.session, playerIndex, action);
    this.recorder?.recordTurn(playerIndex, action, result.drawnCard);

    if (action.type === 'place') {
      this.gameEvents.emit('card:placed', {
        cardId: String(result.drawnCard?.id ?? -1),
        playerIndex,
        action: 'place',
      });
      // Animated placement (move-then-flip, or Last Round flip-on-deck then
      // settle). The turn flow resumes when the animation completes.
      this.animatePlace(action, result);
    } else {
      this.gameEvents.emit('card-swapped', {
        position: action.rowIndex,
        drawnFrom: 'stock',
        playerIndex,
      });

      // Session state is already updated (row → collection, pure TS); the
      // animation is a visual overlay replaying the captured start positions.
      // The turn flow advances only after every card reaches the collection.
      this.playTakeAnimation(playerIndex, action.rowIndex, takenCards, () => {
        this.refreshAll();
        if (result.roundOver) {
          this.handleRoundOver();
        } else {
          this.runTurn();
        }
      });
    }
  }

  // ── Take animation ──────────────────────────────────────

  /**
   * Animate the cards of a taken row flying from their row slots to the
   * collecting player's collection area (staggered departure).
   *
   * The session state is already updated by {@link executeAction} -- this is
   * a visual overlay replaying captured start positions. The turn flow
   * (via onComplete) advances only after every card has landed, and the
   * 'animating' phase blocks input while the cards are flying. In
   * reduced-motion mode the transfer is applied instantly without
   * animation. Works identically for human and AI take actions because
   * both reach this through {@link executeTurn}.
   */
  private playTakeAnimation(
    playerIndex: number,
    rowIndex: number,
    takenCards: readonly ColorettoCard[],
    onComplete: () => void,
  ): void {
    if (this.reducedMotion || takenCards.length === 0) {
      onComplete();
      return;
    }

    // Block input and turn flow while the cards are flying.
    this.phaseManager.set('animating');

    const destStartX = this.fixedChipStartX();
    // The collections panel renders in round play order, so the flyers
    // must target the player's DISPLAY row (not their array index).
    const destY = this.collectionRowY(this.displayRowForPlayer(playerIndex));

    // Face-up card sprites: the row cards are always face-up, so the
    // flyers reuse the card-face rendering (chameleon / Last Round).
    const flyers = takenCards.map((card, i) =>
      this.createCard(this.rowSlotX(i), this.rowCenterY(rowIndex), card).setDepth(100),
    );

    // The row has already been emptied in the session; re-render it so the
    // taken cards visually leave the tableau as the flyers depart.
    this.refreshRows();

    let landed = 0;
    flyers.forEach((flyer, i) => {
      this.time.delayedCall(i * TAKE_ANIM_STAGGER, () => {
        moveGameObject({
          scene: this,
          target: flyer,
          destX: destStartX + i * CHIP_GAP,
          destY,
          duration: TAKE_ANIM_DURATION,
          ease: 'Quad.easeInOut',
          onComplete: () => {
            landed += 1;
            if (landed === flyers.length) {
              for (const f of flyers) f.destroy();
              onComplete();
            }
          },
        });
      });
    });
  }

  // ── Place animation ──────────────────────────────────────

  /**
   * Animate a place action: an in-flight card visual slides from the deck to
   * the destination and flips face-up. The Last Round card flips face-up ON
   * the deck first, then settles at the resting position between the tableau
   * and the deck.
   *
   * The turn flow (refreshAll + runTurn / handleRoundOver) is deferred until
   * the animation completes, and the board is gated behind the 'animating'
   * phase so input is blocked while the card is in flight.
   */
  private animatePlace(action: ColorettoAction, result: ActionResult): void {
    const drawnCard = result.drawnCard;

    const finish = () => {
      this.refreshAll();
      if (result.roundOver) {
        this.handleRoundOver();
      } else {
        this.runTurn();
      }
    };

    if (this.reducedMotion || !drawnCard) {
      // Reduced motion (or defensive fallback when no card was drawn):
      // apply the placement instantly.
      finish();
      return;
    }

    this.phaseManager.set('animating');

    const flight = this.createFlightCard();
    flight.setPosition(this.layout.deckCenterX, this.layout.deckCenterY);
    this.flightCard = flight;

    // The card face is NOT built here: createCardFace() adds its objects to
    // the scene display list at world (0,0), so building it during the
    // flight would flash a stray card in the top-left corner for the whole
    // move phase. Instead a factory is passed to flipContainer, which
    // builds the face during the swap step -- the same tick it is added to
    // the flight's inner container -- so it never renders at (0,0).
    if (drawnCard.type === 'last-round') {
      // Last Round card: flip face-up ON the deck, then settle at the
      // resting position between the tableau and the deck.
      this.flipContainer(flight, () => this.createCardFace(drawnCard), () => {
        moveGameObject({
          scene: this,
          target: flight,
          destX: this.layout.lastRoundCenterX,
          destY: this.layout.lastRoundCenterY,
          duration: PLACE_MOVE_DURATION,
          onComplete: () => {
            flight.destroy();
            this.flightCard = null;
            finish();
          },
        });
      });
      return;
    }

    // Normal place: move to the destination row slot, then flip face-up.
    const slotIndex = this.session.rows[action.rowIndex].cards.length - 1;
    moveGameObject({
      scene: this,
      target: flight,
      destX: this.rowSlotX(slotIndex) + CARD_W / 2,
      destY: this.rowCenterY(action.rowIndex) + CARD_H / 2,
      duration: PLACE_MOVE_DURATION,
      onComplete: () => {
        this.flipContainer(flight, () => this.createCardFace(drawnCard), () => {
          flight.destroy();
          this.flightCard = null;
          finish();
        });
      },
    });
  }

  /**
   * Create the in-flight card visual used by the place animation: an outer
   * container centred on the deck position holding a card-back face inside
   * an inner container offset by (-CARD_W/2, -CARD_H/2) so that scaling the
   * outer container flips around the card centre.
   */
  private createFlightCard(): Phaser.GameObjects.Container {
    const flight = this.add.container(0, 0);
    flight.setDepth(50);

    const inner = this.add.container(-CARD_W / 2, -CARD_H / 2);
    flight.add(inner);

    const backBg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x2c3e50);
    backBg.setStrokeStyle(2, 0x7f8c9d);
    inner.add(backBg);

    const mark = this.add
      .text(0, 0, '?', {
        fontSize: '30px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
    inner.add(mark);

    return flight;
  }

  /**
   * Container-compatible two-phase flip (scaleX → 0, swap face, scaleX → 1).
   * Coloretto cards are Containers of rectangles + text rather than texture
   * sprites, so the shared flipCard() helper (Image/Sprite only) cannot be
   * used directly.
   *
   * The face is supplied as a factory invoked during the swap step (while
   * the flight is scaled to zero width): createCardFace() builds its objects
   * at world (0,0), so building them here -- in the same tick they are
   * added to the flight's inner container -- guarantees the face is never
   * rendered at the top-left corner (the card is only ever visible at the
   * flight's position).
   */
  private flipContainer(
    flight: Phaser.GameObjects.Container,
    createFace: () => Phaser.GameObjects.GameObject[],
    onComplete?: () => void,
  ): void {
    const inner = flight.getAt(0) as Phaser.GameObjects.Container;
    const half = FLIP_DURATION / 2;
    this.tweens.add({
      targets: flight,
      scaleX: 0,
      duration: half,
      ease: 'Power2',
      onComplete: () => {
        inner.removeAll(true);
        inner.add(createFace());
        this.tweens.add({
          targets: flight,
          scaleX: 1,
          duration: half,
          ease: 'Power2',
          onComplete: () => onComplete?.(),
        });
      },
    });
  }

  // ── Round scoring ────────────────────────────────────────

  private handleRoundOver(): void {
    this.phaseManager.set('round-scoring');
    beginRoundScoring(this.session);

    const humanCollection = this.session.players[0].collection;
    const present = presentColors(colorCounts(humanCollection));

    // Show the picker whenever the human must choose 3 positives (3+
    // colors) OR holds jokers (which are declared per-joker at scoring).
    if (present.length >= 3 || countJokers(humanCollection) > 0) {
      this.showColorPickerOverlay();
    } else {
      // Fewer than 3 colors and no jokers: all score positively
      // (auto-confirm).
      this.completeRoundScoring([]);
    }
  }

  private showColorPickerOverlay(): void {
    const human = this.session.players[0];
    const jokerCount = countJokers(human.collection);
    const hasJokers = jokerCount > 0;
    // With jokers the overlay grows a declaration row (taller box).
    const boxH = hasJokers ? 460 : 380;

    // Initial state: the joint optimum -- positives and joker declarations
    // that together maximize the human's round score. Both can be adjusted.
    const selected = new Set<ChameleonColor>(selectBestPositiveColors(human.collection));
    const jokerAssignment: ChameleonColor[] = [...optimalJokerAssignment(human.collection)];

    const { objects } = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.7 },
      { width: 620, height: boxH, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;
    const titleY = boxY - (hasJokers ? 190 : 150);
    const subtitleY = boxY - (hasJokers ? 158 : 118);
    const chipY = boxY - (hasJokers ? 55 : 30);
    const confirmY = boxY + (hasJokers ? 165 : 120);

    const title = this.add
      .text(centerX, titleY, 'Choose 3 colors to score POSITIVELY', {
        fontSize: '20px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(title);
    this.overlayObjects.push(title);

    const subtitle = this.add
      .text(centerX, subtitleY, 'All other colors score negatively', {
        fontSize: '14px',
        color: '#aacccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(subtitle);
    this.overlayObjects.push(subtitle);

    if (hasJokers) {
      const jokerHint = this.add
        .text(centerX, boxY + 35, 'Click a joker to change its color', {
          fontSize: '14px',
          color: '#e8c1ff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setDepth(201);
      if (this.hudContainer) this.hudContainer.add(jokerHint);
      this.overlayObjects.push(jokerHint);
    }

    const chips: { color: ChameleonColor; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const jokerChips: { index: number; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const chipStartX = centerX - 260;
    const jokerChipY = boxY + 68;

    const destroyChip = (objects: Phaser.GameObjects.GameObject[]): void => {
      for (const obj of objects) obj.destroy();
    };

    const drawChips = (): void => {
      // Rebuild the color chips from the current selection and joker
      // declaration (counts include declared jokers).
      for (const entry of chips) destroyChip(entry.objects);
      chips.length = 0;
      for (const entry of jokerChips) destroyChip(entry.objects);
      jokerChips.length = 0;

      const counts = colorCounts(human.collection, jokerAssignment);
      const present = presentColors(counts);

      present.forEach((color, i) => {
        const x = chipStartX + i * 80;
        const isSelected = selected.has(color);
        const pts = pointsForCount(counts[color]);
        const objects: Phaser.GameObjects.GameObject[] = [];

        const bg = this.add.rectangle(x, chipY, 70, 64, Phaser.Display.Color.HexStringToColor(colorHex(color)).color)
          .setStrokeStyle(isSelected ? 4 : 1, isSelected ? 0xffdd66 : 0x445566)
          .setDepth(201)
          .setInteractive({ useHandCursor: true });
        if (this.hudContainer) this.hudContainer.add(bg);
        objects.push(bg);

        const countLabel = this.add
          .text(x, chipY - 12, `${counts[color]} cards`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(201);
        if (this.hudContainer) this.hudContainer.add(countLabel);
        objects.push(countLabel);

        const ptsLabel = this.add
          .text(x, chipY + 8, `${isSelected ? '+' : '−'}${pts}`, {
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(201);
        if (this.hudContainer) this.hudContainer.add(ptsLabel);
        objects.push(ptsLabel);

        chips.push({ color, objects });

        bg.on('pointerdown', () => {
          this.soundManager?.play(SFX_KEYS.UI);
          if (selected.has(color)) {
            if (selected.size > 1) selected.delete(color);
          } else if (selected.size < 3) {
            selected.add(color);
          } else {
            this.instructionText.setText('You may only pick 3 positive colors');
            return;
          }
          drawChips();
        });
      });

      // Per-joker declaration chips: click to cycle the declared color.
      if (hasJokers) {
        const startX = centerX - ((jokerCount - 1) * 80) / 2;
        jokerAssignment.forEach((assigned, i) => {
          const x = startX + i * 80;
          const objects: Phaser.GameObjects.GameObject[] = [];

          const bg = this.add.rectangle(x, jokerChipY, 70, 44, 0x2e2a55)
            .setStrokeStyle(2, 0xbb88ff)
            .setDepth(201)
            .setInteractive({ useHandCursor: true });
          if (this.hudContainer) this.hudContainer.add(bg);
          objects.push(bg);

          const label = this.add
            .text(x, jokerChipY - 7, `J${i + 1} → ${colorLabel(assigned)}`, {
              fontSize: '12px',
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              stroke: '#000000',
              strokeThickness: 2,
            })
            .setOrigin(0.5)
            .setDepth(201);
          if (this.hudContainer) this.hudContainer.add(label);
          objects.push(label);

          const hint = this.add
            .text(x, jokerChipY + 12, 'wild', {
              fontSize: '9px',
              color: '#a09bd8',
              fontFamily: FONT_FAMILY,
            })
            .setOrigin(0.5)
            .setDepth(201);
          if (this.hudContainer) this.hudContainer.add(hint);
          objects.push(hint);

          jokerChips.push({ index: i, objects });

          bg.on('pointerdown', () => {
            this.soundManager?.play(SFX_KEYS.UI);
            const idx = COLORS.indexOf(assigned);
            jokerAssignment[i] = COLORS[(idx + 1) % COLORS.length];
            drawChips();
          });
        });
      }
    };

    drawChips();

    const confirm = createOverlayButton(this, centerX, confirmY, 'Confirm', 201, { fontSize: '18px' });
    if (this.hudContainer) this.hudContainer.add(confirm);
    this.overlayObjects.push(confirm);
    confirm.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      // Destroy the picker chips: they are tracked in the local `chips` /
      // `jokerChips` arrays (not in `overlayObjects`), so dismissOverlay()
      // below would otherwise leave them rendered at depth 201 into the
      // next round. Mirror drawChips()'s cleanup loops.
      for (const entry of chips) destroyChip(entry.objects);
      chips.length = 0;
      for (const entry of jokerChips) destroyChip(entry.objects);
      jokerChips.length = 0;
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.completeRoundScoring(
        [...selected],
        hasJokers ? [...jokerAssignment] : undefined,
      );
    });
  }

  private completeRoundScoring(
    humanPositiveColors: ChameleonColor[],
    humanJokerAssignment?: JokerAssignment,
  ): void {
    const positives: (ChameleonColor[] | undefined)[] = this.session.players.map((_, i) =>
      i === 0 ? humanPositiveColors : undefined,
    );
    const jokerAssignments: (JokerAssignment | undefined)[] = this.session.players.map((_, i) =>
      i === 0 ? humanJokerAssignment : undefined,
    );

    const result = scoreRound(this.session, positives, jokerAssignments);
    this.recorder?.recordRoundResult(result);
    this.soundManager?.play(SFX_KEYS.ROUND);

    this.refreshAll();

    if (isGameOver(this.session)) {
      this.gameEvents.emit('game-ended', {
        finalTurnNumber: 0,
        winnerIndex: getWinnerIndex(this.session),
      });
      this.showGameOverOverlay(result);
    } else {
      this.showRoundScoreOverlay(result);
    }
  }

  // ── Round score overlay ──────────────────────────────────

  private showRoundScoreOverlay(result: RoundResult): void {
    this.phaseManager.set('round-scoring');

    const { objects } = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.7 },
      { width: 620, height: 420, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const title = this.add
      .text(centerX, boxY - 175, `Round ${result.round + 1} Scores`, {
        fontSize: '26px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(title);
    this.overlayObjects.push(title);

    result.playerScores.forEach((score, i) => {
      const y = boxY - 110 + i * 52;
      const player = this.session.players[i];
      const name = this.add
        .text(centerX - 250, y, `${player.name}:`, {
          fontSize: '17px',
          color: i === 0 ? '#ffffff' : '#c8e8d8',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0, 0.5)
        .setDepth(201);
      if (this.hudContainer) this.hudContainer.add(name);
      this.overlayObjects.push(name);

      // Per-colour breakdown rendered as chips (reusing the in-hand
      // collection chip size and colorHex() fill). Positive colours come
      // first, then a gap, then negative colours; each chip shows the
      // signed points value and a colour-coded border (green = positive,
      // red = negative) so the groups are identifiable at a glance.
      const positiveStroke = Phaser.Display.Color.HexStringToColor(colorHex('green')).color;
      const negativeStroke = Phaser.Display.Color.HexStringToColor(colorHex('red')).color;
      let chipX = centerX - 150;
      for (const group of [
        score.details.filter((d) => d.positive),
        score.details.filter((d) => !d.positive),
      ]) {
        for (const d of group) {
          const chip = this.add
            .rectangle(
              chipX,
              y,
              CHIP_W,
              CHIP_H,
              Phaser.Display.Color.HexStringToColor(colorHex(d.color)).color,
            )
            .setStrokeStyle(2, d.positive ? positiveStroke : negativeStroke)
            .setDepth(201);
          if (this.hudContainer) this.hudContainer.add(chip);
          this.overlayObjects.push(chip);

          const label = this.add
            .text(chipX, y, `${d.positive ? '+' : '−'}${Math.abs(d.points)}`, {
              fontSize: '11px',
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              stroke: '#000000',
              strokeThickness: 2,
            })
            .setOrigin(0.5)
            .setDepth(201);
          if (this.hudContainer) this.hudContainer.add(label);
          this.overlayObjects.push(label);

          chipX += CHIP_GAP;
        }
        // Visual gap between the positive and negative groups.
        chipX += 16;
      }

      const roundScore = result.roundScores[i];
      const scoreText = this.add
        .text(centerX + 250, y, `${roundScore > 0 ? '+' : ''}${roundScore} (total ${result.cumulativeScores[i]})`, {
          fontSize: '17px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(1, 0.5)
        .setDepth(201);
      if (this.hudContainer) this.hudContainer.add(scoreText);
      this.overlayObjects.push(scoreText);
    });

    const next = createOverlayButton(this, centerX, boxY + 150, 'Next Round', 201, { fontSize: '18px' });
    if (this.hudContainer) this.hudContainer.add(next);
    this.overlayObjects.push(next);
    next.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.refreshAll();
      this.runTurn();
    });
  }

  // ── Game over overlay ────────────────────────────────────

  private showGameOverOverlay(result: RoundResult): void {
    this.phaseManager.set('game-over');
    this.soundManager?.play(SFX_KEYS.SCORE);

    const winnerIndex = getWinnerIndex(this.session);
    if (this.recorder && !this.recorder.isSealed()) {
      const transcript = this.recorder.finalize(winnerIndex);
      autoSaveTranscript(this.transcriptStore, 'coloretto', transcript, '[ColorettoScene]');
    }

    const { objects } = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.75 },
      { width: 620, height: 460, color: 0x0d1a21, alpha: 0.96, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const winnerName = this.session.players[winnerIndex].name;
    const title = this.add
      .text(centerX, boxY - 190, winnerIndex === 0 ? 'You Win!' : `${winnerName} Wins!`, {
        fontSize: '32px',
        color: winnerIndex === 0 ? '#ffdd66' : '#ff9966',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(title);
    this.overlayObjects.push(title);

    result.playerScores.forEach((_score, i) => {
      const y = boxY - 110 + i * 48;
      const player = this.session.players[i];
      const text = this.add
        .text(centerX, y, `${player.name}: ${player.totalScore} pts`, {
          fontSize: '18px',
          color: i === winnerIndex ? '#ffdd66' : '#c8e8d8',
          fontFamily: FONT_FAMILY,
          fontStyle: i === winnerIndex ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(201);
      if (this.hudContainer) this.hudContainer.add(text);
      this.overlayObjects.push(text);
    });

    const playAgain = createOverlayButton(this, centerX - 120, boxY + 150, 'Play Again', 201, { fontSize: '18px' });
    if (this.hudContainer) this.hudContainer.add(playAgain);
    this.overlayObjects.push(playAgain);
    playAgain.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      this.scene.restart();
    });

    const menu = createOverlayButton(this, centerX + 120, boxY + 150, 'Menu', 201, { fontSize: '18px' });
    if (this.hudContainer) this.hudContainer.add(menu);
    this.overlayObjects.push(menu);
    menu.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      this.scene.start('GameSelectorScene');
    });
  }

  // ── Cleanup ──────────────────────────────────────────────

  shutdown(): void {
    this.destroyModeButtons();
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.shutdownBase();
  }
}

// ── Module helpers ─────────────────────────────────────────

/** Build one AI player per AI-controlled session player (null for humans). */
function sessionToAiPlayers(session: ColorettoSession): (ColorettoAiPlayer | null)[] {
  return session.players.map((p) =>
    p.isAI ? new ColorettoAiPlayer(HeuristicStrategy) : null,
  );
}

/** Create a mode toggle button (highlighted when active). */
function createModeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  active: boolean,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const btn = scene.add
    .text(x, y, label, {
      fontSize: '16px',
      color: active ? '#15242b' : '#ffffff',
      backgroundColor: active ? '#ffdd66' : '#22343c',
      padding: { x: 14, y: 8 },
      fontFamily: FONT_FAMILY,
    })
    .setOrigin(0.5)
    .setDepth(5)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', onClick)
    .on('pointerover', () => {
      if (!active) btn.setStyle({ color: '#ffdd66' });
    })
    .on('pointerout', () => {
      if (!active) btn.setStyle({ color: '#ffffff' });
    });
  return btn;
}
