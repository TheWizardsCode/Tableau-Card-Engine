/**
 * GymCardIndexScene -- Browsable index of the complete Main Street card pool.
 *
 * Two grouping views, toggled at runtime:
 *
 * - **By Type** — one group per card family (business, community-space, event,
 *   upgrade, staff); every card belongs to exactly one group.
 * - **By Synergy** — one group per synergy type (Food, Culture, Commerce,
 *   Service, Entertainment, Health) plus an `Unsynergised` catch-all. Cards
 *   whose `synergyTypes` list more than one type appear in **each** matching
 *   group, so group membership sums to more than the card count.
 *
 * The card list is filterable with a case-insensitive substring search over
 * the card name and id (keyboard: type to search, `Backspace` to delete,
 * `Esc` to clear, or press `[ Clear ]`).
 *
 * - **Hover** a card → player-facing tooltip, built with the same
 *   `buildCardTooltipInfo` formatter Main Street uses and shown through the
 *   shared `TooltipManager`.
 * - **Click** a card → scrollable detail dialog (`createOverlayDialog`) that
 *   lists every field of the card template — a strict superset of the
 *   player-facing tooltip, which is included verbatim at the foot of the sheet.
 *
 * All grouping/filtering/formatting logic lives in `../GymCardIndex` as pure
 * functions so it can be unit-tested without a browser; this scene is a thin
 * rendering layer over them.
 *
 * ## Audio exemption
 *
 * This scene intentionally plays no SFX: it is a reference/tooling scene whose
 * interactions (hover tooltip, click dialog, typing, scrolling) are plain
 * state changes — none wrap the core-engine animation/feedback helpers
 * (dealCard/discardCard/flipCard/moveGameObject/...), so the
 * every-action-audio rule does not apply (documented exception; see
 * AGENTS.md best practice #8).
 *
 * Layout is declarative via the Screen Layout Language (SLL) — zone anchors
 * come from `layouts/gym-card-index.layout.json`.
 *
 * @module example-games/gym/scenes/GymCardIndexScene
 */

import Phaser from 'phaser';

import { GymSceneBase } from '@core-gym/scenes/GymSceneBase';
import { GAME_W } from '@ui/constants';
import { createHudText } from '@ui/Renderer';
import { anchorPoint } from '@ui/screen-layout';
import {
  parseScreenLayoutDocument,
  type PixelPoint,
  type ScreenLayoutDocument,
} from '@ui/screen-layout-schema';
import { TooltipManager } from '@ui/Tooltip';
import { createOverlayDialog, type OverlayDialogHandle } from '@ui/Overlay';
import { getTooltips } from '@ui/SettingsStore';
import {
  buildCardIndex,
  buildCardTooltip,
  cardFamilyLabel,
  cardSynergyTypes,
  filterCards,
  formatCardDetailLines,
  groupByFamily,
  groupBySynergy,
  type CardGroup,
  type CardIndexEntry,
} from './GymCardIndex';
import gymCardIndexLayoutJson from '@core-gym/layouts/gym-card-index.layout.json';
import {
  CARD_INDEX_BG_COLOR,
  CARD_INDEX_DIALOG_HEIGHT,
  CARD_INDEX_DIALOG_LINE_HEIGHT,
  CARD_INDEX_DIALOG_WIDTH,
  CARD_INDEX_EMPTY_COLOR,
  CARD_INDEX_FILTER_FONT_SIZE,
  CARD_INDEX_GROUP_GAP,
  CARD_INDEX_GROUP_HEADER_COLOR,
  CARD_INDEX_GROUP_HEADER_FONT_SIZE,
  CARD_INDEX_LIST_MARGIN_BOTTOM,
  CARD_INDEX_LIST_MARGIN_RIGHT,
  CARD_INDEX_LIST_MARGIN_X,
  CARD_INDEX_META_COLOR,
  CARD_INDEX_META_FONT_SIZE,
  CARD_INDEX_MODE_ACTIVE_COLOR,
  CARD_INDEX_MODE_BUTTON_GAP,
  CARD_INDEX_MODE_INACTIVE_COLOR,
  CARD_INDEX_QUERY_FONT_SIZE,
  CARD_INDEX_ROW_COLOR,
  CARD_INDEX_ROW_FONT_SIZE,
  CARD_INDEX_ROW_HOVER_COLOR,
  CARD_INDEX_ROW_LINE_HEIGHT,
  CARD_INDEX_SCROLL_STEP,
  CARD_INDEX_STATUS_FONT_SIZE,
  DEFAULT_VIEWPORT,
} from '@core-gym/scenes/GymConstants';

