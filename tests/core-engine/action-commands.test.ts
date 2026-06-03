/**
 * Action Commands — Unit & Integration Tests
 *
 * Tests for the shared ActionCommands module extracted into
 * `src/core-engine/ActionCommands.ts`. These tests lock in the
 * baseline command-wrapper behavior for do/undo semantics,
 * description propagation, and UndoRedoManager compatibility.
 *
 * Coverage:
 *  - toCommand wrapper do/undo semantics
 *  - Description propagation
 *  - UndoRedoManager integration (execute → undo → redo)
 *  - Snapshot-based actions via createSnapshotAction
 *  - Negative paths (empty actions, null state)
 *  - Main Street command integration parity
 *
 * Work items: CG-0MPWZ5RPC000OB02, CG-0MPWZ5SIS00553H8
 */
import { describe, it, expect } from 'vitest';

import { toCommand, createSnapshotAction, type ReversibleAction } from '../../src/core-engine/ActionCommands';
import { UndoRedoManager, CompoundCommand } from '../../src/core-engine/UndoRedoManager';

// ── Simple test state ───────────────────────────────────────

interface SimpleState {
  counter: number;
  history: string[];
}

function createSimpleState(): SimpleState {
  return { counter: 0, history: [] };
}

// ── toCommand tests ─────────────────────────────────────────

describe('toCommand', () => {
  describe('do/undo semantics', () => {
    it('applies the action on execute (do)', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'Increment counter',
        do(s) { s.counter += 1; s.history.push('do-increment'); },
        undo(s) { s.counter -= 1; s.history.push('undo-increment'); },
      };
      const cmd = toCommand(state, action);
      cmd.execute();
      expect(state.counter).toBe(1);
      expect(state.history).toEqual(['do-increment']);
    });

    it('reverses the action on undo', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'Increment counter',
        do(s) { s.counter += 1; },
        undo(s) { s.counter -= 1; },
      };
      const cmd = toCommand(state, action);
      cmd.execute();
      expect(state.counter).toBe(1);
      cmd.undo();
      expect(state.counter).toBe(0);
    });

    it('supports multiple do/undo cycles', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'Add value',
        do(s) { s.counter += 5; },
        undo(s) { s.counter -= 5; },
      };
      const cmd = toCommand(state, action);
      cmd.execute();
      expect(state.counter).toBe(5);
      cmd.undo();
      expect(state.counter).toBe(0);
      cmd.execute();
      expect(state.counter).toBe(5);
      cmd.undo();
      expect(state.counter).toBe(0);
    });

    it('handles complex state mutations', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'Complex operation',
        do(s) {
          s.counter += 10;
          s.history.push('op1', 'op2');
        },
        undo(s) {
          s.counter -= 10;
          s.history.pop();
          s.history.pop();
        },
      };
      const cmd = toCommand(state, action);
      cmd.execute();
      expect(state.counter).toBe(10);
      expect(state.history).toEqual(['op1', 'op2']);
      cmd.undo();
      expect(state.counter).toBe(0);
      expect(state.history).toEqual([]);
    });
  });

  describe('description propagation', () => {
    it('propagates the action description to the command', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'My custom action',
        do(s) { s.counter += 1; },
        undo(s) { s.counter -= 1; },
      };
      const cmd = toCommand(state, action);
      expect(cmd.description).toBe('My custom action');
    });

    it('sets description to undefined when action has no description', () => {
      const state = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        do(s) { s.counter += 1; },
        undo(s) { s.counter -= 1; },
      };
      const cmd = toCommand(state, action);
      expect(cmd.description).toBeUndefined();
    });
  });

  describe('isolated state', () => {
    it('does not affect other state objects', () => {
      const stateA = createSimpleState();
      const stateB = createSimpleState();
      const action: ReversibleAction<SimpleState> = {
        description: 'Modify state',
        do(s) { s.counter += 1; },
        undo(s) { s.counter -= 1; },
      };
      const cmdA = toCommand(stateA, action);
      const cmdB = toCommand(stateB, action);
      cmdA.execute();
      expect(stateA.counter).toBe(1);
      expect(stateB.counter).toBe(0);
      cmdB.execute();
      expect(stateA.counter).toBe(1);
      expect(stateB.counter).toBe(1);
      cmdA.undo();
      expect(stateA.counter).toBe(0);
      expect(stateB.counter).toBe(1);
    });
  });
});

