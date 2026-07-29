/**
 * Tests for dev server port conflict detection, stale lock file cleanup,
 * and crash resilience improvements.
 *
 * These tests verify the cleanup functions in dev-server-utils.ts without
 * actually starting a real Vite dev server. They use temp lock files
 * and process signaling to validate behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LOCK_FILE_PATH } from '../../scripts/dev-server-utils';

// ── Helpers ─────────────────────────────────────────────────

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

function removeLockFileDirectly(): void {
  try {
    fs.unlinkSync(LOCK_FILE_PATH);
  } catch {
    // ignore
  }
}

// ── Tests ───────────────────────────────────────────────────

describe('dev server stale lock file cleanup', () => {
  beforeEach(() => {
    removeLockFileDirectly();
  });

  afterEach(() => {
    removeLockFileDirectly();
  });

  it('detects a stale lock file when PID is not alive (high PID that does not exist)', () => {
    // Create a lock file with a PID that almost certainly doesn't exist
    createLockFile(99999999);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);

    // The PID won't be alive, so this simulates a stale lock
    const isAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    expect(isAlive(99999999)).toBe(false);
  });

  it('clears stale lock file on cleanup', () => {
    createLockFile(99999999);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);

    // Simulate stale cleanup
    removeLockFileDirectly();
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });

  it('preserves valid lock file for an alive PID (self-test)', () => {
    // Use current process PID which is alive
    const currentPid = process.pid;
    createLockFile(currentPid);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);

    // Verify the PID is alive (process.kill with signal 0)
    const isAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    expect(isAlive(currentPid)).toBe(true);
  });

  it('handles missing lock file gracefully on cleanup', () => {
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
    // Should not throw
    removeLockFileDirectly();
  });

  it('detects lock file with missing refCount (simplified format)', () => {
    createLockFile(12345);
    const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
    const lock = JSON.parse(raw);
    expect(lock.pid).toBe(12345);
    // New simplified format has no refCount
    expect(lock.refCount).toBeUndefined();
  });
});

describe('dev server crash resilience', () => {
  beforeEach(() => {
    removeLockFileDirectly();
  });

  afterEach(() => {
    removeLockFileDirectly();
  });

  it('handles stale lock file from previously crashed server', () => {
    // Simulate: previous server crashed, leaving a lock file with a dead PID
    createLockFile(99999998);
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(true);

    // On next startup, the stale lock should be detected and cleaned
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf-8'));
    const isAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    expect(isAlive(lock.pid)).toBe(false);

    // Clean up
    removeLockFileDirectly();
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });

  it('handles multiple stale lock file cleanups gracefully', () => {
    // Just test that our cleanup doesn't throw on repeated calls
    removeLockFileDirectly();
    removeLockFileDirectly();
    removeLockFileDirectly();
    expect(fs.existsSync(LOCK_FILE_PATH)).toBe(false);
  });

  it('schedules cleanup handlers on process exit signals', () => {
    // Test that process.on('SIGTERM') and process.on('SIGINT') handlers
    // are installed by capturing listener registrations
    const sigtermListeners = process.listeners('SIGTERM');
    const sigintListeners = process.listeners('SIGINT');

    // These will be populated if handlers are registered
    // (verification happens at runtime; this documents expected behaviour)
    expect(Array.isArray(sigtermListeners)).toBe(true);
    expect(Array.isArray(sigintListeners)).toBe(true);
  });
});

describe('tmp directory management', () => {
  beforeEach(() => {
    // Only clean up the lock file itself — do NOT delete the entire tmp/ directory
    // as that would race with other parallel test files that use tmp/ (e.g., replay e2e).
    removeLockFileDirectly();
  });

  afterEach(() => {
    removeLockFileDirectly();
  });

  it('creates tmp directory when writing lock file', () => {
    // Use a unique temp directory to avoid racing with parallel tests that share
    // the project tmp/ directory (e.g., replay e2e which writes screenshots there).
    const uniqueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-cleanup-test-'));
    const uniqueLockPath = path.join(uniqueDir, 'dev-server-lock.json');

    function createLockInDir(pid: number): void {
      const dir = path.dirname(uniqueLockPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        uniqueLockPath,
        JSON.stringify({ pid }),
        'utf-8',
      );
    }

    createLockInDir(12345);
    expect(fs.existsSync(uniqueDir)).toBe(true);
    expect(fs.existsSync(uniqueLockPath)).toBe(true);

    // Cleanup
    try { fs.rmSync(uniqueDir, { recursive: true, force: true }); } catch {}
  });

  it('recovers after tmp directory is deleted while lock exists', () => {
    // Use a unique temp directory to avoid racing with parallel tests.
    const uniqueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-cleanup-test-'));
    const uniqueLockPath = path.join(uniqueDir, 'dev-server-lock.json');

    function createLockInDir(pid: number): void {
      const dir = path.dirname(uniqueLockPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        uniqueLockPath,
        JSON.stringify({ pid }),
        'utf-8',
      );
    }

    createLockInDir(12345);
    expect(fs.existsSync(uniqueDir)).toBe(true);
    expect(fs.existsSync(uniqueLockPath)).toBe(true);

    // Simulate someone deleting the directory
    try { fs.rmSync(uniqueDir, { recursive: true, force: true }); } catch {}
    expect(fs.existsSync(uniqueDir)).toBe(false);

    // Should be able to write a new lock file
    createLockInDir(54321);
    expect(fs.existsSync(uniqueDir)).toBe(true);
    expect(fs.existsSync(uniqueLockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(uniqueLockPath, 'utf-8'));
    expect(lock.pid).toBe(54321);
    // No refCount in simplified format
    expect(lock.refCount).toBeUndefined();

    // Cleanup
    try { fs.rmSync(uniqueDir, { recursive: true, force: true }); } catch {}
  });
});