// Parse the scene layout once at module load.
const CARD_INDEX_LAYOUT: ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymCardIndexLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

/** Resolve an SLL anchor, falling back to the screen centre. */
function resolveAnchor(zone: string, anchor: string): PixelPoint {
  if (!CARD_INDEX_LAYOUT) return { x: GAME_W / 2, y: 60 };
  return anchorPoint(CARD_INDEX_LAYOUT, zone, anchor, DEFAULT_VIEWPORT, 1);
}

/** The two grouping strategies offered by the scene. */
export type CardIndexGroupMode = 'family' | 'synergy';

/** Human-readable label for a grouping mode. */
export function groupModeLabel(mode: CardIndexGroupMode): string {
  return mode === 'family' ? 'By Type' : 'By Synergy';
}

/**
 * Builds the muted right-hand metadata line for an index row:
 * `T<tier> · <family> · <synergies or —>`.
 */
export function formatRowMeta(entry: CardIndexEntry): string {
  const synergies = cardSynergyTypes(entry.card);
  return `T${entry.tier} · ${cardFamilyLabel(entry.family)} · ${
    synergies.length > 0 ? synergies.join('/') : '—'
  }`;
}

/** Scene key for this Main Street-owned Gym-style card index demo. */
export const GYM_CARD_INDEX_KEY = 'GymCardIndexScene';

export class GymCardIndexScene extends GymSceneBase {
  /** The full (unfiltered) card index. */
  private indexEntries: CardIndexEntry[] = [];

  /** Current search query. */
  private filterText = '';

  /** Current grouping strategy. */
  private groupMode: CardIndexGroupMode = 'family';

  /** Scroll offset (px) of the card list. */
  private scrollY = 0;

  // ── UI handles ──────────────────────────────────────────
  private queryText!: Phaser.GameObjects.Text;
  private modeFamilyText!: Phaser.GameObjects.Text;
  private modeSynergyText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private listContainer!: Phaser.GameObjects.Container;
  private listMask!: Phaser.GameObjects.Graphics;
  private tooltipManager!: TooltipManager;

  /** Bounds of the scrollable list region (used for wheel hit-testing). */
  private listBounds = { x: 0, y: 0, width: 0, height: 0 };

  /** Open card detail dialog, or `null` when none is open. */
  private detailDialog: OverlayDialogHandle | null = null;

  /** Idempotency guard for {@link cleanup}. */
  private cleanedUp = false;

