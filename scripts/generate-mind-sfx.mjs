#!/usr/bin/env node
/**
 * Generate 6 CC0 zen/pulse-themed WAV sound effects for The Mind.
 *
 * Each sound is procedurally synthesized from basic waveforms (sine,
 * triangle, noise, envelopes, filters) -- no external samples are used,
 * so the output is automatically public-domain / CC0.
 *
 * Theme: Meditative synchronicity -- heartbeat pulses, ethereal chimes,
 * zen bells. Reflects the cooperative, real-time nature of The Mind where
 * players must feel each other's rhythm.
 *
 * Uses Tone.js Frequency class for note-to-Hz conversion.
 *
 * Usage:  node scripts/generate-mind-sfx.mjs
 * Output: public/assets/audio/the-mind/*.wav
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Frequency } from 'tone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'audio', 'the-mind');

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

/** Simple one-pole low-pass filter state machine. */
function lpf(state, sample, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state.prev = state.prev + alpha * (sample - state.prev);
  return state.prev;
}

/** Brown noise (integrated white noise). */
function brownNoise(state) {
  state.value += noise() * 0.1;
  state.value = Math.max(-1, Math.min(1, state.value));
  return state.value;
}

// ── Sound Generators ─────────────────────────────────────────────────────────

/**
 * 1. card-play: Heartbeat pulse -- a soft, warm thump with a subtle
 *    resonant ring, like a heartbeat in sync. Short and satisfying.
 */
function generateCardPlay() {
  const duration = 0.25;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Deep warm pulse (heartbeat-like)
    const pitchEnv = Math.exp(-t * 20);
    const freq = lerp(70, 180, pitchEnv);
    const pulse = sine(freq, t) * envelope(t, 0.002, 0.05, 0.15, 0.15, duration) * 0.5;
    // Subtle resonant ring (zen bowl)
    const f0 = noteToHz('E5');
    const ring = sine(f0, t) * 0.12 *
      envelope(t, 0.001, 0.08, 0.04, 0.12, duration);
    // Soft filtered noise for texture
    const tex = lpf(lpState, noise(), 400) * 0.08 *
      envelope(t, 0.001, 0.02, 0, 0.02, 0.04);
    samples[i] = pulse + ring + tex;
  }
  return samples;
}

/**
 * 2. life-lost: Warning pulse -- a dissonant low buzz with a
 *    descending tone, evoking broken synchronicity.
 */
function generateLifeLost() {
  const duration = 0.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.005, 0.08, 0.3, 0.3, duration);
    // Low dissonant buzz (tritone interval for tension)
    const f1 = noteToHz('A2');
    const f2 = noteToHz('Eb3'); // tritone = maximum dissonance
    const buzz = (triangle(f1, t) * 0.25 + sine(f2, t) * 0.15) * env;
    // Descending pitch sweep
    const sweepFreq = lerp(noteToHz('E4'), noteToHz('B2'), t / duration);
    const sweep = sine(sweepFreq, t) * 0.1 *
      envelope(t, 0.01, 0.12, 0.08, 0.2, duration);
    // Harsh noise burst at impact
    const noiseBurst = lpf(lpState, noise(), lerp(600, 200, t / duration)) *
      0.15 * envelope(t, 0.001, 0.03, 0, 0.02, 0.06);
    samples[i] = buzz + sweep + noiseBurst;
  }
  return samples;
}

/**
 * 3. level-complete: Zen bowl chime -- an ascending pair of bell-like
 *    tones with a warm shimmer, evoking harmony restored.
 */
function generateLevelComplete() {
  const duration = 0.8;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  // Two-note zen chime: perfect fifth (harmony)
  const f1 = noteToHz('C5');
  const f2 = noteToHz('G5');

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // First bell (zen bowl fundamental + inharmonic partials)
    const bell1Env = envelope(t, 0.001, 0.15, 0.12, 0.35, duration);
    const bell1 = (sine(f1, t) * 0.35 +
      sine(f1 * 2.76, t) * 0.1 +
      sine(f1 * 5.4, t) * 0.04) * bell1Env;
    // Second bell, slightly delayed
    const t2 = t - 0.15;
    const bell2Env = t2 > 0 ? envelope(t2, 0.001, 0.15, 0.12, 0.35, duration - 0.15) : 0;
    const bell2 = (sine(f2, t) * 0.3 +
      sine(f2 * 2.76, t) * 0.08 +
      sine(f2 * 5.4, t) * 0.03) * bell2Env;
    // High shimmer overlay
    const shimmer = sine(noteToHz('E6'), t) * 0.06 *
      envelope(t, 0.05, 0.15, 0.03, 0.3, duration);
    samples[i] = bell1 + bell2 + shimmer;
  }
  return samples;
}

/**
 * 4. game-win: Triumphant synchronicity -- ascending pentatonic
 *    bell cascade with warm resonance, like many hearts beating as one.
 */
