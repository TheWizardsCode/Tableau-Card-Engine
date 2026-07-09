import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, copyFileSync } from 'node:fs';

export interface CsvRow {
  family: string;
  id: string;
  name: string;
  cost: string;
  baseIncome: string;
  synergyTypes: string;
  upgradePath: string;
  maxLevel: string;
  reputationPerTurn: string;
  description: string;
  tier: string;
  trigger?: string;
  effect?: string;
  target?: string;
  targetSynergy?: string;
  coinDelta?: string;
  reputationDelta?: string;
  duration?: string;
  effectType?: string;
  multiplier?: string;
  targetBusiness?: string;
  incomeBonus?: string;
  synergyRangeBonus?: string;
  requiredLevel?: string;
  reputationBonus?: string;
  synergyCoinBonus?: string;
  synergyRepBonus?: string;
  ongoingCost?: string;
  handSlotsAdded?: string;
}

export const CSV_COLUMNS: readonly string[] = [
  'family', 'id', 'name', 'cost', 'baseIncome', 'synergyTypes', 'upgradePath',
  'maxLevel', 'reputationPerTurn', 'synergyCoinBonus', 'synergyRepBonus',
  'description', 'tier', 'trigger', 'effect', 'target',
  'targetSynergy', 'coinDelta', 'reputationDelta', 'duration', 'effectType',
  'multiplier', 'targetBusiness', 'incomeBonus', 'synergyRangeBonus',
  'requiredLevel', 'reputationBonus', 'ongoingCost', 'handSlotsAdded',
];

export const NUMERIC_COLUMNS: readonly string[] = [
  'cost', 'baseIncome', 'coinDelta', 'reputationDelta', 'incomeBonus',
  'ongoingCost', 'reputationPerTurn', 'reputationBonus', 'synergyCoinBonus',
  'synergyRepBonus', 'synergyRangeBonus', 'requiredLevel', 'handSlotsAdded',
  'maxLevel', 'duration', 'multiplier',
];

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('CSV file must have a header row and at least one data row');
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  if (headers.length !== CSV_COLUMNS.length) {
    throw new Error(`CSV has ${headers.length} columns but expected ${CSV_COLUMNS.length}. Columns: ${headers.join(', ')}`);
  }
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? '';
    rows.push(row as unknown as CsvRow);
  }
  return rows;
}

export function toCsvString(rows: CsvRow[]): string {
  const headerLine = CSV_COLUMNS.join(',');
  const dataLines = rows.map(row => {
    const fields: string[] = [];
    for (const col of CSV_COLUMNS) {
      const value = (row as unknown as Record<string, string>)[col] ?? '';
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        fields.push('"' + value.replace(/"/g, '""') + '"');
      } else {
        fields.push(value);
      }
    }
    return fields.join(',');
  });
  return [headerLine, ...dataLines].join('\n') + '\n';
}

export function validateRow(row: CsvRow, rowIndex: number): string[] {
  const errors: string[] = [];
  const prefix = `Row ${rowIndex + 1} (${row.id || '(missing id)'})`;
  if (!row.id) errors.push(`${prefix}: missing card id`);
  if (!row.name) errors.push(`${prefix}: missing card name`);
  if (!row.family) errors.push(`${prefix}: missing family`);
  for (const col of NUMERIC_COLUMNS) {
    const val = (row as unknown as Record<string, string>)[col];
    if (val !== '' && val !== undefined && isNaN(parseFloat(val))) {
      errors.push(`${prefix}: column '${col}' has non-numeric value '${val}'`);
    }
  }
  const validFamilies = ['business', 'community-space', 'event', 'upgrade', 'staff'];
  if (row.family && !validFamilies.includes(row.family)) {
    errors.push(`${prefix}: unknown family '${row.family}'`);
  }
  return errors;
}

export function validateCsvRows(rows: CsvRow[]): void {
  const allErrors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    allErrors.push(...validateRow(rows[i], i));
  }
  if (allErrors.length > 0) {
    throw new Error(`CSV validation failed (${allErrors.length} errors):\n  - ${allErrors.join('\n  - ')}`);
  }
}

export function readCsvFile(filePath: string): CsvRow[] {
  if (!existsSync(filePath)) throw new Error(`CSV file not found: ${filePath}`);
  const content = readFileSync(filePath, 'utf-8');
  return parseCsv(content);
}

export function writeCsvFile(filePath: string, rows: CsvRow[]): void {
  const content = toCsvString(rows);
  writeFileSync(filePath, content, 'utf-8');
}

const MAX_BACKUPS = 5;

export function rotateBackups(filePath: string): void {
  if (!existsSync(filePath)) return;
  const oldestPath = `${filePath}.bak.${MAX_BACKUPS}`;
  if (existsSync(oldestPath)) unlinkSync(oldestPath);
  for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
    const from = `${filePath}.bak.${i}`;
    const to = `${filePath}.bak.${i + 1}`;
    if (existsSync(from)) renameSync(from, to);
  }
  copyFileSync(filePath, `${filePath}.bak.1`);
}

export function listBackups(filePath: string): string[] {
  const backups: string[] = [];
  for (let i = 1; i <= MAX_BACKUPS; i++) {
    if (existsSync(`${filePath}.bak.${i}`)) backups.push(`${filePath}.bak.${i}`);
  }
  return backups;
}
