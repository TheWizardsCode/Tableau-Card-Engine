import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Read card data from CSV (source of truth — CG-0MR6ZR23J006ZDNZ)
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

const csvPath = path.resolve('example-games/main-street/card-data.csv');
const csvText = fs.readFileSync(csvPath, 'utf8');
const lines = csvText.trim().split('\n');
const headers = parseCsvLine(lines[0]);

const templates = [];
for (let i = 1; i < lines.length; i++) {
  const values = parseCsvLine(lines[i]);
  const card = {};
  for (let j = 0; j < headers.length; j++) {
    card[headers[j]] = values[j] !== undefined ? values[j] : '';
  }

  // Determine family from prefix if not in CSV
  const family = card.family || (card.id.startsWith('biz-') ? 'business' : card.id.startsWith('evt-') ? 'event' : card.id.startsWith('cs-') ? 'community-space' : card.id.startsWith('staff-') ? 'staff' : 'upgrade');
  const synergies = card.synergyTypes ? card.synergyTypes.split('|').filter(Boolean) : [];
  const cost = card.cost ? Number(card.cost) : null;
  const trigger = card.trigger || null;

  templates.push({ id: card.id, name: card.name, cost, family, trigger, synergies });
}

// ---------------------------------------------------------------------------
// SVG generation (unchanged)
// ---------------------------------------------------------------------------

// Color map
const synergyColor = {
  Food: '#E67E22',
  Culture: '#3498DB',
  Commerce: '#27AE60',
  Service: '#9B59B6',
  Entertainment: '#E74C3C',
  Health: '#1ABC9C',
};

function familyColor(family, trigger) {
  if (family === 'business') return '#2f2f2f';
  if (family === 'upgrade') return '#6B4C9A';
  if (family === 'event') return trigger === 'Incident' ? '#2B3A67' : '#8B4513';
  if (family === 'community-space') return '#2f2f2f';
  if (family === 'staff') return '#555555';
  return '#333333';
}

const outDir = path.resolve('public/assets/games/main-street/svg/cards');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const iconsDir = path.resolve('public/assets/games/main-street/svg/icons');

for (const t of templates) {
  const w = 140, h = 80;
  const bg = familyColor(t.family, t.trigger);
  const accent = t.synergies && t.synergies.length > 0 ? (synergyColor[t.synergies[0]] || '#cccccc') : '#cccccc';
  const displayCost = t.cost !== null ? `$${t.cost}` : '';

  const title = t.name.replace(/&/g, '&amp;');
  const syLabel = (t.synergies || []).join('/');

  // Try to inline a matching icon for the first synergy type
  let iconMarkup = '';
  if (t.synergies && t.synergies.length > 0) {
    const key = t.synergies[0];
    const iconFile = `ms-icon-${String(key).toLowerCase()}.svg`;
    const iconPath = path.join(iconsDir, iconFile);
    if (fs.existsSync(iconPath)) {
      let iconSvg = fs.readFileSync(iconPath, 'utf8');
      // strip XML prolog
      iconSvg = iconSvg.replace(/<\?xml[^>]*\?>\s*/i, '');
      // strip outer <svg ...> and </svg>
      iconSvg = iconSvg.replace(/^\s*<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
      // place icon at bottom-left (approx x=6, y=h-22) scaled to 16x16
      iconMarkup = `  <g class="ms-synergy-icon" aria-hidden="false" transform="translate(6, ${h-22})">\n    <svg width="16" height="16" viewBox="0 0 16 16" role="img" aria-label="${key} icon">${iconSvg}\n    </svg>\n  </g>`;
    } else {
      // fallback dot: conservative placement
      iconMarkup = `  <circle class="ms-synergy-fallback" cx="14" cy="${h-10}" r="6" fill="${accent}" aria-hidden="true" />`;
    }
  }

  const priceBadge = displayCost
    ? `<circle cx="${w-16}" cy="56" r="12" fill="#e0c7a0" stroke="#c8b79a" stroke-width="1.5" />`
    : '';
  const priceText = displayCost
    ? `<text x="${w-16}" y="60" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" fill="#3a2a14" text-anchor="middle" font-weight="500">${t.cost}</text>`
    : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">\n  <defs>\n    <linearGradient id="g-${t.id}" x1="0" x2="1">\n      <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>\n      <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>\n    </linearGradient>\n  </defs>\n  <rect x="0" y="0" width="${w}" height="${h}" rx="6" ry="6" fill="${bg}" />\n  <rect x="4" y="4" width="${w-8}" height="${h-8}" rx="4" ry="4" fill="url(#g-${t.id})" />\n  <rect x="4" y="4" width="${w-8}" height="20" rx="3" ry="3" fill="${accent}" opacity="0.18" />\n  <text x="${w/2}" y="19" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" fill="#ffffff" font-weight="400" text-anchor="middle">${title}</text>\n${priceBadge}\n${priceText}\n${iconMarkup}\n\n</svg>\n`;

  const outPath = path.join(outDir, `${t.id}.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');
}

console.log('Generated', templates.length, 'card SVGs into', outDir);
