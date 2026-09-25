/**
 * Main Street: Turn Flow
 *
 * Day start, end-turn presentation, game-over, event-choice dialogs, held
 * events, and undo/redo.
 *
 * @module
 */

import { playIllegalFeedback } from './MainStreetTurnControllerUtils';

import { TranscriptStore, autoSaveTranscript } from '@core-engine/transcript';
import type { EventCard } from '../MainStreetCards';
import { playEventCommand, resolveEventChoiceCommand } from '../MainStreetCommands';
import { applyEndOfTurnDeltas, executeWeekStart, finishDeferredEndOfTurn, finishDeferredTurnClosing, processEndOfTurn } from '../MainStreetEngine';
import type { TurnResult } from '../MainStreetEngine';
import { turnLabel } from '../MainStreetFormatting';
import { addLog } from '../MainStreetState';
import { finalizeMainStreetTranscript, recordMainStreetEvent } from '../MainStreetTranscript';
import type { TutorialActionType } from '../TutorialFlow';
import { ensureTutorialMarketForUpcomingSteps } from '../TutorialScenario';
import { BrowserLocalStorageAdapter, hasSeenBankingHint, loadTutorialState, markBankingHintShown, saveTutorialState } from '../TutorialState';
import type { MainStreetTurnControllerContext } from './MainStreetTurnControllerContext';
import { celebrateChallengeIds } from './MainStreetChallengeCelebration';

export function startTurnPhase(tcCtx: MainStreetTurnControllerContext, skipMarketRefill: boolean = false, suppressWeekBanner: boolean = false): void {
    // A new day begins: reset the per-turn celebrated-challenge set so this
    // turn can celebrate its own completions (CG-0MU8MZBV4007HF1Q).
    try { tcCtx.scene.celebratedChallengeIds?.clear(); } catch (_) { /* ignore */ }

    const s = tcCtx.scene;
    // Execute WeekStart (optionally refills market, transitions to MarketPhase)
    executeWeekStart(s.state, skipMarketRefill);
    // Staff applicant walk-on (CG-0MSTOATDU006UGAX): if a pending applicant
    // arrived at WeekStart the player must resolve it (hire or decline).
    s.pendingApplicant = (s.state as any).pendingApplicant ?? null;
    s.uiPhase = (s.pendingApplicant != null) ? 'applicant' : 'market';
    // A new day means no card is "just moved" anymore — any hand card
    // selected now costs an action to place (CG-0MSXIQIPJ000NDTL).
    s.justMovedHandCardId = null;

    // Tutorial: the single-row market only holds 3 cards, so force the
    // upcoming steps' required purchase targets into the line (days 2+).
    const weekStartTut = (s as any).tutorialController as any;
    if (weekStartTut?.isActive) {
      try {
        ensureTutorialMarketForUpcomingSteps(s.state, weekStartTut);
      } catch (_) {
        // robustness — never block day start on scenario bookkeeping
      }
    }

    // Reset hint state for the new turn
    s.hintUsedThisTurn = false;
    s.hintedCardId = null;
    s.hintedSlotIndex = null;

    s.refreshAll();

    // Day transition banner: non-interactive "Week W · Year Y" reveal at the board
    // centre (skipped under reduced motion / replay — handled inside the
    // animator). Skipped while the tutorial is active (its step overlays
    // carry the guidance), on checkpoint resume (skipMarketRefill — the
    // same day continues, so it is not a new-day transition), or when
    // suppressed at boot (suppressWeekBanner — deferred until the player
    // commits to playing).
    const tutController = (s as any).tutorialController as { isActive?: boolean } | undefined;
    if (!skipMarketRefill && !suppressWeekBanner && !tutController?.isActive) {
      try { s.msAnimator.animateWeekBanner({ turn: s.state.turn, week: s.state.week, year: s.state.year }); } catch (_) { /* presentation-only — ignore */ }
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
            tcCtx.animateMarketDealIn('market');
          }
        } catch {
          // scene may be shutting down
        }
      });

    s.instructionText.setText(
      `${turnLabel(s.state.config, s.state.turn)} -- Buy cards from the market or End Turn`,
    );
  
}

