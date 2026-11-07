/*
 * Nature supplémentaire : arbres, rochers, plantes. Une entrée = un type d'objet du monde (défs) + où il pousse (gen).
 *   kind : 'tree' | 'rock' | 'plant' (cueillette avec X) ; spr = nombre de variantes de sprite (les sprites sont dessinés dans rendering/sprites.js)
 *   gen  : t = terrains ('g' herbe, 'd' sous-bois, 's' sable, 'r' terre) ; p = probabilité par case ; z = [décalage, seuil] zone de bruit (regroupe
 *          les mêmes espèces) ; w = près de l'eau (rayon) ; dh / dp = distance mini à la maison / au portail ; hmax = distance maxi à la maison
 * Les nouveaux objets ne prennent que des cases libres : les identifiants des objets d'origine (donc les anciennes sauvegardes) ne changent pas.
 */
(function (I) {
  function dr(id, min, max, chance) { return { id: id, min: min, max: max, chance: chance === undefined ? 1 : chance }; }
  const TREE = { kind: 'resource', tool: 'axe', hp: 4, collider: [-4, -5, 8, 5], colliderCut: [-4, -3, 8, 3], spriteCut: 'stump', center: [0, -9], hitR: 13, respawnDays: 2, shadow: 'tree', fx: 'wood' };
  const ROCK = { kind: 'resource', tool: 'pickaxe', hp: 3, collider: [-6, -6, 12, 6], spriteCut: null, center: [0, -5], hitR: 10, respawnDays: 2, shadow: 'rock', fx: 'stone' };
  const PLANT = { kind: 'harvest', spriteCut: null, center: [0, -4], interactR: 13, respawnDays: 1.5 };
  const W = [dr('wood', 3, 4), dr('stick', 0, 2, 0.5)];

  const N = [
    // ---- arbres ----
    { id: 'tree_birch', t: TREE, spr: 3, d: { drops: W, leaf: ['#8cc858', '#aee070', '#6aa845'] }, gen: { t: 'gd', p: 0.08, z: [1300, 0.5], dh: 8, dp: 6, tree: 1 } },
    { id: 'tree_autumn', t: TREE, spr: 3, d: { drops: W, leaf: ['#e8801f', '#f5a83a', '#c0561a'] }, gen: { t: 'g', p: 0.06, z: [1100, 0.6], dh: 8, dp: 6, tree: 1 } },
    { id: 'tree_maple', t: TREE, spr: 3, d: { drops: W, leaf: ['#d0453a', '#e87a5a', '#a02a22'] }, gen: { t: 'g', p: 0.06, z: [1500, 0.52], dh: 8, dp: 6, tree: 1 } },
    { id: 'tree_apple', t: TREE, spr: 3, d: { drops: [dr('wood', 2, 3), dr('stick', 0, 2, 0.5), dr('apple', 1, 3, 0.9)], leaf: ['#58a845', '#7cc94f', '#d9423e'] }, gen: { t: 'g', p: 0.014, dh: 8, hmax: 24, dp: 6, tree: 1 } },
    { id: 'tree_willow', t: TREE, spr: 2, d: { drops: W, leaf: ['#7aaa5a', '#9ac878', '#5a8a48'] }, gen: { t: 'g', p: 0.09, w: 4, dh: 8, dp: 6, tree: 1 } },
    { id: 'tree_cypress', t: TREE, spr: 2, d: { drops: W, leaf: ['#2f6b4a', '#3f8a5a', '#245a3e'] }, gen: { t: 'g', p: 0.05, z: [1700, 0.45], dh: 8, dp: 6, tree: 1 } },
    { id: 'tree_acacia', t: TREE, spr: 2, d: { drops: W, leaf: ['#9aa83a', '#b8c85a', '#7a8a2a'] }, gen: { t: 'g', p: 0.05, z: [1900, 0.45], dh: 10, dp: 6, tree: 1 } },
    { id: 'tree_palm', t: TREE, spr: 2, d: { hp: 3, drops: [dr('wood', 2, 3), dr('fiber', 1, 2, 0.7)], leaf: ['#58a845', '#7cc94f', '#3a7d3a'] }, gen: { t: 's', p: 0.07, w: 3, dh: 9, dp: 6, tree: 1 } },
    { id: 'tree_dead', t: TREE, spr: 2, d: { hp: 2, collider: [-3, -4, 6, 4], drops: [dr('wood', 1, 2), dr('stick', 1, 3)], leaf: ['#7a6a5a', '#9a8a7a'] }, gen: { t: 'd', p: 0.012, dh: 10, dp: 6 } },
    { id: 'tree_shroom', t: TREE, spr: 2, d: { hp: 3, drops: [dr('mushroom', 2, 4), dr('stick', 0, 1, 0.4)], leaf: ['#d9423e', '#f2efe6', '#a8302c'] }, gen: { t: 'gd', p: 0.06, z: [2100, 0.42], dh: 10, dp: 6, tree: 1 } },
    { id: 'bamboo', t: TREE, spr: 2, d: { hp: 2, collider: [-6, -3, 12, 3], spriteCut: null, drops: [dr('bamboo', 2, 3), dr('fiber', 0, 1, 0.4)], leaf: ['#7cc94f', '#58a845'] }, gen: { t: 'g', p: 0.05, w: 5, z: [2300, 0.5], dh: 9, dp: 6 } },
    // ---- rochers et minéraux ----
    { id: 'rock_big', t: ROCK, spr: 2, d: { hp: 5, collider: [-9, -8, 18, 8], hitR: 14, drops: [dr('stone', 4, 6)] }, gen: { t: 'gs', p: 0.004, dh: 12, dp: 7 } },
    { id: 'rock_mossy', t: ROCK, spr: 2, d: { drops: [dr('stone', 2, 3), dr('fiber', 0, 1, 0.4)] }, gen: { t: 'd', p: 0.012, dh: 9, dp: 6 } },
    { id: 'rock_sandstone', t: ROCK, spr: 2, d: { drops: [dr('stone', 2, 3)] }, gen: { t: 's', p: 0.02, dh: 9, dp: 6 } },
    { id: 'rock_slate', t: ROCK, spr: 2, d: { hp: 4, drops: [dr('stone', 3, 4)] }, gen: { t: 'g', p: 0.03, z: [2500, 0.55], dh: 10, dp: 6 } },
    { id: 'rock_pink', t: ROCK, spr: 2, d: { drops: [dr('stone', 2, 3)] }, gen: { t: 'g', p: 0.01, dh: 12, dp: 6 } },
    { id: 'ore_coal', t: ROCK, spr: 2, d: { hp: 4, drops: [dr('coal', 2, 3), dr('stone', 0, 1, 0.5)] }, gen: { t: 'gs', p: 0.006, dh: 15, dp: 7 } },
    { id: 'pebbles', t: PLANT, spr: 2, d: { interactR: 12, label: 'Ramasser des cailloux', drops: [dr('stone', 1, 2)], leaf: ['#9a9aa8', '#7a7a88'] }, gen: { t: 'sg', p: 0.015, dh: 6, dp: 5 } },
    { id: 'clay', t: PLANT, spr: 1, d: { interactR: 13, respawnDays: 2, label: 'Creuser l’argile', drops: [dr('clay', 1, 2)], leaf: ['#c9803a', '#a8602a'] }, gen: { t: 's', p: 0.03, w: 3, dh: 7, dp: 5 } },
    // ---- plantes ----
    { id: 'fern', t: PLANT, spr: 3, d: { label: 'Couper la fougère', drops: [dr('fiber', 1, 2)], leaf: ['#3f8a3a', '#5fa63f'] }, gen: { t: 'd', p: 0.07, dh: 6, dp: 4 } },
    { id: 'reeds', t: PLANT, spr: 2, d: { label: 'Couper les roseaux', drops: [dr('fiber', 1, 3)], leaf: ['#9aa84a', '#7a6a3a'] }, gen: { t: 'gs', p: 0.14, w: 2, dh: 6, dp: 4 } },
    { id: 'cactus', t: { kind: 'resource', tool: 'axe', hp: 2, collider: [-3, -3, 6, 3], spriteCut: null, center: [0, -8], hitR: 9, respawnDays: 2, shadow: 'small', fx: 'wood' }, spr: 2, d: { drops: [dr('cactus_fruit', 1, 2), dr('fiber', 0, 1, 0.5)], leaf: ['#58a845', '#e8508a'] }, gen: { t: 's', p: 0.012, dh: 12, dp: 7 } },
    { id: 'sunflower', t: PLANT, spr: 2, d: { label: 'Cueillir le tournesol', drops: [dr('sunflower', 1, 1)], leaf: ['#f6d743', '#7a4e2c'] }, gen: { t: 'g', p: 0.04, z: [2700, 0.5], dh: 5, dp: 4 } },
    { id: 'flower_white', t: PLANT, spr: 2, d: { label: 'Cueillir', interactR: 13, drops: [dr('flower_white', 1, 1)], leaf: ['#ffffff', '#f2c14e'] }, gen: { t: 'g', p: 0.04, z: [2900, 0.56], dh: 5, dp: 4 } },
    { id: 'flower_pink', t: PLANT, spr: 2, d: { label: 'Cueillir', interactR: 13, drops: [dr('flower_pink', 1, 1)], leaf: ['#f08ab0', '#f2c14e'] }, gen: { t: 'g', p: 0.04, z: [3100, 0.56], dh: 5, dp: 4 } },
    { id: 'flower_purple', t: PLANT, spr: 2, d: { label: 'Cueillir', interactR: 13, drops: [dr('flower_purple', 1, 1)], leaf: ['#9a5ad8', '#f2c14e'] }, gen: { t: 'g', p: 0.04, z: [3300, 0.56], dh: 5, dp: 4 } },
    { id: 'flower_orange', t: PLANT, spr: 2, d: { label: 'Cueillir', interactR: 13, drops: [dr('flower_orange', 1, 1)], leaf: ['#f08a2a', '#7a4e2c'] }, gen: { t: 'g', p: 0.04, z: [3500, 0.56], dh: 5, dp: 4 } },
    { id: 'bush_blueberry', t: PLANT, spr: 1, d: { interactR: 18, respawnDays: 1, label: 'Cueillir les myrtilles', drops: [dr('blueberry', 2, 3)], leaf: ['#58a845', '#4f6ae0'] }, gen: { t: 'd', p: 0.02, dh: 7, dp: 5 } },
    { id: 'tall_grass', t: PLANT, spr: 3, d: { respawnDays: 1, label: 'Couper les hautes herbes', drops: [dr('fiber', 1, 2)], leaf: ['#7ec850', '#5fa63f'] }, gen: { t: 'g', p: 0.06, dh: 5, dp: 4 } },
    { id: 'pumpkin', t: PLANT, spr: 1, d: { interactR: 13, respawnDays: 2, label: 'Ramasser la citrouille', drops: [dr('pumpkin', 1, 1)], leaf: ['#f08a2a', '#3c8f3c'] }, gen: { t: 'g', p: 0.01, dh: 8, hmax: 26, dp: 6 } },
    { id: 'wheat', t: PLANT, spr: 2, d: { respawnDays: 1.5, label: 'Moissonner', drops: [dr('wheat', 1, 2)], leaf: ['#e0c060', '#b89440'] }, gen: { t: 'g', p: 0.04, z: [3700, 0.58], dh: 6, dp: 4 } },
    { id: 'mushroom_brown', t: PLANT, spr: 1, d: { interactR: 12, respawnDays: 1, label: 'Ramasser', drops: [dr('mushroom', 1, 2)], leaf: ['#9a6a3a', '#d8b888'] }, gen: { t: 'd', p: 0.02, dh: 6, dp: 5 } },
    { id: 'mushroom_blue', t: PLANT, spr: 1, d: { interactR: 12, respawnDays: 2, label: 'Ramasser', glowSoft: 'cyan', drops: [dr('glow_mushroom', 1, 1)], leaf: ['#3a8ae8', '#b8f0ff'] }, gen: { t: 'd', p: 0.025, dh: 10, dp: 5 } },
    { id: 'log_fallen', t: { kind: 'resource', tool: 'axe', hp: 3, collider: [-9, -4, 18, 4], spriteCut: null, center: [0, -4], hitR: 12, respawnDays: 4, shadow: 'small', fx: 'wood' }, spr: 1, d: { drops: [dr('wood', 2, 3), dr('stick', 0, 2, 0.6)], leaf: ['#8a5a30', '#6a4420'] }, gen: { t: 'd', p: 0.02, dh: 8, dp: 6 } },
    // ---- minerais (palier d'outil : fer et argent = pioche en cuivre, or = pioche en fer) ----
    { id: 'ore_iron', t: ROCK, spr: 3, d: { hp: 5, tier: 1, drops: [dr('stone', 1, 2), dr('iron_ore', 1, 2)] }, gen: { t: 'gs', p: 0.012, z: [2900, 0.5], dh: 13, dp: 8 } },
    { id: 'ore_silver', t: ROCK, spr: 3, d: { hp: 5, tier: 1, drops: [dr('stone', 0, 1, 0.5), dr('silver_ore', 1, 2)] }, gen: { t: 'gs', p: 0.01, z: [3100, 0.5], dh: 15, dp: 8 } },
    { id: 'ore_gold', t: ROCK, spr: 3, d: { hp: 6, tier: 2, respawnDays: 4, drops: [dr('stone', 0, 1, 0.4), dr('gold_ore', 1, 2)] }, gen: { t: 'gs', p: 0.008, z: [3300, 0.5], dh: 17, dp: 8 } },
  ];

  // nouveaux objets d'inventaire (icône : [genre, couleurs…] interprété dans rendering/sprites.js)
  const ITEMS = {
    apple: ['Pomme', 'Croquante et sucrée.', ['fruit', '#d9423e', '#58a845', 4, 4]],
    blueberry: ['Myrtilles', 'Petites baies bleues.', ['fruit', '#4f6ae0', '#58a845', 3, 3]],
    pumpkin: ['Citrouille', 'Lourde et orange.', ['fruit', '#f08a2a', '#3c8f3c', 5, 4]],
    cactus_fruit: ['Figue de Barbarie', 'Piquante dehors, douce dedans.', ['fruit', '#e8508a', '#58a845', 3, 4]],
    coal: ['Charbon', 'Un excellent combustible.', ['chunk', '#2a2a32', '#55555f']],
    clay: ['Argile', 'Molle et collante.', ['chunk', '#c9803a', '#e0a060']],
    bamboo: ['Bambou', 'Léger et résistant.', ['stalk', '#7cc94f', '#3c8f3c']],
    wheat: ['Blé', 'Des épis dorés.', ['ears', '#e0c060']],
    sunflower: ['Tournesol', 'Il suit le soleil.', ['flower', '#f6d743', '#7a4e2c']],
    flower_white: ['Marguerite', 'Blanche et simple.', ['flower', '#ffffff', '#f2c14e']],
    flower_pink: ['Tulipe rose', 'Douce couleur.', ['flower', '#f08ab0', '#f2c14e']],
    flower_purple: ['Lavande', 'Elle sent bon.', ['flower', '#9a5ad8', '#f2c14e']],
    flower_orange: ['Souci', 'Orange vif.', ['flower', '#f08a2a', '#7a4e2c']],
    glow_mushroom: ['Champignon lumineux', 'Il luit dans le noir.', ['mush', '#3a8ae8', '#b8f0ff']],
  };

  I.NATURE = N;
  I.NATURE_ICONS = {};
  N.forEach(function (n) { I.OBJECTS[n.id] = Object.assign({ sprite: n.id }, n.t, n.d); });
  Object.keys(ITEMS).forEach(function (id) {
    const it = ITEMS[id];
    I.ITEMS[id] = { name: it[0], desc: it[1], stack: 99 };
    I.NATURE_ICONS[id] = it[2];
    I.ITEM_ORDER.push(id);
  });
})((window.Iles = window.Iles || {}));