function generateGameWin() {
  const duration = 2.0;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);

  // Pentatonic ascent (C major pentatonic -- pure, clean, harmonious)
  const notes = [
    { note: 'C4', start: 0.0, len: 0.4 },
    { note: 'E4', start: 0.2, len: 0.4 },
    { note: 'G4', start: 0.4, len: 0.4 },
    { note: 'C5', start: 0.6, len: 0.5 },
    { note: 'E5', start: 0.85, len: 0.8 },
  ];

  // High sparkle chimes at the end
  const chimes = [
    { note: 'G6', start: 1.2, len: 0.2 },
    { note: 'C7', start: 1.35, len: 0.2 },
    { note: 'E7', start: 1.5, len: 0.4 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;

    // Bell cascade (zen bowl-like tones)
    for (const { note, start, len } of notes) {
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.001, 0.12, 0.2, 0.2, len);
        const freq = noteToHz(note);
        // Bell with inharmonic partials
        const bell = (sine(freq, t) * 0.3 +
          sine(freq * 2.76, t) * 0.08 +
          sine(freq * 5.4, t) * 0.03) * env;
        samples[i] += bell;
      }
    }

    // Sparkle chimes
    for (const ch of chimes) {
      if (t >= ch.start && t < ch.start + ch.len) {
        const ct = t - ch.start;
        const cEnv = envelope(ct, 0.001, 0.05, 0.06, 0.1, ch.len);
        const freq = noteToHz(ch.note);
        samples[i] += (sine(freq, t) * 0.12 +
          sine(freq * 2.76, t) * 0.03) * cEnv;
      }
    }

    // Warm bass undertone for fullness
    if (t < 1.5) {
      const bassEnv = envelope(t, 0.05, 0.3, 0.15, 0.5, 1.5);
      samples[i] += sine(noteToHz('C3'), t) * 0.1 * bassEnv;
    }
  }
  return samples;
}

/**
 * 5. game-lost: Broken rhythm -- descending minor tones that dissolve
 *    into silence, like a heartbeat slowing to a stop.
 */
function generateGameLost() {
  const duration = 1.5;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const brownState = { value: 0 };
  const lpState = { prev: 0 };

  // Descending minor: C4 -> Ab3 -> Eb3 (Cm triad descending)
  const notes = [
    { note: 'C4', start: 0.0, len: 0.5 },
    { note: 'Ab3', start: 0.3, len: 0.5 },
    { note: 'Eb3', start: 0.6, len: 0.7 },
  ];

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;

    // Descending bell tones (growing dimmer)
    for (let ni = 0; ni < notes.length; ni++) {
      const { note, start, len } = notes[ni];
      if (t >= start && t < start + len) {
        const nt = t - start;
        const env = envelope(nt, 0.002, 0.12, 0.15, 0.3, len);
        const freq = noteToHz(note);
        // Each note gets progressively quieter
        const vol = 0.3 - ni * 0.05;
        const bell = (sine(freq, t) * vol +
          sine(freq * 2.76, t) * vol * 0.25) * env;
        samples[i] += bell;
      }
    }

    // Fading heartbeat pulse (slowing down)
    if (t >= 0.8 && t < 1.4) {
      const ht = t - 0.8;
      // Two slow, fading thuds
      const thud1Env = envelope(ht, 0.002, 0.05, 0.05, 0.08, 0.15);
      const thud2t = ht - 0.3;
      const thud2Env = thud2t > 0 ? envelope(thud2t, 0.002, 0.05, 0.03, 0.08, 0.15) : 0;
      const freq1 = lerp(60, 120, Math.exp(-ht * 15));
      const freq2 = lerp(50, 100, thud2t > 0 ? Math.exp(-thud2t * 15) : 0);
      samples[i] += sine(freq1, t) * thud1Env * 0.2;
      samples[i] += sine(freq2, t) * thud2Env * 0.12;
    }

    // Ambient fade (filtered brown noise)
    if (t >= 0.4 && t < 1.3) {
      const wt = t - 0.4;
      const windEnv = envelope(wt, 0.1, 0.2, 0.1, 0.4, 0.9);
      samples[i] += lpf(lpState, brownNoise(brownState), lerp(400, 100, t / duration)) *
        windEnv * 0.08;
    }
  }
  return samples;
}

/**
 * 6. ui-click: Zen tap -- a clean, minimal click with a hint of
 *    resonance, like tapping a wooden meditation block.
 */
function generateUIClick() {
  const duration = 0.1;
  const n = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(n);
  const lpState = { prev: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = envelope(t, 0.001, 0.025, 0.1, 0.06, duration);
    // Clean wooden tap
    const pitchEnv = Math.exp(-t * 45);
    const tap = sine(lerp(130, 350, pitchEnv), t) * 0.35;
    // Subtle resonance (wooden block character)
    const f0 = noteToHz('A5');
    const ring = sine(f0, t) * 0.08 *
      envelope(t, 0.001, 0.015, 0, 0.02, 0.04);
    // Brief wood noise
    const wood = lpf(lpState, noise(), 600) * 0.1 *
      envelope(t, 0.001, 0.01, 0, 0.01, 0.03);
    samples[i] = (tap + ring + wood) * env;
  }
  return samples;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sounds = [
  { name: 'card-play',      gen: generateCardPlay },
  { name: 'life-lost',      gen: generateLifeLost },
  { name: 'level-complete', gen: generateLevelComplete },
  { name: 'game-win',       gen: generateGameWin },
  { name: 'game-lost',      gen: generateGameLost },
  { name: 'ui-click',       gen: generateUIClick },
];

mkdirSync(OUT_DIR, { recursive: true });

console.log('Generating zen/pulse-themed sound effects for The Mind...\n');

for (const { name, gen } of sounds) {
  const out = gen();
  writeWav(join(OUT_DIR, `${name}.wav`), out);
}

console.log(`\nDone! Generated ${sounds.length} sound effects in public/assets/audio/the-mind/`);
