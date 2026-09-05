import { addLog } from '../MainStreetState';
import { executeDayStart, processEndOfTurn, executeAction, type TurnResult } from '../MainStreetEngine';
import { turnLabel } from '../MainStreetFormatting';
import { hasPeekCapableStaff } from '../MainStreetStaffSkills';
import {
  findTargetBusinessSlot,
  canAddToHand,
  canPurchaseUpgrade,
  canPurchaseEvent,
  canPurchaseBusiness,
  canPurchaseStaff,
  canRefreshMarket,
  canSellBusiness,
  computeSellRefund,
} from '../MainStreetMarket';
import type { BusinessCard, EventCard, UpgradeCard, StaffCard } from '../MainStreetCards';
import { computeSynergyPairs, diffNewSynergyPairs, type SynergyPair } from '../MainStreetAdjacency';
import { buyBusinessCommand, moveToHandCommand, moveEventToHandCommand, buyUpgradeCommand, playEventCommand, refreshMarketCommand, buyAndPlaceBusinessCommand, playBusinessFromHandCommand, peekIncidentDeckCommand, hireStaffCardCommand } from '../MainStreetCommands';
import { recordMainStreetEvent, finalizeMainStreetTranscript } from '../MainStreetTranscript';
import { TranscriptStore, autoSaveTranscript } from '../../../src/core-engine/transcript';
import { COMMON_SFX_KEYS, safePlaySound } from '../../../src/core-engine/SoundManager';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import { popTextOrIcon } from '../../../src/ui/popTextOrIcon';
import { FONT_FAMILY } from '../../../src/ui/constants';
import {
  createDragDropManager,
  DEFAULT_DRAG_DISTANCE_THRESHOLD,
  type DragDropPayload,
} from '../../../src/ui/dragDrop';
import { getCurrentStep, isSynergyAdjacentPlacement, resolveTutorialCardParams, type TutorialActionType } from '../TutorialFlow';
import { BrowserLocalStorageAdapter, hasSeenBankingHint, loadTutorialState, markBankingHintShown, saveTutorialState } from '../TutorialState';
import { ensureTutorialMarketForUpcomingSteps } from '../TutorialScenario';
import { computeDragTransferDuration } from './MainStreetConstants';

/**
 * Play illegal-move sound and shake animation on a card target.
 *
 * Wraps {@link shakeIllegalMove} with a container-safe fallback:
 * sprites are shaken directly (with red tint + x-oscillation), while
 * container objects (market cards) receive a simple x-oscillation
 * tween without tint (Containers don't have setTint).
 *
 * Sound plays via `safePlaySound` so mute/volume settings apply
 * and missing audio assets are silently ignored.
 * Reduced-motion is respected: when `scene.settingsPanel.reducedMotion`
 * is true the shake distance is halved and duration shortened.
 *
 * Safe in headless / replay / transcript modes — if the target is
 * null/undefined no tween is created and no sound is attempted.
 *
 * @param target  - Sprite (hand cards) or Container (market cards).
 * @param scene   - Phaser scene for tween + sound plumbing.
 */
function playIllegalFeedback(target: Phaser.GameObjects.Container | Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | null | undefined, scene: any): void {
  // Always attempt to play the sound (safe even with no audio asset).
  safePlaySound(scene as any, COMMON_SFX_KEYS.ILLEGAL_MOVE);

  if (!target) return;

  const reducedMotion = scene.settingsPanel?.reducedMotion ?? false;
  const shakeDistance = reducedMotion ? 3 : 5;
  const shakeDuration = reducedMotion ? 30 : 50;
  const shakeRepeats = reducedMotion ? 1 : 2;

  // Duck-typed Container detection: Containers lack setTint (they're
  // plain groups), while Sprites/Images have setTint/clearTint.
  const isContainer = (target as any).setTint === undefined;

  if (isContainer) {
    // Container-safe shake: position oscillation only (no tint).
    // Sound is already played above (Containers don't support tint).
    const originalX = (target as any).x;
    scene.tweens.add({
      targets: target,
      x: originalX - shakeDistance,
      duration: shakeDuration,
      yoyo: true,
      repeat: shakeRepeats,
      ease: 'Sine.inOut',
      onComplete: () => { (target as any).x = originalX; },
    });
  } else {
    // Sprite/Image shake with red tint + sound via shakeIllegalMove.
    shakeIllegalMove({ scene, target: target as Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, shakeDistance, duration: shakeDuration, repeat: shakeRepeats });
  }
}

/**
 * Match a card ID against a requiredCardId using prefix matching.
 *
 * Card IDs include a copy-number suffix (e.g. `biz-laundromat-2`). The
 * `requiredCardId` in tutorial steps is the template ID with a specific copy
 * number (e.g. `biz-laundromat-0`). This helper strips trailing `-<number>`
 * from both IDs and compares the template prefix, so any copy of the required
 * card template satisfies the requirement.
 */
function matchesRequiredCard(cardId: string, requiredCardId: string): boolean {
  const stripCopy = (id: string): string => id.replace(/-\d+$/, '');
  return stripCopy(cardId) === stripCopy(requiredCardId);
}

export class MainStreetTurnController {
  constructor(private readonly scene: any) {}

  /**
   * Callback invoked after each completed turn (when game is still playing).
   * Used by the lifecycle manager to save a checkpoint via CheckpointManager.
   */
  public onSaveCheckpoint: (() => void) | null = null;

  /**
   * Callback invoked on game end (win/loss/bankruptcy).
   * Used by the lifecycle manager to clear the checkpoint.
   */
  public onGameEnd: (() => void) | null = null;

  /**
   * Starts the DayPhase for a new turn.
   *
   * @param skipMarketRefill  When true (e.g., checkpoint resume), the market
   *                          is not refilled and the saved market state is preserved.
   * @param suppressDayBanner When true, the day-transition banner is NOT
   *                          played (used at boot while the tutorial offer
   *                          modal is visible; the deferred banner fires later
   *                          via MainStreetScene.playDeferredDayBanner()).
   */
  public startDayPhase(skipMarketRefill: boolean = false, suppressDayBanner: boolean = false): void {
    const s = this.scene;
    // Execute DayStart (optionally refills market, transitions to MarketPhase)
    executeDayStart(s.state, skipMarketRefill);
    s.uiPhase = 'market';
    // A new day means no card is "just moved" anymore — any hand card
    // selected now costs an action to place (CG-0MSXIQIPJ000NDTL).
    s.justMovedHandCardId = null;

    // Tutorial: the single-row market only holds 3 cards, so force the
    // upcoming steps' required purchase targets into the line (days 2+).
    const dayStartTut = (s as any).tutorialController as any;
    if (dayStartTut?.isActive) {
      try {
        ensureTutorialMarketForUpcomingSteps(s.state, dayStartTut);
      } catch (_) {
        // robustness — never block day start on scenario bookkeeping
      }
    }

    // Reset hint state for the new turn
    s.hintUsedThisTurn = false;
    s.hintedCardId = null;
    s.hintedSlotIndex = null;

    s.refreshAll();

    // Day transition banner: non-interactive "Day N" reveal at the board
    // centre (skipped under reduced motion / replay — handled inside the
    // animator). Skipped while the tutorial is active (its step overlays
    // carry the guidance), on checkpoint resume (skipMarketRefill — the
    // same day continues, so it is not a new-day transition), or when
    // suppressed at boot (suppressDayBanner — deferred until the player
    // commits to playing).
    const tutController = (s as any).tutorialController as { isActive?: boolean } | undefined;
    if (!skipMarketRefill && !suppressDayBanner && !tutController?.isActive) {
      try { s.msAnimator.animateDayBanner({ day: s.state.turn }); } catch (_) { /* presentation-only — ignore */ }
    }
    void s.cardSvgLoadPromise
      .then(() => s.prewarmVisibleCardTextures())
      .then(() => {
        try {
          s.refreshAll();
          // Market deal-in animation: the final refresh is the one the player
          // sees, so animate after it. Skipped on checkpoint resume
          // (skipMarketRefill) where the market is preserved, not refilled.
          if (!skipMarketRefill) {
            this.animateMarketDealIn('market');
          }
        } catch {
          // scene may be shutting down
        }
      });

    s.instructionText.setText(
      `${turnLabel(s.state.config, s.state.turn)} -- Buy cards from the market or End Turn`,
    );
  }

