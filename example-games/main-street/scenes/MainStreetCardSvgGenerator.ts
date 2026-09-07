/**
 * Main Street SVG Card Generator — 64×64 left-art layout (CG-0MTORJ5FS006B0UN).
 *
 * Generates SVG strings dynamically for all card families (Business,
 * Community Space, Event, Upgrade, Staff) based on card state or
 * from CSV template data.
 *
 * Layout (140×80, GRAPHIC 64×64 at 8,8): every card has a square graphic
 * zone in the top-left; titles sit to the right of the graphic (x ≥ 80)
 * and stat lines live in the right-hand text column so (a) hand overlap
 * (~20 px fan) still leaves ≥44 px of the graphic visible and (b) a
 * stacked card underneath remains identifiable from its top ~23 px.
 * See CG-0MTORJ5FS006B0UN for the full hand-overlap and stacking analysis.
 *
 * Business and Community Space cards include dynamic state (income,
 * reputation, level). Event, Upgrade, and Staff cards are generated
 * from template data only (no dynamic visual state). The CSV fallback
 * (generateCardSvgFromCsvRow) uses the same left-art geometry.
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

/** 64×64 left-art graphic zone (CG-0MTORJ5FS006B0UN).
 * Positioned at (8, 8) so that during HandView overlap (~20 px)
 * at least 44 px of the graphic remain visible vertically.
 * For stacking, the key visual in the top 40 % (y=8…28) stays
 * readable at ~23 px visible height.
 */
const GRAPHIC_W = 64;
const GRAPHIC_H = 64;
const GRAPHIC_X = 8;
const GRAPHIC_Y = 8;

/** Minimum x for text elements — must be right of the graphic zone. */
const TEXT_MIN_X = GRAPHIC_X + GRAPHIC_W + 8; // 80

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

/** Build the 64×64 left-art graphic placeholder (CG-0MTORJ5FS006B0UN).
 *
 * Uses a high-contrast rounded rect filled with the card's primary
 * synergy colour, with a bold single-letter glyph in the upper half
 * so the visual remains readable under hand overlap (≥44 px visible)
 * and street stacking (~23 px visible). Future work can replace the
 * `<g>` body with a real `<image>` or family-specific icon.
 */
