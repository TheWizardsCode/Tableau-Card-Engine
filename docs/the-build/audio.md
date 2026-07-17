# ToneForge audio workflow

This project uses a **ToneForge-generated runtime module** for synth-mapped SFX integration.

- We do **not** commit generated tf artifacts.
- Existing WAV asset playback remains as fallback.
- Runtime integration is via `tfAdapter` + `SoundManager` synth key mapping.

## Install ToneForge CLI

If `tf` is not available on your PATH, install ToneForge according to your environment.

Verify installation:

```bash
tf --help
```

## Generate Main Street tf artifacts

Run:

```bash
npm run tf:generate
```

This command executes `scripts/tf-generate-synths.sh` and writes outputs to:

- `build/tf-synths/wav/*.wav`
- `build/tf-synths/main-street-tf-module.mjs` (metadata)
- `build/tf-synths/main-street-runtime-synth.mjs` (Tone/WebAudio runtime synth factories)
- `build/tf-synths/*.json` metadata

To use a custom output path:

```bash
TF_SYNTH_OUT_DIR=build/tf-synths-custom npm run tf:generate
# or
scripts/tf-generate-synths.sh build/tf-synths-custom
```

## Runtime wiring expectations

Main Street uses logical SFX keys (e.g. `ms-place`, `ms-move-loop`) mapped in:

- `example-games/main-street/sfx-tf-mapping.ts`

Runtime integration points:

- `src/core-engine/tfAdapter.ts` (`createTfPlayer`)
- `src/core-engine/SoundManager.ts` (`synthPlayer` + `synthKeyMap`)
- `example-games/main-street/scenes/MainStreetScene.ts`

Default source-controlled shim:

- `example-games/main-street/tf/mainStreetTfModule.ts`

The shim defaults to `null` so the game continues to use WAV fallback when tf artifacts are not present.

At runtime, MainStreetScene also attempts asynchronous dynamic loading from:

- `/build/tf-synths/main-street-runtime-synth.mjs`

You can override this URL for development/tests via:

- `globalThis.__MAIN_STREET_TF_MODULE_URL__`

For direct injection (used by tests), set:

- `globalThis.__MAIN_STREET_TF_MODULE__`

## CI guidance

CI tests should use mocked tf modules (unit/integration tests) and must not require installed ToneForge unless explicitly configured.
