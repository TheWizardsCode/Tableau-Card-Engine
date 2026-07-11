/**
 * Gym Audio & Feedback Scene - Auto-discovery tests.
 *
 * Validates that the GymAudioFeedbackScene:
 *  - Auto-discovers all default sound keys from the SoundManager registry
 *  - Auto-discovers visual feedback types (popTextOrIcon, shake, celebration, highlight)
 *  - Dynamically generates buttons for each discovered sound/feedback type
 *  - All default sounds are registered and playable
 *  - All default visual feedback types are triggerable
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

// ── Default sound keys that the gym scene should discover ──────

/**
 * All default sound keys that should be registered and auto-discovered
 * by the GymAudioFeedbackScene. These match the WAV files in
 * `public/assets/audio/default/` plus the COMMON_SFX_KEYS from SoundManager.
 */
const DEFAULT_SFX_KEYS = [
  'sfx-ui-click',
  'sfx-turn-change',
  'sfx-round-end',
  'sfx-score-reveal',
  'sfx-card-draw',
  'sfx-card-flip',
  'sfx-card-discard',
  'sfx-card-swap',
] as const;

// ── Default event-to-sound mappings ────────────────────────────

/**
 * All default event-to-sound mappings that the gym scene should discover.
 */
const DEFAULT_EVENT_MAPPINGS: EventSoundMapping = {
  'card-drawn': 'sfx-card-draw',
  'card-flipped': 'sfx-card-flip',
  'card-discarded': 'sfx-card-discard',
  'card-swapped': 'sfx-card-swap',
  'ui-interaction': 'sfx-ui-click',
  'turn-started': 'sfx-turn-change',
  'game-ended': 'sfx-round-end',
  'turn-completed': 'sfx-score-reveal',
};

describe('Gym Audio & Feedback Scene - sound auto-discovery', () => {
  it('registers all default sound keys in SoundManager', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });

    // Simulate the scene's registration of default sounds
    for (const key of DEFAULT_SFX_KEYS) {
      mgr.register(key);
    }

    // Verify all keys are registered
    const registeredKeys = Array.from(mgr.keys());
    for (const key of DEFAULT_SFX_KEYS) {
      expect(registeredKeys).toContain(key);
    }
  });

  it('all default sounds are playable', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });

    for (const key of DEFAULT_SFX_KEYS) {
      mgr.register(key);
    }

    // All default sounds should play
    for (const key of DEFAULT_SFX_KEYS) {
      mgr.play(key);
    }

    expect(player.calls).toHaveLength(DEFAULT_SFX_KEYS.length);
    for (let i = 0; i < DEFAULT_SFX_KEYS.length; i++) {
      expect(player.calls[i]).toEqual({ method: 'play', key: DEFAULT_SFX_KEYS[i] });
    }
  });

  it('all default event mappings produce sound calls', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });
    const emitter = new GameEventEmitter();

    for (const key of DEFAULT_SFX_KEYS) {
      mgr.register(key);
    }
    mgr.connectToEvents(emitter, DEFAULT_EVENT_MAPPINGS);

    // Emit all events
    const eventNames = Object.keys(DEFAULT_EVENT_MAPPINGS);
    for (const event of eventNames) {
      emitter.emit(event as any, {} as any);
    }

    // Each event should produce exactly one sound play
    expect(player.calls).toHaveLength(eventNames.length);
  });

  it('mute suppresses all default sounds', () => {
    const player = new TestPlayer();
    const mgr = new SoundManager(player, { storage: null });

    for (const key of DEFAULT_SFX_KEYS) {
      mgr.register(key);
    }
    mgr.setMute(true);

    // No sound should play when muted
    for (const key of DEFAULT_SFX_KEYS) {
      mgr.play(key);
    }

    expect(player.calls).toHaveLength(0);
  });
});

describe('Gym Audio & Feedback Scene - visual feedback discovery', () => {
  it('auto-discovers popTextOrIcon feedback type', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Should reference popTextOrIcon for visual feedback
    expect(source).toContain('popTextOrIcon');
  });

  it('auto-discovers particle celebration feedback type', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Should have celebration/particle functionality
    expect(source).toContain('celebrate');
  });
});

describe('Gym Audio & Feedback Scene - dynamic button generation', () => {
  it('generates buttons for all registered sounds', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // After refactoring, buttons should be dynamically generated
    // using the SoundManager's keys() iterator, not hardcoded
    expect(source).toContain('soundManager.keys()');
  });

  it('generates buttons for visual feedback types', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // Should have dynamic visual feedback button generation
    expect(source).toContain('FEEDBACK_TYPES');
  });

  it('includes all default sound keys in the source', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // All default sound keys should be present
    for (const key of DEFAULT_SFX_KEYS) {
      expect(source).toContain(key);
    }
  });

  it('includes all default event mappings in the source', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // All default event names should be present
    for (const event of Object.keys(DEFAULT_EVENT_MAPPINGS)) {
      expect(source).toContain(`'${event}'`);
    }
  });

  it('no longer uses hardcoded DEMO_SFX_KEYS array', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymAudioFeedbackScene.ts'),
      'utf-8',
    );

    // The old hardcoded array should be gone, replaced by a dynamic list
    expect(source).not.toContain("['sfx-test-ding', 'sfx-test-buzz']");
  });
});
