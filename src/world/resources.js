/*
 * Types d'objets du monde.
 *  kind : 'resource' (outil + points de vie), 'harvest' (E pour cueillir), 'interact' (E), 'decor'
 *  collider / colliderCut : [x, y, w, h] relatifs au point d'ancrage (bas-centre du sprite)
 *  center : point visé / d'interaction, relatif à l'ancrage
 */
(function (I) {
  function dr(id, min, max, chance) { return { id: id, min: min, max: max, chance: chance === undefined ? 1 : chance }; }

  I.OBJECTS = {
    tree_oak: {
      kind: 'resource', tool: 'axe', hp: 4, collider: [-4, -5, 8, 5], colliderCut: [-4, -3, 8, 3],
      sprite: 'tree_oak', spriteCut: 'stump', center: [0, -9], hitR: 13, respawnDays: 2, shadow: 'tree',
      drops: [dr('wood', 3, 4), dr('stick', 0, 2, 0.5)], fx: 'wood', leaf: ['#58a845', '#7cc94f', '#3a7d3a'],
    },
    tree_pine: {
      kind: 'resource', tool: 'axe', hp: 4, collider: [-4, -5, 8, 5], colliderCut: [-4, -3, 8, 3],
      sprite: 'tree_pine', spriteCut: 'stump', center: [0, -9], hitR: 13, respawnDays: 2, shadow: 'tree',
      drops: [dr('wood', 3, 4), dr('pinecone', 0, 1, 0.45)], fx: 'wood', leaf: ['#3f8a5a', '#5aa86e', '#2f6b4a'],
    },
    tree_blossom: {
      kind: 'resource', tool: 'axe', hp: 4, collider: [-4, -5, 8, 5], colliderCut: [-4, -3, 8, 3],
      sprite: 'tree_blossom', spriteCut: 'stump', center: [0, -9], hitR: 13, respawnDays: 2, shadow: 'tree',
      drops: [dr('wood', 3, 4), dr('petal', 1, 3, 0.8)], fx: 'wood', leaf: ['#f7b3cc', '#e88bb0', '#ffd7e6'],
    },
    rock: {
      kind: 'resource', tool: 'pickaxe', hp: 3, collider: [-6, -6, 12, 6], sprite: 'rock', spriteCut: null,
      center: [0, -5], hitR: 10, respawnDays: 2, shadow: 'rock', drops: [dr('stone', 2, 3)], fx: 'stone',
    },
    ore_copper: {
      kind: 'resource', tool: 'pickaxe', hp: 4, collider: [-6, -6, 12, 6], sprite: 'ore_copper', spriteCut: null,
      center: [0, -5], hitR: 10, respawnDays: 3, shadow: 'rock', drops: [dr('stone', 1, 2), dr('copper_ore', 1, 2)], fx: 'stone',
    },
    crystal: {
      kind: 'resource', tool: 'pickaxe', tier: 1, hp: 5, collider: [-5, -5, 10, 5], sprite: 'crystal', spriteCut: null,
      center: [0, -6], hitR: 10, respawnDays: 4, shadow: 'rock', drops: [dr('crystal', 1, 2), dr('stone', 0, 1, 0.3)], fx: 'crystal', glow: true,
    },
    bush_berry: {
      kind: 'harvest', collider: [-5, -3, 10, 3], sprite: 'bush_berry', spriteCut: 'bush_bare', center: [0, -4],
      interactR: 18, respawnDays: 1, shadow: 'bush', drops: [dr('berries', 2, 3)], label: 'Cueillir les baies', leaf: ['#58a845', '#e0453f'],
    },
    flower_red: { kind: 'harvest', sprite: 'flower_red', spriteCut: null, center: [0, -4], interactR: 13, respawnDays: 1.5, drops: [dr('flower_red', 1, 1)], label: 'Cueillir', leaf: ['#e8483f', '#f2c14e'] },
    flower_blue: { kind: 'harvest', sprite: 'flower_blue', spriteCut: null, center: [0, -4], interactR: 13, respawnDays: 1.5, drops: [dr('flower_blue', 1, 1)], label: 'Cueillir', leaf: ['#4f7cf0', '#f2c14e'] },
    flower_yellow: { kind: 'harvest', sprite: 'flower_yellow', spriteCut: null, center: [0, -4], interactR: 13, respawnDays: 1.5, drops: [dr('flower_yellow', 1, 1)], label: 'Cueillir', leaf: ['#f6d743', '#e08a2c'] },
    tuft: { kind: 'harvest', sprite: 'tuft', spriteCut: null, center: [0, -3], interactR: 12, respawnDays: 1, drops: [dr('fiber', 1, 1), dr('fiber', 0, 1, 0.5)], label: 'Couper les herbes', leaf: ['#7ec850', '#5fa63f'] },
    mushroom: { kind: 'harvest', sprite: 'mushroom', spriteCut: null, center: [0, -3], interactR: 12, respawnDays: 1, drops: [dr('mushroom', 1, 1)], label: 'Ramasser', leaf: ['#d9423e', '#f2efe6'] },
    signpost: { kind: 'interact', collider: [-3, -3, 6, 3], sprite: 'signpost', center: [0, -4], interactR: 22, action: 'sign', label: 'Lire le panneau', shadow: 'small' },
    portal: { kind: 'interact', collider: [-22, -10, 44, 10], sprite: 'portal', center: [0, 8], interactR: 28, action: 'portal', label: 'Examiner le portail', glow: true },
    workbench: { kind: 'interact', collider: [-13, -8, 26, 8], sprite: 'workbench', center: [0, -4], interactR: 26, structure: true, item: 'workbench', action: 'workbench', label: 'Utiliser l\u2019établi', shadow: 'bench' },
    // ---- constructions (posables par le joueur ; item = objet d'inventaire correspondant) ----
    chest: { kind: 'interact', structure: true, item: 'chest', collider: [-6, -5, 12, 5], sprite: 'chest', center: [0, -5], interactR: 22, action: 'container', label: 'Ouvrir le coffre', shadow: 'small', container: 'chest' },
    furnace: { kind: 'interact', structure: true, item: 'furnace', collider: [-7, -6, 14, 6], sprite: 'furnace', spriteLit: 'furnace_lit', center: [0, -6], interactR: 22, action: 'container', label: 'Utiliser le four', shadow: 'small', container: 'furnace', glowLit: true },
    bed: { kind: 'interact', structure: true, item: 'bed', collider: [-7, -7, 14, 7], sprite: 'bed', center: [0, -6], interactR: 22, action: 'sleep', label: 'Dormir', shadow: 'small' },
    lamp: { kind: 'decor', structure: true, item: 'lamp', collider: [-2, -3, 4, 3], sprite: 'lamp', shadow: 'small', glowLamp: true },
    fence: { kind: 'decor', structure: true, item: 'fence', collider: [-8, -4, 16, 4], sprite: 'fence', connect: true },
    floor_wood: { kind: 'decor', structure: true, item: 'floor_wood', layer: 'floor', sprite: 'floor_wood' },
    path_stone: { kind: 'decor', structure: true, item: 'path_stone', layer: 'floor', sprite: 'path_stone' },
    crate: { kind: 'decor', collider: [-6, -5, 12, 5], sprite: 'crate', shadow: 'small' },
    barrel: { kind: 'decor', collider: [-5, -5, 10, 5], sprite: 'barrel', shadow: 'small' },
  };
})((window.Iles = window.Iles || {}));
