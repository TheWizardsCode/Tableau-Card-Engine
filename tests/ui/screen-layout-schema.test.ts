import { describe, expect, it } from 'vitest';

import invalidAnchor from '../fixtures/layouts/main-street.invalid-anchor.layout.json';
import invalidCoordinate from '../fixtures/layouts/main-street.invalid-coordinate.layout.json';
import invalidMissingZone from '../fixtures/layouts/main-street.invalid-missing-zone.layout.json';
import invalidOverflow from '../fixtures/layouts/main-street.invalid-overflow.layout.json';
import validMainStreetLayout from '../fixtures/layouts/main-street.valid.layout.json';
import {
  validateScreenLayoutDocument,
  type ScreenLayoutDocument,
} from '../../src/ui/screen-layout-schema';

function errorContainsPath(
  result: ReturnType<typeof validateScreenLayoutDocument>,
  pathFragment: string,
): boolean {
  return result.errors.some(error => error.path.includes(pathFragment));
}

describe('screen layout schema contract', () => {
  it('accepts a valid Main Street-aligned layout fixture', () => {
    const result = validateScreenLayoutDocument(validMainStreetLayout as ScreenLayoutDocument);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a fixture that is missing a required zone', () => {
    const result = validateScreenLayoutDocument(invalidMissingZone as ScreenLayoutDocument);

    expect(result.valid).toBe(false);
    expect(errorContainsPath(result, '/zones/market')).toBe(true);
  });

  it('rejects a fixture with an invalid anchor coordinate', () => {
    const result = validateScreenLayoutDocument(invalidAnchor as ScreenLayoutDocument);

    expect(result.valid).toBe(false);
    expect(
      errorContainsPath(result, '/zones/market/anchors/offscreenAnchor/x'),
    ).toBe(true);
  });

  it('rejects a fixture with out-of-bounds normalized coordinates', () => {
    const result = validateScreenLayoutDocument(invalidCoordinate as ScreenLayoutDocument);

    expect(result.valid).toBe(false);
    expect(errorContainsPath(result, '/zones/market/rect/x')).toBe(true);
  });

  it('rejects a zone rectangle that overflows normalized bounds', () => {
    const result = validateScreenLayoutDocument(invalidOverflow as ScreenLayoutDocument);

    expect(result.valid).toBe(false);
    expect(errorContainsPath(result, '/zones/market/rect')).toBe(true);
  });
});
