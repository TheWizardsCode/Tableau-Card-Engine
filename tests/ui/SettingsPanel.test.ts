/**
 * Unit tests for SettingsPanel -- tests that can run in Node
 * without Phaser (no DOM/window dependency).
 *
 * The SettingsPanel and SettingsButton classes depend on Phaser at import
 * time (they import Phaser for type annotations and scene API), so they
 * cannot be imported in a Node environment. Module export tests for
 * Phaser-dependent UI components live in browser tests.
 *
 * These tests verify the SoundManager contract that SettingsPanel depends on:
 * mute/volume getters, toggleMute, setVolume clamping, and persistence.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SoundManager,
  type SoundPlayer,
  type StorageLike,
} from '../../src/core-engine/SoundManager';

// ── Test helpers ────────────────────────────────────────────

function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

function createMockStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('SettingsPanel: SoundManager integration contract', () => {
  it('SoundManager exposes muted and volume properties needed by SettingsPanel', () => {
    const sm = new SoundManager(createMockPlayer(), { storage: null });

    expect(typeof sm.muted).toBe('boolean');
    expect(typeof sm.volume).toBe('number');
    expect(typeof sm.toggleMute).toBe('function');
    expect(typeof sm.setVolume).toBe('function');
  });

  it('toggleMute returns the new mute state', () => {
    const sm = new SoundManager(createMockPlayer(), { storage: null });

    expect(sm.muted).toBe(false);
    const newState = sm.toggleMute();
    expect(newState).toBe(true);
    expect(sm.muted).toBe(true);
  });

  it('toggleMute round-trips correctly', () => {
    const sm = new SoundManager(createMockPlayer(), { storage: null });

    sm.toggleMute(); // false -> true
    sm.toggleMute(); // true -> false
    expect(sm.muted).toBe(false);
  });

  it('setVolume clamps to [0, 1]', () => {
    const sm = new SoundManager(createMockPlayer(), { storage: null });

    sm.setVolume(1.5);
    expect(sm.volume).toBe(1.0);

    sm.setVolume(-0.5);
    expect(sm.volume).toBe(0.0);

    sm.setVolume(0.75);
    expect(sm.volume).toBe(0.75);
  });

  it('setVolume delegates to the SoundPlayer', () => {
    const player = createMockPlayer();
    const sm = new SoundManager(player, { storage: null });

    sm.setVolume(0.5);
    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it('toggleMute delegates to the SoundPlayer', () => {
    const player = createMockPlayer();
    const sm = new SoundManager(player, { storage: null });

    sm.toggleMute();
    expect(player.setMute).toHaveBeenCalledWith(true);
  });

  it('mute state persists via storage', () => {
    const storage = createMockStorage();
    const sm = new SoundManager(createMockPlayer(), { storage });

    sm.toggleMute();
    expect(storage.setItem).toHaveBeenCalledWith('tce-sound-muted', 'true');
  });

  it('volume persists via storage', () => {
    const storage = createMockStorage();
    const sm = new SoundManager(createMockPlayer(), { storage });

    sm.setVolume(0.42);
    expect(storage.setItem).toHaveBeenCalledWith('tce-sound-volume', '0.42');
  });

  it('restores muted state from storage on construction', () => {
    const storage = createMockStorage();
    storage.setItem('tce-sound-muted', 'true');

    const player = createMockPlayer();
    const sm = new SoundManager(player, { storage });

    expect(sm.muted).toBe(true);
    expect(player.setMute).toHaveBeenCalledWith(true);
  });

  it('restores volume from storage on construction', () => {
    const storage = createMockStorage();
    storage.setItem('tce-sound-volume', '0.6');

    const player = createMockPlayer();
    const sm = new SoundManager(player, { storage });

    expect(sm.volume).toBe(0.6);
    expect(player.setVolume).toHaveBeenCalledWith(0.6);
  });

  it('setMute(false) unmutes audio', () => {
    const player = createMockPlayer();
    const sm = new SoundManager(player, { storage: null });

    sm.toggleMute(); // mute
    expect(sm.muted).toBe(true);

    sm.setMute(false); // unmute
    expect(sm.muted).toBe(false);
    expect(player.setMute).toHaveBeenCalledWith(false);
  });
});
