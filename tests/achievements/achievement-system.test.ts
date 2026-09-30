/**
 * Engine-generic achievement layer tests (F3, CG-0MUNC7D0H00554B8).
 *
 * Tests the `AchievementSystem`, `NoOpAchievementSink`, achievement
 * definitions, mapping resolution, idempotent unlocks, hidden-flag
 * propagation, unmapped challenges, and sink-dispatch failure tolerance.
 *
 * No Steam, Electron, or browser dependency — pure engine unit tests.
 */
import { describe, it, expect } from 'vitest';

import {
  AchievementSystem,
  NoOpAchievementSink,
  type AchievementDefinition,
  type AchievementSink,
} from '../../src/core-engine/AchievementSystem';

// ── Fixtures ────────────────────────────────────────────────

const FOODIE: AchievementDefinition = {
  id: 'ach-foodie-row',
  title: 'Foodie Row',
  description: 'Place 3+ adjacent Food businesses.',
  hidden: false,
};

const CULTURE: AchievementDefinition = {
  id: 'ach-culture-district',
  title: 'Cultural District',
  description: 'Have 4+ Culture businesses.',
  hidden: false,
};

const SECRET: AchievementDefinition = {
  id: 'ach-secret',
  title: 'Secret Achievement',
  description: 'A hidden achievement.',
  hidden: true,
};

/** Build a mapping keyed by challenge id. */
function mappingFor(
  entries: Record<string, AchievementDefinition>,
): (challengeId: string) => AchievementDefinition | null {
  return (challengeId) => entries[challengeId] ?? null;
}

/** A sink that throws on the first N unlock calls (error-path testing). */
class ThrowingSink implements AchievementSink {
  private unlocks: string[] = [];
  throwCount: number;

  constructor(throwCount = 1) {
    this.throwCount = throwCount;
  }

  unlock(achievementId: string): void {
    if (this.throwCount > 0) {
      this.throwCount -= 1;
      throw new Error('sink dispatch failed');
    }
    if (!this.unlocks.includes(achievementId)) {
      this.unlocks.push(achievementId);
    }
  }

  getUnlocked(): string[] {
    return [...this.unlocks];
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlocks.includes(achievementId);
  }
}

// ── Definition registration ─────────────────────────────────

describe('AchievementSystem — definition registration', () => {
  it('registers and looks up achievement definitions', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);

    expect(system.getDefinition('ach-foodie-row')).toEqual(FOODIE);
    expect(system.getDefinition('ach-missing')).toBeNull();
    expect(system.getDefinitionCount()).toBe(1);
  });

  it('registers multiple definitions at once', () => {
    const system = new AchievementSystem();
    system.registerDefinitions([FOODIE, CULTURE, SECRET]);

    expect(system.getDefinitionCount()).toBe(3);
    expect(system.getAllDefinitions()).toContainEqual(CULTURE);
  });

  it('updates a definition on re-register (no unlock effect)', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.registerDefinition({ ...FOODIE, title: 'Updated title' });

    expect(system.getDefinition('ach-foodie-row')?.title).toBe('Updated title');
    expect(system.getDefinitionCount()).toBe(1);
    expect(system.getUnlockedIds()).toEqual([]);
  });

  it('propagates the hidden flag from the definition', () => {
    const system = new AchievementSystem();
    system.registerDefinition(SECRET);
    expect(system.getDefinition('ach-secret')?.hidden).toBe(true);
  });
});

// ── Mapping resolution and unlock ───────────────────────────

describe('AchievementSystem — mapping resolution and unlock', () => {
  it('unlocks the mapped achievement when a challenge completes', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    expect(system.onChallengeCompleted('ch-foodie-row')).toBe('ach-foodie-row');
    expect(system.isUnlocked('ach-foodie-row')).toBe(true);
    expect(system.getUnlockedIds()).toEqual(['ach-foodie-row']);
  });

  it('ignores unmapped challenges', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    expect(system.onChallengeCompleted('ch-unknown')).toBeNull();
    expect(system.getUnlockedIds()).toEqual([]);
  });

  it('returns null when no mapping is set', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    expect(system.onChallengeCompleted('ch-foodie-row')).toBeNull();
  });

  it('is idempotent on repeated completion of the same challenge', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    system.onChallengeCompleted('ch-foodie-row');
    system.onChallengeCompleted('ch-foodie-row');
    system.onChallengeCompleted('ch-foodie-row');

    expect(system.getUnlockedIds()).toEqual(['ach-foodie-row']);
  });

  it('unlocks multiple distinct achievements independently', () => {
    const system = new AchievementSystem();
    system.registerDefinitions([FOODIE, CULTURE]);
    system.setMapping(
      mappingFor({ 'ch-foodie-row': FOODIE, 'ch-culture-district': CULTURE }),
    );

    system.onChallengeCompleted('ch-foodie-row');
    system.onChallengeCompleted('ch-culture-district');

    expect(system.getUnlockedIds()).toEqual([
      'ach-foodie-row',
      'ach-culture-district',
    ]);
  });

  it('exposes hidden-ness via the definition for mapped achievements', () => {
    const system = new AchievementSystem();
    system.registerDefinition(SECRET);
    system.setMapping(mappingFor({ 'ch-secret': SECRET }));

    system.onChallengeCompleted('ch-secret');
    const unlockedDef = system.getDefinition('ach-secret');
    expect(unlockedDef?.hidden).toBe(true);
  });
});

