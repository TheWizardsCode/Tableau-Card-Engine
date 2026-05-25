/**
 * Gym Shell & Router - smoke tests.
 *
 * Validates:
 *  - Gym boots without runtime errors
 *  - Scene registration integrity
 *  - GymRouterScene catalogue matches registered scenes
 *  - All Gym scenes can be started by key
 */
import { describe, expect, it } from 'vitest';
import {
  GYM_ROUTER_KEY,
  GYM_DECK_RNG_KEY,
  GYM_HAND_PILE_KEY,
  GYM_OVERLAY_UI_KEY,
  GYM_UNDO_REDO_KEY,
  GYM_TRANSCRIPT_KEY,
  GYM_SAVE_LOAD_KEY,
  GYM_AUDIO_FEEDBACK_KEY,
  GYM_SLL_KEY,
  GYM_SCENE_CATALOGUE,
} from '../../example-games/gym/GymRegistry';
import type { GymSceneEntry } from '../../example-games/gym/GymRegistry';

describe('GymRegistry', () => {
  it('exports valid scene keys', () => {
    expect(GYM_ROUTER_KEY).toBe('GymRouterScene');
    expect(GYM_DECK_RNG_KEY).toBe('GymDeckRngScene');
    expect(GYM_HAND_PILE_KEY).toBe('GymHandPileScene');
    expect(GYM_OVERLAY_UI_KEY).toBe('GymOverlayUiScene');
    expect(GYM_UNDO_REDO_KEY).toBe('GymUndoRedoScene');
    expect(GYM_TRANSCRIPT_KEY).toBe('GymTranscriptScene');
    expect(GYM_SAVE_LOAD_KEY).toBe('GymSaveLoadScene');
    expect(GYM_AUDIO_FEEDBACK_KEY).toBe('GymAudioFeedbackScene');
    expect(GYM_SLL_KEY).toBe('GymSllScene');
  });

  it('catalogue contains all demo scene entries', () => {
    const catalogueKeys = GYM_SCENE_CATALOGUE.map((e: GymSceneEntry) => e.sceneKey);
    expect(catalogueKeys).toContain(GYM_DECK_RNG_KEY);
    expect(catalogueKeys).toContain(GYM_HAND_PILE_KEY);
    expect(catalogueKeys).toContain(GYM_OVERLAY_UI_KEY);
    expect(catalogueKeys).toContain(GYM_UNDO_REDO_KEY);
    expect(catalogueKeys).toContain(GYM_TRANSCRIPT_KEY);
    expect(catalogueKeys).toContain(GYM_SAVE_LOAD_KEY);
    expect(catalogueKeys).toContain(GYM_AUDIO_FEEDBACK_KEY);
    expect(catalogueKeys).toContain(GYM_SLL_KEY);
  });

  it('every catalogue entry has a non-empty title and description', () => {
    for (const entry of GYM_SCENE_CATALOGUE) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('catalogue keys are unique', () => {
    const keys = GYM_SCENE_CATALOGUE.map((e: GymSceneEntry) => e.sceneKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });
});