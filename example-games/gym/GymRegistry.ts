/**
 * GymRegistry -- Central registry for all Gym demo scenes.
 *
 * Each Gym scene registers itself here with a key, title, and
 * description so the GymRouter scene can build a navigation surface.
 *
 * @module example-games/gym/GymRegistry
 */

/** A single entry in the Gym scene catalogue. */
export interface GymSceneEntry {
  /** The Phaser scene key used to start the scene. */
  sceneKey: string;
  /** Short display title shown on the navigation card. */
  title: string;
  /** One-line description of what the scene demonstrates. */
  description: string;
}

// ── Scene key constants ────────────────────────────────────

/** The router/menu scene key. */
export const GYM_ROUTER_KEY = 'GymRouterScene';

/** Deck & Seeded RNG demo scene key. */
export const GYM_DECK_RNG_KEY = 'GymDeckRngScene';

/** Hand/Pile Interaction demo scene key. */
export const GYM_HAND_PILE_KEY = 'GymHandPileScene';

/** Overlay & UI Configuration demo scene key. */
export const GYM_OVERLAY_UI_KEY = 'GymOverlayUiScene';

/** Undo/Redo Workflow demo scene key. */
export const GYM_UNDO_REDO_KEY = 'GymUndoRedoScene';

/** Transcript Recording demo scene key. */
export const GYM_TRANSCRIPT_KEY = 'GymTranscriptScene';

/** Save/Load State demo scene key. */
export const GYM_SAVE_LOAD_KEY = 'GymSaveLoadScene';

/** Audio & Feedback Configuration demo scene key. */
export const GYM_AUDIO_FEEDBACK_KEY = 'GymAudioFeedbackScene';

/** Graphics Shader Spike scene key. */
export const GYM_GRAPHICS_SHADER_SPIKE_KEY = 'GymGraphicsShaderSpikeScene';

/** Graphics Lighting Spike scene key. */
export const GYM_GRAPHICS_LIGHTING_SPIKE_KEY = 'GymGraphicsLightingSpikeScene';

/** Screen Layout Language (SLL) demo scene key. */
export const GYM_SLL_KEY = 'GymSllScene';

// ── Registry ──────────────────────────────────────────────

/**
 * Ordered catalogue of all Gym demo scenes.
 *
 * Add new entries here when a new Gym scene is created.
 * The GymRouterScene reads this array to build navigation cards.
 */
export const GYM_SCENE_CATALOGUE: GymSceneEntry[] = [
  {
    sceneKey: GYM_DECK_RNG_KEY,
    title: 'Deck & Seeded RNG',
    description:
      'Create, shuffle, and draw from decks using deterministic seeded randomness. Verify reproducible sequences across runs.',
  },
  {
    sceneKey: GYM_HAND_PILE_KEY,
    title: 'Hand & Pile Interactions',
    description:
      'Move cards between hand and piles. Test legal/illegal actions and observe feedback animations.',
  },
  {
    sceneKey: GYM_OVERLAY_UI_KEY,
    title: 'Overlay & UI Config',
    description:
      'Open and close help/settings overlays. Toggle feedback intensity and observe live UI changes.',
  },
  {
    sceneKey: GYM_UNDO_REDO_KEY,
    title: 'Undo / Redo',
    description:
      'Execute actions, undo them, and redo them. Verify history stack semantics and boundary conditions.',
  },
  {
    sceneKey: GYM_TRANSCRIPT_KEY,
    title: 'Transcript Recording',
    description:
      'Record a transcript of game events and inspect the captured output. Verify schema and ordering with fixed seeds.',
  },
  {
    sceneKey: GYM_SAVE_LOAD_KEY,
    title: 'Save / Load State',
    description:
      'Save game state to persistent storage and restore it. Handle malformed payloads safely.',
  },
  {
    sceneKey: GYM_AUDIO_FEEDBACK_KEY,
    title: 'Audio & Feedback Config',
    description:
      'Toggle mute, switch sound mappings at runtime, and adjust feedback intensity. Validate event-to-sound resolution.',
  },
  {
    sceneKey: GYM_GRAPHICS_SHADER_SPIKE_KEY,
    title: 'Shader & Blend Spike',
    description:
      'Experimental: demonstrates sprite tinting, blend modes, and shader feasibility evaluation. Separate spike scene.',
  },
  {
    sceneKey: GYM_GRAPHICS_LIGHTING_SPIKE_KEY,
    title: 'Lighting Spike',
    description:
      'Experimental: evaluates Phaser lighting pipeline for card-glow and shadow effects. Feasibility spike with fallback.',
  },
  {
    sceneKey: GYM_SLL_KEY,
    title: 'Screen Layout Language (SLL)',
    description:
      'Parses and validates SLL JSON, maps zones/anchors to pixels across viewport+DPR profiles, and visualizes layout overlays interactively.',
  },
];