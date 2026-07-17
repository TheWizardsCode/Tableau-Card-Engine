/**
 * SushiGoConstants tests — verify all visual/styling constants exist
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
  // New constants for Sushi Go scene
  LABEL_X,
  LABEL_Y_OFFSET,
  LABEL_FONT_SIZE,
  ROUND_TEXT_Y,
  ROUND_TEXT_FONT_SIZE,
  TURN_TEXT_Y,
  TURN_TEXT_FONT_SIZE,
  CARDS_LEFT_TEXT_Y,
  CARDS_LEFT_TEXT_FONT_SIZE,
  INSTRUCTION_MARGIN,
  INSTRUCTION_FONT_SIZE,
  CHOPSTICKS_BUTTON_FONT_SIZE,
  CHOPSTICKS_BUTTON_Y_OFFSET,
  CHOPSTICKS_BUTTON_PADDING_X,
  CHOPSTICKS_BUTTON_PADDING_Y,
  CHOPSTICKS_BUTTON_BG,
  CHOPSTICKS_BUTTON_HOVER_BG,
  CHOPSTICKS_BUTTON_TEXT_COLOR,
  CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR,
  CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR,
  CHOPSTICKS_BUTTON_RADIUS,
  CHOPSTICKS_BUTTON_DEPTH,
  TOOLTIP_Y_OFFSET,
  TOOLTIP_CLAMP_BOUNDARY,
  TOOLTIP_FLIP_THRESHOLD,
  HIGHLIGHT_PADDING,
  HIGHLIGHT_STROKE_WIDTH,
  HIGHLIGHT_FILL_ALPHA,
  SCORE_TEXT_FONT_SIZE,
  // Turn animation delay
  TURN_ANIMATION_DELAY,
  // Chopsticks tableau highlight
  CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR,
  CHOPSTICKS_TABLEAU_ACTIVE_COLOR,
  CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA,
  CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING,
  CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE,
  // First pick highlight
  HIGHLIGHT_FIRST_PICK_COLOR,
  HIGHLIGHT_FIRST_PICK_STROKE_WIDTH,
  HIGHLIGHT_FIRST_PICK_FILL_ALPHA,
  // Cancel button
  CHOPSTICKS_CANCEL_FONT_SIZE,
  CHOPSTICKS_CANCEL_TEXT_COLOR,
  CHOPSTICKS_CANCEL_HOVER_COLOR,
  CHOPSTICKS_CANCEL_Y_OFFSET,
  CHOPSTICKS_CANCEL_PADDING_X,
  CHOPSTICKS_CANCEL_PADDING_Y,
  CHOPSTICKS_CANCEL_BG,
  CHOPSTICKS_CANCEL_HOVER_BG,
  CHOPSTICKS_CANCEL_DEPTH,
  // Step indicator
  STEP_INDICATOR_FONT_SIZE,
  STEP_INDICATOR_COLOR,
  STEP_INDICATOR_Y_OFFSET,
  STEP_INDICATOR_DEPTH,
  STEP_INDICATOR_1_OF_2,
  STEP_INDICATOR_2_OF_2,
  // Suggest highlight
  CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR,
  CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA,
} from '../../example-games/sushi-go/scenes/SushiGoConstants';

describe('SushiGoConstants', () => {
  describe('label constants', () => {
    it('LABEL_X is 25', () => {
      expect(LABEL_X).toBe(25);
    });
    it('LABEL_Y_OFFSET is -50', () => {
      expect(LABEL_Y_OFFSET).toBe(-50);
    });
    it('LABEL_FONT_SIZE is "18px"', () => {
      expect(LABEL_FONT_SIZE).toBe('18px');
    });
  });

  describe('score display Y positions', () => {
    it('ROUND_TEXT_Y is 51', () => {
      expect(ROUND_TEXT_Y).toBe(51);
    });
    it('ROUND_TEXT_FONT_SIZE is "20px"', () => {
      expect(ROUND_TEXT_FONT_SIZE).toBe('20px');
    });
    it('TURN_TEXT_Y is 75', () => {
      expect(TURN_TEXT_Y).toBe(75);
    });
    it('TURN_TEXT_FONT_SIZE is "16px"', () => {
      expect(TURN_TEXT_FONT_SIZE).toBe('16px');
    });
    it('CARDS_LEFT_TEXT_Y is 95', () => {
      expect(CARDS_LEFT_TEXT_Y).toBe(95);
    });
    it('CARDS_LEFT_TEXT_FONT_SIZE is "14px"', () => {
      expect(CARDS_LEFT_TEXT_FONT_SIZE).toBe('14px');
    });
    it('SCORE_TEXT_FONT_SIZE is "20px"', () => {
      expect(SCORE_TEXT_FONT_SIZE).toBe('20px');
    });
  });

  describe('instruction constants', () => {
    it('INSTRUCTION_MARGIN is 14', () => {
      expect(INSTRUCTION_MARGIN).toBe(14);
    });
    it('INSTRUCTION_FONT_SIZE is "15px"', () => {
      expect(INSTRUCTION_FONT_SIZE).toBe('15px');
    });
  });

  describe('chopsticks button constants', () => {
    it('CHOPSTICKS_BUTTON_FONT_SIZE is "16px"', () => {
      expect(CHOPSTICKS_BUTTON_FONT_SIZE).toBe('16px');
    });
    it('CHOPSTICKS_BUTTON_Y_OFFSET is 25', () => {
      expect(CHOPSTICKS_BUTTON_Y_OFFSET).toBe(25);
    });
    it('CHOPSTICKS_BUTTON_PADDING_X is 16', () => {
      expect(CHOPSTICKS_BUTTON_PADDING_X).toBe(16);
    });
    it('CHOPSTICKS_BUTTON_PADDING_Y is 8', () => {
      expect(CHOPSTICKS_BUTTON_PADDING_Y).toBe(8);
    });
    it('CHOPSTICKS_BUTTON_BG is 0x1a3a2a', () => {
      expect(CHOPSTICKS_BUTTON_BG).toBe(0x1a3a2a);
    });
    it('CHOPSTICKS_BUTTON_HOVER_BG is 0x2a5a3a', () => {
      expect(CHOPSTICKS_BUTTON_HOVER_BG).toBe(0x2a5a3a);
    });
    it('CHOPSTICKS_BUTTON_TEXT_COLOR is "#88ddff"', () => {
      expect(CHOPSTICKS_BUTTON_TEXT_COLOR).toBe('#88ddff');
    });
    it('CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR is "#ffffff"', () => {
      expect(CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR).toBe('#ffffff');
    });
    it('CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR is "#ff8888"', () => {
      expect(CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR).toBe('#ff8888');
    });
    it('CHOPSTICKS_BUTTON_RADIUS is 8', () => {
      expect(CHOPSTICKS_BUTTON_RADIUS).toBe(8);
    });
    it('CHOPSTICKS_BUTTON_DEPTH is 700', () => {
      expect(CHOPSTICKS_BUTTON_DEPTH).toBe(700);
    });
  });

  describe('tooltip constants', () => {
    it('TOOLTIP_Y_OFFSET is 40', () => {
      expect(TOOLTIP_Y_OFFSET).toBe(40);
    });
    it('TOOLTIP_CLAMP_BOUNDARY is 4', () => {
      expect(TOOLTIP_CLAMP_BOUNDARY).toBe(4);
    });
    it('TOOLTIP_FLIP_THRESHOLD is 30', () => {
      expect(TOOLTIP_FLIP_THRESHOLD).toBe(30);
    });
  });

  describe('highlight constants', () => {
    it('HIGHLIGHT_PADDING is 6', () => {
      expect(HIGHLIGHT_PADDING).toBe(6);
    });
    it('HIGHLIGHT_STROKE_WIDTH is 3', () => {
      expect(HIGHLIGHT_STROKE_WIDTH).toBe(3);
    });
    it('HIGHLIGHT_FILL_ALPHA is 0.15', () => {
      expect(HIGHLIGHT_FILL_ALPHA).toBe(0.15);
    });
    it('HIGHLIGHT_FIRST_PICK_COLOR is 0x00ff66', () => {
      expect(HIGHLIGHT_FIRST_PICK_COLOR).toBe(0x00ff66);
    });
    it('HIGHLIGHT_FIRST_PICK_STROKE_WIDTH is 4', () => {
      expect(HIGHLIGHT_FIRST_PICK_STROKE_WIDTH).toBe(4);
    });
    it('HIGHLIGHT_FIRST_PICK_FILL_ALPHA is 0.25', () => {
      expect(HIGHLIGHT_FIRST_PICK_FILL_ALPHA).toBe(0.25);
    });
  });

  describe('chopsticks tableau highlight', () => {
    it('CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR is 0x44aaff', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR).toBe(0x44aaff);
    });
    it('CHOPSTICKS_TABLEAU_ACTIVE_COLOR is 0xffaa44', () => {
      expect(CHOPSTICKS_TABLEAU_ACTIVE_COLOR).toBe(0xffaa44);
    });
    it('CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA is 0.2', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA).toBe(0.2);
    });
    it('CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING is 8', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING).toBe(8);
    });
    it('CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE is 2', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE).toBe(2);
    });
  });

  describe('cancel button constants', () => {
    it('CHOPSTICKS_CANCEL_FONT_SIZE is "14px"', () => {
      expect(CHOPSTICKS_CANCEL_FONT_SIZE).toBe('14px');
    });
    it('CHOPSTICKS_CANCEL_TEXT_COLOR is "#ff6666"', () => {
      expect(CHOPSTICKS_CANCEL_TEXT_COLOR).toBe('#ff6666');
    });
    it('CHOPSTICKS_CANCEL_HOVER_COLOR is "#ffffff"', () => {
      expect(CHOPSTICKS_CANCEL_HOVER_COLOR).toBe('#ffffff');
    });
    it('CHOPSTICKS_CANCEL_Y_OFFSET is 55', () => {
      expect(CHOPSTICKS_CANCEL_Y_OFFSET).toBe(55);
    });
    it('CHOPSTICKS_CANCEL_PADDING_X is 14', () => {
      expect(CHOPSTICKS_CANCEL_PADDING_X).toBe(14);
    });
    it('CHOPSTICKS_CANCEL_PADDING_Y is 6', () => {
      expect(CHOPSTICKS_CANCEL_PADDING_Y).toBe(6);
    });
    it('CHOPSTICKS_CANCEL_BG is 0x4a2a2a', () => {
      expect(CHOPSTICKS_CANCEL_BG).toBe(0x4a2a2a);
    });
    it('CHOPSTICKS_CANCEL_HOVER_BG is 0x6a3a3a', () => {
      expect(CHOPSTICKS_CANCEL_HOVER_BG).toBe(0x6a3a3a);
    });
    it('CHOPSTICKS_CANCEL_DEPTH is 700', () => {
      expect(CHOPSTICKS_CANCEL_DEPTH).toBe(700);
    });
  });

  describe('step indicator constants', () => {
    it('STEP_INDICATOR_FONT_SIZE is "15px"', () => {
      expect(STEP_INDICATOR_FONT_SIZE).toBe('15px');
    });
    it('STEP_INDICATOR_COLOR is "#ffdd44"', () => {
      expect(STEP_INDICATOR_COLOR).toBe('#ffdd44');
    });
    it('STEP_INDICATOR_Y_OFFSET is -40', () => {
      expect(STEP_INDICATOR_Y_OFFSET).toBe(-40);
    });
    it('STEP_INDICATOR_DEPTH is 700', () => {
      expect(STEP_INDICATOR_DEPTH).toBe(700);
    });
    it('STEP_INDICATOR_1_OF_2 is "Step 1 of 2"', () => {
      expect(STEP_INDICATOR_1_OF_2).toBe('Step 1 of 2');
    });
    it('STEP_INDICATOR_2_OF_2 is "Step 2 of 2"', () => {
      expect(STEP_INDICATOR_2_OF_2).toBe('Step 2 of 2');
    });
  });

  describe('chopsticks suggest highlight constants', () => {
    it('CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR is 0x4488ff', () => {
      expect(CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR).toBe(0x4488ff);
    });
    it('CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA is 0.08', () => {
      expect(CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA).toBe(0.08);
    });
  });

  describe('turn animation', () => {
    it('TURN_ANIMATION_DELAY is 300', () => {
      expect(TURN_ANIMATION_DELAY).toBe(300);
    });
  });
});
