/*
 * Table du Forgeron : DESSIN. Transforme l'analyse d'une arme (systems/forge.js) en image 16×16 : chaque pièce garde la couleur de son
 * matériau (couleur naturelle, ou la teinte choisie si le matériau est coloré). Aucun sprite préfait : tout vient des cases de forgeGeo.
 * Le sprite de la table est dessiné avec les outils de sprites.js (mk, rc, px), passés à tableSprite.
 */
(function (I) {
  const GHOST = [150, 150, 164];
  function rgbOf(p) {
    if (!p) return GHOST; // emplacement encore vide : partie « fantôme »
    let v;
    if (p.c && I.COLORS[p.c - 1]) v = I.COLORS[p.c - 1].rgb;
    else { const h = p.m.hex || '#888888'; v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    return v.map(function (x) { return Math.max(x, 60); }); // les matériaux très sombres (obscurium) restent lisibles sur le contour
  }
  function tone(rgb, k) {
    const f = function (v) { return Math.max(0, Math.min(255, Math.round(v * k))); };
    return 'rgb(' + f(rgb[0]) + ',' + f(rgb[1]) + ',' + f(rgb[2]) + ')';
  }
  function hash(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function mix(rgb, to, t) { return [rgb[0] + (to[0] - rgb[0]) * t, rgb[1] + (to[1] - rgb[1]) * t, rgb[2] + (to[2] - rgb[2]) * t]; }

  // Aspect de fond de chaque famille de matériau (la teinte reste celle du matériau : on la mélange seulement vers une « matière »)
  const LOOK = {
    wood: [[96, 62, 34], 0.28], plank: [[132, 92, 52], 0.22], stick: [[72, 46, 28], 0.34], rope: [[206, 190, 150], 0.45],
    stone: [[128, 128, 134], 0.5], ore: [[64, 64, 72], 0.45], bar: [[255, 255, 255], 0.04], gem: [[255, 255, 255], 0.2],
  };

  /**
   * Texture du matériau : multiplicateur de luminosité par pixel, très contrasté, propre à chaque famille. A = position le long de la
   * diagonale, L = position en travers : bois = veines parallèles, planche = joints et clous, bâton = écorce et nœuds, corde = torsade,
   * pierre = grain en trois tons, minerai = roche sombre piquetée d'éclats, métal = bandes brillantes et rivets, cristal = facettes et éclats.
   */
  function texture(kind, x, y) {
    const A = x - y, L = x + y;
    switch (kind) {
      case 'wood': { const h = hash(L, 7); return h < 0.4 ? 0.6 : h > 0.8 ? 1.2 : 0.95; }
      case 'plank': return ((A % 6) + 6) % 6 === 0 ? (L % 2 === 0 ? 1.45 : 0.5) : (hash(L, 2) < 0.3 ? 0.78 : 1.02);
      case 'stick': return hash(A >> 1, L >> 1) < 0.14 ? 0.5 : (L % 3 === 0 ? 0.78 : 1.08);
      case 'rope': return ((A % 3) + 3) % 3 === 0 ? 0.5 : ((A % 3) + 3) % 3 === 1 ? 1.25 : 0.9;
      case 'stone': { const h = hash(x, y); return h < 0.18 ? 0.58 : h < 0.32 ? 0.8 : h > 0.86 ? 1.35 : 1; }
      case 'ore': { const h = hash(x * 3, y * 7); return h > 0.72 ? 2 : h < 0.25 ? 0.55 : 0.9; }
      case 'bar': { const b = L % 8; return (b === 3 ? 1.55 : b === 4 ? 1.3 : b === 7 ? 0.7 : b === 0 ? 0.78 : 1) + (A % 9 === 2 && b === 5 ? 0.45 : 0); }
      case 'gem': { const h = hash(x, y); return h > 0.88 ? 2.1 : 0.7 + 0.85 * hash(x >> 1, y >> 1); }
      default: return 1;
    }
  }
  const OUT = '#2c2a3a';

  /** Image 16×16 de l'arme (analyse complète ou aperçu) : dessin 14×14 de forgeGeo + contour sombre. Lumière en haut à gauche, texture du matériau. */
  function weaponCanvas(a) {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const g = cv.getContext('2d'), grid = {}, cols = a.pieces.map(rgbOf);
    for (const c of a.cells) grid[(c.x + 1) + ',' + (c.y + 1)] = c;
    const part = function (x, y) { const c = grid[x + ',' + y]; return c ? c.part : -2; };
    const en = a.ench, ec = en ? en.order.map(function (k) { return I.ENCH.ELEM[k]; }) : null;
    if (en) { // enchantée : halo doux puis contour aux couleurs des pierres (par bandes si deux éléments)
      for (const key of Object.keys(grid)) {
        const xy = key.split(','), x = +xy[0], y = +xy[1];
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx || dy) && part(nx, ny) === -2 && nx >= 0 && ny >= 0 && nx < 16 && ny < 16) { g.globalAlpha = 0.22; g.fillStyle = ec[((nx + ny) >> 1) % ec.length].col; g.fillRect(nx, ny, 1, 1); }
        }
      }
      g.globalAlpha = 1;
    }
    for (const key of Object.keys(grid)) {
      const xy = key.split(','), x = +xy[0], y = +xy[1];
      for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { // contour (derrière les pixels de l'arme)
        const nx = x + d[0], ny = y + d[1];
        if (part(nx, ny) === -2 && nx >= 0 && ny >= 0 && nx < 16 && ny < 16) { g.fillStyle = ec ? ec[((nx + ny) >> 1) % ec.length].col : OUT; g.fillRect(nx, ny, 1, 1); }
      }
    }
    for (const key of Object.keys(grid)) {
      const xy = key.split(','), x = +xy[0], y = +xy[1], c = grid[key];
      if (c.part < 0) { g.fillStyle = c.st === 'shine' ? '#ffffffd0' : '#3a3347'; g.fillRect(x, y, 1, 1); continue; } // détails fixes
      const piece = a.pieces[c.part], p = c.part;
      const lit = part(x - 1, y) !== p || part(x, y - 1) !== p, shade = part(x + 1, y) !== p || part(x, y + 1) !== p;
      const k = (lit && !shade ? 1.22 : shade && !lit ? 0.7 : 1) * (piece ? texture(piece.kind, x, y) : 1);
      g.globalAlpha = piece ? 1 : 0.55;
      const lk = piece && LOOK[piece.kind], base = lk ? mix(cols[p], lk[0], lk[1]) : cols[p];
      g.fillStyle = tone(base, k);
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
    if (ec) { // éclats de pierre sur la lame
      let n = 0; const keys = Object.keys(grid);
      keys.forEach(function (key, i) { const c = grid[key]; if (c.part >= 0 && (i * 7 + 3) % 6 === 0 && n < 4) { const xy = key.split(','); g.fillStyle = ec[n % ec.length].col2; g.fillRect(+xy[0], +xy[1], 1, 1); n++; } });
    }
    return cv;
  }

  /** Table du Forgeron : un établi solide portant une enclume et un marteau. */
  function tableSprite(h) {
    return h.mk(26, 18, function (g) {
      const rc = h.rc, px = h.px;
      rc(g, 1, 9, 24, 3, '#7a4e2c'); rc(g, 1, 9, 24, 1, '#a8703c'); rc(g, 1, 11, 24, 1, '#5e3a20'); // plateau
      rc(g, 2, 12, 3, 6, '#5e3a20'); rc(g, 21, 12, 3, 6, '#5e3a20'); rc(g, 2, 12, 1, 6, '#7a4e2c'); rc(g, 21, 12, 1, 6, '#7a4e2c'); // pieds
      rc(g, 5, 16, 16, 1, '#4a2e18');
      rc(g, 8, 7, 9, 2, '#4a4a58'); rc(g, 10, 5, 5, 2, '#5a5a68'); // pied et taille de l'enclume
      rc(g, 6, 2, 14, 3, '#8e8e9a'); rc(g, 6, 2, 14, 1, '#c0c0cc'); rc(g, 6, 4, 14, 1, '#6c6c7c'); // table de l'enclume
      rc(g, 2, 3, 5, 2, '#8e8e9a'); rc(g, 2, 3, 4, 1, '#c0c0cc'); px(g, 1, 4, '#6c6c7c'); // corne
      rc(g, 19, 3, 3, 2, '#6c6c7c');
      rc(g, 21, 6, 4, 2, '#8a5a32'); rc(g, 22, 4, 3, 2, '#6c6c7c'); px(g, 22, 4, '#c0c0cc'); // marteau posé
      px(g, 10, 2, '#ffffff'); px(g, 13, 2, '#e8e8f0');
    }, { ax: 13, ay: 18 });
  }

  I.forgeArt = { weaponCanvas: weaponCanvas, tableSprite: tableSprite, css: function (piece) { return tone(rgbOf(piece), 1); } };
})((window.Iles = window.Iles || {}));
