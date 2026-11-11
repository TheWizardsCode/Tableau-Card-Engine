/**
 * HandView drag-to-reorder unit tests.
 *
 * Covers the opt-in reorder capability (CG-0MWBX4GJK007ZAOX):
 *  - defaults + `setReorderEnabled()` / `getReorderEnabled()`
 *  - insertion-index computation (left edge, between cards, right edge,
 *    own slot, fixed `maxSlots` capacity template, single card)
 *  - committed array / sprite order and the `cardreorder` payload
 *  - the no-op case (no event, no SFX)
 *  - the reduced-motion path (instant, no reorder tween)
 *  - SFX wiring through the injected SoundManager
 *  - pile-target precedence and the untouched drag-to-pile path
 *  - custom `renderCard` hands reordering
 *  - the transient insertion affordance
 *
 * @module tests/ui/handView.reorder.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import { COMMON_SFX_KEYS } from '../../src/core-engine/SoundManager';
import type { Card, Rank, Suit } from '../../src/card-system/Card';
import { createCard } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────
// HandView uses scene.add.image/text/rectangle, scene.tweens.add/
// killTweensOf and scene.input.on/off. Display objects capture their
// `pointerdown` handlers so a drag is driven through the real pointer
// lifecycle rather than by calling private methods.

function createMockScene(): any {
  const tweens: any[] = [];
  const images: any[] = [];
  const texts: any[] = [];
  const rectangles: any[] = [];
  const containers: any[] = [];

  const attachHandlers = (obj: any) => {
    obj._handlers = {};
    obj.on = vi.fn((event: string, cb: any) => {
      (obj._handlers[event] ||= []).push(cb);
      return obj;
    });
    return obj;
  };

  const mockImage = (x: number, y: number, texture: string) => {
    const img: any = {
      x,
      y,
      texture: { key: texture },
      active: true,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
      rotation: 0,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      displayWidth: 48,
      displayHeight: 130,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setDepth: vi.fn(function (this: any, d: number) {
        this.depth = d;
        return this;
      }),
      setPosition: vi.fn(function (this: any, px: number, py: number) {
        this.x = px;
        this.y = py;
        return this;
      }),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(() => {
        img.active = false;
      }),
    };
    attachHandlers(img);
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string) => {
    const txt: any = {
      x,
      y,
      text,
      active: true,
      depth: 0,
      rotation: 0,
      setOrigin: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      setDepth: vi.fn(function (this: any, d: number) {
        this.depth = d;
        return this;
      }),
      setPosition: vi.fn(function (this: any, px: number, py: number) {
        this.x = px;
        this.y = py;
        return this;
      }),
      destroy: vi.fn(() => {
        txt.active = false;
      }),
    };
    attachHandlers(txt);
    texts.push(txt);
    return txt;
  };

  const mockRectangle = (x: number, y: number, w: number, h: number, color?: number) => {
    const rect: any = {
      x,
      y,
      width: w,
      height: h,
      fillColor: color ?? 0xffffff,
      fillAlpha: 1,
      strokeColor: 0xffffff,
      isOutline: false,
      active: true,
      visible: true,
      depth: 0,
      rotation: 0,
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      setDepth: vi.fn(function (this: any, d: number) {
        this.depth = d;
        return this;
      }),
      setRotation: vi.fn(function (this: any, r: number) {
        this.rotation = r;
        return this;
      }),
      setPosition: vi.fn(function (this: any, px: number, py: number) {
        this.x = px;
        this.y = py;
        return this;
      }),
      setVisible: vi.fn(function (this: any, v: boolean) {
        this.visible = v;
        return this;
      }),
      setStrokeStyle: vi.fn(function (this: any) {
        this.isOutline = true;
        return this;
      }),
      setFillStyle: vi.fn().mockReturnThis(),
      setRounded: vi.fn().mockReturnThis(),
      destroy: vi.fn(() => {
        rect.active = false;
      }),
    };
    attachHandlers(rect);
    rectangles.push(rect);
    return rect;
  };

  const mockContainer = (x: number, y: number) => {
    const c: any = {
      x,
      y,
      active: true,
      depth: 0,
      rotation: 0,
      setDepth: vi.fn(function (this: any, d: number) {
        this.depth = d;
        return this;
      }),
      setPosition: vi.fn(function (this: any, px: number, py: number) {
        this.x = px;
        this.y = py;
        return this;
      }),
      destroy: vi.fn(() => {
        c.active = false;
      }),
    };
    attachHandlers(c);
    containers.push(c);
    return c;
  };

  const inputHandlers: Record<string, any[]> = {};

  return {
    add: {
      image: vi.fn(mockImage),
      text: vi.fn(mockText),
      rectangle: vi.fn(mockRectangle),
      container: vi.fn(mockContainer),
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        // Apply the final transform synchronously (simulated tween completion)
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const target of targets) {
          if (config.x !== undefined) target.x = config.x;
          if (config.y !== undefined) target.y = config.y;
          if (config.rotation !== undefined) target.rotation = config.rotation;
        }
        tweens.push(config);
        return { stop: vi.fn() };
      }),
      killTweensOf: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, handler: any) => {
        (inputHandlers[event] ||= []).push(handler);
      }),
      off: vi.fn((event: string, handler: any) => {
        inputHandlers[event] = (inputHandlers[event] ?? []).filter((h) => h !== handler);
      }),
      emit: (event: string, payload?: any) => {
        for (const handler of inputHandlers[event] ?? []) handler(payload);
      },
      _handlers: inputHandlers,
    },
    events: { once: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn() },
    _tweens: tweens,
    _images: images,
    _texts: texts,
    _rectangles: rectangles,
    _containers: containers,
  };
}

function card(rank: Rank, suit: Suit): Card {
  return createCard(rank, suit, true);
}

/** A three-card hand: A♥ (index 0), K♠ (1), Q♦ (2). */
function hand(): Card[] {
  return [card('A', 'hearts'), card('K', 'spades'), card('Q', 'diamonds')];
}

