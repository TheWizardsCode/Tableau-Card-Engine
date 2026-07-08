/**
 * Main Street SVG Card Generator
 *
 * Generates SVG strings dynamically for BusinessCard and CommunitySpaceCard
 * based on their current state (income, reputation, name/level). This replaces
 * the static-SVG + Phaser-overlay approach with a single rendering path:
 * card state → SVG string → rasterised texture.
 *
 * Event and Upgrade cards remain static SVGs — they have no dynamic visual
 * state. Only Business and Community Space cards change appearance based on
 * game state (upgrades, synergy bonuses, etc.).
 *
 * @module MainStreetCardSvgGenerator
 */

import type { BusinessCard, CommunitySpaceCard, SynergyType } from '../MainStreetCards';
import { synergyColor } from '../MainStreetCards';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default card dimensions (matching the static SVG templates). */
const CARD_W = 140;
const CARD_H = 80;

const FONT = 'Inter, Segoe UI, Arial, sans-serif';

/** Background fill colours per card family / synergy type. */
const CARD_BG: Record<string, string> = {
  Food:          '#5D4037',
  Culture:       '#1565C0',
  Commerce:      '#2E7D32',
  Service:       '#6A1B9A',
  Entertainment: '#C62828',
  Health:        '#00838F',
  // Fallback (community-space defaults to Culture colour)
  default:       '#2f2f2f',
};

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Return the fill colour for the header bar (light tint of the synergy colour). */
function headerFill(synergyType: SynergyType): string {
  return synergyColor(synergyType).toString(16).padStart(6, '0');
}

/** Build the synergy icon SVG for the bottom-left corner. */
function synergyIconSvg(type: SynergyType, x: number, y: number): string {
  const c = '#' + synergyColor(type).toString(16).padStart(6, '0');
  const label = `${type} icon`;
  return `<g class="ms-synergy-icon" aria-hidden="false" transform="translate(${x}, ${y})">
    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="${esc(label)}">
  <title>${esc(label)}</title>
  <circle cx="8" cy="8" r="6" fill="${c}" />
  <rect x="4" y="3" width="8" height="2" rx="1" fill="#fff" opacity="0.9" />
    </svg>
  </g>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an SVG string for a BusinessCard or CommunitySpaceCard
 * reflecting its current state.
 *
 * The SVG includes:
 * - Card background with synergy-type colour
 * - Title text (name or upgraded name)
 * - Per-turn income (omitted when 0)
 * - Per-turn reputation (omitted when 0)
 * - Cost circle (bottom-right)
 * - Synergy icon (bottom-left)
 * - Level badge (top-right, when level > 0)
 *
 * @param card - The business or community-space card.
 * @param width - SVG width in pixels (default 140).
 * @param height - SVG height in pixels (default 80).
 * @returns A complete SVG string.
 */
export function generateBusinessCardSvg(
  card: BusinessCard | CommunitySpaceCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const isUpgraded = card.level > 0;
  const totalIncome = card.baseIncome + card.incomeBonus;
  const totalRep = (card.reputationPerTurn ?? 0) + card.reputationBonus;

  const primarySynergy = card.synergyTypes[0];
  const bgFill = CARD_BG[primarySynergy] ?? CARD_BG.default;

  // Header bar uses the synergy colour at low opacity
  const headerHex = headerFill(primarySynergy);

  // ── Dynamic text elements ────────────────────────────────

  // Title: always present (name changes on upgrade)
  const titleY = 19;
  const titleText = `<text x="${width / 2}" y="${titleY}" font-family="${FONT}" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">${esc(card.name)}</text>`;

  // Income label: centred horizontally, middle band of card, omitted when 0
  const incomeLabel =
    totalIncome > 0
      ? `<text x="${width / 2}" y="35" font-family="${FONT}" font-size="10" fill="#44ff44" font-weight="bold" text-anchor="middle">+${totalIncome}/turn</text>`
      : '';

  // Reputation label: centred, below income, omitted when 0
  const repLabel =
    totalRep > 0
      ? `<text x="${width / 2}" y="47" font-family="${FONT}" font-size="10" fill="#88bbff" font-weight="bold" text-anchor="middle">+${fmtRep(totalRep)}/turn</text>`
      : '';

  // Level badge: top-right, only for upgraded cards
  const levelBadge =
    isUpgraded
      ? `<text x="${width - 8}" y="13" font-family="${FONT}" font-size="9" fill="#ffdd44" font-weight="bold" text-anchor="end">Lvl ${card.level}</text>`
      : '';

  // Synergy icons: bottom-left for each synergy type
  const icons = card.synergyTypes
    .map((t, i) => synergyIconSvg(t, 6 + i * 18, height - 22))
    .join('\n    ');

  // Cost circle: bottom-right
  const costCx = width - 16;
  const costCy = height - 16;
  const costCircle = `<circle cx="${costCx}" cy="${costCy}" r="12" fill="#e0c7a0" stroke="#c8b79a" stroke-width="1.5" />`;
  const costText = `<text x="${costCx}" y="${costCy + 4}" font-family="${FONT}" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">${card.cost}</text>`;

  // ── Compose SVG ─────────────────────────────────────────

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(card.name)}">
  <defs>
    <linearGradient id="g-gen-${card.id}" x1="0" x2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="6" ry="6" fill="${bgFill}" />
  <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="4" ry="4" fill="url(#g-gen-${card.id})" />
  <rect x="4" y="4" width="${width - 8}" height="20" rx="3" ry="3" fill="#${headerHex}" opacity="0.18" />
  ${titleText}
  ${incomeLabel}
  ${repLabel}
  ${levelBadge}
  ${costCircle}
  ${costText}
  ${icons}
</svg>`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Format a reputation value to at most 1 decimal place, stripping trailing zeros. */
function fmtRep(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}
