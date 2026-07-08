import { describe, it, expect, beforeEach } from 'vitest';
import { HandView } from '../../src/ui/HandView';
import { createCard } from '../../src/card-system/Card';

// Minimal mock scene sufficient for HandView layout tests
function createMockScene(): any {
  const images: any[] = [];
  const texts: any[] = [];

  const mockImage = (x: number, y: number, texture: string) => {
    const img: any = {
      x,
      y,
      texture: { key: texture },
      setInteractive: () => img,
      setTint: () => img,
      clearTint: () => img,
      setOrigin: () => img,
      setAlpha: () => img,
      on: () => img,
      off: () => img,
      destroy: () => {},
      active: true,
      displayWidth: 48,
      displayHeight: 65,
    };
    images.push(img);
    return img;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const t: any = {
      x,
      y,
      text,
      setOrigin: () => t,
      setColor: () => t,
      setText: (s: string) => { t.text = s; },
      destroy: () => {},
      active: true,
    };
    texts.push(t);
    return t;
  };

  return {
    add: {
      image: mockImage,
      text: mockText,
      graphics: () => ({ fillStyle: () => null, fillRoundedRect: () => null, lineStyle: () => null, strokeRoundedRect: () => null, clear: () => null, destroy: () => null }),
    },
    tweens: { add: () => ({ stop: () => {} }) },
    events: { once: () => {}, on: () => {}, off: () => {} },
    time: { delayedCall: () => {} },
    _images: images,
    _texts: texts,
  };
}

function card(rank: string, suit: string) {
  return createCard(rank as any, suit as any, true);
}

describe('HandView spacing', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('getSpacing/setSpacing updates layout and allows overlap when spacing < cardWidth', () => {
    const hv = new HandView(scene, { baseX: 0, baseY: 100, spacing: 56, cardWidth: 48 });

    const cards = [card('A', 'spades'), card('2', 'hearts'), card('3', 'clubs')];
    hv.setCards(cards);

    const centersBefore = hv.getCardCenters();
    expect(centersBefore.length).toBe(3);
    // default spacing should be respected in initial layout
    const stepBefore = Math.round(centersBefore[1].x - centersBefore[0].x);
    expect(stepBefore).toBe(56);

    // Set a tighter spacing that is less than cardWidth (overlap expected)
    hv.setSpacing(40);
    expect(hv.getSpacing()).toBe(40);

    const centersAfter = hv.getCardCenters();
    const stepAfter = Math.round(centersAfter[1].x - centersAfter[0].x);
    expect(stepAfter).toBe(40);
    // Overlap: spacing < card width
    expect(stepAfter).toBeLessThan(48);

    hv.destroy();
  });
});
