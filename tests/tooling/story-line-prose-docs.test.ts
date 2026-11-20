/**
 * Docs-drift guard for the story-line **prose authoring** documentation
 * (`CG-0MWO7CXSL001817A`).
 *
 * The prose slice added three authoring surfaces (`context`, `#says`,
 * `epilogue`), an escape policy, prose budgets and a narration reveal helper.
 * Their documentation is hand-written, so nothing but a guard stops the quoted
 * CSV rows silently drifting from the shipped content — exactly the failure the
 * item's acceptance criterion 7 forbids.
 *
 * The contract pinned here:
 *
 * - every ```csv example in `docs/core-engine/story-line.md` and
 *   `docs/DEVELOPER.md` is **verbatim** present in a shipped content file or a
 *   test fixture (no truncated `…` rows);
 * - the documented prose budgets equal `PROSE_FIELD_SPECS` (one source of
 *   truth for the validator, the editor hints and the docs);
 * - the escape policy table documents `\;`, `\#` and `\\`, and the
 *   "omitted mapping = no such column" contract is stated;
 * - `docs/ui-animations.md` documents the narration reveal signature,
 *   reduced-motion contract, `COMMON_SFX_KEYS` source and idempotent
 *   `complete()` / `destroy()`;
 * - `docs/gym/GYM_INDEX.md` records the prose surfaces and names the test files
 *   that cover them, and those files exist.
 *
 * Pure filesystem reads in the Node `unit` project: no network, no writes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PROSE_FIELD_SPECS } from '../../src/story-line/content/prose';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Reads a repository-relative UTF-8 file. */
function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, ...relativePath.split('/')), 'utf-8');
}

/** True when a repository-relative path exists. */
function repoFileExists(relativePath: string): boolean {
  return existsSync(join(REPO_ROOT, ...relativePath.split('/')));
}

/** Every fenced ```csv block in a Markdown document, in file order. */
function extractCsvBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const pattern = /```csv\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push((match[1] ?? '').trim());
  }
  return blocks;
}

/** Shipped content + prose fixtures a documented CSV example may quote. */
function csvSources(): string[] {
  const shipped = [
    'example-games/gym/content/storylines.csv',
    'example-games/gym/content/long-erasure.csv',
  ].map(read);
  const fixtureDir = join(REPO_ROOT, 'tests/fixtures/story-line/prose');
  const fixtures = readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.csv'))
    .map((name) => readFileSync(join(fixtureDir, name), 'utf-8'));
  return [...shipped, ...fixtures];
}

const DOCS_WITH_CSV = [
  'docs/core-engine/story-line.md',
  'docs/DEVELOPER.md',
];

describe('story-line prose authoring docs', () => {
  it('quotes every CSV example verbatim from shipped content or a fixture', () => {
    const sources = csvSources();

    for (const docPath of DOCS_WITH_CSV) {
      const blocks = extractCsvBlocks(read(docPath));
      expect(blocks.length, `${docPath} documents at least one CSV example`).toBeGreaterThan(0);

      for (const block of blocks) {
        const lines = block.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
        for (const line of lines) {
          const present = sources.some((source) => source.includes(line));
          expect(
            present,
            `${docPath} quotes a row/cell that is not verbatim in shipped content or a fixture: ${line.slice(0, 120)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('documents prose budgets that match PROSE_FIELD_SPECS', () => {
    const storyDoc = read('docs/core-engine/story-line.md');
    const developerDoc = read('docs/DEVELOPER.md');

    for (const spec of PROSE_FIELD_SPECS) {
      expect(storyDoc, `documented ${spec.field} budget`).toContain(
        `| \`${spec.field}\` | ${spec.budget} |`,
      );
      expect(developerDoc, `DEVELOPER quotes the ${spec.field} budget`).toContain(
        `${spec.budget} characters`,
      );
    }
  });

  it('states the optional/additive prose-column contract', () => {
    const storyDoc = read('docs/core-engine/story-line.md');

    expect(storyDoc).toContain('no such column');
    expect(storyDoc).toContain('An omitted mapping means');
    expect(storyDoc).toContain('`ContentFieldMapping` gains two');
    expect(storyDoc).toContain('`ContentCard.context`');
    expect(storyDoc).toContain('`ContentCard.epilogue`');
  });

  it('documents the says escape policy table and the single-segment rule', () => {
    const storyDoc = read('docs/core-engine/story-line.md');
    const developerDoc = read('docs/DEVELOPER.md');

    for (const doc of [storyDoc, developerDoc]) {
      expect(doc).toContain('`\\;`');
      expect(doc).toContain('`\\#`');
      expect(doc).toContain('`\\\\`');
    }

    expect(storyDoc).toContain('#### Escape policy');
    expect(storyDoc).toContain('unescaped-says-delimiter');
    expect(storyDoc).toContain('says-segment-count');
    expect(storyDoc).toContain('Not reserved in prose');
  });

  it('cross-links the escape policy from the parser and the editor hint', () => {
    const compileSource = read('src/story-line/compile.ts');
    const descriptorsSource = read('src/story-line/editor/field-descriptors.ts');

    // Single source of truth: the author-facing table in the docs.
    expect(compileSource).toContain('single source of truth');
    expect(compileSource).toContain('docs/core-engine/story-line.md');
    expect(descriptorsSource).toContain('docs/core-engine/story-line.md');
    expect(descriptorsSource).toContain('Escape policy');
  });

  it('documents journal and closing behaviour for authored prose', () => {
    const storyDoc = read('docs/core-engine/story-line.md');

    expect(storyDoc).toContain('#### Journal and closing behaviour');
    expect(storyDoc).toContain('outcomeProse');
    expect(storyDoc).toContain('truncateOutcome');
    expect(storyDoc).toContain('outcomeFull');
    expect(storyDoc).toContain('epilogueProse');
  });

  it('documents the narration reveal helper contract', () => {
    const animationsDoc = read('docs/ui-animations.md');

    expect(animationsDoc).toContain(
      'revealNarration(options: RevealNarrationOptions): NarrationRevealHandle',
    );
    expect(animationsDoc).toContain('COMMON_SFX_KEYS');
    expect(animationsDoc).toContain('SoundManager');
    expect(animationsDoc).toContain('`reducedMotion`');
    expect(animationsDoc).toContain('### Reduced-motion contract');
    expect(animationsDoc).toContain('### SFX contract');
    expect(animationsDoc).toContain('`complete()`');
    expect(animationsDoc).toContain('`destroy()`');
    expect(animationsDoc).toMatch(/idempotent/i);
  });

  it('records the prose surfaces and covering tests in the Gym index', () => {
    const gymIndex = read('docs/gym/GYM_INDEX.md');
    const coveringTests = [
      'tests/gym/GymStorylineContent.test.ts',
      'tests/gym/LongErasureProse.test.ts',
      'tests/gym/LongErasureContent.test.ts',
      'tests/ui/narration-reveal.test.ts',
      'tests/ui/prose-pagination.test.ts',
    ];

    expect(gymIndex).toContain('`context`');
    expect(gymIndex).toContain('`#says=`');
    expect(gymIndex).toContain('epilogue');
    for (const testPath of coveringTests) {
      expect(gymIndex, `GYM_INDEX names ${testPath}`).toContain(testPath.split('/').pop()!);
      expect(repoFileExists(testPath), `${testPath} exists`).toBe(true);
    }
  });

  it('links only to files that exist', () => {
    const linkedPaths = [
      'src/story-line/content/prose.ts',
      'tests/story-line/content/prose-parity.test.ts',
      'tests/story-line/content/prose-contract.test.ts',
      'tests/fixtures/story-line/prose/prose-option-attributes.csv',
      'tests/fixtures/story-line/prose/prose-says-parallel.csv',
      'tests/fixtures/story-line/prose/prose-says-unescaped.csv',
      'example-games/gym/content/storylines.csv',
      'example-games/gym/content/long-erasure.csv',
    ];

    const docs = [
      read('docs/core-engine/story-line.md'),
      read('docs/DEVELOPER.md'),
      read('docs/gym/GYM_INDEX.md'),
    ].join('\n');

    for (const linkedPath of linkedPaths) {
      expect(repoFileExists(linkedPath), `${linkedPath} exists`).toBe(true);
      expect(docs, `docs link to ${linkedPath}`).toContain(linkedPath.split('/').pop()!);
    }
  });
});
