/**
 * HighlightManager – A lightweight, reusable highlight zone manager
 * for Phaser scenes.
 *
 * Manages multiple named highlight zones with independent lifetimes,
 * rendering them via a single shared Phaser.GameObjects.Graphics object.
 * Supports solid fill and border-only styles.
 *
 * Usage:
 * ```ts
 * const highlights = new HighlightManager(scene);
 * highlights.addZone('validDrop', {
 *   x: 100, y: 200, w: 80, h: 60,
 *   style: 'fill', color: 0x44ff44, alpha: 0.35,
 *   lifetime: 3000, // auto-clear after 3s
 * });
 * highlights.removeZone('validDrop');
 * highlights.clearAll();
 * highlights.destroy();
 * ```
 *
 * @module src/ui/HighlightManager
 */

import Phaser from 'phaser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Style of highlight zone rendering. */
export type HighlightStyle = 'fill' | 'border';

/** Configuration for a single highlight zone. */
export interface HighlightZoneConfig {
  /** X position of the zone (top-left corner). */
  x: number;
  /** Y position of the zone (top-left corner). */
  y: number;
  /** Width of the zone in pixels. */
  w: number;
  /** Height of the zone in pixels. */
  h: number;
  /** Rendering style: 'fill' for solid fill + stroke, 'border' for outline only. */
  style: HighlightStyle;
  /** Primary color of the zone (fill color for 'fill' style, used for both in 'border'). */
  color: number;
  /** Fill/outline alpha (default: 0.35 for fill, 0.8 for border). */
  alpha?: number;
  /** Stroke color (defaults to zone color). */
  strokeColor?: number;
  /** Stroke width in pixels (default: 2). */
  strokeWidth?: number;
  /** Corner radius for rounded rectangle (default: 8). */
  radius?: number;
  /**
   * Auto-clear lifetime in milliseconds. If set, the zone is automatically
   * removed after this duration. When removed (by timeout, removeZone, or
   * clearAll), the timer is cancelled.
   */
  lifetime?: number;
}

/** Internal representation of a registered zone. */
interface ZoneEntry {
  config: HighlightZoneConfig;
  /** Timer for auto-clear, if `lifetime` was configured. */
  timer?: Phaser.Time.TimerEvent;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FILL_ALPHA = 0.35;
const DEFAULT_STROKE_ALPHA = 0.8;
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_RADIUS = 8;

// ---------------------------------------------------------------------------
// HighlightManager class
// ---------------------------------------------------------------------------

/**
 * A lightweight manager for named highlight zones rendered via a single
 * shared `Phaser.GameObjects.Graphics` object.
 *
 * Features:
 * - Add named zones with position, size, style, color, alpha, and optional lifetime
 * - Remove individual zones by name
 * - Clear all zones at once
 * - Automatic cleanup of auto-clear timers
 * - Style switching by re-adding a zone with the same name
 * - Two styles: 'fill' (solid fill with stroke) and 'border' (outline only)
 */
export class HighlightManager {
  /** The shared Graphics object used for rendering all zones. */
  readonly graphics: Phaser.GameObjects.Graphics;

  /** Internal registry of zone entries, keyed by name. Insertion-order preserved. */
  private readonly _zones: Map<string, ZoneEntry> = new Map();

  /** The Phaser scene this manager belongs to. */
  private readonly _scene: Phaser.Scene;

  /**
   * @param scene  The Phaser scene to add the Graphics object to.
   */
  constructor(scene: Phaser.Scene) {
    this._scene = scene;
    this.graphics = scene.add.graphics();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Add or update a named highlight zone.
   *
   * If a zone with the same name already exists, it is replaced (the old
   * timer is cancelled, the graphics buffer is cleared, and all remaining
   * zones are redrawn).
   *
   * @param name   Unique name for this zone. Used for later removal.
   * @param config Position, size, style, and lifetime configuration.
   */
  addZone(name: string, config: HighlightZoneConfig): void {
    // Remove existing zone with the same name, if any
    this._removeZoneEntry(name);

    // Create the zone entry
    const entry: ZoneEntry = { config };

    // Schedule auto-clear timer if lifetime is specified
    if (config.lifetime !== undefined && config.lifetime > 0) {
      entry.timer = this._scene.time.delayedCall(config.lifetime, () => {
        this._removeZoneEntry(name);
        this._render();
      });
    }

    // Register the zone
    this._zones.set(name, entry);

    // Re-render all zones
    this._render();
  }

  /**
   * Remove a named highlight zone. If the zone does not exist, this is
   * a no-op.
   */
  removeZone(name: string): void {
    if (!this._zones.has(name)) return;
    this._removeZoneEntry(name);
    this._render();
  }

  /**
   * Clear all highlight zones and the graphics buffer.
   */
  clearAll(): void {
    // Cancel all auto-clear timers
    for (const [, entry] of this._zones) {
      this._cancelTimer(entry);
    }
    this._zones.clear();
    this.graphics.clear();
  }

  /**
   * Destroy the internal Graphics object and clear all zones.
   * Safe to call multiple times.
   */
  destroy(): void {
    this.clearAll();
    try {
      this.graphics.destroy();
    } catch (_) {
      /* ignore */
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Remove a zone entry by name (cancels its timer) without re-rendering.
   */
  private _removeZoneEntry(name: string): void {
    const entry = this._zones.get(name);
    if (!entry) return;
    this._cancelTimer(entry);
    this._zones.delete(name);
  }

  /**
   * Cancel a zone entry's auto-clear timer, if one exists.
   */
  private _cancelTimer(entry: ZoneEntry): void {
    if (entry.timer) {
      try {
        entry.timer.remove();
      } catch (_) {
        /* ignore */
      }
      entry.timer = undefined;
    }
  }

  /**
   * Re-render all currently registered zones onto the shared Graphics
   * object. This clears the buffer and redraws every zone in order.
   */
  private _render(): void {
    const g = this.graphics;
    g.clear();

    for (const [, entry] of this._zones) {
      this._drawZone(g, entry.config);
    }
  }

  /**
   * Draw a single zone onto the given Graphics object.
   */
  private _drawZone(g: Phaser.GameObjects.Graphics, config: HighlightZoneConfig): void {
    const {
      x, y, w, h,
      style,
      color,
      alpha,
      strokeColor,
      strokeWidth,
      radius,
    } = config;

    const r = radius ?? DEFAULT_RADIUS;

    if (style === 'border') {
      // Border-only: transparent fill + coloured stroke
      g.fillStyle(color, 0);
      g.lineStyle(
        strokeWidth ?? DEFAULT_STROKE_WIDTH,
        strokeColor ?? color,
        alpha ?? DEFAULT_STROKE_ALPHA,
      );
    } else {
      // Solid fill: fill + stroke
      g.fillStyle(color, alpha ?? DEFAULT_FILL_ALPHA);
      g.lineStyle(
        strokeWidth ?? DEFAULT_STROKE_WIDTH,
        strokeColor ?? color,
        DEFAULT_STROKE_ALPHA,
      );
    }

    g.fillRoundedRect(x, y, w, h, r);
    g.strokeRoundedRect(x, y, w, h, r);
  }
}
