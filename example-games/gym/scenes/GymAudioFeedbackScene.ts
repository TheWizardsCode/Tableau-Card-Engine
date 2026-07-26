/**
 * GymAudioFeedbackScene -- Demonstrates audio mapping, mute toggling,
 * feedback configuration, pop text/icon feedback, and particle celebration
 * using the core-engine SoundManager and UI helper APIs.
 *
 * Features:
 *   - Auto-discovers all default sound keys and generates buttons dynamically
 *   - Auto-discovers visual feedback types and generates trigger buttons
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
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymAudioFeedbackLayoutJson from '../layouts/gym-audio-feedback.layout.json';

// Parse the shared Audio Feedback scene layout once at module load.
const AUDIO_FEEDBACK_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymAudioFeedbackLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveAudioAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!AUDIO_FEEDBACK_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(AUDIO_FEEDBACK_LAYOUT, zone, anchor, viewport, 1);
}

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

// ── Auto-discovered defaults ──────────────────────────────────

/**
 * All default sound keys that the gym scene registers and demonstrates.
 * These correspond to WAV files in `public/assets/audio/default/` and
 * the COMMON_SFX_KEYS from SoundManager.
 */
const DEFAULT_SFX_KEYS = [
  'sfx-ui-click',
  'sfx-turn-change',
  'sfx-round-end',
  'sfx-score-reveal',
  'sfx-card-draw',
  'sfx-card-flip',
  'sfx-card-discard',
  'sfx-card-swap',
] as const;

/**
 * Default event-to-sound mappings for the gym demo.
 * Each event triggers the corresponding sound when emitted.
 */
const DEFAULT_EVENT_MAPPING: EventSoundMapping = {
  'card-drawn': 'sfx-card-draw',
  'card-flipped': 'sfx-card-flip',
  'card-discarded': 'sfx-card-discard',
  'card-swapped': 'sfx-card-swap',
  'ui-interaction': 'sfx-ui-click',
  'turn-started': 'sfx-turn-change',
  'game-ended': 'sfx-round-end',
  'turn-completed': 'sfx-score-reveal',
};

/**
 * Visual feedback types that can be triggered from the scene.
 * Each entry describes a type of visual feedback with a label and
 * a trigger function that will be called from the generated button.
 */
interface FeedbackTypeEntry {
  label: string;
  description: string;
}

const FEEDBACK_TYPES: FeedbackTypeEntry[] = [
  { label: 'popTextOrIcon', description: 'Pop text or icon animation' },
  { label: 'Celebrate', description: 'Particle celebration burst' },
];

// ── Scene class ───────────────────────────────────────────────

