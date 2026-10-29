/**
 * The editor host's write-bridge API endpoints.
 *
 * The host serves three `POST` endpoints over the same bridge the page will
 * call: `/api/preview` (diff + validation report), `/api/validate` (report
 * only) and `/api/apply` (the only write). These tests drive the handler
 * without a socket (`handleEditorApiRequest`) — the endpoint contract for
 * status codes, bodies and session refresh — plus the body reader and the
 * plugin wiring.
 *
 * Everything runs against a temp fixture copy; the committed Gym content and
 * artefacts are never touched.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { computeContentChecksum } from '../../../src/story-line/content/csv';
import {
  EDITOR_API_PLUGIN_NAME,
  EDITOR_API_PATHS,
  handleEditorApiRequest,
  loadEditorSession,
  readJsonBody,
  storylineEditorApiPlugin,
  type EditorSession,
} from '../../../scripts/storyline-editor-server';
import { CONTENT_CSV_PATH, copyEditorFixtureFiles, type EditorFixtureFiles } from './fixtures';

/** A valid rename edit. */
const RENAME = {
  edit: { kind: 'update-card', spec: { id: 'gym-story-invest', name: 'Municipal Investment' } },
} as const;

/** A dangling edit (an option retargeted at a card that does not exist). */
const DANGLING = {
  edit: {
    kind: 'update-card',
    spec: { id: 'gym-story-start', options: 'Invest|gym-story-invest;Ignore|gym-story-ghost' },
  },
} as const;

/** A fake request stream for {@link readJsonBody}. */
function stream(text: string, chunkSize = 7): AsyncIterable<string> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe('loadEditorSession', () => {
  let fixture: EditorFixtureFiles;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('captures the content snapshot, its manifest and the concurrency checksum', () => {
    const session = loadEditorSession({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      artefactPaths: { json: fixture.manifestPath, mermaid: fixture.mermaidPath },
    });

    expect(session.contentPath).toBe(fixture.csvPath);
    expect(session.checksum).toBe(computeContentChecksum(session.csv));
    expect(session.manifest.gameId).toBe('gym');
    expect(session.manifest.nodes).toHaveLength(4);
    expect(session.readManifest().nodes).toHaveLength(4);
  });

  it('reload() re-reads the file and produces a fresh snapshot', () => {
    const session = loadEditorSession({ contentPath: fixture.csvPath, adapter: GYM_CONTENT_ADAPTER });
    writeFileSync(fixture.csvPath, `${session.csv}extra\n`, 'utf-8');

    const reloaded = session.reload();
    expect(reloaded.csv).not.toBe(session.csv);
    expect(reloaded.checksum).not.toBe(session.checksum);
  });

  it('fails with an actionable message when the CSV is unreadable', () => {
    expect(() =>
      loadEditorSession({ contentPath: join(fixture.dir, 'missing.csv'), adapter: GYM_CONTENT_ADAPTER }),
    ).toThrow(/cannot read/);
  });
});

