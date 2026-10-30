#!/usr/bin/env node
/**
 * Static import-graph check for the node-safe `src/ui` surface
 * (CG-0MVS9HBN3009HIQN; contract pinned by CG-0MVTVSYQE002JGDN).
 *
 * `src/ui/node-safe-modules.ts` promises that every listed module is
 * importable in a plain Node environment — no `window`, no Phaser evaluation.
 * This check proves that promise *statically*: for every manifest entry it
 * walks the real TypeScript import graph (following the `tsconfig.json`
 * `paths` aliases, exactly like the build) and fails when the module
 * transitively reaches a **value** import of `phaser`. It is the compile-time
 * sibling of the runtime guard (`tests/ui/phaser-free-imports.test.ts`), so a
 * reintroduced regression is caught here instead of in downstream game suites
 * with `window is not defined` (CG-0MVQQ2M8E003FQMZ).
 *
 * Contract:
 *
 *   - Type-only edges (`import type`, `export type`, inline `{ type X }`) are
 *     elided at compile time and never followed.
 *   - Value edges are followed for relative specifiers, `tsconfig.json` path
 *     aliases (`@core-engine/*`, `@card-system/*`, `@rule-engine/*`, `@ai/*`,
 *     `@ui/*`, …), `export … from` re-exports and dynamic `import()`.
 *   - **Fail closed:** an unresolvable relative or alias specifier, a listed
 *     module that does not exist, and a manifest that cannot be read
 *     statically are violations — never a warning, never a silent skip.
 *   - Installed packages (`node_modules`) are external to the engine graph and
 *     are not walked; the Phaser specifier is detected by name, so it fails
 *     even in a tree with no `node_modules`.
 *
 * Usage:
 *   npx tsx scripts/check-ui-node-surface.ts [--manifest <path>] [--root <dir>] [--json]
 *
 * Exit codes: 0 = every listed module is clean, 1 = violation(s), 2 = bad
 * usage. This file is pure static analysis: no bundler, no network, and no
 * runtime import of the modules it inspects.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Named export of the manifest module that holds the entry list. */
const MANIFEST_EXPORT_NAME = 'uiNodeSafeModules';

/** Why a listed module fails the node-safe contract. */
export type ViolationReason =
  | 'phaser-value-import'
  | 'unresolvable-local-import'
  | 'unresolvable-alias-import'
  | 'missing-module'
  | 'unparseable-manifest';

/** A single contract violation, with the full offending import chain. */
export interface Violation {
  /** Manifest entry the violation is attributed to. */
  module: string;
  /** Machine-readable classification. */
  reason: ViolationReason;
  /**
   * Offending chain, from the listed module to the offender. Local files are
   * repository-relative POSIX paths; the final element is either the `phaser`
   * specifier or the unresolvable specifier that fails the check.
   */
  chain: string[];
  /** One-line human-readable description (used by the CLI and JSON output). */
  message: string;
}

/** Result of a full check run. */
export interface CheckResult {
  ok: boolean;
  root: string;
  manifestPath: string;
  /** Manifest entries that were checked (manifest order preserved). */
  modules: string[];
  violations: Violation[];
}

/** Options for {@link runCheck}; both default to the real repository. */
export interface CheckOptions {
  /** Base directory for resolution (defaults to the repository root). */
  root?: string;
  /** Manifest file path (defaults to `<root>/src/ui/node-safe-modules.ts`). */
  manifestPath?: string;
}

/** Injectable output sink so the CLI is testable without capturing stdout. */
export interface CliIo {
  write(text: string): void;
}

const USAGE = [
  'Static import-graph check for the node-safe src/ui surface.',
  '',
  'Usage: check-ui-node-surface [--manifest <path>] [--root <dir>] [--json]',
  '',
  '  --manifest <path>  Manifest file to check (default: src/ui/node-safe-modules.ts).',
  '  --root <dir>       Base directory for module resolution (default: repo root).',
  '  --json             Emit machine-readable JSON instead of text.',
  '  --help, -h         Show this help.',
  '',
].join('\n');

const REASON_LABELS: Record<ViolationReason, string> = {
  'phaser-value-import': 'reaches a Phaser value import',
  'unresolvable-local-import': 'has an unresolvable local import',
  'unresolvable-alias-import': 'has an unresolvable alias import',
  'missing-module': 'listed module does not exist',
  'unparseable-manifest': 'manifest cannot be read statically',
};

