/**
 * Browser-safe client for the story-line editor's write bridge.
 *
 * The editor page never computes an edit, a diff or a validation verdict
 * itself: it posts an {@link EditorEdit} to the host's F2 endpoints
 * (`/api/preview`, `/api/validate`, `/api/apply`), which call the core bridge
 * — `previewEdit`, `validateEdit`, `applyEdit`. This module is the page's side
 * of that contract: one small typed interface the curated forms depend on, and
 * a `fetch` implementation of it.
 *
 * Keeping the interface here (rather than reaching for `fetch` directly in the
 * forms) is what makes the forms testable in the browser without a dev server:
 * a test can hand the workflow an in-memory bridge that runs the **real** pure
 * preview/validation seam (`src/story-line/editor/edits.ts`) and only stubs the
 * file write.
 *
 * Only **types** are imported from the Node-side bridge module (`api.ts`);
 * `import type` is erased at build time, so this module stays browser-safe.
 *
 * @module
 */

import type {
  EditApplyResult,
  EditPreview,
  EditValidation,
  EditorEdit,
} from '../../src/story-line/editor/api';
import type { StorylineManifest } from '../../src/story-line/content/manifest';
import { EDITOR_API_PATHS } from './config';

/**
 * What the forms need back from an accepted edit.
 *
 * Deliberately a structural subset of {@link EditApplyResult} so an in-memory
 * test bridge only has to supply the fields the UI reads, while the real
 * bridge's full result is assignable unchanged.
 */
export interface EditApplyOutcome {
  /** True when the edit was accepted (applied, or valid on a dry run). */
  readonly ok: boolean;
  /** Human-readable outcome summary (rendered verbatim). */
  readonly message: string;
  /** The preview/diff and validation report for the attempted edit. */
  readonly preview: EditPreview;
  /** Actionable errors (empty when `ok`). */
  readonly errors: readonly string[];
  /** True only when the content file was actually written. */
  readonly written?: boolean;
  /** True when the caller must reload before retrying (stale content). */
  readonly reloadRequired?: boolean;
  /** The content checksum after the attempt. */
  readonly checksum?: string;
  /** The regenerated manifest, when the host includes it (page refresh). */
  readonly manifest?: StorylineManifest;
}

/**
 * The editor's edit bridge: preview → validate → apply, in that order.
 *
 * Every curated form routes through this seam, so no form can write content
 * except through the host's single author-API path.
 */
export interface EditorBridge {
  /** Applies an edit in memory and returns its diff + validation report. */
  preview(edit: EditorEdit): Promise<EditPreview>;
  /** Runs the validator only (no diff), nothing written. */
  validate(edit: EditorEdit): Promise<EditValidation>;
  /** Applies an edit through the transactional author API (the only write). */
  apply(
    edit: EditorEdit,
    options?: { readonly expectedChecksum?: string; readonly dryRun?: boolean },
  ): Promise<EditApplyOutcome>;
}

/** The host response for an apply request (the bridge result plus a manifest). */
export type EditApplyResultWithManifest = EditApplyResult & {
  readonly manifest?: StorylineManifest;
};

/** Posts a JSON body and returns the parsed response body. */
async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? {} : (JSON.parse(text) as unknown);
  } catch {
    throw new Error(`${url} returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok) {
    // The apply endpoint returns the structured refusal in the body; surface it
    // rather than throwing so the form can render the validator's verdict.
    const looked = parsed as { errors?: unknown; message?: unknown };
    if (Array.isArray(looked.errors) || typeof looked.message === 'string') {
      return parsed;
    }
    throw new Error(`${url} failed (HTTP ${response.status}): ${text}`);
  }
  return parsed;
}

/**
 * Creates the `fetch`-backed bridge the editor page uses.
 *
 * @param baseUrl Optional base URL prefixed to the host API paths (defaults to
 *                the page's own origin, i.e. the editor dev server).
 * @returns The bridge.
 */
export function createFetchEditorBridge(baseUrl = ''): EditorBridge {
  const url = (path: string): string => `${baseUrl}${path}`;
  return {
    async preview(edit) {
      return (await postJson(url(EDITOR_API_PATHS.preview), { edit })) as EditPreview;
    },
    async validate(edit) {
      return (await postJson(url(EDITOR_API_PATHS.validate), { edit })) as EditValidation;
    },
    async apply(edit, options = {}) {
      const body = { edit, ...options };
      return (await postJson(url(EDITOR_API_PATHS.apply), body)) as EditApplyResultWithManifest;
    },
  };
}
