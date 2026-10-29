/**
 * Story-line editor page shell.
 *
 * Builds the editor's layout around the SVG graph renderer: a toolbar with
 * zoom controls, the graph itself, a story-line legend and a details sidebar
 * that shows the selected card's links and metadata (name, effect, routing,
 * successor targets, story-line id/title and the adapter-declared columns).
 *
 * The shell is a plain-DOM module with no *host* dependency: it is handed one
 * generated manifest and renders everything from that single in-memory model,
 * which is why the browser tests can mount it directly and assert the rendered
 * graph and selection behaviour without a dev server.
 *
 * When it is also handed the game's content adapter, the raw content cards and
 * the edit bridge (the host serves all three), the shell additionally exposes
 * the curated editing workflow: an **Edit card** action for the selected node,
 * an **Add card** action, and a **Manage story-lines** action, each mounting
 * the corresponding form (see `edit-forms.ts` / `add-card-form.ts` /
 * `storyline-manager.ts`) whose preview, validation and apply all run through
 * the F2 bridge — the shell itself never writes content.
 *
 * @module
 */

import type { StorylineManifest } from '../../src/story-line/content/manifest';
import { baseIdOf, type ContentAdapter, type ContentCard } from '../../src/story-line/content/types';
import {
  buildEditorViewModel,
  type EditorViewModel,
} from '../../src/story-line/editor/view-model';
import {
  createGraphRenderer,
  type EditorGraphRenderer,
} from './graph-renderer';
import type { EditApplyOutcome, EditorBridge } from './bridge-client';
import { createCardEditForm } from './edit-forms';
import { createAddCardForm } from './add-card-form';
import {
  createStorylineManager,
  type StorylineManagerHandle,
} from './storyline-manager';

/** Anything the editing host can mount (a card form or the story-line manager). */
interface FormHandle {
  readonly root: HTMLElement;
  dispose(): void;
}

/** Optional editing wiring (the host supplies all three together). */
export interface EditorShellOptions {
  /** The game content adapter (drives the curated form fields). */
  readonly adapter?: ContentAdapter;
  /** The raw content cards behind the manifest nodes (editable values). */
  readonly cards?: readonly ContentCard[];
  /** The edit bridge (preview/validate/apply through the single author API). */
  readonly bridge?: EditorBridge;
  /** Called after an accepted edit (the page may remount with fresh content). */
  readonly onApplied?: (outcome: EditApplyOutcome) => void;
}

/** The mounted shell's handle. */
export interface EditorShell {
  /** The mounted root element. */
  readonly root: HTMLElement;
  /** The view model the shell rendered. */
  readonly viewModel: EditorViewModel;
  /** The graph renderer inside the shell. */
  readonly renderer: EditorGraphRenderer;
  /** Selects a card (or clears the selection with `null`). */
  selectNode(nodeId: string | null): void;
  /** Opens the edit form for a card (no-op unless editing is wired). */
  openEditForm(nodeId: string): void;
  /** Opens the guided add-card form (no-op unless editing is wired). */
  openAddForm(): void;
  /**
   * Opens the story-line management panel (no-op unless editing is wired).
   *
   * @returns The mounted manager, so callers/tests can drive it directly.
   */
  openStorylineManager(): StorylineManagerHandle | null;
  /** Closes any open edit/add/management form. */
  closeEditor(): void;
  /** Removes the shell's DOM and listeners from the container. */
  dispose(): void;
}

/** Creates a plain HTML element with an optional class and text. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Mounts the editor shell into a container.
 *
 * @param container The element to render into (its content is replaced).
 * @param manifest  The generated story-line manifest to display.
 * @param options   Optional editing wiring (adapter + content cards + bridge).
 * @returns The shell handle.
 */
