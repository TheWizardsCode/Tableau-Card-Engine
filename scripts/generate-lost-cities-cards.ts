#!/usr/bin/env npx tsx
/**
 * generate-lost-cities-cards.ts
 *
 * Generates 61 SVG card images for Lost Cities:
 *   - 60 expedition cards (5 colors x 12 cards each)
 *   - 1 card back
 *
 * Output: public/assets/cards/lost-cities/{assetKey}.svg
 * Card size: 140x190px
 *
 * Usage:
 *   npx tsx scripts/generate-lost-cities-cards.ts
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
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'cards', 'lost-cities');

type ExpeditionColor = 'yellow' | 'blue' | 'white' | 'green' | 'red';
const COLORS: ExpeditionColor[] = ['yellow', 'blue', 'white', 'green', 'red'];

/** Background fill for each expedition color. */
const BG: Record<ExpeditionColor, string> = {
  yellow: '#f5c542',
  blue: '#4287f5',
  white: '#e8e8e8',
  green: '#42b883',
  red: '#e04040',
};

/** Darker accent color for text/icons on each background. */
const ACCENT: Record<ExpeditionColor, string> = {
  yellow: '#8b6914',
  blue: '#1a3a6b',
  white: '#555555',
  green: '#1a5c3a',
  red: '#6b1a1a',
};

/** Text color that's legible on each background. */
const TEXT_COLOR: Record<ExpeditionColor, string> = {
  yellow: '#5a3e00',
  blue: '#ffffff',
  white: '#333333',
  green: '#ffffff',
  red: '#ffffff',
};

/** Expedition icon SVG path data for each color. */
const ICON_PATH: Record<ExpeditionColor, string> = {
  // Compass rose (yellow - desert expedition)
  yellow: `<g transform="translate(70,95) scale(1.0)">
    <circle cx="0" cy="0" r="28" fill="none" stroke="currentColor" stroke-width="2"/>
    <polygon points="0,-24 6,-6 0,0 -6,-6" fill="currentColor"/>
    <polygon points="0,24 6,6 0,0 -6,6" fill="currentColor" opacity="0.5"/>
    <polygon points="-24,0 -6,-6 0,0 -6,6" fill="currentColor" opacity="0.5"/>
    <polygon points="24,0 6,-6 0,0 6,6" fill="currentColor"/>
  </g>`,
  // Ship/sail (blue - ocean expedition)
  blue: `<g transform="translate(70,95) scale(1.0)">
    <path d="M-5,20 L-20,20 Q0,-5 5,-25 Q10,-5 20,20 L5,20 Z" fill="currentColor" opacity="0.8"/>
    <line x1="0" y1="-28" x2="0" y2="22" stroke="currentColor" stroke-width="2.5"/>
    <path d="M-22,22 Q0,30 22,22" fill="none" stroke="currentColor" stroke-width="2.5"/>
  </g>`,
  // Mountain/tent (white - alpine expedition)
  white: `<g transform="translate(70,95) scale(1.0)">
    <polygon points="0,-25 22,20 -22,20" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <polygon points="0,-10 12,20 -12,20" fill="currentColor" opacity="0.3"/>
    <line x1="-30" y1="20" x2="30" y2="20" stroke="currentColor" stroke-width="2"/>
  </g>`,
  // Torch/flame (green - jungle expedition)
  green: `<g transform="translate(70,95) scale(1.0)">
    <rect x="-4" y="0" width="8" height="22" rx="2" fill="currentColor" opacity="0.7"/>
    <path d="M0,-22 Q12,-10 6,0 Q3,-5 0,-2 Q-3,-5 -6,0 Q-12,-10 0,-22 Z" fill="currentColor"/>
    <rect x="-8" y="22" width="16" height="3" rx="1" fill="currentColor"/>
  </g>`,
  // Crystal/gem (red - volcano expedition)
  red: `<g transform="translate(70,95) scale(1.0)">
    <polygon points="0,-25 18,-5 12,22 -12,22 -18,-5" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <polygon points="0,-25 8,-5 0,22 -8,-5" fill="currentColor" opacity="0.3"/>
    <line x1="-18" y1="-5" x2="18" y2="-5" stroke="currentColor" stroke-width="1.5"/>
  </g>`,
};

/** Investment/wager symbol — handshake-like icon. */
const INVESTMENT_ICON = `<g transform="translate(70,90) scale(0.9)">
  <circle cx="0" cy="0" r="22" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4,3"/>
  <text x="0" y="8" font-family="serif" font-size="28" font-weight="bold"
        text-anchor="middle" fill="currentColor">$</text>
</g>`;

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
  return `  <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="6" ry="6" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.5"/>`;
}

