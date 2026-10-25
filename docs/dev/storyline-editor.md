# Story-line Editor — developer and content-designer walkthrough

The **story-line editor** is a local, plain-DOM authoring tool for the
branching story-line mechanic. It loads a game's content CSV through a
**content adapter**, renders the arc as an interactive graph, and lets a
content designer make **guided, validated edits** — rename a card, retarget a
successor, add a card, regroup a story-line — without touching CSV internals.

It is part of the core authoring toolkit
([`src/story-line/content/`](../../src/story-line/content/) and
[`src/story-line/editor/`](../../src/story-line/editor/)) and is **not** a
shipped game feature: it has its own Vite root and config
(`tools/storyline-editor/`, `vite.editor.config.ts`), is excluded from the
production game and Electron builds (asserted by
`tests/story-line/editor/build-exclusion.test.ts`), and adds no runtime
dependency.

See also:

- [Core: Generic Story-Line System](../core-engine/story-line.md) — the runtime
  and authoring seams this tool drives (adapter contract, validator codes,
  manifest shape, author API).
- `tests/story-line/editor/` — the viewer and round-trip browser tests that pin
  everything documented below.

---

## 1. Quick start (Gym content)

From the core repo root:

```bash
npm run storylines:editor
```

This serves the Gym demo content
(`example-games/gym/content/storylines.csv`) on `http://127.0.0.1:5174`. The
page is loopback-only by design. Stop it with `Ctrl-C`.

```bash
npm run storylines:editor -- --help        # all flags and exit codes
```

The command exits `0` when the server is up (and on `--help`), and `1` on a bad
option, an unknown adapter, unreadable content or a host failure.

## 2. What the editor surfaces

Three surfaces share one conservative workflow — **draft, preview, apply,
discard**:

