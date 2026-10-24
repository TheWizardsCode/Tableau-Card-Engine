/**
 * Static validation for declarative story-line option metadata.
 *
 * This helper validates the **declarative** parts of an option list — `cost`,
 * `extraEffect`, `conditionalSuccessors` — whether the list was registered
 * programmatically via `registerStorylineOptions`, compiled from a CSV
 * `options` encoding, or assembled by a game. It never throws and never
 * mutates the options it inspects.
 *
 * Content-level tooling (CSV parsing, the manifest/graph exporter, the JSON
 * schema and the static content validator) lives in
 * [`./content/`](./content/index.ts); this module stays focused on the
 * declarative option metadata the runtime consumes.
 *
 * Validation is intentionally authoring-oriented: runtime resolution stays
 * permissive, so an option list that fails validation still resolves exactly
 * as declared. Use the result to reject bad content at load/build time.
 *
 * @module
 */

import type { StorylineOption } from './types';

/** Machine-readable category for a single validation issue. */
export type StorylineValidationCode =
  | 'non-positive-cost'
  | 'negative-extra-effect'
  | 'unknown-condition-field'
  | 'unknown-condition-op'
  | 'non-numeric-value'
  | 'dangling-conditional-successor'
  | 'invalid-successor-id'
  | 'invalid-conditional-successors'
  | 'invalid-condition';

/** A single validation issue: where, what, and why. */
export interface StorylineValidationIssue {
  /** Dotted path to the offending field (e.g. `options[1].cost.coins`). */
  readonly path: string;
  /** Stable machine-readable category. */
  readonly code: StorylineValidationCode;
  /** Human-readable explanation for content authors. */
  readonly message: string;
}

/** Result of {@link validateStorylineOptions}. */
export interface StorylineValidationResult {
  /** True when no issues were found. */
  readonly valid: boolean;
  /** Every issue found, in declaration order (empty when valid). */
  readonly issues: readonly StorylineValidationIssue[];
}

/** Options controlling {@link validateStorylineOptions}. */
export interface ValidateStorylineOptionsOptions {
  /**
   * Ids of every card template that can be a chain successor. When provided,
   * a conditional rule targeting an id outside this set is reported as a
   * dangling successor. When omitted, only the successor id's *shape*
   * (`string` or `null`) is checked.
   */
  readonly knownTemplateIds?: Iterable<string>;
}

