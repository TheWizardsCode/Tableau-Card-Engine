/**
 * Curated, adapter-driven card edit form.
 *
 * The form is built from the adapter's **field descriptors**
 * ({@link buildCardFieldDescriptors}) rather than hard-coded columns: core
 * edits the generic story-line fields (id read-only, name, effect, choice
 * flag, options encoding, legacy accept/reject links, storyline id/title) and
 * every adapter-declared column renders as an additional text field without
 * the editor knowing its semantics.
 *
 * The workflow is deliberately conservative — the same order the epic
 * requires:
 *
 * 1. the author changes fields (a **pending** draft; nothing is written);
 * 2. **Preview** posts the derived edit to the bridge, which applies it in
 *    memory, validates and diffs it, and the panel renders the diff plus the
 *    validator's report;
 * 3. **Apply** previews again first (structurally: an apply can never happen
 *    without a fresh, valid preview) and only then writes through the single
 *    author API;
 * 4. **Discard** throws the draft away, leaving the content file untouched.
 *
 * Inline validation errors are attributed to the field that caused them
 * ({@link attributeEditErrors}) and block the write — the offending control is
 * marked so the author fixes exactly that field, while the panel keeps the
 * full validator report.
 *
 * Plain DOM, no Node, no Phaser: the form is mounted directly into the page or
 * a browser test document and talks to the F2 bridge through the injected
 * {@link EditorBridge}.
 *
 * @module
 */

import type { ContentAdapter, ContentCard } from '../../src/story-line/content/types';
import type { EditPreview } from '../../src/story-line/editor/api';
import {
  attributeEditErrors,
  buildCardFieldDescriptors,
  buildUpdateSpec,
  draftFromDescriptors,
  type CardFieldDescriptor,
  type CardFormError,
} from '../../src/story-line/editor/field-descriptors';
import type { EditApplyOutcome, EditorBridge } from './bridge-client';
import { createPreviewPanel, type PreviewPanelHandle } from './preview-panel';

// ── Shared field controls ───────────────────────────────────

/** A rendered field control and its inline error slot. */
export interface FieldControl {
  /** The field wrapper (`[data-field]`), containing label, control and error. */
  readonly wrapper: HTMLElement;
  /** The input/textarea/checkbox element. */
  readonly control: HTMLInputElement | HTMLTextAreaElement;
  /** The inline error slot (`[data-role="field-error"]`). */
  readonly error: HTMLElement;
  /** Reads the control's current value in descriptor string form. */
  get(): string;
  /** Writes a value into the control. */
  set(value: string): void;
}

let fieldIdCounter = 0;

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

/**
 * Renders one descriptor as a labelled control plus an inline error slot.
 *
 * @param descriptor The field descriptor.
 * @param onInput    Called with the field key and the new string value.
 * @returns The control handle.
 */
export function createFieldControl(
  descriptor: CardFieldDescriptor,
  onInput: (key: string, value: string) => void,
): FieldControl {
  const id = `editor-field-${++fieldIdCounter}`;
  const wrapper = el('div', 'editor-field');
  wrapper.dataset.field = descriptor.key;
  wrapper.dataset.kind = descriptor.kind;
  wrapper.dataset.group = descriptor.group;

  const label = el('label', 'editor-field-label', descriptor.label);
  label.htmlFor = id;

  let control: HTMLInputElement | HTMLTextAreaElement;
  if (descriptor.kind === 'long-text') {
    control = el('textarea', 'editor-field-input');
    control.rows = 3;
  } else {
    const input = el('input', 'editor-field-input');
    input.type = descriptor.kind === 'boolean' ? 'checkbox' : 'text';
    if (descriptor.kind === 'read-only') input.readOnly = true;
    if (descriptor.suggestions && descriptor.suggestions.length > 0) {
      const listId = `${id}-suggestions`;
      const list = el('datalist');
      list.id = listId;
      for (const suggestion of descriptor.suggestions) {
        const option = el('option');
        option.value = suggestion;
        list.append(option);
      }
      input.setAttribute('list', listId);
      wrapper.append(list);
    }
    control = input;
  }
  control.id = id;
  control.dataset.role = 'field-input';

  const get = (): string => {
    if (descriptor.kind === 'boolean' && control instanceof HTMLInputElement) {
      return control.checked ? 'true' : 'false';
    }
    return control.value;
  };
  const set = (value: string): void => {
    if (descriptor.kind === 'boolean' && control instanceof HTMLInputElement) {
      control.checked = value === 'true';
      return;
    }
    control.value = value;
  };
  set(descriptor.value);

  const onControlInput = (): void => onInput(descriptor.key, get());
  control.addEventListener('input', onControlInput);
  control.addEventListener('change', onControlInput);

  const error = el('p', 'editor-field-error');
  error.dataset.role = 'field-error';
  error.hidden = true;

  wrapper.append(label, control);
  if (descriptor.hint) wrapper.append(el('p', 'editor-field-hint', descriptor.hint));
  wrapper.append(error);

  return { wrapper, control, error, get, set };
}