export class GymAudioFeedbackScene extends GymSceneBase {
  private gameEvents = new GameEventEmitter();
  private stubPlayer = new StubSoundPlayer();
  private soundManager!: SoundManager;
  private muted = false;
  private volume = 0.5;
  private statusText!: Phaser.GameObjects.Text;
  private callLog: string[] = [];
  private eventLogResult!: EventLogResult;
  // Track dynamically generated buttons for cleanup
  private dynamicButtons: Phaser.GameObjects.Text[] = [];
  // Track pop text targets for cleanup
  private popTargets: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: GYM_AUDIO_FEEDBACK_KEY });
  }

  preload(): void {
    // Load default audio assets
    this.load.audio('sfx-ui-click', 'assets/audio/default/ui-click.wav');
    this.load.audio('sfx-turn-change', 'assets/audio/default/turn-change.wav');
    this.load.audio('sfx-round-end', 'assets/audio/default/round-end.wav');
    this.load.audio('sfx-score-reveal', 'assets/audio/default/score-reveal.wav');
    this.load.audio('sfx-card-draw', 'assets/audio/default/card-draw.wav');
    this.load.audio('sfx-card-flip', 'assets/audio/default/card-flip.wav');
    this.load.audio('sfx-card-discard', 'assets/audio/default/card-discard.wav');
    this.load.audio('sfx-card-swap', 'assets/audio/default/card-swap.wav');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Audio & Feedback Config');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates audio event mapping and feedback configuration using the SoundManager, along with pop text animations (popTextOrIcon) and particle celebration effects. The SoundManager connects game events to sound keys, providing volume control, mute toggling, and graceful handling of missing or unregistered sound keys. Sounds and feedback types are auto-discovered and dynamically generate buttons.'
      },
      {
        heading: 'Controls',
        body: '[ Toggle Mute ]: Toggle audio mute on/off.\n[ Volume - ] / [ Volume + ]: Adjust global volume in 0.1 steps.\n[ Invalid Key ]: Demonstrate safe handling of unregistered keys.\nSound event buttons: Auto-generated for each registered sound key.\nFeedback type buttons: Auto-generated for each visual feedback type.'
      },
      {
        heading: 'Usage Example',
        body: 'In a game of Golf, a "ding" plays when a card is drawn, and a "buzz" when discarded. The player can mute audio or adjust volume. After winning a round, a particle celebration bursts across the screen.'
      }
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
    for (const key of DEFAULT_SFX_KEYS) {
      this.soundManager.register(key);
    }
    this.soundManager.connectToEvents(this.gameEvents, DEFAULT_EVENT_MAPPING);
    this.soundManager.setVolume(this.volume);

    // ── Status and log ──────────────────────────────────
    const cx = GAME_W / 2;
    const statusAnchor = resolveAudioAnchor('status', 'center');
    const logAnchor = resolveAudioAnchor('log', 'center');

    this.statusText = createHudText(
      this, cx, statusAnchor.y,
      this.statusString(), '#ffffff', { fontSize: '16px' },
    ).setOrigin(0.5);

    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
      headerText: '── Activity Log ──',
      maxLines: 16,
      lineHeight: 17,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });

    // ── Control buttons (row 1: core controls) ──────────
    const controlsAnchor = resolveAudioAnchor('controls', 'center');
    const y = controlsAnchor.y;

    this.initButtonBar(y);
    this.buttonBar!.addButton('[ Toggle Mute ]', () => this.toggleMute(), { zone: 'center' });
    this.buttonBar!.addButton('[ Volume - ]', () => this.adjustVolume(-0.1), { zone: 'center' });
    this.buttonBar!.addButton('[ Volume + ]', () => this.adjustVolume(0.1), { zone: 'center' });
    this.buttonBar!.addButton('[ Invalid Key ]', () => this.playInvalid(), { zone: 'center' });

    // ── Dynamic sound event buttons ─────────────────────
    // Auto-discover registered sound keys from SoundManager
    // and generate a button for each one that emits the
    // corresponding event.
    const eventToButtonLabel: Record<string, string> = {
      'card-drawn': 'Draw Card',
      'card-flipped': 'Flip Card',
      'card-discarded': 'Discard Card',
      'card-swapped': 'Swap Card',
      'ui-interaction': 'UI Click',
      'turn-started': 'Turn Change',
      'game-ended': 'Round End',
      'turn-completed': 'Score Reveal',
    };

    const controls2Anchor = resolveAudioAnchor('controls2', 'center');
    const y2 = controls2Anchor.y;

    // Spread sound event buttons across the full width starting from left margin
    const LEFT_MARGIN = 40;
    const soundEventCount = Object.entries(DEFAULT_EVENT_MAPPING).filter(
      ([eventName, soundKey]) => {
        const label = eventToButtonLabel[eventName];
        if (!label) return false;
        return Array.from(this.soundManager.keys()).includes(soundKey);
      },
    ).length;
    const soundSpacing = (GAME_W - LEFT_MARGIN * 2) / Math.max(soundEventCount, 1);
    let btnIndex = 0;

    // Generate buttons for each event in DEFAULT_EVENT_MAPPING
    // that has a corresponding label in eventToButtonLabel
    for (const [eventName, soundKey] of Object.entries(DEFAULT_EVENT_MAPPING)) {
      const label = eventToButtonLabel[eventName];
      if (!label) continue; // Skip unmapped events

      const keysFromManager = Array.from(this.soundManager.keys());
      if (!keysFromManager.includes(soundKey)) continue; // Only if sound is registered

      const btnLabel = `[ ${label} ]`;
      const xPos = LEFT_MARGIN + btnIndex * soundSpacing;
      const btn = this.addButton(xPos, y2, btnLabel, () => this.emitEvent(eventName));
      this.dynamicButtons.push(btn);
      btnIndex++;
    }

    // ── Dynamic visual feedback buttons (row 3) ─────────
    const feedbackY = y2 + 28;
    const feedbackSpacing = (GAME_W - LEFT_MARGIN * 2) / Math.max(FEEDBACK_TYPES.length, 1);
    let feedbackIndex = 0;

    for (const ft of FEEDBACK_TYPES) {
      const btnLabel = `[ ${ft.label} ]`;
      const xPos = LEFT_MARGIN + feedbackIndex * feedbackSpacing;
      const btn = this.addButton(xPos, feedbackY, btnLabel, () => {
        if (ft.label === 'Celebrate') {
          this.triggerCelebration();
        } else {
          this.triggerPopText();
        }
      });
      this.dynamicButtons.push(btn);
      feedbackIndex++;
    }

    // Log the auto-discovery
    this.logCall(
      `Auto-discovered ${Array.from(this.soundManager.keys()).length} sound keys, ` +
      `${FEEDBACK_TYPES.length} feedback types`,
    );
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

  private showPopText(eventName: string, _sfxKey: string): void {
    // Display a music note icon with the event name as visual feedback
    // that a sound was triggered. The sound key is omitted since it's
    // internal debug info — the event name is sufficient to indicate
    // which action produced the sound.
    const displayText = `♪ ${eventName}`;
    popTextOrIcon({
      scene: this,
      label: displayText,
      x: GAME_W / 2 + (Math.random() - 0.5) * 100,
      y: 220,
      duration: this.reducedMotion ? 500 : 1800,
      reducedMotion: this.reducedMotion,
      style: {
        fontSize: '20px',
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
    if (this.callLog.length > 16) this.callLog.shift();
    this.eventLogResult.render(this.callLog);
  }

  protected cleanup(): void {
    this.soundManager.destroy();
    this.gameEvents.removeAllListeners();
    for (const t of this.popTargets) {
      try { t.destroy(); } catch (_) { /* ignore */ }
    }
    this.popTargets = [];
    // Clean up dynamic buttons
    for (const btn of this.dynamicButtons) {
      try { btn.destroy(); } catch (_) { /* ignore */ }
    }
    this.dynamicButtons = [];
  }
}
