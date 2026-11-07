/*
 * Commandes tactiles (téléphone / tablette) : joystick à gauche, boutons à droite. S'active tout seul sur un écran tactile
 * (ou avec ?touch=1 dans l'adresse pour tester sur ordinateur). Ne touche à rien d'autre : il fabrique de FAUSSES touches dans `Input`
 * (ZQSD pour le joystick, E, J, Espace, R, F, V, C, M, Échap pour les boutons), donc toutes les règles du jeu restent les mêmes.
 * Sur mobile, la mini-carte et l'aide clavier sont masquées (classe `touch` sur <body>, voir styles.css).
 */
(function (I) {
  const forced = /[?&]touch=1/.test(location.search);
  const enabled = forced || (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  // boutons : code de touche, libellé, mode ('tap' = un appui, 'hold' = maintenu), classe
  const BTNS = [
    { k: 'KeyE', t: 'E', m: 'tap', c: 'big act', title: 'Action : interagir, ramasser, ouvrir (sans cible : sac)' },
    { k: 'KeyJ', t: '⚔', m: 'hold', c: 'big use', title: 'Utiliser l’outil / frapper' },
    { k: 'Space', t: '»', m: 'tap', c: 'mid dash', title: 'Dash' },
    { k: 'KeyR', t: 'R', m: 'tap', c: 'sm ab1', title: 'Capacité 1' },
    { k: 'KeyF', t: 'F', m: 'tap', c: 'sm ab2', title: 'Capacité 2' },
    { k: 'KeyV', t: 'V', m: 'tap', c: 'sm ab3', title: 'Capacité 3' },
  ];
  const TOP = [{ k: 'KeyC', t: '⚒', title: 'Artisanat' }, { k: 'KeyM', t: '🗺', title: 'Carte' }, { k: 'Escape', t: '☰', title: 'Pause' }];

  const Touch = {
    enabled: enabled,
    init: function (input) {
      if (!enabled) return;
      document.body.classList.add('touch');
      const hud = document.getElementById('hud'), root = document.createElement('div');
      root.id = 'touch';
      root.innerHTML = '<div id="joy"><i id="joy-knob"></i></div><div id="tbtns">' + BTNS.map(function (b, i) { return '<button class="tb ' + b.c + '" data-i="' + i + '" title="' + b.title + '">' + b.t + '</button>'; }).join('') + '</div>' +
        '<div id="ttop">' + TOP.map(function (b, i) { return '<button class="tt" data-t="' + i + '" title="' + b.title + '">' + b.t + '</button>'; }).join('') + '</div>';
      hud.appendChild(root);
      const joy = root.querySelector('#joy'), knob = root.querySelector('#joy-knob');
      const DIRS = { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'] };
      let jid = null, held = {};
      const setDir = function (name, on) { if (!!held[name] === on) return; held[name] = on; DIRS[name].forEach(function (c) { if (on) input.down.add(c); else input.down.delete(c); }); };
      const stick = function (e) {
        const r = joy.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
        knob.style.transform = 'translate(' + (dx / d * k * R * 0.6) + 'px,' + (dy / d * k * R * 0.6) + 'px)';
        const nx = dx / d * k, ny = dy / d * k, T = 0.32; // zone morte : 32 % du rayon ; diagonales automatiques
        setDir('l', nx < -T); setDir('r', nx > T); setDir('u', ny < -T); setDir('d', ny > T);
      };
      const release = function () { jid = null; knob.style.transform = ''; ['l', 'r', 'u', 'd'].forEach(function (n) { setDir(n, false); }); };
      joy.addEventListener('pointerdown', function (e) { if (jid !== null) return; jid = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (_) { /* le doigt reste suivi par les événements du bouton */ } stick(e); e.preventDefault(); });
      joy.addEventListener('pointermove', function (e) { if (e.pointerId === jid) { stick(e); e.preventDefault(); } });
      joy.addEventListener('pointerup', function (e) { if (e.pointerId === jid) release(); });
      joy.addEventListener('pointercancel', function (e) { if (e.pointerId === jid) release(); });

      const pressBtn = function (b, on) { if (b.m === 'hold') { if (on) input.down.add(b.k); else input.down.delete(b.k); } else if (on) input.edge.add(b.k); };
      root.querySelector('#tbtns').addEventListener('pointerdown', function (e) {
        const el = e.target.closest('button[data-i]'); if (!el) return;
        const b = BTNS[+el.dataset.i]; try { el.setPointerCapture(e.pointerId); } catch (_) { /* idem */ } el.classList.add('on'); pressBtn(b, true); e.preventDefault();
        const up = function () { el.classList.remove('on'); pressBtn(b, false); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
      root.querySelector('#ttop').addEventListener('pointerdown', function (e) {
        const el = e.target.closest('button[data-t]'); if (!el) return; input.edge.add(TOP[+el.dataset.t].k); e.preventDefault();
      });
      root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    },
  };
  I.Touch = Touch;
})((window.Iles = window.Iles || {}));
