/*
 * Table du Forgeron : matériaux autorisés/refusés, règles de génération, ordre, couleurs, statistiques, fabrication sans perte ni duplication,
 * sauvegarde, interface réelle (clics), coffre.
 *   node tools/test-forge.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(URL); await wait(400);

  console.log('Matériaux autorisés et refusés');
  const M = await E(() => {
    const F = Iles.forge, r = { okList: [], badList: [] };
    ['wood', 'stick', 'plank', 'bamboo', 'rope', 'stone', 'crystal', 'copper_bar', 'iron_bar', 'gold_bar', 'silver_bar', 'iron_ore', 'copper_ore', 'cobalt_bar', 'mithril_ore', 'obscurium_bar', 'obscurium_ore', 'wood~red', 'iron_bar~blue', 'gold_bar~green', 'titane_bar~pink'].forEach(id => { if (!F.accepts(id)) r.okList.push(id); });
    ['flower_red', 'flower_blue', 'sunflower', 'fiber', 'berries', 'apple', 'mushroom', 'glow_mushroom', 'wheat', 'pumpkin', 'petal', 'pinecone', 'shell', 'coal', 'clay', 'torch', 'axe_iron', 'pickaxe', 'chest', 'workbench', 'forge_table', 'lamp', 'fence', 'plank~red', 'nope'].forEach(id => { if (id !== 'plank~red' && F.accepts(id)) r.badList.push(id); });
    r.tint = F.accepts('plank~red'); r.weaponNotMaterial = !F.accepts('wp:stick,stick,iron_bar');
    r.catOff = Object.keys(Iles.FORGE.CATEGORIES).filter(k => !Iles.FORGE.CATEGORIES[k]).join();
    return r;
  });
  check('bois, bâtons, planches, cordes, pierre, cristal, lingots, minerais (même colorés, nouveaux métaux inclus) acceptés', M.okList.length === 0, M.okList);
  check('plantes, fleurs, nourriture, charbon, argile, coquillage, outils, constructions refusés', M.badList.length === 0, M.badList);
  check('couleur et matériau sont indépendants (planche rouge acceptée comme planche) ; une arme n’est pas un matériau', M.tint && M.weaponNotMaterial);
  check('catégories désactivées prêtes à être autorisées plus tard : ' + M.catOff, /plant/.test(M.catOff) && /food/.test(M.catOff));

  console.log('Choix du modèle, matériaux, couleurs, textures');
  const X = await E(() => {
    const F = Iles.forge, I = Iles, blue = I.COLORS.findIndex(c => c.id === 'blue') + 1;
    const A = F.analyze('sword', ['wood', 'stick', 'stick']), B = F.analyze('spear', ['stick', 'stick', 'iron_bar~blue']), C = F.analyze('axe', ['wood~red', 'gold_bar~blue', 'wood~green']);
    const colorsOfCells = a => { const s = {}; a.cells.forEach(c => { if (c.part >= 0) s[a.pieces[c.part].c] = 1; }); return Object.keys(s).sort().join(); };
    return {
      models: I.FORGE.MODEL_ORDER.join(), n: I.FORGE.MODEL_ORDER.length,
      A: [A.ok, A.type, A.name, A.stats], B: [B.ok, B.type, B.name, B.stats], C: [C.ok, C.type, C.name, C.stats],
      bTip: B.pieces[2].c, blue, bShaft: B.pieces[0].c, cColors: colorsOfCells(C), cCols: C.pieces.map(p => p.c), red: 1, green: I.COLORS.findIndex(c => c.id === 'green') + 1,
    };
  });
  check('5 modèles d’armes connus au choix : ' + X.models, X.n === 5 && X.models === 'sword,dagger,spear,axe,mace');
  check('épée de bois (bois, bâton, bâton) : « Épée rudimentaire en bois », faible', X.A[0] && X.A[1] === 'sword' && /^Épée rudimentaire en bois$/.test(X.A[2]) && X.A[3].dmg <= 3, X.A);
  check('lance (bâton, bâton, fer bleu) : pointe bleue, hampe gardant sa couleur d’origine, plus puissante et solide que l’épée de bois', X.B[0] && X.B[1] === 'spear' && X.B[3].dmg > X.A[3].dmg * 2 && X.B[3].dur > X.A[3].dur && X.bTip === X.blue && X.bShaft === 0, X);
  check('hache (bois rouge, or bleu, bois vert) : tricolore, rouge/bleu/vert distincts, solidité plus faible que la lance de fer', X.C[0] && X.C[1] === 'axe' && /multicolore/.test(X.C[2]) && X.cColors.split(',').length === 3 && X.C[3].dur < X.B[3].dur, X);

  const R = await E(() => {
    const F = Iles.forge, I = Iles, mats = ['stick', 'iron_bar', 'gold_bar~green'];
    const r = {}, id = (m, s) => { const a = F.analyze(m, s); return a.ok ? a.id : a.reason; };
    r.ids = I.FORGE.MODEL_ORDER.map(m => id(m, ['wood', 'iron_bar', 'iron_bar']));
    r.names = I.FORGE.MODEL_ORDER.map(m => F.analyze(m, ['wood', 'iron_bar', 'iron_bar']).name);
    r.shapes = new Set(I.FORGE.MODEL_ORDER.map(m => JSON.stringify(F.analyze(m, [null, null, null]).cells))).size;
    r.stats = I.FORGE.MODEL_ORDER.map(m => F.analyze(m, ['wood', 'iron_bar', 'iron_bar']).stats).map(s => s.dmg + '/' + s.spd);
    r.order = [id('sword', ['stick', 'stick', 'iron_bar']), id('sword', ['iron_bar', 'stick', 'stick']), id('sword', ['stick', 'iron_bar', 'stick'])];
    r.orderStats = [F.analyze('sword', ['stick', 'stick', 'iron_bar']).stats.dmg, F.analyze('sword', ['iron_bar', 'stick', 'stick']).stats.dmg];
    r.same = id('mace', mats) === id('mace', mats);
    r.incomplete = F.analyze('sword', ['stick', null, 'iron_bar']); r.empty = F.analyze('sword', [null, null, null]);
    r.bad = F.analyze('axe', ['stick', 'flower_red', 'iron_bar']); r.model = F.analyze('hallebarde', mats).reason;
    // pièces qui ne conviennent qu'à certaines parties
    r.oreBlade = F.analyze('sword', ['stick', 'stick', 'iron_ore']); r.oreHead = F.analyze('mace', ['stick', 'stick', 'iron_ore']).ok;
    r.ropeBlade = F.analyze('dagger', ['stick', 'stick', 'rope']); r.ropeGrip = F.analyze('dagger', ['rope', 'stick', 'iron_bar']).ok;
    r.gemGrip = F.analyze('sword', ['crystal', 'stick', 'iron_bar']); r.gemBlade = F.analyze('sword', ['stick', 'iron_bar', 'crystal']).ok;
    r.fits = [F.fits('sword', 2, 'iron_ore'), F.fits('mace', 2, 'iron_ore'), F.fits('sword', 0, 'rope'), F.fits('sword', 0, 'crystal')];
    const a = F.analyze('sword', ['stick', 'stick', 'iron_bar']), b = F.analyze('sword', ['stick', 'stick', 'iron_bar~blue']);
    r.colorSame = a.stats.dmg === b.stats.dmg && a.stats.dur === b.stats.dur && a.stats.wt === b.stats.wt && a.id !== b.id;
    const st = (m, s) => F.analyze(m, s).stats;
    r.goldVsIron = [st('spear', ['stick', 'stick', 'gold_bar']).dur, st('spear', ['stick', 'stick', 'iron_bar']).dur];
    r.rareOnce = [st('spear', ['stick', 'stick', 'obscurium_bar']).dmg, st('spear', ['obscurium_bar', 'obscurium_bar', 'obscurium_bar']).dmg, st('spear', ['stick', 'stick', 'iron_bar']).dmg];
    r.rarity = [st('sword', ['wood', 'stick', 'stick']).rarity.name, st('sword', ['obscurium_bar', 'obscurium_bar', 'obscurium_bar']).rarity.name];
    r.statsKeys = Object.keys(st('sword', ['stick', 'stick', 'iron_bar'])).join();
    r.mithril = [st('dagger', ['stick', 'stick', 'mithril_bar']).spd, st('dagger', ['stick', 'stick', 'iron_bar']).spd];
    r.legacy = F.weapon('wp:stick,stick,iron_bar~blue');
    r.badId = [F.weapon('wp:sword:stick,stick'), F.weapon('wp:nope:stick,stick,stick'), F.weapon('wp:sword:stick,flower_red,stick'), !!Iles.ITEMS['wp:sword:stick,stick,iron_bar']];
    // balayage : toutes les combinaisons de 3 matériaux sur les 5 modèles
    const pool = ['stick', 'wood', 'plank', 'bamboo', 'rope', 'stone', 'crystal', 'copper_bar', 'iron_bar', 'gold_bar', 'silver_bar', 'iron_ore', 'cobalt_bar', 'mithril_bar', 'adamantite_bar', 'obscurium_bar~x', 'wood~red', 'titane_ore~blue', null];
    let n = 0, valid = 0, ids = new Set(), crash = 0;
    for (const m of I.FORGE.MODEL_ORDER) for (const x of pool) for (const y of pool) for (const z of pool) { try { const o = F.analyze(m, [x, y, z]); n++; if (o.ok) { valid++; ids.add(o.id); if (!Iles.ITEMS[o.id] || !F.weapon(o.id)) crash++; } } catch (e) { crash++; } }
    r.sweep = { n, valid, distinct: ids.size, crash };
    return r;
  });
  check('un même trio de matériaux donne 5 armes différentes selon le modèle (noms : ' + R.names.join(' / ') + ')', new Set(R.ids).size === 5 && new Set(R.names).size === 5, [R.ids, R.names]);
  check('les 5 modèles ont 5 formes différentes, et des statistiques différentes (dégâts/vitesse ' + R.stats.join(' ') + ')', R.shapes === 5 && new Set(R.stats).size >= 4, [R.shapes, R.stats]);
  check('l’ordre des emplacements compte (3 ordres, 3 armes ; dégâts ' + R.orderStats + ')', new Set(R.order).size === 3 && R.orderStats[0] > R.orderStats[1], R.order);
  check('même modèle + mêmes matériaux = même arme', R.same);
  check('trois emplacements obligatoires : « incomplete » (avec aperçu fantôme), vide, modèle inconnu, objet incompatible (emplacement 2)', R.incomplete.reason === 'incomplete' && R.incomplete.cells.length > 5 && R.empty.reason === 'incomplete' && R.model === 'model' && R.bad.reason === 'incompatible' && R.bad.slot === 1, [R.incomplete.reason, R.empty.reason, R.model, R.bad.reason]);
  check('minerai brut : refusé en lame, accepté en tête de masse ; corde : refusée en lame, acceptée en poignée ; cristal : refusé en poignée, accepté en lame', R.oreBlade.reason === 'part' && R.oreBlade.slot === 2 && R.oreHead && R.ropeBlade.reason === 'part' && R.ropeGrip && R.gemGrip.reason === 'part' && R.gemGrip.slot === 0 && R.gemBlade && !R.fits[0] && R.fits[1] && R.fits[2] && !R.fits[3], R);
  check('couleur ≠ matériau : fer bleu et fer naturel ont les mêmes statistiques mais deux armes distinctes', R.colorSame);
  check('l’or tendre est moins solide que le fer (' + R.goldVsIron + ')', R.goldVsIron[0] < R.goldVsIron[1]);
  check('un matériau rare utilisé une fois reste proportionné : dégâts ' + R.rareOnce + ' (pointe d’obscurium, tout en obscurium, fer) : moins que tout-obscurium, et au plus le rapport de puissance (9/5)', R.rareOnce[0] < R.rareOnce[1] && R.rareOnce[0] <= R.rareOnce[2] * 1.8 * 1.15, R.rareOnce);
  check('rareté : ' + R.rarity.join(' → '), R.rarity[0] === 'Commune' && R.rarity[1] === 'Légendaire');
  check('statistiques minimales : ' + R.statsKeys, /dmg/.test(R.statsKeys) && /dur/.test(R.statsKeys) && /wt/.test(R.statsKeys) && /spd/.test(R.statsKeys) && /rarity/.test(R.statsKeys));
  check('le mithril (très léger) attaque plus vite que le fer (' + R.mithril + ')', R.mithril[0] > R.mithril[1]);
  check('identifiants invalides ou modifiés ignorés ; ancien format sans modèle refusé', R.badId[0] === null && R.badId[1] === null && R.badId[2] === null && R.badId[3] === true && R.legacy === null, R.badId);
  check('balayage de ' + R.sweep.n + ' combinaisons (5 modèles) : ' + R.sweep.valid + ' valides, ' + R.sweep.distinct + ' armes distinctes, aucune erreur', R.sweep.crash === 0 && R.sweep.distinct > 1500, R.sweep);

  const V = await E(() => {
    // dessin : couleur du matériau conservée, texture propre à chaque matériau
    const I = Iles, F = I.forge, cv = a => { const c = I.forgeArt.weaponCanvas(a), d = c.getContext('2d').getImageData(0, 0, 16, 16).data; return d; };
    const zone = (a, part) => { const d = cv(a), ps = []; for (const c of a.cells) if (c.part === part) { const o = ((c.y + 1) * 16 + c.x + 1) * 4; ps.push([d[o], d[o + 1], d[o + 2], d[o + 3]]); } return ps; };
    const avg = ps => [0, 1, 2].map(i => Math.round(ps.reduce((a, p) => a + p[i], 0) / ps.length));
    const variety = ps => new Set(ps.map(p => p.join())).size;
    const blue = F.analyze('sword', ['stick', 'stick', 'iron_bar~blue']), red = F.analyze('sword', ['stick', 'stick', 'iron_bar~red']);
    const ab = avg(zone(blue, 2)), ar = avg(zone(red, 2));
    const textures = {};
    for (const m of ['wood', 'plank', 'stick', 'stone', 'iron_bar', 'iron_ore', 'crystal', 'rope']) {
      const a = F.analyze('mace', [m, 'stick', m === 'crystal' || m === 'rope' ? 'stone' : m]); // pièce testée dans la poignée
      textures[m] = variety(zone(a, 0));
    }
    const wood = F.analyze('axe', ['stick', 'stick', 'wood~yellow']), stone = F.analyze('axe', ['stick', 'stick', 'stone~yellow']), bar = F.analyze('axe', ['stick', 'stick', 'iron_bar~yellow']);
    const sig = a => zone(a, 2).map(p => p.join()).join('|');
    return { ab, ar, textures, differ: new Set([sig(wood), sig(stone), sig(bar)]).size, ghost: zone(F.analyze('sword', [null, null, null]), 1).every(p => p[3] > 0), tableDiffer: new Set(['sword', 'dagger', 'spear', 'axe', 'mace'].map(m => cv(F.analyze(m, [null, null, null])).join(',')) ).size };
  });
  check('couleur du matériau conservée à l’écran : lame bleue → bleu dominant, lame rouge → rouge dominant', V.ab[2] > V.ab[0] && V.ab[2] > V.ab[1] && V.ar[0] > V.ar[1] && V.ar[0] > V.ar[2], V);
  check('chaque matériau a sa texture (plusieurs nuances dans une même pièce) : ' + JSON.stringify(V.textures), Object.values(V.textures).every(n => n >= 3), V.textures);
  check('même couleur, matières différentes (bois / pierre / métal jaunes) : textures différentes', V.differ === 3, V.differ);
  check('modèle sans matériaux : silhouette fantôme dessinée (5 modèles = 5 images)', V.ghost && V.tableDiffer === 5, V);

  console.log('Fabrication (logique, sans interface)');
  const L = await E(() => {
    const I = Iles, r = {}, fresh = () => { const g = new I.Game(); g.newGame(); const o = g.state.world.addStructure('forge_table', 20, 20, null); g.local.x = o.x; g.local.y = o.y + 9; return { g, p: g.local, o }; };
    const run = (g, o, model, slots, p) => I.commands.run(g.state, p.id, { t: 'forge', id: o.id, model: model, slots: slots }, []);
    let { g, p, o } = fresh();
    for (const [id, n] of [['stick', 2], ['iron_bar~blue', 1], ['flower_red', 3], ['iron_ore', 1]]) p.inv.add(id, n);
    const snap = () => JSON.stringify(p.inv.toJSON());
    let before = snap(), res = run(g, o, 'spear', ['stick', 'flower_red', 'iron_bar~blue'], p);
    r.badItem = [res.ok, res.reason, res.slot, snap() === before];
    before = snap(); res = run(g, o, 'spear', ['stick', 'stick', 'iron_bar'], p); r.missing = [res.ok, res.reason, snap() === before];
    before = snap(); res = run(g, o, 'spear', ['stick', 'stick', 'stick'], p); r.tooMany = [res.ok, res.reason, snap() === before];
    before = snap(); res = run(g, o, 'spear', ['stick', null, 'iron_bar~blue'], p); r.few = [res.ok, res.reason, snap() === before];
    before = snap(); res = run(g, o, 'sword', ['stick', 'stick', 'iron_ore'], p); r.part = [res.ok, res.reason, res.slot, snap() === before];
    before = snap(); res = run(g, o, 'hallebarde', ['stick', 'stick', 'iron_bar~blue'], p); r.model = [res.ok, snap() === before];
    before = snap(); res = run(g, o, 'spear', 'oops', p); r.junk = [res.ok, snap() === before];
    p.x += 400; res = run(g, o, 'spear', ['stick', 'stick', 'iron_bar~blue'], p); r.far = [res.ok, res.reason, snap() === before]; p.x -= 400;
    res = run(g, o, 'spear', ['stick', 'stick', 'iron_bar~blue'], p);
    r.ok = [res.ok, res.id, p.inv.count('stick'), p.inv.count('iron_bar~blue'), p.inv.count(res.id), p.inv.count('flower_red'), I.ITEMS[res.id].name];
    r.again = run(g, o, 'spear', ['stick', 'stick', 'iron_bar~blue'], p).ok;
    ({ g, p, o } = fresh());
    p.inv.add('stick', 2); p.inv.add('iron_bar', 1);
    for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) p.inv.slots[i] = { id: 'stone', qty: 99 };
    res = run(g, o, 'sword', ['stick', 'stick', 'iron_bar'], p); r.fullSwap = [res.ok, p.inv.count(res.id)];
    ({ g, p, o } = fresh());
    p.inv.add('wood', 99); p.inv.add('stick', 99); p.inv.add('iron_bar', 99);
    for (let i = 0; i < p.inv.size; i++) if (!p.inv.slots[i]) p.inv.slots[i] = { id: 'stone', qty: 99 };
    before = JSON.stringify(p.inv.toJSON()); res = run(g, o, 'sword', ['wood', 'stick', 'iron_bar'], p);
    r.full = [res.ok, res.reason, JSON.stringify(p.inv.toJSON()) === before];
    r.noTable = I.commands.run(g.state, p.id, { t: 'forge', id: 'nope', model: 'sword', slots: ['stick', 'stick', 'stick'] }, []).ok;
    return r;
  });
  check('objet incompatible refusé : rien n’est consommé, il reste dans le sac', !L.badItem[0] && L.badItem[1] === 'incompatible' && L.badItem[2] === 1 && L.badItem[3], L.badItem);
  check('matériau absent / trop de pièces demandées / emplacement vide / matière qui ne convient pas à la partie / modèle inconnu / commande invalide : refus sans aucun changement', !L.missing[0] && L.missing[2] && !L.tooMany[0] && L.tooMany[2] && !L.few[0] && L.few[1] === 'incomplete' && L.few[2] && !L.part[0] && L.part[1] === 'part' && L.part[2] === 2 && L.part[3] && !L.model[0] && L.model[1] && !L.junk[0] && L.junk[1], L);
  check('trop loin de la table : refusé', !L.far[0] && L.far[1] === 'far' && L.far[2], L.far);
  check('fabrication : matériaux consommés (1 fer bleu, 2 bâtons), 1 arme reçue, fleurs intactes : ' + L.ok[6], L.ok[0] && L.ok[2] === 0 && L.ok[3] === 0 && L.ok[4] === 1 && L.ok[5] === 3, L.ok);
  check('refaire la même arme sans matériaux : refusé (aucune duplication)', !L.again);
  check('sac plein mais les matériaux libèrent la place : fabrication possible', L.fullSwap[0] && L.fullSwap[1] === 1, L.fullSwap);
  check('sac réellement plein : refus et inventaire strictement intact', !L.full[0] && L.full[1] === 'full' && L.full[2], L.full);
  check('table inconnue refusée', !L.noTable);

  console.log('Table, recette, couleurs, sauvegarde, coffre');
  const T = await E(() => {
    const I = Iles, r = {};
    const S = Iles.debug.renderer.S;
    r.recipe = I.crafting.BY_ID.forge_table && I.crafting.isKnown({ progress: { recipes: [] } }, I.crafting.BY_ID.forge_table);
    r.colored = !!I.ITEMS['forge_table~yellow'] && /jaune/.test(I.ITEMS['forge_table~yellow'].name.toLowerCase());
    r.sprite = !!S.obj.forge_table && !!S.icons.forge_table && !!S.iconURL['forge_table~red'];
    const g = new I.Game(); g.newGame(); const p = g.local, ev = [];
    ['plank', 'stone', 'rope'].forEach((id, i) => p.inv.add(id, [10, 8, 2][i]));
    const w = I.ORES.length; r.nOres = w;
    p.x = g.state.world.byId.get('workbench').x; p.y = g.state.world.byId.get('workbench').y + 9;
    r.craft = I.crafting.craft(g.state, p, 'forge_table', 'bench', ev).ok && p.inv.count('forge_table') === 1;
    // pose via le système de construction (couleur jaune)
    p.inv.add('forge_table~yellow', 1);
    const si = p.inv.slots.findIndex(s => s && s.id === 'forge_table~yellow');
    let placed = null;
    for (let dy = -4; dy <= 4 && !placed; dy++) for (let dx = -4; dx <= 4 && !placed; dx++) { const res = I.building.place(g.state, p, si, Math.floor(p.x / 16) + dx + 3, Math.floor(p.y / 16) + dy, ev); if (res.ok) placed = res.obj; }
    r.placed = !!placed && placed.type === 'forge_table' && placed.c === 3;
    // ouverture par E : événement openForge
    p.x = placed.x; p.y = placed.y + 9; p.dir = 'up'; const ev2 = [];
    g.step({ [p.id]: Object.assign({}, I.Game.NEUTRAL, { interact: true, dir: 'up' }) }, 1 / 60); g.takeEvents().forEach(e => ev2.push(e.type));
    r.openEvt = ev2.indexOf('openForge') >= 0;
    // sauvegarde / chargement d'une arme + coffre
    p.inv.add('stick', 2); p.inv.add('cobalt_bar~sky', 1);
    const fr = I.commands.run(g.state, p.id, { t: 'forge', id: placed.id, model: 'axe', slots: ['stick', 'stick', 'cobalt_bar~sky'] }, []);
    r.wid = fr.id; r.wname = fr.name;
    const json = JSON.parse(JSON.stringify(p.inv.toJSON()));
    const back = I.Inventory.fromJSON(json, 24);
    r.persist = back.count(fr.id) === 1 && I.ITEMS[fr.id].name === fr.name;
    // coffre
    const ch = g.state.world.addStructure('chest', 30, 30, I.containers.newData('chest')); p.x = ch.x; p.y = ch.y + 9;
    const wi = p.inv.slots.findIndex(s => s && s.id === fr.id);
    const put = I.containers.put(p, ch, wi), inChest = ch.data.inv.count(fr.id), take = I.containers.take(p, ch, ch.data.inv.slots.findIndex(s => s && s.id === fr.id));
    r.chest = [put.ok, inChest, take.ok, p.inv.count(fr.id)];
    p.inv.sort(I.config.HOTBAR_SIZE); r.sorted = p.inv.count(fr.id);
    // sauvegarde complète de la partie (snapshot → chargement)
    const snap = JSON.parse(JSON.stringify(g.snapshot())); const g2 = new I.Game(); g2.loadSnapshot(snap);
    r.fullSave = g2.local.inv.count(fr.id) === 1 && g2.state.world.structureAt(placed.tx, placed.ty) && g2.state.world.structureAt(placed.tx, placed.ty).type === 'forge_table';
    // lancer l'arme au sol puis la ramasser garde l'identité
    const dropOk = !!I.harvest.throwStack(g.state.world, p, p.inv.slots.findIndex(s => s && s.id === fr.id));
    r.thrown = dropOk;
    return r;
  });
  check('recette de la Table du Forgeron connue dès le départ et fabricable à l’établi', T.recipe && T.craft, T);
  check('table colorable (16 couleurs), sprite et icônes présents', T.colored && T.sprite, T);
  check('table posée en jaune (couleur du matériau conservée) ; E ouvre la table', T.placed && T.openEvt, T);
  check('arme fabriquée par commande : ' + T.wname + ' ; elle survit à la sauvegarde de l’inventaire', T.persist, T);
  check('coffre : déposer et reprendre l’arme ; trier le sac la conserve ; sauvegarde de la partie complète', T.chest[0] && T.chest[1] === 1 && T.chest[2] && T.chest[3] === 1 && T.sorted === 1 && T.fullSave, T);
  check('arme jetable au sol', T.thrown);

  console.log('Interface (clics réels)');
  await page.click('#btn-new').catch(() => {});
  await E(() => { const a = Iles.debug.app; if (Iles.Menu.screen !== 'playing') a.newGame(); }); await wait(400);
  await E(() => {
    const g = Iles.debug.game, p = g.local, w = g.state.world;
    const o = w.addStructure('forge_table', Math.floor(p.x / 16) + 2, Math.floor(p.y / 16), null);
    window.__tbl = o.id; p.x = o.x; p.y = o.y + 9; p.dir = 'up';
    [['stick', 4], ['wood', 2], ['iron_bar~blue', 2], ['gold_bar', 1], ['iron_ore', 2], ['rope', 1], ['crystal', 1], ['flower_red', 3], ['berries', 2], ['fiber', 5], ['torch', 1], ['axe_iron', 1]].forEach(a => p.inv.add(a[0], a[1]));
    Iles.debug.cam.snapTo(p.x, p.y - 8, 1100, 800);
  });
  await wait(200);
  await page.keyboard.press('KeyE'); await wait(300);
  check('E devant la table ouvre l’écran de la Table du Forgeron', await E(() => Iles.Menu.screen === 'forge' && !document.getElementById('screen-forge').classList.contains('hidden')));
  check('5 modèles à choisir, 3 emplacements alignés avec le nom de chaque partie', await E(() => document.querySelectorAll('#forge-models .fmodel').length === 5 && document.querySelectorAll('#forge-slots .fslot').length === 3 && document.querySelectorAll('#forge-slots .farrow').length === 2 && [...document.querySelectorAll('.flabel')].map(x => x.textContent).join('|') === 'Poignée|Garde et base de lame|Lame et pointe'));
  const bagIdx = id => E((id) => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === id), id);
  const clickBag = async id => { const i = await bagIdx(id); await page.click('#forge-inv .slot[data-i="' + i + '"]'); await wait(80); };
  const note = () => E(() => document.getElementById('forge-note').textContent);
  const invJSON = () => E(() => JSON.stringify(Iles.debug.game.local.inv.toJSON()));
  const slotsNow = () => E(() => Iles.ForgeUI.slots.join());
  const before = await invJSON();
  await clickBag('flower_red');
  check('fleur : refusée avec le message « Cet objet ne peut pas être utilisé pour fabriquer une arme. »', (await note()) === 'Cet objet ne peut pas être utilisé pour fabriquer une arme.' && (await slotsNow()) === ',,');
  for (const id of ['berries', 'fiber', 'torch', 'axe_iron']) await clickBag(id);
  check('baies, fibre, torche, hache : refusées aussi ; le sac est strictement identique', (await invJSON()) === before && (await slotsNow()) === ',,');
  const ghost = await E(() => ({ img: document.querySelector('#forge-prev img').src.startsWith('data:image'), dis: document.getElementById('btn-forge-make').disabled, info: document.getElementById('forge-info').textContent }));
  check('modèle choisi mais vide : silhouette fantôme affichée, « Fabriquer » inactif', ghost.img && ghost.dis && /Épée/.test(ghost.info), ghost);
  await page.click('#forge-models .fmodel[data-m="spear"]'); await wait(100);
  check('choisir « Lance » change les noms des emplacements', await E(() => [...document.querySelectorAll('.flabel')].map(x => x.textContent).join('|') === 'Bas de hampe|Haut de hampe|Pointe'));
  const sigPrev1 = await E(() => document.querySelector('#forge-prev img').src);
  await clickBag('iron_ore');
  check('minerai brut : placé sur le premier emplacement qui l’accepte (poignée)', (await slotsNow()) === 'iron_ore,,');
  await page.click('#forge-slots .fslot[data-s="0"]'); await wait(50);
  await page.click('#forge-slots .fslot[data-s="2"]'); await wait(50); await clickBag('iron_ore');
  check('minerai brut forcé sur la pointe : refusé avec explication, rien ne bouge', /Pointe/i.test(await note()) && /fonds-le/.test(await note()) && (await slotsNow()) === ',,');
  await page.click('#forge-slots .fslot[data-s="2"]'); await wait(50); // désélectionne
  await page.click('#forge-slots .fslot[data-s="1"]'); await wait(50); await clickBag('crystal'); // cristal en milieu : accepté
  await page.click('#forge-slots .fslot[data-s="1"]'); await wait(50);
  check('cristal accepté au milieu, retiré en recliquant', (await slotsNow()) === ',,');
  await clickBag('stick'); await clickBag('stick'); await clickBag('iron_bar~blue'); await wait(100);
  check('bâton, bâton, fer bleu placés dans l’ordre (chaque matériau va à la partie qui l’accepte)', (await slotsNow()) === 'stick,stick,iron_bar~blue');
  const prev = await E(() => ({ name: document.querySelector('#forge-info .fname') && document.querySelector('#forge-info .fname').textContent, img: document.querySelector('#forge-prev img').src, parts: document.querySelectorAll('#forge-info .fpart').length, stats: document.querySelector('#forge-info .fstats') && document.querySelector('#forge-info .fstats').textContent, dis: document.getElementById('btn-forge-make').disabled }));
  check('aperçu automatique : « Lance en fer bleu », image mise à jour, statistiques, trois pièces colorées', prev.name === 'Lance en fer bleu' && prev.img !== sigPrev1 && prev.parts === 3 && /Dégâts/.test(prev.stats) && !prev.dis, prev);
  await page.screenshot({ path: path.join(OUT, '94-forge-ui.png') });
  await page.click('#forge-models .fmodel[data-m="mace"]'); await wait(100);
  const prevMace = await E(() => ({ name: document.querySelector('#forge-info .fname').textContent, slots: Iles.ForgeUI.slots.join() }));
  check('changer de modèle garde les matériaux qui conviennent et met l’aperçu à jour (« Masse en fer bleu »)', prevMace.name === 'Masse en fer bleu' && prevMace.slots === 'stick,stick,iron_bar~blue', prevMace);
  await page.click('#forge-models .fmodel[data-m="dagger"]'); await wait(100);
  check('retour au bas du tableau : dague, mêmes matériaux, nom « Dague en fer bleu »', await E(() => document.querySelector('#forge-info .fname').textContent === 'Dague en fer bleu'));
  await page.click('#forge-slots .fslot[data-s="2"]'); await wait(100);
  check('cliquer un emplacement rempli retire le matériau (rien perdu) ; l’aperçu repasse en « incomplet »', (await slotsNow()) === 'stick,stick,' && await E(() => Iles.debug.game.local.inv.count('iron_bar~blue') === 2 && document.getElementById('btn-forge-make').disabled));
  await clickBag('gold_bar'); await wait(100);
  check('remplacement : l’or prend l’emplacement 3 ; aperçu mis à jour', await E(() => /or/.test(document.querySelector('#forge-info .fname').textContent)));
  await clickBag('wood'); await wait(100);
  check('trois emplacements pleins : un quatrième matériau est refusé avec un message', /pleins/.test(await note()));
  await page.click('#forge-slots .fslot[data-s="2"]'); await page.click('#forge-slots .fslot[data-s="2"]'); await clickBag('iron_bar~blue'); await wait(100);
  check('emplacement visé : le fer bleu remplace bien l’emplacement 3', (await slotsNow()) === 'stick,stick,iron_bar~blue');
  await page.click('#forge-models .fmodel[data-m="spear"]'); await wait(100);
  await page.click('#btn-forge-make'); await wait(300);
  const done = await E(() => { const i = Iles.debug.game.local.inv; return { stick: i.count('stick'), bar: i.count('iron_bar~blue'), gold: i.count('gold_bar'), weapon: i.slots.filter(s => s && s.id.startsWith('wp:')).map(s => s.id), slots: Iles.ForgeUI.slots.join(), note: document.getElementById('forge-note').textContent }; });
  check('« Fabriquer » : 1 lance dans le sac, matériaux consommés, or et fleurs intacts, emplacements vidés', done.stick === 2 && done.bar === 1 && done.gold === 1 && done.weapon.length === 1 && done.weapon[0] === 'wp:spear:stick,stick,iron_bar~blue' && done.slots === ',,' && /Fabriqué : Lance en fer bleu/.test(done.note), done);
  check('l’arme est visible dans le sac de la table avec son icône texturée', await E(() => !!document.querySelector('#forge-inv .slot img[src^="data:"]') && Iles.debug.renderer.S.iconURL['wp:spear:stick,stick,iron_bar~blue'].startsWith('data:image')));
  await page.screenshot({ path: path.join(OUT, '95-forge-done.png') });
  await page.keyboard.press('Escape'); await wait(150);
  check('Échap ferme la table', await E(() => Iles.Menu.screen === 'playing'));
  await E(() => Iles.Menu.show('inventory')); await wait(250); // devant la table, E interagit : on ouvre l'inventaire directement
  const invDetail = await E(() => { const i = Iles.debug.game.local.inv.slots.findIndex(s => s && s.id.startsWith('wp:')); document.querySelector('#inv-grid .slot[data-i="' + i + '"]').click(); return document.getElementById('inv-detail').textContent; });
  check('inventaire : nom et statistiques de l’arme affichés', /Lance en fer bleu/.test(invDetail) && /Dégâts/.test(invDetail), invDetail);
  await page.screenshot({ path: path.join(OUT, '96-forge-inventaire.png') });
  await page.keyboard.press('KeyE');

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  check('aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3));
  console.log('\n' + pass + ' réussis, ' + fail + ' échoués');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
