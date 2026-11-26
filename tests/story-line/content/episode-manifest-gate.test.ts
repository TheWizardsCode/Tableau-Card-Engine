/**
 * Episode manifest cross-rule determinism gate (CG-0MWSJYY9S0046V55).
 *
 * The per-rule suites each prove one family in isolation. This gate is the only
 * check that the whole §2.4 rule table runs **together**, over the real
 * Appendix A manifest, through both the direct call and the `storylines:manifest`
 * CLI — so "the specification cannot drift from the tooling" is one green (or
 * red) signal:
 *
 * - **Completeness.** The GDD §2.4 rule table, the `EpisodeManifestIssueCode`
 *   union and the validator's `rules` list are the same set, so a rule can be
 *   neither silently dropped nor declared-but-never-run.
 * - **Clean control.** The committed Appendix A manifest bound to the shipped
 *   `long-erasure.csv` reports `valid: true` with zero findings, directly and
 *   through the CLI (exit 0).
 * - **Drift pin.** The GDD Appendix A fence is byte-identical to the committed
 *   fixture *and* that exact document passes the full rule table — the three
 *   can only agree.
 * - **Determinism.** Two formatter runs and two CLI runs over the same result
 *   are byte-identical, and permuting the `acts` / `scenes` / `beats` arrays
 *   never changes the finding *set* (only index-addressed paths move).
 * - **Corruption sweep.** Every fixture in the corpus — plus the two content
 *   overrides for the rule families whose defect cannot live in a manifest
 *   mutation — is driven through the CLI, asserting the emitted JSON codes match
 *   `expected-codes.json`. The metadata's code union must equal the full rule
 *   table, so no rule can pass its own unit test while being unreachable from
 *   the command line.
 *
 * **Rule count.** The GDD §2.4 table carries **sixteen** codes, not the
 * fifteen the work item's acceptance criterion quotes: fifteen durable design
 * rules plus the migration-only `clock-cost-mismatch` that G10
 * (`CG-0MWR0BJXI007UINE`) retires with the legacy CSV column. The gate derives
 * the count from the GDD table instead of hard-coding either number, so the
 * two artefacts agree by construction rather than by a remembered constant.
 *
 * Deliberately thin: the sweep pins codes, paths and reasons only. Individual
 * message wording stays the per-rule suites' business.
 *
 * @module
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LONG_ERASURE_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_PATH,
} from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv, serialiseCsv } from '../../../src/story-line/content/csv';
import {
  EPISODE_MANIFEST_ISSUE_CODES,
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestIssueCode,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import { resolveResourceKeys } from '../../../src/story-line/resources';
import type { ContentCard } from '../../../src/story-line/content/types';
import {
  DEFAULT_EPISODE_MANIFEST_PATH,
  runStorylineManifestCli,
} from '../../../scripts/storyline-manifest';
import { REPO_ROOT, captureOutput, makeTempDir } from './test-support';

/** The GDD that carries both the §2.4 rule table and the Appendix A fence. */
const GDD_PATH = resolve(REPO_ROOT, 'docs/design/storyline-game-gdd.md');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, DEFAULT_EPISODE_MANIFEST_PATH);

/** The shipped story-line content the committed manifest binds. */
const CONTENT_PATH = resolve(REPO_ROOT, LONG_ERASURE_CONTENT_PATH);

/** The committed fixture corpus and its expected-code metadata. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The expected-code metadata the sweep reads (never a hard-coded table). */
const EXPECTED_CODES_PATH = join(FIXTURE_DIR, 'expected-codes.json');

/** Extraction pattern documented by the GDD §5.3 self-check. */
const GDD_BLOCK_PATTERN = /<!-- episode-manifest-example -->\s*```json\n([\s\S]*?)\n```/;

/** Reads a UTF-8 file. */
function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readText(path)) as Record<string, unknown>;
}

/** The committed Appendix A manifest as a fresh mutable copy. */
function reference(): Record<string, unknown> {
  return readJson(REFERENCE_PATH);
}

/** Parses the shipped content into cards through the Long Erasure adapter. */
function shippedCards(): ContentCard[] {
  return cardsFromCsv(parseCsv(readText(CONTENT_PATH)), LONG_ERASURE_CONTENT_ADAPTER);
}

