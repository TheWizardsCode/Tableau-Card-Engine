/**
 * SushiGoScene -- the main Phaser scene for Sushi Go!
 *
 * Implements the full visual interface:
 *   - Player hand (clickable cards at the bottom)
 *   - Player tableau (collected cards, grouped by type)
 *   - Opponent tableau (visible, grouped by type)
 *   - Round/turn indicators and score display
 *   - End-of-round and end-of-game overlays
 *   - AI opponent with configurable delay
 *   - Help panel and settings panel integration
 */

import Phaser from 'phaser';
import type { SushiGoCard, SushiGoCardType } from '../SushiGoCards';
import { cardLabel } from '../SushiGoCards';
import { getIconKeyForCard } from '../IconMap';
import type { SushiGoSession, RoundResult, PickAction } from '../SushiGoGame';
import {
  setupSushiGoGame,
  executeAllPicks,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../SushiGoGame';
import { SushiGoAiPlayer, GreedyStrategy } from '../AiStrategy';
import { scoreTableauBreakdown, countMakiIcons, scoreMaki } from '../SushiGoScoring';
import { SushiGoTranscriptRecorder } from '../GameTranscript';
import type { SushiGoCardSnapshot, PlayerSnapshot } from '../GameTranscript';
import { TranscriptStore } from '../../../src/core-engine/TranscriptStore';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  HelpPanel, HelpButton,
  SettingsPanel, SettingsButton,
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay,
  PhaseManager,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Constants ───────────────────────────────────────────────

const ANIM_DURATION = 300;      // ms for card pick animation

// Layout regions
const HAND_Y = 600;             // center Y for hand cards
const HAND_CARD_W = 110;        // card rect width in hand
const HAND_CARD_H = 145;        // card rect height in hand
const HAND_GAP = 8;             // gap between hand cards

const PLAYER_TABLEAU_Y = 395;   // center Y for player tableau
const AI_TABLEAU_Y = 200;       // center Y for AI tableau
// Tableau cards should keep the same aspect ratio as hand cards so icons
// and labels stay consistent between hand and tableau. Compute them here
// as a scaled version of the hand card size.
const TABLEAU_SCALE = 0.62; // scale factor relative to hand card (tweakable)
const TABLEAU_CARD_W = Math.round(HAND_CARD_W * TABLEAU_SCALE);
const TABLEAU_CARD_H = Math.round(HAND_CARD_H * TABLEAU_SCALE);
const TABLEAU_GROUP_GAP = 24;   // gap between type groups
const TABLEAU_CARD_GAP = 6;     // gap between cards in a group

const SCORE_AREA_X = GAME_W - 15;
const PLAYER_SCORE_Y = 485;
const AI_SCORE_Y = 100;

// Card type display config: label, fill color, text color
const CARD_STYLES: Record<SushiGoCardType, { bg: number; text: string; short: string }> = {
  tempura:    { bg: 0xFFD700, text: '#333333', short: 'TMP' },
  sashimi:    { bg: 0x98FB98, text: '#1a3a1a', short: 'SSH' },
  dumpling:   { bg: 0xFFB347, text: '#333333', short: 'DMP' },
  maki:       { bg: 0xFF6B6B, text: '#ffffff', short: 'MK' },
  nigiri:     { bg: 0xFFE4B5, text: '#333333', short: 'NG' },
  wasabi:     { bg: 0x90EE90, text: '#1a3a1a', short: 'WSB' },
  pudding:    { bg: 0xFFDAB9, text: '#333333', short: 'PDG' },
  chopsticks: { bg: 0xC0C0C0, text: '#333333', short: 'CHP' },
};

// Scoring-rule tooltip text per card type
const SCORING_TOOLTIPS: Record<SushiGoCardType, string> = {
  tempura:    '5 pts per pair (incomplete pair = 0)',
  sashimi:    '10 pts per set of 3 (incomplete set = 0)',
  dumpling:   '1/3/6/10/15 pts for 1/2/3/4/5+ dumplings',
  maki:       'Most maki icons = 6 pts, 2nd most = 3 pts (ties split)',
  nigiri:     'Egg 1 pt, Salmon 2 pts, Squid 3 pts (x3 if on wasabi)',
  wasabi:     'Triples the next nigiri played on it',
  pudding:    'End of game: most = +6 pts, fewest = -6 pts (ties split)',
  chopsticks: 'Pick 2 cards in one turn (return chopsticks to hand)',
};

// Tooltip styling
const TOOLTIP_BG_COLOR = 0x000000;
const TOOLTIP_BG_ALPHA = 0.85;
const TOOLTIP_PADDING = 8;
const TOOLTIP_FONT_SIZE = '13px';
const TOOLTIP_MAX_WIDTH = 280;
const TOOLTIP_DEPTH = 800; // Below settings panel (900+) but above game content

// ── Audio asset keys ────────────────────────────────────────

const SFX_KEYS = {
  CARD_PICK: 'sfx-card-draw',
  CARD_FLIP: 'sfx-card-flip',
  TURN_CHANGE: 'sfx-turn-change',
  ROUND_END: 'sfx-round-end',
  SCORE_REVEAL: 'sfx-score-reveal',
  UI_CLICK: 'sfx-ui-click',
} as const;

// ── Turn phase ──────────────────────────────────────────────

type TurnPhase =
  | 'picking'          // Human must click a hand card
  | 'animating'        // Animation in progress
  | 'ai-thinking'      // AI delay
  | 'round-scored'     // Round score overlay shown
  | 'game-over';       // Final overlay shown

// ── Scene ───────────────────────────────────────────────────

/** Shared TranscriptStore instance for the Sushi Go! game. */
const transcriptStore = new TranscriptStore();

export class SushiGoScene extends Phaser.Scene {
  // Game state
  private session!: SushiGoSession;
  private aiPlayer!: SushiGoAiPlayer;
  private phaseManager!: PhaseManager<TurnPhase>;
  private pendingHumanPick: number | null = null;
  private pendingHumanSecondPick: number | null = null;

  // Chopsticks mode state
  private chopsticksMode = false;
  private chopsticksFirstPick: number | null = null;
  private chopsticksButton: Phaser.GameObjects.Text | null = null;

  // Transcript recording
  private recorder: SushiGoTranscriptRecorder | null = null;

  /** When true, the scene suppresses all input and AI turns for replay use. */
  private replayMode: boolean = false;

  /** Tracks the replay step index for state-settled payloads. */
  private replayStepIndex: number = -1;

  // Event system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;
  private soundManager: SoundManager | null = null;

  // Display containers
  private handContainer!: Phaser.GameObjects.Container;
  private playerTableauContainer!: Phaser.GameObjects.Container;
  private aiTableauContainer!: Phaser.GameObjects.Container;

  // UI text
  private roundText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private playerScoreText!: Phaser.GameObjects.Text;
  private aiScoreText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private cardsLeftText!: Phaser.GameObjects.Text;

  // Help / settings panels
  private helpPanel!: HelpPanel;
  private helpButton!: HelpButton;
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  // Tooltip
  private tooltipContainer: Phaser.GameObjects.Container | null = null;

  // Overlay cleanup
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'SushiGoScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    // Audio SFX assets (reuse common audio from Golf)
    this.load.audio(SFX_KEYS.CARD_PICK, 'assets/audio/card-draw.wav');
    this.load.audio(SFX_KEYS.CARD_FLIP, 'assets/audio/card-flip.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/turn-change.wav');
    this.load.audio(SFX_KEYS.ROUND_END, 'assets/audio/round-end.wav');
    this.load.audio(SFX_KEYS.SCORE_REVEAL, 'assets/audio/score-reveal.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/ui-click.wav');

    // Sushi Go icon assets: preload all icon files present in public/assets/sushi-go
    // We list the known filenames here to avoid dynamic FS lookups at runtime.
    const icons = [
      'icon-nigiri-salmon.svg', 'icon-nigiri-egg.svg', 'icon-nigiri-squid.svg',
      'icon-maki-1.svg', 'icon-maki-2.svg', 'icon-maki-3.svg',
      'icon-tempura.svg', 'icon-sashimi.svg', 'icon-dumpling.svg',
      'icon-wasabi.svg', 'icon-pudding.svg', 'icon-chopsticks.svg',
    ];
    for (const fn of icons) {
      const key = fn.replace(/\.svg$/, '');
      this.load.svg(key, `assets/sushi-go/${fn}`);
    }
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a3a');

    // Reset state
    this.phaseManager = new PhaseManager<TurnPhase>({
      initialPhase: 'picking',
      phaseTextMap: {
        picking: 'Click a card from your hand to pick it',
        animating: '',
        'ai-thinking': 'AI is thinking...',
        'round-scored': '',
        'game-over': '',
      },
      onPhaseChange: (phase) => {
        if (phase === 'picking') {
          if (this.chopsticksMode) {
            this.phaseManager.setPhaseText('picking', 'Chopsticks: click your 1st card');
          } else {
            this.phaseManager.setPhaseText('picking', 'Click a card from your hand to pick it');
          }
          this.refreshHand();
          this.refreshChopsticksButton();
        }
      },
    });
    this.pendingHumanPick = null;
    this.pendingHumanSecondPick = null;
    this.chopsticksMode = false;
    this.chopsticksFirstPick = null;
    this.chopsticksButton = null;
    this.overlayObjects = [];
    this.recorder = null;
    this.replayStepIndex = -1;

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.replayMode = urlParams.get('mode') === 'replay';

    // Event system
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);
    // Expose for replay tool (page.evaluate can listen for state-settled)
    (window as unknown as Record<string, unknown>).__GAME_EVENTS__ =
      this.gameEvents;

    if (this.replayMode) {
      // In replay mode: create minimal UI, skip game setup.
      // The replay tool will call loadBoardState() to inject state.
      this.createHeader();
      this.createLabels();
      this.createScoreDisplay();
      this.createInstructions();
      this.createContainers();

      // Set default display for replay mode
      this.roundText.setText('Round 1 of 3');
      this.turnText.setText('Turn 0 of 10');
      this.cardsLeftText.setText('');
      this.instructionText.setText('');

      // Emit state-settled so the replay tool knows the scene is ready
      this.emitStateSettled();
      return;
    }

    // Sound system
    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => { phaserSound.play(key); },
      stop: (key: string) => { phaserSound.stopByKey(key); },
      setVolume: (v: number) => { phaserSound.volume = v; },
      setMute: (m: boolean) => { phaserSound.mute = m; },
    };
    this.soundManager = new SoundManager(player);
    for (const sfxKey of Object.values(SFX_KEYS)) {
      this.soundManager.register(sfxKey);
    }
    const mapping: EventSoundMapping = {
      'card-drawn': SFX_KEYS.CARD_PICK,
      'turn-started': SFX_KEYS.TURN_CHANGE,
      'game-ended': SFX_KEYS.ROUND_END,
    };
    this.soundManager.connectToEvents(this.gameEvents, mapping);

    // Setup game
    this.session = setupSushiGoGame({
      playerCount: 2,
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new SushiGoAiPlayer(GreedyStrategy);

    // Create transcript recorder
    this.recorder = new SushiGoTranscriptRecorder(this.session);

    // Create UI
    this.createHeader();
    this.createLabels();
    this.createScoreDisplay();
    this.createInstructions();
    this.createContainers();
    this.createHelpPanel();
    this.createSettingsPanel();

    // Initial render
    this.refreshAll();
    this.phaseManager.setTextObject(this.instructionText);
    this.phaseManager.set('picking');

    // Keyboard: Escape cancels chopsticks mode
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.chopsticksMode) {
        this.cancelChopsticksMode();
      }
    });
  }

  // ── UI creation ─────────────────────────────────────────

  private createHeader(): void {
    createSceneMenuButton(this);
    createSceneTitle(this, 'Sushi Go!');
  }

  private createLabels(): void {
    this.add.text(25, PLAYER_TABLEAU_Y - 50, 'Your Tableau', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
    });

    this.add.text(25, AI_TABLEAU_Y - 50, 'AI Tableau', {
      fontSize: '18px',
      color: '#cccccc',
      fontFamily: FONT_FAMILY,
    });
  }

  private createScoreDisplay(): void {
    // Moved the round/turn/cards info block upward by ~2 line heights
    // to reduce overlap with header and provide clearer spacing.
    this.roundText = this.add
      .text(GAME_W / 2, 51, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.turnText = this.add
      .text(GAME_W / 2, 75, '', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.cardsLeftText = this.add
      .text(GAME_W / 2, 95, '', {
        fontSize: '14px',
        color: '#889988',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.playerScoreText = this.add
      .text(SCORE_AREA_X, PLAYER_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);

    this.aiScoreText = this.add
      .text(SCORE_AREA_X, AI_SCORE_Y, 'Score: 0', {
        fontSize: '20px',
        color: '#cccccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0.5);
  }

  private createInstructions(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 14, '', {
        fontSize: '15px',
        color: '#88aa88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
  }

  private createContainers(): void {
    this.handContainer = this.add.container(0, 0);
    this.playerTableauContainer = this.add.container(0, 0);
    this.aiTableauContainer = this.add.container(0, 0);
  }

  private createHelpPanel(): void {
    this.helpPanel = new HelpPanel(this, {
      sections: helpContent as HelpSection[],
    });
    this.helpButton = new HelpButton(this, this.helpPanel);
  }

  private createSettingsPanel(): void {
    if (!this.soundManager) return;
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);
  }

  // ── Card rendering helpers ──────────────────────────────

  /**
   * Create a visual card rectangle with label text.
   * Sushi Go! uses custom card types (not standard playing cards),
   * so we render text-based cards with colored backgrounds.
   */
  private createCardRect(
    x: number,
    y: number,
    w: number,
    h: number,
    card: SushiGoCard,
    interactive: boolean = false,
    handIndex?: number,
  ): Phaser.GameObjects.Container {
    const style = CARD_STYLES[card.type];
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add.rectangle(0, 0, w, h, style.bg);
    bg.setStrokeStyle(2, 0x333333);
    container.add(bg);

    // Card label (short for tableau, full for hand)
    const isHand = handIndex !== undefined;
    const labelText = isHand ? this.getHandCardLabel(card) : this.getTableauCardLabel(card);
    const fontSize = isHand ? '16px' : '12px';

    // Try to render an icon if available for this card type.
    const iconMeta = getIconKeyForCard(card);
    const iconKey = iconMeta?.key ?? null;
    if (iconKey && this.textures.exists(iconKey)) {
      // Center the icon and scale it to occupy more of the card while preserving
      // a small padding so it remains legible when card shapes change.
      const img = this.add.image(0, 0, iconKey);
      img.setOrigin(0.5, 0.5);
      // Use larger footprint for icons in both hand and tableau; hand cards are taller
      const iconMaxW = w * (isHand ? 0.9 : 0.85);
      const iconMaxH = h * (isHand ? 0.7 : 0.85);
      const iconSize = Math.min(iconMaxW, iconMaxH);
      img.setDisplaySize(iconSize, iconSize);
      container.add(img);

      // Keep the card text label visible for accessibility and clarity.
      // Place it below the icon; for small tableau cards use the smaller font.
      // Position label flush above the bottom edge with a small padding so
      // it never gets clipped when the card resizes or changes shape.
      const bottomPadding = isHand ? 8 : 6;
      const label = this.add.text(0, h / 2 - bottomPadding, labelText, {
        fontSize,
        color: style.text,
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: w - 6 },
      }).setOrigin(0.5, 1); // origin y=1 so text sits above the given y coordinate
      container.add(label);
    } else {
      const label = this.add.text(0, 0, labelText, {
        fontSize,
        color: style.text,
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: w - 6 },
      }).setOrigin(0.5);
      container.add(label);
    }

    // Make the card interactive for tooltip and/or clicking
    bg.setInteractive({ useHandCursor: interactive });

    if (interactive && handIndex !== undefined) {
      bg.on('pointerdown', () => this.onHandCardClick(handIndex));
    }

    bg.on('pointerover', () => {
      if (interactive) {
        bg.setStrokeStyle(3, 0xffdd44);
        container.setScale(1.08);
      }
      this.showCardTooltip(card, container);
    });
    bg.on('pointerout', () => {
      if (interactive) {
        bg.setStrokeStyle(2, 0x333333);
        container.setScale(1.0);
      }
      this.hideCardTooltip();
    });

    // Store the underlying card id on the container so callers can
    // reliably find containers for specific cards when rendering
    // overlays (e.g. wasabi underline for paired nigiri).
    container.setData('cardId', card.id);

    return container;
  }

  private getHandCardLabel(card: SushiGoCard): string {
    return cardLabel(card);
  }

  private getTableauCardLabel(card: SushiGoCard): string {
    switch (card.type) {
      case 'maki':
        return `${card.icons}`;
      case 'nigiri':
        return card.variant.charAt(0).toUpperCase();
      default:
        return CARD_STYLES[card.type].short;
    }
  }

  /** Return the icon texture key for a card if available. */
  // Deprecated: use example-games/sushi-go/IconMap.ts instead.

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.hideCardTooltip();
    this.refreshHand();
    this.refreshTableau('player');
    this.refreshTableau('ai');
    this.refreshScores();
    this.refreshRoundInfo();
    this.refreshChopsticksButton();
  }

  private refreshHand(): void {
    this.handContainer.removeAll(true);

    const hand = this.session.players[0].hand;
    if (hand.length === 0) return;

    const totalW = hand.length * HAND_CARD_W + (hand.length - 1) * HAND_GAP;
    const startX = (GAME_W - totalW) / 2 + HAND_CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * (HAND_CARD_W + HAND_GAP);
      const isInteractive = this.phaseManager.current === 'picking';
      const cardContainer = this.createCardRect(
        x, HAND_Y, HAND_CARD_W, HAND_CARD_H,
        hand[i],
        isInteractive,
        i,
      );

      // Highlight the first selected card in chopsticks mode
      if (this.chopsticksMode && this.chopsticksFirstPick === i) {
        const highlight = this.add.rectangle(
          0, 0, HAND_CARD_W + 6, HAND_CARD_H + 6,
        );
        highlight.setStrokeStyle(3, 0x00ff88);
        highlight.setFillStyle(0x00ff88, 0.15);
        cardContainer.addAt(highlight, 0); // behind the card
      }

      this.handContainer.add(cardContainer);
    }
  }

  private refreshTableau(who: 'player' | 'ai'): void {
    const container = who === 'player'
      ? this.playerTableauContainer
      : this.aiTableauContainer;
    container.removeAll(true);

    const playerIdx = who === 'player' ? 0 : 1;
    const tableau = this.session.players[playerIdx].tableau;
    const baseY = who === 'player' ? PLAYER_TABLEAU_Y : AI_TABLEAU_Y;

    if (tableau.length === 0) {
      const empty = this.add.text(GAME_W / 2, baseY, '(no cards yet)', {
        fontSize: '15px',
        color: '#666666',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      container.add(empty);
      return;
    }

    // Build wasabi <-> nigiri pairing maps (based on play order).
    // Each wasabi pairs with the first subsequent nigiri. We record
    // by card id so groups (which reorder cards) can still determine
    // whether a wasabi is "consumed" and whether a nigiri is paired.
    const wasabiToNigiri = new Map<number, number>();
    const nigiriToWasabi = new Map<number, number>();
    const wasabiQueue: number[] = [];
    for (const c of tableau) {
      if (c.type === 'wasabi') {
        wasabiQueue.push(c.id);
      } else if (c.type === 'nigiri') {
        if (wasabiQueue.length > 0) {
          const wId = wasabiQueue.shift()!;
          wasabiToNigiri.set(wId, c.id);
          nigiriToWasabi.set(c.id, wId);
        }
      }
    }

    // Group cards by type (groups preserve tableau play order)
    const groups = this.groupByType(tableau);

    // Compute maki counts & bonuses across all players so the tableau
    // can display the awarded maki bonus (important in tie cases).
    const allMakiCounts = this.session.players.map((p) => countMakiIcons(p.tableau));
    const allMakiBonuses = scoreMaki(allMakiCounts);

    // Determine the horizontal order of type groups based on the
    // first appearance of each type in the tableau (play order).
    // This preserves the visual left-to-right play order so that
    // effects dependent on play order (like Wasabi -> Nigiri) match
    // what the player expects to see.
    const seenTypes = new Set<SushiGoCardType>();
    const typeOrder: SushiGoCardType[] = [];
    for (const c of tableau) {
      if (!seenTypes.has(c.type)) {
        seenTypes.add(c.type);
        typeOrder.push(c.type);
      }
    }

    // Calculate total width to center
    let totalWidth = 0;
    const groupWidths: number[] = [];
    for (const type of typeOrder) {
      const cards = groups.get(type);
      if (!cards || cards.length === 0) continue;
      const w = cards.length * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) - TABLEAU_CARD_GAP;
      groupWidths.push(w);
      totalWidth += w;
    }
    totalWidth += (groupWidths.length - 1) * TABLEAU_GROUP_GAP;

    let curX = (GAME_W - totalWidth) / 2;

    for (const type of typeOrder) {
      let cards = groups.get(type);
      if (!cards || cards.length === 0) continue;

      // If rendering the wasabi group, remove any wasabi that has
      // been paired with a nigiri so it will be displayed beneath
      // its paired nigiri instead of as a separate card.
      if (type === 'wasabi') {
        cards = cards.filter((c) => !wasabiToNigiri.has(c.id));
        if (cards.length === 0) continue;
      }

      // Type label above the group
      const groupW = cards.length * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) - TABLEAU_CARD_GAP;
        // Determine label text using score breakdown when available
        let labelText = this.getTypeGroupLabel(type, cards);
      if (type !== 'pudding') {
        // For categories that score within a single tableau, compute
        // the score and show it instead of the raw card count.
        // Use the full-player tableau breakdown so that cross-group
        // interactions (e.g. wasabi consuming a later nigiri) are
        // reflected in the displayed per-category score. The scoring
        // helper is imported statically at module load to avoid stale
        // dynamic require paths and TypeScript/LSP warnings.
        try {
          const breakdown = scoreTableauBreakdown(tableau);
          switch (type) {
            case 'tempura':
              labelText = `Tmp(${breakdown.tempura})`;
              break;
            case 'sashimi':
              labelText = `Ssh(${breakdown.sashimi})`;
              break;
            case 'dumpling':
              labelText = `Dmp(${breakdown.dumpling})`;
              break;
            case 'nigiri':
              labelText = `Nig(${breakdown.nigiri})`;
              break;
            case 'wasabi':
              // wasabi has no direct score in isolation
              labelText = `Wsb(${cards.length})`;
              break;
            case 'chopsticks':
              labelText = `Chp(${breakdown.chopsticks})`;
              break;
            default:
              break;
          }
        } catch (e) {
          // If anything goes wrong, fall back to the simple label
          // computed from the group's cards to keep UI stable.
          // (This should not normally happen.)
          // eslint-disable-next-line no-console
          console.warn('Failed to compute breakdown for tableau labels', e);
          labelText = this.getTypeGroupLabel(type, cards);
        }
      }
      // Special handling for maki: show both icon count and awarded bonus
      if (type === 'maki') {
        const totalIcons = cards.reduce((sum, c) => sum + (c.type === 'maki' ? c.icons : 0), 0);
        // Find this player's maki bonus (for 2-player game, playerIdx indicates player)
        const playerMakiBonus = allMakiBonuses[playerIdx] ?? 0;
        // If a bonus was awarded (including split ties), show the awarded
        // score prominently. Otherwise show the raw icon count.
        if (playerMakiBonus !== 0) {
          labelText = `Maki(${playerMakiBonus >= 0 ? '+' : ''}${playerMakiBonus})`;
        } else {
          labelText = `Maki(${totalIcons})`;
        }
      }

      const typeLabel = this.add.text(
        curX + groupW / 2,
        baseY - TABLEAU_CARD_H / 2 - 16,
        labelText,
        {
          fontSize: '11px',
          color: who === 'player' ? '#aaccaa' : '#99aabb',
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0.5);
      container.add(typeLabel);

      // Cards in group
      for (let i = 0; i < cards.length; i++) {
        const x = curX + i * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) + TABLEAU_CARD_W / 2;
        const cardRect = this.createCardRect(
          x, baseY, TABLEAU_CARD_W, TABLEAU_CARD_H, cards[i],
        );
        container.add(cardRect);
      }

      curX += groupW + TABLEAU_GROUP_GAP;
    }

    // Now render paired nigiri on top of their wasabi: for each nigiri
    // that has a pairing, find its position (we'll render the wasabi
    // as a small underline beneath the nigiri to make the relationship
    // visually explicit). This keeps tableau grouping intact while
    // providing a clear indication of pairing.
    for (const [nigiriId] of nigiriToWasabi.entries()) {
      // Find the card container we created for this nigiri
      const children = container.getAll();
      let nigiriContainer: Phaser.GameObjects.Container | null = null;
      for (const child of children) {
        // Our card containers are Phaser Containers with a text/image child
        if (!(child instanceof Phaser.GameObjects.Container)) continue;
        const inner = child.list.find((l: any) => l && l.type === 'Text') as Phaser.GameObjects.Text | undefined;
        if (!inner) continue;
        // The label text for nigiri is a single letter (E/S/Q) or 'NG' for group labels.
        // We can compare the underlying card id by checking data stored on the container
        // when created. To keep this lightweight, rely on matching the displayed label
        // and proximity of types. (If ambiguous, skip.)
        const possible = child.getData && child.getData('cardId') === nigiriId;
        if (possible) {
          nigiriContainer = child as Phaser.GameObjects.Container;
          break;
        }
      }

      if (!nigiriContainer) continue;

      // Avoid adding duplicate overlays on repeated refreshes
      if (nigiriContainer.getData('wasabiOverlay')) continue;

      // Small wasabi icon slightly beneath the card (subtle cue)
      if (this.textures.exists('icon-wasabi')) {
        const iconSize = Math.round(TABLEAU_CARD_W * 0.36);
        // Move the wasabi icon up so it doesn't overlap the label; use
        // a modest upward offset (~1 character height)
        const wasabiY = TABLEAU_CARD_H / 2 - 26;
        const wasabiImg = this.add.image(0, wasabiY, 'icon-wasabi');
        wasabiImg.setDisplaySize(iconSize, iconSize);
        wasabiImg.setOrigin(0.5, 1);
        // Place below the card content but above the background
        nigiriContainer.addAt(wasabiImg, 1);
      }

      // Prominent badge indicating x3 multiplier (top-right corner)
      const badgeW = 32;
      const badgeH = 18;
      const badgeX = TABLEAU_CARD_W / 2 - badgeW / 2 - 6;
      const badgeY = -TABLEAU_CARD_H / 2 + badgeH / 2 + 6;
      const badgeBg = this.add.rectangle(badgeX, badgeY, badgeW, badgeH, 0x90EE90, 1);
      badgeBg.setStrokeStyle(1, 0x336633);
      badgeBg.setOrigin(0.5);
      const badgeText = this.add.text(badgeX, badgeY, 'x3', {
        fontSize: '12px',
        color: '#1a3a1a',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0.5);
      // Add badge on top of card visuals
      nigiriContainer.add(badgeBg);
      nigiriContainer.add(badgeText);
      nigiriContainer.setData('wasabiOverlay', true);
    }
  }

  private getTypeGroupLabel(type: SushiGoCardType, cards: SushiGoCard[]): string {
    switch (type) {
      case 'maki': {
        const totalIcons = cards.reduce((sum, c) => sum + (c.type === 'maki' ? c.icons : 0), 0);
        return `Maki(${totalIcons})`;
      }
      case 'tempura':
        return `Tmp(${cards.length})`;
      case 'sashimi':
        return `Ssh(${cards.length})`;
      case 'dumpling':
        return `Dmp(${cards.length})`;
      case 'nigiri':
        return `Nig(${cards.length})`;
      case 'wasabi':
        return `Wsb(${cards.length})`;
      case 'pudding':
        return `Pdg(${cards.length})`;
      case 'chopsticks':
        return `Chp(${cards.length})`;
    }
  }

  private groupByType(tableau: SushiGoCard[]): Map<SushiGoCardType, SushiGoCard[]> {
    const groups = new Map<SushiGoCardType, SushiGoCard[]>();
    // Preserve the original play order when grouping so that the
    // relative order of cards of different types reflects tableau
    // insertion order. We iterate through tableau and append cards
    // to their type group in encountered order.
    for (const card of tableau) {
      const existing = groups.get(card.type);
      if (existing) existing.push(card);
      else groups.set(card.type, [card]);
    }
    return groups;
  }

  private refreshScores(): void {
    const human = this.session.players[0];
    const ai = this.session.players[1];
    this.playerScoreText.setText(`Score: ${human.totalScore}`);
    this.aiScoreText.setText(`Score: ${ai.totalScore}`);
  }

  private refreshRoundInfo(): void {
    const round = this.session.currentRound + 1;
    const total = this.session.totalRounds;
    const turn = this.session.currentTurn + 1;
    const turnsTotal = this.session.cardsPerPlayer;
    const cardsInHand = this.session.players[0].hand.length;

    this.roundText.setText(`Round ${round} of ${total}`);
    this.turnText.setText(`Turn ${turn} of ${turnsTotal}`);
    this.cardsLeftText.setText(`${cardsInHand} cards in hand`);
  }

  // ── Human input ─────────────────────────────────────────

  private onHandCardClick(handIndex: number): void {
    if (this.phaseManager.current !== 'picking') return;

    if (this.chopsticksMode) {
      if (this.chopsticksFirstPick === null) {
        // First card selected in chopsticks mode
        this.chopsticksFirstPick = handIndex;
        this.instructionText.setText('Chopsticks: click your 2nd card (Esc to cancel)');
        this.soundManager?.play(SFX_KEYS.CARD_PICK);
        this.refreshHand(); // re-render to show highlight on first pick
      } else {
        // Second card selected -- execute the dual pick
        if (handIndex === this.chopsticksFirstPick) {
          // Can't pick the same card twice; ignore
          return;
        }
        this.pendingHumanPick = this.chopsticksFirstPick;
        this.pendingHumanSecondPick = handIndex;
        this.soundManager?.play(SFX_KEYS.CARD_PICK);
        this.chopsticksMode = false;
        this.chopsticksFirstPick = null;
        this.executeTurn();
      }
    } else {
      // Normal single-card pick
      this.pendingHumanPick = handIndex;
      this.soundManager?.play(SFX_KEYS.CARD_PICK);
      this.executeTurn();
    }
  }

  // ── Chopsticks mode ─────────────────────────────────────

  /**
   * Check whether the human player currently has chopsticks in their tableau.
   */
  private humanHasChopsticks(): boolean {
    return this.session.players[0].tableau.some(
      (c) => c.type === 'chopsticks',
    );
  }

  /**
   * Refresh the "Use Chopsticks" button visibility and state.
   * The button is shown only during the picking phase when the human
   * player has chopsticks in their tableau and the hand has 2+ cards.
   */
  private refreshChopsticksButton(): void {
    // Destroy existing button
    if (this.chopsticksButton) {
      this.chopsticksButton.destroy();
      this.chopsticksButton = null;
    }

    const shouldShow =
      this.phaseManager.current === 'picking' &&
      this.humanHasChopsticks() &&
      this.session.players[0].hand.length >= 2;

    if (!shouldShow) {
      // Also cancel mode if it was active and conditions are no longer met
      if (this.chopsticksMode) {
        this.chopsticksMode = false;
        this.chopsticksFirstPick = null;
      }
      return;
    }

    const label = this.chopsticksMode ? '[ Cancel Chopsticks ]' : '[ Use Chopsticks ]';
    const color = this.chopsticksMode ? '#ff8888' : '#88ddff';

    this.chopsticksButton = this.add
      .text(GAME_W / 2, HAND_Y - HAND_CARD_H / 2 - 25, label, {
        fontSize: '16px',
        color,
        fontFamily: FONT_FAMILY,
        backgroundColor: '#2a3a4a',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        if (this.chopsticksMode) {
          this.cancelChopsticksMode();
        } else {
          this.enterChopsticksMode();
        }
      })
      .on('pointerover', () => {
        this.chopsticksButton?.setStyle({ color: '#ffffff' });
      })
      .on('pointerout', () => {
        this.chopsticksButton?.setStyle({
          color: this.chopsticksMode ? '#ff8888' : '#88ddff',
        });
      });
  }

  /**
   * Enter chopsticks mode: the player will pick 2 cards from their hand.
   */
  private enterChopsticksMode(): void {
    this.chopsticksMode = true;
    this.chopsticksFirstPick = null;
    this.instructionText.setText('Chopsticks: click your 1st card');
    this.refreshHand();
    this.refreshChopsticksButton();
  }

  /**
   * Cancel chopsticks mode and revert to normal single-card picking.
   */
  private cancelChopsticksMode(): void {
    this.chopsticksMode = false;
    this.chopsticksFirstPick = null;
    this.instructionText.setText('Click a card from your hand to pick it');
    this.refreshHand();
    this.refreshChopsticksButton();
  }

  // ── Turn execution ──────────────────────────────────────

  private executeTurn(): void {
    if (this.pendingHumanPick === null) return;

    this.phaseManager.set('animating');

    const humanPick: PickAction = { cardIndex: this.pendingHumanPick };
    if (this.pendingHumanSecondPick !== null) {
      humanPick.secondCardIndex = this.pendingHumanSecondPick;
    }

    // AI picks simultaneously
    const aiPick = this.aiPlayer.choosePick(this.session.players[1]);

    // Execute both picks
    executeAllPicks(this.session, [humanPick, aiPick]);

    // Record the turn in the transcript
    this.recorder?.recordTurn([humanPick, aiPick]);

    this.pendingHumanPick = null;
    this.pendingHumanSecondPick = null;

    // Animate card moving from hand to tableau
    this.animatePickThen(() => {
      this.refreshAll();

      // Check if round scoring is needed
      if (this.session.phase === 'round-scoring') {
        this.handleRoundScoring();
      } else {
        this.gameEvents.emit('turn-started', {
          turnNumber: this.session.currentTurn,
          playerIndex: 0,
          playerName: 'You',
          isAI: false,
        });
        this.phaseManager.set('picking');
      }
    });
  }

  // ── Round scoring ───────────────────────────────────────

  private handleRoundScoring(): void {
    this.soundManager?.play(SFX_KEYS.ROUND_END);

    const result = scoreRound(this.session);

    // Record the round result in the transcript
    this.recorder?.recordRoundResult(result);

    this.refreshScores();

    if (isGameOver(this.session)) {
      this.showGameOverOverlay(result);
    } else {
      this.showRoundScoreOverlay(result);
    }
  }

  private showRoundScoreOverlay(result: RoundResult): void {
    this.phaseManager.set('round-scored');
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    // Create overlay
    // Increase overlay height to accommodate per-category breakdown
    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 560, height: 460, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const roundNum = result.round + 1;

    // The scoring step may have cleared player tableaux when starting
    // the next round, so prefer the breakdown computed during scoring
    // (stored on the RoundResult) if available. Fall back to recomputing
    // from the current tableau only as a last resort.
    const human = this.session.players[0];
    const ai = this.session.players[1];
    const humanBreak = result.tableauBreakdowns?.[0] ?? scoreTableauBreakdown(human.tableau);
    const aiBreak = result.tableauBreakdowns?.[1] ?? scoreTableauBreakdown(ai.tableau);

    const humanMakiCount = result.makiCounts ? result.makiCounts[0] : 0;
    const aiMakiCount = result.makiCounts ? result.makiCounts[1] : 0;
    const humanMakiBonus = result.makiBonuses ? result.makiBonuses[0] : 0;
    const aiMakiBonus = result.makiBonuses ? result.makiBonuses[1] : 0;

    const lines = [
      `Round ${roundNum} Complete!`,
      '',
      `You: ${result.roundScores[0]} pts`,
      `  (Tmp:${humanBreak.tempura} Ssh:${humanBreak.sashimi} Dmp:${humanBreak.dumpling} Nig:${humanBreak.nigiri})`,
      `  Maki: ${humanMakiCount} → ${humanMakiBonus >= 0 ? '+' : ''}${humanMakiBonus} pts`,
      `AI: ${result.roundScores[1]} pts`,
      `  (Tmp:${aiBreak.tempura} Ssh:${aiBreak.sashimi} Dmp:${aiBreak.dumpling} Nig:${aiBreak.nigiri})`,
      `  Maki: ${aiMakiCount} → ${aiMakiBonus >= 0 ? '+' : ''}${aiMakiBonus} pts`,
      '',
      `Total -- You: ${this.session.players[0].totalScore}  AI: ${this.session.players[1].totalScore}`,
    ];

    // Position content relative to the visible overlay box when available
    const box = overlay.box;
    const padding = 24;
    let textY: number;
    let buttonY: number;
    if (box) {
      const boxTop = box.y - (box.height / 2);
      const boxBottom = box.y + (box.height / 2);
      textY = boxTop + padding; // align text to top region of box
      buttonY = boxBottom - 40; // buttons sit near bottom of box
    } else {
      // Fallback to previous absolute positioning
      const overlayHeight = 460;
      const overlayHalf = overlayHeight / 2;
      textY = GAME_H / 2 - overlayHalf + 48;
      buttonY = GAME_H / 2 + overlayHalf - 40;
    }

    const text = this.add
      .text(GAME_W / 2, textY, lines.join('\n'), {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0) // anchor at top center so top padding is respected
      .setDepth(11);
    this.overlayObjects.push(text);

    // Next round button (position computed above)
    const btn = createOverlayButton(this, GAME_W / 2, buttonY, '[ Next Round ]');
    btn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      dismissOverlay(this.overlayObjects);
      this.overlayObjects = [];
      this.refreshAll();
      this.phaseManager.set('picking');
    });
    this.overlayObjects.push(btn);
  }

  private showGameOverOverlay(result: RoundResult): void {
    this.phaseManager.set('game-over');
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    const winnerIdx = getWinnerIndex(this.session);

    // Finalize and auto-save the transcript
    if (this.recorder && !this.recorder.isSealed()) {
      const transcript = this.recorder.finalize(winnerIdx);
      this.autoSaveTranscript(transcript);
    }

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.session.currentTurn,
      winnerIndex: winnerIdx,
    });

    // Make final game-over dialog taller to avoid overlap with buttons
    // when including the per-category breakdown.
    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 560, height: 520, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const winnerText = winnerIdx === 0 ? 'You Win!' : 'AI Wins!';

    const human = this.session.players[0];
    const ai = this.session.players[1];

    // Compute per-category breakdown for the final round tableaux so we
    // can display a clear category-level score breakdown in the game
    // over dialog. Use the scoring helper which accounts for wasabi
    // pairing within the tableau.
    const humanBreak = scoreTableauBreakdown(human.tableau);
    const aiBreak = scoreTableauBreakdown(ai.tableau);

    // Use the round makiCounts and makiBonuses computed in scoreRound
    // to display both the raw maki icon counts and the awarded bonuses.
    const humanMakiCount = result.makiCounts ? result.makiCounts[0] : 0;
    const aiMakiCount = result.makiCounts ? result.makiCounts[1] : 0;
    const humanMakiBonus = result.makiBonuses ? result.makiBonuses[0] : 0;
    const aiMakiBonus = result.makiBonuses ? result.makiBonuses[1] : 0;
    const humanPuddingBonus = result.puddingBonuses ? result.puddingBonuses[0] : 0;
    const aiPuddingBonus = result.puddingBonuses ? result.puddingBonuses[1] : 0;

    const lines = [
      winnerText,
      '',
      `Final Round -- You: ${result.roundScores[0]}, AI: ${result.roundScores[1]}`,
      '',
      'Breakdown (this round):',
      `You:  Cards ${humanBreak.tempura + humanBreak.sashimi + humanBreak.dumpling + humanBreak.nigiri} ` +
        `(Tmp:${humanBreak.tempura} Ssh:${humanBreak.sashimi} Dmp:${humanBreak.dumpling} Nig:${humanBreak.nigiri})`,
      `      Maki: ${humanMakiCount} (bonus ${humanMakiBonus >= 0 ? '+' : ''}${humanMakiBonus})`,
      `      Pudding: ${humanBreak.puddingCount} (bonus ${humanPuddingBonus >= 0 ? '+' : ''}${humanPuddingBonus})`,
      '',
      `AI:   Cards ${aiBreak.tempura + aiBreak.sashimi + aiBreak.dumpling + aiBreak.nigiri} ` +
        `(Tmp:${aiBreak.tempura} Ssh:${aiBreak.sashimi} Dmp:${aiBreak.dumpling} Nig:${aiBreak.nigiri})`,
      `      Maki: ${aiMakiCount} (bonus ${aiMakiBonus >= 0 ? '+' : ''}${aiMakiBonus})`,
      `      Pudding: ${aiBreak.puddingCount} (bonus ${aiPuddingBonus >= 0 ? '+' : ''}${aiPuddingBonus})`,
      '',
      'Round-by-round:',
    ];

    for (let r = 0; r < human.roundScores.length; r++) {
      lines.push(`  R${r + 1}: You ${human.roundScores[r]} -- AI ${ai.roundScores[r]}`);
    }
    lines.push('', `Final: You ${human.totalScore} -- AI ${ai.totalScore}`);

    // Position content relative to the visible overlay box when available
    {
      const box = overlay.box;
      const padding = 24;
      let gTextY: number;
      let gButtonY: number;
      if (box) {
        const boxTop = box.y - (box.height / 2);
        const boxBottom = box.y + (box.height / 2);
        gTextY = boxTop + padding;
        gButtonY = boxBottom - 48;
      } else {
        // fallback to previous absolute positioning
        const overlayHeight = 520;
        const overlayHalf = overlayHeight / 2;
        gTextY = GAME_H / 2 - overlayHalf + 56;
        gButtonY = GAME_H / 2 + overlayHalf - 48;
      }

      const text = this.add
        .text(GAME_W / 2, gTextY, lines.join('\n'), {
          fontSize: '18px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          align: 'center',
          lineSpacing: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(11);
      this.overlayObjects.push(text);

      // Play again button
      const playBtn = createOverlayButton(this, GAME_W / 2 - 80, gButtonY, '[ Play Again ]');
      playBtn.on('pointerdown', () => {
        this.soundManager?.play(SFX_KEYS.UI_CLICK);
        this.scene.restart();
      });
      this.overlayObjects.push(playBtn);

      // Menu button
      const menuBtn = createOverlayMenuButton(this, GAME_W / 2 + 80, gButtonY);
      this.overlayObjects.push(menuBtn);
    }
  }

  // ── Animation ───────────────────────────────────────────

  private animatePickThen(onComplete: () => void): void {
    // Simple brief delay to simulate the pick animation
    // (Sushi Go doesn't move cards between piles like Golf -- cards
    // just appear in the tableau after picking)
    this.time.delayedCall(ANIM_DURATION, () => {
      onComplete();
    });
  }

  // ── Tooltip ──────────────────────────────────────────────

  /**
   * Show a scoring-rule tooltip near the given card container.
   * The tooltip is clamped within the canvas boundaries.
   */
  private showCardTooltip(card: SushiGoCard, cardContainer: Phaser.GameObjects.Container): void {
    if (!this.settingsPanel?.showTooltips) return;
    this.hideCardTooltip();

    const tooltipText = SCORING_TOOLTIPS[card.type];

    // Create tooltip text first to measure it
    const text = this.add.text(0, 0, tooltipText, {
      fontSize: TOOLTIP_FONT_SIZE,
      color: '#ffffff',
      fontFamily: FONT_FAMILY,
      wordWrap: { width: TOOLTIP_MAX_WIDTH - TOOLTIP_PADDING * 2 },
    }).setOrigin(0, 0);

    const textW = text.width;
    const textH = text.height;
    const boxW = textW + TOOLTIP_PADDING * 2;
    const boxH = textH + TOOLTIP_PADDING * 2;

    // Position tooltip below the card, centered horizontally
    let tooltipX = cardContainer.x - boxW / 2;
    let tooltipY = cardContainer.y + 40; // below the card

    // Clamp within canvas bounds
    tooltipX = Phaser.Math.Clamp(tooltipX, 4, GAME_W - boxW - 4);
    tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);

    // If the tooltip would overlap the card, place it above instead
    if (tooltipY < cardContainer.y + 30 && tooltipY + boxH > cardContainer.y - 30) {
      tooltipY = cardContainer.y - 40 - boxH;
      tooltipY = Phaser.Math.Clamp(tooltipY, 4, GAME_H - boxH - 4);
    }

    // Background
    const bg = this.add.rectangle(
      boxW / 2, boxH / 2,
      boxW, boxH,
      TOOLTIP_BG_COLOR, TOOLTIP_BG_ALPHA,
    );
    bg.setStrokeStyle(1, 0x888888);

    // Position text inside the box
    text.setPosition(TOOLTIP_PADDING, TOOLTIP_PADDING);

    // Assemble container
    this.tooltipContainer = this.add.container(tooltipX, tooltipY, [bg, text]);
    this.tooltipContainer.setDepth(TOOLTIP_DEPTH);
  }

  /** Hide the currently visible tooltip, if any. */
  private hideCardTooltip(): void {
    if (this.tooltipContainer) {
      this.tooltipContainer.destroy();
      this.tooltipContainer = null;
    }
  }

  // ── Replay: load board state ─────────────────────────────

  /**
   * Inject a board state snapshot for the replay tool.
   *
   * Called by the replay adapter via `page.evaluate()`.
   * Updates all visual elements to reflect the given state,
   * then emits `state-settled` so the replay tool can take a
   * screenshot.
   *
   * Only available when `?mode=replay` is in the URL.
   */
  public loadBoardState(state: {
    players: PlayerSnapshot[];
    currentRound: number;
    currentTurn: number;
    cardsPerPlayer: number;
    stepIndex?: number;
  }): void {
    if (!this.replayMode) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    // Build a minimal session object for the rendering helpers
    // (they read from this.session to display scores, tableaux, etc.)
    const playerStates = state.players.map((p) => ({
      name: p.name,
      isAI: p.isAI,
      hand: p.hand.map((c) => this.rehydrateCard(c)),
      tableau: p.tableau.map((c) => this.rehydrateCard(c)),
      puddingCount: p.puddingCount,
      roundScores: [...p.roundScores],
      totalScore: p.totalScore,
    }));

    this.session = {
      players: playerStates,
      phase: 'picking',
      currentRound: state.currentRound,
      currentTurn: state.currentTurn,
      cardsPerPlayer: state.cardsPerPlayer,
      totalRounds: 3,
      rng: Math.random,
    } as SushiGoSession;

    // Update all visuals
    this.refreshAll();

    // Track replay step for state-settled payload
    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    // Signal board is visually stable
    this.emitStateSettled();
  }

  /**
   * Rehydrate a card snapshot into a SushiGoCard-compatible object.
   *
   * The snapshot is a plain JSON object with `id`, `type`, and optional
   * type-specific fields. We cast it back to the discriminated union
   * shape so rendering helpers can use `card.type` discriminators.
   */
  private rehydrateCard(snap: SushiGoCardSnapshot): SushiGoCard {
    const base = { id: snap.id, type: snap.type };
    if (snap.type === 'maki' && snap.icons !== undefined) {
      return { ...base, type: 'maki', icons: snap.icons } as SushiGoCard;
    }
    if (snap.type === 'nigiri' && snap.variant !== undefined) {
      return { ...base, type: 'nigiri', variant: snap.variant } as unknown as SushiGoCard;
    }
    return base as SushiGoCard;
  }

  // ── Transcript persistence ──────────────────────────────

  /**
   * Auto-save a finalized transcript to browser storage.
   * Fires and forgets -- errors are logged but do not disrupt gameplay.
   */
  private autoSaveTranscript(transcript: import('../GameTranscript').SushiGoTranscript): void {
    transcriptStore.save('sushi-go', transcript).then(
      (stored) => {
        if (stored) {
          console.info(
            `[SushiGoScene] Transcript saved (${stored.id}) via ${stored.gameType}`,
          );
        } else {
          console.warn('[SushiGoScene] Transcript not saved -- no storage backend available');
        }
      },
      (err) => {
        console.error('[SushiGoScene] Failed to auto-save transcript:', err);
      },
    );
  }

  // ── State-settled emission ──────────────────────────────

  /**
   * Emit state-settled when the board is visually stable and safe
   * to screenshot. Uses the replay step index as the turn number.
   */
  private emitStateSettled(): void {
    this.gameEvents.emit('state-settled', {
      turnNumber: this.replayStepIndex,
      phase: 'playing' as const,
    });
  }

  // ── Help / Settings cleanup ────────────────────────────

  shutdown(): void {
    this.hideCardTooltip();
    this.soundManager?.destroy();
    this.soundManager = null;
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.helpPanel?.destroy();
    this.helpButton?.destroy();
    this.settingsPanel?.destroy();
    this.settingsButton?.destroy();
    if (this.chopsticksButton) {
      this.chopsticksButton.destroy();
      this.chopsticksButton = null;
    }
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }
}
