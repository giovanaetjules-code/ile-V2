/*
 * Créatures passives : générateur d'espèces (déterminisme, variété, palette de la dimension), dessin, troupeaux, errance, fuite,
 * déchargement des morceaux, réseau (pack / unpack), sauvegarde, performances, rendu réel.
 *   node tools/test-creatures.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
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
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 640 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  await page.goto(URL); await page.waitForTimeout(400);

  console.log('Générateur d’espèces');
  const G = await E(() => {
    const I = Iles, r = { bad: 0, stable: true, counts: {}, plans: {}, sizes: {}, sigs: new Set(), total: 0, offPal: 0, anyFirst: true, herdBad: 0, shy: {}, hop: 0 };
    for (let k = 1; k <= 300; k++) {
      const D = I.dimgen.describe(k * 6007 + 5), n = I.creatureGen.count(D);
      r.counts[n] = (r.counts[n] || 0) + 1;
      for (let i = 0; i < n; i++) {
        const s = I.creatureGen.species(D, i), s2 = I.creatureGen.species(D, i);
        if (JSON.stringify(s) !== JSON.stringify(s2)) r.stable = false;
        r.plans[s.plan] = (r.plans[s.plan] || 0) + 1; r.sizes[s.size] = (r.sizes[s.size] || 0) + 1; r.shy[s.shy] = 1; if (s.hop) r.hop++;
        r.sigs.add([s.plan, s.size, s.bw, s.bh, s.head, s.ears, s.horns, s.tail, s.pattern, s.extra, s.col.ids.join('.')].join('|')); r.total++;
        if (!D.pal.includes(s.col.ids[0])) r.offPal++; // le corps porte toujours une couleur de la dimension
        if (i === 0 && s.hab !== 'any') r.anyFirst = false;
        if (!(s.herd[0] >= 2 && s.herd[1] >= s.herd[0] && s.speed > 5 && s.speed < 40 && s.name.length >= 3 && s.bw >= 5 && s.bh >= 3)) r.bad++;
      }
    }
    r.sigs = r.sigs.size;
    return r;
  });
  check('espèces stables : même dimension + même indice = même espèce', G.stable);
  check('4 à 6 espèces par dimension, toutes valides (taille, vitesse, troupeau, nom)', Object.keys(G.counts).every(n => n >= 4 && n <= 6) && Object.keys(G.counts).length === 3 && G.bad === 0, [G.counts, G.bad]);
  check('les 5 plans de corps et les 4 tailles sortent ; craintives et sauteuses existent', Object.keys(G.plans).length === 5 && Object.keys(G.sizes).length === 4 && Object.keys(G.shy).length >= 2 && G.hop > 20, [G.plans, G.sizes, G.hop]);
  check('très grande variété : ' + G.sigs + ' apparences pour ' + G.total + ' espèces', G.sigs > G.total * 0.97, [G.sigs, G.total]);
  check('le corps a toujours une couleur de la dimension ; l’espèce 0 vit partout', G.offPal === 0 && G.anyFirst, [G.offPal, G.anyFirst]);

  console.log('Dessin');
  const A = await E(() => {
    const I = Iles, r = { bad: 0, n: 0, flipSame: 0, animSame: 0, animN: 0, w: [99, 0], h: [99, 0], empty: 0 };
    const hash = e => { const d = e.c.getContext('2d').getImageData(0, 0, e.c.width, e.c.height).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0; return h; };
    for (let k = 1; k <= 60; k++) {
      const D = I.dimgen.describe(k * 977 + 1), n = I.creatureGen.count(D);
      for (let i = 0; i < n; i++) {
        const e0 = I.creatureArt.sprite(D, i, 0, 0, false), e1 = I.creatureArt.sprite(D, i, 0, 1, false), e2 = I.creatureArt.sprite(D, i, 0, 2, false), el = I.creatureArt.sprite(D, i, 0, 0, true), v2 = I.creatureArt.sprite(D, i, 2, 0, false);
        r.n++;
        if (!e0.c.width || e0.c.width > 44 || e0.c.height > 40 || e0.ay < 3 || e0.ay > e0.c.height + 1) r.bad++;
        r.w = [Math.min(r.w[0], e0.c.width), Math.max(r.w[1], e0.c.width)]; r.h = [Math.min(r.h[0], e0.c.height), Math.max(r.h[1], e0.c.height)];
        if (hash(e0) === hash(el)) r.flipSame++;
        r.animN++; if (hash(e0) === hash(e1) && hash(e1) === hash(e2)) r.animSame++;
        const d = e0.c.getContext('2d').getImageData(0, 0, e0.c.width, e0.c.height).data; let op = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 0) op++;
        if (op < 12) r.empty++;
      }
    }
    return r;
  });
  check('chaque espèce se dessine (taille raisonnable ' + A.w + ' × ' + A.h + ', jamais vide, ancre sous les pieds)', A.bad === 0 && A.empty === 0 && A.w[0] >= 6 && A.w[1] <= 44, A);
  check('la version « gauche » est bien retournée ; la marche change l’image', A.flipSame < A.n * 0.1 && A.animSame < A.animN * 0.1, [A.flipSame, A.animSame, A.n]);

  console.log('Troupeaux dans les dimensions');
  await page.click('#btn-new'); await page.waitForTimeout(500);
  const T = await E(() => {
    const I = Iles, g = I.debug.game, N = I.Game.NEUTRAL, r = { dims: 0, withHerds: 0, total: 0, water: 0, blocked: 0, farFromHerd: 0, tooBig: 0, tooSmall: 0, nearPortal: 0, dup: 0, caps: 0, homeNone: false, lobbyNone: false, speciesSeen: new Set() };
    r.homeNone = !g.state.world.creatures || g.state.world.creatures.length === 0;
    for (let k = 1; k <= 14; k++) {
      const sd = k * 4099 + 11;
      g.state.travelTo = 'd:' + sd; g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      for (let i = 0; i < 40; i++) g.step({ p1: N }, 1 / 60);
      const w = g.state.world, cs = w.creatures || [], ids = new Set();
      r.dims++; if (cs.length) r.withHerds++; r.total += cs.length; if (cs.length > 150) r.caps++;
      const herds = new Map();
      for (const c of cs) {
        if (ids.has(c.id)) r.dup++; ids.add(c.id);
        r.speciesSeen.add(sd + ':' + c.sp);
        const t = w.tileAt(Math.floor(c.x / 16), Math.floor((c.y - 1) / 16));
        if (!I.WALKABLE[t] || t === I.TILE.WALL) r.water++;
        if (I.collision.isBlocked(w, c)) r.blocked++;
        if (Math.hypot(c.x - c.herd.x, c.y - c.herd.y) > 120) r.farFromHerd++;
        if (Math.abs(c.x - w.portalObj.x) < 80 && Math.abs(c.y - w.portalObj.y) < 80) r.nearPortal++;
        (herds.get(c.herd) || herds.set(c.herd, []).get(c.herd)).push(c);
      }
      for (const [h, m] of herds) { const S = I.creatureGen.species(w.D, m[0].sp); if (m.length > S.herd[1] || m.some(c => c.sp !== m[0].sp)) r.tooBig++; if (m.length < 1) r.tooSmall++; }
      g.travel('lobby'); if (g.state.world.creatures && g.state.world.creatures.length) r.lobbyNone = false; else r.lobbyNone = true;
    }
    r.speciesSeen = r.speciesSeen.size;
    return r;
  });
  check('14 dimensions : la plupart ont des troupeaux (' + T.withHerds + '/14, ' + T.total + ' créatures)', T.withHerds >= 12 && T.total > 150 && T.caps === 0, T);
  check('jamais dans l’eau ni dans un mur, jamais coincées dans un objet, pas d’identifiant en double', T.water === 0 && T.blocked === 0 && T.dup === 0, T);
  check('troupeaux : une seule espèce, jamais plus que sa taille de troupeau, regroupés autour de leur centre, arrivée dégagée', T.tooBig === 0 && T.farFromHerd === 0 && T.nearPortal === 0, T);
  check('plusieurs espèces différentes par dimension ; ni l’île ni le lobby n’en ont', T.speciesSeen > 25 && T.homeNone && T.lobbyNone, [T.speciesSeen, T.homeNone, T.lobbyNone]);

  console.log('Déterminisme, errance, fuite');
  const S = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, r = {};
    const run = (sd) => { const g = new I.Game(); g.newGame(); g.state.travelTo = 'd:' + sd; g.state.travelT = 0; g.step({ p1: N }, 1 / 60); g.step({ p1: N }, 1 / 60); for (let i = 0; i < 40; i++) g.step({ p1: N }, 1 / 60); return g; };
    const sig = g => g.state.world.creatures.map(c => c.id + ':' + c.sp + ':' + Math.round(c.x) + ',' + Math.round(c.y)).sort().join('|');
    const g1 = run(31337); const s1 = g1.state.world.creatures.map(c => c.id + ':' + c.sp).sort().join('|'), s2 = run(31337).state.world.creatures.map(c => c.id + ':' + c.sp).sort().join('|');
    r.same = s1 === s2 && s1.length > 0;
    r.n = g1.state.world.creatures.length;
    // errance : 25 s de jeu, le joueur ne bouge pas
    const w = g1.state.world, p = g1.local; { let best = null, bn = 0; for (const c of w.creatures) { const n = w.creatures.filter(o => o.herd === c.herd).length; if (n > bn) { bn = n; best = c; } } p.x = best.herd.x - 60; p.y = best.herd.y; p.invul = 1e9; /* les monstres rôdent aussi : joueur protégé pour ce test */ for (let i = 0; i < 30; i++) g1.step({ p1: N }, 1 / 60); }
    const near = () => w.creatures.filter(c => Math.abs(c.x - p.x) < 440 && Math.abs(c.y - p.y) < 440);
    const before = new Map(near().map(c => [c.id, [c.x, c.y]])); let sawWalk = 0, sawFrame = 0, nan = 0, wet = 0, stuck = 0, far = 0;
    for (let i = 0; i < 25 * 60; i++) {
      g1.step({ p1: N }, 1 / 60);
      if (i % 30 === 0) for (const c of near()) { if (c.moving) sawWalk++; if (c.frame > 0) sawFrame++; if (!isFinite(c.x + c.y)) nan++; const t = w.tileAt(Math.floor(c.x / 16), Math.floor((c.y - 1) / 16)); if (!I.WALKABLE[t] || t === I.TILE.WALL) wet++; if (I.collision.isBlocked(w, c)) stuck++; if (Math.hypot(c.x - c.herd.ox, c.y - c.herd.oy) > 260) far++; }
    }
    let moved = 0; for (const c of near()) { const b = before.get(c.id); if (b && Math.hypot(c.x - b[0], c.y - b[1]) > 4) moved++; }
    r.moved = moved; r.tracked = before.size; r.sawWalk = sawWalk; r.sawFrame = sawFrame; r.nan = nan; r.wet = wet; r.stuck = stuck; r.far = far;
    // fuite : une créature craintive, joueur à 22 px
    let cr = null; for (const c of w.creatures) { if (I.creatureGen.species(w.D, c.sp).shy > 0) { cr = c; break; } }
    r.shyFound = !!cr;
    if (cr) {
      const S2 = I.creatureGen.species(w.D, cr.sp); r.shy = S2.shy;
      p.x = cr.x - 22; p.y = cr.y; const d0 = Math.hypot(cr.x - p.x, cr.y - p.y), x0 = cr.x;
      for (let i = 0; i < 30; i++) g1.step({ p1: N }, 1 / 60);
      r.fled = Math.hypot(cr.x - p.x, cr.y - p.y) - d0; r.fleeing = cr.flee > 0;
    }
    return r;
  });
  check('même graine = mêmes troupeaux (' + S.n + ' créatures, mêmes identifiants et espèces)', S.same, S);
  check('elles errent : ' + S.moved + '/' + S.tracked + ' ont bougé en 25 s, animation de marche active', S.moved >= S.tracked * 0.4 && S.sawWalk > 0 && S.sawFrame > 0, [S.moved, S.tracked, S.sawWalk]);
  check('pendant ce temps : jamais dans l’eau, jamais coincées, jamais loin de leur troupeau, aucune valeur absurde', S.wet === 0 && S.stuck === 0 && S.far === 0 && S.nan === 0, S);
  check('une espèce craintive s’éloigne du joueur qui s’approche (+' + Math.round(S.fled) + ' px en 0,5 s)', S.shyFound && S.fled > 8 && S.fleeing, S);

  console.log('Déchargement, réseau, sauvegarde, performances');
  const U = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, r = {};
    const g = new I.Game(); g.newGame(); g.state.travelTo = 'd:8080'; g.state.travelT = 0; g.step({ p1: N }, 1 / 60); for (let i = 0; i < 60; i++) g.step({ p1: N }, 1 / 60);
    const w = g.state.world, p = g.local, ids0 = w.creatures.map(c => c.id).sort(), n0 = ids0.length;
    // loin : les anciens morceaux se déchargent, leurs créatures aussi
    const px = p.x, py = p.y; p.x += 6000; p.y += 3000; g.step({ p1: N }, 1 / 60); for (let i = 0; i < 120; i++) g.step({ p1: N }, 1 / 60);
    const idsFar = new Set(w.creatures.map(c => c.id)); r.unloaded = ids0.filter(id => idsFar.has(id)).length;
    p.x = px; p.y = py; for (let i = 0; i < 200; i++) g.step({ p1: N }, 1 / 60);
    const idsBack = w.creatures.map(c => c.id).sort(); r.back = ids0.filter(id => idsBack.includes(id)).length; r.n0 = n0;
    // réseau
    { let best = null, bn = 0; for (const c of w.creatures) { const n = w.creatures.filter(o => o.herd === c.herd).length; if (n > bn) { bn = n; best = c; } } p.x = best.herd.x - 60; p.y = best.herd.y; p.invul = 1e9; /* les monstres rôdent aussi : joueur protégé pour ce test */ }
    const rows = I.creatures.pack(w, [p], 520), JSONrows = JSON.parse(JSON.stringify(rows));
    const w2 = { creatures: [] }; I.creatures.unpack(w2, JSONrows);
    r.netN = rows.length; r.netOk = w2.creatures.length === rows.length && w2.creatures.every((c, i) => c.id === rows[i][0] && c.sp === rows[i][1] && Math.abs(c.x - rows[i][3]) < 0.01);
    I.creatures.unpack(w2, [['x', 99, 0, 1, 1, 0, 0], ['y', 1, 0, NaN, 1, 0, 0], 'junk', null, ['ok', 1, 0, 5, 5, 3, 2]]); r.netJunk = w2.creatures.length === 1 && w2.creatures[0].left === true && w2.creatures[0].moving === true;
    w2.creatures[0].tx = 25; w2.creatures[0].ty = 5; for (let i = 0; i < 40; i++) I.creatures.smooth(w2, 0.2); r.smooth = Math.abs(w2.creatures[0].x - 25) < 0.5;
    r.rowSize = JSON.stringify(rows).length / Math.max(1, rows.length);
    // sauvegarde : rien de plus
    const snap = JSON.stringify(g.snapshot()); r.saveHas = /"herd"|"creatures"|"c\d+_\d+_/.test(snap);
    const g2 = new I.Game(); g2.loadSnapshot(JSON.parse(snap)); for (let i = 0; i < 80; i++) g2.step({ p1: N }, 1 / 60); r.reload = g2.state.world.creatures ? g2.state.world.creatures.length : -1;
    // performances : 600 pas avec joueur au milieu
    const t0 = performance.now(); for (let i = 0; i < 600; i++) g.step({ p1: N }, 1 / 60); r.ms = (performance.now() - t0) / 600; r.count = w.creatures.length;
    return r;
  });
  check('chunks déchargés = créatures retirées ; au retour les mêmes troupeaux reviennent (' + U.back + '/' + U.n0 + ')', U.unloaded === 0 && U.back >= U.n0 * 0.9 && U.n0 > 0, U);
  check('réseau : paquet compact (' + Math.round(U.rowSize) + ' octets / créature), aller-retour exact, lignes invalides ignorées, lissage', U.netN > 0 && U.netOk && U.netJunk && U.smooth && U.rowSize < 60, U);
  check('sauvegarde : aucune donnée de créature ; la dimension rechargée refait ses troupeaux (' + U.reload + ')', !U.saveHas && U.reload > 0, U);
  check('performances : ' + U.ms.toFixed(2) + ' ms par pas de simulation avec ' + U.count + ' créatures chargées', U.ms < 4, U.ms);

  console.log('Rendu réel');
  await E(() => { const I = Iles, g = I.debug.game, N = I.Game.NEUTRAL; g.travel('lobby'); g.state.travelTo = 'd:777'; g.state.travelT = 0; g.step({ p1: N }, 1 / 60); for (let i = 0; i < 120; i++) g.step({ p1: N }, 1 / 60); });
  const spot = await E(() => { const I = Iles, g = I.debug.game, w = g.state.world, p = g.local; let best = null, bn = 0; for (const c of w.creatures) { const n = w.creatures.filter(o => o.herd === c.herd).length; if (n > bn) { bn = n; best = c; } } p.x = best.herd.x - 70; p.y = best.herd.y + 20; for (let i = 0; i < 20; i++) g.step({ p1: I.Game.NEUTRAL }, 1 / 60); return { n: bn, sp: best.sp }; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '101-troupeau.png') });
  const px = async () => { const b = await page.screenshot(); return b.length + ':' + require('crypto').createHash('md5').update(b).digest('hex'); };
  const withC = await px();
  await E(() => { Iles.debug.game.state.world.creatures.forEach(c => { c.x += 99999; }); }); await page.waitForTimeout(250);
  const without = await px();
  check('les créatures sont réellement dessinées à l’écran (l’image change quand on les enlève), troupeau de ' + spot.n, withC !== without && spot.n >= 2);

  console.log('\nErreurs JavaScript : ' + (errors.length ? errors.join(' | ') : 'aucune'));
  console.log('\n' + pass + ' réussis, ' + (fail + (errors.length ? 1 : 0)) + ' échoués');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
