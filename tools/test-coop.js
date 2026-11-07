/*
 * Test de la coop locale : deux navigateurs indépendants (hôte + invité), échange réel des codes par l'interface,
 * déplacements, inventaire, artisanat, construction, coffre, déconnexion / reconnexion.
 *   node tools/test-coop.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  // sans mDNS, les candidats ICE locaux sont de vraies adresses : la connexion locale marche aussi dans un bac à sable
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-3d-apis'] });
  const errors = [];
  async function open(ctx, tag) {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g|stun|ICE|0\.peerjs\.com|tunnel via proxy|0\.peerjs\.com/i.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.waitForTimeout(400);
    return page;
  }
  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const A = await open(ctxA, 'A'), B = await open(ctxB, 'B');
  const wait = ms => A.waitForTimeout(ms);
  const until = (page, fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 15000 }).then(() => true).catch(() => false);

  console.log('Connexion (échange réel des codes)');
  await A.click('#btn-new'); await wait(400);
  await A.keyboard.press('Escape'); await wait(150);
  await A.click('#btn-coop'); await A.evaluate(() => { document.getElementById('coop-manual-h').open = true; }); await A.click('#coop-gen');
  check('l’hôte obtient un code d’invitation', await until(A, () => document.getElementById('coop-offer').value.startsWith('IL1')), null);
  const offer = await A.inputValue('#coop-offer');
  console.log('   longueur du code d’invitation : ' + offer.length);
  await B.click('#btn-join'); await B.evaluate(() => { document.getElementById('coop-manual-j').open = true; }); await B.fill('#coop-offer-in', offer); await B.click('#coop-join-btn');
  check('l’invité obtient un code de réponse', await until(B, () => document.getElementById('coop-answer-out').value.startsWith('IL1')), null);
  const answer = await B.inputValue('#coop-answer-out');
  console.log('   longueur du code de réponse : ' + answer.length);
  await A.fill('#coop-answer', answer); await A.click('#coop-accept');
  const cands = (page) => page.evaluate(() => { const g = Iles.Net.pending[0] || Iles.Net.guests[0] || Iles.Net._host; return g.pc.localDescription.sdp.split('\n').filter(l => /candidate/.test(l)).join(' | ') + ' || remote: ' + (g.pc.remoteDescription ? g.pc.remoteDescription.sdp.split('\n').filter(l => /candidate/.test(l)).join(' | ') : ''); });
  global.cands = cands;
  const rtc = async (tag) => console.log('   rtc ' + tag, JSON.stringify(await A.evaluate(() => { const g = Iles.Net.pending[0] || Iles.Net.guests[0]; return g && [g.pc.connectionState, g.pc.iceConnectionState, g.dc.readyState, g.ready]; })), JSON.stringify(await B.evaluate(() => { const g = Iles.Net._host; return g && [g.pc.connectionState, g.pc.iceConnectionState, g.dc && g.dc.readyState, g.welcomed]; })));
  await until(B, () => Iles.Menu.screen === 'playing', null, 20000) || await rtc('1');
  check('l’invité entre dans la partie', await until(B, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local), null, 20000);
  check('l’hôte voit 1 invité connecté', await until(A, () => Iles.Net.connected().length === 1), null);
  const ids = await B.evaluate(() => ({ me: Iles.debug.game.localId, ps: Object.keys(Iles.debug.game.state.players), role: Iles.Net.role }));
  check('invité : identifiant p2, voit p1 et p2', ids.me === 'p2' && ids.ps.includes('p1') && ids.ps.includes('p2') && ids.role === 'guest', ids);
  check('hôte resté sur l’écran pause : la partie tourne quand même', await A.evaluate(() => Iles.Net.hosting() && Iles.Menu.screen !== 'playing'));
  await A.keyboard.press('Escape'); await wait(300); // coop -> pause
  await A.keyboard.press('Escape'); await wait(300); // pause -> jeu

  console.log('Déplacements et synchronisation');
  const pos = (page, id) => page.evaluate((id) => { const p = Iles.debug.game.state.players[id]; return p && { x: p.x, y: p.y }; }, id);
  const b0 = await pos(B, 'p2');
  await B.keyboard.down('KeyD'); await wait(1000); await B.keyboard.up('KeyD'); await wait(400);
  const b1 = await pos(B, 'p2'), a1 = await pos(A, 'p2');
  check('l’invité avance (' + Math.round(b1.x - b0.x) + ' px)', b1.x - b0.x > 20, [b0, b1]);
  check('l’hôte voit l’invité à la même place (écart ' + Math.abs(a1.x - b1.x).toFixed(1) + ')', Math.abs(a1.x - b1.x) < 6 && Math.abs(a1.y - b1.y) < 6, [a1, b1]);
  const h0 = await pos(A, 'p1');
  await A.keyboard.down('KeyS'); await wait(900); await A.keyboard.up('KeyS'); await wait(400);
  const h1 = await pos(A, 'p1'), hb = await pos(B, 'p1');
  check('l’invité voit l’hôte bouger', h1.y - h0.y > 15 && Math.abs(hb.y - h1.y) < 6, [h0, h1, hb]);
  const t = await Promise.all([A, B].map(p => p.evaluate(() => Iles.debug.game.state.time.minutes)));
  check('même heure du jour (écart ' + Math.abs(t[0] - t[1]).toFixed(1) + ' min)', Math.abs(t[0] - t[1]) < 8, t);

  console.log('Inventaire, artisanat, construction (commandes exécutées par l’hôte)');
  await A.evaluate(() => { const p = Iles.debug.game.state.players.p2; p.inv.add('wood', 6); p.inv.add('chest', 1); });
  check('l’inventaire de l’invité se met à jour (bois ×6)', await until(B, () => Iles.debug.game.local.inv.count('wood') === 6), null, 4000);
  await B.keyboard.press('KeyC'); await wait(300);
  await B.evaluate(() => Iles.CraftingUI.select('plank')); await B.click('#craft-do'); await wait(500);
  const pl = await Promise.all([B, A].map(p => p.evaluate(() => { const q = Iles.debug.game.state.players.p2; return [q.inv.count('wood'), q.inv.count('plank')]; })));
  check('fabriquer une planche : 1 bois → 2 planches, chez l’invité ET chez l’hôte', pl[0][0] === 5 && pl[0][1] === 2 && pl[1][0] === 5 && pl[1][1] === 2, pl);
  await B.keyboard.press('Escape'); await wait(200);
  // poser le coffre à la souris
  const slot = await B.evaluate(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'chest'));
  if (slot >= 0 && slot < 8) { await B.keyboard.press('Digit' + (slot + 1)); } else { await B.evaluate((s) => Iles.debug.app.game.local.inv.move(s, 7), slot); }
  await wait(400);
  const tile = await B.evaluate(() => {
    const g = Iles.debug.game, p = g.local, B_ = Iles.building;
    for (let d = 1; d < 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const tx = Math.floor(p.x / 16) + dx, ty = Math.floor(p.y / 16) + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) === d && B_.check(g.state, p, 'chest', tx, ty).ok) return [tx, ty];
    }
    return null;
  });
  const sp = await B.evaluate((t) => { const c = Iles.debug.cam, s = Iles.debug.renderer.scale; return { x: (t[0] * 16 + 8 - c.rx) * s, y: (t[1] * 16 + 8 - c.ry) * s }; }, tile);
  await B.mouse.move(sp.x, sp.y); await wait(300);
  check('aperçu de pose visible chez l’invité', await B.evaluate(() => { const b = Iles.debug.game.local.build; return !!b && b.ok; }));
  await B.mouse.click(sp.x, sp.y); await wait(600);
  const placed = await Promise.all([A, B].map(p => p.evaluate((t) => !!Iles.debug.game.state.world.structureAt(t[0], t[1]), tile)));
  check('le coffre posé par l’invité existe chez l’hôte et chez l’invité', placed[0] && placed[1], placed);
  await B.screenshot({ path: path.join(OUT, '40-coop-guest.png') });
  // ouvrir le coffre (E) et y déposer du bois
  await A.evaluate((t) => { const p = Iles.debug.game.state.players.p2, o = Iles.debug.game.state.world.structureAt(t[0], t[1]); p.x = o.x; p.y = o.y + 9; p.dir = 'up'; }, tile);
  await wait(500);
  await B.keyboard.press('KeyE'); await wait(600);
  check('E ouvre le coffre chez l’invité', await B.evaluate(() => Iles.Menu.screen === 'container'));
  const wi = await B.evaluate(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'wood'));
  await B.click('#cont-inv .slot[data-i="' + wi + '"]'); await wait(600);
  const inChest = await A.evaluate((t) => { const o = Iles.debug.game.state.world.structureAt(t[0], t[1]); return o.data.inv.slots.reduce((a, s) => a + (s && s.id === 'wood' ? s.qty : 0), 0); }, tile);
  check('le bois déposé arrive dans le coffre de l’hôte (' + inChest + ')', inChest === 5, inChest);
  check('…et le coffre affiché chez l’invité le montre', await until(B, () => !!document.querySelector('#cont-body .slot img'), null, 3000));
  await B.keyboard.press('Escape'); await wait(200);
  await A.screenshot({ path: path.join(OUT, '41-coop-host.png') });

  await A.evaluate(() => Iles.debug.game.state.players.p2.inv.add('plank~yellow', 3)); await wait(700);
  const cr = await B.evaluate(() => new Promise(res => Iles.Net.command({ t: 'craft', id: 'floor_wood', station: 'hand', c: 3 }, res)));
  await wait(700);
  const cols = await Promise.all([A.evaluate(() => Iles.debug.game.state.players.p2.inv.count('floor_wood~yellow')), B.evaluate(() => Iles.debug.game.local.inv.count('floor_wood~yellow'))]);
  check('l’invité fabrique avec des matériaux jaunes (commande exécutée par l’hôte) : plancher jaune, vu des deux côtés', cr.ok && cols[0] === 2 && cols[1] === 2, [cr, cols]);

  // Table du Forgeron : l'invité fabrique une arme, validée par l'hôte (distance, matériaux, sac)
  await A.evaluate(() => { const g = Iles.debug.game, p = g.state.players.p2, o = g.state.world.addStructure('forge_table', Math.floor(p.x / 16) + 3, Math.floor(p.y / 16), null); window.__ft = o.id; p.x = o.x; p.y = o.y + 9; p.inv.add('stick', 2); p.inv.add('iron_bar~blue', 1); p.inv.add('flower_red', 1); });
  await wait(900);
  const ftId = await A.evaluate(() => window.__ft);
  const fbad = await B.evaluate((id) => new Promise(res => Iles.Net.command({ t: 'forge', id: id, model: 'spear', slots: ['stick', 'flower_red', 'iron_bar~blue'] }, res)), ftId);
  const fok = await B.evaluate((id) => new Promise(res => Iles.Net.command({ t: 'forge', id: id, model: 'spear', slots: ['stick', 'stick', 'iron_bar~blue'] }, res)), ftId);
  await wait(800);
  const fres = await Promise.all([A.evaluate(() => Iles.debug.game.state.players.p2.inv.count('wp:spear:stick,stick,iron_bar~blue')), B.evaluate(() => [Iles.debug.game.local.inv.count('wp:spear:stick,stick,iron_bar~blue'), Iles.debug.game.local.inv.count('stick'), Iles.debug.game.local.inv.count('flower_red'), Iles.ITEMS['wp:spear:stick,stick,iron_bar~blue'] && Iles.ITEMS['wp:spear:stick,stick,iron_bar~blue'].name])]);
  check('coop : l’invité fabrique une lance de fer bleu à la table de l’hôte ; objet incompatible refusé ; l’arme apparaît des deux côtés', !fbad.ok && fbad.reason === 'incompatible' && fok.ok && fres[0] === 1 && fres[1][0] === 1 && fres[1][1] === 0 && fres[1][2] === 1 && fres[1][3] === 'Lance en fer bleu', [fbad, fok, fres]);

  console.log('Lobby spatial en coop : le portail emmène tout le monde, le bouton rouge est partagé');
  const dimOf = (page) => page.evaluate(() => ({ dim: Iles.debug.game.state.dim, lobby: Iles.debug.game.state.world.lobby, blocked: Object.values(Iles.debug.game.state.players).some(p => Iles.collision.isBlocked(Iles.debug.game.state.world, p)) }));
  await A.evaluate(() => { const g = Iles.debug.game, o = g.state.world.byId.get('portal'), p = g.local; p.x = o.x; p.y = o.y + 14; });
  await wait(400); await A.keyboard.press('KeyE');
  check('l’hôte prend le portail : l’invité arrive aussi dans le lobby', await until(B, () => Iles.debug.game.state.dim === 'lobby' && Iles.debug.game.state.world.lobby, null, 8000) && await until(A, () => Iles.debug.game.state.dim === 'lobby', null, 8000));
  await wait(800);
  const dl = await Promise.all([dimOf(A), dimOf(B)]);
  check('personne n’est coincé dans un obstacle (hôte et invité)', !dl[0].blocked && !dl[1].blocked, dl);
  await A.evaluate(() => { const g = Iles.debug.game, o = g.state.world.byId.get('red_button1'), p = g.state.players.p2; p.x = o.x; p.y = o.y + 12; });
  await wait(700); await B.keyboard.press('KeyE');
  check('l’invité appuie sur le bouton : le portail s’éveille chez l’hôte ET chez l’invité', await until(A, () => !!Iles.debug.game.state.act, null, 5000) && await until(B, () => !!Iles.debug.game.state.act, null, 5000));
  await wait(2500); await B.screenshot({ path: path.join(OUT, '85-coop-lobby-guest.png') });
  check('fin de l’éveil : hôte ET invité sont téléportés dans la même dimension générée', await until(A, () => /^d:\d+$/.test(Iles.debug.game.state.dim) && Iles.debug.game.state.world.chunked, null, 14000) && await until(B, () => Iles.debug.game.state.dim === Iles.debug.game.state.dim && /^d:\d+$/.test(Iles.debug.game.state.dim) && Iles.debug.game.state.world.chunked && Iles.debug.game.state.world.chunks.size >= 9, null, 14000));
  const same = await Promise.all([A, B].map(pg => pg.evaluate(() => Iles.debug.game.state.dim)));
  check('même dimension des deux côtés (même graine, donc même monde)', same[0] === same[1], same);
  await wait(1200); await B.screenshot({ path: path.join(OUT, '86-coop-dimension-guest.png') });
  const dd = await Promise.all([dimOf(A), dimOf(B)]);
  check('personne n’est coincé dans la dimension', !dd[0].blocked && !dd[1].blocked, dd);
  const sw = await A.evaluate(() => { const g = Iles.debug.game, w = g.state.world, o = w.byId.get('dimportal'), p = g.state.players.p2; p.x = o.x + 60; p.y = o.y + 30; return Object.keys(g.state.players).length; });
  await wait(600);
  const gp = await Promise.all([A, B].map(pg => pg.evaluate(() => { const p = Iles.debug.game.state.players.p2; return [Math.round(p.x), Math.round(p.y)]; })));
  check('les positions du joueur 2 concordent dans la dimension (hôte / invité)', Math.abs(gp[0][0] - gp[1][0]) < 6 && Math.abs(gp[0][1] - gp[1][1]) < 6, gp);
  // créatures : l'hôte les simule, l'invité les reçoit (même espèces, positions proches), rien d'inventé côté invité
  await A.evaluate(() => { const g = Iles.debug.game, w = g.state.world, p = g.state.players.p2; let best = null, bn = 0; for (const c of w.creatures || []) { const n = w.creatures.filter(o => o.herd === c.herd).length; if (n > bn) { bn = n; best = c; } } if (best) { p.x = best.herd.x - 60; p.y = best.herd.y; } });
  await wait(1800);
  const crs = await Promise.all([A, B].map(pg => pg.evaluate(() => { const w = Iles.debug.game.state.world; return (w.creatures || []).map(c => [c.id, c.sp, Math.round(c.x), Math.round(c.y)]); })));
  const hostBy = {}; crs[0].forEach(c => { hostBy[c[0]] = c; });
  const okIds = crs[1].length > 0 && crs[1].every(c => hostBy[c[0]] && hostBy[c[0]][1] === c[1] && Math.hypot(hostBy[c[0]][2] - c[2], hostBy[c[0]][3] - c[3]) < 24);
  check('coop : l’invité voit les créatures de l’hôte (' + crs[1].length + ' reçues), mêmes espèces et positions proches', okIds, [crs[0].length, crs[1].length]);
  check('coop : l’invité ne génère pas lui-même de troupeaux (aucune donnée de troupeau côté invité)', await B.evaluate(() => (Iles.debug.game.state.world.creatures || []).every(c => !c.herd)));
  // combat : l'invité lance une capacité (intention R), l'hôte l'applique, l'invité voit la recharge et les effets
  await A.evaluate(() => { const g = Iles.debug.game, p = g.state.players.p2; p.inv.slots[2] = { id: Iles.forge.analyze('sword', ['stick', 'stick', 'iron_bar']).id, qty: 1 }; });
  await B.evaluate(() => { const I = Iles, p = I.debug.game.local; I.Net.guestTick(0.016, Object.assign({}, I.Game.NEUTRAL, { hotbar: 2, ab: 1, aim: { x: p.x + 60, y: p.y - 8 } })); });
  await wait(160);
  const cbk = await Promise.all([A, B].map(pg => pg.evaluate(() => { const p = Iles.debug.game.state.players.p2; return { cd: p.cb ? p.cb.cd[0] : -1, vis: Iles.debug.fx.vis.length + Iles.debug.fx.parts.length }; })));
  check('coop : l’invité lance « Taillade tournoyante » : l’hôte applique la capacité, l’invité voit sa recharge et les effets', cbk[0].cd > 0 && cbk[1].cd > 0 && cbk[1].vis > 0, cbk);
  await A.evaluate(() => { const g = Iles.debug.game, o = g.state.world.byId.get('dimportal'), p = g.state.players.p2; p.x = o.x; p.y = o.y + 18; });
  await wait(700); await B.keyboard.press('KeyE');
  check('l’invité prend le portail de retour : tout le monde est dans le lobby', await until(A, () => Iles.debug.game.state.dim === 'lobby', null, 8000) && await until(B, () => Iles.debug.game.state.dim === 'lobby' && Iles.debug.game.state.world.lobby, null, 8000));
  await wait(800);
  await A.evaluate(() => { const g = Iles.debug.game, o = g.state.world.byId.get('return_pad2'), p = g.state.players.p2; p.x = o.x; p.y = o.y + 2; });
  await wait(700); await B.keyboard.press('KeyE');
  check('l’invité prend le retour : tout le monde retrouve l’île', await until(A, () => Iles.debug.game.state.dim === 'home' && !Iles.debug.game.state.world.lobby, null, 8000) && await until(B, () => Iles.debug.game.state.dim === 'home' && !Iles.debug.game.state.world.lobby, null, 8000));
  await wait(900);
  const dh = await Promise.all([dimOf(A), dimOf(B)]);
  check('de retour sur l’île, sans être coincé', !dh[0].blocked && !dh[1].blocked, dh);
  await A.keyboard.press('Escape'); await wait(100); await A.keyboard.press('Escape'); await wait(200);

  console.log('Déconnexion et reconnexion (même inventaire)');
  const gkey = await B.evaluate(() => localStorage.getItem('iles:guestkey'));
  await B.close();
  check('l’hôte constate le départ (invité absent)', await until(A, () => Iles.Net.connected().length === 0 && Iles.debug.game.state.players.p2.away === true, null, 20000));
  const save = await A.evaluate(() => { Iles.debug.app.saveNow('manual'); const r = Iles.SaveManager.load(); return r.ok && r.data.players.p2 && r.data.players.p2.stats && !!r.data.players.p2.stats.key; });
  check('l’invité absent est conservé dans la sauvegarde de l’hôte', save);
  const ctxC = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  await ctxC.addInitScript((k) => { try { localStorage.setItem('iles:guestkey', k); } catch (e) { /* ignoré */ } }, gkey);
  const B2 = await open(ctxC, 'B2');
  await A.keyboard.press('Escape'); await wait(150);
  await A.click('#btn-coop'); await A.evaluate(() => { document.getElementById('coop-manual-h').open = true; }); await A.click('#coop-gen');
  await until(A, () => document.getElementById('coop-offer').value.startsWith('IL1'));
  const offer2 = await A.inputValue('#coop-offer');
  await B2.click('#btn-join'); await B2.evaluate(() => { document.getElementById('coop-manual-j').open = true; }); await B2.fill('#coop-offer-in', offer2); await B2.click('#coop-join-btn');
  await until(B2, () => document.getElementById('coop-answer-out').value.startsWith('IL1'));
  await A.fill('#coop-answer', await B2.inputValue('#coop-answer-out')); await A.click('#coop-accept');
  check('l’invité se reconnecte', await until(B2, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000));
  if (!(await B2.evaluate(() => Iles.Menu.screen === 'playing'))) console.log('   cands A', await cands(A), '\n   cands B2', await cands(B2));
  if (!(await B2.evaluate(() => Iles.Menu.screen === 'playing'))) console.log('   rtc', await A.evaluate(() => { const g = Iles.Net.pending[0]; return g && [g.pc.connectionState, g.pc.iceConnectionState, g.pc.iceGatheringState, g.dc.readyState, g.pc.localDescription.sdp.split('\n').filter(l => /candidate/.test(l)).length]; }), await B2.evaluate(() => { const g = Iles.Net._host; return g && [g.pc.connectionState, g.pc.iceConnectionState, g.dc && g.dc.readyState, g.pc.localDescription.sdp.split('\n').filter(l => /candidate/.test(l)).length]; }));
  if (0) console.log('   debug', await A.evaluate(() => [Iles.Net.role, Iles.Net.guests.length, Iles.Net.pending.length, document.getElementById('coop-status').textContent, document.getElementById('coop-offer').value.length]), await B2.evaluate(() => [Iles.Net.role, document.getElementById('coop-status').textContent, Iles.Menu.screen, document.getElementById('coop-answer-out').value.length]));
  const inv2 = await B2.evaluate(() => ({ me: Iles.debug.game.localId, plank: Iles.debug.game.local.inv.count('plank'), wood: Iles.debug.game.local.inv.count('wood') }));
  check('il retrouve son identité et son inventaire', inv2.me === 'p2' && inv2.plank === 2 && inv2.wood === 0, inv2);
  // quitter côté invité : retour au titre, sans toucher à la sauvegarde locale
  await B2.keyboard.press('Escape'); await B2.click('#btn-quit'); await wait(400);
  check('l’invité qui quitte revient au titre', await B2.evaluate(() => Iles.Menu.screen === 'title'));
  check('l’invité n’a rien sauvegardé chez lui', await B2.evaluate(() => !Iles.SaveManager.peek().ok));
  check('l’hôte est de nouveau seul', await until(A, () => Iles.Net.connected().length === 0, null, 20000));

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
