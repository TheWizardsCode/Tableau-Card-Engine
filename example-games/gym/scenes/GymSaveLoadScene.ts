/**
 * GymSaveLoadScene -- Demonstrates save/load state round-trips using
 * the core-engine SaveLoadStore API.
 *
 * Features:
 *   - Save current scene state (hand of cards + snapshot) to persistent storage
 *   - Load and restore saved state
 *   - Handle malformed save payloads safely
 *   - RenderTexture screenshot on save (with headless fallback)
 *   - Hand display with card sprites for visual snapshot interest
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
import { createCard, shuffleArray, createStandardDeck, rankValue } from '../../../src/card-system';
import type { Card, Rank, Suit } from '../../../src/card-system';
import { getCardTexture, ensureCardTextureFallbacks } from '../../../src/ui/CardTextureHelpers';

// ── Card score: A=1, 2=2, ..., J=11, Q=12, K=13 ────────────
function cardScore(rank: Rank): number {
  return rankValue(rank) + 1;
}

// ── State & serialisation types ────────────────────────────

/** State tracked by this demo scene. */
interface DemoState {
  hand: Card[];
  /** Base64 data URL of the screenshot thumbnail, or null. */
  screenshotDataUrl: string | null;
}

/** Wire format for save/load persistence. */
interface DemoSerialized {
  h: Array<{ r: string; s: string }>;
  sd: string | null;
}

const DEMO_SERIALIZER: SaveSerializer<DemoState, DemoSerialized> = {
  schemaVersion: 1,
  serialize(state: DemoState): DemoSerialized {
    return {
      h: state.hand.map((c) => ({ r: c.rank, s: c.suit })),
      sd: state.screenshotDataUrl,
    };
  },
  deserialize(data: DemoSerialized): DemoState {
    const hand = data.h.map((c) => createCard(c.r as Rank, c.s as Suit, true));
    return { hand, screenshotDataUrl: data.sd ?? null };
  },
};

const GAME_TYPE = 'gym-save-load';
const SLOT_ID = 'demo-slot';

/** Number of cards dealt to the starting hand. */
const STARTING_HAND_SIZE = 5;

/** Card display dimensions within the 200×150 screenshot capture area. */
const CARD_DISPLAY_W = 36;
const CARD_DISPLAY_H = 50;
const CARD_GAP = 4;
const CARDS_PER_ROW = 5;
/** Top-left origin for the hand display (inside the capture area). */
const HAND_X0 = 6;
const HAND_Y0 = 40;

export class GymSaveLoadScene extends GymSceneBase {
  private state: DemoState = { hand: [], screenshotDataUrl: null };
  private store!: SaveLoadStore;
  private stateText!: Phaser.GameObjects.Text;
  private backendText!: Phaser.GameObjects.Text;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  /** Phaser Image sprites for each card in the hand. */
  private cardSprites: Phaser.GameObjects.Image[] = [];
  /** Source deck used for dealing random cards. */
  private deck: Card[] = [];
  private screenshotPlaceholder: Phaser.GameObjects.Text | null = null;
  /** The RenderTexture used as the current screenshot display (if any). */
  private screenshotDisplay: Phaser.GameObjects.RenderTexture | null = null;
  /** An Image created from a loaded screenshot data URL (used during load restore). */
  private screenshotImage: Phaser.GameObjects.Image | null = null;
  private _screenshotAvailable = false;
  /** Pending screenshot callback data URL (set async by snapshot()); null if none. */
  private _pendingScreenshotDataUrl: string | null = null;

  /** Whether a screenshot is currently displayed. Read-only for external checks. */
  get screenshotAvailable(): boolean { return this._screenshotAvailable; }

