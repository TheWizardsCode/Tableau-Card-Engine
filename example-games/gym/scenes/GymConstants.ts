/**
 * Shared constants for all Gym demo scenes.
 *
 * This module centralises magic numbers used across Gym scene files so that
 * visual/styling/positioning/timing values can be inspected and adjusted in
 * one place.
 */

// ── Viewport & Layout ────────────────────────────────────────────────────

/** Default viewport dimensions used by Gym scenes. */
export const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/** Header bar Y position (top margin). */
export const SCENE_HEADER_Y = 60;

/** Prev navigation button X position (to the right of the [Menu] button). */
export const PREV_BUTTON_X = 120;

/** Next navigation button X position. */
export const NEXT_BUTTON_X = 210;

/** Left margin for divider lines. */
export const DIVIDER_MARGIN_LEFT = 20;

/** Right margin for divider lines. */
export const DIVIDER_MARGIN_RIGHT = 20;

/** Default divider Y offset. */
export const DIVIDER_DEFAULT_Y_OFFSET = 36;

/** Divider line width. */
export const DIVIDER_LINE_WIDTH = 1;

/** Divider line colour. */
export const DIVIDER_COLOR = 0x336633;

/** Divider line alpha. */
export const DIVIDER_ALPHA = 0.6;

/** Default help panel width percentage. */
export const HELP_PANEL_WIDTH_PERCENT = 35;

/** Font size for prev/next navigation buttons. */
export const NAV_BUTTON_FONT_SIZE = '12px';

/** Animation duration in ms (default). */
export const ANIMATION_DURATION_DEFAULT = 300;

/** Font size for default text labels. */
export const DEFAULT_FONT_SIZE = '14px';

// ── Event Log ────────────────────────────────────────────────────────────

/** Vertical offset below the log anchor for the event log. */
export const EVENT_LOG_Y_OFFSET = 20;

/** Default max lines for event logs. */
export const EVENT_LOG_MAX_LINES_DEFAULT = 14;

/** Default line height for event logs. */
export const EVENT_LOG_LINE_HEIGHT_DEFAULT = 17;

/** Default font size for event log body text. */
export const EVENT_LOG_FONT_SIZE = '11px';

/** Default font size for event log header text. */
export const EVENT_LOG_HEADER_FONT_SIZE = '12px';

/** Default color for event log header text. */
export const EVENT_LOG_HEADER_COLOR = '#669966';

/** Default X position (left margin) for event log lines. */
export const EVENT_LOG_LINE_X = 40;

/** Event log max lines for GymAudioFeedbackScene. */
export const EVENT_LOG_MAX_LINES_AUDIO = 16;

/** Event log max lines for GymGraphicsLightingSpikeScene. */
export const EVENT_LOG_MAX_LINES_LIGHTING = 14;

/** Event log max lines for GymHudComponentsScene. */
export const EVENT_LOG_MAX_LINES_HUD = 12;

/** Event log max lines for GymSaveLoadScene. */
export const EVENT_LOG_MAX_LINES_SAVE = 8;

/** Event log line height for GymHudComponentsScene. */
export const EVENT_LOG_LINE_HEIGHT_HUD = 16;

/** Event log line height for GymSaveLoadScene. */
export const EVENT_LOG_LINE_HEIGHT_SAVE = 17;

/** Event log line X for GymHudComponentsScene. */
export const EVENT_LOG_LINE_X_HUD = 60;

/** Event log line X for GymSaveLoadScene. */
export const EVENT_LOG_LINE_X_SAVE = 40;

// ── Typography ───────────────────────────────────────────────────────────

/** Font size for status/info text (16px). */
export const STATUS_FONT_SIZE = '16px';

/** Font size for instructions text (13px). */
export const INSTRUCTIONS_FONT_SIZE = '13px';

/** Font size for large counter display (28px). */
export const COUNTER_FONT_SIZE = '28px';

/** Font size for undo/redo status (14px). */
export const UNDO_REDO_STATUS_FONT_SIZE = '14px';

/** Font size for history text (12px). */
export const HISTORY_FONT_SIZE = '12px';

// ── Layout Offsets ──────────────────────────────────────────────────────

/** Vertical offset for design row (below controls row). */
export const DESIGN_ROW_OFFSET = 30;

/** Horizontal offset for label text from button start. */
export const LABEL_X_OFFSET = 20;

/** Horizontal offset for button start from center. */
export const BUTTON_X_OFFSET = 60;

/** Horizontal increment between style toggle buttons. */
export const TOGGLE_BTN_INCREMENT = 100;

/** Horizontal offset for status text from center. */
export const STATUS_TEXT_OFFSET = 600;

/** Horizontal offset for the seed text from the seed label. */
export const SEED_TEXT_X_OFFSET = 50;

