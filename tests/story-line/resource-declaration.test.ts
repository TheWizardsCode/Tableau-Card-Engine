/**
 * Declared-resource suite (CG-0MWNHZ67Q005BWE0, parent AC 1–3).
 *
 * The story-line engine used to hard-code a `coins` / `reputation` pair. This
 * suite pins the generalised contract:
 *
 * 1. **A game declares an arbitrary resource set** — the fixture game below
 *    declares five (`hull`, `morale`, `stores`, `goodwill`,
 *    `chronometricCharge`) and authors options that read and modify any of
 *    them.
 * 2. **The declared set is threaded everywhere** — draw-time affordability,
 *    cost payment, `extraEffect` application, condition evaluation and
 *    validation all operate over declared keys.
 * 3. **The rules that keep it honest** — an absent key reads as `0`, an
 *    unspecified cost key is unconstrained, and no resource is ever invented
 *    (an undeclared key is neither read, paid nor applied).
 * 4. **`coins` / `reputation` stay the default projection** — a game that
 *    declares nothing (or the same pair) keeps `coinChange` / `repChange`
 *    working exactly as before.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESOURCE_KEYS,
  createResourceProjection,
  createStorylineSystem,
  evaluateCondition,
  isOptionAffordable,
  readResource,
  resolveResourceKeys,
  selectDeclaredDelta,
  validateStorylineOptions,
  type PendingStorylineChoice,
  type StorylineCard,
  type StorylineEngineAdapter,
  type StorylineLogEntry,
  type StorylineResourceField,
} from '../../src/story-line';

/** The fixture game's declared resource keys, in declaration order. */
const VOYAGE_RESOURCES = [
  'hull',
  'morale',
  'stores',
  'goodwill',
  'chronometricCharge',
] as const;

type VoyageResourceKey = (typeof VOYAGE_RESOURCES)[number];

/** Card shape the fixture game operates on. */
interface VoyageCard extends StorylineCard {
  readonly id: string;
  readonly name: string;
}

/** The fixture game's state: five declared resources plus narrative state. */
interface VoyageState extends Record<VoyageResourceKey, number> {
  turn: number;
  activityLog: StorylineLogEntry[];
  deck: VoyageCard[];
  rngCalls: number;
}

/** Builds a fresh voyage state. */
function makeVoyageState(overrides: Partial<VoyageState> = {}): VoyageState {
  return {
    hull: 6,
    morale: 3,
    stores: 10,
    goodwill: 2,
    chronometricCharge: 1,
    turn: 1,
    activityLog: [],
    deck: [],
    rngCalls: 0,
    ...overrides,
  };
}

/** A declarative read/mutate pair for one state field. */
function voyageField(
  key: VoyageResourceKey,
): StorylineResourceField<VoyageState> {
  return {
    read: (state) => state[key],
    apply: (state, delta) => {
      state[key] += delta;
    },
  };
}

/** The fixture game's resource projection (the declaration + its accessors). */
function voyageResources() {
  return createResourceProjection<VoyageState>({
    hull: voyageField('hull'),
    morale: voyageField('morale'),
    stores: voyageField('stores'),
    goodwill: voyageField('goodwill'),
    chronometricCharge: voyageField('chronometricCharge'),
  });
}

/** Builds a card with the given overrides. */
function makeCard(overrides: Partial<VoyageCard> & { id: string }): VoyageCard {
  return { name: overrides.id, ...overrides } as VoyageCard;
}

/** Options controlling {@link setup}. */
interface SetupOptions {
  /** Engine adapter overrides (e.g. a partial resource bag). */
  readonly engine?: Partial<StorylineEngineAdapter<VoyageState, VoyageCard>>;
  /** Card templates the chain-card sink can resolve. */
  readonly templates?: readonly VoyageCard[];
}

