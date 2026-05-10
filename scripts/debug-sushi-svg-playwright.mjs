import { spawn } from 'child_process';
import { chromium } from 'playwright';
import fs from 'fs';

function startDevServer() {
  console.log('Starting dev server: npm run dev');
  const p = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.stdout.write(`[dev stdout] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[dev stderr] ${d}`));
  return p;
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timeout waiting for dev server');
}

(async () => {
  const dev = startDevServer();
  try {
    await waitForServer('http://localhost:3000');
    console.log('Dev server ready');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const logs = [];
    page.on('console', (msg) => {
      logs.push({ type: msg.type(), text: msg.text() });
      console.log(`[browser console] ${msg.type()}: ${msg.text()}`);
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Ensure the Phaser game is exposed
    await page.waitForFunction(() => !!window.__PHASER_GAME__, { timeout: 10000 });
    console.log('Phaser game exposed on window.__PHASER_GAME__');

    // Start SushiGoScene directly
    await page.evaluate(() => {
      const g = window.__PHASER_GAME__;
      g.scene.start('SushiGoScene');
    });

    // Wait a few seconds for scene preload/create to run
    await page.waitForTimeout(3000);

    // Capture whether textures exist
    const textureExists = await page.evaluate(() => {
      const game = window.__PHASER_GAME__;
      const scene = game && game.scene && game.scene.getScene && game.scene.getScene('SushiGoScene');
      if (!scene) return { ok: false, reason: 'scene missing' };
      const keys = [
        'icon-nigiri-salmon', 'icon-nigiri-egg', 'icon-nigiri-squid',
        'icon-maki-1', 'icon-maki-2', 'icon-maki-3',
        'icon-tempura', 'icon-sashimi', 'icon-dumpling',
        'icon-wasabi', 'icon-pudding', 'icon-chopsticks',
      ];
      const exists = {};
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        try { exists[k] = !!scene.textures.exists(k); } catch (e) { exists[k] = false; }
      }
      return { ok: true, exists };
    });

    console.log('Texture existence:', JSON.stringify(textureExists, null, 2));

    // Screenshot the canvas
    const canvas = await page.$('canvas');
    if (!canvas) {
      console.error('No canvas found');
    } else {
      await canvas.screenshot({ path: 'artifacts/sushi-go-scene.png' });
      console.log('Saved screenshot to artifacts/sushi-go-scene.png');
    }

    // Save console logs
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/sushi-go-console.json', JSON.stringify(logs, null, 2));
    console.log('Saved browser console logs to artifacts/sushi-go-console.json');

    await browser.close();
  } catch (e) {
    console.error('Error during repro run:', e);
    process.exitCode = 2;
  } finally {
    // Kill dev server
    try {
      dev.kill();
    } catch (e) {}
  }
})();
