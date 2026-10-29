/**
 * Unit tests for the story-line editor CLI and its host wiring.
 *
 * The editor must launch from the core repo root (`npm run storylines:editor
 * -- --help`, epic AC1), load a content CSV through a content adapter (AC2)
 * and keep the page/manifest URL contract in sync. The host is not bound to a
 * port in these tests: the middleware is exercised directly and the Vite
 * server is created without listening, so the suite stays fast and hermetic.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONTENT_PATH,
  GYM_CONTENT_ADAPTER,
} from '../../../src/story-line/content/adapters';
import {
  buildStorylineManifestFromCsv,
  type StorylineManifest,
} from '../../../src/story-line/content/manifest';
import {
  parseStorylineEditorArgs,
  parseEditorApplyRequest,
  isContentAdapter,
  loadEditorManifest,
  resolveAdapterSpecifier,
  resolveEditorAdapter,
  runStorylineEditorCli,
  EDITOR_USAGE,
  type StorylineEditorCliDeps,
} from '../../../scripts/storyline-editor-cli';
import {
  createEditorHost,
  serveEditorManifest,
  storylineEditorManifestPlugin,
  EDITOR_MANIFEST_PLUGIN_NAME,
} from '../../../scripts/storyline-editor-server';
import {
  EDITOR_CONTENT_PATH,
  EDITOR_CONTENT_URL,
  EDITOR_MANIFEST_PATH,
  EDITOR_MANIFEST_URL,
} from '../../../tools/storyline-editor/config';
import { EDITOR_PAGE_ROOT, EDITOR_SERVER_PORT } from '../../../vite.editor.config';
import { CONTENT_CSV_PATH, REPO_ROOT, copyEditorFixtureFiles } from './fixtures';

/** Builds the Gym manifest from the committed content CSV. */
function gymManifest(): StorylineManifest {
  return buildStorylineManifestFromCsv(readFileSync(CONTENT_CSV_PATH, 'utf-8'), GYM_CONTENT_ADAPTER);
}

/** A structurally valid adapter for injected-importer tests. */
const FIXTURE_ADAPTER = {
  gameId: 'fixture',
  columns: ['id', 'name', 'effect'],
  fields: { id: 'id', name: 'name', effect: 'effect' },
};

