/*
 * Décor et mobilier posables. Une entrée = un objet d'inventaire + un objet du monde + une recette + un sprite
 * (dessiné en texte : une lettre = une couleur, '.' = transparent). Tous sont teintables (voir rendering/tint.js).
 *   rows+w  : sprite en texte | draw : fonction de dessin | sprite : réutilise le sprite d'un objet existant
 *   col     : collider [x, y, w, h] relatif au bas-centre de la case ; floor : sol praticable ; glow : éclaire la nuit
 */
(function (I) {
  const P = {
    o: '#8a5a30', w: '#b9824f', W: '#dcae7c', n: '#5e3a20', k: '#4a4a58', m: '#c08040',
    s: '#8e8e9a', S: '#b4b4c0', t: '#6c6c7c', r: '#c0504a', R: '#e0807a', g: '#58a845', G: '#3d7a32',
    y: '#f2c14e', Y: '#ffe070', b: '#4f7cf0', p: '#e8a0c0', h: '#e0c060', H: '#f2dc8a', j: '#b89440',
    q: '#c9683a', Q: '#e0885a', e: '#e8683a', E: '#f2a02a', c: '#d8d2c0',
  };
  const D = [
    { id: 'table', name: 'Table', desc: 'Une solide table en bois.', st: 'bench', ins: [['plank', 6]], col: [-7, -5, 14, 5], w: 14,
      rows: ['WWWWWWWWWWWWWW', 'WwwwwwwwwwwwwW', 'wwwwwwwwwwwwww', 'oooooooooooooo', '.oo........oo.', '.oo........oo.', '.oo........oo.', '.oo........oo.', '.oo........oo.'] },
    { id: 'chair', name: 'Chaise', desc: 'Pour s’asseoir (en rêve).', st: 'bench', ins: [['plank', 3], ['fiber', 2]], col: [-4, -3, 8, 3], w: 8,
      rows: ['.oooooo.', '.owwwwo.', '.owwwwo.', '.owwwwo.', '.oooooo.', 'RRRRRRRR', 'rrrrrrrr', 'oooooooo', 'o.o..o.o', 'o......o'] },
    { id: 'bench_seat', name: 'Banc', desc: 'Un banc de bois pour regarder le coucher de soleil.', st: 'bench', ins: [['plank', 4], ['stick', 2]], col: [-7, -3, 14, 3], w: 14,
      rows: ['WWWWWWWWWWWWWW', 'wwwwwwwwwwwwww', 'oooooooooooooo', '.oo........oo.', '.oo........oo.', '.oo........oo.'] },
    { id: 'bookshelf', name: 'Bibliothèque', desc: 'Pleine de livres de toutes les couleurs.', st: 'bench', ins: [['plank', 8], ['rope', 1]], col: [-7, -4, 14, 4], w: 14,
      rows: ['oooooooooooooo', 'orbygrbyrgbyro', 'orbygrbyrgbyro', 'orbygrbyrgbyro', 'oooooooooooooo', 'ogyrbgyrbyrgbo', 'ogyrbgyrbyrgbo', 'ogyrbgyrbyrgbo', 'oooooooooooooo', 'obrygbrbgyrbyo', 'obrygbrbgyrbyo', 'obrygbrbgyrbyo', 'oooooooooooooo', 'nn..........nn'] },
    { id: 'flower_pot', name: 'Pot de fleurs', desc: 'Un peu de vie sur le rebord.', st: 'hand', ins: [['stone', 2], ['fiber', 2]], col: [-3, -3, 6, 3], w: 8,
      rows: ['...R..y.', '..RrR.yy', 'g.gRg.g.', '.gGgGg..', '..gGg...', '.QQQQQQ.', '.qqqqqq.', '..qqqq..', '..qqqq..', '...qq...'] },
    { id: 'banner', name: 'Bannière', desc: 'Un étendard sur sa hampe.', st: 'bench', ins: [['stick', 2], ['fiber', 6]], col: [-4, -2, 4, 2], w: 9,
      rows: ['orrrrrrrr', 'orRRRRRRr', 'orRYYYYRr', 'orRYYYYRr', 'orRRRRRRr', 'orrrrrrrr', 'orrr.rrr.', 'o..r...r.', 'o........', 'o........', 'o........', 'o........', 'ooo......'] },
    { id: 'statue', name: 'Statue', desc: 'Une silhouette de pierre, solennelle.', st: 'bench', ins: [['stone', 10]], col: [-5, -4, 10, 4], w: 10,
      rows: ['...tssst..', '..tsSSsst.', '..tsSSsst.', '...tssst..', '..tsSSsst.', '.tsSSSSsst', '.tsSSSSsst', '..tsSSsst.', '..tsSSsst.', '..tsSSsst.', '.tttttttt.', 'tsSSSSSSst', 'tsSSSSSSst', 'tttttttttt'] },
    { id: 'brazier', name: 'Brasero', desc: 'Éclaire et réchauffe la nuit.', st: 'bench', ins: [['stone', 6], ['wood', 3]], col: [-4, -3, 8, 3], glow: true, w: 10,
      rows: ['....Y.....', '...EYE.E..', '..EeEYEe..', '..eEYYEe..', '.kkkkkkkk.', '.kmmmmmmk.', '..kmmmmk..', '...kmmk...', '....kk....', '...k..k...', '..k....k..', '..k....k..'] },
    { id: 'signboard', name: 'Enseigne', desc: 'Une planche sur un piquet, pour décorer.', st: 'bench', ins: [['plank', 2], ['stick', 1]], col: [-1, -2, 2, 2], w: 12,
      rows: ['wwwwwwwwwwww', 'WWWWWWWWWWWW', 'wnnwwnnwnnww', 'wwwwwwwwwwww', 'wnnnnwnnwwww', 'wwwwwwwwwwww', 'oooooooooooo', '.....oo.....', '.....oo.....', '.....oo.....', '.....oo.....', '....oooo....'] },
    { id: 'hay', name: 'Botte de foin', desc: 'Moelleuse et dorée.', st: 'bench', ins: [['fiber', 8]], col: [-7, -5, 14, 5], w: 14,
      rows: ['..hhhhhhhhhh..', '.hHHHHHHHHHHh.', 'hHHhHHhHHhHHHh', 'hHhHHhHHhHHhHh', 'hhHHhHHhHHhHHh', 'hHHhHjjHhHHhHh', 'hhHhHHhHHhHHhh', '.hhjhhjhhjhhh.', '..jjjjjjjjjj..'] },
    { id: 'mailbox', name: 'Boîte aux lettres', desc: 'Pour le courrier qui n’arrive jamais.', st: 'bench', ins: [['plank', 3], ['copper_bar', 1]], col: [-2, -2, 4, 2], w: 9,
      rows: ['.rrrrrrr.', 'rRRRRRRRr', 'rRrrrrrRr', 'rrrrrrrrr', 'rrrYYrrrr', '.rrrrrrr.', '....o....', '....o....', '....o....', '....o....', '...ooo...'] },
    { id: 'pillar', name: 'Colonne', desc: 'Une colonne de pierre.', st: 'bench', ins: [['stone', 4]], col: [-4, -4, 8, 4], w: 10, h: 16,
      draw: function (g, d) { d.rc(g, 2, 3, 6, 11, '#b4b4c0'); d.rc(g, 2, 3, 2, 11, '#d8d8e2'); d.rc(g, 6, 3, 2, 11, '#8e8e9a'); d.rc(g, 0, 0, 10, 3, '#b4b4c0'); d.rc(g, 0, 0, 10, 1, '#d8d8e2'); d.rc(g, 0, 14, 10, 2, '#8e8e9a'); } },
    { id: 'wall_wood', wall: 'wall', mat: 'wood', name: 'Mur en bois', desc: 'Un pan de mur en planches. Se raccorde aux murs voisins ; bloque le passage.', st: 'bench', ins: [['plank', 3]], out: 2, col: [-8, -16, 16, 16], w: 16, h: 22, noOutline: true,
      draw: function (g, d) { d.rc(g, 0, 0, 16, 22, '#b9824f'); for (let x = 3; x < 16; x += 4) d.rc(g, x, 6, 1, 16, '#8a5a30'); d.rc(g, 0, 0, 16, 6, '#dcae7c'); d.rc(g, 0, 6, 16, 1, '#8a5a30'); d.rc(g, 0, 20, 16, 2, '#8a5a30'); } },
    { id: 'wall_stone', wall: 'wall', mat: 'stone', name: 'Mur de pierre', desc: 'Un pan de mur en briques. Se raccorde aux murs voisins ; bloque le passage.', st: 'bench', ins: [['stone', 4]], out: 2, col: [-8, -16, 16, 16], w: 16, h: 22, noOutline: true,
      draw: function (g, d) { d.rc(g, 0, 0, 16, 22, '#8e8e9a'); d.rc(g, 0, 0, 16, 6, '#b4b4c0'); for (let y = 6; y < 22; y += 4) { d.rc(g, 0, y, 16, 1, '#6c6c7c'); const o = (y / 4 | 0) % 2 ? 0 : 4; for (let x = o; x < 16; x += 8) d.rc(g, x, y, 1, 4, '#6c6c7c'); } d.rc(g, 0, 21, 16, 1, '#6c6c7c'); } },
    { id: 'carpet', name: 'Tapis', desc: 'Doux sous les pieds. Se teinte à volonté.', st: 'hand', ins: [['fiber', 6]], out: 2, floor: true,
      draw: function (g, d) { d.rc(g, 0, 0, 16, 16, '#b8403a'); d.rc(g, 1, 1, 14, 14, '#d9645a'); d.rc(g, 3, 3, 10, 10, '#f0e0b0'); d.rc(g, 4, 4, 8, 8, '#d9645a'); d.rc(g, 7, 5, 2, 6, '#f2c14e'); d.rc(g, 5, 7, 6, 2, '#f2c14e'); } },
    { id: 'floor_tile', name: 'Carrelage', desc: 'Un sol clair en dalles. Se teinte à volonté.', st: 'hand', ins: [['stone', 2]], out: 2, floor: true,
      draw: function (g, d) { d.rc(g, 0, 0, 16, 16, '#8e8e9a'); d.rc(g, 1, 1, 7, 7, '#dcdce6'); d.rc(g, 9, 1, 6, 7, '#c4c4d2'); d.rc(g, 1, 9, 7, 6, '#c4c4d2'); d.rc(g, 9, 9, 6, 6, '#dcdce6'); } },
    { id: 'wall_iron', wall: 'wall', mat: 'iron', name: 'Mur en fer', desc: 'Un pan de mur en tôle de fer. Se raccorde aux murs voisins ; bloque le passage.', st: 'bench', ins: [['iron_bar', 2]], out: 2, col: [-8, -16, 16, 16], w: 16, h: 22, noOutline: true,
      learn: { item: 'iron_ore', hint: 'Trouve du minerai de fer.' },
      draw: function (g, d) { d.rc(g, 0, 0, 16, 22, '#6c7a92'); d.rc(g, 0, 0, 16, 6, '#9aa7bd'); for (let x = 2; x < 16; x += 5) { d.rc(g, x, 7, 1, 13, '#4a566e'); d.rc(g, x + 1, 7, 1, 13, '#8e9cb4'); } d.rc(g, 0, 6, 16, 1, '#4a566e'); d.rc(g, 0, 20, 16, 2, '#4a566e'); } },
    { id: 'door', wall: 'door', mat: 'wood', name: 'Porte', desc: 'S’ouvre toute seule quand on s’approche. À poser dans un mur (elle prend sa place).', st: 'bench', ins: [['plank', 4]], w: 16, h: 24, noOutline: true, draw: function () {} },
    { id: 'window', wall: 'window', mat: 'wood', name: 'Fenêtre', desc: 'Un cadre de bois et une vitre de nacre. À poser dans un mur (elle prend sa place).', st: 'bench', ins: [['plank', 3], ['shell', 1]], col: [-8, -16, 16, 16], w: 16, h: 24, noOutline: true, draw: function () {} },
    { id: 'roof', roof: true, name: 'Toit (4 tuiles)', desc: 'Pose-le dans une pièce fermée : le toit couvre toute la pièce et ses murs (1 tuile par case). Il disparaît si un mur manque. Clic droit avec un toit en main : retirer le toit.', st: 'bench', ins: [['plank', 2], ['fiber', 1]], out: 4, w: 16, h: 16, noOutline: true, draw: function () {} },
    { id: 'candelabra', name: 'Chandelier doré', desc: 'Trois flammes sur de l\u2019or. Éclaire la nuit.', st: 'bench', ins: [['gold_bar', 2], ['torch', 1]], col: [-3, -3, 6, 3], glow: true, w: 9,
      learn: { item: 'gold_ore', hint: 'Trouve du minerai d\u2019or.' },
      rows: ['..E.E.E..', '..Y.Y.Y..', '..y.y.y..', '..yyyyy..', '...jyj...', '....y....', '....y....', '....j....', '...yyy...', '..jjjjj..'] },
    { id: 'mirror', name: 'Miroir sur pied', desc: 'Un miroir encadré d\u2019argent.', st: 'bench', ins: [['silver_bar', 2], ['plank', 2]], col: [-4, -3, 8, 3], w: 10, h: 17,
      learn: { item: 'silver_ore', hint: 'Trouve du minerai d\u2019argent.' },
      draw: function (g, d) { d.rc(g, 0, 0, 10, 15, '#96a0b0'); d.rc(g, 1, 1, 8, 13, '#c8e8f8'); d.rc(g, 2, 2, 2, 7, '#f4fbff'); d.rc(g, 5, 8, 3, 4, '#a8d4ee'); d.rc(g, 1, 14, 8, 1, '#6c7a92'); d.rc(g, 1, 15, 2, 2, '#6c7a92'); d.rc(g, 7, 15, 2, 2, '#6c7a92'); } },
    // objets qui réutilisent un sprite du monde
    { id: 'crate_item', name: 'Caisse', desc: 'Une caisse en bois, pour le décor.', st: 'bench', ins: [['plank', 4]], col: [-6, -5, 12, 5], sprite: 'crate', shadow: 'small' },
    { id: 'barrel_item', name: 'Tonneau', desc: 'Un tonneau, pour le décor.', st: 'bench', ins: [['plank', 6]], col: [-5, -5, 10, 5], sprite: 'barrel', shadow: 'small' },
    { id: 'rock_deco', name: 'Rocher décoratif', desc: 'Un rocher à poser où tu veux.', st: 'bench', ins: [['stone', 5]], col: [-6, -6, 12, 6], sprite: 'rock', shadow: 'rock' },
    { id: 'bush_deco', name: 'Buisson', desc: 'Un buisson à planter.', st: 'bench', ins: [['fiber', 8], ['stick', 2]], col: [-6, -4, 12, 4], sprite: 'bush_bare', shadow: 'bush' },
    { id: 'pine_deco', name: 'Jeune pin', desc: 'Planté à partir de pommes de pin.', st: 'bench', ins: [['pinecone', 2], ['plank', 1]], col: [-4, -5, 8, 5], sprite: 'tree_pine', shadow: 'tree' },
    { id: 'cherry_deco', name: 'Cerisier décoratif', desc: 'Planté à partir de pétales.', st: 'bench', ins: [['petal', 3], ['plank', 1]], col: [-4, -5, 8, 5], sprite: 'tree_blossom', shadow: 'tree' },
  ];

  I.DECOR = D;
  I.DECOR_RECIPES = [];
  function reg(d) {
    I.ITEMS[d.id] = { name: d.name, desc: d.desc, stack: 99, place: d.id };
    I.OBJECTS[d.id] = { kind: 'decor', structure: true, item: d.id, sprite: d.sprite || d.id, collider: d.col || null, shadow: d.shadow || (d.col && !d.floor && !d.wall ? 'small' : null), layer: d.floor ? 'floor' : d.roof ? 'roof' : undefined, glowLamp: d.glow || undefined, wall: d.wall || undefined, wallMat: d.mat || undefined };
    if (!I.OBJECTS[d.id].collider) delete I.OBJECTS[d.id].collider;
    I.DECOR_RECIPES.push({ id: d.id, station: d.st, ins: d.ins, out: { id: d.id, qty: d.out || 1 }, learn: d.learn });
    I.ITEM_ORDER.push(d.id);
  }
  D.forEach(reg);
  I.regDecor = function (d) { D.push(d); reg(d); }; // ajout d'un objet de décor depuis un autre fichier (cuisine…)
  I.DECOR_PAL = P;
})((window.Iles = window.Iles || {}));
