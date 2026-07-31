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
import { SettingsPanel } from '../../../src/ui/SettingsPanel';
import { SettingsButton } from '../../../src/ui/SettingsButton';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import type Phaser from 'phaser';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymHudComponentsLayoutJson from '../layouts/gym-hud-components.layout.json';
import {
  DEFAULT_VIEWPORT,
  SCENE_HEADER_Y,
  HUD_DEFAULT_VOLUME,
  INSTRUCTIONS_FONT_SIZE,
  HEADER_SUCCESS_COLOR,
  PANEL_STATUS_FONT_SIZE,
  PANEL_STATUS_OFFSET,
  PANEL_STATUS_X,
  DEPTH_INFO_FONT_SIZE,
  DEPTH_INFO_X,
  DEPTH_INFO_COLOR,
  EVENT_LOG_Y_OFFSET_HUD,
  EVENT_LOG_MAX_LINES_HUD,
  EVENT_LOG_LINE_HEIGHT_HUD,
  EVENT_LOG_FONT_SIZE,
  EVENT_LOG_HEADER_FONT_SIZE,
  EVENT_LOG_HEADER_COLOR,
  EVENT_LOG_LINE_X_HUD,
  HUD_LOG_MAX_LINES,
  HELP_STATUS_COLOR,
  SETTINGS_STATUS_COLOR,
} from './GymConstants';

// Parse the shared HUD Components scene layout once at module load.
const HUD_COMPONENTS_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymHudComponentsLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

/**
 * Resolve an anchor from the HUD Components SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveHudAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!HUD_COMPONENTS_LAYOUT) {
    return { x: GAME_W / 2, y: SCENE_HEADER_Y };
  }
  return anchorPoint(HUD_COMPONENTS_LAYOUT, zone, anchor, viewport, 1);
}

// ── Mock SoundManager for SettingsPanel demo ─────────────────

/**
 * Minimal mock SoundManager that implements the subset of the
 * SoundManager API consumed by SettingsPanel without requiring
 * a Phaser sound backend or audio files.
 */
class MockSoundManager {
  public muted = false;
  public volume = HUD_DEFAULT_VOLUME;

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
    heading: 'Features',
    body: 'Demonstrates the shared HelpPanel and SettingsPanel slide-out UI components, including their toggle buttons (? and ⚙). These panels provide reusable help content and player configuration (sound, reduced motion, keybindings) that any card game can integrate. The depth layering convention ensures panels always render above gameplay content, with input blockers preventing clicks from passing through to the scene underneath.',
  },
  {
    heading: 'Controls',
    body: '[ Open HelpPanel ]: Programmatically open the help slide-out panel via the open() method.\n[ Close HelpPanel ]: Programmatically close the help panel via the close() method.\n[ Open Settings ]: Open the settings panel (right sidebar).\n[ Close Settings ]: Close the settings panel.\n? button (bottom-left): Toggle help panel via the circular toggle button.\n⚙ button (bottom-left): Toggle settings panel via the circular toggle button.\nStatus lines (centre): Show open/closed state of each panel, updating live as panels are toggled.'
  },
  {
    heading: 'Usage Example',
    body: 'In a real card game, the help panel provides rule explanations triggered by a ? button. The settings panel lets players adjust volume, mute audio, or enable reduced motion for accessibility. The depth layering ensures these panels never clip behind game content, and the input blocker prevents errant clicks on the game board while a panel is open.'
  },
  {
    heading: 'Test Plan',
    body: '1. Press [ Open HelpPanel ] → help panel slides in from left, status shows open\n2. Press [ Close HelpPanel ] → help panel slides out, status shows closed\n3. Press [ Open Settings ] → settings panel slides in from right, status shows open\n4. Press [ Close Settings ] → settings panel slides out, status shows closed\n5. Verify status lines update correctly after each action\n6. Press the ? button → help panel toggles open/closed\n7. Press the ⚙ button → settings panel toggles open/closed\n8. Verify no depth layering issues (panels always on top)'
  },
];

// ── Scene ────────────────────────────────────────────────────

export class GymHudComponentsScene extends GymSceneBase {
  private settingsPanel!: SettingsPanel;
  private settingsButton!: SettingsButton;

  private eventLogResult!: EventLogResult;
  private eventLog: string[] = [];
  private readonly mockSound = new MockSoundManager();

  // Status line text references for update on panel toggle
  private helpStatusText!: Phaser.GameObjects.Text;
  private settingsStatusText!: Phaser.GameObjects.Text;

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

