#!/usr/bin/env node
/**
 * Replay Tool -- replays a JSON game transcript, captures per-turn
 * screenshots via headless Playwright, and produces a JSON summary report.
 *
 * Usage:
 *   npm run replay -- <transcript.json> [--output <dir>]
 *
 * The tool:
 *   1. Parses CLI args (transcript path, --output dir)
 *   2. Validates the transcript file (exists, valid JSON, version 1)
 *   3. Ensures a dev server is running at localhost:3000 (auto-starts if needed)
 *   4. Boots headless Chromium via Playwright at ?mode=replay
 *   5. Waits for GolfScene to emit state-settled (scene ready)
 *   6. Loads initial state + each turn via loadBoardState(), capturing screenshots
 *   7. Writes a replay-summary.json report
 *
 * See CG-0MLTFTD0B0B3EL3W for full requirements.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { DEV_SERVER_URL, ensureDevServer, killDevServer } from './dev-server-utils';

// ── Types ───────────────────────────────────────────────────

import type { CardSnapshot } from '../src/core-engine/TranscriptTypes';

/** Minimal transcript types matching GameTranscript.ts schema. */

interface BoardSnapshot {
  grid: CardSnapshot[];
  faceUpCount: number;
  visibleScore: number;
  totalScore: number;
}

interface TurnRecord {
  turnNumber: number;
  playerIndex: number;
  playerName: string;
  drawSource: 'stock' | 'discard';
  move: { kind: 'swap' | 'discard-and-flip'; row: number; col: number };
  boardStates: BoardSnapshot[];
  discardTop: CardSnapshot | null;
  stockRemaining: number;
  stockPileCards?: CardSnapshot[];
  roundEnded: boolean;
}

interface GameTranscript {
  version: number;
  metadata: {
    startedAt: string;
    endedAt: string;
    players: Array<{ name: string; isAI: boolean; strategy?: string }>;
  };
  initialState: {
    boardStates: BoardSnapshot[];
    discardTop: CardSnapshot | null;
    stockRemaining: number;
    stockPileCards?: CardSnapshot[];
  };
  turns: TurnRecord[];
  results: { scores: number[]; winnerIndex: number; winnerName: string } | null;
}

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

function parseArgs(): { transcriptPath: string; outputDir: string; stopAt: number | undefined } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run replay -- <transcript.json> [--output <dir>] [--stop-at <turn>]

Arguments:
  <transcript.json>   Path to the game transcript JSON file
  --output <dir>      Output directory for screenshots (default: data/screenshots/<basename>/)
  --stop-at <turn>    Pause replay at the specified turn (0-based) and launch a headed
                      browser for interactive debugging. Turn 0 = initial state.

Examples:
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --output data/screenshots/golf/test/
  npm run replay -- tests/fixtures/transcripts/golf/fixture-game.json --stop-at 5
