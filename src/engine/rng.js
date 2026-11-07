/* Aléatoire déterministe : le monde est entièrement régénéré à partir d'une graine. */
(function (I) {
  function hash2(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function valueNoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, y, seed, octaves) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < (octaves || 3); i++) {
      sum += amp * valueNoise(x * f, y * f, seed + i * 17);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  I.rng = { hash2, mulberry32, valueNoise, fbm };
})((window.Iles = window.Iles || {}));
