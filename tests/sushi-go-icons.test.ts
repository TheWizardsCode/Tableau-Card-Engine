import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getIconKeyForCard } from '../example-games/sushi-go/IconMap';
import { createSushiGoDeck } from '../example-games/sushi-go/SushiGoCards';

describe('sushi-go icons', () => {
  it('all IconMap filenames exist in public assets', () => {
    const svgDir = path.resolve('public/assets/sushi-go');
    const files = new Set(fs.readdirSync(svgDir));
    const deck = createSushiGoDeck();
    for (const card of deck) {
      const meta = getIconKeyForCard(card as any as any);
      if (!meta) continue;
      expect(files.has(meta.filename)).toBe(true);
    }
  });
});
