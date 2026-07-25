#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Ajv, { type ErrorObject } from 'ajv';

export function validateTranscriptFile(schemaPath: string, transcriptPath: string): { valid: boolean; errors?: ErrorObject[] | null } {
  const absSchema = path.resolve(schemaPath);
  const absTranscript = path.resolve(transcriptPath);

  if (!fs.existsSync(absSchema)) {
    throw new Error(`Schema file not found: ${absSchema}`);
  }
  if (!fs.existsSync(absTranscript)) {
    throw new Error(`Transcript file not found: ${absTranscript}`);
  }

  const rawSchema = JSON.parse(fs.readFileSync(absSchema, 'utf8'));
  const rawTranscript = JSON.parse(fs.readFileSync(absTranscript, 'utf8'));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(rawSchema);
  const valid = validate(rawTranscript) as boolean;
  return { valid, errors: validate.errors };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/validate-transcript.ts <schema.json> <transcript.json>');
    process.exit(2);
  }
  const [schemaPath, transcriptPath] = args;
  try {
    const result = validateTranscriptFile(schemaPath, transcriptPath);
    if (!result.valid) {
      console.error('Transcript validation failed:');
      console.error(JSON.stringify(result.errors, null, 2));
      process.exit(1);
    }
    console.log('Transcript is valid according to schema.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  }
}
