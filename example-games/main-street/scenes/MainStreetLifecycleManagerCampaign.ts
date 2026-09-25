/**
 * Main Street: Campaign, Save/Load, and Stats
 *
 * Campaign setup/progress, stats, board-state load, CSV-mismatch
 * regeneration, and checkpoint resume.
 *
 * Import graph: depends only on `MainStreetLifecycleManagerContext` (type).
 *
 * @module
 */

import { createDefaultResumeOverlay } from '@core-engine';
import { CSV_CHECKSUM } from '../MainStreetCards';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import { createDefaultCampaignProgress, loadCampaignProgress, updateCampaignAfterRun } from '../MainStreetSaveLoad';
import { deserializeMainStreetState, setupMainStreetGame } from '../MainStreetState';
import { BrowserStatsStorageAdapter, loadStats, saveStats, updateStatsAfterRun } from '../StatsDomain';
import type { TutorialVisibilityOptions } from '../TutorialState';
import type { MainStreetLifecycleManagerContext } from './MainStreetLifecycleManagerContext';

export function loadCampaignAndSetup(lmCtx: MainStreetLifecycleManagerContext): void {

    const s = lmCtx.scene;
    // Synchronously set up with defaults first (so UI can render immediately)
    s.campaign = createDefaultCampaignProgress();
    // If a persisted difficulty exists in the SettingsPanel, prefer that for new games.
    try {
      const persisted = (s.settingsPanel?.selectedDifficulty) as unknown as string | undefined;
      if (persisted && DIFFICULTY_NAMES.includes(persisted as any)) {
        s.selectedDifficulty = persisted as any;
      }
    } catch {
      // ignore
    }

    s.state = setupMainStreetGame({
      difficulty: s.selectedDifficulty,
      unlockedCardIds: s.campaign.unlockedCardIds,
    });

    // Early regeneration: ensure card SVG sources are fresh from the parsed CSV
    // data before any async SVG prewarming occurs. This eliminates the race
    // condition where texture prewarming rasterizes stale static SVGs before
    // the CSV mismatch check has a chance to run (see CG-0MRH36Z6800065JC).
    // Texture cache invalidation is handled atomically inside
    // prewarmVisibleCardTextures() — per-key remove-and-rasterize.
    try {
      s.msSvgTextureManager?.regenerateSvgSourcesFromCsv();
    } catch (_) {
      // Non-fatal: scene continues with fetched SVGs if regeneration fails
    }

    // Re-apply regenerated SVGs after all SVG fetches complete. Individual
    // fetch() callbacks from loadCardSvgSources() may overwrite the freshly
    // regenerated SVGs in cardSvgSources if they resolve after the synchronous
    // regeneration above. By chaining onto cardSvgLoadPromise, we ensure fresh
    // CSV-based SVGs are present before prewarmVisibleCardTextures() runs.
    if (s.cardSvgLoadPromise) {
      s.cardSvgLoadPromise = s.cardSvgLoadPromise.then(() => {
        try {
          s.msSvgTextureManager?.regenerateSvgSourcesFromCsv();
        } catch (_) {
          // Non-fatal: scene continues with fetched SVGs if re-generation fails
        }
      });
    }

    // Determine tutorial visibility options from scene state
    const tutorialOpts: TutorialVisibilityOptions = {
      replayMode: s.replayMode === true,
      forceShowOffer: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tutorial') === '1',
    };

    // Async: attempt to load saved campaign and re-setup if found
    if (s.saveStore) {
      // Store the load promise on the scene so other code can wait if needed
      (s as any)._campaignLoadPromise = loadCampaignProgress(s.saveStore).then((saved: any) => {
        if (saved) {
          s.campaign = saved;
          // Re-setup with the loaded campaign's unlocked cards
          s.state = setupMainStreetGame({
            difficulty: s.selectedDifficulty,
            unlockedCardIds: s.campaign.unlockedCardIds,
          });
          // Must call startTurnPhase() (not just refreshAll) so the new
          // state transitions from WeekStart -> MarketPhase and the UI
          // phase is synchronised.  Without this, the engine stays in
          // WeekStart while the UI shows market controls, blocking all
          // player actions and causing End Turn to hang.
          // Suppress the day-banner — it was deferred at boot and should
          // only fire after the player commits (skip/start tutorial).
          // Guard (CG-0MTDEETZE0056JS5): the campaign load resolves
          // asynchronously and can land AFTER the player has already ended
          // the boot day — a fast end-turn leaves the engine in WeekStart
          // for turn 2, which a late boot startTurnPhase would consume and
          // skip (phase -> MarketPhase without the day flow). Only start
          // the day while the boot state is still pending (turn 1).
          if (s.state.phase === 'WeekStart' && s.state.turn === 1) {
            try { s.startTurnPhase(false, true); } catch (_) { /* ignore */ }
          }
        } else {
          // Even with no saved campaign, startTurnPhase() must be called so
          // the game transitions from WeekStart -> MarketPhase and the market
          // is populated. Without this the tutorial offer modal shows but
          // the market is empty, making interactive tutorial steps impossible.
          // Suppress the day-banner — same reason as above.
          // Same turn-1 guard as the saved-campaign branch above
          // (CG-0MTDEETZE0056JS5): never let a late boot startTurnPhase
          // consume a live turn's WeekStart phase.
          if (s.state.phase === 'WeekStart' && s.state.turn === 1) {
            try { s.startTurnPhase(false, true); } catch (_) { /* ignore */ }
          }
        }
        // Check for a saved run checkpoint. If one exists, the resume overlay
        // takes priority over the tutorial offer modal.
        try {
          s.checkForSavedCheckpoint(tutorialOpts);
        } catch (e) {
          // If checkpoint check fails, fall through to tutorial offer / deferred banner
          try {
            const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
            lmCtx.showTutorialOfferOrDeferredBanner(tutorialOpts, legacySeen);
          } catch (_) { /* ignore */ }
        }
        return saved;
      }).catch(() => {
        // If load fails, continue with defaults and show offer modal / deferred banner
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          lmCtx.showTutorialOfferOrDeferredBanner(tutorialOpts, legacySeen);
        } catch (e) { console.error('[MainStreet] tutorial offer fallback failed', e); }
        return null;
      });
    } else {
      // No saveStore: show tutorial offer modal / deferred banner (best-effort)
      try {
        const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
        lmCtx.showTutorialOfferOrDeferredBanner(tutorialOpts, legacySeen);
      } catch (_) { /* ignore */ }
    }
  
}

