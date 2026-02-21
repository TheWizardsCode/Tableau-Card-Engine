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
import type { SushiGoSession, RoundResult, PickAction } from '../SushiGoGame';
import {
  setupSushiGoGame,
  executeAllPicks,
  scoreRound,
  isGameOver,
  getWinnerIndex,
} from '../SushiGoGame';
import { SushiGoAiPlayer, GreedyStrategy } from '../AiStrategy';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  HelpPanel, HelpButton,
  SettingsPanel, SettingsButton,
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
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
const TABLEAU_CARD_W = 72;      // card rect width in tableau
const TABLEAU_CARD_H = 48;      // card rect height in tableau
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

export class SushiGoScene extends Phaser.Scene {
  // Game state
  private session!: SushiGoSession;
  private aiPlayer!: SushiGoAiPlayer;
  private turnPhase: TurnPhase = 'picking';
  private pendingHumanPick: number | null = null;

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
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a3a');

    // Reset state
    this.turnPhase = 'picking';
    this.pendingHumanPick = null;
    this.overlayObjects = [];

    // Event system
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);

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
    this.setPhase('picking');
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
    this.roundText = this.add
      .text(GAME_W / 2, 87, '', {
        fontSize: '20px',
        color: '#ffdd44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.turnText = this.add
      .text(GAME_W / 2, 111, '', {
        fontSize: '16px',
        color: '#aaccaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);

    this.cardsLeftText = this.add
      .text(GAME_W / 2, 131, '', {
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

    const label = this.add.text(0, 0, labelText, {
      fontSize,
      color: style.text,
      fontFamily: FONT_FAMILY,
      align: 'center',
      wordWrap: { width: w - 6 },
    }).setOrigin(0.5);
    container.add(label);

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

  // ── Refresh display ─────────────────────────────────────

  private refreshAll(): void {
    this.hideCardTooltip();
    this.refreshHand();
    this.refreshTableau('player');
    this.refreshTableau('ai');
    this.refreshScores();
    this.refreshRoundInfo();
  }

  private refreshHand(): void {
    this.handContainer.removeAll(true);

    const hand = this.session.players[0].hand;
    if (hand.length === 0) return;

    const totalW = hand.length * HAND_CARD_W + (hand.length - 1) * HAND_GAP;
    const startX = (GAME_W - totalW) / 2 + HAND_CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * (HAND_CARD_W + HAND_GAP);
      const cardContainer = this.createCardRect(
        x, HAND_Y, HAND_CARD_W, HAND_CARD_H,
        hand[i],
        this.turnPhase === 'picking',
        i,
      );
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

    // Group cards by type
    const groups = this.groupByType(tableau);
    const typeOrder: SushiGoCardType[] = [
      'maki', 'tempura', 'sashimi', 'dumpling',
      'nigiri', 'wasabi', 'pudding', 'chopsticks',
    ];

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
      const cards = groups.get(type);
      if (!cards || cards.length === 0) continue;

      // Type label above the group
      const groupW = cards.length * (TABLEAU_CARD_W + TABLEAU_CARD_GAP) - TABLEAU_CARD_GAP;
      const typeLabel = this.add.text(
        curX + groupW / 2,
        baseY - TABLEAU_CARD_H / 2 - 16,
        this.getTypeGroupLabel(type, cards),
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
    for (const card of tableau) {
      const existing = groups.get(card.type);
      if (existing) {
        existing.push(card);
      } else {
        groups.set(card.type, [card]);
      }
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

  // ── Phase management ────────────────────────────────────

  private setPhase(phase: TurnPhase): void {
    this.turnPhase = phase;

    switch (phase) {
      case 'picking':
        this.instructionText.setText('Click a card from your hand to pick it');
        this.refreshHand(); // re-enable interactivity
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'ai-thinking':
        this.instructionText.setText('AI is thinking...');
        break;
      case 'round-scored':
        this.instructionText.setText('');
        break;
      case 'game-over':
        this.instructionText.setText('');
        break;
    }
  }

  // ── Human input ─────────────────────────────────────────

  private onHandCardClick(handIndex: number): void {
    if (this.turnPhase !== 'picking') return;

    this.pendingHumanPick = handIndex;
    // Play card-pick sound directly (Sushi Go drafts from hand,
    // which doesn't match the stock/discard source of 'card-drawn')
    this.soundManager?.play(SFX_KEYS.CARD_PICK);

    this.executeTurn();
  }

  // ── Turn execution ──────────────────────────────────────

  private executeTurn(): void {
    if (this.pendingHumanPick === null) return;

    this.setPhase('animating');

    const humanPick: PickAction = { cardIndex: this.pendingHumanPick };

    // AI picks simultaneously
    const aiPick = this.aiPlayer.choosePick(this.session.players[1]);

    // Execute both picks
    executeAllPicks(this.session, [humanPick, aiPick]);

    this.pendingHumanPick = null;

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
        this.setPhase('picking');
      }
    });
  }

  // ── Round scoring ───────────────────────────────────────

  private handleRoundScoring(): void {
    this.soundManager?.play(SFX_KEYS.ROUND_END);

    const result = scoreRound(this.session);

    this.refreshScores();

    if (isGameOver(this.session)) {
      this.showGameOverOverlay(result);
    } else {
      this.showRoundScoreOverlay(result);
    }
  }

  private showRoundScoreOverlay(result: RoundResult): void {
    this.setPhase('round-scored');
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    // Create overlay
    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 500, height: 330, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const roundNum = result.round + 1;

    const lines = [
      `Round ${roundNum} Complete!`,
      '',
      `You: ${result.roundScores[0]} pts`,
      `  (Cards: ${result.tableauScores[0]}, Maki: ${result.makiBonuses[0]})`,
      `AI: ${result.roundScores[1]} pts`,
      `  (Cards: ${result.tableauScores[1]}, Maki: ${result.makiBonuses[1]})`,
      '',
      `Total -- You: ${this.session.players[0].totalScore}  AI: ${this.session.players[1].totalScore}`,
    ];

    const text = this.add
      .text(GAME_W / 2, GAME_H / 2 - 35, lines.join('\n'), {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.overlayObjects.push(text);

    // Next round button
    const btn = createOverlayButton(
      this, GAME_W / 2, GAME_H / 2 + 125, '[ Next Round ]',
    );
    btn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.dismissOverlay();
      this.refreshAll();
      this.setPhase('picking');
    });
    this.overlayObjects.push(btn);
  }

  private showGameOverOverlay(result: RoundResult): void {
    this.setPhase('game-over');
    this.soundManager?.play(SFX_KEYS.SCORE_REVEAL);

    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.session.currentTurn,
      winnerIndex: getWinnerIndex(this.session),
    });

    const overlay = createOverlayBackground(
      this,
      { depth: 10, alpha: 0.01 },
      { width: 540, height: 410, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const winnerIdx = getWinnerIndex(this.session);
    const winnerText = winnerIdx === 0 ? 'You Win!' : 'AI Wins!';

    const human = this.session.players[0];
    const ai = this.session.players[1];

    const lines = [
      winnerText,
      '',
      `Final Round -- You: ${result.roundScores[0]}, AI: ${result.roundScores[1]}`,
    ];

    if (result.puddingBonuses) {
      lines.push(
        `Pudding -- You: ${result.puddingBonuses[0] >= 0 ? '+' : ''}${result.puddingBonuses[0]}, ` +
        `AI: ${result.puddingBonuses[1] >= 0 ? '+' : ''}${result.puddingBonuses[1]}`,
      );
    }

    lines.push(
      '',
      'Round-by-round:',
    );
    for (let r = 0; r < human.roundScores.length; r++) {
      lines.push(`  R${r + 1}: You ${human.roundScores[r]} -- AI ${ai.roundScores[r]}`);
    }
    lines.push(
      '',
      `Final: You ${human.totalScore} -- AI ${ai.totalScore}`,
    );

    const text = this.add
      .text(GAME_W / 2, GAME_H / 2 - 50, lines.join('\n'), {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(11);
    this.overlayObjects.push(text);

    // Play again button
    const playBtn = createOverlayButton(
      this, GAME_W / 2 - 80, GAME_H / 2 + 160, '[ Play Again ]',
    );
    playBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.scene.restart();
    });
    this.overlayObjects.push(playBtn);

    // Menu button
    const menuBtn = createOverlayMenuButton(this, GAME_W / 2 + 80, GAME_H / 2 + 160);
    this.overlayObjects.push(menuBtn);
  }

  private dismissOverlay(): void {
    for (const obj of this.overlayObjects) {
      obj.destroy();
    }
    this.overlayObjects = [];
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
    this.dismissOverlay();
  }
}