/** Wires a voyage system over a template catalogue. */
function setup(options: SetupOptions = {}) {
  const templates = new Map(
    (options.templates ?? []).map((card) => [card.id, card]),
  );
  const engine: StorylineEngineAdapter<VoyageState, VoyageCard> = {
    ...voyageResources(),
    rng: (state) => {
      state.rngCalls += 1;
      return 0.5;
    },
    // The fixture's intrinsic effects live in the options, not the card.
    applyEffect: () => {},
    appendLog: (state, text) => {
      state.activityLog.push({ turn: state.turn, text });
    },
    getActivityLog: (state) => state.activityLog,
    getTemplate: (id) => templates.get(id) ?? null,
    getBaseTypeId: (id) => id.replace(/-\d+$/, ''),
    getChainScanCards: (state) => state.deck,
    pushChainCard: (state, card) => {
      state.deck.push(card);
    },
    ...options.engine,
  };
  return {
    system: createStorylineSystem({ engine }),
    state: makeVoyageState(),
    templates,
  };
}

/** Log texts, for readable assertions. */
function logTexts(state: VoyageState): string[] {
  return state.activityLog.map((entry) => entry.text);
}

// ── 1. A game declares an arbitrary resource set ────────────

describe('declared resource set', () => {
  it('threads the declared keys through the composed system', () => {
    const { system } = setup();
    expect(system.resources).toEqual([...VOYAGE_RESOURCES]);
  });

  it('reads and modifies any declared resource through cost + extraEffect', () => {
    const { system, state } = setup();
    const card = makeCard({ id: 'evt-trade' });

    const result = system.resolveStorylineOption(state, card, {
      label: 'Trade',
      effectPolicy: 'skip',
      cost: { stores: 4 },
      extraEffect: { morale: 1, goodwill: 2, chronometricCharge: 1 },
    });

    expect(state.stores).toBe(6);
    expect(state.morale).toBe(4);
    expect(state.goodwill).toBe(4);
    expect(state.chronometricCharge).toBe(2);
    expect(state.hull).toBe(6);
    expect(logTexts(state)).toEqual([
      'Cost paid: -4 stores.',
      'Extra effect: +1 morale, +2 goodwill, +1 chronometricCharge.',
    ]);
    // `coins` / `reputation` are not declared here, so the projections are 0.
    expect(result.coinChange).toBe(0);
    expect(result.repChange).toBe(0);
  });

  it('resolves conditional successors against declared resources', () => {
    const { system, state } = setup({
      templates: [makeCard({ id: 'evt-hold' }), makeCard({ id: 'evt-cut' })],
    });
    const card = makeCard({ id: 'evt-stress' });

    const strong = system.resolveStorylineOption(state, card, {
      label: 'Push on',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'hull', op: '>=', value: 4 }, successorId: 'evt-hold' },
        { when: { field: 'goodwill', op: '<', value: 1 }, successorId: 'evt-cut' },
      ],
    });
    expect(strong.pushedCard?.id).toBe('evt-hold-0');

    state.hull = 1;
    state.goodwill = 0;
    const weak = system.resolveStorylineOption(state, card, {
      label: 'Push on',
      effectPolicy: 'skip',
      conditionalSuccessors: [
        { when: { field: 'hull', op: '>=', value: 4 }, successorId: 'evt-hold' },
        { when: { field: 'goodwill', op: '<', value: 1 }, successorId: 'evt-cut' },
      ],
    });
    expect(weak.pushedCard?.id).toBe('evt-cut-0');
  });

  it('evaluates a condition on a declared key and reads an absent key as 0', () => {
    expect(
      evaluateCondition(
        { field: 'morale', op: '==', value: 4 },
        { morale: 4 },
      ),
    ).toBe(true);
    // "Absent" covers both an omitted bag entry and a nil value.
    expect(
      evaluateCondition(
        { field: 'goodwill', op: '<=', value: 0 },
        {},
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: 'goodwill', op: '>=', value: 1 },
        { goodwill: undefined as unknown as number },
      ),
    ).toBe(false);
  });
});

// ── 2. Draw-time affordability over declared keys ───────────

