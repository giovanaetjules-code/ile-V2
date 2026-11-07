/*
 * Coop locale : WebRTC pair à pair, sans serveur (compatible GitHub Pages).
 * L'hôte fait tourner Game.step pour tout le monde ; l'invité n'envoie que ses intentions et ses commandes,
 * et reçoit l'état (joueurs, objets au sol, différences du monde, événements).
 * Mise en relation : (1) par CODE COURT (5 caractères) via le service gratuit PeerJS, qui ne sert qu'à présenter les deux navigateurs ;
 * (2) en secours, sans internet : échange à la main de deux longs codes (invitation -> réponse). Ensuite tout passe par un DataChannel pair à pair.
 */
(function (I) {
  const C = I.config;
  const MAX_GUESTS = 3, STATE_DT = 1 / 20, WORLD_DT = 0.25, TIMEOUT = 10000;
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  const r1 = function (v) { return Math.round(v * 10) / 10; };

  // ---------- codes d'invitation / de réponse ----------
  async function pack(obj) {
    let bytes = new TextEncoder().encode(JSON.stringify(obj)), z = false;
    if (window.CompressionStream) {
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      z = true;
    }
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return 'IL1' + (z ? 'z' : 'r') + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function unpack(code) {
    code = String(code || '').replace(/\s+/g, '');
    if (!/^IL1[zr][A-Za-z0-9_-]+$/.test(code)) throw new Error('Code invalide : copie-le en entier.');
    let b64 = code.slice(4).replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - b64.length % 4) % 4);
    let bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    if (code[3] === 'z') {
      if (!window.DecompressionStream) throw new Error('Ce navigateur est trop ancien pour la coop.');
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!o || typeof o.sdp !== 'string' || (o.t !== 'o' && o.t !== 'a')) throw new Error('Code invalide.');
    return o;
  }
  function gathered(pc) {
    return new Promise(function (res) {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(done, 3000);
      function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res(); }
      function ch() { if (pc.iceGatheringState === 'complete') done(); }
      pc.addEventListener('icegatheringstatechange', ch);
    });
  }
  // ---------- code court (PeerJS) ----------
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PREFIX = 'iles-', CODE_LEN = 5; // pas de 0/O/1/I/L : aucune confusion à la lecture
  function newCode() { const a = new Uint32Array(CODE_LEN); crypto.getRandomValues(a); let s = ''; for (const v of a) s += ALPHA[v % ALPHA.length]; return s; }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function peerMsg(err) {
    switch (err && err.type) {
      case 'peer-unavailable': return 'Aucune partie avec ce code : vérifie-le, et l’hôte doit avoir ouvert « Coop ».';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed': case 'disconnected':
        return 'Service de mise en relation injoignable (internet ? pare-feu ?). Essaie la connexion manuelle.';
      case 'webrtc': return 'Connexion directe impossible (réseau bloqué). Essaie le même wifi ou la connexion manuelle.';
      case 'browser-incompatible': return 'Ce navigateur ne gère pas la coop.';
      default: return 'Coop impossible : ' + ((err && (err.message || err.type)) || 'erreur inconnue');
    }
  }
  /** Fait ressembler une connexion PeerJS à un DataChannel (readyState, bufferedAmount, send, close, onmessage, onclose). */
  function wrapConn(conn) {
    const w = {
      onmessage: null, onclose: null,
      get readyState() { return conn.open ? 'open' : 'closed'; },
      get bufferedAmount() { try { return conn.dataChannel ? conn.dataChannel.bufferedAmount : 0; } catch (e) { return 0; } },
      send: function (d) { conn.send(d); },
      close: function () { try { conn.close(); } catch (e) { /* déjà fermé */ } },
    };
    conn.on('data', function (d) { if (w.onmessage) w.onmessage({ data: typeof d === 'string' ? d : new TextDecoder().decode(d) }); });
    let gone = false; const bye = function () { if (!gone) { gone = true; if (w.onclose) w.onclose(); } };
    conn.on('close', bye); conn.on('error', bye);
    return w;
  }
  const fakePc = function (conn) { return { connectionState: 'connected', close: function () { try { conn.close(); } catch (e) { /* déjà fermé */ } } }; };

  function send(dc, obj) {
    try { if (dc && dc.readyState === 'open' && dc.bufferedAmount < 1e6) dc.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { /* canal fermé */ }
  }
  function sanitize(it) {
    const n = function (v) { return isFinite(v) ? Math.max(-1, Math.min(1, +v)) : 0; };
    const aim = it && it.aim && isFinite(it.aim.x) && isFinite(it.aim.y) ? { x: +it.aim.x, y: +it.aim.y } : null;
    const h = it && Number.isInteger(it.hotbar) && it.hotbar >= 0 && it.hotbar < C.HOTBAR_SIZE ? it.hotbar : null;
    return it ? { mx: n(it.mx), my: n(it.my), dash: !!it.dash, use: !!it.use, remove: !!it.remove, aim: aim, interact: !!it.interact, hotbar: h, ab: Number.isInteger(it.ab) && it.ab >= 1 && it.ab <= 3 ? it.ab : 0 } : null;
  }

  const Net = {
    role: 'solo', // 'solo' | 'host' | 'guest'
    guests: [], pending: [],
    events: [], hooks: {}, onChange: null,
    game: null, key: null,
    avatar: null, room: null, peerOptions: {}, _joining: null, _peer: null, // room : partie ouverte par code court { code, peer, broker }
    _acc: 0, _wacc: 0, _lastWorld: '', _rid: 0, _cb: {}, _host: null,

    hosting: function () { return this.role === 'host'; },
    isGuest: function () { return this.role === 'guest'; },
    active: function () { return this.role !== 'solo'; },
    connected: function () { return this.guests.filter(function (g) { return g.ready; }); },
    changed: function (msg) { if (this.onChange) this.onChange(msg); },

    guestKey: function () {
      if (this.key) return this.key;
      let k = null;
      try { k = localStorage.getItem('iles:guestkey'); } catch (e) { /* stockage bloqué */ }
      if (!k) { k = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); try { localStorage.setItem('iles:guestkey', k); } catch (e) { /* ignoré */ } }
      return (this.key = k);
    },

    // ---------- hôte ----------
    /** Crée une invitation : { code, accept(codeReponse), cancel() }. */
    invite: async function (game) {
      if (this.role === 'guest') throw new Error('Tu es invité dans une autre partie.');
      if (this.guests.length + this.pending.length >= MAX_GUESTS) throw new Error('Partie pleine (4 joueurs maximum).');
      this.game = game; this.role = 'host';
      const pc = new RTCPeerConnection(ICE), dc = pc.createDataChannel('g');
      const g = { pc: pc, dc: dc, pid: null, key: null, it: null, edge: {}, invRev: -1, ready: false, last: performance.now() };
      this.pending.push(g);
      dc.onmessage = (e) => this._hostMsg(g, e.data);
      dc.onclose = () => this._drop(g);
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._drop(g); };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const code = await pack({ t: 'o', sdp: pc.localDescription.sdp });
      return {
        code: code,
        accept: async (ans) => {
          const o = await unpack(ans);
          if (o.t !== 'a') throw new Error('Ce n’est pas un code de réponse.');
          await pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
        },
        cancel: () => this._drop(g),
      };
    },

    // ---------- code court : hôte ----------
    /** Ouvre la partie aux invités et renvoie son code court (5 caractères). Le code reste valable tant que la partie est ouverte. */
    hostRoom: function (game) {
      if (this.role === 'guest') return Promise.reject(new Error('Tu es invité dans une autre partie.'));
      if (this.room) return Promise.resolve(this.room.code);
      if (!window.Peer) return Promise.reject(new Error('Le module de coop n’est pas chargé.'));
      this.game = game;
      return new Promise((resolve, reject) => {
        let tries = 0;
        const attempt = () => {
          const code = newCode(); let opened = false, peer;
          try { peer = new window.Peer(PREFIX + code, Object.assign({ debug: 0 }, this.peerOptions)); } catch (e) { reject(new Error(peerMsg(e))); return; }
          peer.on('open', () => {
            if (opened) { if (this.room && this.room.peer === peer) { this.room.broker = true; this.changed(); } return; } // retour du service après une coupure
            opened = true; this.room = { code: code, peer: peer, broker: true }; this.role = 'host'; this._wireRoom(peer); this.changed(); resolve(code);
          });
          peer.on('error', (err) => {
            if (!opened) { try { peer.destroy(); } catch (e) { /* ok */ } if (err.type === 'unavailable-id' && ++tries < 6) attempt(); else reject(new Error(peerMsg(err))); }
            else if (this.room && this.room.peer === peer && err.type !== 'peer-unavailable') { this.room.broker = false; this.changed(); }
          });
          peer.on('disconnected', () => { // le service est coupé : les invités déjà connectés continuent, on retente
            if (!this.room || this.room.peer !== peer) return;
            this.room.broker = false; this.changed();
            setTimeout(() => { if (this.room && this.room.peer === peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* retenté plus tard */ } } }, 3000);
          });
        };
        attempt();
      });
    },

    _wireRoom: function (peer) {
      peer.on('connection', (conn) => {
        if (this.guests.length + this.pending.length >= MAX_GUESTS) {
          conn.on('open', function () { try { conn.send(JSON.stringify({ t: 'bye', why: 'Partie pleine (4 joueurs maximum).' })); } catch (e) { /* ok */ } setTimeout(function () { try { conn.close(); } catch (e) { /* ok */ } }, 400); });
          return;
        }
        const g = { pc: fakePc(conn), dc: wrapConn(conn), pid: null, key: null, it: null, edge: {}, invRev: -1, ready: false, last: performance.now() };
        this.pending.push(g);
        g.dc.onmessage = (e) => this._hostMsg(g, e.data);
        g.dc.onclose = () => this._drop(g);
        setTimeout(() => { if (!g.ready && this.pending.indexOf(g) >= 0) this._drop(g); }, 15000); // un inconnu qui ne se présente pas est abandonné
      });
    },

    // ---------- code court : invité ----------
    /** Rejoint la partie dont on tape le code. Résolu quand la liaison est établie (la partie démarre ensuite d'elle-même : hooks.welcome). */
    joinRoom: function (game, raw) {
      if (this.role !== 'solo') return Promise.reject(new Error('Déjà en coop.'));
      const code = cleanCode(raw);
      if (code.length !== CODE_LEN) return Promise.reject(new Error('Le code fait ' + CODE_LEN + ' caractères (lettres et chiffres).'));
      if (!window.Peer) return Promise.reject(new Error('Le module de coop n’est pas chargé.'));
      this.game = game;
      return new Promise((resolve, reject) => {
        let done = false, peer;
        const fail = (msg) => {
          if (done) return; done = true; clearTimeout(to);
          if (this._joining === peer) this._joining = null;
          try { peer.destroy(); } catch (e) { /* ok */ }
          reject(new Error(msg));
        };
        const to = setTimeout(() => fail('Pas de réponse de l’hôte (code faux, hôte hors ligne ou réseau bloqué).'), 20000);
        try { peer = new window.Peer(Object.assign({ debug: 0 }, this.peerOptions)); } catch (e) { fail(peerMsg(e)); return; }
        this._joining = peer;
        peer.on('error', (err) => fail(peerMsg(err)));
        peer.on('open', () => {
          if (done) return;
          const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
          conn.on('error', (err) => fail(peerMsg(err)));
          conn.on('open', () => {
            if (done) { try { conn.close(); } catch (e) { /* ok */ } return; }
            done = true; clearTimeout(to);
            const me = { pc: fakePc(conn), dc: wrapConn(conn), last: performance.now(), welcomed: false };
            this._host = me; this._peer = peer; this._joining = null; this.role = 'guest';
            const hello = () => { if (!me.welcomed) send(me.dc, { t: 'hello', key: this.guestKey(), v: 1, av: this.avatar ? I.avatar.pack(this.avatar) : null }); };
            me.dc.onmessage = (ev) => this._guestMsg(me, ev.data);
            me.dc.onclose = () => this._lost('La connexion avec l’hôte est terminée.');
            hello();
            let tries = 0; const iv = setInterval(() => { if (me.welcomed || ++tries > 8 || this._host !== me) clearInterval(iv); else hello(); }, 1000);
            resolve();
          });
        });
      });
    },

    _drop: function (g) {
      const wasReady = g.ready;
      g.ready = false;
      this.pending = this.pending.filter(function (x) { return x !== g; });
      this.guests = this.guests.filter(function (x) { return x !== g; });
      try { g.dc.close(); g.pc.close(); } catch (e) { /* déjà fermé */ }
      if (this.role === 'host' && g.pid && this.game && this.game.state) {
        const p = this.game.state.players[g.pid];
        if (p) { p.away = true; p.swing = null; }
      }
      if (this.role === 'host' && !this.guests.length && !this.pending.length && !this.room) this.role = 'solo';
      if (wasReady && this.hooks.left) this.hooks.left(g.pid);
      this.changed();
    },

    _hostMsg: function (g, raw) {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      g.last = performance.now();
      const game = this.game, s = game.state;
      if (m.t === 'hello' && !g.ready) {
        const key = String(m.key || '').slice(0, 40);
        if (!key || this.guests.some(function (x) { return x.key === key; })) { send(g.dc, { t: 'bye', why: 'Tu es déjà connecté à cette partie.' }); return; }
        let pid = null;
        for (const id in s.players) if (id !== game.localId && s.players[id].stats && s.players[id].stats.key === key) pid = id;
        if (!pid) {
          let n = 2; while (s.players['p' + n]) n++;
          pid = 'p' + n;
          const np = I.Player.create(pid, s.world.spawn.x, s.world.spawn.y);
          I.Player.giveStarterKit(np); np.stats.key = key; s.players[pid] = np;
        }
        const p = s.players[pid];
        p.away = false;
        if (m.av) p.av = I.avatar.sanitize(m.av); // chacun garde son propre avatar
        if (I.collision.isBlocked(s.world, p)) { p.x = s.world.spawn.x; p.y = s.world.spawn.y; }
        g.pid = pid; g.key = key; g.ready = true;
        this.pending = this.pending.filter(function (x) { return x !== g; });
        this.guests.push(g);
        send(g.dc, { t: 'welcome', pid: pid, snap: Object.assign(game.snapshot(), { localId: pid }) });
        if (this.hooks.joined) this.hooks.joined(pid);
        this.changed();
      } else if (g.ready && m.t === 'in') {
        const it = sanitize(m.it); if (!it) return;
        g.it = it;
        for (const k of ['dash', 'interact', 'use', 'remove']) if (it[k]) g.edge[k] = true;
        if (it.ab >= 1 && it.ab <= 3) g.edge.ab = it.ab | 0;
        if (it.hotbar !== null) g.edge.hotbar = it.hotbar;
        if (it.cs) g.edge.cs = it.cs;
      } else if (g.ready && m.t === 'cmd') {
        const ev = [], r = I.commands.run(s, g.pid, m.cmd, ev);
        if (ev.length) { this.events.push.apply(this.events, ev); if (this.hooks.events) this.hooks.events(ev); }
        this._flushWorld(true); this._sendState(g, true);
        send(g.dc, { t: 'res', rid: m.rid, r: r });
      }
    },

    /** Intentions des invités pour ce pas de simulation (les « appuis » ne sont consommés qu'une fois). */
    takeIntents: function () {
      const out = {};
      for (const g of this.guests) {
        if (!g.ready) continue;
        const it = Object.assign({}, g.it || I.Game.NEUTRAL);
        for (const k of ['dash', 'interact', 'use', 'remove']) if (g.edge[k]) it[k] = true;
        it.ab = g.edge.ab || 0;
        if (g.edge.hotbar !== undefined) it.hotbar = g.edge.hotbar;
        if (g.edge.cs) it.cs = g.edge.cs;
        g.edge = {};
        out[g.pid] = it;
      }
      return out;
    },

    pushEvents: function (ev) { if (this.hosting() && ev.length) this.events.push.apply(this.events, ev); },

    _flushWorld: function (force) {
      const s = this.game.state, w = s.world.serialize(); delete w.drops;
      const j = JSON.stringify({ t: 'w', d: s.dim, w: w, pr: s.progress });
      if (!force && j === this._lastWorld) return;
      this._lastWorld = j;
      for (const g of this.guests) send(g.dc, j);
    },

    _sendState: function (g, force) {
      const s = this.game.state, players = {}, me = s.players[g.pid];
      if (!me) return;
      for (const id in s.players) {
        const p = s.players[id], h = p.inv.slots[p.sel];
        players[id] = { x: r1(p.x), y: r1(p.y), dir: p.dir, moving: p.moving, frame: p.frame, dashT: p.dashT, swing: p.swing, sel: p.sel, h: h ? h.id : null, away: !!p.away, sw: Math.round(p.sw * 20) / 20, av: I.avatar.pack(p.av), ar: p.armor ? I.ARMOR.SLOTS.map(function (k) { return p.armor[k] || 0; }) : 0 };
      }
      const msg = {
        t: 's', m: s.time.minutes, d: s.dim, a: s.act ? [s.act.t, s.act.dur, s.act.tint] : 0, players: players, ev: this.events,
        drops: s.world.drops.map(function (d) { return [d.id, d.item, d.qty, r1(d.x), r1(d.y), r1(d.z)]; }),
        me: { hp: r1(me.hp), hun: r1(me.hun), bf: [Math.ceil(me.buff.regen), Math.ceil(me.buff.speed)], build: me.build, target: me.target, cd: me.cb ? me.cb.cd.map(function (v) { return Math.round(v * 10) / 10; }) : null },
      };
      if (s.world.chunked) { msg.cr = I.creatures.pack(s.world, [me], 520); msg.mb = I.mobs.pack(s.world, [me], 520); msg.mp = I.mobs.packProj(s.world, [me], 520); } // créatures, monstres et projectiles proches de cet invité
      if (force || g.bookRev !== me.bookRev) { g.bookRev = me.bookRev; msg.book = me.book || []; }
      if (force || g.invRev !== me.inv.rev) { g.invRev = me.inv.rev; msg.inv = me.inv.toJSON(); msg.stats = me.stats; }
      send(g.dc, msg);
    },

    hostTick: function (dt) {
      this._acc += dt;
      if (this._acc < STATE_DT) return;
      this._acc = 0;
      const now = performance.now();
      for (const g of this.guests.slice()) if (now - g.last > TIMEOUT) this._drop(g);
      this._wacc += STATE_DT;
      if (this._wacc >= WORLD_DT) { this._wacc = 0; this._flushWorld(false); }
      for (const g of this.guests) this._sendState(g, false);
      this.events.length = 0;
    },

    // ---------- invité ----------
    /** Rejoint avec le code d'invitation de l'hôte ; renvoie le code de réponse à lui transmettre. */
    join: async function (game, offerCode) {
      if (this.role !== 'solo') throw new Error('Déjà en coop.');
      const o = await unpack(offerCode);
      if (o.t !== 'o') throw new Error('Ce n’est pas un code d’invitation.');
      this.game = game; this.role = 'guest';
      const pc = new RTCPeerConnection(ICE), me = { pc: pc, dc: null, last: performance.now(), welcomed: false };
      this._host = me;
      pc.ondatachannel = (e) => {
        const dc = me.dc = e.channel;
        const hello = () => { if (!me.welcomed) send(dc, { t: 'hello', key: this.guestKey(), v: 1, av: this.avatar ? I.avatar.pack(this.avatar) : null }); };
        dc.onopen = hello;
        if (dc.readyState === 'open') hello();
        let tries = 0; const iv = setInterval(() => { if (me.welcomed || ++tries > 8 || this._host !== me) clearInterval(iv); else hello(); }, 1000); // au cas où le premier message se perd
        dc.onmessage = (ev) => this._guestMsg(me, ev.data);
        dc.onclose = () => this._lost('La connexion avec l’hôte est terminée.');
      };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this._lost('La connexion a échoué (même wifi ?).'); };
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        return await pack({ t: 'a', sdp: pc.localDescription.sdp });
      } catch (e) { this.close(); throw e; }
    },

    _lost: function (why) {
      if (this.role !== 'guest') return;
      this.close();
      if (this.hooks.closed) this.hooks.closed(why);
    },

    _guestMsg: function (me, raw) {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m) return;
      me.last = performance.now();
      const game = this.game;
      switch (m.t) {
        case 'welcome':
          game.loadSnapshot(m.snap);
          for (const id in game.state.players) game.state.players[id].away = false;
          me.welcomed = true;
          for (const id in game.state.players) { const p = game.state.players[id]; p.tx = p.x; p.ty = p.y; }
          if (this.hooks.welcome) this.hooks.welcome();
          this.changed();
          break;
        case 'bye': this._lost(m.why || 'L’hôte a fermé la connexion.'); break;
        case 'w': if (me.welcomed && (!m.d || m.d === game.state.dim)) { game.state.world.restore(m.w); if (m.pr && Array.isArray(m.pr.recipes)) game.state.progress = m.pr; } break;
        case 's': if (me.welcomed) this._applyState(m); break;
        case 'res': { const cb = this._cb[m.rid]; delete this._cb[m.rid]; if (cb) cb(m.r); break; }
      }
    },

    _applyState: function (m) {
      const s = this.game.state, id0 = this.game.localId;
      s.time.minutes = m.m;
      if (m.d && m.d !== s.dim) { s.dim = m.d; s.world = this.game._worldOf(s, m.d); } // l'hôte a changé de dimension
      s.act = m.a ? { t: m.a[0], dur: m.a[1], tint: m.a[2] } : null;
      for (const id in m.players) {
        const d = m.players[id];
        let p = s.players[id];
        if (!p) { p = s.players[id] = I.Player.create(id, d.x, d.y); p.tx = d.x; p.ty = d.y; }
        p.tx = d.x; p.ty = d.y;
        if (Math.hypot(p.x - d.x, p.y - d.y) > 48) { p.x = d.x; p.y = d.y; }
        p.dir = d.dir; p.moving = d.moving; p.frame = d.frame; p.dashT = d.dashT; p.sw = d.sw || 0; p.swing = d.swing; p.sel = d.sel; p.away = d.away; if (d.av) p.av = I.avatar.sanitize(d.av);
        p.armor = I.armor.sanitize(Array.isArray(d.ar) ? { head: d.ar[0], chest: d.ar[1], legs: d.ar[2], boots: d.ar[3] } : null);
        if (id !== id0) { p.inv.slots.fill(null); if (d.h) p.inv.slots[d.sel] = { id: d.h, qty: 1 }; }
      }
      for (const id in s.players) if (!m.players[id]) delete s.players[id];
      if (s.world.chunked) this.game._stream(s.world, Object.values(s.players), 6); // dimension infinie : l'invité génère lui aussi le terrain autour des joueurs
      const me = s.players[id0];
      if (me) {
        if (m.book) me.book = m.book;
        me.hp = m.me.hp; me.hun = m.me.hun; if (m.me.bf) me.buff = { regen: m.me.bf[0], speed: m.me.bf[1] };
        me.build = m.me.build; me.target = m.me.target; if (m.me.cd) { (me.cb || (me.cb = { cd: [0, 0, 0] })).cd = m.me.cd; }
        if (m.inv) { const rev = me.inv.rev + 1; me.inv = I.Inventory.fromJSON(m.inv, C.INVENTORY_SIZE); me.inv.rev = rev; if (m.stats) me.stats = m.stats; }
      }
      if (s.world.chunked) { I.creatures.unpack(s.world, m.cr); I.mobs.unpack(s.world, m.mb, m.mp); }
      const old = {}; for (const d of s.world.drops) old[d.id] = d;
      s.world.drops = m.drops.map(function (a) { return { id: a[0], item: a[1], qty: a[2], x: a[3], y: a[4], z: a[5], vx: 0, vy: 0, vz: 0, age: old[a[0]] ? old[a[0]].age : 1, pop: false }; });
      if (m.ev && m.ev.length && this.hooks.events) this.hooks.events(m.ev);
    },

    /** À chaque image côté invité : envoie les intentions, lisse les positions, fait avancer l'horloge. */
    guestTick: function (dt, intent) {
      const me = this._host, s = this.game.state;
      if (!me || !me.welcomed) return;
      send(me.dc, { t: 'in', it: intent });
      if (performance.now() - me.last > TIMEOUT) { this._lost('Plus de nouvelles de l’hôte (son onglet est-il en arrière-plan ?).'); return; }
      s.time.minutes += C.MINUTES_PER_SECOND * dt;
      I.explore.step(s);
      if (s.act) s.act.t += dt;
      if (s.world.chunked) this.game._stream(s.world, Object.values(s.players), 2);
      const k = Math.min(1, dt * 18);
      if (s.world.chunked) { I.creatures.smooth(s.world, k); I.mobs.smooth(s.world, k, dt); }
      for (const id in s.players) { const p = s.players[id]; if (p.tx !== undefined) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; } }
    },

    /** Commande d'interface : exécutée ici (solo / hôte) ou envoyée à l'hôte (invité). cb reçoit le résultat. */
    command: function (cmd, cb) {
      if (this.isGuest()) {
        const rid = ++this._rid; if (cb) this._cb[rid] = cb;
        send(this._host && this._host.dc, { t: 'cmd', rid: rid, cmd: cmd });
        return null;
      }
      const ev = [], r = I.commands.run(this.game.state, this.game.localId, cmd, ev);
      if (ev.length) { this.pushEvents(ev); if (this.hooks.events) this.hooks.events(ev); }
      if (cb) cb(r);
      return r;
    },

    cancelJoin: function () {
      if (this._joining) { try { this._joining.destroy(); } catch (e) { /* ok */ } this._joining = null; }
      if (this.isGuest() && this._host && !this._host.welcomed) this.close();
    },

    close: function () {
      for (const g of this.guests.concat(this.pending)) { send(g.dc, { t: 'bye', why: 'L’hôte a quitté la partie.' }); try { g.dc.close(); g.pc.close(); } catch (e) { /* ok */ } if (g.pid && this.game && this.game.state && this.game.state.players[g.pid]) this.game.state.players[g.pid].away = true; }
      if (this._host) { try { this._host.dc && this._host.dc.close(); this._host.pc.close(); } catch (e) { /* ok */ } }
      if (this.room) { try { this.room.peer.destroy(); } catch (e) { /* ok */ } this.room = null; }
      if (this._peer) { try { this._peer.destroy(); } catch (e) { /* ok */ } this._peer = null; }
      this.guests = []; this.pending = []; this._host = null; this._cb = {}; this.events.length = 0; this._lastWorld = '';
      this.role = 'solo';
      this.changed();
    },
  };
  I.Net = Net;
})((window.Iles = window.Iles || {}));
