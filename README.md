# Tableau Card Engine (TCE)

A modular, spike-driven game engine for building single-player tableau card games with **Phaser 4 RC**, **TypeScript**, **Vite**, and **Vitest**.

**[Play Alpha Game Now](https://thewizardscode.github.io/Tableau-Card-Engine/)**

## Quick Start

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (http://localhost:3000)
npm test             # run Vitest test suite (non-destructive: does not modify tracked assets)
npm run build        # TypeScript check + production build -> dist/
npm run preview      # serve production build locally
npm run tf:generate  # generate ToneForge artifacts to build/tf-synths/

# Smoke test: run deterministic Main Street demo (seed: smoke-1)
npx tsx scripts/demo-main-street.ts --seed "smoke-1"

# Headless smoke test (part of npm test):
npx vitest run --project unit tests/main-street/smoke-scenario.test.ts
```

Note: Vitest browser runs use an internal Vite server, but the dev-only transcript persistence middleware is disabled in test mode to avoid file-system side effects and reduce harness flakiness.

## What Is This?

The Tableau Card Engine (TCE) builds increasingly complex card games as "spikes" to validate gameplay mechanics and engine APIs. Reusable components are extracted from each spike into shared engine modules. The end goal is a fully modular engine that others can use to build their own tableau card games.

The project is organized as a **flat monorepo** -- a single `package.json` at the root, shared engine code under `src/`, and standalone example games under `example-games/`.

## Repository Layout

```
tableau-card-engine/
├── src/                   Engine modules
│   ├── core-engine/       Game loop, state management, turn sequencing
│   ├── card-system/       Card, Deck, Pile abstractions
│   ├── rule-engine/       Rule definitions, validation, turn logic
│   └── ui/                Reusable UI components
├── example-games/         Standalone example games
│   ├── gym/               Interactive demo scene suite for core-engine features
│   ├── golf/              9-Card Golf (human vs. AI)
│   ├── beleaguered-castle/ Beleaguered Castle (open solitaire)
│   ├── sushi-go/          Sushi Go! (card drafting, human vs. AI)
│   ├── feudalism/          Feudalism (engine-building, human vs. AI)
│   └── lost-cities/       Lost Cities (2-player expedition lanes, human vs. AI)
├── public/assets/         Static assets (cards, fonts, images)
│   └── cards/             52 standard card SVGs + card back + game-specific cards (140x190px)
├── tests/                 Vitest test files
├── docs/                  Developer documentation
│   ├── DEVELOPER.md       Detailed developer guide
│   └── core-engine/       Engine API notes (including spatial rules)
├── dist/                  Production build output (gitignored)
├── AGENTS.md              Project guidance and Worklog rules
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html             Single entry point for Vite
└── .gitignore
```

## Technology Stack

| Tool | Purpose |
|------|---------|
| [Phaser 4 RC](https://phaser.io/) (4.0.0-rc.7) | HTML5 game framework -- rendering, input, tweens, scenes |
| [TypeScript](https://www.typescriptlang.org/) (strict, ES2020) | Static typing and early error detection |
| [Vite](https://vitejs.dev/) | Dev server with HMR and optimized production builds |
| [Vitest](https://vitest.dev/) | Vite-native test runner with Jest-compatible API |

## Example Games

| Game | Location | Description |
|------|----------|-------------|
| Hello World \(replaced\) | `example-games/gym/` | Interactive demo scenes for every core-engine feature, including bottom-anchored curved hand layout controls in the Hand & Pile gym -- replaces the original minimal Hello World scene |
| 9-Card Golf | `example-games/golf/` | Single-round 9-Card Golf (human vs. AI) with card flip animations, greedy/random AI strategies, and JSON game transcripts |
| Beleaguered Castle | `example-games/beleaguered-castle/` | Open solitaire with drag-and-drop, click-to-move, undo/redo, auto-move to foundations, auto-complete, win/loss detection, help panel, and JSON game transcripts |
| Sushi Go! | `example-games/sushi-go/` | Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets of sushi dishes, and score the most points |
| Feudalism | `example-games/feudalism/` | Engine-building card game (human vs. AI). Collect gem tokens, purchase development cards for bonuses, attract nobles, and reach 15 prestige to win |
| Lost Cities | `example-games/lost-cities/` | Two-player expedition card game (human vs. AI). Bet on up to 5 colored expeditions across a 3-round match with investment multipliers, ascending-play rules, and cumulative scoring |
| Main Street | `example-games/main-street/` | Single-player tableau builder. Buy businesses/upgrades/events, place businesses on a 10-slot street rendered as a responsive 2x5 grid, and optimize score over 20 turns |
| Scenario: Tutorial | `example-games/main-street/scenes/MainStreetTutorialScene.ts` | Guided introduction to Main Street. Non-interactive tutorial overlays walk through the market, street placement, synergies, events, and scoring. Easy difficulty, 25 turns. Accessible from the Game Selector. |

More games are planned: Coloretto.

## ToneForge runtime adapter (Main Street)

Main Street can optionally route mapped SFX keys through a ToneForge-backed module via `createTfPlayer`.

`npm run tf:generate` now emits a runtime synth module at `build/tf-synths/main-street-runtime-synth.mjs` that provides on-the-fly Tone/WebAudio voices.

Expected tf module exports consumed by the adapter:

- `factories: Record<string, () => TfVoice>`
- optional `getFactory(name)` helper
- optional `descriptors` metadata map

Where `TfVoice` supports any subset of:

- `play()`
- `stop()`
- `setVolume(number)`
- `setMute(boolean)`

See `docs/the-build/audio.md` for generation workflow and wiring details.

## Contributing

1. **Track work with Worklog** -- every change must be associated with a `wl` work item. See `AGENTS.md` for Worklog usage.
2. **Quality gates** -- before pushing, ensure `npm test` passes and `npm run build` succeeds.
3. **Update docs** -- if you change tooling, scripts, directory structure, or developer workflow, update `docs/DEVELOPER.md` and `AGENTS.md` in the same PR or as a child work item.
4. **Asset licensing** -- all assets must be CC0, MIT, Apache 2.0, or similarly permissive. Document attribution in `public/assets/CREDITS.md`.

For detailed development guidance, see [`docs/DEVELOPER.md`](docs/DEVELOPER.md).

## AI Assisted Development

To use pi to assist with Phaser development, clone the Phaser repository into the parent directory and install it as a pi package. For example, from this repository root:

```bash
cd ..
git clone git@github.com:phaserjs/phaser.git
pi install ../phaser
```

After running these commands, pi will discover the Phaser package and any skills, prompts, or extensions it exposes. Use `/reload` or restart pi if needed.

## License

MIT