  constructor() {
    super({ key: GYM_CARD_INDEX_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CARD_INDEX_BG_COLOR);
    this.initHeader('Card Type Index & Synergy Groups');
    this.addDivider();
    this.initReducedMotion();

    this.cleanedUp = false;
    this.indexEntries = buildCardIndex();
    this.tooltipManager = new TooltipManager(this);

    this.initHelp([
      {
        heading: 'Features',
        body:
          'An index of every Main Street card template, read live from the game\'s card data ' +
          `(${this.indexEntries.length} cards across 5 families).\n\n` +
          'By Type — groups cards by card family (Business, Community Space, Event, Upgrade, Staff). ' +
          'Each card appears in exactly one group.\n\n' +
          'By Synergy — groups cards by synergy type (Food, Culture, Commerce, Service, Entertainment, ' +
          'Health) plus an Unsynergised catch-all. Cards that synergise with more than one type appear in ' +
          'every matching group, so the per-group counts sum to more than the card count.',
      },
      {
        heading: 'Controls',
        body:
          '[ By Type ] / [ By Synergy ]: switch the grouping view.\n' +
          '[ Clear ]: clear the search filter.\n' +
          'Type any text to filter: matches are case-insensitive substrings of the card name or id ' +
          '(Backspace deletes a character, Esc clears).\n' +
          'Mouse wheel over the list: scroll the index.\n' +
          'Hover a card: show its player-facing tooltip.\n' +
          'Click a card: open the detail dialog listing every raw data field for that card.',
      },
      {
        heading: 'Usage Example',
        body:
          'The "By Synergy" view answers balance questions the game itself cannot: it shows at a glance ' +
          'how many businesses feed each synergy type, and where a card contributes to two economies ' +
          '(the same card listing under Food *and* Culture). The detail dialog is the raw-data view for ' +
          'engine work — it shows fields the player never sees (upgrade paths, synergy rates, runtime ' +
          'income caches, specialization skill ids) alongside the player-facing tooltip for comparison.',
      },
      {
        heading: 'Test Plan',
        body:
          'Unit tests (tests/gym/GymCardIndex.test.ts) cover index construction, filtering, both grouping ' +
          'strategies (including multi-synergy membership and the unsynergised catch-all) and the detail ' +
          'sheet. A browser test (tests/gym/GymCardIndexScene.browser.test.ts) boots the scene, toggles ' +
          'both grouping modes, applies a filter and opens the detail dialog.',
      },
    ]);

    this.createFilterRow();
    this.createModeRow();
    this.createListRegion();

    // Phaser emits the `shutdown`/`destroy` scene events but does NOT call a
    // scene `shutdown()` method, so listeners (not an override) are the
    // reliable cleanup hook.
    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());

    // Typing drives the search filter (Backspace deletes, Esc clears).
    this.input.keyboard?.on('keydown', this.handleKeyDown);

    this.renderIndex();
  }

  // ── Filter row ──────────────────────────────────────────

  private createFilterRow(): void {
    const label = resolveAnchor('filter', 'label');
    const query = resolveAnchor('filter', 'query');

    this.addLabel(
      label.x,
      label.y,
      'Filter (name or id):',
      { fontSize: CARD_INDEX_FILTER_FONT_SIZE },
    ).setOrigin(0, 0.5);

    this.queryText = createHudText(
      this,
      query.x,
      query.y,
      this.renderedQuery(),
      '#ffffff',
      { fontSize: CARD_INDEX_QUERY_FONT_SIZE },
    ).setOrigin(0, 0.5);

    this.initButtonBar(label.y);
    this.buttonBar!.addButton('[ Clear ]', () => this.setFilter(''), {
      zone: 'right',
    });
  }

  /** The filter text as rendered, with a caret so typing is discoverable. */
  private renderedQuery(): string {
    return `[ ${this.filterText}▌ ]`;
  }

  // ── Grouping-mode row ───────────────────────────────────

  private createModeRow(): void {
    const left = resolveAnchor('mode', 'left');

    this.modeFamilyText = this.addLabel(
      left.x,
      left.y,
      '[ By Type ]',
      { fontSize: CARD_INDEX_GROUP_HEADER_FONT_SIZE },
    ).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.modeFamilyText.on('pointerdown', () => this.setGroupMode('family'));

    this.modeSynergyText = this.addLabel(
      left.x + CARD_INDEX_MODE_BUTTON_GAP,
      left.y,
      '[ By Synergy ]',
      { fontSize: CARD_INDEX_GROUP_HEADER_FONT_SIZE },
    ).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.modeSynergyText.on('pointerdown', () => this.setGroupMode('synergy'));

    this.statusText = createHudText(
      this,
      GAME_W - CARD_INDEX_LIST_MARGIN_X,
      left.y,
      '',
      CARD_INDEX_META_COLOR,
      { fontSize: CARD_INDEX_STATUS_FONT_SIZE },
    ).setOrigin(1, 0.5);
  }

  // ── Scrollable list region ──────────────────────────────

