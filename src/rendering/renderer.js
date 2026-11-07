/*
 * Rendu Canvas. Le canvas a la résolution « logique » du jeu (petite) et est agrandi par le navigateur
 * d'un facteur ENTIER avec image-rendering: pixelated : les pixels restent nets, jamais déformés.
 * Le renderer ne fait que LIRE l'état du jeu.
 */
(function (I) {
  const C = I.config, T = I.TILE, TS = C.TILE;
  const GRAY = 13, WHITE = [250, 250, 250]; // voisins ; GRAY = indice « Blanc » de la teinture : l'eau des dimensions est d'abord rendue en niveaux de gris
  const DIRV = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.S = I.buildSprites();
      this.scale = 3; this.w = 320; this.h = 180;
      this.t = 0;
      this.list = []; this.objs = []; this.floors = []; this.localId = null;
      this.wfx = new I.WeatherFX(); this.gl = null; this.fxMode = 'off'; this.fxErr = null; this.sd = 3;
      this.occCv = document.createElement('canvas'); this.occCtx = this.occCv.getContext('2d'); // carte de hauteurs des obstacles (ombres)
      this.matCv = document.createElement('canvas'); this.matCtx = this.matCv.getContext('2d'); // matériau de chaque tuile visible
      this.lights = new Float32Array(I.GLFX.MAXL * 4); this.lcols = new Float32Array(I.GLFX.MAXL * 4);
    }

    /** Shaders : 'off' | 'low' | 'high'. Retombe sur le rendu 2D si WebGL est indisponible. */
    setShader(mode) {
      this.fxMode = mode || 'off';
      if (this.fxMode !== 'off') {
        if (!this.gl) this.gl = new I.GLFX(this.canvas);
        if (!this.gl.ok) { this.fxErr = this.gl.err || 'WebGL indisponible'; this.fxMode = 'off'; }
      }
      if (this.gl && this.gl.ok) { this.gl.setMode(this.fxMode); this.gl.resize(this.w, this.h, this.sd, this.scale); }
    }

    /** Choisit le zoom entier et la taille logique selon la fenêtre. zoom = 0 : automatique. */
    layout(winW, winH, zoom, dpr) {
      // On raisonne en pixels PHYSIQUES : chaque pixel du jeu = un nombre entier de pixels d'écran.
      dpr = dpr || 1;
      let sd = zoom > 0 ? Math.round(zoom * dpr) : Math.min(Math.floor(winH * dpr / C.TARGET_VIEW_HEIGHT), Math.floor(winW * dpr / 320));
      sd = Math.max(1, sd);
      const s = sd / dpr; // taille d'un pixel du jeu en pixels CSS
      this.scale = s;
      this.w = Math.ceil(winW / s); this.h = Math.ceil(winH / s);
      this.canvas.width = this.w; this.canvas.height = this.h;
      this.canvas.style.width = this.w * s + 'px'; this.canvas.style.height = this.h * s + 'px';
      this.ctx.imageSmoothingEnabled = false;
      this.sd = sd;
      if (this.gl && this.gl.ok) this.gl.resize(this.w, this.h, sd, s);
    }

    /**
     * Couleurs de l'eau des dimensions : chaque zone a sa couleur, mais on ne veut pas de marches d'escalier entre deux zones. On prend la
     * couleur d'eau de CHAQUE case visible (même la terre : la zone a toujours une couleur d'eau), on floute ce petit tableau (3×3, deux fois)
     * puis on l'agrandit en lissant : le résultat `waterField` (en pixels écran) est multiplié sur l'eau, qui glisse d'une teinte à l'autre
     * sur ~4 cases. Le tableau est recalculé quand la fenêtre de cases visible change.
     */
    waterField(world, x0, y0, nx, ny) {
      const k = x0 + ',' + y0 + ',' + nx + ',' + ny + ',' + (world.bver || 0), M = 2; // marge : le flou a besoin des cases autour
      if (this.wfKey === k && this.wfWorld === world) return this.wfCv;
      this.wfKey = k; this.wfWorld = world;
      const W = nx + 2 * M, H = ny + 2 * M, n = W * H;
      let a = new Float32Array(n * 3), b = new Float32Array(n * 3);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const ci = world.colorOf(x0 - M + i, y0 - M + j, T.SHALLOW), c = I.COLORS[ci - 1] ? I.COLORS[ci - 1].rgb : WHITE, o = (j * W + i) * 3;
        a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2];
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          let r = 0, g = 0, bl = 0, c = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
            const o = (jj * W + ii) * 3; r += a[o]; g += a[o + 1]; bl += a[o + 2]; c++;
          }
          const o = (j * W + i) * 3; b[o] = r / c; b[o + 1] = g / c; b[o + 2] = bl / c;
        }
        const t = a; a = b; b = t;
      }
      const lo = this.wfLo || (this.wfLo = document.createElement('canvas')); lo.width = W; lo.height = H;
      const lg = lo.getContext('2d'), id = lg.createImageData(W, H);
      for (let i = 0; i < n; i++) { id.data[i * 4] = a[i * 3]; id.data[i * 4 + 1] = a[i * 3 + 1]; id.data[i * 4 + 2] = a[i * 3 + 2]; id.data[i * 4 + 3] = 255; }
      lg.putImageData(id, 0, 0);
      const cv = this.wfCv || (this.wfCv = document.createElement('canvas')); cv.width = nx * TS; cv.height = ny * TS;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(lo, M - 0.5, M - 0.5, nx + 1, ny + 1, -TS / 2, -TS / 2, (nx + 1) * TS, (ny + 1) * TS); // le centre de chaque pixel = le centre de sa case
      return cv;
    }

    // ---------- tuiles ----------
    drawTiles(world, camX, camY) {
      const ctx = this.ctx, S = this.S, w = this.w, h = this.h, W = world.W, H = world.H;
      const x0 = Math.max(0, Math.floor(camX / TS)), x1 = Math.min(W - 1, Math.floor((camX + w - 1) / TS));
      const y0 = Math.max(0, Math.floor(camY / TS)), y1 = Math.min(H - 1, Math.floor((camY + h - 1) / TS));
      const wf = Math.floor(this.t * 2) % 4, ff = Math.floor(this.t * 1.5) % 4, lobby = world.lobby, chunked = !!world.chunked;
      const hash2 = I.rng.hash2, wl = this.wlist || (this.wlist = []); wl.length = 0;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = world.tileAt(tx, ty);
          const sx = tx * TS - camX, sy = ty * TS - camY;
          if (lobby && t === 0) { // le vide : on voit le ciel ; sous le bord de la plateforme, sa face de quartz
            if (ty > 0 && world.tileAt(tx, ty - 1) !== 0) ctx.drawImage(S.cliff[(hash2(tx, ty, 4) * 3) | 0], sx, sy);
            continue;
          }
          let img;
          if (t <= T.SHALLOW) img = S.water[t][(hash2(tx, ty, 9) * 3) | 0][wf];
          else if (t === T.WALL && world.tileAt(tx, ty + 1) !== T.WALL) img = S.wallFace[(hash2(tx, ty, 3) * 4) | 0]; // face d'une falaise
          else { const v = S.tiles[t]; img = v[(hash2(tx, ty, 3) * v.length) | 0]; }
          const ci = chunked ? world.colorOf(tx, ty, t) : 0; // dimensions : la couleur de la zone teinte le sol et l'eau
          if (ci && t <= T.SHALLOW) { ctx.drawImage(I.tint.canvas(img, GRAY), sx, sy); wl.push(tx, ty); } // l'eau est colorée à part (dégradé)
          else ctx.drawImage(ci ? I.tint.canvas(img, ci) : img, sx, sy);
        }
      }
      if (wl.length) { // eau des dimensions : teinte lissée entre les zones (voir waterField), multipliée sur l'eau grise
        const F = this.waterField(world, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
        ctx.globalCompositeOperation = 'multiply';
        for (let i = 0; i < wl.length; i += 2) { const fx = (wl[i] - x0) * TS, fy = (wl[i + 1] - y0) * TS; ctx.drawImage(F, fx, fy, TS, TS, wl[i] * TS - camX, wl[i + 1] * TS - camY, TS, TS); }
        ctx.globalCompositeOperation = 'source-over';
      }
      for (let ty = y0; ty <= y1; ty++) { // bords : franges de rivage et écume, par-dessus
        for (let tx = x0; tx <= x1; tx++) {
          const e = world.edgeAt(tx, ty);
          if (!e) continue;
          const t = world.tileAt(tx, ty);
          if (lobby && t === 0) continue;
          const sx = tx * TS - camX, sy = ty * TS - camY, ci = chunked ? world.colorOf(tx, ty, t) : 0;
          {
            const fr = e & 15, foam = e >> 4;
            if (fr && S.fringe[t]) { const f = S.fringe[t][(hash2(tx, ty, 5) * 2) | 0][fr]; ctx.drawImage(ci ? I.tint.canvas(f, ci) : f, sx, sy); }
            if (foam) ctx.drawImage(S.foam[(ff + ((tx + ty) & 1) * 2) % 4][foam], sx, sy);
          }
        }
      }
    }

    // ---------- scène ----------
    draw(state, cam, fx, dt) {
      this.t += dt; this.state_players = state.players; this.now = state.time.minutes;
      const ctx = this.ctx, S = this.S, world = state.world, w = this.w, h = this.h;
      const camX = cam.rx + (fx.shakeX || 0), camY = cam.ry + (fx.shakeY || 0); // tremblement de l'écran (combat)
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const lobby = world.lobby, act = state.act;
      const boost = act ? Math.min(1, act.t / (act.dur * 0.85)) : 0, actRgb = act && I.COLORS[act.tint - 1] ? I.COLORS[act.tint - 1].rgb : null;
      if (lobby) I.Sky.draw(ctx, w, h, this.t, camX, camY, boost, actRgb);
      else { ctx.fillStyle = '#2f86c4'; ctx.fillRect(0, 0, w, h); }
      this.drawTiles(world, camX, camY);

      const list = this.list; list.length = 0;
      const objs = this.objs; objs.length = 0;
      world.objectsIn(camX - 48, camY - 8, camX + w + 48, camY + h + 80, objs);
      const floors = this.floors; floors.length = 0;
      const roofs = this.roofs || (this.roofs = []); roofs.length = 0;
      const me = state.players[this.localId], hv = me && !me.away && !lobby ? I.house.view(world, me) : null; // pièce fermée où je me trouve : murs de devant et toit deviennent transparents
      this.hv = hv; this.dt = dt;
      for (const o of objs) {
        if (o.def.layer === 'roof') { roofs.push(o); continue; }
        if (o.type === 'red_button') o.variant = act ? 1 : 0; // bouton enfoncé pendant l'éveil du portail
        if (o.def.layer === 'floor') { floors.push(o); if (o.type === 'plot' && o.data && o.data.crop) list.push({ y: o.y - 4, k: 0, o: o }); continue; }
        if (world.isDepleted(o) && !o.def.spriteCut) continue;
        list.push({ y: o.y, k: 0, o: o });
      }
      for (const o of floors) { const e = I.tint.entry(S.obj[o.def.sprite][0], o.c); ctx.drawImage(e.c, Math.round(o.x - e.ax - camX), Math.round(o.y - e.ay - camY)); }
      for (const d of world.drops) {
        if (d.x > camX - 16 && d.x < camX + w + 16 && d.y > camY - 16 && d.y < camY + h + 24) list.push({ y: d.y, k: 1, d: d });
      }
      if (world.chunked && world.creatures) for (const cr of world.creatures) if (cr.x > camX - 40 && cr.x < camX + w + 40 && cr.y > camY - 10 && cr.y < camY + h + 60) list.push({ y: cr.y, k: 3, cr: cr });
      if (world.chunked && world.mobs) for (const m of world.mobs) if (m.x > camX - 70 && m.x < camX + w + 70 && m.y > camY - 10 && m.y < camY + h + 140) list.push({ y: m.y, k: 4, cr: m });
      for (const id in state.players) if (!state.players[id].away) list.push({ y: state.players[id].y, k: 2, p: state.players[id] });
      list.sort(function (a, b) { return a.y - b.y; });

      // ombres
      for (const it of list) {
        if (it.k === 0) {
          const o = it.o, name = world.isDepleted(o) ? 'small' : o.def.shadow;
          if (name) { const im = S.shadow[name]; ctx.drawImage(im, Math.round(o.x - im.width / 2 - camX), Math.round(o.y - im.height / 2 - camY - (name === 'tree' ? 2 : 0))); }
        } else if (it.k === 3) {
          const im = S.shadow[['drop', 'player', 'small', 'rock'][I.creatureGen.species(world.D, it.cr.sp).size]]; ctx.drawImage(im, Math.round(it.cr.x - im.width / 2 - camX), Math.round(it.cr.y - im.height / 2 - 1 - camY));
        } else if (it.k === 4) {
          this.drawMobGround(it.cr, world, camX, camY);
        } else if (it.k === 1) {
          const im = S.shadow.drop; ctx.drawImage(im, Math.round(it.d.x - 4 - camX), Math.round(it.d.y - 1 - camY));
        } else {
          if (!(it.p.sw > 0.4)) { const im = S.shadow.player; ctx.drawImage(im, Math.round(it.p.x - 5 - camX), Math.round(it.p.y - 3 - camY)); }
        }
      }
      // sprites triés par profondeur
      for (const it of list) {
        if (it.k === 0) this.drawObject(it.o, world, fx, camX, camY);
        else if (it.k === 1) this.drawDrop(it.d, camX, camY);
        else if (it.k === 3) this.drawCreature(it.cr, world, camX, camY, fx);
        else if (it.k === 4) this.drawMob(it.cr, world, camX, camY, fx);
        else this.drawPlayer(it.p, camX, camY);
      }
      if (world.chunked && world.mproj && world.mproj.length) this.drawMobProj(world, camX, camY);
      this.drawRoofs(roofs, world, hv, camX, camY);
      this.drawGhost(state, camX, camY);
      this.drawFlies(fx, camX, camY);
      this.drawParticles(fx, camX, camY);
      this.drawCombatFx(fx, camX, camY);
      this.drawHpBars(objs, world, fx, camX, camY);
      // météo et ambiance
      const hour = I.timeutil.hour(state.time.minutes), night = lobby ? 0 : I.timeutil.night(hour);
      const wx = !lobby && !world.chunked ? I.weather.at(state.time.minutes) : null;
      const useGL = !lobby && !!this.gl && this.gl.active;
      if (this.gl && this.gl.ok) this.gl.canvas.style.visibility = useGL ? 'visible' : 'hidden';
      this.wfx.shader = useGL; this.wx = wx;
      const hot = []; if (!lobby) for (const o of objs) if (o.def.glowLit && o.data && o.data.lit) hot.push({ x: o.x - camX, y: o.y - 8 - camY, wx: o.x, wy: o.y - 8 });
      this.wfx.update(dt, w, h, wx, hour, hot);
      if (!lobby && !world.chunked && !useGL) this.drawClouds(camX, camY, world);
      if (!lobby) this.wfx.drawLayer(ctx, w, h, camX, camY);
      if (!lobby) this.wfx.drawAtmos(ctx, w, h, camX, camY);
      const tint0 = I.timeutil.tint(hour);
      if (useGL) { this.shaderFrame(state, world, objs, roofs, list, camX, camY, hour, night, tint0, wx, fx); ctx.globalAlpha = 1; return; }

      // ambiance 2D : teinte selon l'heure (multiplication), puis lueurs additives (le lobby est hors du temps : pas de nuit)
      let tint = tint0;
      if (wx) { // ciel couvert, pluie : plus sombre et plus gris
        const k = wx.cloud * 0.3 + wx.rain * 0.1, dark = 1 - wx.cloud * 0.18 - wx.rain * 0.12, gray = tint[0] * 0.3 + tint[1] * 0.59 + tint[2] * 0.11;
        tint = tint.map(function (c) { return Math.round((c + (gray - c) * k) * dark); });
      }
      if (!lobby) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgb(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ')';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlows(objs, world, fx, camX, camY, night, state);
      if (lobby) this.drawLobbyFx(objs, world, camX, camY, boost, actRgb);
      if (this.wfx.flash > 0.02) { ctx.globalAlpha = this.wfx.flash * 0.45; ctx.fillStyle = '#c8d4ff'; ctx.fillRect(0, 0, w, h); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // ---------- shaders : préparation de la trame ----------
    /** Lumières ponctuelles visibles (coordonnées logiques de l'écran), triées : les plus importantes d'abord (elles font des ombres). */
    /** Lueur d'une table d'enchantement : violette au repos, puis de la couleur des pierres utilisées (s'éteint en ~20 s). k : intensité de l'effet (0 à 1). */
    tableGlow(o) {
      const g = I.tableGlow && I.tableGlow[o.id], now = performance.now() / 1000;
      if (!g || now > g.t0 + g.dur) return { rgb: [170, 130, 255], css: '#b79cff', k: 0 };
      const age = now - g.t0, k = Math.max(0, 1 - age / g.dur), cols = g.cols, f = cols.length > 1 ? 0.5 + 0.5 * Math.sin(now * 2.2) : 0;
      const a = cols[0], b = cols[cols.length - 1], base = [170, 130, 255];
      const rgb = a.map(function (v, i) { const m = v + (b[i] - v) * f; return Math.round(base[i] + (m - base[i]) * Math.min(1, k * 1.6)); });
      return { rgb: rgb, css: 'rgb(' + rgb.join(',') + ')', k: k };
    }
    collectLights(objs, world, fx, state, camX, camY, night) {
      const t = this.t, out = [], w = this.w, h = this.h;
      const add = function (x, y, r, hh, c, i) { x -= camX; y -= camY; if (x < -r || y < -r || x > w + r || y > h + r || i < 0.02) return; out.push({ x: x, y: y, r: r, h: hh, c: c, i: i, pri: i * r }); };
      const WARM = [1, 0.72, 0.38], CYAN = [0.45, 0.9, 1], VIO = [0.7, 0.5, 1], WHITE = [0.9, 0.95, 1], SOFT = { cyan: CYAN, white: WHITE, violet: VIO, warm: WARM, small: [1, 0.95, 0.5] };
      for (const o of objs) {
        if (o.type === 'portal') add(o.x, o.y - 24, 80, 20, VIO, 1.4 + 0.3 * Math.sin(t * 2));
        else if (o.type === 'crystal' && !world.isDepleted(o)) add(o.x, o.y - 8, 54, 10, CYAN, 0.85 + 0.25 * Math.sin(t * 2.5 + o.x));
        else if (o.def.glowTable) { const tg = this.tableGlow(o), c = tg.rgb; add(o.x, o.y - 8, 46 + tg.k * 14, 10, [c[0] / 255, c[1] / 255, c[2] / 255], (0.75 + 0.2 * Math.sin(t * 2 + o.x)) * (1 + tg.k * 1.2)); }
        else if (o.def.glowSoft && !world.isDepleted(o)) add(o.x, o.y - 4, 42, 8, SOFT[o.def.glowSoft] || WARM, 0.75 + 0.2 * Math.sin(t * 2 + o.x));
        else if (o.def.glowLamp && night > 0.05) add(o.x, o.y - 19, 92, 18, WARM, night * 1.7);
        else if (o.def.glowLit && o.data && o.data.lit) add(o.x, o.y - 8, 66, 12, WARM, 1.5 * (0.88 + 0.12 * Math.sin(t * 9 + o.x)));
        else if (o.type === 'house' && night > 0.1) { add(o.x - 17, o.y - 17, 48, 16, WARM, night * 1.1); add(o.x + 17, o.y - 17, 48, 16, WARM, night * 1.1); }
      }
      for (const id in state.players) {
        const p = state.players[id], it = p.inv.slots[p.sel];
        if (p.away || !it || !I.ITEMS[it.id].light) continue;
        add(p.x + (p.dir === 'left' ? -8 : p.dir === 'right' ? 8 : 0), p.y - 14, 96, 14, WARM, (0.5 + night * 0.9) * (0.88 + 0.12 * Math.sin(t * 11)));
      }
      if (world.chunked && world.mobs) { let n = 0; for (const m of world.mobs) { if (n > 10) break; const S = I.mobGen.species(world.D, m.sp), g = S.col.glow; n++; add(m.x, m.y - 9 - (S.flies ? 5 : 0), m.elite ? 58 : 36, 8, [g[0] / 255, g[1] / 255, g[2] / 255], (m.elite ? 0.8 : 0.5) * (m.st === 'wind' ? 1.6 : 1)); } }
      if (world.chunked && world.mproj) for (const q of world.mproj) { if (!q.l) { const mm = /(\d+),(\d+),(\d+)/.exec(q.c); q.l = mm ? [mm[1] / 255, mm[2] / 255, mm[3] / 255] : [1, 0.3, 0.4]; } add(q.x, q.y, 34, 8, q.l, 0.9); }
      for (const f of fx.flies) if (f.kind === 'f' && out.length < 40) add(f.x, f.y + Math.sin(f.ph) * 3, 24, 6, [1, 0.95, 0.5], 0.5 * (0.5 + 0.5 * Math.sin(f.ph * 2)) + 0.1);
      out.sort(function (a, b) { return b.pri - a.pri; });
      return out.slice(0, I.GLFX.MAXL);
    }

    /** Carte des obstacles (niveau de gris = hauteur, 1 ≈ 26 px) pour les ombres portées. */
    drawOccluders(objs, roofs, list, world, camX, camY) {
      const c = this.occCtx, w = this.w, h = this.h;
      if (this.occCv.width !== w || this.occCv.height !== h) { this.occCv.width = w; this.occCv.height = h; }
      c.globalCompositeOperation = 'source-over'; c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighten';
      const R = function (x, y, ww, hh, g) { const v = Math.round(Math.max(0, Math.min(1, g)) * 255); c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; c.fillRect(Math.round(x - camX), Math.round(y - camY), ww, hh); };
      for (const o of objs) {
        const d = o.def;
        if (d.layer === 'floor' || d.layer === 'roof' || world.isDepleted(o)) continue;
        if (d.wall) { R(o.tx * TS, o.ty * TS, TS, TS, d.wall === 'door' ? 0.4 : 1); continue; }
        if (!d.connect && (d.shadow === 'tree' || d.shadow === 'rock' || d.shadow === 'small') && this.S.obj[d.sprite]) { // l'objet lui-même ne reçoit pas d'ombre portée (voir silhouette)
          const arr = this.S.obj[d.sprite], e = arr[o.variant % arr.length];
          if (e && e.c) c.drawImage(this.silhouette(e.c), Math.round(o.x - e.ax - camX), Math.round(o.y - e.ay - camY));
        }
        if (d.shadow === 'tree') R(o.x - 6, o.y - 7, 12, 7, 1);
        else if (d.shadow === 'rock') R(o.x - 5, o.y - 5, 10, 5, 0.32);
        else if (d.shadow === 'small' && !d.collider) R(o.x - 3, o.y - 3, 6, 3, 0.22);
        else if (o.rect) R(o.rect.x, o.rect.y, o.rect.w, o.rect.h, d.shadow === 'small' ? 0.25 : 0.5);
      }
      for (const o of roofs) if (o.fa === undefined || o.fa > 0.3) R(o.tx * TS, o.ty * TS - 8, TS, TS, 1);
      for (const it of list) { if (it.k === 2) R(it.p.x - 2, it.p.y - 3, 4, 3, 0.55); else if (it.k === 3) R(it.cr.x - 2, it.cr.y - 3, 4, 3, 0.4); }
      c.fillStyle = 'rgb(0,255,0)'; // canal vert : le corps du joueur / de la créature ne reçoit pas l'ombre de ses propres pieds
      for (const it of list) { if (it.k === 2) c.fillRect(Math.round(it.p.x - camX) - 5, Math.round(it.p.y - camY) - 20, 10, 18); else if (it.k === 3) c.fillRect(Math.round(it.cr.x - camX) - 5, Math.round(it.cr.y - camY) - 12, 10, 10); }
    }

    /**
     * Silhouette verte d'un sprite (mise en cache). Dans la carte des obstacles, le canal VERT marque les pixels qui appartiennent à un objet
     * haut : le shader n'y applique ni ombre du soleil ni ombre des lampes. Sans cela, l'ombre du tronc d'un arbre voisin (calculée à hauteur
     * du sol) se peignait en travers de la couronne des arbres situés derrière : des losanges sombres sur les feuillages.
     */
    silhouette(cv) {
      const m = this.silMap || (this.silMap = new WeakMap());
      let s = m.get(cv);
      if (!s) {
        s = document.createElement('canvas'); s.width = cv.width; s.height = cv.height;
        const g = s.getContext('2d'); g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(0,255,0)'; g.fillRect(0, 0, s.width, s.height);
        m.set(cv, s);
      }
      return s;
    }

    /** Matériau de chaque tuile visible : R = eau, G = pierre, B = sol brillant (quartz du lobby…). */
    drawMaterials(world, camX, camY) {
      const x0 = Math.floor(camX / TS), y0 = Math.floor(camY / TS), nx = Math.ceil(this.w / TS) + 2, ny = Math.ceil(this.h / TS) + 2;
      if (this.matCv.width !== nx || this.matCv.height !== ny) { this.matCv.width = nx; this.matCv.height = ny; this.matImg = this.matCtx.createImageData(nx, ny); }
      const d = this.matImg.data;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const t = world.tileAt(x0 + i, y0 + j), k = (j * nx + i) * 4;
        d[k] = t === T.DEEP ? 255 : t === T.SHALLOW ? 170 : 0;
        d[k + 1] = t === T.WALL || t === T.STONE ? 200 : 0;
        d[k + 2] = t === T.QUARTZ || t === T.INLAY || t === T.DAIS || t === T.GLOW ? 200 : 0;
        d[k + 3] = 255;
      }
      this.matCtx.putImageData(this.matImg, 0, 0);
      return [nx, ny, x0, y0];
    }

    shaderFrame(state, world, objs, roofs, list, camX, camY, hour, night, tint, wx, fx) {
      const W = wx || { cloud: 0, rain: 0, fog: 0, wet: 0, storm: 0 }, day = 1 - night;
      this.drawOccluders(objs, roofs, list, world, camX, camY);
      const m = this.drawMaterials(world, camX, camY);
      const L = this.collectLights(objs, world, fx, state, camX, camY, night);
      this.lights.fill(0); this.lcols.fill(0);
      L.forEach((l, i) => { this.lights.set([l.x, l.y, l.r, l.h], i * 4); this.lcols.set([l.c[0] * l.i, l.c[1] * l.i, l.c[2] * l.i, 0], i * 4); });
      const tn = [tint[0] / 255, tint[1] / 255, tint[2] / 255], ambK = (0.46 + 0.46 * night) * (1 - 0.18 * W.cloud - 0.1 * W.rain);
      const mx = Math.max(tn[0], tn[1], tn[2]), sunK = day * 0.8;
      const u = Math.max(0, Math.min(1, (hour - 6) / 13.5)), phi = 0.36 + 0.5 * Math.sin(Math.PI * u), sx = Math.cos(Math.PI * u), sy = -0.45, sl = Math.hypot(sx, sy);
      const sky = [0.2 + 0.4 * day + 0.2 * W.cloud, 0.28 + 0.5 * day, 0.5 + 0.45 * day - 0.1 * W.cloud].map(function (c) { return Math.min(1, c); });
      const fogBase = [0.16 + 0.55 * day, 0.2 + 0.57 * day, 0.34 + 0.48 * day];
      const f = {
        scene: this.canvas, occ: this.occCv, mat: this.matCv, matSize: [m[0], m[1]],
        u: {
          uCam: [camX, camY], uTime: this.t, uCloud: W.cloud, uRain: W.rain, uWet: W.wet, uFog: W.fog, uNight: night, uFlash: this.wfx.flash,
          uAmb: tn.map(function (c) { return c * ambK; }),
          uSunCol: [tn[0] / mx * sunK * (1 - 0.15 * W.rain), tn[1] / mx * sunK * (1 - 0.15 * W.rain), tn[2] / mx * sunK * (1 - 0.15 * W.rain)],
          uMoonCol: [0.1 * night, 0.14 * night, 0.26 * night],
          uSunDir: [sx / sl * Math.cos(phi), sy / sl * Math.cos(phi), Math.sin(phi)],
          uSky: sky, uFogCol: [fogBase[0] * (0.6 + 0.4 * tn[0]), fogBase[1] * (0.6 + 0.4 * tn[1]), fogBase[2] * (0.6 + 0.4 * tn[2])],
          uL: this.lights, uLC: this.lcols, uNL: L.length, uNS: Math.min(4, L.length),
        },
      };
      this.gl.render(f);
    }

    drawObject(o, world, fx, camX, camY) {
      if (o.type === 'plot') { // culture sur une parcelle (la terre est dans la couche du sol)
        const ce = this.S.cropSprite(o.data.crop, I.farming.stage(o.data, this.now));
        this.ctx.drawImage(ce.c, Math.round(o.x - ce.ax - camX), Math.round(o.y - 2 - ce.ay - camY)); return;
      }
      const def = o.def, key = world.isDepleted(o) ? def.spriteCut : (def.spriteLit && o.data && o.data.lit ? def.spriteLit : def.sprite);
      const arr = this.S.obj[key];
      let e;
      if (def.wall) { // mur / fenêtre / porte : se raccorde aux voisins, la porte s'ouvre au passage, les murs de devant s'effacent quand on est dedans
        const nb = function (dx, dy) { return world.structureAt(o.tx + dx, o.ty + dy); };
        const mask = (I.house.wallAt(world, o.tx, o.ty - 1) ? 1 : 0) | (I.house.wallAt(world, o.tx + 1, o.ty) ? 2 : 0) | (I.house.wallAt(world, o.tx, o.ty + 1) ? 4 : 0) | (I.house.wallAt(world, o.tx - 1, o.ty) ? 8 : 0);
        let open = false;
        if (def.wall === 'door') {
          const players = this.state_players;
          for (const id in players) { const q = players[id]; if (!q.away && Math.abs(q.x - o.x) < 20 && Math.abs((q.y - 6) - (o.y - 8)) < 20) { open = true; break; } }
        }
        e = this.S.wallSprite(def, mask, open);
        if (o.c) e = I.tint.entry(e, o.c);
        const key = o.ty * world.W + o.tx, target = this.hv && this.hv.walls.has(key) ? 0.22 : 1;
        o.fa = o.fa === undefined ? target : o.fa + (target - o.fa) * Math.min(1, this.dt * 9);
        if (Math.abs(target - o.fa) < 0.02) o.fa = target;
        const ctx = this.ctx;
        if (o.fa < 1) ctx.globalAlpha = o.fa;
        ctx.drawImage(e.c, Math.round(o.x - e.ax - camX), Math.round(o.y - e.ay - camY));
        ctx.globalAlpha = 1;
        return;
      }
      if (def.connect) { // clôture : se raccorde aux voisines de même type
        const L = world.structureAt(o.tx - 1, o.ty), Rr = world.structureAt(o.tx + 1, o.ty);
        e = arr[(L && L.type === o.type ? 1 : 0) | (Rr && Rr.type === o.type ? 2 : 0)];
      } else e = arr[o.variant % arr.length];
      if (o.c) e = I.tint.entry(e, o.c); // couleur de l'objet (teinture / monde spécial)
      let ox = 0;
      const sh = fx.shake[o.id];
      if (sh > 0) ox = Math.round(Math.sin(sh * 70) * 1.5);
      this.ctx.drawImage(e.c, Math.round(o.x - e.ax - camX + ox), Math.round(o.y - e.ay - camY));
    }

    /** Toits : une tuile par case, posée 8 px plus haut ; transparents quand on est dans la pièce. */
    drawRoofs(roofs, world, hv, camX, camY) {
      const ctx = this.ctx;
      for (const o of roofs) {
        const key = o.ty * world.W + o.tx, target = hv && hv.roofs.has(key) ? 0 : 1;
        o.fa = o.fa === undefined ? target : o.fa + (target - o.fa) * Math.min(1, this.dt * 7);
        if (Math.abs(target - o.fa) < 0.02) o.fa = target;
        if (o.fa <= 0.02) continue;
        const R = function (dx, dy) { return world.roofAt(o.tx + dx, o.ty + dy) ? 1 : 0; };
        let e = this.S.roofSprite(R(0, -1) | (R(1, 0) << 1) | (R(0, 1) << 2) | (R(-1, 0) << 3));
        if (o.c) e = I.tint.entry(e, o.c);
        ctx.globalAlpha = o.fa;
        ctx.drawImage(e.c, Math.round(o.tx * TS - camX), Math.round(o.ty * TS - 8 - camY));
      }
      ctx.globalAlpha = 1;
    }

    /** Progression de la préparation d'une attaque (0..1) : mesurée chez l'hôte, reçue chez l'invité. */
    mobProg(m) { return m.st !== 'wind' ? 0 : m.tp !== undefined ? m.tp : 1 - Math.max(0, m.t) / (m.wt || 1); }

    /** Au sol, sous les sprites : ombre et zones de danger (ligne de charge, cercle de frappe, rayon d'explosion). */
    drawMobGround(m, world, camX, camY) {
      const ctx = this.ctx, S = I.mobGen.species(world.D, m.sp), im = this.S.shadow[['drop', 'player', 'small', 'rock'][Math.min(3, S.size + (m.elite ? 1 : 0))]], x = Math.round(m.x - camX), y = Math.round(m.y - camY);
      ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height / 2 - 1));
      if (m.elite) { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 4); ctx.fillStyle = 'rgb(' + S.col.glow.map(Math.round).join(',') + ')'; ctx.beginPath(); ctx.ellipse(x, y, 11 + S.size * 2, 4 + S.size, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
      if (m.st !== 'wind') return;
      const p = this.mobProg(m), A = S.arch, ang = m.ang || 0;
      if (A === 'charger') {
        ctx.save(); ctx.translate(x, y - 2); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,60,60,' + (0.1 + 0.3 * p) + ')'; ctx.fillRect(0, -6, S.dash * 0.5, 12);
        ctx.fillStyle = 'rgba(255,90,70,' + (0.25 + 0.5 * p) + ')'; ctx.fillRect(0, -6, S.dash * 0.5 * p, 12);
        ctx.restore();
      } else if (A === 'brute') {
        const cx = x + Math.cos(ang) * 16, cy = y + Math.sin(ang) * 10 - 2;
        ctx.fillStyle = 'rgba(255,60,60,' + (0.08 + 0.2 * p) + ')'; ctx.beginPath(); ctx.ellipse(cx, cy, S.blast, S.blast * 0.75, 0, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = 'rgba(255,120,90,' + (0.4 + 0.5 * p) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, S.blast * p, S.blast * 0.75 * p, 0, 0, 6.2832); ctx.stroke();
      } else if (A === 'bomber') {
        ctx.strokeStyle = 'rgba(255,90,60,' + (0.3 + 0.5 * p) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y - 2, S.blast, S.blast * 0.75, 0, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgba(255,60,40,' + (0.06 + 0.22 * p) + ')'; ctx.fill();
      } else if (A === 'spitter') {
        ctx.save(); ctx.translate(x, y - 8); ctx.rotate(ang); ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + 0.3 * p) + ')'; for (let d = 12; d < 90; d += 6) ctx.fillRect(d, 0, 2, 1); ctx.restore();
      }
    }

    drawMob(m, world, camX, camY, fx) {
      const ctx = this.ctx, S = I.mobGen.species(world.D, m.sp), e = I.mobArt.sprite(world.D, m.sp, m.v, m.frame, m.left), p = this.mobProg(m), t = this.t;
      const hover = S.flies ? 5 + Math.round(Math.sin(t * 3 + (m.ph || m.x)) * 2) : 0, hop = m.moving && !S.flies ? Math.round(Math.abs(Math.sin(t * 12 + m.x)) * 1) : 0;
      let jx = 0, jy = 0; const A = S.arch;
      if (m.st === 'wind') { if (A === 'bomber' || A === 'brute' || A === 'charger') { jx = Math.round((Math.random() - 0.5) * 2 * (1 + p * 2)); jy = Math.random() < 0.5 ? -1 : 0; } else jy = -Math.round(p * 2); }
      if (m.st === 'act') jx = Math.round(Math.cos(m.ang || 0) * 2);
      const x = Math.round(m.x - e.ax - camX) + jx, y = Math.round(m.y - e.ay - camY - hover - hop) + jy;
      ctx.drawImage(e.c, x, y);
      const flashing = fx && fx.cflash[m.id] > 0, fuse = A === 'bomber' && m.st === 'wind' && Math.sin(t * (10 + p * 30)) > 0;
      if (flashing || fuse) {
        const key = flashing ? 'w' : 'wr';
        if (!e[key]) { const c = document.createElement('canvas'); c.width = e.c.width; c.height = e.c.height; const g = c.getContext('2d'); g.drawImage(e.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = flashing ? '#fff' : '#ff5a3a'; g.fillRect(0, 0, c.width, c.height); e[key] = c; }
        ctx.globalAlpha = flashing ? 0.85 : 0.7; ctx.drawImage(e[key], x, y); ctx.globalAlpha = 1;
      }
      if (m.st === 'wind') { // « ! » au-dessus de la tête : une attaque arrive
        const ex = Math.round(m.x - camX), ey = y - 7; ctx.fillStyle = p > 0.6 ? '#ff4a3a' : '#ffd04a'; ctx.fillRect(ex - 1, ey - 5, 2, 4); ctx.fillRect(ex - 1, ey, 2, 2);
        if (A === 'spitter') { const g = S.col.glow, r = 1 + p * 3; ctx.fillStyle = 'rgb(' + g.map(Math.round).join(',') + ')'; ctx.globalAlpha = 0.5 + 0.5 * p; ctx.beginPath(); ctx.arc(Math.round(m.x - camX + Math.cos(m.ang || 0) * 7), Math.round(m.y - camY - 8 - hover + Math.sin(m.ang || 0) * 3), r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
      }
      if (m.stun > 0) { ctx.fillStyle = '#ffe24a'; for (let k = 0; k < 3; k++) { const a = t * 6 + k * 2.1; ctx.fillRect(Math.round(m.x - camX + Math.cos(a) * 6), Math.round(y - 2 + Math.sin(a) * 2), 2, 2); } }
      if (m.hpp < 100 || m.elite) { // barre de vie (dorée pour les élites)
        const bw = Math.max(12, (e.c.width * 0.6) | 0), bx = Math.round(m.x - bw / 2 - camX), by = y - 5, f = Math.max(0, m.hpp) / 100;
        ctx.fillStyle = m.elite ? '#e8c04a' : '#2c2a3a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = '#2c2a3a'; ctx.fillRect(bx, by, bw, 2);
        ctx.fillStyle = f > 0.5 ? '#e8703f' : f > 0.25 ? '#e8483f' : '#c02a3a'; ctx.fillRect(bx, by, Math.max(1, Math.round(bw * f)), 2);
        if (m.elite) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(bx + (bw >> 1) - 2, by - 4, 1, 2); ctx.fillRect(bx + (bw >> 1), by - 5, 1, 3); ctx.fillRect(bx + (bw >> 1) + 2, by - 4, 1, 2); ctx.fillRect(bx + (bw >> 1) - 2, by - 2, 5, 1); } // couronne
      }
    }

    /** Projectiles des monstres : boule lumineuse avec traînée. */
    drawMobProj(world, camX, camY) {
      const ctx = this.ctx;
      for (const q of world.mproj) {
        const x = Math.round(q.x - camX), y = Math.round(q.y - camY), l = Math.hypot(q.vx, q.vy) || 1;
        for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.5 / k; ctx.fillStyle = q.c; ctx.fillRect(Math.round(x - q.vx / l * k * 3) - 1, Math.round(y - q.vy / l * k * 3) - 1, 3, 3); }
        ctx.globalAlpha = 1; ctx.fillStyle = q.c; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    drawCreature(cr, world, camX, camY, fx) {
      const ctx = this.ctx, e = I.creatureArt.sprite(world.D, cr.sp, cr.v, cr.frame, cr.left), hop = cr.moving && I.creatureGen.species(world.D, cr.sp).hop ? Math.round(Math.abs(Math.sin(this.t * 10 + cr.x)) * 3) : 0;
      const x = Math.round(cr.x - e.ax - camX), y = Math.round(cr.y - e.ay - camY - hop);
      ctx.drawImage(e.c, x, y);
      if (fx && fx.cflash[cr.id] > 0) { // éclair blanc quand elle est touchée
        if (!e.w) { const c = document.createElement('canvas'); c.width = e.c.width; c.height = e.c.height; const g = c.getContext('2d'); g.drawImage(e.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); e.w = c; }
        ctx.globalAlpha = 0.85; ctx.drawImage(e.w, x, y); ctx.globalAlpha = 1;
      }
      if (cr.hpp < 100) { // barre de vie des créatures blessées
        const bw = Math.max(10, (e.c.width * 0.6) | 0), bx = Math.round(cr.x - bw / 2 - camX), by = y - 5, f = Math.max(0, cr.hpp) / 100;
        ctx.fillStyle = '#2c2a3a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = f > 0.5 ? '#6ad36a' : f > 0.25 ? '#e8b64a' : '#e8483f'; ctx.fillRect(bx, by, Math.max(1, Math.round(bw * f)), 2);
      }
    }

    /** Effets de capacités (additifs) et nombres de dégâts. */
    drawCombatFx(fx, camX, camY) {
      const ctx = this.ctx;
      if (!fx.vis.length && !fx.nums.length) return;
      ctx.globalCompositeOperation = 'lighter';
      const sq = function (x, y, s) { ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); };
      for (const v of fx.vis) {
        const u = Math.min(1, v.t / v.life), al = 1 - u, X = v.x - camX, Y = v.y - camY;
        if (v.k === 'slash') {
          const a0 = v.a - v.arc / 2, lead = Math.min(1, u * 2.2);
          for (let k = 0; k <= 28; k++) {
            const f = k / 28; if (f > lead) break;
            const ang = a0 + v.arc * f, rr = v.r * (0.82 + 0.28 * Math.sin(f * 3.14)), tf = Math.max(0, 1 - (lead - f) * 1.5);
            ctx.globalAlpha = al * tf * 0.85; ctx.fillStyle = v.c; sq(X + Math.cos(ang) * rr, Y + Math.sin(ang) * rr, v.big ? 4 : 3);
            ctx.globalAlpha = al * tf; ctx.fillStyle = '#fff'; sq(X + Math.cos(ang) * rr, Y + Math.sin(ang) * rr, 1);
          }
        } else if (v.k === 'spin') {
          for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 18; k++) {
            const ang = u * 6.283 * 1.2 + arm * 3.1416 - k * 0.12, rr = v.r * 0.92;
            ctx.globalAlpha = al * (1 - k / 18) * 0.9; ctx.fillStyle = k < 3 ? '#fff' : v.c; sq(X + Math.cos(ang) * rr, Y + Math.sin(ang) * rr * 0.75, 3);
          }
        } else if (v.k === 'ring' || v.k === 'aura') {
          const rad = v.r * (v.k === 'aura' ? 0.4 + 0.6 * u : 1 - (1 - u) * (1 - u));
          ctx.lineWidth = 2; ctx.globalAlpha = al * 0.9; ctx.strokeStyle = v.c; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * 0.6, 0, 0, 6.2832); ctx.stroke();
          ctx.lineWidth = 1; ctx.globalAlpha = al * 0.7; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.ellipse(X, Y, rad * 0.93, rad * 0.56, 0, 0, 6.2832); ctx.stroke();
        } else if (v.k === 'charge') {
          const rad = v.r * (1 - u) + 4;
          ctx.lineWidth = 2; ctx.globalAlpha = u * 0.9; ctx.strokeStyle = v.c; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad, 0, 0, 6.2832); ctx.stroke();
        } else if (v.k === 'ebolt') { // éclair : ligne brisée qui scintille
          const dx = v.x2 - v.x, dy = v.y2 - v.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, seg = 7;
          const pts = []; for (let i = 0; i <= seg; i++) { const f = i / seg, j = i === 0 || i === seg ? 0 : (Math.sin(i * 12.9 + v.x) * 6 + Math.sin(this.t * 60 + i) * 2); pts.push([X + dx * f + nx * j, Y + dy * f + ny * j]); }
          [[5, 0.35, v.c], [3, 0.7, v.c], [1, 1, '#fff']].forEach(function (L) { ctx.lineWidth = L[0]; ctx.globalAlpha = al * L[1]; ctx.strokeStyle = L[2]; ctx.beginPath(); pts.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); });
          ctx.lineWidth = 1;
        } else if (v.k === 'eboom' || v.k === 'esteam') { // explosion : boule de lumière puis onde de choc
          const rad = v.r * (1 - (1 - u) * (1 - u)), steam = v.k === 'esteam', g = ctx.createRadialGradient(X, Y, 0, X, Y, Math.max(1, rad));
          g.addColorStop(0, steam ? 'rgba(255,255,255,0.9)' : '#ffffff'); g.addColorStop(0.35, steam ? 'rgba(255,230,210,0.5)' : v.c); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = al * 0.85; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * 0.7, 0, 0, 6.2832); ctx.fill();
          ctx.lineWidth = 2; ctx.globalAlpha = al; ctx.strokeStyle = steam ? '#fff' : v.c; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * 0.7, 0, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
        } else if (v.k === 'eice') { // éclat de glace : branches de cristal et anneau givré
          const rad = v.r * (1 - (1 - u) * (1 - u));
          ctx.strokeStyle = v.c; ctx.lineWidth = 2; ctx.globalAlpha = al * 0.9;
          for (let i = 0; i < 8; i++) { const a = i * 0.7854 + 0.2, l = rad * (i % 2 ? 0.7 : 1); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l * 0.7); ctx.stroke(); ctx.fillStyle = '#e6fbff'; sq(X + Math.cos(a) * l, Y + Math.sin(a) * l * 0.7, 3); }
          ctx.globalAlpha = al * 0.7; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * 0.7, 0, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
        } else if (v.k === 'esky') { // la foudre s'abat du ciel
          const w = (1 - u) * 7 + 1, g = ctx.createLinearGradient(X, Y - 130, X, Y);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, v.c); g.addColorStop(1, '#fff');
          ctx.globalAlpha = Math.min(1, al * 2); ctx.fillStyle = g; ctx.fillRect(Math.round(X - w / 2), Math.round(Y - 130), Math.round(w), 130);
          ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(X - 1), Math.round(Y - 130), 2, 130);
          const rad = v.r * u; ctx.lineWidth = 2; ctx.globalAlpha = al; ctx.strokeStyle = v.c2 || v.c; ctx.beginPath(); ctx.ellipse(X, Y, rad, rad * 0.6, 0, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1;
        } else if (v.k === 'cloud') { // nuage toxique persistant
          const pulse = 1 + 0.06 * Math.sin(this.t * 4), fade = u > 0.8 ? (1 - u) / 0.2 : 1, g = ctx.createRadialGradient(X, Y, 0, X, Y, v.r * pulse);
          g.addColorStop(0, v.c2 || v.c); g.addColorStop(0.6, v.c); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.22 * fade; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, v.r * pulse, v.r * pulse * 0.6, 0, 0, 6.2832); ctx.fill();
        } else if (v.k === 'proj') {
          const ang = Math.atan2(v.vy, v.vx), ca = Math.cos(ang), sa = Math.sin(ang);
          ctx.globalAlpha = Math.min(1, al * 3);
          if (v.sub === 'wave') {
            const rr = v.r + 12 * v.t;
            for (let k = -9; k <= 9; k++) { const off = k / 9 * rr * 1.3, bend = (k * k) / 9 * 0.45; ctx.fillStyle = v.c; sq(X - sa * off - ca * bend, Y + ca * off - sa * bend, 3); ctx.fillStyle = '#fff'; sq(X - sa * off - ca * bend, Y + ca * off - sa * bend, 1); }
          } else if (v.sub === 'knife') {
            ctx.fillStyle = v.c; sq(X - ca * 2, Y - sa * 2, 3); ctx.fillStyle = '#fff'; sq(X, Y, 2);
          } else {
            for (let i = 0; i < 12; i++) { ctx.fillStyle = i < 2 ? '#fff' : v.c; sq(X - ca * i * 1.4, Y - sa * i * 1.4, i < 2 ? 3 : 2); }
          }
        } else if (v.k === 'thrust') {
          const reach = v.r * Math.min(1, u * 5);
          for (let i = 0; i < reach; i += 2) { const w = Math.max(1, Math.round(3 * (1 - i / v.r) + 1)); ctx.globalAlpha = al * 0.95; ctx.fillStyle = i > reach - 5 ? '#fff' : v.c; sq(X + Math.cos(v.a) * i, Y + Math.sin(v.a) * i, w); }
        } else if (v.k === 'spike') {
          const h = 20 * Math.sin(Math.min(1, u * 3) * 1.5708) * (1 - Math.max(0, (u - 0.55) / 0.45));
          for (let r = 0; r < h; r++) { const w = Math.max(1, Math.round((1 - r / h) * 5)); ctx.globalAlpha = 0.95; ctx.fillStyle = r > h - 3 ? '#fff' : v.c; ctx.fillRect(Math.round(X - w / 2), Math.round(Y - r), w, 1); }
        } else if (v.k === 'crack') {
          ctx.globalAlpha = al * 0.9; ctx.fillStyle = v.c;
          for (let k = 0; k < 7; k++) { const ang = k * 0.9 + 0.3; for (let i = 3; i < 16 * Math.min(1, u * 4); i += 2) sq(X + Math.cos(ang) * i + Math.sin(i) * 0.8, Y + Math.sin(ang) * i * 0.6, 1); }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (fx.nums.length) {
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
        for (const n of fx.nums) {
          const u = n.t / n.life, s = n.crit ? 1 + 0.5 * Math.max(0, 1 - u * 6) : 1;
          ctx.globalAlpha = Math.min(1, (1 - u) * 2);
          ctx.save(); ctx.translate(Math.round(n.x - camX), Math.round(n.y - camY)); ctx.scale(s, s);
          ctx.strokeStyle = '#2c2a3a'; ctx.strokeText(n.txt, 0, 0); ctx.fillStyle = n.hurt ? '#ff5a4a' : n.crit ? '#ffd24a' : '#ffffff'; ctx.fillText(n.txt, 0, 0);
          ctx.restore();
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'start';
      }
      ctx.globalAlpha = 1;
    }



    drawDrop(d, camX, camY) {
      const ic = this.S.icons[d.item];
      const bob = d.pop ? 0 : Math.round(Math.sin(this.t * 3 + d.x) * 1);
      this.ctx.drawImage(ic, Math.round(d.x - 8 - camX), Math.round(d.y - 14 - d.z - camY + bob));
    }

    drawPlayer(p, camX, camY) {
      const ctx = this.ctx, S = this.S;
      const e = S.avatarSet(p.av, p.armor)[p.dir][p.moving ? p.frame : 0], swm = p.sw || 0;
      if (swm > 0.02) { // nage : le corps s'enfonce jusqu'à la poitrine, il tangue un peu, des rides s'étalent autour
        const cut = Math.round(e.c.height * 0.36 * swm), bob = Math.round(Math.sin(this.t * 6 + p.x * 0.05) * 0.6 * swm);
        ctx.drawImage(e.c, 0, 0, e.c.width, e.c.height - cut, Math.round(p.x - e.ax - camX), Math.round(p.y - e.ay - camY) + cut + bob, e.c.width, e.c.height - cut);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        for (let k = 0; k < 2; k++) {
          const ph = (this.t * 1.4 + k * 0.5) % 1, rx = 5 + ph * 7, ry = 2 + ph * 3;
          ctx.globalAlpha = 0.6 * swm * (1 - ph);
          ctx.beginPath(); ctx.ellipse(Math.round(p.x - camX), Math.round(p.y - 1 - camY), rx, ry, 0, 0, 6.2832); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else ctx.drawImage(e.c, Math.round(p.x - e.ax - camX), Math.round(p.y - e.ay - camY));
      if (p.id !== this.localId) { // autres joueurs (coop) : petite pastille de couleur au-dessus de la tête
        ctx.fillStyle = ['#e8b64a', '#e86a5a', '#5ab0e8', '#8ad36a'][((parseInt(p.id.slice(1), 10) || 1) - 1) % 4];
        ctx.fillRect(Math.round(p.x - 2 - camX), Math.round(p.y - 26 - camY), 4, 3);
      }
      const held = p.inv.slots[p.sel], hd = held && I.ITEMS[held.id];
      if (hd && hd.light && !p.swing) {
        const side = p.dir === 'left' ? -8 : p.dir === 'right' ? 8 : (p.dir === 'down' ? 7 : -7);
        ctx.drawImage(S.icons[held.id], Math.round(p.x + side - 8 - camX), Math.round(p.y - 19 - camY + (p.moving ? (p.frame % 2) : 0)));
      }
      const sw = p.swing;
      if (!sw) return;
      const v = DIRV[sw.dir], base = Math.atan2(v[1], v[0]), prog = sw.t / sw.dur;
      const cx = p.x, cy = p.y - 9, R = 13;
      const u = Math.max(0, Math.min(1, (prog - 0.15) / 0.5));
      const a = base - 1.2 + 2.4 * u;
      if (prog > 0.15 && prog < 0.9) {
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k <= u * 18; k++) {
          const aa = base - 1.2 + 2.4 * (k / 18);
          ctx.globalAlpha = 0.15 + 0.6 * (k / 18) * (1 - Math.max(0, prog - 0.6) * 2.5);
          ctx.fillRect(Math.round(cx + Math.cos(aa) * (R + 2) - camX), Math.round(cy + Math.sin(aa) * (R + 2) - camY), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      const icon = S.icons[sw.item];
      if (icon) ctx.drawImage(icon, Math.round(cx + Math.cos(a) * R - 8 - camX), Math.round(cy + Math.sin(a) * R - 8 - camY));
    }

    drawParticles(fx, camX, camY) {
      const ctx = this.ctx;
      for (const p of fx.parts) {
        ctx.globalAlpha = p.fade ? Math.max(0, p.life / p.max) * 0.7 : 1;
        ctx.fillStyle = p.col;
        ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    drawFlies(fx, camX, camY) {
      const ctx = this.ctx;
      for (const f of fx.flies) {
        if (f.kind !== 'b') continue;
        const x = Math.round(f.x - camX), y = Math.round(f.y - camY + Math.sin(f.ph * 0.4) * 2), up = Math.sin(f.ph) > 0;
        ctx.fillStyle = f.col[0]; ctx.fillRect(x - 1, y - (up ? 1 : 0), 1, up ? 2 : 1); ctx.fillRect(x + 1, y - (up ? 1 : 0), 1, up ? 2 : 1);
        ctx.fillStyle = f.col[1]; ctx.fillRect(x, y, 1, 1);
      }
    }

    /** Aperçu de pose : l'objet en transparence + 4 coins verts (possible) ou rouges (impossible). */
    drawGhost(state, camX, camY) {
      const p = state.players[this.localId];
      if (!p || !p.build) return;
      const b = p.build, def = I.OBJECTS[b.type], ctx = this.ctx;
      if (def.layer === 'roof') { // aperçu du toit : toute l'empreinte de la pièce visée
        const pv = I.house.roofPreview(state.world, b.tx, b.ty);
        ctx.globalAlpha = 0.45 + 0.1 * Math.sin(this.t * 6);
        for (const t of pv.fp) if (!state.world.roofAt(t[0], t[1])) ctx.drawImage(this.S.roofSprite(0).c, Math.round(t[0] * TS - camX), Math.round(t[1] * TS - 8 - camY));
        ctx.globalAlpha = 0.9; ctx.fillStyle = b.ok ? '#9dff8a' : '#ff7a6a';
        for (const t of pv.fp) { const x = t[0] * TS - camX, y = t[1] * TS - 8 - camY; ctx.fillRect(Math.round(x), Math.round(y), 16, 1); ctx.fillRect(Math.round(x), Math.round(y + 15), 16, 1); }
        ctx.globalAlpha = 1;
        if (!pv.fp.length) { const x = b.tx * TS - camX, y = b.ty * TS - camY; ctx.fillStyle = '#ff7a6a'; ctx.fillRect(Math.round(x), Math.round(y), 16, 1); ctx.fillRect(Math.round(x), Math.round(y + 15), 16, 1); }
        return;
      }
      const e = I.tint.entry(this.S.obj[def.sprite][0], b.c | 0), x = b.tx * TS - camX, y = b.ty * TS - camY;
      ctx.globalAlpha = 0.5 + 0.12 * Math.sin(this.t * 6);
      ctx.drawImage(e.c, Math.round(b.tx * TS + 8 - e.ax - camX), Math.round(b.ty * TS + 16 - e.ay - camY));
      ctx.globalAlpha = 0.95; ctx.fillStyle = b.ok ? '#9dff8a' : '#ff7a6a';
      [[x, y, 1, 1], [x + 15, y, -1, 1], [x, y + 15, 1, -1], [x + 15, y + 15, -1, -1]].forEach(function (c) {
        ctx.fillRect(c[0] + (c[2] < 0 ? -3 : 0), c[1], 4, 1); ctx.fillRect(c[0], c[1] + (c[3] < 0 ? -3 : 0), 1, 4);
      });
      ctx.globalAlpha = 1;
    }

    drawHpBars(objs, world, fx, camX, camY) {
      const ctx = this.ctx;
      for (const o of objs) {
        const t = fx.hitAt[o.id];
        if (t === undefined || this.t - t > 1.6 || world.isDepleted(o) || o.def.kind !== 'resource') continue;
        const x = Math.round(o.x - 7 - camX), y = Math.round(o.y + 3 - camY), frac = world.hpOf(o) / o.def.hp;
        ctx.fillStyle = '#2c2a3a'; ctx.fillRect(x - 1, y - 1, 16, 5);
        ctx.fillStyle = '#5a3a28'; ctx.fillRect(x, y, 14, 3);
        ctx.fillStyle = frac > 0.5 ? '#7cc94f' : '#f2c14e'; ctx.fillRect(x, y, Math.max(1, Math.round(14 * frac)), 3);
      }
    }


    drawClouds(camX, camY, world) {
      const ctx = this.ctx, S = this.S, ww = world.W * TS;
      ctx.globalAlpha = 0.1;
      const tt = this.t;
      [[0, 300, 6, 0], [1, 700, 4, 90], [2, 1100, 5, 40], [0, 1000, 3.5, 250]].forEach(function (c, i) {
        const x = ((c[3] + tt * c[2] + i * 331) % (ww + 260)) - 130, y = c[1];
        ctx.drawImage(S.cloud[c[0]], Math.round(x - camX), Math.round(y - camY));
      });
      ctx.globalAlpha = 1;
    }

    /** Lobby : reflets sur le quartz, poussières de lumière qui montent, tourbillon et rayon du portail ultime, lueur du retour. */
    drawLobbyFx(objs, world, camX, camY, boost, rgb) {
      const ctx = this.ctx, S = this.S, t = this.t, w = this.w, h = this.h, hash2 = I.rng.hash2, W = world.W;
      const x0 = Math.max(0, Math.floor(camX / TS)), x1 = Math.min(W - 1, Math.floor((camX + w) / TS)), y0 = Math.max(0, Math.floor(camY / TS)), y1 = Math.min(world.H - 1, Math.floor((camY + h) / TS));
      ctx.fillStyle = '#ffffff';
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { // éclats de lumière sur le quartz
        if (world.ground[ty * W + tx] < 7) continue;
        const hv = hash2(tx, ty, 77), ph = (t * 0.3 + hv * 9) % 1;
        if (ph > 0.07) continue;
        const a = Math.sin(ph / 0.07 * Math.PI), x = Math.floor(tx * TS + 2 + hash2(tx, ty, 78) * 12 - camX), y = Math.floor(ty * TS + 2 + hash2(tx, ty, 79) * 12 - camY);
        ctx.globalAlpha = a; ctx.fillRect(x, y, 1, 1);
        if (a > 0.6) { ctx.globalAlpha = a * 0.6; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      }
      // incrustations lumineuses : anneaux, rayons et estrade, avec une onde d'énergie qui les parcourt
      const PX = 24.5 * TS, PY = 20 * TS, DX = 24.5 * TS, DY = 13 * TS, glowAt = (x, y, ph, k) => {
        const sx = Math.round(x - camX), sy = Math.round(y - camY);
        if (sx < -2 || sy < -2 || sx > w || sy > h) return;
        const a = 0.55 + 0.4 * Math.sin(ph - t * 2.2); ctx.globalAlpha = a * k; ctx.fillStyle = '#7fe6ff'; ctx.fillRect(sx, sy, 2, 2);
        ctx.globalAlpha = a * k * 0.5; ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 1, 1);
      };
      for (const [cx0, cy0, rr] of [[PX, PY, 9.1 * TS], [PX, PY, 15.4 * TS], [DX, DY, 5.15 * TS]]) {
        const n = Math.ceil(rr * 1.6);
        for (let i = 0; i < n; i++) { const a = i / n * 6.2832; glowAt(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr, a * 4, 1); }
      }
      for (let s = 0; s < 8; s++) { const a = s * Math.PI / 4; for (let r = 9.7 * TS; r < 14.8 * TS; r += 1.5) glowAt(PX + Math.cos(a) * r, PY + Math.sin(a) * r, r * 0.05 + s, 0.9); }
      const Hs = world.H * TS * 0.75, COL = ['#cfeaff', '#ffffff', '#ffd9ff'];
      for (let i = 0; i < 56; i++) { // poussières de lumière
        const sp = 5 + hash2(i, 3, 9) * 9, x = hash2(i, 1, 9) * world.W * TS + Math.sin(t * 0.7 + i) * 5;
        const y = world.H * TS * 0.85 - ((hash2(i, 2, 9) * Hs + t * sp) % Hs);
        ctx.globalAlpha = 0.2 + 0.5 * Math.pow(Math.sin(t * 1.3 + i), 2); ctx.fillStyle = COL[i % 3];
        ctx.fillRect(Math.round(x - camX), Math.round(y - camY), 1, 1);
      }
      for (const o of objs) {
        if (o.type === 'return_pad') { ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 2); ctx.drawImage(S.glow.cyan, Math.round(o.x - 14 - camX), Math.round(o.y - 18 - camY)); }
        if (o.type !== 'portal_ultimate') continue;
        const cx = o.x - camX, cy = o.y - 63 - camY, k = 1 + boost * 3;
        ctx.globalAlpha = Math.min(1, 0.45 + 0.15 * Math.sin(t * 1.7) + boost * 0.6); ctx.drawImage(S.glow.big, Math.round(cx - 48), Math.round(cy - 48)); ctx.drawImage(S.glow.big, Math.round(cx - 48), Math.round(cy - 48));
        ctx.fillStyle = 'rgba(' + (rgb ? rgb.join(',') : '110,80,255') + ',' + (0.16 + 0.08 * Math.sin(t * 2) + boost * 0.3) + ')';
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(cx, cy, 23, 34, 0, 0, 6.283); ctx.fill();
        for (let i = 0; i < 160; i++) { // tourbillon d'énergie
          const u = i / 160, a = u * 17 + t * 1.3 * k, rad = Math.pow(u, 0.75);
          ctx.globalAlpha = (0.25 + 0.75 * (1 - u)) * (0.6 + 0.4 * Math.sin(t * 3 + i)); ctx.fillStyle = u < 0.2 ? '#ffffff' : i % 3 ? '#a9e8ff' : (rgb ? 'rgb(' + rgb.join(',') + ')' : '#c8a8ff');
          ctx.fillRect(Math.round(cx + Math.cos(a) * rad * 22), Math.round(cy + Math.sin(a) * rad * 33), u < 0.15 ? 3 : 2, u < 0.15 ? 2 : 1);
        }
        if (boost > 0) { // rayon vers le ciel
          const gr = ctx.createLinearGradient(0, cy - 36, 0, cy - 256);
          gr.addColorStop(0, 'rgba(' + (rgb ? rgb.join(',') : '200,220,255') + ',' + (0.55 * boost) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(Math.round(cx - 13 * boost - 1), Math.round(cy - 256), Math.round(26 * boost + 2), 220);
        }
      }
      ctx.globalAlpha = 1;
    }

    drawGlows(objs, world, fx, camX, camY, night, state) {
      const ctx = this.ctx, S = this.S, t = this.t;
      function glow(img, x, y, a) { ctx.globalAlpha = a; ctx.drawImage(img, Math.round(x - img.width / 2 - camX), Math.round(y - img.height / 2 - camY)); }
      for (const o of objs) {
        if (o.type === 'portal') {
          glow(S.glow.violet, o.x, o.y - 24, 0.55 + 0.2 * Math.sin(t * 2));
          ctx.fillStyle = '#d4c6ff';
          for (let i = 0; i < 7; i++) {
            const a = t * 1.4 + i * 0.9;
            ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + i);
            ctx.fillRect(Math.round(o.x + Math.cos(a) * (3 + i) - camX), Math.round(o.y - 24 + Math.sin(a) * (4 + i * 1.3) - camY), 1, 1);
          }
        } else if (o.type === 'crystal' && !world.isDepleted(o)) {
          glow(S.glow.cyan, o.x, o.y - 8, 0.4 + 0.2 * Math.sin(t * 2.5 + o.x));
        } else if (o.def.glowTable) {
          const tg = this.tableGlow(o);
          glow(S.glowOf(tg.rgb), o.x, o.y - 8, (0.3 + 0.15 * Math.sin(t * 2 + o.x)) * (1 + tg.k * 1.5));
          if (tg.k > 0.05) { ctx.fillStyle = tg.css; for (let i = 0; i < 6; i++) { const a = t * 2 + i * 1.05; ctx.globalAlpha = tg.k * (0.5 + 0.4 * Math.sin(t * 5 + i)); ctx.fillRect(Math.round(o.x + Math.cos(a) * (5 + i) - camX), Math.round(o.y - 14 - ((t * 14 + i * 5) % 16) - camY), 1, 1); } ctx.globalAlpha = 1; }
        } else if (o.def.glowSoft && !world.isDepleted(o)) {
          glow(S.glow[o.def.glowSoft], o.x, o.y - 4, 0.3 + 0.15 * Math.sin(t * 2 + o.x));
        } else if (o.def.glowLamp && night > 0.1) {
          glow(S.glow.warm, o.x, o.y - 19, night * 0.95);
        } else if (o.def.glowLit && o.data && o.data.lit) {
          glow(S.glow.warm, o.x, o.y - 6, 0.5 + 0.15 * Math.sin(t * 9));
        } else if (o.type === 'house' && night > 0.15) {
          glow(S.glow.warm, o.x - 17, o.y - 17, night * 0.9);
          glow(S.glow.warm, o.x + 17, o.y - 17, night * 0.9);
        }
      }
      // torches tenues en main
      for (const id in state.players) {
        const p = state.players[id], it = p.inv.slots[p.sel];
        if (p.away) continue;
        if (it && I.ITEMS[it.id].light) {
          const side = p.dir === 'left' ? -8 : p.dir === 'right' ? 8 : 0;
          glow(S.glow.warm, p.x + side, p.y - 14, (0.3 + night * 0.7) * (0.88 + 0.12 * Math.sin(t * 11 + 1)));
          glow(S.glow.warm, p.x + side, p.y - 14, (0.15 + night * 0.35) * (0.88 + 0.12 * Math.sin(t * 7)));
        }
      }
      for (const f of fx.flies) {
        if (f.kind === 'f') glow(S.glow.small, f.x, f.y + Math.sin(f.ph) * 3, 0.5 + 0.5 * Math.sin(f.ph * 2));
      }
      ctx.globalAlpha = 1;
    }
  }
  I.Renderer = Renderer;
})((window.Iles = window.Iles || {}));
