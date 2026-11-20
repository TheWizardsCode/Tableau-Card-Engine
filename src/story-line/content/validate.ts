/**
 * Static validation of story-line *content*.
 *
 * Validates a game's content cards (parsed through its {@link ContentAdapter})
 * without starting a game or booting Phaser, so an authoring tool can reject a
 * broken edit before it is written. Validation is a **pure function** over the
 * card list; it never mutates the cards and never throws.
 *
 * Hard errors (`valid: false`, the authoring layer refuses to write):
 *
 * | Code | Meaning |
 * |---|---|
 * | `duplicate-id` | Two cards share the same (base) id. |
 * | `missing-required-field` | The id, name or a required adapter column is empty. |
 * | `missing-storyline-id` | A choice card declares no storyline id. |
 * | `invalid-option` | Malformed `options` encoding, or an empty/duplicate option label. |
 * | `unknown-resource-key` | A `#cost` / `#extra` / `#when` attribute names a key outside the card's declared resources. |
 * | `unknown-successor` | An `options` candidate (or conditional successor) names a card id that does not exist. |
 * | `unreachable-card` | A story-line member is unreachable from its story-line's entry card. |
 * | `cycle-error` | A cycle treated as invalid — **opt-in** via `failOnCycle`. |
 * | `missing-column` | The adapter maps a prose column the file's header does not contain. |
 *
 * Informational findings (never fail validation by default):
 *
 * | Kind | Meaning |
 * |---|---|
 * | `cycle` | A cycle in the choice graph (a first-class, intentional shape). |
 * | `self-link` | A card whose successor is itself (still a cycle). |
 *
 * Non-fatal **warnings** (reported, never invalidating):
 *
 * | Code | Meaning |
 * |---|---|
 * | `prose-budget` | Authored `context` / `epilogue` prose exceeds its adopted budget. |
 *
 * @module
 */

import {
  cardsFromCsv,
  compileContentOptions,
  contentCardHasChoice,
  optionSuccessorIds,
  parseCsv,
} from './csv';
import { StorylineOptionsEncodingError } from '../compile';
import { DEFAULT_RESOURCE_KEYS } from '../resources';
import { PROSE_FIELD_SPECS } from './prose';
import type { StorylineOption } from '../types';
import { validateStorylineOptions } from '../validate';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';

// ── Result types ────────────────────────────────────────────

/** Machine-readable category of a hard validation issue. */
export type ContentIssueCode =
  | 'duplicate-id'
  | 'missing-required-field'
  | 'missing-storyline-id'
  | 'invalid-option'
  | 'unknown-resource-key'
  | 'unknown-successor'
  | 'unreachable-card'
  | 'cycle-error'
  | 'missing-column';

/** A single hard validation issue. */
export interface ContentIssue {
  /** Stable machine-readable category. */
  readonly code: ContentIssueCode;
  /** The (base) card id the issue was found on. */
  readonly cardId: string;
  /** The offending successor/link target, when applicable. */
  readonly target?: string;
  /**
   * 1-based content record number (the header is row 1, the first data record
   * row 2). Embedded newlines inside a quoted cell do not add rows — this is
   * the logical CSV record, so it matches the row an editor shows.
   */
  readonly row?: number;
  /**
   * The offending CSV **column name** (e.g. `options` for an option attribute
   * fault, `resources` for a declaration fault).
   */
  readonly column?: string;
  /**
   * Stable reason code (`unknown-attribute`, `malformed-cost-pair`,
   * `unknown-resource-key`, `unparseable-condition`, …) so a tool can match
   * the fault without parsing the message.
   */
  readonly reason?: string;
  /**
   * Dotted path to the offending value within the compiled option model
   * (e.g. `options[1].cost.coins`), when the fault is scoped to one field.
   */
  readonly path?: string;
  /** The resource key the fault concerns, when applicable. */
  readonly resource?: string;
  /** Human-readable explanation naming the offending card/link. */
  readonly message: string;
}

/** Machine-readable category of an informational finding. */
export type ContentFindingKind = 'cycle' | 'self-link';

/** Machine-readable category of a non-fatal warning. */
export type ContentWarningCode = 'prose-budget';

/**
 * A single **non-fatal** warning: something the author should look at that
 * does not make the content invalid.
 */
export interface ContentWarning {
  /** Stable machine-readable category. */
  readonly code: ContentWarningCode;
  /** The (base) card id the warning was found on. */
  readonly cardId: string;
  /** 1-based logical CSV record number (see {@link ContentIssue.row}). */
  readonly row?: number;
  /** The offending CSV column name (e.g. `context`). */
  readonly column?: string;
  /** Stable reason code (`prose-over-budget`) for tooling. */
  readonly reason?: string;
  /** Human-readable explanation quoting the length and the budget. */
  readonly message: string;
}

