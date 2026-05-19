/**
 * GymAudioFeedbackScene -- Demonstrates audio mapping, mute toggling,
 * and feedback configuration using the core-engine SoundManager API.
 *
 * Features:
 *   - Toggle mute and observe immediate effect
 *   - Predefined event-to-sound mappings
 *   - Invalid sound mapping handled safely
 *   - Volume slider demonstration
 *
 * @module example-games/gym/scenes/GymAudioFeedbackScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_AUDIO_FEEDBACK_KEY } from '../GymRegistry';
import {
  GameEventEmitter,
  SoundManager,
} from '../../../src/core-engine';
import type { SoundPlayer, EventSoundMapping } from '../../../src/core-engine';
import { GAME_W } from '../../../src/ui/constants';

/** A stub SoundPlayer that records play calls instead of producing audio. */
class StubSoundPlayer implements SoundPlayer {
  readonly calls: Array<{ method: string; key: string }> = [];

  play(key: string): void {
    this.calls.push({ method: 'play', key });
  }
  stop(key: string): void {
    this.calls.push({ method: 'stop', key });
  }
  setVolume(_v: number): void { /* no-op for stub */ }
  setMute(_m: boolean): void { /* no-op for stub */ }
}

/** A simple event map for this demo. */
const DEMO_SFX_KEYS = ['sfx-test-ding', 'sfx-test-buzz'] as const;

const DEMO_EVENT_MAPPING: EventSoundMapping = {
  'card-drawn': 'sfx-test-ding',
  'card-discarded': 'sfx-test-buzz',
  'game-ended': 'sfx-test-ding',
};


export class GymAudioFeedbackScene extends GymSceneBase {
  private gameEvents = new GameEventEmitter();
  private stubPlayer = new StubSoundPlayer();
  private soundManager!: SoundManager;
  private muted = false;
  private volume = 0.5;
  private statusText!: Phaser.GameObjects.Text;
  private callLogTexts: Phaser.GameObjects.Text[] = [];
  private callLog: string[] = [];

  constructor() {
    super({ key: GYM_AUDIO_FEEDBACK_KEY });
  }

  preload(): void {
    // Load demo audio assets so the Phaser sound system can play them
    this.load.audio('sfx-test-ding', 'assets/audio/card-draw.wav');
    this.load.audio('sfx-test-buzz', 'assets/audio/card-discard.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Audio & Feedback Config');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates audio mapping, mute toggling, and feedback configuration via SoundManager. Uses a stub player when audio is unavailable.' },
      { heading: 'Controls', body: '[ Toggle Mute ]: Mute/unmute audio.\n[ Volume - ] / [ Volume + ]: Adjust global volume.\n[ Draw Card ] / [ Discard Card ]: Emit events mapped to sounds.\n[ Invalid Key ]: Attempt to play an unregistered key (safely ignored).' }
    ]);

    // Initialize sound manager using Phaser's sound system when available.
    // Fall back to a stub player in environments without audio support.
    let player: SoundPlayer;
    if (this.sound && typeof this.sound.play === 'function') {
      const phaserSound = this.sound;
      player = {
        play: (key: string) => {
          try {
            phaserSound.play(key);
          } catch (_err) {
            // ignore play errors (browser autoplay policies, etc.)
          }
          try {
            // Record the play in the stub so UI/logging can reflect it
            this.stubPlayer.play(key);
          } catch (_e) { /* ignore */ }
        },
        stop: (key: string) => {
          try { (phaserSound as any).stopByKey?.(key); } catch (_) { /* ignore */ }
          try { this.stubPlayer.stop(key); } catch (_) { /* ignore */ }
        },
        setVolume: (v: number) => {
          try { phaserSound.volume = v; } catch (_) { /* ignore */ }
          try { this.stubPlayer.setVolume(v); } catch (_) { /* ignore */ }
        },
        setMute: (m: boolean) => {
          try { phaserSound.mute = m; } catch (_) { /* ignore */ }
          try { this.stubPlayer.setMute(m); } catch (_) { /* ignore */ }
        },
      };
    } else {
      player = this.stubPlayer;
    }

    this.soundManager = new SoundManager(player, { storage: null });
    for (const key of DEMO_SFX_KEYS) {
      this.soundManager.register(key);
    }
    this.soundManager.connectToEvents(this.gameEvents, DEMO_EVENT_MAPPING);
    this.soundManager.setVolume(this.volume);

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ Toggle Mute ]', () => this.toggleMute());
    this.addButton(cx - 230, y, '[ Volume - ]', () => this.adjustVolume(-0.1));
    this.addButton(cx - 90, y, '[ Volume + ]', () => this.adjustVolume(0.1));
    this.addButton(cx + 50, y, '[ Draw Card ]', () => this.emitEvent('card-drawn'));
    this.addButton(cx + 210, y, '[ Discard Card ]', () => this.emitEvent('card-discarded'));
    this.addButton(cx + 380, y, '[ Invalid Key ]', () => this.playInvalid());

    y += 50;
    this.statusText = this.add.text(cx, y, this.statusString(), {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    y += 30;
    this.addLabel(cx, y, '── Sound Call Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);
  }

  private statusString(): string {
    return `Muted: ${this.muted} | Volume: ${this.volume.toFixed(1)} | Calls: ${this.stubPlayer.calls.length}`;
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.soundManager.setMute(this.muted);
    this.statusText.setText(this.statusString());
    this.logCall(`Mute toggled -> ${this.muted}`);
  }

  private adjustVolume(delta: number): void {
    this.volume = Math.round(Math.max(0, Math.min(1, this.volume + delta)) * 10) / 10;
    this.soundManager.setVolume(this.volume);
    this.statusText.setText(this.statusString());
    this.logCall(`Volume set to ${this.volume.toFixed(1)}`);
  }

  private emitEvent(eventName: string): void {
    this.gameEvents.emit(eventName as any, { turnNumber: 1 });
    const lastCall = this.stubPlayer.calls[this.stubPlayer.calls.length - 1];
    if (lastCall) {
      this.logCall(`Event "${eventName}" -> play("${lastCall.key}")`);
    } else {
      this.logCall(`Event "${eventName}" -> no sound (muted or no mapping)`);
    }
    this.statusText.setText(this.statusString());
  }

  private playInvalid(): void {
    // Try to play a key that doesn't exist -- should be safely ignored
    this.soundManager.play('sfx-nonexistent-key');
    this.logCall('Played "sfx-nonexistent-key" -> safely ignored (not registered)');
    this.statusText.setText(this.statusString());
  }

  private logCall(msg: string): void {
    this.callLog.push(msg);
    if (this.callLog.length > 14) this.callLog.shift();
    for (const t of this.callLogTexts) t.destroy();
    this.callLogTexts = [];
    const baseY = 170;
    for (let i = 0; i < this.callLog.length; i++) {
      const txt = this.add.text(40, baseY + i * 17, this.callLog[i], {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.callLogTexts.push(txt);
    }
  }

  protected cleanup(): void {
    this.soundManager.destroy();
    this.gameEvents.removeAllListeners();
  }
}