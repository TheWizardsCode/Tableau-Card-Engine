/**
 * Unit coverage for the Electron smoke-test error correlation
 * (CG-0MUX17L47000O4CE, AC2).
 *
 * Chromium's console message for a failed resource load is URL-less
 * (`Failed to load resource: net::ERR_FILE_NOT_FOUND`), so the smoke test
 * must correlate it with the separately captured `failedRequests` stream to
 * distinguish the known-benign missing `thumbnail.png` from a genuine missing
 * asset. These tests exercise that correlation directly, without launching
 * Electron.
 */
import { describe, it, expect } from 'vitest';

import {
  classifySmokeErrors,
  hasFatalSmokeErrors,
  BENIGN_REQUEST_PATTERN,
} from './smoke-error-classifier';

/** Chromium's generic, URL-less failed-load console text. */
const GENERIC_LOAD_ERROR = 'Failed to load resource: net::ERR_FILE_NOT_FOUND';

const THUMBNAIL_URL = 'file:///app/assets/games/blackjack/thumbnail.png';
const AUDIO_URL = 'file:///app/assets/audio/card-deal.wav';

describe('classifySmokeErrors', () => {
  it('treats a thumbnail-only failure as benign (passes)', () => {
    const report = classifySmokeErrors([GENERIC_LOAD_ERROR], [THUMBNAIL_URL]);

    expect(report.fatalRequests).toEqual([]);
    expect(report.fatalErrors).toEqual([]);
    expect(report.benignRequests).toEqual([THUMBNAIL_URL]);
    expect(report.benignErrors).toEqual([GENERIC_LOAD_ERROR]);
    expect(hasFatalSmokeErrors(report)).toBe(false);
  });

  it('treats a genuine missing non-thumbnail asset as fatal (fails)', () => {
    const report = classifySmokeErrors([GENERIC_LOAD_ERROR], [AUDIO_URL]);

    expect(report.fatalRequests).toEqual([AUDIO_URL]);
    expect(hasFatalSmokeErrors(report)).toBe(true);
  });

  it('fails when a genuine missing asset accompanies a benign thumbnail', () => {
    const report = classifySmokeErrors(
      [GENERIC_LOAD_ERROR],
      [THUMBNAIL_URL, AUDIO_URL],
    );

    // The single generic console error may be attributed to the thumbnail,
    // but the non-benign failed request must still fail the session.
    expect(report.fatalRequests).toEqual([AUDIO_URL]);
    expect(hasFatalSmokeErrors(report)).toBe(true);
  });

  it('accounts for one benign request per URL-less console error', () => {
    const secondThumbnail = 'file:///app/assets/games/golf/thumbnail.png';
    const report = classifySmokeErrors(
      [GENERIC_LOAD_ERROR, GENERIC_LOAD_ERROR],
      [THUMBNAIL_URL, secondThumbnail],
    );

    expect(report.fatalErrors).toEqual([]);
    expect(report.benignErrors).toHaveLength(2);
    expect(hasFatalSmokeErrors(report)).toBe(false);
  });

  it('treats an unexplained URL-less load error as fatal', () => {
    const report = classifySmokeErrors([GENERIC_LOAD_ERROR], []);

    expect(report.fatalErrors).toEqual([GENERIC_LOAD_ERROR]);
    expect(hasFatalSmokeErrors(report)).toBe(true);
  });

  it('treats surplus URL-less load errors beyond the benign budget as fatal', () => {
    const report = classifySmokeErrors(
      [GENERIC_LOAD_ERROR, GENERIC_LOAD_ERROR],
      [THUMBNAIL_URL],
    );

    expect(report.benignErrors).toEqual([GENERIC_LOAD_ERROR]);
    expect(report.fatalErrors).toEqual([GENERIC_LOAD_ERROR]);
    expect(hasFatalSmokeErrors(report)).toBe(true);
  });

  it('treats a genuine JavaScript error as fatal', () => {
    const report = classifySmokeErrors(
      ['Uncaught ReferenceError: bootGame is not defined'],
      [],
    );

    expect(report.fatalErrors).toEqual([
      'Uncaught ReferenceError: bootGame is not defined',
    ]);
    expect(hasFatalSmokeErrors(report)).toBe(true);
  });

  it('attributes an error naming a benign URL to the benign request', () => {
    const report = classifySmokeErrors(
      [`Failed to load resource: ${THUMBNAIL_URL}`],
      [THUMBNAIL_URL],
    );

    expect(report.fatalErrors).toEqual([]);
    expect(report.benignErrors).toHaveLength(1);
  });

  it('ignores unrelated console errors that match no fatal pattern', () => {
    const report = classifySmokeErrors(['Download the React DevTools'], []);

    expect(report.fatalErrors).toEqual([]);
    expect(report.benignErrors).toEqual([]);
    expect(hasFatalSmokeErrors(report)).toBe(false);
  });
});

describe('BENIGN_REQUEST_PATTERN', () => {
  it('matches thumbnail URLs only', () => {
    expect(BENIGN_REQUEST_PATTERN.test(THUMBNAIL_URL)).toBe(true);
    expect(BENIGN_REQUEST_PATTERN.test(AUDIO_URL)).toBe(false);
  });
});