| Surface | Purpose |
|---|---|
| **Viewer** | The manifest-driven graph: one column per story-line group, choice cards as diamonds, plain incidents as rounded rectangles, cycle edges/members highlighted, option labels on every link. Drag to pan, wheel/toolbar to zoom, click a node to inspect its links and metadata. |
| **Card forms** | **Edit card** (the selected node's form) and **Add card** (guided add form). Fields come from the adapter's **field descriptors**, so a game's columns appear as plain fields without core knowing what they mean. |
| **Story-line management** | **Manage story-lines** lists, creates, renames and reassigns groups. A story-line exists through its member cards, so every operation is one validated **batch** edit of those cards' story-line fields. |

Every operation previews a **diff** and runs the **validator** before anything
is written, then writes through the single transactional author API
(`applyContentEditToFile` in `src/story-line/content/author.ts`). The editor
page never writes the content CSV itself; that property is asserted by the
write-path guard (`tests/story-line/editor/write-path-guard.test.ts`).

## 3. Supplying a content adapter

The editor is game-agnostic: it reads a game's content through a
**`ContentAdapter`** — declarative data that maps the game's CSV columns onto
the generic story-line fields. Only `id` and `name` mappings are required.

```ts
// my-game-adapter.ts
import type { ContentAdapter } from '@story-line/content';

export const TAVERN_ADAPTER: ContentAdapter = {
  gameId: 'tavern',
  columns: ['card_key', 'card_name', 'flavour', 'arc', 'arc_name', 'choices', 'payoff'],
  fields: {
    id: 'card_key',
    name: 'card_name',
    effect: 'flavour',
    options: 'choices',
    storylineId: 'arc',
    storylineTitle: 'arc_name',
  },
  editableColumns: ['payoff'],
  newCardDefaults: { flavour: '', choices: '', payoff: '0' },
  // Optional: a human-readable impact label for manifest nodes/diagrams.
  describeImpact: (card) => (card.fields.payoff ? `payoff ${card.fields.payoff}` : ''),
};
```

Notes on the contract (`ContentAdapter` in
[`src/story-line/content/types.ts`](../../src/story-line/content/types.ts)):

- **Required:** `gameId`, `columns` (the CSV's columns in file order) and the
  `fields` mapping with at least `id` and `name`.
- **Optional mappings:** `effect`, `hasChoices`, `acceptNextCardId`,
  `rejectNextCardId`, `options`, `storylineId`, `storylineTitle`. Omit a field
  mapping when the game has no such column — omitting means "no such column",
  never an error.
- **Every column not in `fields`** lands in `ContentCard.fields`, keyed by
  column name. Those game columns are editable/inspectable by default (coin and
  reputation deltas, renown, payoff, …) without core knowing what they mean.
- **`editableColumns`** — an explicit allow-list of extra columns the forms may
  edit; default is every non-mapped column.
- **`newCardDefaults`** — per-column defaults for a newly authored card row.
- **Optional hooks:** `baseId` (strip a chain-instance serial such as
  `evt-x-3` → `evt-x`; identity by default) and `describeImpact` (impact text
  shown on manifest labels/diagrams).

Core ships one adapter (the Gym demo, `GYM_CONTENT_ADAPTER`) as the default.
Tests also exercise a differently shaped adapter, proving the seam is not
shaped around one game.

## 4. Running the editor against your game's content

```bash
npm run storylines:editor -- --content path/to/storylines.csv \
  --adapter ./my-game-adapter.ts
```

- `--content` is the game's content CSV.
- `--adapter` is a **shipped adapter id** (`gym`, the default) or a module
  path/specifier whose default (or `adapter` / `contentAdapter`) export is a
  `ContentAdapter` — the same declarative mapping the CLIs use. Relative
  paths resolve against the core repo root.
- `--port` / `--host` default to `5174` and `127.0.0.1`.

The host builds the deterministic manifest from that CSV + adapter at launch
and serves it from memory (`GET /manifest.json`), so the graph the designer
sees is exactly the manifest the `storylines:graph` CLI would write.

### Artefact paths — what the editor writes

After an **accepted** edit the bridge regenerates the committed Mermaid and
JSON artefacts, then re-reads them to verify (`writeArtefacts` → `checkArtefacts`
in `src/story-line/content/artefacts.ts`). The paths default to the committed
**Gym** artefacts (`DEFAULT_ARTEFACT_PATHS`); the interactive host does not yet
expose a CLI flag to point them elsewhere (a follow-up work item). So:

- For content that lives in the core repo with artefacts at the default paths
  (the Gym demo), the served editor is the complete workflow.
- For a game whose artefacts live elsewhere, keep the served editor
  **read-only for inspection** and drive writes headlessly with `--apply` and an
  explicit `artefactPaths` (below), or regenerate the game's artefacts with its
  own `storylines:graph` (or `storylines:graph-svg`) invocation afterwards and
  let its `--check` drift guard gate the result.

You can pass explicit paths in the headless JSON payload (see §7).

## 5. Edit workflow, step by step

1. **Select a card** in the graph, then open **Edit card** (or **Add card**).
   The form is built from the adapter's field descriptors: core fields first
   (id read-only when editing), then every adapter column.
2. **Change fields.** The change is a *pending draft*; nothing is written.
3. **Preview** — post the derived edit to the bridge; it applies the edit **in
   memory**, validates it and diffs the affected rows (column by column,
   before → after). The preview panel renders the diff **and** the validator's
   report (the same text/JSON the `storylines:validate` CLI renders).
4. **Apply** — previews again first (an apply can never happen without a fresh,
   valid preview), then writes the content CSV atomically through the author
   API and regenerates the artefacts.
5. **Discard** — drops the draft; the content file is untouched.

An invalid edit is **refused**: the panel shows the validation errors
(attributed to the offending field, marked inline), nothing is written, and the
draft stays pending so the author fixes exactly that field.

### Adding a card and linking it into a story-line

The **Add card** form guides both decisions:

- **Story-line** — pick an existing group (which fills the id/title fields) or
  author a new one.
- **Incoming link** — optionally choose the existing card that leads to the new
  card. This makes the form emit a single transactional `add-linked-card` edit:
  the card is appended **and** the predecessor gains an option pointing at it,
  validated once and written once.

A new card that nothing links to in a story-line is refused by the validator
(`unreachable-card`) — the guided form makes the missing-link case obvious
before the write.

## 6. Story-line management

A story-line has no declaration file of its own: it exists through the cards
that declare its `storylineId`/`storylineTitle`. **Manage story-lines** lists
every group the generated manifest reports, plus any group created in the
session, and drives:

- **Create** — register a new id/title group. With member cards selected the
  grouping is written immediately as one validated batch; without members it
  stays in-session (**pending**, dashed outline) until cards are moved into it —
  there is nothing to write yet.
- **Rename** — retitle (and optionally re-id) a group by applying the new
  story-line fields to every member card in one batch.
- **Reassign** — move selected member cards into another group.

Every operation is one `set-storyline-batch` edit: combined members validated
**once** and written **once** — renaming a four-member group is a single
author-API call, never one write per member.

## 7. Headless edits (`--apply`)

Scripted or CI edits use the same write bridge without a dev server:

```bash
npm run storylines:editor -- --content path/to/storylines.csv \
  --adapter ./my-game-adapter.ts \
  --apply '{"edit":{"kind":"update-card","spec":{"id":"evt-tax","name":"Tax Audit · revised"}}}'
```

The payload is `{ "edit": { "kind", "spec" }, "expectedChecksum"?, "dryRun"?,
"artefactPaths"? }`. Edit kinds: `add-card`, `add-linked-card`, `update-card`,
`set-storyline`, `set-storyline-batch`. `--dry-run` previews and validates
without writing; `--apply @file.json` reads the payload from a file. The command
prints the JSON result and exits `0` on success and `1` on a refused edit
(invalid or **stale** content — see below).

A game's own committed artefacts are passed explicitly:

```bash
npm run storylines:editor -- --content path/to/storylines.csv \
  --adapter ./my-game-adapter.ts \
  --apply '{"edit":{"kind":"update-card","spec":{"id":"evt-x","name":"X"}},
            "artefactPaths":{"json":"docs/dev/assets/storyline-manifest.json",
                             "mermaid":"docs/dev/assets/storyline-graph.mmd"}}'
```

After any write, run the game's artefact drift guards to confirm nothing is out
of step (`npm run storylines:graph -- --format json --check`, Mermaid
`--check`, and any game-side generated-doc `--check`).

## 8. Concurrency guard and manual documentation

- **Stale content is never clobbered.** The session captures the content
  checksum at load; the writer compares its own read against that token and
  refuses (HTTP 409, `stale-content`) when the CSV changed on disk since the
  page loaded, returning a reload instruction instead of overwriting a
  concurrent edit.
- **Manual documentation is reported, not rewritten.** Generated artefacts
  (manifest/Mermaid) are regenerated automatically, but hand-written
  documentation is not machine-generated. An edit touching a row that a
  documented section describes by hand returns an explicit **"manual
  documentation update required"** result naming the check that now fails. The
  registry is `src/story-line/editor/manual-docs.ts`; the shipped entry is the
  Gym demo's hand-maintained card catalogue.

After an accepted edit the artefacts are regenerated and **verified** (the
post-write drift check re-reads them), so a "regenerated" claim is never
assumed.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `unknown --adapter "…"` | Use a shipped id (`gym`) or a module path/specifier whose default/`adapter`/`contentAdapter` export is a `ContentAdapter`. Check the export name. |
| `cannot read <path>` | `--content` did not resolve; paths are relative to the core repo root. |
| The page loads but forms are disabled / a "no editable content" note | The host middleware is absent (e.g. Vite was run directly on `vite.editor.config.ts` without the editor host). Launch via `npm run storylines:editor`. |
| Apply is refused with `stale-content` | The CSV changed on disk since load (maybe a branch switch or an external edit). Reload the page and retry. |
| An edit is refused with a validator error | Read the report (and the inline-attributed field). Typical causes: `unknown-successor`, `unreachable-card`, malformed `options` encoding, `missing-storyline-id` on a new choice card. |
| Port already in use | `npm run storylines:editor -- --port 5180`. |
| The server won't bind | The host is loopback by default; `--host 0.0.0.0` is allowed but the tool is designed for local authoring. |

## 10. Testing

The editor's renderers are plain-DOM modules, so the core `browser` project
drives them **directly** in Vitest's real Chromium document — no second dev
server, page boot or game loop. See the "Testing" section of
[Core: Generic Story-Line System](../core-engine/story-line.md) for the full
list (`tests/story-line/editor/`): view-model fidelity against the manifest,
bridge/host/CLI behaviour, concurrency, preview-validate refusals, edit
round-trips, story-line batch writes, build exclusion and the manifest schema
guard.
