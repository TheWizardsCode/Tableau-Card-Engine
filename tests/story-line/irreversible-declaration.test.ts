/**
 * Irreversible declaration seam (CG-0MWUQQAEW0078270, G5 child 1).
 *
 * The engine used to have no notion of an irreversible resource key: the
 * promise "nothing ever grants `hull` back" lived in authoring discipline and
 * one fixture test. This suite pins the **declarative foundation** the later
 * refusal rules build on:
 *
 * - a projection carries its never-restored keys (`irreversible`), in
 *   declaration order, defaulting to `[]` so a game that declares none is
 *   byte-identical to before;
 * - the content adapter carries the authoring declaration
 *   (`irreversibleResources`), and the shipped Long Erasure adapter declares
 *   `hull`;
 * - the manifest is the authoritative source: the episode-runner wiring
 *   derives the projection's declaration from `resources.irreversible`, so a
 *   manifest-declared key reaches the engine seam;
 * - the three declarations cannot drift silently: a divergence is reported
 *   (and the deriving helper fails closed when it is given an adapter).
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  auditIrreversibleDeclaration,
  createEpisodeResourceProjection,
  createResourceProjection,
  type StorylineResourceField,
} from '../../src/story-line';
import {
  GYM_CONTENT_ADAPTER,
  LONG_ERASURE_CONTENT_ADAPTER,
} from '../../src/story-line/content/adapters';
import type { EpisodeManifest } from '../../src/story-line/content/episode-manifest';
import { REPO_ROOT } from './helpers/episode-fixture';

/** Repository-relative path of the committed Long Erasure episode manifest. */
const LONG_ERASURE_MANIFEST_PATH =
  'example-games/gym/content/long-erasure-episode.json' as const;

/** The fixture game's state: two reversible keys and one irreversible key. */
interface HullState {
  hull: number;
  morale: number;
  stores: number;
}

/** A declarative read/mutate pair for one state field. */
function field(key: keyof HullState): StorylineResourceField<HullState> {
  return {
    read: (state) => state[key],
    apply: (state, delta) => {
      state[key] += delta;
    },
  };
}

/** The fixture game's field map (the projection's declared key set). */
function hullFields(): Readonly<Record<keyof HullState, StorylineResourceField<HullState>>> {
  return {
    hull: field('hull'),
    morale: field('morale'),
    stores: field('stores'),
  };
}

/** Reads the committed Long Erasure manifest as data (never re-derived). */
function longErasureManifest(): EpisodeManifest {
  return JSON.parse(
    readFileSync(resolve(REPO_ROOT, LONG_ERASURE_MANIFEST_PATH), 'utf-8'),
  ) as EpisodeManifest;
}

/** A manifest-shaped object with the given irreversible declaration. */
function manifestWithIrreversible(
  irreversible: readonly string[],
): EpisodeManifest {
  const manifest = longErasureManifest();
  return {
    ...manifest,
    resources: { ...manifest.resources, irreversible: [...irreversible] },
  };
}

describe('projection irreversible declaration', () => {
  it('carries the declared never-restored keys in declaration order', () => {
    const projection = createResourceProjection<HullState>(hullFields(), {
      irreversible: ['hull'],
    });

    expect(projection.irreversible).toEqual(['hull']);
    // The declared resource set is untouched by the new option.
    expect(projection.resources).toEqual(['hull', 'morale', 'stores']);
  });

  it('preserves multi-key declaration order and normalises the declaration', () => {
    const projection = createResourceProjection<HullState>(hullFields(), {
      irreversible: [' morale ', 'hull', 'morale', ''],
    });

    expect(projection.irreversible).toEqual(['morale', 'hull']);
  });

  it('declares nothing when no option is supplied', () => {
    const projection = createResourceProjection<HullState>(hullFields());

    expect(projection.irreversible).toEqual([]);
  });

  it('declares nothing for an empty declaration', () => {
    const projection = createResourceProjection<HullState>(hullFields(), {
      irreversible: [],
    });

    expect(projection.irreversible).toEqual([]);
  });

  it('leaves read and mutate behaviour unchanged', () => {
    const projection = createResourceProjection<HullState>(hullFields(), {
      irreversible: ['hull'],
    });
    const state: HullState = { hull: 5, morale: 2, stores: 0 };

    expect(projection.getResources(state)).toEqual({
      hull: 5,
      morale: 2,
      stores: 0,
    });

    projection.applyResourceDelta(state, { hull: -1, morale: 3, unknown: 9 });

    expect(state).toEqual({ hull: 4, morale: 5, stores: 0 });
  });
});

