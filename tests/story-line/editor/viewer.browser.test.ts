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
import editorPageHtml from '../../../tools/storyline-editor/index.html?raw';
import type { StorylineManifest } from '../../../src/story-line/content/manifest';
import { mountEditorShell, type EditorShell } from '../../../tools/storyline-editor/app-shell';
import {
  FIT_PADDING,
  MAX_ROWS_PER_COLUMN,
  NODE_WIDTH,
} from '../../../tools/storyline-editor/graph-renderer';

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

/**
 * Gives the graph a definite on-screen size and re-fits it.
 *
 * The editor page sizes the graph pane with CSS; the plain test document has no
 * stylesheet, so the viewport is pinned explicitly instead of being assumed.
 */
function sizeViewport(shell: EditorShell, width: number, height: number): void {
  const svg = shell.renderer.svg;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  shell.renderer.fitToView();
}

/** Where a graph-space point lands on screen, given a transform. */
function project(
  transform: { scale: number; x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  return { x: transform.x + point.x * transform.scale, y: transform.y + point.y * transform.scale };
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
        isChoice: true,
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
        isChoice: true,
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
        isChoice: false,
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
        isChoice: false,
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

/**
 * A manifest with one story-line group of `count` chained cards.
 *
 * Used to pin the layout's row cap: a group taller than
 * {@link MAX_ROWS_PER_COLUMN} must wrap into sub-columns instead of growing one
 * un-fittable column.
 */
function tallManifest(count: number): StorylineManifest {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: `t${index}`,
    name: `Card ${index}`,
    storylineId: 'arc-tall',
    storylineTitle: 'Tall Arc',
    isChoice: index < count - 1,
    optionCount: index < count - 1 ? 1 : 0,
    options:
      index < count - 1
        ? [{ label: 'next', successorIds: [`t${index + 1}`], effectPolicy: 'apply' as const }]
        : [],
    effect: `Step ${index}.`,
    impact: '',
    fields: {},
  }));
  const edges = Array.from({ length: count - 1 }, (_, index) => ({
    from: `t${index}`,
    label: 'next',
    to: `t${index + 1}`,
    random: false,
    candidateIndex: 0,
    cycle: false,
    effectPolicy: 'apply' as const,
  }));
  return {
    version: 1,
    source: 'synthetic tall fixture',
    gameId: 'fixture',
    storylineIds: ['arc-tall'],
    nodes,
    edges,
    cycles: [],
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
      expect(element?.getAttribute('data-is-choice')).toBe(String(node.isChoice));
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
      gymManifest.nodes.filter((node) => node.isChoice).length,
    );

    // A choice node is a diamond labelled `CHOICE · <optionCount>`; an incident
    // is a rounded box labelled `INCIDENT`.
    expect(start?.querySelector('polygon.node-shape')).not.toBeNull();
    expect(end?.querySelector('rect.node-shape')).not.toBeNull();
    expect(start?.querySelector('.node-kind')?.textContent).toBe(
      `CHOICE · ${gymManifest.nodes.find((node) => node.id === 'gym-story-start')?.optionCount}`,
    );
    expect(end?.querySelector('.node-kind')?.textContent).toBe('INCIDENT');

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

