#!/usr/bin/env node
/**
 * Generate 12 CC0 expedition-themed WAV sound effects for Lost Cities.
 *
 * Each sound is procedurally synthesized from basic waveforms (sine,
 * triangle, sawtooth, noise, envelopes, filters) -- no external samples
 * are used, so the output is automatically public-domain / CC0.
 *
 * Theme: Ancient expeditions, map unfurling, compass clicks, torch
 * crackle, exotic chimes, jungle/desert atmosphere.
 *
 * Uses Tone.js Frequency class for note-to-Hz conversion.
 *
 * Usage:  node scripts/generate-lost-cities-sfx.mjs
 * Output: public/assets/audio/lost-cities/*.wav
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Frequency } from 'tone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'audio', 'lost-cities');

const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Write a little-endian 16-bit mono WAV file from float samples in [-1, 1]. */
function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const dataSize = numSamples * (BITS_PER_SAMPLE / 8);

  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;

  buf.write('RIFF', off); off += 4;
  buf.writeUInt32LE(36 + dataSize, off); off += 4;
  buf.write('WAVE', off); off += 4;
  buf.write('fmt ', off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(CHANNELS, off); off += 2;
  buf.writeUInt32LE(SAMPLE_RATE, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(BITS_PER_SAMPLE, off); off += 2;
  buf.write('data', off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), off);
    off += 2;
  }

  writeFileSync(filePath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  const ms = ((numSamples / SAMPLE_RATE) * 1000).toFixed(0);
  console.log(`  ✓ ${filePath}  (${ms}ms, ${kb} KB)`);
}

/** Convert a Tone.js note name to Hz. */
function noteToHz(note) {
  return Frequency(note).toFrequency();
}

/** Linear interpolation. */
function lerp(a, b, t) { return a + (b - a) * t; }

/** ADSR-style envelope (all in seconds). */
function envelope(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / decay);
  if (t < duration - release) return sustain;
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release);
  return 0;
}

/** White noise sample. */
function noise() { return Math.random() * 2 - 1; }

/** Sine wave at frequency f and time t. */
function sine(f, t) { return Math.sin(2 * Math.PI * f * t); }

/** Triangle wave. */
function triangle(f, t) {
  const phase = (f * t) % 1;
  return 4 * Math.abs(phase - 0.5) - 1;
}

/** Sawtooth wave. */
function sawtooth(f, t) {
  const phase = (f * t) % 1;
  return 2 * phase - 1;
}

/** Brown noise (integrated white noise). */
function brownNoise(state) {
  state.value += noise() * 0.1;
  state.value = Math.max(-1, Math.min(1, state.value));
  return state.value;
}

/** Simple one-pole low-pass filter state machine. */
function lpf(state, sample, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state.prev = state.prev + alpha * (sample - state.prev);
  return state.prev;
}

/** Simple one-pole high-pass filter. */
function hpf(state, sample, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = rc / (rc + dt);
  const out = alpha * (state.prevOut + sample - state.prevIn);
  state.prevIn = sample;
  state.prevOut = out;
  return out;
}

// ── Sound Generators ─────────────────────────────────────────────────────────

/**
 * 1. card-select: Compass click -- crisp metallic click with a
 *    bright harmonic shimmer, like a compass needle snapping into place.
 */
function generateCardSelect() {
  const duration = 0.12;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('G5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.025, 0.15, 0.07, duration);
    // Metallic click with compass-like precision
    const click = sine(f0, t) * 0.35 +
      sine(f0 * 2.76, t) * 0.12 +  // inharmonic partial for metallic character
      sine(f0 * 4.2, t) * 0.06;
    // Brief high sparkle
    const sparkle = sine(noteToHz('D7'), t) * 0.08 *
      envelope(t, 0.001, 0.01, 0, 0.01, 0.03);
    samples[i] = (click + sparkle) * env;
  }
  return samples;
}

/**
 * 2. card-deselect: Soft compass release -- lower, shorter version of
 *    the select sound. Like a compass spring releasing.
 */
