#!/usr/bin/env node
/**
 * Generate 14 CC0 medieval/castle-themed WAV sound effects for the
 * Beleaguered Castle game.
 *
 * Each sound is procedurally synthesized from basic waveforms (sine,
 * noise, envelopes) -- no external samples are used, so the output is
 * automatically public-domain / CC0.
 *
 * This script uses Tone.js frequency utilities for note-to-Hz conversion
 * while performing the actual audio synthesis in raw PCM to avoid the
 * Node.js OfflineAudioContext limitation.
 *
 * Usage:  node scripts/generate-castle-sfx.mjs
 * Output: public/assets/audio/beleaguered-castle/*.wav
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Frequency } from 'tone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'audio', 'beleaguered-castle');

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

/** Convert a Tone.js note name to Hz using the Tone Frequency class. */
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

/** Sawtooth wave. */
function sawtooth(f, t) {
  const phase = (f * t) % 1;
  return 2 * phase - 1;
}

/** Triangle wave. */
function triangle(f, t) {
  const phase = (f * t) % 1;
  return 4 * Math.abs(phase - 0.5) - 1;
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

/** Bandpass filter (combined lpf + hpf). */
function bpf(lpState, hpState, sample, center, bandwidth) {
  const low = lpf(lpState, sample, center + bandwidth / 2);
  return hpf(hpState, low, Math.max(20, center - bandwidth / 2));
}

// ── Sound Generators ─────────────────────────────────────────────────────────

/** 1. card-pickup: Stone scrape / heavy lift -- textured noise with low resonance. */
function generateCardPickup() {
  const duration = 0.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const brownState = { value: 0 };
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.06, 0.3, 0.1, duration);
    // Brown noise filtered through a resonant low-pass for stone character
    const freq = lerp(800, 300, t / duration);
    const raw = brownNoise(brownState);
    const filtered = lpf(lpState, raw, freq);
    // Add subtle sine rumble
    const rumble = sine(lerp(120, 60, t / duration), t) * 0.2;
    samples[i] = (filtered * 0.7 + rumble) * env;
  }
  return samples;
}

/** 2. card-to-foundation: Metallic bell chime -- bright ascending celebratory. */
function generateCardToFoundation() {
  const duration = 0.6;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('C6');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.2, 0.15, 0.3, duration);
    // Bell = fundamental + inharmonic partials
    const bell =
      sine(f0, t) * 0.4 +
      sine(f0 * 2.76, t) * 0.2 +    // inharmonic partial for bell-like timbre
      sine(f0 * 5.4, t) * 0.1 +
      sine(f0 * 8.93, t) * 0.05;
    // Bright shimmer overlay
    const shimmer = sine(noteToHz('E6'), t) * 0.15 *
      envelope(t, 0.001, 0.1, 0.1, 0.2, duration * 0.7);
    samples[i] = (bell + shimmer) * env;
  }
  return samples;
}

/** 3. card-to-tableau: Stone thud -- deep, short, satisfying impact. */
function generateCardToTableau() {
  const duration = 0.25;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const brownState = { value: 0 };
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Deep membrane thud with rapid pitch decay
    const pitchEnv = Math.exp(-t * 30);
    const freq = lerp(60, 200, pitchEnv);
    const thud = sine(freq, t) * envelope(t, 0.001, 0.08, 0.1, 0.16, duration);
    // Stone texture (filtered brown noise)
    const stoneEnv = envelope(t, 0.001, 0.03, 0, 0.02, 0.06);
    const stone = lpf(lpState, brownNoise(brownState), 400) * stoneEnv * 0.3;
    samples[i] = thud * 0.7 + stone;
  }
  return samples;
}

/** 4. card-snap-back: Wooden clunk / rejection -- dull, low, short. */
function generateCardSnapBack() {
  const duration = 0.18;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.06, 0.1, 0.1, duration);
    // Hollow wood knock: triangle wave with fast pitch decay
    const pitchEnv = Math.exp(-t * 40);
    const freq = lerp(80, 300, pitchEnv);
    const knock = triangle(freq, t) * 0.5;
    // Subtle noise for wood grain texture
    const woodNoise = lpf(lpState, noise(), 600) * 0.2 *
      envelope(t, 0.001, 0.02, 0, 0.01, 0.04);
    samples[i] = (knock + woodNoise) * env;
  }
  return samples;
}

