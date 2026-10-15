/**
 * The core-engine semantic version.
 *
 * Kept in its own leaf module rather than directly in the barrel
 * (`index.ts`) so that modules living inside `src/core-engine/` — such as
 * `CardPackManifest.ts` — can reuse it without importing the barrel and
 * creating a circular initialisation (a top-level read of a barrel binding
 * during the barrel's own evaluation would hit the temporal dead zone).
 *
 * `index.ts` re-exports this constant, so `@core-engine` remains the single
 * public source of truth for the running engine version.
 */
export const ENGINE_VERSION = '0.1.0';
