/**
 * Achievement contract: engine-side `AchievementSink` and deterministic fakes.
 *
 * Tests the `AchievementSink` interface and `FakeAchievementSink` (F2,
 * CG-0MUNC7CDH008YBTL). The engine layer (F3) will depend on this contract.
 */
import { describe, it, expect } from 'vitest';

import {
  FakeAchievementSink,
  type AchievementSink,
} from '../../electron/steam-achievements.js';

// ── FakeAchievementSink ─────────────────────────────────────

describe('FakeAchievementSink', () => {
  it('records unlock calls and tracks unique unlocked ids', () => {
    const sink = new FakeAchievementSink();
    sink.unlock('ach-foodie');
    sink.unlock('ach-culture');
    sink.unlock('ach-foodie'); // duplicate — idempotent

    expect(sink.getUnlocked()).toEqual(['ach-foodie', 'ach-culture']);
    expect(sink.isUnlocked('ach-foodie')).toBe(true);
    expect(sink.isUnlocked('ach-culture')).toBe(true);
    expect(sink.isUnlocked('ach-missing')).toBe(false);
  });

  it('tracks full unlock history including duplicates', () => {
    const sink = new FakeAchievementSink();
    sink.unlock('ach-a');
    sink.unlock('ach-b');
    sink.unlock('ach-a');

    expect(sink.unlockHistory).toEqual(['ach-a', 'ach-b', 'ach-a']);
  });

  it('throws on unlock when throwsOnUnlock is set', () => {
    const sink = new FakeAchievementSink({ throwsOnUnlock: true });
    expect(() => sink.unlock('ach-x')).toThrow('Fake sink unlock failed');
  });

  it('getUnlocked returns a defensive copy', () => {
    const sink = new FakeAchievementSink();
    sink.unlock('ach-1');
    const ids = sink.getUnlocked();
    ids.push('ach-fake');
    expect(sink.getUnlocked()).toEqual(['ach-1']);
  });
});

// ── AchievementSink contract surface ────────────────────────

describe('AchievementSink interface (type surface)', () => {
  it('provides unlock, getUnlocked, and isUnlocked methods', () => {
    const sink: AchievementSink = new FakeAchievementSink();
    expect(typeof sink.unlock).toBe('function');
    expect(typeof sink.getUnlocked).toBe('function');
    expect(typeof sink.isUnlocked).toBe('function');
  });
});
