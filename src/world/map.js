/* Génération déterministe de l'archipel à partir d'une graine. */
(function (I) {
  const C = I.config, T = I.TILE, R = I.rng;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W

  function generateMap(seed, opts) {
    if (opts && opts.lobby) return I.generateLobby(seed);
    if (opts && opts.dim) return I.dimgen.initialMap(opts.dim);
    const W = C.MAP_W, H = C.MAP_H, TS = C.TILE;
    const g = new Uint8Array(W * H); // 0 = eau profonde
    const at = function (x, y) { return (x < 0 || y < 0 || x >= W || y >= H) ? T.DEEP : g[y * W + x]; };
    const walk = function (t) { return I.WALKABLE[t]; };

    // --- îles ---
    const blobs = [
      { cx: 38, cy: 35, rx: 27, ry: 21 },
      { cx: 68, cy: 12, rx: 7, ry: 5.5 },
      { cx: 9, cy: 54, rx: 7, ry: 5.5 },
      { cx: 70, cy: 55, rx: 6, ry: 5 },
      { cx: 9, cy: 11, rx: 5.5, ry: 5 },
    ];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = R.fbm(x * 0.09, y * 0.09, seed, 3) - 0.5;
        let best = -9;
        for (const b of blobs) {
          const d = Math.hypot((x - b.cx) / b.rx, (y - b.cy) / b.ry);
          best = Math.max(best, 1 - d + n * 0.6);
        }
        if (best > 0.1) g[y * W + x] = best < 0.2 ? T.SAND : T.GRASS;
      }
    }

    // --- eau peu profonde autour des côtes ---
    function landNear(x, y, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(at(x + dx, y + dy))) return true;
      return false;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (g[y * W + x] !== T.DEEP) continue;
        if (landNear(x, y, 2) || (landNear(x, y, 3) && R.fbm(x * 0.2, y * 0.2, seed + 5, 2) > 0.55)) g[y * W + x] = T.SHALLOW;
      }
    }

    // --- étang ---
    for (let y = 34; y <= 48; y++) {
      for (let x = 20; x <= 35; x++) {
        const i = y * W + x;
        if (!walk(g[i])) continue;
        const d = Math.hypot((x - 27) / 4.6, (y - 41) / 3.3) + (R.fbm(x * 0.3, y * 0.3, seed + 6, 2) - 0.5) * 0.4;
        if (d < 1) g[i] = d < 0.5 ? T.DEEP : T.SHALLOW;
        else if (d < 1.4 && g[i] === T.GRASS) g[i] = T.SAND;
      }
    }

    // --- sous-bois sombre ---
    const forest = function (x, y) { return R.fbm(x * 0.09 + 100, y * 0.09, seed + 1, 3); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y * W + x] === T.GRASS && forest(x, y) > 0.58) g[y * W + x] = T.GRASS_DARK;
    }
    for (let y = 24; y <= 34; y++) for (let x = 31; x <= 45; x++) {
      if (g[y * W + x] === T.GRASS_DARK) g[y * W + x] = T.GRASS;
    }

    // --- chemins de terre ---
    function dirt(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const t = g[y * W + x];
      if (t === T.GRASS || t === T.GRASS_DARK || t === T.SAND) g[y * W + x] = T.DIRT;
    }
    function vpath(x, y0, y1) {
      for (let y = y0; y <= y1; y++) {
        const w = R.hash2(x, y, seed + 20) > 0.85 ? 1 : 0;
        dirt(x + w, y); dirt(x + 1 + w, y);
      }
    }
    function hpath(x0, x1, y) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const w = R.hash2(x, y, seed + 21) > 0.85 ? 1 : 0;
        dirt(x, y + w); dirt(x, y + 1 + w);
      }
    }
    vpath(37, 30, 39);
    hpath(38, 45, 39);
    let shore = 41;
    while (shore < H - 1 && walk(at(45, shore))) shore++;
    vpath(45, 40, shore - 1);
    hpath(24, 37, 35);
    vpath(24, 28, 35);

    // --- ponton ---
    for (let y = shore; y < shore + 6 && y < H; y++) {
      for (let x = 45; x <= 46; x++) if (!walk(g[y * W + x])) g[y * W + x] = T.PLANK;
    }

    // --- objets ---
    const occ = new Uint8Array(W * H);
    const objects = [], drops = [];
    let nid = 1;
    function reserve(x0, y0, x1, y1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ[y * W + x] = 1;
    }
    function addObj(type, tx, ty, variant) {
      objects.push({ id: tx + ',' + ty, type: type, x: tx * TS + 8, y: ty * TS + 16, variant: variant || 0 });
      occ[ty * W + tx] = 1;
    }
    // (plus de maison préconstruite : le joueur bâtit la sienne ; l'emplacement reste dégagé)
    reserve(33, 25, 42, 32);
    objects.push({ id: 'workbench', type: 'workbench', x: 35 * TS + 8, y: 31 * TS + 16, variant: 0 });
    objects.push({ id: 'portal', type: 'portal', x: 25 * TS, y: 28 * TS, variant: 0 });
    reserve(22, 25, 27, 28);
    objects.push({ id: 'sign1', type: 'signpost', x: 40 * TS + 8, y: 37 * TS, variant: 0 });
    reserve(40, 36, 40, 36);
    addObj('crate', 41, 29, 0); addObj('crate', 42, 29, 1); addObj('barrel', 41, 30, 0);

    const treeG = new Uint8Array(W * H);
    function spaced(x, y) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (treeG[(y + dy) * W + x + dx]) return false;
      return true;
    }
    const FL = ['flower_red', 'flower_blue', 'flower_yellow'];
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x, t = g[i];
        if (occ[i]) continue;
        const grass = t === T.GRASS || t === T.GRASS_DARK;
        const dh = Math.hypot(x - 38, y - 29), dp = Math.hypot(x - 25, y - 27);
        const r1 = R.hash2(x, y, seed + 11), r2 = R.hash2(x, y, seed + 12), r3 = R.hash2(x, y, seed + 13);
        const f = forest(x, y);

        // arbres
        let p = f > 0.58 ? 0.3 : f > 0.5 ? 0.06 : 0.012;
        if (dh > 7 && dh < 17) p += 0.07;
        if (grass && dh > 6 && dp > 5 && r1 < p && spaced(x, y)) {
          const sn = R.fbm(x * 0.07 + 700, y * 0.07, seed + 2, 2);
          let type = 'tree_oak';
          if (sn > 0.62) type = 'tree_blossom'; else if (sn < 0.34 || y < 24) type = 'tree_pine';
          addObj(type, x, y, (r2 * 3) | 0);
          treeG[i] = 1;
          continue;
        }
        // cristaux près du portail, ou très rares ailleurs
        if (grass && ((dp < 7 && dp > 3.2 && r2 < 0.07) || (dh > 24 && r3 < 0.0015))) { addObj('crystal', x, y, (r1 * 3) | 0); continue; }
        // rochers et minerais
        const rn = R.fbm(x * 0.11 + 300, y * 0.11 + 50, seed + 3, 2);
        if ((grass || t === T.SAND) && dh > 8 && dp > 6) {
          let pr = rn > 0.62 ? 0.26 : 0.004;
          if (dh < 18 && x > 41) pr += 0.06;
          if (r1 < pr) { addObj(r2 < 0.3 && dh > 12 ? 'ore_copper' : 'rock', x, y, (r3 * 3) | 0); continue; }
        }
        // buissons
        if (grass && dp > 4 && ((f > 0.4 && f < 0.58 && r2 < 0.05) || (dh > 6 && dh < 14 && r2 < 0.015))) { addObj('bush_berry', x, y, 0); continue; }
        // fleurs
        const fl = R.fbm(x * 0.14 + 500, y * 0.14 + 9, seed + 4, 2);
        if (t === T.GRASS && dh > 4 && ((fl > 0.58 && r2 < 0.45) || r2 < 0.012)) {
          addObj(FL[Math.floor(R.hash2(x >> 2, y >> 2, seed + 8) * 3)], x, y, (r3 * 2) | 0);
          continue;
        }
        if (grass && r3 < 0.07) { addObj('tuft', x, y, (r1 * 3) | 0); continue; }
        if (t === T.GRASS_DARK && r2 < 0.025) { addObj('mushroom', x, y, 0); continue; }

        // objets posés au sol
        let item = null, pd = 0;
        if (grass && f > 0.45 && r3 < 0.02) item = 'stick';
        else if ((grass || t === T.DIRT || t === T.SAND) && r2 < 0.006) item = 'stone';
        else if (t === T.SAND && r1 < 0.04) item = 'shell';
        if (item) {
          drops.push({ id: 'g' + (nid++), item: item, qty: 1, x: x * TS + 4 + r1 * 8, y: y * TS + 6 + r2 * 6 + pd, z: 0, vx: 0, vy: 0, vz: 0, age: 1, pop: false });
        }
      }
    }

    // --- nature supplémentaire (content/nature.js) : seulement sur des cases libres, donc les identifiants des objets d'origine ne changent pas ---
    const KEY = {}; KEY[T.GRASS] = 'g'; KEY[T.GRASS_DARK] = 'd'; KEY[T.SAND] = 's';
    function nearWater(x, y, r) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = at(x + dx, y + dy); if (t === T.SHALLOW || t === T.DEEP) return true; }
      return false;
    }
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x, k = KEY[g[i]];
        if (occ[i] || !k) continue;
        const dh = Math.hypot(x - 38, y - 29), dp = Math.hypot(x - 25, y - 27), h = R.hash2(x, y, seed + 31), zv = {};
        let acc = 0;
        for (const n of I.NATURE) {
          const q = n.gen;
          if (q.t.indexOf(k) < 0 || dh < q.dh || dp < (q.dp || 4) || (q.hmax && dh > q.hmax)) continue;
          if (q.z) { const off = q.z[0]; if (zv[off] === undefined) zv[off] = R.fbm(x * 0.09 + off, y * 0.09 + off * 0.37, seed + 50, 2); if (zv[off] <= q.z[1]) continue; }
          acc += q.p;
          if (h >= acc) continue;
          if (q.w && !nearWater(x, y, q.w)) break;
          if (q.tree) { if (!spaced(x, y)) break; treeG[i] = 1; }
          addObj(n.id, x, y, (R.hash2(x, y, seed + 32) * n.spr) | 0);
          break;
        }
      }
    }

    // --- couleur des objets naturels (prépare les dimensions de couleur) ---
    //  opts.tint = c : tout le monde est de la couleur c (arbres, rochers, plantes) et donne des matériaux de cette couleur.
    //  opts.groves : 16 petits bosquets, un par couleur, sur des cases libres (les identifiants des autres objets ne changent pas). Désactivés par défaut :
    //  l'île de départ n'a plus d'arbres ni de plantes de couleur.
    const KEEP = { house: 1, portal: 1, workbench: 1 };
    if (opts && opts.tint) {
      for (const o of objects) if (!KEEP[o.id]) o.c = opts.tint | 0;
    } else if (opts && opts.groves) { // les 16 bosquets colorés n'existent plus sur l'île de départ (seulement sur demande : tests, futures dimensions)
      const ORE = ['ore_copper', 'ore_iron', 'ore_silver', 'ore_gold'];
      const PATTERN = [[-2, -1, 'tree_oak'], [2, -1, 'tree_pine'], [0, -2, 'tree_birch'], [-1, 1, 'rock'], [1, 1, null], [-2, 2, 'tuft'], [0, 2, 'tuft'], [2, 2, 'tuft']];
      const centers = [], cand = [];
      for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) cand.push([R.hash2(x, y, seed + 90), x, y]);
      cand.sort(function (a, b) { return a[0] - b[0]; }); // toutes les cases, dans un ordre mélangé mais fixe
      for (let k = 0; k < I.COLORS.length; k++) {
        let best = null, bestScore = 3; // il faut au moins 4 cases libres sur 8, dont un arbre, un rocher ou minerai, et une herbe
        for (let n = 0; n < cand.length; n++) {
          const cx = cand[n][1], cy = cand[n][2];
          const dh = Math.hypot(cx - 38, cy - 29), dp = Math.hypot(cx - 25, cy - 27);
          if (dh < 10 || dp < 8 || centers.some(function (c) { return Math.hypot(c[0] - cx, c[1] - cy) < 6; })) continue;
          let score = 0, tr = 0, ro = 0, tu = 0;
          for (const q of PATTERN) {
            const i = (cy + q[1]) * W + cx + q[0], t = g[i];
            if (occ[i] || !(t === T.GRASS || t === T.GRASS_DARK)) continue;
            score++; if (!q[2] || q[2] === 'rock') ro++; else if (q[2] === 'tuft') tu++; else tr++;
          }
          if (score > bestScore && tr && ro && tu) { best = [cx, cy]; bestScore = score; if (score === PATTERN.length) break; }
        }
        if (!best) continue;
        const cx = best[0], cy = best[1];
        centers.push(best);
        for (const q of PATTERN) {
          const x = cx + q[0], y = cy + q[1], i = y * W + x, t = g[i];
          if (occ[i] || !(t === T.GRASS || t === T.GRASS_DARK)) continue;
          addObj(q[2] || ORE[k % ORE.length], x, y, (R.hash2(x, y, seed + 92) * 3) | 0);
          objects[objects.length - 1].c = k + 1;
          if (q[2] && q[2].indexOf('tree') === 0) treeG[i] = 1;
        }
      }
    }

    // --- bords de tuiles (transitions) : bits N=1 E=2 S=4 W=8 ; foam dans les bits 4-7 ---
    const edges = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = g[y * W + x];
        let fr = 0, foam = 0;
        for (let d = 0; d < 4; d++) {
          const n = at(x + DX[d], y + DY[d]);
          const nGrass = n === T.GRASS || n === T.GRASS_DARK;
          if (t === T.SAND && nGrass) fr |= 1 << d;
          else if (t === T.DIRT && nGrass) fr |= 1 << d;
          else if (t === T.GRASS_DARK && n === T.GRASS) fr |= 1 << d;
          else if (t === T.DEEP && n === T.SHALLOW) fr |= 1 << d;
          if ((t === T.DEEP || t === T.SHALLOW) && n >= T.SAND) foam |= 1 << d;
        }
        edges[y * W + x] = fr | (foam << 4);
      }
    }

    return {
      W: W, H: H, ground: g, edges: edges, objects: objects, drops: drops, nextId: nid,
      spawn: { x: 38 * TS, y: 30 * TS + 14 },
      meta: { portal: { x: 25 * TS, y: 28 * TS } },
    };
  }

  I.generateMap = generateMap;
})((window.Iles = window.Iles || {}));
