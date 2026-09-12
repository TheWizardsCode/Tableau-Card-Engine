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
import type { MainStreetSerializedState, PendingApplicant } from '../MainStreetState';
import { hireStaffApplicant, declineStaffApplicant } from '../MainStreetEngine';
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
import {
  type StreetCameraState,
  type StreetLatticeDims,
  clampStreetCamera,
  clampZoomLevel,
  defaultStreetCamera,
  localToScreen,
  panStreetCamera,
  screenToLocal,
  visibleMapSlots,
  zoomInLevel,
  zoomOutLevel,
} from '../MainStreetMapView';
import { createMarketCardCheatTool } from '../../../src/ui/debug/MarketCardCheatOverlay';
import { createStaffApplicantCheatTool } from '../../../src/ui/debug/StaffApplicantCheatOverlay';
import { createSessionExportTool } from '../../../src/ui/debug/SessionExportTool';
import { createStateInspectorTool } from '../../../src/ui/debug/StateInspectorOverlay';
import { createGameEventLogTool } from '../../../src/ui/debug/GameEventLogOverlay';
import { createAiDecisionViewerTool } from '../../../src/ui/debug/AiDecisionOverlay';

type UIPhase =
  | 'idle'               // Waiting for DayStart
  | 'market'             // Player can buy or end turn
  | 'placing-business'   // Player selected a business card, picking a slot
  | 'placing-from-hand'  // Player bought a card to hand, click a slot to place it
  | 'animating'          // Brief pause for feedback
  | 'game-over'          // Final overlay
  | 'applicant'          // Staff applicant overlay: Hire / Decline (CG-0MSTOATDU006UGAX)
  ;

export class MainStreetScene extends CardGameScene {
  /**
   * Dev-gated debug-tools override: the Main-Street-only Market Card Cheat
   * is injected alongside the base tools. The entire factory-call branch is
   * guarded by `import.meta.env.DEV` so Vite's `define` replacement removes
   * it from the production chunk (same pattern CardGameScene uses for its
   * own default tools). Other games don't call this branch.
   */
  protected override initSettingsPanel(
    difficultyNames?: readonly string[],
    defaultDifficulty?: string,
    hasTooltips?: boolean,
    skillRating?: import('../../../src/ui/SettingsPanel').SkillRatingConfig,
    debugTools?: import('../../../src/ui/debug/DebugToolsRegistry').DebugToolsEntry[],
  ): void {
    // Escape cancels an in-progress hand-card targeting phase before it opens
    // the settings panel (CG-0MT3IYSRL001VVUP).
    const vetoToggle = () => this.settingsToggleAllowed();
    if (debugTools !== undefined) {
      super.initSettingsPanel(difficultyNames, defaultDifficulty, hasTooltips, skillRating, debugTools, vetoToggle);
      return;
    }
    if (import.meta.env.DEV) {
      super.initSettingsPanel(difficultyNames, defaultDifficulty, hasTooltips, skillRating, [
        createSessionExportTool(),
        createStateInspectorTool(),
        createGameEventLogTool(),
        createAiDecisionViewerTool(),
        createMarketCardCheatTool(),
        createStaffApplicantCheatTool(),
      ], vetoToggle);
      return;
    }
    super.initSettingsPanel(difficultyNames, defaultDifficulty, hasTooltips, skillRating, debugTools, vetoToggle);
  }

  /**
   * Whether the settings-panel toggle key may act.
   *
   * While a hand-card targeting phase is active, Escape is reserved for
   * cancelling that targeting (CG-0MT3IYSRL001VVUP); otherwise Escape toggles
   * the settings panel as usual. The panel can always be closed with Escape.
   */
  private settingsToggleAllowed(): boolean {
    if (this.settingsPanel?.isOpen) return true;
    return !(this.msTurnController?.hasPendingTargeting?.() ?? false);
  }
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

  /**
   * When true, the day-banner at boot is deferred until the player commits
   * to playing (skips the tutorial offer, starts the tutorial, or resumes
   * from checkpoint). Cleared after it fires exactly once.
   */
  public deferredDayBanner = false;

  /**
   * Plays the deferred day-banner animation if one is pending.
   * Clears the `deferredDayBanner` flag so it fires at most once.
   * Safe to call when no banner is pending (no-op).
   */
  public playDeferredDayBanner(): void {
    if (!this.deferredDayBanner) return;
    this.deferredDayBanner = false;
    try { this.msAnimator?.animateDayBanner({ day: this.state?.turn ?? 1 }); } catch (_) { /* presentation-only */ }
  }

