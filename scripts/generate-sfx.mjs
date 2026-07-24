#!/usr/bin/env node
/**
 * Generate 8 CC0 WAV sound effects for the Tableau Card Engine.
 *
 * Each sound is synthesized from scratch using basic waveforms (sine, noise,
 * envelopes) — no external samples are used, so the output is automatically
 * public-domain / CC0.
 *
 * Usage:  node scripts/generate-sfx.mjs
 * Output: public/assets/audio/*.wav
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'audio');

const SAMPLE_RATE = 22050; // 22 kHz — small files, fine for SFX
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Write a little-endian 16-bit WAV file from float samples in [-1, 1]. */
function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);
  const dataSize = numSamples * (BITS_PER_SAMPLE / 8);

  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;

  // RIFF header
  buf.write('RIFF', off); off += 4;
  buf.writeUInt32LE(36 + dataSize, off); off += 4;
  buf.write('WAVE', off); off += 4;

  // fmt  sub-chunk
  buf.write('fmt ', off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;            // sub-chunk size
  buf.writeUInt16LE(1, off); off += 2;             // PCM
  buf.writeUInt16LE(CHANNELS, off); off += 2;
  buf.writeUInt32LE(SAMPLE_RATE, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(BITS_PER_SAMPLE, off); off += 2;

  // data sub-chunk
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

/** Linear interpolation between a and b. */
function lerp(a, b, t) { return a + (b - a) * t; }

/** Envelope: attack → sustain → release (all in seconds). */
function envelope(t, attack, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + sustain) return 1;
  const relStart = attack + sustain;
  if (t < relStart + release) return 1 - (t - relStart) / release;
  return 0;
}

/** White noise sample. */
function noise() { return Math.random() * 2 - 1; }

/** Sine wave. */
function sine(freq, t) { return Math.sin(2 * Math.PI * freq * t); }

// ── Sound Generators ─────────────────────────────────────────────────────────

/** 1. card-draw: gentle swoosh (filtered noise sweep). */
function generateCardDraw() {
  const duration = 0.3;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.03, 0.05, 0.22, duration);
    // Swoosh: noise modulated with a descending sine, lower freq range
    const freq = lerp(1400, 350, t / duration);
    const mod = sine(freq, t);
    samples[i] = noise() * mod * env * 0.25;
  }
  return samples;
}

/** 2. card-flip: soft snap with gentle tonal tail. */
function generateCardFlip() {
  const duration = 0.22;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Softer initial click (noise burst with longer fade)
    const click = t < 0.015 ? noise() * (1 - t / 0.015) : 0;
    // Tonal tail — lower frequency range
    const env = envelope(t, 0.015, 0.03, 0.175, duration);
    const tone = sine(lerp(900, 600, t / duration), t) * env * 0.15;
    samples[i] = click * 0.3 + tone;
  }
  return samples;
}

/** 3. card-swap: gentle two-part sound — slide out + slide in. */
function generateCardSwap() {
  const duration = 0.35;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const half = duration / 2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    if (t < half) {
      // Slide out: ascending swoosh, softer
      const env = envelope(t, 0.02, 0.05, half - 0.07, half);
      const freq = lerp(300, 900, t / half);
      samples[i] = noise() * sine(freq, t) * env * 0.2;
    } else {
      // Slide in: descending swoosh, softer
      const t2 = t - half;
      const env = envelope(t2, 0.02, 0.05, half - 0.07, half);
      const freq = lerp(900, 300, t2 / half);
      samples[i] = noise() * sine(freq, t2) * env * 0.2;
    }
  }
  return samples;
}

/** 4. card-discard: gentle thud with tonal drop. */
function generateCardDiscard() {
  const duration = 0.3;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.015, 0.04, 0.245, duration);
    // Low thud with descending pitch
    const freq = lerp(350, 100, t / duration);
    const tone = sine(freq, t);
    // Reduced noise for texture
    const n = noise() * 0.08 * Math.max(0, 1 - t * 10);
    samples[i] = (tone * 0.3 + n) * env;
  }
  return samples;
}

/** 5. turn-change: soft two-tone chime (ascending). */
function generateTurnChange() {
  const duration = 0.55;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // First note: C5 (523 Hz) for 0–0.28s
    if (t < 0.28) {
      const env = envelope(t, 0.025, 0.1, 0.155, 0.28);
      samples[i] = sine(523, t) * env * 0.2;
    }
    // Second note: E5 (659 Hz) for 0.22–0.55s (slight overlap)
    if (t >= 0.22) {
      const t2 = t - 0.22;
      const env = envelope(t2, 0.025, 0.1, 0.205, 0.33);
      samples[i] += sine(659, t) * env * 0.2;
    }
  }
  return samples;
}

/** 6. round-end: gentle rising three-note fanfare. */
function generateRoundEnd() {
  const duration = 0.9;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  const notes = [
    { freq: 523, start: 0.0, len: 0.3 },   // C5
    { freq: 659, start: 0.22, len: 0.3 },   // E5
    { freq: 784, start: 0.45, len: 0.45 },  // G5 (longer sustain)
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.len) {
        const nt = t - note.start;
        const env = envelope(nt, 0.025, note.len * 0.35, note.len * 0.625, note.len);
        // Softer harmonic blend
        samples[i] += (sine(note.freq, t) * 0.3 + sine(note.freq * 2, t) * 0.07) * env * 0.25;
      }
    }
  }
  return samples;
}

/** 7. score-reveal: soft sparkle/shimmer — gentle arpeggiated tones. */
function generateScoreReveal() {
  const duration = 0.65;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  // Lower-pitched ascending arpeggio: C5, E5, G5, C6
  const freqs = [523, 659, 784, 1047];
  const noteLen = 0.18;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    for (let n = 0; n < freqs.length; n++) {
      const start = n * 0.12;
      if (t >= start && t < start + noteLen) {
        const nt = t - start;
        const env = envelope(nt, 0.02, 0.04, noteLen - 0.06, noteLen);
        samples[i] += sine(freqs[n], t) * env * 0.15;
      }
    }
  }
  return samples;
}

/** 8. ui-click: soft, brief click. */
function generateUIClick() {
  const duration = 0.09;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.01, 0.075, duration);
    // Short click: softer tone and reduced noise
    const tone = sine(800, t) * 0.35;
    const n = noise() * 0.12 * Math.max(0, 1 - t * 25);
    samples[i] = (tone + n) * env;
  }
  return samples;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sounds = [
  { name: 'card-draw',    gen: generateCardDraw },
  { name: 'card-flip',    gen: generateCardFlip },
  { name: 'card-swap',    gen: generateCardSwap },
  { name: 'card-discard', gen: generateCardDiscard },
  { name: 'turn-change',  gen: generateTurnChange },
  { name: 'round-end',    gen: generateRoundEnd },
  { name: 'score-reveal', gen: generateScoreReveal },
  { name: 'ui-click',     gen: generateUIClick },
];

console.log('Generating sound effects...\n');

for (const { name, gen } of sounds) {
  const samples = gen();
  writeWav(join(OUT_DIR, `${name}.wav`), samples);
}

console.log('\nDone! Generated 8 sound effects in public/assets/audio/');
