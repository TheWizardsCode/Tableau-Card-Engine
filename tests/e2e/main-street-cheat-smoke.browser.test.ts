/**
 * Main Street: Market Card Cheat browser smoke test (CG-0MTINKHUT009KHK5)
 *
 * Verifies the cheat opens from Settings → Debug Tools and a card
 * can be chosen by mouse, changing the 3-card market row.
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
  // Extra frames for HUD / renderer settle
  await waitFrames(20);
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  // Remove any lingering cheat filter input (DOM element outside Phaser)
  const input = document.querySelector('input[aria-label="Filter cards by title"]');
  if (input) input.remove();
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
  // Also clean up any stray overlay DOM from previous runs
  document.querySelectorAll('input[placeholder="Filter by title..."]').forEach((el) => el.remove());
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

describe('Market Card Cheat browser smoke', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('opens from Settings → Debug Tools and replaces a market card on mouse click', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as any;
    expect(scene).toBeDefined();
    expect(scene.state).toBeDefined();
    expect(scene.settingsPanel).toBeDefined();

    // Market starts with exactly 3 cards
    const beforeIds: string[] = scene.state.market.cards.map((c: any) => c.id);
    expect(beforeIds).toHaveLength(3);

    // Open Settings panel (Debug Tools section is inside its scrollable container)
    scene.settingsPanel.open();
    await waitFrames(24);

    // Locate the "Market Card Cheat" debug-tool label inside the settings container
    const settingsContainer: Phaser.GameObjects.Container = scene.settingsPanel['container'];
    expect(settingsContainer).toBeDefined();
    const label = findTextByExact(settingsContainer, 'Market Card Cheat');
    expect(label).toBeDefined();
    expect(label!.input?.enabled).toBe(true);

    // Activate the tool (pointerdown is what SettingsPanel wires)
    label!.emit('pointerdown');
    await waitFrames(12);

    // Picker overlay should be visible: DOM filter input + Phaser title / footer
    const filterInput = document.querySelector(
      'input[aria-label="Filter cards by title"]',
    ) as HTMLInputElement | null;
    expect(filterInput).not.toBeNull();
    expect(filterInput!.placeholder).toBe('Filter by title...');

    const hud: Phaser.GameObjects.Container | undefined = scene.hudContainer;
    expect(hud).toBeDefined();
    const hudTexts = collectTextsRecursive(hud!);
    const hasTitle = hudTexts.some((t) => t.text === 'Market Card Cheat');
    expect(hasTitle).toBe(true);
    const hasFooter = hudTexts.some((t) => t.text === '[ Replace Market Slot ]');
    expect(hasFooter).toBe(true);

    // Card list: overlay renders entries as "▶ Label" (highlighted) / "  Label"
    const entryText = hudTexts.find((t) => t.text.startsWith('▶ ') || t.text.startsWith('  '));
    expect(entryText).toBeDefined();

    // Click the highlighted entry — per AC this selects AND confirms (replaces a random slot)
    entryText!.emit('pointerdown');
    await waitFrames(12);

    const afterIds: string[] = scene.state.market.cards.map((c: any) => c.id);
    expect(afterIds).toHaveLength(3);
    // At least one slot was replaced with a fresh cheat instance (id contains --cheat-)
    expect(afterIds.some((id) => id.includes('--cheat-'))).toBe(true);
    const changed = afterIds.some((id) => !beforeIds.includes(id));
    expect(changed).toBe(true);
  }, 30_000);
});
