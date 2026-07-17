/**
 * balance-cards.ts — CLI entry point for the Main Street card balancing tool.
 *
 * Usage: npx tsx scripts/balance-cards.ts [--input <path>] [--output <path>]
 *
 * Reads the Main Street card CSV, performs a hybrid curve-fitting + tier-band
 * balancing pass on all 5 card families, prints a summary table to stdout,
 * and writes the balanced CSV to the output path (defaults to overwriting
 * the input; the original is preserved via rotating backups).
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

import {
  readCsvFile,
  writeCsvFile,
  rotateBackups,
  validateCsvRows,
  runBalancingPass,
  formatSummaryTable,
} from './balance-cards';

// ── Default paths ─────────────────────────────────────────────────────

const DEFAULT_INPUT = resolve(process.cwd(), 'example-games/main-street/card-data.csv');
const DEFAULT_OUTPUT = DEFAULT_INPUT;

// ── Argument parsing ──────────────────────────────────────────────────

function parseArgs(): { input: string; output: string } {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) {
      input = resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--output' && i + 1 < args.length) {
      output = resolve(process.cwd(), args[++i]);
    } else if (args[i] === '--help') {
      console.log('Usage: npx tsx scripts/balance-cards.ts [--input <path>] [--output <path>]');
      process.exit(0);
    }
  }

  return { input, output };
}

// ── Main ──────────────────────────────────────────────────────────────

function main(): void {
  const { input, output } = parseArgs();

  // Verify input exists
  if (!existsSync(input)) {
    console.error(`Error: Input CSV not found: ${input}`);
    process.exit(1);
  }

  // Read and validate CSV
  console.error(`Reading: ${input}`);
  const rows = readCsvFile(input);
  validateCsvRows(rows);
  console.error(`Validated ${rows.length} card rows`);

  // Run balancing pass
  console.error('Running balancing pass...');
  const result = runBalancingPass(rows);

  // Create rotating backups before writing
  console.error('Creating rotating backups...');
  rotateBackups(output);

  // Write the balanced CSV
  writeCsvFile(output, result.rows);
  console.error(`Written: ${output}`);

  // Print summary table to stdout
  const summary = formatSummaryTable(
    result.adjustments,
    result.summaries,
    result.rows.length,
  );
  console.log(summary);
}

main();
