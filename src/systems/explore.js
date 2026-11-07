/*
 * Exploration : mémoire des cases déjà vues, par monde (île, lobby, chaque dimension). Alimente la mini-map.
 * Les cases sont rangées par blocs de 32×32 (128 octets). Chaque machine la remplit elle-même à partir des positions des joueurs
 * (identiques chez l'hôte et chez les invités) ; l'historique voyage dans la sauvegarde et dans le message d'accueil des invités.
 */
(function (I) {
  const BS = 32, KM = 100000, RADIUS = 9, MAX_BLOCKS = 900;
  const key = function (bx, by) { return by * KM + bx; };

  function block(world, bx, by, create) {
    if (!world.exp) { if (!create) return null; world.exp = new Map(); }
    let b = world.exp.get(key(bx, by));
    if (!b && create) { b = new Uint8Array(BS * BS / 8); world.exp.set(key(bx, by), b); }
    return b || null;
  }

  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; }

  const explore = {
    RADIUS: RADIUS,
    known: function (world, tx, ty) {
      if (tx < 0 || ty < 0) return false;
      const b = block(world, tx >> 5, ty >> 5, false);
      if (!b) return false;
      const i = (ty & 31) * BS + (tx & 31);
      return (b[i >> 3] >> (i & 7) & 1) === 1;
    },
    mark: function (world, cx, cy, r) {
      r = r || RADIUS;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r + 1) continue;
          const b = block(world, x >> 5, y >> 5, true), i = (y & 31) * BS + (x & 31);
          b[i >> 3] |= 1 << (i & 7);
        }
      }
    },
    /** À appeler à chaque pas : explore autour de chaque joueur présent dès qu'il change de case. */
    step: function (state) {
      const w = state.world;
      for (const id in state.players) {
        const p = state.players[id];
        if (p.away) continue;
        const tx = Math.floor(p.x / 16), ty = Math.floor((p.y - 1) / 16);
        if (p.exw === w && p.exx === tx && p.exy === ty) continue;
        p.exw = w; p.exx = tx; p.exy = ty;
        explore.mark(w, tx, ty, RADIUS);
      }
    },
    pack: function (world) {
      if (!world.exp || !world.exp.size) return '';
      const out = [];
      for (const [k, b] of world.exp) {
        if (out.length >= MAX_BLOCKS) break;
        let any = false, full = true;
        for (let i = 0; i < b.length; i++) { if (b[i]) any = true; if (b[i] !== 255) full = false; }
        if (!any) continue;
        out.push((k % KM) + '.' + Math.floor(k / KM) + ':' + (full ? 'F' : b64(b)));
      }
      return out.join('|');
    },
    unpack: function (world, str) {
      world.exp = new Map();
      if (typeof str !== 'string' || !str) return;
      for (const part of str.split('|').slice(0, MAX_BLOCKS)) {
        const m = /^(\d{1,5})\.(\d{1,5}):([A-Za-z0-9+/=]{1,200})$/.exec(part);
        if (!m) continue;
        let u;
        if (m[3] === 'F') u = new Uint8Array(BS * BS / 8).fill(255);
        else { try { u = unb64(m[3]); } catch (e) { continue; } if (u.length !== BS * BS / 8) continue; }
        world.exp.set(key(+m[1], +m[2]), u);
      }
    },
  };
  I.explore = explore;
})((window.Iles = window.Iles || {}));
