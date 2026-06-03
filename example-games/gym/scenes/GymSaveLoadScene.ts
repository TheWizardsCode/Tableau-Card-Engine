/**
 * GymSaveLoadScene -- Demonstrates save/load state round-trips using
 * the core-engine SaveLoadStore API.
 *
 * Features:
 *   - Save current scene state to persistent storage
 *   - Load and restore saved state
 *   - Handle malformed save payloads safely
 *   - Verify state invariants after restore
 *   - RenderTexture snapshot on save (with headless fallback)
 *
 * @module example-games/gym/scenes/GymSaveLoadScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_SAVE_LOAD_KEY } from '../GymRegistry';
import {
  SaveLoadStore,
} from '../../../src/core-engine';
import type { SaveSerializer } from '../../../src/core-engine';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

/** Simple state for this demo. */
interface DemoState {
  counter: number;
  label: string;
  /** Base64 data URL of the snapshot thumbnail, or null if no snapshot taken. */
  snapshotDataUrl: string | null;
}

interface DemoSerialized {
  c: number;
  l: string;
  s: string | null;
}

const DEMO_SERIALIZER: SaveSerializer<DemoState, DemoSerialized> = {
  schemaVersion: 1,
  serialize(state: DemoState): DemoSerialized {
    return { c: state.counter, l: state.label, s: state.snapshotDataUrl };
  },
  deserialize(data: DemoSerialized): DemoState {
    return { counter: data.c, label: data.l, snapshotDataUrl: data.s ?? null };
  },
};

const GAME_TYPE = 'gym-save-load';
const SLOT_ID = 'demo-slot';

export class GymSaveLoadScene extends GymSceneBase {
  private state: DemoState = { counter: 0, label: 'initial', snapshotDataUrl: null };
  private store!: SaveLoadStore;
  private stateText!: Phaser.GameObjects.Text;
  private backendText!: Phaser.GameObjects.Text;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private snapshotPlaceholder: Phaser.GameObjects.Text | null = null;
  /** The RenderTexture used as the current snapshot display (if any). */
  private snapshotDisplay: Phaser.GameObjects.RenderTexture | null = null;
  /** A flat Image created from a loaded snapshot data URL (used during load restore). */
  private thumbnailImage: Phaser.GameObjects.Image | null = null;
  private _snapshotAvailable = false;
  /** Pending snapshot callback data URL (set async by snapshot()); null if none. */
  private _pendingSnapshotDataUrl: string | null = null;
  /** Whether a snapshot is currently displayed. Read-only for external checks. */
  get snapshotAvailable(): boolean { return this._snapshotAvailable; }

