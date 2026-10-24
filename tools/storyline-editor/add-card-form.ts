/**
 * Guided "add card" form for the story-line editor.
 *
 * Adding a card is not just appending a row: a story-line card belongs to a
 * group (`storylineId`/`storylineTitle`) and — for anything added to an
 * existing multi-member arc — must be *reachable*, or the validator refuses
 * the candidate (`unreachable-card`). So the form guides both decisions:
 *
 * - **Story-line** — pick an existing story-line (which fills the id/title
 *   fields) or author a new one; membership is what "links it into a
 *   story-line" means in the content model.
 * - **Incoming link** — optionally choose the card that leads to the new one,
 *   which makes the form emit a single transactional `add-linked-card` edit:
 *   the card is appended and the predecessor gains an option pointing at it,
 *   validated as one candidate and written once.
 *
 * Fields themselves are adapter-driven, exactly like the edit form
 * ({@link buildNewCardFieldDescriptors}): the card id is editable, values
 * start from the adapter's `newCardDefaults`, and every adapter-declared
 * column is an additional text field.
 *
 * Preview → apply → discard behave as in the edit form: the diff and validator
 * report are shown before anything is written, inline validation errors block
 * the write, and discarding leaves the content file untouched.
 *
 * @module
 */

import type { ContentAdapter } from '../../src/story-line/content/types';
import type { EditPreview, EditorEdit } from '../../src/story-line/editor/api';
import {
  attributeEditErrors,
  buildAddSpec,
  buildNewCardFieldDescriptors,
  draftFromDescriptors,
  type CardFieldDescriptor,
  type CardFormError,
} from '../../src/story-line/editor/field-descriptors';
import type { EditApplyOutcome, EditorBridge } from './bridge-client';
import { createFieldControl, type FieldControl } from './edit-forms';
import { createPreviewPanel, type PreviewPanelHandle } from './preview-panel';

/** A story-line group offered by the guided membership picker. */
export interface StorylineOption {
  /** The story-line id. */
  readonly id: string;
  /** The story-line title. */
  readonly title: string;
}

/** Options for {@link createAddCardForm}. */
export interface AddCardFormOptions {
  /** The game content adapter (drives the fields and defaults). */
  readonly adapter: ContentAdapter;
  /** The edit bridge (preview/validate/apply through the single author API). */
  readonly bridge: EditorBridge;
  /** Existing story-lines offered by the guided picker. */
  readonly storylines?: readonly StorylineOption[];
  /** Known card ids, offered as link suggestions and as incoming-link sources. */
  readonly knownCardIds?: readonly string[];
  /** Called after an accepted (written) add. */
  readonly onApplied?: (outcome: EditApplyOutcome) => void;
  /** Called after the draft is discarded. */
  readonly onDiscarded?: () => void;
}