/** Identity labels for assertions (Card has no id field). */
function labels(cards: Card[]): string[] {
  return cards.map((c) => `${c.rank}${c.suit}`);
}

// Layout produced by the mock scene for a 3-card row:
//   3 slots without maxSlots → centres 344, 400, 456
//   7-slot fixed template    → centres 232, 288, 344, 400, 456, 512, 568
const ROW = { baseX: 400, baseY: 500, spacing: 56, cardWidth: 48, centerX: 400 };
const CARD_HEIGHT = 130;

function makeView(scene: any, overrides: Record<string, any> = {}): HandView {
  return new HandView(scene, { ...ROW, ...overrides });
}

/** Fire the card's captured pointerdown handler. */
function pointerDown(view: HandView, index: number, x?: number, y?: number): void {
  const sprite: any = view.getSpriteAt(index);
  const centre = view.getCardCenters()[index];
  for (const handler of sprite._handlers.pointerdown ?? []) {
    handler({ x: x ?? centre.x, y: y ?? centre.y });
  }
}

/** Simulate a full drag: pointerdown on a card, two moves, then pointerup. */
function drag(
  view: HandView,
  scene: any,
  fromIndex: number,
  toX: number,
  toY?: number,
): void {
  const centre = view.getCardCenters()[fromIndex];
  const targetY = toY ?? centre.y;
  pointerDown(view, fromIndex);
  // First move must exceed HandView.DRAG_THRESHOLD (5px) to start the drag.
  scene.input.emit('pointermove', { x: centre.x + 10, y: centre.y });
  scene.input.emit('pointermove', { x: toX, y: targetY });
  scene.input.emit('pointerup', { x: toX, y: targetY });
}

