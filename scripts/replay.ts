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
import { generateContactSheet } from './contact-sheet';

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
  contactSheetPath?: string;
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
  skipTo: number | undefined;
  gameType: string | undefined;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const availableTypes = adapterRegistry.getRegisteredTypes().join(', ');

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run replay -- <transcript.json> [--output <dir>] [--stop-at <turn>] [--skip-to <turn>] [--game <type>]

Arguments:
  <transcript.json>   Path to the game transcript JSON file
  --output <dir>      Output directory for screenshots (default: data/screenshots/<basename>/)
  --stop-at <turn>    Pause replay at the specified turn (0-based) and launch a headed
                      browser for interactive debugging. Turn 0 = initial state.
  --skip-to <turn>    Fast-forward replay to the specified turn (0-based) without
                      capturing screenshots, then resume visual replay from that turn.
  --game <type>       Force a specific game adapter instead of auto-detection.
                      Available: ${availableTypes || 'none'}

Examples:
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --output data/screenshots/golf/test/
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --stop-at 5
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --skip-to 10
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --skip-to 10 --stop-at 15
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --game golf
`);
    process.exit(0);
  }

  let transcriptPath = '';
  let outputDir = '';
  let stopAt: number | undefined;
  let skipTo: number | undefined;
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
    } else if (args[i] === '--skip-to') {
      const rawValue = args[++i];
      if (rawValue === undefined || rawValue === '') {
        console.error('Error: --skip-to requires a non-negative integer value.');
        process.exit(1);
      }
      const parsed = Number(rawValue);
      if (!Number.isInteger(parsed) || parsed < 0) {
        console.error(`Error: --skip-to requires a non-negative integer value. Got: ${rawValue}`);
        process.exit(1);
      }
      skipTo = parsed;
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

  return { transcriptPath, outputDir, stopAt, skipTo, gameType };
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
 * Uses `canvas.toDataURL()` inside the browser for speed (~50ms vs
 * ~7s for Playwright's CDP-based element screenshot).  This requires
 * `preserveDrawingBuffer: true` on the WebGL context, which the app
 * sets automatically when `?mode=replay` is in the URL (see main.ts).
 *
 * Without `preserveDrawingBuffer` the drawing buffer is cleared after
 * compositing and `toDataURL()` returns a black image.
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
  const { transcriptPath, outputDir: explicitOutputDir, stopAt, skipTo, gameType } = parseArgs();
  const rawTranscript = loadRawTranscript(transcriptPath);

  // ── Resolve adapter ──
  let adapter: ReplayAdapter;
  try {
    adapter = adapterRegistry.resolve(rawTranscript, gameType);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  // Default output directory derived from adapter game type (matches
  // generate-thumbnail.ts convention: data/screenshots/<game-type>/).
  const outputDir = explicitOutputDir || path.join('data', 'screenshots', adapter.gameType);

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

  // Validate --skip-to (fast-forward target)
  let effectiveSkipTo: number | undefined = skipTo;
  if (effectiveSkipTo !== undefined && effectiveSkipTo > turnCount) {
    console.log(`Warning: --skip-to ${effectiveSkipTo} exceeds total turns (${turnCount}). No skipping will occur.`);
    effectiveSkipTo = undefined;
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
    // ── Phase 1: Headless fast-forward (when --skip-to is used) ─────────
    // If --skip-to is provided and > 0, we first run headlessly to reach
    // the goal turn without capturing screenshots, then close the browser.
    let skipToTurnState: { turnIndex: number } | null = null;
    
    if (effectiveSkipTo !== undefined && effectiveSkipTo > 0) {
      console.log(`\n── Fast-forwarding to turn ${effectiveSkipTo} (headless) ──`);
      
      let headlessBrowser: Browser | null = null;
      try {
        // Launch headless browser for fast-forward phase
        headlessBrowser = await chromium.launch({ headless: true });
        const headlessContext = await headlessBrowser.newContext({ viewport: VIEWPORT });
        const headlessPage = await headlessContext.newPage();
        
        // Navigate to the game in replay mode
        const gameUrl = adapter.getReplayUrl(DEV_SERVER_URL);
        await headlessPage.goto(gameUrl, { waitUntil: 'domcontentloaded' });
        
        // Wait for Phaser to boot
        await waitForGameBoot(headlessPage, SCENE_READY_TIMEOUT);
        
        // Start the game scene
        await adapter.startScene(headlessPage);
        await adapter.waitForSceneReady(headlessPage, SCENE_READY_TIMEOUT);
        
        // Inject initial state (turn 0)
        console.log('  Injecting initial state (turn 0)...');
        await adapter.injectInitialState(headlessPage, rawTranscript, STATE_SETTLED_TIMEOUT);
        
        // Record summary entry for turn 0 (skipped, no screenshot)
        summary.screenshots.push({
          turn: 0,
          screenshotPath: '',
          durationMs: 0,
          phase: 'replay',
        });
        console.log(`  skipped turn-000.png [initial state]`);
        
        // Fast-forward through turns 0 to skipTo-2 (which gives us states for turns 1 to skipTo-1)
        // injectTurnState(turnIndex) injects the state AFTER that turn completes
        // So to get to turn N, we need to inject turn states 0 through N-2
        const fastForwardTurns = Math.min(effectiveSkipTo - 1, turnCount);
        for (let i = 0; i < fastForwardTurns; i++) {
          const turnLabel = String(i + 1).padStart(3, '0');
          const turnDesc = adapter.describeTurn(rawTranscript, i);
          
          try {
            await adapter.injectTurnState(headlessPage, rawTranscript, i, STATE_SETTLED_TIMEOUT);
            
            // Record summary entry for skipped turn (no screenshot)
            summary.screenshots.push({
              turn: i + 1,
              screenshotPath: '',
              durationMs: 0,
              phase: 'replay',
            });
            console.log(`  skipped turn-${turnLabel}.png [${turnDesc}]`);
          } catch (err) {
            const msg = `Fast-forward turn ${i + 1} error: ${(err as Error).message}`;
            summary.errors.push(msg);
            console.error(`  ${msg}`);
          }
        }
        
        // Save the turn index we reached (we're now at state for turn effectiveSkipTo)
        skipToTurnState = { turnIndex: effectiveSkipTo - 1 };
        
        console.log(`  Fast-forward complete. Closing headless browser.`);
      } catch (err) {
        const msg = `Fast-forward phase error: ${(err as Error).message}`;
        summary.errors.push(msg);
        console.error(`  ${msg}`);
      } finally {
        if (headlessBrowser) {
          await headlessBrowser.close();
        }
      }
    }

    // ── Phase 2: Visual replay (headed browser) ─────────────────────────
    // Launch Chromium -- headed when --stop-at is specified OR when we're
    // resuming from a --skip-to fast-forward point
    const useHeadedBrowser = effectiveStopAt !== undefined || (effectiveSkipTo !== undefined && effectiveSkipTo > 0);
    const headless = !useHeadedBrowser;
    
    if (effectiveSkipTo !== undefined && effectiveSkipTo > 0) {
      console.log(`\n── Launching headed browser at turn ${effectiveSkipTo} ──`);
    }
    
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

    // If we skipped to a turn, inject that turn's state and capture screenshot
    // Otherwise, start from initial state (turn 0)
    if (skipToTurnState !== null && effectiveSkipTo !== undefined && effectiveSkipTo > 0) {
      // We're resuming from --skip-to
      console.log(`Injecting state for turn ${effectiveSkipTo}...`);
      const injectStart = Date.now();
      try {
        // injectTurnState(turnIndex) injects the state AFTER that turn
        // So to show turn N, we inject state from turn N-1
        await adapter.injectTurnState(page, rawTranscript, effectiveSkipTo - 1, STATE_SETTLED_TIMEOUT);

        const ssPath = path.join(outputDir, `turn-${String(effectiveSkipTo).padStart(3, '0')}.png`);
        await captureScreenshot(page, ssPath);
        const dur = Date.now() - injectStart;

        summary.screenshots.push({
          turn: effectiveSkipTo,
          screenshotPath: path.resolve(ssPath),
          durationMs: dur,
          phase: 'replay',
        });
        summary.turnsReplayed++;
        console.log(`  turn-${String(effectiveSkipTo).padStart(3, '0')}.png [${dur}ms]`);
      } catch (err) {
        const msg = `Inject state error for turn ${effectiveSkipTo}: ${(err as Error).message}`;
        summary.errors.push(msg);
        console.error(`  ${msg}`);
      }
    } else {
      // ── Initial state screenshot (normal replay) ──
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
        summary.turnsReplayed++;
        console.log(`  turn-000.png (initial state) [${initDuration}ms]`);
      } catch (err) {
        const msg = `Initial state error: ${(err as Error).message}`;
        summary.errors.push(msg);
        console.error(`  ${msg}`);
      }
    }

    // Determine range of turns to replay visually
    // If --skip-to was used, we start from that turn
    // If --stop-at is specified, we stop there
    const visualStartTurn = (effectiveSkipTo !== undefined && effectiveSkipTo > 0) ? effectiveSkipTo : 0;
    const visualEndTurn = effectiveStopAt !== undefined
      ? Math.min(effectiveStopAt, turnCount)
      : turnCount;

    // ── Per-turn screenshots ──
    for (let i = visualStartTurn; i < visualEndTurn; i++) {
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
      let interactiveTurnNumber = visualEndTurn + 1; // Continue numbering after replay
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
        for (let i = visualEndTurn; i < turnCount; i++) {
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

    // Generate contact sheet from captured screenshots
    try {
      const contactSheetPath = await generateContactSheet(outputDir);
      if (contactSheetPath) {
        summary.contactSheetPath = contactSheetPath;
        console.log(`\nContact sheet: ${contactSheetPath}`);
      }
    } catch (err) {
      const msg = `Contact sheet generation error: ${(err as Error).message}`;
      summary.errors.push(msg);
      console.warn(msg);
    }

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
