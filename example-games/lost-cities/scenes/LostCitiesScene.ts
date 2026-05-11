/**
 * LostCitiesScene — Full interactive Phaser scene for Lost Cities.
 *
 * Layout (1280x720, 3-column):
 *   Left column (~600px):
 *     - Opponent expeditions (5 lanes, top)
 *     - Discard piles (5, center row)
 *     - Player expeditions (5 lanes, bottom)
 *
 *   Middle column (~200px):
 *     - Opponent score (top)
 *     - Draw pile + round indicator (center)
 *     - Player score (bottom, mirroring opponent score)
 *
 *   Right column (~300px):
 *     - Player hand (8 cards, vertical fan, large cards)
 *     - Uses nearly the full vertical height
 *
 * Two-phase turn state machine:
 *   Phase 1 — select a card from hand, then click expedition lane or discard pile
 *   Phase 2 — click draw pile or discard pile to draw
 *   AI plays automatically with configurable delay
 */
import { EXPEDITION_COLORS, CARD_BACK_KEY } from '../LostCitiesCards';
import { setupLostCitiesGame } from '../LostCitiesGame';
import {
  LostCitiesAiPlayer,
  GreedyStrategy,
} from '../AiStrategy';
import { LCTranscriptRecorder } from '../GameTranscript';
import type { EventSoundMapping } from '../../../src/core-engine/SoundManager';
import {
  CardGameScene,
  createSceneHeader,
} from '../../../src/ui';
import type { HelpSection } from '../../../src/ui';
import helpContent from '../help-content.json';

import {
  SFX_KEYS,
  CARD_W,
  CARD_H,
  DISCARD_CARD_W,
  DISCARD_CARD_H,
  laneX,
  PLR_EXP_TOP,
  DISCARD_Y,
  type SceneTurnPhase,
} from './LostCitiesConstants';
import { LostCitiesRenderer } from './LostCitiesRenderer';
import { LostCitiesAnimator } from './LostCitiesAnimator';
import { LostCitiesOverlayManager } from './LostCitiesOverlayManager';
import { LostCitiesTooltipManager } from './LostCitiesTooltipManager';
import { LostCitiesReplayController } from './LostCitiesReplayController';
import { LostCitiesTurnController } from './LostCitiesTurnController';

// ═══════════════════════════════════════════════════════════
export class LostCitiesScene extends CardGameScene {
  // Game state
  private session!: import('../LostCitiesGame').LostCitiesSession;
  private aiPlayer!: LostCitiesAiPlayer;
  private recorder!: LCTranscriptRecorder;

  // Helpers
  private lcRenderer!: LostCitiesRenderer;
  private animator!: LostCitiesAnimator;
  private overlayManager!: LostCitiesOverlayManager;
  private tooltipManager!: LostCitiesTooltipManager;
  private replayController!: LostCitiesReplayController;
  private turnController!: LostCitiesTurnController;

  constructor() {
    super({ key: 'LostCitiesScene' });
  }

  // ── Preload ─────────────────────────────────────────────
  preload(): void {
    // Card dimension constants imported from LostCitiesConstants
    // (don't use `require` in browser bundles) 

    for (const color of EXPEDITION_COLORS) {
      for (let inv = 1; inv <= 3; inv++) {
        const key = `lc-${color}-inv${inv}`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
      for (let rank = 2; rank <= 10; rank++) {
        const key = `lc-${color}-${rank}`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: CARD_W,
          height: CARD_H,
        });
      }
    }
    this.load.svg(CARD_BACK_KEY, `assets/cards/lost-cities/${CARD_BACK_KEY}.svg`, {
      width: CARD_W,
      height: CARD_H,
    });

