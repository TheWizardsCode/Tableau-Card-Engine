/**
 * Main Street logical SFX key -> ToneForge factory key mapping.
 *
 * These values are consumed by SoundManager + tfAdapter. Keep this list
 * in sync with keys used in MainStreetScene.
 *
 * All keys use the standard `sfx-` prefix per SFX_CONVENTION.md.
 */
export const MAIN_STREET_TF_SFX_MAPPING: Record<string, string> = {
  'sfx-deal': 'card-draw',
  'sfx-move-loop': 'card-slide',
  'sfx-place': 'card-place',
  'sfx-discard': 'card-discard',
  'sfx-coin-pop': 'card-coin-collect',
  'sfx-ui-click': 'ui-notification-chime',
  'sfx-bg-loop': 'card-table-ambience',
  'sfx-business-start': 'construction-hammer',
  'sfx-business-end': 'construction-saw',
  'sfx-upgrade-start': 'construction-lite-hammer',
  'sfx-upgrade-end': 'construction-lite-saw',
  'sfx-event-cheer': 'crowd-cheer',
};