    const instructionsAnchor = resolveHudAnchor('instructions', 'center');
    const controlsAnchor = resolveHudAnchor('controls', 'center');
    const statusAnchor = resolveHudAnchor('status', 'center');
    const depthAnchor = resolveHudAnchor('depth', 'left');
    const logAnchor = resolveHudAnchor('log', 'center');

    const instructions = createHudText(
      this, cx, instructionsAnchor.y,
      'Use the buttons below or the ? and ⚙ toggle controls to interact with the shared HUD components.',
      HEADER_SUCCESS_COLOR,
      { fontSize: INSTRUCTIONS_FONT_SIZE },
    );
    instructions.setOrigin(0.5);

    // ── Interactive controls ─────────────────────────────

    this.initButtonBar(controlsAnchor.y);
    this.buttonBar!.addButton('[ Open HelpPanel ]', () => {
      this.helpPanel!.open();
      this._helpOpen = true;
      this.updateStatusLines();
      this.logEvent('HelpPanel: open() called');
    }, { zone: 'center' });
    this.buttonBar!.addButton('[ Close HelpPanel ]', () => {
      this.helpPanel!.close();
      this._helpOpen = false;
      this.updateStatusLines();
      this.logEvent('HelpPanel: close() called');
    }, { zone: 'center' });
    this.buttonBar!.addButton('[ Open Settings ]', () => {
      this.settingsPanel.open();
      this._settingsOpen = true;
      this.updateStatusLines();
      this.logEvent('SettingsPanel: open() called');
    }, { zone: 'center' });
    this.buttonBar!.addButton('[ Close Settings ]', () => {
      this.settingsPanel.close();
      this._settingsOpen = false;
      this.updateStatusLines();
      this.logEvent('SettingsPanel: close() called');
    }, { zone: 'center' });


    // ── Panel state indicators ──────────────────────────

    this.helpStatusText = createHudText(
      this, PANEL_STATUS_X, statusAnchor.y - PANEL_STATUS_OFFSET, 'HelpPanel: closed', HELP_STATUS_COLOR, { fontSize: PANEL_STATUS_FONT_SIZE },
    );
    this.settingsStatusText = createHudText(
      this, PANEL_STATUS_X, statusAnchor.y + PANEL_STATUS_OFFSET, 'SettingsPanel: closed', SETTINGS_STATUS_COLOR, { fontSize: PANEL_STATUS_FONT_SIZE },
    );

    // ── Depth layering info ─────────────────────────────

    createHudText(
      this, DEPTH_INFO_X, depthAnchor.y,
      'Depth: blocker=900, bg=901, content=902, close=903, ? btn=1101, ⚙ btn=1102',
      DEPTH_INFO_COLOR,
      { fontSize: DEPTH_INFO_FONT_SIZE },
    );

    // ── Init shared HUD components ──────────────────────

    this.initComponents();

    // ── Event log ───────────────────────────────────────

    this.eventLogResult = createEventLog(this, logAnchor.y + EVENT_LOG_Y_OFFSET_HUD, {
      headerText: '── Event Log ──',
      maxLines: EVENT_LOG_MAX_LINES_HUD,
      lineHeight: EVENT_LOG_LINE_HEIGHT_HUD,
      textColor: '#aaddaa',
      fontSize: EVENT_LOG_FONT_SIZE,
      headerFontSize: EVENT_LOG_HEADER_FONT_SIZE,
      headerColor: EVENT_LOG_HEADER_COLOR,
      lineX: EVENT_LOG_LINE_X_HUD,
    });

    this.logEvent('Scene ready — interact with HUD components above');
  }

  /**
   * Create the shared HUD components: HelpPanel and SettingsPanel.
   * Buttons are created automatically via showButton:true (default).
   */
  private initComponents(): void {
    // HelpPanel (integrated button created automatically)
    this.helpPanel = new HelpPanel(this, { sections: HELP_SECTIONS });
    this.helpButton = this.helpPanel.helpButton!;

    // SettingsPanel (integrated button created automatically)
    this.settingsPanel = new SettingsPanel(this, {
      soundManager: this.mockSound as any,
    });
    this.settingsButton = this.settingsPanel.settingsButton!;

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

  /**
   * Update both panel status line text objects to reflect
   * the current open/closed state of each panel.
   */
  private updateStatusLines(): void {
    this.helpStatusText.setText(`HelpPanel: ${this._helpOpen ? 'open' : 'closed'}`);
    this.settingsStatusText.setText(`SettingsPanel: ${this._settingsOpen ? 'open' : 'closed'}`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > HUD_LOG_MAX_LINES) this.eventLog.shift();
    if (this.eventLogResult) {
      this.eventLogResult.render(this.eventLog);
    }
  }
}
