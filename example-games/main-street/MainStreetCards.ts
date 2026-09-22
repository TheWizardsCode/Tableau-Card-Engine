/**
 * Main Street: Card Type Definitions and Fixture Data
 *
 * **This module is a barrel file.** All exports are re-exported from
 * per-concern sub-modules to preserve backward compatibility with existing
 * imports — consumers should import from `MainStreetCards` and not need
 * to change when sub-modules evolve.
 *
 * | Sub-module                    | Responsibility |
 * |-------------------------------|----------------|
 * | `MainStreetCardsConstants`    | Game constants (GRID_SIZE, market sizing, scoring) |
 * | `MainStreetCardsTypes`        | Card interfaces, enums, type aliases |
 * | `MainStreetCardsTemplates`    | CSV loading, template arrays, lookup maps |
 * | `MainStreetCardsDecks`        | Deck creation functions (createBusinessDeck, etc.) |
 * | `MainStreetCardsUtils`        | Pure helpers (staff matching, incident balance, rendering) |
 *
 * Card template data is loaded from a single CSV file (`card-data.csv`)
 * at module load time via `MainStreetCardsTemplates`.
 *
 * @module
 */

// ── Constants ───────────────────────────────────────────────
export {
  GRID_SIZE,
  STREET_COLS,
  STREET_ROWS,
  WORLD_STRIDE_X,
  WORLD_STRIDE_Y,
  worldWidth,
  worldHeight,
  worldSlotCount,
  MAX_TURNS,
  WIN_THRESHOLD,
  STARTING_COINS,
  STARTING_REPUTATION,
  CHALLENGE_BONUS_POINTS,
  MARKET_TOTAL_SLOTS,
  MARKET_BUSINESS_MIN,
  MARKET_BUSINESS_MAX,
  MARKET_UPGRADE_MAX,
  MARKET_EVENT_MAX,
  MARKET_STAFF_MAX,
  INCIDENT_QUEUE_SIZE,
  REFRESH_MARKET_COST,
  SYNERGY_BONUS_PER_NEIGHBOR,
  PLACE_COST_RATIO,
  SELL_VALUE_RATIO,
} from './MainStreetCardsConstants';

// ── Types ───────────────────────────────────────────────────
export type {
  SynergyType,
  StaffBusinessTarget,
  SpecializationSkillCategory,
  SpecializationSkill,
  EventTrigger,
  EventTarget,
  CardFamily,
  BusinessCard,
  EventCard,
  DurationEventCard,
  UpgradeCard,
  StaffCard,
  CommunitySpaceCard,
  AnyCard,
  IncidentPolarity,
  IncidentPolarityRun,
  IncidentBalanceState,
} from './MainStreetCardsTypes';

export {
  SYNERGY_TYPE_NAMES,
  STACKED_SKILL_CATEGORIES,
  DEFAULT_INCIDENT_REPEAT_SPACING,
  DEFAULT_INCIDENT_MAX_STREAK,
  MAX_TRACKED_INCIDENT_HISTORY,
} from './MainStreetCardsTypes';

// ── Templates ───────────────────────────────────────────────
export {
  CARD_DATA_RAW,
  CSV_CHECKSUM,
  getCsvRows,
  loadTemplatesFromCsv,
  resetTemplatesToDefault,
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getUpgradeTemplates,
  getStaffCardTemplates,
  CSV_ROWS,
  STAFF_CARD_TEMPLATES,
  CARD_TEMPLATE_NAMES,
  CARD_TIER_MAP,
} from './MainStreetCardsTemplates';

// ── Decks ───────────────────────────────────────────────────
export {
  createStaffDeck,
  createBusinessDeck,
  createCommunitySpaceDeck,
  createEventDeck,
  createUpgradeDeck,
} from './MainStreetCardsDecks';

// ── Utils ───────────────────────────────────────────────────
export {
  getAllowedBusinessTypesForStaff,
  staffMatchesBusiness,
  isDurationEventCard,
  isCardAvailableInWeek,
  getBaseTypeId,
  incidentPolarity,
  incidentTemplateName,
  createIncidentBalanceState,
  recordIncidentDraw,
  createIncidentBalanceFromQueue,
  findConstrainedIncidentIndex,
  orderIncidentDeck,
  synergyColor,
  cardLabel,
} from './MainStreetCardsUtils';
