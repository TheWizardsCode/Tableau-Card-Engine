/**
 * Preview/diff and validation panel for the story-line editor's curated forms.
 *
 * Every accepted edit is previewed first: the panel renders the pending
 * **diff** (only the affected rows, column by column, before → after) and the
 * validator's own report — the same text/JSON the CLI renders — so the author
 * sees exactly what would be written and why it is (or is not) allowed. A
 * refused edit renders its validation errors instead of a diff; the form stays
 * pending and nothing is written.
 *
 * Plain DOM, no Node, no Phaser: the panel is mounted straight into the page
 * (or into a browser test document) and driven by a {@link EditPreview}.
 *
 * @module
 */

import type { EditPreview, EditRowDiff } from '../../src/story-line/editor/api';
import type { CardFormError } from '../../src/story-line/editor/field-descriptors';
import type { EditApplyOutcome } from './bridge-client';

/** The mounted panel's handle. */
export interface PreviewPanelHandle {
  /** The panel's root element. */
  readonly root: HTMLElement;
  /** Renders a preview (diff + validation report), optionally with an outcome. */
  render(preview: EditPreview, outcome?: EditApplyOutcome): void;
  /** Renders form-level errors (those that could not be attributed to a field). */
  renderErrors(errors: readonly CardFormError[]): void;
  /** Replaces the panel with a one-line status message. */
  renderMessage(message: string, tone: 'info' | 'success' | 'error'): void;
  /** Empties the panel (no pending preview). */
  clear(): void;
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

/** Renders one affected row's diff entry. */
function renderDiffRow(
  parent: HTMLElement,
  row: EditRowDiff,
  order: readonly string[],
): void {
  const article = el('article', 'editor-diff-row');
  article.dataset.role = 'diff-row';
  article.dataset.cardId = row.id;
  article.dataset.status = row.status;

  const heading = el('h3', 'editor-diff-title');
  heading.append(el('span', 'editor-diff-card-id', row.id));
  heading.append(el('span', 'editor-diff-status', row.status));
  article.append(heading);

  const list = el('dl', 'editor-diff-list');
  const columns = [...row.changedColumns].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
  });
  for (const column of columns) {
    const entry = el('div', 'editor-diff-change');
    entry.dataset.role = 'diff-change';
    entry.dataset.column = column;
    entry.dataset.changed = 'true';
    entry.append(el('dt', 'editor-diff-column', column));
    const value = el('dd', 'editor-diff-values');
    const before = el(
      'span',
      'editor-diff-before',
      row.before === null ? '(new row)' : (row.before[column] ?? ''),
    );
    before.dataset.role = 'diff-before';
    const after = el(
      'span',
      'editor-diff-after',
      row.after === null ? '(row removed)' : (row.after[column] ?? ''),
    );
    after.dataset.role = 'diff-after';
    value.append(before, el('span', 'editor-diff-arrow', ' → '), after);
    entry.append(value);
    list.append(entry);
  }
  article.append(list);
  parent.append(article);
}

/**
 * Creates the preview/diff and validation panel.
 *
 * @returns The panel handle.
 */
export function createPreviewPanel(): PreviewPanelHandle {
  const root = el('section', 'editor-preview');
  root.dataset.role = 'preview-panel';

  const status = el('p', 'editor-preview-status');
  status.dataset.role = 'preview-status';
  const summary = el('p', 'editor-preview-summary');
  summary.dataset.role = 'preview-summary';
  const outcomeMessage = el('p', 'editor-preview-outcome');
  outcomeMessage.dataset.role = 'apply-outcome';
  outcomeMessage.hidden = true;

  const diff = el('div', 'editor-preview-diff');
  diff.dataset.role = 'preview-diff';
  const errors = el('div', 'editor-preview-errors');
  errors.dataset.role = 'preview-errors';
  const report = el('pre', 'editor-preview-report');
  report.dataset.role = 'preview-report';
  report.hidden = true;

  root.append(outcomeMessage, status, summary, diff, errors, report);

  function clear(): void {
    status.textContent = '';
    summary.textContent = '';
    outcomeMessage.textContent = '';
    outcomeMessage.hidden = true;
    diff.replaceChildren();
    errors.replaceChildren();
    report.textContent = '';
    report.hidden = true;
  }

  function renderErrors(entries: readonly CardFormError[]): void {
    errors.replaceChildren();
    for (const entry of entries) {
      const item = el('p', 'editor-preview-error', entry.message);
      item.dataset.role = 'preview-error';
      item.dataset.code = entry.code;
      if (entry.field) item.dataset.field = entry.field;
      errors.append(item);
    }
  }

  function renderMessage(message: string, tone: 'info' | 'success' | 'error'): void {
    clear();
    status.dataset.tone = tone;
    status.textContent = message;
  }

  function render(preview: EditPreview, outcome?: EditApplyOutcome): void {
    clear();

    if (outcome) {
      outcomeMessage.hidden = false;
      outcomeMessage.dataset.tone = outcome.ok ? 'success' : 'error';
      outcomeMessage.textContent = outcome.message;
      status.textContent = outcome.ok ? 'Accepted' : 'Refused';
      status.dataset.tone = outcome.ok ? 'success' : 'error';
    } else {
      status.textContent = preview.ok ? 'Valid — ready to apply' : 'Invalid — the write is blocked';
      status.dataset.tone = preview.ok ? 'success' : 'error';
    }

    const rowCount = preview.rows.length;
    summary.textContent = preview.ok
      ? `${rowCount} affected row${rowCount === 1 ? '' : 's'}: ${preview.affectedIds.join(', ') || '(none)'}`
      : `${preview.validation.issues.length} validation error${preview.validation.issues.length === 1 ? '' : 's'}`;

    // Only a valid candidate has a diff; an invalid one shows its errors.
    if (preview.ok) {
      const columnOrder = preview.rows.flatMap((row) =>
        row.after ? Object.keys(row.after) : [],
      );
      for (const row of preview.rows) renderDiffRow(diff, row, columnOrder);
    }

    renderErrors(
      preview.errors.map((message) => ({ field: null, code: 'validation', message })),
    );

    report.hidden = false;
    report.textContent = preview.report;
  }

  return { root, render, renderErrors, renderMessage, clear };
}
