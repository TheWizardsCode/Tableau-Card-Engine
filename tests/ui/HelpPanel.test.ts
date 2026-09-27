/**
 * Unit tests for HelpPanel — focused on the compact "Help" + ALPHA badge
 * header introduced by CG-0MUI9K4F8009DYJL.
 *
 * HelpPanel depends on Phaser at import time, so Phaser is mocked here to run
 * the panel in Node. Assertions exercise the public API (getters, open/close
 * lifecycle) rather than re-implementing production logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Phaser mock ────────────────────────────────────────────

vi.mock('phaser', () => {
  class GeometryMask {
    constructor(_scene: unknown, _graphics: unknown) {}
  }
  const Clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  return {
    default: {
      Scene: class {},
      Display: { Masks: { GeometryMask } },
      Math: { Clamp },
      GameObjects: {},
      Geom: {},
      Types: { GameObjects: { Text: {} } },
    },
    Scene: class {},
    Display: { Masks: { GeometryMask } },
    Math: { Clamp },
  };
});

import { HelpPanel } from '../../src/ui/HelpPanel';
import {
  ALPHA_BADGE_FILL,
  ALPHA_BADGE_LABEL,
  ALPHA_BADGE_HEIGHT,
} from '../../src/ui/AlphaBadge';
import { VERSION_LABEL_TEXT } from '../../src/ui/versionDisplay';

// ── Mock game objects ──────────────────────────────────────

function mockText(text: string, x = 0, y = 0) {
  return {
    text,
    x,
    y,
    width: 100,
    height: 20,
    visible: true,
    style: {} as Record<string, unknown>,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setCrop: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setX: vi.fn().mockReturnThis(),
    setY: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockRect(x = 0, y = 0, width = 0, height = 0, fillColor = 0, fillAlpha = 1) {
  return {
    x,
    y,
    width,
    height,
    fillColor,
    fillAlpha,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockContainer(x = 0, y = 0) {
  const children: any[] = [];
  return {
    x,
    y,
    list: children,
    visible: true,
    add: vi.fn((child: any) => {
      children.push(child);
    }),
    remove: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setX: vi.fn().mockReturnThis(),
    setY: vi.fn().mockReturnThis(),
    setMask: vi.fn().mockReturnThis(),
    clearMask: vi.fn().mockReturnThis(),
    bringToTop: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockGraphics() {
  return {
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function mockScene() {
  const add = {
    text: vi.fn((x: number, y: number, text: string, style?: unknown) => {
      const t = mockText(text, x, y);
      t.style = (style as Record<string, unknown>) ?? {};
      return t;
    }),
    rectangle: vi.fn(
      (x: number, y: number, w: number, h: number, fillColor: number, fillAlpha: number) =>
        mockRect(x, y, w, h, fillColor, fillAlpha),
    ),
    container: vi.fn((x: number, y: number) => mockContainer(x, y)),
    graphics: vi.fn(() => mockGraphics()),
  };

  return {
    add,
    scale: { width: 800, height: 600 },
    input: {
      on: vi.fn(),
      keyboard: { on: vi.fn(), off: vi.fn() },
    },
    tweens: {
      add: vi.fn((config: { onComplete?: () => void }) => {
        config.onComplete?.();
        return { stop: vi.fn() };
      }),
    },
    children: { depthSort: vi.fn() },
  } as unknown as Phaser.Scene;
}

// ── Tests ──────────────────────────────────────────────────

describe('HelpPanel compact header', () => {
  let scene: Phaser.Scene;
  let panel: HelpPanel;

  beforeEach(() => {
    scene = mockScene();
    panel = new HelpPanel(scene, {
      sections: [{ heading: 'Section', body: 'Body' }],
      showButton: false,
    });
  });

  it('renders a compact "Help" title', () => {
    expect(panel.helpTitle).toBeDefined();
    expect(panel.helpTitle.text).toBe('Help');
  });

  it('renders a red ALPHA badge showing the build version', () => {
    const badge = panel.alphaBadge;
    expect(badge).toBeDefined();
    expect(badge.text.text).toBe(ALPHA_BADGE_LABEL);
    expect(badge.text.text).toContain('ALPHA');
    expect(badge.text.text).toContain(VERSION_LABEL_TEXT);
    expect(badge.background.fillColor).toBe(ALPHA_BADGE_FILL);
    expect(badge.background.height).toBe(ALPHA_BADGE_HEIGHT);
  });

  it('places the badge beside the "Help" title without clipping the panel top', () => {
    const badge = panel.alphaBadge;
    const title = panel.helpTitle;

    // Compact inline header: badge sits on the title's row, to its right.
    expect(badge.y).toBe(title.y);
    expect(badge.x).toBeGreaterThan(title.x);
    expect(badge.y - badge.height / 2).toBeGreaterThanOrEqual(0);
  });

  it('includes the header in the panel scene children for screenshot exclusion', () => {
    const children = panel.getSceneChildren();
    expect(children).toContain((panel as any).container);
  });

  it('opens and closes without errors', () => {
    panel.open();
    expect(panel.isOpen).toBe(true);
    panel.close();
    expect(panel.isOpen).toBe(false);
  });

  it('destroys cleanly and is idempotent', () => {
    panel.destroy();
    expect(() => panel.destroy()).not.toThrow();
  });
});
