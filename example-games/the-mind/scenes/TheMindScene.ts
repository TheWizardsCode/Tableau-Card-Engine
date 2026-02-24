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

import Phaser from 'phaser';
import type { MindCard } from '../MindCard';
import type { PlayResult, PlayerId, TheMindSession } from '../TheMindGameState';
import {
  setupTheMindGame,
  playCard,
  isGameOver,
  getPileTopValue,
  MAX_LEVEL,
} from '../TheMindGameState';
import { MindAiPlayer } from '../AiStrategy';
import {
  preloadMindCardAssets,
  getMindCardTexture,
} from '../MindCardRenderer';
import { CARD_BACK_KEY } from '../MindCard';
import { MindTranscriptRecorder } from '../GameTranscript';
import type { MindInitialState } from '../GameTranscript';
import { GameEventEmitter } from '../../../src/core-engine/GameEventEmitter';
import { PhaserEventBridge } from '../../../src/core-engine/PhaserEventBridge';
import { SoundManager } from '../../../src/core-engine/SoundManager';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  createOverlayBackground,
  createOverlayButton,
  createOverlayMenuButton,
  createSceneHeader,
  SettingsPanel,
  SettingsButton,
} from '../../../src/ui';

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

// Card display dimensions (larger than default for playability)
const CARD_W = 80;
const CARD_H = 109;

// Layout
const PILE_X = GAME_W / 2;
const PILE_Y = GAME_H / 2 - 30;

const HUMAN_HAND_Y = GAME_H - 90;
const AI_HAND_Y = 80;

const CARD_GAP = 8;

// Timing
const LEVEL_COMPLETE_DELAY = 2000;
const PENALTY_REVEAL_DELAY = 1000;
const ANIM_DURATION = 250;

// Depths
const DEPTH_CARDS = 1;
const DEPTH_PILE = 2;
const DEPTH_PLAYED_CARD = 3;
const DEPTH_UI = 5;
const DEPTH_OVERLAY = 10;
const DEPTH_OVERLAY_CONTENT = 11;

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

export class TheMindScene extends Phaser.Scene {
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

  // Event system
  private gameEvents!: GameEventEmitter;
  private eventBridge!: PhaserEventBridge;

  // Sound system
  private soundManager: SoundManager | null = null;
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  // Display objects -- human hand
  private humanCardSprites: Phaser.GameObjects.Image[] = [];

  // Display objects -- AI hand
  private aiCardSprites: Phaser.GameObjects.Image[] = [];
  private aiCountText!: Phaser.GameObjects.Text;

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

    // Reset state for scene restart
    this.humanCardSprites = [];
    this.aiCardSprites = [];
    this.overlayObjects = [];
    this.aiTimer = null;
    this.humanAiTimer = null;
    this.turnCounter = 0;

    // Check URL parameter for auto-play
    const urlParams = new URLSearchParams(window.location.search);
    this.autoPlayEnabled = urlParams.get('autoplay') === 'true';

