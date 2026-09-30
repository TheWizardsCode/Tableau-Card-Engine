# ToneForge audio workflow

This project uses a **ToneForge-generated runtime module** for synth-mapped SFX integration.

- The **runtime synth module** is committed to source control at
  `public/build/tf-synths/main-street-runtime-synth.mjs`.
- WAV files, JSON metadata, and the metadata module remain **uncommitted**.
- Existing WAV asset playback remains as fallback.
- Runtime integration is via `tfAdapter` + `SoundManager` synth key mapping.

## ToneForge CLI (optional)

The ToneForge CLI (`tf`) is **optional** — the runtime synth module shipped
in `public/build/tf-synths/main-street-runtime-synth.mjs` works without it.
Install ToneForge only if you want to regenerate the module.

Verify installation:

```bash
tf --help
```

## Generating tf artifacts

When `tf` is available, regenerate all outputs:

```bash
npm run tf:generate
```

This command executes `scripts/tf-generate-synths.sh` and writes outputs to:

- `build/tf-synths/wav/*.wav` (generated, gitignored)
- `build/tf-synths/main-street-tf-module.mjs` (metadata, generated)
- `build/tf-synths/main-street-runtime-synth.mjs` (runtime synth factories)
- `build/tf-synths/*.json` (metadata, generated)
- **Also copied to:** `public/build/tf-synths/main-street-runtime-synth.mjs`
  (the committed, source-controlled version)

The runtime module is **always** available in `public/build/tf-synths/`,
even without the `tf` CLI. The `build/tf-synths/` tree is gitignored and
only exists for local regeneration.

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
