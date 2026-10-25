/**
 * Browser round-trip for the story-line management panel (F4).
 *
 * The editor page is a plain-DOM dev tool, so the panel is mounted straight into
 * Vitest's real Chromium document (the same decision recorded for the viewer and
 * the curated forms harnesses). The bridge is an in-memory double that runs the
 * **real** pure preview/validation seam over the Gym fixture and only stubs the
 * file write — the Node-only part is proven against a temp CSV in
 * `storyline-manager.test.ts`.
 *
 * Covered end to end:
 *
 * - the group list is derived from the manifest (title, id, member cards);
 * - creating a group with selected cards is **one** batch write, and the list
 *   afterwards equals the groups derived from the regenerated manifest;
 * - creating a group with no cards writes nothing (a story-line exists through
 *   its members) and the pending group is listed until cards are moved in;
 * - renaming a group previews, blocks a duplicate id locally, and writes every
 *   member in a single `set-storyline-batch` call;
 * - reassigning selected cards into another group is likewise one write.
 *
 * @module
 */
import { afterEach, describe, expect, it } from 'vitest';

import gymCsvRaw from '../../../example-games/gym/content/storylines.csv?raw';
import gymManifestJson from '../../../example-games/gym/content/storyline-manifest.json';
import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../../../src/story-line/content/manifest';
import { previewEdit, validateEdit, type EditorEdit } from '../../../src/story-line/editor/edits';
import { mountEditorShell, type EditorShell } from '../../../tools/storyline-editor/app-shell';
import type { EditorBridge } from '../../../tools/storyline-editor/bridge-client';
import {
  buildStorylineGroups,
  type StorylineGroupSource,
  type StorylineGroupView,
  type StorylineMemberSource,
} from '../../../tools/storyline-editor/storyline-manager';
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
          return { ok: false, message: 'refused', preview, errors: preview.errors, written: false };
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

/** The groups derived from the content a write produced (a regenerated manifest). */
function groupsFromCsv(csv: string): StorylineGroupView[] {
  const manifest = buildStorylineManifestFromCsv(csv, GYM_CONTENT_ADAPTER);
  const groups: StorylineGroupSource[] = manifest.storylineIds.map((storylineId) => ({
    storylineId,
    title:
      manifest.nodes.find((node) => node.storylineId === storylineId && node.storylineTitle)
        ?.storylineTitle ?? storylineId,
  }));
  const members: StorylineMemberSource[] = manifest.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    storylineId: node.storylineId,
    storylineTitle: node.storylineTitle,
  }));
  return buildStorylineGroups(groups, members);
}

/** A comparable projection of a group list. */
function summarise(groups: readonly StorylineGroupView[]) {
  return groups
    .map((group) => ({
      storylineId: group.storylineId,
      title: group.title,
      memberIds: group.members.map((member) => member.id).sort(),
      pending: group.pending,
    }))
    .sort((a, b) => (a.storylineId < b.storylineId ? -1 : a.storylineId > b.storylineId ? 1 : 0));
}

let mounted: { container: HTMLDivElement; shell: EditorShell } | null = null;

/** Mounts the editor shell with the Gym fixture and in-memory editing. */
function mount(): {
  container: HTMLDivElement;
  shell: EditorShell;
  store: ReturnType<typeof createInMemoryBridge>;
} {
  const store = createInMemoryBridge(gymCsvRaw);
  const container = document.createElement('div');
  document.body.append(container);
  const shell = mountEditorShell(container, gymManifest, {
    adapter: GYM_CONTENT_ADAPTER,
    cards: gymCards,
    bridge: store.bridge,
  });
  mounted = { container, shell };
  return { container, shell, store };
}