/** The declared resource key set, derived exactly as the CLI derives it. */
function declaredResourcesOf(cards: readonly ContentCard[]): readonly string[] {
  const declaredKeys = cards.flatMap((card) => card.resourceKeys);
  return resolveResourceKeys(declaredKeys.length > 0 ? declaredKeys : undefined);
}

/** Validates a manifest against the shipped content with every rule bound. */
function validate(
  manifest: unknown,
  cards: readonly ContentCard[] = shippedCards(),
): EpisodeManifestValidationResult {
  return validateEpisodeManifest(
    manifest,
    cards,
    declaredResourcesOf(cards),
    LONG_ERASURE_CONTENT_ADAPTER,
  );
}

/** A finding's identity for the sweep: code, path and optional reason. */
type FindingKey = { code: string; path: string; reason?: string };

/** Maps the CLI's JSON report findings onto the same keys. */
function reportFindingKeys(report: Record<string, unknown>): FindingKey[] {
  const findings = report.findings;
  if (!Array.isArray(findings)) throw new Error('report.findings is not an array');
  return findings.map((entry) => {
    const record = entry as Record<string, unknown>;
    return {
      code: String(record.code),
      path: String(record.path),
      ...(record.reason === undefined ? {} : { reason: String(record.reason) }),
    };
  });
}

/**
 * A finding's structural identity: its code, reason and index-free path.
 *
 * Array positions are presentation, not semantics — the manifest's `order`
 * fields and its unique ids are the ordering authority — so the invariance
 * assertion compares findings with `[0]` / `[1]` collapsed to `[]`.
 */
function structuralKey(key: FindingKey): string {
  return `${key.code}|${key.reason ?? ''}|${key.path.replace(/\[\d+\]/g, '[]')}`;
}

/** Runs the manifest CLI in-process, capturing both streams. */
function runCli(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  return captureOutput(() => runStorylineManifestCli(args));
}

/** Runs the CLI with `--json` and parses the stable report. */
function runCliJson(args: readonly string[]): {
  code: number;
  report: Record<string, unknown>;
  stdout: string;
  stderr: string;
} {
  const outcome = runCli([...args, '--json']);
  return {
    code: outcome.code,
    report: JSON.parse(outcome.stdout) as Record<string, unknown>,
    stdout: outcome.stdout,
    stderr: outcome.stderr,
  };
}

/** Extracts the GDD §2.4 rule table's codes, in table order. */
function gddRuleTableCodes(): string[] {
  const text = readText(GDD_PATH);
  const start = text.indexOf('### 2.4 ');
  if (start < 0) throw new Error('GDD §2.4 heading not found');
  const next = text.indexOf('\n### ', start + 5);
  const section = next < 0 ? text.slice(start) : text.slice(start, next);
  const lines = section.split('\n');
  const header = lines.findIndex((line) => /^\|\s*Code\s*\|\s*Rule\s*\|$/.test(line.trim()));
  if (header < 0) throw new Error('GDD §2.4 rule table header (| Code | Rule |) not found');
  const codes: string[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const firstCell = line.split('|')[1] ?? '';
    const found = [...firstCell.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1]);
    codes.push(...found);
  }
  if (codes.length === 0) throw new Error('GDD §2.4 rule table lists no codes');
  return codes;
}

/** Extracts the GDD Appendix A fence body (without the surrounding newlines). */
function gddManifestBlock(): string {
  const match = GDD_BLOCK_PATTERN.exec(readText(GDD_PATH));
  if (match === null) {
    throw new Error('episode-manifest-example block not found or not fenced as json');
  }
  return match[1];
}

// ── The expected-code metadata (expected-codes.json) ───────

/** A declared content mutation applied to the shipped CSV rows. */
type ContentMutation =
  | {
      readonly kind: 'append-card';
      readonly card: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'set-cell';
      readonly cardId: string;
      readonly column: string;
      readonly value: string;
    };

/** One fixture + the findings the CLI must emit for it. */
interface CorpusCase {
  readonly file: string;
  readonly findings: readonly FindingKey[];
}

/** One content-override case + the findings the CLI must emit for it. */
interface OverrideCase {
  readonly id: string;
  readonly mutation: ContentMutation;
  readonly findings: readonly FindingKey[];
}

/** The parsed expected-code metadata. */
interface ExpectedCodes {
  readonly manifest: string;
  readonly content: string;
  readonly corpus: readonly CorpusCase[];
  readonly contentOverrides: readonly OverrideCase[];
}

