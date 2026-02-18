Follow the global AGENTS.md in addition to the rules below. The local rules below take priority in the event of a conflict.

## Project Overview

You are a producer for a Game Engine designed to support building single-player Tableau Card Games. Your primary goal is to create a fully modular and reusable engine. You achieve this through building increasingly complex card games and extracting reusable components from each.

This project follows a **spike-driven development** approach: example games are built first to validate gameplay mechanics and engine APIs, then reusable components are extracted and refined into the shared engine modules. The project is organized as a **flat monorepo** with a single `package.json` at the root.

## Components

- **Core Engine** (`src/core-engine/`): The foundational framework that provides essential functionalities such as game loop management, state management, and rendering helpers.
- **Card System** (`src/card-system/`): A flexible system for defining and managing cards, including their attributes, effects, and interactions. Includes abstractions for Card, Deck, Hand, and Pile.
- **Rule Engine** (`src/rule-engine/`): A component that allows for the creation and enforcement of game rules, enabling complex gameplay mechanics, turn logic, and validation.
- **User Interface** (`src/ui/`): A modular UI system with reusable components (buttons, menus, overlays) that can be customized and extended to fit different card game themes and styles.
- **Example Games** (`example-games/`): A collection of sample card games built using the engine, demonstrating its capabilities and serving as templates for future game development. Each example game has its own entry point, scenes, and tests.

## Directory Structure

```
cardGameSpikes/
├── src/
│   ├── core-engine/       # Game loop, state management, rendering helpers
│   │   └── index.ts       # Barrel file / public API
│   ├── card-system/       # Card, Deck, Hand, Pile abstractions
│   │   └── index.ts
│   ├── rule-engine/       # Rule definitions, validation, turn logic
│   │   └── index.ts
│   └── ui/                # Reusable UI components
│       └── index.ts
├── example-games/
│   └── hello-world/       # Minimal Phaser scene (toolchain proof)
│       ├── scenes/
│       │   └── HelloWorldScene.ts
│       └── main.ts
├── public/                # Static assets (images, fonts, etc.)
│   └── assets/
│       ├── cards/         # Card sprite assets (CC0/permissive)
│       └── CREDITS.md     # Asset attribution
├── tests/                 # Vitest test files
│   └── smoke.test.ts
├── dist/                  # Production build output (gitignored)
├── AGENTS.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html             # Single entry point for Vite
└── .gitignore
```

## Development Workflow

When building a new example game, focus first on making it playable, reusing as many components as possible, and then iteratively refactor and extract reusable components as needed. Always ensure that new components are designed with modularity and reusability in mind, adhering to the principles of clean code and software design.

### Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server with hot-reload (port 3000)
npm test             # Run Vitest test suite
npm run build        # TypeScript check + production build to dist/
npm run preview      # Serve production build locally
```

### Quality Gates

Before pushing any change to the git origin you must have ensured that:

1. `npm test` passes -- all tests across the core engine AND example games must pass.
2. `npm run build` succeeds -- TypeScript compilation and Vite production build must complete without errors.

Each example game should have its own set of tests to ensure that the game mechanics work as expected and to prevent regressions as the engine evolves. Additionally, the core engine should have comprehensive tests covering all critical functionalities.

### Example Games

Each example game is a standalone game that can independently demonstrate the capabilities of the engine. They also serve as reference implementations for how to use the engine's features and components effectively.

Example games live in `example-games/<game-name>/` with their own `main.ts` entry point and `scenes/` directory. The root `index.html` currently points to the hello-world example; multi-game routing will be added as more games are implemented.

## Technology Stack

- **Phaser 3.x** (currently 3.90.0): The current stable release of the Phaser HTML5 game framework. Provides a solid foundation for building 2D games, including card games, with WebGL/Canvas rendering, input handling, tweens, and scene management.
- **TypeScript** (strict mode, ES2020 target): A statically typed superset of JavaScript that enhances code quality and maintainability, making it easier to manage complex codebases and catch errors early in the development process.
- **Vite**: A fast build tool and dev server with native ESM support, hot module replacement (HMR), and optimized production builds. Replaces Webpack for faster development iteration.
- **Vitest**: A Vite-native testing framework with a Jest-compatible API. Integrates seamlessly with the Vite build pipeline and avoids ESM/CJS compatibility issues.

### Path Aliases

The project defines path aliases for engine modules in both `tsconfig.json` and `vite.config.ts`:

- `@core-engine/*` -> `src/core-engine/*`
- `@card-system/*` -> `src/card-system/*`
- `@rule-engine/*` -> `src/rule-engine/*`
- `@ui/*` -> `src/ui/*`

## Licensing

All assets and code used in this project must be open and freely available for commercial use. Licenses must be permissive (MIT, Apache 2.0, CC0, or similar). Asset attribution is documented in `public/assets/CREDITS.md`.

<!-- Start base Worklog AGENTS.md file -->

## work-item Tracking with Worklog (wl)

IMPORTANT: This project uses Worklog (wl) for ALL work-item tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

## CRITICAL RULES

- Use Worklog (wl), described below, for ALL task tracking, do NOT use markdown TODOs, task lists, or other tracking methods
- When mentioning a work item always use its title followed by its ID in parentheses, e.g. "Fix login bug (WL-1234)"
- Always keep work items up to date with accurate status, priority, stage, and assignee
- Whenever you are provided with, or discover, a new work item create it in wl immediately
- Whenever you are provided with or discover important context (specifications, designs, user-stories) ensure the information is added to the description of the relevant work item(s) OR create a new work item if none exist
- Whenever you create a planning document (PRD, spec, design doc) add references to the document in the description of any work item that is directly related to the document
- Work items cannot be closed until all child items are closed, all blocking dependencies resolved and a Producer has reviewed and approved the work
- Never commit changes without associating them with a work item
- Never commit changes without ensuring all tests and quality checks pass
- Whenever a commit is made add a comment to impacted the work item(s) describing the changes, the files affected, and including the commit hash.
- If push fails, resolve and retry until it succeeds
- When using backticks in arguments to shell commands, escape them properly to avoid errors

### Important Rules

- Use wl as a primary source of truth, only the source code is more authoritative
- Always use `--json` flag for programmatic use
- When new work items are discovered or prompted while working on an existing item create a new work item with `wl create`
  - If the item must be completed before the current work item can be completed add it as a child of the current item (`wl create --parent <current-work-item-id>`)
  - If the item is related to the current work item but not blocking its completion add a reference to the current item in the description (`discovered-from:<current-work-item-id>`)
- Check `wl next` before asking "what should I work on?" and always offer the response as a next steps suggestion, with an explanation
- Run `wl --help` and `wl <cmd> --help` to learn about the capabilities of WorkLog (wl) and discover available flags
- Use work items to track all significant work, including bugs, features, tasks, epics, chores
- Use clear, concise titles and detailed descriptions for all work items
- Use parent/child relationships to track dependencies and subtasks
- Use priorities to indicate the importance of work items
- Use stages to track workflow progress
- Do NOT clutter repo root with planning documents

### work-item Types

Track work-item types with `--issue-type`:

- bug - Something broken
- feature - New functionality
- task - Work item (tests, docs, refactoring)
- epic - Large feature with subtasks
- chore - Maintenance (dependencies, tooling)

### Work Item Descriptions

- Use clear, concise titles summarizing the work item.
- Do not escape special characters
- The description must provide sufficient context for understanding and implementing the work item.
- At a minimum include:
  - A summary of the problem or feature.
  - Example User Stories if applicable.
  - Expected behaviour and outcomes.
  - Steps to reproduce (for bugs).
  - Suggested implementation approach if relevant.
  - Links to related work items or documentation.
  - Measurable and testable acceptance criteria.

### Priorities

Worklog uses named priorities:

- critical - Security, data loss, broken builds
- high - Major features, important bugs
- medium - Default, nice-to-have
- low - Polish, optimization

### Dependencies

Use parent/child relationships to track blocking dependencies.

- Child items must be completed before the parent can be closed.
- If a work item blocks another, make it a child of the blocked item.
- If a work item blocks multiple items, create the parent/child relationships with the highest priority item as the parent unless one of the items is in-progress, in which case that item should be the parent.
  - If in doubt raise for product manager review.

Other types of dependencies can be tracked in descriptions, for example `discovered-from:<work-item-id>`, `related-to:<work-item-id>`, `blocked-by:<work-item-id>`.

Worklog does not enforce these relationships but they can be used for planning and tracking.

### Workflow management

- Use the `--stage` flag to track workflow stages according to your particular process,
  - e.g. `idea`, `prd_complete`, `milestones_defined`, `plan_complete`, `in_progress``done`.
- Use the `--assignee` flag to assign work items to agents.
- Use the `--tags` flag to add arbitrary tags for filtering and organization. Though avoid over-tagging.
- Use comments to document progress, decisions, and context.
- Use `risk` and `effort` fields to track complexity and potential issues.
  - If available use the `effort_and_risk` agent skill to estimate these values.

1. Check ready work: `wl next`
2. Claim your task: `wl update <id> --status in-progress`
3. Work on it: implement, test, document
4. Discover new work? Create a linked issue:

- `wl create "Found bug" --priority high --tags "discovered-from:<parent-id>"`

5. Complete: `wl close <id> --reason "PR #123 merged"`
6. Sync: run `wl sync` before ending the session

### Work-Item Management

```bash
# Create work items
wl create --help  # Show help for creating work items
wl create --title "Bug title" --description "<details>" --priority high --issue-type bug --json
wl create --title "Feature title" --description "<details>" --priority medium --issue-type feature --json
wl create --title "Epic title" --description "<details>" --priority high --issue-type epic --json
wl create --title "Subtask" --parent <parent-id> --priority medium --json
wl create --title "Found bug" --priority high --tags "discovered-from:WL-123" --json

# Update work items
wl update --help  # Show help for updating work items
wl update <work-item-id> --status in-progress --json
wl update <work-item-id> --priority high --json

# Comments
wl comment --help  # Show help for comment commands
wl comment list <work-item-id> --json
wl comment show <work-item-id>-C1 --json
wl comment update <work-item-id>-C1 --comment "Revised" --json
wl comment delete <work-item-id>-C1 --json

# Close or delete
# wl close: provide -r reason for closing; can close multiple ids
wl close <work-item-id> --reason "PR #123 merged" --json
wl close <work-item-id-1> <work-item-id-2> --json

# *Destructive command ask for confirmation before running* Dekete a work item permanently
wl delete <work-item-id> --json
```

### Project Status

```bash
# Show the next ready work items (JSON output)
# Display a recommendation for the next item to work on in JSON
wl next --json
# Display a recommendation for the next item assigned to `agent-name` to work on
wl next --assignee "agent-name" --json
# Display a recommendation for the next item to work on that matches a keyword (in title/description/comments)
wl next --search "keyword" --json

# Show all items with status `in-progress` in JSON
wl in-progress --json
# Show in-progress items assigned to `agent-name`
wl in-progress --assignee "agent-name" --json

# Show recently created or updated work items
wl recent --json
# Show the 10 most recently created or updated items
wl recent --number 10 --json
# Include child/subtask items when showing recent items
wl recent --children --json

# List all work items except those in a completed state
wl list --json
# Limit list output
wl list -n 5 --json
# List items filtered by status (open, in-progress, closed, etc.)
wl list --status open --json
# List items filtered by priority (critical, high, medium, low)
wl list --priority high --json
# List items filtered by comma-separated tags
wl list --tags "frontend,bug" --json
# List items filtered by assignee (short or full name)
wl list --assignee alice --json
# List items filtered by stage (e.g. triage, review, done)
wl list --stage review --json

# Show details for a specific work item
wl show <work-item-id> --comments --json
# Show details including child/subtask items
wl show <work-item-id> --children --json
```

#### Team

```bash
 # Sync local worklog data with the remote (shares changes)
 wl sync
 # Import issues from GitHub into the worklog (GitHub -> worklog)
 wl github import
 # Push worklog changes to GitHub issues (worklog -> GitHub)
 wl github push
```

#### Plugins

Depending on your setup, you may have additional wl plugins installed. Check available plugins with `wl --help` (See plugins section) to view more information about the features provided by each plugin run `wl <plugin-command> --help`

#### Help

Run `wl --help` to see general help text and available commands.
Run `wl <command> --help` to see help text and all available flags for any command.

<!-- End base Worklog AGENTS.md file -->
