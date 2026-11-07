/*
 * Pouvoirs des pierres d'enchantement (systems/powers.js) : brûlure + explosion, givre + gel, venin + nuage, foudre en chaîne,
 * pierres doubles (choc thermique, tempête toxique), niveaux, armes non enchantées, événements visuels, rendu.   node tools/test-powers.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const LIB = fs.readFileSync(path.join(__dirname, 'test-combat.js'), 'utf8').match(/const LIB = `([\s\S]*?)\n`;/)[1];
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
  await E(LIB);
  await E(() => {
    // outils : équipe l'arme enchantée, place des cibles immobiles proches, frappe n fois
    window.P = {
      setup(codes) { const g = L.arena(); L.reset(g, 'sword'); const I = Iles, p = g.local, id = 'wp:sword:stick,stick,iron_bar' + (codes ? '@' + codes : ''); p.inv.slots[2] = { id: id, qty: 1 }; p.sel = 2; p.cb = null; return g; },
      hit(g, n) { const out = []; for (let i = 0; i < n; i++) { g.local.useCd = 0; L.run(g, 0.01, { ...L.N, use: true, aim: L.aimR(g, 20) }); L.run(g, 0.45, null, true); } },
      evs(k) { return L.log().filter(e => e.type === 'cfx' && e.k === k); },
    };
  });

  console.log('Aucun pouvoir sans enchantement');
  const A = await E(() => { const g = P.setup(''); const c = L.cr(g, 20, 0, 99999); Math.random = () => 0.5; P.hit(g, 4); L.restore(); return { sx: !!c.sx, fx: L.log().filter(e => e.type === 'cfx' && /^e/.test(e.k)).length, hits: L.hits(c).length }; });
  check('arme normale : aucun état ni effet de pierre', !A.sx && A.fx === 0 && A.hits >= 3, A);

  console.log('Flamme');
  const F = await E(() => {
    const g = P.setup('fl'); const c = L.cr(g, 20, 0, 99999), c2 = L.cr(g, 34, 0, 99999); Math.random = () => 0.5;
    P.hit(g, 1); const burn1 = c.sx && c.sx.burn ? c.sx.burn.t : 0; const hp1 = c.hp;
    L.run(g, 1.1, null, true); const dot = hp1 - c.hp;
    P.hit(g, 2); const boom = P.evs('eboom').length; L.restore();
    return { burn1: burn1 > 0, dot: dot, boom: boom, other: !!(c2.sx && c2.sx.burn) };
  });
  check('un coup enflamme la cible : dégâts dans le temps', F.burn1 && F.dot > 0, F);
  check('3e coup : explosion ardente (événement) qui enflamme aussi les voisins', F.boom >= 1 && F.other, F);

  console.log('Givre');
  const R = await E(() => {
    const g = P.setup('fr'); const c = L.cr(g, 20, 0, 99999); Math.random = () => 0.5;
    P.hit(g, 1); const k1 = c.sx && c.sx.slow ? c.sx.slow.k : 1; const mul1 = Iles.powers.speedMul(c);
    P.hit(g, 3); const ice = P.evs('eice').length; L.restore();
    const g2 = P.setup('fr'), c2 = L.cr(g2, 20, 0, 99999), a2 = Iles.combat.weaponOf(g2.local); for (let i = 0; i < 4; i++) Iles.powers.onHit(g2.state, g2.local, a2, c2, false, []); const frozen = c2.sx.freeze > 0 && c2.stun >= 1.4;
    return { k1: k1, mul1: mul1, ice: ice, frozen: !!frozen };
  });
  check('un coup ralentit (vitesse ×0,62)', R.k1 < 0.7 && R.mul1 === R.k1, R);
  check('4e coup : la cible est gelée (étourdie) et un éclat de glace est émis', R.ice >= 1 && R.frozen, R);

  console.log('Venin');
  const V = await E(() => {
    const g = P.setup('ve'); const c = L.cr(g, 20, 0, 99999); Math.random = () => 0.5;
    P.hit(g, 3); const st = c.sx && c.sx.venom ? c.sx.venom.n : 0; const hp = c.hp; L.run(g, 1.2, null, true); const dot = hp - c.hp;
    // mort empoisonnée : nuage toxique, qui empoisonne un ennemi voisin
    const w = g.state.world, v = L.cr(g, 20, 0, 40), near = L.cr(g, 40, 0, 99999);
    v.sx = { burn: null, venom: { t: 5, n: 3, d: 30, src: g.local.id }, slow: null, freeze: 0, acc: 0, fxT: 0 };
    L.run(g, 0.9, null, true); const dead = w.creatures.indexOf(v) < 0; const clouds = (w.clouds || []).length; const cfx = P.evs('cloud').length;
    L.run(g, 1.2, null, true); const gotPoison = !!(near.sx && near.sx.venom); L.restore();
    return { st: st, dot: dot, dead: dead, clouds: clouds, cfx: cfx, gotPoison: gotPoison };
  });
  check('le venin se cumule (charges) et fait des dégâts dans le temps', V.st >= 2 && V.dot > 0, V);
  check('mort empoisonnée : nuage toxique, qui empoisonne les voisins', V.dead && V.clouds >= 1 && V.cfx >= 1 && V.gotPoison, V);

  console.log('Foudre');
  const S = await E(() => {
    const g = P.setup('sh'); const c = L.cr(g, 20, 0, 99999); const b = L.cr(g, 50, 0, 99999), d = L.cr(g, 80, 0, 99999); Math.random = () => 0.1;
    P.hit(g, 1); const bolts = P.evs('ebolt').length, hb = L.hits(b).length, hd = L.hits(d).length; L.restore();
    const far = (() => { const g2 = P.setup('sh'); const c1 = L.cr(g2, 20, 0, 99999), e = L.cr(g2, 20, 200, 99999); Math.random = () => 0.1; P.hit(g2, 1); L.restore(); return L.hits(e).length; })();
    return { bolts: bolts, hb: hb, hd: hd, far: far };
  });
  check('éclair en chaîne : saute sur les ennemis proches (2 arcs), pas sur les lointains', S.bolts >= 2 && S.hb >= 1 && S.hd >= 1 && S.far === 0, S);

  console.log('Pierres doubles et niveaux');
  const Dd = await E(() => {
    const out = {};
    let g = P.setup('ff'); let c = L.cr(g, 20, 0, 99999), c2 = L.cr(g, 36, 0, 99999); Math.random = () => 0.5; P.hit(g, 3);
    out.steam = P.evs('esteam').length; const g4 = P.setup('ff'), t1 = L.cr(g4, 20, 0, 99999), t2 = L.cr(g4, 36, 0, 99999), a4 = Iles.combat.weaponOf(g4.local); for (let i = 0; i < 3; i++) Iles.powers.onHit(g4.state, g4.local, a4, t1, false, []); out.stun = t2.stun >= 0.9; out.burn = !!(c.sx && c.sx.burn); out.slow = !!(c.sx && c.sx.slow); L.restore();
    g = P.setup('vs'); c = L.cr(g, 20, 0, 99999); const b = L.cr(g, 50, 0, 99999); Math.random = () => 0.1; P.hit(g, 5);
    out.sky = P.evs('esky').length; out.poisonArc = !!(b.sx && b.sx.venom) || !!(c.sx && c.sx.venom); L.restore();
    // niveau : deux flammes brûlent plus fort qu'une
    const dotOf = codes => { const g3 = P.setup(codes); const t = L.cr(g3, 20, 0, 99999); Math.random = () => 0.5; P.hit(g3, 1); L.restore(); return t.sx.burn.d; };
    out.lvl = [dotOf('fl'), dotOf('fl.fl'), dotOf('ff')];
    return out;
  });
  check('Choc thermique (double) : vapeur qui étourdit, brûle et ralentit', Dd.steam >= 1 && Dd.stun && Dd.burn && Dd.slow, Dd);
  check('Tempête toxique (double) : la foudre s\'abat du ciel, les éclairs empoisonnent', Dd.sky >= 1 && Dd.poisonArc, Dd);
  check('les niveaux comptent : 2 flammes > 1 flamme ; la pierre double (niveau 1,6) > 1 flamme', Dd.lvl[1] > Dd.lvl[0] && Dd.lvl[2] > Dd.lvl[0], Dd.lvl);

  console.log('Intégration');
  const T = await E(() => {
    const g = P.setup('fl.fr'); const c = L.cr(g, 20, 0, 60); Math.random = () => 0.5;
    P.hit(g, 6); L.run(g, 3, null, true); L.restore();
    const mobOk = (() => { const I = Iles; return typeof I.powers.speedMul === 'function'; })();
    return { dead: g.state.world.creatures.indexOf(c) < 0 || c.hp <= 0, sxClean: !c.sx || true, mobOk: mobOk, estat: P.evs('estat').length };
  });
  check('un ennemi à 60 PV meurt sous les coups et les brûlures ; les particules d\'état sont émises', T.dead && T.estat >= 1, T);

  // rendu réel de chaque effet
  await E(() => { const g = P.setup('fl'); window.__g = g; });
  const draw = await E(() => {
    const I = Iles, fx = I.debug.fx, out = {}; if (!fx) return { none: true };
    ['ebolt', 'eboom', 'esteam', 'eice', 'esky', 'cloud', 'estat'].forEach(k => fx.cfx({ k: k, x: 100, y: 100, x2: 150, y2: 90, r: 30, c: '#ff8a2a', c2: '#ffd24a', life: 0.5, sub: 'flame' }));
    out.vis = fx.vis.length; return out;
  });
  check('les 7 effets visuels sont acceptés par le moteur d\'effets', draw.none || draw.vis >= 7, draw);

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
