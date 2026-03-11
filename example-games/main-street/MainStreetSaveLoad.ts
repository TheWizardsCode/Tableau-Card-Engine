import {
  SaveLoadStore,
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
    return structuredClone(data);
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
  };
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
  slotId: string = MAIN_STREET_RUN_SLOT,
): Promise<void> {
  await store.saveRunCheckpoint(
    MAIN_STREET_GAME_TYPE,
    slotId,
    mainStreetStateSerializer,
    state,
  );
}

export async function loadTurnStartCheckpoint(
  store: SaveLoadStore,
  slotId: string = MAIN_STREET_RUN_SLOT,
): Promise<MainStreetState | null> {
  return store.loadRunCheckpoint(
    MAIN_STREET_GAME_TYPE,
    slotId,
    mainStreetStateSerializer,
  );
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
