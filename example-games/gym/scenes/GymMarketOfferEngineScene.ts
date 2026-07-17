/**
 * GymMarketOfferEngineScene -- Demonstrates the MarketOfferEngine
 * generic market system with rows, slots, visibility, and purchase
 * processing.
 *
 * Features:
 *   - Two market rows with different configurations (4 slots / 3 slots)
 *   - Visual display showing occupied, empty, and locked slots
 *   - Interactive controls to purchase from slots, refill from a deck,
 *     and lock/unlock slots
 *   - PurchaseResult feedback (success vs failure with reason) in an
 *     event log
 *   - Reset to restore initial market state
 *
 * @module example-games/gym/scenes/GymMarketOfferEngineScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_MARKET_OFFER_ENGINE_KEY } from '../GymRegistry';

import {
  createMarketOfferEngine,
  type MarketOfferEngine,
  type PurchaseResult,
} from '../../../src/card-system/MarketOfferEngine';

import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

// ── Demo card type ──────────────────────────────────────────

/** A simple demo card with an id and display name. */
interface DemoCard {
  id: string;
  name: string;
}

// ── Layout constants ────────────────────────────────────────

/** X offset for the market area. */
const MARKET_X = 40;

/** Y offset for the first market row. */
const ROW1_Y = 100;

/** Y offset for the second market row. */
const ROW2_Y = 260;

/** Width of each slot card display. */
const SLOT_W = 150;

/** Height of each slot card display. */
const SLOT_H = 100;

/** Horizontal gap between slots. */
const SLOT_GAP = 12;

/** Y offset for the controls area. */
const CONTROLS_Y = 450;

/** Y offset for the event log. */
const LOG_Y = 500;

// ── Demo card factory ───────────────────────────────────────

/** Create a demo card with the given id and name suffix. */
function demoCard(id: string, name: string): DemoCard {
  return { id, name };
}

/** Row 1: "Standard Deals" — 4 slots, 4 initial cards. */
function standardDealsRowCards(): DemoCard[] {
  return [
    demoCard('s1', 'General Store'),
    demoCard('s2', 'Blacksmith'),
    demoCard('s3', 'Tailor'),
    demoCard('s4', 'Inn'),
  ];
}

/** Row 2: "Premium" — 3 slots, 2 initial cards (1 empty). */
function premiumRowCards(): DemoCard[] {
  return [
    demoCard('p1', 'Jewelry Shop'),
    demoCard('p2', 'Art Gallery'),
    // Slot 3 intentionally empty
  ];
}

/** Source deck cards for refill. */
function createSourceDeck(): DemoCard[] {
  return [
    demoCard('d1', 'Farm'),
    demoCard('d2', 'Mill'),
    demoCard('d3', 'Bakery'),
    demoCard('d4', 'Brewery'),
    demoCard('d5', 'Stable'),
    demoCard('d6', 'Sawmill'),
    demoCard('d7', 'Mine'),
    demoCard('d8', 'Market'),
  ];
}

/** Reset the source deck to its initial state (by index). */
const SOURCE_DECK_INDICES: DemoCard[] = [
  demoCard('d1', 'Farm'),
  demoCard('d2', 'Mill'),
  demoCard('d3', 'Bakery'),
  demoCard('d4', 'Brewery'),
  demoCard('d5', 'Stable'),
  demoCard('d6', 'Sawmill'),
  demoCard('d7', 'Mine'),
  demoCard('d8', 'Market'),
];

// ── Scene ───────────────────────────────────────────────────

export class GymMarketOfferEngineScene extends GymSceneBase {
  private market!: MarketOfferEngine<DemoCard>;
  private sourceDeck!: DemoCard[];
  private selectedRowId: string | null = null;
  private selectedSlotIndex: number | null = null;

  // Visual elements
  private rowLabels: Phaser.GameObjects.Text[] = [];
  private slotGraphics: Phaser.GameObjects.Graphics[] = [];
  private cardTexts: Phaser.GameObjects.Text[] = [];
  private lockIcons: Phaser.GameObjects.Text[] = [];
  private selectionHighlights: Phaser.GameObjects.Graphics[] = [];
  private statusText!: Phaser.GameObjects.Text;

  // Event log
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;