/** A single informational finding (cycles etc.). */
export interface ContentFinding {
  /** Stable machine-readable category. */
  readonly kind: ContentFindingKind;
  /** The cycle path of base card ids, in traversal order. */
  readonly path: readonly string[];
  /** Human-readable explanation. */
  readonly message: string;
}

/** Options controlling {@link validateContentCards}. */
export interface ContentValidationOptions {
  /** When true, cycles become hard `cycle-error` issues instead of findings. */
  readonly failOnCycle?: boolean;
}

/** The result of validating a content card list. */
export interface ContentValidationResult {
  /** The adapter's game id (provenance for reports). */
  readonly gameId: string;
  /** Number of cards inspected. */
  readonly cardCount: number;
  /** Number of cards that present a choice. */
  readonly choiceCardCount: number;
  /** Story-line ids observed, sorted. */
  readonly storylineIds: readonly string[];
  /** Hard errors — any entry means the content is invalid. */
  readonly issues: readonly ContentIssue[];
  /** Informational findings (cycles) — never fail validation by default. */
  readonly findings: readonly ContentFinding[];
  /** Non-fatal warnings (prose budgets, …) — never affect {@link valid}. */
  readonly warnings: readonly ContentWarning[];
  /** True when there are no hard errors. */
  readonly valid: boolean;
}

// ── Pure validation ─────────────────────────────────────────

/**
 * Validates a list of content cards.
 *
 * Deterministic: issues and findings are reported in card declaration order
 * (and cycle findings in adjacency traversal order), so two runs over the same
 * content produce identical results.
 *
 * @param cards   Content cards (from `cardsFromCsv` or a fixture).
 * @param adapter The game content adapter (base-id rule and provenance).
 * @param opts    Validation options (cycle policy).
 * @returns The validation result — never throws.
 */
