/**
 * Docs-drift guard for the scene-space guard (engine gap G3).
 *
 * The scene-space guard is only a *build-epic check* if the place a writer or a
 * reviewer looks says the same thing the module and the CLI actually do. Three
 * documents carry that promise:
 *
 * - `docs/core-engine/story-line.md` — the reference section beside the
 *   route-space guard: both invariants, the state tuple, the bounds and
 *   fail-closed truncation, the JSON shape, the exit codes, the unclamped
 *   resource caveat with its G4 pointer, and the CI invocation;
 * - `docs/design/storyline-game-gdd.md` — the four places the GDD names the gap
 *   (§2.4 static composition, §2.8.6 item 5, §5.2 named gaps, §6 backlog), each
 *   marked delivered with the work item and the command;
 * - `docs/DEVELOPER.md` — the story-line CLI command list names the
 *   `--manifest` mode.
 *
 * Pure filesystem reads in the Node `unit` project: no network, no writes.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Reads a repository-relative UTF-8 file. */
function read(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf-8');
}

/** Returns the slice of `doc` between `startHeading` and `endHeading`. */
function section(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  if (start < 0) throw new Error(`heading not found: ${startHeading}`);
  const end = doc.indexOf(endHeading, start + startHeading.length);
  if (end < 0) throw new Error(`heading not found after ${startHeading}: ${endHeading}`);
  return doc.slice(start, end);
}

/** The repository-relative reference-section path the GDD links to. */
const REFERENCE_PATH = '../core-engine/story-line.md#scene-space-guard';
/** The work item that filed and delivered the gap. */
const WORK_ITEM = 'CG-0MWR0BG9H007AFNU';
/** The G4 clamping item the unclamped-resource caveat points at. */
const CLAMPING_ITEM = 'CG-0MWR0BGVG004UE7X';

const STORY_LINE_DOC = read('docs/core-engine/story-line.md');
const GDD = read('docs/design/storyline-game-gdd.md');
const DEVELOPER_DOC = read('docs/DEVELOPER.md');

describe('scene-space guard reference documentation', () => {
  const reference = section(STORY_LINE_DOC, '### Scene-space guard', '### Transactional author API');

  it('documents both invariants and the state tuple', () => {
    for (const invariant of [
      '`no-success-on-exhausted-close`',
      '`refusal-reaches-ending`',
    ]) {
      expect(reference, `names ${invariant}`).toContain(invariant);
    }

    for (const tupleMember of [
      '`sceneId`',
      '`beatId`',
      '`clockRemaining`',
      '`pendingChain`',
      'declared resource bag',
    ]) {
      expect(reference, `enumerates ${tupleMember}`).toContain(tupleMember);
    }
  });

  it('documents the bounds, the fail-closed truncation rule and determinism', () => {
    expect(reference).toContain('`maxDepth`');
    expect(reference).toContain('`maxStates`');
    expect(reference).toContain('`exploration.truncated`');
    expect(reference).toMatch(/fail(s)? closed/i);
    expect(reference).toMatch(/byte-identical/);
  });

  it('documents the JSON shape, the exit codes and the CLI invocation', () => {
    for (const jsonKey of [
      '`sceneExits`',
      '`beatRefusals`',
      '`invariants`',
      '`violations`',
      '`exploration`',
    ]) {
      expect(reference, `documents ${jsonKey}`).toContain(jsonKey);
    }

    expect(reference).toContain('--manifest <file>');
    expect(reference).toContain('npm run storylines:guard');
    expect(reference).toMatch(/Exit codes: `0`/);
    expect(reference).toMatch(/`1`/);
  });

  it('records the unclamped-resource caveat with its G4 pointer', () => {
    expect(reference).toMatch(/unclamped/i);
    expect(reference).toContain(CLAMPING_ITEM);
  });

  it('is linked from the CLI table row for storylines:guard', () => {
    const row = STORY_LINE_DOC.split('\n').find((line) =>
      line.startsWith('| `npm run storylines:guard`'),
    );
    expect(row, 'storylines:guard CLI table row').toBeDefined();
    expect(row).toContain('--manifest');
  });
});

describe('GDD disposition of the scene-space guard gap', () => {
  it('marks the §2.4 static composition check delivered with the item and the command', () => {
    const table = section(GDD, '**Static composition.**', 'The rejoin-distance *number*');
    expect(table).toContain('Scene-space guard');
    expect(table).toMatch(/delivered/i);
    expect(table).toContain(WORK_ITEM);
    expect(table).toContain('storylines:guard');
    expect(table).toContain('--manifest');
    expect(table).toContain(REFERENCE_PATH);
  });

  it('marks §2.8.6 item 5 delivered with the item and the command', () => {
    const gaps = section(GDD, '#### 2.8.6', '#### 2.8.7');
    const row = gaps
      .split('\n')
      .find((line) => line.startsWith('| 5 |'));
    expect(row, '§2.8.6 row 5').toBeDefined();
    expect(row).toContain('Delivered');
    expect(row).toContain(WORK_ITEM);
    expect(row).toContain('storylines:guard');
    expect(row).toContain('--manifest');
    expect(row).toContain(REFERENCE_PATH);
  });

  it('marks the §5.2 scene-space row delivered with the item and the command', () => {
    const verification = section(GDD, '### 5.2', '### 5.3');
    const row = verification
      .split('\n')
      .find((line) => line.startsWith('| Scene-space guard |'));
    expect(row, '§5.2 scene-space row').toBeDefined();
    expect(row).toContain('delivered');
    expect(row).toContain(WORK_ITEM);
    expect(row).toContain('storylines:guard --manifest');
    expect(row).toContain(REFERENCE_PATH);
  });

  it('marks the §6 G3 row and its detail block delivered with the item and the command', () => {
    const backlog = section(GDD, '## 6. Engine-Gap Backlog', '## 7. ');
    const glanceRow = backlog
      .split('\n')
      .find((line) => line.startsWith('| [G3](#g3) |'));
    expect(glanceRow, '§6.2 G3 row').toBeDefined();
    expect(glanceRow).toContain('Delivered');
    expect(glanceRow).toContain(WORK_ITEM);
    expect(glanceRow).toContain('storylines:guard');
    expect(glanceRow).toContain('--manifest');
    expect(glanceRow).toContain(REFERENCE_PATH);

    const detail = section(backlog, '#### <a id="g3"></a>', '#### <a id="g4"></a>');
    expect(detail).toContain('**Delivered**');
    expect(detail).toContain(WORK_ITEM);
    expect(detail).toContain('storylines:guard');
    expect(detail).toContain('--manifest');
    expect(detail).toContain(REFERENCE_PATH);
  });
});

describe('DEVELOPER CLI command list', () => {
  it('shows the manifest mode beside the route-space invocations', () => {
    expect(DEVELOPER_DOC).toContain('npm run storylines:guard -- --manifest');
    expect(DEVELOPER_DOC).toContain('--manifest <file>');
    expect(DEVELOPER_DOC).toMatch(/scene-space/i);
  });
});
