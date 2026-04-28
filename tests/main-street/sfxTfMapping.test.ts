import { describe, expect, it } from 'vitest';

import { MAIN_STREET_TF_SFX_MAPPING } from '../../example-games/main-street/sfx-tf-mapping';

describe('Main Street tf SFX mapping', () => {
  it('maps transfer-family logical keys to dedicated tf factories', () => {
    expect(MAIN_STREET_TF_SFX_MAPPING['ms-business-start']).toBe('construction-hammer');
    expect(MAIN_STREET_TF_SFX_MAPPING['ms-business-end']).toBe('construction-saw');
    expect(MAIN_STREET_TF_SFX_MAPPING['ms-upgrade-start']).toBe('construction-lite-hammer');
    expect(MAIN_STREET_TF_SFX_MAPPING['ms-upgrade-end']).toBe('construction-lite-saw');
    expect(MAIN_STREET_TF_SFX_MAPPING['ms-event-cheer']).toBe('crowd-cheer');
  });
});
