/**
 * Gym headless deterministic smoke tests.
 *
 * Each test exercises a specific Gym scene's core logic using
 * deterministic seeds so that re-running with the same seed
 * produces identical outcomes.
 *
 * These tests validate:
 *   - Seeded RNG determinism across multiple draws
 *   - Pile lifecycle (push/pop/clear/isEmpty)
 *   - UndoRedoManager stack semantics under fixed sequences
 *   - TranscriptRecorderBase event capture and finalization
 *   - SaveLoadStore round-trip with a mock storage
 *   - SoundManager mute/volume/mapping behaviour
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  createSeededRng,
  UndoRedoManager,
  CompoundCommand,
  TranscriptRecorderBase,
  SaveLoadStore,
  SoundManager,
  GameEventEmitter,
} from '../../src/core-engine';
import type { BaseTranscript, SoundPlayer, EventSoundMapping } from '../../src/core-engine';
import {
  createStandardDeck,
  shuffleArray,
} from '../../src/card-system/Deck';
import { Pile } from '../../src/card-system/Pile';
import { createCard } from '../../src/card-system/Card';

// ── Deterministic RNG ────────────────────────────────────

describe('Gym headless: Deck & Seeded RNG determinism', () => {
  it('produces identical shuffle sequences for the same seed', () => {
    const seed = 999;
    const rng1 = createSeededRng(seed);
    const deck1 = createStandardDeck();
    shuffleArray(deck1, rng1);

    const rng2 = createSeededRng(seed);
    const deck2 = createStandardDeck();
    shuffleArray(deck2, rng2);

    // Decks must be identical after shuffle
    for (let i = 0; i < deck1.length; i++) {
      expect(`${deck1[i].rank}${deck1[i].suit}`).toBe(`${deck2[i].rank}${deck2[i].suit}`);
    }
  });

  it('produces identical draw sequences from a shuffled deck', () => {
    const seed = 42;
    const draw = (n: number): string[] => {
      const rng = createSeededRng(seed);
      const deck = createStandardDeck();
      shuffleArray(deck, rng);
      const result: string[] = [];
      for (let i = 0; i < n && deck.length > 0; i++) {
        const card = deck.pop()!;
        result.push(`${card.rank}${card.suit}`);
      }
      return result;
    };

    const seq1 = draw(10);
    const seq2 = draw(10);
    expect(seq1).toEqual(seq2);
  });

  it('different seeds produce different outcomes', () => {
    const rng1 = createSeededRng(1);
    const rng2 = createSeededRng(2);
    const vals1 = Array.from({ length: 20 }, () => rng1());
    const vals2 = Array.from({ length: 20 }, () => rng2());
    expect(vals1).not.toEqual(vals2);
  });
});

// ── Pile / Hand determinism ───────────────────────────────

describe('Gym headless: Hand/Pile interaction determinism', () => {
  it('Pile push/pop preserves LIFO order', () => {
    const cards = [createCard('A', 'spades'), createCard('K', 'hearts'), createCard('Q', 'diamonds')];
    const pile = new Pile(cards.map(c => ({ ...c })));

    const popped: string[] = [];
    while (!pile.isEmpty()) {
      const c = pile.pop()!;
      popped.push(`${c.rank}${c.suit}`);
    }

    // Pop order should be reverse of construction order
    expect(popped).toEqual(['Qdiamonds', 'Khearts', 'Aspades']);
  });

  it('Pile clear empties the pile', () => {
    const pile = new Pile(createStandardDeck());
    expect(pile.size()).toBe(52);
    pile.clear();
    expect(pile.isEmpty()).toBe(true);
    expect(pile.size()).toBe(0);
  });

  it('Multiple sequences of push/pop from a seeded deck are deterministic', () => {
    const rng = createSeededRng(42);
    const deck = createStandardDeck();
    shuffleArray(deck, rng);
    const drawPile = new Pile([...deck]);
    const hand: typeof deck = [];

    // Draw 5
    for (let i = 0; i < 5; i++) {
      hand.push(drawPile.pop()!);
    }
    expect(hand.length).toBe(5);
    expect(drawPile.size()).toBe(47);

    // Discard one to discard pile
    const discard = new Pile();
    const discarded = hand.splice(0, 1)[0];
    discarded.faceUp = false;
    discard.push(discarded);

    expect(hand.length).toBe(4);
    expect(discard.size()).toBe(1);
    expect(discard.peek()!.rank).toBe(discarded.rank);
  });
});

// ── UndoRedo determinism ──────────────────────────────────

describe('Gym headless: Undo/Redo stack determinism', () => {
  it('fixed action sequence produces stable counter value', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();
    const deltas = [1, -3, 5, 2, -1];

    for (const d of deltas) {
      mgr.execute({
        execute: () => { state.value += d; },
        undo: () => { state.value -= d; },
        description: `${d >= 0 ? '+' : ''}${d}`,
      });
    }

    expect(state.value).toBe(1 + (-3) + 5 + 2 + (-1)); // 4

    // Undo all
    while (mgr.canUndo()) {
      mgr.undo();
    }
    expect(state.value).toBe(0);

    // Redo all
    while (mgr.canRedo()) {
      mgr.redo();
    }
    expect(state.value).toBe(4);
  });

  it('compound command undo/redo is deterministic', () => {
    const state = { value: 0 };
    const mgr = new UndoRedoManager();

    const cmd = new CompoundCommand([
      { execute: () => { state.value += 10; }, undo: () => { state.value -= 10; }, description: '+10' },
      { execute: () => { state.value += 3; }, undo: () => { state.value -= 3; }, description: '+3' },
      { execute: () => { state.value += 7; }, undo: () => { state.value -= 7; }, description: '+7' },
    ] as const, 'compound');

    mgr.execute(cmd);
    expect(state.value).toBe(20);

    mgr.undo();
    expect(state.value).toBe(0);

    mgr.redo();
    expect(state.value).toBe(20);
  });
});

// ── Transcript determinism ────────────────────────────────

interface TestTranscriptEvent {
  type: string;
  seed: number;
  value: number;
}

interface TestTranscript extends BaseTranscript<null, TestTranscriptEvent, null> {}

/** Concrete recorder for testing. */
class DeterministicRecorder extends TranscriptRecorderBase<TestTranscript> {
  constructor() {
    super({
      version: 1,
      gameType: 'gym-deterministic-test',
      startedAt: '2025-01-01T00:00:00.000Z',
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
    });
  }

