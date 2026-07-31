import { CARD_TEMPLATE_NAMES, getCsvRows } from '../MainStreetCards';
import { rasteriseSvgToTexture, makeTextureKey } from '../../../src/core-engine';
import { generateCardSvgFromCsvRow } from './MainStreetCardSvgGenerator';

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

  /**
   * Regenerates SVG sources from the current CSV data.
   *
   * When the card-data.csv has changed since the static SVGs were generated,
   * this method produces fresh SVG strings in-memory for all card templates
   * and stores them in `cardSvgSources`, overriding any stale fetched SVGs.
   *
   * Texture cache invalidation is NOT performed here — SVG source updates are
   * separated from texture lifecycle. Textures created by prewarm use the
   * correct CSV-fresh SVGs because this method runs before any prewarm call
   * (both the synchronous early call in loadCampaignAndSetup() and the re-apply
   * chain on cardSvgLoadPromise).
   *
   * If regeneration fails (e.g., CSV rows are not yet loaded), a warning is
   * logged and the scene continues with existing (possibly stale) SVGs.
   *
   * @returns The number of SVG sources regenerated, or 0 if regeneration was skipped.
   */
  public regenerateSvgSourcesFromCsv(): number {
    const s = this.scene;
    let count = 0;

    try {
      // Generate fresh SVGs from the parsed CSV rows
      for (const row of getCsvRows()) {
        const templateId = row.id;
        if (!templateId) continue;

        const svg = generateCardSvgFromCsvRow(row);
        s.cardSvgSources.set(templateId, svg);
        count++;
      }
    } catch (err) {
      console.warn('[MainStreetSvgTextureManager] Failed to regenerate SVGs from CSV:', err);
      return 0;
    }

    if (count > 0) {
      console.log('[MainStreetSvgTextureManager] Regenerated ' + count + ' card SVGs from CSV data');
    }

    return count;
  }

  public async prewarmVisibleCardTextures(): Promise<void> {
    const s = this.scene;
    const visibleTemplates = new Set<string>();

    for (const card of s.state.market.development) {
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
        { w: s.layout.queueCardW, h: s.layout.queueCardH },
      ];

      for (const size of sizes) {
        const key = makeTextureKey(templateId, size.w, size.h, dpr);

        // If a texture already exists for this key, keep it — it was created
        // from the correct CSV-based SVG sources by a prior prewarm call
        // (regenerateSvgSourcesFromCsv() runs before any prewarm). Skipping
        // existing textures avoids a race where removing+recreating triggers
        // rasteriseSvgToTexture's internal textureCache, which awaits pending
        // promises and yields to a render frame with a missing texture.
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
