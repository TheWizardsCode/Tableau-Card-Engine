/**
 * GymI18nScene -- Demonstrates the core-engine I18n module.
 *
 * Features:
 *   - Register locale bundles (en, fr, de) at runtime
 *   - Switch between locales interactively with live UI text updates
 *   - t() key lookup with fallback when a key is missing in the active locale
 *   - Display current locale and registered locale keys
 *   - resetI18n() clearing all registered bundles
 *
 * @module example-games/gym/scenes/GymI18nScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_I18N_KEY } from '../GymRegistry';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

// ── I18n imports ──────────────────────────────────────────

import {
  registerLocale,
  setLocale,
  getLocale,
  t,
  resetI18n,
} from '../../../src/core-engine/I18n';

// ── Locale bundle definitions ──────────────────────────────

/** Keys used in the demo bundles. */
const KEYS = {
  GREETING: 'demo.greeting',
  FAREWELL: 'demo.farewell',
  INSTRUCTIONS: 'demo.instructions',
  TITLE: 'demo.title',
  MISSING_IN_FR: 'demo.missingInFr',
  ALWAYS_MISSING: 'demo.alwaysMissing',
} as const;

function enBundle(): Record<string, string> {
  return {
    [KEYS.GREETING]: 'Hello!',
    [KEYS.FAREWELL]: 'Goodbye!',
    [KEYS.INSTRUCTIONS]: 'Press the buttons below to switch locales.',
    [KEYS.TITLE]: 'I18n / Localisation Demo',
    [KEYS.MISSING_IN_FR]: 'This key exists only in English.',
  };
}

function frBundle(): Record<string, string> {
  return {
    [KEYS.GREETING]: 'Bonjour !',
    [KEYS.FAREWELL]: 'Au revoir !',
    [KEYS.INSTRUCTIONS]: 'Appuyez sur les boutons ci-dessous pour changer de locale.',
    [KEYS.TITLE]: 'Démo I18n / Localisation',
  };
}

function deBundle(): Record<string, string> {
  return {
    [KEYS.GREETING]: 'Hallo!',
    [KEYS.FAREWELL]: 'Tschüss!',
    [KEYS.INSTRUCTIONS]: 'Drücken Sie die Tasten unten, um die Sprache zu wechseln.',
    [KEYS.TITLE]: 'I18n / Lokalisierungs-Demo',
    [KEYS.MISSING_IN_FR]: 'Dieser Schlüssel existiert nur auf Englisch und Deutsch.',
  };
}

// ── Scene class ─────────────────────────────────────────────

export class GymI18nScene extends GymSceneBase {
  // ── UI elements that update on locale change ────────────
  private titleText!: Phaser.GameObjects.Text;
  private greetingText!: Phaser.GameObjects.Text;
  private farewellText!: Phaser.GameObjects.Text;
  private instructionsText!: Phaser.GameObjects.Text;
  private missingKeyText!: Phaser.GameObjects.Text;
  private unknownKeyText!: Phaser.GameObjects.Text;
  private localeIndicator!: Phaser.GameObjects.Text;
  private registeredStatus!: Phaser.GameObjects.Text;

  // ── Buttons ────────────────────────────────────────────
  private enBtn!: Phaser.GameObjects.Text;
  private frBtn!: Phaser.GameObjects.Text;
  private deBtn!: Phaser.GameObjects.Text;

  // ── Internals ──────────────────────────────────────────
  private localesRegistered = false;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;

