/* Types de tuiles du sol. */
(function (I) {
  I.TILE = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, GRASS_DARK: 4, DIRT: 5, PLANK: 6, QUARTZ: 7, INLAY: 8, DAIS: 9, STONE: 10, WALL: 11, GLOW: 12 };
  I.WALKABLE = [false, false, true, true, true, true, true, true, true, true, true, false, true]; // 7-9 : sol du lobby spatial (le vide est la tuile 0) ; 10 pierre, 11 mur de roche (solide), 12 sol lumineux
  I.isWater = function (t) { return t <= 1; };
})((window.Iles = window.Iles || {}));
