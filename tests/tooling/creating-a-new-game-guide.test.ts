/**
 * Docs-consistency guard for the canonical "creating a new game" guide
 * (`docs/dev/creating-a-new-game.md`) and the slimmed `tce-game-dev` skill.
 *
 * The guide is a hand-maintained navigation layer; without a guard it drifts
 * exactly like the skill did (retired in-tree `example-games/<game>/` model,
 * a central `main.ts` scene array). This test pins the contract from
 * CG-0MUZR9UST0080XAK:
 *
 * - the guide exists and has a heading for every required lifecycle stage;
 * - every relative Markdown link resolves to an existing file, and every
 *   in-file anchor resolves to an existing heading;
 * - the guide links to the authoritative deep dives (it is a navigation
 *   layer, not a duplicate);
 * - neither the guide nor the skill reintroduces the retired monorepo
 *   guidance;
 * - the guide is reachable from `README.md` and `docs/DEVELOPER.md`;
 * - the skill retains §1/§16/§17 and stays slim.
 *
 * The test is pure filesystem reads in the Node `unit` project: no network
 * access and no filesystem writes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Paths and contract constants
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..');

const GUIDE_REL = 'docs/dev/creating-a-new-game.md';
const GUIDE_PATH = join(REPO_ROOT, ...GUIDE_REL.split('/'));
const SKILL_REL = '.pi/skills/tce-game-dev/SKILL.md';
const SKILL_PATH = join(REPO_ROOT, ...SKILL_REL.split('/'));
const README_PATH = join(REPO_ROOT, 'README.md');
const DEVELOPER_REL = 'docs/DEVELOPER.md';
const DEVELOPER_PATH = join(REPO_ROOT, ...DEVELOPER_REL.split('/'));

/**
 * The ten lifecycle stages the canonical guide must cover. Each entry must
 * appear as (the start of) a heading in the guide.
 */
const REQUIRED_LIFECYCLE_SECTIONS = [
  'Concept and ideation',
  'Intake and planning',
  'Repository scaffold and multi-repo setup',
  'Architecture and implementation',
  'Testing profiles',
  'CI and release',
  'Game registration',
  'Assets and licensing',
  'Documentation update',
  'Publication',
];

/**
 * Authoritative deep dives the guide must link to rather than restate.
 * Expressed relative to the repository root.
 */
const REQUIRED_DEEP_DIVE_LINKS = [
  'docs/dev/multi-repo-architecture.md',
  'docs/dev/game-configuration.md',
  'docs/dev/per-game-src-layout-decision.md',
  'docs/DEVELOPER.md',
  '.pi/skills/tce-game-dev/SKILL.md',
];

/**
 * Guidance retired by the multi-repo split. None of these may reappear in the
 * guide or the slimmed skill.
 */
const RETIRED_PHRASES: RegExp[] = [
  /flat monorepo/i,
  /GAMES\s+array/i,
  /`GAMES`\s+(?:catalogue|array)/i,
  /add\s+(?:a\s+)?(?:scene|GameEntry|it)\s+to\s+the\s+`?GAMES/i,
];

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

interface MarkdownHeading {
  level: number;
  text: string;
  slug: string;
}

/** Remove fenced code blocks so links/headings inside them are ignored. */
function stripFencedCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '');
}

/**
 * GitHub-style heading slug. Keeps letters, numbers, spaces, hyphens and
 * underscores; drops everything else; replaces each whitespace character with
 * a hyphen (so "Hand & Pile" → "hand--pile", matching GitHub's anchor).
 */
function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Normalise a heading/section title for comparison. */
function normaliseSectionTitle(text: string): string {
  return text
    .replace(/^\d+[.)]?\s*/, '')
    .replace(/[`*]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  for (const rawLine of stripFencedCode(markdown).split('\n')) {
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(rawLine);
    if (!match) continue;
    const text = match[2].trim();
    headings.push({ level: match[1].length, text, slug: slugifyHeading(text) });
  }
  return headings;
}

interface MarkdownLink {
  text: string;
  target: string;
}

/** Extract Markdown links and images, ignoring fenced code blocks. */
function extractLinks(markdown: string): MarkdownLink[] {
  const body = stripFencedCode(markdown);
  const links: MarkdownLink[] = [];
  const re = /!?\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const target = match[2].trim().replace(/^<|>$/g, '').split(/\s+/)[0];
    links.push({ text: match[1], target });
  }
  return links;
}

function readGuide(): string {
  expect(existsSync(GUIDE_PATH), `missing canonical guide: ${GUIDE_REL}`).toBe(true);
  return readFileSync(GUIDE_PATH, 'utf-8');
}

