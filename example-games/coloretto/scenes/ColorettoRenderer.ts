/**
 * ColorettoRenderer — renders the Coloretto game board.
 *
 * Responsible for:
 *  - Row tableau rendering (cards, empty slots, click zones)
 *  - Deck rendering (back + count)
 *  - Per-player collection rendering (name/score chips, colour chips, jokers, bonuses)
 *  - Card-face creation (coloured, joker, bonus, Last Round)
 *  - Layout helpers (row/column positioning math)
 *  - Flight-card visual and flip animation helpers
 *
 * Follows the GolfRenderer/GolfAnimator split precedent: rendering stays
 * separate from the scene's orchestration. The scene passes display
 * containers and callbacks in the constructor; this module owns all board
 * visuals and the math that positions them.
 *
 * Module map (scene → helper):
 *   ColorettoRenderer      → rows, deck, collections, card faces, layout
 *   ColorettoInputHandler  → row click zones, mode buttons, ESC toggle
 */

import Phaser from 'phaser';
import type { ColorettoCard } from '../ColorettoCards';
import { colorLabel, colorHex } from '../ColorettoCards';
import type { ColorettoSession } from '../ColorettoGame';
import { getCurrentPlayerIndex, getRoundTurnOrder } from '../ColorettoGame';
import { FONT_FAMILY, moveGameObject } from '@ui';
import { computeColorettoLayout } from './ColorettoLayoutAdapter';
import {
  colorCounts,
  presentColors,
  countJokers,
  countBonusCards,
} from '../ColorettoScoring';

// ── Visual constants ───────────────────────────────────────

const CARD_W = 58;
const CARD_H = 78;
const ROW_GAP = 4;
const ROW_BUDGET = 360;
const ROW_STEP_MAX = 92;
const ROW_CARD_GAP = 10;
const CARD_SCALE_5P = 0.75;
const DECK_W = 58;
const DECK_H = 78;
const CHIP_W = 44;
const CHIP_H = 28;
const CHIP_GAP = 52;
const COLLECTION_STEP = 40;
const COLLECTION_STEP_4P = 36;
const COLLECTION_STEP_5P = 30;
const NAME_CHIP_GAP = 40;
const NAME_COLUMN_W = 210;
const TAKEN_COLUMN_W = 80;
const TAKE_ANIM_DURATION = 450;
const TAKE_ANIM_STAGGER = 90;
const PLACE_MOVE_DURATION = 450;
const FLIP_DURATION = 350;

const ROW_TOTAL_WIDTH = 3 * CARD_W + 2 * ROW_CARD_GAP;

// ── Public types ───────────────────────────────────────────

/** Parameters for the take animation. */
export interface TakeAnimationParams {
  playerIndex: number;
  rowIndex: number;
  takenCards: readonly ColorettoCard[];
  reducedMotion: boolean;
  onComplete: () => void;
}

/** Parameters for the place animation. */
export interface PlaceAnimationParams {
  action: { type: 'place'; rowIndex: number };
  drawnCard: ColorettoCard | undefined;
  reducedMotion: boolean;
  onComplete: () => void;
}

// ── Renderer class ─────────────────────────────────────────

export class ColorettoRenderer {
  private layout: ReturnType<typeof computeColorettoLayout>;
  private scene: Phaser.Scene;
  private session: ColorettoSession;
  private rowsContainer: Phaser.GameObjects.Container;
  private collectionsContainer: Phaser.GameObjects.Container;
  private deckContainer: Phaser.GameObjects.Container;
  private lastRoundContainer: Phaser.GameObjects.Container;
  private setPhase: (phase: string) => void;
  private getHudContainer: () => Phaser.GameObjects.Container | undefined;
  private _rowZones: Phaser.GameObjects.Rectangle[] = [];
  /** In-flight card visual during the place animation (null when idle). */
  flightCard: Phaser.GameObjects.Container | null = null;

