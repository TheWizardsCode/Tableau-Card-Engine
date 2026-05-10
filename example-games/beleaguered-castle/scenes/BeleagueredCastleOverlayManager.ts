/**
 * BeleagueredCastleOverlayManager — win and no-moves overlays.
 */
import Phaser from 'phaser';
import type { BeleagueredCastleState } from '../BeleagueredCastleState';
import {
  GAME_W, GAME_H, FONT_FAMILY,
  createOverlayBackground, createOverlayButton, createOverlayMenuButton,
  dismissOverlay as sharedDismissOverlay,
} from '../../../src/ui';


export class BeleagueredCastleOverlayManager {
  private scene: Phaser.Scene;
  private state: BeleagueredCastleState;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private onNewGame?: () => void;
  private onRestart?: () => void;
  private onUndoLast?: () => void;

  constructor(scene: Phaser.Scene, state: BeleagueredCastleState) {
    this.scene = scene;
    this.state = state;
  }

  setCallbacks(onNewGame?: () => void, onRestart?: () => void, onUndoLast?: () => void): void {
    this.onNewGame = onNewGame;
    this.onRestart = onRestart;
    this.onUndoLast = onUndoLast;
  }

  dismiss(): void {
    sharedDismissOverlay(this.overlayObjects);
    this.overlayObjects = [];
  }

  showWinOverlay(elapsedSeconds: number, _soundManager?: { play: (key: string) => void } | null): void {
    const OVERLAY_DEPTH = 2000;
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    const { objects: overlayObjects } = createOverlayBackground(this.scene, { depth: OVERLAY_DEPTH, alpha: 0.75 });

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    const title = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 80, 'You Win!', {
      fontSize: '42px', color: '#88ff88', fontFamily: FONT_FAMILY, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    overlayObjects.push(title);

    const stats = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 20,
      `Moves: ${this.state.moveCount}    Time: ${mm}:${ss}`, {
        fontSize: '22px', color: '#aaccaa', fontFamily: FONT_FAMILY, align: 'center',
      }).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    overlayObjects.push(stats);

    const newGameBtn = createOverlayButton(this.scene, GAME_W / 2 - 150, GAME_H / 2 + 50, '[ New Game ]', BUTTON_DEPTH);
    newGameBtn.on('pointerdown', () => this.onNewGame?.());
    overlayObjects.push(newGameBtn);

    const restartBtn = createOverlayButton(this.scene, GAME_W / 2, GAME_H / 2 + 50, '[ Restart ]', BUTTON_DEPTH);
    restartBtn.on('pointerdown', () => this.onRestart?.());
    overlayObjects.push(restartBtn);

    const menuBtn = createOverlayMenuButton(this.scene, GAME_W / 2 + 150, GAME_H / 2 + 50, BUTTON_DEPTH);
    overlayObjects.push(menuBtn);

    this.overlayObjects = overlayObjects;
  }

  showNoMovesOverlay(): void {
    const OVERLAY_DEPTH = 2000;
    const BUTTON_DEPTH = OVERLAY_DEPTH + 1;

    const { objects: overlayObjects } = createOverlayBackground(this.scene, { depth: OVERLAY_DEPTH, alpha: 0.75 });

    const title = this.scene.add.text(GAME_W / 2, GAME_H / 2 - 60, 'No Moves Available', {
      fontSize: '34px', color: '#ff8888', fontFamily: FONT_FAMILY, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(BUTTON_DEPTH);
    overlayObjects.push(title);

    const undoBtn = createOverlayButton(this.scene, GAME_W / 2 - 180, GAME_H / 2 + 30, '[ Undo Last ]', BUTTON_DEPTH);
    undoBtn.on('pointerdown', () => this.onUndoLast?.());
    overlayObjects.push(undoBtn);

    const newGameBtn = createOverlayButton(this.scene, GAME_W / 2 - 30, GAME_H / 2 + 30, '[ New Game ]', BUTTON_DEPTH);
    newGameBtn.on('pointerdown', () => this.onNewGame?.());
    overlayObjects.push(newGameBtn);

    const restartBtn = createOverlayButton(this.scene, GAME_W / 2 + 110, GAME_H / 2 + 30, '[ Restart ]', BUTTON_DEPTH);
    restartBtn.on('pointerdown', () => this.onRestart?.());
    overlayObjects.push(restartBtn);

    const menuBtn = createOverlayMenuButton(this.scene, GAME_W / 2 + 230, GAME_H / 2 + 30, BUTTON_DEPTH);
    overlayObjects.push(menuBtn);

    this.overlayObjects = overlayObjects;
  }
}