describe('handleEditorApiRequest', () => {
  let fixture: EditorFixtureFiles;
  let session: EditorSession;

  beforeEach(() => {
    fixture = copyEditorFixtureFiles();
    session = loadEditorSession({
      contentPath: fixture.csvPath,
      adapter: GYM_CONTENT_ADAPTER,
      artefactPaths: { json: fixture.manifestPath, mermaid: fixture.mermaidPath },
    });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  const post = (path: string, body?: unknown) =>
    handleEditorApiRequest(session, { method: 'POST', path, body });

  it('preview returns 200 with the diff and validation report, nothing written', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const outcome = post(EDITOR_API_PATHS.preview, RENAME);

    expect(outcome.response.status).toBe(200);
    expect(outcome.response.body).toMatchObject({ ok: true, kind: 'update-card' });
    const preview = outcome.response.body as {
      rows: { id: string; before: { name: string } }[];
      report: string;
    };
    expect(preview.rows[0].id).toBe('gym-story-invest');
    expect(preview.rows[0].before.name).toBe('Public Investment');
    expect(preview.report).toContain('RESULT: VALID');
    // Previews and validations never produce a new session.
    expect(outcome.session).toBeUndefined();
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });

  it('validate returns 200 with the report and no diff', () => {
    const outcome = post(EDITOR_API_PATHS.validate, DANGLING);
    expect(outcome.response.status).toBe(200);
    const body = outcome.response.body as { ok: boolean; errors: string[]; report: string };
    expect(body.ok).toBe(false);
    expect(body.errors.join(' ')).toContain('gym-story-ghost');
    expect(body.report).toContain('RESULT: INVALID');
  });

  it('apply accepts a valid edit, reloads the session and serves the new manifest', () => {
    const outcome = post(EDITOR_API_PATHS.apply, RENAME);
    expect(outcome.response.status).toBe(200);
    const body = outcome.response.body as { ok: boolean; written: boolean; manifest: { nodes: { id: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.written).toBe(true);
    // The regenerated manifest is included so the page can refresh without a
    // second fetch, and the session is swapped for a reloaded one.
    expect(body.manifest.nodes.some((node) => node.id === 'gym-story-invest')).toBe(true);

    const reloaded = outcome.session as EditorSession;
    expect(reloaded).toBeDefined();
    expect(reloaded.checksum).not.toBe(session.checksum);
    expect(reloaded.csv).toContain('Municipal Investment');

    // The next preview runs against the reloaded session, so the applied
    // rename is now the base: a further edit sees it as `before`.
    const next = handleEditorApiRequest(reloaded, {
      method: 'POST',
      path: EDITOR_API_PATHS.preview,
      body: {
        edit: { kind: 'update-card', spec: { id: 'gym-story-invest', name: 'Civic Investment' } },
      },
    });
    const nextBody = next.response.body as {
      ok: boolean;
      rows: { before: { name: string } | null; status: string }[];
    };
    expect(nextBody.ok).toBe(true);
    expect(nextBody.rows[0].status).toBe('changed');
    expect(nextBody.rows[0].before?.name).toBe('Municipal Investment');
  });

  it('apply refuses an invalid edit with 422 and a byte-identical file', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    const outcome = post(EDITOR_API_PATHS.apply, DANGLING);

    expect(outcome.response.status).toBe(422);
    const body = outcome.response.body as { ok: boolean; written: boolean; status: string };
    expect(body.ok).toBe(false);
    expect(body.written).toBe(false);
    expect(body.status).toBe('invalid');
    expect(outcome.session).toBeUndefined();
    expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(before);
  });

  it('apply refuses a stale snapshot with 409 and a reload instruction', () => {
    const before = readFileSync(fixture.csvPath, 'utf-8');
    // Someone else edits the file after the session was loaded.
    writeFileSync(fixture.csvPath, before.replace('Public Investment', 'Public Works'), 'utf-8');

    const outcome = post(EDITOR_API_PATHS.apply, RENAME);
    expect(outcome.response.status).toBe(409);
    const body = outcome.response.body as { ok: boolean; reloadRequired: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.reloadRequired).toBe(true);
    expect(body.message).toMatch(/reload/i);
    expect(readFileSync(fixture.csvPath, 'utf-8')).toContain('Public Works');
  });

  it('applies with an explicit caller-supplied checksum (client-side snapshot token)', () => {
    const body = { ...RENAME, expectedChecksum: session.checksum };
    const outcome = post(EDITOR_API_PATHS.apply, body);
    expect(outcome.response.status).toBe(200);
  });

  it('rejects unknown paths (404), wrong methods (405) and malformed bodies (400)', () => {
    expect(post('/api/nope').response.status).toBe(404);
    expect(
      handleEditorApiRequest(session, { method: 'GET', path: EDITOR_API_PATHS.apply }).response
        .status,
    ).toBe(405);

    const bad = handleEditorApiRequest(session, {
      method: 'POST',
      path: EDITOR_API_PATHS.apply,
      body: { edit: { kind: 'update-card' } },
    });
    expect(bad.response.status).toBe(400);
    expect((bad.response.body as { error: string }).error).toContain('spec');

    const unknownKind = handleEditorApiRequest(session, {
      method: 'POST',
      path: EDITOR_API_PATHS.apply,
      body: { edit: { kind: 'explode', spec: {} } },
    });
    expect(unknownKind.response.status).toBe(400);
    expect((unknownKind.response.body as { error: string }).error).toContain('explode');
  });
});

describe('readJsonBody', () => {
  it('parses chunked JSON and rejects empty bodies as undefined', async () => {
    expect(await readJsonBody(stream('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonBody(stream('   '))).toBeUndefined();
  });

  it('rejects bodies over the byte limit', async () => {
    await expect(readJsonBody(stream('{"pad":"xxxxx"}'), 8)).rejects.toThrow(/exceeds 8 bytes/);
  });
});

describe('storylineEditorApiPlugin', () => {
  it('registers one middleware with the documented name', () => {
    const session = loadEditorSession({
      contentPath: CONTENT_CSV_PATH,
      adapter: GYM_CONTENT_ADAPTER,
    });
    const plugin = storylineEditorApiPlugin(session);
    expect(plugin.name).toBe(EDITOR_API_PLUGIN_NAME);
    const middlewares: ((req: unknown, res: unknown, next: () => void) => void)[] = [];
    const configureServer = plugin.configureServer as unknown as
      | ((server: unknown) => void)
      | undefined;
    configureServer?.({
      middlewares: {
        use: (fn: (req: unknown, res: unknown, next: () => void) => void) => middlewares.push(fn),
      },
    });
    expect(middlewares).toHaveLength(1);
  });
});