  addEvent(event: TestTranscriptEvent): void {
    this.transcript.events.push(event);
  }

  finalize(): TestTranscript {
    this.transcript.endedAt = '2025-01-01T00:01:00.000Z';
    this.transcript.results = null;
    return this.getTranscript();
  }
}

describe('Gym headless: Transcript recording determinism', () => {
  it('same seed produces identical event sequences', () => {
    const seed = 42;

    const buildTranscript = (): TestTranscript => {
      const rng = createSeededRng(seed);
      const recorder = new DeterministicRecorder();

      const types = ['draw', 'discard', 'shuffle', 'score'];
      for (let i = 0; i < 10; i++) {
        const type = types[Math.floor(rng() * types.length)];
        const value = Math.floor(rng() * 100);
        recorder.addEvent({ type, seed, value });
      }

      return recorder.finalize();
    };

    const t1 = buildTranscript();
    const t2 = buildTranscript();

    expect(t1.events).toEqual(t2.events);
  });
});

// ── SoundManager determinism ──────────────────────────────

class MockPlayer implements SoundPlayer {
  readonly calls: Array<{ method: string; key: string }> = [];
  play(key: string): void { this.calls.push({ method: 'play', key }); }
  stop(key: string): void { this.calls.push({ method: 'stop', key }); }
  setVolume(_v: number): void {}
  setMute(_m: boolean): void {}
}

describe('Gym headless: SoundManager determinism', () => {
  it('event mapping produces consistent sound calls in order', () => {
    const player = new MockPlayer();
    const mgr = new SoundManager(player, { storage: null });
    const emitter = new GameEventEmitter();

    mgr.register('ding');
    mgr.register('buzz');

    const mapping: EventSoundMapping = {
      'card-drawn': 'ding',
      'card-discarded': 'buzz',
    };

    mgr.connectToEvents(emitter, mapping);

    // Emit a fixed sequence
    emitter.emit('card-drawn', {} as any);
    emitter.emit('card-discarded', {} as any);
    emitter.emit('card-drawn', {} as any);
    emitter.emit('card-drawn', {} as any);

    expect(player.calls).toEqual([
      { method: 'play', key: 'ding' },
      { method: 'play', key: 'buzz' },
      { method: 'play', key: 'ding' },
      { method: 'play', key: 'ding' },
    ]);

    mgr.destroy();
    emitter.removeAllListeners();
  });

  it('muted state consistently suppresses all sounds', () => {
    const player = new MockPlayer();
    const mgr = new SoundManager(player, { storage: null });
    const emitter = new GameEventEmitter();

    mgr.register('ding');
    mgr.connectToEvents(emitter, { 'card-drawn': 'ding' });

    mgr.setMute(true);
    emitter.emit('card-drawn', {} as any);
    mgr.play('ding');

    expect(player.calls).toEqual([]);

    mgr.setMute(false);
    mgr.play('ding');
    expect(player.calls).toEqual([{ method: 'play', key: 'ding' }]);

    mgr.destroy();
    emitter.removeAllListeners();
  });
});

// ── SaveLoad determinism (with mock storage) ───────────────

function createMockStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

describe('Gym headless: Save/Load determinism', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', createMockStorage());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('round-trip produces consistent state for the same input', async () => {
    const store1 = new SaveLoadStore({ localStoragePrefix: 'gym-det-1' });
    const store2 = new SaveLoadStore({ localStoragePrefix: 'gym-det-2' });

    const state = { counter: 42, label: 'deterministic' };
    const serializer = {
      schemaVersion: 1,
      serialize: (s: typeof state) => ({ c: s.counter, l: s.label }),
      deserialize: (d: { c: number; l: string }) => ({ counter: d.c, label: d.l }),
    };

    await store1.saveSerialized('run-checkpoint', 'gym-det', 'slot-1', serializer, state);
    await store2.saveSerialized('run-checkpoint', 'gym-det', 'slot-1', serializer, state);

    const loaded1 = await store1.loadSerialized('run-checkpoint', 'gym-det', 'slot-1', serializer);
    const loaded2 = await store2.loadSerialized('run-checkpoint', 'gym-det', 'slot-1', serializer);

    expect(loaded1).toEqual(loaded2);
    expect(loaded1!.counter).toBe(42);
    expect(loaded1!.label).toBe('deterministic');
  });
});