// ── createSnapshotAction tests ──────────────────────────────

describe('createSnapshotAction', () => {
  it('captures snapshot on first do and restores on undo', () => {
    interface TmpState { items: string[]; count: number }
    const state: TmpState = { items: ['a', 'b'], count: 2 };
    const action = createSnapshotAction<TmpState>(
      (s: TmpState) => { s.items.push('c'); s.count = s.items.length; },
      (s: TmpState, snap: TmpState) => { s.items = [...snap.items]; s.count = snap.count; },
      'Add item with snapshot',
      (s: TmpState) => ({ items: [...s.items], count: s.count }),
    );
    action.do(state);
    expect(state.items).toEqual(['a', 'b', 'c']);
    expect(state.count).toBe(3);
    action.undo(state);
    expect(state.items).toEqual(['a', 'b']);
    expect(state.count).toBe(2);
  });

  it('reuses the same snapshot across multiple do calls', () => {
    interface TmpState { value: number }
    const state: TmpState = { value: 10 };
    let captureCount = 0;
    const action = createSnapshotAction<TmpState>(
      (s: TmpState) => { s.value += 5; },
      (s: TmpState, snap: TmpState) => { s.value = snap.value; },
      'Snapshot-once',
      (s: TmpState) => { captureCount++; return { value: s.value }; },
    );
    action.do(state); // First do captures snapshot
    expect(state.value).toBe(15);
    expect(captureCount).toBe(1);
    action.undo(state);
    expect(state.value).toBe(10);
    action.do(state); // Second do does NOT re-capture
    expect(state.value).toBe(15);
    expect(captureCount).toBe(1); // Still 1
  });

  it('is a no-op for undo when snapshot is null', () => {
    interface TmpState { value: number }
    const state: TmpState = { value: 10 };
    const action = createSnapshotAction<TmpState>(
      (s: TmpState) => { s.value += 5; },
      (s: TmpState, snap: TmpState) => { s.value = snap.value; },
      undefined,
      (s: TmpState) => ({ value: s.value }),
    );
    // Calling undo before do should not throw
    expect(() => action.undo(state)).not.toThrow();
    expect(state.value).toBe(10);
  });
});

// ── UndoRedoManager integration ─────────────────────────────

describe('UndoRedoManager integration', () => {
  it('supports execute → undo → redo cycle with toCommand', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();

    const incAction: ReversibleAction<SimpleState> = {
      description: 'Increment',
      do(s) { s.counter += 1; },
      undo(s) { s.counter -= 1; },
    };
    const cmd = toCommand(state, incAction);

    manager.execute(cmd);
    expect(state.counter).toBe(1);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    const undone = manager.undo();
    expect(undone).toBeDefined();
    expect(state.counter).toBe(0);
    expect(manager.canUndo()).toBe(false);
    expect(manager.canRedo()).toBe(true);

    const redone = manager.redo();
    expect(redone).toBeDefined();
    expect(state.counter).toBe(1);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
  });

  it('clears redo stack when new command is executed after undo', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();

    const action1: ReversibleAction<SimpleState> = {
      description: 'Add 1',
      do(s) { s.counter += 1; },
      undo(s) { s.counter -= 1; },
    };
    const action2: ReversibleAction<SimpleState> = {
      description: 'Add 2',
      do(s) { s.counter += 2; },
      undo(s) { s.counter -= 2; },
    };

    manager.execute(toCommand(state, action1));
    manager.execute(toCommand(state, action2));
    expect(state.counter).toBe(3);

    manager.undo(); // Undo action2
    expect(state.counter).toBe(1);
    expect(manager.canRedo()).toBe(true);

    manager.execute(toCommand(state, action1)); // New command clears redo
    expect(state.counter).toBe(2);
    expect(manager.canRedo()).toBe(false);
    expect(manager.canUndo()).toBe(true);
  });

  it('supports multiple sequential commands', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();

    for (let i = 1; i <= 5; i++) {
      const action: ReversibleAction<SimpleState> = {
        description: `Add ${i}`,
        do(s) { s.counter += i; },
        undo(s) { s.counter -= i; },
      };
      manager.execute(toCommand(state, action));
    }

    expect(state.counter).toBe(15); // 1+2+3+4+5

    // Undo 3 steps (removes 5+4+3 from 15)
    manager.undo();
    manager.undo();
    manager.undo();
    expect(state.counter).toBe(3); // 15-5-4-3

    // Redo 2 steps (adds back 3+4)
    manager.redo();
    manager.redo();
    expect(state.counter).toBe(10); // 3+3+4

    expect(manager.undoSize).toBe(4);
    expect(manager.redoSize).toBe(1);
  });

  it('handles compound commands (CompoundCommand) wrapping action commands', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();

    const step1: ReversibleAction<SimpleState> = {
      description: 'Step 1: +2',
      do(s) { s.counter += 2; },
      undo(s) { s.counter -= 2; },
    };
    const step2: ReversibleAction<SimpleState> = {
      description: 'Step 2: +3',
      do(s) { s.counter += 3; },
      undo(s) { s.counter -= 3; },
    };

    const compound = new CompoundCommand(
      [toCommand(state, step1), toCommand(state, step2)],
      'Compound: +5',
    );

    manager.execute(compound);
    expect(state.counter).toBe(5);

    manager.undo();
    expect(state.counter).toBe(0);

    manager.redo();
    expect(state.counter).toBe(5);
  });
});

