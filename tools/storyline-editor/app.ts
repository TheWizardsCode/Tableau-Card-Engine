/**
 * Story-line editor page bootstrap.
 *
 * The page is served by the editor host (`npm run storylines:editor`), which
 * answers `GET ./manifest.json` with the manifest generated from the game's
 * content CSV through its content adapter. The bootstrap fetches that manifest
 * **once**, then mounts the shell, which renders and re-renders the whole graph
 * client-side — no per-node network round-trip.
 *
 * Opening the page without the host (for example by running Vite directly on
 * `vite.editor.config.ts`) is not an error state to hide: it shows an
 * actionable panel explaining how to launch the editor.
 *
 * @module
 */

import type { StorylineManifest } from '../../src/story-line/content/manifest';
import { mountEditorShell, type EditorShell } from './app-shell';
import { EDITOR_APP_ID, EDITOR_MANIFEST_URL } from './config';

/** Renders a message panel instead of the editor. */
function renderMessage(container: HTMLElement, title: string, detail: string): void {
  container.replaceChildren();
  const panel = document.createElement('section');
  panel.className = 'editor-message';
  panel.dataset.role = 'editor-message';

  const heading = document.createElement('h1');
  heading.textContent = title;
  panel.append(heading);

  const paragraph = document.createElement('p');
  paragraph.textContent = detail;
  panel.append(paragraph);

  container.append(panel);
}

/** Fetches the generated manifest from the editor host. */
async function fetchManifest(): Promise<StorylineManifest> {
  const response = await fetch(EDITOR_MANIFEST_URL, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`the editor host did not serve ${EDITOR_MANIFEST_URL} (HTTP ${response.status})`);
  }
  const parsed: unknown = await response.json();
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { nodes?: unknown }).nodes) ||
    !Array.isArray((parsed as { edges?: unknown }).edges)
  ) {
    throw new Error(`${EDITOR_MANIFEST_URL} is not a story-line manifest`);
  }
  return parsed as StorylineManifest;
}

/** Boots the editor page. */
export async function bootEditorPage(container: HTMLElement): Promise<EditorShell | null> {
  try {
    const manifest = await fetchManifest();
    return mountEditorShell(container, manifest);
  } catch (error) {
    renderMessage(
      container,
      'Story-line editor',
      `Could not load the story-line manifest: ${(error as Error).message}. ` +
        'Launch the editor with "npm run storylines:editor" from the repository root ' +
        'so the host can serve the manifest generated from your content CSV.',
    );
    return null;
  }
}

// Guarded so the module stays importable outside a page (tests, tooling).
if (typeof document !== 'undefined') {
  const mountPoint = document.getElementById(EDITOR_APP_ID);
  if (mountPoint) {
    void bootEditorPage(mountPoint);
  }
}
