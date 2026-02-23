#!/usr/bin/env npx tsx
/**
 * generate-mind-cards.ts
 *
 * Generates 101 SVG card images for The Mind:
 *   - 100 numbered cards (values 1-100)
 *   - 1 card back
 *
 * Output: public/assets/cards/the-mind/{assetKey}.svg
 * Card size: 140x190px
 *
 * Usage:
 *   npx tsx scripts/generate-mind-cards.ts
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Constants ──────────────────────────────────────────────

const CARD_W = 140;
const CARD_H = 190;
const CORNER_R = 10;
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'cards', 'the-mind');

/** Card face background — deep teal/blue-green. */
const BG_COLOR = '#1a2a3a';

/** Accent color — warm gold for borders and decoration. */
const ACCENT_COLOR = '#d4a843';

/** Number text color — bright white for legibility. */
const TEXT_COLOR = '#ffffff';

/** Card back background. */
const BACK_BG = '#1a2a3a';

/** Card back accent. */
const BACK_ACCENT = '#d4a843';

// ── SVG template helpers ───────────────────────────────────

function svgHeader(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">`;
}

function cardBackground(fill: string): string {
  return `  <rect width="${CARD_W}" height="${CARD_H}" rx="${CORNER_R}" ry="${CORNER_R}" fill="${fill}"/>`;
}

function cardBorder(stroke: string): string {
  return `  <rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="${CORNER_R - 1}" ry="${CORNER_R - 1}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
}

function innerFrame(stroke: string): string {
  return `  <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="6" ry="6" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.4"/>`;
}

// ── Card generators ────────────────────────────────────────

/**
 * Generate a numbered Mind card (1-100).
 *
 * Layout:
 * - Dark background with gold border and inner frame
 * - Large centered number for quick readability
 * - Small corner numbers (top-left, bottom-right rotated)
 * - Subtle concentric circle decoration behind the number
 */
function generateNumberedCard(value: number): string {
  // Scale font size: 1-digit (56px), 2-digit (52px), 3-digit (44px)
  const digits = String(value).length;
  const mainFontSize = digits === 1 ? 56 : digits === 2 ? 52 : 44;
  const cornerFontSize = 18;

  // Subtle radial decoration behind the number
  const decoration = `  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="42" fill="none" stroke="${ACCENT_COLOR}" stroke-width="0.6" opacity="0.25"/>
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="34" fill="none" stroke="${ACCENT_COLOR}" stroke-width="0.4" opacity="0.15"/>`;

  // Corner numbers
  const corners = `  <text x="16" y="30" font-family="Arial, sans-serif" font-size="${cornerFontSize}" font-weight="bold" text-anchor="middle" fill="${ACCENT_COLOR}">${value}</text>
  <text x="${CARD_W - 16}" y="${CARD_H - 16}" font-family="Arial, sans-serif" font-size="${cornerFontSize}" font-weight="bold" text-anchor="middle" fill="${ACCENT_COLOR}" transform="rotate(180,${CARD_W - 16},${CARD_H - 24})">${value}</text>`;

  // Main centered number
  const mainNumber = `  <text x="${CARD_W / 2}" y="${CARD_H / 2 + mainFontSize / 3}" font-family="Arial, sans-serif" font-size="${mainFontSize}" font-weight="bold" text-anchor="middle" fill="${TEXT_COLOR}">${value}</text>`;

  return `${svgHeader()}
${cardBackground(BG_COLOR)}
${cardBorder(ACCENT_COLOR)}
${innerFrame(ACCENT_COLOR)}
${decoration}
${corners}
${mainNumber}
</svg>`;
}

/**
 * Generate the Mind card back.
 *
 * Design: Dark background with gold accents, concentric circles,
 * and a central "?" symbol representing the unknown.
 */
function generateCardBack(): string {
  // Radiating lines pattern
  const lines: string[] = [];
  for (let angle = 0; angle < 360; angle += 30) {
    const rad = (angle * Math.PI) / 180;
    const cx = CARD_W / 2;
    const cy = CARD_H / 2;
    const x1 = cx + Math.cos(rad) * 20;
    const y1 = cy + Math.sin(rad) * 20;
    const x2 = cx + Math.cos(rad) * 55;
    const y2 = cy + Math.sin(rad) * 55;
    lines.push(
      `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${BACK_ACCENT}" stroke-width="1" opacity="0.15"/>`,
    );
  }

  return `${svgHeader()}
${cardBackground(BACK_BG)}
${cardBorder(BACK_ACCENT)}
  <rect x="6" y="6" width="${CARD_W - 12}" height="${CARD_H - 12}" rx="7" ry="7" fill="none" stroke="${BACK_ACCENT}" stroke-width="1.5"/>
${lines.join('\n')}
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="38" fill="none" stroke="${BACK_ACCENT}" stroke-width="2" opacity="0.4"/>
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="28" fill="${BACK_ACCENT}" opacity="0.15"/>
  <text x="${CARD_W / 2}" y="${CARD_H / 2 + 14}" font-family="serif" font-size="40" font-weight="bold" text-anchor="middle" fill="${BACK_ACCENT}">?</text>
</svg>`;
}

// ── Main ───────────────────────────────────────────────────

function main(): void {
  // Ensure output directory exists
  mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;

  // Generate numbered cards (1-100)
  for (let value = 1; value <= 100; value++) {
    const key = `mind-${value}`;
    const svg = generateNumberedCard(value);
    writeFileSync(join(OUT_DIR, `${key}.svg`), svg);
    count++;
  }

  // Generate card back (1 card)
  const backSvg = generateCardBack();
  writeFileSync(join(OUT_DIR, 'mind-back.svg'), backSvg);
  count++;

  console.log(`Generated ${count} SVG card images in ${OUT_DIR}`);
}

main();
