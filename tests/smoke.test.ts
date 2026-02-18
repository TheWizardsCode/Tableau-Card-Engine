import { describe, it, expect } from 'vitest';

describe('Smoke Test', () => {
  it('should verify the test framework is working', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify basic string operations', () => {
    expect('Tableau Card Engine').toContain('Card');
  });
});
