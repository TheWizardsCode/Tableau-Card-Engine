/**
 * Steam configuration loader — pure Node, no Electron.
 *
 * Loads Steam credentials from a local JSON file (gitignored) or environment
 * variables. Returns `null` when no config is available, so callers can
 * degrade gracefully (intake AC5).
 *
 * Files (resolved relative to the `electron/` directory):
 *  - `steam-config.example.json` — committed template with placeholders;
 *    used for development/reference only.
 *  - `steam-config.local.json` — **gitignored**; real credentials for the
 *    developer's machine.
 *
 * Precedence (highest → lowest):
 * 1. Environment variables (`TCE_STEAM_APP_ID`, `TCE_STEAM_DEVELOPER_STEAM_ID`)
 * 2. Local JSON file (`steam-config.local.json`)
 * 3. Example JSON file (`steam-config.example.json`) — development only
 *
 * This module is pure Node so it is unit-testable without the Electron
 * runtime (mirrors `content-locator.ts`).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface SteamConfig {
  /** Steam App ID for the TCE launcher. */
  appId: string;
  /** SteamID64 of the developer/publisher account (for follow detection). */
  developerSteamId: string;
  /** Steam store URL derived from the App ID (`steam://store/<appId>`). */
  storeUrl: string;
}

export interface SteamConfigOptions {
  /** Directory containing the config files. Defaults to the module's dir. */
  electronDir?: string;
  /** Process environment to read from (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
}

const CONFIG_FILE_LOCAL = 'steam-config.local.json';
const CONFIG_FILE_EXAMPLE = 'steam-config.example.json';

/** Directory of the compiled/loaded module (works under ESM). */
function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Load Steam configuration.
 *
 * Returns `null` when no usable configuration is available — callers must
 * treat this as "Steam disabled" and degrade gracefully.
 */
export function loadSteamConfig(options: SteamConfigOptions = {}): SteamConfig | null {
  const electronDir = options.electronDir ?? moduleDir();
  const env = options.env ?? process.env;

  const envAppId = env.TCE_STEAM_APP_ID;
  const envDevId = env.TCE_STEAM_DEVELOPER_STEAM_ID;
  if (envAppId && envDevId) {
    return makeConfig(envAppId, envDevId);
  }

  for (const file of [CONFIG_FILE_LOCAL, CONFIG_FILE_EXAMPLE]) {
    const configPath = path.join(electronDir, file);
    if (!fs.existsSync(configPath)) continue;
    const parsed = readConfigFile(configPath);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Read a Steam config JSON file, returning `null` when it is missing fields
 * (e.g. the committed example still has placeholder values).
 */
function readConfigFile(configPath: string): SteamConfig | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const appId = config['app_id'];
    const developerSteamId = config['developer_steam_id'];
    if (typeof appId === 'string' && appId && typeof developerSteamId === 'string' && developerSteamId) {
      return makeConfig(appId, developerSteamId);
    }
    return null;
  } catch {
    return null;
  }
}

function makeConfig(appId: string, developerSteamId: string): SteamConfig {
  return { appId, developerSteamId, storeUrl: `steam://store/${appId}` };
}

/**
 * Read the Steam App ID from the environment or `steam_appid.txt`
 * (the Steamworks SDK bootstrap convention). Returns `null` if absent.
 *
 * `steam_appid.txt` lives next to the launcher executable/app root; callers
 * pass the app root explicitly so this stays Electron-agnostic.
 */
export function loadSteamAppId(options: SteamConfigOptions & { appRoot?: string } = {}): string | null {
  const env = options.env ?? process.env;
  if (env.TCE_STEAM_APP_ID) return env.TCE_STEAM_APP_ID;

  const appRoot = options.appRoot;
  if (!appRoot) return null;
  const steamAppidPath = path.join(appRoot, 'steam_appid.txt');
  if (!fs.existsSync(steamAppidPath)) return null;
  try {
    const value = fs.readFileSync(steamAppidPath, 'utf-8').trim();
    return value || null;
  } catch {
    return null;
  }
}
