/**
 * GDD §3 presentation contract — document ↔ fixture contract.
 *
 * Section 3 tells an implementer which SLL zone and which `COMMON_SFX_KEYS`
 * value each surface uses. That promise is only true while the document, the
 * layout fixture and the engine constants agree, so this suite pins them
 * together:
 *
 * - the zone table's zones and anchors are exactly the fixture's, so a renamed
 *   anchor cannot leave a stale instruction behind;
 * - the fixture validates through the same SLL schema the game will use, and
 *   carries no zone the document does not name;
 * - the option anchors meet the 44 design-px tap-target floor and do not
 *   overlap the narrative or feedback surfaces;
 * - every cited `COMMON_SFX_KEYS` name is a real key, every audio row carries a
 *   reduced-motion alternative, and the mapping exercises all six shared keys;
 * - every Gym scene and source path the section cites exists;
 * - the section contains no absolute coordinate pair, and `src/story-line/`
 *   contains no `Math.random` (the seeded draw is the only RNG).
 *
 * This is T13 in the GDD's test plan. It is a documentation guard: it never
 * asserts prose, only the parts an implementer is told to copy.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMON_SFX_KEYS } from '../../../src/core-engine/SoundManager';
import { validateScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import layoutFixture from '../../fixtures/story-line/gdd-presentation-layout.json';
import { REPO_ROOT, fixturePath } from './test-support';

const GDD_PATH = resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md');
const LAYOUT_FIXTURE_PATH = fixturePath('gdd-presentation-layout.json');

/** The design resolution the layout is authored against. */
const DESIGN_HEIGHT = 720;

/** The minimum tap target, in design pixels, that the option anchors encode. */
const MIN_TAP_TARGET_PX = 44;

/** The `src/story-line/` module whose RNG must be the seeded draw only. */
const STORY_LINE_DIR = resolve(REPO_ROOT, 'src/story-line');

/** Reads §3 of the GDD, between its heading and the next top-level heading. */
function readPresentationSection(): string {
  const doc = readFileSync(GDD_PATH, 'utf8');
  const start = doc.indexOf('## 3. UX, Visual Design and Audio Direction');
  if (start < 0) throw new Error('GDD section 3 heading not found');
  const end = doc.indexOf('\n## 4. ', start);
  if (end < 0) throw new Error('GDD section 4 heading not found');
  return doc.slice(start, end);
}

/**
 * Extracts the first markdown table after a marker comment.
 *
 * Returns the header row first, then the data rows; the separator row is
 * dropped so callers cannot accidentally assert on `---`.
 */
function extractTable(section: string, marker: string): string[][] {
  const markerIndex = section.indexOf(marker);
  if (markerIndex < 0) throw new Error(`marker ${marker} not found in GDD section 3`);
  const rows: string[][] = [];
  let started = false;
  for (const line of section.slice(markerIndex + marker.length).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      started = true;
      const body = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined);
      rows.push(body.split('|').map((cell) => cell.trim()));
      continue;
    }
    if (started) break;
  }
  if (rows.length < 3) throw new Error(`table after ${marker} is missing data rows`);
  return [rows[0], ...rows.slice(2)];
}

