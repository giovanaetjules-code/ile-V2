/*
 * Pouvoirs des pierres d'enchantement : les « nouvelles attaques ». Une arme enchantée déclenche, à chaque coup porté (strike() de combat.js),
 * les pouvoirs de ses pierres. Le niveau L d'un élément vaut 1 par pierre simple, 1,6 par pierre double (voir content/enchant-data.js) ;
 * deux pierres du même élément s'additionnent.
 *   Flamme : brûlure (dégâts dans le temps) ; tous les 3 coups, EXPLOSION ardente autour de la cible.
 *   Givre  : ralentit ; tous les 4 coups, la cible est GELÉE sur place et un éclat de glace ralentit son entourage.
 *   Venin  : poison cumulable (5 charges) ; un ennemi qui MEURT empoisonné libère un NUAGE toxique qui empoisonne ceux qui y entrent.
 *   Foudre : 35 % de chance par coup : ÉCLAIR EN CHAÎNE vers les ennemis proches.
 *   Choc thermique (flamme + givre, double) : tous les 3 coups, explosion de VAPEUR qui étourdit.
 *   Tempête toxique (venin + foudre, double) : les éclairs empoisonnent ; tous les 5 coups, la FOUDRE S'ABAT du ciel.
 * Tout est calculé par l'hôte (comme les capacités) ; les invités reçoivent des événements 'cfx' (k : ebolt, eboom, eice, esky, esteam, cloud, estat).
 * Les états sont sur la cible : cr.sx = { burn, venom, slow, freeze } (non sauvegardés, de courte durée).
 */
