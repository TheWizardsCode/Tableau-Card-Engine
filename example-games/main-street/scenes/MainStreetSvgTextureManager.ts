import { CARD_TEMPLATE_NAMES } from '../MainStreetCards';
import { rasteriseSvgToTexture, makeTextureKey } from '../../../src/core-engine';

export class MainStreetSvgTextureManager {
  private lastDevicePixelRatio: number;

  constructor(private readonly scene: any) {
    this.lastDevicePixelRatio = this.getCurrentDevicePixelRatio();
  }

  private getCurrentDevicePixelRatio(): number {
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }

  /**
   * Keeps texture cache aligned with display metrics. If DPR changed, clear
   * cached card textures so next prewarm/request regenerates at the new DPR.
   */
  public syncDisplayMetrics(): { dprChanged: boolean; removedTextureCount: number } {
    const currentDpr = this.getCurrentDevicePixelRatio();
    if (currentDpr === this.lastDevicePixelRatio) {
      return { dprChanged: false, removedTextureCount: 0 };
    }

    this.lastDevicePixelRatio = currentDpr;

    const textureKeys: string[] = this.scene.textures?.getTextureKeys?.() ?? [];
    const cardKeys = textureKeys.filter((key) => key.startsWith('ms_card_'));
    for (const key of cardKeys) {
      try {
        this.scene.textures?.remove?.(key);
      } catch {
        // ignore cache cleanup failures in constrained test environments
      }
    }

    return { dprChanged: true, removedTextureCount: cardKeys.length };
  }

  public loadCardSvgSources(): void {
    const s = this.scene;
    const fetches: Promise<void>[] = [];
    for (const templateId of CARD_TEMPLATE_NAMES.keys()) {
      const path = `assets/games/main-street/svg/cards/${templateId}.svg`;
      const p = fetch(path)
        .then((resp) => (resp.ok ? resp.text() : null))
        .then((text) => {
          if (text) {
            s.cardSvgSources.set(templateId, text);
          }
        })
        .catch(() => { /* ignore fetch failures in test environments */ });
      fetches.push(p);
    }
    s.cardSvgLoadPromise = Promise.all(fetches).then(() => {});
  }

  public async prewarmVisibleCardTextures(): Promise<void> {
    const s = this.scene;
    const visibleTemplates = new Set<string>();

    for (const card of s.state.market.business) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }

    for (const card of s.state.market.investments) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }

    for (const card of s.state.incidentQueue) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }

    for (const biz of s.state.streetGrid) {
      if (biz) visibleTemplates.add(this.templateIdFromCardId(biz.id));
    }

    if (s.state.heldEvent) {
      visibleTemplates.add(this.templateIdFromCardId(s.state.heldEvent.id));
    }

    const dpr = this.getCurrentDevicePixelRatio();
    const rasterizePromises: Promise<void>[] = [];

    for (const templateId of visibleTemplates) {
      const svgText = s.cardSvgSources.get(templateId);
      if (!svgText) continue;

      const sizes = [
        { w: s.layout.marketCardW, h: s.layout.marketCardH },
        { w: s.layout.slotW, h: s.layout.slotH },
        { w: s.layout.handW, h: s.layout.handH },
      ];

      for (const size of sizes) {
        const key = makeTextureKey(templateId, size.w, size.h, dpr);
        if (s.textures.exists(key)) continue;

        const p = rasteriseSvgToTexture(s, key, svgText, size.w, size.h, dpr)
          .catch(() => {});
        rasterizePromises.push(p);
      }
    }

    await Promise.all(rasterizePromises);
  }

  public templateIdFromCardId(cardId: string): string {
    return cardId.replace(/-\d+$/, '');
  }

  public requestCardTexture(cardId: string, renderW: number, renderH: number): void {
    const s = this.scene;
    const templateId = this.templateIdFromCardId(cardId);
    const svgText = s.cardSvgSources.get(templateId);
    if (!svgText) return;

    const dpr = this.getCurrentDevicePixelRatio();
    const key = makeTextureKey(templateId, renderW, renderH, dpr);
    if (s.textures.exists(key)) return;

    void rasteriseSvgToTexture(s, key, svgText, renderW, renderH, dpr).then(() => {
      try {
        s.refreshAll();
      } catch {
        // scene may be shutting down
      }
    });
  }

  public templateKeyForCard(cardId: string, width?: number, height?: number): string {
    const base = cardId.replace(/-\d+$/, '');
    if (width !== undefined && height !== undefined) {
      const dpr = this.getCurrentDevicePixelRatio();
      return makeTextureKey(base, width, height, dpr);
    }
    return `ms_card_${base}`;
  }

}
