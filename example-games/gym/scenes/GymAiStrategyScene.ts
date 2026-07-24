/**
 * GymAiStrategyScene -- Demonstrates the AI module:
 *   - AiStrategyBase (strategy interface)
 *   - AiPlayer<TStrategy> (generic player wrapper with seeded RNG)
 *   - pickRandom<T>() (uniform random selection)
 *   - pickBest<T>() (scored selection with random tie-breaking)
 *
 * Features:
 *   - 3 numeric strategies: Always Pick Highest, Always Pick Lowest, Random
 *   - AiPlayer wrapping each strategy with a seeded RNG for reproducible picks
 *   - Interactive strategy switching at runtime to compare behaviour
 *   - pickRandom demonstrated on a set of scored options
 *   - pickBest demonstrated with tie-breaking between equal-scored options
 *   - Seeded RNG reproducibility (same seed = same choices)
 *   - Live event log showing every AI decision alongside strategy name
 *   - Seed re-roll button to explore different deterministic outcomes
 *
 * @module example-games/gym/scenes/GymAiStrategyScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_AI_STRATEGY_KEY } from '../GymRegistry';
import { AiPlayer } from '../../../src/ai/AiStrategy';
import type { AiStrategyBase } from '../../../src/ai/AiStrategy';
import { pickRandom, pickBest } from '../../../src/ai/AiUtils';
import { createSeededRng } from '../../../src/core-engine/SeededRng';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

// ── Numeric strategy interface ──────────────────────────────────────────

/**
 * A simple numeric strategy: given an array of numbers and an RNG,
 * pick one number from the array.
 */
interface NumericStrategy extends AiStrategyBase {
  pick(numbers: number[], rng: () => number): number;
}

// ── Strategy implementations ────────────────────────────────────────────

/** Always picks the highest number (ties broken by RNG). */
class HighestStrategy implements NumericStrategy {
  readonly name = 'Always Pick Highest';

  pick(numbers: number[], rng: () => number): number {
    const max = Math.max(...numbers);
    const tied = numbers.filter((n) => n === max);
    return pickRandom(tied, rng);
  }
}

/** Always picks the lowest number (ties broken by RNG). */
class LowestStrategy implements NumericStrategy {
  readonly name = 'Always Pick Lowest';

  pick(numbers: number[], rng: () => number): number {
    const min = Math.min(...numbers);
    const tied = numbers.filter((n) => n === min);
    return pickRandom(tied, rng);
  }
}

/** Picks a uniformly random number from the array. */
class RandomStrategy implements NumericStrategy {
  readonly name = 'Random';

  pick(numbers: number[], rng: () => number): number {
    return pickRandom(numbers, rng);
  }
}

// ── Demo constants ──────────────────────────────────────────────────────

/** Pool of numbers the AI picks from. */
const DEMO_NUMBERS = [3, 7, 1, 9, 4, 9, 2, 6];

/** Scored options for pickBest demo. */
interface ScoredOption {
  label: string;
  score: number;
}

const SCORED_OPTIONS: ScoredOption[] = [
  { label: 'Option A', score: 10 },
  { label: 'Option B', score: 25 },
  { label: 'Option C', score: 15 },
  { label: 'Option D', score: 25 },
  { label: 'Option E', score: 5 },
];

const DEFAULT_SEED = 42;

// ── Scene class ─────────────────────────────────────────────

export class GymAiStrategyScene extends GymSceneBase {
  // Current strategy state
  private currentStrategy: NumericStrategy = new HighestStrategy();
  private aiPlayer!: AiPlayer<NumericStrategy>;
  private seed: number = DEFAULT_SEED;

  // Display elements
  private strategyNameText!: Phaser.GameObjects.Text;
  private strategyPickText!: Phaser.GameObjects.Text;
  private pickRandomText!: Phaser.GameObjects.Text;
  private pickBestText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;

  // Switch strategy buttons for visual state management
  private strategyButtons: Phaser.GameObjects.Text[] = [];

  // Event log
  private eventLogResult!: EventLogResult;