describe('draw-time affordability over declared keys', () => {
  it('filters by an arbitrary declared resource, with equality affordable', () => {
    const { system, state } = setup();
    system.registerStorylineOptions('evt-hull-cost', [
      { label: 'Patch', effectPolicy: 'apply', cost: { hull: 5 } },
    ]);
    const card = makeCard({ id: 'evt-hull-cost' });

    expect(
      system.getStorylineOptions(card, state).map((option) => option.label),
    ).toEqual(['Patch']);

    state.hull = 4;
    expect(system.getStorylineOptions(card, state)).toEqual([]);

    state.hull = 5;
    expect(
      system.getStorylineOptions(card, state).map((option) => option.label),
    ).toEqual(['Patch']);
  });

  it('leaves an unspecified declared key unconstrained', () => {
    const { system, state } = setup();
    state.morale = 0;
    state.goodwill = 0;
    state.chronometricCharge = 0;
    system.registerStorylineOptions('evt-stores-only', [
      { label: 'Ration', effectPolicy: 'apply', cost: { stores: 1 } },
    ]);

    expect(
      system
        .getStorylineOptions(makeCard({ id: 'evt-stores-only' }), state)
        .map((option) => option.label),
    ).toEqual(['Ration']);
  });

  it('treats a cost on an undeclared key as unpayable (absent key reads 0)', () => {
    expect(
      isOptionAffordable({ cost: { shields: 1 } }, { shields: 99 }),
    ).toBe(false);
    // …but a declared key is honoured.
    expect(
      isOptionAffordable({ cost: { shields: 1 } }, { shields: 1 }, ['shields']),
    ).toBe(true);
  });

  it('always presents no-cost and empty-cost options', () => {
    const resources = { hull: 0 };
    expect(isOptionAffordable({}, resources, VOYAGE_RESOURCES)).toBe(true);
    expect(isOptionAffordable({ cost: {} }, resources, VOYAGE_RESOURCES)).toBe(
      true,
    );
  });

  it('freezes the filtered list into the pending choice', () => {
    const { system, state } = setup();
    system.registerStorylineOptions('evt-draw', [
      { label: 'Repair', effectPolicy: 'apply', cost: { stores: 5 } },
      { label: 'Scavenge', effectPolicy: 'apply', cost: { stores: 50 } },
    ]);
    const pending = system.createPendingStorylineChoice(
      makeCard({ id: 'evt-draw' }),
      state,
    ) as PendingStorylineChoice<VoyageState, VoyageCard>;

    expect(pending.options?.map((option) => option.label)).toEqual(['Repair']);
    state.stores = 0;
    expect(
      system
        .getPendingStorylineOptions(pending, state)
        .map((option) => option.label),
    ).toEqual(['Repair']);
  });
});

// ── 3. Cost payment / extra effect over declared keys ──────

describe('cost payment and extra effects over declared keys', () => {
  it('never applies (or invents) an undeclared resource', () => {
    const { system, state } = setup();
    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-unknown' }),
      {
        label: 'Fit a shield',
        effectPolicy: 'skip',
        cost: { hull: 1 },
        extraEffect: { shields: 3 },
      },
    );

    expect(state.hull).toBe(5);
    expect('shields' in state).toBe(false);
    expect(result.coinChange).toBe(0);
    expect(logTexts(state)).toEqual([
      'Cost paid: -1 hull.',
      'Extra effect ignored undeclared resource(s): shields.',
    ]);
  });

  it('never applies an undeclared cost key', () => {
    const { system, state } = setup();
    system.resolveStorylineOption(state, makeCard({ id: 'evt-bad-cost' }), {
      label: 'Pay in nothing',
      effectPolicy: 'skip',
      cost: { shields: 2 },
    });

    expect('shields' in state).toBe(false);
    expect(logTexts(state)).toEqual([
      'Cost paid ignored undeclared resource(s): shields.',
    ]);
  });

  it('reports the projections as 0 when the affected key is not declared', () => {
    const { system, state } = setup({
      engine: {
        // A bag that carries `coins` although the game never declared it.
        getResources: () => ({ coins: 100 }),
        applyEffect: (s) => {
          s.hull += 1;
        },
      },
    });
    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-hidden-coins' }),
      { label: 'Brace', effectPolicy: 'apply' },
    );

    expect(state.hull).toBe(7);
    expect(result.coinChange).toBe(0);
    expect(result.repChange).toBe(0);
  });

  it('keeps the log silent when every declared delta is zero', () => {
    const { system, state } = setup();
    system.resolveStorylineOption(state, makeCard({ id: 'evt-zero' }), {
      label: 'Nothing',
      effectPolicy: 'skip',
      cost: { hull: 0 },
      extraEffect: { morale: 0 },
    });
    expect(logTexts(state)).toEqual([]);
    expect(state.hull).toBe(6);
  });
});

