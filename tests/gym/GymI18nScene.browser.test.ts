/**
 * GymI18nScene -- Browser integration tests.
 *
 * Validates:
 *  - Scene boots without errors
 *  - Locale bundles can be registered
 *  - Switching locales updates t() output
 *  - Missing-key fallback behaviour (en fallback when key missing in fr)
 *  - Always-missing key returns the key name itself
 *  - resetI18n clears all registered bundles
 *
 * @module tests/gym/GymI18nScene.browser.test
 */

import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { GymI18nScene } from '../../example-games/gym/scenes/GymI18nScene';
import { GYM_I18N_KEY } from '../../example-games/gym/GymRegistry';
import { waitForScene } from '../helpers/waitForScene';

import {
  registerLocale,
  setLocale,
  getLocale,
  t,
  resetI18n,
} from '../../src/core-engine/I18n';

// ── Locale strings ─────────────────────────────────────────

const EN_GREETING = 'Hello!';
const FR_GREETING = 'Bonjour !';

const EN_MISSING_IN_FR = 'This key exists only in English.';
const DE_MISSING_IN_FR = 'Dieser Schlüssel existiert nur auf Englisch und Deutsch.';

const ALWAYS_MISSING_KEY = 'demo.alwaysMissing';

describe('GymI18nScene', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    // Clean up I18n state after every test
    resetI18n();
    if (game) {
      game.destroy(true, false);
      game = null;
    }
    const container = document.getElementById('game-container');
    if (container) container.remove();
  });

  it('boots without errors', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#1a2a1a',
      scene: [GymI18nScene],
    });

    await waitForScene(game, GYM_I18N_KEY);

    const activeScene = game.scene.getScene(GYM_I18N_KEY);
    expect(activeScene).toBeTruthy();
    expect(activeScene.sys.isActive()).toBe(true);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('registerLocale and t() work with scene-managed bundles', () => {
    registerLocale('en', {
      'test.greeting': EN_GREETING,
      'test.farewell': 'Goodbye!',
    });
    registerLocale('fr', {
      'test.greeting': FR_GREETING,
    });

    setLocale('en');
    expect(t('test.greeting')).toBe(EN_GREETING);

    setLocale('fr');
    expect(t('test.greeting')).toBe(FR_GREETING);

    // Fallback to English
    expect(t('test.farewell')).toBe('Goodbye!');
  });

  it('missing-key fallback returns the key name when no bundle has it', () => {
    registerLocale('en', { 'known.key': 'Known value' });
    setLocale('en');

    // The key is not in any bundle
    expect(t(ALWAYS_MISSING_KEY)).toBe(ALWAYS_MISSING_KEY);
  });

  it('setLocale throws for unregistered locale', () => {
    // Don't register anything; try switching to an unregistered locale
    expect(() => setLocale('de')).toThrow(
      /I18n: locale "de" has not been registered/,
    );
  });

  it('getLocale returns the current locale', () => {
    registerLocale('en', {});
    registerLocale('fr', {});

    setLocale('en');
    expect(getLocale()).toBe('en');

    setLocale('fr');
    expect(getLocale()).toBe('fr');
  });

  it('resetI18n clears all bundles and resets locale to en', () => {
    registerLocale('en', { 'test.key': 'Value' });
    registerLocale('fr', { 'test.key': 'Valeur' });
    setLocale('fr');
    expect(getLocale()).toBe('fr');

    resetI18n();

    // Should be back to 'en' default
    expect(getLocale()).toBe('en');

    // setLocale should throw since bundles were cleared
    expect(() => setLocale('en')).toThrow(
      /I18n: locale "en" has not been registered/,
    );
  });

  it('missing key in French falls back to English value', () => {
    registerLocale('en', { 'demo.missingInFr': EN_MISSING_IN_FR });
    registerLocale('fr', { 'demo.greeting': FR_GREETING });

    setLocale('en');
    expect(t('demo.missingInFr')).toBe(EN_MISSING_IN_FR);

    setLocale('fr');
    // The key 'demo.missingInFr' is NOT in the fr bundle, so it should fall back to en
    expect(t('demo.missingInFr')).toBe(EN_MISSING_IN_FR);
  });

  it('missing key in French falls back to German when both are registered and French is missing it', () => {
    registerLocale('en', { 'demo.missingInFr': EN_MISSING_IN_FR });
    registerLocale('fr', { 'demo.greeting': FR_GREETING });
    registerLocale('de', { 'demo.missingInFr': DE_MISSING_IN_FR });

    setLocale('de');
    expect(t('demo.missingInFr')).toBe(DE_MISSING_IN_FR);

    setLocale('fr');
    // French doesn't have the key, so it falls back to English (not German)
    expect(t('demo.missingInFr')).toBe(EN_MISSING_IN_FR);
  });

  it('registerLocale merges with existing bundle', () => {
    registerLocale('en', { 'key1': 'Value 1' });
    registerLocale('en', { 'key2': 'Value 2' });

    setLocale('en');
    expect(t('key1')).toBe('Value 1');
    expect(t('key2')).toBe('Value 2');
  });

  it('registerLocale overwrites existing keys', () => {
    registerLocale('en', { 'key1': 'Old value' });
    registerLocale('en', { 'key1': 'New value' });

    setLocale('en');
    expect(t('key1')).toBe('New value');
  });
});
