/**
 * Browser tests for card design cross-session persistence.
 *
 * Validates the fix for CG-0MRO5W3CL000CNGO (card style preference is not
 * persisted):
 *   - A design saved via `setCardDesign()` (no storage arg) is written to
 *     `window.localStorage` and survives a simulated page reload (fresh
 *     Phaser game instance booting `preloadCardAssets()`).
 *   - `preloadCardAssets()` reads the persisted design from localStorage and
 *     requests the correct SVG asset paths for the selected design.
 *   - Clearing the preference (or storing an unknown key) falls back to the
 *     default "Classic" design.
 *
 * The test simulates a page reload by creating a brand-new Phaser.Game whose
 * scene calls `preloadCardAssets()` — the same code path that runs when a
 * player refreshes the page in 9-Card Golf / Beleaguered Castle.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import {
  getCardDesign,
  setCardDesign,
  getCardDesignAssetPath,
  CARD_DESIGN_DEFAULT,
} from '../../src/ui/SettingsStore';
import { preloadCardAssets } from '../../src/ui/CardTextureHelpers';
import { waitForScene } from '../helpers/waitForScene';

const STORAGE_KEY_CARD_DESIGN = 'tce-card-design';
const WEBISSO_DESIGN_KEY = 'webisso';

// ── Recording preload scene ────────────────────────────────
//
// Records every SVG URL requested via `preloadCardAssets()` during
// `preload()`. This lets tests assert which design's assets a freshly
// booted scene loads.

class RecordingPreloadScene extends Phaser.Scene {
  static loadedSvgUrls: string[] = [];

  constructor(key: string) {
    super({ key });
  }

  preload(): void {
    RecordingPreloadScene.loadedSvgUrls = [];
    const loader = this.load;
    const originalSvg = loader.svg.bind(loader);
    loader.svg = ((key: string | Phaser.Types.Loader.FileTypes.SVGFileConfig
      | Phaser.Types.Loader.FileTypes.SVGFileConfig[], url?: string,
    svgConfig?: Phaser.Types.Loader.FileTypes.SVGSizeConfig,
    xhrSettings?: Phaser.Types.Loader.XHRSettingsObject) => {
      if (typeof key === 'string' && typeof url === 'string') {
        RecordingPreloadScene.loadedSvgUrls.push(url);
      }
      return originalSvg(key, url, svgConfig, xhrSettings);
    }) as typeof loader.svg;

    preloadCardAssets(this);
  }

  create(): void {
    this.scene.stop();
  }
}

// ── Boot helpers ───────────────────────────────────────────

async function bootRecordingScene(
  sceneKey: string,
): Promise<Phaser.Game> {
  const container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 800,
    height: 600,
    parent: 'game-container',
    scene: [new RecordingPreloadScene(sceneKey)],
  });
  await waitForScene(game, sceneKey);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

// ── Tests ──────────────────────────────────────────────────

describe('card design cross-session persistence (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(STORAGE_KEY_CARD_DESIGN);
    }
  });

  it('setCardDesign() without a storage argument writes to window.localStorage', () => {
    setCardDesign(WEBISSO_DESIGN_KEY);
    expect(window.localStorage.getItem(STORAGE_KEY_CARD_DESIGN)).toBe(WEBISSO_DESIGN_KEY);
    expect(getCardDesign()).toBe(WEBISSO_DESIGN_KEY);
  });

  it('preloadCardAssets() loads the persisted (non-default) design after a simulated page reload', async () => {
    // Simulate the previous session having selected "Modern" (webisso).
    window.localStorage.setItem(STORAGE_KEY_CARD_DESIGN, WEBISSO_DESIGN_KEY);

    // Simulate a page reload: a brand-new game booting the scene preload path.
    game = await bootRecordingScene('reload-webisso');

    // The no-arg read must surface the persisted preference.
    expect(getCardDesign()).toBe(WEBISSO_DESIGN_KEY);
    expect(getCardDesignAssetPath(getCardDesign())).toBe('assets/cards/alternative/webisso/');

    // All 53 SVGs (52 faces + back) must be requested from the webisso path.
    const urls = RecordingPreloadScene.loadedSvgUrls;
    expect(urls.length).toBe(53);
    for (const url of urls) {
      expect(url.startsWith('assets/cards/alternative/webisso/')).toBe(true);
    }
    expect(urls).toContain('assets/cards/alternative/webisso/card_back.svg');
    expect(urls).toContain('assets/cards/alternative/webisso/ace_of_spades.svg');
  });

  it('preloadCardAssets() falls back to the default design when nothing is stored', async () => {
    // Ensure no preference is stored.
    window.localStorage.removeItem(STORAGE_KEY_CARD_DESIGN);

    game = await bootRecordingScene('reload-default');

    expect(getCardDesign()).toBe(CARD_DESIGN_DEFAULT);
    expect(getCardDesignAssetPath(getCardDesign())).toBe('assets/cards/');

    const urls = RecordingPreloadScene.loadedSvgUrls;
    expect(urls.length).toBe(53);
    for (const url of urls) {
      expect(url.startsWith('assets/cards/')).toBe(true);
    }
  });

  it('preloadCardAssets() falls back to the default design for an unknown stored key', async () => {
    window.localStorage.setItem(STORAGE_KEY_CARD_DESIGN, 'extinct-design');

    game = await bootRecordingScene('reload-invalid');

    expect(getCardDesign()).toBe(CARD_DESIGN_DEFAULT);

    const urls = RecordingPreloadScene.loadedSvgUrls;
    expect(urls.length).toBe(53);
    for (const url of urls) {
      expect(url.startsWith('assets/cards/')).toBe(true);
    }
  });
});
