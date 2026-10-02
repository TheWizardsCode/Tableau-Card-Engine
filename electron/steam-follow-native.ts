/**
 * Loader for the optional custom native friends addon (Option A, P1
 * `CG-0MUNBHWY90051NAU` / P3 `CG-0MUNBHYAB0011XXW`).
 *
 * The addon (`native/steam-friends`, built on Windows x64) is **not** a
 * package.json dependency: ordinary installs and CI never need a native build.
 * `defaultNativeFriendsLoader` dynamically imports it and returns `null` on any
 * failure, so the launcher degrades to the manual self-attest path (intake
 * AC5) — a missing/invalid addon must never crash the app.
 *
 * Pure Node (no Electron import) so it is unit-testable with an injected
 * importer.
 */
import { createRequire } from 'module';
import type {
  NativeFriendsLoader,
  NativeFriendsModuleLike,
} from './steam-follow-steamworks.js';

/** Imports a specifier; injectable so tests avoid real dynamic imports. */
export type NativeFriendsImporter = (specifier: string) => Promise<unknown>;

const requireFromHere = createRequire(import.meta.url);

const defaultImporter: NativeFriendsImporter = async (specifier) => {
  try {
    // `.node` addons and CommonJS packages load through require; the packaged
    // app resolves `tce-steam-friends` from its unpacked node_modules.
    return requireFromHere(specifier);
  } catch {
    // Fall back to dynamic import for ESM packages.
    return import(/* @vite-ignore */ specifier);
  }
};

/** Environment override for local development (a specifier or absolute path). */
const ENV_SPECIFIER = process.env.TCE_STEAM_FRIENDS_MODULE;

/**
 * Specifiers tried in order. `tce-steam-friends` is the packaged module name
 * (P4 installs/unpacks it); the env override lets a dev point at a local build.
 */
export const NATIVE_FRIENDS_SPECIFIERS: readonly string[] = [
  ...(ENV_SPECIFIER ? [ENV_SPECIFIER] : []),
  'tce-steam-friends',
];

/**
 * Validate an arbitrary imported value against the frozen native-module shape
 * and bind its methods. Returns `null` when it is not a usable module.
 */
export function normaliseNativeFriendsModule(value: unknown): NativeFriendsModuleLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NativeFriendsModuleLike>;
  if (typeof candidate.isFollowing !== 'function') return null;

  const module: NativeFriendsModuleLike = {
    isFollowing: candidate.isFollowing.bind(candidate),
  };
  if (typeof candidate.init === 'function') {
    module.init = candidate.init.bind(candidate);
  }
  return module;
}

/**
 * Build a loader that tries each specifier in order and returns the first valid
 * module (or `null`). Never throws — an absent/invalid addon is expected.
 */
export function createNativeFriendsLoader(
  specifiers: readonly string[] = NATIVE_FRIENDS_SPECIFIERS,
  importer: NativeFriendsImporter = defaultImporter,
): NativeFriendsLoader {
  return async () => {
    for (const specifier of specifiers) {
      try {
        const module = normaliseNativeFriendsModule(await importer(specifier));
        if (module) return module;
      } catch {
        // Optional module absent or failed to load — try the next candidate.
      }
    }
    return null;
  };
}

/** Default loader used by `SteamworksFollowSource`. */
export const defaultNativeFriendsLoader: NativeFriendsLoader = createNativeFriendsLoader();