    // Compact card variants for discard piles
    for (const color of EXPEDITION_COLORS) {
      for (let inv = 1; inv <= 3; inv++) {
        const key = `lc-${color}-inv${inv}-sm`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: DISCARD_CARD_W,
          height: DISCARD_CARD_H,
        });
      }
      for (let rank = 2; rank <= 10; rank++) {
        const key = `lc-${color}-${rank}-sm`;
        this.load.svg(key, `assets/cards/lost-cities/${key}.svg`, {
          width: DISCARD_CARD_W,
          height: DISCARD_CARD_H,
        });
      }
    }

    // Audio
    this.load.audio(SFX_KEYS.CARD_SELECT, 'assets/audio/lost-cities/card-select.wav');
    this.load.audio(SFX_KEYS.CARD_DESELECT, 'assets/audio/lost-cities/card-deselect.wav');
    this.load.audio(SFX_KEYS.CARD_PLAY, 'assets/audio/lost-cities/card-play.wav');
    this.load.audio(SFX_KEYS.CARD_DISCARD, 'assets/audio/lost-cities/card-discard.wav');
    this.load.audio(SFX_KEYS.CARD_DRAW, 'assets/audio/lost-cities/card-draw.wav');
    this.load.audio(SFX_KEYS.ILLEGAL_MOVE, 'assets/audio/lost-cities/illegal-move.wav');
    this.load.audio(SFX_KEYS.TURN_CHANGE, 'assets/audio/lost-cities/turn-change.wav');
    this.load.audio(SFX_KEYS.ROUND_END, 'assets/audio/lost-cities/round-end.wav');
    this.load.audio(SFX_KEYS.MATCH_WIN, 'assets/audio/lost-cities/match-win.wav');
    this.load.audio(SFX_KEYS.MATCH_LOSE, 'assets/audio/lost-cities/match-lose.wav');
    this.load.audio(SFX_KEYS.SCORE_REVEAL, 'assets/audio/lost-cities/score-reveal.wav');
    this.load.audio(SFX_KEYS.UI_CLICK, 'assets/audio/lost-cities/ui-click.wav');
  }

  // ── Create ──────────────────────────────────────────────
  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');

    this.detectReplayMode();
    this.initEventSystem();

    this.session = setupLostCitiesGame({
      playerNames: ['You', 'AI'],
      isAI: [false, true],
    });
    this.aiPlayer = new LostCitiesAiPlayer(GreedyStrategy);
    this.recorder = new LCTranscriptRecorder(this.session, [undefined, 'Greedy']);

    // Create helpers
    this.lcRenderer = new LostCitiesRenderer(this, this.session);
    this.animator = new LostCitiesAnimator(this, this.session, this.lcRenderer);
    this.overlayManager = new LostCitiesOverlayManager(this, this.session, this.recorder);
    this.tooltipManager = new LostCitiesTooltipManager(this, this.session);
    this.replayController = new LostCitiesReplayController(this.session);

    this.turnController = new LostCitiesTurnController(
      this.session,
      this.aiPlayer,
      this.recorder,
      this.lcRenderer,
      this.animator,
      {
        onPhaseChange: (phase) => this.setPhase(phase),
        onRefreshAll: () => this.lcRenderer.refreshAll((idx) => this.turnController.onHandCardClick(idx)),
        onShowRoundSummary: (score) => this.overlayManager.showRoundSummary(score),
        onShowMatchSummary: (score) => this.overlayManager.showMatchSummary(score),
        onRunAiTurn: () => this.turnController.runAiTurn(),
        onIllegalMove: (sprite) => this.animator.showIllegalMoveFlash(sprite, this.soundManager),
        onPlaySound: (key) => this.soundManager?.play(key),
      },
    );

    this.overlayManager.setCallbacks(
      () => {
        this.lcRenderer.refreshAll((idx) => this.turnController.onHandCardClick(idx));
        this.turnController.checkNextTurn();
      },
      () => this.scene.restart(),
    );

    createSceneHeader(this, 'Lost Cities');
    this.lcRenderer.createGraphics();
    this.lcRenderer.createSectionBoxes(
      (color, anchor, position) => this.tooltipManager.showExpeditionTooltip(color, anchor, position),
      () => this.tooltipManager.hideExpeditionTooltip(),
    );
    this.lcRenderer.createExpeditionZones({
      onExpeditionClick: () => this.turnController.onExpeditionClick(),
      onExpeditionPointerMove: (pointer) => {
        const color = this.tooltipManager.colorAtPointerX(pointer.x);
        if (!color) { this.tooltipManager.hideExpeditionTooltip(); return; }
        if (color === this.tooltipManager.currentTooltipColor) return;
        // laneX, PLR_EXP_TOP and CARD_H are imported from LostCitiesConstants
        this.tooltipManager.showExpeditionTooltip(color, {
          x: laneX(EXPEDITION_COLORS.indexOf(color)),
          y: PLR_EXP_TOP + CARD_H / 2,
          height: CARD_H,
        } as any, 'above');
      },
      onExpeditionPointerOut: () => this.tooltipManager.hideExpeditionTooltip(),
    });
    this.lcRenderer.createDiscardZones({
      onDiscardRowClick: (pointer) => this.turnController.onDiscardRowClick(pointer.x),
      onDiscardPointerMove: (pointer) => {
        const color = this.tooltipManager.colorAtPointerX(pointer.x);
        if (!color) { this.tooltipManager.hideExpeditionTooltip(); return; }
        if (color === this.tooltipManager.currentTooltipColor) return;
        // laneX, DISCARD_Y and DISCARD_CARD_H are imported from LostCitiesConstants
        this.tooltipManager.showExpeditionTooltip(color, {
          x: laneX(EXPEDITION_COLORS.indexOf(color)),
          y: DISCARD_Y + DISCARD_CARD_H / 2,
          height: DISCARD_CARD_H,
        } as any, 'below');
      },
      onDiscardPointerOut: () => this.tooltipManager.hideExpeditionTooltip(),
    });
    this.lcRenderer.createRightColumn({
      onDrawPileClick: () => this.turnController.onDrawPileClick(),
    });
    this.lcRenderer.createInstructionBar();

    if (!this.replayMode) {
      this.initHelpPanel(helpContent as HelpSection[]);
      const mapping: EventSoundMapping = {
        'turn-started': SFX_KEYS.TURN_CHANGE,
      };
      this.initSoundSystem(Object.values(SFX_KEYS), mapping);
      this.initSettingsPanel();
    }

    this.lcRenderer.refreshAll((idx) => this.turnController.onHandCardClick(idx));

    if (this.replayMode) {
      this.lcRenderer.instruction.setText('');
      this.emitStateSettled(
        this.session.round.turnNumber,
        this.session.matchPhase === 'playing' ? 'playing' : 'ended',
      );
    } else {
      this.turnController.setPhase('waiting-for-card-select');
    }
  }

  // ── Phase management (delegated from TurnController) ────
  private setPhase(phase: SceneTurnPhase): void {
    const instruction = this.lcRenderer.instruction;
    const turnIndicator = this.lcRenderer.turnIndicator;

    switch (phase) {
      case 'waiting-for-card-select':
        instruction.setText('Select a card from your hand to play or discard');
        turnIndicator.setText('Your Turn — Play/Discard');
        turnIndicator.setColor('#66dd66');
        break;
      case 'waiting-for-target':
        instruction.setText('Click an expedition lane to play, or a discard pile to discard');
        break;
      case 'waiting-for-draw':
        instruction.setText('Draw a card: click the draw pile or a discard pile');
        turnIndicator.setText('Your Turn — Draw');
        turnIndicator.setColor('#66dd66');
        break;
      case 'animating':
        instruction.setText('');
        break;
      case 'ai-thinking':
        instruction.setText('AI is thinking...');
        turnIndicator.setText("AI's Turn");
        turnIndicator.setColor('#ddaa44');
        break;
      case 'round-over':
        instruction.setText('');
        break;
      case 'match-over':
        instruction.setText('');
        break;
    }
  }

  // ── Replay API ──────────────────────────────────────────
  loadBoardState(
    boardStates: Parameters<LostCitiesReplayController['loadBoardState']>[0],
    tableState: Parameters<LostCitiesReplayController['loadBoardState']>[1],
  ): void {
    if (!this.replayMode) {
      throw new Error('loadBoardState() is only available in replay mode (?mode=replay)');
    }

    this.replayController.loadBoardState(boardStates, tableState);
    this.lcRenderer.refreshAll((idx) => this.turnController.onHandCardClick(idx));
    this.emitStateSettled(
      this.session.round.turnNumber,
      this.session.matchPhase === 'playing' ? 'playing' : 'ended',
    );
  }

  // ── Cleanup ─────────────────────────────────────────────
  shutdown(): void {
    this.overlayManager.dismiss();
    this.shutdownBase();
  }
}
