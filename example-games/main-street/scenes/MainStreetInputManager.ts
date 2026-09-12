import { addLog } from '../MainStreetState';
import { generateHint, type HintResult } from '../MainStreetHint';
import { recordMainStreetEvent } from '../MainStreetTranscript';
import { FONT_FAMILY } from '../../../src/ui';
import { LOG_SCROLL_SPEED, LOG_TITLE_H } from './MainStreetConstants';
import { streetViewportRect } from '../MainStreetMapView';

/** Screen-pixel pan applied per arrow-key press (CG-0MTH9OVMC001V44E). */
const STREET_KEY_PAN_STEP = 48;

export class MainStreetInputManager {
  constructor(private readonly scene: any) {}

  // ── Street-map camera controls (CG-0MTH9OVMC001V44E) ──────

  /** Bound wheel handler, kept so it can be detached on scene shutdown. */
  private streetWheelHandler: ((pointer: any, objects: any, dx: number, dy: number) => void) | null = null;
  /** Bound keydown handler, kept so it can be detached on scene shutdown. */
  private streetKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  /** Bound global pointer handlers for drag-to-pan. */
  private streetPointerMoveHandler: ((pointer: any) => void) | null = null;
  private streetPointerUpHandler: (() => void) | null = null;

  /**
   * Registers the always-available street-map camera controls.
   *
   * The camera is never gated by milestones, turns, or resources: the wheel
   * zooms whenever the pointer is over the street band, `+`/`-` zoom, the
   * arrow keys pan, `0` resets the framing, and dragging the street backdrop
   * pans while the map is zoomed out. Modal overlays (help/settings/stats)
   * keep input priority, mirroring the other global key handlers.
   */
  public initStreetCameraControls(): void {
    const s = this.scene;
    if (!s?.input) return;

    if (!this.streetWheelHandler) {
      this.streetWheelHandler = (pointer: any, _objects: any, _deltaX: number, deltaY: number) => {
        this.handleStreetWheel(pointer, deltaY);
      };
    }
    if (!this.streetKeyHandler) {
      this.streetKeyHandler = (event: KeyboardEvent) => this.handleStreetCameraKey(event);
    }
    if (!this.streetPointerMoveHandler) {
      this.streetPointerMoveHandler = (pointer: any) => this.handleStreetPanMove(pointer);
    }
    if (!this.streetPointerUpHandler) {
      this.streetPointerUpHandler = () => { s.streetPanDrag = null; };
    }

    try {
      s.input.off('wheel', this.streetWheelHandler, s);
      s.input.on('wheel', this.streetWheelHandler, s);
      s.input.off('pointermove', this.streetPointerMoveHandler, s);
      s.input.on('pointermove', this.streetPointerMoveHandler, s);
      s.input.off('pointerup', this.streetPointerUpHandler, s);
      s.input.on('pointerup', this.streetPointerUpHandler, s);
    } catch (_) { /* ignore in constrained test environments */ }

    try {
      if (s.input.keyboard) {
        s.input.keyboard.off('keydown', this.streetKeyHandler);
        s.input.keyboard.on('keydown', this.streetKeyHandler);
      } else if (typeof window !== 'undefined') {
        window.addEventListener('keydown', this.streetKeyHandler as EventListener);
      }
    } catch (_) { /* ignore in constrained test environments */ }

    s.events?.once?.('shutdown', () => {
      try {
        if (s.input?.keyboard && this.streetKeyHandler) {
          s.input.keyboard.off('keydown', this.streetKeyHandler);
        } else if (typeof window !== 'undefined' && this.streetKeyHandler) {
          window.removeEventListener('keydown', this.streetKeyHandler as EventListener);
        }
      } catch (_) { /* ignore */ }
    });
  }

  /**
   * Mouse-wheel zoom while the pointer is over the street band.
   * Wheel up zooms in (toward the legacy 1× framing), wheel down zooms out.
   */
  public handleStreetWheel(pointer: any, deltaY: number): void {
    const s = this.scene;
    if (!pointer || !s?.layout) return;
    if (!this.pointerOverStreet(pointer)) return;
    if (!deltaY) return;
    if (deltaY < 0) s.zoomStreetIn();
    else s.zoomStreetOut();
  }

