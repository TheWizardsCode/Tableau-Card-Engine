/**
 * Generic story-line types and adapter interfaces.
 *
 * This module is the game-agnostic core of the branching story-line mechanic:
 * a drawn card presents an ordered set of options, and the player's choice
 * determines the next card until the chain ends.
 *
 * Coupling to a concrete game is inverted through two interfaces:
 *
 * - {@link StorylineEngineAdapter} — state access (seeded `rng()` draw, effect
 *   application, activity-log append, chain-card sink).
 * - {@link StorylineUiAdapter} — presentation (names, dialog labels,
 *   story-update lines, journal formatting).
 *
 * Core owns the compilation, resolution and pure-helper semantics; games plug
 * their own state and presentation in without core importing any game types.
 * Nothing here depends on Phaser.
 *
 * The resource *name set* is game-declared data (see
 * [`./resources.ts`](./resources.ts)): a game advertises the keys it uses and
 * `coins` / `reputation` remain the default projection.
 *
 * @module
 */

import type { EpisodeManifest, SceneOutcome } from './content/episode-manifest';
import type {
  StorylineResourceKey,
  StorylineResources,
  StorylineResourcesDelta,
} from './resources';

/**
 * The minimal card shape the story-line system operates on. A game's own card
 * type must be structurally assignable to this interface.
 *
 * All fields other than `id` / `name` are optional so a game card can carry
 * extra data without core caring about it.
 */
export interface StorylineCard {
  /** Stable card template id (e.g. `evt-tax-error`). */
  readonly id: string;
  /** Human-readable card name. */
  readonly name: string;
  /** Human-readable effect description used by the default UI labels. */
  readonly effect?: string;
  /** Coin delta applied when the card's effect resolves. */
  readonly coinDelta?: number;
  /** Reputation delta applied when the card's effect resolves. */
  readonly reputationDelta?: number;
  /**
   * Raw CSV options encoding for an arbitrary multi-outcome choice node.
   *
   * Format: `label|cardA,cardB;label2|cardC`, optionally followed by the
   * extended declarative attributes `#cost=key:number,…`,
   * `#extra=key:number,…`, `#when=field<op>number>successor` (repeat
   * `#when` for an ordered rule list) and `#says=<escaped prose>`. The
   * attributes are the content-side authoring path for
   * {@link StorylineOption.cost}, {@link StorylineOption.extraEffect},
   * {@link StorylineOption.conditionalSuccessors} and
   * {@link StorylineOption.says}; `cost` / `extra` keys must be declared by
   * the game's resource set. Parsed by
   * {@link parseStorylineOptionsEncoding}; the documented grammar, worked
   * example and diagnostics are in `docs/core-engine/story-line.md`
   * ("Authoring options in CSV").
   */
  readonly options?: string;
  /** Optional story-arc identifier; `null`/absent means "no storyline". */
  readonly storylineId?: string | null;
  /** Optional human-readable story-arc title (defaults to the id). */
  readonly storylineTitle?: string | null;
}

/** A single activity-log entry the journal reads. */
export interface StorylineLogEntry {
  /** Turn the entry was written on. */
  readonly turn: number;
  /** The log line text. */
  readonly text: string;
}

/** A single journal row: a past story-line choice outcome. */
export interface StorylineJournalEntry {
  /** Turn the choice resolved on. */
  readonly turn: number;
  /** Story-line display name. */
  readonly storyline: string;
  /**
   * The outcome summary (text after the story-line name), cut to one
   * display-safe line by {@link truncateOutcome}.
   *
   * Only the **display** copy is shortened: the untruncated outcome stays in
   * {@link outcomeFull} and the original log line in {@link text}, so a
   * transcript artefact never loses prose the journal had to ellipsise.
   */
  readonly outcome: string;
  /**
   * The outcome summary before display truncation.
   *
   * Equals {@link outcome} whenever no truncation was needed. Optional so a
   * hand-built entry (and every pre-existing consumer) keeps compiling.
   */
  readonly outcomeFull?: string;
  /** The original log line. */
  readonly text: string;
}

/**
 * Declarative affordability cost for a story-line option.
 *
 * Keyed by the game's **declared resource keys** (see
 * `StorylineEngineAdapter.resources`). Every specified key is a required
 * payment: an option is only affordable when the player has at least that
 * many of *each* named resource. An unspecified key is unconstrained (it is
 * never defaulted to zero), and a key outside the declared set reads as `0`
 * and is never paid. The default projection is `coins` / `reputation`, so
 * `cost: { coins: 100 }` keeps its shipped meaning.
 */
