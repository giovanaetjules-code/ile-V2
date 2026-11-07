/*
 * Effets de météo et d'ambiance DESSINÉS EN 2D (ils marchent même sans shader) : pluie, éclaboussures, éclairs, brume qui dérive,
 * ombres de nuages, feuilles, grains de lumière, braises. Purement visuel : rien n'est sauvegardé. La météo elle-même
 * (systems/weather.js) est un calcul de l'heure du jeu. Quand le shader est actif, il remplace brume et ombres de nuages
 * (versions plus riches) : `shader` = true les désactive ici.
 */
(function (I) {
  const mod = function (a, n) { return ((a % n) + n) % n; };
  const cvs = function (w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function blob(col, a) { // grosse tache douce (brume, ombre de nuage)
    const c = cvs(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(0.55, 'rgba(' + col + ',' + a * 0.45 + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
  }
  const LEAF = ['#7cc94f', '#5fae3a', '#d9a23a', '#e0703a', '#f0a0c0'];

  class WeatherFX {
    constructor() {
      this.rain = []; this.splash = []; this.leaves = []; this.motes = []; this.embers = [];
      this.flash = 0; this.nextFlash = 6; this.t = 0; this.shader = false; this.w = {};
      this.fog = blob('222,230,238', 0.9); this.shade = blob('18,26,48', 0.9);
      this.wind = 0;
    }

    /** wx : résultat de I.weather.at (ou null : pas de météo, lobby / dimensions). */
    update(dt, w, h, wx, hour, lit) {
      this.t += dt; this.w = wx || {};
      const rain = wx ? wx.rain : 0, storm = wx ? wx.storm : 0;
      this.wind = Math.sin(this.t * 0.13) * 0.5 + (storm ? 1.2 : rain ? 0.4 : 0.15);
      // pluie
      const want = Math.min(900, Math.round(rain * (w * h) / (storm ? 120 : 190)));
      while (this.rain.length < want) this.rain.push({ x: Math.random() * (w + 60), y: Math.random() * h, v: 0.8 + Math.random() * 0.5, l: 1 + Math.random() * 0.8 });
      if (this.rain.length > want) this.rain.length = want;
      const fall = (storm ? 330 : 250), sl = 0.18 + this.wind * 0.22;
      for (const d of this.rain) {
        d.y += fall * d.v * dt; d.x -= fall * d.v * dt * sl;
        if (d.y > h + 6) { d.y = -6 - Math.random() * 20; d.x = Math.random() * (w + 60); }
        if (d.x < -10) d.x += w + 60;
      }
      // éclaboussures au sol
      if (rain > 0.05) {
        const n = rain * (w * h) / 900 * dt; let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        while (k-- > 0 && this.splash.length < 260) this.splash.push({ x: Math.random() * w, y: 6 + Math.random() * (h - 6), t: 0 });
      }
      for (let i = this.splash.length - 1; i >= 0; i--) { const s = this.splash[i]; s.t += dt; if (s.t > 0.32) this.splash.splice(i, 1); }
      // éclairs (orage) : un ou deux flashs rapprochés
      this.flash = Math.max(0, this.flash - dt * 2.6);
      if (storm > 0.3) { this.nextFlash -= dt; if (this.nextFlash <= 0) { this.flash = 1; this.nextFlash = 5 + Math.random() * 9; if (Math.random() < 0.5) setTimeout(() => { this.flash = Math.max(this.flash, 0.75); }, 140); } }
      else this.nextFlash = Math.max(this.nextFlash, 4);
      // feuilles qui volent (de jour, sans pluie)
      const day = hour >= 7 && hour < 19, calm = wx && wx.rain < 0.05 && wx.fog < 0.6;
      const wl = day && calm ? 7 : 0;
      while (this.leaves.length < wl) this.leaves.push({ x: Math.random() * w, y: -4 - Math.random() * h, ph: Math.random() * 6, c: LEAF[(Math.random() * LEAF.length) | 0], v: 8 + Math.random() * 10 });
      for (const f of this.leaves) { f.y += f.v * dt; f.x += (10 + this.wind * 14 + Math.sin(this.t * 1.6 + f.ph) * 8) * dt; if (f.y > h + 4 || f.x > w + 6) { f.y = -4; f.x = Math.random() * w - 20; } }
      if (this.leaves.length > wl && wl === 0) { this.leaves.length = Math.max(0, this.leaves.length - 1); }
      // grains de lumière (poussière / pollen dans le soleil)
      const wm = day && wx && wx.cloud < 0.55 && wx.rain < 0.05 ? 16 : 0;
      while (this.motes.length < wm) this.motes.push({ x: Math.random() * w, y: Math.random() * h, ph: Math.random() * 6, s: 0.4 + Math.random() * 0.8 });
      if (this.motes.length > wm) this.motes.length = wm;
      for (const m of this.motes) { m.x += (3 + this.wind * 4) * m.s * dt; m.y += Math.sin(this.t * 0.7 + m.ph) * 3 * dt; if (m.x > w + 2) m.x = -2; }
      // braises : lit = positions écran des foyers allumés
      if (lit) for (const f of lit) if (Math.random() < 6 * dt && this.embers.length < 80) this.embers.push({ x: f.x + (Math.random() - 0.5) * 5, y: f.y, vx: (Math.random() - 0.5) * 6 + this.wind * 4, vy: -(10 + Math.random() * 14), life: 1 + Math.random() * 0.8, max: 1.8, wx: f.wx, wy: f.wy });
      for (let i = this.embers.length - 1; i >= 0; i--) { const e = this.embers[i]; e.life -= dt; if (e.life <= 0) { this.embers.splice(i, 1); continue; } e.vx += (Math.random() - 0.5) * 20 * dt; e.wx += e.vx * dt; e.wy += e.vy * dt; }
    }

    /** Pluie + éclaboussures + feuilles + grains de lumière + braises (avant l'ambiance : ils sont éclairés comme le reste). */
    drawLayer(ctx, w, h, camX, camY) {
      const wxr = this.w.rain || 0, storm = this.w.storm || 0;
      if (this.rain.length) {
        const len = storm ? 7 : 5, sl = 0.18 + this.wind * 0.22;
        ctx.globalAlpha = 0.55 * Math.min(1, wxr * 1.4); ctx.strokeStyle = '#b8d4f0'; ctx.lineWidth = 1; ctx.beginPath();
        for (const d of this.rain) { const x = Math.round(d.x), y = Math.round(d.y), l = len * d.l; ctx.moveTo(x, y); ctx.lineTo(Math.round(x - l * sl), Math.round(y + l)); }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (this.splash.length) {
        ctx.fillStyle = '#d8ecff';
        for (const s of this.splash) {
          const k = s.t / 0.32, r = 1 + k * 3, x = Math.round(s.x), y = Math.round(s.y); ctx.globalAlpha = (1 - k) * 0.7 * Math.min(1, wxr * 1.5);
          ctx.fillRect(x - r | 0, y, 1, 1); ctx.fillRect(x + r | 0, y, 1, 1); ctx.fillRect(x, y - (r * 0.5 | 0), 1, 1); ctx.fillRect(x, y + (r * 0.5 | 0), 1, 1);
          if (k < 0.3) ctx.fillRect(x, y - 2, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      for (const f of this.leaves) { ctx.fillStyle = f.c; const x = Math.round(f.x), y = Math.round(f.y); ctx.fillRect(x, y, 2, 1); ctx.fillRect(x + (Math.sin(this.t * 4 + f.ph) > 0 ? 1 : 0), y + 1, 1, 1); }
      if (this.motes.length) { ctx.fillStyle = '#fff6c8'; for (const m of this.motes) { ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(this.t * 1.3 + m.ph)); ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1); } ctx.globalAlpha = 1; }
      for (const e of this.embers) { const k = e.life / e.max; ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = k > 0.55 ? '#ffe08a' : k > 0.25 ? '#ff9a3a' : '#c8402a'; ctx.fillRect(Math.round(e.wx - camX), Math.round(e.wy - camY), 1, 1); }
      ctx.globalAlpha = 1;
    }

    /** Brume et ombres de nuages en 2D (seulement sans shader). Ancrés au monde : ils glissent avec le vent. */
    drawAtmos(ctx, w, h, camX, camY) {
      if (this.shader) return;
      const cl = this.w.cloud || 0, fog = this.w.fog || 0, t = this.t;
      if (cl > 0.25) { // ombres de nuages : grandes taches sombres qui passent
        ctx.globalAlpha = Math.min(0.5, (cl - 0.2) * 0.55);
        for (let i = 0; i < 6; i++) {
          const sz = 150 + (i * 53) % 110, x = mod(i * 197 + t * (5 + i) - camX, w + 400) - 200, y = mod(i * 131 + (i % 2 ? t * 1.5 : -t) - camY * 0.9, h + 300) - 150;
          ctx.drawImage(this.shade, Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz * 0.7);
        }
      }
      if (fog > 0.02) {
        ctx.globalAlpha = Math.min(0.55, fog * 0.5);
        for (let i = 0; i < 10; i++) {
          const sz = 170 + (i * 37) % 90, x = mod(i * 143 + t * (3 + i % 3) - camX * 0.8, w + 300) - 150, y = mod(i * 89 + Math.sin(t * 0.1 + i) * 20 - camY * 0.8, h + 200) - 100;
          ctx.drawImage(this.fog, Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz * 0.75);
        }
        ctx.globalAlpha = fog * 0.22; ctx.fillStyle = 'rgb(206,216,226)'; ctx.fillRect(0, 0, w, h);
      }
      ctx.globalAlpha = 1;
    }
  }
  I.WeatherFX = WeatherFX;
})((window.Iles = window.Iles || {}));
