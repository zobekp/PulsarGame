// PULSAR.io — TUNING SURFACE
// The ONE place gameplay numbers live. Non-negotiable rule: no balance constant is
// hard-coded in engine logic — it lives here, with a comment on intent. Loaded as a
// plain <script> before everything else (no build step).
window.PULSAR = window.PULSAR || {};
window.PULSAR.config = {

  // ---- Simulation (determinism — matters for Phase 5 netcode) ----------------
  // Sim runs on a FIXED timestep decoupled from render. Movement and cooldowns are
  // expressed per-second and integrated by `1/tickRate`, never by real frame time —
  // so behavior is identical at 30fps or 144fps. Render interpolates between ticks.
  sim: {
    tickRate: 60,            // fixed sim steps per second (the determinism clock)
    maxFrameTimeSec: 0.25,   // clamp huge frame gaps (tab-out) so we don't spiral-of-death
  },

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
    baseHP: 130,                  // global durability floor — every class multiplies against this
    baseSpeed: 280,               // px/sec, the 100% reference for class multipliers
    baseRadius: 16,
    spawnProtectionSec: 3,        // brief invuln so TTK-to-fun < 10s holds
    scrapTrickleOnSpawn: 5,       // tiny seed so a fresh player is acting, not idle
    impulseDampPerSec: 9,         // how fast recoil/dash/knockback kicks bleed off
    respawnDelaySec: 1.7,         // wreck -> respawn wait
    regen: { delaySec: 5.0, perSec: 18 }, // passive regen after 5s of no weapon use
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
    // Level from cumulative earned scrap (XP): xpToReach(L) = round(k * (L-1)^exp).
    // ~L3≈28xp (early), L8≈250, L15≈880, L25≈2360 (leader grind). Tune in playtest.
    levelCurve: { k: 8, exp: 1.8 },
    // Within-family growth so evolving READS as power: each step above the base family
    // (tier 2 = upgrade, tier 3 = final) grows the hull + HP. Combined with per-family
    // sizeMult and leader scaling. Makes Lancer/Star Piercer etc. visibly bigger + tankier.
    tierGrowth: { radius: 0.14, hp: 0.20 },
  },

  // ---- Meta / persistence (Phase 6) ------------------------------------------
  // At end-of-life a share of the scrap you EARNED that run converts to permanent "cores",
  // banked to your local profile and spent on COSMETIC-ONLY unlocks (no power creep).
  meta: { coreRate: 0.10 },

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
    minScrapToCrown: 60,          // nobody is "the leader" until someone's actually rich
  },

  // ---- Bots (Phase 4 — the prove-it opponents) -------------------------------
  // Free-for-all AI ships that farm, fight, contest the pulsar, dodge telegraphs, and
  // evolve. They drive the SAME data weapons as the player via a synthesized input intent.
  bots: {
    count: 6,
    respawnDelaySec: 3.0,
    senseRange: 1150,             // notice enemies within this
    engageRange: 880,             // start fighting within this
    fleeHpFraction: 0.20,         // flee below this HP fraction (commit to fights longer)
    aggression: 0.88,             // 0 = farmer, 1 = always hunts
    aimErrorRad: 0.07,            // aim noise (higher = worse shots)
    decisionSec: 0.25,            // re-evaluate state this often (avoids jitter)
    telegraphDodgeChance: 0.6,    // chance to sidestep a detected charge/lunge aimed at them
    evolveBranchRandom: true,     // bots pick a random available branch on evolve
    // preferred fighting distance per family (px) — sniper kites, rammer dives, etc.
    preferredRange: { rail: 560, hammer: 90, grav: 470, flail: 240, dart: 360 },
  },

  // ---- Readability (gameplay-stakes, do not let these emerge by accident) ----
  readability: {
    yourShipCoreWhite: true,      // YOU always get the pure-white core ring; nobody else
    yourShipBloomScale: 1.4,      // you are the brightest thing on screen
    threatBloomScale: 1.0,        // scales up with carried scrap / level (rich = bright)
    threatBloomMax: 2.2,
    threatScrapForMax: 200,       // carried scrap at which your threat-glow maxes out
    enemyUltBackgroundDesat: 0.6, // enemy ult fires -> bg desaturates this much for a beat
    teamHueIsBodyRing: true,      // hue=team, silhouette+aura=class, brightness=threat
  },

  // ---- Combat reference ------------------------------------------------------
  combat: {
    ttkReferenceHits: 5,          // dial that decides twitchy vs grindy; keep TTK long
                                  // enough that VFX tells matter
    knockbackBase: 140,
    // A target is "high-momentum" if it's ramming OR moving (intent+impulse) at/above this speed.
    // Baseline move speed is ~280; lunges/dashes are far above. Used by the anti-charge counterplay
    // (rail Impulse Break, gravity damping, orb parry) so those punish reckless engages, not walking.
    highMomentumSpeed: 430,
  },

  // ---- Starter weapon: Popgun ------------------------------------------------
  // The level-0 Scout's gun. Phase 0's honest-VFX proof: the projectile's bloom
  // radius IS its collision radius — what you see glowing is exactly the hitbox.
  // Deliberately weak/simple; real class weapons replace it from level 3.
  popgun: {
    fireCooldownSec: 0.22,    // shots/sec cap; per-second so it's frame-rate independent
    projectileSpeed: 760,     // px/sec
    projectileRadius: 7,      // BLOOM = HITBOX. Render and collision both read this.
    projectileLifeSec: 1.4,   // despawn after this (range = speed * life)
    damage: 4,
    pierce: 1,                // neutral objects it can pass through before despawning
    color: "#bfe9ff",         // bright cyan-white tracer (starter palette, brightened)
  },

  // ---- Dropped scrap pickups (motes) ----------------------------------------
  // A broken object ejects motes that drift, then fly to you when you're in the
  // vicinity (vacuum), and collect on contact. Full pulsar-mote economy is Phase 2.
  pickups: {
    moteRadius: 5,
    moteDriftSpeed: 70,       // px/sec initial outward drift, damped over life
    moteLifeSec: 12,
    collectRadius: 150,       // VICINITY vacuum: get this close and motes fly to you
    vacuumSpeed: 620,         // px/sec pull once inside collectRadius (accelerates in)
    pulsarMoteSpeed: 190,     // pulsar motes eject faster (they spread from the core)
    pulsarMoteLifeSec: 7,     // and decay sooner — go get them fresh (the honeypot pull)
  },

  // ---- CLASS 1: Railship (precision sniper / line farmer / anti-large) -------
  // Lineage: descends from the old Lance weapon (Railpiercer -> Star Piercer).
  railship: {
    stats: { hp: 0.85, speed: 1.00, sizeMult: 0.92, difficulty: "medium-high" },
    charge: {
      // % thresholds and the shot they produce
      snapMax: 0.25,  focusMax: 0.75,  lanceMax: 1.00, // beyond 1.0 == overcharge
      damage: { snap: 8, focus: 20, lance: 42, overcharge: 70 },
      pierce: { snap: 1, focus: 3, lance: 6, overcharge: 9 },
      recoil: { snap: 0, focus: 40, lance: 120, overcharge: 220 },
      applyArmorCrackAt: "lance", // lance+ applies Armor Crack
      timeToFullSec: 1.05,        // hold-time from 0 -> 1.0 (full lance charge)
      overchargeCap: 1.25,        // hold past full into overcharge, clamped here
      // Hold at FULL charge and the core starts to redline: it glows hotter for overheatSec,
      // then OVERHEATS — dumps all charge (no shot), maxes heat, and forces a vent lockout.
      overheatSec: 8,             // seconds at full charge before it blows
      overheatVentSec: 1.6,       // vent-lockout penalty when it does
    },
    // The rail SHOT is a hitscan beam: instant line along aim, pierces N objects with
    // falloff. Honest VFX: beamHalfWidth IS the hitbox half-thickness (bloom matches it).
    beam: {
      maxRange: 1300,             // px the beam reaches
      halfWidth: 14,             // hitbox half-thickness == drawn beam glow half-width (forgiving to aim)
      visualSec: 0.16,           // how long the beam streak lingers (render only)
      knockback: 90,             // push imparted to things the beam hits
    },
    movementWhileCharging: { // multipliers by charge fraction
      to50: 1.00, to90: 0.85, to100: 0.70, overcharge: 0.55,
    },
    heat: {
      max: 100, tapShot: 8, halfCharge: 18, fullCharge: 35, overcharge: 55,
      decayPerSec: 22, ventStateAtMax: true, ventStateSec: 1.0,
    },
    ventDash: { heatReduction: 25, cooldownSec: 3,
                chargePreserveFraction: 0.60,   // keep 60% of charge through the dash (was: slash a flat 0.25)
                dashSpeed: 984, dashDurationSec: 0.18,        // +20% distance — a real reposition/escape
                chargeBoostSec: 0.4, chargeBoostMult: 1.25 }, // brief faster recharge right after the dash
    // Impulse Break — a FULL-charge rail shot on a high-momentum target kills its momentum and
    // interrupts the charge (Armor Crack still applies). The answer to a reckless straight-line rush.
    impulseBreak: { velocityReduction: 0.55, slow: 0.5, slowDurationSec: 0.4,
                    overchargeVelocityReduction: 0.75, overchargeSlowDurationSec: 0.6 },
    lineBreakHeatRefund: 20,       // LINE BREAK (3+ neutrals in one shot) also vents this much heat
    armorCrack: { baseDurationSec: 1.5, damageAmp: 0.15,
                  durationVs2xLarger: 2.25, durationVs4xLarger: 3.0 },
    pierceFalloff: { neutral: [1.0, 0.9, 0.8, 0.7], players: [1.0, 0.7, 0.45] },
    lineBreakThreshold: 3,
    // Tier mods applied by class id. Multipliers/values vs the base rail above.
    evolveMods: {
      lancer:      { rangeMult: 1.30, fullChargeDamageMult: 1.20, beamWidthMult: 0.82,
                     closeRange: 320, closeDamageMult: 0.70,          // weakerUpClose
                     perfectLineRangeFrac: 0.60, perfectLineBonus: 0.20 }, // perfectLine passive
      starPiercer: { rangeMult: 1.50, fullChargeDamageMult: 1.35, beamWidthMult: 0.72,
                     closeRange: 320, closeDamageMult: 0.70,
                     perfectLineRangeFrac: 0.60, perfectLineBonus: 0.20,
                     brokenCoreMarkSec: 2.0 },   // brokenCore: weak-point on cracked leaders (scaffold)
    },
  },

  // ---- CLASS 2: Hammerhead (rammer / bruiser / beginner aggression) ----------
  // New identity (no old-weapon equivalent). Impact melee; must not invalidate flail.
  hammerhead: {
    stats: { hp: 1.50, speed: 0.90, sizeMult: 1.28, difficulty: "easy-medium" },
    ram: {
      tapBashDamage: 10, chargedDamage: 34, overcommitDamage: 60,
      momentumMultiplier: 0.12,   // impactDamage = base + lunge-speed * this
      windupSec: 0.6, missRecoverySec: 0.9, turnRateDuringCharge: 0.3,
    },
    // Hold fire to wind up, release to LUNGE forward; contact during the lunge is the hit.
    // While lunging you shrug off rocks (you're the aggressor) — the farming style is "plow".
    // Windup scales BOTH damage (tap/charged/overcommit) AND dash distance: a fuller wind-up
    // lunges faster and glides longer. During the lunge drag is low (glideDampPerSec) so the
    // ship carries its momentum and the distance reads clearly.
    lunge: { chargeTimeSec: 0.7, speed: 1500, durationSec: 0.40, selfDamageReduction: 0.8,
             minLungeFactor: 0.28,      // tap-lunge speed/distance floor; windup scales up to 1.0
             glideDampPerSec: 1.5,      // low drag mid-lunge (vs player.impulseDampPerSec) = real glide
             cooldownSec: 1.2 },        // forced wait after a lunge ends — no ram-spam
    // Non-dash impact: the heavy hull bashes enemies you bump into BETWEEN dashes (gated so it's
    // a steady body-check, not a per-tick grind). Keeps Hammerhead threatening off cooldown.
    bodyCheck: { damage: 12, cooldownSec: 0.6, knockback: 90 },
    maulbreaker: { frontHitboxMult: 1.4, knockbackMult: 1.5 },        // biggerFrontHitbox/moreKnockback
    worldsplitterSlam: { radius: 230, damage: 40, knockback: 320 },   // full-lunge hit -> shockwave
    ability: "brace",             // "brace" (DR) or "brakeTurn" (redirect) — pick in code
    brace: { damageReduction: 0.5, durationSec: 0.8, cooldownSec: 6 },
    armorDent: { slow: 0.2, durationSec: 1.2 }, // Maulbreaker+ on charged impact
  },

  // ---- CLASS 3: Gravitor (asteroid control / indirect / zone) ----------------
  // Lineage: descends from Nova (Collapse/Event Horizon == Nova "pull-then-detonate").
  gravitor: {
    stats: { hp: 0.90, speed: 0.90, sizeMult: 1.02, difficulty: "medium" },
    well: {
      pullRadius: 440, enemyPull: 30, enemySlow: 0.10,
      launchSpeed: 660, launchDamage: 24,
      // ALL gravitor wells disrupt high-momentum targets: extra inward pull + momentum damping +
      // a brief slow, so a straight charge through the field is unreliable (not a root).
      highMomentumPullMult: 1.8, highMomentumDamping: 0.22, highMomentumSlow: 0.22,
    },
    // Orbital Shield — if a gravitor has a rock in orbit, it spends one to soak a heavy/charged hit.
    orbitalShield: { damageReduction: 0.55, heavyThreshold: 30 },
    // Captured rocks circle the hull until you launch them at the cursor. Farming style:
    // pull rocks, hurl them through OTHER rocks (orbitalHarvest pays bonus on those kills).
    orbit: { radius: 74, speed: 2.6 },          // visual/where captured rocks ride
    capture: { pullStrength: 1600 },            // px/sec² rocks are sucked in (snappy fill)
    thrownRockRadius: 22,                        // fallback launched-rock size (real throws use the rock's own radius)
    thrownRockHpMult: 2.5,                        // a launched rock's HP vs a normal one — shootable, but tanky
    orbitalHarvestBonus: 2,                      // bonus scrap when a thrown rock kills a neutral
    // Capacity + launch behaviour per tier — the artillery ramps HARD into Starfall.
    // cap = rocks held; per = rocks hurled per press; cd = seconds between launches.
    launchByClass: {
      gravitor:  { cap: 3, per: 1, cd: 0.45 },
      meteorist: { cap: 6, per: 2, cd: 0.22 },
      starfall:  { cap: 9, per: 3, cd: 0 },      // hold 9, hurl 3 at a time, NO cooldown
      // Branch B (control) — fewer rocks, the well itself is the weapon (tidalDrag).
      singularity:  { cap: 4, per: 1, cd: 0.5 },
      eventHorizon: { cap: 6, per: 2, cd: 0.35 },
    },
    // Singularity/Event Horizon passive: the well drags + SLOWS enemy ships inside it.
    tidalDrag: { pull: 240, slow: 0.45, radiusMult: 1.15 },
    momentumStrike: { medThrowBonus: 0.15, longThrowBonus: 0.30 }, // Meteorist+
    collapse: { channelSec: 1.0, detonationDelaySec: 0.4,          // Event Horizon
                damagePerStoredAsteroid: 14, dragDurationSec: 0.6 },
  },

  // ---- CLASS 4: Flailship (area melee / farming / anti-rush) -----------------
  // Lineage: the orbiting flail from day one + Tether's zoning.
  flailship: {
    stats: { hp: 1.00, speed: 0.92, sizeMult: 1.06, difficulty: "easy-medium" },
    // Commanded Chain Orb — a tethered orb that defends, then COMMITS on a throw cycle:
    //   ORBIT (resting): circles the hull as a defensive shield — low damage, blocks
    //     projectiles it touches, punishes divers. NOT the kill tool.
    //   THROW: fire (when off cooldown) shoots the orb out to the aimed point and it AUTO-RETURNS
    //     — high damage on the way out and back. It cannot be held out; then a longish cooldown.
    orb: {
      orbitRadius: 70,                  // defensive orbit distance (base rotational state)
      maxReach: 340,                    // chain length — every throw commits to THIS full range
      apexHangSec: 0.12,                // brief hang at full extension so the throw reads (not held)
      throwSpeed: 1700,                 // px/sec the orb travels OUT on a throw (snappy launch)
      recallSpeed: 1500,                // px/sec the orb retracts (+20% — snappier recall counterplay)
      throwCooldownSec: 1.4,            // gate after the orb returns — snappy but not spammy
      orbitSpeed: 3.2,                  // angular speed while circling in orbit mode
      sweepEase: 9,                     // how fast the airborne orb steers toward the cursor (per sec)
      tipRadius: 16,                    // the orb's own size == its hitbox == its block radius
      hitCooldownSec: 0.35,             // per-target re-hit gate so out-pass and back-pass each land once
      orbitDamage: 12,                  // ORBIT: low — it's a shield, not the kill tool
      throwDamage: 72,                  // THROW out: the big committed hit
      recallDamage: 44,                 // THROW back: the return sweep
    },
    swingControl: { burstSpeedMult: 2.2, durationSec: 0.6, cooldownSec: 4 }, // base ability: orb speed burst
    chainmaul: { orbRadiusMult: 1.25, contactDamageMult: 1.30 },             // largerOrb/longerChain
    // per-class orb mods (reach × damage) — branch A heavier, branch B wider defensive orbit.
    orbModByClass: {
      chainmaul:   { radiusMult: 1.25, dmgMult: 1.30 }, ironmoon:     { radiusMult: 1.28, dmgMult: 1.30 },
      graviflail:  { radiusMult: 1.30, dmgMult: 1.05 }, orbitCrusher: { radiusMult: 1.35, dmgMult: 1.10 },
    },
    powerSwing: { damageMult: 1.5, durationSec: 3, cooldownSec: 8 }, // Chainmaul+
    moonSlam: { chargeSec: 0.5, damage: 50, knockback: 260, splash: 0.3 }, // Ironmoon
    orbitLock: { durationSec: 4, cooldownSec: 9, radiusMult: 1.6 }, // Graviflail: wide defensive orbit (pins to orbit mode)
    // Orb Parry — if the orb is positioned between you and a charging attacker, it softens the ram
    // and bleeds the attacker's momentum. Position-based: the orb must be near the incoming hull.
    orbParry: { ramDamageReduction: 0.55, attackerVelocityReduction: 0.6, attackerSlow: 0.4, attackerSlowSec: 0.45, reach: 18 },
    gravityCrush: { radius: 200, dps: 30, pullSmallObjects: true }, // Orbit Crusher
  },

  // ---- Neutral farming objects ----------------------------------------------
  farming: {
    asteroidHP: 12, crystalHP: 22, debrisHP: 6,
    // honest hitboxes: each drawn blob radius == its collision radius
    asteroidRadius: 36, crystalRadius: 22, debrisRadius: 15,
    motesPerObject: { asteroid: 3, crystal: 4, debris: 2 }, // motes ejected on break
    // Ramming a neutral object hurts (honest mutual hitbox; the death-loop trigger in P1).
    contactDamage: { asteroid: 13, crystal: 7, debris: 4 },
    contactCooldownSec: 0.7,  // i-frames between contact ticks so you can peel off
    densityAtCenter: 0.4, densityAtEdge: 1.0, // edges are the calm farm; center is risk
    respawnSec: 8,
    // Arena-wide field (Phase 2): `count` objects placed by REJECTION SAMPLING weighted by
    // densityAtCenter→densityAtEdge, so the rim is the dense calm farm and the core is sparse
    // (you go to the middle for the pulsar + fights, not rocks). The gradient is emergent —
    // no authored rings. `weights` pick the type; the pulsar core is kept clear.
    field: { count: 320, weights: { asteroid: 5, crystal: 1, debris: 4 }, pulsarClearRadius: 380 },
  },

  // ---- FX (cosmetic feel — particles, beams, shake). Not balance, but kept here so
  // the whole feel is tunable from one place. ---------------------------------
  fx: {
    particleLifeSec: 0.6,
    hitParticles: 7,          // sparks when a beam chips an object
    breakParticles: 18,       // burst when an object is destroyed
    deathParticles: 36,       // burst on player death
    screenShakeMax: 16,       // px; recoil/impacts add shake, decays fast
    screenShakeDecayPerSec: 60,
    floatTextRiseSpeed: 46,   // px/sec a "LINE BREAK"/scrap number floats up
    floatTextLifeSec: 1.1,
  },
};