  constructor() {
    super({ key: GYM_AI_STRATEGY_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('AI: Strategy Framework Demo');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the shared AI module (src/ai/) with three key APIs:\n\n' +
          'AiStrategyBase — the base interface for all AI strategies. Extend it with ' +
          'game-specific decision methods.\n\n' +
          'AiPlayer<TStrategy> — a generic player wrapper that binds a strategy to an RNG ' +
          'source, enabling reproducible decisions with seeded randomness.\n\n' +
          'pickRandom<T>() / pickBest<T>() — utility functions for uniform random selection ' +
          'and scored selection with random tie-breaking.',
      },
      {
        heading: 'Controls — Numeric Strategy',
        body: 'Three simple numeric strategies demonstrate the pattern:\n\n' +
          '[ Always Pick Highest ]: Selects the largest number from the pool. ' +
          'If there is a tie, the winner is chosen randomly using the seeded RNG.\n' +
          '[ Always Pick Lowest ]: Selects the smallest number from the pool. ' +
          'Ties are also broken with the seeded RNG.\n' +
          '[ Random ]: Selects a uniformly random number from the pool using the seeded RNG.\n\n' +
          'The "Make a Pick" button invokes the currently selected strategy, showing ' +
          'the result alongside the strategy name and the current RNG state.',
      },
      {
        heading: 'Controls — Seed Management',
        body: '[ Seed: 42 ]: Shows the current RNG seed. Same seed + same strategy = same pick.\n' +
          '[ +1 ] / [ -1 ]: Increase or decrease the seed value.\n' +
          '[ Re-roll Seed ]: Generate a new random seed.\n' +
          '[ Reset Seed to 42 ]: Return to the default seed.\n\n' +
          'The seed affects all random choices: strategy picks (including tie-breaking), ' +
          'pickRandom, and pickBest. Changing the seed produces different outcomes while ' +
          'maintaining full determinism for any given seed.',
      },
      {
        heading: 'Controls — pickRandom & pickBest',
        body: '[ Run pickRandom ]: Selects a uniformly random ScoredOption from the set, ' +
          'displaying the result in the event log.\n\n' +
          '[ Run pickBest ]: Selects the highest-scored ScoredOption. Since Option B and ' +
          'Option D both have score 25, the tie is broken by the seeded RNG. Re-run with ' +
          'different seeds to see the tie-breaking change.\n\n' +
          '[ Run Both ]: Runs both pickRandom and pickBest sequentially.\n' +
          'Changing the seed between runs produces different deterministic outcomes.',
      },
      {
        heading: 'Usage Example',
        body: 'In a real game like Lost Cities, an AI strategy implements: ' +
          'AiStrategyBase { choosePhase1Action(state, rng): Phase1Action; choosePhase2Action(state, rng): Phase2Action; }.\n' +
          'The AiPlayer wraps these strategies and calls them during the game loop. ' +
          'When debugging, developers can set the seed to a known value to reproduce ' +
          'exact AI decisions.\n\n' +
          'Feudalism uses a GreedyStrategy that scores each legal action by its ' +
          'prestige-point contribution and uses pickBest() to select the highest-scoring ' +
          'action, breaking ties randomly.',
      },
    ]);

    // ── Init AiPlayer with default strategy ──────────────

    this.aiPlayer = new AiPlayer(this.currentStrategy, createSeededRng(this.seed));

    const cx = GAME_W / 2;
    const startY = 96;

    // ── Section: Numeric Strategy Demo ───────────────────

    this.addLabel(cx, startY, '── Numeric Strategy Demo ──', {
      fontSize: '14px',
      color: '#669966',
    }).setOrigin(0.5);

    // Strategy name and pick result display
    this.strategyNameText = createHudText(
      this,
      cx,
      startY + 22,
      `Strategy: ${this.currentStrategy.name}`,
      '#88ff88',
      { fontSize: '16px' },
    ).setOrigin(0.5);

    this.strategyPickText = createHudText(
      this,
      cx,
      startY + 44,
      'Last pick: (none)',
      '#aaddaa',
      { fontSize: '14px' },
    ).setOrigin(0.5);

    // Strategy selector buttons
    const strategies: NumericStrategy[] = [
      new HighestStrategy(),
      new LowestStrategy(),
      new RandomStrategy(),
    ];

