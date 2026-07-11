import {
  SaveLoadStore,
  CheckpointManager,
  type SaveSerializer,
} from '../../src/core-engine';
import {
  type MainStreetCampaignProgress,
  type MainStreetSerializedState,
  type MainStreetState,
  serializeMainStreetState,
  deserializeMainStreetState,
} from './MainStreetState';
import {
  TIER_DEFINITIONS,
  ORDERED_TIER_DEFINITIONS,
  deriveUnlockedCardIds,
} from './MainStreetTiers';

export const MAIN_STREET_SAVE_SCHEMA_VERSION = 1;
export const MAIN_STREET_CAMPAIGN_SCHEMA_VERSION = 2;
export const MAIN_STREET_GAME_TYPE = 'main-street';
export const MAIN_STREET_RUN_SLOT = 'turn-start';
export const MAIN_STREET_CAMPAIGN_SLOT = 'campaign-default';

export const mainStreetStateSerializer: SaveSerializer<
  MainStreetState,
  MainStreetSerializedState
> = {
  schemaVersion: MAIN_STREET_SAVE_SCHEMA_VERSION,
  serialize: serializeMainStreetState,
  deserialize: deserializeMainStreetState,
};

export const mainStreetCampaignSerializer: SaveSerializer<
  MainStreetCampaignProgress,
  MainStreetCampaignProgress
> = {
  schemaVersion: MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
  serialize: (state) => structuredClone(state),
  deserialize: (data) => {
    // v1 -> v2 migration: add schemaVersion, unlockedCardIds, milestoneHistory
    if (!data.schemaVersion || data.schemaVersion === 1) {
      return {
        ...data,
        schemaVersion: 2,
        unlockedCardIds: deriveUnlockedCardIds(data.unlockedTiers),
        milestoneHistory: [],
      };
    }

    // Ensure tutorialSeen flag exists on returned object for runtime code.
    const cloned = structuredClone(data) as any;
    if (typeof cloned.tutorialSeen === 'undefined') {
      cloned.tutorialSeen = false;
    }
    return cloned as MainStreetCampaignProgress;
  },
};

export function createDefaultCampaignProgress(): MainStreetCampaignProgress {
  return {
    schemaVersion: MAIN_STREET_CAMPAIGN_SCHEMA_VERSION,
    unlockedTiers: ['tier-1'],
    unlockedCardIds: TIER_DEFINITIONS['tier-1'].cumulativeCardIds.slice(),
    milestoneHistory: [],
    persistentReputation: 0,
    highestScore: 0,
    totalRuns: 0,
    totalWins: 0,
    lastUpdatedAt: new Date().toISOString(),
    tutorialSeen: false,
  };
}

/**
 * Create a canonical {@link CheckpointManager} for Main Street run checkpoints.
 *
 * Uses the existing {@link mainStreetStateSerializer} and the shared
 * `MAIN_STREET_GAME_TYPE` / `MAIN_STREET_RUN_SLOT` constants so that all
 * checkpoint operations follow the same pattern as Feudalism and
 * Beleaguered Castle.
 *
 * @param store - Initialized SaveLoadStore instance.
 * @returns A new CheckpointManager bound to Main Street's slot and serializer.
 */
export function createMainStreetCheckpointManager(
  store: SaveLoadStore,
): CheckpointManager<MainStreetState, MainStreetSerializedState> {
  return new CheckpointManager(
    store,
    MAIN_STREET_GAME_TYPE,
    MAIN_STREET_RUN_SLOT,
    mainStreetStateSerializer,
  );
}

/**
 * Remove the saved turn-start checkpoint.
 *
 * Safe to call even when no checkpoint exists. Delegates to
 * {@link CheckpointManager.clear}.
 *
 * @param store - Initialized SaveLoadStore instance.
 */
export async function clearTurnStartCheckpoint(
  store: SaveLoadStore,
): Promise<void> {
  const mgr = createMainStreetCheckpointManager(store);
  await mgr.clear();
}

/**
 * Evaluates tier unlocks and updates campaign progress after a completed run.
 *
 * Called after EndCheck phase determines the game result.
 * Mutates the campaign progress in place, then persists it.
 *
 * @param campaign  Current campaign progress (loaded from storage).
 * @param state     Completed game state (after EndCheck).
 * @param store     Save/Load store for persistence (optional; if provided, saves automatically).
 * @returns The updated campaign progress.
 */
export async function updateCampaignAfterRun(
  campaign: MainStreetCampaignProgress,
  state: MainStreetState,
  store?: SaveLoadStore,
): Promise<MainStreetCampaignProgress> {
  const now = new Date().toISOString();

  // Update statistics
  campaign.totalRuns += 1;
  if (state.gameResult === 'win') campaign.totalWins += 1;
  if (state.finalScore > campaign.highestScore) {
    campaign.highestScore = state.finalScore;
  }
  if (state.resourceBank.reputation > campaign.persistentReputation) {
    campaign.persistentReputation = state.resourceBank.reputation;
  }

  // Evaluate tier unlocks (ordered by tier number)
  for (const tierDef of ORDERED_TIER_DEFINITIONS) {
    // Skip tier-1 (always unlocked) and already-unlocked tiers
    if (tierDef.id === 'tier-1') continue;
    if (campaign.unlockedTiers.includes(tierDef.id)) continue;

    const reputationMet =
      state.resourceBank.reputation >= tierDef.reputationThreshold;
    const challengeMet = tierDef.challengeCondition(state);

    if (reputationMet || challengeMet) {
      campaign.unlockedTiers.push(tierDef.id);
      campaign.milestoneHistory.push({
        tierId: tierDef.id,
        triggerType: reputationMet ? 'reputation' : 'challenge',
        reputationAtUnlock: reputationMet
          ? state.resourceBank.reputation
          : null,
        challengeIdsAtUnlock: challengeMet
          ? [...state.challengesCompleted]
          : null,
        runFinalScore: state.finalScore,
        runSeed: state.seed,
        unlockedAt: now,
      });
    }
  }

  // Derive updated card list from all unlocked tiers
  campaign.unlockedCardIds = deriveUnlockedCardIds(campaign.unlockedTiers);
  campaign.lastUpdatedAt = now;

  // Persist if store is provided
  if (store) {
    await saveCampaignProgress(store, campaign);
  }

  return campaign;
}

export async function saveTurnStartCheckpoint(
  store: SaveLoadStore,
  state: MainStreetState,
  _slotId: string = MAIN_STREET_RUN_SLOT,
): Promise<void> {
  const mgr = createMainStreetCheckpointManager(store);
  await mgr.save(state);
}

export async function loadTurnStartCheckpoint(
  store: SaveLoadStore,
  _slotId: string = MAIN_STREET_RUN_SLOT,
): Promise<MainStreetState | null> {
  const mgr = createMainStreetCheckpointManager(store);
  return mgr.load();
}

export async function saveCampaignProgress(
  store: SaveLoadStore,
  progress: MainStreetCampaignProgress,
  slotId: string = MAIN_STREET_CAMPAIGN_SLOT,
): Promise<void> {
  await store.saveCampaignProgress(
    MAIN_STREET_GAME_TYPE,
    slotId,
    mainStreetCampaignSerializer,
    progress,
  );
}

export async function loadCampaignProgress(
  store: SaveLoadStore,
  slotId: string = MAIN_STREET_CAMPAIGN_SLOT,
): Promise<MainStreetCampaignProgress | null> {
  return store.loadCampaignProgress(
    MAIN_STREET_GAME_TYPE,
    slotId,
    mainStreetCampaignSerializer,
  );
}
