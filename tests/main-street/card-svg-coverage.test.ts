import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createBusinessDeck,
  createEventDeck,
  createUpgradeDeck,
} from '../../example-games/main-street/MainStreetCards';
import { createSeededRng } from '../../src/core-engine';

function templateIdsFromCatalog(): string[] {
  const rng = createSeededRng(42);
  const business = createBusinessDeck(1).map(card => card.id.replace(/-\d+$/, ''));
  const event = createEventDeck(1, undefined, rng, 1).map(card => card.id.replace(/-\d+$/, ''));
  const upgrade = createUpgradeDeck(1).map(card => card.id.replace(/-\d+$/, ''));
  return [...new Set([...business, ...event, ...upgrade])].sort();
}

describe('Main Street SVG card generation coverage', () => {
  it('generator produces SVG files for all card template IDs', () => {
    execSync('node scripts/generate-main-street-card-svgs.mjs', { stdio: 'inherit' });

    const catalogTemplateIds = templateIdsFromCatalog();
    const svgDir = resolve(process.cwd(), 'public/assets/games/main-street/svg/cards');
    const generatedIds = readdirSync(svgDir)
      .filter(name => name.endsWith('.svg'))
      .map(name => name.replace(/\.svg$/, ''))
      .sort();

    for (const cardId of catalogTemplateIds) {
      expect(generatedIds).toContain(cardId);
    }
  });
});
