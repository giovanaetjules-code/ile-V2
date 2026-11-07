/*
 * Constructions qui contiennent des objets : coffre (20 cases) et four (entrée, combustible, sortie).
 * Fonctions pures sur (monde, joueur, construction) : rien ne dépend de l'interface.
 */
(function (I) {
  const CHEST_SIZE = 20;
  const REACH = 80;
  // combustible -> secondes de chauffe ; fonte : minerai -> lingot
  const FUEL = { wood: 20, stick: 8, plank: 10, coal: 40, bamboo: 6 };
  const SMELT = {
    copper_ore: { need: 2, out: 'copper_bar', time: 6 }, iron_ore: { need: 2, out: 'iron_bar', time: 8 },
    silver_ore: { need: 2, out: 'silver_bar', time: 8 }, gold_ore: { need: 3, out: 'gold_bar', time: 10 },
  };
  I.ORES.forEach(function (o) { SMELT[o.id + '_ore'] = { need: o.need, out: o.id + '_bar', time: o.time }; });
  /** Fonte / combustible d'un objet, couleur comprise : un minerai jaune donne un lingot jaune. */
  function smeltOf(id) {
    const s = I.mat.split(id), sm = SMELT[s.base];
    return sm ? { need: sm.need, time: sm.time, out: I.mat.id(sm.out, s.c) } : null;
  }
  function fuelOf(id) { return FUEL[I.mat.split(id).base] || 0; }

  function newData(type) {
    if (type === 'chest') return { inv: new I.Inventory(CHEST_SIZE) };
    if (type === 'furnace') return { input: null, fuel: null, output: null, burn: 0, progress: 0, lit: false };
    if (type === 'plot') return { crop: null, t0: 0 };
    return null;
  }
  function stack(s) { return s && I.ITEMS[s.id] && s.qty > 0 ? { id: s.id, qty: Math.min(99, Math.floor(s.qty)) } : null; }

  function serializeData(o) {
    const d = o.data;
    if (!d) return null;
    if (o.type === 'chest') return { inv: d.inv.toJSON() };
    if (o.type === 'furnace') return { input: d.input, fuel: d.fuel, output: d.output, burn: d.burn, progress: d.progress };
    if (o.type === 'plot') return { crop: d.crop || null, t0: d.t0 };
    return null;
  }
  function restoreData(type, raw) {
    const d = newData(type);
    if (!d || !raw || typeof raw !== 'object') return d;
    if (type === 'chest') d.inv = I.Inventory.fromJSON(raw.inv, CHEST_SIZE);
    if (type === 'plot') { if (raw.crop && I.CROPS[raw.crop] && isFinite(raw.t0)) { d.crop = raw.crop; d.t0 = raw.t0; } }
    if (type === 'furnace') {
      d.input = stack(raw.input); d.fuel = stack(raw.fuel); d.output = stack(raw.output);
      d.burn = isFinite(raw.burn) ? Math.max(0, raw.burn) : 0; d.progress = isFinite(raw.progress) ? Math.max(0, raw.progress) : 0;
    }
    return d;
  }

  // ---------- fonte ----------
  function tickFurnace(d, dt) {
    const sm = d.input && smeltOf(d.input.id);
    const room = sm && (!d.output || (d.output.id === sm.out && d.output.qty < 99));
    if (!(sm && d.input.qty >= sm.need && room)) { d.progress = 0; d.lit = false; return; }
    if (d.burn <= 0) {
      if (d.fuel && fuelOf(d.fuel.id)) {
        d.burn = fuelOf(d.fuel.id); d.fuel.qty -= 1;
        if (d.fuel.qty <= 0) d.fuel = null;
      } else { d.lit = false; return; } // plus de combustible : la fonte attend
    }
    d.lit = true; d.burn -= dt; d.progress += dt;
    if (d.progress >= sm.time) {
      d.progress = 0;
      d.input.qty -= sm.need;
      if (d.input.qty <= 0) d.input = null;
      if (d.output) d.output.qty += 1; else d.output = { id: sm.out, qty: 1 };
    }
  }
  function tick(world, dt) {
    for (const o of world.structures) if (o.type === 'furnace' && o.data) tickFurnace(o.data, dt);
  }

  // ---------- transferts ----------
  function near(p, o) { return Math.hypot(p.x - o.x, (p.y - 6) - (o.y - 6)) <= REACH; }

  /** Joueur -> conteneur : déplace toute la pile de la case `i` du sac. */
  function put(p, o, i) {
    if (!near(p, o)) return { ok: false, reason: 'far' };
    const s = p.inv.slots[i];
    if (!s) return { ok: false, reason: 'empty' };
    const d = o.data;
    if (o.type === 'chest') {
      const left = d.inv.add(s.id, s.qty);
      if (left === s.qty) return { ok: false, reason: 'full' };
      s.qty = left; if (left <= 0) p.inv.slots[i] = null; p.inv.rev++;
      return { ok: true };
    }
    const slot = smeltOf(s.id) ? 'input' : fuelOf(s.id) ? 'fuel' : null;
    if (!slot) return { ok: false, reason: 'badItem' };
    const cur = d[slot];
    if (cur && cur.id !== s.id) return { ok: false, reason: 'occupied' };
    const n = Math.min(s.qty, 99 - (cur ? cur.qty : 0));
    if (n <= 0) return { ok: false, reason: 'full' };
    d[slot] = { id: s.id, qty: (cur ? cur.qty : 0) + n };
    s.qty -= n; if (s.qty <= 0) p.inv.slots[i] = null; p.inv.rev++;
    return { ok: true };
  }

  /** Conteneur -> joueur : `where` = index (coffre) ou 'input' | 'fuel' | 'output' (four). */
  function take(p, o, where) {
    if (!near(p, o)) return { ok: false, reason: 'far' };
    const d = o.data;
    if (o.type === 'chest') {
      const s = d.inv.slots[where];
      if (!s) return { ok: false, reason: 'empty' };
      const left = p.inv.add(s.id, s.qty);
      if (left === s.qty) return { ok: false, reason: 'invFull' };
      s.qty = left; if (left <= 0) d.inv.slots[where] = null; d.inv.rev++;
      return { ok: true };
    }
    const s = d[where];
    if (!s) return { ok: false, reason: 'empty' };
    const left = p.inv.add(s.id, s.qty);
    if (left === s.qty) return { ok: false, reason: 'invFull' };
    if (left <= 0) d[where] = null; else s.qty = left;
    if (where === 'input') d.progress = 0;
    return { ok: true };
  }

  function isEmpty(o) {
    const d = o.data;
    if (!d) return true;
    if (o.type === 'chest') return d.inv.slots.every(function (s) { return !s; });
    if (o.type === 'furnace') return !d.input && !d.fuel && !d.output;
    return true;
  }

  I.containers = { FUEL: FUEL, SMELT: SMELT, smeltOf: smeltOf, fuelOf: fuelOf, CHEST_SIZE: CHEST_SIZE, newData: newData, serializeData: serializeData, restoreData: restoreData, tick: tick, tickFurnace: tickFurnace, put: put, take: take, isEmpty: isEmpty };
})((window.Iles = window.Iles || {}));
