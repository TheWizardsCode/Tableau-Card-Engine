/**
 * Browser tests for the phased income animation (CG-0MTDEAA2J001EFEF).
 *
 * Verifies `MainStreetAnimator.animateIncomePhases()` end-to-end on a live
 * Main Street scene: phase ordering (base → synergy → reputation → events →
 * upcoming → collect), on-card coin grids populated per phase and collected
 * to the HUD, Upcoming-panel effect line reveals during the event phase,
 * reduced-motion text-only progression, non-blocking error swallowing, and
 * the replay/headless exemption.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import { getBusinessTemplates } from '../../example-games/main-street/MainStreetCards';
import type { BusinessCard } from '../../example-games/main-street/MainStreetCards';
import type { SlotPhaseBreakdown } from '../../example-games/main-street/MainStreetAdjacency';
import type { IncomePhaseKey } from '../../example-games/main-street/scenes/MainStreetAnimator';
import {
  COIN_GRID_FULL_KEY,
  COIN_GRID_HALF_KEY,
} from '../../example-games/main-street/coin-grid';

async function bootGame(): Promise<Phaser.Game> {
  let container = document.getElementById('game-container');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'game-container';
  document.body.appendChild(container);

  const { createMainStreetGame } = await import('../../example-games/main-street/createMainStreetGame');
  const game = createMainStreetGame({ type: Phaser.CANVAS, parent: 'game-container' });
  await waitForScene(game, 'MainStreetScene');
  return game;
}

function destroyGame(game: Phaser.Game | null): void {
  if (game) game.destroy(true, false);
  const container = document.getElementById('game-container');
  if (container) container.remove();
}

async function waitForCondition(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

function makeBiz(id: string, name: string, baseIncome: number): BusinessCard {
  const tpl = getBusinessTemplates()[0];
  return {
    family: 'business',
    ...tpl,
    id,
    name,
    level: 1,
    baseIncome,
    ongoingCost: 0.75,
    incomeBonus: 0,
    synergyRangeBonus: 0,
    reputationBonus: 0,
    appliedUpgrades: [],
  };
}

/** Recursively collect coin-grid icons (full/half textures) under a container. */
function coinIconsUnder(container: Phaser.GameObjects.Container): Phaser.GameObjects.Image[] {
  const icons: Phaser.GameObjects.Image[] = [];
  for (const child of container.list) {
    if (child instanceof Phaser.GameObjects.Image) {
      const tex = (child as Phaser.GameObjects.Image & { texture?: { key?: string } }).texture;
      if (tex?.key === COIN_GRID_FULL_KEY || tex?.key === COIN_GRID_HALF_KEY) {
        icons.push(child as Phaser.GameObjects.Image);
      }
    }
    if (child instanceof Phaser.GameObjects.Container) {
      icons.push(...coinIconsUnder(child));
    }
  }
  return icons;
}

/** The rendered card container for a street slot (or null). */
function slotCard(
  scene: Phaser.Scene & { streetContainer?: Phaser.GameObjects.Container },
  slotIndex: number,
): Phaser.GameObjects.Container | null {
  for (const obj of scene.streetContainer?.list ?? []) {
    const candidate = obj as Phaser.GameObjects.Container & { getData?: (k: string) => unknown };
    if (candidate.getData?.('streetSlotIndex') === slotIndex) return candidate;
  }
  return null;
}

/** Standard two-slot phase data with all phases contributing. */
function makePhaseData(): SlotPhaseBreakdown[] {
  return [
    {
      slotIndex: 0,
      businessName: 'Cafe',
      baseIncome: 3,
      synergyBonus: 1,
      repBonus: 0.5,
      eventDeltas: [],
      upcomingDeltas: [],
    },
    {
      slotIndex: 1,
      businessName: 'Bakery',
      baseIncome: 2,
      synergyBonus: 0,
      repBonus: 0.25,
      eventDeltas: [],
      upcomingDeltas: [],
    },
  ];
}

