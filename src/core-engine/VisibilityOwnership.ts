export type VisibilityMode = 'shell-only' | 'scene-only' | 'composed';

export type VisibilityModeRuleSet = Partial<Record<VisibilityMode, boolean>>;

export interface VisibilityTarget {
  setVisible(visible: boolean): unknown;
}

export type VisibilityOwnershipIssueCode = 'UNGROUPED_TARGET' | 'UNKNOWN_GROUP';

export interface VisibilityOwnershipIssue {
  code: VisibilityOwnershipIssueCode;
  severity: 'warning';
  message: string;
  groupNames: readonly string[];
}

export type VisibilityOwnershipIssueReporter = (
  issue: VisibilityOwnershipIssue,
) => void;

export interface VisibilityOwnershipControllerOptions {
  /**
   * Group-level visibility rules. Targets registered to one or more groups are
   * visible when at least one of their groups is visible in the active mode.
   */
  groupRules?: Record<string, VisibilityModeRuleSet>;
  /**
   * Group used when `register()` is called without any ownership groups.
   * Defaults to `ungrouped`.
   */
  defaultGroupName?: string;
  /**
   * Optional diagnostic hook for ungrouped or unknown-group registrations.
   */
  reportIssue?: VisibilityOwnershipIssueReporter;
}

interface RegisteredTarget<T extends VisibilityTarget> {
  target: T;
  groupNames: readonly string[];
}

const DEFAULT_GROUP_RULES: Record<string, VisibilityModeRuleSet> = {
  shell: {
    'shell-only': true,
    'composed': true,
  },
  scene: {
    'scene-only': true,
    'composed': true,
  },
  shared: {
    'shell-only': true,
    'scene-only': true,
    'composed': true,
  },
  ungrouped: {
    'shell-only': false,
    'scene-only': false,
    'composed': false,
  },
};

function normalizeGroupNames(groupNames?: string | readonly string[]): readonly string[] {
  if (typeof groupNames === 'string') {
    return groupNames.trim().length > 0 ? [groupNames.trim()] : [];
  }

  return (groupNames ?? [])
    .map(groupName => groupName.trim())
    .filter((groupName): groupName is string => groupName.length > 0);
}

/**
 * Reusable ownership/visibility controller for scene-owned and shell-owned UI.
 *
 * Targets can be registered into one or more ownership groups. The controller
 * then toggles the targets' `setVisible()` state whenever the active mode
 * changes.
 */
export class VisibilityOwnershipController<T extends VisibilityTarget = VisibilityTarget> {
  private readonly defaultGroupName: string;
  private readonly reportIssue?: VisibilityOwnershipIssueReporter;
  private readonly groupRules = new Map<string, VisibilityModeRuleSet>();
  private readonly registrations = new Set<RegisteredTarget<T>>();
  private currentMode: VisibilityMode = 'composed';

  constructor(options: VisibilityOwnershipControllerOptions = {}) {
    this.defaultGroupName = options.defaultGroupName?.trim() || 'ungrouped';
    this.reportIssue = options.reportIssue;

    for (const [groupName, rules] of Object.entries(DEFAULT_GROUP_RULES)) {
      this.groupRules.set(groupName, { ...rules });
    }

    if (options.groupRules) {
      for (const [groupName, rules] of Object.entries(options.groupRules)) {
        this.groupRules.set(groupName, { ...rules });
      }
    }

    if (!this.groupRules.has(this.defaultGroupName)) {
      this.groupRules.set(this.defaultGroupName, { ...DEFAULT_GROUP_RULES.ungrouped });
    }
  }

  /**
   * Register a target under one or more ownership groups.
   *
   * When no groups are supplied the target is assigned to the default group,
   * which is hidden unless explicitly configured otherwise.
   */
  register(target: T, groupNames?: string | readonly string[]): T {
    const normalizedGroups = normalizeGroupNames(groupNames);
    const effectiveGroups = normalizedGroups.length > 0 ? normalizedGroups : [this.defaultGroupName];

    if (normalizedGroups.length === 0) {
      this.reportIssue?.({
        code: 'UNGROUPED_TARGET',
        severity: 'warning',
        groupNames: effectiveGroups,
        message: `Target registered without ownership groups; assigned to default group "${this.defaultGroupName}".`,
      });
    } else if (effectiveGroups.every(groupName => !this.groupRules.has(groupName))) {
      this.reportIssue?.({
        code: 'UNKNOWN_GROUP',
        severity: 'warning',
        groupNames: effectiveGroups,
        message: `Target registered to unknown ownership group(s): ${effectiveGroups.join(', ')}.`,
      });
    }

    this.registrations.add({
      target,
      groupNames: effectiveGroups,
    });

    this.syncTarget(target, effectiveGroups);
    return target;
  }

  /** Register multiple targets under the same ownership group set. */
  registerAll(targets: Iterable<T>, groupNames?: string | readonly string[]): void {
    for (const target of targets) {
      this.register(target, groupNames);
    }
  }

  /** Update the visibility rules for a named ownership group. */
  setGroupRules(groupName: string, rules: VisibilityModeRuleSet): void {
    const normalizedGroupName = groupName.trim();
    if (normalizedGroupName.length === 0) {
      throw new Error('Group name must not be empty.');
    }

    this.groupRules.set(normalizedGroupName, { ...rules });
    this.syncAll();
  }

  /** Select the active layout mode and apply it to all registered targets. */
  setMode(mode: VisibilityMode): void {
    this.currentMode = mode;
    this.syncAll();
  }

  /** Read the currently active layout mode. */
  getMode(): VisibilityMode {
    return this.currentMode;
  }

  /** Remove every registered target without altering group rules. */
  clear(): void {
    this.registrations.clear();
  }

  private syncAll(): void {
    for (const registration of this.registrations) {
      this.syncTarget(registration.target, registration.groupNames);
    }
  }

  private syncTarget(target: T, groupNames: readonly string[]): void {
    target.setVisible(this.isVisibleInCurrentMode(groupNames));
  }

  private isVisibleInCurrentMode(groupNames: readonly string[]): boolean {
    for (const groupName of groupNames) {
      const rules = this.groupRules.get(groupName);
      if (rules?.[this.currentMode]) {
        return true;
      }
    }

    return false;
  }
}
