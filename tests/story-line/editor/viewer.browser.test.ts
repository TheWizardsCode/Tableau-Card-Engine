/**
 * Browser tests for the read-only story-line editor.
 *
 * The editor's page modules are plain DOM (no Phaser, no game loop), so they
 * are mounted straight into the real Chromium document and exercised against
 * the **committed Gym manifest** — the same artefact the editor host serves.
 * This covers the slice's rendering contract: every manifest node and edge is
 * drawn, choice cards and cycle edges are visually distinct, story-line
 * grouping is shown, pan/zoom and node selection work, and selecting a card
 * shows its links and metadata (epic AC2/AC3/AC5).
 *
 * @module
 */
import { afterEach, describe, expect, it } from 'vitest';

import gymManifestJson from '../../../example-games/gym/content/storyline-manifest.json';
import type { StorylineManifest } from '../../../src/story-line/content/manifest';
import { mountEditorShell, type EditorShell } from '../../../tools/storyline-editor/app-shell';

/** The committed Gym manifest — exactly what the editor host serves. */
const gymManifest = gymManifestJson as StorylineManifest;

let mounted: { container: HTMLDivElement; shell: EditorShell } | null = null;

/** Mounts the editor shell into a fresh container in the test document. */
function mount(manifest: StorylineManifest): { container: HTMLDivElement; shell: EditorShell } {
  const container = document.createElement('div');
  document.body.append(container);
  const shell = mountEditorShell(container, manifest);
  mounted = { container, shell };
  return mounted;
}

/** Clicks an element the way a user would. */
function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** A manifest with cycles, a random branch, a terminal link and an ungrouped card. */
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
        optionCount: 3,
        options: [
          { label: 'go', successorIds: ['b'], effectPolicy: 'apply' },
          { label: 'split', successorIds: ['b', 'c'], effectPolicy: 'skip' },
          { label: 'stop', successorIds: [], effectPolicy: 'apply' },
        ],
        effect: 'Alpha happens.',
        impact: '',
        fields: {},
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
        id: 'c',
        name: 'Gamma',
        storylineId: 'arc-a',
        storylineTitle: 'Arc A',
        hasChoices: false,
        optionCount: 0,
        options: [],
        effect: 'Gamma ends.',
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
        fields: {},
      },
    ],
    edges: [
      { from: 'a', label: 'go', to: 'b', random: false, candidateIndex: 0, cycle: true, effectPolicy: 'apply' },
      { from: 'a', label: 'split', to: 'b', random: true, candidateIndex: 0, cycle: false, effectPolicy: 'skip' },
      { from: 'a', label: 'split', to: 'c', random: true, candidateIndex: 1, cycle: false, effectPolicy: 'skip' },
      { from: 'a', label: 'stop', to: null, random: false, candidateIndex: 0, cycle: false, effectPolicy: 'apply' },
      { from: 'b', label: 'back', to: 'a', random: false, candidateIndex: 0, cycle: true, effectPolicy: 'apply' },
    ],
    cycles: [['a', 'b']],
  };
}

afterEach(() => {
  mounted?.shell.dispose();
  mounted?.container.remove();
  mounted = null;
});

