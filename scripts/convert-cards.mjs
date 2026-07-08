#!/usr/bin/env node
/**
 * Card Asset Pipeline Script
 * 
 * Copies SVG card assets from saulspatz/SVGCards Vertical2 deck,
 * renames them to the project naming convention (rank_of_suit.svg),
 * and resizes from 210x315px to 140x190px.
 * 
 * Usage: node scripts/convert-cards.mjs
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SOURCE_DIR = '/tmp/SVGCards/Decks/Vertical2/svgs';
const TARGET_DIR = join(import.meta.dirname, '..', 'public', 'assets', 'cards');

const TARGET_WIDTH = 140;
const TARGET_HEIGHT = 190;

// Mapping from source filename (without .svg) to target filename (without .svg)
const SUIT_MAP = {
  club: 'clubs',
  diamond: 'diamonds',
  heart: 'hearts',
  spade: 'spades',
};

const RANK_MAP = {
  Ace: 'ace',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  Jack: 'jack',
  Queen: 'queen',
  King: 'king',
};

// Build the full mapping: sourceFile -> targetFile
const fileMapping = [];
for (const [suitKey, suitName] of Object.entries(SUIT_MAP)) {
  for (const [rankKey, rankName] of Object.entries(RANK_MAP)) {
    const sourceFile = `${suitKey}${rankKey}.svg`;
    const targetFile = `${rankName}_of_${suitName}.svg`;
    fileMapping.push({ sourceFile, targetFile });
  }
}

// Also copy the card back
const BACK_SOURCE = 'blueBack.svg';
const BACK_TARGET = 'card_back.svg';

function resizeSvg(svgContent) {
  // Replace width="~210" (including variants like 209.99992) with width="140"
  let result = svgContent.replace(
    /width="2(?:10|09)(?:\.[\d]*)?"/, 
    `width="${TARGET_WIDTH}"`
  );
  // Replace height="315..." with height="190"
  result = result.replace(
    /height="315(?:\.[\d]*)?"/, 
    `height="${TARGET_HEIGHT}"`
  );
  return result;
}

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
  }

  let successCount = 0;
  let errorCount = 0;

  // Process 52 card faces
  for (const { sourceFile, targetFile } of fileMapping) {
    const sourcePath = join(SOURCE_DIR, sourceFile);
    const targetPath = join(TARGET_DIR, targetFile);

    if (!existsSync(sourcePath)) {
      console.error(`Missing source file: ${sourceFile}`);
      errorCount++;
      continue;
    }

    const svgContent = readFileSync(sourcePath, 'utf-8');
    const resized = resizeSvg(svgContent);
    writeFileSync(targetPath, resized, 'utf-8');
    console.log(`  ${sourceFile} -> ${targetFile}`);
    successCount++;
  }

  // Process card back
  const backSourcePath = join(SOURCE_DIR, BACK_SOURCE);
  const backTargetPath = join(TARGET_DIR, BACK_TARGET);

  if (existsSync(backSourcePath)) {
    const svgContent = readFileSync(backSourcePath, 'utf-8');
    const resized = resizeSvg(svgContent);
    writeFileSync(backTargetPath, resized, 'utf-8');
    console.log(`  ${BACK_SOURCE} -> ${BACK_TARGET}`);
    successCount++;
  } else {
    console.error(`Missing card back: ${BACK_SOURCE}`);
    errorCount++;
  }

  console.log(`\nDone: ${successCount} files converted, ${errorCount} errors.`);
  
  if (errorCount > 0) {
    process.exit(1);
  }
}

main();