/** Reads a string member, failing loudly when the metadata is malformed. */
function stringMember(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`expected-codes.json: ${key} must be a string`);
  }
  return value;
}

/** Parses one `{ code, path, reason? }` expectation entry. */
function parseFinding(entry: unknown): FindingKey {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('expected-codes.json: a finding must be an object');
  }
  const record = entry as Record<string, unknown>;
  return {
    code: stringMember(record, 'code'),
    path: stringMember(record, 'path'),
    ...(record.reason === undefined ? {} : { reason: stringMember(record, 'reason') }),
  };
}

/** Parses a findings array. */
function parseFindings(value: unknown): FindingKey[] {
  if (!Array.isArray(value)) throw new Error('expected-codes.json: findings must be an array');
  return value.map(parseFinding);
}

/** Parses the committed expected-code metadata (total: malformed costs a throw). */
function expectedCodes(): ExpectedCodes {
  const raw = readJson(EXPECTED_CODES_PATH);
  const corpus = raw.corpus;
  const contentOverrides = raw.contentOverrides;
  if (!Array.isArray(corpus)) throw new Error('expected-codes.json: corpus must be an array');
  if (!Array.isArray(contentOverrides)) {
    throw new Error('expected-codes.json: contentOverrides must be an array');
  }
  return {
    manifest: stringMember(raw, 'manifest'),
    content: stringMember(raw, 'content'),
    corpus: corpus.map((entry) => {
      const record = entry as Record<string, unknown>;
      return { file: stringMember(record, 'file'), findings: parseFindings(record.findings) };
    }),
    contentOverrides: contentOverrides.map((entry) => {
      const record = entry as Record<string, unknown>;
      const mutation = record.mutation as Record<string, unknown> | undefined;
      if (mutation === undefined) throw new Error('expected-codes.json: mutation is required');
      return {
        id: stringMember(record, 'id'),
        mutation: parseMutation(mutation),
        findings: parseFindings(record.findings),
      };
    }),
  };
}

/** Parses one content mutation descriptor. */
function parseMutation(record: Record<string, unknown>): ContentMutation {
  const kind = stringMember(record, 'kind');
  if (kind === 'append-card') {
    const card = record.card;
    if (card === null || typeof card !== 'object' || Array.isArray(card)) {
      throw new Error('expected-codes.json: append-card needs a card object');
    }
    const cells: Record<string, string> = {};
    for (const [column, value] of Object.entries(card as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        throw new Error(`expected-codes.json: card cell "${column}" must be a string`);
      }
      cells[column] = value;
    }
    return { kind, card: cells };
  }
  if (kind === 'set-cell') {
    return {
      kind,
      cardId: stringMember(record, 'cardId'),
      column: stringMember(record, 'column'),
      value: stringMember(record, 'value'),
    };
  }
  throw new Error(`expected-codes.json: unknown mutation kind "${kind}"`);
}

/**
 * Applies one content mutation to the shipped CSV and returns the new text.
 *
 * Purely textual: the mutation touches exactly the declared cell(s), so the
 * override cannot quietly introduce a second defect.
 */
function mutateContent(mutation: ContentMutation): string {
  const parsed = parseCsv(readText(CONTENT_PATH));
  const header = parsed.header;
  const rowOf = (cardId: string): string[] => {
    const index = header.indexOf('id');
    const row = parsed.rows.find((candidate) => candidate[index] === cardId);
    if (row === undefined) throw new Error(`content mutation: card "${cardId}" not found`);
    return [...row];
  };

  if (mutation.kind === 'append-card') {
    const row = new Array<string>(header.length).fill('');
    for (const [column, value] of Object.entries(mutation.card)) {
      const index = header.indexOf(column);
      if (index < 0) throw new Error(`content mutation: unknown column "${column}"`);
      row[index] = value;
    }
    return serialiseCsv({ ...parsed, rows: [...parsed.rows, row] });
  }

  const index = header.indexOf(mutation.column);
  if (index < 0) throw new Error(`content mutation: unknown column "${mutation.column}"`);
  const row = rowOf(mutation.cardId);
  row[index] = mutation.value;
  const rows = parsed.rows.map((candidate) =>
    candidate[header.indexOf('id')] === mutation.cardId ? row : candidate,
  );
  return serialiseCsv({ ...parsed, rows });
}

