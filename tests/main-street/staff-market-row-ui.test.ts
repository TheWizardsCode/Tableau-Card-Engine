/**
 * Main Street: Staff Render & Hire in the Market Row — UI
 * (CG-0MT3KZOUX007GQ44)
 *
 * Feature 3 of "Remove dedicated staff market; route staff cards into
 * general market selection" (CG-0MT2WTN0L004JA53).
 *
 * Covers the market-row staff surface:
 *   AC2  Clicking a staff card in the market invokes `onStaffCardClick`
 *        → hireStaffCardCommand (consumes 1 action), same animated + SFX
 *        feedback path as other market actions; staff are never
 *        move-to-hand cards.
 *   AC3  Staff tooltips show hire-relevant info (name, cost, +hand slots,
 *        ongoing cost, abilities).
 *   AC6  No orphaned `staffCardMarket` references remain in the UI layer
 *        (`example-games/main-street/scenes/` + shared `src/`).
 *
 * (AC1 rendering layout parity and AC5 tutorial loading are covered by the
 * browser suite: MainStreetScene.browser.test.ts and the tutorial E2E.)
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { MainStreetTurnController } from '../../example-games/main-street/scenes/MainStreetTurnController';
import { buildCardTooltipInfo } from '../../example-games/main-street/MainStreetFormatting';
import { COMMON_SFX_KEYS } from '../../src/core-engine/SoundManager';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';
import { createStaffDeck, type StaffCard } from '../../example-games/main-street/MainStreetCards';
import { setupMainStreetGame as setupWithConfig } from '../../example-games/main-street/MainStreetState';
import type { SynergyFormatConfig } from '../../example-games/main-street/MainStreetFormatting';

// ── Mocks (mirrors illegal-afford-feedback.test.ts) ───────────

function createPhaserMock(): any {
  return {
    tweens: {
      add: vi.fn((config: any) => {
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        for (const t of targets) {
          if (t && config.x !== undefined) t.x = config.x;
        }
        config.onComplete?.();
        return { stop: vi.fn(), destroy: vi.fn() };
      }),
    },
    input: {
      on: vi.fn(),
      off: vi.fn(),
      setDraggable: vi.fn(),
      dragDistanceThreshold: 0,
    },
    sound: { play: vi.fn(), stopByKey: vi.fn(), volume: 1, mute: false },
  };
}

function createMockContainer(x = 300, y = 150, depth = 5): any {
  const go: any = {
    x,
    y,
    depth,
    setDepth: vi.fn((d: number) => { go.depth = d; return go; }),
    setInteractive: vi.fn(),
    setName: vi.fn(),
    on: vi.fn(),
  };
  return go;
}

function createMockScene(overrides: Record<string, unknown> = {}): any {
  const phaser = createPhaserMock();
  const state = setupMainStreetGame({ seed: 'ms-staff-row-ui' });

  const marketContainers: any[] = state.market.cards.map(
    (_c: any, i: number) => createMockContainer(300 + i * 110, 150, 10 + i),
  );

  const scene: any = {
    state,
    uiPhase: 'market',
    layout: {
      streetCols: 5,
      streetX: 60,
      streetTop: 220,
      slotW: 100,
      slotH: 64,
      slotGap: 8,
      streetRowGap: 8,
      handX: 40,
      handY: 400,
      handCardW: 96,
      handCardH: 134,
      handCenterX: 512,
    },
    settingsPanel: { reducedMotion: false },
    msLifecycleManager: {
      isTutorialActionAllowed: vi.fn().mockReturnValue({ allowed: true }),
      onTutorialActionComplete: vi.fn(),
    },
    instructionText: { setText: vi.fn() },
    tooltipManager: { hide: vi.fn(), show: vi.fn() },
    selectMarketCardById: vi.fn(),
    clearMarketSelection: vi.fn(),
    hiddenTransferSourceCardIds: new Set(),
    refreshAll: vi.fn(),
    refreshStreetGrid: vi.fn(),
    refreshActionButtons: vi.fn(),
    gameEvents: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
    undoManager: new UndoRedoManager(),
    time: { delayedCall: vi.fn().mockReturnValue({ remove: vi.fn() }) },
    animateTransferFromMarket: vi.fn().mockResolvedValue(undefined),
    getStreetSlotCenter: vi.fn((slotIndex: number) => ({ x: 500 + slotIndex, y: 260 })),
    msRenderer: {
      getMarketRowCards: vi.fn(() => marketContainers),
      getMarketSlotCenter: vi.fn(() => ({ x: 300, y: 150 })),
    },
    msAnimator: {
      animateEventPlayed: vi.fn(),
      animateLevelUp: vi.fn(),
      animateNewSynergyPairs: vi.fn(),
    },
    input: phaser.input,
    tweens: phaser.tweens,
    sound: phaser.sound,
    add: {
      rectangle: vi.fn(() => {
        const rect: any = {
          setAlpha: vi.fn(() => rect),
          setOrigin: vi.fn(() => rect),
          setRotation: vi.fn(() => rect),
          setDepth: vi.fn(() => rect),
          destroy: vi.fn(),
        };
        return rect;
      }),
    },
    ...overrides,
  };
  return scene;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Puts a staff card into the market row and returns it. */