    // Event system
    this.gameEvents = new GameEventEmitter();
    this.eventBridge = new PhaserEventBridge(this.gameEvents, this.events);

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
    // Level indicator (top-right area)
    this.levelText = this.add
      .text(GAME_W - 20, 10, '', {
        fontSize: '16px',
        color: '#aaccff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH_UI);

    // Lives display (below level)
    this.livesText = this.add
      .text(GAME_W - 20, 34, '', {
        fontSize: '16px',
        color: '#ff6666',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(1, 0)
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

    // Declarative event-to-sound mapping
    const mapping: EventSoundMapping = {
      'game-ended': SFX_KEYS.UI_CLICK,
    };
    this.soundManager.connectToEvents(this.gameEvents, mapping);

    // Settings UI (mute toggle + volume slider)
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.soundManager,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);
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
    const delay = Math.max(nextCard.delay - elapsed, 100);

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

    const totalWidth = hand.length * CARD_W + (hand.length - 1) * CARD_GAP;
    const startX = (GAME_W - totalWidth) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      // Human cards are always face-up
      const displayCard = { ...card, faceUp: true };
      const x = startX + i * (CARD_W + CARD_GAP);
      const sprite = this.add
        .image(x, HUMAN_HAND_Y, getMindCardTexture(displayCard))
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS)
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

    const totalWidth = hand.length * CARD_W + (hand.length - 1) * CARD_GAP;
    const startX = (GAME_W - totalWidth) / 2 + CARD_W / 2;

    for (let i = 0; i < hand.length; i++) {
      const x = startX + i * (CARD_W + CARD_GAP);
      const sprite = this.add
        .image(x, AI_HAND_Y, CARD_BACK_KEY)
        .setDisplaySize(CARD_W, CARD_H)
        .setDepth(DEPTH_CARDS);

      this.aiCardSprites.push(sprite);
    }

    // Count indicator
    if (!this.aiCountText) {
      this.aiCountText = this.add
        .text(GAME_W / 2, AI_HAND_Y + CARD_H / 2 + 14, '', {
          fontSize: '12px',
          color: '#aaaaaa',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_UI);
    }

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

  private animateCardTowardsPile(
    _playerId: PlayerId,
    _cardValue: number,
    onComplete: () => void,
  ): void {
    // Simple visual: just delay briefly then refresh
    this.time.delayedCall(ANIM_DURATION, () => {
      onComplete();
    });
  }

  // ── Level completion ───────────────────────────────────

  private handleLevelComplete(result: PlayResult, timestamp: number): void {
    this.cancelAiTimer();
    this.cancelHumanAiTimer();

    // Record level completion in transcript
    this.recorder.recordLevelComplete(
      timestamp,
      this.session.currentLevel - (result.levelComplete ? 1 : 0),
      result.bonusLifeAwarded,
      this.session.lives,
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

    const completedLevel = this.session.currentLevel - 1;
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
    );
    playAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'play-again',
        action: 'click',
      });
      this.scene.restart();
    });
    this.overlayObjects.push(playAgainBtn);

    // Menu button
    const menuBtn = createOverlayMenuButton(
      this,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      DEPTH_OVERLAY_CONTENT,
    );
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
    );
    tryAgainBtn.on('pointerdown', () => {
      this.soundManager?.play(SFX_KEYS.UI_CLICK);
      this.gameEvents.emit('ui-interaction', {
        elementId: 'try-again',
        action: 'click',
      });
      this.scene.restart();
    });
    this.overlayObjects.push(tryAgainBtn);

    // Menu button
    const menuBtn = createOverlayMenuButton(
      this,
      GAME_W / 2 + 90,
      GAME_H / 2 + 60,
      DEPTH_OVERLAY_CONTENT,
    );
    this.overlayObjects.push(menuBtn);
  }

  // ── AI scheduling ──────────────────────────────────────

  private scheduleAiPlay(): void {
    this.cancelAiTimer();

    const nextCard = this.aiPlayer.getNextCard();
    if (!nextCard) return;

    // Calculate delay from now: the committed delay is relative to level start
    const elapsed = Date.now() - this.aiLevelStartTime;
    const delay = Math.max(nextCard.delay - elapsed, 100);

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

  // ── Event emission helpers ─────────────────────────────

  // Note: The Mind has no turns, so we adapt the event system
  // to emit state-settled after each card play settles.

  // ── Shutdown ────────────────────────────────────────────

  shutdown(): void {
    this.cancelAiTimer();
    this.cancelHumanAiTimer();
    this.soundManager?.destroy();
    this.soundManager = null;
    this.eventBridge?.destroy();
    this.gameEvents?.removeAllListeners();
    this.settingsPanel?.destroy();
    this.settingsButton?.destroy();

    // Clean up overlay objects
    for (const obj of this.overlayObjects) {
      if (obj && obj.active) {
        obj.destroy();
      }
    }
    this.overlayObjects = [];
  }
}