/** The mounted add form's handle. */
export interface AddCardFormHandle {
  /** The form's root element. */
  readonly root: HTMLElement;
  /** The fields rendered, in order. */
  readonly descriptors: readonly CardFieldDescriptor[];
  /** The preview/validation panel below the form. */
  readonly previewPanel: PreviewPanelHandle;
  /** The current draft (field key → string value). */
  draft(): Readonly<Record<string, string>>;
  /** The predecessor card id selected for the incoming link ('' = none). */
  linkFrom(): string;
  /** True when any field or guided choice differs from its starting value. */
  hasPendingChanges(): boolean;
  /** Sets a field's value (programmatic equivalent of typing). */
  setValue(key: string, value: string): void;
  /** Selects the story-line group (fills the storyline id/title fields). */
  setStoryline(storylineId: string): void;
  /** Selects the predecessor that gains a link to the new card ('' = none). */
  setLinkFrom(cardId: string): void;
  /** Sets the incoming link's option label (defaults to the card's name). */
  setLinkLabel(label: string): void;
  /** Previews the pending add; returns `null` when blocked. */
  preview(): Promise<EditPreview | null>;
  /** Previews (always) then applies; returns `null` when blocked. */
  apply(): Promise<EditApplyOutcome | null>;
  /** Discards the draft — nothing is written. */
  discard(): void;
  /** Removes the form and its listeners from the document. */
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

/** Monotonic id source for the guided controls (deterministic DOM ids). */
let addFormIdCounter = 0;

/** Builds the editable edit for the current draft (add vs add-and-link). */
function buildEdit(
  descriptors: readonly CardFieldDescriptor[],
  draft: Readonly<Record<string, string>>,
  linkFrom: string,
  linkLabel: string,
): EditorEdit {
  const card = buildAddSpec(descriptors, draft);
  if (linkFrom.trim() === '') return { kind: 'add-card', spec: card };
  return {
    kind: 'add-linked-card',
    spec: {
      card,
      linkFrom: { id: linkFrom.trim(), label: linkLabel.trim() || card.name },
    },
  };
}

/**
 * Mounts the guided add-card form.
 *
 * @param options The adapter, the bridge, the guided choices and callbacks.
 * @returns The form handle.
 */
export function createAddCardForm(options: AddCardFormOptions): AddCardFormHandle {
  const { adapter, bridge } = options;
  const storylines = options.storylines ?? [];
  const knownCardIds = options.knownCardIds ?? [];

  const descriptors = buildNewCardFieldDescriptors(adapter, {
    ...(knownCardIds.length > 0 ? { knownCardIds } : {}),
  });
  const baseline = draftFromDescriptors(descriptors);
  let draftRecord: Record<string, string> = { ...baseline };
  let selectedStoryline = '';
  let linkFromId = '';
  let linkLabel = '';
  let disposed = false;

  const root = el('div', 'editor-add-card');
  root.dataset.role = 'add-card-form';
  const formId = ++addFormIdCounter;

  const heading = el('h3', 'editor-form-title', 'Add a card');
  heading.dataset.role = 'add-card-title';
  root.append(heading);

  const form = el('form', 'editor-form');
  form.dataset.role = 'add-form';
  form.addEventListener('submit', (event) => event.preventDefault());

  const controls = new Map<string, FieldControl>();
  const grid = el('div', 'editor-form-fields');
  const storylineKeys = new Set(['storylineId', 'storylineTitle']);
  for (const descriptor of descriptors) {
    if (storylineKeys.has(descriptor.key)) continue;
    const control = createFieldControl(descriptor, (key, value) => setValue(key, value, false));
    controls.set(descriptor.key, control);
    grid.append(control.wrapper);
  }
  form.append(grid);

  // ── Guided story-line membership ───────────────────────────
  const storylineGroup = el('fieldset', 'editor-form-group');
  storylineGroup.dataset.role = 'storyline-group';
  storylineGroup.append(el('legend', 'editor-form-legend', 'Story-line membership'));

  const storylineSelectLabel = el('label', 'editor-field-label', 'Story-line');
  const storylineSelectId = `editor-storyline-${formId}`;
  storylineSelectLabel.htmlFor = storylineSelectId;
  const storylineSelect = el('select', 'editor-field-input');
  storylineSelect.id = storylineSelectId;
  storylineSelect.dataset.role = 'storyline-select';
  const noStoryline = el('option', undefined, '— New story-line —');
  noStoryline.value = '';
  storylineSelect.append(noStoryline);
  for (const storyline of storylines) {
    const option = el('option', undefined, `${storyline.title} (${storyline.id})`);
    option.value = storyline.id;
    storylineSelect.append(option);
  }
  storylineGroup.append(storylineSelectLabel, storylineSelect);

  const storylineHint = el(
    'p',
    'editor-field-hint',
    'Choosing an existing story-line fills its id and title. A new story-line is named below.',
  );
  storylineGroup.append(storylineHint);

  for (const key of storylineKeys) {
    const descriptor = descriptors.find((candidate) => candidate.key === key);
    if (!descriptor) continue;
    const control = createFieldControl(descriptor, (changed, value) =>
      setValue(changed, value, false),
    );
    controls.set(descriptor.key, control);
    storylineGroup.append(control.wrapper);
  }
  // A game without a story-line id mapping has no membership to guide.
  if (adapter.fields.storylineId !== undefined) form.append(storylineGroup);

  // ── Guided incoming link ───────────────────────────────────
  const linkGroup = el('fieldset', 'editor-form-group');
  linkGroup.dataset.role = 'link-group';
  linkGroup.append(el('legend', 'editor-form-legend', 'Incoming link (optional)'));

  const linkSelectLabel = el('label', 'editor-field-label', 'Linked from card');
  const linkSelectId = `editor-link-from-${formId}`;
  linkSelectLabel.htmlFor = linkSelectId;
  const linkSelect = el('select', 'editor-field-input');
  linkSelect.id = linkSelectId;
  linkSelect.dataset.role = 'link-from';
  const noLink = el('option', undefined, '— No incoming link —');
  noLink.value = '';
  linkSelect.append(noLink);
  for (const cardId of knownCardIds) {
    const option = el('option', undefined, cardId);
    option.value = cardId;
    linkSelect.append(option);
  }

  const linkLabelField = el('div', 'editor-field');
  linkLabelField.dataset.field = 'linkLabel';
  linkLabelField.dataset.kind = 'text';
  const linkLabelLabel = el('label', 'editor-field-label', 'Option label');
  linkLabelLabel.htmlFor = linkSelectId + '-label';
  const linkLabelInput = el('input', 'editor-field-input');
  linkLabelInput.type = 'text';
  linkLabelInput.id = linkSelectId + '-label';
  linkLabelInput.dataset.role = 'link-label';
  linkLabelInput.placeholder = 'Defaults to the card name';
  const linkLabelError = el('p', 'editor-field-error');
  linkLabelError.dataset.role = 'field-error';
  linkLabelError.hidden = true;
  linkLabelField.append(linkLabelLabel, linkLabelInput, linkLabelError);

  linkGroup.append(
    linkSelectLabel,
    linkSelect,
    linkLabelField,
    el(
      'p',
      'editor-field-hint',
      'Adds an option leading from the chosen card to this new card, in the same validated write.',
    ),
  );
  // Only offer an incoming link when the adapter has a column to carry it.
  const canLink =
    adapter.fields.options !== undefined ||
    adapter.fields.acceptNextCardId !== undefined ||
    adapter.fields.rejectNextCardId !== undefined;
  if (canLink) form.append(linkGroup);

  const status = el('p', 'editor-form-status', 'Fill in the card fields, then preview.');
  status.dataset.role = 'add-status';

  const actions = el('div', 'editor-form-actions');
  const previewButton = el('button', 'editor-button', 'Preview card');
  previewButton.type = 'button';
  previewButton.dataset.action = 'preview-add';
  const applyButton = el('button', 'editor-button editor-button--primary', 'Create card');
  applyButton.type = 'button';
  applyButton.dataset.action = 'apply-add';
  const discardButton = el('button', 'editor-button', 'Discard changes');
  discardButton.type = 'button';
  discardButton.dataset.action = 'discard-add';
  actions.append(previewButton, applyButton, discardButton);
  form.append(actions, status);

  root.append(form);
  const previewPanel = createPreviewPanel();
  root.append(previewPanel.root);

  function setBusy(value: boolean): void {
    previewButton.disabled = value;
    applyButton.disabled = value;
    discardButton.disabled = value;
  }

  function hasPendingChanges(): boolean {
    return (
      Object.keys(baseline).some((key) => draftRecord[key] !== baseline[key]) ||
      selectedStoryline !== '' ||
      linkFromId !== '' ||
      linkLabel !== ''
    );
  }

  function clearInlineErrors(): void {
    for (const control of controls.values()) {
      control.error.textContent = '';
      control.error.hidden = true;
      control.wrapper.dataset.invalid = 'false';
    }
    linkLabelError.textContent = '';
    linkLabelError.hidden = true;
  }

  function renderInlineErrors(errors: readonly CardFormError[]): void {
    clearInlineErrors();
    for (const error of errors) {
      if (!error.field) continue;
      if (error.field === 'linkLabel') {
        linkLabelError.textContent = error.message;
        linkLabelError.hidden = false;
        continue;
      }
      const control = controls.get(error.field);
      if (!control) continue;
      control.error.textContent = error.message;
      control.error.hidden = false;
      control.wrapper.dataset.invalid = 'true';
    }
  }

  function setValue(key: string, value: string, syncControl = true): void {
    if (disposed) return;
    const descriptor = descriptors.find((candidate) => candidate.key === key);
    if (!descriptor) return;
    draftRecord = { ...draftRecord, [key]: value };
    if (syncControl) controls.get(key)?.set(value);
    clearInlineErrors();
    status.textContent = 'Pending changes — preview before creating the card.';
    status.dataset.tone = 'info';
    previewPanel.renderMessage('Pending changes — preview to see the diff.', 'info');
  }

  function setStoryline(storylineId: string): void {
    selectedStoryline = storylineId;
    storylineSelect.value = storylineId;
    if (storylineId === '') {
      setValue('storylineId', '', true);
      setValue('storylineTitle', '', true);
      return;
    }
    const matched = storylines.find((storyline) => storyline.id === storylineId);
    setValue('storylineId', storylineId, true);
    setValue('storylineTitle', matched?.title ?? '', true);
  }

  function setLinkFrom(cardId: string): void {
    linkFromId = cardId;
    linkSelect.value = cardId;
    if (cardId !== '') {
      status.textContent = 'Pending changes — preview before creating the card.';
      status.dataset.tone = 'info';
    }
  }

  function setLinkLabel(label: string): void {
    linkLabel = label;
    linkLabelInput.value = label;
  }

  async function preview(): Promise<EditPreview | null> {
    const edit = buildEdit(descriptors, draftRecord, linkFromId, linkLabel);
    setBusy(true);
    try {
      const result = await bridge.preview(edit);
      previewPanel.render(result);
      const errors = attributeEditErrors({
        descriptors,
        draft: draftRecord,
        cardId: null,
        errors: result.errors,
        issues: result.validation.issues,
      });
      renderInlineErrors(errors);
      status.textContent = result.ok
        ? 'Preview is valid — create to write it.'
        : 'Preview is invalid — the write is blocked.';
      status.dataset.tone = result.ok ? 'success' : 'error';
      return result;
    } catch (error) {
      status.textContent = `Preview failed: ${(error as Error).message}`;
      status.dataset.tone = 'error';
      previewPanel.renderMessage(`Preview failed: ${(error as Error).message}`, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<EditApplyOutcome | null> {
    const edit = buildEdit(descriptors, draftRecord, linkFromId, linkLabel);
    // Structural guarantee: always preview (and validate) before writing.
    const previewed = await preview();
    if (!previewed || !previewed.ok) return null;

    setBusy(true);
    try {
      const outcome = await bridge.apply(edit);
      previewPanel.render(previewed, outcome);
      if (outcome.ok) {
        status.textContent = `Created — ${outcome.message}`;
        status.dataset.tone = 'success';
        options.onApplied?.(outcome);
      } else {
        status.textContent = `Refused — ${outcome.message}`;
        status.dataset.tone = 'error';
        renderInlineErrors(
          attributeEditErrors({
            descriptors,
            draft: draftRecord,
            cardId: null,
            errors: outcome.errors,
            issues: outcome.preview.validation.issues,
          }),
        );
      }
      return outcome;
    } catch (error) {
      status.textContent = `Create failed: ${(error as Error).message}`;
      status.dataset.tone = 'error';
      previewPanel.renderMessage(`Create failed: ${(error as Error).message}`, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function discard(): void {
    draftRecord = { ...baseline };
    for (const [key, control] of controls) control.set(draftRecord[key] ?? '');
    selectedStoryline = '';
    storylineSelect.value = '';
    linkFromId = '';
    linkSelect.value = '';
    linkLabel = '';
    linkLabelInput.value = '';
    clearInlineErrors();
    status.textContent = 'Changes discarded — nothing was written.';
    status.dataset.tone = 'info';
    previewPanel.renderMessage('Changes discarded — the content file is untouched.', 'info');
    options.onDiscarded?.();
  }

  const onPreviewClick = (): void => {
    void preview();
  };
  const onApplyClick = (): void => {
    void apply();
  };
  const onDiscardClick = (): void => discard();
  const onStorylineChange = (): void => setStoryline(storylineSelect.value);
  const onLinkFromChange = (): void => setLinkFrom(linkSelect.value);
  const onLinkLabelInput = (): void => setLinkLabel(linkLabelInput.value);

  previewButton.addEventListener('click', onPreviewClick);
  applyButton.addEventListener('click', onApplyClick);
  discardButton.addEventListener('click', onDiscardClick);
  storylineSelect.addEventListener('change', onStorylineChange);
  linkSelect.addEventListener('change', onLinkFromChange);
  linkLabelInput.addEventListener('input', onLinkLabelInput);

  return {
    root,
    descriptors,
    previewPanel,
    draft: () => ({ ...draftRecord }),
    linkFrom: () => linkFromId,
    hasPendingChanges,
    setValue: (key, value) => setValue(key, value, true),
    setStoryline,
    setLinkFrom,
    setLinkLabel,
    preview,
    apply,
    discard,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      previewButton.removeEventListener('click', onPreviewClick);
      applyButton.removeEventListener('click', onApplyClick);
      discardButton.removeEventListener('click', onDiscardClick);
      storylineSelect.removeEventListener('change', onStorylineChange);
      linkSelect.removeEventListener('change', onLinkFromChange);
      linkLabelInput.removeEventListener('input', onLinkLabelInput);
      root.remove();
    },
  };
}
