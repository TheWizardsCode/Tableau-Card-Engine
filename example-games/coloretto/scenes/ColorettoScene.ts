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
import { colorLabel, colorHex } from '../ColorettoCards';
import type {
  ColorettoSession,
  ColorettoAction,
  RoundResult,
} from '../ColorettoGame';
import {
  setupColorettoGame,
  executeAction,
  validateAction,
  getCurrentPlayerIndex,
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
} from '../ColorettoScoring';
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
const CHIP_W = 20;
const CHIP_H = 28;
const CHIP_GAP = 26;
const COLLECTION_STEP = 40;

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
    const step = Math.min(ROW_STEP_MAX, Math.floor(360 / rowCount));
    const startY = this.layout.rowsCenterY - ((rowCount - 1) * step) / 2;

    for (let i = 0; i < rowCount; i++) {
      const row = this.session.rows[i];
      const rowY = startY + i * step;

      // Row label
      this.rowsContainer.add(
        this.add
          .text(this.layout.rowsCenterX - CARD_W * 1.5 - 34, rowY, `R${i + 1}`, {
            fontSize: '15px',
            color: '#8fb8aa',
            fontFamily: FONT_FAMILY,
          })
          .setOrigin(0.5),
      );

      // Cards
      const cardSlots = 3;
      const totalWidth = cardSlots * CARD_W + (cardSlots - 1) * ROW_CARD_GAP;
      const startX = this.layout.rowsCenterX - totalWidth / 2;
      for (let slot = 0; slot < cardSlots; slot++) {
        const cardX = startX + slot * (CARD_W + ROW_CARD_GAP);
        const card = row.cards[slot];
        if (card) {
          this.rowsContainer.add(this.createCard(cardX, rowY, card));
        } else {
          // Empty slot outline
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
          totalWidth + 30,
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

  private createCard(x: number, y: number, card: ColorettoCard): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    if (card.type === 'last-round') {
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x555555);
      bg.setStrokeStyle(2, 0xcccccc);
      container.add(bg);
      const text = this.add
        .text(0, 0, 'LR', {
          fontSize: '22px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      container.add(text);
      return container;
    }

    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, 0x1b2a33);
    bg.setStrokeStyle(1, 0x4a6a7a);
    container.add(bg);

    const colorRect = this.add.rectangle(0, -8, CARD_W - 8, CARD_H - 24, Phaser.Display.Color.HexStringToColor(colorHex(card.color)).color);
    container.add(colorRect);

    const countText = this.add
      .text(0, 14, `${card.count}×`, {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add(countText);

    const nameText = this.add
      .text(0, 32, colorLabel(card.color), {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    container.add(nameText);

    return container;
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

  // ── Collections rendering ────────────────────────────────

  private refreshCollections(): void {
    this.collectionsContainer.removeAll(true);

    const currentIdx = getCurrentPlayerIndex(this.session);
    const startY = this.layout.collectionsTopY;

    this.session.players.forEach((player, i) => {
      const y = startY + i * COLLECTION_STEP;
      const isCurrent = i === currentIdx && this.session.phase === 'playing';
      const isHuman = i === 0;

      // Name + score
      const nameColor = isCurrent ? '#ffdd66' : isHuman ? '#ffffff' : '#b8d8c8';
      const name = this.add
        .text(this.layout.collectionsTopX, y, `${player.name} — ${player.totalScore} pts`, {
          fontSize: '16px',
          color: nameColor,
          fontFamily: FONT_FAMILY,
          fontStyle: isCurrent ? 'bold' : 'normal',
        })
        .setOrigin(0, 0.5);
      this.collectionsContainer.add(name);

      // Color chips
      const counts = colorCounts(player.collection);
      let chipX = this.layout.collectionsTopX + 260;
      for (const color of presentColors(counts)) {
        const chip = this.add.rectangle(chipX, y, CHIP_W, CHIP_H, Phaser.Display.Color.HexStringToColor(colorHex(color)).color);
        this.collectionsContainer.add(chip);
        const label = this.add
          .text(chipX, y, `${counts[color]}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        chipX += CHIP_GAP;
      }

      // Round-state marker
      if (player.roundState === 'taken-row') {
        const done = this.add
          .text(this.layout.collectionsTopX + 130, y, '(taken a row)', {
            fontSize: '12px',
            color: '#77998a',
            fontFamily: FONT_FAMILY,
          })
          .setOrigin(0, 0.5);
        this.collectionsContainer.add(done);
      } else if (player.roundState === 'final-turn-done') {
        const done = this.add
          .text(this.layout.collectionsTopX + 130, y, '(done)', {
            fontSize: '12px',
            color: '#77998a',
            fontFamily: FONT_FAMILY,
          })
          .setOrigin(0, 0.5);
        this.collectionsContainer.add(done);
      }
    });
  }

  // ── Mode buttons ─────────────────────────────────────────

  private refreshModeButtons(): void {
    this.destroyModeButtons();
    if (this.phaseManager.current !== 'human-turn') return;

    const y = this.layout.collectionsTopY + this.session.players.length * COLLECTION_STEP + 8;
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

    const result = executeAction(this.session, playerIndex, action);
    this.recorder?.recordTurn(playerIndex, action, result.drawnCard);

    if (action.type === 'place') {
      this.gameEvents.emit('card:placed', {
        cardId: String(result.drawnCard?.id ?? -1),
        playerIndex,
        action: 'place',
      });
    } else {
      this.gameEvents.emit('card-swapped', {
        position: action.rowIndex,
        drawnFrom: 'stock',
        playerIndex,
      });
    }

    this.refreshAll();

    if (result.roundOver) {
      this.handleRoundOver();
    } else {
      this.runTurn();
    }
  }

  // ── Round scoring ────────────────────────────────────────

  private handleRoundOver(): void {
    this.phaseManager.set('round-scoring');
    beginRoundScoring(this.session);

    const humanCollection = this.session.players[0].collection;
    const present = presentColors(colorCounts(humanCollection));

    if (present.length >= 3) {
      this.showColorPickerOverlay();
    } else {
      // Fewer than 3 colors: all score positively (auto-confirm).
      this.completeRoundScoring([]);
    }
  }

  private showColorPickerOverlay(): void {
    const human = this.session.players[0];
    const counts = colorCounts(human.collection);
    const present = presentColors(counts);
    const selected = new Set<ChameleonColor>(selectBestPositiveColors(human.collection));

    const { objects } = createOverlayBackground(
      this,
      { depth: 199, alpha: 0.7 },
      { width: 560, height: 380, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const title = this.add
      .text(centerX, boxY - 150, 'Choose 3 colors to score POSITIVELY', {
        fontSize: '20px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(title);
    this.overlayObjects.push(title);

    const subtitle = this.add
      .text(centerX, boxY - 118, 'All other colors score negatively', {
        fontSize: '14px',
        color: '#aacccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    if (this.hudContainer) this.hudContainer.add(subtitle);
    this.overlayObjects.push(subtitle);

    const chips: { color: ChameleonColor; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const chipStartX = centerX - 240;
    const chipY = boxY - 30;

    const drawChips = (): void => {
      // Rebuild the color chips from the current selection state.
      for (const entry of chips) {
        for (const obj of entry.objects) obj.destroy();
      }
      chips.length = 0;

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
    };

    drawChips();

    const confirm = createOverlayButton(this, centerX, boxY + 120, 'Confirm', 201, { fontSize: '18px' });
    if (this.hudContainer) this.hudContainer.add(confirm);
    this.overlayObjects.push(confirm);
    confirm.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI);
      // Destroy the picker chips: they are tracked in the local `chips`
      // array (not in `overlayObjects`), so dismissOverlay() below would
      // otherwise leave them rendered at depth 201 into the next round.
      // Mirror drawChips()'s cleanup loop.
      for (const entry of chips) {
        for (const obj of entry.objects) obj.destroy();
      }
      chips.length = 0;
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.completeRoundScoring([...selected]);
    });
  }

  private completeRoundScoring(humanPositiveColors: ChameleonColor[]): void {
    const positives: (ChameleonColor[] | undefined)[] = this.session.players.map((_, i) =>
      i === 0 ? humanPositiveColors : undefined,
    );

    const result = scoreRound(this.session, positives);
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

    result.playerScores.forEach((_score, i) => {
      const y = boxY - 110 + i * 52;
      const player = this.session.players[i];
      const positives = result.positiveColors[i]
        .map((c) => colorLabel(c))
        .join(', ');
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

      const detail = this.add
        .text(centerX - 120, y, `+${positives}`, {
          fontSize: '14px',
          color: '#aad8c0',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0, 0.5)
        .setDepth(201);
      if (this.hudContainer) this.hudContainer.add(detail);
      this.overlayObjects.push(detail);

      const scoreText = this.add
        .text(centerX + 250, y, `${result.roundScores[i]} (total ${result.cumulativeScores[i]})`, {
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
