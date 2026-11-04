/**
 * Shape and integrity tests for the node-safe `src/ui` module manifest
 * (CG-0MVS9HBN3009HIQN).
 *
 * The manifest is a promise: every listed module must be importable in a plain
 * Node environment, and downstream game suites rely on that promise instead of
 * probing. The runtime proof (import under a throwing `phaser` mock) and the
 * static import-graph proof live in their own suites; this file keeps the
 * *data* honest — a readonly, duplicate-free list of non-empty module basenames
 * that each map to a real `src/ui/<entry>.ts` file.
 */

import { existsSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { uiNodeSafeModules } from '../../src/ui/node-safe-modules';

const UI_DIR = new URL('../../src/ui/', import.meta.url);

/** `true` for a mutable array type, `false` for a readonly tuple. */
type IsMutableArray<T> = T extends unknown[] ? true : false;

describe('uiNodeSafeModules manifest', () => {
  it('is a readonly tuple of module basenames', () => {
    // `as const` makes the tuple readonly. Dropping it would widen the type to
    // `string[]`, resolve IsMutableArray to `true`, and fail `npm run build`
    // (tsc --noEmit) on this assertion.
    expectTypeOf<IsMutableArray<typeof uiNodeSafeModules>>().toEqualTypeOf<false>();
    expect(Array.isArray(uiNodeSafeModules)).toBe(true);
    expect(uiNodeSafeModules.length).toBeGreaterThan(0);
  });

  it('contains only non-empty, bare module basenames', () => {
    for (const entry of uiNodeSafeModules) {
      expect(typeof entry).toBe('string');
      expect(entry).toBe(entry.trim());
      expect(entry.length).toBeGreaterThan(0);
      expect(entry).not.toMatch(/\.ts$/);
      expect(entry).not.toMatch(/[\\/]/);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(uiNodeSafeModules).size).toBe(uiNodeSafeModules.length);
  });

  it('maps every entry to an existing src/ui/<entry>.ts module', () => {
    const missing = uiNodeSafeModules.filter(
      (entry) => !existsSync(new URL(`${entry}.ts`, UI_DIR)),
    );
    expect(missing).toEqual([]);
  });
});
