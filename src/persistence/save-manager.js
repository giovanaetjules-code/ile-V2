/*
 * Sauvegardes locales (localStorage). Format : JSON versionné.
 *  - écriture en deux temps : l'ancienne sauvegarde devient « .bak » avant d'être remplacée ;
 *  - si la sauvegarde principale est illisible, on retombe sur la copie de secours ;
 *  - toutes les erreurs sont renvoyées sous forme de message lisible, jamais avalées.
 * Une sauvegarde locale n'est ni partagée entre appareils, ni entre joueurs.
 */
(function (I) {
  const C = I.config;
  const BAK = C.SAVE_KEY + ':bak';

  // migrations[v] transforme une sauvegarde de version v en version v+1.
  const migrations = {};

  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function explain(e) {
    const n = e && (e.name || '');
    if (n === 'QuotaExceededError' || (e && e.code === 22)) return 'espace de stockage du navigateur plein';
    if (n === 'SecurityError') return 'le navigateur bloque le stockage (navigation privée ou cookies désactivés ?)';
    return (e && e.message) || 'erreur inconnue';
  }

  function validate(data) {
    if (!data || typeof data !== 'object') throw new Error('contenu invalide');
    if (!isFinite(data.version)) throw new Error('version manquante');
    if (data.version > C.SAVE_VERSION) throw new Error('créée par une version plus récente du jeu');
    while (data.version < C.SAVE_VERSION) {
      const m = migrations[data.version];
      if (!m) throw new Error('version ' + data.version + ' non prise en charge');
      data = m(data); data.version = data.version + 1;
    }
    if (!isFinite(data.seed) || !data.players || typeof data.players !== 'object' || !data.time) throw new Error('données incomplètes');
    return data;
  }

  function read(key) {
    const st = storage();
    if (!st) throw new Error('stockage indisponible');
    const raw = st.getItem(key);
    if (raw === null) return null;
    return validate(JSON.parse(raw));
  }

  I.SaveManager = {
    available: function () { return !!storage(); },

    /** @returns {{ok:boolean, error?:string, bytes?:number}} */
    save: function (snapshot) {
      const st = storage();
      if (!st) return { ok: false, error: 'stockage indisponible dans ce navigateur' };
      let json;
      try { json = JSON.stringify(snapshot); } catch (e) { return { ok: false, error: explain(e) }; }
      let previous = null;
      try {
        previous = st.getItem(C.SAVE_KEY);
        if (previous) st.setItem(BAK, previous);
      } catch (e) { previous = null; /* la copie de secours est un bonus : on continue */ }
      try {
        st.setItem(C.SAVE_KEY, json);
        if (st.getItem(C.SAVE_KEY) !== json) throw new Error('écriture non confirmée');
        return { ok: true, bytes: json.length };
      } catch (e) {
        try { if (previous) st.setItem(C.SAVE_KEY, previous); } catch (e2) { /* rien de plus à faire */ }
        return { ok: false, error: explain(e) };
      }
    },

    /** @returns {{ok:boolean, data?:object, error?:string, usedBackup?:boolean, empty?:boolean}} */
    load: function () {
      let err = null;
      try {
        const d = read(C.SAVE_KEY);
        if (d) return { ok: true, data: d };
        const b = read(BAK);
        return b ? { ok: true, data: b, usedBackup: true } : { ok: false, empty: true, error: 'aucune sauvegarde' };
      } catch (e) { err = explain(e); }
      try {
        const b = read(BAK);
        if (b) return { ok: true, data: b, usedBackup: true };
      } catch (e2) { /* on renvoie l'erreur d'origine */ }
      return { ok: false, error: 'sauvegarde illisible (' + err + ')' };
    },

    /** Résumé léger pour le bouton « Continuer ». */
    peek: function () {
      const r = this.load();
      if (!r.ok) return r;
      const d = r.data;
      return { ok: true, day: I.timeutil.day(d.time.minutes), clock: I.timeutil.clock(d.time.minutes), savedAt: d.savedAt, usedBackup: !!r.usedBackup };
    },

    remove: function () {
      const st = storage();
      if (!st) return false;
      try { st.removeItem(C.SAVE_KEY); st.removeItem(BAK); return true; } catch (e) { return false; }
    },

    loadSettings: function () {
      const def = { zoom: 0, autosave: true, help: true, map: true, shader: 'high', music: 0.7, avatar: I.avatar.def() };
      const st = storage();
      if (!st) return def;
      try {
        const s = JSON.parse(st.getItem(C.SETTINGS_KEY) || '{}');
        return {
          zoom: [0, 2, 3, 4, 5, 6].includes(s.zoom) ? s.zoom : def.zoom,
          autosave: s.autosave !== false,
          help: s.help !== false,
          map: s.map !== false,
          shader: ['off', 'low', 'high'].includes(s.shader) ? s.shader : def.shader,
          music: typeof s.music === 'number' && s.music >= 0 && s.music <= 1 ? s.music : def.music,
          avatar: I.avatar.sanitize(s.avatar),
        };
      } catch (e) { return def; }
    },

    saveSettings: function (s) {
      const st = storage();
      if (!st) return false;
      try { st.setItem(C.SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
    },
  };
})((window.Iles = window.Iles || {}));
