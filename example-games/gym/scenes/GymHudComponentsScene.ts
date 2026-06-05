/**
 * GymHudComponentsScene -- Demonstrates shared HUD components
 * (HelpPanel, SettingsPanel, HelpButton, SettingsButton).
 *
 * Features:
 *   - Interactive buttons to open/close HelpPanel and SettingsPanel
 *   - HelpButton (?) and SettingsButton (⚙) toggle controls
 *   - Visual state indicators showing panel open/closed status and depth layering
 *   - Event log tracking all panel interactions
 *
 * @module example-games/gym/scenes/GymHudComponentsScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_HUD_COMPONENTS_KEY } from '../GymRegistry';
import { GAME_W } from '../../../src/ui/constants';
import { HelpPanel } from '../../../src/ui/HelpPanel';
import type { HelpSection } from '../../../src/ui/HelpPanel';
import { HelpButton } from '../../../src/ui/HelpButton';
import { SettingsPanel } from '../../../src/ui/SettingsPanel';
import { SettingsButton } from '../../../src/ui/SettingsButton';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

// ── Mock SoundManager for SettingsPanel demo ─────────────────

/**
 * Minimal mock SoundManager that implements the subset of the
 * SoundManager API consumed by SettingsPanel without requiring
 * a Phaser sound backend or audio files.
 */
class MockSoundManager {
  public muted = false;
  public volume = 0.8;

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  setVolume(ratio: number): void {
    this.volume = Math.max(0, Math.min(1, ratio));
  }
}

// ── Demo help content ─────────────────────────────────────────

const HELP_SECTIONS: HelpSection[] = [
  {
    heading: 'HelpPanel',
    body: 'A slide-in left sidebar that displays help content. Accepts an array of HelpSection objects with heading and body/render. Supports keyboard toggle (default: "/" with Shift = "?").',
  },
  {
    heading: 'SettingsPanel',
    body: 'A slide-in right sidebar with sound controls (mute toggle, volume slider), reduced-motion toggle, end-turn keybind config, and optional difficulty selector. Requires a SoundManager instance.',
  },
  {
    heading: 'Depth Layering',
    body: 'Panel components use the following depth convention:\n' +
      '  Input blocker: 900\n' +
      '  Panel background: 901\n' +
      '  Panel content: 902\n' +
      '  Close button: 903\n' +
      '  Help button (?): 1101\n' +
      '  Settings button (⚙): 1102\n' +
      'All gameplay content is at depth 0-999, so panels always render above it.',
  },
  {
    heading: 'HelpButton & SettingsButton',
    body: 'Circular toggle buttons rendered at depths 1101 and 1102 respectively. They automatically toggle their associated panel and handle cleanup on scene shutdown.',
  },
];

// ── Scene ────────────────────────────────────────────────────

export class GymHudComponentsScene extends GymSceneBase {
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  private eventLogResult!: EventLogResult;
  private eventLog: string[] = [];
  private readonly mockSound = new MockSoundManager();

  // Track panel visibility manually since HelpPanel/SettingsPanel
  // do not expose a public isOpen property.
  private _helpOpen = false;
  private _settingsOpen = false;

