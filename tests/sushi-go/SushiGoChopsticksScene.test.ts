/**
 * Tests for Sushi Go Chopsticks scene-level UX behavior.
 *
 * Verifies that the chopsticks button styling constants, instruction text,
 * and state transitions are consistent with the expected UX flow.
 *
 * These are unit tests focused on importable constants and exported
 * helper logic — not browser/integration tests for Phaser rendering.
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
  // Chopsticks button styling
  CHOPSTICKS_BUTTON_Y_OFFSET,
  CHOPSTICKS_BUTTON_BG,
  CHOPSTICKS_BUTTON_HOVER_BG,
  CHOPSTICKS_BUTTON_TEXT_COLOR,
  CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR,
  CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR,
  CHOPSTICKS_BUTTON_DEPTH,

  // Tableau highlight
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
  CHOPSTICKS_CANCEL_TEXT_COLOR,
  CHOPSTICKS_CANCEL_HOVER_COLOR,
  CHOPSTICKS_CANCEL_Y_OFFSET,
  CHOPSTICKS_CANCEL_BG,
  CHOPSTICKS_CANCEL_HOVER_BG,
  CHOPSTICKS_CANCEL_DEPTH,

  // Step indicator
  STEP_INDICATOR_COLOR,
  STEP_INDICATOR_Y_OFFSET,
  STEP_INDICATOR_DEPTH,
  STEP_INDICATOR_1_OF_2,
  STEP_INDICATOR_2_OF_2,

  // Suggest highlight
  CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR,
  CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA,
} from '../../example-games/sushi-go/scenes/SushiGoConstants';

describe('Chopsticks UX styling', () => {
  describe('button styling', () => {
    it('has a dark green background (0x1a3a2a)', () => {
      expect(CHOPSTICKS_BUTTON_BG).toBe(0x1a3a2a);
    });

    it('has a lighter green hover background (0x2a5a3a)', () => {
      expect(CHOPSTICKS_BUTTON_HOVER_BG).toBe(0x2a5a3a);
    });

    it('has light blue text color (#88ddff)', () => {
      expect(CHOPSTICKS_BUTTON_TEXT_COLOR).toBe('#88ddff');
    });

    it('has white hover text color (#ffffff)', () => {
      expect(CHOPSTICKS_BUTTON_HOVER_TEXT_COLOR).toBe('#ffffff');
    });

    it('has red text color when active (#ff8888)', () => {
      expect(CHOPSTICKS_BUTTON_ACTIVE_TEXT_COLOR).toBe('#ff8888');
    });

    it('is rendered at depth 700', () => {
      expect(CHOPSTICKS_BUTTON_DEPTH).toBe(700);
    });
  });

  describe('tableau highlight styling', () => {
    it('highlights chopsticks card in blue (#44aaff) when available', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_COLOR).toBe(0x44aaff);
    });

    it('highlights in gold (#ffaa44) when chopsticks mode is active', () => {
      expect(CHOPSTICKS_TABLEAU_ACTIVE_COLOR).toBe(0xffaa44);
    });

    it('has a semi-transparent fill (0.2)', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_ALPHA).toBe(0.2);
    });

    it('has padding of 8px', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_PADDING).toBe(8);
    });

    it('has a 2px stroke width', () => {
      expect(CHOPSTICKS_TABLEAU_HIGHLIGHT_STROKE).toBe(2);
    });
  });

  describe('first pick highlight styling', () => {
    it('uses bright green (0x00ff66)', () => {
      expect(HIGHLIGHT_FIRST_PICK_COLOR).toBe(0x00ff66);
    });

    it('has a thicker 4px stroke', () => {
      expect(HIGHLIGHT_FIRST_PICK_STROKE_WIDTH).toBe(4);
    });

    it('has more visible fill (0.25)', () => {
      expect(HIGHLIGHT_FIRST_PICK_FILL_ALPHA).toBe(0.25);
    });
  });

  describe('cancel button styling', () => {
    it('has red text color (#ff6666)', () => {
      expect(CHOPSTICKS_CANCEL_TEXT_COLOR).toBe('#ff6666');
    });

    it('has white hover text (#ffffff)', () => {
      expect(CHOPSTICKS_CANCEL_HOVER_COLOR).toBe('#ffffff');
    });

    it('is offset 55px from instruction text', () => {
      expect(CHOPSTICKS_CANCEL_Y_OFFSET).toBe(55);
    });

    it('has dark red background (0x4a2a2a)', () => {
      expect(CHOPSTICKS_CANCEL_BG).toBe(0x4a2a2a);
    });

    it('has lighter red hover background (0x6a3a3a)', () => {
      expect(CHOPSTICKS_CANCEL_HOVER_BG).toBe(0x6a3a3a);
    });

    it('is rendered at depth 700', () => {
      expect(CHOPSTICKS_CANCEL_DEPTH).toBe(700);
    });
  });

  describe('step indicator styling', () => {
    it('has gold color (#ffdd44)', () => {
      expect(STEP_INDICATOR_COLOR).toBe('#ffdd44');
    });

    it('is offset -40px from the chopsticks button', () => {
      expect(STEP_INDICATOR_Y_OFFSET).toBe(-40);
    });

    it('is rendered at depth 700', () => {
      expect(STEP_INDICATOR_DEPTH).toBe(700);
    });

    it('shows "Step 1 of 2" for the first pick', () => {
      expect(STEP_INDICATOR_1_OF_2).toBe('Step 1 of 2');
    });

    it('shows "Step 2 of 2" for the second pick', () => {
      expect(STEP_INDICATOR_2_OF_2).toBe('Step 2 of 2');
    });
  });

  describe('suggest highlight styling', () => {
    it('uses blue (0x4488ff)', () => {
      expect(CHOPSTICKS_SUGGEST_HIGHLIGHT_COLOR).toBe(0x4488ff);
    });

    it('has very subtle alpha (0.08)', () => {
      expect(CHOPSTICKS_SUGGEST_HIGHLIGHT_ALPHA).toBe(0.08);
    });
  });

  describe('button constants are self-consistent', () => {
    it('cancel button Y offset is greater than chopsticks button Y offset', () => {
      // Cancel button should appear below the chopsticks button
      expect(CHOPSTICKS_CANCEL_Y_OFFSET).toBeGreaterThan(CHOPSTICKS_BUTTON_Y_OFFSET);
    });

    it('first pick stroke is thicker than default highlight stroke', () => {
      expect(HIGHLIGHT_FIRST_PICK_STROKE_WIDTH).toBeGreaterThan(3);
    });

    it('first pick fill is more visible than default highlight fill', () => {
      expect(HIGHLIGHT_FIRST_PICK_FILL_ALPHA).toBeGreaterThan(0.15);
    });
  });
});
