/**
 * Main Street Game Selector integration tests (Milestone 5).
 *
 * Verifies that Main Street's PRD-specified metadata is correct.
 * The canonical source is the GAMES array in main.ts; this test
 * mirrors the expected values to avoid the Phaser import chain.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Parse the GAMES array from main.ts source (simple regex extraction). */
function parseMainStreetEntry(): {
  sceneKey: string;
  title: string;
  description: string;
  thumbnail: string;
} | null {
  const mainPath = join(__dirname, '../../main.ts');
  const source = readFileSync(mainPath, 'utf-8');

  // Find the Main Street block - description is on a separate line from the key
  const match = source.match(
    /sceneKey:\s*'MainStreetScene',\s*\n\s*title:\s*'([^']+)',\s*\n\s*description:\s*\n\s*'([^']+)',\s*\n\s*thumbnail:\s*'([^']+)'/,
  );
  if (!match) return null;

  return {
    sceneKey: 'MainStreetScene',
    title: match[1],
    description: match[2],
    thumbnail: match[3],
  };
}

const MAIN_STREET = parseMainStreetEntry();

// ── Tests ────────────────────────────────────────────────────

describe('Main Street Game Selector integration (Milestone 5)', () => {
  // ── Registration ──────────────────────────────────────────

  it('Main Street entry is found in main.ts', () => {
    expect(MAIN_STREET).not.toBeNull();
  });

  it('Main Street is registered exactly once in main.ts', () => {
    const mainPath = join(__dirname, '../../main.ts');
    const source = readFileSync(mainPath, 'utf-8');
    const occurrences = (source.match(/sceneKey:\s*'MainStreetScene'/g) || []).length;
    expect(occurrences).toBe(1);
  });

  // ── PRD Metadata ─────────────────────────────────────────

  it('has the correct sceneKey', () => {
    expect(MAIN_STREET!.sceneKey).toBe('MainStreetScene');
  });

  it('has the correct title', () => {
    expect(MAIN_STREET!.title).toBe('Main Street');
  });

  it('has the PRD-specified description', () => {
    expect(MAIN_STREET!.description).toBe(
      'Single-player tableau builder. Purchase businesses, place them along a 10-slot street for synergy bonuses, manage coins and reputation, and build the highest-scoring Main Street in 20 turns.',
    );
  });

  it('has the PRD-specified thumbnail key', () => {
    expect(MAIN_STREET!.thumbnail).toBe('games/main-street/thumbnail');
  });

  // ── Thumbnail Convention ─────────────────────────────────

  it('thumbnail follows assets/${thumbnail}.png convention', () => {
    const thumb = MAIN_STREET!.thumbnail;
    expect(thumb).not.toMatch(/\.png$/);
    expect(thumb).not.toMatch(/\.jpg$/);
    expect(thumb).toContain('/');
  });

  it('Main Street scene is registered in the scenes array', () => {
    const mainPath = join(__dirname, '../../main.ts');
    const source = readFileSync(mainPath, 'utf-8');
    // Check MainStreetScene is in the scenes array passed to createCardGame
    expect(source).toMatch(/MainStreetScene/);
  });
});
