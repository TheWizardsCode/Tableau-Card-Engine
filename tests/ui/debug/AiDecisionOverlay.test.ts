/**
 * Unit tests for the AI Decision Recorder and Viewer debug tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AiDecisionRecorder } from '../../../src/ui/debug/AiDecisionRecorder';
import { createAiDecisionViewerTool } from '../../../src/ui/debug/AiDecisionOverlay';

describe('AiDecisionRecorder', () => {
  let recorder: AiDecisionRecorder;

  beforeEach(() => {
    // Get a fresh state by creating a new instance
    recorder = AiDecisionRecorder.getInstance();
    recorder.clear();
  });

  it('is a singleton', () => {
    const a = AiDecisionRecorder.getInstance();
    const b = AiDecisionRecorder.getInstance();
    expect(a).toBe(b);
  });

  it('starts empty', () => {
    expect(recorder.getRecords()).toHaveLength(0);
  });

  it('records entries', () => {
    recorder.record({
      turnNumber: 0,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'discard-and-flip at (1,2)',
      timestamp: new Date().toISOString(),
    });

    expect(recorder.getRecords()).toHaveLength(1);
    expect(recorder.getRecords()[0].strategyName).toBe('greedy');
  });

  it('supports pause/resume', () => {
    recorder.record({
      turnNumber: 0,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'action-1',
      timestamp: '',
    });
    expect(recorder.getRecords()).toHaveLength(1);

    recorder.paused = true;
    recorder.record({
      turnNumber: 1,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'action-2',
      timestamp: '',
    });
    expect(recorder.getRecords()).toHaveLength(1); // Not recorded

    recorder.paused = false;
    recorder.record({
      turnNumber: 2,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'action-3',
      timestamp: '',
    });
    expect(recorder.getRecords()).toHaveLength(2);
  });

  it('clear removes all records', () => {
    recorder.record({
      turnNumber: 0,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'action-1',
      timestamp: '',
    });
    recorder.record({
      turnNumber: 1,
      playerName: 'AI',
      strategyName: 'greedy',
      chosenAction: 'action-2',
      timestamp: '',
    });
    expect(recorder.getRecords()).toHaveLength(2);
    recorder.clear();
    expect(recorder.getRecords()).toHaveLength(0);
  });
});

describe('AiDecisionViewerTool', () => {
  it('returns a valid DebugToolsEntry', () => {
    const entry = createAiDecisionViewerTool();

    expect(entry).toHaveProperty('label');
    expect(typeof entry.label).toBe('string');
    expect(entry).toHaveProperty('description');
    expect(typeof entry.description).toBe('string');
    expect(entry).toHaveProperty('activate');
    expect(typeof entry.activate).toBe('function');
  });

  it('has expected label', () => {
    const entry = createAiDecisionViewerTool();
    expect(entry.label).toBe('AI Decisions');
  });

  it('has a non-empty description', () => {
    const entry = createAiDecisionViewerTool();
    expect(entry.description.length).toBeGreaterThan(0);
  });
});
