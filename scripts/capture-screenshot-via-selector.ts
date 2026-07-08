import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 900, height: 700 },
    // pretend to be a special replayscript query param the selector should understand
  });
  const page = await context.newPage();

  // Use a route/URL that tries to go the MainStreetScene directly after the game boots and selects the game
  // Actually, we can just put game=main-street in the query, and after the selector loads we'll click the game.
  // But can we click using the selector? We can get the selector button by text "Main Street", wait for it, and click.

  // Another option: use GameSelectorScene features to auto-start a game if URL has parameters.
  // Let's try using the URL with ?game=main-street and see if the GameSelector loads then redirects.
  console.log('Navigating to selector with game=main-street');
  await page.goto('http://localhost:3000/?game=main-street', { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Waiting for selector to load...');
  // Wait for some "game-selector" button to appear; the Help button has text "Help"
  await page.waitForSelector('text=Main Street', { timeout: 5000 }).catch(() => console.log('Selector not found'));

  // Let's try to find the button and click it
  console.log('Clicking "Main Street" button');
  const btn = await page.$('text=Main Street');
  if (btn) {
    await btn.click();
    console.log('Clicked.');
  } else {
    console.log('Could not find Main Street button automatically. Manual approach required.');
    // If we can't click, we can simulate the flow: request the scene start from the screeen.
    // The selector makes all games in the list; selecting one starts the game
  }

  // WE can try a "manual hack": simply. override the selection logic
  // For now, let's work with the generic tool approach: Use a special route that adds the button click

  /*
  // Wait for game boot
  await page.waitForFunction(
    `(() => {
      const g = window.__PHASER_GAME__;
      return g && g.isBooted && g.isRunning;
    })()`,
    { timeout: 30000 },
  );
  */

  await page.waitForTimeout(3000);
  console.log('Page URL:', page.url());
  // Let's see the screen content
  //   const content = await page.content();
  //   console.log('HTML snippet:', content.substring(0, 1000));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });