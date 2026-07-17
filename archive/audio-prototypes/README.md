# Audio prototype archive

This directory is reserved for archived internal synthesis prototypes.

## Current status

As of CG-0MOIY3ZQM0017M80:

- No runtime synthesis prototype implementation remains in `src/` or `example-games/`.
- Runtime audio uses:
  - WAV asset playback fallback, and
  - optional ToneForge module delegation via `tfAdapter`.

Validation guardrail:

- `tests/core-engine/no-runtime-synthesis.test.ts` asserts there are no runtime imports of Tone.js in `src/` or `example-games/`.
