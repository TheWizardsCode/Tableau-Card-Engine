/**
 * GymAudioFeedbackScene -- Demonstrates audio mapping, mute toggling,
 * feedback configuration, pop text/icon feedback, and particle celebration
 * using the core-engine SoundManager and UI helper APIs.
 *
 * Features:
 *   - Toggle mute and observe immediate effect
 *   - Predefined event-to-sound mappings
 *   - Invalid sound mapping handled safely
 *   - Volume slider demonstration
 *   - Pop text feedback on events (undo/redo, score changes)
 *   - Particle celebration effect with reduced-motion fallback
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
import { popTextOrIcon } from '../../../src/ui/popTextOrIcon';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';

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
  'undo': 'sfx-test-buzz',
  'redo': 'sfx-test-ding',
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
  // Track pop text targets for cleanup
  private popTargets: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: GYM_AUDIO_FEEDBACK_KEY });
  }

  preload(): void {
    // Load demo audio assets
    this.load.audio('sfx-test-ding', 'assets/audio/card-draw.wav');
    this.load.audio('sfx-test-buzz', 'assets/audio/card-discard.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Audio & Feedback Config');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Demonstrates audio mapping, mute toggling, feedback configuration, pop text feedback, and particle celebration effects.' },
      { heading: 'Controls', body: '[ Toggle Mute ]: Mute/unmute audio.\n[ Volume - ] / [ Volume + ]: Adjust global volume.\n[ Draw Card ] / [ Discard Card ]: Emit events with pop text.\n[ Pop Text ]: Trigger a pop text animation.\n[ Celebrate ]: Trigger a particle burst effect.\n[ Invalid Key ]: Attempt to play an unregistered key (safely ignored).' }
    ]);

    // Initialize sound manager
    let player: SoundPlayer;
    if (this.sound && typeof this.sound.play === 'function') {
      const phaserSound = this.sound;
      player = {
        play: (key: string) => {
          try { phaserSound.play(key); } catch (_err) { /* ignore */ }
          try { this.stubPlayer.play(key); } catch (_e) { /* ignore */ }
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

    this.addButton(cx - 450, y, '[ Toggle Mute ]', () => this.toggleMute());
    this.addButton(cx - 280, y, '[ Volume - ]', () => this.adjustVolume(-0.1));
    this.addButton(cx - 140, y, '[ Volume + ]', () => this.adjustVolume(0.1));
    this.addButton(cx + 10, y, '[ Draw Card ]', () => this.emitEvent('card-drawn'));
    this.addButton(cx + 150, y, '[ Discard Card ]', () => this.emitEvent('card-discarded'));
    this.addButton(cx + 330, y, '[ Invalid Key ]', () => this.playInvalid());

    y += 26;
    this.addButton(cx - 280, y, '[ Pop Text ]', () => this.triggerPopText());
    this.addButton(cx - 100, y, '[ Pop Undo ]', () => this.emitEvent('undo'));
    this.addButton(cx + 60, y, '[ Pop Redo ]', () => this.emitEvent('redo'));
    this.addButton(cx + 220, y, '[ Celebrate ]', () => this.triggerCelebration());

    y += 50;
    this.statusText = createHudText(this, cx, y, this.statusString(), '#ffffff', { fontSize: '16px' }).setOrigin(0.5);

    y += 30;
    createHudText(this, cx, y, '── Sound Call Log ──', '#669966', { fontSize: '12px' }).setOrigin(0.5);
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
      // Show pop text for the event
      this.showPopText(eventName, lastCall.key);
    } else {
      this.logCall(`Event "${eventName}" -> no sound (muted or no mapping)`);
    }
    this.statusText.setText(this.statusString());
  }

  private playInvalid(): void {
    this.soundManager.play('sfx-nonexistent-key');
    this.logCall('Played "sfx-nonexistent-key" -> safely ignored (not registered)');
    this.statusText.setText(this.statusString());
  }

  private triggerPopText(): void {
    const cx = GAME_W / 2;
    // Show a pop text near the center
    popTextOrIcon({
      scene: this,
      label: 'Pop!',
      x: cx + (Math.random() - 0.5) * 200,
      y: 200,
      duration: this.reducedMotion ? 100 : 450,
      reducedMotion: this.reducedMotion,
    });
    this.logCall('Pop text triggered (reduced-motion: ' + this.reducedMotion + ')');
  }

  private showPopText(eventName: string, sfxKey: string): void {
    const displayText = `${eventName}: ${sfxKey}`;
    popTextOrIcon({
      scene: this,
      label: displayText,
      x: GAME_W / 2 + (Math.random() - 0.5) * 100,
      y: 220,
      duration: this.reducedMotion ? 100 : 400,
      reducedMotion: this.reducedMotion,
      style: {
        fontSize: '14px',
        color: '#88ff88',
        fontFamily: 'monospace',
      },
    });
  }

  private triggerCelebration(): void {
    if (this.reducedMotion) {
      this.logCall('Celebrate: skipped (reduced-motion)');
      // Show a simple pop text instead of particles
      popTextOrIcon({
        scene: this,
        label: '🎉',
        x: GAME_W / 2,
        y: 300,
        duration: 200,
        reducedMotion: true,
        scale: 1.5,
      });
      return;
    }

    try {
      // Create a small particle celebration effect
      const cx = GAME_W / 2;
      const cy = 300;

      // Use Phaser's particle system if available
      // Create a simple texture for particles
      const particleKey = 'celebrate-particle';
      if (!this.textures.exists(particleKey)) {
        const g = this.add.graphics();
        g.fillStyle(0x88ff88, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture(particleKey, 8, 8);
        g.destroy();
      }

      // Try to use Phaser v4 particle emitter API
      const texture = this.textures.get(particleKey);
      if (texture && this.add.particles) {
        const emitter = this.add.particles(cx, cy, particleKey, {
          speed: { min: 60, max: 180 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.8, end: 0 },
          lifespan: 800,
          quantity: 20,
          emitting: false,
        });

        // Emit a burst
        emitter.explode(20);
        this.logCall('Celebrate: particle burst emitted');

        // Clean up after particles finish
        this.time.delayedCall(1200, () => {
          try { emitter.destroy(); } catch (_) { /* ignore */ }
        });
      } else {
        // Fallback if particle system unavailable
        popTextOrIcon({
          scene: this,
          label: '🎉',
          x: cx,
          y: cy,
          duration: 600,
          scale: 2,
          riseY: 40,
        });
        this.logCall('Celebrate: pop text fallback');
      }
    } catch (e) {
      // Graceful fallback if any particle system error occurs
      popTextOrIcon({
        scene: this,
        label: '🎉',
        x: GAME_W / 2,
        y: 300,
        duration: 400,
        reducedMotion: this.reducedMotion,
      });
      this.logCall('Celebrate: pop text (particle system unavailable)');
    }
  }

  private logCall(msg: string): void {
    this.callLog.push(msg);
    if (this.callLog.length > 14) this.callLog.shift();
    for (const t of this.callLogTexts) t.destroy();
    this.callLogTexts = [];
    const baseY = 250;
    for (let i = 0; i < this.callLog.length; i++) {
      const txt = createHudText(this, 40, baseY + i * 17, this.callLog[i], '#aaddaa', { fontSize: '11px' });
      this.callLogTexts.push(txt);
    }
  }

  protected cleanup(): void {
    this.soundManager.destroy();
    this.gameEvents.removeAllListeners();
    for (const t of this.popTargets) {
      try { t.destroy(); } catch (_) { /* ignore */ }
    }
    this.popTargets = [];
  }
}