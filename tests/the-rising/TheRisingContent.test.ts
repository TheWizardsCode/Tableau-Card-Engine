import { describe, expect, it } from 'vitest';
import {
  ERAS,
  REQUIRED_SPIRITS_PER_ERA,
  REQUIRED_TESTIMONIES_PER_SPIRIT,
  ROSTER,
  SOURCES,
  SPIRITS,
  getSpiritsByEra,
  seedToNumber,
  selectSpirits,
  validateRoster,
  type Era,
  type Spirit,
} from '../../src/TheRisingContent';

type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;
type MutableRoster = DeepMutable<{ eras: readonly Era[]; spirits: readonly Spirit[] }>;

function mutableRoster(): MutableRoster {
  return JSON.parse(JSON.stringify({ eras: ERAS, spirits: SPIRITS })) as MutableRoster;
}

function errorCodes(result: ReturnType<typeof validateRoster>): string[] {
  return result.errors.map((error) => error.code);
}

describe('TheRisingContent — roster completeness (AC1, AC5)', () => {
  it('defines seven era chapters', () => {
    expect(ERAS).toHaveLength(7);
    expect(new Set(ERAS.map((era) => era.id)).size).toBe(7);
  });

  it('provides at least three spirits in every era and at least 21 overall', () => {
    for (const era of ERAS) {
      expect(
        era.spiritIds.length,
        `era "${era.id}" must define at least ${REQUIRED_SPIRITS_PER_ERA} spirits`,
      ).toBeGreaterThanOrEqual(REQUIRED_SPIRITS_PER_ERA);
    }
    expect(SPIRITS.length).toBeGreaterThanOrEqual(ERAS.length * REQUIRED_SPIRITS_PER_ERA);
    expect(SPIRITS.length).toBeGreaterThanOrEqual(21);
  });

  it('gives every spirit a name, date range, era, reference and testimonies', () => {
    for (const spirit of SPIRITS) {
      expect(spirit.id.length, `spirit id for "${spirit.name}"`).toBeGreaterThan(0);
      expect(spirit.name.trim().length, `name for "${spirit.id}"`).toBeGreaterThan(0);
      expect(spirit.commonName.trim().length, `common name for "${spirit.id}"`).toBeGreaterThan(0);
      expect(spirit.summary.trim().length, `summary for "${spirit.id}"`).toBeGreaterThan(0);
      expect(spirit.dateRange.from, `from for "${spirit.id}"`).toBeLessThanOrEqual(spirit.dateRange.to);
      expect(spirit.dateRange.label.trim().length, `date label for "${spirit.id}"`).toBeGreaterThan(0);
      expect(spirit.primaryReference.id.length, `primary reference for "${spirit.id}"`).toBeGreaterThan(0);
      expect(spirit.testimonies.length).toBeGreaterThanOrEqual(REQUIRED_TESTIMONIES_PER_SPIRIT);
    }
  });

  it('lists every spirit in exactly one era, with no orphans', () => {
    const eraMembership = new Map<string, number>();
    for (const era of ERAS) {
      for (const spiritId of era.spiritIds) {
        eraMembership.set(spiritId, (eraMembership.get(spiritId) ?? 0) + 1);
      }
    }
    for (const spirit of SPIRITS) {
      expect(eraMembership.get(spirit.id), `spirit "${spirit.id}" must appear in one era`).toBe(1);
    }
    for (const spiritId of eraMembership.keys()) {
      expect(SPIRITS.some((spirit) => spirit.id === spiritId), `era references unknown "${spiritId}"`).toBe(true);
    }
  });

  it('declares each era spirit id in non-decreasing chronological order', () => {
    const byId = new Map(SPIRITS.map((spirit) => [spirit.id, spirit]));
    for (const era of ERAS) {
      const fromYears = era.spiritIds.map((id) => byId.get(id)?.dateRange.from ?? Number.NaN);
      for (let index = 1; index < fromYears.length; index += 1) {
        expect(fromYears[index], `era "${era.id}" order`).toBeGreaterThanOrEqual(fromYears[index - 1]);
      }
    }
  });

  it('passes its own validator with no errors', () => {
    const result = validateRoster(ROSTER);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('TheRisingContent — source attribution (AC4)', () => {
  it('records well-formed sources keyed by their id', () => {
    const sources = Object.entries(SOURCES);
    expect(sources.length).toBeGreaterThan(0);
    for (const [key, source] of sources) {
      expect(source.id).toBe(key);
      expect(source.title.trim().length, `title for "${key}"`).toBeGreaterThan(0);
      expect(source.author.trim().length, `author for "${key}"`).toBeGreaterThan(0);
      expect(Number.isFinite(source.year), `year for "${key}"`).toBe(true);
      expect(['book', 'paper', 'archive']).toContain(source.kind);
    }
  });

  it('resolves every spirit reference and testimony citation', () => {
    for (const spirit of SPIRITS) {
      expect(SOURCES[spirit.primaryReference.id], `primary source for "${spirit.id}"`).toBeDefined();
      for (const [index, testimony] of spirit.testimonies.entries()) {
        expect(
          SOURCES[testimony.source.id],
          `testimony ${index} source for "${spirit.id}"`,
        ).toBeDefined();
      }
    }
  });

  it('cites every recorded source at least once (no orphan citations)', () => {
    const cited = new Set<string>();
    for (const spirit of SPIRITS) {
      cited.add(spirit.primaryReference.id);
      for (const testimony of spirit.testimonies) {
        cited.add(testimony.source.id);
      }
    }
    for (const sourceId of Object.keys(SOURCES)) {
      expect(cited.has(sourceId), `source "${sourceId}" is never cited`).toBe(true);
    }
  });

  it('flags a spirit with a missing or unknown primary reference', () => {
    const missing = mutableRoster();
    missing.spirits[0].primaryReference = { id: '' };
    expect(errorCodes(validateRoster(missing))).toContain('missing-primary-reference');

    const unknown = mutableRoster();
    unknown.spirits[0].primaryReference = { id: 'not-a-source' };
    expect(errorCodes(validateRoster(unknown))).toContain('unknown-source');
  });
});

describe('TheRisingContent — testimony structure (AC2, AC5)', () => {
  it('gives every testimony a question, an answer and a source citation', () => {
    for (const spirit of SPIRITS) {
      for (const [index, testimony] of spirit.testimonies.entries()) {
        expect(testimony.question.trim(), `question ${index} for "${spirit.id}"`).not.toBe('');
        expect(testimony.question.trim().endsWith('?'), `question ${index} for "${spirit.id}"`).toBe(true);
        expect(testimony.answer.trim().length, `answer ${index} for "${spirit.id}"`).toBeGreaterThan(20);
        expect(testimony.source.id.trim().length, `source ${index} for "${spirit.id}"`).toBeGreaterThan(0);
      }
    }
  });

  it('flags too few testimonies', () => {
    const roster = mutableRoster();
    roster.spirits[0].testimonies = roster.spirits[0].testimonies.slice(0, 2);
    expect(errorCodes(validateRoster(roster))).toContain('too-few-testimonies');
  });

  it('flags an empty question or answer', () => {
    const roster = mutableRoster();
    roster.spirits[0].testimonies[0].question = '   ';
    expect(errorCodes(validateRoster(roster))).toContain('invalid-testimony');
  });

  it('flags a testimony with no source citation', () => {
    const roster = mutableRoster();
    roster.spirits[0].testimonies[0].source = { id: '' };
    expect(errorCodes(validateRoster(roster))).toContain('missing-testimony-source');
  });

  it('flags a testimony citing an unknown source', () => {
    const roster = mutableRoster();
    roster.spirits[0].testimonies[0].source = { id: 'ghost-source' };
    expect(errorCodes(validateRoster(roster))).toContain('unknown-source');
  });
});

describe('TheRisingContent — date and identity validation (AC2, AC5)', () => {
  it('flags an era whose spirits are out of chronological order', () => {
    const roster = mutableRoster();
    const era = roster.eras[0];
    era.spiritIds = [...era.spiritIds].reverse();
    expect(errorCodes(validateRoster(roster))).toContain('era-dates-not-chronological');
  });

  it('flags an inverted date range', () => {
    const roster = mutableRoster();
    roster.spirits[0].dateRange = { from: 1200, to: 1100, label: '1200–1100' };
    expect(errorCodes(validateRoster(roster))).toContain('invalid-date-range');
  });

  it('flags duplicate spirit ids', () => {
    const roster = mutableRoster();
    roster.spirits[1].id = roster.spirits[0].id;
    expect(errorCodes(validateRoster(roster))).toContain('duplicate-id');
  });

  it('flags duplicate era ids', () => {
    const roster = mutableRoster();
    roster.eras[1].id = roster.eras[0].id;
    expect(errorCodes(validateRoster(roster))).toContain('duplicate-era-id');
  });

  it('flags an empty name', () => {
    const roster = mutableRoster();
    roster.spirits[0].name = '   ';
    expect(errorCodes(validateRoster(roster))).toContain('empty-name');
  });

  it('flags an era with too few spirits', () => {
    const roster = mutableRoster();
    roster.eras[0].spiritIds = roster.eras[0].spiritIds.slice(0, 2);
    expect(errorCodes(validateRoster(roster))).toContain('era-too-few-spirits');
  });

  it('flags a spirit bound to an unknown era', () => {
    const roster = mutableRoster();
    roster.spirits[0].eraId = 'no-such-era';
    expect(errorCodes(validateRoster(roster))).toContain('unknown-era');
  });

  it('flags an empty roster', () => {
    expect(validateRoster({ eras: [], spirits: [] }).ok).toBe(false);
    expect(errorCodes(validateRoster({ eras: [], spirits: [] }))).toContain('empty-roster');
  });
});

describe('TheRisingContent — deterministic roster loading (AC3, AC5)', () => {
  it('returns the grouped spirits of an era in declared order', () => {
    for (const era of ERAS) {
      expect(getSpiritsByEra(era.id).map((spirit) => spirit.id)).toEqual([...era.spiritIds]);
    }
    expect(getSpiritsByEra('missing-era')).toEqual([]);
  });

  it('draws the same subset for the same seed', () => {
    const first = selectSpirits(2024, 7).map((spirit) => spirit.id);
    const second = selectSpirits(2024, 7).map((spirit) => spirit.id);
    expect(first).toEqual(second);
    expect(first).toHaveLength(7);
  });

  it('draws the same subset for the same string seed', () => {
    const first = selectSpirits('rising-1916', 5).map((spirit) => spirit.id);
    const second = selectSpirits('rising-1916', 5).map((spirit) => spirit.id);
    expect(first).toEqual(second);
  });

  it('produces different subsets for different seeds', () => {
    const first = selectSpirits(1, 6).map((spirit) => spirit.id);
    const second = selectSpirits(2, 6).map((spirit) => spirit.id);
    expect(first).not.toEqual(second);
  });

  it('returns unique spirits drawn only from the roster', () => {
    const rosterIds = new Set(SPIRITS.map((spirit) => spirit.id));
    const drawn = selectSpirits(99, 10);
    expect(drawn).toHaveLength(10);
    expect(new Set(drawn.map((spirit) => spirit.id)).size).toBe(10);
    for (const spirit of drawn) {
      expect(rosterIds.has(spirit.id)).toBe(true);
    }
  });

  it('does not mutate the source roster', () => {
    const before = SPIRITS.map((spirit) => spirit.id);
    selectSpirits(12345, SPIRITS.length);
    expect(SPIRITS.map((spirit) => spirit.id)).toEqual(before);
  });

  it('clamps the requested count to the roster bounds', () => {
    expect(selectSpirits(5, 0)).toEqual([]);
    expect(selectSpirits(5, -3)).toEqual([]);
    expect(selectSpirits(5, SPIRITS.length + 100)).toHaveLength(SPIRITS.length);
  });

  it('hashes seeds deterministically to a 32-bit integer', () => {
    expect(seedToNumber('rising-1916')).toBe(seedToNumber('rising-1916'));
    expect(seedToNumber('rising-1916')).not.toBe(seedToNumber('rising-1619'));
    expect(Number.isInteger(seedToNumber('rising-1916'))).toBe(true);
    expect(seedToNumber(42)).toBe(42);
    expect(seedToNumber(42.9)).toBe(42);
  });
});
