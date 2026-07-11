// PULSAR.io — CLASS DEFINITIONS (data-driven)
// The evolution tree as DATA, per the spec's ClassDefinition shape (adapted to vanilla JS).
// Numbers live in config.js — this file is structure, identity, and behavior-hook names.
// Adding a class = adding a node here + a placeholder in visuals.js + behavior fns the
// engine looks up by `weapon`/`ability`/`passive` key. Never hard-code class logic elsewhere.
window.PULSAR = window.PULSAR || {};

// Each node:
// { id, displayName, tier, parentId, configKey, weapon, ability, passive, special, branchOf }
// tier: 0 starter, 1 base family (lvl 3), 2 upgrade (lvl 8), 3 final (lvl 15)
// configKey points into PULSAR.config[...] for stats/tuning.
// weapon/ability/passive/special are STRING KEYS the engine resolves to behavior fns
// (scaffold them with TODO hooks; data drives which fn runs).

window.PULSAR.classes = {

  starter: {
    id: "starter", displayName: "Scout", tier: 0, parentId: null,
    configKey: "player", weapon: "popgun", ability: null, passive: null,
    note: "Spawn ship. Can farm immediately. Picks a family at level 3.",
  },

  // ===== RAILSHIP (precision sniper) ======================================
  railship: {
    id: "railship", displayName: "Railship", tier: 1, parentId: "starter",
    configKey: "railship",
    weapon: "chargeRail",       // hold-to-charge piercing rail; stages in config
    ability: null,              // (removed) rail keeps ONLY the Shift afterburner escape; heat
                                // is now managed purely by passive decay — no active vent/dash
    passive: "armorCrack",      // full-charge marks target vulnerable
    farmingPassive: "lineBreak",// 3+ neutral objects in one shot = bonus
  },
  // Branch A (lvl 8): HELION — the rail reforged into a solar furnace. A continuous beam
  // whose damage RAMPS the longer it stays on, paid for in compounding heat.
  helion: {
    id: "helion", displayName: "Helion", tier: 2, parentId: "railship",
    configKey: "helion", branchOf: "railship", branch: "A",
    weapon: "helionBeam", ability: null, passive: "armorCrack",
    note: "Hold the beam: damage ramps toward max, heat cost accelerates with it. " +
          "Maxing the heat bar forces a vent lockout — greed has a fuse.",
  },
  // Branch B (lvl 8): STAR PIERCER — the siege railgun. Charging OPENS the maw wider and
  // wider (cannon width == blast width); release fires ONE instantaneous devastating blast
  // along the committed aim — fired, not steered — then a slow recycle. No charge-line
  // telegraph: the tell is the essence intake + the opening maw itself.
  starPiercer: {
    id: "starPiercer", displayName: "Star Piercer", tier: 2, parentId: "railship",
    configKey: "railship", branchOf: "railship", branch: "B",
    weapon: "mawRail", ability: null, passive: "armorCrack",
    special: "brokenCore",       // full-charge vs leader exposes a weak point for allies
  },
  // FINAL A (lvl 15): SUPERNOVA — the furnace goes critical. Same ramping beam; the heat bar
  // itself becomes a weapon: [E] FLARE NOVA dumps ALL current heat as an expanding blast
  // (damage scales with heat spent, clears a vent lockout). Ride the redline, then detonate it.
  supernova: {
    id: "supernova", displayName: "Supernova", tier: 3, parentId: "helion",
    configKey: "helion", branchOf: "railship", branch: "A",
    weapon: "helionBeam", ability: null, passive: "armorCrack",
    special: "flareNova",
    note: "Heat is ammunition now. Spent heat is spent beam uptime — the nova is always a trade.",
  },
  // FINAL B (lvl 15): STARBREAK — the siege blast tears space. A strong-enough maw shot leaves
  // a glowing RIFT along the whole line that collapses moments later and detonates the corridor.
  // A miss is area denial now, not nothing.
  starbreak: {
    id: "starbreak", displayName: "Starbreak", tier: 3, parentId: "starPiercer",
    configKey: "railship", branchOf: "railship", branch: "B",
    weapon: "mawRail", ability: null, passive: "armorCrack",
    special: "brokenCore",
    note: "Fired, not steered — but now the shot's SCAR fights for you after it lands.",
  },

  // ===== HAMMERHEAD (rammer) ==============================================
  hammerhead: {
    id: "hammerhead", displayName: "Hammerhead", tier: 1, parentId: "starter",
    configKey: "hammerhead",
    weapon: "hammerRam",         // hold to wind up, release to charge forward
    ability: "brace",            // DR/knockback resist after committing
    passive: "momentumDamage",   // impact scales with velocity
  },
  maulbreaker: {
    id: "maulbreaker", displayName: "Maulbreaker", tier: 2, parentId: "hammerhead",
    configKey: "hammerhead", branchOf: "hammerhead",
    weapon: "hammerRam", ability: "brace", passive: "momentumDamage",
    mods: { biggerFrontHitbox: true, moreKnockback: true, slowerRecovery: true },
    extraPassive: "armorDent",   // charged impact applies brief slow / resist down
  },
  worldsplitter: {
    id: "worldsplitter", displayName: "Worldsplitter", tier: 3, parentId: "maulbreaker",
    configKey: "hammerhead", branchOf: "hammerhead",
    weapon: "hammerRam", ability: "brace", passive: "momentumDamage",
    special: "worldsplitterSlam", // full-charge hit -> shockwave (contact = real dmg)
  },

  // ===== GRAVITOR (asteroid control) — two branches =======================
  gravitor: {
    id: "gravitor", displayName: "Gravitor", tier: 1, parentId: "starter",
    configKey: "gravitor",
    weapon: "gravityWell",       // pull asteroids into orbit, launch toward cursor
    ability: "launchAsteroid",
    passive: "orbitalHarvest",   // asteroids killed by thrown asteroids give more scrap
  },
  // Branch A: Meteorist (artillery)
  meteorist: {
    id: "meteorist", displayName: "Meteorist", tier: 2, parentId: "gravitor",
    configKey: "gravitor", branchOf: "gravitor", branch: "A",
    weapon: "gravityWell", ability: "launchAsteroid", passive: "orbitalHarvest",
    mods: { capacityUp: true, launchHarder: true, weakerControl: true },
    extraPassive: "momentumStrike", // farther throw = more damage
  },
  starfall: {
    id: "starfall", displayName: "Starfall", tier: 3, parentId: "meteorist",
    configKey: "gravitor", branchOf: "gravitor", branch: "A",
    weapon: "gravityWell", ability: "launchAsteroid", passive: "orbitalHarvest",
    special: "meteorVolley",     // rapid sequential meteor launch, each dodgeable
  },
  // Branch B: Singularity (control/zone)
  singularity: {
    id: "singularity", displayName: "Singularity", tier: 2, parentId: "gravitor",
    configKey: "gravitor", branchOf: "gravitor", branch: "B",
    weapon: "gravityWell", ability: "launchAsteroid", passive: "tidalDrag",
    mods: { strongerPull: true, betterSlow: true, lessLaunchDamage: true },
  },
  eventHorizon: {
    id: "eventHorizon", displayName: "Event Horizon", tier: 3, parentId: "singularity",
    configKey: "gravitor", branchOf: "gravitor", branch: "B",
    weapon: "gravityWell", ability: "launchAsteroid", passive: "tidalDrag",
    special: "collapse",         // implode well: drag + damage by stored asteroids
  },

  // ===== FLAILSHIP (area melee) — two branches ============================
  flailship: {
    id: "flailship", displayName: "Flailship", tier: 1, parentId: "starter",
    configKey: "flailship",
    weapon: "wreckingOrb",       // chained orbiting orb; hold extend / release retract
    ability: "swingControl",
    passive: "momentumHit",      // orb damage scales with orb speed
  },
  // Single upgrade (lvl 8): TWINMAUL — two maces on two chains, spinning in opposite phase.
  // LMB release = the hammer-throw physics stagger them naturally into a rapid one-two volley;
  // RMB = a forced synchronized windup hurls BOTH at once. Special [E] Static Lash: a stun
  // pulse around each mace head that SCRAMBLES nearby enemies' charge-ups (rail charge, ram
  // windup, beam ramp, spin momentum) and locks their abilities for a beat.
  twinmaul: {
    id: "twinmaul", displayName: "Twinmaul", tier: 2, parentId: "flailship",
    configKey: "flailship", branchOf: "flailship",
    weapon: "wreckingOrb", ability: "swingControl", passive: "momentumHit",
    special: "staticLash",
  },
  // FINAL (lvl 15): BINARY STAR — the two maces become energized SWORDS (faster, longer reach,
  // heavier hits; still block shots) linked by a live energy tether. Anything crossing the line
  // between the heads takes ticking damage and is dragged onto it; a synced (RMB) throw turns the
  // tether into a GARROTE mid-flight. Fence space. Catch people. Cut them.
  binaryStar: {
    id: "binaryStar", displayName: "Binary Star", tier: 3, parentId: "twinmaul",
    configKey: "flailship", branchOf: "flailship",
    weapon: "wreckingOrb", ability: "swingControl", passive: "momentumHit",
    special: "staticLash",
    note: "Twin swords on live tethers — the blades AND the space between them are the weapon.",
  },
};

// Cross-class balance triangle (the combat ecosystem — no class universally good):
//   Railship   beats big/predictable    | loses to fast rushers & close chaos
//   Hammerhead beats mispositioners     | loses to kiting, gravity disruption, baiting
//   Gravitor   beats clustered/predictable | loses to fast dive, open space, being rushed
//   Flailship  beats close rushers      | loses to long-range kiting & precise rail
window.PULSAR.balanceTriangle = {
  railship:  { beats: "big/predictable", losesTo: "fast rushers, close chaos" },
  hammerhead:{ beats: "mispositioners",  losesTo: "kiting, gravity, baiting" },
  gravitor:  { beats: "clustered/predictable", losesTo: "fast dive, open space, rush" },
  flailship: { beats: "close rushers",   losesTo: "long-range kiting, rail" },
};
