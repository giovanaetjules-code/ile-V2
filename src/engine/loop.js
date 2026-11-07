/* Boucle de jeu : simulation à pas fixe (60 Hz), rendu à chaque image du navigateur. */
(function (I) {
  class Loop {
    constructor(update, render) {
      this.update = update;
      this.render = render;
      this.acc = 0;
      this.last = 0;
      this.running = false;
    }
    start() {
      this.running = true;
      this.last = performance.now();
      const STEP = I.config.STEP;
      const tick = (now) => {
        if (!this.running) return;
        let dt = (now - this.last) / 1000;
        this.last = now;
        if (dt < 0) dt = 0; // le 1er timestamp de rAF peut précéder performance.now()
        if (dt > 0.25) dt = 0.25;
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < 6) { this.update(STEP); this.acc -= STEP; steps++; }
        if (steps === 6) this.acc = 0;
        this.render(dt);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    stop() { this.running = false; }
  }
  I.Loop = Loop;
})((window.Iles = window.Iles || {}));
