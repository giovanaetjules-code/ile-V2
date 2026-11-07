/* Constantes globales du jeu. Tout le code vit dans l'espace de noms window.Iles. */
(function (I) {
  I.config = {
    TILE: 16,
    MAP_W: 80,
    MAP_H: 64,

    SAVE_VERSION: 1,
    SAVE_KEY: 'iles-derivantes:save',
    SETTINGS_KEY: 'iles-derivantes:settings',
    AUTOSAVE_SECONDS: 45,

    STEP: 1 / 60, // pas de simulation fixe (utile plus tard pour le réseau)
    TARGET_VIEW_HEIGHT: 216, // hauteur logique visée pour le zoom automatique

    DAY_MINUTES: 1440,
    MINUTES_PER_SECOND: 2, // 1 jour de jeu = 12 minutes réelles
    FARM_SPEED: 6, // les cultures poussent 6 fois plus vite que le temps du jeu (carotte ≈ 2 min réelles)
    START_MINUTES: 7 * 60 + 30,

    PLAYER_SPEED: 68,
    DASH_SPEED: 190,
    DASH_TIME: 0.16,
    DASH_COOLDOWN: 0.8,

    INVENTORY_SIZE: 24,
    HOTBAR_SIZE: 8,

    DEMO_SEED: 20240501,
  };
})((window.Iles = window.Iles || {}));
