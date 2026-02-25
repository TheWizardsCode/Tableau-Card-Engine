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
  const MockHelpPanel = vi.fn().mockImplementation(() => ({
    destroy: mockHelpPanelDestroy,
  }));

  const mockHelpButtonDestroy = vi.fn();
  const MockHelpButton = vi.fn().mockImplementation(() => ({
    destroy: mockHelpButtonDestroy,
  }));

  const mockSettingsPanelDestroy = vi.fn();
  const MockSettingsPanel = vi.fn().mockImplementation(() => ({
    destroy: mockSettingsPanelDestroy,
  }));

  const mockSettingsButtonDestroy = vi.fn();
  const MockSettingsButton = vi.fn().mockImplementation(() => ({
    destroy: mockSettingsButtonDestroy,
  }));

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

  public callDetectReplayMode() { this.detectReplayMode(); }
  public callInitEventSystem() { this.initEventSystem(); }
  public callInitSoundSystem(sfxKeys: readonly string[], mapping: Record<string, string>) {
    this.initSoundSystem(sfxKeys, mapping);
  }
  public callInitHelpPanel(sections: Array<{ heading: string; body: string }>) {
    this.initHelpPanel(sections);
  }
  public callInitSettingsPanel() { this.initSettingsPanel(); }
  public callEmitStateSettled(turnNumber: number, phase: 'setup' | 'playing' | 'ended') {
    this.emitStateSettled(turnNumber, phase);
  }
  public callShutdownBase() { this.shutdownBase(); }
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
  });

  describe('initHelpPanel()', () => {
    it('creates HelpPanel with provided sections', () => {
      const sections = [{ heading: 'Rules', body: 'Play cards.' }];
      scene.callInitHelpPanel(sections);
      expect(MockHelpPanel).toHaveBeenCalledOnce();
      expect(scene._helpPanel).toBeDefined();
    });

    it('creates HelpButton linked to the panel', () => {
      const sections = [{ heading: 'Rules', body: 'Play cards.' }];
      scene.callInitHelpPanel(sections);
      expect(MockHelpButton).toHaveBeenCalledOnce();
      expect(MockHelpButton).toHaveBeenCalledWith(scene, scene._helpPanel);
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

    it('creates SettingsButton linked to the panel', () => {
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitSettingsPanel();
      expect(MockSettingsButton).toHaveBeenCalledOnce();
      expect(MockSettingsButton).toHaveBeenCalledWith(scene, scene._settingsPanel);
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
      scene.callInitEventSystem();
      scene.callInitSoundSystem(['sfx-test'], {});
      scene.callInitHelpPanel([{ heading: 'H', body: 'B' }]);
      scene.callInitSettingsPanel();

      scene.callShutdownBase();

      expect(mockSmDestroy).toHaveBeenCalledOnce();
      expect(scene._soundManager).toBeNull();
      expect(mockBridgeDestroy).toHaveBeenCalledOnce();
      expect(mockRemoveAllListeners).toHaveBeenCalledOnce();
      expect(mockHelpPanelDestroy).toHaveBeenCalledOnce();
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
  });
});
