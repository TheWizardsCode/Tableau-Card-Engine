/**
 * Manifest → editor view model.
 *
 * The story-line editor renders the **generated manifest**
 * (`src/story-line/content/manifest.ts`), never the raw CSV and never a
 * re-derived graph. This module is the single mapping step between the two: a
 * pure, deterministic function that turns a {@link StorylineManifest} into a
 * render-ready {@link EditorViewModel}.
 *
 * The mapper is deliberately **faithful**: every node and every edge of the
 * manifest appears exactly once, with the manifest's own ids, names,
 * story-line ids/titles, choice flags and cycle flags. Nothing is invented and
 * nothing is dropped, so a diff of the view model against the manifest is the
 * read-only fidelity guarantee (`tests/story-line/editor/view-model.test.ts`).
 *
 * Presentation strings are **not** re-derived here: the manifest module's own
 * `nodeLabel`, `briefEventDescription`, `describeEventImpact` and
 * `describeChoiceRouting` helpers produce them, and `filterManifestByStoryline`
 * produces each story-line group. If a label helper changes, the editor
 * changes with it — there is no second copy of that logic.
 *
 * Pure and Phaser-free, with no DOM or Node dependency: the same module is
 * consumed by the editor page, the SVG renderer and the unit tests.
 *
 * @module
 */

import {
  briefEventDescription,
  describeChoiceRouting,
  describeEventImpact,
  filterManifestByStoryline,
  nodeLabel,
  type ManifestEdge,
  type ManifestNode,
  type StorylineManifest,
} from '../content/manifest';

/** Which effect policy an option uses. */
export type EditorEffectPolicy = 'apply' | 'skip';

/** One outgoing link of a card (one manifest edge). */
export interface EditorSuccessorLink {
  /** Player-visible option label. */
  readonly label: string;
  /** Target base card id, or null when the chain ends. */
  readonly targetId: string | null;
  /** Display name of the target (`chain ends` for a terminal link). */
  readonly targetName: string;
  /** Whether the card's own effect applies when this option is chosen. */
  readonly effectPolicy: EditorEffectPolicy;
  /** True when this edge is one of several random-branch candidates. */
  readonly random: boolean;
  /** 0-based candidate index within the option's candidate set. */
  readonly candidateIndex: number;
  /** True when this edge participates in a cycle. */
  readonly cycle: boolean;
}

/** One incoming link of a card (one manifest edge pointing at it). */
export interface EditorPredecessorLink {
  /** Source base card id. */
  readonly fromId: string;
  /** Display name of the source card. */
  readonly fromName: string;
  /** Player-visible option label that leads here. */
  readonly label: string;
  /** True when this edge participates in a cycle. */
  readonly cycle: boolean;
}

/** Display strings for a card, all produced by the manifest label helpers. */
export interface EditorNodeLabels {
  /** Multi-line Mermaid node label (`name<br/>id<br/>brief effect<br/>impact`). */
  readonly node: string;
  /** First-sentence, length-capped effect text. */
  readonly brief: string;
  /** Adapter-provided impact description (`''` when the adapter has none). */
  readonly impact: string;
  /** How the card routes through its options (or a no-choice note). */
  readonly routing: string;
}

/** One render-ready card node. */
export interface EditorNode {
  /** Base card id (identical to the manifest node id). */
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
  /** Human-readable effect text. */
  readonly effect: string;
  /** Adapter-provided game impact description. */
  readonly impact: string;
  /** Every game-specific column for this card, keyed by CSV column name. */
  readonly fields: Readonly<Record<string, string>>;
  /** True when the card participates in a detected cycle. */
  readonly inCycle: boolean;
  /** Presentation strings from the manifest label helpers. */
  readonly labels: EditorNodeLabels;
  /** Outgoing links, in manifest edge order. */
  readonly successors: readonly EditorSuccessorLink[];
  /** Incoming links, in manifest edge order. */
  readonly predecessors: readonly EditorPredecessorLink[];
}

/** One render-ready graph edge (a faithful projection of a manifest edge). */
export interface EditorEdge {
  /** Source base card id. */
  readonly from: string;
  /** Option label. */
  readonly label: string;
  /** Target base card id, or null when the chain ends. */
  readonly to: string | null;
  /** True when this edge is one of several random-branch candidates. */
  readonly random: boolean;
  /** 0-based candidate index within the option's candidate set. */
  readonly candidateIndex: number;
  /** True when this edge participates in a cycle. */
  readonly cycle: boolean;
  /** Whether the source card's effect applies when this option is chosen. */
  readonly effectPolicy: EditorEffectPolicy;
}

/** One story-line group: the cards and internal links of a single story-line. */
export interface EditorStorylineGroup {
  /** Story-line id (`null` for the trailing "ungrouped" bucket). */
  readonly storylineId: string | null;
  /** Display title for the group. */
  readonly title: string;
  /** Member card ids, in manifest node order. */
  readonly nodeIds: readonly string[];
  /** Member card nodes (the same objects as {@link EditorViewModel.nodes}). */
  readonly nodes: readonly EditorNode[];
  /** Links whose endpoints are both members (terminal links included). */
  readonly edges: readonly EditorEdge[];
}