export function updateCampaignProgress(lmCtx: MainStreetLifecycleManagerContext): Promise<void> {

    const s = lmCtx.scene;
    if (!s.campaign || !s.saveStore) return Promise.resolve();
    return updateCampaignAfterRun(s.campaign, s.state, s.saveStore)
      .then(() => {})  // discard the returned campaign (already mutated in place)
      .catch(() => {
        // Silently ignore save failures -- campaign will be retried next run
      });
  
}

export async function updateStats(lmCtx: MainStreetLifecycleManagerContext, 
    gameResult: 'win' | 'loss',
    finalScore: number,
  ): Promise<void> {

    const s = lmCtx.scene;
    if (s.replayMode) return;

    try {
      const adapter = new BrowserStatsStorageAdapter();
      const current = loadStats(adapter);
      const updated = updateStatsAfterRun(current, gameResult === 'win', finalScore);
      await saveStats(adapter, updated);
    } catch {
      // Silently ignore stats persistence failures — non-critical
    }
  
}

export function loadBoardState(lmCtx: MainStreetLifecycleManagerContext, state: any): void {

    const s = lmCtx.scene;
    if (!s.replayMode) {
      throw new Error('loadBoardState() is only available in replay mode (?mode=replay)');
    }

    try {
      // If the payload looks like a full serialized state, use the deserializer
      if (state && state.config && typeof state.turn === 'number') {
        s.state = deserializeMainStreetState(state);
      } else if (state && state.initialState) {
        // Some transcripts embed initialState under a wrapper
        s.state = deserializeMainStreetState(state.initialState as any);
      } else if (state && state.seed) {
        // Minimal snapshot: create a fresh game from the seed
        s.state = setupMainStreetGame({ seed: state.seed, difficulty: s.selectedDifficulty });
        if (typeof state.turn === 'number') {
          s.state.turn = state.turn;
        }
      } else {
        // Fallback: generate a default game
        s.state = setupMainStreetGame({ difficulty: s.selectedDifficulty });
      }
    } catch (e) {
      // On error, fall back to a default setup so replay can continue
      console.error('[MS] loadBoardState deserialise failed:', e);
      s.state = setupMainStreetGame({ difficulty: s.selectedDifficulty });
    }

    // Refresh visuals to reflect the injected state
    s.refreshAll();

    // If a stepIndex or turn was provided, use it; otherwise use current turn
    const step = state && (state.stepIndex ?? state.turn ?? null);
    const stepIdx = typeof step === 'number' ? step : s.state.turn;

    // Signal board is visually stable
    s.emitStateSettled(stepIdx, 'playing');
  
}

