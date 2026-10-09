/**
 * 1916: The Rising — help / rules content.
 *
 * The copy lives in `src/help-content.json` so it can be authored and reviewed
 * without touching scene code, and is adapted here into the shared
 * {@link HelpSection} shape consumed by the in-game help panel. Dynamic values
 * (Insight target, clock years, Memory cost) are interpolated from the live
 * rules constants so the help never drifts from the implementation.
 *
 * Section order follows the Gym scene pattern: Features, Controls, Usage
 * Example and Test Plan, alongside the game-specific How to Play and
 * Win / Loss Conditions sections (AC6).
 *
 * @module src/TheRisingHelpContent
 */

import type { HelpSection } from '@ui/HelpPanel';
import helpContentJson from './help-content.json';
import {
  RISING_FINAL_YEAR,
  RISING_START_YEAR,
  type Difficulty,
} from './TheRisingState';
import { DIFFICULTY_SETTINGS } from './TheRisingState';
import { SPIRIT_MEET_MEMORY_COST } from './TheRisingEconomy';
import { BASE_PLACEMENT_INSIGHT, ERA_COMPLETION_BONUS } from './TheRisingRules';

/** The dynamic values interpolated into the help copy. */
export interface RisingHelpValues {
  /** Insight required to win for the active difficulty. */
  readonly insightTarget: number;
  /** The starting clock year. */
  readonly startYear: number;
  /** The final clock year. */
  readonly finalYear: number;
  /** The Memory cost of meeting one spirit. */
  readonly meetCost: number;
  /** Insight awarded for a correct placement. */
  readonly baseInsight: number;
  /** Bonus Insight for completing an era. */
  readonly eraBonus: number;
}

/** A raw help section as authored in `help-content.json`. */
interface RawHelpSection {
  readonly heading: string;
  readonly body: string;
}

/** The parsed shape of `help-content.json`. */
interface RawHelpContent {
  readonly version: number;
  readonly sections: readonly RawHelpSection[];
}

/** The default interpolation values (Normal difficulty). */
export function defaultRisingHelpValues(): RisingHelpValues {
  return {
    insightTarget: DIFFICULTY_SETTINGS.normal.insightTarget,
    startYear: RISING_START_YEAR,
    finalYear: RISING_FINAL_YEAR,
    meetCost: SPIRIT_MEET_MEMORY_COST,
    baseInsight: BASE_PLACEMENT_INSIGHT,
    eraBonus: ERA_COMPLETION_BONUS,
  };
}

/** Resolve the interpolation values for a difficulty preset. */
export function risingHelpValuesFor(difficulty: Difficulty): RisingHelpValues {
  return {
    ...defaultRisingHelpValues(),
    insightTarget: DIFFICULTY_SETTINGS[difficulty].insightTarget,
  };
}

/**
 * Replace `{{key}}` placeholders in `text` with the supplied values.
 *
 * Unknown placeholders are left untouched, so adding a value later is safe.
 */
export function interpolateHelpText(
  text: string,
  values: Partial<Record<keyof RisingHelpValues, number>>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key as keyof RisingHelpValues];
    return value === undefined ? match : String(value);
  });
}

/**
 * Build the ordered help sections from the JSON copy, interpolating the
 * supplied dynamic values.
 */
export function buildRisingHelpSections(
  values: RisingHelpValues = defaultRisingHelpValues(),
): HelpSection[] {
  const content = helpContentJson as RawHelpContent;
  return content.sections.map((section) => ({
    heading: section.heading,
    body: interpolateHelpText(section.body, values),
  }));
}

/** The help sections for the default (Normal) difficulty. */
export const THERISING_HELP_SECTIONS: readonly HelpSection[] = buildRisingHelpSections();

/** The heading of every section, in order, as authored in the JSON. */
export const THERISING_HELP_HEADINGS: readonly string[] = (
  helpContentJson as RawHelpContent
).sections.map((section) => section.heading);
