/**
 * Story-line management (F4): the group list, draft validation and the single
 * batch write behind create / rename / reassign.
 *
 * The panel is a plain-DOM module, so its interaction behaviour is covered by
 * the browser round-trip (`storyline-manager.browser.test.ts`). This Node suite
 * pins the parts that are pure or write content:
 *
 * - the rendered list is derived from the manifest (its story-line ids plus each
 *   member's declared id/title) and additionally shows a group created in this
 *   session that has no member cards yet;
 * - a create/rename draft is validated locally (id/title required, id unique);
 * - **every** management operation is one `set-storyline-batch` edit, validated
 *   once for the whole batch and written once through the author API — never one
 *   write per member card;
 * - create, rename and reassign round-trip against a temp fixture copy, and the
 *   list derived from the **regenerated manifest** matches the list the manager
 *   keeps after the write;
 * - an invalid regroup (one that would orphan members) is refused and the file
 *   stays byte-identical;
 * - the committed Gym CSV is never mutated.
 *
 * @module
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { computeContentChecksum } from '../../../src/story-line/content/csv';
import { buildStorylineManifestFromCsv } from '../../../src/story-line/content/manifest';
import { applyEdit, previewEdit } from '../../../src/story-line/editor/api';
import {
  buildStorylineGroups,
  setStorylineMembersEdit,
  validateStorylineDraft,
  type StorylineGroupSource,
  type StorylineGroupView,
  type StorylineMemberSource,
} from '../../../tools/storyline-editor/storyline-manager';
import {
  CONTENT_CSV_PATH,
  copyEditorFixtureFiles,
  type EditorFixtureFiles,
} from './fixtures';

/** The artefact paths of a fixture copy. */
function artefactPaths(fixture: EditorFixtureFiles) {
  return { json: fixture.manifestPath, mermaid: fixture.mermaidPath };
}

/** Loads the fixture content and returns its checksum. */
function loadChecksum(fixture: EditorFixtureFiles): string {
  return computeContentChecksum(readFileSync(fixture.csvPath, 'utf-8'));
}

