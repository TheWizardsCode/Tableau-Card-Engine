/**
 * Hand-written documentation sections that mirror content rows.
 *
 * Generated artefacts (JSON manifest, Mermaid graph) are rewritten
 * automatically after an accepted edit — but hand-written documentation is
 * **not** machine-generated, so nothing can rewrite it. When an edit touches a
 * row that a documented section describes by hand, the editor's bridge must
 * tell the author "manual documentation update required" and name the check
 * that now fails, instead of claiming the drift guard covers the docs.
 *
 * This module is that registry. Each entry declares a stable check id, the
 * repository-relative path of the hand-written section, a command that
 * verifies the section's parity with the content (the "check that now fails"),
 * and the base card ids the section documents by hand.
 *
 * The Gym ships one such section: the Gym storyline demo's card catalogue
 * (`example-games/gym/GymStorylineDemo.ts`) hand-maintains the four content
 * cards, and the Gym suite pins that fixture — an edit to a documented row
 * (a renamed id, a changed effect, a dropped card) silently breaks it unless
 * the demo is updated by hand.
 *
 * Pure data; Phaser-free, game-import-free and Node-free (browser-safe).
 *
 * @module
 */

/** One hand-written documentation section mirroring content rows. */
export interface ManualDocSection {
  /** Stable, human-readable id of the section/check. */
  readonly check: string;
  /** Repository-relative path of the hand-written section. */
  readonly path: string;
  /** Command that fails when the section drifts from the content. */
  readonly verifyCommand: string;
  /** Base card ids the section documents by hand. */
  readonly documentedIds: readonly string[];
}

/** The Gym's hand-documented row set (see the module comment). */
export const GYM_MANUAL_DOC_SECTIONS: readonly ManualDocSection[] = [
  {
    check: 'gym-storyline-demo-catalogue',
    path: 'example-games/gym/GymStorylineDemo.ts',
    verifyCommand: 'npx vitest run --project unit tests/gym/GymStorylineDemo.test.ts',
    documentedIds: ['gym-story-start', 'gym-story-invest', 'gym-story-ignore', 'gym-story-end'],
  },
];

/** The sections used when the caller supplies none. */
export const DEFAULT_MANUAL_DOC_SECTIONS: readonly ManualDocSection[] = GYM_MANUAL_DOC_SECTIONS;

/** The sections whose documented rows an edit touched, plus which ids. */
export interface ManualDocUpdate {
  /** The section's stable check id (the check that now fails). */
  readonly check: string;
  /** Repository-relative path of the hand-written section. */
  readonly path: string;
  /** Command that fails when the section drifts. */
  readonly verifyCommand: string;
  /** The edited base ids the section documents by hand. */
  readonly touchedIds: readonly string[];
}

/**
 * Returns every documented section whose rows intersect the edited ids.
 *
 * An edit that does not touch a documented row produces no update — the
 * generated drift guards remain the only checks that matter.
 *
 * @param editedIds Base ids the edit affected (added, updated or removed).
 * @param sections  The documented-section registry (defaults to the shipped
 *                  Gym sections).
 * @returns The affected sections with the touched ids, in registry order.
 */
export function findManualDocUpdates(
  editedIds: readonly string[],
  sections: readonly ManualDocSection[] = DEFAULT_MANUAL_DOC_SECTIONS,
): ManualDocUpdate[] {
  const edited = new Set(editedIds);
  const updates: ManualDocUpdate[] = [];
  for (const section of sections) {
    const touched = section.documentedIds.filter((id) => edited.has(id));
    if (touched.length > 0) {
      updates.push({
        check: section.check,
        path: section.path,
        verifyCommand: section.verifyCommand,
        touchedIds: touched,
      });
    }
  }
  return updates;
}