/** Range for random seed generation. */
export const SEED_RANDOM_RANGE = 100000;

/** Vertical offset for the card display below its anchor. */
export const CARD_DISPLAY_Y_OFFSET = 100;

/** Vertical offset for design row (feedback controls). */
export const FEEDBACK_CONTROLS_OFFSET = 28;

/** Default text color for status/info labels. */
export const STATUS_TEXT_COLOR = '#ffffff';

/** Font size for state text in save/load scene. */
export const STATE_FONT_SIZE = '18px';

/** Color for state text in save/load scene. */
export const STATE_TEXT_COLOR = '#ffffff';

/** Font size for backend status text. */
export const BACKEND_STATUS_FONT_SIZE = '12px';

/** Color for backend status text. */
export const BACKEND_STATUS_COLOR = '#888888';

/** Y position for the screenshot thumbnail. */
export const SCREENSHOT_THUMB_Y = 360;

/** Max lines for the save/load scene event log. */
export const SAVE_LOG_MAX_LINES = 8;

/** Font size for hand info text. */
export const HAND_INFO_FONT_SIZE = '12px';

/** Font color for hand info text. */
export const HAND_INFO_COLOR = '#ccffcc';

/** Font color for status text. */
export const STATUS_FONT_COLOR = '#ffff88';

// ── Overlay Constants ───────────────────────────────────────────────────

/** Overlay interaction guard duration in ms. */
export const OVERLAY_INTERACTION_GUARD_MS = 220;

/** Base color for overlay (0x0a1a0a). */
export const OVERLAY_BASE_COLOR = 0x0a1a0a;

/** How dark the overlay is at intensity=0. */
export const OVERLAY_MIN_BRIGHTNESS = 0.4;

/** Alpha at intensity=0. */
export const OVERLAY_ALPHA_MIN = 0.3;

/** Alpha at intensity=1. */
export const OVERLAY_ALPHA_MAX = 0.7;

/** Line height for overlay scrollable content. */
export const OVERLAY_TEXT_LINE_HEIGHT = 16;

/** Font size for overlay scrollable content text. */
export const OVERLAY_TEXT_FONT_SIZE = '12px';

/** X position for overlay scrollable content text. */
export const OVERLAY_TEXT_X = 10;

/** X offset of the scrollbar from the right edge of the mask. */
export const OVERLAY_SCROLLBAR_OFFSET_X = 8;

/** Scrollbar width (px). */
export const OVERLAY_SCROLLBAR_WIDTH = 4;

/** Scrollbar track colour. */
export const OVERLAY_SCROLLBAR_TRACK_COLOR = 0x333333;

/** Scrollbar track alpha. */
export const OVERLAY_SCROLLBAR_TRACK_ALPHA = 0.5;

/** Scrollbar thumb colour. */
export const OVERLAY_SCROLLBAR_THUMB_COLOR = 0x88ff88;

/** Scrollbar thumb alpha. */
export const OVERLAY_SCROLLBAR_THUMB_ALPHA = 0.8;

/** Minimum scrollbar thumb height (px). */
export const OVERLAY_SCROLLBAR_MIN_THUMB = 20;

/** Wheel scroll factor for the masked content area. */
export const OVERLAY_SCROLL_FACTOR = 0.5;

/** Depth for the masked container and central overlay text. */
export const OVERLAY_MASK_DEPTH = 11;

/** Depth for the scrollbar track. */
export const OVERLAY_SCROLLBAR_TRACK_DEPTH = 12;

/** Depth for the scrollbar thumb. */
export const OVERLAY_SCROLLBAR_THUMB_DEPTH = 13;

/** Y position for the central overlay info text. */
export const OVERLAY_INFO_Y = 240;

/** Y position for the dismiss link. */
export const OVERLAY_DISMISS_Y = 520;

/** Y position for the overlay intensity controls. */
export const OVERLAY_INTENSITY_Y = 550;

/** X offset of the minus/plus buttons from center. */
export const OVERLAY_INTENSITY_BTN_X_OFFSET = 80;

/** Font size for the overlay intensity buttons. */
export const OVERLAY_INTENSITY_BTN_FONT_SIZE = '14px';

/** Max lines for the overlay event log. */
export const OVERLAY_LOG_MAX_LINES = 14;

/** Overlay mask width. */
export const OVERLAY_MASK_WIDTH = 300;

/** Overlay mask height. */
export const OVERLAY_MASK_HEIGHT = 200;

/** Overlay scroll area base Y. */
export const OVERLAY_SCROLL_BASE_Y = 280;

// ── Color Palette ───────────────────────────────────────────────────────

/** Header text color for success elements. */
export const HEADER_SUCCESS_COLOR = '#88aa88';

