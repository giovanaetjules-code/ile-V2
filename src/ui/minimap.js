/* Mini-map (toujours affichée ; la touche M ouvre la grande carte, voir bigmap.js) : dessinée à partir du vrai monde et des cases explorées ; joueurs avec leur avatar. Ne modifie jamais l'état du jeu. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const VIEW = 48, PX = 4, SIZE = VIEW * PX; // 48×48 cases visibles, 4 px par case
  const TC = ['#2b4f8c', '#4a86c8', '#e3cf8f', '#6aab4a', '#4b8a3d', '#9a7048', '#b58850', '#e8e8f0', '#b8c4e8', '#d8d0f0', '#8a8a96', '#4a4452', '#9ae8d8'];
  const UNKNOWN = [18, 20, 30];
  const hex = function (h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const TRGB = TC.map(hex);
  const OBJ = { tree: [34, 92, 46], rock: [120, 120, 132], ore: [214, 140, 80], crystal: [190, 130, 240], bush: [150, 70, 80], struct: [120, 78, 40] };

  const Minimap = {
    visible: true, acc: 0,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.el = $('minimap'); this.cv = $('minimap-cv'); this.g = this.cv.getContext('2d'); this.cap = $('minimap-cap');
      this.buf = document.createElement('canvas'); this.buf.width = this.buf.height = VIEW; this.bg = this.buf.getContext('2d');
      this.img = this.bg.createImageData(VIEW, VIEW);
      this.visible = app.settings.map !== false;
      this.apply();
    },
    apply: function () { this.el.classList.toggle('hidden', !this.visible); },
    toggle: function () {
      this.visible = !this.visible; this.app.settings.map = this.visible; this.app.applySettings(); this.apply(); this.acc = 1;
    },
    objColor: function (o) {
      const t = o.type;
      if (o.structure) return OBJ.struct;
      if (t.indexOf('tree') === 0 || t.indexOf('palm') === 0 || t.indexOf('cactus') === 0 || t.indexOf('mush') === 0 && o.def.kind === 'resource') return OBJ.tree;
      if (t.indexOf('ore') === 0) return OBJ.ore;
      if (t.indexOf('crystal') === 0) return OBJ.crystal;
      if (t.indexOf('rock') === 0 || t.indexOf('boulder') === 0) return OBJ.rock;
      if (t.indexOf('bush') === 0) return OBJ.bush;
      return null;
    },
    /** Couleur d'une case (sombre si inconnue) : partagée avec la grande carte. */
    tileColor: function (w, X, tx, ty, chunked) {
      if (!X.known(w, tx, ty)) return UNKNOWN;
      const t = w.tileAt(tx, ty);
      let c = TRGB[t] || TRGB[0];
      if (chunked) { const ci = w.colorOf(tx, ty, t); if (ci && I.COLORS[ci - 1]) { const k = 0.25 + ((0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255) * 0.95, r = I.COLORS[ci - 1].rgb; c = [Math.min(255, r[0] * k), Math.min(255, r[1] * k), Math.min(255, r[2] * k)]; } }
      return c;
    },
    update: function (dt) {
      if (!this.visible) return;
      this.acc += dt;
      if (this.acc < 0.1) return;
      this.acc = 0;
      const g = this.game, st = g.state, p = g.local;
      if (!st || !p) return;
      this.draw(st, p);
    },
    draw: function (st, me) {
      const w = st.world, X = I.explore, d = this.img.data;
      const cx = Math.floor(me.x / 16), cy = Math.floor((me.y - 1) / 16), x0 = cx - VIEW / 2, y0 = cy - VIEW / 2;
      const chunked = !!w.chunked;
      for (let j = 0; j < VIEW; j++) {
        for (let i = 0; i < VIEW; i++) {
          const tx = x0 + i, ty = y0 + j, o = (j * VIEW + i) * 4;
          const c = this.tileColor(w, X, tx, ty, chunked);
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      for (const ob of w.objectsIn(x0 * 16, y0 * 16, (x0 + VIEW) * 16, (y0 + VIEW) * 16 + 16)) { // arbres, rochers, constructions : seulement sur les cases connues
        if (w.isDepleted && w.isDepleted(ob) && !ob.structure) continue;
        const col = this.objColor(ob); if (!col) continue;
        const tx = ob.structure ? ob.tx : Math.floor(ob.x / 16), ty = ob.structure ? ob.ty : Math.floor((ob.y - 1) / 16), i = tx - x0, j = ty - y0;
        if (i < 0 || j < 0 || i >= VIEW || j >= VIEW || !X.known(w, tx, ty)) continue;
        const o = (j * VIEW + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
      }
      this.bg.putImageData(this.img, 0, 0);
      const g = this.g; g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, SIZE, SIZE); g.drawImage(this.buf, 0, 0, SIZE, SIZE);
      // portails et maisons repérés
      for (const ob of w.objectsIn(x0 * 16 - 64, y0 * 16 - 64, (x0 + VIEW) * 16 + 64, (y0 + VIEW) * 16 + 64)) {
        if (ob.type !== 'portal' && ob.type !== 'dim_portal' && ob.type !== 'lobby_portal' && ob.type.indexOf('portal') < 0) continue;
        const tx = Math.floor(ob.x / 16), ty = Math.floor((ob.y - 1) / 16);
        if (!X.known(w, tx, ty)) continue;
        const px = (tx - x0) * PX + 1, py = (ty - y0) * PX + 1;
        g.fillStyle = '#7ae8ff'; g.fillRect(px - 3, py - 3, 7, 7); g.fillStyle = '#ffffff'; g.fillRect(px - 1, py - 1, 3, 3);
      }
      // joueurs : tête de l'avatar dans un anneau de la couleur de la tunique ; les autres joueurs trop loin sont ramenés au bord
      const ids = Object.keys(st.players).sort();
      for (const id of ids) {
        const q = st.players[id]; if (q.away || q === me) continue;
        this.drawPlayer(q, (q.x / 16 - x0) * PX, ((q.y - 1) / 16 - y0) * PX, false);
      }
      this.drawPlayer(me, (me.x / 16 - x0) * PX, ((me.y - 1) / 16 - y0) * PX, true);
      this.cap.textContent = w.chunked ? w.D.name : w.lobby ? 'Lobby' : 'L’île';
    },
    drawPlayer: function (q, x, y, local) {
      const g = this.g, av = I.avatar.sanitize(q.av), col = I.avatar.mapColor(av), m = 10;
      let edge = false;
      if (x < m) { x = m; edge = true; } if (y < m) { y = m; edge = true; } if (x > SIZE - m) { x = SIZE - m; edge = true; } if (y > SIZE - m) { y = SIZE - m; edge = true; }
      x = Math.round(x); y = Math.round(y);
      g.fillStyle = '#000000aa'; g.beginPath(); g.arc(x, y, local ? 9 : 8, 0, 6.2832); g.fill();
      g.strokeStyle = col; g.lineWidth = local ? 3 : 2; g.beginPath(); g.arc(x, y, local ? 9 : 8, 0, 6.2832); g.stroke();
      if (local) { g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 11, 0, 6.2832); g.stroke(); }
      const e = this.S.avatarSet(av).down[0];
      g.save(); g.beginPath(); g.arc(x, y, (local ? 9 : 8) - 1, 0, 6.2832); g.clip();
      g.drawImage(e.c, 2, 2, 12, 9, x - 7, y - 6, 14, 11); // la tête
      g.restore();
      if (edge) { g.fillStyle = col; g.fillRect(x - 1, y - 1, 3, 3); }
    },
  };
  I.Minimap = Minimap;
})((window.Iles = window.Iles || {}));
