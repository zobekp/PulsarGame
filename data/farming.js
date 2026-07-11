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

  // ---- The Pulsar (central BLACK HOLE) --------------------------------------
  // A black hole at map center: a gravity well that drags ships inward, a lethal event
  // horizon (touch it and you die), and intermittent bipolar RELATIVISTIC JETS that fling
  // scrap far out along a slowly-rotating axis. The scrap is safest to grab out ALONG the
  // jet stream, away from the deadly core — so positioning near the hole is the risk/reward.
  pulsar: {
    id: "pulsar",
    radiusKey: "arena.pulsarRadius",
    mechanicsKey: "arena.pulsar",          // lethalRadius / pullRadius / pullMaxSpeed / jet*
    behavior: "Pull ships toward the core; instant death inside lethalRadius. Every " +
              "jetIntervalSec, fire a two-pole jet of scrap motes that streak far out.",
    campingMitigation: "The core is lethal (can't sit on it); the jet sweeps its axis so the " +
                       "scrap lands in a different place each time; bounty marks whoever dominates.",
  },
};

// Density helper intent (engine implements): interpolate asteroid spawn density from
// config.farming.densityAtCenter -> densityAtEdge by distance from pulsar. Edges calm,
// mid-map busy, core sparse-but-pulsing (you go there for motes + fights, not rocks).
