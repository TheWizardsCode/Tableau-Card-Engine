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

import type { EpisodeManifest, LossRule, SceneOutcome } from './content/episode-manifest';
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

// ── Beat entry (GDD §2.3 steps A.1–A.3) ─────────────────────

/**
 * Why a beat entry was refused.
 *
 * `budget-exhausted` is currently the only reason: the scene clock cannot pay
 * the beat's `clockCost`, so the scene closes instead of the beat being played
 * (GDD §2.3 step 2).
 */
export type BeatEntryRefusalReason = 'budget-exhausted';

/**
 * A beat the scene clock paid for: the beat is played.
 *
 * The record is the presentation payload for GDD §2.3 step 3 — the caller
 * renders `context` as the card prose, the scene banner from `sceneId`, and
 * `options` as the surviving choices. The options are already gated by
 * `isOptionAffordable` over the manifest's declared keys; the caller never
 * re-derives affordability.
 */
export interface PresentedBeatEntry<TState = unknown> {
  /** Discriminator: the clock paid for this beat, so it is played. */
  readonly status: 'presented';
  /** The scene the beat was entered in. */
  readonly sceneId: string;
  /** The beat's content card id (its manifest `Beat.cardId`). */
  readonly cardId: string;
  /** Ticks the entry charged, read from the manifest's `Beat.clockCost`. */
  readonly clockCost: number;
  /** Clock ticks left **after** the charge (never negative). */
  readonly clockRemaining: number;
  /**
   * The beat card's `context` prose, or `null` when the content carries none
   * (an adapter that maps no `context` column, or a bare runtime card).
   */
  readonly context: string | null;
  /**
   * The options that survive the declared-key affordability gate, in authored
   * order. Empty for a non-choice beat.
   */
  readonly options: readonly StorylineOption<TState>[];
}

/**
 * A beat the scene clock could not pay for: it is not played.
 *
 * No cost is charged, `currentBeatId` is unchanged and no options are
 * presented. The refusal is the scene's close trigger: `budgetExhausted` is
 * set on the runner (read through `EpisodeRunner.getBudgetExhausted`) and the
 * closed scene's `budget-exhausted` reason is carried on this record.
 */
export interface RefusedBeatEntry {
  /** Discriminator: the clock could not pay, so the beat is not played. */
  readonly status: 'refused';
  /** The scene the entry was requested in. */
  readonly sceneId: string;
  /** The beat's content card id (its manifest `Beat.cardId`). */
  readonly cardId: string;
  /** Ticks the entry would have charged, read from `Beat.clockCost`. */
  readonly clockCost: number;
  /** Clock ticks left — unchanged, because a refusal charges nothing. */
  readonly clockRemaining: number;
  /** Why the entry was refused; always `budget-exhausted`. */
  readonly reason: BeatEntryRefusalReason;
  /** Always `true`: the refusal is what closes the scene budget-exhausted. */
  readonly budgetExhausted: true;
}

/**
 * One beat-entry outcome: presented (played) or refused (scene closes).
 *
 * A discriminated union on `status`, so a caller cannot present options for a
 * refused entry — the refusal carries none.
 */
export type BeatEntry<TState = unknown> = PresentedBeatEntry<TState> | RefusedBeatEntry;

// ── Choice resolution (GDD §2.3 steps B.4–B.5) ──────────────

/**
 * The §2.3 step B.5 classification of the card a resolved choice pushed.
 *
 * - `in-scene-beat` — a beat of the current scene: continue the scene at it
 *   (the caller's next step is `enterBeat` with that card);
 * - `out-of-scene-beat` — a beat assigned to another scene: close the scene
 *   and route the chain door to it;
 * - `ending` — a card in the manifest's `endings`: close the scene and route
 *   the chain door to it (the ending is played by the close path);
 * - `none` — the resolution pushed nothing (a terminal option or chain end):
 *   close the scene with no pending chain.
 */
export type PushedCardCase =
  | 'in-scene-beat'
  | 'out-of-scene-beat'
  | 'ending'
  | 'none';

/**
 * Where a resolved choice sends the run: continue at the pushed beat, or
 * close the current scene (whose outcome and route the close path owns).
 */
export type ChoiceNext = 'continue' | 'close';

/**
 * The classification record a resolved choice returns.
 *
 * This is the **one** shape the scene close and the tests read: the case the
 * pushed card fell into, where the run goes next, and the pending chain the
 * scene close routes with. `pendingChain` is a card id only on the two close
 * cases that push a card; it is `null` for a continuing scene and for a
 * resolution that pushed nothing.
 */
export interface ChoiceResolution<TCard extends StorylineCard = StorylineCard> {
  /** Whether the run continues at the pushed beat or closes the scene. */
  readonly next: ChoiceNext;
  /** Which §2.3 step B.5 case the pushed card fell into. */
  readonly case: PushedCardCase;
  /**
   * The classified card's **base** id — the manifest beat or ending id (the
   * adapter's `getBaseTypeId`, so `le-i-log-0` reads as `le-i-log`) — or
   * `null` when the resolution pushed nothing. This is the id `enterBeat`
   * accepts when the run continues.
   */
  readonly cardId: string | null;
  /**
   * The card id the scene close routes the chain door to, or `null` when
   * there is nothing to route (a continuing scene, or a resolution that
   * pushed nothing). Equal to {@link cardId} on the two close cases that push
   * a card.
   */
  readonly pendingChain: string | null;
  /** The card the resolution pushed, exactly as `@story-line` returned it. */
  readonly pushedCard: TCard | null;
  /**
   * The underlying `@story-line` resolution, unchanged: the effect, cost,
   * extra effect, successor push and outcome prose all stay the one choice
   * model's work. The runner never re-resolves and never re-derives any part
   * of it.
   */
  readonly resolution: StorylineResolution<TCard>;
}

