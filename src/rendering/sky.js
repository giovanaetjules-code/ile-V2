/*
 * Ciel du lobby spatial : nébuleuses colorées, deux galaxies spirales, étoiles qui scintillent (3 plans de parallaxe),
 * étoiles filantes et aurores boréales animées. Les grandes textures sont dessinées une seule fois ; à chaque image il ne reste
 * que quelques copies d'images et de petits traits : léger même sur un petit PC.
 * `boost` (0..1) : le portail ultime s'éveille, le ciel s'enflamme ; `rgb` : teinte de la dimension tirée.
 */
(function (I) {
  const NEB = [[130, 50, 210], [50, 130, 240], [235, 70, 170], [50, 210, 205], [245, 150, 70], [90, 70, 230]];
  const AUR = [[[80, 255, 170], [60, 200, 255]], [[170, 110, 255], [255, 110, 220]], [[90, 255, 220], [120, 150, 255]]];
  const cvs = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function nebula(seed, n, alpha) {
    const r = I.rng.mulberry32(seed), c = cvs(768, 432), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 432);
    bg.addColorStop(0, '#04020e'); bg.addColorStop(0.55, '#0b0826'); bg.addColorStop(1, '#190b34');
    g.fillStyle = bg; g.fillRect(0, 0, 768, 432);
    g.globalCompositeOperation = 'lighter';
    const blob = function (x, y, rad, col, a) {
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.5, 'rgba(' + col + ',' + a * 0.4 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (let i = 0; i < n; i++) { const col = NEB[(r() * NEB.length) | 0].join(','), x = r() * 768, y = r() * 432, rad = 70 + r() * 150; blob(x, y, rad, col, alpha * (0.5 + r() * 0.6));
      for (let k = 0; k < 14; k++) blob(x + (r() - 0.5) * rad * 1.4, y + (r() - 0.5) * rad * 1.1, 6 + r() * 22, col, alpha * 0.45); }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 7; i++) { const x = r() * 768, y = r() * 432, rad = 40 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(2,1,10,0.4)'); gr.addColorStop(1, 'rgba(2,1,10,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    return c;
  }
  function galaxy(seed, core, arm) {
    const r = I.rng.mulberry32(seed), c = cvs(128, 128), g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 30); gr.addColorStop(0, 'rgba(' + core + ',0.95)'); gr.addColorStop(0.4, 'rgba(' + core + ',0.3)'); gr.addColorStop(1, 'rgba(' + core + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1100; i++) {
      const t = Math.pow(r(), 0.8), a = t * 7 + (i % 2) * Math.PI + (r() - 0.5) * 0.5, rad = 3 + t * 58, s = (r() - 0.5) * (2 + t * 6);
      const x = 64 + Math.cos(a) * rad + s, y = 64 + Math.sin(a) * rad + s * 0.5;
      g.fillStyle = 'rgba(' + (t < 0.35 ? core : arm) + ',' + (0.25 + r() * 0.5) * (1 - t * 0.5) + ')'; g.fillRect(x | 0, y | 0, r() < 0.15 ? 2 : 1, 1);
    }
    return c;
  }
  function band(a, b) { // dégradé vertical d'aurore : transparent, couleur A, couleur B, transparent
    const c = cvs(1, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(' + a + ',0)'); gr.addColorStop(0.3, 'rgba(' + a + ',0.7)'); gr.addColorStop(0.7, 'rgba(' + b + ',0.4)'); gr.addColorStop(1, 'rgba(' + b + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 1, 64); return c;
  }
  const mod = function (a, n) { return ((a % n) + n) % n; };

  const Sky = {
    ready: false,
    build: function () {
      this.ready = true;
      this.n1 = nebula(11, 20, 0.2); this.n2 = nebula(77, 12, 0.14);
      this.g1 = galaxy(5, '255,235,190', '130,170,255'); this.g2 = galaxy(9, '255,200,230', '190,140,255');
      this.bands = AUR.map(function (p) { return band(p[0].join(','), p[1].join(',')); });
      const r = I.rng.mulberry32(3), cols = ['#ffffff', '#cfe4ff', '#ffe6c8', '#d8d0ff'];
      this.stars = [60, 40, 24].map(function (n) { const a = []; for (let i = 0; i < n; i++) a.push({ x: r(), y: r(), sp: 0.8 + r() * 2.5, ph: r() * 6.28, col: cols[(r() * cols.length) | 0] }); return a; });
    },
    draw: function (ctx, w, h, t, cx, cy, boost, rgb) {
      if (!this.ready) this.build();
      boost = boost || 0;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const sc = Math.max(w / 768, h / 432) * 1.3, dw = 768 * sc, dh = 432 * sc;
      ctx.drawImage(this.n1, -(dw - w) / 2 - cx * 0.03 + Math.sin(t * 0.02) * 24, -(dh - h) / 2 - cy * 0.03 + Math.cos(t * 0.017) * 14, dw, dh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + 0.15 * Math.sin(t * 0.3) + boost * 0.3;
      const s2 = sc * 1.2;
      ctx.drawImage(this.n2, -(768 * s2 - w) / 2 - cx * 0.06 - Math.sin(t * 0.04) * 36, -(432 * s2 - h) / 2 - cy * 0.06 + Math.sin(t * 0.03) * 18, 768 * s2, 432 * s2);
      // galaxies
      const gs = Math.max(1, Math.min(w / 260, 2.4));
      [[this.g1, 0.78, 0.22, 1.0, 0.012], [this.g2, 0.17, 0.36, 0.7, -0.017]].forEach(function (q) {
        ctx.save(); ctx.translate(q[1] * w - cx * 0.02, q[2] * h - cy * 0.02); ctx.rotate(0.5 + t * q[4]); ctx.scale(1, 0.5);
        ctx.globalAlpha = 0.9; const s = 128 * gs * q[3]; ctx.drawImage(q[0], -s / 2, -s / 2, s, s); ctx.restore();
      });
      // étoiles : trois plans, parallaxe croissante
      const F = [0.02, 0.05, 0.1];
      for (let L = 0; L < 3; L++) {
        for (const s of this.stars[L]) {
          const x = mod(s.x * w - cx * F[L], w), y = mod(s.y * h - cy * F[L], h);
          ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)); ctx.fillStyle = s.col;
          ctx.fillRect(x | 0, y | 0, L === 2 ? 2 : 1, 1); if (L === 2) ctx.fillRect(x | 0, (y | 0) - 1, 1, 3);
        }
      }
      // étoile filante toutes les ~6 s
      const k = Math.floor(t / 6), ph = (t - k * 6) / 0.9;
      if (ph < 1) {
        const hx = I.rng.hash2(k, 1, 5), hy = I.rng.hash2(k, 2, 5), x = hx * w * 0.8 + ph * 70, y = hy * h * 0.4 + ph * 34;
        for (let i = 0; i < 14; i++) { ctx.globalAlpha = (1 - ph) * (1 - i / 14); ctx.fillStyle = '#ffffff'; ctx.fillRect((x - i * 2.2) | 0, (y - i * 1.1) | 0, 1, 1); }
      }
      // aurores boréales : trois rubans ondulants
      const sp = 1 + boost * 2.5;
      for (let b = 0; b < 3; b++) {
        const base = h * (0.16 + b * 0.1), img = this.bands[b];
        for (let x = 0; x < w; x += 2) {
          const wave = Math.sin(x * 0.018 + t * 0.35 * sp + b * 2) * 14 + Math.sin(x * 0.047 - t * 0.6 * sp + b) * 5 - cy * 0.02;
          const hh = 34 + 20 * Math.sin(x * 0.03 + t * 0.5 * sp + b * 1.7) + boost * 26;
          ctx.globalAlpha = Math.max(0, (0.22 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.04 + t * 0.9 * sp + b * 2.3))) * (1 + boost * 1.4));
          ctx.drawImage(img, 0, 0, 1, 64, x, base + wave - hh * 0.5, 2, hh);
        }
      }
      if (boost > 0 && rgb) { ctx.globalAlpha = 0.16 * boost; ctx.fillStyle = 'rgb(' + rgb.join(',') + ')'; ctx.fillRect(0, 0, w, h); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
  };
  I.Sky = Sky;
})((window.Iles = window.Iles || {}));