// ── Manifest reading ───────────────────────────────────────────

type ManifestRead = { modules: string[] } | { error: string };

/** Strip `as const` / `satisfies` / parentheses wrappers from an expression. */
function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Locate the `uiNodeSafeModules` array-literal initializer in a manifest AST. */
function findManifestInitializer(
  sourceFile: ts.SourceFile,
): ts.Expression | null {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === MANIFEST_EXPORT_NAME &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }
  return null;
}

/**
 * Read the entry list from a manifest file.
 *
 * The repository manifest is TypeScript, but JSON manifests are accepted so
 * tooling (and fixtures) can supply a data-only entry list. Anything that
 * cannot be read *statically* — a computed spread, a non-literal entry, a
 * syntax error — is an error, which the caller turns into a violation: a
 * manifest the check cannot read must never pass.
 */
function readManifest(manifestPath: string): ManifestRead {
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
    return { error: `manifest file not found: ${manifestPath}` };
  }

  const text = readFileSync(manifestPath, 'utf8');

  if (manifestPath.endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { error: `manifest is not valid JSON: ${(error as Error).message}` };
    }
    const candidate = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null
        ? ((parsed as Record<string, unknown>)[MANIFEST_EXPORT_NAME] ??
          (parsed as Record<string, unknown>).modules)
        : undefined;
    if (!Array.isArray(candidate)) {
      return { error: 'JSON manifest has no entry array' };
    }
    return validateEntries(candidate);
  }

  const sourceFile = ts.createSourceFile(
    manifestPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  // `parseDiagnostics` is populated by the parser but is not part of the
  // public `SourceFile` type in every TypeScript release, hence the cast.
  const parseDiagnostics =
    (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    const first = parseDiagnostics[0];
    return {
      error: `manifest could not be parsed: ${ts.flattenDiagnosticMessageText(
        first.messageText,
        ' ',
      )}`,
    };
  }

  const initializer = findManifestInitializer(sourceFile);
  if (!initializer) {
    return {
      error: `manifest does not declare a \`${MANIFEST_EXPORT_NAME}\` array`,
    };
  }
  const unwrapped = unwrapExpression(initializer);
  if (!ts.isArrayLiteralExpression(unwrapped)) {
    return {
      error: `\`${MANIFEST_EXPORT_NAME}\` is not an array literal, so its entries cannot be read statically`,
    };
  }
  const entries: unknown[] = [];
  for (const element of unwrapped.elements) {
    const entry = unwrapExpression(element as ts.Expression);
    if (!ts.isStringLiteralLike(entry)) {
      return {
        error: `\`${MANIFEST_EXPORT_NAME}\` contains a non-literal entry, so it cannot be read statically`,
      };
    }
    entries.push(entry.text);
  }
  return validateEntries(entries);
}

function validateEntries(entries: unknown[]): ManifestRead {
  const modules: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return { error: 'manifest entries must be non-empty strings' };
    }
    modules.push(entry);
  }
  return { modules };
}

// ── Graph walking ──────────────────────────────────────────────

interface CheckContext {
  root: string;
  options: ts.CompilerOptions;
  paths: ts.MapLike<string[]> | undefined;
  sourceCache: Map<string, ts.SourceFile>;
}

/** Resolve the repository root (parent of `scripts/`). */
function defaultRepoRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

/**
 * Load compiler options from `<root>/tsconfig.json` so alias resolution is
 * identical to the build. A root without a tsconfig gets bundler-style
 * defaults; the missing config is not itself an error (the *specifiers*, not
 * the config, are what must fail closed).
 */
function createContext(root: string): CheckContext {
  let options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    resolveJsonModule: true,
  };

  const configPath = path.join(root, 'tsconfig.json');
  if (existsSync(configPath)) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) {
      throw new Error(
        `tsconfig.json could not be read: ${ts.flattenDiagnosticMessageText(
          read.error.messageText,
          ' ',
        )}`,
      );
    }
    const converted = ts.convertCompilerOptionsFromJson(
      (read.config as { compilerOptions?: unknown }).compilerOptions ?? {},
      root,
    );
    if (converted.errors.length > 0) {
      throw new Error(
        `tsconfig.json has invalid compilerOptions: ${ts.flattenDiagnosticMessageText(
          converted.errors[0].messageText,
          ' ',
        )}`,
      );
    }
    options = { ...options, ...converted.options };
  }

  if (!options.baseUrl) {
    options.baseUrl = root;
  } else if (!path.isAbsolute(options.baseUrl)) {
    options.baseUrl = path.resolve(root, options.baseUrl);
  }

  return {
    root,
    options,
    paths: options.paths,
    sourceCache: new Map<string, ts.SourceFile>(),
  };
}

