/**
 * Unit tests for x100 economy presentation scaling (CG-0MTK2JHXD004KNQI).
 *
 * 1 coin icon + 1 COIN_POP SFX per 100 integer coins (COINS_PER_ICON).
 * iconsForAmount is the single source; the animator's countOutCoins /
 * flyCoinsIn / flyCoinsOut all delegate through it. Totals/labels stay
 * truthful (integration covered by phase-data tests). Pack overflow is
 * not regressed by the smaller icon counts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { COINS_PER_ICON, iconsForAmount, packCoins } from '../../example-games/main-street/coin-grid';

vi.mock('phaser', () => ({ default: {} }));
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn(() => Promise.resolve()),
  moveGameObject: vi.fn(() => ({})),
}));
vi.mock('../../src/ui', () => ({ FONT_FAMILY: 'sans-serif', popTextOrIcon, moveGameObject }));
import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';

describe('iconsForAmount (CG-0MTK2JHXD004KNQI)', () => {
  it('exposes the divisor', () => { expect(COINS_PER_ICON).toBe(100); });
  it('maps 0 and negatives to 0 (no-op)', () => {
    expect(iconsForAmount(0)).toBe(0);
    expect(iconsForAmount(-5)).toBe(0);
    expect(iconsForAmount(-0.4)).toBe(0);
  });
  it('clamps small positives (<100) to at least 1 icon', () => {
    expect(iconsForAmount(1)).toBe(1);
    expect(iconsForAmount(40)).toBe(1);
    expect(iconsForAmount(50)).toBe(1);
    expect(iconsForAmount(99)).toBe(1);
  });
  it('scales with the divisor (examples from the brief)', () => {
    expect(iconsForAmount(100)).toBe(1);
    expect(iconsForAmount(149)).toBe(1);
    expect(iconsForAmount(150)).toBe(2);
    expect(iconsForAmount(230)).toBe(2);
    expect(iconsForAmount(250)).toBe(3);
    expect(iconsForAmount(300)).toBe(3);
    expect(iconsForAmount(1000)).toBe(10);
  });
});

describe('x100 VFX/SFX scaling via the animator', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockSlotWithDisplay(displayed: number) {
    const images: any[] = [];
    const container: any = {
      list: images,
      getWorldTransformMatrix: () => ({ getX: () => 320, getY: () => 240 } as any),
    };
    const handle: any = {
      container,
      addCoins: vi.fn((count: number) => {
        // Simulate packCoins-backed placement so revealInGrid finds a last icon.
        const lay = packCoins(count, 70, 40);
        images.length = 0;
        for (let i = 0; i < lay.iconCount; i++) images.push({ setScale: vi.fn(), scaleX: 1, scaleY: 1 });
        return lay;
      }),
    };
    return { displayed, handle, container };
  }

  function makeAnimator() {
    const scheduled: Array<{ delay: number; fn: () => void }> = [];
    const scene: any = {
      layout: { gameW: 1280, hudY: 50, handX: 20, handCardW: 140, handCardH: 80, handY: 600, streetTop: 120, streetX: 20, slotW: 140, slotH: 80, slotGap: 20, streetRowGap: 12, streetCols: 5, logX: 900, queueTop: 140, queueCardW: 120, queueCardH: 69 },
      settingsPanel: null, replayMode: false, incomeCollectionActive: false,
      state: { activeEffects: [], streetGrid: [], soldSlots: [] },
      soundManager: { play: vi.fn() },
      tweens: { add: vi.fn() },
      time: { delayedCall: vi.fn((delay: number, fn: () => void) => { scheduled.push({ delay, fn }); return {} as any; }), now: 0 },
      add: { text: vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis() } as any)), circle: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis() } as any)), container: vi.fn(() => ({ list: [] } as any)), graphics: vi.fn(() => ({ fillStyle: vi.fn().mockReturnThis(), fillCircle: vi.fn().mockReturnThis(), generateTexture: vi.fn(), clear: vi.fn(), destroy: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fillPath: vi.fn() } as any)), rectangle: vi.fn(() => ({ setDepth: vi.fn().mockReturnThis() } as any)), image: vi.fn((x: number, y: number) => ({ x, y, setOrigin: vi.fn().mockReturnThis(), setDisplaySize: vi.fn().mockReturnThis(), setScale: vi.fn().mockReturnThis() } as any)) },
      textures: { exists: vi.fn(() => true), get: vi.fn() },
      streetContainer: { list: [] as any[] }, msRenderer: {},
    };
    const animator = new MainStreetAnimator(scene);
    return { scene, scheduled, animator };
  }

  it('countOutCoins 230 → 2 reveals with 2 SFX (not 230)', () => {
    const { scene, scheduled, animator } = makeAnimator();
    const slot: any = { pd: { baseIncome: 230, slotIndex: 0 } as any, card: {}, handle: mockSlotWithDisplay(0).handle, displayed: 0 };
    (animator as any).countOutCoins(slot, 230, 0);
    expect(scheduled).toHaveLength(2);
    for (const { fn } of [...scheduled]) fn();
    expect(scene.soundManager.play).toHaveBeenCalledTimes(2);
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.COIN_POP);
    // The grid was re-packed with scaled counts (1 then 2), not 230.
    expect(slot.handle.addCoins).toHaveBeenCalledTimes(2);
    expect(slot.handle.addCoins).toHaveBeenNthCalledWith(1, 1);
    expect(slot.handle.addCoins).toHaveBeenNthCalledWith(2, 2);
  });

  it('countOutCoins 0 → 0 reveals/0 SFX; 50 → 1 reveal/1 SFX (clamp)', () => {
    const probe = (amount: number) => {
      vi.clearAllMocks();
      const { scene, scheduled, animator } = makeAnimator();
      const slot: any = { pd: { baseIncome: amount, slotIndex: 0 } as any, card: {}, handle: mockSlotWithDisplay(0).handle, displayed: 0 };
      (animator as any).countOutCoins(slot, amount, 0);
      for (const { fn } of [...scheduled]) fn();
      return (scene.soundManager.play as any).mock.calls.length;
    };
    expect(probe(0)).toBe(0);
    expect(probe(50)).toBe(1);
  });

  it('flyCoinsIn 230 → 2 flights with 2 COIN_POP SFX', () => {
    const { scheduled, animator } = makeAnimator();
    const slot: any = { pd: { slotIndex: 0 } as any, card: {}, handle: mockSlotWithDisplay(0).handle, displayed: 0 };
    const from = { x: 100, y: 100 };
    (animator as any).flyCoinsIn(slot, 230, from, 0);
    expect(scheduled).toHaveLength(2);
    // Each flight's SFX is wired via moveGameObject's sfx.start
    for (const { fn } of [...scheduled]) fn();
    const sfxStarts = (moveGameObject as any).mock.calls.map((c: any) => c[0]?.sfx?.start);
    expect(sfxStarts.every((k: string) => k === SFX_KEYS.COIN_POP)).toBe(true);
    expect(sfxStarts).toHaveLength(2);
  });

  it('pack overflow not regressed by smaller icon counts (230→2 fits, bound respected)', () => {
    const lay = packCoins(iconsForAmount(230), 70, 40);
    expect(lay.iconCount).toBe(2);
    expect(lay.shrinkApplied).toBe(false);
    for (const p of lay.placements) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(35 + 1e-6);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(20 + 1e-6);
    }
  });
});
