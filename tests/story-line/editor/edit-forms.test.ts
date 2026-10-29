/**
 * Curated, adapter-driven card edit forms (F3).
 *
 * These tests pin the slice's contract without a browser:
 *
 * - the form field set is **derived from the content adapter** — every
 *   core-generic story-line field the adapter maps plus every adapter-declared
 *   column, and nothing hard-coded;
 * - an edit touching **every** core-generic field *and* every adapter-declared
 *   field validates and is written through the core author API (a round-trip
 *   against a temp fixture copy);
 * - the add-card spec (and the guided add-and-link spec) create a card that
 *   belongs to a story-line and — when linked — is reachable from it;
 * - validator errors are attributed to the offending field and a refused
 *   preview writes nothing;
 * - pending (unwritten) changes never reach the file until `applyEdit`.
 *
 * The DOM behaviour (rendering, inline error slots, discard, the full UI
 * round-trip) is covered in `edit-roundtrip.browser.test.ts`, which drives the
 * real plain-DOM forms in Chromium against an in-memory bridge running the same
 * pure preview/validation seam.
 *
 * All edits run against temp copies; the committed Gym content is never
 * mutated (asserted at the end).
 *
 * @module
 */
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { buildStorylineManifestFromCsv } from '../../../src/story-line/content/manifest';
import { readContentCards } from '../../../src/story-line/content/mutate';
import type { ContentAdapter } from '../../../src/story-line/content/types';
import { applyEdit } from '../../../src/story-line/editor/api';
import { previewEdit } from '../../../src/story-line/editor/edits';
import {
  attributeEditErrors,
  buildAddSpec,
  buildCardFieldDescriptors,
  buildNewCardFieldDescriptors,
  buildUpdateSpec,
  draftFromDescriptors,
} from '../../../src/story-line/editor/field-descriptors';
import {
  CONTENT_CSV_PATH,
  copyEditorFixtureFiles,
  type EditorFixtureFiles,
} from './fixtures';
import {
  buildEditorContent,
  loadEditorSession,
  serveEditorContent,
} from '../../../scripts/storyline-editor-server';
import { EDITOR_CONTENT_PATH } from '../../../tools/storyline-editor/config';

/** The artefact paths of a fixture copy. */
function artefactPaths(fixture: EditorFixtureFiles) {
  return { json: fixture.manifestPath, mermaid: fixture.mermaidPath };
}

