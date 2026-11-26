/**
 * GDD §7 v1 scope statement and deferred list — document ↔ contract check.
 *
 * Section 7 is the section a producer approves a content volume and a cut line
 * from, and the section the build epic is decomposed against. Its numbers are
 * only worth approving while they agree with the sections they are derived from,
 * so this suite pins the document to itself:
 *
 * - the counts stay inside [P4](#2103-pacing-rules-stated-numerically)'s act
 *   bands and [P5](#2103-pacing-rules-stated-numerically)'s run length, and the
 *   per-act table agrees with the counts table;
 * - the playtime and word-budget arithmetic in §7.2 and §7.3 reconciles with the
 *   figures it multiplies, so a changed assumption cannot leave a stale target;
 * - every v1 capability cites a **filed** backlog entry (§6.6) and none cites a
 *   deferred entry, an unfiled gap, or an `extra-large` band;
 * - every deferral keeps a tracking reference, and the deferred backlog entries
 *   are the ones §7.6 names;
 * - the declared resource set matches §2.8.1, and the Act I hatch's scoring
 *   arithmetic matches §2.10.5's weights and bands.
 *
 * This is a documentation guard: it never asserts prose, only the numbers and
 * references a reviewer is told to verify and the build epic is told to build.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './test-support';

const GDD_PATH = resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md');
const doc = readFileSync(GDD_PATH, 'utf8');

/** The backlog's effort-band vocabulary (§6.1), largest last. */
const EFFORT_BANDS = [
  'extra-small',
  'small',
  'small–medium',
  'medium',
  'large',
] as const;

/** Repository roots a tracked path may start with. */
const REPO_PATH_PREFIXES = ['src/', 'scripts/', 'tests/', 'docs/', 'electron/'] as const;

/** Slices the document between two markers (the end marker is excluded). */
function sliceBetween(startMarker: string, endMarker: string): string {
  const start = doc.indexOf(startMarker);
  if (start < 0) throw new Error(`marker not found: ${startMarker}`);
  const end = doc.indexOf(endMarker, start);
  if (end < 0) throw new Error(`closing marker not found: ${endMarker}`);
  return doc.slice(start, end);
}

/**
 * Extracts the first markdown table after a marker.
 *
 * Returns the header row first, then the data rows; the separator row is
 * dropped so callers cannot assert on `---`.
 */
function extractTable(section: string, marker: string): string[][] {
  const markerIndex = section.indexOf(marker);
  if (markerIndex < 0) throw new Error(`table marker not found: ${marker}`);
  const lineStart = section.lastIndexOf('\n', markerIndex) + 1;
  const rows: string[][] = [];
  let started = false;
  for (const line of section.slice(lineStart).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      started = true;
      const body = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined);
      rows.push(body.split('|').map((cell) => cell.trim()));
      continue;
    }
    if (started) break;
  }
  if (rows.length < 2) throw new Error(`table after ${marker} has no data rows`);
  return [rows[0], ...rows.slice(2)];
}

