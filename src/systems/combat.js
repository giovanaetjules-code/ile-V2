/*
 * Combat (hôte / solo ; les invités n'envoient que leurs intentions, les effets visuels voyagent par événements `cfx`).
 *   attack(state, p, aim, ev)       : coup de base, combo de 3 (le 3e est plus large, plus fort, avec recul)
 *   tick(state, p, it, dt, ev)      : recharges, effets programmés, capacités R / F / V (it.ab = 1..3), élan (p.lunge)
 *   step(state, dt, ev)             : projectiles (world.proj)
 * Une capacité = une fonction ABILITY[modèle][indice](ctx) ; elle utilise strike() (zone), proj() (projectile), later() (effet différé),
 * lunge() (élan), fx() (effet visuel). Dégâts = BASE + dégâts de l'arme forgée × SCALE, × multiplicateur de la capacité.
 */
(function (I) {
  const C = I.COMBAT, TS = I.config.TILE;
  const DIRVEC = function () { return I.harvest.DIRVEC; };

  function cb(p) { return p.cb || (p.cb = { cd: [0, 0, 0], combo: 0, comboT: 0, busy: 0, q: [], frenzy: 0, rage: 0, back: 0, spin: 0, hint: 0 }); }
  function weaponOf(p) { const s = p.inv.slots[p.sel]; return s && typeof s.id === 'string' && s.id.indexOf('wp:') === 0 ? I.forge.weapon(s.id) : null; }

  /** Couleur des effets : celle de la partie principale de l'arme (couleur teintée ou couleur naturelle du matériau), un peu éclaircie. */
  function colorOf(a) {
    const pc = a.pieces[2];
    let rgb = pc.c ? I.COLORS[pc.c - 1].rgb : [parseInt(pc.m.hex.slice(1, 3), 16), parseInt(pc.m.hex.slice(3, 5), 16), parseInt(pc.m.hex.slice(5, 7), 16)];
    rgb = rgb.map(function (v) { return Math.round(v + (255 - v) * 0.25); });
    return '#' + rgb.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  function aimOf(p, aim) {
    let vx, vy;
    if (aim) { vx = aim.x - p.x; vy = aim.y - (p.y - 8); const l = Math.hypot(vx, vy); if (l < 3) { const f = DIRVEC()[p.dir]; vx = f[0]; vy = f[1]; } else { vx /= l; vy /= l; } }
    else { const f = DIRVEC()[p.dir]; vx = f[0]; vy = f[1]; }
    return [vx, vy];
  }
  function later(p, delay, fn) { cb(p).q.push({ t: delay, fn: fn }); }

  // ---------- dégâts ----------
  function dmgOf(p, a, mult) {
    const c = cb(p);
    let d = (C.HIT_BASE + a.stats.dmg * C.HIT_SCALE) * mult * (c.rage > 0 ? 1.3 : 1) * (0.92 + Math.random() * 0.16);
    const crit = c.back > 0 || Math.random() < (c.frenzy > 0 ? 0.35 : 0.12);
    if (crit) d *= 1.8;
    return { d: Math.max(1, Math.round(d)), crit: crit };
  }

  const inShape = function (sh, cr) {
    const rad = (cr.hw || 3) + 3, cy = cr.y - 5, dx = cr.x - sh.x, dy = cy - sh.y;
    if (sh.t === 'c') return dx * dx + dy * dy <= (sh.r + rad) * (sh.r + rad);
    if (sh.t === 'cone') {
      const d = Math.hypot(dx, dy); if (d > sh.r + rad) return false; if (d < rad + 5) return true;
      let da = Math.atan2(dy, dx) - sh.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) <= sh.arc / 2 + Math.atan2(rad, d);
    }
    const vx = sh.x2 - sh.x, vy = sh.y2 - sh.y, l2 = vx * vx + vy * vy || 1; // capsule
    const t = Math.max(0, Math.min(1, (dx * vx + dy * vy) / l2)), qx = sh.x + vx * t - cr.x, qy = sh.y + vy * t - cy;
    return qx * qx + qy * qy <= (sh.w + rad) * (sh.w + rad);
  };

  /** Frappe toutes les créatures dans la zone `sh` (une fois chacune par ensemble o.set). Renvoie le nombre de touchées. */
  function strike(state, p, a, sh, mult, o, ev) {
    const world = state.world, list = (world.creatures || []).concat(world.mobs || []); // animaux et monstres
    if (!list.length) return 0;
    let n = 0;
    for (const cr of list) {
      if (o.set && o.set.has(cr.id)) continue;
      if (!inShape(sh, cr)) continue;
      if (o.set) o.set.add(cr.id);
      const r = dmgOf(p, a, mult);
      const dead = (cr.mob ? I.mobs : I.creatures).damage(world, cr, r.d, r.crit, { x: o.fx !== undefined ? o.fx : p.x, y: o.fy !== undefined ? o.fy : p.y }, o.kb, o.stun, ev, p.id);
      if (a.ench) I.powers.onHit(state, p, a, cr, dead, ev); // pouvoirs des pierres d'enchantement (systems/powers.js)
      n++;
    }
    if (n) {
      const c = cb(p); c.back = 0;
      if (o.shake) ev.push({ type: 'shake', a: o.shake });
    }
    return n;
  }

  const fx = function (ev, k, o) { ev.push(Object.assign({ type: 'cfx', k: k }, o)); };

  // ---------- projectiles ----------
  function proj(state, p, a, o, ev) {
    const world = state.world;
    (world.proj || (world.proj = [])).push({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, life: o.life, r: o.r, grow: o.grow || 0, mult: o.mult, kb: o.kb, stun: o.stun || 0, pierce: o.pierce, hit: new Set(), p: p, a: a, shake: o.shake || 0 });
    fx(ev, 'proj', { sub: o.sub, x: o.x, y: o.y, vx: o.vx, vy: o.vy, life: o.life, r: o.r, c: colorOf(a) });
  }
  function step(state, dt, ev) {
    const world = state.world, list = world.proj;
    if (!list || !list.length) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i];
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.grow * dt;
      if (q.life <= 0) { list.splice(i, 1); continue; }
      const n = strike(state, q.p, q.a, { t: 'c', x: q.x, y: q.y, r: q.r }, q.mult, { set: q.hit, kb: q.kb, stun: q.stun, fx: q.x - q.vx * 0.05, fy: q.y - q.vy * 0.05, shake: q.shake }, ev);
      if (n && (q.pierce -= n) <= 0) { fx(ev, 'burst', { x: q.x, y: q.y, c: colorOf(q.a), r: q.r }); list.splice(i, 1); }
    }
  }

  // ---------- élan ----------
  function lunge(state, p, a, vx, vy, dist, time, mult, o, ev) {
    p.lunge = { t: time, vx: vx * dist / time, vy: vy * dist / time };
    const set = new Set(), n = Math.max(2, Math.round(time / 0.04));
    for (let i = 0; i < n; i++) later(p, i * 0.04, function (st, e) { strike(st, p, a, { t: 'c', x: p.x, y: p.y - 6, r: o.r || 15 }, mult, { set: set, kb: o.kb, stun: o.stun, shake: o.shake, fx: p.x - vx * 6, fy: p.y - vy * 6 }, e); });
    fx(ev, 'trail', { x: p.x, y: p.y - 6, x2: p.x + vx * dist, y2: p.y - 6 + vy * dist, c: colorOf(a), life: 0.35 });
  }

  // ---------- coup de base : combo de 3 ----------
  function attack(state, p, aim, ev) {
    const a = weaponOf(p);
    if (!a) return false;
    const c = cb(p), M = C.MODEL[a.model];
    if (p.swing || p.useCd > 0 || c.busy > 0) return true;
    const v = aimOf(p, aim);
    p.dir = I.harvest.dirName(v[0], v[1]);
    c.combo = c.comboT > 0 ? (c.combo + 1) % 3 : 0;
    const fin = c.combo === 2, dur = Math.max(0.1, C.SWING / a.stats.spd / (c.frenzy > 0 ? 1.9 : 1));
    c.comboT = dur + 0.6;
    p.swing = { t: 0, dur: dur, dir: p.dir, vx: v[0], vy: v[1], item: p.inv.slots[p.sel].id, tool: 'weapon', power: 0, tier: 0, hit: true };
    const ang = Math.atan2(v[1], v[0]), arc = M.arc * (fin ? 1.3 : 1), reach = M.reach + (fin ? 8 : 0), col = colorOf(a);
    fx(ev, 'slash', { x: p.x, y: p.y - 8, a: ang, r: reach, arc: arc, c: col, life: 0.2 + dur * 0.3, big: fin });
    later(p, dur * 0.4, function (st, e) {
      const x = p.x, y = p.y - 8;
      strike(st, p, a, { t: 'cone', x: x, y: y, a: ang, arc: arc, r: reach }, fin ? 1.7 : c.combo === 1 ? 1.1 : 1, { kb: M.kb * (fin ? 1.6 : 1), stun: fin ? (M.stun || 0) : 0, shake: fin ? 2 : 0 }, e);
    });
    return true;
  }

  // ---------- capacités ----------
  const SIN = function (a) { return [Math.cos(a), Math.sin(a)]; };
  const ABILITY = {
    sword: [
      function (x) { // Taillade tournoyante
        fx(x.ev, 'spin', { x: x.p.x, y: x.p.y - 8, r: 38, c: x.col, life: 0.4 });
        [[0.1, 25], [0.28, 100]].forEach(function (w) { later(x.p, w[0], function (st, e) { strike(st, x.p, x.a, { t: 'c', x: x.p.x, y: x.p.y - 8, r: 38 }, 1.1, { kb: w[1], shake: 1 }, e); }); }); // le 1er balayage repousse à peine : le 2e touche aussi
        return 0.45;
      },
      function (x) { lunge(x.st, x.p, x.a, x.v[0], x.v[1], 76, 0.2, 1.9, { kb: 120, r: 15, shake: 2 }, x.ev); return 0.3; }, // Estoc éclair
      function (x) { // Onde de lame
        proj(x.st, x.p, x.a, { sub: 'wave', x: x.p.x + x.v[0] * 12, y: x.p.y - 8 + x.v[1] * 12, vx: x.v[0] * 290, vy: x.v[1] * 290, life: 0.72, r: 12, grow: 12, mult: 2.8, kb: 130, pierce: 99, shake: 1 }, x.ev);
        fx(x.ev, 'slash', { x: x.p.x, y: x.p.y - 8, a: Math.atan2(x.v[1], x.v[0]), r: 34, arc: 2.4, c: x.col, life: 0.3, big: true });
        return 0.4;
      },
    ],
    dagger: [
      function (x) { // Pas d'ombre
        lunge(x.st, x.p, x.a, x.v[0], x.v[1], 72, 0.1, 1.3, { kb: 50, r: 14 }, x.ev);
        later(x.p, 0.13, function (st, e) { cb(x.p).back = 3; e.push({ type: 'msg', pid: x.p.id, text: 'Prochain coup : critique garanti !' }); }); // après l'élan : le bond lui-même ne le consomme pas
        return 0.2;
      },
      function (x) { // Pluie de lames
        for (let i = -2; i <= 2; i++) { const d = SIN(Math.atan2(x.v[1], x.v[0]) + i * 0.24); proj(x.st, x.p, x.a, { sub: 'knife', x: x.p.x + d[0] * 8, y: x.p.y - 8 + d[1] * 8, vx: d[0] * 340, vy: d[1] * 340, life: 0.46, r: 6, mult: 0.95, kb: 35, pierce: 1 }, x.ev); }
        return 0.3;
      },
      function (x) { // Frénésie
        cb(x.p).frenzy = 5; fx(x.ev, 'aura', { x: x.p.x, y: x.p.y - 8, r: 30, c: x.col, life: 0.6 });
        x.ev.push({ type: 'msg', pid: x.p.id, text: 'Frénésie !' });
        return 0.25;
      },
    ],
    spear: [
      function (x) { // Fente
        const a0 = Math.atan2(x.v[1], x.v[0]);
        fx(x.ev, 'thrust', { x: x.p.x, y: x.p.y - 8, a: a0, r: 90, c: x.col, life: 0.3 });
        later(x.p, 0.12, function (st, e) { p_lunge(st, x); strike(st, x.p, x.a, { t: 'cap', x: x.p.x, y: x.p.y - 8, x2: x.p.x + x.v[0] * 90, y2: x.p.y - 8 + x.v[1] * 90, w: 8 }, 2.3, { kb: 150, shake: 2 }, e); });
        return 0.4;
      },
      function (x) { // Javelot
        proj(x.st, x.p, x.a, { sub: 'jav', x: x.p.x + x.v[0] * 10, y: x.p.y - 8 + x.v[1] * 10, vx: x.v[0] * 370, vy: x.v[1] * 370, life: 0.62, r: 7, mult: 2.5, kb: 110, pierce: 3, shake: 1 }, x.ev);
        return 0.35;
      },
      function (x) { // Forêt de piques
        const set = new Set(); // une créature n'est touchée qu'une fois par lancer
        for (let i = 0; i < 6; i++) later(x.p, 0.08 + i * 0.1, function (st, e) {
          const sx = x.p.x + x.v[0] * (24 + i * 17), sy = x.p.y - 2 + x.v[1] * (24 + i * 17);
          fx(e, 'spike', { x: sx, y: sy, c: x.col, life: 0.5 });
          later(x.p, 0.06, function (st2, e2) { strike(st2, x.p, x.a, { t: 'c', x: sx, y: sy - 4, r: 15 }, 1.9, { set: set, kb: 60, stun: 0.8, fx: x.p.x, fy: x.p.y }, e2); });
        });
        return 0.8;
      },
    ],
    axe: [
      function (x) { // Fendoir
        const a0 = Math.atan2(x.v[1], x.v[0]);
        fx(x.ev, 'charge', { x: x.p.x, y: x.p.y - 8, r: 34, c: x.col, life: 0.3 });
        later(x.p, 0.3, function (st, e) {
          fx(e, 'slash', { x: x.p.x, y: x.p.y - 8, a: a0, r: 46, arc: 2.1, c: x.col, life: 0.3, big: true });
          strike(st, x.p, x.a, { t: 'cone', x: x.p.x, y: x.p.y - 8, a: a0, arc: 2.1, r: 46 }, 3.2, { kb: 175, stun: 0.4, shake: 3 }, e);
        });
        return 0.55;
      },
      function (x) { // Cri de guerre
        const c = cb(x.p); c.rage = 5;
        fx(x.ev, 'ring', { x: x.p.x, y: x.p.y - 6, r: 64, c: x.col, life: 0.45 }); fx(x.ev, 'ring', { x: x.p.x, y: x.p.y - 6, r: 44, c: '#ffffff', life: 0.3 });
        strike(x.st, x.p, x.a, { t: 'c', x: x.p.x, y: x.p.y - 8, r: 64 }, 0.7, { kb: 160, shake: 3 }, x.ev);
        x.ev.push({ type: 'msg', pid: x.p.id, text: 'Cri de guerre ! +30 % de dégâts' });
        return 0.3;
      },
      function (x) { // Tourbillon sanglant
        const c = cb(x.p); c.spin = 1.6;
        for (let i = 0; i < 8; i++) later(x.p, 0.05 + i * 0.2, function (st, e) {
          fx(e, 'spin', { x: x.p.x, y: x.p.y - 8, r: 36, c: x.col, life: 0.25 });
          strike(st, x.p, x.a, { t: 'c', x: x.p.x, y: x.p.y - 8, r: 36 }, 0.9, { kb: 70, shake: 1 }, e);
        });
        return 1.6;
      },
    ],
    mace: [
      function (x) { // Séisme
        fx(x.ev, 'charge', { x: x.p.x, y: x.p.y - 8, r: 30, c: x.col, life: 0.25 });
        later(x.p, 0.25, function (st, e) {
          const sx = x.p.x + x.v[0] * 24, sy = x.p.y + x.v[1] * 24;
          fx(e, 'ring', { x: sx, y: sy, r: 44, c: x.col, life: 0.4 }); fx(e, 'crack', { x: sx, y: sy, c: x.col, life: 0.6 });
          strike(st, x.p, x.a, { t: 'c', x: sx, y: sy - 4, r: 44 }, 2.2, { kb: 100, stun: 1.3, shake: 4, fx: sx, fy: sy }, e);
        });
        return 0.5;
      },
      function (x) { lunge(x.st, x.p, x.a, x.v[0], x.v[1], 96, 0.26, 1.5, { kb: 230, stun: 0.6, r: 17, shake: 2 }, x.ev); return 0.35; }, // Charge
      function (x) { // Onde de choc
        [[0, 42], [0.3, 68], [0.6, 94]].forEach(function (w) {
          later(x.p, w[0], function (st, e) {
            fx(e, 'ring', { x: x.p.x, y: x.p.y - 4, r: w[1], c: x.col, life: 0.4 });
            strike(st, x.p, x.a, { t: 'c', x: x.p.x, y: x.p.y - 6, r: w[1] }, 1.3, { kb: 110, stun: 1, shake: 3, set: new Set() }, e);
          });
        });
        return 0.9;
      },
    ],
  };
  function p_lunge(st, x) { x.p.lunge = { t: 0.08, vx: x.v[0] * 280, vy: x.v[1] * 280 }; }

  function tryAbility(state, p, it, ev) {
    const c = cb(p), a = weaponOf(p), i = it.ab - 1;
    if (!(i >= 0 && i < 3)) return;
    if (!a) { if (c.hint <= 0) { c.hint = 4; ev.push({ type: 'msg', pid: p.id, text: 'Équipe une arme forgée pour utiliser les capacités (R, F, V).' }); } return; }
    if (c.cd[i] > 0 || c.busy > 0 || p.dashT > 0 || p.sw > 0.5) return;
    const v = aimOf(p, it.aim), ab = C.AB[a.model][i];
    p.dir = I.harvest.dirName(v[0], v[1]); p.swing = null;
    const busy = ABILITY[a.model][i]({ st: state, p: p, a: a, v: v, ev: ev, col: colorOf(a) });
    c.cd[i] = ab.cd; c.busy = busy;
    ev.push({ type: 'cast', pid: p.id, model: a.model, i: i });
  }

  /** Chaque pas, pour chaque joueur : recharges, effets programmés, capacité demandée. */
  function tick(state, p, it, dt, ev) {
    const c = cb(p);
    for (let i = 0; i < 3; i++) if (c.cd[i] > 0) c.cd[i] = Math.max(0, c.cd[i] - dt);
    c.comboT -= dt; c.busy = Math.max(0, c.busy - dt); c.hint = Math.max(0, c.hint - dt);
    c.frenzy = Math.max(0, c.frenzy - dt); c.rage = Math.max(0, c.rage - dt); c.back = Math.max(0, c.back - dt); c.spin = Math.max(0, c.spin - dt);
    if (p.sw > 0.5) { c.q.length = 0; p.lunge = null; c.spin = 0; }
    if (p.lunge) { p.lunge.t -= dt; if (p.lunge.t <= 0) p.lunge = null; }
    for (let i = c.q.length - 1; i >= 0; i--) {
      const q = c.q[i]; q.t -= dt;
      if (q.t <= 0) { c.q.splice(i, 1); q.fn(state, ev); }
    }
    if (it.ab) tryAbility(state, p, it, ev);
  }

  /** Multiplicateur de vitesse de déplacement dû aux capacités (frénésie, tourbillon). */
  function speedMul(p) { const c = p.cb; return !c ? 1 : (c.frenzy > 0 ? 1.25 : 1) * (c.spin > 0 ? 0.7 : 1); }

  /** Dégât de base d'un coup de cette arme (avant multiplicateurs). */
  function baseDmg(a) { return C.HIT_BASE + a.stats.dmg * C.HIT_SCALE; }
  I.combat = { baseDmg: baseDmg, attack: attack, tick: tick, step: step, speedMul: speedMul, weaponOf: weaponOf, colorOf: colorOf, cb: cb, ABILITY: ABILITY };
})((window.Iles = window.Iles || {}));