/** Reorder markers are the narrow (3px) non-outline rectangles HandView creates. */
function reorderMarkers(scene: any): any[] {
  return scene._rectangles.filter((r: any) => r.active && !r.isOutline && r.width === 3);
}

// ── Tests ───────────────────────────────────────────────────

describe('HandView reorder — options and defaults', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('is disabled by default (existing drag semantics unchanged)', () => {
    const view = makeView(scene);
    expect(view.getReorderEnabled()).toBe(false);
    view.destroy();
  });

  it('reorderEnabled constructor option and set/get round-trip', () => {
    const view = makeView(scene, { reorderEnabled: true });
    expect(view.getReorderEnabled()).toBe(true);
    view.setReorderEnabled(false);
    expect(view.getReorderEnabled()).toBe(false);
    view.setReorderEnabled(true);
    expect(view.getReorderEnabled()).toBe(true);
    view.destroy();
  });

  it('does not reorder a drag inside the row band while disabled', () => {
    const view = makeView(scene);
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);
    const reordered = vi.fn();
    view.on('cardreorder', reordered);

    // 456 is the third (last) slot centre — a valid reorder target when on.
    drag(view, scene, 0, 456);

    expect(reordered).not.toHaveBeenCalled();
    expect(labels(view.getCards())).toEqual(labels(cards));
    view.destroy();
  });
});

describe('HandView reorder — insertion index computation', () => {
  let scene: any;
  let view: HandView;

  beforeEach(() => {
    scene = createMockScene();
    view = makeView(scene);
    view.setCards(hand());
  });

  it('returns 0 for a pointer left of slot 0', () => {
    expect(view.computeReorderInsertionIndex(300, 0)).toBe(0);
    expect(view.computeReorderInsertionIndex(300, 1)).toBe(0);
    expect(view.computeReorderInsertionIndex(300, 2)).toBe(0);
  });

  it('returns the boundary index for a pointer between two centres', () => {
    // Slot centres are 344 / 400 / 456. A card is inserted after every
    // remaining card whose centre the pointer has passed.
    expect(view.computeReorderInsertionIndex(340, 2)).toBe(0); // left of slot 0
    expect(view.computeReorderInsertionIndex(372, 2)).toBe(1); // past slot 0
    expect(view.computeReorderInsertionIndex(413, 0)).toBe(1); // past slot 1
    // A source that has no card left of the pointer is a no-op.
    expect(view.computeReorderInsertionIndex(372, 0)).toBe(0);
    expect(view.computeReorderInsertionIndex(413, 2)).toBe(2);
  });

  it('returns the last index for a pointer right of the last centre', () => {
    expect(view.computeReorderInsertionIndex(600, 0)).toBe(2);
    expect(view.computeReorderInsertionIndex(600, 1)).toBe(2);
    expect(view.computeReorderInsertionIndex(600, 2)).toBe(2);
  });

  it('returns the source index when the pointer is over the card`s own slot', () => {
    expect(view.computeReorderInsertionIndex(344, 0)).toBe(0);
    expect(view.computeReorderInsertionIndex(400, 1)).toBe(1);
    expect(view.computeReorderInsertionIndex(456, 2)).toBe(2);
  });

  it('returns 0 for a single-card hand (nothing to reorder)', () => {
    view.setCards([card('A', 'hearts')]);
    expect(view.computeReorderInsertionIndex(900, 0)).toBe(0);
  });

  it('uses the fixed maxSlots capacity template (slots never re-centre)', () => {
    view.destroy();
    view = makeView(scene, { maxSlots: 7 });
    view.setCards(hand());
    // Template centres: 232, 288, 344 (occupied) — 400…568 stay empty.
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([232, 288, 344]);

    // Dragging card 0 rightwards past card 1's centre (288) → index 1.
    expect(view.computeReorderInsertionIndex(300, 0)).toBe(1);
    // Releasing over card 0's own slot is still a no-op.
    expect(view.computeReorderInsertionIndex(232, 0)).toBe(0);
    // A pointer in the empty capacity area appends (max target = count - 1).
    expect(view.computeReorderInsertionIndex(600, 0)).toBe(2);
  });
});