describe('story-line editor viewer — viewport scaling', () => {
  it('opens with the whole graph fitted into the viewport and centred', () => {
    const { shell } = mount(gymManifest);
    sizeViewport(shell, 1000, 700);

    const transform = shell.renderer.getTransform();
    const { width, height } = shell.renderer.layout;

    // Scale is the single, in-range scale for the whole graph.
    expect(transform.scale).toBeGreaterThan(0);
    expect(transform.scale).toBeLessThanOrEqual(4);

    // Everything (including the fit padding) is inside the viewport.
    const topLeft = project(transform, { x: 0, y: 0 });
    const bottomRight = project(transform, { x: width, y: height });
    expect(topLeft.x).toBeGreaterThanOrEqual(FIT_PADDING - 1);
    expect(topLeft.y).toBeGreaterThanOrEqual(FIT_PADDING - 1);
    expect(bottomRight.x).toBeLessThanOrEqual(1000 - FIT_PADDING + 1);
    expect(bottomRight.y).toBeLessThanOrEqual(700 - FIT_PADDING + 1);

    // …and the graph is centred rather than pinned to a corner.
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(500, 0);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(350, 0);
  });

  it('renders SVG user units 1:1 with CSS pixels (no second viewBox scale)', () => {
    const { container, shell } = mount(gymManifest);
    sizeViewport(shell, 1000, 700);
    shell.renderer.resetView();

    // 100% zoom means one graph unit is one CSS pixel — the regression that
    // produced gigantic boxes was a viewBox scaling on top of this transform.
    const transform = shell.renderer.getTransform();
    expect(transform.scale).toBe(1);

    const svgRect = shell.renderer.svg.getBoundingClientRect();
    for (const id of ['gym-story-start', 'gym-story-end']) {
      const position = shell.renderer.layout.positions.get(id);
      const element = container.querySelector(`[data-node-id="${id}"]`);
      expect(position, `layout position for ${id}`).toBeDefined();
      expect(element, `rendered node ${id}`).not.toBeNull();
      if (!position || !element) return;

      const rect = element.getBoundingClientRect();
      expect(rect.left - svgRect.left).toBeCloseTo(transform.x + position.x, 0);
      expect(rect.top - svgRect.top).toBeCloseTo(transform.y + position.y, 0);
      expect(rect.width).toBeCloseTo(NODE_WIDTH, 0);
    }
  });

  it('wraps a tall story-line group into sub-columns so the arc stays fittable', () => {
    const { container, shell } = mount(tallManifest(MAX_ROWS_PER_COLUMN + 2));
    const { positions, columns } = shell.renderer.layout;

    const first = positions.get('t0');
    const lastInColumn = positions.get(`t${MAX_ROWS_PER_COLUMN - 1}`);
    const firstWrapped = positions.get(`t${MAX_ROWS_PER_COLUMN}`);
    expect(first && lastInColumn && firstWrapped).toBeTruthy();
    if (!first || !lastInColumn || !firstWrapped) return;

    // The first MAX_ROWS_PER_COLUMN cards share a sub-column…
    expect(lastInColumn.x).toBe(first.x);
    // …the next card starts a new sub-column at the top row.
    expect(firstWrapped.x).toBeGreaterThan(first.x);
    expect(firstWrapped.y).toBe(first.y);

    // The story-line block still covers its wrapped sub-columns.
    expect(columns.length).toBe(1);
    expect(columns[0].width).toBeGreaterThan(NODE_WIDTH);
    const background = container.querySelector(
      '[data-role="graph-column"] rect',
    ) as SVGRectElement | null;
    expect(Number(background?.getAttribute('width'))).toBeGreaterThan(NODE_WIDTH + 32);
  });
});

describe('story-line editor viewer — pan/zoom controls', () => {
  it('zooms, pans and resets through the renderer API and the toolbar', () => {
    const { container, shell } = mount(gymManifest);
    sizeViewport(shell, 1000, 700);
    const viewport = shell.renderer.viewport;
    const fitted = shell.renderer.getTransform();

    shell.renderer.zoomBy(2);
    const zoomed = shell.renderer.getTransform();
    expect(zoomed.scale).toBeCloseTo(fitted.scale * 2, 5);
    expect(viewport.getAttribute('transform')).toContain('scale(');

    // Zooming around the viewport centre keeps the graph's centre fixed.
    const centre = project(zoomed, { x: shell.renderer.layout.width / 2, y: shell.renderer.layout.height / 2 });
    expect(centre.x).toBeCloseTo(500, 0);
    expect(centre.y).toBeCloseTo(350, 0);

    const beforePan = shell.renderer.getTransform();
    shell.renderer.panBy(40, -15);
    expect(shell.renderer.getTransform().x).toBeCloseTo(beforePan.x + 40, 5);
    expect(shell.renderer.getTransform().y).toBeCloseTo(beforePan.y - 15, 5);
    expect(viewport.getAttribute('transform')).toContain('translate');

    shell.renderer.resetView();
    expect(shell.renderer.getTransform().scale).toBe(1);

    click(container.querySelector('[data-action="zoom-in"]') as Element);
    expect(shell.renderer.getTransform().scale).toBeGreaterThan(1);
    click(container.querySelector('[data-action="reset-view"]') as Element);
    expect(shell.renderer.getTransform().scale).toBe(1);

    // "Fit view" restores the whole-graph view after wandering off.
    shell.renderer.panBy(4000, 4000);
    click(container.querySelector('[data-action="fit-view"]') as Element);
    const refitted = shell.renderer.getTransform();
    expect(refitted.scale).toBeCloseTo(fitted.scale, 5);
    expect(refitted.x).toBeCloseTo(fitted.x, 5);
    expect(refitted.y).toBeCloseTo(fitted.y, 5);
  });

  it('shows the current zoom level in the toolbar', () => {
    const { container, shell } = mount(gymManifest);
    sizeViewport(shell, 1000, 700);
    const readout = (): string =>
      container.querySelector('[data-role="zoom-level"]')?.textContent ?? '';

    expect(readout()).toBe(`${Math.round(shell.renderer.getTransform().scale * 100)}%`);

    click(container.querySelector('[data-action="zoom-in"]') as Element);
    expect(readout()).toBe(`${Math.round(shell.renderer.getTransform().scale * 100)}%`);

    click(container.querySelector('[data-action="reset-view"]') as Element);
    expect(readout()).toBe('100%');
  });

  it('zooms with the wheel anchored at the pointer and pans with a pointer drag', () => {
    const { shell } = mount(gymManifest);
    sizeViewport(shell, 1000, 700);
    const svg = shell.renderer.svg;
    const rect = svg.getBoundingClientRect();

    // The graph point under the cursor before the wheel.
    const before = shell.renderer.getTransform();
    const pointer = { x: 320, y: 260 };
    const anchor = {
      x: (pointer.x - before.x) / before.scale,
      y: (pointer.y - before.y) / before.scale,
    };

    svg.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -120,
        clientX: rect.left + pointer.x,
        clientY: rect.top + pointer.y,
        bubbles: true,
        cancelable: true,
      }),
    );

    const after = shell.renderer.getTransform();
    expect(after.scale).toBeGreaterThan(before.scale);
    const anchorAfter = project(after, anchor);
    // Pointer events carry integer client coordinates, so the anchor is exact
    // to within a fraction of a pixel rather than bit-identical.
    expect(Math.abs(anchorAfter.x - pointer.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(anchorAfter.y - pointer.y)).toBeLessThanOrEqual(1);

    shell.renderer.resetView();

    const beforeDrag = shell.renderer.getTransform();
    svg.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 11, clientX: 50, clientY: 50, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 11, clientX: 90, clientY: 70, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 11, clientX: 90, clientY: 70, bubbles: true }),
    );
    expect(shell.renderer.getTransform().x).toBeCloseTo(beforeDrag.x + 40, 5);
    expect(shell.renderer.getTransform().y).toBeCloseTo(beforeDrag.y + 20, 5);
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
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe('Transport Infrastructure');
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
    expect(container.querySelector('[data-role="details-name"]')?.textContent).toBe('Transport Infrastructure');
  });
});