    let btnX = cx - 280;
    for (const strat of strategies) {
      const isActive = strat.name === this.currentStrategy.name;
      const btn = createHudText(
        this,
        btnX,
        startY + 64,
        `[ ${strat.name} ]`,
        isActive ? '#ffffff' : '#88ff88',
        { fontSize: '13px' },
      ).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        if (btn.getData('active')) return;
        this.setStrategy(strat);
      });

      btn.on('pointerover', () => {
        if (!btn.getData('active')) btn.setColor('#bbffbb');
      });
      btn.on('pointerout', () => {
        if (!btn.getData('active')) btn.setColor('#88ff88');
      });

      btn.setData('active', isActive);
      this.strategyButtons.push(btn);
      btnX += 200;
    }

    // Make a Pick button
    this.addButton(cx - 120, startY + 90, '[ Make a Pick ]', () => {
      this.makePick();
    });

    // ── Section: pickRandom & pickBest ────────────────────

    const utilsY = startY + 130;

    this.addLabel(cx, utilsY, '── pickRandom & pickBest Demo ──', {
      fontSize: '14px',
      color: '#669966',
    }).setOrigin(0.5);

    this.pickRandomText = createHudText(
      this,
      cx - 200,
      utilsY + 22,
      'pickRandom: (not run)',
      '#aaddaa',
      { fontSize: '12px' },
    );

    this.pickBestText = createHudText(
      this,
      cx + 100,
      utilsY + 22,
      'pickBest: (not run)',
      '#aaddaa',
      { fontSize: '12px' },
    );

    // Buttons row
    this.addButton(cx - 320, utilsY + 46, '[ Run pickRandom ]', () => {
      this.runPickRandom();
    });
    this.addButton(cx - 120, utilsY + 46, '[ Run pickBest ]', () => {
      this.runPickBest();
    });
    this.addButton(cx + 80, utilsY + 46, '[ Run Both ]', () => {
      this.runPickRandom();
      this.runPickBest();
    });

    // ── Section: Seed Management ──────────────────────────

    const seedY = utilsY + 86;

    this.addLabel(cx, seedY, '── Seed Management ──', {
      fontSize: '14px',
      color: '#669966',
    }).setOrigin(0.5);

    this.seedText = createHudText(
      this,
      cx,
      seedY + 22,
      `Seed: ${this.seed}`,
      '#ffffff',
      { fontSize: '16px' },
    ).setOrigin(0.5);

    this.addButton(cx - 260, seedY + 46, '[ -1 ]', () => this.adjustSeed(-1), {
      fontSize: '12px',
    });
    this.addButton(cx - 210, seedY + 46, '[ +1 ]', () => this.adjustSeed(1), {
      fontSize: '12px',
    });
    this.addButton(cx - 100, seedY + 46, '[ Re-roll Seed ]', () => {
      this.setSeed(Math.floor(Math.random() * 100000));
    }, { fontSize: '12px' });
    this.addButton(cx + 80, seedY + 46, '[ Reset Seed to 42 ]', () => {
      this.setSeed(DEFAULT_SEED);
    }, { fontSize: '12px' });

    // ── Event log ───────────────────────────────────────────

    const logY = seedY + 88;
    this.eventLogResult = createEventLog(this, logY, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });

    // Log initial state
    this.logEvent(
      `Scene loaded. Default strategy: ${this.currentStrategy.name}, seed: ${this.seed}`,
    );
  }

  // ── Strategy management ─────────────────────────────────

  private setStrategy(strategy: NumericStrategy): void {
    this.currentStrategy = strategy;
    this.aiPlayer = new AiPlayer(strategy, createSeededRng(this.seed));

    // Update button active states
    for (const btn of this.strategyButtons) {
      const btnName = btn.getData('strategyName') as string;
      const isActive = btnName === strategy.name;
      btn.setData('active', isActive);
      btn.setColor(isActive ? '#ffffff' : '#88ff88');
      btn.setStyle({ color: isActive ? '#ffffff' : '#88ff88' });
    }

    this.strategyNameText.setText(`Strategy: ${strategy.name}`);
    this.logEvent(`Switched to strategy: ${strategy.name}`);
  }

  private makePick(): void {
    // Recreate the AiPlayer with the current seed so the RNG is fresh
    this.aiPlayer = new AiPlayer(this.currentStrategy, createSeededRng(this.seed));
    const rng = (this.aiPlayer as any).rng as () => number;

    const pick = this.currentStrategy.pick(DEMO_NUMBERS, rng);
    this.strategyPickText.setText(
      `Last pick: ${pick} (${this.currentStrategy.name})`,
    );

    this.logEvent(
      `[Strategy] ${this.currentStrategy.name} picked: ${pick} from [${DEMO_NUMBERS.join(', ')}]`,
    );
  }

  private adjustSeed(delta: number): void {
    this.setSeed(Math.max(0, this.seed + delta));
  }

  private setSeed(newSeed: number): void {
    this.seed = newSeed;
    this.seedText.setText(`Seed: ${this.seed}`);
    // Recreate AiPlayer with new seed
    this.aiPlayer = new AiPlayer(this.currentStrategy, createSeededRng(this.seed));
    this.logEvent(`Seed changed to ${this.seed}`);
  }

  // ── pickRandom & pickBest demo ──────────────────────────

  private runPickRandom(): void {
    const rng = createSeededRng(this.seed);
    const selected = pickRandom(SCORED_OPTIONS, rng);
    this.pickRandomText.setText(
      `pickRandom: ${selected.label} (score: ${selected.score})`,
    );

    this.logEvent(
      `[pickRandom] Selected: ${selected.label} (score: ${selected.score}) from ${SCORED_OPTIONS.length} options`,
    );
  }

  private runPickBest(): void {
    const rng = createSeededRng(this.seed);
    const selected = pickBest(
      SCORED_OPTIONS,
      (opt) => opt.score,
      rng,
    );

    // Find all tied options for display
    const maxScore = Math.max(...SCORED_OPTIONS.map((o) => o.score));
    const tiedLabels = SCORED_OPTIONS.filter((o) => o.score === maxScore)
      .map((o) => o.label)
      .join(', ');

    this.pickBestText.setText(
      `pickBest: ${selected.label} (score: ${selected.score})`,
    );

    this.logEvent(
      `[pickBest] Best score: ${maxScore}, tied options: [${tiedLabels}], winner: ${selected.label} (via RNG tie-break)`,
    );
  }

  // ── Event log ─────────────────────────────────────────────

  private logEntries: string[] = [];

  private logEvent(message: string): void {
    this.logEntries.push(message);
    if (this.logEntries.length > 50) this.logEntries.shift();

    this.eventLogResult.render(this.logEntries);
  }
}
