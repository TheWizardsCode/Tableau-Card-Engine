#!/usr/bin/env node
// Simple SVG -> PNG exporter using sharp
// Usage: node tools/export-sushi-icons.js --src public/assets/sushi-go --out public/assets/sushi-go/png --sizes 128x128,110x145,72x48

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

function usage() {
  console.log('Usage: node tools/export-sushi-icons.js --src <svg-dir> --out <out-dir> --sizes <WxH,WxH>');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { sizes: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--src') out.src = args[++i];
    else if (a === '--out') out.out = args[++i];
    else if (a === '--sizes') out.sizes = args[++i].split(',');
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (!opts.src || !opts.out || !opts.sizes.length) {
    usage();
    process.exit(1);
  }

  const svgDir = path.resolve(opts.src);
  const outDir = path.resolve(opts.out);
  if (!fs.existsSync(svgDir)) {
    console.error('SVG source directory not found:', svgDir);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(svgDir).filter((f) => f.endsWith('.svg'));
  for (const file of files) {
    const srcPath = path.join(svgDir, file);
    const base = file.replace(/\.svg$/, '');
    for (const size of opts.sizes) {
      const [w, h] = size.split('x').map((s) => parseInt(s, 10));
      const outPath = path.join(outDir, `${base}-${w}x${h}.png`);
      try {
        await sharp(srcPath)
          .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png({ quality: 90 })
          .toFile(outPath);
        console.log('Wrote', outPath);
      } catch (err) {
        console.error('Failed to render', srcPath, '->', outPath, err);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
