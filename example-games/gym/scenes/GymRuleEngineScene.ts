/**
 * GymRuleEngineScene -- Demonstrates the Rule Engine module:
 *   - LegalityResult (legalAction / illegalAction discriminated union)
 *   - EconomyLedger (resource tracking with constraint enforcement)
 *
 * Features:
 *   - Interactive buttons to simulate legal/illegal actions
 *   - Multiple reasons for illegality (not your turn, insufficient
 *     funds, out of bounds, wrong phase)
 *   - EconomyLedger with add/subtract operations and constraint
 *     enforcement (min limits)
 *   - Live event log showing every action and result
 *   - Resource display panel with current values
 *
 * @module example-games/gym/scenes/GymRuleEngineScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_RULE_ENGINE_KEY } from '../GymRegistry';
import {
  createEconomyLedger,
  type EconomyLedger,
  type ResourceDelta,
} from '../../../src/rule-engine/index';
import { GAME_W } from '../../../src/ui/constants';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import gymRuleEngineLayoutJson from '../layouts/gym-rule-engine.layout.json';

// Parse the scene layout once at module load.
const RULE_ENGINE_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null =
  (() => {
    const parsed = parseScreenLayoutDocument(gymRuleEngineLayoutJson);
    return parsed.valid ? parsed.layout : null;
  })();

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

function resolveAnchor(
  zone: string,
  anchor: string,
  viewport = DEFAULT_VIEWPORT,
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!RULE_ENGINE_LAYOUT) {
    return { x: GAME_W / 2, y: 60 };
  }
  return anchorPoint(RULE_ENGINE_LAYOUT, zone, anchor, viewport, 1);
}

// ── Demo logic wrappers ─────────────────────────────────────

/** A recorded entry for the event log. */
interface LogEntry {
  timestamp: string;
  message: string;
}

/**
 * Generate a formatted display string for a LegalityResult.
 */
function formatLegalityResult(
  actionName: string,
  legal: boolean,
  reason?: string,
): string {
  if (legal) {
    return `[${actionName}] legal: true ✓`;
  }
  return `[${actionName}] legal: false — ${reason}`;
}

/**
 * Generate a formatted display string for a resource operation result.
 */
function formatResourceOperation(
  delta: ResourceDelta,
  success: boolean,
  constraintMessage?: string,
): string {
  const parts: string[] = [];
  if (delta.coins !== undefined) {
    parts.push(`coins ${delta.coins >= 0 ? '+' : ''}${delta.coins}`);
  }
  if (delta.reputation !== undefined) {
    parts.push(
      `reputation ${delta.reputation >= 0 ? '+' : ''}${delta.reputation}`,
    );
  }
  if (delta.score !== undefined) {
    parts.push(`score ${delta.score >= 0 ? '+' : ''}${delta.score}`);
  }
  const deltaStr = parts.join(', ');
  if (!success) {
    return `BLOCKED: ${deltaStr} — ${constraintMessage}`;
  }
  return `Applied: ${deltaStr}`;
}

// ── Scene class ─────────────────────────────────────────────

export class GymRuleEngineScene extends GymSceneBase {
  private eventLog: LogEntry[] = [];
  private eventLogResult!: EventLogResult;

  // LegalityResult display
  private legalityResultText!: Phaser.GameObjects.Text;