// ── Negative / edge-case tests ──────────────────────────────

describe('negative / edge cases', () => {
  it('handles no-op action (do and undo do nothing)', () => {
    const state = createSimpleState();
    const noop: ReversibleAction<SimpleState> = {
      do(_s) { /* no-op */ },
      undo(_s) { /* no-op */ },
    };
    const cmd = toCommand(state, noop);
    cmd.execute();
    expect(state.counter).toBe(0);
    cmd.undo();
    expect(state.counter).toBe(0);
  });

  it('handles multiple undos in sequence', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();
    const action: ReversibleAction<SimpleState> = {
      description: '+1',
      do(s) { s.counter += 1; },
      undo(s) { s.counter -= 1; },
    };
    manager.execute(toCommand(state, action));
    manager.undo();
    // Extra undos should be no-ops
    const result = manager.undo();
    expect(result).toBeUndefined();
    expect(state.counter).toBe(0);
  });

  it('handles redo when redo stack is empty', () => {
    const manager = new UndoRedoManager();
    const result = manager.redo();
    expect(result).toBeUndefined();
  });

  it('handles execute on a command that throws', () => {
    const state = createSimpleState();
    const badAction: ReversibleAction<SimpleState> = {
      do(_s) { throw new Error('Action failed'); },
      undo(s) { s.counter -= 1; },
    };
    const cmd = toCommand(state, badAction);
    expect(() => cmd.execute()).toThrow('Action failed');
    // State should be unchanged after thrown error
    expect(state.counter).toBe(0);
  });
});

// ── Main Street integration parity ──────────────────────────

describe('Main Street action command parity', () => {
  it('toCommand produces a Command-compatible object usable by UndoRedoManager', () => {
    const manager = new UndoRedoManager();
    const state = createSimpleState();

    const action: ReversibleAction<SimpleState> = {
      description: 'Market buy',
      do(s) { s.counter -= 5; s.history.push('bought-card'); },
      undo(s) { s.counter += 5; s.history.pop(); },
    };

    const cmd = toCommand(state, action);
    expect(typeof cmd.execute).toBe('function');
    expect(typeof cmd.undo).toBe('function');

    manager.execute(cmd);
    expect(state.counter).toBe(-5);
    expect(state.history).toEqual(['bought-card']);

    manager.undo();
    expect(state.counter).toBe(0);
    expect(state.history).toEqual([]);

    manager.redo();
    expect(state.counter).toBe(-5);
    expect(state.history).toEqual(['bought-card']);
  });

  it('supports the snapshot pattern used by Main Street commands', () => {
    interface TmpState { coins: number; items: string[] }
    const state: TmpState = { coins: 100, items: ['tool'] };

    // Simulate Main Street's snapshot pattern:
    // capture snapshot before do, restore on undo
    const action = createSnapshotAction<TmpState>(
      (s: TmpState) => { s.coins -= 10; s.items.push('gadget'); },
      (s: TmpState, snap: TmpState) => { s.coins = snap.coins; s.items = [...snap.items]; },
      'Buy gadget',
      (s: TmpState) => ({ coins: s.coins, items: [...s.items] }),
    );

    const cmd = toCommand(state, action);
    cmd.execute();
    expect(state.coins).toBe(90);
    expect(state.items).toEqual(['tool', 'gadget']);

    cmd.undo();
    expect(state.coins).toBe(100);
    expect(state.items).toEqual(['tool']);
  });
});
