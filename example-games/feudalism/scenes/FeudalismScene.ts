/**
 * FeudalismScene — the main Phaser scene for Feudalism.
 */
import type { ResourceType, DevelopmentCard } from '../FeudalismCards';
import { canAfford } from '../FeudalismGame';
import type { FeudalismSession } from '../FeudalismGame';
import { setupFeudalismGame } from '../FeudalismGame';
import { FeudalismAiPlayer, GreedyStrategy } from '../AiStrategy';
import { FeudalismTranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  GAME_W, GAME_H,
  createSceneTitle, createSceneMenuButton,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  SFX_KEYS,
  type TurnPhase,
} from './FeudalismConstants';
import { FeudalismRenderer } from './FeudalismRenderer';
import { FeudalismAnimator } from './FeudalismAnimator';
import { FeudalismOverlayManager } from './FeudalismOverlayManager';
import { FeudalismTurnController } from './FeudalismTurnController';
import { FeudalismReplayController } from './FeudalismReplayController';
import {
  SECTION_BOX_PAD, PATRON_X, PATRON_W, MARKET_Y, MARKET_TOTAL_H,
  DECK_X, MARKET_X, MARKET_CARD_W, MARKET_CARD_GAP,
  SUPPLY_X, SUPPLY_TOKEN_R, SUPPLY_Y, SUPPLY_TOTAL_H,
  LOWER_TOP, LOWER_BOX_H, PLAYER_AREA_X, DIVIDER_X, AI_AREA_X,
  ACTION_Y, INSTRUCTION_Y,
} from './FeudalismConstants';

export class FeudalismScene extends CardGameScene {
  private session!: FeudalismSession;
  private aiPlayer!: FeudalismAiPlayer;
  private recorder: FeudalismTranscriptRecorder | null = null;

  private feudRenderer!: FeudalismRenderer;
  private animator!: FeudalismAnimator;
  private overlayManager!: FeudalismOverlayManager;
  private turnController!: FeudalismTurnController;
  private replayController!: FeudalismReplayController;

  private replayStepIndex: number = -1;

  constructor() {
    super({ key: 'FeudalismScene' });
  }

  preload(): void {
    this.load.audio(SFX_KEYS.TOKEN_TAKE, 'assets/audio/card-draw.wav');
    this.load.audio(SFX_KEYS.CARD_PURCHASE, 'assets/audio/card-flip.wav');
    this.load.audio(SFX_KEYS.PATRON_VISIT, 'assets/audio/score-reveal.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/turn-change.wav');
    this.load.audio(SFX_KEYS.GAME_END, 'assets/audio/round-end.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/ui-click.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.replayStepIndex = -1;

    this.detectReplayMode();
    this.initEventSystem();

    if (this.replayMode) {
      this.createHeader();
      this.feudRenderer = new FeudalismRenderer(this, this.session);
      this.feudRenderer.createContainers();
      this.feudRenderer.createInstructions();
      this.feudRenderer.createInfluenceDisplay();
      this.emitStateSettled(this.replayStepIndex, 'playing');
      return;
    }

    const mapping: EventSoundMapping = {
      'card-drawn': SFX_KEYS.TOKEN_TAKE,
      'turn-started': SFX_KEYS.TURN_CHANGE,
      'game-ended': SFX_KEYS.GAME_END,
    };
    this.initSoundSystem(Object.values(SFX_KEYS), mapping);

    this.session = setupFeudalismGame({
      playerCount: 2,
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new FeudalismAiPlayer(GreedyStrategy);
    this.recorder = new FeudalismTranscriptRecorder(this.session);

    this.feudRenderer = new FeudalismRenderer(this, this.session);
    this.animator = new FeudalismAnimator(this, this.session);
    this.overlayManager = new FeudalismOverlayManager(this, this.session);
    this.turnController = new FeudalismTurnController(this.session, this.aiPlayer, this.animator, {
      onPhaseChange: (phase) => this.setPhase(phase),
      onRefreshAll: () => this.refreshAll(),
      onShowToast: (msg) => this.feudRenderer.showToast(msg),
      onShowDiscardDialog: (excess) => this.showDiscardDialog(excess),
      onShowGameOver: () => this.overlayManager.showGameOverOverlay(),
      onPlaySound: (key) => this.soundManager?.play(key),
      onEmitTurnStarted: () => {
        this.gameEvents.emit('turn-started', {
          turnNumber: 0,
          playerIndex: 0,
          playerName: 'You',
          isAI: false,
        });
      },
      onEmitGameEnded: (winnerIdx) => {
        this.gameEvents.emit('game-ended', {
          finalTurnNumber: 0,
          winnerIndex: winnerIdx,
        });
      },
    });

    this.turnController.setRecorder(this.recorder);
    this.overlayManager.setRecorder(this.recorder);
    this.overlayManager.setOnRestart(() => this.scene.restart());
    this.replayController = new FeudalismReplayController();

    this.createHeader();
    this.feudRenderer.createContainers();
    this.feudRenderer.createInstructions();
    this.feudRenderer.createInfluenceDisplay();
    this.initHelpPanel(helpContent as HelpSection[]);
    this.initSettingsPanel();

    this.refreshAll();
    this.turnController.setPhase('player-turn');
  }

  private createHeader(): void {
    createSceneMenuButton(this);
    createSceneTitle(this, 'Feudalism');
  }

  private refreshAll(): void {
    this.feudRenderer.turnPhase = this.turnController.phase;
    this.feudRenderer.selectedTokens = this.selectedTokens;
    this.feudRenderer.discardSelection = this.discardSelection;
    this.feudRenderer.discardNeeded = this.discardNeeded;
    this.feudRenderer.refreshAll({
      onMarketCardClick: (card) => this.onMarketCardClick(card),
      onReserveDeck: (tier) => this.onReserveDeck(tier),
      onSupplyTokenClick: (color) => this.onSupplyTokenClick(color),
      onTakeTokens: () => this.onTakeTokens(),
      onTakeSame: (color) => this.turnController.executeTakeSame(color),
      onConfirmDifferent: () => this.turnController.executeTakeDifferent(this.selectedTokens),
      onCancelSelection: () => this.onCancelSelection(),
      onReservedCardClick: (card) => this.onReservedCardClick(card),
    });
  }

  private setPhase(phase: TurnPhase): void {
    this.feudRenderer.turnPhase = phase;
    if (phase !== 'player-turn') this.feudRenderer.clearMarketSelection();
    if (phase !== 'selecting-tokens' && this.selectedTokens.length > 0) {
      this.selectedTokens = [];
      this.feudRenderer.selectedTokens = this.selectedTokens;
    }

    switch (phase) {
      case 'player-turn':
        this.feudRenderer.instruction.setText('Click a card to buy/reserve, or take tokens');
        this.refreshAll();
        break;
      case 'selecting-tokens':
        this.feudRenderer.instruction.setText('Click resources in the supply to select (up to 3 different)');
        this.feudRenderer.refreshSupply({ onSupplyTokenClick: (color) => this.onSupplyTokenClick(color) });
        this.feudRenderer.refreshActionButtons({
          onTakeTokens: () => this.onTakeTokens(),
          onTakeSame: (color) => this.turnController.executeTakeSame(color),
          onConfirmDifferent: () => this.turnController.executeTakeDifferent(this.selectedTokens),
          onCancelSelection: () => this.onCancelSelection(),
        });
        break;
      case 'discarding-tokens':
        this.feudRenderer.instruction.setText('');
        break;
      case 'animating':
        this.feudRenderer.instruction.setText('');
        break;
      case 'ai-turn':
        this.feudRenderer.instruction.setText('AI is thinking...');
        break;
      case 'game-over':
        this.feudRenderer.instruction.setText('');
        break;
    }
  }

  // ── Token selection ─────────────────────────────────────
  private selectedTokens: ResourceType[] = [];
  private discardSelection: Partial<Record<ResourceType, number>> = {};
  private discardNeeded = 0;

  private onTakeTokens(): void {
    this.soundManager?.play(SFX_KEYS.UI_CLICK);
    this.selectedTokens = [];
    this.turnController.setPhase('selecting-tokens');
  }

  private onCancelSelection(): void {
    this.soundManager?.play(SFX_KEYS.UI_CLICK);
    this.selectedTokens = [];
    this.turnController.setPhase('player-turn');
  }

  private onSupplyTokenClick(color: ResourceType): void {
    if (this.turnController.phase !== 'selecting-tokens') return;
    const idx = this.selectedTokens.indexOf(color);
    if (idx !== -1) {
      this.selectedTokens.splice(idx, 1);
    } else {
      if (this.selectedTokens.length >= 3) return;
      if (this.selectedTokens.includes(color)) return;
      this.selectedTokens.push(color);
    }
    this.feudRenderer.selectedTokens = this.selectedTokens;
    this.feudRenderer.refreshSupply({ onSupplyTokenClick: (c) => this.onSupplyTokenClick(c) });
    this.feudRenderer.refreshActionButtons({
      onTakeTokens: () => this.onTakeTokens(),
      onTakeSame: (c) => this.turnController.executeTakeSame(c),
      onConfirmDifferent: () => this.turnController.executeTakeDifferent(this.selectedTokens),
      onCancelSelection: () => this.onCancelSelection(),
    });
  }

  // ── Card click handlers ─────────────────────────────────
  private onMarketCardClick(card: DevelopmentCard): void {
    if (this.turnController.phase !== 'player-turn') return;
    const player = this.session.players[0];
    const canBuy = canAfford(player, card);
    this.showCardActionMenu(card, canBuy);
  }

  private onReservedCardClick(card: DevelopmentCard): void {
    if (this.turnController.phase !== 'player-turn') return;
    const player = this.session.players[0];
    if (canAfford(player, card)) {
      this.turnController.executePurchase(card.id);
    }
  }

  private onReserveDeck(tier: import('../FeudalismCards').Tier): void {
    if (this.turnController.phase !== 'player-turn') return;
    const player = this.session.players[0];
    if (player.reservedCards.length >= 3) {
      this.feudRenderer.showToast('Max 3 reserved cards!');
      return;
    }
    this.turnController.executeReserve(null, tier);
  }

  // ── Menus ───────────────────────────────────────────────
  private showCardActionMenu(card: DevelopmentCard, canBuy: boolean): void {
    this.turnController.setPhase('animating');
    const player = this.session.players[0];
    const canReserve = player.reservedCards.length < 3;

    this.overlayManager.showCardActionMenu(
      card, canBuy, canReserve,
      () => {
        this.feudRenderer.clearMarketSelection();
        this.turnController.executePurchase(card.id);
      },
      () => {
        this.feudRenderer.clearMarketSelection();
        this.turnController.executeReserve(card.id);
      },
      () => {
        this.feudRenderer.clearMarketSelection();
        this.turnController.setPhase('player-turn');
      },
    );
  }

  private showDiscardDialog(excess: number): void {
    this.discardNeeded = excess;
    this.discardSelection = {};
    this.turnController.setPhase('discarding-tokens');
    this.feudRenderer.showDiscardDialog(excess, () => this.executeDiscard());
  }

  private executeDiscard(): void {
    this.turnController.executeDiscard(this.discardSelection);
    this.feudRenderer.clearDiscardDialog();
  }

  // ── Replay API ──────────────────────────────────────────
  loadBoardState(state: Parameters<FeudalismReplayController['loadBoardState']>[1]): void {
    if (!this.replayMode) {
      throw new Error('loadBoardState() is only available in replay mode (?mode=replay)');
    }

    const sessionRef = { session: this.session as any, replayStepIndex: this.replayStepIndex };
    this.replayController.loadBoardState(sessionRef, state);
    this.session = sessionRef.session!;
    this.replayStepIndex = sessionRef.replayStepIndex;

    this.feudRenderer = new FeudalismRenderer(this, this.session);
    this.feudRenderer.createContainers();
    this.feudRenderer.createInstructions();
    this.feudRenderer.createInfluenceDisplay();
    this.refreshAll();

    this.emitStateSettled(this.replayStepIndex, 'playing');
  }

  // ── Test accessors ──────────────────────────────────────
  getSectionBoxRects() {
    const p = SECTION_BOX_PAD;
    const lastCardRight = MARKET_X + 4 * (MARKET_CARD_W + MARKET_CARD_GAP) - MARKET_CARD_GAP;
    return {
      patrons: { x: PATRON_X - p, y: MARKET_Y - p - 16, w: PATRON_W + p * 2, h: MARKET_TOTAL_H + p * 2 + 16 },
      market: { x: DECK_X - 90 - p, y: MARKET_Y - p - 16, w: lastCardRight - (DECK_X - 90 - p) + p, h: MARKET_TOTAL_H + p * 2 + 16 },
      supply: { x: SUPPLY_X - SUPPLY_TOKEN_R - 70 - p, y: SUPPLY_Y - SUPPLY_TOKEN_R - p - 16, w: SUPPLY_TOKEN_R + 70 + SUPPLY_TOKEN_R + p * 2, h: SUPPLY_TOTAL_H + SUPPLY_TOKEN_R * 2 + p * 2 + 16 },
      player: { x: PLAYER_AREA_X - p, y: LOWER_TOP - p, w: DIVIDER_X - PLAYER_AREA_X, h: LOWER_BOX_H },
      ai: { x: DIVIDER_X + p, y: LOWER_TOP - p, w: AI_AREA_X - DIVIDER_X + p, h: LOWER_BOX_H },
    };
  }

  getLayoutConstants() {
    return { actionY: ACTION_Y, instructionY: INSTRUCTION_Y, gameW: GAME_W, gameH: GAME_H, actionButtonH: 42 };
  }

  get actionContainer(): Phaser.GameObjects.Container { return (this.feudRenderer as any).actionContainer; }
  get instructionText(): Phaser.GameObjects.Text { return this.feudRenderer.instruction; }

  getSelectedMarketCardIdForTest(): number | null { return this.feudRenderer.selectedCardId; }
  getMarketCardScaleForTest(cardId: number): number | null {
    const container = this.feudRenderer.marketContainers.get(cardId);
    return container ? container.scaleX : null;
  }
  selectMarketCardForTest(cardId: number): void {
    const selection = this.feudRenderer.marketSelections.get(cardId);
    if (!selection) return;
    this.feudRenderer.marketMgr.select(selection);
  }
  getFirstVisibleMarketCardIdForTest(): number | null {
    for (const tier of [3, 2, 1] as import('../FeudalismCards').Tier[]) {
      const card = this.session.market[tier].visible.find((entry) => entry != null);
      if (card) return card.id;
    }
    return null;
  }
  emitNonCardPointerDownForTest(): void {
    this.input.emit('pointerdown', this.input.activePointer, []);
  }

  startTokenSelectionForTest(): void {
    this.onTakeTokens();
  }

  toggleSupplyTokenForTest(color: ResourceType): void {
    this.onSupplyTokenClick(color);
  }

  confirmTakeDifferentForTest(): void {
    this.turnController.executeTakeDifferent(this.selectedTokens);
  }

  getSelectedTokensForTest(): ResourceType[] {
    return [...this.selectedTokens];
  }

  getTurnPhaseForTest(): TurnPhase {
    return this.turnController.phase;
  }

  // ── Cleanup ─────────────────────────────────────────────
  shutdown(): void {
    this.overlayManager.dismiss();
    this.feudRenderer.destroy();
    this.shutdownBase();
  }
}
