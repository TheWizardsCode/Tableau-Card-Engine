import type { TfGeneratedModule } from '../../../src/core-engine';

/**
 * Static shim import target for tf-generated module wiring.
 *
 * This repository intentionally does not commit generated tf artifacts.
 */
export const MAIN_STREET_TF_MODULE: TfGeneratedModule | null = null;

let cachedLoadedModule: TfGeneratedModule | undefined;

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
