#!/usr/bin/env node

/**
 * Main Street Card SVG Generator
 *
 * Generates static SVG card images from the card-data.csv file.
 * Can be used as a standalone CLI tool or imported programmatically.
 *
 * CLI:     node scripts/generate-main-street-card-svgs.mjs
 * Import:  import { regenerateCardSvgs } from './scripts/generate-main-street-card-svgs.mjs'
 *
 * Outputs:
 *   - SVG files for each card in public/assets/games/main-street/svg/cards/
 *   - csv-checksum.json alongside the SVGs for runtime change detection
 *
 * @module
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Checksum computation
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic DJB2 hash of the CSV text, returned as hex.
 * Matches the browser-side computeCsvChecksum() in CsvChecksum.ts.
 *
 * @param {string} csvText - Raw CSV text
 * @returns {string} 8-character hex checksum
 */
export function computeCsvChecksum(csvText) {
  let hash = 5381;
  for (let i = 0; i < csvText.length; i++) {
    hash = ((hash << 5) + hash + csvText.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// SVG generation
// ---------------------------------------------------------------------------

/**
 * Color map for synergy types.
 */
const synergyColor = {
  Food: '#E67E22',
  Culture: '#3498DB',
  Commerce: '#27AE60',
  Service: '#9B59B6',
  Entertainment: '#E74C3C',
  Health: '#1ABC9C',
};

/**
 * Determine background color for a card family + trigger type.
 */
function familyColor(family, trigger) {
  if (family === 'business') return '#2f2f2f';
  if (family === 'upgrade') return '#6B4C9A';
  if (family === 'event') return trigger === 'Incident' ? '#2B3A67' : '#8B4513';
  if (family === 'community-space') return '#2f2f2f';
  if (family === 'staff') return '#555555';
  return '#333333';
}

// ---------------------------------------------------------------------------
// SVG icon inlining
// ---------------------------------------------------------------------------

/**
 * Inline a synergy icon SVG file into the card SVG.
 * Falls back to a simple colored circle if the icon file doesn't exist.
 *
 * @param {string[]} synergies - List of synergy type names
 * @param {string} accent - Accent color string (CSS)
 * @param {number} h - Card height in pixels
 * @param {string} iconsDir - Path to the icons directory
 * @returns {string} SVG markup for the icon
 */
function buildIconMarkup(synergies, accent, h, iconsDir) {
  if (!synergies || synergies.length === 0) return '';

  const key = synergies[0];
  const iconFile = `ms-icon-${String(key).toLowerCase()}.svg`;
  const iconPath = path.join(iconsDir, iconFile);
  if (fs.existsSync(iconPath)) {
    let iconSvg = fs.readFileSync(iconPath, 'utf8');
    iconSvg = iconSvg.replace(/<\?xml[^>]*\?>\s*/i, '');
    iconSvg = iconSvg.replace(/^\s*<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    return `  <g class="ms-synergy-icon" aria-hidden="false" transform="translate(6, ${h - 22})">\n    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="${key} icon">${iconSvg}\n    </svg>\n  </g>`;
  }

  // fallback dot
  return `  <circle class="ms-synergy-fallback" cx="14" cy="${h - 10}" r="6" fill="${accent}" aria-hidden="true" />`;
}

// ---------------------------------------------------------------------------
// Parse CSV into template objects
// ---------------------------------------------------------------------------

function parseCardCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const templates = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const card = {};
    for (let j = 0; j < headers.length; j++) {
      card[headers[j]] = values[j] !== undefined ? values[j] : '';
    }

    const family = card.family || (
      card.id.startsWith('biz-') ? 'business' :
      card.id.startsWith('evt-') ? 'event' :
      card.id.startsWith('cs-') ? 'community-space' :
      card.id.startsWith('staff-') ? 'staff' :
      'upgrade'
    );
    const synergies = card.synergyTypes ? card.synergyTypes.split('|').filter(Boolean) : [];
    const cost = card.cost ? Number(card.cost) : null;
    const trigger = card.trigger || null;
    // Business cards carry an ongoing per-turn cost (1/4 purchase price, min 0.25) —
    // kept for the static art so the `-X/turn` label matches the runtime generator.
    const ongoingCost = card.ongoingCost ? Number(card.ongoingCost) : 0;

    templates.push({ id: card.id, name: card.name, cost, family, trigger, synergies, ongoingCost });
  }

  return templates;
}

// ---------------------------------------------------------------------------
// Generate a single card SVG string
// ---------------------------------------------------------------------------

function generateCardSvg(t) {
  const w = 140, h = 80;
  const bg = familyColor(t.family, t.trigger);
  const accent = t.synergies && t.synergies.length > 0 ? (synergyColor[t.synergies[0]] || '#cccccc') : '#cccccc';
  const displayCost = t.cost !== null ? `$${t.cost}` : '';

  const title = t.name.replace(/&/g, '&amp;');
  const iconMarkup = buildIconMarkup(t.synergies, accent, h, path.resolve('public/assets/games/main-street/svg/icons'));

  const priceBadge = displayCost
    ? `<circle cx="${w - 16}" cy="56" r="12" fill="#e0c7a0" stroke="#c8b79a" stroke-width="1.5" />`
    : '';
  const priceText = displayCost
    ? `<text x="${w - 16}" y="60" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">${t.cost}</text>`
    : '';

  // Ongoing-cost label for business cards: orange `-X/turn`, same format/colour
  // as the runtime generator (MainStreetCardSvgGenerator.ts). Omitted when 0.
  const ongoingCostText =
    t.family === 'business' && t.ongoingCost > 0
      ? `<text x="${w / 2}" y="33" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="9" fill="#ff8844" font-weight="400" text-anchor="middle">-${t.ongoingCost}/turn</text>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="g-${t.id}" x1="0" x2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" rx="6" ry="6" fill="${bg}" />
  <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="4" ry="4" fill="url(#g-${t.id})" />
  <rect x="4" y="4" width="${w - 8}" height="20" rx="3" ry="3" fill="${accent}" opacity="0.18" />
  <text x="${w / 2}" y="19" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">${title}</text>
${priceBadge}
${priceText}
${ongoingCostText}
${iconMarkup}

</svg>
`;
}

// ---------------------------------------------------------------------------
// Public API - regenerateCardSvgs()
// ---------------------------------------------------------------------------

/**
 * Regenerate all card SVG files from the card-data.csv.
 *
 * Can be called programmatically or used as a CLI (when run directly).
 *
 * @param {object} [options]
 * @param {string} [options.csvPath] - Path to card-data.csv (default: 'example-games/main-street/card-data.csv')
 * @param {string} [options.outputDir] - Output directory for SVGs (default: 'public/assets/games/main-street/svg/cards')
 * @returns {{ checksum: string, count: number }} The CSV checksum and number of SVGs generated.
 */
export function regenerateCardSvgs(options = {}) {
  const csvPath = path.resolve(options.csvPath || 'example-games/main-street/card-data.csv');
  const outDir = path.resolve(options.outputDir || 'public/assets/games/main-street/svg/cards');

  // Read and parse CSV
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const templates = parseCardCsv(csvText);

  // Compute checksum
  const checksum = computeCsvChecksum(csvText);

  // Create output directory
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Generate each SVG
  for (const t of templates) {
    const svg = generateCardSvg(t);
    const outPath = path.join(outDir, `${t.id}.svg`);
    fs.writeFileSync(outPath, svg, 'utf8');
  }

  // Write checksum file alongside SVGs for runtime change detection.
  // Trailing newline matches the committed file convention so the tree
  // stays clean after regeneration (card-svg-coverage.test.ts regenerates
  // during the suite; a newline-less rewrite would dirty the working tree
  // and invalidate the read-only test cache fingerprint).
  const checksumPath = path.join(outDir, 'csv-checksum.json');
  fs.writeFileSync(checksumPath, JSON.stringify({ checksum }) + '\n', 'utf8');

  return { checksum, count: templates.length };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] === import.meta.url || process.argv[1].endsWith('generate-main-street-card-svgs.mjs')) {
  const result = regenerateCardSvgs();
  console.log('Generated', result.count, 'card SVGs, checksum:', result.checksum);
}
