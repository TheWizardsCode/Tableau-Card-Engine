/**
 * Read-only fidelity tests for the story-line editor view model.
 *
 * The editor renders the generated manifest and nothing else, so the core
 * contract is a **diff**: the view model's nodes, edges, story-line ids/titles
 * and cycle flags must be identical to the manifest it was built from
 * (epic AC4). The remaining tests pin the derived presentation data — the
 * story-line grouping, successor/predecessor links and the manifest label
 * helpers — plus determinism.
 *
 * @module
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import {
  briefEventDescription,
  buildStorylineManifestFromCsv,
  describeChoiceRouting,
  describeEventImpact,
  nodeLabel,
  type StorylineManifest,
} from '../../../src/story-line/content/manifest';
import {
  UNGROUPED_STORYLINE_TITLE,
  buildEditorViewModel,
  type EditorEdge,
  type EditorNode,
} from '../../../src/story-line/editor/view-model';
import { CONTENT_CSV_PATH } from './fixtures';

/** Builds the Gym manifest from the committed content CSV. */
function gymManifest(): StorylineManifest {
  return buildStorylineManifestFromCsv(readFileSync(CONTENT_CSV_PATH, 'utf-8'), GYM_CONTENT_ADAPTER);
}

/** Projects a view-model node onto the fields the manifest also carries. */
function nodeProjection(node: EditorNode) {
  return {
    id: node.id,
    name: node.name,
    storylineId: node.storylineId,
    storylineTitle: node.storylineTitle,
    hasChoices: node.hasChoices,
    optionCount: node.optionCount,
    effect: node.effect,
    impact: node.impact,
    fields: node.fields,
  };
}

