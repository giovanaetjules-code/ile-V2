/*
 * Tables d'enchantement et de désenchantement : validation et exécution (hôte ou solo ; les invités passent par la commande).
 *   { t:'enchant', i:<case de l'arme>, s:[<cases de pierres>] }  : 1 ou 2 pierres (2 au total sur l'arme) ; l'arme garde sa case
 *   { t:'disenchant', i:<case de l'arme> }                       : l'arme redevient l'arme de base, les pierres reviennent dans le sac
 * Rien n'est modifié si l'opération échoue (sac plein, pierre invalide…). Raisons : bad, far, weapon, stone, slots, full.
 */
(function (I) {
  const E = I.ENCH;

  /** Table du bon type à moins de REACH du joueur (renvoie l'objet ou null). */
  function tableNear(state, p, type) {
    for (const o of state.world.objectsIn(p.x - E.REACH, p.y - E.REACH, p.x + E.REACH, p.y + E.REACH)) {
      if (o.type === type && Math.hypot(o.x - p.x, o.y - p.y) < E.REACH) return o;
    }
    return null;
  }
  /** Y a-t-il de la place pour toutes ces pierres (liste d'identifiants) ? On compte les piles existantes et les cases vides. */
  function room(inv, ids) {
    const need = {}; ids.forEach(function (id) { need[id] = (need[id] || 0) + 1; });
    let empty = 0; for (const s of inv.slots) if (!s) empty++;
    for (const id in need) {
      let free = 0; for (const s of inv.slots) if (s && s.id === id) free += Math.max(0, inv.stackMax(id) - s.qty);
      const rest = need[id] - free;
      if (rest > 0) empty -= Math.ceil(rest / inv.stackMax(id));
    }
    return empty >= 0;
  }
  /** Pierres déjà posées sur une arme (liste d'identifiants), [] si elle n'est pas enchantée. */
  function stonesOf(id) {
    const at = String(id).indexOf('@'); if (at < 0) return [];
    const e = E.parse(id.slice(at + 1)); return e ? e.stones : [];
  }

  function enchant(state, p, cmd, ev) {
    const inv = p.inv, o = tableNear(state, p, 'enchant_table');
    if (!o) return { ok: false, reason: 'far' };
    const wi = cmd.i, si = cmd.s;
    if (!Number.isInteger(wi) || wi < 0 || wi >= inv.size || !Array.isArray(si) || si.length < 1 || si.length > E.MAX_SLOTS) return { ok: false, reason: 'bad' };
    const w = inv.slots[wi], a = w && I.forge.weapon(w.id);
    if (!a) return { ok: false, reason: 'weapon' };
    const add = [];
    for (const i of si) { // une même case peut être citée deux fois si sa pile le permet (vérifié plus bas)
      if (!Number.isInteger(i) || i < 0 || i >= inv.size) return { ok: false, reason: 'bad' };
      const s = inv.slots[i];
      if (!s || !E.STONES[s.id]) return { ok: false, reason: 'stone' };
      add.push(s.id);
    }
    const use = {}; si.forEach(function (i) { use[i] = (use[i] || 0) + 1; });
    for (const i in use) if (inv.slots[i].qty < use[i]) return { ok: false, reason: 'stone' };
    const all = stonesOf(w.id).concat(add);
    if (all.length > E.MAX_SLOTS) return { ok: false, reason: 'slots' };
    const nid = E.idWith(w.id, all);
    if (!nid || !I.forge.weapon(nid)) return { ok: false, reason: 'bad' };
    for (const i in use) { inv.slots[i].qty -= use[i]; if (inv.slots[i].qty <= 0) inv.slots[i] = null; }
    inv.slots[wi] = { id: nid, qty: 1 }; inv.rev++;
    const e = E.parse(nid.split('@')[1]);
    ev.push({ type: 'enchant', pid: p.id, oid: o.id, x: o.x, y: o.y, els: e.order, name: I.forge.weapon(nid).name, dis: false });
    return { ok: true, id: nid };
  }

  function disenchant(state, p, cmd, ev) {
    const inv = p.inv, o = tableNear(state, p, 'disenchant_table');
    if (!o) return { ok: false, reason: 'far' };
    const wi = cmd.i;
    if (!Number.isInteger(wi) || wi < 0 || wi >= inv.size) return { ok: false, reason: 'bad' };
    const w = inv.slots[wi], a = w && I.forge.weapon(w.id), stones = w ? stonesOf(w.id) : [];
    if (!a || !stones.length) return { ok: false, reason: 'weapon' };
    if (!room(inv, stones)) return { ok: false, reason: 'full' };
    const e = a.ench;
    inv.slots[wi] = { id: E.baseOf(w.id), qty: 1 };
    stones.forEach(function (id) { inv.add(id, 1); });
    inv.rev++;
    ev.push({ type: 'enchant', pid: p.id, oid: o.id, x: o.x, y: o.y, els: e ? e.order : [], name: I.forge.weapon(inv.slots[wi].id).name, dis: true });
    return { ok: true, id: inv.slots[wi].id, stones: stones };
  }

  I.enchant = { tableNear: tableNear, room: room, stonesOf: stonesOf, enchant: enchant, disenchant: disenchant,
    run: function (state, p, cmd, ev) { return cmd.t === 'enchant' ? enchant(state, p, cmd, ev) : disenchant(state, p, cmd, ev); } };
})((window.Iles = window.Iles || {}));