  private createListRegion(): void {
    const top = resolveAnchor('list', 'top');
    const bottom = resolveAnchor('list', 'bottom');

    const x = top.x;
    const y = top.y;
    const width = GAME_W - x - CARD_INDEX_LIST_MARGIN_X;
    const height = bottom.y - y - CARD_INDEX_LIST_MARGIN_BOTTOM;

    this.listBounds = { x, y, width, height };

    // Panel border so the scroll region is visually delimited.
    const border = this.add.graphics();
    border.lineStyle(1, 0x335577, 0.8);
    border.strokeRect(x, y, width, height);

    this.listContainer = this.add.container(x, y);

    // Invisible geometry mask for the scroll region.
    this.listMask = this.add.graphics();
    this.listMask.fillStyle(0xffffff);
    this.listMask.fillRect(x, y, width, height);
    this.listMask.setVisible(false);

    // Wheel scrolling, bounds-checked to the list region.
    this.input.on('wheel', this.handleWheel);
  }

  /** Wheel handler: scroll the list when the pointer is inside it. */
  private handleWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: unknown[],
    _dx: number,
    dy: number,
  ): void => {
    // While the detail dialog owns the screen its own wheel handler scrolls
    // the dialog; do not also scroll the index underneath.
    if (this.detailDialog) return;

    const b = this.listBounds;
    if (
      pointer.x < b.x || pointer.x > b.x + b.width ||
      pointer.y < b.y || pointer.y > b.y + b.height
    ) {
      return;
    }

    const maxScroll = this.maxScroll();
    const next = Phaser.Math.Clamp(
      this.scrollY + dy * CARD_INDEX_SCROLL_STEP,
      0,
      maxScroll,
    );
    if (next !== this.scrollY) {
      this.scrollY = next;
      this.applyScroll();
    }
  };

  /** Total scrollable overflow for the current content (0 when it fits). */
  private maxScroll(): number {
    return Math.max(0, this.contentHeight - this.listBounds.height);
  }

  /** Height of the rendered list content (set by `renderIndex`). */
  private contentHeight = 0;

  /** Repositions the list container and (un)applies the scroll mask. */
  private applyScroll(): void {
    this.listContainer.y = this.listBounds.y - this.scrollY;

    if (this.maxScroll() > 0) {
      this.listContainer.setMask(this.listMask.createGeometryMask());
    } else {
      this.listContainer.clearMask();
      this.listContainer.y = this.listBounds.y;
    }
  }

  // ── Public API (also used by tests) ─────────────────────

  /** Current search query. */
  getFilter(): string {
    return this.filterText;
  }

  /** Current grouping mode. */
  getGroupMode(): CardIndexGroupMode {
    return this.groupMode;
  }

  /** Entries currently passing the filter, in index order. */
  getVisibleEntries(): CardIndexEntry[] {
    return filterCards(this.indexEntries, this.filterText);
  }

  /** Groups currently rendered, for the active mode and filter. */
  getGroups(): CardGroup[] {
    const visible = this.getVisibleEntries();
    return this.groupMode === 'family'
      ? groupByFamily(visible)
      : groupBySynergy(visible);
  }

  /** Whether a card detail dialog is currently open. */
  hasDetailDialogOpen(): boolean {
    return this.detailDialog !== null;
  }

  /**
   * The scrollable list region in scene coordinates.
   *
   * Scenes place the list at an SLL `list` anchor; exposing the resolved
   * bounds lets callers (and layout tests) verify the region fits the viewport
   * and sits below the filter/mode rows.
   */
  getListBounds(): { x: number; y: number; width: number; height: number } {
    return { ...this.listBounds };
  }

  /** Total scrollable overflow of the rendered list (0 when it fits). */
  getMaxScroll(): number {
    return this.maxScroll();
  }

  /**
   * Sets the search query and re-renders the index.
   *
   * Called by the keyboard handler and the `[ Clear ]` button; exposed so
   * tests can drive filtering without synthesising key events.
   */
  setFilter(text: string): void {
    this.filterText = text;
    this.scrollY = 0;
    this.renderIndex();
  }

  /** Sets the grouping mode and re-renders the index. */
  setGroupMode(mode: CardIndexGroupMode): void {
    if (this.groupMode === mode) return;
    this.groupMode = mode;
    this.scrollY = 0;
    this.renderIndex();
  }

  // ── Keyboard filter input ───────────────────────────────

  /**
   * Captures printable keystrokes into the filter query.
   *
   * Registered on the scene's keyboard plugin in `create()` and removed in
   * `cleanup()`. Typing in the detail dialog or while a modifier is held is
   * ignored so the index does not swallow dialog/shortcut input.
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.detailDialog) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Backspace') {
      this.setFilter(this.filterText.slice(0, -1));
      return;
    }
    if (event.key === 'Escape') {
      this.setFilter('');
      return;
    }
    if (event.key.length === 1) {
      this.setFilter(this.filterText + event.key);
    }
  };

  // ── Rendering ───────────────────────────────────────────

  /** Destroys and rebuilds the list content for the current mode + filter. */
  renderIndex(): void {
    this.listContainer.removeAll(true);

    const visible = this.getVisibleEntries();
    const groups = this.getGroups();

    const pos = { y: 0 };

    if (visible.length === 0) {
      this.appendEmptyMessage(pos);
    } else {
      // Family view keeps every family group (even empty ones) so the shape is
      // stable; synergy view hides empty groups so the multi-membership is not
      // buried under five empty headers.
      const rendered =
        this.groupMode === 'family'
          ? groups
          : groups.filter((g) => g.entries.length > 0);
      for (const group of rendered) {
        this.appendGroup(group, pos);
      }
    }

    this.contentHeight = pos.y + CARD_INDEX_LIST_MARGIN_BOTTOM;
    this.applyScroll();
    this.updateStatus(visible.length);
    this.updateModeButtons();
  }

  /** Appends the "no matches" message. */
  private appendEmptyMessage(pos: { y: number }): void {
    const text = this.add.text(
      CARD_INDEX_LIST_MARGIN_X,
      pos.y + CARD_INDEX_GROUP_GAP,
      `No cards match "${this.filterText}" — press [ Clear ] to reset.`,
      {
        fontSize: CARD_INDEX_ROW_FONT_SIZE,
        color: CARD_INDEX_EMPTY_COLOR,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'italic',
      },
    );
    this.listContainer.add(text);
    pos.y += CARD_INDEX_GROUP_GAP + CARD_INDEX_ROW_LINE_HEIGHT * 2;
  }

  /** Appends a group header plus one row per entry. */
  private appendGroup(group: CardGroup, pos: { y: number }): void {
    const header = this.add.text(
      CARD_INDEX_LIST_MARGIN_X,
      pos.y + CARD_INDEX_GROUP_GAP,
      `── ${group.label} (${group.entries.length}) ──`,
      {
        fontSize: CARD_INDEX_GROUP_HEADER_FONT_SIZE,
        color: CARD_INDEX_GROUP_HEADER_COLOR,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      },
    );
    this.listContainer.add(header);
    pos.y += CARD_INDEX_GROUP_GAP + CARD_INDEX_ROW_LINE_HEIGHT;

    for (const entry of group.entries) {
      this.appendRow(entry, pos);
    }
  }

  /** Appends a single interactive card row. */
  private appendRow(entry: CardIndexEntry, pos: { y: number }): void {
    const rowY = pos.y;
    const rowWidth = this.listBounds.width - CARD_INDEX_LIST_MARGIN_X;

    const name = this.add.text(
      CARD_INDEX_LIST_MARGIN_X,
      rowY,
      entry.name,
      {
        fontSize: CARD_INDEX_ROW_FONT_SIZE,
        color: CARD_INDEX_ROW_COLOR,
        fontFamily: 'Arial, sans-serif',
      },
    );

    const meta = this.add.text(
      rowWidth - CARD_INDEX_LIST_MARGIN_RIGHT,
      rowY,
      formatRowMeta(entry),
      {
        fontSize: CARD_INDEX_META_FONT_SIZE,
        color: CARD_INDEX_META_COLOR,
        fontFamily: 'Arial, sans-serif',
      },
    );
    meta.setOrigin(1, 0);

    // Full-width invisible hit area so hovering the row (not just the name)
    // shows the tooltip.
    const hit = this.add.rectangle(
      CARD_INDEX_LIST_MARGIN_X + rowWidth / 2,
      rowY + CARD_INDEX_ROW_LINE_HEIGHT / 2 - 1,
      rowWidth,
      CARD_INDEX_ROW_LINE_HEIGHT,
      0xffffff,
      0,
    );
    hit.setInteractive({ useHandCursor: true });

    hit.on('pointerover', () => {
      name.setColor(CARD_INDEX_ROW_HOVER_COLOR);
      hit.setFillStyle(0xffffff, 0.06);
      this.showTooltip(entry, hit);
    });
    hit.on('pointerout', () => {
      name.setColor(CARD_INDEX_ROW_COLOR);
      hit.setFillStyle(0xffffff, 0);
      this.tooltipManager.hide();
    });
    hit.on('pointerdown', () => this.openCardDetail(entry));

    this.listContainer.add([name, meta, hit]);
    pos.y = rowY + CARD_INDEX_ROW_LINE_HEIGHT;
  }

  /** Shows the player-facing tooltip for a row, honouring the settings toggle. */
  private showTooltip(entry: CardIndexEntry, source: Phaser.GameObjects.Rectangle): void {
    if (!getTooltips()) return;
    this.tooltipManager.show(buildCardTooltip(entry), source.x, source.y);
  }

  private updateModeButtons(): void {
    this.queryText.setText(this.renderedQuery());
    this.modeFamilyText.setColor(
      this.groupMode === 'family'
        ? CARD_INDEX_MODE_ACTIVE_COLOR
        : CARD_INDEX_MODE_INACTIVE_COLOR,
    );
    this.modeSynergyText.setColor(
      this.groupMode === 'synergy'
        ? CARD_INDEX_MODE_ACTIVE_COLOR
        : CARD_INDEX_MODE_INACTIVE_COLOR,
    );
  }

  private updateStatus(visibleCount: number): void {
    const overflow = this.maxScroll() > 0 ? ' · wheel to scroll' : '';
    this.statusText.setText(
      `${groupModeLabel(this.groupMode)} · showing ${visibleCount} of ${this.indexEntries.length} cards${overflow}`,
    );
  }

  // ── Card detail dialog ──────────────────────────────────

  /**
   * Opens the scrollable raw-data detail dialog for a card.
   *
   * The dialog lists every field of the card template (absent optional fields
   * rendered as `—`) followed by the player-facing tooltip, so engineers can
   * compare raw data with what the player sees.
   */
  openCardDetail(entry: CardIndexEntry): void {
    if (this.detailDialog) return;

    this.tooltipManager.hide();

    const handle = createOverlayDialog(this, {
      title: `${entry.name} — ${cardFamilyLabel(entry.family)} (T${entry.tier})`,
      width: CARD_INDEX_DIALOG_WIDTH,
      height: CARD_INDEX_DIALOG_HEIGHT,
      onClose: () => {
        this.detailDialog = null;
      },
    });
    this.detailDialog = handle;

    const lines = formatCardDetailLines(entry);
    lines.forEach((line, index) => {
      const text = this.add.text(
        0,
        index * CARD_INDEX_DIALOG_LINE_HEIGHT,
        line,
        {
          fontSize: '12px',
          color: line === '' ? CARD_INDEX_META_COLOR : CARD_INDEX_ROW_COLOR,
          fontFamily: handle.monoFont,
        },
      );
      handle.scrollContainer.add(text);
    });

    handle.refresh(lines.length * CARD_INDEX_DIALOG_LINE_HEIGHT + CARD_INDEX_DIALOG_LINE_HEIGHT);
  }

  /** Closes the detail dialog if one is open. */
  closeCardDetail(): void {
    this.detailDialog?.close();
    this.detailDialog = null;
  }

  // ── Lifecycle ───────────────────────────────────────────

  /** Releases keyboard/wheel listeners, the dialog and the tooltip manager. */
  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.closeCardDetail();
    this.tooltipManager?.destroy();
    this.input.keyboard?.off('keydown', this.handleKeyDown);
    this.input.off('wheel', this.handleWheel);
    this.listContainer?.clearMask();
    this.listMask?.destroy();
  }
}