(function (I) {
  const EL = function (k) { return I.ENCH.ELEM[k]; };
  const list = function (w) { return (w.creatures || []).concat(w.mobs || []); };
  const alive = function (cr) { return cr.hp > 0; };
  function B(a) { return I.combat.baseDmg(a); }
  function counters(p) { const c = I.combat.cb(p); return c.en || (c.en = { flame: 0, frost: 0, venom: 0, shock: 0, ff: 0, vs: 0 }); }
  function sx(cr) { return cr.sx || (cr.sx = { burn: null, venom: null, slow: null, freeze: 0, acc: 0, fxT: 0 }); }
  function hurt(world, cr, d, from, kb, stun, ev, pid) {
    return (cr.mob ? I.mobs : I.creatures).damage(world, cr, Math.max(1, Math.round(d)), false, from || { x: cr.x, y: cr.y }, kb || 0, stun || 0, ev, pid);
  }
  const fx = function (ev, k, o) { ev.push(Object.assign({ type: 'cfx', k: k }, o)); };

  // ---------- états ----------
  function ignite(cr, d, dur, src) { const s = sx(cr); s.burn = { t: Math.max(dur, s.burn ? s.burn.t : 0), d: Math.max(d, s.burn ? s.burn.d : 0), src: src }; }
  function poison(cr, d, n, dur, src, max) { const s = sx(cr), v = s.venom || { t: 0, n: 0, d: d, src: src }; v.n = Math.min(max || 5, v.n + n); v.t = Math.max(v.t, dur); v.d = Math.max(v.d, d); v.src = src; s.venom = v; }
  function slow(cr, k, dur) { const s = sx(cr); s.slow = { t: Math.max(dur, s.slow ? s.slow.t : 0), k: Math.min(k, s.slow ? s.slow.k : 1) }; }
  function freeze(cr, dur) {
    sx(cr).freeze = Math.max(sx(cr).freeze, dur); cr.stun = Math.max(cr.stun || 0, dur); // ni résistance ni sursaut : gelé sur place
    if (cr.mob && cr.st === 'wind') { cr.st = 'rec'; cr.t = 0.5; cr.wt = 0.5; }
  }
  /** Facteur de vitesse dû aux états (utilisé par mobs.js et creatures.js). */
  function speedMul(cr) { const s = cr.sx; return s && s.slow && s.slow.t > 0 ? s.slow.k : 1; }

  const near = function (w, x, y, r, skip) { return list(w).filter(function (c) { return c !== skip && alive(c) && Math.hypot(c.x - x, (c.y - 5) - (y - 5)) <= r + (c.hw || 3); }); };

  // ---------- pouvoirs ----------
  function explode(state, p, a, cr, o, ev) {
    const w = state.world, E = EL(o.el);
    fx(ev, o.k, { x: cr.x, y: cr.y - 5, r: o.r, c: E.col, life: o.life || 0.6, c2: E.col2 });
    ev.push({ type: 'shake', a: o.shake || 3 });
    near(w, cr.x, cr.y, o.r, null).forEach(function (t) {
      const dead = hurt(w, t, B(a) * o.mult, { x: cr.x, y: cr.y }, o.kb || 90, o.stun || 0, ev, p.id);
      if (!dead && o.then) o.then(t);
      else if (dead) died(state, p, a, t, ev);
    });
  }
  function chain(state, p, a, cr, L, poisonous, ev) {
    const w = state.world, n = 2 + Math.ceil(L), hit = [cr]; let from = cr;
    for (let i = 0; i < n; i++) {
      let best = null, bd = 82;
      list(w).forEach(function (t) { if (hit.indexOf(t) >= 0 || !alive(t)) return; const d = Math.hypot(t.x - from.x, t.y - from.y); if (d < bd) { bd = d; best = t; } });
      if (!best) break;
      fx(ev, 'ebolt', { x: from.x, y: from.y - 8, x2: best.x, y2: best.y - 8, c: EL('shock').col, c2: '#ffffff', life: 0.32 });
      const dead = hurt(w, best, B(a) * 0.55 * Math.sqrt(L), { x: from.x, y: from.y }, 30, 0.3, ev, p.id);
      if (dead) died(state, p, a, best, ev); else if (poisonous) poison(best, B(a) * 0.1, 2, 5, p.id, 6);
      hit.push(best); from = best;
    }
    return hit.length - 1;
  }
  function toxicCloud(state, cr, src, L, ev) {
    const w = state.world; (w.clouds || (w.clouds = [])).push({ x: cr.x, y: cr.y, r: 38 + 6 * L, t: 4, src: src, d: 0, L: L, tick: 0 });
    fx(ev, 'cloud', { x: cr.x, y: cr.y - 4, r: 38 + 6 * L, c: EL('venom').col, c2: EL('venom').col2, life: 4 });
  }
  /** Un ennemi vient de mourir : mort empoisonnée = nuage toxique. */
  function died(state, p, a, cr, ev) {
    const s = cr.sx; if (!s || !s.venom || s.venom.t <= 0 || cr.cloud) return; cr.cloud = 1;
    const L = a && a.ench ? a.ench.els.venom || 1 : 1; toxicCloud(state, cr, s.venom.src, L, ev);
  }

  /** Appelé par combat.strike après chaque coup porté. dead : la cible est morte de ce coup. */
  function onHit(state, p, a, cr, dead, ev) {
    const e = a.ench; if (!e) return;
    const w = state.world, n = counters(p), b = B(a), el = e.els, src = p.id;
    if (dead) { died(state, p, a, cr, ev); }
    if (el.venom && !dead) poison(cr, b * 0.1 * el.venom, 1 + (el.venom >= 2 ? 1 : 0), 5, src, 4 + Math.ceil(el.venom));
    if (el.flame && !dead) ignite(cr, b * 0.2 * el.flame, 3 + el.flame, src);
    if (el.frost && !dead) slow(cr, Math.max(0.3, 0.62 - 0.12 * (el.frost - 1)), 2.5 + el.frost);
    if (el.flame) {
      n.flame++;
      if (n.flame % 3 === 0) explode(state, p, a, cr, { el: 'flame', k: 'eboom', r: 30 + 8 * el.flame, mult: 0.7 + 0.3 * el.flame, kb: 90, shake: 3, then: function (t) { ignite(t, b * 0.2 * el.flame, 3 + el.flame, src); } }, ev);
    }
    if (el.frost) {
      n.frost++;
      if (n.frost % 4 === 0 && alive(cr)) {
        freeze(cr, 1.4 + 0.3 * el.frost);
        fx(ev, 'eice', { x: cr.x, y: cr.y - 5, r: 28 + 6 * el.frost, c: EL('frost').col, c2: EL('frost').col2, life: 0.7 });
        near(w, cr.x, cr.y, 28 + 6 * el.frost, cr).forEach(function (t) { slow(t, 0.45, 3); });
      }
    }
    if (el.shock && Math.random() < 0.35 + 0.1 * el.shock) chain(state, p, a, cr, el.shock, !!e.dd.vs, ev);
    else if (e.dd.vs && el.shock) { /* la tempête toxique n'agit que par les éclairs et le coup du ciel */ }
    if (e.dd.ff) {
      n.ff++;
      if (n.ff % 3 === 0) explode(state, p, a, cr, { el: 'flame', k: 'esteam', r: 44, mult: 1.5, kb: 120, stun: 1.0, shake: 4, life: 0.8, then: function (t) { ignite(t, b * 0.2, 3, src); slow(t, 0.5, 3); } }, ev);
    }
    if (e.dd.vs) {
      n.vs++;
      if (n.vs % 5 === 0) {
        fx(ev, 'esky', { x: cr.x, y: cr.y - 2, r: 34, c: EL('shock').col, c2: EL('venom').col, life: 0.7 });
        explode(state, p, a, cr, { el: 'shock', k: 'eboom', r: 34, mult: 2.2, kb: 100, stun: 0.6, shake: 5, life: 0.5, then: function (t) { poison(t, b * 0.12, 3, 6, src, 6); } }, ev);
      }
    }
  }

  // ---------- états : dégâts dans le temps, nuages, particules ----------
  function tick(state, dt, ev) {
    const w = state.world;
    const all = list(w);
    for (const cr of all) {
      const s = cr.sx; if (!s) continue;
      if (!alive(cr)) { continue; }
      s.acc += dt; s.fxT -= dt;
      if (s.slow && (s.slow.t -= dt) <= 0) s.slow = null;
      if (s.freeze > 0) s.freeze -= dt;
      if (s.burn && (s.burn.t -= dt) <= 0) s.burn = null;
      if (s.venom && (s.venom.t -= dt) <= 0) s.venom = null;
      if (s.acc >= 0.5) {
        s.acc -= 0.5;
        const src = (s.burn && s.burn.src) || (s.venom && s.venom.src);
        if (s.burn && hurt(w, cr, s.burn.d, null, 0, 0, ev, s.burn.src)) { poisonDeath(state, cr, ev); continue; }
        if (s.venom && alive(cr) && hurt(w, cr, s.venom.d * s.venom.n * 0.6, null, 0, 0, ev, s.venom.src)) { poisonDeath(state, cr, ev); continue; }
      }
      if (s.fxT <= 0 && (s.burn || s.venom || s.slow || s.freeze > 0)) {
        s.fxT = 0.35;
        if (s.burn) fx(ev, 'estat', { x: cr.x, y: cr.y - 8, c: EL('flame').col, c2: EL('flame').col2, sub: 'flame', life: 0.2 });
        if (s.venom) fx(ev, 'estat', { x: cr.x, y: cr.y - 8, c: EL('venom').col, c2: EL('venom').col2, sub: 'venom', life: 0.2 });
        if (s.freeze > 0 || s.slow) fx(ev, 'estat', { x: cr.x, y: cr.y - 8, c: EL('frost').col, c2: EL('frost').col2, sub: s.freeze > 0 ? 'ice' : 'frost', life: 0.2 });
      }
      if (!s.burn && !s.venom && !s.slow && s.freeze <= 0) cr.sx = null;
    }
    // nuages toxiques
    const cl = w.clouds;
    if (cl && cl.length) for (let i = cl.length - 1; i >= 0; i--) {
      const c = cl[i]; c.t -= dt; c.tick -= dt;
      if (c.t <= 0) { cl.splice(i, 1); continue; }
      if (c.tick <= 0) { c.tick = 0.5; near(w, c.x, c.y, c.r, null).forEach(function (t) { if (!t.cloud) poison(t, 2 + c.L, 1, 4, c.src, 5); }); }
    }
  }
  function poisonDeath(state, cr, ev) { if (cr.sx && cr.sx.venom) { const L = 1; toxicCloud(state, cr, cr.sx.venom.src, L, ev); cr.cloud = 1; } }

  I.powers = { onHit: onHit, tick: tick, speedMul: speedMul, died: died };
})((window.Iles = window.Iles || {}));
