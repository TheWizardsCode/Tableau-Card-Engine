/**
 * Tests for Gym reduced-motion global integration.
 *
 * Validates that SettingsStore reduced-motion helpers work correctly,
 * and that the preference can be toggled programmatically for headless tests.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { getReducedMotion, setReducedMotion } from '../../src/ui/SettingsStore';

// ── Mock storage for SettingsStore tests ──────────────────

function createMockStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

describe('Gym reduced-motion: SettingsStore integration', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  it('getReducedMotion returns false when not set', () => {
    expect(getReducedMotion(mockStorage)).toBe(false);
  });

  it('getReducedMotion returns true when explicitly set', () => {
    setReducedMotion(true, mockStorage);
    expect(getReducedMotion(mockStorage)).toBe(true);
  });

  it('getReducedMotion returns false after being set to false', () => {
    setReducedMotion(true, mockStorage);
    expect(getReducedMotion(mockStorage)).toBe(true);

    setReducedMotion(false, mockStorage);
    expect(getReducedMotion(mockStorage)).toBe(false);
  });

  it('setReducedMotion persists value to storage', () => {
    setReducedMotion(true, mockStorage);
    expect(mockStorage.getItem('tce-ui-reduced-motion')).toBe('true');

    setReducedMotion(false, mockStorage);
    expect(mockStorage.getItem('tce-ui-reduced-motion')).toBe('false');
  });

  it('getReducedMotion handles storage unavailable gracefully', () => {
    expect(getReducedMotion(null)).toBe(false);
  });

  it('setReducedMotion handles storage unavailable gracefully', () => {
    // Should not throw
    setReducedMotion(true, null);
  });
});

describe('Gym reduced-motion: GymSceneBase property API', () => {
  it('GymSceneBase class exposes setReducedMotionProperty and initReducedMotion methods', () => {
    // Verify the class structure without importing Phaser.
    // We simply check that the source file exports the expected API surface.
    // The actual scene functionality is validated in browser tests.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify reduced-motion property and methods exist in the source
    expect(source).toContain('reducedMotion');
    expect(source).toContain('setReducedMotionProperty');
    expect(source).toContain('initReducedMotion');
    expect(source).toContain('toggleReducedMotion');
    expect(source).toContain('getReducedMotion');
  });

  it('All Gym scenes call initReducedMotion in their create methods', () => {
    const fs = require('fs');
    const path = require('path');
    const scenesDir = path.resolve(__dirname, '../../example-games/gym/scenes');

    const sceneFiles = [
      'GymDeckRngScene.ts',
      'GymHandPileScene.ts',
      'GymOverlayUiScene.ts',
      'GymUndoRedoScene.ts',
      'GymTranscriptScene.ts',
      'GymSaveLoadScene.ts',
      'GymAudioFeedbackScene.ts',
    ];

    for (const file of sceneFiles) {
      const source = fs.readFileSync(path.join(scenesDir, file), 'utf-8');
      expect(source).toContain('initReducedMotion');
    }
  });

  it('GymSceneBase consults stored preference and DOM media query', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify the combined logic: SettingsStore + DOM media query
    expect(source).toContain('getReducedMotion');
    expect(source).toContain('prefers-reduced-motion');
  });
});