  // Pending selection for placing a business
  public pendingBusinessCard: BusinessCard | null = null;
  public pendingBusinessSourceIndex: number | null = null;

  // Pending hand card for placing from hand (index into state.hand)
  public pendingHandIndex: number | null = null;

  // True when the pending hand card was just moved from the market this turn
  // (same-day move+place composite = 1 action). False when the card was
  // already in hand (placing then costs a second action).
  public pendingHandJustMoved: boolean = false;

  // ID of the hand card most recently moved from the market this turn
  // (CG-0MSXIQIPJ000NDTL). The card rests unselected in the hand; when the
  // player clicks it, pendingHandJustMoved is derived from this ID so placing
  // the just-moved card stays free (same-day move+place = 1 action) while any
  // other held card still costs an action. Cleared on placement, cancel, new
  // day, or undo.
  public justMovedHandCardId: string | null = null;

  /**
   * Pending staff applicant for the current day (CG-0MSTOATDU006UGAX).
   * Mirrored from `state.pendingApplicant` at startup / day-start for the
   * scene's uiPhase decision. Null when no applicant is present.
   */
  public pendingApplicant: PendingApplicant | null = null;

  /**
   * The applicant overlay container rendered by MainStreetRenderer.refreshApplicant.
   * Created lazily on first applicant presentation, cleaned up when the phase ends.
   */
  public applicantOverlayContainer: Phaser.GameObjects.Container | null = null;

  /**
   * Id of the applicant card currently rendered in `applicantOverlayContainer`.
   * `refreshApplicant()` renders each applicant exactly once, so a repeated
   * `refreshAll()` never rebuilds the card face or replays the walk-on tween
   * (CG-0MSTOATDU006UGAX).
   */
  public applicantRenderedId: string | null = null;

  /**
   * True while a hire/decline walk tween is playing. `refreshApplicant()`
   * leaves the overlay untouched during the animation so the tween's target
   * is never destroyed mid-flight (CG-0MSTOATDU006UGAX).
   */
  public applicantAnimating = false;

  // Computed responsive layout metrics
  public layout!: SceneLayout;

  // ── Street-map camera (CG-0MTH9OVMC001V44E) ──────────────
  //
  // The street board is viewed through a map-style camera: zoom level 1 is the
  // legacy framing (scale 1, identity transform) and each level up zooms the
  // map out to reveal neighbouring street cells. Zoom/pan is always available
  // — never gated by milestones, turns, or resources.
  //
  // The camera is scene-owned (not part of `state`) because it is a pure view
  // concern: gameplay, adjacency, and save/load stay camera-independent. The
  // serialization slice of this epic can persist it via
  // `getStreetCameraForTest()` / `setStreetCameraState()`.
  public streetCamera: StreetCameraState = { zoomLevel: 1, focusX: 0, focusY: 0 };
  /** True once the camera has been seeded from the computed layout. */
  private streetCameraReady = false;
  /**
   * Displayed street lattice, in street cells. A 1×1 lattice (the default and
   * the shipping board) renders exactly the pre-camera 10-slot street. Larger
   * lattices reveal neighbouring streets as view-only cells; making them
   * playable is the viewport-rendering slice of the same epic.
   */
  public streetViewLattice: StreetLatticeDims = { cols: 1, rows: 1 };
  /** Mask graphics clipping the street map to its viewport band. */
  public streetMapMaskGraphics: Phaser.GameObjects.Graphics | null = null;
  /** Zoom control objects (owned by `hudContainer`, rebuilt on refresh). */
  public streetZoomControls: Phaser.GameObjects.GameObject[] = [];
  /** Active drag-to-pan gesture on the street backdrop (null when idle). */
  public streetPanDrag: { lastX: number; lastY: number } | null = null;
  /**
   * Signature of the street slot set currently rendered. Zooming/panning only
   * rebuilds the street layer when the visible slot set actually changes, so
   * smooth panning does not re-create game objects on every pointer move.
   */
  private streetRenderedKey = '';

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
  /** Whether the log should auto-scroll to show the latest entry on each refresh.
   * Starts `true` so the log defaults to showing the bottom (newest entries).
   * Set to `false` when the player scrolls up to read history; re-engages
   * automatically when they wheel-scroll back to the bottom (see
   * `MainStreetRenderer.refreshLog` and `MainStreetInputManager.handleLogWheel`). */
  public logAutoScroll = true;
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

  // ── Street-map camera (CG-0MTH9OVMC001V44E) ──────────────

