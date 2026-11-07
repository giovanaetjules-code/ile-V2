/*
 * Table du Forgeron : DONNÉES. Rien n'est calculé ici ; systems/forge.js lit ces tables.
 *
 * Ajouter un matériau   : une entrée dans MAT (ou, pour un nouveau minerai, une ligne dans content/ores.js + un réglage dans ORE_STATS).
 * Autoriser une famille : passer son interrupteur à true dans CATEGORIES (plantes, nourriture… sont refusées pour l'instant).
 * Ajouter un modèle d'arme : une entrée dans MODELS (+ TYPES si ses statistiques de base diffèrent) et un gabarit du même nom dans systems/forge-geometry.js.
 * Restreindre une matière à certaines parties : PARTS (par famille de forme).
 *
 * Un matériau PHYSIQUE (clé de MAT : « iron_bar ») est indépendant de sa COULEUR (« iron_bar~blue » : même fer, autre teinte).
 *   res : résistance (dureté)   sol : solidité (tient l'assemblage)   atk : puissance offensive   wt : poids   rar : rareté 0..7
 *   cat : catégorie (voir CATEGORIES)   kind : famille de forme (stick, wood, plank, rope, stone, gem, bar, ore)
 *   hex : couleur naturelle   fx : propriétés spéciales { dmg, dur, spd } = bonus proportionnels (+0.1 = +10 %)
 */