export async function checkForCsvMismatchAndRegenerate(lmCtx: MainStreetLifecycleManagerContext, savedChecksum?: string): Promise<void> {

    const s = lmCtx.scene;
    let mismatch = false;
    let source = 'none';

    if (savedChecksum && savedChecksum.length > 0) {
      // Load game scenario: compare against saved state's csvChecksum
      if (savedChecksum !== CSV_CHECKSUM) {
        mismatch = true;
        source = 'load';
      }
    } else {
      // New game scenario: fetch checksum file from SVG output directory
      try {
        const resp = await fetch('assets/games/main-street/svg/cards/csv-checksum.json');
        if (resp.ok) {
          const data = await resp.json();
          if (data.checksum !== CSV_CHECKSUM) {
            mismatch = true;
            source = 'new-game';
          }
        } else {
          // No checksum file — assume SVGs need regeneration
          mismatch = true;
          source = 'no-checksum-file';
        }
      } catch {
        // Fetch failed — assume SVGs are up-to-date (fallback to static SVGs)
        console.warn('[MainStreetLifecycleManager] Could not fetch csv-checksum.json');
      }
    }

    if (mismatch) {
      console.info(`[MainStreetLifecycleManager] CSV mismatch detected (${source}), regenerating SVGs in-memory`);
      // Only update SVG sources — no texture clearing. Texture invalidation
      // is handled atomically by prewarmVisibleCardTextures() per-key.
      s.msSvgTextureManager.regenerateSvgSourcesFromCsv();
    }
  
}

export function checkForSavedCheckpoint(lmCtx: MainStreetLifecycleManagerContext, tutorialOpts: TutorialVisibilityOptions): void {

    const s = lmCtx.scene;
    if (!s.checkpointManager) return;

    s.checkpointManager.checkAndResume(
      // No checkpoint — show tutorial offer / play deferred banner
      () => {
        try {
          const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
          lmCtx.showTutorialOfferOrDeferredBanner(tutorialOpts, legacySeen);
        } catch (_) { /* ignore */ }
        // New game: check if static SVGs match current CSV
        lmCtx.checkForCsvMismatchAndRegenerate().catch(() => {});
      },
      // Resume from checkpoint — replace state and rebuild UI
      (savedState: any) => {
        const savedChecksum = savedState?.csvChecksum || '';

        s.state = savedState;
        // Mark tutorial as seen (resumed game means player already played)
        if (s.campaign) {
          s.campaign.tutorialSeen = true;
        }
        // Rebuild renderer and start day phase from checkpoint state.
        // Pass skipMarketRefill=true to preserve the saved market state
        // (the saved state already has the correct market from save time;
        // calling refillMarket would replace it with fresh deck draws).
        try { s.refreshAll(); } catch (_) { /* ignore */ }
        // Restore the saved camera (zoom/pan) onto the scene after rehydrating
        // (CG-0MTH9OWF2002YQQ3). Runs after refreshAll so the street layout
        // exists; setStreetCameraState then re-renders the visible streets.
        try { s.syncStreetCameraFromState?.(); } catch (_) { /* ignore */ }
        // Clear the deferred flag — the player has committed by resuming,
        // but the banner must NOT fire (same day continues, AC3).
        s.deferredWeekBanner = false;
        try { s.startTurnPhase(true); } catch (_) { /* ignore */ }

        // Load game: compare saved checksum against current CSV
        lmCtx.checkForCsvMismatchAndRegenerate(savedChecksum).catch(() => {});
      },
      // Resume overlay callback — use built-in default overlay
      (state: any, onResume: () => void, onNewGame: () => void) => {
        createDefaultResumeOverlay(s, state, onResume, onNewGame);
      },
    ).catch(() => {
      // On error (e.g., storage unavailable), show tutorial offer / deferred banner
      try {
        const legacySeen = s.campaign ? (s.campaign as any).tutorialSeen : undefined;
        lmCtx.showTutorialOfferOrDeferredBanner(tutorialOpts, legacySeen);
      } catch (_) { /* ignore */ }
    });
  
}
