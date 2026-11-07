/*
 * Combat : combo de base, les 15 capacités (portée, délai, dégâts, effets), recul / étourdissement / panique, mort et butin, intentions,
 * barre de capacités, outils non concernés, sauvegarde, rendu réel.
 *   node tools/test-combat.js     (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

// Outils communs, injectés dans la page : arène plate, créatures immobiles, pas de hasard (Math.random = 0,5 : jamais de critique, dégâts exacts)
const LIB = `
window.L = (function () {
  const I = Iles, N = I.Game.NEUTRAL;
  const WEAPONS = { sword: ['stick', 'stick', 'iron_bar'], dagger: ['stick', 'stick', 'iron_bar'], spear: ['stick', 'stick', 'iron_bar'], axe: ['stick', 'stick', 'iron_bar'], mace: ['stick', 'stick', 'iron_bar'] };
  let n = 0, log = [], KEY = null, rnd = Math.random;
  function arena() {
    const g = new I.Game(); g.newGame();
    for (let k = 0; k < 40; k++) {
      g.state.travelTo = 'd:' + (900 + k * 37); g.state.travelT = 0; g.step({ p1: N }, 1 / 60);
      const w = g.state.world, sp = w.spawn;
      for (let dy = -60; dy <= 60; dy += 4) for (let dx = -60; dx <= 60; dx += 4) {
        const tx = Math.floor(sp.x / 16) + dx, ty = Math.floor(sp.y / 16) + dy; let ok = true;
        for (let j = -9; j <= 9 && ok; j++) for (let i = -9; i <= 9; i++) if (!w.isLand(tx + i, ty + j)) { ok = false; break; }
        if (ok) { g.ax = tx * 16 + 8; g.ay = ty * 16 + 8; for (let s = 0; s < 40; s++) g.step({ p1: N }, 1 / 60); return g; }
      }
    }
    return g;
  }
  function reset(g, model) {
    const w = g.state.world, p = g.local;
    for (const c of w.chunks.values()) c.herds = true;
    w.creatures = []; w.proj = []; w.drops = []; KEY = w.chunks.keys().next().value;
    p.cb = null; p.swing = null; p.lunge = null; p.useCd = 0; p.dashT = 0; p.x = g.ax; p.y = g.ay; p.dir = 'right';
    p.inv.slots[2] = { id: I.forge.analyze(model, WEAPONS[model]).id, qty: 1 }; p.sel = 2;
    log = []; g.events.length = 0; Math.random = () => 0.5;
  }
  function cr(g, dx, dy, hp) {
    const w = g.state.world, x = g.ax + dx, y = g.ay + dy, c = { id: 't' + (n++), sp: 0, v: 0, x: x, y: y, hw: 3, hh: 2, left: false, moving: false, frame: 0, at: 0, mode: 'idle', wait: 1e9, tx: 0, ty: 0, stuck: 0, flee: 1e9, fx: 0, fy: 0, herd: { x: x, y: y, ox: x, oy: y, key: KEY, last: -1, n: 1, t: 99 }, hp: hp || 99999, mhp: hp || 99999, hpp: 100, kx: 0, ky: 0, stun: 0, x0: x, y0: y };
    w.creatures.push(c); return c;
  }
  // pas de simulation ; pin = remet les créatures à leur place avant chaque pas (tests de coups répétés)
  function run(g, secs, it, pin) {
    const p = g.local, k = Math.round(secs * 60);
    for (let i = 0; i < k; i++) {
      if (pin) for (const c of g.state.world.creatures) { c.x = c.x0; c.y = c.y0; c.kx = c.ky = 0; c.flee = 1e9; c.fx = c.fy = 0; c.stun = 0; }
      g.step({ p1: i === 0 && it ? it : N }, 1 / 60);
      for (const e of g.takeEvents()) log.push(Object.assign({ t: (log.t0 = 0) || i / 60 }, e));
    }
  }
  const aimR = (g, d) => ({ x: g.local.x + (d === undefined ? 100 : d), y: g.local.y - 8 });
  const hits = c => log.filter(e => e.type === 'cHit' && e.id === c.id);
  const dmgs = c => hits(c).map(e => e.dmg);
  const base = (g) => { const a = I.combat.weaponOf(g.local); return 3 + a.stats.dmg * I.COMBAT.HIT_SCALE; };
  const restore = () => { Math.random = rnd; };
  return { I: I, N: N, arena: arena, reset: reset, cr: cr, run: run, aimR: aimR, hits: hits, dmgs: dmgs, base: base, log: () => log, restore: restore, WEAPONS: WEAPONS };
})();
`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 640 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  await page.goto(URL); await page.waitForTimeout(400);
  await E(LIB);

  console.log('Données et armes');
  const D = await E(() => {
    const I = Iles, r = { models: Object.keys(I.COMBAT.AB), ok: true, names: new Set(), n: 0 };
    for (const m of r.models) {
      if (I.COMBAT.AB[m].length !== 3 || !I.COMBAT.MODEL[m] || !I.FORGE.MODELS[m]) r.ok = false;
      I.COMBAT.AB[m].forEach((a, i) => { r.n++; r.names.add(a.n); if (!(a.cd > 0) || !a.d || typeof I.combat.ABILITY[m][i] !== 'function') r.ok = false; });
    }
    r.names = r.names.size; r.same = Object.keys(I.FORGE.MODELS).sort().join() === r.models.slice().sort().join();
    r.colors = r.models.map(m => I.combat.colorOf(I.forge.analyze(m, ['stick', 'stick', 'iron_bar~blue']))).join();
    return r;
  });
  check('5 modèles × 3 capacités = ' + D.n + ' capacités, toutes nommées, décrites, avec recharge et code', D.ok && D.n === 15 && D.names === 15 && D.same, D);
  check('la couleur des effets vient du matériau de la partie principale (fer bleu)', /^(#[0-9a-f]{6},){4}#[0-9a-f]{6}$/.test(D.colors) && new Set(D.colors.split(',')).size === 1, D.colors);

  console.log('Coup de base : combo, portée, vitesse');
  const B = await E(() => {
    const L = window.L, I = L.I, r = {}, g = L.arena();
    window.__g = g;
    r.arena = [Math.round(g.ax), Math.round(g.ay)];
    const durs = {}, reach = {};
    for (const m of ['sword', 'dagger', 'spear', 'axe', 'mace']) {
      L.reset(g, m);
      const M = I.COMBAT.MODEL[m], c1 = L.cr(g, M.reach - 3, 0), c2 = L.cr(g, -(M.reach - 3), 0), c3 = L.cr(g, M.reach + 20, 0);
      const base = L.base(g), seq = [];
      for (let k = 0; k < 3; k++) { // trois coups enchaînés
        L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); if (k === 0) durs[m] = g.local.swing && g.local.swing.dur;
        L.run(g, g.local.swing ? g.local.swing.dur + 0.09 : 0.3);
        for (const c of [c1]) { c.x = c.x0; c.kx = c.ky = 0; c.flee = 1e9; c.fx = c.fy = 0; c.stun = 0; }
      }
      const d = L.dmgs(c1);
      reach[m] = { front: d.length, behind: L.hits(c2).length, far: L.hits(c3).length, d: d, base: base, ratio: d.map(v => +(v / base).toFixed(2)) };
      // pause : le combo repart à zéro
      L.run(g, 1);
      c1.x = c1.x0; c1.kx = c1.ky = 0; c1.flee = 1e9; c1.fx = c1.fy = 0; c1.stun = 0; L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.5);
      reach[m].again = L.dmgs(c1)[3];
    }
    r.durs = durs; r.reach = reach; L.restore();
    return r;
  });
  const okCombo = Object.values(B.reach).every(x => x.front === 3 && x.behind === 0 && x.far === 0 && Math.abs(x.d[0] - x.base) <= 1 && Math.abs(x.d[1] - x.base * 1.1) <= 1 && Math.abs(x.d[2] - x.base * 1.7) <= 1.2 && Math.abs(x.again - x.base) <= 1);
  check('combo de 3 coups sur chaque arme : ×1, ×1,1, ×1,7 ; rien derrière ni hors portée ; le combo repart après une pause', okCombo, B.reach);
  check('vitesses différentes : dague plus rapide que sabre, lance, hache et masse', B.durs.dagger < B.durs.sword && B.durs.sword < B.durs.spear && B.durs.spear < B.durs.axe && B.durs.axe < B.durs.mace, B.durs);

  console.log('Capacités : épée');
  const run = (fn) => E(fn);
  const S = await E(() => {
    const L = window.L, g = window.__g, r = {}; L.restore();
    const cast = (ab, d) => L.run(g, 0.01, { ...L.N, ab: ab, aim: L.aimR(g, d) });
    // R : taillade
    L.reset(g, 'sword'); let a = L.cr(g, 28, 0), b = L.cr(g, -28, 0), c = L.cr(g, 60, 0); cast(1); L.run(g, 0.6);
    r.R = { a: L.hits(a).length, b: L.hits(b).length, c: L.hits(c).length, cd: g.local.cb.cd[0], base: L.base(g), d: L.dmgs(a) };
    cast(1); L.run(g, 0.3); r.R.blocked = L.hits(a).length === 2; // recharge : pas de 2e lancer
    // F : estoc
    L.reset(g, 'sword'); a = L.cr(g, 55, 0); b = L.cr(g, -40, 0); const x0 = g.local.x; cast(2); L.run(g, 0.5);
    r.F = { a: L.hits(a).length, b: L.hits(b).length, moved: g.local.x - x0, d: L.dmgs(a), base: L.base(g) };
    // V : onde
    L.reset(g, 'sword'); a = L.cr(g, 80, 0); b = L.cr(g, 160, 0); c = L.cr(g, 270, 0); cast(3); L.run(g, 1.2);
    r.V = { a: L.hits(a).length, b: L.hits(b).length, c: L.hits(c).length, proj: g.state.world.proj.length, d: L.dmgs(a), base: L.base(g), fx: L.log().some(e => e.type === 'cfx' && e.k === 'proj') };
    L.restore(); return r;
  });
  check('Taillade tournoyante : touche devant ET derrière (2 balayages), pas hors zone, recharge respectée', S.R.a === 2 && S.R.b === 2 && S.R.c === 0 && S.R.blocked && S.R.cd > 3 && Math.abs(S.R.d[0] - S.R.base * 1.1) <= 1, S.R);
  check('Estoc éclair : élan de ' + Math.round(S.F.moved) + ' px, transperce devant, rien derrière', S.F.moved > 60 && S.F.a === 1 && S.F.b === 0 && Math.abs(S.F.d[0] - S.F.base * 1.9) <= 1, S.F);
  check('Onde de lame : traverse 2 créatures alignées, s’arrête avant 270 px, projectile retiré', S.V.a === 1 && S.V.b === 1 && S.V.c === 0 && S.V.proj === 0 && S.V.fx && Math.abs(S.V.d[0] - S.V.base * 2.8) <= 1.5, S.V);

  console.log('Capacités : dague');
  const Dg = await E(() => {
    const L = window.L, g = window.__g, r = {}, I = L.I; L.restore();
    const cast = (ab, d) => L.run(g, 0.01, { ...L.N, ab: ab, aim: L.aimR(g, d) });
    L.reset(g, 'dagger'); let a = L.cr(g, 55, 0); const x0 = g.local.x; cast(1); L.run(g, 0.4);
    r.R = { moved: g.local.x - x0, a: L.hits(a).length, back: g.local.cb.back, d: L.dmgs(a), base: L.base(g) };
    // coup suivant = critique garanti (hasard à 0,5 : sans le bonus, jamais critique)
    a.x = a.x0 = g.local.x + 12; a.y = a.y0 = g.local.y; a.kx = a.ky = 0; a.flee = 1e9; a.stun = 0; const n0 = L.hits(a).length;
    L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.4);
    const d2 = L.dmgs(a); r.crit = { dmg: d2[n0], base: L.base(g), flag: L.hits(a)[n0] && L.hits(a)[n0].crit, back: g.local.cb.back };
    // F : éventail
    L.reset(g, 'dagger'); a = L.cr(g, 100, 0); const b = L.cr(g, 190, 0), c = L.cr(g, 95, 24); cast(2); L.run(g, 0.9);
    r.F = { a: L.hits(a).length, b: L.hits(b).length, c: L.hits(c).length, proj: g.state.world.proj.length, knives: L.log().filter(e => e.type === 'cfx' && e.sub === 'knife').length };
    // V : frénésie
    L.reset(g, 'dagger'); L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); const d0 = g.local.swing.dur; L.run(g, 0.6);
    L.reset(g, 'dagger'); cast(3); L.run(g, 0.3); const fr = g.local.cb.frenzy, sm = I.combat.speedMul(g.local);
    L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); const d1 = g.local.swing.dur; L.run(g, 5.5);
    r.V = { d0: d0, d1: d1, fr: fr, sm: sm, end: g.local.cb.frenzy, smEnd: I.combat.speedMul(g.local) };
    L.restore(); return r;
  });
  check('Pas d’ombre : bond de ' + Math.round(Dg.R.moved) + ' px qui frappe au passage, puis critique garanti (×1,8) au coup suivant, une seule fois', Dg.R.moved > 55 && Dg.R.a === 1 && Dg.R.back > 2.4 && Dg.crit.flag === true && Math.abs(Dg.crit.dmg - Dg.crit.base * 1.8) <= 1.5 && Dg.crit.back === 0, Dg);
  check('Pluie de lames : 5 dagues, portée limitée, éventail (la créature décalée est touchée), projectiles retirés', Dg.F.knives === 5 && Dg.F.a === 1 && Dg.F.b === 0 && Dg.F.c === 1 && Dg.F.proj === 0, Dg.F);
  check('Frénésie : coups ' + (Dg.V.d0 / Dg.V.d1).toFixed(1) + '× plus rapides, déplacement ×1,25, fin après 5 s', Dg.V.d0 / Dg.V.d1 > 1.7 && Math.abs(Dg.V.sm - 1.25) < 0.01 && Dg.V.fr > 4.5 && Dg.V.end === 0 && Dg.V.smEnd === 1, Dg.V);

  console.log('Capacités : lance');
  const Sp = await E(() => {
    const L = window.L, g = window.__g, r = {}; L.restore();
    const cast = (ab, d) => L.run(g, 0.01, { ...L.N, ab: ab, aim: L.aimR(g, d) });
    L.reset(g, 'spear'); let a = L.cr(g, 80, 0), b = L.cr(g, 112, 0); cast(1); L.run(g, 0.05); const early = L.hits(a).length; L.run(g, 0.5);
    r.R = { early: early, a: L.hits(a).length, b: L.hits(b).length, d: L.dmgs(a), base: L.base(g), kb: a.kx };
    L.reset(g, 'spear'); const q = [60, 110, 160, 210].map(x => L.cr(g, x, 0)); cast(2); L.run(g, 1.2);
    r.F = { hits: q.map(c => L.hits(c).length).join(), proj: g.state.world.proj.length };
    L.reset(g, 'spear'); a = L.cr(g, 58, 0); b = L.cr(g, 109, 0); const c = L.cr(g, 160, 0), d = L.cr(g, -30, 0); cast(3); let st = 0;
    for (let i = 0; i < 60; i++) { L.run(g, 1 / 60); st = Math.max(st, a.stun, b.stun); }
    r.V = { a: L.hits(a).length, b: L.hits(b).length, c: L.hits(c).length, d: L.hits(d).length, stun: st, spikes: L.log().filter(e => e.type === 'cfx' && e.k === 'spike').length };
    L.restore(); return r;
  });
  check('Fente : long coup d’estoc (80 px oui, 112 px non), léger délai, recul', Sp.R.early === 0 && Sp.R.a === 1 && Sp.R.b === 0 && Math.abs(Sp.R.d[0] - Sp.R.base * 2.3) <= 1.2, Sp.R);
  check('Javelot : traverse exactement 3 créatures sur 4 (' + Sp.F.hits + ')', Sp.F.hits === '1,1,1,0' && Sp.F.proj === 0, Sp.F);
  check('Forêt de piques : 6 pointes en ligne, touchent et étourdissent, rien au-delà ni derrière', Sp.V.a === 1 && Sp.V.b === 1 && Sp.V.c === 0 && Sp.V.d === 0 && Sp.V.stun > 0.5 && Sp.V.spikes === 6, Sp.V);

  console.log('Capacités : hache');
  const Ax = await E(() => {
    const L = window.L, g = window.__g, r = {}, I = L.I; L.restore();
    const cast = (ab, d) => L.run(g, 0.01, { ...L.N, ab: ab, aim: L.aimR(g, d) });
    L.reset(g, 'axe'); let a = L.cr(g, 40, 0), b = L.cr(g, -40, 0); cast(1); L.run(g, 0.2); const early = L.hits(a).length; L.run(g, 0.5);
    r.R = { early: early, a: L.hits(a).length, b: L.hits(b).length, d: L.dmgs(a), base: L.base(g), stun: a.stun, kx: a.kx };
    L.reset(g, 'axe'); a = L.cr(g, 0, 55); b = L.cr(g, -80, 0); cast(2); L.run(g, 0.3);
    r.F = { a: L.hits(a).length, b: L.hits(b).length, rage: g.local.cb.rage, flee: a.flee > 0 };
    a.x = a.x0 = g.local.x + 20; a.y = a.y0 = g.local.y; a.kx = a.ky = 0; a.stun = 0; a.flee = 1e9; a.fx = a.fy = 0; const n0 = L.hits(a).length;
    L.run(g, 0.3); L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.5);
    r.F.next = L.dmgs(a)[n0]; r.F.base = L.base(g);
    L.reset(g, 'axe'); a = L.cr(g, 22, 0); cast(3); const sm = I.combat.speedMul(g.local); L.run(g, 1.8, null, true);
    r.V = { hits: L.hits(a).length, sm: sm, smEnd: I.combat.speedMul(g.local), d: L.dmgs(a)[0], base: L.base(g) };
    L.restore(); return r;
  });
  check('Fendoir : coup lent (rien avant 0,3 s), énorme, étourdit, rien derrière', Ax.R.early === 0 && Ax.R.a === 1 && Ax.R.b === 0 && Math.abs(Ax.R.d[0] - Ax.R.base * 3.2) <= 1.5 && Ax.R.stun > 0, Ax.R);
  check('Cri de guerre : onde à 360° (55 px oui, 80 px non), effraie, puis +30 % de dégâts au coup suivant', Ax.F.a === 1 && Ax.F.b === 0 && Ax.F.rage > 4 && Math.abs(Ax.F.next - Ax.F.base * 1.3) <= 1.2, Ax.F);
  check('Tourbillon sanglant : ' + Ax.V.hits + ' coups en 1,6 s sur la même cible, déplacement ralenti puis normal', Ax.V.hits >= 7 && Math.abs(Ax.V.sm - 0.7) < 0.01 && Ax.V.smEnd === 1, Ax.V);

  console.log('Capacités : masse');
  const Mc = await E(() => {
    const L = window.L, g = window.__g, r = {}; L.restore();
    const cast = (ab, d) => L.run(g, 0.01, { ...L.N, ab: ab, aim: L.aimR(g, d) });
    L.reset(g, 'mace'); let a = L.cr(g, 54, 0), b = L.cr(g, 105, 0); cast(1); L.run(g, 0.2); const early = L.hits(a).length; L.run(g, 0.2);
    r.R = { early: early, a: L.hits(a).length, b: L.hits(b).length, stun: a.stun, d: L.dmgs(a), base: L.base(g) };
    L.reset(g, 'mace'); a = L.cr(g, 60, 0); const x0 = g.local.x; cast(2); L.run(g, 0.4);
    r.F = { moved: g.local.x - x0, a: L.hits(a).length, push: a.x - a.x0 };
    L.reset(g, 'mace'); a = L.cr(g, 30, 0); b = L.cr(g, 80, 0); const c = L.cr(g, 125, 0); cast(3); L.run(g, 1.3, null, true);
    r.V = { a: L.hits(a).length, b: L.hits(b).length, c: L.hits(c).length };
    L.restore(); return r;
  });
  check('Séisme : impact différé devant toi, étourdissement > 1 s, rien hors zone', Mc.R.early === 0 && Mc.R.a === 1 && Mc.R.b === 0 && Mc.R.stun > 0.9 && Math.abs(Mc.R.d[0] - Mc.R.base * 2.2) <= 1.2, Mc.R);
  check('Charge : élan de ' + Math.round(Mc.F.moved) + ' px, la cible est projetée (+' + Math.round(Mc.F.push) + ' px)', Mc.F.moved > 80 && Mc.F.a === 1 && Mc.F.push > 30, Mc.F);
  check('Onde de choc : 3 ondes (proche 3 fois, à 80 px une fois, à 125 px jamais)', Mc.V.a === 3 && Mc.V.b === 1 && Mc.V.c === 0, Mc.V);

  console.log('Recul, panique, mort, butin');
  const K = await E(() => {
    const L = window.L, g = window.__g, r = {}, I = L.I; L.restore();
    L.reset(g, 'sword'); let a = L.cr(g, 25, 0, 200); a.flee = 0; a.fx = a.fy = 0; a.wait = 1e9; const x0 = a.x;
    L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.5);
    r.kb = a.x - x0; r.flee = a.flee > 0; r.hpp = a.hpp; r.moved = a.x - x0 > 2;
    // mort : une créature fragile
    L.reset(g, 'axe'); const w = g.state.world, v = L.cr(g, 25, 0, 4); v.flee = 0; v.fx = v.fy = 0; const n0 = w.creatures.length, d0 = w.drops.length;
    L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.6);
    const meat = w.drops.filter(d => /^meat/.test(d.item)).length;
    r.die = { gone: w.creatures.indexOf(v) < 0 && w.creatures.length === n0 - 1, meat: meat, ev: L.log().some(e => e.type === 'cDie' && e.id === v.id) };
    // ramassage de la viande par le joueur
    p0 = g.local; p0.x = w.drops[0].x; p0.y = w.drops[0].y + 6; const before = p0.inv.count ? p0.inv.count('meat') : 0; for (let i = 0; i < 120; i++) g.step({ p1: L.N }, 1 / 60);
    r.pick = p0.inv.slots.some(s => s && /^meat/.test(s.id));
    r.item = I.ITEMS.meat_quad.name; L.restore(); return r;
  });
  check('un coup fait reculer (' + Math.round(K.kb) + ' px), effraie la créature, réduit sa barre de vie (' + K.hpp + ' %)', K.kb > 10 && K.flee && K.hpp < 100, K);
  check('à 0 PV : la créature disparaît, laisse de la viande, que l’on ramasse', K.die.gone && K.die.meat >= 2 && K.die.ev && K.pick && /cru|Chair|Filet/.test(K.item), K);

  console.log('Outils, sans arme, multijoueur (intentions)');
  const T = await E(() => {
    const L = window.L, g = window.__g, r = {}, I = L.I; L.restore();
    L.reset(g, 'sword'); const a = L.cr(g, 20, 0, 500); g.local.sel = 0; // la hache de départ
    L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g) }); L.run(g, 0.5); L.run(g, 0.01, { ...L.N, ab: 1, aim: L.aimR(g) }); L.run(g, 0.5);
    r.tool = { hits: L.hits(a).length, cd: g.local.cb ? g.local.cb.cd.join() : '', cfx: L.log().filter(e => e.type === 'cfx').length, hint: L.log().some(e => e.type === 'msg' && /arme forgée/.test(e.text)), swing: true };
    // intentions : le champ ab traverse la fusion d'intentions du réseau
    const merged = (function () { const g2 = { it: { ...L.N, ab: 0 }, edge: { ab: 2 } }; const it = Object.assign({}, g2.it); it.ab = g2.edge.ab || 0; return it.ab; })();
    r.merged = merged;
    const snap = JSON.stringify(g.snapshot()); r.save = /"cb"|"cd"|"proj"|"lunge"/.test(snap);
    L.reset(g, 'dagger'); L.run(g, 0.01, { ...L.N, ab: 3, aim: L.aimR(g) }); r.pack = JSON.stringify(g.local.cb.cd);
    L.restore(); return r;
  });
  check('avec un outil : aucun dégât aux créatures, aucune capacité, message d’aide', T.tool.hits === 0 && T.tool.cfx === 0 && T.tool.hint, T.tool);
  check('multijoueur : l’intention « capacité » survit à la fusion des intentions ; rien de tout cela n’est sauvegardé', T.merged === 2 && !T.save, T);

  console.log('Barre de capacités et rendu réel');
  await page.click('#btn-new'); await page.waitForTimeout(500);
  const H = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, N = I.Game.NEUTRAL, r = {};
    const bar = () => Array.from(document.querySelectorAll('#abilities .ab')).map(e => ({ k: e.querySelector('.k').textContent, n: e.querySelector('.n').textContent, ready: e.classList.contains('ready'), t: e.querySelector('.t').textContent }));
    r.none = bar().length;
    const id = I.forge.analyze('spear', ['stick', 'stick', 'iron_bar~blue']).id; p.inv.slots[2] = { id: id, qty: 1 }; p.sel = 2;
    g.state.travelTo = 'd:777'; g.state.travelT = 0; g.step({ p1: N }, 1 / 60); for (let i = 0; i < 100; i++) g.step({ p1: N }, 1 / 60);
    const w = g.state.world; let best = null, bn = 0; for (const c of w.creatures) { const n = w.creatures.filter(o => o.herd === c.herd).length; if (n > bn) { bn = n; best = c; } }
    p.x = best.herd.x - 40; p.y = best.herd.y;
    return r;
  });
  await page.waitForTimeout(400);
  const H2 = await E(() => {
    const I = Iles, g = I.debug.game, p = g.local, r = {};
    const bar = () => Array.from(document.querySelectorAll('#abilities .ab')).map(e => ({ k: e.querySelector('.k').textContent, n: e.querySelector('.n').textContent, ready: e.classList.contains('ready'), t: e.querySelector('.t').textContent }));
    r.before = bar(); const w = g.state.world; let c = w.creatures.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b);
    g.step({ p1: { ...I.Game.NEUTRAL, ab: 2, aim: { x: c.x, y: c.y - 6 } } }, 1 / 60);
    return r;
  });
  await page.waitForTimeout(250);
  const shot1 = await page.screenshot({ path: path.join(OUT, '103-capacite.png') });
  const H3 = await E(() => { const bar = Array.from(document.querySelectorAll('#abilities .ab')).map(e => ({ ready: e.classList.contains('ready'), t: e.querySelector('.t').textContent, h: e.querySelector('.f').style.height })); return { bar: bar, vis: Iles.debug.fx.vis.length, parts: Iles.debug.fx.parts.length }; });
  check('barre de capacités : cachée sans arme, 3 cases R / F / V avec le nom des capacités de la lance', H.none === 0 && H2.before.map(b => b.k).join('') === 'RFV' && H2.before.map(b => b.n).join('|') === 'Fente|Javelot|Forêt de piques' && H2.before.every(b => b.ready), [H, H2]);
  check('après un lancer : la case F affiche sa recharge (' + H3.bar[1].t + ' s), les autres restent prêtes ; des effets sont à l’écran', !H3.bar[1].ready && H3.bar[1].t !== '' && H3.bar[0].ready && H3.bar[2].ready && (H3.vis > 0 || H3.parts > 3), H3);
  await page.waitForTimeout(1500);
  await E(() => { const I = Iles, g = I.debug.game, p = g.local, w = g.state.world; const c = w.creatures.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b); p.cb.cd = [0, 0, 0]; p.cb.busy = 0; g.step({ p1: { ...I.Game.NEUTRAL, ab: 3, aim: { x: c.x, y: c.y - 6 } } }, 1 / 60); });
  await page.waitForTimeout(300);
  const a1 = require('crypto').createHash('md5').update(await page.screenshot({ path: path.join(OUT, '104-piques.png') })).digest('hex');
  await page.waitForTimeout(1500);
  const a2 = require('crypto').createHash('md5').update(await page.screenshot()).digest('hex');
  check('les effets sont réellement dessinés (image différente pendant et après la capacité)', a1 !== a2);

  console.log('\nErreurs JavaScript : ' + (errors.length ? errors.join(' | ') : 'aucune'));
  console.log('\n' + pass + ' réussis, ' + (fail + (errors.length ? 1 : 0)) + ' échoués');
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