  // UI text (set by the scene via setRoundText)
  private roundText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    session: ColorettoSession,
    rowsContainer: Phaser.GameObjects.Container,
    collectionsContainer: Phaser.GameObjects.Container,
    deckContainer: Phaser.GameObjects.Container,
    lastRoundContainer: Phaser.GameObjects.Container,
    setPhase: (phase: string) => void,
    getHudContainer: () => Phaser.GameObjects.Container | undefined,
  ) {
    this.scene = scene;
    this.session = session;
    this.rowsContainer = rowsContainer;
    this.collectionsContainer = collectionsContainer;
    this.deckContainer = deckContainer;
    this.lastRoundContainer = lastRoundContainer;
    this.setPhase = setPhase;
    this.getHudContainer = getHudContainer;
    this.layout = computeColorettoLayout();
  }

  // ── Header & UI text ─────────────────────────────────────

  /** Store the header text objects (round, turn, instruction). */
  setRoundText(
    roundText: Phaser.GameObjects.Text,
    turnText: Phaser.GameObjects.Text,
    instructionText: Phaser.GameObjects.Text,
  ): void {
    this.roundText = roundText;
    this.turnText = turnText;
    this.instructionText = instructionText;
  }

  /** Set the instruction text (e.g. validation error or mode hint). */
  setInstructionText(text: string): void {
    if (this.instructionText) this.instructionText.setText(text);
  }

  /** Re-render every board area (rows, deck, collections, last round). */
  refreshAll(): void {
    this.refreshRows();
    this.refreshDeck();
    this.refreshCollections();
    this.refreshLastRoundCard();
    this.refreshRoundInfo();
  }

  /** Refresh round + turn text from the current session state. */
  refreshRoundInfo(): void {
    if (!this.roundText) return;
    const round = this.session.currentRound + 1;
    this.roundText.setText(`Round ${round} of ${this.session.totalRounds}`);
    const currentIdx = getCurrentPlayerIndex(this.session);
    const lastRound = this.session.lastRoundTriggered ? ' \u2014 LAST ROUND!' : '';
    if (currentIdx >= 0) {
      const player = this.session.players[currentIdx];
      this.turnText.setText(`${player.name}'s turn${lastRound}`);
    } else {
      this.turnText.setText(`Round over${lastRound}`);
    }
  }

  // ── Layout helpers ───────────────────────────────────────

  private cardScale(): number {
    return this.session.players.length >= 5 ? CARD_SCALE_5P : 1;
  }

  private cardW(): number {
    return CARD_W * this.cardScale();
  }

  private cardH(): number {
    return CARD_H * this.cardScale();
  }

  private rowStep(): number {
    const rowCount = this.session.rows.length;
    const minStep = this.cardH() + ROW_GAP;
    return Math.max(minStep, Math.min(ROW_STEP_MAX, Math.floor(ROW_BUDGET / rowCount)));
  }

  rowCenterY(rowIndex: number): number {
    const rowCount = this.session.rows.length;
    const step = this.rowStep();
    return this.layout.rowsCenterY - ((rowCount - 1) * step) / 2 + rowIndex * step;
  }

  rowSlotX(slotIndex: number): number {
    return this.layout.rowsCenterX - ROW_TOTAL_WIDTH / 2 + slotIndex * (CARD_W + ROW_CARD_GAP);
  }

  private collectionStep(): number {
    const n = this.session.players.length;
    if (n >= 5) return COLLECTION_STEP_5P;
    if (n >= 4) return COLLECTION_STEP_4P;
    return COLLECTION_STEP;
  }

  collectionBlockHeight(): number {
    return (this.session.players.length - 1) * this.collectionStep() + CHIP_H;
  }

  collectionBlockTopY(): number {
    return this.layout.collectionsCenterY - this.collectionBlockHeight() / 2;
  }

  collectionBlockBottomY(): number {
    return this.collectionBlockTopY() + this.collectionBlockHeight();
  }

  fixedChipStartX(): number {
    return this.layout.collectionsTopX + NAME_COLUMN_W + TAKEN_COLUMN_W;
  }

  collectionRowY(row: number): number {
    const n = this.session.players.length;
    return (
      this.layout.collectionsCenterY -
      ((n - 1) * this.collectionStep()) / 2 +
      row * this.collectionStep()
    );
  }

  displayRowForPlayer(playerIndex: number): number {
    return getRoundTurnOrder(this.session).indexOf(playerIndex);
  }

  getLayout(): ReturnType<typeof computeColorettoLayout> {
    return this.layout;
  }

  // ── Card creation ────────────────────────────────────────

  createCard(
    x: number,
    y: number,
    card: ColorettoCard,
    scale = this.cardScale(),
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    container.add(this.createCardFace(card));
    if (scale !== 1) container.setScale(scale);
    return container;
  }

  createCardFace(card: ColorettoCard): Phaser.GameObjects.GameObject[] {
    if (card.type === 'last-round') {
      const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x555555);
      bg.setStrokeStyle(2, 0xcccccc);
      const text = this.scene.add
        .text(0, 0, 'LR', {
          fontSize: '22px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      return [bg, text];
    }

    if (card.type === 'joker') {
      const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x2e2a55);
      bg.setStrokeStyle(2, 0xbb88ff);
      const star = this.scene.add
        .text(0, -8, '\u2605', {
          fontSize: '28px',
          color: '#e8c1ff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      const name = this.scene.add
        .text(0, 22, 'Joker', {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      return [bg, star, name];
    }

    if (card.type === 'bonus') {
      const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x3d3a22);
      bg.setStrokeStyle(2, 0xffdd66);
      const plus = this.scene.add
        .text(0, -8, '+2', {
          fontSize: '26px',
          color: '#ffdd66',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      const name = this.scene.add
        .text(0, 22, 'Bonus', {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      return [bg, plus, name];
    }

    const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x1b2a33);
    bg.setStrokeStyle(1, 0x4a6a7a);
    const colorRect = this.scene.add.rectangle(0, -8, CARD_W - 8, CARD_H - 24, Phaser.Display.Color.HexStringToColor(colorHex(card.color)).color);
    const countText = this.scene.add
      .text(0, 14, `${card.count}\u00d7`, {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    const nameText = this.scene.add
      .text(0, 32, colorLabel(card.color), {
        fontSize: '10px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    return [bg, colorRect, countText, nameText];
  }

  // ── Row rendering ────────────────────────────────────────

  refreshRows(): void {
    this.rowsContainer.removeAll(true);
    this._rowZones = [];

    const rowCount = this.session.rows.length;

    for (let i = 0; i < rowCount; i++) {
      const row = this.session.rows[i];
      const rowY = this.rowCenterY(i);

      const cardSlots = 3;
      for (let slot = 0; slot < cardSlots; slot++) {
        const cardX = this.rowSlotX(slot);
        const card = row.cards[slot];
        if (card && card.type !== 'last-round') {
          this.rowsContainer.add(this.createCard(cardX, rowY, card));
        } else {
          this.rowsContainer.add(
            this.scene.add
              .rectangle(cardX, rowY, this.cardW(), this.cardH(), 0x22343c)
              .setStrokeStyle(1, 0x3a5560),
          );
        }
      }

      const zone = this.scene.add
        .rectangle(
          this.layout.rowsCenterX,
          rowY,
          ROW_TOTAL_WIDTH + 30,
          this.cardH() + 12,
          0xffffff,
          0.001,
        )
        .setInteractive({ useHandCursor: true });
      const hud = this.getHudContainer();
      if (hud) {
        hud.add(zone);
      }
      this._rowZones.push(zone);
    }
  }

  getRowZones(): Phaser.GameObjects.Rectangle[] {
    return this._rowZones;
  }

  /** The current row zones (public access for tests/tools). */
  get rowZones(): Phaser.GameObjects.Rectangle[] {
    return this._rowZones;
  }

  // ── Deck rendering ───────────────────────────────────────

  refreshDeck(): void {
    this.deckContainer.removeAll(true);

    if (this.session.deck.length > 0) {
      const back = this.scene.add.rectangle(this.layout.deckCenterX, this.layout.deckCenterY, DECK_W, DECK_H, 0x2c3e50);
      back.setStrokeStyle(2, 0x7f8c9d);
      this.deckContainer.add(back);
      const mark = this.scene.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY, '?', {
          fontSize: '30px',
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(mark);
      const countText = this.scene.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY + DECK_H / 2 + 14, `${this.session.deck.length} cards`, {
          fontSize: '14px',
          color: '#aacccc',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(countText);
    } else {
      const countText = this.scene.add
        .text(this.layout.deckCenterX, this.layout.deckCenterY, 'Deck empty', {
          fontSize: '14px',
          color: '#888888',
          fontFamily: FONT_FAMILY,
        })
        .setOrigin(0.5);
      this.deckContainer.add(countText);
    }
  }

  // ── Last Round card ──────────────────────────────────────

  refreshLastRoundCard(): void {
    this.lastRoundContainer.removeAll(true);
    if (this.session.phase !== 'playing' || !this.session.lastRoundTriggered) return;
    for (const row of this.session.rows) {
      const lr = row.cards.find((c) => c.type === 'last-round');
      if (lr) {
        this.lastRoundContainer.add(
          this.createCard(
            this.layout.lastRoundCenterX - CARD_W / 2,
            this.layout.lastRoundCenterY - CARD_H / 2,
            lr,
            1,
          ),
        );
        return;
      }
    }
  }

  // ── Collections rendering ────────────────────────────────

  refreshCollections(): void {
    this.collectionsContainer.removeAll(true);

    const order = getRoundTurnOrder(this.session);
    const currentIdx = getCurrentPlayerIndex(this.session);

    const chipStartX = this.fixedChipStartX();
    const nameEndX = this.layout.collectionsTopX + NAME_COLUMN_W - NAME_CHIP_GAP;
    const nameColumnW = NAME_COLUMN_W - NAME_CHIP_GAP;

    order.forEach((playerIndex, row) => {
      const player = this.session.players[playerIndex];
      const y = this.collectionRowY(row);
      const isCurrent = playerIndex === currentIdx && this.session.phase === 'playing';
      const isHuman = playerIndex === 0;

      const nameColor = isCurrent ? '#ffdd66' : isHuman ? '#ffffff' : '#b8d8c8';
      const label = `${player.name} \u2014 ${player.totalScore} pts`;
      const name = this.scene.add
        .text(nameEndX, y, label, {
          fontSize: '16px',
          color: nameColor,
          fontFamily: FONT_FAMILY,
          fontStyle: isCurrent ? 'bold' : 'normal',
        })
        .setOrigin(1, 0.5);
      this.collectionsContainer.add(name);
      if (name.width > nameColumnW) {
        name.setText(this.fitNameScoreLabel(label, nameColumnW, name));
      }

      const counts = colorCounts(player.collection);
      let chipX = chipStartX;
      for (const color of presentColors(counts)) {
        const chip = this.scene.add.rectangle(chipX, y, CHIP_W, CHIP_H, Phaser.Display.Color.HexStringToColor(colorHex(color)).color);
        this.collectionsContainer.add(chip);
        const countLabel = this.scene.add
          .text(chipX, y - 6, `${counts[color]}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(countLabel);
        const nameLabel = this.scene.add
          .text(chipX, y + 10, colorLabel(color), {
            fontSize: '9px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      const jokers = countJokers(player.collection);
      if (jokers > 0) {
        const chip = this.scene.add.rectangle(chipX, y, CHIP_W, CHIP_H, 0x2e2a55);
        chip.setStrokeStyle(2, 0xbb88ff);
        this.collectionsContainer.add(chip);
        const label = this.scene.add
          .text(chipX, y - 6, `${jokers}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        const nameLabel = this.scene.add
          .text(chipX, y + 10, 'Joker', {
            fontSize: '9px',
            color: '#e8c1ff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      const bonus = countBonusCards(player.collection);
      if (bonus > 0) {
        const chip = this.scene.add.rectangle(chipX, y, CHIP_W, CHIP_H, 0x3d3a22);
        chip.setStrokeStyle(2, 0xffdd66);
        this.collectionsContainer.add(chip);
        const label = this.scene.add
          .text(chipX, y - 6, `${bonus}`, {
            fontSize: '13px',
            color: '#ffffff',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(label);
        const nameLabel = this.scene.add
          .text(chipX, y + 10, '+2', {
            fontSize: '9px',
            color: '#ffdd66',
            fontFamily: FONT_FAMILY,
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0.5);
        this.collectionsContainer.add(nameLabel);
        chipX += CHIP_GAP;
      }

      if (player.roundState === 'taken-row' || player.roundState === 'final-turn-done') {
        const taken = this.scene.add
          .text(this.layout.collectionsTopX + NAME_COLUMN_W, y, 'Taken', {
            fontSize: '14px',
            color: '#ffdd66',
            fontFamily: FONT_FAMILY,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 2,
          })
          .setOrigin(0, 0.5);
        this.collectionsContainer.add(taken);
      }
    });
  }

  private fitNameScoreLabel(
    label: string,
    maxWidth: number,
    text: Phaser.GameObjects.Text,
  ): string {
    const sep = ' \u2014 ';
    const sepIndex = label.lastIndexOf(sep);
    if (sepIndex === -1) return label;
    const scorePart = label.slice(sepIndex);
    const namePart = label.slice(0, sepIndex);
    for (let len = namePart.length; len > 0; len--) {
      const candidate = `${namePart.slice(0, len)}\u2026${scorePart}`;
      text.setText(candidate);
      if (text.width <= maxWidth) return candidate;
    }
    text.setText(scorePart);
    return scorePart;
  }

  // ── Take animation ───────────────────────────────────────

  playTakeAnimation(params: TakeAnimationParams): void {
    const scene = this.scene as Phaser.Scene;
    if (params.reducedMotion || params.takenCards.length === 0) {
      params.onComplete();
      return;
    }

    this.setPhase('animating');

    const destStartX = this.fixedChipStartX();
    const destY = this.collectionRowY(this.displayRowForPlayer(params.playerIndex));

    const flyers = params.takenCards.map((card, i) =>
      this.createCard(this.rowSlotX(i), this.rowCenterY(params.rowIndex), card).setDepth(100),
    );

    this.refreshRows();

    let landed = 0;
    flyers.forEach((flyer, i) => {
      scene.time.delayedCall(i * TAKE_ANIM_STAGGER, () => {
        moveGameObject({
          scene,
          target: flyer,
          destX: destStartX + i * CHIP_GAP,
          destY,
          duration: TAKE_ANIM_DURATION,
          ease: 'Quad.easeInOut',
          onComplete: () => {
            landed += 1;
            if (landed === flyers.length) {
              for (const f of flyers) f.destroy();
              params.onComplete();
            }
          },
        });
      });
    });
  }

  // ── Place animation ──────────────────────────────────────

  animatePlace(params: PlaceAnimationParams): void {
    const scene = this.scene as Phaser.Scene;
    const drawnCard = params.drawnCard;

    if (params.reducedMotion || !drawnCard) {
      params.onComplete();
      return;
    }

    this.setPhase('animating');

    const flight = this.createFlightCard();
    flight.setPosition(this.layout.deckCenterX, this.layout.deckCenterY);
    this.flightCard = flight;

    if (drawnCard.type === 'last-round') {
      this.flipContainer(flight, () => this.createCardFace(drawnCard), () => {
        moveGameObject({
          scene,
          target: flight,
          destX: this.layout.lastRoundCenterX,
          destY: this.layout.lastRoundCenterY,
          duration: PLACE_MOVE_DURATION,
          onComplete: () => {
            flight.destroy();
            this.flightCard = null;
            params.onComplete();
          },
        });
      });
      return;
    }

    flight.setScale(this.cardScale());
    const slotIndex = this.session.rows[params.action.rowIndex].cards.length - 1;
    moveGameObject({
      scene,
      target: flight,
      destX: this.rowSlotX(slotIndex) + this.cardW() / 2,
      destY: this.rowCenterY(params.action.rowIndex) + this.cardH() / 2,
      duration: PLACE_MOVE_DURATION,
      onComplete: () => {
        this.flipContainer(flight, () => this.createCardFace(drawnCard), () => {
          flight.destroy();
          this.flightCard = null;
          params.onComplete();
        });
      },
    });
  }

  // ── Flight card & flip ───────────────────────────────────

  createFlightCard(): Phaser.GameObjects.Container {
    const flight = this.scene.add.container(0, 0);
    flight.setDepth(50);

    const inner = this.scene.add.container(-CARD_W / 2, -CARD_H / 2);
    flight.add(inner);

    const backBg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x2c3e50);
    backBg.setStrokeStyle(2, 0x7f8c9d);
    inner.add(backBg);

    const mark = this.scene.add
      .text(0, 0, '?', {
        fontSize: '30px',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5);
    inner.add(mark);

    return flight;
  }

  flipContainer(
    flight: Phaser.GameObjects.Container,
    createFace: () => Phaser.GameObjects.GameObject[],
    onComplete?: () => void,
  ): void {
    const scene = this.scene as Phaser.Scene;
    const inner = flight.getAt(0) as Phaser.GameObjects.Container;
    const half = FLIP_DURATION / 2;
    const finalScaleX = flight.scaleY;
    scene.tweens.add({
      targets: flight,
      scaleX: 0,
      duration: half,
      ease: 'Power2',
      onComplete: () => {
        inner.removeAll(true);
        inner.add(createFace());
        scene.tweens.add({
          targets: flight,
          scaleX: finalScaleX,
          duration: half,
          ease: 'Power2',
          onComplete: () => onComplete?.(),
        });
      },
    });
  }
}


