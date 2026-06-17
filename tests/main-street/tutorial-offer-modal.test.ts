/**
 * Tests for the TutorialOfferModal decision logic and state transitions.
 *
 * Rendering tests that require a real Phaser/Phaser DOM environment
 * live in `TutorialOfferModal.browser.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TutorialStorageAdapter } from '../../example-games/main-street/TutorialState';
import {
  loadTutorialState,
  saveTutorialState,
  updateTutorialStatus,
  shouldShowTutorialOffer,
  bridgeLegacyTutorialSeen,
  TUTORIAL_STATE_STORAGE_KEY,
} from '../../example-games/main-street/TutorialState';

// ── Helpers ──────────────────────────────────────────────────

function createInMemoryStorage(): TutorialStorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

// ── Decision Logic (inlined from TutorialOfferModal for testability) ──

/**
 * Re-creates the decision logic from TutorialOfferModal.showIfEligible
 * so we can test it without needing Phaser.
 */
function shouldShowOffer(
  storage: TutorialStorageAdapter,
  opts: { replayMode?: boolean; disableTutorial?: boolean; forceShowOffer?: boolean } = {},
  legacyTutorialSeen?: boolean,
): boolean {
  let state = loadTutorialState(storage);
  if (legacyTutorialSeen !== undefined) {
    state = bridgeLegacyTutorialSeen(storage, legacyTutorialSeen);
  }
  return shouldShowTutorialOffer(state, opts);
}

function persistStatus(
  storage: TutorialStorageAdapter,
  status: 'not_seen' | 'skipped' | 'completed',
): void {
  const current = loadTutorialState(storage);
  const updated = updateTutorialStatus(current, status);
  void saveTutorialState(storage, updated);
}

// ── Tests ────────────────────────────────────────────────────

describe('TutorialOfferModal decision logic', () => {
  let storage: TutorialStorageAdapter;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  // ── First-Launch Prompt ──────────────────────────────────

  it('shows offer on first launch (not_seen state)', () => {
    expect(shouldShowOffer(storage)).toBe(true);
  });

  it('shows offer when state is skipped (player can be re-prompted)', () => {
    persistStatus(storage, 'skipped');
    expect(shouldShowOffer(storage)).toBe(true);
  });

  // ── Start Path ──────────────────────────────────────────

  it('start action persists status as not_seen', () => {
    persistStatus(storage, 'not_seen');
    const raw = storage.getItem(TUTORIAL_STATE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.status).toBe('not_seen');
    // After start, offer should still show (player hasn't completed yet)
    expect(shouldShowOffer(storage)).toBe(true);
  });

  // ── Skip Path ────────────────────────────────────────────

  it('skip action persists status as skipped', () => {
    persistStatus(storage, 'skipped');
    const raw = storage.getItem(TUTORIAL_STATE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.status).toBe('skipped');
    // After skip, offer should still show (player can change mind)
    expect(shouldShowOffer(storage)).toBe(true);
  });

  // ── Completed-State Suppression ──────────────────────────

  it('does NOT show offer when tutorial is completed', () => {
    persistStatus(storage, 'completed');
    expect(shouldShowOffer(storage)).toBe(false);
  });

  // ── Replay Mode Suppression ──────────────────────────────

  it('does NOT show offer in replay mode', () => {
    expect(shouldShowOffer(storage, { replayMode: true })).toBe(false);
  });

  it('does NOT show offer in replay mode even with not_seen state', () => {
    persistStatus(storage, 'not_seen');
    expect(shouldShowOffer(storage, { replayMode: true })).toBe(false);
  });

  // ── Explicit Disable Path ────────────────────────────────

  it('does NOT show offer when disableTutorial is true', () => {
    expect(shouldShowOffer(storage, { disableTutorial: true })).toBe(false);
  });

  it('does NOT show offer when disableTutorial is true even with not_seen state', () => {
    persistStatus(storage, 'not_seen');
    expect(shouldShowOffer(storage, { disableTutorial: true })).toBe(false);
  });

  // ── Force Show Override ──────────────────────────────────

  it('forceShowOffer shows offer even when completed', () => {
    persistStatus(storage, 'completed');
    expect(shouldShowOffer(storage, { forceShowOffer: true })).toBe(true);
  });

  it('forceShowOffer shows offer even in replay mode', () => {
    expect(shouldShowOffer(storage, { forceShowOffer: true, replayMode: true })).toBe(true);
  });

  it('forceShowOffer shows offer even when disableTutorial is true', () => {
    expect(shouldShowOffer(storage, { forceShowOffer: true, disableTutorial: true })).toBe(true);
  });

  // ── Legacy Bridge Integration ────────────────────────────

  it('does NOT show offer when legacy tutorialSeen is true and no new-style state exists', () => {
    expect(shouldShowOffer(storage, {}, true)).toBe(false);
  });

  it('shows offer when legacy tutorialSeen is false', () => {
    expect(shouldShowOffer(storage, {}, false)).toBe(true);
  });

  it('new-style state takes precedence over legacy flag', () => {
    // Write a new-style skipped state
    persistStatus(storage, 'skipped');
    // Even though legacy says true (completed), new-style takes precedence
    expect(shouldShowOffer(storage, {}, true)).toBe(true);
  });

  // ── Completion Persistence ──────────────────────────────

  it('completing the tutorial sets completedAt timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    persistStatus(storage, 'completed');
    const raw = storage.getItem(TUTORIAL_STATE_STORAGE_KEY);
    const parsed = JSON.parse(raw!);
    expect(parsed.status).toBe('completed');
    expect(parsed.completedAt).toBe('2026-06-01T12:00:00.000Z');
    vi.useRealTimers();
  });

  it('completed state suppresses future offers', () => {
    persistStatus(storage, 'completed');
    expect(shouldShowOffer(storage)).toBe(false);
  });

});
