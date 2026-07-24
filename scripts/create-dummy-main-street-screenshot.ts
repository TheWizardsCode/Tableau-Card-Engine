import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = join(__dirname, '..', 'data', 'screenshots', 'main-street');
mkdirSync(outDir, { recursive: true });

async function main() {
  const img = sharp({
    create: {
      width: 480,
      height: 272,
      channels: 3,
      background: { r: 60, g: 120, b: 180 },
    },
  });
  await img.png().toFile(join(outDir, 'turn-000.png'));
  console.log('Wrote', join(outDir, 'turn-000.png'));
}

main().catch((e) => { console.error(e); process.exit(1); });
