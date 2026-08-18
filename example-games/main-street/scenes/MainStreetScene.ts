import type { MainStreetState, MainStreetCampaignProgress } from '../MainStreetState';
import type { DifficultyName } from '../MainStreetDifficulty';
import type { BusinessCard } from '../MainStreetCards';
import {
  CardGameScene,
  HintBar,
  TooltipManager,
} from '../../../src/ui';
import type { SelectionController, SingleSelectionManager } from '../../../src/ui';
import { SaveLoadStore, CheckpointManager } from '../../../src/core-engine';
import { UndoRedoManager } from '../../../src/core-engine';
import type { DragDropManager } from '../../../src/ui';
import type { MainStreetSerializedState } from '../MainStreetState';
import { MainStreetRenderer } from './MainStreetRenderer';
import { MainStreetAnimator } from './MainStreetAnimator';
import { MainStreetTurnController } from './MainStreetTurnController';
import { MainStreetOverlayContent } from './MainStreetOverlayContent';
import { MainStreetInputManager } from './MainStreetInputManager';
import { MainStreetSvgTextureManager } from './MainStreetSvgTextureManager';
import { MainStreetLifecycleManager } from './MainStreetLifecycleManager';
import { MainStreetTutorialHints } from './MainStreetTutorialHints';
import {
  type SceneLayout,
  STREET_ROWS,
} from './MainStreetConstants';

type UIPhase =
  | 'idle'               // Waiting for DayStart
  | 'market'             // Player can buy or end turn
  | 'placing-business'   // Player selected a business card, picking a slot
  | 'placing-from-hand'  // Player bought a card to hand, click a slot to place it
  | 'animating'          // Brief pause for feedback
  | 'game-over';         // Final overlay

export class MainStreetScene extends CardGameScene {
  public tooltipManager?: TooltipManager;
  public msRenderer!: MainStreetRenderer;
  public msAnimator!: MainStreetAnimator;
  public msTurnController!: MainStreetTurnController;
  public msOverlayManager!: MainStreetOverlayContent;
  public msInputManager!: MainStreetInputManager;
  public msSvgTextureManager!: MainStreetSvgTextureManager;
  public msLifecycleManager!: MainStreetLifecycleManager;
  public tutorialOverlay?: MainStreetTutorialHints;
  // Game state
  public state!: MainStreetState;
  public uiPhase: UIPhase = 'idle';

  // Campaign / meta-progression
  public campaign: MainStreetCampaignProgress | null = null;
  public saveStore: SaveLoadStore | null = null;

  // Checkpoint (auto-save/resume after each turn)
  public checkpointManager!: CheckpointManager<MainStreetState, MainStreetSerializedState>;

  // Selected difficulty (persisted across replays)
  public selectedDifficulty: DifficultyName = 'Medium';

  // Pending selection for placing a business
  public pendingBusinessCard: BusinessCard | null = null;
  public pendingBusinessSourceIndex: number | null = null;

  // Pending hand card for placing from hand (index into state.hand)
  public pendingHandIndex: number | null = null;

  // True when the pending hand card was just moved from the market this turn
  // (same-day move+place composite = 1 action). False when the card was
  // already in hand (placing then costs a second action).
  public pendingHandJustMoved: boolean = false;

  // Computed responsive layout metrics
  public layout!: SceneLayout;

  // Display containers
  public hudContainer!: Phaser.GameObjects.Container;
  public streetContainer!: Phaser.GameObjects.Container;
  public marketContainer!: Phaser.GameObjects.Container;
  public incidentQueueContainer!: Phaser.GameObjects.Container;
  public handContainer!: Phaser.GameObjects.Container;

  public actionContainer!: Phaser.GameObjects.Container;

  // Activity Log panel
  public logContainer!: Phaser.GameObjects.Container;
  public logContentContainer!: Phaser.GameObjects.Container;
  public logMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  public logContentMask: Phaser.Display.Masks.GeometryMask | null = null;
  public logScrollOffset = 0;
  public logMaxScroll = 0;
  public logTotalContentH = 0;
  public logAutoScroll = false;
  public logPrevEntryCount = 0;
  /** The index of the first entry displayed in the current log window (for windowed rendering). */
  public logRenderedStartIdx = 0;

  // Challenge Tracker panel
  public challengeContainer!: Phaser.GameObjects.Container;

  // Instruction text (managed by HintBar; kept as public property for backward compat)
  public instructionText!: Phaser.GameObjects.Text;
  /** Shared HintBar instance for standardised hint/instruction display at bottom-centre. */
  public hintBar!: HintBar;

  // Overlay objects
  public overlayObjects: Phaser.GameObjects.GameObject[] = [];

  // HUD animation state
  public previousCoins: number | null = null;
  public previousReputation: number | null = null;

  /**
   * True while the end-of-turn income collection animation is running
   * (coins/pips flying to the HUD). Suppresses the immediate HUD delta pop
   * in `animateHudValueChanges` so the collection's final "+total" pop is
   * the single landing feedback. Set/reset by `MainStreetAnimator`; always
   * false under reduced motion and in replay/headless modes.
   */
  public incomeCollectionActive = false;
  public transferAnimationCount = 0;
  public activeTransferTweens = new Set<Phaser.Tweens.Tween>();
  public activeTransferVisuals = new Set<Phaser.GameObjects.GameObject>();
  public hiddenTransferSourceCardIds = new Set<string>();

  // Hint system
  /** True after the player has used their one hint for this turn. */
  public hintUsedThisTurn = false;
  /** Card ID of the card highlighted by the current hint (null = none). */
  public hintedCardId: string | null = null;
  /** Grid slot index highlighted by the current hint (null = none). */
  public hintedSlotIndex: number | null = null;

  // Persistent market-card selection UX
  public marketSelectionManager!: SingleSelectionManager;
  public marketSelectionByCardId = new Map<string, SelectionController>();
  public selectedMarketCardId: string | null = null;

  // SVG debug overlay (opt-in via ?msSvgDebug=1)
  public svgDebugEnabled = false;
  public svgDebugText?: Phaser.GameObjects.Text;

  // Undo/Redo manager for market actions (per-scene)
  public undoManager!: UndoRedoManager;

  // Drag-and-drop buy-to-slot (business cards → street slots)
  public dragDropManager?: DragDropManager;

  constructor(config?: Partial<Phaser.Types.Scenes.SettingsConfig>) {
    super({ key: 'MainStreetScene', ...(config ?? {}) });
    this.msLifecycleManager = new MainStreetLifecycleManager(this);
  }

  /** Stores raw SVG text for each card template (fetched in preload, used for lazy rasterisation). */
  public cardSvgSources: Map<string, string> = new Map();
  /** Resolves when all SVG source fetches started in preload have settled. */
  public cardSvgLoadPromise: Promise<void> = Promise.resolve();

  // Preload placeholder SVG used for visual scale testing in the market
  public preload(...args: any[]): any {
    return (this.msLifecycleManager as any).preload.apply(this.msLifecycleManager, args);
  }

  // ── Create ──────────────────────────────────────────────
  public create(...args: any[]): any {
    return (this.msLifecycleManager as any).create.apply(this.msLifecycleManager, args);
  }

  // ── Header ──────────────────────────────────────────────
  public createHeader(...args: any[]): any {
    return (this.msRenderer as any).createHeader.apply(this.msRenderer, args);
  }

  /**
   * Prewarms SVG textures for cards that will be visible on initial render.
   * This rasterises them at the exact pixel sizes needed for the current layout,
   * ensuring crisp rendering on HiDPI displays.
   */
  public prewarmVisibleCardTextures(...args: any[]): any {
    return (this.msSvgTextureManager as any).prewarmVisibleCardTextures.apply(this.msSvgTextureManager, args);
  }

  /** Extracts the base template ID from a card ID (strips copy suffixes like -0, -1). */
  public templateIdFromCardId(...args: any[]): any {
    return (this.msSvgTextureManager as any).templateIdFromCardId.apply(this.msSvgTextureManager, args);
  }

