/**
 * Release doc ↔ deploy workflow consistency (CG-0MUIGWT96001UEY7).
 *
 * Asserts that `RELEASE.md`'s deploy-workflow description matches the live
 * `.github/workflows/deploy.yml` — same step names in the same order, and that
 * stale steps (Playwright install, Monte Carlo job, `npm test`) are not claimed
 * anywhere in the deploy-workflow narrative.  This is a contract test: either
 * the doc or the workflow must be updated together when the deploy pipeline
 * changes, otherwise the test fails.
 *
 * The Windows binary / Steam sections of `RELEASE.md` are out of scope (owned
 * by `CG-0MUOAXTMG004FGPY`), so this test focuses only on the
 * deploy-workflow / CI-and-tests content.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEPLOY_WORKFLOW = path.join(
  REPO_ROOT,
  '.github',
  'workflows',
  'deploy.yml',
);
const RELEASE_MD = path.join(REPO_ROOT, 'RELEASE.md');

/** Split a workflow's `steps:` list into its named steps, in order. */
function parseWorkflowSteps(workflow: string): string[] {
  return workflow
    .split(/\n(?=\s*-\s*name:)/)
    .map((block) => block.match(/^\s*-\s*name:\s*(.+?)\s*$/m))
    .filter(Boolean)
    .map((m) => m![1]);
}

/**
 * Extract the numbered deploy-steps from RELEASE.md's
 * "What the release workflow does" section.
 *
 * Returns the step-name strings (the text after "N. ") — the step
 * *labels*, not the raw body text — so we can assert on stable names.
 *
 * Note: the lookahead uses `[A-Z]` (not `\w`) because `\w` matches digits
 * and the first numbered step ("1. Checkout") starts with `\n1.` which
 * would prematurely truncate the capture group.
 */
function parseReleaseDeploySteps(text: string): string[] {
  // The section runs from the heading "What the release workflow does"
  // through the next section heading (capital letter after a newline).
  // Lookahead: \n[A-Z] | \n--- | $   (grouped inside (?=...))
  const sectionMatch = text.match(
    /What the release workflow does\n-+\n([\s\S]*?)(?=\n[A-Z]|\n---|$)/,
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  // Match numbered steps: "N. Step name…"
  const stepNames: string[] = [];
  const numbered = section.matchAll(/^\d+\.\s+(.+)$/gm);
  for (const m of numbered) {
    stepNames.push(m[1].trim());
  }
  return stepNames;
}

/**
 * Extract the prose body of "What the release workflow does" (step list +
 * surrounding paragraphs).  We assert on stable substrings so the test is
 * resilient to rewording.
 */
function getDeployStepProse(text: string): string {
  const sectionMatch = text.match(
    /What the release workflow does\n-+\n([\s\S]*?)(?=\n[A-Z]|\n---|$)/,
  );
  return sectionMatch ? sectionMatch[1] : '';
}

describe('RELEASE.md deploy-workflow steps match deploy.yml', () => {
  const workflowText = fs.readFileSync(DEPLOY_WORKFLOW, 'utf-8');
  const releaseText = fs.readFileSync(RELEASE_MD, 'utf-8');
  const workflowSteps = parseWorkflowSteps(workflowText);
  const releaseSteps = parseReleaseDeploySteps(releaseText);
  const prose = getDeployStepProse(releaseText);

  it('has the same number of workflow steps as documented', () => {
    expect(releaseSteps.length).toBe(workflowSteps.length);
  });

  it('lists the same step names in the same order', () => {
    expect(releaseSteps).toEqual(workflowSteps);
  });

  it('does not claim a Playwright Chromium install step', () => {
    expect(prose).not.toContain('Playwright');
  });

  it('does not claim a Monte Carlo job as part of the deploy workflow', () => {
    expect(prose).not.toContain('Monte Carlo');
  });

  it('does not claim an `npm test` step in the deploy workflow', () => {
    expect(prose).not.toContain('npm test');
  });
});

describe('RELEASE.md "Important notes about CI and tests" is correct', () => {
  const releaseText = fs.readFileSync(RELEASE_MD, 'utf-8');

  function ciTestNotes(): string | null {
    // Lookahead: \n[A-Z] | \n--- | $
    const m = releaseText.match(
      /Important notes about CI and tests\n-+\n([\s\S]*?)(?=\n[A-Z]|\n---|$)/,
    );
    return m ? m[1] : null;
  }

  it('states that CI is build-only', () => {
    const notes = ciTestNotes();
    expect(notes).not.toBeNull();
    expect(notes).toMatch(/build[- ]only/i);
  });

  it('states that tests are run locally, not by CI', () => {
    const notes = ciTestNotes();
    expect(notes).not.toBeNull();
    expect(notes).toMatch(/local/i);
    expect(notes).not.toMatch(/main branch CI runs a stricter set of Monte/);
  });
});

describe('RELEASE.md "Reproduce main CI tests" is correct', () => {
  const releaseText = fs.readFileSync(RELEASE_MD, 'utf-8');

  function manualCommands(): string | null {
    // Lookahead: \n[A-Z] | \n--- | $
    const m = releaseText.match(
      /Manual commands \(local\)\n-+\n([\s\S]*?)(?=\n[A-Z]|\n---|$)/,
    );
    return m ? m[1] : null;
  }

  it('presents Monte Carlo as a local-only balance tool', () => {
    const cmds = manualCommands();
    expect(cmds).not.toBeNull();
    expect(cmds).not.toMatch(/Reproduce main CI tests/);
  });
});

describe('RELEASE.md "Where the workflow lives" is correct', () => {
  const releaseText = fs.readFileSync(RELEASE_MD, 'utf-8');

  function workflowLocation(): string | null {
    // Lookahead: \n[A-Z] | \n--- | $
    const m = releaseText.match(
      /Where the workflow lives\n-+\n([\s\S]*?)(?=\n[A-Z]|\n---|$)/,
    );
    return m ? m[1] : null;
  }

  it('does not claim Monte Carlo artifacts are uploaded by the deploy workflow', () => {
    const section = workflowLocation();
    expect(section).not.toBeNull();
    expect(section).not.toContain('Monte Carlo');
  });
});
