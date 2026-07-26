/**
 * Baseline capture, validation, and loading utilities for Main Street balance analysis.
 *
 * A baseline is a committed snapshot of Monte Carlo results representing the
 * "known good" balance state. It serves as the reference point for regression
 * detection in the comparison engine.
 *
 * @module engine/baseline
 */

import type {
  MonteCarloMetrics,
  MonteCarloRunSummary,
  CombinationResult,
} from '../../../example-games/main-street/MainStreetMonteCarlo';

/**
 * Metadata for a baseline snapshot.
 */
export interface BaselineMeta {
  /** Tool that generated the baseline. */
  tool: string;
  /** Version of the tool/baseline format. */
  version: string;
  /** ISO timestamp when the baseline was captured. */
  timestamp: string;
  /** Source files used to create the baseline. */
  source: {
    /** Path to the card CSV file used. */
    cardDataCsv?: string;
    /** Path to the Monte Carlo results file used. */
    monteCarloResults?: string;
    /** Additional source metadata (extensible). */
    [key: string]: string | undefined;
  };
}

/**
 * A single baseline combination entry.
 */
export interface BaselineCombination {
  /** The strategy used (e.g., 'greedy', 'random'). */
  strategy: string;
  /** The difficulty level used (e.g., 'Easy', 'Medium', 'Hard'). */
  difficulty: string;
  /** Aggregate metrics for this combination. */
  metrics: MonteCarloMetrics;
  /** Per-run summaries for this combination. */
  runs: MonteCarloRunSummary[];
}

/**
 * Complete baseline structure.
 */
export interface BaselineData {
  /** Metadata about the baseline capture. */
  meta: BaselineMeta;
  /** Array of strategy×difficulty combination results. */
  combinations: BaselineCombination[];
}

/**
 * Result of baseline shape validation.
 */
export interface ValidationResult {
  /** Whether the baseline object has a valid shape. */
  valid: boolean;
  /** Human-readable error messages if invalid. */
  errors: string[];
}

/**
 * Result of loading a baseline from file.
 */
export interface LoadResult {
  /** Whether the load succeeded. */
  success: boolean;
  /** The loaded baseline data if successful. */
  data?: BaselineData;
  /** Error message if unsuccessful. */
  error?: string;
}

/**
 * Validates that an unknown value has the correct shape for a BaselineData object.
 *
 * @param value - The value to validate (typically parsed JSON).
 * @returns ValidationResult with valid flag and any error messages.
 */
export function validateBaselineShape(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (value === null || value === undefined) {
    errors.push('Baseline data is null or undefined');
    return { valid: false, errors };
  }

  if (typeof value !== 'object') {
    errors.push(`Expected object, got ${typeof value}`);
    return { valid: false, errors };
  }

  const obj = value as Record<string, unknown>;

  // Check meta
  if (!obj.meta || typeof obj.meta !== 'object') {
    errors.push('Missing or invalid meta object');
  } else {
    const meta = obj.meta as Record<string, unknown>;
    if (!meta.tool || typeof meta.tool !== 'string') {
      errors.push('meta.tool must be a non-empty string');
    }
    if (!meta.version || typeof meta.version !== 'string') {
      errors.push('meta.version must be a non-empty string');
    }
    if (!meta.timestamp || typeof meta.timestamp !== 'string') {
      errors.push('meta.timestamp must be a non-empty string');
    }
  }

  // Check combinations
  if (!('combinations' in obj)) {
    errors.push('Missing combinations array');
  } else if (!Array.isArray(obj.combinations)) {
    errors.push('combinations must be an array');
    return { valid: false, errors };
  } else {
    for (let i = 0; i < obj.combinations.length; i++) {
      const combo = obj.combinations[i] as Record<string, unknown>;
      if (!combo) {
        errors.push(`combinations[${i}] is null or undefined`);
        continue;
      }
      if (!combo.strategy || typeof combo.strategy !== 'string') {
        errors.push(`combinations[${i}] missing or invalid strategy`);
      }
      if (!combo.difficulty || typeof combo.difficulty !== 'string') {
        errors.push(`combinations[${i}] missing or invalid difficulty`);
      }
      if (!combo.metrics || typeof combo.metrics !== 'object') {
        errors.push(`combinations[${i}] missing or invalid metrics`);
      }
      if (!Array.isArray(combo.runs)) {
        errors.push(`combinations[${i}] missing or invalid runs array`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Captures a baseline snapshot from combination results.
 *
 * @param combinations - Array of strategy×difficulty combination results.
 * @param sourceInfo - Information about the source files used.
 * @returns A complete BaselineData object ready for serialization.
 */
export function captureBaseline(
  combinations: BaselineCombination[],
  sourceInfo: {
    tool?: string;
    cardDataCsv?: string;
    monteCarloResults?: string;
    [key: string]: string | undefined;
  },
): BaselineData {
  const meta: BaselineMeta = {
    tool: sourceInfo.tool ?? 'balance-capture-baseline',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    source: {
      cardDataCsv: sourceInfo.cardDataCsv,
      monteCarloResults: sourceInfo.monteCarloResults,
    },
  };

  // Copy additional source fields
  for (const [key, value] of Object.entries(sourceInfo)) {
    if (!['tool', 'cardDataCsv', 'monteCarloResults'].includes(key) && value !== undefined) {
      meta.source[key] = value;
    }
  }

  return {
    meta,
    combinations: combinations.map((c) => ({
      strategy: c.strategy,
      difficulty: c.difficulty,
      metrics: c.metrics,
      runs: c.runs,
    })),
  };
}

/**
 * Loads a baseline from a JSON file path.
 *
 * In a Node.js environment, this reads and parses the JSON file.
 * In a browser environment, this returns an error.
 *
 * @param path - File path to the baseline JSON file.
 * @returns LoadResult with the parsed baseline data or error.
 */
export function loadBaseline(path: string): LoadResult {
  if (!path) {
    return { success: false, error: 'No path provided' };
  }

  try {
    // Check if we're in a Node.js environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs') as typeof import('fs');
      if (!fs.existsSync(path)) {
        return { success: false, error: `File not found: ${path}` };
      }
      const raw = fs.readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as BaselineData;
      const validation = validateBaselineShape(data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid baseline shape: ${validation.errors.join('; ')}`,
        };
      }
      return { success: true, data };
    }
    return {
      success: false,
      error: 'File I/O is only available in Node.js environment',
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown error loading baseline';
    return { success: false, error: message };
  }
}
