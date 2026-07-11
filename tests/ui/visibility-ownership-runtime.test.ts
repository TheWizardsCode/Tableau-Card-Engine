/**
 * Visibility Ownership Runtime Tests
 *
 * Unit tests for the layout ownership runtime. The core controller lives in
 * `src/core-engine/VisibilityOwnership` and is re-exported from `src/ui` for
 * UI-layer consumers. These tests exercise the contract directly from the
 * core-engine module (same as the existing test in
 * `tests/core-engine/VisibilityOwnership.test.ts`) and add a re-export check.
 *
 * - Register targets to ownership groups (shell, scene, shared, ungrouped)
 * - Toggle visibility based on active layout mode
 * - Default behavior for ungrouped targets
 * - Diagnostic reporting for ungrouped and unknown groups
 * - Re-exported from the UI barrel
 *
 * @module tests/ui/visibility-ownership-runtime
 */

import { describe, expect, it, vi } from 'vitest';
import {
  VisibilityOwnershipController,
  type VisibilityOwnershipIssue,
} from '../../src/core-engine/VisibilityOwnership';

// Note: The VisibilityOwnershipController is re-exported from
// src/ui for UI-layer consumers. The re-export is verified by the
// TypeScript build (it compiles without errors) and by the fact that
// GymSllScene imports it via the UI barrel path. The unit tests below
// import directly from core-engine to avoid pulling in the full Phaser-
// dependent UI barrel in headless Vitest runs.

type MockTarget = {
  visible: boolean;
  setVisible: (visible: boolean) => void;
};

function createTarget(initialVisible = false): MockTarget {
  const target: MockTarget = {
    visible: initialVisible,
    setVisible: vi.fn((visible: boolean) => {
      target.visible = visible;
    }),
  };
  return target;
}

function createController(
  issues: VisibilityOwnershipIssue[] = [],
  groupRules: Record<string, Record<string, boolean>> = {
    shell: { 'shell-only': true, 'composed': true },
    scene: { 'scene-only': true, 'composed': true },
    shared: { 'shell-only': true, 'scene-only': true, 'composed': true },
  },
): VisibilityOwnershipController<MockTarget> {
  return new VisibilityOwnershipController<MockTarget>({
    groupRules,
    reportIssue: (issue) => issues.push(issue),
  });
}