/** Font size for depth info text. */
export const DEPTH_INFO_FONT_SIZE = '12px';

/** Depth info text color. */
export const DEPTH_INFO_COLOR = '#88aa88';

/** Font size for panel status text. */
export const PANEL_STATUS_FONT_SIZE = '14px';

/** Panel status Y offset from anchor. */
export const PANEL_STATUS_OFFSET = 10;

// ── Volume & Intensity ─────────────────────────────────────────────────

/** Default volume level for GymAudioFeedbackScene. */
export const DEFAULT_VOLUME = 0.5;

/** Maximum log lines for the call log. */
export const AUDIO_CALL_LOG_MAX_LINES = 16;

/** Random X spread for pop text trigger. */
export const POP_TRIGGER_X_SPREAD = 200;

/** Y position for pop text trigger. */
export const POP_TRIGGER_Y = 200;

/** Pop text duration when reduced motion is enabled. */
export const POP_TRIGGER_DURATION_REDUCED = 100;

/** Pop text duration in normal mode. */
export const POP_TRIGGER_DURATION_NORMAL = 450;

/** Random X spread for event pop text. */
export const EVENT_POP_X_SPREAD = 100;

/** Y position for event pop text. */
export const EVENT_POP_Y = 220;

/** Event pop text duration when reduced motion is enabled. */
export const EVENT_POP_DURATION_REDUCED = 500;

/** Event pop text duration in normal mode. */
export const EVENT_POP_DURATION_NORMAL = 1800;

/** Font size for event pop text. */
export const EVENT_POP_FONT_SIZE = '20px';

/** Y position for celebration effects. */
export const CELEBRATION_Y = 300;

/** Celebration duration when reduced motion is enabled. */
export const CELEBRATION_DURATION_REDUCED = 200;

/** Celebration scale when reduced motion is enabled. */
export const CELEBRATION_SCALE_REDUCED = 1.5;

/** Particle circle radius for celebration texture. */
export const CELEBRATION_PARTICLE_RADIUS = 4;

/** Particle texture size (px). */
export const CELEBRATION_PARTICLE_SIZE = 8;

/** Particle minimum speed. */
export const CELEBRATION_PARTICLE_SPEED_MIN = 60;

/** Particle maximum speed. */
export const CELEBRATION_PARTICLE_SPEED_MAX = 180;

/** Particle starting scale. */
export const CELEBRATION_PARTICLE_SCALE_START = 0.8;

/** Particle ending scale. */
export const CELEBRATION_PARTICLE_SCALE_END = 0;

/** Particle lifespan (ms). */
export const CELEBRATION_PARTICLE_LIFESPAN = 800;

/** Particle burst quantity. */
export const CELEBRATION_PARTICLE_QUANTITY = 20;

/** Delay before cleaning up the particle emitter (ms). */
export const CELEBRATION_PARTICLE_CLEANUP_MS = 1200;

/** Pop text fallback duration (ms). */
export const CELEBRATION_FALLBACK_DURATION = 600;

/** Pop text fallback scale. */
export const CELEBRATION_FALLBACK_SCALE = 2;

/** Pop text fallback rise Y distance. */
export const CELEBRATION_FALLBACK_RISE_Y = 40;

/** Pop text catch-all duration (ms). */
export const CELEBRATION_CATCH_DURATION = 400;

/** Default volume level for GymHudComponentsScene. */
export const HUD_DEFAULT_VOLUME = 0.8;

/** X position for the panel status lines. */
export const PANEL_STATUS_X = 460;

/** X position for the depth info text. */
export const DEPTH_INFO_X = 60;

/** Y offset for the HUD event log below its anchor. */
export const EVENT_LOG_Y_OFFSET_HUD = 10;

/** Max lines for the HUD scene event log. */
export const HUD_LOG_MAX_LINES = 12;

/** Colour for the help panel status text. */
export const HELP_STATUS_COLOR = '#88ff88';

/** Colour for the settings panel status text. */
export const SETTINGS_STATUS_COLOR = '#ffcc44';

/** Volume adjustment step. */
export const VOLUME_STEP = 0.1;

/** Intensity adjustment step. */
export const INTENSITY_STEP = 0.2;

/** Font size for intensity text. */
export const INTENSITY_FONT_SIZE = '16px';

/** Default text color for intensity display. */
export const INTENSITY_TEXT_COLOR = '#88ff88';

// ── Button Bar ─────────────────────────────────────────────────────────

/** SLL scene button bar Y position. */
export const SLL_BUTTON_BAR_Y = 58;

/** SLL scene button bar row spacing. */
export const SLL_BUTTON_BAR_ROW_SPACING = 24;

// ── Sprite Generation ──────────────────────────────────────────────────

/** Default sprite width for spike demo sprites. */
export const SPIKE_SPRITE_WIDTH = 80;

