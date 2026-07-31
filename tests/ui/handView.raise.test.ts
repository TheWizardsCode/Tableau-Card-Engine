import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import { createCard } from '../../src/card-system/Card';
import type { Card } from '../../src/card-system/Card';

// ── Minimal Phaser mock ─────────────────────────────────────
// HandView uses scene.add.image(), scene.add.text(), scene.add.rectangle(),
// scene.tweens (add + killTweensOf), scene.events and scene.input.

function createMockScene(): any {
  const tweens: any[] = [];
  const images: any[] = [];
  const texts: any[] = [];
  const rectangles: any[] = [];
  const inputHandlers: Record<string, any[]> = {};

  const mockImage = (x: number, y: number, _texture: string) => {
    const img: any = {
      x,
      y,
      rotation: 0,
      active: true,
      setInteractive: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setOrigin: vi.fn().mockReturnThis(),
      setAlpha: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
      displayWidth: 48,
      displayHeight: 65,
    };
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const txt: any = {
      x,
      y,
      text,
      active: true,
      setOrigin: vi.fn().mockReturnThis(),
      setTint: vi.fn().mockReturnThis(),
      clearTint: vi.fn().mockReturnThis(),
      setColor: vi.fn().mockReturnThis(),
      destroy: vi.fn(),
    };
    texts.push(txt);
    return txt;
  };

  return {
    add: {
      image: vi.fn().mockImplementation(mockImage),
      text: vi.fn().mockImplementation(mockText),
      graphics: vi.fn().mockReturnValue({
        fillStyle: vi.fn().mockReturnThis(),
        fillRoundedRect: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        strokeRoundedRect: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      }),
      rectangle: vi.fn().mockImplementation((x: number, y: number, w: number, h: number, color: number) => {
        const rect: any = {
          x,
          y,
          width: w,
          height: h,
          color,
          fillColor: color,
          fillAlpha: 0.35,
          active: true,
          setPosition: vi.fn().mockReturnThis(),
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn().mockReturnThis(),
          setAlpha: vi.fn().mockReturnThis(),
          setRotation: vi.fn().mockReturnThis(),
          setFillStyle: vi.fn().mockImplementation((c: number, a?: number) => {
            rect.fillColor = c;
            rect.color = c;
            rect.fillAlpha = a ?? rect.fillAlpha;
            return rect;
          }),
          destroy: vi.fn().mockImplementation(() => {
            rect.active = false;
          }),
        };
        rectangles.push(rect);
        return rect;
      }),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        tweens.push(config);
        return { stop: vi.fn() };
      }),
      killTweensOf: vi.fn(),
    },
    input: {
      on: vi.fn((event: string, handler: any) => {
        if (!inputHandlers[event]) inputHandlers[event] = [];
        inputHandlers[event].push(handler);
      }),
      off: vi.fn(),
    },
    events: { once: vi.fn(), on: vi.fn(), off: vi.fn() },
    time: { delayedCall: vi.fn() },
    _images: images,
    _texts: texts,
    _rectangles: rectangles,
    _tweens: tweens,
    _inputHandlers: inputHandlers,
  };
}

function card(rank: string, suit: string): Card {
  return createCard(rank as any, suit as any, true);
}

/** Invoke the pointerdown handler registered on a sprite. */
function triggerPointerDown(scene: any, spriteIndex: number, pointerX: number, pointerY: number): void {
  const sprite = scene._images[spriteIndex];
  expect(sprite).toBeDefined();
  const onCalls = sprite.on.mock.calls;
  const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
  expect(pointerdownCall).toBeDefined();
  pointerdownCall[1]({ x: pointerX, y: pointerY });
}

/** Retrieve a scene input handler by event name. */
function getInputHandler(scene: any, event: string): any {
  const handlers = scene._inputHandlers[event];
  expect(handlers).toBeDefined();
  return handlers[handlers.length - 1];
}

// ── Tests ───────────────────────────────────────────────────

