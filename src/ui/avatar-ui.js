/* Créateur d'avatar (Options → Mon avatar) : aperçu en direct, choix des couleurs et du style, validation = sauvegarde + envoi à l'hôte. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const ROWS = [
    ['sk', 'Peau', 'c'], ['hs', 'Coiffure', 's'], ['hc', 'Cheveux', 'c'], ['tn', 'Tunique', 'c'], ['pn', 'Pantalon', 'c'], ['at', 'Accessoire', 's'], ['ac', 'Couleur accessoire', 'c'],
  ];
  const AvatarUI = {
    av: null,
    init: function (app) {
      this.app = app;
      const rows = $('av-rows');
      ROWS.forEach((r) => {
        const k = r[0], d = document.createElement('div');
        d.className = 'av-row'; d.dataset.k = k;
        d.innerHTML = '<span>' + r[1] + '</span>';
        if (r[2] === 'c') {
          const box = document.createElement('div'); box.className = 'av-sw';
          I.avatar.PAL[k].forEach(function (col, i) { const b = document.createElement('button'); b.style.background = col; b.dataset.i = i; b.title = col; box.appendChild(b); });
          box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.set(k, +b.dataset.i); });
          d.appendChild(box);
        } else {
          const box = document.createElement('div'); box.className = 'av-pick';
          box.innerHTML = '<button class="btn small" data-d="-1">◀</button><b></b><button class="btn small" data-d="1">▶</button>';
          box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { const n = I.avatar.MAXN[k]; this.set(k, (this.av[k] + +b.dataset.d + n) % n); } });
          d.appendChild(box);
        }
        rows.appendChild(d);
      });
      $('av-random').addEventListener('click', () => { const a = {}; I.avatar.KEYS.forEach(function (k) { a[k] = Math.floor(Math.random() * I.avatar.MAXN[k]); }); this.av = I.avatar.sanitize(a); this.refresh(); });
      $('av-reset').addEventListener('click', () => { this.av = I.avatar.def(); this.refresh(); });
      $('av-cancel').addEventListener('click', () => I.Menu.show('options'));
      $('av-ok').addEventListener('click', () => this.ok());
    },
    open: function () {
      this.av = I.avatar.sanitize(this.app.settings.avatar);
      $('av-note').textContent = '';
      this.refresh();
      clearInterval(this.iv);
      this.iv = setInterval(() => { if (I.Menu.screen !== 'avatar') { clearInterval(this.iv); return; } this.t = (this.t || 0) + 1; this.draw(); }, 160);
    },
    set: function (k, v) { this.av[k] = v; this.refresh(); },
    refresh: function () {
      ROWS.forEach((r) => {
        const row = document.querySelector('#av-rows .av-row[data-k="' + r[0] + '"]'), v = this.av[r[0]];
        if (r[2] === 'c') Array.from(row.querySelectorAll('.av-sw button')).forEach(function (b) { b.classList.toggle('on', +b.dataset.i === v); });
        else row.querySelector('b').textContent = I.avatar.NAMES[r[0]][v];
      });
      this.draw();
    },
    /** Aperçu : les quatre directions, en train de marcher. */
    draw: function () {
      const S = I.debug.renderer && I.debug.renderer.S, cv = $('av-preview'), g = cv.getContext('2d');
      if (!S) return;
      const set = S.avatarSet(this.av), f = (this.t || 0) % 4;
      g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingEnabled = false;
      ['down', 'left', 'up', 'right'].forEach(function (dir, i) {
        const e = set[dir][dir === 'down' ? f : f];
        g.drawImage(e.c, 0, 0, e.c.width, e.c.height, 8 + i * 62, 4, e.c.width * 4, e.c.height * 4);
      });
    },
    ok: function () {
      const app = this.app, av = I.avatar.sanitize(this.av);
      app.settings.avatar = av; app.applySettings();
      if (app.game.local) I.Net.command({ t: 'avatar', av: I.avatar.pack(av) });
      I.Menu.show('options');
    },
  };
  I.AvatarUI = AvatarUI;
})((window.Iles = window.Iles || {}));
