/**
 * Lightweight SVG graph renderer for the story-line editor.
 *
 * A plain-DOM module: no Phaser, no framework and no new runtime dependency.
 * It takes the render-ready {@link EditorViewModel} and produces an SVG picture
 * of the manifest — one column per story-line group, choice cards drawn as
 * diamonds and plain incidents as rounded rectangles, cycle edges and cycle
 * members highlighted, option labels on the links — with pan/zoom and node
 * selection.
 *
 * The renderer is intentionally reload-free: the whole graph is built from the
 * one view model it is given (the page fetches the manifest once), so
 * interacting with it never round-trips to the host.
 *
 * Everything the browser tests assert is exposed deliberately: `data-node-id`
 * and `data-edge` markers, `data-cycle` / `data-has-choices` flags, a
 * `getTransform()` accessor and the `zoomBy`/`panBy`/`resetView`/`fitToView`
 * controls that back the toolbar buttons.
 *
 * @module
 */

import type {
  EditorNode,
  EditorViewModel,
} from '../../src/story-line/editor/view-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rendered node width in graph units. */
export const NODE_WIDTH = 190;
/** Rendered node height in graph units. */
export const NODE_HEIGHT = 72;
/** Horizontal gap between story-line columns. */
export const COLUMN_GAP = 120;
/** Vertical gap between rows within a column. */
export const ROW_GAP = 38;
/** Outer padding around the graph. */
export const GRAPH_PADDING = 56;
/** Length of the stub drawn for an option whose chain ends. */
export const TERMINAL_STUB = 72;
/** Smallest zoom factor the renderer allows. */
export const MIN_SCALE = 0.2;
/** Largest zoom factor the renderer allows. */
export const MAX_SCALE = 4;

/** A laid-out node: the view-model node plus its graph position. */
export interface EditorGraphNodePosition {
  readonly node: EditorNode;
  readonly x: number;
  readonly y: number;
}

/** One story-line column of the layout. */
export interface EditorGraphColumn {
  readonly storylineId: string | null;
  readonly title: string;
  readonly x: number;
  readonly width: number;
  readonly nodeIds: readonly string[];
}

/** The deterministic layout of a view model. */
export interface EditorGraphLayout {
  readonly positions: ReadonlyMap<string, EditorGraphNodePosition>;
  readonly columns: readonly EditorGraphColumn[];
  readonly width: number;
  readonly height: number;
}

/** A translate/scale view transform. */
export interface EditorGraphTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Options for {@link createGraphRenderer}. */
export interface EditorGraphRendererOptions {
  /** Called whenever the selected node changes (`null` when cleared). */
  readonly onSelect?: (nodeId: string | null) => void;
}

/** The mounted renderer's handle. */
export interface EditorGraphRenderer {
  /** The root SVG element. */
  readonly svg: SVGSVGElement;
  /** The transformed viewport group holding every node and edge. */
  readonly viewport: SVGGElement;
  /** Id of the currently selected node, or null. */
  readonly selectedNodeId: string | null;
  /** The layout used to place the nodes. */
  readonly layout: EditorGraphLayout;
  /** Selects a node (or clears the selection with `null`). */
  selectNode(nodeId: string | null): void;
  /** Zooms around the viewport centre. */
  zoomBy(factor: number): void;
  /** Translates the viewport by graph units. */
  panBy(dx: number, dy: number): void;
  /** Restores the identity transform. */
  resetView(): void;
  /** Fits the whole graph into the viewport width. */
  fitToView(): void;
  /** Returns the current translate/scale transform. */
  getTransform(): EditorGraphTransform;
  /** Removes listeners, the style block and the SVG from the container. */
  dispose(): void;
}

/** Rounds a transform component for a stable, readable attribute string. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Creates an SVG element in the SVG namespace. */
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

