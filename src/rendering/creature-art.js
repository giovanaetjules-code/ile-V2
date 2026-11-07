/*
 * Dessin procédural des créatures (voir content/creature-gen.js) : une grille de pixels remplie avec des primitives selon le plan de corps
 * (quadrupède, bipède, blob, serpent, insecte), puis motifs, ombrage et contour. Tout vient de l'espèce : aucune image à fournir.
 * sprite(D, i, v, frame, gauche) -> { c: canvas, ax, ay } (ancre = sous les pieds). Les créatures regardent à droite ; la version gauche est retournée.
 * Codes de la grille : 1 corps, 2 secondaire (ventre, museau), 3 accent (cornes, crête, coque), 4 motif, 5 sombre (yeux), 6 blanc, 8 patte lointaine.
 */
(function (I) {
  const R = I.rng, W = 44, H = 40, GY = H - 4; // GY : dernière ligne des pieds
  const cache = new Map();

  function Grid() { this.d = new Uint8Array(W * H); }
  Grid.prototype.set = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) this.d[y * W + x] = c; };
  Grid.prototype.get = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H ? this.d[y * W + x] : 0; };
  Grid.prototype.ell = function (cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  };
  Grid.prototype.rect = function (x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); };
  Grid.prototype.line = function (x0, y0, x1, y1, c, th) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; this.set(x, y, c); if (th > 1) this.set(x, y + 1, c); }
  };

  // ---------- plans de corps : chacun renvoie la zone du corps { cx, cy, rx, ry } et la tête { x, y, r } ----------
  function head(g, s, hx, hy, hr, mane) {
    if (mane) g.ell(hx - hr * 0.7, hy + 0.5, hr * 1.1, hr * 1.15, 3);
    if (s.head === 'flat') g.ell(hx, hy + 1, hr * 1.15, hr * 0.8, 1);
    else g.ell(hx, hy, hr, hr * 0.92, 1);
    if (s.head === 'snout') { g.ell(hx + hr * 0.85, hy + hr * 0.3, hr * 0.85, hr * 0.5, 2); }
  }

  function quad(g, s, f) {
    const bw = s.bw, bh = s.bh, cx = 17 + bw / 2, cy = GY - s.leg - bh / 2 + 1, th = bw >= 12 ? 2 : 1;
    const xs = [cx - bw * 0.36, cx - bw * 0.12, cx + bw * 0.14, cx + bw * 0.34];
    const leg = function (i, code) {
      const o = f === 0 ? 0 : (f === 1 ? (i % 2 ? 1 : -1) : (i % 2 ? -1 : 1)), len = s.leg + (o > 0 ? -1 : 0);
      g.rect(Math.round(xs[i] + o), GY - len + 1, th, len, code);
    };
    leg(1, 8); leg(3, 8);
    const tx = cx - bw / 2, ty = cy - bh * 0.15;
    if (s.tail === 'stub') g.ell(tx - 0.5, ty, 1.8, 1.5, 1);
    else if (s.tail === 'long') g.line(tx, ty, tx - 5, ty - 3, 1, 2);
    else if (s.tail === 'fluffy') g.ell(tx - 1.5, ty - 1, 2.6, 2.6, 2);
    else if (s.tail === 'curl') { g.line(tx, ty, tx - 3, ty - 1, 1); g.line(tx - 3, ty - 1, tx - 3, ty - 4, 1); g.set(tx - 2, ty - 4, 1); }
    g.ell(cx, cy, bw / 2, bh / 2, 1);
    leg(0, 1); leg(2, 1);
    const hr = Math.max(2.2, bh * 0.5 * s.hr), hx = cx + bw / 2 - hr * 0.2, hy = cy - bh / 2 + hr * 0.1 - (s.plan === 'quad' && s.head === 'snout' ? 0 : 0.5);
    head(g, s, hx, hy, hr, s.extra === 'mane');
    return { cx: cx, cy: cy, rx: bw / 2, ry: bh / 2, hx: hx, hy: hy, hr: hr, topY: cy - bh / 2, bodyL: cx - bw / 2, bodyR: cx + bw / 2 };
  }

  function biped(g, s, f) {
    const bw = Math.max(4, Math.round(s.bw * 0.62)), bh = Math.round(s.bh * 1.15), cx = 18 + bw / 2, cy = GY - s.leg - bh / 2 + 1;
    const o = f === 0 ? [0, 0] : f === 1 ? [1, -1] : [-1, 1];
    g.rect(Math.round(cx - bw * 0.28 + o[0]), GY - s.leg + 1, bw >= 7 ? 2 : 1, s.leg, 8);
    const tx = cx - bw / 2, ty = cy + bh * 0.25;
    if (s.tail === 'long') g.line(tx, ty, tx - 5, ty + 1, 1, 2);
    else if (s.tail === 'fluffy') g.ell(tx - 1.5, ty, 2.5, 2.5, 2);
    else if (s.tail === 'curl') { g.line(tx, ty, tx - 3, ty, 1); g.line(tx - 3, ty, tx - 3, ty - 3, 1); }
    else if (s.tail === 'stub') g.ell(tx - 0.5, ty, 1.8, 1.5, 1);
    g.ell(cx, cy, bw / 2, bh / 2, 1);
    g.rect(Math.round(cx + bw * 0.08 + o[1]), GY - s.leg + 1, bw >= 7 ? 2 : 1, s.leg, 1);
    g.rect(Math.round(cx + bw / 2 - 1), Math.round(cy - 1 - o[0] * 0.5), 1, Math.max(2, Math.round(bh * 0.3)), 1); // petit bras
    const hr = Math.max(2.2, bh * 0.42 * s.hr), hx = cx + 1, hy = cy - bh / 2 - hr * 0.35;
    head(g, s, hx, hy, hr, s.extra === 'mane');
    return { cx: cx, cy: cy, rx: bw / 2, ry: bh / 2, hx: hx, hy: hy, hr: hr, topY: hy - hr, bodyL: cx - bw / 2, bodyR: cx + bw / 2 };
  }

  function blob(g, s, f) {
    const rx = s.bw / 2 + (f === 1 ? 1 : f === 2 ? -1 : 0), ry = s.bh * 0.85 + (f === 1 ? -1 : f === 2 ? 1 : 0), cx = 17 + s.bw / 2, cy = GY - ry * 0.55;
    if (s.tail !== 'none') g.ell(cx - rx, cy + ry * 0.3, 1.8, 1.5, 1);
    g.ell(cx, cy, rx, ry, 1);
    for (let y = GY + 1; y < H; y++) for (let x = 0; x < W; x++) g.set(x, y, 0);
    g.rect(Math.round(cx - rx * 0.5), GY, 2, 1, 8); g.rect(Math.round(cx + rx * 0.3), GY, 2, 1, 8);
    const hr = Math.max(2.2, ry * 0.6);
    return { cx: cx, cy: cy, rx: rx, ry: ry, hx: cx + rx * 0.3, hy: cy - ry * 0.3, hr: hr * 0.8, topY: cy - ry, bodyL: cx - rx, bodyR: cx + rx, noHead: true };
  }

  function serpent(g, s, f) {
    const n = s.segs, br = Math.max(1.5, s.bh * 0.5), sp = Math.max(2, br * 1.05), x0 = 8 + n * sp, cy0 = GY - br - 2;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([x0 - i * sp, cy0 + Math.sin(i * 0.95 + f * 2.1) * 1.6, Math.max(1, br * (1 - i / n * 0.65))]);
    for (let i = n - 1; i >= 1; i--) g.ell(pts[i][0], pts[i][1], pts[i][2] + 0.2, pts[i][2] + 0.2, 1);
    const hr = br * 1.15, hx = pts[0][0] + 1, hy = pts[0][1] - 0.5;
    head(g, s, hx, hy, hr, false);
    return { cx: (pts[0][0] + pts[n - 1][0]) / 2, cy: cy0, rx: (pts[0][0] - pts[n - 1][0]) / 2 + br, ry: br, hx: hx, hy: hy, hr: hr, topY: cy0 - br, bodyL: pts[n - 1][0] - br, bodyR: pts[0][0] + br, noPat: false };
  }

  function bug(g, s, f) {
    const bw = Math.max(5, Math.round(s.bw * 0.85)), bh = Math.max(4, Math.round(s.bh * 0.85)), cx = 17 + bw / 2, cy = GY - 3 - bh / 2;
    for (let k = 0; k < 3; k++) { // trois pattes visibles, marche en tripode
      const up = (f === 1 && k !== 1) || (f === 2 && k === 1), x = cx - bw * 0.3 + k * bw * 0.3;
      g.line(x, cy + bh * 0.3, x + (k - 1) * 1.2 + 1, up ? GY - 1 : GY, 8);
    }
    g.ell(cx, cy, bw / 2, bh / 2, 1);
    const hr = Math.max(2, bh * 0.45), hx = cx + bw / 2 + hr * 0.3, hy = cy;
    head(g, s, hx, hy, hr, false);
    return { cx: cx, cy: cy, rx: bw / 2, ry: bh / 2, hx: hx, hy: hy, hr: hr, topY: cy - bh / 2, bodyL: cx - bw / 2, bodyR: cx + bw / 2 };
  }

  const PLAN = { quad: quad, biped: biped, blob: blob, serpent: serpent, bug: bug };

  // ---------- dessin complet d'une créature ----------
  function draw(s, v, f) {
    const g = new Grid(), B = PLAN[s.plan](g, s, f), r = R.mulberry32(s.seed + v * 131);
    // ventre et motifs sur les pixels de corps
    const inBody = function (x, y) { const dx = (x + 0.5 - B.cx) / (B.rx + 1), dy = (y + 0.5 - B.cy) / (B.ry + 1); return dx * dx + dy * dy <= 1.2; };
    const hs = s.seed % 997, copy = g.d.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (copy[y * W + x] !== 1) continue;
      if (s.belly && y > B.cy + B.ry * 0.25 && inBody(x, y) && s.plan !== 'serpent') { g.set(x, y, 2); continue; }
      if (s.belly && s.plan === 'serpent' && y > B.cy + B.ry * 0.2) { g.set(x, y, 2); continue; }
      switch (s.pattern) {
        case 'spots': if (R.hash2((x >> 1) + v * 5, (y >> 1), hs) < 0.2) g.set(x, y, 4); break;
        case 'stripes': if (((x + (v & 1)) % 4) < 2 && x >= B.bodyL - 1 && x <= B.bodyR) g.set(x, y, 4); break;
        case 'patches': if (R.fbm(x * 0.17 + v * 9, y * 0.17, hs, 2) > 0.56) g.set(x, y, 4); break;
        case 'dorsal': if (y <= B.cy - B.ry * 0.3 && x >= B.bodyL && x <= B.bodyR) g.set(x, y, 4); break;
      }
    }
    // extras
    if (s.extra === 'spikes') for (let x = Math.round(B.bodyL + 1); x < B.bodyR - 1; x += 3) {
      let y = 0; while (y < H && g.get(x, y) === 0) y++;
      if (y < H) { g.set(x, y - 1, 3); g.set(x, y - 2, 3); }
    }
    if (s.extra === 'shell' && s.plan !== 'serpent') {
      g.ell(B.cx, B.cy - 1, B.rx + 0.5, B.ry * 0.95, 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y) === 3 && ((x + y) % 4 === 0) && y < B.cy) g.set(x, y, 4);
    }
    // oreilles, cornes, crête
    const hx = B.hx, hy = B.hy, hr = B.hr, ty = hy - hr;
    const ear = B.noHead ? { x: B.cx + B.rx * 0.2, y: B.topY } : { x: hx - hr * 0.3, y: ty + 0.5 };
    if (s.ears === 'point') { g.set(ear.x, ear.y - 1, 1); g.set(ear.x, ear.y - 2, 1); g.set(ear.x + 2, ear.y - 1, 1); g.set(ear.x + 2, ear.y - 2, 1); g.set(ear.x + 1, ear.y - 1, 2); }
    else if (s.ears === 'round') { g.ell(ear.x, ear.y - 1, 1.5, 1.5, 1); g.ell(ear.x + 2.5, ear.y - 1, 1.5, 1.5, 1); }
    else if (s.ears === 'long') { g.rect(ear.x - 1, ear.y - 4, 1, 4, 1); g.rect(ear.x + 1, ear.y - 5, 1, 5, 1); }
    else if (s.ears === 'antenna' || s.plan === 'bug') { g.line(ear.x + 1, ear.y, ear.x + 3, ear.y - 4, 5); g.set(ear.x + 3, ear.y - 5, 3); g.line(ear.x - 1, ear.y, ear.x - 1, ear.y - 3, 5); g.set(ear.x - 1, ear.y - 4, 3); }
    else if (s.ears === 'crest') { for (let k = 0; k < 3; k++) { g.set(ear.x - 1 + k, ear.y - 1, 3); if (k === 1) g.set(ear.x, ear.y - 2, 3); } }
    if (s.horns === 'one') g.line(hx + 1, ty + 1, hx + 2, ty - 2, 3);
    else if (s.horns === 'two') { g.line(hx - 1, ty + 1, hx - 2, ty - 2, 3); g.line(hx + 2, ty + 1, hx + 3, ty - 2, 3); }
    else if (s.horns === 'curl') { g.line(hx, ty + 1, hx, ty - 2, 3); g.set(hx + 1, ty - 3, 3); g.set(hx + 2, ty - 3, 3); }
    // yeux
    const ex = hx + hr * 0.35, ey = hy - hr * 0.1, big = s.bigEyes && hr >= 2.8;
    const eye = function (x, y) { if (big) { g.rect(x - 0.5, y - 1, 2, 2, 6); g.set(x + 0.5, y, 5); g.set(x + 0.5, y - 1, 5); } else { g.set(x, y, 5); } };
    if (s.eyes === 1) eye(Math.round(hx + hr * 0.1), Math.round(ey));
    else { eye(Math.round(ex), Math.round(ey)); eye(Math.round(hx - hr * 0.45), Math.round(ey)); if (s.eyes === 3) g.set(Math.round(hx + hr * 0.05), Math.round(hy - hr * 0.65), 5); }
    if (s.head === 'snout' && !B.noHead) g.set(Math.round(hx + hr * 1.6), Math.round(hy + hr * 0.2), 5); // nez
    return g;
  }

  // ---------- grille -> canvas (ombrage, contour, recadrage) ----------
  const mul = function (c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; };
  function render(s, v, f, left) {
    const g = draw(s, v, f), C = s.col, tone = 1 + ((v & 3) - 1.5) * 0.035;
    const base = { 1: mul(C.body, tone), 2: mul(C.alt, tone), 3: C.acc, 4: C.pat, 5: [30, 24, 40], 6: [250, 250, 250], 8: mul(C.body, 0.72) };
    const edge = mul(C.body, 0.22); edge[0] += 16; edge[1] += 12; edge[2] += 26;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const solid = function (x, y) { return g.get(x, y) > 0; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(x, y)) { x0 = Math.min(x0, x - 1); y0 = Math.min(y0, y - 1); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const code = g.get(x, y), px = left ? x1 - x : x - x0;
      let col;
      if (code > 0) {
        col = base[code];
        if (code === 1 || code === 2) col = mul(col, !solid(x, y - 1) ? 1.22 : !solid(x, y + 1) ? 0.8 : !solid(x - 1, y + 1) && !solid(x + 1, y + 1) ? 0.9 : 1);
        else if (code === 3 || code === 4) col = mul(col, !solid(x, y - 1) ? 1.15 : !solid(x, y + 1) ? 0.85 : 1);
      } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) col = edge;
      else continue;
      ctx.fillStyle = 'rgb(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ')';
      ctx.fillRect(px, y - y0, 1, 1);
    }
    return { c: c, ax: Math.round(w / 2), ay: GY + 1 - y0 };
  }

  /** Image d'une créature : espèce i de la dimension D, variante v (0..3), image d'animation f (0 repos, 1-2 marche), tournée à gauche ou non. */
  function sprite(D, i, v, f, left) {
    const key = D.seed + ':' + i + ':' + (v & 3) + ':' + f + ':' + (left ? 1 : 0);
    let e = cache.get(key);
    if (!e) {
      e = render(I.creatureGen.species(D, i), v & 3, f, !!left);
      if (cache.size > 900) cache.delete(cache.keys().next().value);
      cache.set(key, e);
    }
    return e;
  }

  I.creatureArt = { sprite: sprite };
})((window.Iles = window.Iles || {}));