  // EconomyLedger
  private ledger!: EconomyLedger;
  private resourceDisplayText!: Phaser.GameObjects.Text;
  private constraintViolationText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: GYM_RULE_ENGINE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Rule Engine: LegalityResult + EconomyLedger');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the Rule Engine module with two core APIs:\n\n' +
          'LegalityResult — a discriminated union type ({ legal: true } | { legal: false, reason: string }) ' +
          'used by every game in TCE for move validation. Buttons simulate various legal/illegal actions ' +
          'and display the result object live.\n\n' +
          'EconomyLedger — a generic resource tracker supporting coins, reputation, and score with ' +
          'optional min/max constraints. Buttons add/subtract resources and enforce limits.',
      },
      {
        heading: 'Controls — LegalityResult',
        body: '[ Legal: move card ]: Simulates a valid action — returns { legal: true }.\n' +
          '[ Illegal: not your turn ]: Returns { legal: false, reason: "Not your turn" }.\n' +
          '[ Illegal: insufficient funds ]: Returns { legal: false, reason: "...need 50, have 20" }.\n' +
          '[ Illegal: out of bounds ]: Returns { legal: false, reason: "Card position out of bounds" }.\n' +
          '[ Illegal: wrong phase ]: Returns { legal: false, reason: "Cannot act during opponent turn" }.\n' +
          'The result is displayed both in the result area above the buttons and in the event log.',
      },
      {
        heading: 'Controls — EconomyLedger',
        body: 'The ledger starts at Coins: 10, Reputation: 5, Score: 25, with minCoins=0 and minReputation=0.\n\n' +
          '[ +5 Coins ]: Add 5 coins.\n' +
          '[ -3 Coins ]: Subtract 3 coins (stays within limit).\n' +
          '[ +2 Reputation ]: Add 2 reputation.\n' +
          '[ -1 Reputation ]: Subtract 1 reputation.\n' +
          '[ -25 Coins (violation) ]: Try to subtract 25 coins — blocked by minCoins=0.\n' +
          '[ -10 Reputation (violation) ]: Try to subtract 10 reputation — blocked by minReputation=0.\n' +
          '[ Set Score 100 ]: Set score to 100.\n' +
          '[ Reset Ledger ]: Reset all resources to initial values.\n\n' +
          'The resource panel updates live, and constraint violations appear in the event log.',
      },
      {
        heading: 'Usage Example',
        body: 'In a real card game, LegalityResult validates every player action. For example, ' +
          'when a player tries to play a card they don\'t have the resources for, the engine returns ' +
          '{ legal: false, reason: "Insufficient funds (need 5, have 2)" }. EconomyLedger tracks ' +
          'player resources and enforces upper/lower bounds, preventing debt when minCoins is set.\n\n' +
          'This scene lets you explore both APIs interactively to understand their behavior before ' +
          'using them in a game implementation.',
      },
      {
        heading: 'How Rules Are Defined in TCE',
        body: 'The shared rule engine (`src/rule-engine/`) provides only building blocks — ' +
          'each game defines its own rules as standalone functions in a `GameRules.ts` file.\n\n' +
          'Architecture:\n' +
          '  1. Move/action types — discriminated unions of possible actions\n' +
          '     (e.g. SwapMove | DiscardAndFlipMove in Golf, Phase1Action | Phase2Action in Lost Cities).\n' +
          '  2. `checkXxxLegality(state, ...args): LegalityResult` — pure validation functions\n' +
          '     that return `{ legal: true }` or `{ legal: false, reason: "..." }`.\n' +
          '  3. `applyXxx(state, ...args): void` — state mutation, usually calling the check first.\n' +
          '  4. Round-end / win-loss detection — separate functions or a state machine.\n\n' +
          'Real examples:\n' +
          '  - Golf (`example-games/golf/GolfRules.ts`): defines a 3x3 grid with swap/discard-and-flip\n' +
          '    moves, checks grid bounds and face-down status, manages end-of-round triggering with\n' +
          '    final-turns tracking.\n' +
          '  - Lost Cities (`example-games/lost-cities/LostCitiesRules.ts`): two-phase turn system\n' +
          '    (PlayOrDiscard then Draw), ascending-play rule for expeditions, round ends when draw\n' +
          '    pile empties. Also generates all legal actions for AI consumption.\n' +
          '  - Beleaguered Castle (`example-games/beleaguered-castle/BeleagueredCastleRules.ts`):\n' +
          '    tableau-to-foundation and tableau-to-tableau move validation with SpatialRules\n' +
          '    integration for grid-based pathfinding.\n\n' +
          'Each rules file is self-contained, testable, and has zero coupling to the Phaser\n' +
          'scene layer — they are pure functions that operate on game state objects and return\n' +
          'LegalityResult values. AI strategies and undo/redo both rely on the same check\n' +
          'functions for validation.',
      },
    ]);

    const cx = GAME_W / 2;

    // ── LegalityResult section ──────────────────────────────

    const legalityAnchor = resolveAnchor('legality', 'center');
    const yLegality = legalityAnchor.y;

    this.addLabel(cx, yLegality - 18, '── LegalityResult Demo ──', {
      fontSize: '14px',
      color: '#669966',
    }).setOrigin(0.5);

    // Buttons row 1
    this.addButton(cx - 380, yLegality + 10, '[ Legal: move card ]', () =>
      this.simulateLegalityAction('move card', true),
    );
    this.addButton(cx - 180, yLegality + 10, '[ Illegal: not your turn ]', () =>
      this.simulateLegalityAction('not your turn', false, 'Not your turn'),
    );
    this.addButton(cx + 20, yLegality + 10, '[ Illegal: insufficient funds ]', () =>
      this.simulateLegalityAction(
        'insufficient funds',
        false,
        'Insufficient funds (need 50, have 20)',
      ),
    );
    this.addButton(cx + 280, yLegality + 10, '[ Illegal: out of bounds ]', () =>
      this.simulateLegalityAction(
        'out of bounds',
        false,
        'Card position out of bounds',
      ),
    );

    // Buttons row 2
    this.addButton(cx - 160, yLegality + 34, '[ Illegal: wrong phase ]', () =>
      this.simulateLegalityAction(
        'wrong phase',
        false,
        'Cannot act during opponent turn',
      ),
    );

    // Legality result display
    this.legalityResultText = createHudText(
      this,
      cx,
      yLegality + 60,
      'Last result: (none)',
      '#88ff88',
      { fontSize: '12px' },
    ).setOrigin(0.5);

    // ── EconomyLedger section ───────────────────────────────

    this.ledger = createEconomyLedger({
      coins: 10,
      reputation: 5,
      score: 25,
      constraints: { minCoins: 0, minReputation: 0 },
    });

    const economyAnchor = resolveAnchor('economy', 'center');
    const yEconomy = economyAnchor.y;

    this.addLabel(cx, yEconomy - 18, '── EconomyLedger Demo ──', {
      fontSize: '14px',
      color: '#669966',
    }).setOrigin(0.5);

    // Resource display panel
    this.resourceDisplayText = createHudText(
      this,
      cx,
      yEconomy + 2,
      this.formatResourceDisplay(),
      '#ffffff',
      { fontSize: '18px' },
    ).setOrigin(0.5);

    // Buttons row 1
    this.addButton(cx - 420, yEconomy + 28, '[ +5 Coins ]', () =>
      this.applyResourceDelta({ coins: 5 }),
    );
    this.addButton(cx - 310, yEconomy + 28, '[ -3 Coins ]', () =>
      this.applyResourceDelta({ coins: -3 }),
    );
    this.addButton(cx - 200, yEconomy + 28, '[ +2 Reputation ]', () =>
      this.applyResourceDelta({ reputation: 2 }),
    );
    this.addButton(cx - 80, yEconomy + 28, '[ -1 Reputation ]', () =>
      this.applyResourceDelta({ reputation: -1 }),
    );

    // Buttons row 2 (violations and set/reset)
    this.addButton(cx - 370, yEconomy + 52, '[ -25 Coins (violation) ]', () =>
      this.applyResourceDelta({ coins: -25 }),
    );
    this.addButton(cx - 150, yEconomy + 52, '[ -10 Reputation (violation) ]', () =>
      this.applyResourceDelta({ reputation: -10 }),
    );
    this.addButton(cx + 40, yEconomy + 52, '[ Set Score 100 ]', () => {
      this.ledger.setScore(100);
      this.updateResourceDisplay();
      this.logEvent('Set score to 100');
    });
    this.addButton(cx + 200, yEconomy + 52, '[ Reset Ledger ]', () => {
      this.ledger = createEconomyLedger({
        coins: 10,
        reputation: 5,
        score: 25,
        constraints: { minCoins: 0, minReputation: 0 },
      });
      this.updateResourceDisplay();
      this.logEvent('Ledger reset to initial values');
    });

    // Constraint violation text
    this.constraintViolationText = createHudText(
      this,
      cx,
      yEconomy + 78,
      '',
      '#ff8888',
      { fontSize: '11px' },
    ).setOrigin(0.5);

    // ── Event log ───────────────────────────────────────────

    const logAnchor = resolveAnchor('log', 'center');
    this.eventLogResult = createEventLog(this, logAnchor.y + 20, {
      headerText: '── Event Log ──',
      maxLines: 14,
      lineHeight: 16,
      textColor: '#aaddaa',
      fontSize: '11px',
      headerFontSize: '12px',
      headerColor: '#669966',
      lineX: 40,
    });
  }

  // ── LegalityResult demo helpers ───────────────────────────

  private simulateLegalityAction(
    actionName: string,
    legal: boolean,
    reason?: string,
  ): void {
    const display = formatLegalityResult(actionName, legal, reason);

    this.legalityResultText.setText(display);
    if (legal) {
      this.legalityResultText.setColor('#88ff88');
    } else {
      this.legalityResultText.setColor('#ff8888');
    }

    this.logEvent(display);
  }

  // ── EconomyLedger demo helpers ────────────────────────────

  private applyResourceDelta(
    delta: ResourceDelta,
  ): void {
    // Check if the delta is allowed under constraints
    if (!this.ledger.canApply(delta)) {
      let reason = '';
      if (delta.coins !== undefined && delta.coins < 0) {
        reason = `Cannot subtract ${Math.abs(delta.coins)} coins (min ${this.ledger.get('coins') - delta.coins > 0 ? 0 : 'cannot go below min'})`;
      }
      if (delta.reputation !== undefined && delta.reputation < 0) {
        reason = `Cannot subtract ${Math.abs(delta.reputation)} reputation (min 0)`;
      }
      const display = formatResourceOperation(delta, false, reason);
      this.logEvent(display);
      this.constraintViolationText.setText(`⚠ Constraint violation: ${reason}`);
      return;
    }

    // Apply the delta
    this.ledger.apply(delta);
    this.updateResourceDisplay();
    this.constraintViolationText.setText('');

    const display = formatResourceOperation(delta, true);
    this.logEvent(display);
  }

  private updateResourceDisplay(): void {
    this.resourceDisplayText.setText(this.formatResourceDisplay());
  }

  private formatResourceDisplay(): string {
    const s = this.ledger.snapshot();
    return `Coins: ${s.coins}  |  Reputation: ${s.reputation}  |  Score: ${s.score}`;
  }

  // ── Event log ─────────────────────────────────────────────

  private logEvent(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.eventLog.push({ timestamp, message });
    if (this.eventLog.length > 50) this.eventLog.shift();

    // Render only the messages (timestamps are for log structure, not display)
    this.eventLogResult.render(
      this.eventLog.map((e) => e.message),
    );
  }
}
