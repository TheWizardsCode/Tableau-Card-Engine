/**
 * ResourceHud Unit Tests
 *
 * Specifies the declared-set rendering contract of the reusable resource HUD:
 * exactly one labelled item per declared key, in declaration order, showing a
 * caller-supplied display label (or the authored key capitalised at most) and
 * the current value from the resource bag. Alignment resolves left / centre /
 * right around the SLL anchor point.
 *
 * Uses a minimal Phaser stub, matching `HintBar.test.ts`, so the component is
 * exercised headlessly in Node.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { FONT_FAMILY } from '../../src/ui/constants';
import { uiNodeSafeModules } from '../../src/ui/node-safe-modules';
import {
  ResourceHud,
  formatResourceLabel,
  readResourceValue,
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

  // ── Pure helpers ──────────────────────────────────────────

  describe('helpers', () => {
    it('readResourceValue returns a finite number or zero', () => {
      expect(readResourceValue({ heat: 3 }, 'heat')).toBe(3);
      expect(readResourceValue({}, 'heat')).toBe(0);
      expect(readResourceValue({ heat: Number.POSITIVE_INFINITY }, 'heat')).toBe(0);
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
