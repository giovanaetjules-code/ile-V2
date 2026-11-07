/*
 * Décor et couleurs : sprites de tous les objets, teinture (16 couleurs), pose d'objets colorés, sauvegarde.
 *   node tools/test-decor.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  await page.goto(URL); await wait(400);

  console.log('Données et sprites');
  const D = await E(() => {
    const I = Iles, S = I.debug.renderer.S, r = { missingSprite: [], missingIcon: [], noRecipe: [], badIns: [], badPlace: [] };
    for (const d of I.DECOR) {
      const def = I.OBJECTS[d.id];
      if (!S.obj[def.sprite] || !S.obj[def.sprite][0].c.width) r.missingSprite.push(d.id);
      if (!S.iconURL[d.id] || S.iconURL[d.id].length < 200) r.missingIcon.push(d.id);
      const rec = I.crafting.BY_ID[d.id];
      if (!rec) r.noRecipe.push(d.id); else for (const [it] of rec.ins) if (!I.ITEMS[it]) r.badIns.push(d.id + ':' + it);
      if (I.ITEMS[d.id].place !== d.id || !def.structure) r.badPlace.push(d.id);
    }
    r.n = I.DECOR.length; r.noBrush = !I.ITEMS.brush; r.colors = I.COLORS.length;
    r.rowsOk = I.DECOR.every(d => !d.rows || d.rows.every(row => row.length === d.w));
    return r;
  });
  check('toutes les lignes de sprite ont la bonne largeur', D.rowsOk);
  check(D.n + ' objets de décor : sprite, icône, recette, objet posable', !D.missingSprite.length && !D.missingIcon.length && !D.noRecipe.length && !D.badIns.length && !D.badPlace.length, D);
  check('16 couleurs, et plus de pinceau (la couleur vient des matériaux)', D.noBrush && D.colors === 16, D);

  console.log('Teinture');
  const T = await E(() => {
    const I = Iles, S = I.debug.renderer.S, e = S.obj.table[0], r = {};
    const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data);
    const base = px(e.c, 5, 4), same = I.tint.entry(e, 0) === e;
    const outs = []; for (let c = 1; c <= 16; c++) outs.push(px(I.tint.entry(e, c).c, 5, 4).join(','));
    r.same = same; r.base = base; r.distinct = new Set(outs).size; r.cached = I.tint.entry(e, 3) === I.tint.entry(e, 3);
    const red = px(I.tint.entry(e, 1).c, 5, 4), blue = px(I.tint.entry(e, 8).c, 5, 4);
    r.redDominant = red[0] > red[1] * 1.5 && red[0] > red[2] * 1.5; r.blueDominant = blue[2] > blue[0] * 1.5;
    // le contour reste sombre, la transparence reste transparente
    const ol = px(I.tint.entry(e, 5).c, 0, 0), ol0 = px(e.c, 0, 0); r.alphaKept = ol[3] === ol0[3];
    r.clamp = [I.tint.clamp(99), I.tint.clamp(-1), I.tint.clamp(16), I.tint.clamp('x')];
    // marche aussi sur un objet naturel (base des mondes spéciaux)
    const tree = S.obj.tree_oak[0]; r.treeOk = I.tint.entry(tree, 9).c.width === tree.c.width;
    return r;
  });
  check('couleur 0 = sprite d’origine, résultat mis en cache', T.same && T.cached);
  check('les 16 couleurs donnent 16 rendus différents', T.distinct === 16, T);
  check('rouge dominant en rouge, bleu en bleu', T.redDominant && T.blueDominant, T);
  check('la transparence est conservée', T.alphaKept);
  check('indices invalides ramenés à 0', JSON.stringify(T.clamp) === '[0,0,16,0]', T.clamp);
  check('un arbre peut aussi être recoloré', T.treeOk);

  console.log('Pose d’objets colorés (la couleur vient de l’objet), sauvegarde');
  await page.click('#btn-new'); await wait(400);
  const P = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, st = g.state, w = st.world, B = I.building, N = I.Game.NEUTRAL, r = {};
    p.inv.resize(40);
    for (const d of I.DECOR) p.inv.add(d.id, 1);
    p.inv.add('table~blue', 1); p.inv.add('carpet~lime', 1);
    const free = (type) => { for (let d = 1; d < 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const tx = Math.floor(p.x / 16) + dx, ty = Math.floor(p.y / 16) + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === d && B.check(st, p, type, tx, ty).ok) return [tx, ty]; } return null; };
    const put = (id) => { const t = free(I.ITEMS[id].place), slot = p.inv.slots.findIndex(s => s && s.id === id); return { t, pl: B.place(st, p, slot, t[0], t[1], []) }; };
    const a = put('table'); r.natural = a.pl.ok && a.pl.obj.c;
    const b = put('table~blue'); r.blue = b.pl.ok && b.pl.obj.c;
    r.noPaint = !B.paint && !('cs' in N);
    // retirer un objet coloré rend l'objet de la même couleur
    p.x = b.pl.obj.x; p.y = b.pl.obj.y + 10; p.inv.slots.forEach((s, i) => { if (s && s.id === 'table~blue') p.inv.slots[i] = null; });
    const rm = B.remove(st, p, b.t[0], b.t[1], []); r.back = rm.ok && p.inv.count('table~blue');
    const b2 = put('table~blue'); const o = b2.pl.obj;
    const cp = put('carpet~lime'); r.carpetColor = cp.pl.ok && cp.pl.obj.c; r.walkOnCarpet = !cp.pl.obj.rect;
    const tw = free('wall_stone'); const sw = p.inv.slots.findIndex(s => s && s.id === 'wall_stone'); const wl = B.place(st, p, sw, tw[0], tw[1], []);
    p.x = wl.obj.x; p.y = wl.obj.y + 6.5; for (let i = 0; i < 40; i++) g.step({ p1: Object.assign({}, N, { my: -1 }) }, 1 / 60); r.wallSolid = p.y >= wl.obj.y - 0.01;
    // sauvegarde / rechargement : les couleurs sont conservées
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    const g2 = new I.Game(); g2.loadSnapshot(snap);
    const o2 = g2.state.world.structureAt(o.tx, o.ty), c2 = g2.state.world.floorAt(cp.t[0], cp.t[1]);
    r.reload = { table: o2 && o2.c, carpet: c2 && c2.c };
    // anciennes sauvegardes (avec « color » du joueur, objet « brush », sans couleur d'objet)
    snap.players.p1.color = 5; snap.players.p1.inv[0] = { id: 'brush', qty: 1 }; snap.world.structures.forEach(s => delete s.c);
    const g3 = new I.Game(); g3.loadSnapshot(snap); r.old = { tc: g3.state.world.structureAt(o.tx, o.ty).c, loaded: !!g3.local, noBrush: !g3.local.inv.slots.some(s => s && s.id === 'brush') };
    snap.world.structures[0].c = 999; const g4 = new I.Game(); g4.loadSnapshot(snap); r.bad = g4.state.world.structures[0].c;
    return r;
  });
  check('un objet normal est naturel, un objet « bleu » se pose bleu', P.natural === 0 && P.blue === 8, P);
  check('plus de pinceau ni de changement de couleur par touche', P.noPaint, P);
  check('retirer un objet coloré rend l’objet de la même couleur', P.back === 1, P);
  check('un tapis vert clair se pose, sans collision', P.carpetColor === 4 && P.walkOnCarpet, P);
  check('un mur est solide', P.wallSolid, P);
  check('couleurs conservées après sauvegarde / rechargement', P.reload.table === 8 && P.reload.carpet === 4, P.reload);
  check('anciennes sauvegardes (couleur de joueur, pinceau) : chargées, objets naturels', P.old.tc === 0 && P.old.loaded && P.old.noBrush, P.old);
  check('couleur invalide dans une sauvegarde : ramenée à 0', P.bad === 0, P.bad);

  console.log('Interface : souris, aperçu et crafts');
  await E(() => { const p = Iles.debug.game.local; p.inv.slots.fill(null); p.inv.add('axe', 1); p.inv.add('table', 2); p.inv.add('bookshelf~blue', 1); p.inv.add('banner~red', 1); p.inv.add('statue', 1); p.inv.add('carpet~yellow', 4); });
  const free = await E(() => { const g = Iles.debug.game, p = g.local, w = g.state.world, B = Iles.building; const cx0 = Math.floor(p.x / 16), cy0 = Math.floor(p.y / 16);
    for (let d = 0; d < 40; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const cx = cx0 + dx, cy = cy0 + dy; p.x = cx * 16 + 8; p.y = cy * 16 + 14; let ok = true;
      for (let y = -2; y <= 3 && ok; y++) for (let x = -3; x <= 3 && ok; x++) if (Math.hypot(x * 16, y * 16) <= 56 && !B.check(g.state, p, 'carpet', cx + x, cy + y).ok && !(x === 0 && y === 0)) ok = false;
      if (ok) { Iles.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); return [cx, cy]; } } return null; });
  await wait(300);
  const toScreen = (t) => E((t) => { const c = Iles.debug.cam, s = Iles.debug.renderer.scale; return { x: (t[0] * 16 + 8 - c.rx) * s, y: (t[1] * 16 + 8 - c.ry) * s }; }, t);
  const sel = (id) => E((id) => { const p = Iles.debug.game.local; p.sel = p.inv.slots.findIndex(s => s && s.id === id); }, id);
  await E(() => { const inv = Iles.debug.game.local.inv; inv.sort(8); });
  const hot = await E(() => Iles.debug.game.local.inv.slots.slice(0, 8).map(s => s && s.id));
  check('objets colorés dans la barre rapide (le tri les garde)', hot.includes('table') && hot.includes('bookshelf~blue') && hot.includes('statue') && hot.includes('carpet~yellow'), hot);
  async function put(id, dx, dy) {
    await sel(id); const sp = await toScreen([free[0] + dx, free[1] + dy]);
    await page.mouse.move(sp.x, sp.y); await wait(120); await page.mouse.click(sp.x, sp.y); await wait(220);
  }
  await put('table', 2, 1);
  await put('bookshelf~blue', -2, 1);
  await put('banner~red', 2, -1);
  await put('statue', -2, -1);
  await sel('carpet~yellow'); { const a = await toScreen([free[0] - 1, free[1] + 2]), b = await toScreen([free[0] + 1, free[1] + 2]); await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 0; i <= 6; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6); await wait(40); } await page.mouse.up(); await wait(200); }
  const built = await E((b) => { const w = Iles.debug.game.state.world; const q = (x, y) => w.structureAt(b[0] + x, b[1] + y); return { table: q(2, 1) && q(2, 1).c, shelf: q(-2, 1) && q(-2, 1).c, banner: q(2, -1) && q(2, -1).c, statue: !!q(-2, -1), carpets: [-1, 0, 1].filter(x => { const f = w.floorAt(b[0] + x, b[1] + 2); return f && f.c === 3; }).length }; }, free);
  check('pose à la souris : table naturelle, étagère bleue, bannière rouge, statue, rangée de tapis jaunes', built.table === 0 && built.shelf === 8 && built.banner === 1 && built.statue && built.carpets >= 2, built);
  await page.mouse.move(640, 650); await wait(300);
  await page.screenshot({ path: path.join(OUT, '50-decor.png') });

  // établi : liste longue, tout visible et faisable
  await E(() => { const p = Iles.debug.game.local; p.inv.add('plank', 60); p.inv.add('stone', 60); p.inv.add('fiber', 40); p.inv.add('stick', 10); p.inv.add('wood', 10); p.inv.add('rope', 3); p.inv.add('copper_bar', 2); p.inv.add('pinecone', 4); p.inv.add('petal', 6); });
  await E(() => { const p = Iles.debug.game.local, o = Iles.debug.game.state.world.byId.get('workbench'); p.x = o.x; p.y = o.y + 10; Iles.Menu.openCrafting('bench'); }); await wait(300);
  const rec = await E(() => { const U = Iles.CraftingUI; U.tab = 'all'; let n = 0, on = 0; for (let pg = 0; pg < 12; pg++) { U.page = pg; U.render(true); const c = [...document.querySelectorAll('#craft-list .rcard[data-recipe]')]; n += c.length; on += c.filter(x => x.classList.contains('can')).length; } U.page = 0; U.render(true); return { n, on }; });
  check('à l’établi : toutes les recettes de décor sont listées (' + rec.n + ')', rec.n >= 30, rec);
  await page.screenshot({ path: path.join(OUT, '51-bench-list.png') });
  const before = await E(() => Iles.debug.game.local.inv.count('statue'));
  await E(() => Iles.CraftingUI.select('statue')); await page.click('#craft-do'); await wait(300);
  check('fabriquer une statue à l’établi', await E((b) => Iles.debug.game.local.inv.count('statue') === b + 1, before));
  await page.keyboard.press('Escape'); await wait(200);

  // sauvegarde réelle + rechargement de la page
  await E(() => Iles.debug.app.saveNow('manual'));
  const sig = () => E(() => Iles.debug.game.state.world.structures.map(o => o.type + o.tx + ',' + o.ty + ':' + (o.c | 0)).sort().join('|'));
  const s1 = await sig();
  await page.reload(); await wait(500); await page.click('#btn-continue'); await wait(400);
  check('rechargement de la page : décor et couleurs identiques', (await sig()) === s1 && s1.includes(':8') && s1.includes(':1'));
  await wait(200); await page.screenshot({ path: path.join(OUT, '52-after-reload.png') });

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
