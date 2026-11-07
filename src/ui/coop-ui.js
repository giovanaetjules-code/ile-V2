/* Écran de coop : code court (5 caractères) via PeerJS ; en secours, échange manuel de longs codes (replié). La logique réseau est dans net/net.js. */
(function (I) {
  const $ = function (id) { return document.getElementById(id); };
  const CoopUI = {
    inv: null,
    init: function (app) {
      this.app = app;
      const copy = function (id, btn) {
        const t = $(id); t.select();
        try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); }
        $(btn).textContent = 'Copié !'; setTimeout(function () { $(btn).textContent = 'Copier le code'; }, 1200);
      };
      $('coop-copy-offer').addEventListener('click', function () { copy('coop-offer', 'coop-copy-offer'); });
      $('coop-copy-answer').addEventListener('click', function () { copy('coop-answer-out', 'coop-copy-answer'); });
      $('coop-copy-code').addEventListener('click', function () {
        try { navigator.clipboard.writeText($('coop-code').textContent); } catch (e) { /* sélection manuelle possible : le code est sélectionnable */ }
        $('coop-copy-code').textContent = 'Copié !'; setTimeout(function () { $('coop-copy-code').textContent = 'Copier le code'; }, 1200);
      });
      $('coop-room-btn').addEventListener('click', () => this.joinRoom());
      $('coop-code-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.joinRoom(); });
      $('coop-code-in').addEventListener('keyup', (e) => e.stopPropagation());
      $('coop-gen').addEventListener('click', () => this.gen());
      $('coop-accept').addEventListener('click', () => this.accept());
      $('coop-join-btn').addEventListener('click', () => this.join());
      I.Net.onChange = () => this.status();
    },
    open: function (mode) {
      this.mode = mode;
      $('coop-host').classList.toggle('hidden', mode !== 'host');
      $('coop-join').classList.toggle('hidden', mode !== 'join');
      $('coop-title').textContent = mode === 'host' ? 'Coop : inviter un joueur' : 'Rejoindre une partie';
      if (mode === 'host') this.openRoom(); else { $('coop-code-in').value = ''; $('coop-room-btn').disabled = false; setTimeout(function () { $('coop-code-in').focus(); }, 50); }
      this.status();
    },
    openRoom: async function () {
      const el = $('coop-code');
      if (I.Net.room) { el.textContent = I.Net.room.code; return; }
      el.textContent = '…'; this.say('Création du code…');
      try { el.textContent = await I.Net.hostRoom(this.app.game); this.status(); }
      catch (e) { el.textContent = '—'; this.say(e.message, true); }
    },
    joinRoom: async function () {
      $('coop-room-btn').disabled = true; this.say('Connexion à l’hôte…');
      try { await I.Net.joinRoom(this.app.game, $('coop-code-in').value); this.say('Connecté : la partie démarre…'); }
      catch (e) { this.say(e.message, true); }
      $('coop-room-btn').disabled = false;
    },
    say: function (t, err) { const n = $('coop-status'); n.textContent = t; n.className = 'note' + (err ? ' err' : ''); },
    status: function () {
      const n = I.Net.connected().length;
      if (this.mode !== 'host') return;
      const r = I.Net.room;
      if (r && !r.broker) this.say('Service de mise en relation coupé : les joueurs déjà connectés restent en jeu, mais personne de nouveau ne peut entrer pour l’instant.', true);
      else if (n) this.say('Connectés : ' + n + ' invité(s). Tu peux fermer cet écran et jouer.');
      else if (r) this.say('En attente d’un joueur… (le code reste valable tant que la partie est ouverte)');
    },
    gen: async function () {
      this.say('Création du code… (quelques secondes)');
      $('coop-offer').value = ''; $('coop-answer').value = '';
      try {
        if (this.inv) this.inv.cancel();
        this.inv = await I.Net.invite(this.app.game);
        $('coop-offer').value = this.inv.code; $('coop-answer').value = '';
        this.say('Envoie ce code à l’invité, puis colle sa réponse ci-dessous.');
      } catch (e) { this.say(e.message, true); }
    },
    accept: async function () {
      if (!this.inv) { this.say('Crée d’abord un code d’invitation.', true); return; }
      try { await this.inv.accept($('coop-answer').value); this.say('Connexion en cours…'); this.inv = null; } catch (e) { this.say(e.message, true); }
    },
    join: async function () {
      this.say('Création du code de réponse… (quelques secondes)');
      $('coop-answer-out').value = '';
      try {
        const code = await I.Net.join(this.app.game, $('coop-offer-in').value);
        $('coop-answer-out').value = code;
        this.say('Envoie ce code à l’hôte, puis attends : la partie démarre toute seule.');
      } catch (e) { this.say(e.message, true); }
    },
  };
  I.CoopUI = CoopUI;
})((window.Iles = window.Iles || {}));
