/*
 * Dessin des armures : icônes d'inventaire (14x14) et pièces portées par le personnage (superposées au sprite 16x24, voir sprites.js avatarSet).
 * Les couleurs viennent de I.ARMOR.MATS (une couleur de base ; reflet et ombre en sont déduits).
 */
(function (I) {
  const hex = function (c) { return [1, 3, 5].map(function (i) { return parseInt(c.substr(i, 2), 16); }); };
  const toHex = function (a) { return '#' + a.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); };
  const mixc = function (a, b, t) { return toHex(hex(a).map(function (v, i) { return v + (hex(b)[i] - v) * t; })); };
  const pc = {};
  /** { m: base, l: reflet, d: ombre, k: ombre profonde } */
  function pal(mk) {
    if (pc[mk]) return pc[mk];
    let base = I.ARMOR.MATS[mk].col; const h = hex(base);
    if (h[0] * 0.3 + h[1] * 0.6 + h[2] * 0.1 < 70) base = mixc(base, '#6a6a90', 0.55); // l'obscurium reste lisible
    return (pc[mk] = { m: base, l: mixc(base, '#ffffff', 0.38), d: mixc(base, '#1a1a2a', 0.38), k: mixc(base, '#1a1a2a', 0.65), b: mk === 'fibre' ? '#6e5230' : '#5a3a20' });
  }
  const rc = function (g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };

  const ROWS = {
    helmet: ['..............', '....llllmm....', '...lmmmmmmd...', '..lmmmmmmmmd..', '..mmmmmmmmmd..', '..mmmmmmmmmd..', '..mmkkkkkkmd..', '..mmk.kk.kmd..', '..mdk.kk.kdd..', '..dd......dd..', '..............', '..............', '..............', '..............'],
    chest: ['..............', '.ddd......ddd.', '.dlm.mmmm.mld.', '.dmmmmmmmmmmd.', '..dmmllmmmmd..', '..dmlmmmmmmd..', '..dmmmmmmmmd..', '..dmmmbbmmmd..', '..dmmmbbmmmd..', '..dmmmmmmmdd..', '..ddmmmmmddd..', '...dddddddd...', '..............', '..............'],
    legs: ['..............', '..bbbbbbbbbb..', '..mmmmmmmmmm..', '..mllmmmmmdm..', '..mmmmmmmmdm..', '..mmmmkkmmdm..', '..mmmd..mmmd..', '..mmmd..mmmd..', '..mmd....mmd..', '..mmd....mmd..', '..mdd....mdd..', '..ddd....ddd..', '..............', '..............'],
    boots: ['..............', '..............', '...mm....mm...', '...ml....ml...', '...mm....mm...', '...mm....md...', '..mmmm..mmmm..', '.mlmmmm.mlmmm.', '.mmmmmm.mmmmm.', '.dddddd.dddddd', '..............', '..............', '..............', '..............'],
  };
  /** Icône d'une pièce : fonction de dessin pour mk(14, 14, ...). */
  function icon(piece, mk) {
    const P = pal(mk), rows = ROWS[piece];
    return function (g) {
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch !== '.' && P[ch]) rc(g, x, y, 1, 1, P[ch]);
      }
      if (mk === 'fibre') { for (let y = 3; y < 11; y += 2) for (let x = 2; x < 12; x += 3) if (rows[y][x] === 'm') rc(g, x, y, 1, 1, P.d); } // brins tressés
    };
  }

  /** Pièces portées, dessinées par-dessus le personnage. look = « casque,plastron,jambières,bottes » (matériaux). */
  function overlay(g, dir, f, look) {
    const L = look.split(','), b = f % 2 === 1 ? -1 : 0, sw = f === 1 ? 1 : f === 3 ? -1 : 0;
    const H = L[0] && pal(L[0]), C = L[1] && pal(L[1]), G = L[2] && pal(L[2]), B = L[3] && pal(L[3]);
    if (dir === 'down' || dir === 'up') {
      [5, 9].forEach(function (x, i) {
        const l = (i === 0 && f === 1) || (i === 1 && f === 3) ? 1 : 0;
        if (G) { rc(g, x, 17, 3, 3 - l, i ? G.d : G.m); rc(g, x, 17, 3, 1, G.b); }
        if (B) { rc(g, x, 20 - l, 3, 2, i ? B.d : B.m); rc(g, x, 20 - l, 1, 1, B.l); }
      });
      if (C) {
        rc(g, 4, 10 + b, 8, 6, C.m); rc(g, 10, 10 + b, 2, 6, C.d); rc(g, 5, 11 + b, 2, 2, C.l); rc(g, 4, 15 + b, 8, 1, C.d);
        rc(g, 2, 10 + b + sw, 2, 2, C.m); rc(g, 2, 10 + b + sw, 2, 1, C.l); rc(g, 12, 10 + b - sw, 2, 2, C.d);
        if (dir === 'down') { rc(g, 7, 11 + b, 2, 4, C.l); rc(g, 8, 11 + b, 1, 4, C.m); }
      }
      if (H) {
        if (dir === 'down') {
          rc(g, 3, 1 + b, 10, 3, H.m); rc(g, 5, 1 + b, 3, 1, H.l); rc(g, 3, 3 + b, 1, 5, H.m); rc(g, 12, 3 + b, 1, 5, H.d);
          rc(g, 4, 3 + b, 8, 1, H.d); rc(g, 7, 4 + b, 2, 3, H.m);
        } else {
          rc(g, 3, 1 + b, 10, 8, H.m); rc(g, 3, 8 + b, 10, 1, H.d); rc(g, 5, 2 + b, 3, 1, H.l); rc(g, 7, 3 + b, 2, 5, H.d);
        }
      }
    } else {
      const legs = f === 1 ? [4, 9] : f === 3 ? [8, 5] : [6, 7];
      if (G) { rc(g, legs[1], 17, 3, 3, G.d); rc(g, legs[0], 17, 3, 3, G.m); rc(g, legs[0], 17, 3, 1, G.b); }
      if (B) { rc(g, legs[1] - 1, 20, 4, 2, B.d); rc(g, legs[0] - 1, 20, 4, 2, B.m); rc(g, legs[0] - 1, 20, 1, 1, B.l); }
      if (C) {
        rc(g, 5, 10 + b, 7, 6, C.m); rc(g, 10, 10 + b, 2, 6, C.d); rc(g, 6, 11 + b, 2, 2, C.l); rc(g, 5, 15 + b, 7, 1, C.d);
        rc(g, 6 + sw, 10 + b, 4, 2, C.l); rc(g, 6 + sw, 11 + b, 4, 1, C.m);
      }
      if (H) {
        rc(g, 3, 1 + b, 10, 3, H.m); rc(g, 5, 1 + b, 3, 1, H.l); rc(g, 8, 3 + b, 5, 5, H.d); rc(g, 3, 3 + b, 4, 1, H.l); rc(g, 9, 4 + b, 2, 1, H.m);
      }
    }
  }
  I.armorArt = { icon: icon, overlay: overlay, pal: pal };
})((window.Iles = window.Iles || {}));
