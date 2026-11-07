/*
 * Écran des tables d'enchantement et de désenchantement (même écran, deux modes).
 * Une arme au centre d'un cercle arcanique, jusqu'à deux pierres de chaque côté ; la scène (canvas) et les lueurs prennent la couleur des pierres.
 * Rien n'est consommé avant la validation : les emplacements ne sont qu'une sélection de cases du sac. Au clic, une animation d'environ 2,6 s
 * se joue ; la commande ('enchant' / 'disenchant', voir systems/enchant.js) part au moment du flash et l'hôte la valide.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const VIO = [183, 156, 255];
  const MSG = { far: 'Tu es trop loin de la table.', weapon: 'Cette arme ne convient pas.', stone: 'Pierre invalide.', slots: 'Cette arme porte déjà ses deux pierres.', full: 'Ton sac est plein : fais de la place d’abord.', bad: 'Impossible.' };
  const W = 140, H = 100, CX = 70, CY = 52, RUN = 2.8, SEND = 1.5;
  const lerp = function (a, b, t) { return a + (b - a) * t; };
  const ease = function (t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const css = function (c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a === undefined ? 1 : a) + ')'; };

  const EnchantUI = {
    mode: 'enchant', w: -1, st: [], run: null, col: VIO.slice(), parts: [], t: 0, wave: 0, flash: 0, sig: '', raf: 0, last: 0, done: null,
    init: function (game, S, app) {
      this.game = game; this.S = S; this.app = app;
      this.cv = $('ench-cv'); this.ctx = this.cv.getContext('2d'); this.stage = $('ench-stage');
      this.slotW = $('es-w'); this.slotA = $('es-a'); this.slotB = $('es-b'); this.invEl = $('ench-inv'); this.info = $('ench-info'); this.noteEl = $('ench-note'); this.go = $('btn-ench-go');
      this.invEl.addEventListener('click', (e) => { const c = e.target.closest('[data-i]'); if (c) this.place(+c.dataset.i); });
      this.slotW.addEventListener('click', () => { if (!this.run) { this.w = -1; this.st = []; this.done = null; this.note(''); this.render(true); } });
      [this.slotA, this.slotB].forEach((el, k) => el.addEventListener('click', () => { if (this.run) return; const ex = this.existing().length; if (k >= ex) { this.st.splice(k - ex, 1); this.note(''); this.render(true); } }));
      this.go.addEventListener('click', () => this.start());
      $('btn-ench-clear').addEventListener('click', () => { if (this.run) return; this.w = -1; this.st = []; this.done = null; this.note(''); this.render(true); });
    },

    open: function (mode) {
      this.mode = mode === 'disenchant' ? 'disenchant' : 'enchant';
      this.w = -1; this.st = []; this.run = null; this.done = null; this.parts = []; this.flash = 0; this.wave = 0; this.sig = ''; this.col = VIO.slice();
      $('ench-title').textContent = this.mode === 'enchant' ? 'Table d’enchantement' : 'Table de désenchantement';
      $('ench-sub').textContent = this.mode === 'enchant' ? 'Pose une arme forgée au centre et jusqu’à deux pierres magiques autour.' : 'Pose une arme enchantée : tu récupères l’arme de base et ses pierres.';
      this.go.textContent = this.mode === 'enchant' ? 'Enchanter' : 'Désenchanter';
      this.stage.classList.toggle('dis', this.mode === 'disenchant');
      this.note(''); this.render(true);
      if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((n) => this.loop(n)); }
    },

    note: function (t, err) { this.noteEl.textContent = t || ''; this.noteEl.className = 'note' + (err ? ' err' : ''); },
    inv: function () { return this.game.local && this.game.local.inv; },
    stonesOnWeapon: function (id) { return I.enchant.stonesOf(id); },
    existing: function () { const s = this.w >= 0 && this.inv().slots[this.w]; return s ? this.stonesOnWeapon(s.id) : []; },
    cap: function () { return this.mode === 'enchant' ? Math.max(0, I.ENCH.MAX_SLOTS - this.existing().length) : 0; },

    /** Ajoute au plateau l'objet de la case i du sac (arme ou pierre). */
    place: function (i) {
      if (this.run) return;
      const inv = this.inv(), s = inv && inv.slots[i]; if (!s) return;
      this.done = null;
      if (I.forge.weapon(s.id)) {
        if (this.mode === 'disenchant' && !this.stonesOnWeapon(s.id).length) { this.note('Cette arme n’est pas enchantée.', true); return; }
        this.w = i; this.st = this.st.slice(0, this.cap()); this.note('');
      } else if (this.mode === 'enchant' && I.ENCH.STONES[s.id]) {
        if (this.w < 0) { this.note('Pose d’abord une arme.', true); return; }
        const used = this.st.filter(function (k) { return k === i; }).length;
        if (this.st.length >= this.cap()) { this.note(this.cap() ? 'Les deux emplacements sont pleins.' : MSG.slots, true); return; }
        if (used >= s.qty) { this.note('Tu n’en as pas assez.', true); return; }
        this.st.push(i); this.note('');
      } else { this.note(this.mode === 'enchant' ? 'Seules les armes forgées et les pierres magiques se posent ici.' : 'Seules les armes enchantées se posent ici.', true); return; }
      this.render(true);
    },

    /** Couleurs (rgb) des éléments en jeu : pierres choisies, sinon celles déjà sur l'arme. */
    elemCols: function () {
      const inv = this.inv(), ids = this.existing().concat(this.st.map((i) => inv.slots[i] && inv.slots[i].id)).filter(Boolean), out = [];
      ids.forEach(function (id) { const s = I.ENCH.STONES[id]; if (s) s.els.forEach(function (k) { out.push(I.ENCH.ELEM[k].rgb); }); });
      return out;
    },
    /** L'opération prévue : { ok, id (arme obtenue), a, b, stones } ou { reason }. */
    plan: function () {
      const inv = this.inv(), ws = this.w >= 0 && inv.slots[this.w];
      if (!ws) return { none: true };
      const a = I.forge.weapon(ws.id); if (!a) return { none: true };
      if (this.mode === 'disenchant') {
        const stones = this.stonesOnWeapon(ws.id); if (!stones.length) return { a: a, reason: 'plain' };
        const b = I.forge.weapon(I.ENCH.baseOf(ws.id));
        return { ok: I.enchant.room(inv, stones), a: a, b: b, stones: stones, id: b && b.id, reason: I.enchant.room(inv, stones) ? '' : 'full' };
      }
      if (!this.st.length) return { a: a, reason: 'nostone' };
      const nid = I.ENCH.idWith(ws.id, this.stonesOnWeapon(ws.id).concat(this.st.map((i) => inv.slots[i].id))), b = nid && I.forge.weapon(nid);
      return b ? { ok: true, a: a, b: b, id: nid } : { a: a, reason: 'bad' };
    },

    render: function (force) {
      const p = this.game.local; if (!p) return;
      const inv = p.inv;
      // la sélection suit le sac : une case qui a changé n'est plus valable
      if (!this.run) {
        if (this.w >= 0 && !(inv.slots[this.w] && I.forge.weapon(inv.slots[this.w].id))) this.w = -1;
        const cnt = {}; this.st = this.st.filter((i) => { const s = inv.slots[i]; if (!s || !I.ENCH.STONES[s.id]) return false; cnt[i] = (cnt[i] || 0) + 1; return cnt[i] <= s.qty; }).slice(0, this.cap());
      }
      const sig = [inv.rev, this.w, this.st.join('.'), this.mode, this.done && this.done.id, this.run ? 1 : 0].join('|');
      if (!force && sig === this.sig) return; this.sig = sig;
      const S = this.S, enchMode = this.mode === 'enchant', picked = {}; this.st.forEach(function (i) { picked[i] = (picked[i] || 0) + 1; });
      // sac : armes et pierres utilisables
      let html = '';
      for (let i = 0; i < inv.size; i++) {
        const s = inv.slots[i]; if (!s) continue;
        const wp = I.forge.weapon(s.id), st = !!I.ENCH.STONES[s.id];
        if (!(wp && (enchMode || this.stonesOnWeapon(s.id).length)) && !(enchMode && st)) continue;
        const on = i === this.w || picked[i];
        html += '<div class="slot eitem' + (on ? ' picked' : '') + '" data-i="' + i + '" title="' + (I.ITEMS[s.id].name || '') + '"><img src="' + S.iconURL[s.id] + '" alt="">' + (s.qty > 1 ? '<span class="qty">' + s.qty + '</span>' : '') + '</div>';
      }
      this.invEl.innerHTML = html || '<div class="ench-empty">' + (enchMode ? 'Aucune arme forgée ni pierre magique dans ton sac.' : 'Aucune arme enchantée dans ton sac.') + '</div>';
      // emplacements
      const ws = this.w >= 0 && inv.slots[this.w], ex = this.existing(), chosen = this.st.map((i) => inv.slots[i].id);
      const shownW = ws ? (this.run && this.run.phase2 ? this.run.newId : ws.id) : null;
      this.fill(this.slotW, shownW, ''); 
      const list = enchMode ? ex.map(function (id) { return { id: id, cls: 'fixed' }; }).concat(chosen.map(function (id) { return { id: id, cls: '' }; })) : ex.map(function (id) { return { id: id, cls: 'ghost' }; });
      this.fill(this.slotA, list[0] && list[0].id, list[0] ? list[0].cls : ''); this.fill(this.slotB, list[1] && list[1].id, list[1] ? list[1].cls : '');
      // infos
      const pl = this.plan(); let inf = '';
      if (pl.none) inf = '<div class="ei-hint">' + (enchMode ? 'Choisis une arme forgée dans ton sac (à droite), puis une ou deux pierres magiques.' : 'Choisis une arme enchantée dans ton sac.') + '</div>';
      else {
        const a = pl.a, elems = (this.mode === 'enchant' ? (pl.b || a) : a).ench;
        inf += '<div class="ei-name">' + (this.done ? 'Résultat : ' : '') + (this.done ? I.forge.weapon(this.done.id).name : a.name) + '</div>';
        if (elems) inf += '<div class="ei-chips">' + elems.order.map(function (k) { const E = I.ENCH.ELEM[k]; return '<span class="chip" style="--c:' + E.col + '">' + E.name + '</span>'; }).join('') + '</div>';
        if (enchMode && pl.b && !this.done) inf += '<div class="ei-stat">Dégâts <b>' + a.stats.dmg + '</b> → <b class="up">' + pl.b.stats.dmg + '</b> <em>(+' + (pl.b.ench ? pl.b.ench.bonus : 0) + ' % avec les pierres)</em></div>';
        if (enchMode && this.done) inf += '<div class="ei-stat">Dégâts <b class="up">' + I.forge.weapon(this.done.id).stats.dmg + '</b></div>';
        if (!enchMode && pl.b) inf += '<div class="ei-stat">Tu récupères : <b>' + pl.b.name + '</b> + ' + pl.stones.map(function (id) { return '<img class="mini" src="' + S.iconURL[id] + '" alt="" title="' + I.ITEMS[id].name + '">'; }).join('') + '</div>';
        if (enchMode) inf += '<div class="ei-soon">Pierres posées : ' + (ex.length + chosen.length) + ' / ' + I.ENCH.MAX_SLOTS + ' · les pouvoirs des pierres arrivent bientôt.</div>';
      }
      this.info.innerHTML = inf;
      this.go.disabled = !!this.run || !pl.ok;
      this.go.title = pl.reason === 'nostone' ? 'Pose au moins une pierre.' : pl.reason === 'full' ? MSG.full : '';
    },
    fill: function (el, id, cls) {
      el.className = 'eslot' + (id ? ' has' : '') + (cls ? ' ' + cls : '') + (el.id === 'es-w' ? ' weapon' : '');
      el.innerHTML = id ? '<img src="' + this.S.iconURL[id] + '" alt="">' : '';
    },

    // ---------- animation ----------
    start: function () {
      if (this.run) return;
      const pl = this.plan(); if (!pl.ok) return;
      const inv = this.inv(), ws = inv.slots[this.w];
      const cmd = this.mode === 'enchant' ? { t: 'enchant', i: this.w, s: this.st.slice() } : { t: 'disenchant', i: this.w };
      this.done = null; this.note('');
      this.run = { t: 0, sent: false, cmd: cmd, pl: pl, newId: pl.id, phase2: false, cols: this.elemCols(), fail: false };
      this.sig = ''; this.render(true); this.go.disabled = true;
      this.wave = 0;
    },
    finish: function (r) {
      const run = this.run;
      if (!r || !r.ok) { this.run = null; this.note(MSG[r && r.reason] || MSG.bad, true); this.sig = ''; this.render(true); return; }
      run.phase2 = true; run.newId = r.id; this.flash = 1; this.wave = 0.001;
      const cols = run.cols.length ? run.cols : [VIO]; this.burst(CX, CY, 70, cols, 70);
      if (this.mode === 'enchant') this.st = []; // pierres consommées
      this.done = { id: r.id }; this.sig = ''; this.render(true);
      this.app.saveNow && this.app.saveNow('auto');
    },
    burst: function (x, y, n, cols, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, v = sp * (0.3 + Math.random() * 0.8), c = cols[i % cols.length];
        this.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.8, max: 1.7, c: c, s: Math.random() < 0.2 ? 2 : 1, g: 10 });
      }
    },
    loop: function (now) {
      if (I.Menu.screen !== 'enchant') { this.raf = 0; return; }
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
      try { this.tick(dt); } catch (e) { console.error(e); }
      this.raf = requestAnimationFrame((n) => this.loop(n));
    },
    tick: function (dt) {
      const ctx = this.ctx, run = this.run, t = this.t, dis = this.mode === 'disenchant';
      // couleur cible : celle des pierres (oscille entre deux éléments), violet par défaut
      const cols = run ? run.cols : this.elemCols(), tgt = cols.length ? (cols.length > 1 ? cols[0].map((v, i) => lerp(v, cols[cols.length - 1][i], 0.5 + 0.5 * Math.sin(t * 1.8))) : cols[0]) : VIO;
      this.col = this.col.map((v, i) => lerp(v, tgt[i], Math.min(1, dt * 4)));
      const c = this.col, cs = css(c);
      this.stage.style.setProperty('--ec', cs); this.stage.style.setProperty('--ec2', css(c, 0.5));
      let pr = 0; // progression de l'animation 0..1
      if (run) {
        run.t += dt; pr = Math.min(1, run.t / RUN);
        if (!run.sent && run.t >= SEND) { run.sent = true; I.Net.command(run.cmd, (r) => this.finish(r)); }
        if (run.t >= RUN && run.phase2) { this.run = null; this.sig = ''; this.render(true); }
        if (run.t > 6) { this.run = null; this.sig = ''; this.render(true); this.note('Pas de réponse de l’hôte.', true); } // sécurité (coop)
      }
      const power = run ? Math.min(1, run.t / SEND) : 0;
      // fond
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(CX, CY, 4, CX, CY, 78);
      bg.addColorStop(0, css(c, 0.28 + 0.4 * power + 0.1 * Math.sin(t * 2))); bg.addColorStop(0.55, css(c, 0.08 + 0.12 * power)); bg.addColorStop(1, 'rgba(8,4,20,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // cercles de runes qui tournent (plus vite pendant l'opération, à l'envers pour le désenchantement)
      const dir = dis ? -1 : 1, spd = 0.35 + 3.2 * power * power;
      ctx.lineWidth = 1;
      [[44, 28, 1], [34, 18, -1.4], [24, 12, 2]].forEach(function (rg, k) {
        const r = rg[0], n = rg[1], a0 = t * spd * rg[2] * dir * (k ? 0.6 : 0.4) + k;
        ctx.strokeStyle = css(c, 0.55 + 0.3 * power); ctx.beginPath(); ctx.ellipse(CX, CY, r, r * 0.62, 0, 0, 6.283); ctx.stroke();
        ctx.fillStyle = css(c, 0.9);
        for (let i = 0; i < n; i++) { const a = a0 + i * 6.283 / n; ctx.fillRect(Math.round(CX + Math.cos(a) * r - 0.5), Math.round(CY + Math.sin(a) * r * 0.62 - 0.5), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1); }
      });
      // étoile à six branches inscrite dans le cercle
      ctx.strokeStyle = css(c, 0.35 + 0.4 * power); const sa = -t * spd * 0.5 * dir;
      for (let s = 0; s < 2; s++) { ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = sa + s * 3.1416 / 3 + i * 2.0944; ctx.lineTo(CX + Math.cos(a) * 24, CY + Math.sin(a) * 24 * 0.62); } ctx.closePath(); ctx.stroke(); }
      // colonne de lumière (la pierre se déverse dans l'arme) puis éclat
      if (run && run.t > 0.6) {
        const k = ease((run.t - 0.6) / 0.9) * (run.phase2 ? Math.max(0, 1 - (run.t - SEND) / 1) : 1), g = ctx.createLinearGradient(0, 0, 0, CY);
        g.addColorStop(0, css(c, 0)); g.addColorStop(1, css(c, 0.7 * k)); ctx.fillStyle = g; ctx.fillRect(CX - 2 - 4 * k, 0, 4 + 8 * k, CY);
      }
      if (this.wave > 0) { this.wave += dt * 1.6; const r = this.wave * 70; ctx.strokeStyle = css(c, Math.max(0, 1 - this.wave)); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(CX, CY, r, r * 0.62, 0, 0, 6.283); ctx.stroke(); ctx.lineWidth = 1; if (this.wave > 1) this.wave = 0; }
      // particules : ambiance, aspirées par l'arme pendant l'opération
      if (Math.random() < dt * (10 + 60 * power)) {
        const a = Math.random() * 6.283, r = 40 + Math.random() * 10;
        this.parts.push({ x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r * 0.62, vx: 0, vy: -6, life: 1.4, max: 1.4, c: c, s: 1, g: 0, pull: run && !dis ? 1 : 0 });
      }
      if (run && dis && run.t > SEND - 0.4 && run.t < SEND + 0.4 && Math.random() < 0.8) this.burst(CX, CY, 3, run.cols.length ? run.cols : [c], 40);
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i]; q.life -= dt; if (q.life <= 0) { this.parts.splice(i, 1); continue; }
        if (q.pull) { q.vx = (CX - q.x) * 1.6; q.vy = (CY - q.y) * 1.6; } else q.vy += q.g * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = Math.min(1, q.life / q.max * 1.6); ctx.fillStyle = css(q.c); ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
      }
      ctx.globalAlpha = 1;
      if (this.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + this.flash * 0.85 + ')'; ctx.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt * 1.8); }
      // pierres qui volent vers l'arme (enchantement) ou qui en sortent (désenchantement) ; l'arme vibre et rayonne
      const A = [18, 52], B = [82, 52], el = [this.slotA, this.slotB];
      el.forEach(function (e, k) {
        const base = k ? B : A; let lx = base[0], op = 1, sc = 1;
        if (run) {
          if (!dis) { const f = ease((run.t - 0.15 - k * 0.15) / 1.1); lx = lerp(base[0], 50, f); op = 1 - ease((f - 0.75) / 0.25); sc = 1 - 0.5 * f; }
          else { const f = ease((run.t - SEND + 0.2 + k * 0.15) / 1.0); lx = lerp(50, base[0], f); op = f; sc = 0.5 + 0.5 * f; if (run.phase2 === false && run.t < SEND - 0.2) op = 0; }
        }
        e.style.left = lx + '%'; e.style.opacity = op; e.style.transform = 'translate(-50%,-50%) scale(' + sc + ') rotate(' + (run ? Math.sin(run.t * 9 + k) * 12 * power : 0) + 'deg)';
      });
      const wEl = this.slotW; wEl.classList.toggle('charging', !!run);
      wEl.style.transform = run ? 'translate(-50%,-50%) translate(' + (Math.sin(t * 40) * 1.5 * power).toFixed(1) + 'px,' + (Math.cos(t * 37) * 1.5 * power).toFixed(1) + 'px) scale(' + (1 + 0.12 * power + (this.flash > 0 ? 0.2 * this.flash : 0)).toFixed(3) + ')' : '';
    },
  };
  I.EnchantUI = EnchantUI;
})((window.Iles = window.Iles || {}));
