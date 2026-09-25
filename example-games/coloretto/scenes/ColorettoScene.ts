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
 *
 * Module map (CG-0MTP6KN180075VTV):
 *   ColorettoRenderer      — rows, deck, collections, card faces, layout, animations
 *   ColorettoInputHandler  — row click zones, mode buttons, ESC toggle
 *   This scene             — overlays, turn orchestration, lifecycle, sound
 */

import Phaser from 'phaser';
import type { ChameleonColor } from '../ColorettoCards';
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
  beginRoundScoring,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../ColorettoGame';
import { ColorettoTranscriptRecorder } from '../GameTranscript';
import {
  colorCounts,
  presentColors,
  countJokers,
} from '../ColorettoScoring';
import type { JokerAssignment } from '../ColorettoScoring';
import { autoSaveTranscript, TranscriptStore } from '@core-engine/transcript';
import { markSceneValid, markSceneInvalid } from '@core-engine';
import type { EventSoundMapping } from '@core-engine/SoundManager';
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
} from '@ui';
import type { HelpSection } from '@ui';
import helpContent from '../help-content.json';
import { computeColorettoLayout } from './ColorettoLayoutAdapter';
import { ColorettoRenderer } from './ColorettoRenderer';
import { ColorettoInputHandler } from './ColorettoInputHandler';
import { ColorettoAiScheduler } from './ColorettoAiScheduler';
import { ColorettoOverlays } from './ColorettoOverlays';

// ── Turn phases ────────────────────────────────────────────

export type ColorettoTurnPhase =
  | 'start'
  | 'human-turn'
  | 'ai-thinking'
  | 'animating'
  | 'round-scoring'
  | 'game-over';

// ── Visual constants (shared with helpers) ────────────────

