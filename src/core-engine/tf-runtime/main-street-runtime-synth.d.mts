/**
 * Type declaration for the committed ToneForge runtime synth module
 * (`main-street-runtime-synth.mjs`).
 *
 * The module is generated JavaScript and intentionally not type-checked; this
 * declaration describes its stable public surface so TypeScript consumers
 * (the Main Street sibling repo and the core unit test) can import it.
 *
 * @module main-street-runtime-synth
 */

import type { TfFactory, TfGeneratedModule } from '../tfAdapter';

/** Runtime synth descriptor metadata, keyed by logical SFX key. */
export const descriptors: Record<string, { runtime: string }>;

/** Runtime synth voice factories, keyed by logical SFX key. */
export const factories: Record<string, TfFactory>;

/** Look up a factory by logical SFX key. */
export function getFactory(name: string): TfFactory | undefined;

/** Aggregate export consumed by `tfAdapter` (`createTfPlayer`). */
export const TF_RUNTIME_MODULE: TfGeneratedModule;
