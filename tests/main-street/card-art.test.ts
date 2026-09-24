/**
 * Unit tests for the Main Street card-art resolver and embedding
 * (CG-0MTORJ5FS006B0UN, CG-0MUCM36EQ008YP4R).
 *
 * The 64×64 left-art graphic zone on every card face embeds a base64 bitmap
 * `data:` URI from `example-games/main-street/card-art-map.json` (generated
 * by `scripts/generate-main-street-card-art.mjs` from the 1024×1024 sprites in
 * `example-games/main-street/sprites/`). These tests verify the resolver, the
 * spelling-variant aliases, the fallback behaviour, the embedded bitmap
 * resolution/format, and that both the runtime and static SVG generators
 * actually embed the art.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  getCardArtDataUri,
  hasDedicatedCardArt,
  resolveCardArtName,
  CARD_ART_FALLBACK,
  CARD_ART_SIZE,
  CARD_ART_RESOLUTION,
  CARD_ART_FORMAT,
  cardArtSpriteCount,
} from '../../example-games/main-street/MainStreetCardArt';
import {
  generateBusinessCardSvg,
  generateCardSvgFromCsvRow,
  generateEventCardSvg,
  generateUpgradeCardSvg,
  generateStaffCardSvg,
} from '../../example-games/main-street/scenes/MainStreetCardSvgGenerator';
import type {
  BusinessCard,
  EventCard,
  StaffCard,
  UpgradeCard,
} from '../../example-games/main-street/MainStreetCards';
// @ts-ignore: no declaration file for .mjs script — intentional
import { generateCardSvg } from '../../example-games/main-street/scripts/generate-main-street-card-svgs.mjs';

const SPRITES_DIR = path.resolve('example-games/main-street/sprites');
const ART_DATA_URI = /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/;
const EMBEDDED_IMAGE = /<image [^>]*href="data:image\/webp;base64,/;

/** Stems of every committed high-resolution source sprite. */
function sourceSpriteStems(): string[] {
  return fs
    .readdirSync(SPRITES_DIR)
    .filter((file) => /^.*_1024_x_1024\.png$/.test(file))
    .map((file) => file.replace(/_1024_x_1024\.png$/, ''));
}

/** Decode an embedded art data URI and report its bitmap dimensions. */
async function embeddedArtMeta(
  cardName: string,
): Promise<{ width?: number; height?: number; format?: string }> {
  const uri = getCardArtDataUri(cardName);
  const base64 = uri.slice(uri.indexOf(',') + 1);
  const meta = await sharp(Buffer.from(base64, 'base64')).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
}

function makeBusiness(overrides: Partial<BusinessCard> = {}): BusinessCard {
  return {
    family: 'business',
    id: 'biz-bakery',
    name: 'Bakery',
    cost: 300,
    baseIncome: 230,
    synergyTypes: ['Food'],
    maxLevel: 2,
    description: 'Provides warm pastries.',
    level: 0,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    reputationPerTurn: 5,
    ongoingCost: 0,
    appliedUpgrades: [],
    ...overrides,
  };
}

describe('MainStreetCardArt — constants and map', () => {
  it('keeps a 64×64 art zone and a separate 256×256 embedded bitmap', () => {
    expect(CARD_ART_SIZE).toBe(64);
    expect(CARD_ART_RESOLUTION).toBe(256);
    expect(CARD_ART_FORMAT).toBe('webp');
  });

  it('embeds self-contained WebP data URIs (SVG faces are rasterised from a data: URI)', () => {
    expect(getCardArtDataUri('Bakery')).toMatch(ART_DATA_URI);
    expect(getCardArtDataUri('Local Festival')).toMatch(ART_DATA_URI);
  });

  it('decodes every embedded sprite to 256×256 WebP (regression guard against 64×64 art)', async () => {
    const stems = sourceSpriteStems();
    expect(stems.length).toBeGreaterThan(0);

    for (const stem of stems) {
      const meta = await embeddedArtMeta(stem);
      expect(meta.format, `${stem} should be WebP`).toBe('webp');
      expect(meta.width, `${stem} width`).toBe(CARD_ART_RESOLUTION);
      expect(meta.height, `${stem} height`).toBe(CARD_ART_RESOLUTION);
    }
  });
});