  /**
   * Seeds the camera from the computed layout (once) and re-clamps it against
   * the current layout/lattice. Safe to call repeatedly — `handleResize()`
   * recomputes `layout`, and re-clamping keeps the map framed.
   */
  public ensureStreetCamera(): void {
    if (!this.layout) return;
    if (!this.streetCameraReady) {
      this.streetCamera = defaultStreetCamera(this.layout);
      this.streetCameraReady = true;
    }
    this.streetCamera = clampStreetCamera(this.streetCamera, this.layout, this.streetViewLattice);
  }

  /** Public snapshot of the camera state (used by tests and save/load). */
  public getStreetCameraState(): StreetCameraState {
    this.ensureStreetCamera();
    return { ...this.streetCamera };
  }

  /**
   * Restores a previously captured camera state (used by tests and, later, by
   * checkpoint resume). The value is clamped to the current lattice.
   */
  public setStreetCameraState(camera: Partial<StreetCameraState> | null | undefined): void {
    if (!camera || !this.layout) return;
    this.streetCamera = clampStreetCamera(
      {
        zoomLevel: camera.zoomLevel ?? this.streetCamera.zoomLevel,
        focusX: camera.focusX ?? this.streetCamera.focusX,
        focusY: camera.focusY ?? this.streetCamera.focusY,
      },
      this.layout,
      this.streetViewLattice,
    );
    this.streetCameraReady = true;
    this.applyStreetCamera(false);
    this.syncStreetRender();
  }

  /**
   * Re-renders the street layer only when the set of visible slots changed.
   * Called after every camera change; the transform itself is applied
   * separately so panning stays cheap.
   */
  private syncStreetRender(): void {
    if (!this.layout) return;
    const key = visibleMapSlots(this.streetCamera, this.layout, this.streetViewLattice)
      .map((node) => `${node.cellX},${node.cellY},${node.slotIndex}`)
      .join('|');
    if (key === this.streetRenderedKey) return;
    this.streetRenderedKey = key;
    this.refreshStreetGrid();
  }

  /**
   * Sets the map zoom level (1 = legacy framing, higher = zoomed out) and
   * re-applies the street transform. Zoom is always available.
   */
  public setStreetZoomLevel(zoomLevel: number, animate = true): void {
    this.ensureStreetCamera();
    this.streetCamera = clampStreetCamera(
      { ...this.streetCamera, zoomLevel: clampZoomLevel(zoomLevel) },
      this.layout,
      this.streetViewLattice,
    );
    // Apply the transform first so an animated zoom tweens from the old
    // framing; the visibility sync then re-renders without interrupting it.
    this.applyStreetCamera(animate);
    this.syncStreetRender();
  }

  /** Zooms the street map out by one level (reveals neighbouring streets). */
  public zoomStreetOut(animate = true): void {
    this.setStreetZoomLevel(zoomOutLevel(this.streetCamera.zoomLevel), animate);
  }

  /** Zooms the street map in by one level (back toward the legacy framing). */
  public zoomStreetIn(animate = true): void {
    this.setStreetZoomLevel(zoomInLevel(this.streetCamera.zoomLevel), animate);
  }

  /** Pans the street map by a screen-pixel delta (clamped to the map bounds). */
  public panStreetBy(dxScreen: number, dyScreen: number): void {
    this.ensureStreetCamera();
    this.streetCamera = panStreetCamera(
      this.streetCamera,
      dxScreen,
      dyScreen,
      this.layout,
      this.streetViewLattice,
    );
    this.applyStreetCamera(false);
    this.syncStreetRender();
  }

  /** Returns the map to the default 1× framing. */
  public resetStreetCamera(animate = true): void {
    if (!this.layout) return;
    this.streetCamera = defaultStreetCamera(this.layout);
    this.streetCameraReady = true;
    this.applyStreetCamera(animate);
    this.syncStreetRender();
  }

  /**
   * Sets the number of street cells displayed by the map (each cell is a 2×5
   * street). Neighbouring cells are view-only until the expanded-grid slices
   * make them playable. Always keeps the playable board's origin cell anchored
   * so the 1× framing is unchanged.
   */
  public setStreetViewLattice(cols: number, rows: number): void {
    const lattice: StreetLatticeDims = {
      cols: Math.max(1, Math.floor(cols)),
      rows: Math.max(1, Math.floor(rows)),
    };
    this.streetViewLattice = lattice;
    this.ensureStreetCamera();
    this.streetRenderedKey = '';
    this.applyStreetCamera(true);
    this.syncStreetRender();
  }

  /** Current displayed street lattice (view cells). */
  public getStreetViewLattice(): StreetLatticeDims {
    return { ...this.streetViewLattice };
  }

