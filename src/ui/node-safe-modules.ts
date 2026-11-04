/**
 * Node-safe `src/ui` module manifest (CG-0MVS9HBN3009HIQN).
 *
 * A single source of truth for the `src/ui` modules guaranteed importable in a
 * plain Node environment — no `window`, no Phaser evaluation — so downstream
 * `tce-<game>` unit suites and engine maintainers can *look up* node-safety
 * instead of probing with an ad-hoc `vite-node` import.
 *
 * The list is a curated, opt-in promise, **not** a completeness snapshot of
 * `src/ui`: the `@ui` barrel (`src/ui/index.ts`) is intentionally
 * Phaser-bearing (it exports `CardGameScene extends Phaser.Scene`), so Node
 * tests must import these deep, Phaser-free paths instead.
 *
 * Every entry is verified by the node-surface machinery of
 * CG-0MVS9HBN3009HIQN: the static import-graph check
 * (`scripts/check-ui-node-surface.ts`, `npm run check:ui-node-surface`) follows
 * the real module graph, and `tests/ui/phaser-free-imports.test.ts` imports
 * each entry at runtime under a throwing `phaser` mock. To add a module, add it
 * here and let the check prove it; if it proves Phaser-bearing, **drop it**
 * rather than editing that module to accommodate the list.
 *
 * This file is itself Phaser-free and side-effect-free — a plain data module
 * with no value imports — so the check, the guard test and docs tooling can
 * all import it safely.
 */

export const uiNodeSafeModules = [
  // Illegal-move reason-toast text/timing model; framework-free by design.
  'illegalMoveToast',
  // Illegal-move toast view helpers; Phaser appears only as an elided type.
  'illegalMoveToastView',
  // Illegal-move shake/reason feedback; acts through injected scene hooks.
  'shakeIllegalMove',
  // Reusable drag-and-drop lifecycle manager; injected scene hooks, no Phaser values.
  'dragDrop',
  // Screen Layout Language core geometry/resolution engine; pure math + types.
  'screen-layout',
  // SLL composition helpers that layer parsed layouts; pure data transforms.
  'screen-layout-compose',
  // SLL document schema and Ajv validation; no rendering dependency.
  'screen-layout-schema',
  // Shared UI constants (card sizes, fonts, dwell timings); plain scalars.
  'constants',
  // Persisted player-settings store over an injected storage seam; no window access.
  'SettingsStore',
  // Builder for scoped `tce-packs://` card-pack URLs; pure string handling.
  'card-pack-url',
  // Total reader for the optional card-pack bridge; guards `window`, no Phaser.
  'card-pack-client',
  // Builder for scoped `tce-games://` runtime-game asset URLs; pure string handling.
  'game-asset-url',
  // Runtime game manifest parser/compatibility split; JSON + semver only.
  'game-manifest',
  // Runtime plugin discovery/boot payload merge; orchestration over injected seams.
  'game-plugin-boot',
  // Total reader for the optional content-unlock bridge; guards `window`, no Phaser.
  'content-unlock-client',
] as const;

/** Union of the `src/ui` module basenames promised by {@link uiNodeSafeModules}. */
export type UiNodeSafeModule = (typeof uiNodeSafeModules)[number];
