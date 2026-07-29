/**
 * Unit tests for the State Inspector debug tool.
 *
 * Tests the factory function contract and any testable helpers.
 * The overlay rendering requires Phaser and is tested via browser tests.
 */

import { describe, it, expect } from 'vitest';
import { createStateInspectorTool } from '../../../src/ui/debug/StateInspectorOverlay';

describe('StateInspectorTool', () => {
  it('returns a valid DebugToolsEntry', () => {
    const entry = createStateInspectorTool();

    expect(entry).toHaveProperty('label');
    expect(typeof entry.label).toBe('string');
    expect(entry).toHaveProperty('description');
    expect(typeof entry.description).toBe('string');
    expect(entry).toHaveProperty('activate');
    expect(typeof entry.activate).toBe('function');
  });

  it('has expected label', () => {
    const entry = createStateInspectorTool();
    expect(entry.label).toBe('State Inspector');
  });

  it('has a non-empty description mentioning filter', () => {
    const entry = createStateInspectorTool();
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.description.toLowerCase()).toContain('filter');
  });
});
