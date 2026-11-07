/*
 * Test des commandes tactiles : téléphone en paysage (écran tactile), joystick, bouton E, bouton d'action, dash, mini-carte masquée.
 *   node tools/test-touch.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
 */
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = path.resolve(__dirname, 'shots');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const E = (fn, a) => page.evaluate(fn, a), wait = (ms) => page.waitForTimeout(ms);
  // événements « pointeur » comme un doigt : id, type, position
  const ptr = (sel, type, id, fx, fy) => E(([sel, type, id, fx, fy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(); const o = { pointerId: id, bubbles: true, cancelable: true, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, pointerType: 'touch', isPrimary: true }; el.setPointerCapture = el.setPointerCapture || (() => {}); el.dispatchEvent(new PointerEvent(type, o)); }, [sel, type, id, fx, fy]);

  await page.goto(URL); await wait(500);
  check('écran tactile détecté : classe « touch » et commandes présentes', await E(() => document.body.classList.contains('touch') && !!document.getElementById('joy') && document.querySelectorAll('#tbtns .tb').length === 6));
  await page.mouse.click(5, 5); await wait(100);
  await E(() => document.getElementById('btn-new').click()); await wait(2500);
  check('en jeu : commandes visibles, mini-carte et aide clavier masquées', await E(() => { const v = (id) => getComputedStyle(document.getElementById(id)).display !== 'none'; return v('touch') && !v('minimap') && !v('help'); }));
  await page.screenshot({ path: path.join(OUT, '90-touch.png') });

  const pos = () => E(() => { const p = Iles.debug.game.local; return [p.x, p.y]; });
  await E(() => { Iles.debug.game.local.target = null; });
  const a = await pos();
  await ptr('#joy', 'pointerdown', 1, 0.5, 0.5); await ptr('#joy', 'pointermove', 1, 1.0, 0.5); await wait(700);
  const b = await pos();
  check('joystick poussé à droite : le joueur avance à droite', b[0] - a[0] > 8 && Math.abs(b[1] - a[1]) < 6, [a, b]);
  await ptr('#joy', 'pointermove', 1, 0.5, 0.0); await wait(600);
  const c = await pos();
  check('joystick poussé vers le haut : le joueur monte', c[1] - b[1] < -6, [b, c]);
  await ptr('#joy', 'pointerup', 1, 0.5, 0.5); await wait(300);
  const d1 = await pos(); await wait(300); const d2 = await pos();
  check('joystick relâché : le joueur s’arrête', Math.abs(d2[0] - d1[0]) < 1 && Math.abs(d2[1] - d1[1]) < 1, [d1, d2]);

  await ptr('.tb.act', 'pointerdown', 2, 0.5, 0.5); await ptr('.tb.act', 'pointerup', 2, 0.5, 0.5); await wait(300);
  check('bouton E sans cible : ouvre l’inventaire', await E(() => Iles.Menu.screen === 'inventory'));
  await E(() => Iles.Menu.show('playing')); await wait(200);
  await E(() => { const g = Iles.debug.game, p = g.local, o = g.state.world.byId.get('workbench') || g.state.world.objects.find(o => o.def && o.def.action === 'craft'); if (o) { p.x = o.x; p.y = o.y + 10; } }); await wait(500);
  await ptr('.tb.act', 'pointerdown', 3, 0.5, 0.5); await ptr('.tb.act', 'pointerup', 3, 0.5, 0.5); await wait(300);
  check('bouton E devant l’établi : ouvre l’établi', await E(() => Iles.Menu.screen === 'crafting'));
  await E(() => Iles.Menu.show('playing')); await wait(200);
  await ptr('#ttop .tt:nth-child(3)', 'pointerdown', 4, 0.5, 0.5); await wait(250);
  check('bouton ☰ : ouvre la pause', await E(() => Iles.Menu.screen === 'pause'));
  await E(() => Iles.Menu.show('playing')); await wait(200);
  await ptr('#ttop .tt:nth-child(2)', 'pointerdown', 5, 0.5, 0.5); await wait(250);
  check('bouton carte : ouvre la grande carte', await E(() => Iles.Menu.screen === 'map'));
  await E(() => Iles.Menu.show('playing')); await wait(200);
  // maintien du bouton d'action « frapper » : la touche J est enfoncée tant qu'on appuie
  await ptr('.tb.use', 'pointerdown', 6, 0.5, 0.5);
  check('bouton ⚔ maintenu : l’intention « utiliser » est active', await E(() => Iles.debug.input ? Iles.debug.input.isDown('KeyJ') : true));
  await ptr('.tb.use', 'pointerup', 6, 0.5, 0.5);
  check('bouton ⚔ relâché : plus d’utilisation', await E(() => Iles.debug.input ? !Iles.debug.input.isDown('KeyJ') : true));
  const d0 = await pos(); await E(() => { Iles.debug.game.local.dashT = 0; });
  await ptr('#joy', 'pointerdown', 7, 0.5, 0.5); await ptr('#joy', 'pointermove', 7, 1.0, 0.5); await wait(100);
  await ptr('.tb.dash', 'pointerdown', 8, 0.5, 0.5); await ptr('.tb.dash', 'pointerup', 8, 0.5, 0.5); await wait(120);
  check('bouton dash : le joueur fonce (dash actif)', await E(() => Iles.debug.game.local.dashT > 0));
  await ptr('#joy', 'pointerup', 7, 0.5, 0.5);
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' réussis, ' + fail + ' échoués');
  await browser.close(); process.exit(fail ? 1 : 0);
})();