  /**
   * Keyboard shortcuts for the street camera: `+`/`-` zoom, arrows pan,
   * `0` resets. Suppressed while a modal overlay owns the input.
   */
  public handleStreetCameraKey(event: KeyboardEvent): void {
    const s = this.scene;
    if (!s || s.replayMode || !event) return;
    if (this.modalOverlayOpen()) return;

    switch (event.key) {
      case '+':
      case '=':
        s.zoomStreetIn();
        break;
      case '-':
      case '_':
        s.zoomStreetOut();
        break;
      case '0':
        s.resetStreetCamera();
        break;
      case 'ArrowLeft':
        s.panStreetBy(STREET_KEY_PAN_STEP, 0);
        break;
      case 'ArrowRight':
        s.panStreetBy(-STREET_KEY_PAN_STEP, 0);
        break;
      case 'ArrowUp':
        s.panStreetBy(0, STREET_KEY_PAN_STEP);
        break;
      case 'ArrowDown':
        s.panStreetBy(0, -STREET_KEY_PAN_STEP);
        break;
      default:
        return;
    }
  }

  /**
   * Makes the street backdrop a drag-to-pan surface. Panning is only engaged
   * while the map is zoomed out — at 1× the street fills its viewport and
   * there is nothing to pan to.
   */
  public attachStreetPanZone(zone: any): void {
    const s = this.scene;
    if (!zone || s.replayMode) return;
    try {
      zone.setInteractive({ useHandCursor: false });
    } catch (_) {
      return;
    }
    zone.on('pointerdown', (pointer: any) => {
      if (!pointer) return;
      if (s.streetCamera.zoomLevel <= 1) return;
      s.streetPanDrag = { lastX: pointer.x, lastY: pointer.y };
    });
  }

  /** Applies an in-progress drag-to-pan gesture. */
  public handleStreetPanMove(pointer: any): void {
    const s = this.scene;
    if (!pointer || !s.streetPanDrag) return;
    const dx = pointer.x - s.streetPanDrag.lastX;
    const dy = pointer.y - s.streetPanDrag.lastY;
    s.streetPanDrag = { lastX: pointer.x, lastY: pointer.y };
    s.panStreetBy(dx, dy);
  }

  /** True while the pointer is inside the street map viewport band. */
  private pointerOverStreet(pointer: { x: number; y: number }): boolean {
    const s = this.scene;
    const viewport = streetViewportRect(s.layout);
    return (
      pointer.x >= viewport.x && pointer.x <= viewport.x + viewport.w &&
      pointer.y >= viewport.y && pointer.y <= viewport.y + viewport.h
    );
  }

  /** True while a modal overlay owns keyboard/mouse input. */
  private modalOverlayOpen(): boolean {
    const s = this.scene;
    if (Array.isArray(s.overlayObjects) && s.overlayObjects.length > 0) return true;
    if (s.helpPanel?.isOpen) return true;
    if (s.settingsPanel?.isOpen) return true;
    if (s.statsOverlay?.isOpen) return true;
    return false;
  }

  public initSvgDebugOverlay(): void {
    const s = this.scene;
    if (!s.svgDebugEnabled) return;
    s.svgDebugText = s.add.text(10, 42, '', {
      fontSize: '12px',
      color: '#9be0ff',
      fontFamily: FONT_FAMILY,
      backgroundColor: '#00000088',
      padding: { x: 6, y: 4 },
    }).setDepth(10_000).setScrollFactor(0);
  }

  public updateSvgDebugOverlay(): void {
    const s = this.scene;
    if (!s.svgDebugEnabled || !s.svgDebugText) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const keys = Object.keys((s.textures as unknown as { list?: Record<string, unknown> }).list ?? {});
    const cardTextureKeys = keys.filter((k) => k.startsWith('ms_card_'));

    let sampleLine = 'sample: none';
    const containers = s.marketContainer?.list ?? [];
    for (const obj of containers) {
      const c = obj as Phaser.GameObjects.Container;
      if (!c.list) continue;
      for (const child of c.list) {
        const img = child as Phaser.GameObjects.Image;
        const key = img?.texture?.key;
        if (key && key.startsWith('ms_card_')) {
          const tex = s.textures.get(key);
          const src = tex?.source?.[0] as { width?: number; height?: number } | undefined;
          sampleLine = `sample: ${key} disp:${Math.round(img.displayWidth)}x${Math.round(img.displayHeight)} src:${src?.width ?? '?'}x${src?.height ?? '?'}`;
          break;
        }
      }
      if (sampleLine !== 'sample: none') break;
    }

    const canvasW = (s.game?.canvas?.width ?? 0);
    const canvasH = (s.game?.canvas?.height ?? 0);
    s.svgDebugText.setText([
      '[SVG Debug]',
      `dpr:${dpr} canvas:${canvasW}x${canvasH} scale:${Math.round(s.scale.width)}x${Math.round(s.scale.height)}`,
      `svg sources:${s.cardSvgSources.size} generated textures:${cardTextureKeys.length}`,
      sampleLine,
    ]);
  }