describe('HandView reorder — commit path', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('reorders cards, sprites and centres, and emits cardreorder', () => {
    const view = makeView(scene, { reorderEnabled: true });
    const cards = hand();
    const [a, k, q] = cards;
    view.setCards(cards);
    view.setDragEnabled(true);

    const payloads: any[] = [];
    view.on('cardreorder', (p: any) => payloads.push(p));
    const spritesBefore = view.getSprites();

    // Drag A (index 0) past the last card's centre → append.
    drag(view, scene, 0, 600);

    expect(labels(view.getCards())).toEqual(labels([k, q, a]));
    expect(payloads).toHaveLength(1);
    expect(payloads[0].from).toBe(0);
    expect(payloads[0].to).toBe(2);
    expect(payloads[0].card).toBe(a);

    // The sprites array follows the same order (same objects, re-indexed) and
    // keeps per-index depth.
    expect(view.getSprites()[0]).toBe(spritesBefore[1]);
    expect(view.getSprites()[1]).toBe(spritesBefore[2]);
    expect(view.getSprites()[2]).toBe(spritesBefore[0]);
    view.getSprites().forEach((s: any, i: number) => expect(s.depth).toBe(i));

    // The row re-lays out into the same slot template (no re-centring).
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([344, 400, 456]);
    view.destroy();
  });

  it('keeps the fixed capacity template slots stable on reorder', () => {
    const view = makeView(scene, { reorderEnabled: true, maxSlots: 7 });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    drag(view, scene, 0, 300); // 0 → 1

    expect(labels(view.getCards())).toEqual(labels([cards[1], cards[0], cards[2]]));
    // Occupied slots are unchanged — only the cards swapped slots.
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([232, 288, 344]);
    view.destroy();
  });

  it('is a no-op when released over the card`s own slot (no event, no SFX)', () => {
    const soundManager = { play: vi.fn() } as any;
    const view = makeView(scene, { reorderEnabled: true, soundManager });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    const reordered = vi.fn();
    view.on('cardreorder', reordered);

    const centre = view.getCardCenters()[1];
    drag(view, scene, 1, centre.x);

    expect(reordered).not.toHaveBeenCalled();
    expect(soundManager.play).not.toHaveBeenCalled();
    expect(labels(view.getCards())).toEqual(labels(cards));
    view.destroy();
  });

  it('snaps the row instantly under reduced motion (no reorder tween)', () => {
    const view = makeView(scene, { reorderEnabled: true, reducedMotion: true });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    drag(view, scene, 0, 600);

    expect(labels(view.getCards())).toEqual(labels([cards[1], cards[2], cards[0]]));
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([344, 400, 456]);
    // No reorder animation was scheduled under reduced motion.
    const reorderTweens = scene._tweens.filter(
      (t: any) => t.duration === 240 && t.x !== undefined,
    );
    expect(reorderTweens).toHaveLength(0);
    view.destroy();
  });

  it('animates the re-layout when motion is allowed', () => {
    const view = makeView(scene, { reorderEnabled: true, showLabels: false });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    drag(view, scene, 0, 600);

    const reorderTweens = scene._tweens.filter(
      (t: any) => t.duration === 240 && t.x !== undefined,
    );
    expect(reorderTweens).toHaveLength(3);
    expect(reorderTweens[0].ease).toBe('Quad.easeOut');
    // Simulated completion lands every sprite on its new slot.
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([344, 400, 456]);
    view.destroy();
  });

  it('plays the card-swap SFX through the injected SoundManager', () => {
    const soundManager = { play: vi.fn() } as any;
    const view = makeView(scene, { reorderEnabled: true, soundManager });
    view.setCards(hand());
    view.setDragEnabled(true);

    drag(view, scene, 0, 600);

    expect(soundManager.play).toHaveBeenCalledTimes(1);
    expect(soundManager.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.CARD_SWAP);
    view.destroy();
  });

  it('reorders without a SoundManager wired', () => {
    const view = makeView(scene, { reorderEnabled: true });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    expect(() => drag(view, scene, 2, 300)).not.toThrow();
    expect(labels(view.getCards())).toEqual(labels([cards[2], cards[0], cards[1]]));
    view.destroy();
  });

  it('keeps the selection on the moved card', () => {
    const view = makeView(scene, { reorderEnabled: true });
    view.setCards(hand());
    view.setDragEnabled(true);
    view.setSelected(0);

    drag(view, scene, 0, 600);

    expect(view.getSelected()).toBe(2);
    view.destroy();
  });

  it('emits dragend flagged as reordered (not a rejected pile drop)', () => {
    const view = makeView(scene, { reorderEnabled: true });
    view.setCards(hand());
    view.setDragEnabled(true);

    const ends: any[] = [];
    view.on('dragend', (p: any) => ends.push(p));

    drag(view, scene, 0, 600);

    expect(ends).toHaveLength(1);
    expect(ends[0].reordered).toBe(true);
    expect(ends[0].targetPileIndex).toBeNull();
    expect(ends[0].accepted).toBe(false);
    view.destroy();
  });

  it('keeps the selection raise on the moved card', () => {
    const view = makeView(scene, {
      reorderEnabled: true,
      showLabels: false,
      maxRotationDegrees: 0,
      selectionLift: 60,
    });
    view.setCards(hand());
    view.setDragEnabled(true);
    view.setSelected(0);

    drag(view, scene, 0, 600);

    const target = view.getSpriteAt(2) as any;
    // Raised 60px above its new slot (row y = 500) — not dropped back down.
    expect(Math.round(target.x)).toBe(456);
    expect(Math.round(target.y)).toBe(440);
    view.destroy();
  });

  it('reorders custom-rendered (renderCard) hands', () => {
    const view = makeView(scene, {
      reorderEnabled: true,
      renderCard: () => (scene as any).add.container(0, 0),
    });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);

    drag(view, scene, 0, 600);

    expect(labels(view.getCards())).toEqual(labels([cards[1], cards[2], cards[0]]));
    expect(view.getCardCenters().map((p) => Math.round(p.x))).toEqual([344, 400, 456]);
    view.destroy();
  });
});

