import { addLog } from '../MainStreetState';
import { generateHint, type HintResult } from '../MainStreetHint';
import { recordMainStreetEvent } from '../MainStreetTranscript';
import { FONT_FAMILY } from '../../../src/ui';
import { LOG_SCROLL_SPEED, LOG_TITLE_H } from './MainStreetConstants';

export class MainStreetInputManager {
  constructor(private readonly scene: any) {}

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
      s.instructionText.setText('Hint not available right now.');
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
      s.hintedCardId = s.state.heldEvent?.id ?? null;
      s.hintedSlotIndex = null;
    } else {
      s.hintedCardId = null;
      s.hintedSlotIndex = null;
    }

    s.instructionText.setText(`Hint: ${hint.rationale}`);
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
    // The mask clips off-screen content above and below the visible area.
    s.logContentContainer.setY(LOG_TITLE_H + 2 - s.logScrollOffset);
    s.updateLogMask();
  }
}