function toRepoRelative(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split(sep).join('/');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('canonical creating-a-new-game guide', () => {
  it('exists and covers every required lifecycle stage as a heading', () => {
    const guide = readGuide();
    const headings = extractHeadings(guide);
    const normalised = headings.map((h) => normaliseSectionTitle(h.text));

    for (const section of REQUIRED_LIFECYCLE_SECTIONS) {
      const wanted = section.toLowerCase();
      const found = normalised.some((title) => title.startsWith(wanted));
      expect(
        found,
        `guide is missing a heading for lifecycle stage "${section}"`,
      ).toBe(true);
    }
  });

  it('resolves every relative link and in-file anchor', () => {
    const guide = readGuide();
    const guideSlugs = new Set(
      extractHeadings(guide).map((h) => h.slug),
    );
    const guideDir = dirname(GUIDE_PATH);
    const links = extractLinks(guide);

    expect(links.length, 'guide should contain navigation links').toBeGreaterThan(0);

    const linkedRepoPaths = new Set<string>();

    for (const link of links) {
      const { target } = link;
      // Ignore external schemes (http:, https:, mailto:, tel:, ...).
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

      const [pathPart, anchor] = target.split('#');

      if (!pathPart) {
        expect(
          guideSlugs.has(anchor),
          `in-file anchor does not resolve: ${target}`,
        ).toBe(true);
        continue;
      }

      const resolvedPath = resolve(guideDir, decodeURIComponent(pathPart));
      expect(
        existsSync(resolvedPath),
        `relative link target does not exist: ${target} (resolved to ${resolvedPath})`,
      ).toBe(true);
      linkedRepoPaths.add(toRepoRelative(resolvedPath));

      if (anchor) {
        const targetSlugs = new Set(
          extractHeadings(readFileSync(resolvedPath, 'utf-8')).map((h) => h.slug),
        );
        expect(
          targetSlugs.has(anchor),
          `anchor #${anchor} does not resolve in ${pathPart}`,
        ).toBe(true);
      }
    }

    for (const required of REQUIRED_DEEP_DIVE_LINKS) {
      expect(
        linkedRepoPaths.has(required),
        `guide must link to the authoritative deep dive ${required}`,
      ).toBe(true);
    }
  });

  it('references the optional systems, cross-repo rules and definition of done', () => {
    const guide = readGuide();
    expect(guide, 'guide must reference reduced motion').toMatch(/reduced[-\s]?motion/i);
    expect(guide, 'guide must reference Steam achievements').toMatch(/steam achievements/i);
    expect(guide, 'guide must reference runtime game plugins').toMatch(/runtime (game )?plugins?/i);
    expect(guide, 'guide must state the dev-only push rule').toMatch(/never\s+`?main`?/i);
    expect(
      guide,
      'guide must point at the skill checklist (single source of truth)',
    ).toContain(SKILL_REL);
  });

  it('does not reintroduce the retired monorepo guidance', () => {
    const targets: Array<[string, string]> = [
      ['guide', GUIDE_PATH],
      ['tce-game-dev skill', SKILL_PATH],
    ];
    for (const [label, path] of targets) {
      expect(existsSync(path), `${label} should exist at ${path}`).toBe(true);
      const text = readFileSync(path, 'utf-8');
      for (const pattern of RETIRED_PHRASES) {
        expect(text, `${label} contains retired phrase ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('is reachable from README.md and docs/DEVELOPER.md', () => {
    for (const [label, path] of [
      ['README.md', README_PATH],
      ['docs/DEVELOPER.md', DEVELOPER_PATH],
    ] as const) {
      expect(
        readFileSync(path, 'utf-8'),
        `${label} must link the canonical guide`,
      ).toContain('creating-a-new-game.md');
    }
  });
});

describe('slimmed tce-game-dev skill', () => {
  it('retains §1 (when to use), §16 (pitfalls) and §17 (definition of done)', () => {
    const skill = readFileSync(SKILL_PATH, 'utf-8');
    const h2 = extractHeadings(skill)
      .filter((h) => h.level === 2)
      .map((h) => h.text);

    expect(h2.some((t) => /^1\./.test(t)), 'skill must retain §1').toBe(true);
    expect(h2.some((t) => /^16\./.test(t)), 'skill must retain §16').toBe(true);
    expect(h2.some((t) => /^17\./.test(t)), 'skill must retain §17').toBe(true);
  });

  it('is slim rather than monolithic', () => {
    const lineCount = readFileSync(SKILL_PATH, 'utf-8').split('\n').length;
    expect(lineCount, 'skill should not re-bloat past ~200 lines').toBeLessThanOrEqual(220);
  });
});
