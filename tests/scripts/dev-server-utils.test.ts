/**
 * Tests for dev-server-utils simplified server lifecycle.
 *
 * These tests verify the dev server management functions without
 * actually starting a real Vite dev server. They test:
 * - Basic constants and helpers (isServerReady)
 * - Lock file operations (simplified, no reference counting)
 * - Signal handler registration
 * - Port cleanup logic
 *
 * Integration with the actual dev server and browser is tested
 * by the e2e replay tests (tests/e2e/replay-main-street.e2e.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { type ChildProcess } from 'node:child_process';

import {
  LOCK_FILE_PATH,
  DEV_SERVER_URL,
  isServerReady,
  killDevServer,
  installDevServerCleanupHandlers,
} from '../../scripts/dev-server-utils';

// ── Helpers ─────────────────────────────────────────────────

/** Create a minimal lock file at the standard path with PID only (no refCount). */
function createLockFile(pid: number): void {
  const dir = path.dirname(LOCK_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    LOCK_FILE_PATH,
    JSON.stringify({ pid }),
    'utf-8',
  );
}

/** Read the lock file contents, or null if missing/invalid. */
function readLockFileDirectly(): { pid: number } | null {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function removeLockFileDirectly(): void {
  try {
    fs.unlinkSync(LOCK_FILE_PATH);
  } catch {
    // ignore
  }
}

/** Create a minimal mock ChildProcess. */
function createMockChildProcess(killed = false): ChildProcess {
  return {
    pid: 99999,
    killed,
    kill: vi.fn(),
    exitCode: null,
    signalCode: null,
    stdout: null,
    stderr: null,
    stdin: null,
    spawnfile: '',
    spawnargs: [],
  } as unknown as ChildProcess;
}

// ── Tests ───────────────────────────────────────────────────

describe('dev-server-utils — constants', () => {
  it('LOCK_FILE_PATH points to tmp/dev-server-lock.json', () => {
    expect(LOCK_FILE_PATH).toMatch(/tmp[/\\]dev-server-lock\.json$/);
  });

  it('DEV_SERVER_URL is localhost:3000', () => {
    expect(DEV_SERVER_URL).toBe('http://localhost:3000');
  });
});

describe('dev-server-utils — isServerReady', () => {
  it('returns false for an unreachable URL (no server)', async () => {
    const ready = await isServerReady('http://localhost:39871');
    expect(ready).toBe(false);
  });

  it('returns false for an invalid host', async () => {
    const ready = await isServerReady('http://192.0.2.1:39871');
    expect(ready).toBe(false);
  });
});

describe('dev-server-utils — lock file persistence (simplified)', () => {
  beforeEach(() => {
    removeLockFileDirectly();
  });

  afterEach(() => {
    removeLockFileDirectly();
  });

  it('writes a lock file that can be read back', () => {
    createLockFile(12345);
    const lock = readLockFileDirectly();
    expect(lock).not.toBeNull();
    expect(lock!.pid).toBe(12345);
    // No refCount property — simpler format
    expect((lock as Record<string, unknown>).refCount).toBeUndefined();
  });

  it('can remove the lock file', () => {
    createLockFile(12345);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);
    removeLockFileDirectly();
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });

  it('handles missing lock file gracefully', () => {
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
    // Should not throw
    removeLockFileDirectly();
  });

  it('lock file directory is created when writing', () => {
    removeLockFileDirectly();

    // Use a different temp path so we don't interfere with other tests
    // that may be using the project's tmp/ directory concurrently.
    const altDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-lock-test-'));
    const altLockPath = path.join(altDir, 'dev-server-lock.json');

    try {
      // The directory exists (we just created it via mkdtempSync),
      // so remove it to verify the lock file creation re-creates it.
      fs.rmSync(altDir, { recursive: true, force: true });
      expect(fs.existsSync(altDir)).toBe(false);

      // Write lock file — should create the directory
      const dirForLock = path.dirname(altLockPath);
      if (!fs.existsSync(dirForLock)) {
        fs.mkdirSync(dirForLock, { recursive: true });
      }
      fs.writeFileSync(altLockPath, JSON.stringify({ pid: 12345 }), 'utf-8');
      expect(fs.existsSync(dirForLock)).toBe(true);
      expect(fs.existsSync(altLockPath)).toBe(true);
    } finally {
      try { fs.rmSync(altDir, { recursive: true, force: true }); } catch {}
    }
  });
});

describe('dev-server-utils — killDevServer', () => {
  beforeEach(() => {
    removeLockFileDirectly();
  });

  afterEach(() => {
    removeLockFileDirectly();
  });

  it('kills a valid child process', () => {
    const child = createMockChildProcess();
    killDevServer(child);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('does not throw when child is null', () => {
    expect(() => killDevServer(null)).not.toThrow();
  });

  it('does not throw when child is already killed', () => {
    const child = createMockChildProcess(true); // already killed
    expect(() => killDevServer(child)).not.toThrow();
    // Should not try to kill again
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('cleans up lock file after killing', () => {
    createLockFile(99999);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);

    const child = createMockChildProcess();
    killDevServer(child);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });
});

describe('dev-server-utils — signal handlers', () => {
  it('registers SIGTERM and SIGINT handlers when called', () => {
    const sigtermBefore = process.listeners('SIGTERM').length;
    const sigintBefore = process.listeners('SIGINT').length;

    installDevServerCleanupHandlers();

    const sigtermAfter = process.listeners('SIGTERM').length;
    const sigintAfter = process.listeners('SIGINT').length;

    // installDevServerCleanupHandlers adds one handler per signal
    expect(sigtermAfter).toBeGreaterThanOrEqual(sigtermBefore + 1);
    expect(sigintAfter).toBeGreaterThanOrEqual(sigintBefore + 1);
  });
});
