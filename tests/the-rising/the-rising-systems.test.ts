/**
 * 1916: The Rising — polish systems unit tests (F7, AC1–AC6).
 *
 * Covers the renderer-free systems added by F7:
 *   - transcript recording + auto-save (AC2);
 *   - versioned save/load + checkpoint autosave (AC3);
 *   - the compound placement/clock undo command (AC4);
 *   - the difficulty presets and their effect on initial state / clock (AC5);
 *   - the JSON help content and its interpolation (AC6).
 *
 * Audio wiring (AC1) is covered by `TheRisingAnimator.test.ts`; the controller's
 * end-to-end undo/redo is covered by the interaction browser suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundCommand, UndoRedoManager } from '@core-engine/UndoRedoManager';
import { SaveLoadStore } from '@core-engine/SaveLoad';
import type { TranscriptStore } from '@core-engine/transcript';

import {
  DIFFICULTY_SETTINGS,
  RISING_FINAL_YEAR,
  RISING_START_YEAR,
  THERISING_DEFAULT_DIFFICULTY,
  THERISING_DIFFICULTIES,
  createInitialState,
  resolveDifficulty,
  transition,
  type RisingState,
} from '../../src/TheRisingState';
import { ROSTER } from '../../src/TheRisingContent';
import { chooseTestimony, meetSpirit } from '../../src/TheRisingEconomy';
import { applyPlacement, evaluateOutcome } from '../../src/TheRisingRules';
import { advanceClock, clockBandYearsForDifficulty, completeTurn } from '../../src/TheRisingClock';
import {
  THERISING_GAME_TYPE,
  THERISING_TRANSCRIPT_VERSION,
  TheRisingTranscriptRecorder,
} from '../../src/TheRisingTranscript';
import {
  THERISING_RUN_SLOT,
  THERISING_SAVE_SCHEMA_VERSION,
  createTheRisingCheckpointManager,
  deserializeRisingStateVersioned,
  loadTurnCheckpoint,
  saveTurnCheckpoint,
  serializeRisingStateVersioned,
} from '../../src/TheRisingSaveLoad';
import {
  AdvanceClockCommand,
  PlaceSpiritCommand,
} from '../../src/scenes/TheRisingCommands';
import { THERISING_SFX_KEYS } from '../../src/scenes/TheRisingConstants';
import {
  THERISING_HELP_HEADINGS,
  buildRisingHelpSections,
  interpolateHelpText,
  risingHelpValuesFor,
} from '../../src/TheRisingHelpContent';

const EARLIEST = 'diarmait-mac-murchada'; // 1110
const MIDDLE = 'ruaidri-ua-conchobair'; // 1116
const LATEST = 'aoife-mac-murrough'; // 1145
const TARGETS = [EARLIEST, MIDDLE, LATEST] as const;

function spiritById(id: string) {
  const spirit = ROSTER.spirits.find((candidate) => candidate.id === id);
  if (!spirit) throw new Error(`Unknown spirit ${id}`);
  return spirit;
}

function sessionState(overrides: Partial<RisingState> = {}): RisingState {
  return {
    ...createInitialState({
      seed: 'f7-systems',
      difficulty: 'normal',
      memory: 5,
      insightTarget: 5,
      rowSpiritIds: [...TARGETS],
      targetSpiritIds: [...TARGETS],
    }),
    ...overrides,
  };
}

/** Advance a session through one full turn and return the intermediate states. */
function playTurn(state: RisingState, spiritId: string): {
  before: RisingState;
  placed: RisingState;
  after: RisingState;
  turn: number;
} {
  const met = meetSpirit(state, spiritId);
  const talking = transition(met.state, { type: 'begin-conversation' });
  const choice = chooseTestimony(talking.state, 0);
  const placed = applyPlacement(choice.state, spiritById(spiritId));
  const completed = completeTurn(placed.state);
  return {
    before: choice.state,
    placed: placed.state,
    after: completed.state,
    turn: state.turn,
  };
}

// ── AC2: Transcript recording ───────────────────────────────