export type OptionCost = StorylineResourcesDelta;

/**
 * Declarative resource delta applied when a story-line option resolves.
 *
 * Keyed by the game's declared resource keys, each a signed delta (`-5`
 * deducts, `5` grants). An unspecified key leaves that resource unchanged,
 * and a key outside the declared set is never applied (no resource is
 * invented).
 *
 * Authoring rule: extra effects are **gains**, so a negative delta is
 * rejected per declared key by {@link validateStorylineOptions}
 * (`negative-extra-effect`). Resolution itself stays permissive and applies
 * whatever is declared.
 */
export type OptionExtraEffect = StorylineResourcesDelta;

/**
 * A single declarative threshold condition on one resource.
 *
 * Conditions are pure data (field / operator / numeric value) so they can be
 * authored, serialised and validated without executable callbacks.
 */
export interface Condition {
  /**
   * The declared resource the condition tests. A key the player's state does
   * not carry reads as `0`; a key outside the declared set is an authoring
   * error (`unknown-condition-field`) and also reads as `0` at runtime.
   */
  readonly field: StorylineResourceKey;
  /** Comparison applied between the current resource and {@link value}. */
  readonly op: '>=' | '<=' | '>' | '<' | '==';
  /** Numeric threshold the current resource is compared against. */
  readonly value: number;
}

/**
 * One ordered declarative successor rule.
 *
 * When {@link when} matches the current resources, {@link successorId} is the
 * pushed successor card id; `null` ends the chain.
 */
export interface ConditionalSuccessorRule {
  /** Condition evaluated against the current resources at resolution time. */
  readonly when: Condition;
  /** Successor card id to push when the rule matches; `null` ends the chain. */
  readonly successorId: string | null;
}

/**
 * A single option within a story-line's ordered option list.
 *
 * The engine resolves options in declaration order; the player selects one.
 * Generic over the game state type passed to the runtime callbacks.
 */
export interface StorylineOption<TState = unknown> {
  /** Human-readable label (e.g. "Accept", "Reject", "Investigate"). */
  readonly label: string;
  /**
   * The single card id to push when this option is chosen. Null / absent
   * ends the chain. Retained for the programmatic registry seam;
   * CSV-authored options use {@link successorIds}.
   */
  readonly successorId?: string | null | undefined;
  /**
   * Ordered candidate successor card ids. At resolution time exactly one
   * candidate is selected with a single seeded `rng()` draw. An empty list
   * is a terminal option — the chain ends and no draw is consumed.
   *
   * Only consulted when neither {@link successorResolver} nor a matching
   * {@link conditionalSuccessors} rule determines the successor (see
   * {@link conditionalSuccessors} for the full precedence contract).
   */
  readonly successorIds?: readonly string[];
  /** Whether the event's intrinsic effect applies when this option is chosen. */
  readonly effectPolicy: 'apply' | 'skip';
  /**
   * Optional runtime condition evaluated at draw time. When it returns
   * `false` the option is omitted from the presented list. Evaluated once,
   * when the option list is compiled at draw time.
   *
   * Contract: must be a pure function — no observable side effects.
   */
  readonly condition?: (state: TState) => boolean;
  /**
   * Optional runtime successor resolver evaluated at resolution time. When
   * present, its return value is used as the pushed successor card id
   * instead of {@link conditionalSuccessors} / {@link successorIds} /
   * {@link successorId}. Returns `null`/`undefined` to end the chain.
   * Consumes no RNG.
   *
   * Contract: must be a pure function — no observable side effects.
   */
  readonly successorResolver?: (state: TState) => string | null | undefined;
  /**
   * Optional declarative affordability cost.
   *
   * Declared contract (applied by the draw-time filtering and resolution
   * helpers): an option is presented only when every specified cost component
   * is affordable, and selecting it deducts the cost from the game state via
   * the engine adapter's resource-mutation seam. Cost is **independent of
   * {@link effectPolicy}** — it is a real payment made in addition to the
   * card's intrinsic effect (which {@link effectPolicy} governs separately).
   */
  readonly cost?: OptionCost;
  /**
   * Optional declarative resource delta applied when the option resolves.
   *
   * Declared contract: applied after any {@link cost} deduction and
   * **independently of {@link effectPolicy}** (it applies for both `'apply'`
   * and `'skip'`). Its deltas are reported in the resolution's `coinChange` /
   * `repChange`.
   */
  readonly extraEffect?: OptionExtraEffect;
  /**
   * Ordered declarative successor rules evaluated at resolution time against
   * the current resources. The first rule whose {@link Condition} matches
   * determines the pushed successor card id (`null` ends the chain). A
   * matching rule consumes no RNG draw.
   *
   * Successor precedence (documented contract):
   * 1. {@link successorResolver} callback, when present;
   * 2. the first matching {@link conditionalSuccessors} rule;
   * 3. {@link successorIds} — a single seeded random draw;
   * 4. {@link successorId} — the lowest-precedence single successor.
   */
  readonly conditionalSuccessors?: readonly ConditionalSuccessorRule[];
  /**
   * Optional authored outcome prose: what taking this option *does*, in the
   * writer's own words.
   *
   * Authored from CSV as `#says=<escaped prose>`
   * ({@link parseStorylineOptionsEncoding}); it is carried verbatim into the
   * compiled option so a presenter can show the consequence instead of a
   * paraphrase of the label. Prose stays attached to its own option, so
   * reordering the option list never moves text between choices.
   *
   * A `says` value is a **single** prose segment: `;` and `#` are reserved and
   * must be escaped as `\;` / `\#` (`\\` for a literal backslash). Absent when
   * the content authors no prose.
   */
  readonly says?: string;
}

