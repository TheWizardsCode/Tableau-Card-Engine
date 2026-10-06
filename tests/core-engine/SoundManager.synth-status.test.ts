/**
 * Tests for the SoundManager synth-status API.
 *
 * Covers the read-only diagnostics surface added for the ToneForge debug
 * toggle: `isSynthActive()`, `getSynthStatus()`, plus the runtime
 * detach/restore helpers that let the debug tool A/B synthesis without a
 * scene restart. See CG-0MUTX0J5L0063RHS.
 */
import { describe, it, expect, vi } from 'vitest';

import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';

function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

describe('SoundManager synth status', () => {
  it('reports active when a synth player and non-empty key map are attached', () => {
    const manager = new SoundManager(createMockPlayer(), {
      storage: null,
      synthPlayer: createMockPlayer(),
      synthKeyMap: { 'sfx-place': 'card-place' },
    });

    expect(manager.isSynthActive()).toBe(true);
    expect(manager.getSynthStatus()).toEqual({
      active: true,
      factoryCount: 1,
      lastLoadError: null,
    });
  });

  it('reports inactive when no synth player is attached', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });

    expect(manager.isSynthActive()).toBe(false);
    expect(manager.getSynthStatus().active).toBe(false);
  });

  it('reports inactive when the key map is empty even with a synth player', () => {
    const manager = new SoundManager(createMockPlayer(), {
      storage: null,
      synthPlayer: createMockPlayer(),
      synthKeyMap: {},
    });

    expect(manager.isSynthActive()).toBe(false);
    expect(manager.getSynthStatus().active).toBe(false);
  });

  it('exposes the reported factory count and last load error for diagnostics', () => {
    const manager = new SoundManager(createMockPlayer(), {
      storage: null,
      synthPlayer: createMockPlayer(),
      synthKeyMap: { 'sfx-place': 'card-place' },
      synthDiagnostics: { factoryCount: 12, lastLoadError: 'module exploded' },
    });

    expect(manager.getSynthStatus()).toEqual({
      active: true,
      factoryCount: 12,
      lastLoadError: 'module exploded',
    });
  });

  it('reports a diagnostic load error even when no synth player is attached', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });

    manager.setSynthDiagnostics({ lastLoadError: 'module not found' });

    const status = manager.getSynthStatus();
    expect(status.active).toBe(false);
    expect(status.lastLoadError).toBe('module not found');
  });

  it('updates diagnostics via setSynthIntegration without rebuilding the manager', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });

    manager.setSynthIntegration(
      createMockPlayer(),
      { 'sfx-place': 'card-place' },
      { factoryCount: 3, lastLoadError: null },
    );

    expect(manager.getSynthStatus()).toEqual({
      active: true,
      factoryCount: 3,
      lastLoadError: null,
    });
  });

  it('detaches and restores synth integration without a scene restart', () => {
    const wav = createMockPlayer();
    const synth = createMockPlayer();
    const manager = new SoundManager(wav, {
      storage: null,
      synthPlayer: synth,
      synthKeyMap: { 'sfx-place': 'card-place' },
    });
    manager.register('sfx-place', 'sfx-place-wav');

    expect(manager.detachSynthIntegration()).toBe(true);
    expect(manager.isSynthActive()).toBe(false);

    manager.play('sfx-place');
    expect(wav.play).toHaveBeenCalledWith('sfx-place-wav');
    expect(synth.play).not.toHaveBeenCalled();

    expect(manager.restoreSynthIntegration()).toBe(true);
    expect(manager.isSynthActive()).toBe(true);

    manager.play('sfx-place');
    expect(synth.play).toHaveBeenCalledWith('card-place');
  });

  it('preserves diagnostic detail while detached', () => {
    const manager = new SoundManager(createMockPlayer(), {
      storage: null,
      synthPlayer: createMockPlayer(),
      synthKeyMap: { 'sfx-place': 'card-place' },
      synthDiagnostics: { factoryCount: 7 },
    });

    manager.detachSynthIntegration();

    expect(manager.getSynthStatus()).toEqual({
      active: false,
      factoryCount: 7,
      lastLoadError: null,
    });
  });

  it('returns false when restoring without a retained integration', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });

    expect(manager.restoreSynthIntegration()).toBe(false);
  });

  it('returns false when detaching while already detached', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });

    expect(manager.detachSynthIntegration()).toBe(false);
  });

  it('keeps the existing WAV fallback unchanged when the status API is unused', () => {
    const wav = createMockPlayer();
    const manager = new SoundManager(wav, { storage: null });
    manager.register('sfx-click', 'click.wav');

    manager.play('sfx-click');

    expect(wav.play).toHaveBeenCalledWith('click.wav');
  });
});
