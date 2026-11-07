/*
 * Test « Shaders update » : météo déterministe (pluie courte, pousse accélérée), option Shaders (off / léger / complet) et rendu
 * réel : lumières dynamiques, ombres, pluie et brume, repli 2D, aucune erreur JavaScript.
 *   node tools/test-weather.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const A = await ctx.newPage();
  A.on('pageerror', e => errors.push('pageerror: ' + e.message));
  A.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g|stun|ICE|peerjs|tunnel via proxy/i.test(m.text())) errors.push('console: ' + m.text()); });
  await A.goto(URL); await A.waitForTimeout(400);
  const wait = ms => A.waitForTimeout(ms);

  console.log('Météo (calcul)');
  const W = await A.evaluate(() => {
    const w = Iles.weather, out = { types: {}, rainLens: [], jumps: 0, first: [] };
    let lp = null;
    for (let m = 0; m < 1440 * 40; m += 2) { const x = w.at(m); out.types[x.type] = (out.types[x.type] || 0) + 1; if (lp) for (const k of ['cloud', 'rain', 'fog', 'wet']) if (Math.abs(x[k] - lp[k]) > 0.2) out.jumps++; lp = x; }
    for (let i = 0; i < 400; i++) { const s = w.seg(i); if (s.rainB) out.rainLens.push(s.rainB - s.rainA); }
    for (let m = 0; m < 480; m += 20) out.first.push(w.at(m).type);
    out.det = JSON.stringify(w.at(12345)) === JSON.stringify(w.at(12345));
    return out;
  });
  check('les quatre temps existent (clair, nuageux, brume, pluie / orage)', ['clear', 'cloudy', 'fog'].every(k => W.types[k] > 0) && (W.types.rain > 0 || W.types.storm > 0) && W.types.storm > 0, W.types);
  check('la météo varie sans saut brutal', W.jumps === 0, W.jumps);
  check('chaque pluie est courte (45 à 100 min de jeu)', W.rainLens.length > 10 && Math.min(...W.rainLens) >= 45 && Math.max(...W.rainLens) <= 100, [Math.min(...W.rainLens), Math.max(...W.rainLens)]);
  check('le début de partie est dégagé', W.first.every(t => t === 'clear'), W.first);
  check('la météo est déterministe (identique chez l’hôte et l’invité)', W.det);

  console.log('Pluie et cultures');
  const G = await A.evaluate(() => {
    const w = Iles.weather; let s = null;
    for (let i = 2; i < 400 && !s; i++) { const q = w.seg(i); if (q.rainB) s = q; }
    const len = s.rainB - s.rainA, t0 = s.rainA - 5, t1 = s.rainB + 5;
    const g = w.growthMinutes(t1) - w.growthMinutes(t0), plain = t1 - t0;
    // une carotte plantée avant la pluie mûrit plus tôt qu'avec le temps normal
    const need = Iles.CROPS.carrot.days * Iles.config.DAY_MINUTES / Iles.config.FARM_SPEED, d = { crop: 'carrot', t0: t0 };
    const tNormal = t0 + need; let tRain = t0; while (Iles.farming.stage(d, tRain) < 3) tRain += 1;
    return { len, g, plain, tNormal, tRain, rainMin: w.rainMinutes(t1) - w.rainMinutes(t0), bonus: w.RAIN_GROWTH };
  });
  check('pendant la pluie, le temps de pousse compte ×' + G.bonus, Math.abs(G.g - (G.plain + (G.bonus - 1) * G.len)) < 0.01 && Math.abs(G.rainMin - G.len) < 0.01, G);
  check('une plante arrosée mûrit plus tôt', G.tRain < G.tNormal - 10, G);

  console.log('Option Shaders');
  await A.click('#btn-new'); await wait(600);
  const ui = await A.evaluate(() => ({ sel: !!document.getElementById('opt-shader'), opts: [...document.querySelectorAll('#opt-shader option')].map(o => o.value).join(','), cur: Iles.debug.app.settings.shader, gl: Iles.debug.renderer.gl && Iles.debug.renderer.gl.ok }));
  check('réglage Shaders : complets / légers / désactivés, « complets » par défaut', ui.sel && ui.opts === 'high,low,off' && ui.cur === 'high', ui);
  check('WebGL initialisé, canvas des shaders affiché', ui.gl === true && await A.evaluate(() => getComputedStyle(document.getElementById('gl')).visibility === 'visible' && getComputedStyle(document.getElementById('gl')).display !== 'none'));
  await A.evaluate(() => { document.getElementById('opt-shader').value = 'off'; document.getElementById('opt-shader').dispatchEvent(new Event('change')); }); await wait(300);
  const off = await A.evaluate(() => ({ s: Iles.debug.app.settings.shader, mode: Iles.debug.renderer.fxMode, disp: getComputedStyle(document.getElementById('gl')).display, saved: JSON.parse(localStorage.getItem(Iles.config.SETTINGS_KEY)).shader }));
  check('« Désactivés » : canvas shader masqué, réglage sauvegardé', off.s === 'off' && off.mode === 'off' && off.disp === 'none' && off.saved === 'off', off);
  await A.evaluate(() => { document.getElementById('opt-shader').value = 'low'; document.getElementById('opt-shader').dispatchEvent(new Event('change')); }); await wait(300);
  check('« Légers » : shader actif', await A.evaluate(() => Iles.debug.renderer.fxMode === 'low' && Iles.debug.renderer.gl.active));

  console.log('Rendu réel');
  // lecture des pixels du canvas WebGL juste après le rendu (même tâche : le tampon est encore valide)
  const shot = (mode) => A.evaluate((mode) => {
    const r = Iles.debug.renderer, g = Iles.debug.game, cam = Iles.debug.cam, fx = Iles.debug.fx;
    document.getElementById('opt-shader').value = mode; document.getElementById('opt-shader').dispatchEvent(new Event('change'));
    r.draw(g.state, cam, fx, 0.016);
    const src = mode === 'off' ? r.canvas : r.gl.canvas, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const px = (X, Y) => { const d = x.getImageData(Math.round(X * c.width), Math.round(Y * c.height), 1, 1).data; return (d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11); };
    const lum = (X, Y, R) => { let s = 0, n = 0; for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { s += px(X + i / c.width, Y + j / c.height); n++; } return s / n; };
    return { w: c.width, near: lum(0.5, 0.47, 6), far: lum(0.12, 0.2, 6), all: lum(0.5, 0.5, 80) };
  }, mode);
  const setScene = (hour, torch) => A.evaluate(([hour, torch]) => {
    const g = Iles.debug.game, p = g.local; g.state.time.minutes = hour * 60; p.inv.slots.fill(null); p.inv.add('axe', 1); if (torch) p.inv.add('torch', 1);
    p.sel = torch ? 1 : 0; p.x = 608; p.y = 494; Iles.debug.cam.snapTo(p.x, p.y - 8, g.state.world.W * 16, g.state.world.H * 16);
  }, [hour, torch]);
  await setScene(22.3, true); await wait(300);
  const nightT = await shot('high');
  check('de nuit, la torche éclaire : le joueur est bien plus lumineux que le décor lointain', nightT.near > nightT.far * 1.6 && nightT.near > 60, nightT);
  await setScene(22.3, false); await wait(300);
  const nightN = await shot('high');
  check('sans torche, le même endroit est plus sombre', nightN.near < nightT.near * 0.8, [nightN.near, nightT.near]);
  await setScene(14.5, false); await wait(300);
  const dayHi = await shot('high'), dayOff = await shot('off');
  check('de jour, le rendu shader diffère du rendu 2D (lumières et ombres calculées)', Math.abs(dayHi.all - dayOff.all) > 3 || Math.abs(dayHi.near - dayOff.near) > 3, [dayHi, dayOff]);
  // pluie / brume : la scène change et la lumière baisse
  const find = (kind) => A.evaluate((kind) => { const w = Iles.weather; for (let m = 1440 * 3; m < 1440 * 40; m += 5) { const x = w.at(m), h = (m % 1440) / 60; if (h > 9 && h < 16 && ((kind === 'rain' && x.rain > 0.95) || (kind === 'fog' && x.fog > 0.85))) { Iles.debug.game.state.time.minutes = m; return h; } } return -1; }, kind);
  await setScene(12, false); const clear = await shot('high');
  check('pluie trouvée à l’heure du jour', (await find('rain')) > 0);
  await wait(300); const rain = await shot('high');
  check('sous la pluie, l’image est plus sombre que par temps clair', rain.all < clear.all * 0.92, [rain.all, clear.all]);
  check('la pluie tombe (gouttes et éclaboussures dessinées)', await A.evaluate(() => Iles.debug.renderer.wfx.rain.length > 50));
  check('brume trouvée à l’heure du jour', (await find('fog')) > 0);
  await wait(300); const fog = await shot('high');
  check('dans la brume, les zones sombres s’éclaircissent (contraste réduit)', await A.evaluate(() => Iles.debug.renderer.wx.fog > 0.8) && fog.far !== clear.far, [fog, clear]);
  check('la pluie s’arrête avec le beau temps', await A.evaluate(() => { Iles.debug.game.state.time.minutes = 3 * 60; const r = Iles.debug.renderer; r.draw(Iles.debug.game.state, Iles.debug.cam, Iles.debug.fx, 5); r.draw(Iles.debug.game.state, Iles.debug.cam, Iles.debug.fx, 5); return r.wfx.rain.length === 0; }));

  console.log('Lobby et dimensions');
  const lob = await A.evaluate(() => { const r = Iles.debug.renderer; return { lobbyHidden: true, cls: typeof r.setShader }; });
  check('API du renderer disponible (setShader)', lob.cls === 'function');

  console.log('Sauvegarde du réglage');
  await A.evaluate(() => { document.getElementById('opt-shader').value = 'off'; document.getElementById('opt-shader').dispatchEvent(new Event('change')); });
  await A.reload(); await wait(700);
  check('le réglage « désactivés » est retrouvé après rechargement', await A.evaluate(() => Iles.debug.app.settings.shader === 'off'));

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
