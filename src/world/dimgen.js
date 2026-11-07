/*
 * Dimensions procédurales infinies.
 *   describe(seed) : l'identité d'une dimension (types de monde, 1 à 3 couleurs, nom), entièrement déterminée par la graine.
 *   tile(D, x, y)  : fonction PURE (graine, x, y) -> tuile ; c'est elle qui rend le monde infini et stable (aucune donnée stockée).
 *   ChunkWorld     : un World dont le terrain et les objets sont générés par morceaux de 32x32 cases autour des joueurs,
 *                    déchargés quand ils s'éloignent. Les modifications (objets récoltés, constructions, objets au sol) restent
 *                    dans `state` / `structures` / `drops` (clés = identifiants stables des objets) : elles survivent au déchargement
 *                    et sont sauvegardées avec le reste.
 * Ajouter un type de monde : une ligne dans ARCH. Ajouter une couleur : une ligne dans I.COLORS (rendering/tint.js).
 */
(function (I) {
  const R = I.rng, T = I.TILE, TS = I.config.TILE, fbm = R.fbm, hash2 = R.hash2;
  const CS = 32, VW = 65536, OX = 32768, KEYM = 4096;

  // ---------- types de monde : une ligne chacun (valeurs de 0 à ~1,5) ----------
  const BASE = { sea: 0.2, mount: 0, cave: 0, tree: 0.3, giant: 0, rock: 0.3, ore: 0.3, crystal: 0.1, flora: 0.5, fant: 0, sand: 0.1, stone: 0.05, glow: 0, dark: 0.2, river: 0.3 };
  const A = function (n, o) { return Object.assign({ n: n }, BASE, o); };
  const ARCH = {
    rocky: A('rocheux', { sea: 0.16, mount: 0.55, tree: 0.08, rock: 1.5, ore: 1.1, flora: 0.15, stone: 0.75, river: 0.2, dark: 0 }),
    forest: A('forestier', { sea: 0.18, mount: 0.08, tree: 1.5, giant: 0.4, rock: 0.3, ore: 0.2, crystal: 0, flora: 1, stone: 0.03, dark: 0.75, river: 0.5 }),
    aquatic: A('aquatique', { sea: 0.64, tree: 0.4, rock: 0.2, ore: 0.1, flora: 0.5, sand: 0.5, river: 0 }),
    mountain: A('montagneux', { sea: 0.16, mount: 1, tree: 0.35, rock: 0.8, ore: 0.9, stone: 0.45, river: 0.3 }),
    plains: A('de plaines', { sea: 0.1, tree: 0.1, rock: 0.08, ore: 0.1, crystal: 0, flora: 1.1, river: 0.8, dark: 0.05 }),
    crystal: A('cristallin', { sea: 0.2, mount: 0.35, tree: 0.1, rock: 0.35, ore: 0.5, crystal: 1.6, flora: 0.2, stone: 0.35, glow: 0.8 }),
    caves: A('souterrain', { sea: 0.12, cave: 1, tree: 0, rock: 0.5, ore: 1.3, crystal: 0.7, flora: 0.3, fant: 0.4, stone: 0.95, glow: 0.3, dark: 0, river: 0.15 }),
    fantasy: A('fantastique', { sea: 0.28, mount: 0.25, tree: 0.8, giant: 0.1, rock: 0.3, crystal: 0.5, flora: 1, fant: 1.5, glow: 0.5, dark: 0.4 }),
    desert: A('désertique', { sea: 0.08, mount: 0.2, tree: 0.03, rock: 0.6, ore: 0.5, flora: 0.15, sand: 1, stone: 0.1, dark: 0, river: 0 }),
    marsh: A('marécageux', { sea: 0.42, tree: 0.5, rock: 0.1, ore: 0.1, flora: 0.9, sand: 0.1, dark: 0.9, river: 0.6, fant: 0.2 }),
  };
  const KEYS = Object.keys(ARCH);

  // ---------- couleurs : 1 à 3, harmonieuses (voisines sur le cercle des teintes, complémentaires ou neutres) ----------
  function pickColors(r, n) {
    const NC = I.COLORS.length, RING = 11; // 0..10 : arc-en-ciel ; au-delà : marron, blanc, gris clair, gris, noir
    const near = function (i) { if (i >= RING) return (r() * RING) | 0; const d = 1 + ((r() * 3) | 0), s = r() < 0.5 ? -1 : 1; return (((i + s * d) % RING) + RING) % RING; };
    const comp = function (i) { return i >= RING ? (r() * RING) | 0 : (i + 5 + ((r() * 2) | 0)) % RING; };
    const out = [(r() * NC) | 0];
    while (out.length < n) {
      let c = -1, tries = 0;
      do { const u = r(); c = u < 0.5 ? near(out[out.length - 1]) : u < 0.75 ? comp(out[0]) : RING + ((r() * (NC - RING)) | 0); } while (out.indexOf(c) >= 0 && ++tries < 30);
      if (out.indexOf(c) >= 0) { c = 0; while (out.indexOf(c) >= 0) c++; }
      out.push(c);
    }
    return out.map(function (i) { return i + 1; });
  }

  // minerais classiques : [id, poids de tirage, probabilité dans une veine, part du terrain en veines] ; les nouveaux (content/ores.js) : 0,06 et 8 %
  const CLASSIC = [['copper', 3, 0.09, 0.16], ['coal', 3, 0.09, 0.16], ['iron', 2.5, 0.08, 0.14], ['silver', 1.5, 0.06, 0.1], ['gold', 1, 0.05, 0.08]];
  const cache = new Map();
  function describe(seed) {
    seed = Math.abs(seed | 0) % 2147483647;
    let D = cache.get(seed);
    if (D) return D;
    const r = R.mulberry32(seed ^ 0x5bd1e995);
    r(); r();
    const a = KEYS[(r() * KEYS.length) | 0];
    let b = null;
    if (r() < 0.45) { do { b = KEYS[(r() * KEYS.length) | 0]; } while (b === a); }
    const u = r(), n = u < 0.3 ? 1 : u < 0.72 ? 2 : 3;
    const pal = pickColors(r, n);
    const cn = pal.map(function (c) { return I.COLORS[c - 1].name.toLowerCase(); });
    // minerais de cette dimension : 2 ou 3 sur les 10 possibles, jamais tous ; plus ou moins riche
    const pool = I.ORE_POOL.map(function (o) { return { id: o.id, w: o.w, k: 0 }; }).concat(CLASSIC.map(function (c) { return { id: c[0], w: c[1], k: 0 }; }));
    const nOre = r() < 0.65 ? 2 : 3, ores = [];
    for (let i = 0; i < nOre; i++) {
      let tot = 0; pool.forEach(function (q) { tot += q.w; });
      let u2 = r() * tot, j = 0; while (j < pool.length - 1 && u2 > pool[j].w) { u2 -= pool[j].w; j++; }
      const q = pool.splice(j, 1)[0], cl = CLASSIC.filter(function (c) { return c[0] === q.id; })[0];
      ores.push({ type: 'ore_' + q.id, p: cl ? cl[2] : 0.06, vf: cl ? cl[3] : 0.08, k: ores.length + 1 + ((r() * 90) | 0) });
    }
    const rich = 0.7 + r() * 0.7;
    D = {
      ores: ores, rich: rich, seed: seed, id: 'd:' + seed, a: a, b: b, A: ARCH[a], B: ARCH[b || a], pal: pal, n: n,
      name: 'Monde ' + ARCH[a].n + (b ? ' et ' + ARCH[b].n : '') + ' (' + cn.join(' + ') + ')',
      colors: cn, spawn: null, tileCache: null,
    };
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    cache.set(seed, D);
    return D;
  }

  // ---------- le terrain : une fonction pure de (graine, x, y) ----------
  let LM = 0; // « mélange » entre les deux types de monde au dernier appel de tile()
  function zup(p) { // z tel que P(Z > z) = p (loi normale, approximation d'Abramowitz-Stegun)
    if (p > 0.5) return -zup(1 - p);
    const t = Math.sqrt(-2 * Math.log(p));
    return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  }
  const th = function (p) { return 0.5 + 0.16 * zup(p < 0.003 ? 0.003 : p > 0.997 ? 0.997 : p); }; // seuil de bruit (fbm) pour qu'une part p du terrain le dépasse
  const sm = function (a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

  function tile(D, x, y) {
    const s = D.seed, a = D.A, b = D.B;
    const mix = D.b ? sm(0.38, 0.62, fbm(x * 0.01, y * 0.01, s + 77, 2)) : 0;
    LM = mix;
    const g = function (k) { return a[k] + (b[k] - a[k]) * mix; };
    const wx = x + (fbm(x * 0.03, y * 0.03, s + 3, 2) - 0.5) * 16, wy = y + (fbm(x * 0.03 + 50, y * 0.03 + 50, s + 4, 2) - 0.5) * 16;
    const e = (fbm(wx * 0.026, wy * 0.026, s + 1, 4) - 0.5) * 2.1 + 0.5;
    const tw = 0.5 + 0.65 * (g('sea') - 0.5); // niveau de l'eau
    if (e < tw - 0.075) return T.DEEP;
    if (e < tw) return T.SHALLOW;

    // cavernes : la roche emplit tout, sauf des salles et des tunnels
    const cave = g('cave');
    if (cave > 0.03) {
      const n1 = fbm(x * 0.05, y * 0.05, s + 9, 3), n2 = fbm(x * 0.04 + 300, y * 0.04 + 120, s + 10, 3);
      if (n1 < 0.355 + 0.15 * cave && Math.abs(n2 - 0.5) > 0.03 * cave) return T.WALL;
    }
    // reliefs : crêtes (pics, falaises) et contreforts
    const m = g('mount');
    if (m > 0.03) {
      const rd = Math.max(0, 1 - Math.abs(2 * fbm(wx * 0.04 + 600, wy * 0.04 + 600, s + 2, 3) - 1) * 2.4);
      const mh = m * (rd * 0.55 + (e - 0.5) * 1.2 + 0.12);
      if (mh > 0.5) return Math.abs(fbm(wx * 0.035 + 1200, wy * 0.035 + 800, s + 17, 3) - 0.5) < 0.035 ? T.STONE : T.WALL; // des passes traversent les massifs
      if (mh > 0.38) return T.STONE;
    }
    // rivières et petits lacs
    const rv = g('river');
    if (rv > 0.03) {
      const q = Math.abs(fbm(wx * 0.018 + 900, wy * 0.018 + 400, s + 11, 3) - 0.5), w = 0.016 * rv;
      if (q < w * 0.4) return T.DEEP;
      if (q < w) return T.SHALLOW;
    }
    // sol
    const sd = g('sand');
    if (e < tw + 0.03 + sd * 0.012) return T.SAND; // plage
    if (sd > 0.2 && fbm(x * 0.045 + 1500, y * 0.045 + 1500, s + 12, 3) > th(sd * 0.75)) return T.SAND; // dunes
    const gl = g('glow');
    if (gl > 0.05 && fbm(x * 0.06 + 2600, y * 0.06 + 1100, s + 15, 3) > th(gl * 0.45)) return T.GLOW;
    if (fbm(x * 0.05 + 2000, y * 0.05 + 700, s + 13, 3) > th(g('stone'))) return T.STONE;
    if (fbm(x * 0.08 + 100, y * 0.08, s + 14, 3) > th(0.15 + g('dark') * 0.5)) return T.GRASS_DARK;
    if (fbm(x * 0.07 + 3100, y * 0.07 + 40, s + 16, 3) > th(0.1)) return T.DIRT;
    return T.GRASS;
  }

  /** Zone de couleur (0..n-1) : de grandes taches, au bord légèrement déchiqueté. */
  function zone(D, x, y) {
    if (D.n === 1) return 0;
    const z = fbm(x * 0.017 + 7, y * 0.017, D.seed + 55, 2) + (hash2(x, y, D.seed + 56) - 0.5) * 0.03;
    const i = Math.floor(((z - 0.36) / 0.28) * D.n);
    return i < 0 ? 0 : i >= D.n ? D.n - 1 : i;
  }
  // rôles : décalage dans la palette selon ce que l'on colore
  const ROLE = { ground: 0, water: 1, veg: 1, wall: 2, ore: 2, crystal: 2, rock: 0 };
  const colorIn = function (D, z, role) { return D.pal[(z + ROLE[role]) % D.n]; };

  // ---------- objets : une case -> au plus un objet ----------
  const VAR = { tree_oak: 3, tree_pine: 3, tree_blossom: 3, rock: 3, crystal: 3, ore_copper: 3, flower_red: 2, flower_blue: 2, flower_yellow: 2, tuft: 3, bush_berry: 1, mushroom: 1, tree_giant: 3 };
  I.NATURE.forEach(function (n) { VAR[n.id] = n.spr; });
  I.ORE_POOL.forEach(function (o) { VAR['ore_' + o.id] = 3; });
  const TREES = ['tree_oak', 'tree_pine', 'tree_birch', 'tree_maple', 'tree_cypress', 'tree_autumn', 'tree_acacia'];
  const FANT_TREES = ['tree_shroom', 'tree_blossom', 'bamboo', 'tree_shroom', 'tree_autumn', 'tree_dead'];
  const FLOWERS = ['flower_red', 'flower_blue', 'flower_yellow', 'flower_white', 'flower_pink', 'flower_purple', 'flower_orange', 'sunflower'];
  const LAND = {}; LAND[T.GRASS] = LAND[T.GRASS_DARK] = LAND[T.SAND] = LAND[T.DIRT] = LAND[T.STONE] = LAND[T.GLOW] = 1;

  function giantSite(D, x, y, t, tr, cl) { // grand arbre : un par bloc de 4x4 au plus
    return tr.giant > 0 && (x & 3) === 0 && (y & 3) === 0 && (t === T.GRASS || t === T.GRASS_DARK) && hash2(x, y, D.seed + 120) < Math.min(0.85, tr.giant * tr.tree * (0.1 + 0.7 * cl));
  }

  function genObjects(D, x0, y0, tl, zn, mx, M, out) {
    const s = D.seed, sp = D.spawnT, wat = function (t) { return t <= 1; };
    const col = function (z, role) { return colorIn(D, z, role); };
    const add = function (type, x, y, z, role, vv) {
      const v = VAR[type] || 1;
      out.push({ id: x + ',' + y, type: type, x: x * TS + 8, y: y * TS + 16, variant: (vv * v) | 0, c: col(z, role) });
    };
    for (let j = 0; j < CS; j++) {
      for (let i = 0; i < CS; i++) {
        const k = (j + 1) * M + i + 1, t = tl[k];
        if (!LAND[t]) continue;
        const x = x0 + i, y = y0 + j;
        if (Math.abs(x - sp.x) < 9 && y > sp.y - 6 && y < sp.y + 10) continue; // place dégagée autour du portail
        const mix = mx[k], z = zn[k];
        const g = function (key) { return D.A[key] + (D.B[key] - D.A[key]) * mix; };
        const h1 = hash2(x, y, s + 101), h2 = hash2(x, y, s + 102), h3 = hash2(x, y, s + 103);
        const nw = wat(tl[k - 1]) || wat(tl[k + 1]) || wat(tl[k - M]) || wat(tl[k + M]); // au bord de l'eau
        const nWall = tl[k - 1] === T.WALL || tl[k + 1] === T.WALL || tl[k - M] === T.WALL || tl[k + M] === T.WALL;
        const tr = { tree: g('tree'), giant: g('giant'), fant: g('fant') };
        const cl = sm(0.42, 0.62, fbm(x * 0.07 + 700, y * 0.07 + 20, s + 2, 2)); // bosquets : les arbres se regroupent

        // --- grands arbres, puis arbres ---
        if (giantSite(D, x, y, t, tr, cl)) { add('tree_giant', x, y, z, 'veg', h2); continue; }
        if (tr.tree > 0 && (x & 1) === 0 && (y & 1) === 0 && (t === T.GRASS || t === T.GRASS_DARK || t === T.GLOW || t === T.DIRT || (t === T.SAND && nw) || (t === T.STONE && h3 < 0.1))) {
          let near = false; // pas sous un grand arbre
          if (tr.giant > 0) for (let gy = (y >> 2) << 2; gy <= ((y + 3) >> 2) << 2 && !near; gy += 4) for (let gx = (x >> 2) << 2; gx <= ((x + 3) >> 2) << 2; gx += 4) {
            if (Math.abs(gx - x) <= 2 && Math.abs(gy - y) <= 2 && giantSite(D, gx, gy, tile(D, gx, gy), { giant: tr.giant, tree: tr.tree }, cl)) { near = true; break; }
          }
          const sn = fbm(x * 0.07 + 700, y * 0.07, s + 2, 2);
          if (!near && h1 < Math.min(0.92, tr.tree * (0.05 + 0.6 * cl) * 1.1)) {
            let type;
            if (t === T.SAND) type = 'tree_palm';
            else if (t === T.STONE) type = h2 < 0.5 ? 'tree_dead' : 'tree_cypress';
            else if (h3 < tr.fant / (1 + tr.fant) * 0.9) type = FANT_TREES[Math.min(FANT_TREES.length - 1, (sn * FANT_TREES.length * 1.4) | 0)];
            else if (nw && h2 < 0.4) type = 'tree_willow';
            else type = TREES[Math.min(TREES.length - 1, Math.max(0, ((sn - 0.3) * TREES.length * 2.2) | 0))];
            add(type, x, y, z, 'veg', h2);
            continue;
          }
        }
        // --- minerais : rares, en veines (taches), seulement ceux de cette dimension ; surtout sur la pierre et au pied des falaises ---
        const ore = g('ore');
        if (ore > 0) {
          const base = ore * D.rich * (t === T.STONE || t === T.GLOW ? 1 : 0.45) * (nWall ? 2.2 : 1);
          if (h1 < 0.1 * base) {
            let placed = false;
            for (const q of D.ores) {
              if (h1 >= q.p * base || fbm(x * 0.08 + q.k * 97, y * 0.08 + q.k * 31, s + 200 + q.k, 2) <= th(q.vf)) continue;
              add(q.type, x, y, z, 'ore', h3); placed = true; break;
            }
            if (placed) continue;
          }
        }
        const cr = g('crystal');
        if (cr > 0 && h1 < cr * (t === T.GLOW ? 0.07 : 0.004 + (t === T.STONE ? 0.012 : 0))) { add('crystal', x, y, z, 'crystal', h2); continue; }
        const rk = g('rock'), rc = sm(0.52, 0.72, fbm(x * 0.11 + 300, y * 0.11 + 50, s + 3, 2));
        if (rk > 0 && h1 < rk * (0.004 + 0.15 * rc * (t === T.STONE ? 1.5 : 1))) {
          const type = t === T.SAND ? 'rock_sandstone' : t === T.GRASS_DARK ? 'rock_mossy' : h2 < 0.15 ? 'rock_big' : h2 < 0.3 ? 'rock_slate' : h2 < 0.36 ? 'rock_pink' : 'rock';
          add(type, x, y, z, 'rock', h3);
          continue;
        }
        // --- plantes ---
        const fl = g('flora');
        if (fl > 0) {
          if (t === T.SAND) {
            if (nw && h1 < 0.18 * fl + 0.05) { add('reeds', x, y, z, 'veg', h2); continue; }
            if (!nw && g('sand') > 0.5 && h1 < 0.012 * fl + 0.01) { add('cactus', x, y, z, 'veg', h2); continue; }
            if (nw && h2 < 0.05) { add('clay', x, y, z, 'rock', 0); continue; }
            if (h3 < 0.01) { add('pebbles', x, y, z, 'rock', h2); continue; }
          } else if (t === T.GRASS_DARK) {
            if (h1 < 0.06 * fl) { add('fern', x, y, z, 'veg', h2); continue; }
            if (h2 < 0.03 * fl) { add(h3 < 0.5 ? 'mushroom_brown' : 'mushroom', x, y, z, 'veg', 0); continue; }
            if (h3 < 0.012 * fl) { add('bush_blueberry', x, y, z, 'veg', 0); continue; }
          } else if (t === T.GRASS || t === T.GLOW || t === T.DIRT) {
            const fz = fbm(x * 0.14 + 500, y * 0.14 + 9, s + 4, 2);
            if (tr.fant > 0.1 && h2 < 0.03 * tr.fant) { add(h3 < 0.5 ? 'mushroom_blue' : 'log_fallen', x, y, z, 'veg', h1); continue; }
            if (t === T.GRASS && fz > 0.58 && h1 < 0.4 * fl) { add(FLOWERS[Math.floor(hash2(x >> 2, y >> 2, s + 8) * FLOWERS.length)], x, y, z, 'veg', h2); continue; }
            if (h1 < 0.012 * fl) { add(h2 < 0.5 ? 'bush_berry' : 'bush_blueberry', x, y, z, 'veg', 0); continue; }
            if (t !== T.DIRT && h3 < 0.07 * fl) { add(h2 < 0.35 ? 'tall_grass' : 'tuft', x, y, z, 'veg', h1); continue; }
          } else if (t === T.STONE && h3 < 0.01 * fl) { add('pebbles', x, y, z, 'rock', h2); continue; }
        }
      }
    }
  }

  // ---------- un morceau de 32x32 cases ----------
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  function genChunk(D, cx, cy) {
    const x0 = cx * CS, y0 = cy * CS, M = CS + 2;
    if (!D.spawnT) D.spawnT = findSpawn(D);
    const tl = new Uint8Array(M * M), zn = new Uint8Array(M * M), mx = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = x0 + i - 1, y = y0 + j - 1, k = j * M + i;
      tl[k] = tile(D, x, y); mx[k] = LM; zn[k] = zone(D, x, y);
    }
    const ground = new Uint8Array(CS * CS), edges = new Uint8Array(CS * CS), zones = new Uint8Array(CS * CS);
    for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
      const k = (j + 1) * M + i + 1, t = tl[k];
      ground[j * CS + i] = t; zones[j * CS + i] = zn[k];
      let fr = 0, foam = 0;
      for (let d = 0; d < 4; d++) {
        const n = tl[k + DX[d] + DY[d] * M], nGrass = n === T.GRASS || n === T.GRASS_DARK;
        if ((t === T.SAND || t === T.DIRT) && nGrass) fr |= 1 << d;
        else if (t === T.GRASS_DARK && n === T.GRASS) fr |= 1 << d;
        else if (t === T.DEEP && n === T.SHALLOW) fr |= 1 << d;
        if (t <= 1 && n >= T.SAND && n !== T.WALL) foam |= 1 << d;
      }
      edges[j * CS + i] = fr | (foam << 4);
    }
    const objs = [];
    genObjects(D, x0, y0, tl, zn, mx, M, objs);
    return { cx: cx, cy: cy, ground: ground, edges: edges, zones: zones, objs: objs, flowers: objs.filter(function (o) { return o.type.indexOf('flower') === 0; }) };
  }

  // ---------- point d'arrivée : un terrain dégagé, relié à une grande zone praticable ----------
  const ok = function (t) { return t !== T.WALL; }; // marchable ou nageable
  const land = function (t) { return t >= T.SAND && t !== T.WALL && t !== T.PLANK; };
  function findSpawn(D) {
    const visit = new Map();
    const tt = function (x, y) { const k = y * VW + x; let v = visit.get(k); if (v === undefined) { v = tile(D, x, y); visit.set(k, v); } return v; };
    const roomy = function (cx, cy) {
      const seen = new Set([cy * VW + cx]), q = [cx, cy];
      for (let h = 0; h < q.length && seen.size < 2500; h += 2) {
        for (let d = 0; d < 4; d++) {
          const x = q[h] + DX[d], y = q[h + 1] + DY[d], k = y * VW + x;
          if (seen.has(k) || Math.abs(x - cx) > 70 || Math.abs(y - cy) > 70 || !ok(tt(x, y))) continue;
          seen.add(k); q.push(x, y);
        }
      }
      return seen.size >= 2500;
    };
    let best = null;
    for (let r = 0; r < 900 && !best; r += 4) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r * 0.9));
      for (let a = 0; a < n && !best; a++) {
        const cx = Math.round(OX + Math.cos(a / n * 6.2832) * r), cy = Math.round(OX + Math.sin(a / n * 6.2832) * r);
        let good = true;
        for (let dy = -3; dy <= 5 && good; dy++) for (let dx = -5; dx <= 5; dx++) if (!land(tt(cx + dx, cy + dy))) { good = false; break; }
        if (good && roomy(cx, cy)) best = { x: cx, y: cy };
      }
    }
    return best || { x: OX, y: OX };
  }

  function initialMap(D) {
    if (!D.spawnT) D.spawnT = findSpawn(D);
    const sp = D.spawnT;
    return {
      W: VW, H: VW, ground: null, edges: null, objects: [], drops: [], nextId: 1,
      spawn: { x: sp.x * TS + 8, y: sp.y * TS + 16 + 30 },
      meta: { dim: D, portal: { x: sp.x * TS + 8, y: sp.y * TS + 16 } },
    };
  }

  // ---------- le monde par morceaux ----------
  class ChunkWorld extends I.World {
    constructor(seed) {
      const D = describe(seed);
      super(D.seed, { dim: D });
      this.D = D; this.lazy = true; this.chunked = true; this.chunks = new Map(); this.flowers = [];
      const sp = D.spawnT;
      const portal = this.addPortal({ id: 'dimportal', type: 'dim_portal', x: sp.x * TS + 8, y: sp.y * TS + 16, variant: 0, c: D.pal[0] });
      this.portalObj = portal;
    }
    addPortal(o) { this.objects.push(o); this._register(o); return o; }

    _chunk(tx, ty) { return this.chunks.get((ty >> 5) * KEYM + (tx >> 5)); }
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= VW || ty >= VW) return 0;
      const c = this._chunk(tx, ty);
      return c ? c.ground[(ty & 31) * CS + (tx & 31)] : tile(this.D, tx, ty);
    }
    edgeAt(tx, ty) { const c = this._chunk(tx, ty); return c ? c.edges[(ty & 31) * CS + (tx & 31)] : 0; }
    colorOf(tx, ty, t) {
      const c = this._chunk(tx, ty), z = c ? c.zones[(ty & 31) * CS + (tx & 31)] : zone(this.D, tx, ty);
      return colorIn(this.D, z, t <= 1 ? 'water' : t === T.WALL ? 'wall' : 'ground');
    }

    _load(cx, cy) {
      const key = cy * KEYM + cx;
      if (this.chunks.has(key)) return;
      const c = genChunk(this.D, cx, cy);
      this.chunks.set(key, c);
      for (const o of c.objs) { o.chunk = key; this._register(o); }
      this._flowers();
    }
    _unload(key) {
      const c = this.chunks.get(key);
      for (const o of c.objs) {
        this.byId.delete(o.id);
        const k = this._bucketKey(o), b = this.buckets.get(k);
        if (b) { const i = b.indexOf(o); if (i >= 0) { b[i] = b[b.length - 1]; b.pop(); } if (!b.length) this.buckets.delete(k); }
      }
      this.chunks.delete(key);
      this._flowers();
    }
    _flowers() { const f = []; for (const c of this.chunks.values()) for (const o of c.flowers) f.push(o); this.flowers = f; }

    /** Charge les morceaux autour des points (px) : le plus proche (rayon 1) tout de suite, le reste à raison de `budget` par appel ; décharge les lointains. */
    update(points, budget) {
      const need = [], keep = new Set();
      for (const p of points) {
        const pcx = Math.floor(p.x / (CS * TS)), pcy = Math.floor(p.y / (CS * TS));
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const cx = pcx + dx, cy = pcy + dy, key = cy * KEYM + cx, d = Math.max(Math.abs(dx), Math.abs(dy));
          if (cx < 0 || cy < 0 || cx >= VW / CS || cy >= VW / CS) continue;
          keep.add(key);
          if (d <= 2 && !this.chunks.has(key)) need.push({ cx: cx, cy: cy, d: d + (Math.abs(dx) + Math.abs(dy)) * 0.01 });
        }
      }
      need.sort(function (a, b) { return a.d - b.d; });
      for (const n of need) { if (n.d < 1.5 || budget-- > 0) this._load(n.cx, n.cy); }
      for (const key of Array.from(this.chunks.keys())) if (!keep.has(key)) this._unload(key);
    }
  }

  I.dimgen = { describe: describe, tile: tile, zone: zone, initialMap: initialMap, genChunk: genChunk, ARCH: ARCH, CS: CS, VW: VW, ORIGIN: OX };
  I.ChunkWorld = ChunkWorld;
})((window.Iles = window.Iles || {}));
