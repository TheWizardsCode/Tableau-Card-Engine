/**
 * In-game card-pack listing (feature F6, CG-0MUZIS2VF006NY3T).
 *
 * Renders the packs discovered by `src/ui/CardPackLoader.ts` as a list of
 * installed rows — free/unlocked packs with an enable/disable control, locked
 * packs (unentitled or core-incompatible) with a read-only reason. Games reuse
 * the component for their "Card Packs" panel (Main Street wires it in F9).
 *
 * Positioning is entirely SLL: every coordinate comes from the exported
 * {@link CARD_PACK_LISTING_LAYOUT} via `getZoneRect` / `anchorPoint` — there
 * are no hard-coded pixel positions. The layout uses normalized zones and
 * anchors only (no `pixelOverride`), so
 * {@link planCardPackListing} is a pure, unit-testable function.
 *
 * The row model is separated from Phaser rendering: {@link createCardPackListingState},
 * {@link toggleCardPack} and {@link planCardPackListing} are pure so the
 * installed/unlocked/locked state, toggle gating and SLL-only positioning are
 * covered by `tests/ui/card-pack-listing.test.ts` without a browser.
 *
 * @see src/ui/CardPackLoader.ts — produces the {@link CardPackLoadResult}.
 * @see src/ui/card-pack-client.ts — entitlement status source.
 * @see docs/DEVELOPER.md — "Card Packs"
 */

import Phaser from 'phaser';
import { FONT_FAMILY } from './constants';
import type { CardPackLoadResult } from './CardPackLoader';
import type { PackEntitlementStateLike } from './card-pack-client';
import {
  anchorPoint,
  getZoneRect,
  type LayoutViewport,
} from './screen-layout';
import type {
  PixelPoint,
  PixelRect,
  ScreenLayoutDocument,
} from './screen-layout-schema';

/**
 * SLL document for the card-pack listing.
 *
 * Two zones: `panel` (the visible dialogue) and `list` (the rows region). All
 * coordinates are normalized (0-1) so the listing adapts to the viewport; the
 * `list` zone's `rowLeft`/`rowRight` anchors supply the row x extents and its
 * rect height is divided evenly across the visible rows.
 */
export const CARD_PACK_LISTING_LAYOUT: ScreenLayoutDocument = {
  version: 1,
  id: 'card-pack-listing',
  baseViewport: { width: 1280, height: 720 },
  requiredZones: ['panel', 'list'],
  zones: {
    panel: {
      rect: { x: 0.18, y: 0.12, w: 0.64, h: 0.76 },
      anchors: {
        title: { x: 0.5, y: 0.17 },
        close: { x: 0.785, y: 0.17 },
        hint: { x: 0.5, y: 0.83 },
      },
    },
    list: {
      rect: { x: 0.22, y: 0.24, w: 0.56, h: 0.54 },
      anchors: {
        rowLeft: { x: 0.24, y: 0.5 },
        rowRight: { x: 0.76, y: 0.5 },
      },
    },
  },
};

/** Installed-state of a listing row. */
export type CardPackRowState = Extract<
  PackEntitlementStateLike,
  'free' | 'unlocked' | 'locked'
>;

/** One rendered pack row. */
export interface CardPackListingRow {
  /** Pack id (manifest `id`). */
  readonly id: string;
  /** Display title. */
  readonly title: string;
  /** Short description. */
  readonly description: string;
  /** Pack content version. */
  readonly version: string;
  /** Installed state: free, unlocked or locked. */
  readonly state: CardPackRowState;
  /** Human-readable lock/incompatibility reason; `null` when playable. */
  readonly lockReason: string | null;
  /** Whether the pack is currently active. */
  readonly enabled: boolean;
  /** Whether the enable/disable control is available (false when locked). */
  readonly toggleable: boolean;
}

/** Immutable listing state derived from a loader result. */
export interface CardPackListingState {
  readonly rows: readonly CardPackListingRow[];
}

/**
 * Build listing state from a loader result.
 *
 * Entitled packs (free/unlocked) are enabled by default and toggleable; locked
 * and incompatible packs are disabled, non-toggleable, and carry their reason.
 * Row order is: entitled packs, then locked packs, then incompatible packs.
 */
export function createCardPackListingState(
  result: CardPackLoadResult,
): CardPackListingState {
  const rows: CardPackListingRow[] = [];

  for (const pack of result.packs) {
    const state: CardPackRowState = pack.status.state === 'unlocked' ? 'unlocked' : 'free';
    rows.push({
      id: pack.manifest.id,
      title: pack.manifest.title,
      description: pack.manifest.description,
      version: pack.manifest.version,
      state,
      lockReason: null,
      enabled: pack.enabled,
      toggleable: true,
    });
  }

  for (const pack of result.locked) {
    rows.push({
      id: pack.manifest.id,
      title: pack.manifest.title,
      description: pack.manifest.description,
      version: pack.manifest.version,
      state: 'locked',
      lockReason: pack.reason,
      enabled: false,
      toggleable: false,
    });
  }

  for (const pack of result.incompatible) {
    rows.push({
      id: pack.pack.id,
      title: pack.pack.title,
      description: pack.pack.description,
      version: pack.pack.version,
      state: 'locked',
      lockReason: pack.reason,
      enabled: false,
      toggleable: false,
    });
  }

  return { rows };
}