  constructor() {
    super({ key: GYM_HUD_COMPONENTS_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('HUD Components Demo');
    this.addDivider();
    this.initReducedMotion();

    // ── Instructions ────────────────────────────────────

    const cx = GAME_W / 2;
    let y = 56;

    const instructions = createHudText(
      this, cx, y,
      'Use the buttons below or the ? and ⚙ toggle controls to interact with the shared HUD components.',
      '#88aa88',
      { fontSize: '13px' },
    );
    instructions.setOrigin(0.5);

    // ── Interactive controls ─────────────────────────────

    y += 30;

    this.addButton(cx - 250, y, '[ Open HelpPanel ]', () => {
      this.helpPanel!.open();
      this._helpOpen = true;
      this.logEvent('HelpPanel: open() called');
    });
    this.addButton(cx - 110, y, '[ Close HelpPanel ]', () => {
      this.helpPanel!.close();
      this._helpOpen = false;
      this.logEvent('HelpPanel: close() called');
    });
    this.addButton(cx + 30, y, '[ Toggle HelpPanel ]', () => {
      this.helpPanel!.toggle();
      this._helpOpen = !this._helpOpen;
      this.logEvent(`HelpPanel: toggle() → ${this._helpOpen ? 'open' : 'closed'}`);
    });

    y += 30;

    this.addButton(cx - 130, y, '[ Open Settings ]', () => {
      this.settingsPanel.open();
      this._settingsOpen = true;
      this.logEvent('SettingsPanel: open() called');
    });
    this.addButton(cx + 10, y, '[ Close Settings ]', () => {
      this.settingsPanel.close();
      this._settingsOpen = false;
      this.logEvent('SettingsPanel: close() called');
    });
    this.addButton(cx + 150, y, '[ Toggle Settings ]', () => {
      this.settingsPanel.toggle();
      this._settingsOpen = !this._settingsOpen;
      this.logEvent(`SettingsPanel: toggle() → ${this._settingsOpen ? 'open' : 'closed'}`);
    });

    // ── Panel state indicators ──────────────────────────

    y += 36;
    createHudText(
      this, 60, y, 'HelpPanel: closed', '#88ff88', { fontSize: '14px' },
    );
    createHudText(
      this, 440, y, 'SettingsPanel: closed', '#ffcc44', { fontSize: '14px' },
    );

    // ── Depth layering info ─────────────────────────────

    y += 28;
    createHudText(
      this, 60, y,
      'Depth: blocker=900, bg=901, content=902, close=903, ? btn=1101, ⚙ btn=1102',
      '#88aa88',
      { fontSize: '12px' },
    );

    // ── Init shared HUD components ──────────────────────

    this.initComponents();

    // ── Event log ───────────────────────────────────────

    y += 44;
    this.eventLogResult = createEventLog(this, y + 10, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 60,
    });

    this.logEvent('Scene ready — interact with HUD components above');
  }

  /**
   * Create the shared HUD components: HelpPanel, HelpButton,
   * SettingsPanel, and SettingsButton.
   */
  private initComponents(): void {
    // HelpPanel + HelpButton (using inherited fields from GymSceneBase)
    this.helpPanel = new HelpPanel(this, { sections: HELP_SECTIONS });
    this.helpButton = new HelpButton(this, this.helpPanel);

    // SettingsPanel + SettingsButton (with mock SoundManager)
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.mockSound as any,
    });
    this.settingsButton = new SettingsButton(this, this.settingsPanel);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => this.cleanupComponents());
    this.events.on('destroy', () => this.cleanupComponents());

    this.logEvent('HelpPanel + HelpButton created');
    this.logEvent('SettingsPanel + SettingsButton created');
  }

  private cleanupComponents(): void {
    if (this.helpPanel) {
      try { this.helpPanel.destroy(); } catch (_) { /* ignore */ }
    }
    if (this.helpButton) {
      try { this.helpButton.destroy(); } catch (_) { /* ignore */ }
    }
    try {
      this.settingsPanel.destroy();
    } catch (_) { /* ignore */ }
    try {
      this.settingsButton.destroy();
    } catch (_) { /* ignore */ }
  }

  /**
   * Public helper — returns whether the HelpPanel is open.
   * Used by tests to verify panel state.
   */
  get isHelpOpen(): boolean {
    return this._helpOpen;
  }

  /**
   * Public helper — returns whether the SettingsPanel is open.
   * Used by tests to verify panel state.
   */
  get isSettingsOpen(): boolean {
    return this._settingsOpen;
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    if (this.eventLogResult) {
      this.eventLogResult.render(this.eventLog);
    }
  }
}
