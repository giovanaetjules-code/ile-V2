/* Horloge du monde : state.time.minutes = minutes écoulées depuis le début du jour 1. */
(function (I) {
  const KEYS = [
    [0, [78, 90, 165]], [5, [90, 100, 170]], [6.5, [255, 195, 160]], [8, [255, 246, 228]],
    [12, [255, 255, 255]], [17, [255, 242, 220]], [18.5, [255, 185, 135]], [20, [135, 120, 190]],
    [21.5, [78, 90, 165]], [24, [78, 90, 165]],
  ];

  function tint(hour) {
    for (let i = 1; i < KEYS.length; i++) {
      if (hour <= KEYS[i][0]) {
        const a = KEYS[i - 1], b = KEYS[i];
        const t = (hour - a[0]) / (b[0] - a[0]);
        return [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * t); });
      }
    }
    return KEYS[KEYS.length - 1][1];
  }

  I.timeutil = {
    day: function (m) { return Math.floor(m / I.config.DAY_MINUTES) + 1; },
    hour: function (m) { return (m % I.config.DAY_MINUTES) / 60; },
    clock: function (m) {
      const h = Math.floor((m % I.config.DAY_MINUTES) / 60), mi = Math.floor(m % 60);
      return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
    },
    tint: tint,
    /** 0 = plein jour, 1 = pleine nuit */
    night: function (hour) {
      const c = tint(hour);
      const lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      return Math.max(0, Math.min(1, (1 - lum) / 0.5));
    },
  };
})((window.Iles = window.Iles || {}));
