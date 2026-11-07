/*
 * Construction : poser et retirer des structures sur la grille de 16 px.
 * Tout passe par (état, joueur) et des événements, pour pouvoir être validé par l'hôte en coop.
 */
(function (I) {
  const TS = I.config.TILE;
  const REACH = 60; // distance joueur -> case, en pixels
  const TEXT = {
    far: 'Trop loin pour construire ici.',
    terrain: 'On ne peut pas construire ici.',
    occupied: 'Il y a déjà quelque chose ici.',
    blocked: 'Quelque chose gêne.',
    player: 'Quelqu’un se tient sur la case.',
    notEmpty: 'Vide-le d’abord.',
    roofOpen: 'La pièce n’est pas fermée : il faut des murs (portes et fenêtres comprises) tout autour.',
    roofWall: 'Vise une case à l’intérieur de la pièce.',
    roofDone: 'Cette pièce a déjà son toit.',
    roofNeed: 'Il faut plus de toits pour couvrir cette pièce.',
  };
  /** Message d'erreur d'une pose refusée (certains contiennent des nombres). */
  function msg(c) { return c.reason === 'roofNeed' ? 'Il faut ' + c.n + ' toits pour cette pièce (tu en as ' + c.have + ').' : TEXT[c.reason] || 'Impossible ici.'; }

  /** Case visée : sous la souris si on vise, sinon la case juste devant le joueur. */
  function tileFromAim(p, aim) {
    if (aim) return [Math.floor(aim.x / TS), Math.floor(aim.y / TS)];
    const f = I.harvest.DIRVEC[p.dir];
    return [Math.floor((p.x + f[0] * 14) / TS), Math.floor((p.y - 4 + f[1] * 14) / TS)];
  }

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  /** @returns {{ok:boolean, reason?:string}} */
  function check(state, p, type, tx, ty, c, itemId) {
    const world = state.world, def = I.OBJECTS[type];
    if (tx < 0 || ty < 0 || tx >= world.W || ty >= world.H) return { ok: false, reason: 'terrain' };
    if (Math.hypot(p.x - (tx * TS + 8), (p.y - 6) - (ty * TS + 8)) > REACH) return { ok: false, reason: 'far' };
    if (!world.isLand(tx, ty)) return { ok: false, reason: 'terrain' };
    if (def.layer === 'roof') { // toit : couvre toute la pièce fermée visée
      const pv = I.house.roofPreview(world, tx, ty);
      if (!pv.ok) return { ok: false, reason: pv.reason };
      const have = itemId ? p.inv.count(itemId) : 0;
      if (have < pv.n) return { ok: false, reason: 'roofNeed', n: pv.n, have: have };
      return { ok: true, n: pv.n, tiles: pv.fresh };
    }
    const floor = def.layer === 'floor', old = floor ? world.floorAt(tx, ty) : world.structureAt(tx, ty);
    let replace = null;
    if (old) { // une porte, une fenêtre ou un autre mur peut prendre la place d'un mur (modifier un mur sans le casser)
      if (def.wall && old.def.wall && !(old.type === type && (old.c | 0) === (c | 0))) replace = old;
      else return { ok: false, reason: 'occupied' };
    }
    // objets naturels sur la case (arbre, rocher, buisson, fleur…) ; une cueillette repoussant plus tard n'empêche rien
    const objs = world.objectsIn(tx * TS - 24, ty * TS, tx * TS + TS + 24, ty * TS + TS + 40);
    for (const o of objs) {
      if (o.structure) continue;
      if (Math.floor(o.x / TS) !== tx || Math.floor((o.y - 1) / TS) !== ty) continue;
      if (world.isDepleted(o) && !o.rectCut) continue;
      return { ok: false, reason: 'occupied' };
    }
    if (!floor && def.collider) {
      const r = { x: tx * TS + 8 + def.collider[0], y: ty * TS + 16 + def.collider[1], w: def.collider[2], h: def.collider[3] };
      for (const id in state.players) {
        const q = state.players[id];
        if (q.away) continue;
        if (overlap(r, { x: q.x - q.hw, y: q.y - 2 * q.hh, w: 2 * q.hw, h: 2 * q.hh })) return { ok: false, reason: 'player' };
      }
    }
    return { ok: true, replace: replace };
  }

  function place(state, p, slotIndex, tx, ty, ev) {
    const slot = p.inv.slots[slotIndex], def0 = slot && I.ITEMS[slot.id];
    if (!def0 || !def0.place) return { ok: false, reason: 'item' };
    const c = check(state, p, def0.place, tx, ty, def0.c | 0, slot.id);
    if (!c.ok) return c;
    const world = state.world;
    if (c.tiles) { // toit : une tuile par case de la pièce
      I.inv_takeAny(p.inv, slot.id, c.n);
      for (const t of c.tiles) world.addStructure('roof', t[0], t[1], null, undefined, def0.c | 0);
      p.stats.built_roof = (p.stats.built_roof | 0) + 1;
      ev.push({ type: 'place', pid: p.id, otype: 'roof', x: tx * TS + 8, y: ty * TS + 12 });
      ev.push({ type: 'msg', pid: p.id, text: 'Toit posé (' + c.n + ' tuiles).' });
      return { ok: true };
    }
    if (c.replace) { world.removeStructure(c.replace); I.house.giveBack(world, p, I.mat.id(c.replace.def.item, c.replace.c | 0), 1, c.replace); }
    const o = state.world.addStructure(def0.place, tx, ty, I.containers.newData(def0.place), undefined, def0.c | 0); // la couleur vient du matériau
    p.inv.take(slotIndex, 1);
    p.stats['built_' + def0.place] = (p.stats['built_' + def0.place] | 0) + 1;
    ev.push({ type: 'place', pid: p.id, otype: o.type, x: o.x, y: o.y - 4 });
    return { ok: true, obj: o };
  }

  function remove(state, p, tx, ty, ev) {
    const world = state.world, held = p.inv.slots[p.sel], hd = held && I.ITEMS[held.id];
    if (hd && hd.place && I.OBJECTS[hd.place].layer === 'roof' && world.roofAt(tx, ty)) { // toit en main : on démonte le toit, pas le mur
      if (Math.hypot(p.x - (tx * TS + 8), (p.y - 6) - (ty * TS + 8)) > REACH + 8) return { ok: false, reason: 'far' };
      const n = I.house.removeRoofAt(state, p, tx, ty);
      ev.push({ type: 'remove', pid: p.id, otype: 'roof', x: tx * TS + 8, y: ty * TS + 12 });
      ev.push({ type: 'msg', pid: p.id, text: 'Toit retiré (' + n + ' tuiles récupérées).' });
      return { ok: true };
    }
    const o = world.structureAt(tx, ty) || world.floorAt(tx, ty);
    if (!o) return { ok: false, reason: 'none' };
    if (Math.hypot(p.x - o.x, (p.y - 6) - (o.y - 8)) > REACH + 8) return { ok: false, reason: 'far' };
    if (!I.containers.isEmpty(o)) return { ok: false, reason: 'notEmpty' };
    world.removeStructure(o);
    const back = I.mat.id(o.def.item, o.c | 0), left = p.inv.add(back, 1);
    if (left > 0) world.spawnDrop(back, left, o.x, o.y - 4, true);
    ev.push({ type: 'remove', pid: p.id, otype: o.type, x: o.x, y: o.y - 4 });
    if (o.def.wall) { const n = I.house.revalidate(state, p, ev); if (n) ev.push({ type: 'msg', pid: p.id, text: 'Le toit n’est plus soutenu : ' + n + ' tuiles récupérées.' }); } // pas de toit qui flotte
    return { ok: true };
  }

  I.building = { REACH: REACH, TEXT: TEXT, msg: msg, tileFromAim: tileFromAim, check: check, place: place, remove: remove };
})((window.Iles = window.Iles || {}));
