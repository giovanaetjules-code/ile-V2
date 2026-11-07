/*
 * Tests du crafting dans Chromium : logique pure (sans DOM), puis interface réelle (clavier + clics), sauvegarde, lumière.
 *   node tools/test-crafting.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const CRAFT = async (id) => { await E((i) => Iles.CraftingUI.select(i), id); await page.click('#craft-do'); }; // choisit la recette puis clique « Fabriquer »
  const wait = ms => page.waitForTimeout(ms);
  const shot = n => page.screenshot({ path: path.join(OUT, n) });

  await page.goto(URL); await wait(400);

  console.log('Logique de fabrication (sans interface)');
  const L = await E(() => {
    const I = Iles, r = {};
    const fresh = () => { const g = new I.Game(); g.newGame(); return g; };
    const inv = (g) => JSON.stringify(g.local.inv.toJSON());

    // 1. planche
    let g = fresh(), p = g.local, ev = [];
    p.inv.add('wood', 1);
    let res = I.crafting.craft(g.state, p, 'plank', 'hand', ev);
    r.plank = { ok: res.ok, plank: p.inv.count('plank'), wood: p.inv.count('wood'), evt: ev.some(e => e.type === 'craft') };

    // 2. ingrédients manquants : rien ne change
    g = fresh(); p = g.local; p.inv.add('fiber', 2); const before2 = inv(g);
    res = I.crafting.craft(g.state, p, 'rope', 'hand', []);
    r.missing = { ok: res.ok, reason: res.reason, same: inv(g) === before2 };

    // 3. sac plein : le résultat ne tient pas -> inventaire intact
    g = fresh(); p = g.local; p.inv.add('fiber', 5);
    for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) p.inv.slots[i] = { id: 'stone', qty: 99 };
    const before3 = inv(g);
    res = I.crafting.craft(g.state, p, 'rope', 'hand', []);
    r.full = { ok: res.ok, reason: res.reason, same: inv(g) === before3, fiber: p.inv.count('fiber') };

    // 4. déblocage + établi requis
    g = fresh(); p = g.local; ev = [];
    r.knownBefore = I.crafting.isKnown(g.state, I.crafting.BY_ID.axe_copper);
    p.inv.add('copper_ore', 3); p.inv.add('copper_bar', 2); p.inv.add('plank', 2); p.inv.add('rope', 1);
    g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    const evs = g.takeEvents();
    r.learn = { known: I.crafting.isKnown(g.state, I.crafting.BY_ID.axe_copper), event: evs.some(e => e.type === 'learn' && e.recipe === 'axe_copper'), saved: g.state.progress.recipes.includes('axe_copper') };
    res = I.crafting.craft(g.state, p, 'axe_copper', 'hand', []);
    r.stationHand = { ok: res.ok, reason: res.reason };
    res = I.crafting.craft(g.state, p, 'axe_copper', 'bench', []);
    r.bench = { ok: res.ok, axe: p.inv.count('axe_copper'), bar: p.inv.count('copper_bar'), ore: p.inv.count('copper_ore'), plank: p.inv.count('plank'), rope: p.inv.count('rope') };

    // 5. recette non découverte refusée
    g = fresh(); p = g.local; p.inv.add('plank', 2); p.inv.add('rope', 1); p.inv.add('copper_bar', 3);
    res = I.crafting.craft(g.state, p, 'pickaxe_copper', 'bench', []);
    r.locked = { ok: res.ok, reason: res.reason };

    // 6. sac renforcé : une seule fois
    g = fresh(); p = g.local;
    p.inv.add('rope', 6); p.inv.add('plank', 8); p.inv.add('fiber', 12);
    g.step({ p1: I.Game.NEUTRAL }, 1 / 60); // découvre la recette (corde possédée)
    res = I.crafting.craft(g.state, p, 'bag2', 'bench', []);
    const sizeAfter = p.inv.size;
    const res2 = I.crafting.craft(g.state, p, 'bag2', 'bench', []);
    r.bag = { ok: res.ok, size: sizeAfter, second: res2.reason, rope: p.inv.count('rope'), plank: p.inv.count('plank'), fiber: p.inv.count('fiber'), flag: g.state.progress.flags.bag2 };
    const snap = JSON.parse(JSON.stringify(g.snapshot())); const g2 = new I.Game(); g2.loadSnapshot(snap);
    r.bagReload = { size: g2.local.inv.size, flag: g2.state.progress.flags.bag2, recipes: g2.state.progress.recipes };

    // 7. outils : puissance et palier
    function stand(g, o, dy) { const p = g.local; p.x = o.x; p.y = o.y + dy; return p; }
    function swingAt(g, o, cy, frames) {
      const p = g.local; let ev = [];
      for (let i = 0; i < frames; i++) { g.step({ p1: { mx: 0, my: 0, dash: false, use: true, aim: { x: o.x, y: o.y + cy }, interact: false, hotbar: null } }, 1 / 60); ev = ev.concat(g.takeEvents()); }
      return ev;
    }
    g = fresh(); p = g.local; let w = g.state.world;
    const crystal = w.objects.find(o => o.type === 'crystal' && !I.collision.isBlocked(w, { x: o.x, y: o.y + 6.2, hw: 4, hh: 3 }));
    stand(g, crystal, 6.2); p.sel = 1;
    let evs2 = swingAt(g, crystal, -6, 60);
    r.crystalWeak = { hp: w.hpOf(crystal), clank: evs2.some(e => e.type === 'clank'), msg: evs2.some(e => e.type === 'msg' && /faible/.test(e.text)) };
    p.inv.slots[1] = { id: 'pickaxe_copper', qty: 1 };
    evs2 = swingAt(g, crystal, -6, 25);
    r.crystalStrong = { hp: w.hpOf(crystal) };
    g = fresh(); p = g.local; w = g.state.world;
    const tree = w.objects.find(o => o.type === 'tree_oak' && !I.collision.isBlocked(w, { x: o.x, y: o.y + 7, hw: 4, hh: 3 }));
    stand(g, tree, 7); p.inv.slots[0] = { id: 'axe_copper', qty: 1 }; p.sel = 0;
    const t0 = w.hpOf(tree);
    // ~0,28 s par coup : au bout de 0,5 s on doit avoir donné 1 coup de puissance 2 (2 coups = abattu)
    swingAt(g, tree, -9, 26);
    r.copperAxe = { hp0: t0, hpAfter1: w.hpOf(tree) };
    swingAt(g, tree, -9, 30);
    r.copperAxe.dep = w.isDepleted(tree);

    // 8. recettes : cohérence des données
    r.data = I.crafting.RECIPES.every(rc => rc.ins.every(i => I.ITEMS[i[0]]) && (rc.kind === 'upgrade' || I.ITEMS[rc.out.id]));
    r.icons = Object.keys(I.ITEMS).every(id => !!Iles.debug.renderer.S.icons[id]);
    return r;
  });
  check('planche : 1 bois → 2 planches', L.plank.ok && L.plank.plank === 2 && L.plank.wood === 0 && L.plank.evt, L.plank);
  check('ingrédients manquants : refus et inventaire intact', !L.missing.ok && L.missing.reason === 'ingredients' && L.missing.same, L.missing);
  check('sac plein : refus et ingrédients non perdus', !L.full.ok && L.full.reason === 'full' && L.full.same && L.full.fiber === 5, L.full);
  check('recettes du cuivre inconnues au départ', L.knownBefore === false);
  check('posséder du minerai de cuivre débloque la recette (+ événement + sauvegardée)', L.learn.known && L.learn.event && L.learn.saved, L.learn);
  check('recette d’établi refusée « à la main »', !L.stationHand.ok && L.stationHand.reason === 'station', L.stationHand);
  check('hache en cuivre fabriquée à l’établi, ingrédients consommés', L.bench.ok && L.bench.axe === 1 && L.bench.bar === 0 && L.bench.plank === 0 && L.bench.rope === 0 && L.bench.ore === 3, L.bench);
  check('recette non découverte refusée', !L.locked.ok && L.locked.reason === 'locked', L.locked);
  check('sac renforcé : 24 → 32 cases, ingrédients consommés', L.bag.ok && L.bag.size === 32 && L.bag.rope === 3 && L.bag.plank === 4 && L.bag.fiber === 6, L.bag);
  check('sac renforcé : une seule fois', L.bag.second === 'done', L.bag);
  check('sac renforcé conservé par la sauvegarde (taille, drapeau, recettes)', L.bagReload.size === 32 && L.bagReload.flag === true && L.bagReload.recipes.includes('bag2'), L.bagReload);
  check('cristal : la pioche de départ est trop faible (message + aucun dégât)', L.crystalWeak.hp === 5 && L.crystalWeak.clank && L.crystalWeak.msg, L.crystalWeak);
  check('cristal : la pioche en cuivre le casse (puissance 2)', L.crystalStrong.hp < 5, L.crystalStrong);
  check('hache en cuivre : 2 points de dégâts par coup', L.copperAxe.hp0 === 4 && L.copperAxe.hpAfter1 === 2, L.copperAxe);
  check('hache en cuivre : arbre abattu en 2 coups', L.copperAxe.dep, L.copperAxe);
  check('données de recettes cohérentes (objets existants)', L.data);
  check('une icône existe pour chaque objet', L.icons);

  console.log('Interface (clavier et clics réels)');
  await page.click('#btn-new'); await wait(400);
  await E(() => { const p = Iles.debug.game.local; p.inv.add('wood', 3); p.inv.add('fiber', 7); p.inv.add('stick', 2); });
  await page.keyboard.press('KeyC'); await wait(200);
  check('C ouvre l’artisanat', await E(() => Iles.Menu.screen === 'crafting'));
  check('titre « à la main »', await E(() => /main/.test(document.getElementById('craft-title').textContent)));
  const rows = await E(() => ({ cards: document.querySelectorAll('#craft-list .rcard[data-recipe]').length, can: document.querySelectorAll('#craft-list .rcard.can').length, off: document.querySelectorAll('#craft-list .rcard.off').length, unknown: document.querySelectorAll('#craft-list .rcard.locked').length, page: document.getElementById('craft-page') && document.getElementById('craft-page').textContent, tabs: document.querySelectorAll('#craft-tabs .ctab').length }));
  check('à la main : page 1 = 12 recettes (5 faisables), pagination, onglets de catégories', rows.cards === 12 && rows.can === 5 && rows.off === 0 && /^1\//.test(rows.page) && rows.tabs >= 3, rows);
  check('une recette inconnue affiche son indice (carte « À découvrir »)', await E(() => { const U = Iles.CraftingUI; U.tab = 'all'; let hit = false; for (let pg = 0; pg < 8; pg++) { U.page = pg; U.render(true); const n = document.querySelectorAll('#craft-list .rcard.locked').length; for (let k = 0; k < n; k++) { document.querySelectorAll('#craft-list .rcard.locked')[k].click(); if (/cuivre/i.test(document.getElementById('craft-detail').textContent)) hit = true; } } U.page = 0; U.render(true); return hit; }));
  await shot('20-craft-hand.png');
  await CRAFT('plank'); await wait(150);
  check('clic sur « Fabriquer » : planches reçues', await E(() => Iles.debug.game.local.inv.count('plank') === 2 && Iles.debug.game.local.inv.count('wood') === 2));
  check('message de confirmation', await E(() => /Fabriqu/.test(document.getElementById('craft-note').textContent)));
  await CRAFT('rope'); await wait(100);
  await CRAFT('rope'); await wait(100);
  check('2 cordes fabriquées (7 fibres → 1)', await E(() => Iles.debug.game.local.inv.count('rope') === 2 && Iles.debug.game.local.inv.count('fiber') === 1));
  check('bouton désactivé quand il manque des ingrédients', await E(() => { Iles.CraftingUI.select('rope'); return document.getElementById('craft-do').disabled; }));
  check('fabriquer corde débloque « Sac renforcé » (toast + liste)', await E(() => Iles.debug.game.state.progress.recipes.includes('bag2') && /recette/i.test(document.getElementById('toasts').textContent)));
  await page.keyboard.press('Escape'); await wait(100);
  check('Échap ferme l’artisanat', await E(() => Iles.Menu.screen === 'playing'));

  console.log('Établi dans le monde');
  const bench = await E(() => { const o = Iles.debug.game.state.world.byId.get('workbench'); return o ? { x: o.x, y: o.y } : null; });
  check('l’établi existe sur la carte', !!bench, bench);
  await E((b) => { const g = Iles.debug.game, p = g.local; p.x = b.x; p.y = b.y + 9; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); }, bench);
  await wait(200);
  check('invite « Utiliser l’établi »', await E(() => /établi/.test(document.getElementById('prompt-text').textContent)));
  await shot('21-workbench-world.png');
  await E(() => { const p = Iles.debug.game.local; p.inv.add('copper_ore', 1); p.inv.add('copper_bar', 5); p.inv.add('plank', 8); p.inv.add('rope', 2); });
  await page.keyboard.press('KeyE'); await wait(250);
  check('E ouvre l’écran « Établi »', await E(() => Iles.Menu.screen === 'crafting' && /Établi/.test(document.getElementById('craft-title').textContent)));
  check('à l’établi : bag2 listé, fiche marquée « établi »', await E(() => { Iles.CraftingUI.select('bag2'); return !!document.querySelector('#craft-list .rcard[data-recipe="bag2"]') && /Sac renforcé/.test(document.getElementById('craft-detail').textContent) && /établi/.test(document.getElementById('craft-detail').textContent); }));
  check('les recettes du cuivre sont débloquées à l’ouverture, sans pas de simulation', await E(() => Iles.debug.game.state.progress.recipes.includes('axe_copper')));
  await shot('22-craft-bench.png');
  await CRAFT('axe_copper'); await wait(150);
  await CRAFT('pickaxe_copper'); await wait(150);
  check('outils en cuivre fabriqués à l’établi (clics)', await E(() => { const i = Iles.debug.game.local.inv; return i.count('axe_copper') === 1 && i.count('pickaxe_copper') === 1; }));
  await E(() => { const p = Iles.debug.game.local; p.inv.add('rope', 3); p.inv.add('fiber', 6); p.inv.add('plank', 4); Iles.CraftingUI.render(true); });
  await CRAFT('bag2'); await wait(200);
  check('sac renforcé fabriqué : 32 cases', await E(() => Iles.debug.game.local.inv.size === 32));
  check('bouton du sac renforcé devient « Fait » (désactivé)', await E(() => { Iles.CraftingUI.select('bag2'); const b = document.getElementById('craft-do'); return b.disabled && /Fait/.test(b.textContent); }));
  await page.keyboard.press('Escape'); await wait(100);
  await E(() => Iles.Menu.show('inventory')); await wait(200); // devant l'établi, E interagit
  check('l’inventaire affiche 32 cases', await E(() => document.querySelectorAll('#inv-grid .slot').length === 32));
  await shot('23-inventory32.png');
  await page.keyboard.press('KeyE'); await wait(100);

  console.log('Sauvegarde et rechargement');
  await E(() => Iles.debug.app.saveNow('manual'));
  await page.reload(); await wait(500);
  await page.click('#btn-continue'); await wait(400);
  const rl = await E(() => { const g = Iles.debug.game; return { size: g.local.inv.size, copper: g.local.inv.count('axe_copper'), recipes: g.state.progress.recipes.slice().sort(), flag: g.state.progress.flags.bag2 }; });
  check('après rechargement : 32 cases, outils, recettes, drapeau', rl.size === 32 && rl.copper === 1 && rl.flag === true && rl.recipes.filter(r => !/^(helmet|chest|legs|boots)_/.test(r)).join() === 'axe_copper,bag2,pickaxe_copper', rl);
  await page.keyboard.press('KeyC'); await wait(150);
  check('les recettes restent débloquées dans l’interface', await E(() => !/Recette à découvrir/.test(document.getElementById('craft-list').textContent)));
  await page.keyboard.press('Escape'); await wait(100);

  const B3 = await E(() => { const C = Iles.crafting, g = Iles.debug.game, p = g.local; const s0 = p.inv.size; g.state.progress.recipes.push('bag3'); g.state.progress.flags.bag2 = false; g.state.progress.flags.bag3 = false; ['rope', 'plank', 'fiber', 'iron_bar'].forEach(i => p.inv.add(i, 40)); const a = C.craft(g.state, p, 'bag3', 'bench', []).reason, b2 = C.craft(g.state, p, 'bag2', 'bench', []).ok, s2 = p.inv.size, b3 = C.craft(g.state, p, 'bag3', 'bench', []).ok, s3 = p.inv.size, again = C.craft(g.state, p, 'bag3', 'bench', []).reason; return { a, b2, d1: s2 - s0, b3, d2: s3 - s2, again }; });
  check('sac de voyageur : exige le sac renforcé, puis +8 puis +12 cases, une seule fois', B3.a === 'req' && B3.b2 && B3.d1 === 8 && B3.b3 && B3.d2 === 12 && B3.again === 'done', B3);

  console.log('Compatibilité avec une sauvegarde de l’étape 1');
  const old = await E(() => {
    const inv = new Array(24).fill(null); inv[0] = { id: 'axe', qty: 1 }; inv[1] = { id: 'pickaxe', qty: 1 }; inv[2] = { id: 'wood', qty: 5 };
    localStorage.setItem('iles-derivantes:save', JSON.stringify({ version: 1, savedAt: 1, seed: Iles.config.DEMO_SEED, time: { minutes: 500 }, world: { state: {}, drops: [], nextId: 5 }, progress: { portals: [], recipes: [], flags: {} }, players: { p1: { x: 608, y: 494, dir: 'down', sel: 0, inv: inv, stats: { tree_oak: 2 } } }, localId: 'p1', playTime: 10 }));
    return true;
  });
  await E(() => { Iles.Menu.show('title'); localStorage.setItem('iles-derivantes:save', localStorage.getItem('iles-derivantes:save')); });
  await page.reload(); await wait(500);
  await page.click('#btn-continue'); await wait(400);
  check('ancienne sauvegarde chargée (24 cases, bois conservé, aucune recette)', await E(() => { const g = Iles.debug.game; return g.local.inv.size === 24 && g.local.inv.count('wood') === 5 && g.state.progress.recipes.length === 0; }));

  console.log('Torche : lumière tenue en main');
  const lum = await E(() => {
    const d = Iles.debug, g = d.game, p = g.local, s = g.state;
    p.x = 608; p.y = 494; d.cam.snapTo(p.x, p.y - 8, 1280, 1024);
    s.time.minutes = Math.floor(s.time.minutes / 1440) * 1440 + 23 * 60;
    p.inv.slots[5] = { id: 'torch', qty: 1 }; p.inv.slots[6] = { id: 'stone', qty: 1 };
    const c = d.renderer.canvas, ctx = c.getContext('2d');
    function avg(sel) {
      p.sel = sel; d.renderer.draw(s, d.cam, d.fx, 0.016);
      const cx = Math.round(p.x - d.cam.rx), cy = Math.round(p.y - 14 - d.cam.ry);
      const im = ctx.getImageData(cx - 22, cy - 22, 44, 44).data; let sum = 0;
      for (let i = 0; i < im.length; i += 4) sum += im[i] * 0.3 + im[i + 1] * 0.59 + im[i + 2] * 0.11;
      return sum / (im.length / 4);
    }
    const without = avg(6), withTorch = avg(5);
    return { without: +without.toFixed(1), withTorch: +withTorch.toFixed(1) };
  });
  check('la torche éclaire sensiblement la nuit (' + lum.without + ' → ' + lum.withTorch + ')', lum.withTorch > lum.without * 1.15, lum);
  await wait(300); await shot('24-torch-night.png');

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
