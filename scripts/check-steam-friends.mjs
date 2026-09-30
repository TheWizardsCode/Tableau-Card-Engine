/**
 * Pre-flight check for the Option A native friends addon in a Steam build
 * (P4, CG-0MUNBHYY0001PHKU).
 *
 * A Steam distribution build wants **automatic** follow detection, which needs
 * the `tce-steam-friends` addon. This check fails early with actionable
 * guidance when it is missing, instead of silently shipping a launcher that
 * only offers the manual self-attest fallback.
 *
 * Only invoked by `package:steam`; ordinary `package` builds never run it, so
 * non-Steam builds are unaffected. The addon is Windows-only.
 *
 * Exported `evaluateSteamFriends()` is pure (injectable platform + resolver) so
 * it is unit-testable without a native build.
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const requireFromHere = createRequire(import.meta.url);

/** Bare specifier the loader (`electron/steam-follow-native.ts`) resolves. */
export const NATIVE_FRIENDS_MODULE = 'tce-steam-friends';

const BUILD_GUIDANCE = [
  '        Build and stage the native addon first (Windows x64):',
  '',
  '            npm run build:steam-friends',
  '',
  '        It requires Visual Studio Build Tools; no Steamworks SDK is needed',
  '        at build time (all Steam symbols are resolved at runtime).',
].join('\n');

/**
 * Evaluate whether the native friends addon is available for a Steam build.
 *
 * @param {object} [options]
 * @param {string} [options.platform] `process.platform` override.
 * @param {(name: string) => string} [options.resolveModule] Module resolver override.
 * @returns {{ ok: boolean, warning?: string, guidance?: string }}
 */
export function evaluateSteamFriends(options = {}) {
  const platform = options.platform ?? process.platform;
  const resolveModule =
    options.resolveModule ?? ((name) => requireFromHere.resolve(name));

  if (platform !== 'win32') {
    return {
      ok: true,
      warning:
        `the native friends addon is Windows-only; skipping the Steam pre-flight on ${platform}`,
    };
  }

  try {
    resolveModule(NATIVE_FRIENDS_MODULE);
    return { ok: true };
  } catch {
    return {
      ok: false,
      guidance:
        `[steam] the native friends addon (${NATIVE_FRIENDS_MODULE}) is not installed.\n` +
        BUILD_GUIDANCE,
    };
  }
}

function main() {
  const result = evaluateSteamFriends();
  if (!result.ok) {
    console.error(result.guidance);
    process.exit(1);
  }
  if (result.warning) {
    console.warn(`[steam] ${result.warning}`);
    return;
  }
  console.log(`[steam] native friends addon found: ${NATIVE_FRIENDS_MODULE}`);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
