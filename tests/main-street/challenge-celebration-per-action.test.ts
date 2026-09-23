/**
 * Main Street: Per-Action Challenge Celebration (CG-0MU8MZBV4007HF1Q)
 *
 * Verifies the celebration helper wired to per-action completion:
 * - fires `animateCelebration` once per newly completed challenge
 * - dedupes against `celebratedChallengeIds` (no double-celebration)
 * - refreshes the challenge tracker after the staggered celebrations
 *
 * @module
 */
import { describe, it, expect, vi } from 'vitest';

import {
  celebrateChallengeIds,
  type ChallengeCelebrationScene,
} from '../../example-games/main-street/scenes/MainStreetChallengeCelebration';

// ── Mock scene ──────────────────────────────────────────────

function makeScene(overrides: Partial<ChallengeCelebrationScene> = {}) {
  const scheduled: Array<{ delay: number; cb: () => void }> = [];
  const celebrate = vi.fn().mockResolvedValue(undefined);
  const refreshAll = vi.fn();
  const refreshAllExceptStreet = vi.fn();

  const scene: ChallengeCelebrationScene = {
    celebratedChallengeIds: new Set<string>(),
    state: {
      activeChallenges: [
        { challenge: { id: 'ch-foodie-row', title: 'Foodie Row' } },
        { challenge: { id: 'ch-deep-pockets', title: 'Deep Pockets' } },
      ],
    },
    time: {
      delayedCall(delay: number, cb: () => void) {
        scheduled.push({ delay, cb });
        return undefined;
      },
    },
    msAnimator: { animateCelebration: celebrate },
    refreshAll,
    incomeCollectionActive: false,
    msRenderer: { refreshAllExceptStreet },
    ...overrides,
  };
  return { scene, scheduled, celebrate, refreshAll, refreshAllExceptStreet };
}

/** Runs all scheduled callbacks (in scheduling order). */
function flush(scheduled: Array<{ delay: number; cb: () => void }>): void {
  for (const { cb } of scheduled.splice(0)) cb();
}

// ── Tests ───────────────────────────────────────────────────

describe('celebrateChallengeIds', () => {
  it('schedules one celebration per new challenge and marks it celebrated', () => {
    const { scene, scheduled, celebrate } = makeScene();

    const celebrated = celebrateChallengeIds(scene, ['ch-foodie-row']);

    expect(celebrated).toEqual(['ch-foodie-row']);
    expect(scene.celebratedChallengeIds.has('ch-foodie-row')).toBe(true);
    flush(scheduled);
    expect(celebrate).toHaveBeenCalledWith('Foodie Row');
  });

  it('staggers multiple celebrations and refreshes the tracker after them', () => {
    const { scene, scheduled, celebrate, refreshAll } = makeScene();

    celebrateChallengeIds(scene, ['ch-foodie-row', 'ch-deep-pockets']);

    // Two animation delays (0, 600) plus a trailing tracker refresh.
    expect(scheduled.map(s => s.delay)).toEqual([0, 600, 1400]);
    flush(scheduled);
    expect(celebrate).toHaveBeenCalledTimes(2);
    expect(refreshAll).toHaveBeenCalledTimes(1);
  });

  it('dedupes: a second call with an already-celebrated ID does nothing (no double-celebration)', () => {
    const { scene, scheduled, celebrate } = makeScene();

    celebrateChallengeIds(scene, ['ch-foodie-row']);
    flush(scheduled);
    expect(celebrate).toHaveBeenCalledTimes(1);

    const second = celebrateChallengeIds(scene, ['ch-foodie-row']);
    expect(second).toEqual([]);
    flush(scheduled);
    // Still only the first celebration — the end-of-turn pass is deduped.
    expect(celebrate).toHaveBeenCalledTimes(1);
  });

  it('celebrates only the not-yet-celebrated subset of a mixed batch', () => {
    const { scene, scheduled, celebrate } = makeScene();
    scene.celebratedChallengeIds.add('ch-foodie-row');

    const celebrated = celebrateChallengeIds(scene, ['ch-foodie-row', 'ch-deep-pockets']);
    expect(celebrated).toEqual(['ch-deep-pockets']);
    flush(scheduled);
    expect(celebrate).toHaveBeenCalledTimes(1);
    expect(celebrate).toHaveBeenCalledWith('Deep Pockets');
  });

  it('uses the tracker refresh variant while income collection is active', () => {
    const { scene, scheduled, refreshAll, refreshAllExceptStreet } = makeScene({
      incomeCollectionActive: true,
    });
    celebrateChallengeIds(scene, ['ch-foodie-row']);
    flush(scheduled);
    expect(refreshAllExceptStreet).toHaveBeenCalledTimes(1);
    expect(refreshAll).not.toHaveBeenCalled();
  });

  it('falls back to a generic title for an unknown challenge id', () => {
    const { scene, scheduled, celebrate } = makeScene();
    celebrateChallengeIds(scene, ['ch-unknown']);
    flush(scheduled);
    expect(celebrate).toHaveBeenCalledWith('Challenge Complete!');
  });

  it('is a no-op for an empty id list', () => {
    const { scene, scheduled, celebrate } = makeScene();
    expect(celebrateChallengeIds(scene, [])).toEqual([]);
    expect(scheduled).toHaveLength(0);
    expect(celebrate).not.toHaveBeenCalled();
  });
});
