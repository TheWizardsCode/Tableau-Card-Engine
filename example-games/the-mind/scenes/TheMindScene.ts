/**
 * TheMindScene -- the main Phaser scene for The Mind.
 *
 * Implements the full visual interface for a cooperative card game where
 * a human and an AI play numbered cards (1-100) onto a shared ascending
 * pile without taking turns. Either player can play at any time; the AI
 * uses timer-based delays computed by MindAiPlayer.
 *
 * Layout (1280x720):
 *   - Top: scene header (title + Menu button)
 *   - Top-right: level indicator + lives display
 *   - Center: shared pile (last played card + count)
 *   - Bottom: human's hand (face-up, sorted, clickable)
 *   - Top-center: AI's hand (face-down cards + count)
 *   - Overlays for level complete, win, loss
 */

import type { MindCard } from '../MindCard';
import type { PlayResult, PlayerId, TheMindSession } from '../TheMindGameState';
import {
  setupTheMindGame,
  playCard,
  isGameOver,
  getPileTopValue,
  MAX_LEVEL,
} from '../TheMindGameState';
import { MindAiPlayer, computeEffectiveDelay } from '../AiStrategy';
import {
  preloadMindCardAssets,
  getMindCardTexture,
} from '../MindCardRenderer';
import { CARD_BACK_KEY } from '../MindCard';
import { MindTranscriptRecorder } from '../GameTranscript';
import type { MindInitialState } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  CardGameScene,
  createOverlayBackground,
  createOverlayButton,
  dismissOverlay,
  createSceneHeader,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

// ── Audio asset keys ────────────────────────────────────────
const SFX_KEYS = {
  CARD_PLAY: 'mind-sfx-card-play',
  LIFE_LOST: 'mind-sfx-life-lost',
  LEVEL_COMPLETE: 'mind-sfx-level-complete',
  GAME_WIN: 'mind-sfx-game-win',
  GAME_LOST: 'mind-sfx-game-lost',
  UI_CLICK: 'mind-sfx-ui-click',
} as const;

// ── Constants ───────────────────────────────────────────────

// Card display dimensions (~50% larger than default for readability)
const CARD_W = 120;
const CARD_H = 164;

// Layout
const PILE_X = GAME_W / 2;
const PILE_Y = GAME_H / 2 - 10;

const HUMAN_HAND_Y = GAME_H - 110;
const AI_HAND_Y = 150;

const CARD_GAP = 8;
const MAX_HAND_WIDTH = GAME_W - 80; // leave 40px margin each side

// Timing
const LEVEL_COMPLETE_DELAY = 2000;
const PENALTY_REVEAL_DELAY = 1000;
const ANIM_DURATION = 250;
const PRE_PENALTY_PAUSE = 800;

// Depths
const DEPTH_CARDS = 1;
const DEPTH_PILE = 2;
const DEPTH_PLAYED_CARD = 3;
const DEPTH_UI = 5;
const DEPTH_OVERLAY = 2000;
const DEPTH_OVERLAY_CONTENT = DEPTH_OVERLAY + 1;

// ── Phase state machine ─────────────────────────────────────

type GamePhase =
  | 'dealing'
  | 'playing'
  | 'animating'
  | 'penalty'
  | 'level-complete'
  | 'game-won'
  | 'game-lost';

// ── Scene ───────────────────────────────────────────────────

export class TheMindScene extends CardGameScene {
  // Game state
  private session!: TheMindSession;
  private aiPlayer!: MindAiPlayer;
  private recorder!: MindTranscriptRecorder;
  private phase: GamePhase = 'dealing';
  private levelStartTime = 0;
  private turnCounter = 0;

  // AI scheduling
  private aiTimer: Phaser.Time.TimerEvent | null = null;
  private aiLevelStartTime = 0;

  // Auto-play spectator mode
  private autoPlayEnabled = false;
  private humanAiPlayer!: MindAiPlayer;
  private humanAiTimer: Phaser.Time.TimerEvent | null = null;
  private autoPlayButton!: Phaser.GameObjects.Text;

  // Replay mode
  private replayStepIndex = 0;

  // Display objects -- human hand
  private humanCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- AI hand
  private aiCardSprites: Phaser.GameObjects.Image[] = [];
  private aiCountText: Phaser.GameObjects.Text | null = null;

  // Display objects -- pile
  private pileSprite!: Phaser.GameObjects.Image;
  private pileCountText!: Phaser.GameObjects.Text;
  private pileValueText!: Phaser.GameObjects.Text;

