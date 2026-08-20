/**
 * Main Street: Synergy Formation Animation Browser Tests
 *
 * Verifies the synergy-formation trigger end to end in a real Phaser scene:
 *
 * 1. Placing a business (drag-to-slot flow) that forms a NEW synergy pair
 *    triggers `MainStreetAnimator.animateSynergyFormation` with the new
 *    pair's slot indices + shared synergy type, and the chime SFX plays.
 * 2. A subsequent plain refresh does NOT re-trigger the animation (only
 *    newly-formed pairs animate).
 * 3. Under reduced motion the trigger still fires (the animator degrades
 *    internally — covered by unit tests).
 *
 * The presentation is non-blocking and never mutates game state beyond the
 * placement itself.
 *
 * @module tests/main-street/synergy-formation.browser
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';

import { waitForScene } from '../helpers/waitForScene';
import {
  getBusinessTemplates,
  type BusinessCard,
  type SynergyType,
} from '../../example-games/main-street/MainStreetCards';
import { synergyLineEndpoints } from '../../example-games/main-street/scenes/synergyLineEndpoints';

// ── Boot helpers (mirrors MainStreetScene.browser.test.ts) ──

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

async function waitForCondition(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'condition';
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

/**
 * Two distinct business cards sharing a synergy type (different base type ids
 * so the same-type exclusion rule doesn't suppress the pair).
 */
