/*
 * Maisons : pièces, toits et visibilité intérieure, calculés à partir des murs réellement posés (aucune maison « préfabriquée »).
 *   - mur = toute construction avec def.wall ('wall' | 'window' | 'door') ; elles se raccordent entre elles et ferment une pièce.
 *   - pièce fermée = ensemble de cases qu'on ne peut pas quitter sans franchir un mur (ni toucher l'eau, le vide ou la limite du monde).
 *   - toit = une tuile par case de l'empreinte de la pièce (cases intérieures + murs qui la bordent).
 * Tout se recalcule à la demande à partir de world.bver : rien d'autre n'est stocké.
 */
(function (I) {
  const MAXR = 420; // au-delà, la zone est considérée comme ouverte
  const D8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  function wallAt(world, tx, ty) { const o = world.structureAt(tx, ty); return o && o.def.wall ? o : null; }

  function cache(world) {
    if (!world._hc || world._hc.v !== world.bver) world._hc = { v: world.bver, reg: new Map(), views: new Map() };
    return world._hc;
  }

  /** Pièce contenant la case (tx, ty) : { tiles: [clé…], enclosed }. null si la case est un mur ou n'est pas du sol. */
  function region(world, tx, ty) {
    const W = world.W, c = cache(world), k0 = ty * W + tx;
    if (c.reg.has(k0)) return c.reg.get(k0);
    if (wallAt(world, tx, ty) || !world.isLand(tx, ty)) return null;
    const seen = new Set([k0]), q = [[tx, ty]], tiles = [];
    let enclosed = true;
    while (q.length) {
      const t = q.pop(); tiles.push(t[1] * W + t[0]);
      if (tiles.length > MAXR) { enclosed = false; break; }
      for (let d = 0; d < 4; d++) {
        const nx = t[0] + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = t[1] + (d === 2 ? 1 : d === 3 ? -1 : 0), k = ny * W + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        if (nx < 0 || ny < 0 || nx >= W || ny >= world.H) { enclosed = false; continue; }
        if (wallAt(world, nx, ny)) continue;
        const tt = world.tileAt(nx, ny);
        if (tt === I.TILE.WALL) continue; // paroi rocheuse : barrière naturelle
        if (!world.isLand(nx, ny)) { enclosed = false; continue; }
        q.push([nx, ny]);
      }
    }
    const r = { tiles: tiles, enclosed: enclosed, W: W };
    if (enclosed) for (const k of tiles) c.reg.set(k, r);
    else c.reg.set(k0, r);
    return r;
  }

  /** Empreinte du toit : cases de la pièce + murs qui la bordent (voisines, diagonales comprises). Liste de [tx, ty]. */
  function footprint(world, r) {
    const W = r.W, set = new Set(), out = [];
    for (const k of r.tiles) {
      const tx = k % W, ty = (k - tx) / W;
      if (!set.has(k)) { set.add(k); out.push([tx, ty]); }
      for (const d of D8) {
        const nx = tx + d[0], ny = ty + d[1], nk = ny * W + nx;
        if (!set.has(nk) && wallAt(world, nx, ny)) { set.add(nk); out.push([nx, ny]); }
      }
    }
    return out;
  }

  /** Ce que donnerait un toit posé en (tx, ty) : { ok, reason, fp (toutes les cases), n (cases à couvrir) }. */
  function roofPreview(world, tx, ty) {
    const r = region(world, tx, ty);
    if (!r) return { ok: false, reason: 'roofWall', n: 0, fp: [] };
    if (!r.enclosed) return { ok: false, reason: 'roofOpen', n: 0, fp: [] };
    const fp = footprint(world, r), fresh = fp.filter(function (t) { return !world.roofAt(t[0], t[1]); });
    return { ok: fresh.length > 0, reason: fresh.length ? undefined : 'roofDone', n: fresh.length, fp: fp, fresh: fresh };
  }

  /** Pièce fermée dans laquelle se trouve le joueur (la porte compte pour la pièce voisine), ou null. */
  function roomOf(world, p) {
    const tx = Math.floor(p.x / 16), ty = Math.floor((p.y - 1) / 16);
    let r = region(world, tx, ty);
    if (!r && wallAt(world, tx, ty) && wallAt(world, tx, ty).def.wall === 'door') {
      for (const d of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const q = region(world, tx + d[0], ty + d[1]); if (q && q.enclosed) { r = q; break; } }
    }
    return r && r.enclosed ? r : null;
  }

  /**
   * Visibilité pour le joueur local : si on est dans une pièce fermée, les murs « devant » (sur ou sous sa ligne) et tout le toit
   * deviennent transparents. Renvoie { walls:Set<clé>, roofs:Set<clé> } ou null.
   */
  function view(world, p) {
    const c = cache(world), tx = Math.floor(p.x / 16), ty = Math.floor((p.y - 1) / 16), key = ty * world.W + tx;
    if (c.views.has(key)) return c.views.get(key);
    let out = null;
    const r = roomOf(world, p);
    if (r) {
      out = { walls: new Set(), roofs: new Set() };
      for (const t of footprint(world, r)) {
        const k = t[1] * world.W + t[0];
        out.roofs.add(k);
        if (wallAt(world, t[0], t[1]) && t[1] >= ty) out.walls.add(k);
      }
    }
    c.views.set(key, out);
    return out;
  }

  /** Après un retrait : supprime les tuiles de toit qui ne couvrent plus une pièce fermée. Renvoie le nombre de tuiles retirées. */
  function revalidate(state, p, ev) {
    const world = state.world; let n = 0;
    for (const o of world.structures.filter(function (s) { return s.def.layer === 'roof'; })) {
      let ok = false;
      const r = region(world, o.tx, o.ty);
      if (r && r.enclosed) ok = true;
      else if (wallAt(world, o.tx, o.ty)) {
        for (const d of D8) { const q = region(world, o.tx + d[0], o.ty + d[1]); if (q && q.enclosed) { ok = true; break; } }
      }
      if (ok) continue;
      world.removeStructure(o); n++;
      giveBack(world, p, I.mat.id(o.def.item, o.c | 0), 1, o);
    }
    if (n && ev) ev.push({ type: 'roofLost', pid: p ? p.id : null, n: n });
    return n;
  }

  /** Rend un objet au joueur, ou au sol si son sac est plein. */
  function giveBack(world, p, id, qty, at) {
    const left = p ? p.inv.add(id, qty) : qty;
    if (left > 0) world.spawnDrop(id, left, at.x, at.y - 4, true);
  }

  /** Retire tout le toit connecté à la case (tx, ty) (8 voisines). Renvoie le nombre de tuiles retirées. */
  function removeRoofAt(state, p, tx, ty) {
    const world = state.world, start = world.roofAt(tx, ty);
    if (!start) return 0;
    const seen = new Set([start]), q = [start]; let n = 0;
    while (q.length) {
      const o = q.pop();
      for (const d of D8) { const r = world.roofAt(o.tx + d[0], o.ty + d[1]); if (r && !seen.has(r)) { seen.add(r); q.push(r); } }
    }
    for (const o of seen) { world.removeStructure(o); n++; giveBack(world, p, I.mat.id(o.def.item, o.c | 0), 1, o); }
    return n;
  }

  I.house = { wallAt: wallAt, region: region, footprint: footprint, roofPreview: roofPreview, roomOf: roomOf, view: view, revalidate: revalidate, removeRoofAt: removeRoofAt, giveBack: giveBack };
})((window.Iles = window.Iles || {}));
