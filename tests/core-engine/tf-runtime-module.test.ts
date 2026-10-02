/**
 * Unit test: committed ToneForge runtime synth module is present and valid.
 *
 * Verifies that the runtime synth module shipped with the engine at
 * `src/core-engine/tf-runtime/main-street-runtime-synth.mjs` exists on disk,
 * is importable as an ES module, and exposes `TF_RUNTIME_MODULE`/`factories`
 * with the full set of synth keys.
 *
 * Why `src/` and not `public/`: Vite refuses to import a module from `public/`
 * ("This file is in /public and will be copied as-is during build ... it can
 * only be referenced via HTML tags"), so the committed module lives in the
 * source tree and is bundled by every build. See CG-0MUL2G17U003C1N6.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as runtimeSynth from '../../src/core-engine/tf-runtime/main-street-runtime-synth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/** The committed runtime module, relative to the repo root. */
const RUNTIME_MODULE_RELATIVE_PATH = path.join(
  'src',
  'core-engine',
  'tf-runtime',
  'main-street-runtime-synth.mjs',
);

const RUNTIME_MODULE_PATH = path.join(repoRoot, RUNTIME_MODULE_RELATIVE_PATH);

/** All expected synth factory keys. */
const EXPECTED_KEYS = [
  'card-draw',
  'card-slide',
  'card-place',
  'card-discard',
  'card-coin-collect',
  'ui-notification-chime',
  'card-table-ambience',
  'construction-hammer',
  'construction-saw',
  'construction-lite-hammer',
  'construction-lite-saw',
  'crowd-cheer',
];

describe('ToneForge runtime synth module', () => {
  it('is committed on disk at the path the runtime imports', () => {
    expect(fs.existsSync(RUNTIME_MODULE_PATH)).toBe(true);
  });

  it('exports TF_RUNTIME_MODULE with descriptors and factories', () => {
    expect(runtimeSynth.TF_RUNTIME_MODULE).toBeDefined();
    expect(runtimeSynth.TF_RUNTIME_MODULE.descriptors).toBeDefined();
    expect(runtimeSynth.TF_RUNTIME_MODULE.factories).toBeDefined();

    // Also verify named exports for direct consumption.
    expect(runtimeSynth.descriptors).toBeDefined();
    expect(runtimeSynth.factories).toBeDefined();
    expect(runtimeSynth.getFactory).toBeInstanceOf(Function);
  });

  it('exposes a factory function for every expected synth key', () => {
    for (const key of EXPECTED_KEYS) {
      expect(runtimeSynth.factories).toHaveProperty(key);
      expect(typeof runtimeSynth.factories[key]).toBe('function');
    }
  });

  it('exposes descriptors for every expected synth key', () => {
    for (const key of EXPECTED_KEYS) {
      expect(runtimeSynth.descriptors).toHaveProperty(key);
    }
  });

  it('getFactory returns exactly the factory stored in factories', () => {
    for (const key of EXPECTED_KEYS) {
      expect(runtimeSynth.getFactory(key)).toBe(runtimeSynth.factories[key]);
    }
  });
});