/**
 * Lays the view model out deterministically: one column per story-line group
 * (group order preserved), one row per card within the group.
 *
 * @param viewModel The editor view model.
 * @returns Node positions, column metadata and the graph's bounding size.
 */
export function layoutEditorGraph(viewModel: EditorViewModel): EditorGraphLayout {
  const positions = new Map<string, EditorGraphNodePosition>();
  const columns: EditorGraphColumn[] = [];
  let maxRows = 0;

  viewModel.storylines.forEach((group, columnIndex) => {
    const x = GRAPH_PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP);
    maxRows = Math.max(maxRows, group.nodes.length);
    group.nodes.forEach((node, rowIndex) => {
      positions.set(node.id, { node, x, y: GRAPH_PADDING + rowIndex * (NODE_HEIGHT + ROW_GAP) });
    });
    columns.push({
      storylineId: group.storylineId,
      title: group.title,
      x,
      width: NODE_WIDTH,
      nodeIds: group.nodeIds,
    });
  });

  const columnCount = Math.max(1, columns.length);
  const rowCount = Math.max(1, maxRows);
  const width =
    GRAPH_PADDING * 2 + columnCount * NODE_WIDTH + (columnCount - 1) * COLUMN_GAP + TERMINAL_STUB;
  const height = GRAPH_PADDING * 2 + rowCount * NODE_HEIGHT + (rowCount - 1) * ROW_GAP;

  return { positions, columns, width, height };
}

