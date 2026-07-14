import type {
  ScreenLayoutDocument,
  ScreenLayoutValidationError,
} from './screen-layout-schema';
import { parseScreenLayoutDocument } from './screen-layout-schema';
import {
  normalizedToPixels,
  type LayoutViewport,
  type ResolvedScreenLayout,
  type ResolvedZone,
} from './screen-layout';

export type ComposeResolvedLayoutsPolicy = 'sceneWins' | 'baseWins' | 'namespace';

export type ComposeResolvedLayoutsIssueCode =
  | 'VALIDATION_ERROR'
  | 'ZONE_COLLISION'
  | 'NAMESPACE_COLLISION';

export interface ComposeResolvedLayoutsIssue {
  code: ComposeResolvedLayoutsIssueCode;
  severity: 'error' | 'warning';
  message: string;
  policy: ComposeResolvedLayoutsPolicy;
  zoneName?: string;
  layoutRole?: 'base' | 'scene';
  baseLayoutId?: string;
  sceneLayoutId?: string;
  cause?: unknown;
}

export type ComposeResolvedLayoutsIssueReporter = (
  issue: ComposeResolvedLayoutsIssue,
) => void;

export interface ComposeResolvedLayoutsOptions {
  policy?: ComposeResolvedLayoutsPolicy;
  namespacePrefix?: string;
  reportIssue?: ComposeResolvedLayoutsIssueReporter;
}

const DEFAULT_POLICY: ComposeResolvedLayoutsPolicy = 'sceneWins';
const DEFAULT_NAMESPACE_PREFIX = 'scene';

function cloneResolvedZone(zone: ResolvedZone): ResolvedZone {
  const anchors: ResolvedZone['anchors'] = {};

  for (const [anchorName, anchor] of Object.entries(zone.anchors)) {
    anchors[anchorName] = { ...anchor };
  }

  return {
    rect: { ...zone.rect },
    anchors,
  };
}

function emitIssue(
  issue: ComposeResolvedLayoutsIssue,
  reportIssueHook: ComposeResolvedLayoutsIssueReporter | undefined,
): void {
  if (reportIssueHook) {
    reportIssueHook(issue);
    return;
  }

  const log = issue.severity === 'error' ? console.error : console.warn;
  log(issue.message);
}

function layoutId(document: Partial<ScreenLayoutDocument> | null | undefined): string {
  return typeof document?.id === 'string' && document.id.length > 0 ? document.id : '(unknown)';
}

function reportValidationFailure(
  layoutRole: 'base' | 'scene',
  document: Partial<ScreenLayoutDocument> | null | undefined,
  errors: ScreenLayoutValidationError[],
  reportIssueHook: ComposeResolvedLayoutsIssueReporter | undefined,
  policy: ComposeResolvedLayoutsPolicy,
): never {
  const currentLayoutId = layoutId(document);
  for (const error of errors) {
    emitIssue(
      {
        code: 'VALIDATION_ERROR',
        severity: 'error',
        message: `Invalid ${layoutRole} layout "${currentLayoutId}": ${error.path} ${error.message}`,
        policy,
        layoutRole,
        ...(layoutRole === 'base'
          ? { baseLayoutId: currentLayoutId }
          : { sceneLayoutId: currentLayoutId }),
      },
      reportIssueHook,
    );
  }

  const firstError = errors[0];
  throw new Error(
    `Invalid ${layoutRole} layout "${currentLayoutId}": ${firstError?.path ?? '/'} ${firstError?.message ?? 'unknown validation error'}`,
  );
}

function buildCollisionIssue(options: {
  policy: ComposeResolvedLayoutsPolicy;
  zoneName: string;
  baseLayoutId: string;
  sceneLayoutId: string;
  messageSuffix: string;
}): ComposeResolvedLayoutsIssue {
  return {
    code: 'ZONE_COLLISION',
    severity: 'warning',
    policy: options.policy,
    zoneName: options.zoneName,
    baseLayoutId: options.baseLayoutId,
    sceneLayoutId: options.sceneLayoutId,
    message: `Zone collision for "${options.zoneName}" while composing "${options.baseLayoutId}" with "${options.sceneLayoutId}" using policy "${options.policy}". ${options.messageSuffix}`,
  };
}

