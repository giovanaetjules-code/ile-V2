/*
 * Cuisine et alchimie : plats procéduraux, mélange réel des couleurs, effets, portions, livre de recettes.
 *
 * Un plat est un objet dont l'identifiant porte tout (comme les armes forgées) :
 *   « fd:<genre>:<couleur>:<soin>:<faim>:<régén>:<vitesse>:<parts restantes>:<parts>:<ingrédients>:<nom> »
 * Soin / faim / effets sont PAR PART. Ainsi le sac, les coffres, la sauvegarde et la coop l'acceptent sans rien changer.
 *
 * Stations : mortier, mixeur, poêle, marmite, table à pâte (table de cuisine) ; four (cuit la pâte à pain).
 * plan(station, ingrédients, forme, nom) est une fonction pure : l'interface s'en sert pour l'aperçu, l'hôte pour valider.
 */
(function (I) {
  const PREFIX = 'fd:', REACH = 90, MAXBOOK = 50;
  const KINDS = {
    juice: { label: 'Jus', edible: 1, liquid: 1 }, powder: { label: 'Poudre' }, grill: { label: 'Grillade', edible: 1 },
    soup: { label: 'Soupe', edible: 1 }, pasta: { label: 'Pâtes fraîches' }, spag: { label: 'Spaghetti', edible: 1 },
    tart: { label: 'Tarte', edible: 1 }, braw: { label: 'Pâte à pain' }, bread: { label: 'Pain', edible: 1 },
  };
  const STATIONS = {
    mortar: { name: 'Mortier', at: 'cook_table', desc: 'Écrase un ingrédient en poudre. Le blé donne de la farine.' },
    mixer: { name: 'Mixeur', at: 'cook_table', desc: 'Mixe fruits, légumes, herbes et fleurs en jus : la couleur et les effets se mélangent selon les proportions.' },
    pan: { name: 'Poêle', at: 'cook_table', desc: 'Grille un ingrédient : il se transforme en grillade (plus nourrissante).' },
    pot: { name: 'Marmite', at: 'cook_table', desc: 'Au moins un jus + des ingrédients : soupe. Avec des pâtes fraîches : spaghetti (le jus fait la sauce).' },
    dough: { name: 'Table à pâte', at: 'cook_table', desc: 'Farine + jus (+ garniture) : choisis spaghetti, tarte ou pain.' },
    oven: { name: 'Four', at: 'oven', desc: 'Cuit la pâte à pain (1 combustible : bois, bâton, charbon…).' },
  };
  const FORMS = { spag: 'Spaghetti', tart: 'Tarte', bread: 'Pain' };
  const ART = { apple: 'à la pomme', blueberry: 'aux myrtilles', cactus_fruit: 'à la figue de Barbarie', strawberry: 'à la fraise', grape: 'au raisin', melon: 'au melon', pumpkin: 'à la citrouille', carrot: 'à la carotte', cabbage: 'au chou', tomato: 'à la tomate', wheat: 'au blé', sunflower: 'au tournesol', flower_purple: 'à la lavande', sage: 'à la sauge', mushroom: 'aux champignons', glow_mushroom: 'aux champignons lumineux', crystal: 'au cristal' };
  const TEXT = {
    bad: 'Impossible.', missing: 'Il te manque des ingrédients.', full: 'Ton sac est plein : fais de la place d’abord.', station: 'Il faut être près de la bonne table.',
    empty: 'Choisis des ingrédients.', noLiquid: 'Il faut au moins un liquide (un jus du mixeur).', noSolid: 'Ajoute aussi des ingrédients solides.',
    noFlour: 'Il faut de la farine (blé écrasé au mortier).', noForm: 'Choisis : spaghetti, tarte ou pain.', tooMany: 'Il y a trop d’ingrédients.', badItem: 'Cet ingrédient ne va pas ici.',
    noPasta: 'Une seule sorte de pâtes à la fois (2 maximum).', noBread: 'Il faut de la pâte à pain et un combustible.', unknown: 'Recette inconnue.', noBook: 'Il faut un livre de recettes.',
  };

  // ---------- couleurs ----------
  function rgbOf(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function hexOf(c) { return c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- codage des plats ----------
  function cleanName(s) { return String(s || '').replace(/[^A-Za-zÀ-ÿŒœ0-9 '’\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 26); }
  function parseIng(s) {
    const out = {};
    if (!s) return out;
    s.split('+').forEach(function (e) { const q = e.split('*'); out[q[0]] = (out[q[0]] || 0) + (+q[1] || 0); });
    return out;
  }
  function stringIng(ing) {
    return Object.keys(ing).filter(function (k) { return ing[k] > 0; }).sort(function (a, b) { return ing[b] - ing[a] || (a < b ? -1 : 1); }).slice(0, 6)
      .map(function (k) { return k + '*' + clamp(Math.round(ing[k]), 1, 99); }).join('+');
  }
  function enc(d) { return PREFIX + [d.k, d.c, d.hp, d.hun, d.rg, d.sp, d.p, d.m, d.ing, d.nm].join(':'); }
  function parse(id) {
    const a = id.slice(PREFIX.length).split(':');
    if (a.length !== 10 || !KINDS[a[0]] || !/^[0-9a-f]{6}$/.test(a[1])) return null;
    for (let i = 2; i < 8; i++) if (!/^\d{1,3}$/.test(a[i])) return null;
    const d = { k: a[0], c: a[1], hp: +a[2], hun: +a[3], rg: +a[4], sp: +a[5], p: +a[6], m: +a[7], ing: a[8], nm: a[9] };
    if (d.p < 1 || d.m < 1 || d.m > 4 || d.p > d.m || d.hp > 200 || d.hun > 200 || d.rg > 180 || d.sp > 180) return null;
    if (d.ing && !d.ing.split('+').every(function (e) { return /^[a-z_0-9]+\*\d{1,2}$/.test(e) && I.FOOD[e.split('*')[0]]; })) return null;
    if (!d.nm || cleanName(d.nm) !== d.nm) return null;
    return enc(d) === id ? d : null;
  }
  const cache = new Map(), itemCache = new Map();
  /** Plat décodé (ou null si l'identifiant n'en est pas un). */
  function dish(id) {
    if (typeof id !== 'string' || id.length > 190 || id.indexOf(PREFIX) !== 0) return null;
    if (cache.has(id)) return cache.get(id);
    if (cache.size > 3000) { cache.clear(); itemCache.clear(); }
    let d = null; try { d = parse(id); } catch (e) { d = null; }
    cache.set(id, d); return d;
  }
  function build(k, rgb, per, P, ing, nm) {
    return enc({ k: k, c: hexOf(rgb), hp: clamp(Math.round(per.hp), 0, 40), hun: clamp(Math.round(per.hun), 0, 90), rg: clamp(Math.round(per.rg), 0, 90), sp: clamp(Math.round(per.sp), 0, 90), p: P, m: P, ing: stringIng(ing), nm: cleanName(nm) || KINDS[k].label });
  }
  function names(ing) { return Object.keys(ing).filter(function (k) { return k !== 'flour'; }).sort(function (a, b) { return ing[b] - ing[a]; }); }
  function label(id) { return (I.ITEMS[id] && I.ITEMS[id].name || id).toLowerCase(); }
  function de(n) { return /^[aeiouyàâéèêîôûœh]/i.test(n) ? 'd’' + n : 'de ' + n; }
  function list(arr) { return arr.length < 2 ? arr[0] || '' : arr.length === 2 ? arr[0] + ' et ' + arr[1] : arr[0] + ', ' + arr[1] + ' et ' + arr[2]; }

  function itemOf(id) {
    if (itemCache.has(id)) return itemCache.get(id);
    const d = dish(id); if (!d) return undefined;
    const K = KINDS[d.k], bits = [];
    if (K.edible) { bits.push('faim +' + d.hun); if (d.hp) bits.push('soin +' + d.hp); if (d.rg) bits.push('régénération ' + d.rg + ' s'); if (d.sp) bits.push('vitesse ' + d.sp + ' s'); }
    const ing = names(parseIng(d.ing)).map(label).join(', ');
    const desc = K.label + (K.edible ? (d.m > 1 ? ' · ' + d.p + '/' + d.m + ' parts. Par part : ' : ' · ') + bits.join(', ') + '. Clic droit pour manger.' : ' · ingrédient de cuisine.') + (ing ? ' Ingrédients : ' + ing + '.' : '');
    const it = { name: d.nm, desc: desc, stack: d.m > 1 ? 1 : 99, dish: true };
    itemCache.set(id, it); return it;
  }
  function foodOf(id) { const d = dish(id); return d && KINDS[d.k].edible ? { hp: d.hp, hun: d.hun, regen: d.rg, speed: d.sp } : null; }
  /** Après avoir mangé une part : le plat à parts perd une part (nouvel identifiant) ; renvoie true si c'est géré ici. */
  function afterEat(p, slot) {
    const s = p.inv.slots[slot], d = s && dish(s.id);
    if (!d || d.m <= 1) return false;
    if (d.p <= 1) p.inv.take(slot, 1); else { p.inv.slots[slot] = { id: enc(Object.assign({}, d, { p: d.p - 1 })), qty: 1 }; p.inv.rev++; }
    return true;
  }

  // ---------- propriétés ----------
  /** Propriétés d'UN exemplaire (toutes ses parts restantes) : { hp, hun, rg, sp, c:[r,g,b], cat, k, ing, name } ou null. */
  function propsOf(id) {
    const f = I.FOOD[id];
    if (f) return { hp: f.hp || 0, hun: f.hun || 0, rg: f.regen || 0, sp: f.speed || 0, c: rgbOf(f.c.slice(1)), cat: f.cat, k: null, ing: (function () { const o = {}; o[id] = 1; return o; })(), name: I.ITEMS[id].name };
    const d = dish(id);
    return d ? { hp: d.hp * d.p, hun: d.hun * d.p, rg: d.rg * d.p, sp: d.sp * d.p, c: rgbOf(d.c), cat: d.k, k: d.k, ing: parseIng(d.ing), name: d.nm } : null;
  }
  /** Additionne des ingrédients : parts = [{ pr, q, w }] (w : poids de la couleur). Couleur = moyenne pondérée des couleurs (rouge + bleu = violet). */
  function combine(parts) {
    const t = { hp: 0, hun: 0, rg: 0, sp: 0 }, ing = {}, cs = [0, 0, 0];
    let ws = 0, units = 0;
    parts.forEach(function (x) {
      t.hp += x.pr.hp * x.q; t.hun += x.pr.hun * x.q; t.rg += x.pr.rg * x.q; t.sp += x.pr.sp * x.q;
      for (const k in x.pr.ing) ing[k] = (ing[k] || 0) + x.pr.ing[k] * x.q;
      const w = (x.w || 1) * x.q; for (let i = 0; i < 3; i++) cs[i] += x.pr.c[i] * w; ws += w; units += x.q;
    });
    return { t: t, ing: ing, c: cs.map(function (v) { return v / ws; }), units: units };
  }
  function scale(t, k, div) { return { hp: t.hp * k / div, hun: t.hun * k / div, rg: t.rg * k / div, sp: t.sp * k / div }; }

  /** Noms de plats connus (clin d'œil au livre de recettes). */
  function special(k, ing) {
    const has = function (id) { return ing[id] > 0; };
    if (k === 'juice' && has('strawberry') && has('grape')) return 'Jus énergisant';
    if (k === 'soup' && (has('mushroom') || has('glow_mushroom')) && has('sage')) return 'Soupe forestière';
    if (k === 'spag' && has('crystal')) return 'Spaghetti lunaires';
    if (k === 'bread' && has('crystal')) return 'Pain de cristal';
    return null;
  }
  function artOf(ing, fallback) { const n = names(ing)[0]; return n ? ART[n] || de(label(n)) : fallback; }

  // ---------- accepte : quels objets vont dans quelle station ----------
  function fuelOf(id) { return I.containers.fuelOf(id); }
  function accepts(st, id) {
    if (st === 'oven' && fuelOf(id) > 0) return true;
    const pr = propsOf(id); if (!pr) return false;
    switch (st) {
      case 'mortar': return !pr.k && pr.cat !== 'meat' && id !== 'flour';
      case 'mixer': return !pr.k && ['fruit', 'veg', 'herb', 'flower', 'mush'].indexOf(pr.cat) >= 0;
      case 'pan': return !pr.k && ['meat', 'veg', 'fruit', 'mush'].indexOf(pr.cat) >= 0;
      case 'pot': return pr.k === 'juice' || pr.k === 'pasta' || pr.k === 'powder' || pr.k === 'grill' || (!pr.k && id !== 'flour');
      case 'dough': return id === 'flour' || pr.k === 'juice' || pr.k === 'powder' || pr.k === 'grill' || (!pr.k && id !== 'flour');
      case 'oven': return pr.k === 'braw' || fuelOf(id) > 0;
    }
    return false;
  }

  /**
   * Résultat d'une préparation (sans rien toucher) :
   * @returns {{ok:true, outs:[{id,qty}], consume:[[id,qty]], name:string} | {ok:false, reason:string}}
   */
  function plan(st, items, form, custom) {
    if (!STATIONS[st] || !Array.isArray(items) || !items.length || items.length > 14) return { ok: false, reason: items && items.length ? 'bad' : 'empty' };
    const merged = {}, order = [];
    for (const it of items) {
      if (!Array.isArray(it) || typeof it[0] !== 'string' || !Number.isInteger(it[1]) || it[1] < 1 || it[1] > 99) return { ok: false, reason: 'bad' };
      if (!I.ITEMS[it[0]]) return { ok: false, reason: 'bad' };
      if (merged[it[0]] === undefined) { merged[it[0]] = 0; order.push(it[0]); }
      merged[it[0]] += it[1];
    }
    const list_ = order.map(function (id) { return { id: id, q: merged[id], pr: propsOf(id) }; });
    let total = 0;
    for (const x of list_) { if (!x.pr && !(st === 'oven' && fuelOf(x.id) > 0)) return { ok: false, reason: 'bad' }; if (!accepts(st, x.id)) return { ok: false, reason: 'badItem' }; total += x.q; }
    if (total > 24) return { ok: false, reason: 'tooMany' };
    const consume = list_.map(function (x) { return [x.id, x.q]; }), cn = cleanName(custom);
    const R = function (outs, nm) { return { ok: true, outs: outs, consume: consume, name: nm }; };

    if (st === 'mortar') {
      const outs = list_.map(function (x) {
        if (x.id === 'wheat') return { id: 'flour', qty: x.q };
        const pr = x.pr, c = pr.c.map(function (v) { return v + (255 - v) * 0.3; });
        return { id: build('powder', c, pr, 1, pr.ing, 'Poudre ' + de(pr.name.toLowerCase())), qty: x.q };
      });
      return R(outs, I.ITEMS[outs[0].id].name);
    }
    if (st === 'mixer') {
      const cm = combine(list_.map(function (x) { return { pr: x.pr, q: x.q }; })), n = cm.units;
      if (n > 12) return { ok: false, reason: 'tooMany' };
      const nm = cn || special('juice', cm.ing) || 'Jus ' + de(list(names(cm.ing).slice(0, 3).map(label)));
      return R([{ id: build('juice', cm.c, scale(cm.t, 0.9, n), 1, cm.ing, nm), qty: n }], nm);
    }
    if (st === 'pan') {
      const outs = list_.map(function (x) {
        const pr = x.pr, base = pr.name.toLowerCase().replace(/ crue?$/, '');
        const c = pr.c.map(function (v, i) { return v * 0.6 + [45, 25, 5][i]; });
        const nm = list_.length === 1 && cn ? cn : 'Grillade ' + de(base);
        return { id: build('grill', c, { hp: Math.ceil(pr.hp * 1.2), hun: Math.round(pr.hun * 1.6) + 1, rg: pr.rg, sp: pr.sp }, 1, pr.ing, nm), qty: x.q };
      });
      return R(outs, I.ITEMS[outs[0].id].name);
    }
    if (st === 'pot') {
      const L = [], S = [], Pn = [];
      list_.forEach(function (x) { (x.pr.k === 'juice' ? L : x.pr.k === 'pasta' ? Pn : S).push(x); });
      const sum = function (a) { return a.reduce(function (s, x) { return s + x.q; }, 0); }, lu = sum(L), su = sum(S), pu = sum(Pn);
      if (!lu) return { ok: false, reason: 'noLiquid' };
      if (!su && !pu) return { ok: false, reason: 'noSolid' };
      if (pu > 2) return { ok: false, reason: 'noPasta' };
      if (lu > 4 || lu + su + pu > 10) return { ok: false, reason: 'tooMany' };
      const cm = combine(list_.map(function (x) { return { pr: x.pr, q: x.q, w: x.pr.k === 'juice' ? 2 : x.pr.k === 'pasta' ? 1.5 : 1 }; }));
      if (pu) {
        const P = pu * 2, nm = cn || special('spag', cm.ing) || 'Spaghetti ' + artOf(cm.ing, 'nature');
        return R([{ id: build('spag', cm.c, scale(cm.t, 1.5, P), P, cm.ing, nm), qty: 1 }], nm);
      }
      const u = lu + su, P = u <= 3 ? 2 : u <= 5 ? 3 : 4, nm = cn || special('soup', cm.ing) || 'Soupe ' + de(list(names(cm.ing).slice(0, 3).map(label)));
      return R([{ id: build('soup', cm.c, scale(cm.t, 1.3, P), P, cm.ing, nm), qty: 1 }], nm);
    }
    if (st === 'dough') {
      if (!FORMS[form]) return { ok: false, reason: 'noForm' };
      const F = [], L = [], X = [];
      list_.forEach(function (x) { (x.id === 'flour' ? F : x.pr.k === 'juice' ? L : X).push(x); });
      const sum = function (a) { return a.reduce(function (s, x) { return s + x.q; }, 0); };
      if (!sum(F)) return { ok: false, reason: 'noFlour' };
      if (!sum(L)) return { ok: false, reason: 'noLiquid' };
      if (sum(F) > 4 || sum(L) > 3 || sum(X) > 6) return { ok: false, reason: 'tooMany' };
      const cm = combine(list_.map(function (x) { return { pr: x.pr, q: x.q, w: x.id === 'flour' ? 3 : x.pr.k === 'juice' ? 1.5 : 1 }; }));
      const xi = {}; X.forEach(function (x) { for (const k in x.pr.ing) xi[k] = (xi[k] || 0) + x.pr.ing[k] * x.q; });
      if (form === 'spag') { const nm = 'Pâtes fraîches'; return R([{ id: build('pasta', cm.c, cm.t, 1, cm.ing, nm), qty: 1 }], nm); }
      if (form === 'bread') { const nm = 'Pâte à pain'; return R([{ id: build('braw', cm.c, cm.t, 1, cm.ing, nm), qty: 1 }], nm); }
      const per = scale(cm.t, 2.0, 4), onlySun = X.length > 0 && X.every(function (x) { return x.id === 'sunflower'; });
      if (onlySun) per.hp = Math.max(per.hp, 10); // la tarte au tournesol de référence : +10 PV par part
      const nm = cn || (onlySun ? 'Tarte au tournesol' : 'Tarte ' + artOf(Object.keys(xi).length ? xi : cm.ing, 'du jardin'));
      return R([{ id: build('tart', cm.c, per, 4, cm.ing, nm), qty: 1 }], nm);
    }
    // four : une pâte à pain + 1 combustible
    const B = list_.filter(function (x) { return x.pr && x.pr.k === 'braw'; }), Fu = list_.filter(function (x) { return !(x.pr && x.pr.k === 'braw'); });
    if (B.length !== 1 || B[0].q !== 1 || !Fu.length) return { ok: false, reason: 'noBread' };
    const pr = B[0].pr, nm = cn || special('bread', pr.ing) || (names(pr.ing).length ? 'Pain ' + artOf(pr.ing, '') : 'Pain de campagne');
    return { ok: true, outs: [{ id: build('bread', pr.c, scale(pr, 2.2, 4), 4, pr.ing, nm), qty: 1 }], consume: [[B[0].id, 1], [Fu[0].id, 1]], name: nm };
  }

  // ---------- exécution (hôte / solo) ----------
  function nearStation(state, p, st) {
    const type = STATIONS[st].at;
    for (const o of state.world.objectsIn(p.x - REACH, p.y - REACH, p.x + REACH, p.y + REACH)) if (o.type === type && Math.hypot(o.x - p.x, o.y - p.y) <= REACH) return true;
    return false;
  }
  function counts(inv) { const a = {}; inv.slots.forEach(function (s) { if (s) a[s.id] = (a[s.id] || 0) + s.qty; }); return a; }

  function record(p, st, items, form, r) {
    if (p.inv.count('recipe_book') < 1 || !r.outs.length) return;
    const o = r.outs[0].id, e = { o: o, st: st, it: items.map(function (x) { return [x[0], x[1]]; }), fm: st === 'dough' ? form : null, nm: dish(o) ? dish(o).nm : null };
    p.book = (p.book || []).filter(function (x) { return x.o !== o; });
    p.book.unshift(e); if (p.book.length > MAXBOOK) p.book.length = MAXBOOK;
    p.bookRev = (p.bookRev | 0) + 1;
  }

  /** Prépare : retire les ingrédients, ajoute le résultat ; tout est annulé si le sac ne peut pas le contenir. */
  function make(state, p, req, ev) {
    if (!req || !STATIONS[req.st]) return { ok: false, reason: 'bad' };
    const r = plan(req.st, req.items, req.form, req.name);
    if (!r.ok) return r;
    if (!nearStation(state, p, req.st)) return { ok: false, reason: 'station' };
    const have = counts(p.inv), missing = {};
    r.consume.forEach(function (c) { if ((have[c[0]] || 0) < c[1]) missing[c[0]] = c[1] - (have[c[0]] || 0); });
    if (Object.keys(missing).length) return { ok: false, reason: 'missing', missing: missing };
    const backup = p.inv.toJSON();
    r.consume.forEach(function (c) { I.inv_takeAny(p.inv, c[0], c[1]); });
    for (const o of r.outs) if (p.inv.add(o.id, o.qty) > 0) { p.inv.slots = I.Inventory.fromJSON(backup, p.inv.size).slots; p.inv.rev++; return { ok: false, reason: 'full' }; }
    record(p, req.st, r.consume, req.form, r);
    p.stats.cooked = (p.stats.cooked | 0) + 1;
    ev.push({ type: 'cook', pid: p.id, st: req.st, x: p.x, y: p.y - 10 });
    return { ok: true, name: r.name, outs: r.outs };
  }

  // ---------- livre de recettes ----------
  /** Cherche dans le livre une recette qui fabrique `id` : { e, qty } (quantité par préparation). */
  function producer(book, id) {
    for (const e of book) { const r = plan(e.st, e.it, e.fm, e.nm); if (r.ok) { const o = r.outs.find(function (x) { return x.id === id; }); if (o) return { e: e, qty: o.qty }; } }
    return null;
  }
  /**
   * Reproduire un plat du livre : étapes dans l'ordre (les plats intermédiaires sont d'abord refaits depuis le livre), ingrédients manquants.
   * @returns {{ok:boolean, steps:[], missing:{}, stations:[]}}
   */
  function planRepro(p, outId) {
    const book = p.book || [], e0 = book.find(function (x) { return x.o === outId; });
    if (!e0) return { ok: false, reason: 'unknown', steps: [], missing: {}, stations: [] };
    const avail = counts(p.inv), steps = [], missing = {};
    let guard = 0;
    function ensure(id, q, depth) {
      const use = Math.min(avail[id] || 0, q); avail[id] = (avail[id] || 0) - use;
      let need = q - use;
      if (need <= 0) return;
      const pr = depth < 5 ? producer(book, id) : null;
      if (!pr) { missing[id] = (missing[id] || 0) + need; return; }
      while (need > 0 && guard++ < 40) {
        pr.e.it.forEach(function (x) { ensure(x[0], x[1], depth + 1); });
        steps.push({ st: pr.e.st, items: pr.e.it, form: pr.e.fm, name: pr.e.nm });
        const r = plan(pr.e.st, pr.e.it, pr.e.fm, pr.e.nm);
        r.outs.forEach(function (o) { avail[o.id] = (avail[o.id] || 0) + o.qty; });
        const u2 = Math.min(avail[id] || 0, need); avail[id] -= u2; need -= u2;
      }
    }
    e0.it.forEach(function (x) { ensure(x[0], x[1], 0); });
    steps.push({ st: e0.st, items: e0.it, form: e0.fm, name: e0.nm });
    const stations = []; steps.forEach(function (s) { if (stations.indexOf(s.st) < 0) stations.push(s.st); });
    return { ok: !Object.keys(missing).length && guard < 40, steps: steps, missing: missing, stations: stations };
  }
  function repro(state, p, outId, ev) {
    if (p.inv.count('recipe_book') < 1) return { ok: false, reason: 'noBook' };
    const r = planRepro(p, outId);
    if (r.reason === 'unknown') return { ok: false, reason: 'unknown' };
    if (!r.ok) return { ok: false, reason: 'missing', missing: r.missing };
    for (const st of r.stations) if (!nearStation(state, p, st)) return { ok: false, reason: 'station', station: st };
    let last = null;
    for (const s of r.steps) { last = make(state, p, { st: s.st, items: s.items, form: s.form, name: s.name }, ev); if (!last.ok) return last; }
    return { ok: true, name: last.name, outs: last.outs, steps: r.steps.length };
  }
  function sanitizeBook(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;
    for (const e of raw.slice(0, MAXBOOK)) {
      if (!e || typeof e !== 'object' || !STATIONS[e.st] || !Array.isArray(e.it)) continue;
      const it = e.it.filter(function (x) { return Array.isArray(x) && I.ITEMS[x[0]] && Number.isInteger(x[1]) && x[1] > 0 && x[1] < 100; }).map(function (x) { return [x[0], x[1]]; });
      if (!it.length || it.length !== e.it.length || !I.ITEMS[e.o]) continue;
      out.push({ o: e.o, st: e.st, it: it, fm: FORMS[e.fm] ? e.fm : null, nm: e.nm ? cleanName(e.nm) : null });
    }
    return out;
  }

  /** Commande d'interface : 'cook' (préparer) ou 'repro' (reproduire une recette du livre). */
  function run(state, p, cmd, ev) {
    if (cmd.t === 'repro') return typeof cmd.out === 'string' ? repro(state, p, cmd.out, ev) : { ok: false, reason: 'bad' };
    return make(state, p, { st: String(cmd.st), items: cmd.items, form: cmd.form, name: typeof cmd.name === 'string' ? cmd.name : '' }, ev);
  }

  I.cooking = { KINDS: KINDS, STATIONS: STATIONS, FORMS: FORMS, TEXT: TEXT, REACH: REACH, dish: dish, itemOf: itemOf, foodOf: foodOf, afterEat: afterEat, propsOf: propsOf, accepts: accepts, plan: plan, make: make, planRepro: planRepro, repro: repro, sanitizeBook: sanitizeBook, run: run, nearStation: nearStation, enc: enc, cleanName: cleanName, hexOf: hexOf };
  I.dishItem = itemOf; // utilisé par I.ITEMS (voir systems/forge.js)
})((window.Iles = window.Iles || {}));
