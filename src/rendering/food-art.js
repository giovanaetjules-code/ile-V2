/*
 * Icônes des plats cuisinés (16x16) : dessinées selon le genre, teintées par la couleur du plat (mélange des ingrédients),
 * la tarte et le pain perdent des parts quand on les mange. Même icône dans le sac, la main, les stations.
 */
(function (I) {
  function rc(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function shade(hex, k) { // k > 0 éclaircit, k < 0 assombrit
    const v = [0, 2, 4].map(function (i) { const c = parseInt(hex.slice(i, i + 2), 16); return Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)); });
    return 'rgb(' + v.join(',') + ')';
  }
  const DRAW = {
    juice: function (g, c, d, l) { rc(g, 6, 0, 4, 2, '#a8703c'); rc(g, 6, 2, 4, 2, '#cfe4ee'); rc(g, 4, 4, 8, 10, '#cfe4ee'); rc(g, 5, 6, 6, 7, c); rc(g, 5, 6, 6, 1, l); rc(g, 6, 7, 1, 4, l); rc(g, 5, 12, 6, 1, d); },
    powder: function (g, c, d, l) { rc(g, 2, 11, 12, 3, c); rc(g, 4, 8, 8, 3, c); rc(g, 6, 6, 4, 2, c); rc(g, 6, 6, 2, 1, l); rc(g, 4, 8, 2, 1, l); rc(g, 3, 13, 10, 1, d); rc(g, 9, 10, 1, 1, d); },
    grill: function (g, c, d, l) { rc(g, 3, 4, 10, 9, c); rc(g, 2, 6, 12, 5, c); rc(g, 4, 5, 3, 1, l); [4, 7, 10].forEach(function (x) { rc(g, x, 5, 1, 7, d); }); rc(g, 3, 12, 10, 1, d); },
    soup: function (g, c, d, l) { rc(g, 2, 7, 12, 6, '#d8d0c0'); rc(g, 3, 5, 10, 3, c); rc(g, 4, 5, 3, 1, l); rc(g, 5, 13, 6, 2, '#a8a090'); rc(g, 2, 7, 12, 1, '#f0ece0'); px(g, 6, 2, '#ffffff'); px(g, 9, 3, '#ffffff'); },
    pasta: function (g, c, d, l) { for (let x = 4; x < 12; x++) rc(g, x, 3, 1, 10, x % 2 ? c : l); rc(g, 3, 7, 10, 2, '#a8703c'); },
    spag: function (g, c, d, l, e) { rc(g, 1, 10, 14, 4, '#e8e8f0'); rc(g, 3, 5, 10, 6, '#f0d890'); for (let x = 3; x < 13; x += 2) rc(g, x, 6, 1, 4, '#d8b860'); rc(g, 5, 4, 6, 3, c); rc(g, 6, 4, 2, 1, l); rc(g, 1, 13, 14, 1, '#b8b8c8'); },
    braw: function (g, c, d, l) { rc(g, 3, 7, 10, 6, c); rc(g, 5, 5, 6, 3, c); rc(g, 4, 6, 3, 1, l); rc(g, 3, 12, 10, 1, d); },
    bread: function (g, c, d, l, e) {
      const w = 4 + Math.round(10 * e.p / e.m); // le pain raccourcit quand on le mange
      rc(g, 1, 7, w, 6, '#c88a4a'); rc(g, 3, 5, Math.max(1, w - 4), 3, '#c88a4a'); rc(g, 2, 7, Math.max(1, w - 2), 1, '#e8b070'); rc(g, 1, 12, w, 1, '#8a5a30');
      rc(g, 1 + w - 3, 7, 3, 6, c); rc(g, 1 + w - 3, 7, 3, 1, l); // mie visible : couleur du pain
      [3, 6].forEach(function (x) { if (x < w - 3) rc(g, x, 8, 1, 2, '#a86a3a'); });
    },
    tart: function (g, c, d, l, e) {
      const q = [0, 1, 3, 2]; // ordre dans lequel les parts disparaissent
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 8.5, r = Math.hypot(dx, dy);
        if (r > 7.2) continue;
        const quad = (x >= 8 ? 1 : 0) + (y >= 9 ? 2 : 0);
        if (q.indexOf(quad) >= e.p) continue; // part mangée
        g.fillStyle = r > 6 ? '#b87a3a' : r > 5 ? '#d9a05a' : ((x + y * 3) % 7 === 0 ? l : c);
        g.fillRect(x, y, 1, 1);
      }
      if (e.p >= 2) { rc(g, 7, 2, 1, 13, d); } if (e.p >= 3) rc(g, 1, 8, 14, 1, d);
    },
  };
  function px(g, x, y, c) { rc(g, x, y, 1, 1, c); }
  /** Icône d'un plat (canvas 16x16) ou null. */
  function canvas(id) {
    const d = I.cooking.dish(id);
    if (!d) return null;
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    DRAW[d.k](g, '#' + d.c, shade(d.c, -0.38), shade(d.c, 0.35), d);
    const o = document.createElement('canvas'); o.width = o.height = 16;
    const og = o.getContext('2d');
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) { og.drawImage(c, v[0], v[1]); });
    og.globalCompositeOperation = 'source-in'; og.fillStyle = '#2c2a3a'; og.fillRect(0, 0, 16, 16);
    og.globalCompositeOperation = 'source-over'; og.drawImage(c, 0, 0);
    return o;
  }

  // ---------- illustrations de l'écran de cuisine (stations, plats types, cœur, étoile) ----------
  function ell(g, cx, cy, rx, ry, c) {
    g.fillStyle = c;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
    }
  }
  function line(g, x0, y0, x1, y1, w, c) {
    g.fillStyle = c; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w, w);
  }
  function outlined(c) {
    const w = c.width, h = c.height, o = document.createElement('canvas'); o.width = w; o.height = h;
    const og = o.getContext('2d');
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) { og.drawImage(c, v[0], v[1]); });
    og.globalCompositeOperation = 'source-in'; og.fillStyle = '#1e1810'; og.fillRect(0, 0, w, h);
    og.globalCompositeOperation = 'source-over'; og.drawImage(c, 0, 0);
    return o;
  }
  const STATION = {
    mortar: [34, 30, function (g) {
      line(g, 26, 2, 14, 17, 4, '#8a6a40'); line(g, 26, 2, 14, 17, 1, '#b08a58'); ell(g, 27, 3, 3, 3, '#a07a4c');
      ell(g, 17, 22, 14, 7, '#6c6c76'); ell(g, 17, 17, 14, 5, '#a8a8b2'); ell(g, 17, 17, 11, 3, '#45454e'); ell(g, 17, 17, 7, 2, '#d8c8b0'); rc(g, 9, 27, 16, 3, '#55555e'); rc(g, 8, 20, 3, 4, '#85858f');
      ell(g, 30, 9, 2, 2, '#7a3ab0'); ell(g, 27, 11, 2, 2, '#9a5ad8'); ell(g, 31, 12, 2, 2, '#7a3ab0');
    }],
    mixer: [32, 40, function (g) {
      rc(g, 4, 33, 22, 6, '#2f2f38'); rc(g, 4, 33, 22, 1, '#55555f'); rc(g, 6, 9, 18, 24, '#b9d8c0'); rc(g, 7, 17, 16, 15, '#5cc83c'); rc(g, 7, 17, 16, 1, '#a0f070'); rc(g, 8, 10, 2, 20, '#e8fff0');
      rc(g, 4, 5, 22, 5, '#6a6a76'); rc(g, 4, 5, 22, 1, '#9a9aa6'); rc(g, 10, 0, 10, 5, '#44444e'); rc(g, 12, 1, 6, 2, '#6a6a76');
      rc(g, 24, 8, 6, 3, '#6a6a76'); rc(g, 28, 11, 2, 14, '#6a6a76'); rc(g, 24, 28, 7, 9, '#c8e8b8'); rc(g, 25, 31, 5, 5, '#7ad848');
    }],
    pan: [42, 24, function (g) {
      rc(g, 30, 10, 12, 3, '#6a4220'); rc(g, 30, 10, 12, 1, '#9a6a38');
      ell(g, 18, 14, 17, 7, '#26262c'); ell(g, 18, 12, 15, 5, '#4a4a54'); ell(g, 18, 12, 12, 4, '#33333a');
      ell(g, 16, 11, 7, 3, '#b8504a'); ell(g, 14, 10, 3, 1, '#e08070'); rc(g, 12, 12, 8, 1, '#8a3030');
    }],
    pot: [40, 38, function (g) {
      line(g, 28, 0, 27, 14, 2, '#8a5a30'); ell(g, 27, 1, 2, 2, '#a8703c');
      ell(g, 19, 25, 16, 11, '#3a3a44'); rc(g, 3, 14, 32, 12, '#3a3a44'); rc(g, 3, 14, 3, 12, '#2a2a32'); rc(g, 32, 14, 3, 12, '#55555f');
      ell(g, 19, 14, 17, 4, '#7a7a86'); ell(g, 19, 14, 14, 3, '#e8801f'); ell(g, 16, 13, 4, 1, '#f6b04a'); rc(g, 22, 13, 2, 1, '#5cc83c'); rc(g, 12, 14, 2, 1, '#d9423e');
      rc(g, 0, 16, 4, 3, '#55555f'); rc(g, 35, 16, 4, 3, '#55555f'); rc(g, 8, 33, 24, 2, '#f08a2a'); rc(g, 12, 35, 16, 2, '#f6d743');
    }],
    spag: [40, 38, function (g) {
      ell(g, 19, 25, 16, 11, '#3a3a44'); rc(g, 3, 14, 32, 12, '#3a3a44'); rc(g, 32, 14, 3, 12, '#55555f');
      ell(g, 19, 14, 17, 4, '#7a7a86'); ell(g, 19, 14, 14, 3, '#f0d890');
      for (let x = 7; x < 32; x += 3) rc(g, x, 12, 1, 3, '#d8b860'); rc(g, 16, 12, 6, 2, '#e8801f'); rc(g, 8, 33, 24, 2, '#f08a2a');
    }],
    tart: [40, 30, function (g) {
      ell(g, 20, 17, 18, 11, '#b8782e'); ell(g, 20, 15, 18, 11, '#d9a05a'); ell(g, 20, 15, 14, 8, '#e8c070');
      for (let i = 0; i < 14; i++) rc(g, 6 + i * 2, 5 + (i % 2), 2, 1, '#b8782e'); ell(g, 20, 15, 8, 5, '#f0d890'); ell(g, 17, 13, 3, 2, '#fff0c0');
    }],
    bread: [40, 34, function (g) {
      rc(g, 2, 8, 36, 24, '#4a4a56'); ell(g, 20, 8, 18, 6, '#4a4a56'); rc(g, 2, 28, 36, 5, '#2f2f38');
      ell(g, 20, 20, 12, 10, '#1e1810'); rc(g, 8, 20, 24, 10, '#1e1810');
      ell(g, 20, 24, 9, 5, '#b8703a'); ell(g, 20, 23, 9, 4, '#d9954a'); [13, 18, 23, 28].forEach(function (x) { rc(g, x, 21, 2, 1, '#8a4a22'); });
      rc(g, 12, 32, 4, 1, '#f08a2a');
    }],
    jug: [30, 34, function (g) {
      ell(g, 22, 17, 6, 8, '#6a6a76'); ell(g, 22, 17, 3, 5, '#1e1810'); rc(g, 4, 8, 16, 22, '#8e8e9a'); rc(g, 3, 6, 18, 3, '#aaaab6'); rc(g, 4, 8, 3, 22, '#b4b4c0'); rc(g, 16, 8, 4, 22, '#6a6a76'); rc(g, 4, 28, 16, 2, '#55555f'); rc(g, 0, 4, 5, 3, '#8e8e9a');
    }],
    heart: [9, 8, function (g) { rc(g, 1, 0, 3, 2, '#e8574a'); rc(g, 5, 0, 3, 2, '#e8574a'); rc(g, 0, 1, 9, 3, '#e8574a'); rc(g, 1, 4, 7, 1, '#e8574a'); rc(g, 2, 5, 5, 1, '#c8372a'); rc(g, 3, 6, 3, 1, '#c8372a'); rc(g, 4, 7, 1, 1, '#c8372a'); rc(g, 1, 1, 2, 1, '#ffb0a8'); }],
    star: [11, 11, function (g) { rc(g, 5, 0, 1, 11, '#f2c14e'); rc(g, 0, 5, 11, 1, '#f2c14e'); rc(g, 3, 3, 5, 5, '#f2c14e'); rc(g, 4, 2, 3, 7, '#f2c14e'); rc(g, 2, 4, 7, 3, '#f2c14e'); rc(g, 4, 4, 2, 2, '#fff3a0'); }],
  };
  const stCache = {};
  /** Illustration d'une station ou d'un plat type : URL d'image (pixel art, contour sombre). */
  function stationURL(name) {
    if (stCache[name]) return stCache[name];
    const S = STATION[name]; if (!S) return '';
    const c = document.createElement('canvas'); c.width = S[0] + 2; c.height = S[1] + 2;
    const g = c.getContext('2d'); g.translate(1, 1); S[2](g);
    return (stCache[name] = outlined(c).toDataURL());
  }
  I.foodArt = { canvas: canvas, stationURL: stationURL };
})((window.Iles = window.Iles || {}));
