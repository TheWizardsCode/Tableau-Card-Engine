/**
 * Main Street: Per-Action Challenge Celebration
 *
 * Centralises the immediate celebration of challenges completed mid-action
 * (CG-0MU8MZBV4007HF1Q). Challenges are now evaluated after every action
 * (producer decision Q2=A), so the scene celebrates as soon as the completing
 * action lands rather than waiting for end of turn. The end-of-turn
 * celebration consults the same `celebratedChallengeIds` set so a challenge is
 * never celebrated twice in a turn.
 *
 * @module
 */

/** Minimal scene surface required by {@link celebrateChallengeIds}. */
export interface ChallengeCelebrationScene {
  celebratedChallengeIds: Set<string>;
  state: {
    activeChallenges: Array<{ challenge: { id: string; title: string } }>;
  };
  time: { delayedCall(delay: number, cb: () => void): unknown };
  msAnimator: { animateCelebration(title: string): Promise<void> };
  refreshAll(): void;
  incomeCollectionActive?: boolean;
  msRenderer: { refreshAllExceptStreet(): void };
}

/**
 * Fires the celebration VFX/SFX for the given challenge IDs, skipping any that
 * were already celebrated this turn. Marks each celebrated ID and refreshes the
 * challenge tracker immediately after the staggered celebrations complete.
 *
 * Reduced motion is handled inside {@link MainStreetAnimator.animateCelebration}
 * (pop-text only, no particles).
 *
 * @param s   The Main Street scene.
 * @param ids Challenge IDs to celebrate (e.g. `state._newlyCompletedThisAction`).
 * @returns The subset of IDs actually celebrated (those not already celebrated).
 */
export function celebrateChallengeIds(
  s: ChallengeCelebrationScene,
  ids: readonly string[],
): string[] {
  const toCelebrate = ids.filter(id => !s.celebratedChallengeIds.has(id));
  if (toCelebrate.length === 0) return [];

  const titleById = new Map<string, string>();
  for (const ac of s.state.activeChallenges ?? []) {
    titleById.set(ac.challenge.id, ac.challenge.title);
  }

  toCelebrate.forEach((challengeId, index) => {
    const title = titleById.get(challengeId) ?? 'Challenge Complete!';
    s.celebratedChallengeIds.add(challengeId);
    s.time.delayedCall(index * 600, () => {
      void s.msAnimator.animateCelebration(title);
    });
  });

  // Refresh the tracker immediately after the staggered celebrations so the
  // completed state shows without waiting for end of turn (AC4).
  s.time.delayedCall(toCelebrate.length * 600 + 200, () => {
    if (s.incomeCollectionActive) {
      s.msRenderer.refreshAllExceptStreet();
    } else {
      s.refreshAll();
    }
  });

  return toCelebrate;
}
