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
    maxRenderFps: 60,        // explicit visual budget; fixed simulation remains 60Hz independently
    renderDprCap: 1.25,      // bloom is fill-rate bound; avoids 2.25× pixel cost from the old 1.5 cap
  },

  // ---- Arena & spatial model -------------------------------------------------
  // Uniform open field. Pulsar honeypot at center = richest scrap + PvP draw.
  // Asteroid density is highest mid-map, thinning toward calm farmable edges.
  // The risk gradient is EMERGENT from value placement, not authored rings.
  arena: {
    width: 6000,
    height: 6000,
    pulsarRadius: 220,            // visual + reference radius of the central black hole
    edgeSafeMargin: 800,          // outer band where asteroids are dense & PvP is rare
    spawnEdgeInset: 250,          // spawns land between this and edgeSafeMargin from the wall —
                                  // you wake up in the calm farming band, never at the pulsar brawl
    // The Pulsar is a BLACK HOLE: a gravity well that drags ships toward the core, a lethal
    // event horizon (touch it = death), and intermittent bipolar RELATIVISTIC JETS that fling
    // scrap far out along a slowly-rotating axis. Escapable at range, certain death near the core.
    pulsar: {
      lethalRadius: 55,           // touch the event horizon => instant death (the singularity)
      pullRadius: 900,            // gravity-well reach; pull ramps up sharply toward the core
      pullMaxSpeed: 340,          // px/sec peak inward drag (> baseSpeed 280 ⇒ inescapable close in)
      dangerRadius: 340,          // bots steer OUT of this band so they don't feed the hole
      jetIntervalSec: 6.5,        // seconds between jets — intermittent, not a steady stream
      jetMotes: 16,               // scrap motes per jet, split between the two poles (bipolar)
      jetScrapPerMote: 6,         // 16×6 = 96 scrap flung out per jet
      jetSpeed: 950,              // relativistic — motes streak far out along the axis
      jetLifeSec: 3.2,            // how long the jet motes fly before fading
      jetSpreadRad: 0.11,         // narrow cone (a beam, not a spray)
      jetAxisDriftRadPerSec: 0.3, // the jet axis slowly rotates, sweeping the map
    },
  },

  // ---- Player base -----------------------------------------------------------
  player: {
    baseHP: 130,                  // global durability floor — every class multiplies against this
    baseSpeed: 280,               // px/sec, the 100% reference for class multipliers
    baseRadius: 16,
    spawnProtectionSec: 3,        // brief invuln so TTK-to-fun < 10s holds
    scrapTrickleOnSpawn: 5,       // tiny seed so a fresh player is acting, not idle
    impulseDampPerSec: 9,         // how fast recoil/dash/knockback kicks bleed off
    // Inertia: thrust ACCELERATES toward the input direction instead of setting velocity.
    // accel = how fast you reach full speed (higher = snappier); coastDamp = how fast you
    // bleed off when you let go (lower = longer space-drift).
    inertia: { accelPerSec: 7.5, coastDampPerSec: 3.2 },
    // Cruise: hold one heading and the engines keep spooling past base speed. Turning hard
    // (input swings past ~53° = alignDot) dumps the bonus — speed is a commitment.
    cruise: { rampSec: 2.4, maxMult: 1.4, alignDot: 0.6, decayPerSec: 2.5 },
    respawnDelaySec: 1.7,         // wreck -> respawn wait
    regen: { delaySec: 5.0, perSec: 18 }, // passive regen after 5s of no weapon use
    // Spawn selection samples existing edge-band positions and chooses one with nearby shared
    // farmables. It gives every new life something to do immediately without minting private loot.
    spawnFarmSearch: { attempts: 12, radius: 520, minObjects: 3 },
  },

  // ---- Economy & death (greed model) ----------------------------------------
  // Scrap is the single currency. Earning it raises LEVEL (gates evolutions) AND
  // accumulates as carried scrap. Spending scrap on an evolution/upgrade LOCKS that
  // progress in (safe). Carried-but-unspent scrap is what you risk: die, drop a chunk.
  economy: {
    scrapPerAsteroid: 3,
    scrapPerCrystal: 6,           // higher-yield, rarer neutral object
    scrapPerDebris: 2,
    scrapPerTitan: 950,           // one titan ≥ level 15 (levelCurve L15 ≈ 925 xp) — a mountain worth mining
    // (pulsar scrap is now the black hole's relativistic jet — see arena.pulsar)
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
    // (ship size/HP/damage progression now lives in the top-level `scaling` block)
  },

  // ---- PROGRESSION SCALE (galactic-war dreadnoughts) -------------------------
  // Ships — AND their hitboxes — grow dramatically as you evolve, so a maxed ship DWARFS a fresh
  // one (the Revenge-of-the-Sith opening: huge dreadnoughts slug it out while fighters dart between
  // them). A bigger hitbox also means you WHIFF less as you invest — landing shots stops being the
  // barrier to playing on. Rank: starter=0, base class=1, tier-2=2, tier-3(final)=3.
  //   • HP scales with size (tanky) but sub-area, so a big ship is still killable by focused fire.
  //   • Damage scales with size too, so same-rank duels keep a sane TTK while a dreadnought
  //     devastates fighters (and fighters must dodge, not trade).
  //   • Maneuver (top speed + accel) tapers with size, so capital ships LUMBER and small ships
  //     dance around them — the David-vs-Goliath counterplay. Derived from radius so SP == MP.
  scaling: {
    sizeByRank:  [1.0, 1.5, 2.2, 3.1],    // radius (== hitbox == drawn hull) vs baseRadius, × family sizeMult
    hpByRank:    [1.0, 2.0, 3.6, 6.0],    // durability grows with hull, but less than area (still killable)
    dmgByRank:   [1.0, 1.8, 3.0, 4.8],    // bigger guns hit harder (keeps intra-rank TTK reasonable)
    rangeByRank: [1.0, 1.2, 1.45, 1.7],   // bigger weapons REACH further — beams, chain, lunge, grav field
    leaderSizeMult: 1.5,  leaderHpMult: 1.6,  leaderDmgMult: 1.4,  leaderRangeMult: 1.3,  // dominance → dreadnought
    maneuver: { fullSizeRadius: 62, minMult: 0.62 }, // speed+accel taper: 1.0 at baseRadius → minMult by this size
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
    engageRange: 700,             // start fighting within this (~on-screen, no offscreen hunts)
    fleeHpFraction: 0.20,         // flee below this HP fraction (commit to fights longer)
    aggression: 0.88,             // 0 = farmer, 1 = always hunts
    aimErrorRad: 0.09,            // base aim noise — grows with range and shrinks with skill
    decisionSec: 0.25,            // re-evaluate state this often (avoids jitter)
    // ---- human-ish aiming (bots track SNAPSHOTS of you, not your live position) ----
    reactionSec: 0.28,            // how often a bot's picture of your position refreshes (÷ skill)
    acquireSec: 0.55,             // hold-fire pause when a fresh target is picked up (÷ skill)
    aimTurnRadPerSec: 7.5,        // max aim swivel speed — no instant flicks (× skill)
    skillMin: 0.55, skillMax: 1.0, // per-bot skill rolled at spawn; scales reaction/error/swivel
    // don't open fire beyond ~a screen — you should always SEE who is shooting you
    fireRange: { rail: 800, hammer: 360, grav: 640, flail: 330, dart: 700 },
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

  // ---- First-minute guidance (presentation only; no scripted objectives) -----
  onboarding: {
    promptSec: 12,                // fades if the player has not collected scrap first
    targetSearchRadius: 650,      // how far the local guide may point to an existing neutral
    targetRingPulsePerSec: 2.2,   // visual cadence only
    showDevPanel: true,           // balance builds keep instant level-up + bot toggles accessible
  },

  // ---- Interface layout (presentation only) ---------------------------------
  ui: {
    panelRadius: 10,
    statusWidth: 270,
    abilitySlotWidth: 184,
    abilitySlotHeight: 54,
    minimapSize: 168,
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
    jetDrag: 0.25,            // relativistic jet motes coast (low drag) so they streak far out
  },

  // ---- CLASS 1: Railship (precision sniper / line farmer / anti-large) -------
  // Lineage: descends from the old Lance weapon (Railpiercer -> Star Piercer).
  railship: {
    stats: { hp: 0.85, speed: 1.00, sizeMult: 0.92, difficulty: "medium-high" },
    // Afterburner [Shift] — the sniper's escape hatch: a short hard burn (kick + big speed/accel
    // boost) that DUMPS heat into the gun. Escaping costs you your next shots — pick one.
    afterburner: { durationSec: 0.9, speedMult: 1.9, accelMult: 2.2, kick: 260, heatCost: 30, cooldownSec: 5 },
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
      // Range damage falloff — the anti cross-map 2-tap. Full damage out to fullRangeFrac of
      // maxRange (~390px, the band where a flail/hammer can actually close), then linear down
      // to minMult at the tip. Edge-of-screen shots become pokes, point-blank stays lethal so
      // rail still feels great. The beam OPACITY fades along its length to match (honest tell).
      rangeFalloff: { fullRangeFrac: 0.30, minMult: 0.35 },
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
    evolveMods: {},   // tier-2 rails now have their OWN weapons (helionBeam / mawRail) — no stat-mod evolutions
    brokenCoreMarkSec: 2.0,   // Star Piercer special: weak-point mark duration on cracked leaders
    // Star Piercer siege maw (branch B weapon). Charging OPENS the cannon — beam width IS
    // maw width. Release fires ONE instantaneous blast: all the damage lands the frame you
    // let go, along the aim you committed to. Fired, not steered — miss = recycle wasted.
    mawRail: {
      chargeTimeSec: 1.9,             // much slower than the base rail's 1.05 — siege pacing
      minChargeToFire: 0.3,           // release below this fizzles (no beam, no heat)
      minHalfWidth: 10, maxHalfWidth: 34,   // beam half-thickness at min/full charge (hitbox == visual)
      range: 980,
      damageAtMin: 40, damageAtFull: 120,  // ONE instant blast. Deliberately just UNDER a tier-2
                                           // rail's ~133hp — devastating, never a full-HP one-shot
      beamVisualSec: 0.22,            // how long the flash lingers on screen (render only)
      pierce: 6,                      // targets the wide blast chews through
      heatCost: 38,                   // heat per shot at full charge (scales with charge)
      recycleSec: 1.4,                // lockout after firing — the "slower firerate"
      recoil: 260,
      crackAtCharge: 0.85,            // blasts fired at/above this charge apply Armor Crack
      // STARBREAK (tier-3 final) only: a strong-enough blast tears a RIFT along the shot line —
      // a glowing scar that lingers delaySec, then collapses and detonates the corridor. A miss
      // is no longer nothing: it's area denial. Same width feel as the blast, honest hitbox.
      rift: { minCharge: 0.6, delaySec: 0.6, damage: 45, halfWidth: 26, knockback: 130, maxActive: 2 },
    },
  },

  // ---- CLASS 2: Hammerhead (rammer / bruiser / beginner aggression) ----------
  // New identity (no old-weapon equivalent). Impact melee; must not invalidate flail.
  hammerhead: {
    stats: { hp: 1.50, speed: 0.90, sizeMult: 1.28, difficulty: "easy-medium" },
    ram: {
      tapBashDamage: 10, chargedDamage: 34, overcommitDamage: 60,
      momentumMultiplier: 0.12,   // impactDamage = base + lunge-speed * this
      windupSec: 0.6, missRecoverySec: 0.9, turnRateDuringCharge: 0.42,
    },
    // Hold fire to wind up, release to LUNGE forward; contact during the lunge is the hit.
    // While lunging you shrug off rocks (you're the aggressor) — the farming style is "plow".
    // Windup scales BOTH damage (tap/charged/overcommit) AND dash distance: a fuller wind-up
    // lunges faster and glides longer. During the lunge drag is low (glideDampPerSec) so the
    // ship carries its momentum and the distance reads clearly.
    lunge: { chargeTimeSec: 0.7, speed: 1500, durationSec: 0.48, selfDamageReduction: 0.8,
             hitboxMult: 1.12,        // slight active-ram forgiveness; procedural nose visual covers this area
             minLungeFactor: 0.28,      // tap-lunge speed/distance floor; windup scales up to 1.0
             glideDampPerSec: 1.5,      // low drag mid-lunge (vs player.impulseDampPerSec) = real glide
             cooldownSec: 1.2 },        // forced wait after a lunge ends — no ram-spam
    // Non-dash impact: the heavy hull bashes enemies you bump into BETWEEN dashes (gated so it's
    // a steady body-check, not a per-tick grind). Keeps Hammerhead threatening off cooldown.
    bodyCheck: { damage: 12, cooldownSec: 0.6, knockback: 90 },
    maulbreaker: { frontHitboxMult: 1.5, knockbackMult: 1.5 },        // evolved hammer nose is wider, not harder
    worldsplitterSlam: { radius: 230, damage: 40, knockback: 320 },   // full-lunge hit -> shockwave
    ability: "brace",             // "brace" (DR) or "brakeTurn" (redirect) — pick in code
    brace: { damageReduction: 0.5, durationSec: 0.8, cooldownSec: 6 },
    armorDent: { slow: 0.2, durationSec: 1.2 }, // Maulbreaker+ on charged impact
  },

  // ---- CLASS 2b: Helion (rail branch A — the sustain beam) --------------------
  // A solar furnace: hold the trigger for a continuous beam whose damage RAMPS over
  // time — and whose heat cost accelerates with the ramp. The fantasy is greed with a
  // fuse: the longer you stay on target the scarier you get, until the bar maxes and
  // the gun force-vents.
  helion: {
    stats: { hp: 0.85, speed: 0.97, sizeMult: 0.94, difficulty: "medium" },
    beam: {
      range: 680, halfWidth: 6,        // thin, honest hitbox (bloom matches)
      dpsBase: 24, dpsMax: 82,         // ramp start -> full fury
      rampSec: 2.6,                    // trigger-time to reach dpsMax
      rampDownPerSec: 1.6,             // ramp fraction lost per second off-trigger
      pierce: 3,
      // NOTE: family heat DECAYS at railship.heat.decayPerSec (22) even while firing — these
      // are gross rates. Net: ramp-0 beam is heat-sustainable (-10/s), full fury builds +24/s
      // so ~4s of max beam forces the vent. Greed has a fuse.
      heatPerSecBase: 12, heatPerSecMax: 46,
      overheatVentSec: 1.4,            // forced vent lockout when the beam maxes heat
      crackAtRamp: 0.85,               // fully-ramped beam applies Armor Crack
    },
    // SUPERNOVA (tier-3 final) [E] FLARE NOVA: dump the ENTIRE heat bar as an expanding
    // blast — damage scales with heat spent, and it CLEARS a vent lockout (the fuse becomes
    // the weapon). Spent heat is spent beam uptime, so it's a real decision — and enemies
    // can force an early, weak nova by pressuring the bar.
    supernova: { minHeat: 25, baseDamage: 20, damagePerHeat: 0.9, radius: 240,
                 edgeFalloff: 0.55,     // damage fades to (1 - this) at the rim
                 knockback: 300, cooldownSec: 9 },
  },

  // ---- CLASS 3: Gravitor (asteroid control / indirect / zone) ----------------
  // Lineage: descends from Nova (Collapse/Event Horizon == Nova "pull-then-detonate").
  gravitor: {
    stats: { hp: 0.90, speed: 0.90, sizeMult: 1.02, difficulty: "medium" },
    well: {
      pullRadius: 440, enemyPull: 30, enemySlow: 0.10,
      launchSpeed: 660, launchDamage: 24,
    },
    // Orbiting rocks are a melee HAZARD, not a force field: touch one and it deals a thrown
    // rock's damage (well.launchDamage) and shatters. A committed rusher gets through — paying
    // HP per rock — instead of being momentum-stalled forever.
    orbitContact: { knockback: 150, rehitSec: 0.35 },   // rehit = per-enemy grace so a dive costs ~1-2 rocks, not the whole ring at once
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
      starfall:  { cap: 5, per: 2, cd: 0.15 },   // holds five visible meteors; staggered volley stays dodgeable
      // Branch B (control) — fewer rocks, the well itself is the weapon (tidalDrag).
      singularity:  { cap: 4, per: 1, cd: 0.5 },
      eventHorizon: { cap: 6, per: 2, cd: 0.35 },
    },
    // DUST ACCRETION — the anti-sitting-duck floor. When the well is below capacity and
    // there is NOTHING capturable in range, it condenses a small PEBBLE from dust every
    // intervalSec (max maxPebbles held). Pebbles hit for pebbleDamageMult — a real asteroid
    // is always strictly better, so terrain still matters; you're just never disarmed.
    accretion: { intervalSec: 3.2, maxPebbles: 2, pebbleRadius: 12, pebbleDamageMult: 0.55 },
    // SHATTER RECYCLING — a thrown rock that dies leaves a real debris fragment in the world
    // with this chance. Your volleys partially reseed the battlefield (for everyone).
    recycle: { fragmentChance: 0.5, fragmentRadiusMult: 0.6, maxWorldObjects: 380 },  // hard cap: recycling never floods the map
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
    // MOMENTUM MACE — a spiked mace that TRAILS behind the ship at rest on a slack chain.
    //   HOLD fire: RADIAL MOMENTUM — the mace swings around the hull, faster and faster.
    //   RELEASE:   FLING at the cursor — cast speed AND damage scale with banked momentum.
    // A panic tap is a slow, weak lob; a full spin-up is a cannonball. The mace still blocks
    // enemy shots in every state.
    orb: {
      tipRadius: 16,                    // the mace head's size == hitbox == block radius
      spikes: 7,                        // render: spike count on the head (it's a MACE, not a ball)
      trailDistance: 55,                // slack chain length while trailing (resting state)
      trailFollowPerSec: 7,             // how snappily the trailing mace tucks in behind the hull
      trailDamage: 6,                   // dragging the mace across something still stings
      spinRadius: 74,                   // swing-circle radius while spinning up
      spinUpSec: 1.6,                   // faster access so close-range ships can threaten before being kited out
      spinSpeedMin: 3.0, spinSpeedMax: 11.5,   // rad/sec at momentum 0 -> 1
      spinDamageMin: 9, spinDamageMax: 30,     // contact damage while swinging, by momentum
      maxReach: 390,                    // chain length — lets a committed fling contest mid-range spacing
      releaseSweepRadPerSec: 13,        // min swing speed while releasing — the mace SWINGS to the
                                        // cursor line and lets go (hammer-throw), never teleports
      flingSpeedMin: 520, flingSpeedMax: 1800, // cast speed scales with momentum
      flingDamageMin: 20, flingDamageMax: 88,  // fling payload scales with momentum
      recallSpeed: 1500,                // px/sec the mace retracts after a fling
      recallDamageFrac: 0.55,           // the return sweep hits for this fraction of fling damage
      rethrowDelaySec: 0.5,             // beat after the mace re-seats before it can spin again
      hitCooldownSec: 0.35,             // per-target re-hit gate for trail/spin contact
    },
    swingControl: { burstSpeedMult: 2.2, durationSec: 0.6, cooldownSec: 4 }, // base ability: spin-up burst
    // TWINMAUL (the single lvl-8 upgrade): two maces on two chains, opposite phase.
    // LMB release = hammer-throw physics naturally staggers them into a one-two volley;
    // RMB = forced synchronized windup, BOTH fling at once. Per-head damage trimmed so the
    // pair lands ~1.6x a single mace, not 2x.
    twin: { dmgMult: 0.8, syncWindupSec: 0.18 },
    // Static Lash [E]: stun pulse around EACH mace head — scrambles charge-ups (rail charge,
    // ram windup, beam ramp, spin momentum), locks ability/special for a beat, brief hard stun.
    // Radius is around the MACES, not the ship: placement is the skill.
    staticLash: { radius: 150, stunSec: 0.7, damage: 10, abilityLockSec: 2.0, cooldownSec: 9 },
    // BINARY STAR (tier-3 final): the two maces are linked by a LIVE ENERGY TETHER. Anything
    // crossing the line between the heads takes ticking damage and is dragged toward it —
    // and a synced (RMB) throw turns the tether into a GARROTE: both effects amplified while
    // the heads are in flight. You fence space and CATCH people, not just swing.
    binaryStar: {
      tether: { halfWidth: 16, damage: 10, rehitSec: 0.35, pull: 220,
                thrownPullMult: 2.4, thrownDmgMult: 1.7 },
      // Tier-3 final: the two maces become BLADES — they swing FASTER, reach FURTHER, and hit
      // HARDER than the Twinmaul heads. Applied as multipliers over F.orb. They still block
      // projectiles (the block radius scales up with the blade size). Tune in playtest.
      blade: { spinMult: 1.4, reachMult: 1.35, dmgMult: 1.4, sizeMult: 1.3 },
    },
    // Orb Parry — if the orb is positioned between you and a charging attacker, it softens the ram
    // and bleeds the attacker's momentum. Position-based: the orb must be near the incoming hull.
    orbParry: { ramDamageReduction: 0.55, attackerVelocityReduction: 0.6, attackerSlow: 0.4, attackerSlowSec: 0.45, reach: 18 },
  },

  // ---- Neutral farming objects ----------------------------------------------
  farming: {
    asteroidHP: 12, crystalHP: 22, debrisHP: 6, titanHP: 9000,
    // honest hitboxes: each drawn blob radius == its collision radius
    asteroidRadius: 36, crystalRadius: 22, debrisRadius: 15, titanRadius: 170,
    motesPerObject: { asteroid: 3, crystal: 4, debris: 2, titan: 48 }, // motes ejected on break
    // Ramming a neutral object hurts (honest mutual hitbox; the death-loop trigger in P1).
    contactDamage: { asteroid: 13, crystal: 7, debris: 4, titan: 14 },
    contactCooldownSec: 0.7,  // i-frames between contact ticks so you can peel off
    densityAtCenter: 0.4, densityAtEdge: 1.0, // edges are the calm farm; center is risk
    respawnSec: 8,
    // Arena-wide field (Phase 2): `count` objects placed by REJECTION SAMPLING weighted by
    // densityAtCenter→densityAtEdge, so the rim is the dense calm farm and the core is sparse
    // (you go to the middle for the pulsar + fights, not rocks). The gradient is emergent —
    // no authored rings. `weights` pick the type; the pulsar core is kept clear.
    field: { count: 320, weights: { asteroid: 5, crystal: 1, debris: 4 }, pulsarClearRadius: 380 },
    // TITANS — the landmark obstacles. Massive, immovable, EXTREMELY tanky asteroids that
    // pay out a fortune (scrapPerTitan ≈ level 15 in one kill) after minutes of focused
    // fire. Few enough to be landmarks, never clutter; placement is CENTER-BIASED (the
    // inverse of the normal field) so the risky mid-map is where the mountains live.
    // They block beams/thrown rocks (they're hittable), can't be gravity-captured, and
    // don't budge from knockback — you play AROUND them.
    titans: { count: 7, respawnSec: 300, minSeparation: 900, minDistFromPulsar: 520,
              centerBias: 2.0 },   // higher = tighter clustering toward mid-map
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
    objectHitParticles: 11,       // neutral hits must read through the dark arena
    objectBreakParticles: 28,     // stronger payoff when a farmable breaks
  },
};
