/**
 * Unit tests for the pure event-log formatter used by the Game Events
 * debug overlay (CG-0MVTTR0OC006PWDK).
 *
 * The formatter is Phaser-free so the rendering contract — a one-line
 * `timestamp [eventName]` header followed by the fully pretty-printed
 * payload — can be pinned without a browser.
 */

import { describe, it, expect } from 'vitest';
import {
  formatEventLogEntry,
  stringifyPayloadSafe,
  widestLineLength,
} from '../../../src/ui/debug/formatEventLog';

describe('stringifyPayloadSafe', () => {
  it('pretty-prints a nested object and array payload with 2-space indentation', () => {
    const payload = {
      row: 2,
      card: { id: 'copper', value: 3 },
      tags: ['a', 'b'],
    };

    const result = stringifyPayloadSafe(payload);

    expect(result).toContain('\n  "row": 2');
    expect(result).toContain('\n  "card": {');
    expect(result).toContain('\n    "id": "copper"');
    expect(result).toContain('\n  "tags": [');
    expect(result).toContain('\n    "a"');
    expect(result.split('\n').length).toBeGreaterThan(5);
  });

  it('honours a custom indent width', () => {
    const result = stringifyPayloadSafe({ a: 1 }, 4);
    expect(result).toBe('{\n    "a": 1\n}');
  });

  it('never truncates a long string value', () => {
    const long = 'x'.repeat(240);
    const result = stringifyPayloadSafe({ note: long });

    expect(result).toContain(long);
    expect(result).not.toContain('...');
    expect(result.length).toBeGreaterThan(long.length);
  });

  it.each([
    [42, '42'],
    ['text', '"text"'],
    [true, 'true'],
    [null, 'null'],
  ])('renders the primitive %s as a readable single-line body', (payload, expected) => {
    const result = stringifyPayloadSafe(payload);
    expect(result).toBe(expected);
    expect(result).not.toContain('\n');
  });

  it('falls back to String(payload) for undefined', () => {
    expect(stringifyPayloadSafe(undefined)).toBe('undefined');
  });

  it('falls back to String(payload) for a function payload', () => {
    const fn = function sample(): void { /* noop */ };
    const result = stringifyPayloadSafe(fn);
    expect(typeof result).toBe('string');
    expect(result).toContain('sample');
  });

  it('renders an empty object as {}', () => {
    expect(stringifyPayloadSafe({})).toBe('{}');
  });

  it('replaces a circular reference with the [Circular] placeholder', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;

    const result = stringifyPayloadSafe(circular);

    expect(result).toContain('[Circular]');
    expect(result).toContain('"name": "root"');
    expect(() => stringifyPayloadSafe(circular)).not.toThrow();
  });

  it('does not break serialisation of a sibling non-circular value', () => {
    const circular: Record<string, unknown> = { id: 'loop' };
    circular.self = circular;

    expect(stringifyPayloadSafe(circular)).toContain('[Circular]');
    expect(stringifyPayloadSafe({ id: 'fine', depth: 1 })).toContain('"id": "fine"');
  });
});

describe('formatEventLogEntry', () => {
  const headerFor = (timestamp: string, eventName: string): string =>
    `${timestamp} [${eventName}]`;

  it('renders exactly one header line followed by the pretty JSON body', () => {
    const entry = {
      timestamp: '2026-10-29T00:00:00.000Z',
      eventName: 'card:placed',
      payload: { row: 1, column: 2, card: { id: 'copper' } },
    };

    const lines = formatEventLogEntry(entry).split('\n');

    expect(lines[0]).toBe(headerFor(entry.timestamp, entry.eventName));
    expect(lines[0]).not.toContain('{');
    expect(lines.slice(1).join('\n')).toBe(stringifyPayloadSafe(entry.payload));
    expect(lines.length).toBeGreaterThan(2);
  });

  it('includes the complete payload with no 80-character truncation', () => {
    const entry = {
      timestamp: '2026-10-29T00:00:01.000Z',
      eventName: 'state-settled',
      payload: { detail: 'd'.repeat(300), nested: { deep: { value: 'tail-marker' } } },
    };

    const rendered = formatEventLogEntry(entry);

    expect(rendered).toContain('d'.repeat(300));
    expect(rendered).toContain('tail-marker');
    expect(rendered).not.toContain('...');
  });

  it('keeps the header on a single line for a primitive payload', () => {
    const rendered = formatEventLogEntry({
      timestamp: '2026-10-29T00:00:02.000Z',
      eventName: 'turn:started',
      payload: 7,
    });

    expect(rendered).toBe('2026-10-29T00:00:02.000Z [turn:started]\n7');
  });

  it('degrades safely for undefined and circular payloads without losing sibling events', () => {
    const circular: Record<string, unknown> = { kind: 'loop' };
    circular.self = circular;

    const undefinedEntry = formatEventLogEntry({
      timestamp: 't0',
      eventName: 'undefined-event',
      payload: undefined,
    });
    const circularEntry = formatEventLogEntry({
      timestamp: 't1',
      eventName: 'circular-event',
      payload: circular,
    });
    const normalEntry = formatEventLogEntry({
      timestamp: 't2',
      eventName: 'normal-event',
      payload: { ok: true },
    });

    expect(undefinedEntry).toBe('t0 [undefined-event]\nundefined');
    expect(circularEntry.split('\n')[0]).toBe('t1 [circular-event]');
    expect(circularEntry).toContain('[Circular]');
    expect(normalEntry).toBe('t2 [normal-event]\n{\n  "ok": true\n}');
  });
});

describe('widestLineLength', () => {
  it('returns the length of the longest line', () => {
    expect(widestLineLength('ab\nabcd\nc')).toBe(4);
  });

  it('ignores trailing newlines', () => {
    expect(widestLineLength('abcd\n\n\n')).toBe(4);
  });

  it('returns 0 for empty text', () => {
    expect(widestLineLength('')).toBe(0);
  });

  it('measures a pretty-printed entry by its widest payload line', () => {
    const rendered = formatEventLogEntry({
      timestamp: 'ts',
      eventName: 'evt',
      payload: { longKey: 'v'.repeat(50) },
    });

    expect(widestLineLength(rendered)).toBe('  "longKey": "'.length + 50 + 1);
  });
});
