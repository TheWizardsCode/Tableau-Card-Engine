/**
 * Tests for DebugToolsRegistry – dev mode detection and debug tool entry type.
 *
 * @module tests/debug/DebugToolsRegistry.test
 */
import { describe, it, expect, vi } from 'vitest';
import { isDevMode, DebugToolsEntry } from '../../src/ui/debug/DebugToolsRegistry';

describe('isDevMode()', () => {
  it('should be a function', () => {
    expect(typeof isDevMode).toBe('function');
  });

  it('should return a boolean', () => {
    const result = isDevMode();
    expect(typeof result).toBe('boolean');
  });
});

describe('DebugToolsEntry type', () => {
  it('should accept a valid debug tool entry object', () => {
    const tool: DebugToolsEntry = {
      label: 'Test Tool',
      description: 'A test debug tool',
      activate: vi.fn(),
    };
    expect(tool.label).toBe('Test Tool');
    expect(tool.description).toBe('A test debug tool');
    expect(typeof tool.activate).toBe('function');
  });

  it('should allow multiple tool entries in an array', () => {
    const tools: DebugToolsEntry[] = [
      {
        label: 'Tool A',
        description: 'First tool',
        activate: vi.fn(),
      },
      {
        label: 'Tool B',
        description: 'Second tool',
        activate: vi.fn(),
      },
    ];
    expect(tools).toHaveLength(2);
    expect(tools[0].label).toBe('Tool A');
    expect(tools[1].label).toBe('Tool B');
  });

  it('should accept scene parameter in activate callback', () => {
    const mockScene = { key: 'TestScene' } as any;
    const tool: DebugToolsEntry = {
      label: 'Scene Tool',
      description: 'Tool that needs scene access',
      activate: (scene: any) => {
        scene.key = 'modified';
      },
    };
    tool.activate(mockScene);
    expect(mockScene.key).toBe('modified');
  });
});