const CONDITION_FIELDS: ReadonlySet<string> = new Set(['coins', 'reputation']);
const CONDITION_OPS: ReadonlySet<string> = new Set(['>=', '<=', '>', '<', '==']);
const COST_KEYS = ['coins', 'reputation'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates declarative option metadata (costs, extra effects and
 * conditional successors).
 *
 * Rules:
 *
 * - `cost.coins` / `cost.reputation`, when specified, must be a finite
 *   number **greater than zero** (a zero or negative cost is rejected).
 * - `extraEffect.coins` / `extraEffect.reputation`, when specified, must be a
 *   finite number and **must not be negative** (extra effects are gains).
 * - A condition must use field `coins`/`reputation`, one of the five
 *   supported operators, and a finite numeric value.
 * - A conditional rule's `successorId` must be a string or `null`; when
 *   `knownTemplateIds` is supplied, a string successor id outside that set is
 *   reported as dangling.
 *
 * Every issue is reported (the result is not short-circuited), so content
 * authors see the full problem list at once.
 *
 * @param options Ordered option list to validate.
 * @param config  Optional known-template catalogue for dangling checks.
 * @returns `{ valid, issues }` — never throws.
 */
export function validateStorylineOptions<TState = unknown>(
  options: readonly StorylineOption<TState>[],
  config: ValidateStorylineOptionsOptions = {},
): StorylineValidationResult {
  const issues: StorylineValidationIssue[] = [];
  const knownTemplateIds =
    config.knownTemplateIds === undefined
      ? undefined
      : new Set<string>(config.knownTemplateIds);

  const push = (
    path: string,
    code: StorylineValidationCode,
    message: string,
  ): void => {
    issues.push({ path, code, message });
  };

  options.forEach((option, index) => {
    const base = `options[${index}]`;

    // ── cost ────────────────────────────────────────────────
    const cost: unknown = option.cost;
    if (cost !== undefined) {
      if (!isRecord(cost)) {
        push(`${base}.cost`, 'non-numeric-value', 'cost must be an object with numeric coins/reputation.');
      } else {
        for (const key of COST_KEYS) {
          const value = cost[key];
          if (value === undefined) continue;
          if (!isFiniteNumber(value)) {
            push(
              `${base}.cost.${key}`,
              'non-numeric-value',
              `cost.${key} must be a finite number.`,
            );
          } else if (value <= 0) {
            push(
              `${base}.cost.${key}`,
              'non-positive-cost',
              `cost.${key} must be greater than zero (got ${value}).`,
            );
          }
        }
      }
    }

    // ── extraEffect ─────────────────────────────────────────
    const extraEffect: unknown = option.extraEffect;
    if (extraEffect !== undefined) {
      if (!isRecord(extraEffect)) {
        push(
          `${base}.extraEffect`,
          'non-numeric-value',
          'extraEffect must be an object with numeric coins/reputation.',
        );
      } else {
        for (const key of COST_KEYS) {
          const value = extraEffect[key];
          if (value === undefined) continue;
          if (!isFiniteNumber(value)) {
            push(
              `${base}.extraEffect.${key}`,
              'non-numeric-value',
              `extraEffect.${key} must be a finite number.`,
            );
          } else if (value < 0) {
            push(
              `${base}.extraEffect.${key}`,
              'negative-extra-effect',
              `extraEffect.${key} must not be negative (got ${value}).`,
            );
          }
        }
      }
    }

    // ── conditionalSuccessors ───────────────────────────────
    const rules: unknown = option.conditionalSuccessors;
    if (rules !== undefined) {
      if (!Array.isArray(rules)) {
        push(
          `${base}.conditionalSuccessors`,
          'invalid-conditional-successors',
          'conditionalSuccessors must be an ordered array of rules.',
        );
      } else {
        rules.forEach((rule: unknown, ruleIndex: number) => {
          const rulePath = `${base}.conditionalSuccessors[${ruleIndex}]`;
          if (!isRecord(rule)) {
            push(
              rulePath,
              'invalid-conditional-successors',
              'a conditional successor rule must be an object.',
            );
            return;
          }

          const when: unknown = rule.when;
          if (!isRecord(when)) {
            push(
              `${rulePath}.when`,
              'invalid-condition',
              'a conditional rule requires a when condition object.',
            );
          } else {
            if (!CONDITION_FIELDS.has(String(when.field))) {
              push(
                `${rulePath}.when.field`,
                'unknown-condition-field',
                `unknown condition field ${JSON.stringify(when.field)} (expected "coins" or "reputation").`,
              );
            }
            if (!CONDITION_OPS.has(String(when.op))) {
              push(
                `${rulePath}.when.op`,
                'unknown-condition-op',
                `unknown condition op ${JSON.stringify(when.op)} (expected one of >=, <=, >, <, ==).`,
              );
            }
            if (!isFiniteNumber(when.value)) {
              push(
                `${rulePath}.when.value`,
                'non-numeric-value',
                'a condition value must be a finite number.',
              );
            }
          }

          const successorId: unknown = rule.successorId;
          if (successorId !== null && typeof successorId !== 'string') {
            push(
              `${rulePath}.successorId`,
              'invalid-successor-id',
              'a rule successorId must be a card id string or null.',
            );
          } else if (
            typeof successorId === 'string' &&
            knownTemplateIds !== undefined &&
            !knownTemplateIds.has(successorId)
          ) {
            push(
              `${rulePath}.successorId`,
              'dangling-conditional-successor',
              `conditional successor "${successorId}" is not a known card template.`,
            );
          }
        });
      }
    }
  });

  return { valid: issues.length === 0, issues };
}