describe('content-adapter irreversible declaration', () => {
  it('declares hull irreversible on the shipped Long Erasure adapter', () => {
    expect(LONG_ERASURE_CONTENT_ADAPTER.irreversibleResources).toEqual(['hull']);
  });

  it('leaves an adapter that declares no irreversible key undeclared', () => {
    expect(GYM_CONTENT_ADAPTER.irreversibleResources).toBeUndefined();
  });
});

describe('manifest-to-projection wiring', () => {
  it('derives the projection declaration from the manifest', () => {
    const manifest = longErasureManifest();
    // The committed manifest is the authoritative declaration under test.
    expect(manifest.resources.irreversible).toEqual(['hull']);

    const projection = createEpisodeResourceProjection(manifest, hullFields());

    expect(projection.irreversible).toEqual(['hull']);
    expect(projection.resources).toEqual(['hull', 'morale', 'stores']);
  });

  it('declares nothing when the manifest declares nothing', () => {
    const projection = createEpisodeResourceProjection(
      manifestWithIrreversible([]),
      hullFields(),
    );

    expect(projection.irreversible).toEqual([]);
  });

  it('accepts an agreeing adapter declaration', () => {
    expect(() =>
      createEpisodeResourceProjection(longErasureManifest(), hullFields(), {
        adapter: LONG_ERASURE_CONTENT_ADAPTER,
      }),
    ).not.toThrow();
  });

  it('fails closed when the adapter declaration diverges from the manifest', () => {
    expect(() =>
      createEpisodeResourceProjection(longErasureManifest(), hullFields(), {
        adapter: { irreversibleResources: [] },
      }),
    ).toThrow(/hull/);
  });
});

describe('single authoritative declaration', () => {
  const manifest = manifestWithIrreversible(['hull']);
  const agreeingProjection = createResourceProjection<HullState>(hullFields(), {
    irreversible: ['hull'],
  });

  it('reports agreement when every declaration matches the manifest', () => {
    const audit = auditIrreversibleDeclaration({
      manifest,
      adapter: { irreversibleResources: ['hull'] },
      projection: agreeingProjection,
    });

    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
    expect(audit.manifest).toEqual(['hull']);
    expect(audit.adapter).toEqual(['hull']);
    expect(audit.projection).toEqual(['hull']);
  });

  it('reports an adapter that omits an authoritative irreversible key', () => {
    const audit = auditIrreversibleDeclaration({
      manifest,
      adapter: { irreversibleResources: [] },
      projection: agreeingProjection,
    });

    expect(audit.ok).toBe(false);
    expect(audit.issues).toEqual([
      expect.objectContaining({
        source: 'adapter',
        reason: 'missing',
        key: 'hull',
      }),
    ]);
    expect(audit.issues[0]?.message).toContain('hull');
  });

  it('reports an adapter that declares a key the manifest does not', () => {
    const audit = auditIrreversibleDeclaration({
      manifest,
      adapter: { irreversibleResources: ['hull', 'stores'] },
      projection: agreeingProjection,
    });

    expect(audit.ok).toBe(false);
    expect(audit.issues).toEqual([
      expect.objectContaining({
        source: 'adapter',
        reason: 'undeclared',
        key: 'stores',
      }),
    ]);
  });

  it('surfaces an adapter/projection divergence rather than accepting it', () => {
    // The adapter declares hull irreversible; the projection declares none.
    // The manifest agrees with the adapter, so the projection is the outlier.
    const audit = auditIrreversibleDeclaration({
      manifest,
      adapter: { irreversibleResources: ['hull'] },
      projection: createResourceProjection<HullState>(hullFields()),
    });

    expect(audit.ok).toBe(false);
    expect(audit.issues).toEqual([
      expect.objectContaining({
        source: 'projection',
        reason: 'missing',
        key: 'hull',
      }),
    ]);
  });

  it('reports a projection declaration its own resource set cannot carry', () => {
    const audit = auditIrreversibleDeclaration({
      manifest: manifestWithIrreversible(['hull', 'morale']),
      projection: createResourceProjection<HullState>(
        { hull: field('hull'), stores: field('stores') },
        { irreversible: ['hull', 'morale'] },
      ),
    });

    expect(audit.ok).toBe(false);
    expect(audit.issues).toEqual([
      expect.objectContaining({
        source: 'projection',
        reason: 'not-projected',
        key: 'morale',
      }),
    ]);
  });

  it('treats an omitted declaration as "declares none"', () => {
    const audit = auditIrreversibleDeclaration({
      manifest: manifestWithIrreversible([]),
    });

    expect(audit.ok).toBe(true);
    expect(audit.adapter).toEqual([]);
    expect(audit.projection).toEqual([]);
  });
});
