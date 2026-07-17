/**
 * OverlayManager -- small helper to manage modal overlay object lifecycles.
 * Provides a generic, reusable way to show and dismiss overlays with proper
 * depth handling for different overlay types.
 */

import {
  createOverlayBackground,
  dismissOverlay,
  type OverlayBackgroundOptions,
  type OverlayBoxOptions,
  type OverlayResult,
} from './Overlay';

/** Overlay type determines default depth and behavior. */
export type OverlayType = 'game-over' | 'win/loss' | 'round-end' | 'custom';

/** Configuration for showing an overlay. */
export interface OverlayConfig {
  /** Type of overlay (affects default depth). */
  type: OverlayType;
  /** Background options (depth will be overridden by type unless custom). */
  backgroundOptions?: OverlayBackgroundOptions;
  /** Box options for visible overlay content. */
  box?: OverlayBoxOptions;
}

export class OverlayManager {
  private _objects: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene) {}

  get objects(): Phaser.GameObjects.GameObject[] {
    return this._objects;
  }

  /**
   * Show an overlay with the given configuration.
   * 
   * @param config - Overlay configuration including type and options
   * @returns The created overlay result
   */
  showOverlay(config: OverlayConfig): OverlayResult {
    this.dismiss(); // Clear any existing overlay
    
    // Determine depth based on overlay type
    const depth = config.type === 'custom' 
      ? config.backgroundOptions?.depth ?? 10 
      : 2000; // Game state overlays use depth 2000
    
    // Prepare background options with correct depth
    const backgroundOptions: OverlayBackgroundOptions = {
      ...config.backgroundOptions,
      depth,
    };
    
    const overlay = createOverlayBackground(this.scene, backgroundOptions, config.box);
    this._objects.push(...overlay.objects);
    return overlay;
  }

  add(...objects: Phaser.GameObjects.GameObject[]): void {
    // Auto-parent all overlay content objects to hudContainer so they render
    // above the overlay background box. This centralises z-ordering for all
    // overlay content across every game that uses OverlayManager.
    // createOverlayBackground() already parents the box/background itself;
    // this handles all application-level content (text, buttons, etc.).
    const hud = (this.scene as any).hudContainer as { add: (obj: Phaser.GameObjects.GameObject) => void } | undefined;
    for (const obj of objects) {
      hud?.add(obj);
    }
    this._objects.push(...objects);
  }

  dismiss(): void {
    dismissOverlay(this._objects);
    this._objects = [];
  }
}