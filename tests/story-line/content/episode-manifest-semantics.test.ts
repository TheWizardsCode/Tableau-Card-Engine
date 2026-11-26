/**
 * Episode manifest semantic and numeric rules (CG-0MWSJYPAX002O63N).
 *
 * Three GDD §2.4 rule codes share this child: the objective is a real statement
 * plus a check over a **declared** resource key (`objective-invalid`), a loss
 * may only spend a key the beat sheet never restores
 * (`loss-not-irreversible`), and every clock number is an integer inside its
 * documented range (`numeric-invalid`). Each rule reads only the manifest and
 * the declared key set it carries, so a designer is refused at review time
 * instead of at play time, with the exact JSON path.
 *
 * The declared-key check is applied twice under `objective-invalid`: the
 * objective's own `check.field` and every `{ field, op, value }` `SceneCondition`
 * in `outcomeRules[].when` / `routes[].when`. The two are told apart by the
 * stable `reason` field (`undeclared-objective-field` vs
 * `undeclared-condition-field`) so tooling never has to parse a message.
 *
 * Each committed fixture under `fixtures/episode-manifest/semantics-*.json` is
 * the Appendix A manifest plus exactly one documented mutation (pinned below),
 * and the clean control is the unmutated Appendix A manifest. The numeric
 * fixtures validate the **direct-call** path on purpose: ajv already refuses
 * `clock: 0`, so a schema-only test would never prove the validator reports it
 * (the risk recorded on the work item).
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONDITION_OPERATORS,
  formatEpisodeManifestReport,
  validateEpisodeManifest,
  type EpisodeManifestRule,
  type EpisodeManifestValidationResult,
} from '../../../src/story-line/content/episode-manifest';
import { REPO_ROOT } from './test-support';

/** The committed semantic/numeric fixtures. */
const FIXTURE_DIR = join(REPO_ROOT, 'tests/story-line/content/fixtures/episode-manifest');

/** The committed Appendix A manifest — the clean control and fixture base. */
const REFERENCE_PATH = resolve(REPO_ROOT, 'example-games/gym/content/long-erasure-episode.json');

/** The rule this child implements, in the validator's declared order. */
const SEMANTIC_RULES: readonly EpisodeManifestRule[] = [
  'objective-invalid',
  'loss-not-irreversible',
  'numeric-invalid',
];

/** The GDD §2.4 objective statement budget, in characters. */
const STATEMENT_MAX = 90;

/** Reads and parses a JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

/** The reference manifest as a mutable deep copy. */
function reference(): Record<string, unknown> {
  return readJson(REFERENCE_PATH);
}

/** Validates a manifest on the pure (manifest-only) path. */
function validate(manifest: unknown): EpisodeManifestValidationResult {
  return validateEpisodeManifest(manifest);
}

/** The `code@path` pair (the validator's identity) for every finding. */
function pairs(result: EpisodeManifestValidationResult): string[] {
  return result.findings.map((finding) => `${finding.code}@${finding.path}`);
}

/** The findings carrying a given `reason`. */
function withReason(result: EpisodeManifestValidationResult, reason: string) {
  return result.findings.filter((finding) => finding.reason === reason);
}

/** Reads a committed semantic fixture. */
function readFixture(name: string): Record<string, unknown> {
  return readJson(join(FIXTURE_DIR, name));
}

/** True for a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The dotted JSON paths at which `actual` differs from `expected`. */
function changedPaths(expected: unknown, actual: unknown, path = ''): string[] {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const left = Array.isArray(expected) ? expected : [];
    const right = Array.isArray(actual) ? actual : [];
    if (left.length !== right.length) return [path];
    return left.flatMap((item, index) => changedPaths(item, right[index], `${path}[${index}]`));
  }
  if (isRecord(expected) || isRecord(actual)) {
    const left = isRecord(expected) ? expected : {};
    const right = isRecord(actual) ? actual : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) =>
      changedPaths(left[key], right[key], path === '' ? key : `${path}.${key}`),
    );
  }
  return Object.is(expected, actual) ? [] : [path];
}