/** Builds the cubic path from a node's right edge to its target (or stub). */
function edgePath(from: EditorGraphNodePosition, to: EditorGraphNodePosition | null): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;

  if (!to) {
    const endX = startX + TERMINAL_STUB;
    return `M ${startX} ${startY} C ${startX + 32} ${startY}, ${endX - 32} ${startY}, ${endX} ${startY}`;
  }

  if (to.x > from.x) {
    const endX = to.x;
    const endY = to.y + NODE_HEIGHT / 2;
    const bend = Math.max(40, (endX - startX) / 2);
    return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
  }

  // Same column or backwards (a cycle): bow out to the right so the link is
  // visible instead of hiding behind the cards.
  const endX = to.x + NODE_WIDTH;
  const endY = to.y + NODE_HEIGHT / 2;
  const bend = Math.max(NODE_WIDTH, Math.abs(endY - startY) / 2) + 70;
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX + bend} ${endY}, ${endX} ${endY}`;
}

/** Midpoint used to place an edge's option label. */
function edgeLabelPoint(
  from: EditorGraphNodePosition,
  to: EditorGraphNodePosition | null,
): { x: number; y: number } {
  const startY = from.y + NODE_HEIGHT / 2;
  if (!to) {
    return { x: from.x + NODE_WIDTH + TERMINAL_STUB / 2, y: startY - 8 };
  }
  if (to.x > from.x) {
    return { x: (from.x + NODE_WIDTH + to.x) / 2, y: (startY + to.y + NODE_HEIGHT / 2) / 2 - 8 };
  }
  const bend = Math.max(NODE_WIDTH, Math.abs(to.y - from.y) / 2) + 70;
  return {
    x: Math.max(from.x, to.x) + NODE_WIDTH + bend * 0.72,
    y: (startY + to.y + NODE_HEIGHT / 2) / 2,
  };
}

/** The renderer's own stylesheet (scoped inside the SVG element). */
const RENDERER_STYLES = `
.editor-graph-svg { display: block; width: 100%; height: 100%; background: #12121c; cursor: grab; touch-action: none; }
.editor-graph-svg.is-panning { cursor: grabbing; }
.graph-column-bg { fill: #1a1a28; stroke: #2b2b44; stroke-width: 1; rx: 14px; }
.column-title { fill: #9aa0c0; font: 600 12px system-ui, -apple-system, sans-serif; letter-spacing: 0.06em; }
.column-count { fill: #6b7294; font: 11px system-ui, -apple-system, sans-serif; }
.graph-edge { fill: none; stroke: #5b6180; stroke-width: 1.6; }
.graph-edge.edge--random { stroke-dasharray: 4 4; }
.graph-edge.edge--cycle { stroke: #e05a5a; stroke-width: 2.4; stroke-dasharray: 7 4; }
.edge-label { fill: #b9c0dd; font: 11px system-ui, -apple-system, sans-serif; paint-order: stroke; stroke: #12121c; stroke-width: 3px; }
.edge-terminal { fill: #5b6180; }
.graph-node { cursor: pointer; }
.node-shape { fill: #24243a; stroke: #6f78a8; stroke-width: 1.5; }
.node--choice .node-shape { fill: #2c2440; stroke: #b98cff; stroke-width: 2; }
.node--cycle .node-shape { stroke: #e05a5a; }
.graph-node.is-selected .node-shape { stroke: #ffd166; stroke-width: 3; }
.node-name { fill: #f2f3fa; font: 600 13px system-ui, -apple-system, sans-serif; }
.node-id { fill: #9aa0c0; font: 10px ui-monospace, SFMono-Regular, monospace; }
.node-kind { fill: #b98cff; font: 9px system-ui, -apple-system, sans-serif; letter-spacing: 0.08em; }
`;

/**
 * Mounts the SVG graph renderer into a container.
 *
 * @param container The element to render into (its content is replaced).
 * @param viewModel The render-ready view model to draw.
 * @param options   Optional selection callback.
 * @returns The renderer handle.
 */
export function createGraphRenderer(
  container: HTMLElement,
  viewModel: EditorViewModel,
  options: EditorGraphRendererOptions = {},
): EditorGraphRenderer {
  const layout = layoutEditorGraph(viewModel);
  container.replaceChildren();

  const svg = svgEl('svg');
  svg.setAttribute('class', 'editor-graph-svg');
  svg.setAttribute('data-role', 'graph-svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Story-line graph for ${viewModel.gameId}`);

  const style = svgEl('style');
  style.textContent = RENDERER_STYLES;
  svg.append(style);

  const viewport = svgEl('g');
  viewport.setAttribute('class', 'graph-viewport');
  viewport.setAttribute('data-role', 'graph-viewport');
  svg.append(viewport);

  let transform: EditorGraphTransform = { scale: 1, x: 0, y: 0 };
  const applyTransform = (): void => {
    viewport.setAttribute(
      'transform',
      `translate(${round(transform.x)} ${round(transform.y)}) scale(${round(transform.scale)})`,
    );
  };
  applyTransform();

  // ── Story-line columns (grouping) ──────────────────────────
  const columnHeight = Math.max(NODE_HEIGHT, layout.height - GRAPH_PADDING * 2 + 40);
  for (const column of layout.columns) {
    const group = svgEl('g');
    group.setAttribute('class', 'graph-column');
    group.setAttribute('data-storyline-id', column.storylineId ?? '');
    group.setAttribute('data-role', 'graph-column');

    const background = svgEl('rect');
    background.setAttribute('class', 'graph-column-bg');
    background.setAttribute('x', String(column.x - 16));
    background.setAttribute('y', String(GRAPH_PADDING - 38));
    background.setAttribute('width', String(column.width + 32));
    background.setAttribute('height', String(columnHeight + 20));
    group.append(background);

    const title = svgEl('text');
    title.setAttribute('class', 'column-title');
    title.setAttribute('x', String(column.x));
    title.setAttribute('y', String(GRAPH_PADDING - 20));
    title.textContent = column.title;
    group.append(title);

    const count = svgEl('text');
    count.setAttribute('class', 'column-count');
    count.setAttribute('x', String(column.x));
    count.setAttribute('y', String(GRAPH_PADDING - 6));
    count.textContent = `${column.nodeIds.length} card${column.nodeIds.length === 1 ? '' : 's'}`;
    group.append(count);

    viewport.append(group);
  }

  // ── Edges (drawn under the nodes) ──────────────────────────
  const edgeLayer = svgEl('g');
  edgeLayer.setAttribute('class', 'graph-edge-layer');
  edgeLayer.setAttribute('data-role', 'graph-edges');
  viewport.append(edgeLayer);

  for (const edge of viewModel.edges) {
    const from = layout.positions.get(edge.from);
    if (!from) continue;
    const to = edge.to === null ? null : (layout.positions.get(edge.to) ?? null);
    if (edge.to !== null && to === null) continue;

    const classes = ['graph-edge'];
    if (edge.random) classes.push('edge--random');
    if (edge.cycle) classes.push('edge--cycle');
    if (edge.to === null) classes.push('edge--terminal');

    const path = svgEl('path');
    path.setAttribute('class', classes.join(' '));
    path.setAttribute('d', edgePath(from, to));
    path.setAttribute('data-edge', 'true');
    path.setAttribute('data-edge-from', edge.from);
    path.setAttribute('data-edge-to', edge.to ?? '');
    path.setAttribute('data-edge-label', edge.label);
    path.setAttribute('data-cycle', String(edge.cycle));
    path.setAttribute('data-random', String(edge.random));
    path.setAttribute('data-candidate-index', String(edge.candidateIndex));
    edgeLayer.append(path);

    if (edge.to === null) {
      const terminal = svgEl('circle');
      terminal.setAttribute('class', 'edge-terminal');
      terminal.setAttribute('cx', String(from.x + NODE_WIDTH + TERMINAL_STUB));
      terminal.setAttribute('cy', String(from.y + NODE_HEIGHT / 2));
      terminal.setAttribute('r', '4');
      edgeLayer.append(terminal);
    }

    const labelPoint = edgeLabelPoint(from, to);
    const label = svgEl('text');
    label.setAttribute('class', 'edge-label');
    label.setAttribute('x', String(labelPoint.x));
    label.setAttribute('y', String(labelPoint.y));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('data-role', 'edge-label');
    label.textContent = edge.random
      ? `${edge.label} (${edge.candidateIndex + 1})`
      : edge.label;
    edgeLayer.append(label);
  }

  // ── Nodes ──────────────────────────────────────────────────
  const nodeLayer = svgEl('g');
  nodeLayer.setAttribute('class', 'graph-node-layer');
  nodeLayer.setAttribute('data-role', 'graph-nodes');
  viewport.append(nodeLayer);

  const nodeElements = new Map<string, SVGGElement>();
  for (const position of layout.positions.values()) {
    const { node, x, y } = position;
    const classes = ['graph-node', node.hasChoices ? 'node--choice' : 'node--incident'];
    if (node.inCycle) classes.push('node--cycle');

    const group = svgEl('g');
    group.setAttribute('class', classes.join(' '));
    group.setAttribute('transform', `translate(${x} ${y})`);
    group.setAttribute('data-node-id', node.id);
    group.setAttribute('data-role', 'graph-node');
    group.setAttribute('data-has-choices', String(node.hasChoices));
    group.setAttribute('data-in-cycle', String(node.inCycle));
    group.setAttribute('data-storyline-id', node.storylineId ?? '');

    if (node.hasChoices) {
      const shape = svgEl('polygon');
      shape.setAttribute('class', 'node-shape');
      shape.setAttribute(
        'points',
        `${NODE_WIDTH / 2},0 ${NODE_WIDTH},${NODE_HEIGHT / 2} ${NODE_WIDTH / 2},${NODE_HEIGHT} 0,${NODE_HEIGHT / 2}`,
      );
      group.append(shape);
    } else {
      const shape = svgEl('rect');
      shape.setAttribute('class', 'node-shape');
      shape.setAttribute('width', String(NODE_WIDTH));
      shape.setAttribute('height', String(NODE_HEIGHT));
      shape.setAttribute('rx', '12');
      group.append(shape);
    }

    const name = svgEl('text');
    name.setAttribute('class', 'node-name');
    name.setAttribute('x', String(NODE_WIDTH / 2));
    name.setAttribute('y', String(NODE_HEIGHT / 2 - 4));
    name.setAttribute('text-anchor', 'middle');
    name.textContent = node.name;
    group.append(name);

    const id = svgEl('text');
    id.setAttribute('class', 'node-id');
    id.setAttribute('x', String(NODE_WIDTH / 2));
    id.setAttribute('y', String(NODE_HEIGHT / 2 + 12));
    id.setAttribute('text-anchor', 'middle');
    id.textContent = node.id;
    group.append(id);

    const kind = svgEl('text');
    kind.setAttribute('class', 'node-kind');
    kind.setAttribute('x', String(NODE_WIDTH / 2));
    kind.setAttribute('y', String(node.hasChoices ? NODE_HEIGHT - 16 : NODE_HEIGHT - 10));
    kind.setAttribute('text-anchor', 'middle');
    kind.textContent = node.hasChoices ? `CHOICE · ${node.optionCount}` : 'INCIDENT';
    group.append(kind);

    group.addEventListener('click', () => {
      selectNode(node.id);
    });

    nodeLayer.append(group);
    nodeElements.set(node.id, group);
  }

  container.append(svg);

  // ── Selection ──────────────────────────────────────────────
  let selectedNodeId: string | null = null;
  function selectNode(nodeId: string | null): void {
    if (selectedNodeId !== null) {
      nodeElements.get(selectedNodeId)?.classList.remove('is-selected');
    }
    selectedNodeId = nodeId;
    if (selectedNodeId !== null) {
      nodeElements.get(selectedNodeId)?.classList.add('is-selected');
    }
    options.onSelect?.(selectedNodeId);
  }

  // ── Pan / zoom ─────────────────────────────────────────────
  function zoomAt(factor: number, originX: number, originY: number): void {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * factor));
    const ratio = nextScale / transform.scale;
    transform = {
      scale: nextScale,
      x: originX - (originX - transform.x) * ratio,
      y: originY - (originY - transform.y) * ratio,
    };
    applyTransform();
  }

  function viewportCentre(): { x: number; y: number } {
    return { x: svg.clientWidth / 2 || layout.width / 2, y: svg.clientHeight / 2 || layout.height / 2 };
  }

  function zoomBy(factor: number): void {
    const centre = viewportCentre();
    zoomAt(factor, centre.x, centre.y);
  }

  function panBy(dx: number, dy: number): void {
    transform = { ...transform, x: transform.x + dx, y: transform.y + dy };
    applyTransform();
  }

  function resetView(): void {
    transform = { scale: 1, x: 0, y: 0 };
    applyTransform();
  }

  function fitToView(): void {
    const width = svg.clientWidth || layout.width;
    const height = svg.clientHeight || layout.height;
    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(width / layout.width, height / layout.height) * 0.94),
    );
    transform = {
      scale,
      x: (width - layout.width * scale) / 2,
      y: (height - layout.height * scale) / 2,
    };
    applyTransform();
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
  };

  let drag: { pointerId: number; x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest('[data-node-id]')) {
      return;
    }
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    svg.classList.add('is-panning');
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events (tests) have no active pointer to capture.
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    panBy(event.clientX - drag.x, event.clientY - drag.y);
    drag = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    svg.classList.remove('is-panning');
    try {
      svg.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing captured (see onPointerDown).
    }
  };

  svg.addEventListener('wheel', onWheel);
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);

  return {
    svg,
    viewport,
    layout,
    get selectedNodeId() {
      return selectedNodeId;
    },
    selectNode,
    zoomBy,
    panBy,
    resetView,
    fitToView,
    getTransform: () => ({ ...transform }),
    dispose: () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
      nodeElements.clear();
      svg.remove();
    },
  };
}
