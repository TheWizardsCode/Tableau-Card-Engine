/**
 * Main Street: Face-Down Incident Deck Tests
 *
 * Validates the face-down incident deck replaces the old 2-card visible queue:
 * - incidentDeck is the state field (front = next to resolve)
 * - resolveIncident pops the front card and records draw history
 * - Save/load migration from old incidentQueue to incidentDeck works
 * - Seeded determinism is preserved
 *
 * @module
 */

import { describe, it, expect } from 'vitest';

import {
  setupMainStreetGame,
  serializeMainStreetState,
  deserializeMainStreetState,
  type MainStreetState,
  type MainStreetSerializedState,
} from '../../example-games/main-street/MainStreetState';
import {
  resolveIncident,
} from '../../example-games/main-street/MainStreetEngine';
import {
  INCIDENT_QUEUE_SIZE,
  type EventCard,
} from '../../example-games/main-street/MainStreetCards';

// ── Helpers ─────────────────────────────────────────────────

function createTestState(seed: string = 'deck-test'): MainStreetState {
  return setupMainStreetGame({ seed });
}

/**
 * Count how many incidents were resolved across N calls to resolveIncident.
 */
function resolveAndCountIncidents(state: MainStreetState, count: number): EventCard[] {
  const resolved: EventCard[] = [];
  for (let i = 0; i < count; i++) {
    const event = resolveIncident(state);
    if (event) resolved.push(event);
  }
  return resolved;
}

// ── Tests ───────────────────────────────────────────────────

describe('Face-Down Incident Deck', () => {

  describe('AC1: incidentDeck replaces incidentQueue', () => {
    it('should have incidentDeck field instead of incidentQueue in state', () => {
      const state = createTestState('ac1-test');
      expect('incidentDeck' in state).toBe(true);
      expect(Array.isArray(state.incidentDeck)).toBe(true);
    });

    it('should not have incidentQueue field on MainStreetState', () => {
      const state = createTestState('ac1-noqueue');
      // TypeScript would flag this, but at runtime the old field should not exist
      expect((state as unknown as Record<string, unknown>).incidentQueue).toBeUndefined();
    });

    it('should initialize with a non-empty incident deck', () => {
      const state = createTestState('ac1-init');
      expect(state.incidentDeck.length).toBeGreaterThan(0);
    });
  });

  describe('AC2: Resolution from deck top', () => {
    it('should pop cards from the deck top when resolving incidents', () => {
      const state = createTestState('ac2-pop');
      const deckSizeBefore = state.incidentDeck.length;
      const resolved = resolveAndCountIncidents(state, 1);
      expect(resolved.length).toBe(1);
      expect(state.incidentDeck.length).toBe(deckSizeBefore - 1);
    });

    it('should return null when the deck is empty', () => {
      const state = createTestState('ac2-empty');
      // Drain the incident deck completely.
      while (state.incidentDeck.length > 0) {
        resolveIncident(state);
      }
      expect(state.incidentDeck.length).toBe(0);
      expect(resolveIncident(state)).toBeNull();
    });

    it('should record draw history for each resolved incident', () => {
      const state = createTestState('ac2-history');
      const initialHistoryLength = state.incidentBalance.recentNames.length;
      const resolved = resolveAndCountIncidents(state, 2);
      expect(resolved.length).toBe(2);
      // Each resolve calls recordIncidentDraw
      expect(state.incidentBalance.recentNames.length).toBe(initialHistoryLength + 2);
    });

    it('should preserve seeded determinism: same seed produces same deck order', () => {
      const state1 = createTestState('ac2-determ');
      const state2 = createTestState('ac2-determ');

      const resolved1 = resolveAndCountIncidents(state1, 5);
      const resolved2 = resolveAndCountIncidents(state2, 5);

      expect(resolved1.length).toBe(resolved2.length);
      for (let i = 0; i < resolved1.length; i++) {
        expect(resolved1[i].name).toBe(resolved2[i].name);
      }
    });
  });

  describe('AC3: Save/load migration', () => {
    it('should serialize incidentDeck correctly', () => {
      const state = createTestState('ac3-serialize');
      const serialized = serializeMainStreetState(state);
      expect('incidentDeck' in serialized).toBe(true);
      expect(Array.isArray(serialized.incidentDeck)).toBe(true);
    });

    it('should deserialize incidentDeck correctly', () => {
      const state = createTestState('ac3-deserialize');
      const serialized = serializeMainStreetState(state);
      const restored = deserializeMainStreetState(serialized);
      expect(restored.incidentDeck.length).toBe(state.incidentDeck.length);
    });

    it('should migrate old incidentQueue to incidentDeck during deserialization', () => {
      // Create a serialized state with the old incidentQueue field
      const state = createTestState('ac3-migrate');
      const serialized = serializeMainStreetState(state);

      // Rename incidentDeck to incidentQueue (simulate old save format)
      const legacy = serialized as unknown as Record<string, unknown>;
      legacy.incidentQueue = legacy.incidentDeck;
      delete legacy.incidentDeck;

      // Deserializing should migrate incidentQueue → incidentDeck
      const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);
      expect(Array.isArray(restored.incidentDeck)).toBe(true);
      expect(restored.incidentDeck.length).toBeGreaterThan(0);
    });

    it('should not crash on legacy saves without incidentBalance', () => {
      const state = createTestState('ac3-legacy');
      const serialized = serializeMainStreetState(state);

      // Remove incidentBalance (simulate very old save)
      (serialized as unknown as Record<string, unknown>).incidentBalance = undefined;

      const restored = deserializeMainStreetState(serialized as MainStreetSerializedState);
      expect(restored.incidentBalance).toBeDefined();
      expect(Array.isArray(restored.incidentDeck)).toBe(true);
    });
  });

  describe('INCIDENT_QUEUE_SIZE constant still exported', () => {
    it('should still export INCIDENT_QUEUE_SIZE for backward compatibility', () => {
      expect(INCIDENT_QUEUE_SIZE).toBe(2);
    });
  });
});