describe('Main Street phased income animation', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    destroyGame(game);
    game = null;
  });

  it('runs phases in order base → synergy → reputation → events → upcoming → collect', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeBiz('cafe-biz', 'Cafe', 3);
    state.streetGrid[1] = makeBiz('bakery-biz', 'Bakery', 2);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    await waitForCondition(() => slotCard(scene as never, 0) !== null);

    const order: IncomePhaseKey[] = [];
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (data: SlotPhaseBreakdown[], opts: {
        phaseGapMs: number;
        onPhase: (phase: IncomePhaseKey, index: number) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(makePhaseData(), {
      phaseGapMs: 1500,
      onPhase: (phase) => {
        order.push(phase);
      },
    });

    // incomeCollectionActive is set while the choreography runs.
    await waitForCondition(() => (scene.incomeCollectionActive as boolean) === true);

    await waitForCondition(() => order.includes('collect'), 12_000);
    expect(order).toEqual(['base', 'synergy', 'reputation', 'events', 'upcoming', 'collect']);

    // The flag clears once collection completes.
    await waitForCondition(() => (scene.incomeCollectionActive as boolean) === false, 6000);
  });

  it('counts base coins out onto card grids and collects them to the HUD', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeBiz('cafe-biz', 'Cafe', 3);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const card = await waitForCondition(() => slotCard(scene as never, 0) !== null).then(() => slotCard(scene as never, 0)!);

    const seen: { phase: IncomePhaseKey; recordedAt: number }[] = [];
    const data = makePhaseData();
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (d: SlotPhaseBreakdown[], o: {
        phaseGapMs: number;
        onPhase: (p: IncomePhaseKey) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(data, {
      phaseGapMs: 1500,
      onPhase: (phase) => {
        seen.push({ phase, recordedAt: performance.now() });
      },
    });

    // After the base phase's count-out completes, slot 0's card shows coins.
    await waitForCondition(() => seen.some((e) => e.phase === 'base') && performance.now() - seen[0].recordedAt > 700, 6000);
    expect(coinIconsUnder(card).length).toBeGreaterThan(0);

    // Once collection begins and finishes, no coin icons remain on the cards.
    await waitForCondition(() => (scene.incomeCollectionActive as boolean) === false, 15_000);
    expect(coinIconsUnder(card).length).toBe(0);
  });

  it('shows animated Upcoming-panel effect lines during the event phase', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;

    // Active income-multiplier effect + per-slot event deltas in phase data.
    (scene.state as { activeEffects: Array<{
      effectType: string; multiplier: number; turnsRemaining: number;
      sourceEventId: string; description: string;
    }> }).activeEffects = [
      { effectType: 'income-multiplier', multiplier: 0.8, turnsRemaining: 2, sourceEventId: 'ev-flu', description: 'Flu Outbreak' },
    ];

    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeBiz('cafe-biz', 'Cafe', 3);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    await waitForCondition(() => slotCard(scene as never, 0) !== null);

    const data = makePhaseData();
    data[0].eventDeltas = [{ cardId: 'ev-flu', name: 'Flu Outbreak', delta: -1.2 }];

    const seen: IncomePhaseKey[] = [];
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (d: SlotPhaseBreakdown[], o: {
        phaseGapMs: number;
        onPhase: (p: IncomePhaseKey) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(data, {
      phaseGapMs: 1500,
      onPhase: (phase) => {
        seen.push(phase);
      },
    });

    // After the events phase starts, the Upcoming panel contains an animated
    // line: a text whose content includes the effect description and the
    // "New" suffix the reveal helper appends.
    await waitForCondition(() => seen.includes('events') && seen.includes('collect'), 12_000);
    const queue = (scene.incidentQueueContainer as Phaser.GameObjects.Container).list;
    const texts = queue.filter(
      (obj): obj is Phaser.GameObjects.Text => obj instanceof Phaser.GameObjects.Text,
    );
    // The animated reveal splits the line into per-letter text objects; join
    // them so the full phrase (description + "New" suffix) can be asserted.
    const joined = texts.map((t) => t.text).join('');
    expect(joined.includes('Flu Outbreak')).toBe(true);
    expect(joined.includes('New')).toBe(true);

    // Valid phases completed despite the negative event delta.
    expect(seen).toEqual(['base', 'synergy', 'reputation', 'events', 'upcoming', 'collect']);
  });

  it('reduced motion keeps the phase/text progression but never shows coins', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeBiz('cafe-biz', 'Cafe', 3);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const card = await waitForCondition(() => slotCard(scene as never, 0) !== null).then(() => slotCard(scene as never, 0)!);

    // Force the reduced-motion preference.
    (scene.settingsPanel as { _reducedMotion: boolean } | undefined)!._reducedMotion = true;

    const order: IncomePhaseKey[] = [];
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (d: SlotPhaseBreakdown[], o: {
        phaseGapMs: number;
        onPhase: (p: IncomePhaseKey) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(makePhaseData(), {
      phaseGapMs: 200,
      onPhase: (phase) => {
        order.push(phase);
      },
    });

    await waitForCondition(() => (scene.incomeCollectionActive as boolean) === false, 8000);
    expect(order).toEqual(['base', 'synergy', 'reputation', 'events', 'upcoming', 'collect']);
    // No coin icons ever rendered (text progression only, AC8).
    expect(coinIconsUnder(card).length).toBe(0);
  });

  it('is non-blocking: unknown slots are skipped, and no game state is mutated', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      resourceBank: { coins: number };
    };
    state.streetGrid[1] = makeBiz('bakery-biz', 'Bakery', 2);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    await waitForCondition(() => slotCard(scene as never, 1) !== null);
    const coinsBefore = state.resourceBank.coins;

    const order: IncomePhaseKey[] = [];
    const data = makePhaseData();
    // Slot 99 has no rendered card — must be skipped without throwing.
    data[0].slotIndex = 99;
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (d: SlotPhaseBreakdown[], o: {
        phaseGapMs: number;
        onPhase: (p: IncomePhaseKey) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(data, {
      phaseGapMs: 200,
      onPhase: (phase) => {
        order.push(phase);
      },
    });

    // The choreography completes and never touches the bank.
    await waitForCondition(() => order.includes('collect'), 8000);
    expect(order).toEqual(['base', 'synergy', 'reputation', 'events', 'upcoming', 'collect']);
    expect(state.resourceBank.coins).toBe(coinsBefore);
  });

  it('replay/headless mode renders nothing and records no phases', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const state = scene.state as { streetGrid: Array<BusinessCard | null> };
    state.streetGrid[0] = makeBiz('cafe-biz', 'Cafe', 3);
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    await waitForCondition(() => slotCard(scene as never, 0) !== null);

    (scene as unknown as { replayMode: boolean }).replayMode = true;
    const order: IncomePhaseKey[] = [];
    const msAnimator = scene.msAnimator as {
      animateIncomePhases: (d: SlotPhaseBreakdown[], o: {
        phaseGapMs: number;
        onPhase: (p: IncomePhaseKey) => void;
      }) => void;
    };
    msAnimator.animateIncomePhases(makePhaseData(), {
      phaseGapMs: 50,
      onPhase: (phase) => {
        order.push(phase);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(order).toEqual([]);
    expect(scene.incomeCollectionActive as boolean).toBe(false);
  });
});