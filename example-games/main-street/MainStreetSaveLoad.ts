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

export const MAIN_STREET_SAVE_SCHEMA_VERSION = 1;
export const MAIN_STREET_CAMPAIGN_SCHEMA_VERSION = 1;
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
  deserialize: (data) => structuredClone(data),
};

export function createDefaultCampaignProgress(): MainStreetCampaignProgress {
  return {
    unlockedTiers: ['tier-1'],
    persistentReputation: 0,
    highestScore: 0,
    totalRuns: 0,
    totalWins: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
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
