/* Objets propres aux dimensions : le grand arbre (forêts géantes) et le portail de retour vers le lobby (le portail ultime, réutilisé). */
(function (I) {
  I.OBJECTS.tree_giant = {
    kind: 'resource', tool: 'axe', hp: 9, collider: [-8, -6, 16, 6], colliderCut: [-8, -4, 16, 4], sprite: 'tree_giant', spriteCut: 'stump',
    center: [0, -18], hitR: 24, respawnDays: 3, shadow: 'tree', fx: 'wood',
    drops: [{ id: 'wood', min: 6, max: 8, chance: 1 }, { id: 'stick', min: 1, max: 3, chance: 0.6 }], leaf: ['#58a845', '#7cc94f', '#3a7d3a'],
  };
  I.OBJECTS.dim_portal = Object.assign({}, I.OBJECTS.portal_ultimate, { action: 'returnLobby', label: 'Retourner au lobby spatial', glowSoft: 'white' });
})((window.Iles = window.Iles || {}));
