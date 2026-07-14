import { describe, it, expect } from 'vitest';

import { setupMainStreetGame } from '../../example-games/main-street/MainStreetState';
import { executeDayStart } from '../../example-games/main-street/MainStreetEngine';
import { UndoRedoManager } from '../../src/core-engine/UndoRedoManager';
import { buyBusinessCommand } from '../../example-games/main-street/MainStreetCommands';
import {
  MainStreetTranscriptRecorder,
  setMainStreetRecorder,
  recordMainStreetEvent,
} from '../../example-games/main-street/MainStreetTranscript';

// Ensure recorder captures action -> undo -> redo when the UI flow records events.
describe('Main Street transcript recording (action, undo, redo)', () => {
  it('records action, undo, and redo events when invoked from UI-like flow', () => {
    const state = setupMainStreetGame({ seed: 'transcript-recording' });

    // Move to MarketPhase so market is populated
    executeDayStart(state);

    const emptySlots = state.streetGrid.map((s, i) => (s === null ? i : -1)).filter(i => i >= 0);
    expect(emptySlots.length).toBeGreaterThan(0);

    const businessCards = state.market.development;
    expect(businessCards.length).toBeGreaterThan(0);
    // Pick an affordable business card for the test (avoid brittle cost assumptions)
    const affordable = businessCards.find((b) => b.cost <= state.resourceBank.coins) ?? businessCards[0];
    const cardId = affordable.id;
    const slot = emptySlots[0];

    // Attach a global recorder like the scene does
    const initialSnapshot = { seed: state.seed ?? null, snapshotAtTurn: state.turn };
    const recorder = new MainStreetTranscriptRecorder(initialSnapshot);
    setMainStreetRecorder(recorder);

    const mgr = new UndoRedoManager();
    const cmd = buyBusinessCommand(state, cardId, slot);

    // Execute command via manager (like scene would)
    mgr.execute(cmd);

    // Scene normally records an 'action' event after executing a command
    recordMainStreetEvent({ type: 'action', turn: state.turn, action: { type: 'buy-business', cardId, slotIndex: slot }, description: cmd.description });

    // Undo via manager and record undo event as scene does
    const undone = mgr.undo();
    expect(undone).toBeDefined();
    if (undone) {
      recordMainStreetEvent({ type: 'undo', turn: state.turn, reversedAction: { description: undone.description } });
    }

    // Redo via manager and record redo event as scene does
    const redone = mgr.redo();
    expect(redone).toBeDefined();
    if (redone) {
      recordMainStreetEvent({ type: 'redo', turn: state.turn, reappliedAction: { description: redone.description } });
    }

    const events = recorder.getTranscript().events.map(e => ({ type: (e as any).type, payload: e }));
    const types = events.map(e => e.type);

    expect(types).toContain('action');
    expect(types).toContain('undo');
    expect(types).toContain('redo');

    // Verify descriptions are present in the undo/redo payloads
    const undoEvent = recorder.getTranscript().events.find((e: any) => e.type === 'undo');
    expect(undoEvent).toBeDefined();
    expect((undoEvent as any).reversedAction).toBeDefined();
    expect((undoEvent as any).reversedAction.description).toContain('BuyBusiness');

    const redoEvent = recorder.getTranscript().events.find((e: any) => e.type === 'redo');
    expect(redoEvent).toBeDefined();
    expect((redoEvent as any).reappliedAction).toBeDefined();
    expect((redoEvent as any).reappliedAction.description).toContain('BuyBusiness');
  });
});