  constructor() {
    super({ key: GYM_MARKET_OFFER_ENGINE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Market Offer Engine');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the MarketOfferEngine — a generic market system with rows, slots, visibility, and purchase processing. The engine manages cards in a row-based market where each slot can be occupied, empty, or locked. This scene lets you interactively explore creating market configurations, managing slot states, and processing purchases.',
      },
      {
        heading: 'Market Rows',
        body: 'Two rows are demonstrated:\n• "Standard Deals" — 4 slots, all initially occupied\n• "Premium" — 3 slots, 2 initially occupied (1 empty)\nEach slot shows the card name when occupied, or "EMPTY"/"LOCKED" with the slot state.',
      },
      {
        heading: 'Controls',
        body: 'Click on any slot card to select it (highlighted border). Then use:\n[ Purchase Selected ] — Remove the card from the market (cannot purchase empty slots)\n[ Refill Row ] — Refill all empty unlocked slots in the selected row from the source deck\n[ Lock/Unlock ] — Toggle locked state on the selected slot (locked slots skip refill)\n[ Reset Market ] — Restore the initial market state and full source deck\n[ < Prev ] / [ Next > ] — Navigate to the previous or next Gym scene.',
      },
      {
        heading: 'Usage Example',
        body: 'In Main Street, the MarketOfferEngine manages the available businesses players can purchase. Each row represents a price tier, and slots are populated from the business deck. This Gym scene shows how to create, interact with, and reset such a market — useful for debugging market configurations or testing purchase logic in isolation.',
      },
      {
        heading: 'Test Plan',
        body: '1. Scene boots without errors → header, row labels displayed\n2. Click a card slot → selection highlight appears\n3. Click [ Purchase Selected ] → card removed, event log shows PurchaseResult\n4. Click empty slot, then [ Purchase Selected ] → error logged\n5. Click [ Refill Row ] → empty slots repopulated from source deck\n6. Lock a slot via [ Lock/Unlock ], refill → locked slot stays empty\n7. Click [ Reset Market ] → initial state restored with all original cards\n8. Navigation buttons work (Prev/Next)',
      },
    ]);

    // ── Initialize market ──────────────────────────────────
    this.market = createMarketOfferEngine<DemoCard>([
      { id: 'standard', slots: 4, cards: standardDealsRowCards() },
      { id: 'premium', slots: 3, cards: premiumRowCards() },
    ]);

    this.sourceDeck = [...createSourceDeck()];

    // ── Render market ──────────────────────────────────────
    this.renderMarket();

    // ── Controls ───────────────────────────────────────────
    const cx = GAME_W / 2;

    this.addButton(cx - 340, CONTROLS_Y, '[ Purchase Selected ]', () =>
      this.purchaseSelected(),
    );
    this.addButton(cx - 140, CONTROLS_Y, '[ Refill Row ]', () =>
      this.refillSelectedRow(),
    );
    this.addButton(cx + 60, CONTROLS_Y, '[ Lock/Unlock ]', () =>
      this.toggleLock(),
    );
    this.addButton(cx + 260, CONTROLS_Y, '[ Reset Market ]', () =>
      this.resetMarket(),
    );

    // ── Status text ────────────────────────────────────────
    this.statusText = createHudText(
      this,
      cx,
      CONTROLS_Y + 35,
      'Click a slot to select it',
      '#aaccaa',
      { fontSize: '13px' },
    ).setOrigin(0.5);

