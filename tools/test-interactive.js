/*
 * Test « Interactive Update » : mini-map, grande carte (M), exploration sauvegardée, créateur d'avatar, avatars et positions en coop.
 *   node tools/test-interactive.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-3d-apis'] });
  const errors = [];
  async function open(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g|stun|ICE|peerjs|tunnel via proxy/i.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.waitForTimeout(400);
    return page;
  }
  const until = (page, fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 15000 }).then(() => true).catch(() => false);
  const A = await open('A'), B = await open('B');
  const wait = ms => A.waitForTimeout(ms);
  const known = (page) => page.evaluate(() => { const w = Iles.debug.game.state.world; let n = 0; for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (Iles.explore.known(w, x, y)) n++; return n; });

  console.log('Créateur d’avatar (avant la partie)');
  await A.click('#btn-options'); await A.click('#btn-avatar');
  check('l’écran avatar s’ouvre', await A.evaluate(() => Iles.Menu.screen === 'avatar'));
  await A.click('#av-rows .av-row[data-k="hc"] .av-sw button[data-i="6"]');   // cheveux bleus
  await A.click('#av-rows .av-row[data-k="tn"] .av-sw button[data-i="1"]');   // tunique rouge
  await A.click('#av-rows .av-row[data-k="hs"] .av-pick button[data-d="1"]'); // coiffure : longs
  await A.click('#av-rows .av-row[data-k="at"] .av-pick button[data-d="1"]'); // accessoire : bandeau
  const prev = await A.evaluate(() => { const c = document.getElementById('av-preview'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  check('l’aperçu est dessiné', prev > 500, prev);
  await A.click('#av-ok');
  const stA = await A.evaluate(() => JSON.parse(localStorage.getItem('iles-derivantes:settings')).avatar);
  check('les choix sont sauvegardés dans les réglages', stA.hc === 6 && stA.tn === 1 && stA.hs === 1 && stA.at === 1, stA);
  const keyA = await A.evaluate(() => Iles.avatar.key(Iles.avatar.sanitize(Iles.debug.app.settings.avatar)));
  const spr = await A.evaluate(() => { const S = Iles.debug.renderer.S, a = S.avatarSet(Iles.debug.app.settings.avatar), d = S.avatarSet(null); return a.down[0] !== d.down[0] && a.down[0].c.toDataURL() !== d.down[0].c.toDataURL(); });
  check('le sprite change vraiment selon l’avatar', spr);
  const bad = await A.evaluate(() => Iles.avatar.key(Iles.avatar.sanitize({ sk: 99, hc: -3, hs: 'x', tn: 1.5, pn: 2, ac: 3, at: 7 })));
  check('un avatar invalide est ramené à des valeurs valides', bad === '0,0,0,0,2,3,0', bad);

  console.log('Mini-map (solo)');
  await A.click('#btn-options-close'); await A.click('#btn-new'); await wait(500);
  check('le joueur porte l’avatar choisi', await A.evaluate((k) => Iles.avatar.key(Iles.debug.game.local.av) === k, keyA));
  check('la mini-map est visible au départ', await A.evaluate(() => !document.getElementById('minimap').classList.contains('hidden')));
  const k0 = await known(A);
  await A.keyboard.down('KeyD'); await wait(2500); await A.keyboard.up('KeyD'); await A.keyboard.down('KeyS'); await wait(2000); await A.keyboard.up('KeyS'); await wait(300);
  const k1 = await known(A);
  check('se déplacer explore de nouvelles cases (' + k0 + ' → ' + k1 + ')', k1 > k0 + 20, [k0, k1]);
  const px = await A.evaluate(() => { const c = document.getElementById('minimap-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const cols = new Set(); for (let i = 0; i < d.length; i += 4 * 37) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return cols.size; });
  check('la mini-map dessine le terrain (' + px + ' couleurs)', px > 4, px);
  check('la mini-map reste affichée (M ouvre la grande carte)', await A.evaluate(() => !document.getElementById('minimap').classList.contains('hidden')));
  await A.keyboard.press('KeyM'); await wait(400);
  const bm = await A.evaluate(() => { const B = Iles.BigMap, c = document.getElementById('map-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const cols = new Set(); for (let i = 0; i < d.length; i += 4 * 97) cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return { s: Iles.Menu.screen, vis: !document.getElementById('screen-map').classList.contains('hidden'), cols: cols.size, w: c.width, cx: B.cx, cy: B.cy, z: B.z(), me: [Iles.debug.game.local.x / 16, Iles.debug.game.local.y / 16] }; });
  check('M ouvre la grande carte plein écran, centrée sur le joueur, avec du terrain', bm.s === 'map' && bm.vis && bm.cols > 4 && bm.w === 1000 && Math.abs(bm.cx - bm.me[0]) < 0.5 && Math.abs(bm.cy - bm.me[1]) < 1, bm);
  await A.mouse.move(500, 300); await A.mouse.down(); await A.mouse.move(400, 250, { steps: 5 }); await A.mouse.up(); await wait(150);
  const pan = await A.evaluate(() => ({ cx: Iles.BigMap.cx, cy: Iles.BigMap.cy, z: Iles.BigMap.z() }));
  check('glisser à la souris déplace la carte (100 px = ' + (100 / pan.z).toFixed(1) + ' cases)', Math.abs((pan.cx - bm.cx) - 100 / pan.z) < 0.6 && Math.abs((pan.cy - bm.cy) - 50 / pan.z) < 0.6, [bm, pan]);
  await A.keyboard.down('KeyD'); await wait(500); await A.keyboard.up('KeyD'); await wait(100);
  check('D / flèches déplacent aussi la carte', await A.evaluate((x) => Iles.BigMap.cx > x + 5, pan.cx));
  await A.mouse.move(500, 300); await A.mouse.wheel(0, -120); await wait(150);
  const zi = await A.evaluate(() => Iles.BigMap.z());
  check('la molette zoome (×' + bm.z + ' → ×' + zi + ')', zi > bm.z, zi);
  await A.keyboard.press('Space'); await wait(150);
  check('Espace recentre sur le joueur', await A.evaluate(() => { const p = Iles.debug.game.local; return Math.abs(Iles.BigMap.cx - p.x / 16) < 0.5; }));
  const ring = await A.evaluate(() => { const c = document.getElementById('map-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) n++; return n; });
  check('le joueur est repérable sur la carte (anneau blanc)', ring > 30, ring);
  await A.keyboard.press('KeyM'); await wait(200);
  check('M referme la carte', await A.evaluate(() => Iles.Menu.screen === 'playing'));
  await A.keyboard.press('KeyM'); await wait(200); await A.keyboard.press('Escape'); await wait(200);
  check('Échap referme aussi la carte (sans ouvrir la pause)', await A.evaluate(() => Iles.Menu.screen === 'playing'));
  const pos0 = await A.evaluate(() => { const p = Iles.debug.game.local; return [p.x, p.y]; });

  console.log('Sauvegarde / rechargement');
  await A.evaluate(() => Iles.debug.app.saveNow('test'));
  await A.reload(); await wait(600);
  await A.click('#btn-continue'); await wait(600);
  const k2 = await known(A);
  check('les zones explorées sont conservées (' + k2 + ')', k2 === k1 || Math.abs(k2 - k1) < 30, [k1, k2]);
  check('l’avatar est conservé après rechargement', await A.evaluate((k) => Iles.avatar.key(Iles.debug.game.local.av) === k, keyA));

  console.log('Coop : avatars et mini-map à deux');
  await A.keyboard.press('Escape'); await wait(150);
  await A.click('#btn-coop'); await A.evaluate(() => { document.getElementById('coop-manual-h').open = true; }); await A.click('#coop-gen');
  await until(A, () => document.getElementById('coop-offer').value.startsWith('IL1'));
  const offer = await A.inputValue('#coop-offer');
  // B choisit un autre avatar avant de rejoindre
  await B.click('#btn-options'); await B.click('#btn-avatar');
  await B.click('#av-rows .av-row[data-k="sk"] .av-sw button[data-i="5"]'); await B.click('#av-rows .av-row[data-k="tn"] .av-sw button[data-i="5"]'); await B.click('#av-rows .av-row[data-k="hs"] .av-pick button[data-d="-1"]'); await B.click('#av-ok'); await B.click('#btn-options-close');
  const keyB = await B.evaluate(() => Iles.avatar.key(Iles.avatar.sanitize(Iles.debug.app.settings.avatar)));
  await B.click('#btn-join'); await B.evaluate(() => { document.getElementById('coop-manual-j').open = true; }); await B.fill('#coop-offer-in', offer); await B.click('#coop-join-btn');
  await until(B, () => document.getElementById('coop-answer-out').value.startsWith('IL1'));
  await A.fill('#coop-answer', await B.inputValue('#coop-answer-out')); await A.click('#coop-accept');
  check('l’invité entre dans la partie', await until(B, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000));
  await A.keyboard.press('Escape'); await wait(300); await A.keyboard.press('Escape'); await wait(300);
  const avs = await Promise.all([A, B].map(p => p.evaluate(() => { const o = {}; for (const id in Iles.debug.game.state.players) o[id] = Iles.avatar.key(Iles.debug.game.state.players[id].av); return o; })));
  check('l’hôte garde son avatar et voit celui de l’invité', avs[0].p1 === keyA && avs[0].p2 === keyB && keyA !== keyB, [avs[0], keyA, keyB]);
  check('l’invité garde son avatar et voit celui de l’hôte', avs[1].p2 === keyB && avs[1].p1 === keyA, [avs[1], keyA, keyB]);
  // changement d'avatar en pleine partie par l'invité
  await B.keyboard.press('Escape'); await wait(200); await B.click('#btn-pause-options'); await B.click('#btn-avatar');
  await B.click('#av-rows .av-row[data-k="pn"] .av-sw button[data-i="3"]'); await B.click('#av-ok');
  const keyB2 = await B.evaluate(() => Iles.avatar.key(Iles.avatar.sanitize(Iles.debug.app.settings.avatar)));
  check('un changement en cours de partie arrive chez l’hôte', await until(A, (k) => Iles.avatar.key(Iles.debug.game.state.players.p2.av) === k, keyB2, 4000));
  await B.click('#btn-options-close'); await B.click('#btn-resume'); await wait(200);
  // positions sur la mini-map : B avance, A voit B bouger sur sa carte
  await B.keyboard.down('KeyD'); await wait(1500); await B.keyboard.up('KeyD'); await wait(500);
  const exB = await B.evaluate(() => { const w = Iles.debug.game.state.world; const p = Iles.debug.game.state.players.p1; return Iles.explore.known(w, Math.floor(p.x / 16), Math.floor(p.y / 16)); });
  check('l’invité a aussi exploré (carte partagée avec l’hôte)', exB);
  const snap = await A.evaluate(() => { const g = Iles.debug.game; Iles.Minimap.acc = 1; Iles.Minimap.update(1); const c = document.getElementById('minimap-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ring = 0; const col = Iles.avatar.mapColor(g.state.players.p2.av), n = parseInt(col.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, Bl = n & 255; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - R) < 6 && Math.abs(d[i + 1] - G) < 6 && Math.abs(d[i + 2] - Bl) < 6) ring++; return ring; });
  check('l’hôte voit la marque de l’invité sur sa mini-map', snap > 6, snap);
  const snapB = await B.evaluate(() => { Iles.Minimap.acc = 1; Iles.Minimap.update(1); const c = document.getElementById('minimap-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ring = 0; const col = Iles.avatar.mapColor(Iles.debug.game.state.players.p1.av), n = parseInt(col.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, Bl = n & 255; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - R) < 6 && Math.abs(d[i + 1] - G) < 6 && Math.abs(d[i + 2] - Bl) < 6) ring++; return ring; });
  check('l’invité voit la marque de l’hôte sur sa mini-map', snapB > 6, snapB);
  const far = await A.evaluate(() => { const g = Iles.debug.game, q = g.state.players.p2, me = g.local; q.x = me.x + 700; Iles.Minimap.acc = 1; Iles.Minimap.update(1); const c = document.getElementById('minimap-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const n = parseInt(Iles.avatar.mapColor(q.av).slice(1), 16); let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - (n >> 16)) < 6 && Math.abs(d[i + 1] - ((n >> 8) & 255)) < 6 && Math.abs(d[i + 2] - (n & 255)) < 6) k++; return k; });
  check('un joueur très éloigné est signalé au bord de la carte', far > 3, far);
  await A.screenshot({ path: path.join(__dirname, 'shots', 'interactive-host.png') }).catch(() => {});

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