describe('The Rising — transcript recording (AC2)', () => {
  it('records the full event sequence for one turn', () => {
    const recorder = new TheRisingTranscriptRecorder(sessionState());
    const transcript = recorder.getTranscript();

    expect(transcript.gameType).toBe(THERISING_GAME_TYPE);
    expect(transcript.version).toBe(THERISING_TRANSCRIPT_VERSION);
    expect(transcript.endedAt).toBe('');
    expect(transcript.results).toBeNull();
    expect(transcript.initialState.targetSpiritIds).toEqual([...TARGETS]);

    const turn = playTurn(sessionState(), EARLIEST);
    recorder.recordSpiritMet(turn.turn, EARLIEST, 'Diarmait Mac Murchada', 1, 4);
    recorder.recordQuestionChosen(turn.turn, EARLIEST, 0, 1, 'Why did you sail?', 1);
    recorder.recordPlacementAttempted(turn.turn, EARLIEST, 0, true);
    recorder.recordInsightAwarded(turn.turn, EARLIEST, 2, 0, 2, 3, null);
    recorder.recordClockAdvanced(turn.turn, RISING_START_YEAR, turn.after.clock, 63);

    expect(transcript.events.map((event) => event.type)).toEqual([
      'spirit-met',
      'question-chosen',
      'placement-attempted',
      'insight-awarded',
      'clock-advanced',
    ]);
    expect(transcript.events[0]).toMatchObject({ spiritId: EARLIEST, memoryRemaining: 4 });
    expect(transcript.events[2]).toMatchObject({ legal: true });
  });

  it('records an illegal placement with its rejection reason', () => {
    const recorder = new TheRisingTranscriptRecorder(sessionState());
    recorder.recordPlacementAttempted(0, EARLIEST, 1, false, 'breaks chronological order');
    expect(recorder.getTranscript().events[0]).toMatchObject({
      type: 'placement-attempted',
      legal: false,
      reason: 'breaks chronological order',
    });
  });

  it('finalizes with an end timestamp and result record on a win', () => {
    const recorder = new TheRisingTranscriptRecorder(sessionState());
    let state = sessionState();
    state = playTurn(state, EARLIEST).after;
    state = playTurn(state, MIDDLE).after;
    state = playTurn(state, LATEST).after;

    const evaluation = evaluateOutcome(state);
    expect(evaluation.outcome).toBe('won');

    recorder.recordGameEnd(state, evaluation);
    const transcript = recorder.finalize(recorder.buildResult(state, evaluation));

    expect(transcript.endedAt).not.toBe('');
    expect(transcript.results).toMatchObject({
      outcome: 'won',
      spiritsPlaced: 3,
      spiritsTargeted: 3,
    });
    expect(transcript.events[transcript.events.length - 1]).toMatchObject({ type: 'game-end', outcome: 'won' });
  });

  it('auto-saves on key milestones (a completed turn and finalization)', async () => {
    const save = vi.fn(() => Promise.resolve(null));
    const store = { save } as unknown as TranscriptStore;

    const recorder = new TheRisingTranscriptRecorder(sessionState());
    recorder.attachAutoSave(store);

    // Micro-events within a turn do not trigger a save.
    recorder.recordSpiritMet(0, EARLIEST, 'Diarmuid', 1, 4);
    recorder.recordQuestionChosen(0, EARLIEST, 0, 1, 'Why?', 1);
    recorder.recordPlacementAttempted(0, EARLIEST, 0, true);
    recorder.recordInsightAwarded(0, EARLIEST, 2, 0, 2, 3, null);
    expect(save).not.toHaveBeenCalled();

    // The completed-turn clock advance is a key milestone.
    recorder.recordClockAdvanced(0, RISING_START_YEAR, RISING_START_YEAR + 63, 63);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      THERISING_GAME_TYPE,
      expect.objectContaining({ gameType: THERISING_GAME_TYPE }),
    );

    // Finalization always persists the finished transcript.
    recorder.finalize(recorder.buildResult(sessionState(), { outcome: 'in-progress', reason: null }));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not auto-save when no store is attached', () => {
    const recorder = new TheRisingTranscriptRecorder(sessionState());
    expect(() => recorder.recordSpiritMet(0, EARLIEST, 'Diarmuid', 1, 4)).not.toThrow();
  });
});

// ── AC3: Versioned save/load ────────────────────────────────

