/**
 * BeleagueredCastleTurnController — move execution, undo/redo, auto-complete, game end.
 */
import type { BeleagueredCastleState, BCMove } from '../BeleagueredCastleState';
import {
  applyMove, undoMove, findSafeAutoMoves, isWon, hasNoMoves, hasValuableMoves, isTriviallyWinnable, getAutoCompleteMoves,
} from '../BeleagueredCastleRules';
import type { Command } from '../../../src/core-engine/UndoRedoManager';
import { UndoRedoManager, CompoundCommand } from '../../../src/core-engine/UndoRedoManager';
import type { BCTranscriptRecorder } from '../GameTranscript';
import { AUTO_COMPLETE_DELAY } from './BeleagueredCastleConstants';

class MoveCommand implements Command {
  readonly description: string;
  constructor(private readonly state: BeleagueredCastleState, private readonly move: BCMove) {
    this.description = move.kind === 'tableau-to-foundation'
      ? `Move column ${move.fromCol} -> foundation ${move.toFoundation}`
      : `Move column ${move.fromCol} -> column ${move.toCol}`;
  }
  execute(): void { applyMove(this.state, this.move); }
  undo(): void { undoMove(this.state, this.move); }
}

class AutoMoveCommand implements Command {
  readonly description: string;
  constructor(private readonly state: BeleagueredCastleState, private readonly move: BCMove) {
    this.description = move.kind === 'tableau-to-foundation'
      ? `Auto-move column ${move.fromCol} -> foundation ${move.toFoundation}`
      : `Auto-move column ${move.fromCol} -> column ${move.toCol}`;
  }
  execute(): void {
    applyMove(this.state, this.move);
    this.state.moveCount--;
  }
  undo(): void {
    undoMove(this.state, this.move);
    this.state.moveCount++;
  }
}

export interface TurnControllerCallbacks {
  onRefresh: () => void;
  onCheckGameEnd: () => void;
  onAutoCompleteVisual: (moves: BCMove[], moveCards: Array<{ suit: string; rank: string; foundationIndex: number }>) => void;
  onAutoCompleteDone: () => void;
  onSoundEvent: (event: string, data?: any) => void;
}

export class BeleagueredCastleTurnController {
  private state: BeleagueredCastleState;
  private undoManager: UndoRedoManager;
  private recorder: BCTranscriptRecorder;
  private callbacks: TurnControllerCallbacks;

  gameEnded = false;
  autoCompleting = false;
  private autoCompleteTimers: Phaser.Time.TimerEvent[] = [];
  private timerStarted = false;

  constructor(state: BeleagueredCastleState, recorder: BCTranscriptRecorder, callbacks: TurnControllerCallbacks) {
    this.state = state;
    this.recorder = recorder;
    this.callbacks = callbacks;
    this.undoManager = new UndoRedoManager();
  }

  get canUndo(): boolean { return this.undoManager.canUndo(); }
  get canRedo(): boolean { return this.undoManager.canRedo(); }
  get isTimerStarted(): boolean { return this.timerStarted; }

  startTimer(): void { this.timerStarted = true; }

  executePlayerMove(move: BCMove): void {
    const playerCmd = new MoveCommand(this.state, move);

    applyMove(this.state, move);
    const autoMoves: BCMove[] = [];
    let safe = findSafeAutoMoves(this.state);
    while (safe.length > 0) {
      for (const am of safe) {
        applyMove(this.state, am);
        autoMoves.push(am);
      }
      safe = findSafeAutoMoves(this.state);
    }
    for (let i = autoMoves.length - 1; i >= 0; i--) {
      undoMove(this.state, autoMoves[i]);
    }
    undoMove(this.state, move);

    if (autoMoves.length > 0) {
      const allCmds: Command[] = [playerCmd];
      for (const am of autoMoves) allCmds.push(new AutoMoveCommand(this.state, am));
      this.undoManager.execute(new CompoundCommand(allCmds, playerCmd.description));
    } else {
      this.undoManager.execute(playerCmd);
    }

    this.recorder.recordMove(move, this.state.moveCount);
    for (const am of autoMoves) this.recorder.recordAutoMove(am);

    if (move.kind === 'tableau-to-foundation') {
      const topCard = this.state.foundations[move.toFoundation].peek();
      if (topCard) {
        this.callbacks.onSoundEvent('card-to-foundation', { suit: topCard.suit, rank: topCard.rank, foundationIndex: move.toFoundation });
      }
    } else if (move.kind === 'tableau-to-tableau') {
      const topCard = this.state.tableau[move.toCol].peek();
      if (topCard) {
        this.callbacks.onSoundEvent('card-to-tableau', { suit: topCard.suit, rank: topCard.rank, columnIndex: move.toCol });
      }
    }

    if (!this.timerStarted) {
      this.timerStarted = true;
      this.callbacks.onSoundEvent('timer-started');
    }

    this.callbacks.onRefresh();
    this.checkGameEnd();
  }

