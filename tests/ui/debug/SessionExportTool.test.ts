/**
 * Unit tests for the Session Export debug tool.
 */

import { describe, it, expect } from 'vitest';
import { createSessionExportTool } from '../../../src/ui/debug/SessionExportTool';

describe('SessionExportTool', () => {
  it('returns a valid DebugToolsEntry', () => {
    const entry = createSessionExportTool();

    expect(entry).toHaveProperty('label');
    expect(typeof entry.label).toBe('string');
    expect(entry).toHaveProperty('description');
    expect(typeof entry.description).toBe('string');
    expect(entry).toHaveProperty('activate');
    expect(typeof entry.activate).toBe('function');
  });

  it('has expected label', () => {
    const entry = createSessionExportTool();
    expect(entry.label).toBe('Export Session');
  });

  it('has a non-empty description', () => {
    const entry = createSessionExportTool();
    expect(entry.description.length).toBeGreaterThan(0);
  });
});