  // Display objects -- UI
  private levelText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  // Overlay tracking
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'TheMindScene' });
  }

  // ── Preload ─────────────────────────────────────────────

  preload(): void {
    preloadMindCardAssets(this, CARD_W, CARD_H);

    // Load zen/pulse-themed sound effects
    this.load.audio(SFX_KEYS.CARD_PLAY, 'assets/audio/the-mind/card-play.wav');
    this.load.audio(SFX_KEYS.LIFE_LOST, 'assets/audio/the-mind/life-lost.wav');
    this.load.audio(SFX_KEYS.LEVEL_COMPLETE, 'assets/audio/the-mind/level-complete.wav');
    this.load.audio(SFX_KEYS.GAME_WIN, 'assets/audio/the-mind/game-win.wav');
    this.load.audio(SFX_KEYS.GAME_LOST, 'assets/audio/the-mind/game-lost.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/the-mind/ui-click.wav');
  }

  // ── Create ──────────────────────────────────────────────

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Register shutdown lifecycle so custom cleanup runs on scene.restart()
    this.events.on('shutdown', this.shutdown, this);

    // Reset state for scene restart (clear stale refs from previous run;
    // Phaser destroys game objects on restart but class fields survive).
    this.phase = 'dealing';
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.overlayObjects = [];
    this.aiTimer = null;
    this.humanAiTimer = null;
    this.turnCounter = 0;
    this.aiCountText = null;

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.autoPlayEnabled = urlParams.get('autoplay') === 'true';
    this.detectReplayMode();

    // Event system
    this.initEventSystem();

    if (this.replayMode) {
      // In replay mode: create minimal UI, skip game setup.
      // The replay tool will call loadBoardState() to inject state.
      this.createHeader();
      this.createStatusDisplay();
      this.createPile();
      this.createInstruction();
      this.instructionText.setText('');

      // Set default status display for replay mode
      this.levelText.setText('Level 1 / 8');
      this.livesText.setText('Lives: \u2764\u2764');

      // Emit state-settled so the replay tool knows the scene is ready
      this.emitStateSettled(this.replayStepIndex, 'playing');
      return;
    }

    // Sound system
    this.createSoundSystem();

    // Setup game
    this.session = setupTheMindGame();
    this.aiPlayer = new MindAiPlayer();
    this.humanAiPlayer = new MindAiPlayer();

    // Create transcript recorder
    this.recorder = this.createRecorder();

    // Create UI
    this.createHeader();
    this.createStatusDisplay();
    this.createPile();
    this.createInstruction();
    this.createAutoPlayButton();
    this.initHelpPanel(helpContent as HelpSection[]);

    // Initial render
    this.renderHumanHand();
    this.renderAiHand();
    this.refreshStatus();
    this.refreshPile();

    // Start playing
    this.startLevel();
  }

  // ── Header & Status ────────────────────────────────────

  private createHeader(): void {
    createSceneHeader(this, 'The Mind');
  }

  private createStatusDisplay(): void {
    // Level indicator (top-right area, below settings/help buttons)
    this.levelText = this.add
      .text(GAME_W - 100, 55, '', {
        fontSize: '16px',
        color: '#aaccff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);

    // Lives display (below level)
    this.livesText = this.add
      .text(GAME_W - 100, 79, '', {
        fontSize: '16px',
        color: '#ff6666',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);
  }

  private createPile(): void {
    // Pile card sprite (center of screen)
    this.pileSprite = this.add
      .image(PILE_X, PILE_Y, CARD_BACK_KEY)
      .setDisplaySize(CARD_W, CARD_H)
      .setDepth(DEPTH_PILE)
      .setAlpha(0.3);

    // Pile label
    this.add
      .text(PILE_X, PILE_Y - CARD_H / 2 - 18, 'PILE', {
        fontSize: '12px',
        color: '#888888',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    // Pile value text (shows the top card value)
    this.pileValueText = this.add
      .text(PILE_X, PILE_Y + CARD_H / 2 + 14, '', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    // Pile count text
    this.pileCountText = this.add
      .text(PILE_X, PILE_Y + CARD_H / 2 + 32, '', {
        fontSize: '11px',
        color: '#888888',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  private createInstruction(): void {
    this.instructionText = this.add
      .text(GAME_W / 2, GAME_H - 20, '', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  // ── Sound system ────────────────────────────────────────

  private createSoundSystem(): void {
    const mapping: EventSoundMapping = {
      'game-ended': SFX_KEYS.UI_CLICK,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping);
    this.initSettingsPanel();
  }

  // ── Auto-play spectator mode ───────────────────────────

  private createAutoPlayButton(): void {
    const label = this.autoPlayEnabled ? '[ Auto-Play: ON ]' : '[ Auto-Play: OFF ]';
    this.autoPlayButton = this.add
      .text(20, GAME_H - 20, label, {
        fontSize: '12px',
        color: this.autoPlayEnabled ? '#88ff88' : '#888888',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 1)
      .setDepth(DEPTH_UI)
      .setInteractive({ useHandCursor: true });

    this.autoPlayButton.on('pointerdown', () => this.toggleAutoPlay());
    this.autoPlayButton.on('pointerover', () =>
      this.autoPlayButton.setColor('#ffffff'),
    );
    this.autoPlayButton.on('pointerout', () =>
      this.autoPlayButton.setColor(
        this.autoPlayEnabled ? '#88ff88' : '#888888',
      ),
    );
  }

  private toggleAutoPlay(): void {
    this.autoPlayEnabled = !this.autoPlayEnabled;

    // Play UI click sound
    this.soundManager?.play(SFX_KEYS.UI_CLICK);

    // Update button appearance
    this.autoPlayButton.setText(
      this.autoPlayEnabled ? '[ Auto-Play: ON ]' : '[ Auto-Play: OFF ]',
    );
    this.autoPlayButton.setColor(
      this.autoPlayEnabled ? '#88ff88' : '#888888',
    );

    if (this.autoPlayEnabled) {
      // Enabling: commit human AI delays for current hand and schedule
      this.humanAiPlayer.commitLevel(this.session.players[0].hand);
      this.instructionText.setText('Spectator mode — watching AI play');
      if (this.phase === 'playing') {
        this.scheduleHumanAiPlay();
      }
    } else {
      // Disabling: cancel human AI timer
      this.cancelHumanAiTimer();
      if (this.phase === 'playing') {
        this.instructionText.setText(
          'Click a card to play it onto the pile',
        );
      }
    }

    this.gameEvents.emit('ui-interaction', {
      elementId: 'auto-play-toggle',
      action: this.autoPlayEnabled ? 'enabled' : 'disabled',
    });
  }

  private scheduleHumanAiPlay(): void {
    this.cancelHumanAiTimer();
    if (!this.autoPlayEnabled) return;

    const nextCard = this.humanAiPlayer.getNextCard();
    if (!nextCard) return;

    const elapsed = Date.now() - this.aiLevelStartTime;
    const delay = computeEffectiveDelay(
      nextCard.delay,
      elapsed,
      this.session.players[0].hand.length, // human-AI (this player)
      this.session.players[1].hand.length, // AI (opponent)
      nextCard.card.value,
      getPileTopValue(this.session),
    );

    this.humanAiTimer = this.time.delayedCall(delay, () => {
      if (this.phase !== 'playing') return;
      this.performPlay(0, nextCard.card.value);
    });
  }

  private cancelHumanAiTimer(): void {
    if (this.humanAiTimer) {
      this.humanAiTimer.destroy();
      this.humanAiTimer = null;
    }
  }

  // ── Status refresh ─────────────────────────────────────

  private refreshStatus(): void {
    this.levelText.setText(
      `Level ${this.session.currentLevel} / ${MAX_LEVEL}`,
    );

    // Hearts for lives
    const hearts = '\u2764'.repeat(this.session.lives);
    this.livesText.setText(`Lives: ${hearts}`);
  }

  private refreshPile(): void {
    const topValue = getPileTopValue(this.session);
    const pileSize = this.session.pile.size();

    if (pileSize > 0) {
      const topCard = this.session.pile.peek()!;
      this.pileSprite.setTexture(getMindCardTexture(topCard));
      this.pileSprite.setAlpha(1);
      this.pileValueText.setText(`${topValue}`);
    } else {
      this.pileSprite.setTexture(CARD_BACK_KEY);
      this.pileSprite.setAlpha(0.3);
      this.pileValueText.setText('Empty');
    }

    this.pileCountText.setText(
      pileSize > 0 ? `${pileSize} card${pileSize !== 1 ? 's' : ''}` : '',
    );
  }

  // ── Human hand rendering ───────────────────────────────

  private renderHumanHand(): void {
    // Destroy old sprites
    for (const sprite of this.humanCardSprites) {
      sprite.destroy();
    }
    this.humanCardSprites = [];

    const hand = this.session.players[0].hand;
    if (hand.length === 0) return;

    // Dynamic spacing: overlap cards if they exceed MAX_HAND_WIDTH
    const idealWidth = hand.length * CARD_W + (hand.length - 1) * CARD_GAP;
    const step = idealWidth <= MAX_HAND_WIDTH
      ? CARD_W + CARD_GAP
      : (MAX_HAND_WIDTH - CARD_W) / (hand.length - 1 || 1);
    const actualWidth = hand.length === 1
      ? CARD_W
      : CARD_W + (hand.length - 1) * step;
    const startX = (GAME_W - actualWidth) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      // Human cards are always face-up
      const displayCard = { ...card, faceUp: true };
      const x = startX + i * step;
      const sprite = this.add
        .image(x, HUMAN_HAND_Y, getMindCardTexture(displayCard))
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i) // later cards render on top when overlapping
        .setInteractive({ useHandCursor: true });

      // Click handler
      sprite.on('pointerdown', () => this.onHumanCardClick(card));

      // Hover effects
      sprite.on('pointerover', () => {
        if (this.phase === 'playing') {
          sprite.setScale(1.08);
          sprite.setY(HUMAN_HAND_Y - 6);
        }
      });
      sprite.on('pointerout', () => {
        sprite.setScale(1);
        sprite.setY(HUMAN_HAND_Y);
      });

      this.humanCardSprites.push(sprite);
    }

    // Label
    this.add
      .text(GAME_W / 2, HUMAN_HAND_Y - CARD_H / 2 - 14, 'Your Hand', {
        fontSize: '12px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  private refreshHumanHand(): void {
    const hand = this.session.players[0].hand;

    // If card count changed, re-render entirely
    if (hand.length !== this.humanCardSprites.length) {
      this.renderHumanHand();
      return;
    }

    // Otherwise just update textures
    for (let i = 0; i < hand.length; i++) {
      const displayCard = { ...hand[i], faceUp: true };
      this.humanCardSprites[i].setTexture(getMindCardTexture(displayCard));
    }
  }

  // ── AI hand rendering ──────────────────────────────────

  private renderAiHand(): void {
    // Destroy old sprites
    for (const sprite of this.aiCardSprites) {
      sprite.destroy();
    }
    this.aiCardSprites = [];

    const hand = this.session.players[1].hand;
    if (hand.length === 0) {
      if (this.aiCountText) this.aiCountText.setText('');
      return;
    }

    // Dynamic spacing: overlap cards if they exceed MAX_HAND_WIDTH
    const idealWidth = hand.length * CARD_W + (hand.length - 1) * CARD_GAP;
    const step = idealWidth <= MAX_HAND_WIDTH
      ? CARD_W + CARD_GAP
      : (MAX_HAND_WIDTH - CARD_W) / (hand.length - 1 || 1);
    const actualWidth = hand.length === 1
      ? CARD_W
      : CARD_W + (hand.length - 1) * step;
    const startX = (GAME_W - actualWidth) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * step;
      const sprite = this.add
        .image(x, AI_HAND_Y, CARD_BACK_KEY)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i); // later cards render on top when overlapping

      this.aiCardSprites.push(sprite);
    }

    // Count indicator — always recreate (previous instance is destroyed on
    // scene restart, leaving a stale reference).
    if (this.aiCountText) {
      this.aiCountText.destroy();
    }
    this.aiCountText = this.add
      .text(GAME_W / 2, AI_HAND_Y + CARD_H / 2 + 14, '', {
        fontSize: '12px',
        color: '#aaaaaa',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);

    this.aiCountText.setText(
      `AI: ${hand.length} card${hand.length !== 1 ? 's' : ''}`,
    );

    // Label
    this.add
      .text(GAME_W / 2, AI_HAND_Y - CARD_H / 2 - 14, 'AI Hand', {
        fontSize: '12px',
        color: '#ffaa44',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  private refreshAiHand(): void {
    const hand = this.session.players[1].hand;

    if (hand.length !== this.aiCardSprites.length) {
      this.renderAiHand();
      return;
    }

    if (this.aiCountText) {
      this.aiCountText.setText(
        hand.length > 0
          ? `AI: ${hand.length} card${hand.length !== 1 ? 's' : ''}`
          : '',
      );
    }
  }

  // ── Level lifecycle ────────────────────────────────────

  private startLevel(): void {
    this.levelStartTime = Date.now();
    this.aiLevelStartTime = Date.now();

    // Commit AI delays for this level
    this.aiPlayer.commitLevel(this.session.players[1].hand);

    // If auto-play is active, commit human AI delays too
    if (this.autoPlayEnabled) {
      this.humanAiPlayer.commitLevel(this.session.players[0].hand);
    }

    this.setPhase('playing');
    this.scheduleAiPlay();

    if (this.autoPlayEnabled) {
      this.scheduleHumanAiPlay();
    }
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;

    switch (phase) {
      case 'playing':
        this.instructionText.setText(
          this.autoPlayEnabled
            ? 'Spectator mode \u2014 watching AI play'
            : 'Click a card to play it onto the pile',
        );
        break;
      case 'animating':
        this.instructionText.setText('');
        break;
      case 'penalty':
        this.instructionText.setText('Penalty! A life was lost...');
        break;
      case 'level-complete':
        this.instructionText.setText('');
        break;
      case 'game-won':
        this.instructionText.setText('');
        break;
      case 'game-lost':
        this.instructionText.setText('');
        break;
      default:
        this.instructionText.setText('');
    }
  }

  // ── Human input ────────────────────────────────────────

  private onHumanCardClick(card: MindCard): void {
    if (this.phase !== 'playing') return;
    if (this.autoPlayEnabled) return; // Auto-play: ignore manual clicks

    this.performPlay(0, card.value);
  }

  // ── Card play logic ────────────────────────────────────

  private performPlay(playerId: PlayerId, cardValue: number): void {
    const timestamp = Date.now() - this.levelStartTime;
    const result = playCard(this.session, playerId, cardValue);

    if (!result.success) {
      // Invalid play: shake feedback for human (only in manual mode)
      if (playerId === 0 && !this.autoPlayEnabled) {
        this.showInvalidPlayFeedback(cardValue);
      }
      return;
    }

    this.turnCounter++;

    // Play card sound
    this.soundManager?.play(SFX_KEYS.CARD_PLAY);

    // Record card play in transcript
    this.recorder.recordCardPlay(
      timestamp,
      playerId,
      cardValue,
      getPileTopValue(this.session),
      this.session.pile.size(),
    );

    // Remove from both AI committed delays
    this.aiPlayer.removeCard(cardValue);
    if (this.autoPlayEnabled) {
      this.humanAiPlayer.removeCard(cardValue);
    }

    // Handle penalty
    if (result.lifeLost) {
      this.cancelAiTimer();
      this.cancelHumanAiTimer();
      this.setPhase('penalty');

      // Play life-lost warning sound
      this.soundManager?.play(SFX_KEYS.LIFE_LOST);

      // Record penalty in transcript
      this.recorder.recordPenalty(
        timestamp,
        this.session.lives,
        result.penaltyCards.map((p) => ({
          playerId: p.playerId,
          cardValue: p.card.value,
        })),
      );

      // Remove penalty cards from both AI players
      for (const pc of result.penaltyCards) {
        this.aiPlayer.removeCard(pc.card.value);
        if (this.autoPlayEnabled) {
          this.humanAiPlayer.removeCard(pc.card.value);
        }
      }

      // Flash lives display
      this.flashLives();

      // First animate the played card to the pile so the player can see
      // what was played, then pause before showing the penalty cards.
      this.animateCardTowardsPile(playerId, cardValue, () => {
        this.refreshAll();

        // Pause so the played card is visible on the pile before penalty
        this.time.delayedCall(PRE_PENALTY_PAUSE, () => {
          // Briefly reveal penalty cards, then discard
          this.showPenaltyCards(result, () => {
            this.refreshAll();

            // Check for game loss
            if (isGameOver(this.session)) {
              this.handleGameOver();
              return;
            }

            // Check for level completion (penalty may have cleared remaining cards)
            if (result.levelComplete) {
              this.handleLevelComplete(result, timestamp);
              return;
            }

            // Resume playing
            this.setPhase('playing');
            this.scheduleAiPlay();
            if (this.autoPlayEnabled) {
              this.scheduleHumanAiPlay();
            }
          });
        });
      });
      return;
    }

    // No penalty -- update visuals
    this.setPhase('animating');
    this.animateCardTowardsPile(playerId, cardValue, () => {
      this.refreshAll();

      // Check for level completion
      if (result.levelComplete) {
        this.handleLevelComplete(result, timestamp);
        return;
      }

      // Resume playing
      this.setPhase('playing');
      this.rescheduleAiIfNeeded();
      this.rescheduleHumanAiIfNeeded();
    });
  }

  // ── Penalty display ────────────────────────────────────

  private showPenaltyCards(result: PlayResult, onComplete: () => void): void {
    // For each penalty card, briefly show it face-up in its hand position
    const penaltySprites: Phaser.GameObjects.Image[] = [];

    for (const { playerId, card } of result.penaltyCards) {
      const displayCard = { ...card, faceUp: true };
      const y = playerId === 0 ? HUMAN_HAND_Y : AI_HAND_Y;

      // Show near the pile for visibility
      const offsetX = penaltySprites.length * (CARD_W * 0.6);
      const x = PILE_X - ((result.penaltyCards.length - 1) * CARD_W * 0.6) / 2 + offsetX;

      const sprite = this.add
        .image(x, y, getMindCardTexture(displayCard))
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_PLAYED_CARD + 1)
        .setTint(0xff4444);

      penaltySprites.push(sprite);

      // Animate towards center then fade out
      this.tweens.add({
        targets: sprite,
        y: PILE_Y,
        alpha: 0.8,
        duration: ANIM_DURATION,
      });
    }

    // After reveal delay, clean up and continue
    this.time.delayedCall(PENALTY_REVEAL_DELAY, () => {
      // Fade out penalty sprites
      for (const sprite of penaltySprites) {
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: ANIM_DURATION,
          onComplete: () => sprite.destroy(),
        });
      }

      this.time.delayedCall(ANIM_DURATION + 50, () => {
        onComplete();
      });
    });
  }

  private flashLives(): void {
    // Flash the lives text red/white a few times
    let flashes = 0;
    const flashTimer = this.time.addEvent({
      delay: 150,
      repeat: 5,
      callback: () => {
        flashes++;
        this.livesText.setColor(flashes % 2 === 0 ? '#ff6666' : '#ffffff');
      },
    });

    // Ensure we end on the default color
    this.time.delayedCall(150 * 6 + 50, () => {
      flashTimer.destroy();
      this.livesText.setColor('#ff6666');
    });
  }

  // ── Invalid move feedback ──────────────────────────────

  private showInvalidPlayFeedback(cardValue: number): void {
    // Find the sprite for this card
    const hand = this.session.players[0].hand;
    const idx = hand.findIndex((c) => c.value === cardValue);
    if (idx === -1 || idx >= this.humanCardSprites.length) return;

    const sprite = this.humanCardSprites[idx];
    const originalX = sprite.x;

    // Red tint + shake
    sprite.setTint(0xff4444);
    this.tweens.add({
      targets: sprite,
      x: originalX - 5,
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        sprite.clearTint();
        sprite.setX(originalX);
      },
    });
  }

  // ── Card animation ─────────────────────────────────────

  /**
   * Animate a played card from its hand position to the central pile.
   *
   * For human plays the matching sprite is identified by position and
   * tweened directly. For AI plays a temporary sprite is created
   * (starting face-down) which flips face-up halfway through the
   * flight.
   */
  private animateCardTowardsPile(
    playerId: PlayerId,
    cardValue: number,
    onComplete: () => void,
  ): void {
    // The card has already been removed from game-state by playCard(),
    // but the hand sprites still reflect the *previous* state until
    // refreshAll() is called in the callback.

    if (playerId === 0) {
      // ── Human card ────────────────────────────────────
      // Find the sprite whose texture matches the played card value.
      const displayCard: MindCard = { value: cardValue, faceUp: true };
      const targetTex = getMindCardTexture(displayCard);
      let sprite: Phaser.GameObjects.Image | undefined;
      let spriteIdx = -1;

      for (let i = 0; i < this.humanCardSprites.length; i++) {
        if (this.humanCardSprites[i].texture.key === targetTex) {
          sprite = this.humanCardSprites[i];
          spriteIdx = i;
          break;
        }
      }

      if (!sprite) {
        // Fallback: if sprite not found, use the simple delay path
        this.time.delayedCall(ANIM_DURATION, onComplete);
        return;
      }

      // Remove from array so refreshAll() won't destroy it mid-tween
      this.humanCardSprites.splice(spriteIdx, 1);

      sprite.disableInteractive();
      sprite.setDepth(DEPTH_PLAYED_CARD);

      this.tweens.add({
        targets: sprite,
        x: PILE_X,
        y: PILE_Y,
        duration: ANIM_DURATION,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          sprite!.destroy();
          onComplete();
        },
      });
    } else {
      // ── AI card ───────────────────────────────────────
      // Find the rightmost AI hand sprite (AI always plays its lowest
      // card which is first in the sorted hand, but visually any
      // face-down card works — pick the last sprite).
      let sourceX = PILE_X;
      let sourceY = AI_HAND_Y;

      if (this.aiCardSprites.length > 0) {
        const lastIdx = this.aiCardSprites.length - 1;
        const srcSprite = this.aiCardSprites[lastIdx];
        sourceX = srcSprite.x;
        sourceY = srcSprite.y;

        // Remove it so refreshAll() won't destroy it
        this.aiCardSprites.splice(lastIdx, 1);
        srcSprite.destroy();
      }

      // Create a temporary card sprite starting face-down
      const tempSprite = this.add
        .image(sourceX, sourceY, CARD_BACK_KEY)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_PLAYED_CARD);

      const faceUpTex = getMindCardTexture({ value: cardValue, faceUp: true });
      const halfDuration = ANIM_DURATION / 2;

      // Tween to pile position; flip to face-up at the midpoint
      this.tweens.add({
        targets: tempSprite,
        x: PILE_X,
        y: PILE_Y,
        duration: ANIM_DURATION,
        ease: 'Cubic.easeOut',
      });

      // Midpoint flip: scale X to 0 then back to 1 with the face-up texture
      this.tweens.add({
        targets: tempSprite,
        scaleX: 0,
        duration: halfDuration,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          tempSprite.setTexture(faceUpTex);
          tempSprite.setDisplaySize(CARD_W, CARD_H);
          this.tweens.add({
            targets: tempSprite,
            scaleX: 1,
            duration: halfDuration,
            ease: 'Cubic.easeOut',
          });
        },
      });

      // After the full animation completes, clean up
      this.time.delayedCall(ANIM_DURATION, () => {
        tempSprite.destroy();
        onComplete();
      });
    }
  }

  // ── Level completion ───────────────────────────────────

  private handleLevelComplete(result: PlayResult, timestamp: number): void {
    this.cancelAiTimer();
    this.cancelHumanAiTimer();

    // Record level completion in transcript.
    // If the game is not over, playCard has already dealt new hands.
    const completedLevel = this.session.currentLevel - (result.levelComplete ? 1 : 0);
    const handsDealt: [readonly number[], readonly number[]] | undefined =
      !(isGameOver(this.session) && this.session.outcome === 'win')
        ? [
            this.session.players[0].hand.map((c) => c.value),
            this.session.players[1].hand.map((c) => c.value),
          ]
        : undefined;

    this.recorder.recordLevelComplete(
      timestamp,
      completedLevel,
      result.bonusLifeAwarded,
      this.session.lives,
      handsDealt,
    );

    // Check for game win (playCard auto-advances, so if outcome is 'win'
    // we've completed the final level)
    if (isGameOver(this.session) && this.session.outcome === 'win') {
      this.handleGameOver();
      return;
    }

    // Show level complete overlay briefly
    this.setPhase('level-complete');
    this.refreshAll();

    // Play level-complete chime
    this.soundManager?.play(SFX_KEYS.LEVEL_COMPLETE);

    const bonusText = result.bonusLifeAwarded
      ? '\nBonus life awarded!'
      : '';

    const levelText = this.add
      .text(
        GAME_W / 2,
        GAME_H / 2,
        `Level ${completedLevel} Complete!${bonusText}`,
        {
          fontSize: '28px',
          color: '#88ff88',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT)
      .setAlpha(0);

    // Fade in
    this.tweens.add({
      targets: levelText,
      alpha: 1,
      duration: 300,
    });

    // After delay, advance to next level
    this.time.delayedCall(LEVEL_COMPLETE_DELAY, () => {
      levelText.destroy();

      // Re-render for the new level (already dealt by playCard)
      this.renderHumanHand();
      this.renderAiHand();
      this.refreshStatus();
      this.refreshPile();

      this.startLevel();
    });
  }

  // ── Game over ──────────────────────────────────────────

  private handleGameOver(): void {
    this.cancelAiTimer();
    this.cancelHumanAiTimer();
    this.disableGameInteraction();

    const timestamp = Date.now() - this.levelStartTime;
    const outcome = this.session.outcome as 'win' | 'loss';

    // Finalize transcript
    this.recorder.finalize(
      timestamp,
      outcome,
      this.session.currentLevel,
      this.session.lives,
    );

    // Emit game-ended event
    this.gameEvents.emit('game-ended', {
      finalTurnNumber: this.turnCounter,
      winnerIndex: outcome === 'win' ? 0 : -1,
      reason:
        outcome === 'win'
          ? `Completed all ${MAX_LEVEL} levels!`
          : 'Ran out of lives',
    });

    if (outcome === 'win') {
      this.showWinOverlay();
    } else {
      this.showLossOverlay();
    }
  }

  /** Disable all game-element interactivity so the overlay buttons receive clicks. */
  private disableGameInteraction(): void {
    for (const sprite of this.humanCardSprites) {
      sprite.disableInteractive();
    }
    if (this.autoPlayButton) {
      this.autoPlayButton.disableInteractive();
    }
  }

  // ── Win overlay ────────────────────────────────────────

  private showWinOverlay(): void {
    this.setPhase('game-won');

    // Play victory fanfare
    this.soundManager?.play(SFX_KEYS.GAME_WIN);

    const overlay = createOverlayBackground(
      this,
      { depth: DEPTH_OVERLAY, alpha: 0.75 },
      { width: 460, height: 280, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const titleText = this.add
      .text(GAME_W / 2, GAME_H / 2 - 60, 'You Win!', {
        fontSize: '36px',
        color: '#88ff88',
        fontFamily: FONT_FAMILY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(titleText);

    const detailText = this.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 15,
        `Completed all ${MAX_LEVEL} levels!\nLives remaining: ${'\u2764'.repeat(this.session.lives)}`,
        {
          fontSize: '16px',
          color: '#cccccc',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(detailText);

    // Play Again button
    const playAgainBtn = createOverlayButton(
      this,
      GAME_W / 2 - 90,
      GAME_H / 2 + 60,
      '[ Play Again ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    playAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'play-again',
        action: 'click',
      });
      // Defer restart to next tick so Phaser finishes input dispatch
      this.time.delayedCall(0, () => this.scene.restart());
    });
    this.overlayObjects.push(playAgainBtn);

    // Menu button
    const menuBtn = createOverlayButton(
      this,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      '[ Menu ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    menuBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'menu',
        action: 'click',
      });
      // Defer scene transition to next tick so Phaser finishes input dispatch
      this.time.delayedCall(0, () =>
        this.scene.start('GameSelectorScene'),
      );
    });
    this.overlayObjects.push(menuBtn);
  }

  // ── Loss overlay ───────────────────────────────────────

  private showLossOverlay(): void {
    this.setPhase('game-lost');

    // Play defeat sound
    this.soundManager?.play(SFX_KEYS.GAME_LOST);

    const overlay = createOverlayBackground(
      this,
      { depth: DEPTH_OVERLAY, alpha: 0.75 },
      { width: 460, height: 280, alpha: 0.9 },
    );
    this.overlayObjects.push(...overlay.objects);

    const titleText = this.add
      .text(GAME_W / 2, GAME_H / 2 - 60, 'Game Over', {
        fontSize: '36px',
        color: '#ff6666',
        fontFamily: FONT_FAMILY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(titleText);

    const detailText = this.add
      .text(
        GAME_W / 2,
        GAME_H / 2 - 15,
        `Reached Level ${this.session.currentLevel} of ${MAX_LEVEL}\nRan out of lives!`,
        {
          fontSize: '16px',
          color: '#cccccc',
          fontFamily: FONT_FAMILY,
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY_CONTENT);
    this.overlayObjects.push(detailText);

    // Try Again button
    const tryAgainBtn = createOverlayButton(
      this,
      GAME_W / 2 - 90,
      GAME_H / 2 + 60,
      '[ Try Again ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    tryAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'try-again',
        action: 'click',
      });
      // Defer restart to next tick so Phaser finishes input dispatch
      this.time.delayedCall(0, () => this.scene.restart());
    });
    this.overlayObjects.push(tryAgainBtn);

    // Menu button
    const menuBtn = createOverlayButton(
      this,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      '[ Menu ]',
      DEPTH_OVERLAY_CONTENT,
      { fontSize: '18px' },
    );
    menuBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'menu',
        action: 'click',
      });
      // Defer scene transition to next tick so Phaser finishes input dispatch
      this.time.delayedCall(0, () =>
        this.scene.start('GameSelectorScene'),
      );
    });
    this.overlayObjects.push(menuBtn);
  }

  // ── AI scheduling ──────────────────────────────────────

  private scheduleAiPlay(): void {
    this.cancelAiTimer();

    const nextCard = this.aiPlayer.getNextCard();
    if (!nextCard) return;

    const elapsed = Date.now() - this.aiLevelStartTime;
    const delay = computeEffectiveDelay(
      nextCard.delay,
      elapsed,
      this.session.players[1].hand.length, // AI (this player)
      this.session.players[0].hand.length, // human (opponent)
      nextCard.card.value,
      getPileTopValue(this.session),
    );

    this.aiTimer = this.time.delayedCall(delay, () => {
      if (this.phase !== 'playing') return;
      this.performPlay(1, nextCard.card.value);
    });
  }

  private rescheduleAiIfNeeded(): void {
    // After a human play, check if AI still has cards and reschedule
    if (this.aiPlayer.hasCards() && this.phase === 'playing') {
      this.scheduleAiPlay();
    }
  }

  private rescheduleHumanAiIfNeeded(): void {
    if (
      this.autoPlayEnabled &&
      this.humanAiPlayer.hasCards() &&
      this.phase === 'playing'
    ) {
      this.scheduleHumanAiPlay();
    }
  }

  private cancelAiTimer(): void {
    if (this.aiTimer) {
      this.aiTimer.destroy();
      this.aiTimer = null;
    }
  }

  // ── Refresh all ────────────────────────────────────────

  private refreshAll(): void {
    this.refreshHumanHand();
    this.refreshAiHand();
    this.refreshPile();
    this.refreshStatus();
  }

  // ── Transcript helper ──────────────────────────────────

  private createRecorder(): MindTranscriptRecorder {
    const initialState: MindInitialState = {
      playerNames: [
        this.session.players[0].name,
        this.session.players[1].name,
      ],
      isAI: [
        this.session.players[0].isAI,
        this.session.players[1].isAI,
      ],
      startingLives: this.session.lives,
      startingLevel: this.session.currentLevel,
      hands: [
        this.session.players[0].hand.map((c) => c.value),
        this.session.players[1].hand.map((c) => c.value),
      ],
    };
    return new MindTranscriptRecorder(initialState);
  }

  // ── Replay API ─────────────────────────────────────────

  /**
   * Board state snapshot for replay state injection.
   *
   * The replay adapter reconstructs this snapshot from the transcript
   * events and passes it to this method via `page.evaluate()`.
   */
  public loadBoardState(state: {
    humanHand: number[];
    aiHand: number[];
    pileTop: number;
    pileSize: number;
    currentLevel: number;
    lives: number;
    stepIndex?: number;
  }): void {
    if (!this.replayMode) {
      throw new Error(
        'loadBoardState() is only available in replay mode (?mode=replay)',
      );
    }

    // Destroy existing card sprites
    for (const sprite of this.humanCardSprites) sprite.destroy();
    this.humanCardSprites = [];
    for (const sprite of this.aiCardSprites) sprite.destroy();
    this.aiCardSprites = [];

    // Render human hand (face-up)
    this.renderReplayHand(
      state.humanHand,
      HUMAN_HAND_Y,
      true,
      this.humanCardSprites,
      'Your Hand',
      '#88ff88',
    );

    // Render AI hand (face-down)
    this.renderReplayHand(
      state.aiHand,
      AI_HAND_Y,
      false,
      this.aiCardSprites,
      'AI Hand',
      '#ffaa44',
    );

    // Render AI count text
    if (this.aiCountText) this.aiCountText.destroy();
    if (state.aiHand.length > 0) {
      this.aiCountText = this.add
        .text(GAME_W / 2, AI_HAND_Y + CARD_H / 2 + 14, '', {
          fontSize: '12px',
          color: '#aaaaaa',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_UI);
      this.aiCountText.setText(
        `AI: ${state.aiHand.length} card${state.aiHand.length !== 1 ? 's' : ''}`,
      );
    } else {
      this.aiCountText = null;
    }

    // Update pile display
    if (state.pileTop > 0) {
      const faceUpCard: MindCard = { value: state.pileTop, faceUp: true };
      this.pileSprite.setTexture(getMindCardTexture(faceUpCard));
      this.pileSprite.setAlpha(1);
      this.pileValueText.setText(`${state.pileTop}`);
    } else {
      this.pileSprite.setTexture(CARD_BACK_KEY);
      this.pileSprite.setAlpha(0.3);
      this.pileValueText.setText('Empty');
    }
    this.pileCountText.setText(
      state.pileSize > 0
        ? `${state.pileSize} card${state.pileSize !== 1 ? 's' : ''}`
        : '',
    );

    // Update level and lives display
    this.levelText.setText(`Level ${state.currentLevel} / ${MAX_LEVEL}`);
    const hearts = '\u2764'.repeat(Math.max(0, state.lives));
    this.livesText.setText(`Lives: ${hearts}`);

    // Track replay step for state-settled payload
    if (state.stepIndex !== undefined) {
      this.replayStepIndex = state.stepIndex;
    }

    // Signal board is visually stable and ready for screenshot
    this.emitStateSettled(this.replayStepIndex, 'playing');
  }

  /**
   * Render a hand of cards at the given Y position for replay mode.
   * Cards are non-interactive static images.
   */
  private renderReplayHand(
    cardValues: number[],
    y: number,
    faceUp: boolean,
    spriteArray: Phaser.GameObjects.Image[],
    label: string,
    labelColor: string,
  ): void {
    if (cardValues.length === 0) return;

    // Dynamic spacing (same algorithm as renderHumanHand)
    const idealWidth = cardValues.length * CARD_W + (cardValues.length - 1) * CARD_GAP;
    const step = idealWidth <= MAX_HAND_WIDTH
      ? CARD_W + CARD_GAP
      : (MAX_HAND_WIDTH - CARD_W) / (cardValues.length - 1 || 1);
    const actualWidth = cardValues.length === 1
      ? CARD_W
      : CARD_W + (cardValues.length - 1) * step;
    const startX = (GAME_W - actualWidth) / 2 + CARD_W / 2;

    for (let i = 0; i < cardValues.length; i++) {
      const x = startX + i * step;
      const card: MindCard = { value: cardValues[i], faceUp };
      const texture = faceUp ? getMindCardTexture(card) : CARD_BACK_KEY;
      const sprite = this.add
        .image(x, y, texture)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS + i);
      spriteArray.push(sprite);
    }

    // Label above the hand
    this.add
      .text(GAME_W / 2, y - CARD_H / 2 - 14, label, {
        fontSize: '12px',
        color: labelColor,
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI);
  }

  // ── Shutdown ────────────────────────────────────────────

  shutdown(): void {
    // Deregister lifecycle listener to prevent double-registration on restart
    this.events.off('shutdown', this.shutdown, this);

    this.cancelAiTimer();
    this.cancelHumanAiTimer();
    this.shutdownBase();

    // Clean up overlay objects
    dismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }
}
