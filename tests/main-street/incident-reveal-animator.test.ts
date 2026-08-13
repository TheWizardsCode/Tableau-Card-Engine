/**
 * Main Street: Incident Reveal Animation Tests
 *
 * Unit tests for `MainStreetAnimator.animateIncidentReveal` — the
 * end-of-turn incident reveal presentation (dramatic sting + damage
 * feedback) — and for the incident resource deltas surfaced on `TurnResult`
 * by `processEndOfTurn`.
 *
 * These run in the Node unit environment, so the browser-only Phaser and
 * `src/ui` modules are mocked. The tests assert observable behaviour via the
 * public animator API: the warning sting SFX, the queue→board-centre card
 * flight, the red flash pulse, the explicit HUD loss pops, the
 * active-effects warning-indicator pulse, and the reduced-motion /
 * replay-mode exemptions.
 *
 * @module tests/main-street/incident-reveal-animator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser is browser-only; the animator only uses it for type annotations.
vi.mock('phaser', () => ({ default: {} }));

// Mock src/ui so importing the animator does not load Phaser-dependent UI code.
const { popTextOrIcon, moveGameObject } = vi.hoisted(() => ({
  popTextOrIcon: vi.fn((_opts?: unknown) => Promise.resolve()),
  moveGameObject: vi.fn((_opts?: unknown) => ({})),
}));

vi.mock('../../src/ui', () => ({
  FONT_FAMILY: 'sans-serif',
  popTextOrIcon,
  moveGameObject,
}));

import { MainStreetAnimator } from '../../example-games/main-street/scenes/MainStreetAnimator';
import { SFX_KEYS } from '../../example-games/main-street/scenes/MainStreetConstants';
import { setupMainStreetGame, type MainStreetState } from '../../example-games/main-street/MainStreetState';
import { processEndOfTurn } from '../../example-games/main-street/MainStreetEngine';
import type { EventCard } from '../../example-games/main-street/MainStreetCards';

// ── Mock scene helpers ──────────────────────────────────────

interface TweenConfig {
  targets: unknown;
  x?: number;
  y?: number;
  alpha?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: string;
  yoyo?: boolean;
  hold?: number;
  onComplete?: () => void;
}

function createMockScene(overrides: Record<string, unknown> = {}) {
  const tweens: TweenConfig[] = [];
  const createdTexts: Array<{ x: number; y: number; label: string; color?: string; depth?: number }> = [];
  const createdRectangles: unknown[] = [];

  const scene = {
    layout: {
      gameW: 1280,
      gameH: 720,
      hudY: 50,
    },
    settingsPanel: null,
    replayMode: false,
    templateIdFromCardId: (cardId: string) => `template-of-${cardId}`,
    incidentQueueContainer: { list: [] },
    soundManager: { play: vi.fn() },
    tweens: {
      add: vi.fn((config: TweenConfig) => {
        tweens.push(config);
        return {};
      }),
    },
    add: {
      container: vi.fn(() => ({
        add: vi.fn(),
        setDepth: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color: number, alpha: number) => {
        const rect = { x, y, w, h, color, alpha, setStrokeStyle: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis(), setAlpha: vi.fn().mockReturnThis(), destroy: vi.fn() };
        createdRectangles.push(rect);
        return rect;
      }),
      text: vi.fn((x: number, y: number, label: string, style: { color?: string } = {}) => {
        const text = {
          x, y, label, color: style.color,
          setOrigin: vi.fn().mockReturnThis(),
          setDepth: vi.fn((d: number) => { text.depth = d; return text; }),
          depth: 0,
        };
        createdTexts.push(text);
        return text;
      }),
    },
    ...overrides,
  };

  return { scene, tweens, createdTexts, createdRectangles };
}

function makeIncidentEvent(overrides: Partial<EventCard> = {}): EventCard {
  return {
    family: 'event',
    id: overrides.id ?? 'test-incident-event',
    name: overrides.name ?? 'Test Incident Event',
    trigger: 'Incident',
    cost: overrides.cost ?? 0,
    effect: overrides.effect ?? '-2 coins',
    target: overrides.target ?? 'All',
    targetSynergy: overrides.targetSynergy,
    coinDelta: overrides.coinDelta ?? -2,
    reputationDelta: overrides.reputationDelta ?? 0,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('MainStreetAnimator.animateIncidentReveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays the warning sting, flies the incident card to the board centre, flashes red, and pops HUD losses', () => {
    const { scene, tweens, createdTexts, createdRectangles } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: -1,
      from: { x: 400, y: 300 },
    });

    // Warning sting.
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.INCOME_NEGATIVE);

    // Flight: snapshot visual created at the queue origin, tweened to the
    // board centre with a slight scale-up.
    const visualCalls = scene.add.container.mock.calls;
    expect(visualCalls.length).toBeGreaterThan(0);
    expect(visualCalls[0]).toEqual([400, 300]);
    const flight = tweens.find((t) => t.yoyo !== true && (t.x as number | undefined) !== undefined);
    expect(flight).toBeDefined();
    expect(flight!.x).toBe(1280 / 2);
    expect(flight!.y).toBe(720 / 2);
    expect(flight!.scaleX).toBe(1.12);

    // Red flash: full-screen rectangle at depth 95 with a brief yoyo pulse.
    // (The first rectangle belongs to the flight snapshot visual's card bg.)
    const flash = createdRectangles.find((r) => (r as { w: number }).w === 1280) as { w: number; h: number; setDepth: ReturnType<typeof vi.fn> };
    expect(flash).toBeDefined();
    expect(flash.h).toBe(720);
    const flashTween = tweens.find((t) => t.yoyo === true);
    expect(flashTween).toMatchObject({ alpha: 0.22, duration: 130, hold: 80 });

    // Explicit HUD loss pops with negative colours.
    const lossTexts = createdTexts.filter((t) => t.label === '-2' || t.label === '-1');
    expect(lossTexts.map((t) => t.label).sort()).toEqual(['-1', '-2']);
    expect(lossTexts.every((t) => t.color === '#ff7777')).toBe(true);
    expect(popTextOrIcon).toHaveBeenCalledTimes(2);
  });

  it('pulses the active-effects warning indicator once', () => {
    const warnChar = String.fromCodePoint(0x26A0);
    const warnText = {
      type: 'Text',
      text: `${warnChar} Tax Hikes — 2 turns`,
      scaleX: 1,
      scaleY: 1,
      setScale: vi.fn(),
    };
    const { scene, tweens } = createMockScene({
      incidentQueueContainer: { list: [warnText] },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Tax Hikes',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    const pulse = tweens.find((t) => t.targets === warnText);
    expect(pulse).toMatchObject({ scaleX: 1.5, scaleY: 1.5, duration: 120, yoyo: true, hold: 60 });
  });

  it('keeps the sting + pops under reduced motion but skips flight, flash, and pulse', () => {
    const { scene, tweens, createdTexts, createdRectangles } = createMockScene({
      settingsPanel: { reducedMotion: true },
    });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    // Sound + pops retained...
    expect(scene.soundManager.play).toHaveBeenCalledWith(SFX_KEYS.INCOME_NEGATIVE);
    expect(createdTexts.some((t) => t.label === '-2')).toBe(true);
    expect(popTextOrIcon).toHaveBeenCalledTimes(1);
    // ...but no flight visual, no flash, no indicator pulse.
    expect(scene.add.container).not.toHaveBeenCalled();
    expect(createdRectangles).toHaveLength(0);
    expect(tweens).toHaveLength(0);
  });

  it('returns immediately in replay/headless mode (documented exemption)', () => {
    const { scene, tweens, createdTexts } = createMockScene({ replayMode: true });
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Power Outage',
      coinChange: -2,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    expect(scene.soundManager.play).not.toHaveBeenCalled();
    expect(tweens).toHaveLength(0);
    expect(createdTexts).toHaveLength(0);
  });

  it('skips the HUD pops when the incident has no resource deltas (sound still plays)', () => {
    const { scene, createdTexts } = createMockScene();
    const animator = new MainStreetAnimator(scene);

    animator.animateIncidentReveal({
      cardId: 'inc-1',
      incidentName: 'Neutral Event',
      coinChange: 0,
      repChange: 0,
      from: { x: 400, y: 300 },
    });

    expect(scene.soundManager.play).toHaveBeenCalled();
    expect(createdTexts.filter((t) => t.label.startsWith('-'))).toHaveLength(0);
    expect(popTextOrIcon).not.toHaveBeenCalled();
  });
});

describe('processEndOfTurn incident deltas', () => {
  it('surfaces the incident coin/reputation deltas on TurnResult', () => {
    const state: MainStreetState = setupMainStreetGame({ seed: 'incident-delta-test' });
    const incidentEvt = makeIncidentEvent({ coinDelta: -2, reputationDelta: -1 });
    state.incidentQueue = [incidentEvt];
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.incident).not.toBeNull();
    expect(result.incidentCoinChange).toBe(-2);
    expect(result.incidentRepChange).toBe(-1);
  });

  it('reports zero deltas when no incident resolves', () => {
    const state: MainStreetState = setupMainStreetGame({ seed: 'incident-delta-none' });
    state.incidentQueue = [];
    state.phase = 'MarketPhase';

    const result = processEndOfTurn(state);

    expect(result.incident).toBeNull();
    expect(result.incidentCoinChange).toBe(0);
    expect(result.incidentRepChange).toBe(0);
  });
});
