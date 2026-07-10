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
import { createHudText, createStandardUndoRedoButtons } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymUndoRedoLayoutJson from '../layouts/gym-undo-redo.layout.json';

// Parse the shared Undo/Redo scene layout once at module load.
const UNDO_REDO_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymUndoRedoLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveUndoRedoAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!UNDO_REDO_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(UNDO_REDO_LAYOUT, zone, anchor, viewport, 1);
}

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
  private undoActionBtn!: Phaser.GameObjects.Container;
  private redoActionBtn!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: GYM_UNDO_REDO_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Undo / Redo');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the UndoRedoManager for reversible actions with stack semantics, including compound commands (grouped undo/redo) and boundary conditions. In a real card game, undo/redo lets a player reverse a mistaken move — for example, undoing a discard and returning the card to hand, or undoing a series of actions that were grouped as a single turn. Commands are pushed onto a stack, and new actions after an undo invalidate the redo stack.'
      },
      {
        heading: 'Controls',
        body: '[ +1 ]: Execute an increment action that adds 1 to the counter. Recorded as a single undoable step.\n[ +5 ]: Execute an increment of 5.\n[ -3 ]: Execute a decrement of 3.\n[ Compound (+2,+3) ]: Execute two increment actions grouped as a single compound command, so undo reverses both at once.\nUndo / Redo (action buttons): Step backward or forward through action history. Disabled (dimmed) when no actions are available.\n[ Clear History ]: Reset all undo/redo stacks, clearing the action history.\nStatus lines: Show whether undo and redo are currently available, plus the full command history list.'
      },
      {
        heading: 'Usage Example',
        body: 'A player in Golf mistakenly discards a valuable card. Pressing Undo reverses the discard, returning the card to hand. If the player then draws a new card, the redo stack is invalidated — they cannot redo the discarded action. Compound commands group an entire turn\'s actions (e.g., draw + discard + score) into a single undo step, letting the player reverse the whole turn at once.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ +1 ] four times → counter reaches 4, history shows "+1, +1, +1, +1"\n2. Press Undo → counter drops to 3, history shows "+1, +1, +1"\n3. Press Redo → counter returns to 4\n4. Press [ Compound (+2,+3) ] → counter jumps to 9, history shows a single "compound(+2,+3)" entry\n5. Press Undo → counter drops back to 4, both +2 and +3 undone at once\n6. Press Undo three more times → counter returns to 0\n7. Verify Undo and Redo buttons are dimmed when no actions available\n8. Press [ Clear History ] → history empties, counter stays at 0'
      }
    ]);

    const cx = GAME_W / 2;
    const controlsAnchor = resolveUndoRedoAnchor('controls', 'center');
    const counterAnchor = resolveUndoRedoAnchor('counter', 'center');
    const statusAnchor = resolveUndoRedoAnchor('status', 'center');
    const historyAnchor = resolveUndoRedoAnchor('history', 'center');
    const logAnchor = resolveUndoRedoAnchor('log', 'center');
    const y = controlsAnchor.y;

    // Action buttons
    this.addButton(cx - 400, y, '[ +1 ]', () => this.executeAction(1));
    this.addButton(cx - 320, y, '[ +5 ]', () => this.executeAction(5));
    this.addButton(cx - 240, y, '[ -3 ]', () => this.executeAction(-3));
    this.addButton(cx - 140, y, '[ Compound (+2,+3) ]', () => this.executeCompound());
    // Use standard-positioned undo/redo buttons (shared mechanism)
    const { undoButton, redoButton } = createStandardUndoRedoButtons(
      this, () => this.doUndo(), () => this.doRedo(),
    );
    this.undoActionBtn = undoButton;
    this.redoActionBtn = redoButton;

    this.addButton(cx + 40, y, '[ Clear History ]', () => this.clearHistory());

    // State display
    this.counterText = createHudText(this, cx, counterAnchor.y, 'Counter: 0', '#ffffff', { fontSize: '28px' }).setOrigin(0.5);

    this.undoAvailText = createHudText(this, cx - 120, statusAnchor.y, 'Can Undo: no', '#888888', { fontSize: '14px' });
    this.redoAvailText = createHudText(this, cx + 80, statusAnchor.y, 'Can Redo: no', '#888888', { fontSize: '14px' });

    this.historyText = createHudText(this, cx, historyAnchor.y, 'History: (empty)', '#669966', { fontSize: '12px' });
    this.historyText.setOrigin(0.5);

    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
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