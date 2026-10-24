/**
 * Shared argument handling for the story-line authoring CLIs.
 *
 * Kept in one place so the three `tsx` entry points (`storyline-author.ts`,
 * `storyline-graph.ts`, `validate-storylines.ts`) share identical, predictable
 * parsing without duplicating it three times.
 *
 * @module
 */

/** A parsed argv: `--flag value` pairs plus bare positionals. */
export interface ParsedArgv {
  /** Flag map; a flag without a value reads as `'true'`. */
  readonly flags: ReadonlyMap<string, string>;
  /** Positional arguments in order (e.g. the author command). */
  readonly positionals: readonly string[];
  /** Every `--field key=value` occurrence, in order. */
  readonly fieldPairs: readonly (readonly [string, string])[];
}

/**
 * Parses argv into flags, positionals and repeated `--field` pairs.
 *
 * @param argv Raw arguments (without the node/script prefix).
 * @returns The parsed arguments.
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const flags = new Map<string, string>();
  const positionals: string[] = [];
  const fieldPairs: (readonly [string, string])[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    const hasValue = next !== undefined && !next.startsWith('--');
    const value = hasValue ? (next as string) : 'true';
    if (hasValue) i++;

    if (key === 'field') {
      const separator = value.indexOf('=');
      if (separator <= 0) {
        flags.set('field-error', value);
        continue;
      }
      fieldPairs.push([value.slice(0, separator), value.slice(separator + 1)]);
      continue;
    }
    flags.set(key, value);
  }

  return { flags, positionals, fieldPairs };
}

/** Reads a nullable id flag: `undefined` when absent, `null` when cleared. */
export function nullableFlag(
  flags: ReadonlyMap<string, string>,
  valueKey: string,
  clearKey: string,
): string | null | undefined {
  if (flags.has(clearKey)) return null;
  const value = flags.get(valueKey);
  return value === undefined ? undefined : value;
}

/** Reads a boolean flag (`--flag`, `--flag true`, `--flag false`). */
export function booleanFlag(
  flags: ReadonlyMap<string, string>,
  key: string,
): boolean | undefined {
  if (!flags.has(key)) return undefined;
  const value = flags.get(key);
  return value !== 'false' && value !== '0' && value !== 'no';
}
