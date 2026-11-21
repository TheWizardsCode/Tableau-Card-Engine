/**
 * GDD §6 engine-gap backlog — document ↔ code contract.
 *
 * Section 6 is the list a producer approves or defers engine work from, and the
 * list the build epic is decomposed from. That promise is only true while the
 * document and the repository agree, so this suite pins them together:
 *
 * - every entry `G1` … `G14` has a detail block with its four required fields
 *   (what it unlocks, why the engine cannot do it today, the effort band and its
 *   nearest precedent, and the disposition);
 * - every repository path the section cites exists at this commit, so a renamed
 *   or deleted module cannot leave a stale "why not today" behind;
 * - each entry's disposition is either a filed Worklog item id or an explicit
 *   deferral, and the at-a-glance table, the detail blocks and the disposition
 *   record agree with each other;
 * - the five expected gaps the GDD's scope named are each assessed explicitly;
 * - no entry links the retired `§6` stub anchor.
 *
 * This is a documentation guard: it never asserts prose, only the parts a
 * reviewer is told to verify and the build epic is told to build.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './test-support';

const GDD_PATH = resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md');

/** Repository roots a cited path may start with. */
const REPO_PATH_PREFIXES = [
  'src/',
  'example-games/',
  'scripts/',
  'tests/',
  'schemas/',
  'docs/',
] as const;

/** Every entry the backlog must carry, in the document's own order. */
const ENTRY_IDS = [
  'G1',
  'G2',
  'G3',
  'G4',
  'G5',
  'G6',
  'G7',
  'G8',
  'G9',
  'G10',
  'G11',
  'G12',
  'G13',
  'G14',
] as const;

/** The five expected gaps the GDD's scope named. */
const EXPECTED_GAPS = [
  'Beat-sheet / objective layer',
  'Arbitrary-resource generalisation follow-through',
  'CSV extension follow-through',
  'Resource HUD',
  'Act/scene transition presentation',
] as const;

/** Reads §6 of the GDD, between its heading and the next top-level heading. */
function readBacklogSection(): string {
  const doc = readFileSync(GDD_PATH, 'utf8');
  const start = doc.indexOf('## 6. Engine-Gap Backlog');
  if (start < 0) throw new Error('GDD section 6 heading not found');
  const end = doc.indexOf('## 7. ', start);
  if (end < 0) throw new Error('GDD section 7 heading not found');
  return doc.slice(start, end);
}

/** Splits the section into its `G<n>` detail blocks, keyed by entry id. */
function entryBlocks(section: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = /^#### <a id="(g\d+)"><\/a>([\s\S]*?)(?=^#### |^### )/gm;
  for (const match of section.matchAll(pattern)) {
    blocks.set(match[1].toUpperCase(), match[2]);
  }
  return blocks;
}

/**
 * Extracts the first markdown table after a marker.
 *
 * Returns the header row first, then the data rows; the separator row is
 * dropped so callers cannot accidentally assert on `---`.
 */
function extractTable(section: string, marker: string): string[][] {
  const markerIndex = section.indexOf(marker);
  if (markerIndex < 0) throw new Error(`marker ${marker} not found in GDD section 6`);
  // Start at the marker's own line, so the header row is included rather than
  // skipped: the marker is a prefix of the header, not the whole line.
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
  if (rows.length < 3) throw new Error(`table after ${marker} is missing data rows`);
  return [rows[0], ...rows.slice(2)];
}

/** Returns every `G<n>` id mentioned in a table's first column. */
function firstColumnEntryIds(rows: string[][]): string[] {
  return rows
    .slice(1)
    .map((row) => /G\d+/.exec(row[0] ?? '')?.[0])
    .filter((id): id is string => Boolean(id));
}

/** The disposition sentence of one entry block. */
function dispositionOf(block: string): string {
  const index = block.indexOf('**Disposition.**');
  if (index < 0) return '';
  return block.slice(index, index + 400);
}

/** Repository-relative paths cited in backticks by the section. */
function citedRepoPaths(section: string): string[] {
  const tokens = new Set(section.match(/`([^`\n]+)`/g) ?? []);
  const paths: string[] = [];
  for (const token of tokens) {
    const value = token.slice(1, -1).trim();
    if (value.includes('<') || value.includes(' ') || value.includes('*')) continue;
    if (REPO_PATH_PREFIXES.some((prefix) => value.startsWith(prefix))) {
      paths.push(value);
    }
  }
  return paths.sort();
}

const section = readBacklogSection();
const blocks = entryBlocks(section);
const glanceRows = extractTable(section, '| Entry | Capability |');
const dispositionRows = extractTable(section, '| Entry | Worklog item |');
const expectedGapRows = extractTable(section, '| Expected gap | Verdict |');

describe('GDD §6 engine-gap backlog', () => {
  it('lists every entry as a detail block with its four required fields', () => {
    expect([...blocks.keys()]).toEqual(ENTRY_IDS);
    for (const id of ENTRY_IDS) {
      const block = blocks.get(id) ?? '';
      expect(block, `${id} detail block`).not.toBe('');
      expect(block, `${id} unlocks`).toContain('**What it unlocks.**');
      expect(block, `${id} evidence`).toContain(
        '**Why the engine cannot do it at this commit.**',
      );
      expect(block, `${id} effort band`).toContain('**Nearest precedent and effort band.**');
      expect(block, `${id} disposition`).toContain('**Disposition.**');
    }
  });

  it('names only repository paths that exist at this commit', () => {
    const missing = citedRepoPaths(section).filter(
      (path) => !existsSync(resolve(REPO_ROOT, path.replace(/\/$/, ''))),
    );
    expect(missing, 'cited paths that no longer exist').toEqual([]);
  });

  it('gives every entry a filed work item or an explicit deferral', () => {
    for (const id of ENTRY_IDS) {
      const disposition = dispositionOf(blocks.get(id) ?? '');
      const filed = /`CG-[A-Z0-9]+`/.test(disposition);
      const deferred = /deferred to the build epic/i.test(disposition);
      expect(filed || deferred, `${id} disposition`).toBe(true);
    }
  });

  it('keeps the at-a-glance table, the detail blocks and the disposition record in step', () => {
    expect(firstColumnEntryIds(glanceRows)).toEqual(ENTRY_IDS);
    expect(firstColumnEntryIds(dispositionRows)).toEqual(ENTRY_IDS);

    for (const id of ENTRY_IDS) {
      const glance = glanceRows.find((row) => row[0]?.includes(id)) ?? [];
      const record = dispositionRows.find((row) => row[0] === id) ?? [];
      const disposition = dispositionOf(blocks.get(id) ?? '');

      const recordItem = /`(CG-[A-Z0-9]+)`/.exec(record.join(' '))?.[1];
      const detailItem = /`(CG-[A-Z0-9]+)`/.exec(disposition)?.[1];
      expect(recordItem, `${id} disposition record item`).toBe(detailItem ?? undefined);
      if (glance.join(' ').includes('Deferred')) {
        expect(recordItem, `${id} glance/detail deferral`).toBeUndefined();
      }
    }
  });

  it('assesses each of the five expected gaps explicitly', () => {
    const assessed = expectedGapRows.slice(1).map((row) =>
      (row[0] ?? '').replace(/\*\*/g, '').trim(),
    );
    expect(assessed).toEqual([...EXPECTED_GAPS]);
  });

  it('does not link the retired §6 stub anchor', () => {
    const doc = readFileSync(GDD_PATH, 'utf8');
    expect(doc).not.toContain('6-engine-gap-backlog-todo');
    expect(doc).toContain('## 6. Engine-Gap Backlog');
  });
});
