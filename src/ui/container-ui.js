/* Écran de coffre / four. Un clic sur un objet le fait passer de l'autre côté ; la logique est dans systems/containers.js. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const MSG = {
    far: 'Tu es trop loin.', full: 'C’est plein.', invFull: 'Ton sac est plein.', empty: '',
    badItem: 'Le four n’accepte que du minerai (cuivre, fer, argent, or) ou du combustible (bois, branche, planche, charbon, bambou).',
    occupied: 'Cette case contient déjà autre chose.',
  };

  const ContainerUI = {
    id: null,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.body = $('cont-body'); this.inv = $('cont-inv'); this.noteEl = $('cont-note'); this.sig = '';
      this.body.addEventListener('click', (e) => {
        const s = e.target.closest('[data-w]');
        if (s) this.app.containerAction('take', isNaN(+s.dataset.w) ? s.dataset.w : +s.dataset.w);
      });
      this.inv.addEventListener('click', (e) => {
        const s = e.target.closest('[data-i]');
        if (s) this.app.containerAction('put', +s.dataset.i);
      });
    },

    obj: function () { return this.game.state.world.byId.get(this.id) || null; },

    open: function (id) {
      this.id = id; this.sig = ''; this.noteEl.textContent = ''; this.noteEl.className = 'note';
      const o = this.obj();
      $('cont-title').textContent = o && o.type === 'furnace' ? 'Four' : 'Coffre';
      this.render(true);
    },

    feedback: function (r) {
      if (r.ok) { this.noteEl.textContent = ''; return; }
      this.noteEl.textContent = MSG[r.reason] || ''; this.noteEl.className = 'note err';
    },

    cell: function (s, attr, val, extra) {
      const S = this.S;
      return '<div class="slot' + (extra || '') + '" ' + attr + '="' + val + '">' + (s ? '<img src="' + S.iconURL[s.id] + '" alt="' + I.ITEMS[s.id].name + '" title="' + I.ITEMS[s.id].name + '">' + (s.qty > 1 ? '<span class="qty">' + s.qty + '</span>' : '') : '') + '</div>';
    },

    render: function (force) {
      const p = this.game.local, o = this.obj();
      if (!p || !o || !o.data) return;
      const d = o.data;
      const sig = p.inv.rev + '|' + (o.type === 'chest' ? d.inv.rev + JSON.stringify(d.inv.slots) : JSON.stringify([d.input, d.fuel, d.output, Math.round(d.progress * 10), d.lit]));
      if (!force && sig === this.sig) return;
      this.sig = sig;

      let html = '';
      if (o.type === 'chest') {
        html = '<div class="chest-grid">' + d.inv.slots.map((s, i) => this.cell(s, 'data-w', i)).join('') + '</div>';
      } else {
        const sm = (d.input && I.containers.smeltOf(d.input.id)) || I.containers.smeltOf('copper_ore'), pct = Math.min(100, Math.round(d.progress / sm.time * 100));
        html = '<div class="furnace">' +
          '<div class="f-col"><div class="f-label">Minerai</div>' + this.cell(d.input, 'data-w', 'input') + '</div>' +
          '<div class="f-col"><div class="f-label">Combustible</div>' + this.cell(d.fuel, 'data-w', 'fuel') + '</div>' +
          '<div class="f-mid"><div class="f-flame' + (d.lit ? ' on' : '') + '"></div><div class="f-bar"><div class="f-fill" style="width:' + pct + '%"></div></div></div>' +
          '<div class="f-col"><div class="f-label">Lingot</div>' + this.cell(d.output, 'data-w', 'output') + '</div></div>' +
          '<div class="note">' + sm.need + ' minerais + du combustible → 1 lingot (' + sm.time + ' s). Cuivre, fer, argent ou or ; un minerai coloré donne un lingot de la même couleur. Elle continue de chauffer même si tu t’éloignes.</div>';
      }
      this.body.innerHTML = html;
      this.inv.innerHTML = p.inv.slots.map((s, i) => this.cell(s, 'data-i', i, i < I.config.HOTBAR_SIZE ? ' hot' : '')).join('');
    },
  };
  I.ContainerUI = ContainerUI;
})((window.Iles = window.Iles || {}));
