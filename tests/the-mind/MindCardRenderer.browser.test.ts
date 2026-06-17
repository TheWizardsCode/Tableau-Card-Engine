import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createTheMindGame } from '../../example-games/the-mind/createTheMindGame';

describe('TheMind browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    const el = document.getElementById('game-container');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    game = null;
  });

  it('renders at least one Mind card to the canvas', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = createTheMindGame({ type: Phaser.CANVAS, parent: 'game-container', width: 900, height: 700 });

    // Wait for the Phaser texture manager to contain at least one Mind card
    // texture using DPR-aware keys (e.g. 'ms_card_mind-42_120x164@...').
    // Under the new lazy rasterisation model, textures are created on demand
    // via ensureMindCardTexture. The game scene's create() method triggers
    // lazy rasterisation for visible cards, so we wait for at least one
    // ms_card_mind-* texture to appear in the texture manager.
    const textures = () => game?.scene.getScene('TheMindScene')?.textures as Phaser.Textures.TextureManager | undefined;

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const t = textures();
        if (t) {
          const keys = t.getTextureKeys().filter((k: string) => k.startsWith('ms_card_mind-'));
          if (keys.length > 0) {
            resolve();
            return;
          }
        }
        if (Date.now() - start > 10_000) {
          reject(new Error('Mind textures were not available in time'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });

    // Sample one of the generated textures (offscreen) to ensure it's not a
    // single-colour placeholder. This avoids depending on the game's canvas
    // rendering context type (WebGL vs 2D).
    const s = game!.scene.getScene('TheMindScene') as any as Phaser.Scene;
    const keys = (s.textures.getTextureKeys?.() ?? []).filter((k: string) => k.startsWith('ms_card_mind-'));
    expect(keys.length).toBeGreaterThan(0);

    function isTextureNonSolid(scene: Phaser.Scene, key: string): boolean {
      const texture = (scene.textures.get(key) as any) || null;
      const source = texture?.source?.[0]?.image as HTMLImageElement | HTMLCanvasElement | undefined;
      if (!source) return false;

      const width = (source as any).width || 1;
      const height = (source as any).height || 1;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) return false;

      context.drawImage(source as any, 0, 0, width, height);

      const sampleW = Math.max(1, Math.floor(width * 0.5));
      const sampleH = Math.max(1, Math.floor(height * 0.5));
      const sampleX = Math.floor((width - sampleW) / 2);
      const sampleY = Math.floor((height - sampleH) / 2);
      const data = context.getImageData(sampleX, sampleY, sampleW, sampleH).data;

      if (data.length < 4) return false;

      const r0 = data[0];
      const g0 = data[1];
      const b0 = data[2];
      const a0 = data[3];

      for (let i = 4; i < data.length; i += 4) {
        if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0) {
          return true;
        }
      }
      return false;
    }

    const someKey = keys.sort()[0];
    const nonSolid = isTextureNonSolid(s, someKey);
    expect(nonSolid).toBe(true);
  }, 30_000);
});