import { describe, expect, it } from 'vitest';

import invalidAnchor from '../fixtures/layouts/main-street.invalid-anchor.layout.json';
import invalidCoordinate from '../fixtures/layouts/main-street.invalid-coordinate.layout.json';
import invalidMissingZone from '../fixtures/layouts/main-street.invalid-missing-zone.layout.json';
import invalidOverflow from '../fixtures/layouts/main-street.invalid-overflow.layout.json';
import validMainStreetLayout from '../fixtures/layouts/main-street.valid.layout.json';
import canonicalMainStreetLayout from '../../example-games/main-street/layouts/main-street.layout.json';
import {
  parseScreenLayoutDocument,
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

  it('accepts position-only zones at any valid normalized coordinate', () => {
    // Position-only zones (x, y only) cannot overflow since x and y are
    // already constrained to [0, 1] by the schema.
    const result = validateScreenLayoutDocument(invalidOverflow as ScreenLayoutDocument);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('parses valid layouts into typed documents', () => {
    const result = parseScreenLayoutDocument(validMainStreetLayout);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.layout.id).toBe('main-street-default');
    }
  });

  it('validates the canonical Main Street layout document', () => {
    const result = parseScreenLayoutDocument(canonicalMainStreetLayout);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.layout.id).toBe('main-street-canonical');
    }
  });

  it('returns structured errors for invalid parse attempts', () => {
    const result = parseScreenLayoutDocument(invalidAnchor);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.layout).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('path');
      expect(result.errors[0]).toHaveProperty('message');
    }
  });
});