  public onHintClick(): void {
    const s = this.scene;
    if (s.hintUsedThisTurn) return;
    if (s.uiPhase !== 'market') return;

    const hint: HintResult | null = generateHint(s.state);
    if (!hint) {
      s.hintBar?.setText('Hint not available right now.');
      return;
    }

    s.hintUsedThisTurn = true;

    if (hint.action.type === 'buy-business') {
      s.hintedCardId = hint.action.cardId;
      s.hintedSlotIndex = hint.action.slotIndex;
    } else if (hint.action.type === 'buy-upgrade') {
      s.hintedCardId = hint.action.cardId;
      s.hintedSlotIndex = hint.action.targetSlot ?? null;
    } else if (hint.action.type === 'buy-event') {
      s.hintedCardId = hint.action.cardId;
      s.hintedSlotIndex = null;
    } else if (hint.action.type === 'play-event') {
      s.hintedCardId = (s.state.hand ?? []).find((c: any) => c.family === 'event')?.id ?? null;
      s.hintedSlotIndex = null;
    } else {
      s.hintedCardId = null;
      s.hintedSlotIndex = null;
    }

    s.hintBar?.setText(`Hint: ${hint.rationale}`);
    addLog(s.state, `Hint: ${hint.rationale}`, 'neutral');
    try { recordMainStreetEvent({ type: 'hint', turn: s.state.turn, recommendedAction: hint.action, rationale: hint.rationale }); } catch (_) {}

    s.refreshActionButtons();
    s.refreshStreetGrid();
    s.refreshMarket();
    s.refreshPlayerHand();
  }

  public clearMarketSelection(): void {
    const s = this.scene;
    s.marketSelectionManager?.clear();
    s.selectedMarketCardId = null;
  }

  public selectMarketCardById(cardId: string): void {
    const s = this.scene;
    const selection = s.marketSelectionByCardId.get(cardId);
    if (!selection) return;
    s.marketSelectionManager.select(selection);
  }

  public updateLogMask(): void {
    const s = this.scene;
    if (!s.logMaskGraphics) return;
    s.logMaskGraphics.clear();
    s.logMaskGraphics.fillStyle(0xffffff, 0);
    s.logMaskGraphics.fillRect(
      s.layout.logX,
      s.layout.logY + LOG_TITLE_H,
      s.layout.logW,
      s.layout.logH - LOG_TITLE_H - 2,
    );
  }

  public handleLogWheel(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    const s = this.scene;
    if (
      pointer.x < s.layout.logX || pointer.x > s.layout.logX + s.layout.logW ||
      pointer.y < s.layout.logY || pointer.y > s.layout.logY + s.layout.logH
    ) {
      return;
    }
    if (s.logMaxScroll <= 0) return;

    s.logScrollOffset = Phaser.Math.Clamp(
      s.logScrollOffset + (deltaY > 0 ? LOG_SCROLL_SPEED : -LOG_SCROLL_SPEED),
      0,
      s.logMaxScroll,
    );

    const BOTTOM_THRESHOLD = 4;
    s.logAutoScroll = s.logScrollOffset >= s.logMaxScroll - BOTTOM_THRESHOLD;

    // Container re-rendering and mask update is handled by the caller (scene.handleLogWheel -> refreshLog)
  }

  public applyLogScroll(): void {
    const s = this.scene;
    // Apply the scroll offset by shifting the content container upward.
    s.logContentContainer.setY(LOG_TITLE_H + 2 - s.logScrollOffset);

    // Per-entry visibility safety net (see refreshLog for details)
    const visibleH = Math.max(1, s.layout.logH - LOG_TITLE_H - 4);
    const visibleStart = s.logScrollOffset;
    const visibleEnd = s.logScrollOffset + visibleH;
    for (const child of s.logContentContainer.list) {
      const localY = (child as any).y;
      if (localY >= visibleStart && localY < visibleEnd) {
        child.setVisible(true);
      } else {
        child.setVisible(false);
      }
    }

    s.updateLogMask();
  }
}
