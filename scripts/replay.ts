#!/usr/bin/env node
/**
 * Replay Tool -- replays a JSON game transcript, captures per-turn
 * screenshots via headless Playwright, and produces a JSON summary report.
 *
 * Usage:
 *   npm run replay -- <transcript.json> [--output <dir>] [--game <type>]
 *
 * The tool:
 *   1. Parses CLI args (transcript path, --output dir, --game type)
 *   2. Loads the transcript and resolves the appropriate game adapter
 *   3. Validates the transcript via the adapter
 *   4. Ensures a dev server is running at localhost:3000 (auto-starts if needed)
 *   5. Boots headless Chromium via Playwright at the adapter's replay URL
 *   6. Waits for the game scene to boot and become active
 *   7. Loads initial state + each turn via the adapter, capturing screenshots
 *   8. Writes a replay-summary.json report
 *
 * Game-specific logic is isolated in ReplayAdapter implementations.
 * See scripts/adapters/ for available adapters.
 *
 * See CG-0MLTFTD0B0B3EL3W for full requirements.
 * See CG-0MLTFUL061DWDGA2 for the adapter pattern refactoring.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { DEV_SERVER_URL, ensureDevServer, killDevServer } from './dev-server-utils';
import { adapterRegistry } from './adapters';
import type { ReplayAdapter } from './adapters';

// ── Types ───────────────────────────────────────────────────

interface TurnSummary {
  turn: number;
  screenshotPath: string;
  durationMs: number;
  phase: 'replay' | 'interactive';
  error?: string;
}

interface ReplaySummary {
  transcriptPath: string;
  outputDir: string;
  gameType: string;
  turnsReplayed: number;
  screenshots: TurnSummary[];
  totalDurationMs: number;
  errors: string[];
}

// ── Constants ───────────────────────────────────────────────

const VIEWPORT = { width: 900, height: 700 };
const SCENE_READY_TIMEOUT = 30_000;
const STATE_SETTLED_TIMEOUT = 10_000;

// ── CLI Arg Parsing ─────────────────────────────────────────

interface ParsedArgs {
  transcriptPath: string;
  outputDir: string;
  stopAt: number | undefined;
  gameType: string | undefined;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const availableTypes = adapterRegistry.getRegisteredTypes().join(', ');

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run replay -- <transcript.json> [--output <dir>] [--stop-at <turn>] [--game <type>]

Arguments:
  <transcript.json>   Path to the game transcript JSON file
  --output <dir>      Output directory for screenshots (default: data/screenshots/<basename>/)
  --stop-at <turn>    Pause replay at the specified turn (0-based) and launch a headed
                      browser for interactive debugging. Turn 0 = initial state.
  --game <type>       Force a specific game adapter instead of auto-detection.
                      Available: ${availableTypes || 'none'}

Examples:
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --output data/screenshots/golf/test/
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --stop-at 5
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --game golf
`);
    process.exit(0);
  }

  let transcriptPath = '';
  let outputDir = '';
  let stopAt: number | undefined;
  let gameType: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputDir = args[++i] || '';
    } else if (args[i] === '--stop-at') {
      const rawValue = args[++i];
      if (rawValue === undefined || rawValue === '') {
        console.error('Error: --stop-at requires a non-negative integer value.');
        process.exit(1);
      }
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed < 0) {
        console.error(`Error: --stop-at requires a non-negative integer value. Got: ${rawValue}`);
        process.exit(1);
      }
      stopAt = parsed;
    } else if (args[i] === '--game' || args[i] === '-g') {
      gameType = args[++i];
      if (!gameType) {
        console.error(`Error: --game requires a game type. Available: ${availableTypes || 'none'}`);
        process.exit(1);
      }
    } else if (!args[i].startsWith('-')) {
      transcriptPath = args[i];
    }
  }

  if (!transcriptPath) {
    console.error('Error: No transcript file specified.');
    process.exit(1);
  }

  // Default output directory derived from transcript filename
  if (!outputDir) {
    const basename = path.basename(transcriptPath, path.extname(transcriptPath));
    outputDir = path.join('data', 'screenshots', basename);
  }

  return { transcriptPath, outputDir, stopAt, gameType };
}

// ── Transcript Loading ──────────────────────────────────────

/**
 * Load and parse a transcript file as raw JSON.
 *
 * Validation is deferred to the adapter's `validateTranscript()` method.
 */
