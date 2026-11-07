/*
 * Teinture : 16 couleurs de l'arc-en-ciel et des neutres, appliquables à N'IMPORTE QUEL sprite (comme l'armure en cuir de Minecraft).
 * Un objet porte un indice de couleur c : 0 = aspect naturel, 1..16 = COLORS[c-1]. Le pixel garde sa luminosité,
 * seule sa teinte change (les contours sombres restent). Les sprites teintés sont mis en cache : aucune image de plus à dessiner.
 * Les mondes spéciaux (portail) pourront ainsi recolorer arbres, rochers et décors sans nouveaux sprites.
 */
(function (I) {
  I.COLORS = [
    { id: 'red', name: 'Rouge', rgb: [226, 60, 56] },
    { id: 'orange', name: 'Orange', rgb: [240, 140, 40] },
    { id: 'yellow', name: 'Jaune', rgb: [246, 214, 60] },
    { id: 'lime', name: 'Vert clair', rgb: [140, 210, 60] },
    { id: 'green', name: 'Vert', rgb: [60, 160, 70] },
    { id: 'cyan', name: 'Cyan', rgb: [50, 190, 190] },
    { id: 'sky', name: 'Bleu ciel', rgb: [100, 170, 240] },
    { id: 'blue', name: 'Bleu', rgb: [60, 90, 220] },
    { id: 'purple', name: 'Violet', rgb: [140, 70, 200] },
    { id: 'magenta', name: 'Magenta', rgb: [210, 70, 190] },
    { id: 'pink', name: 'Rose', rgb: [245, 150, 190] },
    { id: 'brown', name: 'Marron', rgb: [140, 90, 50] },
    { id: 'white', name: 'Blanc', rgb: [250, 250, 250] },
    { id: 'lgray', name: 'Gris clair', rgb: [190, 190, 200] },
    { id: 'gray', name: 'Gris', rgb: [120, 120, 130] },
    { id: 'black', name: 'Noir', rgb: [70, 70, 82] },
  ];
  const cache = new WeakMap();

  function colorize(src, rgb) {
    const w = src.width, h = src.height, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const sg = src.getContext('2d'), id = sg.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
      if (l < 0.2) continue; // contours et ombres profondes : inchangés
      const k = 0.25 + l * 0.95;
      d[i] = Math.min(255, rgb[0] * k); d[i + 1] = Math.min(255, rgb[1] * k); d[i + 2] = Math.min(255, rgb[2] * k);
    }
    c.getContext('2d').putImageData(id, 0, 0);
    return c;
  }

  I.tint = {
    /** Même entrée de sprite {c, ax, ay}, recolorée. ci = 0 : sprite d'origine. */
    entry: function (e, ci) {
      if (!ci || !I.COLORS[ci - 1]) return e;
      let arr = cache.get(e.c);
      if (!arr) { arr = []; cache.set(e.c, arr); }
      return arr[ci] || (arr[ci] = { c: colorize(e.c, I.COLORS[ci - 1].rgb), ax: e.ax, ay: e.ay });
    },
    /** Même chose pour une simple image (tuiles) : renvoie directement le canvas recoloré. */
    canvas: function (c, ci) {
      if (!ci) return c;
      let arr = cache.get(c);
      if (!arr) { arr = []; cache.set(c, arr); }
      return (arr[ci] || (arr[ci] = { c: colorize(c, I.COLORS[ci - 1].rgb) })).c;
    },
    name: function (ci) { return ci && I.COLORS[ci - 1] ? I.COLORS[ci - 1].name : 'Naturel'; },
    clamp: function (v) { v = v | 0; return v >= 0 && v <= I.COLORS.length ? v : 0; },
  };
})((window.Iles = window.Iles || {}));