/** The mutable shape the in-memory cases reach into (not a validator input contract). */
interface MutableManifest {
  acts: Array<{
    order: number;
    scenes: Array<{
      objective: {
        statement: string;
        check: { field: string; op: string; value: number };
      };
      budget: { clock: number };
      beats: Array<{ cardId: string; clockCost: number }>;
      outcomeRules: Array<{ id: string; when?: Record<string, unknown>; outcome: string }>;
      routes: Array<{
        id: string;
        on: string;
        when?: Record<string, unknown>;
        to: Record<string, unknown>;
      }>;
      losses?: Array<{ id: string; field: string; amount: number; statement: string }>;
    }>;
  }>;
}

/** Applies one mutation to a fresh deep copy of the reference manifest. */
function mutated(mutate: (manifest: MutableManifest) => void): MutableManifest {
  const manifest = reference() as unknown as MutableManifest;
  mutate(manifest);
  return manifest;
}

/**
 * The committed semantic fixtures, and the one mutation each carries.
 *
 * The mutation list is the manifest field(s) that changed; the code/path/reason
 * triple is what the validator reports. Pinning both keeps a fixture from
 * silently drifting into a second defect (see the drift pin below). The two
 * condition fixtures replace a whole `when` object, which is why their
 * mutation list names the removed member as well as the three added ones.
 */
const SEMANTIC_FIXTURES: ReadonlyArray<{
  readonly file: string;
  readonly mutation: readonly string[];
  readonly code: 'objective-invalid' | 'loss-not-irreversible' | 'numeric-invalid';
  readonly findingPath: string;
  readonly reason: string;
}> = [
  {
    file: 'semantics-objective-overlong.json',
    mutation: ['acts[0].scenes[0].objective.statement'],
    code: 'objective-invalid',
    findingPath: 'acts[0].scenes[0].objective.statement',
    reason: 'statement-too-long',
  },
  {
    file: 'semantics-objective-undeclared-field.json',
    mutation: ['acts[0].scenes[0].objective.check.field'],
    code: 'objective-invalid',
    findingPath: 'acts[0].scenes[0].objective.check.field',
    reason: 'undeclared-objective-field',
  },
  {
    file: 'semantics-objective-unknown-op.json',
    mutation: ['acts[0].scenes[0].objective.check.op'],
    code: 'objective-invalid',
    findingPath: 'acts[0].scenes[0].objective.check.op',
    reason: 'unknown-operator',
  },
  {
    file: 'semantics-condition-outcome-field.json',
    mutation: [
      'acts[0].scenes[0].outcomeRules[0].when.objective',
      'acts[0].scenes[0].outcomeRules[0].when.field',
      'acts[0].scenes[0].outcomeRules[0].when.op',
      'acts[0].scenes[0].outcomeRules[0].when.value',
    ],
    code: 'objective-invalid',
    findingPath: 'acts[0].scenes[0].outcomeRules[0].when.field',
    reason: 'undeclared-condition-field',
  },
  {
    file: 'semantics-condition-route-field.json',
    mutation: [
      'acts[0].scenes[1].routes[0].when.budget',
      'acts[0].scenes[1].routes[0].when.field',
      'acts[0].scenes[1].routes[0].when.op',
      'acts[0].scenes[1].routes[0].when.value',
    ],
    code: 'objective-invalid',
    findingPath: 'acts[0].scenes[1].routes[0].when.field',
    reason: 'undeclared-condition-field',
  },
  {
    file: 'semantics-loss-not-irreversible.json',
    mutation: ['acts[2].scenes[0].losses[0].field'],
    code: 'loss-not-irreversible',
    findingPath: 'acts[2].scenes[0].losses[0].field',
    reason: '',
  },
  {
    file: 'semantics-numeric-clock.json',
    mutation: ['acts[0].scenes[0].budget.clock'],
    code: 'numeric-invalid',
    findingPath: 'acts[0].scenes[0].budget.clock',
    reason: 'budget-clock-invalid',
  },
  {
    file: 'semantics-numeric-clock-cost.json',
    mutation: ['acts[0].scenes[0].beats[0].clockCost'],
    code: 'numeric-invalid',
    findingPath: 'acts[0].scenes[0].beats[0].clockCost',
    reason: 'clock-cost-invalid',
  },
  {
    file: 'semantics-numeric-amount.json',
    mutation: ['acts[2].scenes[0].losses[0].amount'],
    code: 'numeric-invalid',
    findingPath: 'acts[2].scenes[0].losses[0].amount',
    reason: 'loss-amount-invalid',
  },
  {
    file: 'semantics-numeric-act-order.json',
    mutation: ['acts[0].order'],
    code: 'numeric-invalid',
    findingPath: 'acts[0].order',
    reason: 'act-order-invalid',
  },
];

