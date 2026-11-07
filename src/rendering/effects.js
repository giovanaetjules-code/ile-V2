/* Effets purement visuels (particules, papillons, lucioles, fumée). Rien ici n'est sauvegardé ni simulé. */
(function (I) {
  const WOOD = ['#a8703c', '#7a4e2c', '#c89a62'];
  const STONE = ['#8e8e9a', '#a9a9b6', '#c9c9d4'];
  const CRYSTAL = ['#aef0ff', '#6fd3f5', '#e6fbff'];
  const BFLY = [['#f6a8d0', '#e8709f'], ['#ffd25a', '#e0903a'], ['#9fd8ff', '#5a9ae0'], ['#ffffff', '#c8d4e8']];

  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  class Effects {
    constructor() {
      this.parts = [];
      this.flies = [];
      this.shake = {};
      this.hitAt = {};
      this.vis = []; this.nums = []; this.cflash = {}; this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0; // effets de combat
      this.t = 0;
    }

    burst(x, y, n, cols, o) {
      o = o || {};
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (o.speed || 40) * (0.4 + Math.random() * 0.8);
        const life = (o.life || 0.5) * (0.6 + Math.random() * 0.7);
        this.parts.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
          g: o.g === undefined ? 160 : o.g, life: life, max: life, col: pick(cols), size: o.size || 1, fade: !!o.fade,
        });
      }
    }

    /** Réagit aux événements émis par la simulation. */
    onEvent(e) {
      if (e.type === 'enchant') { const cs = (e.els.length ? e.els : ['shock']).reduce(function (a, k) { const E = I.ENCH.ELEM[k]; return a.concat([E.col, E.col2]); }, []); this.burst(e.x, e.y - 10, 28, cs, { speed: 55, up: 35, life: 0.9, g: 30, fade: true }); }
      const def = e.otype ? I.OBJECTS[e.otype] : null;
      if (e.type === 'hit' && def) {
        const base = def.fx === 'stone' ? STONE : def.fx === 'crystal' ? CRYSTAL : WOOD;
        this.burst(e.x, e.y, 4, base, { speed: 45, up: 25 });
        if (def.leaf && def.fx === 'wood') this.burst(e.x, e.y - 14, 3, def.leaf, { speed: 18, up: 5, g: 40, life: 0.9 });
        if (def.fx === 'crystal') this.burst(e.x, e.y, 3, CRYSTAL, { speed: 30, g: 0, life: 0.5 });
        this.shake[e.id] = 0.25;
        this.hitAt[e.id] = this.t;
      } else if (e.type === 'destroy' && def) {
        const base = def.fx === 'stone' ? STONE : def.fx === 'crystal' ? CRYSTAL : WOOD;
        this.burst(e.x, e.y, 10, base, { speed: 60, up: 30 });
        if (def.leaf && def.fx === 'wood') this.burst(e.x, e.y - 16, 12, def.leaf, { speed: 28, up: 5, g: 35, life: 1.2 });
      } else if (e.type === 'harvest' && def) {
        this.burst(e.x, e.y - 4, 6, def.leaf || ['#9bdd68'], { speed: 26, up: 22, life: 0.6 });
      } else if (e.type === 'place' || e.type === 'remove') {
        this.burst(e.x, e.y + 2, 7, ['#e8d49a', '#d9c185', '#f7e9bc'], { speed: 22, up: 10, g: 30, life: 0.4 });
      } else if (e.type === 'clank') {
        this.burst(e.x, e.y, 3, STONE, { speed: 40, up: 20, life: 0.25 });
      } else if (e.type === 'splash') {
        this.burst(e.x, e.y - 1, 9, ['#9fd8f6', '#ffffff', '#4fb6dc'], { speed: 32, up: 34, g: 70, life: 0.45 });
      } else if (e.type === 'cfx') {
        this.cfx(e);
      } else if (e.type === 'cHit') {
        this.cflash[e.id] = 0.14;
        this.nums.push({ x: e.x + (Math.random() - 0.5) * 6, y: e.y, txt: String(e.dmg), t: 0, life: e.crit ? 1 : 0.75, crit: e.crit });
        this.burst(e.x, e.y + 2, e.crit ? 9 : 5, [e.c, '#ffffff', '#ffe9a8'], { speed: 55, up: 20, life: 0.35, size: 1 });
        this.shakeAmp = Math.max(this.shakeAmp, e.crit ? 2.5 : 1);
      } else if (e.type === 'hurt') {
        const HC = { none: '#ff5a4a', venom: '#8aff5a', flame: '#ff9a3a', frost: '#8ae0ff', shock: '#fff05a' };
        this.nums.push({ x: e.x + (Math.random() - 0.5) * 6, y: e.y, txt: '-' + e.dmg, t: 0, life: 0.9, crit: false, hurt: true });
        this.burst(e.x, e.y + 6, 6, [HC[e.el] || '#ff5a4a', '#ffffff'], { speed: 50, up: 18, life: 0.35, size: 1 });
        this.shakeAmp = Math.max(this.shakeAmp, 2.2);
      } else if (e.type === 'faint') {
        this.burst(e.x, e.y - 6, 18, ['#ffffff', '#cfe0ff', '#b8a8ff'], { speed: 60, up: 40, life: 0.8, size: 2, fade: true });
      } else if (e.type === 'cDie') {
        this.burst(e.x, e.y, 14 + e.size * 6, [e.c, '#ffffff', '#fff1b8'], { speed: 80, up: 35, life: 0.7, size: 2, fade: true });
        this.vis.push({ k: 'ring', x: e.x, y: e.y + 4, r: 16 + e.size * 6, c: '#ffffff', t: 0, life: 0.35 });
        this.shakeAmp = Math.max(this.shakeAmp, 1.5 + e.size * 0.5);
      } else if (e.type === 'shake') {
        this.shakeAmp = Math.max(this.shakeAmp, e.a);
      } else if (e.type === 'dash') {
        this.burst(e.x, e.y - 1, 6, ['#e8d49a', '#d9c185', '#f7e9bc'], { speed: 22, up: 8, g: 20, life: 0.35 });
      }
    }

    /** Effet visuel d'une capacité (identique chez l'hôte et chez les invités : il vient d'un événement). */
    cfx(e) {
      const v = { k: e.k, x: e.x, y: e.y, a: e.a || 0, r: e.r || 20, arc: e.arc || 2, c: e.c || '#ffffff', t: 0, life: e.life || 0.3, big: !!e.big, vx: e.vx || 0, vy: e.vy || 0, sub: e.sub, x2: e.x2, y2: e.y2 };
      this.vis.push(v);
      const col = [v.c, '#ffffff', v.c];
      if (e.k === 'spin' || e.k === 'ring' || e.k === 'aura') this.burst(e.x, e.y, 10, col, { speed: 70, up: 5, g: 0, life: 0.35 });
      else if (e.k === 'burst') this.burst(e.x, e.y, 8, col, { speed: 60, g: 20, life: 0.35 });
      else if (e.k === 'crack') this.burst(e.x, e.y, 12, ['#8e8e9a', '#c9c9d4', v.c], { speed: 70, up: 40, life: 0.5 });
      else if (e.k === 'spike') this.burst(e.x, e.y, 6, [v.c, '#ffffff'], { speed: 40, up: 50, life: 0.4 });
      else if (e.k === 'trail') { for (let i = 0; i < 12; i++) { const u = i / 11; this.burst(e.x + (e.x2 - e.x) * u, e.y + (e.y2 - e.y) * u, 2, col, { speed: 18, g: 0, life: 0.3, fade: true }); } }
      else if (e.k === 'ebolt') { this.burst(e.x2, e.y2, 8, [v.c, '#ffffff'], { speed: 50, up: 20, g: 40, life: 0.3 }); this.burst(e.x, e.y, 4, [v.c, '#ffffff'], { speed: 30, g: 0, life: 0.2 }); }
      else if (e.k === 'eboom') { this.burst(e.x, e.y, 26, [v.c, e.c2 || '#ffffff', '#ffffff'], { speed: 95, up: 35, g: 60, life: 0.7, fade: true }); this.burst(e.x, e.y, 10, [v.c], { speed: 30, up: 60, g: -20, life: 0.9, size: 2, fade: true }); }
      else if (e.k === 'esteam') { this.burst(e.x, e.y, 22, ['#ffffff', '#e8e8f0', '#ffd9b0'], { speed: 60, up: 25, g: -30, life: 1.0, size: 2, fade: true }); }
      else if (e.k === 'eice') { this.burst(e.x, e.y, 20, [v.c, '#e6fbff', '#ffffff'], { speed: 70, up: 20, g: 90, life: 0.8, size: 2 }); }
      else if (e.k === 'esky') { this.burst(e.x, e.y, 28, [v.c, '#ffffff', e.c2 || v.c], { speed: 110, up: 40, g: 120, life: 0.6 }); }
      else if (e.k === 'estat') { const s = e.sub; this.burst(e.x + (Math.random() - 0.5) * 6, e.y, 2, s === 'flame' ? [v.c, e.c2] : s === 'venom' ? [v.c, e.c2] : ['#e6fbff', v.c], { speed: 8, up: s === 'flame' ? 22 : s === 'venom' ? 14 : 4, g: s === 'flame' ? -30 : s === 'venom' ? -10 : 8, life: 0.5, fade: true, size: s === 'ice' ? 2 : 1 }); }
      else if (e.k === 'slash' && e.big) this.burst(e.x + Math.cos(v.a) * v.r, e.y + Math.sin(v.a) * v.r, 8, col, { speed: 60, g: 10, life: 0.3 });
    }

    update(dt, state, cam) {
      this.t += dt;
      for (let i = this.vis.length - 1; i >= 0; i--) {
        const v = this.vis[i]; v.t += dt;
        if (v.k === 'proj') { v.x += v.vx * dt; v.y += v.vy * dt; if (Math.random() < 0.9) this.parts.push({ x: v.x - v.vx * 0.02, y: v.y + (Math.random() - 0.5) * v.r, vx: 0, vy: 0, g: 0, life: 0.25, max: 0.25, col: Math.random() < 0.4 ? '#ffffff' : v.c, size: 1, fade: true }); }
        if (v.k === 'cloud' && Math.random() < dt * 14) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * v.r; this.parts.push({ x: v.x + Math.cos(a) * rr, y: v.y + Math.sin(a) * rr * 0.6, vx: 0, vy: 0, g: -8, life: 1.1, max: 1.1, col: Math.random() < 0.5 ? v.c : '#d8ffa0', size: 2, fade: true }); }
        if (v.t >= v.life) this.vis.splice(i, 1);
      }
      for (let i = this.nums.length - 1; i >= 0; i--) { const n = this.nums[i]; n.t += dt; n.y -= 22 * dt; if (n.t >= n.life) this.nums.splice(i, 1); }
      for (const id in this.cflash) { this.cflash[id] -= dt; if (this.cflash[id] <= 0) delete this.cflash[id]; }
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 14);
      this.shakeX = this.shakeAmp > 0.05 ? Math.round((Math.random() - 0.5) * 2 * this.shakeAmp) : 0;
      this.shakeY = this.shakeAmp > 0.05 ? Math.round((Math.random() - 0.5) * 2 * this.shakeAmp) : 0;
      const parts = this.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (const id in this.shake) { this.shake[id] -= dt; if (this.shake[id] <= 0) delete this.shake[id]; }

      const world = state.world, hour = I.timeutil.hour(state.time.minutes);
      const isDay = hour >= 7 && hour < 19, isNight = hour >= 20.5 || hour < 5;

      // fumée de la cheminée
      const house = world.byId.get('house');
      if (house && Math.abs(house.x - (cam.x + cam.w / 2)) < cam.w / 2 + 60 && Math.abs(house.y - (cam.y + cam.h / 2)) < cam.h / 2 + 80 && Math.random() < dt * 3) {
        this.parts.push({ x: house.x + 18 + Math.random() * 2, y: house.y - 62, vx: 4 + Math.random() * 4, vy: -12, g: -2, life: 2.2, max: 2.2, col: '#dcdce6', size: 2, fade: true });
      }

      // papillons le jour, lucioles la nuit
      for (let i = this.flies.length - 1; i >= 0; i--) {
        const f = this.flies[i];
        f.life -= dt;
        f.a += (Math.random() - 0.5) * 7 * dt;
        f.x += Math.cos(f.a) * f.sp * dt; f.y += Math.sin(f.a) * f.sp * dt * 0.7;
        f.ph += dt * (f.kind === 'b' ? 14 : 3);
        const out = f.x < cam.x - 120 || f.x > cam.x + cam.w + 120 || f.y < cam.y - 120 || f.y > cam.y + cam.h + 120;
        if (f.life <= 0 || out || (f.kind === 'b' && !isDay) || (f.kind === 'f' && !isNight)) this.flies.splice(i, 1);
      }
      if (this.flies.length < 8 && Math.random() < dt * 1.5) {
        if (isDay && world.flowers.length) {
          for (let tries = 0; tries < 6; tries++) {
            const fl = world.flowers[(Math.random() * world.flowers.length) | 0];
            if (fl.x > cam.x - 60 && fl.x < cam.x + cam.w + 60 && fl.y > cam.y - 60 && fl.y < cam.y + cam.h + 60) {
              this.flies.push({ kind: 'b', x: fl.x, y: fl.y - 6, a: Math.random() * 6.28, sp: 14 + Math.random() * 10, ph: 0, life: 12 + Math.random() * 10, col: pick(BFLY) });
              break;
            }
          }
        } else if (isNight) {
          const x = cam.x + Math.random() * cam.w, y = cam.y + Math.random() * cam.h;
          const t = world.tileAt(Math.floor(x / 16), Math.floor(y / 16));
          if (t === I.TILE.GRASS || t === I.TILE.GRASS_DARK) this.flies.push({ kind: 'f', x: x, y: y, a: Math.random() * 6.28, sp: 6 + Math.random() * 6, ph: Math.random() * 6, life: 14 + Math.random() * 10, col: null });
        }
      }
    }
  }
  I.Effects = Effects;
})((window.Iles = window.Iles || {}));
