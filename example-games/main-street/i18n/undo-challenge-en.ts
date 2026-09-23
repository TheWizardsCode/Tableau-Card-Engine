/**
 * Main Street Undo Challenge Warning — English locale bundle.
 *
 * User-facing strings for the dialog shown when undoing an action would
 * revoke a challenge completion (CG-0MU37CKRR008252I).  Keys follow the
 * existing Main Street convention of a namespaced prefix (`ms.` reserved
 * for Main Street global UI copy).
 *
 * To add a new language variant:
 *  1. Create `undo-challenge-<lang>.ts` with the translated bundle (keeping
 *     the same placeholder tokens in the same positions).
 *  2. Import and call `registerLocale('<lang>', bundle)` at startup.
 *
 * @module
 */

/** i18n keys for the undo-challenge warning dialog. */
export const UNDO_CHALLENGE_I18N_KEYS = {
  title: 'ms.undoChallengeTitle',
  body: 'ms.undoChallengeBody',
  item: 'ms.undoChallengeItem',
  confirm: 'ms.undoChallengeConfirm',
  keep: 'ms.undoChallengeKeep',
} as const;

/**
 * Default English strings for the undo-challenge warning dialog.
 * `{title}` is substituted with the challenge title.
 */
export const UNDO_CHALLENGE_EN_STRINGS = {
  title: 'Challenge Completion Undo',
  body: 'Undoing this action revokes the following completed challenges:',
  item: '• {title}',
  confirm: 'Undo Anyway',
  keep: 'Keep Completed',
} as const;

/** English locale bundle for the undo-challenge warning dialog. */
export const UNDO_CHALLENGE_EN_BUNDLE: Record<string, string> = {
  [UNDO_CHALLENGE_I18N_KEYS.title]: UNDO_CHALLENGE_EN_STRINGS.title,
  [UNDO_CHALLENGE_I18N_KEYS.body]: UNDO_CHALLENGE_EN_STRINGS.body,
  [UNDO_CHALLENGE_I18N_KEYS.item]: UNDO_CHALLENGE_EN_STRINGS.item,
  [UNDO_CHALLENGE_I18N_KEYS.confirm]: UNDO_CHALLENGE_EN_STRINGS.confirm,
  [UNDO_CHALLENGE_I18N_KEYS.keep]: UNDO_CHALLENGE_EN_STRINGS.keep,
};
