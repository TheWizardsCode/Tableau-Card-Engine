# ToneForge output spike (CG-0MOIY2VV200658OX)

## Goal

Capture the current ToneForge CLI output shape and define the minimal runtime module shape that our future `tfAdapter` can consume without implementing synthesis internals in this repository.

## Environment observed

- CLI: `tf` / `toneforge`
- Version: `0.1.0`
- Observed capability: WAV generation via `tf generate`
- Not observed in this CLI version: direct JS runtime module generation command

## Repro script

Run:

```bash
scripts/tf-spike-capture.sh
```

Optional output directory:

```bash
scripts/tf-spike-capture.sh build/tf-synths-spike
```

This script will:

1. Generate two representative recipes (`card-flip`, `card-place`) to WAV files.
2. Save CLI JSON metadata responses.
3. Emit a spike sample module at `build/tf-synths-spike/tf-generated-sample.mjs`.

The generated output directory is under `build/` (already gitignored).

## Captured sample module shape

`tf-generated-sample.mjs` exports:

- `tfVersion: string`
- `tfDescriptors: Record<string, { recipe: string; seed: number; wavPath: string }>`
- `hasDescriptor(key): boolean`
- `getDescriptor(key): descriptor | null`

### Why this shape

- It is thin metadata only; no synthesis logic is duplicated in this repo.
- It is enough for an adapter to map logical sound keys to ToneForge-produced artifacts.
- It keeps fallback routing straightforward (descriptor missing -> existing WAV playback path).

## Proposed adapter target contract

The forthcoming runtime adapter (`createTfPlayer`) should accept a generated module with descriptor exports and expose the existing `SoundPlayer` contract:

- `play(key: string): void`
- `stop(key: string): void`
- `setVolume(volume: number): void`
- `setMute(muted: boolean): void`

The adapter is responsible only for delegation and key mapping; synthesis generation remains a ToneForge concern.

## Open questions

1. **CLI/API variance:** will production ToneForge provide direct JS module export (factories/players), or should we formalize descriptor-module generation in project scripts?
2. **Asset/runtime policy:** should generated descriptor modules and WAVs be runtime build artifacts only, or should any subset be committed for deterministic demos?
3. **Loader strategy:** static import vs dynamic import for generated module in browser bundles.
4. **CI pathing:** confirm canonical output location for generated artifacts (`build/tf-synths/` vs `build/tf-synths-spike/`).

## Opt-in default (MS-0MV76P7BN00164RF)

ToneForge runtime synthesis is **off by default**. The `SoundManager` accepts
`synthPlayer` / `synthKeyMap` constructor options for forward compatibility but
does **not** attach them at construction — `isSynthActive()` is `false` and
playback uses the WAV/Phaser path until synthesis is explicitly enabled via
`enableSynth()` / `setSynthIntegration()`. Games must opt in per session; Main
Street does so from the dev-only **ToneForge** debug tool, which lazily
loads the committed runtime module only when synthesis is switched on (no boot
fetch, no `[mainStreet tf]` load activity on the default path).