  public endTurn(): void {
    const s = this.scene;
    // Tutorial gating: only allow end-turn if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('end-turn' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Processing end of turn...');
    s.refreshActionButtons();

    // ── Banking hint trigger (CG-0MT3JK16W006A66P) ────────────────
    // Contextual one-shot hint: when the tutorial is active, the player
    // ends a turn with at least one unused action (a bankable action), and
    // the hint has not yet been shown, remember the candidate and fire the
    // HUD-highlighting hint AFTER the non-blocking `processEndOfTurn` runs.
    // The flag is persisted via TutorialState so a restart does not replay
    // it; legacy saves default to "not shown" (AC2).
    let pendingBankingHint = false;
    try {
      const tut = (s as any).tutorialController as any;
      if (tut?.isActive && s.state.actionsRemaining > 0) {
        const ts = loadTutorialState(new BrowserLocalStorageAdapter());
        if (!hasSeenBankingHint(ts)) {
          pendingBankingHint = true;
          const next = markBankingHintShown(ts);
          void saveTutorialState(new BrowserLocalStorageAdapter(), next).catch(() => {});
        }
      }
    } catch { /* banking hint trigger must never block the turn */ }

    // ── Tutorial guard: prevent market cycling before T7 ──────────
    // When the tutorial is active and the current step is action 'end-turn'
    // (T6), the upcoming processEndOfTurn would call cycleMarketCards(),
    // which discards all scenario-placed market cards and refills from the
    // random deck. This would lose the scenario's explicitly-placed
    // investment event card (Local Festival) before T7 can reference it.
    // Set skipMarketCycleOnEndTurn to preserve the market state until T7
    // completes. The flag is reset after processEndOfTurn.
    const tutController = (s as any).tutorialController as any;
    if (tutController?.isActive) {
      const step = getCurrentStep(tutController);
      if (step?.requiredAction === 'end-turn') {
        s.state.skipMarketCycleOnEndTurn = true;
      }
    }

    // Process end-of-turn phases (events, income, night, end check)
    let result: TurnResult;
    try {
      result = processEndOfTurn(s.state);
    } catch (e) {
      // Defensive: if processEndOfTurn throws (e.g. phase mismatch from
      // async state replacement), recover gracefully instead of hanging
      // with a permanent "Processing end of turn..." message.
      console.error('[MainStreet] endTurn failed:', e);
      s.uiPhase = 'market';
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      s.refreshAll();
      return;
    } finally {
      // Reset the flag after processing so subsequent end-turns cycle normally
      s.state.skipMarketCycleOnEndTurn = false;
    }

    // ── Income Phase Animation ──────────────────────────────────────
    // Presentation-only VFX (AGENTS.md rule 8 + epic CG-0MT23O6W8003AXWJ):
    // the phased income show — base → synergy → reputation → events →
    // upcoming → grid-to-HUD collection (~11s) — runs when the turn ends
    // with producing slots. `scene.incomeCollectionActive` gates the HUD
    // delta pop and defers the street refresh + day start below so the
    // on-card coin grids survive the whole choreography. Never mutates
    // state or the transcript; failures are swallowed so the turn always
    // advances. Reduced-motion and replay/headless modes are handled
    // inside the animator (text-only progression / no-op).
    // Tutorial exemption: the tutorial keeps the compact window-safe
    // collection (`animateIncomeCollection`) so tutorial step pacing is
    // unchanged — precedent: the day banner is also skipped during the
    // tutorial (startDayPhase); the full phased show runs in normal play.
    try {
      const inTutorial = (s as { tutorialController?: { isActive?: boolean } }).tutorialController?.isActive === true;
      const phaseBreakdown = result.income?.phaseBreakdown?.perSlotBreakdown ?? [];
      if (inTutorial) {
        if (result.income && result.income.total > 0) {
          const grid: Array<{ currentReputationPerTurn?: number } | null> = s.state.streetGrid ?? [];
          const repSources = grid
            .map((card, slotIndex) => ({ slotIndex, rep: card?.currentReputationPerTurn ?? 0 }))
            .filter((src) => src.rep > 0);
          s.msAnimator.animateIncomeCollection({
            income: result.income,
            repSources,
          });
        }
      } else if (phaseBreakdown.length > 0) {
        s.msAnimator.animateIncomePhases(phaseBreakdown);
      }
    } catch (_) {
      // Presentation-only: never block the turn on animation failures.
      s.incomeCollectionActive = false;
    }

    // Save checkpoint after each completed turn (fire-and-forget)
    try { this.onSaveCheckpoint?.(); } catch (e) { /* ignore */ }

    // Clear undo stack on end-of-turn (per acceptance criteria)
    try { s.undoManager.clear(); } catch (e) { /* ignore */ }

    // ── Challenge Celebration VFX & Sound ────────────────────────
    // If any challenges were newly completed this turn, trigger celebration
    // animations with staggered timing so they don't overlap.
    if (result.newlyCompletedChallenges.length > 0) {
      // Build a lookup from challenge ID to title
      const challengeTitleById = new Map<string, string>();
      for (const ac of s.state.activeChallenges) {
        challengeTitleById.set(ac.challenge.id, ac.challenge.title);
      }

      result.newlyCompletedChallenges.forEach((challengeId, index) => {
        const title = challengeTitleById.get(challengeId) ?? 'Challenge Complete!';
        s.time.delayedCall(index * 600, () => {
          void s.msAnimator.animateCelebration(title);
        });
      });

      // Refresh the challenge tracker after all celebrations
      s.time.delayedCall(
        result.newlyCompletedChallenges.length * 600 + 200,
        () => (s.incomeCollectionActive ? s.msRenderer.refreshAllExceptStreet() : s.refreshAll()),
      );
    }

    // Brief delay then show result / advance
    s.time.delayedCall(400, () => {
      if (result.gameResult !== 'playing') {
        // Snapshot tiers before the campaign update mutates them
        const tiersBefore = s.campaign
          ? [...s.campaign.unlockedTiers]
          : [];

        // Update campaign progress (tier evaluation + persistence),
        // then compute newly unlocked tiers and show the overlay.
        // Auto-save transcript to browser storage (fire-and-forget)
        const transcript = finalizeMainStreetTranscript({
          gameResult: result.gameResult,
          finalScore: result.finalScore,
        });
        if (transcript) {
          const transcriptStore = new TranscriptStore();
          autoSaveTranscript(transcriptStore, 'main-street', transcript, '[MainStreet]');
        }

        // Update standalone player statistics (fire-and-forget, independent
        // of campaign progress update). Guarded against replay mode internally
        // by the lifecycle manager.
        s.updateStats(result.gameResult, result.finalScore);

        // Clear checkpoint on game end
        try { this.onGameEnd?.(); } catch (e) { /* ignore */ }
        s.updateCampaignProgress().then(() => {
          const tiersAfter = s.campaign
            ? s.campaign.unlockedTiers
            : [];
          const newlyUnlockedTiers = tiersAfter.filter(
            (t: any) => !tiersBefore.includes(t),
          );
          s.showGameOverOverlay(result, newlyUnlockedTiers);
        });
      } else {
        // Show income feedback briefly then start next turn
        if (result.income && result.income.total > 0) {
          s.instructionText.setText(
            `Income: +${result.income.total} coins` +
            (result.incident ? ` | Incident: ${result.incident.name}` : ''),
          );
        } else if (result.incident) {
          s.instructionText.setText(`Incident: ${result.incident.name}`);
        }
        // While the phased income show runs, the street cards host the
        // on-card coin grids (child 2); refresh everything EXCEPT the
        // street so those grids survive until collection completes, then
        // refresh fully once the choreography finishes.
        if (s.incomeCollectionActive) {
          s.msRenderer.refreshAllExceptStreet();
        } else {
          s.refreshAll();
        }
        // Incident reveal presentation (AGENTS.md rule 8): non-blocking VFX —
        // the resolved incident card flies from the face-down incident-deck
        // panel (CG-0MSTOATDP000JNHH) to the
        // board centre with a red flash pulse, warning sting SFX, explicit
        // HUD loss pops and a warning-indicator pulse. Runs after the final
        // render; reduced-motion keeps the pops + sound, replay/headless
        // skips everything (handled inside the animator). Never blocks the
        // turn advance.
        if (result.incident) {
          try {
            s.msAnimator.animateIncidentReveal({
              cardId: result.incident.id,
              incidentName: result.incident.name,
              coinChange: result.incidentCoinChange,
              repChange: result.incidentRepChange,
              from: s.msRenderer.getFrontIncidentCardCenter(),
            });
          } catch (_) {
            // presentation-only — ignore
          }
        }
        // Tutorial: mark end-turn step complete if active
        (s.msLifecycleManager as any).onTutorialActionComplete?.('end-turn' as TutorialActionType);
        // ── Banking hint presentation (CG-0MT3JK16W006A66P) ─────
        // Non-blocking HUD-highlighting overlay, once per save. Fires after
        // the turn's gated step has advanced so it does not compete with
        // the step's own overlay. Never blocks the day start.
        if (pendingBankingHint) {
          try { (s as any).tutorialOverlay?.showBankingHint?.(); } catch { /* presentation-only */ }
        }
        // The income show is the turn's closing moment (~11s): defer the
        // day start until the choreography completes so it isn't cut short
        // by the market/street refresh.
        if (s.incomeCollectionActive) {
          // Bounded deferral: start the next day once the choreography
          // completes (AC7 collect clears the flag); a safety cap forces
          // the day start even if the flag is somehow never cleared, so
          // end-of-turn can never hang the game (AC5).
          const startAt = s.time.now + 16_000;
          const startAfterIncomeShow = (): void => {
            if (s.incomeCollectionActive && s.time.now < startAt) {
              s.time.delayedCall(250, startAfterIncomeShow);
            } else {
              s.incomeCollectionActive = false;
              this.startDayPhase();
            }
          };
          startAfterIncomeShow();
        } else {
          s.time.delayedCall(800, () => this.startDayPhase());
        }
      }
    });
  }

