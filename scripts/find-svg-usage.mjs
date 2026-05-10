#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGET = join(ROOT, 'example-games');

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
      continue;
    }

    if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      files.push(full);
    }
  }

  return files;
}

const PATTERN = /\bload\.svg\s*\(/g;
const files = walk(TARGET);
const results = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (PATTERN.test(lines[i])) {
      results.push({
        file: relative(ROOT, file),
        line: i + 1,
        text: lines[i].trim(),
      });
    }
    PATTERN.lastIndex = 0;
  }
}

const byFile = new Map();
for (const r of results) {
  if (!byFile.has(r.file)) byFile.set(r.file, []);
  byFile.get(r.file).push({ line: r.line, text: r.text });
}

const output = {
  scannedRoot: relative(ROOT, TARGET),
  pattern: 'load.svg(',
  filesWithMatches: byFile.size,
  totalMatches: results.length,
  matches: Array.from(byFile.entries()).map(([file, hits]) => ({ file, hits })),
};

console.log(JSON.stringify(output, null, 2));
