/**
 * OverlayManager -- small helper to manage modal overlay object lifecycles.
 */

import {
  createOverlayBackground,
  dismissOverlay,
  type OverlayBackgroundOptions,
  type OverlayBoxOptions,
  type OverlayResult,
} from './Overlay';

export class OverlayManager {
  private _objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {}

  get objects(): Phaser.GameObjects.GameObject[] {
    return this._objects;
  }

  create(
    options?: OverlayBackgroundOptions,
    box?: OverlayBoxOptions,
  ): OverlayResult {
    this.dismiss();
    const overlay = createOverlayBackground(this.scene, options, box);
    this._objects.push(...overlay.objects);
    return overlay;
  }

  add(...objects: Phaser.GameObjects.GameObject[]): void {
    this._objects.push(...objects);
  }

  dismiss(): void {
    dismissOverlay(this._objects);
    this._objects = [];
  }
}
