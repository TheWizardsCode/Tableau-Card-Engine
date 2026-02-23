/**
 * Shared dev server management utilities.
 *
 * Provides helpers to detect, start, and stop the Vite dev server.
 * Used by the replay tool and CLI export scripts.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import http from 'node:http';

// ── Constants ───────────────────────────────────────────────

export const DEV_SERVER_URL = 'http://localhost:3000';
export const DEV_SERVER_START_TIMEOUT = 30_000;

// ── Functions ───────────────────────────────────────────────

/** Check if a URL is reachable with an HTTP GET. */
export function isServerReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume(); // consume response body
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Start the dev server if not already running. Returns the child process (or null). */
export async function ensureDevServer(): Promise<ChildProcess | null> {
  const ready = await isServerReady(DEV_SERVER_URL);
  if (ready) {
    console.log('Dev server already running at', DEV_SERVER_URL);
    return null;
  }

  console.log('Starting dev server (npm run dev)...');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for the server to become ready
  const start = Date.now();
  while (Date.now() - start < DEV_SERVER_START_TIMEOUT) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const ok = await isServerReady(DEV_SERVER_URL);
    if (ok) {
      console.log('Dev server is ready.');
      return child;
    }
  }

  // Timeout -- kill and exit
  child.kill('SIGTERM');
  console.error(
    `Error: Dev server did not become ready within ${DEV_SERVER_START_TIMEOUT / 1000}s`,
  );
  process.exit(1);
}

/** Kill the dev server process if we started it. */
export function killDevServer(child: ChildProcess | null): void {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    console.log('Dev server stopped.');
  }
}
