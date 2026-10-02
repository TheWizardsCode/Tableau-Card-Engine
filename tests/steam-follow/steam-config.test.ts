/**
 * Unit tests for the Steam config loader (electron/steam-config.ts).
 *
 * Verifies the private-credentials contract (CG-0MSMAJQQT004SDCC producer
 * answer #2/#3): real values come from environment variables or a gitignored
 * local file, the committed example is placeholder-only, and a missing config
 * yields `null` so the launcher degrades gracefully (intake AC5).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadSteamConfig, loadSteamAppId } from '../../electron/steam-config';

const VALID_LOCAL = {
  app_id: '987654',
  developer_steam_id: '76561198011111111',
};

describe('loadSteamConfig()', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-steam-config-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when no config source is present', () => {
    expect(loadSteamConfig({ electronDir: dir, env: {} })).toBeNull();
  });

  it('prefers environment variables over files', () => {
    fs.writeFileSync(path.join(dir, 'steam-config.local.json'), JSON.stringify(VALID_LOCAL));
    const config = loadSteamConfig({
      electronDir: dir,
      env: { TCE_STEAM_APP_ID: '111', TCE_STEAM_DEVELOPER_STEAM_ID: '76561198022222222' },
    });
    expect(config).toEqual({
      appId: '111',
      developerSteamId: '76561198022222222',
      storeUrl: 'steam://store/111',
    });
  });

  it('reads the gitignored local file and derives the store URL', () => {
    fs.writeFileSync(path.join(dir, 'steam-config.local.json'), JSON.stringify(VALID_LOCAL));
    const config = loadSteamConfig({ electronDir: dir, env: {} });
    expect(config).toEqual({
      appId: '987654',
      developerSteamId: '76561198011111111',
      storeUrl: 'steam://store/987654',
    });
  });

  it('ignores an example file that still holds placeholder values', () => {
    fs.writeFileSync(
      path.join(dir, 'steam-config.example.json'),
      JSON.stringify({ app_id: '', developer_steam_id: '' }),
    );
    expect(loadSteamConfig({ electronDir: dir, env: {} })).toBeNull();
  });

  it('ignores a corrupt config file instead of throwing', () => {
    fs.writeFileSync(path.join(dir, 'steam-config.local.json'), '{ not json');
    expect(loadSteamConfig({ electronDir: dir, env: {} })).toBeNull();
  });
});

describe('loadSteamAppId()', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-steam-appid-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the env var first', () => {
    expect(loadSteamAppId({ appRoot: dir, env: { TCE_STEAM_APP_ID: '4242' } })).toBe('4242');
  });

  it('reads steam_appid.txt from the app root', () => {
    fs.writeFileSync(path.join(dir, 'steam_appid.txt'), '5555\n');
    expect(loadSteamAppId({ appRoot: dir, env: {} })).toBe('5555');
  });

  it('returns null when neither source exists', () => {
    expect(loadSteamAppId({ appRoot: dir, env: {} })).toBeNull();
    expect(loadSteamAppId({ env: {} })).toBeNull();
  });
});
