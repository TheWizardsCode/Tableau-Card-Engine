/**
 * Unit guard for the dedicated story-line editor Vite config.
 *
 * The editor is a development-only, non-Phaser page: it must keep its own
 * config (root, port, build output) and must not inherit the game build's
 * discovery/assets plugins. This test is the wiring guard for the harness
 * decision recorded on CG-0MVHZ2LS3008ATY9 — if the config drifts back towards
 * the game config, it fails here rather than in the production bundle.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import editorConfig, {
  EDITOR_BUILD_OUT_DIR,
  EDITOR_PAGE_ROOT,
  EDITOR_SERVER_PORT,
} from '../../../vite.editor.config';

describe('story-line editor Vite config', () => {
  it('serves the editor page from its own root on a dedicated port', () => {
    expect(editorConfig.root).toBe(EDITOR_PAGE_ROOT);
    expect(editorConfig.root).toBe('tools/storyline-editor');
    expect(editorConfig.server?.port).toBe(EDITOR_SERVER_PORT);
    expect(editorConfig.server?.port).toBe(5174);
    // Not the game dev server's port (3000) — the two servers can run together.
    expect(editorConfig.server?.port).not.toBe(3000);
  });

  it('builds to a separate output directory so the game bundle never includes the editor', () => {
    expect(editorConfig.build?.outDir).toBe(EDITOR_BUILD_OUT_DIR);
    expect(editorConfig.build?.outDir).not.toBe('dist');
  });

  it('resolves the core aliases without registering the game build plugins', () => {
    const alias = editorConfig.resolve?.alias as Record<string, string>;
    expect(alias['@story-line']).toContain('/src/story-line');
    expect(alias['@core-engine']).toContain('/src/core-engine');

    const plugins = (editorConfig.plugins ?? []) as { name?: string }[];
    expect(plugins.some((plugin) => plugin.name === 'tce-game-discovery')).toBe(false);
  });
});
