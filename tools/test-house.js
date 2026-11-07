/*
 * Test « Building Update » : murs raccordés, portes, fenêtres, toits sur la forme réelle, murs transparents à l'intérieur,
 * démolition sans toit flottant, sauvegarde, coop. Utilise de vrais clics de souris pour la pose.
 *   node tools/test-house.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
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
  const A = await open('A');
  const wait = ms => A.waitForTimeout(ms);
  await A.click('#btn-new'); await wait(500);

  const inject = (page, withItems) => page.evaluate((withItems) => {
    const g = Iles.debug.game;
    window.T = {
      p: () => g.local, s: () => g.state, w: () => g.state.world,
      slot: (id) => g.local.inv.slots.findIndex(x => x && x.id === id),
      put: (id, x, y) => { const p = g.local; p.x = x * 16 + 8; p.y = (y + 2) * 16 + 4; const r = Iles.building.place(g.state, p, T.slot(id), x, y, []); return r.ok ? 'ok' : r.reason; },
      rm: (x, y) => { const p = g.local; p.x = x * 16 + 8; p.y = (y + 2) * 16 + 4; const r = Iles.building.remove(g.state, p, x, y, []); return r.ok ? 'ok' : r.reason; },
      clear: () => { for (const o of g.state.world.structures.slice()) if (o.def.wall || o.def.layer === 'roof') g.state.world.removeStructure(o); },
      rect: (x0, y0, x1, y1, id) => { const out = []; for (let x = x0; x <= x1; x++) { out.push(T.put(id, x, y0)); out.push(T.put(id, x, y1)); } for (let y = y0 + 1; y < y1; y++) { out.push(T.put(id, x0, y)); out.push(T.put(id, x1, y)); } return out; },
      count: (id) => g.local.inv.count(id),
      roofs: () => g.state.world.structures.filter(o => o.def.layer === 'roof').length,
    };
    const p = g.local; if (withItems) { p.inv.add('wall_wood', 60); p.inv.add('wall_stone', 10); p.inv.add('door', 4); p.inv.add('window', 6); p.inv.add('roof', 80); }
  }, withItems);
  await inject(A, true);

  console.log('Recettes et objets');
  const rec = await A.evaluate(() => ['door', 'window', 'roof', 'wall_wood'].map(id => { const r = Iles.crafting.BY_ID[id]; return r ? [id, r.station, r.out.qty] : null; }));
  check('porte, fenêtre, toit et mur sont fabricables à l’établi', rec.every(Boolean) && rec.every(r => r[1] === 'bench'), rec);
  check('la maison préconstruite a disparu de l’île', await A.evaluate(() => !Iles.debug.game.state.world.byId.has('house') && !Iles.OBJECTS.house));

  console.log('Pose avec la souris (vrai clic)');
  const clickTile = async (tx, ty) => {
    const pos = await A.evaluate(([tx, ty]) => { const c = Iles.debug.cam, sc = Iles.debug.renderer.scale; return [(tx * 16 + 8 - c.rx) * sc, (ty * 16 + 8 - c.ry) * sc]; }, [tx, ty]);
    await A.mouse.move(pos[0], pos[1]); await wait(60); await A.mouse.down(); await wait(120); await A.mouse.up(); await wait(150);
  };
  await A.evaluate(() => { const p = T.p(); p.x = 37 * 16 + 8; p.y = 30 * 16; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); p.sel = T.slot('wall_wood') < 8 ? T.slot('wall_wood') : 0; });
  const wslot = await A.evaluate(() => { const i = T.slot('wall_wood'); if (i >= 8) { Iles.debug.game.local.inv.move(i, 7); } return T.slot('wall_wood'); });
  await A.keyboard.press('Digit' + (wslot + 1)); await wait(200);
  const before = await A.evaluate(() => T.count('wall_wood'));
  await clickTile(36, 28); await clickTile(37, 28);
  const after = await A.evaluate(() => ({ n: T.count('wall_wood'), a: !!T.w().structureAt(36, 28), b: !!T.w().structureAt(37, 28), con: [!!Iles.house.wallAt(T.w(), 36, 28)] }));
  check('deux clics = deux murs posés', after.a && after.b && after.n === before - 2, after);
  await A.mouse.move(await A.evaluate(() => (36 * 16 + 8 - Iles.debug.cam.rx) * Iles.debug.renderer.scale), await A.evaluate(() => (28 * 16 + 8 - Iles.debug.cam.ry) * Iles.debug.renderer.scale));
  await A.mouse.down({ button: 'right' }); await wait(120); await A.mouse.up({ button: 'right' }); await wait(200);
  check('clic droit retire le mur et le rend', await A.evaluate((n) => !T.w().structureAt(36, 28) && T.count('wall_wood') === n + 1, before - 2));
  await A.evaluate(() => T.clear());

  console.log('Maison rectangulaire');
  const res = await A.evaluate(() => {
    const r = T.rect(34, 26, 40, 30, 'wall_wood'); r.push(T.put('door', 37, 30)); r.push(T.put('window', 35, 30)); r.push(T.put('window', 34, 28));
    return r;
  });
  check('tous les murs, la porte et les fenêtres sont acceptés', res.every(x => x === 'ok'), res);
  const pv = await A.evaluate(() => { const r = Iles.house.roofPreview(T.w(), 37, 28); return { ok: r.ok, n: r.n }; });
  check('la pièce fermée est détectée (35 tuiles à couvrir : 5×3 + 20 de murs)', pv.ok && pv.n === 35, pv);
  const roofRes = await A.evaluate(() => { const b = T.count('roof'), r = T.put('roof', 37, 28); return { r: r, used: b - T.count('roof'), roofs: T.roofs() }; });
  check('le toit consomme 1 objet par tuile et couvre toute l’empreinte', roofRes.r === 'ok' && roofRes.used === 35 && roofRes.roofs === 35, roofRes);
  const cover = await A.evaluate(() => { let miss = 0; for (let y = 26; y <= 30; y++) for (let x = 34; x <= 40; x++) if (!T.w().roofAt(x, y)) miss++; return miss; });
  check('aucune case de la maison n’est sans toit', cover === 0, cover);
  check('un deuxième toit est refusé (déjà couvert)', await A.evaluate(() => T.put('roof', 37, 28)) === 'roofDone');
  check('le toit ne flotte pas : chaque tuile est sur un mur ou dans la pièce', await A.evaluate(() => T.w().structures.filter(o => o.def.layer === 'roof').every(o => (o.tx >= 34 && o.tx <= 40 && o.ty >= 26 && o.ty <= 30))));

  console.log('Porte, fenêtre, collisions');
  const col = await A.evaluate(() => {
    const w = T.w(), q = { x: 0, y: 0, hw: 4, hh: 3 };
    const blocked = (tx, ty) => { q.x = tx * 16 + 8; q.y = ty * 16 + 12; return Iles.collision.isBlocked(w, q); };
    return { wall: blocked(36, 30), door: blocked(37, 30), window: blocked(35, 30), inside: blocked(37, 28) };
  });
  check('le mur et la fenêtre bloquent, la porte laisse passer', col.wall && col.window && !col.door && !col.inside, col);
  // le joueur traverse vraiment la porte en marchant
  await A.evaluate(() => { const p = T.p(); p.x = 37 * 16 + 8; p.y = 33 * 16; p.dir = 'up'; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); });
  await A.keyboard.press('Escape'); await wait(100); await A.keyboard.press('Escape'); await wait(200);
  await A.keyboard.down('KeyW'); await wait(1600); await A.keyboard.up('KeyW'); await wait(200);
  const walked = await A.evaluate(() => { const p = T.p(); return { x: p.x, y: p.y, ty: Math.floor((p.y - 1) / 16) }; });
  check('on entre dans la maison en marchant par la porte (y = ' + Math.round(walked.y) + ')', walked.ty <= 29 && Math.abs(walked.x - (37 * 16 + 8)) < 8, walked);
  check('la pièce où se trouve le joueur est reconnue', await A.evaluate(() => !!Iles.house.roomOf(T.w(), T.p())));

  console.log('Murs transparents à l’intérieur');
  await A.evaluate(() => { const p = T.p(); p.x = 37 * 16 + 8; p.y = 28 * 16 + 8; });
  await wait(1500);
  const fade = await A.evaluate(() => {
    const w = T.w(), A = (tx, ty) => { const o = w.structureAt(tx, ty); return o ? +(o.fa === undefined ? 1 : o.fa).toFixed(2) : null; };
    return { south: A(36, 30), southWin: A(35, 30), north: A(36, 26), west: A(34, 27), roof: w.roofAt(37, 28).fa };
  });
  check('à l’intérieur : les murs du devant deviennent transparents', fade.south < 0.3 && fade.southWin < 0.3, fade);
  check('le mur du fond reste opaque', fade.north === 1, fade);
  check('le toit disparaît quand on est dedans', fade.roof < 0.05, fade);
  const still = await A.evaluate(() => ({ structs: T.w().structures.length, roofs: T.roofs() }));
  check('rien n’est supprimé : seuls l’affichage change', still.roofs === 35 && still.structs >= 55, still);
  await A.evaluate(() => { const p = T.p(); p.x = 37 * 16 + 8; p.y = 34 * 16; });
  await wait(1500);
  const back = await A.evaluate(() => { const w = T.w(); return { south: w.structureAt(36, 30).fa, roof: w.roofAt(37, 28).fa }; });
  check('dehors : murs et toit redeviennent visibles', back.south === 1 && back.roof === 1, back);
  await A.screenshot({ path: path.join(__dirname, 'shots', 'house-outside.png') }).catch(() => {});

  console.log('Modifier : remplacer un mur, forme en L');
  const rep = await A.evaluate(() => { const b = T.count('wall_wood'), r = T.put('window', 38, 30); return { r: r, type: T.w().structureAt(38, 30).type, back: T.count('wall_wood') - b, enclosed: Iles.house.roofPreview(T.w(), 37, 28).ok === false && !!T.w().roofAt(37, 28), roofs: T.roofs() }; });
  check('une fenêtre remplace un mur (mur rendu), le toit reste', rep.r === 'ok' && rep.type === 'window' && rep.back === 1 && rep.roofs === 35, rep);
  await A.evaluate(() => T.clear());
  // forme en L : 2 pièces carrées reliées (pas rectangulaire)
  const L = await A.evaluate(() => {
    const p = T.p(); p.inv.add('wall_wood', 30);
    const pts = [];
    for (let x = 34; x <= 40; x++) pts.push([x, 26]);       // haut
    for (let y = 26; y <= 30; y++) pts.push([34, y]);       // gauche
    for (let x = 34; x <= 37; x++) pts.push([x, 30]);       // bas (côté court)
    for (let y = 26; y <= 28; y++) pts.push([40, y]);       // droite (côté court)
    pts.push([38, 28], [39, 28], [37, 29], [37, 30]);        // redans du L
    const seen = new Set(), out = pts.filter(t => !seen.has(t + '') && seen.add(t + '')).map(t => T.put('wall_wood', t[0], t[1]));
    return out;
  });
  check('le L est construit (' + L.length + ' murs)', L.every(x => x === 'ok'), L);
  const Lr = await A.evaluate(() => {
    const w = T.w(); const r = Iles.house.roofPreview(w, 35, 27);
    // contrôle indépendant : remplissage depuis (35,27) sans traverser de mur
    const seen = new Set(), q = [[35, 27]]; let escaped = false;
    while (q.length) { const [x, y] = q.pop(); const k = x + ',' + y; if (seen.has(k)) continue; seen.add(k); if (seen.size > 300) { escaped = true; break; } for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + d[0], ny = y + d[1]; if (!w.structureAt(nx, ny)) q.push([nx, ny]); } }
    let expect = 0; const fp = new Set();
    for (const k of seen) { const [x, y] = k.split(',').map(Number); fp.add(k); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.structureAt(x + dx, y + dy)) fp.add((x + dx) + ',' + (y + dy)); }
    return { ok: r.ok, n: r.n, interior: seen.size, expect: fp.size, escaped: escaped };
  });
  check('pièce en L fermée : l’empreinte du toit = intérieur + murs qui la bordent (' + Lr.n + ')', Lr.ok && !Lr.escaped && Lr.n === Lr.expect, Lr);
  const Lroof = await A.evaluate(() => { const r = T.put('roof', 35, 27); return { r: r, roofs: T.roofs() }; });
  check('le toit en L couvre exactement cette forme', Lroof.r === 'ok' && Lroof.roofs === Lr.expect, [Lroof, Lr.expect]);
  const notInL = await A.evaluate(() => !T.w().roofAt(39, 29) && !T.w().roofAt(38, 30));
  check('le creux du L n’est pas couvert', notInL);

  console.log('Démolition');
  const own = await A.evaluate(() => ({ walls: T.count('wall_wood'), roofs: T.count('roof') }));
  const rm = await A.evaluate(() => { const r = T.rm(36, 26); return { r: r, roofs: T.roofs(), walls: T.count('wall_wood'), roofItems: T.count('roof') }; });
  check('retirer un mur : le toit ne flotte pas (toutes ses tuiles sont rendues)', rm.r === 'ok' && rm.roofs === 0 && rm.roofItems === own.roofs + Lr.expect, [own, rm]);
  check('le mur retiré est rendu', rm.walls === own.walls + 1, [own, rm]);
  const again = await A.evaluate(() => { T.put('wall_wood', 36, 26); const r = T.put('roof', 35, 27); return { r: r, roofs: T.roofs() }; });
  check('on peut reconstruire : remettre le mur puis un nouveau toit', again.r === 'ok' && again.roofs > 0, again);
  const roofOff = await A.evaluate(() => {
    const p = T.p(); p.inv.slots.forEach((s, i) => { if (s && s.id === 'roof') { Iles.debug.game.local.inv.move(i, 6); } });
    p.sel = 6; p.x = 35 * 16 + 8; p.y = 29 * 16; const b = T.roofs(), r = Iles.building.remove(T.s(), p, 35, 27, []);
    return { before: b, after: T.roofs(), r: r.ok };
  });
  check('clic droit avec un toit en main : retire tout le toit', roofOff.r && roofOff.after === 0 && roofOff.before > 0, roofOff);
  check('les murs sont toujours là après avoir retiré le toit', await A.evaluate(() => !!T.w().structureAt(34, 28) && !!T.w().structureAt(36, 26)));
  const opened = await A.evaluate(() => { T.rm(34, 28); return Iles.house.roofPreview(T.w(), 35, 27); });
  check("pièce ouverte : toit refusé avec message", !opened.ok && opened.reason === "roofOpen", opened);
  const few = await A.evaluate(() => { T.put('wall_wood', 34, 28); const p = T.p(); const keep = p.inv.count('roof'); Iles.inv_takeAny(p.inv, 'roof', keep - 3); const r = Iles.building.check(T.s(), (p.x = 35 * 16 + 8, p.y = 29 * 16, p), 'roof', 35, 27, 0, 'roof'); return r; });
  check('pas assez de toits : refusé, le message donne les nombres', !few.ok && few.reason === 'roofNeed' && few.have === 3, few);
  await A.evaluate(() => T.clear());

  console.log('Sauvegarde');
  await A.evaluate(() => { T.p().inv.add('roof', 40); T.p().inv.add('wall_wood', 20); T.rect(34, 26, 40, 30, 'wall_wood'); T.put('door', 37, 30); T.put('window', 35, 30); T.put('roof', 37, 28); });
  const sv = await A.evaluate(() => ({ s: T.w().structures.length, r: T.roofs() }));
  await A.evaluate(() => Iles.debug.app.saveNow('test')); await A.reload(); await wait(600); await A.click('#btn-continue'); await wait(700); await inject(A, false);
  const ld = await A.evaluate(() => { const w = Iles.debug.game.state.world; return { s: w.structures.length, r: w.structures.filter(o => o.def.layer === 'roof').length, door: w.structureAt(37, 30) && w.structureAt(37, 30).type, win: w.structureAt(35, 30) && w.structureAt(35, 30).type, room: Iles.house.roofPreview(w, 37, 28).reason }; });
  check('murs, porte, fenêtre et toit sont conservés après rechargement', ld.s === sv.s && ld.r === sv.r && ld.door === 'door' && ld.win === 'window' && ld.room === 'roofDone', [sv, ld]);

  console.log('Coop : construction partagée');
  const B = await open('B');
  await A.keyboard.press('Escape'); await wait(150);
  await A.click('#btn-coop'); await A.evaluate(() => { document.getElementById('coop-manual-h').open = true; }); await A.click('#coop-gen');
  await until(A, () => document.getElementById('coop-offer').value.startsWith('IL1'));
  const offer = await A.inputValue('#coop-offer');
  await B.click('#btn-join'); await B.evaluate(() => { document.getElementById('coop-manual-j').open = true; }); await B.fill('#coop-offer-in', offer); await B.click('#coop-join-btn');
  await until(B, () => document.getElementById('coop-answer-out').value.startsWith('IL1'));
  await A.fill('#coop-answer', await B.inputValue('#coop-answer-out')); await A.click('#coop-accept');
  check('l’invité entre dans la partie', await until(B, () => Iles.Menu.screen === 'playing' && !!Iles.debug.game.local, null, 20000));
  await A.keyboard.press('Escape'); await wait(300); await A.keyboard.press('Escape'); await wait(300);
  check('l’invité voit la maison de l’hôte (murs, toit)', await until(B, () => { const w = Iles.debug.game.state.world; return w.structures.length > 40 && !!w.roofAt(37, 28) && !!Iles.house.wallAt(w, 36, 26); }, null, 5000));
  // l'invité se place dans la maison : le toit et le mur du devant s'effacent chez lui aussi
  await A.evaluate(() => { const p = T.s().players.p2; p.x = 37 * 16 + 8; p.y = 28 * 16 + 8; });
  await B.waitForTimeout(1800);
  const gf = await B.evaluate(() => { const w = Iles.debug.game.state.world; return { roof: w.roofAt(37, 28).fa, south: w.structureAt(36, 30).fa, in: !!Iles.house.roomOf(w, Iles.debug.game.local) }; });
  check('chez l’invité aussi : à l’intérieur, toit et murs de devant transparents', gf.in && gf.roof < 0.05 && gf.south < 0.3, gf);
  // l'invité pose un mur avec un vrai clic, l'hôte le voit
  await A.evaluate(() => { const p = T.s().players.p2; p.inv.add('wall_wood', 5); p.x = 44 * 16 + 8; p.y = 28 * 16; p.sel = 0; p.inv.slots[0] = { id: 'wall_wood', qty: 5 }; });
  await B.waitForTimeout(600);
  await B.evaluate(() => Iles.debug.cam.snapTo(Iles.debug.game.local.x, Iles.debug.game.local.y - 8, 1280, 1024));
  await B.waitForTimeout(300);
  const bp = await B.evaluate(() => { const c = Iles.debug.cam, sc = Iles.debug.renderer.scale; return [(44 * 16 + 8 - c.rx) * sc, (26 * 16 + 8 - c.ry) * sc]; });
  await B.mouse.move(bp[0], bp[1]); await B.waitForTimeout(150); await B.mouse.down(); await B.waitForTimeout(200); await B.mouse.up();
  check('un mur posé par l’invité apparaît chez l’hôte', await until(A, () => !!Iles.debug.game.state.world.structureAt(44, 26), null, 5000));
  check('…et chez l’invité', await until(B, () => !!Iles.debug.game.state.world.structureAt(44, 26), null, 5000));

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
