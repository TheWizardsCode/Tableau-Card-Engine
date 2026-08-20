/**
 * Main Street SVG Card Generator
 *
 * Generates SVG strings dynamically for all card families (Business,
 * Community Space, Event, Upgrade, Staff) based on card state or
 * from CSV template data.
 *
 * Business and Community Space cards include dynamic state (income,
 * reputation, level). Event, Upgrade, and Staff cards are generated
 * from template data only (no dynamic visual state).
 *
 * @module MainStreetCardSvgGenerator
 */

import type {
  BusinessCard,
  CommunitySpaceCard,
  EventCard,
  UpgradeCard,
  StaffCard,
  SynergyType,
} from '../MainStreetCards';
import { synergyColor } from '../MainStreetCards';
import { formatCurrency } from '@core-engine/I18n';

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
  // Uses "Income: +X/turn" format for clarity
  const incomeLabel =
    totalIncome > 0
      ? `<text x="${width / 2}" y="35" font-family="${FONT}" font-size="10" fill="#44ff44" font-weight="bold" text-anchor="middle">Income: +${totalIncome}/turn</text>`
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
  const costText = `<text x="${costCx}" y="${costCy + 4}" font-family="${FONT}" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">${formatCurrency(card.cost)}</text>`;

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

/**
 * Generate an SVG string for an EventCard from template data.
 * Shows card name, trigger type, and cost.
 */
