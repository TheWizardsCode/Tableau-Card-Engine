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
 * The game's **declared resource keys** (see
 * [`./resources.ts`](./resources.ts)) are the validation vocabulary: a cost,
 * extra effect or condition naming any other key is reported as
 * `unknown-resource-key` / `unknown-condition-field`. Pass the adapter's
 * declaration (`{ resources: storyline.resources }`) so the validator checks
 * the same set the runtime uses; without it the default `coins` /
 * `reputation` projection is checked.
 *
 * A game may also declare a **never-restored** subset (its irreversible keys).
 * Pass `{ irreversible: ["hull"] }` to reject a positive `#extra` on one of
 * those keys as `irreversible-grant`: the runtime resolution guard would refuse
 * the grant anyway, so content that authors one cannot be played as written.
 *
 * @module
 */

import { normaliseResourceKeys, resolveResourceKeys } from './resources';
import type { StorylineResourceKey } from './resources';
import type { StorylineOption } from './types';

/** Machine-readable category for a single validation issue. */
export type StorylineValidationCode =
  | 'non-positive-cost'
  | 'negative-extra-effect'
  | 'unknown-resource-key'
  | 'unknown-condition-field'
  | 'unknown-condition-op'
  | 'non-numeric-value'
  | 'dangling-conditional-successor'
  | 'invalid-successor-id'
  | 'invalid-conditional-successors'
  | 'invalid-condition'
  | 'says-segment-count'
  | 'irreversible-grant';

/** A single validation issue: where, what, and why. */
export interface StorylineValidationIssue {
  /** Dotted path to the offending field (e.g. `options[1].cost.coins`). */
  readonly path: string;
  /** Stable machine-readable category. */
  readonly code: StorylineValidationCode;
  /** Human-readable explanation for content authors. */
  readonly message: string;
  /**
   * The card the issue belongs to, present when the caller supplied
   * {@link ValidateStorylineOptionsOptions.cardId}. Content tooling reports
   * it so an author can find the offending row without guessing.
   */
  readonly cardId?: string;
  /**
   * The resource key the issue concerns, present whenever the fault is
   * scoped to one key (`unknown-resource-key`, `unknown-condition-field`,
   * `non-positive-cost`, `negative-extra-effect`, and a non-numeric
   * `cost.<key>` / `extraEffect.<key>`).
   */
  readonly resource?: StorylineResourceKey;
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
  /**
   * The game's declared resource keys. Defaults to the `coins` /
   * `reputation` projection (`DEFAULT_RESOURCE_KEYS`). Any cost, extra effect
   * or condition key outside this set is reported.
   */
  readonly resources?: Iterable<StorylineResourceKey>;
  /**
   * The card id these options belong to. Reported on every issue so a content
   * author gets the card id alongside the field path, resource key and
   * reason.
   */
  readonly cardId?: string;
  /**
   * The game's declared **never-restored** resource keys (its irreversible
   * set, e.g. `['hull']`). When supplied, a positive `extraEffect.<key>` on any
   * of those keys is reported as `irreversible-grant`: `#extra` is a gain by
   * definition, and the runtime resolution guard refuses a grant on an
   * irreversible key, so the content could never play as authored.
   *
   * Independent of {@link ValidateStorylineOptionsOptions.resources}: the key
   * must still be declared for the rule to apply. Omitting this option (the
   * default) checks nothing extra, keeping output byte-identical to the
   * pre-irreversible contract.
   */
  readonly irreversible?: Iterable<StorylineResourceKey>;
}