export function mountEditorShell(
  container: HTMLElement,
  manifest: StorylineManifest,
  options: EditorShellOptions = {},
): EditorShell {
  const viewModel = buildEditorViewModel(manifest);
  container.replaceChildren();
  const editing =
    options.adapter && options.cards && options.bridge
      ? { adapter: options.adapter, cards: options.cards, bridge: options.bridge }
      : null;
  const knownCardIds = viewModel.nodes.map((node) => node.id);
  let openForm: FormHandle | null = null;
  let selectedNodeId: string | null = null;

  const root = el('div', 'editor-shell');
  root.dataset.role = 'editor-shell';

  // ── Toolbar ────────────────────────────────────────────────
  const toolbar = el('header', 'editor-toolbar');
  toolbar.dataset.role = 'toolbar';

  const titleBlock = el('div', 'editor-toolbar-title');
  titleBlock.append(el('h1', 'editor-title', 'Story-line editor'));
  const summary = el('p', 'editor-summary');
  summary.dataset.role = 'graph-summary';
  summary.textContent = [
    `${viewModel.nodes.length} card${viewModel.nodes.length === 1 ? '' : 's'}`,
    `${viewModel.edges.length} link${viewModel.edges.length === 1 ? '' : 's'}`,
    `${viewModel.storylines.length} story-line${viewModel.storylines.length === 1 ? '' : 's'}`,
    `${viewModel.cycles.length} cycle${viewModel.cycles.length === 1 ? '' : 's'}`,
  ].join(' · ');
  titleBlock.append(summary);
  toolbar.append(titleBlock);

  const actions = el('div', 'editor-toolbar-actions');
  const zoomIn = el('button', 'editor-button', 'Zoom in');
  zoomIn.type = 'button';
  zoomIn.dataset.action = 'zoom-in';
  const zoomOut = el('button', 'editor-button', 'Zoom out');
  zoomOut.type = 'button';
  zoomOut.dataset.action = 'zoom-out';
  const resetView = el('button', 'editor-button', 'Reset view');
  resetView.type = 'button';
  resetView.dataset.action = 'reset-view';
  const fitView = el('button', 'editor-button', 'Fit view');
  fitView.type = 'button';
  fitView.dataset.action = 'fit-view';
  const addCardButton = el('button', 'editor-button editor-button--primary', 'Add card');
  addCardButton.type = 'button';
  addCardButton.dataset.action = 'add-card';
  const manageStorylinesButton = el(
    'button',
    'editor-button',
    'Manage story-lines',
  );
  manageStorylinesButton.type = 'button';
  manageStorylinesButton.dataset.action = 'manage-storylines';
  actions.append(
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    ...(editing ? [manageStorylinesButton, addCardButton] : []),
  );
  toolbar.append(actions);
  root.append(toolbar);

  const readOnlyNote = el(
    'p',
    'editor-readonly-note',
    editing
      ? 'Editing is enabled — every edit is previewed and validated before it is written through the author API.'
      : 'Read-only preview — rendered from the generated manifest. Launch the editor with "npm run storylines:editor" to edit.',
  );
  readOnlyNote.dataset.role = 'readonly-note';
  root.append(readOnlyNote);

  // ── Main region: graph + details sidebar ───────────────────
  const main = el('div', 'editor-main');
  const graphRegion = el('div', 'editor-graph');
  graphRegion.dataset.region = 'graph';
  const sidebar = el('aside', 'editor-sidebar');
  sidebar.dataset.region = 'sidebar';

  sidebar.append(el('h2', 'editor-sidebar-title', 'Card details'));

  const empty = el(
    'p',
    'editor-sidebar-empty',
    'Select a card in the graph to inspect its links and metadata.',
  );
  empty.dataset.role = 'details-empty';

  const details = el('div', 'editor-details');
  details.dataset.role = 'details';
  details.hidden = true;

  const detailsName = el('h3', 'editor-details-name');
  detailsName.dataset.role = 'details-name';
  const detailsId = el('p', 'editor-details-id');
  detailsId.dataset.role = 'details-id';
  const detailsKind = el('p', 'editor-details-kind');
  detailsKind.dataset.role = 'details-kind';
  const detailsStoryline = el('p', 'editor-details-storyline');
  detailsStoryline.dataset.role = 'details-storyline';

  const meta = el('dl', 'editor-details-meta');
  const metaPieces: Array<[label: string, role: string]> = [
    ['Effect', 'details-effect'],
    ['Impact', 'details-impact'],
    ['Routing', 'details-routing'],
  ];
  const metaValues = new Map<string, HTMLElement>();
  for (const [label, role] of metaPieces) {
    meta.append(el('dt', undefined, label));
    const value = el('dd');
    value.dataset.role = role;
    metaValues.set(role, value);
    meta.append(value);
  }

  details.append(detailsName, detailsId, detailsKind, detailsStoryline, meta);

  // ── Editing affordance (present only when the host wired the bridge) ──
  const editCardButton = el('button', 'editor-button editor-button--primary', 'Edit card');
  editCardButton.type = 'button';
  editCardButton.dataset.role = 'edit-card';
  const editActions = el('div', 'editor-details-actions');
  editActions.append(editCardButton);
  if (editing) details.append(editActions);

  details.append(el('h4', 'editor-details-section', 'Links'));
  const links = el('ul', 'editor-links');
  links.dataset.role = 'details-links';
  const noLinks = el('p', 'editor-details-note', 'No outgoing links (the chain ends here).');
  noLinks.dataset.role = 'details-no-links';
  details.append(links, noLinks);

  details.append(el('h4', 'editor-details-section', 'Reached from'));
  const incoming = el('ul', 'editor-links');
  incoming.dataset.role = 'details-incoming';
  const noIncoming = el('p', 'editor-details-note', 'No incoming links (this is an entry point).');
  noIncoming.dataset.role = 'details-no-incoming';
  details.append(incoming, noIncoming);

  details.append(el('h4', 'editor-details-section', 'Adapter columns'));
  const fields = el('dl', 'editor-fields');
  fields.dataset.role = 'details-fields';
  const noFields = el('p', 'editor-details-note', 'This card has no adapter columns.');
  noFields.dataset.role = 'details-no-fields';
  details.append(fields, noFields);

  sidebar.append(empty, details);

  // ── Editing host: the curated edit/add form mounts here ──
  const editorHost = el('section', 'editor-editor-host');
  editorHost.dataset.region = 'editor';
  editorHost.hidden = true;
  const editorHostHeading = el('div', 'editor-editor-host-header');
  const editorHostTitle = el('h3', 'editor-editor-host-title', 'Editing');
  editorHostTitle.dataset.role = 'editor-host-title';
  const closeEditorButton = el('button', 'editor-button', 'Close');
  closeEditorButton.type = 'button';
  closeEditorButton.dataset.role = 'close-editor';
  editorHostHeading.append(editorHostTitle, closeEditorButton);
  editorHost.append(editorHostHeading);
  const editorFormHost = el('div', 'editor-editor-form-host');
  editorFormHost.dataset.role = 'editor-form-host';
  editorHost.append(editorFormHost);
  sidebar.append(editorHost);

  main.append(graphRegion, sidebar);
  root.append(main);

  // ── Story-line legend ──────────────────────────────────────
  const legend = el('footer', 'editor-legend');
  legend.append(el('h2', 'editor-legend-title', 'Story-lines'));
  const legendList = el('ul', 'editor-legend-items');
  legendList.dataset.role = 'storyline-legend';
  legend.append(legendList);
  root.append(legend);

  container.append(root);

  // ── Graph ──────────────────────────────────────────────────
  const renderer = createGraphRenderer(graphRegion, viewModel, {
    onSelect: (nodeId) => {
      selectedNodeId = nodeId;
      renderDetails(nodeId);
    },
  });

  const nodeById = new Map(viewModel.nodes.map((node) => [node.id, node]));

  function renderDetails(nodeId: string | null): void {
    const node = nodeId === null ? undefined : nodeById.get(nodeId);
    empty.hidden = node !== undefined;
    details.hidden = node === undefined;
    if (!node) return;

    detailsName.textContent = node.name;
    detailsId.textContent = node.id;
    detailsKind.textContent = node.hasChoices
      ? `Choice card · ${node.optionCount} option${node.optionCount === 1 ? '' : 's'}`
      : 'Plain incident';
    detailsStoryline.textContent = node.storylineId
      ? `Story-line: ${node.storylineTitle ?? node.storylineId} (${node.storylineId})`
      : 'Story-line: none';
    metaValues.get('details-effect')!.textContent = node.effect;
    metaValues.get('details-impact')!.textContent = node.impact || '—';
    metaValues.get('details-routing')!.textContent = node.labels.routing;

    links.replaceChildren();
    for (const link of node.successors) {
      const item = el('li', 'editor-link-item');
      item.dataset.linkTo = link.targetId ?? '';
      item.dataset.linkLabel = link.label;
      item.dataset.linkPolicy = link.effectPolicy;
      item.dataset.linkRandom = String(link.random);
      item.dataset.linkCycle = String(link.cycle);
      const policy = link.effectPolicy === 'apply' ? 'effect applies' : 'effect skipped';
      const random = link.random ? ` · random ${link.candidateIndex + 1}` : '';
      const cycle = link.cycle ? ' · cycle' : '';
      item.textContent = `${link.label} → ${link.targetName} (${policy}${random}${cycle})`;
      links.append(item);
    }
    links.hidden = node.successors.length === 0;
    noLinks.hidden = node.successors.length > 0;

    incoming.replaceChildren();
    for (const link of node.predecessors) {
      const item = el('li', 'editor-link-item');
      item.dataset.linkFrom = link.fromId;
      item.dataset.linkLabel = link.label;
      item.dataset.linkCycle = String(link.cycle);
      item.textContent = `${link.fromName} · ${link.label}${link.cycle ? ' · cycle' : ''}`;
      incoming.append(item);
    }
    incoming.hidden = node.predecessors.length === 0;
    noIncoming.hidden = node.predecessors.length > 0;

    fields.replaceChildren();
    const columns = Object.keys(node.fields).sort();
    for (const column of columns) {
      const row = el('div', 'editor-field-row');
      row.dataset.field = column;
      row.append(el('dt', undefined, column));
      row.append(el('dd', undefined, node.fields[column] ?? ''));
      fields.append(row);
    }
    fields.hidden = columns.length === 0;
    noFields.hidden = columns.length > 0;
  }

  // ── Legend ─────────────────────────────────────────────────
  for (const group of viewModel.storylines) {
    const key = group.storylineId ?? '';
    const item = el('li', 'editor-legend-item');
    item.dataset.storylineId = key;
    item.dataset.role = 'storyline-legend-item';
    item.append(el('span', 'editor-legend-swatch'));
    item.append(
      el(
        'span',
        'editor-legend-label',
        `${group.title} · ${group.nodeIds.length} card${group.nodeIds.length === 1 ? '' : 's'}`,
      ),
    );
    item.hidden = group.storylineId === null;
    if (group.storylineId !== null) {
      item.addEventListener('click', () => {
        const first = group.nodeIds[0];
        if (first) renderer.selectNode(first);
      });
    }
    legendList.append(item);
  }

  // ── Toolbar wiring ─────────────────────────────────────────
  const onZoomIn = (): void => renderer.zoomBy(1.25);
  const onZoomOut = (): void => renderer.zoomBy(1 / 1.25);
  const onReset = (): void => renderer.resetView();
  const onFit = (): void => renderer.fitToView();
  zoomIn.addEventListener('click', onZoomIn);
  zoomOut.addEventListener('click', onZoomOut);
  resetView.addEventListener('click', onReset);
  fitView.addEventListener('click', onFit);

  // ── Editing wiring ─────────────────────────────────────────
  function closeEditor(): void {
    openForm?.dispose();
    openForm = null;
    editorFormHost.replaceChildren();
    editorHost.hidden = true;
  }

  function openEditingForm(form: FormHandle, title: string): void {
    closeEditor();
    openForm = form;
    editorHostTitle.textContent = title;
    editorFormHost.append(form.root);
    editorHost.hidden = false;
  }

  function openEditForm(nodeId: string): void {
    if (!editing) return;
    const card = editing.cards.find(
      (candidate) => baseIdOf(editing.adapter, candidate.id) === nodeId,
    );
    if (!card) {
      openEditingFormContents(
        el('p', 'editor-details-note', `Card "${nodeId}" is not in the loaded content.`),
        'Editing',
      );
      return;
    }
    const form = createCardEditForm({
      adapter: editing.adapter,
      card,
      bridge: editing.bridge,
      knownCardIds,
      onApplied: (outcome) => options.onApplied?.(outcome),
    });
    openEditingForm(form, `Edit ${card.name}`);
  }

  function openAddForm(): void {
    if (!editing) return;
    const storylines = viewModel.storylines
      .filter((group) => group.storylineId !== null)
      .map((group) => ({ id: group.storylineId as string, title: group.title }));
    const form = createAddCardForm({
      adapter: editing.adapter,
      bridge: editing.bridge,
      storylines,
      knownCardIds,
      onApplied: (outcome) => options.onApplied?.(outcome),
    });
    openEditingForm(form, 'Add a card');
  }

  /**
   * Opens the story-line management panel: the manifest's story-line groups and
   * member cards, backed by the same bridge as the card forms. Creating,
   * renaming and reassigning all write one validated batch through it.
   */
  function openStorylineManager(): StorylineManagerHandle | null {
    if (!editing) return null;
    const groups = viewModel.storylines
      .filter((group) => group.storylineId !== null)
      .map((group) => ({ storylineId: group.storylineId as string, title: group.title }));
    const members = viewModel.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      storylineId: node.storylineId,
      storylineTitle: node.storylineTitle,
    }));
    const manager = createStorylineManager({
      groups,
      members,
      bridge: editing.bridge,
      ...(options.onApplied ? { onApplied: options.onApplied } : {}),
    });
    openEditingForm(manager, 'Manage story-lines');
    return manager;
  }

  /** Replaces the editor host's content with a plain message panel. */
  function openEditingFormContents(content: HTMLElement, title: string): void {
    closeEditor();
    editorHostTitle.textContent = title;
    editorFormHost.append(content);
    editorHost.hidden = false;
  }

  const onCloseEditor = (): void => closeEditor();
  closeEditorButton.addEventListener('click', onCloseEditor);
  const onEditCard = (): void => {
    if (selectedNodeId !== null) openEditForm(selectedNodeId);
  };
  editCardButton.addEventListener('click', onEditCard);
  const onAddCard = (): void => openAddForm();
  addCardButton.addEventListener('click', onAddCard);
  const onManageStorylines = (): void => {
    openStorylineManager();
  };
  manageStorylinesButton.addEventListener('click', onManageStorylines);

  return {
    root,
    viewModel,
    renderer,
    selectNode: (nodeId) => renderer.selectNode(nodeId),
    openEditForm,
    openAddForm,
    openStorylineManager,
    closeEditor,
    dispose: () => {
      zoomIn.removeEventListener('click', onZoomIn);
      zoomOut.removeEventListener('click', onZoomOut);
      resetView.removeEventListener('click', onReset);
      fitView.removeEventListener('click', onFit);
      closeEditorButton.removeEventListener('click', onCloseEditor);
      editCardButton.removeEventListener('click', onEditCard);
      addCardButton.removeEventListener('click', onAddCard);
      manageStorylinesButton.removeEventListener('click', onManageStorylines);
      closeEditor();
      renderer.dispose();
      container.replaceChildren();
    },
  };
}