/** Default sprite height for spike demo sprites. */
export const SPIKE_SPRITE_HEIGHT = 110;

/** Default sprite corner radius. */
export const SPIKE_SPRITE_CORNER_RADIUS = 8;

/** Stroke width for spike demo sprites. */
export const SPIKE_SPRITE_STROKE_WIDTH = 2;

/** Stroke color for sprite A. */
export const SPIKE_SPRITE_A_STROKE_COLOR = 0x446644;

/** Stroke color for sprite B. */
export const SPIKE_SPRITE_B_STROKE_COLOR = 0x664444;

/** Stroke color for sprite C. */
export const SPIKE_SPRITE_C_STROKE_COLOR = 0x444466;

/** Inner rectangle padding for stroked sprites. */
export const SPIKE_SPRITE_INNER_PAD = 1;

/** Inner rectangle corner radius for stroked sprites. */
export const SPIKE_SPRITE_INNER_CORNER_RADIUS = 7;

/** Circle center X for spike sprites. */
export const SPIKE_CIRCLE_X = 40;

/** Circle center Y for spike sprites. */
export const SPIKE_CIRCLE_Y = 55;

/** Circle radius for spike sprites. */
export const SPIKE_CIRCLE_RADIUS = 12;

/** Star shape points for the second spike sprite (diamond/star). */
export const SPIKE_STAR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [40, 26],
  [46, 40],
  [54, 36],
  [48, 50],
  [40, 70],
  [32, 50],
  [26, 36],
  [34, 40],
];

/** Triangle points for the third spike sprite. */
export const SPIKE_TRIANGLE_POINTS: ReadonlyArray<readonly [number, number]> = [
  [40, 30],
  [25, 70],
  [55, 70],
];

/** Font size for the shader status line. */
export const SHADER_STATUS_FONT_SIZE = '12px';

/** Horizontal gap between sample sprites. */
export const SHADER_SPRITE_X_GAP = 180;

/** Number of sample sprites. */
export const SHADER_NUM_SPRITES = 3;

/** Status line text color for the shader scene. */
export const SHADER_STATUS_TEXT_COLOR = '#88ff88';

// ── Lighting Spike ─────────────────────────────────────────────────────

/** Point light radius for lighting spike demo. */
export const LIGHT_RADIUS = 300;

/** Point light color for lighting spike demo. */
export const LIGHT_COLOR = 0xffffff;

/** Point light intensity when on. */
export const LIGHT_INTENSITY_ON = 1.0;

/** Point light intensity when off. */
export const LIGHT_INTENSITY_OFF = 0.0;

/** Y offset for light position above sprites. */
export const LIGHT_Y_OFFSET = 20;

/** X offset for sprites from center. */
export const SPRITE_X_OFFSET = 150;

/** Font size for lighting spike findings text. */
export const LIGHTING_FINDINGS_FONT_SIZE = '12px';

/** Font size for lighting spike event log. */
export const LIGHTING_EVENT_LOG_FONT_SIZE = '10px';

/** Line height for lighting spike event log. */
export const LIGHTING_EVENT_LOG_LINE_HEIGHT = 16;

/** Line X for lighting spike event log. */
export const LIGHTING_EVENT_LOG_LINE_X = 20;

/** X spread for random light movement. */
export const LIGHTING_MOVE_X_SPREAD = 300;

/** Base Y for random light movement. */
export const LIGHTING_MOVE_Y_BASE = 160;

/** Y range for random light movement. */
export const LIGHTING_MOVE_Y_RANGE = 200;

/** Max lines for the lighting spike event log. */
export const LIGHTING_LOG_MAX_LINES = 14;

// ── Shader Spike ────────────────────────────────────────────────────────

// ── Tooltip Scene ──────────────────────────────────────────────────────

/** Font size for the tooltip mode label. */
export const TOOLTIP_MODE_LABEL_FONT_SIZE = '16px';

/** Font size for the tooltip status label. */
export const TOOLTIP_STATUS_FONT_SIZE = '14px';

/** Font size for the tooltip hover prompt. */
export const TOOLTIP_PROMPT_FONT_SIZE = '14px';

/** Font size for the tooltip log header. */
export const TOOLTIP_LOG_HEADER_FONT_SIZE = '12px';

/** Font size for the tooltip card name text. */
export const TOOLTIP_CARD_NAME_FONT_SIZE = '14px';

/** Font size for the tooltip card label. */
export const TOOLTIP_CARD_LABEL_FONT_SIZE = '14px';

/** Font size for the tooltip event log lines. */
export const TOOLTIP_LOG_FONT_SIZE = '11px';

/** Base Y offset below the log anchor for tooltip event log lines. */
export const TOOLTIP_LOG_BASE_Y_OFFSET = 70;