/** Mode-button offset below the collections block (half button height + gap). */
const MODE_BUTTON_OFFSET = 26;
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

  // UI text
  roundText!: Phaser.GameObjects.Text;
  turnText!: Phaser.GameObjects.Text;
  instructionText!: Phaser.GameObjects.Text;

  // Overlay state
  overlayObjects: Phaser.GameObjects.GameObject[] = [];

  /** Extracted rendering + animation helper (owns rows/deck/collections/layout). */
  boardRenderer!: ColorettoRenderer;

  /** Extracted input handling helper (owns row wiring, mode buttons, ESC). */
  inputHandler!: ColorettoInputHandler;

  /** Extracted AI scheduling helper (owns per-player AI strategies + delay). */
  aiScheduler!: ColorettoAiScheduler;

  /** Extracted overlay helper (owns round-scoring/game-over dialogs). */
  private overlays!: ColorettoOverlays;

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

  // ── Game start ───────────────────────────────────────────

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
    this.recorder = new ColorettoTranscriptRecorder(this.session);

    // (Re)create the helpers for this session.
    this.buildHelpers();

    this.boardRenderer.refreshAll();
    this.phaseManager.setPhaseText('human-turn', 'Your turn: choose Place or Take, then click a row');
    this.runTurn();
  }

  /** Create (or recreate) the renderer + input handler + AI scheduler helpers. */
  private buildHelpers(): void {
    this.boardRenderer = new ColorettoRenderer(
      this,
      this.session,
      this.rowsContainer,
      this.collectionsContainer,
      this.deckContainer,
      this.lastRoundContainer,
      (phase: string) => this.phaseManager.set(phase as ColorettoTurnPhase),
      () => this.hudContainer,
    );
    this.boardRenderer.setRoundText(this.roundText, this.turnText, this.instructionText);
    this.aiScheduler = new ColorettoAiScheduler(
      this,
      this.session,
      (phase: string) => this.phaseManager.set(phase as ColorettoTurnPhase),
      () => this.reducedMotion,
    );
    this.inputHandler = new ColorettoInputHandler(
      this,
      (rowIndex) => this.onRowClick(rowIndex),
      () => this.phaseManager.current,
      () => getCurrentPlayerIndex(this.session),
      (key) => this.soundManager?.play(key),
      () => this.boardRenderer.collectionBlockBottomY() + MODE_BUTTON_OFFSET,
    );
    // ESC + mode buttons live in the input handler; delegate mode changes.
    this.inputHandler.onModeChange((mode) => {
      this.actionMode = mode;
      this.phaseManager.set('human-turn');
    });

    this.overlays = new ColorettoOverlays(
      this,
      this.overlayObjects,
      () => this.session,
      (phase: string) => this.phaseManager.set(phase as ColorettoTurnPhase),
      () => this.hudContainer,
      (key) => this.soundManager?.play(key),
      () => this.instructionText,
      (positives, jokers) => this.completeRoundScoring(positives, jokers),
      () => {
        this.refreshAll();
        this.runTurn();
      },
      (action) => {
        if (action === 'restart') this.scene.restart();
        else this.scene.start('GameSelectorScene');
      },
      (winnerIndex) => this.sealTranscript(winnerIndex),
    );
  }

  // ── Refresh ──────────────────────────────────────────────

  private refreshAll(): void {
    this.boardRenderer.refreshRows();
    this.boardRenderer.refreshDeck();
    this.boardRenderer.refreshCollections();
    this.boardRenderer.refreshLastRoundCard();
    this.boardRenderer.refreshRoundInfo();
    this.refreshModeButtons();
    this.inputHandler.attachRowZones(this.boardRenderer.getRowZones());
  }

  /** Delegated renderer accessors (public API used by browser tests). */
  refreshRows(): void {
    this.boardRenderer.refreshRows();
    this.inputHandler.attachRowZones(this.boardRenderer.getRowZones());
  }

  refreshCollections(): void {
    this.boardRenderer.refreshCollections();
  }

  rowCenterY(rowIndex: number): number {
    return this.boardRenderer.rowCenterY(rowIndex);
  }

  fixedChipStartX(): number {
    return this.boardRenderer.fixedChipStartX();
  }

  /** In-flight card visual during the place animation (null when idle). */
  get flightCard(): Phaser.GameObjects.Container | null {
    return this.boardRenderer.flightCard;
  }

  /** Row click zones owned by the renderer (public API for tests). */
  get rowZones(): Phaser.GameObjects.Rectangle[] {
    return this.boardRenderer.rowZones;
  }

  /** The Place card mode button (null when hidden). */
  get placeButton(): Phaser.GameObjects.Text | null {
    return this.inputHandler?.getPlaceButton() ?? null;
  }

  /** The Take a row mode button (null when hidden). */
  get takeButton(): Phaser.GameObjects.Text | null {
    return this.inputHandler?.getTakeButton() ?? null;
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
      const zone = this.boardRenderer.getRowZones()[rowIndex];
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
      // AI turn: the scheduler owns per-player strategies and the
      // human-visible delay before the AI acts.
      this.aiScheduler.scheduleAITurn(playerIndex, (idx, action) => {
        this.executeTurn(idx, action);
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
      this.boardRenderer.animatePlace({
        action,
        drawnCard: result.drawnCard,
        reducedMotion: this.reducedMotion,
        onComplete: () => this.finishTurn(result),
      });
    } else {
      this.gameEvents.emit('card-swapped', {
        position: action.rowIndex,
        drawnFrom: 'stock',
        playerIndex,
      });
      // Session state is already updated (row → collection, pure TS); the
      // animation is a visual overlay replaying the captured start positions.
      this.boardRenderer.playTakeAnimation({
        playerIndex,
        rowIndex: action.rowIndex,
        takenCards,
        reducedMotion: this.reducedMotion,
        onComplete: () => this.finishTurn(result),
      });
    }
  }

  /** Resume turn flow after the placement/take animation completes. */
  private finishTurn(result: ActionResult): void {
    this.refreshAll();
    if (result.roundOver) {
      this.handleRoundOver();
    } else {
      this.runTurn();
    }
  }

  /** Refresh round/turn text via the renderer. */
  private refreshRoundInfo(): void {
    this.boardRenderer.refreshRoundInfo();
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
    this.overlays.showColorPickerOverlay();
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
    this.overlays.showRoundScoreOverlay(result);
  }

  // ── Game over overlay ────────────────────────────────────

  private showGameOverOverlay(result: RoundResult): void {
    this.overlays.showGameOverOverlay(result, getWinnerIndex(this.session));
  }

  /** Seal + auto-save the game transcript when the game ends. */
  private sealTranscript(winnerIndex: number): void {
    if (this.recorder && !this.recorder.isSealed()) {
      const transcript = this.recorder.finalize(winnerIndex);
      autoSaveTranscript(this.transcriptStore, 'coloretto', transcript, '[ColorettoScene]');
    }
  }

  // ── Mode buttons (delegated to the input handler) ─────────

  private refreshModeButtons(): void {
    this.inputHandler?.refreshModeButtons();
  }

  private destroyModeButtons(): void {
    this.inputHandler?.destroyModeButtons();
  }

  // ── Cleanup ──────────────────────────────────────────────

  shutdown(): void {
    this.destroyModeButtons();
    this.inputHandler?.destroy();
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
    this.shutdownBase();
  }
}

/**
 * Catalogue metadata for the Game Selector. The GAME_INFO convention
 * (see scripts/vite-game-discovery-plugin.ts) lets a distribution
 * build its game catalogue from config presets instead of hardcoded
 * imports in main.ts.
 */
export const GAME_INFO = {
  sceneKey: 'ColorettoScene',
  title: 'Coloretto',
  description:
    'Set-building card game (human vs. 1-4 AI). Take rows of chameleon cards from the shared tableau, score 3 colors positively across multiple rounds, and outscore the AI.',
} as const;