/** Captures everything written to stdout/stderr while an argv is parsed. */
function captureParseError(argv: readonly string[]): string {
  try {
    parseStorylineEditorArgs(argv);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

/** Runs the async CLI with its process streams captured. */
async function captureCli(
  argv: readonly string[],
  deps: StorylineEditorCliDeps = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await runStorylineEditorCli(argv, deps);
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe('parseStorylineEditorArgs', () => {
  it('defaults to the Gym content, the editor port and loopback', () => {
    expect(parseStorylineEditorArgs([])).toEqual({
      help: false,
      port: EDITOR_SERVER_PORT,
      host: '127.0.0.1',
      contentPath: DEFAULT_CONTENT_PATH,
      adapterRef: undefined,
      apply: undefined,
      dryRun: false,
    });
  });

  it('parses every documented flag', () => {
    expect(
      parseStorylineEditorArgs([
        '--content',
        'custom/storylines.csv',
        '--adapter',
        './my-adapter.ts',
        '--port',
        '5180',
        '--host',
        '0.0.0.0',
        '--apply',
        '{"edit":{"kind":"update-card","spec":{"id":"a","name":"b"}}}',
        '--dry-run',
        '--help',
      ]),
    ).toEqual({
      help: true,
      port: 5180,
      host: '0.0.0.0',
      contentPath: 'custom/storylines.csv',
      adapterRef: './my-adapter.ts',
      apply: '{"edit":{"kind":"update-card","spec":{"id":"a","name":"b"}}}',
      dryRun: true,
    });
  });

  it('rejects a non-numeric or out-of-range port', () => {
    expect(captureParseError(['--port', 'nope'])).toContain('--port must be an integer');
    expect(captureParseError(['--port', '70000'])).toContain('--port must be an integer');
    expect(captureParseError(['--port'])).toContain('--port must be an integer');
  });
});

describe('editor page/host contract', () => {
  it('serves the manifest at the path the page fetches', () => {
    expect(EDITOR_MANIFEST_URL).toBe('./manifest.json');
    expect(EDITOR_MANIFEST_PATH).toBe('/manifest.json');
    expect(`.${EDITOR_MANIFEST_PATH}`).toBe(EDITOR_MANIFEST_URL);
  });

  it('serves the editable content at the path the page fetches', () => {
    expect(EDITOR_CONTENT_URL).toBe('./content.json');
    expect(EDITOR_CONTENT_PATH).toBe('/content.json');
    expect(`.${EDITOR_CONTENT_PATH}`).toBe(EDITOR_CONTENT_URL);
  });
});

describe('resolveAdapterSpecifier', () => {
  it('turns relative and absolute paths into file URLs', () => {
    expect(resolveAdapterSpecifier('./adapters/my-game.ts', '/repo')).toBe(
      'file:///repo/adapters/my-game.ts',
    );
    expect(resolveAdapterSpecifier('/abs/adapter.mjs', '/repo')).toBe('file:///abs/adapter.mjs');
  });

  it('leaves bare and scoped package specifiers untouched', () => {
    expect(resolveAdapterSpecifier('gym', '/repo')).toBe('gym');
    expect(resolveAdapterSpecifier('@scope/tce-adapter', '/repo')).toBe('@scope/tce-adapter');
  });
});

describe('isContentAdapter', () => {
  it('accepts the shipped Gym adapter and a valid fixture', () => {
    expect(isContentAdapter(GYM_CONTENT_ADAPTER)).toBe(true);
    expect(isContentAdapter(FIXTURE_ADAPTER)).toBe(true);
  });

  it('rejects anything that is not a declarative content adapter', () => {
    expect(isContentAdapter(undefined)).toBe(false);
    expect(isContentAdapter('gym')).toBe(false);
    expect(isContentAdapter({ gameId: 'x', columns: [] })).toBe(false);
    expect(
      isContentAdapter({ gameId: '', columns: [], fields: { id: 'id', name: 'name' } }),
    ).toBe(false);
    expect(isContentAdapter({ gameId: 'x', columns: [] })).toBe(false);
  });
});

describe('resolveEditorAdapter', () => {
  it('defaults to the shipped Gym adapter and resolves shipped ids', async () => {
    expect(await resolveEditorAdapter()).toBe(GYM_CONTENT_ADAPTER);
    expect(await resolveEditorAdapter('gym')).toBe(GYM_CONTENT_ADAPTER);
  });

  it('loads an adapter module through the injected importer (default / adapter / contentAdapter exports)', async () => {
    const seen: string[] = [];
    const importer = async (specifier: string): Promise<unknown> => {
      seen.push(specifier);
      return { default: FIXTURE_ADAPTER };
    };

    expect(await resolveEditorAdapter('./my-adapter.ts', importer, '/repo')).toEqual(FIXTURE_ADAPTER);
    expect(seen).toEqual(['file:///repo/my-adapter.ts']);

    expect(
      await resolveEditorAdapter('some-package', async () => ({ adapter: FIXTURE_ADAPTER })),
    ).toEqual(FIXTURE_ADAPTER);
    expect(
      await resolveEditorAdapter('some-package', async () => ({ contentAdapter: FIXTURE_ADAPTER })),
    ).toEqual(FIXTURE_ADAPTER);
  });

  it('reports an unresolvable adapter instead of inventing one', async () => {
    expect(
      await resolveEditorAdapter('./missing.ts', async () => {
        throw new Error('not found');
      }),
    ).toBeUndefined();
    expect(await resolveEditorAdapter('./bad.ts', async () => ({ default: { gameId: 'x' } }))).toBeUndefined();
    expect(await resolveEditorAdapter('unknown-id', async () => undefined)).toBeUndefined();
  });
});

describe('loadEditorManifest (content CSV through the adapter)', () => {
  it('builds the manifest from the committed Gym content and adapter', () => {
    const loaded = loadEditorManifest(CONTENT_CSV_PATH, GYM_CONTENT_ADAPTER);
    expect(loaded.csvPath).toBe(CONTENT_CSV_PATH);
    expect(loaded.manifest.gameId).toBe('gym');
    expect(loaded.manifest.nodes).toHaveLength(4);
    expect(loaded.manifest.edges).toHaveLength(6);
  });

  it('reads a synthetic CSV through a synthetic adapter', () => {
    const temp = mkdtempSync(join(tmpdir(), 'tce-editor-adapter-'));
    try {
      const csvPath = join(temp, 'cards.csv');
      writeFileSync(
        csvPath,
        'key,title,flavour,arc\none,First,It starts,arc-1\ntwo,Second,It ends,arc-1\n',
        'utf-8',
      );
      const adapter = {
        gameId: 'fixture',
        columns: ['key', 'title', 'flavour', 'arc'],
        fields: { id: 'key', name: 'title', effect: 'flavour', storylineId: 'arc' },
      };
      const { manifest } = loadEditorManifest(csvPath, adapter);
      expect(manifest.gameId).toBe('fixture');
      expect(manifest.nodes.map((node) => node.id)).toEqual(['one', 'two']);
      expect(manifest.storylineIds).toEqual(['arc-1']);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('fails with an actionable message when the CSV is unreadable', () => {
    expect(() => loadEditorManifest('/no/such/storylines.csv', GYM_CONTENT_ADAPTER)).toThrow(
      /cannot read .*storylines\.csv/,
    );
  });
});

describe('serveEditorManifest', () => {
  it('serves the manifest JSON at the editor manifest path (query strings included)', () => {
    const manifest = gymManifest();
    const calls: { headers: Record<string, string>; body: string }[] = [];
    let headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      end: (body?: string) => {
        calls.push({ headers: { ...headers }, body: body ?? '' });
        headers = {};
      },
    };

    expect(serveEditorManifest(manifest, { url: '/manifest.json' }, response)).toBe(true);
    expect(serveEditorManifest(manifest, { url: '/manifest.json?v=2' }, response)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].headers['Content-Type']).toContain('application/json');
    expect(calls[0].headers['Cache-Control']).toBe('no-store');
    expect(calls[0].body).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(JSON.parse(calls[1].body)).toEqual(manifest);
  });

  it('hands other requests to the next middleware', () => {
    let ended = false;
    const handled = serveEditorManifest(gymManifest(), { url: '/app.ts' }, {
      setHeader: () => undefined,
      end: () => {
        ended = true;
      },
    });
    expect(handled).toBe(false);
    expect(ended).toBe(false);
  });
});

describe('storylineEditorManifestPlugin', () => {
  it('registers a middleware that serves the manifest and chains other URLs', () => {
    const manifest = gymManifest();
    const middlewares: ((req: { url?: string }, res: unknown, next: () => void) => void)[] = [];
    const plugin = storylineEditorManifestPlugin(manifest);
    expect(plugin.name).toBe(EDITOR_MANIFEST_PLUGIN_NAME);
    const configureServer = plugin.configureServer as unknown as
      | ((server: unknown) => void)
      | undefined;
    configureServer?.({
      middlewares: {
        use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) =>
          middlewares.push(fn),
      },
    });

    expect(middlewares).toHaveLength(1);

    const bodies: string[] = [];
    const response = {
      setHeader: () => undefined,
      end: (body?: string) => bodies.push(body ?? ''),
    };
    let chained = 0;
    middlewares[0]({ url: '/manifest.json' }, response, () => {
      chained += 1;
    });
    middlewares[0]({ url: '/app.ts' }, response, () => {
      chained += 1;
    });

    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0])).toEqual(manifest);
    expect(chained).toBe(1);
  });
});

describe('createEditorHost', () => {
  it('composes the dedicated editor config with the manifest middleware (no listen)', async () => {
    const host = await createEditorHost({
      manifest: gymManifest(),
      port: 5199,
      host: '127.0.0.1',
      listen: false,
      logLevel: 'silent',
    });
    try {
      expect(host.server.config.root.endsWith(EDITOR_PAGE_ROOT)).toBe(true);
      expect(host.server.config.server.port).toBe(5199);
      expect(host.server.config.plugins.some((plugin) => plugin.name === EDITOR_MANIFEST_PLUGIN_NAME)).toBe(true);
      expect(host.url).toBeUndefined();
    } finally {
      await host.close();
    }
  });
});

describe('runStorylineEditorCli', () => {
  it('prints usage and exits 0 on --help', async () => {
    const { code, stdout, stderr } = await captureCli(['--help']);
    expect(code).toBe(0);
    expect(stderr).toBe('');

    // The usage text is the user-facing contract: every documented flag.
    expect(stdout).toContain('Usage:');
    for (const flag of ['--content', '--adapter', '--port', '--host', '--apply', '--dry-run', '--help']) {
      expect(stdout).toContain(flag);
    }
    expect(stdout).toBe(`${EDITOR_USAGE}\n`);
  });

  it('exits 1 with the usage text when an option is invalid', async () => {
    const { code, stderr } = await captureCli(['--port', 'nope']);
    expect(code).toBe(1);
    expect(stderr).toContain('--port must be an integer');
    expect(stderr).toContain('Usage:');
  });

  it('exits 1 for an unknown adapter and for unreadable content', async () => {
    const unknown = await captureCli(['--adapter', 'no-such-adapter'], {
      importer: async () => undefined,
    });
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('unknown --adapter');

    const missing = await captureCli(['--content', '/no/such/file.csv']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('cannot read');
  });

  it('is the script wired into package.json', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.['storylines:editor']).toContain('scripts/storyline-editor-cli.ts');
  });

  it('runs `npm run storylines:editor -- --help` from the repo root and exits 0 (AC1)', () => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['run', '--silent', 'storylines:editor', '--', '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--adapter');
  });
});

