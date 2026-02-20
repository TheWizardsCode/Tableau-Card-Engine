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

/** 1. card-draw: short swoosh (filtered noise sweep). */
function generateCardDraw() {
  const duration = 0.25;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.01, 0.05, 0.19, duration);
    // Swoosh: noise modulated with a descending sine
    const freq = lerp(2000, 400, t / duration);
    const mod = sine(freq, t);
    samples[i] = noise() * mod * env * 0.5;
  }
  return samples;
}

/** 2. card-flip: quick snap/click with short tonal tail. */
function generateCardFlip() {
  const duration = 0.2;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Initial click (noise burst)
    const click = t < 0.01 ? noise() * (1 - t / 0.01) : 0;
    // Tonal tail
    const env = envelope(t, 0.005, 0.02, 0.175, duration);
    const tone = sine(lerp(1200, 800, t / duration), t) * env * 0.3;
    samples[i] = click * 0.7 + tone;
  }
  return samples;
}

/** 3. card-swap: two-part sound — slide out + slide in. */
function generateCardSwap() {
  const duration = 0.35;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  const half = duration / 2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    if (t < half) {
      // Slide out: ascending swoosh
      const env = envelope(t, 0.01, 0.05, half - 0.06, half);
      const freq = lerp(300, 1200, t / half);
      samples[i] = noise() * sine(freq, t) * env * 0.4;
    } else {
      // Slide in: descending swoosh
      const t2 = t - half;
      const env = envelope(t2, 0.01, 0.05, half - 0.06, half);
      const freq = lerp(1200, 300, t2 / half);
      samples[i] = noise() * sine(freq, t2) * env * 0.4;
    }
  }
  return samples;
}

/** 4. card-discard: soft thud with tonal drop. */
function generateCardDiscard() {
  const duration = 0.3;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.03, 0.265, duration);
    // Low thud with descending pitch
    const freq = lerp(400, 120, t / duration);
    const tone = sine(freq, t);
    // Bit of noise for texture
    const n = noise() * 0.15 * Math.max(0, 1 - t * 8);
    samples[i] = (tone * 0.5 + n) * env;
  }
  return samples;
}

/** 5. turn-change: gentle two-tone chime (ascending). */
function generateTurnChange() {
  const duration = 0.5;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // First note: C5 (523 Hz) for 0–0.25s
    if (t < 0.25) {
      const env = envelope(t, 0.01, 0.1, 0.14, 0.25);
      samples[i] = sine(523, t) * env * 0.4;
    }
    // Second note: E5 (659 Hz) for 0.2–0.5s (slight overlap)
    if (t >= 0.2) {
      const t2 = t - 0.2;
      const env = envelope(t2, 0.01, 0.1, 0.19, 0.3);
      samples[i] += sine(659, t) * env * 0.4;
    }
  }
  return samples;
}

/** 6. round-end: short rising three-note fanfare. */
function generateRoundEnd() {
  const duration = 0.8;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  const notes = [
    { freq: 523, start: 0.0, len: 0.25 },   // C5
    { freq: 659, start: 0.2, len: 0.25 },   // E5
    { freq: 784, start: 0.4, len: 0.4 },    // G5 (longer sustain)
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.len) {
        const nt = t - note.start;
        const env = envelope(nt, 0.01, note.len * 0.4, note.len * 0.59, note.len);
        // Add a slight harmonic for richness
        samples[i] += (sine(note.freq, t) * 0.5 + sine(note.freq * 2, t) * 0.15) * env * 0.4;
      }
    }
  }
  return samples;
}

/** 7. score-reveal: sparkle/shimmer — rapid arpeggiated tones. */
function generateScoreReveal() {
  const duration = 0.6;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  // Rapid ascending arpeggio: C6, E6, G6, C7
  const freqs = [1047, 1319, 1568, 2093];
  const noteLen = 0.15;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    for (let n = 0; n < freqs.length; n++) {
      const start = n * 0.1;
      if (t >= start && t < start + noteLen) {
        const nt = t - start;
        const env = envelope(nt, 0.005, 0.03, noteLen - 0.035, noteLen);
        samples[i] += sine(freqs[n], t) * env * 0.3;
      }
    }
  }
  return samples;
}

/** 8. ui-click: crisp short click. */
function generateUIClick() {
  const duration = 0.08;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.002, 0.008, 0.07, duration);
    // Short click: mix of mid-frequency tone and noise burst
    const tone = sine(1000, t) * 0.6;
    const n = noise() * 0.3 * Math.max(0, 1 - t * 30);
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
