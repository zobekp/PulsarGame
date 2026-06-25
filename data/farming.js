// PULSAR.io — WORLD OBJECTS (neutral farming + the pulsar)
// Data only. Numbers (HP, scrap yield, density, respawn) live in config.js.
// The spatial design: dense farmable asteroids at the calm edges, a high-value
// pulsar at the contested center. The danger gradient is EMERGENT from this, not authored.
window.PULSAR = window.PULSAR || {};

window.PULSAR.worldObjects = {

  // ---- Neutral farming objects (no PvP required to farm) --------------------
  // Each class is meant to farm these differently — see farmingStyle hooks.
  asteroid: {
    id: "asteroid", hpKey: "asteroidHP", scrapKey: "scrapPerAsteroid",
    size: "medium", common: true,
    farmingStyle: "Railship lines them up; Flailship swings through clusters; " +
                  "Gravitor orbits & launches them; Hammerhead plows through.",
  },
  crystal: {
    id: "crystal", hpKey: "crystalHP", scrapKey: "scrapPerCrystal",
    size: "small", common: false, note: "Higher yield, rarer. Rewards seeking.",
  },
  debris: {
    id: "debris", hpKey: "debrisHP", scrapKey: "scrapPerDebris",
    size: "small", common: true, note: "Filler scrap, fast to break.",
  },
  wreckage: {
    id: "wreckage", hpKey: "asteroidHP", scrapKey: "scrapPerAsteroid",
    size: "large", common: false, note: "Chunky; good for momentum/AoE classes.",
  },

  // ---- The Pulsar (central honeypot) ----------------------------------------
  // A neutron star at map center. On a rhythm it ejects scrap motes outward that
  // decay with distance — densest value at the core, thinning to the rim. This is
  // the PvP draw: richest scrap + everyone converges. No zone, no rules to learn.
  pulsar: {
    id: "pulsar",
    radiusKey: "arena.pulsarRadius",
    pulseIntervalKey: "arena.pulsarPulseIntervalSec",
    motesPerPulseKey: "economy.pulsarMotesPerPulse",
    motePerScrapKey: "economy.pulsarScrapPerMote",
    behavior: "On each pulse, eject N motes radially; motes drift out and decay. " +
              "Standing near the core to vacuum motes is high-reward, high-risk.",
    campingMitigation: "Pulse-scatter spreads value so no one can sit on all of it; " +
                       "the bounty/leader system marks whoever tries.",
  },
};

// Density helper intent (engine implements): interpolate asteroid spawn density from
// config.farming.densityAtCenter -> densityAtEdge by distance from pulsar. Edges calm,
// mid-map busy, core sparse-but-pulsing (you go there for motes + fights, not rocks).