/** A card's compiled story-line option list. */
export interface CompiledStoryline<TState = unknown> {
  /** The story-line identifier this definition belongs to, or null. */
  readonly storylineId: string | null;
  /** Ordered options; empty for non-choice cards. */
  readonly compiledOptions: StorylineOption<TState>[];
}

/** Pending-choice state, created when a choice card is drawn. */
export interface PendingStorylineChoice<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
> {
  /** The choice event drawn from the deck (effect deferred). */
  readonly event: TCard;
  /** The chosen option's label token once made; null while pending. */
  chosenOption: string | null;
  /** False while the dialog is pending; true after the choice is applied. */
  resolved: boolean;
  /**
   * Draw-time snapshot of the compiled option list. When present, resolution
   * reads this frozen list (condition callbacks are never re-evaluated).
   *
   * The snapshot is **cost-filtered** as well: an option whose declarative
   * `cost` exceeded the player's resources for the declared keys at draw time
   * is absent from this list (registered options are filtered by
   * compilation; CSV-authored options are gated by the presenting layer with
   * `isOptionAffordable`). Consumers (e.g. AI scoring) must read this snapshot
   * — it is the presented list, computed once at draw time and stable
   * thereafter.
   */
  options?: readonly StorylineOption<TState>[];
}

/** Result of resolving a story-line option. */
export interface StorylineResolution<TCard extends StorylineCard = StorylineCard> {
  /** The card pushed as a consequence, or null if the chain ends. */
  readonly pushedCard: TCard | null;
  /** The coin change from applying the effect (0 for skip). */
  readonly coinChange: number;
  /** The reputation change from applying the effect (0 for skip). */
  readonly repChange: number;
  /**
   * The chosen option's authored outcome prose ({@link StorylineOption.says}),
   * verbatim, or `null` when the option authors none.
   *
   * This is what the choice *caused*, in the writer's words — presentation
   * (the story-update log line, the journal, the scene) reads it here instead
   * of paraphrasing the option label. Absent prose keeps today's wording
   * exactly.
   */
  readonly outcomeProse?: string | null;
}

/**
 * State-access adapter a game supplies so the generic system can operate on
 * its state without importing game types.
 */