  constructor() {
    super({ key: GYM_I18N_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('I18n / Localisation');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the core-engine I18n module: registerLocale(), setLocale(), getLocale(), t(), and resetI18n(). Locale bundles map string keys to translated values. The t() function resolves keys through the active locale, falls back to English, and finally returns the key itself as a last resort.',
      },
      {
        heading: 'Controls',
        body: '[ Register Locales ]: Register the en, fr, and de locale bundles.\n[ Set en ] / [ Set fr ] / [ Set de ]: Switch to the chosen locale; UI text updates live.\n[ Reset I18n ]: Clear all registered bundles (resetI18n()) and return to default.\nA "Missing key" demo shows a key that only exists in the English bundle — switching to French demonstrates fallback to English.\nAn "always missing" demo shows what happens when no bundle contains the key — it falls back to the key name itself.',
      },
      {
        heading: 'Usage Example',
        body: 'A card game supporting multiple languages registers locale bundles at startup: registerLocale("en", { "menu.play": "Play" }); registerLocale("fr", { "menu.play": "Jouer" });. A settings screen lets the player change the language, and all UI text updates automatically via t("menu.play"). The fallback chain ensures that untranslated keys still display something meaningful instead of crashing.',
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Register Locales ] → event log confirms en, fr, de registered\n2. Press [ Set fr ] → all UI labels switch to French; "Missing key" demo shows English fallback\n3. Press [ Set de ] → all UI labels switch to German; "Missing key" demo shows German\n4. Press [ Set en ] → all UI labels switch back to English\n5. Verify "Always missing" label always shows the key name as fallback\n6. Press [ Reset I18n ] → locale reverts to en, registered status clears, setLocale buttons disabled\n7. Verify locale indicator shows correct current locale after each switch',
      },
    ]);

    // ── Title (demonstrates t() with live update) ──────────
    this.titleText = createHudText(this, GAME_W / 2, 65, t(KEYS.TITLE), '#ffffff', {
      fontSize: '20px',
    }).setOrigin(0.5);

    // ── Demo display area ──────────────────────────────────
    const demoY = 100;
    const lineH = 24;

    this.localeIndicator = createHudText(this, 40, demoY, '', '#88ff88', {
      fontSize: '14px',
    });

    this.greetingText = createHudText(this, 40, demoY + lineH, '', '#ccddcc', {
      fontSize: '14px',
    });

    this.farewellText = createHudText(this, 40, demoY + lineH * 2, '', '#ccddcc', {
      fontSize: '14px',
    });

    this.instructionsText = createHudText(this, 40, demoY + lineH * 3, '', '#aaccaa', {
      fontSize: '12px',
    });

    // Missing-key fallback demo
    createHudText(this, 40, demoY + lineH * 5, '── Fallback Demos ──', '#669966', {
      fontSize: '12px',
    });

    this.missingKeyText = createHudText(this, 40, demoY + lineH * 6, '', '#ddaa66', {
      fontSize: '12px',
    });

    createHudText(this, 40, demoY + lineH * 7, '"Missing in FR" key (fallback to en):', '#888888', {
      fontSize: '11px',
    });

    this.unknownKeyText = createHudText(this, 40, demoY + lineH * 8, '', '#dd8866', {
      fontSize: '12px',
    });

    createHudText(this, 40, demoY + lineH * 9, '"Always missing" key (fallback to key name):', '#888888', {
      fontSize: '11px',
    });

    // ── Buttons row 1: Register / Reset ────────────────────
    const cx = GAME_W / 2;
    const btnY1 = 340;

    this.addButton(cx - 120, btnY1, '[ Register Locales ]', () => {
      this.registerDemoLocales();
    });

    this.addButton(cx + 80, btnY1, '[ Reset I18n ]', () => {
      this.resetI18nState();
    });

    // ── Buttons row 2: Locale switching ────────────────────
    const btnY2 = 370;

    this.enBtn = this.addButton(cx - 180, btnY2, '[ Set en ]', () => {
      this.switchLocale('en');
    });

    this.frBtn = this.addButton(cx - 40, btnY2, '[ Set fr ]', () => {
      this.switchLocale('fr');
    });

    this.deBtn = this.addButton(cx + 100, btnY2, '[ Set de ]', () => {
      this.switchLocale('de');
    });

    // Initially disable locale-switching buttons (no locales registered yet)
    this.enBtn.setAlpha(0.4);
    this.frBtn.setAlpha(0.4);
    this.deBtn.setAlpha(0.4);
    this.enBtn.disableInteractive();
    this.frBtn.disableInteractive();
    this.deBtn.disableInteractive();

    // ── Registered status ──────────────────────────────────
    this.registeredStatus = createHudText(this, 40, 410, 'Locales: none registered', '#888888', {
      fontSize: '11px',
    });

    // ── Event log ──────────────────────────────────────────
    this.eventLogResult = createEventLog(this, 440, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });

    // Initial display update (all text shows key names since no bundles registered)
    this.refreshDisplay();
    this.logEvent('Scene created. Register locales to begin.');
  }

  // ── I18n operations ─────────────────────────────────────

  private registerDemoLocales(): void {
    registerLocale('en', enBundle());
    registerLocale('fr', frBundle());
    registerLocale('de', deBundle());
    this.localesRegistered = true;

    // Enable locale buttons
    this.enBtn.setAlpha(1);
    this.frBtn.setAlpha(1);
    this.deBtn.setAlpha(1);
    this.enBtn.setInteractive({ useHandCursor: true });
    this.frBtn.setInteractive({ useHandCursor: true });
    this.deBtn.setInteractive({ useHandCursor: true });

    // Set default locale to English after registration
    try {
      setLocale('en');
    } catch (_) {
      // already 'en' by default
    }

    this.refreshDisplay();
    this.logEvent('Registered locales: en, fr, de');
  }

  private switchLocale(locale: string): void {
    if (!this.localesRegistered) {
      this.logEvent('Cannot set locale: no locales registered');
      return;
    }
    try {
      setLocale(locale);
      this.refreshDisplay();
      this.logEvent(`Set locale to "${locale}"`);
    } catch (e) {
      this.logEvent(`Error setting locale: ${(e as Error).message}`);
    }
  }

  private resetI18nState(): void {
    resetI18n();
    this.localesRegistered = false;

    // Disable locale buttons
    this.enBtn.setAlpha(0.4);
    this.frBtn.setAlpha(0.4);
    this.deBtn.setAlpha(0.4);
    this.enBtn.disableInteractive();
    this.frBtn.disableInteractive();
    this.deBtn.disableInteractive();

    this.refreshDisplay();
    this.logEvent('I18n reset: all locales cleared');
  }

  // ── Display helpers ─────────────────────────────────────

  /**
   * Refresh all display texts using current I18n state.
   */
  private refreshDisplay(): void {
    const current = getLocale();

    // Locale indicator
    this.localeIndicator.setText(`Current locale: "${current}"`);

    // Registered status
    const registeredCount = this.localesRegistered ? 3 : 0;
    this.registeredStatus.setText(
      `Locales: ${registeredCount > 0 ? 'en, fr, de' : 'none registered'} (${registeredCount} registered)`,
    );

    // Live-translated labels
    this.titleText.setText(t(KEYS.TITLE));
    this.greetingText.setText(`Greeting: ${t(KEYS.GREETING)}`);
    this.farewellText.setText(`Farewell: ${t(KEYS.FAREWELL)}`);
    this.instructionsText.setText(t(KEYS.INSTRUCTIONS));

    // Missing key demo — KEYS.MISSING_IN_FR is defined in en and de, but NOT in fr.
    // When locale is 'fr', t() should fall back to English and show the English value.
    this.missingKeyText.setText(`"${t(KEYS.MISSING_IN_FR)}"`);

    // Unknown key — no bundle defines this, so t() returns the key name itself.
    this.unknownKeyText.setText(`"${t(KEYS.ALWAYS_MISSING)}"`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 12) this.eventLog.shift();
    try {
      this.eventLogResult.render(this.eventLog);
    } catch (_) {
      // Ignore render errors during headless tests or early init
    }
  }
}
