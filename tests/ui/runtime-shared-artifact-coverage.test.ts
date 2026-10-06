/**
 * Verification that the runtime-shared import map covers a real built artifact
 * (CG-0MUV9Y71Z002W8N2).
 *
 * This is the automated half of the packaged-launcher verification: it builds
 * a fixture game whose scene imports the same *deep* externalised engine
 * specifiers a real game emits (`@core-engine/SetupOptions`,
 * `@ui/Renderer/adapters/GolfAdapter`, …), reads the emitted `entry.js`, and
 * asserts that every bare specifier it contains has an import-map entry.
 *
 * The import map is generated from the launcher's own source tree
 * (`buildImportMapForProject(repoRoot)`), exactly as
 * `scripts/vite-runtime-shared-plugin.ts` injects it into `index.html`. An
 * unmapped specifier here would be a specifier the packaged launcher cannot
 * resolve — i.e. an unplayable artifact.
 *
 * The packaged Electron run is documented in
 * `docs/dev/runtime-game-plugins-runbook.md` (scenario D).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildGameArtifact } from '../../scripts/build-game-artifact.mjs';
import {
  buildImportMapForProject,
  collectBareSpecifiers,
  findUnmappedSpecifiers,
} from '../../scripts/runtime-shared-import-map';

const repoRoot = path.resolve(__dirname, '..', '..');
const GAME_ID = 'coverage-game';
const SCENE_CLASS = 'CoverageGameScene';

/**
 * Representative deep engine specifiers — mirrors what sibling game repos
 * import (Golf imports all of these). Every binding is referenced so the
 * external imports survive Rollup tree-shaking into `entry.js`.
 */
const SCENE_SOURCE = `
import { resolveSetupOptions } from '@core-engine/SetupOptions';
import { createSeededRng } from '@core-engine/SeededRng';
import { Pile } from '@card-system/Pile';
import { createEconomyLedger } from '@rule-engine/EconomyLedger';
import { pickRandom } from '@ai';
import { PileView } from '@ui/PileView';
import { anchorPoint } from '@ui/screen-layout';
import { createOverlayBackground } from '@ui/Overlay';
import { AiDecisionRecorder } from '@ui/debug/AiDecisionRecorder';
import { createSceneTitle } from '@ui/Renderer';
import { getCardTexture } from '@ui/Renderer/adapters/GolfAdapter';
import Phaser from 'phaser';

export const GAME_INFO = {
  sceneKey: '${SCENE_CLASS}',
  title: 'Coverage Game',
  description: 'Fixture exercising the runtime shared-specifier import map.',
};

export class ${SCENE_CLASS} {
  /** Reference every external import so it is retained in the artifact. */
  dependencies() {
    return [
      resolveSetupOptions,
      createSeededRng,
      Pile,
      createEconomyLedger,
      pickRandom,
      PileView,
      anchorPoint,
      createOverlayBackground,
      AiDecisionRecorder,
      createSceneTitle,
      getCardTexture,
      Phaser,
    ];
  }
}
`;

let root: string;
let fixtureRepo: string;
let contentDir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tce-shared-coverage-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fixtureRepo = path.join(root, 'fixture-repo');
  contentDir = path.join(root, 'content');

  const sceneDir = path.join(fixtureRepo, GAME_ID, 'src', 'scenes');
  fs.mkdirSync(sceneDir, { recursive: true });
  fs.writeFileSync(
    path.join(sceneDir, `${SCENE_CLASS}.ts`),
    SCENE_SOURCE,
    'utf-8',
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runtime-shared import map — built artifact coverage', () => {
  it('maps every bare specifier an externalised artifact emits', async () => {
    const result = await buildGameArtifact({
      gameId: GAME_ID,
      projectRoot: fixtureRepo,
      config: {
        games: [
          {
            id: GAME_ID,
            path: path.join(fixtureRepo, GAME_ID),
            scenePath: `src/scenes/${SCENE_CLASS}.ts`,
          },
        ],
      },
      outRoot: path.join(contentDir, 'games'),
      coreEngineVersion: '^0.1.0',
    });

    const entrySource = fs.readFileSync(result.entryPath, 'utf-8');
    const specifiers = collectBareSpecifiers(entrySource);

    // The fixture's deep imports really are externalised (not bundled).
    expect(specifiers).toContain('@core-engine/SetupOptions');
    expect(specifiers).toContain('@ui/Renderer/adapters/GolfAdapter');
    expect(specifiers).toContain('@ui/debug/AiDecisionRecorder');
    expect(specifiers).toContain('phaser');

    // The launcher's generated import map resolves every one of them.
    const map = buildImportMapForProject(repoRoot);
    expect(findUnmappedSpecifiers(map, specifiers)).toEqual([]);
  }, 120_000);
});
