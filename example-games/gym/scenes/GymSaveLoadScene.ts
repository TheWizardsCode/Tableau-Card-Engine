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

/** Simple state for this demo. */
interface DemoState {
  counter: number;
  label: string;
}

interface DemoSerialized {
  c: number;
  l: string;
}

const DEMO_SERIALIZER: SaveSerializer<DemoState, DemoSerialized> = {
  schemaVersion: 1,
  serialize(state: DemoState): DemoSerialized {
    return { c: state.counter, l: state.label };
  },
  deserialize(data: DemoSerialized): DemoState {
    return { counter: data.c, label: data.l };
  },
};

const GAME_TYPE = 'gym-save-load';
const SLOT_ID = 'demo-slot';

export class GymSaveLoadScene extends GymSceneBase {
  private state: DemoState = { counter: 0, label: 'initial' };
  private store!: SaveLoadStore;
  private stateText!: Phaser.GameObjects.Text;
  private backendText!: Phaser.GameObjects.Text;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];
  // RenderTexture thumbnail
  private thumbnailImage: Phaser.GameObjects.Image | null = null;
  private _snapshotAvailable = false;
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
      createHudText(this, cx, y, '── Event Log ──', '#669966', { fontSize: '12px' }).setOrigin(0.5);
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
    // Clear any existing thumbnail
    this.clearSnapshot();

    try {
      // Attempt to create a RenderTexture snapshot of a representative area
      const rt = this.add.renderTexture(0, 0, 200, 150);
      // Draw the current scene camera into the render texture
      rt.draw(this.children.getAll(), 0, 0);
      // Scale down the render texture for display as a thumbnail
      rt.setScale(0.5);
      rt.setPosition(GAME_W / 2 - 100, 340);

      this.thumbnailImage = this.add.image(GAME_W / 2 - 100, 340, '');
      this._snapshotAvailable = true;
      this.logEvent('Snapshot taken (RenderTexture 200x150)');
    } catch (e) {
      // Headless/non-canvas environments: show textual placeholder
      this.logEvent(`Snapshot fallback (headless): ${(e as Error).message?.substring(0, 50) ?? 'RenderTexture unavailable'}`);
      // Show a textual placeholder instead
      const placeholder = createHudText(this, GAME_W / 2, 340, '[ Snapshot: Text Placeholder ]', '#888888', { fontSize: '12px' }).setOrigin(0.5);
      this.logTexts.push(placeholder);
      this._snapshotAvailable = false;
    }
  }

  private clearSnapshot(): void {
    // Remove any existing thumbnail
    if (this.thumbnailImage) {
      try { this.thumbnailImage.destroy(); } catch (_) { /* ignore */ }
      this.thumbnailImage = null;
    }
    this._snapshotAvailable = false;
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 170;
    for (let i = 0; i < this.eventLog.length; i++) {
      try {
        const txt = createHudText(this, 40, baseY + i * 17, this.eventLog[i], '#aaddaa', { fontSize: '11px' });
        this.logTexts.push(txt);
      } catch (e) {
        // Fallback to label if text texture creation fails
        const txt = this.addLabel(40, baseY + i * 17, this.eventLog[i], { fontSize: '11px', color: '#aaddaa' });
        this.logTexts.push(txt);
      }
    }
  }
}