function loadRawTranscript(filePath: string): unknown {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: Transcript file not found: ${resolved}`);
    process.exit(1);
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(resolved, 'utf-8');
  } catch (err) {
    console.error(`Error: Could not read transcript file: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    console.error('Error: Transcript file contains invalid JSON.');
    process.exit(1);
  }
}

// ── Playwright Automation ───────────────────────────────────

/**
 * Wait for the Phaser game to boot (isRunning = true) and the scene
 * manager to be available.
 */
async function waitForGameBoot(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    `(() => {
      const game = window.__PHASER_GAME__;
      return game && game.isBooted && game.isRunning;
    })()`,
    { timeout: timeoutMs },
  );
}

/**
 * Capture a screenshot of the Phaser canvas.
 *
 * Uses canvas.toDataURL() inside the browser to avoid the slow
 * Playwright element-screenshot path (GPU readback via CDP).
 * The base-64 PNG is transferred to Node and written to disk.
 */
async function captureScreenshot(
  page: Page,
  filePath: string,
): Promise<void> {
  const dataUrl: string = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No <canvas> element found');
    return canvas.toDataURL('image/png');
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { transcriptPath, outputDir, stopAt, gameType } = parseArgs();
  const rawTranscript = loadRawTranscript(transcriptPath);

  // ── Resolve adapter ──
  let adapter: ReplayAdapter;
  try {
    adapter = adapterRegistry.resolve(rawTranscript, gameType);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Validate transcript ──
  const validation = adapter.validateTranscript(rawTranscript);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    process.exit(1);
  }

  const turnCount = adapter.getTurnCount(rawTranscript);
  const version = adapter.getVersion(rawTranscript);
  const summaryLine = adapter.getSummaryLine(rawTranscript);

  // Reject interactive takeover if the adapter doesn't support it
  if (stopAt !== undefined && !adapter.supportsInteractiveTakeover(rawTranscript)) {
    console.error(
      'Error: --stop-at is not supported for this transcript. ' +
        (adapter.gameType === 'golf'
          ? 'Re-record the game to generate a v2 transcript with stock pile data.'
          : `The ${adapter.gameType} adapter does not support interactive takeover.`),
    );
    process.exit(1);
  }

  console.log(`Transcript: ${transcriptPath}`);
  console.log(`  Game: ${adapter.gameType}`);
  console.log(`  Version: ${version}`);
  console.log(`  Turns: ${turnCount}`);
  console.log(`  ${summaryLine}`);
  console.log(`  Output: ${outputDir}`);

  // Validate --stop-at against total turns (warning if exceeds)
  let effectiveStopAt: number | undefined = stopAt;
  if (stopAt !== undefined && stopAt > turnCount) {
    console.log(`Warning: --stop-at ${stopAt} exceeds total turns (${turnCount}). Replayed all turns.`);
    effectiveStopAt = undefined; // replay all turns
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Ensure dev server is running
  const devServerChild = await ensureDevServer();

  let browser: Browser | null = null;
  const summary: ReplaySummary = {
    transcriptPath: path.resolve(transcriptPath),
    outputDir: path.resolve(outputDir),
    gameType: adapter.gameType,
    turnsReplayed: 0,
    screenshots: [],
    totalDurationMs: 0,
    errors: [],
  };

  const totalStart = Date.now();

  try {
    // Launch Chromium -- headed when --stop-at is specified
    const headless = effectiveStopAt === undefined;
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: VIEWPORT,
    });
    const page = await context.newPage();

    // Navigate to the game in replay mode
    const gameUrl = adapter.getReplayUrl(DEV_SERVER_URL);
    console.log(`Navigating to ${gameUrl}`);
    await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });

    // Wait for Phaser to boot (GameSelectorScene starts first)
    console.log('Waiting for Phaser game to boot...');
    await waitForGameBoot(page, SCENE_READY_TIMEOUT);

    // Start the game scene via the adapter
    console.log(`Starting ${adapter.sceneKey} in replay mode...`);
    await adapter.startScene(page);

    // Wait for the scene to finish loading and become active
    console.log(`Waiting for ${adapter.sceneKey} to become active...`);
    await adapter.waitForSceneReady(page, SCENE_READY_TIMEOUT);
    console.log(`${adapter.sceneKey} is active.`);

    // ── Initial state screenshot ──
    console.log('Loading initial state...');
    const initStart = Date.now();
    try {
      await adapter.injectInitialState(page, rawTranscript, STATE_SETTLED_TIMEOUT);

      const ssPath = path.join(outputDir, 'turn-000.png');
      await captureScreenshot(page, ssPath);
      const initDuration = Date.now() - initStart;

      summary.screenshots.push({
        turn: 0,
        screenshotPath: path.resolve(ssPath),
        durationMs: initDuration,
        phase: 'replay',
      });
      console.log(`  turn-000.png (initial state) [${initDuration}ms]`);
    } catch (err) {
      const msg = `Initial state error: ${(err as Error).message}`;
      summary.errors.push(msg);
      console.error(`  ${msg}`);
    }

    // Determine how many turns to replay
    const turnsToReplay = effectiveStopAt !== undefined
      ? Math.min(effectiveStopAt, turnCount)
      : turnCount;

    // ── Per-turn screenshots ──
    for (let i = 0; i < turnsToReplay; i++) {
      const turnLabel = String(i + 1).padStart(3, '0');
      const turnStart = Date.now();

      try {
        await adapter.injectTurnState(page, rawTranscript, i, STATE_SETTLED_TIMEOUT);

        const ssPath = path.join(outputDir, `turn-${turnLabel}.png`);
        await captureScreenshot(page, ssPath);
        const turnDuration = Date.now() - turnStart;

        summary.screenshots.push({
          turn: i + 1,
          screenshotPath: path.resolve(ssPath),
          durationMs: turnDuration,
          phase: 'replay',
        });
        summary.turnsReplayed++;

        const turnDesc = adapter.describeTurn(rawTranscript, i);
        console.log(`  turn-${turnLabel}.png [${turnDesc}] [${turnDuration}ms]`);
      } catch (err) {
        const msg = `Turn ${i + 1} error: ${(err as Error).message}`;
        summary.errors.push(msg);
        summary.screenshots.push({
          turn: i + 1,
          screenshotPath: '',
          durationMs: Date.now() - turnStart,
          phase: 'replay',
          error: msg,
        });
        console.error(`  ${msg}`);
      }
    }

    // ── Interactive takeover (--stop-at) ──
    if (effectiveStopAt !== undefined) {
      // Determine the last action description via the adapter
      const lastActionIndex = effectiveStopAt > 0 ? effectiveStopAt - 1 : -1;
      const lastAction = adapter.describeLastAction(rawTranscript, lastActionIndex);

      // If --stop-at is beyond the replayed turns (but within bounds),
      // inject the stop-at turn's board state
      if (effectiveStopAt > 0 && effectiveStopAt <= turnCount) {
        await adapter.injectTurnState(
          page,
          rawTranscript,
          effectiveStopAt - 1,
          STATE_SETTLED_TIMEOUT,
        );
      }
      // If --stop-at 0, the initial state is already loaded

      // Show the takeover overlay and wait for the developer's choice
      console.log(`\n──── Interactive Takeover ────`);
      console.log(`  Paused at turn ${effectiveStopAt}`);
      console.log(`  Last action: ${lastAction}`);
      console.log(`  Browser is headed -- interact with the game in the browser window.`);
      console.log(`  Press Ctrl+C or close the browser to exit.\n`);

      // Expose a function for the browser to signal screenshot capture
      let interactiveTurnNumber = turnsToReplay + 1; // Continue numbering after replay
      const captureInteractiveScreenshot = async () => {
        const turnLabel = String(interactiveTurnNumber).padStart(3, '0');
        const ssPath = path.join(outputDir, `turn-${turnLabel}.png`);
        const turnStart = Date.now();

        try {
          await captureScreenshot(page, ssPath);
          const turnDuration = Date.now() - turnStart;

          summary.screenshots.push({
            turn: interactiveTurnNumber,
            screenshotPath: path.resolve(ssPath),
            durationMs: turnDuration,
            phase: 'interactive',
          });
          console.log(`  turn-${turnLabel}.png (interactive) [${turnDuration}ms]`);
          interactiveTurnNumber++;
        } catch (err) {
          const msg = `Interactive screenshot error: ${(err as Error).message}`;
          summary.errors.push(msg);
          console.error(`  ${msg}`);
        }
      };

      // Expose the screenshot function to the browser
      await page.exposeFunction('__captureInteractiveScreenshot__', captureInteractiveScreenshot);

      // Register a state-settled listener in the browser that calls back
      // to the Node side for auto-capture. Also handle resume-replay.
      let resumeReplayResolve: (() => void) | null = null;
      const resumeReplayPromise = new Promise<void>((resolve) => {
        resumeReplayResolve = resolve;
      });
      await page.exposeFunction('__signalResumeReplay__', () => {
        if (resumeReplayResolve) resumeReplayResolve();
      });

      // Wire up state-settled auto-capture and resume-replay signal in-browser
      await page.evaluate(`
        (() => {
          const emitter = window.__GAME_EVENTS__;
          if (!emitter) return;
          // Auto-capture on each state-settled during interactive play
          emitter.on('state-settled', () => {
            if (!window.__REPLAY_INTERACTIVE_MODE__) return;
            window.__captureInteractiveScreenshot__();
          });
          // Resume-replay signal
          emitter.on('resume-replay', () => {
            window.__signalResumeReplay__();
          });
        })()
      `);

      // Show the takeover overlay via the adapter
      await adapter.showTakeoverOverlay(page, {
        turnNumber: effectiveStopAt,
        lastAction,
      });

      // Wait for either: browser close, resume-replay signal, or SIGINT/SIGTERM
      const browserClosed = new Promise<'closed'>((resolve) => {
        page.on('close', () => resolve('closed'));
      });

      const sigintReceived = new Promise<'sigint'>((resolve) => {
        const handler = () => {
          resolve('sigint');
          process.off('SIGINT', handler);
          process.off('SIGTERM', handler);
        };
        process.on('SIGINT', handler);
        process.on('SIGTERM', handler);
      });

      const resumeReplaySignal = resumeReplayPromise.then(() => 'resume' as const);

      const exitReason = await Promise.race([browserClosed, sigintReceived, resumeReplaySignal]);

      if (exitReason === 'resume') {
        console.log('\n──── Resuming Replay ────');
        // Set flag to stop auto-capture during resumed replay
        await page.evaluate('window.__REPLAY_INTERACTIVE_MODE__ = false');

        // Continue replaying remaining turns via the adapter
        for (let i = turnsToReplay; i < turnCount; i++) {
          const turnLabel = String(i + 1).padStart(3, '0');
          const turnStart = Date.now();

          try {
            await adapter.injectTurnState(page, rawTranscript, i, STATE_SETTLED_TIMEOUT);

            const ssPath = path.join(outputDir, `turn-${turnLabel}.png`);
            await captureScreenshot(page, ssPath);
            const turnDuration = Date.now() - turnStart;

            summary.screenshots.push({
              turn: i + 1,
              screenshotPath: path.resolve(ssPath),
              durationMs: turnDuration,
              phase: 'replay',
            });
            summary.turnsReplayed++;

            const turnDesc = adapter.describeTurn(rawTranscript, i);
            console.log(`  turn-${turnLabel}.png [${turnDesc}] [${turnDuration}ms]`);
          } catch (err) {
            const msg = `Turn ${i + 1} error: ${(err as Error).message}`;
            summary.errors.push(msg);
            console.error(`  ${msg}`);
          }
        }
      } else {
        console.log(`\nExiting: ${exitReason === 'closed' ? 'browser closed' : 'received signal'}`);
      }
    }
  } catch (err) {
    const msg = `Fatal error: ${(err as Error).message}`;
    summary.errors.push(msg);
    console.error(msg);
  } finally {
    summary.totalDurationMs = Date.now() - totalStart;

    // Write summary report
    const summaryPath = path.join(outputDir, 'replay-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\nSummary written to ${summaryPath}`);
    console.log(`Total: ${summary.turnsReplayed} turns replayed, ${summary.screenshots.length} screenshots, ${summary.totalDurationMs}ms`);

    if (summary.errors.length > 0) {
      console.error(`Errors: ${summary.errors.length}`);
    }

    // Cleanup
    if (browser) {
      await browser.close();
    }
    killDevServer(devServerChild);
  }

  // Exit with appropriate code
  process.exit(summary.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
