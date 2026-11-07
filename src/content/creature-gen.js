/*
 * Générateur d'espèces de créatures passives. Une espèce est une fonction PURE de (graine de la dimension, indice) : rien n'est stocké,
 * l'hôte et les invités en coop obtiennent exactement la même espèce. Chaque dimension a 4 à 6 espèces, colorées avec SA palette.
 *   species(D, i) -> { plan, size, bw, bh, leg, head, ears, horns, tail, pattern, belly, extra, eyes, col:{body,alt,acc,pat}, speed, shy, herd:[min,max], hab, name, ... }
 * Ajouter un plan de corps : le nommer dans PLANS + le dessiner dans rendering/creature-art.js. Ajouter un trait : une liste de plus ci-dessous.
 */
(function (I) {
  const R = I.rng, T = I.TILE;
  const PLANS = ['quad', 'biped', 'blob', 'serpent', 'bug'];
  const SIZES = [{ n: 'minuscule', bw: 7, bh: 5, herd: [6, 11], hp: 1 }, { n: 'petite', bw: 10, bh: 7, herd: [4, 8], hp: 2 }, { n: 'moyenne', bw: 14, bh: 9, herd: [3, 6], hp: 3 }, { n: 'grande', bw: 19, bh: 12, herd: [2, 4], hp: 4 }];
  const SYL = ['blo', 'pi', 'mou', 'gru', 'zi', 'fa', 'lu', 'ko', 'ta', 'né', 'ri', 'vo', 'chu', 'pa', 'dou', 'sné', 'mi', 'ga', 'bou', 'tre'];
  const pick = function (r, a) { return a[(r() * a.length) | 0]; };
  const HAB = { any: [T.GRASS, T.GRASS_DARK, T.DIRT, T.SAND, T.STONE, T.GLOW], grass: [T.GRASS, T.GRASS_DARK, T.DIRT], sand: [T.SAND], stone: [T.STONE, T.GLOW] };
  const cache = new Map();

  function palette(D, r) {
    const rgb = function (c) { return I.COLORS[c - 1].rgb; }, n = D.pal.length;
    const body = D.pal[(r() * n) | 0];
    let alt = D.pal[(r() * n) | 0], acc = D.pal[(r() * n) | 0];
    if (n === 1 || r() < 0.3) alt = 13 + ((r() * 4) | 0);  // neutre : blanc, gris clair, gris, noir
    if (n === 1 || r() < 0.35 || acc === body) acc = [1, 2, 3, 11, 12][(r() * 5) | 0]; // accent vif : rouge, orange, jaune, rose, marron
    const pat = r() < 0.5 ? D.pal[(r() * n) | 0] : 13 + ((r() * 4) | 0);
    return { body: rgb(body), alt: rgb(alt), acc: rgb(acc), pat: rgb(pat), ids: [body, alt, acc, pat] };
  }

  /** Espèce n° i de la dimension D (déterministe). */
  function species(D, i) {
    const key = D.seed + ':' + i;
    let s = cache.get(key);
    if (s) return s;
    const r = R.mulberry32((D.seed * 2654435761 + i * 40503 + 977) | 0);
    r(); r();
    const plan = pick(r, PLANS), u = r(), si = u < 0.2 ? 0 : u < 0.55 ? 1 : u < 0.88 ? 2 : 3, sz = SIZES[si];
    const sc = 0.85 + r() * 0.3;
    s = {
      i: i, plan: plan, size: si, sizeName: sz.n,
      bw: Math.round(sz.bw * sc), bh: Math.round(sz.bh * (0.85 + r() * 0.3)),
      leg: plan === 'bug' ? 2 : 2 + ((r() * (2 + si)) | 0),                                // hauteur des pattes
      head: pick(r, ['round', 'round', 'snout', 'flat']), hr: 0.8 + r() * 0.5,                // forme et taille relative de la tête
      ears: pick(r, ['none', 'none', 'point', 'round', 'long', 'antenna', 'crest']),
      horns: r() < 0.3 ? pick(r, ['one', 'two', 'curl']) : 'none',
      tail: pick(r, ['none', 'stub', 'long', 'fluffy', 'curl']),
      pattern: pick(r, ['none', 'spots', 'stripes', 'patches', 'dorsal', 'none']),
      belly: r() < 0.55, extra: r() < 0.28 ? pick(r, ['spikes', 'shell', 'mane']) : 'none',
      eyes: r() < 0.12 ? 1 : r() < 0.1 ? 3 : 2, bigEyes: r() < 0.4,
      segs: 5 + ((r() * 5) | 0), // serpent : nombre d'anneaux
      col: palette(D, r),
      speed: 13 + r() * 14 - si * 1.5, shy: pick(r, [0, 40, 64, 64]),
      herd: sz.herd, hab: i === 0 ? 'any' : pick(r, ['any', 'any', 'grass', 'grass', 'sand', 'stone']),
      hop: plan === 'blob' || (plan === 'bug' && r() < 0.3) || r() < 0.08,
      seed: (r() * 1e9) | 0,
    };
    if (plan === 'serpent') { s.bh = Math.max(3, Math.round(s.bh * 0.55)); s.leg = 0; }
    if (plan === 'blob') s.leg = 0;
    s.name = pick(r, SYL) + pick(r, SYL) + (r() < 0.4 ? pick(r, SYL) : '');
    s.name = s.name[0].toUpperCase() + s.name.slice(1);
    cache.set(key, s);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return s;
  }

  function count(D) { return 4 + (R.hash2(D.seed, 7, 31) * 3 | 0); }
  /** La tuile t convient-elle à l'espèce s ? */
  function likes(s, t) { return HAB[s.hab].indexOf(t) >= 0; }

  I.creatureGen = { species: species, count: count, likes: likes, PLANS: PLANS, SIZES: SIZES };
})((window.Iles = window.Iles || {}));
