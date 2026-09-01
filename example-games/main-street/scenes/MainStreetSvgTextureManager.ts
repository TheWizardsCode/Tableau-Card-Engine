import { CARD_TEMPLATE_NAMES, getCsvRows } from '../MainStreetCards';
import { rasteriseSvgToTexture, makeTextureKey } from '../../../src/core-engine';
import { generateCardSvgFromCsvRow, replaceCardTitleInSvg } from './MainStreetCardSvgGenerator';
import { CARD_BACK_TEMPLATE } from './MainStreetConstants';

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

    // Face-down incident-deck card back (CG-0MSXOWLHU0099QF6) — a static
    // SVG asset, not a CSV card template.
    const backPath = `assets/games/main-street/svg/cards/${CARD_BACK_TEMPLATE}.svg`;
    const backFetch = fetch(backPath)
      .then((resp) => (resp.ok ? resp.text() : null))
      .then((text) => {
        if (text) {
          s.cardSvgSources.set(CARD_BACK_TEMPLATE, text);
        }
      })
      .catch(() => { /* ignore fetch failures in test environments */ });
    fetches.push(backFetch);

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

    for (const card of s.state.market.cards) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }

    for (const card of s.state.incidentDeck) {
      if (card) visibleTemplates.add(this.templateIdFromCardId(card.id));
    }

    for (const biz of s.state.streetGrid) {
      if (biz) visibleTemplates.add(this.templateIdFromCardId(biz.id));
    }

    // Upgraded businesses on the street render a **variant** face with their
    // display name baked in (CG-0MT24MHGZ0025O20). Prewarm those variants so
    // the upgraded name is visible immediately (no base-name flash).
    const upgradeVariants: Array<{ templateId: string; displayName: string }> = [];
    for (const biz of s.state.streetGrid) {
      if (!biz || !biz.displayName) continue;
      const templateId = this.templateIdFromCardId(biz.id);
      const baseName = CARD_TEMPLATE_NAMES.get(templateId);
      if (biz.displayName !== baseName) {
        upgradeVariants.push({ templateId, displayName: biz.displayName });
      }
    }

    // Include event cards in the player's hand in the visible template set
    for (const card of s.state.hand ?? []) {
      if (card.family === 'event') {
        visibleTemplates.add(this.templateIdFromCardId(card.id));
      }
    }

    const dpr = this.getCurrentDevicePixelRatio();
    const rasterizePromises: Promise<void>[] = [];

    const sizes = [
      { w: s.layout.marketCardW, h: s.layout.marketCardH },
      { w: s.layout.slotW, h: s.layout.slotH },
      { w: s.layout.handW, h: s.layout.handH },
      { w: s.layout.queueCardW, h: s.layout.queueCardH },
    ];

    // Face-down incident-deck card back (CG-0MSXOWLHU0099QF6): prewarm at
    // the queue size so the deck stack renders immediately.
    const backSvg = s.cardSvgSources.get(CARD_BACK_TEMPLATE);
    if (backSvg) {
      const backKey = makeTextureKey(CARD_BACK_TEMPLATE, s.layout.queueCardW, s.layout.queueCardH, dpr);
      if (!s.textures.exists(backKey)) {
        const p = rasteriseSvgToTexture(s, backKey, backSvg, s.layout.queueCardW, s.layout.queueCardH, dpr)
          .catch(() => {});
        rasterizePromises.push(p);
      }
    }

    for (const templateId of visibleTemplates) {
      const svgText = s.cardSvgSources.get(templateId);
      if (!svgText) continue;

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

    for (const variant of upgradeVariants) {
      const base = s.cardSvgSources.get(variant.templateId);
      if (!base) continue;
      const variantSvg = replaceCardTitleInSvg(base, variant.displayName);
      for (const size of sizes) {
        const key = this.variantTextureKey(variant.templateId, variant.displayName, size.w, size.h, dpr);
        if (s.textures.exists(key)) continue;
        const p = rasteriseSvgToTexture(s, key, variantSvg, size.w, size.h, dpr)
          .catch(() => {});
        rasterizePromises.push(p);
      }
    }

    await Promise.all(rasterizePromises);
  }

  public templateIdFromCardId(cardId: string): string {
    return cardId.replace(/--cheat-\d+$/, '').replace(/-\d+$/, '');
  }

  /**
   * Texture cache key for an upgraded business whose face has displayName
   * baked in (CG-0MT24MHGZ0025O20). Kept distinct from the base template's
   * key so base and upgraded copies of the same business get their own
   * textures. Falls back to the plain template id when no variant requested
   * (i.e. printable base cards).
   */
  private variantKeyId(templateId: string, displayName?: string): string {
    if (!displayName) return templateId;
    const baseName = CARD_TEMPLATE_NAMES.get(templateId);
    if (displayName === baseName) return templateId;
    return `${templateId}~~${displayName}`;
  }

  private variantTextureKey(
    templateId: string,
    displayName: string,
    renderW: number,
    renderH: number,
    dpr: number,
  ): string {
    return makeTextureKey(this.variantKeyId(templateId, displayName), renderW, renderH, dpr);
  }

  public requestCardTexture(cardId: string, renderW: number, renderH: number, displayName?: string): void {
    const s = this.scene;
    const templateId = this.templateIdFromCardId(cardId);
    const baseSvg = s.cardSvgSources.get(templateId);
    if (!baseSvg) return;

    const dpr = this.getCurrentDevicePixelRatio();
    const key = this.variantTextureKey(templateId, displayName ?? '', renderW, renderH, dpr);
    if (s.textures.exists(key)) return;

    // Upgraded cards (displayName set) render a variant face with the upgraded
    // name baked into the SVG, exactly like the base name is baked into the
    // template (CG-0MT24MHGZ0025O20).
    const svgText = displayName
      ? replaceCardTitleInSvg(baseSvg, displayName)
      : baseSvg;

    void rasteriseSvgToTexture(s, key, svgText, renderW, renderH, dpr).then(() => {
      try {
        s.refreshAll();
      } catch {
        // scene may be shutting down
      }
    });
  }

  public templateKeyForCard(cardId: string, width?: number, height?: number, displayName?: string): string {
    const base = this.templateIdFromCardId(cardId);
    const id = this.variantKeyId(base, displayName);
    if (width !== undefined && height !== undefined) {
      const dpr = this.getCurrentDevicePixelRatio();
      return makeTextureKey(id, width, height, dpr);
    }
    return `ms_card_${id}`;
  }

}