export function endTurn(tcCtx: MainStreetTurnControllerContext): void {

    const s = tcCtx.scene;
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

    // Process end-of-turn phases (events, income, night, end check)
    // Applicant auto-decline at end-of-turn (CG-0MSTOATDU006UGAX AC6):
    // walk the unresolved card off to the right and clear the scene state.
    // Doing it before processEndOfTurn's own decline guard covers both the
    // immediate scene visuals (animated departure) and the engine fallback.
    try {
      if (s.pendingApplicant != null) {
        const cardW = (s as any).layout?.handCardW ?? 120;
        const cardH = (s as any).layout?.handCardH ?? 170;
        const overlay = (s as any).applicantOverlayContainer as Phaser.GameObjects.Container | null;
        const reducedMotion = (s as any).settingsPanel?.reducedMotion;
        // Clear the scene-side applicant immediately; `processEndOfTurn`
        // clears the engine-side `state.pendingApplicant`.
        s.pendingApplicant = null;
        if (overlay && s.msAnimator) {
          // Guard the overlay from the refreshApplicant teardown while the
          // exit tween plays, then destroy it on completion.
          (s as any).applicantAnimating = true;
          s.msAnimator.animateApplicantWalkOff(overlay, cardW, cardH, reducedMotion, () => {
            (s as any).applicantAnimating = false;
            (s as any).clearApplicantOverlay?.();
          });
        } else {
          (s as any).clearApplicantOverlay?.();
        }
      }
    } catch { /* applicant cleanup never blocks end-turn */ }

    let result: TurnResult;
    // ── Deferred HUD window (CG-0MTR72P14000VO6Q) ─────────────
    // Capture the pre-animation resource values so the HUD keeps showing
    // them while the income/incident animations play; the deltas land only
    // when the closing presentation completes. Reset the exactly-once
    // application guard (set by the income/incident animation completions
    // or the closing finalizer).
    s.previousCoins = s.state.resourceBank.coins;
    s.previousReputation = s.state.resourceBank.reputation;
    s.endOfTurnDeltasApplied = false;
    try {
      // Deferred-mutation mode: normal interactive play defers the resource
      // application until the end-of-turn animations complete. Tutorial and
      // reduced-motion keep the legacy immediate path (no animation-window
      // pacing regressions); replay never mutates state.
      const reducedMotion = (s as any).settingsPanel?.reducedMotion === true;
      const inTutorialBefore =
        (s as { tutorialController?: { isActive?: boolean } }).tutorialController?.isActive === true;
      const deferred = !inTutorialBefore && !reducedMotion && !s.replayMode;
      result = processEndOfTurn(
        s.state,
        deferred ? { deferResourceApplication: true } : undefined,
      );
    } catch (e) {
      // Defensive: if processEndOfTurn throws (e.g. phase mismatch from
      // async state replacement), recover gracefully instead of hanging
      // with a permanent "Processing end of turn..." message.
      console.error('[MainStreet] endTurn failed:', e);
      s.uiPhase = 'market';
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      s.refreshAll();
      return;
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
    // tutorial (startTurnPhase); the full phased show runs in normal play.
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
        // Pass the pending deltas so the collection completion applies them
        // exactly once (CG-0MTR72P14000VO6Q); legacy mode passes nothing.
        s.msAnimator.animateIncomePhases(
          phaseBreakdown,
          result.requiresDeferredClosing === true ? { pendingDeltas: result } : undefined,
        );
      }
    } catch (_) {
      // Presentation-only: never block the turn on animation failures.
      s.incomeCollectionActive = false;
    }

    // Save checkpoint after each completed turn (fire-and-forget). In the
    // deferred-mutation path (CG-0MTR72P14000VO6Q) the closing tail (day
    // advance) runs only after the animations complete — persisting here
    // would capture a mid-animation state with un-applied deltas, so the
    // checkpoint is written in finalizeTurn instead (after the closing).
    if (result.requiresDeferredClosing !== true) {
      try { tcCtx.onSaveCheckpoint?.(); } catch (e) { /* ignore */ }
    }

    // Clear undo stack on end-of-turn (per acceptance criteria)
    try { s.undoManager.clear(); } catch (e) { /* ignore */ }
    // Undo/redo are per-turn only; after the clear neither action is
    // available, so both HUD buttons must show their disabled state
    // (CG-0MT5Y4DL8000AKKZ).
    s.refreshUndoRedoButtons(false, false);

    // ── Challenge Celebration VFX & Sound ────────────────────────
    // Celebrate only challenges not already celebrated mid-turn: the
    // per-action evaluation fires the celebration as soon as the completing
    // action lands (CG-0MU8MZBV4007HF1Q). celebrateChallengeIds dedupes
    // against `s.celebratedChallengeIds`, so the end-of-turn pass only fires
    // for closing-phase (Income / Incident) completions and never for an
    // already-celebrated mid-turn completion.
    if (result.newlyCompletedChallenges.length > 0) {
      celebrateChallengeIds(s, result.newlyCompletedChallenges);
    }

    // Brief delay then show result / advance
    tcCtx.finishTurnPresentation(result, pendingBankingHint);
  
}

