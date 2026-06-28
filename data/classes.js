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
    ability: "ventDash",        // backward dash, sheds heat, cancels some charge
    passive: "armorCrack",      // full-charge marks target vulnerable
    farmingPassive: "lineBreak",// 3+ neutral objects in one shot = bonus
  },
  lancer: {
    id: "lancer", displayName: "Lancer", tier: 2, parentId: "railship",
    configKey: "railship", branchOf: "railship",
    weapon: "chargeRail", ability: "ventDash", passive: "armorCrack",
    mods: { rangeUp: true, fullChargeDamageUp: true, thinnerBeam: true,
            weakerUpClose: true },
    extraPassive: "perfectLine", // hits beyond 60% range take +20%
  },
  starPiercer: {
    id: "starPiercer", displayName: "Star Piercer", tier: 3, parentId: "lancer",
    configKey: "railship", branchOf: "railship",
    weapon: "chargeRail", ability: "ventDash", passive: "armorCrack",
    special: "brokenCore",       // full-charge vs leader exposes a weak point for allies
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
  // Branch A: Chainmaul (heavy damage)
  chainmaul: {
    id: "chainmaul", displayName: "Chainmaul", tier: 2, parentId: "flailship",
    configKey: "flailship", branchOf: "flailship", branch: "A",
    weapon: "wreckingOrb", ability: "powerSwing", passive: "momentumHit",
    mods: { largerOrb: true, longerChain: true, moreCommitment: true },
  },
  ironmoon: {
    id: "ironmoon", displayName: "Ironmoon", tier: 3, parentId: "chainmaul",
    configKey: "flailship", branchOf: "flailship", branch: "A",
    weapon: "wreckingOrb", ability: "powerSwing", passive: "momentumHit",
    special: "moonSlam",         // launch orb outward, big impact, retract; weak to kiting
  },
  // Branch B: Graviflail (control/orbit)
  graviflail: {
    id: "graviflail", displayName: "Graviflail", tier: 2, parentId: "flailship",
    configKey: "flailship", branchOf: "flailship", branch: "B",
    weapon: "wreckingOrb", ability: "orbitLock", passive: "momentumHit",
    mods: { smootherOrbit: true, widerDefensiveOrbit: true, slightScrapPull: true },
  },
  orbitCrusher: {
    id: "orbitCrusher", displayName: "Orbit Crusher", tier: 3, parentId: "graviflail",
    configKey: "flailship", branchOf: "flailship", branch: "B",
    weapon: "wreckingOrb", ability: "gravityCrush", passive: "momentumHit",
    special: "gravityCrush",     // spin orb, damage + pull small objects; area denial
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
