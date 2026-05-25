/**
 * Gym Audio & Feedback scenario tests.
 *
 * Validates that:
 *  - SoundManager registers and plays sounds
 *  - Mute toggling works correctly
 *  - Invalid keys are safely ignored
 *  - Volume clamping works
 *  - Event-to-sound mapping connects correctly
 */
import { describe, expect, it } from 'vitest';
import { GameEventEmitter, SoundManager } from '../../src/core-engine';
import type { SoundPlayer, EventSoundMapping } from '../../src/core-engine';

/** Stub player that records calls. */
class TestPlayer implements SoundPlayer {
  readonly calls: Array<{ method: string; key: string }> = [];
  play(key: string): void { this.calls.push({ method: 'play', key }); }
  stop(key: string): void { this.calls.push({ method: 'stop', key }); }
  setVolume(_v: number): void { /* no-op */ }
  setMute(_m: boolean): void { /* no-op */ }
}

describe('Gym Audio & Feedback scenarios', () => {
  it('SoundManager plays registered sounds', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    mgr.register('ding');
    mgr.register('buzz');

    mgr.play('ding');
    mgr.play('buzz');

    expect(player.calls).toEqual([
      { method: 'play', key: 'ding' },
      { method: 'play', key: 'buzz' },
    ]);
  });

  it('SoundManager ignores unregistered keys', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    mgr.register('ding');

    mgr.play('nonexistent'); // should not throw and not produce calls
    mgr.play('ding');

    expect(player.calls).toEqual([{ method: 'play', key: 'ding' }]);
  });

  it('mute suppresses sound playback', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    mgr.register('ding');

    mgr.setMute(true);
    mgr.play('ding'); // should be suppressed

    expect(player.calls).toEqual([]);
  });

  it('unmute restores sound playback', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    mgr.register('ding');

    mgr.setMute(true);
    mgr.play('ding'); // suppressed
    mgr.setMute(false);
    mgr.play('ding'); // plays

    expect(player.calls).toEqual([{ method: 'play', key: 'ding' }]);
  });

  it('volume is clamped to [0, 1]', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });

    mgr.setVolume(1.5);
    expect(mgr.volume).toBe(1);

    mgr.setVolume(-0.5);
    expect(mgr.volume).toBe(0);

    mgr.setVolume(0.7);
    expect(mgr.volume).toBe(0.7);
  });

  it('event-to-sound mapping plays mapped sounds', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    const emitter = new GameEventEmitter();
    mgr.register('ding');
    mgr.register('buzz');

    const mapping: EventSoundMapping = {
      'card-drawn': 'ding',
      'card-discarded': 'buzz',
    };
    mgr.connectToEvents(emitter, mapping);

    emitter.emit('card-drawn', {} as any);
    emitter.emit('card-discarded', {} as any);

    expect(player.calls).toEqual([
      { method: 'play', key: 'ding' },
      { method: 'play', key: 'buzz' },
    ]);

    mgr.destroy();
    emitter.removeAllListeners();
  });

  it('toggleMute toggles mute state', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });

    expect(mgr.muted).toBe(false);
    const result1 = mgr.toggleMute();
    expect(result1).toBe(true);
    expect(mgr.muted).toBe(true);

    const result2 = mgr.toggleMute();
    expect(result2).toBe(false);
    expect(mgr.muted).toBe(false);
  });
});