/**
 * Shared plain-DOM harness for the story-line editor browser tests.
 *
 * Harness decision (recorded on CG-0MVHZ2LS3008ATY9): the editor is a
 * **non-Phaser, non-game** dev page, so its renderer modules are **plain DOM**
 * and are driven directly inside the core `browser` Vitest project — imported,
 * mounted into the real test document and exercised, with no page boot, no
 * game loop and no runtime dependency beyond what Vitest's Playwright browser
 * already provides. The editor *page* is served separately by the dedicated
 * `vite.editor.config.ts`; this module mirrors the mount/dispose lifecycle a
 * future renderer will expose so browser tests do not depend on the page
 * server at all.
 *
 * This file must stay importable in the browser test environment: **no Node
 * builtins, no `node:fs`**, no Phaser.
 *
 * @module
 */

/** A mounted editor harness region. */
export interface EditorHarnessMount {
  /** The harness container, appended to `document.body`. */
  readonly root: HTMLDivElement;
  /** The harness title heading. */
  readonly title: HTMLHeadingElement;
  /** A mutable status line (models the editor's live validation/preview text). */
  readonly status: HTMLParagraphElement;
  /** Detaches the harness from the document. */
  dispose(): void;
}

/**
 * Mounts the plain-DOM harness into the browser test document.
 *
 * @param label Title text for the harness (defaults to a placeholder).
 * @returns The mounted harness plus a `dispose` that detaches it.
 */
export function mountEditorHarness(label = 'Story-line editor harness'): EditorHarnessMount {
  const root = document.createElement('div');
  root.dataset.editorHarness = 'true';

  const title = document.createElement('h1');
  title.textContent = label;

  const status = document.createElement('p');
  status.dataset.status = 'standby';
  status.textContent = 'standby';

  root.append(title, status);
  document.body.append(root);

  return {
    root,
    title,
    status,
    dispose: () => root.remove(),
  };
}