export interface StorylineEngineAdapter<TState, TCard extends StorylineCard> {
  /** Return the seeded random number in `[0, 1)` for this draw. */
  rng(state: TState): number;
  /** Apply the card's intrinsic effect to the game state. */
  applyEffect(state: TState, card: TCard): void;
  /**
   * Optional resource-mutation seam: apply a signed resource delta to the
   * game state.
   *
   * Core uses this to deduct an option's declarative `cost` and to apply its
   * `extraEffect` without importing game types. Core only ever names keys from
   * the adapter's declared resource set
   * (the default projection when it declares none), so a delta can never
   * invent a resource; each named key is a signed delta (`-5` deducts, `5`
   * grants) and an absent key leaves that resource unchanged.
   *
   * Optional for backwards compatibility: an adapter that predates the seam
   * (or deliberately does not expose resources for mutation) omits it. In
   * that case core leaves the state untouched and appends a warning line to
   * the activity log whenever a cost or extra effect needs applying.
   */
  applyResourceDelta?(state: TState, delta: StorylineResourcesDelta): void;
  /**
   * Current resource values for the state, keyed by declared resource key.
   *
   * A declared key the state does not currently carry may be omitted (it
   * reads as `0`). The shipped `coins` / `reputation` pair is the default
   * projection.
   */
  getResources(state: TState): StorylineResources;
  /** Append a line to the game's activity log. */
  appendLog(state: TState, text: string, kind?: string): void;
  /** Read the game's activity log (append-only, oldest first). */
  getActivityLog(state: TState): readonly StorylineLogEntry[];
  /** Look up a card template id, or null when it does not exist. */
  getTemplate(id: string): TCard | null;
  /** Strip an instance serial suffix from a card id (`evt-x-3` → `evt-x`). */
  getBaseTypeId(id: string): string;
  /**
   * Every card currently in a location that chain serial naming scans
   * (e.g. incident deck, event deck, event discard) — the sink for
   * deterministic `${base}-${maxSerial+1}` naming.
   */
  getChainScanCards(state: TState): readonly TCard[];
  /** Push a newly created chain card onto the game's active deck. */
  pushChainCard(state: TState, card: TCard): void;
  /**
   * The resource keys this game declares.
   *
   * Optional: omit it (or leave it empty) and the engine uses the default
   * `coins` / `reputation` projection (`DEFAULT_RESOURCE_KEYS`), so an
   * adapter written before resource declaration existed is unchanged. A
   * declared set is threaded through draw-time affordability, cost payment,
   * extra effects, condition evaluation and validation — keys outside it are
   * never read, paid or applied.
   */
  readonly resources?: readonly StorylineResourceKey[];
}

/**
 * Presentation adapter. Core ships a default implementation
 * ({@link createDefaultStorylineUiAdapter}); a game overrides any subset to
 * change wording without touching core logic.
 */
export interface StorylineUiAdapter<
  TCard extends StorylineCard = StorylineCard,
> {
  /** Human-readable story-line name: explicit title, else the id, else null. */
  storylineName(card: TCard): string | null;
  /** Dialog title for a pending choice. */
  choiceDialogTitle(card: TCard): string;
  /** Dialog subtitle (the specific incident within the story-line). */
  choiceDialogSubtitle(card: TCard): string;
  /**
   * The narrative "story update" line emitted when a choice resolves.
   *
   * `outcomeProse` is the chosen option's authored prose
   * ({@link StorylineOption.says}, surfaced on
   * {@link StorylineResolution.outcomeProse}). When it is present the line
   * carries that prose **verbatim** as its outcome; when it is absent the
   * implementation keeps its existing wording, so a game that authors no
   * prose is unchanged. Optional for source compatibility with adapters
   * written before outcome prose existed.
   */
  storyUpdateLine(
    card: TCard,
    option: string,
    coinChange: number,
    repChange: number,
    outcomeProse?: string | null,
  ): string | null;
  /** Journal title for a list of journal entries. */
  journalTitle(entries: readonly StorylineJournalEntry[]): string;
  /** A one-line summary of a story-line card for a tooltip/intro. */
  storylineSummary(card: TCard): string;
}

/**
 * The composed story-line system: generic compilation, resolution, pending
 * choice lifecycle and journal helpers, bound to a game's adapters.
 */
export interface StorylineSystem<TState, TCard extends StorylineCard> {
  readonly engine: StorylineEngineAdapter<TState, TCard>;
  readonly ui: StorylineUiAdapter<TCard>;
  /**
   * The resource keys in force for this system — the adapter's declaration,
   * or the default `coins` / `reputation` projection when it declares none.
   * Pass it to `validateStorylineOptions(options, { resources })` so unknown
   * keys are reported against the same set the runtime uses.
   */
  readonly resources: readonly StorylineResourceKey[];

  // ── Compilation ─────────────────────────────────────────────
  /** Compile a card's story-line into the generalised option model. */
  compileStorylineFromEvent(card: TCard, state?: TState): CompiledStoryline<TState>;
  /** True when the card presents a story-driven choice. */
  eventHasStoryline(card: TCard): boolean;
  /** Ordered options for a card (empty when non-choice). */
  getStorylineOptions(card: TCard, state?: TState): StorylineOption<TState>[];
  /** Number of options (0 for non-choice). */
  storylineOptionCount(card: TCard, state?: TState): number;
  /** Parse a CSV `options` encoding into the generalised model. */
  parseStorylineOptionsEncoding(encoding: string): StorylineOption<TState>[];
  /** Register an explicit ordered option list for an event id. */
  registerStorylineOptions(eventId: string, options: readonly StorylineOption<TState>[]): void;
  /** Clear all registered options (test isolation). */
  resetStorylineRegistry(): void;
  /** True when an explicit option list is registered for the event id. */
  hasRegisteredStorylineOptions(eventId: string): boolean;

