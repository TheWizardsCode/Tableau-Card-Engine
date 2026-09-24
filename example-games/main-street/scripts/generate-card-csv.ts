/**
 * Generates card-data.csv from MainStreetCards.ts template data.
 * Run with: npx tsx scripts/generate-card-csv.ts [ts-file-path]
 *
 * The row-building logic is exported as a pure function (`buildCsvRows`)
 * so tests can validate the generated CSV content without side effects.
 * File I/O only happens when the script is executed directly.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(f => escapeCsvField(String(f ?? ''))).join(',');
}

function extractArrayObjects(text: string, marker: string): string[] {
  const markerPos = text.indexOf(marker);
  if (markerPos === -1) return [];
  // Find the first '[' that is part of the array initializer (= [...])
  const afterMarker = text.substring(markerPos);
  const eqMatch = afterMarker.match(/=\s*\[/);
  if (!eqMatch) return [];
  const bracketPos = markerPos + eqMatch.index! + 1; // position of '[' after '='

  // Find the matching ] for this [
  let depth = 0;
  let arrayEnd = bracketPos;
  for (let i = bracketPos; i < text.length; i++) {
    if (text[i] === '[') depth++;
    if (text[i] === ']') { depth--; if (depth === 0) { arrayEnd = i; break; } }
  }

  const arrayBlock = text.substring(bracketPos, arrayEnd + 1);

  // Extract each { } object from the array block
  const objects: string[] = [];
  depth = 0;
  let objStart = -1;
  for (let i = 0; i < arrayBlock.length; i++) {
    if (arrayBlock[i] === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (arrayBlock[i] === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        objects.push(arrayBlock.substring(objStart, i + 1));
        objStart = -1;
      }
    }
  }

  return objects;
}

function parseStringProp(block: string, prop: string): string | null {
  // Find 'prop: ' in the block
  const prefix = prop + ':';
  const idx = block.indexOf(prefix);
  if (idx === -1) return null;
  // Skip whitespace after colon
  let pos = idx + prefix.length;
  while (pos < block.length && block[pos] === ' ') pos++;
  if (pos >= block.length) return null;
  const quoteChar = block[pos];
  if (quoteChar !== "'" && quoteChar !== '"') return null;
  // Find closing quote, handling escapes
  let value = '';
  pos++;
  while (pos < block.length) {
    if (block[pos] === '\\' && pos + 1 < block.length) {
      value += block[pos + 1];
      pos += 2;
    } else if (block[pos] === quoteChar) {
      break;
    } else {
      value += block[pos];
      pos++;
    }
  }
  return value || null;
}

function parseNumberProp(block: string, prop: string): number | null {
  const m = block.match(new RegExp(prop + ':\\s*(-?[0-9.]+)'));
  return m ? parseFloat(m[1]) : null;
}

function parseArrayProp(block: string, prop: string): string[] {
  const m = block.match(new RegExp(prop + ':\\s*\\[([^\\]]*)\\]'));
  if (!m) return [];
  return m[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean);
}

// CSV columns
export const COLS = [
  'family', 'id', 'name', 'cost', 'baseIncome', 'synergyTypes', 'upgradePath',
  'maxLevel', 'reputationPerTurn', 'description', 'trigger', 'effect', 'target',
  'targetSynergy', 'coinDelta', 'reputationDelta', 'duration', 'effectType',
  'multiplier', 'targetBusiness', 'incomeBonus', 'synergyRangeBonus',
  'requiredLevel', 'reputationBonus', 'ongoingCost', 'handSlotsAdded',
];

function buildCsvRow(card: Record<string, string | number>): string {
  const fields: (string | number)[] = [];
  for (const col of COLS) {
    const v = card[col];
    fields.push(v ?? '');
  }
  return csvRow(fields);
}

/**
 * Build CSV data rows (excluding the header) from MainStreetCards.ts
 * template content. Pure function — performs no file I/O.
 *
 * @param tsContent  Raw TypeScript source containing the card template arrays.
 * @returns Array of CSV data rows, one per parsed card.
 */