describe('HandView reorder — precedence and non-reorder drags', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('lets a pile target take precedence over reordering', () => {
    const view = makeView(scene, { reorderEnabled: true });
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);
    const validator = vi.fn().mockReturnValue(true);
    view.setDragValidator(validator);

    const reordered = vi.fn();
    const ends: any[] = [];
    view.on('cardreorder', reordered);
    view.on('dragend', (p: any) => ends.push(p));

    const centre = view.getCardCenters()[0];
    pointerDown(view, 0);
    scene.input.emit('pointermove', { x: centre.x + 10, y: centre.y });
    // Over a pile: the scene reports a drop target for this move.
    view.setDragTargetPileIndex(1);
    scene.input.emit('pointermove', { x: 600, y: centre.y });
    scene.input.emit('pointerup', { x: 600, y: centre.y });

    expect(reordered).not.toHaveBeenCalled();
    expect(labels(view.getCards())).toEqual(labels(cards));
    expect(validator).toHaveBeenCalledWith({ from: 0, to: 0 }, 1);
    expect(ends[0]).toMatchObject({ targetPileIndex: 1, accepted: true });
    expect(ends[0].reordered).toBeUndefined();
    view.destroy();
  });

  it('accepts no pile target when reordering is off (existing snap-back path)', () => {
    const view = makeView(scene);
    const cards = hand();
    view.setCards(cards);
    view.setDragEnabled(true);
    const validator = vi.fn().mockReturnValue(false);
    view.setDragValidator(validator);

    const ends: any[] = [];
    view.on('dragend', (p: any) => ends.push(p));

    drag(view, scene, 0, 600);

    expect(validator).not.toHaveBeenCalled();
    expect(ends[0]).toMatchObject({ targetPileIndex: null, accepted: false });
    // A normal (non-reorder) drag keeps the original payload shape.
    expect(ends[0].reordered).toBeUndefined();
    expect(labels(view.getCards())).toEqual(labels(cards));
    view.destroy();
  });

  it('does not reorder when the pointer is released outside the row band', () => {
    const view = makeView(scene, { reorderEnabled: true });
    view.setCards(hand());
    view.setDragEnabled(true);
    const reordered = vi.fn();
    view.on('cardreorder', reordered);

    // 500 is the row centre; 200 is far above it (over a pile area).
    drag(view, scene, 0, 600, 200);

    expect(reordered).not.toHaveBeenCalled();
    view.destroy();
  });

  it('does not reorder in vertical cascade layout', () => {
    const view = makeView(scene, {
      reorderEnabled: true,
      layoutDirection: 'vertical',
      baseX: 300,
      baseY: 200,
      spacing: 42,
    });
    view.setCards(hand());
    view.setDragEnabled(true);
    const reordered = vi.fn();
    view.on('cardreorder', reordered);

    // Cascade drags pick up a multi-card range; reordering stays disabled.
    pointerDown(view, 2);
    scene.input.emit('pointermove', { x: 310, y: 210 });
    scene.input.emit('pointermove', { x: 310, y: 400 });
    scene.input.emit('pointerup', { x: 310, y: 400 });

    expect(reordered).not.toHaveBeenCalled();
    view.destroy();
  });
});

