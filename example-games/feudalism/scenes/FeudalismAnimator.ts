/**
 * FeudalismAnimator — card movement and animation helpers.
 */
import Phaser from 'phaser';
import type { DevelopmentCard, PatronTile, Tier } from '../FeudalismCards';
import { resourceAbbrev, tierShortName } from '../FeudalismCards';
import type { FeudalismSession } from '../FeudalismGame';
import {
  PATRON_W, PATRON_H, PATRON_X,
  MARKET_CARD_W, MARKET_CARD_H, MARKET_CARD_GAP, MARKET_TIER_GAP,
  MARKET_Y, DECK_X, MARKET_X,
  PLAYER_AREA_X, PLAYER_AREA_Y,
  AI_AREA_X, AI_AREA_Y,
  RESOURCE_FILL, RESOURCE_LABEL_COLOR,
  MOVE_DURATION,
} from './FeudalismConstants';
import { moveGameObject } from '../../../src/ui';

export class FeudalismAnimator {
  /** When true, all animations are skipped. */
  reducedMotion = false;

  private scene: Phaser.Scene;
  private session: FeudalismSession;

  constructor(scene: Phaser.Scene, session: FeudalismSession) {
    this.scene = scene;
    this.session = session;
  }

  getMarketCardCenter(tier: Tier, col: number): { x: number; y: number } {
    const tiers: Tier[] = [3, 2, 1];
    const row = tiers.indexOf(tier);
    const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
    const x = MARKET_X + col * (MARKET_CARD_W + MARKET_CARD_GAP) + MARKET_CARD_W / 2;
    return { x, y };
  }

  getDeckCenter(tier: Tier): { x: number; y: number } {
    const tiers: Tier[] = [3, 2, 1];
    const row = tiers.indexOf(tier);
    const y = MARKET_Y + row * (MARKET_CARD_H + MARKET_TIER_GAP) + MARKET_CARD_H / 2;
    return { x: DECK_X, y };
  }

  getPlayerCardDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) {
      const row1Y = PLAYER_AREA_Y + 32;
      const SLOT_W = 38;
      const SLOT_H = 50;
      const SLOT_GAP = 8;
      const totalW = 5 * SLOT_W + 4 * SLOT_GAP;
      return { x: PLAYER_AREA_X + totalW / 2, y: row1Y + SLOT_H / 2 };
    }
    const row1Y = AI_AREA_Y + 32;
    const SLOT_W = 38;
    const SLOT_H = 50;
    const SLOT_GAP = 8;
    const totalW = 5 * SLOT_W + 4 * SLOT_GAP;
    return { x: AI_AREA_X - totalW / 2, y: row1Y + SLOT_H / 2 };
  }

  getPlayerReserveDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) {
      const row2Y = PLAYER_AREA_Y + 32 + 50 + 6;
      return { x: PLAYER_AREA_X + 150 + 40, y: row2Y + 26 - 2 };
    }
    const row2Y = AI_AREA_Y + 32 + 50 + 6;
    return { x: AI_AREA_X - 80, y: row2Y + 14 };
  }

  getPatronCenter(patronIndex: number): { x: number; y: number } {
    const y = MARKET_Y + patronIndex * (MARKET_CARD_H + MARKET_TIER_GAP) + PATRON_H / 2;
    return { x: PATRON_X + PATRON_W / 2, y };
  }

  getPlayerPatronDest(playerIndex: number): { x: number; y: number } {
    if (playerIndex === 0) return { x: PLAYER_AREA_X + 120, y: PLAYER_AREA_Y + 10 };
    return { x: AI_AREA_X - 120, y: AI_AREA_Y + 10 };
  }

  findCardMarketSlot(cardId: number): { tier: Tier; col: number } | null {
    for (const tier of [3, 2, 1] as Tier[]) {
      const visible = this.session.market[tier].visible;
      for (let col = 0; col < visible.length; col++) {
        if (visible[col]?.id === cardId) return { tier, col };
      }
    }
    return null;
  }

  playCardAnimation(
    sourcePos: { x: number; y: number },
    destPos: { x: number; y: number },
    card: DevelopmentCard,
    marketSlot: { tier: Tier; col: number } | null,
    patronVisits: PatronTile[],
    patronSourceIndex: number,
    playerIndex: number,
    onAllComplete: () => void,
    onRefreshMarket: () => void,
    onBeforePatronAnimation: () => void,
    onRefreshPatronsAndPlayer: () => void,
  ): void {
    const flyingCard = this.createFlyingCard(sourcePos.x, sourcePos.y, card);

    moveGameObject({
      scene: this.scene,
      target: flyingCard,
      destX: destPos.x,
      destY: destPos.y,
      duration: MOVE_DURATION,
      reducedMotion: this.reducedMotion,
      onComplete: () => {
        flyingCard.destroy();
        // Only animate the first patron; others are recorded but not individually animated
        const firstPatron = patronVisits.length > 0 ? patronVisits[0] : null;
        const chainFn = () => {
          this.chainPatronAnimation(firstPatron, patronSourceIndex, playerIndex, onAllComplete, onBeforePatronAnimation, onRefreshPatronsAndPlayer);
        };
        if (marketSlot) {
          this.playMarketRefillAnimation(marketSlot.tier, marketSlot.col, chainFn, onRefreshMarket);
        } else {
          chainFn();
        }
      },
    });
  }

  private playMarketRefillAnimation(tier: Tier, col: number, onComplete: () => void, onRefreshMarket: () => void): void {
    const slotCard = this.session.market[tier].visible[col];
    if (!slotCard) {
      onComplete();
      return;
    }
    const deckPos = this.getDeckCenter(tier);
    const slotPos = this.getMarketCardCenter(tier, col);
    const flyingBack = this.createFlyingDeckBack(deckPos.x, deckPos.y, tier);

    moveGameObject({
      scene: this.scene,
      target: flyingBack,
      destX: slotPos.x,
      destY: slotPos.y,
      duration: MOVE_DURATION * 0.7,
      reducedMotion: this.reducedMotion,
      onComplete: () => {
        flyingBack.destroy();
        onRefreshMarket();
        onComplete();
      },
    });
  }

  private chainPatronAnimation(
    patronVisit: PatronTile | null,
    patronSourceIndex: number,
    playerIndex: number,
    onComplete: () => void,
    onBeforePatronAnimation: () => void,
    onRefreshPatronsAndPlayer: () => void,
  ): void {
    if (!patronVisit || patronSourceIndex < 0) {
      onComplete();
      return;
    }

    // Remove the static patron tile from the Patrons section before the
    // flying patron appears, so there is only one visible patron during flight.
    onBeforePatronAnimation();

    const patronSource = this.getPatronCenter(patronSourceIndex);
    const patronDest = this.getPlayerPatronDest(playerIndex);
    const flyingPatron = this.createFlyingPatron(patronSource.x, patronSource.y, patronVisit);

    moveGameObject({
      scene: this.scene,
      target: flyingPatron,
      destX: patronDest.x,
      destY: patronDest.y,
      duration: MOVE_DURATION,
      reducedMotion: this.reducedMotion,
      onComplete: () => {
        flyingPatron.destroy();
        onRefreshPatronsAndPlayer();
        onComplete();
      },
    });
  }

  private createFlyingCard(cx: number, cy: number, card: DevelopmentCard): Phaser.GameObjects.Container {
    const container = this.scene.add.container(cx, cy).setDepth(15);
    const bonusFill = RESOURCE_FILL[card.bonus];

    const bg = this.scene.add.rectangle(0, 0, MARKET_CARD_W, MARKET_CARD_H, 0x1a1a1a);
    bg.setStrokeStyle(2, 0xffdd44);
    container.add(bg);

    const bonusBar = this.scene.add.rectangle(0, -MARKET_CARD_H / 2 + 12, MARKET_CARD_W - 4, 22, bonusFill);
    container.add(bonusBar);

    if (card.points > 0) {
      const pts = this.scene.add.text(-MARKET_CARD_W / 2 + 10, -MARKET_CARD_H / 2 + 26, `${card.points}`, {
        fontSize: '24px', fontStyle: 'bold', color: '#ffdd44', fontFamily: 'Arial',
      });
      container.add(pts);
    }

    const bonusLetter = this.scene.add.text(MARKET_CARD_W / 2 - 10, -MARKET_CARD_H / 2 + 26, resourceAbbrev(card.bonus), {
      fontSize: '16px', fontStyle: 'bold', color: RESOURCE_LABEL_COLOR[card.bonus], fontFamily: 'Arial',
    }).setOrigin(1, 0);
    container.add(bonusLetter);

    return container;
  }

  private createFlyingPatron(cx: number, cy: number, _patron: PatronTile): Phaser.GameObjects.Container {
    const container = this.scene.add.container(cx, cy).setDepth(15);
    const bg = this.scene.add.rectangle(0, 0, PATRON_W, PATRON_H, 0x6633aa, 0.9);
    bg.setStrokeStyle(2, 0xffdd44);
    container.add(bg);

    const pts = this.scene.add.text(0, -20, '3 pt', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffdd44', fontFamily: 'Arial',
    }).setOrigin(0.5);
    container.add(pts);

    const label = this.scene.add.text(0, 2, 'Patron', {
      fontSize: '13px', color: '#ccaaee', fontFamily: 'Arial',
    }).setOrigin(0.5);
    container.add(label);

    return container;
  }

  private createFlyingDeckBack(cx: number, cy: number, tier: Tier): Phaser.GameObjects.Container {
    const container = this.scene.add.container(cx, cy).setDepth(15);
    const deckW = 100;
    const deckH = MARKET_CARD_H - 16;
    const bg = this.scene.add.rectangle(0, 0, deckW, deckH, 0x334433, 0.8);
    bg.setStrokeStyle(1, 0x556655);
    container.add(bg);
    const text = this.scene.add.text(0, 0, `${tierShortName(tier)}`, {
      fontSize: '18px', fontStyle: 'bold', color: '#aaddaa', fontFamily: 'Arial',
    }).setOrigin(0.5);
    container.add(text);
    return container;
  }
}
