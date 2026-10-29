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
 * | `orphan-link` | A card declares accept/reject links but is not a choice card. |
 * | `invalid-option` | Malformed `options` encoding, or an empty/duplicate option label. |
 * | `unknown-successor` | An `options` candidate names a card id that does not exist. |
 * | `dangling-link` | A legacy accept/reject link names a card id that does not exist. |
 * | `unreachable-card` | A story-line member is unreachable from its story-line's entry card. |
 * | `cycle-error` | A cycle treated as invalid — **opt-in** via `failOnCycle`. |
 *
 * Informational findings (never fail validation by default):
 *
 * | Kind | Meaning |
 * |---|---|
 * | `cycle` | A cycle in the choice graph (a first-class, intentional shape). |
 * | `self-link` | A card whose successor is itself (still a cycle). |
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
import type { StorylineOption } from '../types';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';

// ── Result types ────────────────────────────────────────────

/** Machine-readable category of a hard validation issue. */
export type ContentIssueCode =
  | 'duplicate-id'
  | 'missing-required-field'
  | 'missing-storyline-id'
  | 'orphan-link'
  | 'invalid-option'
  | 'unknown-successor'
  | 'dangling-link'
  | 'unreachable-card'
  | 'cycle-error';

/** A single hard validation issue. */
export interface ContentIssue {
  /** Stable machine-readable category. */
  readonly code: ContentIssueCode;
  /** The (base) card id the issue was found on. */
  readonly cardId: string;
  /** The offending successor/link target, when applicable. */
  readonly target?: string;
  /** Human-readable explanation naming the offending card/link. */
  readonly message: string;
}

/** Machine-readable category of an informational finding. */
export type ContentFindingKind = 'cycle' | 'self-link';

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
  for (const card of cards) {
    const id = base(card.id);
    if (card.id.trim() === '') {
      issues.push({
        code: 'missing-required-field',
        cardId: id,
        message: 'A card row has an empty id.',
      });
    }
    if (card.name.trim() === '') {
      issues.push({
        code: 'missing-required-field',
        cardId: id,
        message: `Card "${id}" has an empty name.`,
      });
    }
  }

  const knownIds = new Set(cards.map((card) => base(card.id)));

  // ── Per-card option/link validation ──
  const optionsByCard = new Map<ContentCard, StorylineOption<unknown>[]>();
  const choiceCards: ContentCard[] = [];
  const storylineIds = new Set<string>();

  for (const card of cards) {
    const id = base(card.id);
    if (card.storylineId) storylineIds.add(card.storylineId);

    let options: StorylineOption<unknown>[] = [];
    try {
      options = compileContentOptions(card);
    } catch (err) {
      issues.push({
        code: 'invalid-option',
        cardId: id,
        message: `Choice card "${id}" has a malformed options column: ${(err as Error).message}`,
      });
      continue;
    }
    optionsByCard.set(card, options);

    const isChoice = contentCardHasChoice(card);
    if (isChoice) {
      choiceCards.push(card);
      if (!card.storylineId) {
        issues.push({
          code: 'missing-storyline-id',
          cardId: id,
          message: `Choice card "${id}" declares no storyline id.`,
        });
      }
    } else if (card.acceptNextCardId || card.rejectNextCardId) {
      // Legacy links on a non-choice card are inert at runtime AND invisible
      // to option compilation, so they are reported explicitly instead.
      issues.push({
        code: 'orphan-link',
        cardId: id,
        message: `Card "${id}" declares accept/reject links but is not marked as a choice card (no hasChoices flag and no options).`,
      });
      for (const [field, target] of [
        ['acceptNextCardId', card.acceptNextCardId],
        ['rejectNextCardId', card.rejectNextCardId],
      ] as const) {
        if (!target) continue;
        const targetBase = base(target);
        if (!knownIds.has(targetBase)) {
          issues.push({
            code: 'dangling-link',
            cardId: id,
            target: targetBase,
            message: `Card "${id}" ${field} links to unknown card "${targetBase}".`,
          });
        }
      }
    }

    if (!isChoice) continue;

    // Duplicate labels make the label unusable as a stable choice token.
    const seenLabels = new Set<string>();
    for (const option of options) {
      const label = option.label.trim();
      const labelKey = label.toLowerCase();
      if (label === '') {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          message: `Choice card "${id}" has an option with an empty label.`,
        });
      } else if (seenLabels.has(labelKey)) {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          message: `Choice card "${id}" declares the option label "${option.label}" more than once.`,
        });
      }
      seenLabels.add(labelKey);

      if (option.effectPolicy !== 'apply' && option.effectPolicy !== 'skip') {
        issues.push({
          code: 'invalid-option',
          cardId: id,
          message: `Choice card "${id}" option "${option.label}" has invalid effect policy "${String(option.effectPolicy)}".`,
        });
      }

      for (const target of optionSuccessorIds(option, adapter)) {
        if (!knownIds.has(target)) {
          issues.push({
            code: 'unknown-successor',
            cardId: id,
            target,
            message: `Choice card "${id}" option "${option.label}" links to unknown card "${target}".`,
          });
        }
      }
    }
  }

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
      lines.push(`  ✗ [${issue.code}] ${issue.message}`);
    }
  } else {
    lines.push('ERRORS (0): none');
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
    },
    null,
    2,
  );
}

/**
 * Validates raw content CSV text through an adapter.
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
  return validateContentCards(cardsFromCsv(parseCsv(csvText), adapter), adapter, opts);
}