const CONDITION_OPS: ReadonlySet<string> = new Set(['>=', '<=', '>', '<', '==']);

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
 * - Every `cost`, `extraEffect` and condition field key must be a **declared
 *   resource** ({@link ValidateStorylineOptionsOptions.resources}, defaulting
 *   to `coins` / `reputation`). An unknown key is reported as
 *   `unknown-resource-key` (cost / extra effect) or `unknown-condition-field`
 *   (condition), naming the key in the message and — with a `cardId` — the
 *   offending card.
 * - `cost.<key>`, when specified, must be a finite number **greater than
 *   zero** (a zero or negative cost is rejected).
 * - `extraEffect.<key>`, when specified, must be a finite number and **must
 *   not be negative** (extra effects are gains) — checked per declared key.
 * - When `irreversible` is supplied, a **positive** `extraEffect.<key>` on one
 *   of those keys is reported as `irreversible-grant`. A zero (or absent)
 *   value is not a grant, so it is not reported by this rule; a negative value
 *   is already reported as `negative-extra-effect`.
 * - A condition must use a declared field, one of the five supported
 *   operators, and a finite numeric value.
 * - A conditional rule's `successorId` must be a string or `null`; when
 *   `knownTemplateIds` is supplied, a string successor id outside that set is
 *   reported as dangling.
 * - `says`, when present, must be a **single** prose segment: a decoded value
 *   containing a `;` is an author-written parallel list and is reported as
 *   `says-segment-count` (a `;` delimits options). An unescaped `;` or `#`
 *   inside the cell never reaches here — the parser rejects it
 *   (`unescaped-says-delimiter`).
 *
 * Every issue is reported (the result is not short-circuited), so content
 * authors see the full problem list at once.
 *
 * @param options Ordered option list to validate.
 * @param config  Optional declared resources, card id and known-template
 *                catalogue.
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
  const declaredResources = resolveResourceKeys(config.resources);
  const declaredSet = new Set<StorylineResourceKey>(declaredResources);
  const declaredList = declaredResources.join(', ');
  const irreversibleSet =
    config.irreversible === undefined
      ? undefined
      : new Set<StorylineResourceKey>(normaliseResourceKeys(config.irreversible));
  const cardId = config.cardId;

  const push = (
    path: string,
    code: StorylineValidationCode,
    message: string,
    resource?: StorylineResourceKey,
  ): void => {
    issues.push({
      path,
      code,
      message,
      ...(cardId === undefined ? {} : { cardId }),
      ...(resource === undefined ? {} : { resource }),
    });
  };

  options.forEach((option, index) => {
    const base = `options[${index}]`;

    // ── cost ────────────────────────────────────────────────
    const cost: unknown = option.cost;
    if (cost !== undefined) {
      if (!isRecord(cost)) {
        push(
          `${base}.cost`,
          'non-numeric-value',
          `cost must be an object with numeric resource keys (declared: ${declaredList}).`,
        );
      } else {
        for (const [key, value] of Object.entries(cost)) {
          if (value === undefined) continue;
          if (!declaredSet.has(key)) {
            push(
              `${base}.cost.${key}`,
              'unknown-resource-key',
              `cost.${key} is not a declared resource (declared: ${declaredList}).`,
              key,
            );
            continue;
          }
          if (!isFiniteNumber(value)) {
            push(
              `${base}.cost.${key}`,
              'non-numeric-value',
              `cost.${key} must be a finite number.`,
              key,
            );
          } else if (value <= 0) {
            push(
              `${base}.cost.${key}`,
              'non-positive-cost',
              `cost.${key} must be greater than zero (got ${value}).`,
              key,
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
          `extraEffect must be an object with numeric resource keys (declared: ${declaredList}).`,
        );
      } else {
        for (const [key, value] of Object.entries(extraEffect)) {
          if (value === undefined) continue;
          if (!declaredSet.has(key)) {
            push(
              `${base}.extraEffect.${key}`,
              'unknown-resource-key',
              `extraEffect.${key} is not a declared resource (declared: ${declaredList}).`,
              key,
            );
            continue;
          }
          if (!isFiniteNumber(value)) {
            push(
              `${base}.extraEffect.${key}`,
              'non-numeric-value',
              `extraEffect.${key} must be a finite number.`,
              key,
            );
          } else if (value < 0) {
            push(
              `${base}.extraEffect.${key}`,
              'negative-extra-effect',
              `extraEffect.${key} must not be negative (got ${value}).`,
              key,
            );
          } else if (value > 0 && irreversibleSet?.has(key) === true) {
            push(
              `${base}.extraEffect.${key}`,
              'irreversible-grant',
              `extraEffect.${key} grants ${value} to "${key}", which is declared irreversible: ` +
                'it may be spent but never restored, so a grant on it would be refused at runtime.',
              key,
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
            if (!declaredSet.has(String(when.field))) {
              push(
                `${rulePath}.when.field`,
                'unknown-condition-field',
                `unknown condition field ${JSON.stringify(when.field)} (declared resources: ${declaredList}).`,
                typeof when.field === 'string' ? when.field : undefined,
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

    // ── says (option-outcome prose) ─────────────────────────
    // A prose segment is delimited by `;`, so an authored says value must be
    // exactly one segment. `#says=One\; two` parses (and round-trips) but
    // reads as a parallel list, which is rejected here.
    const says: unknown = option.says;
    if (says !== undefined && says !== null) {
      if (typeof says !== 'string') {
        push(
          `${base}.says`,
          'says-segment-count',
          'says must be a single prose segment string.',
        );
      } else {
        const segments = says.split(';').length;
        if (segments > 1) {
          push(
            `${base}.says`,
            'says-segment-count',
            `says must be a single prose segment (expected 1, actual ${segments}); ` +
              'a ";" delimits options, so write an escaped "\\;" only for a literal character.',
          );
        }
      }
    }
  });

  return { valid: issues.length === 0, issues };
}
