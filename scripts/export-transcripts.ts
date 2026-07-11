#!/usr/bin/env node
/**
 * CLI Batch Export Script -- exports stored game transcripts from
 * browser IndexedDB to disk as individual JSON files.
 *
 * Usage:
 *   npm run transcripts:export -- <gameType>
 *
 * Example:
 *   npm run transcripts:export -- golf
 *
 * The tool:
 *   1. Parses CLI args for the game type (positional argument).
 *   2. Ensures a dev server is running at localhost:3000 (auto-starts if needed).
 *   3. Launches headless Chromium via Playwright and navigates to the game page.
 *   4. Reads all transcripts for the specified game type from IndexedDB.
 *   5. Writes each transcript as <gameType>-<ISO-timestamp>.json to
 *      data/transcripts/<gameType>/, skipping files that already exist.
 *   6. Prints a summary of written and skipped files.
 *
 * See CG-0MLYUCGLI05C8SNE for full requirements.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { DEV_SERVER_URL, ensureDevServer, killDevServer } from './dev-server-utils';

// ── Types ───────────────────────────────────────────────────

/** Shape of a StoredTranscript as persisted in IndexedDB. */
interface ExportedTranscript {
  id: string;
  gameType: string;
  savedAt: string;
  seq: number;
  transcript: unknown;
}

// ── Constants ───────────────────────────────────────────────

const IDB_NAME = 'transcript-store';
const IDB_STORE = 'transcripts';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Sanitise an ISO timestamp for use in filenames.
 * Replaces colons with hyphens to avoid filesystem issues on Windows.
 */
function sanitiseTimestamp(iso: string): string {
  return iso.replace(/:/g, '-');
}

/**
 * Parse CLI arguments. Expects a single positional argument: the game type.
 */
function parseArgs(): { gameType: string } {
  const args = process.argv.slice(2);
  const gameType = args[0];

  if (!gameType || gameType.startsWith('-')) {
    console.error('Usage: npm run transcripts:export -- <gameType>');
    console.error('');
    console.error('Example:');
    console.error('  npm run transcripts:export -- golf');
    process.exit(1);
  }

  return { gameType };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const { gameType } = parseArgs();

  // Ensure dev server is running
  const devServerChild = await ensureDevServer();
  let browser: Browser | null = null;

  try {
    // Launch headless Chromium
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the game selector page
    console.log(`Navigating to ${DEV_SERVER_URL}/...`);
    await page.goto(`${DEV_SERVER_URL}/`, { waitUntil: 'domcontentloaded' });

    // Read transcripts from IndexedDB via page.evaluate()
    console.log(`Reading transcripts for game type "${gameType}" from IndexedDB...`);
    const transcripts = await page.evaluate(
      ({ dbName, storeName, gameType: gt }) => {
        return new Promise<ExportedTranscript[]>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1);

          request.onupgradeneeded = () => {
            // Database doesn't exist yet or is being created --
            // create the object store so the transaction doesn't fail,
            // but there will be no data.
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
              const store = db.createObjectStore(storeName, { keyPath: 'id' });
              store.createIndex('gameType', 'gameType', { unique: false });
              store.createIndex('savedAt', 'savedAt', { unique: false });
              store.createIndex('gameType_savedAt', ['gameType', 'savedAt'], {
                unique: false,
              });
            }
          };

          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
              db.close();
              resolve([]);
              return;
            }

            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index('gameType');
            const getAll = index.getAll(gt);

            getAll.onsuccess = () => {
              const entries = getAll.result as ExportedTranscript[];
              // Sort newest first (by savedAt descending)
              entries.sort(
                (a, b) =>
                  new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
              );
              db.close();
              resolve(entries);
            };

            getAll.onerror = () => {
              db.close();
              reject(new Error(`Failed to read from IndexedDB: ${getAll.error?.message}`));
            };
          };

          request.onerror = () => {
            reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
          };
        });
      },
      { dbName: IDB_NAME, storeName: IDB_STORE, gameType },
    );

    if (transcripts.length === 0) {
      console.log(`No transcripts found for "${gameType}".`);
      return;
    }

    console.log(`Found ${transcripts.length} transcript(s) for "${gameType}".`);

    // Prepare output directory
    const outDir = path.resolve(`data/transcripts/${gameType}`);
    fs.mkdirSync(outDir, { recursive: true });

    // Write each transcript to disk
    let written = 0;
    let skipped = 0;
    const writtenFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const entry of transcripts) {
      const timestamp = sanitiseTimestamp(entry.savedAt);
      const fileName = `${gameType}-${timestamp}.json`;
      const filePath = path.join(outDir, fileName);

      if (fs.existsSync(filePath)) {
        skipped++;
        skippedFiles.push(fileName);
        continue;
      }

      fs.writeFileSync(filePath, JSON.stringify(entry.transcript, null, 2) + '\n');
      written++;
      writtenFiles.push(fileName);
    }

    // Print summary
    console.log('');
    console.log('=== Export Summary ===');
    console.log(`Game type: ${gameType}`);
    console.log(`Total transcripts: ${transcripts.length}`);
    console.log(`Written: ${written}`);
    console.log(`Skipped (already exist): ${skipped}`);

    if (writtenFiles.length > 0) {
      console.log('');
      console.log('Written files:');
      for (const f of writtenFiles) {
        console.log(`  + ${f}`);
      }
    }

    if (skippedFiles.length > 0) {
      console.log('');
      console.log('Skipped files:');
      for (const f of skippedFiles) {
        console.log(`  ~ ${f}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
    killDevServer(devServerChild);
  }
}

main();