describe('HandView selection raise (selectionLift)', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('defaults selectionLift to 0 — selecting does not move cards (backward compatible)', () => {
    const hv = new HandView(scene, { baseX: 100, baseY: 200, spacing: 56 });
    expect(hv.getSelectionLift()).toBe(0);

    hv.setCards([card('A', 'spades'), card('2', 'hearts')]);
    hv.setSelected(0);

    // No positional change with the default lift of 0
    expect(scene._images[0].x).toBe(72);
    expect(scene._images[0].y).toBe(200);
    hv.destroy();
  });

  it('setSelectionLift stores the distance and clamps invalid values to 0', () => {
    const hv = new HandView(scene, { baseX: 100, baseY: 200, spacing: 56 });
    hv.setSelectionLift(-10);
    expect(hv.getSelectionLift()).toBe(0);
    hv.setSelectionLift(NaN);
    expect(hv.getSelectionLift()).toBe(0);
    hv.setSelectionLift(Infinity);
    expect(hv.getSelectionLift()).toBe(0);
    hv.setSelectionLift(25);
    expect(hv.getSelectionLift()).toBe(25);
    hv.destroy();
  });

  it('horizontal layout: selected card raises straight up at 0° rotation (dx=0, dy=−d)', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);
    hv.setSelected(0);

    const sprite = scene._images[0];
    expect(sprite.x).toBe(100);
    expect(sprite.y).toBe(180); // 200 − 20
    hv.destroy();
  });

  it('horizontal layout: raise follows the card rotation (dx=d·sin θ, dy=−d·cos θ)', () => {
    const hv = new HandView(scene, {
      baseX: 300,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
      maxRotationDegrees: 25,
    });
    hv.setSelectionLift(20);

    // 5 cards centred on baseX — edge cards receive ±25° rotation
    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    // Select card 0 — the raise follows its −25° rotation
    hv.setSelected(0);

    // Card 0 sits at baseX − 2·spacing = 188 and is rotated −25°
    const sprite = scene._images[0];
    const rot = (-25 * Math.PI) / 180;
    expect(sprite.rotation).toBeCloseTo(rot, 5);
    expect(sprite.x).toBeCloseTo(188 + 20 * Math.sin(rot), 5);
    expect(sprite.y).toBeCloseTo(200 - 20 * Math.cos(rot), 5);

    // Unselected cards are NOT offset
    expect(scene._images[2].x).toBe(300);
    expect(scene._images[2].y).toBe(200);
    hv.destroy();
  });

  it('vertical layout: selected card(s) shift right by d (dx=+d, dy=0)', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      layoutDirection: 'vertical',
      reducedMotion: true,
    });
    hv.setSelectionLift(15);
    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Cascade selection: index 1 selects cards [0..1]
    hv.setSelected(1);

    expect(scene._images[0].x).toBe(215);
    expect(scene._images[0].y).toBe(100);
    expect(scene._images[1].x).toBe(215);
    expect(scene._images[1].y).toBe(150);

    // Unselected card below the cascade range is not shifted
    expect(scene._images[2].x).toBe(200);
    expect(scene._images[2].y).toBe(200);
    hv.destroy();
  });

  it('getBasePosition returns the un-raised resting position even while selected', () => {
    const hv = new HandView(scene, {
      baseX: 300,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
      maxRotationDegrees: 25,
    });
    hv.setSelectionLift(20);
    hv.setCards([
      card('A', 'spades'),
      card('2', 'hearts'),
      card('3', 'clubs'),
      card('4', 'diamonds'),
      card('5', 'spades'),
    ]);

    // Select card 0 — the raised sprite position differs from the base position
    hv.setSelected(0);
    const sprite = scene._images[0];
    const rot = (-25 * Math.PI) / 180;
    expect(sprite.x).toBeCloseTo(188 + 20 * Math.sin(rot), 5); // raised
    expect(sprite.y).toBeCloseTo(200 - 20 * Math.cos(rot), 5);

    // Base position is the resting spot WITHOUT the selection raise —
    // callers restoring a moved card (e.g. Cancel Move) must use this,
    // not the sprite's current x/y which includes the raise offset.
    expect(hv.getBasePosition(0)).toEqual({ x: 188, y: 200 });
    expect(hv.getBasePosition(1)).toEqual({ x: 244, y: 200 });
    expect(hv.getBasePosition(2)).toEqual({ x: 300, y: 200 });
    expect(hv.getBasePosition(4)).toEqual({ x: 412, y: 200 });
    expect(hv.getBasePosition(99)).toBeUndefined();
    hv.destroy();
  });

  it('clearing the selection returns the card to its resting position', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);
    expect(scene._images[0].y).toBe(180);

    hv.setSelected(null);
    expect(scene._images[0].y).toBe(200);
    hv.destroy();
  });

  it('setSelectionLift(0) removes the raise live', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);
    expect(scene._images[0].y).toBe(180);

    hv.setSelectionLift(0);
    expect(scene._images[0].y).toBe(200);
    hv.destroy();
  });

  it('animated path: selection change tweens the sprite to the raised target', () => {
    const hv = new HandView(scene, { baseX: 100, baseY: 200, spacing: 56 });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);

    expect(scene._tweens.length).toBeGreaterThan(0);
    const tween = scene._tweens[scene._tweens.length - 1];
    expect(tween.targets).toContain(scene._images[0]);
    expect(tween.y).toBeCloseTo(180, 5);
    expect(tween.duration).toBeLessThanOrEqual(300); // short raise tween
    hv.destroy();
  });

  it('reduced-motion: raise applies instantly with no tween', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);

    expect(scene._tweens.length).toBe(0);
    expect(scene._images[0].y).toBe(180);
    hv.destroy();
  });

  it('tint overlay stays aligned with the raised sprite', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);

    const sprite = scene._images[0];
    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();
    expect(overlay.x).toBe(sprite.x);
    expect(overlay.y).toBe(sprite.y);
    hv.destroy();
  });

  it('animated path: first-selection highlight overlay rides the raise tween with the sprite', () => {
    const hv = new HandView(scene, { baseX: 100, baseY: 200, spacing: 56 });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);

    // The highlight overlay must be created BEFORE the raise tween starts
    // so it is included in the tween targets and raises with the card — a
    // card must never rise away from its selection highlight.
    const overlay = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlay).toBeDefined();
    const tween = scene._tweens[scene._tweens.length - 1];
    expect(tween.targets).toContain(overlay);
    expect(tween.y).toBeCloseTo(180, 5);
    hv.destroy();
  });

  it('hover repaint reuses the highlight overlay instead of recreating it (no orphaning mid-raise)', () => {
    const hv = new HandView(scene, { baseX: 100, baseY: 200, spacing: 56 });
    hv.setSelectionLift(20);
    hv.setCards([card('A', 'spades')]);

    hv.setSelected(0);
    const overlayBefore = scene._rectangles.find((r: any) => r.active && r.color === 0x88ff88);
    expect(overlayBefore).toBeDefined();

    // Hover the selected card while the raise tween is in flight: the tint
    // must be repainted IN PLACE so the raise tween keeps moving the same
    // overlay object. Destroying + recreating would leave the new overlay
    // orphaned at the resting position while the card continues to rise.
    const sprite = scene._images[0];
    const pointeroverCall = sprite.on.mock.calls.find((c: any[]) => c[0] === 'pointerover');
    expect(pointeroverCall).toBeDefined();
    pointeroverCall[1]();

    const overlayAfter = scene._rectangles.find((r: any) => r.active && r.fillColor === 0x66ff66);
    expect(overlayAfter).toBe(overlayBefore);
    expect(scene._rectangles.filter((r: any) => r.active).length).toBe(1);
    hv.destroy();
  });

  it('vertical cascade: first-selection overlays raise with their cards', () => {
    const hv = new HandView(scene, {
      baseX: 200,
      baseY: 100,
      spacing: 50,
      layoutDirection: 'vertical',
      reducedMotion: true,
    });
    hv.setSelectionLift(15);
    hv.setCards([card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')]);

    // Cascade selection: index 1 selects cards [0..1], both shift right by 15
    hv.setSelected(1);

    const overlays = scene._rectangles.filter((r: any) => r.active && r.color === 0x88ff88);
    expect(overlays.length).toBe(2);
    for (let i = 0; i < 2; i++) {
      expect(overlays[i].x).toBe(scene._images[i].x);
      expect(overlays[i].y).toBe(scene._images[i].y);
    }
    hv.destroy();
  });


  it('drag lift composes with the selection raise (no stale offsets after a rejected drag)', () => {
    const hv = new HandView(scene, {
      baseX: 100,
      baseY: 200,
      spacing: 56,
      reducedMotion: true,
    });
    hv.setSelectionLift(20);
    hv.setDragEnabled(true);
    hv.setCards([card('A', 'spades')]);
    const sprite = scene._images[0];

    // Click to select — raise applies instantly (reduced motion)
    triggerPointerDown(scene, 0, 100, 100);
    expect(sprite.y).toBe(180); // raised 20px

    // Drag beyond the threshold: raised origin + drag lift (−8) + pointer delta
    const pointerMove = getInputHandler(scene, 'pointermove');
    pointerMove({ x: 130, y: 150 });
    expect(sprite.x).toBe(130); // 100 + dx(30)
    expect(sprite.y).toBe(222); // 180 − 8 lift + dy(50)

    // Rejected drop (no validator) → snap back to the raised resting position
    const pointerUp = getInputHandler(scene, 'pointerup');
    pointerUp();
    expect(sprite.x).toBe(100);
    expect(sprite.y).toBe(180);

    // Tint is still applied to the selected card after the drag ends
    const lastTintCall = sprite.setTint.mock.calls.slice(-1)[0];
    expect(lastTintCall).toEqual([0x88ff88]);

    hv.destroy();
  });
});
