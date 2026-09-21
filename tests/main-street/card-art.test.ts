/**
 * Unit tests for the Main Street card-art resolver and embedding
 * (CG-0MTORJ5FS006B0UN).
 *
 * The 64×64 left-art graphic zone on every card face embeds a base64 PNG
 * `data:` URI from `example-games/main-street/card-art-map.json` (generated
 * by `scripts/generate-main-street-card-art.mjs` from the sprites in
 * `example-games/main-street/sprites/`). These tests verify the resolver, the
 * spelling-variant aliases, the fallback behaviour, and that both the runtime
 * and static SVG generators actually embed the art — the producer review asked
 * for "Add the png found in the sprites folder, files named as the cards with
 * a suffix of _64_x_64".
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getCardArtDataUri,
  hasDedicatedCardArt,
  resolveCardArtName,
  CARD_ART_FALLBACK,
  CARD_ART_SIZE,
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
import { generateCardSvg } from '../../scripts/generate-main-street-card-svgs.mjs';

const SPRITES_DIR = path.resolve('example-games/main-street/sprites');
const PNG_DATA_URI = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const EMBEDDED_IMAGE = /<image [^>]*href="data:image\/png;base64,/;

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
  it('is generated for a 64×64 art zone', () => {
    expect(CARD_ART_SIZE).toBe(64);
  });

  it('embeds self-contained PNG data URIs (SVG faces are rasterised from a data: URI)', () => {
    expect(getCardArtDataUri('Bakery')).toMatch(PNG_DATA_URI);
    expect(getCardArtDataUri('Local Festival')).toMatch(PNG_DATA_URI);
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
  it('has an entry for every _64_x_64 sprite on disk (drift guard)', () => {
    const stems = fs
      .readdirSync(SPRITES_DIR)
      .filter((file) => /^.*_64_x_64\.png$/.test(file))
      .map((file) => file.replace(/_64_x_64\.png$/, ''));

    expect(stems.length).toBeGreaterThan(0);
    for (const stem of stems) {
      expect(
        hasDedicatedCardArt(stem),
        `card-art-map.json is missing an entry for sprite "${stem}"`,
      ).toBe(true);
    }
  });

  it('reports the number of generated sprites', () => {
    const onDisk = fs
      .readdirSync(SPRITES_DIR)
      .filter((file) => /^.*_64_x_64\.png$/.test(file)).length;
    expect(cardArtSpriteCount()).toBe(onDisk);
  });
});

describe('Runtime SVG generator embeds the 64×64 card art', () => {
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

describe('Static SVG generator embeds the 64×64 card art', () => {
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
