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
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymTranscriptLayoutJson from '../layouts/gym-transcript.layout.json';

// Parse the shared Transcript scene layout once at module load.
const TRANSCRIPT_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymTranscriptLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveTranscriptAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!TRANSCRIPT_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(TRANSCRIPT_LAYOUT, zone, anchor, viewport, 1);
}

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
      {
        heading: 'Features',
        body: 'Demonstrates transcript recording using TranscriptRecorderBase for capturing and replaying game events in sequence. Transcripts provide a deterministic, replayable record of game actions — essential for debugging, automated testing, spectator replays, and fair-play auditing. In a real card game, a transcript records every draw, discard, shuffle, and score change so the full game session can be replayed step by step.'
      },
      {
        heading: 'Controls',
        body: '[ New Session ]: Start a fresh transcript session with a fixed seed (42) for deterministic event ordering.\n[ Record Event ]: Append a randomly chosen event type (draw, discard, shuffle, score) to the transcript with an incrementing turn number.\n[ Finalize ]: Mark the transcript as complete and record the end timestamp.\n[ Playback ]: Sequentially replay all recorded events with a 600ms delay between each.\n[ Show Transcript ]: Log the full transcript metadata (version, game type, event count) and all recorded events with turn numbers.'
      },
      {
        heading: 'Usage Example',
        body: 'A developer is debugging a scoring bug in a Golf game. They record a transcript of a complete round, then replay it step by step to verify that each score change corresponds to the correct game action. The deterministic seed ensures the same card draw order can be reproduced for consistent debugging.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ New Session ] → new transcript created, log confirms seed\n2. Press [ Record Event ] five times → five events recorded with various types\n3. Press [ Show Transcript ] → log shows version, game type, and all five events with turn numbers\n4. Press [ Finalize ] → transcript finalized with end timestamp\n5. Press [ Playback ] → events replay sequentially with 600ms delays\n6. Press [ New Session ] again → fresh session started, old transcript discarded\n7. Verify logs accumulate without exceeding the visible limit'
      }
    ]);

    const cx = GAME_W / 2;
    const controlsAnchor = resolveTranscriptAnchor('controls', 'center');
    const logAnchor = resolveTranscriptAnchor('log', 'center');
    const y = controlsAnchor.y;

    this.addButton(cx - 400, y, '[ New Session ]', () => this.newSession());
    this.addButton(cx - 240, y, '[ Record Event ]', () => this.recordEvent());
    this.addButton(cx - 70, y, '[ Finalize ]', () => this.finalizeSession());
    this.addButton(cx + 80, y, '[ Playback ]', () => this.playTranscript());
    this.addButton(cx + 200, y, '[ Show Transcript ]', () => this.showTranscript());

    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
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