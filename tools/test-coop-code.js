/*
 * Test de la coop par code court (PeerJS). Nécessite un PeerServer local (le bac à sable n'atteint pas le service public) :
 *   node server.js (npm i peer ; PeerServer({port:9000, host:'127.0.0.1', path:'/'}))   puis   node tools/test-coop-code.js
 * Variables : PLAYWRIGHT_PATH, CHROMIUM, BROKER_PORT (9000). Sans BROKER_PORT=public : le test utilise le serveur local.
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const PORT = +(process.env.BROKER_PORT || 9000);
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-3d-apis'] });
  const errors = [];
  const opts = { host: '127.0.0.1', port: PORT, path: '/', secure: false };
  async function open(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g|stun|ICE/i.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.waitForTimeout(400);
    await page.evaluate((o) => { Iles.Net.peerOptions = o; }, opts);
    return page;
  }
  const until = (page, fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 15000 }).then(() => true).catch(() => false);
  const A = await open('A'), B = await open('B');
  const wait = ms => A.waitForTimeout(ms);
  const txt = (page, sel) => page.textContent(sel);

  console.log('Création du code (hôte)');
  await A.click('#btn-new'); await wait(400);
  await A.keyboard.press('Escape'); await wait(150);
  await A.click('#btn-coop');
  check('l’hôte obtient un code de 5 caractères', await until(A, () => /^[A-HJ-KM-NP-Z2-9]{5}$/.test(document.getElementById('coop-code').textContent)), null);
  const code = await txt(A, '#coop-code');
  console.log('   code : ' + code + ' (longueur ' + code.length + ', contre ~700 pour l’ancien système)');
  check('hôte : rôle host dès l’ouverture, même sans invité', await A.evaluate(() => Iles.Net.role === 'host' && Iles.Net.hosting() && Iles.Net.connected().length === 0));
  check('l’écran indique l’attente d’un joueur', /attente/i.test(await txt(A, '#coop-status')));

  console.log('Codes invalides');
  await B.click('#btn-join');
  await B.fill('#coop-code-in', 'AB'); await B.click('#coop-room-btn');
  check('code trop court : message clair', await until(B, () => /5 caract/.test(document.getElementById('coop-status').textContent), null, 3000), await txt(B, '#coop-status'));
  await B.fill('#coop-code-in', 'ZZZZZ'); await B.click('#coop-room-btn');
  check('code inconnu : « Aucune partie avec ce code »', await until(B, () => /Aucune partie/.test(document.getElementById('coop-status').textContent), null, 10000), await txt(B, '#coop-status'));
  check('après l’échec, B reste solo et peut réessayer', await B.evaluate(() => Iles.Net.role === 'solo' && !document.getElementById('coop-room-btn').disabled));

  console.log('Rejoindre avec le bon code (minuscules + espace tolérés)');
  await B.fill('#coop-code-in', ' ' + code.toLowerCase() + ' '); await B.click('#coop-room-btn');
  check('l’invité entre dans la partie', await until(B, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000), await txt(B, '#coop-status'));
  check('l’hôte voit 1 invité', await until(A, () => Iles.Net.connected().length === 1), null);
  const ids = await B.evaluate(() => ({ me: Iles.debug.game.localId, ps: Object.keys(Iles.debug.game.state.players), role: Iles.Net.role }));
  check('invité : identifiant p2, voit p1 et p2', ids.me === 'p2' && ids.ps.includes('p1') && ids.role === 'guest', ids);
  check('l’hôte voit « Connectés : 1 »', /Connect/.test(await txt(A, '#coop-status')), await txt(A, '#coop-status'));
  await A.keyboard.press('Escape'); await wait(300); await A.keyboard.press('Escape'); await wait(300);

  console.log('Synchronisation');
  const pos = (page, id) => page.evaluate((id) => { const p = Iles.debug.game.state.players[id]; return p && { x: p.x, y: p.y }; }, id);
  const b0 = await pos(B, 'p2');
  await B.keyboard.down('KeyD'); await wait(1000); await B.keyboard.up('KeyD'); await wait(400);
  const b1 = await pos(B, 'p2'), a1 = await pos(A, 'p2');
  check('l’invité avance (' + Math.round(b1.x - b0.x) + ' px)', b1.x - b0.x > 20, [b0, b1]);
  check('l’hôte voit l’invité à la même place', Math.abs(a1.x - b1.x) < 6 && Math.abs(a1.y - b1.y) < 6, [a1, b1]);
  const h0 = await pos(A, 'p1');
  await A.keyboard.down('KeyS'); await wait(900); await A.keyboard.up('KeyS'); await wait(400);
  const h1 = await pos(A, 'p1'), hb = await pos(B, 'p1');
  check('l’invité voit l’hôte bouger', h1.y - h0.y > 15 && Math.abs(hb.y - h1.y) < 6, [h0, h1, hb]);
  await A.evaluate(() => Iles.debug.game.state.players.p2.inv.add('wood', 6));
  check('l’inventaire de l’invité se met à jour', await until(B, () => Iles.debug.game.local.inv.count('wood') === 6), null, 4000);

  console.log('Partie pleine (4 joueurs max)');
  const C = await open('C'), D = await open('D'), E = await open('E');
  for (const [P, n] of [[C, 'C'], [D, 'D']]) {
    await P.click('#btn-join'); await P.fill('#coop-code-in', code); await P.click('#coop-room-btn');
    check(n + ' entre dans la partie', await until(P, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000));
  }
  check('l’hôte voit 3 invités', await until(A, () => Iles.Net.connected().length === 3), null);
  await E.click('#btn-join'); await E.fill('#coop-code-in', code); await E.click('#coop-room-btn');
  await E.waitForTimeout(2500);
  check('le 5e joueur est refusé (partie pleine) et reste hors partie', await E.evaluate(() => Iles.Net.role === 'solo' && Iles.Menu.screen !== 'playing'), await E.evaluate(() => [Iles.Net.role, Iles.Menu.screen]));
  check('le message « Partie pleine » s’affiche sur le menu', /pleine/i.test(await txt(E, '#title-note')), await txt(E, '#title-note'));
  check('l’hôte a toujours 3 invités', await A.evaluate(() => Iles.Net.connected().length === 3));

  console.log('Départ et retour d’un invité');
  await D.evaluate(() => Iles.Net.close()); await wait(1500);
  check('l’hôte voit 2 invités après le départ de D', await A.evaluate(() => Iles.Net.connected().length === 2));
  check('l’hôte reste « host » et le code reste valable', await A.evaluate(() => Iles.Net.role === 'host' && !!Iles.Net.room));
  await E.click('#btn-join'); await E.fill('#coop-code-in', code); await E.click('#coop-room-btn');
  check('un nouvel invité (E) prend la place libérée', await until(E, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000));

  console.log('Fermeture');
  await B.evaluate(() => Iles.Net.close()); await C.evaluate(() => Iles.Net.close()); await E.evaluate(() => Iles.Net.close()); await wait(1500);
  check('plus aucun invité chez l’hôte, code toujours ouvert', await A.evaluate(() => Iles.Net.connected().length === 0 && Iles.Net.role === 'host'));
  await A.evaluate(() => Iles.Net.close()); await wait(500);
  check('l’hôte ferme la coop : retour solo, code libéré', await A.evaluate(() => Iles.Net.role === 'solo' && !Iles.Net.room));
  const B2 = await open('B2');
  await B2.click('#btn-join'); await B2.fill('#coop-code-in', code); await B2.click('#coop-room-btn');
  check('le code d’une partie fermée ne marche plus', await until(B2, () => /Aucune partie/.test(document.getElementById('coop-status').textContent), null, 10000));

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