  /**
   * Applies the camera to the street layer (container scale/position plus the
   * viewport mask). Delegates to the renderer, which owns the Phaser objects.
   * Zoom animations are skipped under reduced motion (`animate` is ignored).
   */
  public applyStreetCamera(animate = false): void {
    this.ensureStreetCamera();
    (this.msRenderer as any)?.applyStreetCamera?.(animate);
  }

  /** Rebuilds the zoom control cluster (always-available +/- buttons). */
  public refreshStreetZoomControls(): void {
    (this.msRenderer as any)?.refreshStreetZoomControls?.();
  }

  /** Converts a map-local point of the street layer to canvas coordinates. */
  public streetLocalToScreen(point: { x: number; y: number }): { x: number; y: number } {
    this.ensureStreetCamera();
    return localToScreen(point, this.streetCamera, this.layout);
  }

  /** Converts canvas coordinates into street map-local space. */
  public streetScreenToLocal(point: { x: number; y: number }): { x: number; y: number } {
    this.ensureStreetCamera();
    return screenToLocal(point, this.streetCamera, this.layout);
  }

  /**
   * Test/API hook returning the current camera together with the derived
   * container transform, so browser tests can assert the framed view.
   */
  public getStreetCameraForTest(): {
    camera: StreetCameraState;
    lattice: StreetLatticeDims;
    scale: number;
    containerX: number;
    containerY: number;
  } {
    const camera = this.getStreetCameraState();
    const container = this.streetContainer;
    return {
      camera,
      lattice: this.getStreetViewLattice(),
      scale: container?.scaleX ?? 1,
      containerX: container?.x ?? 0,
      containerY: container?.y ?? 0,
    };
  }

