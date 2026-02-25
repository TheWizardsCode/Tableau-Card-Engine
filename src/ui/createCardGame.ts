/**
 * createCardGame -- Shared factory for bootstrapping Phaser game instances.
 *
 * Every example game in the Tableau Card Engine uses the same Phaser config
 * boilerplate (resolution, scaling, audio, rendering).  This helper
 * centralizes that config so that individual game factories only need to
 * specify what differs: background colour, scenes, and optional overrides.
 *
 * The helper also handles the `hiDpiText` side-effect import so that
 * consumers no longer need to import it themselves.
 *
 * @module @ui/createCardGame
 */

import Phaser from 'phaser';
import './hiDpiText'; // side-effect: crisp text on HiDPI displays

// ── Default values ────────────────────────────────────────

/** Default parent DOM element ID. */
const DEFAULT_PARENT = 'game-container';
/** Default game width in logical pixels. */
const DEFAULT_WIDTH = 1280;
/** Default game height in logical pixels. */
const DEFAULT_HEIGHT = 720;

// ── Types ─────────────────────────────────────────────────

/**
 * Options accepted by {@link createCardGame}.
 *
 * Only `backgroundColor` and `scenes` are required -- everything else
 * has sensible defaults matching the existing per-game factories.
 */
export interface CardGameOptions {
  /** CSS colour string for the canvas background. */
  backgroundColor: string;

  /**
   * Phaser scene classes (or scene config objects) to register.
   * The first entry auto-starts unless the Phaser config says otherwise.
   */
  scenes: Phaser.Types.Scenes.SceneType[];

  /** DOM element ID to parent the game canvas to. Default: `'game-container'`. */
  parent?: string;

  /** Game width in logical pixels. Default: `1280`. */
  width?: number;

  /** Game height in logical pixels. Default: `720`. */
  height?: number;

  /**
   * Optional Phaser `callbacks` config (e.g. `preBoot`).
   * Merged into the final config as-is.
   */
  callbacks?: Phaser.Types.Core.CallbacksConfig;

  /**
   * Extra Phaser render config to merge with the defaults.
   * Useful for replay mode (`preserveDrawingBuffer: true`).
   */
  render?: Phaser.Types.Core.RenderConfig;

  /**
   * When true, the created game instance is exposed on
   * `window.__PHASER_GAME__` for browser testing and debugging.
   * Default: `false`.
   */
  exposeOnWindow?: boolean;
}

// ── Factory ───────────────────────────────────────────────

/**
 * Create a Phaser {@link Phaser.Game} instance with the standard
 * Tableau Card Engine configuration.
 *
 * ```ts
 * import { createCardGame } from '@ui/createCardGame';
 * import { MyScene } from './scenes/MyScene';
 *
 * export function createMyGame() {
 *   return createCardGame({
 *     backgroundColor: '#2d572c',
 *     scenes: [MyScene],
 *   });
 * }
 * ```
 *
 * @param options  Game-specific overrides on top of the shared defaults.
 * @returns A running Phaser.Game instance.
 */
export function createCardGame(options: CardGameOptions): Phaser.Game {
  const {
    backgroundColor,
    scenes,
    parent = DEFAULT_PARENT,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    callbacks,
    render: renderOverrides,
    exposeOnWindow = false,
  } = options;

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor,
    scene: scenes,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      roundPixels: true,
      ...renderOverrides,
    },
    audio: {
      disableWebAudio: false,
    },
    ...(callbacks ? { callbacks } : {}),
  };

  const game = new Phaser.Game(config);

  if (exposeOnWindow) {
    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
  }

  return game;
}
