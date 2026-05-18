/**
 * GymTranscriptScene -- Demonstrates transcript capture and deterministic
 * event ordering using the core-engine TranscriptRecorderBase.
 *
 * Features:
 *   - Record transcript events and completion metadata
 *   - Verify fixed-seed runs produce stable transcript structure
 *   - Inspect transcript content (version, gameType, events)
 *
 * @module example-games/gym/scenes/GymTranscriptScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_TRANSCRIPT_KEY } from '../GymRegistry';
import {
  TranscriptRecorderBase,
  createSeededRng,
} from '../../../src/core-engine';
import type { BaseTranscript } from '../../../src/core-engine';
import { GAME_W } from '../../../src/ui/constants';

/** Simple event shape for this demo. */
interface DemoTranscriptEvent {
  type: string;
  turn: number;
  detail: string;
}

/** Transcript shape for this demo. */
interface DemoTranscript extends BaseTranscript<null, DemoTranscriptEvent, null> {
  seed: number;
}

class DemoTranscriptRecorder extends TranscriptRecorderBase<DemoTranscript> {
  private nextTurn = 0;

  constructor(seed: number) {
    super({
      version: 1,
      gameType: 'gym-transcript-demo',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
      seed,
    });
  }

  recordEvent(type: string, detail: string): void {
    this.transcript.events.push({
      type,
      turn: this.nextTurn++,
      detail,
    });
  }

  finalize(): DemoTranscript {
    this.transcript.endedAt = new Date().toISOString();
    return this.getTranscript();
  }
}

export class GymTranscriptScene extends GymSceneBase {
  private recorder: DemoTranscriptRecorder | null = null;
  private rng: (() => number) | null = null;
  private seed = 42;
  private eventCount = 0;
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  constructor() {
    super({ key: GYM_TRANSCRIPT_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Transcript Recording');
    this.addDivider();

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ New Session ]', () => this.newSession());
    this.addButton(cx - 240, y, '[ Record Event ]', () => this.recordEvent());
    this.addButton(cx - 70, y, '[ Finalize ]', () => this.finalizeSession());
    this.addButton(cx + 80, y, '[ Show Transcript ]', () => this.showTranscript());
    this.addButton(cx + 280, y, '[ Verify Seed ]', () => this.verifySeed());

    y += 40;
    this.addLabel(cx, y, '── Event Log ──', { fontSize: '12px', color: '#669966' }).setOrigin(0.5);

    this.newSession();
  }

  private newSession(): void {
    this.rng = createSeededRng(this.seed);
    this.recorder = new DemoTranscriptRecorder(this.seed);
    this.eventCount = 0;
    this.logEvent(`New session (seed=${this.seed})`);
  }

  private recordEvent(): void {
    if (!this.recorder) { this.logEvent('No session; click New Session first'); return; }
    const types = ['draw', 'discard', 'shuffle', 'score'];
    const type = types[Math.floor(this.rng!() * types.length)];
    this.recorder.recordEvent(type, `event-${this.eventCount}`);
    this.eventCount++;
    this.logEvent(`Recorded ${type} event #${this.eventCount}`);
  }

  private finalizeSession(): void {
    if (!this.recorder) { this.logEvent('No session to finalize'); return; }
    const t = this.recorder.finalize();
    this.logEvent(`Finalized: v${t.version}, ${t.events.length} events, endedAt=${t.endedAt}`);
  }

  private showTranscript(): void {
    if (!this.recorder) { this.logEvent('No session'); return; }
    const t = this.recorder.getTranscript();
    this.logEvent(`Transcript: v${t.version}, type=${t.gameType}, events=${t.events.length}`);
    // Show a few events
    for (const evt of t.events.slice(-3)) {
      this.logEvent(`  -> ${evt.type} (turn ${evt.turn}): ${evt.detail}`);
    }
  }

  private verifySeed(): void {
    // Verify deterministic: two sessions with same seed produce same RNG sequence
    const rng1 = createSeededRng(this.seed);
    const rng2 = createSeededRng(this.seed);
    const vals1 = Array.from({ length: 5 }, () => rng1());
    const vals2 = Array.from({ length: 5 }, () => rng2());
    const match = vals1.every((v, i) => Math.abs(v - vals2[i]) < 1e-10);
    this.logEvent(`Seed ${this.seed} determinism: ${match ? 'PASS' : 'FAIL'}`);
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 16) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const baseY = 140;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = this.add.text(40, baseY + i * 16, this.eventLog[i], {
        fontSize: '11px',
        color: '#aaddaa',
        fontFamily: 'monospace',
      });
      this.logTexts.push(txt);
    }
  }
}