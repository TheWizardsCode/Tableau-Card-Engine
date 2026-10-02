/**
 * Unit tests for the bonus-catalog loader (electron/bonus-catalog.ts).
 *
 * Asserts the catalog is config-driven and game-agnostic (intake AC4), and
 * that malformed/missing catalogues degrade to `null` rather than throwing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadBonusCatalog } from '../../electron/bonus-catalog';

const REPO_ELECTRON_DIR = path.resolve(__dirname, '../../electron');

describe('loadBonusCatalog() — shipped catalog', () => {
  it('loads the committed catalog and resolves its designated bonus', () => {
    const catalog = loadBonusCatalog({ catalogPath: path.join(REPO_ELECTRON_DIR, 'bonus-catalog.json') });
    expect(catalog).not.toBeNull();
    expect(catalog!.games.length).toBeGreaterThanOrEqual(3);
    // The producer designated Feudalism; the value is data, not code.
    expect(catalog!.bonusGameId).toBe('feudalism');
    expect(catalog!.games.some((g) => g.id === catalog!.bonusGameId)).toBe(true);
  });

  it('does not hard-code a title in the designation (id-based)', () => {
    const catalog = loadBonusCatalog({ catalogPath: path.join(REPO_ELECTRON_DIR, 'bonus-catalog.json') });
    const bonus = catalog!.games.find((g) => g.id === catalog!.bonusGameId);
    expect(bonus?.id).toBe('feudalism');
    expect(bonus?.title).toBe('Feudalism');
  });
});

describe('loadBonusCatalog() — invalid input', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-bonus-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, content: string): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it('returns null when the file is missing', () => {
    expect(loadBonusCatalog({ catalogPath: path.join(dir, 'nope.json') })).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    expect(loadBonusCatalog({ catalogPath: write('bad.json', '{ not json') })).toBeNull();
  });

  it('returns null when bonusGameId does not resolve to a game', () => {
    const p = write(
      'unresolved.json',
      JSON.stringify({ bonusGameId: 'ghost', games: [{ id: 'a', title: 'A', sceneKey: 'S', description: 'd' }] }),
    );
    expect(loadBonusCatalog({ catalogPath: p })).toBeNull();
  });

  it('returns null when no entries are valid', () => {
    const p = write('entries.json', JSON.stringify({ bonusGameId: 'a', games: [{ id: 'a' }] }));
    expect(loadBonusCatalog({ catalogPath: p })).toBeNull();
  });

  it('filters out malformed entries and keeps valid ones', () => {
    const p = write(
      'mixed.json',
      JSON.stringify({
        bonusGameId: 'a',
        games: [{ id: 'a', title: 'A', sceneKey: 'S', description: 'd' }, { bogus: true }],
      }),
    );
    const catalog = loadBonusCatalog({ catalogPath: p });
    expect(catalog).toEqual({
      bonusGameId: 'a',
      games: [{ id: 'a', title: 'A', sceneKey: 'S', description: 'd' }],
    });
  });
});
