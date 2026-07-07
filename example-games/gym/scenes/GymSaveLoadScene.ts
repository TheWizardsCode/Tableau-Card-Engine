/**
 * GymSaveLoadScene -- Demonstrates save/load state round-trips using
 * the core-engine SaveLoadStore API.
 *
 * Features:
 *   - Save current scene state (hand of cards + screenshot) to persistent storage
 *   - Load and restore saved state
 *   - Handle malformed save payloads safely
 *   - Full-screen RenderTexture screenshot captured and displayed as thumbnail
 *   - Hand display via reusable HandView component (arc layout, lower centre)
 *   - Add Card button deals a random card; score totals card values
 *
 * @module example-games/gym/scenes/GymSaveLoadScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_SAVE_LOAD_KEY } from '../GymRegistry';
import {
  SaveLoadStore,
} from '../../../src/core-engine';
import type { SaveSerializer } from '../../../src/core-engine';
import { GAME_W, GAME_H, CARD_W, CARD_H } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { createCard, shuffleArray, createStandardDeck, rankValue } from '../../../src/card-system';
import type { Card, Rank, Suit } from '../../../src/card-system';
import { ensureCardTextureFallbacks, preloadCardAssets } from '../../../src/ui/CardTextureHelpers';
import { HandView } from '../../../src/ui/HandView';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymSaveLoadLayoutJson from '../layouts/gym-save-load.layout.json';

// Parse the shared Save/Load scene layout once at module load.
const SAVE_LOAD_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymSaveLoadLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveSaveLoadAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!SAVE_LOAD_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(SAVE_LOAD_LAYOUT, zone, anchor, viewport, 1);
}

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

/** Card spacing & arc for HandView (lower centre of screen). */
const HAND_SPACING = 74;
const HAND_ARC_RADIUS = 350;

/*
 * HandView baseX is the horizontal centre of the hand.
 * baseY is the Y centre of the first card; we place it a card-height
 * below the previous position.
 */
const HAND_BASE_X = GAME_W / 2;
const HAND_BASE_Y = GAME_H * 0.65 + CARD_H; // ~598

/** Full-screen RenderTexture for the screenshot, displayed at this scale. */
const SCREENSHOT_THUMB_SCALE = 0.25;

export class GymSaveLoadScene extends GymSceneBase {
  private state: DemoState = { hand: [], screenshotDataUrl: null };
  private store!: SaveLoadStore;
  private stateText!: Phaser.GameObjects.Text;
  private backendText!: Phaser.GameObjects.Text;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  /** Reusable HandView component for the hand display. */
  private handView!: HandView;
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

