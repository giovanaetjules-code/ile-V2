/* Point d'entrée : assemble les modules, traduit les entrées en intentions, lance la boucle. */
(function (I) {
  'use strict';
  const C = I.config;
  const canvas = document.getElementById('game');

  const game = new I.Game();
  const input = new I.Input(canvas);
  I.Touch.init(input); // commandes tactiles (seulement sur écran tactile)
  const cam = new I.Camera();
  const fx = new I.Effects();
  let renderer = null;
  let autoT = 0;
  let lastWorld = 0;

  const app = {
    settings: I.SaveManager.loadSettings(),
    lastSave: null,

    applySettings: function () {
      I.SaveManager.saveSettings(this.settings);
      I.Net.avatar = this.settings.avatar;
      I.HUD.setHelp(this.settings.help);
      if (renderer) renderer.setShader(this.settings.shader);
      I.Music.setVolume(this.settings.music);
      layout();
    },

    game: game,
    hasPlayer: function () { return !!game.local; },

    onScreenChange: function (name) {
      input.capture = name === 'playing';
      if (name === 'title') { game.demo(); cam.snapTo(600, 520, game.state.world.W * C.TILE, game.state.world.H * C.TILE); }
    },

    startPlaying: function () {
      const p = game.local, w = game.state.world;
      if (!I.Net.isGuest()) p.av = I.avatar.sanitize(this.settings.avatar); // chacun garde son propre avatar
      cam.snapTo(p.x, p.y - 8, w.W * C.TILE, w.H * C.TILE);
      autoT = 0;
      I.Menu.show('playing');
      I.HUD.setHelp(this.settings.help);
      I.HUD.renderHotbar(p);
    },

    continueGame: function () {
      const r = I.SaveManager.load();
      if (!r.ok) { I.Menu.refreshTitle(); return; }
      try { game.loadSnapshot(r.data); } catch (e) {
        document.getElementById('title-note').textContent = 'Chargement impossible : ' + e.message;
        document.getElementById('title-note').className = 'note err';
        return;
      }
      this.startPlaying();
      if (r.usedBackup) I.HUD.message('Copie de secours chargée (la sauvegarde principale était illisible).', 'warn');
    },

    requestNewGame: function () {
      const info = I.SaveManager.peek();
      if (info.ok) {
        I.Menu.confirm('Nouvelle partie ?', 'Une sauvegarde existe déjà (jour ' + info.day + '). Une nouvelle partie la remplacera.', function () { app.newGame(); }, 'title');
      } else app.newGame();
    },

    newGame: function () {
      game.newGame();
      this.startPlaying();
      this.saveNow('new');
    },

    saveNow: function (reason) {
      if (!game.state || !game.local || I.Net.isGuest()) return; // l'invité ne sauvegarde pas : la partie est celle de l'hôte
      const r = I.SaveManager.save(game.snapshot());
      this.lastSave = { ok: r.ok, error: r.error, at: Date.now() };
      if (r.ok) I.HUD.saving('ok', reason === 'auto' ? 'Sauvegarde auto…' : 'Partie sauvegardée');
      else {
        I.HUD.saving('err', 'Sauvegarde impossible : ' + r.error);
        I.HUD.message('Sauvegarde impossible : ' + r.error, 'warn');
      }
      return r;
    },

    /** Vérifie les déblocages de recettes (utile à l'ouverture de l'écran, la simulation étant alors en pause). */
    refreshUnlocks: function () { I.Net.command({ t: 'unlock' }); },

    /** Demande de fabrication (la logique vit dans systems/crafting.js, exécutée par l'hôte en coop). */
    craft: function (id, c, n) {
      let made = 0, left = Math.max(1, Math.min(99, n | 0 || 1));
      const step = function () {
        I.Net.command({ t: 'craft', id: id, station: I.CraftingUI.station, c: c | 0 }, function (r) {
          if (r.ok) made++;
          if (r.ok && --left > 0) { step(); return; } // quantité demandée : une fabrication après l'autre (chacune est validée par l'hôte)
          I.CraftingUI.feedback(r, id, made);
          I.CraftingUI.render(true);
          if (made) app.saveNow('auto');
        });
      };
      step();
    },

    /** Fabrication à la Table du Forgeron (validée par l'hôte en coop : il vérifie la distance, les matériaux et la place dans le sac). */
    forge: function (id, model, slots, done) {
      I.Net.command({ t: 'forge', id: id, model: model, slots: slots }, function (r) {
        done(r);
        if (r.ok) app.saveNow('auto');
      });
    },

    /** Dépôt / retrait dans le coffre ou le four ouvert. */
    containerAction: function (kind, arg) {
      const o = I.ContainerUI.obj();
      if (!o) return;
      I.Net.command(kind === 'put' ? { t: 'put', id: o.id, i: arg } : { t: 'take', id: o.id, where: arg }, function (r) {
        I.ContainerUI.feedback(r);
        I.ContainerUI.render(true);
      });
    },

    quitToTitle: function () {
      this.saveNow('quit');
      I.Net.close();
      I.Menu.show('title');
    },

    eraseSave: function () {
      I.SaveManager.remove();
      this.lastSave = null;
      I.Menu.show(I.Menu.optionsFrom === 'pause' ? 'title' : I.Menu.optionsFrom);
      if (I.Menu.screen === 'title') I.Menu.refreshTitle();
    },
  };

  // ---------- affichage ----------
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    renderer.layout(window.innerWidth, window.innerHeight, app.settings.zoom, dpr);
    cam.resize(renderer.w, renderer.h);
    const u = Math.max(1.5, Math.min(4, Math.round(window.innerHeight / 360 * 2) / 2));
    document.documentElement.style.setProperty('--u', u + 'px');
  }

  // ---------- intentions ----------
  const MOVE = {
    left: ['KeyA', 'KeyQ', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'KeyZ', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  };
  function anyDown(codes) { for (const c of codes) if (input.isDown(c)) return true; return false; }

  function hotbarKey() {
    for (let i = 0; i < C.HOTBAR_SIZE; i++) if (input.pressed('Digit' + (i + 1)) || input.pressed('Numpad' + (i + 1))) return i;
    return null;
  }

  function readIntent() {
    const p = game.local;
    let hot = hotbarKey();
    if (hot === null && input.wheel !== 0) hot = (p.sel + (input.wheel > 0 ? 1 : -1) + C.HOTBAR_SIZE) % C.HOTBAR_SIZE;
    let interact = input.pressed('KeyE') && !!(p.target || I.HUD.dialogOpen); // E : interagir s'il y a une cible, sinon inventaire (voir update)
    if (interact && I.HUD.dialogOpen) { I.HUD.closeDialog(); interact = false; }
    const mouse = input.mouse;
    // visée : souris si elle a bougé récemment ou si un bouton est enfoncé ; J seul vise devant soi
    const mouseAim = mouse.left || mouse.right || mouse.leftEdge || mouse.rightEdge || (performance.now() - mouse.t < 2500);
    const aimPos = { x: cam.rx + mouse.x / renderer.scale, y: cam.ry + mouse.y / renderer.scale };
    const keyAim = input.isDown('KeyJ') && !mouse.left && !mouse.right;
    return {
      mx: (anyDown(MOVE.right) ? 1 : 0) - (anyDown(MOVE.left) ? 1 : 0),
      my: (anyDown(MOVE.down) ? 1 : 0) - (anyDown(MOVE.up) ? 1 : 0),
      dash: input.pressed('Space'),
      use: mouse.left || mouse.leftEdge || input.isDown('KeyJ'), // Edge : un clic très bref n'est pas perdu
      remove: mouse.right || mouse.rightEdge,
      aim: mouseAim && !keyAim ? aimPos : null,
      interact: interact,
      hotbar: hot,
      ab: input.pressed('KeyR') ? 1 : input.pressed('KeyF') ? 2 : input.pressed('KeyV') ? 3 : 0, // capacités de l'arme
    };
  }

  /** Fondu blanc plein écran (voyage, éveil du portail) : opacité cible et durée en ms. */
  /** Bord de l'écran qui rougit un instant quand le joueur local est touché. */
  function hurtFlash() {
    const el = document.getElementById('fx-hurt');
    if (!el) return;
    el.style.transition = 'none'; el.style.opacity = '0.9';
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = 'opacity 450ms ease-out'; el.style.opacity = '0'; }); });
  }
  function flash(op, ms) {
    const el = document.getElementById('fx-flash');
    if (!el) return;
    el.style.transition = 'opacity ' + ms + 'ms ease-in-out'; el.style.opacity = String(op);
  }

  function handleEvents(events) {
    const now = performance.now();
    for (const e of events) {
      fx.onEvent(e);
      I.HUD.onEvent(e, now);
      if (e.type === 'saveRequest' && e.pid === game.localId) app.saveNow('house');
      if (e.type === 'openCraft' && e.pid === game.localId) I.Menu.openCrafting(e.station);
      if (e.type === 'openContainer' && e.pid === game.localId) I.Menu.openContainer(e.id);
      if (e.type === 'openForge' && e.pid === game.localId) I.Menu.openForge(e.id);
      if (e.type === 'openEnchant' && e.pid === game.localId) I.Menu.openEnchant(e.mode);
      if (e.type === 'enchant') {
        (I.tableGlow = I.tableGlow || {})[e.oid] = { cols: (e.els.length ? e.els : []).map(function (k) { return I.ENCH.ELEM[k].rgb; }).concat(e.els.length ? [] : [[183, 156, 255]]), t0: performance.now() / 1000, dur: 20 };
        if (e.pid === game.localId) I.HUD.message(e.dis ? 'Enchantement défait : ' + e.name : 'Arme enchantée : ' + e.name, 'info');
      }
      if (e.type === 'openCook' && e.pid === game.localId) I.Menu.openCook(e.station);
      if (e.type === 'travelStart') { flash(1, 650); I.Music.combatUntil = 0; }
      if (e.type === 'travel') {
        const p = game.local, w = game.state.world; if (p) cam.snapTo(p.x, p.y - 8, w.W * C.TILE, w.H * C.TILE); flash(0, 1100);
        if (e.name) I.HUD.message(e.name, 'info');
      }
      if ((e.type === 'cHit' || e.type === 'cDie') && e.pid === game.localId) I.Music.combat();
      if (e.type === 'hurt' && e.pid === game.localId) { I.Music.combat(); hurtFlash(); }
      if (e.type === 'faint' && e.pid === game.localId) { flash(1, 100); setTimeout(function () { flash(0, 1200); }, 250); }
      if (e.type === 'flash') flash(1, 700);
      if (e.type === 'dimStart' && e.pid === game.localId) I.HUD.message('Le portail ultime s’éveille…', 'info');
      if (e.type === 'dimReady') flash(1, 100); // l'écran reste blanc jusqu'à l'arrivée (voir « travel »)
      if (e.type === 'sleep' && e.pid === game.localId) I.HUD.message('Tu as bien dormi. Un nouveau jour commence !', 'info');
    }
  }

  // ---------- boucle ----------
  function update(dt) {
    const menu = I.Menu;
    // touches de menu (valables partout)
    if (input.pressed('Escape')) menu.onEscape();
    else if (input.pressed('KeyE')) {
      const lp = game.local, busy = lp && (lp.target || I.HUD.dialogOpen); // cible proche : E interagit (readIntent)
      if (menu.screen === 'playing') { if (!busy) menu.show('inventory'); } else if (menu.screen === 'inventory') menu.show('playing');
    } else if (input.pressed('KeyC')) {
      if (menu.screen === 'playing') menu.openCrafting('hand'); else if (menu.screen === 'crafting') menu.show('playing');
    } else if (menu.screen === 'inventory') {
      const h = hotbarKey(); if (h !== null) I.InventoryUI.equip(h);
    }
    if (input.pressed('KeyM')) { if (menu.screen === 'playing') menu.show('map'); else if (menu.screen === 'map') menu.show('playing'); }
    if (menu.screen === 'map') I.BigMap.update(dt, input);
    if (input.pressed('KeyH') && menu.screen === 'playing') { app.settings.help = I.HUD.toggleHelp(); I.SaveManager.saveSettings(app.settings); }

    const net = I.Net, playing = menu.isPlaying();
    if (net.isGuest()) {
      if (game.local) { net.guestTick(dt, playing ? readIntent() : I.Game.NEUTRAL); fx.update(dt, game.state, cam); }
    } else if (playing || net.hosting()) { // l'hôte ne met jamais la partie en pause : les invités continuent de jouer
      const mine = playing ? readIntent() : I.Game.NEUTRAL;
      const intents = net.takeIntents(); intents[game.localId] = mine;
      game.step(intents, dt);
      const ev = game.takeEvents();
      handleEvents(ev); net.pushEvents(ev); net.hostTick(dt);
      fx.update(dt, game.state, cam);
      autoT += dt;
      if (autoT >= C.AUTOSAVE_SECONDS) { autoT = 0; if (app.settings.autosave) app.saveNow('auto'); }
    } else if (menu.screen === 'title') {
      fx.update(dt, game.state, cam);
    } else if (menu.screen === 'container') {
      game.tickMachines(dt); // le four continue de chauffer pendant qu'on le regarde
    }
    input.endFrame();
  }

  function render(dt) {
    const s = game.state;
    if (!s) return;
    const w = s.world;
    if (I.Menu.screen === 'title') {
      s.time.minutes += C.MINUTES_PER_SECOND * dt * 0.25;
      const t = performance.now() / 1000;
      cam.x = 600 + Math.cos(t * 0.045) * 300 - cam.w / 2;
      cam.y = 520 + Math.sin(t * 0.06) * 170 - cam.h / 2;
      cam.clamp(w.W * C.TILE, w.H * C.TILE);
    } else if (game.local) {
      const p = game.local;
      if (I.Menu.isPlaying()) cam.follow(p.x, p.y - 8, dt, w.W * C.TILE, w.H * C.TILE);
    }
    renderer.draw(s, cam, fx, dt);
    I.Music.update(dt);
    announceWeather(s);
    if (game.local) { I.HUD.update(dt); I.Minimap.update(dt); if (I.Menu.screen === 'inventory') I.InventoryUI.render(false); if (I.Menu.screen === 'crafting') I.CraftingUI.render(false); if (I.Menu.screen === 'container') I.ContainerUI.render(false); if (I.Menu.screen === 'forge') I.ForgeUI.render(false); if (I.Menu.screen === 'enchant') I.EnchantUI.render(false); if (I.Menu.screen === 'cook') I.CookUI.render(false); }
  }

  // annonce des changements de météo (avec hystérésis pour ne pas clignoter)
  let wxState = null;
  function announceWeather(s) {
    if (s.world.lobby || s.world.chunked || !game.local) { wxState = null; return; }
    const w = I.weather.at(s.time.minutes);
    const cur = w.rain > 0.3 ? (w.storm > 0.2 ? 'storm' : 'rain') : (wxState === 'rain' || wxState === 'storm') && w.rain > 0.04 ? wxState : w.fog > 0.55 ? 'fog' : w.cloud > 0.62 ? 'cloudy' : 'clear';
    if (wxState !== null && cur !== wxState) {
      const T = { storm: 'Un orage éclate ! Les cultures poussent plus vite.', rain: 'Il se met à pleuvoir : les cultures poussent plus vite !', fog: 'Une épaisse brume se lève.', cloudy: 'Le ciel se couvre.', clear: 'Le ciel se dégage.' };
      I.HUD.message(T[cur], 'info');
    }
    wxState = cur;
  }

  // ---------- démarrage ----------
  function boot() {
    try {
      renderer = new I.Renderer(canvas);
    } catch (e) {
      document.getElementById('app').innerHTML = '<div class="screen"><div class="panel box"><h2>Erreur</h2><p>Impossible d’initialiser l’affichage : ' + e.message + '</p></div></div>';
      throw e;
    }
    renderer.localId = game.localId;
    renderer.setShader(app.settings.shader);
    layout();
    window.addEventListener('resize', layout);
    I.HUD.init(game, renderer.S);
    I.Minimap.init(game, renderer.S, app); I.BigMap.init(game, renderer.S, app);
    I.InventoryUI.init(game, renderer.S);
    I.CraftingUI.init(game, renderer.S, app);
    I.ContainerUI.init(game, renderer.S, app);
    I.ForgeUI.init(game, renderer.S, app);
    I.EnchantUI.init(game, renderer.S, app);
    I.CookUI.init(game, renderer.S, app);
    I.Net.game = game; I.Net.avatar = app.settings.avatar;
    I.Net.hooks = {
      events: function (ev) { handleEvents(ev); },
      welcome: function () { app.startPlaying(); },
      joined: function () { I.HUD.message('Un joueur a rejoint la partie.', 'info'); },
      left: function () { I.HUD.message('Un joueur a quitté la partie.', 'info'); },
      closed: function (why) { I.Menu.show('title'); const n = document.getElementById('title-note'); n.textContent = why; n.className = 'note warn'; },
    };
    I.Menu.init(app);
    I.Music.init(game, I.Menu, app.settings.music);
    game.demo();
    I.Menu.show('title');

    window.addEventListener('blur', function () { if (I.Menu.isPlaying() && !I.Net.hosting()) I.Menu.show('pause'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && I.Menu.isPlaying()) { app.saveNow('hidden'); if (!I.Net.hosting()) I.Menu.show('pause'); } });
    window.addEventListener('pagehide', function () { if (game.local && I.Menu.screen !== 'title' && !I.Net.isGuest()) I.SaveManager.save(game.snapshot()); });

    new I.Loop(update, render).start();
  }

  I.debug = { game: game, cam: cam, fx: fx, input: input, app: app, get renderer() { return renderer; } };
  boot();
})((window.Iles = window.Iles || {}));