function staffInMarketRow(scene: any, prefix = 'staff-accountant'): StaffCard {
  let staff = scene.state.market.cards.find((c: any) => c.family === 'staff');
  if (!staff) {
    const deckStaff = createStaffDeck(1).find((c) => c.id.startsWith(prefix))!;
    scene.state.market.cards.push({ ...deckStaff });
    staff = scene.state.market.cards.find((c: any) => c.family === 'staff')!;
  }
  return staff;
}

// ── AC2: hire flow via onStaffCardClick ───────────────────────

describe('AC2: market-row staff click hires through the animated action path', () => {
  let controller: MainStreetTurnController;
  let scene: any;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = createMockScene();
    controller = new MainStreetTurnController(scene);
  });

  it('hires the staff card: consumes 1 action, employs the card, animates the transfer', async () => {
    const staff = staffInMarketRow(scene);
    scene.state.resourceBank.coins = staff.cost + 5;
    scene.state.actionsRemaining = 1;
    const coinsBefore = scene.state.resourceBank.coins;
    const inRowBefore = scene.state.market.cards.some((c: any) => c.id === staff.id);

    controller.onStaffCardClick(staff);
    // Wait for the (mock-resolved) transfer promise → afterTransfer.
    await flushMicrotasks();

    expect(inRowBefore).toBe(true);
    expect(scene.state.staffCards.some((s: any) => s.id === staff.id)).toBe(true);
    expect(scene.state.actionsRemaining).toBe(0);
    expect(scene.state.resourceBank.coins).toBe(coinsBefore - staff.cost);
    expect(scene.state.market.cards.some((c: any) => c.id === staff.id)).toBe(false);
    // Same animated + SFX feedback path as other market actions.
    expect(scene.animateTransferFromMarket).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: staff.id, family: 'staff', row: 'market' }),
    );
    expect(scene.gameEvents.emit).toHaveBeenCalledWith('card:placed', { cardId: staff.id });
    expect(scene.refreshAll).toHaveBeenCalled();
    expect(scene.msLifecycleManager.onTutorialActionComplete).toHaveBeenCalledWith('hire-staff');
  });

  it('rejects the hire with illegal-move feedback when coins are insufficient', async () => {
    const staff = staffInMarketRow(scene);
    scene.state.resourceBank.coins = staff.cost - 1;
    scene.state.actionsRemaining = 1;
    const staffBefore = scene.state.staffCards.length;

    controller.onStaffCardClick(staff);
    await flushMicrotasks();

    // sfx-illegal-move + no state change.
    expect(scene.sound.play).toHaveBeenCalledWith(COMMON_SFX_KEYS.ILLEGAL_MOVE);
    expect(scene.state.staffCards).toHaveLength(staffBefore);
    expect(scene.state.market.cards.some((c: any) => c.id === staff.id)).toBe(true);
    expect(scene.instructionText.setText).toHaveBeenCalledWith(expect.stringContaining('Cannot hire'));
  });

  it('blocks the hire when the tutorial step is not allowed', async () => {
    scene.msLifecycleManager.isTutorialActionAllowed = vi.fn().mockReturnValue({
      allowed: false,
      reason: 'Complete the highlighted step first.',
    });
    const staff = staffInMarketRow(scene);
    scene.state.resourceBank.coins = staff.cost + 5;

    controller.onStaffCardClick(staff);
    await flushMicrotasks();

    expect(scene.state.staffCards).toHaveLength(0);
    expect(scene.animateTransferFromMarket).not.toHaveBeenCalled();
    expect(scene.instructionText.setText).toHaveBeenCalledWith('Complete the highlighted step first.');
  });

  it('does nothing for an unknown staff card id (card missing from the row)', async () => {
    scene.state.resourceBank.coins = 100;
    const ghost = { ...staffInMarketRow(scene), id: 'staff-ghost-9' } as StaffCard;

    controller.onStaffCardClick(ghost);
    await flushMicrotasks();

    expect(scene.state.staffCards).toHaveLength(0);
    expect(scene.animateTransferFromMarket).not.toHaveBeenCalled();
  });
});