/** Repository-relative POSIX path, for readable and stable chain display. */
function display(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/** `phaser` and its subpaths (`phaser/dist/...`) are all Phaser value edges. */
function isPhaserSpecifier(specifier: string): boolean {
  return specifier === 'phaser' || specifier.startsWith('phaser/');
}

/** Does the specifier name a `tsconfig.json` path alias (wildcard or exact)? */
function matchesAliasPattern(
  specifier: string,
  paths: ts.MapLike<string[]> | undefined,
): boolean {
  if (!paths) return false;
  return Object.keys(paths).some((pattern) => {
    const star = pattern.indexOf('*');
    if (star < 0) return pattern === specifier;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    return (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    );
  });
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(fileName)) return ts.ScriptKind.JS;
  if (/\.json$/.test(fileName)) return ts.ScriptKind.JSON;
  return ts.ScriptKind.TS;
}

function isScriptFile(fileName: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(fileName);
}

function getSourceFile(context: CheckContext, fileName: string): ts.SourceFile {
  const cached = context.sourceCache.get(fileName);
  if (cached) return cached;
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  context.sourceCache.set(fileName, sourceFile);
  return sourceFile;
}

interface ModuleEdge {
  specifier: string;
  typeOnly: boolean;
}

/**
 * A type-only import clause (`import type X`, `import { type X }`) is elided at
 * compile time. `import {} from 'x'` is not elided, so it stays a value edge.
 */
