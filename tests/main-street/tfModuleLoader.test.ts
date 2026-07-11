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
});