describe('clean control — the Appendix A manifest stays clean for every rule', () => {
  it('reports no findings and runs the three semantic rules', () => {
    const result = validate(reference());
    expect(pairs(result)).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.rules).toEqual(expect.arrayContaining([...SEMANTIC_RULES]));
  });

  it('appends the semantic rules after the identity and totality rules', () => {
    expect(validate(reference()).rules).toEqual([
      'duplicate-act',
      'duplicate-scene',
      'duplicate-beat',
      'unknown-act',
      'unknown-scene',
      'non-total-routes',
      'non-total-outcome-rules',
      ...SEMANTIC_RULES,
    ]);
  });

  it('keeps the text and JSON reports deterministic for a semantic finding', () => {
    const first = validate(readFixture('semantics-numeric-clock.json'));
    const second = validate(readFixture('semantics-numeric-clock.json'));
    expect(formatEpisodeManifestReport(first)).toBe(formatEpisodeManifestReport(second));
  });
});

describe('semantic fixtures — one code and path each', () => {
  it.each(SEMANTIC_FIXTURES)(
    '$file reports exactly $code at $findingPath',
    (fixture) => {
      const result = validate(readFixture(fixture.file));
      expect(result.valid).toBe(false);
      expect(pairs(result)).toEqual([`${fixture.code}@${fixture.findingPath}`]);
      if (fixture.reason === '') {
        expect(result.findings[0].reason).toBeUndefined();
      } else {
        expect(result.findings[0].reason).toBe(fixture.reason);
      }
    },
  );

  it.each(SEMANTIC_FIXTURES)(
    '$file is the Appendix A manifest plus exactly one documented mutation',
    (fixture) => {
      expect(changedPaths(reference(), readFixture(fixture.file))).toEqual([...fixture.mutation]);
    },
  );

  it('renders the stable reason in the text report so a reviewer sees which variant failed', () => {
    const report = formatEpisodeManifestReport(
      validate(readFixture('semantics-objective-overlong.json')),
    );
    expect(report).toContain('✗ [objective-invalid] (statement-too-long)');
  });
});

describe('objective-invalid — the statement budget', () => {
  const statementFixture = (statement: string) =>
    mutated((manifest) => {
      manifest.acts[0].scenes[0].objective.statement = statement;
    });

  it('accepts a statement of exactly 90 characters', () => {
    const result = validate(statementFixture('x'.repeat(STATEMENT_MAX)));
    expect(pairs(result)).toEqual([]);
  });

  it('refuses a statement of 91 characters at the statement path', () => {
    const result = validate(statementFixture('x'.repeat(STATEMENT_MAX + 1)));
    expect(pairs(result)).toEqual(['objective-invalid@acts[0].scenes[0].objective.statement']);
    expect(withReason(result, 'statement-too-long')).toHaveLength(1);
  });

  it('refuses an empty statement with its own reason', () => {
    const result = validate(statementFixture(''));
    expect(pairs(result)).toEqual(['objective-invalid@acts[0].scenes[0].objective.statement']);
    expect(withReason(result, 'statement-empty')).toHaveLength(1);
  });

  it('treats a whitespace-only statement as empty', () => {
    const result = validate(statementFixture('   '));
    expect(withReason(result, 'statement-empty')).toHaveLength(1);
  });
});