/**
 * Flip the enabled state of the toggleable pack *packId*, returning new state.
 *
 * A locked/incompatible pack cannot be enabled: the request is ignored and the
 * state is returned unchanged. The input state is never mutated.
 */
export function toggleCardPack(
  state: CardPackListingState,
  packId: string,
): CardPackListingState {
  const row = state.rows.find((candidate) => candidate.id === packId);
  if (!row || !row.toggleable) return state;
  return {
    rows: state.rows.map((candidate) =>
      candidate.id === packId ? { ...candidate, enabled: !candidate.enabled } : candidate,
    ),
  };
}

/** Whether the pack *packId* is currently enabled. */
export function isCardPackEnabled(
  state: CardPackListingState,
  packId: string,
): boolean {
  return state.rows.find((candidate) => candidate.id === packId)?.enabled === true;
}

/** The ids of every enabled pack, in row order. */
export function enabledCardPackIds(state: CardPackListingState): string[] {
  return state.rows.filter((row) => row.enabled).map((row) => row.id);
}

/** The x extents, centre-y and height of one planned row. */
export interface CardPackListingRowLayout {
  readonly leftX: number;
  readonly rightX: number;
  readonly centerY: number;
  readonly height: number;
}

/** Resolved layout for the panel, its labels, and each row. */
export interface CardPackListingLayoutPlan {
  readonly panel: PixelRect;
  readonly title: PixelPoint;
  readonly close: PixelPoint;
  readonly hint: PixelPoint;
  readonly rows: readonly CardPackListingRowLayout[];
}

/**
 * Resolve the listing layout for a viewport via SLL.
 *
 * Every returned coordinate comes from `getZoneRect` / `anchorPoint` over
 * *layout*; the rows are distributed evenly through the `list` zone's rect.
 * Pure and total — pass *layout* (defaults to {@link CARD_PACK_LISTING_LAYOUT})
 * so a game can override it without touching this module.
 */
export function planCardPackListing(
  viewport: LayoutViewport,
  rowCount: number,
  dpr = 1,
  layout: ScreenLayoutDocument = CARD_PACK_LISTING_LAYOUT,
): CardPackListingLayoutPlan {
  const panel = getZoneRect(layout, 'panel', viewport, dpr);
  const title = anchorPoint(layout, 'panel', 'title', viewport, dpr);
  const close = anchorPoint(layout, 'panel', 'close', viewport, dpr);
  const hint = anchorPoint(layout, 'panel', 'hint', viewport, dpr);

  const list = getZoneRect(layout, 'list', viewport, dpr);
  const rowLeft = anchorPoint(layout, 'list', 'rowLeft', viewport, dpr);
  const rowRight = anchorPoint(layout, 'list', 'rowRight', viewport, dpr);

  const count = Number.isFinite(rowCount) && rowCount > 0 ? Math.floor(rowCount) : 0;
  const height = list.height ?? 0;
  const rowHeight = count > 0 ? height / count : 0;
  const rows: CardPackListingRowLayout[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      leftX: rowLeft.x,
      rightX: rowRight.x,
      centerY: list.y + rowHeight * (index + 0.5),
      height: rowHeight,
    });
  }

  return { panel, title, close, hint, rows };
}

/** Configuration for {@link CardPackListing}. */
export interface CardPackListingOptions {
  /** Initial loader result to render. */
  readonly result?: CardPackLoadResult;
  /** SLL layout override; defaults to {@link CARD_PACK_LISTING_LAYOUT}. */
  readonly layout?: ScreenLayoutDocument;
  /** Viewport override; defaults to the scene's scale. */
  readonly viewport?: LayoutViewport;
  /** Called after each toggle with the new state. */
  readonly onToggle?: (state: CardPackListingState) => void;
  /** Called when the close control is activated. */
  readonly onClose?: () => void;
}

const PANEL_BG = 0x101a14;
const PANEL_BORDER = 0x4a8a4a;
const TITLE_COLOUR = '#f0c040';
const BODY_COLOUR = '#dddddd';
const MUTED_COLOUR = '#8a9a8a';
const LOCK_COLOUR = '#c9a65a';
const ENABLED_COLOUR = '#88ff88';

/**
 * Reusable, SLL-positioned card-pack listing.
 *
 * Construct with a scene and an optional loader result; call
 * {@link setResult} to refresh after a new discovery, and {@link toggle} (or
 * the rendered control) to enable/disable a pack. All display objects live in
 * one container so a game can parent it into its HUD and destroy it in one
 * call.
 */
export class CardPackListing {
  private readonly scene: Phaser.Scene;
  private readonly layout: ScreenLayoutDocument;
  private readonly viewport: LayoutViewport;
  private readonly onToggle?: (state: CardPackListingState) => void;
  private readonly onClose?: () => void;

