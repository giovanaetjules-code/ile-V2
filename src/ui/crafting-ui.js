/*
 * Écran d'artisanat : « à la main » (touche C) ou « à l'établi » (E devant l'établi). Ne fabrique rien lui-même : il appelle app.craft.
 * Mise en page : onglets de catégories, grille de cartes (pages de 12), fiche de la recette choisie (icône, description, caractéristiques,
 * ingrédients avec « possédé / nécessaire », quantité, bouton Fabriquer) et choix de la couleur des matériaux.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const PER_PAGE = 12;
  // catégories : icône de l'onglet (identifiant d'objet), libellé
  const TABS = [
    { id: 'all', label: 'Tout', icon: null },
    { id: 'tools', label: 'Outils', icon: 'axe_iron' },
    { id: 'armor', label: 'Armures', icon: 'chest_iron' },
    { id: 'build', label: 'Construction', icon: 'workbench' },
    { id: 'decor', label: 'Décoration', icon: null },
    { id: 'mat', label: 'Matériaux', icon: 'plank' },
    { id: 'misc', label: 'Spécial', icon: 'rope' },
  ];
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  const CraftingUI = {
    station: 'hand', c: 0, tab: 'all', page: 0, sel: null, qty: 1, // c : couleur des matériaux utilisés (0 = naturels)
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.list = $('craft-list'); this.noteEl = $('craft-note');
      this.tabsEl = $('craft-tabs'); this.detail = $('craft-detail'); this.pager = $('craft-pager'); this.colorsEl = $('craft-colors');
      this.sig = ''; this.decor = {};
      I.DECOR_RECIPES.forEach((r) => { this.decor[r.id] = true; });
      this.tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) { this.tab = b.dataset.tab; this.page = 0; this.render(true); } });
      this.list.addEventListener('click', (e) => { const b = e.target.closest('button[data-sel]'); if (b) { this.sel = b.dataset.sel; this.qty = 1; this.render(true); } });
      this.colorsEl.addEventListener('click', (e) => { const k = e.target.closest('button[data-col]'); if (k) { this.c = +k.dataset.col; this.render(true); } });
      this.pager.addEventListener('click', (e) => { const b = e.target.closest('button[data-pg]'); if (b && !b.disabled) { this.page += +b.dataset.pg; this.render(true); } });
      this.detail.addEventListener('click', (e) => {
        const q = e.target.closest('button[data-q]'), go = e.target.closest('button[data-id]');
        if (q && !q.disabled) { this.qty = Math.max(1, Math.min(this.qmax || 1, this.qty + +q.dataset.q)); this.render(true); }
        else if (go && !go.disabled) this.app.craft(go.dataset.id, +go.dataset.c | 0, this.qty);
      });
    },

    open: function (station) {
      this.station = station; this.sig = ''; this.noteEl.textContent = ''; this.noteEl.className = 'note'; this.qty = 1; this.page = 0;
      $('craft-title').textContent = station === 'bench' ? 'Établi' : 'Artisanat à la main';
      $('craft-sub').textContent = station === 'bench' ? 'Toutes les recettes sont disponibles ici.' : 'Les recettes marquées « établi » se fabriquent près d’un établi.';
      this.render(true);
    },

    feedback: function (r, id, n) {
      const names = { full: 'Ton sac est plein : fais de la place d’abord.', ingredients: 'Il te manque des ingrédients.', locked: 'Recette pas encore découverte.', color: 'Cette couleur ne convient pas ici.', done: 'Déjà fait.', req: 'Il faut d’abord le Sac renforcé.', station: 'Il faut un établi pour ça.' };
      if (n > 0) { const R = I.crafting.BY_ID[id]; this.noteEl.textContent = 'Fabriqué : ' + I.crafting.nameOf(R, I.crafting.colorOk(R, this.c) ? this.c : 0) + (n > 1 ? ' ×' + n : '') + (r.ok ? '' : ' — ' + (names[r.reason] || 'arrêt')); this.noteEl.className = 'note'; }
      else { this.noteEl.textContent = names[r.reason] || 'Impossible.'; this.noteEl.className = 'note err'; }
    },

    /** Choisit une recette (onglet « Tout », page qui la contient) : utilisé par les tests et par d'autres écrans. */
    select: function (id) { this.tab = 'all'; this.sel = id; this.qty = 1; this.jump = true; this.render(true); },

    /** Catégorie d'une recette. */
    catOf: function (r) {
      if (r.kind === 'upgrade') return 'misc';
      if (/^(axe|pickaxe)_/.test(r.id)) return 'tools';
      if (r.out && I.ARMOR.DEF[r.out.id]) return 'armor';
      if (this.decor[r.id]) return 'decor';
      if (r.out && (r.out.id === 'plank' || r.out.id === 'rope' || /_ore$/.test(r.out.id))) return 'mat';
      return 'build';
    },
    icon: function (id) { const u = this.S.iconURL[id]; return u ? '<img src="' + u + '" alt="">' : ''; },

    render: function (force) {
      const p = this.game.local, st = this.game.state;
      if (!p) return;
      const owned = {}; // couleurs dont on possède au moins un matériau
      for (const s of p.inv.slots) { const it = s && I.ITEMS[s.id]; if (it && it.c) owned[it.c] = true; }
      if (this.c && !owned[this.c]) this.c = 0;
      const sig = this.c + '|' + Object.keys(owned).join(',') + '|' + p.inv.rev + '|' + st.progress.recipes.join(',') + '|' + JSON.stringify(st.progress.flags) + '|' + this.station + '|' + this.tab + '|' + this.page + '|' + this.sel + '|' + this.qty;
      if (!force && sig === this.sig) return;
      this.sig = sig;
      const C = I.crafting, station = this.station, self = this;

      // ----- entrées : recettes connues (toutes catégories), puis « à découvrir » regroupées par indice -----
      const entries = [], unknown = {};
      for (const r of C.RECIPES) {
        if (!C.isKnown(st, r)) {
          if (r.hidden) continue; // recettes secrètes (minerais des dimensions) : rien n'est dévoilé avant la trouvaille
          const h = r.learn.hint; (unknown[h] = unknown[h] || { hint: h, n: 0, key: '?' + h }).n++;
          continue;
        }
        const rc = C.colorOk(r, this.c) ? this.c : 0;
        entries.push({ r: r, rc: rc, cat: this.catOf(r), avail: C.available(station, r), done: C.isDone(st, r), miss: C.missing(p, r, rc), name: C.nameOf(r, rc) });
      }
      entries.sort(function (a, b) { return (a.avail ? 0 : 1) - (b.avail ? 0 : 1) || (a.r.station === 'hand' ? 0 : 1) - (b.r.station === 'hand' ? 0 : 1); });
      const unk = Object.keys(unknown).map(function (k) { return unknown[k]; });

      // ----- onglets -----
      const count = {}; entries.forEach(function (e) { count[e.cat] = (count[e.cat] || 0) + 1; });
      if (this.tab !== 'all' && !count[this.tab]) this.tab = 'all';
      this.tabsEl.innerHTML = TABS.filter(function (t) { return t.id === 'all' || count[t.id]; }).map(function (t) {
        const ic = t.icon || (t.id === 'decor' ? (self.S.iconURL.statue ? 'statue' : null) : null);
        return '<button class="ctab' + (t.id === self.tab ? ' on' : '') + '" data-tab="' + t.id + '" title="' + t.label + '">' + (ic && self.S.iconURL[ic] ? '<img src="' + self.S.iconURL[ic] + '" alt="">' : '<span>' + (t.id === 'all' ? '★' : t.label[0]) + '</span>') + '</button>';
      }).join('') + '<div class="ctab-name">' + (TABS.find(function (t) { return t.id === self.tab; }) || TABS[0]).label + '</div>';

      // ----- grille -----
      const shown = this.tab === 'all' ? entries : entries.filter(function (e) { return e.cat === self.tab; });
      const cards = shown.map(function (e) { return { key: e.r.id, e: e }; });
      if (this.tab === 'all') unk.forEach(function (u) { cards.push({ key: u.key, u: u }); });
      const pages = Math.max(1, Math.ceil(cards.length / PER_PAGE));
      if (this.jump) { const at = cards.findIndex(function (c) { return c.key === self.sel; }); if (at >= 0) this.page = Math.floor(at / PER_PAGE); this.jump = false; }
      this.page = Math.max(0, Math.min(pages - 1, this.page));
      if (!this.sel || !cards.some(function (c) { return c.key === self.sel; })) { this.sel = cards.length ? cards[0].key : null; this.qty = 1; }
      this.list.innerHTML = cards.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).map(function (c) {
        const on = c.key === self.sel ? ' sel' : '';
        if (c.u) return '<button class="rcard locked' + on + '" data-sel="' + esc(c.key) + '"><div class="rc-ic unknown">?</div><div class="rc-name">À découvrir' + (c.u.n > 1 ? ' ×' + c.u.n : '') + '</div></button>';
        const e = c.e, r = e.r, ok = e.avail && !e.done && !e.miss.length;
        return '<button class="rcard' + on + (e.done ? ' done' : '') + (!e.avail ? ' off' : '') + (ok ? ' can' : '') + '" data-sel="' + r.id + '" data-recipe="' + r.id + '"><div class="rc-ic">' + self.icon(r.out && e.rc ? C.outIdOf(r, e.rc) : C.iconOf(r)) + '</div><div class="rc-name">' + esc(e.name) + '</div>' +
          (!e.avail ? '<span class="rc-tag">établi</span>' : e.done ? '<span class="rc-tag ok">fait</span>' : ok ? '<span class="rc-dot" title="Tu peux le fabriquer"></span>' : '') + '</button>';
      }).join('') || '<div class="craft-empty">Rien dans cette catégorie pour l’instant.</div>';
      this.pager.innerHTML = '<button class="pg" data-pg="-1"' + (this.page <= 0 ? ' disabled' : '') + '>◀</button><span id="craft-page">' + (this.page + 1) + '/' + pages + '</span><button class="pg" data-pg="1"' + (this.page >= pages - 1 ? ' disabled' : '') + '>▶</button>';
      this.pager.classList.toggle('hidden', pages <= 1);

      // ----- choix de la couleur des matériaux (la couleur vient des matériaux possédés) -----
      this.colorsEl.innerHTML = Object.keys(owned).length ? '<span class="cc-label">Matériaux :</span>' +
        [0].concat(I.COLORS.map(function (c, i) { return i + 1; }).filter(function (c) { return owned[c]; })).map(function (c) {
          return '<button class="cchip' + (c === self.c ? ' on' : '') + '" data-col="' + c + '">' + (c ? '<i style="background:rgb(' + I.COLORS[c - 1].rgb.join(',') + ')"></i>' : '') + I.tint.name(c) + '</button>';
        }).join('') : '';
      this.colorsEl.classList.toggle('hidden', !Object.keys(owned).length);

      // ----- fiche de la recette choisie -----
      const cur = cards.find(function (c) { return c.key === self.sel; });
      if (!cur) { this.detail.innerHTML = '<div class="craft-empty">Aucune recette.</div>'; this.qmax = 1; return; }
      if (cur.u) {
        this.detail.innerHTML = '<div class="dt-head"><div class="dt-ic unknown">?</div><div class="dt-title"><div class="dt-name">' + (cur.u.n > 1 ? cur.u.n + ' recettes' : 'Une recette') + ' à découvrir</div></div></div><div class="dt-desc">' + esc(cur.u.hint) + '</div>';
        this.qmax = 1; return;
      }
      const e = cur.e, r = e.r, item = I.ITEMS[r.out ? C.outIdOf(r, e.rc) : r.icon] || {}, oid = r.out ? C.outIdOf(r, e.rc) : null;
      let stats = '';
      if (item.tool) stats += '<div class="dt-stat"><b>Niveau d’outil</b><span>' + (item.tier !== undefined ? item.tier : 1) + '</span></div>' + (item.power ? '<div class="dt-stat"><b>Efficacité</b><span>×' + item.power + '</span></div>' : '');
      if (item.armor) stats += '<div class="dt-stat"><b>Protection</b><span>+' + item.armor.ap + '</span></div>';
      if (r.out && r.out.qty > 1) stats += '<div class="dt-stat"><b>Quantité obtenue</b><span>×' + r.out.qty + '</span></div>';
      if (item.place) stats += '<div class="dt-stat"><b>Usage</b><span>À poser dans le monde</span></div>';
      if (item.light) stats += '<div class="dt-stat"><b>Lumière</b><span>Éclaire la nuit</span></div>';
      stats += '<div class="dt-stat"><b>Fabrication</b><span>' + (r.station === 'bench' ? 'À l’établi' : 'À la main') + '</span></div>';
      const ins = C.insOf(r, e.rc), single = r.kind === 'upgrade' || e.done;
      let qmax = 99; // quantité maximale réalisable avec le sac
      for (const ing of ins) qmax = Math.min(qmax, Math.floor(C.have(p, r, ing[0]) / ing[1]));
      this.qmax = single ? 1 : Math.max(1, qmax); this.qty = Math.max(1, Math.min(this.qmax, this.qty));
      const q = single ? 1 : this.qty;
      const rows = ins.map(function (ing) {
        const have = C.have(p, r, ing[0]), need = ing[1] * q, ok = have >= need;
        return '<div class="ing-row ' + (ok ? 'ok' : 'no') + '">' + self.icon(ing[0]) + '<span class="ir-name">' + esc(I.ITEMS[ing[0]].name) + '</span><span class="ir-n">' + have + '/' + need + (ok ? ' <em>✔</em>' : '') + '</span></div>';
      }).join('');
      const needReq = !!(r.req && !st.progress.flags[r.req]), can = e.avail && !e.done && !e.miss.length && !needReq;
      this.detail.innerHTML =
        '<div class="dt-head"><div class="dt-ic">' + this.icon(r.out && e.rc ? C.outIdOf(r, e.rc) : C.iconOf(r)) + '</div><div class="dt-title"><div class="dt-name">' + esc(e.name) + (r.out && r.out.qty > 1 ? ' <small>×' + r.out.qty + '</small>' : '') + '</div>' +
        '<div class="dt-sub">' + esc(TABS.find(function (t) { return t.id === e.cat; }).label) + (r.station === 'bench' ? ' · établi' : '') + '</div></div></div>' +
        '<div class="dt-desc">' + esc(C.descOf(r, e.rc)) + '</div><div class="dt-stats">' + stats + '</div>' +
        '<div class="dt-ings-title">Ingrédients</div><div class="dt-ings">' + rows + '</div>' +
        (single ? '' : '<div class="dt-qty"><button class="qb" data-q="-1"' + (this.qty <= 1 ? ' disabled' : '') + '>−</button><span class="qn">' + this.qty + '</span><button class="qb" data-q="1"' + (this.qty >= this.qmax ? ' disabled' : '') + '>+</button></div>') +
        '<button class="btn go" id="craft-do" data-id="' + r.id + '" data-c="' + e.rc + '"' + (can ? '' : ' disabled') + '>' + (e.done ? 'Fait' : !e.avail ? 'À l’établi' : needReq ? 'Sac renforcé requis' : 'Fabriquer') + '</button>';
    },
  };
  I.CraftingUI = CraftingUI;
})((window.Iles = window.Iles || {}));
