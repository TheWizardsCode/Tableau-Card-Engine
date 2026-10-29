/**
 * Story-line management UI (F4).
 *
 * A story-line has no declaration of its own: it exists implicitly through the
 * member cards that declare its id and title. So "managing" a story-line is
 * always a **batch edit of its member cards' storyline fields**, and this panel
 * is the story-line-level counterpart of the curated card forms:
 *
 * - **List** — every group the generated manifest reports (its `storylineIds`
 *   plus the members' `storylineId`/`storylineTitle`), followed by any group
 *   created in this session that the manifest cannot show yet because it has no
 *   member cards.
 * - **Create** — register a new id/title group. With member cards selected the
 *   grouping is written immediately as one validated batch; without members it
 *   stays in-session until cards are moved into it (nothing to write).
 * - **Rename** — retitle (and optionally re-id) a group by applying the new
 *   story-line fields to **every** member card in one batch.
 * - **Reassign** — move the selected member cards into another group.
 *
 * Every operation that changes content is one {@link EditorEdit} of kind
 * `set-storyline-batch`: applied in memory and validated **once** for the whole
 * batch before the first write, then written **once** through the F2 bridge and
 * the single transactional author API. No per-card write loop exists here, so
 * renaming a four-member group can never become four author-API calls.
 *
 * The pure model (group derivation, draft validation, edit construction) is
 * exported separately from the DOM so the operations are unit-testable without
 * a browser, and the same builders drive the panel.
 *
 * **Session-only state.** A pending group lives in this panel's memory. The
 * page remounts the shell after every accepted write (so the graph and the
 * groups come from the regenerated manifest), which drops any *other* pending
 * group created earlier in the session — only unwritten groups are affected,
 * and writing one is what makes it durable.
 *
 * Plain DOM, no Node, no Phaser: the panel is mounted into the page or a
 * browser-test document and talks to the F2 bridge through the injected
 * {@link EditorBridge}.
 *
 * @module
 */

import type { EditorEdit } from '../../src/story-line/editor/api';
import type { EditApplyOutcome, EditorBridge } from './bridge-client';
import { createPreviewPanel, type PreviewPanelHandle } from './preview-panel';

// ── Pure model ──────────────────────────────────────────────

/** A story-line group the generated manifest reports. */
export interface StorylineGroupSource {
  /** The story-line id its member cards declare. */
  readonly storylineId: string;
  /** Display title (the manifest falls back to the id when untitled). */
  readonly title: string;
}

/** One card that can be a story-line member. */
export interface StorylineMemberSource {
  /** Base card id (chain serials stripped). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** The story-line the card declares, or null. */
  readonly storylineId: string | null;
  /** The story-line title the card declares, or null. */
  readonly storylineTitle: string | null;
}

/** A group created in the editor session (it has no manifest presence yet). */
export interface CreatedStorylineGroup extends StorylineGroupSource {
  /** True once the group's membership has been written through the bridge. */
  readonly written: boolean;
}

/** One render-ready story-line group with its member cards. */
export interface StorylineGroupView {
  /** The story-line id. */
  readonly storylineId: string;
  /** Display title. */
  readonly title: string;
  /** Member cards, in manifest node order. */
  readonly members: readonly StorylineMemberSource[];
  /**
   * True when the group exists only in this session: it has no member cards yet,
   * so there is no content row through which it could be written.
   */
  readonly pending: boolean;
}

/** A story-line id/title draft (create or rename). */
export interface StorylineDraft {
  /** The story-line id. */
  readonly id: string;
  /** The display title. */
  readonly title: string;
}

/** Why a story-line draft is not acceptable (checked before any write). */
export type StorylineDraftErrorCode = 'missing-id' | 'missing-title' | 'duplicate-id';

/** One draft validation error. */
export interface StorylineDraftError {
  /** Stable machine-readable code. */
  readonly code: StorylineDraftErrorCode;
  /** Actionable message (rendered verbatim). */
  readonly message: string;
}

