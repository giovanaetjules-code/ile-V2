/*
 * Test « Food Update » étape C : touches E (inventaire) / X (interaction), parcelles et cultures, graines sauvages, viandes par plan
 * de corps, barres de vie et de faim, manger au clic droit, sauvegarde, coop.
 *   node tools/test-food.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
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

  const inject = (page) => page.evaluate(() => {
    const g = Iles.debug.game;
    window.T = {
      p: () => g.local, s: () => g.state, w: () => g.state.world,
      slot: (id) => g.local.inv.slots.findIndex(x => x && x.id === id),
      count: (id) => g.local.inv.count(id),
      put: (id, x, y) => { const p = g.local; p.x = x * 16 + 8; p.y = (y + 2) * 16 + 4; const r = Iles.building.place(g.state, p, T.slot(id), x, y, []); return r.ok ? 'ok' : r.reason; },
      hold: (id) => { const p = g.local; let i = T.slot(id); if (i >= 8) { p.inv.move(i, 7); i = T.slot(id); } p.sel = i; return i; },
      drops: () => g.state.world.drops.map(d => d.item),
    };
  });
  await inject(A);

  console.log('Contenu');
  const c = await A.evaluate(() => ({
    crops: Object.keys(Iles.CROPS).length,
    items: Object.values(Iles.CROPS).every(k => Iles.ITEMS[k.item] && Iles.ITEMS[k.seed] && Iles.FOOD[k.item]),
    meats: Object.values(Iles.MEATS).every(m => Iles.ITEMS[m.item] && Iles.FOOD[m.item] && Iles.ITEMS[m.loot]),
    plans: Object.keys(Iles.MEATS).length, crystal: Iles.ITEMS.crystal.name,
    recipe: (Iles.crafting.BY_ID.plot || {}).station,
    icons: ['carrot', 'seed_tomato', 'meat_quad', 'bone', 'plot'].every(id => Iles.debug.sprites ? true : true),
    seedDrop: Iles.OBJECTS.tall_grass.drops.some(d => d.id === 'seed_wheat'),
    noColor: !Object.keys(Iles.ITEMS).some(k => /^plot_c\d/.test(k) || (Iles.ITEMS[k].base === 'plot')),
  }));
  check('11 cultures avec objet, graine et valeurs nutritives', c.crops === 11 && c.items, c);
  check('5 viandes (une par plan) avec butin supplémentaire', c.plans === 5 && c.meats, c);
  check('le cristal lunaire garde son nom', c.crystal === 'Cristal lunaire', c.crystal);
  check('la parcelle se fabrique à la main', c.recipe === 'hand', c.recipe);
  check('les plantes sauvages donnent des graines', c.seedDrop);
  check('la parcelle n’a pas de variantes de couleur', c.noColor);

  console.log('Touche E (inventaire sans cible, interaction près d’un objet)');
  await A.keyboard.press('KeyE'); await wait(200);
  check('E ouvre l’inventaire', await A.evaluate(() => Iles.Menu.screen === 'inventory'));
  await A.keyboard.press('KeyE'); await wait(200);
  check('E referme l’inventaire', await A.evaluate(() => Iles.Menu.screen === 'playing'));
  await A.keyboard.press('KeyI'); await wait(200);
  check('I ne fait plus rien', await A.evaluate(() => Iles.Menu.screen === 'playing'));
  const hints = await A.evaluate(() => ({ prompt: document.querySelector('#prompt kbd').textContent, help: document.getElementById('help').textContent, ctl: document.body.textContent.indexOf('E : inventaire') >= 0 || /E\s*:\s*inventaire/.test(document.body.textContent) }));
  check('les aides affichent E pour interagir et pour l’inventaire (plus de X)', hints.prompt === 'E' && /E\s*:\s*inventaire/.test(hints.help) && /E\s*:\s*interagir/.test(hints.help) && !/\bX\s*:/.test(hints.help), hints);

  console.log('Parcelles et cultures');
  await A.evaluate(() => { const p = T.p(); p.inv.add('plot', 6); for (const k of Object.keys(Iles.CROPS)) p.inv.add(Iles.CROPS[k].seed, 2); });
  const put = await A.evaluate(() => [T.put('plot', 35, 28), T.put('plot', 36, 28), T.put('plot', 37, 28), T.put('plot', 38, 28)]);
  check('4 parcelles posées', put.every(r => r === 'ok'), put);
  const walk = await A.evaluate(() => { const p = T.p(); p.x = 35 * 16 + 8; p.y = 28 * 16 + 8; return !Iles.collision.isBlocked(T.w(), p); });
  check('on peut marcher sur une parcelle', walk);
  // planter avec un vrai clic
  const clickTile = async (tx, ty, button) => {
    const pos = await A.evaluate(([tx, ty]) => { const c = Iles.debug.cam, sc = Iles.debug.renderer.scale; return [(tx * 16 + 8 - c.rx) * sc, (ty * 16 + 8 - c.ry) * sc]; }, [tx, ty]);
    await A.mouse.move(pos[0], pos[1]); await wait(60); await A.mouse.down({ button: button || 'left' }); await wait(120); await A.mouse.up({ button: button || 'left' }); await wait(150);
  };
  await A.evaluate(() => { const p = T.p(); p.x = 36 * 16 + 8; p.y = 30 * 16; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); T.hold('seed_carrot'); });
  const sw = await A.evaluate(() => T.slot('seed_carrot')); await A.keyboard.press('Digit' + (sw + 1)); await wait(150);
  const s0 = await A.evaluate(() => T.count('seed_carrot'));
  await clickTile(35, 28);
  const pl = await A.evaluate(() => { const o = T.w().floorAt(35, 28); return { crop: o.data.crop, n: T.count('seed_carrot'), st: Iles.farming.stage(o.data, T.s().time.minutes) }; });
  check('un clic avec une graine plante la culture (graine consommée)', pl.crop === 'carrot' && pl.n === s0 - 1 && pl.st === 0, pl);
  await clickTile(35, 28);
  check('on ne replante pas sur une culture existante', await A.evaluate(() => T.count('seed_carrot')) === s0 - 1);
  await clickTile(30, 20);
  check('planter hors parcelle est refusé sans consommer la graine', await A.evaluate(() => T.count('seed_carrot')) === s0 - 1);
  // croissance dans le temps
  const prog = await A.evaluate(() => {
    const o = T.w().floorAt(35, 28), t0 = o.data.t0, st = [], need = Iles.CROPS.carrot.days * 1440 / Iles.config.FARM_SPEED;
    for (const f of [0, 0.4, 0.7, 1.01]) st.push(Iles.farming.stage(o.data, t0 + need * f));
    return st;
  });
  check('4 stades de croissance : 0, 1, 2 puis mûr (3)', JSON.stringify(prog) === '[0,1,2,3]', prog);
  const imm = await A.evaluate(() => { const p = T.p(); p.x = 35 * 16 + 8; p.y = 29 * 16; T.w().now = T.s().time.minutes; return Iles.harvest.findInteractable(T.w(), p) === null; });
  check('une culture pas mûre ne propose pas de récolte', imm);
  // mûrir : avancer l'horloge, récolter avec E
  await A.evaluate(() => { T.s().time.minutes += 3 * 1440; });
  await wait(250);
  const tg = await A.evaluate(() => { const p = T.p(); p.x = 35 * 16 + 8; p.y = 29 * 16; return null; });
  await wait(300);
  const lab = await A.evaluate(() => T.p().target && T.p().target.label);
  check('mûre : l’invite « Récolter » apparaît', lab === 'Récolter', lab);
  await A.evaluate(() => { const p = T.p(); p.x = 34 * 16 + 8; p.y = 28 * 16 + 14; }); await wait(300);
  const lab2 = await A.evaluate(() => T.p().target && T.p().target.label);
  check('debout sur la case voisine de la parcelle, « Récolter » est proposé', lab2 === 'Récolter', lab2);
  await A.evaluate(() => T.w().drops.length = 0);
  await A.keyboard.press('KeyE'); await wait(900);
  const got = await A.evaluate(() => ({ carrots: T.count('carrot') + T.drops().filter(i => i === 'carrot').length, o: T.w().floorAt(35, 28).data.crop, drops: T.drops() }));
  check('E récolte : carottes obtenues, parcelle de nouveau vide', got.carrots >= 2 && got.carrots <= 3 && got.o === null, got);
  // toutes les cultures peuvent pousser et donner leur produit
  const all = await A.evaluate(() => {
    const out = [], w = T.w(), o = w.floorAt(36, 28);
    for (const k of Object.keys(Iles.CROPS)) {
      o.data = { crop: k, t0: T.s().time.minutes - 5000 };
      const p = T.p(); p.x = o.x; p.y = o.y + 8; w.drops.length = 0;
      const r = Iles.farming.harvest(T.s(), p, o, []);
      out.push(r.ok && w.drops.some(d => d.item === Iles.CROPS[k].item));
    }
    return out;
  });
  check('les 11 cultures se récoltent', all.length === 11 && all.every(Boolean), all);
  // retirer une parcelle plantée ne bloque pas
  const rm = await A.evaluate(() => { const o = T.w().floorAt(37, 28); o.data = { crop: 'wheat', t0: 0 }; const p = T.p(); p.x = 37 * 16 + 8; p.y = 29 * 16; return Iles.building.remove(T.s(), p, 37, 28, []).ok; });
  check('une parcelle plantée peut être retirée', rm);

  console.log('Viandes et butin des créatures');
  const loot = await A.evaluate(() => {
    const out = {};
    for (const plan of Object.keys(Iles.MEATS)) { const l = Iles.creatureLoot({ plan: plan, size: 1 }, () => 0.1); out[plan] = l.map(x => x.item); }
    return out;
  });
  check('chaque plan de corps a sa viande', loot.quad[0] === 'meat_quad' && loot.biped[0] === 'meat_biped' && loot.blob[0] === 'meat_blob' && loot.serpent[0] === 'meat_serpent' && loot.bug[0] === 'meat_bug', loot);
  check('butin supplémentaire : os, gelée, écaille, carapace', loot.quad[1] === 'bone' && loot.blob[1] === 'slime' && loot.serpent[1] === 'scale' && loot.bug[1] === 'chitin', loot);
  const kill = await A.evaluate(() => {
    const g = Iles.debug.game; g.travel('d:4242');
    const w = g.state.world, p = g.local;
    for (let i = 0; i < 40 && !(w.creatures && w.creatures.length); i++) { p.x += 40; Iles.creatures.update(w, [p], 1); g._stream(w, [p], 6); }
    const cr = w.creatures && w.creatures[0]; if (!cr) return { none: true };
    const S = Iles.creatureGen.species(w.D, cr.sp), n0 = w.drops.length;
    Iles.creatures.damage(w, cr, 99999, false, { x: cr.x - 3, y: cr.y }, 0, 0, [], 'p1');
    const items = w.drops.slice(n0).map(d => d.item);
    g.travel('home');
    return { plan: S.plan, items: items, want: Iles.MEATS[S.plan].item };
  });
  check('une vraie créature tuée laisse la viande de son plan', !kill.none && kill.items.includes(kill.want) && !kill.items.includes('meat'), kill);
  await inject(A);

  console.log('Vie et faim');
  const v0 = await A.evaluate(() => ({ hp: T.p().hp, hun: T.p().hun }));
  check('départ : vie pleine, bien nourri', v0.hp === 100 && v0.hun > 60, v0);
  await A.evaluate(() => { const p = T.p(); for (let i = 0; i < 600; i++) Iles.vitals.tick(p, 0.1); });
  const v1 = await A.evaluate(() => T.p().hun);
  check('la faim baisse avec le temps', v1 < v0.hun - 2, [v0.hun, v1]);
  const bars = await A.evaluate(() => { Iles.HUD.update(0.016); return { hp: document.getElementById('bar-hp').style.width, hun: document.getElementById('bar-hun').style.width, t: document.getElementById('txt-hun').textContent, shown: document.getElementById('vitals').offsetParent !== null }; });
  check('les barres de vie et de faim s’affichent dans le HUD', bars.shown && bars.hp === '100%' && /Faim/.test(bars.t) && parseFloat(bars.hun) < 100, bars);
  // manger au clic droit
  await A.evaluate(() => { const p = T.p(); p.hun = 20; p.hp = 70; p.inv.add('apple', 3); p.inv.add('sunflower', 2); p.inv.add('sage', 2); const i = T.hold('apple'); p.sel = i; });
  const ap = await A.evaluate(() => T.p().sel); await A.keyboard.press('Digit' + (ap + 1)); await wait(150);
  await clickTile(40, 30, 'right'); await wait(200);
  const e1 = await A.evaluate(() => ({ hun: T.p().hun, hp: T.p().hp, n: T.count('apple') }));
  check('clic droit avec une pomme : faim et vie remontent, 1 pomme consommée', Math.abs(e1.hun - 30) < 1 && Math.abs(e1.hp - 72) < 1 && e1.n === 2, e1);
  await wait(500);
  await A.evaluate(() => { const p = T.p(); p.inv.add('sunflower', 0); T.hold('sunflower'); });
  const sf = await A.evaluate(() => T.p().sel); await A.keyboard.press('Digit' + (sf + 1)); await wait(150);
  await clickTile(40, 30, 'right'); await wait(200);
  const e2 = await A.evaluate(() => ({ hp: T.p().hp, n: T.count('sunflower') }));
  check('le tournesol soigne de 5', Math.abs(e2.hp - 77) < 1 && e2.n === 1, e2);
  await wait(500);
  await A.evaluate(() => { T.hold('sage'); });
  const sg = await A.evaluate(() => T.p().sel); await A.keyboard.press('Digit' + (sg + 1)); await wait(150);
  await clickTile(40, 30, 'right'); await wait(200);
  const e3 = await A.evaluate(() => ({ regen: T.p().buff.regen, chip: document.getElementById('buffs').textContent }));
  check('la sauge donne une régénération (affichée dans le HUD)', e3.regen > 5, e3);
  await A.evaluate(() => { Iles.HUD.update(0.016); });
  check('l’effet apparaît dans le HUD', await A.evaluate(() => /Régénération/.test(document.getElementById('buffs').textContent)));
  const full = await A.evaluate(() => { const p = T.p(); p.hun = 100; p.hp = 100; p.buff.regen = 0; p.inv.add('apple', 1); T.hold('apple'); const n = T.count('apple'); const r = Iles.vitals.eat(T.s(), p, p.sel, []); return [r.ok, r.reason, n === T.count('apple')]; });
  check('rassasié : l’aliment n’est pas gaspillé', full[0] === false && full[1] === 'full' && full[2], full);
  // famine : jamais mortelle
  const st = await A.evaluate(() => { const p = T.p(); p.hun = 0; p.hp = 100; for (let i = 0; i < 6000; i++) Iles.vitals.tick(p, 0.1); return p.hp; });
  check('la famine fait baisser la vie jusqu’à un minimum, sans tuer', st === 10, st);
  const rg = await A.evaluate(() => { const p = T.p(); p.hun = 90; p.hp = 50; for (let i = 0; i < 300; i++) Iles.vitals.tick(p, 0.1); return p.hp; });
  check('bien nourri, la vie remonte toute seule', rg > 55, rg);

  console.log('Sauvegarde');
  await A.evaluate(() => { const p = T.p(); p.hp = 64; p.hun = 41; T.w().floorAt(38, 28) || T.put('plot', 38, 28); T.w().floorAt(38, 28).data = { crop: 'tomato', t0: 123 }; });
  await A.evaluate(() => Iles.debug.app.saveNow('test')); await A.reload(); await wait(600); await A.click('#btn-continue'); await wait(700); await inject(A);
  const ld = await A.evaluate(() => { const o = T.w().floorAt(38, 28); return { crop: o && o.data.crop, t0: o && o.data.t0, hp: Math.round(T.p().hp), hun: Math.round(T.p().hun) }; });
  check('cultures, vie et faim sont conservées après rechargement', ld.crop === 'tomato' && ld.t0 === 123 && ld.hp === 64 && ld.hun === 41, ld);

  console.log('Coop');
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
  check('l’invité voit la culture plantée par l’hôte', await until(B, () => { const o = Iles.debug.game.state.world.floorAt(38, 28); return !!(o && o.data && o.data.crop === 'tomato'); }, null, 6000));
  // l'invité plante et mange
  await A.evaluate(() => { const p = T.s().players.p2; p.inv.slots[0] = { id: 'seed_wheat', qty: 3 }; p.inv.slots[1] = { id: 'apple', qty: 3 }; p.sel = 0; p.x = 36 * 16 + 8; p.y = 30 * 16; p.hun = 30; });
  await B.waitForTimeout(600);
  await B.evaluate(() => Iles.debug.cam.snapTo(Iles.debug.game.local.x, Iles.debug.game.local.y - 8, 1280, 1024));
  await B.waitForTimeout(300);
  const bp = await B.evaluate(() => { const c = Iles.debug.cam, sc = Iles.debug.renderer.scale; return [(36 * 16 + 8 - c.rx) * sc, (28 * 16 + 8 - c.ry) * sc]; });
  await B.mouse.move(bp[0], bp[1]); await B.waitForTimeout(150); await B.mouse.down(); await B.waitForTimeout(200); await B.mouse.up();
  check('l’invité plante une graine (visible chez l’hôte)', await until(A, () => { const o = Iles.debug.game.state.world.floorAt(36, 28); return !!(o && o.data && o.data.crop === 'wheat'); }, null, 5000));
  check('…et chez l’invité', await until(B, () => { const o = Iles.debug.game.state.world.floorAt(36, 28); return !!(o && o.data && o.data.crop === 'wheat'); }, null, 5000));
  await B.keyboard.press('Digit2'); await B.waitForTimeout(300);
  await B.mouse.move(bp[0] + 60, bp[1] + 40); await B.waitForTimeout(100); await B.mouse.down({ button: 'right' }); await B.waitForTimeout(200); await B.mouse.up({ button: 'right' });
  check('l’invité mange : sa faim remonte chez l’hôte et chez lui', await until(A, () => Iles.debug.game.state.players.p2.hun > 35, null, 5000) && await until(B, () => Iles.debug.game.local.hun > 35, null, 5000));
  check('la barre de faim de l’invité s’affiche', await B.evaluate(() => { Iles.HUD.update(0.016); return /Faim 3|Faim 4/.test(document.getElementById('txt-hun').textContent); }));

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
