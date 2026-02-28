# Tableau Card Engine (TCE)

A modular, spike-driven game engine for building single-player tableau card games with **Phaser 3.x**, **TypeScript**, **Vite**, and **Vitest**.

**[Play Alpha Game Now](https://thewizardscode.github.io/Tableau-Card-Engine/)**

## Quick Start

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (http://localhost:3000)
npm test             # run Vitest test suite
npm run build        # TypeScript check + production build -> dist/
npm run preview      # serve production build locally
```

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
│   ├── hello-world/       Minimal Phaser scene (toolchain proof)
│   ├── golf/              9-Card Golf (human vs. AI)
│   ├── beleaguered-castle/ Beleaguered Castle (open solitaire)
│   ├── sushi-go/          Sushi Go! (card drafting, human vs. AI)
│   ├── feudalism/          Feudalism (engine-building, human vs. AI)
│   └── lost-cities/       Lost Cities (2-player expedition lanes, human vs. AI)
├── public/assets/         Static assets (cards, fonts, images)
│   └── cards/             52 standard card SVGs + card back + game-specific cards (140x190px)
├── tests/                 Vitest test files
├── docs/                  Developer documentation
│   └── DEVELOPER.md       Detailed developer guide
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
| [Phaser 3.x](https://phaser.io/) (3.90.0) | HTML5 game framework -- rendering, input, tweens, scenes |
| [TypeScript](https://www.typescriptlang.org/) (strict, ES2020) | Static typing and early error detection |
| [Vite](https://vitejs.dev/) | Dev server with HMR and optimized production builds |
| [Vitest](https://vitest.dev/) | Vite-native test runner with Jest-compatible API |

## Example Games

| Game | Location | Description |
|------|----------|-------------|
| Hello World | `example-games/hello-world/` | Minimal Phaser scene with card sprites -- proves the toolchain works |
| 9-Card Golf | `example-games/golf/` | Single-round 9-Card Golf (human vs. AI) with card flip animations, greedy/random AI strategies, and JSON game transcripts |
| Beleaguered Castle | `example-games/beleaguered-castle/` | Open solitaire with drag-and-drop, click-to-move, undo/redo, auto-move to foundations, auto-complete, win/loss detection, help panel, and JSON game transcripts |
| Sushi Go! | `example-games/sushi-go/` | Card drafting game (human vs. AI). Pick and pass hands over 3 rounds, collect sets of sushi dishes, and score the most points |
| Feudalism | `example-games/feudalism/` | Engine-building card game (human vs. AI). Collect gem tokens, purchase development cards for bonuses, attract nobles, and reach 15 prestige to win |
| Lost Cities | `example-games/lost-cities/` | Two-player expedition card game (human vs. AI). Bet on up to 5 colored expeditions across a 3-round match with investment multipliers, ascending-play rules, and cumulative scoring |

More games are planned: The Mind and Coloretto.

## Contributing

1. **Track work with Worklog** -- every change must be associated with a `wl` work item. See `AGENTS.md` for Worklog usage.
2. **Quality gates** -- before pushing, ensure `npm test` passes and `npm run build` succeeds.
3. **Update docs** -- if you change tooling, scripts, directory structure, or developer workflow, update `docs/DEVELOPER.md` and `AGENTS.md` in the same PR or as a child work item.
4. **Asset licensing** -- all assets must be CC0, MIT, Apache 2.0, or similarly permissive. Document attribution in `public/assets/CREDITS.md`.

For detailed development guidance, see [`docs/DEVELOPER.md`](docs/DEVELOPER.md).

## License

MIT