  /**
   * Lazily request a card texture for the given render size.
   * If generation succeeds, trigger a refresh so the SVG texture is used.
   */
  public requestCardTexture(...args: any[]): any {
    return (this.msSvgTextureManager as any).requestCardTexture.apply(this.msSvgTextureManager, args);
  }
  public computeLayout(...args: any[]): any {
    return (this.msRenderer as any).computeLayout.apply(this.msRenderer, args);
  }
  public createContainers(...args: any[]): any {
    return (this.msRenderer as any).createContainers.apply(this.msRenderer, args);
  }
  public createInstructions(...args: any[]): any {
    return (this.msRenderer as any).createInstructions.apply(this.msRenderer, args);
  }
  public initSvgDebugOverlay(...args: any[]): any {
    return (this.msInputManager as any).initSvgDebugOverlay.apply(this.msInputManager, args);
  }
  public updateSvgDebugOverlay(...args: any[]): any {
    return (this.msInputManager as any).updateSvgDebugOverlay.apply(this.msInputManager, args);
  }
  public handleResize(...args: any[]): any {
    return (this.msLifecycleManager as any).handleResize.apply(this.msLifecycleManager, args);
  }

  // ── Campaign / Meta-Progression ─────────────────────────

  /**
   * Loads campaign progress (or creates defaults) and sets up the game
   * with tier-filtered decks. Campaign loading is async but the scene
   * continues with default progress if the load is still pending.
   */
  public loadCampaignAndSetup(...args: any[]): any {
    return (this.msLifecycleManager as any).loadCampaignAndSetup.apply(this.msLifecycleManager, args);
  }

  /**
   * Check for a saved run checkpoint on startup.
   * If found, shows a resume overlay with [Resume] and [New Game] buttons.
   * Delegates to MainStreetLifecycleManager.checkForSavedCheckpoint().
   */
  public checkForSavedCheckpoint(...args: any[]): any {
    return (this.msLifecycleManager as any).checkForSavedCheckpoint.apply(this.msLifecycleManager, args);
  }

  /**
   * Updates campaign progress after a completed run (win or loss).
   * Evaluates tier unlocks and persists the updated campaign.
   * Returns a Promise that resolves when the update is done (or
   * immediately if no campaign / store is available).
   */
  public updateCampaignProgress(...args: any[]): any {
    return (this.msLifecycleManager as any).updateCampaignProgress.apply(this.msLifecycleManager, args);
  }

  /**
   * Updates standalone player statistics after a completed run.
   * Delegates to MainStreetLifecycleManager.updateStats().
   */
  public updateStats(gameResult: 'win' | 'loss', finalScore: number): Promise<void> {
    return (this.msLifecycleManager as any).updateStats(gameResult, finalScore);
  }

  // ── Day flow ────────────────────────────────────────────
  public startDayPhase(...args: any[]): any {
    return (this.msTurnController as any).startDayPhase.apply(this.msTurnController, args);
  }
  public endTurn(...args: any[]): any {
    return (this.msTurnController as any).endTurn.apply(this.msTurnController, args);
  }

  // ── Refresh display ─────────────────────────────────────
  public refreshAll(...args: any[]): any {
    return (this.msRenderer as any).refreshAll.apply(this.msRenderer, args);
  }

  // ── HUD ─────────────────────────────────────────────────
  public refreshHud(...args: any[]): any {
    return (this.msRenderer as any).refreshHud.apply(this.msRenderer, args);
  }

  public animateHudValueChanges(...args: any[]): any {
    return (this.msAnimator as any).animateHudValueChanges.apply(this.msAnimator, args);
  }

  public getMarketCardCenter(...args: any[]): any {
    return (this.msAnimator as any).getMarketCardCenter.apply(this.msAnimator, args);
  }

  public getStreetSlotCenter(...args: any[]): any {
    return (this.msAnimator as any).getStreetSlotCenter.apply(this.msAnimator, args);
  }

  public getHandCardCenter(...args: any[]): any {
    return (this.msAnimator as any).getHandCardCenter.apply(this.msAnimator, args);
  }

