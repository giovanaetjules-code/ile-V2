/*
 * Agriculture : planter une graine sur une parcelle, la voir pousser (calculé depuis l'heure de plantation, rien à synchroniser
 * à chaque pas), récolter quand c'est mûr. Donnée d'une parcelle : { crop, t0 } (t0 = minutes de jeu à la plantation).
 */
(function (I) {
  const REACH = 60, TS = I.config.TILE;

  /** Stade : -1 = vide, 0..2 = pousse, 3 = mûr. */
  function stage(d, now) {
    if (!d || !d.crop || !I.CROPS[d.crop]) return -1;
    const need = I.CROPS[d.crop].days * I.config.DAY_MINUTES / (I.config.FARM_SPEED || 1), el = I.weather.growthMinutes(now) - I.weather.growthMinutes(d.t0); // la pluie accélère la pousse
    return el >= need ? 3 : Math.max(0, Math.floor(3 * el / need));
  }

  function plotAt(world, tx, ty) { const o = world.floorAt(tx, ty); return o && o.type === 'plot' ? o : null; }

  /** Planter la graine tenue (case du sac `slot`) sur la parcelle visée. */
  function plant(state, p, slot, tx, ty, ev) {
    const s = p.inv.slots[slot], def = s && I.ITEMS[s.id];
    if (!def || !def.seed || !I.CROPS[def.seed]) return { ok: false, reason: 'item' };
    const o = plotAt(state.world, tx, ty);
    if (!o) return { ok: false, reason: 'noPlot' };
    if (Math.hypot(p.x - o.x, (p.y - 6) - (o.y - 8)) > REACH) return { ok: false, reason: 'far' };
    if (o.data && o.data.crop) return { ok: false, reason: 'taken' };
    o.data = { crop: def.seed, t0: state.time.minutes };
    p.inv.take(slot, 1);
    p.stats.planted = (p.stats.planted | 0) + 1;
    ev.push({ type: 'plant', pid: p.id, x: o.x, y: o.y - 4 });
    return { ok: true };
  }

  /** Récolte d'une parcelle mûre : fruits / légumes et, souvent, une graine. */
  function harvest(state, p, o, ev) {
    const st = stage(o.data, state.time.minutes);
    if (st < 3) return { ok: false, reason: 'young' };
    const c = I.CROPS[o.data.crop], n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1));
    for (let i = 0; i < n; i++) state.world.spawnDrop(c.item, 1, o.x, o.y - 6, true).z = 6;
    if (Math.random() < 0.6) state.world.spawnDrop(c.seed, 1, o.x, o.y - 6, true).z = 6;
    ev.push({ type: 'harvest', pid: p.id, id: o.id, otype: 'plot', x: o.x, y: o.y - 6 });
    p.stats['crop_' + o.data.crop] = (p.stats['crop_' + o.data.crop] | 0) + 1;
    o.data = { crop: null, t0: 0 };
    return { ok: true };
  }

  const TEXT = { noPlot: 'Il faut planter sur une parcelle labourée.', far: 'Trop loin pour planter.', taken: 'Il y a déjà une plante ici.', young: 'Ce n’est pas encore mûr.' };

  I.farming = { stage: stage, plotAt: plotAt, plant: plant, harvest: harvest, TEXT: TEXT, REACH: REACH };
})((window.Iles = window.Iles || {}));
