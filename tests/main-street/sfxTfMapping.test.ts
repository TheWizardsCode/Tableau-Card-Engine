import { describe, expect, it } from 'vitest';

import { MAIN_STREET_TF_SFX_MAPPING } from '../../example-games/main-street/sfx-tf-mapping';

describe('Main Street tf SFX mapping', () => {
  it('maps transfer-family logical keys to dedicated tf factories', () => {
    expect(MAIN_STREET_TF_SFX_MAPPING['sfx-business-start']).toBe('construction-hammer');
    expect(MAIN_STREET_TF_SFX_MAPPING['sfx-business-end']).toBe('construction-saw');
    expect(MAIN_STREET_TF_SFX_MAPPING['sfx-upgrade-start']).toBe('construction-lite-hammer');
    expect(MAIN_STREET_TF_SFX_MAPPING['sfx-upgrade-end']).toBe('construction-lite-saw');
    expect(MAIN_STREET_TF_SFX_MAPPING['sfx-event-cheer']).toBe('crowd-cheer');
  });

  it('includes all sfx- prefix keys', () => {
    const keys = Object.keys(MAIN_STREET_TF_SFX_MAPPING);
    expect(keys.every(k => k.startsWith('sfx-'))).toBe(true);
  });
});
