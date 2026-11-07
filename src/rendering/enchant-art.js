/*
 * Dessin des enchantements : tables (enchantement : pierre runique violette ; désenchantement : pierre sombre fendue) et icônes des pierres magiques.
 * Les fonctions de dessin reçoivent le contexte et dessinent à la main (pas de dépendance à sprites.js sauf `mk`, passé à tableSprite).
 */
(function (I) {
  const rc = function (g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const px = function (g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

  /** Pierre simple : gemme à facettes (14×14). */
  function gem(g, a, hi, d) {
    const rows = ['....aaaa....', '...aaaaaa...', '..aaahhaaa..', '.aaahhaaaaa.', '.aahhaaaaad.', '.aaaaaaaadd.', '..aaaaaadd..', '...aaaadd...', '....aadd....', '.....dd.....'];
    rows.forEach(function (r, y) { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch !== '.') px(g, x + 1, y + 2, ch === 'a' ? a : ch === 'h' ? hi : d); } });
    px(g, 3, 3, '#ffffff'); px(g, 11, 2, hi); px(g, 12, 5, hi);
  }
  /** Pierre double : deux couleurs de part et d'autre d'une arête, plus grande. */
  function gem2(g, a, hi, b, d) {
    const rows = ['....llrr....', '...lllrrr...', '..llhlrrrr..', '.lllhlrrrrr.', '.llhllrrrrd.', '.lllllrrrdd.', '..llllrrdd..', '...lllrdd...', '....llrd....', '.....lr.....'];
    rows.forEach(function (r, y) { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch !== '.') px(g, x + 1, y + 2, ch === 'l' ? a : ch === 'h' ? hi : ch === 'r' ? b : d); } });
    px(g, 3, 3, '#ffffff'); px(g, 11, 2, '#ffffff'); px(g, 13, 6, hi); rc(g, 6, 3, 1, 8, '#ffffffaa');
  }

  /** Table : dalle de pierre sur piliers ; runes et gemme flottante. kind 'ench' (violet) ou 'dis' (cendre, gemme brisée). */
  function tableSprite(mk, kind) {
    const dis = kind === 'dis';
    const top = dis ? '#5a5560' : '#4a3a78', topL = dis ? '#8a8494' : '#7a62c0', topD = dis ? '#37333e' : '#2f2452', rune = dis ? '#d8c8a0' : '#cdb8ff', leg = dis ? '#3a3640' : '#33284f';
    return mk(26, 22, function (g) {
      rc(g, 2, 14, 22, 4, top); rc(g, 2, 14, 22, 1, topL); rc(g, 2, 17, 22, 1, topD); // dalle
      rc(g, 3, 18, 4, 4, leg); rc(g, 19, 18, 4, 4, leg); rc(g, 3, 18, 1, 4, topD); rc(g, 19, 18, 1, 4, topD); rc(g, 6, 20, 14, 1, topD); // piliers
      for (let x = 5; x < 22; x += 4) px(g, x, 15, rune); // runes gravées
      px(g, 4, 16, rune); px(g, 21, 16, rune);
      rc(g, 7, 12, 12, 2, topD); rc(g, 8, 11, 10, 1, topL); // socle de la gemme
      if (!dis) {
        rc(g, 11, 4, 4, 6, '#b79cff'); rc(g, 12, 3, 2, 8, '#d8c8ff'); rc(g, 11, 5, 1, 4, '#ffffff'); rc(g, 14, 6, 1, 4, '#7a5ad0'); // gemme entière
        px(g, 12, 2, '#ffffff'); px(g, 7, 7, rune); px(g, 19, 6, rune); px(g, 9, 4, '#b79cff'); px(g, 17, 9, '#b79cff'); // éclats
      } else {
        rc(g, 9, 7, 3, 4, '#8a8494'); rc(g, 14, 6, 3, 5, '#8a8494'); rc(g, 9, 7, 1, 4, '#bdb6c8'); rc(g, 14, 6, 1, 5, '#bdb6c8'); // gemme brisée
        px(g, 12, 9, '#37333e'); px(g, 13, 8, '#37333e'); px(g, 12, 5, rune); px(g, 7, 6, rune); px(g, 19, 8, rune);
      }
    }, { ax: 13, ay: 22 });
  }
  I.enchantArt = { gem: gem, gem2: gem2, tableSprite: tableSprite };
})((window.Iles = window.Iles || {}));
