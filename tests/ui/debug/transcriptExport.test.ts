/**
 * Unit tests for the Phaser-free transcript discovery/serialisation module
 * used by the Session Export debug tool (CG-0MW3KV4D7004KCF0).
 *
 * The module resolves the active scene's transcript recorder from the
 * engine's common scene shapes — `recorder`, `transcriptRecorder` and
 * `transcript` — and serialises the transcript for download. It is Phaser-free
 * so the whole discovery contract can be pinned without a browser:
 *   - every supported property name is found,
 *   - probe order (recorder first) is honoured,
 *   - non-conforming values (arrays, numbers, missing `getTranscript`) are
 *     skipped in favour of a later conforming property,
 *   - a throwing `getTranscript()` becomes a reasoned failure,
 *   - no conforming recorder yields the documented no-recorder reason,
 *   - the serialised payload is exactly `JSON.stringify(transcript, null, 2)`.
 */

import { describe, it, expect } from 'vitest';
import {
  NO_TRANSCRIPT_REASON,
  SUPPORTED_RECORDER_PROPERTIES,
  resolveTranscript,
  serializeTranscript,
} from '../../../src/ui/debug/transcriptExport';

/** A minimal recorder-like object exposing a callable getTranscript. */
function makeRecorder(transcript: unknown): { getTranscript: () => unknown } {
  return { getTranscript: () => transcript };
}

describe('resolveTranscript', () => {
  const transcript = {
    turns: [{ player: 0, action: 'deal' }],
    events: ['deal'],
    metadata: { seed: 42 },
  };

  it('probes the documented property names in order', () => {
    expect(SUPPORTED_RECORDER_PROPERTIES).toEqual([
      'recorder',
      'transcriptRecorder',
      'transcript',
    ]);
  });

  it('finds a recorder exposed as `recorder` (GymTranscriptScene shape)', () => {
    const result = resolveTranscript({ recorder: makeRecorder(transcript) });

    expect(result).toEqual({ ok: true, transcript });
  });

  it('finds a recorder exposed as `transcriptRecorder` (TheRisingScene shape)', () => {
    const scene = { transcriptRecorder: makeRecorder(transcript) };
    expect('recorder' in scene).toBe(false);

    const result = resolveTranscript(scene);

    expect(result).toEqual({ ok: true, transcript });
  });

  it('finds a recorder exposed as `transcript`', () => {
    const result = resolveTranscript({ transcript: makeRecorder(transcript) });

    expect(result).toEqual({ ok: true, transcript });
  });

  it('prefers `recorder` over the other supported names', () => {
    const preferred = { source: 'recorder' };
    const result = resolveTranscript({
      recorder: makeRecorder(preferred),
      transcriptRecorder: makeRecorder({ source: 'transcriptRecorder' }),
    });

    expect(result).toEqual({ ok: true, transcript: preferred });
  });

  it('skips a non-conforming value in an earlier slot and finds a later recorder', () => {
    const result = resolveTranscript({
      recorder: { getTranscript: 'not-a-function' },
      transcriptRecorder: makeRecorder(transcript),
    });

    expect(result).toEqual({ ok: true, transcript });
  });

  it('skips a recorder-like object without getTranscript', () => {
    const result = resolveTranscript({
      transcriptRecorder: { turns: [], events: [] },
    });

    expect(result).toEqual({ ok: false, reason: NO_TRANSCRIPT_REASON });
  });

  it('skips a non-object property (a number) without treating it as a recorder', () => {
    const result = resolveTranscript({ recorder: 42 });

    expect(result).toEqual({ ok: false, reason: NO_TRANSCRIPT_REASON });
  });

  it('skips an array-valued property (a raw transcript list, not a recorder)', () => {
    const result = resolveTranscript({ transcript: [{ turn: 1 }] });

    expect(result).toEqual({ ok: false, reason: NO_TRANSCRIPT_REASON });
  });

  it('reports the no-recorder reason when the scene has none of the shapes', () => {
    const result = resolveTranscript({ someOtherState: { value: 1 } });

    expect(result).toEqual({ ok: false, reason: NO_TRANSCRIPT_REASON });
  });

  it('reports a reasoned failure when getTranscript throws', () => {
    const result = resolveTranscript({
      recorder: {
        getTranscript: () => {
          throw new Error('recorder exploded');
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Failed to read the transcript');
      expect(result.reason).toContain('recorder exploded');
    }
  });

  it('reports a reasoned failure when getTranscript throws a non-Error value', () => {
    const result = resolveTranscript({
      recorder: {
        getTranscript: () => {
          throw 'boom';
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Failed to read the transcript');
    }
  });
});

describe('serializeTranscript', () => {
  const transcript = {
    turns: [{ player: 0, action: 'deal', card: { id: 'copper', value: 3 } }],
    events: ['deal'],
    metadata: { seed: 42 },
  };

  it('serialises with JSON.stringify(..., null, 2) — no truncation, no field stripping', () => {
    const result = serializeTranscript(transcript);

    expect(result).toBe(JSON.stringify(transcript, null, 2));
    expect(result).toContain('\n  "turns": [');
    expect(result).toContain('\n      "action": "deal"');
    expect(result).toContain('\n      "card": {');
    expect(result).toContain('\n        "id": "copper"');
  });

  it('round-trips exactly: parsed JSON equals the original transcript', () => {
    const parsed = JSON.parse(serializeTranscript(transcript)) as unknown;
    expect(parsed).toEqual(transcript);
  });
});
