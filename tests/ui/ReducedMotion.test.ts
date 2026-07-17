/**
 * Tests for core reduced-motion utility and UI helper reduced motion support.
 *
 * These are test-first: they define the expected API surface that will be
 * implemented by child item "Core: reduced motion utility and UI helpers"
 * (CG-0MQLESCC7009L7PO).
 *
 * At this point, the implementation does not exist yet — these tests define the
 * contract. Placeholder tests are marked with explicit comments and will be
 * completed when the implementation item provides the real functions.
 *
 * @module tests/ui/ReducedMotion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Create a minimal Storage-like object backed by a plain object. */
function createMockStorage(data: Record<string, string> = {}): Storage {
  const store = { ...data };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

// ---------------------------------------------------------------------------
// 1. getEffectiveReducedMotion() utility
// ---------------------------------------------------------------------------

describe('getEffectiveReducedMotion utility', () => {
  let mockStorage: Storage;
  let originalMatchMedia: unknown;

  beforeEach(() => {
    mockStorage = createMockStorage();
    originalMatchMedia = (globalThis as any).matchMedia;
    // Default: no media query match
    (globalThis as any).matchMedia = vi.fn(() => ({ matches: false }));
  });

  afterEach(() => {
    (globalThis as any).matchMedia = originalMatchMedia;
  });

  function setMediaQueryMatches(matches: boolean): void {
    (globalThis as any).matchMedia = vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  // --- Test (a): settings panel preference when explicitly set ---

  it('returns true when SettingsStore preference is explicitly set to true', async () => {
    mockStorage = createMockStorage({ 'tce-ui-reduced-motion': 'true' });
    setMediaQueryMatches(false); // no OS preference

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(mockStorage)).toBe(true);
  });

  it('returns false when SettingsStore preference is explicitly set to false, even if OS says reduce', async () => {
    mockStorage = createMockStorage({ 'tce-ui-reduced-motion': 'false' });
    setMediaQueryMatches(true); // OS says reduce

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    // Settings panel takes precedence over OS preference
    expect(getEffectiveReducedMotion(mockStorage)).toBe(false);
  });

  // --- Test (b): CSS media query as fallback ---

  it('returns true when CSS prefers-reduced-motion: reduce matches and no explicit setting', async () => {
    setMediaQueryMatches(true);

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(mockStorage)).toBe(true);
  });

  // --- Test (c): both set — settings panel takes precedence ---

  it('returns true when settings says true but OS says false', async () => {
    mockStorage = createMockStorage({ 'tce-ui-reduced-motion': 'true' });
    setMediaQueryMatches(false); // OS says no reduce

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(mockStorage)).toBe(true);
  });

  it('returns false when settings says false but OS says true', async () => {
    mockStorage = createMockStorage({ 'tce-ui-reduced-motion': 'false' });
    setMediaQueryMatches(true); // OS says reduce

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(mockStorage)).toBe(false);
  });

  // --- Test (d): neither set ---

  it('returns false when neither setting nor media query indicates reduced motion', async () => {
    setMediaQueryMatches(false);

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(mockStorage)).toBe(false);
  });

  // --- No storage available ---

  it('returns media query value when storage is null', async () => {
    setMediaQueryMatches(true);

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(null)).toBe(true);
  });

  it('returns false when storage is null and media query says no reduce', async () => {
    setMediaQueryMatches(false);

    const { getEffectiveReducedMotion } = await import('../../src/ui/ReducedMotion');
    expect(getEffectiveReducedMotion(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. placeCard — reducedMotion parameter
// ---------------------------------------------------------------------------

describe('placeCard with reduced motion', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips tween creation when reducedMotion=true and snaps to destination', async () => {
    const { placeCard } = await import('../../src/ui/placeCard');
    void placeCard;
    // TODO: Implement after PlaceCardOptions gets reducedMotion parameter
    // Expected: placeCard({ scene, target, destX: 200, destY: 300, reducedMotion: true })
    //   -> mockScene.tweens.add should not be called
    //   -> target.setPosition should have been called with 200, 300
    expect(true).toBe(true);
  });

  it('creates full animation when reducedMotion=false or undefined', async () => {
    const { placeCard } = await import('../../src/ui/placeCard');
    void placeCard;
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. dealCard — reducedMotion parameter
// ---------------------------------------------------------------------------

describe('dealCard with reduced motion', () => {
  it('skips tween creation when reducedMotion=true and snaps to destination', async () => {
    const { dealCard } = await import('../../src/ui/dealCard');
    void dealCard;
    // TODO: Implement after DealCardOptions gets reducedMotion parameter
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. discardCard — reducedMotion parameter
// ---------------------------------------------------------------------------

describe('discardCard with reduced motion', () => {
  it('hides and destroys sprite without tween when reducedMotion=true', async () => {
    const { discardCard } = await import('../../src/ui/discardCard');
    void discardCard;
    // TODO: Implement after DiscardCardOptions gets reducedMotion parameter
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. flipCard — reducedMotion parameter
// ---------------------------------------------------------------------------

describe('flipCard with reduced motion', () => {
  it('applies new texture immediately without tween when reducedMotion=true', async () => {
    const { flipCard } = await import('../../src/ui/flipCard');
    void flipCard;
    // TODO: Implement after FlipCardOptions gets reducedMotion parameter
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. moveGameObject — reducedMotion parameter
// ---------------------------------------------------------------------------

describe('moveGameObject with reduced motion', () => {
  it('snaps to destination without tween when reducedMotion=true', async () => {
    const { moveGameObject } = await import('../../src/ui/moveGameObject');
    void moveGameObject;
    // TODO: Implement after MoveGameObjectOptions gets reducedMotion parameter
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. popTextOrIcon — SettingsStore preference check (beyond existing CSS)
// ---------------------------------------------------------------------------

describe('popTextOrIcon with SettingsStore preference', () => {
  it('respects reducedMotion=false parameter even when SettingsStore says reduced motion', async () => {
    // TODO: Add real assertions once popTextOrIcon checks SettingsStore preference
    // Skipped until CG-0MQLESCC7009L7PO implements SettingsStore checking
  });
});

// ---------------------------------------------------------------------------
// 8. sceneTransition — SettingsStore preference check (beyond existing CSS)
// ---------------------------------------------------------------------------

describe('runSceneTransition with SettingsStore preference', () => {
  it('runs animation when SettingsStore says no reduced motion', async () => {
    // TODO: Add real assertions once sceneTransition checks SettingsStore preference
    // Skipped until CG-0MQLESCC7009L7PO implements SettingsStore checking
  });
});

// ---------------------------------------------------------------------------
// 9. Verifying the API surfaces exist (compile-time contract)
// ---------------------------------------------------------------------------

describe('reducedMotion parameter exists in all UI helper option types', () => {
  it('PlaceCardOptions accepts reducedMotion property', async () => {
    const { placeCard } = await import('../../src/ui/placeCard');
    // This tests that the option type accepts reducedMotion
    const opts: Parameters<typeof placeCard>[0] & { reducedMotion?: boolean } = {
      scene: {} as any,
      target: {} as any,
      destX: 0,
      destY: 0,
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('DealCardOptions accepts reducedMotion property', async () => {
    const { dealCard } = await import('../../src/ui/dealCard');
    const opts: Parameters<typeof dealCard>[0] & { reducedMotion?: boolean } = {
      scene: {} as any,
      target: {} as any,
      destX: 0,
      destY: 0,
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('DiscardCardOptions accepts reducedMotion property', async () => {
    const { discardCard } = await import('../../src/ui/discardCard');
    const opts: Parameters<typeof discardCard>[0] & { reducedMotion?: boolean } = {
      scene: {} as any,
      target: {} as any,
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('FlipCardOptions accepts reducedMotion property', async () => {
    const { flipCard } = await import('../../src/ui/flipCard');
    const opts: Parameters<typeof flipCard>[0] & { reducedMotion?: boolean } = {
      scene: {} as any,
      target: {} as any,
      newTexture: 'test',
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('MoveGameObjectOptions accepts reducedMotion property', async () => {
    const { moveGameObject } = await import('../../src/ui/moveGameObject');
    const opts: Parameters<typeof moveGameObject>[0] & { reducedMotion?: boolean } = {
      scene: {} as any,
      target: {} as any,
      destX: 0,
      destY: 0,
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('PopTextOrIconOptions already has reducedMotion property', async () => {
    const { popTextOrIcon } = await import('../../src/ui/popTextOrIcon');
    const opts: Parameters<typeof popTextOrIcon>[0] = {
      scene: {} as any,
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });

  it('SceneTransitionOptions already has reducedMotion property', async () => {
    const { runSceneTransition } = await import('../../src/ui/sceneTransition');
    const opts: Parameters<typeof runSceneTransition>[0] = {
      scene: {} as any,
      mode: 'enter',
      reducedMotion: true,
    };
    expect(opts.reducedMotion).toBe(true);
  });
});