function makeSynergyPair(): { cardA: BusinessCard; cardB: BusinessCard; shared: SynergyType } {
  const tpls = getBusinessTemplates();
  const shared = tpls.find((t) => t.synergyTypes.length > 0)?.synergyTypes[0];
  if (!shared) throw new Error('No synergy-capable business templates');
  const pair = tpls.filter((t) => t.synergyTypes.includes(shared)).slice(0, 2);
  if (pair.length < 2) throw new Error(`Fewer than 2 templates share synergy ${shared}`);
  const [ta, tb] = pair as [typeof pair[0], typeof pair[0]];
  const cardA: BusinessCard = { ...ta, id: `syn-browser-a-${ta.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
  const cardB: BusinessCard = { ...tb, id: `syn-browser-b-${tb.id}`, family: 'business', level: 0, incomeBonus: 0, synergyRangeBonus: 0, reputationBonus: 0, appliedUpgrades: [] };
  return { cardA, cardB, shared };
}

interface FormationCall {
  fromIndex: number;
  toIndex: number;
  sharedSynergy: string;
}

function spyOnSynergyFormation(scene: Phaser.Scene & Record<string, unknown>): {
  spy: ReturnType<typeof vi.spyOn>;
  calls: FormationCall[];
} {
  const animator = scene.msAnimator as unknown as {
    animateSynergyFormation: (params: FormationCall) => void;
  };
  const original = animator.animateSynergyFormation.bind(animator);
  const calls: FormationCall[] = [];
  const spy = vi.spyOn(animator, 'animateSynergyFormation').mockImplementation((params) => {
    calls.push(params);
    original(params); // run the real implementation so the visuals run
  });
  return { spy, calls };
}

// ── Phaser Graphics command-buffer decoding ───────────────────
// Phaser 4 Graphics records drawing commands as a flat command buffer
// (Commands.js): LINE_STYLE=6, BEGIN_PATH=1, MOVE_TO=5, LINE_TO=4,
// STROKE_PATH=9. We decode the buffer to read back the drawn line
// segments for geometry-parity assertions (CG-0MSVM3WCD007BRQP).

const GCMD = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
} as const;

interface LineSegment {
  moveTo: { x: number; y: number };
  lineTo: { x: number; y: number };
  width?: number;
}

/** Decode a Graphics command buffer into its stroked line segments. */
function decodeLineSegments(buf: number[]): LineSegment[] {
  const segments: LineSegment[] = [];
  let cur: LineSegment | null = null;
  let currentWidth: number | undefined;
  let i = 0;
  while (i < buf.length) {
    const cmd = buf[i];
    i += 1;
    switch (cmd) {
      case GCMD.MOVE_TO:
        cur = { moveTo: { x: buf[i], y: buf[i + 1] }, lineTo: { x: 0, y: 0 }, width: currentWidth };
        i += 2;
        break;
      case GCMD.LINE_TO:
        if (cur) cur.lineTo = { x: buf[i], y: buf[i + 1] };
        i += 2;
        break;
      case GCMD.STROKE_PATH:
        if (cur) segments.push(cur);
        cur = null;
        break;
      case GCMD.LINE_STYLE:
        currentWidth = buf[i];
        i += 3;
        break;
      case GCMD.FILL_STYLE:
        i += 2;
        break;
      case GCMD.FILL_RECT:
        i += 4;
        break;
      case GCMD.ARC:
        i += 6;
        break;
      case GCMD.BEGIN_PATH:
      case GCMD.CLOSE_PATH:
      case GCMD.FILL_PATH:
        break;
      default:
        break; // unknown commands with operands are not used by synergy lines
    }
  }
  return segments;
}

function segmentsMatch(seg: LineSegment, p1: { x: number; y: number }, p2: { x: number; y: number }): boolean {
  return (
    Math.abs(seg.moveTo.x - p1.x) < 0.01 &&
    Math.abs(seg.moveTo.y - p1.y) < 0.01 &&
    Math.abs(seg.lineTo.x - p2.x) < 0.01 &&
    Math.abs(seg.lineTo.y - p2.y) < 0.01
  );
}

describe('MainStreet synergy formation animation', () => {
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

  it('triggers the formation animation with the new pair and plays the chime on placement', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const { cardA, cardB, shared } = makeSynergyPair();

    // Partner already on slot 0; the new card comes from the market row.
    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { cards: Array<BusinessCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = cardA;
    state.market.cards[0] = cardB;
    state.resourceBank.coins = 100;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    const { calls } = spyOnSynergyFormation(scene);
    const soundSpy = vi.spyOn(scene.soundManager as unknown as { play: (k: string) => void }, 'play');

    // Drag the market card onto slot 1 (adjacent to slot 0).
    (scene.msTurnController as unknown as {
      onDragDropBusiness: (payload: { data: string; zoneData: number; gameObject: unknown }) => void;
    }).onDragDropBusiness({ data: cardB.id, zoneData: 1, gameObject: null });

    // The placement forms a NEW pair and triggers the animation.
    await waitForCondition(() => calls.length >= 1, { timeoutMs: 8000, label: 'synergy formation trigger' });
    expect(calls).toHaveLength(1);
    expect(calls[0].fromIndex).toBe(0);
    expect(calls[0].toIndex).toBe(1);
    expect(calls[0].sharedSynergy).toBe(shared);

    // The chime SFX played (positive feedback; the buy itself only
    // decreases coins, so INCOME_POSITIVE must come from the chime).
    expect(soundSpy.mock.calls.some((c) => c[0] === 'sfx-income-positive')).toBe(true);

    // A plain refresh (pre-existing pair) does NOT re-trigger.
    (scene as unknown as { refreshAll: () => void }).refreshAll();
    expect(calls).toHaveLength(1);
  }, 30_000);

  it('draws static synergy lines edge-to-edge between clipped endpoints with shared glow endpoints', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const typed = scene as unknown as {
      streetContainer: { list: Phaser.GameObjects.GameObject[] };
      layout: {
        streetX: number;
        streetTop: number;
        slotW: number;
        slotH: number;
        slotGap: number;
        streetRowGap: number;
        streetCols: number;
      };
    };
    const { cardA, cardB, shared } = makeSynergyPair();

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { cards: Array<BusinessCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = cardA;
    state.streetGrid[1] = cardB;
    state.resourceBank.coins = 100;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    // Expected clipped endpoints for the (0,1) pair (shared helper geometry).
    const expected = synergyLineEndpoints({ fromIndex: 0, toIndex: 1, sharedSynergy: shared }, typed.layout);

    // The street container holds exactly one Graphics per synergy line; decode
    // its strokes (main 3px + glow 6px) and assert both are the clipped
    // endpoints — edge-to-edge, not slot centres, and identical to each other.
    const streetGraphics = typed.streetContainer.list.filter(
      (obj) => (obj as { type?: string }).type === 'Graphics',
    );
    expect(streetGraphics.length).toBe(1);

    const segments = decodeLineSegments(
      (streetGraphics[0] as unknown as { commandBuffer: number[] }).commandBuffer,
    );
    expect(segments).toHaveLength(2); // main stroke + glow stroke
    const slot0CenterX = typed.layout.streetX + typed.layout.slotW / 2; // 90
    const slot1CenterX = typed.layout.streetX + (typed.layout.slotW + typed.layout.slotGap) + typed.layout.slotW / 2; // 250
    for (const seg of segments) {
      expect(segmentsMatch(seg, expected.p1, expected.p2)).toBe(true);
      // Edge endpoints, NOT the slot centres: p1/p2 sit on the facing edges,
      // 70px away from their slot-centre x coordinates.
      expect(Math.abs(seg.moveTo.x - slot0CenterX)).toBeGreaterThan(20);
      expect(Math.abs(seg.lineTo.x - slot1CenterX)).toBeGreaterThan(20);
    }
    // Glow stroke (width 6) shares the exact same endpoints as the main stroke (width 3).
    expect(segments[0].width).toBe(3);
    expect(segments[1].width).toBe(6);
    expect(segments[1].moveTo).toEqual(segments[0].moveTo);
    expect(segments[1].lineTo).toEqual(segments[0].lineTo);
  }, 30_000);

  it('animates the formation line between the same clipped endpoints as the static line', async () => {
    game = await bootGame();
    const scene = game.scene.getScene('MainStreetScene') as Phaser.Scene & Record<string, unknown>;
    const typed = scene as unknown as {
      children: { list: unknown[] };
      layout: { streetX: number; streetTop: number; slotW: number; slotH: number; slotGap: number; streetRowGap: number; streetCols: number };
    };
    const { cardA, cardB, shared } = makeSynergyPair();

    const state = scene.state as {
      streetGrid: Array<BusinessCard | null>;
      market: { cards: Array<BusinessCard | null> };
      resourceBank: { coins: number };
    };
    state.streetGrid[0] = cardA;
    state.market.cards[0] = cardB;
    state.resourceBank.coins = 100;
    (scene as unknown as { refreshAll: () => void }).refreshAll();

    // Form the NEW pair by placing cardB on slot 1 → animateSynergyFormation
    // draws the depth-10 line synchronously using the shared helper.
    (scene.msTurnController as unknown as {
      onDragDropBusiness: (payload: { data: string; zoneData: number; gameObject: unknown }) => void;
    }).onDragDropBusiness({ data: cardB.id, zoneData: 1, gameObject: null });

    const expected = synergyLineEndpoints({ fromIndex: 0, toIndex: 1, sharedSynergy: shared }, typed.layout);

    // The animated line lives at scene root with depth 10 (above the street
    // container, matching where the static lines render). The formation
    // animation runs after the placement transfer completes, so poll for it.
    type AnimGraphics = { commandBuffer: number[] };
    let animLine: AnimGraphics | undefined;
    await waitForCondition(() => {
      const found = typed.children.list.find((obj) => {
        const g = obj as { type?: string; depth?: number; commandBuffer?: number[] };
        return g.type === 'Graphics' && g.depth === 10 && Array.isArray(g.commandBuffer);
      }) as AnimGraphics | undefined;
      animLine = found;
      return !!found;
    }, { timeoutMs: 8000, label: 'animated synergy line' });
    expect(animLine).toBeDefined();

    const segments = decodeLineSegments(animLine!.commandBuffer);
    expect(segments).toHaveLength(1); // draw-in line only (no glow in the animation)
    expect(segmentsMatch(segments[0], expected.p1, expected.p2)).toBe(true);

    // And it visually connects the two cards: the endpoints are the facing
    // edges (gap of 20px between them), far from the slot centres.
    const centerX0 = state.streetGrid[0] && typed.layout.streetX + typed.layout.slotW / 2;
    const centerX1 = typed.layout.streetX + (typed.layout.slotW + typed.layout.slotGap) + typed.layout.slotW / 2;
    expect(Math.abs(segments[0].moveTo.x - centerX0)).toBeGreaterThan(20);
    expect(Math.abs(segments[0].lineTo.x - centerX1)).toBeGreaterThan(20);
  }, 30_000);
});