/** Line height for the tooltip event log lines. */
export const TOOLTIP_LOG_LINE_HEIGHT = 17;

/** Max lines for the tooltip event log. */
export const TOOLTIP_LOG_MAX_LINES = 10;

/** Tooltip status label Y offset from mode label. */
export const TOOLTIP_STATUS_Y_OFFSET = 25;

/** Tooltip separator Y offset from status label. */
export const TOOLTIP_SEPARATOR_Y_OFFSET = 50;

/** Card tooltip background padding. */
export const TOOLTIP_BG_PADDING = 16;

/** Card tooltip text origin offset. */
export const TOOLTIP_TEXT_ORIGIN = 8;

/** Card tooltip word wrap width. */
export const TOOLTIP_WORD_WRAP_WIDTH = 200;

/** Card tooltip container depth. */
export const TOOLTIP_CONTAINER_DEPTH = 800;

/** Card tooltip background opacity. */
export const TOOLTIP_BG_ALPHA = 0.9;

/** Card tooltip border stroke width (normal). */
export const TOOLTIP_BORDER_WIDTH_NORMAL = 1;

/** Card tooltip border color (default). */
export const TOOLTIP_BORDER_COLOR_DEFAULT = 0x888888;

/** Card tooltip card background width. */
export const TOOLTIP_CARD_BG_WIDTH = 150;

/** Card tooltip card background height. */
export const TOOLTIP_CARD_BG_HEIGHT = 80;

/** Card tooltip card border stroke (normal). */
export const TOOLTIP_CARD_BORDER_NORMAL = 2;

/** Card tooltip card border color (normal). */
export const TOOLTIP_CARD_BORDER_COLOR = 0xffffff;

/** Card tooltip hover border width. */
export const TOOLTIP_BORDER_WIDTH_HOVER = 3;

/** Card tooltip hover border color. */
export const TOOLTIP_BORDER_COLOR_HOVER = 0xffdd44;

/** Card tooltip hover scale. */
export const TOOLTIP_HOVER_SCALE = 1.1;

/** Tooltip card X offset from center (left card). */
export const TOOLTIP_CARD_X_OFFSET = 200;

/** Tooltip card background alpha. */
export const TOOLTIP_CARD_BG_ALPHA = 0.8;

// ── Hand/Pile Scene ────────────────────────────────────────────────────

/** Delay before re-building the hand after a rejected drop (ms). */
export const DROP_REJECT_DELAY_MS = 200;

/** Y position for the first row of action buttons. */
export const HAND_BUTTON_ROW_1_Y = 60;

/** Y position for the second row of mode-toggle buttons. */
export const HAND_BUTTON_ROW_2_Y = 112;

/** Y position for the status/info line below the buttons. */
export const HAND_INFO_Y = 134;

/** X position of the drag status label. */
export const HAND_DRAG_LABEL_X = 170;

/** X position of the discard mode label. */
export const HAND_DISCARD_MODE_LABEL_X = 560;

/** X position of the face-up label. */
export const HAND_FACE_UP_LABEL_X = 740;

/** X position of the layout label. */
export const HAND_LAYOUT_LABEL_X = 960;

/** Y position of the event log header. */
export const HAND_EVENT_LOG_HEADER_Y = 147;

/** Font size for the small status labels. */
export const HAND_LABEL_FONT_SIZE = '11px';

/** Font size for the layout label. */
export const HAND_LAYOUT_LABEL_FONT_SIZE = '12px';

/** Maximum arc slider value. */
export const ARC_SLIDER_MAX = 200;

/** Maximum rotation slider value. */
export const ROTATION_SLIDER_MAX = 359;

/** Spacing slider range ratio around CARD_W. */
export const SPACING_SLIDER_RATIO = 0.75;

/** Highlight fill colour for valid drop zones. */
export const VALID_HIGHLIGHT_COLOR = 0x44ff44;

/** Highlight alpha for valid drop zones. */
export const VALID_HIGHLIGHT_ALPHA = 0.35;

/** Valid highlight lifetime (ms). */
export const VALID_HIGHLIGHT_LIFETIME = 3000;

/** Tint colour for illegal-move feedback. */
export const ILLEGAL_TINT_COLOR = 0xff4444;

/** Alpha for the illegal-move tint overlay (reduced motion). */
export const ILLEGAL_OVERLAY_ALPHA = 0.4;

/** Fallback card width for the tint overlay bounds. */
export const FALLBACK_CARD_WIDTH = 96;

/** Fallback card height for the tint overlay bounds. */
export const FALLBACK_CARD_HEIGHT = 130;

/** Illegal-move tint duration (ms). */
export const ILLEGAL_TINT_DURATION_MS = 200;