  /**
   * Preload the real card SVG assets from the shared card sprite set.
   * Falls back to placeholders if the SVGs are unavailable.
   */
  preload(): void {
    preloadCardAssets(this, CARD_W, CARD_H);
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Save / Load State');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates saving and loading scene state via the SaveLoadStore API. Includes handling malformed payloads, full-screen RenderTexture screenshots, a hand of cards displayed via HandView, and verifying invariants after restore.' },
      { heading: 'Controls', body: '[ Add Card ]: Deal a random card to the hand.\n[ Save State ]: Persist current hand + screenshot.\n[ Load State ]: Restore last saved hand + screenshot.\n[ Load Malformed ]: Simulate a bad payload to verify error handling.\n[ Clear Save ]: Remove persisted save data.\n[ Take Screenshot ]: Capture a full-screen RenderTexture screenshot.\n[ Clear Screenshot ]: Remove the screenshot thumbnail.' },
    ]);

    // Generate fallback card textures if the real SVGs did not load
    ensureCardTextureFallbacks(this);

    // Initialise the source deck and deal the starting hand, centred
    this.deck = shuffleArray(createStandardDeck());
    const initialHand: Card[] = [];
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      const card = this.deck.pop()!;
      card.faceUp = true;
      initialHand.push(card);
    }
    this.state = { hand: initialHand, screenshotDataUrl: null };

    this.store = new SaveLoadStore({ dbName: 'gym-save-load', localStoragePrefix: 'gym-sl' });

    // ── HandView (lower centre, arc, full-size cards) ─────────

    this.handView = new HandView(this, {
      baseX: HAND_BASE_X,
      baseY: HAND_BASE_Y,
      spacing: HAND_SPACING,
      cardWidth: CARD_W,
      arcRadius: HAND_ARC_RADIUS,
      showLabels: false,
      selectionEnabled: false,
      clickEnabled: false,
    });
    this.handView.setCards(this.state.hand);

    // ── Buttons ───────────────────────────────────────────────
    const cx = GAME_W / 2;
    const controlsAnchor = resolveSaveLoadAnchor('controls', 'center');
    const controls2Anchor = resolveSaveLoadAnchor('controls2', 'center');
    const stateAnchor = resolveSaveLoadAnchor('state', 'center');
    const backendAnchor = resolveSaveLoadAnchor('backend', 'center');
    const logAnchor = resolveSaveLoadAnchor('log', 'center');
    const y = controlsAnchor.y;

    this.addButton(cx - 400, y, '[ Add Card ]', () => this.addCard());
    this.addButton(cx - 240, y, '[ Save State ]', () => this.saveState());
    this.addButton(cx - 80, y, '[ Load State ]', () => this.loadState());
    this.addButton(cx + 80, y, '[ Load Malformed ]', () => this.loadMalformed());
    this.addButton(cx + 240, y, '[ Clear Save ]', () => this.clearSave());

    const y2 = controls2Anchor.y;
    this.addButton(cx - 300, y2, '[ Take Screenshot ]', () => this.takeScreenshot());
    this.addButton(cx - 100, y2, '[ Clear Screenshot ]', () => this.clearScreenshot());

    // ── State text ────────────────────────────────────────────
    try {
      this.stateText = createHudText(this, cx, stateAnchor.y, this.stateString(), '#ffffff', { fontSize: '18px' }).setOrigin(0.5);
    } catch (e) {
      this.stateText = this.addLabel(cx, stateAnchor.y, this.stateString(), { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    }

    this.backendText = createHudText(this, cx, backendAnchor.y, 'Storage: checking...', '#888888', { fontSize: '12px' });
    this.backendText.setOrigin(0.5);

    const backendName = await this.store.getBackendName();
    try {
      this.backendText.setText(`Storage backend: ${backendName ?? 'none'}`);
    } catch (e) {
      // Ignore text set errors in headless environments
    }

    // ── Event log (reduced lines to leave room for screenshot) ─
    if (this.sys && this.sys.isActive && this.sys.isActive()) {
      this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
        headerText: '── Event Log ──',
        maxLines: 8,
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

  // ── Card actions ─────────────────────────────────────────────

  private addCard(): void {
    if (this.deck.length === 0) {
      this.deck = shuffleArray(createStandardDeck());
    }
    const card = this.deck.pop()!;
    card.faceUp = true;
    this.state.hand.push(card);
    this.handView.addCard(card);
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
        this.handView.setCards(this.state.hand);
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
        this.handView.setCards(this.state.hand);
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

  // ── RenderTexture screenshot (full-screen) ───────────────────

  private takeScreenshot(): void {
    this.clearScreenshot();

    try {
      // Capture the entire game canvas into a full-size RenderTexture.
      // By leaving the RT camera at default scroll (0,0) and making the
      // RT the same size as the game, all scene children are captured at
      // their world positions through the main scene camera.
      const rt = this.add.renderTexture(0, 0, GAME_W, GAME_H);

      // Exclude rt itself from the draw
      const drawables = this.children.getAll().filter((child) => child !== rt);
      rt.draw(drawables, 0, 0);
      rt.render();

      rt.saveTexture('screenshot-thumb');

      // Display as a thumbnail centred below the controls
      rt.setPosition(GAME_W / 2, 360);
      rt.setScale(SCREENSHOT_THUMB_SCALE);

      this.screenshotDisplay = rt;
      this._screenshotAvailable = true;

      // Extract a base64 data URL for persistence.
      rt.snapshot((snapshot: Phaser.Display.Color | HTMLImageElement) => {
        if (!(snapshot instanceof HTMLImageElement)) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = snapshot.naturalWidth || GAME_W;
          canvas.height = snapshot.naturalHeight || GAME_H;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(snapshot, 0, 0);
            this._pendingScreenshotDataUrl = canvas.toDataURL('image/png');
          }
        } catch (_) {
          console.warn('[GymSaveLoadScene] Failed to extract screenshot data URL');
        }
      }, 'image/png');

      this.logEvent('Screenshot taken (full-screen)');
    } catch (e) {
      this.logEvent(`Screenshot fallback (headless): ${(e as Error).message?.substring(0, 50) ?? 'RenderTexture unavailable'}`);
      this.screenshotPlaceholder = createHudText(this, GAME_W / 2, 360, '[ Screenshot: Text Placeholder ]', '#888888', { fontSize: '12px' }).setOrigin(0.5);
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
          canvas.width = img.naturalWidth || GAME_W;
          canvas.height = img.naturalHeight || GAME_H;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            this.textures.addCanvas('screenshot-loaded', canvas);
            this.screenshotImage = this.add.image(GAME_W / 2, 360, 'screenshot-loaded');
            this.screenshotImage.setScale(SCREENSHOT_THUMB_SCALE);
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
    if (this.eventLog.length > 8) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }
}
