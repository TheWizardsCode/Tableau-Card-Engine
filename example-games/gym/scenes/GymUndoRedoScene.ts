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
import { popTextOrIcon } from '../../../src/ui/popTextOrIcon';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText, createActionButton } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

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
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private undoActionBtn!: Phaser.GameObjects.Container | null;
  private redoActionBtn!: Phaser.GameObjects.Container | null;

  constructor() {
    super({ key: GYM_UNDO_REDO_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Undo / Redo');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates reversible actions and stack semantics using the UndoRedoManager. Useful to verify undo/redo boundaries and compound commands.' },
      { heading: 'Controls', body: '[ +1 ], [ +5 ], [ -3 ]: Execute simple increment/decrement actions.\n[ Compound (+2,+3) ]: Execute a grouped command.\nUndo / Redo (action buttons): Step backward/forward through action history.\n[ Clear History ]: Reset undo/redo stacks.' }
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    // Action buttons
    this.addButton(cx - 400, y, '[ +1 ]', () => this.executeAction(1));
    this.addButton(cx - 320, y, '[ +5 ]', () => this.executeAction(5));
    this.addButton(cx - 240, y, '[ -3 ]', () => this.executeAction(-3));
    this.addButton(cx - 140, y, '[ Compound (+2,+3) ]', () => this.executeCompound());
    // Use proper visual action buttons for Undo/Redo (shared createActionButton style)
    this.undoActionBtn = createActionButton(this, cx + 60, y, 60, 'Undo', () => this.doUndo());
    this.redoActionBtn = createActionButton(this, cx + 130, y, 60, 'Redo', () => this.doRedo());
    this.addButton(cx + 220, y, '[ Clear History ]', () => this.clearHistory());

    y += 50;

    // State display
    this.counterText = createHudText(this, cx, y, 'Counter: 0', '#ffffff', { fontSize: '28px' }).setOrigin(0.5);

    y += 40;

    this.undoAvailText = createHudText(this, cx - 120, y, 'Can Undo: no', '#888888', { fontSize: '14px' });
    this.redoAvailText = createHudText(this, cx + 80, y, 'Can Redo: no', '#888888', { fontSize: '14px' });

    y += 30;
    this.historyText = createHudText(this, cx, y, 'History: (empty)', '#669966', { fontSize: '12px' });
    this.historyText.setOrigin(0.5);

    y += 20;
    this.eventLogResult = createEventLog(this, y + 20, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });
  }

  private executeAction(delta: number): void {
    const cmd = new IncrementCommand(this.state, delta);
    this.undoRedo.execute(cmd);
    this.logEvent(`Executed ${delta >= 0 ? '+' : ''}${delta} (counter=${this.state.value})`);
    this.showPop(`+${delta}`, this.counterText.x, this.counterText.y - 20);
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
    this.showPop('Undo', GAME_W / 2, 140);
    this.updateDisplay();
  }

  private doRedo(): void {
    if (!this.undoRedo.canRedo()) {
      this.logEvent('Redo: nothing to redo');
      return;
    }
    const cmd = this.undoRedo.redo()!;
    this.logEvent(`Redid "${cmd.description}" (counter=${this.state.value})`);
    this.showPop('Redo', GAME_W / 2, 140);
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

    // Mirror standard refreshUndoRedoButtons visual state
    if (this.undoActionBtn) this.undoActionBtn.setAlpha(canUndo ? 1 : 0.5);
    if (this.redoActionBtn) this.redoActionBtn.setAlpha(canRedo ? 1 : 0.5);

    const hist = this.undoRedo.history.map((c) => c.description ?? '?').join(', ');
    this.historyText.setText(`History: [${hist}]`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }

  /** Show a pop text/icon near the specified coordinates. */
  private showPop(label: string, x: number, y: number): void {
    popTextOrIcon({
      scene: this,
      label,
      x,
      y,
      duration: this.reducedMotion ? 100 : 400,
      reducedMotion: this.reducedMotion,
      style: { fontSize: '14px', color: '#88ff88', fontFamily: 'monospace' },
    });
  }
}