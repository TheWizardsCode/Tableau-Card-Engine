import { afterEach, describe, expect, it, vi } from 'vitest';

describe('mainStreet tf module loader', () => {
  afterEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    vi.resetModules();
  });

  it('returns injected tf module immediately', async () => {
    const injected = { factories: { foo: () => ({ play: () => {} }) } };
    (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__ = injected;

    const mod = await import('../../example-games/main-street/tf/mainStreetTfModule');
    const result = await mod.loadMainStreetTfModule();

    expect(result).toBe(injected);
  });

  it('loads tf module from configured URL', async () => {
    (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__ =
      'data:text/javascript,export const factories={bar:()=>({play(){}})};export const TF_RUNTIME_MODULE={factories};';

    const mod = await import('../../example-games/main-street/tf/mainStreetTfModule');
    const result = await mod.loadMainStreetTfModule();

    expect(result).toBeTruthy();
    expect(typeof result?.factories?.bar).toBe('function');
  });

  it('returns null and warns when module URL returns HTML (missing module)', async () => {
    // Simulate a missing module by pointing to a data: URL with text/html content-type.
    // The pre-check in loadMainStreetTfModule() detects text/html and returns null
    // without attempting the dynamic import, avoiding the Chromium console error.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__ =
      'data:text/html,<html><body>Vite 404 fallback</body></html>';

    const mod = await import('../../example-games/main-street/tf/mainStreetTfModule');
    const result = await mod.loadMainStreetTfModule();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ToneForge synth module not found'),
    );

    warnSpy.mockRestore();
  });

  it('returns null when fetch fails (network error) and falls through to dynamic import', async () => {
    // Simulate a URL where fetch() throws (e.g., malformed URL).
    // The pre-check falls through to the dynamic import, which also fails.
    (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__ =
      'http://[::1]:1/nonexistent/module.mjs';

    const mod = await import('../../example-games/main-street/tf/mainStreetTfModule');
    const result = await mod.loadMainStreetTfModule();

    expect(result).toBeNull();
  });
});