describe('story-line editor viewer — manifest rendering', () => {
  it('renders every node and every edge of the generated manifest', () => {
    const { container } = mount(gymManifest);

    const nodeElements = container.querySelectorAll('[data-node-id]');
    expect(nodeElements.length).toBe(gymManifest.nodes.length);
    for (const node of gymManifest.nodes) {
      const element = container.querySelector(`[data-node-id="${node.id}"]`);
      expect(element, `node ${node.id} is rendered`).not.toBeNull();
      expect(element?.getAttribute('data-has-choices')).toBe(String(node.hasChoices));
      expect(element?.getAttribute('data-storyline-id')).toBe(node.storylineId ?? '');
    }

    const edgeElements = [...container.querySelectorAll('[data-edge="true"]')];
    expect(edgeElements.length).toBe(gymManifest.edges.length);
    for (const edge of gymManifest.edges) {
      const rendered = edgeElements.some(
        (element) =>
          element.getAttribute('data-edge-from') === edge.from &&
          element.getAttribute('data-edge-to') === (edge.to ?? '') &&
          element.getAttribute('data-edge-label') === edge.label,
      );
      expect(rendered, `edge ${edge.from} -${edge.label}-> ${edge.to ?? 'end'} is rendered`).toBe(true);
    }
    // Every edge carries its option label on the canvas.
    expect(container.querySelectorAll('[data-role="edge-label"]').length).toBe(
      gymManifest.edges.length,
    );

    // The toolbar summary reports what is on screen.
    const summary = container.querySelector('[data-role="graph-summary"]')?.textContent ?? '';
    expect(summary).toContain(`${gymManifest.nodes.length} cards`);
    expect(summary).toContain(`${gymManifest.edges.length} links`);
    expect(summary).toContain('1 story-line');
  });

  it('distinguishes choice cards from plain incidents and groups cards by story-line', () => {
    const { container } = mount(gymManifest);

    const start = container.querySelector('[data-node-id="gym-story-start"]');
    const end = container.querySelector('[data-node-id="gym-story-end"]');
    expect(start?.classList.contains('node--choice')).toBe(true);
    expect(end?.classList.contains('node--incident')).toBe(true);
    expect(container.querySelectorAll('.node--choice').length).toBe(
      gymManifest.nodes.filter((node) => node.hasChoices).length,
    );

    const column = container.querySelector('[data-role="graph-column"][data-storyline-id="gym-story"]');
    expect(column).not.toBeNull();
    expect(column?.textContent).toContain('Gym Storyline');

    const legend = container.querySelector('[data-role="storyline-legend-item"][data-storyline-id="gym-story"]');
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toContain('Gym Storyline · 4 cards');
  });

  it('marks cycle edges and cycle members, and shows random-branch candidates', () => {
    const { container } = mount(syntheticManifest());

    const cycleEdges = container.querySelectorAll('[data-edge="true"][data-cycle="true"]');
    expect(cycleEdges.length).toBe(2);
    expect(container.querySelectorAll('[data-edge="true"][data-cycle="false"]').length).toBe(3);

    expect(container.querySelector('[data-node-id="a"]')?.getAttribute('data-in-cycle')).toBe('true');
    expect(container.querySelector('[data-node-id="b"]')?.getAttribute('data-in-cycle')).toBe('true');
    expect(container.querySelector('[data-node-id="c"]')?.getAttribute('data-in-cycle')).toBe('false');
    expect(container.querySelector('[data-node-id="a"]')?.classList.contains('node--cycle')).toBe(true);

    const randomEdges = container.querySelectorAll('[data-edge="true"][data-random="true"]');
    expect(randomEdges.length).toBe(2);
    const labels = [...container.querySelectorAll('[data-role="edge-label"]')].map(
      (element) => element.textContent,
    );
    expect(labels).toContain('split (1)');
    expect(labels).toContain('split (2)');

    // The ungrouped card still renders (it is not dropped from the graph).
    expect(container.querySelector('[data-node-id="loner"]')).not.toBeNull();
  });
});

describe('story-line editor viewer — pan/zoom controls', () => {
  it('zooms, pans and resets through the renderer API and the toolbar', () => {
    const { container, shell } = mount(gymManifest);
    const viewport = shell.renderer.viewport;
    expect(shell.renderer.getTransform()).toEqual({ scale: 1, x: 0, y: 0 });

    shell.renderer.zoomBy(2);
    expect(shell.renderer.getTransform().scale).toBe(2);
    expect(viewport.getAttribute('transform')).toContain('scale(2)');

    const beforePan = shell.renderer.getTransform();
    shell.renderer.panBy(40, -15);
    expect(shell.renderer.getTransform().x).toBeCloseTo(beforePan.x + 40, 5);
    expect(shell.renderer.getTransform().y).toBeCloseTo(beforePan.y - 15, 5);
    expect(viewport.getAttribute('transform')).toContain('translate');

    shell.renderer.resetView();
    expect(shell.renderer.getTransform()).toEqual({ scale: 1, x: 0, y: 0 });

    click(container.querySelector('[data-action="zoom-in"]') as Element);
    expect(shell.renderer.getTransform().scale).toBeGreaterThan(1);
    click(container.querySelector('[data-action="reset-view"]') as Element);
    expect(shell.renderer.getTransform().scale).toBe(1);

    // "Fit view" picks a positive, in-range scale for the whole graph.
    click(container.querySelector('[data-action="fit-view"]') as Element);
    const fitted = shell.renderer.getTransform().scale;
    expect(fitted).toBeGreaterThan(0);
    expect(fitted).toBeLessThanOrEqual(4);
  });

  it('zooms with the wheel and pans with a pointer drag', () => {
    const { shell } = mount(gymManifest);
    const svg = shell.renderer.svg;

    svg.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -120,
        clientX: 120,
        clientY: 90,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(shell.renderer.getTransform().scale).toBeGreaterThan(1);
    shell.renderer.resetView();

    const before = shell.renderer.getTransform();
    svg.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 11, clientX: 50, clientY: 50, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 11, clientX: 90, clientY: 70, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 11, clientX: 90, clientY: 70, bubbles: true }),
    );
    expect(shell.renderer.getTransform().x).toBeCloseTo(before.x + 40, 5);
    expect(shell.renderer.getTransform().y).toBeCloseTo(before.y + 20, 5);
  });
});