/** Shake distance for the illegal-move shake animation (px). */
export const ILLEGAL_SHAKE_DISTANCE = 6;

/** Duration of one shake cycle (ms). */
export const ILLEGAL_SHAKE_DURATION_MS = 50;

/** Number of shake repeats. */
export const ILLEGAL_SHAKE_REPEAT = 2;

/** Drop zone padding around a card (px). */
export const DROP_ZONE_PAD = 24;

/** Drop zone corner radius. */
export const DROP_ZONE_RADIUS = 10;

/** Drop zone outline stroke width. */
export const DROP_ZONE_STROKE_WIDTH = 2;

/** Drop zone outline colour. */
export const DROP_ZONE_STROKE_COLOR = 0x88aa88;

/** Drop zone outline alpha. */
export const DROP_ZONE_STROKE_ALPHA = 0.5;

/** Drop zone fill colour. */
export const DROP_ZONE_FILL_COLOR = 0x335533;

/** Drop zone fill alpha. */
export const DROP_ZONE_FILL_ALPHA = 0.15;

/** Alpha for the discard-click highlight fill. */
export const DISCARD_CLICK_ALPHA = 0.25;

/** Stroke width for the discard-click highlight. */
export const DISCARD_CLICK_STROKE_WIDTH = 3;

/** Hit-test horizontal tolerance beyond card width (px). */
export const DROP_HIT_TEST_X_PAD = 40;

/** Hit-test vertical tolerance beyond card height (px). */
export const DROP_HIT_TEST_Y_PAD = 60;

/** Padding around a card for the drop highlight zone (px). */
export const DROP_HIGHLIGHT_PAD = 16;

/** Delay before processing an accepted drop (ms). */
export const DROP_ACCEPT_DELAY_MS = 50;

/** Max lines for the hand scene event log. */
export const HAND_LOG_MAX_LINES = 14;

/** Base Y for the hand scene event log lines. */
export const HAND_LOG_BASE_Y = 230;

/** Line height for the hand scene event log. */
export const HAND_LOG_LINE_HEIGHT = 17;

/** X position for the hand scene event log lines. */
export const HAND_LOG_X = 40;

/** Duration for the deal-card animation (ms). */
export const HAND_DEAL_DURATION_MS = 400;

/** Duration for the discard move+flip animation (ms). */
export const HAND_DISCARD_ANIMATE_DURATION_MS = 400;

/** Vertical offset for the shrink discard animation (px). */
export const HAND_DISCARD_SHRINK_OFFSET_Y = 30;

/** Duration for the shrink discard animation (ms). */
export const HAND_DISCARD_SHRINK_DURATION_MS = 350;

/** Duration for the recall-to-hand animation (ms). */
export const HAND_RECALL_DURATION_MS = 350;

/** Duration for the flip animation (ms). */
export const HAND_FLIP_DURATION_MS = 300;

/** X offset from centre for the move-target position (px). */
export const HAND_MOVE_DEST_X_OFFSET = 200;

/** Y position for the move-target position (px). */
export const HAND_MOVE_DEST_Y = 200;

/** Duration for the move-card tween (ms). */
export const HAND_MOVE_DURATION_MS = 500;

/** Duration for the cancel-move return tween (ms). */
export const HAND_CANCEL_MOVE_DURATION_MS = 250;

// ── Undo/Redo Scene ───────────────────────────────────────────────────

/** Y offset for pop-up feedback above counter text. */
export const POP_FEEDBACK_Y_OFFSET = 20;

/** Max lines for the undo/redo scene event log. */
export const UNDO_REDO_LOG_MAX_LINES = 12;

/** Pop text duration when reduced motion is enabled (undo/redo scene). */
export const UNDO_POP_DURATION_REDUCED = 100;

/** Pop text duration in normal mode (undo/redo scene). */
export const UNDO_POP_DURATION_NORMAL = 400;

/** Font size for the undo/redo pop text. */
export const UNDO_POP_FONT_SIZE = '14px';

/** Colour for the undo/redo pop text. */
export const UNDO_POP_COLOR = '#88ff88';

/** Horizontal offset for undo status from center. */
export const UNDO_STATUS_OFFSET = 120;

/** Horizontal offset for redo status from center. */
export const REDO_STATUS_OFFSET = 80;

// ── Save/Load Scene ───────────────────────────────────────────────────

/** Screenshot thumbnail scale factor. */
export const SCREENSHOT_THUMB_SCALE = 0.25;

/** Starting hand size for save/load demo. */
export const STARTING_HAND_SIZE = 5;

// ── Transcript Scene ──────────────────────────────────────────────────

/** Blackjack bust threshold. */
export const BLACKJACK_BUST_THRESHOLD = 21;

/** Blackjack ace value when counting high. */
export const BLACKJACK_ACE_VALUE_HIGH = 11;

