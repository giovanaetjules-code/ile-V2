/*
 * Entrées clavier / souris. On lit des codes physiques (KeyW = Z sur AZERTY, KeyA = Q...),
 * donc ZQSD et WASD fonctionnent sans configuration. Le jeu ne lit que des « intentions »
 * (voir app.js) : rien d'autre ne touche directement au clavier.
 */
(function (I) {
  const PREVENT = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

  /**
   * Code de touche utilisé par le jeu. Presque tout est PHYSIQUE (ZQSD = WASD), mais la lettre M n'est pas au même endroit sur AZERTY
   * (la touche « M » d'un AZERTY a le code Semicolon, et le code KeyM y est la virgule) : on lit donc la LETTRE pour M.
   */
  function codeOf(e) {
    const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : '';
    if (k === 'm') return 'KeyM';
    if (e.code === 'KeyM') return 'Comma';
    return e.code;
  }

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.down = new Set();
      this.edge = new Set();
      this.mouse = { x: 0, y: 0, t: 0, left: false, right: false, leftEdge: false, rightEdge: false };
      this.wheel = 0;
      this.capture = false; // vrai quand on joue : bloque défilement et activation de boutons par Espace

      window.addEventListener('keydown', (e) => {
        const c = codeOf(e);
        if (this.capture && PREVENT[c]) e.preventDefault();
        if (e.repeat) return;
        this.down.add(c);
        this.edge.add(c);
      });
      window.addEventListener('keyup', (e) => {
        const c = codeOf(e);
        if (this.capture && PREVENT[c]) e.preventDefault();
        this.down.delete(c);
      });
      window.addEventListener('blur', () => { this.down.clear(); this.mouse.left = this.mouse.right = false; });
      window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.t = performance.now(); });
      canvas.addEventListener('mousedown', (e) => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.t = performance.now();
        if (e.button === 0) { this.mouse.left = true; this.mouse.leftEdge = true; }
        if (e.button === 2) { this.mouse.right = true; this.mouse.rightEdge = true; }
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouse.left = false;
        if (e.button === 2) this.mouse.right = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    }

    isDown(code) { return this.down.has(code); }
    pressed(code) { return this.edge.has(code); }
    /** À appeler après chaque pas de simulation : efface les « appuis » déjà traités. */
    endFrame() { this.edge.clear(); this.mouse.leftEdge = false; this.mouse.rightEdge = false; this.wheel = 0; }
  }
  I.Input = Input;
})((window.Iles = window.Iles || {}));
