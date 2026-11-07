/* Caméra qui suit le joueur en douceur, bornée à la carte. Coordonnées en pixels du monde. */
(function (I) {
  class Camera {
    constructor() { this.x = 0; this.y = 0; this.w = 320; this.h = 180; }
    resize(w, h) { this.w = w; this.h = h; }
    clamp(ww, wh) {
      this.x = ww <= this.w ? (ww - this.w) / 2 : Math.max(0, Math.min(ww - this.w, this.x));
      this.y = wh <= this.h ? (wh - this.h) / 2 : Math.max(0, Math.min(wh - this.h, this.y));
    }
    snapTo(tx, ty, ww, wh) { this.x = tx - this.w / 2; this.y = ty - this.h / 2; this.clamp(ww, wh); }
    follow(tx, ty, dt, ww, wh) {
      const k = 1 - Math.exp(-dt * 7);
      this.x += (tx - this.w / 2 - this.x) * k;
      this.y += (ty - this.h / 2 - this.y) * k;
      this.clamp(ww, wh);
    }
    get rx() { return Math.round(this.x); }
    get ry() { return Math.round(this.y); }
  }
  I.Camera = Camera;
})((window.Iles = window.Iles || {}));
