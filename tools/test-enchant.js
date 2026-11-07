/*
 * Tests des enchantements : données, arme enchantée (identifiant, dégâts, icône), tables (commandes, distance, sac plein), désenchantement,
 * butin des élites, recettes, sauvegarde, interface animée. node tools/test-enchant.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(URL); await wait(400);

  console.log('Données');
  const D = await E(() => {
    const I = Iles, r = {};
    r.stones = I.ENCH.STONE_IDS.length; r.items = I.ENCH.STONE_IDS.every(id => I.ITEMS[id] && I.ITEM_ORDER.includes(id) && I.ITEMS[id].stack === 99);
    r.doubles = I.ENCH.STONE_IDS.filter(id => I.ENCH.STONES[id].double).length;
    r.recipes = [I.crafting.BY_ID.enchant_table, I.crafting.BY_ID.disenchant_table].map(x => x && x.ins.map(i => i.join(':')).join(' '));
    r.objs = ['enchant_table', 'disenchant_table'].map(k => I.OBJECTS[k].action);
    r.parse = [I.ENCH.parse('fl.sh') && I.ENCH.parse('fl.sh').dmgMul, I.ENCH.parse('sh.fl'), I.ENCH.parse('zz'), I.ENCH.parse('fl.fl.fl'), I.ENCH.parse('ff') && I.ENCH.parse('ff').dmgMul];
    r.idWith = I.ENCH.idWith('wp:sword:a,b,c', ['stone_shock', 'stone_flame']);
    return r;
  });
  check('6 pierres (dont 2 doubles) existent comme objets', D.stones === 6 && D.items && D.doubles === 2, D);
  check('les deux tables ont une recette chère (cristaux) et une action', D.recipes[0] && /crystal:10/.test(D.recipes[0]) && /crystal:6/.test(D.recipes[1]) && D.objs.join() === 'enchant,disenchant', D);
  check('codes triés valides seulement ; double plus forte qu\'une simple', D.parse[0] > 1.2 && D.parse[1] === null && D.parse[2] === null && D.parse[3] === null && D.parse[4] > D.parse[0] - 0.01 + 0.0 && D.idWith === 'wp:sword:a,b,c@fl.sh', D);

  console.log('Arme enchantée, commandes');
  await page.click('#btn-new'); await wait(400);
  const W = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, ev = [];
    p.inv.add('stick', 2); p.inv.add('iron_bar', 2);
    const x = I.forge.craft(g.state, p, 'sword', ['stick', 'stick', 'iron_bar'], ev);
    return { ok: x.ok, reason: x.reason, wid: x.id, inv: p.inv.slots.filter(Boolean).map(s => s.id) };
  });
  check('arme forgée disponible pour les tests', !!W.wid || W.inv.some(i => i.indexOf('wp:') === 0), W);
  const T = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, st = g.state, r = {};
    const wid = p.inv.slots.filter(Boolean).map(s => s.id).find(i => i.indexOf('wp:') === 0);
    r.wid = wid;
    const run = (c) => { const ev = []; const x = I.commands.run(st, p.id, c, ev); x.ev = ev; return x; };
    const idx = (id) => p.inv.slots.findIndex(s => s && s.id === id);
    p.inv.add('stone_flame', 2); p.inv.add('stone_frost', 1); p.inv.add('stone_flamefrost', 1); p.inv.add('stone', 3);
    const baseDmg = I.forge.weapon(wid).stats.dmg;
    // pas de table à proximité
    r.far = run({ t: 'enchant', i: idx(wid), s: [idx('stone_flame')] }).reason;
    // pose d'une table d'enchantement et d'une table de désenchantement près du joueur
    const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
    const place = (type, dx) => { try { const o = st.world.addStructure(type, tx + dx, ty + 2, null, 'T' + type, 0); return !!o; } catch (e) { return String(e); } };
    r.placed = [place('enchant_table', 0), place('disenchant_table', 3)];
    r.nearE = !!I.enchant.tableNear(st, p, 'enchant_table');
    r.badStone = run({ t: 'enchant', i: idx(wid), s: [idx('stone')] }).reason;
    r.noStone = run({ t: 'enchant', i: idx(wid), s: [] }).reason;
    r.notWeapon = run({ t: 'enchant', i: idx('stone_flame'), s: [idx('stone_frost')] }).reason;
    r.dup = run({ t: 'enchant', i: idx(wid), s: [idx('stone_frost'), idx('stone_frost')] }).reason; // une seule pierre de givre
    const f1 = idx('stone_flame');
    const e1 = run({ t: 'enchant', i: idx(wid), s: [f1, f1] }); // deux flammes depuis la même pile
    r.two = { ok: e1.ok, id: e1.id, flame: p.inv.count('stone_flame'), ev: e1.ev.some(e => e.type === 'enchant' && e.els[0] === 'flame') };
    const w1 = e1.id, a1 = I.forge.weapon(w1);
    r.stats = { base: baseDmg, now: a1 && a1.stats.dmg, name: a1 && a1.name, desc: I.ITEMS[w1] && I.ITEMS[w1].desc };
    r.third = run({ t: 'enchant', i: idx(w1), s: [idx('stone_frost')] }).reason; // déjà 2 pierres
    return r;
  });
  check('sans table à proximité : refus « far »', T.far === 'far', T);
  check('tables posées dans le monde et détectées à proximité', T.placed[0] === true && T.nearE, T.placed);
  check('pierre invalide, aucune pierre, objet qui n\'est pas une arme : refusés', T.badStone === 'stone' && T.noStone === 'bad' && T.notWeapon === 'weapon', T);
  check('la même pile ne peut pas donner plus de pierres qu\'elle n\'en contient', T.dup === 'stone', T.dup);
  check('deux pierres de flamme : arme enchantée, pierres consommées, événement', T.two.ok && T.two.flame === 0 && T.two.ev && /@fl\.fl$/.test(T.two.id), T.two);
  check('l\'arme enchantée fait plus de dégâts (' + T.stats.base + ' → ' + T.stats.now + '), nom et description mis à jour', T.stats.now > T.stats.base && /enchantée de flamme/.test(T.stats.name) && /Enchantée/.test(T.stats.desc), T.stats);
  check('une troisième pierre est refusée (2 maximum)', T.third === 'slots', T.third);

  console.log('Désenchantement');
  const X = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, st = g.state, r = {};
    const run = (c) => { const ev = []; const x = I.commands.run(st, p.id, c, ev); x.ev = ev; return x; };
    const w1 = p.inv.slots.filter(Boolean).map(s => s.id).find(i => i.indexOf('@') > 0), idx = (id) => p.inv.slots.findIndex(s => s && s.id === id);
    const baseId = w1.split('@')[0];
    // sac plein : refusé et rien ne change
    const save = JSON.stringify(p.inv.toJSON());
    const empties = []; for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) { empties.push(i); p.inv.slots[i] = { id: 'stone', qty: 99 }; }
    const full = run({ t: 'disenchant', i: idx(w1) });
    r.full = { ok: full.ok, reason: full.reason, still: !!p.inv.slots.find(s => s && s.id === w1) };
    empties.forEach(i => { p.inv.slots[i] = null; });
    // trop loin de la table : on éloigne le joueur
    const ox = p.x; p.x += 400; r.far = run({ t: 'disenchant', i: idx(w1) }).reason; p.x = ox;
    const d = run({ t: 'disenchant', i: idx(w1) });
    r.ok = { ok: d.ok, base: !!p.inv.slots.find(s => s && s.id === baseId), flame: p.inv.count('stone_flame'), ev: d.ev.some(e => e.type === 'enchant' && e.dis) };
    r.plain = run({ t: 'disenchant', i: idx(baseId) }).reason;
    return r;
  });
  check('sac plein : refus « full », l\'arme reste enchantée', X.full.reason === 'full' && X.full.still, X.full);
  check('trop loin de la table de désenchantement : refus', X.far === 'far', X.far);
  check('désenchantement : arme de base rendue + les 2 pierres de flamme', X.ok.ok && X.ok.base && X.ok.flame === 2 && X.ok.ev, X.ok);
  check('une arme non enchantée ne se désenchante pas', X.plain === 'weapon', X.plain);

  console.log('Butin, sauvegarde, rendu');
  const L = await E(() => {
    const I = Iles, r = {};
    let got = {}; ['venom', 'flame', 'frost', 'shock'].forEach(el => {
      const S = { elem: el, plan: Object.keys({ x: 1 })[0], size: 1 }; let n = 0, nn = 0; for (let i = 0; i < 4000; i++) { try { const l1 = I.mobGen.loot(Object.assign({ plan: 'blob' }, S), true, Math.random); if (l1.some(x => x.item === 'stone_' + el)) n++; const l2 = I.mobGen.loot(Object.assign({ plan: 'blob' }, S), false, Math.random); if (l2.some(x => x.item === 'stone_' + el)) nn++; } catch (e) { return { err: String(e) }; } }
      got[el] = [n / 4000, nn];
    });
    r.got = got;
    const g = I.debug.game, p = g.local, wid = I.ENCH.idWith('wp:sword:stick,stick,iron_bar', ['stone_frost', 'stone_venomshock']);
    p.inv.add(wid, 1);
    const g2 = new I.Game(); g2.loadSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
    r.save = g2.local.inv.slots.some(s => s && s.id === wid);
    const S = I.debug.renderer.S, a = I.forge.weapon(I.ENCH.baseOf(wid)), b = I.forge.weapon(wid);
    r.icon = a && b ? [S.iconURL[I.ENCH.baseOf(wid)] !== S.iconURL[wid], S.iconURL[wid].length > 100] : 'weapon?' + !!a + !!b;
    r.stoneIcons = I.ENCH.STONE_IDS.every(id => S.iconURL[id] && S.iconURL[id].length > 120);
    r.tables = ['enchant_table', 'disenchant_table'].every(k => S.obj[k] && S.obj[k][0]);
    return r;
  });
  check('seuls les élites lâchent leur pierre, rarement (~12 %)', !L.err && Object.values(L.got).every(v => v[0] > 0.07 && v[0] < 0.18 && v[1] === 0), L);
  check('l\'arme enchantée (avec pierre double) est sauvegardée', L.save, L);
  check('icône d\'arme enchantée différente de celle de base ; icônes des 6 pierres et sprites des tables', Array.isArray(L.icon) && L.icon[0] && L.icon[1] && L.stoneIcons && L.tables, L);

  console.log('Interface et animation');
  await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, st = g.state;
    p.inv.slots.forEach((s, i) => { if (s && (s.id.indexOf('stone_') === 0 || s.id.indexOf('@') > 0)) p.inv.slots[i] = null; });
    p.inv.add('stone_shock', 2); p.inv.add('stone_frost', 1);
    I.Menu.openEnchant('enchant');
  });
  await wait(300);
  const U = await E(() => ({ open: Iles.Menu.screen === 'enchant', title: document.getElementById('ench-title').textContent, items: document.querySelectorAll('#ench-inv .eitem').length, go: document.getElementById('btn-ench-go').disabled }));
  check('l\'écran s\'ouvre avec le bon titre et liste armes et pierres du sac', U.open && /enchantement/.test(U.title) && U.items >= 3 && U.go, U);
  const w = await E(() => { const p = Iles.debug.game.local; return p.inv.slots.findIndex(s => s && s.id.indexOf('wp:') === 0 && s.id.indexOf('@') < 0); });
  await page.click('#ench-inv .eitem[data-i="' + w + '"]'); await wait(100);
  const sh = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'stone_shock'));
  await page.click('#ench-inv .eitem[data-i="' + sh + '"]'); await wait(100);
  const fr = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'stone_frost'));
  await page.click('#ench-inv .eitem[data-i="' + fr + '"]'); await wait(400);
  const P = await E(() => ({ go: !document.getElementById('btn-ench-go').disabled, info: document.getElementById('ench-info').innerText.replace(/\s+/g, ' '), col: getComputedStyle(document.getElementById('ench-stage')).getPropertyValue('--ec') }));
  check('aperçu : dégâts avant → après et éléments ; bouton actif', P.go && /Dégâts/.test(P.info) && /Foudre/.test(P.info) && /Givre/.test(P.info), P);
  check('la lueur de la scène prend la couleur des pierres (plus violette)', P.col && !/183, ?156, ?255/.test(P.col), P.col);
  await page.screenshot({ path: path.join(OUT, '40-enchant-apercu.png') });
  await page.click('#btn-ench-go'); await wait(900);
  await page.screenshot({ path: path.join(OUT, '41-enchant-anim1.png') });
  const mid = await E(() => ({ running: !!Iles.EnchantUI.run, sent: Iles.EnchantUI.run && Iles.EnchantUI.run.sent, inv: Iles.debug.game.local.inv.slots.filter(Boolean).some(s => s.id.indexOf('@') > 0) }));
  check('animation en cours : rien n\'est encore consommé avant le flash', mid.running && !mid.sent && !mid.inv, mid);
  await wait(900); await page.screenshot({ path: path.join(OUT, '42-enchant-flash.png') });
  await wait(1900);
  const fin = await E(() => { const I = Iles, p = I.debug.game.local; return { running: !!I.EnchantUI.run, ench: p.inv.slots.filter(Boolean).map(s => s.id).find(i => i.indexOf('@') > 0), shock: p.inv.count('stone_shock'), frost: p.inv.count('stone_frost'), info: document.getElementById('ench-info').innerText.replace(/\s+/g, ' '), glow: !!I.tableGlow }; });
  check('après l\'animation : arme enchantée foudre + givre, pierres consommées, résultat affiché', !fin.running && /@fr\.sh$/.test(fin.ench || '') && fin.shock === 1 && fin.frost === 0 && /Résultat/.test(fin.info), fin);
  await page.screenshot({ path: path.join(OUT, '43-enchant-resultat.png') });
  // désenchantement via l'écran
  await E(() => { Iles.Menu.openEnchant('disenchant'); });
  await wait(300);
  const dw = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id.indexOf('@') > 0));
  await page.click('#ench-inv .eitem[data-i="' + dw + '"]'); await wait(300);
  const dp = await E(() => ({ go: !document.getElementById('btn-ench-go').disabled, info: document.getElementById('ench-info').innerText.replace(/\s+/g, ' '), ghost: document.querySelectorAll('.eslot.ghost').length }));
  check('désenchantement : aperçu de l\'arme de base et des pierres rendues', dp.go && /récupères/.test(dp.info) && dp.ghost === 2, dp);
  await page.screenshot({ path: path.join(OUT, '44-disenchant-apercu.png') });
  await page.click('#btn-ench-go'); await wait(3400);
  const df = await E(() => { const p = Iles.debug.game.local; return { weapon: p.inv.slots.filter(Boolean).some(s => s.id.indexOf('wp:') === 0 && s.id.indexOf('@') < 0), enchanted: p.inv.slots.filter(Boolean).some(s => s.id.indexOf('@') > 0), shock: p.inv.count('stone_shock'), frost: p.inv.count('stone_frost') }; });
  check('après l\'animation : arme de base et pierres de retour dans le sac', df.weapon && !df.enchanted && df.shock === 2 && df.frost === 1, df);
  await page.keyboard.press('Escape'); await wait(200);
  check('Échap ferme l\'écran', await E(() => Iles.Menu.screen === 'playing'));

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