/**
 * Derives the rendered story-line list from the manifest's groups and members,
 * plus any group created in this session.
 *
 * A manifest group always has members (a story-line id exists only because a
 * card declares it), so a declared group that has lost every member — for
 * example because a rename re-id'd all of them in this session — is dropped.
 * A session-created group is kept while it is pending (nothing written) even
 * with no members, so the author can create a group first and populate it next.
 *
 * @param groups  Groups reported by the manifest.
 * @param members Every card that may be a member, in manifest order.
 * @param created Groups created in this editor session.
 * @returns The groups to render, declared groups first.
 */
export function buildStorylineGroups(
  groups: readonly StorylineGroupSource[],
  members: readonly StorylineMemberSource[],
  created: readonly CreatedStorylineGroup[] = [],
): StorylineGroupView[] {
  const views: StorylineGroupView[] = [];
  const seen = new Set<string>();

  const add = (group: StorylineGroupSource, pending: boolean): void => {
    if (seen.has(group.storylineId)) return;
    const groupMembers = members.filter(
      (member) => member.storylineId === group.storylineId,
    );
    // A written group exists only through its member cards; a pending group
    // (created in-session, not yet written) is the one exception.
    if (!pending && groupMembers.length === 0) return;
    seen.add(group.storylineId);
    views.push({
      storylineId: group.storylineId,
      title: group.title,
      members: groupMembers,
      pending,
    });
  };

  for (const group of groups) add(group, false);
  for (const group of created) {
    add({ storylineId: group.storylineId, title: group.title }, !group.written);
  }
  return views;
}

/**
 * Validates a create/rename draft before it reaches the bridge.
 *
 * These are the authoring errors the content validator cannot report (a
 * story-line has no row of its own), so they are caught here and rendered
 * inline instead of being posted as an edit:
 *
 * - the id is required (it is how member cards declare membership);
 * - the title is required (a group is always authored and displayed with one);
 * - the id must be unique across the groups the editor knows about.
 *
 * @param draft      The id/title being authored.
 * @param existingIds Ids already used by other groups.
 * @param options    `allowId` exempts the group being renamed from the check.
 * @returns The errors (empty when the draft is acceptable).
 */
export function validateStorylineDraft(
  draft: StorylineDraft,
  existingIds: readonly string[],
  options: { readonly allowId?: string } = {},
): StorylineDraftError[] {
  const errors: StorylineDraftError[] = [];
  const id = draft.id.trim();
  const title = draft.title.trim();

  if (id === '') {
    errors.push({ code: 'missing-id', message: 'A story-line id is required.' });
  }
  if (title === '') {
    errors.push({ code: 'missing-title', message: 'A story-line title is required.' });
  }

  const taken = existingIds
    .map((existing) => existing.trim())
    .filter((existing) => existing !== options.allowId);
  if (id !== '' && taken.includes(id)) {
    errors.push({
      code: 'duplicate-id',
      message: `Story-line id "${id}" is already used by another group.`,
    });
  }
  return errors;
}

/**
 * Builds the single batch edit a management operation writes.
 *
 * One `set-storyline-batch` edit carries every affected member card, so the
 * author API validates the combined result once and writes the file once.
 *
 * @param memberIds      The member cards to (re)assign.
 * @param storylineId    The target story-line id.
 * @param storylineTitle The target story-line title.
 * @returns The batch edit for the bridge.
 */
export function setStorylineMembersEdit(
  memberIds: readonly string[],
  storylineId: string,
  storylineTitle: string,
): EditorEdit {
  return {
    kind: 'set-storyline-batch',
    spec: { ids: [...memberIds], storylineId, storylineTitle },
  };
}

// ── DOM ─────────────────────────────────────────────────────

/** Options for {@link createStorylineManager}. */
export interface StorylineManagerOptions {
  /** Groups reported by the generated manifest. */
  readonly groups: readonly StorylineGroupSource[];
  /** Every card that may be a story-line member (manifest nodes). */
  readonly members: readonly StorylineMemberSource[];
  /** The edit bridge (preview/validate/apply through the single author API). */
  readonly bridge: EditorBridge;
  /** Called after an accepted (written) operation. */
  readonly onApplied?: (outcome: EditApplyOutcome) => void;
}

