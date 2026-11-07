/*
 * Nature supplémentaire : 34 types (arbres, rochers, plantes), génération, récolte réelle de chaque type,
 * compatibilité des anciennes sauvegardes (identifiants d'objets inchangés), charbon, sauvegarde.
 *   node tools/test-nature.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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

  console.log('Données, sprites, icônes');
  const D = await E(() => {
    const I = Iles, S = I.debug.renderer.S, r = { noSprite: [], noDef: [], badDrop: [], noIcon: [], noGen: [] };
    for (const n of I.NATURE) {
      const def = I.OBJECTS[n.id];
      if (!def) { r.noDef.push(n.id); continue; }
      if (!S.obj[n.id] || S.obj[n.id].length !== n.spr || !S.obj[n.id].every(e => e.c.width > 2)) r.noSprite.push(n.id);
      if (def.spriteCut && !S.obj[def.spriteCut]) r.noSprite.push(n.id + ':cut');
      for (const d of def.drops) if (!I.ITEMS[d.id]) r.badDrop.push(n.id + ':' + d.id);
      if (!n.gen || !(n.gen.p > 0)) r.noGen.push(n.id);
      if (!S.shadow[def.shadow || 'tree'] && def.shadow) r.noSprite.push(n.id + ':shadow');
    }
    const newItems = Object.keys(I.NATURE_ICONS);
    for (const id of newItems) if (!S.iconURL[id] || S.iconURL[id].length < 200 || !I.ITEMS[id].name) r.noIcon.push(id);
    r.n = I.NATURE.length; r.items = newItems.length; r.kinds = [...new Set(I.NATURE.map(n => I.OBJECTS[n.id].kind))];
    return r;
  });
  check(D.n + ' types de nature, tous avec définition, sprites, ombre et butin valides', D.n >= 30 && !D.noDef.length && !D.noSprite.length && !D.badDrop.length && !D.noGen.length, D);
  check(D.items + ' nouveaux objets d’inventaire avec nom et icône', D.items >= 12 && !D.noIcon.length, D.noIcon);

  console.log('Génération du monde');
  const G = await E((baseline) => {
    const I = Iles, t0 = performance.now(), w = new I.World(I.config.DEMO_SEED), ms = performance.now() - t0;
    const byId = new Map(w.objects.map(o => [o.id, o.type])), changed = baseline.filter(s => { const [id, type] = s.split('='); return id !== 'house' && byId.get(id) !== type; }); // la maison préconstruite a été retirée volontairement
    const cnt = {}; for (const o of w.objects) cnt[o.type] = (cnt[o.type] || 0) + 1;
    const missing = I.NATURE.filter(n => !cnt[n.id]).map(n => n.id);
    // aucun objet sur l'eau, ni sur la maison / le portail, un seul objet par case
    const tiles = new Set(); let dup = 0, bad = 0;
    for (const o of w.objects) { if (!o.structure && o.id !== 'house' && o.id !== 'portal') { const k = Math.floor(o.x / 16) + ',' + Math.floor((o.y - 1) / 16); if (tiles.has(k)) dup++; tiles.add(k); } }
    for (const o of w.objects) if (I.NATURE.some(n => n.id === o.type) && !w.isWalkable(Math.floor(o.x / 16), Math.floor((o.y - 1) / 16))) bad++;
    return { ms: Math.round(ms), total: w.objects.length, changed: changed.length, missing, dup, bad, nNew: w.objects.filter(o => I.OBJECTS[o.type] && I.NATURE.some(n => n.id === o.type)).length };
  }, baseline);
  check('les ' + baseline.length + ' objets d’origine gardent le même identifiant et le même type (anciennes sauvegardes)', G.changed === 0, G);
  check('chaque type de nature apparaît au moins une fois sur l’île', G.missing.length === 0, G.missing);
  check('un seul objet par case, aucun sur l’eau (' + G.nNew + ' nouveaux objets)', G.dup === 0 && G.bad === 0, G);
  check('génération rapide (' + G.ms + ' ms)', G.ms < 200, G.ms);

  console.log('Récolte réelle de chaque type (outil, coups, butin ramassé)');
  const H = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const st = g.state, w = st.world, p = g.local, N = I.Game.NEUTRAL, out = { fail: [], ok: 0 };
    const reset = () => { p.inv.slots.fill(null); p.inv.add('axe', 1); p.inv.add('pickaxe_iron', 1); w.drops.length = 0; };
    for (const n of I.NATURE) {
      reset(); let o = null, placed = false;
      for (const q of w.objects) {
        if (q.type !== n.id || w.isDepleted(q)) continue;
        for (const off of [[0, 10], [12, 4], [-12, 4], [0, -2], [14, 10], [-14, 10], [0, 18], [0, -14]]) { p.x = q.x + off[0]; p.y = q.y + off[1]; if (!I.collision.isBlocked(w, p)) { placed = true; break; } }
        if (placed) { o = q; break; }
      }
      if (!o) { out.fail.push(n.id + ':bloqué'); continue; }
      const def = o.def, c = def.center || [0, -4];
      const aim = { x: o.x + c[0], y: o.y + c[1] };
      let steps = 0;
      if (def.kind === 'resource') {
        const slot = def.tool === 'axe' ? 0 : 1;
        for (; steps < 1800 && !w.isDepleted(o); steps++) g.step({ p1: Object.assign({}, N, { use: true, aim: aim, hotbar: steps === 0 ? slot : null }) }, 1 / 60);
      } else {
        g.step({ p1: N }, 1 / 60);
        for (; steps < 5 && !w.isDepleted(o); steps++) g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60);
      }
      for (let k = 0; k < 150; k++) g.step({ p1: N }, 1 / 60); // le butin est attiré et ramassé
      g.takeEvents();
      const need = def.drops.filter(d => d.chance === 1 && d.min >= 1);
      const missingDrop = need.filter(d => p.inv.count(d.id) < d.min);
      if (!w.isDepleted(o)) out.fail.push(n.id + ':non récolté');
      else if (missingDrop.length) out.fail.push(n.id + ':butin ' + missingDrop.map(d => d.id).join(','));
      else out.ok++;
    }
    // l'état « récolté » survit à une sauvegarde / un rechargement
    const o2 = w.objects.find(q => q.type === 'tree_birch' && !w.isDepleted(q)) || w.objects.find(q => w.isDepleted(q));
    const snap = JSON.parse(JSON.stringify(g.snapshot())), g2 = new I.Game(); g2.loadSnapshot(snap);
    const dep = w.objects.filter(q => w.isDepleted(q)).map(q => q.id), dep2 = g2.state.world.objects.filter(q => g2.state.world.isDepleted(q)).map(q => q.id);
    out.persist = dep.length > 20 && JSON.stringify(dep.sort()) === JSON.stringify(dep2.sort());
    out.nDep = dep.length;
    return out;
  });
  check('les ' + H.ok + ' types de nature se récoltent et donnent leur butin', H.fail.length === 0, H.fail);
  check('les objets récoltés restent récoltés après sauvegarde (' + H.nDep + ')', H.persist, H);

  console.log('Charbon et nouveaux objets');
  const C = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const p = g.local, st = g.state, N = I.Game.NEUTRAL;
    p.inv.add('furnace', 1); p.inv.add('copper_ore', 2); p.inv.add('coal', 1); p.inv.add('apple', 3); p.inv.add('bamboo', 2);
    let t = null; for (let d = 1; d < 4 && !t; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const tx = Math.floor(p.x / 16) + dx, ty = Math.floor(p.y / 16) + dy; if (!t && I.building.check(st, p, 'furnace', tx, ty).ok) t = [tx, ty]; }
    const f = I.building.place(st, p, p.inv.slots.findIndex(s => s && s.id === 'furnace'), t[0], t[1], []).obj;
    p.x = f.x; p.y = f.y + 10;
    const r = {};
    r.apple = I.containers.put(p, f, p.inv.slots.findIndex(s => s && s.id === 'apple')).reason;
    I.containers.put(p, f, p.inv.slots.findIndex(s => s && s.id === 'copper_ore')); r.coal = I.containers.put(p, f, p.inv.slots.findIndex(s => s && s.id === 'coal')).ok;
    for (let i = 0; i < 60 * 7; i++) g.step({ p1: N }, 1 / 60);
    r.bar = f.data.output && f.data.output.qty;
    return r;
  });
  check('le charbon est un combustible : 2 minerais → 1 lingot', C.coal && C.bar === 1, C);
  check('une pomme n’est pas un combustible', C.apple === 'badItem', C.apple);

  console.log('En jeu : capture d’un coin varié');
  await page.click('#btn-new'); await wait(400);
  const spot = await E(() => {
    const I = Iles, g = I.debug.game, w = g.state.world, p = g.local, kinds = new Set(I.NATURE.map(n => n.id));
    let best = null, bn = 0;
    for (const o of w.objects) { if (!kinds.has(o.type)) continue; const s = new Set(); for (const q of w.objects) if (kinds.has(q.type) && Math.abs(q.x - o.x) < 200 && Math.abs(q.y - o.y) < 120) s.add(q.type); if (s.size > bn) { bn = s.size; best = o; } }
    p.x = best.x; p.y = best.y + 14; if (I.collision.isBlocked(w, p)) p.y = best.y + 24;
    I.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); g.state.time.minutes = 11 * 60;
    return { types: bn, at: [Math.round(best.x), Math.round(best.y)] };
  });
  await wait(400); await page.screenshot({ path: path.join(OUT, '61-nature-ingame.png') });
  check('un coin avec ' + spot.types + ' espèces différentes s’affiche sans erreur', spot.types >= 6, spot);
  const fps = await E(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 1000) res(n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  check('fluide avec 670 objets (' + fps + ' images/s)', fps >= 30, fps);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