export function buildCsvRows(tsContent: string): string[] {
  const businessObjs = extractArrayObjects(tsContent, 'BUSINESS_TEMPLATES');
  const csObjs = extractArrayObjects(tsContent, 'COMMUNITY_SPACE_TEMPLATES');
  const eventObjs = extractArrayObjects(tsContent, 'EVENT_TEMPLATES');
  const upgradeObjs = extractArrayObjects(tsContent, 'UPGRADE_TEMPLATES');
  const staffObjs = extractArrayObjects(tsContent, 'STAFF_CARD_TEMPLATES');

  const rows: string[] = [];

  // Business
  for (const obj of businessObjs) {
    rows.push(buildCsvRow({
      family: 'business',
      id: parseStringProp(obj, 'id') || '',
      name: parseStringProp(obj, 'name') || '',
      cost: parseNumberProp(obj, 'cost') ?? '',
      baseIncome: parseNumberProp(obj, 'baseIncome') ?? '',
      synergyTypes: parseArrayProp(obj, 'synergyTypes').join('|'),
      upgradePath: parseStringProp(obj, 'upgradePath') || '',
      maxLevel: parseNumberProp(obj, 'maxLevel') ?? '',
      reputationPerTurn: parseNumberProp(obj, 'reputationPerTurn') ?? '',
      description: parseStringProp(obj, 'description') || '',
    }));
  }

  // Community Space
  for (const obj of csObjs) {
    rows.push(buildCsvRow({
      family: 'community-space',
      id: parseStringProp(obj, 'id') || '',
      name: parseStringProp(obj, 'name') || '',
      cost: parseNumberProp(obj, 'cost') ?? '',
      baseIncome: parseNumberProp(obj, 'baseIncome') ?? '',
      synergyTypes: parseArrayProp(obj, 'synergyTypes').join('|'),
      upgradePath: parseStringProp(obj, 'upgradePath') || '',
      maxLevel: parseNumberProp(obj, 'maxLevel') ?? '',
      reputationPerTurn: parseNumberProp(obj, 'reputationPerTurn') ?? '',
      description: parseStringProp(obj, 'description') || '',
    }));
  }

  // Event
  for (const obj of eventObjs) {
    rows.push(buildCsvRow({
      family: 'event',
      id: parseStringProp(obj, 'id') || '',
      name: parseStringProp(obj, 'name') || '',
      cost: parseNumberProp(obj, 'cost') ?? '',
      trigger: parseStringProp(obj, 'trigger') || '',
      effect: parseStringProp(obj, 'effect') || '',
      target: parseStringProp(obj, 'target') || '',
      targetSynergy: parseStringProp(obj, 'targetSynergy') || '',
      coinDelta: parseNumberProp(obj, 'coinDelta') ?? '',
      reputationDelta: parseNumberProp(obj, 'reputationDelta') ?? '',
      duration: parseNumberProp(obj, 'duration') ?? '',
      effectType: parseStringProp(obj, 'effectType') || '',
      multiplier: parseNumberProp(obj, 'multiplier') ?? '',
    }));
  }

  // Upgrade
  for (const obj of upgradeObjs) {
    rows.push(buildCsvRow({
      family: 'upgrade',
      id: parseStringProp(obj, 'id') || '',
      name: parseStringProp(obj, 'name') || '',
      cost: parseNumberProp(obj, 'cost') ?? '',
      targetBusiness: parseStringProp(obj, 'targetBusiness') || '',
      incomeBonus: parseNumberProp(obj, 'incomeBonus') ?? '',
      synergyRangeBonus: parseNumberProp(obj, 'synergyRangeBonus') ?? '',
      requiredLevel: parseNumberProp(obj, 'requiredLevel') ?? '',
      reputationBonus: parseNumberProp(obj, 'reputationBonus') ?? '',
      description: parseStringProp(obj, 'description') || '',
    }));
  }

  // Staff
  for (const obj of staffObjs) {
    rows.push(buildCsvRow({
      family: 'staff',
      id: parseStringProp(obj, 'id') || '',
      name: parseStringProp(obj, 'name') || '',
      cost: parseNumberProp(obj, 'cost') ?? '',
      ongoingCost: parseNumberProp(obj, 'ongoingCost') ?? '',
      handSlotsAdded: parseNumberProp(obj, 'handSlotsAdded') ?? '',
      description: parseStringProp(obj, 'description') || '',
    }));
  }

  return rows;
}

// ── CLI ─────────────────────────────────────────────────────

const scriptName = 'generate-card-csv.ts';
if (process.argv[1]?.endsWith(scriptName)) {
  const tsPath = process.argv[2] || resolve(process.cwd(), 'example-games/main-street/MainStreetCards.ts');
  const ts = readFileSync(tsPath, 'utf8');

  const rows = buildCsvRows(ts);

  console.log(`Parsed ${extractArrayObjects(ts, 'BUSINESS_TEMPLATES').length} business templates`);
  console.log(`Parsed ${extractArrayObjects(ts, 'COMMUNITY_SPACE_TEMPLATES').length} community space templates`);
  console.log(`Parsed ${extractArrayObjects(ts, 'EVENT_TEMPLATES').length} event templates`);
  console.log(`Parsed ${extractArrayObjects(ts, 'UPGRADE_TEMPLATES').length} upgrade templates`);
  console.log(`Parsed ${extractArrayObjects(ts, 'STAFF_CARD_TEMPLATES').length} staff templates`);

  const csv = [COLS.join(','), ...rows].join('\n') + '\n';
  const outPath = resolve(process.cwd(), 'example-games/main-street/card-data.csv');
  writeFileSync(outPath, csv, 'utf8');
  console.log(`Wrote ${outPath} (${rows.length} data rows)`);
}
