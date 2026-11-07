/*
 * Matériaux colorés, minerais (fer, argent, or), fabrication par couleur, fonte, objets naturels colorés (bosquets, monde teinté).
 *   node tools/test-materials.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline-ids.json'), 'utf8'));
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(URL); await wait(400);

  console.log('Matériaux : couleur de chaque matériau, 16 variantes');
  const M = await E(() => {
    const I = Iles, S = I.debug.renderer.S, r = { noColorText: [], badVariant: [], dupIcon: [], noOrder: 0 };
    for (const id of Object.keys(I.mat.NATURAL)) {
      const d = I.ITEMS[id];
      if (!d) { r.badVariant.push('absent:' + id); continue; }
      if (!/Couleur : /.test(d.desc)) r.noColorText.push(id);
      const urls = new Set([S.iconURL[id]]);
      for (let c = 1; c <= 16; c++) {
        const vid = I.mat.id(id, c), v = I.ITEMS[vid];
        if (!v || v.base !== id || v.c !== c || v.stack !== d.stack || !/\(/.test(v.name)) r.badVariant.push(vid);
        if (!I.ITEM_ORDER.includes(vid)) r.noOrder++;
        urls.add(S.iconURL[vid]);
      }
      if (urls.size < 17) r.dupIcon.push(id + ':' + urls.size);
    }
    // constructions : toutes existent en 16 couleurs, l'objet posé garde son type
    let placeables = 0;
    for (const id of Object.keys(I.ITEMS)) { const d = I.ITEMS[id]; if (d.place && !d.base && !d.nocolor) { placeables++; const v = I.ITEMS[I.mat.id(id, 7)]; if (!v || v.place !== d.place || v.c !== 7 || !S.iconURL[v.base + '~' + I.COLORS[6].id]) r.badVariant.push('place:' + id); } }
    r.materials = Object.keys(I.mat.NATURAL).length; r.placeables = placeables; r.total = Object.keys(I.ITEMS).length;
    // outils et nourriture : pas de variante colorée
    r.toolsPlain = !I.mat.colorable('axe') && I.mat.id('axe', 3) === 'axe' && !I.mat.colorable('torch');
    r.split = JSON.stringify([I.mat.split('wood~yellow'), I.mat.split('wood'), I.mat.split('table~red')]);
    return r;
  });
  check(M.materials + ' matériaux ont une couleur naturelle dans leur description', !M.noColorText.length, M.noColorText);
  check('chaque matériau et chaque construction (' + M.placeables + ') existe en 16 couleurs (' + M.total + ' objets en tout)', !M.badVariant.length && M.noOrder === 0, M);
  check('les 16 icônes d’un matériau sont toutes différentes', !M.dupIcon.length, M.dupIcon);
  check('outils et torches ne se colorent pas ; split correct', M.toolsPlain && M.split === '[{"base":"wood","c":3},{"base":"wood","c":0},{"base":"table","c":1}]', M.split);

  console.log('Minerais : fer, argent, or');
  const O = await E(() => {
    const I = Iles, S = I.debug.renderer.S, w = new I.World(I.config.DEMO_SEED), r = {};
    r.items = ['iron_ore', 'iron_bar', 'silver_ore', 'silver_bar', 'gold_ore', 'gold_bar', 'axe_iron', 'pickaxe_iron'].filter(id => !I.ITEMS[id] || !S.iconURL[id] || S.iconURL[id].length < 200);
    const nat = {}; for (const o of w.objects) if (!o.c) nat[o.type] = (nat[o.type] || 0) + 1;
    r.nodes = { iron: nat.ore_iron, silver: nat.ore_silver, gold: nat.ore_gold, copper: nat.ore_copper, coal: nat.ore_coal };
    r.sprites = ['ore_iron', 'ore_silver', 'ore_gold'].every(t => S.obj[t].length === 3 && S.obj[t].every(e => e.c.width > 4));
    const px = (id) => S.iconURL[id];
    r.distinctBars = new Set(['copper_bar', 'iron_bar', 'silver_bar', 'gold_bar'].map(px)).size === 4;
    r.distinctOres = new Set(['copper_ore', 'iron_ore', 'silver_ore', 'gold_ore'].map(px)).size === 4;
    // paliers de pioche : départ < cuivre < fer
    const g = new I.Game(); g.newGame(); const p = g.local, N = I.Game.NEUTRAL;
    const hitOnce = (tool, type) => {
      p.inv.slots.fill(null); p.inv.add(tool, 1); p.sel = 0;
      const o = g.state.world.objects.find(q => q.type === type && !q.c && !g.state.world.isDepleted(q)); g.state.world.state = {};
      for (const off of [[0, 10], [12, 4], [-12, 4], [0, 18], [0, -14]]) { p.x = o.x + off[0]; p.y = o.y + off[1]; if (!I.collision.isBlocked(g.state.world, p)) break; }
      const c = o.def.center, aim = { x: o.x + c[0], y: o.y + c[1] }, hp0 = o.def.hp;
      for (let i = 0; i < 40; i++) g.step({ p1: Object.assign({}, N, { use: true, aim: aim }) }, 1 / 60);
      const st = g.state.world.state[o.id]; return st ? st.hp : hp0 - 0; // hp restant (si abîmé) ; sinon intact
    };
    r.tiers = {
      ironBasic: hitOnce('pickaxe', 'ore_iron') === I.OBJECTS.ore_iron.hp,
      ironCopper: hitOnce('pickaxe_copper', 'ore_iron') < I.OBJECTS.ore_iron.hp,
      goldCopper: hitOnce('pickaxe_copper', 'ore_gold') === I.OBJECTS.ore_gold.hp,
      goldIron: hitOnce('pickaxe_iron', 'ore_gold') < I.OBJECTS.ore_gold.hp,
    };
    // butin
    p.inv.slots.fill(null); p.inv.add('pickaxe_iron', 1); p.sel = 0;
    const need = { ore_iron: 'iron_ore', ore_silver: 'silver_ore', ore_gold: 'gold_ore' }, got = {};
    for (const t in need) {
      g.state.world.state = {}; const o = g.state.world.objects.find(q => q.type === t && !q.c);
      for (const off of [[0, 10], [12, 4], [-12, 4], [0, 18], [0, -14]]) { p.x = o.x + off[0]; p.y = o.y + off[1]; if (!I.collision.isBlocked(g.state.world, p)) break; }
      const c = o.def.center, aim = { x: o.x + c[0], y: o.y + c[1] };
      for (let i = 0; i < 900 && !g.state.world.isDepleted(o); i++) g.step({ p1: Object.assign({}, N, { use: true, aim: aim }) }, 1 / 60);
      for (let k = 0; k < 150; k++) g.step({ p1: N }, 1 / 60);
      got[t] = p.inv.count(need[t]);
    }
    r.got = got;
    return r;
  });
  check('8 nouveaux objets (3 minerais, 3 lingots, 2 outils en fer) avec icône', !O.items.length, O.items);
  check('minerais et lingots ont chacun leur apparence', O.sprites && O.distinctBars && O.distinctOres, O);
  check('fer, argent et or existent sur l’île de départ', O.nodes.iron >= 1 && O.nodes.silver >= 1 && O.nodes.gold >= 1, O.nodes);
  check('paliers : fer = pioche en cuivre, or = pioche en fer', O.tiers.ironBasic && O.tiers.ironCopper && O.tiers.goldCopper && O.tiers.goldIron, O.tiers);
  check('chaque minerai donne son butin avec la pioche en fer', O.got.ore_iron >= 1 && O.got.ore_silver >= 1 && O.got.ore_gold >= 1, O.got);

  console.log('Fonte : chaque minerai, et la couleur est conservée');
  const F = await E(() => {
    const I = Iles, C = I.containers, r = {};
    const smelt = (oreId, qty, fuelId, secs) => {
      const d = C.newData('furnace'); d.input = { id: oreId, qty: qty }; d.fuel = { id: fuelId, qty: 3 };
      for (let i = 0; i < secs * 10; i++) C.tickFurnace(d, 0.1);
      return d.output && d.output.id + ':' + d.output.qty;
    };
    r.iron = smelt('iron_ore', 2, 'wood', 9); r.silver = smelt('silver_ore', 2, 'coal', 9); r.gold = smelt('gold_ore', 3, 'plank', 11);
    r.goldShort = smelt('gold_ore', 2, 'wood', 30); // 2 minerais d'or ne suffisent pas
    r.blue = smelt('iron_ore~blue', 2, 'wood~red', 9); r.copperCol = smelt('copper_ore~lime', 2, 'stick', 7);
    r.notBurn = C.fuelOf('apple') === 0 && C.fuelOf('wood~red') === 20 && !C.smeltOf('iron_bar') && C.smeltOf('gold_ore~pink').out === 'gold_bar~pink';
    // mélange : un lingot coloré ne se mélange pas avec un lingot naturel dans la sortie
    const d = C.newData('furnace'); d.input = { id: 'iron_ore~blue', qty: 2 }; d.fuel = { id: 'wood', qty: 1 }; d.output = { id: 'iron_bar', qty: 1 };
    for (let i = 0; i < 100; i++) C.tickFurnace(d, 0.1); r.noMix = d.output.id === 'iron_bar' && d.input.qty === 2;
    // dépôt dans un four via put()
    const p = { x: 0, y: 0, inv: new I.Inventory(8) }; p.inv.add('iron_ore~red', 4); p.inv.add('gold_bar', 2); p.inv.add('wood~green', 3);
    const o = { type: 'furnace', x: 0, y: 6, data: C.newData('furnace') };
    r.put = [C.put(p, o, 0).ok, C.put(p, o, 1).reason, C.put(p, o, 2).ok, o.data.input.id, o.data.fuel.id];
    return r;
  });
  check('fer : 2 minerais → 1 lingot de fer', F.iron === 'iron_bar:1', F.iron);
  check('argent (avec du charbon) : 2 → 1 lingot ; or (avec des planches) : 3 → 1 lingot', F.silver === 'silver_bar:1' && F.gold === 'gold_bar:1', F);
  check('2 minerais d’or ne suffisent pas', F.goldShort === null, F.goldShort);
  check('minerai bleu → lingot bleu (combustible rouge accepté) ; cuivre vert clair → lingot vert clair', F.blue === 'iron_bar~blue:1' && F.copperCol === 'copper_bar~lime:1', F);
  check('un lingot n’est pas un minerai, une pomme n’est pas un combustible', F.notBurn, F);
  check('un lingot coloré ne se mélange pas à un lingot naturel', F.noMix, F);
  check('dépôt dans le four : minerai coloré et bois coloré acceptés, lingot refusé', F.put[0] && F.put[1] === 'badItem' && F.put[2] && F.put[3] === 'iron_ore~red' && F.put[4] === 'wood~green', F.put);

  console.log('Fabrication : la couleur vient des matériaux');
  const K = await E(() => {
    const I = Iles, C = I.crafting, r = {};
    const g = new I.Game(); g.newGame(); const p = g.local, st = g.state; p.inv.resize(40); p.inv.slots.fill(null);
    const cr = (id, station, c) => C.craft(st, p, id, station, [], c);
    // chaîne : bois jaune → planches jaunes
    p.inv.add('wood~yellow', 2); const a = cr('plank', 'hand', 3); r.plankYellow = a.ok && p.inv.count('plank~yellow') === 2 && p.inv.count('wood~yellow') === 1 && p.inv.count('plank') === 0;
    // table jaune = 6 planches jaunes
    p.inv.add('plank~yellow', 4); const t = cr('table', 'bench', 3); r.tableNoBench = t.ok; // station 'bench' sans vérification de proximité à ce niveau : recette autorisée
    r.tableYellow = p.inv.count('table~yellow') === 1 && p.inv.count('plank~yellow') === 0;
    // pas de mélange : planches naturelles + 3 jaunes ne font pas de table jaune
    p.inv.add('plank', 6); p.inv.add('plank~yellow', 3); const b = cr('table', 'bench', 3); r.noMix = !b.ok && b.reason === 'ingredients' && p.inv.count('plank') === 6 && p.inv.count('plank~yellow') === 3;
    // …mais la table naturelle se fabrique avec les naturelles
    const n = cr('table', 'bench', 0); r.natural = n.ok && p.inv.count('table') === 1 && p.inv.count('plank~yellow') === 3;
    // chaise bleue : planches bleues + fibre bleue
    p.inv.add('plank~blue', 3); p.inv.add('fiber~blue', 2); p.inv.add('fiber', 2); const ch = cr('chair', 'bench', 8); r.chair = ch.ok && p.inv.count('chair~blue') === 1 && p.inv.count('fiber') === 2;
    // recettes non colorables
    p.inv.add('stick', 1); p.inv.add('fiber', 1); const to = cr('torch', 'hand', 5); r.torchColor = !to.ok && to.reason === 'color';
    p.inv.add('plank', 2); p.inv.add('rope', 1); p.inv.add('iron_bar', 2); const ai = cr('axe_iron', 'bench', 2); r.toolColor = !ai.ok && ai.reason === 'color';
    const bad = cr('table', 'bench', 17); const bad2 = cr('table', 'bench', -1); r.badColor = !bad.ok && !bad2.ok;
    // outils en fer : recette apprise en voyant du minerai de fer (même coloré)
    st.progress.recipes = []; p.inv.slots.fill(null); p.stats = {}; C.checkUnlocks(st, p, []); r.lockedBefore = !st.progress.recipes.includes('axe_iron');
    p.inv.add('iron_ore~cyan', 1); const ev = []; C.checkUnlocks(st, p, ev); r.learnedColor = st.progress.recipes.includes('axe_iron') && !st.progress.recipes.includes('candelabra');
    p.inv.add('iron_bar', 2); p.inv.add('plank', 2); p.inv.add('rope', 1); r.axeIron = cr('axe_iron', 'bench', 0).ok && p.inv.count('axe_iron') === 1;
    // sac plein : rien n'est consommé
    p.inv.slots.fill(null); for (let i = 0; i < p.inv.size; i++) p.inv.slots[i] = { id: 'stone', qty: 99 }; p.inv.slots[0] = { id: 'plank~red', qty: 99 }; p.inv.slots[1] = { id: 'plank~red', qty: 5 };
    p.inv.rev++; const f = cr('floor_wood', 'hand', 1); r.fullKept = !f.ok && f.reason === 'full' && p.inv.count('plank~red') === 104;
    // commande réseau : la couleur est validée
    p.inv.slots.fill(null); p.inv.add('plank~green', 1);
    const c1 = I.commands.run(st, 'p1', { t: 'craft', id: 'floor_wood', station: 'hand', c: 5 }, []); const c2 = I.commands.run(st, 'p1', { t: 'craft', id: 'floor_wood', station: 'hand', c: 99 }, []); const c3 = I.commands.run(st, 'p1', { t: 'craft', id: 'floor_wood', station: 'hand', c: 'x' }, []);
    r.cmd = [c1.ok, c2.ok, c3.ok, p.inv.count('floor_wood~green')];
    // nouvelles constructions de métal
    r.metal = ['wall_iron', 'candelabra', 'mirror'].map(id => !!I.crafting.BY_ID[id] && !!I.OBJECTS[id].structure && I.crafting.BY_ID[id].ins.every(([x]) => !!I.ITEMS[x]));
    // les ingrédients des recettes de couleur existent toujours
    r.allIns = C.RECIPES.every(rc => [0, 1, 16].every(c => !C.colorOk(rc, c) || C.insOf(rc, c).every(([x]) => !!I.ITEMS[x]) && (!rc.out || !!I.ITEMS[C.outIdOf(rc, c)])));
    return r;
  });
  check('bois jaune → planches jaunes (la chaîne garde la couleur)', K.plankYellow, K);
  check('table jaune = 6 planches jaunes', K.tableYellow, K);
  check('pas de mélange : planches naturelles + jaunes ≠ table jaune ; la naturelle marche avec les naturelles', K.noMix && K.natural, K);
  check('chaise bleue = planches bleues + fibre bleue', K.chair, K);
  check('torche et outils : pas de couleur (refus propre)', K.torchColor && K.toolColor && K.badColor, K);
  check('outils en fer : recette apprise en trouvant du minerai (même coloré) ; hache en fer fabriquée', K.lockedBefore && K.learnedColor && K.axeIron, K);
  check('sac plein : rien n’est consommé', K.fullKept, K);
  check('commande réseau : couleur valide acceptée, invalide refusée', K.cmd[0] && !K.cmd[1] && !K.cmd[2] && K.cmd[3] === 2, K.cmd);
  check('mur en fer, chandelier d’or, miroir d’argent : recettes et objets cohérents', K.metal.every(Boolean), K.metal);
  check('toutes les recettes en couleur ont leurs objets (ingrédients et résultat)', K.allIns);

  console.log('Objets naturels colorés : 16 bosquets, récolte, monde d’une seule couleur');
  const G = await E((baseline) => {
    const I = Iles, w = new I.World(I.config.DEMO_SEED, { groves: true }), r = {};
    r.islandColored = new I.World(I.config.DEMO_SEED).objects.filter(o => o.c).length; // l'île de départ n'a plus rien de coloré
    const per = {}; for (const o of w.objects) if (o.c) (per[o.c] = per[o.c] || []).push(o.type);
    r.colors = Object.keys(per).length;
    r.complete = Object.keys(per).filter(c => { const t = per[c]; return t.some(x => x.indexOf('tree') === 0) && t.some(x => x === 'rock' || x.indexOf('ore') === 0) && t.some(x => x === 'tuft'); }).length;
    r.ores = [1, 2, 3, 4].map(c => per[c].find(x => x.indexOf('ore') === 0)).join(',');
    const byId = new Map(w.objects.map(o => [o.id, o.type])), changed = baseline.filter(s => { const [id, type] = s.split('='); return id !== 'house' && byId.get(id) !== type; }); // la maison préconstruite a été retirée volontairement
    r.changed = changed.length;
    const tiles = new Set(); let dup = 0; for (const o of w.objects) if (!o.structure && o.id !== 'house' && o.id !== 'portal') { const k = Math.floor(o.x / 16) + ',' + Math.floor((o.y - 1) / 16); if (tiles.has(k)) dup++; tiles.add(k); }
    r.dup = dup;
    // récolte réelle d'un arbre jaune, d'un rocher vert, d'une touffe rose, d'un minerai de cuivre rouge
    const g = new I.Game(); g.newGame(); g.state.world = g.state.worlds.home = new I.World(I.config.DEMO_SEED, { groves: true }); const p = g.local, N = I.Game.NEUTRAL, st = g.state, ww = st.world;
    p.inv.resize(40);
    const harvest = (type, c, tool) => {
      p.inv.slots.fill(null); p.inv.add(tool, 1); p.sel = 0; ww.drops.length = 0;
      const o = ww.objects.find(q => q.type === type && (q.c | 0) === c && !ww.isDepleted(q)); if (!o) return 'absent';
      let ok = false; for (const off of [[0, 10], [12, 4], [-12, 4], [0, 18], [0, -14], [14, 10], [-14, 10]]) { p.x = o.x + off[0]; p.y = o.y + off[1]; if (!I.collision.isBlocked(ww, p)) { ok = true; break; } }
      if (!ok) return 'bloqué';
      const cc = o.def.center, aim = { x: o.x + cc[0], y: o.y + cc[1] };
      if (o.def.kind === 'resource') for (let i = 0; i < 1500 && !ww.isDepleted(o); i++) g.step({ p1: Object.assign({}, N, { use: true, aim: aim }) }, 1 / 60);
      else { g.step({ p1: N }, 1 / 60); for (let i = 0; i < 5 && !ww.isDepleted(o); i++) g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60); }
      for (let k = 0; k < 150; k++) g.step({ p1: N }, 1 / 60);
      return p.inv.slots.filter(Boolean).map(s => s.id).sort().join(',');
    };
    r.h = { tree: harvest('tree_oak', 3, 'axe'), rock: harvest('rock', 5, 'pickaxe'), tuft: harvest('tuft', 11, 'axe'), ore: harvest('ore_copper', 1, 'pickaxe'), natural: harvest('tree_oak', 0, 'axe') };
    // monde teinté (futures dimensions) : tout est de la couleur c, le butin aussi
    const wt = new I.World(I.config.DEMO_SEED, { tint: 5 });
    const nat = wt.objects.filter(o => !['house', 'portal', 'workbench'].includes(o.id));
    r.tint = { all: nat.every(o => o.c === 5), houseKept: true, count: nat.length, same: nat.length > 600 };
    const gt = new I.Game(); gt.newGame(); gt.state.world = new I.World(I.config.DEMO_SEED, { tint: 5 });
    const wd = gt.state.world, tr = wd.objects.find(o => o.type === 'tree_oak'), pt = gt.local; pt.inv.slots.fill(null); pt.inv.add('axe', 1); pt.sel = 0;
    pt.x = tr.x; pt.y = tr.y + 10; for (let i = 0; i < 600 && !wd.isDepleted(tr); i++) gt.step({ p1: Object.assign({}, N, { use: true, aim: { x: tr.x, y: tr.y - 9 } }) }, 1 / 60);
    for (let k = 0; k < 150; k++) gt.step({ p1: N }, 1 / 60);
    r.tint.loot = pt.inv.slots.filter(Boolean).map(s => s.id).filter(x => x !== 'axe').every(x => /~green$/.test(x)) && pt.inv.count('wood~green') >= 3;
    return r;
  }, baseline);
  check('l’île de départ ne contient plus aucun arbre, plante ni rocher de couleur', G.islandColored === 0, G.islandColored);
  check('16 bosquets (option groves) : une couleur chacun, avec arbres, rocher ou minerai, et herbes', G.colors === 16 && G.complete === 16, G);
  check('les bosquets portent aussi des minerais colorés (cuivre, fer, argent, or en alternance)', G.ores === 'ore_copper,ore_iron,ore_silver,ore_gold', G.ores);
  check('les ' + baseline.length + ' objets d’origine gardent leur identifiant ; une seule chose par case', G.changed === 0 && G.dup === 0, G);
  check('arbre jaune → bois jaune (+ branches jaunes) ; rocher vert → pierre verte', /wood~yellow/.test(G.h.tree) && /^(?!.*[,]wood$)/.test(G.h.tree) && /stone~lime|stone~green/.test(G.h.rock), G.h);
  check('touffe rose → fibre rose ; minerai de cuivre rouge → minerai rouge', /fiber~pink/.test(G.h.tuft) && /copper_ore~red/.test(G.h.ore), G.h);
  check('un arbre normal donne toujours du bois naturel', /(^|,)wood(,|$)/.test(G.h.natural) && !/~/.test(G.h.natural.replace('axe', '')), G.h.natural);
  check('monde teinté (option tint) : tout est vert, le butin aussi', G.tint.all && G.tint.houseKept && G.tint.loot, G.tint);

  console.log('Interface : choix des matériaux à l’artisanat, fabrication à la souris');
  await page.click('#btn-new'); await wait(400);
  await E(() => { const p = Iles.debug.game.local; p.inv.slots.fill(null); p.inv.add('wood~yellow', 4); p.inv.add('fiber~yellow', 8); p.inv.add('wood', 2); p.inv.add('fiber', 6); });
  await page.keyboard.press('KeyC'); await wait(250);
  const chips = await E(() => [...document.querySelectorAll('#craft-colors button[data-col]')].map(b => b.textContent));
  check('la liste de matériaux propose « Naturel » et « Jaune » (seulement les couleurs possédées)', JSON.stringify(chips) === '["Naturel","Jaune"]', chips);
  const names = () => E(() => { const U = Iles.CraftingUI, r = []; for (let pg = 0; pg < 6; pg++) { U.page = pg; U.render(true); document.querySelectorAll('#craft-list .rcard[data-recipe] .rc-name').forEach(n => r.push(n.textContent.trim())); } U.page = 0; U.render(true); return r.filter(t => /^Planche|^Tapis/.test(t)); });
  const nat = await names();
  await page.click('#craft-colors button[data-col="3"]'); await wait(200);
  const yel = await names();
  check('en jaune, les recettes affichent « (jaune) » ; en naturel, non', nat.every(t => !/jaune/.test(t)) && yel.length >= 2 && yel.every(t => /jaune/.test(t)), [nat, yel]);
  await page.screenshot({ path: path.join(OUT, '70-craft-colors.png') });
  await E((i) => Iles.CraftingUI.select(i), 'carpet'); await page.click('#craft-do'); await wait(300);
  const inv1 = await E(() => ({ carpet: Iles.debug.game.local.inv.count('carpet~yellow'), plain: Iles.debug.game.local.inv.count('carpet'), fiberY: Iles.debug.game.local.inv.count('fiber~yellow'), fiber: Iles.debug.game.local.inv.count('fiber'), note: document.getElementById('craft-note').textContent }));
  check('clic « Fabriquer » : 2 tapis jaunes, 6 fibres jaunes consommées, naturelles intactes', inv1.carpet === 2 && inv1.plain === 0 && inv1.fiberY === 2 && inv1.fiber === 6 && /jaune/.test(inv1.note), inv1);
  await page.click('#craft-colors button[data-col="0"]'); await wait(200);
  await E((i) => Iles.CraftingUI.select(i), 'plank'); await page.click('#craft-do'); await wait(300);
  const inv2 = await E(() => ({ plank: Iles.debug.game.local.inv.count('plank'), yellow: Iles.debug.game.local.inv.count('plank~yellow'), wood: Iles.debug.game.local.inv.count('wood') }));
  check('en « Naturel » : planches naturelles, le bois jaune n’est pas touché', inv2.plank === 2 && inv2.yellow === 0 && inv2.wood === 1, inv2);
  check('R et F ne font plus rien (pas de pastille, pas de couleur de joueur)', await E(async () => !document.getElementById('color-chip') && !('color' in Iles.debug.game.local)));
  await page.keyboard.press('Escape'); await wait(200);

  console.log('En jeu : un bosquet, pose et sauvegarde');
  const sp = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local; g.state.world = g.state.worlds.home = new I.World(I.config.DEMO_SEED, { groves: true }); const w = g.state.world, objs = w.objects.filter(o => o.c === 3);
    const cx = objs.reduce((a, o) => a + o.x, 0) / objs.length, cy = objs.reduce((a, o) => a + o.y, 0) / objs.length;
    p.x = cx; p.y = cy + 24; for (let k = 0; k < 8 && I.collision.isBlocked(w, p); k++) p.y += 6;
    I.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); g.state.time.minutes = 11 * 60;
    p.inv.slots.fill(null); p.inv.add('table~yellow', 1); p.inv.add('bookshelf~blue', 1); p.inv.add('carpet~red', 2);
    return { n: objs.length };
  });
  await wait(500); await page.screenshot({ path: path.join(OUT, '71-grove-yellow.png') });
  const pl = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, st = g.state, B = I.building, res = [];
    for (const id of ['table~yellow', 'bookshelf~blue', 'carpet~red']) {
      const slot = p.inv.slots.findIndex(s => s && s.id === id), type = I.ITEMS[id].place;
      let done = null; for (let d = 1; d < 5 && !done; d++) for (let dy = -d; dy <= d && !done; dy++) for (let dx = -d; dx <= d && !done; dx++) { const tx = Math.floor(p.x / 16) + dx, ty = Math.floor(p.y / 16) + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === d && B.check(st, p, type, tx, ty).ok) { const r = B.place(st, p, slot, tx, ty, []); done = r.ok ? r.obj.type + ':' + r.obj.c : 'fail'; } }
      res.push(done);
    }
    return res;
  });
  check('table jaune, étagère bleue, tapis rouge se posent avec la couleur du matériau', JSON.stringify(pl) === '["table:3","bookshelf:8","carpet:1"]', pl);
  await wait(300); await page.screenshot({ path: path.join(OUT, '72-placed-colors.png') });
  await E(() => { const p = Iles.debug.game.local; p.inv.add('iron_ore~sky', 5); p.inv.add('gold_bar', 3); p.inv.add('plank~purple', 7); Iles.debug.app.saveNow('manual'); });
  const sig = () => E(() => { const g = Iles.debug.game; return g.state.world.structures.map(o => o.type + o.tx + ',' + o.ty + ':' + (o.c | 0)).sort().join('|') + '#' + g.local.inv.count('iron_ore~sky') + ',' + g.local.inv.count('gold_bar') + ',' + g.local.inv.count('plank~purple'); });
  const s1 = await sig();
  await page.reload(); await wait(500); await page.click('#btn-continue'); await wait(500);
  check('rechargement de la page : objets colorés, minerais et lingots conservés', (await sig()) === s1 && s1.endsWith('#5,3,7') && /table\d+,\d+:3/.test(s1), s1);
  const rm = await E(() => { const g = Iles.debug.game, p = g.local, B = Iles.building, o = g.state.world.structures.find(q => q.type === 'table'); p.x = o.x; p.y = o.y + 10; p.inv.slots.fill(null); const r = B.remove(g.state, p, o.tx, o.ty, []); return r.ok && p.inv.count('table~yellow'); });
  check('retirer la table jaune rend une table jaune', rm === 1, rm);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