export function generateEventCardSvg(
  card: EventCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const bgFill = card.trigger === 'Incident' ? '#2B3A67' : '#8B4513';
  const inner: string[] = [];

  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#cccccc" opacity="0.18" />');
  inner.push('  <text x="' + (width / 2) + '" y="19" font-family="' + FONT + '" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + (width / 2) + '" y="40" font-family="' + FONT + '" font-size="9" fill="#aaaacc" font-weight="400" text-anchor="middle">[' + esc(card.trigger) + ']</text>');
  inner.push('  ' + costBadgeSvg(card.cost, width, height));

  return svgShell(card.id, card.name, bgFill, inner, width, height);
}

/**
 * Generate an SVG string for an UpgradeCard from template data.
 * Shows upgrade name, target business, and cost.
 */
export function generateUpgradeCardSvg(
  card: UpgradeCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const inner: string[] = [];
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#9B59B6" opacity="0.18" />');
  inner.push('  <text x="' + (width / 2) + '" y="19" font-family="' + FONT + '" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + (width / 2) + '" y="40" font-family="' + FONT + '" font-size="9" fill="#bb99dd" font-weight="400" text-anchor="middle">for ' + esc(card.targetBusiness) + '</text>');
  inner.push('  ' + costBadgeSvg(card.cost, width, height));

  return svgShell(card.id, card.name, '#6B4C9A', inner, width, height);
}

/**
 * Generate an SVG string for a StaffCard from template data.
 * Shows staff name, ongoing cost, hand slots, and purchase cost.
 */
export function generateStaffCardSvg(
  card: StaffCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const inner: string[] = [];
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#888888" opacity="0.18" />');
  inner.push('  <text x="' + (width / 2) + '" y="19" font-family="' + FONT + '" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + (width / 2) + '" y="38" font-family="' + FONT + '" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-' + card.ongoingCost + '/turn</text>');
  if (card.handSlotsAdded > 0) {
    inner.push('  <text x="' + (width / 2) + '" y="48" font-family="' + FONT + '" font-size="9" fill="#88bbff" font-weight="400" text-anchor="middle">+' + card.handSlotsAdded + ' slots</text>');
  }
  inner.push('  ' + costBadgeSvg(card.cost, width, height));

  return svgShell(card.id, card.name, '#555555', inner, width, height);
}

/**
 * Determine background/accent color scheme for CSV-row-based SVG generation.
 */
function cardColorScheme(family: string, trigger?: string): { bg: string; accent: string } {
  if (family === 'event') {
    if (trigger === 'Incident') return { bg: '#2B3A67', accent: '#3D5A80' };
    return { bg: '#8B4513', accent: '#A0522D' };
  }
  if (family === 'upgrade')       return { bg: '#6B4C9A', accent: '#9B59B6' };
  if (family === 'staff')         return { bg: '#555555', accent: '#888888' };
  if (family === 'community-space') return { bg: '#2f2f2f', accent: '#cccccc' };
  return { bg: '#2f2f2f', accent: '#cccccc' };
}

/** Build the cost badge SVG (shared helper). */
function costBadgeSvg(cost: number, width: number, height: number): string {
  const cx = width - 16;
  const cy = height - 16;
  return (
    '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="#e0c7a0" stroke="#c8b79a" stroke-width="1.5" />\n' +
    '  <text x="' + cx + '" y="' + (cy + 4) + '" font-family="' + FONT + '" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">' + formatCurrency(cost) + '</text>'
  );
}

/** Build the common SVG shell with defs, background, and gradient. */
function svgShell(
  cardId: string,
  name: string,
  bgFill: string,
  innerElements: string[],
  width: number,
  height: number,
): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(name) + '">',
    '  <defs>',
    '    <linearGradient id="g-' + cardId + '" x1="0" x2="1">',
    '      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>',
    '      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect x="0" y="0" width="' + width + '" height="' + height + '" rx="6" ry="6" fill="' + bgFill + '" />',
    '  <rect x="4" y="4" width="' + (width - 8) + '" height="' + (height - 8) + '" rx="4" ry="4" fill="url(#g-' + cardId + ')" />',
  ];
  for (const elem of innerElements) {
    lines.push(elem);
  }
  lines.push('</svg>');
  return lines.join('\n');
}

/**
 * Generate an SVG string for a card from its parsed CSV row data.
 *
 * Produces a card image matching the format of the static SVGs generated
 * by scripts/generate-main-street-card-svgs.mjs. Used as a runtime fallback
 * when the static SVGs are out of date with the CSV.
 *
 * @param row - A single row from the parsed card-data.csv.
 * @param width - SVG width (default 140).
 * @param height - SVG height (default 80).
 * @returns A complete SVG string.
 */
export function generateCardSvgFromCsvRow(
  row: Record<string, string>,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const id = row.id || 'unknown';
  const name = row.name || 'Unknown';
  const family = row.family || 'business';
  const cost = row.cost ? Number(row.cost) : null;
  const trigger = row.trigger || undefined;

  const scheme = cardColorScheme(family, trigger);
  const inner: string[] = [];

  // Header bar
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="' + scheme.accent + '" opacity="0.18" />');
  inner.push('  <text x="' + (width / 2) + '" y="19" font-family="' + FONT + '" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">' + esc(name) + '</text>');

  // Trigger label for event cards
  if (family === 'event' && trigger) {
    inner.push('  <text x="' + (width / 2) + '" y="40" font-family="' + FONT + '" font-size="9" fill="#aaaacc" font-weight="400" text-anchor="middle">[' + esc(trigger) + ']</text>');
  }

  // Staff card details
  if (family === 'staff') {
    if (row.ongoingCost && Number(row.ongoingCost) > 0) {
      inner.push('  <text x="' + (width / 2) + '" y="38" font-family="' + FONT + '" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-' + row.ongoingCost + '/turn</text>');
    }
    if (row.handSlotsAdded && Number(row.handSlotsAdded) > 0) {
      inner.push('  <text x="' + (width / 2) + '" y="48" font-family="' + FONT + '" font-size="9" fill="#88bbff" font-weight="400" text-anchor="middle">+' + row.handSlotsAdded + ' slots</text>');
    }
    if (row.peekOncePerTurn && Number(row.peekOncePerTurn) > 0) {
      inner.push('  <text x="' + (width / 2) + '" y="58" font-family="' + FONT + '" font-size="9" fill="#ffcc66" font-weight="400" text-anchor="middle">peek 1/turn</text>');
    }
  }

  // Community space ongoing cost (reputation-asset cards, e.g. Library -0.25/turn)
  if (family === 'community-space' && row.ongoingCost && Number(row.ongoingCost) > 0) {
    inner.push('  <text x="' + (width / 2) + '" y="38" font-family="' + FONT + '" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-' + row.ongoingCost + '/turn</text>');
  }

  // Cost badge
  if (cost !== null) {
    inner.push('  ' + costBadgeSvg(cost, width, height));
  }

  return svgShell(id, name, scheme.bg, inner, width, height);
}
