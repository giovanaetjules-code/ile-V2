/* HUD : horloge, barre rapide, bulle d'interaction, messages. Ne modifie jamais l'état du jeu. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const C = I.config;

  const HUD = {
    init: function (game, S) {
      this.game = game; this.S = S;
      this.el = { hud: $('hud'), time: $('clock-time'), day: $('clock-day'), icon: $('clock-icon'), hotbar: $('hotbar'), prompt: $('prompt'), promptText: $('prompt-text'), toasts: $('toasts'), dialog: $('dialog'), dTitle: $('dialog-title'), dText: $('dialog-text'), help: $('help'), save: $('savebadge') };
      this.lastClock = ''; this.lastRev = -1; this.lastSel = -1; this.lastPrompt = null; this.lastAbKey = null; this.el.ab = $('abilities'); Object.assign(this.el, { barHp: $('bar-hp'), barHun: $('bar-hun'), txtHp: $('txt-hp'), txtHun: $('txt-hun'), buffs: $('buffs') }); this.lastVit = '';
      this.toastMap = {}; this.msgAt = 0; this.noToolAt = 0; this.fullAt = 0;
      this.helpWanted = true; this.helpUntil = 0;
      this.dialogOpen = false;
      this.el.hotbar.addEventListener('click', (e) => {
        const s = e.target.closest('.slot');
        if (s && this.game.local) { this.game.local.sel = +s.dataset.i; I.Net.command({ t: 'sel', n: +s.dataset.i }); this.lastSel = -1; }
      });
    },

    show: function (v) { this.el.hud.classList.toggle('hidden', !v); if (!v) this.closeDialog(); },

    setHelp: function (enabled) { this.helpWanted = enabled; this.refreshHelp(); },
    toggleHelp: function () { this.helpWanted = !this.helpWanted; this.refreshHelp(); return this.helpWanted; },
    refreshHelp: function () { this.el.help.classList.toggle('hidden', !this.helpWanted); },

    toast: function (text, cls, key) {
      const box = this.el.toasts;
      let el = key ? this.toastMap[key] : null;
      if (el && el.parentNode) { el.dataset.n = (+el.dataset.n || 0); }
      if (!el || !el.parentNode) {
        el = document.createElement('div');
        el.className = 'toast panel small ' + (cls || '');
        box.appendChild(el);
        if (key) this.toastMap[key] = el;
        while (box.children.length > 5) box.removeChild(box.firstChild);
      }
      el.dataset.life = '3.2';
      return el;
    },

    pickup: function (item, qty) {
      const key = 'pk:' + item;
      const prev = this.toastMap[key];
      const total = (prev && prev.parentNode ? +prev.dataset.qty : 0) + qty;
      const el = this.toast('', 'pickup', key);
      el.dataset.qty = total;
      el.innerHTML = '<img src="' + this.S.iconURL[item] + '" alt=""><span>+' + total + ' ' + I.ITEMS[item].name + '</span>';
    },

    message: function (text, cls) {
      const el = this.toast('', cls || 'info', 'msg:' + text);
      el.textContent = text;
    },

    say: function (title, text) {
      this.el.dTitle.textContent = title; this.el.dText.textContent = text;
      this.el.dialog.classList.remove('hidden'); this.dialogOpen = true;
    },
    closeDialog: function () { this.el.dialog.classList.add('hidden'); this.dialogOpen = false; },

    saving: function (state, text) {
      const b = this.el.save;
      b.textContent = text; b.classList.toggle('hidden', !state);
      b.classList.toggle('err', state === 'err');
      clearTimeout(this._saveT);
      if (state !== 'err') this._saveT = setTimeout(function () { b.classList.add('hidden'); }, 1800);
      else this._saveT = setTimeout(function () { b.classList.add('hidden'); }, 6000);
    },

    onEvent: function (e, now) {
      if (e.pid !== this.game.localId) return;
      switch (e.type) {
        case 'pickup': this.pickup(e.item, e.qty); break;
        case 'msg': this.message(e.text); break;
        case 'craft': this.message('Fabriqué : ' + e.name + (e.qty > 1 ? ' ×' + e.qty : ''), 'info'); break;
        case 'learn': this.message('Nouvelle recette : ' + e.name + ' (touche C ou établi)', 'info'); break;
        case 'say': this.say(e.title, e.text); break;
        case 'noTool': if (now - this.noToolAt > 6000) { this.noToolAt = now; this.message('Choisis un outil dans ta barre rapide (1-8).'); } break;
        case 'invFull': if (now - this.fullAt > 4000) { this.fullAt = now; this.message('Ton sac est plein !', 'warn'); } break;
      }
    },

    /** Barres de vie et de faim + effets temporaires (mises à jour seulement si la valeur affichée change). */
    updateVitals: function (p) {
      const hp = Math.round(p.hp), hun = Math.round(p.hun), bf = p.buff ? (p.buff.regen > 0 ? 'R' : '') + (p.buff.speed > 0 ? 'V' : '') : '', k = hp + '|' + hun + '|' + bf;
      if (k === this.lastVit) return;
      this.lastVit = k;
      const e = this.el, M = I.vitals;
      e.barHp.style.width = (100 * hp / M.MAXHP) + '%'; e.barHun.style.width = (100 * hun / M.MAXHUN) + '%';
      e.txtHp.textContent = 'Vie ' + hp; e.txtHun.textContent = 'Faim ' + hun;
      e.barHp.parentNode.classList.toggle('low', hp < 25); e.barHun.parentNode.classList.toggle('low', hun < 15);
      e.buffs.innerHTML = (bf.indexOf('R') >= 0 ? '<b>Régénération</b>' : '') + (bf.indexOf('V') >= 0 ? '<b>Vitesse</b>' : '');
    },

    update: function (dt) {
      const g = this.game, p = g.local, st = g.state;
      if (!p) return;
      const m = st.time.minutes, clock = I.timeutil.clock(m) + '|' + I.timeutil.day(m);
      if (clock !== this.lastClock) {
        this.lastClock = clock;
        this.el.time.textContent = I.timeutil.clock(m); this.el.day.textContent = 'Jour ' + I.timeutil.day(m);
        const h = I.timeutil.hour(m);
        this.el.icon.className = h >= 6 && h < 19.5 ? 'sun' : 'moon';
      }
      if (p.inv.rev !== this.lastRev || p.sel !== this.lastSel) this.renderHotbar(p);
      this.updateAbilities(p);
      this.updateVitals(p);
      const held = p.inv.slots[p.sel], hid = held && I.ITEMS[held.id].place ? held.id : null;
      if (hid && hid !== this.lastPlaceHint) this.message('Clic gauche : poser · clic droit : retirer');
      this.lastPlaceHint = hid;
      const label = p.target && !this.dialogOpen ? p.target.label : null;
      if (label !== this.lastPrompt) {
        this.lastPrompt = label;
        this.el.prompt.classList.toggle('hidden', !label);
        if (label) this.el.promptText.textContent = label;
      }
      if (this.dialogOpen && !p.target) this.closeDialog();

      for (const el of Array.from(this.el.toasts.children)) {
        const life = +el.dataset.life - dt;
        el.dataset.life = life;
        if (life < 0.4) el.classList.add('fade');
        if (life <= 0) el.parentNode.removeChild(el);
      }
    },

    /** Barre des capacités de l'arme tenue (R, F, V) : nom, recharge. */
    updateAbilities: function (p) {
      const held = p.inv.slots[p.sel], a = held && held.id.indexOf('wp:') === 0 ? I.forge.weapon(held.id) : null, key = a ? held.id : '', box = this.el.ab;
      if (key !== this.lastAbKey) {
        this.lastAbKey = key; box.innerHTML = '';
        if (a) for (let i = 0; i < 3; i++) {
          const d = I.COMBAT.AB[a.model][i], el = document.createElement('div');
          el.className = 'ab ready'; el.title = d.n + ' — ' + d.d + ' (recharge ' + d.cd + ' s)';
          el.innerHTML = '<span class="k">' + I.COMBAT.KEYS[i] + '</span><span class="n">' + d.n + '</span><span class="t"></span><span class="f"></span>';
          box.appendChild(el);
        }
      }
      if (!a) return;
      const kids = box.children;
      for (let i = 0; i < 3 && i < kids.length; i++) {
        const cd = p.cb && p.cb.cd ? p.cb.cd[i] : 0, mx = I.COMBAT.AB[a.model][i].cd, el = kids[i];
        el.classList.toggle('ready', cd <= 0);
        el.lastChild.style.height = cd > 0 ? Math.round(100 * Math.min(1, cd / mx)) + '%' : '0';
        el.children[2].textContent = cd > 0 ? cd.toFixed(1) : '';
      }
    },

    renderHotbar: function (p) {
      this.lastRev = p.inv.rev; this.lastSel = p.sel;
      const h = this.el.hotbar; h.innerHTML = '';
      for (let i = 0; i < C.HOTBAR_SIZE; i++) {
        const s = p.inv.slots[i], d = document.createElement('div');
        d.className = 'slot' + (i === p.sel ? ' sel' : ''); d.dataset.i = i;
        d.innerHTML = '<span class="key">' + (i + 1) + '</span>' + (s ? '<img src="' + this.S.iconURL[s.id] + '" alt="' + I.ITEMS[s.id].name + '">' + (s.qty > 1 ? '<span class="qty">' + s.qty + '</span>' : '') : '');
        if (s) d.title = I.ITEMS[s.id].name;
        h.appendChild(d);
      }
    },
  };
  I.HUD = HUD;
})((window.Iles = window.Iles || {}));
