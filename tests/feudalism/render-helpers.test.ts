import { describe, expect, it } from 'vitest';

import {
  buildTokenEntries,
  getBonusRenderOrder,
  getTokenRenderOrder,
} from '../../example-games/feudalism/scenes/FeudalismRenderHelpers';

describe('FeudalismRenderHelpers', () => {
  it('returns token render order in default and reversed form', () => {
    const normal = getTokenRenderOrder(false);
    const reversed = getTokenRenderOrder(true);

    expect(normal[0]).toBe('oats');
    expect(normal[normal.length - 1]).toBe('mead');
    expect(reversed[0]).toBe('mead');
  });

  it('returns bonus render order in default and reversed form', () => {
    const normal = getBonusRenderOrder(false);
    const reversed = getBonusRenderOrder(true);

    expect(normal[0]).toBe('oats');
    expect(reversed[0]).toBe('turnip');
  });

  it('builds only non-zero token entries in the supplied order', () => {
    const entries = buildTokenEntries(
      { oats: 2, mead: 1, barley: 0 },
      ['mead', 'oats', 'barley'],
    );

    expect(entries).toEqual([
      { color: 'mead', count: 1 },
      { color: 'oats', count: 2 },
    ]);
  });
});
