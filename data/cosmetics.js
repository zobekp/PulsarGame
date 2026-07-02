// PULSAR.io — COSMETICS (Phase 6). Options-only unlocks: named accent colours for YOUR ship.
// Purely decorative — no stat effect anywhere — so they can never break the shared power ceiling.
// Adding a skin = one data row here (id/name/cost/accent). The accent tints a cosmetic ring around
// your hull; it does NOT touch class hue or the white "that's you" core (readability stays intact).
window.PULSAR = window.PULSAR || {};
window.PULSAR.cosmetics = {
  skins: [
    { id: 'default',  name: 'Standard',   cost: 0,   accent: '#39d0ff' },
    { id: 'crimson',  name: 'Crimson',    cost: 40,  accent: '#ff5b6b' },
    { id: 'emerald',  name: 'Emerald',    cost: 70,  accent: '#5eead4' },
    { id: 'amethyst', name: 'Amethyst',   cost: 110, accent: '#b06bff' },
    { id: 'ember',    name: 'Ember',      cost: 160, accent: '#ff9b3c' },
    { id: 'solar',    name: 'Solar Gold', cost: 240, accent: '#ffd23c' },
    { id: 'void',     name: 'Void Bloom', cost: 360, accent: '#c060ff' },
  ],
  skin(id) { for (const s of this.skins) if (s.id === id) return s; return this.skins[0]; },
};
