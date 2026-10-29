/**
 * Browser round-trip for the curated card edit forms (F3).
 *
 * The editor page is a plain-DOM dev tool (no Phaser, no game loop), so its
 * forms are mounted straight into Vitest's real Chromium document — the same
 * decision recorded for the viewer harness (CG-0MVHZ2LS3008ATY9).
 *
 * This test drives a **real** edit round-trip on the committed Gym fixture:
 *
 * - the shell, the forms and the preview panel are the shipped modules;
 * - the bridge is an in-memory double that runs the **real** pure preview /
 *   validation seam (`src/story-line/editor/edits.ts`) over the fixture CSV and
 *   only stubs the file write — the Node-only part, already proven through the
 *   author API in `edit-forms.test.ts`;
 * - so choosing fields, previewing, reading the diff, seeing an inline
 *   validation error block the write, applying and discarding are all
 *   exercised end to end, against content that really validates.
 *
 * @module
 */
import { afterEach, describe, expect, it } from 'vitest';

import gymCsvRaw from '../../../example-games/gym/content/storylines.csv?raw';
import gymManifestJson from '../../../example-games/gym/content/storyline-manifest.json';
import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import type { StorylineManifest } from '../../../src/story-line/content/manifest';
import { previewEdit, validateEdit, type EditorEdit } from '../../../src/story-line/editor/edits';
import { mountEditorShell, type EditorShell } from '../../../tools/storyline-editor/app-shell';
import type { EditorBridge } from '../../../tools/storyline-editor/bridge-client';
import { waitForCondition } from '../../helpers/waitForCondition';

/** The committed Gym manifest — exactly what the editor host serves. */
const gymManifest = gymManifestJson as StorylineManifest;

/** The committed Gym content — the cards behind those manifest nodes. */
const gymCards = cardsFromCsv(parseCsv(gymCsvRaw), GYM_CONTENT_ADAPTER);

/** One recorded bridge call. */
interface BridgeCall {
  readonly type: 'preview' | 'validate' | 'apply';
  readonly edit: EditorEdit;
}

/**
 * An in-memory bridge: the real preview/validation seam over a CSV string, with
 * only the file write stubbed (it replaces the in-memory content).
 */
function createInMemoryBridge(initialCsv: string): {
  readonly bridge: EditorBridge;
  readonly calls: BridgeCall[];
  csv(): string;
} {
  let csv = initialCsv;
  const calls: BridgeCall[] = [];
  return {
    csv: () => csv,
    calls,
    bridge: {
      async preview(edit) {
        calls.push({ type: 'preview', edit });
        return previewEdit(csv, GYM_CONTENT_ADAPTER, edit);
      },
      async validate(edit) {
        calls.push({ type: 'validate', edit });
        return validateEdit(csv, GYM_CONTENT_ADAPTER, edit);
      },
      async apply(edit) {
        calls.push({ type: 'apply', edit });
        const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, edit);
        if (!preview.ok || preview.csv === undefined) {
          return {
            ok: false,
            message: 'refused',
            preview,
            errors: preview.errors,
            written: false,
          };
        }
        csv = preview.csv;
        return {
          ok: true,
          message: `applied ${edit.kind}`,
          preview,
          errors: [],
          written: true,
          checksum: preview.candidateChecksum,
        };
      },
    },
  };
}

let mounted: { container: HTMLDivElement; shell: EditorShell } | null = null;

/** Mounts the editor shell with the Gym fixture and in-memory editing. */
function mount(editing = true): {
  container: HTMLDivElement;
  shell: EditorShell;
  store: ReturnType<typeof createInMemoryBridge>;
} {
  const store = createInMemoryBridge(gymCsvRaw);
  const container = document.createElement('div');
  document.body.append(container);
  const shell = mountEditorShell(
    container,
    gymManifest,
    editing
      ? {
          adapter: GYM_CONTENT_ADAPTER,
          cards: gymCards,
          bridge: store.bridge,
        }
      : {},
  );
  mounted = { container, shell };
  return { container, shell, store };
}

/** Clicks an element the way a user would. */
function click(element: Element | null): void {
  if (!element) throw new Error('expected an element to click');
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Finds a field wrapper's control. */
function control(container: HTMLElement, field: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector(`[data-field="${field}"] [data-role="field-input"]`);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    throw new Error(`field "${field}" has no input control`);
  }
  return element;
}

