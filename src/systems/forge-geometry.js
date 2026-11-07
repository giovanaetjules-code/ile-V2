/*
 * Table du Forgeron : GÉOMÉTRIE. Chaque modèle d'arme est un petit dessin 14×14, construit avec quelques primitives (ligne, disque, rectangle)
 * dans un tableau de caractères, puis lu case par case. Chaque modèle a une SILHOUETTE bien à lui (épée longue et droite avec grande garde,
 * dague courte à lame large, lance verticale, hache à grande tête en croissant, masse à tête ronde hérissée de pointes).
 *
 * Légende : chaque caractère est une partie de l'arme et appartient à l'un des trois emplacements de la table (zone 0, 1 ou 2) :
 *   o pommeau (0)  0 poignée (0)  1 manche (1)  k garde / renfort (1)  l bas de lame (1)  2 lame (2)  h tête (2)  t pointe (2)
 *   d détail sombre et w éclat : fixes, ils ne dépendent d'aucun matériau.
 * Ajouter un modèle = écrire une fonction ci-dessous et une entrée dans MODELS (content/forge-data.js).
 */
(function (I) {
  const N = 14;
  const LEGEND = { o: ['pommel', 0], 0: ['grip', 0], 1: ['shaft', 1], k: ['guard', 1], l: ['blade', 1], 2: ['blade', 2], h: ['head', 2], t: ['tip', 2], d: ['detail', -1], w: ['shine', -1] };

  function canvas() {
    const g = []; for (let y = 0; y < N; y++) g.push(new Array(N).fill('.'));
    const set = function (x, y, ch) { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = ch; };
    return {
      g: g, set: set,
      /** ligne de (x0,y0) à (x1,y1) ; ox,oy : cases voisines ajoutées pour l'épaisseur */
      line: function (x0, y0, x1, y1, ch, thick) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let i = 0; i <= n; i++) {
          const x = Math.round(x0 + (x1 - x0) * i / (n || 1)), y = Math.round(y0 + (y1 - y0) * i / (n || 1));
          set(x, y, ch);
          if (thick) for (const t of thick) set(x + t[0], y + t[1], ch);
        }
      },
      rect: function (x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, ch); },
      disc: function (cx, cy, r, ch) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - cx, y - cy) <= r) set(x, y, ch); },
    };
  }

  /** remplit un polygone (liste de [x,y]) */
  function poly(c, pts, ch) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) c.set(x, y, ch);
    }
  }

  const SHAPES = {
    // longue lame droite, garde en croix, petit pommeau (axe : x + y = 13)
    sword: function (c) {
      c.line(8, 5, 6, 7, 'l', [[1, 0]]); c.line(11, 2, 9, 4, '2', [[1, 0]]);
      c.set(12, 1, 't'); c.set(13, 0, 't'); c.set(12, 0, 't'); c.set(13, 1, 't'); c.set(12, 2, '2');
      c.set(10, 3, 'w'); c.set(8, 5, 'w'); // éclats sur la lame
      c.line(3, 6, 7, 10, 'k', [[1, 0]]); // garde : traverse
      c.line(4, 9, 2, 11, '0', [[1, 0]]); c.set(5, 9, '0');
      c.rect(0, 12, 2, 2, 'o');
    },
    // courte, lame large en feuille, petite garde, pommeau rond
    dagger: function (c) {
      c.line(11, 2, 7, 6, '2', [[-1, 0], [0, 1]]); c.set(12, 1, 't'); c.set(11, 1, 't'); c.set(12, 2, 't');
      c.set(10, 3, 'w'); c.set(9, 4, 'w');
      c.line(4, 5, 8, 9, 'k', [[1, 0]]);
      c.line(5, 8, 3, 10, '0', [[1, 0]]);
      c.rect(1, 11, 2, 2, 'o'); c.set(1, 11, 'd');
    },
    // verticale : hampe fine, collerette, tête en losange
    spear: function (c) {
      c.line(7, 13, 7, 4, '1'); c.line(7, 13, 7, 9, '0', [[1, 0]]);
      c.rect(5, 5, 5, 1, 'k'); c.set(6, 6, 'k'); c.set(8, 6, 'k');
      c.set(7, 0, 't'); c.rect(6, 1, 3, 1, '2'); c.rect(5, 2, 5, 2, '2'); c.rect(6, 4, 3, 1, '2');
      c.line(7, 1, 7, 3, 'w'); c.set(7, 13, 'o'); c.set(6, 13, 'o'); c.set(8, 13, 'o');
    },
    // manche oblique, grosse tête trapézoïdale au tranchant arrondi
    axe: function (c) {
      c.line(3, 13, 11, 5, '1', [[1, 0]]); c.line(3, 13, 6, 10, '0', [[1, 0]]); c.set(2, 13, 'o'); c.set(3, 12, 'o'); c.set(2, 12, 'o');
      poly(c, [[10, 8], [13, 5], [10, 0], [4, 1], [3, 4]], 'h');
      c.line(4, 3, 9, 0, 'w'); c.set(3, 3, 'w');
      c.line(10, 7, 12, 5, 'k', [[-1, 0]]);
    },
    // boule hérissée de pointes
    mace: function (c) {
      c.line(1, 13, 8, 6, '1', [[1, 0]]); c.line(1, 13, 5, 9, '0', [[1, 0]]); c.set(0, 13, 'o'); c.set(1, 12, 'o'); c.set(0, 12, 'o');
      c.disc(9, 4, 3.2, 'h');
      for (const p of [[9, 0], [9, 8], [5, 4], [13, 4], [6, 1], [12, 1], [12, 7], [6, 7]]) c.set(p[0], p[1], 'h');
      c.line(8, 3, 10, 5, 'w'); c.set(8, 6, 'k'); c.set(9, 6, 'k'); c.set(7, 7, 'k');
    },
  };

  /** @returns {Array<{x,y,part,st}>} part = emplacement (0, 1 ou 2) qui fournit le matériau ; -1 pour les détails fixes. */
  function build(model) {
    const c = canvas();
    (SHAPES[model] || SHAPES.sword)(c);
    const cells = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const e = LEGEND[c.g[y][x]];
      if (e) cells.push({ x: x, y: y, st: e[0], part: e[1] });
    }
    return cells;
  }

  I.forgeGeo = { build: build, SIZE: N, SHAPES: SHAPES };
})((window.Iles = window.Iles || {}));
