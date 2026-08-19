/**
 * Unit tests for the dev-server transcript persistence middleware
 * (scripts/vite-transcript-plugin.ts) — the fix for CG-0MSXL0A25009WZVK.
 *
 * These assert the bounded-behaviour contract added by the fix:
 *   1. valid transcripts still persist to the SAME on-disk location/format
 *      (data/transcripts/<gameType>/...) so replay/export tooling is
 *      unaffected;
 *   2. oversized request bodies are rejected (413) instead of being buffered
 *      unboundedly in memory (the previous `body += chunk.toString()` with no
 *      limit — a remote-triggerable heap-amplification vector on the
 *      --host-exposed dev server);
 *   3. rapid successive writes are rate-limited (429) so a misbehaving client
 *      (or buggy save loop) cannot create thousands of watched-tree files per
 *      second — each new file in the Vite-watched root previously added a
 *      permanently-retained inotify watcher + path strings (measured
 *      unbounded growth, ~10-43 KB/file);
 *   4. malformed input is rejected with 400 (not 500).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createTranscriptRequestHandler,
  DEV_WATCH_IGNORE_PATTERNS,
} from '../../scripts/vite-transcript-plugin';
import viteConfig from '../../vite.config';

// ── request/response mocks ─────────────────────────────────
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
  req.destroy = () => {
    req.removeAllListeners('data');
  };
  req.resume = () => {};
  return req;
}

function makeRes() {
  return {
    writeHead: vi.fn(),
    end: vi.fn((_body?: unknown) => undefined),
  };
}

/** Emit a JSON payload through a request as a single data chunk. */
function sendJson(req: MockReq, payload: unknown): void {
  req.emit('data', Buffer.from(JSON.stringify(payload)));
  req.emit('end');
}

function responseBody(res: ReturnType<typeof makeRes>): { success?: boolean; error?: string; path?: string } {
  const raw = res.end.mock.calls[0]?.[0] as string | undefined;
  return raw ? (JSON.parse(raw) as { success?: boolean; error?: string; path?: string }) : {};
}

describe('createTranscriptRequestHandler (dev-server transcript persistence bounds)', () => {
  let tmpDir: string;
  let savedPaths: string[];
  let fakeNow: number;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-transcript-fix-'));
    savedPaths = [];
    fakeNow = 10_000; // far enough from 0 that the first write is never rate-limited
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeHandler(overrides: Parameters<typeof createTranscriptRequestHandler>[0] = {}) {
    return createTranscriptRequestHandler({
      destRoot: tmpDir,
      now: () => fakeNow,
      onSaved: (p) => savedPaths.push(p),
      onError: () => {},
      ...overrides,
    });
  }

  it('persists a valid transcript to the same on-disk location/format and returns 200', () => {
    const handler = makeHandler();
    const req = makeReq();
    const res = makeRes();

    handler(req, res);
    sendJson(req, {
      gameType: 'main-street',
      transcript: { game: 'main-street', seed: 'abc', result: 'loss', finalScore: 7 },
    });

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    const body = responseBody(res);
    expect(body.success).toBe(true);
    // Contract: data/transcripts/<gameType>/<gameType>-<ISO>.json (same as before the fix)
    expect(body.path).toMatch(/data\/transcripts\/main-street\/main-street-[\dTZ.:-]+\.json$/);
    expect(body.path).toContain(tmpDir);

    const abs = path.join(tmpDir, body.path!.replace(tmpDir, '').replace(/^[\\/]/, ''));
    expect(fs.existsSync(abs)).toBe(true);
    const written = JSON.parse(fs.readFileSync(abs, 'utf8'));
    expect(written.seed).toBe('abc');
    expect(written.finalScore).toBe(7);
  });

  it('rejects an oversized request body with 413 and writes nothing', () => {
    const handler = makeHandler({ maxBodyBytes: 100 });
    const req = makeReq();
    const res = makeRes();

    handler(req, res);
    sendJson(req, { gameType: 'main-street', transcript: { big: 'x'.repeat(400) } });

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(responseBody(res).success).toBe(false);
    // no partial write and no files at all
    expect(savedPaths).toHaveLength(0);
    const writtenFiles: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else writtenFiles.push(p);
      }
    };
    walk(path.join(tmpDir, 'data'));
    expect(writtenFiles).toHaveLength(0);
  });

  it('rate-limits rapid successive writes with 429 and keeps only the first', () => {
    const handler = makeHandler();
    // first write accepted
    const req1 = makeReq();
    const res1 = makeRes();
    handler(req1, res1);
    sendJson(req1, { gameType: 'main-street', transcript: { n: 1 } });
    expect(res1.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

    // second write 1ms later → rejected
    fakeNow += 1;
    const req2 = makeReq();
    const res2 = makeRes();
    handler(req2, res2);
    sendJson(req2, { gameType: 'main-street', transcript: { n: 2 } });
    expect(res2.writeHead).toHaveBeenCalledWith(429, expect.any(Object));
    expect(responseBody(res2).success).toBe(false);
    expect(savedPaths).toHaveLength(1);
  });

  it('accepts a write once the rate-limit interval has elapsed', () => {
    const handler = makeHandler({ minWriteIntervalMs: 1000 });
    const req1 = makeReq();
    const res1 = makeRes();
    handler(req1, res1);
    sendJson(req1, { gameType: 'main-street', transcript: { n: 1 } });
    expect(res1.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

    fakeNow += 1001;
    const req2 = makeReq();
    const res2 = makeRes();
    handler(req2, res2);
    sendJson(req2, { gameType: 'main-street', transcript: { n: 2 } });
    expect(res2.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(savedPaths).toHaveLength(2);
  });

  it('rejects malformed JSON with 400', () => {
    const handler = makeHandler();
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    req.emit('data', Buffer.from('{ not json'));
    req.emit('end');
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(savedPaths).toHaveLength(0);
  });

  it('rejects a missing gameType with 400', () => {
    const handler = makeHandler();
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    sendJson(req, { transcript: { x: 1 } });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(savedPaths).toHaveLength(0);
  });

  it('rejects a missing transcript with 400', () => {
    const handler = makeHandler();
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    sendJson(req, { gameType: 'golf' });
    expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(savedPaths).toHaveLength(0);
  });

  it('accepts payloads up to the configured cap (boundary)', () => {
    // cap set just above the payload so the request is accepted
    const payload = JSON.stringify({ gameType: 'main-street', transcript: { big: 'x'.repeat(100) } });
    const handler = makeHandler({ maxBodyBytes: payload.length + 10 });
    const req = makeReq();
    const res = makeRes();
    handler(req, res);
    req.emit('data', Buffer.from(payload));
    req.emit('end');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(savedPaths).toHaveLength(1);
  });
});

describe('dev-server watcher ignores dev-output trees (transcript write path)', () => {
  it('vite.config.ts wires the shared watch-ignore patterns', () => {
    // Invoke the exported config factory the same way Vite does in serve mode.
    const resolved = viteConfig({ mode: 'development', command: 'serve' });
    const ignored = resolved.server?.watch?.ignored ?? [];
    expect(ignored).toContain('**/data/**');
    expect(ignored).toContain('**/tmp/**');
    expect(ignored).toContain('**/results/**');
  });

  it('DEV_WATCH_IGNORE_PATTERNS covers every dev-output growth directory', () => {
    // The transcript pipeline writes into data/transcripts; the other
    // patterns guard the remaining known growth dirs (test/replay output,
    // monte-carlo results, build outputs).
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/data/**');
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/tmp/**');
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/results/**');
    expect(DEV_WATCH_IGNORE_PATTERNS).toContain('**/dist/**');
  });
});
