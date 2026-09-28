import { describe, expect, it } from 'vitest';
describe('deliberately failing TAP fixture', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
