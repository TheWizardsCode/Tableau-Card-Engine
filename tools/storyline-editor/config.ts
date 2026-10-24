/**
 * Shared, browser-safe constants for the story-line editor page.
 *
 * The editor host (a Node-side Vite dev server) and the page must agree on the
 * manifest URL and the mount element without importing each other: the host
 * imports `vite` and Node builtins, so the page cannot import it. Keeping the
 * two ends' constants here — a module with no DOM, Node or `vite` dependency —
 * makes the agreement explicit and unit-testable.
 *
 * @module
 */

/** Id of the page's mount element (see `index.html`). */
export const EDITOR_APP_ID = 'storyline-editor-app';

/** Browser-relative URL the page fetches the generated manifest from. */
export const EDITOR_MANIFEST_URL = './manifest.json';

/**
 * Host-relative path the editor host serves the generated manifest on.
 *
 * Kept in sync with {@link EDITOR_MANIFEST_URL} by
 * `tests/story-line/editor/cli.test.ts`.
 */
export const EDITOR_MANIFEST_PATH = '/manifest.json';

/** Host-relative path of the preview endpoint (`POST`, returns the diff). */
export const EDITOR_PREVIEW_PATH = '/api/preview';

/** Host-relative path of the validate endpoint (`POST`, validator report only). */
export const EDITOR_VALIDATE_PATH = '/api/validate';

/** Host-relative path of the apply endpoint (`POST`, the only write). */
export const EDITOR_APPLY_PATH = '/api/apply';

/** Every host API path the editor page may call, with its operation. */
export const EDITOR_API_PATHS = {
  preview: EDITOR_PREVIEW_PATH,
  validate: EDITOR_VALIDATE_PATH,
  apply: EDITOR_APPLY_PATH,
} as const;
