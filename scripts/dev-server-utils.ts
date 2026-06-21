/**
 * Shared dev server management utilities.
 *
 * Provides helpers to detect, start, and stop the Vite dev server.
 * Uses reference counting (via a lock file) to ensure the server is
 * only killed when ALL consumers have finished, preventing races
 * when parallel Vitest workers share the same dev server.
 *
 * Includes crash-resilience improvements:
 * - Stale lock file detection and cleanup on startup
 * - SIGTERM/SIGINT handlers for graceful shutdown
 * - Port conflict detection (checks if something is already on port 3000)
 *
 * Used by the replay tool and CLI export scripts.
 */

import { spawn } from 'node:child_process';
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

interface LockFile {
  pid: number;
  refCount: number;
}

function ensureTmpDir(): void {
  const dir = path.dirname(LOCK_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readLockFile(): LockFile | null {
  try {
    const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
    return JSON.parse(raw) as LockFile;
  } catch {
    return null;
  }
}

function writeLockFile(pid: number, refCount: number): void {
  ensureTmpDir();
  fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify({ pid, refCount }), 'utf-8');
}

function removeLockFile(): void {
  try {
    fs.unlinkSync(LOCK_FILE_PATH);
  } catch {
    // Ignore — file may already be gone
  }
}

/** Check whether a PID is still alive (Unix: signal 0 test). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

/**
 * Attempt to clean up a stale dev server on port 3000.
 *
 * Checks if the server is reachable and a lock file exists. If the
 * lock file PID is dead, removes the stale lock. If no lock file
 * exists but something is on the port, logs a warning.
 */
export async function checkAndCleanupStaleDevServer(): Promise<void> {
  const ready = await isServerReady(DEV_SERVER_URL);
  const lock = readLockFile();

  if (ready && lock && !isPidAlive(lock.pid)) {
    console.warn(
      `[dev-server-utils] Port 3000 is in use but lock file PID ${lock.pid} is dead. ` +
        'Removing stale lock file.',
    );
    removeLockFile();
  } else if (ready && !lock) {
    console.warn(
      '[dev-server-utils] Port 3000 is in use by an unknown process. ' +
        'The dev server may fail to start if the port is held by a non-Vite process.',
    );
  }
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

    // Remove lock file
    removeLockFile();
  }

  process.on('SIGTERM', onExit);
  process.on('SIGINT', onExit);

  // Don't block exit — these handlers clean up but let the process exit
  process.on('exit', () => {
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
 * Start the dev server if not already running.
 *
 * Uses reference counting via a lock file: if the server is already
 * running and its PID is alive, the ref count is incremented and
 * `null` is returned. If the server is not running or its PID is
 * dead, a new server is started with refCount = 1.
 *
 * Returns the child process (if this call started the server) or
 * `null` (if the server was already running).
 */
export async function ensureDevServer(): Promise<ChildProcess | null> {
  const ready = await isServerReady(DEV_SERVER_URL);
  const lock = readLockFile();

  if (ready && lock && isPidAlive(lock.pid)) {
    // Server is running and lock file is valid — increment ref count
    const newRefCount = lock.refCount + 1;
    writeLockFile(lock.pid, newRefCount);
    console.log(
      `Dev server already running at ${DEV_SERVER_URL} (refCount: ${lock.refCount} → ${newRefCount})`,
    );
    return null;
  }

  // Stale lock file — clean it up
  if (lock && !isPidAlive(lock.pid)) {
    console.log('Removing stale dev server lock file (PID not alive).');
    removeLockFile();
  }

  // Check for port conflicts before starting
  const portInUse = await isPortInUse(3000);
  if (portInUse) {
    const serverReady = await isServerReady(DEV_SERVER_URL);
    if (serverReady) {
      console.warn(
        '[dev-server-utils] Port 3000 is in use but server is not responding as expected. ' +
          'Attempting to start anyway (the existing process may be stale).',
      );
    } else {
      console.warn(
        '[dev-server-utils] Port 3000 is in use by a non-responsive process. ' +
          'Attempting to start — the OS will resolve the conflict if possible.',
      );
    }
  }

  // Install cleanup handlers once
  installDevServerCleanupHandlers();

  console.log('Starting dev server (npm run dev)...');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Track the child process for cleanup on signal
  trackChildProcess(child);

  // Write lock file with refCount = 1
  if (child.pid !== undefined) {
    writeLockFile(child.pid, 1);
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

  // Timeout — kill and exit
  child.kill('SIGTERM');
  removeLockFile();
  console.error(
    `Error: Dev server did not become ready within ${DEV_SERVER_START_TIMEOUT / 1000}s`,
  );
  process.exit(1);
}

/**
 * Release a reference to the dev server.
 *
 * Decrements the reference count in the lock file. Only kills the
 * server when the ref count reaches zero (i.e., all consumers have
 * finished using it).
 *
 * If `child` is provided and the lock file PID matches, the child
 * is killed when refCount reaches zero. If `child` is null (i.e.,
 * this consumer did not start the server), the lock file is still
 * decremented to ensure proper cleanup.
 */
export function killDevServer(child: ChildProcess | null): void {
  const lock = readLockFile();

  if (!lock) {
    // No lock file — fall back to unconditional kill (legacy behaviour)
    if (child && !child.killed) {
      child.kill('SIGTERM');
      // Untrack the child so the exit handler doesn't conflict
      const idx = trackedChildren.indexOf(child);
      if (idx !== -1) trackedChildren.splice(idx, 1);
      console.log('Dev server stopped (no lock file).');
    }
    return;
  }

  // Verify the lock file PID is still alive before touching ref count
  if (!isPidAlive(lock.pid)) {
    // Server already died — clean up stale lock file
    console.log('Dev server lock file found but PID is dead. Cleaning up.');
    removeLockFile();
    return;
  }

  const newRefCount = Math.max(0, lock.refCount - 1);
  console.log(`Dev server refCount: ${lock.refCount} → ${newRefCount}`);

  if (newRefCount > 0) {
    // Other consumers are still using the server — just decrement
    writeLockFile(lock.pid, newRefCount);
    return;
  }

  // Ref count reached zero — kill the server and clean up
  removeLockFile();
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child.on('exit', () => {
      // Untrack after exit
      const idx = trackedChildren.indexOf(child);
      if (idx !== -1) trackedChildren.splice(idx, 1);
    });
    console.log('Dev server stopped.');
  } else if (isPidAlive(lock.pid)) {
    // Child handle is null (this consumer didn't start the server),
    // but the server PID is alive and refCount is 0 — kill by PID
    try {
      process.kill(lock.pid, 'SIGTERM');
      console.log('Dev server stopped (by PID).');
    } catch {
      // May already be dead
    }
  }
}
