import type { ResourceOrWild, ResourceTokens, ResourceType } from '../FeudalismCards';
import { ALL_RESOURCE_TYPES, RESOURCE_TYPES, tokenCount } from '../FeudalismCards';

export interface TokenEntry {
  readonly color: ResourceOrWild;
  readonly count: number;
}

export function getTokenRenderOrder(reversed: boolean): readonly ResourceOrWild[] {
  return reversed ? [...ALL_RESOURCE_TYPES].reverse() : ALL_RESOURCE_TYPES;
}

export function getBonusRenderOrder(reversed: boolean): readonly ResourceType[] {
  return reversed ? [...RESOURCE_TYPES].reverse() : RESOURCE_TYPES;
}

export function buildTokenEntries(
  tokens: ResourceTokens,
  order: readonly ResourceOrWild[],
): TokenEntry[] {
  return order
    .map((color) => ({ color, count: tokenCount(tokens, color) }))
    .filter((entry) => entry.count > 0);
}
