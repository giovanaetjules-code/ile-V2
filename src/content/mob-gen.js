/*
 * Générateur d'espèces de MONSTRES hostiles des dimensions. Une espèce est une fonction PURE de (graine de la dimension, indice) :
 * hôte et invités obtiennent la même. Chaque dimension a 4 à 6 espèces, colorées avec SA palette.
 *   species(D, i) -> { plan, arch, elem, size, bw, bh, hp, dmg, speed, sight, reach, wind, cdn, ..., col:{body,alt,acc,pat,glow}, name, ... }
 * Trois axes de variété : le plan de corps (dessin), l'archétype (façon d'attaquer) et l'élément (effet sur le joueur).
 * Ajouter un plan : le nommer dans PLANS + le dessiner dans rendering/mob-art.js. Ajouter un archétype : une ligne dans ARCH + son
 * comportement dans systems/mobs.js. Ajouter un élément : une ligne dans ELEM + son effet dans systems/vitals.js (statuts).
 */
(function (I) {
  const R = I.rng;
  const PLANS = ['spider', 'golem', 'wraith', 'beast', 'eye', 'imp', 'scorpion'];
  // archétypes : stats de base pour la taille 1, palier 0. pack = [min, max] monstres par nid.
  const ARCH = {
    stalker: { hp: 40, dmg: 9, speed: 46, sight: 130, reach: 15, wind: 0.38, cdn: 1.0, pack: [1, 3], note: 'Poursuit et mord.' },
    charger: { hp: 55, dmg: 17, speed: 36, sight: 160, reach: 16, wind: 0.75, cdn: 1.6, dash: 200, pack: [1, 2], note: 'Charge en ligne droite, puis souffle.' },
    spitter: { hp: 28, dmg: 10, speed: 32, sight: 170, reach: 140, wind: 0.5, cdn: 2.1, keep: 95, pack: [1, 3], note: 'Crache à distance et garde ses distances.' },
    brute: { hp: 135, dmg: 26, speed: 23, sight: 125, reach: 40, wind: 0.9, cdn: 1.5, blast: 36, pack: [1, 1], note: 'Lent, frappe le sol en zone.' },
    swarmer: { hp: 13, dmg: 4, speed: 62, sight: 120, reach: 11, wind: 0.22, cdn: 0.7, pack: [4, 7], note: 'Arrive en meute.' },
    bomber: { hp: 22, dmg: 30, speed: 56, sight: 140, reach: 22, wind: 0.95, cdn: 0, blast: 38, pack: [2, 3], note: 'Court vers toi et explose.' },
  };
  // plan -> archétypes possibles (pondérés)
  const PLAN_ARCH = {
    spider: [['swarmer', 4], ['stalker', 3.5], ['spitter', 1.5], ['bomber', 1]],
    golem: [['brute', 7], ['charger', 3]],
    wraith: [['spitter', 6], ['stalker', 4]],
    beast: [['charger', 5], ['stalker', 5]],
    eye: [['spitter', 8], ['stalker', 2]],
    imp: [['stalker', 4], ['swarmer', 3], ['bomber', 3]],
    scorpion: [['charger', 3], ['stalker', 3.5], ['spitter', 3.5]],
  };
  // éléments : effet sur le joueur (durée s, intensité), couleur lumineuse, butin spécial, nom de l'adjectif
  const ELEM = {
    none: { w: 0.34, glow: [255, 80, 100], loot: 'bone', adj: '' },
    venom: { w: 0.2, glow: [120, 255, 90], loot: 'slime', adj: 'venimeux', dur: 6, pow: 2.4 },
    flame: { w: 0.2, glow: [255, 150, 50], loot: 'coal', adj: 'ardent', dur: 3.2, pow: 4 },
    frost: { w: 0.13, glow: [120, 225, 255], loot: 'scale', adj: 'glacial', dur: 3.5, pow: 0.55 },
    shock: { w: 0.13, glow: [255, 240, 90], loot: 'crystal', adj: 'foudroyant', dur: 0.7, pow: 1 },
  };
  const BASE_LOOT = { spider: 'chitin', golem: 'stone', wraith: 'crystal', beast: 'bone', eye: 'slime', imp: 'bone', scorpion: 'chitin' };
  const SYL = ['kra', 'zul', 'mor', 'vex', 'gor', 'thra', 'skel', 'nox', 'rak', 'um', 'zha', 'bel', 'drak', 'ish', 'vor', 'ul', 'grim', 'sith', 'ghul', 'xar', 'mal', 'dru'];
  const pick = function (r, a) { return a[(r() * a.length) | 0]; };
  const wpick = function (r, a) { let t = 0; for (const x of a) t += x[1]; let u = r() * t; for (const x of a) { u -= x[1]; if (u <= 0) return x[0]; } return a[0][0]; };
  const cache = new Map();

  function palette(D, r, elem) {
    const rgb = function (c) { return I.COLORS[c - 1].rgb; }, n = D.pal.length, body = D.pal[(r() * n) | 0];
    const dark = function (c, k) { return [c[0] * k, c[1] * k, c[2] * k]; };
    // les monstres sont plus sombres que les animaux : corps assombri, plaques et motif contrastés, accent vif
    let alt = D.pal[(r() * n) | 0]; if (n === 1 || r() < 0.4) alt = 13 + ((r() * 4) | 0);
    let acc = D.pal[(r() * n) | 0]; if (n === 1 || acc === body || r() < 0.4) acc = [1, 2, 3, 11, 12, 15, 16][(r() * 7) | 0];
    const pat = r() < 0.5 ? D.pal[(r() * n) | 0] : 13 + ((r() * 4) | 0), k = 0.55 + r() * 0.25;
    return { body: dark(rgb(body), k), alt: dark(rgb(alt), 0.8), acc: rgb(acc), pat: dark(rgb(pat), 0.75), glow: ELEM[elem].glow.slice(), ids: [body, alt, acc, pat] };
  }

  function species(D, i) {
    const key = D.seed + ':' + i;
    let s = cache.get(key);
    if (s) return s;
    const r = R.mulberry32((D.seed * 2246822519 + i * 3266489917 + 4049) | 0); r(); r();
    const plan = i === 0 ? pick(r, ['spider', 'beast', 'imp']) : pick(r, PLANS); // l'espèce 0 est toujours un ennemi « de base » (pas de brute)
    let arch = wpick(r, PLAN_ARCH[plan]); if (i === 0 && (arch === 'brute' || arch === 'bomber')) arch = 'stalker';
    let u = r(), elem = 'none'; for (const k of Object.keys(ELEM)) { u -= ELEM[k].w; if (u <= 0) { elem = k; break; } }
    const A = ARCH[arch];
    let size = arch === 'swarmer' ? (r() < 0.6 ? 0 : 1) : arch === 'bomber' ? 1 + (r() < 0.4 ? 1 : 0) : arch === 'brute' ? 3 : 1 + ((r() * 3) | 0);
    if (plan === 'golem' && size < 2) size = 2;
    if (plan === 'imp' && size > 2) size = 2;
    const SB = [{ bw: 8, bh: 6 }, { bw: 12, bh: 8 }, { bw: 16, bh: 11 }, { bw: 21, bh: 14 }][size], sc = 0.9 + r() * 0.25;
    const hpv = 0.9 + r() * 0.25, dmv = 0.9 + r() * 0.2;
    s = {
      i: i, plan: plan, arch: arch, elem: elem, size: size,
      bw: Math.round(SB.bw * sc), bh: Math.round(SB.bh * (0.9 + r() * 0.25)), leg: 2 + ((r() * (1 + size)) | 0),
      hp: Math.round(A.hp * (0.75 + size * 0.25) * hpv), dmg: Math.round(A.dmg * (0.8 + size * 0.12) * dmv),
      speed: A.speed * (1.08 - size * 0.04) * (0.92 + r() * 0.16), sight: A.sight * (0.9 + r() * 0.2), reach: A.reach + (size >= 2 ? 3 : 0),
      wind: A.wind * (0.9 + r() * 0.25), cdn: A.cdn * (0.85 + r() * 0.3), dash: A.dash || 0, keep: A.keep || 0, blast: (A.blast || 0) * (0.9 + size * 0.08),
      horns: r() < 0.55 ? pick(r, ['two', 'two', 'one', 'curl', 'many']) : 'none',
      spikes: r() < 0.4, teeth: r() < 0.7, crest: r() < 0.3, eyes: plan === 'eye' ? 1 : plan === 'spider' ? 2 + ((r() * 5) | 0) : r() < 0.18 ? 1 : r() < 0.15 ? 3 : 2,
      pattern: pick(r, ['none', 'stripes', 'cracks', 'spots', 'plates', 'none']), tail: pick(r, ['none', 'long', 'spiked']), arms: r() < 0.5,
      col: null, seed: (r() * 1e9) | 0, flies: plan === 'eye' || plan === 'wraith' || plan === 'imp',
    };
    s.col = palette(D, r, elem);
    s.name = pick(r, SYL) + pick(r, SYL) + (r() < 0.35 ? pick(r, SYL) : '');
    s.name = s.name[0].toUpperCase() + s.name.slice(1);
    cache.set(key, s);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return s;
  }

  function count(D) { return 4 + (R.hash2(D.seed, 11, 37) * 3 | 0); }
  /** Palier de danger (0..4) à la distance d (px) du point d'arrivée : stats × (1 + 0,3 × palier). */
  function tier(d) { return Math.max(0, Math.min(4, Math.floor((d - 150) / 480))); }
  function mult(t) { return 1 + 0.3 * t; }

  /** Butin d'un monstre mort : [{item, qty}]. `elite` : butin garanti et doublé. */
  function loot(S, elite, rnd) {
    const E = ELEM[S.elem], out = [{ item: BASE_LOOT[S.plan], qty: 1 + (S.size >= 2 ? 1 : 0) + (rnd() < 0.4 ? 1 : 0) }];
    if (S.elem !== 'none' && (elite || rnd() < 0.45)) out.push({ item: E.loot, qty: 1 + (elite ? 1 : 0) });
    if (rnd() < 0.3 + S.size * 0.06) out.push({ item: 'bone', qty: 1 });
    if (elite) out.push({ item: 'crystal', qty: 1 + (rnd() < 0.5 ? 1 : 0) });
    if (elite && S.elem !== 'none' && I.ITEMS['stone_' + S.elem] && rnd() < 0.12) out.push({ item: 'stone_' + S.elem, qty: 1 }); // pierre magique de son élément (rare)
    else if (S.size >= 2 && rnd() < 0.14) out.push({ item: 'crystal', qty: 1 });
    return out;
  }

  I.mobGen = { species: species, count: count, tier: tier, mult: mult, loot: loot, PLANS: PLANS, ARCH: ARCH, ELEM: ELEM };
})((window.Iles = window.Iles || {}));
