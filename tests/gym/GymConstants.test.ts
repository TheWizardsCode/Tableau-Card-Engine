/**
 * GymConstants - sanity tests.
 *
 * Validates that the shared constants module exports the expected
 * named constants with their original (pre-extraction) values, so
 * that future refactors cannot silently change visual behaviour.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT,
  SCENE_HEADER_Y,
  PREV_BUTTON_X,
  NEXT_BUTTON_X,
  NAV_BUTTON_FONT_SIZE,
  ANIMATION_DURATION_DEFAULT,
  DEFAULT_FONT_SIZE,
  DIVIDER_DEFAULT_Y_OFFSET,
  HELP_PANEL_WIDTH_PERCENT,
  EVENT_LOG_Y_OFFSET,
  EVENT_LOG_MAX_LINES_DEFAULT,
  EVENT_LOG_LINE_HEIGHT_DEFAULT,
  EVENT_LOG_FONT_SIZE,
  EVENT_LOG_HEADER_FONT_SIZE,
  EVENT_LOG_HEADER_COLOR,
  EVENT_LOG_LINE_X,
  STATUS_FONT_SIZE,
  INTENSITY_STEP,
  DEFAULT_VOLUME,
  VOLUME_STEP,
  STARTING_HAND_SIZE,
  SCREENSHOT_THUMB_SCALE,
  TRANSCRIPT_PLAYBACK_DELAY_MS,
  BLACKJACK_BUST_THRESHOLD,
  BLACKJACK_ACE_VALUE_HIGH,
  BLACKJACK_ACE_VALUE_ADJUSTMENT,
  BLACKJACK_FACE_CARD_VALUE,
  BLACKJACK_MIN_CARD,
  BLACKJACK_MAX_CARD_RAW,
  BLACKJACK_FACE_CARD_RAW,
} from '../../example-games/gym/scenes/GymConstants';

describe('GymConstants', () => {
  it('exports the shared viewport and layout constants', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ width: 1280, height: 720 });
    expect(SCENE_HEADER_Y).toBe(60);
    expect(PREV_BUTTON_X).toBe(120);
    expect(NEXT_BUTTON_X).toBe(210);
  });

  it('exports the shared typography and timing constants', () => {
    expect(NAV_BUTTON_FONT_SIZE).toBe('12px');
    expect(DEFAULT_FONT_SIZE).toBe('14px');
    expect(STATUS_FONT_SIZE).toBe('16px');
    expect(ANIMATION_DURATION_DEFAULT).toBe(300);
  });

  it('exports the shared divider and help panel defaults', () => {
    expect(DIVIDER_DEFAULT_Y_OFFSET).toBe(36);
    expect(HELP_PANEL_WIDTH_PERCENT).toBe(35);
  });

  it('exports the shared event log defaults', () => {
    expect(EVENT_LOG_Y_OFFSET).toBe(20);
    expect(EVENT_LOG_MAX_LINES_DEFAULT).toBe(14);
    expect(EVENT_LOG_LINE_HEIGHT_DEFAULT).toBe(17);
    expect(EVENT_LOG_FONT_SIZE).toBe('11px');
    expect(EVENT_LOG_HEADER_FONT_SIZE).toBe('12px');
    expect(EVENT_LOG_HEADER_COLOR).toBe('#669966');
    expect(EVENT_LOG_LINE_X).toBe(40);
  });

  it('exports the shared interaction constants', () => {
    expect(INTENSITY_STEP).toBe(0.2);
    expect(DEFAULT_VOLUME).toBe(0.5);
    expect(VOLUME_STEP).toBe(0.1);
  });

  it('exports the save/load scene constants', () => {
    expect(STARTING_HAND_SIZE).toBe(5);
    expect(SCREENSHOT_THUMB_SCALE).toBe(0.25);
  });

  it('exports the blackjack constants used by the transcript scene', () => {
    expect(BLACKJACK_BUST_THRESHOLD).toBe(21);
    expect(BLACKJACK_ACE_VALUE_HIGH).toBe(11);
    expect(BLACKJACK_ACE_VALUE_ADJUSTMENT).toBe(10);
    expect(BLACKJACK_FACE_CARD_VALUE).toBe(10);
    expect(BLACKJACK_MIN_CARD).toBe(2);
    expect(BLACKJACK_MAX_CARD_RAW).toBe(13);
    expect(BLACKJACK_FACE_CARD_RAW).toBe(12);
  });

  it('exports the transcript playback delay', () => {
    expect(TRANSCRIPT_PLAYBACK_DELAY_MS).toBe(600);
  });
});
