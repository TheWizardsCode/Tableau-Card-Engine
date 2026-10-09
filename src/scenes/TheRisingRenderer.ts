/**
 * TheRisingRenderer -- renders the The Rising board: the Spirit Row market,
 * the timeline track, the hand, the Clouded recovery pile and the HUD.
 *
 * Positioning comes entirely from {@link TheRisingLayout} (resolved from the
 * SLL document). Card rows are rendered through the core-engine `HandView`
 * component and the recovery pile through `PileView` — there is no bespoke
 * hand/pile rendering or hard-coded pixel positioning here (AC4).
 *
 * Spirit cards do not use the standard rank/suit model, so each `HandView` is
 * given a `renderCard` callback that paints a spirit face. `HandView` still
 * owns layout, spacing, compression and selection raise.
 *
 * @module src/scenes/TheRisingRenderer
 */

import Phaser from 'phaser';
import { FONT_FAMILY, HandView, PileView } from '@ui';
import type { Card } from '@card-system/Card';
import { ROSTER, type Spirit } from '../TheRisingContent';
import type { RisingState } from '../TheRisingState';
import type { TheRisingLayout } from './TheRisingLayoutAdapter';

/** Width of a rendered spirit card, in logical pixels. */
export const RISING_CARD_W = 96;

/** Height of a rendered spirit card, in logical pixels. */
export const RISING_CARD_H = 130;

/** Horizontal gap between spirit cards in a row, in logical pixels. */
export const RISING_CARD_GAP = 10;

/** Era accent colours, keyed by era id (falls back to a neutral slate). */
export const RISING_ERA_COLORS: Readonly<Record<string, number>> = {
  'norman-lordship': 0x6d8fb0,
  'gaelic-resurgence': 0x4f9d6b,
  'plantation-cromwell': 0xb07b52,
  'penal-united-irishmen': 0x8f6db0,
  'union-emancipation-famine': 0xb05a5a,
  'fenians-land-war-home-rule': 0xb0984f,
  'road-to-the-rising': 0x4fa8b0,
};

const FALLBACK_ERA_COLOR = 0x8899aa;

/**
 * A `CardPile`-shaped model over the Clouded spirit ids, so the core
 * `PileView` can render the recovery area without bespoke sprite handling.
 */
class SpiritPileModel {
  private spirits: readonly Spirit[] = [];

  setSpirits(spirits: readonly Spirit[]): void {
    this.spirits = spirits;
  }

  size(): number {
    return this.spirits.length;
  }

  isEmpty(): boolean {
    return this.spirits.length === 0;
  }

  peek(): Spirit | undefined {
    return this.spirits[this.spirits.length - 1];
  }
}

/**
 * Renders the The Rising board and HUD.
 *
 * The renderer is a thin, state-driven view: call {@link setState} then
 * {@link refreshAll} to repaint. It owns the display objects and destroys them
 * in {@link destroy}.
 */
export class TheRisingRenderer {
  /** Spirit Row (market) card row. */
  public readonly marketView: HandView;
  /** Unplaced met spirits (hand) card row. */
  public readonly handView: HandView;
  /** Placed spirits on the timeline, ordered left-to-right. */
  public readonly timelineView: HandView;
  /** Clouded recovery pile. */
  public readonly cloudedPile: PileView;

  /** HUD: remaining / maximum Memory. */
  public readonly memoryText: Phaser.GameObjects.Text;
  /** HUD: the Rising clock year. */
  public readonly clockText: Phaser.GameObjects.Text;
  /** HUD: accumulated Insight versus the win target. */
  public readonly insightText: Phaser.GameObjects.Text;

  /** Section labels for each band. */
  public readonly marketLabel: Phaser.GameObjects.Text;
  public readonly timelineLabel: Phaser.GameObjects.Text;
  public readonly handLabel: Phaser.GameObjects.Text;

  private readonly scene: Phaser.Scene;
  private readonly layout: TheRisingLayout;
  private readonly rosterById: ReadonlyMap<string, Spirit>;
  private readonly cloudedModel = new SpiritPileModel();
  private state: RisingState;

  constructor(scene: Phaser.Scene, state: RisingState, layout: TheRisingLayout) {
    this.scene = scene;
    this.state = state;
    this.layout = layout;
    this.rosterById = new Map(ROSTER.spirits.map((spirit) => [spirit.id, spirit]));

    this.marketLabel = this.createBandLabel(layout.spiritRow.label, 'Spirit Row');
    this.timelineLabel = this.createBandLabel(layout.timeline.label, 'Timeline');
    this.handLabel = this.createBandLabel(layout.hand.label, 'Hand');

    this.memoryText = this.createHudText(layout.hud.memory, 'rising-memory');
    this.clockText = this.createHudText(layout.hud.clock, 'rising-clock', 0.5);
    this.insightText = this.createHudText(layout.hud.insight, 'rising-insight');

    this.marketView = this.createRow('market', layout.spiritRow);
    this.timelineView = this.createRow('timeline', layout.timeline);
    this.handView = this.createRow('hand', layout.hand);

    this.cloudedPile = new PileView(scene, {
      x: layout.cloudedPile.center.x,
      y: layout.cloudedPile.center.y,
      label: 'Clouded',
      countColor: '#8899aa',
      cardTextureFn: () => 'card_back',
    });
    this.cloudedPile.setPile(this.cloudedModel);

    this.refreshAll();
  }

  /** Update the state the renderer paints from. */
  setState(state: RisingState): void {
    this.state = state;
  }

  /** Expose the current layout (used by tests and the turn controller). */
  getLayout(): TheRisingLayout {
    return this.layout;
  }

