/**
 * HelpButton / SettingsButton Unit Tests
 *
 * Behavioural regression lock for the two HUD icon buttons. These tests
 * assert observable behaviour through the public API so they pass identically
 * before and after migrating the classes onto `UIComponentBase`.
 *
 * Uses a minimal mock Phaser scene with a dispatchable hit-area emitter.
 */
import { describe, expect, it, vi } from 'vitest';

// The buttons import only depth constants from the panel modules, but those
// modules pull in runtime Phaser. Mock them so these lifecycle tests run in
// the Node unit environment without a DOM.
vi.mock('../../src/ui/HelpPanel', () => ({ DEPTH_HELP_BUTTON: 1000 }));
vi.mock('../../src/ui/SettingsPanel', () => ({ DEPTH_SETTINGS_BUTTON: 1000 }));

import { HelpButton } from '../../src/ui/HelpButton';
import { SettingsButton } from '../../src/ui/SettingsButton';

// ── Minimal mock Phaser objects ──────────────────────────────

function attachEmitter(target: Record<string, any>): Record<string, any> {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  target.on = vi.fn((event: string, fn: (...args: any[]) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
    return target;
  });
  target.off = vi.fn((event: string, fn: (...args: any[]) => void) => {
    handlers.get(event)?.delete(fn);
    return target;
  });
  target.emit = (event: string, ...args: any[]) => {
    for (const fn of Array.from(handlers.get(event) ?? [])) fn(...args);
  };
  return target;
}

function makeGraphics(): Record<string, any> {
  return {
    setDepth: vi.fn().mockReturnThis(),
    clear: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    strokeCircle: vi.fn().mockReturnThis(),
    fillStyle: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function makeText(x: number, y: number, text: string): Record<string, any> {
  return {
    x,
    y,
    text,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
}

function makeZone(): Record<string, any> {
  const zone: Record<string, any> = {
    setDepth: vi.fn().mockReturnThis(),
    setPosition: vi.fn().mockReturnThis(),
    setInteractive: vi.fn().mockReturnThis(),
    disableInteractive: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
  };
  return attachEmitter(zone);
}

function createMockScene(hudContainer?: Record<string, any>): any {
  const scene: Record<string, any> = {
    scale: { width: 1280, height: 720 },
    add: {
      graphics: vi.fn(() => makeGraphics()),
      text: vi.fn((x: number, y: number, text: string) => makeText(x, y, text)),
      zone: vi.fn(() => makeZone()),
    },
  };
  if (hudContainer) scene.hudContainer = hudContainer;
  return scene;
}

/** Find a handler registered for an event on a mock emitter. */
function getHandler(emitter: Record<string, any>, event: string): (...args: any[]) => void {
  const call = (emitter.on as ReturnType<typeof vi.fn>).mock.calls.find((c: any[]) => c[0] === event);
  if (!call) throw new Error(`No handler registered for ${event}`);
  return call[1];
}

// ── HelpButton tests ─────────────────────────────────────────

describe('HelpButton', () => {
  it('renders the "?" label and toggles the help panel on pointerdown', () => {
    const scene = createMockScene();
    const panel = { toggle: vi.fn() };
    const button = new HelpButton(scene, panel as any);

    const label = (button as any).label;
    expect(label.text).toBe('?');

    const hitArea = (button as any).hitArea;
    getHandler(hitArea, 'pointerdown')();
    expect(panel.toggle).toHaveBeenCalledTimes(1);
  });

  it('changes the label colour on hover and restores it on pointerout', () => {
    const scene = createMockScene();
    const button = new HelpButton(scene, { toggle: vi.fn() } as any);
    const label = (button as any).label;
    const hitArea = (button as any).hitArea;

    getHandler(hitArea, 'pointerover')();
    expect(label.setColor).toHaveBeenLastCalledWith('#ffffff');

    getHandler(hitArea, 'pointerout')();
    expect(label.setColor).toHaveBeenLastCalledWith('#f0c040');
  });

  it('parents its visuals into the HUD container when one is present', () => {
    const hudContainer = { add: vi.fn() };
    const scene = createMockScene(hudContainer);
    new HelpButton(scene, { toggle: vi.fn() } as any);
    expect(hudContainer.add).toHaveBeenCalledTimes(3);
  });

  it('setVisible(false) suppresses interaction and setVisible(true) restores it', () => {
    const scene = createMockScene();
    const panel = { toggle: vi.fn() };
    const button = new HelpButton(scene, panel as any);
    const hitArea = (button as any).hitArea;

    button.setVisible(false);
    hitArea.emit('pointerdown');
    expect(panel.toggle).not.toHaveBeenCalled();

    button.setVisible(true);
    hitArea.emit('pointerdown');
    expect(panel.toggle).toHaveBeenCalledTimes(1);
  });

  it('exposes its scene children', () => {
    const scene = createMockScene();
    const button = new HelpButton(scene, { toggle: vi.fn() } as any);
    expect(button.getSceneChildren()).toEqual([
      (button as any).circle,
      (button as any).label,
      (button as any).hitArea,
    ]);
  });

  it('destroy() is idempotent and ignores interaction afterwards', () => {
    const scene = createMockScene();
    const panel = { toggle: vi.fn() };
    const button = new HelpButton(scene, panel as any);
    const circle = (button as any).circle;
    const hitArea = (button as any).hitArea;

    button.destroy();
    button.destroy();

    expect(circle.destroy).toHaveBeenCalledTimes(1);
    hitArea.emit('pointerdown');
    expect(panel.toggle).not.toHaveBeenCalled();
  });
});

// ── SettingsButton tests ─────────────────────────────────────

describe('SettingsButton', () => {
  it('renders the gear label and toggles the settings panel on pointerdown', () => {
    const scene = createMockScene();
    const panel = { toggle: vi.fn() };
    const button = new SettingsButton(scene, panel as any);

    expect((button as any).label.text).toBe('\u2699');

    getHandler((button as any).hitArea, 'pointerdown')();
    expect(panel.toggle).toHaveBeenCalledTimes(1);
  });

  it('changes the label colour on hover and restores it on pointerout', () => {
    const scene = createMockScene();
    const button = new SettingsButton(scene, { toggle: vi.fn() } as any);
    const label = (button as any).label;
    const hitArea = (button as any).hitArea;

    getHandler(hitArea, 'pointerover')();
    expect(label.setColor).toHaveBeenLastCalledWith('#ffffff');

    getHandler(hitArea, 'pointerout')();
    expect(label.setColor).toHaveBeenLastCalledWith('#f0c040');
  });

  it('parents its visuals into the HUD container when one is present', () => {
    const hudContainer = { add: vi.fn() };
    const scene = createMockScene(hudContainer);
    new SettingsButton(scene, { toggle: vi.fn() } as any);
    expect(hudContainer.add).toHaveBeenCalledTimes(3);
  });

  it('destroy() is idempotent and ignores interaction afterwards', () => {
    const scene = createMockScene();
    const panel = { toggle: vi.fn() };
    const button = new SettingsButton(scene, panel as any);
    const circle = (button as any).circle;
    const hitArea = (button as any).hitArea;

    button.destroy();
    button.destroy();

    expect(circle.destroy).toHaveBeenCalledTimes(1);
    hitArea.emit('pointerdown');
    expect(panel.toggle).not.toHaveBeenCalled();
  });
});
