/*
 * Écran de la Table du Forgeron : choix du modèle d'arme, trois emplacements (une partie de l'arme chacun), aperçu en direct, « Fabriquer ».
 * L'écran ne consomme rien : les matériaux restent dans le sac tant que la fabrication n'est pas validée (app.forge -> commande 'forge').
 * Les emplacements ne sont qu'une sélection : refuser un objet incompatible ne le touche donc jamais.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const MSG = {
    incompatible: 'Cet objet ne peut pas être utilisé pour fabriquer une arme.',
    incomplete: 'Remplis les trois emplacements pour forger cette arme.',
    full: 'Ton sac est plein : fais de la place d’abord.', ingredients: 'Il te manque des matériaux.', far: 'Tu es trop loin de la table.', bad: 'Impossible.',
  };
  const PART_WHY = { ore: 'Un minerai brut est trop friable pour une lame : fonds-le d’abord en lingot.', rope: 'Une corde ne peut servir que de poignée ou de milieu.', crystal: 'Un cristal ne se tient pas en main : place-le plus loin dans l’arme.' };

  const ForgeUI = {
    id: null, model: 'sword', slots: [null, null, null], target: null,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.models = $('forge-models'); this.slotsEl = $('forge-slots'); this.prev = $('forge-prev'); this.info = $('forge-info'); this.inv = $('forge-inv'); this.noteEl = $('forge-note');
      this.sig = ''; this.busy = false;
      this.models.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (b) this.pick(b.dataset.m);
      });
      this.slotsEl.addEventListener('click', (e) => {
        const c = e.target.closest('[data-s]');
        if (!c) return;
        const i = +c.dataset.s;
        if (this.slots[i]) { this.slots[i] = null; this.target = i; } else this.target = this.target === i ? null : i; // vide : choisit l'emplacement visé
        this.note(''); this.render(true);
      });
      this.inv.addEventListener('click', (e) => {
        const c = e.target.closest('[data-i]');
        if (c) this.place(+c.dataset.i);
      });
      $('btn-forge-clear').addEventListener('click', () => { this.slots = [null, null, null]; this.target = null; this.note(''); this.render(true); });
      $('btn-forge-make').addEventListener('click', () => this.make());
    },

    note: function (t, err) { this.noteEl.textContent = t || ''; this.noteEl.className = 'note' + (err ? ' err' : ''); },

    open: function (id) { this.id = id; this.slots = [null, null, null]; this.target = null; this.sig = ''; this.note(''); this.render(true); },

    /** Change de modèle : les matériaux qui ne conviennent plus à leur nouvelle partie retournent dans le sac (ils n'en sont jamais sortis). */
    pick: function (m) {
      if (!I.FORGE.MODELS[m] || m === this.model) return;
      this.model = m;
      let dropped = 0;
      this.slots = this.slots.map((id, i) => { if (id && !I.forge.fits(m, i, id)) { dropped++; return null; } return id; });
      this.target = null;
      this.note(dropped ? dropped + ' matériau' + (dropped > 1 ? 'x' : '') + ' retiré' + (dropped > 1 ? 's' : '') + ' : il ne convient pas à cette partie.' : '');
      this.render(true);
    },

    placed: function (id) { return this.slots.filter(function (s) { return s === id; }).length; },

    /** Pose un matériau du sac dans l'emplacement visé (ou le premier vide qui l'accepte). Refuse sans toucher au sac. */
    place: function (i) {
      const p = this.game.local, s = p && p.inv.slots[i];
      if (!s) return;
      if (!I.forge.accepts(s.id)) { this.note(MSG.incompatible, true); return; }
      if (p.inv.count(s.id) - this.placed(s.id) < 1) { this.note('Tu n’as plus de ' + I.ITEMS[s.id].name.toLowerCase() + ' disponible.', true); return; }
      const M = I.FORGE.MODELS[this.model];
      let t = this.target;
      if (t === null) {
        const empty = [0, 1, 2].filter((k) => !this.slots[k]);
        if (!empty.length) { this.note('Les trois emplacements sont pleins : retire un matériau (clique dessus).', true); return; }
        t = empty.find((k) => I.forge.fits(this.model, k, s.id));
        if (t === undefined) t = empty[0]; // aucun ne convient : on explique pourquoi sur le premier vide
      }
      if (!I.forge.fits(this.model, t, s.id)) {
        const base = I.mat.split(s.id).base;
        this.note('Ce matériau ne peut pas former « ' + M.slots[t].label.toLowerCase() + ' ». ' + (PART_WHY[I.FORGE.MAT[base].kind === 'gem' ? 'crystal' : I.FORGE.MAT[base].kind] || ''), true);
        return;
      }
      this.slots[t] = s.id; this.target = null; this.note(''); this.render(true);
    },

    make: function () {
      const a = I.forge.analyze(this.model, this.slots);
      if (!a.ok || this.busy) return;
      this.busy = true;
      this.app.forge(this.id, this.model, this.slots.slice(), (r) => {
        this.busy = false;
        if (r.ok) { this.slots = [null, null, null]; this.target = null; this.note('Fabriqué : ' + r.name + ' (dans ton sac).'); }
        else this.note(MSG[r.reason] || MSG.bad, true);
        this.render(true);
      });
    },

    icon: function (id) {
      return '<div class="slot">' + (id ? '<img src="' + this.S.iconURL[id] + '" alt="" title="' + I.ITEMS[id].name + '">' : '') + '</div>';
    },

    render: function (force) {
      const p = this.game.local;
      if (!p) return;
      // une sélection que le sac ne peut plus fournir (objet jeté, déposé…) est retirée
      const left = {};
      this.slots = this.slots.map(function (id) {
        if (!id) return null;
        left[id] = (left[id] === undefined ? p.inv.count(id) : left[id]) - 1;
        return left[id] >= 0 ? id : null;
      });
      const sig = p.inv.rev + '|' + this.model + '|' + this.slots.join(',') + '|' + this.target;
      if (!force && sig === this.sig) return;
      this.sig = sig;
      const S = this.S, F = I.FORGE, M = F.MODELS[this.model], a = I.forge.analyze(this.model, this.slots);

      // modèles : une carte par arme, avec son profil dessiné en fantôme
      this.models.innerHTML = F.MODEL_ORDER.map((m) => {
        const ghost = I.forgeArt.weaponCanvas(I.forge.analyze(m, [null, null, null])).toDataURL(), mm = F.MODELS[m];
        return '<button class="fmodel' + (m === this.model ? ' on' : '') + '" data-m="' + m + '" title="' + mm.desc + '"><img src="' + ghost + '" alt=""><span>' + mm.name + '</span></button>';
      }).join('');

      this.slotsEl.innerHTML = this.slots.map((id, i) =>
        '<div class="fcol"><div class="fslot' + (this.target === i ? ' target' : '') + '" data-s="' + i + '">' + this.icon(id) + '<span class="fnum">' + (i + 1) + '</span></div><div class="flabel">' + M.slots[i].label + '</div></div>' + (i < 2 ? '<span class="farrow">→</span>' : '')).join('');

      this.prev.innerHTML = '<img src="' + I.forgeArt.weaponCanvas(a).toDataURL() + '" alt="">';
      if (a.ok) {
        const st = a.stats;
        const parts = a.pieces.map(function (pc, k) {
          return '<div class="fpart"><span class="sw" style="background:' + I.forgeArt.css(pc) + '"></span>' + M.slots[k].label + ' — ' + I.ITEMS[pc.id].name + '</div>';
        }).join('');
        this.info.innerHTML = '<div class="fname" style="color:' + st.rarity.color + '">' + a.name + '</div><div class="fsub">' + a.typeName + ' · ' + st.rarity.name + (a.tags.length ? ' · ' + a.tags.join(', ') : '') + '</div>' +
          '<div class="fstats"><span>Dégâts <b>' + st.dmg + '</b></span><span>Durabilité <b>' + st.dur + '</b></span><span>Poids <b>' + st.wt + '</b></span><span>Vitesse <b>' + st.spd + '/s</b></span></div>' + parts;
      } else {
        this.info.innerHTML = '<div class="fname">' + M.name + '</div><div class="fsub">' + M.desc + ' ' + MSG.incomplete + '</div>';
      }
      $('btn-forge-make').disabled = !a.ok;

      const rem = {};
      this.slots.forEach(function (id) { if (id) rem[id] = (rem[id] || 0) + 1; });
      this.inv.innerHTML = p.inv.slots.map((s, i) => {
        if (!s) return '<div class="slot" data-i="' + i + '"></div>';
        const used = Math.min(s.qty, rem[s.id] || 0); rem[s.id] = (rem[s.id] || 0) - used;
        const shown = s.qty - used;
        return '<div class="slot' + (I.forge.accepts(s.id) ? '' : ' bad') + (shown ? '' : ' used') + '" data-i="' + i + '"><img src="' + S.iconURL[s.id] + '" alt="" title="' + I.ITEMS[s.id].name + '">' + (shown > 1 ? '<span class="qty">' + shown + '</span>' : '') + '</div>';
      }).join('');
    },
  };
  I.ForgeUI = ForgeUI;
})((window.Iles = window.Iles || {}));