  /**
   * Return the rendered display object for a spirit in a named band, or
   * `undefined` when the spirit is not currently rendered there.
   *
   * The display object is a `Container` whose `name` is
   * `` `${zone}-spirit-${spiritId}` ``.
   */
  findSpiritSprite(
    zone: 'market' | 'timeline' | 'hand',
    spiritId: string,
  ): (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform) | undefined {
    const view = zone === 'market' ? this.marketView : zone === 'hand' ? this.handView : this.timelineView;
    const name = `${zone}-spirit-${spiritId}`;
    return (view.getSprites() as Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform>).find(
      (sprite) => sprite.name === name,
    );
  }

  // ── Construction helpers ────────────────────────────────

  private createBandLabel(point: { x: number; y: number }, text: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(point.x, point.y, text, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#b9a97f',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0, 0.5);
  }

  private createHudText(
    point: { x: number; y: number },
    name: string,
    originX = 0,
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(point.x, point.y, '', {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#e8e2d0',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(originX, 0.5)
      .setName(name);
  }

  private createRow(
    zone: 'market' | 'timeline' | 'hand',
    band: TheRisingLayout['spiritRow'],
  ): HandView {
    return new HandView(this.scene, {
      baseX: band.center.x,
      baseY: band.center.y,
      centerX: band.center.x,
      spacing: RISING_CARD_W + RISING_CARD_GAP,
      cardWidth: RISING_CARD_W,
      cardHeight: RISING_CARD_H,
      maxWidth: band.maxWidth,
      showLabels: false,
      clickEnabled: false,
      selectionEnabled: false,
      renderCard: (card) => this.renderSpiritFace(zone, card as unknown as Spirit),
    });
  }

  /**
   * Paint a spirit card face as a self-contained container.
   *
   * The container is positioned by `HandView`; its children are laid out
   * relative to the card centre so no absolute screen positions are used.
   */
  private renderSpiritFace(
    zone: 'market' | 'timeline' | 'hand',
    spirit: Spirit,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(0, 0);
    container.setName(`${zone}-spirit-${spirit.id}`);

    // Make the custom-rendered card clickable/draggable. A Container has no
    // texture, so an explicit local hit area is required; its children are
    // centred on (0, 0) so the rectangle spans the card bounds.
    container.setInteractive(
      new Phaser.Geom.Rectangle(-RISING_CARD_W / 2, -RISING_CARD_H / 2, RISING_CARD_W, RISING_CARD_H),
      Phaser.Geom.Rectangle.Contains,
    );

    const halfH = RISING_CARD_H / 2;

    const bg = this.scene.add.rectangle(0, 0, RISING_CARD_W, RISING_CARD_H, 0x1b2130);
    bg.setStrokeStyle(2, 0x3b455c);
    container.add(bg);

    const accent = this.scene.add.rectangle(
      0,
      -halfH + 10,
      RISING_CARD_W - 10,
      12,
      RISING_ERA_COLORS[spirit.eraId] ?? FALLBACK_ERA_COLOR,
    );
    container.add(accent);

    const name = this.scene.add
      .text(0, -halfH + 30, spirit.name, {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#f2ecd9',
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: RISING_CARD_W - 12 },
      })
      .setOrigin(0.5, 0);
    container.add(name);

    const dates = this.scene.add
      .text(0, -halfH + 62, spirit.dateRange.label, {
        fontSize: '9px',
        color: '#9fb0c8',
        fontFamily: FONT_FAMILY,
      })
      .setOrigin(0.5, 0);
    container.add(dates);

    const summary = this.scene.add
      .text(0, halfH - 44, spirit.summary, {
        fontSize: '8px',
        color: '#c7cdd8',
        fontFamily: FONT_FAMILY,
        align: 'center',
        wordWrap: { width: RISING_CARD_W - 12 },
      })
      .setOrigin(0.5, 0);
    container.add(summary);

    return container;
  }

  // ── Refresh ─────────────────────────────────────────────

  /** Repaint every band and the HUD from the current state. */
  refreshAll(): void {
    this.marketView.setCards(this.toCards(this.resolveSpirits(this.state.spiritRow)));
    this.handView.setCards(this.toCards(this.resolveSpirits(this.state.hand)));
    this.timelineView.setCards(
      this.toCards(this.state.timeline.map((entry) => this.rosterById.get(entry.spiritId)).filter(
        (spirit): spirit is Spirit => spirit !== undefined,
      )),
    );

    this.cloudedModel.setSpirits(this.resolveSpirits(this.state.cloudedSpiritIds));
    this.cloudedPile.update();

    this.memoryText.setText(`Memory ${this.state.memory}/${this.state.maxMemory}`);
    this.clockText.setText(`Rising Clock ${this.state.clock}`);
    this.insightText.setText(`Insight ${this.state.insight}/${this.state.insightTarget}`);
  }

  private resolveSpirits(ids: readonly string[]): Spirit[] {
    return ids
      .map((id) => this.rosterById.get(id))
      .filter((spirit): spirit is Spirit => spirit !== undefined);
  }

  /**
   * Present spirits to `HandView` as card-shaped objects.
   *
   * `HandView` only requires the card object at runtime when a default texture
   * resolver is used; with `renderCard` supplied the spirit itself is passed
   * back to the renderer. The cast is therefore safe and keeps the row
   * rendering on the shared component.
   */
  private toCards(spirits: readonly Spirit[]): Card[] {
    return spirits as unknown as Card[];
  }

  /** Destroy every display object owned by the renderer. */
  destroy(): void {
    this.marketView.destroy();
    this.handView.destroy();
    this.timelineView.destroy();
    this.cloudedPile.destroy();
    this.memoryText.destroy();
    this.clockText.destroy();
    this.insightText.destroy();
    this.marketLabel.destroy();
    this.timelineLabel.destroy();
    this.handLabel.destroy();
  }
}
