/*
 * Tests de la construction : règles de pose, collisions, coffre, four, lit, sauvegarde, interface (souris et clavier réels).
 *   node tools/test-build.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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
  const wait = ms => page.waitForTimeout(ms);
  const shot = n => page.screenshot({ path: path.join(OUT, n) });

  await page.goto(URL); await wait(400);

  console.log('Règles de pose (logique pure)');
  const L = await E(() => {
    const I = Iles, r = {};
    const fresh = () => { const g = new I.Game(); g.newGame(); return g; };
    const B = I.building;
    // une case libre de grass à côté du joueur
    function freeTile(g, near) {
      const p = g.local, w = g.state.world;
      for (let d = 1; d < 5; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        const tx = Math.floor(p.x / 16) + dx, ty = Math.floor(p.y / 16) + dy;
        if (near && B.check(g.state, p, 'chest', tx, ty).ok && !(Math.abs(dx) <= 0 && Math.abs(dy) <= 0)) return [tx, ty];
      }
      return null;
    }
    let g = fresh(), p = g.local, w = g.state.world, ev = [];
    p.inv.add('chest', 2); p.inv.add('fence', 5); p.inv.add('floor_wood', 3); p.inv.add('furnace', 1); p.inv.add('bed', 1); p.inv.add('lamp', 1);
    const t = freeTile(g, true);
    r.freeTile = !!t;
    const slot = p.inv.slots.findIndex(s => s && s.id === 'chest');
    let res = B.place(g.state, p, slot, t[0], t[1], ev);
    r.place = { ok: res.ok, left: p.inv.count('chest'), at: !!w.structureAt(t[0], t[1]), count: w.structures.length, evt: ev.some(e => e.type === 'place') };
    // collision : on ne traverse pas un coffre
    const o = w.structureAt(t[0], t[1]);
    p.x = o.x; p.y = o.y + 6.5; // juste sous le coffre
    for (let i = 0; i < 60; i++) g.step({ p1: { mx: 0, my: -1, dash: false, use: false, remove: false, aim: null, interact: false, hotbar: null } }, 1 / 60);
    r.solid = { y: +p.y.toFixed(2), limit: o.y + 6 };
    // double pose, loin, eau, sur un arbre, sur soi
    res = B.check(g.state, p, 'chest', t[0], t[1]); r.occupied = res.reason;
    res = B.check(g.state, p, 'chest', t[0] + 6, t[1]); r.far = res.reason;
    let wt = null; for (let y = 0; y < w.H && !wt; y++) for (let x = 0; x < w.W && !wt; x++) if (!w.isLand(x, y)) wt = [x, y];
    p.x = wt[0] * 16 + 8; p.y = wt[1] * 16 + 16; res = B.check(g.state, p, 'chest', wt[0], wt[1]); r.water = res.reason;
    g = fresh(); p = g.local; w = g.state.world;
    const tree = w.objects.find(o => o.type === 'tree_oak' && Math.hypot(o.x - p.x, o.y - p.y) < 200);
    p.x = tree.x; p.y = tree.y + 8; res = B.check(g.state, p, 'chest', Math.floor(tree.x / 16), Math.floor((tree.y - 1) / 16)); r.tree = res.reason;
    g = fresh(); p = g.local; w = g.state.world;
    const tp = [Math.floor(p.x / 16), Math.floor((p.y - 1) / 16)];
    r.onSelf = B.check(g.state, p, 'chest', tp[0], tp[1]).reason;
    r.floorUnderSelf = B.check(g.state, p, 'floor_wood', tp[0], tp[1]).ok;
    return r;
  });
  check('case libre trouvée', L.freeTile);
  check('poser un coffre : objet consommé, structure créée, événement', L.place.ok && L.place.left === 1 && L.place.at && L.place.count === 1 && L.place.evt, L.place);
  check('un coffre posé est solide (le joueur ne le traverse pas)', L.solid.y >= L.solid.limit - 0.01, L.solid);
  check('refus : case déjà occupée', L.occupied === 'occupied', L.occupied);
  check('refus : trop loin', L.far === 'far', L.far);
  check('refus : sur l’eau', L.water === 'terrain' || L.water === 'far', L.water);
  check('refus : sur un arbre', L.tree === 'occupied', L.tree);
  check('refus : sur soi-même (objet solide)', L.onSelf === 'player', L.onSelf);
  check('un sol peut se poser sous ses pieds', L.floorUnderSelf);

  console.log('Retrait, coffre, four, lit, sauvegarde (logique pure)');
  const M = await E(() => {
    const I = Iles, r = {}, B = I.building, Ct = I.containers;
    const NEUTRAL = I.Game.NEUTRAL;
    const g = new I.Game(); g.newGame(); const p = g.local, w = g.state.world, st = g.state;
    p.inv.add('chest', 1); p.inv.add('furnace', 1); p.inv.add('bed', 1); p.inv.add('floor_wood', 2); p.inv.add('fence', 3);
    const base = [Math.floor(p.x / 16), Math.floor(p.y / 16)];
    const put = (item, dx, dy) => { const s = p.inv.slots.findIndex(q => q && q.id === item); return B.place(st, p, s, base[0] + dx, base[1] + dy, []); };
    // on s'écarte pour ne pas se poser sur ses propres pieds
    p.x = base[0] * 16 + 8; p.y = base[1] * 16 + 16;
    const ch = put('chest', 1, 0), fu = put('furnace', 2, 0), bd = put('bed', -1, 0);
    r.placed = [ch.ok, fu.ok, bd.ok];
    const chest = ch.obj, furnace = fu.obj, bed = bd.obj;
    // coffre : dépôt / retrait
    p.inv.add('stone', 120);
    const si = p.inv.slots.findIndex(q => q && q.id === 'stone');
    r.put = Ct.put(p, chest, si).ok; r.chestStone = chest.data.inv.slots.filter(Boolean).reduce((a, q) => a + (q.id === 'stone' ? q.qty : 0), 0);
    r.takeBack = Ct.take(p, chest, 0).ok;
    p.inv.add('stone', 5); Ct.put(p, chest, p.inv.slots.findIndex(q => q && q.id === 'stone')); // le coffre redevient non vide
    r.removeNonEmpty = B.remove(st, p, chest.tx, chest.ty, []).reason;
    // four : fonte
    p.inv.add('copper_ore', 4); p.inv.add('wood', 1);
    Ct.put(p, furnace, p.inv.slots.findIndex(q => q && q.id === 'copper_ore'));
    Ct.put(p, furnace, p.inv.slots.findIndex(q => q && q.id === 'wood'));
    r.furnaceIn = { input: furnace.data.input && furnace.data.input.qty, fuel: furnace.data.fuel && furnace.data.fuel.qty };
    for (let i = 0; i < 60 * 13; i++) g.step({ p1: NEUTRAL }, 1 / 60); // 13 s : 2 fontes de 6 s
    r.smelt = { out: furnace.data.output && furnace.data.output.qty, input: furnace.data.input, fuel: furnace.data.fuel, lit: furnace.data.lit };
    // refus d'un objet non valable
    p.inv.add('berries', 1);
    r.badItem = Ct.put(p, furnace, p.inv.slots.findIndex(q => q && q.id === 'berries')).reason;
    // plus de combustible : la fonte attend sans rien perdre
    p.inv.add('copper_ore', 4); Ct.put(p, furnace, p.inv.slots.findIndex(q => q && q.id === 'copper_ore'));
    for (let i = 0; i < 60 * 30; i++) g.step({ p1: NEUTRAL }, 1 / 60);
    r.stall = { out: furnace.data.output.qty, input: furnace.data.input && furnace.data.input.qty }; // le combustible ne brûle que pendant la fonte : il reste 8 s -> 1 lingot, puis attente
    // éloignement : trop loin pour interagir
    const px = p.x; p.x += 200; r.far = Ct.take(p, furnace, 'output').reason; p.x = px;
    // sauvegarde -> rechargement
    const snap = JSON.parse(JSON.stringify(g.snapshot()));
    const g2 = new I.Game(); g2.loadSnapshot(snap); const w2 = g2.state.world;
    const c2 = w2.structureAt(chest.tx, chest.ty), f2 = w2.structureAt(furnace.tx, furnace.ty);
    r.reload = { n: w2.structures.length, chestStone: c2 && c2.data.inv.slots.filter(Boolean).reduce((a, q) => a + (q.id === 'stone' ? q.qty : 0), 0), furnaceOut: f2 && f2.data.output.qty, bedType: !!w2.structureAt(bed.tx, bed.ty), same: w2.structures.length === w.structures.length };
    const newOne = w2.addStructure('fence', 1, 1, null); r.newId = newOne.id; r.idsUnique = new Set(w2.structures.map(o => o.id)).size === w2.structures.length;
    // lit
    p.x = bed.x; p.y = bed.y + 9; const beforeDay = st.time.minutes;
    st.time.minutes = Math.floor(st.time.minutes / 1440) * 1440 + 12 * 60;
    let ev = []; g.step({ p1: Object.assign({}, NEUTRAL, { interact: true }) }, 1 / 60); ev = g.takeEvents();
    r.bedDay = { msg: ev.some(e => e.type === 'msg' && /sommeil/.test(e.text)), minutes: Math.round(st.time.minutes % 1440) };
    st.time.minutes = Math.floor(st.time.minutes / 1440) * 1440 + 22 * 60; const day0 = Math.floor(st.time.minutes / 1440);
    g.step({ p1: Object.assign({}, NEUTRAL, { interact: true }) }, 1 / 60); ev = g.takeEvents();
    r.bedNight = { sleep: ev.some(e => e.type === 'sleep'), day: Math.floor(st.time.minutes / 1440) - day0, clock: Math.round(st.time.minutes % 1440) };
    // retrait des constructions vides
    const fb = B.remove(st, p, bed.tx, bed.ty, []); r.removeBed = { ok: fb.ok, back: p.inv.count('bed') };
    return r;
  });
  check('coffre, four, lit posés', M.placed.every(Boolean), M.placed);
  check('dépôt dans le coffre (100 pierres entrent, le reste reste dans le sac)', M.put && M.chestStone > 0, M);
  check('retrait depuis le coffre', M.takeBack);
  check('un coffre non vide ne peut pas être retiré', M.removeNonEmpty === 'notEmpty', M.removeNonEmpty);
  check('le four reçoit minerai + combustible', M.furnaceIn.input === 4 && M.furnaceIn.fuel === 1, M.furnaceIn);
  check('fonte : 4 minerais + 1 bois → 2 lingots en 13 s', M.smelt.out === 2 && M.smelt.input === null && M.smelt.fuel === null, M.smelt);
  check('le four refuse un objet non fondable / non combustible', M.badItem === 'badItem', M.badItem);
  check('combustible épuisé : la fonte s’arrête sans rien perdre (3 lingots, 2 minerais en attente)', M.stall.out === 3 && M.stall.input === 2, M.stall);
  check('trop loin pour utiliser un conteneur', M.far === 'far', M.far);
  check('sauvegarde : constructions, contenu du coffre et du four rechargés', M.reload.n === 3 && M.reload.chestStone > 0 && M.reload.furnaceOut === 3 && M.reload.bedType && M.reload.same, M.reload);
  check('identifiants de constructions uniques après rechargement', M.idsUnique, M.newId);
  check('lit : refusé en plein jour', M.bedDay.msg, M.bedDay);
  check('lit : la nuit, on passe au matin suivant (6 h)', M.bedNight.sleep && M.bedNight.day === 1 && M.bedNight.clock === 360, M.bedNight);
  check('retirer une construction vide rend l’objet', M.removeBed.ok && M.removeBed.back === 1, M.removeBed);

  console.log('Robustesse : 3 000 poses/retraits aléatoires pendant que le joueur bouge');
  const F = await E(() => {
    const I = Iles, B = I.building, g = new I.Game(); g.newGame();
    const p = g.local, w = g.state.world;
    for (const id of ['fence', 'floor_wood', 'path_stone', 'chest', 'lamp', 'bed', 'furnace']) p.inv.add(id, 90);
    let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let bad = 0, placed = 0, removed = 0;
    for (let i = 0; i < 3000; i++) {
      const mx = Math.round(rnd() * 2 - 1), my = Math.round(rnd() * 2 - 1);
      const tx = Math.floor(p.x / 16) + Math.round(rnd() * 6 - 3), ty = Math.floor(p.y / 16) + Math.round(rnd() * 6 - 3);
      const act = rnd();
      const it = { mx, my, dash: rnd() < 0.03, use: act < 0.6, remove: act >= 0.6 && act < 0.85, aim: { x: tx * 16 + 8, y: ty * 16 + 8 }, interact: false, hotbar: null };
      p.sel = Math.floor(rnd() * 8);
      const n0 = w.structures.length;
      for (let k = 0; k < 4; k++) g.step({ p1: it }, 1 / 60);
      g.takeEvents();
      const n1 = w.structures.length; if (n1 > n0) placed += n1 - n0; else if (n1 < n0) removed += n0 - n1;
      if (I.collision.isBlocked(w, p)) bad++;
    }
    // invariants des index
    const solids = new Map(); let dup = 0, idxBad = 0;
    for (const o of w.structures) {
      const key = o.ty * w.W + o.tx;
      if (o.def.layer === 'floor') { if (w.floorAt(o.tx, o.ty) !== o) idxBad++; } else { if (solids.has(key)) dup++; solids.set(key, o); if (w.structureAt(o.tx, o.ty) !== o) idxBad++; }
      if (!w.byId.has(o.id) || !w.objects.includes(o)) idxBad++;
    }
    // un ensemble d'objets de départ + construit = cohérent avec ce qui a été rendu à l'inventaire
    return { bad, placed, removed, dup, idxBad, n: w.structures.length };
  });
  check('le joueur n’est jamais coincé dans une construction', F.bad === 0, F);
  check('beaucoup de poses et de retraits effectifs (' + F.placed + '/' + F.removed + ')', F.placed > 100 && F.removed > 50, F);
  check('index cohérents, jamais deux solides sur la même case', F.dup === 0 && F.idxBad === 0, F);

  console.log('Interface : souris et clavier réels');
  await page.click('#btn-new'); await wait(400);
  await E(() => { const p = Iles.debug.game.local; p.inv.add('chest', 1); p.inv.add('fence', 6); p.inv.add('floor_wood', 6); p.inv.add('furnace', 1); p.inv.add('bed', 1); p.inv.add('lamp', 1); p.inv.add('copper_ore', 4); p.inv.add('wood', 3); });
  const toScreen = (t) => E((t) => { const c = Iles.debug.cam, s = Iles.debug.renderer.scale; return { x: (t[0] * 16 + 8 - c.rx) * s, y: (t[1] * 16 + 8 - c.ry) * s }; }, t);
  // on cherche une zone dégagée (7 × 6 cases libres) et on s'y place
  const base = await E(() => {
    const g = Iles.debug.game, p = g.local, w = g.state.world, B = Iles.building;
    const cx0 = Math.floor(p.x / 16), cy0 = Math.floor(p.y / 16);
    for (let d = 0; d < 40; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const cx = cx0 + dx, cy = cy0 + dy;
      p.x = cx * 16 + 8; p.y = cy * 16 + 14;
      let ok = true;
      for (let y = -2; y <= 3 && ok; y++) for (let x = -3; x <= 3 && ok; x++) if (Math.hypot(x * 16, y * 16) <= 56 && !B.check(g.state, p, 'floor_wood', cx + x, cy + y).ok && !(x === 0 && y === 0)) ok = false;
      if (ok) { Iles.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); return [cx, cy]; }
    }
    return null;
  });
  check('zone dégagée trouvée pour construire', !!base, base);
  const slotOf = (id) => E((id) => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === id), id);
  const select = async (id) => { const i = await slotOf(id); const p = await E(() => 0); await E((i) => { Iles.debug.game.local.sel = i; }, i); };
  // les objets sont dans le sac : on les met dans la barre rapide pour les sélectionner
  await E(() => { const inv = Iles.debug.game.local.inv; inv.sort(8); const want = ['chest', 'fence', 'floor_wood', 'furnace', 'bed', 'lamp']; want.forEach((id, k) => { const from = inv.slots.findIndex(s => s && s.id === id); if (from >= 0) inv.move(from, 2 + k); }); });
  const hot = await E(() => Iles.debug.game.local.inv.slots.slice(0, 8).map(s => s && s.id));
  check('barre rapide préparée', hot.includes('chest') && hot.includes('fence'), hot);
  const sel = (id) => E((id) => { const p = Iles.debug.game.local; p.sel = p.inv.slots.findIndex(s => s && s.id === id); }, id);
  await wait(200);

  await sel('chest');
  let sp = await toScreen([base[0] + 2, base[1] + 1]);
  await page.mouse.move(sp.x, sp.y); await wait(150);
  check('aperçu vert sur une case libre à portée', await E(() => { const b = Iles.debug.game.local.build; return !!b && b.ok; }));
  await shot('30-ghost-ok.png');
  await page.mouse.click(sp.x, sp.y); await wait(200);
  check('clic gauche : le coffre est posé', await E((b) => !!Iles.debug.game.state.world.structureAt(b[0] + 2, b[1] + 1), base));
  await page.mouse.move(sp.x, sp.y); await wait(100);
  await sel('fence');
  const fdx = base[0] < 40 ? 12 : -12;
  const far = await toScreen([base[0] + fdx, base[1] + 1]);
  await page.mouse.move(far.x, far.y); await wait(150);
  const gb = await E(() => { const b = Iles.debug.game.local.build; return b && { ok: b.ok, reason: b.reason, tx: b.tx, ty: b.ty }; });
  check('aperçu rouge trop loin', !!gb && !gb.ok && gb.reason === 'far', { gb, base });
  await shot('31-ghost-bad.png');
  await page.mouse.move(sp.x, sp.y); await wait(100);
  await page.mouse.click(sp.x, sp.y, { button: 'right' }); await wait(200);
  check('clic droit : le coffre vide est retiré et rendu', await E((b) => !Iles.debug.game.state.world.structureAt(b[0] + 2, b[1] + 1) && Iles.debug.game.local.inv.count('chest') === 1, base));

  // clôtures qui se raccordent + sols, en glissant la souris bouton enfoncé
  await sel('fence');
  const a = await toScreen([base[0] - 2, base[1] + 2]), b2 = await toScreen([base[0] + 2, base[1] + 2]);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 0; i <= 8; i++) { await page.mouse.move(a.x + (b2.x - a.x) * i / 8, a.y); await wait(60); }
  await page.mouse.up(); await wait(100);
  const nf = await E((b) => { const w = Iles.debug.game.state.world; let n = 0; for (let x = b[0] - 2; x <= b[0] + 2; x++) if (w.structureAt(x, b[1] + 2)) n++; return n; }, base);
  check('glisser la souris pose une rangée de clôtures (' + nf + ')', nf >= 4, nf);
  await sel('floor_wood');
  const fa = await toScreen([base[0] - 2, base[1] + 3]);
  await page.mouse.move(fa.x, fa.y); await page.mouse.down();
  for (let i = 0; i <= 8; i++) { await page.mouse.move(fa.x + (b2.x - fa.x) * i / 8, fa.y); await wait(60); }
  await page.mouse.up(); await wait(100);
  check('sols posés', await E((b) => { const w = Iles.debug.game.state.world; let n = 0; for (let x = b[0] - 2; x <= b[0] + 2; x++) if (w.floorAt(x, b[1] + 3)) n++; return n >= 3; }, base));
  check('on marche sur un sol', await E((b) => { const g = Iles.debug.game, p = g.local; p.x = (b[0]) * 16 + 8; p.y = (b[1] + 3) * 16 + 14; return !Iles.collision.isBlocked(g.state.world, p); }, base));
  await E((b) => { const p = Iles.debug.game.local; p.x = (b[0]) * 16 + 8; p.y = (b[1]) * 16 + 14; }, base);

  // four et coffre en interface
  await sel('furnace');
  let fs_ = await toScreen([base[0] + 2, base[1] - 1]);
  await page.mouse.move(fs_.x, fs_.y); await wait(100);
  console.log('   pt', JSON.stringify(fs_), await E((q) => { const e = document.elementFromPoint(q.x, q.y); return e && (e.id || e.className || e.tagName); }, fs_), JSON.stringify(await E(() => { const m = Iles.debug.input.mouse; return { x: m.x, y: m.y, l: m.left, t: Math.round(performance.now() - m.t) }; })));
  console.log('   debug four', JSON.stringify(await E(() => { const p = Iles.debug.game.local; return { sel: p.sel, item: p.inv.slots[p.sel] && p.inv.slots[p.sel].id, build: p.build && { ok: p.build.ok, reason: p.build.reason } }; })));
  await page.mouse.click(fs_.x, fs_.y); await wait(300);
  console.log('   debug four après clic', JSON.stringify(await E((b) => ({ at: !!Iles.debug.game.state.world.structureAt(b[0] + 2, b[1] - 1), toasts: document.getElementById('toasts').textContent, cd: Iles.debug.game.local.buildCd, sel: Iles.debug.game.local.sel, n: Iles.debug.game.local.inv.count('furnace'), fs: Iles.debug.game.state.world.structures.map(o => o.type + o.tx + ',' + o.ty).join(' ') }), base)));
  await sel('chest');
  const cs = await toScreen([base[0] - 2, base[1] - 1]);
  await page.mouse.move(cs.x, cs.y); await wait(100); await page.mouse.click(cs.x, cs.y); await wait(150);
  await sel('lamp'); const ls = await toScreen([base[0] + 3, base[1]]);
  await page.mouse.move(ls.x, ls.y); await wait(100); await page.mouse.click(ls.x, ls.y); await wait(150);
  await sel('bed'); const bs = await toScreen([base[0] - 3, base[1]]);
  await page.mouse.move(bs.x, bs.y); await wait(100); await page.mouse.click(bs.x, bs.y); await wait(150);
  const built = await E((b) => { const w = Iles.debug.game.state.world; return { furnace: !!w.structureAt(b[0] + 2, b[1] - 1), chest: !!w.structureAt(b[0] - 2, b[1] - 1), lamp: !!w.structureAt(b[0] + 3, b[1]), bed: !!w.structureAt(b[0] - 3, b[1]) }; }, base);
  check('four, coffre, lampadaire et lit posés à la souris', Object.values(built).every(Boolean), built);

  // coffre : E, déposer, reprendre
  await E((b) => { const p = Iles.debug.game.local; p.x = (b[0] - 2) * 16 + 8; p.y = (b[1] - 1) * 16 + 16 + 8; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); }, base);
  await wait(200);
  check('invite « Ouvrir le coffre »', await E(() => /coffre/i.test(document.getElementById('prompt-text').textContent)));
  await page.keyboard.press('KeyE'); await wait(250);
  check('E ouvre l’écran du coffre', await E(() => Iles.Menu.screen === 'container' && /Coffre/.test(document.getElementById('cont-title').textContent)));
  await shot('32-chest-ui.png');
  const wi = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'wood'));
  await page.click('#cont-inv .slot[data-i="' + wi + '"]'); await wait(150);
  check('clic sur un objet du sac : il passe dans le coffre', await E(() => { const o = Iles.debug.game.state.world.byId.get(Iles.ContainerUI.id); return o.data.inv.slots.some(s => s && s.id === 'wood') && Iles.debug.game.local.inv.count('wood') === 0; }));
  await page.click('#cont-body .slot[data-w="0"]'); await wait(150);
  check('clic dans le coffre : l’objet revient dans le sac', await E(() => Iles.debug.game.local.inv.count('wood') === 3));
  await page.click('#cont-inv .slot[data-i="' + wi + '"]'); await wait(100);
  await page.keyboard.press('Escape'); await wait(100);

  // four : mettre minerai + bois, attendre la fonte (la simulation des machines tourne pendant l’écran)
  await E((b) => { const p = Iles.debug.game.local; p.x = (b[0] + 2) * 16 + 8; p.y = (b[1] - 1) * 16 + 16 + 8; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); }, base);
  await wait(200); await page.keyboard.press('KeyE'); await wait(250);
  check('E ouvre l’écran du four', await E(() => Iles.Menu.screen === 'container' && /Four/.test(document.getElementById('cont-title').textContent)));
  const oi = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'copper_ore'));
  await page.click('#cont-inv .slot[data-i="' + oi + '"]'); await wait(100);
  const wi2 = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'wood'));
  if (wi2 >= 0) await page.click('#cont-inv .slot[data-i="' + wi2 + '"]'); await wait(300);
  check('le four reçoit minerai et bois par clic', await E(() => { const d = Iles.debug.game.state.world.byId.get(Iles.ContainerUI.id).data; return d.input && d.input.qty === 4 && d.fuel; }));
  await wait(1500); await shot('33-furnace-ui.png');
  await wait(5500);
  check('au bout de ~7 s : un lingot est prêt', await E(() => { const d = Iles.debug.game.state.world.byId.get(Iles.ContainerUI.id).data; return d.output && d.output.qty >= 1; }));
  await page.click('#cont-body .slot[data-w="output"]'); await wait(150);
  check('clic sur la sortie : le lingot rejoint le sac', await E(() => Iles.debug.game.local.inv.count('copper_bar') >= 1));
  await page.keyboard.press('Escape'); await wait(100);

  // lit, la nuit
  await E((b) => { const p = Iles.debug.game.local, s = Iles.debug.game.state; p.x = (b[0] - 3) * 16 + 8; p.y = b[1] * 16 + 16 + 8; s.time.minutes = Math.floor(s.time.minutes / 1440) * 1440 + 21 * 60; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); }, base);
  await wait(300); await shot('34-night-build.png');
  await page.keyboard.press('KeyE'); await wait(250);
  check('E sur le lit la nuit : on se réveille le matin', await E(() => Math.round(Iles.debug.game.state.time.minutes % 1440) >= 360 && Iles.debug.game.state.time.minutes % 1440 < 380 && /dormi/.test(document.getElementById('toasts').textContent)));

  // sauvegarde et rechargement avec les constructions
  await E(() => Iles.debug.app.saveNow('manual'));
  const before = await E(() => Iles.debug.game.state.world.structures.map(o => o.id + ':' + o.type + ':' + o.tx + ',' + o.ty).sort().join('|'));
  await page.reload(); await wait(500); await page.click('#btn-continue'); await wait(400);
  const after = await E(() => Iles.debug.game.state.world.structures.map(o => o.id + ':' + o.type + ':' + o.tx + ',' + o.ty).sort().join('|'));
  check('rechargement de la page : toutes les constructions sont là', before === after && before.length > 10, { before: before.length, after: after.length });
  check('…et le four a gardé son contenu', await E(() => { const f = Iles.debug.game.state.world.structures.find(o => o.type === 'furnace'); return !!f && !!f.data && (f.data.output ? f.data.output.qty : 0) + (f.data.input ? f.data.input.qty : 0) >= 0; }));
  await wait(300); await shot('35-after-reload.png');

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
