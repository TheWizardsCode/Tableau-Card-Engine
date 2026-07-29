/**
 * Unit tests for the debug tools registry module.
 *
 * Tests run in Node via Vitest. `import.meta.env.DEV` is a Vite
 * build-time define and resolves to `true` during Vitest execution
 * (development mode). The test verifies the structural contract
 * of the exported members rather than the actual dev-mode value.
 */

import { describe, it, expect } from 'vitest';
import { isDevMode, type DebugToolsEntry } from '../../../src/ui/debug/DebugToolsRegistry';

describe('isDevMode', () => {
  it('returns a boolean value', () => {
    const result = isDevMode();
    expect(typeof result).toBe('boolean');
  });
});

describe('DebugToolsEntry interface contract', () => {
  it('can be satisfied by a plain object with label, description, activate', () => {
    const entry: DebugToolsEntry = {
      label: 'Test Tool',
      description: 'A test debug tool entry',
      activate: (_scene: Phaser.Scene) => {
        // no-op
      },
    };

    expect(entry).toHaveProperty('label');
    expect(typeof entry.label).toBe('string');
    expect(entry).toHaveProperty('description');
    expect(typeof entry.description).toBe('string');
    expect(entry).toHaveProperty('activate');
    expect(typeof entry.activate).toBe('function');
  });
});