export function validateContentCards(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
  opts: ContentValidationOptions = {},
): ContentValidationResult {
  const issues: ContentIssue[] = [];
  const findings: ContentFinding[] = [];
  const warnings: ContentWarning[] = [];

  const base = (id: string): string => baseIdOf(adapter, id);

  // ── Duplicate ids (before anything else, so later checks read cleanly) ──
  const counts = new Map<string, number>();
  for (const card of cards) {
    const id = base(card.id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of counts) {
    if (count > 1) {
      issues.push({
        code: 'duplicate-id',
        cardId: id,
        message: `Duplicate card id "${id}" appears ${count} times.`,
      });
    }
  }

  // ── Required fields ──
  cards.forEach((card, index) => {
    const id = base(card.id);
    const row = index + 2;
    if (card.id.trim() === '') {
      issues.push({
        code: 'missing-required-field',
        cardId: id,
        row,
        message: 'A card row has an empty id.',
      });
    }
    if (card.name.trim() === '') {
      issues.push({
        code: 'missing-required-field',
        cardId: id,
        row,
        message: `Card "${id}" has an empty name.`,
      });
    }
  });

  const knownIds = new Set(cards.map((card) => base(card.id)));

  // ── Authored prose budgets (non-fatal, so never an `issue`) ──
  cards.forEach((card, index) => {
    for (const spec of PROSE_FIELD_SPECS) {
      const column = adapter.fields[spec.field];
      if (column === undefined) continue;
      const value = card[spec.field] ?? null;
      if (value === null || value.length <= spec.budget) continue;
      const id = base(card.id);
      warnings.push({
        code: 'prose-budget',
        cardId: id,
        row: index + 2,
        column,
        reason: 'prose-over-budget',
        message:
          `Card "${id}" ${column} prose is ${value.length} characters, ` +
          `over the ${spec.budget}-character budget.`,
      });
    }
  });

  // ── Per-card option validation ──
  const optionsByCard = new Map<ContentCard, StorylineOption<unknown>[]>();
  const choiceCards: ContentCard[] = [];
  const storylineIds = new Set<string>();
  const optionsColumn = adapter.fields.options;

  cards.forEach((card, index) => {
    const id = base(card.id);
    const row = index + 2;
    if (card.storylineId) storylineIds.add(card.storylineId);

    let options: StorylineOption<unknown>[] = [];
    try {
      options = compileContentOptions(card);
    } catch (err) {
      const isEncodingError = err instanceof StorylineOptionsEncodingError;
      issues.push({
        code: 'invalid-option',
        cardId: id,
        row,
        ...(optionsColumn !== undefined ? { column: optionsColumn } : {}),
        ...(isEncodingError
          ? {
              reason: err.reason,
              ...(err.attribute !== undefined ? { path: `#${err.attribute}` } : {}),
            }
          : { reason: 'malformed-options' }),
        message: `Choice card "${id}" has a malformed options column: ${(err as Error).message}`,
      });
      return;
    }
    optionsByCard.set(card, options);

    const isChoice = contentCardHasChoice(card);
    if (isChoice) {
      choiceCards.push(card);
      if (!card.storylineId) {
        issues.push({
          code: 'missing-storyline-id',
          cardId: id,
          row,
          ...(optionsColumn !== undefined ? { column: optionsColumn } : {}),
          message: `Choice card "${id}" declares no storyline id.`,
        });
      }
    }

    if (!isChoice) return;

    const optionContext = {
      row,
      ...(optionsColumn !== undefined ? { column: optionsColumn } : {}),
    };

    // Duplicate labels make the label unusable as a stable choice token.
    const seenLabels = new Set<string>();
    options.forEach((option, optionIndex) => {
      const label = option.label.trim();
      const labelKey = label.toLowerCase();
      if (label === '') {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          ...optionContext,
          path: `options[${optionIndex}].label`,
          message: `Choice card "${id}" has an option with an empty label.`,
        });
      } else if (seenLabels.has(labelKey)) {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          ...optionContext,
          path: `options[${optionIndex}].label`,
          message: `Choice card "${id}" declares the option label "${option.label}" more than once.`,
        });
      }
      seenLabels.add(labelKey);

      if (option.effectPolicy !== 'apply' && option.effectPolicy !== 'skip') {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          ...optionContext,
          path: `options[${optionIndex}].effectPolicy`,
          message: `Choice card "${id}" option "${option.label}" has invalid effect policy "${String(option.effectPolicy)}".`,
        });
      }

      for (const target of optionSuccessorIds(option, adapter)) {
        if (!knownIds.has(target)) {
          issues.push({
            code: 'unknown-successor',
            cardId: id,
            target,
            ...optionContext,
            path: `options[${optionIndex}].successorIds`,
            message: `Choice card "${id}" option "${option.label}" links to unknown card "${target}".`,
          });
        }
      }

      // Conditional successors are authored in the same cell, so an unknown
      // target is reported like any other dangling link.
      (option.conditionalSuccessors ?? []).forEach((rule, ruleIndex) => {
        if (rule.successorId === null) return;
        const target = base(rule.successorId);
        if (knownIds.has(target)) return;
        issues.push({
          code: 'unknown-successor',
          cardId: id,
          target,
          ...optionContext,
          path: `options[${optionIndex}].conditionalSuccessors[${ruleIndex}].successorId`,
          message: `Choice card "${id}" option "${option.label}" conditional successor links to unknown card "${target}".`,
        });
      });
    });

    // Declarative option metadata (cost / extra effect / condition keys) is
    // validated against the card's declared resource set — the resources
    // column when it declares any, otherwise the engine's default projection.
    const declared =
      card.resourceKeys.length > 0 ? card.resourceKeys : DEFAULT_RESOURCE_KEYS;
    const metadata = validateStorylineOptions(options, {
      resources: declared,
      cardId: id,
    });
    for (const issue of metadata.issues) {
      const isResourceKey =
        issue.code === 'unknown-resource-key' ||
        issue.code === 'unknown-condition-field';
      issues.push({
        code: isResourceKey ? 'unknown-resource-key' : 'invalid-option',
        cardId: id,
        ...optionContext,
        reason: issue.code,
        path: issue.path,
        ...(issue.resource !== undefined ? { resource: issue.resource } : {}),
        message: issue.message,
      });
    }
  });

  // ── Adjacency over the choice graph (base ids, known targets only) ──
  const adjacency = new Map<string, string[]>();
  for (const card of choiceCards) {
    const from = base(card.id);
    const next: string[] = [];
    for (const option of optionsByCard.get(card) ?? []) {
      for (const target of optionSuccessorIds(option, adapter)) {
        if (knownIds.has(target)) next.push(target);
      }
    }
    if (next.length > 0) adjacency.set(from, next);
  }

  // ── Cycle detection (informational unless failOnCycle) ──
  for (const cycle of findCycles(adjacency)) {
    if (cycle.length === 1) {
      findings.push({
        kind: 'self-link',
        path: cycle,
        message: `Card "${cycle[0]}" links to itself (self-cycle).`,
      });
    } else {
      findings.push({
        kind: 'cycle',
        path: cycle,
        message: `Cycle detected: ${cycle.join(' -> ')} -> ${cycle[0]}`,
      });
    }
  }
  if (opts.failOnCycle) {
    for (const finding of findings) {
      issues.push({
        code: 'cycle-error',
        cardId: finding.path[0] ?? '',
        message: finding.message,
      });
    }
  }

  // ── Unreachable story-line members ──
  issues.push(...findUnreachableIssues(cards, adjacency, adapter));

  return {
    gameId: adapter.gameId,
    cardCount: cards.length,
    choiceCardCount: choiceCards.length,
    storylineIds: [...storylineIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    issues,
    findings,
    warnings,
    valid: issues.length === 0,
  };
}

