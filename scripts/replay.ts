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
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import http from 'node:http';

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
  boardStates: BoardSnapshot[];
  discardTop: CardSnapshot | null;
  stockRemaining: number;
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
  };
  turns: TurnRecord[];
  results: { scores: number[]; winnerIndex: number; winnerName: string } | null;
}

interface TurnSummary {
  turn: number;
  screenshotPath: string;
  durationMs: number;
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

const DEV_SERVER_URL = 'http://localhost:3000';
const VIEWPORT = { width: 900, height: 700 };
const SCENE_READY_TIMEOUT = 30_000;
const STATE_SETTLED_TIMEOUT = 10_000;
const DEV_SERVER_START_TIMEOUT = 30_000;

// ── CLI Arg Parsing ─────────────────────────────────────────

function parseArgs(): { transcriptPath: string; outputDir: string } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run replay -- <transcript.json> [--output <dir>]

Arguments:
  <transcript.json>   Path to the game transcript JSON file
  --output <dir>      Output directory for screenshots (default: data/screenshots/<basename>/)

Examples:
  npm run replay -- data/transcripts/golf/fixture-game.json
  npm run replay -- data/transcripts/golf/fixture-game.json --output data/screenshots/golf/test/
`);
    process.exit(0);
  }

  let transcriptPath = '';
  let outputDir = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputDir = args[++i] || '';
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

  return { transcriptPath, outputDir };
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

  if (transcript.version !== 1) {
    console.error(
      `Unsupported transcript version: ${transcript.version}. Expected: 1`,
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

// ── Dev Server Management ───────────────────────────────────

/** Check if a URL is reachable with an HTTP GET. */
function isServerReady(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume(); // consume response body
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Start the dev server if not already running. Returns the child process (or null). */
async function ensureDevServer(): Promise<ChildProcess | null> {
  const ready = await isServerReady(DEV_SERVER_URL);
  if (ready) {
    console.log('Dev server already running at', DEV_SERVER_URL);
    return null;
  }

  console.log('Starting dev server (npm run dev)...');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  // Wait for the server to become ready
  const start = Date.now();
  while (Date.now() - start < DEV_SERVER_START_TIMEOUT) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const ok = await isServerReady(DEV_SERVER_URL);
    if (ok) {
      console.log('Dev server is ready.');
      return child;
    }
  }

  // Timeout -- kill and exit
  child.kill('SIGTERM');
  console.error(
    `Error: Dev server did not become ready within ${DEV_SERVER_START_TIMEOUT / 1000}s`,
  );
  process.exit(1);
}

/** Kill the dev server process if we started it. */
function killDevServer(child: ChildProcess | null): void {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    console.log('Dev server stopped.');
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
): Promise<void> {
  const bsJson = JSON.stringify(boardStates);
  const dtJson = JSON.stringify(discardTop);
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
      scene.loadBoardState(${bsJson}, ${dtJson}, ${stockRemaining});
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
  const { transcriptPath, outputDir } = parseArgs();
  const transcript = loadTranscript(transcriptPath);

  console.log(`Transcript: ${transcriptPath}`);
  console.log(`  Version: ${transcript.version}`);
  console.log(`  Turns: ${transcript.turns.length}`);
  console.log(`  Players: ${transcript.metadata.players.map((p) => p.name).join(', ')}`);
  console.log(`  Output: ${outputDir}`);

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
    // Launch headless Chromium
    browser = await chromium.launch({ headless: true });
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
      });
      console.log(`  turn-000.png (initial state) [${initDuration}ms]`);
    } catch (err) {
      const msg = `Initial state error: ${(err as Error).message}`;
      summary.errors.push(msg);
      console.error(`  ${msg}`);
    }

    // ── Per-turn screenshots ──
    for (let i = 0; i < transcript.turns.length; i++) {
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
        );
        await page.waitForTimeout(100);

        const ssPath = path.join(outputDir, `turn-${turnLabel}.png`);
        await captureScreenshot(page, ssPath);
        const turnDuration = Date.now() - turnStart;

        summary.screenshots.push({
          turn: i + 1,
          screenshotPath: path.resolve(ssPath),
          durationMs: turnDuration,
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
          error: msg,
        });
        console.error(`  ${msg}`);
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
    console.log(`Total: ${summary.turnsReplayed} turns, ${summary.totalDurationMs}ms`);

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
