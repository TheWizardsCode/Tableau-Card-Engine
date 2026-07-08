import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  const url = 'http://localhost:3000?mode=replay&game=main-street';
  console.log('Navigating to', url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.error('goto error:', e);
  }

  // Wait briefly
  await page.waitForTimeout(2000);

  const hasGame = await page.evaluate(() => !!(window as any).__PHASER_GAME__);
  console.log('__PHASER_GAME__ present?', hasGame);
  if (hasGame) {
    const info = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = (window as any).__PHASER_GAME__;
      try {
        const sc = g.scene.getScene('MainStreetScene');
        return {
          isBooted: g.isBooted,
          isRunning: g.isRunning,
          scenes: Object.keys(g.scene.keys || {}),
          msScene: sc ? (sc.sys && sc.sys.isActive ? 'active' : 'not active') : 'null'
        };
      } catch (e) {
        return { msg: 'error reading game', e: String(e) };
      }
    });
    console.log('game info:', info);
  }

  await browser.close();
})();