// ── Rehydration ─────────────────────────────────────────────

describe('AchievementSystem — rehydration', () => {
  it('rehydrates initial unlocked ids into the sink', () => {
    const system = new AchievementSystem({
      initialUnlocked: ['ach-foodie-row', 'ach-culture-district'],
    });

    expect(system.isUnlocked('ach-foodie-row')).toBe(true);
    expect(system.getUnlockedIds()).toEqual([
      'ach-foodie-row',
      'ach-culture-district',
    ]);
  });

  it('does not re-unlock an already-rehydrated achievement', () => {
    const sink = new NoOpAchievementSink();
    const system = new AchievementSystem({
      sink,
      initialUnlocked: ['ach-foodie-row'],
    });
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    // Rehydrated already — returns the id without dispatching again.
    expect(system.onChallengeCompleted('ch-foodie-row')).toBe('ach-foodie-row');
  });
});

// ── Sink dispatch failure tolerance ─────────────────────────

describe('AchievementSystem — sink dispatch failure tolerance', () => {
  it('does not throw when the sink throws on unlock', () => {
    const sink = new ThrowingSink(1);
    const system = new AchievementSystem({ sink });
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    expect(() => system.onChallengeCompleted('ch-foodie-row')).not.toThrow();
    expect(system.onChallengeCompleted('ch-foodie-row')).toBe('ach-foodie-row');
  });

  it('retries the unlock after a transient sink failure', () => {
    const sink = new ThrowingSink(1);
    const system = new AchievementSystem({ sink });
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    // First call fails; second succeeds.
    expect(system.onChallengeCompleted('ch-foodie-row')).toBeNull();
    expect(system.onChallengeCompleted('ch-foodie-row')).toBe('ach-foodie-row');
    expect(system.isUnlocked('ach-foodie-row')).toBe(true);
  });
});

// ── Sink swapping ───────────────────────────────────────────

describe('AchievementSystem — setSink', () => {
  it('migrates already-tracked unlocks to the new sink', () => {
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));
    system.onChallengeCompleted('ch-foodie-row');

    const newSink = new NoOpAchievementSink();
    system.setSink(newSink);

    expect(system.isUnlocked('ach-foodie-row')).toBe(true);
    expect(newSink.getUnlocked()).toEqual(['ach-foodie-row']);
  });
});

// ── NoOpAchievementSink ─────────────────────────────────────

describe('NoOpAchievementSink', () => {
  it('records unique unlocks and reports them', () => {
    const sink = new NoOpAchievementSink();
    sink.unlock('ach-a');
    sink.unlock('ach-b');
    sink.unlock('ach-a'); // duplicate

    expect(sink.getUnlocked()).toEqual(['ach-a', 'ach-b']);
    expect(sink.isUnlocked('ach-a')).toBe(true);
    expect(sink.isUnlocked('ach-c')).toBe(false);
  });

  it('returns a defensive copy of the unlocked list', () => {
    const sink = new NoOpAchievementSink();
    sink.unlock('ach-a');
    const ids = sink.getUnlocked();
    ids.push('ach-fake');
    expect(sink.getUnlocked()).toEqual(['ach-a']);
  });
});

// ── Integration with ChallengeCompletionCallback ────────────

describe('AchievementSystem — ChallengeSystem integration', () => {
  it('can be driven from a ChallengeCompletionCallback', () => {
    // Mirrors how a game wires the callback: the callback receives the
    // completed ChallengeDefinition and forwards its id to the system.
    const system = new AchievementSystem();
    system.registerDefinition(FOODIE);
    system.setMapping(mappingFor({ 'ch-foodie-row': FOODIE }));

    // Simulate the ChallengeSystem invoking the completion callback.
    const onComplete = (challenge: { id: string }): void => {
      system.onChallengeCompleted(challenge.id);
    };
    onComplete({ id: 'ch-foodie-row' });

    expect(system.isUnlocked('ach-foodie-row')).toBe(true);
  });
});
