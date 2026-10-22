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
 * @module
 */

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
   * Legacy two-way choice flag. When true the card compiles to
   * Accept (apply) / Reject (skip) options.
   */
  readonly hasChoices?: boolean;
  /** Legacy accept successor card id (null / absent ends the chain). */
  readonly acceptNextCardId?: string | null;
  /** Legacy reject successor card id (null / absent ends the chain). */
  readonly rejectNextCardId?: string | null;
  /**
   * Raw CSV options encoding for an arbitrary multi-outcome choice node.
   * Format: `label|cardA,cardB;label2|cardC`.
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
  /** The outcome summary (text after the story-line name). */
  readonly outcome: string;
  /** The original log line. */
  readonly text: string;
}

/** The explanatory labels for the choice buttons. */
export interface ChoiceClarityLabels {
  readonly accept: string;
  readonly reject: string;
}

/**
 * Declarative affordability cost for a story-line option.
 *
 * Every specified component is a required payment: an option is only
 * affordable when the player has at least `coins` coins **and** at least
 * `reputation` reputation. An unspecified component is unconstrained (it is
 * never defaulted to zero).
 */
export interface OptionCost {
  /** Coins the player must pay to select the option. */
  readonly coins?: number;
  /** Reputation the player must pay to select the option. */
  readonly reputation?: number;
}

/**
 * Declarative resource delta applied when a story-line option resolves.
 *
 * Each specified component is a signed delta (`-5` deducts, `5` grants). An
 * unspecified component leaves that resource unchanged.
 */
export interface OptionExtraEffect {
  /** Coin delta applied on resolution. */
  readonly coins?: number;
  /** Reputation delta applied on resolution. */
  readonly reputation?: number;
}

/**
 * A single declarative threshold condition on one resource.
 *
 * Conditions are pure data (field / operator / numeric value) so they can be
 * authored, serialised and validated without executable callbacks.
 */
export interface Condition {
  /** The resource the condition tests. */
  readonly field: 'coins' | 'reputation';
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
   * ends the chain. Retained for the programmatic registry seam and
   * transitional legacy compilation; CSV-authored options use
   * {@link successorIds}.
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
   * 4. legacy {@link successorId}.
   */
  readonly conditionalSuccessors?: readonly ConditionalSuccessorRule[];
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
  /** Current spendable resources, for delta calculation. */
  getResources(state: TState): { coins: number; reputation: number };
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
}

/**
 * Presentation adapter. Core ships a default implementation
 * ({@link createDefaultStorylineUiAdapter}); a game overrides any subset to
 * change wording without touching core logic.
 */
export interface StorylineUiAdapter<
  TState = unknown,
  TCard extends StorylineCard = StorylineCard,
> {
  /** Human-readable story-line name: explicit title, else the id, else null. */
  storylineName(card: TCard): string | null;
  /** Dialog title for a pending choice. */
  choiceDialogTitle(card: TCard): string;
  /** Dialog subtitle (the specific incident within the story-line). */
  choiceDialogSubtitle(card: TCard): string;
  /** The narrative "story update" line emitted when a choice resolves. */
  storyUpdateLine(
    card: TCard,
    option: string,
    coinChange: number,
    repChange: number,
  ): string | null;
  /**
   * Explanatory labels for the choice buttons. Must not reveal the
   * escalation card id.
   */
  choiceClarityLabels(
    card: TCard,
    options: readonly StorylineOption<TState>[],
  ): ChoiceClarityLabels;
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
  readonly ui: StorylineUiAdapter<TState, TCard>;

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
