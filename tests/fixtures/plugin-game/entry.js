/**
 * Synthetic runtime game artifact — the loader-contract fixture.
 *
 * This file mimics what a real `tce-<game>` repo emits from
 * `scripts/build-game-artifact.mjs`: an ESM module that re-exports a
 * Phaser-compatible scene class and a `GAME_INFO` metadata object.
 *
 * Loader contract (see docs/DEVELOPER.md "Runtime game plugins"):
 *   - `GAME_INFO` is a named export describing the game's metadata.
 *   - The scene class is exported both by name (`sceneKey`) and as the
 *     module default, so the loader can resolve it either way.
 *
 * Deliberately dependency-free (no Phaser import) so the fixture is
 * importable in a Vitest (Node) context without a browser or WebGL.
 */

/** Metadata consumed by the runtime game plugin loader. */
export const GAME_INFO = Object.freeze({
  id: 'fixture-game',
  sceneKey: 'FixtureGameScene',
  title: 'Fixture Game',
  description: 'Synthetic runtime game used by plugin loader tests.',
});

/**
 * Minimal Phaser-compatible scene.
 *
 * Duck-types the small surface the loader relies on (a constructable class
 * with a `create` lifecycle hook) without depending on Phaser itself.
 */
export class FixtureGameScene {
  constructor() {
    /** Matches GAME_INFO.sceneKey so the loader can cross-check exports. */
    this.sceneKey = GAME_INFO.sceneKey;
  }

  create() {
    // No-op: the fixture never renders in loader tests.
  }
}

export default FixtureGameScene;
