/*
 * Nourriture : cultures, graines, viandes (une par plan de corps de créature), butin supplémentaire, valeurs nutritives.
 *   I.CROPS[id]  : { item, seed, days, shape, c (couleur mûre), leaf, yield:[min,max] }   jours de jeu pour mûrir
 *   I.FOOD[id]   : { hp, hun, regen?, speed?, c, cat }   propriétés d'un aliment cru (réutilisées par la cuisine : voir systems/cooking.js)
 *   I.MEATS[plan]: { item, loot }   viande et butin d'un plan de corps
 * Les objets existants (pomme, blé, tournesol…) gardent leur identifiant : seules des entrées s'ajoutent.
 */
(function (I) {
  function dr(id, min, max, chance) { return { id: id, min: min, max: max, chance: chance === undefined ? 1 : chance }; }

  // ---- cultures : 11 plantes (légumes, fruits, céréale, herbe, fleurs utiles) ----
  const CROPS = {
    carrot: { item: 'carrot', days: 0.9, shape: 'root', c: '#f08a2a', yield: [2, 3] },
    cabbage: { item: 'cabbage', days: 1.2, shape: 'head', c: '#8fd070', yield: [1, 2] },
    tomato: { item: 'tomato', days: 1.1, shape: 'bush', c: '#d9423e', yield: [2, 3] },
    strawberry: { item: 'strawberry', days: 0.8, shape: 'bush', c: '#e04058', yield: [2, 4] },
    grape: { item: 'grape', days: 1.6, shape: 'vine', c: '#7a3ab0', yield: [2, 3] },
    melon: { item: 'melon', days: 1.6, shape: 'fruit', c: '#9ad060', yield: [1, 1] },
    wheat: { item: 'wheat', days: 1.0, shape: 'ears', c: '#e0c060', yield: [2, 3] },
    pumpkin: { item: 'pumpkin', days: 1.8, shape: 'fruit', c: '#f08a2a', yield: [1, 1] },
    sage: { item: 'sage', days: 0.7, shape: 'herb', c: '#7aa88a', yield: [2, 2] },
    sunflower: { item: 'sunflower', days: 1.2, shape: 'flower', c: '#f6d743', yield: [1, 2] },
    lavender: { item: 'flower_purple', days: 0.9, shape: 'flower', c: '#9a5ad8', yield: [2, 2] },
  };
  const CROP_NAMES = { carrot: 'carotte', cabbage: 'chou', tomato: 'tomate', strawberry: 'fraisier', grape: 'vigne', melon: 'melon', wheat: 'blé', pumpkin: 'citrouille', sage: 'sauge', sunflower: 'tournesol', lavender: 'lavande' };

  // ---- nouveaux objets : [nom, description, icône [genre, couleurs…]] ----
  const NEW = {
    carrot: ['Carotte', 'Croquante, un peu sucrée.', ['root', '#f08a2a', '#3c8f3c']],
    cabbage: ['Chou', 'Un chou bien serré.', ['head', '#8fd070', '#b8e898']],
    tomato: ['Tomate', 'Rouge et juteuse.', ['fruit', '#d9423e', '#3c8f3c', 4, 4]],
    strawberry: ['Fraise', 'Petite et très sucrée.', ['fruit', '#e04058', '#3c8f3c', 3, 3]],
    grape: ['Raisin', 'Une grappe de grains violets.', ['fruit', '#7a3ab0', '#3c8f3c', 3, 4]],
    melon: ['Melon', 'Lourd, frais et parfumé.', ['fruit', '#9ad060', '#3c8f3c', 5, 4]],
    sage: ['Sauge', 'Une herbe au parfum puissant.', ['head', '#7aa88a', '#a8c8b0']],
    meat_quad: ['Gigot cru', 'Une belle pièce de viande rouge.', ['meat', '#b8453f', '#e0806a']],
    meat_biped: ['Cuisse crue', 'Maigre et tendre.', ['meat', '#d9805f', '#f0b090']],
    meat_blob: ['Chair gélatineuse', 'Elle tremble au moindre geste.', ['meat', '#58c8a0', '#a8f0d0']],
    meat_serpent: ['Filet de serpent', 'Pâle et fin.', ['meat', '#e8c8c0', '#fff0ea']],
    meat_bug: ['Chair d’insecte', 'Craquante, au goût de noisette.', ['meat', '#b8b848', '#e0e080']],
    bone: ['Os', 'Solide et léger.', ['chunk', '#e6e0d0', '#ffffff']],
    slime: ['Gelée', 'Collante, translucide.', ['chunk', '#58c8a0', '#b0f0d8']],
    scale: ['Écaille', 'Brillante comme un miroir.', ['chunk', '#58a8c0', '#a0e0f0']],
    chitin: ['Carapace', 'Dure comme de la pierre.', ['chunk', '#6a5a3a', '#9a8a5a']],
    flour: ['Farine', 'Du blé moulu au mortier. Base des pâtes, tartes et pains.', ['chunk', '#f0e4c0', '#fffaf0']],
    recipe_book: ['Livre de recettes', 'Garde tes plats réussis, même ceux en plusieurs étapes. Clic droit pour l’ouvrir ; reproduis un plat en un clic quand tu as tout.', ['book', '#8a5a30', '#f2c14e']],
  };
  Object.keys(CROPS).forEach(function (k) {
    const c = CROPS[k];
    c.seed = 'seed_' + k;
    NEW[c.seed] = ['Graines de ' + CROP_NAMES[k], 'À planter sur une parcelle (clic gauche). Mûrit en ' + c.days + ' jour' + (c.days > 1 ? 's' : '') + '.', ['seed', c.c]];
  });
  Object.keys(NEW).forEach(function (id) {
    const it = NEW[id];
    I.ITEMS[id] = { name: it[0], desc: it[1], stack: 99 };
    I.NATURE_ICONS[id] = it[2];
    I.ITEM_ORDER.push(id);
    if (id.indexOf('seed_') === 0) I.ITEMS[id].seed = id.slice(5);
  });

  // ---- valeurs nutritives des aliments crus ----
  // hp : soin instantané ; hun : faim restaurée ; regen / speed : secondes d'effet ; cat : famille (cuisine) ; c : couleur (mélanges)
  const F = {
    apple: { hun: 10, hp: 2, cat: 'fruit', c: '#d9423e' }, blueberry: { hun: 6, hp: 1, cat: 'fruit', c: '#4f6ae0' },
    cactus_fruit: { hun: 8, hp: 1, cat: 'fruit', c: '#e8508a' }, strawberry: { hun: 7, hp: 2, speed: 8, cat: 'fruit', c: '#e04058' },
    grape: { hun: 7, hp: 1, speed: 10, cat: 'fruit', c: '#7a3ab0' }, melon: { hun: 14, hp: 1, cat: 'fruit', c: '#9ad060' },
    pumpkin: { hun: 12, hp: 0, cat: 'veg', c: '#f08a2a' }, carrot: { hun: 10, hp: 1, cat: 'veg', c: '#f08a2a' },
    cabbage: { hun: 8, hp: 1, cat: 'veg', c: '#8fd070' }, tomato: { hun: 8, hp: 2, regen: 6, cat: 'veg', c: '#d9423e' },
    wheat: { hun: 3, hp: 0, cat: 'grain', c: '#e0c060' }, sunflower: { hun: 3, hp: 5, cat: 'flower', c: '#f6d743' },
    flower_purple: { hun: 1, hp: 3, regen: 8, cat: 'flower', c: '#9a5ad8' }, sage: { hun: 2, hp: 4, regen: 12, cat: 'herb', c: '#7aa88a' },
    mushroom: { hun: 6, hp: 1, cat: 'mush', c: '#d8b888' }, glow_mushroom: { hun: 4, hp: 3, regen: 10, cat: 'mush', c: '#3a8ae8' },
    flour: { hun: 9, hp: 0, cat: 'grain', c: '#f0e4c0', noEat: true }, crystal: { hun: 0, hp: 0, regen: 30, speed: 15, cat: 'mineral', c: '#bfe8ff', noEat: true },
    bone: { hun: 0, hp: 4, cat: 'mineral', c: '#e6e0d0', noEat: true }, slime: { hun: 0, hp: 0, regen: 14, cat: 'mineral', c: '#58c8a0', noEat: true },
    scale: { hun: 0, hp: 0, speed: 14, cat: 'mineral', c: '#58a8c0', noEat: true }, chitin: { hun: 0, hp: 5, cat: 'mineral', c: '#9a8a5a', noEat: true },
    meat: { hun: 8, hp: 0, cat: 'meat', c: '#b8453f' }, meat_quad: { hun: 14, hp: 0, cat: 'meat', c: '#b8453f' },
    meat_biped: { hun: 12, hp: 0, cat: 'meat', c: '#d9805f' }, meat_blob: { hun: 8, hp: 2, cat: 'meat', c: '#58c8a0' },
    meat_serpent: { hun: 10, hp: 0, speed: 8, cat: 'meat', c: '#e8c8c0' }, meat_bug: { hun: 9, hp: 0, cat: 'meat', c: '#b8b848' },
  };
  I.FOOD = F;
  Object.keys(F).forEach(function (id) {
    const f = F[id], bits = f.noEat ? [] : ['faim +' + f.hun];
    if (f.hp) bits.push('soin +' + f.hp);
    if (f.regen) bits.push('régénération ' + f.regen + ' s');
    if (f.speed) bits.push('vitesse ' + f.speed + ' s');
    if (bits.length) I.ITEMS[id].desc += (f.noEat ? ' Ingrédient de cuisine : ' : ' Se mange (clic droit) : ') + bits.join(', ') + '.';
  });

  // ---- viandes et butin selon le plan de corps ----
  I.MEATS = {
    quad: { item: 'meat_quad', loot: 'bone' }, biped: { item: 'meat_biped', loot: 'bone' }, blob: { item: 'meat_blob', loot: 'slime' },
    serpent: { item: 'meat_serpent', loot: 'scale' }, bug: { item: 'meat_bug', loot: 'chitin' },
  };
  /** Butin d'une créature morte : [{item, qty}] (viande selon le plan, taille = quantité, butin rare en plus). */
  I.creatureLoot = function (S, rnd) {
    const m = I.MEATS[S.plan] || { item: 'meat', loot: null }, out = [{ item: m.item, qty: 1 + S.size + (rnd() < 0.5 ? 1 : 0) }];
    if (m.loot && rnd() < 0.55) out.push({ item: m.loot, qty: 1 + (S.size >= 2 && rnd() < 0.5 ? 1 : 0) });
    if (S.size >= 2 && rnd() < 0.12) out.push({ item: 'crystal', qty: 1 });
    return out;
  };

  // ---- graines sauvages : en coupant / cueillant certaines plantes ----
  const SEEDS = {
    tall_grass: [['wheat', 0.3], ['carrot', 0.18], ['cabbage', 0.12]], wheat: [['wheat', 0.8]], pumpkin: [['pumpkin', 0.8]], sunflower: [['sunflower', 0.8]],
    bush_blueberry: [['strawberry', 0.5], ['grape', 0.2]], flower_purple: [['lavender', 0.6]], flower_orange: [['tomato', 0.25]], fern: [['sage', 0.3]],
    reeds: [['melon', 0.12]], mushroom_brown: [['sage', 0.15]],
  };
  Object.keys(SEEDS).forEach(function (o) {
    const def = I.OBJECTS[o];
    if (def) SEEDS[o].forEach(function (s) { def.drops = (def.drops || []).concat([dr('seed_' + s[0], 1, 1, s[1])]); });
  });

  // ---- parcelle labourée : sol praticable où l'on plante ----
  I.ITEMS.plot = { name: 'Parcelle labourée', desc: 'Une terre meuble. Tiens une graine et clique dessus pour planter ; E pour récolter quand c’est mûr.', stack: 99, place: 'plot', nocolor: true };
  I.OBJECTS.plot = { kind: 'interact', structure: true, item: 'plot', sprite: 'plot', layer: 'floor', action: 'plot', interactR: 30, center: [0, -6], label: 'Récolter' };
  I.ITEM_ORDER.push('plot');
  I.DECOR_RECIPES.push({ id: 'plot', station: 'hand', ins: [['stick', 2], ['fiber', 2]], out: { id: 'plot', qty: 2 } });

  I.ITEMS.recipe_book.stack = 1;
  I.DECOR_RECIPES.push({ id: 'recipe_book', station: 'hand', ins: [['plank', 2], ['fiber', 3]], out: { id: 'recipe_book', qty: 1 } });

  // ---- stations de cuisine : table (mortier, mixeur, poêle, marmite, table à pâte) et four ----
  I.regDecor({ id: 'cook_table', name: 'Table de cuisine', desc: 'Mortier, mixeur, poêle, marmite et table à pâte réunis. Pose-la puis utilise-la avec X. Se teinte à volonté.', st: 'bench', ins: [['plank', 6], ['stone', 4], ['fiber', 2]], col: [-11, -4, 22, 4], w: 24, h: 18, shadow: 'bench',
    draw: function (g, d) {
      d.rc(g, 0, 6, 24, 4, '#c98f58'); d.rc(g, 0, 6, 24, 1, '#e4b680'); d.rc(g, 1, 10, 22, 2, '#8a5a30'); d.rc(g, 2, 12, 3, 5, '#6a4420'); d.rc(g, 19, 12, 3, 5, '#6a4420');
      d.rc(g, 3, 3, 6, 3, '#b4b4c0'); d.rc(g, 3, 3, 6, 1, '#dcdce6'); d.rc(g, 5, 0, 1, 4, '#8a5a30');
      d.rc(g, 11, 2, 6, 4, '#4a4a56'); d.rc(g, 11, 2, 6, 1, '#7a7a88'); d.rc(g, 10, 3, 1, 2, '#4a4a56'); d.rc(g, 17, 3, 1, 2, '#4a4a56'); d.rc(g, 13, 0, 1, 1, '#ffffff');
      d.rc(g, 18, 4, 5, 2, '#3a3a44'); d.rc(g, 22, 3, 2, 1, '#8a5a30');
    } });
  I.regDecor({ id: 'oven', name: 'Four de cuisine', desc: 'Un four en briques : cuit la pâte à pain (1 combustible). Pose-le puis utilise-le avec X. Se teint à volonté.', st: 'bench', ins: [['stone', 8], ['clay', 2]], col: [-8, -5, 16, 5], w: 18, h: 20, shadow: 'bench',
    draw: function (g, d) {
      d.rc(g, 11, 0, 4, 5, '#6c6c7c'); d.rc(g, 11, 0, 4, 1, '#9a9aa8'); d.rc(g, 0, 4, 18, 14, '#b87050'); d.rc(g, 0, 4, 18, 2, '#d49070');
      for (let y = 8; y < 18; y += 3) d.rc(g, 0, y, 18, 1, '#8a4a34'); d.rc(g, 5, 9, 8, 9, '#2a1a14'); d.rc(g, 6, 8, 6, 1, '#2a1a14'); d.rc(g, 7, 14, 4, 3, '#f08a2a'); d.rc(g, 8, 13, 2, 2, '#f6d743'); d.rc(g, 0, 18, 18, 2, '#6c6c7c');
    } });
  ['cook_table', 'oven'].forEach(function (id) { Object.assign(I.OBJECTS[id], { kind: 'interact', action: 'cook', interactR: 24, center: [0, -6], label: 'Cuisiner' }); });

  I.CROPS = CROPS;
})((window.Iles = window.Iles || {}));
