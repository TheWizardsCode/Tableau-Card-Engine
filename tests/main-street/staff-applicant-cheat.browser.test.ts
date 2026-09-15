/**
 * Main Street: Staff Application cheat browser test (CG-0MTY9PB51008OG5A).
 *
 * Verifies the "Staff Application" toggle appears in Settings → Debug Tools,
 * opens the cheat overlay, renders the live chance, and toggles
 * `state.forcedStaffApplicant` on click.
 *
 * Runs in Vitest browser (Chromium) via the `browser` project.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { waitForScene } from '../helpers/waitForScene';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import(
    '../../example-games/main-street/createMainStreetGame'
  );
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  await waitFrames(20);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n;
    const tick = () => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function collectTextsRecursive(container: Phaser.GameObjects.Container): Phaser.GameObjects.Text[] {
  const out: Phaser.GameObjects.Text[] = [];
  const visit = (c: Phaser.GameObjects.Container) => {
    for (const child of c.list as Phaser.GameObjects.GameObject[]) {
      if (child instanceof Phaser.GameObjects.Text) out.push(child);
      else if (child instanceof Phaser.GameObjects.Container) visit(child as Phaser.GameObjects.Container);
    }
  };
  visit(container);
  return out;
}

function findTextByExact(container: Phaser.GameObjects.Container, text: string): Phaser.GameObjects.Text | undefined {
  return collectTextsRecursive(container).find((t) => t.text === text);
}

function findTextByPrefix(container: Phaser.GameObjects.Container, prefix: string): Phaser.GameObjects.Text | undefined {
  return collectTextsRecursive(container).find((t) => t.text.startsWith(prefix));
}

describe('Staff Application cheat browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('renders the debug toggle and flips forcedStaffApplicant on click', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    expect(scene).toBeDefined();
    expect(scene.state).toBeDefined();
    expect(scene.settingsPanel).toBeDefined();

    // Place a business so the computed chance is non-zero and deterministic.
    const biz = {
      family: 'business',
      id: 'cheat-browser-biz',
      name: 'Cheat Browser Biz',
      cost: 3,
      baseIncome: 4,
      synergyTypes: ['Food'],
      maxLevel: 4,
      description: 'test',
      level: 0,
      incomeBonus: 0,
      synergyRangeBonus: 0,
      reputationBonus: 0,
      ongoingCost: 0,
    };
    scene.state.streetGrid[0] = biz;

    // Open Settings panel (Debug Tools section is inside its scrollable container)
    scene.settingsPanel.open();
    await waitFrames(24);

    const settingsContainer: Phaser.GameObjects.Container = scene.settingsPanel['container'];
    expect(settingsContainer).toBeDefined();
    const label = findTextByExact(settingsContainer, 'Staff Application');
    expect(label).toBeDefined();
    expect(label!.input?.enabled).toBe(true);

    // Activate the tool
    label!.emit('pointerdown');
    await waitFrames(12);

    // Overlay status should render [OFF] and the live chance (4%).
    const hud: Phaser.GameObjects.Container | undefined = scene.hudContainer;
    expect(hud).toBeDefined();
    const statusOff = findTextByPrefix(hud!, 'Staff Application [OFF]');
    expect(statusOff).toBeDefined();
    expect(statusOff!.text).toContain('4%');

    const toggle = findTextByExact(hud!, '[  TOGGLE  ]');
    expect(toggle).toBeDefined();

    // Click to force ON
    toggle!.emit('pointerdown');
    await waitFrames(8);

    expect(scene.state.forcedStaffApplicant).toBe(true);
    const statusOn = findTextByPrefix(hud!, 'Staff Application [ON]');
    expect(statusOn).toBeDefined();
    expect(statusOn!.text).toContain('4%');

    // Click again to force OFF
    toggle!.emit('pointerdown');
    await waitFrames(8);

    expect(scene.state.forcedStaffApplicant).toBe(false);
    const statusOffAgain = findTextByPrefix(hud!, 'Staff Application [OFF]');
    expect(statusOffAgain).toBeDefined();
  }, 30_000);
});
