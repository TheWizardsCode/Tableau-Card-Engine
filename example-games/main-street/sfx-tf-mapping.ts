/**
 * Main Street logical SFX key -> ToneForge factory key mapping.
 *
 * These values are consumed by SoundManager + tfAdapter. Keep this list
 * in sync with keys used in MainStreetScene.
 */
export const MAIN_STREET_TF_SFX_MAPPING: Record<string, string> = {
  'ms-deal': 'card-draw',
  'ms-move-loop': 'card-slide',
  'ms-place': 'card-place',
  'ms-discard': 'card-discard',
  'ms-coin-pop': 'card-coin-collect',
  'ms-click': 'ui-notification-chime',
  'ms-bg-loop': 'card-table-ambience',
  'ms-business-start': 'construction-hammer',
  'ms-business-end': 'construction-saw',
  'ms-upgrade-start': 'construction-lite-hammer',
  'ms-upgrade-end': 'construction-lite-saw',
  'ms-event-cheer': 'crowd-cheer',
};