/** The complete render-ready editor view model. */
export interface EditorViewModel {
  /** The adapter's game id (manifest provenance). */
  readonly gameId: string;
  /** Manifest provenance string (`''` never occurs — copied from the manifest). */
  readonly source: string;
  /** Every manifest node, in manifest order. */
  readonly nodes: readonly EditorNode[];
  /** Every manifest edge, in manifest order. */
  readonly edges: readonly EditorEdge[];
  /**
   * Story-line groups in `manifest.storylineIds` order, followed by a single
   * `null` "ungrouped" group when any card has no story-line. Empty groups are
   * impossible: a story-line id exists only because a card declares it.
   */
  readonly storylines: readonly EditorStorylineGroup[];
  /** Detected cycles (paths of base card ids), copied from the manifest. */
  readonly cycles: readonly (readonly string[])[];
}

/** Title used for the bucket of cards that declare no story-line. */
export const UNGROUPED_STORYLINE_TITLE = 'Ungrouped';

/** Projects a manifest edge onto the view-model edge shape. */
function toEditorEdge(edge: ManifestEdge): EditorEdge {
  return {
    from: edge.from,
    label: edge.label,
    to: edge.to,
    random: edge.random,
    candidateIndex: edge.candidateIndex,
    cycle: edge.cycle,
    effectPolicy: edge.effectPolicy,
  };
}

/** Builds the successor links of one node from the manifest's edges. */
function successorsOf(
  node: ManifestNode,
  edges: readonly EditorEdge[],
  nameById: ReadonlyMap<string, string>,
): EditorSuccessorLink[] {
  return edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => ({
      label: edge.label,
      targetId: edge.to,
      targetName: edge.to === null ? 'chain ends' : (nameById.get(edge.to) ?? edge.to),
      effectPolicy: edge.effectPolicy,
      random: edge.random,
      candidateIndex: edge.candidateIndex,
      cycle: edge.cycle,
    }));
}

/** Builds the predecessor links of one node from the manifest's edges. */
function predecessorsOf(
  node: ManifestNode,
  edges: readonly EditorEdge[],
  nameById: ReadonlyMap<string, string>,
): EditorPredecessorLink[] {
  return edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => ({
      fromId: edge.from,
      fromName: nameById.get(edge.from) ?? edge.from,
      label: edge.label,
      cycle: edge.cycle,
    }));
}

/** Builds the editor view model from a generated manifest. */
export function buildEditorViewModel(manifest: StorylineManifest): EditorViewModel {
  const nameById = new Map(manifest.nodes.map((node) => [node.id, node.name]));
  const cycleNodeIds = new Set<string>();
  for (const cycle of manifest.cycles) {
    for (const id of cycle) cycleNodeIds.add(id);
  }

  const edges = manifest.edges.map(toEditorEdge);

  const nodes = manifest.nodes.map((node): EditorNode => {
    const impact = describeEventImpact(node);
    return {
      id: node.id,
      name: node.name,
      storylineId: node.storylineId,
      storylineTitle: node.storylineTitle,
      hasChoices: node.hasChoices,
      optionCount: node.optionCount,
      effect: node.effect,
      impact,
      fields: node.fields,
      inCycle: cycleNodeIds.has(node.id),
      labels: {
        node: nodeLabel(node),
        brief: briefEventDescription(node.effect),
        impact,
        routing: describeChoiceRouting(node, manifest.edges, nameById),
      },
      successors: successorsOf(node, edges, nameById),
      predecessors: predecessorsOf(node, edges, nameById),
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const storylines: EditorStorylineGroup[] = manifest.storylineIds.map((storylineId) => {
    // Reuse the manifest's own per-story-line view rather than re-filtering:
    // grouping and the member-link rule stay defined in one place.
    const filtered = filterManifestByStoryline(manifest, storylineId);
    const storylineTitle = filtered.nodes.find((node) => node.storylineTitle)?.storylineTitle;
    const nodeIds = filtered.nodes.map((node) => node.id);
    return {
      storylineId,
      title: storylineTitle ?? storylineId,
      nodeIds,
      nodes: nodeIds.map((id) => nodeById.get(id) as EditorNode),
      edges: filtered.edges.map(toEditorEdge),
    };
  });

  const ungrouped = nodes.filter((node) => node.storylineId === null);
  if (ungrouped.length > 0) {
    const ungroupedIds = new Set(ungrouped.map((node) => node.id));
    storylines.push({
      storylineId: null,
      title: UNGROUPED_STORYLINE_TITLE,
      nodeIds: ungrouped.map((node) => node.id),
      nodes: ungrouped,
      edges: edges.filter(
        (edge) => ungroupedIds.has(edge.from) && (edge.to === null || ungroupedIds.has(edge.to)),
      ),
    });
  }

  return {
    gameId: manifest.gameId,
    source: manifest.source,
    nodes,
    edges,
    storylines,
    cycles: manifest.cycles,
  };
}
