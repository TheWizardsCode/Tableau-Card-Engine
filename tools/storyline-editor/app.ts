/**
 * Story-line editor page bootstrap.
 *
 * The page is served by the editor host (`npm run storylines:editor`), which
 * answers:
 *
 * - `GET ./manifest.json` — the deterministic graph manifest (the view model);
 * - `GET ./content.json` — the adapter's declarative field mapping/defaults
 *   plus the raw content cards (what the curated edit/add forms prefill from);
 * - `POST ./api/preview|validate|apply` — the F2 write bridge.
 *
 * The bootstrap fetches the two reads once, then mounts the shell. The content
 * response is **optional**: without it the editor still renders the read-only
 * graph (for example when Vite is run directly on `vite.editor.config.ts`
 * without the host's API middleware), with an actionable note instead of an
 * error.
 *
 * @module
 */

import type { StorylineManifest } from '../../src/story-line/content/manifest';
import type { ContentAdapter, ContentCard } from '../../src/story-line/content/types';
import { mountEditorShell, type EditorShell } from './app-shell';
import { createFetchEditorBridge } from './bridge-client';
import { EDITOR_APP_ID, EDITOR_CONTENT_URL, EDITOR_MANIFEST_URL } from './config';

/** The editable content the host serves for the curated forms. */
export interface EditorContentPayload {
  /** The adapter's game id. */
  readonly gameId: string;
  /** Checksum of the loaded content (the concurrency token). */
  readonly checksum: string;
  /** The adapter's declarative field mapping/defaults. */
  readonly adapter: ContentAdapter;
  /** The raw content cards, in file order. */
  readonly cards: readonly ContentCard[];
}

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

/** Fetches a JSON document and validates it is an object. */
async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`the editor host did not serve ${url} (HTTP ${response.status})`);
  }
  const parsed: unknown = await response.json();
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${url} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Fetches the generated manifest from the editor host. */
async function fetchManifest(): Promise<StorylineManifest> {
  const parsed = await fetchJson(EDITOR_MANIFEST_URL);
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error(`${EDITOR_MANIFEST_URL} is not a story-line manifest`);
  }
  return parsed as unknown as StorylineManifest;
}

/**
 * Fetches the editable content (adapter schema + raw cards).
 *
 * @returns The payload, or `null` when the host does not serve it (the editor
 *          then stays read-only without failing the page).
 */
async function fetchContent(): Promise<EditorContentPayload | null> {
  try {
    const parsed = await fetchJson(EDITOR_CONTENT_URL);
    const adapter = parsed.adapter as ContentAdapter | undefined;
    if (!adapter || !Array.isArray(parsed.cards)) return null;
    return {
      gameId: String(parsed.gameId ?? adapter.gameId ?? ''),
      checksum: String(parsed.checksum ?? ''),
      adapter,
      cards: parsed.cards as readonly ContentCard[],
    };
  } catch {
    return null;
  }
}

/** Fetches both reads and mounts the shell (remounting after an accepted edit). */
async function mountEditor(container: HTMLElement): Promise<EditorShell> {
  const manifest = await fetchManifest();
  const content = await fetchContent();
  const bridge = createFetchEditorBridge();

  const shell: EditorShell = mountEditorShell(container, manifest, {
    ...(content
      ? { adapter: content.adapter, cards: content.cards, bridge }
      : {}),
    onApplied: () => {
      // The host reloaded its session; re-fetch so the graph and the form
      // prefill reflect the written content.
      shell.dispose();
      void mountEditor(container);
    },
  });
  return shell;
}

/** Boots the editor page. */
export async function bootEditorPage(container: HTMLElement): Promise<EditorShell | null> {
  try {
    return await mountEditor(container);
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
