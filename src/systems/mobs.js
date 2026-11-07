/*
 * Monstres hostiles des dimensions (voir content/mob-gen.js pour les espèces). Seul l'hôte (ou le solo) simule ; les invités reçoivent
 * les positions et l'état d'attaque (pack / unpack). Rien n'est sauvegardé : un morceau déchargé puis rechargé réapparaît avec ses nids.
 * Ils vivent dans `world.mobs` ; leurs projectiles dans `world.mproj` (mondes infinis uniquement : ni l'île, ni le lobby).
 *
 * Machine à états : idle (rôde) -> chase (poursuit) -> wind (PRÉPARATION visible : on peut esquiver) -> act (charge) -> rec (souffle, vulnérable).
 * Six archétypes : stalker (mord), charger (charge en ligne), spitter (crache de loin), brute (frappe le sol), swarmer (meute), bomber (explose).
 * Le DÉPLACEMENT RAPIDE (dash, Espace) rend invulnérable : c'est la façon d'esquiver. Danger croissant avec la distance au point d'arrivée.
 */
(function (I) {
  const R = I.rng, TS = I.config.TILE, T = I.TILE, CS = 32, ACT = 480, MAX = 90, SAFE = 230, P_NEST = 0.42;
  const ST = { idle: 0, chase: 0, wind: 1, act: 2, rec: 3 };
  const STN = ['chase', 'wind', 'act', 'rec'];

  const landTile = function (t) { return I.WALKABLE[t] && t !== T.WALL; };
  const onLand = function (world, x, y) { return landTile(world.tileAt(Math.floor(x / TS), Math.floor((y - 1) / TS))); };
  const boxOf = function (S) { return { hw: [3, 4, 6, 8][S.size], hh: 2 }; };
  const rgbCss = function (c) { return 'rgb(' + c.map(Math.round).join(',') + ')'; };
  const r1 = function (v) { return Math.round(v * 10) / 10; };

  // ---------- apparition : des nids déterministes par morceau ----------
  function spawnNest(world, c, key, h, out, pts) {
    const D = world.D, sd = D.seed, cx = c.cx, cy = c.cy, sp = world.spawn;
    if (R.hash2(cx * 11 + h, cy * 5, sd + 1900) >= (h ? P_NEST * 0.25 : P_NEST)) return;
    for (let t = 0; t < 8; t++) {
      const tx = cx * CS + 2 + Math.floor(R.hash2(cx * 13 + t, cy * 17 + h, sd + 1901) * (CS - 4)), ty = cy * CS + 2 + Math.floor(R.hash2(cx * 19 + t, cy * 23 + h, sd + 1902) * (CS - 4));
      if (!landTile(world.tileAt(tx, ty)) || world.objectsIn(tx * TS - 2, ty * TS - 2, tx * TS + 34, ty * TS + 34).length > 3) continue;
      const nx = tx * TS + 8, ny = ty * TS + 8, dist = Math.hypot(nx - sp.x, ny - sp.y);
      if (dist < SAFE) return; // l'arrivée reste sûre
      for (const p of pts) if (Math.hypot(p.x - nx, p.y - ny) < 150) return; // jamais sous le nez du joueur
      const si = Math.floor(R.hash2(cx * 29 + h, cy * 31 + t, sd + 1903) * I.mobGen.count(D)), S = I.mobGen.species(D, si), A = I.mobGen.ARCH[S.arch];
      const tier = I.mobGen.tier(dist), mul = I.mobGen.mult(tier), n = A.pack[0] + Math.floor(R.hash2(cx * 37 + h, cy * 41, sd + 1904) * (A.pack[1] - A.pack[0] + 1));
      const eliteIdx = S.arch !== 'swarmer' && R.hash2(cx * 43 + h, cy * 47, sd + 1905) < 0.1 + tier * 0.035 ? 0 : -1, b = boxOf(S);
      for (let m = 0; m < n; m++) for (let tr = 0; tr < 6; tr++) {
        const a = R.hash2(cx * 53 + m, cy * 59 + tr, sd + 1906) * 6.2832, r = 6 + Math.sqrt(R.hash2(cx * 61 + m, cy * 67 + tr, sd + 1907)) * (12 + n * 3);
        const e = { x: nx + Math.cos(a) * r, y: ny + Math.sin(a) * r, hw: b.hw, hh: b.hh };
        if (!onLand(world, e.x, e.y) || I.collision.isBlocked(world, e)) continue;
        const elite = m === eliteIdx, mhp = Math.round(S.hp * mul * (elite ? 2.4 : 1) * (0.9 + R.hash2(m, cx + h, sd + 1908) * 0.2));
        out.push({ id: 'm' + cx + '_' + cy + '_' + h + '_' + m, mob: 1, sp: si, v: m & 3, x: e.x, y: e.y, hw: b.hw, hh: b.hh, left: R.hash2(m, cx, sd) < 0.5, moving: false, frame: 0, at: 0,
          hp: mhp, mhp: mhp, hpp: 100, tier: tier, elite: elite, home: { x: nx, y: ny, key: key }, st: 'idle', t: 0, wt: 1, cd: 0.5 + R.hash2(m, cy, sd) * 1.5, ang: 0, tx: 0, ty: 0, wait: R.hash2(m, cy, sd + 1909) * 3,
          stuck: 0, kx: 0, ky: 0, stun: 0, aggro: 0, sg: R.hash2(m, cx, sd + 1910) < 0.5 ? 1 : -1, hit: false, ph: R.hash2(m, cx + cy, sd) * 6, mul: mul });
        break;
      }
      return;
    }
  }

  /** Fait apparaître les nids des morceaux nouvellement chargés, retire les monstres des morceaux déchargés. */
  function sync(world, pts) {
    const list = world.mobs;
    if (list.length) { let w = 0; for (let i = 0; i < list.length; i++) if (world.chunks.has(list[i].home.key)) list[w++] = list[i]; list.length = w; }
    for (const [key, c] of world.chunks) {
      if (c.nests) continue;
      c.nests = true;
      for (let h = 0; h < 2 && list.length < MAX; h++) spawnNest(world, c, key, h, list, pts);
    }
  }

  // ---------- dégâts subis par le joueur ----------
  /** Un monstre frappe le joueur p. Renvoie true si le coup a porté (esquive : invulnérable pendant le dash et juste après un coup). */
  function hurtPlayer(state, p, dmg, fx, fy, kb, elem, ev) {
    if (p.invul > 0 || p.dashT > 0 || p.away) return false;
    dmg = Math.max(1, Math.round(dmg * (1 - I.armor.reduction(p))));
    p.hp -= dmg; p.invul = 0.5;
    const a = Math.atan2(p.y - fy, p.x - fx);
    if (kb > 0) { p.lunge = { t: 0.14, vx: Math.cos(a) * kb, vy: Math.sin(a) * kb }; p.swing = null; p.dashT = 0; }
    const E = I.mobGen.ELEM[elem];
    if (E && elem !== 'none') {
      const st = p.st || (p.st = { poison: 0, burn: 0, slow: 0, stun: 0 });
      if (elem === 'venom') st.poison = Math.max(st.poison, E.dur); else if (elem === 'flame') st.burn = Math.max(st.burn, E.dur);
      else if (elem === 'frost') st.slow = Math.max(st.slow, E.dur); else if (elem === 'shock') st.stun = Math.max(st.stun, E.dur);
    }
    ev.push({ type: 'hurt', pid: p.id, dmg: dmg, x: p.x, y: p.y - 12, el: elem });
    if (p.hp <= 0) faint(state, p, ev);
    return true;
  }

  /** Vie à 0 : le joueur se réveille au point d'arrivée de la dimension, sans rien perdre sauf un peu de faim. */
  function faint(state, p, ev) {
    const w = state.world, base = w.spawn, OFF = [[0, 0], [14, 0], [-14, 0], [28, 0], [-28, 0]];
    for (let r = 0; r < 4; r++) for (const o of OFF) { p.x = base.x + o[0]; p.y = base.y + r * 12; if (!I.collision.isBlocked(w, p) && w.isWalkable(Math.floor(p.x / TS), Math.floor((p.y - 1) / TS))) { r = 9; break; } }
    p.hp = I.vitals.MAXHP * 0.5; p.hun = Math.max(15, p.hun - 10); p.invul = 3; p.st = { poison: 0, burn: 0, slow: 0, stun: 0 };
    p.swing = null; p.dashT = 0; p.lunge = null; p.target = null;
    for (const m of w.mobs || []) { m.aggro = 0; if (m.st !== 'idle') { m.st = 'idle'; m.t = 0; } }
    if (w.mproj) w.mproj.length = 0;
    ev.push({ type: 'faint', pid: p.id, x: p.x, y: p.y });
    ev.push({ type: 'msg', pid: p.id, text: 'Tu t’es évanoui… Tu te réveilles au point d’arrivée.' });
  }

  // ---------- dégâts subis par le monstre ----------
  function damage(world, m, amount, crit, from, kb, stun, ev, pid) {
    const S = I.mobGen.species(world.D, m.sp), resist = (S.arch === 'brute' ? 0.3 : S.plan === 'golem' ? 0.5 : 1) * (m.elite ? 0.6 : 1);
    m.hp -= amount; m.hpp = Math.max(0, Math.round(100 * m.hp / m.mhp)); m.aggro = Math.max(m.aggro, 6);
    const a = Math.atan2(m.y - from.y, m.x - from.x);
    m.kx = Math.cos(a) * (kb || 0) * resist; m.ky = Math.sin(a) * (kb || 0) * 0.8 * resist;
    const sres = (S.arch === 'brute' ? 0.4 : 1) * (m.elite ? 0.5 : 1), sv = (stun || 0) * sres;
    if (sv > 0) { m.stun = Math.max(m.stun, sv); if (m.st === 'wind' && S.arch !== 'bomber' && sv >= 0.3) { m.st = 'rec'; m.t = 0.5; m.wt = 0.5; } } // un coup étourdissant interrompt la préparation
    const col = rgbCss(S.col.glow);
    ev.push({ type: 'cHit', id: m.id, x: m.x, y: m.y - 8, dmg: amount, crit: !!crit, pid: pid, c: col });
    if (m.hp > 0) return false;
    kill(world, m, S, ev, pid, true);
    return true;
  }

  function kill(world, m, S, ev, pid, drops) {
    const list = world.mobs, i = list.indexOf(m); if (i >= 0) list.splice(i, 1);
    if (drops) for (const l of I.mobGen.loot(S, m.elite, Math.random)) for (let k = 0; k < l.qty; k++) world.spawnDrop(l.item, 1, m.x, m.y - 3, true).z = 6;
    ev.push({ type: 'cDie', id: m.id, x: m.x, y: m.y - 5, size: Math.min(3, S.size + (m.elite ? 1 : 0)), c: rgbCss(S.col.glow), pid: pid });
  }

  // ---------- projectiles ----------
  function shoot(world, m, S, ang, ev, spd) {
    (world.mproj || (world.mproj = [])).push({ x: m.x + Math.cos(ang) * 6, y: m.y - 8 + Math.sin(ang) * 3, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1.9, dmg: S.dmg * m.mul * (m.elite ? 1.3 : 1), el: S.elem, c: rgbCss(S.col.glow) });
  }
  function stepProj(state, world, pts, dt, ev) {
    const L = world.mproj; if (!L || !L.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i]; if (!q) continue; // (la liste peut avoir été vidée par un évanouissement)
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life <= 0) { L.splice(i, 1); continue; }
      for (const p of pts) if (Math.abs(p.x - q.x) < 7 && Math.abs(p.y - 7 - q.y) < 9) { if (hurtPlayer(state, p, q.dmg, q.x - q.vx * 0.05, q.y - q.vy * 0.05, 70, q.el, ev)) { ev.push({ type: 'cfx', k: 'burst', x: q.x, y: q.y, c: '#ffffff' }); if (L[i] === q) L.splice(i, 1); } break; }
    }
  }

  // ---------- zone ----------
  function blast(state, world, m, S, cx, cy, r, mult, kb, ev, pts) {
    const col = rgbCss(S.col.glow), dmg = S.dmg * m.mul * (m.elite ? 1.3 : 1) * mult;
    ev.push({ type: 'cfx', k: 'ring', x: cx, y: cy, r: r, c: col, life: 0.4 });
    ev.push({ type: 'cfx', k: 'crack', x: cx, y: cy, c: col, life: 0.5 });
    ev.push({ type: 'shake', a: 2 + S.size });
    for (const p of pts) if (Math.hypot(p.x - cx, p.y - 6 - cy) <= r + 5) hurtPlayer(state, p, dmg, cx, cy, kb, S.elem, ev);
  }

  // ---------- IA ----------
  function walk(world, m, vx, vy, spd, dt) {
    const ox = m.x, oy = m.y, step = spd * dt;
    I.collision.moveEntity(world, m, vx * step, vy * step);
    if (!onLand(world, m.x, m.y)) { m.x = ox; m.y = oy; m.stuck += 0.25; }
    const got = Math.hypot(m.x - ox, m.y - oy);
    if (got < step * 0.4) m.stuck += dt; else m.stuck = Math.max(0, m.stuck - dt);
    if (Math.abs(vx) > 0.2) m.left = vx < 0;
    m.moving = got > 0.02;
    return got;
  }
  function startWind(m, S, ang, t) { m.st = 'wind'; m.t = m.wt = t === undefined ? S.wind : t; m.ang = ang; m.hit = false; m.moving = false; }

  function stepOne(state, world, m, S, pts, dt, ev) {
    if (m.kx || m.ky) { // recul
      const ox = m.x, oy = m.y; I.collision.moveEntity(world, m, m.kx * dt, m.ky * dt);
      if (!onLand(world, m.x, m.y)) { m.x = ox; m.y = oy; m.kx = m.ky = 0; }
      const k = Math.exp(-dt * 5); m.kx *= k; m.ky *= k; if (Math.abs(m.kx) + Math.abs(m.ky) < 5) m.kx = m.ky = 0;
    }
    m.cd = Math.max(0, m.cd - dt); m.aggro = Math.max(0, m.aggro - dt);
    if (m.stun > 0) { m.stun -= dt; m.moving = false; m.frame = 0; return; }
    let tgt = null, td = 1e9;
    for (const p of pts) { const d = Math.hypot(p.x - m.x, p.y - m.y); if (d < td) { td = d; tgt = p; } }
    if (tgt && td < S.sight) m.aggro = Math.max(m.aggro, 2.5);
    const has = tgt && m.aggro > 0 && td < 460, ang = has ? Math.atan2(tgt.y - m.y, tgt.x - m.x) : 0, ux = Math.cos(ang), uy = Math.sin(ang);
    const spd = S.speed * (m.elite ? 1.1 : 1) * (m.tier ? 1 + m.tier * 0.04 : 1) * I.powers.speedMul(m);
    m.moving = false;

    if (m.st === 'idle') {
      if (has) { m.st = 'chase'; return; }
      if (m.wait > 0) { m.wait -= dt; return; }
      if (!m.tx && !m.ty) { const a = Math.random() * 6.2832, r = 12 + Math.random() * 36; m.tx = m.home.x + Math.cos(a) * r; m.ty = m.home.y + Math.sin(a) * r; }
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
      if (d < 3 || m.stuck > 0.6) { m.tx = m.ty = 0; m.wait = 1.5 + Math.random() * 3.5; m.stuck = 0; } else walk(world, m, dx / d, dy / d, spd * 0.4, dt);
    } else if (m.st === 'chase') {
      if (!has) { m.st = 'idle'; m.tx = m.ty = 0; m.wait = 1; return; }
      const A = S.arch, pxo = -uy * m.sg, pyo = ux * m.sg;
      if (A === 'stalker' || A === 'swarmer') {
        if (td <= S.reach + 3 && m.cd <= 0) startWind(m, S, ang);
        else if (td <= S.reach + 12) walk(world, m, pxo * 0.8 + ux * 0.2, pyo * 0.8 + uy * 0.2, spd * 0.6, dt); // tourne autour en attendant sa recharge
        else { const w = A === 'swarmer' ? Math.sin(state.time.minutes * 3 + m.ph) * 0.6 : 0; walk(world, m, ux + pxo * w, uy + pyo * w, spd, dt); }
      } else if (A === 'charger') {
        if (td < S.sight * 0.85 && td > 24 && m.cd <= 0) startWind(m, S, ang);
        else if (td > 70) walk(world, m, ux, uy, spd * 0.85, dt);
        else walk(world, m, pxo, pyo, spd * 0.5, dt);
      } else if (A === 'spitter') {
        if (td < S.keep - 40) walk(world, m, -ux, -uy, spd * 1.15, dt); // trop près : il recule d'abord
        else if (td < S.reach && td > 24 && m.cd <= 0) startWind(m, S, ang);
        else if (td > S.keep + 22) walk(world, m, ux, uy, spd, dt);
        else if (td < S.keep - 26) walk(world, m, -ux, -uy, spd * 1.1, dt);
        else walk(world, m, pxo, pyo, spd * 0.55, dt);
      } else if (A === 'brute') {
        if (td < S.reach + 6 && m.cd <= 0) startWind(m, S, ang); else walk(world, m, ux, uy, spd, dt);
      } else if (A === 'bomber') {
        if (td <= S.reach) startWind(m, S, ang); else walk(world, m, ux, uy, spd, dt);
      }
      if (m.stuck > 0.5) { m.sg = -m.sg; m.stuck = 0; }
    } else if (m.st === 'wind') {
      m.t -= dt;
      const A = S.arch;
      if (A === 'charger' && m.t > 0.22 && has) m.ang = ang; // suit le joueur puis verrouille la direction : on peut l'esquiver
      else if ((A === 'spitter' || A === 'stalker' || A === 'swarmer' || A === 'brute') && has && m.t > 0.12) m.ang = ang;
      if (A === 'bomber' && has && m.t > 0.2) walk(world, m, ux, uy, spd * 0.3, dt); // la mèche brûle, il avance encore un peu
      if (m.t > 0) return;
      const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
      if (A === 'stalker' || A === 'swarmer') {
        const dmg = S.dmg * m.mul * (m.elite ? 1.3 : 1);
        for (const p of pts) if (Math.hypot(p.x - (m.x + ca * 5), p.y - (m.y + sa * 3)) < S.reach + 6) hurtPlayer(state, p, dmg, m.x, m.y, A === 'swarmer' ? 40 : 80, S.elem, ev);
        ev.push({ type: 'cfx', k: 'slash', x: m.x, y: m.y - 6, a: m.ang, r: S.reach + 4, arc: 1.8, c: rgbCss(S.col.glow), life: 0.18 });
        m.st = 'rec'; m.t = m.wt = 0.35; m.cd = S.cdn; I.collision.moveEntity(world, m, ca * 4, sa * 3);
      } else if (A === 'charger') { m.st = 'act'; m.t = 0.5; m.hit = false; }
      else if (A === 'spitter') {
        shoot(world, m, S, m.ang, ev, 118);
        if (m.elite) { shoot(world, m, S, m.ang + 0.28, ev, 118); shoot(world, m, S, m.ang - 0.28, ev, 118); }
        m.st = 'rec'; m.t = m.wt = 0.4; m.cd = S.cdn * (0.8 + Math.random() * 0.5);
      } else if (A === 'brute') {
        blast(state, world, m, S, m.x + ca * 16, m.y + sa * 10, S.blast, 1, 190, ev, pts);
        m.st = 'rec'; m.t = m.wt = 1.0; m.cd = S.cdn;
      } else if (A === 'bomber') {
        blast(state, world, m, S, m.x, m.y, S.blast, 1, 200, ev, pts);
        kill(world, m, S, ev, undefined, false);
      }
    } else if (m.st === 'act') { // charge
      m.t -= dt;
      const ca = Math.cos(m.ang), sa = Math.sin(m.ang), step = S.dash * dt, got = walk(world, m, ca, sa, S.dash, dt);
      if (!m.hit) for (const p of pts) if (Math.hypot(p.x - m.x, p.y - m.y) < 12 + m.hw) { if (hurtPlayer(state, p, S.dmg * m.mul * (m.elite ? 1.3 : 1), m.x - ca * 4, m.y - sa * 4, 160, S.elem, ev)) { m.hit = true; m.t = Math.min(m.t, 0.1); } }
      if (got < step * 0.35) { m.stun = 1.0; m.st = 'rec'; m.t = m.wt = 1.0; m.cd = S.cdn; ev.push({ type: 'cfx', k: 'crack', x: m.x + ca * 8, y: m.y, c: '#c9c9d4', life: 0.4 }); } // s'assomme contre un obstacle
      else if (m.t <= 0) { m.st = 'rec'; m.t = m.wt = 1.0; m.cd = S.cdn; }
    } else if (m.st === 'rec') {
      m.t -= dt; if (m.t <= 0) m.st = 'chase';
    }
    if (m.moving) { m.at += dt; m.frame = 1 + (Math.floor(m.at / 0.14) % 2); } else { m.at = 0; m.frame = 0; }
  }

  let acc = 0;
  /** Appelé à chaque pas de simulation (hôte / solo). */
  function update(state, dt, ev) {
    const world = state.world;
    if (!world.chunked) return;
    if (!world.mobs) world.mobs = [];
    const pts = []; for (const id in state.players) { const p = state.players[id]; if (!p.away) pts.push(p); }
    acc += dt;
    if (acc >= 0.5) { acc = 0; sync(world, pts); }
    const list = world.mobs;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]; if (!m || list.indexOf(m) < 0) continue;
      let act = false;
      for (const p of pts) if (Math.abs(p.x - m.x) < ACT && Math.abs(p.y - m.y) < ACT) { act = true; break; }
      if (act) stepOne(state, world, m, I.mobGen.species(world.D, m.sp), pts, dt, ev);
    }
    stepProj(state, world, pts, dt, ev);
  }

  // ---------- réseau ----------
  function pack(world, pts, dist) {
    const out = [];
    if (!world.mobs) return out;
    for (const m of world.mobs) {
      let near = false;
      for (const p of pts) if (Math.abs(p.x - m.x) < dist && Math.abs(p.y - m.y) < dist) { near = true; break; }
      if (near) out.push([m.id, m.sp, m.v, r1(m.x), r1(m.y), (m.left ? 1 : 0) | (m.moving ? 2 : 0) | (m.elite ? 4 : 0), m.frame, m.hpp, ST[m.st] | 0, m.st === 'wind' ? Math.round(10 * (1 - Math.max(0, m.t) / (m.wt || 1))) : 0, Math.round(m.ang * 20) / 20, m.stun > 0 ? 1 : 0]);
    }
    return out;
  }
  function packProj(world, pts, dist) {
    const out = [];
    for (const q of world.mproj || []) { let near = false; for (const p of pts) if (Math.abs(p.x - q.x) < dist && Math.abs(p.y - q.y) < dist) { near = true; break; } if (near) out.push([r1(q.x), r1(q.y), Math.round(q.vx), Math.round(q.vy), q.c]); }
    return out;
  }
  function unpack(world, rows, proj) {
    const old = {}; for (const c of world.mobs || []) old[c.id] = c;
    const list = [], n = I.mobGen.count(world.D);
    if (Array.isArray(rows)) for (const a of rows) {
      if (!Array.isArray(a) || !(a[1] >= 0 && a[1] < n) || !isFinite(a[3]) || !isFinite(a[4])) continue;
      const o = old[a[0]], m = o || { id: String(a[0]), mob: 1, x: a[3], y: a[4] };
      m.sp = a[1] | 0; m.v = a[2] | 0; m.tx = a[3]; m.ty = a[4]; m.left = !!(a[5] & 1); m.moving = !!(a[5] & 2); m.elite = !!(a[5] & 4); m.frame = a[6] | 0; m.hpp = a[7] === undefined ? 100 : a[7] | 0;
      m.st = STN[a[8] | 0] || 'chase'; m.tp = (a[9] | 0) / 10; m.ang = +a[10] || 0; m.stun = a[11] ? 1 : 0; m.hw = boxOf(I.mobGen.species(world.D, m.sp)).hw;
      if (Math.hypot(m.x - m.tx, m.y - m.ty) > 48) { m.x = m.tx; m.y = m.ty; }
      list.push(m);
    }
    world.mobs = list;
    world.mproj = Array.isArray(proj) ? proj.filter(function (a) { return Array.isArray(a) && isFinite(a[0]) && isFinite(a[1]); }).map(function (a) { return { x: a[0], y: a[1], vx: +a[2] || 0, vy: +a[3] || 0, c: typeof a[4] === 'string' && /^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/.test(a[4]) ? a[4] : 'rgb(255,80,100)' }; }) : [];
  }
  /** Invité : lisse les positions reçues et fait avancer les projectiles entre deux messages. */
  function smooth(world, k, dt) {
    for (const c of world.mobs || []) if (c.tx !== undefined) { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; }
    for (const q of world.mproj || []) { q.x += q.vx * dt; q.y += q.vy * dt; }
  }

  I.mobs = { update: update, damage: damage, hurtPlayer: hurtPlayer, sync: sync, pack: pack, packProj: packProj, unpack: unpack, smooth: smooth, ACT: ACT };
})((window.Iles = window.Iles || {}));