  /**
   * Predicted resting position for a business card bought into the hand at the
   * given insert index. Single source of truth for market→hand transfer
   * animation targets — delegates to the merged HandView's
   * `getInsertionPosition` so the animation always ends exactly where the
   * rendered card will rest (the hand is centred on `handCenterX`).
   */
  public getBusinessHandInsertionPosition(insertIndex: number): { x: number; y: number } {
    return this.msRenderer.handView.getInsertionPosition(insertIndex);
  }

  /**
   * Predicted resting position for an event card bought into the hand at the
   * given insert index. Single source of truth for market→hand transfer
   * animation targets — delegates to the merged HandView's
   * `getInsertionPosition` (events share the single horizontal hand row).
   */
  public getEventHandInsertionPosition(insertIndex: number): { x: number; y: number } {
    return this.msRenderer.handView.getInsertionPosition(insertIndex);
  }

  public createTransferCardVisual(...args: any[]): any {
    return (this.msAnimator as any).createTransferCardVisual.apply(this.msAnimator, args);
  }

  public cleanupTransferAnimations(...args: any[]): any {
    return (this.msAnimator as any).cleanupTransferAnimations.apply(this.msAnimator, args);
  }

  public animateTransferFromMarket(...args: any[]): any {
    return (this.msAnimator as any).animateTransferFromMarket.apply(this.msAnimator, args);
  }

  // ── Challenge Tracker ───────────────────────────────────
  public refreshChallengeTracker(...args: any[]): any {
    return (this.msRenderer as any).refreshChallengeTracker.apply(this.msRenderer, args);
  }

  // ── Street Grid ─────────────────────────────────────────
  public refreshStreetGrid(...args: any[]): any {
    return (this.msRenderer as any).refreshStreetGrid.apply(this.msRenderer, args);
  }
  public drawBusinessSlot(...args: any[]): any {
    return (this.msRenderer as any).drawBusinessSlot.apply(this.msRenderer, args);
  }
  public drawEmptySlot(...args: any[]): any {
    return (this.msRenderer as any).drawEmptySlot.apply(this.msRenderer, args);
  }

  // ── Market ──────────────────────────────────────────────
  public refreshMarket(...args: any[]): any {
    return (this.msRenderer as any).refreshMarket.apply(this.msRenderer, args);
  }
  public drawMarketRow(...args: any[]): any {
    return (this.msRenderer as any).drawMarketRow.apply(this.msRenderer, args);
  }
  public templateKeyForCard(...args: any[]): any {
    return (this.msSvgTextureManager as any).templateKeyForCard.apply(this.msSvgTextureManager, args);
  }
  public drawMarketCard(...args: any[]): any {
    return (this.msRenderer as any).drawMarketCard.apply(this.msRenderer, args);
  }

  // ── Incident Queue ───────────────────────────────────────
  public refreshIncidentQueue(...args: any[]): any {
    return (this.msRenderer as any).refreshIncidentQueue.apply(this.msRenderer, args);
  }
  public drawIncidentCard(...args: any[]): any {
    return (this.msRenderer as any).drawIncidentCard.apply(this.msRenderer, args);
  }

  // ── Player Hand ────────────────────────────────────────────
  public refreshPlayerHand(...args: any[]): any {
    return (this.msRenderer as any).refreshPlayerHand.apply(this.msRenderer, args);
  }
  public drawHeldEventCard(...args: any[]): any {
    return (this.msRenderer as any).drawHeldEventCard.apply(this.msRenderer, args);
  }
  public onPlayHeldEvent(...args: any[]): any {
    return (this.msTurnController as any).onPlayHeldEvent.apply(this.msTurnController, args);
  }

  // ── Action buttons ──────────────────────────────────────
  public refreshActionButtons(...args: any[]): any {
    return (this.msRenderer as any).refreshActionButtons.apply(this.msRenderer, args);
  }

  // Refresh market proxy (forward to turn controller)
  public onRefreshMarketClick(...args: any[]): any {
    return (this.msTurnController as any).onRefreshMarketClick.apply(this.msTurnController, args);
  }

