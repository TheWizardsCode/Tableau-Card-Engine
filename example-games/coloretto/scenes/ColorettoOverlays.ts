/**
 * ColorettoOverlays — modal overlay rendering for Coloretto.
 *
 * Responsible for:
 *  - The round-scoring colour picker (choose 3 positive colours + joker declarations)
 *  - The round score table overlay
 *  - The game-over overlay (winner + play again / menu)
 *
 * The scene keeps the overlay entry points (showColorPickerOverlay /
 * showRoundScoreOverlay / showGameOverOverlay) and delegates construction
 * to this helper, so a developer adding a new overlay can edit this file
 * without wading through row/collection rendering or AI scheduling code.
 */

import Phaser from 'phaser';
import type { ChameleonColor } from '../ColorettoCards';
import { colorLabel, colorHex, COLORS } from '../ColorettoCards';
import type { RoundResult } from '../ColorettoGame';
import {
  colorCounts,
  presentColors,
  pointsForCount,
  selectBestPositiveColors,
  countJokers,
  optimalJokerAssignment,
} from '../ColorettoScoring';
import type { JokerAssignment } from '../ColorettoScoring';
import {
  GAME_W,
  GAME_H,
  FONT_FAMILY,
  dismissOverlay,
  createOverlayBackground,
  createOverlayButton,
} from '@ui';

// ── Constants ──────────────────────────────────────────────

const CHIP_W = 44;
const CHIP_H = 28;
const CHIP_GAP = 52;
const SFX_UI = 'ui';
const SFX_SCORE = 'score';

/**
 * Builds and manages the Coloretto modal overlays. Receives the scene and
 * the callback functions it needs (round-scoring completion, turm
 * continuation, transcript sealing) to stay decoupled from the scene's
 * orchestration.
 */
export class ColorettoOverlays {
  constructor(
    private scene: Phaser.Scene,
    private overlayObjects: Phaser.GameObjects.GameObject[],
    private getSession: () => {
      players: { name: string; totalScore: number; collection: import('../ColorettoCards').ColorettoCard[] }[];
      currentRound: number;
    },
    private setPhase: (phase: string) => void,
    private getHudContainer: () => Phaser.GameObjects.Container | undefined,
    private playSound: (key: string) => void,
    private getInstructionText: () => Phaser.GameObjects.Text,
    private onScoringComplete: (positives: ChameleonColor[], jokers?: JokerAssignment) => void,
    private onNextRound: () => void,
    private onGameOverAction: (action: 'restart' | 'menu') => void,
    private finalizeTranscript: (winnerIndex: number) => void,
  ) {}

  // ── Round scoring (colour picker) ────────────────────────

