import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateTranscriptFile } from '../../scripts/validate-transcript';

const OUT_DIR = path.join('tmp', 'test-e2e-main-street');
fs.mkdirSync(OUT_DIR, { recursive: true });

function runDemo(seed: string): any {
  // Use tsx to execute the TypeScript demo script. Captures stdout JSON.
  const res = spawnSync('npx', ['tsx', 'scripts/demo-main-street.ts', '--seed', seed], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`demo-main-street failed: ${res.stderr || res.stdout}`);
  }
  // demo script prints JSON to stdout
  const stdout = res.stdout as string;
  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`Failed to parse demo output as JSON: ${(err as Error).message}\nOutput:\n${stdout}`);
  }
}

function convertDemoToSchema(demo: any): any {
  // Convert the demo transcript shape to the schema-like shape used by the validator
  const events: any[] = [];
  for (const t of demo.turns) {
    const turn = t.turn;
    for (const a of t.actions) {
      events.push({ type: 'action', turn, action: { type: a.type, detail: a.detail } });
    }
    events.push({ type: 'turn-end', turn });
  }
  events.push({ type: 'game-end', turn: demo.totalTurns, finalScore: demo.finalScore, result: { outcome: demo.result }, endReason: demo.endReason });

  const converted = {
    version: 1,
    gameType: 'main-street',
    startedAt: demo.startedAt,
    endedAt: demo.endedAt,
    initialState: { seed: demo.seed },
    events,
    results: { finalScore: demo.finalScore, result: demo.result, endReason: demo.endReason },
  };
  return converted;
}

describe('Main Street headless demo e2e', () => {
  it('runs a short headless Main Street session and validates output', () => {
    const seed = `e2e-${Date.now()}`;
    const demo = runDemo(seed);

    // Basic smoke assertions on demo output
    expect(demo).toBeDefined();
    expect(demo.game).toBe('main-street');
    expect(typeof demo.finalScore).toBe('number');
    expect(Array.isArray(demo.turns)).toBe(true);
    expect(demo.turns.length).toBeGreaterThan(0);

    const outPath = path.join(OUT_DIR, `main-street-demo-${seed}.json`);
    fs.writeFileSync(outPath, JSON.stringify(demo, null, 2));

    // Convert to canonical-ish schema and run AJV validation
    const converted = convertDemoToSchema(demo);
    const convertedPath = path.join(OUT_DIR, `main-street-demo-${seed}.converted.json`);
    fs.writeFileSync(convertedPath, JSON.stringify(converted, null, 2));

    const schemaPath = path.resolve('schemas', 'main-street-transcript.schema.json');
    const result = validateTranscriptFile(schemaPath, convertedPath);
    if (!result.valid) {
      console.error('Schema validation errors:', result.errors);
    }
    expect(result.valid).toBe(true);
  }, 60_000);
});
