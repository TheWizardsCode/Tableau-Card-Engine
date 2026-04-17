import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { validateTranscriptFile } from '../../scripts/validate-transcript';

const TMP_DIR = path.join('tmp', 'test-e2e-transcripts');

function makeSampleTranscript() {
  return {
    version: 1,
    gameType: 'main-street',
    startedAt: new Date().toISOString(),
    endedAt: null,
    initialState: {
      seed: 'e2e-sample-0',
      streetGrid: Array(10).fill(null),
      market: { businesses: [], investments: [] },
    },
    events: [
      { type: 'ai-action', turn: 1, strategy: 'Greedy', action: { type: 'buy-business', cardId: 'cafe-1', slotIndex: 2 } },
      { type: 'hint', turn: 2, recommendedAction: { type: 'buy-business', cardId: 'bakery-3', slotIndex: 4 }, rationale: 'Buy Bakery for synergy' },
      { type: 'action', turn: 2, action: { type: 'buy-business', cardId: 'bakery-3', slotIndex: 4 } },
      { type: 'undo', turn: 2, reversedAction: { type: 'buy-business', cardId: 'bakery-3', slotIndex: 4 } },
      { type: 'redo', turn: 2, reappliedAction: { type: 'buy-business', cardId: 'bakery-3', slotIndex: 4 } },
      { type: 'turn-end', turn: 2 },
      { type: 'game-end', turn: 10, result: { outcome: 'win' }, finalScore: 150 }
    ],
    results: null,
  };
}

describe('Main Street transcript schema & validator (e2e)', () => {
  it('ajv validates a sample Main Street transcript against the schema', () => {
    const schemaPath = path.resolve('schemas', 'main-street-transcript.schema.json');
    const rawSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(rawSchema);

    const sample = makeSampleTranscript();
    const valid = validate(sample) as boolean;
    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }
    expect(valid).toBe(true);
  });

  it('cli validator script accepts a generated transcript file', () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const transcriptPath = path.join(TMP_DIR, 'main-street-sample.json');
    fs.writeFileSync(transcriptPath, JSON.stringify(makeSampleTranscript(), null, 2));

    const schemaPath = path.resolve('schemas', 'main-street-transcript.schema.json');
    const result = validateTranscriptFile(schemaPath, transcriptPath);
    expect(result.valid).toBe(true);
  });
});
