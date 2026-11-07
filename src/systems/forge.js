/*
 * Table du Forgeron : LOGIQUE. Fonctions pures (aucun DOM) : classer un matériau, vérifier qu'il convient à une partie, calculer les
 * statistiques, fabriquer. Données : content/forge-data.js ; forme : systems/forge-geometry.js ; dessin et textures : rendering/forge-art.js.
 *
 * Le joueur choisit d'abord un MODÈLE d'arme (épée, dague, lance, hache, masse), puis place un matériau par emplacement : chaque
 * emplacement est une partie du modèle (poignée, garde, lame…). Les matériaux fixent la couleur, la texture et les statistiques.
 *
 * Une arme est un objet d'inventaire dont l'identifiant EST sa recette : « wp:sword:stick,stick,iron_bar~blue ».
 * Même modèle + mêmes matériaux dans le même ordre = même arme, partout (sac, coffre, sauvegarde, coop) sans stockage supplémentaire :
 * la fiche de l'objet est recalculée à la demande (I.ITEMS est enveloppé d'un proxy qui reconnaît ces identifiants).
 */
(function (I) {
  const F = I.FORGE, G = I.forgeGeo;
  const PREFIX = 'wp:';
  const WOODY = { stick: 1, wood: 1, plank: 1, rope: 1 };

  // ---------- 1. matériaux ----------
  /** Un objet d'inventaire est-il un matériau de forge autorisé ? -> { ok, base, c, m } ou { ok:false, cat } */
  function classify(id) {
    if (typeof id !== 'string' || id.indexOf(PREFIX) === 0) return { ok: false, cat: 'misc' };
    const s = I.mat.split(id), m = F.MAT[s.base];
    if (!m || !I.ITEMS[id]) return { ok: false, cat: 'misc' };
    if (!F.CATEGORIES[m.cat] || m.res === undefined) return { ok: false, cat: m.cat };
    return { ok: true, base: s.base, c: s.c, m: m };
  }
  function accepts(id) { return classify(id).ok; }
  /** Le matériau `id` peut-il former la partie `slot` (0..2) du modèle ? */
  function fits(model, slot, id) {
    const M = F.MODELS[model], k = classify(id);
    return !!(M && k.ok && M.slots[slot] && F.PARTS[k.m.kind].indexOf(M.slots[slot].role) >= 0);
  }

  // ---------- 2. noms ----------
  const NOUN = { stick: 'bois', wood: 'bois', plank: 'bois', bamboo: 'bambou', stone: 'pierre', crystal: 'cristal', copper: 'cuivre', iron: 'fer', silver: 'argent', gold: 'or', cobalt: 'cobalt', mithril: 'mithril', orichalque: 'orichalque', adamantite: 'adamantite', titane: 'titane', obscurium: 'obscurium', rope: 'corde' };
  function matNoun(base) { return NOUN[base.replace(/_(bar|ore)$/, '')] || 'matériau'; }
  function de(n) { return /^[aeiouyéèh]/.test(n) ? 'd’' + n : 'en ' + n; }

  // ---------- 3. analyse ----------
  /**
   * Assemble un modèle et trois emplacements (identifiants d'objets ou null). Renvoie toujours de quoi dessiner l'aperçu (cells, pieces),
   * même incomplet : les emplacements vides restent des « fantômes ».
   * @returns {{ok:boolean, reason?:string, slot?:number, model, cells, pieces, id?, name?, type?, stats?, rarity?, tags?}}
   * reason : 'model' | 'incompatible' (slot fautif) | 'part' (slot : cette matière ne convient pas à cette partie) | 'incomplete'
   */
  function analyze(model, slots) {
    const M = F.MODELS[model];
    if (!M) return { ok: false, reason: 'model', model: model, cells: [], pieces: [null, null, null] };
    const pieces = [null, null, null];
    let err = null;
    for (let i = 0; i < 3; i++) {
      const id = slots && slots[i];
      if (!id) continue;
      const k = classify(id);
      if (!k.ok) { err = err || { reason: 'incompatible', slot: i }; continue; }
      if (F.PARTS[k.m.kind].indexOf(M.slots[i].role) < 0) { err = err || { reason: 'part', slot: i, kind: k.base }; continue; }
      pieces[i] = { slot: i, id: id, base: k.base, c: k.c, m: k.m, kind: k.m.kind };
    }
    const cells = G.build(model), out = { ok: false, model: model, cells: cells, pieces: pieces };
    if (err) return Object.assign(out, err);
    if (pieces.some(function (p) { return !p; })) return Object.assign(out, { reason: 'incomplete', missing: pieces.map(function (p, i) { return p ? -1 : i; }).filter(function (i) { return i >= 0; }) });

    const stats = statsOf(F.TYPES[M.type], pieces, cells), main = pieces[2];
    const colors = {}; pieces.forEach(function (p) { if (p.c) colors[p.c] = 1; });
    const nc = Object.keys(colors).length, woodOnly = pieces.every(function (p) { return WOODY[p.kind]; });
    const name = M.name + (woodOnly ? ' rudimentaire' : '') + ' ' + de(matNoun(main.base) + (main.kind === 'ore' ? ' brut' : '')) +
      (nc > 1 ? ' multicolore' : nc === 1 ? ' ' + I.COLORS[+Object.keys(colors)[0] - 1].name.toLowerCase() : '');
    const tags = []; pieces.forEach(function (p) { if (p.m.tag && tags.indexOf(p.m.tag) < 0) tags.push(p.m.tag); });
    return Object.assign(out, { ok: true, id: PREFIX + model + ':' + pieces.map(function (p) { return p.id; }).join(','), name: name, type: M.type, typeName: M.name, stats: stats, rarity: stats.rarity, tags: tags, colors: nc });
  }

  // poids de chaque station : [puissance offensive, structure, poids]
  const SW = { pommel: [0.3, 0.6, 1], grip: [0.1, 1, 0.8], shaft: [0.25, 1, 0.9], guard: [0.2, 0.8, 1], collar: [0.2, 0.6, 0.8], blade: [1.2, 1.4, 1], head: [1.4, 1.6, 1.4], tip: [1.3, 1, 0.6] };
  function statsOf(T, pieces, cells) {
    let fa = 0, fd = 0, atk = 0, str = 0, wt = 0, rar = 0, area = 0;
    const share = [0, 0, 0];
    for (const c of cells) {
      if (c.part < 0) continue; // détails fixes (éclats, ombres)
      const p = pieces[c.part], w = SW[c.st] || SW.shaft;
      atk += p.m.atk * w[0]; fa += w[0];
      str += (p.m.sol * 0.6 + p.m.res * 0.4) * w[1]; fd += w[1];
      wt += p.m.wt * w[2]; rar += p.m.rar; area++;
      share[c.part]++;
    }
    const bonus = { dmg: 0, dur: 0, spd: 0 };
    pieces.forEach(function (p, i) { // un effet spécial pèse comme la part de l'arme qui en est faite
      const f = p.m.fx, s = share[i] / area;
      if (f) { bonus.dmg += (f.dmg || 0) * s; bonus.dur += (f.dur || 0) * s; bonus.spd += (f.spd || 0) * s; }
    });
    const dmg = Math.max(1, Math.round((atk / fa) * T.dmg * 2 * (1 + bonus.dmg)));
    const dur = Math.max(5, Math.round((str / fd) * 10 * (1 + bonus.dur)));
    const weight = Math.round(wt * 0.08 * 10) / 10;
    const spd = Math.max(0.4, Math.min(2.2, Math.round((T.spd * (1.15 - 0.04 * weight) + bonus.spd) * 100) / 100));
    const maxR = Math.max.apply(null, pieces.map(function (p) { return p.m.rar; })), score = 0.35 * maxR + 0.65 * (rar / area);
    const rk = F.RARITY.find(function (x) { return score < x[0]; });
    return { dmg: dmg, dur: dur, wt: weight, spd: spd, score: Math.round(score * 100) / 100, rarity: { name: rk[1], color: rk[2] } };
  }

  // ---------- 4. objet d'inventaire (fiche recalculée à la demande) ----------
  const cache = new Map();
  /** « wp:sword:a,b,c » -> analyse (ou null si invalide). */
  function decode(id) {
    if (typeof id !== 'string' || id.indexOf(PREFIX) !== 0 || id.length > 180) return null;
    const at = id.indexOf('@'), ench = at < 0 ? null : I.ENCH.parse(id.slice(at + 1)); // « …@fl.sh » : arme enchantée (voir content/enchant-data.js)
    if (at >= 0 && !ench) return null;
    const bid = at < 0 ? id : id.slice(0, at);
    const body = bid.slice(PREFIX.length), c = body.indexOf(':');
    const parts = (c < 0 ? body : body.slice(c + 1)).split(',');
    if (parts.length !== 3) return null;
    if (c < 0) return null;
    const a = analyze(body.slice(0, c), parts);
    if (!a.ok || a.id !== bid) return null;
    if (!ench) return a;
    const st = Object.assign({}, a.stats, { dmg: Math.max(a.stats.dmg + 1, Math.round(a.stats.dmg * ench.dmgMul)), base: a.stats.dmg });
    return Object.assign({}, a, { id: id, baseId: bid, ench: ench, name: a.name + ench.suffix, stats: st });
  }
  function weapon(id) {
    if (!cache.has(id)) cache.set(id, decode(id));
    return cache.get(id);
  }
  function describe(a) {
    const s = a.stats;
    return a.typeName + ' · ' + s.rarity.name + '. Dégâts ' + s.dmg + ', durabilité ' + s.dur + ', poids ' + s.wt + ', vitesse ' + s.spd + '/s.' + (a.tags.length ? ' (' + a.tags.join(', ') + ')' : '') + (a.ench ? ' Enchantée (' + a.ench.order.map(function (k) { return I.ENCH.ELEM[k].name; }).join(' + ') + ') : +' + a.ench.bonus + ' % de dégâts.' : '');
  }
  function itemOf(id) {
    const a = weapon(id);
    return a ? { name: a.name, desc: describe(a), stack: 1, weapon: true, rarity: a.stats.rarity } : undefined;
  }
  // I.ITEMS reconnaît désormais les armes : tout le jeu (sac, coffre, sauvegarde, coop) les accepte sans changement.
  const base = I.ITEMS;
  I.ITEMS = new Proxy(base, { get: function (t, k) { if (typeof k === 'string' && k.length > 3 && k.charCodeAt(2) === 58) { if (k.charCodeAt(0) === 119 && k.indexOf(PREFIX) === 0) return itemOf(k); if (k.indexOf('fd:') === 0 && I.dishItem) return I.dishItem(k); } return t[k]; } });

  // ---------- 5. fabrication ----------
  function restore(inv, backup, size) { inv.slots = I.Inventory.fromJSON(backup, size).slots; inv.size = size; inv.rev++; }
  /**
   * Fabrique l'arme du modèle choisi avec les trois emplacements. Les matériaux ne sont retirés qu'ici, et seulement si l'arme tient dans le sac.
   * @returns {{ok:boolean, reason?:string, slot?:number, id?:string, name?:string}}
   */
  function craft(state, p, model, slots, ev) {
    if (!Array.isArray(slots) || slots.length !== 3 || !F.MODELS[model]) return { ok: false, reason: 'bad' };
    const ids = slots.map(function (s) { return typeof s === 'string' && s ? s : null; });
    const a = analyze(model, ids);
    if (!a.ok) return { ok: false, reason: a.reason, slot: a.slot };
    const need = {};
    ids.forEach(function (id) { need[id] = (need[id] || 0) + 1; });
    for (const id of Object.keys(need)) if (p.inv.count(id) < need[id]) return { ok: false, reason: 'ingredients' };
    const backup = p.inv.toJSON(), size = p.inv.size;
    for (const id of Object.keys(need)) {
      let left = need[id];
      for (let i = p.inv.size - 1; i >= 0 && left > 0; i--) if (p.inv.slots[i] && p.inv.slots[i].id === id) left -= p.inv.take(i, left);
    }
    if (p.inv.add(a.id, 1) > 0) { restore(p.inv, backup, size); return { ok: false, reason: 'full' }; }
    p.stats['got_' + a.id] = (p.stats['got_' + a.id] | 0) + 1;
    p.stats.forged = (p.stats.forged | 0) + 1;
    ev.push({ type: 'craft', pid: p.id, recipe: 'forge', name: a.name, qty: 1 });
    return { ok: true, id: a.id, name: a.name };
  }

  I.forge = { PREFIX: PREFIX, classify: classify, accepts: accepts, fits: fits, analyze: analyze, weapon: weapon, craft: craft, describe: describe };
})((window.Iles = window.Iles || {}));
