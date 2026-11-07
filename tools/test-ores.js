/*
 * Minerais des dimensions : 5 nouveaux métaux + obscurium (mélange noir, fabriqué), rareté, veines, couleurs, fonte, outils.
 *   node tools/test-ores.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 640 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  await page.goto(URL); await page.waitForTimeout(400);

  console.log('Objets, recettes, fonte, icônes');
  const A = await E(() => {
    const I = Iles, S = (new I.Renderer(document.createElement('canvas'))).S, r = { bad: [] }, NEW = ['cobalt', 'mithril', 'orichalque', 'adamantite', 'titane'];
    for (const id of NEW.concat(['obscurium'])) {
      for (const k of [id + '_ore', id + '_bar', 'axe_' + id, 'pickaxe_' + id]) {
        if (!I.ITEMS[k]) r.bad.push('item ' + k);
        if (!S.icons[k] || S.icons[k].width < 8) r.bad.push('icône ' + k);
      }
      const sm = I.containers.smeltOf(id + '_ore'); if (!sm || sm.out !== id + '_bar') r.bad.push('fonte ' + id);
      if (!I.crafting.BY_ID['axe_' + id] || !I.crafting.BY_ID['pickaxe_' + id]) r.bad.push('recette ' + id);
      if (id !== 'obscurium') {
        const o = I.OBJECTS['ore_' + id];
        if (!o || o.tool !== 'pickaxe' || !S.obj['ore_' + id] || S.obj['ore_' + id].length !== 3) r.bad.push('objet ' + id);
        for (const k of [id + '_ore', id + '_bar']) for (const c of I.COLORS) if (!I.ITEMS[k + '~' + c.id] || !S.icons[k + '~' + c.id]) r.bad.push('couleur ' + k + c.id);
      }
    }
    r.noObsObj = !I.OBJECTS.ore_obscurium; r.noObsColors = !I.ITEMS['obscurium_ore~red'] && !I.ITEMS['obscurium_bar~blue'] && !I.mat.colorable('obscurium_ore');
    r.recipe = I.crafting.BY_ID.obscurium_ore.ins.map(g => g[0] + g[1]).join();
    r.tools = ['pickaxe_cobalt', 'axe_obscurium'].map(k => [I.ITEMS[k].power, I.ITEMS[k].tier]);
    return r;
  });
  check('5 minerais + obscurium : objets, lingots, outils, icônes, fonte, recettes', A.bad.length === 0, A.bad.slice(0, 6));
  check('les 5 minerais existent dans les 16 couleurs ; l’obscurium reste noir (aucune variante) et n’existe pas dans le monde', A.noObsObj && A.noObsColors);
  check('obscurium = 2 minerais de chacun de trois autres (' + A.recipe + ') ; outils plus puissants que le fer', A.recipe === 'cobalt_ore2,mithril_ore2,adamantite_ore2' && A.tools[0][0] > 3 && A.tools[1][0] > A.tools[0][0], A.tools);

  console.log('Génération dans les dimensions : rare, en veines, pas tous ensemble, colorés');
  const G = await E(() => {
    const I = Iles, G = I.dimgen, r = { sets: [], per: {}, badC: 0, obs: 0, veined: 0, veins: 0, dens: 0 };
    let tot = 0, land = 0;
    for (let s = 1; s <= 120; s++) {
      const D = G.describe(s * 1597); G.initialMap(D);
      r.sets.push(D.ores.length);
      const found = {}; const pos = {};
      for (let cy = 1019; cy < 1027; cy++) for (let cx = 1019; cx < 1027; cx++) {
        const c = G.genChunk(D, cx, cy);
        for (const t of c.ground) if (t >= 2 && t !== 11) land++;
        for (const o of c.objs) {
          if (o.type === 'ore_obscurium') r.obs++;
          if (o.type.indexOf('ore_') !== 0) continue;
          tot++; found[o.type] = (found[o.type] || 0) + 1; r.per[o.type] = (r.per[o.type] || 0) + 1;
          if (D.pal.indexOf(o.c) < 0) r.badC++;
          (pos[o.type] = pos[o.type] || []).push([o.x / 16, o.y / 16]);
        }
      }
      if (Object.keys(found).length > D.ores.length) r.badC++; // jamais un minerai hors de la liste de la dimension
      // veines : le voisin le plus proche d'un minerai est très souvent tout près (regroupement)
      for (const t in pos) { const P = pos[t]; if (P.length < 8) continue; let near = 0; for (const a of P) { let m = 1e9; for (const b of P) if (a !== b) m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1])); if (m <= 3) near++; } r.veined += near; r.veins += P.length; }
    }
    r.dens = tot / land * 100;
    r.maxSet = Math.max.apply(null, r.sets); r.minSet = Math.min.apply(null, r.sets);
    return r;
  });
  check('chaque dimension a 2 ou 3 minerais (jamais les dix), et aucun minerai hors de sa liste', G.minSet === 2 && G.maxSet === 3 && G.badC === 0, [G.minSet, G.maxSet, G.badC]);
  check('les 10 minerais apparaissent dans les dimensions (dont les 5 nouveaux), mais jamais l’obscurium', Object.keys(G.per).length === 10 && G.obs === 0, G.per);
  check('rare : ' + G.dens.toFixed(2) + ' % du terrain praticable (moins de 2 %)', G.dens > 0.15 && G.dens < 2, G.dens);
  check('en veines : ' + Math.round(G.veined / G.veins * 100) + ' % des minerais ont un voisin à moins de 3 cases', G.veined / G.veins > 0.6, G.veined / G.veins);

  console.log('Récolte, couleur, fonte, fabrication');
  const R = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, r = {};
    const g = new I.Game(); g.newGame(); const p = g.local;
    // une dimension qui contient du cobalt ou de l'un des nouveaux minerais : on cherche un minerai nouveau près du départ
    let found = null;
    for (let s = 1; s < 600 && !found; s++) {
      g.state.travelTo = 'd:' + s * 31; g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      const w = g.state.world;
      for (const o of w.objectsIn(p.x - 800, p.y - 800, p.x + 800, p.y + 800)) if (/ore_(cobalt|mithril|orichalque|adamantite|titane)/.test(o.type)) { found = o; break; }
      if (!found) g.travel('lobby');
    }
    r.found = !!found; if (!found) return r;
    const w = g.state.world, o = found, id = o.type.slice(4);
    // sans pioche de fer : trop dur (tier 2) ; avec : on récolte
    p.inv.slots.fill(null); p.inv.add('pickaxe', 1); p.x = o.x; p.y = o.y + 9; p.dir = 'up'; p.sel = 0;
    for (let i = 0; i < 200; i++) g.step({ p1: Object.assign({}, N, { use: true }) }, 1 / 60);
    r.hardNoTool = !w.isDepleted(o);
    p.inv.add('pickaxe_iron', 1); p.sel = 1; w.drops.length = 0;
    for (let i = 0; i < 300 && !w.isDepleted(o); i++) g.step({ p1: Object.assign({}, N, { use: true }) }, 1 / 60);
    r.mined = w.isDepleted(o);
    const drops = w.drops.map(d => d.item); r.dropOre = drops.some(d => I.mat.split(d).base === id + '_ore' && I.mat.split(d).c === o.c); r.dropColor = o.c;
    // fonte (colorée) : minerai coloré -> lingot de la même couleur
    const ore = I.mat.id(id + '_ore', o.c), sm = I.containers.smeltOf(ore);
    r.smelt = sm && sm.out === I.mat.id(id + '_bar', o.c);
    // fabrication des outils avec des lingots colorés (n'importe quelle couleur), à l'établi seulement
    const bar = I.mat.id(id + '_bar', o.c);
    p.inv.slots.fill(null); p.inv.add('plank', 4); p.inv.add('rope', 2); p.inv.add(bar, 5);
    const st = g.state, ev = [];
    st.progress.recipes.push('pickaxe_' + id, 'axe_' + id);
    r.noHand = I.crafting.craft(st, p, 'pickaxe_' + id, 'hand', ev, 0).reason;
    r.craftPick = I.crafting.craft(st, p, 'pickaxe_' + id, 'bench', ev, 0).ok && p.inv.count('pickaxe_' + id) === 1 && p.inv.count(bar) === 2;
    r.craftAxe = I.crafting.craft(st, p, 'axe_' + id, 'bench', ev, 0).ok && p.inv.count('axe_' + id) === 1 && p.inv.count(bar) === 0;
    // et la pioche du nouveau métal casse un minerai
    p.sel = p.inv.slots.findIndex(s => s && s.id === 'pickaxe_' + id); r.holds = p.sel >= 0;
    return r;
  });
  check('un minerai nouveau a été trouvé dans une dimension', R.found);
  if (R.found) {
    check('la pioche de départ ne suffit pas ; la pioche en fer récolte, et le minerai est de la couleur du minerai', R.hardNoTool && R.mined && R.dropOre, R);
    check('fonte : un minerai coloré donne le lingot de la même couleur', R.smelt);
    check('outils du nouveau métal : fabriqués à l’établi (pas à la main) avec des lingots de couleur', R.noHand === 'station' && R.craftPick && R.craftAxe, R);
  }

  console.log('Obscurium : fabrication à l’établi, fonte, noir');
  const O = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const p = g.local, st = g.state, ev = [], r = {};
    p.inv.slots.fill(null);
    // trois minerais, dans des couleurs différentes, 1 de moins qu'il ne faut pour le dernier
    p.inv.add('cobalt_ore~red', 2); p.inv.add('mithril_ore', 1); p.inv.add('mithril_ore~blue', 1); p.inv.add('adamantite_ore~green', 1);
    r.learned = (I.crafting.checkUnlocks(st, p, ev), st.progress.recipes.includes('obscurium_ore'));
    r.missing = I.crafting.craft(st, p, 'obscurium_ore', 'bench', ev, 0).reason;
    p.inv.add('adamantite_ore~green', 1);
    r.noHand = I.crafting.craft(st, p, 'obscurium_ore', 'hand', ev, 0).reason;
    const c = I.crafting.craft(st, p, 'obscurium_ore', 'bench', ev, 0);
    r.crafted = c.ok && p.inv.count('obscurium_ore') === 1 && p.inv.slots.filter(Boolean).length === 1; // tous les ingrédients consommés, quelle que soit leur couleur
    r.black = !I.ITEMS.obscurium_ore.base && I.mat.split('obscurium_ore').c === 0;
    // four : 3 minerais -> 1 lingot noir
    const sm = I.containers.smeltOf('obscurium_ore'); r.smelt = sm && sm.need === 3 && sm.out === 'obscurium_bar';
    const f = I.containers.newData('furnace'); r.furnace = !!f;
    // l'obscurium n'apparaît jamais dans un monde, et sa pioche/hache existe
    p.inv.add('plank', 2); p.inv.add('rope', 1); p.inv.add('obscurium_bar', 3);
    st.progress.recipes.push('pickaxe_obscurium');
    r.pick = I.crafting.craft(st, p, 'pickaxe_obscurium', 'bench', ev, 0).ok;
    return r;
  });
  check('la recette se débloque dès qu’on possède l’un des trois minerais ; il manque un minerai → refusé', O.learned && O.missing === 'ingredients', O);
  check('fabriqué à l’établi seulement, avec des minerais de couleurs mélangées ; ingrédients consommés ; résultat noir sans variante', O.noHand === 'station' && O.crafted && O.black, O);
  check('fonte (3 minerais → 1 lingot) et pioche d’obscurium', O.smelt && O.furnace && O.pick, O);

  // fonte réelle dans un four posé
  const F = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const st = g.state, w = st.world, p = g.local;
    const tx = Math.floor(p.x / 16) + 2, ty = Math.floor(p.y / 16) + 2;
    const f = w.addStructure('furnace', tx, ty, I.containers.newData('furnace'));
    f.data.input = { id: 'cobalt_ore~red', qty: 4 }; f.data.fuel = { id: 'coal', qty: 2 };
    for (let i = 0; i < 60 * 30; i++) I.containers.tick(w, 1 / 60);
    const o = f.data.output; return { out: o && o.id, qty: o && o.qty };
  });
  check('four réel : 4 minerais de cobalt rouges → 2 lingots de cobalt rouges', F.out === 'cobalt_bar~red' && F.qty === 2, F);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