describe('objective-invalid — the check field and operator', () => {
  it('accepts every operator of the shared condition vocabulary on a declared key', () => {
    for (const op of CONDITION_OPERATORS) {
      const result = validate(
        mutated((manifest) => {
          manifest.acts[0].scenes[0].objective.check.op = op;
        }),
      );
      expect(pairs(result)).toEqual([]);
    }
  });

  it('shares the five-operator vocabulary with @story-line', () => {
    expect([...CONDITION_OPERATORS]).toEqual(['>=', '<=', '>', '<', '==']);
  });

  it('refuses an operator outside the vocabulary at the operator path', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].objective.check.op = '=>';
      }),
    );
    expect(pairs(result)).toEqual(['objective-invalid@acts[0].scenes[0].objective.check.op']);
    expect(withReason(result, 'unknown-operator')).toHaveLength(1);
  });

  it('refuses a check field the manifest does not declare, naming the key', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].objective.check.field = 'supplies';
      }),
    );
    expect(pairs(result)).toEqual(['objective-invalid@acts[0].scenes[0].objective.check.field']);
    expect(withReason(result, 'undeclared-objective-field')).toHaveLength(1);
    expect(result.findings[0].message).toContain('supplies');
    expect(result.findings[0].message).toContain('resources.declared');
  });
});

describe('objective-invalid — undeclared fields in scene conditions', () => {
  it('checks an outcome rule condition against the declared key set', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].outcomeRules[0].when = {
          field: 'supplies',
          op: '>=',
          value: 1,
        };
      }),
    );
    expect(pairs(result)).toEqual([
      'objective-invalid@acts[0].scenes[0].outcomeRules[0].when.field',
    ]);
    expect(withReason(result, 'undeclared-condition-field')).toHaveLength(1);
    expect(result.findings[0].message).toContain('supplies');
  });

  it('checks a route condition against the declared key set', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[1].routes[0].when = {
          field: 'supplies',
          op: '<',
          value: 2,
        };
      }),
    );
    expect(pairs(result)).toEqual(['objective-invalid@acts[0].scenes[1].routes[0].when.field']);
    expect(withReason(result, 'undeclared-condition-field')).toHaveLength(1);
  });

  it('accepts a condition on a declared key', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].outcomeRules[0].when = { field: 'stores', op: '>=', value: 3 };
      }),
    );
    expect(pairs(result)).toEqual([]);
  });

  it('leaves the objective and budget condition forms alone', () => {
    // The clean control already carries `{ objective: 'met' }` and
    // `{ budget: 'exhausted' }`; neither declares a `field`, so neither is a
    // declared-key defect.
    expect(pairs(validate(reference()))).toEqual([]);
  });
});

describe('loss-not-irreversible — only a never-restored key may be lost', () => {
  it('refuses a loss on a declared but restorable key, naming the rule id and the field', () => {
    const result = validate(readFixture('semantics-loss-not-irreversible.json'));
    expect(pairs(result)).toEqual([
      'loss-not-irreversible@acts[2].scenes[0].losses[0].field',
    ]);
    expect(result.findings[0].message).toContain('hull-sacrificed');
    expect(result.findings[0].message).toContain('morale');
    expect(result.findings[0].message).toContain('resources.irreversible');
  });

  it('reports every offending loss rule, not just the first', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[2].scenes[0].losses?.push({
          id: 'stores-burned',
          field: 'stores',
          amount: 1,
          statement: 'The last of the stores goes with the core.',
        });
      }),
    );
    expect(pairs(result)).toEqual(['loss-not-irreversible@acts[2].scenes[0].losses[1].field']);
    expect(result.findings[0].message).toContain('stores-burned');
  });

  it('accepts a loss on an irreversible key', () => {
    // The Appendix A loss is already on `hull`, which is irreversible.
    expect(pairs(validate(reference()))).toEqual([]);
  });
});

