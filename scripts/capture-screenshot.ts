import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'data', 'screenshots', 'main-street');

mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();

  // Use the full path that should work with a click: game selector loads then we click Main Street
  const url = 'http://localhost:3000/';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Use injected JS to find button and click
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    const btn = btns.find((b: any) => b.textContent?.includes('Main Street') || b.innerText?.includes('Main Street'));
    if (btn) { (btn as HTMLElement).click(); return true; }
    return false;
  });
  console.log('Clicked via JS?', clicked);
  console.log('Clicked Main Street');

  // Wait for MainStreetScene
  await page.waitForFunction(
    `(() => {
      const g = window.__PHASER_GAME__;
      const scene = g && g.scene.getScene('MainStreetScene');
      return scene && scene.sys && scene.sys.isActive;
    })()`,
    { timeout: 30000 },
  );
  console.log('MainStreetScene is active');

  // Now enable replay mode manually (since we bypassed normal init)
  await page.evaluate(() => {
    const g = (window as any).__PHASER_GAME__;
    const scene = g.scene.getScene('MainStreetScene');
    scene.replayMode = true;
  });
  console.log('Set replayMode = true');

  // Inject state
  await page.evaluate(() => {
    const g = (window as any).__PHASER_GAME__;
    const scene = g.scene.getScene('MainStreetScene');
    scene.loadBoardState({ seed: 'FixtureSeed123' });
  });
  console.log('Injected state.');

  // Wait for render
  await page.waitForTimeout(1000);

  // Screenshot
  const dataUrl: string = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas');
    return canvas.toDataURL('image/png');
  });

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const outPath = join(OUT_DIR, 'turn-000.png');
  writeFileSync(outPath, Buffer.from(base64, 'base64'));
  console.log('Wrote', outPath);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });