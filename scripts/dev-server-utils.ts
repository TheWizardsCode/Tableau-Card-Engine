/**
 * Shared dev server management utilities.
 *
 * Provides helpers to start and stop the Vite dev server.
 *
 * LIFE CYCLE (simplified):
 *   - `ensureDevServer()`  kills any existing process on port 3000,
 *                           starts a fresh server, and returns it.
 *   - `killDevServer()`     unconditionally kills the child process,
 *                           cleans up any remaining process on port
 *                           3000, and removes the lock file.
 *
 * This replaces the old reference-counting pattern. There is no sharing
 * of servers across callers — each `ensureDevServer()` call gets its own
 * fresh server, and each `killDevServer()` call reliably destroys it.
 *
 * Crash resilience:
 *   - Before starting a new server, any process on port 3000 is killed
 *     (belt-and-suspenders via fuser / lsof).
 *   - A lock file (PID only) is written so that stale servers from
 *     previous sessions can be detected and cleaned.
 *   - SIGTERM/SIGINT handlers kill tracked child processes and remove
 *     the lock file on forced exit.
 *
 * Used by the replay tool and CLI export scripts.
 */

import { spawn, execSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';

// ── Constants ───────────────────────────────────────────────

export const DEV_SERVER_URL = 'http://localhost:3000';
export const DEV_SERVER_START_TIMEOUT = 30_000;
export const LOCK_FILE_PATH = path.join('tmp', 'dev-server-lock.json');

// ── Signal handler state ──────────────────────────────────────

let cleanupHandlersInstalled = false;

// Track the child process(es) started by this module so signal
// handlers can kill them on forced exit.
const trackedChildren: ChildProcess[] = [];

// ── Lock file helpers ───────────────────────────────────────

function ensureTmpDir(): void {
  const dir = path.dirname(LOCK_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Write a lock file containing only the PID (no reference count). */
function writeLockFile(pid: number): void {
  ensureTmpDir();
  fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify({ pid }), 'utf-8');
}

function removeLockFile(): void {
  try {
    fs.unlinkSync(LOCK_FILE_PATH);
  } catch {
    // Ignore — file may already be gone
  }
}

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

// ── Port conflict detection ─────────────────────────────────

/**
 * Check if port 3000 is in use by opening a test connection.
 * Returns true if something is listening on the port.
 *
 * This is a lightweight check that does NOT start an HTTP request;
 * it only checks the TCP level. Use `isServerReady()` to check if
 * an HTTP server is actually serving on the port.
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

// ── Port-based process killing ──────────────────────────────

/**
 * Kill any process listening on the given TCP port.
 *
 * Uses `fuser` (Linux) or `lsof` (macOS/Linux) to find and
 * terminate processes. This is a belt-and-suspenders fallback
 * for when the tracked child process is unavailable (e.g. after
 * a crash).
 */
export function killProcessOnPort(port: number): void {
  // Try fuser first (Linux)
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: 'ignore' });
    return;
  } catch {
    // fuser not available — fall through to lsof
  }

  // Try lsof (macOS / Linux)
  try {
    const result = execSync(`lsof -ti :${port} 2>/dev/null`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = result.trim().split('\n').filter(Boolean);
    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Already dead or permission denied
        }
      }
    }
  } catch {
    // No process found on this port, or lsof not available
  }
}

/**
 * Check for stale dev servers and clean them up.
 *
 * Kills any process on port 3000 and removes stale lock files.
 * Called automatically by `ensureDevServer()` before starting a
 * fresh server.
 */
export async function checkAndCleanupStaleDevServer(): Promise<void> {
  // Kill any existing process on port 3000
  killProcessOnPort(3000);
  // Clean up stale lock file
  removeLockFile();
}

// ── Signal handler registration ────────────────────────────

/**
 * Install SIGTERM and SIGINT handlers to clean up the lock file
 * and kill tracked child processes on forced exit.
 *
 * Safe to call multiple times — handlers are installed only once.
 */
export function installDevServerCleanupHandlers(): void {
  if (cleanupHandlersInstalled) return;
  cleanupHandlersInstalled = true;

  function onExit(): void {
    // Kill all tracked child processes
    for (const child of trackedChildren) {
      if (!child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          // May already be dead
        }
      }
    }
    trackedChildren.length = 0;

    // Belt-and-suspenders: kill any process still on port 3000
    killProcessOnPort(3000);

    // Remove lock file
    removeLockFile();
  }

  process.on('SIGTERM', onExit);
  process.on('SIGINT', onExit);

  // Don't block exit — these handlers clean up but let the process exit
  process.on('exit', () => {
    killProcessOnPort(3000);
    removeLockFile();
  });
}

/**
 * Track a child process so signal handlers can kill it on forced exit.
 */
export function trackChildProcess(child: ChildProcess): void {
  trackedChildren.push(child);
  child.on('exit', () => {
    const idx = trackedChildren.indexOf(child);
    if (idx !== -1) trackedChildren.splice(idx, 1);
  });
}

/**
 * Start a fresh dev server on port 3000.
 *
 * Before starting, kills any existing process on port 3000
 * (belt-and-suspenders cleanup). Always starts a new server.
 *
 * Returns the child process that was started.
 */
export async function ensureDevServer(): Promise<ChildProcess | null> {
  // Install cleanup handlers once
  installDevServerCleanupHandlers();

  // Kill any existing process on port 3000 — ensures a clean slate
  // even if a previous server was orphaned (crash, SIGKILL, etc.)
  killProcessOnPort(3000);
  removeLockFile();

  console.log('Starting dev server (npm run dev)...');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Track the child process for cleanup on signal
  trackChildProcess(child);

  // Write lock file with the server PID
  if (child.pid !== undefined) {
    writeLockFile(child.pid);
  }

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

  // Timeout — kill and throw
  child.kill('SIGTERM');
  removeLockFile();
  console.error(
    `Error: Dev server did not become ready within ${DEV_SERVER_START_TIMEOUT / 1000}s`,
  );
  process.exit(1);
}

/**
 * Unconditionally kill the dev server and clean up.
 *
 * Kills the provided child process, kills any remaining process on
 * port 3000 (belt-and-suspenders), and removes the lock file.
 *
 * Unlike the old reference-counting implementation, this always
 * cleans up entirely — there is no sharing across consumers.
 */
export function killDevServer(child: ChildProcess | null): void {
  // Kill the tracked child process
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM');
    } catch {
      // Already dead
    }
  }

  // Untrack the child so the exit handler doesn't conflict
  if (child) {
    const idx = trackedChildren.indexOf(child);
    if (idx !== -1) trackedChildren.splice(idx, 1);
  }

  // Belt-and-suspenders: kill any remaining process on port 3000
  killProcessOnPort(3000);

  // Remove lock file
  removeLockFile();

  console.log('Dev server stopped.');
}