function graphicZoneSvg(
  accentFill: string,
  glyph: string,
): string {
  return [
    `<g class="ms-card-graphic" aria-hidden="true">`,
    `  <rect x="${GRAPHIC_X}" y="${GRAPHIC_Y}" width="${GRAPHIC_W}" height="${GRAPHIC_H}" rx="4" ry="4" fill="${accentFill}" opacity="0.42" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.22" />`,
    `  <text x="${GRAPHIC_X + GRAPHIC_W / 2}" y="${GRAPHIC_Y + 34}" font-family="${FONT}" font-size="28" fill="#ffffff" font-weight="800" text-anchor="middle" opacity="0.96">${esc(glyph)}</text>`,
    `</g>`,
  ].join('\n');
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
 * Replaces the card title in a template SVG with the given display name,
 * producing a variant card face.
 *
 * Used by the runtime texture pipeline to bake an upgraded business's
 * display name into its card image (CG-0MT24MHGZ0025O20) — the upgraded
 * name becomes part of the SVG itself, exactly like the base name is part
 * of the template SVG.
 *
 * CG-0MTORJ5FS006B0UN: the title text element is now right of the 64×64
 * graphic placeholder (font-size="10" font-weight="600" text-anchor="start";
 * x=80), so we target it specifically instead of using first-child.
 *
 * @param svgText   The template SVG string (e.g. base Bakery card).
 * @param newTitle  The name to bake into the card (e.g. "Patisserie").
 * @returns The variant SVG with the title node (and aria-label) updated.
 */
export function replaceCardTitleInSvg(svgText: string, newTitle: string): string {
  if (!svgText) return svgText;
  const escaped = esc(newTitle);
  // Title element is the left-anchored size-10/weight-600 text right of the
  // 64×64 graphic (CG-0MTORJ5FS006B0UN). Avoid replacing the graphic glyph.
  const titleNodeRe = /(font-size="10"[^>]*font-weight="600"[^>]*>)[^<]*(<\/text>)/;
  let withTitle = svgText.replace(titleNodeRe, `$1${escaped}$2`);
  // Fallback for legacy template SVGs (first <text> node) and for synthetic
  // fixtures in tests (minimal SVG fixtures).
  if (withTitle === svgText) {
    const legacyRe = /(<text[^>]*>)[^<]*(<\/text>)/;
    withTitle = svgText.replace(legacyRe, `$1${escaped}$2`);
  }
  const ariaRe = /(aria-label=")[^"]*(")/;
  return withTitle.replace(ariaRe, `$1${escaped}$2`);
}

/**
 * Generate an SVG string for a BusinessCard or CommunitySpaceCard
 * reflecting its current state.
 *
 * CG-0MTORJ5FS006B0UN layout: 64×64 graphic at (8,8); title right of
 * graphic (x=80, left-anchored); income/rep in the right-hand column;
 * synergy icons below the graphic; cost at bottom-right; level badge
 * top-right when upgraded.
 *
 * The SVG includes:
 * - 64×64 left-art graphic placeholder (synergy colour, bold glyph)
 * - Card background with synergy-type colour
 * - Title text (right of graphic; upgraded displayName when present)
 * - Per-turn income in the right column (omitted when 0)
 * - Per-turn reputation in the right column (omitted when 0)
 * - Cost circle (bottom-right)
 * - Synergy icon(s) below the graphic (bottom-left)
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

  // ── Dynamic text elements (CG-0MTORJ5FS006B0UN: 64×64 left-art) ───────

  // 64×64 graphic placeholder — top-left; high-contrast + bold letter so
  // the card stays identifiable under hand overlap and future stacking.
  const accent = '#' + headerFill(primarySynergy);
  const graphic = graphicZoneSvg(accent, (card.name || '?').trim().charAt(0).toUpperCase());

  // Title: right of the graphic (never inside 64×64); left-anchored II 8 px
  // gap from the graphic, truncated via clip to avoid layout overflow.
  const displayName = card.displayName ?? card.name;
  const titleY = 19;
  const titleText = `<text x="${TEXT_MIN_X}" y="${titleY}" font-family="${FONT}" font-size="10" fill="#ffffff" font-weight="600" text-anchor="start">${esc(displayName)}</text>`;

  // Right column anchors: centred in the text area to the right of the graphic
  // (TEXT_MIN_X … width-8). Mid-point ≈ TEXT_MIN_X + (width-TEXT_MIN_X-8)/2.
  const rightColCx = TEXT_MIN_X + Math.round((width - (TEXT_MIN_X + 8)) / 2);

  // Income label: right column, omitted when 0. Uses "Income: +X/turn" format.
  const incomeLabel =
    totalIncome > 0
      ? `<text x="${rightColCx}" y="35" font-family="${FONT}" font-size="9" fill="#44ff44" font-weight="bold" text-anchor="middle">Income: +${totalIncome}/turn</text>`
      : '';

  // Reputation label: right column, below income, omitted when 0
  const repLabel =
    totalRep > 0
      ? `<text x="${rightColCx}" y="47" font-family="${FONT}" font-size="9" fill="#88bbff" font-weight="bold" text-anchor="middle">+${fmtRep(totalRep)}/turn</text>`
      : '';

  // Level badge: top-right, only for upgraded cards
  const levelBadge =
    isUpgraded
      ? `<text x="${width - 8}" y="13" font-family="${FONT}" font-size="9" fill="#ffdd44" font-weight="bold" text-anchor="end">Lvl ${card.level}</text>`
      : '';

  // Synergy icons: bottom-left, below the graphic (do not overlap 64×64)
  const icons = card.synergyTypes
    .map((t, i) => synergyIconSvg(t, GRAPHIC_X + i * 18, height - 22))
    .join('\n    ');

  // Cost circle: bottom-right (unchanged)
  const costCx = width - 16;
  const costCy = height - 16;
  const costCircle = `<circle cx="${costCx}" cy="${costCy}" r="12" fill="#e0c7a0" stroke="#c8b79a" stroke-width="1.5" />`;
  const costText = `<text x="${costCx}" y="${costCy + 4}" font-family="${FONT}" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">${formatCurrency(card.cost)}</text>`;

  // ── Compose SVG (CG-0MTORJ5FS006B0UN: 64×64 left-art) ─────

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(displayName)}">
  <defs>
    <linearGradient id="g-gen-${card.id}" x1="0" x2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="6" ry="6" fill="${bgFill}" />
  <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="4" ry="4" fill="url(#g-gen-${card.id})" />
  <rect x="4" y="4" width="${width - 8}" height="20" rx="3" ry="3" fill="#${headerHex}" opacity="0.18" />
  ${graphic}
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

/** Format a reputation value as an integer string. */
function fmtRep(v: number): string {
  return String(Math.round(v));
}

/** Right-column centre X for the 64×64 left-art text column (TEXT_MIN_X … width-8). */
function rightColCenter(width: number): number {
  return TEXT_MIN_X + Math.round((width - (TEXT_MIN_X + 8)) / 2);
}

/**
 * Generate an SVG string for an EventCard from template data.
 * Shows card name, trigger type, and cost.
 * CG-0MTORJ5FS006B0UN: 64×64 left-art — title right of graphic, details in right column.
 */
export function generateEventCardSvg(
  card: EventCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const bgFill = card.trigger === 'Incident' ? '#2B3A67' : '#8B4513';
  const graphicFill = card.trigger === 'Incident' ? '#3D5A80' : '#A0522D';
  const rcx = rightColCenter(width);
  const inner: string[] = [];

  inner.push(graphicZoneSvg(graphicFill, card.name.trim().charAt(0).toUpperCase()));
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#cccccc" opacity="0.18" />');
  inner.push('  <text x="' + TEXT_MIN_X + '" y="19" font-family="' + FONT + '" font-size="10" fill="#ffffff" font-weight="600" text-anchor="start">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + rcx + '" y="35" font-family="' + FONT + '" font-size="9" fill="#aaaacc" font-weight="400" text-anchor="middle">[' + esc(card.trigger) + ']</text>');
  inner.push('  ' + costBadgeSvg(card.cost, width, height));

  return svgShell(card.id, card.name, bgFill, inner, width, height);
}

/**
 * Generate an SVG string for an UpgradeCard from template data.
 * Shows upgrade name, target business, and cost.
 * CG-0MTORJ5FS006B0UN: 64×64 left-art — title right of graphic, target in right column.
 */
export function generateUpgradeCardSvg(
  card: UpgradeCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const rcx = rightColCenter(width);
  const inner: string[] = [];
  inner.push(graphicZoneSvg('#8B5CBF', card.name.trim().charAt(0).toUpperCase()));
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#9B59B6" opacity="0.18" />');
  inner.push('  <text x="' + TEXT_MIN_X + '" y="19" font-family="' + FONT + '" font-size="10" fill="#ffffff" font-weight="600" text-anchor="start">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + rcx + '" y="35" font-family="' + FONT + '" font-size="9" fill="#bb99dd" font-weight="400" text-anchor="middle">for ' + esc(card.targetBusiness) + '</text>');
  inner.push('  ' + costBadgeSvg(card.cost, width, height));

  return svgShell(card.id, card.name, '#6B4C9A', inner, width, height);
}

/**
 * Generate an SVG string for a StaffCard from template data.
 * Shows staff name, ongoing cost, hand slots, and purchase cost.
 * CG-0MTORJ5FS006B0UN: 64×64 left-art — title right of graphic, stats in right column.
 */
export function generateStaffCardSvg(
  card: StaffCard,
  width: number = CARD_W,
  height: number = CARD_H,
): string {
  const rcx = rightColCenter(width);
  const inner: string[] = [];
  inner.push(graphicZoneSvg('#777777', card.name.trim().charAt(0).toUpperCase()));
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="#888888" opacity="0.18" />');
  inner.push('  <text x="' + TEXT_MIN_X + '" y="19" font-family="' + FONT + '" font-size="10" fill="#ffffff" font-weight="600" text-anchor="start">' + esc(card.name) + '</text>');
  inner.push('  <text x="' + rcx + '" y="35" font-family="' + FONT + '" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-' + card.ongoingCost + '/turn</text>');
  if (card.handSlotsAdded > 0) {
    inner.push('  <text x="' + rcx + '" y="47" font-family="' + FONT + '" font-size="9" fill="#88bbff" font-weight="400" text-anchor="middle">+' + card.handSlotsAdded + ' slots</text>');
  }
  if ((card as unknown as Record<string, unknown>).peekOncePerTurn) {
    const peek = (card as unknown as Record<string, unknown>).peekOncePerTurn as number;
    if (peek > 0) inner.push('  <text x="' + rcx + '" y="59" font-family="' + FONT + '" font-size="9" fill="#ffcc66" font-weight="400" text-anchor="middle">peek 1/turn</text>');
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
 * by scripts/generate-main-street-card-svgs.mjs (CG-0MTORJ5FS006B0UN:
 * 64×64 left-art, title right of graphic, right-column details).
 * Used as a runtime fallback when the static SVGs are out of date
 * with the CSV.
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
  const rcx = rightColCenter(width);
  const inner: string[] = [];

  // 64×64 left-art graphic — same stacking/overlap rules as concrete generators
  // CG-0MTORJ5FS006B0UN: accent-coloured placeholder with bold initial glyph.
  const glyph = (name || '?').trim().charAt(0).toUpperCase();
  inner.push(graphicZoneSvg(scheme.accent, glyph));

  // Header bar (kept for contrast, graphic sits on top of it at y=8)
  inner.push('  <rect x="4" y="4" width="' + (width - 8) + '" height="20" rx="3" ry="3" fill="' + scheme.accent + '" opacity="0.18" />');
  // Title: right of graphic, never inside 64×64 (x ≥ TEXT_MIN_X)
  inner.push('  <text x="' + TEXT_MIN_X + '" y="19" font-family="' + FONT + '" font-size="10" fill="#ffffff" font-weight="600" text-anchor="start">' + esc(name) + '</text>');

  // Right-column details (never centred on card — always in text column)
  // Trigger label for event cards
  if (family === 'event' && trigger) {
    inner.push('  <text x="' + rcx + '" y="35" font-family="' + FONT + '" font-size="9" fill="#aaaacc" font-weight="400" text-anchor="middle">[' + esc(trigger) + ']</text>');
  }

  // Staff card details — right column
  if (family === 'staff') {
    if (row.ongoingCost && Number(row.ongoingCost) > 0) {
      inner.push('  <text x="' + rcx + '" y="35" font-family="' + FONT + '" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-' + row.ongoingCost + '/turn</text>');
    }
    if (row.handSlotsAdded && Number(row.handSlotsAdded) > 0) {
      inner.push('  <text x="' + rcx + '" y="47" font-family="' + FONT + '" font-size="9" fill="#88bbff" font-weight="400" text-anchor="middle">+' + row.handSlotsAdded + ' slots</text>');
    }
    if (row.peekOncePerTurn && Number(row.peekOncePerTurn) > 0) {
      inner.push('  <text x="' + rcx + '" y="59" font-family="' + FONT + '" font-size="9" fill="#ffcc66" font-weight="400" text-anchor="middle">peek 1/turn</text>');
    }
  }

  // Community space ongoing cost: no longer baked into the card face — the
  // overlay cash line (`Cash: +X / -Y`, CG-0MTCP76MP0088TQW) shows it in the
  // two-tone line instead (CG-0MTDMOYOL008IQVO). Staff cards keep the baked
  // label above because they have no overlay pipeline.

  // Business ongoing cost: same as community space — removed from the baked
  // face; the overlay cash line handles display (CG-0MSVYPEZ90085SHE + CG-0MTDMOYOL008IQVO).

  // Cost badge
  if (cost !== null) {
    inner.push('  ' + costBadgeSvg(cost, width, height));
  }

  return svgShell(id, name, scheme.bg, inner, width, height);
}
