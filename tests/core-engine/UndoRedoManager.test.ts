import { describe, it, expect } from 'vitest';
import {
  UndoRedoManager,
  CompoundCommand,
} from '../../src/core-engine/UndoRedoManager';
import type { Command } from '../../src/core-engine/UndoRedoManager';

/**
 * Helper: create a simple command that increments/decrements a counter.
 */
function counterCommand(
  counter: { value: number },
  delta = 1,
  description?: string,
): Command {
  return {
    execute: () => {
      counter.value += delta;
    },
    undo: () => {
      counter.value -= delta;
    },
    description,
  };
}

describe('UndoRedoManager', () => {
  describe('execute', () => {
    it('should execute a command', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };
      mgr.execute(counterCommand(counter));
      expect(counter.value).toBe(1);
    });

    it('should add executed command to undo history', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };
      expect(mgr.canUndo()).toBe(false);
      expect(mgr.undoSize).toBe(0);

      mgr.execute(counterCommand(counter));
      expect(mgr.canUndo()).toBe(true);
      expect(mgr.undoSize).toBe(1);
    });

    it('should clear redo stack when a new command is executed', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter)); // value = 1
      mgr.undo(); // value = 0
      expect(mgr.canRedo()).toBe(true);

      mgr.execute(counterCommand(counter, 5)); // value = 5, redo cleared
      expect(mgr.canRedo()).toBe(false);
      expect(mgr.redoSize).toBe(0);
    });

    it('should accumulate multiple commands in undo history', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter));
      mgr.execute(counterCommand(counter));
      mgr.execute(counterCommand(counter));

      expect(counter.value).toBe(3);
      expect(mgr.undoSize).toBe(3);
    });
  });

  describe('undo', () => {
    it('should reverse the last command', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter)); // value = 1
      mgr.undo(); // value = 0

      expect(counter.value).toBe(0);
    });

    it('should be a no-op on empty history', () => {
      const mgr = new UndoRedoManager();
      // Should not throw
      mgr.undo();
      expect(mgr.canUndo()).toBe(false);
    });

    it('should move undone command to redo stack', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter));
      expect(mgr.canRedo()).toBe(false);

      mgr.undo();
      expect(mgr.canRedo()).toBe(true);
      expect(mgr.redoSize).toBe(1);
      expect(mgr.undoSize).toBe(0);
    });

    it('should undo multiple commands in reverse order', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter, 1)); // value = 1
      mgr.execute(counterCommand(counter, 10)); // value = 11
      mgr.execute(counterCommand(counter, 100)); // value = 111

      mgr.undo(); // undo +100, value = 11
      expect(counter.value).toBe(11);

      mgr.undo(); // undo +10, value = 1
      expect(counter.value).toBe(1);

      mgr.undo(); // undo +1, value = 0
      expect(counter.value).toBe(0);
    });
  });

  describe('redo', () => {
    it('should re-execute an undone command', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter)); // value = 1
      mgr.undo(); // value = 0
      mgr.redo(); // value = 1

      expect(counter.value).toBe(1);
    });

    it('should be a no-op on empty redo stack', () => {
      const mgr = new UndoRedoManager();
      // Should not throw
      mgr.redo();
      expect(mgr.canRedo()).toBe(false);
    });

    it('should move redone command back to undo stack', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter));
      mgr.undo();
      expect(mgr.undoSize).toBe(0);
      expect(mgr.redoSize).toBe(1);

      mgr.redo();
      expect(mgr.undoSize).toBe(1);
      expect(mgr.redoSize).toBe(0);
    });

    it('should support multiple redo operations', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter, 1));
      mgr.execute(counterCommand(counter, 10));
      mgr.execute(counterCommand(counter, 100));

      mgr.undo(); // 111 -> 11
      mgr.undo(); // 11 -> 1
      mgr.undo(); // 1 -> 0

      mgr.redo(); // 0 -> 1
      expect(counter.value).toBe(1);
      mgr.redo(); // 1 -> 11
      expect(counter.value).toBe(11);
      mgr.redo(); // 11 -> 111
      expect(counter.value).toBe(111);
    });
  });

  describe('redo-after-undo clearing', () => {
    it('should clear redo stack when new command is executed after undo', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter, 1)); // value = 1
      mgr.execute(counterCommand(counter, 2)); // value = 3
      mgr.undo(); // undo +2, value = 1
      expect(mgr.canRedo()).toBe(true);

      // Execute new command -- redo history should be lost
      mgr.execute(counterCommand(counter, 50)); // value = 51
      expect(mgr.canRedo()).toBe(false);
      expect(counter.value).toBe(51);

      // Undo should now undo the +50, not the original +2
      mgr.undo(); // value = 1
      expect(counter.value).toBe(1);
    });
  });

  describe('history accessor', () => {
    it('should return an empty array initially', () => {
      const mgr = new UndoRedoManager();
      expect(mgr.history).toEqual([]);
    });

    it('should return executed commands oldest first', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };
      const cmd1 = counterCommand(counter, 1, 'first');
      const cmd2 = counterCommand(counter, 2, 'second');

      mgr.execute(cmd1);
      mgr.execute(cmd2);

      const hist = mgr.history;
      expect(hist).toHaveLength(2);
      expect(hist[0].description).toBe('first');
      expect(hist[1].description).toBe('second');
    });

    it('should return a copy (not a reference to internal state)', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };
      mgr.execute(counterCommand(counter));

      const hist = mgr.history;
      expect(hist).toHaveLength(1);

      // Mutating the returned array should not affect the manager
      mgr.execute(counterCommand(counter));
      expect(hist).toHaveLength(1); // Still 1 (the snapshot)
      expect(mgr.history).toHaveLength(2); // Manager has 2
    });
  });

  describe('clear', () => {
    it('should empty both undo and redo stacks', () => {
      const mgr = new UndoRedoManager();
      const counter = { value: 0 };

      mgr.execute(counterCommand(counter));
      mgr.execute(counterCommand(counter));
      mgr.undo();

      expect(mgr.canUndo()).toBe(true);
      expect(mgr.canRedo()).toBe(true);

      mgr.clear();

      expect(mgr.canUndo()).toBe(false);
      expect(mgr.canRedo()).toBe(false);
      expect(mgr.undoSize).toBe(0);
      expect(mgr.redoSize).toBe(0);
    });
  });

  describe('3-move prototype sequence', () => {
    it('should correctly handle execute -> undo -> redo', () => {
      const mgr = new UndoRedoManager();
      const state = { position: 0 };

      const moveRight: Command = {
        execute: () => { state.position += 1; },
        undo: () => { state.position -= 1; },
        description: 'move right',
      };
      const moveUp: Command = {
        execute: () => { state.position += 10; },
        undo: () => { state.position -= 10; },
        description: 'move up',
      };
      const moveLeft: Command = {
        execute: () => { state.position -= 1; },
        undo: () => { state.position += 1; },
        description: 'move left',
      };

      // Execute 3 moves
      mgr.execute(moveRight); // 0 -> 1
      expect(state.position).toBe(1);
      mgr.execute(moveUp); // 1 -> 11
      expect(state.position).toBe(11);
      mgr.execute(moveLeft); // 11 -> 10
      expect(state.position).toBe(10);

      // Undo all 3
      mgr.undo(); // 10 -> 11
      expect(state.position).toBe(11);
      mgr.undo(); // 11 -> 1
      expect(state.position).toBe(1);
      mgr.undo(); // 1 -> 0
      expect(state.position).toBe(0);

      // Redo all 3
      mgr.redo(); // 0 -> 1
      expect(state.position).toBe(1);
      mgr.redo(); // 1 -> 11
      expect(state.position).toBe(11);
      mgr.redo(); // 11 -> 10
      expect(state.position).toBe(10);
    });
  });
});

