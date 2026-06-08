/**
 * Shared browser-test helper: wait for a Phaser scene to reach
 * the "running" (active) status.
 *
 * Default timeout is 20 000 ms to account for asset-heavy scenes
 * (50+ SVGs / WAVs) loading in headless Chromium under CI load.
 */
import Phaser from 'phaser';

const DEFAULT_TIMEOUT_MS = 20_000;

export function waitForScene(
  game: Phaser.Game,
  sceneKey: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const scene = game.scene.getScene(sceneKey);
      if (
        scene &&
        (scene as Phaser.Scene & { sys: Phaser.Scenes.Systems }).sys.isActive()
      ) {
        // The scene is active, but create() may still be executing.
        // Wait for the next animation frame to ensure create() has completed
        // (Phaser marks a scene as active during the create() phase).
        requestAnimationFrame(() => {
          // Also wait a couple more frames for deferred initializations
          // (e.g., initHUDContainer, renderer setup)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(
            `Scene "${sceneKey}" did not become active within ${timeoutMs}ms`,
          ),
        );
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}
