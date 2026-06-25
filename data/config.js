// PULSAR.io — TUNING SURFACE
// The ONE place gameplay numbers live. Non-negotiable rule: no balance constant is
// hard-coded in engine logic — it lives here, with a comment on intent. Loaded as a
// plain <script> before everything else (no build step).
window.PULSAR = window.PULSAR || {};
window.PULSAR.config = {

  // ---- Arena & spatial model -------------------------------------------------
  // Uniform open field. Pulsar honeypot at center = richest scrap + PvP draw.
  // Asteroid density is highest mid-map, thinning toward calm farmable edges.
  // The risk gradient is EMERGENT from value placement, not authored rings.
  arena: {
    width: 6000,
    height: 6000,
    pulsarRadius: 220,            // the central neutron-star honeypot
    pulsarPulseIntervalSec: 4,    // rhythm on which it ejects scrap motes
    edgeSafeMargin: 800,          // outer band where asteroids are dense & PvP is rare
  },

  // ---- Player base -----------------------------------------------------------
  player: {
    baseHP: 100,
    baseSpeed: 280,               // px/sec, the 100% reference for class multipliers
    baseRadius: 16,
    spawnProtectionSec: 3,        // brief invuln so TTK-to-fun < 10s holds
    scrapTrickleOnSpawn: 5,       // tiny seed so a fresh player is acting, not idle
  },

  // ---- Economy & death (greed model) ----------------------------------------
  // Scrap is the single currency. Earning it raises LEVEL (gates evolutions) AND
  // accumulates as carried scrap. Spending scrap on an evolution/upgrade LOCKS that
  // progress in (safe). Carried-but-unspent scrap is what you risk: die, drop a chunk.
  economy: {
    scrapPerAsteroid: 3,
    scrapPerCrystal: 6,           // higher-yield, rarer neutral object
    scrapPerDebris: 2,
    pulsarScrapPerMote: 4,        // motes the pulsar ejects on each pulse
    pulsarMotesPerPulse: 8,
    killScrapFraction: 0.5,       // killer collects this share of victim's carried scrap
    dropFractionOnDeath: 0.5,     // victim drops this share of UNSPENT carried scrap
    lineBreakBonusScrap: 4,       // Railship "LINE BREAK": 3+ objects in one shot
    // Level thresholds (XP == cumulative scrap earned). Tune the curve in playtest.
    levelChooseClass: 3,          // pick one of the 4 families
    levelChoosePath: 8,           // pick upgrade branch
    levelFinalEvolution: 15,      // final class form
    levelLeaderScaling: 25,       // dreadnought / crowned scaling kicks in
    evolutionCosts: { class: 30, path: 80, final: 160 }, // scrap spent = banked progress
  },

  // ---- Leader / David-vs-Goliath brake --------------------------------------
  // Leaders get power AND vulnerability. Avoid flat unfair multipliers; hitbox &
  // visibility do most of the balancing work.
  leader: {
    hpBonus: 0.30,                // +30% HP at leader scaling
    hitboxBonus: 0.35,            // bigger target — the core anti-snowball lever
    turnRatePenalty: 0.20,        // very large ships steer worse
    bountyScrapMultiplier: 2.0,   // killing the marked leader pays double
    crownVisibleRangePx: 99999,   // crowned/marked on minimap to everyone
    armorCrackBonusVsLeader: 2.0, // anti-large mechanics bite harder (see railship)
  },

  // ---- Readability (gameplay-stakes, do not let these emerge by accident) ----
  readability: {
    yourShipCoreWhite: true,      // YOU always get the pure-white core ring; nobody else
    yourShipBloomScale: 1.4,      // you are the brightest thing on screen
    threatBloomScale: 1.0,        // scales up with carried scrap / level (rich = bright)
    threatBloomMax: 2.2,
    enemyUltBackgroundDesat: 0.6, // enemy ult fires -> bg desaturates this much for a beat
    teamHueIsBodyRing: true,      // hue=team, silhouette+aura=class, brightness=threat
  },

  // ---- Combat reference ------------------------------------------------------
  combat: {
    ttkReferenceHits: 5,          // dial that decides twitchy vs grindy; keep TTK long
                                  // enough that VFX tells matter
    knockbackBase: 140,
  },

  // ---- CLASS 1: Railship (precision sniper / line farmer / anti-large) -------
  // Lineage: descends from the old Lance weapon (Railpiercer -> Star Piercer).
  railship: {
    stats: { hp: 0.85, speed: 1.00, difficulty: "medium-high" },
    charge: {
      // % thresholds and the shot they produce
      snapMax: 0.25,  focusMax: 0.75,  lanceMax: 1.00, // beyond 1.0 == overcharge
      damage: { snap: 8, focus: 20, lance: 42, overcharge: 70 },
      pierce: { snap: 1, focus: 3, lance: 6, overcharge: 9 },
      recoil: { snap: 0, focus: 40, lance: 120, overcharge: 220 },
      applyArmorCrackAt: "lance", // lance+ applies Armor Crack
    },
    movementWhileCharging: { // multipliers by charge fraction
      to50: 1.00, to90: 0.85, to100: 0.70, overcharge: 0.55,
    },
    heat: {
      max: 100, tapShot: 8, halfCharge: 18, fullCharge: 35, overcharge: 55,
      decayPerSec: 22, ventStateAtMax: true, ventStateSec: 1.0,
    },
    ventDash: { heatReduction: 25, cooldownSec: 3, chargePenaltyFraction: 0.25 },
    armorCrack: { baseDurationSec: 1.5, damageAmp: 0.15,
                  durationVs2xLarger: 2.25, durationVs4xLarger: 3.0 },
    pierceFalloff: { neutral: [1.0, 0.9, 0.8, 0.7], players: [1.0, 0.7, 0.45] },
    lineBreakThreshold: 3,
  },

  // ---- CLASS 2: Hammerhead (rammer / bruiser / beginner aggression) ----------
  // New identity (no old-weapon equivalent). Impact melee; must not invalidate flail.
  hammerhead: {
    stats: { hp: 1.15, speed: 0.90, difficulty: "easy-medium" },
    ram: {
      tapBashDamage: 10, chargedDamage: 34, overcommitDamage: 60,
      momentumMultiplier: 0.12,   // impactDamage = base + velocity * this
      windupSec: 0.6, missRecoverySec: 0.9, turnRateDuringCharge: 0.3,
    },
    ability: "brace",             // "brace" (DR) or "brakeTurn" (redirect) — pick in code
    brace: { damageReduction: 0.5, durationSec: 0.8, cooldownSec: 6 },
    armorDent: { slow: 0.2, durationSec: 1.2 }, // Maulbreaker+ on charged impact
  },

  // ---- CLASS 3: Gravitor (asteroid control / indirect / zone) ----------------
  // Lineage: descends from Nova (Collapse/Event Horizon == Nova "pull-then-detonate").
  gravitor: {
    stats: { hp: 0.90, speed: 0.90, difficulty: "medium" },
    well: {
      asteroidCapacity: 2, pullRadius: 320, enemyPull: 30, enemySlow: 0.10,
      launchSpeed: 520, launchDamage: 16, cooldownSec: 2.5,
    },
    momentumStrike: { medThrowBonus: 0.15, longThrowBonus: 0.30 }, // Meteorist+
    collapse: { channelSec: 1.0, detonationDelaySec: 0.4,          // Event Horizon
                damagePerStoredAsteroid: 14, dragDurationSec: 0.6 },
  },

  // ---- CLASS 4: Flailship (area melee / farming / anti-rush) -----------------
  // Lineage: the orbiting flail from day one + Tether's zoning.
  flailship: {
    stats: { hp: 1.00, speed: 0.92, difficulty: "easy-medium" },
    orb: {
      radiusMin: 60, radiusMax: 180,   // hold to extend, release to retract
      orbitSpeed: 3.2, contactDamage: 18,
      momentumMultiplier: 0.10,         // orbDamage = base + orbVelocity * this
    },
    powerSwing: { damageMult: 1.5, durationSec: 3, cooldownSec: 8 }, // Chainmaul+
    moonSlam: { chargeSec: 0.5, damage: 50, knockback: 260, splash: 0.3 }, // Ironmoon
    orbitLock: { durationSec: 4, cooldownSec: 9 },                  // Graviflail
    gravityCrush: { radius: 200, dps: 30, pullSmallObjects: true }, // Orbit Crusher
  },

  // ---- Neutral farming objects ----------------------------------------------
  farming: {
    asteroidHP: 12, crystalHP: 22, debrisHP: 6,
    densityAtCenter: 0.4, densityAtEdge: 1.0, // edges are the calm farm; center is risk
    respawnSec: 8,
  },
};