export function finishTurnPresentation(tcCtx: MainStreetTurnControllerContext, 
    result: TurnResult,
    pendingBankingHint: boolean,
  ): void {

    const s = tcCtx.scene;
    if (result.choicePending) {
      // Deferred mode: the income deltas must land when the turn pauses (the
      // Accept/Reject dialog blocks the closing). Apply now if the income
      // animation's completion hasn't already (idempotent guard) so the
      // paused turn's income matches the legacy UX (income lands at pause).
      if (result.requiresDeferredClosing === true && !s.endOfTurnDeltasApplied) {
        try {
          applyEndOfTurnDeltas(s.state, result);
          s.endOfTurnDeltasApplied = true;
        } catch { /* presentation-only */ }
      }
      tcCtx.presentEventChoiceDialog();
      return;
    }

    // Deferred-mutation mode (CG-0MTR72P14000VO6Q): when the result requires
    // the deferred closing, `gameResult` / `finalScore` are pre-turn values —
    // the game-over evaluation happens in finalizeTurn AFTER the animations
    // complete and the deltas land (AC4: no banner mid-animation). The legacy
    // immediate branch below is for reduced-motion / tutorial / replay and the
    // dual-choice resolution path (already-final results).
    const deferred = result.requiresDeferredClosing === true;
    if (result.gameResult !== 'playing' && !deferred) {
      tcCtx.handleGameOver(result);
      return;
    }

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

    // Tutorial: mark end-turn step complete if active. Unchanged — the
    // step completes when the turn action resolves, not when the
    // closing presentation finishes.
    (s.msLifecycleManager as any).onTutorialActionComplete?.('end-turn' as TutorialActionType);

    // ── Closing presentation → day start ─────────────────────────
    // Advance the day once the closing presentation is done: present
    // the banking hint (if any), then defer to the phased income show
    // (bounded) or the normal ~800ms schedule.
    const advanceTurn = (): void => {
      // ── Banking hint presentation (CG-0MT3JK16W006A66P) ─────
      // Non-blocking HUD-highlighting overlay, once per save. Fires
      // after the turn's gated step has advanced so it does not
      // compete with the step's own overlay. Never blocks the day
      // start.
      if (pendingBankingHint) {
        try { (s as any).tutorialOverlay?.showBankingHint?.(); } catch { /* presentation-only */ }
      }
      if (s.incomeCollectionActive) {
        // Bounded deferral: start the next week once the choreography
        // completes (AC7 collect clears the flag); a safety cap forces
        // the day start even if the flag is somehow never cleared, so
        // end-of-turn can never hang the game (AC5).
        const startAt = s.time.now + 16_000;
        const startAfterIncomeShow = (): void => {
          if (s.incomeCollectionActive && s.time.now < startAt) {
            s.time.delayedCall(250, startAfterIncomeShow);
          } else {
            s.incomeCollectionActive = false;
            finalizeTurn();
          }
        };
        startAfterIncomeShow();
      } else {
        s.time.delayedCall(800, () => finalizeTurn());
      }
    };

    // ── Deferred closing tail (CG-0MTR72P14000VO6Q) ────────────
    // Runs only after the closing animations complete (income collection
    // and/or incident reveal): applies any remaining deltas (idempotent
    // guard), runs the deferred closing (EndCheck → next week / game-over
    // evaluation), clears the deferred HUD window so refreshHud shows the
    // post-delta values, and either shows the game-over overlay or starts
    // the next week. The legacy path (deferred === false) just starts the
    // day — the closing already ran inside processEndOfTurn.
    const finalizeTurn = (): void => {
      if (deferred) {
        if (!s.endOfTurnDeltasApplied) {
          try {
            applyEndOfTurnDeltas(s.state, result);
            s.endOfTurnDeltasApplied = true;
          } catch { /* presentation-only */ }
        }
        let finalResult: TurnResult;
        try {
          finalResult = finishDeferredTurnClosing(s.state, result);
        } catch (e) {
          // Defensive: never hang the turn on a closing failure.
          console.error('[MainStreet] deferred closing failed:', e);
          finalResult = result;
        }
        // Close the deferred HUD window so refreshHud renders the final
        // post-delta values.
        s.previousCoins = null;
        s.previousReputation = null;
        s.incidentRevealActive = false;
        // Render the final post-delta state under the upcoming overlay
        // (startTurnPhase refreshes internally for the continuing path).
        try { s.refreshAll(); } catch { /* presentation-only */ }
        if (finalResult.gameResult !== 'playing') {
          tcCtx.handleGameOver(finalResult);
          return;
        }
        // Persist the checkpoint now that the turn has fully closed (the
        // deferred end-of-turn path skips the earlier endTurn save so the
        // checkpoint always reflects a complete, applied turn).
        try { tcCtx.onSaveCheckpoint?.(); } catch (e) { /* ignore */ }
        tcCtx.startTurnPhase();
      } else {
        tcCtx.startTurnPhase();
      }
    };

    // Incident reveal presentation (CG-0MTW18KFK000MM3I): the resolved
    // incident card flies from the Upcoming panel to board centre, flips
    // face-up and stays visible for 4 seconds so the player can read the
    // incident before the turn advances. The reveal **blocks** the day
    // start until the hold completes (then the normal advance applies).
    //
    // Audit (CG-0MTR766U6003RZ88): phases must be distinct and not overlap.
    // If income collection is still running, wait for it to complete before
    // starting the incident reveal.
    //
    // Tutorial exemption: the tutorial keeps its window-safe step pacing,
    // so the reveal (and its 4-second hold) is skipped — the same
    // precedent as the phased income show and the day banner being
    // skipped during the tutorial.
    //
    // If there is no incident, the entire animation is skipped — no
    // delay, no state mutation — and the day advances as before.
    const inTutorial =
      (s as { tutorialController?: { isActive?: boolean } }).tutorialController?.isActive === true;
    if (result.incident && !inTutorial) {
      try {
        // If income collection is active, wait for it to complete before
        // starting the incident reveal (ensures distinct, non-overlapping phases).
        if (s.incomeCollectionActive) {
          const startAfterIncome = (): void => {
            if (s.incomeCollectionActive) {
              s.time.delayedCall(250, startAfterIncome);
            } else {
              const incident = result.incident;
              if (!incident) {
                advanceTurn();
                return;
              }
              s.msAnimator.animateIncidentReveal({
                cardId: incident.id,
                incidentName: incident.name,
                coinChange: result.incidentCoinChange,
                repChange: result.incidentRepChange,
                from: s.msRenderer.getFrontIncidentCardCenter(),
                onComplete: advanceTurn,
                pendingDeltas: deferred ? result : undefined,
              });
            }
          };
          startAfterIncome();
        } else {
          const incident = result.incident;
          if (!incident) {
            advanceTurn();
            return;
          }
          s.msAnimator.animateIncidentReveal({
            cardId: incident.id,
            incidentName: incident.name,
            coinChange: result.incidentCoinChange,
            repChange: result.incidentRepChange,
            from: s.msRenderer.getFrontIncidentCardCenter(),
            onComplete: advanceTurn,
            pendingDeltas: deferred ? result : undefined,
          });
        }
      } catch (_) {
        // presentation-only — never let the reveal hang the turn.
        advanceTurn();
      }
    } else {
      advanceTurn();
    }
  
}

