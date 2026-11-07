/*
 * Avatar : apparence d'un joueur = 7 petits entiers (indices dans les listes ci-dessous). Indice 0 de chaque liste = l'apparence d'origine.
 *   av = { sk: peau, hc: couleur des cheveux, hs: coiffure, tn: tunique, pn: pantalon, ac: couleur de l'accessoire, at: accessoire }
 * Sérialisé en tableau [sk, hc, hs, tn, pn, ac, at] pour le réseau ; sauvegardé dans les réglages (par navigateur) et dans la partie (par joueur).
 */
(function (I) {
  const PAL = {
    sk: ['#f2c7a0', '#ffdcc0', '#e0ac80', '#c68642', '#a0683c', '#7a4a2a', '#5a3420', '#f7d4d0'],
    hc: ['#5a3a28', '#2c2420', '#8a5a30', '#d8b050', '#c0502a', '#e8e8e8', '#3a6ad0', '#7a40b0', '#e060a0', '#3a9a5a'],
    tn: ['#3f8f8a', '#c0392b', '#2e6fd0', '#e6b422', '#7a4ab0', '#3a9a4a', '#e0e0e0', '#2c2c34', '#e87aa0', '#e07a30', '#6ad0e0', '#8a5a32'],
    pn: ['#5a4a7a', '#2c3e6a', '#3a3a44', '#7a5a32', '#2f6a4a', '#8a3a3a', '#c8b890', '#4a4a8a'],
    ac: ['#e0813a', '#c0392b', '#2e6fd0', '#f2c14e', '#3a9a4a', '#e0e0e0', '#2c2c34', '#e060a0', '#7a4ab0', '#3fc0c0'],
  };
  const NAMES = { hs: ['Courts', 'Longs', 'Pointes', 'Chignon', 'Rasé'], at: ['Écharpe', 'Bandeau', 'Chapeau', 'Aucun'] };
  const KEYS = ['sk', 'hc', 'hs', 'tn', 'pn', 'ac', 'at'];
  const MAXN = { sk: PAL.sk.length, hc: PAL.hc.length, hs: NAMES.hs.length, tn: PAL.tn.length, pn: PAL.pn.length, ac: PAL.ac.length, at: NAMES.at.length };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const c = function (v) { return Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))); };
    return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
  }

  const avatar = {
    PAL: PAL, NAMES: NAMES, KEYS: KEYS, MAXN: MAXN,
    def: function () { return { sk: 0, hc: 0, hs: 0, tn: 0, pn: 0, ac: 0, at: 0 }; },
    /** Accepte un objet ou un tableau ; renvoie toujours un avatar valide (valeurs hors limites -> 0). */
    sanitize: function (a) {
      const out = avatar.def();
      if (!a || typeof a !== 'object') return out;
      KEYS.forEach(function (k, i) { const v = Array.isArray(a) ? a[i] : a[k]; out[k] = Number.isInteger(v) && v >= 0 && v < MAXN[k] ? v : 0; });
      return out;
    },
    pack: function (a) { return KEYS.map(function (k) { return a[k] | 0; }); },
    key: function (a) { return KEYS.map(function (k) { return a[k] | 0; }).join(','); },
    /** Couleurs de dessin du personnage. */
    palette: function (a) {
      const skin = PAL.sk[a.sk], hair = PAL.hc[a.hc], tun = PAL.tn[a.tn], pant = PAL.pn[a.pn], acc = PAL.ac[a.ac];
      return {
        skin: skin, skinD: shade(skin, 0.84), hair: hair, hairL: shade(hair, 1.25), hairD: shade(hair, 0.7),
        tun: tun, tunD: shade(tun, 0.74), tunL: shade(tun, 1.28), belt: '#8a5a32', pant: pant, pantD: shade(pant, 0.78),
        boot: '#4a3426', scarf: acc, scarfD: shade(acc, 0.75), eye: '#2c2a3a',
      };
    },
    /** Couleur de repère sur la carte (la tunique). */
    mapColor: function (a) { return PAL.tn[a.tn]; },
  };
  I.avatar = avatar;
})((window.Iles = window.Iles || {}));
