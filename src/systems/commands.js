/*
 * Commandes de l'interface (inventaire, artisanat, coffres) : une seule voie pour le jeu solo, l'hôte et les invités.
 * run(état, idJoueur, commande, événements) valide tout : en coop, c'est l'hôte qui l'exécute pour le compte de l'invité.
 */
(function (I) {
  const C = I.config;
  const BAD = { ok: false, reason: 'bad' };
  const idx = function (v, max) { return Number.isInteger(v) && v >= 0 && v < max; };

  function nearBench(state, p) {
    for (const o of state.world.objectsIn(p.x - 100, p.y - 100, p.x + 100, p.y + 100)) {
      if (o.type === 'workbench' && Math.hypot(o.x - p.x, o.y - p.y) < 100) return true;
    }
    return false;
  }

  function run(state, pid, cmd, ev) {
    const p = state.players[pid];
    if (!p || !cmd || typeof cmd !== 'object') return BAD;
    const inv = p.inv, w = state.world;
    switch (cmd.t) {
      case 'move': if (!idx(cmd.a, inv.size) || !idx(cmd.b, inv.size)) return BAD; inv.move(cmd.a, cmd.b); return { ok: true };
      case 'sort': inv.sort(C.HOTBAR_SIZE); return { ok: true };
      case 'throw': if (!idx(cmd.i, inv.size)) return BAD; return { ok: !!I.harvest.throwStack(w, p, cmd.i) };
      case 'sel': if (!idx(cmd.n, C.HOTBAR_SIZE)) return BAD; p.sel = cmd.n; return { ok: true };
      case 'avatar': p.av = I.avatar.sanitize(cmd.av); return { ok: true };
      case 'enchant': case 'disenchant': return I.enchant.run(state, p, cmd, ev);
      case 'equip': if (!idx(cmd.i, inv.size)) return BAD; return I.armor.equip(p, cmd.i);
      case 'unequip': return I.ARMOR.SLOTS.includes(cmd.s) ? I.armor.unequip(p, cmd.s) : BAD;
      case 'unlock': I.crafting.checkUnlocks(state, p, ev); return { ok: true };
      case 'craft': {
        const id = String(cmd.id), station = cmd.station === 'bench' ? 'bench' : 'hand';
        if (!I.crafting.BY_ID[id]) return BAD;
        if (station === 'bench' && !nearBench(state, p)) return { ok: false, reason: 'station' };
        const c = cmd.c === undefined ? 0 : cmd.c;
        if (!idx(c, I.COLORS.length + 1)) return BAD;
        return I.crafting.craft(state, p, id, station, ev, c);
      }
      case 'forge': {
        const o = w.byId.get(String(cmd.id));
        if (!o || o.type !== 'forge_table' || Math.hypot(p.x - o.x, p.y - o.y) > I.FORGE.REACH) return o ? { ok: false, reason: 'far' } : BAD;
        return I.forge.craft(state, p, String(cmd.model), cmd.slots, ev);
      }
      case 'cook': case 'repro': return I.cooking.run(state, p, cmd, ev);
      case 'put': case 'take': {
        const o = w.byId.get(String(cmd.id));
        if (!o || !o.data) return BAD;
        if (cmd.t === 'put') return idx(cmd.i, inv.size) ? I.containers.put(p, o, cmd.i) : BAD;
        const where = cmd.where;
        if (typeof where !== 'number' && where !== 'input' && where !== 'fuel' && where !== 'output') return BAD;
        return I.containers.take(p, o, where);
      }
    }
    return BAD;
  }

  I.commands = { run: run };
})((window.Iles = window.Iles || {}));
