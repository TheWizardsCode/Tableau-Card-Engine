import { describe, expect, it, vi } from 'vitest';

import {
  VisibilityOwnershipController,
  type VisibilityOwnershipIssue,
} from '../../src/core-engine/VisibilityOwnership';

type MockVisibilityTarget = {
  visible: boolean;
  setVisible: (visible: boolean) => void;
};

function createTarget(initialVisible = false): MockVisibilityTarget {
  const target: MockVisibilityTarget = {
    visible: initialVisible,
    setVisible: vi.fn((visible: boolean) => {
      target.visible = visible;
    }),
  };

  return target;
}

function createController(issues: VisibilityOwnershipIssue[] = []): VisibilityOwnershipController<MockVisibilityTarget> {
  return new VisibilityOwnershipController<MockVisibilityTarget>({
    groupRules: {
      shell: {
        'shell-only': true,
        composed: true,
      },
      scene: {
        'scene-only': true,
        composed: true,
      },
      shared: {
        'shell-only': true,
        'scene-only': true,
        composed: true,
      },
    },
    reportIssue: issue => issues.push(issue),
  });
}

describe('VisibilityOwnershipController', () => {
  it('registers shell, scene, and shared groups and toggles them by mode', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const shell = createTarget();
    const scene = createTarget();
    const shared = createTarget();
    const multiGroup = createTarget();

    controller.register(shell, 'shell');
    controller.register(scene, 'scene');
    controller.register(shared, 'shared');
    controller.register(multiGroup, ['shell', 'shared']);

    controller.setMode('shell-only');
    expect(shell.visible).toBe(true);
    expect(scene.visible).toBe(false);
    expect(shared.visible).toBe(true);
    expect(multiGroup.visible).toBe(true);

    controller.setMode('scene-only');
    expect(shell.visible).toBe(false);
    expect(scene.visible).toBe(true);
    expect(shared.visible).toBe(true);
    expect(multiGroup.visible).toBe(true);

    controller.setMode('composed');
    expect(shell.visible).toBe(true);
    expect(scene.visible).toBe(true);
    expect(shared.visible).toBe(true);
    expect(multiGroup.visible).toBe(true);

    expect(issues).toHaveLength(0);
  });

  it('hides ungrouped targets and reports a diagnostic', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const ungrouped = createTarget(true);
    controller.register(ungrouped);

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
      groupNames: ['ungrouped'],
    });
    expect(issues[0].message).toContain('ungrouped');
  });

  it('keeps unknown groups hidden until rules are defined', () => {
    const issues: VisibilityOwnershipIssue[] = [];
    const controller = createController(issues);

    const experimental = createTarget();
    controller.register(experimental, 'experimental');

    controller.setMode('composed');
    expect(experimental.visible).toBe(false);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'UNKNOWN_GROUP',
      severity: 'warning',
      groupNames: ['experimental'],
    });

    controller.setGroupRules('experimental', {
      composed: true,
    });

    controller.setMode('shell-only');
    expect(experimental.visible).toBe(false);

    controller.setMode('composed');
    expect(experimental.visible).toBe(true);
  });
});
