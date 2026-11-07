/*
 * Lobby spatial : accès par l'ancien portail, plateforme de quartz, portail ultime, bouton rouge, retour, sauvegarde, anciennes sauvegardes.
 *   node tools/test-lobby.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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

  console.log('Données : carte, sprites, ciel');
  const D = await E(() => {
    const I = Iles, S = I.debug.renderer.S, w = new I.World(I.config.DEMO_SEED, { lobby: true }), r = {};
    r.lobby = w.lobby; r.size = [w.W, w.H];
    const count = {}; for (const t of w.ground) count[t] = (count[t] || 0) + 1;
    r.tiles = count; r.walkable = w.isWalkable(24, 20) && !w.isWalkable(0, 0) && !w.isWalkable(24, 2);
    r.types = [...new Set(w.objects.map(o => o.type))].sort().join(',');
    r.sprites = w.objects.every(o => S.obj[o.def.sprite] && S.obj[o.def.sprite][0].c.width > 4) && [7, 8, 9].every(t => S.tiles[t].length >= 2) && S.cliff.length === 3;
    r.size2 = { portal: S.obj.portal_ultimate[0].c.width, h: S.obj.portal_ultimate[0].c.height };
    const spawnP = { x: w.spawn.x, y: w.spawn.y, hw: 4, hh: 3 }; r.spawnFree = !I.collision.isBlocked(w, spawnP) && w.isWalkable(Math.floor(w.spawn.x / 16), Math.floor((w.spawn.y - 1) / 16));
    // tous les objets interactifs sont atteignables depuis le point d'arrivée (marche réelle plus bas) ; ici : aucun objet sur le vide
    r.onVoid = w.objects.filter(o => !w.isWalkable(Math.floor(o.x / 16), Math.floor((o.y - 1) / 16))).length;
    r.same = JSON.stringify(Array.from(new I.World(1, { lobby: true }).ground)) === JSON.stringify(Array.from(w.ground)); // déterministe
    I.Sky.build(); r.sky = !!(I.Sky.n1 && I.Sky.g1 && I.Sky.bands.length === 3 && I.Sky.stars.length === 3);
    r.home = !new I.World(I.config.DEMO_SEED).lobby;
    return r;
  });
  check('le lobby est un monde à part (48×40), le monde normal ne l’est pas', D.lobby && D.home && D.size[0] === 48 && D.size[1] === 40, D);
  check('sol de quartz, incrustations et estrade praticables ; le vide ne l’est pas', D.walkable && D.tiles[7] > 400 && D.tiles[8] > 50 && D.tiles[9] > 20 && D.tiles[0] > 300, D.tiles);
  check('portail ultime, bouton rouge, retour, colonnes, cristaux, obélisques', D.types === 'portal_ultimate,q_crystal,q_obelisk,q_pillar,red_button,return_pad', D.types);
  check('tous les sprites et tuiles du lobby existent ; le portail ultime est imposant (' + D.size2.portal + '×' + D.size2.h + ')', D.sprites && D.size2.portal >= 90 && D.size2.h >= 110, D.size2);
  check('point d’arrivée libre ; aucun objet sur le vide ; génération déterministe', D.spawnFree && D.onVoid === 0 && D.same, D);
  check('ciel : nébuleuses, galaxies, aurores, 3 plans d’étoiles', D.sky);

  console.log('Le portail actuel mène au lobby (clavier réel)');
  await page.click('#btn-new'); await wait(400);
  await E(() => { const g = Iles.debug.game, st = g.state, p = g.local, B = Iles.building; p.inv.add('table', 1); p.inv.add('fence', 3);
    const t = [Math.floor(p.x / 16) + 2, Math.floor(p.y / 16) + 1]; B.place(st, p, p.inv.slots.findIndex(s => s && s.id === 'table'), t[0], t[1], []);
    // un arbre abattu : l'état de l'île doit survivre au voyage
    const tr = st.world.objects.find(o => o.type === 'tree_oak'); st.world.deplete(tr, st.time.minutes); window.__tree = tr.id; window.__tableAt = t; });
  const before = await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('portal'), p = g.local; p.x = o.x; p.y = o.y + 14; return { dim: g.state.dim, stats: JSON.stringify(g.state.world.state) }; });
  await wait(300);
  const tH0 = await E(() => Iles.HUD.dialogOpen);
  await page.keyboard.press('KeyE'); await wait(300);
  const fade = await E(() => parseFloat(document.getElementById('fx-flash').style.opacity));
  check('E devant le portail : fondu blanc qui monte (' + fade + ')', fade > 0.5, fade);
  await wait(1500);
  const L = await E(() => { const g = Iles.debug.game, p = g.local, w = g.state.world; return { dim: g.state.dim, lobby: w.lobby, x: p.x, y: p.y, blocked: Iles.collision.isBlocked(w, p), cam: [Iles.debug.cam.x, Iles.debug.cam.y], fade: parseFloat(document.getElementById('fx-flash').style.opacity), portalsSeen: g.state.progress.portals.includes('portal') }; });
  check('arrivée dans le lobby, sur la plateforme, sans être coincé ; le fondu retombe', L.dim === 'lobby' && L.lobby && !L.blocked && L.y > 400 && L.fade === 0, L);
  check('la caméra suit le joueur dans le nouveau monde', Math.abs(L.cam[0] + 640 / 2 / 1 - L.x) < 700 && L.cam[1] > 0, L.cam);
  await page.screenshot({ path: path.join(OUT, '86-lobby-arrival.png') });

  console.log('Dans le lobby : marche réelle, collisions, vide infranchissable');
  const W = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); g.travel('lobby'); const p = g.local, w = g.state.world;
    let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let bad = 0, mx = 0, my = 0, minY = 1e9, maxY = 0, minX = 1e9, maxX = 0;
    for (let i = 0; i < 20000; i++) {
      if (i % 40 === 0) { mx = Math.round(rnd() * 2 - 1); my = Math.round(rnd() * 2 - 1); }
      g.step({ p1: { mx, my, dash: rnd() < 0.03, use: false, aim: null, interact: false, hotbar: null } }, 1 / 60);
      if (I.collision.isBlocked(w, p) || !w.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) bad++;
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    }
    // marcher tout droit vers le sud depuis l'arrivée : on s'arrête au bord de la plateforme
    p.x = w.spawn.x; p.y = w.spawn.y; for (let i = 0; i < 600; i++) g.step({ p1: { mx: 0, my: 1, dash: false, use: false, aim: null, interact: false, hotbar: null } }, 1 / 60);
    return { bad: bad, range: [Math.round(minX), Math.round(maxX), Math.round(minY), Math.round(maxY)], southStop: Math.round(p.y), floorOk: w.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16)) };
  });
  check('20 000 pas aléatoires (avec dash) : jamais dans un obstacle ni dans le vide', W.bad === 0, W);
  check('il explore une grande partie de la plateforme', W.range[1] - W.range[0] > 300 && W.range[3] - W.range[2] > 300, W.range);
  check('le bord de la plateforme arrête le joueur', W.southStop < 40 * 16 && W.floorOk, W);

  console.log('Portail ultime et bouton rouge');
  const P = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); g.travel('lobby'); const p = g.local, w = g.state.world, N = I.Game.NEUTRAL, r = {};
    const near = (o) => { p.x = o.x; p.y = o.y + 12; for (let k = 0; k < 3; k++) g.step({ p1: N }, 1 / 60); };
    const ult = w.objects.find(o => o.type === 'portal_ultimate'), btn = w.objects.find(o => o.type === 'red_button');
    p.x = ult.x; p.y = ult.y + 14; g.step({ p1: N }, 1 / 60); r.ultTarget = p.target && p.target.label;
    g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60); r.ultSay = g.takeEvents().some(e => e.type === 'say' && /ultime/.test(e.title));
    // solide : on ne traverse pas le portail ultime ni le bouton
    p.x = ult.x; p.y = ult.y + 16; for (let i = 0; i < 120; i++) g.step({ p1: Object.assign({}, N, { my: -1 }) }, 1 / 60); r.solidUlt = p.y >= ult.y - 0.5;
    p.x = btn.x; p.y = btn.y + 14; for (let i = 0; i < 120; i++) g.step({ p1: Object.assign({}, N, { my: -1 }) }, 1 / 60); r.solidBtn = p.y >= btn.y - 0.5;
    near(btn); r.btnTarget = p.target && p.target.label;
    g.takeEvents(); g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60);
    const ev1 = g.takeEvents(); r.started = ev1.some(e => e.type === 'dimStart') && !!g.state.act; r.act0 = g.state.act && { dur: g.state.act.dur, tint: g.state.act.tint };
    // deuxième appui pendant l'éveil : refusé poliment
    g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60); const ev2 = g.takeEvents(); r.second = ev2.some(e => e.type === 'msg') && !ev2.some(e => e.type === 'dimStart');
    let flash = 0, ready = null, steps = 0;
    for (; steps < 60 * 8 && !ready; steps++) { g.step({ p1: N }, 1 / 60); for (const e of g.takeEvents()) { if (e.type === 'flash') flash++; if (e.type === 'dimReady') ready = e; } }
    r.flash = flash; r.ready = ready && { n: ready.n, tint: ready.tint, seedOk: ready.seed > 0 }; r.duration = +(steps / 60).toFixed(1); r.after = { act: g.state.act, flags: g.state.progress.flags };
    r.pending = g.state.travelTo; for (let k = 0; k < 4; k++) g.step({ p1: N }, 1 / 60); r.arrived = g.state.dim; r.arrChunked = !!g.state.world.chunked; g.takeEvents(); g.travel('lobby'); // le voyage vers la dimension se fait tout seul à la fin de l’éveil
    // on peut recommencer ; les tirages varient
    near(btn); g.step({ p1: Object.assign({}, N, { interact: true }) }, 1 / 60); g.takeEvents(); const a2 = g.state.act;
    r.again = !!a2; const tints = new Set(), seeds = new Set();
    for (let i = 0; i < 40; i++) { g.state.act = null; I.dimension.press(g.state, p, []); tints.add(g.state.act.tint); seeds.add(g.state.act.seed); }
    r.vary = [tints.size, seeds.size, [...tints].every(t => t >= 1 && t <= 16)];
    return r;
  });
  check('E devant le portail ultime : message ; le portail et le bouton sont solides', /portail ultime/.test(P.ultTarget) && P.ultSay && P.solidUlt && P.solidBtn, P);
  check('le bouton rouge propose « Appuyer »', /bouton rouge/.test(P.btnTarget), P.btnTarget);
  check('appui : le portail s’éveille (6 s, teinte tirée) ; un second appui est refusé', P.started && P.act0.dur === 6 && P.second, P);
  check('après ~6 s : éclair, résultat (dimension n°1 avec graine et teinte), plus d’éveil', P.flash === 1 && P.ready && P.ready.n === 1 && P.ready.seedOk && P.duration > 5.8 && P.duration < 6.3 && P.after.act === null && P.after.flags.dimCount === 1, [P.flash, P.ready, P.duration, P.after]);
  check('à la fin de l’éveil, tous les joueurs partent vers la dimension tirée ; le lobby se retrouve par le portail', /^d:\d+$/.test(P.pending) && P.arrived === P.pending && P.arrChunked, [P.pending, P.arrived]);
  check('on peut recommencer ; graines et teintes (1 à 16) varient', P.again && P.vary[0] >= 8 && P.vary[1] === 40 && P.vary[2], P.vary);

  console.log('Éveil du portail à l’écran, résultat, retour sur l’île');
  await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('red_button1'), p = g.local; p.x = o.x; p.y = o.y + 12; });
  await wait(300); await page.keyboard.press('KeyE'); await wait(3300);
  await E(() => { Iles.debug.cam.snapTo(392, 250, 768, 640); });
  await wait(200); await page.screenshot({ path: path.join(OUT, '83-lobby-awake.png') });
  const act = await E(() => !!Iles.debug.game.state.act); check('pendant l’éveil, l’état est actif à l’écran', act);
  await wait(3400);
  const res = await E(() => ({ act: !!Iles.debug.game.state.act, dim: Iles.debug.game.state.dim, blocked: Iles.collision.isBlocked(Iles.debug.game.state.world, Iles.debug.game.local) }));
  check('fin de l’éveil : le joueur est téléporté dans une dimension générée', !res.act && /^d:\d+$/.test(res.dim) && !res.blocked, res);
  await page.screenshot({ path: path.join(OUT, '84-lobby-result.png') });
  await page.keyboard.press('KeyE'); await wait(1700); // E devant le portail de la dimension : retour au lobby
  check('E sur le portail de la dimension : retour dans le lobby', (await E(() => Iles.debug.game.state.dim)) === 'lobby');
  // sauvegarde dans le lobby + rechargement de la page
  await E(() => { Iles.debug.app.saveNow('manual'); });
  await page.reload(); await wait(500); await page.click('#btn-continue'); await wait(600);
  const S2 = await E(() => { const g = Iles.debug.game, p = g.local; return { dim: g.state.dim, lobby: g.state.world.lobby, blocked: Iles.collision.isBlocked(g.state.world, p), count: g.state.progress.flags.dimCount, tableHome: !!g.state.world.byId.get('portal') }; });
  check('rechargement de la page dans le lobby : on y reste, compteur de dimensions gardé', S2.dim === 'lobby' && S2.lobby && !S2.blocked && S2.count === 1 && !S2.tableHome, S2);
  // retour par le point de retour
  await E(() => { const g = Iles.debug.game, o = g.state.world.byId.get('return_pad2'), p = g.local; p.x = o.x; p.y = o.y + 2; });
  await wait(300); await page.keyboard.press('KeyE'); await wait(1700);
  const H = await E(() => { const g = Iles.debug.game, p = g.local, w = g.state.world, portal = w.byId.get('portal'); return { dim: g.state.dim, lobby: w.lobby, blocked: Iles.collision.isBlocked(w, p), near: portal && Math.hypot(p.x - portal.x, p.y - portal.y) < 80, table: w.structures.filter(o => o.type === 'table').length, tree: w.isDepleted(w.byId.get(window.__tree || 'x') || {}) , fade: parseFloat(document.getElementById('fx-flash').style.opacity) }; });
  check('retour sur l’île : devant le portail, libre ; la table posée est toujours là', H.dim === 'home' && !H.lobby && !H.blocked && H.near && H.table === 1 && H.fade === 0, H);
  await page.screenshot({ path: path.join(OUT, '87-back-home.png') });

  console.log('Anciennes sauvegardes et sauvegarde depuis l’île');
  const O = await E(() => {
    const I = Iles, g = new I.Game(); g.newGame(); const snap = JSON.parse(JSON.stringify(g.snapshot())); const r = { dim: snap.dim };
    delete snap.dim; const g2 = new I.Game(); g2.loadSnapshot(snap); r.old = g2.state.dim; r.oldLobby = g2.state.world.lobby;
    g.travel('lobby'); const s2 = JSON.parse(JSON.stringify(g.snapshot())); r.lobbySnap = s2.dim; r.worldIsHome = !!s2.world && !('lobby' in s2.world);
    const g3 = new I.Game(); g3.loadSnapshot(s2); r.back = [g3.state.dim, g3.state.world.lobby, !!g3.state.worlds.home];
    s2.dim = 'nimporte'; const g4 = new I.Game(); g4.loadSnapshot(s2); r.badDim = g4.state.dim;
    g.travel('lobby'); r.same = g.state.dim; g.travel('mars'); r.mars = g.state.dim;
    return r;
  });
  check('sauvegarde : dimension enregistrée ; ancienne sauvegarde sans dimension = île', O.dim === 'home' && O.old === 'home' && !O.oldLobby, O);
  check('sauvegarde faite dans le lobby : on y revient ; dimension invalide = île ; voyage inconnu ignoré', O.lobbySnap === 'lobby' && O.back[0] === 'lobby' && O.back[1] && O.badDim === 'home' && O.mars === 'lobby', O);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