/** Loads a card from a fixture CSV by id. */
function card(adapter: ContentAdapter, csv: string, id: string) {
  const found = readContentCards(csv, adapter).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fixture card "${id}" not found`);
  return found;
}

/** A narrow adapter with no legacy choice/link columns. */
const NARROW_ADAPTER: ContentAdapter = {
  gameId: 'fixture',
  columns: ['card_id', 'card_name', 'flavour', 'tone'],
  fields: { id: 'card_id', name: 'card_name', effect: 'flavour' },
};

describe('card field descriptors — adapter-driven, not hard-coded', () => {
  it('renders every core-generic field and every adapter-declared column', () => {
    const csv = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    const target = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-start');
    const descriptors = buildCardFieldDescriptors(GYM_CONTENT_ADAPTER, target, {
      knownCardIds: ['gym-story-start', 'gym-story-invest'],
    });

    expect(descriptors.map((descriptor) => descriptor.key)).toEqual([
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
    ]);

    const id = descriptors[0];
    expect(id.kind).toBe('read-only');
    expect(id.editable).toBe(false);
    expect(id.value).toBe('gym-story-start');

    const fields = new Map(descriptors.map((descriptor) => [descriptor.key, descriptor]));
    expect(fields.get('name')?.value).toBe('Town Meeting');
    expect(fields.get('effect')?.value).toBe('Lose 50 coins');
    expect(fields.get('hasChoices')?.kind).toBe('boolean');
    expect(fields.get('hasChoices')?.value).toBe('false');
    expect(fields.get('options')?.value).toBe(
      'Invest|gym-story-invest;Ignore|gym-story-ignore',
    );
    expect(fields.get('storylineId')?.value).toBe('gym-story');
    expect(fields.get('storylineTitle')?.value).toBe('Gym Storyline');
    // Adapter columns are plain text fields, carrying their raw values.
    expect(fields.get('column:coinDelta')?.group).toBe('adapter');
    expect(fields.get('column:coinDelta')?.value).toBe('-50');
    // Link fields offer the known card ids as suggestions.
    expect(fields.get('options')?.suggestions).toEqual([
      'gym-story-start',
      'gym-story-invest',
    ]);
  });

  it('omits choice/link fields when the adapter does not map them', () => {
    const deal = {
      card_id: 'a',
      card_name: 'Alpha',
      flavour: 'Alpha happens.',
      tone: 'calm',
    };
    const csv = `card_id,card_name,flavour,tone\n${deal.card_id},${deal.card_name},${deal.flavour},${deal.tone}\n`;
    const descriptors = buildNewCardFieldDescriptors(NARROW_ADAPTER);
    expect(descriptors.map((descriptor) => descriptor.key)).toEqual([
      'id',
      'name',
      'effect',
      'column:tone',
    ]);

    // The same derivation reads a real card through the adapter.
    const read = readContentCards(csv, NARROW_ADAPTER)[0];
    const cardDescriptors = buildCardFieldDescriptors(NARROW_ADAPTER, read);
    expect(cardDescriptors.find((descriptor) => descriptor.key === 'column:tone')?.value).toBe(
      'calm',
    );
    expect(cardDescriptors.some((descriptor) => descriptor.key === 'options')).toBe(false);
  });

  it('makes the card id editable and applies the adapter defaults for a new card', () => {
    const descriptors = buildNewCardFieldDescriptors(GYM_CONTENT_ADAPTER);
    const byKey = new Map(descriptors.map((descriptor) => [descriptor.key, descriptor]));
    expect(byKey.get('id')?.editable).toBe(true);
    expect(byKey.get('id')?.value).toBe('');
    expect(byKey.get('column:trigger')?.value).toBe('Incident');
    expect(byKey.get('column:cost')?.value).toBe('0');
    expect(byKey.get('hasChoices')?.value).toBe('false');
  });
});

describe('edit round-trip — every core-generic and adapter field', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('edits, validates and writes every field through the author API', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const target = card(GYM_CONTENT_ADAPTER, before, 'gym-story-end');
    const descriptors = buildCardFieldDescriptors(GYM_CONTENT_ADAPTER, target);
    const draft = draftFromDescriptors(descriptors);

    // Touch every editable field — every core-generic one and every game
    // column — with valid successor targets.
    const edits: Record<string, string> = {
      name: 'The Endgame',
      effect: 'Everything changes.',
      hasChoices: 'true',
      options: 'Reinvest|gym-story-invest;Finish|',
      acceptNextCardId: 'gym-story-invest',
      rejectNextCardId: 'gym-story-ignore',
      storylineId: 'edited-arc',
      storylineTitle: 'Edited Arc',
      'column:trigger': 'Event',
      'column:cost': '3',
      'column:coinDelta': '-25',
      'column:reputationDelta': '10',
    };
    for (const [key, value] of Object.entries(edits)) {
      const descriptor = descriptors.find((candidate) => candidate.key === key);
      expect(descriptor, `field ${key} is rendered`).toBeDefined();
      expect(descriptor?.editable).toBe(true);
      draft[key] = value;
    }

    const spec = buildUpdateSpec(descriptors, draft);
    expect(spec).not.toBeNull();
    if (!spec) return;
    expect(spec.id).toBe('gym-story-end');
    expect(spec.fields).toEqual({
      trigger: 'Event',
      cost: '3',
      coinDelta: '-25',
      reputationDelta: '10',
    });

    // Preview first: it validates and shows the diff, writing nothing.
    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, {
      kind: 'update-card',
      spec,
    });
    expect(preview.ok).toBe(true);
    expect(preview.rows[0].status).toBe('changed');
    expect(preview.rows[0].changedColumns).toEqual(
      expect.arrayContaining([
        'name',
        'effect',
        'hasChoices',
        'options',
        'acceptNextCardId',
        'rejectNextCardId',
        'storylineId',
        'storylineTitle',
        'trigger',
        'cost',
        'coinDelta',
        'reputationDelta',
      ]),
    );
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);

    // Apply through the bridge (the single author path).
    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: { kind: 'update-card', spec },
      expectedChecksum: preview.checksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);

    // Read the written card back: every edited field round-tripped.
    const written = card(GYM_CONTENT_ADAPTER, readFileSync(fixture.csvPath, 'utf-8'), 'gym-story-end');
    expect(written.name).toBe('The Endgame');
    expect(written.effect).toBe('Everything changes.');
    expect(written.hasChoices).toBe(true);
    expect(written.options).toBe('Reinvest|gym-story-invest;Finish|');
    expect(written.acceptNextCardId).toBe('gym-story-invest');
    expect(written.rejectNextCardId).toBe('gym-story-ignore');
    expect(written.storylineId).toBe('edited-arc');
    expect(written.storylineTitle).toBe('Edited Arc');
    expect(written.fields.trigger).toBe('Event');
    expect(written.fields.cost).toBe('3');
    expect(written.fields.coinDelta).toBe('-25');
    expect(written.fields.reputationDelta).toBe('10');

    // The regenerated manifest reflects the edit.
    const manifest = buildStorylineManifestFromCsv(
      readFileSync(fixture.csvPath, 'utf-8'),
      GYM_CONTENT_ADAPTER,
    );
    expect(manifest.storylineIds).toContain('edited-arc');
  });

  it('returns no spec when nothing changed (a no-op never reaches the bridge)', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const target = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-invest');
    const descriptors = buildCardFieldDescriptors(GYM_CONTENT_ADAPTER, target);
    expect(buildUpdateSpec(descriptors, draftFromDescriptors(descriptors))).toBeNull();
  });
});

describe('add-card form — creates a card and links it into a story-line', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('adds a card into a new story-line group through the author API', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const descriptors = buildNewCardFieldDescriptors(GYM_CONTENT_ADAPTER);
    const draft = draftFromDescriptors(descriptors);
    Object.assign(draft, {
      id: 'gym-story-bonus',
      name: 'A Bonus',
      effect: 'Gain 10 coins.',
      storylineId: 'bonus-arc',
      storylineTitle: 'Bonus Arc',
      'column:coinDelta': '10',
    });

    const spec = buildAddSpec(descriptors, draft);
    expect(spec.id).toBe('gym-story-bonus');
    expect(spec.storylineId).toBe('bonus-arc');
    expect(spec.storylineTitle).toBe('Bonus Arc');

    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, { kind: 'add-card', spec });
    // A single-member story-line is reachable by definition, so a new group
    // needs no incoming link (adding to an existing chain does — see below).
    expect(preview.ok).toBe(true);
    const added = preview.rows.find((row) => row.id === 'gym-story-bonus');
    expect(added?.status).toBe('added');
    expect(added?.after?.storylineId).toBe('bonus-arc');

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: { kind: 'add-card', spec },
      expectedChecksum: preview.checksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);

    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const written = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-bonus');
    expect(written.name).toBe('A Bonus');
    expect(written.storylineId).toBe('bonus-arc');
    expect(written.storylineTitle).toBe('Bonus Arc');
    expect(written.fields.coinDelta).toBe('10');

    // The card is a member of its own story-line group in the manifest.
    const manifest = buildStorylineManifestFromCsv(csv, GYM_CONTENT_ADAPTER);
    expect(manifest.storylineIds).toContain('bonus-arc');
    expect(
      manifest.nodes.find((node) => node.id === 'gym-story-bonus')?.storylineId,
    ).toBe('bonus-arc');
  });
});

describe('guided add-and-link — one transactional write', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('refuses an unlinked addition to an existing chain (unreachable)', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const preview = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'add-card',
      spec: {
        id: 'gym-story-detour',
        name: 'A Detour',
        storylineId: 'gym-story',
        storylineTitle: 'Gym Storyline',
      },
    });
    expect(preview.ok).toBe(false);
    expect(
      preview.validation.issues.some(
        (issue) => issue.code === 'unreachable-card' && issue.cardId === 'gym-story-detour',
      ),
    ).toBe(true);
  });

  it('adds the card and links it in from an existing card atomically', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const spec = {
      card: {
        id: 'gym-story-detour',
        name: 'A Detour',
        effect: 'Take the scenic route.',
        storylineId: 'gym-story',
        storylineTitle: 'Gym Storyline',
      },
      linkFrom: { id: 'gym-story-invest', label: 'Take the detour' },
    } as const;

    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, {
      kind: 'add-linked-card',
      spec,
    });
    expect(preview.ok).toBe(true);
    expect(preview.affectedIds).toEqual(
      expect.arrayContaining(['gym-story-detour', 'gym-story-invest']),
    );
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);

    const result = applyEdit({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      edit: { kind: 'add-linked-card', spec },
      expectedChecksum: preview.checksum,
      artefactPaths: artefactPaths(fixture),
      manualDocs: [],
    });
    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);

    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const added = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-detour');
    expect(added.storylineId).toBe('gym-story');
    const predecessor = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-invest');
    expect(predecessor.options).toBe(
      'Celebrate|gym-story-end;Double down|;Take the detour|gym-story-detour',
    );

    // The linked card is reachable: the regenerated validator verdict is valid.
    const after = previewEdit(csv, GYM_CONTENT_ADAPTER, {
      kind: 'update-card',
      spec: { id: 'gym-story-detour', effect: 'Take the scenic route, again.' },
    });
    expect(after.ok).toBe(true);
  });
});

describe('validation errors — attributed inline and the write is blocked', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('attributes a dangling successor to the Options field and blocks the write', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const target = card(GYM_CONTENT_ADAPTER, before, 'gym-story-start');
    const descriptors = buildCardFieldDescriptors(GYM_CONTENT_ADAPTER, target);
    const draft = draftFromDescriptors(descriptors);
    draft.options = 'Invest|gym-story-invest;Ignore|gym-story-ghost';

    const spec = buildUpdateSpec(descriptors, draft);
    expect(spec).not.toBeNull();
    if (!spec) return;

    const preview = previewEdit(before, GYM_CONTENT_ADAPTER, { kind: 'update-card', spec });
    expect(preview.ok).toBe(false);

    const errors = attributeEditErrors({
      descriptors,
      draft,
      cardId: 'gym-story-start',
      errors: preview.errors,
      issues: preview.validation.issues,
    });
    const inline = errors.filter((error) => error.field !== null);
    expect(inline.some((error) => error.field === 'options')).toBe(true);
    expect(inline.find((error) => error.field === 'options')?.message).toContain(
      'gym-story-ghost',
    );

    // The blocked write leaves the CSV byte-identical.
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });

  it('attributes a missing name, a dropped story-line id and an orphan link', () => {
    const csv = readFileSync(fixture.csvPath, 'utf-8');
    const start = card(GYM_CONTENT_ADAPTER, csv, 'gym-story-start');
    const descriptors = buildCardFieldDescriptors(GYM_CONTENT_ADAPTER, start);

    const blankName = attributeEditErrors({
      descriptors,
      draft: { ...draftFromDescriptors(descriptors), name: '' },
      cardId: start.id,
      errors: [],
      issues: [
        {
          code: 'missing-required-field',
          cardId: start.id,
          message: 'Card "gym-story-start" has an empty name.',
        },
      ],
    });
    expect(blankName[0].field).toBe('name');

    const droppedStoryline = attributeEditErrors({
      descriptors,
      draft: { ...draftFromDescriptors(descriptors), storylineId: '' },
      cardId: start.id,
      errors: [],
      issues: [
        {
          code: 'missing-storyline-id',
          cardId: start.id,
          message: 'Choice card "gym-story-start" declares no storyline id.',
        },
      ],
    });
    expect(droppedStoryline[0].field).toBe('storylineId');

    const orphan = attributeEditErrors({
      descriptors,
      draft: { ...draftFromDescriptors(descriptors), hasChoices: 'false', options: '' },
      cardId: start.id,
      errors: [],
      issues: [
        {
          code: 'orphan-link',
          cardId: start.id,
          message: 'Card "gym-story-start" declares accept/reject links but is not a choice card.',
        },
      ],
    });
    expect(orphan[0].field).toBe('hasChoices');
  });

  it('attributes a duplicate new-card id to the id field', () => {
    const descriptors = buildNewCardFieldDescriptors(GYM_CONTENT_ADAPTER);
    const draft = draftFromDescriptors(descriptors);
    draft.id = 'gym-story-start';
    draft.name = 'Copycat';

    const preview = previewEdit(readFileSync(fixture.csvPath, 'utf-8'), GYM_CONTENT_ADAPTER, {
      kind: 'add-card',
      spec: buildAddSpec(descriptors, draft),
    });
    expect(preview.ok).toBe(false);
    const errors = attributeEditErrors({
      descriptors,
      draft,
      cardId: null,
      errors: preview.errors,
      issues: preview.validation.issues,
    });
    expect(errors.some((error) => error.field === 'id')).toBe(true);
  });
});

describe('host content endpoint — the editable content the forms prefill from', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('serves the serialisable adapter schema plus the raw cards', () => {
    const session = loadEditorSession({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      artefactPaths: artefactPaths(fixture),
    });
    const content = buildEditorContent(session);

    expect(content.gameId).toBe('gym');
    expect(content.cards).toHaveLength(4);
    // Legacy link columns are present on the raw cards (the manifest omits
    // them, the forms need them to prefill).
    expect(Object.keys(content.cards[0].fields)).toEqual(
      expect.arrayContaining(['trigger', 'cost', 'coinDelta', 'reputationDelta']),
    );
    // The adapter projection is declarative data only — no functions cross the
    // wire.
    expect(content.adapter.fields.options).toBe('options');
    expect(content.adapter.newCardDefaults?.trigger).toBe('Incident');
    expect('describeImpact' in content.adapter).toBe(false);
    expect('baseId' in content.adapter).toBe(false);

    // The endpoint answers only its own path.
    const headers: Record<string, string> = {};
    let body = '';
    const handled = serveEditorContent(
      session,
      { url: EDITOR_CONTENT_PATH },
      { setHeader: (name, value) => { headers[name] = value; }, end: (value) => { body = value ?? ''; } },
    );
    expect(handled).toBe(true);
    expect(headers['Content-Type']).toContain('application/json');
    const parsed = JSON.parse(body) as { cards: unknown[]; checksum: string };
    expect(parsed.cards).toHaveLength(4);
    expect(parsed.checksum).toBe(session.checksum);

    expect(
      serveEditorContent(
        session,
        { url: '/manifest.json' },
        { setHeader: () => {}, end: () => {} },
      ),
    ).toBe(false);
  });
});

describe('the committed Gym content is never mutated', () => {
  it('still holds the original card names after every fixture edit above', () => {
    const csv = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    expect(csv).toContain('Public Investment');
    expect(csv).toContain('New Beginning');
    expect(csv).not.toContain('The Endgame');
    expect(csv).not.toContain('gym-story-detour');
  });
});
