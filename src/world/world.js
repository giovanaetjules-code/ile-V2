/*
 * Monde : carte générée (déterministe) + état modifié (objets abîmés / récoltés) + objets au sol.
 * Seul `state` et `drops` sont sauvegardés : le reste se régénère depuis la graine.
 */
(function (I) {
  const C = I.config, TS = C.TILE, BK = 128, BM = 100000; // BM : multiplicateur des clés de seaux (les mondes infinis ont de grandes coordonnées)

  class World {
    constructor(seed, opts) {
      this.seed = seed;
      const m = I.generateMap(seed, opts); // opts.tint : monde d'une seule couleur (dimensions)
      this.W = m.W; this.H = m.H; this.ground = m.ground; this.edges = m.edges;
      this.objects = m.objects; this.spawn = m.spawn; this.meta = m.meta;
      this.drops = m.drops; this.nextId = m.nextId;
      this.lobby = !!(m.meta && m.meta.lobby); // lobby spatial : ciel animé, pas de jour / nuit
      this.state = {}; // id -> { hp, until } uniquement pour les objets modifiés
      this.byId = new Map();
      this.buckets = new Map();
      this.swim = !this.lobby; // on nage dans l'eau profonde partout sauf dans le lobby (son vide n'est pas de l'eau)
      this.lazy = false; // vrai pour les mondes infinis : les objets sont chargés par morceaux
      for (const o of this.objects) this._register(o);
      this.structures = []; // constructions du joueur (aussi présentes dans objects / buckets)
      this.nextStructId = 1;
      this.tileIndex = new Map(); // case -> construction solide / interactive
      this.floorIndex = new Map(); // case -> sol posé
      this.roofIndex = new Map(); // case -> tuile de toit
      this.bver = 0; // change à chaque pose / retrait de construction (invalide les calculs de pièces)
      this.flowers = this.objects.filter(function (o) { return o.type.indexOf('flower') === 0; });
    }

    /** Prépare un objet (définition, boîtes de collision) et le range dans l'index et les seaux. */
    _register(o) {
      const def = I.OBJECTS[o.type];
      o.def = def;
      o.rect = def.collider ? { x: o.x + def.collider[0], y: o.y + def.collider[1], w: def.collider[2], h: def.collider[3] } : null;
      o.rectCut = def.colliderCut ? { x: o.x + def.colliderCut[0], y: o.y + def.colliderCut[1], w: def.colliderCut[2], h: def.colliderCut[3] } : null;
      this.byId.set(o.id, o);
      const k = this._bucketKey(o);
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(o);
    }

    // ---------- constructions ----------
    _bucketKey(o) { return Math.floor(o.y / BK) * BM + Math.floor(o.x / BK); }

    addStructure(type, tx, ty, data, id, c) {
      const def = I.OBJECTS[type];
      const o = { id: id || ('s' + this.nextStructId++), type: type, x: tx * TS + 8, y: ty * TS + 16, variant: 0, def: def, structure: true, tx: tx, ty: ty, data: data || null, c: c | 0 };
      o.rect = def.collider ? { x: o.x + def.collider[0], y: o.y + def.collider[1], w: def.collider[2], h: def.collider[3] } : null;
      o.rectCut = null;
      this.byId.set(o.id, o);
      this.objects.push(o);
      const k = this._bucketKey(o);
      let b = this.buckets.get(k);
      if (!b) { b = []; this.buckets.set(k, b); }
      b.push(o);
      this.structures.push(o);
      this._idx(def).set(ty * this.W + tx, o); this.bver++;
      return o;
    }

    removeStructure(o) {
      const drop = function (arr) { const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); };
      drop(this.objects); drop(this.structures);
      const b = this.buckets.get(this._bucketKey(o)); if (b) drop(b);
      this.byId.delete(o.id);
      this._idx(o.def).delete(o.ty * this.W + o.tx); this.bver++;
    }

    _idx(def) { return def.layer === 'floor' ? this.floorIndex : def.layer === 'roof' ? this.roofIndex : this.tileIndex; }

    structureAt(tx, ty) { return this.tileIndex.get(ty * this.W + tx) || null; }
    floorAt(tx, ty) { return this.floorIndex.get(ty * this.W + tx) || null; }
    roofAt(tx, ty) { return this.roofIndex.get(ty * this.W + tx) || null; }

    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return 0;
      return this.ground[ty * this.W + tx];
    }
    edgeAt(tx, ty) { return this.edges[ty * this.W + tx]; }
    colorOf() { return 0; } // couleur d'une tuile (dimensions colorées)
    /** Terre ferme (on peut y construire, y poser des objets). */
    isLand(tx, ty) { return I.WALKABLE[this.tileAt(tx, ty)]; }
    /** Praticable à pied ou à la nage. */
    isWalkable(tx, ty) {
      const t = this.tileAt(tx, ty);
      return I.WALKABLE[t] || (this.swim && t <= 1 && tx >= 0 && ty >= 0 && tx < this.W && ty < this.H);
    }

    /** Objets dont le point d'ancrage est dans le rectangle. */
    objectsIn(x0, y0, x1, y1, out) {
      out = out || [];
      const bx0 = Math.floor(x0 / BK), bx1 = Math.floor(x1 / BK), by0 = Math.floor(y0 / BK), by1 = Math.floor(y1 / BK);
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const b = this.buckets.get(by * BM + bx);
          if (!b) continue;
          for (let i = 0; i < b.length; i++) {
            const o = b[i];
            if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
          }
        }
      }
      return out;
    }

    // --- état des objets ---
    isDepleted(o) { const s = this.state[o.id]; return !!s && s.hp <= 0; }
    hpOf(o) { const s = this.state[o.id]; return s ? s.hp : o.def.hp; }
    colliderOf(o) { return this.isDepleted(o) ? o.rectCut : o.rect; }

    /** Inflige des dégâts ; renvoie true si l'objet est détruit. */
    hit(o, dmg, now) {
      let s = this.state[o.id];
      if (!s) s = this.state[o.id] = { hp: o.def.hp, until: 0 };
      s.hp -= dmg;
      if (s.hp <= 0) {
        s.hp = 0;
        s.until = now + o.def.respawnDays * C.DAY_MINUTES;
        return true;
      }
      s.until = now + 90; // les dégâts partiels se résorbent
      return false;
    }

    /** Récolte (cueillette) : l'objet disparaît puis repousse. */
    deplete(o, now) {
      this.state[o.id] = { hp: 0, until: now + o.def.respawnDays * C.DAY_MINUTES };
    }

    tick(now) {
      this.now = now; // heure du jeu (croissance des cultures)
      for (const id in this.state) if (now >= this.state[id].until) delete this.state[id];
    }

    // --- collisions ---
    solidRectsIn(x0, y0, x1, y1) {
      const out = [];
      const tx0 = Math.floor(x0 / TS), tx1 = Math.floor(x1 / TS), ty0 = Math.floor(y0 / TS), ty1 = Math.floor(y1 / TS);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!this.isWalkable(tx, ty)) out.push({ x: tx * TS, y: ty * TS, w: TS, h: TS });
        }
      }
      const objs = this.objectsIn(x0 - 40, y0 - 4, x1 + 40, y1 + 40);
      for (const o of objs) {
        const r = this.colliderOf(o);
        if (r) out.push(r);
      }
      return out;
    }

    // --- objets au sol ---
    spawnDrop(item, qty, x, y, pop) {
      const d = { id: 'g' + (this.nextId++), item: item, qty: qty, x: x, y: y, z: 0, vx: 0, vy: 0, vz: 0, age: 0, pop: !!pop, ox: x, oy: y };
      if (pop) {
        const a = Math.random() * Math.PI * 2, sp = 14 + Math.random() * 16;
        d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp * 0.7; d.vz = 80 + Math.random() * 40;
      }
      this.drops.push(d);
      return d;
    }

    serialize() {
      return {
        state: this.state,
        drops: this.drops.map(function (d) { return { id: d.id, item: d.item, qty: d.qty, x: d.x, y: d.y }; }),
        nextId: this.nextId,
        nextStructId: this.nextStructId,
        structures: this.structures.map(function (o) { return { id: o.id, type: o.type, tx: o.tx, ty: o.ty, c: o.c || undefined, data: I.containers.serializeData(o) }; }),
      };
    }

    restore(data) {
      if (!data || typeof data !== 'object') return;
      this.state = {};
      if (data.state && typeof data.state === 'object') {
        for (const id in data.state) {
          const s = data.state[id];
          if ((this.lazy || this.byId.has(id)) && s && isFinite(s.hp) && isFinite(s.until)) this.state[id] = { hp: s.hp, until: s.until };
        }
      }
      if (Array.isArray(data.drops)) {
        this.drops = data.drops.filter(function (d) {
          return d && I.ITEMS[d.item] && d.qty > 0 && isFinite(d.x) && isFinite(d.y);
        }).map(function (d) {
          return { id: String(d.id), item: d.item, qty: d.qty, x: d.x, y: d.y, z: 0, vx: 0, vy: 0, vz: 0, age: 1, pop: false };
        });
      }
      if (isFinite(data.nextId)) this.nextId = Math.max(this.nextId, data.nextId);
      // constructions : on repart d'un monde sans construction puis on les repose
      for (const o of this.structures.slice()) this.removeStructure(o);
      if (Array.isArray(data.structures)) {
        for (const s of data.structures) {
          const def = s && I.OBJECTS[s.type];
          if (!def || !def.structure || !isFinite(s.tx) || !isFinite(s.ty)) continue;
          if (s.tx < 0 || s.ty < 0 || s.tx >= this.W || s.ty >= this.H) continue;
          this.addStructure(s.type, s.tx | 0, s.ty | 0, I.containers.restoreData(s.type, s.data), String(s.id), I.tint.clamp(s.c));
        }
      }
      if (isFinite(data.nextStructId)) this.nextStructId = Math.max(this.nextStructId, data.nextStructId);
    }
  }
  I.World = World;
})((window.Iles = window.Iles || {}));
