/**
 * 1916: The Rising — undo/redo commands for a turn.
 *
 * A turn is committed as a single {@link CompoundCommand} of two steps:
 *
 *   1. {@link PlaceSpiritCommand} — the placement itself (hand → timeline,
 *      Insight awarded), which also replays the place animation;
 *   2. {@link AdvanceClockCommand} — the end-of-turn clock advance, applied
 *      through a HUD-only refresh so the placement animation is not destroyed.
 *
 * Grouping them means one undo reverses the whole turn (and one redo replays
 * it). This module is deliberately renderer-free: it depends only on the
 * `Command` contract and a minimal {@link RisingCommandHost}, so it can be
 * unit-tested in Node without a Phaser scene.
 *
 * @module src/scenes/TheRisingCommands
 */

import type { Command } from '@core-engine';
import type { RisingState } from '../TheRisingState';

/** The controller surface the turn commands drive. */
export interface RisingCommandHost {
  /** Apply a full state change (rebuilds the board and repaints). */
  applyState(state: RisingState): void;
  /** Apply a HUD-only state change (no card-row rebuild). */
  applyStateHudOnly(state: RisingState): void;
  /** Animate a just-placed spirit from its captured source position. */
  animatePlacement(spiritId: string, source: { x: number; y: number } | undefined): void;
}

/**
 * A reversible placement command (the placement half of a turn).
 *
 * Swaps the whole {@link RisingState} before/after the placement (hand →
 * timeline + Insight). `execute()` also replays the place animation from the
 * captured source position, so both the original placement and a redo animate
 * identically.
 */
export class PlaceSpiritCommand implements Command {
  readonly description: string;

  constructor(
    private readonly host: RisingCommandHost,
    private readonly before: RisingState,
    private readonly after: RisingState,
    private readonly spiritId: string,
    private readonly source: { x: number; y: number } | undefined,
  ) {
    this.description = `Place ${spiritId} on the timeline`;
  }

  execute(): void {
    this.host.applyState(this.after);
    this.host.animatePlacement(this.spiritId, this.source);
  }

  undo(): void {
    this.host.applyState(this.before);
  }
}

/**
 * The end-of-turn clock advance, as the second half of a turn's
 * {@link CompoundCommand}.
 *
 * Applies the state through a HUD-only refresh so an in-flight placement
 * animation is not destroyed by a full card-row rebuild.
 */
export class AdvanceClockCommand implements Command {
  readonly description: string;

  constructor(
    private readonly host: RisingCommandHost,
    private readonly before: RisingState,
    private readonly after: RisingState,
  ) {
    this.description = 'Advance the Rising clock';
  }

  execute(): void {
    this.host.applyStateHudOnly(this.after);
  }

  undo(): void {
    this.host.applyStateHudOnly(this.before);
  }
}