  /** Show a picker: choose 3 positive colours (+ declare any jokers). */
  showColorPickerOverlay(): void {
    const human = this.getSession().players[0];
    const jokerCount = countJokers(human.collection);
    const hasJokers = jokerCount > 0;
    const boxH = hasJokers ? 460 : 380;

    // Initial state: joint optimum (positives + joker declarations).
    const selected = new Set<ChameleonColor>(selectBestPositiveColors(human.collection));
    const jokerAssignment: ChameleonColor[] = [...optimalJokerAssignment(human.collection)];

    const helper = this;
    const { objects } = createOverlayBackground(
      this.scene,
      { depth: 199, alpha: 0.7 },
      { width: 620, height: boxH, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;
    const titleY = boxY - (hasJokers ? 190 : 150);
    const subtitleY = boxY - (hasJokers ? 158 : 118);
    const chipY = boxY - (hasJokers ? 55 : 30);
    const confirmY = boxY + (hasJokers ? 165 : 120);

    const title = this.scene.add
      .text(centerX, titleY, 'Choose 3 colors to score POSITIVELY', {
        fontSize: '20px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    this.addToHud(title);
    this.overlayObjects.push(title);

    const subtitle = this.scene.add
      .text(centerX, subtitleY, 'All other colors score negatively', {
        fontSize: '14px',
        color: '#aacccc',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    this.addToHud(subtitle);
    this.overlayObjects.push(subtitle);

    if (hasJokers) {
      const jokerHint = this.scene.add
        .text(centerX, boxY + 35, 'Click a joker to change its color', {
          fontSize: '14px',
          color: '#e8c1ff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5)
        .setDepth(201);
      this.addToHud(jokerHint);
      this.overlayObjects.push(jokerHint);
    }

    const chips: { color: ChameleonColor; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const jokerChips: { index: number; objects: Phaser.GameObjects.GameObject[] }[] = [];
    const chipStartX = centerX - 260;
    const jokerChipY = boxY + 68;

    const destroyChip = (objects: Phaser.GameObjects.GameObject[]): void => {
      for (const obj of objects) obj.destroy();
    };

    const drawChips = (): void => {
      for (const entry of chips) destroyChip(entry.objects);
      chips.length = 0;
      for (const entry of jokerChips) destroyChip(entry.objects);
      jokerChips.length = 0;

      const counts = colorCounts(human.collection, jokerAssignment);
      const present = presentColors(counts);

      present.forEach((color, i) => {
        const x = chipStartX + i * 80;
        const isSelected = selected.has(color);
        const pts = pointsForCount(counts[color]);
        const objects: Phaser.GameObjects.GameObject[] = [];

        const bg = helper.scene.add.rectangle(x, chipY, 70, 64, Phaser.Display.Color.HexStringToColor(colorHex(color)).color)
          .setStrokeStyle(isSelected ? 4 : 1, isSelected ? 0xffdd66 : 0x445566)
          .setDepth(201)
          .setInteractive({ useHandCursor: true });
        helper.addToHud(bg);
        objects.push(bg);

        const countLabel = helper.scene.add
          .text(x, chipY - 12, `${counts[color]} cards`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(201);
        helper.addToHud(countLabel);
        objects.push(countLabel);

        const ptsLabel = helper.scene.add
          .text(x, chipY + 8, `${isSelected ? '+' : '\u2212'}${pts}`, {
            fontSize: '14px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(201);
        helper.addToHud(ptsLabel);
        objects.push(ptsLabel);

        chips.push({ color, objects });

        bg.on('pointerdown', () => {
          helper.playSound(SFX_UI);
          if (selected.has(color)) {
            if (selected.size > 1) selected.delete(color);
          } else if (selected.size < 3) {
            selected.add(color);
          } else {
            helper.getInstructionText().setText('You may only pick 3 positive colors');
            return;
          }
          drawChips();
        });
      });

      // Per-joker declaration chips: click to cycle the declared color.
      if (hasJokers) {
        const startX = centerX - ((jokerCount - 1) * 80) / 2;
        jokerAssignment.forEach((assigned, i) => {
          const x = startX + i * 80;
          const objects: Phaser.GameObjects.GameObject[] = [];

          const bg = helper.scene.add.rectangle(x, jokerChipY, 70, 44, Phaser.Display.Color.HexStringToColor(colorHex(assigned)).color)
            .setStrokeStyle(2, 0xbb88ff)
            .setDepth(201)
            .setInteractive({ useHandCursor: true });
          helper.addToHud(bg);
          objects.push(bg);

          const label = helper.scene.add
            .text(x, jokerChipY - 7, `J${i + 1} \u2192 ${colorLabel(assigned)}`, {
              fontSize: '12px',
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              stroke: '#000000',
              strokeThickness: 2,
            })
            .setOrigin(0.5)
            .setDepth(201);
          helper.addToHud(label);
          objects.push(label);

          const hint = helper.scene.add
            .text(x, jokerChipY + 12, 'wild', {
              fontSize: '9px',
              color: '#a09bd8',
              fontFamily: FONT_FAMILY,
            })
            .setOrigin(0.5)
            .setDepth(201);
          helper.addToHud(hint);
          objects.push(hint);

          jokerChips.push({ index: i, objects });

          bg.on('pointerdown', () => {
            helper.playSound(SFX_UI);
            const idx = COLORS.indexOf(assigned);
            jokerAssignment[i] = COLORS[(idx + 1) % COLORS.length];
            drawChips();
          });
        });
      }
    };

    drawChips();

    const confirm = createOverlayButton(this.scene, centerX, confirmY, 'Confirm', 201, { fontSize: '18px' });
    this.addToHud(confirm);
    this.overlayObjects.push(confirm);
    confirm.on('pointerdown', () => {
      helper.playSound(SFX_UI);
      for (const entry of chips) destroyChip(entry.objects);
      chips.length = 0;
      for (const entry of jokerChips) destroyChip(entry.objects);
      jokerChips.length = 0;
      dismissOverlay(helper.overlayObjects);
      helper.overlayObjects.length = 0;
      helper.onScoringComplete(
        [...selected],
        hasJokers ? [...jokerAssignment] : undefined,
      );
    });
  }

  // ── Round score overlay ──────────────────────────────────

  /** Show the round score table with per-colour breakdown chips. */
  showRoundScoreOverlay(result: RoundResult): void {
    this.setPhase('round-scoring');

    const { objects } = createOverlayBackground(
      this.scene,
      { depth: 199, alpha: 0.7 },
      { width: 620, height: 420, color: 0x0d1a21, alpha: 0.95, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const session = this.getSession();
    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const title = this.scene.add
      .text(centerX, boxY - 175, `Round ${result.round + 1} Scores`, {
        fontSize: '26px',
        color: '#ffdd66',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    this.addToHud(title);
    this.overlayObjects.push(title);

    result.playerScores.forEach((score, i) => {
      const y = boxY - 110 + i * 52;
      const player = session.players[i];
      const name = this.scene.add
        .text(centerX - 250, y, `${player.name}:`, {
          fontSize: '17px',
          color: i === 0 ? '#ffffff' : '#c8e8d8',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0, 0.5)
        .setDepth(201);
      this.addToHud(name);
      this.overlayObjects.push(name);

      const positiveStroke = Phaser.Display.Color.HexStringToColor(colorHex('green')).color;
      const negativeStroke = Phaser.Display.Color.HexStringToColor(colorHex('red')).color;
      let chipX = centerX - 150;
      for (const group of [
        score.details.filter((d) => d.positive),
        score.details.filter((d) => !d.positive),
      ]) {
        for (const d of group) {
          const chip = this.scene.add
            .rectangle(
              chipX,
              y,
              CHIP_W,
              CHIP_H,
              Phaser.Display.Color.HexStringToColor(colorHex(d.color)).color,
            )
            .setStrokeStyle(2, d.positive ? positiveStroke : negativeStroke)
            .setDepth(201);
          this.addToHud(chip);
          this.overlayObjects.push(chip);

          const label = this.scene.add
            .text(chipX, y, `${d.positive ? '+' : '\u2212'}${Math.abs(d.points)}`, {
              fontSize: '11px',
              color: '#ffffff',
              fontFamily: FONT_FAMILY,
              stroke: '#000000',
              strokeThickness: 2,
            })
            .setOrigin(0.5)
            .setDepth(201);
          this.addToHud(label);
          this.overlayObjects.push(label);

          chipX += CHIP_GAP;
        }
        chipX += 16;
      }

      const roundScore = result.roundScores[i];
      const scoreText = this.scene.add
        .text(centerX + 250, y, `${roundScore > 0 ? '+' : ''}${roundScore} (total ${result.cumulativeScores[i]})`, {
          fontSize: '17px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(1, 0.5)
        .setDepth(201);
      this.addToHud(scoreText);
      this.overlayObjects.push(scoreText);
    });

    const next = createOverlayButton(this.scene, centerX, boxY + 150, 'Next Round', 201, { fontSize: '18px' });
    this.addToHud(next);
    this.overlayObjects.push(next);
    next.on('pointerdown', () => {
      this.playSound(SFX_UI);
      dismissOverlay(this.overlayObjects);
      this.overlayObjects.length = 0;
      this.onNextRound();
    });
  }

  // ── Game over overlay ────────────────────────────────────

  /** Show the final winner overlay with Play Again / Menu actions. */
  showGameOverOverlay(result: RoundResult, winnerIndex: number): void {
    this.setPhase('game-over');
    this.playSound(SFX_SCORE);
    this.finalizeTranscript(winnerIndex);

    const { objects } = createOverlayBackground(
      this.scene,
      { depth: 199, alpha: 0.75 },
      { width: 620, height: 460, color: 0x0d1a21, alpha: 0.96, depth: 200 },
    );
    this.overlayObjects.push(...objects);

    const session = this.getSession();
    const centerX = GAME_W / 2;
    const boxY = GAME_H / 2;

    const winnerName = session.players[winnerIndex].name;
    const title = this.scene.add
      .text(centerX, boxY - 190, winnerIndex === 0 ? 'You Win!' : `${winnerName} Wins!`, {
        fontSize: '32px',
        color: winnerIndex === 0 ? '#ffdd66' : '#ff9966',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5)
      .setDepth(201);
    this.addToHud(title);
    this.overlayObjects.push(title);

    result.playerScores.forEach((_score, i) => {
      const y = boxY - 110 + i * 48;
      const player = session.players[i];
      const text = this.scene.add
        .text(centerX, y, `${player.name}: ${player.totalScore} pts`, {
          fontSize: '18px',
          color: i === winnerIndex ? '#ffdd66' : '#c8e8d8',
          fontFamily: FONT_FAMILY,
          fontStyle: i === winnerIndex ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(201);
      this.addToHud(text);
      this.overlayObjects.push(text);
    });

    const playAgain = createOverlayButton(this.scene, centerX - 120, boxY + 150, 'Play Again', 201, { fontSize: '18px' });
    this.addToHud(playAgain);
    this.overlayObjects.push(playAgain);
    playAgain.on('pointerdown', () => {
      this.playSound(SFX_UI);
      this.onGameOverAction('restart');
    });

    const menu = createOverlayButton(this.scene, centerX + 120, boxY + 150, 'Menu', 201, { fontSize: '18px' });
    this.addToHud(menu);
    this.overlayObjects.push(menu);
    menu.on('pointerdown', () => {
      this.playSound(SFX_UI);
      this.onGameOverAction('menu');
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Parent an object into the HUD container (if one exists). */
  private addToHud(obj: Phaser.GameObjects.GameObject): void {
    const hud = this.getHudContainer();
    if (hud) hud.add(obj);
  }
}