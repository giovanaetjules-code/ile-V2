/*
 * Armures : 4 pièces (casque, plastron, jambières, bottes) dans 11 matériaux. Une seule table : MATS (fibre, métaux, minerais des dimensions).
 * Les objets, les recettes (établi), la protection et l'équipement en sont déduits. Une pièce porte un nombre de points « ap » ;
 * la protection totale = somme des pièces équipées, convertie en réduction des dégâts : total / (total + 15), plafonnée à 75 %.
 * Ajouter un matériau : une ligne dans MATS (+ son lingot s'il en faut un).
 */
(function (I) {
  // ap : points d'un ensemble complet ; bar : lingot (ou null = fibre) ; learn : objet qui révèle la recette ; hid : recette secrète ; col : couleur de base
  const MATS = {
    fibre: { name: 'fibre', nat: 'tressée', ap: 2, bar: null, learn: 'rope', col: '#b89a5a' },
    copper: { name: 'cuivre', nat: 'de cuivre', ap: 4, bar: 'copper_bar', learn: 'copper_ore', col: '#d98a4a' },
    iron: { name: 'fer', nat: 'de fer', ap: 6, bar: 'iron_bar', learn: 'iron_ore', col: '#aeb4c0' },
    silver: { name: 'argent', nat: 'd’argent', ap: 7, bar: 'silver_bar', learn: 'silver_ore', col: '#e4e8ee', hid: true },
    gold: { name: 'or', nat: 'd’or', ap: 6, bar: 'gold_bar', learn: 'gold_ore', col: '#f2c14e', hid: true },
  };
  const DIM_AP = { cobalt: 9, mithril: 10, orichalque: 11, adamantite: 12, titane: 10, obscurium: 14 };
  I.ORES.forEach(function (o) {
    MATS[o.id] = { name: o.name, nat: o.art, ap: DIM_AP[o.id] || 8, bar: o.id + '_bar', learn: o.mix ? o.mix.map(function (m) { return m + '_ore'; }) : o.id + '_ore', col: o.c, hid: true, dim: true };
  });
  const MAT_ORDER = Object.keys(MATS);

  // part de protection, lingots, corde ; slot = clé de p.armor
  const PIECES = {
    helmet: { slot: 'head', name: 'Casque', share: 0.2, bars: 3, rope: 1 },
    chest: { slot: 'chest', name: 'Plastron', share: 0.4, bars: 6, rope: 1 },
    legs: { slot: 'legs', name: 'Jambières', share: 0.25, bars: 4, rope: 1 },
    boots: { slot: 'boots', name: 'Bottes', share: 0.15, bars: 3, rope: 1 },
  };
  const PIECE_ORDER = ['helmet', 'chest', 'legs', 'boots'];
  const SLOTS = ['head', 'chest', 'legs', 'boots'];
  const SLOT_LABEL = { head: 'Tête', chest: 'Torse', legs: 'Jambes', boots: 'Pieds' };
  const SLOT_PIECE = { head: 'helmet', chest: 'chest', legs: 'legs', boots: 'boots' };
  const FIBRE = { helmet: [2, 2], chest: [4, 6], legs: [3, 4], boots: [2, 2] }; // [corde, fibre]

  const DEF = {}, RECIPES = [], IDS = [];
  MAT_ORDER.forEach(function (mk) {
    const m = MATS[mk];
    PIECE_ORDER.forEach(function (pk) {
      const pc = PIECES[pk], id = pk + '_' + mk, ap = Math.max(1, Math.round(m.ap * pc.share));
      I.ITEMS[id] = { name: pc.name + ' en ' + m.name, desc: pc.name + ' ' + (mk === 'fibre' ? 'en fibre tressée' : m.nat) + '. Protection +' + ap + '. Équipe-le depuis ton sac.', stack: 1, armor: { slot: pc.slot, ap: ap, piece: pk, mat: mk } };
      I.ITEM_ORDER.push(id); DEF[id] = I.ITEMS[id].armor; IDS.push(id);
      const ins = mk === 'fibre' ? [['rope', FIBRE[pk][0]], ['fiber', FIBRE[pk][1]]] : [[m.bar, pc.bars], ['rope', pc.rope]];
      const learn = { item: m.learn, hint: mk === 'fibre' ? 'Fabrique de la corde.' : m.dim ? 'Trouve ce métal dans une dimension.' : 'Trouve du ' + (m.learn.replace('_ore', '') === 'copper' ? 'cuivre' : m.name) + '.' };
      RECIPES.push({ id: id, station: 'bench', any: true, hidden: !!m.hid, ins: ins, out: { id: id, qty: 1 }, learn: learn });
    });
  });

  const empty = function () { return { head: null, chest: null, legs: null, boots: null }; };
  /** Tient pour valides seulement des identifiants d'armure rangés dans le bon emplacement. */
  function sanitize(a) {
    const o = empty();
    if (a && typeof a === 'object') SLOTS.forEach(function (s) { const d = DEF[a[s]]; if (d && d.slot === s) o[s] = a[s]; });
    return o;
  }
  function total(p) { let t = 0; if (p && p.armor) SLOTS.forEach(function (s) { const d = DEF[p.armor[s]]; if (d) t += d.ap; }); return t; }
  /** Part des dégâts évitée (0 à 0,75). */
  function reduction(p) { const t = total(p); return Math.min(0.75, t / (t + 15)); }
  /** Clé courte de l'équipement (changement d'interface, cache de sprites). */
  function key(a) { return a ? SLOTS.map(function (s) { return a[s] || ''; }).join(',') : ',,,'; }
  /** Matériau porté par emplacement, pour dessiner : 'iron|||' */
  function look(a) { return a ? SLOTS.map(function (s) { return DEF[a[s]] ? DEF[a[s]].mat : ''; }).join(',') : ',,,'; }

  /** Équipe la pièce de la case i du sac (échange avec celle déjà portée). */
  function equip(p, i) {
    const s = p.inv.slots[i], d = s && DEF[s.id];
    if (!d) return { ok: false, reason: 'bad' };
    if (!p.armor) p.armor = empty();
    const old = p.armor[d.slot];
    p.armor[d.slot] = s.id; p.inv.slots[i] = old ? { id: old, qty: 1 } : null; p.inv.rev++;
    return { ok: true };
  }
  /** Retire la pièce d'un emplacement ; elle retourne dans le sac s'il y a de la place. */
  function unequip(p, slot) {
    const id = p.armor && p.armor[slot];
    if (!id) return { ok: false, reason: 'bad' };
    if (p.inv.add(id, 1) > 0) return { ok: false, reason: 'full' };
    p.armor[slot] = null;
    return { ok: true };
  }

  I.ARMOR = { MATS: MATS, MAT_ORDER: MAT_ORDER, PIECES: PIECES, PIECE_ORDER: PIECE_ORDER, SLOTS: SLOTS, SLOT_LABEL: SLOT_LABEL, SLOT_PIECE: SLOT_PIECE, DEF: DEF, IDS: IDS, RECIPES: RECIPES };
  I.armor = { empty: empty, sanitize: sanitize, total: total, reduction: reduction, key: key, look: look, equip: equip, unequip: unequip };
})((window.Iles = window.Iles || {}));