describe('The Rising — versioned save/load (AC3)', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
      setItem: (key: string, value: string) => { storage.set(key, String(value)); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a state through the versioned payload helpers', () => {
    const state = sessionState({ insight: 9, clock: 1300 });
    const payload = serializeRisingStateVersioned(state);
    expect(payload.schemaVersion).toBe(THERISING_SAVE_SCHEMA_VERSION);

    const restored = deserializeRisingStateVersioned(payload);
    expect(restored).toEqual(state);
  });

  it('fails on a schema version mismatch instead of corrupting state', () => {
    const payload = serializeRisingStateVersioned(sessionState());
    expect(() =>
      deserializeRisingStateVersioned({ ...payload, schemaVersion: payload.schemaVersion + 1 }),
    ).toThrow(/Incompatible save version/);
    expect(() =>
      deserializeRisingStateVersioned({ ...payload, schemaVersion: payload.schemaVersion - 1 }),
    ).toThrow(/Incompatible save version/);
  });

  it('rejects a payload whose data is not a valid state', () => {
    expect(() =>
      deserializeRisingStateVersioned({
        schemaVersion: THERISING_SAVE_SCHEMA_VERSION,
        data: JSON.stringify({ nope: true }),
      }),
    ).toThrow(/Invalid Rising state/);
  });

  it('persists and restores an end-of-turn checkpoint through the store', async () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'the-rising-test' });
    const state = sessionState({ turn: 3, insight: 12, clock: 1400 });

    await saveTurnCheckpoint(store, state);
    const restored = await loadTurnCheckpoint(store);

    expect(restored).toEqual(state);
  });

  it('exposes a checkpoint manager bound to the run slot and game type', () => {
    const store = new SaveLoadStore({ localStoragePrefix: 'the-rising-test-2' });
    const manager = createTheRisingCheckpointManager(store);
    // The manager is game/slot bound; its load returns null before any save.
    expect(manager).toBeTruthy();
    expect(THERISING_RUN_SLOT).toBe('turn-start');
  });
});

// ── AC4: Compound undo/redo command ─────────────────────────

describe('The Rising — compound placement/clock command (AC4)', () => {
  it('applies the placement then the clock, and reverses them in order', () => {
    const { before, placed, after } = playTurn(sessionState(), EARLIEST);

    const applied: RisingState[] = [];
    const animatePlacement = vi.fn();
    const controller = {
      applyState: (state: RisingState) => applied.push(state),
      applyStateHudOnly: (state: RisingState) => applied.push(state),
      animatePlacement,
    } as unknown as ConstructorParameters<typeof PlaceSpiritCommand>[0];

    const compound = new CompoundCommand([
      new PlaceSpiritCommand(controller, before, placed, EARLIEST, undefined),
      new AdvanceClockCommand(controller, placed, after),
    ]);

    compound.execute();
    expect(applied).toEqual([placed, after]);
    expect(animatePlacement).toHaveBeenCalledTimes(1);

    compound.undo();
    expect(applied).toEqual([placed, after, placed, before]);
  });

  it('invalidates the redo stack after a new action (standard stack semantics)', () => {
    const before = sessionState();
    const placed = sessionState({ insight: 3 });
    const after = sessionState({ turn: 1, clock: 1300 });
    const applied: RisingState[] = [];
    const controller = {
      applyState: (state: RisingState) => applied.push(state),
      applyStateHudOnly: (state: RisingState) => applied.push(state),
      animatePlacement: vi.fn(),
    } as unknown as ConstructorParameters<typeof PlaceSpiritCommand>[0];

    const manager = new UndoRedoManager();
    manager.execute(new CompoundCommand([
      new PlaceSpiritCommand(controller, before, placed, EARLIEST, undefined),
      new AdvanceClockCommand(controller, placed, after),
    ]));

    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);

    manager.undo();
    expect(manager.canRedo()).toBe(true);

    manager.redo();
    expect(manager.canRedo()).toBe(false);

    // A new action after an undo clears the redo stack.
    manager.undo();
    expect(manager.canRedo()).toBe(true);
    manager.execute(new CompoundCommand([new AdvanceClockCommand(controller, before, after)]));
    expect(manager.canRedo()).toBe(false);
  });
});

// ── AC5: Difficulty presets ─────────────────────────────────