/** The mounted manager's handle. */
export interface StorylineManagerHandle {
  /** The panel's root element. */
  readonly root: HTMLElement;
  /** The shared preview/diff and validation panel. */
  readonly previewPanel: PreviewPanelHandle;
  /** The rendered groups (declared first, then session-created). */
  groups(): readonly StorylineGroupView[];
  /** The member card ids currently selected. */
  selection(): readonly string[];
  /** Replaces the member selection (programmatic equivalent of ticking boxes). */
  setSelected(memberIds: readonly string[]): void;
  /** Creates a group, assigning the given members in one validated write. */
  createGroup(
    input: StorylineDraft & { readonly memberIds?: readonly string[] },
  ): Promise<StorylineGroupView | null>;
  /** Renames/re-ids a group, applying the fields to every member in one write. */
  renameGroup(
    groupId: string,
    update: { readonly storylineId?: string; readonly storylineTitle?: string },
  ): Promise<EditApplyOutcome | null>;
  /** Moves the given member cards into an existing group in one write. */
  reassignMembers(
    memberIds: readonly string[],
    targetGroupId: string,
  ): Promise<EditApplyOutcome | null>;
  /** Removes the panel and its listeners from the document. */
  dispose(): void;
}

/** Creates a plain element with an optional class and text. */
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

/** Creates a labelled text control with a stable data role. */
function labelledInput(
  labelText: string,
  role: string,
  value = '',
): { readonly field: HTMLElement; readonly input: HTMLInputElement } {
  const field = el('div', 'editor-field');
  const label = el('label', 'editor-field-label', labelText);
  const input = el('input', 'editor-field-input');
  input.type = 'text';
  input.value = value;
  input.dataset.role = role;
  label.append(input);
  field.append(label);
  return { field, input };
}

/** A locally tracked group entry (the manager mutates its title/id after a write). */
interface MutableGroup {
  storylineId: string;
  title: string;
}

/** A locally tracked session-created group (mutable: it may be renamed/written). */
interface MutableCreatedGroup extends MutableGroup {
  written: boolean;
}

/**
 * Mounts the story-line management panel.
 *
 * @param options The manifest-derived groups/members and the edit bridge.
 * @returns The manager handle.
 */
