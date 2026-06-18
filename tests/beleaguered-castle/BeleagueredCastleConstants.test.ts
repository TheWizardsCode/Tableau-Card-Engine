/**
 * BeleagueredCastleConstants tests — verify all visual/styling constants exist
 * and have the expected values after magic-number extraction.
 */
import { describe, it, expect } from 'vitest';
import {
  // Existing
  ANIM_DURATION,
  // New overlay constants
  OVERLAY_DEPTH,
  OVERLAY_BG_ALPHA,
  OVERLAY_TITLE_FONT_SIZE,
  OVERLAY_INFO_FONT_SIZE,
  OVERLAY_STATS_FONT_SIZE,
  OVERLAY_WIN_TITLE_Y_OFFSET,
  OVERLAY_CONTENT_Y_OFFSET,
  OVERLAY_BUTTON_Y_OFFSET,
  // New HUD constants
  HUD_MARGIN,
  HUD_FONT_SIZE,
  HUD_SEED_FONT_SIZE,
  // New foundation constants
  FOUNDATION_SLOT_ALPHA,
  FOUNDATION_BORDER_RADIUS,
  FOUNDATION_COUNT_FONT_SIZE,
  // New auto-complete constants
  AUTO_COMPLETE_STAGGER_MS,
  AUTO_COMPLETE_MIN_DURATION,
  // New resume overlay constants
  RESUME_TITLE_FONT_SIZE,
  RESUME_TITLE_Y_OFFSET,
  RESUME_INFO_Y_OFFSET,
  RESUME_BUTTON_Y_OFFSET,
  RESUME_BUTTON_SPACING,
  RESUME_INFO_FONT_SIZE,
} from '../../example-games/beleaguered-castle/scenes/BeleagueredCastleConstants';

describe('BeleagueredCastleConstants', () => {
  describe('existing constants unchanged', () => {
    it('ANIM_DURATION is 300', () => {
      expect(ANIM_DURATION).toBe(300);
    });
  });

  describe('overlay constants', () => {
    it('OVERLAY_DEPTH is 2000', () => {
      expect(OVERLAY_DEPTH).toBe(2000);
    });
    it('OVERLAY_BG_ALPHA is 0.75', () => {
      expect(OVERLAY_BG_ALPHA).toBe(0.75);
    });
    it('OVERLAY_TITLE_FONT_SIZE is "42px"', () => {
      expect(OVERLAY_TITLE_FONT_SIZE).toBe('42px');
    });
    it('OVERLAY_INFO_FONT_SIZE is "18px"', () => {
      expect(OVERLAY_INFO_FONT_SIZE).toBe('18px');
    });
    it('OVERLAY_STATS_FONT_SIZE is "22px"', () => {
      expect(OVERLAY_STATS_FONT_SIZE).toBe('22px');
    });
    it('OVERLAY_WIN_TITLE_Y_OFFSET is -80', () => {
      expect(OVERLAY_WIN_TITLE_Y_OFFSET).toBe(-80);
    });
    it('OVERLAY_CONTENT_Y_OFFSET is -20', () => {
      expect(OVERLAY_CONTENT_Y_OFFSET).toBe(-20);
    });
    it('OVERLAY_BUTTON_Y_OFFSET is 50', () => {
      expect(OVERLAY_BUTTON_Y_OFFSET).toBe(50);
    });
  });

  describe('HUD constants', () => {
    it('HUD_MARGIN is 28', () => {
      expect(HUD_MARGIN).toBe(28);
    });
    it('HUD_FONT_SIZE is "20px"', () => {
      expect(HUD_FONT_SIZE).toBe('20px');
    });
    it('HUD_SEED_FONT_SIZE is "18px"', () => {
      expect(HUD_SEED_FONT_SIZE).toBe('18px');
    });
  });

  describe('foundation slot constants', () => {
    it('FOUNDATION_SLOT_ALPHA is 0.6', () => {
      expect(FOUNDATION_SLOT_ALPHA).toBe(0.6);
    });
    it('FOUNDATION_BORDER_RADIUS is 6', () => {
      expect(FOUNDATION_BORDER_RADIUS).toBe(6);
    });
    it('FOUNDATION_COUNT_FONT_SIZE is "12px"', () => {
      expect(FOUNDATION_COUNT_FONT_SIZE).toBe('12px');
    });
  });

  describe('auto-complete constants', () => {
    it('AUTO_COMPLETE_STAGGER_MS is 100', () => {
      expect(AUTO_COMPLETE_STAGGER_MS).toBe(100);
    });
    it('AUTO_COMPLETE_MIN_DURATION is 50', () => {
      expect(AUTO_COMPLETE_MIN_DURATION).toBe(50);
    });
  });

  describe('resume overlay constants', () => {
    it('RESUME_TITLE_FONT_SIZE is "36px"', () => {
      expect(RESUME_TITLE_FONT_SIZE).toBe('36px');
    });
    it('RESUME_TITLE_Y_OFFSET is -60', () => {
      expect(RESUME_TITLE_Y_OFFSET).toBe(-60);
    });
    it('RESUME_INFO_Y_OFFSET is -15', () => {
      expect(RESUME_INFO_Y_OFFSET).toBe(-15);
    });
    it('RESUME_BUTTON_Y_OFFSET is 50', () => {
      expect(RESUME_BUTTON_Y_OFFSET).toBe(50);
    });
    it('RESUME_BUTTON_SPACING is 110', () => {
      expect(RESUME_BUTTON_SPACING).toBe(110);
    });
    it('RESUME_INFO_FONT_SIZE is "18px"', () => {
      expect(RESUME_INFO_FONT_SIZE).toBe('18px');
    });
  });
});
