/**
 * GymCardIndexScene browser integration tests.
 *
 * Validates that:
 *  - The scene boots without errors and indexes the Main Street pool
 *  - The default "By Type" grouping produces one group per card family
 *  - Switching to "By Synergy" groups by synergy and lists multi-synergy
 *    cards in every matching group
 *  - Filtering narrows the visible set (and renders an empty-state message)
 *  - Keystrokes drive the filter
 *  - Clicking a card opens the raw-data detail dialog and it closes cleanly
 *
 * The pure grouping/filtering logic is unit-tested in `GymCardIndex.test.ts`;
 * this file verifies the scene wiring and rendering in a real browser.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { GymCardIndexScene } from '../../example-games/main-street/gym/GymCardIndexScene';
import { GYM_CARD_INDEX_KEY } from '../../example-games/main-street/gym/GymCardIndexScene';
import { SYNERGY_TYPES, cardSynergyTypes } from '../../example-games/main-street/gym/GymCardIndex';
import { GAME_W, GAME_H } from '@ui/constants';
import { waitForScene } from '@core-tests/helpers/waitForScene';

describe('GymCardIndexScene browser integration', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  /** Boot the scene and return the active instance. */
  async function bootScene(): Promise<GymCardIndexScene> {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: GAME_W,
      height: GAME_H,
      parent: 'game-container',
      backgroundColor: '#121a2a',
      scene: [GymCardIndexScene],
    });

    await waitForScene(game, GYM_CARD_INDEX_KEY);
    const scene = game.scene.getScene(GYM_CARD_INDEX_KEY);
    expect(scene).toBeTruthy();
    expect(scene!.sys.isActive()).toBe(true);
    return scene as GymCardIndexScene;
  }

  /**
   * Find a text object by substring across the scene display list *and* the
   * nested containers (the index list and the dialog's scroll container both
   * reparent their children).
   */
  function findText(scene: Phaser.Scene, needle: string): Phaser.GameObjects.Text | null {
    const matches: Phaser.GameObjects.Text[] = [];

    const visit = (obj: Phaser.GameObjects.GameObject): void => {
      if (obj instanceof Phaser.GameObjects.Text && obj.text.includes(needle)) {
        matches.push(obj);
      }
      if (obj instanceof Phaser.GameObjects.Container) {
        for (const child of obj.list) visit(child as Phaser.GameObjects.GameObject);
      }
    };

    for (const child of scene.children.list) visit(child as Phaser.GameObjects.GameObject);
    return matches[0] ?? null;
  }

  it('boots with every Main Street card indexed', async () => {
    const scene = await bootScene();

    expect(scene.getVisibleEntries().length).toBeGreaterThan(100);
    expect(scene.getFilter()).toBe('');
    expect(scene.getGroupMode()).toBe('family');
    expect(scene.hasDetailDialogOpen()).toBe(false);
  });

  it('renders one group per card family in "By Type" mode', async () => {
    const scene = await bootScene();

    const groups = scene.getGroups();
    expect(groups.map((g) => g.key)).toEqual([
      'business',
      'community-space',
      'event',
      'upgrade',
      'staff',
    ]);

    const business = groups.find((g) => g.key === 'business')!;
    expect(business.entries.length).toBeGreaterThan(0);
    expect(findText(scene, `── ${business.label} (${business.entries.length}) ──`)).not.toBeNull();
  });

  it('lists a multi-synergy card in every matching synergy group', async () => {
    const scene = await bootScene();
    scene.setGroupMode('synergy');

    expect(scene.getGroupMode()).toBe('synergy');

    const groups = scene.getGroups();
    expect(groups.map((g) => g.key)).toEqual([...SYNERGY_TYPES, 'unsynergised']);

    // Some Main Street card synergises with more than one type — find one and
    // assert it is listed in each of its groups.
    const multi = scene
      .getVisibleEntries()
      .find((e) => cardSynergyTypes(e.card).length > 1);

    if (multi) {
      const synergies = cardSynergyTypes(multi.card);
      const containing = groups.filter((g) => g.entries.some((e) => e.id === multi.id));
      expect(containing.map((g) => g.key).sort()).toEqual([...synergies].sort());
    }

    // Multi-membership means group totals exceed the card count.
    const membership = groups.reduce((sum, g) => sum + g.entries.length, 0);
    expect(membership).toBeGreaterThan(scene.getVisibleEntries().length);
  });

  it('hides empty groups in synergy mode but keeps them in type mode', async () => {
    const scene = await bootScene();

    // Filter to exactly one card (the business Bakery) so every other group
    // is empty.
    scene.setFilter('biz-bakery');
    expect(scene.getVisibleEntries().map((e) => e.id)).toEqual(['biz-bakery']);

    scene.setGroupMode('family');
    expect(scene.getGroups().length).toBe(5);
    // Family mode renders the group headers even when a family is empty.
    expect(findText(scene, '── Staff (0) ──')).not.toBeNull();

    scene.setGroupMode('synergy');
    // Synergy mode renders only non-empty groups; no "(0)" header at all.
    expect(findText(scene, '(0) ──')).toBeNull();
    // The bakery lands in its Food synergy group (and only there).
    expect(scene.getGroups().filter((g) => g.entries.length > 0).map((g) => g.key)).toEqual(['Food']);
  });

  it('filters the visible cards by name substring', async () => {
    const scene = await bootScene();

    scene.setFilter('bakery');

    const visible = scene.getVisibleEntries();
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((e) => e.searchText.includes('bakery'))).toBe(true);
    expect(findText(scene, 'Bakery')).not.toBeNull();
  });

  it('renders an empty-state message when nothing matches', async () => {
    const scene = await bootScene();

    scene.setFilter('zzz-no-such-card-zzz');

    expect(scene.getVisibleEntries()).toEqual([]);
    expect(findText(scene, 'No cards match')).not.toBeNull();
  });

  it('lays out the filter row, mode row and list inside the viewport', async () => {
    const scene = await bootScene();

    const filterLabel = findText(scene, 'Filter (name or id):')!;
    const modeButton = findText(scene, '[ By Type ]')!;
    expect(filterLabel).not.toBeNull();
    expect(modeButton).not.toBeNull();

    const list = scene.getListBounds();

    // Vertical order: header divider < filter < mode < list.
    expect(filterLabel.y).toBeGreaterThan(36);
    expect(filterLabel.y).toBeLessThan(modeButton.y);
    expect(modeButton.y).toBeLessThan(list.y);

    // The list region stays inside the 1280x720 canvas.
    expect(list.x).toBeGreaterThan(0);
    expect(list.y).toBeGreaterThan(0);
    expect(list.x + list.width).toBeLessThanOrEqual(GAME_W);
    expect(list.y + list.height).toBeLessThanOrEqual(GAME_H);

    // With 160+ cards indexed the list overflows and is scrollable.
    expect(scene.getVisibleEntries().length).toBeGreaterThan(150);
    expect(scene.getMaxScroll()).toBeGreaterThan(0);
  });

  it('drives the filter from keystrokes', async () => {
    const scene = await bootScene();

    /**
     * Dispatch a real keydown and let Phaser's input manager process it.
     * The delay between dispatches also guarantees distinct event
     * timestamps, so KeyboardPlugin's duplicate-event bailout (same
     * keyCode + timestamp) cannot swallow consecutive events.
     */
    async function typeKey(key: string, keyCode: number): Promise<void> {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, keyCode, which: keyCode } as KeyboardEventInit),
      );
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    await typeKey('b', 66);
    await typeKey('a', 65);
    expect(scene.getFilter()).toBe('ba');

    await typeKey('Backspace', 8);
    expect(scene.getFilter()).toBe('b');

    await typeKey('Escape', 27);
    expect(scene.getFilter()).toBe('');
  });

  it('opens the raw-data detail dialog with every field and closes it', async () => {
    const scene = await bootScene();

    const entry = scene.getVisibleEntries().find((e) => e.id === 'biz-bakery')!;
    expect(entry).toBeDefined();

    scene.openCardDetail(entry);
    expect(scene.hasDetailDialogOpen()).toBe(true);

    // Raw template fields plus the player-facing tooltip block.
    expect(findText(scene, 'Family: business')).not.toBeNull();
    expect(findText(scene, 'ID: biz-bakery')).not.toBeNull();
    expect(findText(scene, 'Description')).not.toBeNull();
    expect(findText(scene, 'Player-facing tooltip')).not.toBeNull();
    expect(findText(scene, 'Business: Bakery')).not.toBeNull();

    scene.closeCardDetail();
    expect(scene.hasDetailDialogOpen()).toBe(false);
    expect(findText(scene, 'ID: biz-bakery')).toBeNull();
  });

  it('ignores further clicks while a detail dialog is open', async () => {
    const scene = await bootScene();

    const [first, second] = scene.getVisibleEntries();
    scene.openCardDetail(first);
    scene.openCardDetail(second);

    // The dialog still shows the first card.
    expect(findText(scene, `ID: ${first.id}`)).not.toBeNull();

    scene.closeCardDetail();
    expect(scene.hasDetailDialogOpen()).toBe(false);
  });

  it('cleans up the scroll mask and dialog on shutdown', async () => {
    const scene = await bootScene();

    scene.openCardDetail(scene.getVisibleEntries()[0]);
    expect(scene.hasDetailDialogOpen()).toBe(true);

    scene.sys.shutdown();

    expect(scene.hasDetailDialogOpen()).toBe(false);
  });
});