describe('The Rising — difficulty presets (AC5)', () => {
  it('provides three ordered presets', () => {
    expect(THERISING_DIFFICULTIES).toEqual(['easy', 'normal', 'hard']);
    expect(THERISING_DEFAULT_DIFFICULTY).toBe('normal');
    expect(DIFFICULTY_SETTINGS.easy.maxMemory).toBeGreaterThan(DIFFICULTY_SETTINGS.normal.maxMemory);
    expect(DIFFICULTY_SETTINGS.normal.maxMemory).toBeGreaterThan(DIFFICULTY_SETTINGS.hard.maxMemory);
    expect(DIFFICULTY_SETTINGS.easy.insightTarget).toBeLessThan(DIFFICULTY_SETTINGS.normal.insightTarget);
    expect(DIFFICULTY_SETTINGS.normal.insightTarget).toBeLessThan(DIFFICULTY_SETTINGS.hard.insightTarget);
  });

  it('applies the preset to the initial state values', () => {
    const easy = createInitialState({ difficulty: 'easy' });
    const normal = createInitialState({ difficulty: 'normal' });
    const hard = createInitialState({ difficulty: 'hard' });

    expect(easy.memory).toBe(DIFFICULTY_SETTINGS.easy.maxMemory);
    expect(easy.insightTarget).toBe(DIFFICULTY_SETTINGS.easy.insightTarget);
    expect(hard.memory).toBe(DIFFICULTY_SETTINGS.hard.maxMemory);
    expect(hard.insightTarget).toBe(DIFFICULTY_SETTINGS.hard.insightTarget);
    expect(easy.difficulty).toBe('easy');
    expect(hard.difficulty).toBe('hard');
    expect(normal.difficulty).toBe('normal');
  });

  it('gives Hard a faster clock than Easy', () => {
    const easyBand = clockBandYearsForDifficulty('easy');
    const normalBand = clockBandYearsForDifficulty('normal');
    const hardBand = clockBandYearsForDifficulty('hard');
    expect(hardBand).toBeGreaterThan(normalBand);
    expect(normalBand).toBeGreaterThan(easyBand);

    // The clock advances by the difficulty band each turn.
    const hardState = createInitialState({ difficulty: 'hard' });
    const advanced = advanceClock(hardState);
    expect(advanced.step).toBe(hardBand);
    expect(advanced.newYear).toBe(RISING_START_YEAR + hardBand);
    // The clock clamps at the final year.
    const nearEnd = createInitialState({ difficulty: 'hard', clock: RISING_FINAL_YEAR - 1 });
    expect(advanceClock(nearEnd).newYear).toBe(RISING_FINAL_YEAR);
  });

  it('coerces unknown difficulty values to the fallback', () => {
    expect(resolveDifficulty('hard')).toBe('hard');
    expect(resolveDifficulty('impossible')).toBe(THERISING_DEFAULT_DIFFICULTY);
    expect(resolveDifficulty(undefined, 'easy')).toBe('easy');
  });
});

// ── AC6: Help content ───────────────────────────────────────

describe('The Rising — help content (AC6)', () => {
  it('exposes the Gym-pattern sections plus the game-specific rules', () => {
    expect(THERISING_HELP_HEADINGS).toEqual([
      'How to Play',
      'Features',
      'Controls',
      'Win / Loss Conditions',
      'Usage Example',
      'Test Plan',
    ]);
  });

  it('interpolates the live difficulty values with no placeholders left', () => {
    const sections = buildRisingHelpSections(risingHelpValuesFor('hard'));
    const allText = sections.map((section) => section.body ?? '').join('\n');

    expect(allText).not.toMatch(/\{\{\w+\}\}/);
    expect(allText).toContain(String(DIFFICULTY_SETTINGS.hard.insightTarget));
    expect(allText).toContain(String(RISING_FINAL_YEAR));
    expect(allText).toContain(String(RISING_START_YEAR));
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolateHelpText('Value {{insightTarget}} and {{unknown}}', { insightTarget: 7 })).toBe(
      'Value 7 and {{unknown}}',
    );
  });

  it('uses sfx- prefixed keys for every SFX (shared convention)', () => {
    for (const key of Object.values(THERISING_SFX_KEYS)) {
      expect(key).toMatch(/^sfx-/);
    }
  });
});
