/*
 * Météo déterministe : elle ne dépend QUE de l'heure du jeu (state.time.minutes). Hôte et invités la calculent donc
 * pareil sans rien synchroniser, et une sauvegarde la retrouve toute seule.
 * Le temps est découpé en tranches de SEG minutes de jeu (4 h) : chacune est claire, nuageuse, brumeuse ou pluvieuse.
 * Une pluie est COURTE (45 à 100 min de jeu, soit 20 à 50 s réelles) et accélère la pousse des cultures (RAIN_GROWTH).
 */
(function (I) {
  const SEG = 240, FADE = 25, RAIN_GROWTH = 5, SEED = 7331;
  const hash = I.rng.hash2;
  const ss = function (a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const cache = [];
  /** Description (pure) d'une tranche : type, niveaux de nuages / brume et fenêtre de pluie [a, b] en minutes absolues. */
  function seg(i) {
    if (cache[i]) return cache[i];
    const base = i * SEG, h = hash(i, 11, SEED), hod = (base % I.config.DAY_MINUTES) / 60; // heure de début de tranche
    let type = 'clear';
    if (i >= 2) { // les deux premières tranches (début de partie) restent claires
      const fogBias = hod < 9 ? 0.16 : 0.03; // la brume se lève surtout le matin
      if (h < 0.5 - fogBias) type = 'clear'; else if (h < 0.7) type = 'cloudy'; else if (h < 0.7 + fogBias + 0.04) type = 'fog'; else type = 'rain';
    }
    const s = { i: i, type: type, cloud: type === 'clear' ? 0.08 + hash(i, 12, SEED) * 0.25 : type === 'cloudy' ? 0.7 + hash(i, 12, SEED) * 0.25 : type === 'fog' ? 0.45 : 0.95, fog: type === 'fog' ? 0.75 + hash(i, 13, SEED) * 0.25 : type === 'cloudy' ? 0.1 : 0, rainA: 0, rainB: 0, storm: false };
    if (type === 'rain') {
      const len = 45 + hash(i, 14, SEED) * 55, room = SEG - 2 * FADE - len;
      s.rainA = base + FADE + hash(i, 15, SEED) * room; s.rainB = s.rainA + len; s.storm = hash(i, 16, SEED) < 0.4;
      s.fog = 0.12;
    }
    return (cache[i] = s);
  }

  /** Niveau d'un champ (cloud / fog) : valeur de la tranche, fondue avec la voisine près des frontières. */
  function level(m, key) {
    const i = Math.floor(m / SEG), a = seg(i)[key], x = m - i * SEG;
    if (x < FADE && i > 0) { const p = seg(i - 1)[key]; return (a + p) / 2 + (a - p) / 2 * (x / FADE); } // (a+p)/2 en x=0, a en x=FADE
    if (x > SEG - FADE) { const b = seg(i + 1)[key]; return a + (b - a) / 2 * ((x - (SEG - FADE)) / FADE); }
    return a;
  }

  /** Intensité de pluie 0..1 (douce : montée et descente de FADE minutes). */
  function rainAt(m) {
    const i = Math.floor(m / SEG), s = seg(i);
    return s.rainB > 0 ? ss(s.rainA, s.rainA + FADE, m) * (1 - ss(s.rainB - FADE, s.rainB, m)) : 0;
  }

  /** Sol mouillé 0..1 : pluie en cours, puis séchage sur ~90 min. */
  function wetAt(m) {
    let w = rainAt(m);
    const i = Math.floor(m / SEG);
    for (let k = i; k >= Math.max(0, i - 1); k--) { const s = seg(k); if (s.rainB > 0 && m >= s.rainB - FADE) w = Math.max(w, 1 - ss(s.rainB - FADE, s.rainB + 75, m)); }
    return w;
  }

  function at(m) {
    const s = seg(Math.floor(m / SEG)), rain = rainAt(m), cloud = Math.max(level(m, 'cloud'), rain * 0.95), fog = Math.max(0, level(m, 'fog'));
    const type = rain > 0.05 ? (s.storm ? 'storm' : 'rain') : fog > 0.4 ? 'fog' : cloud > 0.55 ? 'cloudy' : 'clear';
    return { type: type, cloud: cloud, rain: rain, fog: fog, wet: wetAt(m), storm: rain > 0.2 && s.storm ? rain : 0 };
  }

  const pre = [0]; // pre[i] = minutes de pluie (palier plein) avant la tranche i
  function rainMinutes(m) {
    if (!(m > 0)) return 0;
    const i = Math.floor(m / SEG);
    while (pre.length <= i) { const s = seg(pre.length - 1); pre.push(pre[pre.length - 1] + (s.rainB > 0 ? s.rainB - s.rainA : 0)); }
    const s = seg(i);
    return pre[i] + (s.rainB > 0 ? Math.max(0, Math.min(m, s.rainB) - s.rainA) : 0);
  }
  /** Minutes « de croissance » écoulées à l'instant m : le temps normal, plus un bonus pendant la pluie. */
  function growthMinutes(m) { return m + (RAIN_GROWTH - 1) * rainMinutes(m); }

  I.weather = { SEG: SEG, RAIN_GROWTH: RAIN_GROWTH, at: at, rainMinutes: rainMinutes, growthMinutes: growthMinutes, seg: seg };
})((window.Iles = window.Iles || {}));