function isTypeOnlyImportClause(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  return (
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

/** `export type { … } from` is elided; `export * from` / `export { x } from` are not. */
function isTypeOnlyExportDeclaration(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false;
  return (
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

/** Every module edge in a file: static imports/re-exports plus dynamic `import()`. */
function collectEdges(sourceFile: ts.SourceFile): ModuleEdge[] {
  const edges: ModuleEdge[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: node.importClause
          ? isTypeOnlyImportClause(node.importClause)
          : false,
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: isTypeOnlyExportDeclaration(node),
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      edges.push({
        specifier: node.moduleReference.expression.text,
        typeOnly: false,
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      // A computed dynamic specifier cannot be followed statically; it is not
      // reported (there is nothing to resolve), but every literal one is.
      if (specifier && ts.isStringLiteralLike(specifier)) {
        edges.push({ specifier: specifier.text, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return edges;
}

/** Resolve a specifier through the compiler (aliases, node_modules, index files). */
function resolveSpecifier(
  specifier: string,
  containingFile: string,
  context: CheckContext,
): string | null {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    context.options,
    ts.sys,
  ).resolvedModule;
  return resolved ? path.resolve(resolved.resolvedFileName) : null;
}

function makeViolation(
  moduleName: string,
  reason: ViolationReason,
  chain: string[],
  detail?: string,
): Violation {
  const label = REASON_LABELS[reason];
  return {
    module: moduleName,
    reason,
    chain,
    message: detail ? `${label}: ${detail}` : label,
  };
}

/**
 * Breadth-first walk from a listed module; returns the shortest offending
 * chain, or `null` when the whole reachable graph is Phaser-free.
 */
function findViolation(
  moduleName: string,
  entryFile: string,
  context: CheckContext,
): Violation | null {
  const visited = new Set<string>([entryFile]);
  const queue: Array<{ file: string; chain: string[] }> = [
    { file: entryFile, chain: [display(context.root, entryFile)] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of collectEdges(getSourceFile(context, current.file))) {
      if (edge.typeOnly) continue;

      if (isPhaserSpecifier(edge.specifier)) {
        const chain = [...current.chain, edge.specifier];
        return makeViolation(
          moduleName,
          'phaser-value-import',
          chain,
          chain.join(' → '),
        );
      }

      const resolved = resolveSpecifier(edge.specifier, current.file, context);

      if (!resolved) {
        if (isRelativeSpecifier(edge.specifier)) {
          const chain = [...current.chain, edge.specifier];
          return makeViolation(
            moduleName,
            'unresolvable-local-import',
            chain,
            chain.join(' → '),
          );
        }
        if (matchesAliasPattern(edge.specifier, context.paths)) {
          const chain = [...current.chain, edge.specifier];
          return makeViolation(
            moduleName,
            'unresolvable-alias-import',
            chain,
            chain.join(' → '),
          );
        }
        // An unresolved bare specifier is an installed package that is not a
        // tsconfig alias: it is outside the engine graph, so not walked.
        continue;
      }

      const relative = path.relative(context.root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      if (relative.split(path.sep).includes('node_modules')) continue;
      if (!isScriptFile(resolved)) continue;
      if (visited.has(resolved)) continue;

      visited.add(resolved);
      queue.push({
        file: resolved,
        chain: [...current.chain, display(context.root, resolved)],
      });
    }
  }

  return null;
}

/** Resolve a manifest entry (a `src/ui` basename) to its module file. */
function resolveEntryFile(root: string, entry: string): string | null {
  const uiDir = path.join(root, 'src', 'ui');
  for (const candidate of [
    `${entry}.ts`,
    `${entry}.tsx`,
    `${entry}.d.ts`,
    path.join(entry, 'index.ts'),
  ]) {
    const absolute = path.join(uiDir, candidate);
    if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  }
  return null;
}

/** Read a violation as one CLI line. */
export function formatViolation(violation: Violation): string {
  return `${violation.module}: ${violation.message} — ${violation.chain.join(
    ' → ',
  )}`;
}

/**
 * Run the check. Deterministic and hermetic: the only inputs are the manifest
 * file (via `--manifest`) and the source tree (via `--root`).
 */
export function runCheck(options: CheckOptions = {}): CheckResult {
  const root = path.resolve(options.root ?? defaultRepoRoot());
  const manifestPath = path.resolve(
    options.manifestPath ?? path.join(root, 'src', 'ui', 'node-safe-modules.ts'),
  );

  const manifest = readManifest(manifestPath);
  if ('error' in manifest) {
    const manifestDisplay = display(root, manifestPath);
    return {
      ok: false,
      root,
      manifestPath,
      modules: [],
      violations: [
        makeViolation(
          manifestDisplay,
          'unparseable-manifest',
          [manifestDisplay],
          manifest.error,
        ),
      ],
    };
  }

  const context = createContext(root);
  const violations: Violation[] = [];

  for (const entry of manifest.modules) {
    const entryFile = resolveEntryFile(root, entry);
    if (!entryFile) {
      violations.push(
        makeViolation(
          entry,
          'missing-module',
          [`src/ui/${entry}.ts`],
          `src/ui/${entry}.ts not found`,
        ),
      );
      continue;
    }
    const violation = findViolation(entry, entryFile, context);
    if (violation) violations.push(violation);
  }

  return {
    ok: violations.length === 0,
    root,
    manifestPath,
    modules: manifest.modules,
    violations,
  };
}

/**
 * CLI entry point. Returns the process exit code and writes through `io` so
 * tests can assert on output without spawning a process.
 */
export function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = { write: (text) => process.stdout.write(text) },
): number {
  let json = false;
  let root: string | undefined;
  let manifest: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--root' || argument === '--manifest') {
      const value = argv[index + 1];
      if (!value) {
        io.write(`ui-node-surface: missing value for ${argument}\n${USAGE}`);
        return 2;
      }
      index += 1;
      if (argument === '--root') root = value;
      else manifest = value;
    } else if (argument === '--help' || argument === '-h') {
      io.write(USAGE);
      return 0;
    } else {
      io.write(`ui-node-surface: unknown argument "${argument}"\n${USAGE}`);
      return 2;
    }
  }

  let result: CheckResult;
  try {
    result = runCheck({
      root,
      manifestPath: manifest
        ? path.resolve(root ?? defaultRepoRoot(), manifest)
        : undefined,
    });
  } catch (error) {
    io.write(`ui-node-surface: ${(error as Error).message}\n`);
    return 2;
  }

  if (json) {
    io.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    io.write(
      `ui-node-surface: OK (${result.modules.length} module(s) checked)\n`,
    );
  } else {
    for (const violation of result.violations) {
      io.write(`${formatViolation(violation)}\n`);
    }
    io.write(`ui-node-surface: ${result.violations.length} violation(s)\n`);
  }

  return result.ok ? 0 : 1;
}

// Entry-point guard: only run the CLI when executed as a script, so the
// helpers can be imported by tests without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runCli());
}