/** The story-line groups the generated manifest reports for a content CSV. */
function manifestGroups(csv: string): StorylineGroupView[] {
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

/** A comparable projection of a group list (ids, titles, members, pending). */
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

/** The Gym fixture's four story-line members. */
const GYM_MEMBERS = [
  'gym-story-start',
  'gym-story-invest',
  'gym-story-ignore',
  'gym-story-end',
] as const;

describe('buildStorylineGroups — derived from the manifest, plus session groups', () => {
  it('lists every declared group with its members and titles', () => {
    const csv = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    const groups = manifestGroups(csv);

    expect(summarise(groups)).toEqual([
      {
        storylineId: 'gym-story',
        title: 'Gym Storyline',
        memberIds: [...GYM_MEMBERS].sort(),
        pending: false,
      },
    ]);
  });

  it('keeps a group created in this session even before it has members', () => {
    const members: StorylineMemberSource[] = [
      { id: 'a', name: 'A', storylineId: 'arc', storylineTitle: 'Arc' },
    ];
    const groups = buildStorylineGroups(
      [{ storylineId: 'arc', title: 'Arc' }],
      members,
      [{ storylineId: 'new-arc', title: 'New Arc', written: false }],
    );

    expect(summarise(groups)).toEqual([
      { storylineId: 'arc', title: 'Arc', memberIds: ['a'], pending: false },
      { storylineId: 'new-arc', title: 'New Arc', memberIds: [], pending: true },
    ]);
  });

  it('drops a written group that has no members, and never duplicates a declared one', () => {
    const groups = buildStorylineGroups(
      [{ storylineId: 'arc', title: 'Arc' }],
      [{ id: 'a', name: 'A', storylineId: 'arc', storylineTitle: 'Arc' }],
      [
        { storylineId: 'arc', title: 'Arc (stale session copy)', written: true },
        { storylineId: 'empty-arc', title: 'Empty Arc', written: true },
      ],
    );

    // A story-line exists only through its member cards: a written group with no
    // members is not in the content, and the declared entry wins the duplicate.
    expect(summarise(groups)).toEqual([
      { storylineId: 'arc', title: 'Arc', memberIds: ['a'], pending: false },
    ]);
  });

  it('derives membership from each card’s declared storyline id, not from the group entry', () => {
    const members: StorylineMemberSource[] = [
      { id: 'a', name: 'A', storylineId: 'arc', storylineTitle: 'Arc' },
      { id: 'b', name: 'B', storylineId: 'other', storylineTitle: 'Other' },
      { id: 'c', name: 'C', storylineId: null, storylineTitle: null },
    ];
    const groups = buildStorylineGroups(
      [
        { storylineId: 'arc', title: 'Arc' },
        { storylineId: 'other', title: 'Other' },
      ],
      members,
    );

    expect(summarise(groups)).toEqual([
      { storylineId: 'arc', title: 'Arc', memberIds: ['a'], pending: false },
      { storylineId: 'other', title: 'Other', memberIds: ['b'], pending: false },
    ]);
  });
});

describe('validateStorylineDraft — authoring errors the content validator cannot see', () => {
  it('requires an id and a title', () => {
    const errors = validateStorylineDraft({ id: '  ', title: '' }, []);
    expect(errors.map((error) => error.code)).toEqual(['missing-id', 'missing-title']);
  });

  it('rejects an id another group already uses', () => {
    const errors = validateStorylineDraft({ id: 'gym-story', title: 'Copy' }, [
      'gym-story',
      'other',
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'duplicate-id' });
    expect(errors[0].message).toContain('gym-story');
  });

  it('exempts the group being renamed from the uniqueness check', () => {
    expect(
      validateStorylineDraft({ id: 'gym-story', title: 'Gym Storyline' }, ['gym-story'], {
        allowId: 'gym-story',
      }),
    ).toEqual([]);
    // Re-id'ing to another group's id is still refused.
    expect(
      validateStorylineDraft({ id: 'other', title: 'Other' }, ['gym-story', 'other'], {
        allowId: 'gym-story',
      }).map((error) => error.code),
    ).toEqual(['duplicate-id']);
  });
});

describe('setStorylineMembersEdit — one batch edit for the whole group', () => {
  it('carries every member id in a single set-storyline-batch edit', () => {
    const edit = setStorylineMembersEdit([...GYM_MEMBERS], 'gym-story-renamed', 'Renamed Arc');
    expect(edit).toEqual({
      kind: 'set-storyline-batch',
      spec: {
        ids: [...GYM_MEMBERS],
        storylineId: 'gym-story-renamed',
        storylineTitle: 'Renamed Arc',
      },
    });
    // The edit is one object regardless of member count: no per-card edit list.
    expect(Array.isArray(edit)).toBe(false);
  });
});

describe('management operations round-trip against a fixture CSV', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  /** Applies one edit through the author API, asserting a single write. */
  function write(edit: ReturnType<typeof setStorylineMembersEdit>, expectRows: number) {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, edit);
    expect(preview.ok).toBe(true);
    expect(preview.rows).toHaveLength(expectRows);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit,
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });

    // One author-API call, one file write, every member in the same candidate.
    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(result.preview.rows).toHaveLength(expectRows);
    expect(result.preview.rows.every((row) => row.status === 'changed')).toBe(true);
    return readFileSync(fixture.csvPath, 'utf-8');
  }

  it('creates a group by assigning member cards in one validated write', () => {
    const csv = write(
      setStorylineMembersEdit(['gym-story-end'], 'gym-story-bonus', 'Bonus Arc'),
      1,
    );

    // The list derived from the regenerated manifest shows the new group.
    expect(summarise(manifestGroups(csv))).toEqual([
      { storylineId: 'gym-story', title: 'Gym Storyline', memberIds: ['gym-story-ignore', 'gym-story-invest', 'gym-story-start'], pending: false },
      { storylineId: 'gym-story-bonus', title: 'Bonus Arc', memberIds: ['gym-story-end'], pending: false },
    ]);
  });

  it('renames a group with exactly one batch write for every member', () => {
    const csv = write(
      setStorylineMembersEdit([...GYM_MEMBERS], 'gym-story-renamed', 'Renamed Arc'),
      GYM_MEMBERS.length,
    );

    expect(csv).toContain('gym-story-renamed');
    expect(csv).toContain('Renamed Arc');
    expect(csv).not.toContain('gym-story,Gym Storyline');

    expect(summarise(manifestGroups(csv))).toEqual([
      {
        storylineId: 'gym-story-renamed',
        title: 'Renamed Arc',
        memberIds: [...GYM_MEMBERS].sort(),
        pending: false,
      },
    ]);
  });

  it('reassigns selected member cards between existing groups', () => {
    write(setStorylineMembersEdit(['gym-story-end'], 'gym-story-bonus', 'Bonus Arc'), 1);
    const csv = write(
      setStorylineMembersEdit(['gym-story-invest'], 'gym-story-bonus', 'Bonus Arc'),
      1,
    );

    expect(summarise(manifestGroups(csv))).toEqual([
      { storylineId: 'gym-story', title: 'Gym Storyline', memberIds: ['gym-story-ignore', 'gym-story-start'], pending: false },
      { storylineId: 'gym-story-bonus', title: 'Bonus Arc', memberIds: ['gym-story-end', 'gym-story-invest'], pending: false },
    ]);
  });

  it('refuses a regroup that would orphan members and writes nothing', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const edit = setStorylineMembersEdit(['gym-story-start'], 'gym-story-bonus', 'Bonus Arc');

    // Moving the entry card out leaves the rest of the arc unreachable from its
    // new entry point — the validator refuses the candidate.
    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, edit);
    expect(preview.ok).toBe(false);
    expect(
      preview.validation.issues.some((issue) => issue.code === 'unreachable-card'),
    ).toBe(true);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit,
      expectedChecksum: loadChecksum(fixture),
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(false);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });
});

describe('the committed Gym content is never mutated', () => {
  it('still holds the original story-line after every fixture operation', () => {
    const csv = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    expect(csv).toContain('gym-story,Gym Storyline');
    expect(csv).not.toContain('gym-story-bonus');
    expect(csv).not.toContain('gym-story-renamed');
    expect(csv).not.toContain('Renamed Arc');
  });
});
