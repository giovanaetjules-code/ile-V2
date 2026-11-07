/*
 * Écrans : titre, pause, inventaire, options, confirmation.
 * Menu.screen vaut 'title' | 'playing' | 'pause' | 'inventory' | 'options' | 'confirm'.
 * La simulation ne tourne que si screen === 'playing'.
 */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const IDS = { title: 'screen-title', pause: 'screen-pause', inventory: 'screen-inventory', crafting: 'screen-crafting', container: 'screen-container', forge: 'screen-forge', enchant: 'screen-enchant', cook: 'screen-cook', map: 'screen-map', coop: 'screen-coop', avatar: 'screen-avatar', options: 'screen-options', confirm: 'screen-confirm' };

  const Menu = {
    screen: 'title',
    optionsFrom: 'title',
    confirmFrom: 'title',
    confirmYes: null,

    init: function (app) {
      this.app = app;
      const on = function (id, fn) { $(id).addEventListener('click', fn); };
      on('btn-continue', function () { app.continueGame(); });
      on('btn-new', function () { app.requestNewGame(); });
      on('btn-options', function () { Menu.openOptions('title'); });
      on('btn-resume', function () { Menu.show('playing'); });
      on('btn-save', function () { app.saveNow('manual'); Menu.refreshPauseNote(); });
      on('btn-pause-options', function () { Menu.openOptions('pause'); });
      on('btn-quit', function () { app.quitToTitle(); });
      on('btn-inv-close', function () { Menu.show('playing'); });
      on('btn-craft-close', function () { Menu.show('playing'); });
      on('btn-cont-close', function () { Menu.show('playing'); });
      on('btn-forge-close', function () { Menu.show('playing'); });
      on('btn-ench-close', function () { Menu.show('playing'); });
      on('btn-cook-close', function () { Menu.show('playing'); });
      on('btn-coop', function () { Menu.openCoop('host', 'pause'); });
      on('btn-join', function () { Menu.openCoop('join', 'title'); });
      on('btn-coop-close', function () { I.Net.cancelJoin(); Menu.show(Menu.coopFrom); });
      I.CoopUI.init(app);
      on('btn-avatar', function () { Menu.show('avatar'); });
      I.AvatarUI.init(app);
      on('btn-options-close', function () { Menu.show(Menu.optionsFrom); });
      on('btn-erase', function () {
        Menu.confirm('Effacer la sauvegarde ?', 'Ta progression sera définitivement perdue. Cette action est irréversible.', function () {
          app.eraseSave();
        }, 'options');
      });
      on('btn-confirm-no', function () { Menu.show(Menu.confirmFrom); });
      on('btn-confirm-yes', function () { const f = Menu.confirmYes; Menu.show(Menu.confirmFrom); if (f) f(); });

      const zoom = $('opt-zoom'), auto = $('opt-autosave'), help = $('opt-help'), shader = $('opt-shader'), music = $('opt-music');
      music.addEventListener('input', function () { app.settings.music = +music.value / 100; app.applySettings(); });
      shader.addEventListener('change', function () { app.settings.shader = shader.value; app.applySettings(); });
      zoom.addEventListener('change', function () { app.settings.zoom = +zoom.value; app.applySettings(); });
      auto.addEventListener('change', function () { app.settings.autosave = auto.checked; app.applySettings(); });
      help.addEventListener('change', function () { app.settings.help = help.checked; app.applySettings(); });
    },

    show: function (name) {
      this.screen = name;
      for (const k in IDS) $(IDS[k]).classList.toggle('hidden', k !== name);
      I.HUD.show(name !== 'title' && this.app.hasPlayer());
      if (name === 'title') this.refreshTitle();
      if (name === 'pause') this.refreshPauseNote();
      if (name === 'inventory') I.InventoryUI.open();
      if (name === 'crafting') I.CraftingUI.open(this.craftStation);
      if (name === 'map') I.BigMap.open();
      if (name === 'container') I.ContainerUI.open(this.containerId);
      if (name === 'forge') I.ForgeUI.open(this.forgeId);
      if (name === 'enchant') I.EnchantUI.open(this.enchantMode);
      if (name === 'cook') I.CookUI.open(this.cookStation);
      if (name === 'options') this.syncOptions();
      if (name === 'coop') I.CoopUI.open(this.coopMode);
      if (name === 'avatar') I.AvatarUI.open();
      this.app.onScreenChange(name);
    },

    isPlaying: function () { return this.screen === 'playing'; },

    openCook: function (station) { this.cookStation = station; this.show('cook'); },

    openForge: function (id) { this.forgeId = id; this.show('forge'); },

    openEnchant: function (mode) { this.enchantMode = mode; this.show('enchant'); },

    openContainer: function (id) { this.containerId = id; this.show('container'); },

    openCrafting: function (station) { this.app.refreshUnlocks(); this.craftStation = station; this.show('crafting'); },

    openCoop: function (mode, from) { this.coopFrom = from; this.coopMode = mode; this.show('coop'); },

    openOptions: function (from) { this.optionsFrom = from; this.show('options'); },

    confirm: function (title, text, yes, from) {
      this.confirmFrom = from || this.screen; this.confirmYes = yes;
      $('confirm-title').textContent = title; $('confirm-text').textContent = text;
      this.show('confirm');
    },

    syncOptions: function () {
      const s = this.app.settings;
      $('opt-zoom').value = String(s.zoom); $('opt-autosave').checked = s.autosave; $('opt-help').checked = s.help; $('opt-shader').value = s.shader; $('opt-music').value = String(Math.round(s.music * 100));
    },

    refreshTitle: function () {
      const info = I.SaveManager.peek(), btn = $('btn-continue'), note = $('title-note');
      if (!I.SaveManager.available()) {
        btn.disabled = true; btn.textContent = 'Continuer';
        note.textContent = 'Le stockage du navigateur est bloqué : impossible de sauvegarder (navigation privée ?).';
        note.className = 'note err';
      } else if (info.ok) {
        btn.disabled = false;
        btn.innerHTML = 'Continuer<small>Jour ' + info.day + ' · ' + info.clock + (info.savedAt ? ' · ' + new Date(info.savedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</small>';
        note.textContent = info.usedBackup ? 'La sauvegarde principale était illisible : une copie de secours sera chargée.' : '';
        note.className = 'note' + (info.usedBackup ? ' warn' : '');
      } else {
        btn.disabled = true; btn.textContent = 'Continuer';
        note.textContent = info.empty ? '' : 'Erreur de lecture : ' + info.error;
        note.className = 'note' + (info.empty ? '' : ' err');
      }
    },

    refreshPauseNote: function () {
      const n = $('pause-note'), r = this.app.lastSave;
      if (!r) { n.textContent = ''; n.className = 'note'; return; }
      n.textContent = r.ok ? 'Dernière sauvegarde : ' + new Date(r.at).toLocaleTimeString('fr-FR') : 'Sauvegarde impossible : ' + r.error;
      n.className = 'note' + (r.ok ? '' : ' err');
    },

    /** Touche Échap : remonte d'un cran dans les menus. */
    onEscape: function () {
      switch (this.screen) {
        case 'playing': if (I.HUD.dialogOpen) I.HUD.closeDialog(); else this.show('pause'); break;
        case 'pause': case 'inventory': case 'crafting': case 'container': case 'forge': case 'enchant': case 'cook': case 'map': this.show('playing'); break;
        case 'coop': this.show(this.coopFrom); break;
        case 'options': this.show(this.optionsFrom); break;
        case 'avatar': this.show('options'); break;
        case 'confirm': this.show(this.confirmFrom); break;
      }
    },
  };
  I.Menu = Menu;
})((window.Iles = window.Iles || {}));
