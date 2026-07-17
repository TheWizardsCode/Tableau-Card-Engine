/**
 * Lightweight CSV parser — build-time data loading utility.
 *
 * Parses a CSV string into an array of objects, one per data row.
 * The first row is treated as the header. Quoted fields (double-quoted
 * with internal commas, newlines, or escaped quotes) are supported.
 *
 * This is used at module load time to import CSV-based game data that
 * is bundled via Vite's `?raw` import suffix.
 *
 * @module
 */

/**
 * Parse a CSV string into an array of string-keyed row objects.
 *
 * @param csv      The full CSV text (header + data rows, newline-separated).
 * @param headers  Optional pre-defined header array. If omitted, the first
 *                 row of the CSV is used as the header.
 * @returns Array of objects, one per data row.
 */
export function parseCsv(csv: string, headers?: string[]): Record<string, string>[] {
  if (!csv || csv.trim() === '') return [];
  const lines = splitLines(csv);
  const headerLine = headers ?? lines[0];
  const cols = Array.isArray(headerLine) ? headerLine : parseLine(headerLine);
  const rows: Record<string, string>[] = [];

  for (let i = (headers ? 0 : 1); i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue; // skip blank lines
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    for (let j = 0; j < cols.length; j++) {
      obj[cols[j]] = values[j] !== undefined ? values[j].trim() : '';
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * Split a CSV string into individual lines, handling quoted newlines.
 * Within double-quoted fields, literal newlines are preserved and the
 * field is treated as a single logical line.
 */
function splitLines(csv: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (ch === '"' && !inQuotes) {
      inQuotes = true;
      current += ch;
    } else if (ch === '"' && inQuotes) {
      // Check for escaped quote ""
      if (csv[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = false;
        current += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (ch === '\r' && !inQuotes) {
      // Skip \r\n — the \n will handle the line break
      if (csv[i + 1] !== '\n') {
        current += ch;
      }
    } else {
      current += ch;
    }
  }

  // Push the last line (no trailing newline)
  if (current !== '') {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV line into an array of field values.
 * Handles:
 * - Quoted fields (double-quoted with escaped inner quotes)
 * - Fields with embedded commas and newlines
 * - Empty fields
 * - Escaped quotes (double-double-quote "")
 */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          // End of quoted field
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

  // Push the last field
  fields.push(current);

  return fields;
}