  private state: CardPackListingState;
  private container: Phaser.GameObjects.Container;
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: CardPackListingOptions = {}) {
    this.scene = scene;
    this.layout = options.layout ?? CARD_PACK_LISTING_LAYOUT;
    this.viewport = options.viewport ?? {
      width: scene.scale?.width ?? CARD_PACK_LISTING_LAYOUT.baseViewport.width,
      height: scene.scale?.height ?? CARD_PACK_LISTING_LAYOUT.baseViewport.height,
    };
    this.onToggle = options.onToggle;
    this.onClose = options.onClose;
    this.state = options.result
      ? createCardPackListingState(options.result)
      : { rows: [] };

    this.container = scene.add.container(0, 0);
    this.render();
  }

  /** The Phaser container holding every listing object. */
  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  /** The current listing state. */
  getState(): CardPackListingState {
    return this.state;
  }

  /** Replace the rendered loader result (recomputes rows and enabled defaults). */
  setResult(result: CardPackLoadResult): void {
    if (this.destroyed) return;
    this.state = createCardPackListingState(result);
    this.render();
  }

  /** Toggle the pack *packId* (a locked pack is ignored) and re-render. */
  toggle(packId: string): boolean {
    if (this.destroyed) return false;
    const next = toggleCardPack(this.state, packId);
    if (next === this.state) return false;
    this.state = next;
    this.render();
    this.onToggle?.(this.state);
    return true;
  }

  /** Destroy every rendered object and release the container. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy(true);
  }

  // ── Rendering ─────────────────────────────────────────────

  private render(): void {
    this.container.removeAll(true);

    const plan = planCardPackListing(
      this.viewport,
      this.state.rows.length,
      1,
      this.layout,
    );

    const panel = this.scene.add
      .rectangle(
        plan.panel.x,
        plan.panel.y,
        plan.panel.width ?? 0,
        plan.panel.height ?? 0,
        PANEL_BG,
        0.98,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, PANEL_BORDER);
    this.container.add(panel);

    const title = this.scene.add
      .text(plan.title.x, plan.title.y, 'Card Packs', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: TITLE_COLOUR,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.container.add(title);

    const close = this.scene.add
      .text(plan.close.x, plan.close.y, '[ Close ]', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: BODY_COLOUR,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.onClose?.());
    this.container.add(close);

    const hint = this.scene.add
      .text(plan.hint.x, plan.hint.y, 'Enable or disable installed card packs.', {
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        color: MUTED_COLOUR,
      })
      .setOrigin(0.5);
    this.container.add(hint);

    if (this.state.rows.length === 0) {
      const empty = this.scene.add
        .text(plan.title.x, plan.title.y + 40, 'No card packs installed.', {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: MUTED_COLOUR,
        })
        .setOrigin(0.5);
      this.container.add(empty);
      return;
    }

    this.state.rows.forEach((row, index) => {
      const planRow = plan.rows[index];
      if (!planRow) return;

      const width = planRow.rightX - planRow.leftX;
      const rowBg = this.scene.add
        .rectangle(planRow.leftX, planRow.centerY, width, planRow.height * 0.9, 0x1a3a1a, 0.85)
        .setOrigin(0, 0.5);
      this.container.add(rowBg);

      const label = this.scene.add
        .text(planRow.leftX + 12, planRow.centerY, `${row.title}  v${row.version}`, {
          fontFamily: FONT_FAMILY,
          fontSize: '14px',
          color: row.state === 'locked' ? MUTED_COLOUR : BODY_COLOUR,
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      this.container.add(label);

      const detail = row.lockReason
        ? `Locked — ${row.lockReason}`
        : row.description;
      const detailColour = row.lockReason ? LOCK_COLOUR : MUTED_COLOUR;
      const detailText = this.scene.add
        .text(planRow.leftX + 12, planRow.centerY + 16, detail, {
          fontFamily: FONT_FAMILY,
          fontSize: '11px',
          color: detailColour,
          wordWrap: { width: Math.max(width - 160, 0) },
        })
        .setOrigin(0, 0.5);
      this.container.add(detailText);

      const control = this.createRowControl(row, planRow);
      this.container.add(control);
    });
  }

  private createRowControl(
    row: CardPackListingRow,
    planRow: CardPackListingRowLayout,
  ): Phaser.GameObjects.Text {
    const x = planRow.rightX - 12;
    if (!row.toggleable) {
      return this.scene.add
        .text(x, planRow.centerY, '[ Locked ]', {
          fontFamily: FONT_FAMILY,
          fontSize: '13px',
          color: LOCK_COLOUR,
        })
        .setOrigin(1, 0.5);
    }

    const control = this.scene.add
      .text(x, planRow.centerY, row.enabled ? '[ Disable ]' : '[ Enable ]', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: row.enabled ? ENABLED_COLOUR : BODY_COLOUR,
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    control.on('pointerdown', () => this.toggle(row.id));
    return control;
  }
}
