import type { TfGeneratedModule } from '../../../src/core-engine';

/**
 * Static shim import target for tf-generated module wiring.
 *
 * This repository intentionally does not commit generated tf artifacts.
 * Run `npm run tf:generate` to generate runtime module artifacts under build/
 * and adapt this shim as needed for local/runtime integration.
 */
export const MAIN_STREET_TF_MODULE: TfGeneratedModule | null = null;

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
