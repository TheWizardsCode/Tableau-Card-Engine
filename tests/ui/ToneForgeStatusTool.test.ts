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
  resolveEffectiveDebugTools,
  TONEFORGE_DEBUG_TOOL_LABEL,
  TONEFORGE_UNAVAILABLE_DESCRIPTION,
  withToneForgeStatusTool,
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
  const manager = new SoundManager(createMockPlayer(), {
    storage: null,
    synthPlayer: createMockPlayer(),
    synthKeyMap: { 'sfx-place': 'card-place', 'sfx-deal': 'card-draw' },
  });
  // Opt-in by default: enable the retained integration explicitly.
  manager.enableSynth();
  return manager;
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

describe('createToneForgeStatusTool (opt-in lazy loader)', () => {
  it('reports Inactive and never calls the loader while merely registered', () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    const loader = vi.fn(async () => ({
      player: createMockPlayer(),
      keyMap: { 'sfx-place': 'card-place' },
      diagnostics: { factoryCount: 3 },
    }));
    const tool = createToneForgeStatusTool(manager, { loadIntegration: loader });

    expect(manager.isSynthActive()).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(resolveDebugToolDescription(tool)).toContain('Inactive');
  });

  it('lazily loads + attaches on enable, then detaches on the next activate', async () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    const loader = vi.fn(async () => ({
      player: createMockPlayer(),
      keyMap: { 'sfx-place': 'card-place' },
      diagnostics: { factoryCount: 3 },
    }));
    const tool = createToneForgeStatusTool(manager, { loadIntegration: loader });

    tool.activate({} as never);
    await vi.waitFor(() => expect(manager.isSynthActive()).toBe(true));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(manager.getSynthStatus().factoryCount).toBe(3);
    expect(resolveDebugToolDescription(tool)).toContain('Active');

    // Disabling reverts to the WAV/Phaser fallback without a reload.
    tool.activate({} as never);
    expect(manager.isSynthActive()).toBe(false);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(resolveDebugToolDescription(tool)).toContain('Inactive');
  });

  it('surfaces a null loader result as a load error and stays inactive', async () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    const loader = vi.fn(async () => {
      manager.setSynthDiagnostics({ lastLoadError: 'module missing' });
      return null;
    });
    const tool = createToneForgeStatusTool(manager, { loadIntegration: loader });

    tool.activate({} as never);
    await vi.waitFor(() => expect(loader).toHaveBeenCalled());
    await vi.waitFor(() => expect(resolveDebugToolDescription(tool)).toContain('load error: module missing'));
    expect(manager.isSynthActive()).toBe(false);
  });

  it('records a throwing loader as a load error without breaking', async () => {
    const manager = new SoundManager(createMockPlayer(), { storage: null });
    const loader = vi.fn(async () => {
      throw new Error('network down');
    });
    const tool = createToneForgeStatusTool(manager, { loadIntegration: loader });

    expect(() => tool.activate({} as never)).not.toThrow();
    await vi.waitFor(() => expect(resolveDebugToolDescription(tool)).toContain('load error: network down'));
    expect(manager.isSynthActive()).toBe(false);
  });
});

describe('withToneForgeStatusTool (effective-list injection)', () => {
  const otherTool = {
    label: 'State Inspector',
    description: 'Inspect game state',
    activate: () => {},
  };

  it('appends the ToneForge entry to the supplied list', () => {
    const result = withToneForgeStatusTool([otherTool], createActiveManager());

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.label)).toContain(TONEFORGE_DEBUG_TOOL_LABEL);
  });

  it('injects even when the game supplies its own debug tools list', () => {
    // Main Street passes an explicit list rather than relying on defaults;
    // the engine must still surface the ToneForge entry.
    const gameOwned = [otherTool, { ...otherTool, label: 'Market Card Cheat' }];
    const result = withToneForgeStatusTool(gameOwned, createActiveManager());

    expect(result.map((t) => t.label)).toContain(TONEFORGE_DEBUG_TOOL_LABEL);
  });

  it('de-duplicates when a game already registered a ToneForge entry', () => {
    const existing = createToneForgeStatusTool(createActiveManager());
    const result = withToneForgeStatusTool([otherTool, existing], createActiveManager());

    expect(result.filter((t) => t.label === TONEFORGE_DEBUG_TOOL_LABEL)).toHaveLength(1);
  });

  it('works with an empty list', () => {
    const result = withToneForgeStatusTool([], null);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe(TONEFORGE_DEBUG_TOOL_LABEL);
    expect(resolveDebugToolDescription(result[0])).toBe(TONEFORGE_UNAVAILABLE_DESCRIPTION);
  });

  it('does not mutate the input array', () => {
    const input = [otherTool];
    withToneForgeStatusTool(input, createActiveManager());

    expect(input).toHaveLength(1);
  });
});

describe('resolveEffectiveDebugTools (dev/prod gate)', () => {
  const otherTool = {
    label: 'State Inspector',
    description: 'Inspect game state',
    activate: () => {},
  };

  it('injects the ToneForge entry in dev mode', () => {
    const result = resolveEffectiveDebugTools([otherTool], createActiveManager(), true);

    expect(result.map((t) => t.label)).toContain(TONEFORGE_DEBUG_TOOL_LABEL);
  });

  it('does NOT inject the ToneForge entry in production', () => {
    const result = resolveEffectiveDebugTools([otherTool], createActiveManager(), false);

    expect(result.map((t) => t.label)).not.toContain(TONEFORGE_DEBUG_TOOL_LABEL);
    expect(result).toEqual([otherTool]);
  });

  it('returns the game tools unchanged in production', () => {
    const gameTools = [otherTool];
    const result = resolveEffectiveDebugTools(gameTools, createActiveManager(), false);

    expect(result).toBe(gameTools);
  });

  it('handles an undefined game list in dev mode', () => {
    const result = resolveEffectiveDebugTools(undefined, createActiveManager(), true);

    expect(result.map((t) => t.label)).toContain(TONEFORGE_DEBUG_TOOL_LABEL);
  });

  it('handles an undefined game list in production', () => {
    const result = resolveEffectiveDebugTools(undefined, createActiveManager(), false);

    expect(result).toEqual([]);
  });
});
