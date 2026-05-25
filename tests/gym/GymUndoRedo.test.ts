/**
 * Gym Undo/Redo scenario tests.
 *
 * Validates that:
 *  - Execute, undo, and redo work correctly
 *  - Redo stack invalidates after a new action
 *  - Empty undo/redo stacks are handled safely
 *  - Compound commands work
 */
import { describe, expect, it } from 'vitest';
import { UndoRedoManager, CompoundCommand } from '../../src/core-engine/UndoRedoManager';
import type { Command } from '../../src/core-engine/UndoRedoManager';

/** Simple increment command for testing. */
class IncrementCommand implements Command {
  readonly description: string;
  constructor(
    private target: { value: number },
    private delta: number,
  ) {
    this.description = `${delta >= 0 ? '+' : ''}${delta}`;
  }
  execute(): void { this.target.value += this.delta; }
  undo(): void { this.target.value -= this.delta; }
}

describe('Gym Undo/Redo scenarios', () => {
  it('executes commands and tracks history', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    mgr.execute(new IncrementCommand(state, 5));
    expect(state.value).toBe(5);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.undoSize).toBe(1);
  });

  it('undoes commands and restores state', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    mgr.execute(new IncrementCommand(state, 10));
    mgr.execute(new IncrementCommand(state, -3));

    expect(state.value).toBe(7);

    mgr.undo();
    expect(state.value).toBe(10);

    mgr.undo();
    expect(state.value).toBe(0);
  });

  it('redoes commands after undo', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    mgr.execute(new IncrementCommand(state, 5));
    mgr.undo();
    expect(state.value).toBe(0);
    expect(mgr.canRedo()).toBe(true);

    mgr.redo();
    expect(state.value).toBe(5);
  });

  it('new action after undo clears redo stack', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    mgr.execute(new IncrementCommand(state, 5));
    mgr.execute(new IncrementCommand(state, 3));
    mgr.undo(); // undo +3, state = 5

    expect(state.value).toBe(5);
    expect(mgr.canRedo()).toBe(true);

    mgr.execute(new IncrementCommand(state, 1)); // new action clears redo
    expect(state.value).toBe(6);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.undoSize).toBe(2);
  });

  it('undo/redo on empty stacks are no-ops', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    expect(mgr.undo()).toBeUndefined();
    expect(mgr.redo()).toBeUndefined();
    expect(state.value).toBe(0);
  });

  it('compound commands undo/redo as a unit', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    const compound = new CompoundCommand([
      new IncrementCommand(state, 2),
      new IncrementCommand(state, 3),
    ], 'compound(+2,+3)');

    mgr.execute(compound);
    expect(state.value).toBe(5);

    mgr.undo();
    expect(state.value).toBe(0);

    mgr.redo();
    expect(state.value).toBe(5);
  });

  it('clear removes all history', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    mgr.execute(new IncrementCommand(state, 1));
    mgr.execute(new IncrementCommand(state, 1));
    mgr.clear();

    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.undoSize).toBe(0);
    expect(mgr.redoSize).toBe(0);
  });
});