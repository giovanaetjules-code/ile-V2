/*
 * Créatures passives des dimensions : troupeaux déterministes par morceau de 32x32 cases (graine + position => mêmes troupeaux), errance
 * autour d'un centre de troupeau qui dérive lentement, fuite des espèces craintives. Seul l'hôte (ou le solo) simule ; les invités reçoivent
 * les positions (pack / unpack). Rien n'est sauvegardé : un morceau déchargé puis rechargé réapparaît avec ses troupeaux.
 * Les créatures vivent dans `world.creatures` (mondes infinis uniquement : ni l'île, ni le lobby).
 */
(function (I) {
  const R = I.rng, TS = I.config.TILE, T = I.TILE, CS = 32, ACT = 460, MAX = 150;
  const P_HERD = 0.32, P_HERD2 = 0.06;

  const landTile = function (t) { return I.WALKABLE[t] && t !== T.WALL; };
  const onLand = function (world, x, y) { return landTile(world.tileAt(Math.floor(x / TS), Math.floor((y - 1) / TS))); };

  function box(S) { return { hw: Math.max(2, Math.min(6, Math.round(S.bw * 0.35))), hh: 2 }; }

  function spawnHerd(world, c, key, h, out) {
    const D = world.D, nsp = I.creatureGen.count(D), cx = c.cx, cy = c.cy, sd = D.seed;
    if (R.hash2(cx * 7 + h, cy, sd + 900) >= (h ? P_HERD2 : P_HERD)) return;
    const portal = world.portalObj;
    for (let t = 0; t < 8; t++) {
      const tx = cx * CS + 2 + Math.floor(R.hash2(cx * 13 + t, cy * 17 + h, sd + 901) * (CS - 4)), ty = cy * CS + 2 + Math.floor(R.hash2(cx * 19 + t, cy * 23 + h, sd + 902) * (CS - 4));
      const tile = world.tileAt(tx, ty);
      if (!landTile(tile) || world.objectsIn(tx * TS - 2, ty * TS - 2, tx * TS + 34, ty * TS + 34).length > 3) continue;
      if (portal && Math.abs(tx * TS - portal.x) < 90 && Math.abs(ty * TS - portal.y) < 90) continue; // l'arrivée reste dégagée
      const list = []; for (let i = 0; i < nsp; i++) if (I.creatureGen.likes(I.creatureGen.species(D, i), tile)) list.push(i);
      if (!list.length) continue;
      const si = list[Math.floor(R.hash2(cx * 29 + h, cy * 31 + t, sd + 903) * list.length)], S = I.creatureGen.species(D, si);
      const n = S.herd[0] + Math.floor(R.hash2(cx * 37 + h, cy * 41, sd + 904) * (S.herd[1] - S.herd[0] + 1));
      const mhp = Math.round(I.COMBAT.HP[S.size] * (0.85 + R.hash2(cx * 61 + h, cy * 67, sd + 909) * 0.3)), herd = { x: tx * TS + 8, y: ty * TS + 8, ox: tx * TS + 8, oy: ty * TS + 8, t: 2 + R.hash2(cx, cy, sd + 905) * 6, key: key, last: -1, n: n }, b = box(S);
      for (let m = 0; m < n; m++) {
        for (let tr = 0; tr < 6; tr++) {
          const a = R.hash2(cx * 43 + m, cy * 47 + tr, sd + 906) * 6.2832, r = 6 + Math.sqrt(R.hash2(cx * 53 + m, cy * 59 + tr, sd + 907)) * (14 + n * 3);
          const e = { x: herd.x + Math.cos(a) * r, y: herd.y + Math.sin(a) * r, hw: b.hw, hh: b.hh };
          if (!onLand(world, e.x, e.y) || I.collision.isBlocked(world, e)) continue;
          out.push({ id: 'c' + cx + '_' + cy + '_' + h + '_' + m, sp: si, v: m & 3, x: e.x, y: e.y, hw: b.hw, hh: b.hh, left: R.hash2(m, cx, sd) < 0.5, moving: false, frame: 0, at: 0, mode: 'idle', wait: R.hash2(m, cy, sd + 908) * 3, tx: 0, ty: 0, stuck: 0, flee: 0, fx: 0, fy: 0, herd: herd, hp: mhp, mhp: mhp, hpp: 100, kx: 0, ky: 0, stun: 0 });
          break;
        }
      }
      return;
    }
  }

  /** Fait apparaître les troupeaux des morceaux nouvellement chargés, retire ceux des morceaux déchargés. */
  function sync(world) {
    const list = world.creatures;
    if (list.length) { let w = 0; for (let i = 0; i < list.length; i++) if (world.chunks.has(list[i].herd.key)) list[w++] = list[i]; list.length = w; }
    for (const [key, c] of world.chunks) {
      if (c.herds) continue;
      c.herds = true;
      for (let h = 0; h < 2 && list.length < MAX; h++) spawnHerd(world, c, key, h, list);
    }
  }

  function stepHerd(world, herd, dt) {
    herd.t -= dt;
    if (herd.t > 0) return;
    herd.t = 7 + Math.random() * 9;
    const far = Math.hypot(herd.x - herd.ox, herd.y - herd.oy) > 150, a = Math.random() * 6.2832, d = 30 + Math.random() * 50;
    const nx = far ? herd.x + (herd.ox - herd.x) * 0.5 : herd.x + Math.cos(a) * d, ny = far ? herd.y + (herd.oy - herd.y) * 0.5 : herd.y + Math.sin(a) * d;
    if (onLand(world, nx, ny)) { herd.x = nx; herd.y = ny; }
  }

  function stepOne(world, cr, S, pts, dt, frame) {
    const herd = cr.herd;
    if (herd.last !== frame) { herd.last = frame; stepHerd(world, herd, dt); }
    // recul (coups reçus) et étourdissement
    if (cr.kx || cr.ky) {
      const ox = cr.x, oy = cr.y; I.collision.moveEntity(world, cr, cr.kx * dt, cr.ky * dt);
      if (!onLand(world, cr.x, cr.y)) { cr.x = ox; cr.y = oy; cr.kx = cr.ky = 0; }
      const k = Math.exp(-dt * 5); cr.kx *= k; cr.ky *= k; if (Math.abs(cr.kx) + Math.abs(cr.ky) < 5) cr.kx = cr.ky = 0;
    }
    if (cr.stun > 0) { cr.stun -= dt; cr.moving = false; cr.frame = 0; return; }
    // fuite : une espèce craintive s'éloigne du joueur le plus proche
    let np = null, nd = 1e9;
    for (const p of pts) { const d = Math.hypot(p.x - cr.x, p.y - cr.y); if (d < nd) { nd = d; np = p; } }
    cr.flee = Math.max(0, cr.flee - dt);
    if (cr.flee <= 0 && S.shy && np && nd < S.shy) { cr.flee = 0.8; const a = Math.atan2(cr.y - np.y, cr.x - np.x); cr.fx = Math.cos(a); cr.fy = Math.sin(a); }
    let vx = 0, vy = 0, spd = S.speed * I.powers.speedMul(cr);
    if (cr.flee > 0) { vx = cr.fx; vy = cr.fy; spd *= 2.1; cr.mode = 'idle'; cr.wait = 0.4; }
    else if (cr.mode === 'walk') {
      const dx = cr.tx - cr.x, dy = cr.ty - cr.y, d = Math.hypot(dx, dy);
      if (d < 2 || cr.stuck > 0.6) { cr.mode = 'idle'; cr.wait = 1 + Math.random() * 4; cr.stuck = 0; }
      else { vx = dx / d; vy = dy / d; }
    } else {
      cr.wait -= dt;
      if (cr.wait <= 0) {
        const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * (16 + herd.n * 4), tx = herd.x + Math.cos(a) * r, ty = herd.y + Math.sin(a) * r;
        if (onLand(world, tx, ty)) { cr.tx = tx; cr.ty = ty; cr.mode = 'walk'; cr.stuck = 0; } else cr.wait = 0.5;
      }
    }
    const moved0 = vx || vy;
    if (moved0) {
      const ox = cr.x, oy = cr.y, step = spd * dt;
      I.collision.moveEntity(world, cr, vx * step, vy * step);
      if (!onLand(world, cr.x, cr.y)) { cr.x = ox; cr.y = oy; cr.stuck += 0.3; cr.mode = cr.flee > 0 ? cr.mode : 'idle'; if (cr.mode === 'idle' && cr.wait <= 0) cr.wait = 1; }
      const got = Math.hypot(cr.x - ox, cr.y - oy);
      if (got < step * 0.4) cr.stuck += dt; else cr.stuck = Math.max(0, cr.stuck - dt);
      if (Math.abs(vx) > 0.15) cr.left = vx < 0;
      cr.moving = got > 0.02; // les créatures n'avancent jamais dans l'eau, les murs ou les objets
    } else cr.moving = false;
    if (cr.moving) { cr.at += dt; cr.frame = 1 + (Math.floor(cr.at / 0.17) % 2); } else { cr.at = 0; cr.frame = 0; }
  }

  /** Inflige des dégâts à une créature (hôte). Recul dans la direction opposée à la source, étourdissement, panique ; à 0 PV : mort et butin. Renvoie true si elle meurt. */
  function damage(world, cr, amount, crit, from, kb, stun, ev, pid) {
    cr.hp -= amount; cr.hpp = Math.max(0, Math.round(100 * cr.hp / cr.mhp));
    const a = Math.atan2(cr.y - from.y, cr.x - from.x), S = I.creatureGen.species(world.D, cr.sp);
    cr.kx = Math.cos(a) * (kb || 0); cr.ky = Math.sin(a) * (kb || 0) * 0.8;
    if (stun > 0) cr.stun = Math.max(cr.stun, stun);
    cr.flee = 3.2; cr.fx = Math.cos(a); cr.fy = Math.sin(a); cr.mode = 'idle'; cr.wait = 1;
    const rgb = 'rgb(' + S.col.body.map(Math.round).join(',') + ')';
    ev.push({ type: 'cHit', id: cr.id, x: cr.x, y: cr.y - 8, dmg: amount, crit: !!crit, pid: pid, c: rgb });
    if (cr.hp > 0) return false;
    const list = world.creatures, i = list.indexOf(cr); if (i >= 0) list.splice(i, 1);
    for (const l of I.creatureLoot(S, Math.random)) for (let k = 0; k < l.qty; k++) world.spawnDrop(l.item, 1, cr.x, cr.y - 3, true).z = 6; // viande selon le plan de corps, butin rare
    ev.push({ type: 'cDie', id: cr.id, x: cr.x, y: cr.y - 5, size: S.size, c: rgb, pid: pid });
    return true;
  }

  let FR = 0, acc = 0;
  /** Appelé à chaque pas de simulation (hôte / solo) : pts = joueurs présents. */
  function update(world, pts, dt) {
    if (!world.chunked) return;
    if (!world.creatures) world.creatures = [];
    acc += dt;
    if (acc >= 0.5) { acc = 0; sync(world); }
    FR++;
    const list = world.creatures;
    for (let i = 0; i < list.length; i++) {
      const cr = list[i];
      let act = false;
      for (const p of pts) if (Math.abs(p.x - cr.x) < ACT && Math.abs(p.y - cr.y) < ACT) { act = true; break; }
      if (act) stepOne(world, cr, I.creatureGen.species(world.D, cr.sp), pts, dt, FR);
    }
  }

  // ---------- réseau : positions seulement, l'espèce se recalcule depuis la graine ----------
  const r1 = function (v) { return Math.round(v * 10) / 10; };
  function pack(world, pts, dist) {
    const out = [];
    if (!world.creatures) return out;
    for (const cr of world.creatures) {
      let near = false;
      for (const p of pts) if (Math.abs(p.x - cr.x) < dist && Math.abs(p.y - cr.y) < dist) { near = true; break; }
      if (near) out.push([cr.id, cr.sp, cr.v, r1(cr.x), r1(cr.y), (cr.left ? 1 : 0) | (cr.moving ? 2 : 0), cr.frame, cr.hpp]);
    }
    return out;
  }
  function unpack(world, rows) {
    const old = {}; for (const c of world.creatures || []) old[c.id] = c;
    const list = [];
    if (Array.isArray(rows)) for (const a of rows) {
      if (!Array.isArray(a) || !(a[1] >= 0 && a[1] < 8) || !isFinite(a[3]) || !isFinite(a[4])) continue;
      const o = old[a[0]], cr = o || { id: String(a[0]), x: a[3], y: a[4] };
      cr.sp = a[1] | 0; cr.v = a[2] | 0; cr.tx = a[3]; cr.ty = a[4]; cr.left = !!(a[5] & 1); cr.moving = !!(a[5] & 2); cr.frame = a[6] | 0; cr.hpp = a[7] === undefined ? 100 : a[7] | 0;
      if (Math.hypot(cr.x - cr.tx, cr.y - cr.ty) > 48) { cr.x = cr.tx; cr.y = cr.ty; }
      list.push(cr);
    }
    world.creatures = list;
  }
  /** Invité : lisse les positions reçues. */
  function smooth(world, k) { for (const c of world.creatures || []) if (c.tx !== undefined) { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; } }

  I.creatures = { damage: damage, update: update, sync: sync, pack: pack, unpack: unpack, smooth: smooth, ACT: ACT };
})((window.Iles = window.Iles || {}));
