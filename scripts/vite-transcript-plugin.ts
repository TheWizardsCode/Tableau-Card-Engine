/**
 * Vite dev-server plugin for persisting game transcripts to disk.
 *
 * Handles POST /api/transcripts with a JSON body containing:
 *   { gameType: string, transcript: object }
 *
 * Writes transcripts to data/transcripts/<gameType>/<gameType>-<ISO-timestamp>.json
 * with sanitised filenames (colons replaced with hyphens, millisecond precision).
 *
 * This plugin should only be registered during `vite serve` (dev mode),
 * not during build or test runs.
 *
 * Memory-safety bounds (fix for CG-0MSXL0A25009WZVK — dev-server heap OOM):
 *   1. Request bodies are capped (default 5 MiB). The previous implementation
 *      accumulated the entire body with an unbounded, O(n^2) string concat
 *      (`body += chunk.toString()`) and JSON.parsed whatever arrived — a
 *      remote-triggerable heap-amplification vector on the --host-exposed dev
 *      server (a single large POST was measured buffering hundreds of MBs).
 *   2. Writes are rate-limited (default 1/second). Every transcript file
 *      landed inside the Vite-watched root previously added a permanently
 *      retained inotify watcher + path-segment strings/closure contexts
 *      (~10-43 KB/file measured), which grew without bound over dev sessions.
 *      The watcher ignore list is the other half of that fix (see
 *      DEV_WATCH_IGNORE_PATTERNS, wired into vite.config.ts).
 * The on-disk contract is unchanged: data/transcripts/<game>/... — replay
 * and export tooling read the same location/format.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Structural server-request type: the handler only needs a small surface, so
 * unit tests can pass a mock EventEmitter without casting through the full
 * node:http `IncomingMessage` type.
 */
export interface TranscriptRequest {
  method?: string;
  url?: string;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end' | 'error', listener: () => void): unknown;
  destroy?(): void;
  resume?(): void;
}

/** Structural server-response type (see {@link TranscriptRequest}). */
export interface TranscriptResponse {
  writeHead(statusCode: number, headers?: Record<string, string>): unknown;
  end(chunk?: unknown): unknown;
}

/** Fallback cap for request bodies when none is configured. */
export const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB — far above the largest real transcript (2.4 MB lost-cities fixture), bounded enough to make unbounded buffering impossible.
/** Minimum interval between accepted transcript writes. */
export const DEFAULT_MIN_WRITE_INTERVAL_MS = 1000;
/** On-disk transcript root, relative to the project root (unchanged contract). */
export const DEFAULT_TRANSCRIPT_ROOT = 'data/transcripts';

/**
 * Glob patterns for dev-output trees that must be excluded from Vite's file
 * watcher. Writes into these dirs (every game-over transcript POST, replay
 * capture output, monte-carlo results, build outputs) previously created
 * permanently-retained per-file watchers in the dev server (measured unbounded
 * memory growth). Wired into vite.config.ts `server.watch.ignored`.
 */
export const DEV_WATCH_IGNORE_PATTERNS: readonly string[] = [
  '**/data/**',
  '**/tmp/**',
  '**/results/**',
  '**/dist/**',
  '**/dist-electron/**',
  // Exclude worktree checkouts created by the implement/plan/audit skills.
  // Each worktree (node_modules, assets, layouts) contributes watchers to the
  // repo-level inotify budget; under 10+ concurrent worktrees the default
  // fs.inotify.max_user_watches (typically 8192) is exhausted, causing ENOSPC
  // failures in the vite-transcript-plugin-regression dev-server smoke and
  // other Vite-backed test suites (CG-0MTJ560IZ005XAZC / CG-0MTJ7A4Z3000MFMV).
  '**/.worklog/**',
] as const;

/** Options for {@link createTranscriptRequestHandler}. */
export interface TranscriptPersistOptions {
  /** Max accepted JSON body size in bytes (default 5 MiB). */
  maxBodyBytes?: number;
  /** Minimum interval between accepted writes in ms (default 1000). */
  minWriteIntervalMs?: number;
  /** Clock for deterministic rate-limit tests (default Date.now). */
  now?: () => number;
  /** Destination root the `data/transcripts` tree is resolved under (default process.cwd()). */
  destRoot?: string;
  /** Optional success callback (testable logging). */
  onSaved?: (path: string) => void;
  /** Optional error callback (testable logging). */
  onError?: (message: string) => void;
}

/**
 * Create the POST /api/transcripts request handler.
 *
 * Extracted from the plugin so the bounded-input behaviour (body cap, rate
 * limit, validation) is unit-testable with mock req/res streams.
 */
export function createTranscriptRequestHandler(
  options: TranscriptPersistOptions = {},
): (req: TranscriptRequest, res: TranscriptResponse) => void {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const minWriteIntervalMs = options.minWriteIntervalMs ?? DEFAULT_MIN_WRITE_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const destRoot = options.destRoot ?? process.cwd();
  const onError =
    options.onError ??
    ((message: string) => console.error(`[transcript-persist] Failed to save transcript: ${message}`));
  const onSaved =
    options.onSaved ?? ((p: string) => console.log(`[transcript-persist] Saved transcript to ${p}`));

  let lastWriteAt = 0;

  return function handleTranscriptRequest(req: TranscriptRequest, res: TranscriptResponse): void {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let aborted = false;

    const respond = (code: number, payload: unknown): void => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const rejectOversized = (): void => {
      if (aborted) return;
      aborted = true;
      respond(413, { success: false, error: `Request body exceeds ${maxBodyBytes} bytes` });
      // Stop consuming the rest of an oversized body immediately.
      try {
        req.destroy?.();
      } catch {
        req.resume?.();
      }
    };

    // Rate-limit gate BEFORE reading the body: burst traffic is shed without
    // buffering anything.
    if (now() - lastWriteAt < minWriteIntervalMs) {
      respond(429, {
        success: false,
        error: 'Transcript write rate limit exceeded; retry shortly',
      });
      req.resume?.();
      return;
    }

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        rejectOversized();
        return;
      }
      chunks.push(chunk);
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      respond(400, { success: false, error: 'Client aborted request' });
    });

    req.on('end', () => {
      if (aborted) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
      } catch {
        respond(400, { success: false, error: 'Invalid JSON body' });
        return;
      }

      const { gameType, transcript } = parsed as { gameType?: unknown; transcript?: unknown };

      if (typeof gameType !== 'string' || gameType.length === 0) {
        respond(400, { success: false, error: 'Missing or invalid gameType' });
        return;
      }
      if (transcript === undefined || transcript === null) {
        respond(400, { success: false, error: 'Missing transcript' });
        return;
      }

      // Double-check the interval at completion too (the initial check passes
      // for the first request of a burst; the write timestamp only advances on
      // success, so a failed parse/validation does not eat the rate budget).
      const t = now();
      if (t - lastWriteAt < minWriteIntervalMs) {
        respond(429, {
          success: false,
          error: 'Transcript write rate limit exceeded; retry shortly',
        });
        return;
      }

      const timestamp = sanitiseTimestamp(new Date().toISOString());
      const fileName = `${gameType}-${timestamp}.json`;
      const outPath = resolve(destRoot, DEFAULT_TRANSCRIPT_ROOT, gameType, fileName);

      try {
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');
        lastWriteAt = t;
        onSaved(outPath);
        respond(200, { success: true, path: outPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError(message);
        respond(500, { success: false, error: message });
      }
    });
  };
}

/**
 * Sanitise an ISO timestamp for use in filenames.
 * Replaces colons with hyphens to avoid filesystem issues on Windows.
 * Example: 2026-01-15T14:30:45.123Z -> 2026-01-15T14-30-45.123Z
 */
function sanitiseTimestamp(iso: string): string {
  return iso.replace(/:/g, '-');
}

/**
 * Vite plugin that provides a POST /api/transcripts endpoint for
 * persisting game transcripts to the local filesystem during development.
 */
export function transcriptPersistPlugin(options: TranscriptPersistOptions = {}): Plugin {
  const handler = createTranscriptRequestHandler(options);
  return {
    name: 'transcript-persist',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/transcripts') {
          return next();
        }
        handler(req, res);
      });
    },
  };
}