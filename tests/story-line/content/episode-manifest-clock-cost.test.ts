/**
 * Episode manifest legacy clock-cost migration rule — **retired** (G10,
 * `CG-0MWR0BJXI007UINE`; rule delivered by `CG-0MWSJYS20005CBQ5`).
 *
 * The rule compared a beat's authoritative `clockCost` in the episode manifest
 * with the legacy per-card `clockCost` CSV cell while both existed. G10 retired
 * that column: `LONG_ERASURE_CONTENT_ADAPTER` no longer declares it, pacing is
 * manifest-only, and `beat.clockCost` is the single authoritative cost.
 *
 * The rule is deliberately **kept** as a documented, permanently-green no-op
 * rather than deleted: its code stays part of the §2.4 union and the predicate
 * is the retirement's audit trail (a reintroduced column reactivates the same
 * one-tick-agreement check with no new machinery). This suite is the "no
 * column, no rule" half of that contract — the half the original migration
 * item promised would stay green. It is **not** extended into a general
 * legacy-column mechanism.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LONG_ERASURE_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import {
  EPISODE_MANIFEST_ISSUE_CODES,
  episodeManifestValidationToJson,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import {
  LEGACY_CLOCK_COST_COLUMN,
  type ContentAdapter,
  type ContentCard,
} from '../../../src/story-line/content/types';
import { REPO_ROOT } from './test-support';

/** The committed Appendix A manifest. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The shipped story-line content (no legacy columns). */
const CONTENT_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure.csv');

/** The migrated former drift fixture (also no legacy columns). */
const MIGRATED_FIXTURE_PATH = resolve(REPO_ROOT, 'tests/fixtures/story-line/clock-cost-drift.csv');

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** Parses a CSV file into content cards through the Long Erasure adapter. */
function cardsFrom(path: string, adapter: ContentAdapter = LONG_ERASURE_CONTENT_ADAPTER) {
  return cardsFromCsv(parseCsv(readFileSync(path, 'utf-8')), adapter);
}

/** The reference manifest's declared resource keys. */
function declaredResourcesOf(manifest: Record<string, unknown>): readonly string[] {
  const resources = manifest.resources as { declared?: unknown } | undefined;
  return Array.isArray(resources?.declared) ? (resources?.declared as string[]) : [];
}

/** Validates the reference manifest against the given content and adapter. */
function validate(
  cards: readonly ContentCard[],
  adapter: ContentAdapter = LONG_ERASURE_CONTENT_ADAPTER,
  manifest: Record<string, unknown> = readJson(REFERENCE_PATH),
): EpisodeManifestValidationResult {
  return validateEpisodeManifest(manifest, cards, declaredResourcesOf(manifest), adapter);
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(result: EpisodeManifestValidationResult): string[] {
  return result.findings.map((finding) => `${finding.code}@${finding.path}`);
}

describe('retirement — the adapter no longer declares the legacy column', () => {
  it('leaves the code declared in the §2.4 union as the documented no-op', () => {
    // The rule's vocabulary survives; only its activation data is gone.
    expect([...EPISODE_MANIFEST_ISSUE_CODES]).toContain('clock-cost-mismatch');
    expect(LONG_ERASURE_CONTENT_ADAPTER.columns).not.toContain(LEGACY_CLOCK_COST_COLUMN);
    expect(LONG_ERASURE_CONTENT_ADAPTER.columns).not.toContain('act');
  });

  it('reports no findings and does not list the rule as run', () => {
    const result = validate(cardsFrom(CONTENT_PATH));
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.rules).not.toContain('clock-cost-mismatch');
  });

  it('stays a no-op even when a raw row synthetically carries a disagreeing cell', () => {
    // The adapter's declaration is the activation data. A row that still
    // carried `clockCost` (an old file, a hand-edited cell) has nothing to
    // compare against, so the retired rule is silent by construction.
    const withLegacyCells = cardsFrom(CONTENT_PATH).map((card) => ({
      ...card,
      fields: { ...card.fields, [LEGACY_CLOCK_COST_COLUMN]: '99' },
    }));
    const result = validate(withLegacyCells);
    expect(pairs(result)).toEqual([]);
    expect(result.rules).not.toContain('clock-cost-mismatch');
  });

  it('stays a no-op for a content file that never declared the column', () => {
    const result = validate(cardsFrom(MIGRATED_FIXTURE_PATH));
    expect(pairs(result)).toEqual([]);
    expect(result.rules).not.toContain('clock-cost-mismatch');
    const header = parseCsv(readFileSync(MIGRATED_FIXTURE_PATH, 'utf-8')).header;
    expect(header).not.toContain(LEGACY_CLOCK_COST_COLUMN);
    expect(header).not.toContain('act');
  });

  it('does not run the rule when no content is bound', () => {
    const result = validateEpisodeManifest(readJson(REFERENCE_PATH));
    expect(result.rules).not.toContain('clock-cost-mismatch');
  });
});

describe('the reports', () => {
  it('agree on a clean result and never mention the retired rule', () => {
    const result = validate(cardsFrom(CONTENT_PATH));
    const text = formatEpisodeManifestReport(result);
    expect(text).toContain('RESULT: VALID');
    expect(text).not.toContain('clock-cost-mismatch');
    const parsed = JSON.parse(episodeManifestValidationToJson(result)) as {
      findings: unknown[];
      rules: string[];
    };
    expect(parsed.findings).toEqual([]);
    expect(parsed.rules).not.toContain('clock-cost-mismatch');
  });
});