/** 5. deal-card: Quick stone slide / parchment shuffle. */
function generateDealCard() {
  const duration = 0.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };
  const hpState = { prevIn: 0, prevOut: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.03, 0.2, 0.05, duration);
    // Bandpassed noise for parchment shuffle
    const raw = noise();
    const center = lerp(3000, 1500, t / duration);
    const lo = lpf(lpState, raw, center + 500);
    const filtered = hpf(hpState, lo, Math.max(20, center - 500));
    samples[i] = filtered * env * 0.6;
  }
  return samples;
}

/** 6. win-fanfare: Triumphant brass ascending fanfare (5 notes). */
function generateWinFanfare() {
  const duration = 1.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  const notes = [
    { note: 'C4', start: 0.0, len: 0.25 },
    { note: 'E4', start: 0.2, len: 0.25 },
    { note: 'G4', start: 0.4, len: 0.25 },
    { note: 'C5', start: 0.6, len: 0.35 },
    { note: 'E5', start: 0.85, len: 0.55 },
  ];

  const lpStates = notes.map(() => ({ prev: 0 }));

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    for (let ni = 0; ni < notes.length; ni++) {
      const { note, start, len } = notes[ni];
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.01, 0.05, 0.7, 0.2, len);
        const freq = noteToHz(note);
        // Sawtooth filtered through low-pass = brass-like tone
        const raw = sawtooth(freq, t) * 0.5 + sawtooth(freq * 2, t) * 0.15;
        const brass = lpf(lpStates[ni], raw, 1800);
        samples[i] += brass * env * 0.35;
      }
    }
  }
  return samples;
}

/** 7. loss-sound: Deep descending tone / heavy gate closing (somber). */
function generateLossSound() {
  const duration = 1.0;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState1 = { prev: 0 };
  const lpState2 = { prev: 0 };
  const brownState = { value: 0 };

  const notes = [
    { note: 'G3', start: 0.0, len: 0.4 },
    { note: 'C3', start: 0.3, len: 0.6 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Descending brass tones
    for (let ni = 0; ni < notes.length; ni++) {
      const { note, start, len } = notes[ni];
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.02, 0.1, 0.5, 0.3, len);
        const freq = noteToHz(note);
        const state = ni === 0 ? lpState1 : lpState2;
        const raw = sawtooth(freq, t) * 0.5;
        const brass = lpf(state, raw, 800);
        samples[i] += brass * env * 0.35;
      }
    }
    // Heavy gate-closing rumble
    if (t >= 0.3 && t < 0.9) {
      const gt = t - 0.3;
      const gateEnv = envelope(gt, 0.1, 0.2, 0.3, 0.2, 0.6);
      const rumble = brownNoise(brownState) * gateEnv * 0.2;
      samples[i] += rumble;
    }
  }
  return samples;
}

/** 8. auto-complete-start: Ascending sparkle / magic activation. */
function generateAutoCompleteStart() {
  const duration = 0.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  const sparkleNotes = ['E5', 'G5', 'B5', 'E6', 'G6', 'B6'];
  const noteLen = 0.1;
  const noteGap = 0.06;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    for (let si = 0; si < sparkleNotes.length; si++) {
      const start = si * noteGap;
      if (t >= start && t < start + noteLen) {
        const nt = t - start;
        const env = envelope(nt, 0.001, 0.03, 0.1, 0.06, noteLen);
        const freq = noteToHz(sparkleNotes[si]);
        // Sine with slight harmonic for sparkle
        samples[i] += (sine(freq, t) * 0.4 + sine(freq * 3, t) * 0.1) * env;
      }
    }
  }
  return samples;
}

/** 9. auto-complete-card: Quick bright chime -- very short for rapid cascade. */
function generateAutoCompleteCard() {
  const duration = 0.12;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('A5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.04, 0.1, 0.07, duration);
    // Quick metallic chime with inharmonic partials
    const bell =
      sine(f0, t) * 0.4 +
      sine(f0 * 2.76, t) * 0.15 +
      sine(f0 * 5.4, t) * 0.05;
    samples[i] = bell * env;
  }
  return samples;
}