  // ── Resolution ──────────────────────────────────────────────
  /** Apply the chosen option and push its successor (if any). */
  resolveStorylineOption(
    state: TState,
    card: TCard,
    option: StorylineOption<TState>,
  ): StorylineResolution<TCard>;
  /** Push a chain successor card with deterministic serial naming. */
  pushChainCard(state: TState, templateId: string | null | undefined): TCard | null;

  // ── Pending-choice lifecycle ────────────────────────────────
  /** Create a pending choice from a drawn card (null when non-choice). */
  createPendingStorylineChoice(
    card: TCard,
    state?: TState,
  ): PendingStorylineChoice<TState, TCard> | null;
  /** Options presented for a pending choice (snapshot preferred). */
  getPendingStorylineOptions(
    pending: PendingStorylineChoice<TState, TCard>,
    state?: TState,
  ): StorylineOption<TState>[];
  /** Mark a pending choice resolved with the chosen option label. */
  markChoiceResolved(pending: PendingStorylineChoice<TState, TCard>, option: string): void;

  // ── Journal ─────────────────────────────────────────────────
  /** Parse a "story update" log line, or null when it is not one. */
  parseStoryUpdate(text: string): { storyline: string; outcome: string } | null;
  /** Build the journal (most recent first) from the activity log. */
  buildJournal(state: TState): StorylineJournalEntry[];
  /** True when the journal has no entries yet. */
  journalIsEmpty(state: TState): boolean;
  /** Journal title, naming the story-lines seen. */
  journalTitle(state: TState): string;
}

// ── Episode runner (GDD §2.3) ────────────────────────────────

/**
 * Configuration for {@link createEpisodeRunner}.
 *
 * The manifest is consumed **read-only** and is assumed to have passed
 * `validateEpisodeManifest` (GDD §2.4): the runner never re-validates it.
 * The storyline system is the run's **one** choice model, resource
 * projection and RNG — the runner adds no second resolution path.
 *
 * ```ts
 * const runner = createEpisodeRunner({
 *   manifest,               // already validated EpisodeManifest
 *   storyline,              // createStorylineSystem({ engine, ui })
 *   content: cardsById,     // cardsFromCsv(parseCsv(csv), adapter)
 *   seed: 1234,             // the run's single seed
 * });
 * ```
 */
export interface EpisodeRunnerConfig<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
> {
  /** The validated episode manifest the run walks (never mutated). */
  readonly manifest: EpisodeManifest;
  /** The one choice model, resource projection and RNG for the run. */
  readonly storyline: StorylineSystem<TState, TCard>;
  /**
   * Content cards keyed by card id — the id space beats and endings resolve
   * in. Built from the manifest's `content.file` (never re-derived here).
   */
  readonly content: ReadonlyMap<string, TCard>;
  /** The run's single seed (recorded on `run-start` and in the save). */
  readonly seed: number;
}

/**
 * One loss-ledger line: an irreversible resource loss the run observed or
 * applied. `delta` is always negative — the ledger never records a refund.
 */
export type LossLedgerEntry = ChainLossLedgerEntry | RuleLossLedgerEntry;

/** The two loss-ledger entry kinds, in ledger-order vocabulary. */
export const LOSS_LEDGER_KINDS = ['chain', 'rule'] as const;

/** A loss-ledger entry kind ({@link LOSS_LEDGER_KINDS} member). */
export type LossLedgerKind = (typeof LOSS_LEDGER_KINDS)[number];

/**
 * A loss observed by diffing an irreversible resource across a beat
 * resolution (GDD §2.2.8): the engine applied it, the runner merely noticed.
 */
export interface ChainLossLedgerEntry {
  /** Discriminator: a loss observed across a choice resolution. */
  readonly kind: 'chain';
  /** Scene the loss happened in. */
  readonly sceneId: string;
  /** Beat (card id) the loss was observed across. */
  readonly beatId: string;
  /** The irreversible declared resource that fell. */
  readonly field: StorylineResourceKey;
  /** The observed net change; always negative. */
  readonly delta: number;
}

/**
 * A loss applied by a scene's `losses` rule at scene close (GDD §2.3 step 8).
 */