export function handleGameOver(tcCtx: MainStreetTurnControllerContext, result: TurnResult): void {

    const s = tcCtx.scene;
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
    try { tcCtx.onGameEnd?.(); } catch (e) { /* ignore */ }
    s.updateCampaignProgress().then(() => {
      const tiersAfter = s.campaign
        ? s.campaign.unlockedTiers
        : [];
      const newlyUnlockedTiers = tiersAfter.filter(
        (t: any) => !tiersBefore.includes(t),
      );
      s.showGameOverOverlay(result, newlyUnlockedTiers);
    });
  
}

export function presentEventChoiceDialog(tcCtx: MainStreetTurnControllerContext): void {

    const s = tcCtx.scene;
    const pending = s.state.pendingEventChoice;
    if (!pending || pending.resolved) return; // nothing to decide

    // Tutorial regression guard (CG-0MTT7FO7I009295E AC2): the tutorial
    // scenario deck excludes choice events by construction, but if one were
    // ever drawn in tutorial mode, auto-accept so the tutorial never hangs
    // waiting for dialog input (no teaching step exists — producer decision
    // 2026-09-08 Q2).
    const tutController = (s as { tutorialController?: { isActive?: boolean } }).tutorialController;
    if (tutController?.isActive) {
      tcCtx.onEventChoice('accept');
      return;
    }

    const show = (): void => {
      const overlay = s.msOverlayManager as unknown as {
        showEventChoiceDialog?: (e: EventCard, onAccept: () => void, onReject: () => void) => void;
      };
      if (overlay && typeof overlay.showEventChoiceDialog === 'function') {
        overlay.showEventChoiceDialog(
          pending.event,
          () => tcCtx.onEventChoice('accept'),
          () => tcCtx.onEventChoice('reject'),
        );
      } else {
        // Defensive fallback: no dialog support — auto-accept so a pending
        // choice can never hang the game loop (regression guard).
        tcCtx.onEventChoice('accept');
      }
    };

    if (s.incomeCollectionActive) {
      // Bounded deferral: present once the income choreography completes; a
      // safety cap forces the dialog even if the flag is never cleared, so a
      // pending choice can never hang the game (AC5).
      const startAt = s.time.now + 16_000;
      const waitForIncome = (): void => {
        if (s.incomeCollectionActive && s.time.now < startAt) {
          s.time.delayedCall(250, waitForIncome);
        } else {
          s.incomeCollectionActive = false;
          show();
        }
      };
      waitForIncome();
    } else {
      show();
    }
  
}

