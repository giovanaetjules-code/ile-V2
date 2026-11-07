/*
 * Récolte : usage des outils, cueillette, objets au sol et ramassage.
 * Fonctions pures sur (world, player) ; les effets visuels / sonores passent par la liste d'événements `ev`.
 */
(function (I) {
  const REACH = 14;
  const TOOL_NAME = { axe: 'une hache', pickaxe: 'une pioche' };

  function dirName(vx, vy) {
    return Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
  }
  const DIRVEC = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

  function center(o) { return [o.x + (o.def.center ? o.def.center[0] : 0), o.y + (o.def.center ? o.def.center[1] : 0)]; }

  function rollDrops(def) {
    const out = [];
    for (const d of def.drops || []) {
      if (Math.random() >= d.chance) continue;
      const q = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (q > 0) out.push({ item: d.id, qty: q });
    }
    return out;
  }

  function spawnLoot(world, o, nearZ) {
    const c = center(o);
    for (const l of rollDrops(o.def)) {
      for (let i = 0; i < l.qty; i++) {
        const d = world.spawnDrop(I.mat.id(l.item, o.c | 0), 1, c[0], o.y - 3, true); // un objet coloré donne des matériaux de sa couleur
        d.z = nearZ || 6;
      }
    }
  }

  function findResource(world, p, vx, vy) {
    const cx = p.x, cy = p.y - 6;
    let best = null, bestScore = 1e9;
    const objs = world.objectsIn(cx - 56, cy - 40, cx + 56, cy + 70);
    for (const o of objs) {
      if (o.def.kind !== 'resource' || world.isDepleted(o)) continue;
      const c = center(o), dx = c[0] - cx, dy = c[1] - cy, d = Math.hypot(dx, dy);
      if (d > REACH + o.def.hitR) continue;
      const dot = d > 0.001 ? (dx * vx + dy * vy) / d : 1;
      if (d > o.def.hitR * 0.8 && dot < 0.3) continue;
      const score = d - dot * 6;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  function findInteractable(world, p) {
    const cx = p.x, cy = p.y - 4;
    let best = null, bestD = 1e9;
    const objs = world.objectsIn(cx - 60, cy - 40, cx + 60, cy + 70);
    for (const o of objs) {
      const k = o.def.kind;
      if (k !== 'harvest' && k !== 'interact') continue;
      if (k === 'harvest' && world.isDepleted(o)) continue;
      if (o.def.action === 'plot' && I.farming.stage(o.data, world.now || 0) < 3) continue; // une parcelle ne s'offre que mûre
      const c = center(o), d = Math.hypot(c[0] - cx, c[1] - cy);
      if (d <= o.def.interactR && d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  /** Démarre un coup d'outil (si l'objet sélectionné est un outil). */
  function tryStartSwing(p, aim, ev) {
    if (p.swing || p.useCd > 0) return;
    const slot = p.inv.slots[p.sel];
    const def = slot && I.ITEMS[slot.id];
    if (!def || !def.tool) { if (slot === null || !def) ev.push({ type: 'noTool', pid: p.id }); return; }
    let vx, vy;
    if (aim) {
      vx = aim.x - p.x; vy = aim.y - (p.y - 8);
      const l = Math.hypot(vx, vy);
      if (l < 3) { const f = DIRVEC[p.dir]; vx = f[0]; vy = f[1]; } else { vx /= l; vy /= l; }
    } else { const f = DIRVEC[p.dir]; vx = f[0]; vy = f[1]; }
    p.dir = dirName(vx, vy);
    p.swing = { t: 0, dur: def.dur || 0.34, dir: p.dir, vx: vx, vy: vy, item: slot.id, tool: def.tool, power: def.power || 1, tier: def.tier || 0, hit: false };
  }

  function updateSwing(world, p, dt, now, ev) {
    const s = p.swing;
    if (!s) { if (p.useCd > 0) p.useCd -= dt; return; }
    s.t += dt;
    if (!s.hit && s.t >= s.dur * 0.44) {
      s.hit = true;
      const o = findResource(world, p, s.vx, s.vy);
      if (o) {
        const c = center(o);
        if (o.def.tool !== s.tool) {
          ev.push({ type: 'clank', pid: p.id, x: c[0], y: c[1] });
          ev.push({ type: 'msg', pid: p.id, text: 'Il me faudrait ' + (TOOL_NAME[o.def.tool] || 'un autre outil') + ' pour ça.' });
        } else if (s.tier < (o.def.tier || 0)) {
          ev.push({ type: 'clank', pid: p.id, x: c[0], y: c[1] });
          ev.push({ type: 'msg', pid: p.id, text: 'Mon outil est trop faible pour ça…' });
        } else {
          const destroyed = world.hit(o, s.power, now);
          ev.push({ type: 'hit', pid: p.id, id: o.id, otype: o.type, x: c[0], y: c[1] });
          if (destroyed) {
            spawnLoot(world, o);
            ev.push({ type: 'destroy', pid: p.id, id: o.id, otype: o.type, x: c[0], y: c[1] });
            p.stats[o.type] = (p.stats[o.type] || 0) + 1;
          }
        }
      }
    }
    if (s.t >= s.dur) { p.swing = null; p.useCd = 0.05; }
  }

  /** Voyage entre dimensions : fondu d'abord (0,7 s), puis Game.travel() fait la bascule. */
  function beginTravel(state, to, ev) {
    if (state.travelTo) return;
    state.travelTo = to; state.travelT = 0.7;
    ev.push({ type: 'travelStart', to: to });
  }

  /** Touche E : cueillette ou interaction. */
  function interact(state, p, ev) {
    const world = state.world, o = findInteractable(world, p);
    if (!o) return;
    const c = center(o);
    if (o.def.kind === 'harvest') {
      world.deplete(o, state.time.minutes);
      spawnLoot(world, o, 4);
      p.stats[o.type] = (p.stats[o.type] || 0) + 1;
      ev.push({ type: 'harvest', pid: p.id, id: o.id, otype: o.type, x: c[0], y: c[1] });
      return;
    }
    switch (o.def.action) {
      case 'plot': I.farming.harvest(state, p, o, ev); break;
      case 'cook': ev.push({ type: 'openCook', pid: p.id, station: o.type }); break;
      case 'sign':
        ev.push({ type: 'say', pid: p.id, title: 'Panneau de bois', text: 'Bienvenue sur l’Île du Premier Souffle ! Abats les arbres avec ta hache, brise les rochers avec ta pioche, ramasse tout ce qui brille. À l’ouest, un vieux portail dort encore…' });
        break;
      case 'container':
        ev.push({ type: 'openContainer', pid: p.id, id: o.id });
        break;
      case 'forge':
        ev.push({ type: 'openForge', pid: p.id, id: o.id });
        break;
      case 'enchant': case 'disenchant':
        ev.push({ type: 'openEnchant', pid: p.id, mode: o.def.action, id: o.id });
        break;
      case 'sleep': {
        const h = I.timeutil.hour(state.time.minutes);
        if (h >= 19 || h < 5) {
          const day = Math.floor(state.time.minutes / I.config.DAY_MINUTES);
          state.time.minutes = (h >= 19 ? day + 1 : day) * I.config.DAY_MINUTES + 6 * 60;
          ev.push({ type: 'sleep', pid: p.id });
          ev.push({ type: 'saveRequest', pid: p.id, reason: 'sleep' });
        } else ev.push({ type: 'msg', pid: p.id, text: 'Je n\u2019ai pas sommeil… (on peut dormir dès 19 h)' });
        break;
      }
      case 'workbench':
        ev.push({ type: 'openCraft', pid: p.id, station: 'bench' });
        break;
      case 'house':
        ev.push({ type: 'saveRequest', pid: p.id, reason: 'house' });
        break;
      case 'portal':
        if (!state.progress.portals.includes('portal')) state.progress.portals.push('portal');
        beginTravel(state, 'lobby', ev); // le vieux portail mène au lobby spatial
        break;
      case 'returnpad':
        beginTravel(state, 'home', ev);
        break;
      case 'redbutton':
        I.dimension.press(state, p, ev);
        break;
      case 'portalUltimate': {
        const last = state.progress.flags.lastDim; // le portail rouvre la dernière dimension visitée (ses modifications y sont conservées)
        if (last && last.seed) { ev.push({ type: 'msg', pid: p.id, text: 'Le portail se rouvre sur ta dernière dimension…' }); beginTravel(state, 'd:' + last.seed, ev); }
        else ev.push({ type: 'say', pid: p.id, title: 'Le portail ultime', text: 'Un anneau de quartz grand comme une maison. Au fond, rien : un vide plein de promesses. Il attend qu’on appuie sur le bouton rouge pour s’ouvrir sur une dimension tirée au hasard.' });
        break;
      }
      case 'returnLobby':
        beginTravel(state, 'lobby', ev);
        break;
    }
  }

  // ---------- objets au sol ----------
  function walkableAt(world, x, y) { return world.isWalkable(Math.floor(x / 16), Math.floor(y / 16)); }

  function updateDrops(world, dt) {
    for (const d of world.drops) {
      d.age += dt;
      if (!d.pop) continue;
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
      if (walkableAt(world, nx, d.y)) d.x = nx; else d.vx = 0;
      if (walkableAt(world, d.x, ny)) d.y = ny; else d.vy = 0;
      d.z += d.vz * dt; d.vz -= 420 * dt;
      if (d.z <= 0) {
        d.z = 0;
        if (d.vz < -45) d.vz = -d.vz * 0.35; else { d.vz = 0; d.pop = false; }
        d.vx *= 0.6; d.vy *= 0.6;
      }
    }
  }

  /** Ramassage et attraction magnétique. Renvoie rien, émet des événements 'pickup'. */
  function collectDrops(world, p, dt, ev) {
    const px = p.x, py = p.y - 4, drops = world.drops;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (d.age < 0.35 || d.pop) continue;
      const dx = px - d.x, dy = py - d.y, dist = Math.hypot(dx, dy);
      if (dist > 38) continue;
      if (!p.inv.canAdd(d.item)) {
        if (dist < 10) ev.push({ type: 'invFull', pid: p.id });
        continue;
      }
      if (dist > 8) {
        const sp = 90 * dt;
        d.x += dx / dist * sp; d.y += dy / dist * sp;
        continue;
      }
      const left = p.inv.add(d.item, d.qty);
      const got = d.qty - left;
      if (got > 0) { ev.push({ type: 'pickup', pid: p.id, item: d.item, qty: got }); p.stats['got_' + d.item] = (p.stats['got_' + d.item] | 0) + got; }
      if (left > 0) d.qty = left; else drops.splice(i, 1);
    }
  }

  /** Jette une pile devant le joueur ; impossible de la ramasser pendant 1,5 s. */
  function throwStack(world, p, slotIndex) {
    const s = p.inv.slots[slotIndex];
    if (!s) return false;
    const f = DIRVEC[p.dir];
    const d = world.spawnDrop(s.id, s.qty, p.x + f[0] * 4, p.y - 6 + f[1] * 2, true);
    d.vx = f[0] * 55; d.vy = f[1] * 40; d.vz = 70; d.age = -1.5;
    p.inv.slots[slotIndex] = null; p.inv.rev++;
    return true;
  }

  I.harvest = { tryStartSwing, updateSwing, interact, findInteractable, updateDrops, collectDrops, throwStack, dirName, DIRVEC };
})((window.Iles = window.Iles || {}));
