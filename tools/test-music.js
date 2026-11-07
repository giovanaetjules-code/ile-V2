/*
 * Test de la musique : démarrage après le premier clic, scènes (titre / île / lobby / dimension / combat), fondus, enchaînement
 * des pistes, fichier absent ignoré (Combat.mp3 facultatif), volume réglable et sauvegardé, aucune erreur JavaScript.
 *   node tools/test-music.js     (variables : PLAYWRIGHT_PATH, CHROMIUM)
 * Le test crée temporairement audio/musique/Combat.mp3 (copie de Portail.mp3) puis le supprime.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const DIR = path.resolve(__dirname, '..', 'audio', 'musique');
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } }

(async () => {
  const hadCombat = fs.existsSync(path.join(DIR, 'Combat.mp3'));
  if (hadCombat) { console.log('Combat.mp3 existe déjà : test annulé pour ne pas y toucher.'); process.exit(2); }
  const missingFiles = ['Intro_du_jeu', 'Music_Jour_1', 'Music_Jour_2', 'Dimension_music_1', 'Dimension_music_2', 'Portail'].filter(n => !fs.existsSync(path.join(DIR, n + '.mp3')));
  if (missingFiles.length) { console.log('Fichiers absents : ' + missingFiles.join(', ')); process.exit(2); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--disable-3d-apis', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME|ERR_INTERNET|fonts\.g|Combat\.mp3|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const E = (fn, a) => page.evaluate(fn, a);
  const wait = ms => page.waitForTimeout(ms);
  const st = () => E(() => { const M = Iles.Music; return { scene: M.scene, file: M.cur && M.cur.file, t: M.cur ? M.cur.a.currentTime : 0, paused: M.cur ? M.cur.a.paused : null, vol: M.cur ? M.cur.a.volume : 0, n: M.ch.length, want: M.wanted(), missing: Object.keys(M.missing) }; });
  const load = async () => { await page.goto(URL); await wait(500); };

  console.log('Démarrage');
  await load();
  let s = await st();
  check('rien ne joue avant le premier clic (règle des navigateurs)', s.n === 0 && s.scene === null, s);
  await page.mouse.click(480, 270); await wait(1800);
  s = await st();
  check('après le clic, l’écran titre joue Intro_du_jeu.mp3', s.scene === 'titre' && s.file === 'Intro_du_jeu.mp3' && !s.paused && s.t > 0.3 && s.vol > 0.1, s);

  console.log('Scènes');
  await page.click('#btn-new'); await wait(3800);
  s = await st();
  check('en jeu sur l’île : musique de jour, l’ancienne piste est coupée', s.scene === 'jour' && s.file === 'Music_Jour_1.mp3' && s.n === 1 && s.vol > 0.2, s);
  const sc = await E(() => {
    const M = Iles.Music, g = Iles.debug.game, w = g.state.world, r = {};
    r.island = M.wanted();
    g.state.act = true; r.act = M.wanted(); g.state.act = false;
    w.lobby = true; r.lobby = M.wanted(); w.lobby = false;
    w.chunked = true; r.dim = M.wanted(); w.chunked = false;
    r.resolveMissing = (M.missing['Portail.mp3'] = true, M.resolve('lobby')); delete M.missing['Portail.mp3'];
    r.resolveOk = M.resolve('lobby');
    return r;
  });
  check('scène voulue : île=jour, portail=lobby, lobby=lobby, dimension=dimension', sc.island === 'jour' && sc.act === 'lobby' && sc.lobby === 'lobby' && sc.dim === 'dimension', sc);
  check('si Portail.mp3 manquait, repli sur la musique des dimensions', sc.resolveMissing === 'dimension' && sc.resolveOk === 'lobby', sc);
  await E(() => { const M = Iles.Music; M.realWanted = M.wanted; M.wanted = () => 'dimension'; }); await wait(3200);
  s = await st();
  check('en dimension : Dimension_music_1.mp3', s.scene === 'dimension' && s.file === 'Dimension_music_1.mp3' && s.n === 1, s);
  await E(() => { Iles.Music.wanted = () => 'lobby'; }); await wait(3200);
  s = await st();
  check('éveil du portail / lobby : Portail.mp3 (en boucle)', s.scene === 'lobby' && s.file === 'Portail.mp3' && await E(() => Iles.Music.cur.a.loop), s);
  await E(() => { Iles.Music.wanted = Iles.Music.realWanted; }); await wait(3200);
  s = await st();
  check('retour sur l’île : la musique de jour reprend', s.scene === 'jour', s);

  console.log('Enchaînement des pistes');
  await E(() => { const a = Iles.Music.cur.a; a.currentTime = a.duration - 3; }); await wait(1500);
  s = await st();
  check('à la fin de la piste, la suivante démarre en fondu (Music_Jour_2.mp3)', s.file === 'Music_Jour_2.mp3' && s.n === 2, s);
  await wait(7500); s = await st();
  check('l’ancienne piste a fini de s’éteindre', s.n === 1 && s.vol > 0.3, s);
  await E(() => { const a = Iles.Music.cur.a; a.currentTime = a.duration - 3; }); await wait(1500); await wait(7500);
  s = await st();
  check('la playlist reboucle sur Music_Jour_1.mp3', s.file === 'Music_Jour_1.mp3' && s.n === 1, s);

  console.log('Combat.mp3 absent');
  await E(() => Iles.Music.combat()); await wait(1500);
  s = await st();
  check('sans Combat.mp3 : rien ne change, pas d’erreur, fichier noté absent', s.scene === 'jour' && s.file === 'Music_Jour_1.mp3' && s.missing.includes('Combat.mp3') && !s.paused, s);

  console.log('Volume');
  await E(() => Iles.Menu.show('options'));
  await E(() => { const o = document.getElementById('opt-music'); o.value = '0'; o.dispatchEvent(new Event('input')); }); await wait(600);
  s = await st();
  const saved = await E(() => JSON.parse(localStorage.getItem(Iles.config.SETTINGS_KEY)).music);
  check('curseur à 0 : musique muette et réglage sauvegardé', s.vol === 0 && saved === 0, [s.vol, saved]);
  await E(() => { const o = document.getElementById('opt-music'); o.value = '100'; o.dispatchEvent(new Event('input')); }); await wait(500);
  s = await st();
  check('curseur à 100 : volume maximal', s.vol > 0.95, s.vol);
  await E(() => { const o = document.getElementById('opt-music'); o.value = '40'; o.dispatchEvent(new Event('input')); });

  console.log('Avec Combat.mp3');
  fs.copyFileSync(path.join(DIR, 'Portail.mp3'), path.join(DIR, 'Combat.mp3'));
  try {
    await load();
    await page.mouse.click(5, 5); await wait(600);
    check('le réglage 40 % est retrouvé après rechargement', await E(() => { Iles.Menu.show('options'); const ok = Math.abs(Iles.Music.volume - 0.4) < 1e-6 && document.getElementById('opt-music').value === '40'; Iles.Menu.show('title'); return ok; }));
    await page.click('#btn-new'); await wait(600); if (await page.isVisible('#btn-confirm-yes')) await page.click('#btn-confirm-yes'); await wait(3000);
    await E(() => Iles.Music.combat()); await wait(1800);
    s = await st();
    check('coup porté : la musique de combat se lance', s.scene === 'combat' && s.file === 'Combat.mp3' && !s.paused && s.vol > 0.1, s);
    await E(() => { Iles.Music.combatUntil = 0; }); await wait(4500);
    s = await st();
    check('combat fini : retour à la musique de jour', s.scene === 'jour' && s.n === 1, s);
  } finally { fs.unlinkSync(path.join(DIR, 'Combat.mp3')); }

  console.log('\nErreurs JS : ' + (errors.length ? '\n' + errors.join('\n') : 'aucune'));
  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log('\n' + pass + ' ok, ' + fail + ' échec(s)');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