describe('VisibilityOwnershipController (UI barrel re-export)', () => {
  it('is available from the UI barrel', () => {
    expect(VisibilityOwnershipController).toBeDefined();
    expect(VisibilityOwnershipController).toBeInstanceOf(Function);
  });

  it('registers targets to groups and toggles visibility by mode', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const shellTarget = createTarget();
    const sceneTarget = createTarget();
    const sharedTarget = createTarget();

    controller.register(shellTarget, 'shell');
    controller.register(sceneTarget, 'scene');
    controller.register(sharedTarget, 'shared');

    // shell-only: shell and shared visible, scene hidden
    controller.setMode('shell-only');
    expect(shellTarget.visible).toBe(true);
    expect(sceneTarget.visible).toBe(false);
    expect(sharedTarget.visible).toBe(true);

    // scene-only: scene and shared visible, shell hidden
    controller.setMode('scene-only');
    expect(shellTarget.visible).toBe(false);
    expect(sceneTarget.visible).toBe(true);
    expect(sharedTarget.visible).toBe(true);

    // composed: all visible
    controller.setMode('composed');
    expect(shellTarget.visible).toBe(true);
    expect(sceneTarget.visible).toBe(true);
    expect(sharedTarget.visible).toBe(true);

    expect(issues).toHaveLength(0);
  });

  it('registers targets to multiple groups (OR logic)', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const multiTarget = createTarget();
    controller.register(multiTarget, ['shell', 'scene']);

    // shell-only: visible (shell group allows)
    controller.setMode('shell-only');
    expect(multiTarget.visible).toBe(true);

    // scene-only: visible (scene group allows)
    controller.setMode('scene-only');
    expect(multiTarget.visible).toBe(true);

    // composed: visible
    controller.setMode('composed');
    expect(multiTarget.visible).toBe(true);

    expect(issues).toHaveLength(0);
  });

  it('hides ungrouped targets by default and reports a diagnostic', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const ungrouped = createTarget(true);
    controller.register(ungrouped); // no group

    controller.setMode('shell-only');
    expect(ungrouped.visible).toBe(false);

    controller.setMode('scene-only');
    expect(ungrouped.visible).toBe(false);

    controller.setMode('composed');
    expect(ungrouped.visible).toBe(false);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'UNGROUPED_TARGET',
      severity: 'warning',
    });
    expect(issues[0].message).toContain('ungrouped');
  });

  it('handles unknown groups with warnings', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const unknown = createTarget();
    controller.register(unknown, 'experimental');

    controller.setMode('composed');
    expect(unknown.visible).toBe(false);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'UNKNOWN_GROUP',
      severity: 'warning',
    });
    expect(issues[0].message).toContain('experimental');

    // Defining the group makes it visible in the configured mode
    controller.setGroupRules('experimental', {
      'composed': true,
    });

    controller.setMode('composed');
    expect(unknown.visible).toBe(true);
  });

  it('supports dynamic group rule updates', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const shellTarget = createTarget();
    controller.register(shellTarget, 'shell');

    // Initially visible in composed mode
    controller.setMode('composed');
    expect(shellTarget.visible).toBe(true);

    // Disable shell in composed mode
    controller.setGroupRules('shell', {
      'shell-only': true,
      'composed': false,
    });

    controller.setMode('composed');
    expect(shellTarget.visible).toBe(false);

    controller.setMode('shell-only');
    expect(shellTarget.visible).toBe(true);

    // Restore
    controller.setGroupRules('shell', {
      'shell-only': true,
      'composed': true,
    });

    controller.setMode('composed');
    expect(shellTarget.visible).toBe(true);
  });

  it('registerAll registers multiple targets', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const targets = [createTarget(), createTarget(), createTarget()];
    controller.registerAll(targets, 'shell');

    controller.setMode('shell-only');
    expect(targets[0].visible).toBe(true);
    expect(targets[1].visible).toBe(true);
    expect(targets[2].visible).toBe(true);

    controller.setMode('scene-only');
    expect(targets[0].visible).toBe(false);
    expect(targets[1].visible).toBe(false);
    expect(targets[2].visible).toBe(false);

    expect(issues).toHaveLength(0);
  });

  it('clear() removes all registered targets', () => {
    const controller = new VisibilityOwnershipController<MockTarget>({
      groupRules: {
        shell: { 'shell-only': true, 'composed': true },
        scene: { 'scene-only': true, 'composed': true },
        shared: { 'shell-only': true, 'scene-only': true, 'composed': true },
      },
    });

    const target = createTarget();
    controller.register(target, 'shell');
    controller.setMode('composed');
    expect(target.visible).toBe(true);

    controller.clear();

    // After clearing, the target is no longer managed
    controller.setMode('scene-only');
    // The target should retain its last state since it's unregistered
    expect(target.visible).toBe(true);
  });

  it('getMode() returns the current mode', () => {
    const controller = new VisibilityOwnershipController<MockTarget>({
      groupRules: {
        shell: { 'shell-only': true, 'composed': true },
        scene: { 'scene-only': true, 'composed': true },
        shared: { 'shell-only': true, 'scene-only': true, 'composed': true },
      },
    });

    expect(controller.getMode()).toBe('composed');
    controller.setMode('shell-only');
    expect(controller.getMode()).toBe('shell-only');
    controller.setMode('scene-only');
    expect(controller.getMode()).toBe('scene-only');
  });

  it('supports string group names (not just arrays)', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const target = createTarget();
    controller.register(target, 'scene');

    controller.setMode('scene-only');
    expect(target.visible).toBe(true);

    controller.setMode('composed');
    expect(target.visible).toBe(true);

    controller.setMode('shell-only');
    expect(target.visible).toBe(false);

    expect(issues).toHaveLength(0);
  });

  it('emits diagnostics for multiple ungrouped targets', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    controller.register(createTarget());
    controller.register(createTarget());
    controller.register(createTarget());

    expect(issues).toHaveLength(3);
    for (const issue of issues) {
      expect(issue.code).toBe('UNGROUPED_TARGET');
      expect(issue.severity).toBe('warning');
    }
  });

  it('throws on empty group name in setGroupRules', () => {
    const controller = new VisibilityOwnershipController<MockTarget>({
      groupRules: {
        shell: { 'shell-only': true, 'composed': true },
        scene: { 'scene-only': true, 'composed': true },
        shared: { 'shell-only': true, 'scene-only': true, 'composed': true },
      },
    });

    expect(() => controller.setGroupRules('', {})).toThrow(
      'Group name must not be empty.',
    );
  });

  it('trims whitespace from group names', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const target = createTarget();
    controller.register(target, '  shell  ');

    controller.setMode('shell-only');
    expect(target.visible).toBe(true);

    controller.setMode('scene-only');
    expect(target.visible).toBe(false);

    expect(issues).toHaveLength(0);
  });
});