export function onEventChoice(tcCtx: MainStreetTurnControllerContext, option: 'accept' | 'reject'): void {

    const s = tcCtx.scene;
    const pending = s.state.pendingEventChoice;
    if (!pending || pending.resolved) return;
    const event = pending.event;
    try {
      // Resolve via the snapshot-based undoable command so the choice can be
      // undone back to the unresolved pending state (AC10
      // CG-0MTSHG8RP008E128 — escalation removed, resources restored). Runs
      // through the undo manager when one is present.
      const coinsBefore = s.state.resourceBank.coins;
      const repBefore = s.state.resourceBank.reputation;
      const deckBefore = s.state.incidentDeck.length;
      const choiceCmd = resolveEventChoiceCommand(s.state, option);
      if (s.undoManager) s.undoManager.execute(choiceCmd);
      else choiceCmd.execute();
      // Re-derive the consequence from the state diff (the command hides the
      // engine resolution result): resource deltas + the pushed escalation.
      const coinChange = s.state.resourceBank.coins - coinsBefore;
      const repChange = s.state.resourceBank.reputation - repBefore;
      const pushedCard =
        s.state.incidentDeck.length === deckBefore + 1
          ? s.state.incidentDeck[s.state.incidentDeck.length - 1]
          : null;
      void pushedCard;
      s.instructionText.setText(
        `${event.name}: consequence ${option === 'accept' ? 'accepted' : 'refused'}.`,
      );
      // Complete the deferred closing (EndCheck → next week) and present it.
      const finalResult = finishDeferredEndOfTurn(s.state);
      // The turn is now closed — the undo stack is cleared (mirrors the
      // normal end-of-turn clear) so a choice cannot be undone after the day
      // advanced (undo would resurrect the pending choice mid-market).
      try { s.undoManager?.clear(); } catch (_) { /* ignore */ }
      // Stacks are empty again — disable both HUD buttons
      // (CG-0MT5Y4DL8000AKKZ).
      s.refreshUndoRedoButtons(false, false);
      // Visual consequence for resource deltas (accepted effect), mirroring
      // the standard incident reveal. Reject applies nothing (deltas 0) — the
      // instruction text above is the only feedback. The reveal blocks the
      // day start until its 4-second hold completes (CG-0MTW18KFK000MM3I).
      const present = (): void => tcCtx.finishTurnPresentation(finalResult, false);
      if (coinChange !== 0 || repChange !== 0) {
        try {
          s.msAnimator.animateIncidentReveal({
            cardId: event.id,
            incidentName: event.name,
            coinChange,
            repChange,
            from: s.msRenderer.getFrontIncidentCardCenter(),
            onComplete: present,
          });
        } catch (_) {
          // presentation-only — never let the reveal hang the turn.
          present();
        }
      } else {
        present();
      }
    } catch (e) {
      // Resolution failed (should not happen in normal flow): recover by
      // returning to the market instead of hanging on a dead dialog.
      console.error('[EventChoice] resolve failed:', e);
      s.uiPhase = 'market';
      s.instructionText.setText(`Error: ${(e as Error).message}`);
      s.refreshAll();
    }
  
}

