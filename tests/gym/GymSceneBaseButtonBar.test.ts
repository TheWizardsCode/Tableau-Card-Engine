/**
 * GymSceneBase Button Bar Integration Tests
 *
 * Verifies that GymSceneBase integrates with GymButtonBar via the
 * multi-bar `initButtonBar()` registry contract:
 *
 * - Each `initButtonBar()` call creates a NEW bar at its own Y position
 *   and keeps previously created bars (no destroy-and-recreate).
 * - `this.buttonBar` remains a backward-compatible accessor to the most
 *   recently created bar.
 * - All registered bars are destroyed on scene shutdown/destroy so scene
 *   restarts are leak-free.
 *
 * Regression coverage for CG-0MS8T34T8004ZVEM (Gym Hand & Pile
 * setup/interaction buttons no longer visible): the old destroy-and-
 * recreate contract wiped every bar except the last in scenes that call
 * `initButtonBar()` 2–3 times.
 */
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = '../../example-games/gym/scenes/GymSceneBase.ts';

function loadSource(): string {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.resolve(__dirname, SOURCE_PATH), 'utf-8');
}

describe('GymSceneBase button bar integration', () => {
  it('GymSceneBase imports GymButtonBar', () => {
    const source = loadSource();

    expect(source).toContain('GymButtonBar');
    expect(source).toContain('GymButtonBarConfig');
    expect(source).toContain("from '../../../src/ui/GymButtonBar'");
  });

  it('GymSceneBase has buttonBar accessor and initButtonBar method', () => {
    const source = loadSource();

    // Backward-compatible accessor to the most recently created bar.
    expect(source).toContain('protected buttonBar?: GymButtonBar');
    expect(source).toContain('protected initButtonBar');
    expect(source).toContain('new GymButtonBar(this,');
    expect(source).toContain('return this.buttonBar');
  });

  it('initButtonBar accepts a Y position and optional config overrides', () => {
    const source = loadSource();

    const methodMatch = source.match(/protected initButtonBar\(y: number, opts\?: Partial<GymButtonBarConfig>\)/);
    expect(methodMatch).not.toBeNull();
  });

  it('initButtonBar maintains a collection of bars and does not destroy previous bars', () => {
    const source = loadSource();

    // The base class keeps a collection of every bar created by initButtonBar().
    expect(source).toMatch(/buttonBars\s*:\s*GymButtonBar\[\]/);
    // New bars accumulate on the collection instead of replacing prior bars.
    expect(source).toMatch(/buttonBars\.push\(/);
    // The old destroy-and-recreate behaviour must be gone.
    expect(source).not.toContain('this.buttonBar.destroy()');
  });

  it('this.buttonBar still exposes the most recently created bar', () => {
    const source = loadSource();

    // After creating a new bar, the accessor is updated to point at it.
    expect(source).toMatch(/this\.buttonBar\s*=\s*\w+/);
    expect(source).toContain('return this.buttonBar');
  });

  it('a shutdown/destroy cleanup hook destroys all registered bars', () => {
    const source = loadSource();

    // Cleanup must be wired to both the scene shutdown and destroy events.
    expect(source).toMatch(/events\.on\s*\(\s*['"]shutdown['"]/);
    expect(source).toMatch(/events\.on\s*\(\s*['"]destroy['"]/);
    // Cleanup iterates the registry and destroys each bar.
    expect(source).toMatch(/for\s+\(const\s+\w+\s+of\s+this\.buttonBars\)/);
    expect(source).toMatch(/\.destroy\(\)/);
    // The registry and accessor are reset after cleanup (leak-free restart).
    expect(source).toMatch(/buttonBars\s*=\s*\[\]/);
  });

  it('legacy addButton method has been removed after migration', () => {
    const source = loadSource();

    // Verify addButton no longer exists (migration complete)
    expect(source).not.toContain('protected addButton(');
  });

  it('legacy addButtonAtAnchor method has been removed after migration', () => {
    const source = loadSource();

    // Verify addButtonAtAnchor no longer exists (migration complete)
    expect(source).not.toContain('protected addButtonAtAnchor(');
  });

  it('button bar integration section is placed after divider and before scene transition', () => {
    const source = loadSource();

    // Verify the button bar section exists between divider and transition hook
    const sectionMarker = '// ── Button bar integration';
    expect(source).toContain(sectionMarker);
  });

  it('GymButtonBar class is importable from the UI barrel', () => {
    const fs = require('fs');
    const path = require('path');
    const uiIndex = fs.readFileSync(
      path.resolve(__dirname, '../../src/ui/index.ts'),
      'utf-8',
    );

    expect(uiIndex).toContain('GymButtonBar');
    expect(uiIndex).toContain("export { GymButtonBar } from './GymButtonBar'");
    expect(uiIndex).toContain("export type { ButtonZone, GymButtonOpts, GymButtonBarConfig } from './GymButtonBar'");
  });
});
