/**
 * Package workflow — Windows release promotion contract (CG-0MUOAXDKB008BOK5).
 *
 * `.github/workflows/package.yml` builds `TCE-Setup-<version>.exe` and uploads
 * it as the `tce-windows-installer` artifact, then the `promote-release` job
 * promotes it to a DRAFT GitHub Release via
 * `.pi/skills/release-windows/scripts/promote-windows-release.mjs`.
 *
 * This is a config-contract test (like `deploy-workflow.test.ts`): it pins the
 * workflow wiring, not engine behaviour. It fails if the promotion job loses
 * its tag-only trigger or `continue-on-error` (a promotion failure must never
 * fail the workflow), if the dry-run pre-flight disappears or stops running
 * before the real promotion, or if the run stops being pinned to
 * `github.run_id` (the "latest successful run" auto-resolve would otherwise
 * pick the *previous* release on a tag push).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_WORKFLOW = path.join(
  REPO_ROOT,
  '.github',
  'workflows',
  'package.yml',
);
const ELECTRON_BUILDER_CONFIG = path.join(REPO_ROOT, 'electron-builder.yml');

const ARTIFACT_NAME = 'tce-windows-installer';
const PROMOTE_JOB = 'promote-release';
const SCRIPT_RELATIVE_PATH =
  '.pi/skills/release-windows/scripts/promote-windows-release.mjs';

const workflowSource = fs.readFileSync(PACKAGE_WORKFLOW, 'utf-8');

interface WorkflowStep {
  name: string;
  /** Raw YAML block for the step, from its `- name:` line to the next step. */
  body: string;
}

/** Return the YAML block for a top-level job (from `  <name>:` to the next). */
function extractJob(workflow: string, jobName: string): string | null {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const nextJobOffset = rest.findIndex((line) => /^ {2}\S/.test(line));
  const body = nextJobOffset === -1 ? rest : rest.slice(0, nextJobOffset);
  return body.join('\n');
}

/** Split a job body's `steps:` list into its named steps, in order. */
function parseSteps(jobBody: string): WorkflowStep[] {
  const blocks = jobBody.split(/\n(?=\s*-\s*name:)/);
  const steps: WorkflowStep[] = [];
  for (const block of blocks) {
    const name = block.match(/^\s*-\s*name:\s*(.+?)\s*$/m);
    if (name) steps.push({ name: name[1], body: block });
  }
  return steps;
}

const promoteJob = extractJob(workflowSource, PROMOTE_JOB);
const jobText = promoteJob ?? '';
const steps = promoteJob ? parseSteps(promoteJob) : [];
const dryRunSteps = steps.filter((s) => s.name === 'Pre-flight promotion (dry-run)');
const promoteSteps = steps.filter(
  (s) => s.name === 'Promote Windows installer to draft release',
);

describe('package workflow: promote-release job', () => {
  it('defines exactly one promote-release job', () => {
    expect(promoteJob, `no ${PROMOTE_JOB} job in package.yml`).not.toBeNull();
  });

  it('runs only after package-windows succeeds', () => {
    expect(jobText).toMatch(/^\s*needs:\s*package-windows\s*$/m);
  });

  it('runs only on version-tag pushes', () => {
    expect(jobText).toMatch(
      /^\s*if:\s*startsWith\(github\.ref,\s*'refs\/tags\/v'\)\s*$/m,
    );
  });

  it('is non-blocking (continue-on-error)', () => {
    // A promotion failure must not fail the workflow / Pages deploy.
    expect(jobText).toMatch(/^\s*continue-on-error:\s*true\s*$/m);
  });

  it('declares the permissions needed to download the artifact and create a release', () => {
    expect(jobText).toMatch(/^\s*contents:\s*write\b/m);
    expect(jobText).toMatch(/^\s*actions:\s*read\b/m);
  });

  it('has a dry-run pre-flight step and a real promotion step', () => {
    expect(dryRunSteps).toHaveLength(1);
    expect(promoteSteps).toHaveLength(1);
  });

  it('runs the dry-run pre-flight before the real promotion', () => {
    expect(dryRunSteps).toHaveLength(1);
    expect(promoteSteps).toHaveLength(1);
    const dryRunIndex = steps.indexOf(dryRunSteps[0]);
    const promoteIndex = steps.indexOf(promoteSteps[0]);
    expect(dryRunIndex).toBeGreaterThanOrEqual(0);
    expect(promoteIndex).toBeGreaterThan(dryRunIndex);
  });

  it('pre-flight invokes the promote helper with --dry-run and pins the run', () => {
    const body = dryRunSteps[0].body;
    expect(body).toContain(SCRIPT_RELATIVE_PATH);
    expect(body).toContain('--dry-run');
    expect(body).toContain('--run-id');
    expect(body).toContain('github.run_id');
  });

  it('real promotion invokes the promote helper (not --dry-run) and pins the run', () => {
    const body = promoteSteps[0].body;
    expect(body).toContain(SCRIPT_RELATIVE_PATH);
    expect(body).not.toContain('--dry-run');
    expect(body).toContain('--run-id');
    expect(body).toContain('github.run_id');
  });
});

describe('package workflow: installer artifact contract', () => {
  it('uploads the NSIS installer under the artifact the promotion expects', () => {
    // The promotion downloads this exact artifact name.
    expect(workflowSource).toContain(`name: ${ARTIFACT_NAME}`);
    expect(workflowSource).toContain('release/TCE-Setup-*.exe');
  });

  it('names the NSIS installer TCE-Setup-<version>.exe (version source of truth)', () => {
    // The script derives the release version from this filename, so the
    // electron-builder artifactName is the single source of truth.
    const builderConfig = fs.readFileSync(ELECTRON_BUILDER_CONFIG, 'utf-8');
    expect(builderConfig).toContain('artifactName: TCE-Setup-${version}.${ext}');
  });
});
