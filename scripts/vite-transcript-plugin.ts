/**
 * Vite dev-server plugin for persisting game transcripts to disk.
 *
 * Handles POST /api/transcripts with a JSON body containing:
 *   { gameType: string, transcript: object }
 *
 * Writes transcripts to data/transcripts/<gameType>/<gameType>-<ISO-timestamp>.json
 * with sanitised filenames (colons replaced with hyphens, millisecond precision).
 *
 * This plugin should only be registered during `vite serve` (dev mode),
 * not during build or test runs.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Sanitise an ISO timestamp for use in filenames.
 * Replaces colons with hyphens to avoid filesystem issues on Windows.
 * Example: 2026-01-15T14:30:45.123Z -> 2026-01-15T14-30-45.123Z
 */
function sanitiseTimestamp(iso: string): string {
  return iso.replace(/:/g, '-');
}

/**
 * Vite plugin that provides a POST /api/transcripts endpoint for
 * persisting game transcripts to the local filesystem during development.
 */
export function transcriptPersistPlugin(): Plugin {
  return {
    name: 'transcript-persist',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || req.url !== '/api/transcripts') {
          return next();
        }

        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const { gameType, transcript } = JSON.parse(body) as {
              gameType: string;
              transcript: unknown;
            };

            if (!gameType || typeof gameType !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Missing or invalid gameType' }));
              return;
            }

            if (!transcript) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Missing transcript' }));
              return;
            }

            const timestamp = sanitiseTimestamp(new Date().toISOString());
            const fileName = `${gameType}-${timestamp}.json`;
            const outPath = resolve(`data/transcripts/${gameType}/${fileName}`);

            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, JSON.stringify(transcript, null, 2) + '\n');

            console.log(`[transcript-persist] Saved transcript to ${outPath}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, path: outPath }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`[transcript-persist] Failed to save transcript: ${message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: message }));
          }
        });
      });
    },
  };
}
