/**
 * ResourceHud Unit Tests
 *
 * Specifies the declared-set rendering contract of the reusable resource HUD:
 * exactly one labelled item per declared key, in declaration order, showing a
 * caller-supplied display label (or the authored key capitalised at most) and
 * the current value from the resource bag. Alignment resolves left / centre /
 * right around the SLL anchor point.
 *
 * Also specifies the bounds and loss-bearing contract: a bounded key prints
 * `value / max`, a key at a declared edge prints a state marker word, and a
 * key in the caller's irreversible subset prints the word `irreversible` —
 * each with a secondary colour cue, never colour alone (GDD §3.4.3).
 *
 * Uses a minimal Phaser stub, matching `HintBar.test.ts`, so the component is
 * exercised headlessly in Node.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { FONT_FAMILY } from '../../src/ui/constants';
import { uiNodeSafeModules } from '../../src/ui/node-safe-modules';
import {
  ResourceHud,
  RESOURCE_HUD_MARKERS,
  formatResourceAmount,
  formatResourceLabel,
  readResourceValue,
  resolveResourceState,
  type ResourceHudBounds,
  type ResourceHudOptions,
} from '../../src/ui/ResourceHud';

// ── Minimal Phaser stubs ──────────────────────────────────────

interface MockText {
  x: number;
  y: number;
  text: string;
  width: number;
  style: Record<string, unknown>;
  originX: number;
  originY: number;
  destroyed: boolean;
  setOrigin: (x: number, y?: number) => MockText;
  setText: (text: string) => MockText;
  setDepth: (depth: number) => MockText;
  destroy: () => void;
}

interface MockContainer {
  x: number;
  y: number;
  children: MockText[];
  destroyed: boolean;
  setPosition: (x: number, y: number) => MockContainer;
  add: (child: MockText | MockText[]) => MockContainer;
  destroy: () => void;
}

function makeText(
  x: number,
  y: number,
  text: string,
  style: Record<string, unknown>,
): MockText {
  const mock: MockText = {
    x,
    y,
    text,
    // Deterministic measured width (8 px per character) so alignment math is
    // assertable without a real canvas text-metrics implementation.
    width: text.length * 8,
    style,
    originX: 0,
    originY: 0,
    destroyed: false,
    setOrigin(ox: number, oy?: number) {
      mock.originX = ox;
      mock.originY = oy ?? ox;
      return mock;
    },
    setText(next: string) {
      mock.text = next;
      return mock;
    },
    setDepth() {
      return mock;
    },
    destroy() {
      mock.destroyed = true;
    },
  };
  return mock;
}

class MockScene {
  readonly texts: MockText[] = [];
  readonly containers: MockContainer[] = [];

  add = {
    text: (x: number, y: number, text: string, style: Record<string, unknown>) => {
      const created = makeText(x, y, text, style);
      this.texts.push(created);
      return created;
    },
    container: (x: number, y: number) => {
      const created: MockContainer = {
        x,
        y,
        children: [],
        destroyed: false,
        setPosition(nextX: number, nextY: number) {
          created.x = nextX;
          created.y = nextY;
          return created;
        },
        add(child: MockText | MockText[]) {
          const list = Array.isArray(child) ? child : [child];
          created.children.push(...list);
          return created;
        },
        destroy() {
          created.destroyed = true;
        },
      };
      this.containers.push(created);
      return created;
    },
  };

  scale = { width: 1280, height: 720 };
}

function makeHud(scene: MockScene, options: ResourceHudOptions): ResourceHud {
  return new ResourceHud(scene as any, options);
}

const DEFAULT_ITEM_GAP = 18;

const BASE_OPTIONS: ResourceHudOptions = {
  x: 400,
  y: 48,
  resources: { hull: 8, morale: 5, supply: 3 },
  declaredKeys: ['hull', 'morale', 'supply'],
};

describe('ResourceHud', () => {
  let scene: MockScene;

  beforeEach(() => {
    scene = new MockScene();
  });

  // ── Declared-set rendering ────────────────────────────────

  describe('declared-set rendering', () => {
    it('renders exactly one item per declared key, in declaration order', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(scene.texts).toHaveLength(3);
      expect(hud.getItems().map((item) => item.key)).toEqual([
        'hull',
        'morale',
        'supply',
      ]);
      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 8',
        'Morale 5',
        'Supply 3',
      ]);
    });

    it('puts the item texts into one container, in declaration order', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(scene.containers).toHaveLength(1);
      expect(hud.gameObject).toBe(scene.containers[0]);
      expect(scene.containers[0].children).toEqual(scene.texts);
    });

    it('reads each value from the supplied resource bag', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        resources: { hull: 2, morale: 7, supply: 1 },
      });

      expect(hud.getItems().map((item) => item.value)).toEqual([2, 7, 1]);
      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 2',
        'Morale 7',
        'Supply 1',
      ]);
    });

    it('reads an absent or non-finite value as zero', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        resources: { hull: 4, morale: Number.NaN },
      });

      expect(hud.getItems().map((item) => item.value)).toEqual([4, 0, 0]);
      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 4',
        'Morale 0',
        'Supply 0',
      ]);
    });

    it('renders an arbitrary key set without inventing default keys', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['supply', 'heat'],
        resources: { supply: 3, heat: -2 },
      });

      expect(hud.getItems().map((item) => item.key)).toEqual(['supply', 'heat']);
      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Supply 3',
        'Heat -2',
      ]);
    });

    it('normalises declared keys: trimmed, no blanks, no duplicates', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: [' hull ', '', 'morale', 'hull'],
        resources: { hull: 4, morale: 2 },
      });

      expect(hud.getItems().map((item) => item.key)).toEqual(['hull', 'morale']);
    });

    it('positions the container at the SLL anchor point', () => {
      makeHud(scene, BASE_OPTIONS);

      expect(scene.containers[0].x).toBe(400);
      expect(scene.containers[0].y).toBe(48);
    });

    it('exposes the current resources snapshot', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(hud.getResources()).toEqual({ hull: 8, morale: 5, supply: 3 });
    });
  });

  // ── Labels ────────────────────────────────────────────────

  describe('labels', () => {
    it('capitalises an unlabelled key at most', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'goodwill', 'charge'],
        resources: { hull: 0, goodwill: 0, charge: 0 },
      });

      expect(hud.getItems().map((item) => item.label)).toEqual([
        'Hull',
        'Goodwill',
        'Charge',
      ]);
    });

    it('does not invent pluralisation for an authored key', () => {
      expect(formatResourceLabel('supply')).toBe('Supply');
      expect(formatResourceLabel('stores')).toBe('Stores');
      expect(formatResourceLabel('hull')).toBe('Hull');
    });

    it('uses a caller-supplied label override', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale'],
        labels: { hull: 'Hull Integrity' },
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull Integrity 8',
        'Morale 5',
      ]);
    });

    it('falls back to the authored label for keys the labels record omits', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['supply', 'heat'],
        resources: { supply: 1, heat: 2 },
        labels: { supply: 'Supplies' },
      });

      expect(hud.getItems().map((item) => item.label)).toEqual([
        'Supplies',
        'Heat',
      ]);
    });
  });

  // ── Alignment ─────────────────────────────────────────────

  describe('alignment', () => {
    /** Rendered block width: item widths (8 px/char mock) + default gaps. */
    function blockWidth(hud: ResourceHud): number {
      const widths = hud.getItems().map((item) => item.text.width);
      return (
        widths.reduce((total, width) => total + width, 0) +
        DEFAULT_ITEM_GAP * Math.max(0, widths.length - 1)
      );
    }

    it('left aligns the block to the anchor by default', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(scene.containers[0].x).toBe(BASE_OPTIONS.x);
      expect(scene.containers[0].y).toBe(BASE_OPTIONS.y);
      expect(hud.getItems()[0].text.x).toBe(0);
    });

    it('centres the block on the anchor', () => {
      const hud = makeHud(scene, { ...BASE_OPTIONS, align: 'centre' });

      expect(scene.containers[0].x).toBe(BASE_OPTIONS.x - blockWidth(hud) / 2);
      expect(scene.containers[0].y).toBe(BASE_OPTIONS.y);
    });

    it('right aligns the block to the anchor (statusBar.resources)', () => {
      const hud = makeHud(scene, { ...BASE_OPTIONS, align: 'right' });

      expect(scene.containers[0].x).toBe(BASE_OPTIONS.x - blockWidth(hud));
      expect(scene.containers[0].y).toBe(BASE_OPTIONS.y);
    });

    it('lays items out left-to-right from the block origin', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      const xs = hud.getItems().map((item) => item.text.x);
      expect(xs[0]).toBe(0);
      expect(xs[1]).toBeGreaterThan(xs[0]);
      expect(xs[2]).toBeGreaterThan(xs[1]);
      const widths = hud.getItems().map((item) => item.text.width);
      expect(xs[1]).toBe(widths[0] + DEFAULT_ITEM_GAP);
      for (const item of hud.getItems()) {
        expect(item.text.originX).toBe(0);
        expect(item.text.originY).toBe(0.5);
        expect(item.text.y).toBe(0);
      }
    });

    it('honours a caller-supplied item gap in the alignment math', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        align: 'right',
        style: { itemGap: 40 },
      });
      const widths = hud.getItems().map((item) => item.text.width);
      const total =
        widths.reduce((sum, width) => sum + width, 0) + 40 * (widths.length - 1);

      expect(scene.containers[0].x).toBe(BASE_OPTIONS.x - total);
    });

    it('falls back to left alignment for an unknown runtime value', () => {
      makeHud(scene, { ...BASE_OPTIONS, align: 'middle' as never });

      expect(scene.containers[0].x).toBe(BASE_OPTIONS.x);
    });
  });

  // ── Styling ───────────────────────────────────────────────

  describe('styling', () => {
    it('applies the shared HUD defaults', () => {
      makeHud(scene, BASE_OPTIONS);

      expect(scene.texts[0].style.fontFamily).toBe(FONT_FAMILY);
      expect(scene.texts[0].style.fontSize).toBe('14px');
      expect(typeof scene.texts[0].style.color).toBe('string');
    });

    it('applies caller style overrides', () => {
      makeHud(scene, {
        ...BASE_OPTIONS,
        style: { fontSize: '18px', color: '#ffcc88' },
      });

      expect(scene.texts[0].style.fontSize).toBe('18px');
      expect(scene.texts[0].style.color).toBe('#ffcc88');
    });
  });

  // ── Bounds display ────────────────────────────────────────

  /** Explicit marker colours so colour assertions never read internals. */
  const MARKER_STYLE = {
    color: '#d8e0d8',
    fullColor: '#00ff00',
    emptyColor: '#ffaa00',
    irreversibleColor: '#ff0000',
  } as const;

  const HULL_BOUNDS: Record<string, ResourceHudBounds> = {
    hull: { min: 0, max: 5 },
    morale: { min: 0, max: 8 },
  };

  describe('bounds display', () => {
    it('renders the declared maximum beside the current value', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale'],
        resources: { hull: 4, morale: 5 },
        bounds: HULL_BOUNDS,
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 4 / 5',
        'Morale 5 / 8',
      ]);
    });

    it('renders no value / max for an unbounded key', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        bounds: { hull: { min: 0, max: 5 } },
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 8 / 5 full',
        'Morale 5',
        'Supply 3',
      ]);
    });

    it('exposes the declared bounds on the item', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale'],
        bounds: HULL_BOUNDS,
      });

      const [hull, morale] = hud.getItems();
      expect(hull.max).toBe(5);
      expect(hull.min).toBe(0);
      expect(morale.max).toBe(8);
      expect(morale.min).toBe(0);
    });

    it('is driven by arbitrary key sets and bounds, not the GDD keys', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['supply', 'heat'],
        resources: { supply: 3, heat: -2 },
        bounds: { supply: { min: 0, max: 4 }, heat: { min: -5, max: 4 } },
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Supply 3 / 4',
        'Heat -2 / 4',
      ]);
    });

    it('treats a non-finite declared maximum as unbounded', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale'],
        bounds: {
          hull: { min: 0, max: Number.NaN },
          morale: { min: 0, max: Number.POSITIVE_INFINITY },
        },
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Hull 8',
        'Morale 5',
      ]);
      expect(hud.getItems().map((item) => item.max)).toEqual([undefined, undefined]);
    });
  });

  // ── Printed state markers ─────────────────────────────────

  describe('printed state markers', () => {
    it('prints full at the declared maximum', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 5 },
        bounds: HULL_BOUNDS,
      });

      expect(hud.getItems()[0].text.text).toBe(`Hull 5 / 5 ${RESOURCE_HUD_MARKERS.full}`);
      expect(hud.getItems()[0].state).toBe('full');
    });

    it('prints full at or beyond the declared maximum', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 9 },
        bounds: HULL_BOUNDS,
      });

      expect(hud.getItems()[0].text.text).toBe(`Hull 9 / 5 ${RESOURCE_HUD_MARKERS.full}`);
    });

    it('prints empty at the declared minimum', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['morale'],
        resources: { morale: 0 },
        bounds: HULL_BOUNDS,
      });

      expect(hud.getItems()[0].text.text).toBe(
        `Morale 0 / 8 ${RESOURCE_HUD_MARKERS.empty}`,
      );
      expect(hud.getItems()[0].state).toBe('empty');
    });

    it('prints no state marker between the declared bounds', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['morale'],
        resources: { morale: 3 },
        bounds: HULL_BOUNDS,
      });

      expect(hud.getItems()[0].text.text).toBe('Morale 3 / 8');
      expect(hud.getItems()[0].state).toBeUndefined();
    });

    it('carries a secondary colour cue the printed marker does not depend on', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale', 'supply'],
        resources: { hull: 5, morale: 0, supply: 2 },
        bounds: HULL_BOUNDS,
        style: MARKER_STYLE,
      });

      const [full, empty, between] = hud.getItems();
      expect(full.color).toBe(MARKER_STYLE.fullColor);
      expect(empty.color).toBe(MARKER_STYLE.emptyColor);
      expect(between.color).toBe(MARKER_STYLE.color);
      // The printed word is the primary channel and is present without colour.
      expect(full.text.text).toContain(RESOURCE_HUD_MARKERS.full);
      expect(empty.text.text).toContain(RESOURCE_HUD_MARKERS.empty);
      expect(between.text.text).not.toContain(RESOURCE_HUD_MARKERS.full);
      expect(between.text.text).not.toContain(RESOURCE_HUD_MARKERS.empty);
    });

    it('defaults the state colours away from the base colour', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale', 'supply'],
        resources: { hull: 5, morale: 0, supply: 2 },
        bounds: HULL_BOUNDS,
      });

      const [full, empty, between] = hud.getItems();
      expect(full.color).not.toBe(between.color);
      expect(empty.color).not.toBe(between.color);
      expect(full.color).not.toBe(empty.color);
    });
  });

  // ── Irreversible marker ───────────────────────────────────

  describe('irreversible marker', () => {
    it('prints irreversible beside a loss-bearing key', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 4 },
        bounds: HULL_BOUNDS,
        irreversible: ['hull'],
      });

      expect(hud.getItems()[0].text.text).toBe(
        `Hull 4 / 5 ${RESOURCE_HUD_MARKERS.irreversible}`,
      );
      expect(hud.getItems()[0].irreversible).toBe(true);
    });

    it('carries the secondary colour cue alongside the printed word', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull', 'morale'],
        resources: { hull: 4, morale: 4 },
        irreversible: ['hull'],
        style: MARKER_STYLE,
      });

      const [hull, morale] = hud.getItems();
      expect(hull.color).toBe(MARKER_STYLE.irreversibleColor);
      expect(hull.text.text).toContain(RESOURCE_HUD_MARKERS.irreversible);
      expect(morale.color).toBe(MARKER_STYLE.color);
    });

    it('prints no irreversible marker outside the subset', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(hud.getItems().map((item) => item.irreversible)).toEqual([
        false,
        false,
        false,
      ]);
      for (const item of hud.getItems()) {
        expect(item.text.text).not.toContain(RESOURCE_HUD_MARKERS.irreversible);
      }
    });

    it('is driven by an arbitrary subset, not the GDD keys', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['supply', 'heat'],
        resources: { supply: 3, heat: 2 },
        irreversible: ['heat'],
      });

      expect(hud.getItems().map((item) => item.text.text)).toEqual([
        'Supply 3',
        `Heat 2 ${RESOURCE_HUD_MARKERS.irreversible}`,
      ]);
    });

    it('prints both the state marker and the irreversible marker', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 5 },
        bounds: HULL_BOUNDS,
        irreversible: ['hull'],
      });

      expect(hud.getItems()[0].text.text).toBe(
        `Hull 5 / 5 ${RESOURCE_HUD_MARKERS.full} ${RESOURCE_HUD_MARKERS.irreversible}`,
      );
    });

    it('prefers the irreversible colour cue when a key also sits at an edge', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 5 },
        bounds: HULL_BOUNDS,
        irreversible: ['hull'],
        style: MARKER_STYLE,
      });

      expect(hud.getItems()[0].color).toBe(MARKER_STYLE.irreversibleColor);
    });

    it('marks an unbounded irreversible key without inventing a maximum', () => {
      const hud = makeHud(scene, {
        ...BASE_OPTIONS,
        declaredKeys: ['hull'],
        resources: { hull: 4 },
        irreversible: ['hull'],
      });

      expect(hud.getItems()[0].text.text).toBe(
        `Hull 4 ${RESOURCE_HUD_MARKERS.irreversible}`,
      );
    });
  });

  // ── Pure helpers ──────────────────────────────────────────

  describe('helpers', () => {
    it('readResourceValue returns a finite number or zero', () => {
      expect(readResourceValue({ heat: 3 }, 'heat')).toBe(3);
      expect(readResourceValue({}, 'heat')).toBe(0);
      expect(readResourceValue({ heat: Number.POSITIVE_INFINITY }, 'heat')).toBe(0);
    });

    it('formatResourceAmount prints value alone or value / max', () => {
      expect(formatResourceAmount(5)).toBe('5');
      expect(formatResourceAmount(5, { min: 0, max: 8 })).toBe('5 / 8');
      expect(formatResourceAmount(5, { min: 0, max: Number.NaN })).toBe('5');
    });

    it('resolveResourceState reports the declared edge or nothing', () => {
      expect(resolveResourceState(8, { min: 0, max: 8 })).toBe('full');
      expect(resolveResourceState(9, { min: 0, max: 8 })).toBe('full');
      expect(resolveResourceState(0, { min: 0, max: 8 })).toBe('empty');
      expect(resolveResourceState(-1, { min: 0, max: 8 })).toBe('empty');
      expect(resolveResourceState(4, { min: 0, max: 8 })).toBeUndefined();
      expect(resolveResourceState(4)).toBeUndefined();
    });
  });

  // ── Lifecycle ─────────────────────────────────────────────

  describe('destroy', () => {
    it('destroys the container and every item text', () => {
      const hud = makeHud(scene, BASE_OPTIONS);
      hud.destroy();

      expect(hud.destroyed).toBe(true);
      expect(scene.containers[0].destroyed).toBe(true);
      expect(scene.texts.every((text) => text.destroyed)).toBe(true);
    });

    it('is safe to call destroy() multiple times', () => {
      const hud = makeHud(scene, BASE_OPTIONS);

      expect(() => {
        hud.destroy();
        hud.destroy();
      }).not.toThrow();
    });
  });

  // ── Node-surface constraint ───────────────────────────────

  describe('node-safe surface', () => {
    it('is not part of the node-safe ui module manifest (Phaser-bearing)', () => {
      const nodeSafe: readonly string[] = uiNodeSafeModules;
      expect(nodeSafe).not.toContain('ResourceHud');
      expect(nodeSafe).not.toContain('resourceHud');
    });
  });
});
