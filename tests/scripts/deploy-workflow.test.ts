/**
 * Deploy workflow preset regression (CG-0MUGSGH7Q002NOA1).
 *
 * `.github/workflows/deploy.yml` publishes the launcher distribution to GitHub
 * Pages. The config-driven game-discovery plugin
 * (`scripts/vite-game-discovery-plugin.ts`) defaults to the `core-only` preset
 * when `GAMES_CONFIG` is unset, so the deploy Build step MUST pin the all-games
 * preset (`full`) or the published site silently ships only the Gym.
 *
 * The core repo carries no games at HEAD (multi-repo architecture): the plugin
 * resolves every game as a sibling checkout (`../tce-<game>`). A `full` build
 * in CI therefore also requires the game repos to be composed first — the same
 * "Compose sibling game repositories" step `package.yml` uses
 * (CG-0MULGC6VP008GPH2). Without it `GAMES_CONFIG=full` fails the Pages build
 * outright instead of shipping the games.
 *
 * This is a config-contract test (like `distribution-presets.test.ts`): it
 * pins the workflow wiring, not engine behaviour. It deliberately fails if the
 * `GAMES_CONFIG` assignment is removed from the Build step (silent regression
 * to `core-only`), if the sibling-composition step disappears, or if the stale,
 * non-existent `all` preset reappears — `selectConfigPath()` treats an unknown
 * preset name as a hard build error, so `GAMES_CONFIG=all` would break the
 * Pages build outright.
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

/** The canonical "every game" preset (configs/full.json). */
const ALL_GAMES_PRESET = 'full';
/** Preset that is the single source of truth for the composed game set. */
const PRESET_FILE = 'configs/full.json';
/** GitHub org that owns the sibling game repositories. */
const GAME_REPO_ORG = 'TheWizardsCode';

interface WorkflowStep {
  name: string;
  /** Raw YAML block for the step, from its `- name:` line to the next step. */
  body: string;
}

/** Split a workflow's `steps:` list into its named steps, in order. */
function parseSteps(workflow: string): WorkflowStep[] {
  const blocks = workflow.split(/\n(?=\s*-\s*name:)/);
  const steps: WorkflowStep[] = [];
  for (const block of blocks) {
    const name = block.match(/^\s*-\s*name:\s*(.+?)\s*$/m);
    if (name) steps.push({ name: name[1], body: block });
  }
  return steps;
}

const workflowSource = fs.readFileSync(DEPLOY_WORKFLOW, 'utf-8');
const steps = parseSteps(workflowSource);
const buildSteps = steps.filter((s) => s.name === 'Build');
const composeSteps = steps.filter(
  (s) => s.name === 'Compose sibling game repositories',
);

describe('deploy workflow selects the all-games preset', () => {
  it('has exactly one Build step', () => {
    expect(buildSteps).toHaveLength(1);
  });

  it('pins GAMES_CONFIG to the all-games preset on the Build step', () => {
    const build = buildSteps[0];
    expect(build, 'no Build step in deploy.yml').toBeDefined();

    const runCommand = build.body.match(/^\s*run:\s*(.+?)\s*$/m)?.[1];
    expect(runCommand, 'Build step has no run command').toBeDefined();

    // Without this the build falls back to `core-only` and the deployed site
    // loses every game except the Gym.
    expect(runCommand).toContain(`GAMES_CONFIG=${ALL_GAMES_PRESET}`);
    expect(runCommand).toContain('npm run build');
  });

  it('composes the sibling game repositories before the Build step', () => {
    // The core repo carries no games at HEAD; the plugin resolves them as
    // siblings (`../tce-<game>`). A `full` build therefore needs the game
    // repos composed first, exactly as package.yml does.
    expect(composeSteps).toHaveLength(1);

    const compose = composeSteps[0];
    expect(compose.body).toContain(PRESET_FILE);
    expect(compose.body).toContain(GAME_REPO_ORG);

    const composeIndex = steps.indexOf(compose);
    const buildIndex = steps.indexOf(buildSteps[0]);
    expect(composeIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(composeIndex);
  });

  it('does not reference the non-existent `all` preset', () => {
    // `selectConfigPath()` hard-fails on an unknown preset, so a literal
    // `GAMES_CONFIG=all` would break the Pages build.
    expect(workflowSource).not.toMatch(/GAMES_CONFIG\s*=\s*all\b/);
  });
});