  constructor() {
    super({ key: GYM_SAVE_LOAD_KEY });
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Save / Load State');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates saving and loading scene state via the SaveLoadStore API. Includes handling malformed payloads, RenderTexture screenshots, hand-of-cards display, and verifying invariants after restore.' },
      { heading: 'Controls', body: '[ Add Card ]: Deal a random card to the hand.\n[ Save State ]: Persist current hand + screenshot.\n[ Load State ]: Restore last saved hand + screenshot.\n[ Load Malformed ]: Simulate a bad payload to verify error handling.\n[ Clear Save ]: Remove persisted save data.\n[ Take Screenshot ]: Capture a RenderTexture screenshot including the hand.\n[ Clear Screenshot ]: Remove the screenshot thumbnail.' },
    ]);

    // Ensure card placeholder textures exist (for headless / test envs)
    ensureCardTextureFallbacks(this);

    // Initialise the source deck and deal the starting hand
    this.deck = shuffleArray(createStandardDeck());
    this.state.hand = [];
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      this.state.hand.push(this.deck.pop()!);
    }

    this.store = new SaveLoadStore({ dbName: 'gym-save-load', localStoragePrefix: 'gym-sl' });

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ Add Card ]', () => this.addCard());
    this.addButton(cx - 240, y, '[ Save State ]', () => this.saveState());
    this.addButton(cx - 80, y, '[ Load State ]', () => this.loadState());
    this.addButton(cx + 80, y, '[ Load Malformed ]', () => this.loadMalformed());
    this.addButton(cx + 240, y, '[ Clear Save ]', () => this.clearSave());

    y += 26;
    this.addButton(cx - 300, y, '[ Take Screenshot ]', () => this.takeScreenshot());
    this.addButton(cx - 100, y, '[ Clear Screenshot ]', () => this.clearScreenshot());

    y += 40;
    try {
      this.stateText = createHudText(this, cx, y, this.stateString(), '#ffffff', { fontSize: '18px' }).setOrigin(0.5);
    } catch (e) {
      this.stateText = this.addLabel(cx, y, this.stateString(), { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    }

    y += 30;
    this.backendText = createHudText(this, cx, y, 'Storage: checking...', '#888888', { fontSize: '12px' });
    this.backendText.setOrigin(0.5);

    const backendName = await this.store.getBackendName();
    try {
      this.backendText.setText(`Storage backend: ${backendName ?? 'none'}`);
    } catch (e) {
      // Ignore text set errors in headless environments
    }

    // Render the initial hand of cards
    this.renderHand();

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

  // ── State helpers ───────────────────────────────────────────

  private handSize(): number {
    return this.state.hand.length;
  }

  private score(): number {
    return this.state.hand.reduce((sum, c) => sum + cardScore(c.rank), 0);
  }

  private stateString(): string {
    return `Hand size: ${this.handSize()} | Score: ${this.score()}`;
  }

  private updateStateDisplay(): void {
    try {
      this.stateText.setText(this.stateString());
    } catch (e) {
      // Ignore text update errors during headless tests
    }
  }

  // ── Card rendering (within the 200×150 screenshot capture area) ─

  private renderHand(): void {
    // Destroy old sprites
    for (const s of this.cardSprites) {
      try { s.destroy(); } catch (_) { /* ignore */ }
    }
    this.cardSprites = [];

    // Create sprites for each card, positioned in the capture area
    this.state.hand.forEach((card, i) => {
      const row = Math.floor(i / CARDS_PER_ROW);
      const col = i % CARDS_PER_ROW;
      const x = HAND_X0 + col * (CARD_DISPLAY_W + CARD_GAP) + CARD_DISPLAY_W / 2;
      const y = HAND_Y0 + row * (CARD_DISPLAY_H + CARD_GAP) + CARD_DISPLAY_H / 2;
      const sprite = this.add.image(x, y, getCardTexture(card));
      sprite.setDisplaySize(CARD_DISPLAY_W, CARD_DISPLAY_H);
      this.cardSprites.push(sprite);
    });
  }

  // ── Card actions ─────────────────────────────────────────────

  private addCard(): void {
    if (this.deck.length === 0) {
      this.deck = shuffleArray(createStandardDeck());
    }
    const card = this.deck.pop()!;
    card.faceUp = true;
    this.state.hand.push(card);
    this.renderHand();
    this.updateStateDisplay();
    this.logEvent(`Added ${card.rank} of ${card.suit} (score +${cardScore(card.rank)})`);
  }

  // ── Save / Load ──────────────────────────────────────────────

  private async saveState(): Promise<void> {
    try {
      // Adopt any pending screenshot data from the async snapshot callback
      if (this._pendingScreenshotDataUrl) {
        this.state.screenshotDataUrl = this._pendingScreenshotDataUrl;
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
        // Ensure all loaded cards are face-up
        for (const c of this.state.hand) c.faceUp = true;
        this.renderHand();
        this.updateStateDisplay();
        // Recreate screenshot thumbnail from persisted data
        if (this.state.screenshotDataUrl) {
          this.recreateScreenshot(this.state.screenshotDataUrl);
        } else {
          this.clearScreenshot();
        }
        this.logEvent(`Loaded: hand size=${this.handSize()}, score=${this.score()}`);
      } else {
        this.logEvent('No save data found');
      }
    } catch (e) {
      this.logEvent(`Load error: ${(e as Error).message}`);
    }
  }

  private async loadMalformed(): Promise<void> {
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
      this.logEvent('Unexpected: malformed load succeeded without error');
      if (loaded) {
        this.state = loaded;
        for (const c of this.state.hand) c.faceUp = true;
        this.renderHand();
        this.updateStateDisplay();
      }
    } catch (e) {
      this.logEvent(`Malformed payload caught: ${(e as Error).message}`);
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

  // ── RenderTexture screenshot demo ────────────────────────────

  private takeScreenshot(): void {
    // Clear any existing screenshot display objects
    this.clearScreenshot();

    try {
      // Create a RenderTexture to capture a 200×150 thumbnail of the hand area
      const rt = this.add.renderTexture(0, 0, 200, 150);

      // Draw scene children into the RenderTexture, excluding rt itself
      const drawables = this.children.getAll().filter((child) => child !== rt);
      rt.draw(drawables, 0, 0);

      // Commit the queued draw commands
      rt.render();

      // Save to the Texture Manager so content is available for persistence
      rt.saveTexture('screenshot-thumb');

      // Present the RenderTexture itself as the thumbnail display
      rt.setPosition(GAME_W / 2 - 100, 340);
      rt.setScale(0.5);

      this.screenshotDisplay = rt;
      this._screenshotAvailable = true;

      // Extract a base64 data URL for persistence.
      rt.snapshot((snapshot: Phaser.Display.Color | HTMLImageElement) => {
        if (!(snapshot instanceof HTMLImageElement)) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = snapshot.naturalWidth || 200;
          canvas.height = snapshot.naturalHeight || 150;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(snapshot, 0, 0);
            this._pendingScreenshotDataUrl = canvas.toDataURL('image/png');
          }
        } catch (_) {
          console.warn('[GymSaveLoadScene] Failed to extract screenshot data URL');
        }
      }, 'image/png');

      this.logEvent('Screenshot taken (RenderTexture 200x150)');
    } catch (e) {
      this.logEvent(`Screenshot fallback (headless): ${(e as Error).message?.substring(0, 50) ?? 'RenderTexture unavailable'}`);
      this.screenshotPlaceholder = createHudText(this, GAME_W / 2, 340, '[ Screenshot: Text Placeholder ]', '#888888', { fontSize: '12px' }).setOrigin(0.5);
      this._screenshotAvailable = false;
    }
  }

  /** Remove the screenshot display objects without touching state data. */
  private removeScreenshotDisplay(): void {
    if (this.screenshotDisplay) {
      try { this.screenshotDisplay.destroy(); } catch (_) { /* ignore */ }
      this.screenshotDisplay = null;
    }
    if (this.screenshotImage) {
      try { this.screenshotImage.destroy(); } catch (_) { /* ignore */ }
      this.screenshotImage = null;
    }
    if (this.screenshotPlaceholder) {
      try { this.screenshotPlaceholder.destroy(); } catch (_) { /* ignore */ }
      this.screenshotPlaceholder = null;
    }
  }

  private clearScreenshot(): void {
    this.removeScreenshotDisplay();
    this.state.screenshotDataUrl = null;
    this._pendingScreenshotDataUrl = null;
    this._screenshotAvailable = false;
  }

  /**
   * Recreate a screenshot thumbnail from a persisted base64 data URL.
   * Called when loading a saved state that includes screenshot data.
   */
  private recreateScreenshot(dataUrl: string): void {
    this.removeScreenshotDisplay();
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
            this.textures.addCanvas('screenshot-loaded', canvas);
            this.screenshotImage = this.add.image(GAME_W / 2 - 100, 340, 'screenshot-loaded');
            this.screenshotImage.setScale(0.5);
            this._screenshotAvailable = true;
          }
        } catch (e) {
          console.warn('[GymSaveLoadScene] Failed to draw loaded screenshot onto canvas');
        }
      };
      img.onerror = () => {
        console.warn('[GymSaveLoadScene] Failed to decode screenshot image data');
      };
      img.src = dataUrl;
    } catch (e) {
      console.warn('[GymSaveLoadScene] Failed to recreate screenshot from loaded data');
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 14) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}
