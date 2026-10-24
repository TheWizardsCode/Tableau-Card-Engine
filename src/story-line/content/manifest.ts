/**
 * Deterministic story-line manifest builder and Mermaid renderer.
 *
 * The manifest is the **view model source** for every authoring surface: a
 * flat, timestamp-free description of the story-line graph (nodes, option
 * edges, story-line ids/titles and cycles) that validates against
 * [`schemas/story-line-manifest.schema.json`](../../../schemas/story-line-manifest.schema.json).
 *
 * Determinism is a hard requirement — the committed artefacts are guarded by a
 * `--check` drift comparison. All output ordering derives from sorted card
 * ids, option declaration order and candidate index; there is no RNG,
 * timestamp or wall-clock input, so regenerating from the same content always
 * produces byte-identical output.
 *
 * Cycles are a first-class shape: they are reported and their edges are marked
 * in both the manifest and the Mermaid render, never treated as an error here
 * (the validator decides whether cycles fail a build).
 *
 * This module is Phaser-free and game-import-free.
 *
 * @module
 */

import {
  cardsFromCsv,
  compileContentOptions,
  optionSuccessorIds,
  parseCsv,
} from './csv';
import { baseIdOf, type ContentAdapter, type ContentCard } from './types';
import { findCycles } from './validate';

/**
 * Canonical repository-relative path of the generic manifest JSON schema.
 *
 * Shared by the authoring toolchain and the editor test harness so a schema
 * move is caught loudly (the derived path stops resolving) instead of silently
 * validating against a stale copy.
 */
export const DEFAULT_MANIFEST_SCHEMA_PATH = 'schemas/story-line-manifest.schema.json' as const;

// ── Manifest types ──────────────────────────────────────────

/** One option of a choice node, as it appears in the manifest. */
export interface ManifestOption {
  /** Player-visible option label. */
  readonly label: string;
  /** Ordered candidate successor base card ids; empty means "chain ends". */
  readonly successorIds: readonly string[];
  /** Whether the card's own effect applies when the option is chosen. */
  readonly effectPolicy: 'apply' | 'skip';
}

/** One card node in the manifest. */
export interface ManifestNode {
  /** Base card id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Story-line id, or null when the card belongs to no story-line. */
  readonly storylineId: string | null;
  /** Story-line title, or null. */
  readonly storylineTitle: string | null;
  /** True when the card presents a choice. */
  readonly hasChoices: boolean;
  /** Number of options (0 for plain incidents). */
  readonly optionCount: number;
  /** Ordered option list (empty for plain incidents). */
  readonly options: readonly ManifestOption[];
  /** Human-readable effect text. */
  readonly effect: string;
  /** Adapter-provided game impact description (`''` when the adapter has none). */
  readonly impact: string;
  /** Every game-specific column for this card, keyed by CSV column name. */
  readonly fields: Readonly<Record<string, string>>;
}

/** One graph edge: an option (and candidate index) leaving a card. */
export interface ManifestEdge {
  /** Source base card id. */
  readonly from: string;
  /** Option label. */
  readonly label: string;
  /** Target base card id, or null when the chain ends. */
  readonly to: string | null;
  /** True when this edge is one of several random-branch candidates. */
  readonly random: boolean;
  /** 0-based index of this candidate within the option's candidate set. */
  readonly candidateIndex: number;
  /** True when this edge participates in a cycle. */
  readonly cycle: boolean;
  /** Whether the source card's own effect applies when this option is chosen. */
  readonly effectPolicy: 'apply' | 'skip';
}

/** The complete deterministic story-line manifest. */
export interface StorylineManifest {
  /** Manifest schema version. */
  readonly version: number;
  /** Generator provenance (deterministic — no timestamp). */
  readonly source: string;
  /** The adapter's game id. */
  readonly gameId: string;
  /** Sorted story-line ids present. */
  readonly storylineIds: readonly string[];
  /** Sorted graph nodes. */
  readonly nodes: readonly ManifestNode[];
  /** Sorted graph edges. */
  readonly edges: readonly ManifestEdge[];
  /** Detected cycles (first-class); each entry is a path of base ids. */
  readonly cycles: readonly (readonly string[])[];
}

/** Options controlling {@link buildStorylineManifest}. */
export interface ManifestBuildOptions {
  /** Overrides the deterministic `source` provenance string. */
  readonly source?: string;
}

// ── Build ───────────────────────────────────────────────────

/** Compares two strings for deterministic (codepoint) ordering. */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Removes duplicate base ids, keeping the first (file-order) occurrence. */
function dedupeByBaseId(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
): Map<string, ContentCard> {
  const byBase = new Map<string, ContentCard>();
  for (const card of cards) {
    const base = baseIdOf(adapter, card.id);
    if (!byBase.has(base)) byBase.set(base, card);
  }
  return byBase;
}

