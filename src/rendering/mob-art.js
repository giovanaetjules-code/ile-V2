/*
 * Dessin procédural des monstres (voir content/mob-gen.js) : une grille de pixels remplie selon le plan de corps (araignée, golem,
 * spectre, bête, œil, diablotin, scorpion), puis motifs, pointes, ombrage et contour. Tout vient de l'espèce : aucune image à fournir.
 * sprite(D, i, v, frame, gauche) -> { c: canvas, ax, ay } (ancre = sous les pieds). Les monstres regardent à droite.
 * Codes de la grille : 1 corps, 2 secondaire (plaques, ventre), 3 accent (cornes, pointes), 4 motif, 5 sombre (bouche, orbites),
 * 6 blanc (dents, griffes), 7 LUMINEUX (yeux, noyau, fissures : couleur de l'élément), 8 membre lointain.
 */
(function (I) {
  const R = I.rng, W = 56, H = 50, GY = H - 6;
  const cache = new Map();
  const sin = Math.sin;

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
    for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; this.set(x, y, c); if (th > 1) { this.set(x, y + 1, c); this.set(x + 1, y, c); } }
  };
  Grid.prototype.tri = function (x0, y0, x1, y1, x2, y2, c) {
    const mnx = Math.floor(Math.min(x0, x1, x2)), mxx = Math.ceil(Math.max(x0, x1, x2)), mny = Math.floor(Math.min(y0, y1, y2)), mxy = Math.ceil(Math.max(y0, y1, y2));
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (!d) return;
    for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) {
      const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d, b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
      if (a >= 0 && b >= 0 && a + b <= 1) this.set(x, y, c);
    }
  };

  /** Cornes / pointes d'une tête dont le sommet est en (x, y - r). */
  function hornsAt(g, s, x, y, r) {
    const ty = y - r, k = 2 + (s.size >> 1);
    if (s.horns === 'one') g.line(x + 1, ty + 1, x + 2, ty - k - 1, 3, 2);
    else if (s.horns === 'two') { g.line(x - r * 0.5, ty + 1, x - r * 0.5 - 1, ty - k, 3, 2); g.line(x + r * 0.6, ty + 1, x + r * 0.6 + 1, ty - k, 3, 2); }
    else if (s.horns === 'curl') { g.line(x, ty + 1, x, ty - k, 3, 2); g.line(x, ty - k, x + 2, ty - k - 1, 3); g.set(x + 3, ty - k, 3); }
    else if (s.horns === 'many') for (let j = -1; j <= 1; j++) g.line(x + j * 2.5, ty + 1, x + j * 3.5, ty - k + Math.abs(j), 3);
    if (s.crest) for (let j = -2; j <= 2; j++) g.line(x + j * 1.5 - 2, ty + 1, x + j * 1.5 - 3, ty - 1 - (2 - Math.abs(j)), 3);
  }

  // ---------- plans de corps : chacun renvoie la zone du corps pour les motifs { cx, cy, rx, ry, bodyL, bodyR, topY } ----------
  function spider(g, s, f) {
    const bw = s.bw + 5, bh = s.bh + 3, lh = 6 + s.size * 2.2, cx = 22 + bw / 2, cy = GY - lh - bh * 0.3;
    const tx = cx + bw * 0.38, ty = cy;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 4; i++) { // pattes lointaines (8) puis proches (1)
      const dir = (i - 1.5) * 1.25 + (pass ? 0 : 0.35), ox = cx + bw * 0.12 + (i - 1.5) * bw * 0.14, oy = cy + bh * 0.25;
      const lift = f === 0 ? 0 : ((f === 1) === ((i + pass) % 2 === 0) ? 2 : 0);
      const kx = ox + dir * lh * 0.62, ky = cy - lh * 0.42, fx = ox + dir * lh * 1.15 + (lift ? 1.5 : 0), fy = GY - lift, c = pass ? 1 : 8;
      g.line(ox, oy, kx, ky, c, bh >= 8 ? 2 : 1); g.line(kx, ky, fx, fy, c);
    }
    g.ell(cx - bw * 0.16, cy, bw * 0.5, bh * 0.58, 1);
    g.ell(tx, ty + 1, bw * 0.28, bh * 0.4, 1);
    for (let k = 0; k < s.eyes; k++) g.set(tx + 1 + (k % 3), ty - 2 + ((k / 3) | 0) * 2 - (k % 3 === 1 ? 1 : 0), 7);
    g.set(tx + bw * 0.26, ty + 3, 6); g.set(tx + bw * 0.26 - 2, ty + 3, 6); // crochets
    if (s.arms) { g.line(tx + 2, ty + 2, tx + 6, ty + 5 - (f === 1 ? 1 : 0), 3, 1); }
    return { cx: cx - bw * 0.1, cy: cy, rx: bw * 0.6, ry: bh * 0.58, bodyL: cx - bw * 0.66, bodyR: cx + bw * 0.5, topY: cy - bh * 0.58, hx: tx, hy: ty, hr: 3 };
  }

  function golem(g, s, f) {
    const bw = s.bw + 6, bh = s.bh + 5, lh = 4 + s.size, cx = 28, ty = GY - lh - bh, o = f === 0 ? [0, 0] : f === 1 ? [1, 0] : [0, 1];
    const lw = Math.max(3, Math.round(bw * 0.28));
    g.rect(Math.round(cx - bw * 0.36), GY - lh + 1 - o[0], lw, lh + o[0], 8); // jambe lointaine
    g.rect(Math.round(cx - bw / 2 - 2), Math.round(ty + 3), 3, Math.round(bh * 0.75) + o[1], 8); // bras lointain
    g.rect(Math.round(cx - bw / 2), Math.round(ty), bw, bh, 1);
    g.set(cx - bw / 2, ty, 0); g.set(cx + bw / 2 - 1, ty, 0); g.set(cx - bw / 2, ty + bh - 1, 0); g.set(cx + bw / 2 - 1, ty + bh - 1, 0);
    g.rect(Math.round(cx + bw * 0.04), GY - lh + 1 - o[1], lw, lh + o[1], 1); // jambe proche
    for (let x = cx - bw / 2; x < cx + bw / 2 - 1; x += 3) g.set(x, ty + bh - 1, 2); // ceinture de pierre
    const sr = 3.4 + s.size * 0.7;
    g.ell(cx - bw / 2 + 1, ty + 2, sr, sr, 2); g.ell(cx + bw / 2 - 1, ty + 2, sr, sr, 2); // épaules
    g.rect(Math.round(cx + bw / 2 - 1), Math.round(ty + 4 - o[0]), 3, Math.round(bh * 0.75), 1); // bras proche
    g.ell(cx + bw / 2 + 0.5, ty + 4 + bh * 0.75 - o[0], 3, 2.6, 2); // poing
    const hw = Math.max(5, Math.round(bw * 0.4)), hh = Math.max(4, Math.round(bh * 0.36)), hx = cx + 1, hy = ty - hh + 2;
    g.rect(Math.round(hx - hw / 2), Math.round(hy), hw, hh, 1); g.rect(Math.round(hx - hw / 2), Math.round(hy), hw, 1, 2);
    if (s.eyes === 1) g.rect(Math.round(hx - 1), Math.round(hy + hh * 0.4), 4, 1, 7);
    else { g.set(hx - 1, hy + hh * 0.45, 7); g.set(hx + 2, hy + hh * 0.45, 7); if (s.eyes === 3) g.set(hx + 0.5, hy + 1, 7); }
    if (s.teeth) for (let x = hx - 1; x <= hx + 2; x += 1) g.set(x, hy + hh - 1, x % 2 ? 6 : 5);
    const coreY = ty + bh * 0.45, cr = Math.max(1, Math.round(1 + s.size * 0.5)); // noyau lumineux
    g.ell(cx, coreY, cr + 0.6, cr + 0.6, 5); g.ell(cx, coreY, cr, cr, 7);
    return { cx: cx, cy: ty + bh / 2, rx: bw / 2, ry: bh / 2, bodyL: cx - bw / 2, bodyR: cx + bw / 2, topY: hy, hx: hx, hy: hy + hh / 2, hr: hw / 2, noSpikes: false, headTop: hy };
  }

  function wraith(g, s, f) {
    const hr = 4 + s.size * 1.2, cx = 26, bottom = GY - 4, hy = bottom - hr * 3.6;
    for (let y = Math.round(hy); y <= bottom; y++) { // robe qui s'évase et s'effiloche
      const t = (y - hy) / (bottom - hy), hw = hr * (0.95 + t * 0.75);
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const tat = 1 + Math.abs(sin((x + f * 2.3) * 0.95)) * 3.2 + Math.abs(sin((x - f * 1.7) * 2.1)) * 1.4;
        if (y <= bottom - tat + 3) g.set(x, y, y > hy + hr * 1.7 && ((x + y) % 7 === 0) ? 2 : 1);
      }
    }
    g.ell(cx, hy, hr, hr * 1.08, 1);
    g.ell(cx + hr * 0.3, hy + hr * 0.1, hr * 0.68, hr * 0.74, 5); // visage vide
    if (s.eyes === 1) g.rect(Math.round(cx + hr * 0.2), Math.round(hy - 1), 3, 2, 7);
    else { g.set(cx + hr * 0.05, hy - 1, 7); g.set(cx + hr * 0.05 + 1, hy - 1, 7); g.set(cx + hr * 0.55, hy - 1, 7); g.set(cx + hr * 0.55 + 1, hy - 1, 7); if (s.eyes === 3) g.rect(Math.round(cx + hr * 0.3), Math.round(hy - hr * 0.45), 2, 1, 7); }
    if (s.teeth) for (let x = Math.round(cx + hr * 0.05); x <= cx + hr * 0.7; x++) g.set(x, hy + hr * 0.45, (x & 1) ? 6 : 5);
    const sy = hy + hr * 1.1, w = sin(f * 2.1) * 1.2; // bras en manches, mains griffues
    g.line(cx + hr * 0.7, sy, cx + hr * 1.9, sy + hr * 0.6 + w, 1, 2); g.line(cx + hr * 1.9, sy + hr * 0.6 + w, cx + hr * 2.6, sy + hr * 0.75 + w, 2);
    for (let k = -1; k <= 1; k++) g.line(cx + hr * 2.6, sy + hr * 0.75 + w, cx + hr * 2.6 + 2, sy + hr * 0.75 + w + k * 1.4, 6);
    hornsAt(g, s, cx, hy, hr);
    return { cx: cx, cy: hy + hr * 1.6, rx: hr * 1.4, ry: hr * 2, bodyL: cx - hr * 1.5, bodyR: cx + hr * 1.5, topY: hy - hr, hx: cx, hy: hy, hr: hr, noSpikes: true };
  }

  function beast(g, s, f) {
    const bw = s.bw + 7, bh = s.bh + 3, lh = s.leg + 3, cx = 24 + bw / 2, cy = GY - lh - bh / 2 + 1, th = bw >= 14 ? 3 : 2;
    const xs = [cx - bw * 0.36, cx - bw * 0.12, cx + bw * 0.14, cx + bw * 0.34];
    const leg = function (i, c) {
      const o = f === 0 ? 0 : (f === 1 ? (i % 2 ? 1 : -1) : (i % 2 ? -1 : 1)), len = lh + (o > 0 ? -1 : 0);
      g.rect(Math.round(xs[i] + o), GY - len + 1, i >= 2 ? th : th - 1, len, c); g.set(xs[i] + o + (i >= 2 ? th : th - 1), GY, 6); g.set(xs[i] + o + (i >= 2 ? th : th - 1) + 1, GY, 6); // griffes
    };
    leg(1, 8); leg(3, 8);
    const tx = cx - bw / 2, ty = cy - bh * 0.1;
    if (s.tail === 'long' || s.tail === 'spiked') { g.line(tx, ty, tx - 6, ty - 3 + sin(f * 2) * 1.2, 1, 2); if (s.tail === 'spiked') { g.set(tx - 7, ty - 4, 3); g.set(tx - 8, ty - 5, 3); g.set(tx - 6, ty - 5, 3); } }
    else g.ell(tx - 0.5, ty, 1.8, 1.5, 1);
    g.ell(cx - bw * 0.2, cy + 1, bw * 0.34, bh * 0.5, 1); g.ell(cx + bw * 0.18, cy - bh * 0.14, bw * 0.36, bh * 0.6, 1); g.ell(cx, cy + bh * 0.08, bw * 0.46, bh * 0.44, 1);
    leg(0, 1); leg(2, 1);
    const hr = Math.max(3, bh * 0.52), hx = cx + bw / 2 + hr * 0.1, hy = cy - bh * 0.42;
    g.ell(hx - hr * 0.5, hy + hr * 0.5, hr * 0.8, hr * 0.8, 1); // cou
    g.ell(hx, hy, hr, hr * 0.9, 1); g.ell(hx + hr * 0.9, hy + hr * 0.35, hr * 0.95, hr * 0.5, 1); // crâne + museau
    g.rect(Math.round(hx + hr * 0.2), Math.round(hy + hr * 0.55), Math.round(hr * 1.6), 2, 5); // gueule
    if (s.elem !== 'none') g.set(hx + hr * 0.9, hy + hr * 0.6, 7);
    if (s.teeth) for (let x = Math.round(hx + hr * 0.3); x < hx + hr * 1.9; x += 2) { g.set(x, hy + hr * 0.5, 6); g.set(x + 1, hy + hr * 0.5 + 2, 6); }
    g.ell(hx + hr * 1.5, hy + hr * 0.2, 0.8, 0.8, 5);
    const ex = hx + hr * 0.25, ey = hy - hr * 0.2; g.rect(Math.round(ex), Math.round(ey), 2, 1, 7); if (s.eyes !== 1) g.set(hx - hr * 0.4, ey, 7); if (s.eyes === 3) g.set(hx, hy - hr * 0.6, 7);
    hornsAt(g, s, hx, hy, hr);
    return { cx: cx, cy: cy, rx: bw / 2, ry: bh / 2, bodyL: cx - bw / 2, bodyR: cx + bw / 2, topY: cy - bh * 0.7, hx: hx, hy: hy, hr: hr };
  }

  function eye(g, s, f) {
    const r = 4.5 + s.size * 2.3, cx = 28, cy = GY - 9 - r * 0.4;
    const n = 3 + s.size + (s.arms ? 1 : 0);
    for (let k = 0; k < n; k++) { // tentacules
      const x0 = cx - r * 0.65 + k * (r * 1.3 / (n - 1)), len = r * 1.1 + 3 + (k % 2) * 2;
      let px = x0, py = cy + r * 0.6;
      for (let j = 1; j <= len; j++) { const nx = x0 + sin(j * 0.55 + k * 1.7 + f * 1.9) * (1 + j * 0.12), ny = py + 1; g.line(px, py, nx, ny, k % 2 ? 2 : 1); px = nx; py = ny; }
    }
    g.ell(cx, cy, r, r * 0.94, 1);
    g.ell(cx + r * 0.2, cy, r * 0.74, r * 0.74, 6); // blanc de l'œil
    g.ell(cx + r * 0.36, cy, r * 0.46, r * 0.46, 7); g.ell(cx + r * 0.44, cy, r * 0.2, r * 0.36, 5);
    for (let y = Math.floor(cy - r); y < cy; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (g.get(x, y) === 6 && y < cy - r * 0.15 + (x - cx) * 0.3) g.set(x, y, 1); // paupière en colère
    if (s.teeth) for (let x = Math.round(cx - r * 0.5); x < cx + r * 0.5; x += 2) g.set(x, cy + r * 0.8, 6);
    hornsAt(g, s, cx, cy, r * 0.9);
    return { cx: cx, cy: cy, rx: r, ry: r * 0.94, bodyL: cx - r, bodyR: cx + r, topY: cy - r, hx: cx, hy: cy, hr: r, noSpikes: false };
  }

  function imp(g, s, f) {
    const bw = Math.max(6, s.bw), bh = Math.max(6, s.bh + 1), cx = 26, bottom = GY - 5, cy = bottom - 3 - bh * 0.5;
    const fl = f === 1 ? -5 - bh * 0.4 : f === 2 ? 3 : -1; // battement d'ailes
    const sx = cx - 1, sy = cy - bh * 0.3, L = 9 + s.size * 3;
    g.tri(sx, sy, sx - L, sy - bh * 0.8 + fl, sx - L * 0.78, sy + bh * 0.3 + fl * 0.3, 3); g.tri(sx, sy, sx - L * 0.78, sy + bh * 0.3 + fl * 0.3, sx - L * 0.25, sy + bh * 0.9, 3);
    g.line(sx, sy, sx - L, sy - bh * 0.8 + fl, 2); g.line(sx, sy, sx - L * 0.78, sy + bh * 0.3 + fl * 0.3, 2);
    const tx = cx - bw * 0.35, ty = cy + bh * 0.3; // queue à pointe
    g.line(tx, ty, tx - 5, ty + 3 + sin(f * 2) * 1.5, 1); g.line(tx - 5, ty + 3 + sin(f * 2) * 1.5, tx - 8, ty - 1, 1); g.tri(tx - 8, ty - 1, tx - 10, ty + 1, tx - 7, ty - 4, 3);
    g.rect(Math.round(cx - bw * 0.2), bottom - 3, 2, 3, 8); g.rect(Math.round(cx + bw * 0.1), bottom - 3, 2, 3, 1); g.line(cx + bw * 0.1, bottom, cx + bw * 0.1 + 2, bottom, 6);
    g.ell(cx, cy, bw * 0.4, bh * 0.5, 1); g.ell(cx, cy + bh * 0.15, bw * 0.28, bh * 0.3, 2);
    g.line(cx + bw * 0.3, cy - 1, cx + bw * 0.3 + 4, cy + 2 + (f === 2 ? 1 : 0), 1); g.set(cx + bw * 0.3 + 5, cy + 3, 6); g.set(cx + bw * 0.3 + 5, cy + 1, 6); // bras griffu
    const hr = Math.max(3.2, bh * 0.58), hx = cx + bw * 0.12, hy = cy - bh * 0.5 - hr * 0.55;
    g.ell(hx, hy, hr * 1.1, hr, 1);
    g.tri(hx - hr * 0.5, hy - hr * 0.3, hx - hr * 1.9, hy - hr * 1.0, hx - hr * 0.8, hy + hr * 0.4, 1); // oreilles pointues
    g.tri(hx + hr * 0.7, hy - hr * 0.4, hx + hr * 1.9, hy - hr * 1.1, hx + hr * 1.0, hy + hr * 0.3, 1);
    g.rect(Math.round(hx + hr * 0.1), Math.round(hy - hr * 0.35), 2, 2, 7); g.rect(Math.round(hx + hr * 0.75), Math.round(hy - hr * 0.35), 2, 2, 7);
    g.rect(Math.round(hx + hr * 0.05), Math.round(hy + hr * 0.4), Math.max(3, Math.round(hr * 1.1)), 1, 5); if (s.teeth) for (let x = Math.round(hx + hr * 0.1); x < hx + hr * 1.1; x += 2) g.set(x, hy + hr * 0.4, 6);
    hornsAt(g, s, hx, hy, hr);
    return { cx: cx, cy: cy, rx: bw * 0.4, ry: bh * 0.5, bodyL: cx - bw * 0.4, bodyR: cx + bw * 0.4, topY: hy - hr, hx: hx, hy: hy, hr: hr, noSpikes: true };
  }

  function scorpion(g, s, f) {
    const bw = s.bw + 9, bh = Math.max(5, s.bh), cx = 22 + bw / 2, cy = GY - 3 - bh * 0.5;
    for (let k = 0; k < 3; k++) { // pattes en tripode
      const up = (f === 1 && k !== 1) || (f === 2 && k === 1), x = cx - bw * 0.25 + k * bw * 0.22;
      g.line(x, cy + bh * 0.3, x + (k - 1) * 1.6 + 1, up ? GY - 1 : GY, 8); g.line(x + 2, cy + bh * 0.3, x + 2 + (k - 1) * 1.6 + 1, up ? GY - 1 : GY, 1);
    }
    g.ell(cx - bw * 0.28, cy, bw * 0.24, bh * 0.52, 1); g.ell(cx, cy, bw * 0.28, bh * 0.56, 1); g.ell(cx + bw * 0.3, cy, bw * 0.22, bh * 0.45, 1);
    for (let k = -1; k <= 1; k++) g.set(cx + k * bw * 0.28, cy - bh * 0.4, 2); // plaques
    const px = cx + bw * 0.5, py = cy - 1; // pinces
    g.line(cx + bw * 0.3, cy + 1, px + 3, py + 1 - (f === 1 ? 1 : 0), 1, 2);
    g.ell(px + 5, py - 1, 3.2 + s.size * 0.3, 2.3, 2); g.ell(px + 5, py + 2.5, 3, 1.7, 2); g.set(px + 8, py + 0.5, 0); g.set(px + 9, py + 0.5, 0);
    const k0 = cx - bw * 0.5, base = cy - bh * 0.3, wv = f === 1 ? -1 : f === 2 ? 1 : 0; // queue arquée
    const T = [[k0, base], [k0 - 3, base - bh * 0.9 - 2], [k0 - 1, base - bh * 1.8 - 3], [cx - bw * 0.1, base - bh * 2.0 - 4 + wv], [cx + bw * 0.12, base - bh * 1.6 - 3 + wv]];
    for (let k = 0; k < T.length - 1; k++) g.line(T[k][0], T[k][1], T[k + 1][0], T[k + 1][1], 1, 2);
    const e = T[T.length - 1]; g.ell(e[0] + 1, e[1] + 1, 2, 2, 3); g.set(e[0] + 2, e[1] + 3, 7); g.set(e[0] + 2, e[1] + 4, 7);
    g.set(cx + bw * 0.38, cy - bh * 0.3, 7); if (s.eyes !== 1) g.set(cx + bw * 0.38 + 2, cy - bh * 0.3, 7);
    if (s.teeth) { g.set(cx + bw * 0.5, cy + bh * 0.3, 6); g.set(cx + bw * 0.5 + 1, cy + bh * 0.3, 6); }
    return { cx: cx, cy: cy, rx: bw * 0.5, ry: bh * 0.55, bodyL: cx - bw * 0.5, bodyR: cx + bw * 0.5, topY: cy - bh * 0.55, hx: cx + bw * 0.35, hy: cy, hr: 3, noSpikes: false };
  }

  const PLAN = { spider: spider, golem: golem, wraith: wraith, beast: beast, eye: eye, imp: imp, scorpion: scorpion };

  // ---------- dessin complet : corps, motifs, pointes ----------
  function draw(s, v, f) {
    const g = new Grid(), B = PLAN[s.plan](g, s, f), hs = s.seed % 997, copy = g.d.slice();
    const inBody = function (x, y) { const dx = (x + 0.5 - B.cx) / (B.rx + 1), dy = (y + 0.5 - B.cy) / (B.ry + 1); return dx * dx + dy * dy <= 1.25; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (copy[y * W + x] !== 1 || !inBody(x, y)) continue;
      switch (s.pattern) {
        case 'spots': if (R.hash2((x >> 1) + v * 5, (y >> 1), hs) < 0.2) g.set(x, y, 4); break;
        case 'stripes': if (((x + (v & 1)) % 4) < 2 && x >= B.bodyL && x <= B.bodyR && y < B.cy + B.ry * 0.4) g.set(x, y, 4); break;
        case 'plates': if ((y - Math.floor(B.topY)) % 4 === 0) g.set(x, y, 2); break;
        case 'cracks': { const q = R.fbm(x * 0.21 + v * 7, y * 0.21, hs, 2); if (Math.abs(q - 0.5) < 0.028) g.set(x, y, 7); break; }
      }
    }
    if (s.spikes && !B.noSpikes) for (let x = Math.round(B.bodyL + 1); x < B.bodyR - 1; x += 3) {
      let y = 0; while (y < H && g.get(x, y) === 0) y++;
      if (y < H && y > 3 && g.get(x, y) !== 7) { g.set(x, y - 1, 3); g.set(x, y - 2, 3); if (s.size >= 2) g.set(x, y - 3, 3); }
    }
    return g;
  }

  // ---------- grille -> canvas (ombrage, contour, recadrage) ----------
  const mul = function (c, k) { return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]; };
  function render(s, v, f, left) {
    const g = draw(s, v, f), C = s.col, tone = 1 + ((v & 3) - 1.5) * 0.04;
    const base = { 1: mul(C.body, tone), 2: mul(C.alt, tone), 3: C.acc, 4: C.pat, 5: [14, 8, 22], 6: [244, 240, 228], 7: C.glow, 8: mul(C.body, 0.62) };
    const edge = mul(C.body, 0.16); edge[0] += 10; edge[1] += 6; edge[2] += 22;
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
        if (code === 1 || code === 2) col = mul(col, !solid(x, y - 1) ? 1.3 : !solid(x, y + 1) ? 0.78 : !solid(x - 1, y + 1) && !solid(x + 1, y + 1) ? 0.9 : 1);
        else if (code === 3 || code === 4) col = mul(col, !solid(x, y - 1) ? 1.15 : !solid(x, y + 1) ? 0.85 : 1);
      } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) col = edge;
      else continue;
      ctx.fillStyle = 'rgb(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ')';
      ctx.fillRect(px, y - y0, 1, 1);
    }
    return { c: c, ax: Math.round(w / 2), ay: GY + 1 - y0, h: h };
  }

  /** Image d'un monstre : espèce i de la dimension D, variante v (0..3), image d'animation f (0 repos, 1-2 marche), tournée à gauche ou non. */
  function sprite(D, i, v, f, left) {
    const key = D.seed + ':' + i + ':' + (v & 3) + ':' + f + ':' + (left ? 1 : 0);
    let e = cache.get(key);
    if (!e) {
      e = render(I.mobGen.species(D, i), v & 3, f, !!left);
      if (cache.size > 700) cache.delete(cache.keys().next().value);
      cache.set(key, e);
    }
    return e;
  }

  I.mobArt = { sprite: sprite };
})((window.Iles = window.Iles || {}));
