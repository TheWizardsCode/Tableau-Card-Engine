import type { Command } from '../../src/core-engine/UndoRedoManager';
import type { MainStreetState } from './MainStreetState';
import {
  purchaseBusiness,
  purchaseUpgrade,
  purchaseEvent,
  refreshInvestments,
} from './MainStreetMarket';
import { playHeldEvent } from './MainStreetEngine';

/** Snapshot of the portions of state affected by market actions. */
interface MarketActionSnapshot {
  streetGrid: any | null;
  market: any | null;
  decks: any | null;
  resourceBank: any | null;
  heldEvent: any | null;
  incidentQueue: any | null;
  activityLog: any | null;
}

/** Safe cloning helper that uses structuredClone when available, else falls back to JSON clone. */
function safeClone<T>(obj: T): T {
  try {
    const sc = (globalThis as any).structuredClone;
    if (typeof sc === 'function') {
      return sc(obj);
    }
  } catch (_) {
    // fall back
  }
  // JSON fallback (sufficient for our snapshotuses: arrays/objects of primitives)
  return JSON.parse(JSON.stringify(obj));
}

/** Helper to capture a shallow snapshot of mutable market-related fields. */
function captureSnapshot(state: MainStreetState): MarketActionSnapshot {
  return {
    streetGrid: safeClone(state.streetGrid),
    market: safeClone(state.market),
    decks: safeClone(state.decks),
    resourceBank: safeClone(state.resourceBank),
    heldEvent: safeClone(state.heldEvent),
    incidentQueue: safeClone(state.incidentQueue),
    activityLog: safeClone(state.activityLog),
  };
}

/** Helper to restore a previously captured snapshot. */
function restoreSnapshot(state: MainStreetState, snap: MarketActionSnapshot): void {
  if (!snap.streetGrid || !snap.market || !snap.decks || !snap.resourceBank || !snap.activityLog) {
    throw new Error('Invalid snapshot');
  }
  state.streetGrid = snap.streetGrid as any;
  state.market = snap.market as any;
  state.decks = snap.decks as any;
  state.resourceBank = snap.resourceBank as any;
  state.heldEvent = snap.heldEvent as any;
  state.incidentQueue = snap.incidentQueue as any;
  state.activityLog = snap.activityLog as any;
}

/** Command: Buy Business */
export class BuyBusinessCommand implements Command {
  readonly description?: string;
  private pre: MarketActionSnapshot | null = null;

  constructor(
    private readonly state: MainStreetState,
    private readonly cardId: string,
    private readonly slotIndex: number,
  ) {
    this.description = `BuyBusiness ${cardId} -> slot ${slotIndex}`;
  }

  execute(): void {
    if (this.pre === null) {
      this.pre = captureSnapshot(this.state);
    }
    purchaseBusiness(this.state, this.cardId, this.slotIndex);
  }

  undo(): void {
    if (this.pre === null) return;
    restoreSnapshot(this.state, this.pre);
  }
}

/** Command: Buy Upgrade */
export class BuyUpgradeCommand implements Command {
  readonly description?: string;
  private pre: MarketActionSnapshot | null = null;

  constructor(
    private readonly state: MainStreetState,
    private readonly cardId: string,
    private readonly targetSlot?: number,
  ) {
    this.description = `BuyUpgrade ${cardId} -> slot ${targetSlot ?? 'auto'}`;
  }

  execute(): void {
    if (this.pre === null) this.pre = captureSnapshot(this.state);
    purchaseUpgrade(this.state, this.cardId, this.targetSlot);
  }

  undo(): void {
    if (this.pre === null) return;
    restoreSnapshot(this.state, this.pre);
  }
}

/** Command: Buy Event (Investment) */
export class BuyEventCommand implements Command {
  readonly description?: string;
  private pre: MarketActionSnapshot | null = null;

  constructor(
    private readonly state: MainStreetState,
    private readonly cardId: string,
  ) {
    this.description = `BuyEvent ${cardId}`;
  }

  execute(): void {
    if (this.pre === null) this.pre = captureSnapshot(this.state);
    purchaseEvent(this.state, this.cardId);
  }

  undo(): void {
    if (this.pre === null) return;
    restoreSnapshot(this.state, this.pre);
  }
}

/** Command: Play Held Investment Event */
export class PlayEventCommand implements Command {
  readonly description?: string;
  private pre: MarketActionSnapshot | null = null;

  constructor(private readonly state: MainStreetState) {
    this.description = `PlayHeldEvent`;
  }

  execute(): void {
    if (this.pre === null) this.pre = captureSnapshot(this.state);
    playHeldEvent(this.state);
  }

  undo(): void {
    if (this.pre === null) return;
    restoreSnapshot(this.state, this.pre);
  }
}

/** Command: Refresh Investments Row (buy new opportunities) */
export class BuyRefreshInvestmentsCommand implements Command {
  readonly description?: string;
  private pre: MarketActionSnapshot | null = null;

  constructor(private readonly state: MainStreetState) {
    this.description = `RefreshInvestments`;
  }

  execute(): void {
    if (this.pre === null) this.pre = captureSnapshot(this.state);
    refreshInvestments(this.state);
  }

  undo(): void {
    if (this.pre === null) return;
    restoreSnapshot(this.state, this.pre);
  }
}