export function onPlayHeldEvent(tcCtx: MainStreetTurnControllerContext, handIndex?: number): void {

    const s = tcCtx.scene;
    // Allow both the one-click market path and the select-then-act
    // `event-selected` phase (CG-0MUEQ1BF000770B3).
    if (s.uiPhase !== 'market' && s.uiPhase !== 'event-selected') return;

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
      s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
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
      // Select-then-act: clear the event selection once the play succeeds.
      s.pendingHandIndex = null;
      s.uiPhase = 'market';
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

export function performUndo(tcCtx: MainStreetTurnControllerContext): void {

    const s = tcCtx.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canUndo()) return;

    const doUndo = (): void => {
      try {
        const cmd = s.undoManager.undo();
        s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
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
    };

    // Undo-challenge warning (CG-0MU37CKRR008252I, producer decision Q1=A):
    // if the command about to be undone completed one or more challenges,
    // warn the player before the completions are revoked. "Keep Completed"
    // aborts the undo entirely (no state change); "Undo Anyway" proceeds.
    const pending = typeof s.undoManager.peekUndo === 'function' ? s.undoManager.peekUndo() : undefined;
    const completedIds: string[] = pending?.completedChallengeIds ?? [];
    if (completedIds.length > 0 && typeof s.showUndoChallengeWarningDialog === 'function') {
      const titles = completedIds.map((id: string) => {
        const active = (s.state.activeChallenges ?? []).find(
          (ac: { challenge: { id: string } }) => ac.challenge.id === id,
        );
        return active?.challenge.title ?? id;
      });
      s.showUndoChallengeWarningDialog(titles, doUndo, () => { /* Keep Completed */ });
      return;
    }

    doUndo();
  
}

export function performRedo(tcCtx: MainStreetTurnControllerContext): void {

    const s = tcCtx.scene;
    if (s.uiPhase === 'animating' || s.uiPhase === 'game-over') return;
    if (!s.undoManager || !s.undoManager.canRedo()) return;

    try {
      const cmd = s.undoManager.redo();
      s.refreshUndoRedoButtons(s.undoManager.canUndo(), s.undoManager.canRedo());
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