describe('headless --apply (the same bridge, no dev server)', () => {
  it('is wired into the CLI run: a refused edit exits non-zero and leaves the content byte-identical', async () => {
    const before = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    const payload = JSON.stringify({
      edit: { kind: 'update-card', spec: { id: 'gym-story-start', options: 'Invest|gym-story-invest;Ignore|gym-story-ghost' } },
    });

    const { code, stdout, stderr } = await captureCli([
      '--content',
      DEFAULT_CONTENT_PATH,
      '--apply',
      payload,
    ]);

    expect(code).toBe(1);
    expect(stderr).toContain('refused to write');
    expect(stderr).toContain('gym-story-ghost');

    const result = JSON.parse(stdout) as {
      ok: boolean;
      status: string;
      written: boolean;
      errors: string[];
    };
    expect(result.ok).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.written).toBe(false);
    expect(result.errors.join(' ')).toContain('gym-story-ghost');

    // The content CSV is byte-identical after the refused edit.
    expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).toBe(before);
  });

  it('applies a valid edit against a fixture copy and regenerates the artefacts', async () => {
    const fixture = copyEditorFixtureFiles();
    try {
      const before = readFileSync(fixture.csvPath, 'utf-8');
      const payload = JSON.stringify({
        edit: { kind: 'update-card', spec: { id: 'gym-story-invest', name: 'Municipal Investment' } },
        artefactPaths: { json: fixture.manifestPath, mermaid: fixture.mermaidPath },
      });

      const { code, stdout, stderr } = await captureCli([
        '--content',
        fixture.csvPath,
        '--apply',
        payload,
      ]);

      expect(stderr).toBe('');
      expect(code).toBe(0);
      const result = JSON.parse(stdout) as {
        ok: boolean;
        status: string;
        written: boolean;
        artefacts: { ok: boolean; regenerated: boolean };
        manualDocumentationRequired: boolean;
      };
      expect(result.ok).toBe(true);
      expect(result.status).toBe('applied');
      expect(result.written).toBe(true);
      expect(result.artefacts.ok).toBe(true);
      expect(result.artefacts.regenerated).toBe(true);
      // The Gym demo section documents the edited row by hand.
      expect(result.manualDocumentationRequired).toBe(true);

      expect(readFileSync(fixture.csvPath, 'utf-8')).toBe(
        before.replace('Public Investment', 'Municipal Investment'),
      );
      expect(readFileSync(fixture.manifestPath, 'utf-8')).toContain('Municipal Investment');
    } finally {
      fixture.cleanup();
    }
  });

  it('supports dry-run: exit 0 and nothing written', async () => {
    const before = readFileSync(CONTENT_CSV_PATH, 'utf-8');
    const payload = JSON.stringify({
      edit: { kind: 'update-card', spec: { id: 'gym-story-invest', name: 'Municipal Investment' } },
      dryRun: true,
    });

    const { code, stdout } = await captureCli([
      '--content',
      DEFAULT_CONTENT_PATH,
      '--apply',
      payload,
    ]);

    expect(code).toBe(0);
    const result = JSON.parse(stdout) as { status: string; written: boolean };
    expect(result.status).toBe('dry-run');
    expect(result.written).toBe(false);
    expect(readFileSync(CONTENT_CSV_PATH, 'utf-8')).toBe(before);
  });

  it('rejects a malformed payload with a non-zero exit', async () => {
    const { code, stderr } = await captureCli([
      '--content',
      DEFAULT_CONTENT_PATH,
      '--apply',
      '{not json',
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain('--apply must be JSON');
  });
});