describe('CompoundCommand', () => {
  it('should execute all sub-commands in order', () => {
    const log: string[] = [];
    const cmd1: Command = {
      execute: () => log.push('a'),
      undo: () => log.push('undo-a'),
    };
    const cmd2: Command = {
      execute: () => log.push('b'),
      undo: () => log.push('undo-b'),
    };

    const compound = new CompoundCommand([cmd1, cmd2]);
    compound.execute();

    expect(log).toEqual(['a', 'b']);
  });

  it('should undo all sub-commands in reverse order', () => {
    const log: string[] = [];
    const cmd1: Command = {
      execute: () => log.push('a'),
      undo: () => log.push('undo-a'),
    };
    const cmd2: Command = {
      execute: () => log.push('b'),
      undo: () => log.push('undo-b'),
    };

    const compound = new CompoundCommand([cmd1, cmd2]);
    compound.execute();
    log.length = 0; // Reset log

    compound.undo();
    expect(log).toEqual(['undo-b', 'undo-a']);
  });

  it('should throw if created with no sub-commands', () => {
    expect(() => new CompoundCommand([])).toThrow(
      'at least one sub-command',
    );
  });

  it('should report its size', () => {
    const noop: Command = { execute: () => {}, undo: () => {} };
    const compound = new CompoundCommand([noop, noop, noop]);
    expect(compound.size).toBe(3);
  });

  it('should support optional description', () => {
    const noop: Command = { execute: () => {}, undo: () => {} };
    const compound = new CompoundCommand([noop], 'test compound');
    expect(compound.description).toBe('test compound');
  });

  it('should work with UndoRedoManager as a single undo step', () => {
    const mgr = new UndoRedoManager();
    const counter = { value: 0 };

    const cmd1: Command = {
      execute: () => { counter.value += 1; },
      undo: () => { counter.value -= 1; },
    };
    const cmd2: Command = {
      execute: () => { counter.value += 10; },
      undo: () => { counter.value -= 10; },
    };

    const compound = new CompoundCommand([cmd1, cmd2], 'add 11');
    mgr.execute(compound); // value = 11
    expect(counter.value).toBe(11);
    expect(mgr.undoSize).toBe(1); // Single entry in undo stack

    // Undo should reverse both sub-commands
    mgr.undo(); // value = 0
    expect(counter.value).toBe(0);

    // Redo should re-execute both
    mgr.redo(); // value = 11
    expect(counter.value).toBe(11);
  });
});