// ── Card edit form ──────────────────────────────────────────

/** Options for {@link createCardEditForm}. */
export interface CardEditFormOptions {
  /** The game content adapter (drives the fields). */
  readonly adapter: ContentAdapter;
  /** The card being edited (its loaded values are the baseline). */
  readonly card: ContentCard;
  /** The edit bridge (preview/validate/apply through the single author API). */
  readonly bridge: EditorBridge;
  /** Known card ids, offered as suggestions on link fields. */
  readonly knownCardIds?: readonly string[];
  /** Called after an accepted (written) edit. */
  readonly onApplied?: (outcome: EditApplyOutcome) => void;
  /** Called after the draft is discarded. */
  readonly onDiscarded?: () => void;
}

/** The mounted edit form's handle. */
export interface CardEditFormHandle {
  /** The form's root element. */
  readonly root: HTMLElement;
  /** The fields rendered, in order. */
  readonly descriptors: readonly CardFieldDescriptor[];
  /** The preview/validation panel below the form. */
  readonly previewPanel: PreviewPanelHandle;
  /** The current draft (field key → string value). */
  draft(): Readonly<Record<string, string>>;
  /** True when at least one field differs from the last accepted baseline. */
  hasPendingChanges(): boolean;
  /** Sets a field's value (programmatic equivalent of typing). */
  setValue(key: string, value: string): void;
  /** Previews the pending edit; returns `null` when there is nothing to preview. */
  preview(): Promise<EditPreview | null>;
  /** Previews (always) then applies; returns `null` when blocked or unchanged. */
  apply(): Promise<EditApplyOutcome | null>;
  /** Discards the pending draft — nothing is written. */
  discard(): void;
  /** Removes the form and its listeners from the document. */
  dispose(): void;
}

/**
 * Mounts the curated card edit form.
 *
 * @param options The adapter, the card, the bridge and lifecycle callbacks.
 * @returns The form handle.
 */
