import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const RUNTIME_DIRS = ['src', 'example-games'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function listRuntimeFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      const st = statSync(file);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'build') continue;
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