  /**
   * Creates a "Hint" button that is disabled after first use per turn.
   * When clicked, queries the Greedy strategy and highlights the recommended
   * card/slot with a one-line rationale in the instruction text area.
   */
  public createHintButton(...args: any[]): any {
    return (this.msRenderer as any).createHintButton.apply(this.msRenderer, args);
  }

  /** Handles the Hint button click: generates and displays the hint. */
  public onHintClick(...args: any[]): any {
    return (this.msInputManager as any).onHintClick.apply(this.msInputManager, args);
  }
  public performUndo(...args: any[]): any {
    return (this.msTurnController as any).performUndo.apply(this.msTurnController, args);
  }
  public performRedo(...args: any[]): any {
    return (this.msTurnController as any).performRedo.apply(this.msTurnController, args);
  }
  public clearMarketSelection(...args: any[]): any {
    return (this.msInputManager as any).clearMarketSelection.apply(this.msInputManager, args);
  }
  public selectMarketCardById(...args: any[]): any {
    return (this.msInputManager as any).selectMarketCardById.apply(this.msInputManager, args);
  }
  public onHandBusinessCardClick(...args: any[]): any {
    return (this.msTurnController as any).onHandBusinessCardClick.apply(this.msTurnController, args);
  }
  public onBusinessCardClick(...args: any[]): any {
    return (this.msTurnController as any).onBusinessCardClick.apply(this.msTurnController, args);
  }
  public onSlotClick(...args: any[]): any {
    return (this.msTurnController as any).onSlotClick.apply(this.msTurnController, args);
  }
  public onEventCardClick(...args: any[]): any {
    return (this.msTurnController as any).onEventCardClick.apply(this.msTurnController, args);
  }
  public onUpgradeCardClick(...args: any[]): any {
    return (this.msTurnController as any).onUpgradeCardClick.apply(this.msTurnController, args);
  }

  public onSellCard(...args: any[]): any {
    return (this.msTurnController as any).onSellCard.apply(this.msTurnController, args);
  }

  // ── Activity Log ─────────────────────────────────────────

  /**
   * Rebuilds the log panel content from state.activityLog.
   * Only re-renders when entries have been added since the last call.
   */
  public refreshLog(...args: any[]): any {
    return (this.msRenderer as any).refreshLog.apply(this.msRenderer, args);
  }

  /** Updates the geometry mask rectangle to clip log content. */
  public updateLogMask(...args: any[]): any {
    return (this.msInputManager as any).updateLogMask.apply(this.msInputManager, args);
  }

  /** Handles mouse wheel events over the log panel area. */
  public handleLogWheel = (...args: any[]): any => {
    const ret = (this.msInputManager as any).handleLogWheel.apply(this.msInputManager, args);
    // After updating scroll offset, refresh the log to render the new entry window
    this.msRenderer?.refreshLog();
    return ret;
  };

  /** Applies the current scroll offset to the log content container. */
  public applyLogScroll(...args: any[]): any {
    return (this.msInputManager as any).applyLogScroll.apply(this.msInputManager, args);
  }

  getStreetContainer(): Phaser.GameObjects.Container {
    return this.streetContainer;
  }

  getMarketContainer(): Phaser.GameObjects.Container {
    return this.marketContainer;
  }

  getIncidentQueueContainer(): Phaser.GameObjects.Container {
    return this.incidentQueueContainer;
  }

  getHandContainer(): Phaser.GameObjects.Container {
    return this.handContainer;
  }

  getActionContainer(): Phaser.GameObjects.Container {
    return this.actionContainer;
  }

  /** Test helper: returns number of transfer animations triggered in this scene instance. */
  getTransferAnimationCountForTest(): number {
    return this.transferAnimationCount;
  }

  /** Test helper: returns count of hidden source cards while transfer animation is in progress. */
  getHiddenTransferSourceCardCountForTest(): number {
    return this.hiddenTransferSourceCardIds.size;
  }

  /** Test helper: returns current computed scene layout metrics. */
  getLayoutMetricsForTest(): SceneLayout {
    return { ...this.layout };
  }

