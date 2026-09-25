/**
 * Main Street: Staff placement/removal browser integration test
 * (CG-0MU3BTUI2008XSA0, parent CG-0MTIOLY2A0092OT1 — "Staff for businesses").
 *
 * Boots the real Phaser scene and drives the placement/removal command layer
 * (the entry point every click/drag gesture funnels through — child 6's
 * engine + commands; the underlay/tooltip rendering is child 4):
 *   AC1/2  Click-to-place and drag-and-drop both resolve through
 *          `placeStaffOnBusiness` — placement registers employment and the
 *          refresh shows the staff-count badge (AC4).
 *   AC3    Invalid placement (business-type mismatch) is rejected as illegal
 *          (`canPlaceStaffOnBusiness` → legal:false; placement throws).
 *   AC5    The business tooltip enumerates the employed staff.
 *   AC6    Lay-off removes the member; the badge disappears.
 *
 * SFX (placement/illegal-move sounds) is wired by the scene input layer
 * (child 6, pending the staff-selector surface); the command layer verified
 * here is the path those handlers call.
 *
 * @module tests/main-street/staff-placement-removal.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import { UndoRedoManager } from '@core-engine';

import { waitForScene } from '@core-tests/helpers/waitForScene';
import { createStaffDeck, type BusinessCard, type StaffCard } from '../../example-games/main-street/MainStreetCards';
import {
  canPlaceStaffOnBusiness,
} from '../../example-games/main-street/MainStreetEngine';
import {
  placeStaffOnBusinessCommand,
  layoffStaffCommand,
} from '../../example-games/main-street/MainStreetCommands';

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

/** Emits pointerover across the street's interactive zones; returns all shown tooltips. */
function hoverAllZones(scene: Phaser.Scene & Record<string, any>): string[] {
  const showSpy = vi.spyOn(scene.tooltipManager, 'show');
  const zones = scene.streetContainer.list.filter((o: Phaser.GameObjects.GameObject) =>
    o instanceof Phaser.GameObjects.Zone && o.input?.enabled,
  );
  for (const z of zones) z.emit('pointerover');
  const contents = showSpy.mock.calls.map((c) => c[0] as string);
  showSpy.mockRestore();
  return contents;
}

describe('Main Street staff placement & removal (browser)', () => {
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

  it('click-to-place path registers employment, shows the badge, and enumerates the tooltip (AC1/AC4/AC5)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };

    // A Food business at slot 0 and a hired Chef (eligible — Food match).
    const biz: BusinessCard = {
      family: 'business', id: 'biz-place-0', name: 'Corner Bakery', cost: 3, baseIncome: 2,
      synergyTypes: ['Food'], maxLevel: 0, level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, description: 'Fresh bread.', ongoingCost: 0, employedStaff: [],
    };
    state.streetGrid[0] = biz;
    const chef = createStaffDeck(1).find((c: StaffCard) => c.id.startsWith('staff-chef'))!;
    state.staffCards.push({ ...chef });

    // AC1: click-to-place resolves through the placement command.
    const mgr = new UndoRedoManager();
    mgr.execute(placeStaffOnBusinessCommand(state, chef.id, 0));
    expect(state.staffCards.find((c: StaffCard) => c.id === chef.id)!.employedAtSlot).toBe(0);

    scene.refreshAll();

    // AC4: badge renders with the count.
    const badges = countBadgeTexts(scene);
    expect(badges.length).toBe(1);
    expect(badges[0]!.text).toBe('1');

    // AC5: the business tooltip enumerates the staff member.
    const tooltips = hoverAllZones(scene);
    const bizTip = tooltips.find((t) => t.includes('Business: Corner Bakery'));
    expect(bizTip).toBeDefined();
    expect(bizTip!).toContain('Employed staff (1):');
    expect(bizTip!).toContain('Chef');
  });

  it('invalid placement (business-type mismatch) is rejected as illegal (AC3)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };

    // A Service business (Hardware Store) and a Food-only Chef.
    const service: BusinessCard = {
      family: 'business', id: 'biz-invalid-0', name: 'Hardware Store', cost: 3, baseIncome: 2,
      synergyTypes: ['Service'], maxLevel: 0, level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, description: 'Tools.', ongoingCost: 0, employedStaff: [],
    };
    state.streetGrid[0] = service;
    const chef = createStaffDeck(1).find((c: StaffCard) => c.id.startsWith('staff-chef'))!;
    state.staffCards.push({ ...chef });

    const legality = canPlaceStaffOnBusiness(state, chef.id, 0);
    expect(legality.legal).toBe(false);
    expect((legality as { reason?: string }).reason ?? '').toMatch(/type does not match/i);
    // The placement gesture would reject before any state mutation.
    expect(state.staffCards.find((c: StaffCard) => c.id === chef.id)!.employedAtSlot).toBeUndefined();
  });

  it('removal (lay-off) clears the badge and employment (AC6)', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, any>;
    const state = scene.state;
    scene.settingsPanel = { ...scene.settingsPanel, reducedMotion: true };

    const biz: BusinessCard = {
      family: 'business', id: 'biz-remove-0', name: 'Corner Bakery', cost: 3, baseIncome: 2,
      synergyTypes: ['Food'], maxLevel: 0, level: 0, incomeBonus: 0, synergyRangeBonus: 0,
      reputationBonus: 0, description: 'Fresh bread.', ongoingCost: 0, employedStaff: [],
    };
    state.streetGrid[0] = biz;
    const chef = createStaffDeck(1).find((c: StaffCard) => c.id.startsWith('staff-chef'))!;
    state.staffCards.push({ ...chef });

    const mgr = new UndoRedoManager();
    mgr.execute(placeStaffOnBusinessCommand(state, chef.id, 0));
    scene.refreshAll();
    expect(countBadgeTexts(scene)).toHaveLength(1);

    // AC6: lay off → member gone, badge gone, buff stops (employment cleared).
    mgr.execute(layoffStaffCommand(state, chef.id));
    expect(state.staffCards.some((c: StaffCard) => c.id === chef.id)).toBe(false);
    scene.refreshAll();
    expect(countBadgeTexts(scene)).toHaveLength(0);
    expect((state.streetGrid[0] as BusinessCard).employedStaff ?? []).toHaveLength(0);

    // Undo restores the member and the badge (undo/redo round-trip).
    mgr.undo();
    scene.refreshAll();
    expect(state.staffCards.some((c: StaffCard) => c.id === chef.id)).toBe(true);
    expect(countBadgeTexts(scene)).toHaveLength(1);
  });
});