/** Types a value into a text field. */
function type(container: HTMLElement, field: string, value: string): void {
  const element = control(container, field);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Toggles a checkbox field. */
function toggle(container: HTMLElement, field: string, checked: boolean): void {
  const element = control(container, field);
  if (!(element instanceof HTMLInputElement)) throw new Error(`field "${field}" is not a checkbox`);
  element.checked = checked;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Selects an option in a `<select>` and fires `change`. */
function select(container: HTMLElement, role: string, value: string): void {
  const element = container.querySelector(`[data-role="${role}"]`);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`"${role}" is not a select`);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Waits for a predicate with the shared load-tolerant helper. */
function waitFor(predicate: () => boolean, label: string): Promise<void> {
  return waitForCondition(predicate, { timeoutMs: 5_000, intervalMs: 20, label });
}

afterEach(() => {
  mounted?.shell.dispose();
  mounted?.container.remove();
  mounted = null;
});

describe('story-line editor — curated card edit round-trip', () => {
  it('edits every core-generic field and every adapter column, previewing and writing once', async () => {
    const { container, shell, store } = mount();
    shell.selectNode('gym-story-end');
    click(container.querySelector('[data-role="edit-card"]'));

    expect(container.querySelector('[data-role="card-edit-form"]')).not.toBeNull();
    const renderedFields = [
      ...container.querySelectorAll('[data-role="card-edit-form"] [data-field]'),
    ].map((element) => element.getAttribute('data-field'));
    expect(renderedFields).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'effect',
        'hasChoices',
        'options',
        'acceptNextCardId',
        'rejectNextCardId',
        'storylineId',
        'storylineTitle',
        'column:trigger',
        'column:cost',
        'column:coinDelta',
        'column:reputationDelta',
      ]),
    );

    // The id is read-only and prefilled; every other control is editable.
    const idControl = control(container, 'id');
    expect(idControl.value).toBe('gym-story-end');
    expect(idControl instanceof HTMLInputElement && idControl.readOnly).toBe(true);
    expect(control(container, 'name').value).toBe('New Beginning');
    expect(control(container, 'column:coinDelta').value).toBe('0');

    // Edit every core-generic field and every game column.
    type(container, 'name', 'The Endgame');
    type(container, 'effect', 'Everything changes.');
    toggle(container, 'hasChoices', true);
    type(container, 'options', 'Reinvest|gym-story-invest;Finish|');
    type(container, 'acceptNextCardId', 'gym-story-invest');
    type(container, 'rejectNextCardId', 'gym-story-ignore');
    type(container, 'storylineId', 'edited-arc');
    type(container, 'storylineTitle', 'Edited Arc');
    type(container, 'column:trigger', 'Event');
    type(container, 'column:cost', '3');
    type(container, 'column:coinDelta', '-25');
    type(container, 'column:reputationDelta', '10');

    // Preview: the diff renders before anything is written.
    click(container.querySelector('[data-action="preview-edit"]'));
    await waitFor(
      () => container.querySelector('[data-role="diff-row"][data-card-id="gym-story-end"]') !== null,
      'the affected row diff',
    );
    expect(store.csv()).toBe(gymCsvRaw);
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);

    const nameChange = container.querySelector(
      '[data-role="diff-change"][data-column="name"]',
    );
    expect(nameChange?.querySelector('[data-role="diff-before"]')?.textContent).toBe(
      'New Beginning',
    );
    expect(nameChange?.querySelector('[data-role="diff-after"]')?.textContent).toBe('The Endgame');
    const coinChange = container.querySelector(
      '[data-role="diff-change"][data-column="coinDelta"]',
    );
    expect(coinChange?.querySelector('[data-role="diff-before"]')?.textContent).toBe('0');
    expect(coinChange?.querySelector('[data-role="diff-after"]')?.textContent).toBe('-25');
    expect(container.querySelector('[data-role="preview-status"]')?.getAttribute('data-tone')).toBe(
      'success',
    );

    // Apply: writes through the bridge exactly once and reports the outcome.
    click(container.querySelector('[data-action="apply-edit"]'));
    await waitFor(
      () =>
        container.querySelector('[data-role="apply-outcome"]')?.getAttribute('data-tone') ===
        'success',
      'the apply outcome',
    );
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(1);
    expect(store.csv()).toContain('The Endgame');
    expect(store.csv()).toContain('edited-arc');

    // Round-trip: a further preview now treats the written values as `before`.
    type(container, 'name', 'The Final Endgame');
    click(container.querySelector('[data-action="preview-edit"]'));
    await waitFor(
      () =>
        container.querySelector('[data-column="name"] [data-role="diff-before"]')?.textContent ===
        'The Endgame',
      'the second preview to see the applied value as before',
    );
    const secondChange = container.querySelector('[data-column="name"]');
    expect(secondChange?.querySelector('[data-role="diff-after"]')?.textContent).toBe(
      'The Final Endgame',
    );
  });

  it('shows validation errors inline and blocks the write', async () => {
    const { container, shell, store } = mount();
    shell.selectNode('gym-story-start');
    click(container.querySelector('[data-role="edit-card"]'));

    type(container, 'options', 'Invest|gym-story-invest;Ignore|gym-story-ghost');

    click(container.querySelector('[data-action="preview-edit"]'));
    await waitFor(() => {
      const error = container.querySelector('[data-field="options"] [data-role="field-error"]');
      return error instanceof HTMLElement && !error.hidden;
    }, 'the inline options error');
    const inline = container.querySelector('[data-field="options"] [data-role="field-error"]');
    expect(inline?.textContent).toContain('gym-story-ghost');
    expect(container.querySelector('[data-field="options"]')?.getAttribute('data-invalid')).toBe(
      'true',
    );
    expect(container.querySelector('[data-role="preview-status"]')?.getAttribute('data-tone')).toBe(
      'error',
    );
    // The panel keeps the full validator report; the offending card/link is named.
    expect(container.querySelector('[data-role="preview-report"]')?.textContent).toContain(
      'RESULT: INVALID',
    );
    expect(container.querySelector('[data-role="preview-report"]')?.textContent).toContain(
      'gym-story-ghost',
    );

    // Applying re-previews and refuses: the write never happens.
    click(container.querySelector('[data-action="apply-edit"]'));
    await waitFor(
      () => store.calls.filter((call) => call.type === 'preview').length >= 2,
      'the apply-time preview',
    );
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);
    expect(store.csv()).toBe(gymCsvRaw);
  });

  it('discards pending changes without writing anything', () => {
    const { container, shell, store } = mount();
    shell.selectNode('gym-story-invest');
    click(container.querySelector('[data-role="edit-card"]'));

    type(container, 'name', 'Never Written');
    type(container, 'column:coinDelta', '999');

    click(container.querySelector('[data-action="discard-edit"]'));

    expect(control(container, 'name').value).toBe('Public Investment');
    expect(control(container, 'column:coinDelta').value).toBe('120');
    expect(container.querySelector('[data-role="edit-status"]')?.textContent).toContain(
      'discarded',
    );
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);
    expect(store.csv()).toBe(gymCsvRaw);
  });
});

