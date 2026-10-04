/**
 * Unit tests for the ToneForge status debug tool entry.
 *
 * The tool reports live synth status and toggles ToneForge on/off via the
 * SoundManager's detach/restore API. See CG-0MUTXBJ90008IIR9.
 */

import { describe, it, expect, vi } from 'vitest';
import { SoundManager, type SoundPlayer } from '../../src/core-engine/SoundManager';
import {
  createToneForgeStatusTool,
  TONEFORGE_DEBUG_TOOL_LABEL,
  TONEFORGE_UNAVAILABLE_DESCRIPTION,
} from '../../src/ui/debug/ToneForgeStatusTool';
import { resolveDebugToolDescription } from '../../src/ui/debug/DebugToolsRegistry';

function createMockPlayer(): SoundPlayer {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setMute: vi.fn(),
  };
}

function createActiveManager(): SoundManager {
  return new SoundManager(createMockPlayer(), {
    storage: null,
    synthPlayer: createMockPlayer(),
    synthKeyMap: { 'sfx-place': 'card-place', 'sfx-deal': 'card-draw' },
  });
}

describe('createToneForgeStatusTool', () => {
  it('uses the stable ToneForge label', () => {
    const tool = createToneForgeStatusTool(createActiveManager());
    expect(tool.label).toBe(TONEFORGE_DEBUG_TOOL_LABEL);
  });

  it('reports Active with the factory count when synthesis is active', () => {
    const tool = createToneForgeStatusTool(createActiveManager());

    const description = resolveDebugToolDescription(tool);
    expect(description).toContain('Active');
    expect(description).not.toContain('Inactive');
    expect(description).toContain('2 factories');
  });

  it('reports Inactive when synthesis is not active', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    const tool = createToneForgeStatusTool(manager);

    expect(resolveDebugToolDescription(tool)).toContain('Inactive');
  });

  it('surfaces the last load error when one was recorded', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    manager.setSynthDiagnostics({ lastLoadError: 'module exploded' });
    const tool = createToneForgeStatusTool(manager);

    const description = resolveDebugToolDescription(tool);
    expect(description).toContain('Inactive');
    expect(description).toContain('load error: module exploded');
  });

  it('reports unavailable when no SoundManager is supplied', () => {
    const tool = createToneForgeStatusTool(null);

    expect(resolveDebugToolDescription(tool)).toBe(TONEFORGE_UNAVAILABLE_DESCRIPTION);
  });

  it('toggles synthesis off then on via activate (no scene restart)', () => {
    const manager = createActiveManager();
    const tool = createToneForgeStatusTool(manager);

    expect(manager.isSynthActive()).toBe(true);

    tool.activate({} as never);
    expect(manager.isSynthActive()).toBe(false);
    expect(resolveDebugToolDescription(tool)).toContain('Inactive');

    tool.activate({} as never);
    expect(manager.isSynthActive()).toBe(true);
    expect(resolveDebugToolDescription(tool)).toContain('Active');
  });

  it('is safe to activate when no SoundManager is supplied', () => {
    const tool = createToneForgeStatusTool(null);
    expect(() => tool.activate({} as never)).not.toThrow();
  });

  it('describes a single factory with singular grammar', () => {
    const manager = new SoundManager(createMockPlayer(), {
      storage: null,
      synthPlayer: createMockPlayer(),
      synthKeyMap: { 'sfx-place': 'card-place' },
    });
    const tool = createToneForgeStatusTool(manager);

    expect(resolveDebugToolDescription(tool)).toContain('1 factory');
  });
});
