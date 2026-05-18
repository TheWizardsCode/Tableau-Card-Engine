/**
 * GymUndoRedoScene -- Demonstrates reversible actions using the
 * core-engine UndoRedoManager with clear visual feedback.
 *
 * Features:
 *   - Execute actions that change a counter
 *   - Undo/redo with stack state indicators
 *   - Verify redo stack invalidation after new action
 *   - Boundary conditions (undo/redo when empty)
 *
 * @module example-games/gym/scenes/GymUndoRedoScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_UNDO_REDO_KEY } from '../GymRegistry';
import { UndoRedoManager, CompoundCommand } from '../../../src/core-engine/UndoRedoManager';
import type { Command } from '../../../src/core-engine/UndoRedoManager';
import { GAME_W } from '../../../src/ui/constants';

/** A simple command that increments/decrements a counter. */
class IncrementCommand implements Command {
  readonly description: string;
  constructor(
    private target: { value: number },
    private delta: number,
  ) {
    this.description = `${delta >= 0 ? '+' : ''}${delta}`;
  }

  execute(): void {
    this.target.value += this.delta;
  }

  undo(): void {
    this.target.value -= this.delta;
  }
}

export class GymUndoRedoScene extends GymSceneBase {
  private state = { value: 0 };
  private undoRedo = new UndoRedoManager();
  private counterText!: Phaser.GameObjects.Text;
  private undoAvailText!: Phaser.GameObjects.Text;
  private redoAvailText!: Phaser.GameObjects.Text;
  private historyText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  constructor() {
    super({ key: GYM_UNDO_REDO_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Undo / Redo');
    this.addDivider();

    const cx = GAME_W / 2;
    let y = 60;

    // Action buttons
    this.addButton(cx - 400, y, '[ +1 ]', () => this.executeAction(1));
    this.addButton(cx - 320, y, '[ +5 ]', () => this.executeAction(5));
    this.addButton(cx - 240, y, '[ -3 ]', () => this.executeAction(-3));
    this.addButton(cx - 140, y, '[ Compound (+2,+3) ]', () => this.executeCompound());
    this.addButton(cx + 60, y, '[ Undo ]', () => this.doUndo());
    this.addButton(cx + 160, y, '[ Redo ]', () => this.doRedo());
    this.addButton(cx + 280, y, '[ Clear History ]', () => this.clearHistory());

    y += 50;

    // State display
    this.counterText = this.add.text(cx, y, 'Counter: 0', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    y += 40;

    this.undoAvailText = this.addLabel(cx - 120, y, 'Can Undo: no', { fontSize: '14px', color: '#888888' });
    this.redoAvailText = this.addLabel(cx + 80, y, 'Can Redo: no', { fontSize: '14px', color: '#888888' });

    y += 30;
    this.historyText = this.addLabel(cx, y, 'History: (empty)', { fontSize: '12px', color: '#669966' });
    this.historyText.setOrigin(0.5);

    y += 20;
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);
  }

  private executeAction(delta: number): void {
    const cmd = new IncrementCommand(this.state, delta);
    this.undoRedo.execute(cmd);
    this.logEvent(`Executed ${delta >= 0 ? '+' : ''}${delta} (counter=${this.state.value})`);
    this.updateDisplay();
  }

  private executeCompound(): void {
    const cmd = new CompoundCommand([
      new IncrementCommand(this.state, 2),
      new IncrementCommand(this.state, 3),
    ], 'compound(+2,+3)');
    this.undoRedo.execute(cmd);
    this.logEvent(`Executed compound(+2,+3) (counter=${this.state.value})`);
    this.updateDisplay();
  }

  private doUndo(): void {
    if (!this.undoRedo.canUndo()) {
      this.logEvent('Undo: nothing to undo');
      return;
    }
    const cmd = this.undoRedo.undo()!;
    this.logEvent(`Undid "${cmd.description}" (counter=${this.state.value})`);
    this.updateDisplay();
  }

  private doRedo(): void {
    if (!this.undoRedo.canRedo()) {
      this.logEvent('Redo: nothing to redo');
      return;
    }
    const cmd = this.undoRedo.redo()!;
    this.logEvent(`Redid "${cmd.description}" (counter=${this.state.value})`);
    this.updateDisplay();
  }

  private clearHistory(): void {
    this.undoRedo.clear();
    this.logEvent('History cleared');
    this.updateDisplay();
  }

  private updateDisplay(): void {
    this.counterText.setText(`Counter: ${this.state.value}`);
    const canUndo = this.undoRedo.canUndo();
    const canRedo = this.undoRedo.canRedo();
    this.undoAvailText.setText(`Can Undo: ${canUndo ? 'yes' : 'no'}`);
    this.undoAvailText.setColor(canUndo ? '#88ff88' : '#888888');
    this.redoAvailText.setText(`Can Redo: ${canRedo ? 'yes' : 'no'}`);
    this.redoAvailText.setColor(canRedo ? '#88ff88' : '#888888');

    const hist = this.undoRedo.history.map((c) => c.description ?? '?').join(', ');
    this.historyText.setText(`History: [${hist}]`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 250;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(40, baseY + i * 17, this.eventLog[i], {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}