/**
 * Main Street: Staff underlay + tooltip enumeration (browser)
 * (CG-0MU3BTTCH001E7ZD, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Verifies, in a real Phaser scene:
 *  - AC1: a business slot with employed staff renders a count badge (a
 *    `staffCountBadge`-tagged text showing the member count).
 *  - AC2/AC3: hovering the slot shows a tooltip that aggregates the
 *    business's own info with the employed-staff enumeration (names, served
 *    business types).
 *  - AC5: a slot with no employed staff shows NO badge and the tooltip
 *    carries no 'Employed staff' section.
 *
 * Uses reduced-motion so refresh/animations resolve instantly.
 *
 * @module tests/main-street/staff-underlay-rendering.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { createStaffDeck } from '../../example-games/main-street/MainStreetCards';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';

async function bootGame(options: { width?: number; height?: number } = {}): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame(options);
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) {
    game.destroy(true, false);
  }
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

/** Recursively collects texts carrying a `staffCountBadge` data key. */
function countBadgeTexts(scene: Phaser.Scene & Record<string, any>): Phaser.GameObjects.Text[] {
  const found: Phaser.GameObjects.Text[] = [];
  const walk = (obj: Phaser.GameObjects.GameObject): void => {
    if (obj instanceof Phaser.GameObjects.Text && obj.getData('staffCountBadge') === true) {
      found.push(obj);
    }
    if (obj instanceof Phaser.GameObjects.Container) {
      for (const child of obj.list) walk(child);
    }
  };
  for (const obj of scene.streetContainer.list) walk(obj);
  return found;
}

describe('Main Street staff underlay + tooltip (browser)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    const moduleUrl = (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    if (typeof moduleUrl === 'string' && moduleUrl.startsWith('blob:')) {
      URL.revokeObjectURL(moduleUrl);
    }
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE__;
    delete (globalThis as unknown as Record<string, unknown>).__MAIN_STREET_TF_MODULE_URL__;
    delete (globalThis as unknown as Record<string, unknown>).__TF_PLAY_COUNT__;
    destroyGame(game);
    game = null;
  });

  it('renders a staff-count badge and an enumerating tooltip for an employed slot (AC1/AC2/AC3)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };

    // A business at slot 0 with one employed specialist (Chef).
    const chef = createStaffDeck(1).find((c: { id: string }) => c.id.startsWith('staff-chef'))!;
    const biz: BusinessCard = {
      family: 'business',
      id: 'biz-underlay-0',
      name: 'The Corner Bakery',
      cost: 3,
      baseIncome: 2,
      synergyTypes: ['Food'],
      maxLevel: 0,
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      description: 'Fresh bread.',
      ongoingCost: 0,
      employedStaff: [chef],
    };
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 1000;
    scene.refreshAll();

    // AC1: count badge rendered with the member count.
    const badges = countBadgeTexts(scene);
    expect(badges.length).toBe(1);
    expect(badges[0]!.text).toBe('1');

    // AC2/AC3: hovering the slot shows the aggregated tooltip with the
    // staff enumeration. Emit across the street's interactive zones and
    // assert the slot-0 business tooltip (with staff) was shown.
    const showSpy = vi.spyOn(scene.tooltipManager, 'show');
    const zones = scene.streetContainer.list.filter((o: Phaser.GameObjects.GameObject) =>
      o instanceof Phaser.GameObjects.Zone && o.input?.enabled,
    ) as Phaser.GameObjects.Zone[];
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) z.emit('pointerover');

    expect(showSpy).toHaveBeenCalled();
    const contents = showSpy.mock.calls.map((c) => c[0] as string);
    const staffTooltip = contents.find((c) => c.includes('Business: The Corner Bakery'));
    expect(staffTooltip).toBeDefined();
    expect(staffTooltip!).toContain('Employed staff (1):');
    expect(staffTooltip!).toContain('Chef');
    showSpy.mockRestore();
  });

  it('renders no badge and a staff-free tooltip for an unstaffed slot (AC5)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };

    const biz: BusinessCard = {
      family: 'business',
      id: 'biz-underlay-empty',
      name: 'Empty Bakery',
      cost: 3,
      baseIncome: 2,
      synergyTypes: ['Food'],
      maxLevel: 0,
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      description: 'No staff yet.',
      ongoingCost: 0,
      employedStaff: [],
    };
    state.streetGrid[0] = biz;
    state.resourceBank.coins = 1000;
    scene.refreshAll();

    expect(countBadgeTexts(scene)).toHaveLength(0);

    const showSpy = vi.spyOn(scene.tooltipManager, 'show');
    const zones = scene.streetContainer.list.filter((o: Phaser.GameObjects.GameObject) =>
      o instanceof Phaser.GameObjects.Zone && o.input?.enabled,
    ) as Phaser.GameObjects.Zone[];
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) z.emit('pointerover');
    expect(showSpy).toHaveBeenCalled();
    const contents = showSpy.mock.calls.map((c) => c[0] as string);
    const bizTooltip = contents.find((c) => c.includes('Business: Empty Bakery'));
    expect(bizTooltip).toBeDefined();
    expect(bizTooltip!).not.toContain('Employed staff');
    showSpy.mockRestore();
  });
});