// ── 4. Default projection stays source-compatible ───────────

describe('default coins / reputation projection', () => {
  it('uses the default projection when the adapter declares nothing', () => {
    const engine: StorylineEngineAdapter<VoyageState, VoyageCard> = {
      ...voyageResources(),
      rng: () => 0.5,
      applyEffect: () => {},
      appendLog: () => {},
      getActivityLog: () => [],
      getTemplate: () => null,
      getBaseTypeId: (id) => id,
      getChainScanCards: () => [],
      pushChainCard: () => {},
    };
    // An adapter written before declaration existed simply omits `resources`.
    delete (engine as { resources?: unknown }).resources;
    const system = createStorylineSystem({ engine });

    expect(system.resources).toEqual(DEFAULT_RESOURCE_KEYS);
    const state = makeVoyageState();
    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-projected' }),
      {
        label: 'Pay',
        effectPolicy: 'skip',
        cost: { coins: 25 },
        extraEffect: { reputation: 2 },
      },
    );
    // The voyage projection does not carry coins/reputation, so nothing moves…
    expect(result.coinChange).toBe(0);
    expect(result.repChange).toBe(0);
    // …while a coins/reputation cost is still validated against the default set.
    expect(
      validateStorylineOptions<VoyageState>([
        { label: 'Pay', effectPolicy: 'skip', cost: { coins: 25 } },
      ]).valid,
    ).toBe(true);
    expect(
      validateStorylineOptions<VoyageState>([
        { label: 'Pay', effectPolicy: 'skip', cost: { hull: 25 } },
      ]).issues.map((issue) => issue.code),
    ).toEqual(['unknown-resource-key']);
  });

  it('projects coins / reputation when they are part of the declared set', () => {
    // A game that declares the shipped pair alongside its own resources.
    interface TreasureState {
      coins: number;
      reputation: number;
      hull: number;
      activityLog: StorylineLogEntry[];
    }
    const engine: StorylineEngineAdapter<TreasureState, VoyageCard> = {
      ...createResourceProjection<TreasureState>({
        coins: {
          read: (state) => state.coins,
          apply: (state, delta) => {
            state.coins += delta;
          },
        },
        reputation: {
          read: (state) => state.reputation,
          apply: (state, delta) => {
            state.reputation += delta;
          },
        },
        hull: {
          read: (state) => state.hull,
          apply: (state, delta) => {
            state.hull += delta;
          },
        },
      }),
      rng: () => 0.5,
      applyEffect: () => {},
      appendLog: (state, text) => {
        state.activityLog.push({ turn: 1, text });
      },
      getActivityLog: (state) => state.activityLog,
      getTemplate: () => null,
      getBaseTypeId: (id) => id,
      getChainScanCards: () => [],
      pushChainCard: () => {},
    };
    const system = createStorylineSystem({ engine });
    const state: TreasureState = {
      coins: 100,
      reputation: 4,
      hull: 6,
      activityLog: [],
    };

    const result = system.resolveStorylineOption(
      state,
      makeCard({ id: 'evt-mixed' }),
      {
        label: 'Hull and coin',
        effectPolicy: 'skip',
        cost: { coins: 30, hull: 2 },
        extraEffect: { reputation: 1 },
      },
    );

    expect(result.coinChange).toBe(-30);
    expect(result.repChange).toBe(1);
    expect(state.coins).toBe(70);
    expect(state.reputation).toBe(5);
    expect(state.hull).toBe(4);
  });
});

// ── 5. Validation over the declared set ────────────────────

