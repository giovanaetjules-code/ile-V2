/* Collisions rectangle contre tuiles/objets, axe par axe, par petits pas. */
(function (I) {
  function firstHit(world, e) {
    const bx = e.x - e.hw, by = e.y - 2 * e.hh, bw = 2 * e.hw, bh = 2 * e.hh;
    const rects = world.solidRectsIn(bx, by, bx + bw, by + bh);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y) return r;
    }
    return null;
  }

  function moveAxis(world, e, dx, dy) {
    // si le dégagement tombe dans un autre obstacle (deux objets rapprochés), on annule le pas : jamais coincé dedans
    if (dx) {
      const ox = e.x; e.x += dx;
      const h = firstHit(world, e);
      if (h) { e.x = dx > 0 ? h.x - e.hw - 0.001 : h.x + h.w + e.hw + 0.001; if (firstHit(world, e)) e.x = ox; }
    }
    if (dy) {
      const oy = e.y; e.y += dy;
      const h = firstHit(world, e);
      if (h) { e.y = dy > 0 ? h.y - 0.001 : h.y + h.h + 2 * e.hh + 0.001; if (firstHit(world, e)) e.y = oy; }
    }
  }

  I.collision = {
    /** e : { x, y (pieds), hw, hh } ; la boîte fait 2*hw x 2*hh et se termine aux pieds. */
    moveEntity: function (world, e, dx, dy) {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
      for (let i = 0; i < steps; i++) moveAxis(world, e, dx / steps, dy / steps);
    },
    isBlocked: function (world, e) { return !!firstHit(world, e); },
  };
})((window.Iles = window.Iles || {}));