describe('HandView reorder — insertion affordance', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('shows a marker at the target slot during the drag and clears it on release', () => {
    const view = makeView(scene, { reorderEnabled: true });
    view.setCards(hand());
    view.setDragEnabled(true);

    const centre = view.getCardCenters()[0];
    pointerDown(view, 0);
    scene.input.emit('pointermove', { x: centre.x + 10, y: centre.y });
    scene.input.emit('pointermove', { x: 600, y: centre.y });

    const markers = reorderMarkers(scene);
    expect(markers).toHaveLength(1);
    expect(Math.round(markers[0].x)).toBe(456); // target = last slot centre
    expect(markers[0].height).toBe(CARD_HEIGHT);
    expect(markers[0].depth).toBe(view.getSprites().length + 1);
    expect(view.getReorderInsertionIndex()).toBe(2);

    scene.input.emit('pointerup', { x: 600, y: centre.y });
    expect(reorderMarkers(scene)).toHaveLength(0);
    expect(view.getReorderInsertionIndex()).toBeNull();
    view.destroy();
  });

  it('shows no marker while the target is the card`s own slot', () => {
    const view = makeView(scene, { reorderEnabled: true });
    view.setCards(hand());
    view.setDragEnabled(true);

    const centre = view.getCardCenters()[1];
    pointerDown(view, 1);
    scene.input.emit('pointermove', { x: centre.x + 10, y: centre.y });

    expect(reorderMarkers(scene)).toHaveLength(0);
    expect(view.getReorderInsertionIndex()).toBeNull();
    scene.input.emit('pointerup', { x: centre.x + 10, y: centre.y });
    view.destroy();
  });

  it('shows no marker when reorder is disabled', () => {
    const view = makeView(scene);
    view.setCards(hand());
    view.setDragEnabled(true);

    const centre = view.getCardCenters()[0];
    pointerDown(view, 0);
    scene.input.emit('pointermove', { x: centre.x + 10, y: centre.y });
    scene.input.emit('pointermove', { x: 600, y: centre.y });

    expect(reorderMarkers(scene)).toHaveLength(0);
    scene.input.emit('pointerup', { x: 600, y: centre.y });
    view.destroy();
  });
});