export function createStorylineManager(
  options: StorylineManagerOptions,
): StorylineManagerHandle {
  let declared: MutableGroup[] = options.groups.map((group) => ({ ...group }));
  let members: StorylineMemberSource[] = options.members.map((member) => ({ ...member }));
  let created: MutableCreatedGroup[] = [];
  const selected = new Set<string>();
  let openRenameFor: string | null = null;
  let busy = false;
  let disposed = false;

  const root = el('section', 'editor-storyline-manager');
  root.dataset.role = 'storyline-manager';

  const heading = el('h3', 'editor-form-title', 'Manage story-lines');
  heading.dataset.role = 'manager-title';
  const intro = el(
    'p',
    'editor-field-hint',
    'A story-line exists through its member cards: creating, renaming and reassigning a group is one validated batch write over those cards.',
  );

  const status = el('p', 'editor-form-status', 'No story-line changes yet.');
  status.dataset.role = 'manager-status';
  const selectionSummary = el('p', 'editor-field-hint', 'No member cards selected.');
  selectionSummary.dataset.role = 'selection-summary';

  // ── Create group ──────────────────────────────────────────
  const createPanel = el('section', 'editor-storyline-create');
  createPanel.dataset.role = 'create-group-panel';
  createPanel.append(el('h4', 'editor-form-title', 'Create a group'));
  const createId = labelledInput('Story-line id', 'new-storyline-id');
  const createTitle = labelledInput('Story-line title', 'new-storyline-title');
  const createFields = el('div', 'editor-storyline-inline-fields');
  createFields.append(createId.field, createTitle.field);
  const createButton = el('button', 'editor-button editor-button--primary', 'Create group');
  createButton.type = 'button';
  createButton.dataset.action = 'create-group';
  const createActions = el('div', 'editor-form-actions');
  createActions.append(createButton);
  createPanel.append(
    createFields,
    el(
      'p',
      'editor-field-hint',
      'Select member cards below to write the new group immediately; with none selected the group stays pending until cards are moved into it.',
    ),
    createActions,
  );

  // ── Group list ────────────────────────────────────────────
  const groupsHost = el('div', 'editor-storyline-groups');
  groupsHost.dataset.role = 'storyline-groups';

  // ── Rename panel (static: inputs must survive a list refresh) ──
  const renamePanel = el('section', 'editor-storyline-create');
  renamePanel.dataset.role = 'rename-panel';
  renamePanel.hidden = true;
  const renameHeading = el('h4', 'editor-form-title', 'Rename a group');
  renameHeading.dataset.role = 'rename-heading';
  const renameId = labelledInput('Story-line id', 'rename-storyline-id');
  const renameTitle = labelledInput('Story-line title', 'rename-storyline-title');
  const renameFields = el('div', 'editor-storyline-inline-fields');
  renameFields.append(renameId.field, renameTitle.field);
  const previewRenameButton = el('button', 'editor-button', 'Preview rename');
  previewRenameButton.type = 'button';
  previewRenameButton.dataset.action = 'preview-rename';
  const applyRenameButton = el('button', 'editor-button editor-button--primary', 'Rename group');
  applyRenameButton.type = 'button';
  applyRenameButton.dataset.action = 'apply-rename';
  const cancelRenameButton = el('button', 'editor-button', 'Cancel');
  cancelRenameButton.type = 'button';
  cancelRenameButton.dataset.action = 'cancel-rename';
  const renameActions = el('div', 'editor-form-actions');
  renameActions.append(previewRenameButton, applyRenameButton, cancelRenameButton);
  renamePanel.append(
    renameHeading,
    renameFields,
    el(
      'p',
      'editor-field-hint',
      'Renaming applies the new story-line id/title to every member card in one validated write.',
    ),
    renameActions,
  );

  const previewPanel = createPreviewPanel();

  root.append(
    heading,
    intro,
    status,
    selectionSummary,
    createPanel,
    groupsHost,
    renamePanel,
    previewPanel.root,
  );

  // ── State helpers ─────────────────────────────────────────

  function allGroupIds(): string[] {
    return [...declared.map((group) => group.storylineId), ...created.map((group) => group.storylineId)];
  }

  function currentGroups(): StorylineGroupView[] {
    return buildStorylineGroups(declared, members, created);
  }

  function groupView(groupId: string): StorylineGroupView | undefined {
    return currentGroups().find((group) => group.storylineId === groupId);
  }

  function setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function updateSelectionSummary(): void {
    const count = selected.size;
    selectionSummary.textContent =
      count === 0
        ? 'No member cards selected.'
        : `${count} member card${count === 1 ? '' : 's'} selected.`;
  }

  function applyBusy(): void {
    for (const button of root.querySelectorAll('button')) button.disabled = busy;
  }

  /** Records an accepted write locally, so the list matches the written content. */
  function recordAccepted(
    memberIds: readonly string[],
    storylineId: string,
    storylineTitle: string,
  ): void {
    const ids = new Set(memberIds);
    members = members.map((member) =>
      ids.has(member.id) ? { ...member, storylineId, storylineTitle } : member,
    );

    const declaredEntry = declared.find((group) => group.storylineId === storylineId);
    if (declaredEntry) {
      declaredEntry.title = storylineTitle;
      return;
    }
    const createdEntry = created.find((group) => group.storylineId === storylineId);
    if (createdEntry) {
      createdEntry.title = storylineTitle;
      createdEntry.written = true;
      return;
    }
    created.push({ storylineId, title: storylineTitle, written: true });
  }

  // ── Write path (preview → validate → one batch apply) ─────

  async function applyBatch(
    memberIds: readonly string[],
    storylineId: string,
    storylineTitle: string,
  ): Promise<EditApplyOutcome | null> {
    const ids = [...new Set(memberIds)];
    if (ids.length === 0) {
      setStatus('Select at least one member card first.', 'error');
      return null;
    }

    const edit = setStorylineMembersEdit(ids, storylineId, storylineTitle);
    busy = true;
    renderGroups();
    applyBusy();
    try {
      // One preview for the whole batch: the combined result is validated once
      // and an invalid candidate never reaches the author API.
      const preview = await options.bridge.preview(edit);
      previewPanel.render(preview);
      if (!preview.ok) {
        setStatus(
          'Preview is invalid — the write is blocked. See the validator report for the offending card or link.',
          'error',
        );
        return null;
      }

      const outcome = await options.bridge.apply(edit);
      previewPanel.render(preview, outcome);
      if (outcome.ok) {
        recordAccepted(ids, storylineId, storylineTitle);
        setStatus(`Applied — ${outcome.message}`, 'success');
        options.onApplied?.(outcome);
      } else {
        setStatus(`Refused — ${outcome.message}`, 'error');
      }
      return outcome;
    } catch (error) {
      setStatus(`Edit failed: ${(error as Error).message}`, 'error');
      previewPanel.renderMessage(`Edit failed: ${(error as Error).message}`, 'error');
      return null;
    } finally {
      busy = false;
      renderGroups();
      updateSelectionSummary();
      applyBusy();
    }
  }

  // ── Operations ────────────────────────────────────────────

  async function createGroup(
    input: StorylineDraft & { readonly memberIds?: readonly string[] },
  ): Promise<StorylineGroupView | null> {
    if (disposed) return null;
    const id = input.id.trim();
    const title = input.title.trim();
    const errors = validateStorylineDraft({ id, title }, allGroupIds());
    if (errors.length > 0) {
      setStatus(errors.map((error) => error.message).join(' '), 'error');
      return null;
    }

    // The group is visible immediately, even before it has members.
    created.push({ storylineId: id, title, written: false });
    renderGroups();
    applyBusy();

    const memberIds = [...new Set(input.memberIds ?? [])];
    createId.input.value = '';
    createTitle.input.value = '';
    selected.clear();
    updateSelectionSummary();

    if (memberIds.length === 0) {
      setStatus(
        `Created "${title}" (${id}) in this session — select member cards and move them here to write it.`,
        'info',
      );
      previewPanel.renderMessage(
        'Nothing written yet: select member cards below, then move them into this group.',
        'info',
      );
      return groupView(id) ?? null;
    }

    const outcome = await applyBatch(memberIds, id, title);
    if (outcome?.ok) {
      setStatus(`Created "${title}" (${id}) — ${outcome.message}`, 'success');
    }
    return groupView(id) ?? null;
  }

  async function renameGroup(
    groupId: string,
    update: { readonly storylineId?: string; readonly storylineTitle?: string },
  ): Promise<EditApplyOutcome | null> {
    if (disposed) return null;
    const group = groupView(groupId);
    if (!group) {
      setStatus(`Unknown story-line "${groupId}".`, 'error');
      return null;
    }

    const id = (update.storylineId ?? group.storylineId).trim();
    const title = (update.storylineTitle ?? group.title).trim();
    const errors = validateStorylineDraft({ id, title }, allGroupIds(), {
      allowId: group.storylineId,
    });
    if (errors.length > 0) {
      setStatus(errors.map((error) => error.message).join(' '), 'error');
      return null;
    }
    if (id === group.storylineId && title === group.title) {
      setStatus('No changes — the group already has that id and title.', 'info');
      return null;
    }

    // A pending group has no content rows, so a rename stays in-session.
    if (group.members.length === 0) {
      renameLocalGroup(group.storylineId, id, title);
      renderGroups();
      applyBusy();
      setStatus(
        `Renamed the pending group to "${title}" (${id}) in this session — nothing to write yet.`,
        'info',
      );
      previewPanel.renderMessage(
        'Nothing written yet: the group has no member cards.',
        'info',
      );
      return null;
    }

    const outcome = await applyBatch(
      group.members.map((member) => member.id),
      id,
      title,
    );
    if (outcome?.ok && id !== group.storylineId) {
      // The old group no longer exists in the content: drop its local entry so
      // the list matches the regenerated manifest.
      declared = declared.filter((entry) => entry.storylineId !== group.storylineId);
      created = created.filter((entry) => entry.storylineId !== group.storylineId);
      renderGroups();
      applyBusy();
    }
    return outcome;
  }

  /** Renames a pending (unwritten) group in the session registry only. */
  function renameLocalGroup(groupId: string, id: string, title: string): void {
    const createdEntry = created.find((group) => group.storylineId === groupId);
    if (createdEntry) {
      createdEntry.storylineId = id;
      createdEntry.title = title;
      return;
    }
    const declaredEntry = declared.find((group) => group.storylineId === groupId);
    if (declaredEntry) {
      declaredEntry.storylineId = id;
      declaredEntry.title = title;
    }
  }

  async function reassignMembers(
    memberIds: readonly string[],
    targetGroupId: string,
  ): Promise<EditApplyOutcome | null> {
    if (disposed) return null;
    const target = groupView(targetGroupId);
    if (!target) {
      setStatus(`Unknown story-line "${targetGroupId}".`, 'error');
      return null;
    }

    const moves = [...new Set(memberIds)].filter((memberId) => {
      const member = members.find((candidate) => candidate.id === memberId);
      return member !== undefined && member.storylineId !== targetGroupId;
    });
    if (moves.length === 0) {
      setStatus(
        'Those cards already belong to that story-line — nothing to write.',
        'info',
      );
      return null;
    }

    selected.clear();
    updateSelectionSummary();
    const outcome = await applyBatch(moves, target.storylineId, target.title);
    if (outcome?.ok) setStatus(`Reassigned — ${outcome.message}`, 'success');
    return outcome;
  }

  // ── Rendering ─────────────────────────────────────────────

  function renderGroups(): void {
    groupsHost.replaceChildren();
    const groups = currentGroups();
    if (groups.length === 0) {
      groupsHost.append(
        el(
          'p',
          'editor-details-note',
          'No story-line groups yet — create one above, or assign a card a story-line from the card form.',
        ),
      );
      return;
    }
    for (const group of groups) groupsHost.append(renderGroup(group));
  }

  function renderGroup(group: StorylineGroupView): HTMLElement {
    const article = el('article', 'editor-storyline-group');
    article.dataset.role = 'storyline-group';
    article.dataset.storylineId = group.storylineId;
    article.dataset.pending = String(group.pending);

    const header = el('div', 'editor-storyline-group-header');
    const title = el('h4', 'editor-storyline-group-title', group.title);
    title.dataset.role = 'storyline-group-title';
    const count = group.members.length;
    const meta = el(
      'span',
      'editor-storyline-group-meta',
      `${group.storylineId} · ${count} card${count === 1 ? '' : 's'}`,
    );
    meta.dataset.role = 'storyline-group-meta';
    header.append(title, meta);
    if (group.pending) {
      const pending = el(
        'span',
        'editor-storyline-pending',
        'new — not yet written',
      );
      pending.dataset.role = 'storyline-group-pending';
      header.append(pending);
    }
    article.append(header);

    if (count === 0) {
      const note = el(
        'p',
        'editor-details-note',
        'No member cards yet — select cards from another group and move them here.',
      );
      note.dataset.role = 'storyline-group-empty';
      article.append(note);
    } else {
      const list = el('ul', 'editor-storyline-members');
      list.dataset.role = 'storyline-members';
      for (const member of group.members) {
        const item = el('li', 'editor-storyline-member');
        const label = el('label');
        const checkbox = el('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.role = 'storyline-member-toggle';
        checkbox.dataset.cardId = member.id;
        checkbox.checked = selected.has(member.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(member.id);
          else selected.delete(member.id);
          updateSelectionSummary();
        });
        const id = el('span', 'editor-storyline-member-id', member.id);
        label.append(checkbox, document.createTextNode(` ${member.name} `), id);
        item.append(label);
        list.append(item);
      }
      article.append(list);
    }

    const actions = el('div', 'editor-form-actions');
    const renameButton = el('button', 'editor-button', 'Rename…');
    renameButton.type = 'button';
    renameButton.dataset.action = 'rename-group';
    renameButton.dataset.storylineId = group.storylineId;
    renameButton.addEventListener('click', () => openRename(group.storylineId));
    const moveButton = el('button', 'editor-button', 'Move selected here');
    moveButton.type = 'button';
    moveButton.dataset.action = 'reassign-selected';
    moveButton.dataset.storylineId = group.storylineId;
    moveButton.addEventListener('click', () => {
      void reassignMembers([...selected], group.storylineId);
    });
    actions.append(renameButton, moveButton);
    article.append(actions);
    return article;
  }

  function openRename(groupId: string): void {
    const group = groupView(groupId);
    if (!group) return;
    openRenameFor = groupId;
    renameId.input.value = group.storylineId;
    renameTitle.input.value = group.title;
    renderRenamePanel();
    previewPanel.clear();
  }

  function renderRenamePanel(): void {
    const group = openRenameFor === null ? undefined : groupView(openRenameFor);
    renamePanel.hidden = group === undefined;
    if (!group) return;
    renameHeading.textContent = `Rename "${group.title}" (${group.storylineId})`;
  }

  async function previewRename(): Promise<void> {
    if (openRenameFor === null) return;
    const group = groupView(openRenameFor);
    if (!group) return;

    const id = renameId.input.value.trim();
    const title = renameTitle.input.value.trim();
    const errors = validateStorylineDraft({ id, title }, allGroupIds(), {
      allowId: group.storylineId,
    });
    if (errors.length > 0) {
      setStatus(errors.map((error) => error.message).join(' '), 'error');
      return;
    }
    if (group.members.length === 0) {
      setStatus(
        'The group has no member cards, so there is nothing to write — rename it to keep it pending.',
        'info',
      );
      previewPanel.renderMessage(
        'Nothing to write: a story-line exists through its member cards.',
        'info',
      );
      return;
    }

    const edit = setStorylineMembersEdit(
      group.members.map((member) => member.id),
      id,
      title,
    );
    busy = true;
    applyBusy();
    try {
      const preview = await options.bridge.preview(edit);
      previewPanel.render(preview);
      // A valid preview is readiness, not a completed write: `success` is
      // reserved for an applied edit, so a caller waiting on the status tone
      // can tell the two apart.
      setStatus(
        preview.ok
          ? 'Preview is valid — rename to write it.'
          : 'Preview is invalid — the write is blocked.',
        preview.ok ? 'info' : 'error',
      );
    } catch (error) {
      setStatus(`Preview failed: ${(error as Error).message}`, 'error');
      previewPanel.renderMessage(`Preview failed: ${(error as Error).message}`, 'error');
    } finally {
      busy = false;
      applyBusy();
    }
  }

  async function applyRename(): Promise<EditApplyOutcome | null> {
    if (openRenameFor === null) return null;
    const groupId = openRenameFor;
    const outcome = await renameGroup(groupId, {
      storylineId: renameId.input.value,
      storylineTitle: renameTitle.input.value,
    });
    if (outcome?.ok) {
      openRenameFor = null;
      renderRenamePanel();
    }
    return outcome;
  }

  // ── Wiring ────────────────────────────────────────────────

  const onCreate = (): void => {
    void createGroup({
      id: createId.input.value,
      title: createTitle.input.value,
      memberIds: [...selected],
    });
  };
  const onPreviewRename = (): void => {
    void previewRename();
  };
  const onApplyRename = (): void => {
    void applyRename();
  };
  const onCancelRename = (): void => {
    openRenameFor = null;
    renderRenamePanel();
    previewPanel.clear();
  };
  createButton.addEventListener('click', onCreate);
  previewRenameButton.addEventListener('click', onPreviewRename);
  applyRenameButton.addEventListener('click', onApplyRename);
  cancelRenameButton.addEventListener('click', onCancelRename);

  renderGroups();
  updateSelectionSummary();

  return {
    root,
    previewPanel,
    groups: () => currentGroups(),
    selection: () => [...selected],
    setSelected: (memberIds) => {
      selected.clear();
      for (const memberId of memberIds) selected.add(memberId);
      renderGroups();
      updateSelectionSummary();
      applyBusy();
    },
    createGroup,
    renameGroup,
    reassignMembers,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      createButton.removeEventListener('click', onCreate);
      previewRenameButton.removeEventListener('click', onPreviewRename);
      applyRenameButton.removeEventListener('click', onApplyRename);
      cancelRenameButton.removeEventListener('click', onCancelRename);
      root.remove();
    },
  };
}
