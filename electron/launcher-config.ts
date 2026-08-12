/**
 * Launcher configuration glue — pure, Electron-free.
 *
 * Parses the CLI/content-directory overrides and builds the ordered
 * `ContentDirectoryProvider` chain that `main.ts` consumes, so the
 * resolution wiring is unit-testable without an Electron runtime.
 */
import path from 'path';
import {
  resolveContentDir,
  ContentLocatorError,
  CONTENT_DIR_ENV,
  type ContentDirectoryProvider,
  type ResolvedContent,
} from './content-locator.js';

export type { ContentDirectoryProvider, ResolvedContent } from './content-locator.js';

/** Parse `--content-dir <dir>` or `--content-dir=<dir>` from a CLI argv. */
export function parseContentDirArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--content-dir' && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith('--content-dir=')) {
      return argv[i].slice('--content-dir='.length);
    }
  }
  return null;
}

export interface LauncherConfigOptions {
  /** Full process argv (main.ts passes process.argv). */
  argv: string[];
  /** Absolute path to the bundled renderer build (the Vite `dist/`). */
  bundledDir: string;
}

/**
 * Ordered content providers (first non-null wins).
 *
 * v1: CLI/env override (Steam DLC install dir) → bundled app.
 * v2 plug-in point: a Steamworks-backed provider implementing
 * `ContentDirectoryProvider` slots in between and returns the DLC content
 * path programmatically — no change to the load path.
 */
export function buildProviderChain(options: LauncherConfigOptions): ContentDirectoryProvider[] {
  const overrideDir = parseContentDirArg(options.argv) ?? process.env[CONTENT_DIR_ENV] ?? null;
  // Resolve relative overrides against the process cwd (Steam may launch the
  // binary with an unexpected working directory).
  const override = overrideDir ? path.resolve(overrideDir) : null;

  return [
    {
      resolve(): ResolvedContent | null {
        return override ? resolveContentDir({ bundledDir: options.bundledDir, override }) : null;
      },
    },
    // v2: insert SteamworksContentProvider here (returns null when the DLC is
    // not installed so resolution falls through to the bundled app).
    {
      resolve(): ResolvedContent {
        return resolveContentDir({ bundledDir: options.bundledDir });
      },
    },
  ];
}

/** Resolve game content through the provider chain. */
export function resolveGameContent(options: LauncherConfigOptions): ResolvedContent {
  for (const provider of buildProviderChain(options)) {
    const resolved = provider.resolve();
    if (resolved) return resolved;
  }
  throw new ContentLocatorError(
    'CONTENT_DIR_NOT_FOUND',
    'No content provider could resolve the game content directory.',
  );
}