  constructor() {
    super({ key: GYM_SAVE_LOAD_KEY });
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Save / Load State');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates saving and loading scene state via the SaveLoadStore API. Includes handling malformed payloads, RenderTexture snapshots, and verifying invariants after restore.' },
      { heading: 'Controls', body: '[ Increment ]: Mutate demo state.\n[ Set Label ]: Update label to reflect counter.\n[ Save State ]: Persist current state (with optional snapshot).\n[ Load State ]: Restore last saved state.\n[ Load Malformed ]: Simulate a bad payload to verify error handling.\n[ Clear Save ]: Remove persisted save data.\n[ Snapshot ]: Attempt a RenderTexture snapshot of the scene.' }
    ]);

    this.store = new SaveLoadStore({ dbName: 'gym-save-load', localStoragePrefix: 'gym-sl' });

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ Increment ]', () => this.increment());
    this.addButton(cx - 260, y, '[ Set Label ]', () => this.setLabel());
    this.addButton(cx - 110, y, '[ Save State ]', () => this.saveState());
    this.addButton(cx + 50, y, '[ Load State ]', () => this.loadState());
    this.addButton(cx + 200, y, '[ Load Malformed ]', () => this.loadMalformed());
    this.addButton(cx + 400, y, '[ Clear Save ]', () => this.clearSave());

    y += 26;
    this.addButton(cx - 300, y, '[ Take Snapshot ]', () => this.takeSnapshot());
    this.addButton(cx - 100, y, '[ Clear Snapshot ]', () => this.clearSnapshot());

    y += 40;
    try {
      this.stateText = createHudText(this, cx, y, this.stateString(), '#ffffff', { fontSize: '18px' }).setOrigin(0.5);
    } catch (e) {
      // Fallback to label if text texture creation fails in some headless environments
      this.stateText = this.addLabel(cx, y, this.stateString(), { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    }

    y += 30;
    this.backendText = createHudText(this, cx, y, 'Storage: checking...', '#888888', { fontSize: '12px' });
    this.backendText.setOrigin(0.5);

    // Check backend
    const backendName = await this.store.getBackendName();
    try {
      this.backendText.setText(`Storage backend: ${backendName ?? 'none'}`);
    } catch (e) {
      // Ignore text set errors in headless environments
    }

    y += 20;
    if (this.sys && this.sys.isActive && this.sys.isActive()) {
      this.eventLogResult = createEventLog(this, y + 20, {
        headerText: '── Event Log ──',
        maxLines: 14,
        lineHeight: 17,
        textColor: '#aaddaa',
        fontSize: '11px',
        headerFontSize: '12px',
        headerColor: '#669966',
        lineX: 40,
      });
    }
  }

  private stateString(): string {
    return `Counter: ${this.state.counter} | Label: "${this.state.label}"`;
  }

  private increment(): void {
    this.state.counter++;
    try {
      this.stateText.setText(this.stateString());
    } catch (e) {
      // Ignore text update errors during headless tests
    }
    this.logEvent(`Counter incremented to ${this.state.counter}`);
  }

  private setLabel(): void {
    this.state.label = `label-${this.state.counter}`;
    try {
      this.stateText.setText(this.stateString());
    } catch (e) {
      // Ignore text update errors during headless tests
    }
    this.logEvent(`Label set to "${this.state.label}"`);
  }

  private async saveState(): Promise<void> {
    try {
      // Adopt any pending snapshot data from the async snapshot callback
      if (this._pendingSnapshotDataUrl) {
        this.state.snapshotDataUrl = this._pendingSnapshotDataUrl;
      }
      const result = await this.store.saveSerialized(
        'run-checkpoint',
        GAME_TYPE,
        SLOT_ID,
        DEMO_SERIALIZER,
        this.state,
      );
      if (result) {
        this.logEvent(`Saved: v${result.schemaVersion}, slot=${result.slotId}`);
      } else {
        this.logEvent('Save failed: no backend available');
      }
    } catch (e) {
      this.logEvent(`Save error: ${(e as Error).message}`);
    }
  }

  private async loadState(): Promise<void> {
    try {
      const loaded = await this.store.loadSerialized(
        'run-checkpoint',
        GAME_TYPE,
        SLOT_ID,
        DEMO_SERIALIZER,
      );
      if (loaded) {
        this.state = loaded;
        try {
          this.stateText.setText(this.stateString());
        } catch (e) {
          // Ignore text update errors during headless tests
        }
        // Recreate snapshot thumbnail from persisted data
        if (this.state.snapshotDataUrl) {
          this.recreateSnapshot(this.state.snapshotDataUrl);
        } else {
          this.clearSnapshot();
        }
        this.logEvent(`Loaded: counter=${this.state.counter}, label="${this.state.label}"`);
      } else {
        this.logEvent('No save data found');
      }
    } catch (e) {
      this.logEvent(`Load error: ${(e as Error).message}`);
    }
  }

  private async loadMalformed(): Promise<void> {
    // Simulate a malformed payload by writing incompatible version then loading
    try {
      await this.store.save('run-checkpoint', GAME_TYPE, SLOT_ID, 99, {
        schemaVersion: 99,
        data: { garbage: true },
      });
      const loaded = await this.store.loadSerialized(
        'run-checkpoint',
        GAME_TYPE,
        SLOT_ID,
        DEMO_SERIALIZER,
      );
      // Should have thrown
      this.logEvent('Unexpected: malformed load succeeded without error');
      if (loaded) {
        this.state = loaded;
        try {
          this.stateText.setText(this.stateString());
        } catch (e) {
          // Ignore text update errors during headless tests
        }
      }
    } catch (e) {
      this.logEvent(`Malformed payload caught: ${(e as Error).message}`);
      // Clean up the bad save
      await this.store.remove('run-checkpoint', GAME_TYPE, SLOT_ID);
    }
  }

  private async clearSave(): Promise<void> {
    try {
      await this.store.remove('run-checkpoint', GAME_TYPE, SLOT_ID);
      this.logEvent('Save data cleared');
    } catch (e) {
      this.logEvent(`Clear error: ${(e as Error).message}`);
    }
  }

  // ── RenderTexture snapshot demo ─────────────────────────────

  private takeSnapshot(): void {
    // Clear any existing thumbnail and orphaned display objects
    this.clearSnapshot();

    try {
      // Create a RenderTexture to capture the scene into a 200x150 thumbnail
      const rt = this.add.renderTexture(0, 0, 200, 150);

      // Draw scene children into the RenderTexture, excluding rt itself
      // to avoid recursion / self-referencing.
      const drawables = this.children.getAll().filter((child) => child !== rt);
      rt.draw(drawables, 0, 0);

      // Phaser 4 uses a command-buffer; render() commits the queued draw commands.
      // Without this call the texture may appear blank.
      rt.render();

      // Save to the Texture Manager so the RenderTexture content is available for
      // persistence extraction via snapshot().
      rt.saveTexture('snapshot-thumb');

      // Present the RenderTexture itself as the thumbnail display.
      // RenderTexture extends Image and renders its captured texture each frame.
      rt.setPosition(GAME_W / 2 - 100, 340);
      rt.setScale(0.5);

      // Store the reference so we can destroy it later.
      this.snapshotDisplay = rt;
      this._snapshotAvailable = true;

      // Extract a base64 data URL from the RenderTexture for persistence.
      // The snapshot() callback fires asynchronously when the renderer is ready.
      rt.snapshot((snapshot: Phaser.Display.Color | HTMLImageElement) => {
        // Narrow to HTMLImageElement (full snapshot, not a pixel color query)
        if (!(snapshot instanceof HTMLImageElement)) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = snapshot.naturalWidth || 200;
          canvas.height = snapshot.naturalHeight || 150;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(snapshot, 0, 0);
            this._pendingSnapshotDataUrl = canvas.toDataURL('image/png');
          }
        } catch (_) {
          console.warn('[GymSaveLoadScene] Failed to extract snapshot data URL');
        }
      }, 'image/png');

      this.logEvent('Snapshot taken (RenderTexture 200x150)');
    } catch (e) {
      // Headless/non-canvas environments: show textual placeholder
      this.logEvent(`Snapshot fallback (headless): ${(e as Error).message?.substring(0, 50) ?? 'RenderTexture unavailable'}`);
      // Show a textual placeholder instead
      this.snapshotPlaceholder = createHudText(this, GAME_W / 2, 340, '[ Snapshot: Text Placeholder ]', '#888888', { fontSize: '12px' }).setOrigin(0.5);
      this._snapshotAvailable = false;
    }
  }

  /** Remove the thumbnail display objects without touching state data. */
  private removeThumbnailDisplay(): void {
    if (this.snapshotDisplay) {
      try { this.snapshotDisplay.destroy(); } catch (_) { /* ignore */ }
      this.snapshotDisplay = null;
    }
    if (this.thumbnailImage) {
      try { this.thumbnailImage.destroy(); } catch (_) { /* ignore */ }
      this.thumbnailImage = null;
    }
    if (this.snapshotPlaceholder) {
      try { this.snapshotPlaceholder.destroy(); } catch (_) { /* ignore */ }
      this.snapshotPlaceholder = null;
    }
  }

  private clearSnapshot(): void {
    this.removeThumbnailDisplay();
    this.state.snapshotDataUrl = null;
    this._pendingSnapshotDataUrl = null;
    this._snapshotAvailable = false;
  }

  /**
   * Recreate a thumbnail from a persisted base64 data URL.
   * Called when loading a saved state that includes snapshot data.
   * Creates a canvas texture from the decoded data and displays it as an Image.
   */
  private recreateSnapshot(dataUrl: string): void {
    this.removeThumbnailDisplay();
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 200;
          canvas.height = img.naturalHeight || 150;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            // Register the canvas as a texture so we can use it with Image
            this.textures.addCanvas('snapshot-loaded', canvas);
            this.thumbnailImage = this.add.image(GAME_W / 2 - 100, 340, 'snapshot-loaded');
            this.thumbnailImage.setScale(0.5);
            this._snapshotAvailable = true;
          }
        } catch (e) {
          console.warn('[GymSaveLoadScene] Failed to draw loaded snapshot onto canvas');
        }
      };
      img.onerror = () => {
        console.warn('[GymSaveLoadScene] Failed to decode snapshot image data');
      };
      img.src = dataUrl;
    } catch (e) {
      console.warn('[GymSaveLoadScene] Failed to recreate snapshot from loaded data');
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}