    // ── Event log ──────────────────────────────────────────
    this.eventLogResult = createEventLog(this, LOG_Y, {
      headerText: '── Event Log ──',
      maxLines: 10,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });
  }

  // ── Rendering ─────────────────────────────────────────────

  /**
   * Render the full market state, destroying any previous visuals.
   */
  private renderMarket(): void {
    this.destroyMarketVisuals();

    const rows = this.market.getRows();
    const rowYPositions = [ROW1_Y, ROW2_Y];

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const yBase = rowYPositions[ri] ?? ROW1_Y + ri * 160;
      const rowLabel = row.id === 'standard' ? 'Standard Deals' : 'Premium';

      // Row label
      const label = createHudText(
        this,
        MARKET_X,
        yBase - 20,
        `── ${rowLabel} (${row.id}) ──`,
        '#88ff88',
        { fontSize: '14px' },
      );
      this.rowLabels.push(label);

      // Slot count label
      const countLabel = createHudText(
        this,
        MARKET_X + 320,
        yBase - 20,
        `Cards: ${this.market.countCards(row.id)}/${row.slots.length}`,
        '#88aa88',
        { fontSize: '12px' },
      );
      this.rowLabels.push(countLabel);

      for (let si = 0; si < row.slots.length; si++) {
        const slot = row.slots[si];
        const x = MARKET_X + si * (SLOT_W + SLOT_GAP);
        const y = yBase;

        // Slot background
        const gfx = this.add.graphics();
        const bgColor = slot.locked ? 0x663333 : 0x2a3a2a;
        gfx.fillStyle(bgColor, 1);
        gfx.lineStyle(2, slot.locked ? 0x884444 : 0x448844, 1);
        gfx.fillRoundedRect(x, y, SLOT_W, SLOT_H, 6);
        gfx.strokeRoundedRect(x, y, SLOT_W, SLOT_H, 6);
        this.slotGraphics.push(gfx);

        // Card content / state text
        let displayText: string;
        let textColor: string;

        if (slot.card) {
          displayText = slot.card.name;
          textColor = '#ffffff';
        } else if (slot.locked) {
          displayText = 'LOCKED';
          textColor = '#ff6666';
        } else {
          displayText = 'EMPTY';
          textColor = '#888888';
        }

        const txt = createHudText(this, x + SLOT_W / 2, y + SLOT_H / 2, displayText, textColor, {
          fontSize: '14px',
        }).setOrigin(0.5);
        this.cardTexts.push(txt);

        // Lock icon indicator
        if (slot.locked) {
          const lockIcon = createHudText(
            this,
            x + SLOT_W - 12,
            y + 12,
            '🔒',
            '#ff6666',
            { fontSize: '14px' },
          ).setOrigin(1, 0);
          this.lockIcons.push(lockIcon);
        }

        // Interactive click zone — each slot is clickable
        const hitZone = this.add
          .zone(x, y, SLOT_W, SLOT_H)
          .setOrigin(0)
          .setInteractive({ useHandCursor: true });

        const rowId = row.id;
        const slotIndex = si;

        hitZone.on('pointerdown', () => {
          this.selectSlot(rowId, slotIndex);
        });

        // Selection highlight (hidden initially)
        const hl = this.add.graphics();
        hl.lineStyle(3, 0x88ff88, 1);
        hl.strokeRoundedRect(x - 2, y - 2, SLOT_W + 4, SLOT_H + 4, 8);
        hl.setVisible(false);
        this.selectionHighlights.push(hl);
      }
    }

    this.updateStatusText();
  }

  /**
   * Destroy all market visual elements.
   */
  private destroyMarketVisuals(): void {
    for (const obj of [...this.rowLabels, ...this.cardTexts, ...this.lockIcons]) {
      try { obj.destroy(); } catch (_) { /* ignore */ }
    }
    for (const gfx of [...this.slotGraphics, ...this.selectionHighlights]) {
      try { gfx.destroy(); } catch (_) { /* ignore */ }
    }
    this.rowLabels = [];
    this.slotGraphics = [];
    this.cardTexts = [];
    this.lockIcons = [];
    this.selectionHighlights = [];
  }

  // ── Selection ─────────────────────────────────────────────

  /**
   * Select a slot and update the visual highlight.
   */
  private selectSlot(rowId: string, slotIndex: number): void {
    // Clear previous highlights
    for (const hl of this.selectionHighlights) {
      hl.setVisible(false);
    }

    this.selectedRowId = rowId;
    this.selectedSlotIndex = slotIndex;

    // Find the row's slot count to compute highlight index
    const rows = this.market.getRows();
    let globalIndex = 0;
    for (const row of rows) {
      if (row.id === rowId) {
        globalIndex += slotIndex;
        break;
      }
      globalIndex += row.slots.length;
    }

    // Account for the count label text objects between rows
    // Row 1: label + countLabel = 2 text objects before the slots
    // Then 4 slot texts. The highlight order matches the slot order.
    // Actually, let's compute it based on the row and slot index.
    let highlightIdx = 0;
    for (const row of rows) {
      if (row.id === rowId) {
        highlightIdx += slotIndex;
        break;
      }
      highlightIdx += row.slots.length;
    }

    const hl = this.selectionHighlights[highlightIdx];
    if (hl) {
      hl.setVisible(true);
    }

    // Determine the slot label for display
    const slot = this.market.getRow(rowId)?.slots[slotIndex];
    const cardName = slot?.card?.name ?? (slot?.locked ? 'LOCKED' : 'EMPTY');
    this.statusText.setText(`Selected: ${rowId}[${slotIndex}] = ${cardName}`);
  }

  /**
   * Update the status text to reflect current selection or state.
   */
  private updateStatusText(): void {
    if (this.selectedRowId !== null && this.selectedSlotIndex !== null) {
      const slot = this.market.getRow(this.selectedRowId)?.slots[this.selectedSlotIndex];
      const cardName = slot?.card?.name ?? (slot?.locked ? 'LOCKED' : 'EMPTY');
      try {
        this.statusText.setText(
          `Selected: ${this.selectedRowId}[${this.selectedSlotIndex}] = ${cardName}`,
        );
      } catch (_) { /* ignore */ }
    } else {
      try {
        this.statusText.setText('Click a slot to select it');
      } catch (_) { /* ignore */ }
    }
  }

  // ── Actions ───────────────────────────────────────────────

  /**
   * Purchase the card in the currently selected slot.
   */
  private purchaseSelected(): void {
    if (this.selectedRowId === null || this.selectedSlotIndex === null) {
      this.logEvent('Error: No slot selected. Click a slot first.');
      return;
    }

    const row = this.market.getRow(this.selectedRowId);
    if (!row) {
      this.logEvent(`Error: Row '${this.selectedRowId}' not found.`);
      return;
    }

    const slot = row.slots[this.selectedSlotIndex];
    if (!slot) {
      this.logEvent(`Error: Invalid slot index ${this.selectedSlotIndex}.`);
      return;
    }

    if (slot.card === null) {
      this.logEvent(
        `Purchase failed: slot ${this.selectedSlotIndex} in '${this.selectedRowId}' is empty.`,
      );
      return;
    }

    if (slot.locked) {
      this.logEvent(
        `Purchase failed: slot ${this.selectedSlotIndex} in '${this.selectedRowId}' is locked.`,
      );
      return;
    }

    try {
      const card = this.market.removeCard(this.selectedRowId, this.selectedSlotIndex);
      const result: PurchaseResult<DemoCard> = {
        card,
        slotIndex: this.selectedSlotIndex,
        rowId: this.selectedRowId,
      };
      this.logEvent(
        `Purchased: ${result.card.name} from ${result.rowId}[${result.slotIndex}]`,
      );
      this.reRenderMarket();
    } catch (e) {
      this.logEvent(`Purchase error: ${(e as Error).message}`);
    }
  }

  /**
   * Refill empty unlocked slots in the selected slot's row.
   */
  private refillSelectedRow(): void {
    if (this.selectedRowId === null) {
      this.logEvent('Error: Select a slot first to identify which row to refill.');
      return;
    }

    if (this.sourceDeck.length === 0) {
      this.logEvent('Refill failed: Source deck is empty. Use [ Reset Market ] to replenish.');
      return;
    }

    const refilled = this.market.refillRow(this.selectedRowId, this.sourceDeck);

    if (refilled > 0) {
      this.logEvent(`Refilled ${refilled} slot(s) in '${this.selectedRowId}' from source deck.`);
    } else {
      const row = this.market.getRow(this.selectedRowId);
      const emptySlots = row ? this.market.getEmptySlots(this.selectedRowId) : [];
      const lockedEmptyCount = row
        ? row.slots.filter((s) => s.card === null && s.locked).length
        : 0;

      if (emptySlots.length > 0 && lockedEmptyCount > 0) {
        this.logEvent(
          `Refill: ${emptySlots.length} empty slot(s) in '${this.selectedRowId}' are locked. Unlock first.`,
        );
      } else {
        this.logEvent(`Refill: No empty slots in '${this.selectedRowId}'.`);
      }
    }

    this.reRenderMarket();
  }

  /**
   * Toggle locked state on the selected slot.
   */
  private toggleLock(): void {
    if (this.selectedRowId === null || this.selectedSlotIndex === null) {
      this.logEvent('Error: No slot selected. Click a slot first.');
      return;
    }

    const currentlyLocked = this.market.isSlotLocked(
      this.selectedRowId,
      this.selectedSlotIndex,
    );

    if (currentlyLocked) {
      this.market.unlockSlot(this.selectedRowId, this.selectedSlotIndex);
      this.logEvent(
        `Unlocked slot ${this.selectedSlotIndex} in '${this.selectedRowId}'.`,
      );
    } else {
      this.market.lockSlot(this.selectedRowId, this.selectedSlotIndex);
      this.logEvent(
        `Locked slot ${this.selectedSlotIndex} in '${this.selectedRowId}'.`,
      );
    }

    this.reRenderMarket();
  }

  /**
   * Reset the market and source deck to their initial states.
   */
  private resetMarket(): void {
    this.market = createMarketOfferEngine<DemoCard>([
      { id: 'standard', slots: 4, cards: standardDealsRowCards() },
      { id: 'premium', slots: 3, cards: premiumRowCards() },
    ]);

    this.sourceDeck = [...SOURCE_DECK_INDICES];
    this.selectedRowId = null;
    this.selectedSlotIndex = null;

    this.reRenderMarket();
    this.logEvent('Market reset to initial state.');
  }

  // ── Re-render helper ──────────────────────────────────────

  /**
   * Destroy and recreate all market visuals.
   * Preserves the event log and controls.
   */
  private reRenderMarket(): void {
    this.renderMarket();
  }

  // ── Event log ─────────────────────────────────────────────

  /**
   * Add a message to the event log and update the display.
   */
  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 20) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}
