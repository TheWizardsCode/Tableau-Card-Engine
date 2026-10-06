/**
 * Unit tests for the DebugToolsEntry live-description contract.
 *
 * `description` is `string | (() => string)`: static strings render verbatim,
 * while function descriptions are resolved on demand so they track live state
 * (e.g. a debug tool's Active/Inactive status). See CG-0MUTX3C5V009Z2NQ.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveDebugToolDescription,
  type DebugToolsEntry,
} from '../../src/ui/debug/DebugToolsRegistry';

function makeEntry(description: DebugToolsEntry['description']): DebugToolsEntry {
  return {
    label: 'Demo',
    description,
    activate: () => {},
  };
}

describe('DebugToolsEntry live description', () => {
  it('keeps the static-string description unchanged', () => {
    const entry = makeEntry('Static status text');

    expect(entry.description).toBe('Static status text');
    expect(resolveDebugToolDescription(entry)).toBe('Static status text');
  });

  it('resolves a function description by calling it', () => {
    const fn = vi.fn(() => 'Active');
    const entry = makeEntry(fn);

    expect(resolveDebugToolDescription(entry)).toBe('Active');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns a fresh value on each resolve when closure state changes', () => {
    let active = false;
    const entry = makeEntry(() => (active ? 'Active' : 'Inactive'));

    expect(resolveDebugToolDescription(entry)).toBe('Inactive');

    active = true;
    expect(resolveDebugToolDescription(entry)).toBe('Active');
  });

  it('exposes function descriptions through the entry type', () => {
    const entry = makeEntry(() => 'Inactive');

    expect(typeof entry.description).toBe('function');
  });
});
