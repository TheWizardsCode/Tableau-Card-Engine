/**
 * MindConstants tests — verify all visual/styling constants exist
 * and have the expected values after magic-number extraction.
 *
 * This test file ensures the extracted constants are defined and
 * match the original inline values so visual behaviour is unchanged.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock src/ui to avoid loading Phaser (browser-only) in Node tests
vi.mock('../../src/ui', () => ({
  GAME_W: 1280,
  GAME_H: 720,
  FONT_FAMILY: 'sans-serif',
  CARD_W: 96,
  CARD_H: 134,
}));

import {
  // Existing constants (verify they still exist)
  PRE_PENALTY_PAUSE,
  DEPTH_OVERLAY,
  DEPTH_OVERLAY_CONTENT,
  // New overlay constants
  OVERLAY_BG_ALPHA,
  OVERLAY_BOX_WIDTH,
  OVERLAY_BOX_HEIGHT,
  OVERLAY_BOX_ALPHA,
  OVERLAY_BUTTON_FONT_SIZE,
  OVERLAY_BUTTON_Y_OFFSET,
  OVERLAY_BUTTON_SPACING,
  // New auto-play button constants
  AUTO_PLAY_BUTTON_X,
  AUTO_PLAY_BUTTON_MARGIN,
  AUTO_PLAY_FONT_SIZE,
  // New HUD/status constants
  STATUS_X_OFFSET,
  STATUS_LEVEL_Y,
  STATUS_LIVES_Y,
  // New pile constants
  PILE_COUNT_Y_OFFSET,
  PILE_COUNT_FONT_SIZE,
  PILE_VALUE_Y_OFFSET,
  PILE_VALUE_FONT_SIZE,
  // New instruction constants
  INSTRUCTION_MARGIN,
  INSTRUCTION_FONT_SIZE,
  // New hover constants
  HOVER_SCALE,
  HOVER_Y_OFFSET,
  // New flash/animation constants
  FLASH_DELAY,
  FLASH_REPEATS,
  FLASH_TIMER_OFFSET,
  // New penalty cleanup constant
  PENALTY_CLEANUP_EXTRA_DELAY,
  // New level complete constants
  LEVEL_COMPLETE_TEXT_Y_OFFSET,
  LEVEL_COMPLETE_FADE_IN_DURATION,
  LEVEL_COMPLETE_DISPLAY_DURATION,
  // New penalty card constants
  PENALTY_CARD_ALPHA,
} from '../../example-games/the-mind/scenes/MindConstants';

describe('MindConstants', () => {
  describe('existing constants are unchanged', () => {
    it('PRE_PENALTY_PAUSE is 120', () => {
      expect(PRE_PENALTY_PAUSE).toBe(120);
    });
    it('DEPTH_OVERLAY is 2000', () => {
      expect(DEPTH_OVERLAY).toBe(2000);
    });
    it('DEPTH_OVERLAY_CONTENT is 2001', () => {
      expect(DEPTH_OVERLAY_CONTENT).toBe(2001);
    });
  });

  describe('overlay constants', () => {
    it('OVERLAY_BG_ALPHA is 0.75', () => {
      expect(OVERLAY_BG_ALPHA).toBe(0.75);
    });
    it('OVERLAY_BOX_WIDTH is 460', () => {
      expect(OVERLAY_BOX_WIDTH).toBe(460);
    });
    it('OVERLAY_BOX_HEIGHT is 280', () => {
      expect(OVERLAY_BOX_HEIGHT).toBe(280);
    });
    it('OVERLAY_BOX_ALPHA is 0.9', () => {
      expect(OVERLAY_BOX_ALPHA).toBe(0.9);
    });
    it('OVERLAY_BUTTON_FONT_SIZE is "18px"', () => {
      expect(OVERLAY_BUTTON_FONT_SIZE).toBe('18px');
    });
    it('OVERLAY_BUTTON_Y_OFFSET is 60', () => {
      expect(OVERLAY_BUTTON_Y_OFFSET).toBe(60);
    });
    it('OVERLAY_BUTTON_SPACING is 90', () => {
      expect(OVERLAY_BUTTON_SPACING).toBe(90);
    });
  });

  describe('auto-play button constants', () => {
    it('AUTO_PLAY_BUTTON_X is 20', () => {
      expect(AUTO_PLAY_BUTTON_X).toBe(20);
    });
    it('AUTO_PLAY_BUTTON_MARGIN is 20', () => {
      expect(AUTO_PLAY_BUTTON_MARGIN).toBe(20);
    });
    it('AUTO_PLAY_FONT_SIZE is "12px"', () => {
      expect(AUTO_PLAY_FONT_SIZE).toBe('12px');
    });
  });

  describe('HUD/status constants', () => {
    it('STATUS_X_OFFSET is 100', () => {
      expect(STATUS_X_OFFSET).toBe(100);
    });
    it('STATUS_LEVEL_Y is 55', () => {
      expect(STATUS_LEVEL_Y).toBe(55);
    });
    it('STATUS_LIVES_Y is 79', () => {
      expect(STATUS_LIVES_Y).toBe(79);
    });
  });

  describe('pile constants', () => {
    it('PILE_COUNT_Y_OFFSET is 32', () => {
      expect(PILE_COUNT_Y_OFFSET).toBe(32);
    });
    it('PILE_COUNT_FONT_SIZE is "11px"', () => {
      expect(PILE_COUNT_FONT_SIZE).toBe('11px');
    });
    it('PILE_VALUE_Y_OFFSET is 14', () => {
      expect(PILE_VALUE_Y_OFFSET).toBe(14);
    });
    it('PILE_VALUE_FONT_SIZE is "14px"', () => {
      expect(PILE_VALUE_FONT_SIZE).toBe('14px');
    });
  });

  describe('instruction constants', () => {
    it('INSTRUCTION_MARGIN is 20', () => {
      expect(INSTRUCTION_MARGIN).toBe(20);
    });
    it('INSTRUCTION_FONT_SIZE is "12px"', () => {
      expect(INSTRUCTION_FONT_SIZE).toBe('12px');
    });
  });

  describe('hover interaction constants', () => {
    it('HOVER_SCALE is 1.03', () => {
      expect(HOVER_SCALE).toBe(1.03);
    });
    it('HOVER_Y_OFFSET is -4', () => {
      expect(HOVER_Y_OFFSET).toBe(-4);
    });
  });

  describe('flash/animation constants', () => {
    it('FLASH_DELAY is 150', () => {
      expect(FLASH_DELAY).toBe(150);
    });
    it('FLASH_REPEATS is 5', () => {
      expect(FLASH_REPEATS).toBe(5);
    });
    it('FLASH_TIMER_OFFSET is 50', () => {
      expect(FLASH_TIMER_OFFSET).toBe(50);
    });
  });

  describe('penalty animation constants', () => {
    it('PENALTY_CARD_ALPHA is 0.8', () => {
      expect(PENALTY_CARD_ALPHA).toBe(0.8);
    });
    it('PENALTY_CLEANUP_EXTRA_DELAY is 50', () => {
      expect(PENALTY_CLEANUP_EXTRA_DELAY).toBe(50);
    });
  });

  describe('level complete constants', () => {
    it('LEVEL_COMPLETE_TEXT_Y_OFFSET is 40', () => {
      expect(LEVEL_COMPLETE_TEXT_Y_OFFSET).toBe(40);
    });
    it('LEVEL_COMPLETE_FADE_IN_DURATION is 300', () => {
      expect(LEVEL_COMPLETE_FADE_IN_DURATION).toBe(300);
    });
    it('LEVEL_COMPLETE_DISPLAY_DURATION is 2000', () => {
      expect(LEVEL_COMPLETE_DISPLAY_DURATION).toBe(2000);
    });
  });
});
