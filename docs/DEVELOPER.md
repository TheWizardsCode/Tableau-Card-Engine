# Developer Guide

This document covers everything you need to develop, test, and build the Tableau Card Engine (TCE) project. For a high-level overview, see the [README](../README.md).

## Table of Contents

- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Building for Production](#building-for-production)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Path Aliases](#path-aliases)
- [Adding an Example Game](#adding-an-example-game)
- [Managing Assets](#managing-assets)
- [Keeping Docs Up to Date](#keeping-docs-up-to-date)
- [Work-Item Tracking](#work-item-tracking)
- [Troubleshooting](#troubleshooting)

---

## Environment Setup

**Prerequisites:**

- Node.js 18+ (LTS recommended)
- npm 9+ (ships with Node.js 18+)
- Git

**Install dependencies:**

```bash
npm install
```

This installs Phaser 3.x as a runtime dependency and TypeScript, Vite, and Vitest as dev dependencies.

## Running Locally

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:3000` with hot module replacement (HMR). The root `index.html` currently loads the hello-world example game.

## Building for Production

```bash
npm run build
```

This runs two steps:
1. `tsc --noEmit` -- TypeScript type-checking (strict mode, no output files)
2. `vite build` -- production bundle to `dist/`

To preview the production build locally:

```bash
npm run preview
```

**Note:** The Phaser library produces a ~1.4 MB chunk. This is expected and can be addressed with code-splitting when needed.

## Testing

```bash
npm test            # run all tests once
```

Tests use [Vitest](https://vitest.dev/) configured inline in `vite.config.ts`. Test files live under `tests/` and follow the pattern `*.test.ts`.

**Writing tests:**

- Place test files in `tests/` (engine-level) or alongside example game code
- Import from `vitest` directly: `import { describe, it, expect } from 'vitest'`
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports in test files

## Project Structure

```
src/
├── core-engine/index.ts    Game loop, state management, rendering helpers
├── card-system/index.ts    Card, Deck, Hand, Pile abstractions
├── rule-engine/index.ts    Rule definitions, validation, turn logic
└── ui/index.ts             Reusable UI components (buttons, menus, overlays)

example-games/
└── hello-world/
    ├── main.ts                 Game entry point (Phaser.Game config)
    └── scenes/
        └── HelloWorldScene.ts  Phaser.Scene subclass

public/assets/
├── cards/                  Card sprite assets (SVG, CC0)
└── CREDITS.md              Asset attribution

tests/
└── smoke.test.ts           Toolchain smoke test
```

Each `src/` module has a barrel file (`index.ts`) that serves as its public API. Import engine modules using path aliases (see below).

## Path Aliases

The project defines path aliases in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@core-engine/*` | `src/core-engine/*` |
| `@card-system/*` | `src/card-system/*` |
| `@rule-engine/*` | `src/rule-engine/*` |
| `@ui/*` | `src/ui/*` |

Usage in code:

```typescript
import { ENGINE_VERSION } from '@core-engine/index';
```

## Adding an Example Game

1. Create a directory: `example-games/<game-name>/`
2. Add an entry point: `example-games/<game-name>/main.ts`
3. Add scenes: `example-games/<game-name>/scenes/<SceneName>.ts` (extend `Phaser.Scene`)
4. Place assets in `public/assets/<game-name>/` and document attribution in `public/assets/CREDITS.md`
5. Add game-specific tests under `tests/` or alongside the game code
6. Update `index.html` or implement multi-game routing as needed

Follow the `hello-world` example as a reference implementation.

## Managing Assets

- All assets go in `public/assets/` and are served by Vite at the `/assets/` URL path
- Assets must be **CC0, MIT, Apache 2.0, or similarly permissive** -- no restrictive licenses
- Document every asset source and license in `public/assets/CREDITS.md`
- Prefer SVG for card art (resolution-independent, small file size)

## Keeping Docs Up to Date

**Policy:** Any change that alters developer workflows must include a documentation update. Specifically:

- Changes to npm scripts, dependencies, or `package.json` structure
- Changes to `tsconfig.json`, `vite.config.ts`, or build configuration
- Changes to directory structure or path aliases
- New tooling, CI/CD, or developer-facing infrastructure

**How to comply:**

1. Update this file (`docs/DEVELOPER.md`) and the relevant section of `AGENTS.md` in the same commit or PR
2. If the doc update cannot be done in the same commit, create a child work item in Worklog:
   ```bash
   wl create --title "Update docs for <change>" --parent <parent-id> --priority medium --issue-type task --json
   ```
3. The parent work item cannot be closed until the doc-update child is also closed

## Work-Item Tracking

This project uses **Worklog (wl)** for all task tracking. Key commands:

```bash
wl next --json                    # what should I work on?
wl create --title "..." --json    # create a work item
wl update <id> --status in_progress --json  # claim a task
wl close <id> --reason "..." --json         # close when done
wl sync                           # sync with remote
```

See the Worklog section in `AGENTS.md` for full documentation.

## Troubleshooting

**Vite dev server won't start:**
- Check port 3000 is not already in use: `lsof -i :3000`
- Try `npm run dev -- --port 3001` for an alternate port

**TypeScript errors on build:**
- Run `npx tsc --noEmit` to see detailed errors
- Check that path aliases match between `tsconfig.json` and `vite.config.ts`

**Tests fail to find modules:**
- Ensure Vitest config in `vite.config.ts` includes the `test` block
- Verify the test file pattern matches `tests/**/*.test.ts`

**Large bundle warning:**
- The Phaser library is ~1.4 MB minified -- this is expected
- Code-splitting can be added later via `build.rollupOptions.output.manualChunks` in `vite.config.ts`
