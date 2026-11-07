/*
 * Musique : fichiers mp3 du dossier audio/musique/, choisis selon la scène (titre, île, dimension, lobby/portail, combat).
 * Deux pistes ou plus se fondent l'une dans l'autre (volume progressif). Un fichier absent est simplement ignoré :
 * c'est ainsi que Combat.mp3 est facultatif (il se joue dès que tu mets le fichier dans le dossier).
 * Le navigateur interdit le son avant le premier clic / la première touche : la musique démarre à ce moment-là.
 * Les noms de fichiers sont sensibles aux majuscules (GitHub Pages).
 */
(function (I) {
  const DIR = 'audio/musique/', CROSS = 6, COMBAT_HOLD = 9;
  const TRACKS = {
    titre: ['Intro_du_jeu.mp3'],
    jour: ['Music_Jour_1.mp3', 'Music_Jour_2.mp3'],
    dimension: ['Dimension_music_1.mp3', 'Dimension_music_2.mp3'],
    lobby: ['Portail.mp3'],
    combat: ['Combat.mp3', 'Combat_Instrumental.mp3', 'Combat_Paroles.mp3'], // tous facultatifs : chaque combat joue la suivante de celles qui existent
  };
  const FALLBACK = { lobby: 'dimension' }; // si Portail.mp3 manque
  const FADE = { combatIn: 0.8, combatOut: 3, normal: 2.5 };

  const Music = {
    TRACKS: TRACKS, volume: 0.7, unlocked: false, combatUntil: 0,
    ch: [], cur: null, scene: null, pos: {}, idx: {}, missing: {}, lastErr: null,

    init: function (game, menu, volume) {
      this.game = game; this.menu = menu; this.volume = volume;
      this.probe('combat'); // Combat.mp3 est facultatif : on vérifie tout de suite s'il existe
      const self = this, go = function () {
        self.unlocked = true;
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.removeEventListener(ev, go, true); });
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, go, true); });
    },
    probe: function (scene) {
      const self = this;
      TRACKS[scene].forEach(function (f) { const a = new Audio(); a.preload = 'metadata'; a.addEventListener('error', function () { self.missing[f] = true; }); a.src = DIR + f; });
    },
    setVolume: function (v) { this.volume = Math.max(0, Math.min(1, v)); },
    /** À appeler quand le joueur local frappe ou tue une créature. */
    combat: function () { this.combatUntil = performance.now() + COMBAT_HOLD * 1000; },

    /** Scène voulue. */
    wanted: function () {
      const m = this.menu, g = this.game;
      if (m.screen === 'title' || !g.state || !g.local) return 'titre';
      const w = g.state.world;
      if (performance.now() < this.combatUntil && this.list('combat').length) return 'combat'; // sans Combat.mp3 : on ne change rien
      if (g.state.act || w.lobby) return 'lobby';
      return w.chunked ? 'dimension' : 'jour';
    },
    /** Scène réellement jouable (fichiers présents) : repli éventuel, ou null = silence. */
    resolve: function (scene) {
      for (let s = scene; s; s = FALLBACK[s]) if (this.list(s).length) return s;
      return null;
    },
    list: function (scene) { const self = this; return (TRACKS[scene] || []).filter(function (f) { return !self.missing[f]; }); },

    start: function (scene, fade) {
      const L = this.list(scene); if (!L.length) return;
      let i = (this.idx[scene] || 0) % L.length;
      const file = L[i], a = new Audio(DIR + file), self = this;
      a.preload = 'auto'; a.loop = L.length === 1; a.volume = 0;
      const c = { a: a, file: file, scene: scene, vol: 0, target: 1, fade: fade, adv: false, dead: false };
      a.addEventListener('error', function () { self.missing[file] = true; self.lastErr = file; c.dead = true; if (self.cur === c) self.cur = null; });
      if (scene === 'combat') this.idx.combat = (i + 1) % L.length; // un combat sur deux : l'autre piste
      const p = this.pos[scene + ':' + file];
      if (p) a.addEventListener('loadedmetadata', function () { try { if (p < a.duration - CROSS - 2) a.currentTime = p; } catch (e) { /* ignoré */ } });
      const pr = a.play(); if (pr && pr.catch) pr.catch(function () { /* refus du navigateur : on réessaiera au prochain clic */ c.refused = true; });
      this.ch.push(c); this.cur = c; this.scene = scene;
    },
    stopCur: function (fade) {
      const c = this.cur; if (!c) return;
      if (c.scene !== 'combat' && !c.a.paused && isFinite(c.a.currentTime)) this.pos[c.scene + ':' + c.file] = c.a.currentTime;
      c.target = 0; c.fade = fade; this.cur = null;
    },

    update: function (dt) {
      if (!this.unlocked) return;
      const want = this.resolve(this.wanted());
      if (want !== this.scene || (want && !this.cur)) {
        const prev = this.scene, fadeOut = prev === 'combat' ? FADE.combatOut : FADE.normal;
        this.stopCur(want === 'combat' ? FADE.combatIn : fadeOut);
        if (want) this.start(want, want === 'combat' ? FADE.combatIn : FADE.normal); else this.scene = null;
      }
      const c0 = this.cur;
      if (c0) {
        if (c0.refused) { c0.refused = false; const pr = c0.a.play(); if (pr && pr.catch) pr.catch(function () { c0.refused = true; }); }
        const a = c0.a, L = this.list(c0.scene), left = a.duration - a.currentTime;
        if (L.length > 1 && !c0.adv && isFinite(left) && (left < CROSS || a.ended)) { // piste suivante en fondu
          c0.adv = true; if (c0.scene !== 'combat') this.idx[c0.scene] = ((this.idx[c0.scene] || 0) + 1) % L.length; this.stopCur(CROSS); this.start(c0.scene, CROSS);
        }
      }
      for (let i = this.ch.length - 1; i >= 0; i--) {
        const c = this.ch[i];
        if (c.dead) { try { c.a.pause(); } catch (e) { /* ignoré */ } this.ch.splice(i, 1); continue; }
        const step = dt / Math.max(0.05, c.fade);
        c.vol = c.vol < c.target ? Math.min(c.target, c.vol + step) : Math.max(c.target, c.vol - step);
        c.a.volume = Math.max(0, Math.min(1, c.vol * c.vol * this.volume)); // courbe douce
        if (c.target === 0 && c.vol <= 0) { try { c.a.pause(); c.a.removeAttribute('src'); c.a.load(); } catch (e) { /* ignoré */ } this.ch.splice(i, 1); }
      }
    },
  };
  I.Music = Music;
})((window.Iles = window.Iles || {}));