describe('story-line editor viewer — node selection and details', () => {
  it('shows the selected card’s links and metadata', () => {
    const { container, shell } = mount(gymManifest);
    const start = gymManifest.nodes.find((node) => node.id === 'gym-story-start');
    expect(start).toBeDefined();
    if (!start) return;

    click(container.querySelector('[data-node-id="gym-story-start"]') as Element);

    expect(shell.renderer.selectedNodeId).toBe('gym-story-start');
    expect(container.querySelector('[data-role="details"]')?.hasAttribute('hidden')).toBe(false);
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe(start.name);
    expect(container.querySelector('[data-role="details-id"]')?.textContent).toBe(start.id);
    expect(container.querySelector('[data-role="details-kind"]')?.textContent).toBe(
      'Choice card · 2 options',
    );
    expect(container.querySelector('[data-role="details-storyline"]')?.textContent).toBe(
      'Story-line: Gym Storyline (gym-story)',
    );
    expect(container.querySelector('[data-role="details-effect"]')?.textContent).toBe(start.effect);
    expect(container.querySelector('[data-role="details-impact"]')?.textContent).toBe(start.impact);
    expect(container.querySelector('[data-role="details-routing"]')?.textContent).toContain('Invest');

    // Successor targets are listed as links.
    const links = [...container.querySelectorAll('[data-role="details-links"] [data-link-to]')];
    expect(links.map((link) => link.getAttribute('data-link-to'))).toEqual([
      'gym-story-ignore',
      'gym-story-invest',
    ]);
    expect(links[0].textContent).toContain('Ignore → Neglected Roads');

    // Adapter-declared columns are shown, sorted by column name.
    const fields = [...container.querySelectorAll('[data-role="details-fields"] [data-field]')];
    expect(fields.map((field) => field.getAttribute('data-field'))).toEqual([
      'coinDelta',
      'cost',
      'reputationDelta',
      'trigger',
    ]);
    expect(container.querySelector('[data-field="coinDelta"] dd')?.textContent).toBe(
      start.fields.coinDelta,
    );

    // Selecting another card replaces the details and moves the highlight.
    click(container.querySelector('[data-node-id="gym-story-end"]') as Element);
    expect(shell.renderer.selectedNodeId).toBe('gym-story-end');
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe('New Beginning');
    expect(container.querySelector('[data-node-id="gym-story-end"]')?.classList.contains('is-selected')).toBe(
      true,
    );
    expect(container.querySelector('[data-node-id="gym-story-start"]')?.classList.contains('is-selected')).toBe(
      false,
    );

    // A terminal card has no outgoing links but lists where it is reached from.
    expect((container.querySelector('[data-role="details-links"]') as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('[data-role="details-no-links"]') as HTMLElement).hidden).toBe(
      false,
    );
    const incoming = [
      ...container.querySelectorAll('[data-role="details-incoming"] [data-link-from]'),
    ];
    expect(incoming.map((link) => link.getAttribute('data-link-from'))).toEqual([
      'gym-story-ignore',
      'gym-story-invest',
    ]);
  });

  it('supports programmatic selection and selecting through the story-line legend', () => {
    const { container, shell } = mount(gymManifest);

    shell.selectNode('gym-story-invest');
    expect(shell.renderer.selectedNodeId).toBe('gym-story-invest');
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe(
      'Public Investment',
    );

    // The legend selects the first card of its story-line group.
    click(container.querySelector('[data-role="storyline-legend-item"]') as Element);
    expect(shell.renderer.selectedNodeId).toBe('gym-story-end');
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe('New Beginning');
  });
});
