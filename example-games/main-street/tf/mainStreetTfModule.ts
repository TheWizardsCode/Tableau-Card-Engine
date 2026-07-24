import type { TfGeneratedModule } from '../../../src/core-engine';

/**
 * Static shim import target for tf-generated module wiring.
 *
 * This repository intentionally does not commit generated tf artifacts.
 */
export const MAIN_STREET_TF_MODULE: TfGeneratedModule | null = null;

let cachedLoadedModule: TfGeneratedModule | undefined | null;

/**
 * Checks whether the synth module exists at the given URL by fetching
 * it once and verifying the response is valid JavaScript (not an HTML
 * fallback page). This avoids the Chromium "Failed to load module script"
 * console error that occurs when dynamic import() targets a non-existent
 * module URL (e.g., before running `npm run tf:generate`).
 *
 * @param url - The URL of the synth module to check.
 * @returns `true` if the module appears to exist, `false` otherwise.
 */
async function checkSynthModuleExists(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false;
    // In Vite dev mode, unknown paths are served as index.html (text/html)
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.startsWith('text/html')) return false;
    return true;
  } catch {
    // fetch unavailable (e.g., Node.js test environment) or network error.
    // Fall through to the dynamic import, which will also fail gracefully.
    return true;
  }
}

/**
 * Runtime accessor used by scene wiring and tests.
 *
 * Tests can provide a mocked tf module by setting
 * `globalThis.__MAIN_STREET_TF_MODULE__`.
 */
export function getMainStreetTfModule(): TfGeneratedModule | null {
  const injected = (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
  if (injected) return injected as TfGeneratedModule;
  return MAIN_STREET_TF_MODULE;
}

/**
 * Attempts to dynamically load a generated runtime synth module.
 *
 * Resolution order:
 * 1. `globalThis.__MAIN_STREET_TF_MODULE__` test/runtime injection
 * 2. `MAIN_STREET_TF_MODULE` static shim value
 * 3. dynamic import from URL (default `/build/tf-synths/main-street-runtime-synth.mjs`)
 */
export async function loadMainStreetTfModule(): Promise<TfGeneratedModule | null> {
  const immediate = getMainStreetTfModule();
  if (immediate) return immediate;

  if (cachedLoadedModule !== undefined) {
    return cachedLoadedModule;
  }

  const moduleUrl =
    ((globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__ as string | undefined)
    ?? '/build/tf-synths/main-street-runtime-synth.mjs';

  // Pre-check: verify the module exists before calling dynamic import().
  // This avoids the Chromium "Failed to load module script" console error
  // when the file is missing (e.g., before running `npm run tf:generate`).
  const exists = await checkSynthModuleExists(moduleUrl);
  if (!exists) {
    console.warn(
      `[MainStreet] ToneForge synth module not found at ${moduleUrl}. ` +
      'Synthesis-based audio will be unavailable. ' +
      'Run `npm run tf:generate` to generate ToneForge synth artifacts.'
    );
    cachedLoadedModule = null;
    return null;
  }

  try {
    const mod = await import(/* @vite-ignore */ moduleUrl);
    const candidate =
      (mod.TF_RUNTIME_MODULE as TfGeneratedModule | undefined)
      ?? (mod.default as TfGeneratedModule | undefined)
      ?? (typeof mod.factories === 'object' ? (mod as TfGeneratedModule) : undefined)
      ?? null;

    if (candidate) {
      cachedLoadedModule = candidate;
    }
    return candidate;
  } catch {
    return null;
  }
}
