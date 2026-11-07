/*
 * Matériaux et couleurs. Chaque matériau a une couleur naturelle (bois = marron, fer = gris acier, or = jaune doré…) et existe aussi
 * en 16 couleurs (les couleurs des futures dimensions) : « bois~jaune », « pierre~bleu »… Un objet construit prend la couleur des
 * matériaux utilisés pour le fabriquer (table jaune = bois jaune) ; un objet naturel coloré (o.c) donne des matériaux de sa couleur.
 * Les variantes sont des objets d'inventaire normaux : tout le reste du jeu (sac, coffre, four, sauvegarde, coop) les gère sans changement.
 * Leurs icônes sont recolorées à la demande (rendering/sprites.js), aucun dessin supplémentaire.
 */
(function (I) {
  // matériaux colorables hors constructions + couleur naturelle (affichée dans la description)
  const NATURAL = {
    wood: 'marron', plank: 'brun clair', stick: 'brun foncé', stone: 'gris', fiber: 'vert', rope: 'beige', coal: 'noir',
    copper_ore: 'orange cuivré', copper_bar: 'orange cuivré', iron_ore: 'rouille', iron_bar: 'gris acier',
    silver_ore: 'blanc bleuté', silver_bar: 'argenté', gold_ore: 'jaune doré', gold_bar: 'jaune doré',
  };
  I.ORES.forEach(function (o) { if (o.mix) return; NATURAL[o.id + '_ore'] = o.nat; NATURAL[o.id + '_bar'] = o.nat; }); // l'obscurium reste noir : pas de variantes de couleur
  const CI = {};
  I.COLORS.forEach(function (c, i) { CI[c.id] = i + 1; });
  const colorable = {};

  function id(base, c) { return c && colorable[base] ? base + '~' + I.COLORS[c - 1].id : base; }
  function split(s) {
    const d = I.ITEMS[s];
    return d && d.base ? { base: d.base, c: d.c } : { base: s, c: 0 };
  }

  const bases = Object.keys(NATURAL).concat(Object.keys(I.ITEMS).filter(function (k) { return I.ITEMS[k].place && !I.ITEMS[k].nocolor; }));
  bases.forEach(function (b) {
    const bd = I.ITEMS[b];
    if (!bd) return;
    colorable[b] = true;
    if (NATURAL[b]) bd.desc += ' Couleur : ' + NATURAL[b] + '.';
  });
  bases.forEach(function (b) {
    const bd = I.ITEMS[b];
    if (!bd) return;
    I.COLORS.forEach(function (col, i) {
      const v = Object.assign({}, bd, { name: bd.name + ' (' + col.name.toLowerCase() + ')', base: b, c: i + 1 });
      v.desc = bd.desc.replace(/ Couleur : [^.]*\./, '') + ' Couleur : ' + col.name.toLowerCase() + '.';
      I.ITEMS[b + '~' + col.id] = v;
      I.ITEM_ORDER.push(b + '~' + col.id);
    });
  });

  I.mat = {
    NATURAL: NATURAL,
    /** « wood », 3 -> « wood~yellow » (ou « wood » si c = 0 ou si l'objet n'existe pas en couleurs). */
    id: id,
    /** « wood~yellow » -> { base: 'wood', c: 3 } */
    split: split,
    colorable: function (base) { return !!colorable[base]; },
    colorIndex: function (cid) { return CI[cid] | 0; },
  };
})((window.Iles = window.Iles || {}));
