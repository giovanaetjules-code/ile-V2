/*
 * Lobby spatial : une immense plateforme circulaire en quartz blanc au milieu du cosmos, avec le portail ultime au centre,
 * le bouton rouge (voyage vers une dimension aléatoire) et le point de retour vers l'île. C'est un monde comme un autre
 * (new World(seed, { lobby: true })) : même moteur, mêmes collisions, mêmes objets. Le vide autour est la tuile 0.
 * Les sprites sont dessinés dans rendering/sprites.js, le ciel dans rendering/sky.js, la logique du bouton dans systems/dimension.js.
 */
(function (I) {
  const T = I.TILE, TS = I.config.TILE, W = 48, H = 40, CX = 24, CY = 19.5, R = 16.5;
  const PORTAL = { x: 24 * TS + 8, y: 15 * TS }; // pied du portail ultime (px)

  I.OBJECTS.portal_ultimate = { kind: 'interact', collider: [-40, -13, 80, 13], sprite: 'portal_ultimate', center: [0, 16], interactR: 50, action: 'portalUltimate', label: 'Franchir le portail ultime' };
  I.OBJECTS.red_button = { kind: 'interact', collider: [-10, -7, 20, 7], sprite: 'red_button', center: [0, 6], interactR: 26, action: 'redbutton', label: 'Appuyer sur le bouton rouge', glowSoft: 'red' };
  I.OBJECTS.return_pad = { kind: 'interact', layer: 'floor', sprite: 'return_pad', center: [0, -2], interactR: 22, action: 'returnpad', label: 'Retourner sur l’île' };
  I.OBJECTS.q_pillar = { kind: 'decor', collider: [-5, -5, 10, 5], sprite: 'q_pillar', shadow: 'small', glowSoft: 'cyan' };
  I.OBJECTS.q_obelisk = { kind: 'decor', collider: [-4, -4, 8, 4], sprite: 'q_obelisk', shadow: 'small', glowSoft: 'white' };
  I.OBJECTS.q_crystal = { kind: 'decor', collider: [-5, -3, 10, 3], sprite: 'q_crystal', shadow: 'small', glowSoft: 'cyan' };

  I.generateLobby = function (seed) {
    const g = new Uint8Array(W * H), objects = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - CX, dy = y - CY, d = Math.hypot(dx, dy);
        if (d > R) continue; // le vide
        let t = T.QUARTZ;
        const pd = Math.hypot(x - CX, y - 12.5);          // distance au portail ultime
        const q = Math.atan2(dy, dx) / (Math.PI / 4), off = Math.abs(q - Math.round(q)) * (Math.PI / 4) * d; // distance (en cases) au rayon de 45° le plus proche
        if (pd < 4.6) t = T.DAIS;
        else if (pd < 5.7) t = T.INLAY;
        else if ((d >= 8.6 && d < 9.6) || (d >= 14.9 && d < 15.9)) t = T.INLAY;
        else if (d > 9.6 && d < 14.9 && off < 0.6) t = T.INLAY;
        g[y * W + x] = t;
      }
    }
    const tile = function (tx, ty) { return { x: tx * TS + 8, y: ty * TS + 16 }; };
    let n = 0;
    const add = function (type, x, y, v) { objects.push({ id: type + (n++), type: type, x: Math.round(x), y: Math.round(y), variant: v || 0 }); };
    add('portal_ultimate', PORTAL.x, PORTAL.y);
    const b = tile(24, 22); add('red_button', b.x, b.y);
    const p = tile(24, 32); add('return_pad', p.x, p.y);
    for (let i = 0; i < 8; i++) { // colonnes entre les rayons, cristaux sur l'anneau extérieur, obélisques à mi-chemin
      const a = (i + 0.5) * Math.PI / 4, pl = tile(Math.round(CX + Math.cos(a) * 12.6 - 0.5), Math.round(CY + Math.sin(a) * 12.6 - 0.5)); add('q_pillar', pl.x, pl.y);
      const b2 = i * Math.PI / 4, c = tile(Math.round(CX + Math.cos(b2) * 14.2 - 0.5), Math.round(CY + Math.sin(b2) * 14.2 - 0.5));
      if (i !== 2) add('q_crystal', c.x, c.y, i % 2);
    }
    for (const a of [0.6, 2.5, 3.8, 5.7]) { const o = tile(Math.round(CX + Math.cos(a) * 7.4 - 0.5), Math.round(CY + Math.sin(a) * 7.4 - 0.5)); add('q_obelisk', o.x, o.y); }
    const sp = tile(24, 29);
    return {
      W: W, H: H, ground: g, edges: new Uint8Array(W * H), objects: objects, drops: [], nextId: 1,
      spawn: { x: sp.x, y: sp.y }, meta: { lobby: true, portal: { x: PORTAL.x, y: PORTAL.y } },
    };
  };
  I.LOBBY = { W: W, H: H, PORTAL: PORTAL };
})((window.Iles = window.Iles || {}));