  public onPlayHeldEvent(handIndex?: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Tutorial gating: only allow play-event if it's the required action or
    // the tutorial is inactive (T14 "Triggering Events" uses this gate).
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('play-event' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    // Resolve the event card to play: an explicit hand index (from clicking a
    // specific event card in the merged hand) or the first event in the hand.
    const hand = s.state.hand ?? [];
    let index = handIndex;
    if (index === undefined) {
      index = hand.findIndex((c: any) => c.family === 'event');
    }
    if (index === undefined || index < 0 || index >= hand.length) return;
    const card = hand[index];
    if (card.family !== 'event') return;

    console.debug('[MS] onPlayHeldEvent: attempting PlayEvent', { eventId: card.id, coinsBefore: s.state.resourceBank.coins });

    // Capture the played card's position BEFORE the hand re-renders — the
    // card leaves the hand on `refreshAll`, so its sprite must be read now.
    const handSpriteSprite = s.msRenderer?.handView?.getSpriteAt?.(index) as Phaser.GameObjects.Sprite | undefined;
    const handSprite = handSpriteSprite ? { x: handSpriteSprite.x, y: handSpriteSprite.y } : undefined;
    const playedPos = handSprite;

    let played = false;
    try {
      const cmd = playEventCommand(s.state, index);
      s.undoManager.execute(cmd);
      played = true;
      // Record action event
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-event' }, description: cmd.description }); } catch (_) {}
      try { s.gameEvents?.emit('card:placed', { action: 'play-event', heldEventId: card.id }); } catch (_) {}
      s.instructionText.setText('Played held Investment event!');
      addLog(s.state, 'Played held event (via UI)', 'neutral');
      console.debug('[MS] PlayEvent executed', { coinsAfter: s.state.resourceBank.coins });
      // Tutorial: mark play-event step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('play-event' as TutorialActionType);
      } catch (_) { /* ignore */ }
    } catch (e) {
      const msg = (e as Error).message;
      console.error('[MS] PlayEvent failed', e);
      playIllegalFeedback(handSpriteSprite, s);
      s.instructionText.setText(`Error: ${msg}`);
    }

    s.refreshAll();

    // Burst + cheer SFX + event-name pop at the played card's position
    // (only when the play succeeded). Reduced motion / replay handled
    // inside the animator.
    if (played && playedPos) {
      try {
        s.msAnimator.animateEventPlayed({ x: playedPos.x, y: playedPos.y, eventName: card.name });
      } catch (_) { /* presentation-only — ignore */ }
    }
  }

  public performUndo(): void {
    const s = this.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canUndo()) return;

    try {
      const cmd = s.undoManager.undo();
      addLog(s.state, 'Undo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'undo', turn: s.state.turn, reversedAction: { description: cmd.description } }); } catch (_) {}
      // Undoing a move-to-hand removes the card from hand, so any tracked
      // "just moved" card is stale (CG-0MSXIQIPJ000NDTL).
      s.justMovedHandCardId = null;
      s.refreshAll();
      // Undo feedback (AGENTS.md rule 8): "Undid: <action>" pop above the
      // hint bar + UI click SFX. Reduced motion / replay handled inside the
      // animator; non-blocking, presentation-only.
      if (cmd) {
        try { s.msAnimator?.animateUndoRedo({ action: 'undo', description: cmd.description }); } catch (_) { /* presentation-only — ignore */ }
      }
    } catch (e) {
      console.error('Undo failed:', e);
    }
  }

  public performRedo(): void {
    const s = this.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canRedo()) return;