(function (I) {
  // interrupteurs par catégorie : true = utilisable à la Table du Forgeron
  const CATEGORIES = {
    wood: true, metal: true, ore: true, mineral: true, gem: true, binding: true,
    plant: false, food: false, fuel: false, misc: false, // plantes, nourriture, combustibles et divers : mécaniques futures
  };

  const MAT = {
    stick: { cat: 'wood', kind: 'stick', res: 1, sol: 1.5, atk: 1, wt: 0.4, rar: 0, hex: '#8a5a32' },
    bamboo: { cat: 'wood', kind: 'stick', res: 1.5, sol: 2, atk: 1, wt: 0.3, rar: 0.5, hex: '#8ccf55', fx: { spd: 0.06 }, tag: 'léger' },
    wood: { cat: 'wood', kind: 'wood', res: 2, sol: 2.5, atk: 1.5, wt: 1, rar: 0, hex: '#a8703c' },
    plank: { cat: 'wood', kind: 'plank', res: 2, sol: 3, atk: 1.3, wt: 0.8, rar: 0, hex: '#cfa266' },
    rope: { cat: 'binding', kind: 'rope', res: 0.5, sol: 0.5, atk: 0, wt: 0.1, rar: 0, hex: '#d8c8a0' },
    stone: { cat: 'mineral', kind: 'stone', res: 4, sol: 2.5, atk: 3, wt: 2, rar: 0.3, hex: '#8e8e9a' },
    crystal: { cat: 'gem', kind: 'gem', res: 3, sol: 1.5, atk: 3, wt: 0.6, rar: 3, hex: '#9ad8ff', tag: 'cristallin' },
    copper_bar: { cat: 'metal', kind: 'bar', res: 4, sol: 4, atk: 4, wt: 2.2, rar: 1, hex: '#d98a4a' },
    iron_bar: { cat: 'metal', kind: 'bar', res: 6, sol: 6, atk: 5, wt: 2.6, rar: 1.5, hex: '#aeb4c0' },
    silver_bar: { cat: 'metal', kind: 'bar', res: 3.5, sol: 3.5, atk: 4.5, wt: 2.4, rar: 2.5, hex: '#e4e8ee' },
    gold_bar: { cat: 'metal', kind: 'bar', res: 2, sol: 2, atk: 3, wt: 4, rar: 4, hex: '#f2c14e', tag: 'lourd et tendre' },
    // minerais bruts des mondes d'origine (les nouveaux sont ajoutés plus bas à partir de content/ores.js)
    copper_ore: null, iron_ore: null, silver_ore: null, gold_ore: null,
    // matériaux volontairement refusés (catégorie explicite = message clair, et prêts pour une future autorisation)
    coal: { cat: 'fuel', kind: 'fuel' }, clay: { cat: 'misc', kind: 'misc' }, fiber: { cat: 'plant', kind: 'plant' },
    berries: { cat: 'food', kind: 'food' }, apple: { cat: 'food', kind: 'food' }, blueberry: { cat: 'food', kind: 'food' },
    pumpkin: { cat: 'food', kind: 'food' }, cactus_fruit: { cat: 'food', kind: 'food' }, wheat: { cat: 'food', kind: 'food' },
    mushroom: { cat: 'food', kind: 'food' }, glow_mushroom: { cat: 'food', kind: 'food' },
    flower_red: { cat: 'plant', kind: 'plant' }, flower_blue: { cat: 'plant', kind: 'plant' }, flower_yellow: { cat: 'plant', kind: 'plant' },
    flower_white: { cat: 'plant', kind: 'plant' }, flower_pink: { cat: 'plant', kind: 'plant' }, flower_purple: { cat: 'plant', kind: 'plant' },
    flower_orange: { cat: 'plant', kind: 'plant' }, sunflower: { cat: 'plant', kind: 'plant' }, petal: { cat: 'plant', kind: 'plant' },
    pinecone: { cat: 'plant', kind: 'plant' }, shell: { cat: 'misc', kind: 'misc' },
  };

  // minerais bruts : dérivés du lingot (plus friables, plus lourds), jamais meilleurs que lui
  const BAR_OF = { copper_ore: 'copper_bar', iron_ore: 'iron_bar', silver_ore: 'silver_bar', gold_ore: 'gold_bar' };
  const ORE_HEX = { copper_ore: '#c07040', iron_ore: '#9a6a50', silver_ore: '#b8bcc8', gold_ore: '#d8b040' };
  // nouveaux métaux : réglages propres (rareté élevée, spécialités)
  const ORE_STATS = {
    cobalt: { res: 7, sol: 6.5, atk: 6, wt: 2.6, rar: 3, tag: 'équilibré' },
    mithril: { res: 6, sol: 5.5, atk: 7, wt: 1.2, rar: 4.5, fx: { spd: 0.15 }, tag: 'très léger' },
    orichalque: { res: 5.5, sol: 5, atk: 8, wt: 2.4, rar: 5, fx: { dmg: 0.1 }, tag: 'tranchant' },
    adamantite: { res: 9, sol: 9, atk: 6.5, wt: 3.4, rar: 5.5, fx: { dur: 0.15 }, tag: 'presque indestructible' },
    titane: { res: 8, sol: 8, atk: 6, wt: 1.6, rar: 4, fx: { dur: 0.08, spd: 0.08 }, tag: 'léger et résistant' },
    obscurium: { res: 8, sol: 7, atk: 9, wt: 2.8, rar: 6.5, fx: { dmg: 0.12 }, tag: 'ténébreux' },
  };
  I.ORES.forEach(function (o) { MAT[o.id + '_bar'] = Object.assign({ cat: 'metal', kind: 'bar', hex: o.c }, ORE_STATS[o.id]); });
  I.ORES.forEach(function (o) { MAT[o.id + '_ore'] = null; ORE_HEX[o.id + '_ore'] = o.c; BAR_OF[o.id + '_ore'] = o.id + '_bar'; });
  Object.keys(BAR_OF).forEach(function (k) {
    const b = MAT[BAR_OF[k]];
    MAT[k] = { cat: 'ore', kind: 'ore', res: b.res * 0.55, sol: b.sol * 0.45, atk: b.atk * 0.65, wt: b.wt * 1.3, rar: b.rar * 0.8, hex: ORE_HEX[k], fx: b.fx, tag: 'brut' };
  });

  // Types d'armes. spd : coups par seconde de base ; dmg : multiplicateur de dégâts.
  const TYPES = {
    dagger: { name: 'Dague', spd: 1.6, dmg: 0.75 },
    sword: { name: 'Épée', spd: 1.2, dmg: 1 },
    spear: { name: 'Lance', spd: 1, dmg: 0.95 },
    axe: { name: 'Hache', spd: 0.9, dmg: 1.15 },
    mace: { name: 'Masse', spd: 0.8, dmg: 1.1 },
  };

  // Parties qu'un matériau peut former, selon son rôle dans l'arme : handle (poignée / bas), mid (milieu), blade (lame, pointe), head (tête de hache ou de masse)
  const ALL = ['handle', 'mid', 'blade', 'head'];
  const PARTS = {
    stick: ALL, wood: ALL, plank: ALL, stone: ALL, bar: ALL,
    rope: ['handle', 'mid'], // une corde n'est ni une lame ni une tête
    gem: ['mid', 'blade', 'head'], // un cristal ne se tient pas en main
    ore: ['handle', 'mid', 'head'], // un minerai brut est trop friable pour une lame : il faut d'abord le fondre
  };

  // Modèles d'armes connus : le joueur en choisit un, puis place trois matériaux, dans l'ordre : emplacement 1 → 2 → 3.
  // Chaque emplacement est une partie de l'arme (label affiché, rôle = parties acceptées) ; le dessin est dans systems/forge-geometry.js.
  const MODELS = {
    sword: { name: 'Épée', type: 'sword', desc: 'Rapide et polyvalente.', slots: [{ label: 'Poignée', role: 'handle' }, { label: 'Garde et base de lame', role: 'mid' }, { label: 'Lame et pointe', role: 'blade' }] },
    dagger: { name: 'Dague', type: 'dagger', desc: 'Très rapide, mais légère.', slots: [{ label: 'Poignée', role: 'handle' }, { label: 'Garde', role: 'mid' }, { label: 'Lame', role: 'blade' }] },
    spear: { name: 'Lance', type: 'spear', desc: 'Longue, équilibrée.', slots: [{ label: 'Bas de hampe', role: 'handle' }, { label: 'Haut de hampe', role: 'mid' }, { label: 'Pointe', role: 'blade' }] },
    axe: { name: 'Hache', type: 'axe', desc: 'Lourde, très puissante.', slots: [{ label: 'Poignée', role: 'handle' }, { label: 'Manche', role: 'mid' }, { label: 'Tête', role: 'head' }] },
    mace: { name: 'Masse', type: 'mace', desc: 'Écrase tout, mais lente.', slots: [{ label: 'Poignée', role: 'handle' }, { label: 'Manche', role: 'mid' }, { label: 'Tête', role: 'head' }] },
  };
  const MODEL_ORDER = ['sword', 'dagger', 'spear', 'axe', 'mace'];

  const RARITY = [[1, 'Commune', '#9a9aa8'], [2, 'Peu commune', '#58a845'], [3.2, 'Rare', '#4f7cf0'], [4.6, 'Épique', '#a05ad8'], [99, 'Légendaire', '#f2a02a']];

  // Table du Forgeron (objet posable, colorable comme les autres constructions)
  I.ITEMS.forge_table = { name: 'Table du Forgeron', desc: 'Assemble trois matériaux (bois, bâtons, lingots, minerais, pierres…) en une arme unique. Pose-la puis ouvre-la avec X.', stack: 10, place: 'forge_table' };
  I.ITEM_ORDER.push('forge_table');
  I.OBJECTS.forge_table = { kind: 'interact', structure: true, item: 'forge_table', collider: [-11, -7, 22, 7], sprite: 'forge_table', center: [0, -5], interactR: 26, action: 'forge', label: 'Utiliser la Table du Forgeron', shadow: 'bench' };

  I.FORGE = {
    CATEGORIES: CATEGORIES, MAT: MAT, TYPES: TYPES, PARTS: PARTS, MODELS: MODELS, MODEL_ORDER: MODEL_ORDER, RARITY: RARITY, REACH: 90,
    TABLE_RECIPE: { id: 'forge_table', station: 'bench', ins: [['plank', 10], ['stone', 8], ['rope', 2]], out: { id: 'forge_table', qty: 1 } },
  };
})((window.Iles = window.Iles || {}));
