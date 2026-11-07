/*
 * Tests de bout en bout dans un vrai Chromium (clavier, souris, localStorage, rechargement de page).
 *   node tools/test.js            (variables : PLAYWRIGHT_PATH, CHROMIUM, OUT)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const OUT = process.env.OUT || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|ERR_FILE_NOT_FOUND|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });

  const E = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const shot = n => page.screenshot({ path: path.join(OUT, n) });

  await page.goto(URL);
  await wait(500);

  console.log('Démarrage et menus');
  check('écran titre affiché', await E(() => Iles.Menu.screen === 'title'));
  check('« Continuer » désactivé sans sauvegarde', await E(() => document.getElementById('btn-continue').disabled));
  await page.click('#btn-new');
  await wait(400);
  check('partie lancée', await E(() => Iles.Menu.screen === 'playing'));
  check('sauvegarde créée dès le début', await E(() => !!localStorage.getItem('iles-derivantes:save')));
  const sc = await E(() => Iles.debug.renderer.scale);
  check('zoom entier (pixels nets)', Number.isInteger(sc), sc);
  check('inventaire de départ : hache + pioche', await E(() => { const s = Iles.debug.game.local.inv.slots; return s[0].id === 'axe' && s[1].id === 'pickaxe'; }));

  console.log('Échap / pause');
  await page.keyboard.press('Escape'); await wait(100);
  check('Échap ouvre la pause', await E(() => Iles.Menu.screen === 'pause'));
  const t0 = await E(() => Iles.debug.game.state.time.minutes); await wait(300);
  check('le temps est figé en pause', (await E(() => Iles.debug.game.state.time.minutes)) === t0);
  await page.keyboard.press('Escape'); await wait(100);
  check('Échap referme la pause', await E(() => Iles.Menu.screen === 'playing'));

  console.log('Déplacement et collisions (clavier réel)');
  const p0 = await E(() => { const p = Iles.debug.game.local; return { x: p.x, y: p.y }; });
  await page.keyboard.down('KeyD'); await wait(500); await page.keyboard.up('KeyD');
  const p1 = await E(() => { const p = Iles.debug.game.local; return { x: p.x, y: p.y }; });
  check('D déplace vers la droite', p1.x > p0.x + 15, [p0, p1]);
  await page.keyboard.down('ArrowLeft'); await wait(500); await page.keyboard.up('ArrowLeft');
  const p2 = await E(() => Iles.debug.game.local.x);
  check('flèche gauche déplace vers la gauche', p2 < p1.x - 15, [p1.x, p2]);
  // plus de maison préconstruite : le haut est libre
  const py0 = await E(() => Iles.debug.game.local.y);
  await page.keyboard.down('KeyW'); await wait(800); await page.keyboard.up('KeyW');
  const py = await E(() => Iles.debug.game.local.y);
  check('le joueur avance vers le haut (plus de maison préconstruite)', py < py0 - 20, [py0, py]);
  // dash
  const d0 = await E(() => Iles.debug.game.local.x);
  await page.keyboard.down('KeyD'); await page.keyboard.press('Space'); await wait(60);
  const dashing = await E(() => Iles.debug.game.local.dashT > 0);
  await wait(300); await page.keyboard.up('KeyD');
  check('Espace déclenche un dash', dashing);
  check('dash : temps de recharge actif juste après', await E(() => Iles.debug.game.local.dashCd > 0));

  console.log('Marche aléatoire : 30 000 pas, jamais dans un obstacle ni dans l’eau');
  const walk = await E(() => {
    const g = new Iles.Game(); g.newGame(); const p = g.local, w = g.state.world;
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let bad = 0, moved = 0, mx = 0, my = 0, lastX = p.x, lastY = p.y, maxJump = 0;
    for (let i = 0; i < 30000; i++) {
      if (i % 40 === 0) { mx = Math.round(rnd() * 2 - 1); my = Math.round(rnd() * 2 - 1); }
      g.step({ p1: { mx, my, dash: rnd() < 0.02, use: false, aim: null, interact: false, hotbar: null } }, 1 / 60);
      if (Iles.collision.isBlocked(w, p)) bad++;
      if (!w.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) bad++;
      maxJump = Math.max(maxJump, Math.hypot(p.x - lastX, p.y - lastY)); lastX = p.x; lastY = p.y;
      moved += Math.abs(mx) + Math.abs(my);
    }
    return { bad, maxJump, x: p.x, y: p.y };
  });
  check('aucune position invalide', walk.bad === 0, walk);
  check('aucune téléportation (saut max ≤ 4 px/pas)', walk.maxJump <= 4, walk.maxJump);

  console.log('Récolte : hache sur un arbre (souris réelle)');
  const tree = await E(() => {
    const g = Iles.debug.game, w = g.state.world, p = g.local;
    const cands = w.objects.filter(o => o.type === 'tree_oak' && Math.hypot(o.x - 608, o.y - 494) < 230).sort((a, b) => Math.hypot(a.x - 608, a.y - 494) - Math.hypot(b.x - 608, b.y - 494));
    for (const o of cands) {
      p.x = o.x; p.y = o.y + 7.5;
      if (!Iles.collision.isBlocked(w, p) && w.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) {
        p.sel = 0; Iles.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16);
        return { id: o.id, x: o.x, y: o.y, cx: o.x, cy: o.y - 9 };
      }
    }
    return null;
  });
  check('arbre accessible trouvé', !!tree);
  const woodBefore = await E(() => Iles.debug.game.local.inv.count('wood'));
  const sp = await E((t) => { const c = Iles.debug.cam, s = Iles.debug.renderer.scale; return { x: (t.cx - c.rx) * s, y: (t.cy - c.ry) * s }; }, tree);
  await page.mouse.move(sp.x, sp.y); await page.mouse.down();
  await wait(700);
  const hp1 = await E((id) => Iles.debug.game.state.world.hpOf(Iles.debug.game.state.world.byId.get(id)), tree.id);
  check('les coups retirent des points de vie', hp1 < 4, hp1);
  await shot('03-chopping.png');
  await wait(1800); await page.mouse.up(); await wait(2200);
  const res = await E((id) => { const g = Iles.debug.game, w = g.state.world; return { dep: w.isDepleted(w.byId.get(id)), wood: g.local.inv.count('wood'), sticks: g.local.inv.count('stick') }; }, tree.id);
  check('l’arbre est abattu (souche)', res.dep);
  check('le bois est ramassé automatiquement', res.wood >= woodBefore + 3, res);
  await shot('04-after-chop.png');

  console.log('Mauvais outil + pioche sur un rocher');
  const rock = await E(() => {
    const g = Iles.debug.game, w = g.state.world, p = g.local;
    const cands = w.objects.filter(o => o.type === 'rock' && Math.hypot(o.x - 608, o.y - 494) < 300).sort((a, b) => Math.hypot(a.x - 608, a.y - 494) - Math.hypot(b.x - 608, b.y - 494));
    for (const o of cands) {
      p.x = o.x; p.y = o.y + 6.5;
      if (!Iles.collision.isBlocked(w, p) && w.isWalkable(Math.floor(p.x / 16), Math.floor((p.y - 1) / 16))) {
        Iles.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16);
        return { id: o.id, cx: o.x, cy: o.y - 5 };
      }
    }
    return null;
  });
  check('rocher accessible trouvé', !!rock);
  const sr = await E((t) => { const c = Iles.debug.cam, s = Iles.debug.renderer.scale; return { x: (t.cx - c.rx) * s, y: (t.cy - c.ry) * s }; }, rock);
  await page.keyboard.press('Digit1'); await wait(50);
  await page.mouse.move(sr.x, sr.y); await page.mouse.down(); await wait(500); await page.mouse.up(); await wait(100);
  check('la hache ne casse pas un rocher', await E((id) => Iles.debug.game.state.world.hpOf(Iles.debug.game.state.world.byId.get(id)) === 3, rock.id));
  check('message « Il me faudrait une pioche »', await E(() => /pioche/.test(document.getElementById('toasts').textContent)));
  const stoneBefore = await E(() => Iles.debug.game.local.inv.count('stone'));
  await page.keyboard.press('Digit2'); await wait(50);
  await page.mouse.move(sr.x, sr.y); await page.mouse.down(); await wait(1600); await page.mouse.up(); await wait(2200);
  const rres = await E((id) => { const g = Iles.debug.game, w = g.state.world; return { dep: w.isDepleted(w.byId.get(id)), stone: g.local.inv.count('stone') }; }, rock.id);
  check('la pioche brise le rocher', rres.dep, rres);
  check('pierres ramassées', rres.stone >= stoneBefore + 2, rres);

  console.log('Cueillette avec E');
  const fl = await E(() => {
    const g = Iles.debug.game, w = g.state.world, p = g.local;
    const cands = w.objects.filter(o => o.type.indexOf('flower') === 0 && Math.hypot(o.x - 608, o.y - 494) < 300);
    for (const o of cands) { p.x = o.x + 6; p.y = o.y; if (!Iles.collision.isBlocked(w, p)) { Iles.debug.cam.snapTo(p.x, p.y - 8, w.W * 16, w.H * 16); return { id: o.id, type: o.type }; } }
    return null;
  });
  await wait(150);
  check('invite « E » affichée près d’une fleur', await E(() => !document.getElementById('prompt').classList.contains('hidden')));
  await page.keyboard.press('KeyE'); await wait(1500);
  check('la fleur est cueillie et ramassée', await E((f) => { const g = Iles.debug.game; return g.state.world.isDepleted(g.state.world.byId.get(f.id)) && g.local.inv.count(f.type) >= 1; }, fl));

  console.log('Inventaire');
  await page.keyboard.press('KeyE'); await wait(150);
  check('I ouvre l’inventaire', await E(() => Iles.Menu.screen === 'inventory'));
  await shot('05-inventory.png');
  const before = await E(() => Iles.debug.game.local.inv.toJSON());
  await page.click('#inv-grid .slot:nth-child(1)'); await page.click('#inv-grid .slot:nth-child(12)');
  const after = await E(() => Iles.debug.game.local.inv.toJSON());
  check('déplacer un objet entre deux cases', before[0] && !after[0] && after[11] && after[11].id === before[0].id, after[11]);
  await page.click('#btn-sort');
  check('trier fusionne les piles', await E(() => { const s = Iles.debug.game.local.inv.slots; const ids = s.slice(8).filter(Boolean).map(x => x.id); return new Set(ids).size === ids.length; }));
  const woodN = await E(() => Iles.debug.game.local.inv.count('wood'));
  const woodSlot = await E(() => Iles.debug.game.local.inv.slots.findIndex(s => s && s.id === 'wood'));
  await page.click('#inv-grid .slot:nth-child(' + (woodSlot + 1) + ')'); await page.click('#btn-throw');
  check('jeter une pile la retire du sac', (await E(() => Iles.debug.game.local.inv.count('wood'))) === 0 && woodN > 0);
  await page.keyboard.press('KeyE'); await wait(100);
  check('I referme l’inventaire', await E(() => Iles.Menu.screen === 'playing'));
  await wait(500);
  check('un objet jeté n’est pas ramassé tout de suite', (await E(() => Iles.debug.game.local.inv.count('wood'))) === 0);
  await wait(3000);
  check('…mais il est ramassé de nouveau après le délai', (await E(() => Iles.debug.game.local.inv.count('wood'))) === woodN);

  console.log('Sauvegarde / chargement');
  await E(() => { const p = Iles.debug.game.local; p.x = 608; p.y = 494; Iles.debug.cam.snapTo(p.x, p.y - 8, 1280, 1024); });
  await wait(150);
  await E(() => Iles.debug.app.saveNow('manual')); await wait(300);
  check('la sauvegarde manuelle fonctionne', await E(() => Iles.debug.app.lastSave && Iles.debug.app.lastSave.ok));
  const snapA = await E(() => { const g = Iles.debug.game; return { inv: g.local.inv.toJSON(), x: g.local.x, y: g.local.y, st: JSON.stringify(g.state.world.state), minutes: g.state.time.minutes, drops: g.state.world.drops.length }; });
  const saved = JSON.parse(await E(() => localStorage.getItem('iles-derivantes:save')));
  check('sauvegarde versionnée', saved.version === 1 && saved.world && saved.players && saved.players.p1 && saved.time);
  check('monde et joueur séparés dans le fichier', !!saved.world.state && !!saved.players.p1.inv && !saved.players.p1.state);
  console.log('     taille de la sauvegarde :', JSON.stringify(saved).length, 'octets');

  await page.reload(); await wait(600);
  check('après rechargement : « Continuer » actif', await E(() => !document.getElementById('btn-continue').disabled));
  await page.click('#btn-continue'); await wait(400);
  const snapB = await E(() => { const g = Iles.debug.game; return { inv: g.local.inv.toJSON(), x: g.local.x, y: g.local.y, st: JSON.stringify(g.state.world.state), minutes: g.state.time.minutes, drops: g.state.world.drops.length }; });
  check('inventaire identique', JSON.stringify(snapA.inv) === JSON.stringify(snapB.inv));
  check('position identique', Math.abs(snapA.x - snapB.x) < 0.5 && Math.abs(snapA.y - snapB.y) < 0.5, [snapA, snapB]);
  check('arbres / rochers abîmés conservés', snapA.st === snapB.st);
  check('objets au sol conservés', snapA.drops === snapB.drops, [snapA.drops, snapB.drops]);
  check('heure conservée', snapB.minutes >= snapA.minutes - 0.1 && snapB.minutes < snapA.minutes + 10);
  check('l’arbre abattu est toujours une souche', await E((id) => Iles.debug.game.state.world.isDepleted(Iles.debug.game.state.world.byId.get(id)), tree.id));
  await shot('06-after-reload.png');

  console.log('Repousse');
  await E(() => { Iles.debug.game.state.time.minutes += 6 * 1440; });
  await wait(200);
  check('l’arbre a repoussé après quelques jours', await E((id) => !Iles.debug.game.state.world.isDepleted(Iles.debug.game.state.world.byId.get(id)), tree.id));

  console.log('Erreurs de sauvegarde');
  await E(() => { window.__orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }; });
  const r = await E(() => Iles.debug.app.saveNow('manual'));
  check('quota dépassé → échec signalé', r && r.ok === false && /plein/.test(r.error), r);
  check('message visible pour le joueur', await E(() => /impossible/i.test(document.getElementById('savebadge').textContent) && !document.getElementById('savebadge').classList.contains('hidden')));
  await E(() => { Storage.prototype.setItem = window.__orig; });
  check('l’ancienne sauvegarde n’est pas détruite par un échec', await E(() => { try { return JSON.parse(localStorage.getItem('iles-derivantes:save')).version === 1; } catch (e) { return false; } }));
  const r2 = await E(() => Iles.debug.app.saveNow('manual'));
  check('la sauvegarde refonctionne ensuite', r2 && r2.ok);

  console.log('Sauvegarde corrompue → copie de secours');
  await E(() => { Iles.Menu.show('title'); localStorage.setItem('iles-derivantes:save', '{pas du json'); }); // depuis le titre : pas de sauvegarde auto à la fermeture
  await page.reload(); await wait(500);
  check('« Continuer » reste actif grâce à la copie de secours', await E(() => !document.getElementById('btn-continue').disabled));
  check('le joueur est prévenu', await E(() => /secours/.test(document.getElementById('title-note').textContent)));
  await page.click('#btn-continue'); await wait(300);
  check('la partie se charge depuis la copie', await E(() => Iles.Menu.screen === 'playing'));
  await E(() => { Iles.Menu.show('title'); localStorage.removeItem('iles-derivantes:save:bak'); localStorage.setItem('iles-derivantes:save', '{pas du json'); });
  await page.reload(); await wait(500);
  check('sans copie : « Continuer » désactivé + erreur claire', await E(() => document.getElementById('btn-continue').disabled && /illisible|erreur/i.test(document.getElementById('title-note').textContent)));
  await E(() => { localStorage.setItem('iles-derivantes:save', JSON.stringify({ version: 99, seed: 1, players: {}, time: {} })); });
  await page.reload(); await wait(500);
  check('sauvegarde d’une version future refusée proprement', await E(() => document.getElementById('btn-continue').disabled && /récente/.test(document.getElementById('title-note').textContent)));

  console.log('Nouvelle partie / effacement avec confirmation');
  await E(() => { localStorage.clear(); });
  await page.reload(); await wait(400);
  await page.click('#btn-new'); await wait(300);
  await page.keyboard.press('Escape'); await page.click('#btn-quit'); await wait(300);
  check('retour au titre avec sauvegarde', await E(() => Iles.Menu.screen === 'title' && !document.getElementById('btn-continue').disabled));
  await page.click('#btn-new'); await wait(200);
  check('« Nouvelle partie » demande confirmation', await E(() => Iles.Menu.screen === 'confirm'));
  await page.click('#btn-confirm-no'); await wait(100);
  check('Annuler revient au titre', await E(() => Iles.Menu.screen === 'title'));
  await page.click('#btn-options'); await wait(100);
  await page.click('#btn-erase'); await wait(100);
  check('effacer demande confirmation', await E(() => Iles.Menu.screen === 'confirm'));
  await page.click('#btn-confirm-yes'); await wait(200);
  check('sauvegarde effacée après confirmation', await E(() => !localStorage.getItem('iles-derivantes:save') && Iles.Menu.screen !== 'confirm'));

  console.log('Ambiance : jour / crépuscule / nuit');
  await page.goto(URL); await wait(400); await page.click('#btn-new'); await wait(300);
  for (const [h, name] of [[10, '07-day'], [18.7, '08-dusk'], [22, '09-night']]) {
    await E((hh) => { const s = Iles.debug.game.state; s.time.minutes = Math.floor(s.time.minutes / 1440) * 1440 + hh * 60; }, h);
    await wait(500); await shot(name + '.png');
  }

  console.log('Tailles d’écran');
  for (const [w, h, dpr, name] of [[1920, 1080, 1, '10-1080p'], [1366, 768, 1, '11-768p'], [800, 600, 1, '12-800x600'], [390, 760, 2, '13-phone'], [1536, 864, 1.5, '14-dpr15']]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const p2 = await c2.newPage();
    p2.on('pageerror', e => errors.push('pageerror(' + name + '): ' + e.message));
    await p2.goto(URL); await p2.waitForTimeout(400); await p2.click('#btn-new'); await p2.waitForTimeout(500);
    const info = await p2.evaluate(() => { const r = Iles.debug.renderer, c = document.getElementById('game'); return { scale: r.scale, w: r.w, h: r.h, cssW: parseFloat(c.style.width), devPx: r.scale * (window.devicePixelRatio || 1) }; });
    check(name + ' : pixel du jeu = nombre entier de pixels écran (' + info.devPx + ')', Math.abs(info.devPx - Math.round(info.devPx)) < 1e-6, info);
    check(name + ' : le canvas couvre la fenêtre', info.cssW >= w - 0.01, info);
    await p2.screenshot({ path: path.join(OUT, name + '.png') });
    await c2.close();
  }

  console.log('\nErreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(`\n${pass} ok, ${fail} échec(s)`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