/** Projects a view-model edge onto the manifest edge shape. */
function edgeProjection(edge: EditorEdge) {
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

/** A deliberately shaped manifest: two groups (one ungrouped card), a cycle. */
function syntheticManifest(): StorylineManifest {
  return {
    version: 1,
    source: 'synthetic fixture',
    gameId: 'fixture',
    storylineIds: ['arc-a'],
    nodes: [
      {
        id: 'a',
        name: 'Alpha',
        storylineId: 'arc-a',
        storylineTitle: 'Arc A',
        hasChoices: true,
        optionCount: 2,
        options: [
          { label: 'go', successorIds: ['b'], effectPolicy: 'apply' },
          { label: 'stop', successorIds: [], effectPolicy: 'skip' },
        ],
        effect: 'Alpha happens.',
        impact: '+1 alpha',
        fields: { coin: '1' },
      },
      {
        id: 'b',
        name: 'Beta',
        storylineId: 'arc-a',
        storylineTitle: 'Arc A',
        hasChoices: true,
        optionCount: 1,
        options: [{ label: 'back', successorIds: ['a'], effectPolicy: 'apply' }],
        effect: 'Beta follows.',
        impact: '',
        fields: {},
      },
      {
        id: 'loner',
        name: 'Loner',
        storylineId: null,
        storylineTitle: null,
        hasChoices: false,
        optionCount: 0,
        options: [],
        effect: 'Loner stands alone.',
        impact: '',
        fields: { token: 'x' },
      },
    ],
    edges: [
      { from: 'a', label: 'go', to: 'b', random: false, candidateIndex: 0, cycle: true, effectPolicy: 'apply' },
      { from: 'b', label: 'back', to: 'a', random: false, candidateIndex: 0, cycle: true, effectPolicy: 'apply' },
      { from: 'a', label: 'stop', to: null, random: false, candidateIndex: 0, cycle: false, effectPolicy: 'skip' },
    ],
    cycles: [['a', 'b']],
  };
}

describe('buildEditorViewModel — read-only fidelity (diff against the manifest)', () => {
  it('projects every manifest node identically (id, name, story-line, choice flag, effect, impact, columns)', () => {
    const manifest = gymManifest();
    const viewModel = buildEditorViewModel(manifest);

    expect(viewModel.nodes.map(nodeProjection)).toEqual(manifest.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      storylineId: node.storylineId,
      storylineTitle: node.storylineTitle,
      hasChoices: node.hasChoices,
      optionCount: node.optionCount,
      effect: node.effect,
      impact: node.impact,
      fields: node.fields,
    })));
    // Nothing dropped, nothing invented.
    expect(viewModel.nodes).toHaveLength(manifest.nodes.length);
  });

  it('projects every manifest edge identically (from, label, target, random, candidate, cycle, policy)', () => {
    const manifest = gymManifest();
    const viewModel = buildEditorViewModel(manifest);

    expect(viewModel.edges.map(edgeProjection)).toEqual(manifest.edges.map(edgeProjection));
    expect(viewModel.edges).toHaveLength(manifest.edges.length);
  });

  it('keeps the manifest story-line ids and titles', () => {
    const manifest = gymManifest();
    const viewModel = buildEditorViewModel(manifest);

    const grouped = viewModel.storylines.filter((group) => group.storylineId !== null);
    expect(grouped.map((group) => group.storylineId)).toEqual([...manifest.storylineIds]);
    for (const group of grouped) {
      const manifestTitle = manifest.nodes.find(
        (node) => node.storylineId === group.storylineId && node.storylineTitle,
      )?.storylineTitle;
      expect(group.title).toBe(manifestTitle ?? group.storylineId);
    }
  });

  it('derives cycle flags exactly from the manifest cycles (synthetic cycle)', () => {
    const manifest = syntheticManifest();
    const viewModel = buildEditorViewModel(manifest);

    const inCycle = viewModel.nodes.filter((node) => node.inCycle).map((node) => node.id);
    expect(inCycle).toEqual(['a', 'b']);
    expect(viewModel.nodes.find((node) => node.id === 'loner')?.inCycle).toBe(false);

    expect(viewModel.edges.map((edge) => [edge.from, edge.to, edge.cycle])).toEqual(
      manifest.edges.map((edge) => [edge.from, edge.to, edge.cycle]),
    );
    expect(viewModel.cycles).toEqual(manifest.cycles);
  });

  it('gives every card exactly one story-line group, with ungrouped cards last', () => {
    const viewModel = buildEditorViewModel(syntheticManifest());

    const groupedIds = viewModel.storylines.flatMap((group) => group.nodeIds);
    expect(groupedIds.sort()).toEqual(viewModel.nodes.map((node) => node.id).sort());
    expect(new Set(groupedIds).size).toBe(groupedIds.length);

    const last = viewModel.storylines[viewModel.storylines.length - 1];
    expect(last.storylineId).toBeNull();
    expect(last.title).toBe(UNGROUPED_STORYLINE_TITLE);
    expect(last.nodeIds).toEqual(['loner']);
    // A terminal link from a grouped card stays in its group; a link to an
    // ungrouped card never appears in a story-line group's internal edges.
    const groupA = viewModel.storylines.find((group) => group.storylineId === 'arc-a');
    expect(groupA?.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ['a', 'b'],
      ['b', 'a'],
      ['a', null],
    ]);
  });

  it('reuses the manifest label helpers rather than re-deriving presentation text', () => {
    const manifest = gymManifest();
    const viewModel = buildEditorViewModel(manifest);
    const nameById = new Map(manifest.nodes.map((node) => [node.id, node.name]));

    for (const manifestNode of manifest.nodes) {
      const node = viewModel.nodes.find((candidate) => candidate.id === manifestNode.id);
      expect(node).toBeDefined();
      if (!node) continue;
      expect(node.labels.node).toBe(nodeLabel(manifestNode));
      expect(node.labels.brief).toBe(briefEventDescription(manifestNode.effect));
      expect(node.labels.impact).toBe(describeEventImpact(manifestNode));
      expect(node.labels.routing).toBe(
        describeChoiceRouting(manifestNode, manifest.edges, nameById),
      );
    }
  });

  it('builds successor and predecessor links with target names and chain ends', () => {
    const viewModel = buildEditorViewModel(gymManifest());

    const start = viewModel.nodes.find((node) => node.id === 'gym-story-start');
    expect(start?.successors.map((link) => [link.label, link.targetId, link.targetName])).toEqual([
      ['Ignore', 'gym-story-ignore', 'Neglected Roads'],
      ['Invest', 'gym-story-invest', 'Public Investment'],
    ]);

    const ignore = viewModel.nodes.find((node) => node.id === 'gym-story-ignore');
    expect(ignore?.successors[0]).toMatchObject({
      label: 'Let it be',
      targetId: null,
      targetName: 'chain ends',
    });

    const end = viewModel.nodes.find((node) => node.id === 'gym-story-end');
    expect(end?.successors).toEqual([]);
    expect(end?.predecessors.map((link) => [link.label, link.fromId, link.fromName])).toEqual([
      ['Repair', 'gym-story-ignore', 'Neglected Roads'],
      ['Celebrate', 'gym-story-invest', 'Public Investment'],
    ]);
  });

  it('is deterministic: the same manifest always produces the same view model', () => {
    const manifest = gymManifest();
    expect(buildEditorViewModel(manifest)).toEqual(buildEditorViewModel(manifest));
  });
});