describe('numeric-invalid — the clock numbers are integers inside their ranges', () => {
  it('accepts the boundary values', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].budget.clock = 1;
        manifest.acts[0].scenes[0].beats[0].clockCost = 0;
        const losses = manifest.acts[2].scenes[0].losses;
        if (losses) losses[0].amount = 1;
        manifest.acts[0].order = 1;
      }),
    );
    expect(pairs(result)).toEqual([]);
  });

  it('refuses a non-integer clock and a non-integer clock cost', () => {
    const clock = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].budget.clock = 1.5;
      }),
    );
    expect(pairs(clock)).toEqual(['numeric-invalid@acts[0].scenes[0].budget.clock']);
    expect(withReason(clock, 'budget-clock-invalid')).toHaveLength(1);

    const cost = validate(
      mutated((manifest) => {
        manifest.acts[0].scenes[0].beats[0].clockCost = 0.5;
      }),
    );
    expect(pairs(cost)).toEqual(['numeric-invalid@acts[0].scenes[0].beats[0].clockCost']);
    expect(withReason(cost, 'clock-cost-invalid')).toHaveLength(1);
  });

  it('refuses a non-integer amount and a non-integer act order', () => {
    const amount = validate(
      mutated((manifest) => {
        const losses = manifest.acts[2].scenes[0].losses;
        if (losses) losses[0].amount = 1.5;
      }),
    );
    expect(pairs(amount)).toEqual(['numeric-invalid@acts[2].scenes[0].losses[0].amount']);
    expect(withReason(amount, 'loss-amount-invalid')).toHaveLength(1);

    const order = validate(
      mutated((manifest) => {
        manifest.acts[0].order = 1.5;
      }),
    );
    expect(pairs(order)).toEqual(['numeric-invalid@acts[0].order']);
    expect(withReason(order, 'act-order-invalid')).toHaveLength(1);
  });

  it('leaves act-order uniqueness to duplicate-act', () => {
    const result = validate(
      mutated((manifest) => {
        manifest.acts[1].order = 1;
      }),
    );
    expect(pairs(result)).toEqual(['duplicate-act@acts[1].order']);
  });
});

describe('rule activation — the semantic rules need only the manifest', () => {
  it('runs the three rules on a manifest-only validation', () => {
    const result = validateEpisodeManifest(reference());
    for (const code of SEMANTIC_RULES) expect(result.rules).toContain(code);
  });

  it('reports a semantic finding even when no content or declared set is bound', () => {
    const result = validateEpisodeManifest(readFixture('semantics-numeric-clock-cost.json'));
    expect(pairs(result)).toEqual(['numeric-invalid@acts[0].scenes[0].beats[0].clockCost']);
  });
});

describe('totality — a malformed semantic member never throws', () => {
  it.each([
    { acts: [{ scenes: [{ objective: null, budget: null }] }] },
    { acts: [{ scenes: [{ objective: 'nope', budget: 'nope' }] }] },
    { acts: [{ order: 'one', scenes: [] }] },
    { acts: [{ scenes: [{ objective: { statement: 5, check: { field: 5, op: 5 } } }] }] },
    { acts: [{ scenes: [{ outcomeRules: [{ when: 'x' }], routes: [{ when: [] }] }] }] },
    { acts: [{ scenes: [{ losses: [{ field: 5, amount: 'one' }] }] }] },
  ])('tolerates %o', (manifest) => {
    expect(() => validate(manifest)).not.toThrow();
  });
});