export function createCardEditForm(options: CardEditFormOptions): CardEditFormHandle {
  const { adapter, card, bridge } = options;
  const descriptors = buildCardFieldDescriptors(adapter, card, {
    ...(options.knownCardIds ? { knownCardIds: options.knownCardIds } : {}),
  });
  const baseline = draftFromDescriptors(descriptors);
  let draftRecord: Record<string, string> = { ...baseline };
  let disposed = false;

  const root = el('div', 'editor-card-edit');
  root.dataset.role = 'card-edit-form';
  root.dataset.cardId = card.id;

  const heading = el('h3', 'editor-form-title', `Edit card — ${card.name}`);
  heading.dataset.role = 'edit-card-title';
  root.append(heading);

  const form = el('form', 'editor-form');
  form.dataset.role = 'edit-form';
  form.addEventListener('submit', (event) => event.preventDefault());

  const controls = new Map<string, FieldControl>();
  const grid = el('div', 'editor-form-fields');
  for (const descriptor of descriptors) {
    const control = createFieldControl(descriptor, (key, value) => setValue(key, value, false));
    controls.set(descriptor.key, control);
    grid.append(control.wrapper);
  }
  form.append(grid);

  const status = el('p', 'editor-form-status', 'No pending changes.');
  status.dataset.role = 'edit-status';

  const actions = el('div', 'editor-form-actions');
  const previewButton = el('button', 'editor-button', 'Preview changes');
  previewButton.type = 'button';
  previewButton.dataset.action = 'preview-edit';
  const applyButton = el('button', 'editor-button editor-button--primary', 'Apply edit');
  applyButton.type = 'button';
  applyButton.dataset.action = 'apply-edit';
  const discardButton = el('button', 'editor-button', 'Discard changes');
  discardButton.type = 'button';
  discardButton.dataset.action = 'discard-edit';
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
    return Object.keys(baseline).some((key) => draftRecord[key] !== baseline[key]);
  }

  function clearInlineErrors(): void {
    for (const control of controls.values()) {
      control.error.textContent = '';
      control.error.hidden = true;
      control.wrapper.dataset.invalid = 'false';
    }
  }

  function renderInlineErrors(errors: readonly CardFormError[]): void {
    clearInlineErrors();
    for (const error of errors) {
      if (!error.field) continue;
      const control = controls.get(error.field);
      if (!control) continue;
      const existing = control.error.hidden ? '' : `${control.error.textContent ?? ''}\n`;
      control.error.textContent = `${existing}${error.message}`;
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
    if (hasPendingChanges()) {
      status.textContent = 'Pending changes — preview before applying.';
      status.dataset.tone = 'info';
      previewPanel.renderMessage('Pending changes — preview to see the diff.', 'info');
    } else {
      status.textContent = 'No pending changes.';
      delete status.dataset.tone;
      previewPanel.clear();
    }
  }

  async function preview(): Promise<EditPreview | null> {
    const spec = buildUpdateSpec(descriptors, draftRecord);
    if (!spec) {
      status.textContent = 'No pending changes to preview.';
      status.dataset.tone = 'info';
      previewPanel.renderMessage('No pending changes to preview.', 'info');
      return null;
    }
    setBusy(true);
    try {
      const result = await bridge.preview({ kind: 'update-card', spec });
      previewPanel.render(result);
      renderInlineErrors(
        attributeEditErrors({
          descriptors,
          draft: draftRecord,
          cardId: card.id,
          errors: result.errors,
          issues: result.validation.issues,
        }),
      );
      status.textContent = result.ok
        ? 'Preview is valid — apply to write it.'
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
    if (!hasPendingChanges()) {
      status.textContent = 'No pending changes to apply.';
      status.dataset.tone = 'info';
      previewPanel.renderMessage('No pending changes to apply.', 'info');
      return null;
    }
    const spec = buildUpdateSpec(descriptors, draftRecord);
    if (!spec) return null;

    // Structural guarantee: an apply always runs a fresh preview first, so an
    // invalid edit can never reach the author API.
    const previewed = await preview();
    if (!previewed || !previewed.ok) return null;

    setBusy(true);
    try {
      const outcome = await bridge.apply({ kind: 'update-card', spec });
      previewPanel.render(previewed, outcome);
      if (outcome.ok) {
        draftRecord = { ...draftRecord };
        for (const key of Object.keys(baseline)) baseline[key] = draftRecord[key] ?? baseline[key];
        status.textContent = `Applied — ${outcome.message}`;
        status.dataset.tone = 'success';
        options.onApplied?.(outcome);
      } else {
        status.textContent = `Refused — ${outcome.message}`;
        status.dataset.tone = 'error';
        renderInlineErrors(
          attributeEditErrors({
            descriptors,
            draft: draftRecord,
            cardId: card.id,
            errors: outcome.errors,
            issues: outcome.preview.validation.issues,
          }),
        );
      }
      return outcome;
    } catch (error) {
      status.textContent = `Apply failed: ${(error as Error).message}`;
      status.dataset.tone = 'error';
      previewPanel.renderMessage(`Apply failed: ${(error as Error).message}`, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function discard(): void {
    draftRecord = { ...baseline };
    for (const [key, control] of controls) control.set(draftRecord[key] ?? '');
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
  previewButton.addEventListener('click', onPreviewClick);
  applyButton.addEventListener('click', onApplyClick);
  discardButton.addEventListener('click', onDiscardClick);

  return {
    root,
    descriptors,
    previewPanel,
    draft: () => ({ ...draftRecord }),
    hasPendingChanges,
    setValue: (key, value) => setValue(key, value, true),
    preview,
    apply,
    discard,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      previewButton.removeEventListener('click', onPreviewClick);
      applyButton.removeEventListener('click', onApplyClick);
      discardButton.removeEventListener('click', onDiscardClick);
      root.remove();
    },
  };
}