/**
 * Builds the story-line manifest from content cards.
 *
 * @param cards   Content cards (from `cardsFromCsv` or a fixture).
 * @param adapter The game content adapter.
 * @param options Build options (source provenance override).
 * @returns A deterministic manifest.
 */
export function buildStorylineManifest(
  cards: readonly ContentCard[],
  adapter: ContentAdapter,
  options: ManifestBuildOptions = {},
): StorylineManifest {
  const byBase = dedupeByBaseId(cards, adapter);
  const bases = [...byBase.keys()].sort(byString);

  const storylineIds = new Set<string>();
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];

  for (const base of bases) {
    const card = byBase.get(base) as ContentCard;
    if (card.storylineId) storylineIds.add(card.storylineId);
    const compiledOptions = compileContentOptions(card);
    const hasChoices = card.hasChoices || compiledOptions.length > 0;

    nodes.push({
      id: base,
      name: card.name,
      storylineId: card.storylineId,
      storylineTitle: card.storylineTitle,
      hasChoices,
      optionCount: compiledOptions.length,
      options: compiledOptions.map((option) => ({
        label: option.label,
        successorIds: optionSuccessorIds(option, adapter),
        effectPolicy: option.effectPolicy,
      })),
      effect: card.effect,
      impact: adapter.describeImpact ? adapter.describeImpact(card) : '',
      fields: card.fields,
    });

    for (const option of compiledOptions) {
      const targets = optionSuccessorIds(option, adapter);
      if (targets.length === 0) {
        // Terminal option: a single chain-end edge, never a dangling link.
        edges.push({
          from: base,
          label: option.label,
          to: null,
          random: false,
          candidateIndex: 0,
          cycle: false,
          effectPolicy: option.effectPolicy,
        });
        continue;
      }
      // One edge per candidate so random branches of the same option stay
      // visible; `random` + `candidateIndex` distinguish them.
      targets.forEach((to, candidateIndex) => {
        edges.push({
          from: base,
          label: option.label,
          to,
          random: targets.length > 1,
          candidateIndex,
          cycle: false,
          effectPolicy: option.effectPolicy,
        });
      });
    }
  }

  // ── Cycle detection over the choice graph ──
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.to) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const cycles = findCycles(adjacency)
    .map((cycle) => [...cycle].sort(byString))
    .sort((a, b) => byString(a.join('|'), b.join('|')));

  const cycleNodeSets = cycles.map((cycle) => new Set(cycle));
  const markedEdges = edges.map((edge) => {
    const to = edge.to;
    if (to === null) return edge;
    const inCycle = cycleNodeSets.some((set) => set.has(edge.from) && set.has(to));
    return inCycle ? { ...edge, cycle: true } : edge;
  });

  // Deterministic edge ordering: from, label, candidate index, target.
  markedEdges.sort((a, b) => {
    const from = byString(a.from, b.from);
    if (from !== 0) return from;
    const label = byString(a.label, b.label);
    if (label !== 0) return label;
    if (a.candidateIndex !== b.candidateIndex) return a.candidateIndex - b.candidateIndex;
    return byString(a.to ?? '', b.to ?? '');
  });

  return {
    version: 1,
    source:
      options.source ??
      `Generated from the ${adapter.gameId} content CSV via the story-line content adapter (deterministic).`,
    gameId: adapter.gameId,
    storylineIds: [...storylineIds].sort(byString),
    nodes,
    edges: markedEdges,
    cycles,
  };
}

/**
 * Builds the manifest directly from content CSV text.
 *
 * @param csvText Raw content CSV text.
 * @param adapter The game content adapter.
 * @param options Build options (source provenance override).
 * @returns A deterministic manifest.
 */
export function buildStorylineManifestFromCsv(
  csvText: string,
  adapter: ContentAdapter,
  options: ManifestBuildOptions = {},
): StorylineManifest {
  return buildStorylineManifest(cardsFromCsv(parseCsv(csvText), adapter), adapter, options);
}

