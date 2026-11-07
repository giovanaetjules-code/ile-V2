/*
 * Voyage vers les dimensions aléatoires : le bouton rouge du lobby éveille le portail ultime (6 s), tire une graine et une couleur
 * (sa couleur dominante), puis envoie tous les joueurs dans la dimension générée (world/dimgen.js). Tout est calculé par l'hôte ; l'état `state.act` est recopié chez les invités pour l'animation.
 */
(function (I) {
  const DUR = 6;

  function press(state, p, ev) {
    if (state.act) { ev.push({ type: 'msg', pid: p.id, text: 'Le portail s’éveille déjà…' }); return; }
    const seed = I.dimgen.describe(1 + Math.floor(Math.random() * 2147483646)).seed, tint = I.dimgen.describe(seed).pal[0]; // la couleur dominante teinte le portail pendant l'éveil
    state.act = { t: 0, dur: DUR, seed: seed, tint: tint };
    ev.push({ type: 'dimStart', pid: p.id, seed: seed, tint: tint });
  }

  function step(state, dt, ev) {
    const a = state.act;
    if (!a) return;
    const before = a.t; a.t += dt;
    if (before < a.dur - 0.9 && a.t >= a.dur - 0.9) ev.push({ type: 'flash', kind: 'dim' });
    if (a.t >= a.dur) {
      state.act = null;
      const f = state.progress.flags;
      f.dimCount = (f.dimCount | 0) + 1; f.lastDim = { seed: a.seed, tint: a.tint };
      ev.push({ type: 'dimReady', seed: a.seed, tint: a.tint, n: f.dimCount });
      state.travelTo = 'd:' + a.seed; state.travelT = 0.05; // l'écran est déjà blanc (éclair) : on part tout de suite
    }
  }

  /** Nom d'une dimension, déduit de sa graine (types de monde + couleurs). */
  function name(seed) { return I.dimgen.describe(seed).name; }

  I.dimension = { DUR: DUR, press: press, step: step, name: name };
})((window.Iles = window.Iles || {}));