/**
 * The episode runner: the beat-sheet layer constructed around a
 * {@link StorylineSystem}.
 *
 * Later GDD §2.3 features (choice resolution, scene close, routing,
 * persistence) add behaviour to this surface; the constructed run state shape
 * and the read-only accessors below stay stable.
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
  /**
   * The loss ledger: every irreversible loss observed or applied, in
   * observation order (frozen copy).
   *
   * Chain lines are appended by choice resolution (a negative net change on an
   * irreversible key between `engine.getResources` snapshots); rule lines are
   * appended by the scene close when it applies a `losses[]` rule through the
   * engine seam. The ledger never holds a positive (refund) line, and a line
   * never exists without the corresponding `engine.applyResourceDelta` call.
   * `getState().lossLedger` is the same data on the run-state snapshot; this
   * accessor is the narrow read for a ledger consumer (the journal, the
   * epilogue and the scoring model).
   */
  getLossLedger(): readonly LossLedgerEntry[];
  /**
   * Enters a beat of the current scene (GDD §2.3 steps A.1–A.3).
   *
   * Reads the beat's `clockCost` from the validated manifest: when the cost
   * exceeds `sceneClockRemaining` the beat is refused (not played, no options,
   * `budgetExhausted` set, reason `budget-exhausted`); otherwise the cost is
   * charged and the beat is presented. A cost exactly equal to the remaining
   * clock is affordable.
   *
   * @param cardId    The beat's content card id; must be a beat of the current
   *                  scene (a beat of another scene is entered by routing).
   * @param state     The game state the option affordability gate reads through
   *                  the storyline engine adapter.
   * @returns A frozen {@link BeatEntry}; entry consumes no RNG and applies no
   *          resource delta.
   * @throws Error when `cardId` is not a beat assigned to the current scene.
   */
  enterBeat(cardId: string, state: TState): BeatEntry<TState>;
  /**
   * Resolves the player's chosen option through `@story-line` and classifies
   * the card it pushes (GDD §2.3 steps B.4–B.5).
   *
   * B.4: the option resolves through the run's one choice model
   * ({@link StorylineSystem.resolveStorylineOption}) unchanged — effect, cost
   * payment, extra effect, `pushedCard`, outcome prose, journal and log all
   * stay that model's work. The runner adds no second resolution path and
   * never re-reads the card's `options` cell.
   *
   * B.5: the pushed card is classified against the validated manifest. An
   * in-scene beat continues the scene (`next: 'continue'`, run state left in
   * the same scene); an out-of-scene beat or an ending card closes it with
   * `pendingChain` set to that card id; a resolution that pushes nothing
   * closes it with `pendingChain = null`. The close cases record the pending
   * chain on the run state for the scene close to route; the continuing case
   * records nothing.
   *
   * @param option The player's choice, normally one of the presented beat's
   *               options (read from `enterBeat`).
   * @param state  The game state resolution and its engine seam mutate.
   * @returns The frozen {@link ChoiceResolution} classification record.
   * @throws Error when the current beat has no content card in the run's card
   *         map, or when the pushed card is neither an assigned beat nor a
   *         declared ending (a content defect, not a modelling gap).
   */
  resolveChoice(option: StorylineOption<TState>, state: TState): ChoiceResolution<TCard>;
  /**
   * Applies one authored `LossRule` through the engine seam and records the
   * loss it observed (GDD §2.3 step C.8 / §2.2.8).
   *
   * This is the ledger's **rule-loss seam**, called once per matching
   * `losses[]` entry, in declaration order, by the scene close (step 8) — it is
   * not a general-purpose resource mutator. The manifest authors `amount` as a
   * magnitude removed, so the seam passes `-amount` to
   * `engine.applyResourceDelta`; the recorded `delta` is then read back from
   * `engine.getResources`, so the ledger observes what the seam applied rather
   * than repeating the authored number. Ordering, outcome matching and the
   * activity-log line are the scene close's business, not this seam's.
   *
   * A positive or zero observed change records nothing, and an adapter that
   * omits the optional resource seam applies nothing and records nothing — a
   * ledger line never exists without its apply.
   *
   * @param rule  The `losses[]` entry that fired, from the validated manifest.
   * @param state The game state the engine seam mutates.
   * @returns The appended rule line, or `null` when nothing was observed to
   *          fall (no seam, or a non-negative net change).
   */
  applyLossRule(rule: LossRule, state: TState): RuleLossLedgerEntry | null;
  /**
   * Whether the current scene's last beat entry was refused for want of clock.
   *
   * Set by a refusal and read by the scene close (GDD §2.3 step 7); entering a
   * scene resets it. It is run-state, not scene-exit data, so it is not part of
   * the frozen {@link EpisodeRunState} snapshot.
   */
  getBudgetExhausted(): boolean;
}