function reserveZoneName(
  zones: Record<string, ResolvedZone>,
  desiredName: string,
): string {
  if (!zones[desiredName]) {
    return desiredName;
  }

  let suffix = 2;
  while (zones[`${desiredName}#${suffix}`]) {
    suffix += 1;
  }

  return `${desiredName}#${suffix}`;
}

/**
 * Compose a resolved shell layout and a scene layout at the pixel layer.
 *
 * - Documents are validated with the existing screen-layout schema helpers.
 * - Both documents are independently mapped through normalizedToPixels().
 * - Zone conflicts are resolved according to the selected policy.
 * - Scene namespacing keeps both zone sets when policy = namespace.
 */
export function composeResolvedLayouts(
  baseDoc: ScreenLayoutDocument,
  sceneDoc: ScreenLayoutDocument,
  viewport: LayoutViewport,
  dpr = 1,
  options: ComposeResolvedLayoutsOptions = {},
): ResolvedScreenLayout {
  const policy = options.policy ?? DEFAULT_POLICY;
  const namespacePrefix = options.namespacePrefix?.trim() || DEFAULT_NAMESPACE_PREFIX;
  const reportIssueHook = options.reportIssue;

  const baseParsed = parseScreenLayoutDocument(baseDoc);
  if (!baseParsed.valid) {
    reportValidationFailure('base', baseDoc, baseParsed.errors, reportIssueHook, policy);
  }

  const sceneParsed = parseScreenLayoutDocument(sceneDoc);
  if (!sceneParsed.valid) {
    reportValidationFailure('scene', sceneDoc, sceneParsed.errors, reportIssueHook, policy);
  }

  const baseResolved = normalizedToPixels(baseParsed.layout, viewport, dpr);
  const sceneResolved = normalizedToPixels(sceneParsed.layout, viewport, dpr);

  const zones: Record<string, ResolvedZone> = {};

  for (const [zoneName, zone] of Object.entries(baseResolved.zones)) {
    zones[zoneName] = cloneResolvedZone(zone);
  }

  for (const [sceneZoneName, sceneZone] of Object.entries(sceneResolved.zones)) {
    if (policy === 'namespace') {
      const desiredName = `${namespacePrefix}:${sceneZoneName}`;
      const namespacedName = reserveZoneName(zones, desiredName);

      if (namespacedName !== desiredName) {
        emitIssue(
          {
            code: 'NAMESPACE_COLLISION',
            severity: 'warning',
            policy,
            zoneName: sceneZoneName,
            baseLayoutId: baseParsed.layout.id,
            sceneLayoutId: sceneParsed.layout.id,
            message: `Namespaced zone "${desiredName}" already exists while composing "${baseParsed.layout.id}" with "${sceneParsed.layout.id}". Stored the scene zone as "${namespacedName}" instead.`,
          },
          reportIssueHook,
        );
      }

      zones[namespacedName] = cloneResolvedZone(sceneZone);
      continue;
    }

    const existingZone = zones[sceneZoneName];
    if (!existingZone) {
      zones[sceneZoneName] = cloneResolvedZone(sceneZone);
      continue;
    }

    const issue = buildCollisionIssue({
      policy,
      zoneName: sceneZoneName,
      baseLayoutId: baseParsed.layout.id,
      sceneLayoutId: sceneParsed.layout.id,
      messageSuffix:
        policy === 'sceneWins'
          ? 'Using the scene zone value and warning for developer review.'
          : 'Keeping the base zone value and warning for developer review.',
    });

    emitIssue(issue, reportIssueHook);

    if (policy === 'sceneWins') {
      zones[sceneZoneName] = cloneResolvedZone(sceneZone);
    }
  }

  return {
    viewport: {
      width: viewport.width,
      height: viewport.height,
      dpr,
      pixelWidth: viewport.width * dpr,
      pixelHeight: viewport.height * dpr,
    },
    zones,
  };
}