/** 10. undo: Reverse swoosh / rewind sound (descending). */
function generateUndo() {
  const duration = 0.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.06, 0.2, 0.1, duration);
    // Descending noise swoosh
    const freq = lerp(3000, 500, t / duration);
    const noiseSample = noise();
    const filtered = lpf(lpState, noiseSample, freq);
    // Descending two-tone
    const tone1 = sine(noteToHz('G5'), t) * envelope(t, 0.001, 0.06, 0, 0.04, 0.1) * 0.2;
    const tone2 = sine(noteToHz('D5'), t) *
      (t >= 0.06 ? envelope(t - 0.06, 0.001, 0.05, 0, 0.04, 0.1) : 0) * 0.2;
    samples[i] = filtered * env * 0.5 + tone1 + tone2;
  }
  return samples;
}

/** 11. redo: Forward swoosh (ascending -- opposite of undo). */
function generateRedo() {
  const duration = 0.2;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.06, 0.2, 0.1, duration);
    // Ascending noise swoosh
    const freq = lerp(500, 3000, t / duration);
    const noiseSample = noise();
    const filtered = lpf(lpState, noiseSample, freq);
    // Ascending two-tone
    const tone1 = sine(noteToHz('D5'), t) * envelope(t, 0.001, 0.06, 0, 0.04, 0.1) * 0.2;
    const tone2 = sine(noteToHz('G5'), t) *
      (t >= 0.06 ? envelope(t - 0.06, 0.001, 0.05, 0, 0.04, 0.1) : 0) * 0.2;
    samples[i] = filtered * env * 0.5 + tone1 + tone2;
  }
  return samples;
}

/** 12. card-select: Soft metallic click / highlight. */
function generateCardSelect() {
  const duration = 0.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('E6');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.03, 0.1, 0.06, duration);
    // Short metallic tick with inharmonic partials
    const metal =
      sine(f0, t) * 0.3 +
      sine(f0 * 2.76, t) * 0.1 +
      sine(f0 * 4.07, t) * 0.05;
    samples[i] = metal * env;
  }
  return samples;
}

/** 13. card-deselect: Softer inverse of select -- lower pitch. */
function generateCardDeselect() {
  const duration = 0.08;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const f0 = noteToHz('C5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.025, 0.1, 0.05, duration);
    // Softer metallic tick, lower frequency
    const metal =
      sine(f0, t) * 0.2 +
      sine(f0 * 2.76, t) * 0.07;
    samples[i] = metal * env;
  }
  return samples;
}

/** 14. ui-click: Castle-themed stone/iron button press. */
function generateUIClick() {
  const duration = 0.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.03, 0.1, 0.06, duration);
    // Stone tap: deep sine with fast decay
    const pitchEnv = Math.exp(-t * 50);
    const tap = sine(lerp(100, 300, pitchEnv), t) * 0.4;
    // Iron clank overtone
    const f0 = noteToHz('A4');
    const clank = (sine(f0 * 2.76, t) * 0.1 + sine(f0 * 5.4, t) * 0.05) *
      envelope(t, 0.001, 0.015, 0, 0.01, 0.03);
    // Noise tap
    const noiseTap = lpf(lpState, noise(), 800) * 0.15 *
      envelope(t, 0.001, 0.01, 0, 0.01, 0.03);
    samples[i] = (tap + clank + noiseTap) * env;
  }
  return samples;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sounds = [
  { name: 'card-pickup',          gen: generateCardPickup },
  { name: 'card-to-foundation',   gen: generateCardToFoundation },
  { name: 'card-to-tableau',      gen: generateCardToTableau },
  { name: 'card-snap-back',       gen: generateCardSnapBack },
  { name: 'deal-card',            gen: generateDealCard },
  { name: 'win-fanfare',          gen: generateWinFanfare },
  { name: 'loss-sound',           gen: generateLossSound },
  { name: 'auto-complete-start',  gen: generateAutoCompleteStart },
  { name: 'auto-complete-card',   gen: generateAutoCompleteCard },
  { name: 'undo',                 gen: generateUndo },
  { name: 'redo',                 gen: generateRedo },
  { name: 'card-select',          gen: generateCardSelect },
  { name: 'card-deselect',        gen: generateCardDeselect },
  { name: 'ui-click',             gen: generateUIClick },
];

console.log('Generating medieval-themed sound effects for Beleaguered Castle...\n');

for (const { name, gen } of sounds) {
  const samples = gen();
  writeWav(join(OUT_DIR, `${name}.wav`), samples);
}

console.log(`\nDone! Generated ${sounds.length} sound effects in public/assets/audio/beleaguered-castle/`);
