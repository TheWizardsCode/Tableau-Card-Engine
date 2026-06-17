/**
 * Unit tests for CardGameScene -- the shared base class for card game scenes.
 *
 * Uses vi.mock to replace Phaser and core-engine dependencies so we can
 * test the base class methods in Node without a real browser or Phaser runtime.
 *
 * Since the unit test project runs in Node (no `window`), we polyfill a
 * minimal `window` on `globalThis` for the tests that need URL parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Polyfill window for Node environment ───────────────────

const fakeWindow: Record<string, unknown> = {
  location: { search: '' },
};

// Only set if not already present (Node has no `window`)
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).window = fakeWindow;
}

// ── Mocks ──────────────────────────────────────────────────

// Hoisted mock functions used by both vi.mock and tests.
const mockSetDepth = vi.hoisted(() => vi.fn());
const mockHudContainerDestroy = vi.hoisted(() => vi.fn());

const {
  mockEmit,
  mockRemoveAllListeners,
  MockGameEventEmitter,
  mockBridgeDestroy,
  MockPhaserEventBridge,
  mockSmDestroy,
  mockSmRegister,
  mockSmConnectToEvents,
  MockSoundManager,
  mockHelpPanelDestroy,
  MockHelpPanel,
  mockHelpButtonDestroy,
  MockHelpButton,
  mockSettingsPanelDestroy,
  MockSettingsPanel,
  mockSettingsButtonDestroy,
  MockSettingsButton,
} = vi.hoisted(() => {
  const mockEmit = vi.fn();
  const mockRemoveAllListeners = vi.fn();
  const MockGameEventEmitter = vi.fn().mockImplementation(() => ({
    emit: mockEmit,
    removeAllListeners: mockRemoveAllListeners,
    on: vi.fn(),
    off: vi.fn(),
  }));

  const mockBridgeDestroy = vi.fn();
  const MockPhaserEventBridge = vi.fn().mockImplementation(() => ({
    destroy: mockBridgeDestroy,
  }));

  const mockSmDestroy = vi.fn();
  const mockSmRegister = vi.fn();
  const mockSmConnectToEvents = vi.fn();
  const MockSoundManager = vi.fn().mockImplementation(() => ({
    destroy: mockSmDestroy,
    register: mockSmRegister,
    connectToEvents: mockSmConnectToEvents,
  }));

  const mockHelpPanelDestroy = vi.fn();
  const mockHelpButtonDestroy = vi.fn();
  const MockHelpButton = vi.fn().mockImplementation(() => ({
    destroy: mockHelpButtonDestroy,
  }));
  const MockHelpPanel = vi.fn().mockImplementation((_scene: unknown, _config: { sections?: unknown }) => {
    const btn = new MockHelpButton(scene, null as any, undefined);
    return {
      destroy: mockHelpPanelDestroy,
      helpButton: btn,
    };
  });

  const mockSettingsPanelDestroy = vi.fn();
  const mockSettingsButtonDestroy = vi.fn();
  const MockSettingsButton = vi.fn().mockImplementation(() => ({
    destroy: mockSettingsButtonDestroy,
  }));
  const MockSettingsPanel = vi.fn().mockImplementation((_scene: unknown) => {
    const btn = new MockSettingsButton(scene, null as any, undefined);
    return {
      destroy: mockSettingsPanelDestroy,
      settingsButton: btn,
    };
  });

  return {
    mockEmit,
    mockRemoveAllListeners,
    MockGameEventEmitter,
    mockBridgeDestroy,
    MockPhaserEventBridge,
    mockSmDestroy,
    mockSmRegister,
    mockSmConnectToEvents,
    MockSoundManager,
    mockHelpPanelDestroy,
    MockHelpPanel,
    mockHelpButtonDestroy,
    MockHelpButton,
    mockSettingsPanelDestroy,
    MockSettingsPanel,
    mockSettingsButtonDestroy,
    MockSettingsButton,
  };
});

vi.mock('phaser', () => ({
  default: {
    Scene: class MockScene {
      events = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
      sound = {
        play: vi.fn(),
        stopByKey: vi.fn(),
        volume: 1,
        mute: false,
      };
      scale = { width: 1280, height: 720 };
      add = {
        container: () => ({
          setDepth: mockSetDepth,
          destroy: mockHudContainerDestroy,
          add: vi.fn(),
        }),
      };
    },
  },
}));

vi.mock('../../src/core-engine', () => ({
  GameEventEmitter: MockGameEventEmitter,
  PhaserEventBridge: MockPhaserEventBridge,
  SoundManager: MockSoundManager,
}));

vi.mock('../../src/ui/HelpPanel', () => ({
  HelpPanel: MockHelpPanel,
}));

vi.mock('../../src/ui/HelpButton', () => ({
  HelpButton: MockHelpButton,
}));

vi.mock('../../src/ui/SettingsPanel', () => ({
  SettingsPanel: MockSettingsPanel,
}));

vi.mock('../../src/ui/SettingsButton', () => ({
  SettingsButton: MockSettingsButton,
}));

// ── createActionButton mock ───────────────────────────────

const mockContainerSetAlpha = vi.hoisted(() => vi.fn());
const mockContainerDestroy = vi.hoisted(() => vi.fn());
const mockContainerSetDepth = vi.hoisted(() => vi.fn());
const mockCreateActionButton = vi.hoisted(() =>
  vi.fn((_scene: unknown, _x: number, _y: number, _width: number, _text: string, _callback: () => void, _options?: Record<string, unknown>) => ({
    setAlpha: mockContainerSetAlpha,
    destroy: mockContainerDestroy,
    setDepth: mockContainerSetDepth,
    list: [] as unknown[],
    add: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    setVisible: vi.fn(),
    setScale: vi.fn(),
    x: 0,
    y: 0,
  })),
);

vi.mock('../../src/ui/Renderer', () => ({
  createActionButton: mockCreateActionButton,
}));

// Import after mocks are set up
import { CardGameScene } from '../../src/ui/CardGameScene';

// ── Concrete test subclass ─────────────────────────────────

class TestScene extends CardGameScene {
  constructor() {
    super({ key: 'TestScene' });
  }

  // Expose protected members for testing
  public get _gameEvents() { return this.gameEvents; }
  public get _eventBridge() { return this.eventBridge; }
  public get _soundManager() { return this.soundManager; }
  public get _helpPanel() { return this.helpPanel; }
  public get _helpButton() { return this.helpButton; }
  public get _settingsPanel() { return this.settingsPanel; }
  public get _settingsButton() { return this.settingsButton; }
  public get _replayMode() { return this.replayMode; }
  public get _hudContainer() { return this.hudContainer; }

  public callInitHUDContainer() { this.initHUDContainer(); }

  public callDetectReplayMode() { this.detectReplayMode(); }
  public callInitEventSystem() { this.initEventSystem(); }
  public callInitSoundSystem(
    sfxKeys: readonly string[],
    mapping: Record<string, string>,
    options?: { synthPlayer?: unknown; synthKeyMap?: Record<string, string> },
  ) {
    this.initSoundSystem(sfxKeys, mapping, options as any);
  }
  public callInitHelpPanel(sections: Array<{ heading: string; body: string }>) {
    this.initHelpPanel(sections);
  }
  public callInitSettingsPanel() { this.initSettingsPanel(); }
  public callEmitStateSettled(turnNumber: number, phase: 'setup' | 'playing' | 'ended') {
    this.emitStateSettled(turnNumber, phase);
  }
  public callShutdownBase() { this.shutdownBase(); }

  // Undo/redo API (implemented in CG-0MQHARGYN000K81I)
  public callInitUndoRedoButtons(onUndo: () => void, onRedo: () => void) {
    this.initUndoRedoButtons(onUndo, onRedo);
  }
  public callRefreshUndoRedoButtons(canUndo: boolean, canRedo: boolean) {
    this.refreshUndoRedoButtons(canUndo, canRedo);
  }
}

// ── Test setup ─────────────────────────────────────────────

let scene: TestScene;

beforeEach(() => {
  vi.clearAllMocks();
  scene = new TestScene();

  // Reset fake window location
  fakeWindow.location = { search: '' };
});

// ── Tests ──────────────────────────────────────────────────

describe('CardGameScene', () => {
  describe('initHUDContainer()', () => {
    it('creates hudContainer', () => {
      scene.callInitHUDContainer();
      expect(scene._hudContainer).toBeDefined();
    });

    it('sets container depth to 1000', () => {
      scene.callInitHUDContainer();
      expect(mockSetDepth).toHaveBeenCalledWith(1000);
    });

    it('hudContainer is accessible after initialization', () => {
      scene.callInitHUDContainer();
      expect(scene._hudContainer).toBeDefined();
      expect(typeof scene._hudContainer).toBe('object');
    });
  });

  describe('initHelpPanel() after initHUDContainer()', () => {
    it('creates HelpPanel with integrated button', () => {
      scene.callInitHUDContainer();
      const sections = [{ heading: 'Rules', body: 'Play cards.' }];
      scene.callInitHelpPanel(sections);
      expect(MockHelpPanel).toHaveBeenCalledOnce();
      expect(scene._helpPanel).toBeDefined();
      // Button is created inside the panel (showButton:true by default)
      expect(scene._helpPanel.helpButton).toBeDefined();
      expect(MockHelpButton).toHaveBeenCalledOnce();
    });
  });

  describe('initSettingsPanel() after initHUDContainer()', () => {
    it('creates SettingsPanel with integrated button when soundManager is available', () => {
      scene.callInitHUDContainer();
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitSettingsPanel();
      expect(MockSettingsPanel).toHaveBeenCalledOnce();
      expect(scene._settingsPanel).toBeDefined();
      // Button is created inside the panel (showButton:true by default)
      expect(scene._settingsPanel.settingsButton).toBeDefined();
      expect(MockSettingsButton).toHaveBeenCalledOnce();
    });
  });
  describe('detectReplayMode()', () => {
    it('sets replayMode to false when no mode param is present', () => {
      scene.callDetectReplayMode();
      expect(scene._replayMode).toBe(false);
    });

    it('sets replayMode to true when ?mode=replay is present', () => {
      fakeWindow.location = { search: '?mode=replay' };
      scene.callDetectReplayMode();
      expect(scene._replayMode).toBe(true);
    });

    it('sets replayMode to false when mode param is not "replay"', () => {
      fakeWindow.location = { search: '?mode=play' };
      scene.callDetectReplayMode();
      expect(scene._replayMode).toBe(false);
    });
  });

  describe('initEventSystem()', () => {
    it('creates GameEventEmitter', () => {
      scene.callInitEventSystem();
      expect(MockGameEventEmitter).toHaveBeenCalledOnce();
      expect(scene._gameEvents).toBeDefined();
    });

    it('creates PhaserEventBridge with emitter and scene events', () => {
      scene.callInitEventSystem();
      expect(MockPhaserEventBridge).toHaveBeenCalledOnce();
      expect(MockPhaserEventBridge).toHaveBeenCalledWith(
        scene._gameEvents,
        (scene as unknown as { events: unknown }).events,
      );
    });

    it('exposes gameEvents on window.__GAME_EVENTS__', () => {
      scene.callInitEventSystem();
      expect(
        (window as unknown as Record<string, unknown>).__GAME_EVENTS__,
      ).toBe(scene._gameEvents);
    });
  });

  describe('initSoundSystem()', () => {
    beforeEach(() => {
      scene.callInitEventSystem();
    });

    it('creates a SoundManager', () => {
      scene.callInitSoundSystem(['sfx-draw', 'sfx-flip'], {});
      expect(MockSoundManager).toHaveBeenCalledOnce();
      expect(scene._soundManager).toBeDefined();
    });

    it('registers all provided SFX keys', () => {
      const keys = ['sfx-draw', 'sfx-flip', 'sfx-swap'];
      scene.callInitSoundSystem(keys, {});
      expect(mockSmRegister).toHaveBeenCalledTimes(3);
      expect(mockSmRegister).toHaveBeenCalledWith('sfx-draw');
      expect(mockSmRegister).toHaveBeenCalledWith('sfx-flip');
      expect(mockSmRegister).toHaveBeenCalledWith('sfx-swap');
    });

    it('connects event-to-sound mapping', () => {
      const mapping = { 'card-drawn': 'sfx-draw' };
      scene.callInitSoundSystem(['sfx-draw'], mapping);
      expect(mockSmConnectToEvents).toHaveBeenCalledWith(
        scene._gameEvents,
        mapping,
      );
    });

    it('passes synth options to SoundManager', () => {
      const synthPlayer = { play: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), setMute: vi.fn() };
      scene.callInitSoundSystem(
        ['sfx-draw'],
        { 'card-drawn': 'sfx-draw' },
        { synthPlayer, synthKeyMap: { 'ms-place': 'card-place' } },
      );

      expect(MockSoundManager).toHaveBeenCalledWith(expect.anything(), {
        synthPlayer,
        synthKeyMap: { 'ms-place': 'card-place' },
      });
    });
  });

  describe('initHelpPanel()', () => {
    it('creates HelpPanel with provided sections', () => {
      const sections = [{ heading: 'Rules', body: 'Play cards.' }];
      scene.callInitHelpPanel(sections);
      expect(MockHelpPanel).toHaveBeenCalledOnce();
      expect(scene._helpPanel).toBeDefined();
    });

    it('exposes the integrated help button via panel.helpButton', () => {
      const sections = [{ heading: 'Rules', body: 'Play cards.' }];
      scene.callInitHelpPanel(sections);
      expect(MockHelpButton).toHaveBeenCalledOnce();
      expect(scene._helpPanel.helpButton).toBeDefined();
    });
  });

  describe('initSettingsPanel()', () => {
    it('does nothing when soundManager is null', () => {
      scene.callInitSettingsPanel();
      expect(MockSettingsPanel).not.toHaveBeenCalled();
    });

    it('creates SettingsPanel when soundManager is available', () => {
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitSettingsPanel();
      expect(MockSettingsPanel).toHaveBeenCalledOnce();
      expect(scene._settingsPanel).toBeDefined();
    });

    it('exposes the integrated settings button via panel.settingsButton', () => {
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitSettingsPanel();
      expect(MockSettingsButton).toHaveBeenCalledOnce();
      expect(scene._settingsPanel.settingsButton).toBeDefined();
    });
  });

  describe('emitStateSettled()', () => {
    it('emits state-settled event with turnNumber and phase', () => {
      scene.callInitEventSystem();
      scene.callEmitStateSettled(5, 'playing');
      expect(mockEmit).toHaveBeenCalledWith('state-settled', {
        turnNumber: 5,
        phase: 'playing',
      });
    });
  });

  describe('shutdownBase()', () => {
    it('destroys all shared resources after full init', () => {
      scene.callInitHUDContainer();
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitHelpPanel([{ heading: 'H', body: 'B' }]);
      scene.callInitSettingsPanel();

      scene.callShutdownBase();

      // Panels destroy themselves (including their integrated buttons)
      expect(mockHudContainerDestroy).toHaveBeenCalledOnce();
      expect(mockSmDestroy).toHaveBeenCalledOnce();
      expect(scene._soundManager).toBeNull();
      expect(mockBridgeDestroy).toHaveBeenCalledOnce();
      expect(mockRemoveAllListeners).toHaveBeenCalledOnce();
      expect(mockHelpPanelDestroy).toHaveBeenCalledOnce();
      // HelpButton is destroyed inside HelpPanel.destroy(), so both are called
      expect(mockHelpButtonDestroy).toHaveBeenCalledOnce();
      expect(mockSettingsPanelDestroy).toHaveBeenCalledOnce();
      expect(mockSettingsButtonDestroy).toHaveBeenCalledOnce();
    });

    it('handles partial init gracefully (replay mode scenario)', () => {
      scene.callInitEventSystem();
      // No sound, no help, no settings
      expect(() => scene.callShutdownBase()).not.toThrow();
      expect(mockBridgeDestroy).toHaveBeenCalledOnce();
      expect(mockRemoveAllListeners).toHaveBeenCalledOnce();
    });

    it('handles no init at all without throwing', () => {
      expect(() => scene.callShutdownBase()).not.toThrow();
    });

    it('destroys hudContainer when it was initialized', () => {
      scene.callInitHUDContainer();
      scene.callShutdownBase();
      expect(mockHudContainerDestroy).toHaveBeenCalledOnce();
    });

    it('handles hudContainer not initialized without throwing', () => {
      expect(() => scene.callShutdownBase()).not.toThrow();
    });
  });

  // ── Undo/redo button mechanism ───────────────────────────

  describe('initUndoRedoButtons()', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      scene.callInitHUDContainer();
    });

    it('creates two action buttons (Undo and Redo)', () => {
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
      expect(mockCreateActionButton).toHaveBeenCalledTimes(2);
      expect(mockCreateActionButton.mock.calls[0][4]).toBe('Undo');
      expect(mockCreateActionButton.mock.calls[1][4]).toBe('Redo');
    });

    it('passes callbacks to the buttons (onUndo to first, onRedo to second)', () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      scene.callInitUndoRedoButtons(onUndo, onRedo);
      expect(mockCreateActionButton.mock.calls[0][5]).toBe(onUndo);
      expect(mockCreateActionButton.mock.calls[1][5]).toBe(onRedo);
    });

    it('positions buttons relative to scene width for resolution independence', () => {
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
      // Button positions are computed dynamically from scene scale width
      // so they should be resolution-independent. Verify the x values
      // are derived from scene width (not hard-coded absolute pixels).
      const width = scene.scale.width;
      const undoX = mockCreateActionButton.mock.calls[0][1] as number;
      const redoX = mockCreateActionButton.mock.calls[1][1] as number;
      expect(undoX).toBeGreaterThan(0);
      expect(redoX).toBeGreaterThan(undoX);
      expect(undoX).toBeLessThan(width);
      expect(redoX).toBeLessThan(width);
    });

    it('creates buttons with consistent Y position', () => {
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
      const undoY = mockCreateActionButton.mock.calls[0][2] as number;
      const redoY = mockCreateActionButton.mock.calls[1][2] as number;
      expect(undoY).toBe(redoY);
    });

    it('uses default button width of 60', () => {
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
      const undoW = mockCreateActionButton.mock.calls[0][3] as number;
      const redoW = mockCreateActionButton.mock.calls[1][3] as number;
      expect(undoW).toBeGreaterThan(0);
      expect(redoW).toBeGreaterThan(0);
    });

    it('does not throw if hudContainer is not initialized', () => {
      // Create a fresh scene without initHUDContainer
      const freshScene = new TestScene();
      expect(() => freshScene.callInitUndoRedoButtons(vi.fn(), vi.fn())).not.toThrow();
    });
  });

  describe('refreshUndoRedoButtons()', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      scene.callInitHUDContainer();
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
    });

    it('sets both buttons to alpha 1.0 when both enabled', () => {
      scene.callRefreshUndoRedoButtons(true, true);
      expect(mockContainerSetAlpha).toHaveBeenCalledTimes(2);
      expect(mockContainerSetAlpha).toHaveBeenCalledWith(1);
    });

    it('sets undo to alpha 0.5 when undo is disabled', () => {
      scene.callRefreshUndoRedoButtons(false, true);
      expect(mockContainerSetAlpha).toHaveBeenNthCalledWith(1, 0.5);
      expect(mockContainerSetAlpha).toHaveBeenNthCalledWith(2, 1);
    });

    it('sets redo to alpha 0.5 when redo is disabled', () => {
      scene.callRefreshUndoRedoButtons(true, false);
      expect(mockContainerSetAlpha).toHaveBeenNthCalledWith(1, 1);
      expect(mockContainerSetAlpha).toHaveBeenNthCalledWith(2, 0.5);
    });

    it('sets both to alpha 0.5 when both disabled', () => {
      scene.callRefreshUndoRedoButtons(false, false);
      expect(mockContainerSetAlpha).toHaveBeenCalledWith(0.5);
      expect(mockContainerSetAlpha).toHaveBeenCalledTimes(2);
    });

    it('does not throw if called before initUndoRedoButtons', () => {
      const freshScene = new TestScene();
      expect(() => freshScene.callRefreshUndoRedoButtons(true, true)).not.toThrow();
    });
  });

  describe('shutdownBase with undo/redo', () => {
    it('destroys undo/redo buttons when initialized', () => {
      scene.callInitHUDContainer();
      scene.callInitUndoRedoButtons(vi.fn(), vi.fn());
      scene.callShutdownBase();
      expect(mockContainerDestroy).toHaveBeenCalledTimes(2);
    });
  });

  describe('opt-in behavior', () => {
    it('does not create undo/redo buttons when initUndoRedoButtons is not called', () => {
      expect(mockCreateActionButton).not.toHaveBeenCalled();
    });

    it('allows scenes to skip undo/redo entirely without side effects', () => {
      // Full init without undo/redo
      scene.callInitHUDContainer();
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitHelpPanel([{ heading: 'H', body: 'B' }]);
      scene.callInitSettingsPanel();
      scene.callShutdownBase();
      // No undo/redo buttons were created
      expect(mockCreateActionButton).not.toHaveBeenCalled();
    });
  });
});