function generateCardDeselect() {
  const duration = 0.08;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('D5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.02, 0.1, 0.04, duration);
    const click = sine(f0, t) * 0.2 +
      sine(f0 * 2.76, t) * 0.06;
    samples[i] = click * env;
  }
  return samples;
}

/**
 * 3. card-play: Map stamp / expedition commit -- a confident thump with
 *    exotic overtones, like stamping a location on a map.
 */
function generateCardPlay() {
  const duration = 0.3;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };
  const brownState = { value: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Deep satisfying stamp impact
    const pitchEnv = Math.exp(-t * 25);
    const freq = lerp(80, 250, pitchEnv);
    const stamp = sine(freq, t) * envelope(t, 0.001, 0.06, 0.15, 0.18, duration) * 0.5;
    // Parchment rustle texture
    const rustle = lpf(lpState, brownNoise(brownState), 600) * 0.2 *
      envelope(t, 0.005, 0.04, 0, 0.03, 0.08);
    // Brief exotic overtone (pentatonic shimmer)
    const shimmer = sine(noteToHz('A5'), t) * 0.1 *
      envelope(t, 0.001, 0.08, 0.05, 0.1, 0.2);
    samples[i] = stamp + rustle + shimmer;
  }
  return samples;
}

/**
 * 4. card-discard: Parchment toss -- light papery swoosh with a soft
 *    landing, like tossing a card onto a map table.
 */
function generateCardDiscard() {
  const duration = 0.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };
  const hpState = { prevIn: 0, prevOut: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.05, 0.15, 0.1, duration);
    // Swooshy noise (bandpassed for papery quality)
    const center = lerp(2500, 1200, t / duration);
    const lo = lpf(lpState, noise(), center + 400);
    const filtered = hpf(hpState, lo, Math.max(20, center - 400));
    // Soft landing thud
    const thud = sine(lerp(120, 60, t / duration), t) * 0.15 *
      envelope(t, 0.08, 0.04, 0, 0.04, 0.16);
    samples[i] = filtered * env * 0.5 + thud;
  }
  return samples;
}

/**
 * 5. card-draw: Map unfurl -- textured sweep upward with a subtle
 *    revealing quality, like pulling a scroll from a case.
 */
function generateCardDraw() {
  const duration = 0.25;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };
  const hpState = { prevIn: 0, prevOut: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.06, 0.25, 0.12, duration);
    // Ascending noise sweep (scroll unfurling)
    const center = lerp(800, 2800, t / duration);
    const lo = lpf(lpState, noise(), center + 500);
    const filtered = hpf(hpState, lo, Math.max(20, center - 500));
    // Subtle mystical tone
    const tone = sine(noteToHz('E5'), t) * 0.08 *
      envelope(t, 0.05, 0.08, 0.05, 0.08, duration);
    samples[i] = filtered * env * 0.45 + tone;
  }
  return samples;
}

/**
 * 6. illegal-move: Expedition warning -- a dull buzz/clunk with
 *    dissonant overtones, like a locked chest being rattled.
 */
function generateIllegalMove() {
  const duration = 0.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.04, 0.15, 0.12, duration);
    // Dull buzz (low triangle wave)
    const buzz = triangle(90, t) * 0.3;
    // Dissonant rattle
    const rattle = sine(noteToHz('Bb3'), t) * 0.15 +
      sine(noteToHz('B3'), t) * 0.1;  // semitone clash for tension
    // Wooden clunk noise
    const clunk = lpf(lpState, noise(), 400) * 0.2 *
      envelope(t, 0.001, 0.02, 0, 0.01, 0.04);
    samples[i] = (buzz + rattle + clunk) * env;
  }
  return samples;
}

/**
 * 7. turn-change: Compass bearing shift -- a subtle two-note ascending
 *    ding, like a ship's bell or compass recalibrating.
 */