`);
    process.exit(0);
  }

  let transcriptPath = '';
  let outputDir = '';
  let stopAt: number | undefined;

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

  return { transcriptPath, outputDir, stopAt };
}

// ── Transcript Validation ───────────────────────────────────

function loadTranscript(filePath: string): GameTranscript {
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

  let transcript: GameTranscript;
  try {
    transcript = JSON.parse(rawContent) as GameTranscript;
  } catch {
    console.error('Error: Transcript file contains invalid JSON.');
    process.exit(1);
  }

  if (transcript.version !== 1 && transcript.version !== 2) {
    console.error(
      `Unsupported transcript version: ${transcript.version}. Expected: 1 or 2`,
    );
    process.exit(1);
  }

  if (!Array.isArray(transcript.turns)) {
    console.error('Error: Transcript has no turns array.');
    process.exit(1);
  }

  if (!transcript.initialState) {
    console.error('Error: Transcript has no initialState.');
    process.exit(1);
  }

  return transcript;
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
 * Start GolfScene from the unified entry point. The entry point boots
 * GameSelectorScene by default; we need to programmatically transition
 * to GolfScene in replay mode.
 */
async function startGolfScene(page: Page): Promise<void> {
  await page.evaluate(`
    (() => {
      const game = window.__PHASER_GAME__;
      game.scene.start('GolfScene');
    })()
  `);
}

/**
 * Wait for the GolfScene to become active (loaded assets and running).
 */
async function waitForSceneReady(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    `(() => {
      const game = window.__PHASER_GAME__;
      if (!game) return false;
      const scene = game.scene.getScene('GolfScene');
      return scene && scene.sys.isActive();
    })()`,
    { timeout: timeoutMs },
  );
}

/**
 * Inject a board state into GolfScene via loadBoardState() and wait
 * for the state-settled event to fire.
 *
 * Registers the state-settled listener BEFORE calling loadBoardState()
 * to avoid missing the synchronous event emission. Both operations
 * happen in a single page.evaluate call.
 *
 * Uses string expressions to avoid esbuild transformation issues.
 */
async function injectBoardStateAndWait(
  page: Page,
  boardStates: BoardSnapshot[],
  discardTop: CardSnapshot | null,
  stockRemaining: number,
  timeoutMs: number,
  stockPileCards?: CardSnapshot[],
): Promise<void> {
  const bsJson = JSON.stringify(boardStates);
  const dtJson = JSON.stringify(discardTop);
  const spcJson = stockPileCards ? JSON.stringify(stockPileCards) : 'undefined';
  await page.evaluate(`
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for state-settled after loadBoardState')),
        ${timeoutMs},
      );
      const emitter = window.__GAME_EVENTS__;
      if (!emitter) {
        clearTimeout(timer);
        reject(new Error('__GAME_EVENTS__ not found on window'));
        return;
      }
      // Register a one-time listener BEFORE calling loadBoardState so
      // we don't miss the synchronous state-settled emission.
      emitter.once('state-settled', () => {
        clearTimeout(timer);
        resolve();
      });
      const game = window.__PHASER_GAME__;
      const scene = game.scene.getScene('GolfScene');
      if (!scene) {
        clearTimeout(timer);
        reject(new Error('GolfScene not found'));
        return;
      }
      scene.loadBoardState(${bsJson}, ${dtJson}, ${stockRemaining}, ${spcJson});
    })
  `);
}

/**
 * Capture a screenshot of the Phaser canvas.
 */
async function captureScreenshot(
  page: Page,
  filePath: string,
): Promise<void> {
  const canvas = page.locator('canvas').first();
  await canvas.screenshot({ path: filePath });
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { transcriptPath, outputDir, stopAt } = parseArgs();
  const transcript = loadTranscript(transcriptPath);

  // Reject v1 transcripts when --stop-at is used (no stock pile data for interactive play)
  if (stopAt !== undefined && transcript.version < 2) {
    console.error(
      'Error: --stop-at requires a v2 transcript with stock pile data. Re-record the game to generate a v2 transcript.',
    );
    process.exit(1);
  }

  console.log(`Transcript: ${transcriptPath}`);
  console.log(`  Version: ${transcript.version}`);
  console.log(`  Turns: ${transcript.turns.length}`);
  console.log(`  Players: ${transcript.metadata.players.map((p) => p.name).join(', ')}`);
  console.log(`  Output: ${outputDir}`);

  // Validate --stop-at against total turns (warning if exceeds)
  let effectiveStopAt: number | undefined = stopAt;
  if (stopAt !== undefined && stopAt > transcript.turns.length) {
    console.log(`Warning: --stop-at ${stopAt} exceeds total turns (${transcript.turns.length}). Replayed all turns.`);
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
    const gameUrl = `${DEV_SERVER_URL}?mode=replay`;
    console.log(`Navigating to ${gameUrl}`);
    await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });

    // Wait for Phaser to boot (GameSelectorScene starts first)
    console.log('Waiting for Phaser game to boot...');
    await waitForGameBoot(page, SCENE_READY_TIMEOUT);

    // Programmatically start GolfScene (the unified entry boots
    // GameSelectorScene by default; we transition to GolfScene).
    console.log('Starting GolfScene in replay mode...');
    await startGolfScene(page);

    // Wait for GolfScene to finish loading assets and become active
    console.log('Waiting for GolfScene to become active...');
    await waitForSceneReady(page, SCENE_READY_TIMEOUT);
    console.log('GolfScene is active.');

    // ── Initial state screenshot ──
    console.log('Loading initial state...');
    const initStart = Date.now();
    try {
      await injectBoardStateAndWait(
        page,
        transcript.initialState.boardStates,
        transcript.initialState.discardTop,
        transcript.initialState.stockRemaining,
        STATE_SETTLED_TIMEOUT,
        transcript.initialState.stockPileCards,
      );
      // Allow a frame for rendering to complete
      await page.waitForTimeout(100);

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
      ? Math.min(effectiveStopAt, transcript.turns.length)
      : transcript.turns.length;

    // ── Per-turn screenshots ──
    for (let i = 0; i < turnsToReplay; i++) {
      const turn = transcript.turns[i];
      const turnLabel = String(i + 1).padStart(3, '0');
      const turnStart = Date.now();

      try {
        await injectBoardStateAndWait(
          page,
          turn.boardStates,
          turn.discardTop,
          turn.stockRemaining,
          STATE_SETTLED_TIMEOUT,
          turn.stockPileCards,
        );
        await page.waitForTimeout(100);

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

        const playerLabel = `${turn.playerName} (P${turn.playerIndex})`;
        console.log(`  turn-${turnLabel}.png [${playerLabel}] [${turnDuration}ms]`);
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
      // Determine the last action description for the overlay
      let lastAction = 'N/A (initial state)';
      if (effectiveStopAt > 0 && effectiveStopAt <= transcript.turns.length) {
        const lastTurn = transcript.turns[effectiveStopAt - 1];
        const playerName = lastTurn.playerName;
        const move = lastTurn.move;
        if (move.kind === 'swap') {
          lastAction = `${playerName} drew from ${lastTurn.drawSource}, swapped at row ${move.row} col ${move.col}`;
        } else {
          lastAction = `${playerName} drew from ${lastTurn.drawSource}, discarded & flipped at row ${move.row} col ${move.col}`;
        }
      }

      // If --stop-at is beyond the replayed turns (but within bounds),
      // inject the stop-at turn's board state
      if (effectiveStopAt > 0 && effectiveStopAt <= transcript.turns.length) {
        const targetTurn = transcript.turns[effectiveStopAt - 1];
        await injectBoardStateAndWait(
          page,
          targetTurn.boardStates,
          targetTurn.discardTop,
          targetTurn.stockRemaining,
          STATE_SETTLED_TIMEOUT,
          targetTurn.stockPileCards,
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

      // Show the takeover overlay in the browser
      await page.evaluate(`
        (() => {
          const game = window.__PHASER_GAME__;
          const scene = game.scene.getScene('GolfScene');
          if (scene && scene.showTakeoverOverlay) {
            scene.showTakeoverOverlay({
              turnNumber: ${effectiveStopAt},
              lastAction: ${JSON.stringify(lastAction)},
            });
          }
        })()
      `);

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

        // Continue replaying remaining turns
        for (let i = turnsToReplay; i < transcript.turns.length; i++) {
          const turn = transcript.turns[i];
          const turnLabel = String(i + 1).padStart(3, '0');
          const turnStart = Date.now();

          try {
            await injectBoardStateAndWait(
              page,
              turn.boardStates,
              turn.discardTop,
              turn.stockRemaining,
              STATE_SETTLED_TIMEOUT,
              turn.stockPileCards,
            );
            await page.waitForTimeout(100);

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

            const playerLabel = `${turn.playerName} (P${turn.playerIndex})`;
            console.log(`  turn-${turnLabel}.png [${playerLabel}] [${turnDuration}ms]`);
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
