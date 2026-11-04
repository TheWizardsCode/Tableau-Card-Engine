/**
 * Node-environment import-guard tests for the framework-free `@ui` helper
 * graph (CG-0MVQQ2M8E003FQMZ; manifest-driven guard CG-0MVTVT86U00602PP).
 *
 * Downstream game unit suites import deep `@ui/*` helpers in a plain Node
 * environment (no `window`). Every module listed in the node-safe manifest
 * (`src/ui/node-safe-modules.ts`, CG-0MVS9HBN3009HIQN) must resolve **without
 * evaluating Phaser** at import time — a Phaser value import crashes at
 * `phaser/dist/phaser.esm.js` with `ReferenceError: window is not defined`,
 * which is exactly the regression this suite guards against.
 *
 * The guard mechanism: a file-scoped `vi.mock('phaser', …)` whose factory
 * **throws** when Phaser is actually imported. The guard targets are read from
 * the manifest at runtime (never a hard-coded list), so adding a manifest entry
 * automatically widens this evaluation-based guard — it is the runtime
 * counterpart of the static import-graph check
 * (`scripts/check-ui-node-surface.ts`, `npm run check:ui-node-surface`). If
 * (and only if) some module in a guard target's import graph evaluates Phaser,
 * the import below throws and the test fails — so a reintroduced Phaser value
 * import can never silently pass. The mock is deliberately file-scoped:
 * `vi.mock` applies per test file only, so it cannot mask or disturb other
 * unit tests, and it must never be moved into a global setup file.
 *
 * Negative control: importing a known Phaser-bearing module
 * (`@ui/Renderer` — `new Phaser.Geom.Rectangle(...)` at module scope) under
 * the same mock **fails**, proving the guard has teeth (a guard that passes
 * because the mock never fires would otherwise be worthless).
 */

import { describe, expect, it, vi } from 'vitest';

import { uiNodeSafeModules } from '../../src/ui/node-safe-modules';

/** Distinctive marker so the negative control can attribute the failure. */
const PHASER_EVALUATED = 'phaser evaluated at import time under node guard';

/**
 * How many times the throwing mock factory actually ran.
 *
 * `vi.hoisted` keeps this counter usable from inside the hoisted `vi.mock`
 * factory. The guard targets must leave it at `0` (Phaser never imported); the
 * negative control must push it up by one (the mock is genuinely wired, so the
 * rejection is attributable to Phaser evaluation and not to an unrelated
 * module-resolution error).
 */
const phaserMock = vi.hoisted(() => ({ calls: 0 }));

vi.mock('phaser', () => {
  phaserMock.calls += 1;
  throw new Error(PHASER_EVALUATED);
});

/**
 * Runtime export expectations for the modules this guard asserted explicitly
 * before it became manifest-driven. Entries added to the manifest later are
 * still guarded (imported under the throwing mock); they simply have no
 * shape expectation yet.
 *
 * `typeof` is what the guard needs: it proves the expected binding really is a
 * runtime value, not a type that a broken import could silently elide. A plain
 * value asserts both presence and identity.
 */
const EXPECTED_RUNTIME_EXPORTS: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  illegalMoveToast: { IllegalMoveToastModel: 'function' },
  illegalMoveToastView: {
    showIllegalMoveToast: 'function',
    dismissIllegalMoveToast: 'function',
  },
  shakeIllegalMove: { shakeIllegalMove: 'function' },
  dragDrop: { createDragDropManager: 'function', DEFAULT_DRAG_DEPTH: 1000 },
};

/**
 * Import a guard target dynamically so it is evaluated *inside* a test, under
 * the file-scoped throwing mock. The template literal keeps the target list
 * data-driven: Vite resolves it as a glob over `src/ui`, so a manifest entry
 * needs no code change here.
 */
async function importUiModule(moduleName: string): Promise<Record<string, unknown>> {
  return (await import(`../../src/ui/${moduleName}`)) as Record<string, unknown>;
}

describe('Phaser-free @ui helper graph (node import guard)', () => {
  it('runs in a Node environment without `window`', () => {
    expect(typeof window).toBe('undefined');
  });

  it('has a non-empty, duplicate-free manifest of guard targets', () => {
    // A vacuous guard (zero targets, or duplicates that make the count lie) is
    // the failure mode this assertion rules out; the manifest is the list.
    expect(uiNodeSafeModules.length).toBeGreaterThan(0);
    expect(new Set(uiNodeSafeModules).size).toBe(uiNodeSafeModules.length);
  });

  it.each(uiNodeSafeModules)(
    'imports the manifest entry @ui/%s without evaluating Phaser',
    async (moduleName) => {
      const callsBefore = phaserMock.calls;

      const namespace = await importUiModule(moduleName);

      // A bare `{}` namespace would make the import assertion vacuous, so every
      // listed module must expose at least one runtime export.
      expect(Object.keys(namespace).length).toBeGreaterThan(0);

      // Phaser was never evaluated for this guard target.
      expect(phaserMock.calls).toBe(callsBefore);

      for (const [exportName, expected] of Object.entries(
        EXPECTED_RUNTIME_EXPORTS[moduleName] ?? {},
      )) {
        if (typeof expected === 'string') {
          expect(typeof namespace[exportName]).toBe(expected);
        } else {
          expect(namespace[exportName]).toBe(expected);
        }
      }
    },
  );

  it('never evaluates Phaser for any guard target', () => {
    // The throwing factory above has not run at all: no manifest entry (nor the
    // manifest module itself) touched Phaser, not even for its types.
    expect(phaserMock.calls).toBe(0);
  });

  it('negative control: a Phaser-bearing @ui module fails under the same mock', async () => {
    // `@ui/Renderer` (`createHudText`) evaluates `new Phaser.Geom.Rectangle(...)`
    // at module scope. If the guard's throwing mock has teeth, this import must
    // reject *and* the factory must have run — proving the positive results
    // above are not vacuous.
    const callsBefore = phaserMock.calls;

    await expect(import('../../src/ui/Renderer')).rejects.toThrow();

    expect(phaserMock.calls).toBeGreaterThan(callsBefore);
  });
});
