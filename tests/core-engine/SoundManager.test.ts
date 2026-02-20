import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SoundManager,
  type SoundPlayer,
  type StorageLike,
} from '../../src/core-engine/SoundManager';
import { GameEventEmitter } from '../../src/core-engine/GameEventEmitter';

// ── Test helpers ────────────────────────────────────────────

/** Create a mock SoundPlayer for testing. */
function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

/** Create a mock localStorage-like storage for testing. */
function createMockStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

describe('SoundManager', () => {
  let player: SoundPlayer;
  let storage: StorageLike;
  let sm: SoundManager;

  beforeEach(() => {
    player = createMockPlayer();
    storage = createMockStorage();
    sm = new SoundManager(player, { storage });
  });

  // ── Constructor ─────────────────────────────────────────

  describe('constructor', () => {
    it('should apply default volume and mute state to player', () => {
      expect(player.setMute).toHaveBeenCalledWith(false);
      expect(player.setVolume).toHaveBeenCalledWith(1.0);
    });

    it('should restore muted state from storage', () => {
      const s = createMockStorage();
      s.setItem('tce-sound-muted', 'true');
      const p = createMockPlayer();
      const mgr = new SoundManager(p, { storage: s });
      expect(mgr.muted).toBe(true);
      expect(p.setMute).toHaveBeenCalledWith(true);
    });

    it('should restore volume from storage', () => {
      const s = createMockStorage();
      s.setItem('tce-sound-volume', '0.5');
      const p = createMockPlayer();
      const mgr = new SoundManager(p, { storage: s });
      expect(mgr.volume).toBe(0.5);
      expect(p.setVolume).toHaveBeenCalledWith(0.5);
    });

    it('should handle null storage gracefully', () => {
      const p = createMockPlayer();
      const mgr = new SoundManager(p, { storage: null });
      expect(mgr.volume).toBe(1.0);
      expect(mgr.muted).toBe(false);
    });

    it('should handle invalid stored volume gracefully', () => {
      const s = createMockStorage();
      s.setItem('tce-sound-volume', 'not-a-number');
      const p = createMockPlayer();
      const mgr = new SoundManager(p, { storage: s });
      expect(mgr.volume).toBe(1.0);
    });
  });

  // ── Registration ────────────────────────────────────────

  describe('register', () => {
    it('should register a sound with an explicit asset key', () => {
      sm.register('card-draw', 'sfx-card-draw');
      sm.play('card-draw');
      expect(player.play).toHaveBeenCalledWith('sfx-card-draw');
    });

    it('should use the logical key as asset key when no asset key provided', () => {
      sm.register('ui-click');
      sm.play('ui-click');
      expect(player.play).toHaveBeenCalledWith('ui-click');
    });
  });

  // ── Playback ────────────────────────────────────────────

  describe('play', () => {
    it('should play a registered sound', () => {
      sm.register('card-flip', 'sfx-flip');
      sm.play('card-flip');
      expect(player.play).toHaveBeenCalledWith('sfx-flip');
    });

    it('should not play an unregistered sound', () => {
      sm.play('nonexistent');
      expect(player.play).not.toHaveBeenCalled();
    });

    it('should not play when muted', () => {
      sm.register('card-flip', 'sfx-flip');
      sm.setMute(true);
      sm.play('card-flip');
      expect(player.play).not.toHaveBeenCalledWith('sfx-flip');
    });
  });

  describe('stop', () => {
    it('should stop a registered sound', () => {
      sm.register('card-flip', 'sfx-flip');
      sm.stop('card-flip');
      expect(player.stop).toHaveBeenCalledWith('sfx-flip');
    });

    it('should not throw when stopping an unregistered sound', () => {
      expect(() => sm.stop('nonexistent')).not.toThrow();
      expect(player.stop).not.toHaveBeenCalled();
    });
  });

  // ── Volume ──────────────────────────────────────────────

  describe('volume', () => {
    it('should default to 1.0', () => {
      expect(sm.volume).toBe(1.0);
    });

    it('should set volume and forward to player', () => {
      sm.setVolume(0.5);
      expect(sm.volume).toBe(0.5);
      expect(player.setVolume).toHaveBeenCalledWith(0.5);
    });

    it('should clamp volume to [0, 1]', () => {
      sm.setVolume(-0.5);
      expect(sm.volume).toBe(0);
      sm.setVolume(1.5);
      expect(sm.volume).toBe(1);
    });

    it('should persist volume to storage', () => {
      sm.setVolume(0.7);
      expect(storage.setItem).toHaveBeenCalledWith('tce-sound-volume', '0.7');
    });
  });

  // ── Mute ────────────────────────────────────────────────

  describe('mute', () => {
    it('should default to false', () => {
      expect(sm.muted).toBe(false);
    });

    it('should set mute state and forward to player', () => {
      sm.setMute(true);
      expect(sm.muted).toBe(true);
      expect(player.setMute).toHaveBeenCalledWith(true);
    });

    it('should persist mute state to storage', () => {
      sm.setMute(true);
      expect(storage.setItem).toHaveBeenCalledWith('tce-sound-muted', 'true');
    });

    it('should toggle mute and return new state', () => {
      const result = sm.toggleMute();
      expect(result).toBe(true);
      expect(sm.muted).toBe(true);

      const result2 = sm.toggleMute();
      expect(result2).toBe(false);
      expect(sm.muted).toBe(false);
    });
  });

  // ── Event-to-sound mapping ──────────────────────────────

  describe('connectToEvents', () => {
    it('should play mapped sound when event fires', () => {
      sm.register('draw-sfx', 'sfx-draw');
      const emitter = new GameEventEmitter();

      sm.connectToEvents(emitter, {
        'card-drawn': 'draw-sfx',
      });

      emitter.emit('card-drawn', { source: 'stock', playerIndex: 0 });
      expect(player.play).toHaveBeenCalledWith('sfx-draw');
    });

    it('should support multiple event mappings', () => {
      sm.register('draw-sfx', 'sfx-draw');
      sm.register('swap-sfx', 'sfx-swap');
      const emitter = new GameEventEmitter();

      sm.connectToEvents(emitter, {
        'card-drawn': 'draw-sfx',
        'card-swapped': 'swap-sfx',
      });

      emitter.emit('card-drawn', { source: 'stock', playerIndex: 0 });
      emitter.emit('card-swapped', {
        position: 4,
        drawnFrom: 'stock',
        playerIndex: 0,
      });

      expect(player.play).toHaveBeenCalledWith('sfx-draw');
      expect(player.play).toHaveBeenCalledWith('sfx-swap');
    });

    it('should not play when muted even if event fires', () => {
      sm.register('draw-sfx', 'sfx-draw');
      sm.setMute(true);
      const emitter = new GameEventEmitter();

      sm.connectToEvents(emitter, {
        'card-drawn': 'draw-sfx',
      });

      emitter.emit('card-drawn', { source: 'stock', playerIndex: 0 });
      // player.play should not have been called with 'sfx-draw'
      // (setMute call happened earlier, but play should not be called)
      const playCalls = (player.play as ReturnType<typeof vi.fn>).mock.calls;
      expect(playCalls.filter((c: string[]) => c[0] === 'sfx-draw')).toHaveLength(0);
    });

    it('should play mapped sound for lifecycle events', () => {
      sm.register('end-sfx', 'sfx-end');
      const emitter = new GameEventEmitter();

      sm.connectToEvents(emitter, {
        'game-ended': 'end-sfx',
      });

      emitter.emit('game-ended', {
        finalTurnNumber: 10,
        winnerIndex: 0,
        reason: 'Player 1 wins',
      });

      expect(player.play).toHaveBeenCalledWith('sfx-end');
    });
  });

  // ── Destroy ─────────────────────────────────────────────

  describe('destroy', () => {
    it('should unsubscribe all event listeners', () => {
      sm.register('draw-sfx', 'sfx-draw');
      const emitter = new GameEventEmitter();

      sm.connectToEvents(emitter, {
        'card-drawn': 'draw-sfx',
      });

      sm.destroy();

      emitter.emit('card-drawn', { source: 'stock', playerIndex: 0 });
      expect(player.play).not.toHaveBeenCalled();
    });

    it('should be safe to call destroy multiple times', () => {
      expect(() => {
        sm.destroy();
        sm.destroy();
      }).not.toThrow();
    });
  });

  // ── Barrel export ───────────────────────────────────────

  describe('barrel exports', () => {
    it('should export SoundManager from core-engine index', async () => {
      const mod = await import('../../src/core-engine/index');
      expect(mod.SoundManager).toBeDefined();
    });
  });
});
