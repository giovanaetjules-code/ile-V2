/* Test de fumée : node tools/smoke.js  (nécessite playwright + chromium). Écrit des captures dans OUT. */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '01-title.png') });

  await page.click('#btn-new');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, '02-start.png') });

  const info = await page.evaluate(() => {
    const d = window.Iles.debug, p = d.game.local;
    return { screen: window.Iles.Menu.screen, x: p.x, y: p.y, scale: d.renderer.scale, w: d.renderer.w, h: d.renderer.h, objs: d.game.state.world.objects.length, drops: d.game.state.world.drops.length };
  });
  console.log('start', JSON.stringify(info));
  console.log('errors', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