// ── Completeness: the specification, the union and the run agree ──

describe('the §2.4 rule table', () => {
  it('lists every code the validator can report, in table order', () => {
    // Derived from the GDD rather than a remembered count: sixteen codes today
    // (fifteen durable rules + the migration-only `clock-cost-mismatch`).
    const table = gddRuleTableCodes();
    expect(table.length).toBe(16);
    expect(table).toEqual([...EPISODE_MANIFEST_ISSUE_CODES]);
  });

  it('has no duplicate code in the table or the union', () => {
    const table = gddRuleTableCodes();
    expect(new Set(table).size).toBe(table.length);
    expect(new Set(EPISODE_MANIFEST_ISSUE_CODES).size).toBe(EPISODE_MANIFEST_ISSUE_CODES.length);
  });
});

describe('rule-table completeness', () => {
  it('reports every §2.4 rule as run when content and declared resources are bound', () => {
    const result = validate(reference());
    // A set, not a sequence: the result groups rules by activation family
    // (structural, then content, resource, migration), not by table order.
    expect([...result.rules].sort()).toEqual([...gddRuleTableCodes()].sort());
    expect([...result.rules].sort()).toEqual([...EPISODE_MANIFEST_ISSUE_CODES].sort());
  });

  it('reports the same full rule set through the CLI', () => {
    const { code, report } = runCliJson(['--manifest', REFERENCE_PATH]);
    expect(code).toBe(0);
    expect([...(report.rules as string[])].sort()).toEqual([...gddRuleTableCodes()].sort());
  });

  it('never claims a rule ran without its activation input', () => {
    // Manifest-only binding runs the structural/identity families; the content,
    // resource and migration families need their inputs bound. This is the
    // mirror of the completeness assertion: `rules` is a claim, not a union
    // echo. (The per-rule activation tests pin the exact list.)
    const manifestOnly = validateEpisodeManifest(reference());
    const full = new Set<string>(EPISODE_MANIFEST_ISSUE_CODES);
    expect(manifestOnly.rules.length).toBeGreaterThan(0);
    expect(manifestOnly.rules.length).toBeLessThan(EPISODE_MANIFEST_ISSUE_CODES.length);
    expect(manifestOnly.rules.every((rule) => full.has(rule))).toBe(true);
    expect(manifestOnly.findings).toEqual([]);
  });
});

// ── Clean control: the real Appendix A manifest ────────────

describe('clean control — the committed Appendix A manifest', () => {
  it('reports valid: true with zero findings against long-erasure.csv', () => {
    const result = validate(reference());
    expect(result.findings).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.manifestId).toBe('long-erasure');
    expect(result.counts).toEqual({ acts: 3, scenes: 5, beats: 15 });
  });

  it('reports valid: true with zero findings through the CLI default mode', () => {
    const { code, report, stderr } = runCliJson(['--manifest', REFERENCE_PATH]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(report.valid).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.content).toBe(CONTENT_PATH);
    expect(report.adapter).toBe('long-erasure');
  });
});

describe('the drift pin — GDD fence, fixture and validator agree', () => {
  it('keeps the GDD Appendix A fence byte-identical to the committed fixture', () => {
    expect(`${gddManifestBlock()}\n`).toBe(readText(REFERENCE_PATH));
  });

  it('validates the exact GDD fence document clean against the full rule table', () => {
    // Not a copy or a re-serialisation: the bytes the specification shows.
    const fromFence = JSON.parse(gddManifestBlock()) as unknown;
    const result = validate(fromFence);
    expect(result.findings).toEqual([]);
    expect([...result.rules].sort()).toEqual([...EPISODE_MANIFEST_ISSUE_CODES].sort());
    // And the fixture is that same document (pinned above), so a manifest
    // edit in any one of the three places turns this gate red.
    expect(fromFence).toEqual(reference());
  });
});

// ── Determinism ────────────────────────────────────────────

/** A multi-defect manifest: four findings across three rule families. */
function multiDefectManifest(): Record<string, unknown> {
  const manifest = reference();
  type MutableAct = {
    order: number;
    scenes: Array<{
      objective: { statement: string };
      beats: Array<{ clockCost: number }>;
    }>;
  };
  const acts = manifest.acts as MutableAct[];
  // `numeric-invalid` (act-order-invalid) — no cascade.
  acts[0].order = 0;
  // `numeric-invalid` (clock-cost-invalid) + `clock-cost-mismatch` — no cascade.
  acts[0].scenes[0].beats[1].clockCost = -1;
  // `objective-invalid` (statement-too-long) — no cascade.
  acts[0].scenes[1].objective.statement = 'x'.repeat(91);
  return manifest;
}

/** Reverses `acts`, each act's `scenes` and each scene's `beats` in place. */
function reverseStructuralOrder(manifest: Record<string, unknown>): Record<string, unknown> {
  type MutableScene = { beats: unknown[] };
  type MutableAct = { scenes: MutableScene[] };
  const acts = manifest.acts as MutableAct[];
  acts.reverse();
  for (const act of acts) {
    act.scenes.reverse();
    for (const scene of act.scenes) scene.beats.reverse();
  }
  return manifest;
}

describe('determinism of the formatters', () => {
  it('renders byte-identical text and JSON reports on two runs over a clean result', () => {
    const result = validate(reference());
    expect(formatEpisodeManifestReport(result)).toBe(formatEpisodeManifestReport(result));
    expect(episodeManifestValidationToJson(result)).toBe(
      episodeManifestValidationToJson(result),
    );
  });

  it('renders byte-identical text and JSON reports on two runs over a finding result', () => {
    const result = validate(multiDefectManifest());
    // Fresh results from fresh documents: nothing is cached between runs.
    const again = validate(multiDefectManifest());
    expect(result.findings.length).toBeGreaterThan(0);
    expect(formatEpisodeManifestReport(result)).toBe(formatEpisodeManifestReport(again));
    expect(episodeManifestValidationToJson(result)).toBe(
      episodeManifestValidationToJson(again),
    );
    // No clock: a report can never carry a timestamp.
    expect(episodeManifestValidationToJson(result)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('emits byte-identical CLI JSON on two successive runs over a finding fixture', () => {
    const fixture = join(FIXTURE_DIR, 'semantics-numeric-clock-cost.json');
    const first = runCli(['--manifest', fixture, '--json']);
    const second = runCli(['--manifest', fixture, '--json']);
    expect(first.code).not.toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stderr).toBe('');
  });

  it('sorts findings by path, then code, on a same-path double finding', () => {
    // `semantics-numeric-clock-cost.json` reports two codes at one path; the
    // order is the sorter's, not the rule execution order.
    const { report } = runCliJson([
      '--manifest',
      join(FIXTURE_DIR, 'semantics-numeric-clock-cost.json'),
    ]);
    expect(reportFindingKeys(report).map((key) => key.code)).toEqual([
      'clock-cost-mismatch',
      'numeric-invalid',
    ]);
  });
});

describe('determinism under array-order permutation', () => {
  it('keeps the finding set invariant when acts, scenes and beats are reordered', () => {
    const original = validate(multiDefectManifest());
    const permuted = validate(reverseStructuralOrder(multiDefectManifest()));

    // The defect set is non-empty and covers all four expected findings, so the
    // invariance assertion cannot pass vacuously.
    const originalKeys = original.findings.map(structuralKey).sort();
    expect(originalKeys).toEqual([
      'clock-cost-mismatch||acts[].scenes[].beats[].clockCost',
      'numeric-invalid|act-order-invalid|acts[].order',
      'numeric-invalid|clock-cost-invalid|acts[].scenes[].beats[].clockCost',
      'objective-invalid|statement-too-long|acts[].scenes[].objective.statement',
    ]);
    expect(permuted.findings.map(structuralKey).sort()).toEqual(originalKeys);
  });

  it('keeps the rules list and traversal counts invariant under permutation', () => {
    const original = validate(multiDefectManifest());
    const permuted = validate(reverseStructuralOrder(multiDefectManifest()));
    expect([...permuted.rules]).toEqual([...original.rules]);
    expect(permuted.counts).toEqual(original.counts);
    expect(permuted.valid).toBe(original.valid);
  });

  it('keeps a cascade fixture’s finding set invariant under permutation', () => {
    // `identity-duplicate-beat.json` cascades (dangling-chain + duplicate-beat +
    // unassigned-card), so the permutation covers a content-derived finding too.
    const fixture = reverseStructuralOrder(
      readJson(join(FIXTURE_DIR, 'identity-duplicate-beat.json')),
    );
    const baseline = validate(readJson(join(FIXTURE_DIR, 'identity-duplicate-beat.json')));
    expect(baseline.findings.map(structuralKey).sort()).toEqual(
      validate(fixture).findings.map(structuralKey).sort(),
    );
  });
});

// ── The corruption sweep: every rule reachable from the CLI ──

describe('corruption sweep — the whole corpus through the CLI', () => {
  const metadata = expectedCodes();

  it('declares every committed manifest fixture and nothing else', () => {
    const onDisk = readdirSync(FIXTURE_DIR)
      .filter((name) => name.endsWith('.json') && name !== 'expected-codes.json')
      .sort();
    expect(metadata.corpus.map((entry) => entry.file).sort()).toEqual(onDisk);
  });

  it('binds the shipped manifest and content the corpus is authored against', () => {
    expect(resolve(REPO_ROOT, metadata.manifest)).toBe(REFERENCE_PATH);
    expect(resolve(REPO_ROOT, metadata.content)).toBe(CONTENT_PATH);
  });

  it.each(expectedCodes().corpus)(
    '$file reports exactly the expected codes through the CLI',
    (entry) => {
      const { code, report, stderr } = runCliJson([
        '--manifest',
        join(FIXTURE_DIR, entry.file),
        '--content',
        CONTENT_PATH,
      ]);
      expect(stderr).toBe('');
      expect(code).not.toBe(0);
      expect(report.valid).toBe(false);
      expect(report.manifestId).toBe('long-erasure');
      expect(reportFindingKeys(report)).toEqual(entry.findings);
    },
  );
});

describe('corruption sweep — content overrides through the CLI', () => {
  it.each(expectedCodes().contentOverrides)(
    '$id is reachable through --content with exactly one mutated cell set',
    (entry) => {
      const mutated = mutateContent(entry.mutation);
      const parsed = parseCsv(mutated);

      // The mutation is exactly what it says: one appended row, or one cell
      // changed on one row of the shipped file.
      if (entry.mutation.kind === 'append-card') {
        const base = parseCsv(readText(CONTENT_PATH));
        expect(parsed.rows.length).toBe(base.rows.length + 1);
        expect(parsed.rows.slice(0, base.rows.length)).toEqual(base.rows);
      } else {
        const base = parseCsv(readText(CONTENT_PATH));
        const changed = base.rows.filter(
          (row, index) => row.some((cell, column) => cell !== parsed.rows[index]?.[column]),
        );
        expect(changed.map((row) => row[base.header.indexOf('id')])).toEqual([
          entry.mutation.cardId,
        ]);
      }

      const temp = makeTempDir();
      try {
        const contentPath = join(temp.path, `content-${entry.id}.csv`);
        writeFileSync(contentPath, mutated, 'utf-8');
        const { code, report, stderr } = runCliJson([
          '--manifest',
          REFERENCE_PATH,
          '--content',
          contentPath,
        ]);
        expect(stderr).toBe('');
        expect(code).not.toBe(0);
        expect(report.valid).toBe(false);
        expect(report.content).toBe(contentPath);
        expect(reportFindingKeys(report)).toEqual(entry.findings);
      } finally {
        temp.cleanup();
      }
    },
  );
});

describe('corruption sweep — the corpus covers the whole rule table', () => {
  const metadata = expectedCodes();

  it('exercises every §2.4 code from at least one CLI case', () => {
    const covered = new Set<EpisodeManifestIssueCode>();
    for (const entry of metadata.corpus) {
      for (const finding of entry.findings) covered.add(finding.code as EpisodeManifestIssueCode);
    }
    for (const entry of metadata.contentOverrides) {
      for (const finding of entry.findings) covered.add(finding.code as EpisodeManifestIssueCode);
    }
    expect([...covered].sort()).toEqual([...EPISODE_MANIFEST_ISSUE_CODES].sort());
  });

  it('uses only codes the §2.4 table declares', () => {
    const declared = new Set<string>(EPISODE_MANIFEST_ISSUE_CODES);
    const declaredInMetadata = [
      ...metadata.corpus.flatMap((entry) => entry.findings.map((finding) => finding.code)),
      ...metadata.contentOverrides.flatMap((entry) =>
        entry.findings.map((finding) => finding.code),
      ),
    ];
    expect(declaredInMetadata.filter((code) => !declared.has(code))).toEqual([]);
  });
});
