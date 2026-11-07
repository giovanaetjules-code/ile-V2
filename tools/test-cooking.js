/*
 * Test « Food Update » étape D : table de cuisine (mortier, mixeur, poêle, marmite, table à pâte), four, plats procéduraux,
 * mélange des couleurs, parts, nom personnalisé, livre de recettes (multi-étapes, manques), interface, sauvegarde, coop.
 *   node tools/test-cooking.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

process.on('unhandledRejection', e => { console.log('ERREURS CAPTURÉES: ' + JSON.stringify(globalThis.__errs || []) + ' / ' + e.message); process.exit(1); });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-3d-apis'] });
  const errors = []; globalThis.__errs = errors;
  async function open(tag) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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
    const g = Iles.debug.game, C = Iles.cooking;
    window.T = {
      p: () => g.local, s: () => g.state, w: () => g.state.world,
      count: (id) => g.local.inv.count(id),
      give: (id, n) => g.local.inv.add(id, n),
      clear: () => { g.local.inv.slots.fill(null); g.local.inv.rev++; },
      at: (x, y) => { const p = g.local; p.x = x * 16 + 8; p.y = y * 16 + 12; },
      cook: (st, items, form, name) => { const ev = []; const r = C.make(g.state, g.local, { st, items, form, name }, ev); return r; },
      dishes: () => g.local.inv.slots.filter(s => s && s.id.indexOf('fd:') === 0).map(s => s.id),
      find: (nm) => { const s = g.local.inv.slots.find(s => s && Iles.ITEMS[s.id] && Iles.ITEMS[s.id].name === nm); return s ? s.id : null; },
      d: (id) => C.dish(id),
    };
  });
  await inject(A);

  console.log('Contenu');
  const c = await A.evaluate(() => ({
    table: Iles.crafting.BY_ID.cook_table && Iles.crafting.BY_ID.cook_table.station, oven: Iles.crafting.BY_ID.oven && Iles.crafting.BY_ID.oven.station,
    book: Iles.crafting.BY_ID.recipe_book && Iles.crafting.BY_ID.recipe_book.station, crystal: Iles.ITEMS.crystal.name,
    act: [Iles.OBJECTS.cook_table.action, Iles.OBJECTS.oven.action], flour: !!Iles.ITEMS.flour, st: Object.keys(Iles.cooking.STATIONS).length,
    bad: [Iles.ITEMS['fd:junk'], Iles.ITEMS['fd:juice:zzzzzz:1:1:0:0:1:1::X'], Iles.ITEMS['fd:tart:ffffff:1:1:0:0:9:9::X']].map(x => !!x),
    guard: T.p().inv.add('fd:juice:ffffff:1:1:0:0:1:1:apple*1:Faux:plat', 1),
  }));
  check('table, four et livre se fabriquent (établi, établi, à la main)', c.table === 'bench' && c.oven === 'bench' && c.book === 'hand', c);
  check('les stations ouvrent la cuisine avec X', c.act[0] === 'cook' && c.act[1] === 'cook' && c.st === 6, c);
  check('le cristal lunaire garde son nom ; la farine existe', c.crystal === 'Cristal lunaire' && c.flour);
  check('un identifiant de plat falsifié est refusé', c.bad.every(b => !b) && c.guard === 1, c);

  console.log('Couleurs et mélanges');
  const col = await A.evaluate(() => {
    const P = Iles.cooking.plan, id = (it) => P('mixer', it).outs[0].id, hex = (i) => T.d(i).c, rgb = (h) => [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16));
    const red = rgb('d9423e'), blue = rgb('4f6ae0');
    const mix11 = rgb(hex(id([['tomato', 1], ['blueberry', 1]]))), mix31 = rgb(hex(id([['tomato', 3], ['blueberry', 1]]))), mix13 = rgb(hex(id([['tomato', 1], ['blueberry', 3]])));
    const orange = rgb(hex(id([['tomato', 1], ['sunflower', 1]])));
    return { mix11, mix31, mix13, orange, red, blue };
  });
  check('rouge + bleu = violet (r et b dominent g)', col.mix11[0] > col.mix11[1] + 30 && col.mix11[2] > col.mix11[1] + 30, col.mix11);
  check('les proportions comptent : 3 tomates + 1 myrtille est plus rouge que l’inverse', col.mix31[0] > col.mix13[0] && col.mix31[2] < col.mix13[2], col);
  check('rouge + jaune = orangé', col.orange[0] > 200 && col.orange[1] > col.mix11[1] && col.orange[2] < 120, col.orange);

  console.log('Stations : règles');
  await A.evaluate(() => { T.w().addStructure('cook_table', 36, 28); T.w().addStructure('oven', 41, 28); T.clear(); T.at(36, 29); });
  const near = await A.evaluate(() => { T.give('wheat', 3); return [T.cook('mortar', [['wheat', 1]]).ok, T.cook('mortar', [['apple', 1]]).reason]; });
  check('à la table, le mortier marche ; il faut avoir l’ingrédient', near[0] === true && near[1] === 'missing', near);
  const far = await A.evaluate(() => { T.at(50, 20); const r = T.cook('mortar', [['wheat', 1]]); T.at(36, 29); return r.reason; });
  check('loin de la table : refusé', far === 'station', far);
  const mortar = await A.evaluate(() => {
    T.clear(); T.give('wheat', 4); T.give('crystal', 2); T.give('sage', 2);
    const r1 = T.cook('mortar', [['wheat', 2]]), r2 = T.cook('mortar', [['crystal', 1]]), r3 = T.cook('mortar', [['sage', 1]]);
    return { flour: T.count('flour'), crystalPow: T.find('Poudre de cristal lunaire'), sagePow: T.find('Poudre de sauge'), r: [r1.ok, r2.ok, r3.ok], cry: T.count('crystal') };
  });
  check('mortier : blé → farine (1 pour 1), cristal → poudre de cristal lunaire, sauge → poudre', mortar.flour === 2 && !!mortar.crystalPow && !!mortar.sagePow && mortar.cry === 1, mortar);

  console.log('Mixeur et jus');
  const mix = await A.evaluate(() => {
    T.clear(); T.give('strawberry', 3); T.give('grape', 2); T.give('apple', 2); T.give('meat_quad', 1);
    const bad = T.cook('mixer', [['meat_quad', 1]]).reason;
    const r = T.cook('mixer', [['strawberry', 2], ['grape', 1]]), j = T.find('Jus énergisant'), d = j && T.d(j);
    const r2 = T.cook('mixer', [['apple', 2]]), a = T.find('Jus de pomme');
    return { bad, ok: r.ok, qty: T.count(j), special: !!j, speed: d && d.sp, hun: d && d.hun, applej: !!a, left: T.count('strawberry') };
  });
  check('la viande ne se mixe pas', mix.bad === 'badItem', mix);
  check('mixeur : 3 fruits → 3 jus, nom connu « Jus énergisant », effet vitesse', mix.ok && mix.qty === 3 && mix.special && mix.speed > 0 && mix.left === 1, mix);
  check('jus de pomme : nom procédural', mix.applej);

  console.log('Poêle');
  const pan = await A.evaluate(() => {
    T.clear(); T.give('meat_quad', 2); T.give('carrot', 1);
    const r = T.cook('pan', [['meat_quad', 2], ['carrot', 1]]), g = T.find('Grillade de gigot'), d = g && T.d(g);
    return { ok: r.ok, n: T.count(g), name: !!g, hun: d && d.hun, raw: Iles.FOOD.meat_quad.hun, carrot: !!T.find('Grillade de carotte'), col: d && d.c };
  });
  check('poêle : transformation réelle (gigot → grillade), plus nourrissante, couleur brunie', pan.ok && pan.name && pan.n === 2 && pan.hun > pan.raw && pan.carrot && pan.col !== 'b8453f', pan);

  console.log('Marmite : soupes et spaghetti');
  const pot = await A.evaluate(() => {
    T.clear(); T.give('tomato', 3); T.give('mushroom', 2); T.give('sage', 2); T.give('carrot', 2);
    const noLiq = T.cook('pot', [['carrot', 2]]).reason;
    T.cook('mixer', [['tomato', 2]]);
    const juice = T.find('Jus de tomate'), noSolid = T.cook('pot', [[juice, 1]]).reason;
    const r = T.cook('pot', [[juice, 1], ['carrot', 1], ['mushroom', 1]]), s = T.find('Soupe de carotte et champignons des bois') || T.dishes().map(x => Iles.ITEMS[x].name).find(n => /^Soupe/.test(n));
    T.cook('mixer', [['tomato', 1]]);
    const j2 = T.find('Jus de tomate');
    const r2 = T.cook('pot', [[j2, 1], ['mushroom', 1], ['sage', 1]]), forest = T.find('Soupe forestière');
    const f = forest && T.d(forest);
    return { noLiq, noSolid, ok: r.ok, soup: !!s, forest: !!forest, parts: f && f.m, hp: f && f.hp, hun: f && f.hun };
  });
  check('marmite : il faut un liquide puis des solides', pot.noLiq === 'noLiquid' && pot.noSolid === 'noSolid', pot);
  check('soupe procédurale + « Soupe forestière » (champignon + sauge), plusieurs parts', pot.ok && pot.soup && pot.forest && pot.parts >= 2 && pot.hun > 0, pot);

  console.log('Table à pâte : tarte, spaghetti, pain');
  const dough = await A.evaluate(() => {
    T.clear(); T.give('wheat', 6); T.give('sunflower', 6); T.give('strawberry', 4); T.give('crystal', 2);
    T.cook('mortar', [['wheat', 6]]); T.cook('mixer', [['strawberry', 2]]);
    const j = T.find('Jus de fraise');
    const noF = T.cook('dough', [[j, 1]], 'tart').reason, noL = T.cook('dough', [['flour', 1]], 'tart').reason, noForm = T.cook('dough', [['flour', 1], [j, 1]]).reason;
    const r = T.cook('dough', [['flour', 1], [j, 1], ['sunflower', 2]], 'tart'), tart = T.find('Tarte au tournesol'), d = tart && T.d(tart);
    return { noF, noL, noForm, ok: r.ok, tart: !!tart, parts: d && d.m, hp: d && d.hp, hun: d && d.hun, id: tart, stack: tart && Iles.ITEMS[tart].stack };
  });
  check('pâte : farine et liquide obligatoires, forme à choisir', dough.noF === 'noFlour' && dough.noL === 'noLiquid' && dough.noForm === 'noForm', dough);
  check('tarte au tournesol : 4 parts, +10 PV par part, nourrissante', dough.ok && dough.tart && dough.parts === 4 && dough.hp === 10 && dough.hun >= 8 && dough.stack === 1, dough);
  const eat = await A.evaluate((id) => {
    const p = T.p(), out = []; p.hun = 10; p.hp = 20; p.sel = p.inv.slots.findIndex(s => s && s.id === id);
    for (let i = 0; i < 4; i++) {
      const slot = p.inv.slots.findIndex(s => s && s.id.indexOf('fd:tart') === 0); if (slot < 0) { out.push('gone'); break; }
      p.sel = slot; const hp0 = p.hp, r = Iles.vitals.eat(T.s(), p, slot, []);
      out.push([r.ok, Math.round(p.hp - hp0), (T.p().inv.slots.find(s => s && s.id.indexOf('fd:tart') === 0) || {}).id ? Iles.cooking.dish(T.p().inv.slots.find(s => s && s.id.indexOf('fd:tart') === 0).id).p : 0]);
    }
    return { out, left: T.p().inv.slots.filter(s => s && s.id.indexOf('fd:tart') === 0).length };
  }, dough.id);
  check('manger la tarte part par part : +10 PV chaque fois, 3, 2, 1 parts puis disparue', JSON.stringify(eat.out) === '[[true,10,3],[true,10,2],[true,10,1],[true,10,0]]' && eat.left === 0, eat);

  const sp = await A.evaluate(() => {
    T.clear(); T.give('wheat', 4); T.give('tomato', 4); T.give('crystal', 2); T.give('apple', 2);
    T.cook('mortar', [['wheat', 4]]); T.cook('mixer', [['tomato', 3]]); const j = T.find('Jus de tomate');
    const r = T.cook('dough', [['flour', 2], [j, 1]], 'spag'), pasta = T.find('Pâtes fraîches');
    const noLiq = T.cook('pot', [[pasta, 1]]).reason;
    const r2 = T.cook('pot', [[pasta, 1], [j, 1]]), s = T.find('Spaghetti à la tomate'), d = s && T.d(s);
    // spaghetti lunaires : avec poudre de cristal
    T.cook('mortar', [['crystal', 1]]); const pow = T.find('Poudre de cristal lunaire');
    T.cook('mixer', [['tomato', 1]]); const j2 = T.find('Jus de tomate'); T.give(j2, 3);
    const r3 = T.cook('dough', [['flour', 2], [j2, 1]], 'spag'); const pasta2 = T.find('Pâtes fraîches');
    const r4 = T.cook('pot', [[pasta2, 1], [j2 || 'x', 1], [pow, 1]]);
    return { r: r.ok, pasta: !!pasta, noLiq, r2: r2.ok, plain: !!s, parts: d && d.m, moon: !!T.find('Spaghetti lunaires'), r4: r4 };
  });
  check('spaghetti : pâtes fraîches → marmite avec un liquide pour la sauce', sp.r && sp.pasta && sp.noLiq === 'noLiquid' && sp.r2 && sp.plain && sp.parts === 2, sp);
  check('« Spaghetti lunaires » avec de la poudre de cristal', sp.moon, sp);

  const br = await A.evaluate(() => {
    T.clear(); T.give('wheat', 4); T.give('apple', 3); T.give('crystal', 2); T.give('wood', 3);
    T.cook('mortar', [['wheat', 3]]); T.cook('mortar', [['crystal', 1]]); T.cook('mixer', [['apple', 2]]);
    const j = T.find('Jus de pomme'), pow = T.find('Poudre de cristal lunaire');
    const r = T.cook('dough', [['flour', 2], [j, 1], [pow, 1]], 'bread'), raw = T.find('Pâte à pain');
    T.at(34, 29); const noOven = T.cook('oven', [[raw, 1], ['wood', 1]]);
    T.at(41, 29);
    const noFuel = T.cook('oven', [[raw, 1]]).reason, badFuel = T.cook('oven', [[raw, 1], ['apple', 1]]).reason;
    const ok = T.cook('oven', [[raw, 1], ['wood', 1]]), loaf = T.find('Pain de cristal'), d = loaf && T.d(loaf);
    return { r: r.ok, raw: !!raw, noOven: noOven.reason, noFuel, badFuel, ok: ok.ok, loaf: !!loaf, parts: d && d.m, wood: T.count('wood'), rawLeft: T.count(raw) };
  });
  check('le pain cru ne se cuit qu’au four (refusé à la table)', br.r && br.raw && br.noOven === 'station', br);
  check('four : combustible obligatoire, une pâte → un pain à 4 parts, « Pain de cristal »', br.noFuel === 'noBread' && br.badFuel === 'badItem' && br.ok && br.loaf && br.parts === 4 && br.wood === 2 && br.rawLeft === 0, br);
  const loaf = await A.evaluate(() => {
    const id = T.find('Pain de cristal'), p = T.p(); p.hun = 20; const slot = p.inv.slots.findIndex(s => s && s.id === id);
    const r = Iles.vitals.eat(T.s(), p, slot, []), now = p.inv.slots.find(s => s && s.id.indexOf('fd:bread') === 0);
    return { ok: r.ok, parts: now && Iles.cooking.dish(now.id).p, hun: Math.round(p.hun - 20) };
  });
  check('le pain se mange progressivement (3 parts restantes)', loaf.ok && loaf.parts === 3 && loaf.hun > 5, loaf);

  console.log('Nom personnalisé');
  const nmz = await A.evaluate(() => {
    T.clear(); T.at(36, 29); T.give('apple', 3);
    const r = T.cook('mixer', [['apple', 2]], null, 'Nectar du <b>Roi</b>: 100% !'), n = r.name;
    return { n, ok: r.ok, stored: !!T.find(n), id: T.dishes()[0] };
  });
  check('le nom du plat est personnalisable et nettoyé', nmz.ok && nmz.n === 'Nectar du bRoib 100' && nmz.stored, nmz);

  console.log('Sac plein et annulation');
  const full = await A.evaluate(() => {
    T.clear(); T.give('apple', 2); for (let i = 0; i < 29; i++) T.give('stone' + '', 99 * 0 + 1) ; const p = T.p();
    for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) p.inv.slots[i] = { id: i % 2 ? 'wood' : 'stone', qty: 1 }; p.inv.slots[0] = { id: 'apple', qty: 2 };
    const free = p.inv.slots.filter(s => !s).length, before = T.count('apple'), r = T.cook('mixer', [['apple', 1]]);
    return { free, r: r.ok ? 'ok' : r.reason, kept: T.count('apple') === before };
  });
  check('sac plein : la préparation réussit en libérant une case ou est annulée sans perte', full.r === 'ok' || (full.r === 'full' && full.kept), full);

  console.log('Livre de recettes');
  const bk = await A.evaluate(() => {
    T.clear(); T.at(36, 29); T.give('wheat', 2); T.give('strawberry', 3); T.give('sunflower', 3);
    T.cook('mortar', [['wheat', 1]]); const noBook = (T.p().book || []).length;
    T.give('recipe_book', 1);
    T.cook('mixer', [['strawberry', 2]]); const j = T.find('Jus de fraise');
    T.cook('mortar', [['wheat', 1]]);
    T.cook('dough', [['flour', 1], [j, 1], ['sunflower', 2]], 'tart');
    return { noBook, n: (T.p().book || []).length, sts: (T.p().book || []).map(e => e.st), tart: T.find('Tarte au tournesol'), rev: T.p().bookRev };
  });
  check('sans livre, rien n’est noté ; avec le livre, chaque étape est enregistrée', bk.noBook === 0 && bk.n === 3 && bk.sts.join() === 'dough,mortar,mixer', bk);
  const rp = await A.evaluate(() => {
    const p = T.p(), tid = T.find('Tarte au tournesol');
    // on mange tout pour repartir de zéro, puis on ne garde que des ingrédients bruts
    T.clear(); T.give('recipe_book', 1); T.give('wheat', 1); T.give('strawberry', 2); T.give('sunflower', 2);
    const plan = Iles.cooking.planRepro(p, tid);
    const r = Iles.cooking.repro(T.s(), p, tid, []);
    return { ok: plan.ok, steps: plan.steps.map(s => s.st), stations: plan.stations, r: r.ok, same: !!T.dishes().find(x => x === tid), name: r.name };
  });
  check('un clic reproduit un plat en plusieurs étapes dans le bon ordre (farine → jus → tarte)', rp.ok && rp.steps.join() === 'mortar,mixer,dough' && rp.r && rp.same, rp);
  const ms = await A.evaluate(() => {
    const p = T.p(), tid = p.book.find(e => e.st === 'dough').o;
    T.clear(); T.give('recipe_book', 1); T.give('wheat', 1); T.give('strawberry', 2);
    const plan = Iles.cooking.planRepro(p, tid), r = Iles.cooking.repro(T.s(), p, tid, []);
    T.give('sunflower', 2); T.at(60, 10); const far = Iles.cooking.repro(T.s(), p, tid, []);
    return { ok: plan.ok, missing: plan.missing, r: r.reason, rm: r.missing, far: far.reason, kept: T.count('wheat') === 1 && T.count('strawberry') === 2 };
  });
  check('ingrédients manquants affichés (tournesol), rien n’est consommé', !ms.ok && ms.missing.sunflower === 2 && ms.r === 'missing' && ms.kept, ms);
  check('reproduire loin de la table est refusé', ms.far === 'station', ms);

  console.log('Interface (vrais clics)');
  await A.evaluate(() => { T.clear(); T.at(36, 29); T.give('wheat', 3); T.give('strawberry', 2); T.give('recipe_book', 1); });
  await A.keyboard.press('KeyE'); await wait(500);
  check('X devant la table ouvre l’écran de cuisine', await A.evaluate(() => Iles.Menu.screen === 'cook'));
  const tabs = await A.evaluate(() => [...document.querySelectorAll('#cook-stations .ck-st b')].map(b => b.textContent));
  check('4 stations affichées : mortier, mixer, poêle, pot (+ table à pâte et livre)', tabs.join('|') === 'MORTIER|MIXER MÉCANIQUE|POÊLE|POT / CASSEROLE' && await A.evaluate(() => document.querySelectorAll('#cook-forms .ck-form').length === 3 && !!document.getElementById('cook-bookpage')), tabs);
  const slotOf = (id) => A.evaluate((id) => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === id), id);
  const i = await slotOf('wheat');
  await A.click('#cook-inv .ck-slot[data-id="wheat"]'); await wait(120);
  const prev = await A.evaluate(() => ({ bowl: document.querySelectorAll('#cook-shelf .ck-slot[data-id]').length, prev: document.getElementById('cook-prev').textContent, dis: document.getElementById('btn-cook-make').disabled }));
  check('clic sur le blé : il entre dans le bol, l’aperçu annonce la farine', prev.bowl === 1 && /Farine/.test(prev.prev) && !prev.dis, prev);
  await A.click('#btn-cook-make'); await wait(200);
  check('« Préparer » : farine dans le sac', await A.evaluate(() => T.count('flour') === 1 && T.count('wheat') === 2));
  await A.click('#cook-stations [data-t="mixer"]'); await wait(100);
  await A.click('#cook-inv .ck-slot[data-id="strawberry"]'); await A.click('#cook-inv .ck-slot[data-id="strawberry"]'); await wait(100);
  await A.click('#btn-cook-name'); await A.fill('#cook-name', 'Rubis'); await wait(100);
  check('l’aperçu suit le nom saisi', await A.evaluate(() => /Rubis/.test(document.getElementById('cook-prev').textContent)));
  await A.click('#btn-cook-make'); await wait(200);
  check('jus personnalisé « Rubis » ×2 dans le sac', await A.evaluate(() => { const id = T.find('Rubis'); return !!id && T.count(id) === 2; }));
  const wrong = await A.evaluate(() => { const d = Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'flour'); return d; });
  await A.click('#cook-stations [data-t="mortar"]'); await wait(100);
  const bad = await A.evaluate(() => document.querySelector('#cook-inv .ck-slot.dim') !== null);
  check('les objets inadaptés à la station sont grisés', bad);
  await A.click('#cook-book .bk-entry >> nth=-1'); await wait(150);
  const bookUi = await A.evaluate(() => ({ n: document.querySelectorAll('#cook-book .bk-entry').length, sel: document.querySelectorAll('#cook-book .bk-entry.on').length, btn: document.getElementById('btn-cook-repro').disabled, miss: document.getElementById('cook-miss').textContent }));
  check('le livre liste les recettes, une est sélectionnable (bouton Refaire / étapes)', bookUi.n >= 2 && bookUi.sel === 1 && (!bookUi.btn || /Étapes|manque|Manque/.test(bookUi.miss)), bookUi);
  await A.keyboard.press('Escape'); await wait(200);
  check('Échap ferme la cuisine', await A.evaluate(() => Iles.Menu.screen === 'playing'));
  await A.evaluate(() => { T.at(42, 29); }); await wait(200);
  await A.keyboard.press('KeyE'); await wait(400);
  const ov = await A.evaluate(() => ({ s: Iles.Menu.screen, tabs: [...document.querySelectorAll('#cook-stations .ck-st b')].map(b => b.textContent).join('|') }));
  check('X devant le four : une seule station (Four)', ov.s === 'cook' && /^FOUR/i.test(ov.tabs) && ov.tabs.indexOf('|') < 0, ov);
  await A.keyboard.press('Escape'); await wait(200);
  // livre en main : clic droit
  await A.evaluate(() => { T.at(30, 20); const p = T.p(); p.inv.slots[0] = { id: 'recipe_book', qty: 1 }; p.sel = 0; });
  await A.mouse.move(500, 300); await A.mouse.down({ button: 'right' }); await wait(120); await A.mouse.up({ button: 'right' }); await wait(300);
  const bk2 = await A.evaluate(() => ({ s: Iles.Menu.screen, st: document.querySelectorAll('#cook-stations .ck-st').length, off: document.querySelectorAll('#cook-stations .ck-st.off').length }));
  check('livre en main + clic droit : ouvre le livre (sans table)', bk2.s === 'cook' && bk2.st > 0 && bk2.off === bk2.st, bk2);
  await A.keyboard.press('Escape'); await wait(200);

  console.log('Sauvegarde');
  const sv = await A.evaluate(() => { T.clear(); T.give('recipe_book', 1); T.give('apple', 2); T.at(36, 29); T.cook('mixer', [['apple', 2]], null, 'Nectar doré'); return { book: T.p().book.length, id: T.find('Nectar doré') }; });
  await A.evaluate(() => Iles.debug.app.saveNow('test')); await A.reload(); await wait(600); await A.click('#btn-continue'); await wait(700); await inject(A);
  const ld = await A.evaluate((id) => ({ book: T.p().book.length, has: !!T.find('Nectar doré'), same: T.p().inv.slots.some(s => s && s.id === id), table: !!T.w().structureAt(36, 28) }), sv.id);
  check('livre, plats colorés et stations conservés après rechargement', ld.book === sv.book && ld.has && ld.same && ld.table, ld);

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
  check('l’invité voit la table de cuisine de l’hôte', await until(B, () => { const w = Iles.debug.game.state.world; const o = w.structureAt(36, 28); return !!o && o.type === 'cook_table'; }, null, 6000));
  await A.evaluate(() => { const p = T.s().players.p2; p.x = 36 * 16 + 8; p.y = 31 * 16; p.inv.slots[0] = { id: 'recipe_book', qty: 1 }; p.inv.slots[1] = { id: 'strawberry', qty: 3 }; p.inv.slots[2] = { id: 'grape', qty: 2 }; p.inv.rev++; });
  await B.waitForTimeout(700);
  const gr = await B.evaluate(() => new Promise(res => { Iles.Net.command({ t: 'cook', st: 'mixer', items: [['strawberry', 2], ['grape', 1]], form: null, name: '' }, res); }));
  check('l’invité cuisine (exécuté par l’hôte) : « Jus énergisant »', gr.ok && gr.name === 'Jus énergisant', gr);
  check('le jus coloré arrive dans le sac de l’invité', await until(B, () => Iles.debug.game.local.inv.slots.some(s => s && s.id.indexOf('fd:juice') === 0), null, 5000));
  check('le livre de l’invité est synchronisé (et pas mélangé avec celui de l’hôte)', await until(B, () => (Iles.debug.game.local.book || []).length === 1, null, 5000) && await A.evaluate(() => T.p().book.every(e => e.nm !== 'Jus énergisant')));
  const icon = await B.evaluate(() => { const id = Iles.debug.game.local.inv.slots.find(s => s && s.id.indexOf('fd:juice') === 0).id; return !!Iles.debug.renderer.S.iconURL[id] && Iles.ITEMS[id].name; });
  check('l’icône et le nom du plat existent chez l’invité', icon === 'Jus énergisant', icon);

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