/** Strips surrounding backticks from a table cell. */
function stripCode(cell: string): string {
  return cell.replace(/`/g, '').trim();
}

/** Recursively lists files under a directory. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe('GDD presentation contract — SLL zones', () => {
  const section = readPresentationSection();
  const table = extractTable(section, '<!-- gdd-presentation-zones -->');
  const dataRows = table.slice(1);
  const zones = layoutFixture.zones as Record<
    string,
    { rect: { x: number; y: number }; anchors?: Record<string, { x: number; y: number }> }
  >;

  it('names the fixture layout by id and validates it against the SLL schema', () => {
    expect(section).toContain('`gdd-long-erasure-layout`');
    expect(layoutFixture.id).toBe('gdd-long-erasure-layout');
    expect(layoutFixture.version).toBe(1);
    expect(layoutFixture.baseViewport).toEqual({ width: 1280, height: DESIGN_HEIGHT });

    const validation = validateScreenLayoutDocument(layoutFixture);
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
  });

  it('declares every fixture zone in requiredZones, with no extra zone', () => {
    expect([...layoutFixture.requiredZones].sort()).toEqual(Object.keys(zones).sort());
  });

  it('maps every table zone to the fixture and every fixture zone to the table', () => {
    const documentedZones = dataRows.map((row) => stripCode(row[1]));
    expect(new Set(documentedZones).size).toBe(documentedZones.length);
    expect([...documentedZones].sort()).toEqual(Object.keys(zones).sort());
  });

  it('names only anchors that exist in the fixture, for the zone that owns them', () => {
    for (const row of dataRows) {
      const anchorsCell = row[2];
      const references = anchorsCell.split(',').flatMap((part) => {
        const range = part.match(/`([^`]+)`\s*…\s*`([^`]+)`/);
        if (range) return [range[1], range[2]];
        return [...part.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      });
      expect(references.length, `no anchors named in row: ${row[0]}`).toBeGreaterThan(0);

      for (const reference of references) {
        const separator = reference.lastIndexOf('.');
        const zoneName = reference.slice(0, separator);
        const anchorName = reference.slice(separator + 1);
        expect(zones[zoneName], `unknown zone ${zoneName} in row: ${row[0]}`).toBeDefined();
        expect(
          zones[zoneName].anchors?.[anchorName],
          `unknown anchor ${reference} in row: ${row[0]}`,
        ).toBeDefined();
      }
    }
  });

  it('spaces the six option anchors at the 44 design-px tap-target floor', () => {
    const anchors = zones.options.anchors;
    expect(anchors).toBeDefined();
    if (!anchors) return;

    const ys = Array.from({ length: 6 }, (_, index) => anchors[`option${index + 1}`]);
    for (const [index, anchor] of ys.entries()) {
      expect(anchor, `options.option${index + 1} is missing`).toBeDefined();
      expect(anchor.x).toBe(ys[0].x);
    }

    const minimumStep = MIN_TAP_TARGET_PX / DESIGN_HEIGHT;
    for (let index = 1; index < ys.length; index += 1) {
      const step = ys[index].y - ys[index - 1].y;
      expect(step, `option${index + 1} is closer than the tap-target floor`).toBeGreaterThanOrEqual(
        minimumStep,
      );
    }

    // The choice column sits between the narrative above and the feedback below.
    expect(ys[0].y).toBeGreaterThan(zones.narrative.anchors?.contextMore?.y ?? 1);
    expect(ys[ys.length - 1].y).toBeLessThan(zones.feedback.anchors?.center?.y ?? 0);
  });
});

describe('GDD presentation contract — audio mapping', () => {
  const section = readPresentationSection();
  const table = extractTable(section, '<!-- gdd-presentation-audio -->');
  const dataRows = table.slice(1);

  it('gives every audio row an SFX key and a reduced-motion alternative', () => {
    for (const row of dataRows) {
      expect(row.length, `row has the wrong column count: ${row[0]}`).toBe(5);
      expect(row[0].length).toBeGreaterThan(0);
      expect(row[2], `no SFX key for event: ${row[0]}`).toMatch(/COMMON_SFX_KEYS\.[A-Z_]+/);
      expect(row[4], `no reduced-motion alternative for event: ${row[0]}`).not.toMatch(/^(—|-|n\/a)$/i);
      expect(row[4].length).toBeGreaterThan(0);
    }
  });

  it('cites only real COMMON_SFX_KEYS values, and exercises every shared key', () => {
    const cited = new Set(
      [...section.matchAll(/COMMON_SFX_KEYS\.([A-Z_]+)/g)].map((match) => match[1]),
    );
    expect(cited.size).toBeGreaterThan(0);
    for (const name of cited) {
      expect(COMMON_SFX_KEYS, `unknown COMMON_SFX_KEYS.${name}`).toHaveProperty(name);
    }
    expect([...cited].sort()).toEqual(Object.keys(COMMON_SFX_KEYS).sort());
  });

  it('uses no game-scoped SFX string literal in the mapping', () => {
    // Every `sfx-` literal in the section must be a shared constant's value.
    const sharedValues = new Set<string>(Object.values(COMMON_SFX_KEYS));
    const literals = [...section.matchAll(/`(sfx-[a-z-]+)`/g)].map((match) => match[1]);
    for (const literal of literals) {
      expect(sharedValues.has(literal), `game-scoped SFX literal: ${literal}`).toBe(true);
    }
  });
});

describe('GDD presentation contract — colour independence', () => {
  const section = readPresentationSection();
  const table = extractTable(section, '<!-- gdd-presentation-colour -->');
  const dataRows = table.slice(1);

  it('gives every colour-coded state a printed, non-colour channel', () => {
    expect(dataRows.length).toBeGreaterThanOrEqual(5);
    for (const row of dataRows) {
      expect(row.length, `row has the wrong column count: ${row[0]}`).toBe(3);
      expect(row[0].length).toBeGreaterThan(0);
      expect(row[1].length, `no colour cue named for: ${row[0]}`).toBeGreaterThan(0);
      // The non-colour channel must name something beyond a colour word.
      const channel = row[2].replace(/\b(green|amber|red|yellow|blue|grey|gray)\b/gi, '').trim();
      expect(channel.length, `colour is the only channel for: ${row[0]}`).toBeGreaterThan(3);
    }
  });
});

describe('GDD presentation contract — cited sources', () => {
  const section = readPresentationSection();

  it('cites Gym scenes that exist in the current checkout', () => {
    const scenes = new Set(
      [...section.matchAll(/`(Gym[A-Za-z]+Scene)`/g)].map((match) => match[1]),
    );
    expect(scenes.size).toBeGreaterThanOrEqual(5);
    for (const scene of scenes) {
      const path = resolve(REPO_ROOT, 'example-games/gym/scenes', `${scene}.ts`);
      expect(existsSync(path), `missing Gym scene ${scene}`).toBe(true);
    }
  });

  it('cites repository paths that exist', () => {
    const paths = new Set(
      [...section.matchAll(/`((?:src|example-games|docs|scripts|public)\/[^`\s]+)`/g)].map(
        (match) => match[1],
      ),
    );
    expect(paths.size).toBeGreaterThan(0);
    for (const path of paths) {
      const withoutTrailingSlash = path.replace(/\/$/, '');
      expect(existsSync(resolve(REPO_ROOT, withoutTrailingSlash)), `missing path ${path}`).toBe(
        true,
      );
    }
    // The fixture itself is the layout the contract tells the implementer to build.
    expect(existsSync(LAYOUT_FIXTURE_PATH)).toBe(true);
  });
});

describe('GDD presentation contract — no absolute coordinates, seeded RNG only', () => {
  const section = readPresentationSection();

  it('contains no absolute coordinate pair', () => {
    expect(section).not.toMatch(/["']x["']\s*:\s*\d/);
    expect(section).not.toMatch(/\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/);
    expect(section).not.toMatch(/\b\d+(?:\.\d+)?px\b/);
  });

  it('leaves Math.random out of src/story-line', () => {
    const offenders = walk(STORY_LINE_DIR).filter(
      (path) =>
        path.endsWith('.ts') && readFileSync(path, 'utf8').includes('Math.random'),
    );
    expect(offenders).toEqual([]);
  });
});
