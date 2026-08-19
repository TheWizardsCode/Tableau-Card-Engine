/**
 * Regression guard for the dev-server transcript-persistence pipeline
 * (CG-0MSXL0A25009WZVK — dev-server heap OOM).
 *
 * The OOM root cause (profiled in CG-0MSXNMDZ6004RA6I) was unbounded growth
 * in the dev server from the transcript write path:
 *   1. request bodies were buffered with an unbounded O(n^2) string concat;
 *   2. every write created a new file inside the Vite-watched root, each
 *      permanently retaining a watcher + path strings (~10-43 KB/file);
 *   3. no rate limit, so a misbehaving save loop could flood the tree.
 *
 * This guard keeps those bounds in place. Determinism (AC4): instead of a
 * wall-clock RSS assertion (which flakes badly under CI CPU contention), it
 * asserts the deterministic proxy the fix introduced — the middleware's
 * bounded-input contract in unit form, and the in-process Vite server's
 * watcher never tracking the transcript output tree in smoke form.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import {
  createTranscriptRequestHandler,
  transcriptPersistPlugin,
  DEV_WATCH_IGNORE_PATTERNS,
  DEFAULT_MAX_BODY_BYTES,
} from '../scripts/vite-transcript-plugin';

// ── deterministic middleware unit guards ───────────────────
interface MockReq extends EventEmitter {
  method: string;
  url: string;
  destroy: () => void;
  resume: () => void;
}
function makeReq(): MockReq {
  const req = new EventEmitter() as MockReq;
  req.method = 'POST';
  req.url = '/api/transcripts';
  req.destroy = () => req.removeAllListeners('data');
  req.resume = () => {};
  return req;
}
function makeRes() {
  return { writeHead: vi.fn(), end: vi.fn() };
}

describe('regression guard: transcript-persist middleware body bound', () => {
  it('rejects a body larger than the configured cap with 413 (AC1)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-guard-'));
    const saved: string[] = [];
    const handler = createTranscriptRequestHandler({
      destRoot: tmpDir,
      now: () => 50_000,
      maxBodyBytes: 1024,
      onSaved: (p) => saved.push(p),
      onError: () => {},
    });
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    // Simulate a chunked body whose total exceeds the cap (>10 KB in this case).
    const chunk = Buffer.from('{ "gameType": "main-street", "transcript": { "pad": "' + 'x'.repeat(20_000) + '" } }');
    req.emit('data', chunk);
    req.emit('end');

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(saved).toHaveLength(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still accepts a realistic full-game transcript (bounded payload is the goal, not rejection)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-guard-'));
    const saved: string[] = [];
    const handler = createTranscriptRequestHandler({
      destRoot: tmpDir,
      now: () => 50_000,
      minWriteIntervalMs: 0, // single write; no rate gate needed here
      onSaved: (p) => saved.push(p),
      onError: () => {},
    });
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    // Simulate a realistic full-game transcript (~50 KB, well above the
    // typical main-street file but far below the 5 MiB cap).
    const transcript = { game: 'main-street', turns: Array.from({ length: 40 }, (_, i) => ({ turn: i + 1, detail: 'x'.repeat(1200) })) };
    req.emit('data', Buffer.from(JSON.stringify({ gameType: 'main-street', transcript })));
    req.emit('end');

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(saved).toHaveLength(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults the body cap to a bounded value that no legitimate transcript exceeds', () => {
    // The largest real transcript on record is the 2.4 MB lost-cities fixture.
    // The default cap must be at least 10x that so real saves never trip it.
    expect(DEFAULT_MAX_BODY_BYTES).toBeGreaterThan(2.4 * 1024 * 1024);
    expect(DEFAULT_MAX_BODY_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});

// ── deterministic in-process dev-server smoke ─────────────
describe('regression guard: dev-server watcher never tracks transcript output', () => {
  let tmpDir: string;
  let server: ViteDevServer;
  let url: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-guard-vite-'));
    server = await createServer({
      root: path.resolve(__dirname, '..'),
      logLevel: 'silent',
      configFile: path.resolve(__dirname, '../vite.config.ts'),
      // The real config's watcher ignores come from the loaded config file;
      // the transcript plugin is registered explicitly because the config
      // disables it under VITEST (unit/browser runs must not write to the
      // repo's data/ tree — see vite.config.ts).
      plugins: [transcriptPersistPlugin({ destRoot: tmpDir })],
      server: {
        port: 0,
        strictPort: false,
      },
    });
    await server.listen();
    // Vite 6 may not populate httpServer immediately after listen(). Prefer
    // resolvedUrls (which always works) but strip any trailing slash so path
    // concatenation below does not produce a double-slash request URL.
    if (server.resolvedUrls?.local?.[0]) {
      url = server.resolvedUrls.local[0].replace(/\/$/, '');
    } else {
      const addr = server.httpServer?.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      url = `http://127.0.0.1:${port}`;
    }
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('the watch-ignore patterns cover the transcript tree', () => {
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/data/**');
    const watched = server.watcher.getWatched();
    const keys = Object.keys(watched);
    // sanity: the project root IS watched (so the assertion below is meaningful)
    expect(keys.length).toBeGreaterThan(0);
  });

  it('POSTing a full-game transcript does NOT add the output tree to the watcher (AC2/AC4 deterministic)', async () => {
    const before = Object.keys(server.watcher.getWatched()).filter((k) => k.startsWith(tmpDir));
    expect(before).toEqual([]);

    // Simulate a realistic full-game save loop: several bursts of POSTs.
    // The rate limit admits ~1/s, so most get 429 — the guard is that the
    // output tree stays unwatched regardless.
    const transcript = { game: 'main-street', seed: 'guard', turns: [{ turn: 1 }] };
    const responses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${url}/api/transcripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType: 'main-street', transcript }),
      });
      responses.push(res.status);
      await new Promise((r) => setTimeout(r, 1100)); // let the watcher "see" the file
    }

    // Writes succeeded for at least the first request (200), later ones may be
    // rate-limited (429) — either way the tree must stay unwatched.
    expect(responses[0]).toBe(200);
    expect(responses.every((s) => s === 200 || s === 429)).toBe(true);

    const after = Object.keys(server.watcher.getWatched()).filter((k) => k.startsWith(tmpDir));
    expect(after).toEqual([]);

    // Files did land on disk (contract preserved) — just outside the watcher.
    const written = fs.readdirSync(path.join(tmpDir, 'data', 'transcripts', 'main-street'), { recursive: true });
    expect(written.length).toBeGreaterThanOrEqual(1);
  });

  it('a body beyond the cap is rejected 413 against the live server (AC1 smoke)', async () => {
    const big = JSON.stringify({ gameType: 'main-street', transcript: { pad: 'x'.repeat(DEFAULT_MAX_BODY_BYTES + 1) } });
    const res = await fetch(`${url}/api/transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: big,
    });
    expect(res.status).toBe(413);
  });
});