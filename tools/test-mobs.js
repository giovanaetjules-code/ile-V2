/*
 * Monstres hostiles : générateur (variété, déterminisme), dessin des 7 plans, apparition (nids, zone sûre, paliers, élites), les 6
 * archétypes d'attaque (préparation visible, esquive, dash invulnérable), éléments (poison, brûlure, gel, foudre), évanouissement,
 * combat contre les monstres (dégâts, butin, mort), réseau (pack / unpack), sauvegarde, performances, rendu réel.
 *   node tools/test-mobs.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

// Outils de test exécutés dans la page : arène dégagée, monstre forcé (archétype / élément), pas de simulation avec journal d'événements.
const SETUP = () => {
  const I = (window.I = Iles), N = I.Game.NEUTRAL, orig = I.mobGen.species, T = (window.T = {});
  let forced = null, cnt = 0, log = [];
  T.log = () => log;
  I.mobGen.species = (D, i) => { const S = orig(D, i); if (!forced) return S; const A = I.mobGen.ARCH[forced.arch]; return Object.assign({}, S, { arch: forced.arch, elem: forced.elem, size: 1, hp: A.hp, dmg: A.dmg, speed: A.speed, sight: A.sight, reach: A.reach, wind: A.wind, cdn: A.cdn, dash: A.dash || 0, keep: A.keep || 0, blast: A.blast || 0 }); };
  T.force = (arch, elem) => { forced = arch ? { arch: arch, elem: elem || 'none' } : null; };
  T.arena = () => {
    const g = new I.Game(); g.newGame();
    for (let k = 0; k < 40; k++) {
      g.state.travelTo = 'd:' + (900 + k * 37); g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      const w = g.state.world, sp = w.spawn;
      for (let dy = -60; dy <= 60; dy += 4) for (let dx = -60; dx <= 60; dx += 4) {
        const tx = Math.floor(sp.x / 16) + dx, ty = Math.floor(sp.y / 16) + dy; let ok = true;
        for (let j = -9; j <= 9 && ok; j++) for (let i = -12; i <= 12; i++) if (!w.isLand(tx + i, ty + j)) { ok = false; break; }
        if (ok) { g.ax = tx * 16 + 8; g.ay = ty * 16 + 8; for (let s = 0; s < 40; s++) g.step({ p1: N }, 1 / 60); return g; }
      }
    }
    return g;
  };
  T.reset = (g) => {
    const w = g.state.world, p = g.local;
    for (const c of w.chunks.values()) c.nests = true;
    w.mobs = []; w.mproj = []; w.creatures = []; w.drops = [];
    p.x = g.ax; p.y = g.ay; p.hp = 100; p.hun = 80; p.invul = 0; p.st = null; p.dashT = 0; p.lunge = null; p.swing = null; p.cb = null;
    log = []; g.events.length = 0; Math.random = () => 0.5;
  };
  T.mob = (g, dx, dy, o) => {
    o = o || {};
    const w = g.state.world, x = g.ax + dx, y = g.ay + dy, c = w._chunk(Math.floor(x / 16), Math.floor(y / 16)); let key = null;
    for (const [k, v] of w.chunks) if (v === c) key = k;
    const hp = o.hp || I.mobGen.ARCH[forced ? forced.arch : 'stalker'].hp;
    const m = { id: 'tm' + (cnt++), mob: 1, sp: 0, v: 0, x: x, y: y, hw: 4, hh: 2, left: false, moving: false, frame: 0, at: 0, hp: hp, mhp: hp, hpp: 100, tier: 0, elite: !!o.elite, home: { x: x, y: y, key: key }, st: 'idle', t: 0, wt: 1, cd: 0, ang: 0, tx: 0, ty: 0, wait: 1e9, stuck: 0, kx: 0, ky: 0, stun: 0, aggro: o.aggro === undefined ? 5 : o.aggro, sg: 1, hit: false, ph: 0, mul: 1 };
    w.mobs.push(m); return m;
  };
  T.run = (g, secs, each, intent) => {
    const k = Math.round(secs * 60);
    for (let i = 0; i < k; i++) {
      g.step({ p1: intent || N }, 1 / 60);
      for (const e of g.takeEvents()) log.push(Object.assign({ t: i / 60 }, e));
      if (each && each(i / 60) === false) break;
    }
  };
  T.hurts = () => log.filter(e => e.type === 'hurt');
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  await page.goto(URL); await page.waitForTimeout(400);
  await E(SETUP);

  console.log('Générateur d’espèces');
  const G = await E(() => {
    const I = Iles, r = { stable: true, plans: {}, arch: {}, elem: {}, sigs: new Set(), total: 0, bad: 0, first: true, names: new Set() };
    for (let k = 1; k <= 300; k++) {
      const D = I.dimgen.describe(k * 7001 + 3), n = I.mobGen.count(D);
      if (n < 4 || n > 6) r.bad++;
      for (let i = 0; i < n; i++) {
        const s = I.mobGen.species(D, i), s2 = I.mobGen.species(D, i);
        if (JSON.stringify(s) !== JSON.stringify(s2)) r.stable = false;
        r.plans[s.plan] = (r.plans[s.plan] || 0) + 1; r.arch[s.arch] = (r.arch[s.arch] || 0) + 1; r.elem[s.elem] = (r.elem[s.elem] || 0) + 1; r.total++;
        r.sigs.add([s.plan, s.arch, s.elem, s.size, s.horns, s.pattern, s.eyes, s.col.ids.join('.')].join('|')); r.names.add(s.name);
        if (!(s.hp > 5 && s.dmg >= 3 && s.speed > 15 && s.sight > 80 && s.wind > 0.15 && s.name.length >= 3)) r.bad++;
        if (i === 0 && (s.arch === 'brute' || s.arch === 'bomber')) r.first = false;
        if (s.arch === 'brute' && s.size !== 3) r.bad++;
      }
    }
    r.sigs = r.sigs.size; r.names = r.names.size;
    return r;
  });
  check('espèces déterministes (même graine = même monstre)', G.stable);
  check('les 7 plans de corps apparaissent', Object.keys(G.plans).length === 7, G.plans);
  check('les 6 archétypes d’attaque apparaissent', Object.keys(G.arch).length === 6, G.arch);
  check('les 5 éléments apparaissent (aucun, venin, flamme, givre, foudre)', Object.keys(G.elem).length === 5, G.elem);
  check('beaucoup de combinaisons différentes (' + G.sigs + ' / ' + G.total + ')', G.sigs > G.total * 0.85, [G.sigs, G.total]);
  check('4 à 6 espèces par dimension, statistiques cohérentes', G.bad === 0, G.bad);
  check('la 1re espèce n’est jamais une brute ni un kamikaze', G.first);

  console.log('Dessin');
  const A = await E(() => {
    const I = Iles, r = { bad: [], plans: {}, tiny: 0, anim: 0, flip: 0, glow: 0 };
    for (let k = 1; k <= 60; k++) {
      const D = I.dimgen.describe(k * 911 + 5);
      for (let i = 0; i < I.mobGen.count(D); i++) {
        const S = I.mobGen.species(D, i);
        try {
          const a = I.mobArt.sprite(D, i, 1, 0, false), b = I.mobArt.sprite(D, i, 1, 1, false), c = I.mobArt.sprite(D, i, 1, 2, false), l = I.mobArt.sprite(D, i, 1, 0, true);
          r.plans[S.plan] = (r.plans[S.plan] || 0) + 1;
          if (a.c.width < 8 || a.c.height < 8 || a.c.width > 60 || a.c.height > 50) r.tiny++;
          if (a.c.toDataURL() !== b.c.toDataURL() || b.c.toDataURL() !== c.c.toDataURL()) r.anim++;
          if (a.c.toDataURL() !== l.c.toDataURL()) r.flip++;
          const d = a.c.getContext('2d').getImageData(0, 0, a.c.width, a.c.height).data; let gl = 0;
          for (let q = 0; q < d.length; q += 4) if (d[q + 3] && Math.abs(d[q] - S.col.glow[0]) < 3 && Math.abs(d[q + 1] - S.col.glow[1]) < 3 && Math.abs(d[q + 2] - S.col.glow[2]) < 3) gl++;
          if (gl > 0) r.glow++;
        } catch (e) { r.bad.push(S.plan + ': ' + e.message); }
      }
    }
    return r;
  });
  check('les 7 plans se dessinent sans erreur', A.bad.length === 0 && Object.keys(A.plans).length === 7, A);
  check('tailles d’image raisonnables', A.tiny === 0, A.tiny);
  check('les 3 images d’animation diffèrent et la version gauche est retournée', A.anim > 100 && A.flip > 100, [A.anim, A.flip]);
  check('les yeux / noyaux lumineux ont la couleur de l’élément', A.glow > 250, A.glow);

  console.log('Apparition');
  const S1 = await E(() => {
    const I = Iles, N = I.Game.NEUTRAL, r = { dims: 0, mobs: 0, nearSafe: 0, tiers: {}, elites: 0, tot: 0, island: -1, lobby: -1, withinChunk: true };
    for (let k = 0; k < 14; k++) {
      const g = new I.Game(); g.newGame(); g.state.travelTo = 'd:' + (5000 + k * 61); g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      for (let i = 0; i < 40; i++) g.step({ p1: N }, 1 / 60);
      const w = g.state.world, sp = w.spawn, p = g.local;
      for (let a = 0; a < 12; a++) { p.x = sp.x + Math.cos(a * 0.9) * (200 + a * 140); p.y = sp.y + Math.sin(a * 0.9) * (200 + a * 140); for (let i = 0; i < 70; i++) g.step({ p1: N }, 1 / 60); }
      for (const m of w.mobs) { r.tot++; const d = Math.hypot(m.x - sp.x, m.y - sp.y); if (d < 228) r.nearSafe++; r.tiers[m.tier] = (r.tiers[m.tier] || 0) + 1; if (m.elite) r.elites++; if (m.tier !== I.mobGen.tier(Math.hypot(m.home.x - sp.x, m.home.y - sp.y))) r.withinChunk = false; }
      if (w.mobs.length) r.dims++;
    }
    const g = new I.Game(); g.newGame(); for (let i = 0; i < 120; i++) g.step({ p1: N }, 1 / 60); r.island = (g.state.world.mobs || []).length;
    g.travel('lobby'); for (let i = 0; i < 60; i++) g.step({ p1: N }, 1 / 60); r.lobby = (g.state.world.mobs || []).length;
    r.tierFn = [0, 150, 700, 1200, 1700, 2600, 9999].map(d => I.mobGen.tier(d));
    return r;
  });
  check('des monstres apparaissent dans les dimensions (' + S1.tot + ' dans ' + S1.dims + '/14 dimensions)', S1.dims >= 10 && S1.tot > 40, S1);
  check('jamais dans la zone d’arrivée (230 px)', S1.nearSafe === 0, S1.nearSafe);
  check('palier de danger croissant avec la distance (0 → 4)', JSON.stringify(S1.tierFn) === '[0,0,1,2,3,4,4]' && Object.keys(S1.tiers).length >= 3, [S1.tierFn, S1.tiers]);
  check('le palier d’un monstre vient de la distance de son nid', S1.withinChunk);
  check('des élites existent (rares)', S1.elites > 0 && S1.elites < S1.tot * 0.3, [S1.elites, S1.tot]);
  check('l’île et le lobby restent sûrs', S1.island === 0 && S1.lobby === 0, [S1.island, S1.lobby]);

  console.log('Attaques : mordre (stalker)');
  const ST = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('stalker'); T.reset(g);
    const m = T.mob(g, 60, 0); let windAt = -1, windT = 0; const hp0 = p.hp;
    T.run(g, 4, t => { if (m.st === 'wind' && windAt < 0) { windAt = t; windT = m.wt; } return T.hurts().length === 0; });
    const h = T.hurts()[0];
    r.hit = !!h; r.dmg = h && h.dmg; r.hp = p.hp; r.windSeen = windAt > 0; r.delay = h ? h.t - windAt : -1; r.wt = windT; r.kb = !!p.lunge || true;
    // invulnérabilité : juste après un coup, et pendant le dash
    r.inv = p.invul > 0; const before = p.hp; r.again = I.mobs.hurtPlayer(g.state, p, 10, p.x - 5, p.y, 50, 'none', []); r.same = p.hp === before;
    p.invul = 0; p.dashT = 0.1; r.dash = I.mobs.hurtPlayer(g.state, p, 10, p.x - 5, p.y, 50, 'none', []); r.dashHp = p.hp === before; p.dashT = 0;
    // l'attaque touche à nouveau après la recharge
    p.invul = 0; T.run(g, 3, () => T.hurts().length < 2); r.second = T.hurts().length >= 2;
    return r;
  });
  check('le monstre poursuit le joueur et le mord', ST.hit && ST.dmg === 9 && ST.hp === 91, ST);
  check('une PRÉPARATION visible précède le coup (≈ durée de l’archétype)', ST.windSeen && ST.delay > 0.25 && ST.delay < 0.55, ST);
  check('invulnérable un instant après un coup, et pendant le dash (esquive)', ST.inv && ST.again === false && ST.same && ST.dash === false && ST.dashHp, ST);
  check('il recommence après sa recharge', ST.second, ST);

  console.log('Attaques : charger (charge en ligne droite)');
  const CH = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('charger'); T.reset(g);
    let m = T.mob(g, 100, 0), phases = [], last = '';
    T.run(g, 3, () => { if (m.st !== last) { phases.push(m.st); last = m.st; } return T.hurts().length === 0 && phases.indexOf('rec') < 0; });
    r.dmg = T.hurts()[0] && T.hurts()[0].dmg; r.phases = phases.slice(0, 5).join('>');
    // esquive : on se décale pendant la préparation, la charge part dans le vide
    T.reset(g); p.x = g.ax; p.y = g.ay; m = T.mob(g, 100, 0); let ok = false, moved = false;
    T.run(g, 4, () => { if (m.st === 'act' && !moved) { p.y += 30; moved = true; } if (m.st === 'rec') { ok = true; return false; } });
    r.dodged = moved && ok && T.hurts().length === 0; r.hp = p.hp;
    // contre un mur d'arbres / vide : se fatigue (étourdi) — on le force à foncer contre l'eau
    return r;
  });
  check('charger : approche, prépare (wind), charge (act), souffle (rec)', /wind>act/.test(CH.phases) && CH.dmg === 17, CH);
  check('charger : si le joueur se décale, la charge le manque', CH.dodged && CH.hp === 100, CH);

  console.log('Attaques : spitter (crache à distance)');
  const SP = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('spitter'); T.reset(g);
    const m = T.mob(g, 110, 0); let maxProj = 0, minD = 1e9, maxD = 0;
    T.run(g, 5, t => { maxProj = Math.max(maxProj, (g.state.world.mproj || []).length); return T.hurts().length === 0; });
    r.proj = maxProj; r.hit = T.hurts().length === 1 && T.hurts()[0].dmg === 10;
    T.reset(g); const m1 = T.mob(g, 110, 0); p.invul = 1e6; T.run(g, 6, t => { if (t > 1.5) { const d = Math.hypot(m1.x - p.x, m1.y - p.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); } }); r.keep = [Math.round(minD), Math.round(maxD)];
    // il recule si on s'approche : on le colle au joueur, il doit s'éloigner
    T.reset(g); const m2 = T.mob(g, 30, 0); T.run(g, 1.2, null); r.retreat = Math.hypot(m2.x - p.x, m2.y - p.y) > 50;
    // un joueur qui esquive (dash) traverse le projectile
    T.reset(g); const m3 = T.mob(g, 100, 0); let dodged = false;
    T.run(g, 3, () => { const q = (g.state.world.mproj || [])[0]; if (q && Math.hypot(q.x - p.x, q.y - p.y) < 14) { p.dashT = 0.3; dodged = true; } return true; });
    r.dash = dodged && p.hp === 100;
    return r;
  });
  check('spitter : prépare puis crache un projectile qui touche', SP.proj > 0 && SP.hit, SP);
  check('spitter : garde ses distances (kite) et recule si on s’approche', SP.keep[0] > 60 && SP.retreat, SP);
  check('spitter : le dash fait traverser le projectile', SP.dash, SP);

  const FP = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('spitter'); T.reset(g);
    p.hp = 3; const w = g.state.world; w.mproj = []; for (let k = 0; k < 6; k++) w.mproj.push({ x: p.x + k * 2 - 4, y: p.y - 7, vx: 1, vy: 0, life: 3, dmg: 20, el: 'none', c: 'rgb(1,2,3)' });
    try { T.run(g, 0.3, null); r.err = null; } catch (e) { r.err = e.message; }
    r.faint = T.log().some(e => e.type === 'faint'); r.hp = p.hp; r.proj = w.mproj.length;
    return r;
  });
  check('plusieurs projectiles qui tuent en même temps : évanouissement propre, pas d’erreur', FP.err === null && FP.faint && FP.hp >= 50 && FP.hp < 52 && FP.proj === 0, FP);

  console.log('Attaques : brute (frappe en zone)');
  const BR = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('brute'); T.reset(g);
    const m = T.mob(g, 44, 0); let wind = false;
    T.run(g, 4, () => { if (m.st === 'wind') wind = true; return T.hurts().length === 0; }); T.run(g, 0.3, null);
    r.wind = wind; r.dmg = T.hurts()[0] && T.hurts()[0].dmg; r.ring = T.log().some(e => e.type === 'cfx' && e.k === 'ring'); r.shake = T.log().some(e => e.type === 'shake');
    r.moved = Math.hypot(p.x - g.ax, p.y - g.ay) > 4; // recul
    // hors de la zone : rien. Le joueur reste à 70 px d'une brute immobile qui frappe dans le vide.
    T.reset(g); const m2 = T.mob(g, 70, 0); m2.st = 'wind'; m2.t = m2.wt = 0.3; m2.ang = 0; m2.cd = 0; T.run(g, 0.6, null);
    r.far = T.hurts().length === 0 && p.hp === 100; r.rec = m2.st === 'rec' || m2.st === 'chase';
    return r;
  });
  check('brute : préparation puis frappe de zone qui blesse beaucoup et repousse', BR.wind && BR.dmg === 26 && BR.ring && BR.shake && BR.moved, BR);
  check('brute : hors de la zone de frappe, aucun dégât', BR.far && BR.rec, BR);

  console.log('Attaques : bomber (explose) et swarmer (meute)');
  const BO = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('bomber'); T.reset(g);
    const m = T.mob(g, 60, 0); let fuse = false;
    T.run(g, 4, () => { if (m.st === 'wind') fuse = true; return g.state.world.mobs.includes(m); });
    r.fuse = fuse; r.gone = !g.state.world.mobs.includes(m); r.dmg = T.hurts()[0] && T.hurts()[0].dmg; r.shake = T.log().some(e => e.type === 'shake');
    // hors du rayon d'explosion : indemne
    T.reset(g); const m2 = T.mob(g, 90, 0); m2.st = 'wind'; m2.t = m2.wt = 0.1; m2.aggro = 0; T.run(g, 0.3, null); r.farHurt = T.hurts().length; r.gone2 = !g.state.world.mobs.includes(m2);
    T.force('swarmer'); T.reset(g); for (let k = 0; k < 5; k++) T.mob(g, 80 + k * 6, -20 + k * 10);
    T.run(g, 6, null); const hs = T.hurts(); r.swarmHits = hs.length; r.swarmDmg = hs.length ? hs[0].dmg : 0; r.swarmTot = 100 - g.local.hp;
    return r;
  });
  check('bomber : la mèche brûle (wind) puis il explose et disparaît en blessant fort', BO.fuse && BO.gone && BO.dmg === 30 && BO.shake, BO);
  check('bomber : hors du rayon, aucun dégât', BO.farHurt === 0 && BO.gone2, BO);
  check('swarmer : une meute mord souvent mais faiblement', BO.swarmHits >= 3 && BO.swarmDmg === 4 && BO.swarmTot >= 12, BO);

  console.log('Éléments');
  const EL = await E(() => {
    const out = {}, I = Iles;
    const go = (elem) => { const g = T.arena(), p = g.local; T.force('stalker', elem); T.reset(g); T.mob(g, 40, 0); T.run(g, 3, () => T.hurts().length === 0); return { g: g, p: p }; };
    let { g, p } = go('venom'); out.venom = p.st && p.st.poison > 4; const h0 = p.hp; T.run(g, 3); out.venomDrain = p.hp < h0 - 3;
    p.st.poison = 5; p.hp = 5; p.invul = 0; T.force(null); T.reset(g); p.hp = 5; p.st = { poison: 5, burn: 5, slow: 0, stun: 0 }; T.run(g, 10); out.notLethal = p.hp >= 1;
    ({ g, p } = go('flame')); out.flame = p.st && p.st.burn > 2; const h1 = p.hp; T.run(g, 2); out.flameDrain = p.hp < h1 - 4;
    ({ g, p } = go('frost')); out.frost = p.st && p.st.slow > 2; out.slowMul = I.vitals.speedMul(p) < 0.6;
    T.force(null); T.reset(g); const x0 = p.x; p.st = { poison: 0, burn: 0, slow: 0, stun: 0 }; T.run(g, 0.5, null, { mx: 1, my: 0, dash: false, use: false, remove: false, aim: null, interact: false, hotbar: null, ab: 0 }); const free = p.x - x0;
    p.st.slow = 5; const x1 = p.x; T.run(g, 0.5, null, { mx: 1, my: 0, dash: false, use: false, remove: false, aim: null, interact: false, hotbar: null, ab: 0 }); out.slowed = (p.x - x1) < free * 0.7;
    ({ g, p } = go('shock')); out.shock = p.st && p.st.stun > 0.3; g.state.world.mobs = []; p.lunge = null; p.invul = 5; const x2 = p.x; p.st.stun = 1; T.force(null); T.run(g, 0.4, null, { mx: 1, my: 0, dash: false, use: false, remove: false, aim: null, interact: false, hotbar: null, ab: 0 }); out.frozenMove = Math.abs(p.x - x2) < 1;
    T.run(g, 1, null); out.shockEnds = p.st.stun <= 0;
    return out;
  });
  check('venin : empoisonne, la vie baisse peu à peu', EL.venom && EL.venomDrain, EL);
  check('poison et brûlure ne tuent jamais (vie ≥ 1)', EL.notLethal, EL);
  check('flamme : brûle (dégâts plus rapides)', EL.flame && EL.flameDrain, EL);
  check('givre : ralentit le joueur', EL.frost && EL.slowMul && EL.slowed, EL);
  check('foudre : étourdit un court instant, puis ça passe', EL.shock && EL.frozenMove && EL.shockEnds, EL);

  console.log('Évanouissement');
  const FA = await E(() => {
    const g = T.arena(), p = g.local, r = {}; T.force('stalker'); T.reset(g);
    const m = T.mob(g, 20, 0); p.hp = 4; p.hun = 50; const sp = g.state.world.spawn;
    T.run(g, 3, () => T.log().filter(e => e.type === 'faint').length === 0);
    r.faint = T.log().some(e => e.type === 'faint' && e.pid === 'p1'); r.hp = p.hp; r.invul = p.invul > 2; r.hun = p.hun;
    r.near = Math.hypot(p.x - sp.x, p.y - sp.y) < 80; r.msg = T.log().some(e => e.type === 'msg' && /évanoui/.test(e.text)); r.aggro = m.aggro === 0;
    r.free = !I.collision.isBlocked(g.state.world, p);
    T.run(g, 2, null); r.safe = p.hp === 50;
    return r;
  });
  check('à 0 de vie : évanoui, réveil au point d’arrivée avec 50 % de vie', FA.faint && FA.hp === 50 && FA.near && FA.msg && FA.free, FA);
  check('protégé 3 s après le réveil, la faim baisse un peu, les monstres perdent sa trace', FA.invul && FA.hun > 39 && FA.hun <= 40 && FA.aggro && FA.safe, FA);

  console.log('Combat contre les monstres');
  const cbSrc = fs.readFileSync(path.join(__dirname, 'test-combat.js'), 'utf8'), mm = /const WEAPONS = (\{.*?\});/.exec(cbSrc);
  const W = await E((src) => {
    const I = Iles; const WEAPONS = eval('(' + src + ')'); T.WEAPONS = WEAPONS; return Object.keys(WEAPONS);
  }, mm ? mm[1] : '{}');
  check('armes de test disponibles', W.length >= 3, W);
  const CB2 = await E(() => {
    const I = Iles, g = T.arena(), p = g.local, r = {};
    T.force('stalker', 'flame'); T.reset(g);
    p.inv.slots[2] = { id: I.forge.analyze('sword', T.WEAPONS.sword).id, qty: 1 }; p.sel = 2;
    const a = I.combat.weaponOf(p), per = 3 + a.stats.dmg * I.COMBAT.HIT_SCALE;
    const m = T.mob(g, 20, 0, { hp: 40 }); m.aggro = 0; m.wait = 1e9; const hp0 = m.hp;
    const it = { mx: 0, my: 0, dash: false, use: true, remove: false, aim: { x: p.x + 40, y: p.y - 8 }, interact: false, hotbar: null, ab: 0 };
    T.run(g, 0.5, null, it);
    r.hits = T.log().filter(e => e.type === 'cHit' && e.id === m.id).length; r.hpDown = m.hp < hp0; r.aggro = m.aggro >= 5; r.pid = T.log().some(e => e.type === 'cHit' && e.pid === 'p1');
    r.expected = Math.round(per); r.dealt = hp0 - m.hp;
    // tuer : butin, mort, événement
    m.hp = 1; T.run(g, 0.9, null, it);
    r.dead = !g.state.world.mobs.includes(m); r.die = T.log().some(e => e.type === 'cDie' && e.id === m.id && e.pid === 'p1');
    r.drops = g.state.world.drops.map(d => d.item);
    // les animaux passifs restent frappables
    T.reset(g); g.state.world.creatures = [{ id: 'cc', sp: 0, v: 0, x: g.ax + 20, y: g.ay, hw: 3, hh: 2, left: false, moving: false, frame: 0, at: 0, mode: 'idle', wait: 1e9, tx: 0, ty: 0, stuck: 0, flee: 0, fx: 0, fy: 0, stun: 0, kx: 0, ky: 0, hp: 30, mhp: 30, hpp: 100, herd: { x: g.ax, y: g.ay, ox: g.ax, oy: g.ay, t: 99, key: 0, last: -1, n: 1 } }];
    T.run(g, 0.5, null, it); r.creatureHit = T.log().some(e => e.type === 'cHit' && e.id === 'cc');
    return r;
  });
  check('l’arme frappe un monstre : dégâts, aggro, événement attribué au joueur', CB2.hits >= 1 && CB2.hpDown && CB2.aggro && CB2.pid && CB2.dealt >= CB2.expected * 0.8, CB2);
  check('à 0 PV : le monstre meurt, cDie, butin au sol', CB2.dead && CB2.die && CB2.drops.length >= 1, CB2);
  check('les animaux passifs restent frappables avec le même coup', CB2.creatureHit, CB2);

  console.log('Butin et élites');
  const LT = await E(() => {
    const I = Iles, r = { items: {}, eliteMore: 0, ok: true }, rnd = () => 0.2;
    for (let k = 1; k <= 120; k++) { const D = I.dimgen.describe(k * 331 + 7); for (let i = 0; i < I.mobGen.count(D); i++) { const S = I.mobGen.species(D, i), l = I.mobGen.loot(S, false, rnd), le = I.mobGen.loot(S, true, rnd); l.forEach(x => { r.items[x.item] = 1; if (!I.ITEMS[x.item] || !(x.qty >= 1)) r.ok = false; }); if (le.length > l.length || le.reduce((a, b) => a + b.qty, 0) > l.reduce((a, b) => a + b.qty, 0)) r.eliteMore++; } }
    r.items = Object.keys(r.items).sort();
    return r;
  });
  check('tout le butin est un objet existant, quantités valides', LT.ok, LT);
  check('le butin varie (os, carapace, gelée, écaille, charbon, pierre, cristal…)', LT.items.length >= 6, LT.items);
  check('les élites donnent plus de butin', LT.eliteMore > 100, LT.eliteMore);

  console.log('Réseau, sauvegarde, performances');
  const NT = await E(() => {
    const I = Iles, r = {}, g = T.arena(), w = g.state.world; T.force('charger', 'frost'); T.reset(g);
    const m = T.mob(g, 50, 10, { elite: true }); m.st = 'wind'; m.t = 0.2; m.wt = 0.8; m.ang = 1.3; m.stun = 0; m.hpp = 64;
    w.mproj = [{ x: g.ax + 5, y: g.ay + 5, vx: 100, vy: -20, life: 1, dmg: 5, el: 'none', c: 'rgb(10,20,30)' }];
    const rows = JSON.parse(JSON.stringify(I.mobs.pack(w, [g.local], 520))), pj = JSON.parse(JSON.stringify(I.mobs.packProj(w, [g.local], 520)));
    r.rows = rows.length; r.pj = pj.length;
    const g2 = new I.Game(); g2.newGame(); g2.state.travelTo = g.state.dim; g2.state.travelT = 0; g2.step({ p1: I.Game.NEUTRAL }, 1 / 60);
    const w2 = g2.state.world; I.mobs.unpack(w2, rows, pj);
    const q = w2.mobs[0]; r.copy = w2.mobs.length === 1 && q.id === m.id && q.elite === true && q.st === 'wind' && Math.abs(q.tp - 0.8) < 0.11 && Math.abs(q.ang - 1.3) < 0.06 && q.hpp === 64 && q.hw === 4;
    r.proj = w2.mproj.length === 1 && w2.mproj[0].c === 'rgb(10,20,30)';
    I.mobs.unpack(w2, [['x'], [null], ['a', 99, 0, 1, 1, 0, 0, 100, 0, 0, 0, 0], ['b', 0, 0, NaN, 1, 0, 0, 100, 0, 0, 0, 0], ['ok', 0, 1, 5, 6, 0, 0, 100, 9, 0, 0, 0]], [['bad'], [1, 2, 3, 4, '<script>']]);
    r.robust = w2.mobs.length === 1 && w2.mobs[0].id === 'ok' && w2.mproj.length === 1 && /^rgb\(/.test(w2.mproj[0].c);
    I.mobs.smooth(w2, 0.5, 0.1); r.smooth = true;
    // sauvegarde : rien de plus dans la sauvegarde, et un rechargement fait réapparaître les nids
    const snap = JSON.stringify(g.snapshot()); r.noMobSave = !/"mobs"|mproj/.test(snap);
    const g3 = new I.Game(); g3.loadSnapshot(JSON.parse(snap)); for (let i = 0; i < 60; i++) g3.step({ p1: I.Game.NEUTRAL }, 1 / 60); r.reloadOk = !!g3.state.world;
    // performances : 90 monstres actifs
    T.force(null); const g4 = T.arena(); T.reset(g4); for (const c of g4.state.world.chunks.values()) c.nests = true; T.force('stalker');
    for (let k = 0; k < 90; k++) T.mob(g4, -150 + (k % 15) * 20, -70 + ((k / 15) | 0) * 22, { aggro: 0 });
    const t0 = performance.now(); for (let i = 0; i < 300; i++) g4.step({ p1: I.Game.NEUTRAL }, 1 / 60); r.ms = (performance.now() - t0) / 300; r.count = g4.state.world.mobs.length;
    return r;
  });
  check('pack / unpack : monstre, élite, préparation, angle, projectile transmis', NT.rows === 1 && NT.pj === 1 && NT.copy && NT.proj, NT);
  check('données réseau abîmées ignorées (pas d’erreur, couleur de projectile assainie)', NT.robust && NT.smooth, NT);
  check('les monstres ne sont pas sauvegardés et le rechargement fonctionne', NT.noMobSave && NT.reloadOk, NT);
  check('90 monstres actifs : pas de simulation < 4 ms (' + NT.ms.toFixed(2) + ' ms)', NT.count === 90 && NT.ms < 4, NT);

  console.log('Rendu réel');
  await page.click('#btn-new').catch(() => {}); await page.waitForTimeout(100);
  await E(() => { Iles.Menu.show('playing'); });
  const RD = await E(() => {
    const I = Iles, g = I.debug.game, N = I.Game.NEUTRAL, r = { tele: [] };
    g.newGame(); g.travel('d:3333'); for (let i = 0; i < 60; i++) g.step({ p1: N }, 1 / 60);
    const w = g.state.world, sp = w.spawn, pl = g.local;
    for (const c of w.chunks.values()) c.nests = true; w.mobs = [];
    let spot = null; for (let dy = -60; dy <= 60 && !spot; dy += 3) for (let dx = -60; dx <= 60; dx += 3) { const tx = Math.floor(sp.x / 16) + dx, ty = Math.floor(sp.y / 16) + dy; let ok = true; for (let j = -8; j <= 8 && ok; j++) for (let i = -14; i <= 14; i++) if (!w.isLand(tx + i, ty + j)) { ok = false; break; } if (ok) { spot = [tx * 16 + 8, ty * 16 + 8]; break; } }
    pl.x = spot[0]; pl.y = spot[1]; pl.invul = 1e6; I.debug.cam.snapTo(pl.x, pl.y - 8, w.W * 16, w.H * 16);
    const n = I.mobGen.count(w.D), key = [...w.chunks.keys()][0], orig = I.mobGen.species;
    const forceA = ['charger', 'brute', 'bomber', 'spitter', 'stalker', 'swarmer'];
    for (let k = 0; k < 6; k++) {
      const x = spot[0] - 120 + k * 48, y = spot[1] - 30 + (k % 2) * 40;
      w.mobs.push({ id: 'r' + k, mob: 1, sp: k % n, v: k & 3, x: x, y: y, hw: 4, hh: 2, left: false, moving: false, frame: 0, at: 0, hp: 50, mhp: 100, hpp: 70, tier: 0, elite: k === 1, home: { x: x, y: y, key: key }, st: 'wind', t: 5, wt: 10, cd: 0, ang: 0.4 * k, tx: 0, ty: 0, wait: 1e9, stuck: 0, kx: 0, ky: 0, stun: k === 5 ? 2 : 0, aggro: 0, sg: 1, hit: false, ph: k, mul: 1 });
    }
    I.mobGen.species = (D, i) => { const S = orig(D, i); const k = w.mobs.findIndex(m => m.sp === i); return S; };
    w.mproj = [{ x: spot[0] + 60, y: spot[1] - 20, vx: 30, vy: 0, life: 99, c: 'rgb(120,255,90)' }];
    const cv = I.debug.renderer.canvas; let err = null;
    try { for (let f = 0; f < 6; f++) { for (const m of w.mobs) { m.t = 2 + f * 0.1; m.moving = f % 2 === 0; m.frame = f % 3; } I.debug.renderer.draw(g.state, I.debug.cam, I.debug.fx, 0.016); } } catch (e) { err = e.message; }
    r.err = err; r.w = cv.width;
    I.mobGen.species = orig;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let red = 0; for (let q = 0; q < d.length; q += 4) if (d[q] > 200 && d[q + 1] < 110 && d[q + 2] < 100) red++;
    r.red = red;
    return r;
  });
  check('le rendu des monstres, télégraphes, barres de vie et projectiles ne plante pas', RD.err === null, RD);
  check('les zones de danger rouges sont dessinées', RD.red > 20, RD.red);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'monstres.png') });

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