describe('validation over the declared set', () => {
  it('reports the card id, resource key and reason for an unknown cost key', () => {
    const result = validateStorylineOptions<VoyageState>(
      [{ label: 'Pay', effectPolicy: 'skip', cost: { hull: 2 } }],
      { cardId: 'evt-toll' },
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      path: 'options[0].cost.hull',
      code: 'unknown-resource-key',
      cardId: 'evt-toll',
      resource: 'hull',
    });
    expect(result.issues[0].message).toContain('hull');
    expect(result.issues[0].message).toContain('declared');
  });

  it('accepts every declared key in cost, extraEffect and conditions', () => {
    const result = validateStorylineOptions<VoyageState>(
      [
        {
          label: 'Full',
          effectPolicy: 'apply',
          cost: { hull: 1, stores: 2 },
          extraEffect: { morale: 1, goodwill: 1, chronometricCharge: 1 },
          conditionalSuccessors: [
            { when: { field: 'hull', op: '>=', value: 1 }, successorId: null },
            {
              when: { field: 'chronometricCharge', op: '==', value: 0 },
              successorId: null,
            },
          ],
        },
      ],
      { resources: VOYAGE_RESOURCES, cardId: 'evt-full' },
    );

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('rejects a negative extra effect per declared key, naming each key', () => {
    const result = validateStorylineOptions<VoyageState>(
      [
        {
          label: 'Bleed',
          effectPolicy: 'apply',
          extraEffect: { morale: -1, goodwill: -2 },
        },
      ],
      { resources: VOYAGE_RESOURCES, cardId: 'evt-bleed' },
    );

    expect(result.issues.map((issue) => [issue.path, issue.code, issue.resource])).toEqual([
      ['options[0].extraEffect.morale', 'negative-extra-effect', 'morale'],
      ['options[0].extraEffect.goodwill', 'negative-extra-effect', 'goodwill'],
    ]);
    expect(result.issues.every((issue) => issue.cardId === 'evt-bleed')).toBe(true);
  });

  it('reports a condition field outside the declared set with the declared list', () => {
    const result = validateStorylineOptions<VoyageState>(
      [
        {
          label: 'Gated',
          effectPolicy: 'skip',
          conditionalSuccessors: [
            {
              when: { field: 'shields', op: '>=', value: 1 },
              successorId: null,
            },
          ],
        },
      ],
      { resources: VOYAGE_RESOURCES, cardId: 'evt-gated' },
    );

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      path: 'options[0].conditionalSuccessors[0].when.field',
      code: 'unknown-condition-field',
      cardId: 'evt-gated',
      resource: 'shields',
    });
    expect(result.issues[0].message).toContain('morale');
  });
});

// ── 6. Declaration helpers ─────────────────────────────────

describe('resource declaration helpers', () => {
  it('reports every declared key in declaration order and zero-fills absent values', () => {
    const projection = createResourceProjection<{ present: number; missing?: number }>({
      present: { read: (state) => state.present, apply: () => {} },
      missing: { read: (state) => state.missing, apply: () => {} },
    });
    expect(projection.resources).toEqual(['present', 'missing']);
    expect(projection.getResources({ present: 3 })).toEqual({
      present: 3,
      missing: 0,
    });
  });

  it('ignores unknown keys, zero deltas and non-finite values', () => {
    const state = { hull: 5 };
    const projection = createResourceProjection<{ hull: number }>({
      hull: {
        read: (s) => s.hull,
        apply: (s, delta) => {
          s.hull += delta;
        },
      },
    });
    projection.applyResourceDelta(state, {
      hull: 2,
      shields: 10,
    });
    projection.applyResourceDelta(state, { hull: 0 });
    projection.applyResourceDelta(state, { hull: Number.NaN });
    expect(state.hull).toBe(7);
    expect('shields' in state).toBe(false);
  });

  it('falls back to the default projection for a blank declaration', () => {
    expect(resolveResourceKeys(undefined)).toEqual(DEFAULT_RESOURCE_KEYS);
    expect(resolveResourceKeys([])).toEqual(DEFAULT_RESOURCE_KEYS);
    expect(resolveResourceKeys(['  ', ''])).toEqual(DEFAULT_RESOURCE_KEYS);
    expect(resolveResourceKeys([' hull ', 'hull', 'morale'])).toEqual([
      'hull',
      'morale',
    ]);
  });

  it('reads an absent resource as 0', () => {
    expect(readResource({}, 'hull')).toBe(0);
    expect(readResource({ hull: 0 }, 'hull')).toBe(0);
    expect(readResource({ hull: 4 }, 'hull')).toBe(4);
  });

  it('signs and filters a delta against the declared set', () => {
    expect(selectDeclaredDelta({ stores: 2, morale: 0, shields: 1 }, -1, VOYAGE_RESOURCES)).toEqual({
      delta: { stores: -2 },
      ignored: ['shields'],
      refused: [],
    });
  });
});
