/**
 * GymTranscriptScene -- Demonstrates transcript capture with a simulated
 * Blackjack game flow.
 *
 * The Blackjack simulation provides a realistic multi-event transcript:
 *   - First event: player draws two cards (deal)
 *   - Player can Hit (draw another card) or Stick
 *   - After player sticks, the dealer auto-plays their hand
 *   - When a winner is determined, the transcript is auto-saved
 *   - The "New Hand" button starts a new hand appended to the same transcript
 *
 * Features:
 *   - Simulate a simple game of Blackjack with recorded transcript events
 *   - Auto-save transcript on hand end
 *   - Multiple hands within a single session
 *   - Playback and inspection of recorded transcript events
 *
 * @module example-games/gym/scenes/GymTranscriptScene
 */

import { GymSceneBase } from './GymSceneBase';
import Phaser from 'phaser';
import { GYM_TRANSCRIPT_KEY } from '../GymRegistry';
import {
  TranscriptRecorderBase,
  createSeededRng,
  TranscriptStore,
  autoSaveTranscript,
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

// ── Blackjack-specific types ───────────────────────────────

interface BlackjackEvent {
  type: 'deal' | 'hit' | 'stick' | 'dealer_hit' | 'dealer_stick' | 'bust' | 'result';
  turn: number;
  player: 'player' | 'dealer' | 'game';
  cardValue?: number;
  handTotal?: number;
  detail: string;
}

interface HandResult {
  handNumber: number;
  playerTotal: number;
  dealerTotal: number;
  playerCards: number[];
  dealerCards: number[];
  winner: 'player' | 'dealer' | 'push';
}

interface DemoTranscript extends BaseTranscript<null, BlackjackEvent, HandResult> {
  seed: number;
  hands: HandResult[];
}

// ── Blackjack Recorder ─────────────────────────────────────

class BlackjackRecorder extends TranscriptRecorderBase<DemoTranscript> {
  private nextTurn = 0;

  constructor(seed: number) {
    super({
      version: 1,
      gameType: 'gym-transcript-blackjack',
      startedAt: new Date().toISOString(),
      endedAt: '',
      initialState: null,
      events: [],
      results: null,
      seed,
      hands: [],
    });
  }

  recordEvent(
    type: BlackjackEvent['type'],
    player: BlackjackEvent['player'],
    detail: string,
    cardValue?: number,
    handTotal?: number,
  ): void {
    const evt: BlackjackEvent = {
      type,
      turn: this.nextTurn++,
      player,
      detail,
    };
    if (cardValue !== undefined) evt.cardValue = cardValue;
    if (handTotal !== undefined) evt.handTotal = handTotal;
    this.transcript.events.push(evt);
  }

  recordHandResult(result: HandResult): void {
    this.transcript.hands.push(result);
    this.transcript.results = result;
  }

  finalize(): DemoTranscript {
    this.transcript.endedAt = new Date().toISOString();
    return this.getTranscript();
  }
}

// ── Blackjack game helpers ─────────────────────────────────

function cardValue(raw: number): number {
  if (raw >= 12) return 10;
  if (raw === 11) return 11;
  return raw;
}

function cardLabel(raw: number): string {
  const labels: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
    9: '9', 10: '10', 11: 'Ace', 12: 'Jack', 13: 'Queen', 14: 'King',
  };
  return labels[raw] ?? String(raw);
}

function handTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const value of cards) {
    const cv = cardValue(value);
    if (cv === 11) {
      aces++;
      total += 11;
    } else {
      total += cv;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function drawCard(rng: () => number): number {
  return Math.floor(rng() * 13) + 2;
}

// ── Scene state machine ────────────────────────────────────

type GamePhase = 'idle' | 'player_turn' | 'dealer_turn' | 'hand_over';

// ── Scene class ────────────────────────────────────────────

export class GymTranscriptScene extends GymSceneBase {
  private recorder: BlackjackRecorder | null = null;
  private rng: (() => number) | null = null;
  private seed = 42;
  private phase: GamePhase = 'idle';
  private handNumber = 0;
  private playerCards: number[] = [];
  private dealerCards: number[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private handInfoText!: Phaser.GameObjects.Text;
  private btnHit!: Phaser.GameObjects.Text;
  private btnStick!: Phaser.GameObjects.Text;
  private btnNewHand!: Phaser.GameObjects.Text;
  private eventLog: string[] = [];
  private eventLogResult!: EventLogResult;
  private store: TranscriptStore | null = null;

  constructor() {
    super({ key: GYM_TRANSCRIPT_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Blackjack Transcript');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates transcript recording by simulating a simple Blackjack game. Each hand generates a structured transcript with deal, hit, stick, dealer moves, and result events. Transcripts are auto-saved when a hand ends, providing a complete record for replay and analysis.'
      },
      {
        heading: 'Blackjack Rules',
        body: 'You and the dealer each draw cards. Number cards (2-10) are worth their value. Face cards (Jack, Queen, King) are worth 10. Aces are worth 11 or 1 (whichever avoids a bust). Try to get closer to 21 than the dealer without going over!'
      },
      {
        heading: 'Controls',
        body: '[ New Session ]: Start a fresh Blackjack session with a fixed seed (42) for deterministic card draws.\n[ Hit ]: Draw another card during your turn.\n[ Stick ]: End your turn and let the dealer play.\n[ New Hand ]: Deal a new hand (appended to the same transcript) after the previous hand ends.\n[ Playback ]: Sequentially replay all recorded events with a 600ms delay between each.\n[ Show Transcript ]: Log the full transcript metadata and all recorded events with turn numbers.'
      },
      {
        heading: 'Usage Example',
        body: 'A developer testing a card game engine uses the Blackjack simulation to verify that transcript events are recorded in the correct order and that auto-save persists the full session. Multiple hands demonstrate that transcripts can span multiple game rounds.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ New Session ] to start a Blackjack session.\n2. Two cards are dealt to both you and the dealer.\n3. Press [ Hit ] to draw another card (or [ Stick ] to hold).\n4. If you stick, the dealer auto-plays their hand.\n5. When the hand ends, the result is shown and the transcript auto-saves.\n6. Press [ New Hand ] to play another hand in the same session.\
7. Press [ Show Transcript ] to inspect all recorded events.\
8. Press [ Playback ] to replay all events sequentially.\
9. Verify logs show correct turn ordering and event types.'
      }
    ]);

    this.createUI();
    this.store = new TranscriptStore();
    this.setPhase('idle');
  }

  private createUI(): void {
    const cx = GAME_W / 2;
    const controlsAnchor = resolveTranscriptAnchor('controls', 'center');
    const logAnchor = resolveTranscriptAnchor('log', 'center');
    const y = controlsAnchor.y;

    this.statusText = this.addLabel(cx, y - 30, '', { fontSize: '13px', color: '#ffff88' });
    this.statusText.setOrigin(0.5, 0.5).setVisible(false);

    this.handInfoText = this.addLabel(cx, y + 40, '', { fontSize: '12px', color: '#ccffcc' });
    this.handInfoText.setOrigin(0.5, 0.5).setVisible(false);

    this.initButtonBar(y);
    this.buttonBar!.addButton('[ New Session ]', () => this.newSession(), { zone: 'center' });
    this.btnHit = this.buttonBar!.addButton('[ Hit ]', () => this.playerHit(), { zone: 'center' });
    this.btnStick = this.buttonBar!.addButton('[ Stick ]', () => this.playerStick(), { zone: 'center' });
    this.btnNewHand = this.buttonBar!.addButton('[ New Hand ]', () => this.newHand(), { zone: 'center' });
    this.buttonBar!.addButton('[ Playback ]', () => this.playTranscript(), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Transcript ]', () => this.showTranscript(), { zone: 'center' });

    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
      headerText: '\u2500\u2500 Event Log \u2500\u2500',
      maxLines: 18,
      lineHeight: 15,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.updateUI();
  }

  private updateUI(): void {
    this.btnHit.setVisible(this.phase === 'player_turn');
    this.btnStick.setVisible(this.phase === 'player_turn');
    this.btnNewHand.setVisible(this.phase === 'hand_over');

    const statusMsgs: Record<GamePhase, string> = {
      idle: 'Press [ New Session ] to start a Blackjack game',
      player_turn: 'Your turn: Hit or Stick?',
      dealer_turn: 'Dealer is playing...',
      hand_over: 'Hand complete! Press [ New Hand ] to play again.'
    };
    this.statusText.setText(statusMsgs[this.phase]).setVisible(true);
    this.handInfoText.setVisible(this.phase !== 'idle');
  }

  private renderHandInfo(): void {
    const pTotal = handTotal(this.playerCards);
    const dTotal = handTotal(this.dealerCards);
    const pCards = this.playerCards.map(cardLabel).join(', ');
    const dCards = this.dealerCards.map(cardLabel).join(', ');

    let text = 'Your hand: [' + pCards + '] = ' + pTotal;
    text += '  |  Dealer hand: [' + dCards + '] = ' + dTotal;
    this.handInfoText.setText(text);
  }

  // ── Session & Hand management ────────────────────────────

  private newSession(): void {
    this.recorder = new BlackjackRecorder(this.seed);
    this.rng = createSeededRng(this.seed);
    this.handNumber = 1;
    this.eventLog = [];
    this.logEvent('New Blackjack session (seed=' + this.seed + ')');
    this.logEvent('Hand #' + this.handNumber + ' starting...');

    // Deal two cards to player and dealer
    this.playerCards = [this.drawForPlayer('Dealt'), this.drawForPlayer('Dealt')];
    this.dealerCards = [this.drawForDealer('Dealt'), this.drawForDealer('Dealt')];

    this.renderHandInfo();
    this.setPhase('player_turn');
    this.showPop('Dealt!');
  }

  private newHand(): void {
    if (!this.recorder) return;

    this.handNumber++;
    this.logEvent('--- Hand #' + this.handNumber + ' ---');

    // Reset hand state
    this.playerCards = [];
    this.dealerCards = [];

    // Deal two cards to player and dealer
    this.playerCards = [this.drawForPlayer('Dealt'), this.drawForPlayer('Dealt')];
    this.dealerCards = [this.drawForDealer('Dealt'), this.drawForDealer('Dealt')];

    this.renderHandInfo();
    this.setPhase('player_turn');
    this.showPop('New Hand');
  }

  private playerHit(): void {
    if (!this.recorder || this.phase !== 'player_turn') return;

    const card = this.drawForPlayer('Hit');
    this.playerCards.push(card);

    const total = handTotal(this.playerCards);
    this.renderHandInfo();

    if (total > 21) {
      this.logEvent('Player busts! (' + total + ')');
      this.recorder.recordEvent('bust', 'player', 'Player busts at ' + total, card, total);
      this.endHand('dealer');
    }
  }

  private playerStick(): void {
    if (!this.recorder || this.phase !== 'player_turn') return;

    const total = handTotal(this.playerCards);
    this.recorder.recordEvent('stick', 'player', 'Player sticks at ' + total, undefined, total);
    this.logEvent('Player sticks at ' + total);

    this.setPhase('dealer_turn');
    this.dealerPlay();
  }

  private dealerPlay(): void {
    if (!this.recorder) return;
    const recorder = this.recorder;

    const playNextWithDelay = (delay: number) => {
      if (this.phase !== 'dealer_turn') return;

      const dTotal = handTotal(this.dealerCards);

      if (dTotal > 21) {
        // Dealer busts
        recorder.recordEvent('bust', 'dealer', 'Dealer busts at ' + dTotal, undefined, dTotal);
        this.logEvent('Dealer busts! (' + dTotal + ')');
        this.endHand('player');
        return;
      }

      if (dTotal >= 17) {
        // Dealer sticks
        recorder.recordEvent('dealer_stick', 'dealer', 'Dealer sticks at ' + dTotal, undefined, dTotal);
        this.logEvent('Dealer sticks at ' + dTotal);
        this.endHandFromDealer();
        return;
      }

      // Dealer hits (dTotal < 17)
      const card = this.drawForDealer('Hit');
      this.dealerCards.push(card);
      this.renderHandInfo();

      // Schedule next dealer action with delay
      this.time.delayedCall(delay, () => {
        playNextWithDelay(delay);
      });
    };

    // Start dealer play with 800ms delay between draws
    playNextWithDelay(800);
  }

  private endHandFromDealer(): void {
    const pTotal = handTotal(this.playerCards);
    const dTotal = handTotal(this.dealerCards);

    let winner: 'player' | 'dealer' | 'push';
    if (pTotal > 21) winner = 'dealer';
    else if (dTotal > 21) winner = 'player';
    else if (pTotal > dTotal) winner = 'player';
    else if (dTotal > pTotal) winner = 'dealer';
    else winner = 'push';

    this.endHand(winner);
  }

  private endHand(winner: 'player' | 'dealer' | 'push'): void {
    if (!this.recorder) return;

    const pTotal = handTotal(this.playerCards);
    const dTotal = handTotal(this.dealerCards);

    const winnerLabels: Record<string, string> = {
      player: 'Player wins',
      dealer: 'Dealer wins',
      push: 'Push (tie)'
    };

    const resultMsg = winnerLabels[winner] + ' (' + pTotal + ' vs ' + dTotal + ')';
    this.recorder.recordEvent('result', 'game', resultMsg);
    this.logEvent(resultMsg);

    const handResult: HandResult = {
      handNumber: this.handNumber,
      playerTotal: pTotal,
      dealerTotal: dTotal,
      playerCards: [...this.playerCards],
      dealerCards: [...this.dealerCards],
      winner,
    };
    this.recorder.recordHandResult(handResult);

    this.setPhase('hand_over');
    this.showPop(winnerLabels[winner]);

    // Auto-save the transcript
    this.autoSaveHand();
  }

  private autoSaveHand(): void {
    if (!this.recorder || !this.store) return;
    const transcript = this.recorder.getTranscript();
    autoSaveTranscript(this.store, 'gym-transcript-blackjack', transcript);
    this.logEvent('Transcript auto-saved (' + transcript.events.length + ' events, ' + transcript.hands.length + ' hands)');
  }

  // ── Card drawing helpers ─────────────────────────────────

  private drawForPlayer(action: string): number {
    const card = drawCard(this.rng!);
    const label = cardLabel(card);
    const val = cardValue(card);
    this.playerCards = this.playerCards || [];
    const total = handTotal([...this.playerCards, card]);
    this.recorder!.recordEvent(action === 'Hit' ? 'hit' : 'deal', 'player', label + ' (total: ' + total + ')', val, total);
    this.logEvent('Player draws ' + label + ' (total: ' + total + ')');
    return card;
  }

  private drawForDealer(action: string): number {
    const card = drawCard(this.rng!);
    const label = cardLabel(card);
    const val = cardValue(card);
    this.dealerCards = this.dealerCards || [];
    const total = handTotal([...this.dealerCards, card]);
    const eventType = action === 'Hit' ? 'dealer_hit' : 'deal';
    this.recorder!.recordEvent(eventType, 'dealer', label + ' (total: ' + total + ')', val, total);
    this.logEvent('Dealer draws ' + label + ' (total: ' + total + ')');
    return card;
  }

  // ── Playback and inspection ──────────────────────────────

  private playTranscript(): void {
    if (!this.recorder) { this.logEvent('No session'); return; }
    const t = this.recorder.getTranscript();
    if (!t.events || t.events.length === 0) {
      this.logEvent('No events to play');
      return;
    }
    this.logEvent('Playing ' + t.events.length + ' events...');
    const intervalMs = 600;
    for (let i = 0; i < t.events.length; i++) {
      const evt = t.events[i];
      try {
        this.time.delayedCall(i * intervalMs, () => {
          this.logEvent('[PLAY] turn ' + evt.turn + ': ' + evt.player + ' ' + evt.type + ' - ' + evt.detail);
        });
      } catch (_e) {
        setTimeout(
          () => this.logEvent('[PLAY] turn ' + evt.turn + ': ' + evt.player + ' ' + evt.type + ' - ' + evt.detail),
          i * intervalMs
        );
      }
    }
  }

  private showTranscript(): void {
    if (!this.recorder) { this.logEvent('No session'); return; }
    const t = this.recorder.getTranscript();
    this.logEvent('Transcript: v' + t.version + ', type=' + t.gameType + ', events=' + t.events.length + ', hands=' + t.hands.length);

    for (const evt of t.events) {
      let detail = '[' + evt.turn + '] ' + evt.player + ' ' + evt.type + ': ' + evt.detail;
      if (evt.cardValue !== undefined) detail += ' (card=' + evt.cardValue + ')';
      if (evt.handTotal !== undefined) detail += ' (total=' + evt.handTotal + ')';
      this.logEvent('  -> ' + detail);
    }

    if (t.hands.length > 0) {
      this.logEvent('-- Hands --');
      for (const h of t.hands) {
        this.logEvent('  Hand #' + h.handNumber + ': ' + h.winner + ' (' + h.playerTotal + ' vs ' + h.dealerTotal + ')');
      }
    }
  }

  // ── Logging ──────────────────────────────────────────────

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > 18) this.eventLog.shift();
    this.eventLogResult.render(this.eventLog);
  }

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