export interface RuleLossLedgerEntry {
  /** Discriminator: a loss applied by an authored loss rule. */
  readonly kind: 'rule';
  /** Scene the rule fired in. */
  readonly sceneId: string;
  /** The `losses[].id` that fired. */
  readonly ruleId: string;
  /** The irreversible declared resource the rule removed. */
  readonly field: StorylineResourceKey;
  /** The applied change; always negative. */
  readonly delta: number;
  /** The rule's player-facing `statement` line. */
  readonly statement: string;
}

/**
 * The run state, as read through {@link EpisodeRunner.getState}.
 *
 * Exactly the beat-sheet fields of GDD §3.5.2: the position in the manifest,
 * the remaining scene clock, the pending chain card, the histories and the
 * loss ledger. Resources and the journal live in the game's own state (read
 * through the storyline engine adapter), never duplicated here.
 */
export interface EpisodeRunState {
  /** The run's single seed. */
  readonly seed: number;
  /** The act the run is currently in (`manifest.start.act` at run start). */
  readonly currentActId: string;
  /** The scene the run is currently in (`manifest.start.scene` at run start). */
  readonly currentSceneId: string;
  /** The beat the run is currently on (`manifest.start.beat` at run start). */
  readonly currentBeatId: string;
  /** Clock ticks left in the current scene (resets per scene entry). */
  readonly sceneClockRemaining: number;
  /**
   * A resolved choice's pushed card whose scene close has not run yet, or
   * `null` when the scene is not waiting on a chain route.
   */
  readonly pendingChain: string | null;
  /** Scene ids entered, in entry order (empty until the first scene close). */
  readonly sceneHistory: readonly string[];
  /** Route ids taken, in close order (empty until the first scene close). */
  readonly routeHistory: readonly string[];
  /** Observed and applied irreversible losses, in observation order. */
  readonly lossLedger: readonly LossLedgerEntry[];
}

/**
 * The nine fields of one `scene-exit` transcript record (GDD §2.3 step 11).
 *
 * This is the **single** source the scene-exit banner, the replay comparison
 * and the audit read; {@link SCENE_EXIT_FIELDS} pins the field list so a
 * widened record fails the build instead of silently drifting.
 */
export interface SceneExitRecord {
  /** The scene that closed. */
  readonly sceneId: string;
  /** Whether the scene objective was met at close. */
  readonly objectiveMet: boolean;
  /** The classified scene outcome. */
  readonly outcome: SceneOutcome;
  /** The `outcomeRules[].id` that classified the outcome. */
  readonly ruleId: string;
  /** The `routes[].id` the close took. */
  readonly routeId: string;
  /** Clock ticks spent in the scene. */
  readonly clockSpent: number;
  /** Clock ticks left when the scene closed. */
  readonly clockRemaining: number;
  /** Whether the scene closed because a beat could not be afforded. */
  readonly budgetExhausted: boolean;
  /** The beat (or ending card id) the route opens, in contract order. */
  readonly nextBeat: string;
}

/**
 * The `scene-exit` record's fields, in GDD §2.3 step 11 order.
 *
 * Tests and the documentation assert {@link SceneExitRecord}'s keys against
 * this tuple, so adding or removing a field is a deliberate, compiler-checked
 * change in both places at once.
 */
export const SCENE_EXIT_FIELDS = [
  'sceneId',
  'objectiveMet',
  'outcome',
  'ruleId',
  'routeId',
  'clockSpent',
  'clockRemaining',
  'budgetExhausted',
  'nextBeat',
] as const;

/**
 * The episode runner: the beat-sheet layer constructed around a
 * {@link StorylineSystem}.
 *
 * Later GDD §2.3 features (beat entry, choice resolution, scene close,
 * routing, persistence) add behaviour to this surface; the constructed run
 * state shape and the read-only accessors below stay stable.
 */
export interface EpisodeRunner<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
> {
  /** The validated manifest the run walks. */
  readonly manifest: EpisodeManifest;
  /** The one choice model the runner delegates resolution to. */
  readonly storyline: StorylineSystem<TState, TCard>;
  /** The content card map beats and endings resolve in. */
  readonly content: ReadonlyMap<string, TCard>;
  /**
   * A frozen snapshot of the run state.
   *
   * The snapshot is a defensive copy: mutating it (or its arrays) never
   * changes the runner, and two calls never share an array instance.
   */
  getState(): EpisodeRunState;
  /**
   * The `scene-exit` records appended so far, in close order (frozen copy).
   */
  getSceneExits(): readonly SceneExitRecord[];
}