/** Blackjack ace value adjustment when busting. */
export const BLACKJACK_ACE_VALUE_ADJUSTMENT = 10;

/** Blackjack minimum card value. */
export const BLACKJACK_MIN_CARD = 2;

/** Blackjack face card value. */
export const BLACKJACK_FACE_CARD_VALUE = 10;

/** Blackjack max card value (before adjustment). */
export const BLACKJACK_MAX_CARD_RAW = 13;

/** Blackjack raw value at which cards become face cards (Jack). */
export const BLACKJACK_FACE_CARD_RAW = 12;

/** Playback delay between transcript events in ms. */
export const TRANSCRIPT_PLAYBACK_DELAY_MS = 600;

/** Status text Y offset above the main Y position. */
export const TRANSCRIPT_STATUS_Y_OFFSET = 30;

/** Hand info text Y offset below the main Y position. */
export const TRANSCRIPT_HAND_INFO_Y_OFFSET = 40;

/** Dealer stick threshold (dealer stands on 17+). */
export const DEALER_STICK_THRESHOLD = 17;

/** Delay between dealer draws (ms). */
export const DEALER_DRAW_DELAY_MS = 800;

/** Y position for the transcript pop text. */
export const TRANSCRIPT_POP_Y = 100;

/** Pop text duration when reduced motion is enabled. */
export const TRANSCRIPT_POP_DURATION_REDUCED = 100;

/** Pop text duration in normal mode. */
export const TRANSCRIPT_POP_DURATION_NORMAL = 350;

/** Font size for the transcript pop text. */
export const TRANSCRIPT_POP_FONT_SIZE = '14px';

/** Colour for the transcript pop text. */
export const TRANSCRIPT_POP_COLOR = '#88ff88';

/** Max lines for the transcript event log. */
export const TRANSCRIPT_LOG_MAX_LINES = 18;

/** Max lines for the transcript event log UI. */
export const TRANSCRIPT_LOG_MAX_LINES_UI = 18;

/** Line height for the transcript event log. */
export const TRANSCRIPT_LOG_LINE_HEIGHT = 15;

/** Font size for the transcript event log lines. */
export const TRANSCRIPT_LOG_FONT_SIZE = '11px';

// ── SLL Scene ─────────────────────────────────────────────────────────

/** Overlay graphics depth. */
export const SLL_OVERLAY_GRAPHICS_DEPTH = 70;

/** Status line Y position. */
export const SLL_STATUS_LINE_Y = 106;

/** Status line font size. */
export const SLL_STATUS_FONT_SIZE = '12px';

/** Status line text color. */
export const SLL_STATUS_TEXT_COLOR = '#b7d9e3';

/** Profile label font size. */
export const SLL_PROFILE_LABEL_FONT_SIZE = '13px';

/** Profile label text colors. */
export const SLL_PROFILE_LABEL_COLORS = {
  DEFAULT: '#88ddff',
  PORTRAIT: '#ffee99',
  DESKTOP_2X: '#ffcc88',
} as const;

/** X position of the SLL status line. */
export const SLL_STATUS_LINE_X = 28;

/** Font size for the SLL title text. */
export const SLL_TITLE_FONT_SIZE = '24px';

/** Font size for the SLL action button text. */
export const SLL_ACTION_BUTTON_FONT_SIZE = '15px';

/** Width of the SLL content panel. */
export const SLL_CONTENT_PANEL_WIDTH = 420;

/** Height of the SLL content panel. */
export const SLL_CONTENT_PANEL_HEIGHT = 220;

/** Fill colour of the SLL content panel. */
export const SLL_CONTENT_PANEL_FILL_COLOR = 0x133848;

/** Fill alpha of the SLL content panel. */
export const SLL_CONTENT_PANEL_ALPHA = 0.78;

/** Stroke width of the SLL content panel. */
export const SLL_CONTENT_PANEL_STROKE_WIDTH = 2;

/** Stroke colour of the SLL content panel. */
export const SLL_CONTENT_PANEL_STROKE_COLOR = 0x66ddff;

/** Stroke alpha of the SLL content panel. */
export const SLL_CONTENT_PANEL_STROKE_ALPHA = 0.95;

/** Font size for the SLL content label. */
export const SLL_CONTENT_LABEL_FONT_SIZE = '16px';

/** Colour for the SLL content label. */
export const SLL_CONTENT_LABEL_COLOR = '#ffffff';

/** Depth for SLL title/action objects. */
export const SLL_OBJECT_DEPTH = 40;

/** Depth for the SLL content panel. */
export const SLL_CONTENT_PANEL_DEPTH = 25;

/** Depth for the SLL content label. */
export const SLL_CONTENT_LABEL_DEPTH = 35;

