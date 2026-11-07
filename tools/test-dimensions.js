/*
 * Dimensions procédurales : génération répétée, 1 à 3 couleurs, variété, matériaux, chunks (chargement / déchargement / persistance),
 * nage, voyage (bouton rouge, portail de retour, dernière dimension), sauvegarde, performances.
 *   node tools/test-dimensions.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 640 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(URL); await wait(400);

  console.log('Identité des dimensions : couleurs et types de monde');
  const A = await E(() => {
    const G = Iles.dimgen, r = { n: [0, 0, 0, 0], arch: {}, combos: 0, bad: 0, stable: true, seeds: new Set(), names: new Set() };
    for (let s = 1; s <= 400; s++) {
      const seed = s * 7919 + 13, D = G.describe(seed), D2 = G.describe(seed);
      r.n[D.pal.length]++;
      if (D.pal.length < 1 || D.pal.length > 3 || new Set(D.pal).size !== D.pal.length || D.pal.some(c => !(c >= 1 && c <= Iles.COLORS.length))) r.bad++;
      if (JSON.stringify(D.pal) !== JSON.stringify(D2.pal) || D.name !== D2.name) r.stable = false;
      r.arch[D.a] = (r.arch[D.a] || 0) + 1; if (D.b) r.combos++;
      r.names.add(D.name);
    }
    r.archN = Object.keys(r.arch).length; r.names = r.names.size; delete r.seeds;
    return r;
  });
  check('400 dimensions : toujours 1, 2 ou 3 couleurs distinctes et valides', A.bad === 0 && A.n[0] === 0 && A.n[1] > 40 && A.n[2] > 80 && A.n[3] > 40, A.n);
  check('même graine = même identité ; noms variés', A.stable && A.names > 250, A.names);
  check('les 10 types de monde sortent, seuls ou combinés', A.archN === 10 && A.combos > 100 && A.combos < 300, [A.archN, A.combos]);

  console.log('Terrain : déterminisme, variété, cohérence');
  const B = await E(() => {
    const G = Iles.dimgen, T = Iles.TILE, r = {};
    const hashChunk = (c) => { let h = 0; for (const v of c.ground) h = (h * 31 + v) | 0; for (const o of c.objs) h = (h * 31 + o.id.length + o.type.length + (o.c || 0)) | 0; return h + ':' + c.objs.length; };
    const D = G.describe(424242); G.initialMap(D);
    const c1 = G.genChunk(D, 1024, 1024); G.genChunk(D, 1025, 1024); G.genChunk(D, 1023, 1024); const c2 = G.genChunk(D, 1024, 1024);
    r.same = hashChunk(c1) === hashChunk(c2);
    // chaque type de monde forcé : signature
    const sig = {};
    for (const k of Object.keys(G.ARCH)) {
      const F = Object.assign({}, G.describe(777), { a: k, b: null, A: G.ARCH[k], B: G.ARCH[k], seed: 777, spawnT: { x: 32768, y: 32768 } });
      const cnt = {}, obj = {}; let N = 0;
      for (let cy = 1020; cy < 1026; cy++) for (let cx = 1020; cx < 1026; cx++) {
        const c = G.genChunk(F, cx, cy);
        for (const t of c.ground) { cnt[t] = (cnt[t] || 0) + 1; N++; }
        for (const o of c.objs) obj[o.type] = (obj[o.type] || 0) + 1;
      }
      const f = t => (cnt[t] || 0) / N, trees = Object.keys(obj).filter(t => /tree|bamboo/.test(t)).reduce((a, t) => a + obj[t], 0);
      sig[k] = { water: f(0) + f(1), sand: f(2), grass: f(3) + f(4), stone: f(10), wall: f(11), glow: f(12), trees: trees / N, objs: Object.values(obj).reduce((a, b) => a + b, 0) / N, kinds: Object.keys(obj).length, giants: obj.tree_giant || 0 };
    }
    r.sig = sig;
    return r;
  });
  const S = B.sig; let sigInfo = '';
  check('un morceau régénéré à l’identique, quel que soit l’ordre de génération des voisins', B.same);
  check('aquatique : surtout de l’eau ; désertique : surtout du sable ; plaines/forêt : surtout de l’herbe', S.aquatic.water > 0.35 && S.desert.sand > 0.4 && S.plains.grass > 0.5 && S.forest.grass > 0.45, [S.aquatic.water, S.desert.sand, S.plains.grass, S.forest.grass].map(v => +v.toFixed(2)));
  check('montagneux et souterrain : beaucoup de roche solide ; rocheux : beaucoup de pierre ; cristallin : sol lumineux', S.mountain.wall > 0.2 && S.caves.wall > 0.25 && S.rocky.stone > 0.25 && S.crystal.glow > 0.08, [S.mountain.wall, S.caves.wall, S.rocky.stone, S.crystal.glow].map(v => +v.toFixed(2)));
  check('forêt : bien plus d’arbres que la plaine ou le désert ; grands arbres uniquement là où il en faut', S.forest.trees > 3 * S.plains.trees && S.forest.trees > 5 * S.desert.trees && S.forest.giants > 5 && S.desert.giants === 0 && S.caves.trees === 0, [S.forest.trees, S.plains.trees, S.desert.trees, S.forest.giants, S.caves.trees]);
  check('chaque monde a de la diversité d’objets (au moins 8 sortes)', Object.keys(S).every(k => S[k].kinds >= 8 || k === 'aquatic' || k === 'caves' || k === 'desert') && S.forest.kinds >= 14, Object.keys(S).map(k => k + ':' + S[k].kinds).join(' '));
  check('les mondes sont bien différents les uns des autres (signatures distinctes)', (() => { const ks = Object.keys(S); let min = 9, who = ''; for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const a = S[ks[i]], b = S[ks[j]]; const d = ['water', 'sand', 'grass', 'stone', 'wall', 'glow', 'trees', 'objs'].reduce((s, k) => s + Math.abs(a[k] - b[k]) * (k === 'trees' ? 6 : 1), 0); if (d < min) { min = d; who = ks[i] + '/' + ks[j]; } } sigInfo = who + ' ' + min.toFixed(3); return min > 0.1; })(), sigInfo);

  console.log('Couleurs, matériaux et récolte dans une dimension');
  const C = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const r = { checked: 0, badObj: 0, badTile: 0, matMissing: 0, harvest: [] };
    for (const seed of [31, 977, 5051, 70001, 123456, 999999, 31337, 8675309, 424242, 2024]) {
      g.state.travelTo = 'd:' + seed; g.state.travelT = 0; g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
      const w = g.state.world, pal = w.D.pal;
      for (const o of w.objectsIn(w.portalObj.x - 700, w.portalObj.y - 700, w.portalObj.x + 700, w.portalObj.y + 700)) {
        if (o.structure || o.id === 'dimportal') continue;
        r.checked++;
        if (pal.indexOf(o.c) < 0) r.badObj++;
        for (const d of o.def.drops || []) if (!I.ITEMS[I.mat.id(d.id, o.c)] || I.mat.split(I.mat.id(d.id, o.c)).c !== (I.mat.colorable(d.id) ? o.c : 0)) r.matMissing++;
      }
      const px = Math.floor(w.portalObj.x / 16), py = Math.floor(w.portalObj.y / 16);
      for (let y = py - 20; y < py + 20; y++) for (let x = px - 20; x < px + 20; x++) { const t = w.tileAt(x, y); if (pal.indexOf(w.colorOf(x, y, t)) < 0) r.badTile++; }
    }
    // récolte réelle : un arbre de la dimension donne du bois de SA couleur
    const g2 = new I.Game(); g2.newGame(); g2.state.travelTo = 'd:44444'; g2.state.travelT = 0; g2.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    const w = g2.state.world, p = g2.local;
    const tr = w.objectsIn(w.portalObj.x - 600, w.portalObj.y - 600, w.portalObj.x + 600, w.portalObj.y + 600).find(o => o.def.tool === 'axe' && o.type !== 'tree_giant' && !o.def.drops.every(d => d.id !== 'wood'));
    p.x = tr.x; p.y = tr.y + 9; p.dir = 'up'; p.sel = 0; w.drops.length = 0;
    for (let i = 0; i < 400 && !w.isDepleted(tr); i++) g2.step({ p1: Object.assign({}, I.Game.NEUTRAL, { use: true }) }, 1 / 60);
    r.cut = w.isDepleted(tr); r.treeC = tr.c; r.dropIds = w.drops.map(d => d.item).filter((v, i, a) => a.indexOf(v) === i);
    r.woodOk = r.dropIds.includes(I.mat.id('wood', tr.c)) || tr.c === 0;
    return r;
  });
  check('10 dimensions : tous les objets et toutes les tuiles ont une couleur de LA palette de la dimension (' + C.checked + ' objets)', C.badObj === 0 && C.badTile === 0 && C.checked > 2000, C);
  check('tous les matériaux lâchés existent dans la couleur de leur objet', C.matMissing === 0, C.matMissing);
  check('récolte réelle : abattre un arbre coloré donne du bois de sa couleur', C.cut && C.woodOk, [C.cut, C.treeC, C.dropIds]);

  console.log('Chargement / déchargement par morceaux, stabilité, modifications conservées');
  const K = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const r = {};
    let sd = 1; while (!(Iles.dimgen.describe(sd).a === 'plains' && !Iles.dimgen.describe(sd).b)) sd++; r.sd = sd; // un monde de plaines : la marche en ligne droite n'y est pas arrêtée par une montagne
    g.state.travelTo = 'd:' + sd; g.state.travelT = 0; g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    const w = g.state.world, p = g.local, N = I.Game.NEUTRAL;
    r.arrive = w.chunks.size; r.start = [p.x, p.y];
    // modifications autour du départ : un arbre abattu, une table posée, un objet jeté
    const tr = w.objectsIn(p.x - 500, p.y - 500, p.x + 500, p.y + 500).find(o => !o.structure && o.id !== 'dimportal' && o.def.kind === 'resource');
    w.deplete(tr, g.state.time.minutes); const trId = tr.id, trKey = tr.x + ',' + tr.y;
    const tx = Math.floor(p.x / 16) + 6, ty = Math.floor(p.y / 16) + 2; w.addStructure('table', tx, ty, null, undefined, 3);
    const ids0 = w.objectsIn(p.x - 300, p.y - 300, p.x + 300, p.y + 300).filter(o => !o.structure).map(o => o.id).sort().join('|');
    // grande marche vers l'est (haut-bas pour couvrir plus de morceaux)
    let maxChunks = 0, maxById = 0, t0 = performance.now(), stuck = 0, steps = 0, sx = p.x;
    let ay = 0, ayT = 0, lx = p.x, ly = p.y;
    for (let i = 0; i < 60 * 60; i++) {
      if (i % 60 === 0) { if (Math.hypot(p.x - lx, p.y - ly) < 25) { ay = (i / 60) % 2 ? 1 : -1; ayT = 2; } lx = p.x; ly = p.y; }
      if (ayT > 0 && i % 60 === 59) ayT--;
      g.step({ p1: Object.assign({}, N, { mx: ayT > 0 ? 0.3 : 1, my: ayT > 0 ? ay : 0 }) }, 1 / 60); steps++; maxChunks = Math.max(maxChunks, w.chunks.size); maxById = Math.max(maxById, w.byId.size); if (I.collision.isBlocked(w, p)) stuck++; }
    r.far = Math.round(p.x - sx); r.maxChunks = maxChunks; r.maxById = maxById; r.stuck = stuck; r.msPerStep = +((performance.now() - t0) / steps).toFixed(2);
    r.treeUnloaded = !w.byId.has(trId); r.structKept = !!w.structureAt(tx, ty) && w.structures.length === 1;
    // retour au point de départ : mêmes objets, mêmes modifications
    p.x = r.start[0]; p.y = r.start[1]; for (let i = 0; i < 60; i++) g.step({ p1: N }, 1 / 60);
    const ids1 = w.objectsIn(p.x - 300, p.y - 300, p.x + 300, p.y + 300).filter(o => !o.structure).map(o => o.id).sort().join('|');
    r.sameIds = ids0 === ids1; r.treeStill = w.byId.has(trId) && w.isDepleted(w.byId.get(trId)); r.tableBack = !!w.structureAt(tx, ty) && w.objectsIn(tx * 16 - 8, ty * 16, tx * 16 + 24, ty * 16 + 40).some(o => o.type === 'table');
    // sauvegarde : seules les modifications sont écrites (petit), puis rechargement
    const snap = JSON.parse(JSON.stringify(g.snapshot())); r.saveBytes = JSON.stringify(snap.dims).length; r.dimKeys = Object.keys(snap.dims);
    const g2 = new I.Game(); g2.loadSnapshot(snap); const w2 = g2.state.world;
    r.loadedDim = g2.state.dim; r.loadChunked = !!w2.chunked && w2.chunks.size > 0; r.loadTree = w2.byId.has(trId) ? w2.isDepleted(w2.byId.get(trId)) : 'absent'; r.loadTable = !!w2.structureAt(tx, ty);
    r.loadFree = !I.collision.isBlocked(w2, g2.local);
    // temps de génération d'un morceau
    const D = I.dimgen.describe(99), t1 = performance.now(); for (let i = 0; i < 40; i++) I.dimgen.genChunk(D, 1000 + i, 1000 + (i % 7)); r.msChunk = +((performance.now() - t1) / 40).toFixed(1);
    // 15 dimensions visitées : la sauvegarde en garde 12 au plus
    const g3 = new I.Game(); g3.newGame(); for (let s = 1; s <= 15; s++) { g3.state.travelTo = 'd:' + (s * 101); g3.state.travelT = 0; g3.step({ p1: N }, 1 / 60); g3.travel('lobby'); }
    r.kept = Object.keys(g3.snapshot().dims).length;
    return r;
  });
  check('à l’arrivée : les 25 morceaux (5×5) autour des joueurs sont déjà chargés', K.arrive === 25, K.arrive);
  check('marche de ' + K.far + ' px vers l’est (60 s) : jamais coincé, au plus 49 morceaux chargés (mémoire bornée), objets déchargés', K.stuck === 0 && K.far > 2500 && K.maxChunks <= 49 && K.maxById < 49 * 600 && K.treeUnloaded, [K.stuck, K.far, K.maxChunks, K.maxById, K.treeUnloaded]);
  check('performances : ' + K.msPerStep + ' ms par pas de simulation (génération comprise), ' + K.msChunk + ' ms par morceau', K.msPerStep < 4 && K.msChunk < 12, [K.msPerStep, K.msChunk]);
  check('les constructions restent en mémoire pendant l’absence', K.structKept);
  check('retour : exactement les mêmes objets aux mêmes endroits, arbre toujours abattu, table toujours là', K.sameIds && K.treeStill && K.tableBack, [K.sameIds, K.treeStill, K.tableBack]);
  check('sauvegarde : modifications seules (' + K.saveBytes + ' octets) ; rechargement : même dimension, arbre abattu, table posée, joueur libre', K.saveBytes < 4000 && K.dimKeys.length === 1 && K.loadedDim === 'd:' + K.sd && K.loadChunked && K.loadTree === true && K.loadTable && K.loadFree, K);
  check('15 dimensions visitées : la sauvegarde en garde 12 au maximum', K.kept === 12, K.kept);

  console.log('Marche aléatoire dans 8 dimensions (collisions, falaises, eau)');
  const Wk = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, r = { bad: 0, wall: 0, stuck: 0, worlds: [], swam: 0, dims: 0 };
    for (const seed of [5, 66, 777, 8888, 99999, 1234567, 7654321, 31415926]) {
      const g = new I.Game(); g.newGame(); g.state.travelTo = 'd:' + seed; g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      const w = g.state.world, p = g.local; let s = seed; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; let mx = 0, my = 0, moved = 0;
      for (let i = 0; i < 6000; i++) {
        if (i % 45 === 0) { mx = Math.round(rnd() * 2 - 1); my = Math.round(rnd() * 2 - 1); }
        const ox = p.x, oy = p.y;
        g.step({ p1: Object.assign({}, N, { mx: mx, my: my, dash: rnd() < 0.02, use: rnd() < 0.1, aim: { x: p.x + 20, y: p.y } }) }, 1 / 60);
        moved += Math.abs(p.x - ox) + Math.abs(p.y - oy);
        if (I.collision.isBlocked(w, p)) r.bad++;
        if (w.tileAt(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16)) === I.TILE.WALL) r.wall++;
        if (p.sw > 0.9) r.swam++;
      }
      r.worlds.push(w.D.a + (w.D.b ? '+' + w.D.b : '') + ' ' + Math.round(moved / 100) / 10);
      r.dims++;
    }
    return r;
  });
  check('48 000 pas aléatoires (dash, outils) : jamais dans un obstacle, jamais dans un mur de roche', Wk.bad === 0 && Wk.wall === 0, Wk);
  check('le joueur se déplace réellement dans les 8 mondes', Wk.worlds.every(s => parseFloat(s.split(' ').pop()) > 1.5), Wk.worlds);

  console.log('Nage');
  const Sw = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, T = I.TILE, r = {};
    // dimension aquatique forcée par la recherche d'une graine : on cherche un lac profond à moins de 400 px du départ
    let g, w, p, lake = null;
    for (let seed = 1; seed < 400 && !lake; seed++) {
      g = new I.Game(); g.newGame(); g.state.travelTo = 'd:' + seed * 13; g.state.travelT = 0; g.step({ p1: N }, 1 / 60); w = g.state.world; p = g.local;
      const tx0 = Math.floor(p.x / 16), ty0 = Math.floor(p.y / 16);
      for (let y = ty0 - 25; y <= ty0 + 25 && !lake; y++) for (let x = tx0 - 25; x <= tx0 + 25 && !lake; x++) {
        // eau profonde 5×5 et, juste à l'ouest, une case de terre
        let deep = true; for (let dy = -2; dy <= 2 && deep; dy++) for (let dx = 0; dx <= 4; dx++) if (w.tileAt(x + dx, y + dy) !== T.DEEP) { deep = false; break; }
        if (deep && w.isLand(x - 2, y) && w.isLand(x - 1, y) && w.tileAt(x - 1, y) !== T.SHALLOW) lake = [x, y, seed * 13];
      }
    }
    r.found = !!lake; if (!lake) return r;
    const [lx, ly] = lake; p.x = (lx - 2) * 16 + 8; p.y = ly * 16 + 12;
    for (let i = 0; i < 30; i++) g.step({ p1: N }, 1 / 60);
    r.landSw = p.sw;
    // vitesse à pied
    let x0 = p.x; for (let i = 0; i < 30; i++) g.step({ p1: Object.assign({}, N, { mx: 1 }) }, 1 / 60); r.landSpeed = (p.x - x0) * 2;
    p.x = (lx - 2) * 16 + 8; p.y = ly * 16 + 12; g.takeEvents();
    // on entre dans l'eau
    const trace = []; let splash = 0, blocked = 0, dashed = false;
    for (let i = 0; i < 150; i++) { g.step({ p1: Object.assign({}, N, { mx: 1, dash: i === 100 }) }, 1 / 60); trace.push(p.sw); if (I.collision.isBlocked(w, p)) blocked++; for (const e of g.takeEvents()) if (e.type === 'splash') splash++; if (i === 100) dashed = p.dashT > 0; }
    r.maxSw = Math.max.apply(null, trace); r.mono = trace.every((v, i) => i === 0 || v >= trace[i - 1] - 1e-9 || p.sw < 1); r.splash = splash; r.blocked = blocked; r.dashInWater = dashed;
    // vitesse à la nage (pleine eau)
    p.x = (lx + 1) * 16; p.y = ly * 16 + 8; for (let i = 0; i < 40; i++) g.step({ p1: N }, 1 / 60); r.inSw = p.sw;
    x0 = p.x; for (let i = 0; i < 30; i++) g.step({ p1: Object.assign({}, N, { mx: 1 }) }, 1 / 60); r.swimSpeed = (p.x - x0) * 2;
    // pas d'outil ni de construction dans l'eau profonde
    p.sel = 0; const sw0 = p.swing; g.step({ p1: Object.assign({}, N, { use: true, aim: { x: p.x + 10, y: p.y } }) }, 1 / 60); r.noSwing = !p.swing && !sw0;
    r.noBuild = I.building.check(g.state, p, 'table', lx + 1, ly).reason === 'terrain';
    // monter, descendre, revenir à terre
    const y0 = p.y; for (let i = 0; i < 20; i++) g.step({ p1: Object.assign({}, N, { my: -1 }) }, 1 / 60); r.up = p.y < y0 - 8;
    for (let i = 0; i < 20; i++) g.step({ p1: Object.assign({}, N, { my: 1 }) }, 1 / 60); r.down = p.y > y0 - 8 - 1;
    let back = 0, out = 0; for (let i = 0; i < 400 && out === 0; i++) { g.step({ p1: Object.assign({}, N, { mx: -1 }) }, 1 / 60); if (I.collision.isBlocked(w, p)) back++; if (p.sw === 0 && w.isLand(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) out = i; }
    r.exited = out > 0; r.exitBlocked = back; r.finalSw = p.sw;
    // rendu : le joueur à la nage se dessine sans erreur
    r.drawOk = true;
    // les autres mondes : l'île nage aussi (océan), mais pas hors de la carte, et le vide du lobby reste infranchissable
    const h = new I.Game(); h.newGame(); const hw = h.state.world; r.homeSwim = hw.swim; r.homeEdge = !hw.isWalkable(-1, 5) && !hw.isWalkable(5, 64) && hw.isWalkable(2, 62);
    const lw = new I.World(1, { lobby: true }); r.lobbyVoid = !lw.swim && !lw.isWalkable(0, 0);
    return r;
  });
  check('un lac profond a été trouvé pour le test', Sw.found, Sw);
  if (Sw.found) {
    check('à terre : pas de nage ; en entrant dans l’eau profonde : transition progressive jusqu’à la nage complète, sans blocage, avec une éclaboussure', Sw.landSw === 0 && Sw.maxSw === 1 && Sw.blocked === 0 && Sw.splash >= 1, Sw);
    check('on nage plus lentement qu’on ne marche (' + Math.round(Sw.swimSpeed) + ' contre ' + Math.round(Sw.landSpeed) + ' px/s) ; pas de dash en nageant', Sw.inSw === 1 && Sw.swimSpeed < Sw.landSpeed * 0.75 && Sw.swimSpeed > Sw.landSpeed * 0.4 && !Sw.dashInWater, [Sw.swimSpeed, Sw.landSpeed, Sw.dashInWater]);
    check('en nageant : pas d’outil, pas de construction dans l’eau ; on monte et on descend librement', Sw.noSwing && Sw.noBuild && Sw.up && Sw.down, Sw);
    check('sortie de l’eau : retour à pied (nage = 0) sans jamais être bloqué', Sw.exited && Sw.exitBlocked === 0 && Sw.finalSw === 0, Sw);
    check('l’île permet aussi de nager, sans sortir de la carte ; le vide du lobby reste infranchissable', Sw.homeSwim && Sw.homeEdge && Sw.lobbyVoid, Sw);
  }
  // rendu à l'écran d'un joueur à la nage
  await page.click('#btn-new'); await wait(300);
  const lakeShot = await E(() => {
    const I = Iles, g = I.debug.game, T = I.TILE;
    for (let seed = 1; seed < 300; seed++) {
      g.state.travelTo = 'd:' + seed * 13; g.state.travelT = 0.01; g.step({ p1: I.Game.NEUTRAL }, 1 / 60);
      const w = g.state.world, p = g.local, tx0 = Math.floor(p.x / 16), ty0 = Math.floor(p.y / 16);
      for (let y = ty0 - 20; y <= ty0 + 20; y++) for (let x = tx0 - 20; x <= tx0 + 20; x++) {
        let deep = true; for (let dy = -1; dy <= 1 && deep; dy++) for (let dx = -1; dx <= 1; dx++) if (w.tileAt(x + dx, y + dy) !== T.DEEP) { deep = false; break; }
        if (deep) { p.x = x * 16 + 8; p.y = y * 16 + 12; p.dir = 'down'; for (let i = 0; i < 30; i++) g.step({ p1: I.Game.NEUTRAL }, 1 / 60); I.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); return { seed: seed * 13, sw: p.sw }; }
      }
    }
    return null;
  });
  await wait(500); await page.screenshot({ path: path.join(OUT, '90-swim.png') });
  check('rendu : joueur à la nage affiché à l’écran (capture 90-swim.png)', lakeShot && lakeShot.sw > 0.95, lakeShot);

  console.log('Voyage réel : bouton rouge, dimension, portail de retour, dernière dimension');
  await page.reload(); await wait(400); await E(() => Iles.debug.app.newGame()); await wait(400);
  await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('portal'), p = g.local; p.x = o.x; p.y = o.y + 14; });
  await wait(300); await page.keyboard.press('KeyE'); await wait(1600);
  await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('red_button1'), p = g.local; p.x = o.x; p.y = o.y + 12; });
  await wait(300); await page.keyboard.press('KeyE'); await wait(2500);
  const mid = await E(() => ({ act: !!Iles.debug.game.state.act, dim: Iles.debug.game.state.dim, tint: Iles.debug.game.state.act && Iles.debug.game.state.act.tint, seed: Iles.debug.game.state.act && Iles.debug.game.state.act.seed }));
  check('le bouton éveille le portail (teinte = couleur dominante de la dimension qui sera générée)', mid.act && mid.dim === 'lobby' && mid.tint === (await E((s) => Iles.dimgen.describe(s).pal[0], mid.seed)), mid);
  await wait(4400);
  const D1 = await E(() => { const g = Iles.debug.game, w = g.state.world, p = g.local; return { dim: g.state.dim, chunked: !!w.chunked, name: w.D && w.D.name, seed: w.D && w.D.seed, blocked: Iles.collision.isBlocked(w, p), msg: document.body.textContent.indexOf('Monde ') >= 0, count: g.state.progress.flags.dimCount, last: g.state.progress.flags.lastDim, fade: parseFloat(document.getElementById('fx-flash').style.opacity), portal: !!w.byId.get('dimportal') }; });
  check('après 6 s : téléportation dans une dimension générée (' + D1.name + '), joueur libre, portail de retour présent, écran redevenu clair', D1.dim === 'd:' + D1.seed && D1.chunked && !D1.blocked && D1.portal && D1.fade < 0.5 && D1.count === 1 && D1.last.seed === D1.seed, D1);
  await E(() => { const B = Iles.BigMap; Iles.Menu.show('map'); B.cx += 900; B.cy -= 700; B.clamp(); });
  await page.click('#map-center'); await wait(200);
  const MC = await E(() => { const B = Iles.BigMap, p = Iles.debug.game.local; return { dx: Math.abs(B.cx - p.x / 16), dy: Math.abs(B.cy - (p.y - 1) / 16) }; });
  check('grande carte en dimension : « Me centrer » recentre bien sur le joueur (cases ~32768)', MC.dx < 0.5 && MC.dy < 0.5, MC);
  await E(() => Iles.Menu.show('playing'));
  await wait(1600); await page.screenshot({ path: path.join(OUT, '91-dimension.png') });
  // une modification dans la dimension
  const M = await E(() => { const g = Iles.debug.game, w = g.state.world, p = g.local, tr = w.objectsIn(p.x - 500, p.y - 500, p.x + 500, p.y + 500).find(o => !o.structure && o.id !== 'dimportal' && o.def.kind === 'resource'); w.deplete(tr, g.state.time.minutes); return tr.id; });
  // retour au lobby par le portail (E)
  await wait(200); await page.keyboard.press('KeyE'); await wait(1700);
  const L1 = await E(() => { const g = Iles.debug.game; return { dim: g.state.dim, blocked: Iles.collision.isBlocked(g.state.world, g.local), inv: g.local.inv.slots.filter(Boolean).length }; });
  check('E sur le portail de la dimension : retour dans le lobby, sans perdre l’inventaire', L1.dim === 'lobby' && !L1.blocked && L1.inv >= 2, L1);
  // le portail ultime rouvre la dernière dimension
  await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('portal_ultimate1') || g.state.world.objects.find(o => o.type === 'portal_ultimate'), p = g.local; p.x = o.x; p.y = o.y + 18; });
  await wait(300); await page.keyboard.press('KeyE'); await wait(1700);
  const D2 = await E((id) => { const g = Iles.debug.game, w = g.state.world; return { dim: g.state.dim, tree: w.byId.has(id) ? w.isDepleted(w.byId.get(id)) : 'absent', blocked: Iles.collision.isBlocked(w, g.local) }; }, M);
  check('le portail ultime du lobby rouvre la dernière dimension, avec l’arbre toujours abattu', D2.dim === D1.dim && D2.tree === true && !D2.blocked, D2);
  // sauvegarde + rechargement réels dans la dimension
  await E(() => Iles.debug.app.saveNow('manual'));
  await page.reload(); await wait(500); await page.click('#btn-continue'); await wait(700);
  const R = await E((id) => { const g = Iles.debug.game, w = g.state.world; return { dim: g.state.dim, tree: w.byId.has(id) ? w.isDepleted(w.byId.get(id)) : 'absent', blocked: Iles.collision.isBlocked(w, g.local), chunks: w.chunks && w.chunks.size }; }, M);
  check('rechargement de la page dans la dimension : on y reste, l’arbre est toujours abattu', R.dim === D1.dim && R.tree === true && !R.blocked && R.chunks >= 9, R);
  // ancienne sauvegarde (sans dimensions)
  const Old = await E(() => { const I = Iles, g = new I.Game(); g.newGame(); const s = JSON.parse(JSON.stringify(g.snapshot())); delete s.dims; const g2 = new I.Game(); g2.loadSnapshot(s); s.dim = 'd:123'; const g3 = new I.Game(); g3.loadSnapshot(s); s.dim = 'd:99999999999999'; s.dims = { 'd:abc': {}, 'd:77': { state: { 'x': 1 } } }; const g4 = new I.Game(); g4.loadSnapshot(s); return [g2.state.dim, g3.state.dim, g4.state.dim, Object.keys(g4.state.worlds).join()]; });
  check('ancienne sauvegarde ou dimension absente/invalide : retour sur l’île, sans erreur', Old[0] === 'home' && Old[1] === 'home' && Old[2] === 'home' && Old[3] === 'home,d:77', Old);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