function generateTurnChange() {
  const duration = 0.35;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f1 = noteToHz('C5');
  const f2 = noteToHz('E5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // First note: short
    const n1env = envelope(t, 0.001, 0.06, 0.1, 0.08, 0.15);
    const note1 = (sine(f1, t) * 0.3 + sine(f1 * 2.76, t) * 0.08) * n1env;
    // Second note: starts after brief gap, slightly longer
    const n2t = t - 0.12;
    const n2env = n2t > 0 ? envelope(n2t, 0.001, 0.08, 0.1, 0.1, 0.23) : 0;
    const note2 = (sine(f2, t) * 0.3 + sine(f2 * 2.76, t) * 0.08) * n2env;
    samples[i] = note1 + note2;
  }
  return samples;
}

/**
 * 8. round-end: Expedition journal close -- a rich, resonant thud
 *    with a warm fadeout, like a heavy leather-bound journal closing.
 */
function generateRoundEnd() {
  const duration = 0.7;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const brownState = { value: 0 };
  const lpState = { prev: 0 };
  const lpState2 = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Deep resonant thud (book closing)
    const thudEnv = envelope(t, 0.001, 0.1, 0.1, 0.3, 0.5);
    const pitchEnv = Math.exp(-t * 15);
    const thud = sine(lerp(50, 150, pitchEnv), t) * thudEnv * 0.5;
    // Leather creak texture
    const creak = lpf(lpState, brownNoise(brownState), lerp(300, 100, t / duration)) *
      envelope(t, 0.01, 0.15, 0.05, 0.2, 0.4) * 0.25;
    // Warm bell tone (expedition complete)
    const bell = (sine(noteToHz('G4'), t) * 0.2 +
      sine(noteToHz('G4') * 2.76, t) * 0.06) *
      envelope(t, 0.001, 0.15, 0.08, 0.3, duration);
    // Subtle reverb tail (filtered noise decay)
    const tail = lpf(lpState2, noise(), lerp(800, 200, t / duration)) *
      envelope(t, 0.1, 0.2, 0.03, 0.3, duration) * 0.1;
    samples[i] = thud + creak + bell + tail;
  }
  return samples;
}

/**
 * 9. match-win: Triumphant discovery fanfare -- ascending pentatonic
 *    brass with exotic chimes, evoking finding a lost city.
 */
function generateMatchWin() {
  const duration = 1.8;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  // Pentatonic ascending fanfare (exotic/expedition feel)
  const notes = [
    { note: 'D4', start: 0.0, len: 0.3 },
    { note: 'F4', start: 0.2, len: 0.3 },
    { note: 'A4', start: 0.4, len: 0.3 },
    { note: 'D5', start: 0.6, len: 0.4 },
    { note: 'F5', start: 0.9, len: 0.7 },
  ];

  const lpStates = notes.map(() => ({ prev: 0 }));

  // Sparkle chimes at the end
  const chimes = [
    { note: 'A6', start: 1.1, len: 0.15 },
    { note: 'D7', start: 1.25, len: 0.15 },
    { note: 'F7', start: 1.4, len: 0.3 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Brass fanfare
    for (let ni = 0; ni < notes.length; ni++) {
      const { note, start, len } = notes[ni];
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.015, 0.06, 0.65, 0.2, len);
        const freq = noteToHz(note);
        const raw = sawtooth(freq, t) * 0.4 + sawtooth(freq * 2, t) * 0.12;
        const brass = lpf(lpStates[ni], raw, 1600);
        samples[i] += brass * env * 0.3;
      }
    }
    // Exotic chimes
    for (const ch of chimes) {
      if (t >= ch.start && t < ch.start + ch.len) {
        const ct = t - ch.start;
        const cEnv = envelope(ct, 0.001, 0.04, 0.08, 0.08, ch.len);
        const freq = noteToHz(ch.note);
        samples[i] += (sine(freq, t) * 0.15 + sine(freq * 2.76, t) * 0.04) * cEnv;
      }
    }
  }
  return samples;
}

/**
 * 10. match-lose: Expedition lost -- descending minor tones with
 *     wind-like noise, like a sandstorm swallowing a camp.
 */
