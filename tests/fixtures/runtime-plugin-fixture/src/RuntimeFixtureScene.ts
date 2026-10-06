/**
 * Minimal runtime game plugin fixture scene
 * (CG-0MUV9Y71Z002W8N2 verification).
 *
 * Built into a runtime artifact by `scripts/build-game-artifact.mjs` to prove
 * that a dynamically-imported artifact:
 *
 *   - imports cleanly at runtime with its externalised bare specifiers
 *     (`phaser`, `@ui`, `@core-engine/…`) resolved by the launcher's runtime
 *     shared-dependency import map, and
 *   - boots as a real Phaser scene.
 *
 * Deliberately dependency-light: it imports Phaser and two engine modules so
 * the import map is genuinely exercised, but no game assets/audio — those are
 * a separate per-game asset-packaging concern.
 *
 * @see docs/dev/runtime-game-plugins-runbook.md — scenario D
 */

import Phaser from 'phaser';
import { CARD_W } from '@ui';
import { ENGINE_VERSION } from '@core-engine';

export const GAME_INFO = {
  sceneKey: 'RuntimeFixtureScene',
  title: 'Runtime Fixture',
  description: 'Minimal runtime plugin fixture (import-map verification).',
};

export class RuntimeFixtureScene extends Phaser.Scene {
  constructor() {
    super({ key: GAME_INFO.sceneKey });
  }

  create(): void {
    // Reference the engine imports so they survive tree-shaking: the emitted
    // `entry.js` must contain `@ui` and `@core-engine` bare specifiers.
    const marker = `runtime-fixture v${ENGINE_VERSION} card=${CARD_W}`;
    this.add
      .text(400, 300, marker, { color: '#ffffff', fontSize: '20px' })
      .setOrigin(0.5);
  }
}
