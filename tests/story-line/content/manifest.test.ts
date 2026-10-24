/**
 * Story-line manifest and Mermaid rendering tests.
 *
 * The manifest is the editor's view-model source and its committed artefacts
 * are drift-guarded, so the important properties are: the documented shape,
 * byte-identical determinism (including input-order independence), cycle
 * marking, per-story-line filtering, and agreement between the generator and
 * the committed artefacts / JSON schema.
 *
 * @module
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv from 'ajv';
import { afterAll, describe, expect, it } from 'vitest';

import { GYM_CONTENT_ADAPTER } from '../../../src/story-line/content/adapters';
import { cardsFromCsv, parseCsv } from '../../../src/story-line/content/csv';
import {
  briefEventDescription,
  buildStorylineManifest,
  buildStorylineManifestFromCsv,
  describeChoiceRouting,
  describeEventImpact,
  filterManifestByStoryline,
  nodeLabel,
  renderMermaid,
  serialiseManifest,
} from '../../../src/story-line/content/manifest';
import { runStorylineGraphCli } from '../../../scripts/storyline-graph';
import { TAVERN_CONTENT_ADAPTER } from './fixture-adapter';
import {
  GYM_CONTENT_PATH,
  MANIFEST_SCHEMA_PATH,
  makeTempDir,
  readFixture,
  readText,
  captureOutput,
} from './test-support';

const gymManifest = buildStorylineManifestFromCsv(
  readText(GYM_CONTENT_PATH),
  GYM_CONTENT_ADAPTER,
);

const tempDir = makeTempDir();
afterAll(() => tempDir.cleanup());

describe('buildStorylineManifest', () => {
  it('produces the documented node/edge/story-line shape', () => {
    expect(gymManifest.version).toBe(1);
    expect(gymManifest.gameId).toBe('gym');
    expect(gymManifest.storylineIds).toEqual(['gym-story']);
    expect(gymManifest.cycles).toEqual([]);

    expect(gymManifest.nodes.map((node) => node.id)).toEqual([
      'gym-story-end',
      'gym-story-ignore',
      'gym-story-invest',
      'gym-story-start',
    ]);

    const start = gymManifest.nodes.find((node) => node.id === 'gym-story-start');
    expect(start).toMatchObject({
      name: 'Town Meeting',
      storylineId: 'gym-story',
      storylineTitle: 'Gym Storyline',
      hasChoices: true,
      optionCount: 2,
      effect: 'Lose 50 coins',
      impact: '−50 coins',
    });
    expect(start?.options).toEqual([
      { label: 'Invest', successorIds: ['gym-story-invest'], effectPolicy: 'apply' },
      { label: 'Ignore', successorIds: ['gym-story-ignore'], effectPolicy: 'apply' },
    ]);

    const end = gymManifest.nodes.find((node) => node.id === 'gym-story-end');
    expect(end).toMatchObject({ hasChoices: false, optionCount: 0, impact: '+60 reputation' });

    // One edge per candidate; terminal options become a null-target edge.
    expect(gymManifest.edges).toHaveLength(6);
    expect(gymManifest.edges.filter((edge) => edge.to === null)).toHaveLength(2);
    expect(
      gymManifest.edges.filter((edge) => edge.from === 'gym-story-start').map((edge) => [
        edge.label,
        edge.to,
        edge.random,
      ]),
    ).toEqual([
      ['Ignore', 'gym-story-ignore', false],
      ['Invest', 'gym-story-invest', false],
    ]);
  });

  it('marks random candidate branches', () => {
    const csv = [
      'id,name,effect,options,hasChoices,acceptNextCardId,rejectNextCardId,storylineId,storylineTitle,trigger,cost,coinDelta,reputationDelta',
      'evt-a,Event A,Text,"Gamble|evt-b,evt-c",false,,,arc,Arc,Incident,0,0,0',
      'evt-b,Event B,Text,,false,,,arc,Arc,Incident,0,0,0',
      'evt-c,Event C,Text,,false,,,arc,Arc,Incident,0,0,0',
    ].join('\n');
    const manifest = buildStorylineManifestFromCsv(`${csv}\n`, GYM_CONTENT_ADAPTER);
    const branches = manifest.edges.filter((edge) => edge.from === 'evt-a');
    expect(branches.map((edge) => [edge.to, edge.random, edge.candidateIndex])).toEqual([
      ['evt-b', true, 0],
      ['evt-c', true, 1],
    ]);
  });

  it('is deterministic and independent of input card order', () => {
    const first = serialiseManifest(gymManifest);
    const second = serialiseManifest(
      buildStorylineManifestFromCsv(readText(GYM_CONTENT_PATH), GYM_CONTENT_ADAPTER),
    );
    expect(second).toBe(first);

    const reversed = cardsFromCsv(parseCsv(readText(GYM_CONTENT_PATH)), GYM_CONTENT_ADAPTER).reverse();
    expect(serialiseManifest(buildStorylineManifest(reversed, GYM_CONTENT_ADAPTER))).toBe(first);
  });

  it('records cycles as a first-class shape and marks their edges', () => {
    const manifest = buildStorylineManifestFromCsv(
      readFixture('tavern-cycle.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    expect(manifest.cycles).toEqual([['tav-loop-a', 'tav-loop-b']]);
    expect(manifest.edges.every((edge) => edge.cycle)).toBe(true);
    expect(manifest.edges.map((edge) => edge.label).sort()).toEqual(['Again', 'Back']);
  });
});

describe('filterManifestByStoryline', () => {
  it('keeps only the requested story-line nodes, edges and cycles', () => {
    const filtered = filterManifestByStoryline(gymManifest, 'gym-story');
    expect(filtered.storylineIds).toEqual(['gym-story']);
    expect(filtered.nodes).toHaveLength(gymManifest.nodes.length);
    expect(filtered.edges).toHaveLength(gymManifest.edges.length);
    expect(filtered.cycles).toEqual([]);
  });

  it('returns an empty graph for an unknown story-line', () => {
    const filtered = filterManifestByStoryline(gymManifest, 'no-such-arc');
    expect(filtered.nodes).toEqual([]);
    expect(filtered.edges).toEqual([]);
    expect(filtered.storylineIds).toEqual(['no-such-arc']);
  });
});

describe('rendering helpers', () => {
  it('renders choice cards as diamonds, plain cards as rounded boxes and terminal ends', () => {
    const mermaid = renderMermaid(gymManifest);
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toMatch(/gym_story_start\{"Town Meeting<br\/>gym-story-start/);
    expect(mermaid).toMatch(/gym_story_end\("/);
    expect(mermaid).toContain('gym_story_start -->|Invest| gym_story_invest');
    expect(mermaid).toContain('_end(["end"])');
    expect(mermaid).not.toContain('Intentional cycle');
  });

  it('marks cycle edges with a thickened arrow and lists the cycle', () => {
    const manifest = buildStorylineManifestFromCsv(
      readFixture('tavern-cycle.csv'),
      TAVERN_CONTENT_ADAPTER,
    );
    const mermaid = renderMermaid(manifest);
    expect(mermaid).toContain('tav_loop_a ==>|Again| tav_loop_b');
    expect(mermaid).toContain('%% Intentional cycle(s):');
    expect(mermaid).toContain('%% tav-loop-a -> tav-loop-b -> tav-loop-a');
  });

  it('builds a node label from the name, id, brief effect and impact', () => {
    const node = gymManifest.nodes.find((entry) => entry.id === 'gym-story-start');
    expect(node && nodeLabel(node)).toBe(
      'Town Meeting<br/>gym-story-start<br/>Lose 50 coins<br/>−50 coins',
    );
    expect(node && describeEventImpact(node)).toBe('−50 coins');
  });

  it('truncates a long effect at the first sentence or the length cap', () => {
    expect(briefEventDescription('Short effect')).toBe('Short effect');
    expect(briefEventDescription('First sentence. Second sentence.')).toBe('First sentence.');
    expect(briefEventDescription('x'.repeat(80))).toHaveLength(64);
    expect(briefEventDescription('x'.repeat(80)).endsWith('…')).toBe(true);
    expect(briefEventDescription('   ')).toBe('');
  });

  it('describes choice routing, including a chain-end option', () => {
    const nameById = new Map(gymManifest.nodes.map((node) => [node.id, node.name]));
    const invest = gymManifest.nodes.find((node) => node.id === 'gym-story-invest');
    const routing = invest
      ? describeChoiceRouting(invest, gymManifest.edges, nameById)
      : '';
    expect(routing).toBe(
      'Celebrate: effect applies → New Beginning · Double down: effect applies → chain ends',
    );

    const end = gymManifest.nodes.find((node) => node.id === 'gym-story-end');
    expect(end && describeChoiceRouting(end, gymManifest.edges, nameById)).toBe(
      'Resolves immediately (no choice)',
    );
  });
});

describe('manifest JSON schema', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(readText(MANIFEST_SCHEMA_PATH)));

  it('accepts the generated manifest', () => {
    expect(validate(JSON.parse(serialiseManifest(gymManifest)))).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it('rejects a manifest missing a required node field', () => {
    const broken = JSON.parse(serialiseManifest(gymManifest));
    delete broken.nodes[0].impact;
    expect(validate(broken)).toBe(false);
  });
});

describe('storyline-graph CLI', () => {
  it('reports the committed Gym manifest as up to date (--check)', () => {
    const { code, stdout } = captureOutput(() =>
      runStorylineGraphCli(['--format', 'json', '--csv', GYM_CONTENT_PATH, '--check']),
    );
    expect(code).toBe(0);
    expect(stdout).toContain('is up to date');
  });

  it('reports the committed Gym Mermaid artefact as up to date (--check)', () => {
    const { code } = captureOutput(() =>
      runStorylineGraphCli(['--format', 'mermaid', '--csv', GYM_CONTENT_PATH, '--check']),
    );
    expect(code).toBe(0);
  });

  it('detects drift against a differing artefact', () => {
    const out = join(tempDir.path, 'drifted.json');
    writeFileSync(out, '{"version": 1}\n', 'utf-8');
    const { code, stderr } = captureOutput(() =>
      runStorylineGraphCli(['--format', 'json', '--csv', GYM_CONTENT_PATH, '--out', out, '--check']),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('drift detected');
  });

  it('fails --check when the committed artefact is missing', () => {
    const { code, stderr } = captureOutput(() =>
      runStorylineGraphCli([
        '--format',
        'json',
        '--csv',
        GYM_CONTENT_PATH,
        '--out',
        join(tempDir.path, 'absent.json'),
        '--check',
      ]),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('missing committed artefact');
  });

  it('writes the artefact when --check is absent', () => {
    const out = join(tempDir.path, 'written.json');
    const { code } = captureOutput(() =>
      runStorylineGraphCli(['--format', 'json', '--csv', GYM_CONTENT_PATH, '--out', out]),
    );
    expect(code).toBe(0);
    expect(readText(out)).toBe(serialiseManifest(gymManifest));
  });

  it('rejects an unknown adapter id and prints usage for --help', () => {
    const bad = captureOutput(() =>
      runStorylineGraphCli(['--game', 'nope', '--csv', GYM_CONTENT_PATH]),
    );
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('unknown --game');

    const help = captureOutput(() => runStorylineGraphCli(['--help']));
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('storyline-graph');
  });
});
