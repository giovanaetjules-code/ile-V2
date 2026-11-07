/* Joueur : état sérialisable (identifiant stable) + mise à jour à partir d'« intentions » (voir main.js). */
(function (I) {
  const C = I.config;

  function create0(id, x, y) {
    return {
      id: id, x: x, y: y, hw: 4, hh: 3, dir: 'down',
      moving: false, frame: 0, animT: 0,
      dashT: 0, dashCd: 0, dashDir: [0, 1], sw: 0, wade: false, // sw : 0 = à pied, 1 = nage complète
      swing: null, useCd: 0, buildCd: 0, msgCd: 0, build: null,
      inv: new I.Inventory(C.INVENTORY_SIZE), sel: 0,
      target: null, stats: {}, av: I.avatar.def(), armor: I.armor.empty(), book: [], bookRev: 0,
    };
  }
  function newPlayer(id, x, y) { const p = create0(id, x, y); I.vitals.init(p); return p; }

  function giveStarterKit(p) {
    p.inv.add('axe', 1);
    p.inv.add('pickaxe', 1);
  }

  /**
   * it = { mx, my, dash, use, aim:{x,y}|null, interact, hotbar:int|null }
   * mx/my dans [-1, 1].
   */
  function update(state, p, it, dt, ev) {
    const world = state.world, H = I.harvest;
    if (p.st && p.st.stun > 0) it = Object.assign({}, it, { mx: 0, my: 0, dash: false, use: false, remove: false, ab: 0, interact: false }); // foudroyé : immobile un instant
    if (it.hotbar !== null && it.hotbar !== undefined && it.hotbar >= 0 && it.hotbar < C.HOTBAR_SIZE) p.sel = it.hotbar;

    I.combat.tick(state, p, it, dt, ev); // capacités, recharges, effets différés
    I.vitals.tick(p, dt);
    let mx = it.mx, my = it.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    // eau : l'eau profonde fait nager (transition douce), l'eau peu profonde ralentit un peu
    const ftx = Math.floor(p.x / 16), fty = Math.floor((p.y - 1) / 16), ft = world.swim ? world.tileAt(ftx, fty) : 3;
    const swTarget = ft === I.TILE.DEEP ? 1 : 0, swBefore = p.sw;
    p.sw += (swTarget - p.sw) * Math.min(1, dt * 7);
    if (Math.abs(swTarget - p.sw) < 0.01) p.sw = swTarget;
    p.wade = ft === I.TILE.SHALLOW;
    if ((swBefore < 0.5) !== (p.sw < 0.5)) ev.push({ type: 'splash', pid: p.id, x: p.x, y: p.y });
    if (p.sw > 0.3) { p.dashT = 0; p.swing = null; }

    if (p.dashCd > 0) p.dashCd -= dt;
    if (it.dash && p.dashCd <= 0 && p.dashT <= 0 && p.sw < 0.3 && !p.lunge) {
      if (len < 0.05) { const f = H.DIRVEC[p.dir]; mx = f[0]; my = f[1]; }
      const l = Math.hypot(mx, my) || 1;
      p.dashT = C.DASH_TIME; p.dashCd = C.DASH_COOLDOWN; p.dashDir = [mx / l, my / l];
      p.swing = null;
      ev.push({ type: 'dash', pid: p.id, x: p.x, y: p.y });
    }

    let vx, vy;
    if (p.dashT > 0) {
      p.dashT -= dt;
      vx = p.dashDir[0] * C.DASH_SPEED; vy = p.dashDir[1] * C.DASH_SPEED;
      if (((p.dashT * 60) | 0) % 3 === 0) ev.push({ type: 'dash', pid: p.id, x: p.x, y: p.y });
    } else if (p.lunge) {
      vx = p.lunge.vx; vy = p.lunge.vy; // élan d'une capacité
    } else {
      const k = (p.swing ? 0.5 : 1) * (1 - 0.4 * p.sw) * (p.wade ? 0.85 : 1) * I.combat.speedMul(p) * I.vitals.speedMul(p);
      vx = mx * C.PLAYER_SPEED * k; vy = my * C.PLAYER_SPEED * k;
    }

    const ox = p.x, oy = p.y;
    I.collision.moveEntity(world, p, vx * dt, vy * dt);
    p.moving = Math.abs(p.x - ox) + Math.abs(p.y - oy) > 0.01;

    if (!p.swing && p.dashT <= 0 && len > 0.05) p.dir = H.dirName(mx + (Math.abs(mx) === Math.abs(my) ? 0.001 : 0), my);
    if (p.dashT > 0 && !p.swing) p.dir = H.dirName(p.dashDir[0], p.dashDir[1]);

    if (p.moving) { p.animT += dt * (p.dashT > 0 ? 1.8 : p.sw > 0.5 ? 0.7 : 1); p.frame = Math.floor(p.animT * 8) % 4; } else { p.animT = 0; p.frame = 0; }

    // outils
    const seedHeld = p.inv.slots[p.sel] && I.ITEMS[p.inv.slots[p.sel].id] && I.ITEMS[p.inv.slots[p.sel].id].seed;
    if (it.use && seedHeld) { // graine en main : on plante sur la parcelle visée (pas de coup d'outil)
      if (p.buildCd <= 0 && p.sw < 0.5) {
        const t = I.building.tileFromAim(p, it.aim), r = I.farming.plant(state, p, p.sel, t[0], t[1], ev);
        p.buildCd = 0.2;
        if (!r.ok && p.msgCd <= 0) { p.msgCd = 0.8; ev.push({ type: 'msg', pid: p.id, text: I.farming.TEXT[r.reason] || 'Impossible ici.' }); }
      }
    } else if (it.use && p.dashT <= 0 && p.sw < 0.5 && !p.lunge && !I.combat.attack(state, p, it.aim, ev)) H.tryStartSwing(p, it.aim, ev); // arme forgée : combo ; sinon outil

    // construction : aperçu de la case visée, pose (clic gauche) et retrait (clic droit)
    if (p.buildCd > 0) p.buildCd -= dt;
    if (p.msgCd > 0) p.msgCd -= dt;
    const B = I.building, held = p.inv.slots[p.sel], hd = held && I.ITEMS[held.id];
    p.build = null;
    if (hd && hd.place) {
      const t = B.tileFromAim(p, it.aim), c = B.check(state, p, hd.place, t[0], t[1], hd.c | 0, held.id);
      p.build = { type: hd.place, c: hd.c | 0, tx: t[0], ty: t[1], ok: c.ok, reason: c.reason, n: c.n };
      if (it.use && p.buildCd <= 0) {
        if (c.ok) { B.place(state, p, p.sel, t[0], t[1], ev); p.buildCd = 0.14; }
        else if (p.msgCd <= 0) { ev.push({ type: 'msg', pid: p.id, text: B.msg(c) }); p.msgCd = 0.8; } // le message ne bloque pas un clic valide juste après
      }
    }
    const foodHeld = held && I.vitals.foodOf(held.id);
    if (it.remove && held && held.id === 'recipe_book') { // livre de recettes en main : clic droit pour l'ouvrir
      if (p.buildCd <= 0) { ev.push({ type: 'openCook', pid: p.id, station: null }); p.buildCd = 0.4; }
    } else if (it.remove && foodHeld) { // aliment en main : clic droit pour manger
      if (p.buildCd <= 0) { const r = I.vitals.eat(state, p, p.sel, ev); p.buildCd = 0.4; if (!r.ok && r.reason === 'full' && p.msgCd <= 0) { p.msgCd = 0.8; ev.push({ type: 'msg', pid: p.id, text: 'Je n’ai pas faim.' }); } }
    } else if (it.remove && p.buildCd <= 0) {
      const t = B.tileFromAim(p, it.aim), r = B.remove(state, p, t[0], t[1], ev);
      p.buildCd = 0.2;
      if (!r.ok && r.reason === 'notEmpty' && p.msgCd <= 0) { p.msgCd = 0.8; ev.push({ type: 'msg', pid: p.id, text: B.TEXT.notEmpty }); }
    }
    H.updateSwing(world, p, dt, state.time.minutes, ev);

    // interaction + cible affichée dans l'interface
    const tgt = H.findInteractable(world, p);
    p.target = tgt ? { id: tgt.id, label: tgt.def.label || 'Interagir' } : null;
    if (it.interact && tgt && !p.swing) H.interact(state, p, ev);

    H.collectDrops(world, p, dt, ev);
    I.crafting.checkUnlocks(state, p, ev);
  }

  I.Player = { create: newPlayer, giveStarterKit: giveStarterKit, update: update };
})((window.Iles = window.Iles || {}));