function rankText(rank: string, color: string, fontSize = 36): string {
  // Top-left and bottom-right rank indicators
  return `  <text x="18" y="38" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="${color}">${rank}</text>
  <text x="${CARD_W - 18}" y="${CARD_H - 18}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="${color}" transform="rotate(180,${CARD_W - 18},${CARD_H - 28})">${rank}</text>`;
}

function colorLabel(name: string, textColor: string): string {
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return `  <text x="${CARD_W / 2}" y="${CARD_H - 10}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="${textColor}" opacity="0.7">${displayName}</text>`;
}

// ── Card generators ────────────────────────────────────────

function generateNumberedCard(color: ExpeditionColor, rank: number): string {
  const bg = BG[color];
  const accent = ACCENT[color];
  const text = TEXT_COLOR[color];
  const icon = ICON_PATH[color].replace(/currentColor/g, accent);

  return `${svgHeader()}
${cardBackground(bg)}
${cardBorder(accent)}
${innerFrame(accent)}
${rankText(String(rank), text)}
${icon}
${colorLabel(color, text)}
</svg>`;
}

function generateInvestmentCard(color: ExpeditionColor, index: number): string {
  const bg = BG[color];
  const accent = ACCENT[color];
  const text = TEXT_COLOR[color];
  const investIcon = INVESTMENT_ICON.replace(/currentColor/g, accent);

  // Show multiplier indicator (number of handshake icons = investment index)
  const dots = Array.from({ length: index }, (_, i) => {
    const x = CARD_W / 2 + (i - (index - 1) / 2) * 20;
    return `  <circle cx="${x}" cy="140" r="6" fill="${accent}" opacity="0.6"/>`;
  }).join('\n');

  return `${svgHeader()}
${cardBackground(bg)}
${cardBorder(accent)}
${innerFrame(accent)}
${rankText('×', text, 32)}
${investIcon}
${dots}
${colorLabel(color, text)}
</svg>`;
}

function generateCardBack(): string {
  // Adventure/expedition themed card back
  const bg = '#2c3e50';
  const accent = '#c9a96e';

  // Diamond pattern
  const diamonds: string[] = [];
  for (let y = 20; y < CARD_H - 10; y += 24) {
    for (let x = 20; x < CARD_W - 10; x += 20) {
      diamonds.push(
        `  <polygon points="${x},${y - 8} ${x + 7},${y} ${x},${y + 8} ${x - 7},${y}" fill="${accent}" opacity="0.15"/>`,
      );
    }
  }

  return `${svgHeader()}
${cardBackground(bg)}
${cardBorder(accent)}
  <rect x="6" y="6" width="${CARD_W - 12}" height="${CARD_H - 12}" rx="7" ry="7" fill="none" stroke="${accent}" stroke-width="1.5"/>
${diamonds.join('\n')}
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="35" fill="none" stroke="${accent}" stroke-width="2.5"/>
  <circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="28" fill="${accent}" opacity="0.2"/>
  <text x="${CARD_W / 2}" y="${CARD_H / 2 + 7}" font-family="serif" font-size="26" font-weight="bold" text-anchor="middle" fill="${accent}">LC</text>
  <text x="${CARD_W / 2}" y="${CARD_H / 2 + 24}" font-family="serif" font-size="12" text-anchor="middle" fill="${accent}" opacity="0.8">EXPEDITION</text>
</svg>`;
}

// ── Main ───────────────────────────────────────────────────

function main(): void {
  // Ensure output directory exists
  mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;

  // Generate numbered cards (5 colors × 9 ranks = 45 cards)
  for (const color of COLORS) {
    for (let rank = 2; rank <= 10; rank++) {
      const key = `lc-${color}-${rank}`;
      const svg = generateNumberedCard(color, rank);
      writeFileSync(join(OUT_DIR, `${key}.svg`), svg);
      count++;
    }
  }

  // Generate investment cards (5 colors × 3 investments = 15 cards)
  for (const color of COLORS) {
    for (let idx = 1; idx <= 3; idx++) {
      const key = `lc-${color}-inv${idx}`;
      const svg = generateInvestmentCard(color, idx);
      writeFileSync(join(OUT_DIR, `${key}.svg`), svg);
      count++;
    }
  }

  // Generate card back (1 card)
  const backSvg = generateCardBack();
  writeFileSync(join(OUT_DIR, 'lc-back.svg'), backSvg);
  count++;

  console.log(`Generated ${count} SVG card images in ${OUT_DIR}`);
}

main();