/** Pulse fill colour for the SLL content panel. */
export const SLL_PULSE_FILL_COLOR = 0x2a5f33;

/** Pulse fill alpha for the SLL content panel. */
export const SLL_PULSE_FILL_ALPHA = 0.82;

/** Fill alpha when the SLL pulse is off. */
export const SLL_PULSE_OFF_FILL_ALPHA = 0.78;

/** Radius of the overlay marker dots. */
export const SLL_OVERLAY_DOT_RADIUS = 5;

/** Radius of the overlay marker rings. */
export const SLL_OVERLAY_RING_RADIUS = 8;

/** Line width for the overlay marker rings. */
export const SLL_OVERLAY_LINE_WIDTH = 1.5;

/** Line alpha for the overlay marker rings. */
export const SLL_OVERLAY_LINE_ALPHA = 0.8;

/** Fill alpha for the overlay marker dots. */
export const SLL_OVERLAY_FILL_ALPHA = 0.95;

/** X position of the SLL overlay legend panel. */
export const SLL_OVERLAY_LEGEND_X = 864;

/** Y position of the SLL overlay legend panel. */
export const SLL_OVERLAY_LEGEND_Y = 122;

/** Width of the SLL overlay legend panel. */
export const SLL_OVERLAY_LEGEND_WIDTH = 392;

/** Maximum height of the SLL overlay legend panel. */
export const SLL_OVERLAY_LEGEND_MAX_HEIGHT = 520;

/** Font size for the SLL overlay legend label. */
export const SLL_OVERLAY_LEGEND_FONT_SIZE = '10px';

/** Line spacing for the SLL overlay legend label. */
export const SLL_OVERLAY_LEGEND_LINE_SPACING = 2;

/** Depth for the SLL overlay legend label. */
export const SLL_OVERLAY_LEGEND_DEPTH = 75;

/** Padding X for the SLL overlay legend label. */
export const SLL_OVERLAY_LEGEND_PAD_X = 10;

/** Padding Y for the SLL overlay legend label. */
export const SLL_OVERLAY_LEGEND_PAD_Y = 8;

/** Line height used to compute the SLL overlay legend panel height. */
export const SLL_OVERLAY_LEGEND_LINE_HEIGHT = 12;

/** Length of the SLL overlay legend separator. */
export const SLL_OVERLAY_SEPARATOR_LENGTH = 36;

/** Colours for the SLL overlay element markers. */
export const SLL_ELEMENT_COLORS: ReadonlyArray<number> = [0x66ddff, 0x66ff99, 0xffcc66, 0xff8899];

// ── Router Scene ──────────────────────────────────────────────────────

/** Y position of the router title text. */
export const ROUTER_TITLE_Y = 24;

/** Font size for the router title. */
export const ROUTER_TITLE_FONT_SIZE = '28px';

/** Y position of the router subtitle text. */
export const ROUTER_SUBTITLE_Y = 52;

/** Font size for the router subtitle. */
export const ROUTER_SUBTITLE_FONT_SIZE = '13px';

/** X offset of the transition toggle from the right edge. */
export const ROUTER_TOGGLE_X_OFFSET = 20;

/** Y position of the transition toggle. */
export const ROUTER_TOGGLE_Y = 10;

/** Font size for the transition toggle. */
export const ROUTER_TOGGLE_FONT_SIZE = '10px';

/** Column breakpoints for the adaptive grid. */
export const ROUTER_GRID_COLS_MAX = { two: 2, four: 6, six: 9 };

/** Font size for the scene card title. */
export const ROUTER_CARD_TITLE_FONT_SIZE = '15px';

/** Font size for the scene card description. */
export const ROUTER_CARD_DESC_FONT_SIZE = '10px';

/** Line spacing for the scene card description. */
export const ROUTER_CARD_DESC_LINE_SPACING = 2;

/** Horizontal padding for the description word-wrap width. */
export const ROUTER_CARD_DESC_PAD_X = 24;

/** Minimum description height reserved below the title (px). */
export const ROUTER_CARD_DESC_RESERVED_H = 60;

/** Title offset below the card top edge (px). */
export const ROUTER_CARD_TITLE_OFFSET_Y = 18;

/** Description offset below the card centre (px). */
export const ROUTER_CARD_DESC_OFFSET_Y = 6;

/** Open label offset above the card bottom edge (px). */
export const ROUTER_CARD_OPEN_OFFSET_Y = 16;

/** Font size for the open label. */
export const ROUTER_CARD_OPEN_FONT_SIZE = '13px';

/** Duration for the router exit transition (ms). */
export const ROUTER_EXIT_TRANSITION_MS = 200;

/** Stroke width for the router scene cards. */
export const ROUTER_CARD_STROKE_WIDTH = 1.5;
