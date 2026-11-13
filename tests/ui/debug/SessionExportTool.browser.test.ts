/**
 * Browser tests for the Session Export debug tool (CG-0MW3KV4D7004KCF0).
 *
 * Boots a real Phaser CANVAS scene and asserts on the download + status
 * behaviour of `createSessionExportTool()`:
 *   - a recorder discovered under `transcriptRecorder` (the tce-the-rising
 *     shape) yields exactly one download whose content is the recorder's
 *     `getTranscript()` output pretty-printed with 2-space indentation,
 *     named `session-export-<timestamp>.json` with MIME `application/json`,
 *   - a scene with no conforming recorder yields NO download and the tool's
 *     live description shows the visible no-recorder reason,
 *   - the reason is cleared by a later successful export (the status always
 *     reflects only the most recent attempt).
 *
 * The DOM download path (Blob → object URL → anchor click) is intercepted by
 * patching `URL.createObjectURL` and `HTMLAnchorElement.prototype.click`, so
 * no real download is triggered in headless Chromium.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createSessionExportTool } from '../../../src/ui/debug/SessionExportTool';
import { resolveDebugToolDescription } from '../../../src/ui/debug/DebugToolsRegistry';
import { waitForScene } from '../../helpers/waitForScene';

const SCENE_KEY = 'TestSessionExportTool';

/** Minimal scene exposing the recorder under `transcriptRecorder`. */
class SessionExportTestScene extends Phaser.Scene {
  transcriptRecorder: { getTranscript: () => unknown } | null = null;
  recorder: unknown = null;

  constructor() {
    super({ key: SCENE_KEY });
  }
}

/** Recorder shape used by `createSessionExportTool()`'s own tests. */
const RECORDER_TRANSCRIPT = {
  turns: [{ player: 0, action: 'deal', card: { id: 'copper', value: 3 } }],
  events: ['deal', 'state-settled'],
  metadata: { seed: 42, exportedAt: '2026-11-05T00:00:00.000Z' },
};

/** Patch a browser API, restoring the original in `restore()`. */
function patch(target: object, key: string, replacement: unknown): () => void {
  const targetRecord = target as unknown as Record<string, unknown>;
  const original = targetRecord[key];
  targetRecord[key] = replacement;
  return () => {
    targetRecord[key] = original;
  };
}

describe('Session Export debug tool', () => {
  let game: Phaser.Game | null = null;
  let scene: SessionExportTestScene;
  /** Blobs passed to URL.createObjectURL during the current test. */
  let capturedBlobs: Blob[];
  /** Anchors whose click() was invoked during the current test. */
  let clickedAnchors: HTMLAnchorElement[];
  let restoreUrl: (() => void) | null = null;
  let restoreClick: (() => void) | null = null;

  beforeEach(async () => {
    let container = document.getElementById('game-container');
    if (container) container.remove();
    container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: 'game-container',
      width: 1280,
      height: 720,
      scene: [SessionExportTestScene],
    } as Phaser.Types.Core.GameConfig);
    await waitForScene(game, SCENE_KEY);
    scene = game.scene.getScene(SCENE_KEY) as SessionExportTestScene;

    capturedBlobs = [];
    clickedAnchors = [];
    restoreUrl = patch(URL, 'createObjectURL', ((blob: Blob) => {
      capturedBlobs.push(blob);
      return `blob:mock-${capturedBlobs.length}`;
    }) as unknown as typeof URL.createObjectURL);
    restoreClick = patch(
      HTMLAnchorElement.prototype,
      'click',
      (function click(this: HTMLAnchorElement) {
        clickedAnchors.push(this);
      }) as unknown as () => void,
    );
  }, 30_000);

  afterEach(() => {
    restoreUrl?.();
    restoreClick?.();
    restoreUrl = null;
    restoreClick = null;

    if (game) game.destroy(true, false);
    game = null;
    document.getElementById('game-container')?.remove();
  });

  it('downloads exactly one file with the full transcript for a `transcriptRecorder` scene', async () => {
    const tool = createSessionExportTool();
    scene.transcriptRecorder = { getTranscript: () => RECORDER_TRANSCRIPT };

    tool.activate(scene);

    // Exactly one download attempt: one blob URL created, one anchor clicked.
    expect(capturedBlobs.length).toBe(1);
    expect(clickedAnchors.length).toBe(1);

    // Content: the recorder's getTranscript() output, losslessly pretty-printed.
    const blob = capturedBlobs[0];
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe(JSON.stringify(RECORDER_TRANSCRIPT, null, 2));

    // Filename follows the documented session-export-<timestamp>.json pattern.
    const anchor = clickedAnchors[0];
    expect(anchor.download).toMatch(
      /^session-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/,
    );
    expect(anchor.href).toMatch(/^blob:mock-1$/);

    // A successful export does not leave a stale failure reason in the panel.
    expect(resolveDebugToolDescription(tool)).toContain('Download current game transcript');
  });

  it('downloads exactly one file when the recorder is exposed as `recorder`', async () => {
    const tool = createSessionExportTool();
    scene.recorder = { getTranscript: () => RECORDER_TRANSCRIPT };

    tool.activate(scene);

    expect(capturedBlobs.length).toBe(1);
    expect(clickedAnchors.length).toBe(1);
    expect(await capturedBlobs[0].text()).toBe(
      JSON.stringify(RECORDER_TRANSCRIPT, null, 2),
    );
  });

  it('triggers no download and surfaces the reason for a scene without a recorder', () => {
    const tool = createSessionExportTool();
    // The scene has no conforming recorder (transcriptRecorder is null).
    scene.transcriptRecorder = null;

    tool.activate(scene);

    expect(capturedBlobs.length).toBe(0);
    expect(clickedAnchors.length).toBe(0);
    expect(resolveDebugToolDescription(tool)).toContain(
      'No transcript recorder found on this scene',
    );
  });

  it('triggers no download when the recorder property is a non-conforming object', () => {
    const tool = createSessionExportTool();
    scene.transcriptRecorder = { turns: [], events: [] } as never;

    tool.activate(scene);

    expect(capturedBlobs.length).toBe(0);
    expect(clickedAnchors.length).toBe(0);
    expect(resolveDebugToolDescription(tool)).toContain(
      'No transcript recorder found on this scene',
    );
  });

  it('triggers no download and surfaces a reason when getTranscript throws', () => {
    const tool = createSessionExportTool();
    scene.transcriptRecorder = {
      getTranscript: () => {
        throw new Error('recorder exploded');
      },
    };

    tool.activate(scene);

    expect(capturedBlobs.length).toBe(0);
    expect(clickedAnchors.length).toBe(0);
    expect(resolveDebugToolDescription(tool)).toContain('Failed to read the transcript');
  });

  it('replaces a stale failure reason with a successful export (status = latest attempt)', async () => {
    const tool = createSessionExportTool();

    // First: a failing export leaves the visible reason.
    scene.transcriptRecorder = null;
    tool.activate(scene);
    expect(resolveDebugToolDescription(tool)).toContain(
      'No transcript recorder found on this scene',
    );

    // Then: a later success must clear/replace it (no misleading stale status).
    scene.transcriptRecorder = { getTranscript: () => ({ turns: [] }) };
    tool.activate(scene);

    expect(capturedBlobs.length).toBe(1);
    expect(resolveDebugToolDescription(tool)).not.toContain(
      'No transcript recorder found on this scene',
    );
    expect(resolveDebugToolDescription(tool)).toContain('Download current game transcript');
  });
});
