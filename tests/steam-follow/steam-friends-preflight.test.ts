/**
 * Unit tests for the P4 Steam packaging pre-flight (CG-0MUNBHYY0001PHKU).
 *
 * The pure evaluator is injected with a platform and resolver, so these run on
 * any host with no native build and no Steamworks SDK.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  evaluateSteamFriends,
  NATIVE_FRIENDS_MODULE,
} from '../../scripts/check-steam-friends.mjs';
import { isWindows, stageAddon } from '../../scripts/build-steam-friends.mjs';

describe('evaluateSteamFriends', () => {
  it('passes on win32 when the addon resolves', () => {
    const result = evaluateSteamFriends({
      platform: 'win32',
      resolveModule: (name) => `/resolved/${name}`,
    });

    expect(result.ok).toBe(true);
    expect(result.guidance).toBeUndefined();
  });

  it('fails with actionable guidance on win32 when the addon is missing', () => {
    const result = evaluateSteamFriends({
      platform: 'win32',
      resolveModule: () => {
        throw new Error('not installed');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.guidance).toContain(NATIVE_FRIENDS_MODULE);
    expect(result.guidance).toContain('build:steam-friends');
  });

  it('passes with a Windows-only warning on non-Windows hosts', () => {
    const result = evaluateSteamFriends({
      platform: 'linux',
      resolveModule: () => {
        throw new Error('not installed');
      },
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toContain('Windows-only');
  });
});

describe('build-steam-friends staging', () => {
  it('reports whether the addon can be built on a platform', () => {
    expect(isWindows('win32')).toBe(true);
    expect(isWindows('linux')).toBe(false);
    expect(isWindows('darwin')).toBe(false);
  });

  it('stages a built addon as the tce-steam-friends module', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-steam-friends-'));
    try {
      const from = path.join(tmp, 'built', 'steam_friends.node');
      fs.mkdirSync(path.dirname(from), { recursive: true });
      fs.writeFileSync(from, 'native-binary');

      const toDir = path.join(tmp, 'node_modules', 'tce-steam-friends');
      const staged = stageAddon({ from, toDir });

      expect(fs.existsSync(staged)).toBe(true);
      expect(fs.readFileSync(staged, 'utf-8')).toBe('native-binary');

      const pkg = JSON.parse(fs.readFileSync(path.join(toDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('tce-steam-friends');
      expect(pkg.main).toBe('build/Release/steam_friends.node');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
