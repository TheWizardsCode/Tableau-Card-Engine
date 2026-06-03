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
import { popTextOrIcon } from '../../../src/ui/popTextOrIcon';
import { GAME_W } from '../../../src/ui/constants';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

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
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;

  constructor() {
    super({ key: GYM_TRANSCRIPT_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Transcript Recording');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      { heading: 'Overview', body: 'Shows transcript recording and deterministic event ordering. Use a fixed seed to produce stable transcripts for testing and debugging.' },
      { heading: 'Controls', body: '[ New Session ]: Start a fresh transcript session.\n[ Record Event ]: Append a new event to the transcript.\n[ Finalize ]: Mark the transcript finished.\n[ Playback ]: Sequentially replay recorded events.\n[ Show Transcript ]: Log transcript metadata and events.' }
    ]);

    const cx = GAME_W / 2;
    let y = 60;

    this.addButton(cx - 400, y, '[ New Session ]', () => this.newSession());
    this.addButton(cx - 240, y, '[ Record Event ]', () => this.recordEvent());
    this.addButton(cx - 70, y, '[ Finalize ]', () => this.finalizeSession());
    this.addButton(cx + 80, y, '[ Playback ]', () => this.playTranscript());
    this.addButton(cx + 200, y, '[ Show Transcript ]', () => this.showTranscript());

    y += 40;
    this.eventLogResult = createEventLog(this, y + 20, {
      headerText: '── Event Log ──',
      maxLines: 16,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });

    this.newSession();
  }

  private newSession(): void {
    this.rng = createSeededRng(this.seed);
    this.recorder = new DemoTranscriptRecorder(this.seed);
    this.eventCount = 0;
    this.logEvent(`New session (seed=${this.seed})`);
    this.showPop('New Session');
  }

  private recordEvent(): void {
    if (!this.recorder) { this.logEvent('No session; click New Session first'); return; }
    const types = ['draw', 'discard', 'shuffle', 'score'];
    const type = types[Math.floor(this.rng!() * types.length)];
    this.recorder.recordEvent(type, `event-${this.eventCount}`);
    this.eventCount++;
    this.logEvent(`Recorded ${type} event #${this.eventCount}`);
    this.showPop(type);
  }

  private finalizeSession(): void {
    if (!this.recorder) { this.logEvent('No session to finalize'); return; }
    const t = this.recorder.finalize();
    this.logEvent(`Finalized: v${t.version}, ${t.events.length} events, endedAt=${t.endedAt}`);
    this.showPop('Finalized');
  }

  private showTranscript(): void {
    if (!this.recorder) { this.logEvent('No session'); return; }
    const t = this.recorder.getTranscript();
    this.logEvent(`Transcript: v${t.version}, type=${t.gameType}, events=${t.events.length}`);
    // Show all recorded events (in order)
    for (const evt of t.events) {
      this.logEvent(`  -> ${evt.type} (turn ${evt.turn}): ${evt.detail}`);
    }
  }



  private playTranscript(): void {
    if (!this.recorder) { this.logEvent('No session'); return; }
    const t = this.recorder.getTranscript();
    if (!t.events || t.events.length === 0) {
      this.logEvent('No events to play');
      return;
    }
    this.logEvent(`Playing ${t.events.length} events...`);
    // Play events sequentially with a small delay
    const intervalMs = 600;
    for (let i = 0; i < t.events.length; i++) {
      const evt = t.events[i];
      // Use Phaser timer so playback is tied to scene lifecycle
      try {
        this.time.delayedCall(i * intervalMs, () => {
          this.logEvent(`[PLAY] ${evt.type} (turn ${evt.turn}): ${evt.detail}`);
        });
      } catch (_e) {
        // Fallback if time.delayedCall is unavailable
        setTimeout(() => this.logEvent(`[PLAY] ${evt.type} (turn ${evt.turn}): ${evt.detail}`), i * intervalMs);
      }
    }
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 16) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }

  /** Show a pop text near the event log area. */
  private showPop(label: string): void {
    popTextOrIcon({
      scene: this,
      label,
      x: GAME_W / 2,
      y: 100,
      duration: this.reducedMotion ? 100 : 350,
      reducedMotion: this.reducedMotion,
      style: { fontSize: '14px', color: '#88ff88', fontFamily: 'monospace' },
    });
  }
}