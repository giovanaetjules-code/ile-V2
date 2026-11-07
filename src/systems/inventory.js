/* Inventaire : tableau de cases {id, qty} ou null. Les 8 premières cases forment la barre rapide. */
(function (I) {
  class Inventory {
    constructor(size) {
      this.size = size;
      this.slots = new Array(size).fill(null);
      this.rev = 0; // incrémenté à chaque changement, pour que l'interface sache quand se redessiner
    }

    stackMax(id) { return I.ITEMS[id] ? I.ITEMS[id].stack : 99; }

    /** Ajoute qty objets ; renvoie ce qui n'a pas pu entrer. */
    add(id, qty) {
      if (!I.ITEMS[id] || !(qty > 0)) return qty;
      const max = this.stackMax(id);
      let left = qty;
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.qty < max) {
          const n = Math.min(max - s.qty, left);
          s.qty += n; left -= n;
        }
      }
      for (let i = 0; i < this.size && left > 0; i++) {
        if (!this.slots[i]) {
          const n = Math.min(max, left);
          this.slots[i] = { id: id, qty: n }; left -= n;
        }
      }
      if (left !== qty) this.rev++;
      return left;
    }

    /** Agrandit le sac (jamais de rétrécissement : on ne perd pas d'objets). */
    resize(n) {
      while (this.slots.length < n) this.slots.push(null);
      this.size = Math.max(this.size, n);
      this.rev++;
    }

    canAdd(id) {
      const max = this.stackMax(id);
      for (const s of this.slots) if (!s || (s.id === id && s.qty < max)) return true;
      return false;
    }

    count(id) {
      let n = 0;
      for (const s of this.slots) if (s && s.id === id) n += s.qty;
      return n;
    }

    /** Déplace / fusionne / échange deux cases. */
    move(a, b) {
      if (a === b || a < 0 || b < 0 || a >= this.size || b >= this.size) return;
      const sa = this.slots[a], sb = this.slots[b];
      if (!sa) return;
      if (sb && sb.id === sa.id) {
        const n = Math.min(this.stackMax(sa.id) - sb.qty, sa.qty);
        sb.qty += n; sa.qty -= n;
        if (sa.qty <= 0) this.slots[a] = null;
      } else {
        this.slots[a] = sb; this.slots[b] = sa;
      }
      this.rev++;
    }

    /** Retire jusqu'à qty objets de la case ; renvoie le nombre retiré. */
    take(i, qty) {
      const s = this.slots[i];
      if (!s) return 0;
      const n = Math.min(qty, s.qty);
      s.qty -= n;
      if (s.qty <= 0) this.slots[i] = null;
      this.rev++;
      return n;
    }

    /** Fusionne et trie les cases du sac (à partir de `start`, la barre rapide reste intacte). */
    sort(start) {
      const merged = {};
      for (let i = start; i < this.size; i++) {
        const s = this.slots[i];
        if (s) merged[s.id] = (merged[s.id] || 0) + s.qty;
      }
      for (let i = start; i < this.size; i++) this.slots[i] = null;
      let k = start;
      for (const id of I.ITEM_ORDER) {
        let left = merged[id] || 0;
        const max = this.stackMax(id);
        while (left > 0 && k < this.size) {
          const n = Math.min(max, left);
          this.slots[k++] = { id: id, qty: n }; left -= n;
        }
      }
      for (const id of Object.keys(merged)) { // objets hors catalogue (armes forgées) : ajoutés à la suite
        if (I.ITEM_ORDER.indexOf(id) >= 0) continue;
        let left = merged[id];
        while (left > 0 && k < this.size) { const n = Math.min(this.stackMax(id), left); this.slots[k++] = { id: id, qty: n }; left -= n; }
      }
      this.rev++;
    }

    toJSON() { return this.slots.map(function (s) { return s ? { id: s.id, qty: s.qty } : null; }); }

    static fromJSON(arr, minSize) {
      const n = Array.isArray(arr) ? Math.max(minSize, Math.min(64, arr.length)) : minSize;
      const inv = new Inventory(n), size = n;
      if (Array.isArray(arr)) {
        for (let i = 0; i < size && i < arr.length; i++) {
          const s = arr[i];
          if (s && I.ITEMS[s.id] && s.qty > 0) {
            inv.slots[i] = { id: s.id, qty: Math.min(Math.floor(s.qty), inv.stackMax(s.id)) };
          }
        }
      }
      return inv;
    }
  }
  I.Inventory = Inventory;
  /** Retire n exemplaires d'un objet, où qu'ils soient dans le sac (l'appelant a vérifié qu'il y en a assez). */
  I.inv_takeAny = function (inv, id, n) { for (let i = 0; i < inv.slots.length && n > 0; i++) { const s = inv.slots[i]; if (s && s.id === id) n -= inv.take(i, n); } return n; };
})((window.Iles = window.Iles || {}));