  performUndo(): void {
    if (this.autoCompleting) {
      this.cancelAutoComplete();
      if (this.undoManager.canUndo()) {
        this.undoManager.undo();
        this.recorder.recordUndo(this.state.moveCount);
        this.callbacks.onSoundEvent('undo');
        this.callbacks.onRefresh();
      }
      return;
    }
    if (!this.undoManager.canUndo()) return;
    this.undoManager.undo();
    this.recorder.recordUndo(this.state.moveCount);
    this.callbacks.onSoundEvent('undo');
    this.callbacks.onRefresh();
  }

  performRedo(): void {
    if (this.autoCompleting) return;
    if (!this.undoManager.canRedo()) return;
    this.undoManager.redo();
    this.recorder.recordRedo(this.state.moveCount);
    this.callbacks.onSoundEvent('redo');
    this.callbacks.onRefresh();
  }

  checkGameEnd(): void {
    if (this.gameEnded || this.autoCompleting) return;

    if (isWon(this.state)) {
      this.gameEnded = true;
      this.callbacks.onSoundEvent('game-ended', { result: 'win' });
      this.callbacks.onCheckGameEnd();
    } else if (isTriviallyWinnable(this.state)) {
      this.startAutoComplete();
    } else if (hasNoMoves(this.state) || !hasValuableMoves(this.state)) {
      this.gameEnded = true;
      this.callbacks.onSoundEvent('game-ended', { result: 'loss' });
      this.callbacks.onCheckGameEnd();
    }
  }

  startAutoComplete(): void {
    const moves = getAutoCompleteMoves(this.state);
    if (moves.length === 0) return;
    this.autoCompleting = true;

    const moveCards: Array<{ suit: string; rank: string; foundationIndex: number }> = [];
    for (const m of moves) {
      if (m.kind === 'tableau-to-foundation') {
        const topCard = this.state.tableau[m.fromCol].peek();
        moveCards.push({ suit: topCard?.suit ?? '', rank: topCard?.rank ?? '', foundationIndex: m.toFoundation });
      } else {
        moveCards.push({ suit: '', rank: '', foundationIndex: -1 });
      }
      applyMove(this.state, m);
    }
    for (let i = moves.length - 1; i >= 0; i--) {
      undoMove(this.state, moves[i]);
    }

    this.callbacks.onSoundEvent('auto-complete-start', { cardCount: moves.length });

    const cmds: Command[] = moves.map((m) => new AutoMoveCommand(this.state, m));
    this.undoManager.execute(new CompoundCommand(cmds, 'Auto-complete'));
    this.callbacks.onRefresh();
    this.callbacks.onAutoCompleteVisual(moves, moveCards);
  }

  scheduleAutoCompleteTimers(moves: BCMove[], scene: Phaser.Scene, onStep: (move: BCMove, cardInfo: { suit: string; rank: string; foundationIndex: number }) => void, onDone: () => void): void {
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (move.kind !== 'tableau-to-foundation') continue;
      const cardInfo = { suit: '', rank: '', foundationIndex: -1 };
      const timer = scene.time.delayedCall(i * AUTO_COMPLETE_DELAY, () => {
        if (!this.autoCompleting) return;
        onStep(move, cardInfo);
      });
      this.autoCompleteTimers.push(timer);
    }

    const finalTimer = scene.time.delayedCall(moves.length * AUTO_COMPLETE_DELAY + 100, () => {
      if (!this.autoCompleting) return;
      this.autoCompleting = false;
      this.autoCompleteTimers = [];
      onDone();
    });
    this.autoCompleteTimers.push(finalTimer);
  }

  cancelAutoComplete(): void {
    if (!this.autoCompleting) return;
    this.autoCompleting = false;
    for (const timer of this.autoCompleteTimers) {
      timer.destroy();
    }
    this.autoCompleteTimers = [];
  }
}