function generateMatchLose() {
  const duration = 1.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState1 = { prev: 0 };
  const lpState2 = { prev: 0 };
  const brownState = { value: 0 };

  const notes = [
    { note: 'D4', start: 0.0, len: 0.5 },
    { note: 'Bb3', start: 0.3, len: 0.5 },
    { note: 'F3', start: 0.6, len: 0.5 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Descending mournful brass
    for (let ni = 0; ni < notes.length; ni++) {
      const { note, start, len } = notes[ni];
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.02, 0.1, 0.4, 0.3, len);
        const freq = noteToHz(note);
        const state = ni === 0 ? lpState1 : ni === 1 ? lpState2 : { prev: 0 };
        const raw = sawtooth(freq, t) * 0.4;
        const brass = lpf(state, raw, 700);
        samples[i] += brass * env * 0.3;
      }
    }
    // Desert wind
    if (t >= 0.2 && t < 1.1) {
      const wt = t - 0.2;
      const windEnv = envelope(wt, 0.15, 0.2, 0.3, 0.3, 0.9);
      const wind = brownNoise(brownState) * windEnv * 0.15;
      samples[i] += wind;
    }
  }
  return samples;
}

/**
 * 11. score-reveal: Ancient discovery chime -- bright ascending
 *     bell tones like uncovering artifacts in sequence.
 */
function generateScoreReveal() {
  const duration = 0.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  const sparkleNotes = ['D5', 'F5', 'A5', 'D6'];
  const noteLen = 0.12;
  const noteGap = 0.08;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    for (let si = 0; si < sparkleNotes.length; si++) {
      const start = si * noteGap;
      if (t >= start && t < start + noteLen) {
        const nt = t - start;
        const env = envelope(nt, 0.001, 0.03, 0.1, 0.07, noteLen);
        const freq = noteToHz(sparkleNotes[si]);
        // Bell-like with inharmonic partials
        const bell = sine(freq, t) * 0.3 +
          sine(freq * 2.76, t) * 0.08 +
          sine(freq * 5.4, t) * 0.03;
        samples[i] += bell * env;
      }
    }
  }
  return samples;
}

/**
 * 12. ui-click: Map pin / expedition marker -- a firm tactile click
 *     like pushing a pin into a map board.
 */
function generateUIClick() {
  const duration = 0.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.025, 0.1, 0.06, duration);
    // Sharp pin impact
    const pitchEnv = Math.exp(-t * 45);
    const pin = sine(lerp(150, 400, pitchEnv), t) * 0.35;
    // Brief metallic overtone
    const f0 = noteToHz('B5');
    const metal = sine(f0, t) * 0.1 * envelope(t, 0.001, 0.015, 0, 0.01, 0.03);
    // Tiny board noise
    const board = lpf(lpState, noise(), 700) * 0.12 *
      envelope(t, 0.001, 0.01, 0, 0.01, 0.03);
    samples[i] = (pin + metal + board) * env;
  }
  return samples;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sounds = [
  { name: 'card-select',    gen: generateCardSelect },
  { name: 'card-deselect',  gen: generateCardDeselect },
  { name: 'card-play',      gen: generateCardPlay },
  { name: 'card-discard',   gen: generateCardDiscard },
  { name: 'card-draw',      gen: generateCardDraw },
  { name: 'illegal-move',   gen: generateIllegalMove },
  { name: 'turn-change',    gen: generateTurnChange },
  { name: 'round-end',      gen: generateRoundEnd },
  { name: 'match-win',      gen: generateMatchWin },
  { name: 'match-lose',     gen: generateMatchLose },
  { name: 'score-reveal',   gen: generateScoreReveal },
  { name: 'ui-click',       gen: generateUIClick },
];

mkdirSync(OUT_DIR, { recursive: true });

console.log('Generating expedition-themed sound effects for Lost Cities...\n');

for (const { name, gen } of sounds) {
  const out = gen();
  writeWav(join(OUT_DIR, `${name}.wav`), out);
}

console.log(`\nDone! Generated ${sounds.length} sound effects in public/assets/audio/lost-cities/`);
