/**
 * Undo/Redo Manager for the Tableau Card Engine.
 *
 * Uses the command pattern to provide unlimited linear undo/redo.
 * Commands define `execute()` and `undo()` methods; compound commands
 * group multiple commands into a single undoable step.
 *
 * Designed to integrate naturally with game transcript recording --
 * each command represents a discrete, replayable game action.
 */

// ── Command interfaces ──────────────────────────────────────

/**
 * A reversible command that can be executed and undone.
 *
 * Game-specific commands implement this interface to define
 * the forward and reverse operations for each game action.
 */
export interface Command {
  /** Apply the command (forward). */
  execute(): void;
  /** Reverse the command (backward). */
  undo(): void;
  /** Optional human-readable description for debugging/transcripts. */
  readonly description?: string;
}

/**
 * A compound command that groups multiple sub-commands into
 * a single undoable step.
 *
 * Executing runs all sub-commands in order.
 * Undoing reverses all sub-commands in reverse order.
 * This is useful for actions like auto-move chains that should
 * be treated as a single step in the undo history.
 */
export class CompoundCommand implements Command {
  readonly description?: string;
  private readonly commands: readonly Command[];

  constructor(commands: Command[], description?: string) {
    if (commands.length === 0) {
      throw new Error('CompoundCommand requires at least one sub-command');
    }
    this.commands = [...commands];
    this.description = description;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    // Reverse order for undo
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  /** Number of sub-commands in this compound command. */
  get size(): number {
    return this.commands.length;
  }
}

// ── UndoRedoManager ─────────────────────────────────────────

/**
 * Manages an unlimited linear undo/redo history of commands.
 *
 * - `execute(cmd)` runs a command and pushes it onto the undo stack.
 * - `undo()` pops the last command, calls `undo()`, and pushes it
 *   onto the redo stack.
 * - `redo()` pops from the redo stack, calls `execute()`, and pushes
 *   it back onto the undo stack.
 * - Executing a new command after an undo clears the redo stack.
 * - Calling `undo()` or `redo()` on an empty stack is a no-op.
 */
export class UndoRedoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  /**
   * Execute a command and add it to the undo history.
   * Clears the redo stack (no branching history).
   */
  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  /**
   * Undo the most recent command.
   * No-op if the undo stack is empty.
   */
  undo(): void {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return;
    }
    command.undo();
    this.redoStack.push(command);
  }

  /**
   * Redo the most recently undone command.
   * No-op if the redo stack is empty.
   */
  redo(): void {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return;
    }
    command.execute();
    this.undoStack.push(command);
  }

  /** Whether there are commands that can be undone. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether there are commands that can be redone. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of commands in the undo history. */
  get undoSize(): number {
    return this.undoStack.length;
  }

  /** Number of commands in the redo history. */
  get redoSize(): number {
    return this.redoStack.length;
  }

  /**
   * Read-only view of the undo history (oldest first).
   * Useful for transcript recording and debugging.
   */
  get history(): readonly Command[] {
    return [...this.undoStack];
  }

  /** Clear all undo and redo history. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