  /** Test helper: returns rectangles for major play zones. */
  getSectionRectsForTest(): {
    market: { x: number; y: number; w: number; h: number };
    queue: { x: number; y: number; w: number; h: number };
    street: { x: number; y: number; w: number; h: number };
    hand: { x: number; y: number; w: number; h: number };
    action: { x: number; y: number; w: number; h: number };
    instruction: { x: number; y: number; w: number; h: number };
  } {
    const l = this.layout;
    const market = {
      x: 20,
      y: l.marketTop - 10,
      w: l.gameW - 40,
      h: 2 * l.marketRowH + l.marketRowGap + 20,
    };
    const queue = {
      x: l.logX,
      y: l.queueTop - 10,
      w: l.logW,
      h: l.queueCardH + 24,
    };
    const street = {
      x: l.streetX,
      y: l.streetTop,
      w: l.streetCols * l.slotW + (l.streetCols - 1) * l.slotGap,
      h: STREET_ROWS * l.slotH + (STREET_ROWS - 1) * l.streetRowGap,
    };
    const hand = {
      x: 40,
      y: l.handY,
      w: l.handCardW,
      h: l.handCardH,
    };

    const rightX = l.gameW - 24;
    const actionRowY = l.actionY + 4;
    // Note: undo/redo buttons were removed from the action bar in the MS
    // migration (CG-0MQHARH7J004XP4V). They are now placed via the shared
    // initUndoRedoButtons() mechanism in the header area, not the action bar.
    const actionW = l.actionButtonW + 12 + l.hintButtonW;
    const action = {
      x: rightX - actionW,
      y: actionRowY,
      w: actionW,
      h: l.actionButtonH,
    };

    const instruction = {
      x: this.instructionText.x - this.instructionText.displayWidth,
      y: this.instructionText.y - this.instructionText.displayHeight / 2,
      w: this.instructionText.displayWidth,
      h: this.instructionText.displayHeight,
    };

    return { market, queue, street, hand, action, instruction };
  }

  // ── Replay: load board state ─────────────────────────────

  /**
   * Inject a board state snapshot for the replay tool.
   *
   * Called by the replay adapter via `page.evaluate()`.
   * Updates internal scene state to reflect the given snapshot and emits
   * `state-settled` so the replay tool can take a screenshot.
   *
   * Accepts either the engine's serialized state shape (MainStreetSerializedState)
   * or a minimal snapshot containing a `seed` and optional `turn`.
   */
  public loadBoardState(...args: any[]): any {
    return (this.msLifecycleManager as any).loadBoardState.apply(this.msLifecycleManager, args);
  }

  // ── Game Over Overlay ───────────────────────────────────
  public showGameOverOverlay(...args: any[]): any {
    return (this.msOverlayManager as any).showGameOverOverlay.apply(this.msOverlayManager, args);
  }

  /**
   * Shows a sell confirmation overlay for a card on the street grid.
   *
   * @param slotIndex The grid slot index of the card being sold.
   * @param cardName  The display name of the card.
   * @param refund    The calculated refund amount in coins.
   * @param info      The detailed info text to display.
   */
  public showSellConfirmation(slotIndex: number, cardName: string, refund: number, info: string): void {
    if (this.msOverlayManager && typeof (this.msOverlayManager as any).showSellConfirmation === 'function') {
      (this.msOverlayManager as any).showSellConfirmation(slotIndex, cardName, refund, info);
      return;
    }
    // Fallback: if no overlay manager method exists, execute sell directly
    this.msTurnController?.onSlotClick?.(slotIndex);
  }

  // ── Tutorial Flow (Milestone 5 action-gated) ────────────
  public confirmTutorialStep(...args: any[]): any {
    return (this.msLifecycleManager as any).confirmTutorialStep.apply(this.msLifecycleManager, args);
  }
  public exitTutorialFlow(...args: any[]): any {
    return (this.msLifecycleManager as any).exitTutorialFlow.apply(this.msLifecycleManager, args);
  }
  public showTutorialStepOverlay(...args: any[]): any {
    return (this.msLifecycleManager as any).showTutorialStepOverlay.apply(this.msLifecycleManager, args);
  }
}