describe('story-line editor — guided add-card form', () => {
  it('creates a card and links it into a story-line in one validated write', async () => {
    const { container, store } = mount();
    click(container.querySelector('[data-action="add-card"]'));
    expect(container.querySelector('[data-role="add-card-form"]')).not.toBeNull();

    type(container, 'id', 'gym-story-detour');
    type(container, 'name', 'A Detour');
    type(container, 'effect', 'Take the scenic route.');
    // Guided membership: choose the existing story-line (fills id + title).
    select(container, 'storyline-select', 'gym-story');
    expect(control(container, 'storylineId').value).toBe('gym-story');
    expect(control(container, 'storylineTitle').value).toBe('Gym Storyline');
    // Guided incoming link: the new card becomes reachable from this card.
    select(container, 'link-from', 'gym-story-invest');
    const label = container.querySelector('[data-role="link-label"]');
    if (!(label instanceof HTMLInputElement)) throw new Error('expected a link label input');
    label.value = 'Take the detour';
    label.dispatchEvent(new Event('input', { bubbles: true }));

    click(container.querySelector('[data-action="preview-add"]'));
    await waitFor(
      () => container.querySelector('[data-role="diff-row"][data-card-id="gym-story-detour"]') !== null,
      'the new-card diff',
    );
    expect(container.querySelector('[data-role="diff-row"][data-card-id="gym-story-invest"]')).not.toBeNull();
    expect(store.csv()).toBe(gymCsvRaw);

    click(container.querySelector('[data-action="apply-add"]'));
    await waitFor(
      () =>
        container.querySelector('[data-role="apply-outcome"]')?.getAttribute('data-tone') ===
        'success',
      'the create outcome',
    );

    expect(store.csv()).toContain('gym-story-detour');
    expect(store.csv()).toContain('A Detour');
    // Both the membership and the incoming link round-tripped.
    const written = cardsFromCsv(parseCsv(store.csv()), GYM_CONTENT_ADAPTER);
    const added = written.find((card) => card.id === 'gym-story-detour');
    expect(added?.storylineId).toBe('gym-story');
    expect(added?.storylineTitle).toBe('Gym Storyline');
    const predecessor = written.find((card) => card.id === 'gym-story-invest');
    expect(predecessor?.options).toContain('Take the detour|gym-story-detour');
  });

  it('refuses a guided add that stays unreachable (unlinked into an existing chain)', async () => {
    const { container, store } = mount();
    click(container.querySelector('[data-action="add-card"]'));

    type(container, 'id', 'gym-story-orphan');
    type(container, 'name', 'An Orphan');
    select(container, 'storyline-select', 'gym-story');

    click(container.querySelector('[data-action="preview-add"]'));
    await waitFor(
      () =>
        container.querySelector('[data-role="preview-status"]')?.getAttribute('data-tone') ===
        'error',
      'the unreachable refusal',
    );
    expect(container.querySelector('[data-role="preview-report"]')?.textContent).toContain(
      'unreachable',
    );

    click(container.querySelector('[data-action="apply-add"]'));
    await waitFor(
      () => store.calls.filter((call) => call.type === 'preview').length >= 2,
      'the create-time preview',
    );
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);
    expect(store.csv()).toBe(gymCsvRaw);
  });
});

describe('story-line editor — read-only mode', () => {
  it('hides the editing affordances when no bridge is wired', () => {
    const { container } = mount(false);
    expect(container.querySelector('[data-role="edit-card"]')).toBeNull();
    expect(container.querySelector('[data-action="add-card"]')).toBeNull();
    expect(container.querySelector('[data-role="editor-form-host"]')?.childElementCount).toBe(0);
  });
});
