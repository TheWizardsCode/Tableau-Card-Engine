/**
 * Build-exclusion guard for the story-line editor (epic AC6).
 *
 * The editor is a development tool. It must never be reachable from the
 * production game entry graph (`index.html` / `main.ts`) and must never be
 * produced by — or packaged into — the game/Electron build. The test asserts
 * the three facts that make that true:
 *
 * 1. the production entry documents reference no editor module;
 * 2. no production source file (`src/`, `electron/`, `main.ts`) imports the
 *    editor (only the editor's own modules and its tooling may);
 * 3. the build/packaging scripts and the Electron packaging file list never
 *    mention the editor or its dedicated Vite config.
 *
 * If a future change wires the editor into the game build, one of these fails
 * here rather than bloating the shipped bundle.
 *
 * @module
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EDITOR_BUILD_OUT_DIR, EDITOR_PAGE_ROOT } from '../../../vite.editor.config';
import { REPO_ROOT } from './fixtures';

/** Tokens that only ever appear in the editor's own (development-only) files. */
const EDITOR_TOKENS = [
  'tools/storyline-editor',
  'storyline-editor-cli',
  'storyline-editor-server',
  'vite.editor.config',
  'src/story-line/editor',
  'story-line/editor',
  'editor/view-model',
];

/** The editor's files; their absence would make the scan vacuous. */
const EDITOR_FILES = [
  'src/story-line/editor/view-model.ts',
  'tools/storyline-editor/index.html',
  'tools/storyline-editor/app.ts',
  'tools/storyline-editor/app-shell.ts',
  'tools/storyline-editor/graph-renderer.ts',
  'tools/storyline-editor/config.ts',
  'scripts/storyline-editor-cli.ts',
  'scripts/storyline-editor-server.ts',
  'vite.editor.config.ts',
];

/** Recursively lists every `.ts` file under a directory. */
function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/** Finds the editor tokens in a text, returning the matches. */
function tokensIn(text: string): string[] {
  return EDITOR_TOKENS.filter((token) => text.includes(token));
}

describe('story-line editor build exclusion', () => {
  it('keeps every editor file in place (a move would make the exclusion scan vacuous)', () => {
    for (const file of EDITOR_FILES) {
      expect(existsSync(join(REPO_ROOT, file)), `${file} exists`).toBe(true);
    }
  });

  it('references no editor module from the production game entry documents', () => {
    for (const entry of ['index.html', 'main.ts']) {
      const text = readFileSync(join(REPO_ROOT, entry), 'utf-8');
      expect(tokensIn(text), `${entry} must not reference the editor`).toEqual([]);
    }
  });

  it('is never imported by production source (src/ or electron/) outside its own module', () => {
    const offenders: string[] = [];
    const roots = ['src', 'electron'];
    for (const root of roots) {
      for (const file of listTsFiles(join(REPO_ROOT, root))) {
        const repoRelative = relative(REPO_ROOT, file).split('\\').join('/');
        if (repoRelative.startsWith('src/story-line/editor/')) continue;
        const tokens = tokensIn(readFileSync(file, 'utf-8'));
        if (tokens.length > 0) offenders.push(`${repoRelative} (${tokens.join(', ')})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is never built or packaged by the production scripts', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    const productionScripts = Object.entries(pkg.scripts ?? {}).filter(
      ([name]) => name === 'build' || name === 'build:electron' || name.startsWith('package'),
    );
    expect(productionScripts.length).toBeGreaterThan(0);
    for (const [name, command] of productionScripts) {
      expect(tokensIn(command), `script "${name}" must not build the editor`).toEqual([]);
      expect(command).not.toContain(EDITOR_PAGE_ROOT);
      expect(command).not.toContain(EDITOR_BUILD_OUT_DIR);
    }
  });

  it('is not shipped by the Electron packaging file list', () => {
    const builder = readFileSync(join(REPO_ROOT, 'electron-builder.yml'), 'utf-8');
    expect(tokensIn(builder)).toEqual([]);

    // The packaged application is the built renderer + main process only; the
    // editor page lives in an unbuilt source directory and its own outDir.
    const filesBlock = builder.split(/^files:\s*$/m)[1];
    expect(filesBlock).toBeDefined();
    const listed = (filesBlock ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '));
    expect(listed).toContain('- dist/**');
    expect(listed.some((entry) => entry.includes('tools/'))).toBe(false);
  });
});
