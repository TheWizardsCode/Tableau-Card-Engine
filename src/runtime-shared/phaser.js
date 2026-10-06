/**
 * Phaser re-export stub for runtime game plugins
 * (CG-0MUV9Y71Z002W8N2).
 *
 * Runtime game artifacts externalise `phaser` (so they never bundle a second
 * Phaser copy). The launcher's runtime-shared import map points the bare
 * `phaser` specifier at the chunk built from this module, which re-exports the
 * launcher's single Phaser instance — preserving class identity for
 * dynamically-imported scene classes.
 *
 * This is plain JavaScript (not TypeScript): Phaser's type declarations use
 * `export =`, which `export *` cannot re-export. The emitted ESM bundle does
 * expose the named bindings and a default, so the runtime re-export is exact.
 *
 * @see scripts/vite-runtime-shared-plugin.ts
 * @see docs/DEVELOPER.md — "Runtime game plugins"
 */

export * from 'phaser';
export { default } from 'phaser';
