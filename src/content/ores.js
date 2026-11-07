/*
 * Minerais des dimensions : 5 nouveaux métaux + l'obscurium (mélange de trois d'entre eux, toujours noir, introuvable dans la nature :
 * on le fabrique à l'établi, puis on le fond au four). Pour l'instant leur seul usage est la pioche et la hache de leur métal.
 * Une ligne par minerai : tout le reste (objets, lingots, outils, recettes, fonte, sprites, génération) en est déduit.
 *   c : couleur naturelle ; nat : son nom ; p / vf : rareté dans les dimensions (voir world/dimgen.js) ; power : puissance des outils
 */
(function (I) {
  function dr(id, min, max, chance) { return { id: id, min: min, max: max, chance: chance === undefined ? 1 : chance }; }
  const ORES = [
    { id: 'cobalt', name: 'cobalt', art: 'de cobalt', c: '#3a5fd0', nat: 'bleu profond', power: 4, dur: 0.22, need: 2, time: 10, w: 1.2 },
    { id: 'mithril', name: 'mithril', art: 'de mithril', c: '#4ad8c0', nat: 'turquoise', power: 4, dur: 0.2, need: 2, time: 10, w: 1 },
    { id: 'orichalque', name: 'orichalque', art: 'd’orichalque', c: '#e8826a', nat: 'rose cuivré', power: 5, dur: 0.2, need: 2, time: 12, w: 1 },
    { id: 'adamantite', name: 'adamantite', art: 'd’adamantite', c: '#2f9a58', nat: 'vert sombre', power: 5, dur: 0.18, need: 3, time: 12, w: 1 },
    { id: 'titane', name: 'titane', art: 'de titane', c: '#8a7aa8', nat: 'gris violet', power: 4, dur: 0.2, need: 2, time: 10, w: 1.2 },
    // mélange : fabriqué à l'établi (2 de chacun des trois), jamais dans le monde, jamais coloré
    { id: 'obscurium', name: 'obscurium', art: 'd’obscurium', c: '#1c1c26', nat: 'noir', power: 6, dur: 0.16, need: 3, time: 14, mix: ['cobalt', 'mithril', 'adamantite'], w: 0 },
  ];
  const T = I.ITEMS;
  ORES.forEach(function (o) {
    const mix = !!o.mix;
    T[o.id + '_ore'] = { name: 'Minerai ' + o.art, desc: mix ? 'Un alliage noir de cobalt, de mithril et d’adamantite. Introuvable : on le fabrique à l’établi. Se fond au four.' : 'Un minerai ' + o.nat + ', rare. Il faut une pioche en fer. Se fond au four.', stack: 99 };
    T[o.id + '_bar'] = { name: 'Lingot ' + o.art, desc: 'Un lingot ' + o.nat + ', pour forger une pioche et une hache.', stack: 99 };
    T['axe_' + o.id] = { name: 'Hache en ' + o.name, desc: 'Une hache ' + o.nat + ' : très efficace et très rapide.', stack: 1, tool: 'axe', power: o.power, tier: mix ? 4 : 3, dur: o.dur };
    T['pickaxe_' + o.id] = { name: 'Pioche en ' + o.name, desc: 'Une pioche ' + o.nat + ' : brise tout très vite.', stack: 1, tool: 'pickaxe', power: o.power, tier: mix ? 4 : 3, dur: o.dur };
    ['_ore', '_bar'].forEach(function (s) { I.ITEM_ORDER.push(o.id + s); });
    I.ITEM_ORDER.push('axe_' + o.id, 'pickaxe_' + o.id);
    if (!mix) {
      I.OBJECTS['ore_' + o.id] = {
        kind: 'resource', tool: 'pickaxe', tier: 2, hp: 6, collider: [-6, -6, 12, 6], sprite: 'ore_' + o.id, spriteCut: null,
        center: [0, -5], hitR: 10, respawnDays: 5, shadow: 'rock', fx: 'stone', drops: [dr('stone', 0, 1, 0.4), dr(o.id + '_ore', 1, 2)],
      };
    }
  });
  I.ORES = ORES;
  I.ORE_POOL = ORES.filter(function (o) { return !o.mix; });
})((window.Iles = window.Iles || {}));
