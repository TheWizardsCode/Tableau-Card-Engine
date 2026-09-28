#!/usr/bin/env node
/**
 * Vitest → flat-TAP reporter bridge for the TCE test skill extension.
 *
 * Why this exists
 * ---------------
 * The global test-skill runner (`skill/test/scripts/run_tests.py`) parses a
 * failed command's output with `parse_node_failures()`, which recognises Node
 * TAP (`^not ok N - <name>` plus a YAML `error: |-` / `stack: |-` block). It
 * has no Vitest parser, so a red Vitest run previously reported
 * `success: false` with an empty `failures` array and triage created no
 * per-test `test-failure` work items.
 *
 * This reporter emits the flat TAP shape the global parser understands, so a
 * typed `/skill:test --type …` run triages per test. It is loaded *alongside*
 * the default reporter (`--reporter=default --reporter=./scripts/vitest-tap-reporter.ts`)
 * so the human summary and the retry wrapper's "all files passed" detection
 * are preserved.
 *
 * Emitted shape (one block per failed test, streamed as it happens):
 *
 *     not ok 1 - tests/foo.test.ts > suite > test name
 *       ---
 *       error: |-
 *         AssertionError: expected 1 to be 2
 *       stack: |-
 *         AssertionError: expected 1 to be 2
 *             at tests/foo.test.ts:12:3
 *       ...
 *
 * The reporter is silent when every test passes (it must not break the retry
 * wrapper's `Test Files N passed` detection). Module-level (collection)
 * errors are also emitted, since a file that throws at import has no test
 * cases to report.
 *
 * See: CG-0MUECQ22U002Z0A1 (this file), CG-0MUDYCJUC009URD6 (parent).
 */
import path from 'node:path';
import type { Reporter, TestCase, TestModule } from 'vitest/node';

/** Indentation of the TAP YAML diagnostic block (TAP 12+ convention). */
const YAML_INDENT = '  ';

/** Indentation of a YAML block-scalar body inside the diagnostic block. */
const BLOCK_INDENT = '    ';

/**
 * Minimal structural view of a failed test/module error. Vitest's `TestError`
 * and `SerializedError` are both assignable to this, which keeps the reporter
 * free of a deep `@vitest/utils` import.
 */
export interface TapError {
  name?: string;
  message?: string;
  stack?: string;
  cause?: TapError;
}

/**
 * Render a Vitest module id as a repository-relative path when it is an
 * absolute path under the current working directory. Non-absolute (virtual)
 * ids are returned unchanged.
 */
export function toRelativeModuleId(
  moduleId: string,
  cwd: string = process.cwd(),
): string {
  if (!path.isAbsolute(moduleId)) return moduleId;
  const relative = path.relative(cwd, moduleId);
  return relative && !relative.startsWith('..') ? relative : moduleId;
}

/** Format the TAP test name as `<file> > <suite > test>`. */
export function formatTapName(filePath: string, fullName: string): string {
  return `${filePath} > ${fullName}`;
}

/** Indent every line of *text* by *indent* (empty text yields a lone indent). */
function indentBlock(text: string, indent: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (normalized === '') return indent;
  return normalized
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

/** Build the human-readable message for one error, folding in its cause chain. */
function errorMessage(error: TapError | undefined): string {
  if (!error) return '';
  const name = error.name ?? 'Error';
  const message = error.message ?? '';
  const head = message ? `${name}: ${message}` : name;
  const cause = error.cause ? `\nCaused by: ${errorMessage(error.cause)}` : '';
  return `${head}${cause}`;
}

/**
 * Render a single flat-TAP failure block.
 *
 * `error` carries the message text and `stack` the stack trace, matching the
 * global `parse_node_failures` extractor (`error: |-` / `stack: |-`).
 */
export function renderTapFailure(
  counter: number,
  filePath: string,
  fullName: string,
  errors: ReadonlyArray<TapError>,
): string {
  const message =
    errors
      .map((error) => errorMessage(error))
      .filter((text) => text.length > 0)
      .join('\n\n') || fullName;
  const stack = errors[0]?.stack ?? message;
  return [
    `not ok ${counter} - ${formatTapName(filePath, fullName)}`,
    `${YAML_INDENT}---`,
    `${YAML_INDENT}error: |-`,
    indentBlock(message, BLOCK_INDENT),
    `${YAML_INDENT}stack: |-`,
    indentBlock(stack, BLOCK_INDENT),
    `${YAML_INDENT}...`,
    '',
  ].join('\n');
}

/** Injectable sink so the reporter is unit-testable without touching stdout. */
export type TapWriter = (chunk: string) => void;

/**
 * Vitest reporter emitting flat TAP for the global test-skill parser.
 *
 * Registered by path (`--reporter=./scripts/vitest-tap-reporter.ts`) via its
 * default export. Vitest instantiates it with no arguments.
 */
export class VitestTapReporter implements Reporter {
  private counter = 0;
  private readonly write: TapWriter;

  constructor(options: { write?: TapWriter } = {}) {
    this.write = options.write ?? ((chunk: string) => {
      process.stdout.write(chunk);
    });
  }

  /** Emit a TAP block for every failed test case (silent otherwise). */
  onTestCaseResult(testCase: TestCase): void {
    const result = testCase.result();
    if (result.state !== 'failed') return;
    this.emitFailure(
      toRelativeModuleId(testCase.module.moduleId),
      testCase.fullName,
      result.errors ?? [],
    );
  }

  /**
   * Emit a TAP block for a module that failed during collection (e.g. a
   * syntax/import error), which produces no test-case results.
   */
  onTestModuleEnd(testModule: TestModule): void {
    const errors = testModule.errors();
    if (errors.length === 0) return;
    this.emitFailure(
      toRelativeModuleId(testModule.moduleId),
      '(module)',
      errors,
    );
  }

  private emitFailure(
    filePath: string,
    fullName: string,
    errors: ReadonlyArray<TapError>,
  ): void {
    this.counter += 1;
    this.write(renderTapFailure(this.counter, filePath, fullName, errors));
  }
}

export default VitestTapReporter;