describe('parseEditorApplyRequest', () => {
  it('parses inline JSON, an @file payload and rejects bad shapes', () => {
    const inline = parseEditorApplyRequest(
      '{"edit":{"kind":"update-card","spec":{"id":"a","name":"b"}},"dryRun":true}',
    );
    expect('request' in inline).toBe(true);
    if ('request' in inline) {
      expect(inline.request.edit.kind).toBe('update-card');
      expect(inline.request.dryRun).toBe(true);
      expect(inline.request.expectedChecksum).toBeUndefined();
    }

    const badJson = parseEditorApplyRequest('nope');
    expect('error' in badJson ? badJson.error : '').toContain('JSON');
    const missingEdit = parseEditorApplyRequest('{"a":1}');
    expect('error' in missingEdit ? missingEdit.error : '').toContain('"edit"');
    const badKind = parseEditorApplyRequest('{"edit":{"kind":"boom","spec":{}}}');
    expect('error' in badKind ? badKind.error : '').toContain('boom');
    const bare = parseEditorApplyRequest(
      '{"edit":{"kind":"update-card","spec":{"id":"a","name":"b"}}}',
    );
    if (!('error' in bare)) {
      expect(bare.request.artefactPaths).toBeUndefined();
    }
  });

  it('reads an @file payload relative to baseDir', () => {
    const temp = mkdtempSync(join(tmpdir(), 'tce-editor-apply-'));
    try {
      const file = join(temp, 'edit.json');
      writeFileSync(
        file,
        '{"edit":{"kind":"set-storyline","spec":{"id":"a","storylineId":"arc","storylineTitle":"Arc"}}}',
        'utf-8',
      );
      const parsed = parseEditorApplyRequest(`@${file}`, temp);
      expect('request' in parsed).toBe(true);
      if ('request' in parsed) {
        expect(parsed.request.edit.kind).toBe('set-storyline');
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
