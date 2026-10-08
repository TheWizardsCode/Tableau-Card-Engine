/**
 * Unit tests for the pure in-game DLC gate helper
 * (src/core-engine/DlcGate.ts, CG-0MUZGBTWW00729L4 — feature F7).
 *
 * The gate is framework-free: the owning game injects a reader (in the
 * launcher the F5 `contentUnlockClient.isUnlocked`). These tests pin the
 * contract that matters to a game — the reader is asked for exactly
 * `{ kind: 'dlc', gameId, dlcId }`, and an **absent, unknown, or unreadable**
 * unlock state degrades to "not unlocked" without ever throwing, so a gated
 * DLC content item can never crash the game that owns it.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createDlcGate,
  type DlcGateTarget,
} from '../../src/core-engine/DlcGate';

const GAME_ID = 'gym';
const DLC_ID = 'bonus-scenery-pack';
const TARGET: DlcGateTarget = { kind: 'dlc', gameId: GAME_ID, dlcId: DLC_ID };

describe('createDlcGate() — unlocked path', () => {
  it('asks the reader for the exact DLC target and reports unlocked', async () => {
    const reader = vi.fn((target: DlcGateTarget) => target.dlcId === DLC_ID);
    const gate = createDlcGate({ gameId: GAME_ID, isUnlocked: reader });

    expect(await gate.isUnlocked(DLC_ID)).toBe(true);
    expect(reader).toHaveBeenCalledWith(TARGET);

    const result = await gate.check(DLC_ID);
    expect(result).toMatchObject({
      gameId: GAME_ID,
      dlcId: DLC_ID,
      unlocked: true,
      reason: 'unlocked',
    });
  });

  it('supports an asynchronous reader', async () => {
    const gate = createDlcGate({
      gameId: GAME_ID,
      isUnlocked: async (target) => target.gameId === GAME_ID && target.dlcId === DLC_ID,
    });

    expect(await gate.isUnlocked(DLC_ID)).toBe(true);
    expect((await gate.check(DLC_ID)).reason).toBe('unlocked');
  });

  it('is deterministic — repeated checks read the same state', async () => {
    let unlocked = false;
    const gate = createDlcGate({ gameId: GAME_ID, isUnlocked: () => unlocked });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    unlocked = true;
    expect(await gate.isUnlocked(DLC_ID)).toBe(true);
  });
});

describe('createDlcGate() — locked path', () => {
  it('reports locked when the reader returns false', async () => {
    const gate = createDlcGate({ gameId: GAME_ID, isUnlocked: () => false });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    const result = await gate.check(DLC_ID);
    expect(result).toMatchObject({ unlocked: false, reason: 'locked' });
  });

  it('reports locked for a different game or DLC id', async () => {
    const gate = createDlcGate({
      gameId: GAME_ID,
      isUnlocked: (target) => target.gameId === 'other-game',
    });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    expect((await gate.check(DLC_ID)).reason).toBe('locked');
  });
});

describe('createDlcGate() — degradation (never crashes, never fabricates)', () => {
  it('degrades to not-unlocked when no reader is supplied', async () => {
    for (const reader of [undefined, null]) {
      const gate = createDlcGate({ gameId: GAME_ID, isUnlocked: reader });
      expect(await gate.isUnlocked(DLC_ID)).toBe(false);
      expect((await gate.check(DLC_ID)).reason).toBe('unreadable');
    }
  });

  it('degrades to not-unlocked when the reader throws', async () => {
    const gate = createDlcGate({
      gameId: GAME_ID,
      isUnlocked: () => {
        throw new Error('bridge unavailable');
      },
    });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    expect((await gate.check(DLC_ID)).reason).toBe('unreadable');
  });

  it('degrades to not-unlocked when the reader rejects', async () => {
    const gate = createDlcGate({
      gameId: GAME_ID,
      isUnlocked: async () => {
        throw new Error('bridge unavailable');
      },
    });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    expect((await gate.check(DLC_ID)).reason).toBe('unreadable');
  });

  it('treats a non-boolean reader result as not-unlocked', async () => {
    for (const bogus of ['yes', 1, {}, null, undefined] as unknown[]) {
      const gate = createDlcGate({
        gameId: GAME_ID,
        isUnlocked: (() => bogus) as unknown as () => boolean,
      });
      expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    }
  });

  it('does not call the reader for a malformed DLC id', async () => {
    const reader = vi.fn(() => true);
    const gate = createDlcGate({ gameId: GAME_ID, isUnlocked: reader });

    for (const malformed of ['', undefined, null, 42] as unknown[]) {
      expect(await gate.isUnlocked(malformed as string)).toBe(false);
    }
    expect(reader).not.toHaveBeenCalled();
  });

  it('does not call the reader when the game id is missing', async () => {
    const reader = vi.fn(() => true);
    const gate = createDlcGate({
      gameId: '' as string,
      isUnlocked: reader,
    });

    expect(await gate.isUnlocked(DLC_ID)).toBe(false);
    expect(reader).not.toHaveBeenCalled();
  });
});