/** Serialises a manifest to stable, pretty-printed JSON (trailing newline). */
export function serialiseManifest(manifest: StorylineManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// ── Mermaid rendering ───────────────────────────────────────

/** Escapes a card id into a Mermaid-safe node id. */
function mermaidId(base: string): string {
  return base.replace(/[^A-Za-z0-9_]/g, '_');
}

/** Returns a brief (first-sentence, length-capped) form of an effect text. */
export function briefEventDescription(effect: string, max = 64): string {
  const trimmed = effect.trim();
  if (!trimmed) return '';
  const stop = trimmed.indexOf('. ');
  const first = stop >= 0 ? trimmed.slice(0, stop + 1) : trimmed;
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Builds a multi-line node label for a diagram: name, id, brief effect text
 * and the adapter-provided impact description.
 *
 * @param node The manifest node.
 * @returns The `<br/>`-joined label.
 */
export function nodeLabel(node: ManifestNode): string {
  const lines = [node.name, node.id];
  const brief = briefEventDescription(node.effect);
  if (brief) lines.push(brief);
  if (node.impact) lines.push(node.impact);
  return lines.join('<br/>');
}

/**
 * Describes a node's game impact (`''` when the adapter supplies none).
 *
 * @param node The manifest node.
 * @returns The impact description, or `''`.
 */
export function describeEventImpact(node: ManifestNode): string {
  return node.impact;
}

/**
 * Describes how a card routes through its options (apply/skip and successor),
 * or that it resolves immediately when it has no choice.
 *
 * @param node     The node.
 * @param edges    All manifest edges (filtered to this node's outgoing edges).
 * @param nameById Display names for successor ids.
 * @returns A readable routing summary.
 */
export function describeChoiceRouting(
  node: ManifestNode,
  edges: readonly ManifestEdge[],
  nameById: ReadonlyMap<string, string>,
): string {
  const outgoing = edges.filter((edge) => edge.from === node.id);
  if (outgoing.length === 0) return 'Resolves immediately (no choice)';
  return outgoing
    .map((edge) => {
      const action = edge.effectPolicy === 'apply' ? 'effect applies' : 'effect skipped';
      const target = edge.to ? (nameById.get(edge.to) ?? edge.to) : 'chain ends';
      return `${edge.label}: ${action} → ${target}`;
    })
    .join(' · ');
}

/**
 * Renders the story-line graph as a Mermaid flowchart.
 *
 * Choice cards render as diamonds, plain incidents as rounded rectangles.
 * Random-branch candidate edges render dotted, cycle edges thickened (`==>`),
 * and terminal options get an explicit `end` node so the shape is visible.
 * Deterministic: node and edge order follow the manifest's sorted order.
 *
 * @param manifest The manifest to render.
 * @returns Mermaid flowchart text (trailing newline).
 */
export function renderMermaid(manifest: StorylineManifest): string {
  const lines: string[] = [];
  lines.push('%%{ init: { "flowchart": { "curve": "basis" } } }%%');
  lines.push('flowchart TD');

  for (const node of manifest.nodes) {
    const id = mermaidId(node.id);
    const label = nodeLabel(node);
    if (node.hasChoices) {
      lines.push(`  ${id}{"${label}"}`);
    } else {
      lines.push(`  ${id}("${label}")`);
    }
  }
  lines.push('');

  for (const edge of manifest.edges) {
    const arrow = edge.cycle ? '==>' : edge.random ? '-.->' : '-->';
    const from = mermaidId(edge.from);
    if (edge.to) {
      lines.push(`  ${from} ${arrow}|${edge.label}| ${mermaidId(edge.to)}`);
    } else {
      const endId = `${from}_${edge.label.replace(/[^A-Za-z0-9_]/g, '_')}_end`;
      lines.push(`  ${endId}(["end"])`);
      lines.push(`  ${from} ${arrow}|${edge.label}| ${endId}`);
    }
  }

  if (manifest.cycles.length > 0) {
    lines.push('');
    lines.push('  %% Intentional cycle(s):');
    for (const cycle of manifest.cycles) {
      lines.push(`  %% ${cycle.join(' -> ')} -> ${cycle[0]}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── Per-storyline views ─────────────────────────────────────

/**
 * Restricts a manifest to a single story-line's cards, edges and cycles.
 *
 * Used to render one readable diagram per story-line instead of the combined
 * graph. Edges are kept when both endpoints are members (a terminal edge from
 * a member is kept — it has no target to reject).
 *
 * @param manifest    The full manifest.
 * @param storylineId The story-line id to keep.
 * @returns A manifest containing only that story-line.
 */
export function filterManifestByStoryline(
  manifest: StorylineManifest,
  storylineId: string,
): StorylineManifest {
  const nodeIds = new Set(
    manifest.nodes
      .filter((node) => node.storylineId === storylineId)
      .map((node) => node.id),
  );
  return {
    ...manifest,
    storylineIds: [storylineId],
    nodes: manifest.nodes.filter((node) => nodeIds.has(node.id)),
    edges: manifest.edges.filter(
      (edge) => nodeIds.has(edge.from) && (edge.to === null || nodeIds.has(edge.to)),
    ),
    cycles: manifest.cycles.filter((cycle) => cycle.every((id) => nodeIds.has(id))),
  };
}
