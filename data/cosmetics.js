// PULSAR.io — COSMETICS (Phase 6). Options-only unlocks — purely decorative, no stat effect
// anywhere, so they can never break the shared power ceiling.
//
// A skin is a full HULL LIVERY: `hull` retints the plating (body/plate shades are derived from
// it), `accent` recolors the greeble lines / running lights, `engine` recolors the thruster
// flame, and `fx` names an optional animated layer. What a skin can NEVER touch (VISUAL_SPEC):
// the silhouette (class identity), the white "that's you" core, the shared bright rim, or the
// threat bloom — readability channels stay intact under every livery.
//   hull/engine: null = keep the class default (class hue still shows through).
//   fx: null | 'ember' | 'void' | 'chrome' | 'prism' | 'aurora'  (drawn in game.js / ships.js)
// Adding a skin = one data row. Costs are in cores (meta currency, profile.js).
window.PULSAR = window.PULSAR || {};
window.PULSAR.cosmetics = {
  // UI colors per rarity tier (shop cards, labels).
  tiers: {
    common:    { name: 'Common',    color: '#9fb3c8' },
    rare:      { name: 'Rare',      color: '#4fc3ff' },
    epic:      { name: 'Epic',      color: '#b06bff' },
    legendary: { name: 'Legendary', color: '#ffd23c' },
  },

  skins: [
    { id: 'default',  name: 'Standard',        cost: 0,   tier: 'common',
      hull: null,      accent: '#39d0ff', engine: null,      fx: null,
      blurb: 'Factory plating in your class colors.' },
    { id: 'crimson',  name: 'Crimson Raider',  cost: 40,  tier: 'common',
      hull: '#c23a4c', accent: '#ff5b6b', engine: '#ff7a5b', fx: null,
      blurb: 'Painted red so the wreckage matches.' },
    { id: 'emerald',  name: 'Emerald Sting',   cost: 70,  tier: 'common',
      hull: '#1fae86', accent: '#5eead4', engine: '#7bffbf', fx: null,
      blurb: 'Venom-green with a mint burn.' },
    { id: 'glacier',  name: 'Glacier',         cost: 90,  tier: 'common',
      hull: '#3f7fb8', accent: '#bfe8ff', engine: '#9fd8ff', fx: null,
      blurb: 'Cold steel, colder heart.' },
    { id: 'amethyst', name: 'Amethyst',        cost: 110, tier: 'rare',
      hull: '#7d4bd6', accent: '#c9a2ff', engine: '#b06bff', fx: null,
      blurb: 'Cut from the violet deep.' },
    { id: 'toxin',    name: 'Toxin',           cost: 140, tier: 'rare',
      hull: '#4e9b2f', accent: '#a8ff5b', engine: '#c3ff6b', fx: null,
      blurb: 'Do not lick the hull.' },
    { id: 'ember',    name: 'Ember Forge',     cost: 160, tier: 'rare',
      hull: '#b4491f', accent: '#ff9b3c', engine: '#ffb03c', fx: 'ember',
      blurb: 'Still cooling. Sheds live sparks.' },
    { id: 'rose',     name: 'Rose Quartz',     cost: 200, tier: 'rare',
      hull: '#b85a80', accent: '#ffb3cf', engine: '#ff8fb8', fx: null,
      blurb: 'Pretty. Still armed.' },
    { id: 'solar',    name: 'Solar Gold',      cost: 240, tier: 'epic',
      hull: '#b8912e', accent: '#ffd23c', engine: '#ffe27a', fx: null,
      blurb: 'Gilded for the leaderboard.' },
    { id: 'carbon',   name: 'Midnight Carbon', cost: 320, tier: 'epic',
      hull: '#2a2e38', accent: '#ff3b3b', engine: '#ff5b4c', fx: null,
      blurb: 'Stealth-black weave, red running lights.' },
    { id: 'void',     name: 'Void Bloom',      cost: 360, tier: 'epic',
      hull: '#38205c', accent: '#c060ff', engine: '#8b2fff', fx: 'void',
      blurb: 'Something dark breathes around the hull.' },
    { id: 'chrome',   name: 'Quicksilver',     cost: 480, tier: 'epic',
      hull: '#8d99a6', accent: '#e8f2fb', engine: '#bfe0ff', fx: 'chrome',
      blurb: 'Mirror-finish plating; light glints and sweeps.' },
    { id: 'prism',    name: 'Prismatic',       cost: 650, tier: 'legendary',
      hull: '#39d0ff', accent: '#8fe9ff', engine: null,      fx: 'prism',
      blurb: 'The livery never settles on a color.' },
    { id: 'aurora',   name: 'Aurora',          cost: 900, tier: 'legendary',
      hull: '#2bd4a7', accent: '#9fffe0', engine: null,      fx: 'aurora',
      blurb: 'Polar light rolls teal to violet across the hull.' },
  ],

  skin(id) { for (const s of this.skins) if (s.id === id) return s; return this.skins[0]; },
};
