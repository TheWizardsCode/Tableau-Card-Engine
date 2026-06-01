/**
 * Feudalism Adapter – bridges Feudalism scene rendering to the shared
 * Renderer API.
 *
 * Provides a Feudalism-specific wrapper for `createActionButton` that
 * matches the Feudalism visual style (dark green background, green label,
 * green border) and compensates for the positioning convention difference:
 * Feudalism's original private method used the button's vertical centre as
 * the `y` coordinate, while the shared helper uses the top edge.
 *
 * @module FeudalismAdapter
 */

import Phaser from 'phaser';
import {
  createActionButton as sharedCreateActionButton,
  ActionButtonOptions,
} from '../index';

// ---------------------------------------------------------------------------
// Action button
// ---------------------------------------------------------------------------

/**
 * Create an action button styled for Feudalism.
 *
 * Uses dark green background (`0x335533`), light green text (`#88ff88`),
 * green border (`0x55aa55`), 155×42 px dimensions, and 17px bold font —
 * matching the original private `createActionButton` in FeudalismRenderer.
 *
 * The `y` parameter is interpreted as the **vertical centre** of the button
 * (matching the original Feudalism convention). The shared helper expects
 * the top edge, so `y - height/2` is passed through internally.
 *
 * @param scene   - The Phaser scene.
 * @param x       - X position (left edge).
 * @param y       - Y position (vertical centre of the button).
 * @param text    - Label text.
 * @param callback - Click handler.
 * @returns A Phaser.Container containing the button.
 */
export function createFeudalismActionButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  callback: () => void,
): Phaser.GameObjects.Container {
  const btnW = 155;
  const btnH = 42;
  return sharedCreateActionButton(scene, x, y - btnH / 2, btnW, text, callback, {
    height: btnH,
    fillColor: 0x335533,
    fillAlpha: 0.8,
    strokeColor: 0x55aa55,
    textColor: '#88ff88',
    fontSize: '17px',
  } as ActionButtonOptions);
}
