/*
 * Écran de la table de cuisine alchimique (voir styles.css : grille de 1536 x 1024) :
 * stations (mortier, mixeur, poêle, marmite) + table à pâte (spaghetti / tarte / pain), comptoir (ingrédients choisis),
 * panneaux Ingrédients et Résultat, livre de recettes à droite, fiche de l'ingrédient survolé.
 * Le comptoir n'est qu'une sélection : rien n'est consommé tant que « Préparer » n'est pas validé (commande 'cook' exécutée par l'hôte).
 * Le four n'a qu'une station.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const C = I.cooking;
  const SIGN = { mortar: ['MORTIER', 'Réduit en poudre'], mixer: ['MIXER MÉCANIQUE', 'Fait des jus'], pan: ['POÊLE', 'Grille'], pot: ['POT / CASSEROLE', 'Soupes & Sauces'], oven: ['FOUR', 'Cuit le pain'] };
  const ART = { mortar: 'mortar', mixer: 'mixer', pan: 'pan', pot: 'pot', oven: 'bread' };
  const ORDER = { cook_table: ['mortar', 'mixer', 'pan', 'pot'], oven: ['oven'], none: ['mortar', 'mixer', 'pan', 'pot'] };
  const CAT = { fruit: 'Fruit', veg: 'Légume', herb: 'Herbe', flower: 'Fleur', grain: 'Céréale', meat: 'Viande', mush: 'Champignon', mineral: 'Minéral' };
  const TITLE = { cook_table: 'TABLE DE CUISINE ALCHIMIQUE', oven: 'FOUR DE CUISINE', none: 'LIVRE DE RECETTES' };

  function nm(id) { return I.ITEMS[id] ? I.ITEMS[id].name : id; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  const art = function (n) { return I.foodArt.stationURL(n); };

  const CookUI = {
    station: null, st: null, sel: [], form: 'tart', busy: false, sig: '', bsel: null, hover: null,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.root = $('ckw'); this.nameEl = $('cook-name'); this.noteEl = $('cook-note');
      const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
      on('cook-stations', 'click', (e) => { const b = e.target.closest('[data-t]'); if (b) this.pick(b.dataset.t); });
      on('cook-forms', 'click', (e) => { const b = e.target.closest('[data-f]'); if (b) this.pickForm(b.dataset.f); });
      on('cook-shelf', 'click', (e) => { const c = e.target.closest('[data-r]'); if (c) this.remove(+c.dataset.r); });
      on('cook-inv', 'click', (e) => { const c = e.target.closest('[data-id]'); if (c) this.add(c.dataset.id); });
      on('cook-book', 'click', (e) => { const b = e.target.closest('[data-o]'); if (b) { this.bsel = b.dataset.o; this.note(''); this.render(true); } });
      this.root.addEventListener('mouseover', (e) => { const c = e.target.closest('[data-id],[data-info]'); const id = c ? (c.dataset.id || c.dataset.info) : null; if (id && id !== this.hover) { this.hover = id; this.renderInfo(id); } });
      this.nameEl.addEventListener('input', () => { this.note(''); this.render(true); });
      on('btn-cook-name', 'click', () => { const r = $('cook-namerow'); r.classList.toggle('hidden'); if (!r.classList.contains('hidden')) this.nameEl.focus(); });
      on('btn-cook-make', 'click', () => this.make());
      on('btn-cook-clear', 'click', () => { this.sel = []; this.note(''); this.render(true); });
      on('btn-cook-repro', 'click', () => { if (this.bsel) this.repro(this.bsel); });
    },

    note: function (t, err) { this.noteEl.textContent = t || ''; this.noteEl.className = 'note' + (err ? ' err' : ''); },
    hasBook: function () { const p = this.game.local; return !!p && p.inv.count('recipe_book') > 0; },
    key: function () { return this.station || 'none'; },

    open: function (station) {
      this.station = station; this.sel = []; this.nameEl.value = ''; this.sig = ''; this.note(''); this.bsel = null; this.hover = null;
      $('cook-namerow').classList.add('hidden');
      this.st = station === 'oven' ? 'oven' : station === 'cook_table' ? 'mortar' : null;
      $('ck-title').textContent = TITLE[this.key()];
      this.render(true);
    },

    pick: function (t) {
      if (!this.station || t === this.st) return;
      this.st = t; this.sel = []; this.nameEl.value = ''; this.note(''); this.render(true);
    },
    pickForm: function (f) {
      if (this.station !== 'cook_table') { this.note('La table à pâte est sur la table de cuisine.', true); return; }
      if (this.st !== 'dough') { this.st = 'dough'; this.sel = []; this.nameEl.value = ''; }
      this.form = f; this.note(''); this.render(true);
    },

    picked: function (id) { let n = 0; this.sel.forEach(function (s) { if (s[0] === id) n += s[1]; }); return n; },

    add: function (id) {
      const p = this.game.local;
      if (!p || !id) return;
      if (!this.st) { this.note('Approche-toi d’une table de cuisine pour cuisiner.', true); return; }
      if (!C.accepts(this.st, id)) { this.note(C.TEXT.badItem, true); return; }
      if (p.inv.count(id) - this.picked(id) < 1) { this.note('Tu n’as plus de « ' + nm(id).toLowerCase() + ' » disponible.', true); return; }
      const e = this.sel.find(function (x) { return x[0] === id; });
      if (e) e[1]++; else this.sel.push([id, 1]);
      this.note(''); this.render(true);
    },

    remove: function (r) {
      const e = this.sel[r]; if (!e) return;
      e[1]--; if (e[1] <= 0) this.sel.splice(r, 1);
      this.note(''); this.render(true);
    },

    make: function () {
      if (this.busy || !this.st) return;
      const pl = C.plan(this.st, this.sel, this.form, this.nameEl.value);
      if (!pl.ok) { this.note(C.TEXT[pl.reason] || C.TEXT.bad, true); return; }
      this.busy = true;
      I.Net.command({ t: 'cook', st: this.st, items: this.sel.map(function (x) { return [x[0], x[1]]; }), form: this.form, name: this.nameEl.value }, (r) => {
        this.busy = false;
        if (r.ok) { this.sel = []; this.nameEl.value = ''; this.note('Préparé : ' + r.name + ' (dans ton sac).'); this.app.saveNow('auto'); }
        else this.note(this.why(r), true);
        this.sig = ''; this.render(true);
      });
    },

    why: function (r) {
      if (r.reason === 'missing' && r.missing) return 'Il te manque : ' + Object.keys(r.missing).map(function (id) { return r.missing[id] + ' × ' + nm(id).toLowerCase(); }).join(', ') + '.';
      if (r.reason === 'station' && r.station) return 'Il faut être près d’' + (r.station === 'oven' ? 'un four.' : 'une table de cuisine.');
      return C.TEXT[r.reason] || C.TEXT.bad;
    },

    repro: function (out) {
      if (this.busy) return;
      this.busy = true;
      I.Net.command({ t: 'repro', out: out }, (r) => {
        this.busy = false;
        if (r.ok) { this.note('Recette refaite : ' + r.name + (r.steps > 1 ? ' (' + r.steps + ' étapes)' : '') + '.'); this.app.saveNow('auto'); }
        else this.note(this.why(r), true);
        this.sig = ''; this.render(true);
      });
    },

    img: function (id) { return '<img src="' + this.S.iconURL[id] + '" alt="">'; },
    heart: function () { return '<img src="' + art('heart') + '" alt="♥">'; },

    /** Ligne de propriétés d'un objet (par part pour un plat). */
    props: function (id) {
      const d = C.dish(id), f = I.FOOD[id], v = d ? { hp: d.hp, hun: d.hun, rg: d.rg, sp: d.sp, edible: !!C.KINDS[d.k].edible } : f ? { hp: f.hp || 0, hun: f.hun || 0, rg: f.regen || 0, sp: f.speed || 0, edible: !f.noEat } : null;
      if (!v) return '';
      const out = [];
      if (v.hp) out.push('<div class="ip">' + this.heart() + ' Soin +' + v.hp + '</div>');
      if (v.edible && v.hun) out.push('<div class="ip">Faim +' + v.hun + '</div>');
      if (v.rg) out.push('<div class="ip">Régénération ' + v.rg + ' s</div>');
      if (v.sp) out.push('<div class="ip">Vitesse ' + v.sp + ' s</div>');
      return out.join('');
    },

    renderInfo: function (id) {
      const el = $('cook-info');
      if (!id || !I.ITEMS[id]) { el.innerHTML = '<div class="ic">Survole un ingrédient pour voir ses propriétés.</div>'; return; }
      const d = C.dish(id), f = I.FOOD[id], cat = d ? C.KINDS[d.k].label : f ? CAT[f.cat] || '' : '';
      el.innerHTML = '<div class="ih">' + this.img(id) + '<div><div class="in">' + esc(nm(id)) + '</div><div class="ic">' + esc(cat) + (d || f ? ' / Cuisine / Alchimie' : '') + '</div></div></div>' + this.props(id) +
        '<div class="id">' + esc((I.ITEMS[id].desc || '').split(' Se mange')[0].split(' Clic droit')[0]) + '</div>';
    },

    render: function (force) {
      const p = this.game.local;
      if (!p) return;
      // une sélection que le sac ne peut plus fournir est retirée
      this.sel = this.sel.filter(function (s) { s[1] = Math.min(s[1], p.inv.count(s[0])); return s[1] > 0; });
      const sig = p.inv.rev + '|' + p.bookRev + '|' + this.st + '|' + this.form + '|' + this.bsel + '|' + JSON.stringify(this.sel);
      if (!force && sig === this.sig) return;
      this.sig = sig;
      const key = this.key(), st = this.st, table = this.station === 'cook_table';

      // stations
      $('cook-stations').innerHTML = ORDER[key].map((t) => '<div class="ck-st' + (t === st ? ' on' : '') + (this.station ? '' : ' off') + '" data-t="' + t + '"><div class="ck-sign"><b>' + SIGN[t][0] + '</b><span>' + SIGN[t][1] + '</span></div><img src="' + art(ART[t]) + '" alt=""></div>').join('');

      // comptoir : une case par ingrédient choisi
      let shelf = '';
      for (let i = 0; i < 20; i++) {
        const s = this.sel[i];
        shelf += s ? '<div class="ck-slot" data-r="' + i + '" data-id="' + esc(s[0]) + '">' + this.img(s[0]) + (s[1] > 1 ? '<span class="n">' + s[1] + '</span>' : '') + '</div>' : '<div class="ck-slot empty"></div>';
      }
      $('cook-shelf').innerHTML = shelf;

      // table à pâte
      const dough = $('cook-dough'); dough.classList.toggle('off', !table);
      const have = (id) => p.inv.count(id) - this.picked(id);
      $('dg-flour').innerHTML = this.img('flour') + (have('flour') > 0 ? '<span class="n">' + have('flour') + '</span>' : ''); $('dg-flour').dataset.info = 'flour'; $('dg-flour').classList.toggle('dim', !have('flour'));
      $('dg-wheat').innerHTML = this.img('wheat') + (have('wheat') > 0 ? '<span class="n">' + have('wheat') + '</span>' : ''); $('dg-wheat').dataset.info = 'wheat'; $('dg-wheat').classList.toggle('dim', !have('wheat'));
      $('dg-jug').innerHTML = '<img src="' + art('jug') + '" alt="">';
      $('cook-forms').innerHTML = '<div class="ck-form-head"><b>TABLE À PÂTE</b>Que veux-tu faire ?</div>' + Object.keys(C.FORMS).map((f) => '<div class="ck-form' + (st === 'dough' && f === this.form ? ' on' : '') + '" data-f="' + f + '"><span>' + C.FORMS[f].toUpperCase() + '</span><img src="' + art(f === 'spag' ? 'spag' : f === 'tart' ? 'tart' : 'bread') + '" alt=""></div>').join('');

      // ingrédients du sac (une case par sorte, avec le total)
      const tot = {}, order = [];
      p.inv.slots.forEach(function (s) { if (!s) return; if (tot[s.id] === undefined) { tot[s.id] = 0; order.push(s.id); } tot[s.id] += s.qty; });
      const usable = order.filter(function (id) { return C.propsOf(id) || I.containers.fuelOf(id) > 0; });
      $('cook-inv').innerHTML = usable.length ? usable.map((id) => {
        const left = tot[id] - this.picked(id), ok = !st || C.accepts(st, id);
        return '<div class="ck-slot' + (ok && left > 0 ? '' : ' dim') + '" data-id="' + esc(id) + '">' + this.img(id) + (left > 0 ? '<span class="n">' + left + '</span>' : '') + '</div>';
      }).join('') : '<div class="none">Rien à cuisiner dans ton sac : cueille, récolte ou chasse !</div>';

      // résultat
      const pl = this.sel.length && st ? C.plan(st, this.sel, this.form, this.nameEl.value) : null;
      const prev = $('cook-prev');
      if (pl && pl.ok) {
        const o = pl.outs[0], it = I.ITEMS[o.id], d = C.dish(o.id), f = I.FOOD[o.id];
        let lines = '';
        if (d && C.KINDS[d.k].edible) lines = '<div class="hp">Nourriture ' + (d.hp ? '+' + d.hp + ' ' + this.heart() : '') + (d.m > 1 ? ' · ' + d.m + ' parts' : '') + '</div><div class="dim">Faim +' + d.hun + (d.rg ? ' · Rég. ' + d.rg + 's' : '') + (d.sp ? ' · Vit. ' + d.sp + 's' : '') + '</div>';
        else lines = '<div>Ingrédient de cuisine</div>' + (f ? '<div class="dim">Base des pâtes, tartes et pains</div>' : '<div class="dim">À mélanger ou à cuire</div>');
        prev.innerHTML = '<div class="pic">' + this.img(o.id) + '</div><div><div class="pn">' + esc(it.name) + (pl.outs.length > 1 || o.qty > 1 ? ' ×' + o.qty : '') + '</div>' + lines + '</div>';
      } else prev.innerHTML = pl ? '<div class="err">' + esc(C.TEXT[pl.reason] || C.TEXT.bad) + '</div>' : '<div class="dim">' + (st ? 'Clique des ingrédients de ton sac : le résultat s’affiche ici.' : 'Utilise une table de cuisine pour préparer des plats.') + '</div>';
      $('btn-cook-make').disabled = !(pl && pl.ok);
      $('btn-cook-clear').disabled = !this.sel.length;

      this.renderBook(p);
      if (!this.hover) this.renderInfo(null);
    },

    renderBook: function (p) {
      const book = $('cook-book'), btn = $('btn-cook-repro'), miss = $('cook-miss');
      miss.textContent = ''; btn.disabled = true;
      if (!this.hasBook()) { book.innerHTML = '<div class="bk-empty">Pas de livre dans ton sac. Fabrique-en un à la main (2 planches + 3 fibres) : chaque plat que tu prépares s’y écrira tout seul.</div>'; return; }
      if (!(p.book && p.book.length)) { book.innerHTML = '<div class="bk-empty">Aucune recette notée pour l’instant. Prépare un plat : il s’écrit ici tout seul, avec ses étapes.</div>'; return; }
      if (!this.bsel || !p.book.some((e) => e.o === this.bsel)) this.bsel = null;
      book.innerHTML = p.book.map((e) => {
        const r = C.planRepro(p, e.o), seen = [];
        e.it.forEach(function (x) { if (seen.indexOf(x[0]) < 0) seen.push(x[0]); });
        if (e.o === this.bsel) {
          btn.disabled = !r.ok || this.busy;
          miss.textContent = r.ok ? 'Étapes : ' + r.steps.map(function (s) { return C.STATIONS[s.st].name; }).join(' → ') : 'Il manque : ' + Object.keys(r.missing).map(function (id) { return r.missing[id] + ' × ' + nm(id).toLowerCase(); }).join(', ');
        }
        return '<div class="bk-entry' + (e.o === this.bsel ? ' on' : '') + (r.ok ? '' : ' lack') + '" data-o="' + esc(e.o) + '" data-info="' + esc(e.o) + '"><div class="pic">' + this.img(e.o) + '</div><div class="txt"><div class="nm">' + esc(nm(e.o)) + '</div><div class="ings">' + seen.slice(0, 4).map((id) => this.img(id)).join('') + '</div></div><div class="ok"><img src="' + art('star') + '" alt=""></div></div>';
      }).join('');
    },
  };
  I.CookUI = CookUI;
})((window.Iles = window.Iles || {}));