    try {
      const cmd = s.undoManager.redo();
      addLog(s.state, 'Redo', 'neutral');
      try { if (cmd) recordMainStreetEvent({ type: 'redo', turn: s.state.turn, reappliedAction: { description: cmd.description } }); } catch (_) {}
      s.refreshAll();
      // Redo feedback (AGENTS.md rule 8): "Redid: <action>" pop above the
      // hint bar + UI click SFX. Reduced motion / replay handled inside the
      // animator; non-blocking, presentation-only.
      if (cmd) {
        try { s.msAnimator?.animateUndoRedo({ action: 'redo', description: cmd.description }); } catch (_) { /* presentation-only — ignore */ }
      }
    } catch (e) {
      console.error('Redo failed:', e);
    }
  }

  public onBusinessCardClick(card: BusinessCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Action economy (CG-0MSTOF1N5005PK2R): moving a market card to hand
    // costs the daily action — gate before the transfer animation so the
    // player gets immediate feedback instead of a mid-flight error.
    if (s.state.actionsRemaining <= 0) {
      s.instructionText.setText('No actions remaining today. End your turn to start a new day.');
      const containers0 = s.msRenderer?.getMarketRowCards?.();
      const cardIndex0 = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const target0 = containers0?.[cardIndex0] ?? null;
      playIllegalFeedback(target0, s);
      return;
    }

    // Tutorial gating: only allow select-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const containers1 = s.msRenderer?.getMarketRowCards?.();
      const cardIndex1 = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const target1 = containers1?.[cardIndex1] ?? null;
      playIllegalFeedback(target1, s);
      return;
    }

    // Tutorial: enforce specific card purchase if requiredCardId is set on the current step.
    // Uses prefix matching (template ID without copy number suffix) so any copy of the
    // required card template satisfies the requirement.
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        // Find the card name from the market for the error message
        const requiredCard = s.state.market.cards.find(
          (c: any) => matchesRequiredCard(c.id, step.requiredCardId!)
        );
        const requiredName = requiredCard?.name ?? 'the specified card';
        const msg = `This is not the card you should buy right now. Please buy ${requiredName} first.`;
        s.instructionText.setText(msg);
        const containers2 = s.msRenderer?.getMarketRowCards?.();
        const cardIndex2 = s.state.market.cards.findIndex((c: any) => c.id === card.id);
        const target2 = containers2?.[cardIndex2] ?? null;
        playIllegalFeedback(target2, s);
        // Clear the error message after 2 seconds so the overlay remains visible
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
        return;
      }
    }

    s.selectMarketCardById(card.id);

    // Check hand capacity
    const handCheck = canAddToHand(s.state);
    if (!handCheck.legal) {
      // Illegal feedback (CG-0MSXKQVZC009AM9L): play sfx + shake on the market
      // card so the player immediately understands the action is blocked.
      const containers = s.msRenderer?.getMarketRowCards?.();
      const cardIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const target = containers?.[cardIndex] ?? null;
      playIllegalFeedback(target, s);
      s.instructionText.setText(`Hand full: ${handCheck.reason ?? 'Place or sell a card first.'}`);
      return;
    }

    // ── Move to hand (free; cost paid at play) ────────────────
    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);
    const cardName = card.name;

    // Ensure stale hover tooltip is cleared
    s.tooltipManager?.hide();

    s.clearMarketSelection();
    s.uiPhase = 'animating';
    s.instructionText.setText(`Moving "${cardName}" to hand...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = () => {
      try {
        const cmd = moveToHandCommand(s.state, card.id);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'move-to-hand', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        s.instructionText.setText(`"${cardName}" moved to hand (free)!`);

        // No auto-selection (CG-0MSXIQIPJ000NDTL): the card rests in hand,
        // unselected. The player must explicitly click the hand card when
        // ready to place it. Record the card ID so that placing it stays
        // free (same-day move+place = 1 action) when the player selects it.
        s.pendingHandIndex = null;
        s.pendingHandJustMoved = false;
        s.justMovedHandCardId = card.id;
        s.uiPhase = 'market';
        s.instructionText.setText(`"${cardName}" is in hand — click the card to select it, then an empty slot to place.`);
      } catch (e) {
        console.error('[MS] BuyBusinessToHand failed', e);
        playIllegalFeedback(s.actionContainer, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
        s.uiPhase = 'market';
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.refreshAll();
      s.refreshStreetGrid();
      s.refreshActionButtons();

      // Tutorial: mark select-business step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('select-business' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    if (sourceIndex >= 0) {
      const handIndex = (s.state.hand ?? []).length;
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'business',
        row: 'market',
        slotIndex: sourceIndex,
        // Animate to the exact resting position in the merged hand — the
        // HandView-predicted insertion position (single source of truth),
        // not a left-edge slot estimate that would make the card snap
        // sideways when the hand re-renders centred on handCenterX.
        destination: s.getBusinessHandInsertionPosition(handIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  // ── Drag-and-drop buy-to-slot (business cards) ─────────────
  //
  // Wire the reusable core-engine drag-drop module (src/ui/dragDrop.ts)
  // to Main Street: business cards in the Development row become draggable
  // during the market phase and can be dropped straight onto an empty
  // street slot to buy + place in one undoable step.
  //
  // Hand-vs-direct-to-slot semantics: the click flow buys to hand (max
  // hand size 2) then places; the drag flow buys DIRECTLY to the slot,
  // bypassing the hand entirely. This matches the one-gesture request.

  /**
   * Initialise the reusable drag-drop manager for the market phase.
   *
   * Business cards in the Development row are registered as draggables by
   * the renderer; empty street slots are registered as drop zones. The
   * existing click-to-buy → click-to-place flow is preserved via
   * `dragDistanceThreshold` (a pointerup without a drag still reaches the
   * click path).
   */
  public initDragDrop(): void {
    const s = this.scene;
    if (s.dragDropManager) return;
    // Guard: in headless unit tests the scene may have no input plugin.
    if (!s.input || typeof s.input.on !== 'function') return;

    s.dragDropManager = createDragDropManager({
      scene: s,
      dragDistanceThreshold: DEFAULT_DRAG_DISTANCE_THRESHOLD,
      reducedMotion: !!s.settingsPanel?.reducedMotion,
      onDragStart: () => {
        try { s.msRenderer?.showDragHighlights?.(); } catch (_) { /* ignore */ }
      },
      onDragEnd: () => {
        try { s.msRenderer?.clearDragHighlights?.(); } catch (_) { /* ignore */ }
      },
    });
  }

  /**
   * Drag-pickup validation (dragstart veto → illegal-card feedback).
   *
   * A business or community-space card (both live in the Development row)
   * may only be picked up when the player can afford it, there is at least
   * one empty street slot to drop it on, and the tutorial allows the
   * `select-business` action (including requiredCardId matching for tutorial
   * steps that gate a specific card). Events and upgrades are NOT draggable
   * (click-only).
   */
  public canPickUpBusinessCard(cardId: string): boolean {
    const s = this.scene;
    if (s.uiPhase !== 'market') return false;
    // Action economy (CG-0MSTOF1N5005PK2R): dragging is a buy-and-place
    // action — no pickup when the daily action budget is spent.
    if (s.state.actionsRemaining <= 0) return false;
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card) return false;
    // Drag support covers business AND community-space cards (general change,
    // operator decision A for the T13 Library bug). Events/upgrades stay
    // click-only (they are not part of the drag-drop module's dev-row model).
    if (card.family !== 'business' && card.family !== 'community-space') return false;
    // Composite-parity buy-and-place price (CG-0MT24X0SX007RLHN): on GM
    // 2-action days the drag charges the LISTED cost (consuming 2 actions);
    // on a 1-action day it charges the +50% premium (consuming 1 action).
    // Check affordability against the applicable price.
    const price = s.state.actionsRemaining >= 2 ? card.cost : Math.ceil(card.cost * 1.5 * 2) / 2;
    if (s.state.resourceBank.coins < price) return false;
    if (!s.state.streetGrid.some((slot: any) => slot === null)) return false;

    // Tutorial gating: only allow select-business if it is the required
    // action or the tutorial is inactive.
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-business' as TutorialActionType);
    if (check && !check.allowed) return false;

    // Tutorial: enforce specific card purchase if requiredCardId is set on
    // the current step (same prefix-matching rule as the click path).
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Drop-zone acceptance validation.
   *
   * The target slot must pass `canPurchaseBusiness` (card still in the
   * Development row, enough coins, empty slot, in bounds) and the tutorial
   * must allow the `place-business` action. During a plan-ahead placement
   * step with a synergy partner (T19: Library next to the Bookshop), the
   * target must also pass `isSynergyAdjacentPlacement`. A rejected drop
   * snap-backs the card to the Development row with illegal-move feedback.
   */
  public canDropBusinessCard(cardId: string, slotIndex: number): boolean {
    const s = this.scene;
    // Action economy (CG-0MSTOF1N5005PK2R): buy-and-place consumes the
    // daily action — no drop when the budget is spent. On GM 2-action days
    // the drag consumes BOTH actions (composite parity), so 2 must remain.
    if (s.state.actionsRemaining <= 0) return false;
    const legality = canPurchaseBusiness(s.state, cardId, slotIndex);
    if (!legality.legal) return false;

    // Composite-parity buy-and-place price (CG-0MT24X0SX007RLHN): on GM
    // 2-action days the drag charges the LISTED cost (2 actions consumed);
    // on a 1-action day it charges the +50% premium. Verify affordability
    // against the applicable price (not just the listed cost).
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (card && (card.family === 'business' || card.family === 'community-space')) {
      const price = s.state.actionsRemaining >= 2 ? card.cost : Math.ceil(card.cost * 1.5 * 2) / 2;
      if (s.state.resourceBank.coins < price) return false;
    }

    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) return false;

    // Tutorial: synergy adjacency for composite buy-and-place steps (T13).
    const controller = (s as any).tutorialController as any;
    if (controller?.isActive) {
      const step = controller.currentStepIndex >= 0
        ? getCurrentStep(controller)
        : null;
      if (step && !isSynergyAdjacentPlacement(step, s.state.streetGrid, slotIndex)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Execute a drag-drop buy-and-place.
   *
   * Buys the dragged business card directly to the drop slot in a single
   * undoable `buyAndPlaceBusinessCommand` — the direct market→street path.
   * Composite-parity pricing (CG-0MT24X0SX007RLHN): the drag is the same
   * turn's move+place in one gesture. When only the last action remains
   * (1-action day) the placement step has no action → +50% premium (1
   * action total, dialog confirms). On 2-action (GM) days the placement
   * step consumes the remaining action at listed cost — identical to the
   * click composite, so drag is never cheaper than click. The animated
   * market→street transfer + SFX matches the click flow's feedback.
   */
  public onDragDropBusiness(payload: DragDropPayload): void {
    const s = this.scene;
    const cardId = payload.data as string;
    const slotIndex = payload.zoneData as number;
    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === cardId);
    const card = s.state.market.cards.find((c: any) => c.id === cardId);
    if (!card || sourceIndex < 0 || slotIndex == null) return;

    // The dragged container follows the pointer, so its position at drop
    // time IS the drop location. Capture it BEFORE refreshAll() recreates
    // the market card at its slot origin, then start the transfer
    // animation from there (not from the market row).
    const dropSource = { x: payload.gameObject?.x ?? 0, y: payload.gameObject?.y ?? 0 };

    const cardName = card.name;

    // Composite-parity pricing for the drag's move+place accounting:
    // premium applies only when the drag's own action leaves no action for
    // the placement step (last action on a 1-action day); on GM 2-action
    // days the placement consumes the remaining action at listed cost.
    const premiumApplies = s.state.actionsRemaining <= 1;
    const priceOverride = premiumApplies ? undefined : card.cost;
    const extraActions = premiumApplies ? 0 : 1;

    const startTransfer = (): void => {
      s.tooltipManager?.hide();
      s.clearMarketSelection();
      s.hiddenTransferSourceCardIds.add(cardId);
      s.uiPhase = 'animating';
      s.instructionText.setText(`Moving "${cardName}" to hand...`);
      s.refreshAll();

      const afterTransfer = (): void => {
        // Capture synergy pairs before the placement mutates the grid so only
        // NEWLY formed pairs animate (pre-existing pairs never re-trigger).
        const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? []);
        try {
          const cmd = buyAndPlaceBusinessCommand(s.state, cardId, slotIndex, priceOverride, extraActions);
          s.undoManager.execute(cmd);
          try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-and-place', cardId, slotIndex }, description: cmd.description }); } catch (_) {}
          try { s.gameEvents?.emit('card:placed', { cardId, slotIndex }); } catch (_) {}
          s.instructionText.setText(premiumApplies
            ? `Placed "${cardName}" on slot ${slotIndex} (50% premium)`
            : `Placed "${cardName}" on slot ${slotIndex}`);
        } catch (e) {
          console.error('[MS] DragBuyBusiness failed', e);
          const msg = (e as Error).message;
          const container = s.msRenderer?.getMarketRowCards?.()?.[sourceIndex] ?? s.actionContainer ?? null;
          playIllegalFeedback(container, s);
          s.instructionText.setText(`Error: ${msg}`);
        }

        s.hiddenTransferSourceCardIds.delete(cardId);
        s.uiPhase = 'market';
        s.refreshAll();
        s.refreshStreetGrid();
        s.refreshActionButtons();
        // Synergy-formation animation for any new pairs (non-blocking).
        this.animateNewSynergyPairs(beforePairs);
        // Tutorial: mark place-business step complete if active
        try {
          (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
        } catch (_) { /* ignore */ }
      };

      if (sourceIndex >= 0) {
        // Transfer duration proportional to the drop-to-slot distance: a card
        // released next to its slot settles quickly instead of taking the
        // fixed 1500ms market→slot flight (click/AI flows keep 1500ms via the
        // shared default). See computeDragTransferDuration (CG-0MST2LS3E004BTPO).
        const destination = s.getStreetSlotCenter(slotIndex);
        const distancePx = Math.hypot(destination.x - dropSource.x, destination.y - dropSource.y);
        void s.animateTransferFromMarket({
          cardId,
          family: 'business',
          row: 'market',
          slotIndex: sourceIndex,
          source: dropSource,
          destination,
          duration: computeDragTransferDuration(distancePx),
        }).then(afterTransfer);
      } else {
        afterTransfer();
      }
    };

    if (premiumApplies) {
      // Explain dialog before confirming the premium drag (CG-0MT24X0SX007RLHN):
      // proceed → place at premium; cancel → the card returns to the market
      // row (no coins deducted, no action consumed).
      s.showBuyAndPlacePremiumDialog(cardName, startTransfer, () => {
        s.uiPhase = 'market';
        s.instructionText.setText(`"${cardName}" stays in the market — buy cancelled.`);
        try { s.msRenderer?.clearDragHighlights?.(); } catch (_) { /* ignore */ }
        s.refreshAll();
        s.refreshStreetGrid();
        s.refreshActionButtons();
      });
      return;
    }
    startTransfer();
  }

  public onSlotClick(slotIndex: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'placing-from-hand' && s.uiPhase !== 'placing-business') return;

    // Tutorial gating: only allow place-business if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('place-business' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const handSpriteGating = s.msRenderer?.handView?.getSpriteAt?.(s.pendingHandIndex ?? -1) as any;
      playIllegalFeedback(handSpriteGating ?? s.actionContainer, s);
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is placed.
    s.tooltipManager?.hide();

    // Tutorial: synergy adjacency for composite buy-and-place steps (T13 —
    // the Library must be built next to the Bookshop). A non-adjacent click
    // placement is rejected with a data-driven instruction message and the
    // phase stays 'placing-from-hand' so the player can retry.
    const tutController = (s as any).tutorialController as any;
    const step = tutController?.isActive && tutController.currentStepIndex >= 0
      ? getCurrentStep(tutController)
      : null;
    if (step && !isSynergyAdjacentPlacement(step, s.state.streetGrid, slotIndex)) {
      const params = resolveTutorialCardParams(step);
      const cardName = params?.cardName ?? 'this card';
      const synergyName = params?.synergyCardName ?? 'the partner card';
      s.instructionText.setText(`Place ${cardName} next to ${synergyName} for a Culture bonus.`);
      const handSpriteSynergy = s.msRenderer?.handView?.getSpriteAt?.(s.pendingHandIndex ?? -1) as any;
      playIllegalFeedback(handSpriteSynergy ?? s.actionContainer, s);
      return;
    }

    // ── New flow: place from hand ──────────────────────────────
    if (s.pendingHandIndex !== null) {
      const handIndex = s.pendingHandIndex;
      const handCard = (s.state.hand ?? [])[handIndex];
      if (!handCard) {
        s.pendingHandIndex = null;
        s.pendingHandJustMoved = false;
        s.uiPhase = 'market';
        s.instructionText.setText('Card no longer in hand.');
        return;
      }

      const cardId = handCard.id;
      const cardName = handCard.name;

      // Capture the hand card's resting position (excludes selection-raise)
      const handPos = s.msRenderer?.handView?.getBasePosition(handIndex);
      const source = handPos
        ? { x: handPos.x, y: handPos.y }
        : { x: s.layout.handX + s.layout.handCardW / 2, y: s.layout.handY + s.layout.handCardH / 2 };

      s.pendingHandIndex = null;
      s.hiddenTransferSourceCardIds.add(cardId);
      s.uiPhase = 'animating';
      s.instructionText.setText(`Placing "${cardName}"...`);
      s.refreshAll();

      const afterTransfer = (): void => {
        // Capture synergy pairs before the placement mutates the grid so only
        // NEWLY formed pairs animate.
        const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? []);

        // Composite pricing (CG-0MT24X0SX007RLHN): a same-day card (just
        // moved from the market this turn) is part of the move+place purchase
        // — the move already spent the daily action. When no action remains
        // for the placement step, the +50% premium replaces the missing
        // action; when an action DOES remain (Golden Mile 2-action days), the
        // placement consumes it at listed cost. Held cards (plan-ahead) always
        // consume an action at listed cost.
        const premiumApplies = s.pendingHandJustMoved && s.state.actionsRemaining <= 0;
        const premiumCost = premiumApplies
          ? Math.ceil(handCard.cost * 1.5 * 2) / 2
          : undefined;

        // Shared post-place cleanup (success, failure, or dialog cancel).
        const finish = (): void => {
          s.hiddenTransferSourceCardIds.delete(cardId);
          s.uiPhase = 'market';
          s.refreshAll();
          s.refreshStreetGrid();
          s.refreshActionButtons();
          // Synergy-formation animation for any new pairs (non-blocking).
          this.animateNewSynergyPairs(beforePairs);
          // Tutorial: mark place-business step complete if active
          try {
            (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
          } catch (_) { /* ignore */ }
        };

        const doPlace = (): void => {
          try {
            // Composite-premium command (CG-0MT24X0SX007RLHN): when
            // `premiumCost` is supplied the +50% premium replaces the action
            // (no action consumed); the held-card / GM-listed path (undefined)
            // consumes the action at listed cost. Executed through the undo
            // manager so the coin deduction is fully undoable/redoable.
            const cmd = playBusinessFromHandCommand(s.state, handIndex, slotIndex, premiumCost);
            s.undoManager.execute(cmd);
            // The just-moved card has now been placed; clear the tracker so a
            // later selection of any other hand card costs an action again.
            // (Cleared only on success — on failure the card stays in hand and
            // a retry must still place it free, CG-0MSXIQIPJ000NDTL.)
            if (s.justMovedHandCardId === cardId) {
              s.justMovedHandCardId = null;
            }
            try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'play-business-from-hand', handIndex, slotIndex }, description: premiumApplies ? `Placed from hand to slot ${slotIndex} (50% premium, no action left)` : `Placed from hand to slot ${slotIndex}` }); } catch (_) {}
            try { s.gameEvents?.emit('card:placed', { handIndex, slotIndex }); } catch (_) {}
            s.instructionText.setText(premiumApplies
              ? `Placed "${cardName}" on slot ${slotIndex} (50% premium)`
              : `Placed "${cardName}" on slot ${slotIndex}`);
          } catch (e) {
            const msg = (e as Error).message;
            console.error('[MS] playBusinessFromHandCommand failed', e);
            const handSprite = s.msRenderer?.handView?.getSpriteAt?.(handIndex) as any;
            playIllegalFeedback(handSprite ?? s.actionContainer, s);
            s.instructionText.setText(`Error: ${msg}`);
          }
          finish();
        };

        if (premiumApplies) {
          // Affordability pre-gate (CG-0MT24X0SX007RLHN): reject the premium
          // placement with illegal feedback BEFORE the explainer dialog when
          // the player cannot afford the premium price (dialog does not fire).
          const handSprite = s.msRenderer?.handView?.getSpriteAt?.(handIndex);
          if (s.state.resourceBank.coins < premiumCost!) {
            playIllegalFeedback(handSprite, s);
            s.instructionText.setText(`Error: Not enough coins to place ${cardName} at the premium price. Need ${premiumCost}, have ${s.state.resourceBank.coins}.`);
            finish();
            return;
          }
          // Explain dialog before confirming the premium placement
          // (CG-0MT24X0SX007RLHN): proceed → place at premium; cancel →
          // placement aborts and the card returns to hand (no cost, no
          // action consumed).
          s.showBuyAndPlacePremiumDialog(cardName, doPlace, () => {
            s.instructionText.setText(`"${cardName}" stays in hand — placement cancelled.`);
            finish();
          });
          return;
        }
        doPlace();
      };

      void s.animateTransferFromMarket({
        cardId,
        family: 'business',
        row: 'market',
        slotIndex: handIndex,
        source,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
      return;
    }

    // ── Legacy flow: direct buy to grid (pendingBusinessCard) ──
    // This path is kept for backward compatibility but should not be
    // triggered in normal gameplay since all purchases go through hand.
    if (!s.pendingBusinessCard) {
      const tutController = (s as any).tutorialController as any;
      if (tutController?.isActive) {
        const msg = 'You must first buy a business card. Click on a business card in the market.';
        s.instructionText.setText(msg);
        playIllegalFeedback(s.actionContainer, s);
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
      }
      return;
    }

    const sourceIndex = s.pendingBusinessSourceIndex;
    const pendingCardId = s.pendingBusinessCard.id;
    const pendingCardName = s.pendingBusinessCard.name;

    s.pendingBusinessCard = null;
    s.pendingBusinessSourceIndex = null;
    s.clearMarketSelection();
    s.uiPhase = 'animating';
    s.instructionText.setText(`Placing "${pendingCardName}"...`);
    s.hiddenTransferSourceCardIds.add(pendingCardId);
    s.refreshAll();

    const afterTransfer = (): void => {
      // Capture synergy pairs before the placement mutates the grid so only
      // NEWLY formed pairs animate.
      const beforePairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? []);
      try {
        const cmd = buyBusinessCommand(s.state, pendingCardId, slotIndex);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-business', cardId: pendingCardId, slotIndex }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: pendingCardId, slotIndex }); } catch (_) {}
        s.instructionText.setText(`Placed "${pendingCardName}" on slot ${slotIndex}`);
      } catch (e) {
        console.error('[MS] BuyBusiness failed', e);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(pendingCardId);
      s.uiPhase = 'market';
      s.refreshAll();
      // Synergy-formation animation for any new pairs (non-blocking).
      this.animateNewSynergyPairs(beforePairs);
      (s.msLifecycleManager as any).onTutorialActionComplete?.('place-business' as TutorialActionType);
    };

    if (typeof sourceIndex === 'number' && sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: pendingCardId,
        family: 'business',
        row: 'market',
        slotIndex: sourceIndex,
        destination: s.getStreetSlotCenter(slotIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onEventCardClick(card: EventCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;
    // Tutorial gating: only allow buy-event if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('buy-event' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const containersE = s.msRenderer?.getMarketRowCards?.();
      const cardIndexE = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const targetE = containersE?.[cardIndexE] ?? s.actionContainer ?? null;
      playIllegalFeedback(targetE, s);
      return;
    }

    // Tutorial: enforce specific event card purchase if requiredCardId is set.
    // Uses prefix matching (template ID without copy number suffix) so any copy of the
    // required card template satisfies the requirement.
    const evtController = (s as any).tutorialController as any;
    if (evtController?.isActive) {
      const step = evtController.currentStepIndex >= 0
        ? getCurrentStep(evtController)
        : null;
      if (step?.requiredCardId && !matchesRequiredCard(card.id, step.requiredCardId)) {
        const requiredCard = s.state.market.cards.find(
          (c: any) => matchesRequiredCard(c.id, step.requiredCardId!)
        );
        const requiredName = requiredCard?.name ?? 'the specified event card';
        const msg = `This is not the card you should buy right now. Please buy ${requiredName} first.`;
        s.instructionText.setText(msg);
        const containersE2 = s.msRenderer?.getMarketRowCards?.();
        const cardIndexE2 = s.state.market.cards.findIndex((c: any) => c.id === card.id);
        const targetE2 = containersE2?.[cardIndexE2] ?? s.actionContainer ?? null;
        playIllegalFeedback(targetE2, s);
        // Clear the error message after 2 seconds
        s.time.delayedCall(2000, () => {
          if (s.instructionText?.text === msg) {
            s.instructionText.setText('Complete the highlighted step.');
          }
        });
        return;
      }
    }

    // Ensure stale hover tooltip is cleared when a card is played.
    s.tooltipManager?.hide();

    s.selectMarketCardById(card.id);

    const legality = canPurchaseEvent(s.state, card.id);
    if (!legality.legal) {
      const containersE3 = s.msRenderer?.getMarketRowCards?.();
      const cardIndexE3 = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const targetE3 = containersE3?.[cardIndexE3] ?? s.actionContainer ?? null;
      playIllegalFeedback(targetE3, s);
      s.instructionText.setText(`Cannot buy event: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);

    s.uiPhase = 'animating';
    s.instructionText.setText(`Moving event "${card.name}" to hand...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onEventCardClick: attempting BuyEvent', { cardId: card.id, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.cards.map((c: any)=>c.id) });
      try {
        const cmd = moveEventToHandCommand(s.state, card.id);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-event', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        s.instructionText.setText(`Moved event to hand (free): "${card.name}"`);
      } catch (e) {
        console.error('[MS] MoveEventToHand failed', e);
        playIllegalFeedback(s.actionContainer, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.uiPhase = 'market';
      s.refreshAll();
      // Tutorial: mark buy-event step complete if active
      try {
        (s.msLifecycleManager as any).onTutorialActionComplete?.('buy-event' as TutorialActionType);
      } catch (_) { /* ignore */ }
    };

    if (sourceIndex >= 0) {
      const handIndex = (s.state.hand ?? []).length;
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'event',
        row: 'market',
        slotIndex: sourceIndex,
        // Animate to the exact resting position of the appended hand card — the
        // merged HandView-predicted position (single source of truth), centred
        // on handCenterX rather than the left-anchored slot estimate.
        destination: s.getEventHandInsertionPosition(handIndex),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  public onRefreshMarketClick(): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    const legality = canRefreshMarket(s.state);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot re-roll: ${legality.reason ?? 'unknown'}`);
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Re-rolling the market...');
    s.refreshAll();

    // Capture the outgoing row before the command replaces it — the swap
    // animation fades these cards out from their current slot positions.
    const outgoingRow = s.state.market.cards.slice();
    let refreshed = false;
    try {
      const cmd = refreshMarketCommand(s.state);
      s.undoManager.execute(cmd);
      try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'refresh-market' }, description: cmd.description }); } catch (_) {}
      s.instructionText.setText('Market re-rolled');
      addLog(s.state, 'Re-rolled market (via UI)', 'neutral');
      refreshed = true;
    } catch (e) {
      console.error('[MS] RefreshMarket failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
    }

    s.uiPhase = 'market';
    s.refreshAll();
    // Market swap animation (only when the refresh actually succeeded).
    if (refreshed) this.animateMarketSwap('market', outgoingRow);
  }

  /**
   * Staff peek at the incident deck (CG-0MSXOW6GN008ZSMN).
   *
   * Consumes one daily action via the undoable peek command, exposes the
   * revealed card through `state.revealedPeekedCard`, and plays the face-up
   * reveal animation from the face-down deck stack position (with SFX per
   * AGENTS.md rule 8 — reduced-motion respected, mute honoured via
   * SoundManager). The card is returned face-down without being resolved.
   */
  public onPeekClick(): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    if (s.state.actionsRemaining <= 0) {
      s.instructionText.setText('No actions remaining today. End your turn to start a new day.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }
    if (s.state.peekUsedThisTurn) {
      s.instructionText.setText('You have already peeked at the incident deck this turn.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }
    if (!hasPeekCapableStaff(s.state)) {
      s.instructionText.setText('No staff member with the peek ability is employed.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }
    if (s.state.incidentDeck.length === 0) {
      s.instructionText.setText('The incident deck is empty \u2014 nothing to peek at.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Peeking at the incident deck...');
    try {
      const cmd = peekIncidentDeckCommand(s.state);
      s.undoManager.execute(cmd);
      try {
        recordMainStreetEvent({
          type: 'action',
          turn: s.state.turn,
          action: { type: 'peek-incident-deck' },
          description: cmd.description,
        });
      } catch (_) { /* transcript disabled */ }
    } catch (e) {
      console.error('[MS] Peek failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      s.uiPhase = 'market';
      s.refreshAll();
      return;
    }

    const peeked = s.state.revealedPeekedCard;
    if (!peeked) {
      // Empty-deck no-op: nothing to reveal.
      s.uiPhase = 'market';
      s.refreshAll();
      return;
    }

    s.msAnimator.animatePeekReveal({
      cardId: peeked.id,
      cardName: peeked.name,
      from: s.msRenderer.getFrontIncidentCardCenter(),
      onComplete: () => {
        s.state.revealedPeekedCard = null;
        s.uiPhase = 'market';
        s.instructionText.setText(
          `${turnLabel(s.state.config, s.state.turn)} -- Peeked: ${peeked.name} (returned face-down)`,
        );
        s.refreshAll();
      },
    });
  }

  /**
   * Community Favour exchange (CG-0MSTOATDQ005XDET): coins ↔ reputation.
   *
   * Dispatches through the engine's `executeAction` — the same animated and
   * sounded path as other market actions. The resource deltas animate via
   * the existing HUD delta pop (`refreshAll` → `refreshHud` →
   * `animateHudValueChanges`) plus a `popTextOrIcon` exchange summary and
   * `UI_CLICK` SFX. Illegal attempts (once-per-turn spent, insufficient
   * resource) surface the standard illegal-move feedback.
   */
  public onCommunityFavourClick(direction: 'coins-to-rep' | 'rep-to-coins'): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Tutorial gating: the community-favour action is only allowed while the
    // active step requires it; any other attempt surfaces the standard
    // illegal-move feedback.
    const tutorialCheck = (s.msLifecycleManager as any)?.isTutorialActionAllowed?.('community-favour' as TutorialActionType);
    if (tutorialCheck && !tutorialCheck.allowed) {
      s.instructionText.setText(tutorialCheck.reason ?? 'Complete the highlighted step first.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    const config = s.state.config;
    const cost = direction === 'coins-to-rep' ? config.favourCoinsToRepCost : config.favourRepToCoinsRepCost;
    const resource = direction === 'coins-to-rep' ? s.state.resourceBank.coins : s.state.resourceBank.reputation;
    const resourceName = direction === 'coins-to-rep' ? 'coins' : 'reputation';

    // ── Guards (mirror the button disabled states) — surface, don't fail silently ──
    if (s.state.favourUsedThisTurn) {
      s.instructionText.setText('You have already used Community Favour this turn.');
      playIllegalFeedback(s.actionContainer, s);
      return;
    }
    if (resource < cost) {
      s.instructionText.setText(
        `Not enough ${resourceName} for Community Favour (need ${cost}, have ${resource}).`,
      );
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    s.uiPhase = 'animating';
    s.instructionText.setText('Community Favour exchange...');
    try {
      executeAction(s.state, { type: 'community-favour', direction });

      // Animated + sounded feedback: UI click SFX and a pop-up summary.
      safePlaySound(s, COMMON_SFX_KEYS.UI_CLICK);
      const reducedMotion = s.settingsPanel?.reducedMotion ?? false;
      const summary = s.add.text(
        s.layout.gameW / 2,
        s.layout.actionY - 40,
        direction === 'coins-to-rep' ? 'Community Favour: 2c → 1r' : 'Community Favour: 2r → 3c',
        {
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#ffdd88',
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0.5).setDepth(500);
      void popTextOrIcon({
        scene: s,
        target: summary,
        duration: 1400,
        riseY: 26,
        scale: 1.15,
        reducedMotion,
      });

      try {
        recordMainStreetEvent({
          type: 'action',
          turn: s.state.turn,
          action: { type: 'community-favour', direction },
          description: `Community Favour (${direction}) executed`,
        });
      } catch (_) { /* transcript disabled */ }
    } catch (e) {
      // Engine rejected the exchange — surface standard illegal feedback.
      console.error('[MS] Community Favour failed', e);
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      playIllegalFeedback(s.actionContainer, s);
      s.uiPhase = 'market';
      s.refreshAll();
      return;
    }

    s.uiPhase = 'market';
    s.refreshAll();

    // Tutorial: mark the community-favour step complete after a successful
    // exchange (mirrors how other action-gated steps advance).
    try {
      (s.msLifecycleManager as any)?.onTutorialActionComplete?.('community-favour' as TutorialActionType);
    } catch (_) { /* ignore */ }
  }

  /**
   * Deal-in animation for a market row refill (day start).
   * Presentation-only; never throws (tween targets may be re-rendered away
   * by a later refresh).
   */
  private animateMarketDealIn(row: 'market'): void {
    const s = this.scene;
    try {
      s.msAnimator.animateMarketDealIn({
        row,
        cards: s.msRenderer.getMarketRowCards(row),
      });
    } catch (_) {
      // presentation-only — ignore
    }
  }

  /**
   * Swap animation for a Discover/Research row replacement: outgoing cards
   * (captured before the refresh) fade/shrink out from their old slots while
   * the incoming row deals in. Presentation-only; never throws.
   */
  private animateMarketSwap(
    row: 'market',
    outgoingRow: Array<{ id: string; family: 'business' | 'community-space' | 'event' | 'upgrade' }>,
  ): void {
    const s = this.scene;
    try {
      s.msAnimator.animateMarketDealIn({
        row,
        cards: s.msRenderer.getMarketRowCards(row),
        outgoing: outgoingRow.map((card, i) => ({
          cardId: card.id,
          family: card.family,
          ...s.msRenderer.getMarketSlotCenter(row, i),
        })),
      });
    } catch (_) {
      // presentation-only — ignore
    }
  }

  /**
   * Synergy-formation trigger (presentation-only): after a placement that
   * changed the street grid, animates any NEWLY formed synergy pairs
   * (`MainStreetAnimator.animateSynergyFormation`) — line draw-in, card
   * pulse, "Synergy!" pop, chime. Pre-existing pairs never re-trigger on a
   * plain refresh (the diff is against the pairs captured before the
   * placement command). Never throws; reduced-motion and replay/headless
   * handling live inside the animator.
   */
  private animateNewSynergyPairs(beforePairs: SynergyPair[]): void {
    const s = this.scene;
    try {
      const afterPairs = computeSynergyPairs(s.state.streetGrid, s.state.soldSlots ?? []);
      for (const pair of diffNewSynergyPairs(beforePairs, afterPairs)) {
        s.msAnimator.animateSynergyFormation(pair);
      }
    } catch (_) {
      // presentation-only — ignore
    }
  }

  public onUpgradeCardClick(card: UpgradeCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;
    // Tutorial gating: only allow apply-upgrade if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('apply-upgrade' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const containersU = s.msRenderer?.getMarketRowCards?.();
      const cardIndexU = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const targetU = containersU?.[cardIndexU] ?? s.actionContainer ?? null;
      playIllegalFeedback(targetU, s);
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is played.
    s.tooltipManager?.hide();

    s.selectMarketCardById(card.id);

    const legality = canPurchaseUpgrade(s.state, card.id);
    if (!legality.legal) {
      const containers = s.msRenderer?.getMarketRowCards?.();
      const cardIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const target = containers?.[cardIndex] ?? s.actionContainer ?? null;
      playIllegalFeedback(target, s);
      s.instructionText.setText(`Cannot buy upgrade: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);

    // Determine which business slot this upgrade targets (first eligible match)
    const targetSlot = findTargetBusinessSlot(s.state, card);

    // Apply the upgrade directly — no intermediate choice modal.
    // The player clicked the upgrade card; that is the upgrade to apply.
    s.uiPhase = 'animating';
    s.instructionText.setText(`Applying upgrade "${card.name}"...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onUpgradeCardClick: attempting BuyUpgrade', { cardId: card.id, targetSlot, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.cards.map((c: any)=>c.id), streetBefore: s.state.streetGrid.map((slot: any)=>slot?.id ?? null) });
      let upgraded = false;
      try {
        const cmd = buyUpgradeCommand(s.state, card.id, targetSlot);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'buy-upgrade', cardId: card.id, targetSlot }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id, targetSlot }); } catch (_) {}
        s.instructionText.setText(`Applied upgrade: "${card.name}"`);
        upgraded = true;
      } catch (e) {
        console.error('[MS] BuyUpgrade failed', e);
        playIllegalFeedback(s.actionContainer, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.uiPhase = 'market';
      s.refreshAll();
      // Level-up burst on the upgraded business when the upgrade actually
      // landed (non-blocking presentation; reduced-motion / replay handling
      // lives inside the animator).
      if (upgraded && targetSlot >= 0) {
        try {
          const target = s.state.streetGrid[targetSlot] as { level?: number } | null;
          if (target) {
            s.msAnimator.animateLevelUp({ slotIndex: targetSlot, level: target.level ?? 1 });
          }
        } catch (_) {
          // presentation-only — ignore
        }
      }
      // Tutorial: mark apply-upgrade step complete if active
      (s.msLifecycleManager as any).onTutorialActionComplete?.('apply-upgrade' as TutorialActionType);
    };

    if (sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'upgrade',
        row: 'market',
        slotIndex: sourceIndex,
        destination: s.getStreetSlotCenter(targetSlot),
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  /**
   * Handles clicking on a staff card in the general market row
   * (CG-0MT3KZOUX007GQ44): hires the staff member — consuming one daily
   * action — through the same animated + SFX feedback path as the other
   * market purchases. Staff cards are never moved to the hand.
   *
   * @param card  The staff card in the market row.
   */
  public onStaffCardClick(card: StaffCard): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    // Tutorial gating: only allow hire-staff if it's the required action or
    // the tutorial is inactive.
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('hire-staff' as TutorialActionType);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const containersS = s.msRenderer?.getMarketRowCards?.();
      const cardIndexS = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const targetS = containersS?.[cardIndexS] ?? s.actionContainer ?? null;
      playIllegalFeedback(targetS, s);
      return;
    }

    // Ensure stale hover tooltip is cleared when a card is hired.
    s.tooltipManager?.hide();

    s.selectMarketCardById(card.id);

    const legality = canPurchaseStaff(s.state, card.id);
    if (!legality.legal) {
      const containers = s.msRenderer?.getMarketRowCards?.();
      const cardIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);
      const target = containers?.[cardIndex] ?? s.actionContainer ?? null;
      playIllegalFeedback(target, s);
      s.instructionText.setText(`Cannot hire: ${legality.reason ?? 'unknown'}`);
      return;
    }

    const sourceIndex = s.state.market.cards.findIndex((c: any) => c.id === card.id);

    s.uiPhase = 'animating';
    s.instructionText.setText(`Hiring "${card.name}"...`);
    s.hiddenTransferSourceCardIds.add(card.id);
    s.refreshAll();

    const afterTransfer = (): void => {
      console.debug('[MS] onStaffCardClick: attempting HireStaff', { cardId: card.id, coinsBefore: s.state.resourceBank.coins, marketBefore: s.state.market.cards.map((c: any) => c.id) });
      let hired = false;
      try {
        const cmd = hireStaffCardCommand(s.state, card.id);
        s.undoManager.execute(cmd);
        try { recordMainStreetEvent({ type: 'action', turn: s.state.turn, action: { type: 'hire-staff', cardId: card.id }, description: cmd.description }); } catch (_) {}
        try { s.gameEvents?.emit('card:placed', { cardId: card.id }); } catch (_) {}
        s.instructionText.setText(`Hired "${card.name}" (+${card.handSlotsAdded} hand slots)`);
        // Lightweight notification for the hire (popup above the hand).
        try {
          void popTextOrIcon({ scene: s, x: s.layout.handCenterX, y: s.layout.handY, label: `Hired ${card.name}` });
        } catch (_) {}
        hired = true;
      } catch (e) {
        console.error('[MS] HireStaff failed', e);
        playIllegalFeedback(s.actionContainer, s);
        s.instructionText.setText(`Error: ${(e as Error).message}`);
      }

      s.hiddenTransferSourceCardIds.delete(card.id);
      s.uiPhase = 'market';
      s.refreshAll();

      // Tutorial: mark hire-staff step complete if active.
      if (hired) {
        try {
          (s.msLifecycleManager as any).onTutorialActionComplete?.('hire-staff' as TutorialActionType);
        } catch (_) {}
      }
    };

    if (sourceIndex >= 0) {
      void s.animateTransferFromMarket({
        cardId: card.id,
        family: 'staff',
        row: 'market',
        slotIndex: sourceIndex,
        // The hired staff member joins the player's side: fly to the hand
        // region (the card is then removed from the row on refresh).
        destination: { x: s.layout.handCenterX, y: s.layout.handY + (s.layout.handCardH ?? 0) / 2 },
      }).then(afterTransfer);
    } else {
      afterTransfer();
    }
  }

  /**
   * Handles clicking on a placed business/community-space card during the
   * MarketPhase to open a sell confirmation dialog.
   *
   * @param slotIndex  Street grid slot index of the card to sell.
   */
  /**
   * Handles clicking on a business card in the player's hand during
   * the market phase. Sets pendingHandIndex and switches to
   * placing-from-hand phase so the card can be placed on the grid.
   *
   * When already in placing-from-hand phase, clicking a different
   * hand card switches the selection.
   *
   * @param index  Index into s.state.hand for the clicked card.
   */
  public onHandBusinessCardClick(index: number): void {
    const s = this.scene;
    const hand = s.state.hand ?? [];
    if (index < 0 || index >= hand.length) return;

    // Event cards are played (via onPlayHeldEvent), never placed on the street.
    if (hand[index].family === 'event') return;

    // Tutorial gating: only allow if it's the required action or tutorial is inactive
    const check = (s.msLifecycleManager as any).isTutorialActionAllowed?.('select-hand-card' as any);
    if (check && !check.allowed) {
      s.instructionText.setText(check.reason ?? 'Complete the highlighted step first.');
      const handSpriteH = s.msRenderer?.handView?.getSpriteAt?.(index) as any;
      playIllegalFeedback(handSpriteH ?? s.actionContainer, s);
      return;
    }

    // When already in placing-from-hand, switching selection is allowed
    // (preserving existing customClickFn behavior)
    if (s.uiPhase === 'placing-from-hand' && s.pendingHandIndex !== null) {
      s.pendingHandIndex = index;
      // Placing is free only if the selected card is the one just moved from
      // the market this turn (CG-0MSXIQIPJ000NDTL); any other hand card costs
      // an action (pendingHandJustMoved derived from justMovedHandCardId).
      s.pendingHandJustMoved = s.justMovedHandCardId === hand[index]?.id;
      const cardName = hand[index]?.name ?? 'card';
      s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
      s.refreshAll();
      // Update the selection highlight via the renderer
      if (s.msRenderer && typeof s.msRenderer.updateBusinessHandSelection === 'function') {
        s.msRenderer.updateBusinessHandSelection(index);
      }
      return;
    }

    // Only respond during market phase
    if (s.uiPhase !== 'market') return;

    // Ensure stale hover tooltip is cleared
    s.tooltipManager?.hide();

    s.pendingHandIndex = index;
    // Placing is free only if the selected card is the one just moved from
    // the market this turn (CG-0MSXIQIPJ000NDTL); any other hand card costs
    // an action.
    s.pendingHandJustMoved = s.justMovedHandCardId === hand[index]?.id;
    s.uiPhase = 'placing-from-hand';
    const cardName = hand[index]?.name ?? 'card';
    s.instructionText.setText(`Click an empty slot to place "${cardName}"`);
    s.refreshAll();

    // Update the selection highlight
    if (s.msRenderer && typeof s.msRenderer.updateBusinessHandSelection === 'function') {
      s.msRenderer.updateBusinessHandSelection(index);
    }

    // Tutorial: mark select-hand-card step complete if active
    try {
      (s.msLifecycleManager as any).onTutorialActionComplete?.('select-hand-card' as any);
    } catch (_) { /* ignore */ }
  }

  public onSellCard(slotIndex: number): void {
    const s = this.scene;
    if (s.uiPhase !== 'market') return;

    const card = s.state.streetGrid[slotIndex];
    if (!card) return;

    // Check if already sold
    const soldSlots: boolean[] = s.state.soldSlots ?? [];
    if (soldSlots[slotIndex]) return;

    // Check legality
    const legality = canSellBusiness(s.state, slotIndex, false);
    if (!legality.legal) {
      s.instructionText.setText(`Cannot sell: ${legality.reason ?? 'unknown'}`);
      playIllegalFeedback(s.actionContainer, s);
      return;
    }

    // Calculate refund for display using the new formula (CG-0MT5XO7DI0066QCT)
    const breakdown = computeSellRefund(s.state, card, slotIndex);
    const refund = breakdown.totalRefund;

    // Build card info for dialog with breakdown
    const isCommunitySpace = card.family === 'community-space';
    const cardLabel = isCommunitySpace ? 'Community Space' : 'Business';
    const info = `${cardLabel}: ${card.name}\n` +
      `Purchase: €${card.cost}\n` +
      `Upgrades: €${(card as any).totalUpgradeCost ?? 0}\n` +
      `Refund: €${refund}\n\n` +
      `  Base: €${breakdown.baseRefund} (1.5× purchase + upgrades)\n` +
      `  Synergy income: +€${breakdown.synergyIncomeComponent}\n` +
      `  Synergy reputation: +€${breakdown.synergyRepComponent}\n\n` +
      `Sell this card? It will remain on the grid but produce no further income.`;

    // Show sell confirmation via overlay
    s.showSellConfirmation(slotIndex, card.name, refund, info);
  }
}
