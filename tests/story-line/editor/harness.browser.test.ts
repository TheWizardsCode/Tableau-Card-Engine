/**
 * Placeholder browser wiring for the story-line editor harness.
 *
 * This is the "non-Phaser dev page" path in the core `browser` project: the
 * future editor renderer is a plain-DOM module, so the browser tests import and
 * mount it directly into Vitest's real Chromium document — proving the path
 * works before any editor feature code exists (the harness decision is
 * recorded on CG-0MVHZ2LS3008ATY9).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import { mountEditorHarness } from './harness';

describe('story-line editor browser harness (non-Phaser dev page)', () => {
  it('mounts a plain-DOM renderer into the core browser project document', () => {
    const harness = mountEditorHarness();
    try {
      expect(harness.root.isConnected).toBe(true);
      expect(harness.root.dataset.editorHarness).toBe('true');
      expect(harness.title.textContent).toBe('Story-line editor harness');
      expect(harness.status.dataset.status).toBe('standby');
    } finally {
      harness.dispose();
    }
    expect(harness.root.isConnected).toBe(false);
  });

  it('observes real DOM events without a game loop or page boot', () => {
    const harness = mountEditorHarness();
    try {
      const accept = document.createElement('button');
      accept.textContent = 'Accept';
      harness.root.append(accept);

      let accepted = 0;
      accept.addEventListener('click', () => {
        accepted += 1;
        harness.status.dataset.status = 'accepted';
        harness.status.textContent = 'accepted';
      });

      accept.click();
      accept.click();
      expect(accepted).toBe(2);
      expect(harness.status.textContent).toBe('accepted');

      // The renderer stays plain DOM: no canvas, no Phaser boot in the page.
      expect(harness.root.querySelector('canvas')).toBeNull();
    } finally {
      harness.dispose();
    }
  });
});
