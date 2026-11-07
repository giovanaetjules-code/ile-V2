/*
 * Points de vie et faim. La faim baisse doucement ; bien nourri, la vie remonte ; à 0 de faim, la vie baisse
 * lentement jusqu'à un minimum (jamais mortel). Les aliments restaurent faim et vie, et peuvent donner un effet
 * temporaire : regen (vie qui remonte) ou speed (déplacement plus rapide).
 */
(function (I) {
  const MAXHP = 100, MAXHUN = 100, MINHP = 10;
  const HUN_RATE = 0.06, REGEN = 0.4, STARVE = 0.25, BUFF_REGEN = 1.5, BUFF_MAX = 180;

  function init(p) { p.hp = MAXHP; p.hun = 80; p.buff = { regen: 0, speed: 0 }; }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** Propriétés nutritives d'un objet : aliment cru, ou plat cuisiné (voir systems/cooking.js). */
  function foodOf(id) { const f = I.FOOD[id]; if (f) return f.noEat ? null : f; return (I.cooking && I.cooking.foodOf ? I.cooking.foodOf(id) : null); }

  function tick(p, dt) {
    if (!isFinite(p.hp)) init(p);
    p.hun = Math.max(0, p.hun - HUN_RATE * dt);
    p.invul = Math.max(0, (p.invul || 0) - dt);
    const sx = p.st; // statuts des monstres : poison et brûlure font perdre de la vie (jamais mortels), gel ralentit, foudre étourdit
    if (sx) {
      if (sx.poison > 0) { sx.poison -= dt; p.hp = Math.max(1, p.hp - 2.4 * dt); }
      if (sx.burn > 0) { sx.burn -= dt; p.hp = Math.max(1, p.hp - 4 * dt); }
      if (sx.slow > 0) sx.slow -= dt;
      if (sx.stun > 0) sx.stun -= dt;
    }
    if (p.hun >= 60 && p.hp < MAXHP && !(sx && (sx.poison > 0 || sx.burn > 0))) p.hp = Math.min(MAXHP, p.hp + REGEN * dt);
    else if (p.hun <= 0 && p.hp > MINHP) p.hp = Math.max(MINHP, p.hp - STARVE * dt);
    const b = p.buff;
    if (b.regen > 0) { b.regen = Math.max(0, b.regen - dt); p.hp = Math.min(MAXHP, p.hp + BUFF_REGEN * dt); }
    if (b.speed > 0) b.speed = Math.max(0, b.speed - dt);
  }

  /** Manger l'objet de la case `slot` : un seul exemplaire (les plats à parts : voir cooking.consume). */
  function eat(state, p, slot, ev) {
    const s = p.inv.slots[slot], f = s && foodOf(s.id);
    if (!f) return { ok: false, reason: 'notFood' };
    if (p.hun >= MAXHUN - 0.5 && p.hp >= MAXHP - 0.5 && !f.regen && !f.speed) return { ok: false, reason: 'full' };
    const portion = I.cooking && I.cooking.portion ? I.cooking.portion(p, slot, f) : f; // plat à parts : valeurs d'une part
    p.hun = clamp(p.hun + portion.hun, 0, MAXHUN);
    p.hp = clamp(p.hp + (portion.hp || 0), 0, MAXHP);
    if (portion.regen) p.buff.regen = Math.min(BUFF_MAX, p.buff.regen + portion.regen);
    if (portion.speed) p.buff.speed = Math.min(BUFF_MAX, p.buff.speed + portion.speed);
    if (!(I.cooking && I.cooking.afterEat && I.cooking.afterEat(p, slot))) p.inv.take(slot, 1);
    p.stats.eaten = (p.stats.eaten | 0) + 1;
    const bits = ['faim +' + Math.round(portion.hun)];
    if (portion.hp) bits.push('soin +' + Math.round(portion.hp));
    if (portion.regen) bits.push('régénération');
    if (portion.speed) bits.push('vitesse');
    ev.push({ type: 'eat', pid: p.id, item: s.id, x: p.x, y: p.y - 10 });
    ev.push({ type: 'msg', pid: p.id, text: bits.join(' · ') });
    return { ok: true };
  }

  function speedMul(p) { return (p.buff && p.buff.speed > 0 ? 1.2 : 1) * (p.st && p.st.slow > 0 ? 0.55 : 1); }

  I.vitals = { MAXHP: MAXHP, MAXHUN: MAXHUN, init: init, tick: tick, eat: eat, foodOf: foodOf, speedMul: speedMul };
})((window.Iles = window.Iles || {}));