describe('MainStreetCardArt — name resolution', () => {
  it('resolves the exact card name to its sprite', () => {
    expect(resolveCardArtName('Bakery')).toBe('Bakery');
    expect(hasDedicatedCardArt('Bakery')).toBe(true);
  });

  it('falls back to the generic Fallback sprite for unknown cards', () => {
    expect(resolveCardArtName('This Card Does Not Exist')).toBe(CARD_ART_FALLBACK);
    expect(hasDedicatedCardArt('This Card Does Not Exist')).toBe(false);
    expect(getCardArtDataUri('This Card Does Not Exist')).toBe(
      getCardArtDataUri(CARD_ART_FALLBACK),
    );
  });

  it('resolves the spelling-variant aliases used by card-data.csv', () => {
    // CSV names differ from the sprite filenames (typo / US-vs-UK spelling).
    expect(resolveCardArtName('Community Renovation')).toBe('Community Rennovation');
    expect(resolveCardArtName('Labor Shortage')).toBe('Labour Shortage');
    expect(resolveCardArtName('Neighborhood Watch')).toBe('Neighbourhood Watch');
    expect(resolveCardArtName('Physiotherapy')).toBe('Physiotherapist');
    expect(hasDedicatedCardArt('Community Renovation')).toBe(true);
  });
});

describe('MainStreetCardArt — sprite coverage', () => {
  it('has an entry for every 1024×1024 source sprite on disk (drift guard)', () => {
    const stems = sourceSpriteStems();

    expect(stems.length).toBeGreaterThan(0);
    for (const stem of stems) {
      expect(
        hasDedicatedCardArt(stem),
        `card-art-map.json is missing an entry for sprite "${stem}"`,
      ).toBe(true);
    }
  });

  it('reports the number of generated sprites', () => {
    expect(cardArtSpriteCount()).toBe(sourceSpriteStems().length);
  });
});

describe('Runtime SVG generator embeds the 256×256 card art', () => {
  it('business card SVG embeds the sprite image + rounded clip-path', () => {
    const svg = generateBusinessCardSvg(makeBusiness());
    expect(svg).toMatch(EMBEDDED_IMAGE);
    expect(svg).toContain('clip-path="url(#ms-art-clip-biz-bakery)"');
    expect(svg).toContain('<clipPath id="ms-art-clip-biz-bakery">');
  });

  it('event, upgrade and staff card SVGs embed the sprite image', () => {
    const event: EventCard = {
      family: 'event',
      id: 'evt-local-festival',
      name: 'Local Festival',
      trigger: 'Investment',
      cost: 250,
      effect: '+200 Rep',
      target: 'All',
      coinDelta: 0,
      reputationDelta: 200,
    };
    const upgrade: UpgradeCard = {
      family: 'upgrade',
      id: 'upg-patisserie',
      name: 'Upgrade to Patisserie',
      targetBusiness: 'Bakery',
      cost: 400,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      description: 'Upgrade a bakery.',
    };
    const staff: StaffCard = {
      family: 'staff',
      id: 'stf-assistant',
      name: 'Assistant',
      cost: 350,
      ongoingCost: 50,
      handSlotsAdded: 1,
      description: 'A helpful assistant.',
    };

    for (const svg of [
      generateEventCardSvg(event),
      generateUpgradeCardSvg(upgrade),
      generateStaffCardSvg(staff),
    ]) {
      expect(svg).toMatch(EMBEDDED_IMAGE);
      expect(svg).toContain('<clipPath id="ms-art-clip-');
    }
  });

  it('falls back to the Fallback sprite (still an embedded image) for cards with no dedicated art', () => {
    const svg = generateBusinessCardSvg(
      makeBusiness({ id: 'biz-unknown', name: 'Nonexistent Card' }),
    );
    expect(svg).toMatch(EMBEDDED_IMAGE);
    expect(svg).toContain(getCardArtDataUri(CARD_ART_FALLBACK));
  });

  it('CSV-row fallback generator embeds the sprite image + clip-path', () => {
    const svg = generateCardSvgFromCsvRow({
      id: 'biz-bakery',
      name: 'Bakery',
      family: 'business',
      cost: '300',
    });
    expect(svg).toMatch(EMBEDDED_IMAGE);
    expect(svg).toContain('<clipPath id="ms-art-clip-biz-bakery">');
  });
});

describe('Static SVG generator embeds the 256×256 card art', () => {
  it('embeds the sprite image + clip-path for a known card', () => {
    const svg = generateCardSvg({
      id: 'biz-bakery',
      name: 'Bakery',
      family: 'business',
      synergies: ['Food'],
      cost: 300,
      trigger: null,
    });
    expect(svg).toMatch(EMBEDDED_IMAGE);
    expect(svg).toContain('<clipPath id="ms-art-clip-biz-bakery">');
  });

  it('uses the Fallback sprite when a card has no dedicated art', () => {
    const svg = generateCardSvg({
      id: 'biz-unknown',
      name: 'Nonexistent Card',
      family: 'business',
      synergies: [],
      cost: 100,
      trigger: null,
    });
    expect(svg).toContain(getCardArtDataUri(CARD_ART_FALLBACK));
  });
});
