/**
 * Unit tests for the Game Event Log debug tool.
 */

import { describe, it, expect } from 'vitest';
import { createGameEventLogTool } from '../../../src/ui/debug/GameEventLogOverlay';

describe('GameEventLogTool', () => {
  it('returns a valid DebugToolsEntry', () => {
    const entry = createGameEventLogTool();

    expect(entry).toHaveProperty('label');
    expect(typeof entry.label).toBe('string');
    expect(entry).toHaveProperty('description');
    expect(typeof entry.description).toBe('string');
    expect(entry).toHaveProperty('activate');
    expect(typeof entry.activate).toBe('function');
  });

  it('has expected label', () => {
    const entry = createGameEventLogTool();
    expect(entry.label).toBe('Game Events');
  });

  it('has a non-empty description', () => {
    const entry = createGameEventLogTool();
    expect(entry.description.length).toBeGreaterThan(0);
  });
});
