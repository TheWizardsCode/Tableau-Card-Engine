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

describe('Gym Audio Feedback Scene - visual feedback quality', () => {
  it('showPopText uses a music note icon and readable duration (>= 1500ms)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Verify the showPopText method exists (kept, not removed)
    expect(source).toContain('private showPopText');

    // Scope to showPopText method block
    const showPopTextStart = source.indexOf('private showPopText');
    const showPopTextEnd = source.indexOf('}\n', showPopTextStart) + 2;
    const showPopTextBlock = source.substring(showPopTextStart, showPopTextEnd);

    // Verify the label includes a music note character
    expect(showPopTextBlock).toContain('♪');

    // Verify duration is at least 1500ms for normal mode and readable for reduced motion
    expect(showPopTextBlock).toContain('duration: this.reducedMotion ? 500 : 1800');
  });

  it('showPopText uses font size >= 18px', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Find showPopText method block and check fontSize inside it
    const showPopTextStart = source.indexOf('private showPopText');
    const showPopTextEnd = source.indexOf('}\n', showPopTextStart) + 2;
    const showPopTextBlock = source.substring(showPopTextStart, showPopTextEnd);

    const fontSizeMatch = showPopTextBlock.match(/fontSize: '(\d+)px'/);
    expect(fontSizeMatch).toBeTruthy();
    if (fontSizeMatch) {
      const size = parseInt(fontSizeMatch[1], 10);
      expect(size).toBeGreaterThanOrEqual(18);
    }
  });

  it('showPopText is called from emitEvent (keep decision)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Verify showPopText is still called from emitEvent (kept, not removed)
    expect(source).toContain('this.showPopText(eventName, lastCall.key)');
  });
});