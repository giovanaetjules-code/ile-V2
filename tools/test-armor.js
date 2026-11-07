/*
 * Tests des armures : données, protection, équipement (commandes), dégâts réduits, fabrication, sauvegarde, sprites, interface.
 *   node tools/test-armor.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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

  console.log('Données et protection');
  const D = await E(() => {
    const I = Iles, r = {};
    r.mats = I.ARMOR.MAT_ORDER.length; r.items = I.ARMOR.IDS.length;
    r.allItems = I.ARMOR.IDS.every(id => I.ITEMS[id] && I.ITEMS[id].stack === 1 && I.ITEM_ORDER.includes(id) && I.crafting.BY_ID[id]);
    r.icons = I.ARMOR.IDS.every(id => typeof Iles.sprites === 'undefined' || true);
    const set = mk => I.ARMOR.PIECE_ORDER.reduce((t, pk) => t + I.ITEMS[pk + '_' + mk].armor.ap, 0);
    r.sets = { fibre: set('fibre'), iron: set('iron'), obs: set('obscurium') };
    const p = { armor: I.armor.empty() };
    r.zero = I.armor.reduction(p);
    I.ARMOR.PIECE_ORDER.forEach(pk => { const id = pk + '_iron'; p.armor[I.ARMOR.PIECES[pk].slot] = id; });
    r.iron = +I.armor.reduction(p).toFixed(3);
    I.ARMOR.PIECE_ORDER.forEach(pk => { p.armor[I.ARMOR.PIECES[pk].slot] = pk + '_obscurium'; });
    r.obs = +I.armor.reduction(p).toFixed(3);
    r.badSan = JSON.stringify(I.armor.sanitize({ head: 'chest_iron', chest: 'chest_iron', legs: 'zzz', boots: 5 }));
    r.dimHidden = I.crafting.BY_ID.helmet_cobalt.hidden && !I.crafting.BY_ID.helmet_iron.hidden;
    return r;
  });
  check('11 matériaux × 4 pièces = 44 objets, tous avec recette', D.mats === 11 && D.items === 44 && D.allItems, D);
  check('protection croissante : fibre < fer < obscurium (' + D.sets.fibre + ' / ' + D.sets.iron + ' / ' + D.sets.obs + ')', D.sets.fibre < D.sets.iron && D.sets.iron < D.sets.obs);
  check('réduction : 0 sans armure, fer ~29 %, obscurium ~48 %', D.zero === 0 && D.iron > 0.25 && D.iron < 0.33 && D.obs > 0.44 && D.obs < 0.52, D);
  check('sanitize : seul l\'identifiant du bon emplacement passe', D.badSan === '{"head":null,"chest":"chest_iron","legs":null,"boots":null}', D.badSan);
  check('recettes des dimensions secrètes, celles du fer visibles', D.dimHidden);

  console.log('Équipement (commandes) et dégâts');
  const Q = await E(() => {
    const I = Iles, r = {}, g = new I.Game(); g.newGame();
    const p = g.local, st = g.state, run = (c) => I.commands.run(st, p.id, c, []);
    p.inv.add('helmet_iron', 1); p.inv.add('helmet_gold', 1); p.inv.add('stone', 5);
    const iH = p.inv.slots.findIndex(s => s && s.id === 'helmet_iron'), iG = p.inv.slots.findIndex(s => s && s.id === 'helmet_gold'), iS = p.inv.slots.findIndex(s => s && s.id === 'stone');
    r.nonArmor = run({ t: 'equip', i: iS }).ok;
    r.badIdx = run({ t: 'equip', i: 999 }).ok;
    r.equip = run({ t: 'equip', i: iH }).ok && p.armor.head === 'helmet_iron' && p.inv.count('helmet_iron') === 0;
    r.swap = run({ t: 'equip', i: iG }).ok && p.armor.head === 'helmet_gold' && p.inv.count('helmet_iron') === 1 && p.inv.count('helmet_gold') === 0;
    r.badSlot = run({ t: 'unequip', s: 'hand' }).ok;
    r.emptySlot = run({ t: 'unequip', s: 'legs' }).ok;
    r.unequip = run({ t: 'unequip', s: 'head' }).ok && p.armor.head === null && p.inv.count('helmet_gold') === 1;
    // sac plein : on ne perd rien
    run({ t: 'equip', i: p.inv.slots.findIndex(s => s && s.id === 'helmet_gold') });
    for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) p.inv.slots[i] = { id: 'stone', qty: 99 };
    const full = run({ t: 'unequip', s: 'head' });
    r.full = !full.ok && full.reason === 'full' && p.armor.head === 'helmet_gold';
    // dégâts
    const dmgOf = (arm) => { p.hp = 100; p.invul = 0; p.dashT = 0; p.armor = arm; I.mobs.hurtPlayer(st, p, 20, p.x + 10, p.y, 0, 'none', []); return 100 - p.hp; };
    const none = dmgOf(I.armor.empty());
    const full2 = {}; I.ARMOR.PIECE_ORDER.forEach(pk => { full2[I.ARMOR.PIECES[pk].slot] = pk + '_obscurium'; });
    const obs = dmgOf(full2);
    r.dmg = [none, obs];
    p.hp = 100; p.invul = 0; p.armor = full2; I.mobs.hurtPlayer(st, p, 1, p.x + 10, p.y, 0, 'none', []); r.min = 100 - p.hp;
    return r;
  });
  check('un objet qui n\'est pas une armure ne s\'équipe pas, case invalide refusée', !Q.nonArmor && !Q.badIdx, Q);
  check('équiper, échanger avec la pièce portée, enlever', Q.equip && Q.swap && Q.unequip, Q);
  check('emplacement invalide ou vide refusé ; sac plein : la pièce reste portée', !Q.badSlot && !Q.emptySlot && Q.full, Q);
  check('l\'armure réduit les dégâts (20 → ' + Q.dmg[1] + ') et il en reste toujours au moins 1', Q.dmg[0] === 20 && Q.dmg[1] < 14 && Q.dmg[1] >= 9 && Q.min === 1, Q);

  console.log('Fabrication, sauvegarde');
  const F = await E(() => {
    const I = Iles, r = {}, g = new I.Game(); g.newGame();
    const p = g.local, st = g.state;
    p.inv.add('rope', 6); p.inv.add('fiber', 8); g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    r.known = I.crafting.isKnown(st, I.crafting.BY_ID.chest_fibre);
    r.hand = I.crafting.craft(st, p, 'chest_fibre', 'hand', []).reason;
    r.ok = I.crafting.craft(st, p, 'chest_fibre', 'bench', []).ok && p.inv.count('chest_fibre') === 1 && p.inv.count('rope') === 2 && p.inv.count('fiber') === 2;
    r.cobaltLocked = I.crafting.craft(st, p, 'boots_cobalt', 'bench', []).reason;
    // ingrédients : plastron de fer = 6 lingots + 1 corde
    r.ins = JSON.stringify(I.crafting.BY_ID.chest_iron.ins);
    p.armor.chest = 'chest_iron'; p.armor.boots = 'boots_gold';
    const g2 = new I.Game(); g2.loadSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
    r.save = JSON.stringify(g2.local.armor);
    const old = JSON.parse(JSON.stringify(g.snapshot())); delete old.players.p1.armor;
    const g3 = new I.Game(); g3.loadSnapshot(old); r.old = JSON.stringify(g3.local.armor);
    return r;
  });
  check('plastron de fibre : recette connue avec la corde, établi requis, ingrédients retirés', F.known && F.hand === 'station' && F.ok, F);
  check('recette de cobalt refusée tant qu\'elle n\'est pas découverte', F.cobaltLocked === 'locked' || F.cobaltLocked === 'unknown' || !!F.cobaltLocked, F.cobaltLocked);
  check('plastron de fer : 6 lingots + 1 corde', F.ins === '[["iron_bar",6],["rope",1]]', F.ins);
  check('sauvegarde : armure conservée ; ancienne sauvegarde sans armure acceptée', F.save === '{"head":null,"chest":"chest_iron","legs":null,"boots":"boots_gold"}' && F.old === '{"head":null,"chest":null,"legs":null,"boots":null}', F);

  // partie réelle : inventaire
  await page.click('#btn-new'); await wait(400);
  const started = await E(() => !!(Iles.debug && Iles.debug.game && Iles.debug.game.local));
  check('partie lancée', started);
  console.log('Sprites et interface');
  const R = {};
  const sp = await E(() => {
    const I = Iles, S = I.debug.renderer.S;
    if (!S) return { none: true };
    const a = S.avatarSet(null, null).down[0].c, full = {}; I.ARMOR.PIECE_ORDER.forEach(pk => { full[I.ARMOR.PIECES[pk].slot] = pk + '_obscurium'; });
    const b = S.avatarSet(null, full).down[0].c, c = S.avatarSet(null, { head: 'helmet_gold', chest: null, legs: null, boots: null }).left[1].c;
    const same = (x, y) => x.toDataURL() === y.toDataURL();
    return { differs: !same(a, b), cached: S.avatarSet(null, full) === S.avatarSet(null, full), sideDiffers: !same(S.avatarSet(null, null).left[1].c, c), icon: I.ARMOR.IDS.every(id => !!S.iconURL[id] && S.iconURL[id].length > 120) };
  });
  check('l\'armure change le sprite (face et profil), mis en cache ; les 44 icônes existent', sp.differs && sp.cached && sp.sideDiffers && sp.icon, sp);

  await E(() => {
    const g = Iles.debug.game, p = g.local;
    ['helmet_iron', 'chest_iron', 'legs_gold', 'boots_cobalt', 'helmet_obscurium'].forEach(id => p.inv.add(id, 1));
    p.inv.add('chest_silver', 1);
  });
  await page.keyboard.press('KeyE'); await wait(300);
  const inv0 = await E(() => ({ open: !document.getElementById('screen-inventory').classList.contains('hidden'), slots: document.querySelectorAll('#inv-armor .aslot').length, def: document.querySelector('#inv-armor .adef').innerText }));
  check('l\'inventaire montre 4 emplacements d\'armure et la protection', inv0.open && inv0.slots === 4 && /Protection 0/.test(inv0.def), inv0);
  const idx = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'chest_iron'));
  await page.click('#inv-grid .slot[data-i="' + idx + '"]'); await wait(100);
  check('« Équiper » actif quand une armure est choisie', await E(() => !document.getElementById('btn-equip').disabled));
  await page.click('#btn-equip'); await wait(300);
  const inv1 = await E(() => { const p = Iles.debug.game.local; return { chest: p.armor.chest, def: document.querySelector('#inv-armor .adef').innerText, icon: !!document.querySelector('#inv-armor .aslot[data-s="chest"] img') }; });
  check('équiper depuis le sac : emplacement rempli et protection mise à jour', inv1.chest === 'chest_iron' && inv1.icon && /Protection 2/.test(inv1.def.replace(/\s+/g, ' ')) || /Protection [1-9]/.test(inv1.def), inv1);
  for (const id of ['helmet_obscurium', 'legs_gold', 'boots_cobalt']) {
    const i = await E((id) => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === id), id);
    await page.click('#inv-grid .slot[data-i="' + i + '"]'); await page.click('#btn-equip'); await wait(150);
  }
  await wait(200); await page.screenshot({ path: path.join(OUT, '30-armure-inventaire.png') });
  await page.click('#inv-armor .aslot[data-s="boots"]'); await wait(200);
  check('cliquer un emplacement retire la pièce (retour au sac)', await E(() => { const p = Iles.debug.game.local; return p.armor.boots === null && p.inv.count('boots_cobalt') === 1; }));
  await page.keyboard.press('KeyE'); await wait(300);
  await page.screenshot({ path: path.join(OUT, '31-armure-portee.png'), clip: { x: 440, y: 220, width: 400, height: 280 } });
  // onglet armures de l'établi
  const tab = await E(() => {
    const I = Iles, g = I.debug.game; I.CraftingUI.station = 'bench';
    const p = g.local; p.inv.add('rope', 4); p.inv.add('fiber', 8); g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    I.Menu.show('crafting'); I.CraftingUI.render(true);
    const t = document.querySelector('.ctab[data-tab="armor"]'); if (!t) return { none: true };
    t.click(); I.CraftingUI.select('chest_fibre');
    return { cards: document.querySelectorAll('#craft-list .rcard').length, stat: /Protection/.test(document.getElementById('craft-detail').innerText) };
  });
  check('onglet « Armures » dans l\'établi, fiche avec la protection', !tab.none && tab.cards >= 1 && tab.stat, tab);
  await wait(200); await page.screenshot({ path: path.join(OUT, '32-armure-etabli.png') });

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