/**
 * Reports story-line members that cannot be reached from their story-line's
 * entry card.
 *
 * Each storyline group's entry card is the first member (in file order) with
 * no incoming edge from another member; a closed cycle has no such member, so
 * its first card becomes the entry. Members outside the entry's reachable set
 * are a disconnected fragment — an authoring error that no runtime path can
 * ever visit.
 *
 * @param cards     All content cards.
 * @param adjacency The choice-graph adjacency (base ids).
 * @param adapter   The game content adapter.
 * @returns One `unreachable-card` issue per unreachable member.
 */
function findUnreachableIssues(
  cards: readonly ContentCard[],
  adjacency: ReadonlyMap<string, readonly string[]>,
  adapter: ContentAdapter,
): ContentIssue[] {
  const base = (id: string): string => baseIdOf(adapter, id);
  const membersByStoryline = new Map<string, string[]>();
  for (const card of cards) {
    if (!card.storylineId) continue;
    const members = membersByStoryline.get(card.storylineId) ?? [];
    const id = base(card.id);
    if (!members.includes(id)) members.push(id);
    membersByStoryline.set(card.storylineId, members);
  }

  const issues: ContentIssue[] = [];
  for (const [storylineId, members] of membersByStoryline) {
    if (members.length <= 1) continue;
    const memberSet = new Set(members);
    const hasIncoming = new Set<string>();
    for (const from of members) {
      for (const to of adjacency.get(from) ?? []) {
        if (memberSet.has(to) && to !== from) hasIncoming.add(to);
      }
    }
    const entry = members.find((id) => !hasIncoming.has(id)) ?? members[0];

    const reached = new Set<string>([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const next of adjacency.get(current) ?? []) {
        if (!memberSet.has(next) || reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }

    for (const id of members) {
      if (reached.has(id)) continue;
      issues.push({
        code: 'unreachable-card',
        cardId: id,
        message: `Card "${id}" in story-line "${storylineId}" is unreachable from the story-line's entry card "${entry}".`,
      });
    }
  }
  return issues;
}

// ── Cycle detection (iterative DFS, reports each elementary cycle once) ──

/**
 * Finds cycles in a directed graph.
 *
 * Returns each distinct cycle as an array of nodes in traversal order (the
 * closing edge is implicit). Rotations of the same cycle are collapsed, so the
 * result is deterministic regardless of adjacency insertion order.
 *
 * @param adjacency Node → successor nodes.
 * @returns Distinct cycles, in discovery order.
 */
export function findCycles(
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const cycles: string[][] = [];
  const seenKeys = new Set<string>();
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const stack: string[] = [];

  const keyOf = (path: readonly string[]): string => {
    // Rotate so the smallest node is first, then join — collapses rotations.
    if (path.length === 0) return '';
    let min = 0;
    for (let i = 1; i < path.length; i++) {
      if ((path[i] as string) < (path[min] as string)) min = i;
    }
    const rotated = [...path.slice(min), ...path.slice(0, min)];
    return rotated.join('|');
  };

  const visit = (node: string): void => {
    colour.set(node, GREY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const c = colour.get(next) ?? WHITE;
      if (c === GREY) {
        const start = stack.indexOf(next);
        const cycle = stack.slice(start);
        const key = keyOf(cycle);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          cycles.push(cycle);
        }
      } else if (c === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(node, BLACK);
  };

  for (const node of adjacency.keys()) {
    if ((colour.get(node) ?? WHITE) === WHITE) visit(node);
  }
  return cycles;
}

// ── Reports ─────────────────────────────────────────────────

/**
 * Renders a human-readable validation report (CLI output).
 *
 * @param result The validation result.
 * @returns A deterministic multi-line report.
 */
export function formatContentValidationReport(
  result: ContentValidationResult,
): string {
  const lines: string[] = [];
  lines.push('Story-line content validation report');
  lines.push('=====================================');
  lines.push(`Game: ${result.gameId}`);
  lines.push(`Cards: ${result.cardCount}`);
  lines.push(`Choice cards: ${result.choiceCardCount}`);
  lines.push(
    `Story-lines: ${result.storylineIds.length > 0 ? result.storylineIds.join(', ') : '(none)'}`,
  );
  lines.push('');
  if (result.issues.length > 0) {
    lines.push(`ERRORS (${result.issues.length}):`);
    for (const issue of result.issues) {
      const location = issue.row === undefined ? '' : ` row ${issue.row}`;
      const column = issue.column === undefined ? '' : `, column "${issue.column}"`;
      const reason = issue.reason === undefined ? '' : ` (${issue.reason})`;
      lines.push(
        `  ✗ [${issue.code}]${location}${column}${reason}: ${issue.message}`,
      );
    }
  } else {
    lines.push('ERRORS (0): none');
  }
  lines.push('');
  lines.push(`Warnings (${result.warnings.length}):`);
  if (result.warnings.length === 0) {
    lines.push('  (none)');
  } else {
    for (const warning of result.warnings) {
      const location = warning.row === undefined ? '' : ` row ${warning.row}`;
      const column = warning.column === undefined ? '' : `, column "${warning.column}"`;
      const reason = warning.reason === undefined ? '' : ` (${warning.reason})`;
      lines.push(`  ! [${warning.code}]${location}${column}${reason}: ${warning.message}`);
    }
  }
  lines.push('');
  lines.push(`Informational findings (${result.findings.length}):`);
  if (result.findings.length === 0) {
    lines.push('  (none)');
  } else {
    for (const finding of result.findings) {
      lines.push(`  ℹ [${finding.kind}] ${finding.message}`);
    }
  }
  lines.push('');
  lines.push(result.valid ? 'RESULT: VALID' : 'RESULT: INVALID');
  return lines.join('\n');
}

/**
 * Renders a stable JSON representation (for tooling/CI consumption).
 *
 * The `issues` and `findings` arrays are the same data the text report
 * renders, so the two reports always agree.
 *
 * @param result The validation result.
 * @returns Pretty-printed JSON.
 */
export function contentValidationToJson(
  result: ContentValidationResult,
): string {
  return JSON.stringify(
    {
      valid: result.valid,
      gameId: result.gameId,
      cardCount: result.cardCount,
      choiceCardCount: result.choiceCardCount,
      storylineIds: result.storylineIds,
      issues: result.issues,
      findings: result.findings,
      warnings: result.warnings,
    },
    null,
    2,
  );
}

/**
 * Reports prose columns the adapter maps but the file's header lacks.
 *
 * A mapped column is a contract: the adapter says "this file has prose here",
 * so an absent header column means the file and its adapter disagree — a hard
 * (fatal) authoring error rather than a silently empty card list.
 *
 * @param header  Parsed CSV header.
 * @param adapter The game content adapter.
 * @returns One `missing-column` issue per mapped-but-absent prose column.
 */
function missingProseColumnIssues(
  header: readonly string[],
  adapter: ContentAdapter,
): ContentIssue[] {
  const present = new Set(header);
  const issues: ContentIssue[] = [];
  for (const spec of PROSE_FIELD_SPECS) {
    const column = adapter.fields[spec.field];
    if (column === undefined || present.has(column)) continue;
    issues.push({
      code: 'missing-column',
      cardId: '',
      column,
      reason: 'missing-mapped-column',
      message:
        `Mapped prose column "${column}" is missing from the content header ` +
        `(columns: ${header.join(', ') || '(none)'}).`,
    });
  }
  return issues;
}

/**
 * Validates raw content CSV text through an adapter.
 *
 * The header is checked first: an adapter that maps a prose column the file
 * does not declare is a fatal `missing-column` issue. Card-level validation
 * (including the non-fatal prose-budget warnings) then runs as usual.
 *
 * @param csvText Raw CSV text.
 * @param adapter The game content adapter.
 * @param opts    Validation options.
 * @returns The validation result.
 */
export function validateContentCsv(
  csvText: string,
  adapter: ContentAdapter,
  opts: ContentValidationOptions = {},
): ContentValidationResult {
  const parsed = parseCsv(csvText);
  const result = validateContentCards(cardsFromCsv(parsed, adapter), adapter, opts);
  const headerIssues = missingProseColumnIssues(parsed.header, adapter);
  if (headerIssues.length === 0) return result;
  const issues = [...headerIssues, ...result.issues];
  return { ...result, issues, valid: issues.length === 0 };
}