describe('story-line editor viewer — page layout', () => {
  /** The editor page's own stylesheet, extracted from `index.html`. */
  const pageStyles = (() => {
    const match = /<style>([\s\S]*?)<\/style>/.exec(editorPageHtml);
    if (!match) throw new Error('the editor page has no <style> block');
    return match[1];
  })();

  it('fills the window with a fixed graph pane instead of growing the page', () => {
    let style: HTMLStyleElement | null = null;
    let app: HTMLDivElement | null = null;
    let shell: EditorShell | null = null;
    try {
      // The real page CSS is what sizes the graph pane - mount the shell under
      // it so the layout contract is asserted rather than re-created.
      style = document.createElement('style');
      style.textContent = pageStyles;
      document.head.append(style);

      app = document.createElement('div');
      app.id = 'storyline-editor-app';
      document.body.append(app);
      shell = mountEditorShell(app, gymManifest);

      const pane = app.querySelector<HTMLElement>('[data-region="graph"]');
      expect(pane).not.toBeNull();
      if (!pane) return;

      const svg = shell.renderer.svg;
      // The pane takes the leftover height and the SVG fills that pane exactly
      // (no intrinsic aspect-ratio growth - the regression that made the page
      // scroll a long way).
      expect(pane.clientHeight).toBeGreaterThan(100);
      expect(Math.abs(svg.clientHeight - pane.clientHeight)).toBeLessThanOrEqual(1);
      expect(Math.abs(svg.clientWidth - pane.clientWidth)).toBeLessThanOrEqual(1);

      // The document itself never scrolls.
      expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(
        window.innerHeight + 1,
      );
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);

      // And what was drawn is actually visible inside the pane (fitted at
      // launch, not an empty canvas or an off-screen graph).
      const paneRect = pane.getBoundingClientRect();
      for (const id of ['gym-story-start', 'gym-story-end']) {
        const node = app.querySelector(`[data-node-id="${id}"]`);
        expect(node, `node ${id}`).not.toBeNull();
        const rect = (node as SVGGElement).getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(paneRect.left - 1);
        expect(rect.right).toBeLessThanOrEqual(paneRect.right + 1);
        expect(rect.top).toBeGreaterThanOrEqual(paneRect.top - 1);
        expect(rect.bottom).toBeLessThanOrEqual(paneRect.bottom + 1);
      }
      expect(shell.renderer.getTransform().scale).toBeGreaterThan(0);
    } finally {
      shell?.dispose();
      app?.remove();
      style?.remove();
    }
  });
});
