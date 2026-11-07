/*
 * Tous les sprites sont dessinés pixel par pixel avec le Canvas au démarrage (aucun fichier image).
 * Chaque fabrique est indépendante : on peut remplacer n'importe quel sprite par une vraie spritesheet
 * plus tard sans toucher au reste du jeu. Éclairage : toujours en haut à gauche.
 */
(function (I) {
  'use strict';
  const T = I.TILE;
  const mul = I.rng.mulberry32;

  // ---------- outils de dessin ----------
  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
  function rc(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function disc(g, cx, cy, r, c) {
    g.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  function ell(g, cx, cy, rx, ry, c) {
    g.fillStyle = c;
    for (let dy = -ry; dy <= ry; dy++) {
      const k = Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)));
      const hw = Math.round(rx * Math.sqrt(k));
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }

  /** Ajoute un contour 1px autour des pixels opaques (dessine dans la marge de 1px prévue). */
  function outline(c, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    const id = g.getImageData(0, 0, w, h), d = id.data, out = new Uint8ClampedArray(d);
    const rgb = hexRgb(col);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] !== 0) continue;
        if ((x > 0 && d[i - 1] > 0) || (x < w - 1 && d[i + 7] > 0) || (y > 0 && d[i - w * 4 + 3] > 0) || (y < h - 1 && d[i + w * 4 + 3] > 0)) {
          out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = 255;
        }
      }
    }
    g.putImageData(new ImageData(out, w, h), 0, 0);
  }

  /** Sprite avec marge de 1px (pour le contour). Ancre par défaut : bas-centre. */
  function mk(w, h, draw, opts) {
    opts = opts || {};
    const pad = 1, ca = cv(w + 2, h + 2), c = ca[0], g = ca[1];
    g.translate(pad, pad);
    draw(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.outline !== false) outline(c, opts.outline || '#2c2a3a');
    return { c: c, ax: (opts.ax !== undefined ? opts.ax : w / 2) + pad, ay: (opts.ay !== undefined ? opts.ay : h) + pad };
  }
  function plain(w, h, draw, ax, ay) {
    const ca = cv(w, h); draw(ca[1]);
    return { c: ca[0], ax: ax, ay: ay };
  }
  function mapDraw(rows, pal) {
    return function (g) {
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch !== '.' && pal[ch]) px(g, x, y, pal[ch]);
      }
    };
  }
  function range(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }

  // ---------- palettes ----------
  const PAL = {
    grass: { base: '#6fb84a', dark: '#5fa63f', dark2: '#4f9438', light: '#86cb55', hi: '#9bdd68' },
    forest: { base: '#58a043', dark: '#4a8d38', dark2: '#3f7a31', light: '#6db250', hi: '#7cc45a' },
    sand: { base: '#ecd9a0', dark: '#d9c185', dark2: '#c9b070', light: '#f7e9bc', hi: '#fff6d6' },
    dirt: { base: '#b58b58', dark: '#9c7445', dark2: '#87633b', light: '#c9a06c', hi: '#d8b280' },
    oak: { deep: '#2a5f32', dark: '#3a7d3a', mid: '#58a845', light: '#7cc94f', hi: '#a4e06a' },
    blossom: { deep: '#a3496c', dark: '#c76a8c', mid: '#e88bb0', light: '#f7b3cc', hi: '#ffd7e6' },
    pine: { deep: '#245a3e', dark: '#2f6b4a', mid: '#3f8a5a', light: '#5aa86e', hi: '#7cc88a' },
  };

  // ---------- tuiles ----------
  function groundTile(pal, seed, kind) {
    const ca = cv(16, 16), c = ca[0], g = ca[1], r = mul(seed);
    rc(g, 0, 0, 16, 16, pal.base);
    for (let i = 0; i < 30; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.55 ? pal.dark : pal.light);
    for (let i = 0; i < 4; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, pal.dark2);
    if (kind === 'grass') {
      for (let i = 0; i < 4; i++) {
        const x = 1 + ((r() * 14) | 0), y = (r() * 13) | 0;
        px(g, x, y, pal.hi); px(g, x, y + 1, pal.dark2);
        if (r() < 0.5) px(g, x + 1, y + 1, pal.dark);
      }
    } else if (kind === 'sand') {
      for (let i = 0; i < 3; i++) { const x = 1 + ((r() * 13) | 0), y = 1 + ((r() * 13) | 0); rc(g, x, y, 2, 1, pal.dark2); px(g, x, y - 1, pal.hi); }
    } else if (kind === 'dirt') {
      for (let i = 0; i < 3; i++) { const x = 1 + ((r() * 13) | 0), y = 1 + ((r() * 13) | 0); rc(g, x, y, 2, 1, '#8c8a86'); px(g, x, y - 1, '#a8a6a0'); }
    }
    return c;
  }
  function plankTile(seed) {
    const ca = cv(16, 16), c = ca[0], g = ca[1], r = mul(seed);
    const cols = ['#c08856', '#b57d4a', '#c99262', '#b9824f'];
    for (let b = 0; b < 4; b++) {
      rc(g, 0, b * 4, 16, 4, cols[(r() * 4) | 0]);
      rc(g, 0, b * 4, 16, 1, '#d9a874'); rc(g, 0, b * 4 + 3, 16, 1, '#8a5a30');
      px(g, 1, b * 4 + 1, '#6e4a28'); px(g, 14, b * 4 + 1, '#6e4a28');
      px(g, 4 + ((r() * 8) | 0), b * 4 + 2, '#a8703c');
    }
    return c;
  }
  function waterFrames(deep, seed) {
    const pal = deep
      ? { base: '#2f86c4', dark: '#2873b3', line: '#4aa0d8', spark: '#9fd8f6' }
      : { base: '#4fb6dc', dark: '#3ea3d0', line: '#7fd2ee', spark: '#d4f4ff' };
    const r = mul(seed), dots = [], lines = [];
    for (let i = 0; i < 14; i++) dots.push([(r() * 16) | 0, (r() * 16) | 0]);
    for (let i = 0; i < 5; i++) lines.push({ x: (r() * 16) | 0, y: (r() * 16) | 0, len: 3 + ((r() * 3) | 0) });
    return range(4).map(function (f) {
      const ca = cv(16, 16), c = ca[0], g = ca[1];
      rc(g, 0, 0, 16, 16, pal.base);
      dots.forEach(function (d) { px(g, d[0], d[1], pal.dark); });
      lines.forEach(function (l, idx) {
        for (let k = 0; k < l.len; k++) px(g, (l.x + f * 4 + k) % 16, l.y, pal.line);
        if ((idx + f) % 4 === 0) px(g, (l.x + f * 4 + 1) % 16, (l.y + 15) % 16, pal.spark);
      });
      return c;
    });
  }
  function edgePx(g, d, i, k, col) {
    let x, y;
    if (d === 0) { x = i; y = k; } else if (d === 1) { x = 15 - k; y = i; } else if (d === 2) { x = i; y = 15 - k; } else { x = k; y = i; }
    px(g, x, y, col);
  }
  /** Franges irrégulières posées sur le bord d'une tuile (16 masques N/E/S/W). */
  function fringeSet(cols, seed) {
    const out = [null];
    for (let mask = 1; mask < 16; mask++) {
      const ca = cv(16, 16), g = ca[1], r = mul(seed + mask * 31);
      for (let d = 0; d < 4; d++) {
        if (!(mask & (1 << d))) continue;
        let depth = 1 + ((r() * 2) | 0);
        for (let i = 0; i < 16; i++) {
          depth = Math.max(0, Math.min(3, depth + [-1, 0, 0, 1][(r() * 4) | 0]));
          for (let k = 0; k < depth; k++) edgePx(g, d, i, k, cols[k === depth - 1 ? 1 : 0]);
        }
      }
      out.push(ca[0]);
    }
    return out;
  }
  /** Écume animée (4 images) au bord de l'eau. */
  function foamSets() {
    return range(4).map(function (f) {
      const arr = [null];
      for (let mask = 1; mask < 16; mask++) {
        const ca = cv(16, 16), g = ca[1];
        for (let d = 0; d < 4; d++) {
          if (!(mask & (1 << d))) continue;
          for (let i = 0; i < 16; i++) {
            if (((i + f * 2) % 8) < 6) edgePx(g, d, i, 0, '#f4fbff');
            if (((i + f * 2 + 3) % 8) < 4) edgePx(g, d, i, 1, '#bfe9f7');
            if ((f === 1 || f === 2) && ((i + f) % 3) === 0) edgePx(g, d, i, 2, '#8fd8ee');
          }
        }
        arr.push(ca[0]);
      }
      return arr;
    });
  }

  // ---------- végétation ----------
  function inCircles(cs, x, y, dx, dy, dr) {
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], ex = x - (c[0] + dx), ey = y - (c[1] + dy), rr = c[2] + dr;
      if (rr > 0 && ex * ex + ey * ey <= rr * rr) return true;
    }
    return false;
  }
  function treeSprite(seed, P, trunk) {
    return mk(40, 56, function (g) {
      const r = mul(seed);
      rc(g, 17, 34, 6, 20, trunk[0]); rc(g, 20, 34, 3, 20, trunk[1]); rc(g, 17, 34, 1, 20, trunk[2]);
      rc(g, 15, 50, 10, 4, trunk[0]); rc(g, 21, 50, 4, 4, trunk[1]); px(g, 16, 49, trunk[0]); px(g, 23, 49, trunk[1]);
      const j = function () { return ((r() * 3) | 0) - 1; };
      const cs = [[20, 13 + j(), 10], [10, 21 + j(), 8], [30, 21 + j(), 8], [20, 24, 10], [14, 28, 7], [26, 28, 7]];
      cs.forEach(function (c) { disc(g, c[0], c[1], c[2], P.dark); });
      cs.forEach(function (c) { disc(g, c[0] - 1, c[1] - 2, c[2] - 2, P.mid); });
      cs.forEach(function (c) { if (c[2] >= 8) disc(g, c[0] - 3, c[1] - 4, c[2] - 5, P.light); });
      disc(g, 16, 9, 2, P.hi);
      for (let i = 0; i < 70; i++) {
        const x = 3 + ((r() * 34) | 0), y = 1 + ((r() * 36) | 0);
        if (!inCircles(cs, x, y, 0, 0, 0)) continue;
        if (inCircles(cs, x, y, -3, -4, -5)) { px(g, x, y, P.hi); px(g, x + 1, y, P.hi); }
        else if (inCircles(cs, x, y, -1, -2, -2)) { px(g, x, y, P.light); px(g, x, y + 1, P.dark); }
        else px(g, x, y, P.deep);
      }
    }, { outline: '#1f3a2b' });
  }
  function pineSprite(seed) {
    const P = PAL.pine;
    return mk(32, 56, function (g) {
      const r = mul(seed);
      rc(g, 14, 44, 4, 10, '#6b4426'); rc(g, 16, 44, 2, 10, '#4f321b'); rc(g, 12, 51, 8, 3, '#6b4426'); rc(g, 16, 51, 4, 3, '#4f321b');
      [[2, 17, 8], [11, 17, 12], [21, 17, 14], [31, 15, 15]].forEach(function (L) {
        for (let row = 0; row < L[1]; row++) {
          let hw = Math.round(1 + row * (L[2] - 1) / (L[1] - 1));
          if (row % 3 === 2) hw += 1;
          for (let x = 16 - hw; x <= 16 + hw; x++) {
            let col = x < 16 - hw * 0.25 ? P.light : x > 16 + hw * 0.35 ? P.dark : P.mid;
            if (row >= L[1] - 2) col = P.deep;
            px(g, x, L[0] + row, col);
          }
          if (row % 4 === 1) px(g, 16 - hw + 1, L[0] + row, P.hi);
        }
        for (let i = 0; i < 6; i++) px(g, 10 + ((r() * 12) | 0), L[0] + 3 + ((r() * (L[1] - 5)) | 0), P.deep);
      });
    }, { outline: '#1b3a2d' });
  }
  function stumpSprite() {
    return mk(14, 10, function (g) {
      rc(g, 1, 3, 12, 6, '#7a4e2c'); rc(g, 1, 3, 3, 6, '#9a6a3c'); rc(g, 10, 3, 3, 6, '#5e3a20');
      ell(g, 7, 3, 6, 3, '#8a5a30'); ell(g, 7, 3, 5, 2, '#c89a62'); ell(g, 7, 3, 3, 1, '#b8884e'); px(g, 6, 3, '#8a5a30'); px(g, 8, 2, '#d8b280');
    });
  }
  function rockSprite(seed, ore) {
    return mk(16, 13, function (g) {
      const r = mul(seed), w = 6 + ((r() * 2) | 0);
      ell(g, 8, 8, w + 1, 4, '#6c6c7c'); ell(g, 7, 7, w, 4, '#8e8e9a'); ell(g, 6, 5, w - 3, 2, '#a9a9b6'); ell(g, 5, 4, 2, 1, '#cfcfda');
      px(g, 10, 9, '#5a5a6a'); px(g, 11, 8, '#5a5a6a'); px(g, 9, 10, '#5a5a6a');
      if (ore) { const oc = ore === true ? ['#d9824a', '#f2b27a'] : ore; for (let i = 0; i < 4; i++) { const x = 3 + ((r() * 8) | 0), y = 6 + ((r() * 4) | 0); rc(g, x, y, 2, 2, oc[0]); px(g, x, y, oc[1]); } }
    });
  }
  // ---------- minerais : une FORME par minerai (reconnaissable même sans la couleur) ----------
  // a = couleur du minerai, l = clair, d = sombre, w = éclat blanc ; cristaux : montent au-dessus de la roche (hi = true)
  const ORE_ART = {
    copper: { rows: ['............', '..aa........', '.allaa..aa..', '.aaaad.alla.', '..dd...aaad.', '.aa.....dd..', 'allaa...aa..', '.aadd..alla.'] }, // pépites rondes
    iron: { rows: ['d.......aa..', '.aa.....aad.', '..aad..aa...', '...aaaaad...', '....daad.aa.', '.aa..aa.aad.', '.aad.......d', '..dd........'] }, // filons en zigzag
    silver: { rows: ['...w........', '..waw...w...', '.wallaw.waw.', '..waw....w..', '...w..w..l..', '.....wal.l..', '......w..w..', '............'] }, // étoiles scintillantes
    gold: { rows: ['............', '...aaaa.....', '..allllaa...', '..aalwlaaa..', '.aaaaaaaadd.', '..dddddddd..', '..........a.', '........aad.'] }, // grosses pépites luisantes
    cobalt: { hi: true, rows: ['.....l......', '....lal.....', '....laa..l..', '.l..laa.lal.', 'lal.laad.laa', 'laad.aad.aad', '.aad.aad.aad', '.add.add.add', '..dd.add.dd.'] }, // prismes dressés
    mithril: { hi: true, rows: ['........ll..', '.......lala.', '..l...laad..', '.lal.laad...', 'laadlaad.l..', '.aadaad.lal.', '..dadd.laad.', '...dd...add.'] }, // lames penchées
    orichalque: { rows: ['...aaaaaa...', '..aallllaa..', '.aallddllaa.', '.alld..dlla.', '.alld..dlla.', '.aalldddlaa.', '..aallllaa..', '...aaaaaa...'] }, // géode en anneau
    adamantite: { hi: true, rows: ['....wllaa...', '...wllaaad..', '..wlaaaaadd.', '.wlaaaadddd.', '..daaadddd..', '...daadddd..', '....dadd....', '.....dd.....'] }, // gemme taillée
    titane: { rows: ['.aaaaaaa....', '.allllad.aa.', '.adddddd.ald', '..aaaaaaaaad', '..alllllllad', '..addddddddd', '.aaaaaa.....', '.adddda.....'] }, // plaques rivetées
  };
  function oreShade(hex, k) { // k > 0 éclaircit, k < 0 assombrit
    const v = [1, 3, 5].map(function (i) { const x = parseInt(hex.substr(i, 2), 16); return Math.round(k > 0 ? x + (255 - x) * k : x * (1 + k)); });
    return '#' + v.map(function (x) { return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2); }).join('');
  }
  function drawOreArt(g, id, cols, ox, oy, flip) {
    const A = ORE_ART[id], c = cols[0], map = { a: c, l: cols[1] || oreShade(c, 0.45), d: oreShade(c, -0.4), w: oreShade(c, 0.85) };
    A.rows.forEach(function (row, y) { for (let x = 0; x < row.length; x++) { const ch = row[flip ? row.length - 1 - x : x]; if (ch !== '.') px(g, ox + x, oy + y, map[ch]); } });
  }
  function oreSprite(id, seed, cols) {
    const A = ORE_ART[id];
    return mk(16, 13, function (g) {
      const r = mul(seed), w = 6 + ((r() * 2) | 0);
      if (A.hi) { ell(g, 8, 10, 7, 3, '#6c6c7c'); ell(g, 7, 9, 6, 3, '#8e8e9a'); ell(g, 5, 8, 2, 1, '#a9a9b6'); drawOreArt(g, id, cols, 2, 0, r() < 0.5); }
      else { ell(g, 8, 8, w + 1, 4, '#6c6c7c'); ell(g, 7, 7, w, 4, '#8e8e9a'); ell(g, 6, 5, w - 3, 2, '#a9a9b6'); ell(g, 5, 4, 2, 1, '#cfcfda'); px(g, 10, 9, '#5a5a6a'); px(g, 11, 8, '#5a5a6a'); drawOreArt(g, id, cols, 2, 4, r() < 0.5); }
    });
  }
  function iconOre(id, cols) {
    const A = ORE_ART[id];
    return function (g) {
      if (A.hi) { ell(g, 7, 11, 6, 2, '#6c6c7c'); ell(g, 6, 10, 5, 2, '#8e8e9a'); drawOreArt(g, id, cols, 1, 2, false); }
      else { ell(g, 7, 8, 6, 4, '#6c6c7c'); ell(g, 6, 7, 5, 4, '#8e8e9a'); ell(g, 5, 5, 3, 2, '#a9a9b6'); ell(g, 4, 4, 1, 1, '#d5d5e0'); drawOreArt(g, id, cols, 1, 3, false); }
    };
  }
  const CRYSTAL_ROWS = [
    '................', '.......c........', '......cCc.......', '......cCU.......', '.....cwCCU...c..', '.....cwCCU..cCc.',
    '.....cwCCUccCCU.', '..c..cwCCCUCCCU.', '.cCc.cwCCCUCCUU.', '.cCCcCwCCCCCCUU.', '.cCCCCCCCCCCUUU.',
    '..UCCCCCCUUUUU..', '..ggUUUUUUUggg..', '..dgggggggggggd.', '...dddddddddd...', '................',
  ];
  function crystalSprite() {
    return mk(16, 16, mapDraw(CRYSTAL_ROWS, { c: '#aef0ff', C: '#6fd3f5', w: '#e6fbff', U: '#3a9ad5', g: '#8e8e9a', d: '#6c6c7c' }), { ay: 15 });
  }
  function bushSprite(berries) {
    return mk(16, 14, function (g) {
      const dk = berries ? '#3a7d3a' : '#4a7a3a', md = berries ? '#58a845' : '#6a9a48', lt = berries ? '#7cc94f' : '#8ab85a';
      disc(g, 5, 8, 4, dk); disc(g, 11, 8, 4, dk); disc(g, 8, 6, 5, dk); rc(g, 2, 10, 12, 2, dk);
      disc(g, 5, 7, 3, md); disc(g, 11, 7, 3, md); disc(g, 8, 5, 4, md);
      disc(g, 6, 4, 2, lt); disc(g, 10, 5, 1, lt);
      if (berries) {
        [[4, 7], [9, 4], [11, 8], [7, 9], [6, 5]].forEach(function (b) { rc(g, b[0], b[1], 2, 2, '#d9423e'); px(g, b[0], b[1], '#ff8a8a'); });
      } else {
        px(g, 5, 7, '#7a4e2c'); px(g, 9, 8, '#7a4e2c'); px(g, 7, 9, '#7a4e2c'); px(g, 11, 6, '#7a4e2c');
      }
    }, { outline: '#1f3a2b' });
  }
  function flowerSprite(petal, center, v) {
    return plain(16, 16, function (g) {
      const heads = v ? [[5, 7], [11, 5]] : [[4, 5], [10, 7]];
      heads.forEach(function (h) {
        const x = h[0], y = h[1];
        rc(g, x, y + 2, 1, 6, '#3c8f3c'); px(g, x - 1, y + 5, '#58a845'); px(g, x + 1, y + 4, '#58a845'); px(g, x - 1, y + 4, '#58a845');
        px(g, x, y - 1, petal); px(g, x, y + 1, petal); px(g, x - 1, y, petal); px(g, x + 1, y, petal); px(g, x, y, center);
      });
    }, 8, 15);
  }
  function tuftSprite(seed) {
    return plain(14, 10, function (g) {
      const r = mul(seed);
      for (let i = 0; i < 6; i++) {
        const x = 1 + i * 2 + ((r() * 2) | 0), h = 4 + ((r() * 5) | 0), lean = r() < 0.5 ? -1 : 1;
        for (let row = 0; row < h; row++) px(g, x + (row > h * 0.6 ? lean : 0), 9 - row, row < 2 ? '#3f7a31' : row > h - 2 ? '#9bdd68' : '#5fa63f');
      }
    }, 7, 10);
  }
  function mushroomSprite() {
    return mk(8, 8, function (g) {
      rc(g, 3, 4, 2, 3, '#f2efe6'); rc(g, 3, 6, 2, 1, '#d8d2c0');
      rc(g, 1, 2, 6, 2, '#d9423e'); rc(g, 2, 1, 4, 1, '#d9423e'); px(g, 3, 1, '#ff7a70');
      px(g, 2, 2, '#f2efe6'); px(g, 5, 3, '#f2efe6');
    });
  }

  // ---------- décor et bâtiments ----------
  function signSprite() {
    return mk(20, 24, function (g) {
      rc(g, 9, 6, 3, 18, '#7a4e2c'); rc(g, 11, 6, 1, 18, '#5e3a20');
      rc(g, 2, 3, 14, 6, '#c08856'); rc(g, 16, 4, 1, 4, '#c08856'); px(g, 17, 5, '#c08856'); px(g, 17, 6, '#c08856');
      rc(g, 2, 3, 14, 1, '#d9a874'); rc(g, 2, 8, 14, 1, '#8a5a30'); rc(g, 4, 5, 9, 1, '#6e4a28'); rc(g, 4, 7, 5, 1, '#6e4a28');
      rc(g, 4, 11, 14, 6, '#c08856'); rc(g, 3, 12, 1, 4, '#c08856'); px(g, 2, 13, '#c08856'); px(g, 2, 14, '#c08856');
      rc(g, 4, 11, 14, 1, '#d9a874'); rc(g, 4, 16, 14, 1, '#8a5a30'); rc(g, 6, 13, 9, 1, '#6e4a28'); rc(g, 10, 15, 5, 1, '#6e4a28');
    });
  }
  function crateSprite(v) {
    return mk(14, 13, function (g) {
      rc(g, 0, 1, 14, 12, '#b9824f'); rc(g, 0, 1, 14, 2, '#d9a874'); rc(g, 0, 12, 14, 1, '#7a4e2c');
      rc(g, 0, 1, 1, 12, '#8a5a30'); rc(g, 13, 1, 1, 12, '#8a5a30');
      for (let i = 0; i < 9; i++) { px(g, 2 + i, 3 + i, '#8a5a30'); px(g, 11 - i, 3 + i, '#8a5a30'); }
      if (v) { px(g, 3, 2, '#e8483f'); px(g, 4, 2, '#e8483f'); }
    });
  }
  function barrelSprite() {
    return mk(12, 15, function (g) {
      rc(g, 1, 3, 10, 11, '#a8703c'); ell(g, 6, 3, 5, 2, '#c89a62'); ell(g, 6, 3, 3, 1, '#b8884e');
      rc(g, 3, 5, 1, 9, '#8a5a30'); rc(g, 6, 5, 1, 9, '#8a5a30'); rc(g, 9, 5, 1, 9, '#8a5a30');
      rc(g, 1, 6, 10, 1, '#4a4a58'); rc(g, 1, 11, 10, 1, '#4a4a58');
      rc(g, 1, 3, 1, 11, '#c08856');
    });
  }
  function houseSprite() {
    return mk(64, 64, function (g) {
      const R0 = '#b5503c', RD = '#8f3a2c', RL = '#d36f52';
      // murs
      rc(g, 4, 35, 56, 23, '#c89560');
      for (let x = 4; x < 60; x += 4) rc(g, x, 35, 1, 23, '#a97a48');
      rc(g, 4, 35, 56, 1, '#dcae7c'); rc(g, 56, 35, 4, 23, '#b0804c');
      // fondation en pierre
      rc(g, 2, 58, 60, 6, '#8c8c9a'); rc(g, 2, 58, 60, 1, '#a9a9b6');
      for (let x = 2; x < 62; x += 7) { rc(g, x, 60, 1, 2, '#6c6c7c'); rc(g, x + 3, 62, 1, 2, '#6c6c7c'); }
      rc(g, 2, 61, 60, 1, '#6c6c7c');
      // toit
      for (let row = 0; row < 30; row++) {
        const y = 4 + row, inset = Math.floor((29 - row) * 0.45);
        rc(g, inset, y, 64 - inset * 2, 1, row % 5 === 4 ? RD : R0);
        rc(g, inset, y, 2, 1, RL);
        const off = (Math.floor(row / 5) % 2) * 3;
        for (let x = inset + 3 + off; x < 64 - inset - 1; x += 6) if (row % 5 !== 4) px(g, x, y, RD);
      }
      rc(g, 0, 33, 64, 2, '#6e2b22'); rc(g, 0, 33, 64, 1, RD);
      // cheminée
      rc(g, 46, 2, 8, 16, '#9a8f8a'); rc(g, 52, 2, 2, 16, '#7e746e'); rc(g, 45, 0, 10, 3, '#6f6560'); rc(g, 46, 0, 8, 1, '#8a807a');
      for (let y = 5; y < 18; y += 4) rc(g, 46, y, 8, 1, '#7e746e');
      // porte
      rc(g, 25, 41, 14, 17, '#4a2c18'); rc(g, 26, 42, 12, 16, '#6e4326');
      rc(g, 31, 42, 1, 16, '#4a2c18'); rc(g, 26, 42, 12, 1, '#8a5a32'); px(g, 35, 51, '#f2c14e'); px(g, 28, 51, '#f2c14e');
      // fenêtres
      [10, 44].forEach(function (x) {
        rc(g, x - 1, 41, 12, 11, '#4a2c18'); rc(g, x, 42, 10, 9, '#9fd8ff');
        rc(g, x + 4, 42, 1, 9, '#4a2c18'); rc(g, x, 46, 10, 1, '#4a2c18');
        px(g, x + 1, 43, '#e6fbff'); px(g, x + 2, 43, '#e6fbff'); px(g, x + 1, 44, '#e6fbff');
        rc(g, x - 1, 52, 12, 3, '#7a4e2c'); rc(g, x - 1, 52, 12, 1, '#9a6a3c');
        [1, 4, 7, 9].forEach(function (dx, i) { px(g, x + dx, 51, i % 2 ? '#f6d743' : '#e8483f'); px(g, x + dx, 50, '#3c8f3c'); });
      });
    }, { ay: 64 });
  }
  function portalSprite() {
    return mk(48, 48, function (g) {
      const r = mul(77);
      rc(g, 2, 42, 44, 6, '#8c8c9a'); rc(g, 2, 42, 44, 1, '#a9a9b6'); rc(g, 2, 47, 44, 1, '#6c6c7c');
      for (let x = 4; x < 44; x += 8) rc(g, x, 44, 1, 3, '#6c6c7c');
      // fond sombre + spirale
      rc(g, 13, 15, 22, 27, '#241a40');
      ell(g, 24, 29, 9, 12, '#33275e'); ell(g, 24, 29, 6, 9, '#4b3a86'); ell(g, 24, 29, 3, 5, '#6a56b0');
      // piliers
      [4, 35].forEach(function (x) {
        rc(g, x, 12, 9, 32, '#9a9aa8'); rc(g, x, 12, 2, 32, '#b4b4c0'); rc(g, x + 7, 12, 2, 32, '#7a7a8a');
        for (let y = 16; y < 44; y += 7) rc(g, x, y, 9, 1, '#868696');
      });
      // linteau
      rc(g, 3, 6, 42, 9, '#9a9aa8'); rc(g, 3, 6, 42, 1, '#b4b4c0'); rc(g, 3, 14, 42, 1, '#7a7a8a');
      rc(g, 20, 3, 8, 5, '#aaaab8'); rc(g, 20, 3, 8, 1, '#c4c4d0');
      // mousse
      for (let i = 0; i < 26; i++) {
        const x = 3 + ((r() * 42) | 0), y = 4 + ((r() * 40) | 0);
        if ((x > 12 && x < 36 && y > 15 && y < 42)) continue;
        px(g, x, y, r() < 0.5 ? '#58a845' : '#3a7d3a');
      }
      // runes
      [[8, 20], [8, 27], [8, 34], [39, 22], [39, 29], [39, 36]].forEach(function (p) {
        px(g, p[0], p[1], '#7ff0ff'); px(g, p[0], p[1] + 1, '#7ff0ff'); px(g, p[0] - 1, p[1] + 1, '#7ff0ff'); px(g, p[0] + 1, p[1] + 2, '#7ff0ff');
      });
    }, { ay: 48 });
  }

  function workbenchSprite() {
    return mk(32, 24, function (g) {
      // pieds
      [[3, 3], [26, 3]].forEach(function (l) { rc(g, l[0], 13, 3, 10, '#6e4326'); rc(g, l[0] + 2, 13, 1, 10, '#4a2c18'); });
      rc(g, 3, 19, 26, 2, '#7a4e2c'); rc(g, 3, 19, 26, 1, '#8a5a32'); // traverse
      // plateau
      rc(g, 0, 7, 32, 7, '#b9824f'); rc(g, 0, 7, 32, 2, '#dcae7c'); rc(g, 0, 13, 32, 1, '#7a4e2c');
      for (let x = 5; x < 32; x += 9) rc(g, x, 9, 1, 4, '#9a6a3c');
      px(g, 7, 11, '#8a5a30'); px(g, 20, 10, '#8a5a30');
      // outils posés dessus : scie, marteau, planche
      rc(g, 3, 4, 12, 3, '#9aa7bd'); rc(g, 3, 4, 12, 1, '#d7e0ef'); for (let x = 3; x < 15; x += 2) px(g, x, 7, '#6c7a92');
      rc(g, 15, 3, 4, 4, '#a8703c'); rc(g, 16, 3, 2, 1, '#c89a62');
      rc(g, 22, 5, 1, 2, '#7a4e2c'); rc(g, 20, 3, 6, 3, '#6c7a92'); rc(g, 20, 3, 6, 1, '#a9b4c8');
      rc(g, 27, 5, 4, 2, '#c99262'); rc(g, 27, 5, 4, 1, '#e0b480');
    }, { ay: 23 });
  }

  // ---------- constructions ----------
  const OL = '#2c2a3a';
  function drawChest(g) {
    rc(g, 0, 5, 14, 7, '#a8703c'); rc(g, 0, 10, 14, 2, '#7a4e2c'); rc(g, 0, 5, 14, 1, '#7a4e2c');
    rc(g, 2, 0, 10, 1, '#c08856'); rc(g, 0, 1, 14, 4, '#c08856'); rc(g, 1, 1, 12, 1, '#dcae7c');
    rc(g, 2, 3, 1, 9, '#4a4a58'); rc(g, 3, 3, 1, 9, '#6c6c7c'); rc(g, 10, 3, 1, 9, '#4a4a58'); rc(g, 11, 3, 1, 9, '#6c6c7c');
    rc(g, 6, 4, 2, 3, '#f2c14e'); px(g, 6, 4, '#fff0a0'); px(g, 7, 6, '#c8901e');
  }
  function chestSprite() { return mk(14, 12, drawChest, { ax: 7, ay: 12 }); }
  function furnaceSprite(lit) {
    return mk(16, 18, function (g) {
      rc(g, 9, 0, 5, 5, '#6c6c7c'); rc(g, 9, 0, 5, 1, '#9a9aa8'); rc(g, 12, 0, 2, 5, '#4a4a58');
      rc(g, 0, 4, 16, 14, '#8e8e9a'); rc(g, 0, 4, 16, 2, '#b4b4c0'); rc(g, 0, 16, 16, 2, '#6c6c7c'); rc(g, 14, 6, 2, 10, '#7a7a8a');
      for (let y = 8; y < 16; y += 4) rc(g, 0, y, 16, 1, '#6c6c7c');
      for (let y = 6; y < 16; y += 4) { px(g, 3, y, '#6c6c7c'); px(g, 11, y + 0, '#6c6c7c'); }
      rc(g, 4, 10, 8, 8, '#2c2230'); rc(g, 5, 9, 6, 1, '#2c2230');
      if (lit) {
        rc(g, 5, 14, 6, 4, '#e8683a'); rc(g, 6, 12, 4, 6, '#f2a02a'); rc(g, 7, 13, 2, 5, '#ffe070'); px(g, 8, 11, '#f2a02a'); px(g, 5, 13, '#f2a02a');
      } else { rc(g, 5, 16, 6, 2, '#4a4050'); px(g, 7, 15, '#6a6070'); }
    }, { ax: 8, ay: 18 });
  }
  function bedSprite() {
    return mk(14, 16, function (g) {
      rc(g, 0, 0, 14, 16, '#7a4e2c'); rc(g, 0, 0, 14, 3, '#5e3a20'); rc(g, 0, 0, 14, 1, '#8a5a32'); rc(g, 0, 15, 14, 1, '#5e3a20');
      rc(g, 1, 3, 12, 12, '#f2efe6'); rc(g, 2, 4, 10, 4, '#ffffff'); rc(g, 2, 7, 10, 1, '#d8d2c0');
      rc(g, 1, 9, 12, 6, '#c0504a'); rc(g, 1, 9, 12, 1, '#e0807a'); rc(g, 1, 14, 12, 1, '#963a36'); rc(g, 3, 11, 8, 1, '#a8423e');
    }, { ax: 7, ay: 16 });
  }
  function lampSprite() {
    return mk(10, 26, function (g) {
      rc(g, 4, 11, 2, 15, '#4a4a58'); rc(g, 4, 11, 1, 15, '#6c6c7c'); rc(g, 2, 23, 6, 3, '#6c6c7c'); rc(g, 2, 23, 6, 1, '#8e8e9a');
      rc(g, 1, 3, 8, 9, '#4a4a58'); rc(g, 2, 4, 6, 7, '#ffe070'); rc(g, 3, 5, 4, 5, '#fff6b0'); rc(g, 4, 6, 2, 3, '#ffffff');
      rc(g, 0, 1, 10, 3, '#4a4a58'); rc(g, 1, 1, 8, 1, '#6c6c7c'); rc(g, 4, 0, 2, 1, '#4a4a58');
    }, { ax: 5, ay: 26 });
  }
  /** mask : 1 = voisin à gauche, 2 = voisin à droite. Dessiné sans contour automatique pour que les rails se joignent proprement. */
  function fenceSprite(mask) {
    return mk(16, 14, function (g) {
      [[mask & 1, 0, 8], [mask & 2, 8, 16]].forEach(function (s) {
        if (!s[0]) return;
        rc(g, s[1], 3, s[2] - s[1], 4, OL); rc(g, s[1], 4, s[2] - s[1], 2, '#c08856'); rc(g, s[1], 4, s[2] - s[1], 1, '#dcae7c');
        rc(g, s[1], 8, s[2] - s[1], 4, OL); rc(g, s[1], 9, s[2] - s[1], 2, '#c08856'); rc(g, s[1], 9, s[2] - s[1], 1, '#dcae7c');
      });
      rc(g, 5, 0, 6, 14, OL); rc(g, 6, 1, 4, 12, '#a8703c'); rc(g, 6, 1, 1, 12, '#c99262'); rc(g, 6, 1, 4, 1, '#dcae7c'); rc(g, 9, 2, 1, 11, '#7a4e2c');
    }, { outline: false, ax: 8, ay: 14 });
  }
  function floorWoodSprite() {
    return plain(16, 16, function (g) {
      const cols = ['#c99262', '#c08856', '#cf9a68', '#b9824f'];
      for (let b = 0; b < 4; b++) {
        rc(g, 0, b * 4, 16, 4, cols[b]); rc(g, 0, b * 4, 16, 1, '#dcae7c'); rc(g, 0, b * 4 + 3, 16, 1, '#8a5a30');
        rc(g, (b * 5 + 3) % 16, b * 4, 1, 4, '#8a5a30'); px(g, (b * 5 + 8) % 16, b * 4 + 1, '#a8703c');
      }
    }, 8, 16);
  }
  function pathStoneSprite() {
    return plain(16, 16, function (g) {
      rc(g, 0, 0, 16, 16, '#6c6c7c');
      [[1, 1, 6, 6], [8, 1, 7, 4], [1, 8, 5, 7], [7, 6, 8, 5], [7, 12, 4, 3], [12, 12, 3, 3], [12, 5, 3, 1]].forEach(function (s) {
        rc(g, s[0], s[1], s[2], s[3], '#9a9aa8'); rc(g, s[0], s[1], s[2], 1, '#b8b8c4'); rc(g, s[0], s[1] + s[3] - 1, s[2], 1, '#7a7a8a');
      });
    }, 8, 16);
  }
  function drawIconBench(g) {
    rc(g, 0, 4, 14, 4, '#b9824f'); rc(g, 0, 4, 14, 1, '#dcae7c'); rc(g, 0, 7, 14, 1, '#7a4e2c');
    rc(g, 1, 8, 2, 5, '#6e4326'); rc(g, 11, 8, 2, 5, '#6e4326'); rc(g, 3, 10, 8, 1, '#7a4e2c');
    rc(g, 2, 2, 5, 2, '#9aa7bd'); rc(g, 9, 1, 3, 3, '#6c7a92');
  }

  // ---------- personnage ----------
  // pc : couleurs (I.avatar.palette) ; av : apparence (coiffure hs, accessoire at). L'apparence 0 est le personnage d'origine.
  function drawPlayer(g, dir, f, pc, av) {
    const PC = pc, hs = av.hs, at = av.at, b = f % 2 === 1 ? -1 : 0, sw = f === 1 ? 1 : f === 3 ? -1 : 0;
    const hat = function (wide) { // chapeau : calotte + bord
      rc(g, 4, 1 + b, 8, 2, PC.scarf); rc(g, wide ? 2 : 3, 3 + b, wide ? 12 : 10, 1, PC.scarfD);
    };
    if (dir === 'down' || dir === 'up') {
      const front = dir === 'down';
      [5, 9].forEach(function (x, i) {
        const l = (i === 0 && f === 1) || (i === 1 && f === 3) ? 1 : 0;
        rc(g, x, 17, 3, 3 - l, i ? PC.pantD : PC.pant);
        rc(g, x, 20 - l, 3, 2, PC.boot); px(g, x, 20 - l, '#6a4a38');
      });
      rc(g, 2, 11 + b + sw, 2, 5, PC.tun); rc(g, 2, 16 + b + sw, 2, 1, PC.skin);
      rc(g, 12, 11 + b - sw, 2, 5, PC.tunD); rc(g, 12, 16 + b - sw, 2, 1, PC.skin);
      rc(g, 4, 10 + b, 8, 7, PC.tun); rc(g, 10, 10 + b, 2, 7, PC.tunD); rc(g, 5, 11 + b, 2, 3, PC.tunL);
      rc(g, 4, 15 + b, 8, 1, PC.belt);
      if (front) px(g, 7, 15 + b, '#f2c14e');
      if (at === 0) {
        rc(g, 4, 9 + b, 8, 2, PC.scarf); rc(g, 4, 10 + b, 8, 1, PC.scarfD);
        if (front) { rc(g, 9, 11 + b, 2, 2, PC.scarf); px(g, 10, 13 + b, PC.scarfD); }
        else { rc(g, 5, 11 + b, 3, 3, PC.scarf); px(g, 6, 14 + b, PC.scarfD); }
      } else rc(g, 4, 9 + b, 8, 1, PC.tunD);
      if (front) {
        rc(g, 4, 3 + b, 8, 6, PC.skin); rc(g, 4, 8 + b, 8, 1, PC.skinD);
        if (hs !== 4) {
          rc(g, 3, 2 + b, 10, 3, PC.hair); rc(g, 3, 4 + b, 1, 4, PC.hair); rc(g, 12, 4 + b, 1, 4, PC.hair);
          rc(g, 4, 4 + b, 3, 1, PC.hair); rc(g, 9, 4 + b, 3, 1, PC.hair); rc(g, 5, 2 + b, 3, 1, PC.hairL);
        } else rc(g, 4, 2 + b, 8, 1, PC.skin);
        if (hs === 1) { rc(g, 3, 4 + b, 1, 9, PC.hair); rc(g, 12, 4 + b, 1, 9, PC.hair); rc(g, 2, 8 + b, 1, 4, PC.hairD); rc(g, 13, 8 + b, 1, 4, PC.hairD); }
        if (hs === 2) { [3, 5, 7, 9, 11].forEach(function (x, i) { rc(g, x, 1 + b - (i % 2 ? 0 : 0), 2, 1, PC.hair); }); px(g, 4, b, PC.hair); px(g, 8, b, PC.hair); px(g, 11, b, PC.hair); }
        if (hs === 3) { rc(g, 6, 0 + b, 4, 2, PC.hair); px(g, 7, 0 + b, PC.hairL); }
        rc(g, 5, 6 + b, 1, 2, PC.eye); rc(g, 10, 6 + b, 1, 2, PC.eye);
        px(g, 4, 7 + b, '#e8a58c'); px(g, 11, 7 + b, '#e8a58c');
        if (at === 1) { rc(g, 3, 4 + b, 10, 1, PC.scarf); rc(g, 3, 5 + b, 10, 1, PC.scarfD); }
        if (at === 2) hat(true);
      } else {
        if (hs === 4) { rc(g, 3, 2 + b, 10, 7, PC.skin); rc(g, 3, 8 + b, 10, 1, PC.skinD); }
        else {
          rc(g, 3, 2 + b, 10, 7, PC.hair); rc(g, 5, 2 + b, 3, 1, PC.hairL); rc(g, 6, 8 + b, 4, 1, PC.hairD); rc(g, 4, 5 + b, 2, 1, PC.hairL);
          if (hs === 1) { rc(g, 3, 8 + b, 10, 5, PC.hair); rc(g, 4, 11 + b, 8, 2, PC.hairD); rc(g, 6, 9 + b, 2, 3, PC.hairL); }
          if (hs === 2) { [3, 5, 7, 9, 11].forEach(function (x) { rc(g, x, 1 + b, 2, 1, PC.hair); }); px(g, 4, b, PC.hair); px(g, 8, b, PC.hair); px(g, 11, b, PC.hair); }
          if (hs === 3) { rc(g, 5, 0 + b, 6, 3, PC.hair); rc(g, 6, 0 + b, 2, 1, PC.hairL); }
        }
        if (at === 1) { rc(g, 3, 4 + b, 10, 1, PC.scarf); rc(g, 3, 5 + b, 10, 1, PC.scarfD); }
        if (at === 2) hat(true);
      }
    } else {
      const legs = f === 1 ? [4, 9] : f === 3 ? [8, 5] : [6, 7];
      rc(g, legs[1], 17, 3, 3, PC.pantD); rc(g, legs[1] - 1, 20, 4, 2, '#33241a');
      rc(g, legs[0], 17, 3, 3, PC.pant); rc(g, legs[0] - 1, 20, 4, 2, PC.boot); px(g, legs[0] - 1, 20, '#6a4a38');
      rc(g, 5, 10 + b, 7, 7, PC.tun); rc(g, 10, 10 + b, 2, 7, PC.tunD); rc(g, 6, 11 + b, 2, 2, PC.tunL); rc(g, 5, 15 + b, 7, 1, PC.belt);
      if (at === 0) { rc(g, 5, 9 + b, 7, 2, PC.scarf); rc(g, 5, 10 + b, 7, 1, PC.scarfD); rc(g, 11, 10 + b, 3, 2, PC.scarf); px(g, 13, 12 + b, PC.scarfD); }
      else rc(g, 5, 9 + b, 7, 1, PC.tunD);
      rc(g, 6 + sw, 11 + b, 3, 5, PC.tunL); rc(g, 6 + sw, 16 + b, 3, 1, PC.skin);
      rc(g, 4, 3 + b, 8, 6, PC.skin); rc(g, 4, 8 + b, 8, 1, PC.skinD);
      if (hs !== 4) {
        rc(g, 4, 2 + b, 9, 3, PC.hair); rc(g, 8, 4 + b, 5, 5, PC.hair); rc(g, 5, 2 + b, 3, 1, PC.hairL); rc(g, 8, 5 + b, 1, 1, PC.hairL);
        if (hs === 1) { rc(g, 8, 4 + b, 5, 9, PC.hair); rc(g, 10, 6 + b, 2, 6, PC.hairD); rc(g, 9, 5 + b, 1, 5, PC.hairL); }
        if (hs === 2) { [4, 6, 8, 10].forEach(function (x) { rc(g, x, 1 + b, 2, 1, PC.hair); }); px(g, 5, b, PC.hair); px(g, 9, b, PC.hair); px(g, 12, 2 + b, PC.hair); }
        if (hs === 3) { rc(g, 11, 1 + b, 4, 4, PC.hair); px(g, 12, 1 + b, PC.hairL); rc(g, 8, 2 + b, 4, 1, PC.hair); }
      } else rc(g, 4, 2 + b, 8, 1, PC.skin);
      rc(g, 5, 6 + b, 1, 2, PC.eye); px(g, 3, 7 + b, PC.skinD);
      if (at === 1) { rc(g, 4, 4 + b, 9, 1, PC.scarf); rc(g, 4, 5 + b, 9, 1, PC.scarfD); }
      if (at === 2) { rc(g, 4, 1 + b, 8, 2, PC.scarf); rc(g, 3, 3 + b, 12, 1, PC.scarfD); }
    }
  }
  function flipSprite(s) {
    const ca = cv(s.c.width, s.c.height);
    ca[1].scale(-1, 1); ca[1].drawImage(s.c, -s.c.width, 0);
    return { c: ca[0], ax: s.c.width - s.ax, ay: s.ay };
  }

  // ---------- icônes d'inventaire (14x14 + contour = 16x16) ----------
  const WOOD_ROWS = [
    '..............', '..............', '..............', '....nnnnnnnn..', '..nnbbnnnnnnN.', '.nbWWWbnnnnnNN', '.nWbbbWnnnNnNN',
    '.nWbbbWnnnnNNN', '.nbWWWbnnNnnNN', '..nnbbnnnnnnN.', '....NNNNNNNN..', '..............', '..............', '..............',
  ];
  function iconRock(ore) {
    return function (g) {
      ell(g, 7, 8, 6, 4, '#6c6c7c'); ell(g, 6, 7, 5, 4, '#8e8e9a'); ell(g, 5, 5, 3, 2, '#a9a9b6'); ell(g, 4, 4, 1, 1, '#d5d5e0');
      px(g, 9, 10, '#5a5a6a'); px(g, 10, 9, '#5a5a6a');
      if (ore) { const oc = ore === true ? ['#d9824a', '#f2b27a'] : ore; [[6, 7], [9, 8], [4, 9], [8, 5]].forEach(function (p) { rc(g, p[0], p[1], 2, 2, oc[0]); px(g, p[0], p[1], oc[1]); }); }
    };
  }
  function iconFlower(col, cen) {
    return function (g) {
      rc(g, 7, 8, 1, 6, '#3c8f3c'); px(g, 6, 11, '#58a845'); px(g, 5, 10, '#58a845'); px(g, 8, 12, '#58a845'); px(g, 9, 11, '#58a845');
      [[7, 3], [4, 5], [10, 5], [5, 8], [9, 8]].forEach(function (p) { disc(g, p[0], p[1], 1, col); });
      disc(g, 7, 6, 1, cen);
    };
  }
  function axeIcon(c) {
    return function (g) {
      for (let i = 0; i < 11; i++) { px(g, 2 + i, 12 - i, '#7a4e2c'); px(g, 3 + i, 12 - i, '#a8703c'); }
      [[9, 1, 3], [8, 2, 5], [8, 3, 5], [8, 4, 4], [9, 5, 2]].forEach(function (r) {
        rc(g, r[0], r[1], r[2], 1, c[0]);
        px(g, r[0], r[1], c[1]); px(g, r[0] + r[2] - 1, r[1], c[2]);
      });
    };
  }
  function pickIcon(c) {
    return function (g) {
      for (let i = 0; i < 10; i++) { px(g, 3 + i, 12 - i, '#7a4e2c'); px(g, 4 + i, 12 - i, '#a8703c'); }
      for (let x = 2; x <= 12; x++) { const y = 2 + Math.floor(Math.abs(x - 7) / 2.5); px(g, x, y, c[0]); px(g, x, y + 1, c[2]); }
      px(g, 2, 5, c[1]); px(g, 12, 5, c[2]); px(g, 7, 2, c[1]); px(g, 6, 2, c[1]);
    };
  }
  const STEEL = ['#9aa7bd', '#d7e0ef', '#6c7a92'], COPPER = ['#d9824a', '#f6b684', '#a85a2c'], IRON = ['#5c6b86', '#b8c8e6', '#3a4660'];
  function barIcon(c) { // lingot : [face, dessus clair, dessous sombre, côté, reflet]
    return function (g) {
      rc(g, 2, 6, 11, 5, c[0]); rc(g, 3, 4, 9, 2, c[1]); rc(g, 1, 10, 13, 2, c[2]);
      rc(g, 4, 5, 3, 1, c[4]); rc(g, 2, 6, 1, 5, c[1]); rc(g, 12, 6, 1, 5, c[3]);
    };
  }

  // ---------- nature supplémentaire (content/nature.js) ----------
  const NPAL = {
    birch: { deep: '#4a8a3a', dark: '#6aa845', mid: '#8cc858', light: '#aee070', hi: '#d0f090' },
    autumn: { deep: '#8a3a10', dark: '#c0561a', mid: '#e8801f', light: '#f5a83a', hi: '#ffd070' },
    maple: { deep: '#6a1a1a', dark: '#a02a22', mid: '#d0453a', light: '#e87a5a', hi: '#ffb08a' },
    willow: { deep: '#3a6a3a', dark: '#5a8a48', mid: '#7aaa5a', light: '#9ac878', hi: '#bce098' },
    cypress: { deep: '#1f4a35', dark: '#2a5a40', mid: '#3a7a52', light: '#4f9a66', hi: '#6ab880' },
    acacia: { deep: '#6a7a22', dark: '#8a9a30', mid: '#aab848', light: '#c4d468', hi: '#dce890' },
  };
  const BARK = ['#7a4e2c', '#5a3a20', '#9a6a3a'];
  function ln(g, x0, y0, x1, y1, c, w) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) rc(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w || 1, w || 1, c);
  }
  function tweak(s, fn) { const g = s.c.getContext('2d'); g.translate(1, 1); fn(g); g.setTransform(1, 0, 0, 1, 0, 0); return s; }
  function alphaAt(s, x, y) { return s.c.getContext('2d').getImageData(x + 1, y + 1, 1, 1).data[3]; }
  function rockSprite2(seed, P, o) {
    o = o || {};
    const W = o.W || 16, Hh = o.H || 13, s = o.s || 1;
    return mk(W, Hh, function (g) {
      const r = mul(seed), w = Math.round((6 + ((r() * 2) | 0)) * s), cx = Math.floor(W / 2), cy = Hh - Math.round(5 * s), ry = Math.round(4 * s);
      ell(g, cx, cy, w + 1, ry, P[0]); ell(g, cx - 1, cy - 1, w, ry, P[1]); ell(g, cx - 2, cy - Math.round(3 * s), w - 3, Math.round(2 * s), P[2]); ell(g, cx - 3, cy - Math.round(4 * s), 2, 1, P[3]);
      if (o.layers) for (let k = 0; k < 3; k++) rc(g, cx - w + 2, cy - 2 + k * 2, w * 2 - 3, 1, P[0]);
      if (o.moss) for (let k = 0; k < 9; k++) px(g, cx - w + 2 + ((r() * (w * 2 - 4)) | 0), cy - ry + ((r() * (ry + 2)) | 0), k % 2 ? '#5fa63f' : '#7ec850');
      if (o.dots) for (let k = 0; k < 5; k++) { const x = cx - w + 2 + ((r() * (w * 2 - 5)) | 0), y = cy - 2 + ((r() * 5) | 0); rc(g, x, y, 2, 2, o.dots); px(g, x, y, o.dots2 || o.dots); }
    });
  }
  function palmSprite(seed, dir) {
    return mk(40, 52, function (g) {
      for (let i = 0; i < 34; i++) { const x = 18 + Math.round(Math.sin(i / 34 * 1.3) * 5 * dir), y = 50 - i; rc(g, x, y, 4, 1, '#9a6a3a'); rc(g, x + 2, y, 2, 1, '#7a4e2c'); if (i % 5 === 0) rc(g, x, y, 4, 1, '#6a4420'); }
      const cx = 18 + Math.round(Math.sin(1.3) * 5 * dir) + 2, cy = 17;
      for (let k = 0; k < 7; k++) {
        const a = Math.PI - k * Math.PI / 6;
        for (let t = 0; t < 15; t++) { const x = Math.round(cx + Math.cos(a) * t * 1.3), y = Math.round(cy - Math.sin(a) * t * 0.55 + t * t * 0.05); rc(g, x, y, 2, 2, '#3a7d3a'); px(g, x, y - 1, t % 2 ? '#7cc94f' : '#58a845'); }
      }
      disc(g, cx - 1, cy + 3, 2, '#6a4420'); disc(g, cx + 2, cy + 4, 2, '#5a3a20');
    }, { outline: '#1f3a2b' });
  }
  function deadTreeSprite(seed) {
    return mk(28, 48, function (g) {
      const r = mul(seed), c = '#6a5a4a';
      rc(g, 11, 22, 5, 26, c); rc(g, 14, 22, 2, 26, '#4a3a2e'); rc(g, 9, 44, 9, 4, c); rc(g, 11, 22, 1, 26, '#8a7a68');
      ln(g, 12, 26, 4, 14 + ((r() * 4) | 0), c, 2); ln(g, 15, 22, 22, 8 + ((r() * 4) | 0), c, 2); ln(g, 13, 18, 13, 3, c, 2);
      ln(g, 5, 16, 2, 10, c); ln(g, 21, 12, 25, 6, c); ln(g, 13, 10, 9, 5, c); ln(g, 12, 33, 20, 26, c);
    }, { outline: '#2a2420' });
  }
  function cypressSprite(seed) {
    const P = NPAL.cypress;
    return mk(20, 56, function (g) {
      rc(g, 9, 50, 3, 6, '#6b4426');
      for (let row = 0; row < 51; row++) {
        const hw = Math.max(1, Math.round(7 * Math.pow(Math.sin(Math.PI * (row + 6) / 60), 0.7)));
        for (let x = 10 - hw; x <= 10 + hw; x++) px(g, x, row, row % 5 === 4 ? P.deep : x < 10 - hw * 0.3 ? P.light : x > 10 + hw * 0.35 ? P.dark : P.mid);
      }
    }, { outline: '#12301f' });
  }
  function acaciaSprite(seed) {
    const P = NPAL.acacia;
    return mk(44, 40, function (g) {
      ln(g, 22, 39, 21, 20, '#7a5a3a', 3); ln(g, 21, 24, 12, 14, '#7a5a3a', 2); ln(g, 22, 23, 32, 14, '#7a5a3a', 2); rc(g, 19, 36, 7, 3, '#7a5a3a');
      ell(g, 22, 12, 20, 6, P.dark); ell(g, 22, 10, 19, 5, P.mid); ell(g, 17, 8, 12, 2, P.light); ell(g, 14, 7, 5, 1, P.hi);
      const r = mul(seed); for (let i = 0; i < 18; i++) px(g, 4 + ((r() * 36) | 0), 8 + ((r() * 8) | 0), P.deep);
    }, { outline: '#3a4414' });
  }
  function shroomTreeSprite(seed) {
    return mk(36, 44, function (g) {
      rc(g, 14, 20, 8, 22, '#f2efe6'); rc(g, 19, 20, 3, 22, '#d8d2c0'); rc(g, 12, 40, 12, 3, '#d8d2c0');
      ell(g, 18, 16, 16, 11, '#a8302c'); ell(g, 18, 14, 15, 10, '#d9423e'); ell(g, 14, 10, 9, 5, '#e8685a'); rc(g, 3, 24, 30, 2, '#8a2a26');
      disc(g, 9, 15, 2, '#f2efe6'); disc(g, 22, 9, 2, '#f2efe6'); disc(g, 27, 17, 2, '#f2efe6'); disc(g, 16, 18, 1, '#f2efe6'); px(g, 13, 7, '#ffffff');
    }, { outline: '#3a1a1a' });
  }
  function bambooSprite(seed) {
    return mk(24, 50, function (g) {
      [[4, 40], [10, 34], [16, 44]].forEach(function (s) {
        const x = s[0], h = s[1], top = 50 - h;
        rc(g, x, top, 3, h, '#7cc94f'); rc(g, x, top, 1, h, '#a4e06a'); rc(g, x + 2, top, 1, h, '#58a845');
        for (let y = top + 6; y < 50; y += 8) rc(g, x - 1, y, 5, 1, '#3c8f3c');
        ln(g, x + 3, top + 2, x + 8, top - 1, '#58a845'); ln(g, x, top + 4, x - 4, top + 1, '#7cc94f');
      });
    }, { outline: '#1f3a2b' });
  }
  function fernSprite(seed) {
    return plain(16, 14, function (g) {
      const r = mul(seed);
      [-1.2, -0.7, -0.25, 0.25, 0.7, 1.2].forEach(function (a) {
        const len = 6 + ((r() * 3) | 0);
        for (let t = 1; t <= len; t++) {
          const x = Math.round(8 + Math.sin(a) * t), y = Math.round(13 - Math.cos(a) * t);
          px(g, x, y, t < 3 ? '#3f8a3a' : t > len - 2 ? '#86cb55' : '#5fa63f');
          if (t % 2 === 0 && t > 2) { px(g, x - 1, y, '#5fa63f'); px(g, x + 1, y, '#5fa63f'); }
        }
      });
    }, 8, 14);
  }
  function reedsSprite(seed) {
    return plain(14, 20, function (g) {
      [[2, 14], [5, 18], [8, 12], [11, 16]].forEach(function (s, i) {
        rc(g, s[0], 20 - s[1], 1, s[1], '#9aa84a'); px(g, s[0] + 1, 20 - s[1] + 4, '#7a8a38');
        if (i % 2) { rc(g, s[0] - 0, 20 - s[1] - 2, 2, 4, '#7a4e2a'); px(g, s[0], 20 - s[1] - 2, '#9a6a3a'); }
      });
    }, 7, 20);
  }
  function cactusSprite(seed) {
    return mk(16, 24, function (g) {
      rc(g, 6, 5, 5, 19, '#58a845'); rc(g, 7, 4, 3, 1, '#58a845'); rc(g, 6, 5, 1, 19, '#7cc94f'); rc(g, 10, 5, 1, 19, '#3c8f3c');
      rc(g, 2, 13, 5, 3, '#58a845'); rc(g, 2, 8, 3, 6, '#58a845'); rc(g, 2, 8, 1, 6, '#7cc94f');
      rc(g, 10, 10, 4, 3, '#58a845'); rc(g, 12, 5, 3, 7, '#58a845'); rc(g, 14, 5, 1, 7, '#3c8f3c');
      [[8, 8], [8, 13], [8, 18], [3, 10], [13, 8]].forEach(function (p) { px(g, p[0], p[1], '#f2efe6'); });
      px(g, 8, 3, '#e8508a'); px(g, 7, 3, '#f08ab0'); px(g, 9, 3, '#f08ab0');
    }, { outline: '#1f3a2b' });
  }
  function sunflowerSprite(seed) {
    return mk(14, 26, function (g) {
      rc(g, 6, 11, 2, 15, '#3c8f3c'); rc(g, 2, 17, 4, 2, '#58a845'); rc(g, 8, 20, 4, 2, '#58a845'); px(g, 2, 16, '#58a845'); px(g, 11, 19, '#58a845');
      disc(g, 7, 6, 5, '#e8b520'); disc(g, 7, 6, 4, '#f6d743'); disc(g, 7, 6, 2, '#7a4e2c'); px(g, 6, 5, '#a8702c'); px(g, 8, 7, '#a8702c');
    }, { outline: '#3a3a14' });
  }
  function tallGrassSprite(seed) {
    return plain(16, 16, function (g) {
      const r = mul(seed);
      for (let i = 0; i < 12; i++) {
        const x = 1 + i + ((r() * 2) | 0) - 1, h = 8 + ((r() * 7) | 0), lean = r() < 0.5 ? -1 : 1;
        for (let row = 0; row < h; row++) px(g, x + (row > h * 0.55 ? lean : 0) + (row > h * 0.85 ? lean : 0), 15 - row, row < 3 ? '#3f7a31' : row > h - 3 ? '#a4e06a' : '#5fa63f');
      }
    }, 8, 16);
  }
  function pumpkinSprite() {
    return mk(14, 12, function (g) {
      ell(g, 7, 7, 6, 4, '#c0601a'); ell(g, 7, 6, 5, 3, '#f08a2a'); rc(g, 5, 3, 1, 7, '#c0601a'); rc(g, 9, 3, 1, 7, '#c0601a'); rc(g, 7, 3, 1, 7, '#d8701e');
      rc(g, 6, 1, 2, 3, '#3c8f3c'); px(g, 4, 5, '#ffb060'); px(g, 5, 4, '#ffb060');
    }, { outline: '#4a2a10' });
  }
  function wheatSprite(seed) {
    return plain(14, 20, function (g) {
      const r = mul(seed);
      [2, 5, 8, 11].forEach(function (x, i) {
        const top = 4 + ((r() * 4) | 0) + (i % 2) * 2;
        rc(g, x, top + 3, 1, 20 - top - 3, '#c9a84a'); rc(g, x - 1, top, 3, 5, '#e0c060'); px(g, x, top, '#f2dc8a'); px(g, x - 1, top + 3, '#b89440'); px(g, x + 1, top + 2, '#b89440');
      });
    }, 7, 20);
  }
  function shroomSprite(cap, spot) {
    return mk(8, 8, function (g) {
      rc(g, 3, 4, 2, 3, '#f2efe6'); rc(g, 3, 6, 2, 1, '#d8d2c0'); rc(g, 1, 2, 6, 2, cap); rc(g, 2, 1, 4, 1, cap); px(g, 3, 1, spot); px(g, 2, 2, spot); px(g, 5, 3, spot);
    });
  }
  function bushColorSprite(dk, md, lt, bc) {
    return mk(16, 14, function (g) {
      disc(g, 5, 8, 4, dk); disc(g, 11, 8, 4, dk); disc(g, 8, 6, 5, dk); rc(g, 2, 10, 12, 2, dk);
      disc(g, 5, 7, 3, md); disc(g, 11, 7, 3, md); disc(g, 8, 5, 4, md); disc(g, 6, 4, 2, lt); disc(g, 10, 5, 1, lt);
      [[4, 7], [9, 4], [11, 8], [7, 9], [6, 5]].forEach(function (b) { rc(g, b[0], b[1], 2, 2, bc); px(g, b[0], b[1], '#a8b8ff'); });
    }, { outline: '#1f3a2b' });
  }
  function logSprite() {
    return mk(22, 10, function (g) {
      rc(g, 2, 2, 18, 7, '#8a5a30'); rc(g, 2, 2, 18, 2, '#a8703c'); rc(g, 2, 7, 18, 2, '#5e3a20');
      ell(g, 3, 5, 2, 3, '#c99262'); ell(g, 19, 5, 2, 3, '#dcae7c'); px(g, 19, 5, '#a8703c'); px(g, 3, 5, '#a8703c');
      [[7, 5], [11, 6], [14, 4]].forEach(function (p) { px(g, p[0], p[1], '#4a2a14'); }); rc(g, 8, 2, 5, 1, '#5fa63f');
    });
  }
  function pebblesSprite(seed) {
    return mk(14, 8, function (g) {
      ell(g, 4, 5, 3, 2, '#7a7a88'); ell(g, 4, 4, 3, 2, '#9a9aa8'); ell(g, 9, 5, 4, 2, '#7a7a88'); ell(g, 9, 4, 4, 2, '#a9a9b6'); px(g, 3, 3, '#cfcfda'); px(g, 8, 3, '#cfcfda'); ell(g, 12, 6, 1, 1, '#8e8e9a');
    });
  }
  function claySprite() {
    return mk(16, 8, function (g) {
      ell(g, 8, 5, 7, 3, '#a8602a'); ell(g, 8, 4, 6, 2, '#c9803a'); ell(g, 6, 3, 3, 1, '#e0a060'); px(g, 10, 4, '#8a4a20'); px(g, 11, 5, '#8a4a20'); px(g, 5, 5, '#8a4a20');
    });
  }
  const ICON_KINDS = {
    mgem: function (g, a, hi, d) { I.enchantArt.gem(g, a, hi, d); },
    mgem2: function (g, a, hi, b, d) { I.enchantArt.gem2(g, a, hi, b, d); },
    fruit: function (g, a, leaf, rx, ry) { ell(g, 7, 8, rx + 1, ry + 1, a); rc(g, 7 - rx + 1, 8 - ry + 1, 2, 1, '#ffffff'); rc(g, 7, 8 - ry - 2, 1, 2, '#6a4420'); rc(g, 8, 8 - ry - 2, 3, 2, leaf); },
    chunk: function (g, a, b) { ell(g, 7, 8, 5, 3, a); ell(g, 6, 7, 3, 2, b); px(g, 10, 9, '#000000'); },
    stalk: function (g, a, b) { rc(g, 6, 1, 3, 12, a); rc(g, 6, 1, 1, 12, '#a4e06a'); rc(g, 5, 4, 5, 1, b); rc(g, 5, 8, 5, 1, b); },
    ears: function (g, a) { [3, 7, 11].forEach(function (x, i) { rc(g, x, 6 + i % 2, 1, 7, '#c9a84a'); rc(g, x - 1, 1 + i % 2, 3, 5, a); px(g, x, 1 + i % 2, '#f2dc8a'); }); },
    flower: function (g, a, b) { rc(g, 7, 7, 1, 6, '#3c8f3c'); rc(g, 5, 10, 2, 1, '#58a845'); rc(g, 6, 2, 3, 2, a); rc(g, 6, 6, 3, 2, a); rc(g, 4, 4, 2, 3, a); rc(g, 9, 4, 2, 3, a); rc(g, 6, 4, 3, 3, b); },
    mush: function (g, a, b) { rc(g, 6, 7, 3, 5, '#f2efe6'); ell(g, 7, 6, 5, 3, a); px(g, 5, 5, b); px(g, 9, 6, b); px(g, 7, 4, b); },
  };
  Object.assign(ICON_KINDS, { // nourriture : carotte, chou / herbe, graines, viande
    root: function (g, a, leaf) { rc(g, 6, 1, 1, 4, leaf); rc(g, 8, 2, 1, 3, leaf); rc(g, 7, 2, 1, 3, leaf); rc(g, 5, 5, 5, 2, a); rc(g, 6, 7, 3, 3, a); rc(g, 7, 10, 1, 2, a); rc(g, 5, 5, 1, 1, '#ffffff'); },
    head: function (g, a, b) { ell(g, 7, 8, 5, 4, a); ell(g, 7, 7, 3, 2, b); rc(g, 4, 6, 1, 4, b); },
    seed: function (g, a) { [[4, 7], [8, 5], [6, 10], [9, 9]].forEach(function (q) { rc(g, q[0], q[1], 2, 3, '#5a4430'); rc(g, q[0], q[1], 1, 1, a); }); },
    book: function (g, a, b) { rc(g, 3, 2, 10, 12, a); rc(g, 3, 2, 10, 1, '#c8905a'); rc(g, 4, 3, 1, 10, '#3b2514'); rc(g, 6, 5, 5, 1, b); rc(g, 6, 7, 5, 1, b); rc(g, 6, 9, 3, 1, b); },
    meat: function (g, a, b) { ell(g, 7, 8, 5, 4, a); ell(g, 6, 7, 3, 2, b); rc(g, 10, 4, 2, 3, '#f2efe6'); rc(g, 11, 3, 2, 2, '#f2efe6'); },
  });
  const SKIN = ['#6b4426'];
  const NATURE_SPRITES = {
    tree_birch: function (s) { return tweak(treeSprite(s, NPAL.birch, ['#e8e4d8', '#c9c4b4', '#f6f3ea']), function (g) { for (let i = 0; i < 6; i++) rc(g, 18 + (i % 2), 36 + i * 3, 2, 1, '#3a3a3a'); }); },
    tree_autumn: function (s) { return treeSprite(s, NPAL.autumn, BARK); },
    tree_maple: function (s) { return treeSprite(s, NPAL.maple, ['#6a4a3a', '#4a3226', '#8a6a52']); },
    tree_apple: function (s) {
      const t = treeSprite(s, PAL.oak, BARK), r = mul(s + 7);
      return tweak(t, function (g) { for (let k = 0; k < 40 && k < 60; k++) { const x = 8 + ((r() * 24) | 0), y = 8 + ((r() * 22) | 0); if (alphaAt(t, x, y) && k < 11) { rc(g, x, y, 2, 2, '#d9423e'); px(g, x, y, '#ff8a8a'); } } });
    },
    tree_willow: function (s) {
      const t = treeSprite(s, NPAL.willow, BARK), r = mul(s + 3);
      return tweak(t, function (g) { for (let x = 6; x <= 34; x += 2) { let yb = -1; for (let y = 40; y >= 22; y--) if (alphaAt(t, x, y)) { yb = y; break; } if (yb < 0) continue; const len = 7 + ((r() * 8) | 0); for (let k = 1; k <= len; k++) px(g, x, yb + k, k > len - 2 ? '#9ac878' : (x % 4 ? '#5a8a48' : '#7aaa5a')); } });
    },
    tree_cypress: cypressSprite, tree_acacia: acaciaSprite, tree_shroom: shroomTreeSprite,
    tree_palm: function (s) { return palmSprite(s, s % 2 ? 1 : -1); },
    tree_dead: deadTreeSprite, bamboo: bambooSprite,
    rock_big: function (s) { return rockSprite2(s, ['#5a5a6a', '#7e7e8c', '#9a9aa8', '#c4c4d0'], { W: 28, H: 22, s: 1.7 }); },
    rock_mossy: function (s) { return rockSprite2(s, ['#5a6a5a', '#7a8a7a', '#96a696', '#bccbbc'], { moss: 1 }); },
    rock_sandstone: function (s) { return rockSprite2(s, ['#a88a5a', '#c9a874', '#dcc08c', '#f0dcae'], { layers: 1 }); },
    rock_slate: function (s) { return rockSprite2(s, ['#3a3c4a', '#555868', '#6e7284', '#9298ac'], { layers: 1 }); },
    rock_pink: function (s) { return rockSprite2(s, ['#9a6a7a', '#c08a9a', '#dcaab8', '#f4d0da']); },
    ore_iron: function (s) { return oreSprite('iron', s, ['#a8553a', '#e0987a']); },
    ore_silver: function (s) { return oreSprite('silver', s, ['#dfe6f4', '#ffffff']); },
    ore_gold: function (s) { return oreSprite('gold', s, ['#f2c014', '#fff0a0']); },
    ore_coal: function (s) { return rockSprite2(s, ['#3a3a44', '#55555f', '#6e6e7a', '#9a9aa6'], { dots: '#16161c', dots2: '#3a3a44' }); },
    pebbles: pebblesSprite, clay: claySprite, fern: fernSprite, reeds: reedsSprite, cactus: cactusSprite, sunflower: sunflowerSprite,
    flower_white: function (s) { return flowerSprite('#ffffff', '#f2c14e', s % 2); },
    flower_pink: function (s) { return flowerSprite('#f08ab0', '#f2c14e', s % 2); },
    flower_purple: function (s) { return flowerSprite('#9a5ad8', '#f2c14e', s % 2); },
    flower_orange: function (s) { return flowerSprite('#f08a2a', '#7a4e2c', s % 2); },
    bush_blueberry: function () { return bushColorSprite('#3a6a4a', '#58a06a', '#7cc88a', '#4f6ae0'); },
    tall_grass: tallGrassSprite, pumpkin: pumpkinSprite, wheat: wheatSprite,
    mushroom_brown: function () { return shroomSprite('#9a6a3a', '#d8b888'); },
    mushroom_blue: function () { return shroomSprite('#3a8ae8', '#b8f0ff'); },
    log_fallen: logSprite,
  };

  const ICONS = {
    wood: mapDraw(WOOD_ROWS, { n: '#a8703c', N: '#7a4e2c', b: '#c89a62', W: '#e6c48a' }),
    stick: function (g) {
      for (let i = 0; i < 11; i++) { px(g, 2 + i, 12 - i, '#7a4e2c'); px(g, 3 + i, 12 - i, '#a8703c'); }
      px(g, 6, 6, '#7a4e2c'); px(g, 5, 5, '#7a4e2c'); px(g, 5, 4, '#a8703c'); px(g, 9, 9, '#7a4e2c'); px(g, 10, 10, '#a8703c');
    },
    stone: iconRock(false),
    fiber: function (g) {
      [[3, 3], [5, 2], [7, 3], [9, 2], [11, 4]].forEach(function (p, i) {
        for (let y = p[1]; y < 9; y++) px(g, p[0] + (y > 5 ? (i < 2 ? 1 : i > 2 ? -1 : 0) : 0), y, y < 4 ? '#b8e87c' : '#7ec850');
      });
      rc(g, 5, 9, 4, 2, '#c8a15a'); rc(g, 5, 9, 4, 1, '#e0bd72'); rc(g, 6, 11, 2, 2, '#7ec850');
    },
    meat: function (g) {
      ell(g, 7, 8, 5, 4, '#c9483f'); ell(g, 7, 8, 3, 2, '#e8766a'); rc(g, 10, 5, 3, 2, '#f2efe6'); rc(g, 12, 3, 2, 3, '#f2efe6'); rc(g, 12, 4, 2, 1, '#dcd6c4'); px(g, 5, 7, '#ff9d92');
    },
    berries: function (g) {
      disc(g, 4, 9, 2, '#d9423e'); disc(g, 9, 9, 2, '#d9423e'); disc(g, 6, 5, 2, '#c93a3a');
      px(g, 3, 8, '#ff8a8a'); px(g, 8, 8, '#ff8a8a'); px(g, 5, 4, '#ff8a8a');
      rc(g, 6, 1, 1, 2, '#3c8f3c'); rc(g, 7, 1, 3, 1, '#58a845'); px(g, 9, 2, '#58a845');
    },
    flower_red: iconFlower('#e8483f', '#f2c14e'),
    flower_blue: iconFlower('#4f7cf0', '#f2c14e'),
    flower_yellow: iconFlower('#f6d743', '#e08a2c'),
    mushroom: function (g) {
      rc(g, 5, 8, 4, 5, '#f2efe6'); rc(g, 5, 11, 4, 2, '#d8d2c0'); ell(g, 7, 6, 6, 3, '#d9423e'); rc(g, 1, 7, 12, 2, '#d9423e');
      rc(g, 1, 8, 12, 1, '#a52a2e'); px(g, 4, 4, '#f2efe6'); px(g, 8, 3, '#f2efe6'); px(g, 10, 6, '#f2efe6'); px(g, 6, 6, '#f2efe6'); px(g, 5, 3, '#ff7a70');
    },
    shell: function (g) {
      ell(g, 7, 7, 6, 5, '#f7c6d4'); ell(g, 7, 7, 4, 3, '#f2a6bd'); rc(g, 5, 11, 4, 2, '#e8949f');
      [[7, 3], [5, 4], [9, 4], [3, 6], [11, 6]].forEach(function (p) { px(g, p[0], p[1], '#e8949f'); });
      px(g, 5, 5, '#fff2f6'); px(g, 6, 4, '#fff2f6');
    },
    pinecone: function (g) {
      ell(g, 7, 8, 4, 5, '#8a5a30');
      for (let y = 4; y <= 12; y += 2) for (let x = 3 + (y % 4 ? 0 : 1); x <= 10; x += 2) px(g, x, y, '#b8803f');
      px(g, 7, 2, '#5e3a20'); px(g, 7, 3, '#5e3a20'); px(g, 8, 1, '#3c8f3c');
    },
    petal: function (g) {
      ell(g, 6, 8, 3, 5, '#e88bb0'); ell(g, 9, 7, 3, 4, '#f7a8c8'); ell(g, 8, 6, 1, 2, '#ffd7e6'); px(g, 5, 5, '#ffd7e6');
    },
    copper_ore: iconOre('copper', ['#d9824a', '#f2b27a']),
    iron_ore: iconOre('iron', ['#a8553a', '#e0987a']),
    silver_ore: iconOre('silver', ['#dfe6f4', '#ffffff']),
    gold_ore: iconOre('gold', ['#f2c014', '#fff0a0']),
    crystal: function (g) {
      const w = [1, 3, 5, 5, 5, 5, 5, 3, 1];
      for (let i = 0; i < w.length; i++) {
        const y = 2 + i, h = (w[i] - 1) / 2;
        for (let x = -h; x <= h; x++) px(g, 7 + x, y, x < 0 ? '#aef0ff' : x === 0 ? '#6fd3f5' : '#3a9ad5');
      }
      px(g, 6, 4, '#e6fbff'); px(g, 6, 5, '#e6fbff'); rc(g, 4, 12, 6, 1, '#6c6c7c');
    },
    chest: function (g) { g.translate(0, 1); drawChest(g); },
    furnace: function (g) {
      rc(g, 8, 0, 4, 4, '#6c6c7c'); rc(g, 0, 3, 14, 10, '#8e8e9a'); rc(g, 0, 3, 14, 2, '#b4b4c0'); rc(g, 0, 11, 14, 2, '#6c6c7c');
      rc(g, 3, 7, 8, 6, '#2c2230'); rc(g, 4, 6, 6, 1, '#2c2230'); rc(g, 4, 10, 6, 3, '#e8683a'); rc(g, 5, 9, 4, 4, '#f2a02a'); rc(g, 6, 10, 2, 3, '#ffe070');
    },
    workbench: drawIconBench,
    bed: function (g) {
      rc(g, 0, 2, 14, 11, '#7a4e2c'); rc(g, 0, 2, 3, 11, '#5e3a20'); rc(g, 3, 3, 10, 9, '#f2efe6'); rc(g, 3, 4, 4, 7, '#ffffff');
      rc(g, 7, 3, 6, 9, '#c0504a'); rc(g, 7, 3, 6, 1, '#e0807a'); rc(g, 7, 11, 6, 1, '#963a36');
    },
    lamp: function (g) {
      rc(g, 6, 8, 2, 6, '#4a4a58'); rc(g, 4, 12, 6, 2, '#6c6c7c');
      rc(g, 3, 1, 8, 8, '#4a4a58'); rc(g, 4, 2, 6, 6, '#ffe070'); rc(g, 5, 3, 4, 4, '#fff6b0'); rc(g, 2, 0, 10, 2, '#4a4a58');
    },
    fence: function (g) {
      rc(g, 0, 4, 14, 2, '#c08856'); rc(g, 0, 8, 14, 2, '#c08856'); rc(g, 0, 4, 14, 1, '#dcae7c'); rc(g, 0, 8, 14, 1, '#dcae7c');
      [1, 10].forEach(function (x) { rc(g, x, 1, 3, 12, '#a8703c'); rc(g, x, 1, 1, 12, '#c99262'); rc(g, x, 1, 3, 1, '#dcae7c'); });
    },
    floor_wood: function (g) {
      const cols = ['#c99262', '#c08856', '#cf9a68', '#b9824f'];
      for (let b = 0; b < 4; b++) { rc(g, 1, 1 + b * 3, 12, 3, cols[b]); rc(g, 1, 1 + b * 3, 12, 1, '#dcae7c'); rc(g, 1, 3 + b * 3, 12, 1, '#8a5a30'); rc(g, 3 + b * 3, 1 + b * 3, 1, 3, '#8a5a30'); }
    },
    path_stone: function (g) {
      rc(g, 1, 1, 12, 12, '#6c6c7c');
      [[2, 2, 4, 4], [7, 2, 5, 3], [2, 7, 3, 5], [6, 6, 6, 3], [6, 10, 3, 2], [10, 10, 2, 2]].forEach(function (s) {
        rc(g, s[0], s[1], s[2], s[3], '#9a9aa8'); rc(g, s[0], s[1], s[2], 1, '#b8b8c4');
      });
    },
    copper_bar: barIcon(['#d9824a', '#f6b684', '#a85a2c', '#b8642e', '#ffe2c4']),
    iron_bar: barIcon(['#8a96ac', '#c4cede', '#5a6678', '#6c788e', '#eef3fb']),
    silver_bar: barIcon(['#c8d0dc', '#f4f8ff', '#96a0b0', '#a8b0c0', '#ffffff']),
    gold_bar: barIcon(['#e8b830', '#ffe070', '#b88418', '#c8941c', '#fff8c0']),
    axe: axeIcon(STEEL),
    pickaxe: pickIcon(STEEL),
    axe_copper: axeIcon(COPPER),
    pickaxe_copper: pickIcon(COPPER),
    axe_iron: axeIcon(IRON),
    pickaxe_iron: pickIcon(IRON),
    plank: function (g) {
      [[1, 3], [3, 6], [1, 9]].forEach(function (p, i) {
        rc(g, p[0], p[1], 12, 3, i % 2 ? '#c99262' : '#c08856'); rc(g, p[0], p[1], 12, 1, '#e0b480'); rc(g, p[0], p[1] + 2, 12, 1, '#8a5a30');
        px(g, p[0] + 3 + i * 2, p[1] + 1, '#a8703c'); px(g, p[0] + 9, p[1] + 1, '#8a5a30');
      });
    },
    rope: function (g) {
      ell(g, 7, 8, 5, 4, '#c8a15a'); ell(g, 7, 8, 2, 1, '#00000000');
      for (let a = 0; a < 6.3; a += 0.5) { px(g, 7 + Math.round(Math.cos(a) * 5), 8 + Math.round(Math.sin(a) * 4), '#8f6f33'); px(g, 7 + Math.round(Math.cos(a) * 3), 8 + Math.round(Math.sin(a) * 2.4), '#e8cd8a'); }
      px(g, 7, 8, '#6b4f20'); rc(g, 10, 11, 4, 1, '#c8a15a'); px(g, 13, 12, '#8f6f33');
    },
    torch: function (g) {
      for (let i = 0; i < 8; i++) { px(g, 5 + (i >> 1), 13 - i, '#7a4e2c'); px(g, 6 + (i >> 1), 13 - i, '#a8703c'); }
      rc(g, 6, 4, 4, 2, '#4a3426');
      ell(g, 8, 3, 2, 3, '#f2a02a'); ell(g, 8, 3, 1, 2, '#ffe070'); px(g, 8, 0, '#f2a02a'); px(g, 9, 1, '#e8683a');
    },
  };

  // ---------- ombres, nuages, lueurs ----------
  function shadowSprite(w, h) {
    const ca = cv(w, h);
    ell(ca[1], (w - 1) >> 1, (h - 1) >> 1, (w - 1) >> 1, (h - 1) >> 1, 'rgba(20,30,60,0.28)');
    return ca[0];
  }
  function cloudSprite(seed) {
    const ca = cv(112, 56), g = ca[1], r = mul(seed);
    for (let i = 0; i < 9; i++) disc(g, 18 + ((r() * 76) | 0), 20 + ((r() * 16) | 0), 8 + ((r() * 8) | 0), '#1d3c78');
    return ca[0];
  }
  function glowSprite(rad, rgb) {
    const ca = cv(rad * 2 + 1, rad * 2 + 1);
    for (let k = 0; k < 6; k++) disc(ca[1], rad, rad, Math.round(rad * (1 - k / 6)), 'rgba(' + rgb + ',0.09)');
    return ca[0];
  }

  // ---------- assemblage ----------

  // ---------- lobby spatial (content/lobby.js) : quartz blanc, lueurs cyan ----------
  function lerpC(a, b, t) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
  function quartzTile(seed, kind) { // 0 quartz, 1 incrustation lumineuse, 2 estrade violette
    const ca = cv(16, 16), g = ca[1], r = mul(seed);
    const A = kind === 2 ? [96, 100, 214] : [255, 255, 255], B = kind === 2 ? [58, 52, 150] : [208, 224, 244];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, lerpC(A, B, (x + y) / 30 + (r() - 0.5) * 0.05));
    const vein = kind === 2 ? 'rgba(200,200,255,0.35)' : 'rgba(150,180,220,0.4)';
    for (let k = 0; k < 2; k++) { let x = (r() * 16) | 0, y = 0; for (; y < 16; y++) { px(g, x & 15, y, vein); if (r() < 0.5) x += r() < 0.5 ? 1 : -1; } }
    rc(g, 0, 0, 16, 1, 'rgba(255,255,255,0.8)'); rc(g, 0, 0, 1, 16, 'rgba(255,255,255,0.6)');
    rc(g, 0, 15, 16, 1, kind === 2 ? '#2c2a78' : '#a9c0de'); rc(g, 15, 0, 1, 16, kind === 2 ? '#2c2a78' : '#b8cde6');
    if (kind === 1) { rc(g, 0, 0, 16, 16, 'rgba(120,200,255,0.28)'); rc(g, 0, 7, 16, 2, 'rgba(60,120,200,0.18)'); rc(g, 7, 0, 2, 16, 'rgba(60,120,200,0.18)'); } // fond bleuté : la lumière est dessinée par-dessus
    if (kind === 2) { rc(g, 7, 2, 2, 12, 'rgba(210,214,255,0.5)'); rc(g, 2, 7, 12, 2, 'rgba(210,214,255,0.5)'); rc(g, 7, 7, 2, 2, '#ffffff'); }
    for (let i = 0; i < 2; i++) px(g, 1 + ((r() * 14) | 0), 1 + ((r() * 14) | 0), '#ffffff');
    return ca[0];
  }
  function cliffTile(seed) { // le dessous de la plateforme, qui se perd dans le vide
    const ca = cv(16, 16), g = ca[1], r = mul(seed);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = 'rgba(' + (150 - y * 5) + ',' + (176 - y * 5) + ',' + (222 - y * 4) + ',' + Math.max(0, 0.95 - y / 15) + ')'; g.fillRect(x, y, 1, 1); }
    for (let x = 0; x < 16; x += 2 + ((r() * 3) | 0)) rc(g, x, 0, 1, 4 + ((r() * 9) | 0), 'rgba(70,90,150,0.45)');
    return ca[0];
  }
  const QL = '#f4f9ff', QM = '#d6e4f6', QD = '#a9c0de', QDD = '#6a82ae', CY1 = '#6fe3ff', CY2 = '#e8fbff';
  function hardenAlpha(c) { // supprime le flou des bords après un agrandissement : pixels nets
    const g = c.getContext('2d'), id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
    g.putImageData(id, 0, 0);
  }
  function portalUltimateSprite() { // dessiné en 64x76 puis agrandi 1,5 fois : le monument est imposant
    const K = 1.5, ca = cv(Math.round(66 * K) + 2, Math.round(78 * K) + 2), g0 = ca[1];
    g0.translate(1, 1); g0.scale(K, K); g0.translate(1, 1);
    (function (g) {
      rc(g, 0, 68, 64, 8, QD); rc(g, 2, 66, 60, 3, QM); rc(g, 4, 64, 56, 2, QL); rc(g, 0, 74, 64, 2, QDD); rc(g, 6, 70, 52, 1, CY1);
      ell(g, 33, 36, 29, 31, QDD); ell(g, 32, 35, 29, 31, QM); ell(g, 31, 34, 28, 30, QL); // arche
      ell(g, 32, 35, 19, 26, '#0a0620'); ell(g, 32, 35, 17, 24, '#4a2ec8'); ell(g, 32, 35, 15, 22, '#150a45');
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + 0.2, x = Math.round(32 + Math.cos(a) * 23.5), y = Math.round(35 + Math.sin(a) * 28); rc(g, x - 1, y, i % 2 ? 3 : 1, i % 2 ? 1 : 3, i % 4 ? CY1 : CY2); }
      rc(g, 0, 40, 8, 28, QM); rc(g, 0, 40, 3, 28, QL); rc(g, 6, 40, 2, 28, QD); rc(g, 56, 40, 8, 28, QM); rc(g, 56, 40, 3, 28, QL); rc(g, 61, 40, 3, 28, QD);
      rc(g, 3, 44, 2, 20, CY1); rc(g, 59, 44, 2, 20, CY1);
      rc(g, 0, 38, 8, 3, QL); rc(g, 56, 38, 8, 3, QL);
      disc(g, 32, 4, 4, QD); disc(g, 32, 4, 3, CY1); disc(g, 32, 4, 1, '#ffffff'); rc(g, 31, 8, 2, 3, CY1);
    })(g0);
    g0.setTransform(1, 0, 0, 1, 0, 0); hardenAlpha(ca[0]); outline(ca[0], QDD);
    return { c: ca[0], ax: Math.round(33 * K) + 2, ay: Math.round(77 * K) + 2 };
  }
  function redButtonSprite(pressed) {
    return mk(24, 22, function (g) {
      ell(g, 12, 17, 11, 4, QD); rc(g, 1, 11, 22, 6, QM); rc(g, 1, 11, 4, 6, QL); rc(g, 19, 11, 4, 6, QD); ell(g, 12, 11, 11, 4, QL); ell(g, 12, 11, 8, 3, '#4a5a86'); ell(g, 12, 11, 7, 2, '#20284a');
      if (pressed) { ell(g, 12, 10, 6, 3, '#8a0f1a'); ell(g, 12, 9, 6, 2, '#ff3a48'); px(g, 9, 9, '#ffffff'); return; }
      ell(g, 12, 9, 7, 4, '#8a0f1a'); ell(g, 12, 8, 7, 4, '#e0202e'); ell(g, 11, 7, 4, 2, '#ff6a70'); rc(g, 8, 6, 2, 1, '#ffffff');
    }, { outline: QDD });
  }
  function returnPadSprite() {
    return plain(30, 18, function (g) {
      ell(g, 15, 9, 14, 8, '#2a6fb8'); ell(g, 15, 9, 13, 7, CY1); ell(g, 15, 9, 11, 6, QM); ell(g, 15, 9, 9, 5, QL);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; rc(g, Math.round(15 + Math.cos(a) * 7) - 1, Math.round(9 + Math.sin(a) * 3.6), 2, 1, CY1); }
      ell(g, 15, 9, 3, 2, CY2);
    }, 15, 12);
  }
  function qPillarSprite() {
    return mk(14, 42, function (g) {
      rc(g, 0, 0, 14, 4, QL); rc(g, 0, 3, 14, 1, QD); rc(g, 3, 4, 8, 34, QM); rc(g, 3, 4, 3, 34, QL); rc(g, 9, 4, 2, 34, QD); rc(g, 6, 6, 1, 30, QD);
      rc(g, 3, 9, 8, 1, CY1); rc(g, 3, 29, 8, 1, CY1); rc(g, 6, 9, 2, 1, CY2); rc(g, 6, 29, 2, 1, CY2);
      rc(g, 0, 38, 14, 4, QM); rc(g, 0, 38, 14, 1, QL); rc(g, 0, 41, 14, 1, QDD);
    }, { outline: QDD });
  }
  function qObeliskSprite() {
    return mk(12, 36, function (g) {
      for (let y = 4; y < 34; y++) { const w = 2 + Math.round((y - 4) * 0.2), x0 = 6 - w; rc(g, x0, y, w, 1, QL); rc(g, 6, y, w, 1, QD); }
      rc(g, 5, 0, 2, 5, QL); px(g, 6, 0, '#ffffff'); rc(g, 3, 34, 6, 2, QDD); rc(g, 5, 14, 2, 1, CY1); rc(g, 5, 22, 2, 1, CY1);
    }, { outline: QDD });
  }
  function qCrystalSprite(v) {
    return mk(16, 16, mapDraw(CRYSTAL_ROWS, { c: '#ffffff', C: v ? '#d6c6ff' : '#bfe9ff', w: '#ffffff', U: v ? '#9a8cff' : '#7cb8ff', g: '#dfeaf8', d: '#a8bedc' }), { ay: 15, outline: QDD });
  }

  I.buildSprites = function () {
    const S = { tiles: {}, water: [], fringe: {}, foam: foamSets(), obj: {}, player: {}, icons: {}, iconURL: {}, shadow: {}, cloud: [], glow: {} };
    S.tiles[T.GRASS] = range(6).map(function (i) { return groundTile(PAL.grass, 100 + i, 'grass'); });
    S.tiles[T.GRASS_DARK] = range(6).map(function (i) { return groundTile(PAL.forest, 200 + i, 'grass'); });
    S.tiles[T.SAND] = range(5).map(function (i) { return groundTile(PAL.sand, 300 + i, 'sand'); });
    S.tiles[T.DIRT] = range(5).map(function (i) { return groundTile(PAL.dirt, 400 + i, 'dirt'); });
    S.tiles[T.PLANK] = range(3).map(function (i) { return plankTile(500 + i); });
    S.water[T.DEEP] = range(3).map(function (v) { return waterFrames(true, 600 + v); });
    S.water[T.SHALLOW] = range(3).map(function (v) { return waterFrames(false, 700 + v); });

    const gc = ['#6fb84a', '#5fa63f'], wc = ['#4fb6dc', '#3ea3d0'];
    S.fringe[T.SAND] = [fringeSet(gc, 1), fringeSet(gc, 2)];
    S.fringe[T.DIRT] = [fringeSet(gc, 3), fringeSet(gc, 4)];
    S.fringe[T.GRASS_DARK] = [fringeSet(gc, 5), fringeSet(gc, 6)];
    S.fringe[T.DEEP] = [fringeSet(wc, 7), fringeSet(wc, 8)];

    const trunk = ['#7a4e2c', '#5e3a20', '#9a6a3c'];
    S.obj.tree_oak = range(3).map(function (i) { return treeSprite(800 + i, PAL.oak, trunk); });
    S.obj.tree_blossom = range(3).map(function (i) { return treeSprite(820 + i, PAL.blossom, ['#8a6a58', '#6a4a3a', '#a88a74']); });
    S.obj.tree_pine = range(3).map(function (i) { return pineSprite(840 + i); });
    S.obj.stump = [stumpSprite()];
    S.obj.rock = range(3).map(function (i) { return rockSprite(900 + i, false); });
    S.obj.ore_copper = range(3).map(function (i) { return oreSprite('copper', 920 + i, ['#d9824a', '#f2b27a']); });
    S.obj.crystal = [crystalSprite()];
    S.obj.bush_berry = [bushSprite(true)];
    S.obj.bush_bare = [bushSprite(false)];
    S.obj.flower_red = [flowerSprite('#e8483f', '#fff3a0', 0), flowerSprite('#e8483f', '#fff3a0', 1)];
    S.obj.flower_blue = [flowerSprite('#4f7cf0', '#fff3a0', 0), flowerSprite('#4f7cf0', '#fff3a0', 1)];
    S.obj.flower_yellow = [flowerSprite('#f6d743', '#e08a2c', 0), flowerSprite('#f6d743', '#e08a2c', 1)];
    S.obj.tuft = range(3).map(function (i) { return tuftSprite(950 + i); });
    S.obj.mushroom = [mushroomSprite()];
    S.obj.signpost = [signSprite()];
    S.obj.crate = [crateSprite(0), crateSprite(1)];
    S.obj.barrel = [barrelSprite()];
    S.obj.house = [houseSprite()];
    S.obj.portal = [portalSprite()];
    S.obj.workbench = [workbenchSprite()];
    S.obj.chest = [chestSprite()];
    S.obj.furnace = [furnaceSprite(false)];
    S.obj.furnace_lit = [furnaceSprite(true)];
    S.obj.forge_table = [I.forgeArt.tableSprite({ mk: mk, rc: rc, px: px })];
    S.obj.enchant_table = [I.enchantArt.tableSprite(mk, 'ench')]; S.obj.disenchant_table = [I.enchantArt.tableSprite(mk, 'dis')];
    S.obj.bed = [bedSprite()];
    S.obj.lamp = [lampSprite()];
    S.obj.fence = [fenceSprite(0), fenceSprite(1), fenceSprite(2), fenceSprite(3)];
    S.obj.floor_wood = [floorWoodSprite()];
    S.obj.path_stone = [pathStoneSprite()];
    // tuiles des dimensions (recolorées à l'affichage selon la couleur de la zone)
    function rockTile(seed, face) {
      const ca = cv(16, 16), c = ca[0], g = ca[1], r = mul(seed);
      if (!face) {
        rc(g, 0, 0, 16, 16, '#6c6c7a');
        for (let i = 0; i < 26; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.5 ? '#5a5a68' : '#82828f');
        for (let i = 0; i < 3; i++) { const x = (r() * 12) | 0, y = (r() * 14) | 0; rc(g, x, y, 3, 1, '#9a9aa8'); rc(g, x + 1, y + 1, 3, 1, '#4a4a58'); }
      } else {
        rc(g, 0, 0, 16, 16, '#4f4f62'); rc(g, 0, 0, 16, 3, '#8a8a99'); rc(g, 0, 3, 16, 1, '#2e2e3c');
        for (let x = 0; x < 16; x += 2 + ((r() * 3) | 0)) rc(g, x, 4, 1, 12, r() < 0.5 ? '#43435a' : '#5c5c70');
        for (let i = 0; i < 14; i++) px(g, (r() * 16) | 0, 4 + ((r() * 11) | 0), r() < 0.5 ? '#6a6a80' : '#37374a');
        rc(g, 0, 14, 16, 2, '#33334a');
      }
      return c;
    }
    function glowTile(seed) {
      const ca = cv(16, 16), c = ca[0], g = ca[1], r = mul(seed);
      rc(g, 0, 0, 16, 16, '#2a2850');
      for (let i = 0; i < 22; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, r() < 0.6 ? '#35336a' : '#221f44');
      for (let i = 0; i < 5; i++) { const x = 1 + ((r() * 14) | 0), y = 1 + ((r() * 14) | 0); px(g, x, y, '#d8ccff'); if (r() < 0.6) { px(g, x - 1, y, '#8a7aff'); px(g, x + 1, y, '#8a7aff'); px(g, x, y - 1, '#8a7aff'); px(g, x, y + 1, '#8a7aff'); } }
      return c;
    }
    function scaleEntry(e, k) {
      const w = Math.round(e.c.width * k), h = Math.round(e.c.height * k), ca = cv(w, h);
      ca[1].imageSmoothingEnabled = false; ca[1].drawImage(e.c, 0, 0, w, h); hardenAlpha(ca[0]);
      return { c: ca[0], ax: e.ax * k, ay: e.ay * k };
    }
    S.tiles[T.STONE] = range(5).map(function (i) { return groundTile({ base: '#8e8e98', dark: '#7c7c88', dark2: '#6a6a76', light: '#a0a0ab', hi: '#b6b6c0' }, 1500 + i, 'dirt'); });
    S.tiles[T.WALL] = range(4).map(function (i) { return rockTile(1600 + i, false); });
    S.wallFace = range(4).map(function (i) { return rockTile(1700 + i, true); });
    S.tiles[T.GLOW] = range(5).map(function (i) { return glowTile(1800 + i); });
    S.tiles[T.QUARTZ] = range(6).map(function (i) { return quartzTile(1100 + i, 0); });
    S.tiles[T.INLAY] = range(2).map(function (i) { return quartzTile(1200 + i, 1); });
    S.tiles[T.DAIS] = range(3).map(function (i) { return quartzTile(1300 + i, 2); });
    S.cliff = range(3).map(function (i) { return cliffTile(1400 + i); });
    S.obj.portal_ultimate = [portalUltimateSprite()];
    S.obj.tree_giant = ['tree_oak', 'tree_pine', 'tree_blossom'].map(function (id) { return scaleEntry(S.obj[id][0], 2); });
    S.obj.red_button = [redButtonSprite(false), redButtonSprite(true)];
    S.obj.return_pad = [returnPadSprite()];
    S.obj.q_pillar = [qPillarSprite()];
    S.obj.q_obelisk = [qObeliskSprite()];
    S.obj.q_crystal = [qCrystalSprite(0), qCrystalSprite(1)];
    // décor : sprites dessinés depuis le texte de content/decor.js (ceux qui réutilisent un sprite n'ont rien à dessiner)
    const DH = { rc: rc };
    I.DECOR.forEach(function (d) {
      if (d.sprite) return;
      if (d.floor) S.obj[d.id] = [plain(16, 16, function (g) { d.draw(g, DH); }, 8, 16)];
      else S.obj[d.id] = [mk(d.w, d.h || d.rows.length, d.draw ? function (g) { d.draw(g, DH); } : mapDraw(d.rows, I.DECOR_PAL), { outline: d.noOutline ? false : undefined })];
    });
    // parcelle labourée + cultures (4 stades : 0 pousse, 1 jeune plant, 2 grand plant, 3 mûr ; dessinés à la demande)
    S.obj.plot = [plain(16, 16, function (g) {
      rc(g, 0, 0, 16, 16, '#6a4528'); rc(g, 0, 0, 16, 1, '#4a2f1a'); rc(g, 0, 15, 16, 1, '#4a2f1a');
      for (let y = 3; y < 15; y += 4) { rc(g, 1, y, 14, 2, '#865a36'); rc(g, 1, y + 2, 14, 1, '#4a2f1a'); }
      px(g, 4, 5, '#a07a50'); px(g, 11, 9, '#a07a50'); px(g, 7, 13, '#a07a50');
    }, 8, 16)];
    const cropCache = {};
    S.cropSprite = function (id, stage) {
      const k = id + stage; if (cropCache[k]) return cropCache[k];
      const cr = I.CROPS[id], c = cr.c, L = '#3f9a3a', L2 = '#7cc94f';
      return (cropCache[k] = mk(14, 14, function (g) {
        if (stage === 0) { rc(g, 6, 11, 2, 2, L); px(g, 5, 11, L2); px(g, 8, 10, L2); return; }
        if (stage === 1) { rc(g, 6, 8, 2, 5, L); rc(g, 4, 9, 2, 2, L2); rc(g, 8, 8, 3, 2, L2); return; }
        rc(g, 6, 5, 2, 8, L); rc(g, 3, 7, 3, 2, L2); rc(g, 8, 6, 4, 2, L2); rc(g, 4, 10, 2, 2, L);
        if (stage === 2) return;
        const sh = cr.shape;
        if (sh === 'fruit') { ell(g, 7, 10, 4, 3, c); rc(g, 5, 8, 2, 1, '#ffffff'); rc(g, 6, 6, 2, 2, '#5a8a30'); }
        else if (sh === 'bush') { rc(g, 3, 6, 3, 3, c); rc(g, 9, 7, 3, 3, c); rc(g, 6, 10, 3, 3, c); px(g, 4, 6, '#ffffff'); }
        else if (sh === 'root') { rc(g, 5, 11, 4, 2, c); rc(g, 6, 13, 2, 1, c); px(g, 5, 11, '#ffffff'); }
        else if (sh === 'head') { ell(g, 7, 9, 5, 4, c); ell(g, 7, 8, 3, 2, '#c8f0a8'); }
        else if (sh === 'vine') { rc(g, 3, 6, 3, 4, c); rc(g, 9, 5, 3, 4, c); rc(g, 6, 9, 3, 4, c); px(g, 4, 6, '#d8b0f0'); }
        else if (sh === 'ears') { [3, 7, 11].forEach(function (x, i) { rc(g, x, 3 + i % 2, 2, 6, c); px(g, x, 3 + i % 2, '#f2dc8a'); }); }
        else if (sh === 'flower') { rc(g, 4, 1, 6, 5, c); rc(g, 6, 2, 2, 3, '#7a4e2c'); }
        else rc(g, 3, 4, 8, 5, c); // herbe : feuillage coloré
      }, { ax: 7, ay: 14 }));
    };
    // murs, portes, fenêtres, toits : sprites dessinés à la demande selon les voisins (voir systems/house.js)
    // Murs : toujours pleine largeur de case (16 px) -> aucun trou entre deux pièces, même aux coins et aux jonctions.
    // Dessus (16 px de haut, se raccorde au voisin) + face avant de 8 px quand rien n'est au sud. Les textures sont
    // calées sur la case (mêmes joints partout) : elles se prolongent d'une pièce à l'autre.
    const WPAL = {
      wood: { top: '#d9a874', topL: '#f0c898', topD: '#a8743f', front: '#b9824f', frontD: '#8a5a30', seam: '#b98a55', edge: '#5e3a1c', grain: '#c89a64', nail: '#6e4424' },
      stone: { top: '#b4b4c0', topL: '#d8d8e2', topD: '#8e8e9a', front: '#8e8e9a', frontD: '#6c6c7c', seam: '#8a8a98', edge: '#464652', grain: '#a2a2b0', nail: '#6c6c7c' },
      iron: { top: '#9aa7bd', topL: '#c4cfe0', topD: '#6c7a92', front: '#6c7a92', frontD: '#4a566e', seam: '#7a88a0', edge: '#2e3648', grain: '#8794ab', nail: '#dfe6f2' },
    };
    function drawWallPiece(g, pal, kind, mask, open) {
      const N = mask & 1, E = (mask >> 1) & 1, Sm = (mask >> 2) & 1, Wm = (mask >> 3) & 1;
      const ty = Sm ? 16 : 14, fh = 24 - ty, vert = (N || Sm) && !(E || Wm), isDoor = kind === 'door', wood = pal === WPAL.wood, stone = pal === WPAL.stone;
      const openVert = isDoor && open && (N || Sm); // porte ouverte dans un mur vertical : on voit le passage entre deux barres
      // ---- dessus ----
      const capH = (y0, y1) => { // texture du dessus entre les lignes y0 et y1 (exclu)
        rc(g, 0, y0, 16, y1 - y0, isDoor ? '#a8743f' : pal.top);
        if (wood) { // planches dans le sens du mur, avec veinures
          if (vert) { rc(g, 5, y0, 1, y1 - y0, pal.seam); rc(g, 10, y0, 1, y1 - y0, pal.seam); }
          else { for (let y = 4; y < 16; y += 5) if (y >= y0 && y < y1) rc(g, 0, y, 16, 1, pal.seam); }
          for (let i = 0; i < 9; i++) { const x = (i * 7 + 3) % 15, y = (i * 5 + 2) % 15; if (y >= y0 && y < y1) px(g, x, y, pal.grain); }
        } else if (stone) { // briques
          for (let y = 0; y < 16; y += 4) if (y >= y0 && y < y1) { rc(g, 0, y + 3, 16, 1, pal.seam); const o = (y / 4 | 0) % 2 ? 0 : 4; for (let x = o; x < 16; x += 8) if (y + 3 > y0) rc(g, x, y, 1, 3, pal.seam); }
        } else { // tôle : plaque rivetée
          rc(g, 0, y0, 1, y1 - y0, pal.seam); if (y0 === 0) rc(g, 0, 0, 16, 1, pal.seam);
          for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) if (y >= y0 && y < y1) px(g, x, y, pal.nail);
        }
      };
      if (openVert) { capH(0, 3); capH(ty - 3, ty); rc(g, 0, 0, 16, 1, pal.topL); }
      else {
        capH(0, ty);
        if (isDoor && !open && Sm) { rc(g, 3, 2, 10, ty - 4, '#c08a50'); rc(g, 3, 2, 10, 1, '#dcae7c'); px(g, 11, 7, '#f2c14e'); }
      }
      if (kind === 'window' && Sm) { // vitre vue de dessus
        if (vert) { rc(g, 5, 1, 6, ty - 2, pal.edge); rc(g, 6, 2, 4, ty - 4, '#a8e0f4'); rc(g, 7, 2, 1, 1, '#ffffff'); }
        else { rc(g, 2, 5, 12, 6, pal.edge); rc(g, 3, 6, 10, 4, '#a8e0f4'); rc(g, 8, 6, 1, 4, pal.frontD); px(g, 4, 6, '#ffffff'); }
      }
      // contour : bord clair en haut / à gauche, sombre à droite, trait sombre là où il n'y a pas de voisin
      if (!openVert) {
        if (!N) { rc(g, 0, 0, 16, 1, pal.edge); rc(g, 0, 1, 16, 1, pal.topL); }
        if (!Wm) { rc(g, 0, 0, 1, ty, pal.edge); if (!N) px(g, 0, 0, pal.edge); rc(g, 1, N ? 0 : 2, 1, ty - (N ? 0 : 2), pal.topL); }
        if (!E) { rc(g, 15, 0, 1, ty, pal.edge); rc(g, 14, N ? 0 : 2, 1, ty - (N ? 0 : 2), pal.topD); }
        if (!Sm) rc(g, 0, ty - 1, 16, 1, pal.topD);
      }
      if (Sm || openVert) return;
      // ---- face avant (rien au sud) ----
      if (!isDoor) {
        rc(g, 0, ty, 16, fh, pal.front); rc(g, 0, ty, 16, 1, pal.frontD);
        if (wood) { for (let x = 4; x < 16; x += 5) rc(g, x, ty + 1, 1, fh - 2, pal.frontD); for (let x = 1; x < 16; x += 5) rc(g, x, ty + 2, 1, fh - 4, pal.seam); px(g, 2, ty + 3, pal.nail); px(g, 7, ty + 6, pal.nail); px(g, 12, ty + 3, pal.nail); }
        else if (stone) { for (let y = ty + 3; y < 22; y += 3) { rc(g, 0, y, 16, 1, pal.frontD); const o = ((y - ty) / 3 | 0) % 2 ? 0 : 4; for (let x = o; x < 16; x += 8) rc(g, x, y - 3, 1, 3, pal.frontD); } rc(g, 0, ty + 1, 16, 1, pal.topD); }
        else { rc(g, 0, ty + 1, 16, 1, pal.topL); for (let x = 5; x < 16; x += 5) rc(g, x, ty + 2, 1, fh - 4, pal.frontD); for (const x of [2, 7, 12]) px(g, x, ty + 3, pal.nail); }
        rc(g, 0, 22, 16, 2, pal.frontD);
      }
      if (kind === 'window') { // vitre : cadre, ciel, reflet, croisillon
        rc(g, 0, ty, 16, fh, pal.front); rc(g, 0, ty, 16, 1, pal.frontD); rc(g, 0, 22, 16, 2, pal.frontD);
        rc(g, 2, ty + 1, 12, 8, pal.edge); rc(g, 3, ty + 2, 10, 6, '#a8e0f4'); rc(g, 3, ty + 2, 10, 2, '#d4f4fc'); rc(g, 8, ty + 2, 1, 6, pal.edge); rc(g, 3, ty + 5, 10, 1, pal.edge); px(g, 4, ty + 3, '#ffffff'); rc(g, 2, ty + 9, 12, 1, pal.topL);
      } else if (isDoor) {
        rc(g, 0, ty, 16, fh, '#8a5a30'); rc(g, 0, ty, 16, 1, '#6a4222'); rc(g, 0, 22, 16, 2, '#6a4222');
        rc(g, 2, ty, 12, fh, '#6a4222'); // montants
        if (open) { rc(g, 3, ty + 1, 10, fh - 1, '#1c1a24'); rc(g, 3, ty + 1, 10, 2, '#0e0c14'); rc(g, 3, 22, 10, 2, '#3a3040'); }
        else { rc(g, 3, ty + 1, 10, fh - 1, '#b9824f'); rc(g, 3, ty + 1, 10, 1, '#dcae7c'); rc(g, 4, ty + 3, 3, 4, '#a0693a'); rc(g, 9, ty + 3, 3, 4, '#a0693a'); rc(g, 4, ty + 8, 3, 3, '#a0693a'); rc(g, 9, ty + 8, 3, 3, '#a0693a'); px(g, 8, ty + 6, '#f2c14e'); rc(g, 3, 22, 10, 2, '#8a5a30'); }
      }
    }
    const wallCache = {};
    /** Sprite d'un mur / d'une fenêtre / d'une porte selon ses voisins (mask : 1 nord, 2 est, 4 sud, 8 ouest) et l'état de la porte. */
    S.wallSprite = function (def, mask, open) {
      const k = def.item + '|' + mask + '|' + (open ? 1 : 0);
      return wallCache[k] || (wallCache[k] = plain(16, 24, function (g) { drawWallPiece(g, WPAL[def.wallMat] || WPAL.wood, def.wall, mask, open); }, 8, 24));
    };
    const roofCache = {};
    /** Tuile de toit (16×16, posée 8 px plus haut que sa case) ; mask : voisines de toit (1 nord, 2 est, 4 sud, 8 ouest). */
    S.roofSprite = function (mask) {
      return roofCache[mask] || (roofCache[mask] = plain(16, 16, function (g) {
        rc(g, 0, 0, 16, 16, '#b5523a');
        for (let y = 0; y < 16; y += 4) {
          rc(g, 0, y + 3, 16, 1, '#8a3a28'); rc(g, 0, y, 16, 1, '#cc6a50');
          const o = (y / 4 | 0) % 2 ? 0 : 4; for (let x = o; x < 16; x += 8) rc(g, x, y, 1, 4, '#9c4430');
        }
        if (!(mask & 1)) rc(g, 0, 0, 16, 1, '#e8967a'); if (!(mask & 8)) rc(g, 0, 0, 1, 16, '#d87e62');
        if (!(mask & 2)) rc(g, 15, 0, 1, 16, '#6e2a1c'); if (!(mask & 4)) { rc(g, 0, 13, 16, 3, '#6e2a1c'); rc(g, 0, 12, 16, 1, '#8a3a28'); }
      }, 0, 0));
    };
    I.DECOR.forEach(function (d) {
      if (d.wall) S.obj[d.id] = [S.wallSprite(I.OBJECTS[d.id], 0, false)];
      else if (d.roof) S.obj[d.id] = [S.roofSprite(0)];
    });
    // minerais des dimensions : couleurs dérivées de la couleur du métal
    function shade(hex, k) { // k > 0 éclaircit, k < 0 assombrit
      const v = [1, 3, 5].map(function (i) { const x = parseInt(hex.substr(i, 2), 16); return Math.round(k > 0 ? x + (255 - x) * k : x * (1 + k)); });
      return '#' + v.map(function (x) { return ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2); }).join('');
    }
    I.ORES.forEach(function (o) {
      const c = o.c, lt = shade(c, 0.45);
      ICONS[o.id + '_ore'] = ORE_ART[o.id] ? iconOre(o.id, [c, lt]) : iconRock([c, lt]);
      ICONS[o.id + '_bar'] = barIcon([c, lt, shade(c, -0.4), shade(c, -0.2), shade(c, 0.8)]);
      ICONS['axe_' + o.id] = axeIcon([c, lt, shade(c, -0.4)]);
      ICONS['pickaxe_' + o.id] = pickIcon([c, lt, shade(c, -0.4)]);
      if (!o.mix) S.obj['ore_' + o.id] = range(3).map(function (i) { return ORE_ART[o.id] ? oreSprite(o.id, 940 + i * 13 + o.id.length * 7, [c, lt]) : rockSprite(940 + i * 13 + o.id.length * 7, [c, lt]); });
    });
    I.NATURE.forEach(function (n) {
      const f = NATURE_SPRITES[n.id];
      S.obj[n.id] = range(n.spr).map(function (i) { return f(1000 + i * 17 + n.id.length * 31 + (i % 2)); });
    });
    function iconFromSprite(e) {
      const ca = cv(16, 16), k = Math.min(1, 16 / Math.max(e.c.width, e.c.height));
      const w = Math.max(1, Math.round(e.c.width * k)), h = Math.max(1, Math.round(e.c.height * k));
      ca[1].drawImage(e.c, 0, 0, e.c.width, e.c.height, Math.floor((16 - w) / 2), Math.floor((16 - h) / 2), w, h);
      return { c: ca[0] };
    }

    /** Sprites d'un avatar (mis en cache selon son apparence) : { down, up, left, right } de 4 images chacun. */
    const avCache = {};
    S.avatarSet = function (a, ar) {
      a = I.avatar.sanitize(a);
      const look = I.armor.look(ar), k = I.avatar.key(a) + (look === ',,,' ? '' : '|' + look);
      if (avCache[k]) return avCache[k];
      const pc = I.avatar.palette(a), set = {};
      ['down', 'up', 'left'].forEach(function (dir) {
        set[dir] = range(4).map(function (f) { return mk(16, 24, function (g) { drawPlayer(g, dir, f, pc, a); if (look !== ',,,') I.armorArt.overlay(g, dir, f, look); }, { ax: 8, ay: 23 }); });
      });
      set.right = set.left.map(flipSprite);
      return (avCache[k] = set);
    };
    S.player = S.avatarSet(null);

    // sacs de l'établi : « renforcé » (besace en cuir, corde et boucle) et « de voyageur » (grand sac vert-bleu, couchage roulé, sangles de fer)
    ICONS.icon_bag2 = mapDraw([
      '....rrrrrr....', '...r......r...', '...r.bbbb.r...', '..bbbbbbbbbb..', '.bllllllllllb.', '.blbbbbbbbbdb.', '.blbbbrrbbbdb.',
      '.bbbbrmmrbbdb.', '.bbbbbrrbbbdb.', '.bddddddddddb.', '.bbbbbbbbbbdb.', '.bbbbbbbbbddb.', '..dddddddddd..', '..............',
    ], { b: '#a8703c', l: '#cf9a58', d: '#76482a', r: '#ecd9a0', m: '#d5dae4' });
    ICONS.icon_bag3 = mapDraw([
      '..rrrrrrrrrr..', '.rRRRRRRRRRRr.', '.rRssRRRRssRr.', '..rrrrrrrrrr..', '.tTTTTTTTTTTt.', 'tTTTTTTTTTTTTt', 'tTmDDDDDDDDmTt',
      'tTDTTTggTTTDTt', 'tTDTTTggTTTDTt', 'tTDTTTTTTTTDTt', 'tTTDDDDDDDDTTt', 'ttTTTTTTTTTTtt', '.tDDDDDDDDDDt.', '..tttttttttt..',
    ], { t: '#2f7a6c', T: '#4fb09a', D: '#1f4f46', m: '#d5dae4', g: '#f2c014', r: '#a8703c', R: '#e0b46c', s: '#5a3a20' });

    I.ARMOR.IDS.forEach(function (id) { const d = I.ARMOR.DEF[id]; ICONS[id] = I.armorArt.icon(d.piece, d.mat); });
    I.ITEM_ORDER.forEach(function (id) {
      if (I.ITEMS[id].base) return; // variantes de couleur : icône recolorée à la demande (plus bas)
      const ni = I.NATURE_ICONS[id], ic = ICONS[id] || (ni ? function (g) { ICON_KINDS[ni[0]].apply(null, [g].concat(ni.slice(1))); } : null), place = I.ITEMS[id].place && I.OBJECTS[I.ITEMS[id].place];
      const s = ic ? mk(14, 14, ic, { ax: 7, ay: 14 }) : place && S.obj[place.sprite] ? iconFromSprite(S.obj[place.sprite][0]) : mk(14, 14, function (g) { rc(g, 3, 3, 8, 8, '#cccccc'); });
      S.icons[id] = s.c;
      S.iconURL[id] = s.c.toDataURL();
    });

    // couleurs des matériaux : l'icône de base recolorée (calculée à la première utilisation, puis gardée)
    function lazy(obj, id, make) {
      Object.defineProperty(obj, id, { configurable: true, get: function () { const v = make(); Object.defineProperty(obj, id, { value: v, configurable: true }); return v; } });
    }
    I.ITEM_ORDER.forEach(function (id) {
      const it = I.ITEMS[id];
      if (!it.base) return;
      lazy(S.icons, id, function () { return I.tint.entry({ c: S.icons[it.base], ax: 0, ay: 0 }, it.c).c; });
      lazy(S.iconURL, id, function () { return S.icons[id].toDataURL(); });
    });

    // armes forgées (identifiant « wp:… ») : icône dessinée à la première demande puis gardée
    ['icons', 'iconURL'].forEach(function (k) {
      S[k] = new Proxy(S[k], { get: function (t, id) {
        if (typeof id === 'string' && id.indexOf('wp:') === 0) {
          if (!(id in t)) { const a = I.forge.weapon(id); if (!a) return undefined; const cv = I.forgeArt.weaponCanvas(a); t[id] = k === 'icons' ? cv : cv.toDataURL(); }
          return t[id];
        }
        if (typeof id === 'string' && id.indexOf('fd:') === 0) { // plats cuisinés : icône dessinée selon le genre, la couleur et les parts restantes
          if (!(id in t)) { const cv = I.foodArt.canvas(id); if (!cv) return undefined; t[id] = k === 'icons' ? cv : cv.toDataURL(); }
          return t[id];
        }
        return t[id];
      } });
    });

    S.shadow = { tree: shadowSprite(26, 9), rock: shadowSprite(16, 6), small: shadowSprite(12, 5), bush: shadowSprite(15, 5), house: shadowSprite(68, 10), bench: shadowSprite(34, 7), player: shadowSprite(11, 4), drop: shadowSprite(8, 3) };
    S.cloud = [cloudSprite(1), cloudSprite(2), cloudSprite(3)];
    const glowCache = {};
    /** Halo de la couleur « r,g,b » (quantifiée pour borner le cache) : lueur changeante des tables d'enchantement. */
    S.glowOf = function (rgb) { const q = rgb.map(function (v) { return Math.min(255, Math.round(v / 32) * 32); }).join(','); return glowCache[q] || (glowCache[q] = glowSprite(26, q)); };
    S.glow = { warm: glowSprite(18, '255,200,110'), cyan: glowSprite(14, '110,230,255'), violet: glowSprite(26, '170,130,255'), small: glowSprite(6, '255,240,150'), white: glowSprite(16, '230,240,255'), red: glowSprite(16, '255,70,70'), big: glowSprite(48, '190,170,255') };
    return S;
  };
})((window.Iles = window.Iles || {}));