/** Clicks an element the way a user would. */
function click(element: Element | null): void {
  if (!element) throw new Error('expected an element to click');
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** Types a value into a text input found by its data role. */
function type(container: HTMLElement, role: string, value: string): void {
  const element = container.querySelector(`[data-role="${role}"]`);
  if (!(element instanceof HTMLInputElement)) throw new Error(`"${role}" is not an input`);
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Ticks or unticks a member checkbox. */
function toggleMember(container: HTMLElement, cardId: string, checked: boolean): void {
  const element = container.querySelector(
    `[data-role="storyline-member-toggle"][data-card-id="${cardId}"]`,
  );
  if (!(element instanceof HTMLInputElement)) throw new Error(`no member toggle for "${cardId}"`);
  element.checked = checked;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Waits for a predicate with the shared load-tolerant helper. */
function waitFor(predicate: () => boolean, label: string): Promise<void> {
  return waitForCondition(predicate, { timeoutMs: 5_000, intervalMs: 20, label });
}

/** The last apply call the bridge recorded. */
function lastApply(store: ReturnType<typeof createInMemoryBridge>): EditorEdit {
  const applies = store.calls.filter((call) => call.type === 'apply');
  const last = applies[applies.length - 1];
  if (!last) throw new Error('expected an apply call');
  return last.edit;
}

afterEach(() => {
  mounted?.shell.dispose();
  mounted?.container.remove();
  mounted = null;
});

describe('story-line management — list and create', () => {
  it('lists the manifest groups, creating one with selected cards in a single write', async () => {
    const { container, shell, store } = mount();
    const manager = shell.openStorylineManager();
    expect(manager).not.toBeNull();
    if (!manager) return;

    // The list is derived from the manifest: one group with its four members.
    expect(summarise(manager.groups())).toEqual([
      {
        storylineId: 'gym-story',
        title: 'Gym Storyline',
        memberIds: ['gym-story-end', 'gym-story-ignore', 'gym-story-invest', 'gym-story-start'],
        pending: false,
      },
    ]);
    const group = container.querySelector('[data-role="storyline-group"][data-storyline-id="gym-story"]');
    expect(group?.querySelector('[data-role="storyline-group-title"]')?.textContent).toBe(
      'Gym Storyline',
    );
    expect(group?.querySelector('[data-role="storyline-group-meta"]')?.textContent).toBe(
      'gym-story · 4 cards',
    );
    const toggles = container.querySelectorAll('[data-role="storyline-member-toggle"]');
    expect(toggles).toHaveLength(4);

    // Create a group and move one member into it.
    type(container, 'new-storyline-id', 'gym-story-bonus');
    type(container, 'new-storyline-title', 'Bonus Arc');
    toggleMember(container, 'gym-story-end', true);
    expect(container.querySelector('[data-role="selection-summary"]')?.textContent).toBe(
      '1 member card selected.',
    );
    click(container.querySelector('[data-action="create-group"]'));

    await waitFor(
      () =>
        container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone') ===
        'success',
      'the create outcome',
    );

    // Exactly one apply, carrying the whole batch (one id in this case).
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(1);
    const created = lastApply(store);
    expect(created.kind).toBe('set-storyline-batch');
    expect(created.kind === 'set-storyline-batch' && created.spec.ids).toEqual(['gym-story-end']);
    expect(store.csv()).toContain('gym-story-bonus');

    // AC: after an accepted edit the list reflects the regenerated manifest.
    expect(summarise(manager.groups())).toEqual(summarise(groupsFromCsv(store.csv())));
    expect(summarise(manager.groups())).toEqual([
      {
        storylineId: 'gym-story',
        title: 'Gym Storyline',
        memberIds: ['gym-story-ignore', 'gym-story-invest', 'gym-story-start'],
        pending: false,
      },
      {
        storylineId: 'gym-story-bonus',
        title: 'Bonus Arc',
        memberIds: ['gym-story-end'],
        pending: false,
      },
    ]);
    expect(
      container.querySelector(
        '[data-role="storyline-group"][data-storyline-id="gym-story-bonus"] [data-role="storyline-group-title"]',
      )?.textContent,
    ).toBe('Bonus Arc');
  });

  it('keeps a group created with no cards pending, then writes it when cards are moved in', async () => {
    const { container, shell, store } = mount();
    const manager = shell.openStorylineManager();
    if (!manager) throw new Error('expected the manager to open');

    type(container, 'new-storyline-id', 'gym-story-bonus');
    type(container, 'new-storyline-title', 'Bonus Arc');
    click(container.querySelector('[data-action="create-group"]'));

    // Nothing is written: a story-line exists only through its member cards.
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);
    expect(manager.groups().map((group) => [group.storylineId, group.members.length, group.pending])).toEqual([
      ['gym-story', 4, false],
      ['gym-story-bonus', 0, true],
    ]);
    expect(
      container.querySelector(
        '[data-role="storyline-group"][data-storyline-id="gym-story-bonus"] [data-role="storyline-group-pending"]',
      ),
    ).not.toBeNull();
    expect(container.querySelector('[data-role="manager-status"]')?.textContent).toContain(
      'in this session',
    );

    // Moving a selected card into the pending group writes it once.
    toggleMember(container, 'gym-story-end', true);
    click(
      container.querySelector(
        '[data-action="reassign-selected"][data-storyline-id="gym-story-bonus"]',
      ),
    );
    await waitFor(
      () =>
        container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone') ===
        'success',
      'the reassignment outcome',
    );

    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(1);
    expect(summarise(manager.groups())).toEqual(summarise(groupsFromCsv(store.csv())));
    expect(manager.groups().find((group) => group.storylineId === 'gym-story-bonus')).toMatchObject({
      title: 'Bonus Arc',
      pending: false,
      members: [expect.objectContaining({ id: 'gym-story-end' })],
    });
  });
});

describe('story-line management — rename and reassign', () => {
  it('renames a group with one batch write over every member', async () => {
    const { container, shell, store } = mount();
    const manager = shell.openStorylineManager();
    if (!manager) throw new Error('expected the manager to open');

    click(
      container.querySelector('[data-action="rename-group"][data-storyline-id="gym-story"]'),
    );
    const renamePanel = container.querySelector('[data-role="rename-panel"]');
    expect(renamePanel instanceof HTMLElement && renamePanel.hidden).toBe(false);
    expect(
      (container.querySelector('[data-role="rename-storyline-id"]') as HTMLInputElement).value,
    ).toBe('gym-story');

    // A duplicate id is caught locally — no bridge call, no write.
    type(container, 'rename-storyline-id', 'gym-story-bonus');
    await manager.createGroup({ id: 'gym-story-bonus', title: 'Bonus Arc' });
    const callsBefore = store.calls.length;
    type(container, 'rename-storyline-id', 'gym-story-bonus');
    click(container.querySelector('[data-action="apply-rename"]'));
    expect(container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone')).toBe(
      'error',
    );
    expect(store.calls.length).toBe(callsBefore);
    expect(store.csv()).toBe(gymCsvRaw);

    // A valid retitle renames every member in a single batch.
    type(container, 'rename-storyline-id', 'gym-story-renamed');
    type(container, 'rename-storyline-title', 'Renamed Arc');
    click(container.querySelector('[data-action="preview-rename"]'));
    await waitFor(
      () => container.querySelectorAll('[data-role="diff-row"]').length === 4,
      'the four-member rename diff',
    );
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);

    click(container.querySelector('[data-action="apply-rename"]'));
    await waitFor(
      () =>
        store.calls.filter((call) => call.type === 'apply').length === 1 &&
        manager.groups().some((group) => group.storylineId === 'gym-story-renamed'),
      'the rename write to land',
    );
    expect(container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone')).toBe(
      'success',
    );

    // Exactly one apply: one author-API call for the whole group.
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(1);
    const edit = lastApply(store);
    expect(edit.kind).toBe('set-storyline-batch');
    expect(edit.kind === 'set-storyline-batch' && [...edit.spec.ids].sort()).toEqual([
      'gym-story-end',
      'gym-story-ignore',
      'gym-story-invest',
      'gym-story-start',
    ]);
    expect(store.csv()).toContain('gym-story-renamed');
    expect(store.csv()).toContain('Renamed Arc');

    // AC: the list reflects the regenerated manifest after the accepted edit.
    // The pending `gym-story-bonus` group created above for the duplicate-id
    // check has no member cards, so it is deliberately *not* in the content and
    // stays listed as a session group alongside the regenerated manifest.
    expect(summarise(manager.groups())).toEqual(
      summarise([
        ...groupsFromCsv(store.csv()),
        { storylineId: 'gym-story-bonus', title: 'Bonus Arc', members: [], pending: true },
      ]),
    );
    expect(manager.groups().map((group) => [group.storylineId, group.title])).toEqual([
      ['gym-story-bonus', 'Bonus Arc'],
      ['gym-story-renamed', 'Renamed Arc'],
    ]);
    expect(container.querySelector('[data-role="rename-panel"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('reassigns selected member cards into another group with one write', async () => {
    const { container, shell, store } = mount();
    const manager = shell.openStorylineManager();
    if (!manager) throw new Error('expected the manager to open');

    // Split off a leaf into a new group, then move another card into it.
    type(container, 'new-storyline-id', 'gym-story-bonus');
    type(container, 'new-storyline-title', 'Bonus Arc');
    toggleMember(container, 'gym-story-end', true);
    click(container.querySelector('[data-action="create-group"]'));
    await waitFor(
      () =>
        container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone') ===
        'success',
      'the create outcome',
    );

    toggleMember(container, 'gym-story-invest', true);
    click(
      container.querySelector(
        '[data-action="reassign-selected"][data-storyline-id="gym-story-bonus"]',
      ),
    );
    // Wait on the write itself: the status tone is already `success` from the
    // create above, so it cannot signal this second operation completing.
    await waitFor(
      () =>
        store.calls.filter((call) => call.type === 'apply').length === 2 &&
        manager
          .groups()
          .find((group) => group.storylineId === 'gym-story-bonus')
          ?.members.some((member) => member.id === 'gym-story-invest') === true,
      'the reassignment write to land',
    );

    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(2);
    const edit = lastApply(store);
    expect(edit.kind === 'set-storyline-batch' && edit.spec.ids).toEqual(['gym-story-invest']);
    expect(summarise(manager.groups())).toEqual(summarise(groupsFromCsv(store.csv())));
    expect(manager.groups().find((group) => group.storylineId === 'gym-story-bonus')).toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({ id: 'gym-story-end' }),
        expect.objectContaining({ id: 'gym-story-invest' }),
      ]),
    });
  });

  it('blocks a regroup that would orphan members and writes nothing', async () => {
    const { container, shell, store } = mount();
    const manager = shell.openStorylineManager();
    if (!manager) throw new Error('expected the manager to open');

    // Moving the entry card out leaves the rest of the arc unreachable — the
    // validator refuses the preview, so apply never runs.
    const createdGroup = await manager.createGroup({
      id: 'gym-story-bonus',
      title: 'Bonus Arc',
      memberIds: ['gym-story-start'],
    });
    // The pending group is still listed (nothing was written), so the author can
    // adjust the selection and retry.
    expect(createdGroup).toMatchObject({ storylineId: 'gym-story-bonus', pending: true });
    expect(store.calls.filter((call) => call.type === 'apply')).toHaveLength(0);
    expect(store.csv()).toBe(gymCsvRaw);
    expect(container.querySelector('[data-role="manager-status"]')?.getAttribute('data-tone')).toBe(
      'error',
    );
    expect(container.querySelector('[data-role="preview-report"]')?.textContent).toContain(
      'unreachable',
    );
  });
});
