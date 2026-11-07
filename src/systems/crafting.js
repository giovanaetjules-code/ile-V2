/*
 * Recettes et fabrication. Tout est fonction pure de (state, player) + événements : aucune dépendance au DOM,
 * ce qui permettra plus tard de valider une demande de fabrication côté serveur.
 *
 *  station : 'hand' (fabricable partout, touche C) ou 'bench' (à l'établi du monde)
 *  learn   : condition de découverte { item } ; absent = connue dès le départ
 *  out     : { id, qty } ou, pour kind 'upgrade', un effet instantané et unique
 */
(function (I) {
  const C = I.config;

  const RECIPES = [
    { id: 'plank', station: 'hand', ins: [['wood', 1]], out: { id: 'plank', qty: 2 } },
    { id: 'rope', station: 'hand', ins: [['fiber', 3]], out: { id: 'rope', qty: 1 } },
    { id: 'torch', station: 'hand', ins: [['stick', 1], ['fiber', 1]], out: { id: 'torch', qty: 1 } },
    { id: 'fence', station: 'hand', ins: [['plank', 1], ['stick', 1]], out: { id: 'fence', qty: 2 } },
    { id: 'floor_wood', station: 'hand', ins: [['plank', 1]], out: { id: 'floor_wood', qty: 2 } },
    { id: 'path_stone', station: 'hand', ins: [['stone', 1]], out: { id: 'path_stone', qty: 2 } },
    { id: 'workbench', station: 'hand', ins: [['plank', 10], ['stone', 2]], out: { id: 'workbench', qty: 1 } },
    { id: 'chest', station: 'bench', ins: [['plank', 8]], out: { id: 'chest', qty: 1 } },
    { id: 'furnace', station: 'bench', ins: [['stone', 12], ['wood', 2]], out: { id: 'furnace', qty: 1 } },
    { id: 'bed', station: 'bench', ins: [['plank', 6], ['fiber', 8]], out: { id: 'bed', qty: 1 } },
    { id: 'lamp', station: 'bench', ins: [['plank', 2], ['torch', 1]], out: { id: 'lamp', qty: 1 }, learn: { item: 'torch', hint: 'Fabrique une torche.' } },
    { id: 'axe_copper', station: 'bench', ins: [['plank', 2], ['rope', 1], ['copper_bar', 2]], out: { id: 'axe_copper', qty: 1 }, learn: { item: 'copper_ore', hint: 'Trouve du minerai de cuivre.' } },
    { id: 'pickaxe_copper', station: 'bench', ins: [['plank', 2], ['rope', 1], ['copper_bar', 3]], out: { id: 'pickaxe_copper', qty: 1 }, learn: { item: 'copper_ore', hint: 'Trouve du minerai de cuivre.' } },
    { id: 'axe_iron', station: 'bench', ins: [['plank', 2], ['rope', 1], ['iron_bar', 2]], out: { id: 'axe_iron', qty: 1 }, learn: { item: 'iron_ore', hint: 'Trouve du minerai de fer.' } },
    { id: 'pickaxe_iron', station: 'bench', ins: [['plank', 2], ['rope', 1], ['iron_bar', 3]], out: { id: 'pickaxe_iron', qty: 1 }, learn: { item: 'iron_ore', hint: 'Trouve du minerai de fer.' } },
    { id: 'bag2', station: 'bench', kind: 'upgrade', name: 'Sac renforcé', desc: 'Ajoute 8 cases à ton sac. Une seule fois.', icon: 'icon_bag2', extra: 8, ins: [['rope', 3], ['plank', 4], ['fiber', 6]], flag: 'bag2', learn: { item: 'rope', hint: 'Fabrique de la corde.' } },
    { id: 'bag3', station: 'bench', kind: 'upgrade', name: 'Sac de voyageur', desc: 'Ajoute 12 cases à ton sac. Il faut d’abord le Sac renforcé. Une seule fois.', icon: 'icon_bag3', extra: 12, req: 'bag2', ins: [['rope', 5], ['plank', 4], ['fiber', 12], ['iron_bar', 3]], flag: 'bag3', learn: { item: 'iron_bar', hint: 'Fonds du minerai de fer en lingot.' } },
  ];
  I.DECOR_RECIPES.forEach(function (r) { RECIPES.push(r); });
  RECIPES.push(I.FORGE.TABLE_RECIPE, I.ENCH.TABLE_RECIPE, I.ENCH.DISENCHANT_RECIPE);
  // minerais des dimensions : outils de leur métal ; l'obscurium se fabrique à l'établi à partir de trois autres minerais.
  // `any` : les ingrédients colorables sont acceptés dans n'importe quelle couleur (les minerais des dimensions sont colorés, les outils non).
  I.ORES.forEach(function (o) {
    const hint = o.mix ? 'Trouve du minerai de cobalt, de mithril ou d’adamantite.' : 'Trouve du minerai ' + o.art + ' dans une dimension.';
    const learn = { item: o.mix ? o.mix.map(function (m) { return m + '_ore'; }) : o.id + '_ore', hint: hint };
    if (o.mix) RECIPES.push({ id: o.id + '_ore', station: 'bench', any: true, hidden: true, ins: o.mix.map(function (m) { return [m + '_ore', 2]; }), out: { id: o.id + '_ore', qty: 1 }, learn: learn });
    RECIPES.push({ id: 'axe_' + o.id, station: 'bench', any: true, hidden: true, ins: [['plank', 2], ['rope', 1], [o.id + '_bar', 2]], out: { id: 'axe_' + o.id, qty: 1 }, learn: learn });
    RECIPES.push({ id: 'pickaxe_' + o.id, station: 'bench', any: true, hidden: true, ins: [['plank', 2], ['rope', 1], [o.id + '_bar', 3]], out: { id: 'pickaxe_' + o.id, qty: 1 }, learn: learn });
  });
  I.ARMOR.RECIPES.forEach(function (r) { RECIPES.push(r); });
  const BY_ID = {};
  RECIPES.forEach(function (r) { BY_ID[r.id] = r; });

  const BAG_EXTRA = 8;
  // icônes des sacs (objets d'illustration seulement : on ne les obtient jamais)
  I.ITEMS.icon_bag2 = { name: 'Sac renforcé', desc: 'Illustration.', stack: 1, ui: true }; I.ITEMS.icon_bag3 = { name: 'Sac de voyageur', desc: 'Illustration.', stack: 1, ui: true };
  I.ITEM_ORDER.push('icon_bag2', 'icon_bag3');

  /*
   * Couleur du matériau : une recette « colorable » (son résultat existe en 16 couleurs) se fabrique avec des matériaux de la couleur c
   * (bois jaune + pierre jaune → table jaune). c = 0 : matériaux naturels. Les ingrédients non colorables (torche…) ne changent pas.
   */
  function colorOk(r, c) { return !c || (!!r.out && I.mat.colorable(r.out.id) && r.ins.some(function (g) { return I.mat.colorable(g[0]); })); }
  function insOf(r, c) { return c ? r.ins.map(function (g) { return [I.mat.id(g[0], c), g[1]]; }) : r.ins; }
  function outIdOf(r, c) { return r.out ? I.mat.id(r.out.id, c) : null; }
  function nameOf(r, c) { return c && r.out ? I.ITEMS[outIdOf(r, c)].name : (r.name || I.ITEMS[r.out.id].name); }
  function descOf(r, c) { return r.desc || I.ITEMS[c ? outIdOf(r, c) : r.out.id].desc; }
  function iconOf(r) { return r.icon || r.out.id; }
  function isDone(state, r) { return !!(r.flag && state.progress.flags[r.flag]); }
  function isKnown(state, r) { return !r.learn || state.progress.recipes.includes(r.id); }
  /** Une recette de l'établi n'apparaît pas dans le menu « à la main ». */
  function available(station, r) { return station === 'bench' || r.station === 'hand'; }

  /** Quantité possédée d'un ingrédient (toutes couleurs confondues pour les recettes `any`). */
  function have(p, r, id) {
    if (!r.any || !I.mat.colorable(id)) return p.inv.count(id);
    let n = 0;
    for (let c = 0; c <= I.COLORS.length; c++) n += p.inv.count(I.mat.id(id, c));
    return n;
  }
  function missing(p, r, c) {
    const out = [];
    for (const ing of insOf(r, c | 0)) { const h = have(p, r, ing[0]); if (h < ing[1]) out.push({ id: ing[0], need: ing[1], have: h }); }
    return out;
  }

  function seen(p, item) {
    for (let c = 0, n = I.mat.colorable(item) ? I.COLORS.length : 0; c <= n; c++) {
      const id = I.mat.id(item, c);
      if (p.inv.count(id) > 0 || (p.stats['got_' + id] | 0) > 0) return true;
    }
    return false;
  }

  /** Débloque les recettes dont la condition est remplie ; émet un événement 'learn' pour chacune. */
  function checkUnlocks(state, p, ev) {
    for (const r of RECIPES) {
      if (!r.learn || state.progress.recipes.includes(r.id)) continue;
      if ([].concat(r.learn.item).some(function (it) { return seen(p, it); })) {
        state.progress.recipes.push(r.id);
        ev.push({ type: 'learn', pid: p.id, recipe: r.id, name: nameOf(r) });
      }
    }
  }

  /**
   * Fabrique une recette. Retire les ingrédients seulement si le résultat tient dans le sac ;
   * sinon l'inventaire est laissé strictement intact.
   * @returns {{ok:boolean, reason?:string}}
   */
  function craft(state, p, id, station, ev, c) {
    const r = BY_ID[id];
    c = c | 0;
    if (!r) return { ok: false, reason: 'unknown' };
    if (c < 0 || c > I.COLORS.length || !colorOk(r, c)) return { ok: false, reason: 'color' };
    if (!available(station, r)) return { ok: false, reason: 'station' };
    if (!isKnown(state, r)) return { ok: false, reason: 'locked' };
    if (isDone(state, r)) return { ok: false, reason: 'done' };
    if (r.req && !state.progress.flags[r.req]) return { ok: false, reason: 'req' };
    if (missing(p, r, c).length) return { ok: false, reason: 'ingredients' };

    const backup = p.inv.toJSON(), size = p.inv.size;
    for (const ing of insOf(r, c)) takeItems(p.inv, ing[0], ing[1], r.any);
    if (r.kind === 'upgrade') {
      p.inv.resize(size + (r.extra || BAG_EXTRA));
      state.progress.flags[r.flag] = true;
    } else {
      const oid = outIdOf(r, c), left = p.inv.add(oid, r.out.qty);
      if (left > 0) { restore(p.inv, backup, size); return { ok: false, reason: 'full' }; }
      p.stats['got_' + oid] = (p.stats['got_' + oid] | 0) + r.out.qty;
    }
    p.stats['crafted_' + r.id] = (p.stats['crafted_' + r.id] | 0) + 1;
    ev.push({ type: 'craft', pid: p.id, recipe: r.id, name: nameOf(r, c), qty: r.out ? r.out.qty : 1 });
    checkUnlocks(state, p, ev);
    return { ok: true };
  }

  function takeItems(inv, id, qty, any) {
    let left = qty;
    const ids = any && I.mat.colorable(id) ? I.COLORS.map(function (c, i) { return I.mat.id(id, i + 1); }).reverse().concat([id]) : [id]; // les couleurs d'abord, la matière naturelle en dernier
    for (const want of ids) {
      for (let i = inv.size - 1; i >= 0 && left > 0; i--) { // on vide d'abord le sac, pas la barre rapide
        const s = inv.slots[i];
        if (s && s.id === want) { left -= inv.take(i, left); }
      }
    }
  }

  function restore(inv, backup, size) {
    inv.resize(size);
    for (let i = 0; i < inv.size; i++) inv.slots[i] = backup[i] ? { id: backup[i].id, qty: backup[i].qty } : null;
    inv.rev++;
  }

  I.crafting = {
    RECIPES: RECIPES, BY_ID: BY_ID, BAG_EXTRA: BAG_EXTRA,
    colorOk: colorOk, insOf: insOf, outIdOf: outIdOf, nameOf: nameOf, descOf: descOf, iconOf: iconOf, isDone: isDone, isKnown: isKnown, available: available,
    have: have, missing: missing, checkUnlocks: checkUnlocks, craft: craft,
  };
})((window.Iles = window.Iles || {}));