  /**
   * Initialises the street-map camera and its always-available controls.
   * Called once from the lifecycle `create()` after the containers exist.
   */
  public initStreetCamera(): void {
    this.ensureStreetCamera();
    (this.msRenderer as any)?.installStreetMapMask?.();
    (this.msInputManager as any)?.initStreetCameraControls?.();
    this.streetRenderedKey = this.layout
      ? visibleMapSlots(this.streetCamera, this.layout, this.streetViewLattice)
          .map((node) => `${node.cellX},${node.cellY},${node.slotIndex}`)
          .join('|')
      : '';
    this.applyStreetCamera(false);
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

  // ── Incident Deck Panel (private accessors; names retain the legacy
  // ── 'IncidentQueue' for API/test compatibility) ──
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

  /** Staff peek action proxy (forward to turn controller, CG-0MSXOW6GN008ZSMN). */
  public onPeekClick(...args: any[]): any {
    return (this.msTurnController as any).onPeekClick.apply(this.msTurnController, args);
  }

  /** Community Favour action proxy (forward to turn controller, CG-0MSTOATDQ005XDET). */
  public onCommunityFavourClick(...args: any[]): any {
    return (this.msTurnController as any).onCommunityFavourClick.apply(this.msTurnController, args);
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
  public onHandUpgradeCardClick(...args: any[]): any {
    return (this.msTurnController as any).onHandUpgradeCardClick.apply(this.msTurnController, args);
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
  public onStaffCardClick(...args: any[]): any {
    return (this.msTurnController as any).onStaffCardClick.apply(this.msTurnController, args);
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

  /**
   * Destroys the staff-applicant overlay and resets its render bookkeeping
   * (CG-0MSTOATDU006UGAX). Safe to call when no overlay exists.
   */
  public clearApplicantOverlay(): void {
    const overlay = this.applicantOverlayContainer;
    if (overlay) {
      overlay.removeAll(true);
      try { this.hudContainer?.remove(overlay, true); } catch (_) { /* already detached */ }
    }
    this.applicantOverlayContainer = null;
    this.applicantRenderedId = null;
  }

  /**
   * Hire the pending staff applicant (CG-0MSTOATDU006UGAX).
   *
   * Action-free: consumes no daily action and costs 0 coins. The member is
   * employed at the applicant's target business slot (so its passive
   * specialization buff applies from the next income phase) and its salary
   * becomes an ongoing per-turn cost. Plays the walk-in tween toward that
   * slot before refreshing the HUD. If the engine rejects the hire (the slot
   * filled up since the applicant appeared) the applicant stays pending.
   */
  public onHireApplicant(): void {
    const pending = this.pendingApplicant
      ?? ((this.state as { pendingApplicant?: PendingApplicant | null }).pendingApplicant ?? null);
    if (!pending) return;

    const targetSlotIndex = pending.targetSlotIndex;
    const overlay = this.applicantOverlayContainer;

    try {
      hireStaffApplicant(this.state as any);
    } catch (e) {
      console.error('[MainStreet] hire applicant failed:', e);
      this.refreshAll();
      return;
    }

    // The engine clears state.pendingApplicant on success; a still-set value
    // means the target slot was full and the hire was rejected.
    const stillPending = (this.state as { pendingApplicant?: PendingApplicant | null }).pendingApplicant ?? null;
    if (stillPending != null) {
      this.pendingApplicant = stillPending;
      this.uiPhase = 'applicant';
      this.refreshAll();
      return;
    }

    this.pendingApplicant = null;
    this.uiPhase = 'market';
    this.playApplicantExit('walk-in', overlay, targetSlotIndex);
  }

  /**
   * Decline the pending staff applicant (CG-0MSTOATDU006UGAX).
   * Action-free and side-effect free: the card walks off to the right and
   * leaves the applicant pool (it is not returned to the staff deck).
   */
  public onDeclineApplicant(): void {
    const pending = this.pendingApplicant
      ?? ((this.state as { pendingApplicant?: PendingApplicant | null }).pendingApplicant ?? null);
    if (!pending) return;

    const overlay = this.applicantOverlayContainer;

    try {
      declineStaffApplicant(this.state as any);
    } catch (e) {
      console.error('[MainStreet] decline applicant failed:', e);
      this.refreshAll();
      return;
    }

    this.pendingApplicant = null;
    this.uiPhase = 'market';
    this.playApplicantExit('walk-off', overlay, pending.targetSlotIndex);
  }

  /**
   * Plays the applicant's exit tween — walk-in toward the target business
   * slot on hire, walk-off to the right on decline — then destroys the
   * overlay and refreshes the scene.
   *
   * Falls back to immediate cleanup when no overlay is rendered or no
   * animator is available (replay/headless mode, or reduced motion, which
   * completes synchronously inside the animator).
   *
   * @param direction 'walk-in' (hire) or 'walk-off' (decline).
   * @param overlay   The rendered applicant overlay, if any.
   * @param slotIndex Target business slot index (used by 'walk-in').
   */
  private playApplicantExit(
    direction: 'walk-in' | 'walk-off',
    overlay: Phaser.GameObjects.Container | null,
    slotIndex: number,
  ): void {
    const reducedMotion = (this as any).settingsPanel?.reducedMotion;
    const cardW = this.layout?.handCardW ?? 120;
    const cardH = this.layout?.handCardH ?? 170;

    const finish = (): void => {
      this.applicantAnimating = false;
      this.clearApplicantOverlay();
      this.refreshAll();
    };

    if (!overlay || !this.msAnimator) {
      finish();
      return;
    }

    this.applicantAnimating = true;
    if (direction === 'walk-in') {
      this.msAnimator.animateApplicantWalkIn(overlay, slotIndex, cardW, cardH, reducedMotion, finish);
    } else {
      this.msAnimator.animateApplicantWalkOff(overlay, cardW, cardH, reducedMotion, finish);
    }
  }

  /**
   * Shows the buy-and-play premium explainer dialog.
   *
   * Fires before a same-turn buy-and-play (click composite placement or
   * drag) commits a +50% premium charge (CG-0MT24X0SX007RLHN). Proceed
   * continues the placement at the premium price; cancel aborts it (the
   * card returns to where it came from with no coins deducted).
   *
   * @param cardName  Card being placed.
   * @param onProceed Callback when the player proceeds at the premium price.
   * @param onCancel  Callback when the player cancels.
   */
  public showBuyAndPlacePremiumDialog(cardName: string, onProceed: () => void, onCancel: () => void): void {
    if (this.msOverlayManager && typeof (this.msOverlayManager as any).showBuyAndPlacePremiumDialog === 'function') {
      (this.msOverlayManager as any).showBuyAndPlacePremiumDialog(cardName, onProceed, onCancel);
    }
  }

  /**
   * Shows the dual-choice incident dialog for a pending `hasChoices` event
   * (CG-0MTSHG8RP008E128). Accept applies the event's stated consequence;
   * Reject refuses it and an unknown escalation card replaces it in the deck.
   * Delegates to the overlay manager's showEventChoiceDialog.
   *
   * @param event    The pending choice event (effect deferred).
   * @param onAccept Callback when the player accepts.
   * @param onReject Callback when the player rejects.
   */
  public showEventChoiceDialog(
    event: import('../MainStreetCards').EventCard,
    onAccept: () => void,
    onReject: () => void,
  ): void {
    if (this.msOverlayManager && typeof (this.msOverlayManager as any).showEventChoiceDialog === 'function') {
      (this.msOverlayManager as any).showEventChoiceDialog(event, onAccept, onReject);
    }
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
