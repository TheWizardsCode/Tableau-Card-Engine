/**
 * Main Street: Upgrade display-name variant texture tests (CG-0MT24MHGZ0025O20)
 *
 * Verifies the texture-pipeline contract for baking the upgraded business
 * name into the card image (per manual review: the name must be part of the
 * card, not a Phaser overlay):
 *
 *   AC1/AC5  A street business with a `displayName` gets a distinct texture
 *            key (per template+displayName), so the upgraded card face can
 *            differ from the base template's.
 *   AC4      Base cards (no displayName) keep the plain template key.
 *   AC3      replacement uses the CURRENT displayName (most recent upgrade).
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import { MainStreetSvgTextureManager } from '../../example-games/main-street/scenes/MainStreetSvgTextureManager';
import { replaceCardTitleInSvg } from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';

// ── Helpers ─────────────────────────────────────────────────

function makeManager(): MainStreetSvgTextureManager {
  const scene: any = {
    cardSvgSources: new Map(),
    textures: {
      exists: () => true,
      getTextureKeys: () => [],
      remove: () => {},
    },
    state: {
      market: { cards: [] },
      incidentDeck: [],
      streetGrid: [],
      hand: [],
    },
    layout: {
      marketCardW: 100,
      marketCardH: 50,
      slotW: 100,
      slotH: 50,
      handW: 100,
      handH: 50,
      queueCardW: 100,
      queueCardH: 50,
    },
    refreshAll: () => {},
  };
  return new MainStreetSvgTextureManager(scene);
}

// environment shim: templateKeyForCard() with explicit dims reads DPR
(globalThis as any).devicePixelRatio = 1.0;

// ── AC1/AC5: display-name variant texture key ────────────────

describe('display-name variant texture keys (AC1/AC5)', () => {
  it('upgraded Bakery (displayName=Patisserie) gets a distinct key from base Bakery', () => {
    const manager = makeManager();
    const baseKey = manager.templateKeyForCard('biz-bakery-0', 100, 50);
    const upKey = manager.templateKeyForCard('biz-bakery-0', 100, 50, 'Patisserie');
    expect(baseKey).not.toBe(upKey);
    expect(upKey).toContain('Patisserie');
  });

  it('base cards (no displayName) keep the plain template key', () => {
    const manager = makeManager();
    const key = manager.templateKeyForCard('biz-diner-1', 100, 50);
    expect(key).toContain('biz-diner');
    expect(key).not.toContain('~~');
  });

  it('falls back to the template key when displayName equals the base name', () => {
    const manager = makeManager(); // displayName same as template name
    const plain = manager.templateKeyForCard('biz-bakery-0', 100, 50);
    const variant = manager.templateKeyForCard('biz-bakery-0', 100, 50, 'Bakery');
    expect(plain).toBe(variant);
  });

  it('two different upgraded names produce two distinct keys (AC3 most-recent wins)', () => {
    const manager = makeManager();
    const lvl1 = manager.templateKeyForCard('biz-hardware-0', 100, 50, 'Home Improvement');
    const lvl2 = manager.templateKeyForCard('biz-hardware-0', 100, 50, 'Lumber Yard');
    expect(lvl1).not.toBe(lvl2);
  });
});

// ── replaceCardTitleInSvg integration (baked name) ───────────

describe('replaceCardTitleInSvg — upgraded name baked into the card face', () => {
  it('replaces the template title with the display name', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 80" aria-label="Bakery">'
      + '<rect x="4" y="4" width="132" height="20" fill="#888" opacity="0.18" />'
      + '<text x="70" y="19" font-family="Inter, Arial" font-size="11" fill="#ffffff">Bakery</text>'
      + '</svg>';
    const variant = replaceCardTitleInSvg(svg, 'Patisserie');
    expect(variant).toContain('>Patisserie</text>');
    expect(variant).not.toContain('>Bakery</text>');
    expect(variant).toContain('aria-label="Patisserie"');
  });

  it('preserves the rest of the card layout (cost badge, icons)', () => {
    const svg = '<svg aria-label="Bakery">'
      + '<text x="70" y="19">Bakery</text>'
      + '<circle cx="124" cy="56" r="12" fill="#e0c7a0" />'
      + '<text x="124" y="60" fill="#3a2a14">3</text>'
      + '</svg>';
    const variant = replaceCardTitleInSvg(svg, 'Patisserie');
    expect(variant).toContain('cx="124" cy="56"');
    expect(variant).toContain('>3</text>');
    expect(variant).toContain('>Patisserie</text>');
  });
});