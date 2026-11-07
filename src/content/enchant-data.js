/*
 * Enchantements : DONNÉES et fonctions pures. Six pierres magiques : quatre simples (foudre, givre, venin, flamme), récoltées rarement
 * sur les ÉLITES de l'élément correspondant (mob-gen.js, loot), et deux pierres DOUBLES (flamme + givre, venin + foudre), réservées aux futurs
 * boss de donjon (aucune source pour l'instant : les objets existent, rien ne les fait tomber). La Table d'enchantement pose jusqu'à deux
 * pierres sur une arme forgée (+ dégâts, arme colorée) ; la Table de désenchantement rend l'arme de base et les pierres.
 * Les POUVOIRS des pierres (éclairs, gel, explosions…) ne sont pas encore codés : `note` / `power` ne servent qu'à les décrire pour plus tard.
 *
 * Une arme enchantée est toujours un objet dont l'identifiant EST sa recette, avec un suffixe : « wp:sword:a,b,c@fl.sh » (codes triés).
 * Pas de stockage en plus : sac, coffre, sauvegarde et coop la reconnaissent (voir systems/forge.js, decode).
 * Ajouter une pierre : une ligne dans STONES (+ son code), un effet dans systems/enchant.js.
 */
(function (I) {
  const ELEM = {
    flame: { name: 'Flamme', noun: 'flamme', col: '#ff8a2a', col2: '#ffd24a', dark: '#c8401a', rgb: [255, 138, 42], note: 'Embrase l’ennemi (brûlure) ; tous les 3 coups, une explosion ardente.' },
    frost: { name: 'Givre', noun: 'givre', col: '#7ad8ff', col2: '#e6fbff', dark: '#3a86c8', rgb: [122, 216, 255], note: 'Ralentit l’ennemi ; tous les 4 coups, il est gelé sur place.' },
    venom: { name: 'Venin', noun: 'venin', col: '#7aff5a', col2: '#d8ffa0', dark: '#2e9a3a', rgb: [122, 255, 90], note: 'Empoisonne (cumulable) ; un ennemi qui meurt empoisonné libère un nuage toxique.' },
    shock: { name: 'Foudre', noun: 'foudre', col: '#ffe84a', col2: '#ffffff', dark: '#b8962a', rgb: [255, 232, 74], note: 'Chaque coup peut déclencher un éclair en chaîne vers les ennemis proches.' },
  };
  const ELEM_ORDER = ['flame', 'frost', 'venom', 'shock'];

  // code : identifiant court dans l'id de l'arme ; els : éléments ; double : pierre double (plus puissante)
  const STONES = {
    stone_shock: { code: 'sh', els: ['shock'], name: 'Pierre de foudre' },
    stone_frost: { code: 'fr', els: ['frost'], name: 'Pierre de givre' },
    stone_venom: { code: 've', els: ['venom'], name: 'Pierre de venin' },
    stone_flame: { code: 'fl', els: ['flame'], name: 'Pierre de flamme' },
    stone_flamefrost: { code: 'ff', els: ['flame', 'frost'], double: true, name: 'Pierre du choc thermique', power: 'Choc thermique : tous les 3 coups, une explosion de vapeur qui étourdit.' },
    stone_venomshock: { code: 'vs', els: ['venom', 'shock'], double: true, name: 'Pierre de la tempête toxique', power: 'Tempête toxique : les éclairs empoisonnent, et tous les 5 coups la foudre s’abat du ciel.' },
  };
  const BY_CODE = {}; Object.keys(STONES).forEach(function (id) { STONES[id].id = id; BY_CODE[STONES[id].code] = STONES[id]; });
  const STONE_IDS = Object.keys(STONES), MAX_SLOTS = 2;
  const SIMPLE_MUL = 0.12, DOUBLE_MUL = 0.35, SIMPLE_L = 1, DOUBLE_L = 1.6;

  // ---------- objets : les pierres ----------
  STONE_IDS.forEach(function (id) {
    const s = STONES[id], e0 = ELEM[s.els[0]], e1 = ELEM[s.els[1] || s.els[0]];
    I.ITEMS[id] = { name: s.name, desc: s.double
      ? 'Une pierre double, rarissime : ' + s.els.map(function (k) { return ELEM[k].noun; }).join(' et ') + '. Pose-la sur une arme à la Table d’enchantement : bien plus puissante qu’une pierre simple.'
      : 'Une pierre magique de ' + e0.noun + '. Pose-la sur une arme à la Table d’enchantement.', stack: 99, stone: true };
    I.ITEM_ORDER.push(id);
    I.NATURE_ICONS[id] = s.double ? ['mgem2', e0.col, e0.col2, e1.col, e1.dark] : ['mgem', e0.col, e0.col2, e0.dark];
  });

  // ---------- la table ----------
  I.ITEMS.enchant_table = { name: 'Table d’enchantement', desc: 'Pose jusqu’à deux pierres magiques sur une arme forgée : elle gagne en puissance et des pouvoirs. Pose-la puis ouvre-la avec E.', stack: 10, place: 'enchant_table' };
  I.ITEM_ORDER.push('enchant_table');
  I.ITEMS.disenchant_table = { name: 'Table de désenchantement', desc: 'Défait l’enchantement d’une arme : tu récupères l’arme de base et les pierres magiques. Pose-la puis ouvre-la avec E.', stack: 10, place: 'disenchant_table' };
  I.ITEM_ORDER.push('disenchant_table');
  I.OBJECTS.disenchant_table = { kind: 'interact', structure: true, item: 'disenchant_table', collider: [-11, -7, 22, 7], sprite: 'disenchant_table', center: [0, -5], interactR: 28, action: 'disenchant', label: 'Utiliser la Table de désenchantement', shadow: 'bench', glowSoft: 'violet', glowTable: true };
  I.OBJECTS.enchant_table = { kind: 'interact', structure: true, item: 'enchant_table', collider: [-11, -7, 22, 7], sprite: 'enchant_table', center: [0, -5], interactR: 28, action: 'enchant', label: 'Utiliser la Table d’enchantement', shadow: 'bench', glowSoft: 'violet', glowTable: true };

  // ---------- analyse d'un suffixe d'enchantement ----------
  const pc = new Map();
  /**
   * « fl.sh » -> { codes, stones, els:{flame:1, shock:1}, order:[...], dd:{ff:bool, vs:bool}, dmgMul, suffix, count } ; null si invalide.
   * Niveau d'un élément : 1 par pierre simple, 1,6 par pierre double (pour chacun de ses deux éléments).
   */
  function parse(str) {
    if (typeof str !== 'string' || !str || str.length > 12) return null;
    if (pc.has(str)) return pc.get(str);
    const codes = str.split('.');
    let out = null;
    if (codes.length >= 1 && codes.length <= MAX_SLOTS && codes.every(function (c) { return BY_CODE[c]; })) {
      const sorted = codes.slice().sort();
      if (sorted.join('.') === str) {
        const els = {}, dd = { ff: false, vs: false }; let mul = 1;
        sorted.forEach(function (c) {
          const s = BY_CODE[c], L = s.double ? DOUBLE_L : SIMPLE_L;
          s.els.forEach(function (k) { els[k] = (els[k] || 0) + L; });
          mul += s.double ? DOUBLE_MUL : SIMPLE_MUL;
          if (c === 'ff') dd.ff = true; if (c === 'vs') dd.vs = true;
        });
        const order = ELEM_ORDER.filter(function (k) { return els[k]; });
        out = { codes: sorted, stones: sorted.map(function (c) { return BY_CODE[c].id; }), els: els, order: order, dd: dd, dmgMul: mul, count: sorted.length,
          suffix: ' enchantée de ' + order.map(function (k) { return ELEM[k].noun; }).join(' et '), bonus: Math.round((mul - 1) * 100) };
      }
    }
    pc.set(str, out);
    return out;
  }
  /** Identifiant de l'arme enchantée : base + suffixe canonique pour ces pierres (liste d'identifiants de pierres) ; null si invalide. */
  function idWith(baseId, stoneIds) {
    if (typeof baseId !== 'string' || !Array.isArray(stoneIds) || stoneIds.length < 1 || stoneIds.length > MAX_SLOTS) return null;
    const codes = [];
    for (const s of stoneIds) { if (!STONES[s]) return null; codes.push(STONES[s].code); }
    return baseId.split('@')[0] + '@' + codes.sort().join('.');
  }
  /** Retire l'enchantement d'un identifiant. */
  function baseOf(id) { return String(id).split('@')[0]; }

  /** Phrases décrivant les pouvoirs d'un enchantement (pour les fiches et la table). */
  function powers(e) {
    const out = [];
    e.order.forEach(function (k) { out.push({ el: k, text: ELEM[k].name + (e.els[k] >= 2 ? ' (niveau ' + (Math.round(e.els[k] * 10) / 10) + ')' : '') + ' — ' + ELEM[k].note }); });
    if (e.dd.ff) out.push({ el: 'flame', text: STONES.stone_flamefrost.power });
    if (e.dd.vs) out.push({ el: 'venom', text: STONES.stone_venomshock.power });
    return out;
  }

  I.ENCH = { ELEM: ELEM, ELEM_ORDER: ELEM_ORDER, STONES: STONES, BY_CODE: BY_CODE, STONE_IDS: STONE_IDS, MAX_SLOTS: MAX_SLOTS, parse: parse, idWith: idWith, baseOf: baseOf, powers: powers,
    // volontairement chères : cristaux lunaires (dimensions), lingots d'or / d'argent
    TABLE_RECIPE: { id: 'enchant_table', station: 'bench', ins: [['plank', 12], ['iron_bar', 8], ['gold_bar', 4], ['crystal', 10]], out: { id: 'enchant_table', qty: 1 }, learn: { item: 'crystal', hint: 'Trouve un cristal lunaire.' } },
    DISENCHANT_RECIPE: { id: 'disenchant_table', station: 'bench', ins: [['plank', 10], ['iron_bar', 6], ['silver_bar', 4], ['crystal', 6]], out: { id: 'disenchant_table', qty: 1 }, learn: { item: 'crystal', hint: 'Trouve un cristal lunaire.' } },
    REACH: 90 };
})((window.Iles = window.Iles || {}));
