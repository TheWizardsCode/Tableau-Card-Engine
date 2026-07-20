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

/** I18n / Localisation demo scene key. */
export const GYM_I18N_KEY = 'GymI18nScene';

/** AI Strategy Framework demo scene key. */
export const GYM_AI_STRATEGY_KEY = 'GymAiStrategyScene';

/** Graphics Shader Spike scene key. */
export const GYM_GRAPHICS_SHADER_SPIKE_KEY = 'GymGraphicsShaderSpikeScene';

/** Graphics Lighting Spike scene key. */
export const GYM_GRAPHICS_LIGHTING_SPIKE_KEY = 'GymGraphicsLightingSpikeScene';

/** Screen Layout Language (SLL) demo scene key. */
export const GYM_SLL_KEY = 'GymSllScene';

/** Tooltip demo scene key. */
export const GYM_TOOLTIP_KEY = 'GymTooltipScene';

/** HUD Components demo scene key. */
export const GYM_HUD_COMPONENTS_KEY = 'GymHudComponentsScene';

/** Layout Ownership demo scene key. */
export const GYM_LAYOUT_OWNERSHIP_KEY = 'GymLayoutOwnershipScene';

/** Parameterized Overlay demo scene key. */
export const GYM_PARAMETERIZED_OVERLAY_KEY = 'GymParameterizedOverlayScene';

/** SvgHelpers (SVG Rasterisation Pipeline) demo scene key. */
export const GYM_SVG_HELPERS_KEY = 'GymSvgHelpersScene';

/** Market Offer Engine demo scene key. */
export const GYM_MARKET_OFFER_ENGINE_KEY = 'GymMarketOfferEngineScene';

/** SpatialRules (Grid + pathfinding) demo scene key. */
export const GYM_SPATIAL_RULES_KEY = 'GymSpatialRulesScene';

/** TokenPileView demo scene key. */
export const GYM_TOKEN_PILE_VIEW_KEY = 'GymTokenPileViewScene';

/** Rule Engine demo scene key. */
export const GYM_RULE_ENGINE_KEY = 'GymRuleEngineScene';

/** Blackjack game scene key for Gym demonstration access. */
export const GYM_BLACKJACK_KEY = 'BlackjackScene';

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
      'Displays all 52 cards face-up in a compact grid. Shuffle with a deterministic seed to see reproducible card arrangements.',
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
    sceneKey: GYM_I18N_KEY,
    title: 'I18n / Localisation',
    description:
      'Register locale bundles (en, fr, de), switch locales interactively, observe live UI text updates, missing-key fallback, and locale reset via the core-engine I18n module.',
  },
  {
    sceneKey: GYM_AI_STRATEGY_KEY,
    title: 'AI Strategy Framework',
    description:
      'Define numeric AI strategies (Highest, Lowest, Random), wrap them in AiPlayer with seeded RNG, and explore pickRandom/pickBest with tie-breaking.',
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
  {
    sceneKey: GYM_LAYOUT_OWNERSHIP_KEY,
    title: 'Layout Ownership',
    description:
      'Demonstrates the VisibilityOwnershipController: register objects to shell/scene/shared/ungrouped groups and toggle visibility by mode.',
  },
  {
    sceneKey: GYM_TOOLTIP_KEY,
    title: 'Tooltip Manager',
    description:
      'Demonstrate the shared TooltipManager in both DOM-overlay and Phaser GameObject modes. Toggle tooltips via the Settings panel.',
  },
  {
    sceneKey: GYM_HUD_COMPONENTS_KEY,
    title: 'HUD Components',
    description:
      'Interact with the shared HUD component library: open/close HelpPanel, SettingsPanel, and observe depth layering and toggle controls.',
  },
  {
    sceneKey: GYM_PARAMETERIZED_OVERLAY_KEY,
    title: 'Parameterized Overlay',
    description:
      'Open game-over, round-end, and confirmation overlays built with createParameterizedOverlay(). Demonstrate declarative config, button callbacks, and overlayCenterY offset positioning.',
  },
  {
    sceneKey: GYM_SVG_HELPERS_KEY,
    title: 'SVG Rasterisation Pipeline',
    description:
      'Fetch SVG text from an asset URL, rasterise it to a Phaser texture at configurable sizes, verify texture caching via getOrCreateTexture, and toggle scene validity with markSceneValid/markSceneInvalid.',
  },
  {
    sceneKey: GYM_MARKET_OFFER_ENGINE_KEY,
    title: 'Market Offer Engine',
    description:
      'Create market rows with configurable slots, purchase cards, refill from a deck, and lock/unlock slots. Demonstrates the MarketOfferEngine API.',
  },
  {
    sceneKey: GYM_SPATIAL_RULES_KEY,
    title: 'Spatial Rules: Grid & Pathfinding',
    description:
      'Configurable grid with interactive cells, A* pathfinding with distance metrics (Manhattan/Chebyshev/Euclidean), adjacency bonus computation, and blockable cells for obstacle testing.',
  },
  {
    sceneKey: GYM_TOKEN_PILE_VIEW_KEY,
    title: 'Token Pile View',
    description:
      'Demonstrates the TokenPileView reusable component with four different renderers (simple tokens, card-back tokens, custom shapes, feudalism-style). Add/remove tokens interactively and observe live count updates.',
  },
  {
    sceneKey: GYM_RULE_ENGINE_KEY,
    title: 'Rule Engine: LegalityResult + EconomyLedger',
    description:
      'Interactively explore the LegalityResult discriminated union pattern (legal/illegal actions) and EconomyLedger resource tracking with constraint enforcement.',
  },
  {
    sceneKey: GYM_BLACKJACK_KEY,
    title: 'Blackjack',
    description:
      'Play a round of Blackjack against the dealer. Demonstrates transcript recording and save/load features in a real game context.',
  },
];

// ── Navigation helpers ──────────────────────────────────────

/**
 * Get the adjacent Gym scene key for Prev/Next navigation.
 *
 * Resolves the current scene's key against `GYM_SCENE_CATALOGUE` to find its
 * index, then returns the previous or next entry.  Wraps around at both ends
 * (first → last when going prev, last → first when going next).
 *
 * @param currentKey  The Phaser scene key of the current scene.
 * @param direction   'prev' for previous scene, 'next' for next scene.
 * @returns The scene key of the adjacent scene.
 * @throws If `currentKey` is not found in `GYM_SCENE_CATALOGUE`.
 */
export function getAdjacentGymSceneKey(
  currentKey: string,
  direction: 'prev' | 'next',
): string {
  const idx = GYM_SCENE_CATALOGUE.findIndex(
    (entry) => entry.sceneKey === currentKey,
  );
  if (idx === -1) {
    throw new Error(
      `Scene key "${currentKey}" not found in GYM_SCENE_CATALOGUE`,
    );
  }
  const count = GYM_SCENE_CATALOGUE.length;
  const offset = direction === 'prev' ? -1 : 1;
  return GYM_SCENE_CATALOGUE[
    (idx + offset + count) % count
  ].sceneKey;
}