// ── AC3: staff tooltip content ────────────────────────────────

describe('AC3: staff tooltips show hire-relevant info', () => {
  it('buildCardTooltipInfo includes cost, hand slots, and ability lines', () => {
    const state = setupWithConfig({ seed: 'ms-staff-tooltip' });
    const config = state.config as unknown as SynergyFormatConfig;
    const staff = createStaffDeck(1).find(c => c.id.startsWith('staff-general-manager'))!;

    const info = buildCardTooltipInfo(staff, config);

    expect(info).toContain('Staff: General Manager');
    expect(info).toContain('Cost:');
    expect(info).toContain('Hand slots: +4');
    expect(info).toContain('Actions: +1/day');
  });

  it('includes the peek ability line for peek-capable staff', () => {
    const state = setupWithConfig({ seed: 'ms-staff-tooltip-peek' });
    const config = state.config as unknown as SynergyFormatConfig;
    const staff = createStaffDeck(1).find(c => c.id.startsWith('staff-lookout'))!;

    const info = buildCardTooltipInfo(staff, config);

    expect(info).toContain('Staff:');
    expect(info).toContain('peek the incident deck once per turn');
  });
});

// ── AC6: no orphaned staff-market UI references ───────────────

describe('AC6: no orphaned staffCardMarket references in the UI layer', () => {
  const scannedRoots: Array<{ label: string; dir: string }> = [
    { label: 'scenes', dir: 'example-games/main-street/scenes' },
    { label: 'shared-ui', dir: 'src/ui' },
    { label: 'core-engine', dir: 'src/core-engine' },
  ];

  function collectTsFiles(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collectTsFiles(full, out);
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
  }

  for (const { label, dir } of scannedRoots) {
    it(`has no 'staffCardMarket' identifier in ${label} (${dir})`, () => {
      const files: string[] = [];
      collectTsFiles(dir, files);
      expect(files.length).toBeGreaterThan(0);

      const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('staffCardMarket'));
      expect(offenders, `unexpected staffCardMarket refs: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('the main-street scene/controller files never reached (sanity: files were scanned)', () => {
    // Guard against a refactor that moves the UI out of scenes/ — the sweep
    // above must keep covering the actual market surface.
    const marker = join('example-games/main-street/scenes', 'MainStreetRenderer.ts');
    expect(statSync(marker).isFile()).toBe(true);
  });
});