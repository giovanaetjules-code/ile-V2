/*
 * Grande carte (touche M) : plein écran, déplaçable (glisser à la souris, ZQSD / flèches), zoomable (molette, + / -),
 * Espace pour se recentrer sur soi. Même source que la mini-map : seules les cases explorées sont visibles. Ne modifie jamais l'état du jeu.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const ZOOMS = [2, 3, 4, 6, 8, 12, 16, 24, 32];
  const OUTSIDE = [10, 11, 18];

  const BigMap = {
    cx: 0, cy: 0, zi: 4, dirty: true, acc: 0, drag: null, mouse: null,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.cv = $('map-cv'); this.g = this.cv.getContext('2d');
      this.buf = document.createElement('canvas'); this.bg = this.buf.getContext('2d');
      const cv = this.cv, self = this;
      cv.addEventListener('mousedown', function (e) { if (e.button === 0 || e.button === 1) { self.drag = { x: e.clientX, y: e.clientY }; cv.style.cursor = 'grabbing'; e.preventDefault(); } });
      window.addEventListener('mouseup', function () { if (self.drag) { self.drag = null; cv.style.cursor = 'grab'; } });
      window.addEventListener('mousemove', function (e) {
        if (I.Menu.screen !== 'map') return;
        if (self.drag) { const z = self.z(); self.cx -= (e.clientX - self.drag.x) / z; self.cy -= (e.clientY - self.drag.y) / z; self.drag = { x: e.clientX, y: e.clientY }; self.clamp(); self.dirty = true; }
        self.mouse = { x: e.clientX, y: e.clientY }; self.updateCoords();
      });
      cv.addEventListener('wheel', function (e) { e.preventDefault(); self.zoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); }, { passive: false });
      cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      $('map-center').addEventListener('click', function () { self.center(); });
      $('map-zin').addEventListener('click', function () { self.zoom(1); });
      $('map-zout').addEventListener('click', function () { self.zoom(-1); });
      $('map-close').addEventListener('click', function () { I.Menu.show('playing'); });
      window.addEventListener('resize', function () { if (I.Menu.screen === 'map') { self.fit(); self.dirty = true; } });
    },
    z: function () { return ZOOMS[this.zi]; },
    fit: function () { this.cv.width = window.innerWidth; this.cv.height = window.innerHeight; },
    open: function () {
      this.fit();
      const w = this.game.state.world;
      if (this.sized !== w) { // première ouverture dans ce monde : zoom qui fait tenir tout le monde à l'écran (ou ×8 en dimension)
        this.sized = w; const fitZ = w.chunked ? 8 : Math.min(this.cv.width / w.W, this.cv.height / w.H); let zi = 0;
        while (zi + 1 < ZOOMS.length && ZOOMS[zi + 1] <= fitZ) zi++; this.zi = zi;
      }
      this.center(); this.cv.style.cursor = 'grab'; this.dirty = true; this.acc = 1;
    },
    center: function () {
      const p = this.game.local; if (!p) return;
      this.cx = p.x / 16; this.cy = (p.y - 1) / 16; this.clamp(); this.dirty = true;
    },
    clamp: function () {
      const w = this.game.state.world;
      if (w.chunked) { // dimensions : le joueur est vers la case 32768 ; on borne à ±4000 cases AUTOUR de lui (et non autour de 0)
        const p = this.game.local, bx = p ? p.x / 16 : 0, by = p ? p.y / 16 : 0;
        this.cx = Math.max(bx - 4000, Math.min(bx + 4000, this.cx)); this.cy = Math.max(by - 4000, Math.min(by + 4000, this.cy));
      }
      else { this.cx = Math.max(0, Math.min(w.W, this.cx)); this.cy = Math.max(0, Math.min(w.H, this.cy)); }
    },
    zoom: function (dir, mx, my) {
      const ni = Math.max(0, Math.min(ZOOMS.length - 1, this.zi + dir)); if (ni === this.zi) return;
      const W = this.cv.width, H = this.cv.height, ax = mx === undefined ? W / 2 : mx, ay = my === undefined ? H / 2 : my, z0 = this.z();
      const tx = this.cx + (ax - W / 2) / z0, ty = this.cy + (ay - H / 2) / z0; // case sous le curseur : elle reste sous le curseur
      this.zi = ni; const z1 = this.z();
      this.cx = tx - (ax - W / 2) / z1; this.cy = ty - (ay - H / 2) / z1; this.clamp(); this.dirty = true; this.updateCoords();
    },
    updateCoords: function () {
      const el = $('map-coords'), m = this.mouse; if (!el) return;
      const z = this.z(), W = this.cv.width, H = this.cv.height;
      const tx = m ? Math.floor(this.cx + (m.x - W / 2) / z) : null, ty = m ? Math.floor(this.cy + (m.y - H / 2) / z) : null;
      el.textContent = (m ? 'Case ' + tx + ' , ' + ty + ' · ' : '') + 'zoom ×' + z;
    },
    update: function (dt, input) {
      const dk = function (a) { return a.some(function (k) { return input.isDown(k); }); };
      const mx = (dk(['KeyD', 'ArrowRight']) ? 1 : 0) - (dk(['KeyA', 'KeyQ', 'ArrowLeft']) ? 1 : 0), my = (dk(['KeyS', 'ArrowDown']) ? 1 : 0) - (dk(['KeyW', 'KeyZ', 'ArrowUp']) ? 1 : 0);
      if (mx || my) { const sp = 520 / this.z() * (input.isDown('ShiftLeft') ? 2 : 1); this.cx += mx * sp * dt; this.cy += my * sp * dt; this.clamp(); this.dirty = true; }
      if (input.pressed('Space')) this.center();
      if (input.pressed('Equal') || input.pressed('NumpadAdd')) this.zoom(1);
      if (input.pressed('Minus') || input.pressed('NumpadSubtract') || input.pressed('Digit6')) this.zoom(-1); // Digit6 = la touche « - » d'un clavier AZERTY
      this.acc += dt;
      if (!this.dirty && this.acc < 0.25) return; // la carte bouge peu : on redessine ~4 fois par seconde (joueurs)
      this.acc = 0; this.dirty = false;
      this.draw();
    },
    draw: function () {
      const st = this.game.state, me = this.game.local; if (!st || !me) return;
      const w = st.world, X = I.explore, M = I.Minimap, z = this.z(), W = this.cv.width, H = this.cv.height, chunked = !!w.chunked, g = this.g;
      const x0 = Math.floor(this.cx - W / 2 / z) - 1, y0 = Math.floor(this.cy - H / 2 / z) - 1, nx = Math.ceil(W / z) + 3, ny = Math.ceil(H / z) + 3;
      if (this.buf.width !== nx || this.buf.height !== ny) { this.buf.width = nx; this.buf.height = ny; this.img = this.bg.createImageData(nx, ny); }
      const d = this.img.data;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const tx = x0 + i, ty = y0 + j, o = (j * nx + i) * 4;
        const c = !chunked && (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) ? OUTSIDE : M.tileColor(w, X, tx, ty, chunked);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      this.bg.putImageData(this.img, 0, 0);
      g.imageSmoothingEnabled = false; g.fillStyle = '#0a0b12'; g.fillRect(0, 0, W, H);
      const ox = Math.round(W / 2 - (this.cx - x0) * z), oy = Math.round(H / 2 - (this.cy - y0) * z);
      g.drawImage(this.buf, ox, oy, nx * z, ny * z);
      const sx = function (tx) { return Math.round(W / 2 + (tx - this.cx) * z); }.bind(this), sy = function (ty) { return Math.round(H / 2 + (ty - this.cy) * z); }.bind(this);
      // quadrillage léger tous les 16 cases quand on est assez près
      if (z >= 8) {
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath();
        for (let t = Math.ceil(x0 / 16) * 16; t < x0 + nx; t += 16) { g.moveTo(sx(t) + .5, 0); g.lineTo(sx(t) + .5, H); }
        for (let t = Math.ceil(y0 / 16) * 16; t < y0 + ny; t += 16) { g.moveTo(0, sy(t) + .5); g.lineTo(W, sy(t) + .5); }
        g.stroke();
      }
      // arbres, rochers, minerais, constructions (cases connues)
      const sz = Math.max(1, Math.round(z * 0.6)), off = Math.round((z - sz) / 2);
      for (const ob of w.objectsIn(x0 * 16, y0 * 16, (x0 + nx) * 16, (y0 + ny) * 16 + 16)) {
        if (w.isDepleted && w.isDepleted(ob) && !ob.structure) continue;
        const col = M.objColor(ob); if (!col) continue;
        const tx = ob.structure ? ob.tx : Math.floor(ob.x / 16), ty = ob.structure ? ob.ty : Math.floor((ob.y - 1) / 16);
        if (!X.known(w, tx, ty)) continue;
        g.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')'; g.fillRect(sx(tx) + off, sy(ty) + off, sz, sz);
      }
      // portails
      for (const ob of w.objectsIn(x0 * 16 - 64, y0 * 16 - 64, (x0 + nx) * 16 + 64, (y0 + ny) * 16 + 64)) {
        if (ob.type.indexOf('portal') < 0) continue;
        const tx = Math.floor(ob.x / 16), ty = Math.floor((ob.y - 1) / 16); if (!X.known(w, tx, ty)) continue;
        const r = Math.max(5, Math.round(z * 0.7)), px = sx(tx) + z / 2, py = sy(ty) + z / 2;
        g.fillStyle = '#7ae8ff'; g.fillRect(px - r, py - r, r * 2, r * 2); g.fillStyle = '#fff'; g.fillRect(px - r / 2, py - r / 2, r, r);
      }
      // joueurs : tête de l'avatar dans un anneau de la couleur de la tunique
      for (const id of Object.keys(st.players).sort()) { const q = st.players[id]; if (!q.away && q !== me) this.drawPlayer(q, sx(q.x / 16), sy((q.y - 1) / 16), false); }
      this.drawPlayer(me, sx(me.x / 16), sy((me.y - 1) / 16), true);
      $('map-name').textContent = w.chunked ? w.D.name : w.lobby ? 'Lobby' : 'L’île';
    },
    drawPlayer: function (q, x, y, local) {
      const g = this.g, av = I.avatar.sanitize(q.av), col = I.avatar.mapColor(av), r = local ? 16 : 14, W = this.cv.width, H = this.cv.height, m = r + 4;
      let edge = false;
      if (x < m) { x = m; edge = true; } if (y < m + 56) { y = m + 56; edge = true; } if (x > W - m) { x = W - m; edge = true; } if (y > H - m - 40) { y = H - m - 40; edge = true; }
      g.fillStyle = '#000000b0'; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      g.strokeStyle = col; g.lineWidth = local ? 4 : 3; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.stroke();
      if (local) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r + 3, 0, 6.2832); g.stroke(); }
      const e = this.S.avatarSet(av).down[0];
      g.save(); g.beginPath(); g.arc(x, y, r - 2, 0, 6.2832); g.clip(); g.drawImage(e.c, 2, 2, 12, 9, x - r + 1, y - r + 4, r * 2 - 2, (r * 2 - 2) * 0.75); g.restore();
      if (edge) { g.fillStyle = col; g.fillRect(x - 2, y - 2, 4, 4); }
    },
  };
  I.BigMap = BigMap;
})((window.Iles = window.Iles || {}));
