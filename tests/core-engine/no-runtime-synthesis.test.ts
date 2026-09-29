// Guard: the "no Tone.js in runtime code" invariant (test-review C6 /
// CG-0MUA14GAU0063D95). The primary enforcement is the ESLint
// `no-restricted-imports` rule for `tone` in `eslint.config.cjs`; this test
// remains as the automated (CI-time) guard because the project has no wired
// `lint` script/build step that runs ESLint. Keep the two in sync.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const RUNTIME_DIRS = ['src', 'example-games'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function listRuntimeFiles(root: string): string[] {
  const out: string[] = [];

  // Build-time tooling lives in `scripts/` directories (including a game's own
  // `example-games/<game>/scripts/`), and is not runtime code — so it is
  // excluded from this guard. The same applies to test and build output trees.
  const SKIP_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    'scripts',
    'tests',
    '__tests__',
  ]);

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const st = statSync(file);
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(file);
      } else if (EXTENSIONS.has(extname(file))) {
        out.push(file);
      }
    }
  };

  walk(root);
  return out;
}

describe('runtime audio synthesis guardrails', () => {
  it('does not import Tone.js in runtime game/engine code', () => {
    const violations: string[] = [];

    for (const dir of RUNTIME_DIRS) {
      for (const file of listRuntimeFiles(dir)) {
        const text = readFileSync(file, 'utf8');
        if (text.includes("from 'tone'") || text.includes('from "tone"')) {
          violations.push(file);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
