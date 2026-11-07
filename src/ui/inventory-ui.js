/* Fenêtre d'inventaire : 8 colonnes, 3 rangées. Clic = sélectionner, second clic = déplacer / fusionner / échanger. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const C = I.config;

  const InventoryUI = {
    init: function (game, S) {
      this.game = game; this.S = S;
      this.grid = $('inv-grid'); this.armorEl = $('inv-armor'); this.detail = $('inv-detail');
      this.selected = -1; this.hover = -1; this.lastRev = -1;
      this.grid.addEventListener('click', (e) => {
        const el = e.target.closest('.slot');
        if (!el) return;
        const i = +el.dataset.i, p = this.game.local;
        if (this.selected < 0) { if (p.inv.slots[i]) this.selected = i; }
        else if (this.selected === i) this.selected = -1;
        else { I.Net.command({ t: 'move', a: this.selected, b: i }); this.selected = -1; }
        this.render(true);
      });
      this.grid.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.slot');
        this.hover = el ? +el.dataset.i : -1; this.renderDetail();
      });
      this.grid.addEventListener('mouseleave', () => { this.hover = -1; this.renderDetail(); });
      $('btn-sort').addEventListener('click', () => { I.Net.command({ t: 'sort' }); this.selected = -1; this.render(true); });
      $('btn-equip').addEventListener('click', () => {
        if (this.selected < 0) return;
        I.Net.command({ t: 'equip', i: this.selected }); this.selected = -1; this.render(true);
      });
      this.armorEl.addEventListener('click', (e) => {
        const el = e.target.closest('.aslot');
        if (el && this.game.local.armor && this.game.local.armor[el.dataset.s]) { I.Net.command({ t: 'unequip', s: el.dataset.s }); this.render(true); }
      });
      this.armorEl.addEventListener('mouseover', (e) => {
        const el = e.target.closest('.aslot'), id = el && this.game.local.armor && this.game.local.armor[el.dataset.s];
        this.detail.innerHTML = id ? '<div class="inv-name">' + I.ITEMS[id].name + '</div><div class="inv-desc">' + I.ITEMS[id].desc.replace('Équipe-le depuis ton sac.', 'Clique pour l’enlever.') + '</div>' : '<div class="inv-name">&nbsp;</div><div class="inv-desc">Emplacement vide : ' + I.ARMOR.SLOT_LABEL[el ? el.dataset.s : 'head'].toLowerCase() + '.</div>';
      });
      this.armorEl.addEventListener('mouseleave', () => this.renderDetail());
      $('btn-throw').addEventListener('click', () => {
        if (this.selected < 0) return;
        I.Net.command({ t: 'throw', i: this.selected }); this.selected = -1;
        this.render(true);
      });
    },

    open: function () { this.selected = -1; this.render(true); },

    render: function (force) {
      const p = this.game.local;
      if (!p) return;
      const ak = I.armor.key(p.armor);
      if (!force && p.inv.rev === this.lastRev && ak === this.lastArm) return;
      this.lastRev = p.inv.rev; this.lastArm = ak;
      this.renderArmor(p);
      this.grid.innerHTML = '';
      for (let i = 0; i < p.inv.size; i++) {
        const s = p.inv.slots[i], d = document.createElement('div');
        d.className = 'slot' + (i < C.HOTBAR_SIZE ? ' hot' : '') + (i === this.selected ? ' picked' : '') + (i === p.sel ? ' sel' : '');
        d.dataset.i = i;
        if (s) d.innerHTML = '<img src="' + this.S.iconURL[s.id] + '" alt="' + I.ITEMS[s.id].name + '">' + (s.qty > 1 ? '<span class="qty">' + s.qty + '</span>' : '');
        this.grid.appendChild(d);
      }
      $('btn-throw').disabled = this.selected < 0;
      const sel = this.selected >= 0 && p.inv.slots[this.selected];
      $('btn-equip').disabled = !(sel && I.ARMOR.DEF[sel.id]);
      this.renderDetail();
    },

    /** Les quatre emplacements d'armure et la protection totale. */
    renderArmor: function (p) {
      const S = this.S, t = I.armor.total(p), red = Math.round(I.armor.reduction(p) * 100);
      this.armorEl.innerHTML = '<div class="aslots">' + I.ARMOR.SLOTS.map(function (s) {
        const id = p.armor && p.armor[s];
        return '<div class="slot aslot" data-s="' + s + '" title="' + I.ARMOR.SLOT_LABEL[s] + '">' + (id ? '<img src="' + S.iconURL[id] + '" alt="' + I.ITEMS[id].name + '">' : '<span class="alabel">' + I.ARMOR.SLOT_LABEL[s] + '</span>') + '</div>';
      }).join('') + '</div><div class="adef"><b>Protection ' + t + '</b><span>−' + red + ' % de dégâts</span></div>';
    },

    renderDetail: function () {
      const p = this.game.local;
      if (!p) return;
      const i = this.hover >= 0 ? this.hover : this.selected;
      const s = i >= 0 ? p.inv.slots[i] : null;
      if (!s) {
        this.detail.innerHTML = '<div class="inv-name">&nbsp;</div><div class="inv-desc">Clique sur un objet pour le sélectionner, puis sur une autre case pour le déplacer.</div>';
        return;
      }
      const def = I.ITEMS[s.id];
      this.detail.innerHTML = '<div class="inv-name">' + def.name + (s.qty > 1 ? ' ×' + s.qty : '') + '</div><div class="inv-desc">' + def.desc + '</div>';
    },

    /** Touches 1-8 dans l'inventaire : équipe la case de la barre rapide. */
    equip: function (n) { if (this.game.local) { this.game.local.sel = n; I.Net.command({ t: 'sel', n: n }); this.render(true); } },
  };
  I.InventoryUI = InventoryUI;
})((window.Iles = window.Iles || {}));
