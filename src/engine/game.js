/*
 * Game : possède l'état complet de la partie et le fait avancer. Aucune dépendance au DOM ni au canvas :
 * c'est la partie qui pourra tourner telle quelle sur un serveur pour le multijoueur.
 *
 * state = { seed, world, players:{id->joueur}, time:{minutes}, progress }
 * step(intentsParJoueur, dt) -> remplit this.events, lus par le rendu / l'interface.
 */
(function (I) {
  const C = I.config, DIMRE = /^d:\d{1,10}$/, MAX_DIMS = 12;

  class Game {
    constructor() {
      this.state = null;
      this.events = [];
      this.localId = 'p1';
      this.playTime = 0;
    }

    _blank(seed) {
      const home = new I.World(seed);
      return {
        seed: seed,
        world: home, worlds: { home: home }, dimOrder: [], dim: 'home', // dim : dimension courante ('home' = l'île, 'lobby' = le lobby spatial)
        travelTo: null, travelT: 0, act: null,         // voyage en cours (fondu) / éveil du portail ultime
        players: {},
        time: { minutes: C.START_MINUTES },
        progress: { portals: [], recipes: [], flags: {} },
      };
    }

    newGame(seed) {
      const s = this._blank(seed === undefined ? C.DEMO_SEED : seed);
      const p = I.Player.create(this.localId, s.world.spawn.x, s.world.spawn.y);
      I.Player.giveStarterKit(p);
      s.players[p.id] = p;
      this.state = s;
      this.events.length = 0;
      this.playTime = 0;
      return s;
    }

    /** Monde de fond pour l'écran titre : pas de joueur, midi. */
    demo() {
      const s = this._blank(C.DEMO_SEED);
      s.time.minutes = 10 * 60 + 30;
      this.state = s;
      return s;
    }

    get local() { return this.state && this.state.players[this.localId]; }

    /** Monde d'une dimension, créé à la demande (les mondes sont déterministes). */
    _worldOf(s, dim) {
      if (s.worlds[dim]) return s.worlds[dim];
      if (DIMRE.test(dim)) return (s.worlds[dim] = new I.ChunkWorld(parseInt(dim.slice(2), 10))); // dimension procédurale : 'd:<graine>'
      return (s.worlds[dim] = new I.World(s.seed, dim === 'lobby' ? { lobby: true } : undefined));
    }

    /** Charge tout de suite les morceaux autour de ces points (dimensions infinies) ; sans effet sur les mondes fixes. */
    _stream(world, pts, budget) { if (world.chunked) world.update(pts, budget); }

    /** Fait changer tout le monde de dimension : les joueurs arrivent près du point d'arrivée (devant le portail, ou sur la plateforme). */
    travel(to) {
      const s = this.state;
      if (s.dim === to || (to !== 'home' && to !== 'lobby' && !DIMRE.test(to))) return;
      s.dim = to; s.act = null; s.world = this._worldOf(s, to);
      const base = to === 'home' ? { x: s.world.meta.portal.x, y: s.world.meta.portal.y + 28 } : s.world.spawn;
      if (s.world.chunked) {
        this._stream(s.world, [base], 30);
        const order = s.dimOrder, i = order.indexOf(to); if (i >= 0) order.splice(i, 1); order.push(to); // dimensions visitées, la plus récente en dernier
        s.progress.flags.lastDim = { seed: s.world.D.seed, tint: s.world.D.pal[0] };
      }
      const OFF = [[0, 0], [14, 0], [-14, 0], [28, 0], [-28, 0], [42, 0], [-42, 0]];
      let i = 0;
      for (const id of Object.keys(s.players).sort()) {
        const p = s.players[id];
        p.swing = null; p.dashT = 0; p.build = null; p.target = null;
        let placed = false;
        for (let r = 0; r < 6 && !placed; r++) for (let k = 0; k < OFF.length && !placed; k++) { // première place libre autour du point d'arrivée
          const o = OFF[(i + k) % OFF.length]; p.x = base.x + o[0]; p.y = base.y + r * 12;
          placed = !I.collision.isBlocked(s.world, p) && s.world.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16));
        }
        i++;
      }
      this.events.push({ type: 'travel', to: to, name: s.world.chunked ? s.world.D.name : undefined });
    }

    step(intents, dt) {
      const s = this.state, ev = this.events;
      if (s.travelTo) { s.travelT -= dt; if (s.travelT <= 0) { const to = s.travelTo; s.travelTo = null; this.travel(to); } }
      s.time.minutes += C.MINUTES_PER_SECOND * dt;
      s.world.tick(s.time.minutes);
      if (s.world.chunked) { const pts = []; for (const id in s.players) if (!s.players[id].away) pts.push(s.players[id]); this._stream(s.world, pts, 2); }
      for (const id in s.players) {
        if (s.players[id].away) continue; // invité déconnecté : il reste dans la sauvegarde mais ne joue plus
        I.Player.update(s, s.players[id], intents[id] || NEUTRAL, dt, ev);
      }
      I.explore.step(s);
      I.dimension.step(s, dt, ev);
      if (s.world.chunked) { const pts = []; for (const id in s.players) if (!s.players[id].away) pts.push(s.players[id]); I.creatures.update(s.world, pts, dt); I.mobs.update(s, dt, ev); }
      I.combat.step(s, dt, ev);
      I.powers.tick(s, dt, ev);
      I.harvest.updateDrops(s.world, dt);
      I.containers.tick(s.world, dt);
      this.playTime += dt;
    }

    /** Pendant qu'un écran de conteneur est ouvert : seules les machines continuent de tourner. */
    tickMachines(dt) { I.containers.tick(this.state.world, dt); }

    takeEvents() { const e = this.events.slice(); this.events.length = 0; return e; }

    // ---------- sauvegarde : données du monde et données du joueur séparées ----------
    snapshot() {
      const s = this.state, players = {};
      for (const id in s.players) {
        const p = s.players[id];
        players[id] = { x: p.x, y: p.y, dir: p.dir, sel: p.sel, inv: p.inv.toJSON(), stats: p.stats, av: I.avatar.pack(p.av), book: p.book, armor: p.armor, hp: Math.round(p.hp * 10) / 10, hun: Math.round(p.hun * 10) / 10 };
      }
      return {
        version: C.SAVE_VERSION,
        savedAt: Date.now(),
        seed: s.seed,
        time: { minutes: s.time.minutes },
        dim: s.dim,
        world: s.worlds.home.serialize(), // l'île est toujours sauvegardée, même depuis le lobby
        explored: this._exploredSnapshot(),
        dims: this._dimsSnapshot(), // dimensions visitées (modifications uniquement : le terrain se régénère depuis la graine)
        progress: s.progress,
        players: players,
        localId: this.localId,
        playTime: Math.round(this.playTime),
      };
    }

    _exploredSnapshot() {
      const s = this.state, out = {};
      for (const id in s.worlds) { const k = I.explore.pack(s.worlds[id]); if (k) out[id] = k; }
      return out;
    }

    _dimsSnapshot() {
      const s = this.state, out = {};
      for (const id of s.dimOrder.slice(-MAX_DIMS)) if (s.worlds[id]) out[id] = s.worlds[id].serialize();
      return out;
    }

    loadSnapshot(snap) {
      const s = this._blank(snap.seed);
      s.time.minutes = isFinite(snap.time && snap.time.minutes) ? snap.time.minutes : C.START_MINUTES;
      s.world.restore(snap.world); // à ce stade le monde courant est l'île
      if (snap.dims && typeof snap.dims === 'object') {
        for (const id of Object.keys(snap.dims)) if (DIMRE.test(id)) { this._worldOf(s, id).restore(snap.dims[id]); s.dimOrder.push(id); }
      }
      if (snap.dim === 'lobby') { s.dim = 'lobby'; s.world = this._worldOf(s, 'lobby'); }
      else if (typeof snap.dim === 'string' && s.worlds[snap.dim] && DIMRE.test(snap.dim)) { s.dim = snap.dim; s.world = s.worlds[snap.dim]; }
      if (snap.explored && typeof snap.explored === 'object') {
        for (const id of Object.keys(snap.explored)) if (id === 'home' || id === 'lobby' || (DIMRE.test(id) && s.worlds[id])) I.explore.unpack(this._worldOf(s, id), snap.explored[id]);
      }
      const pr = snap.progress || {};
      s.progress = {
        portals: Array.isArray(pr.portals) ? pr.portals.filter(function (x) { return typeof x === 'string'; }) : [],
        recipes: Array.isArray(pr.recipes) ? pr.recipes.filter(function (x) { return !!I.crafting.BY_ID[x]; }) : [],
        flags: pr.flags && typeof pr.flags === 'object' ? pr.flags : {},
      };
      this.localId = snap.localId || 'p1';
      const src = snap.players || {};
      for (const id in src) {
        const d = src[id];
        const p = I.Player.create(id, isFinite(d.x) ? d.x : s.world.spawn.x, isFinite(d.y) ? d.y : s.world.spawn.y);
        if (['up', 'down', 'left', 'right'].includes(d.dir)) p.dir = d.dir;
        p.inv = I.Inventory.fromJSON(d.inv, C.INVENTORY_SIZE);
        p.sel = Math.max(0, Math.min(C.HOTBAR_SIZE - 1, d.sel | 0));
        p.stats = d.stats && typeof d.stats === 'object' ? d.stats : {};
        p.av = I.avatar.sanitize(d.av);
        p.armor = I.armor.sanitize(d.armor);
        p.book = I.cooking.sanitizeBook(d.book);
        if (isFinite(d.hp)) p.hp = Math.max(1, Math.min(I.vitals.MAXHP, d.hp));
        if (isFinite(d.hun)) p.hun = Math.max(0, Math.min(I.vitals.MAXHUN, d.hun));
        this._stream(s.world, [p], 6);
        // position impossible (carte modifiée, sauvegarde abîmée) : retour au point de départ
        if (I.collision.isBlocked(s.world, p) || !s.world.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) {
          p.x = s.world.spawn.x; p.y = s.world.spawn.y;
        }
        if (id !== this.localId) p.away = true; // les autres joueurs de la sauvegarde sont absents jusqu'à leur reconnexion
        s.players[id] = p;
      }
      if (!s.players[this.localId]) {
        const p = I.Player.create(this.localId, s.world.spawn.x, s.world.spawn.y);
        I.Player.giveStarterKit(p);
        s.players[this.localId] = p;
      }
      this.state = s;
      this.events.length = 0;
      this.playTime = snap.playTime | 0;
      return s;
    }
  }

  const NEUTRAL = { mx: 0, my: 0, dash: false, use: false, remove: false, aim: null, interact: false, hotbar: null, ab: 0 };
  Game.NEUTRAL = NEUTRAL;
  I.Game = Game;
})((window.Iles = window.Iles || {}));