/** Strips the markdown emphasis and code ticks a cell may carry. */
function plain(cell: string | undefined): string {
  return (cell ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/** Finds a table row whose first cell starts with the given label. */
function row(rows: string[][], label: string): string[] {
  const found = rows.find((cells) => plain(cells[0]).startsWith(label));
  if (!found) throw new Error(`row not found: ${label}`);
  return found;
}

/** Parses `a–b` (en dash) into a numeric pair. */
function parseRange(cell: string | undefined): [number, number] {
  const match = /(\d+)\s*[–-]\s*(\d+)/.exec(plain(cell));
  if (!match) throw new Error(`not a range: ${cell}`);
  return [Number(match[1]), Number(match[2])];
}

/** Parses a leading integer (the strong count) from a cell. */
function leadingNumber(cell: string | undefined): number {
  const match = /^(\d+)/.exec(plain(cell));
  if (!match) throw new Error(`no leading number: ${cell}`);
  return Number(match[1]);
}

/** Parses one integer, tolerating thousands separators and a minus sign. */
function parseNumber(cell: string | undefined): number {
  const match = /[−-]?\s*([\d,]+)/.exec(plain(cell));
  if (!match) throw new Error(`not a number: ${cell}`);
  const value = Number(match[1].replace(/,/g, ''));
  return plain(cell).includes('−') || plain(cell).startsWith('-') ? -value : value;
}

/** Formats seconds as `m:ss`, the form the playtime arithmetic row uses. */
function asMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** The band label a journal score falls in (§2.10.5). */
function bandFor(total: number): string {
  if (total >= 80) return '80–100';
  if (total >= 60) return '60–79';
  if (total >= 40) return '40–59';
  if (total >= 20) return '20–39';
  return '0–19';
}

const section = sliceBetween(
  '## 7. V1 Scope Statement and Deferred List',
  '## Appendix A: The episode manifest',
);
const backlog = sliceBetween('## 6. Engine-Gap Backlog', '## 7. V1 Scope Statement');
const pacing = sliceBetween('#### 2.10.3 Pacing rules', '#### 2.10.4');
const resourceModel = sliceBetween('#### 2.8.1', '#### 2.8.2');
const scoring = sliceBetween('#### 2.10.5', '#### 2.10.6');

const counts = extractTable(section, '| Item | V1 value |');
const perAct = extractTable(section, '| Act | Scenes | Authored beats |');
const endings = extractTable(section, '| Ending card | Title |');
const playtime = extractTable(section, '| Input | Value |');
const words = extractTable(section, '| Prose surface | Engine budget |');
const replay = extractTable(section, '| What varies | What is fixed |');
const mustHave = extractTable(section, '| V1 capability | GDD section |');
const backlogGlance = extractTable(backlog, '| Entry | Capability |');
const deferred = extractTable(section, '| # | Deferral |');
const consistency = extractTable(section, '| Axis | v1 commitment |');
const hatch = extractTable(section, '| Hatch run | Arc |');
const disposition = extractTable(backlog, '| Entry | Worklog item |');

describe('GDD §7 v1 scope statement', () => {
  it('is written, in the table of contents, and no longer a stub', () => {
    expect(doc).toContain('(#7-v1-scope-statement-and-deferred-list)');
    expect(doc).not.toContain('7-v1-scope-statement-and-deferred-list-todo');
    expect(section).not.toMatch(/\bTODO\b/);
    expect(section).toContain('### 7.1 The v1 counts');
    expect(section).toContain('### 7.6 The deferred list');
    expect(section).toContain('tests/story-line/content/gdd-v1-scope.test.ts');
  });

  it('fixes a 3-act, 7-scene, 21-beat volume inside P4’s act bands', () => {
    expect(plain(row(counts, 'Acts')[1])).toContain('3');

    const scenesTotal = leadingNumber(row(counts, 'Scenes')[1]);
    expect(scenesTotal).toBe(7);
    const beatsTotal = leadingNumber(row(counts, 'Authored scene beats')[1]);
    expect(beatsTotal).toBe(21);

    // P4: "Act I **5–6 beats / 2 scenes**, Act II …".
    const p4 = plain(row(extractTable(pacing, '| # | Rule |'), 'P4').join(' '));
    const band = /Act I (\d+)–(\d+) beats \/ (\d+) scenes, Act II (\d+)–(\d+) beats \/ (\d+) scenes, Act III (\d+)–(\d+) beats \/ (\d+) scenes/.exec(
      p4,
    );
    expect(band, 'P4 act bands').not.toBeNull();
    const [iLo, iHi, iScenes, iiLo, iiHi, iiScenes, iiiLo, iiiHi, iiiScenes] = band!
      .slice(1)
      .map(Number);

    const actRows = perAct.slice(1);
    expect(actRows).toHaveLength(4);
    const authoredScenes = actRows.slice(0, 3).map((cells) => Number(plain(cells[1])));
    const authoredBeats = actRows.slice(0, 3).map((cells) => Number(plain(cells[2])));
    expect(authoredScenes).toEqual([iScenes, iiScenes, iiiScenes]);
    expect(authoredBeats).toEqual([6, 9, 6]);
    for (const [index, value] of authoredBeats.entries()) {
      const [lo, hi] = [[iLo, iHi], [iiLo, iiHi], [iiiLo, iiiHi]][index];
      expect(value, `act ${index + 1} beats inside P4`).toBeGreaterThanOrEqual(lo);
      expect(value, `act ${index + 1} beats inside P4`).toBeLessThanOrEqual(hi);
    }

    // Sums agree with the counts table.
    expect(authoredScenes.reduce((a, b) => a + b, 0)).toBe(scenesTotal);
    expect(authoredBeats.reduce((a, b) => a + b, 0)).toBe(beatsTotal);

    // P1: 2–5 beats a scene, target 3 — 21 / 7 is exactly the target.
    expect(beatsTotal / scenesTotal).toBe(3);
  });

  it('keeps the per-run counts inside P5’s run-length rule', () => {
    const p5 = plain(row(extractTable(pacing, '| # | Rule |'), 'P5').join(' '));
    const match = /(\d+)–(\d+) beats and (\d+)–(\d+) decisions on a single run \((\d+)–(\d+) of the (\d+) authored scenes\)/.exec(
      p5,
    );
    expect(match, 'P5 run length').not.toBeNull();
    const [bLo, bHi, dLo, dHi, sLo, sHi, scenes] = match!.slice(1).map(Number);

    expect(parseRange(row(counts, 'Beats entered per run')[1])).toEqual([bLo, bHi]);
    expect(parseRange(row(counts, 'Decisions per run')[1])).toEqual([dLo, dHi]);

    const runScenes = plain(row(counts, 'Scenes entered per run')[1]);
    expect(runScenes).toContain(`${sLo}–${sHi} of ${scenes}`);
    expect(scenes).toBe(leadingNumber(row(counts, 'Scenes')[1]));
  });

  it('recomputes the playtime target from its own stated inputs', () => {
    const beatsPerRun = parseRange(row(counts, 'Beats entered per run')[1]);
    const v1Beats = plain(row(playtime, 'V1 beats per run')[1]);
    const [v1Lo, v1Hi] = parseRange(v1Beats);
    const mean = /mean (\d+)/.exec(v1Beats);
    expect([v1Lo, v1Hi]).toEqual(beatsPerRun);
    expect(mean, 'mean beats per run').not.toBeNull();

    const allowance = plain(row(playtime, 'Per-beat allowance')[1]);
    const perBeat = /(\d+)–(\d+) s, target (\d+) s/.exec(allowance);
    expect(perBeat, 'per-beat allowance').not.toBeNull();
    const [loSec, hiSec, targetSec] = perBeat!.slice(1).map(Number);
    const overhead = parseNumber(plain(row(playtime, 'Presentation overhead')[1]));
    expect(overhead).toBe(3);

    const arithmetic = plain(row(playtime, 'Arithmetic')[1]);
    expect(arithmetic).toContain(asMinutes(beatsPerRun[0] * loSec + overhead * 60));
    expect(arithmetic).toContain(
      asMinutes(Number(mean![1]) * targetSec + overhead * 60),
    );
    expect(arithmetic).toContain(asMinutes(beatsPerRun[1] * hiSec + overhead * 60));

    const target = /(\d+) minutes a run, (\d+)–(\d+) minute range/.exec(
      plain(row(playtime, 'Published target')[1]),
    );
    expect(target, 'published target').not.toBeNull();
    const [targetMinutes, rangeLo, rangeHi] = target!.slice(1).map(Number);
    const midpoint = Number(mean![1]) * targetSec + overhead * 60;
    expect(targetMinutes).toBe(Math.round(midpoint / 60));
    expect(rangeLo).toBe(Math.round((beatsPerRun[0] * loSec + overhead * 60) / 60));
    expect(rangeHi).toBe(Math.round((beatsPerRun[1] * hiSec + overhead * 60) / 60));
  });

  it('reconciles the authored word budget with its per-surface ceilings', () => {
    const beats = leadingNumber(row(counts, 'Authored scene beats')[1]);
    const endingCount = leadingNumber(row(counts, 'Endings')[1]);

    const charsOf = (label: string): number => {
      const cells = row(words, label);
      return parseNumber(cells[3]);
    };
    const countOf = (label: string): number => parseNumber(row(words, label)[2]);

    const surfaces = [
      ['context'],
      ['epilogue'],
      ['effect'],
      ['option'],
    ] as const;
    const total = surfaces.reduce((sum, [label]) => sum + charsOf(label), 0);

    expect(countOf('context')).toBe(beats);
    expect(countOf('epilogue')).toBe(endingCount);
    expect(countOf('effect')).toBe(beats + endingCount);
    // 18 real decisions, two to three authored options each.
    const optionCount = countOf('option');
    expect(optionCount).toBeGreaterThanOrEqual(36);
    expect(optionCount).toBeLessThanOrEqual(54);

    const totalRow = plain(row(words, 'Total authored').join(' '));
    const totalChars = /([\d,]+) chars/.exec(totalRow);
    expect(totalChars, 'total character ceiling').not.toBeNull();
    expect(Number(totalChars![1].replace(/,/g, ''))).toBeCloseTo(total, -2);

    const declaredWords = /([\d,]+) words/.exec(totalRow);
    expect(declaredWords, 'total word budget').not.toBeNull();
    expect(Number(declaredWords![1].replace(/,/g, ''))).toBeCloseTo(total / 6.15, -2);

    // The budget rule states the same number and a ±10% tolerance band.
    const budget = plain(row(counts, 'Authored word budget')[1]);
    expect(budget).toContain('3,200 words');
    expect(budget).toContain('2,900–3,500');
  });

  it('states a replayability target for routes, seed runs and endings', () => {
    const routes = plain(row(replay, 'Route')[2]);
    expect(routes).toContain('150 or more playable routes');
    expect(routes).toContain('100 or more distinct terminal states');

    const seed = row(replay, 'Seed').join(' ');
    expect(seed).toContain('160 measured runs');
    expect(seed).toContain('40 seeds');
    for (const policy of ['`first`', '`last`', '`seeded`', '`greedy-goodwill`']) {
      expect(seed, `policy ${policy}`).toContain(policy);
    }

    const score = plain(row(replay, 'Score and band')[2]);
    expect(score).toContain('all five bands');
  });

  it('cites only filed, non-extra-large backlog entries as v1 capability', () => {
    const rows = mustHave.slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(10);

    const seen = new Set<string>();
    for (const cells of rows) {
      const entry = /G\d+/.exec(cells[2] ?? '')?.[0];
      expect(entry, `backlog entry for ${plain(cells[0])}`).toBeDefined();
      expect(entry).not.toBe('G6');
      expect(entry).not.toBe('G13');
      expect(seen.has(entry!), `${entry} listed once`).toBe(false);
      seen.add(entry!);

      const band = plain(cells[3]);
      expect(EFFORT_BANDS).toContain(band as (typeof EFFORT_BANDS)[number]);
      expect(band).not.toBe('extra-large');

      // §7.5 must quote §6.2's band, not re-estimate it.
      const glanceBand = /^(extra-small|small–medium|small|medium|large)\b/.exec(
        plain(
          backlogGlance.find((row2) => /G\d+/.exec(row2[0] ?? '')?.[0] === entry)?.[4],
        ),
      )?.[1];
      expect(band, `${entry} band matches §6.2`).toBe(glanceBand);

      const filed = /CG-[A-Z0-9]+/.exec(cells[4] ?? '')?.[0];
      expect(filed, `${entry} filed item`).toBeDefined();
      expect(disposition.find((row2) => row2[0] === entry)?.join(' ')).toContain(
        filed!,
      );
    }

    // The largest dependency is a filed `large` entry, and there is only one.
    const large = rows.filter((cells) => plain(cells[3]) === 'large');
    expect(large).toHaveLength(1);
    expect(/G\d+/.exec(large[0][2] ?? '')?.[0]).toBe('G1');
  });

  it('keeps every deferral tracked and disjoint from the must-have list', () => {
    const rows = deferred.slice(1);
    expect(rows).toHaveLength(5);

    const deferredGaps = new Set<string>();
    for (const [index, cells] of rows.entries()) {
      expect(plain(cells[0])).toBe(`D${index + 1}`);
      expect(cells).toHaveLength(5);
      for (const cell of cells) expect(plain(cell)).not.toBe('');

      const gap = /G\d+/.exec(cells[1] ?? '')?.[0];
      if (gap) deferredGaps.add(gap);

      const tracked = plain(cells[4]);
      const hasItem = /CG-[A-Z0-9]+/.test(tracked);
      const hasSection = /§\d/.test(tracked);
      const hasPath = (cells[4] ?? '')
        .match(/`([^`\n]+)`/g)
        ?.some((token) =>
          REPO_PATH_PREFIXES.some((prefix) =>
            token.slice(1, -1).startsWith(prefix),
          ),
        );
      expect(hasItem || hasSection || hasPath, `D${index + 1} tracking reference`).toBe(
        true,
      );
    }

    expect([...deferredGaps].sort()).toEqual(['G13', 'G6']);
    for (const gap of deferredGaps) {
      const backlogRow = disposition.find((cells) => cells[0] === gap);
      expect(backlogRow?.join(' '), `${gap} is marked deferred in §6.6`).toContain(
        'Deferred',
      );
      expect(mustHave.some((cells) => cells[2]?.includes(gap))).toBe(false);
    }
  });

  it('declares the same resource set as §2.8.1', () => {
    const declared = (row(counts, 'Declared resource keys')[1].match(/`([a-z]+)`/g) ?? [])
      .map((token) => token.slice(1, -1))
      .sort();
    expect(declared).toEqual(['charge', 'goodwill', 'hull', 'morale', 'stores']);

    const modelKeys = extractTable(resourceModel, '| Key | Role in one phrase |')
      .slice(1)
      .map((cells) => plain(cells[0]))
      .filter((key) => key !== '');
    expect(modelKeys.sort()).toEqual(declared);

    const consistencyRow = plain(row(consistency, 'Resources').join(' '));
    for (const key of declared) expect(consistencyRow).toContain(key);
  });

  it('proves the Act I hatch reaches the bottom two bands arithmetically', () => {
    const rows = hatch.slice(1).map((cells) => ({
      label: plain(cells[0]),
      arc: parseNumber(cells[1]),
      choices: parseNumber(cells[2]),
      resources: parseNumber(cells[3]),
      losses: parseNumber(cells[4]),
      total: parseNumber(cells[5]),
      band: plain(cells[6]),
    }));

    for (const entry of rows) {
      expect(entry.total, `${entry.label} arithmetic`).toBe(
        entry.arc + entry.choices + entry.resources + entry.losses,
      );
      expect(entry.band, `${entry.label} band`).toBe(bandFor(entry.total));
    }

    // The hatch reaches both low bands; the abandon and finish rows agree with
    // the scoring model's own re-scored totals.
    expect(rows.some((entry) => entry.band === '0–19')).toBe(true);
    expect(rows.some((entry) => entry.band === '20–39')).toBe(true);
    expect(rows.find((entry) => entry.label.includes('abandon'))?.total).toBe(54);
    expect(rows.find((entry) => entry.label.includes('finish'))?.total).toBe(83);
    expect(scoring).toContain('**54**');
    expect(scoring).toContain('**83**');
  });

  it('gives every ending a distinct card and a stated reachable door', () => {
    const rows = endings.slice(1);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((cells) => plain(cells[0]))).size).toBe(5);
    for (const [card, title, door, ceiling] of rows.map((cells) => cells.map(plain))) {
      expect(card).toMatch(/^le-end-/);
      expect(title.length).toBeGreaterThan(0);
      expect(door.length).toBeGreaterThan(0);
      expect(Number(/^\d+/.exec(ceiling)?.[0])).toBeGreaterThan(0);
    }
    // The hatch exists and carries the Act I arc weight, not a full arc.
    const hatchRow = rows.map((cells) => cells.map(plain)).find((cells) =>
      cells[0].includes('hatch'),
    );
    expect(hatchRow?.[3]).toContain('arc 15');
  });
});
