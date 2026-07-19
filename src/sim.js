// PULSAR.io — SIM (headless authoritative world). Phase 5 split point.
// This is the WHOLE simulation with NO render / input / canvas / DOM — a faithful extraction of
// the sim half of game.js. It runs identically in the browser (single-player) and on Node (the
// authoritative server). FX is INJECTED (`fx`) so the server can record cosmetic events while the
// browser plays them directly. There is no "local player" here: ships are driven by intents you
// set from outside (network or input for players; the AI for bots).
//
//   const world = PULSAR.createWorld({ fx });
//   const me = world.addShip({ isBot: false });
//   world.setIntent(me.id, { moveX, moveY, aim, aimDist, firing, ability, special });
//   world.step(1/60);            // advance one tick
//   world.snapshot();            // serialize for clients
(function () {
  const cfg = PULSAR.config;
  const eco = cfg.economy;
  const pk = cfg.pickups;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hueFor = PULSAR.weaponHue;

  const OBJDEF = {
    asteroid: { hp: 'asteroidHP', radius: 'asteroidRadius', scrap: 'scrapPerAsteroid', hue: '#6b7280' },
    crystal:  { hp: 'crystalHP',  radius: 'crystalRadius',  scrap: 'scrapPerCrystal',  hue: '#5eead4' },
    debris:   { hp: 'debrisHP',   radius: 'debrisRadius',   scrap: 'scrapPerDebris',   hue: '#7b8694' },
    titan:    { hp: 'titanHP',    radius: 'titanRadius',    scrap: 'scrapPerTitan',    hue: '#9aa7c2' },
  };
  const EVO_GATES = [eco.levelChooseClass, eco.levelChoosePath, eco.levelFinalEvolution];   // tree ends at tier-3 finals
  const EVO_COSTS = [eco.evolutionCosts.class, eco.evolutionCosts.path, eco.evolutionCosts.final];
  // Candidate points for the calm outer asteroid band. The world chooses a useful candidate
  // after its shared field exists — no player receives bespoke/private farm resources.
  function edgeSpawnCandidate() {
    const A = cfg.arena, inset = A.spawnEdgeInset;
    const depth = inset + Math.random() * (A.edgeSafeMargin - inset);
    switch (Math.floor(Math.random() * 4)) {
      case 0: return { x: inset + Math.random() * (A.width - inset * 2), y: depth };
      case 1: return { x: inset + Math.random() * (A.width - inset * 2), y: A.height - depth };
      case 2: return { x: depth, y: inset + Math.random() * (A.height - inset * 2) };
      default: return { x: A.width - depth, y: inset + Math.random() * (A.height - inset * 2) };
    }
  }
  const IMPLEMENTED = new Set(['starter', 'railship', 'helion', 'starPiercer', 'supernova', 'starbreak',
    'hammerhead', 'maulbreaker', 'worldsplitter', 'gravitor', 'meteorist', 'starfall',
    'singularity', 'eventHorizon', 'flailship', 'twinmaul', 'binaryStar']);
  const FAMILY = {
    starter: 'dart',
    railship: 'rail', helion: 'rail', starPiercer: 'rail', supernova: 'rail', starbreak: 'rail',
    hammerhead: 'hammer', maulbreaker: 'hammer', worldsplitter: 'hammer',
    gravitor: 'grav', meteorist: 'grav', starfall: 'grav', singularity: 'grav', eventHorizon: 'grav',
    flailship: 'flail', twinmaul: 'flail', binaryStar: 'flail',
  };
  const EVOLVE_BLURB = {
    railship: 'charge beam · heat · Vent Dash', hammerhead: 'wind-up lunge · Brace',
    gravitor: 'auto-pulls rocks · condenses PEBBLES when dry', flailship: 'SPIKED MACE — hold to SPIN UP, release to fling',
    helion: 'SUSTAIN BEAM — dmg ramps while held, heat compounds', starPiercer: 'SIEGE MAW — charge WIDENS the beam · BROKEN CORE [E]',
    maulbreaker: '+ram reach · +knockback', worldsplitter: 'full-lunge SHOCKWAVE · slam burst [E]',
    meteorist: 'holds 3 rocks · harder throws', starfall: 'hold 9, hurl 3, no cooldown · BARRAGE [E]',
    singularity: 'well SLOWS enemies (tidal drag)', eventHorizon: 'COLLAPSE the well [E]',
    twinmaul: 'TWO maces — LMB volley · RMB both at once · STATIC LASH [E]',
    supernova: 'FLARE NOVA [E] — dump ALL heat as a blast · clears vent lockout',
    starbreak: 'blasts tear a RIFT that detonates the line moments later',
    binaryStar: 'live TETHER between the maces — crossing it burns · garrote throws',
  };

  function classNode(id) { return PULSAR.classes[id]; }
  function childrenOf(id) { const out = []; for (const k in PULSAR.classes) if (PULSAR.classes[k].parentId === id && IMPLEMENTED.has(k)) out.push(PULSAR.classes[k]); return out; }

  // A no-op FX sink (default if none injected) — every method is harmless.
  const NULL_FX = { spawnParticles() {}, spawnBeam() {}, spawnText() {}, addShake() {}, update() {} };

  PULSAR.createWorld = function (opts) {
    opts = opts || {};
    const fx = opts.fx || NULL_FX;
    const fxStamp = typeof fx.stampPlane === 'function' ? fx.stampPlane.bind(fx) : function () {};   // plane attribution (no-op if the fx impl predates it, e.g. test stubs)
    const onKill = opts.onKill || null;   // (victim, killer) — fired at kill time, scrap/leader still intact
    let nextId = 1;

    const state = {
      time: 0, pulsarTimer: cfg.arena.pulsar.jetIntervalSec,
      ships: [], projectiles: [], objects: [], motes: [], respawns: [],
    };
    // Balance instrumentation. It records resolved ship damage (after mitigation), is not sent
    // over the network, and keeps tuning evidence at the authoritative sim boundary.
    const telemetry = { damageToShips: Object.create(null), shipHits: Object.create(null) };
    function recordShipDamage(source, amount) {
      if (!source || !source.classId || amount <= 0) return;
      telemetry.damageToShips[source.classId] = (telemetry.damageToShips[source.classId] || 0) + amount;
      telemetry.shipHits[source.classId] = (telemetry.shipHits[source.classId] || 0) + 1;
    }

    function makeShip(o) {
      return {
        id: o.id != null ? o.id : nextId++,
        isShip: true, isBot: !!o.isBot, team: o.team, classId: o.classId || 'starter',
        skin: o.skin || null,  // cosmetic livery id (data/cosmetics.js) — render-only, zero stat effect
        plane: o.plane || 0,   // dormant partition plumbing (always 0 since the Titan-plane removal, 2026-07-19)
        x: o.x, y: o.y, px: o.x, py: o.y, vx: 0, vy: 0, impX: 0, impY: 0,
        aim: o.aim != null ? o.aim : -Math.PI / 2,
        radius: cfg.player.baseRadius, maxHp: cfg.player.baseHP, hp: cfg.player.baseHP,
        classStats: { hp: 1, speed: 1, sizeMult: 1 },
        scrap: cfg.player.scrapTrickleOnSpawn, xp: cfg.player.scrapTrickleOnSpawn, level: 1,
        isLeader: false, scaled: false, kills: 0,
        spawnProtect: cfg.player.spawnProtectionSec, hitFlash: 0, contactCd: 0, abilityCd: 0, specialCd: 0,
        slow: 0, slowTimer: 0, alive: true, respawnTimer: 0,
        shield: 0, shieldMax: 0, shieldRegenDelay: 0, shieldRegenRate: 0, shieldHitTimer: 0, shieldFlash: 0,   // deflector (dreadnought)
        charge: 0, charging: false, heat: 0, ventTimer: 0, chargeFullTimer: 0,
        ramWinding: false, ramCharge: 0, ramActive: 0, ramHitList: [], ramHitBase: 0, ramFull: false, ramSlammed: false,
        captured: [], orbSpin: 0, orbAngle: 0, orbRadius: null, orbX: o.x, orbY: o.y, orbState: 'trail', orbCd: 0,
        orbBurstTimer: 0, braceTimer: 0, fireTimer: 0,
        cracked: false, crackTimer: 0, combatTimer: 0,
        ai: null,   // bot AI state is owned + lazily initialized by src/bots.js
        _intent: null,
      };
    }

    const enemiesOf = (ship) => { const out = []; for (const s of state.ships) if (s !== ship && s.alive && s.team !== ship.team && (s.plane | 0) === (ship.plane | 0)) out.push(s); return out; };

    // ---- class identity / stats ----
    function applyClassStats(s, heal) {
      const node = classNode(s.classId);
      const st = (cfg[node.configKey] && cfg[node.configKey].stats) ? cfg[node.configKey].stats : { hp: 1, speed: 1, sizeMult: 1 };
      s.classStats = st;
      // PROGRESSION SCALE: bigger hull+hitbox, HP, and damage by rank (starter=0 … final=3),
      // then a dreadnought bump for dominance-scaled leaders.
      const sc = cfg.scaling;
      const rank = rankOf(s);
      let r = cfg.player.baseRadius * (st.sizeMult || 1) * sc.sizeByRank[rank];
      let hpMax = cfg.player.baseHP * (st.hp || 1) * sc.hpByRank[rank];
      let dmgMult = sc.dmgByRank[rank], rangeMult = sc.rangeByRank[rank];
      if (s.scaled) { r *= sc.leaderSizeMult; hpMax *= sc.leaderHpMult; dmgMult *= sc.leaderDmgMult; rangeMult *= sc.leaderRangeMult; }
      s.radius = r; s.maxHp = hpMax; s.hp = heal ? hpMax : Math.min(s.hp, hpMax);
      s.dmgMult = dmgMult; s.rangeMult = rangeMult;
    }
    // Maneuver (top-speed + accel) multiplier from hull size: capital ships lumber, fighters dart.
    // Pure function of radius so single-player and the MP predictor agree with no extra sync.
    function maneuverFor(radius) {
      const m = cfg.scaling.maneuver, br = cfg.player.baseRadius;
      const k = (radius - br) / Math.max(1, m.fullSizeRadius - br);
      return Math.max(m.minMult, Math.min(1, 1 - (1 - m.minMult) * k));
    }
    function resetClassState(s) {
      s.charge = 0; s.charging = false; s.heat = 0; s.ventTimer = 0; s.chargeFullTimer = 0;
      s.beamRamp = 0; s.beamTimer = 0; s.beamWidth = 0; s.beamPower = 0;
      s.ramWinding = false; s.ramCharge = 0; s.ramActive = 0; s.ramHitList = [];
      s.captured = []; s.orbSpin = 0; s.orbAngle = 0; s.orbRadius = null; s.orbX = s.x; s.orbY = s.y; s.maces = null; s.spinFrac = 0;
      s.orbState = 'trail'; s.spinFrac = 0; s.flingPower = 0; s.orbCd = 0;
      s.orbBurstTimer = 0; s.braceTimer = 0; s.fireTimer = 0;
      s.rifts = null; s.tetherTouch = null;   // tier-3 state (Starbreak scars / Binary Star tether)
    }
    function switchClass(s, id) {
      s.classId = id; resetClassState(s); applyClassStats(s, true);
      fx.spawnText(s.x, s.y - 52, (s.isBot ? '' : 'EVOLVED → ') + classNode(id).displayName, '#7be0ff', { size: s.isBot ? 13 : 19 });
      if (!s.isBot && EVOLVE_BLURB[id]) fx.spawnText(s.x, s.y - 32, EVOLVE_BLURB[id], '#cfeaff', { size: 12 });
      fx.spawnParticles(s.x, s.y, 30, hueFor(id), { speed: 320 });
      if (!s.isBot) fx.addShake(11, s.id);
    }

    // ---- progression ----
    function levelForXp(xp) { return xp <= 0 ? 1 : 1 + Math.floor(Math.pow(xp / eco.levelCurve.k, 1 / eco.levelCurve.exp)); }
    function xpForLevel(L) { return eco.levelCurve.k * Math.pow(L - 1, eco.levelCurve.exp); }
    function updateLevel(s) {
      const nl = levelForXp(s.xp);
      if (nl <= s.level) return;
      s.level = nl;
      if (!s.isBot && s.alive) fx.spawnText(s.x, s.y - 40, 'LEVEL ' + s.level, '#bfe9ff', { size: 16 });
      const sc = s.level >= eco.levelLeaderScaling;
      if (sc !== s.scaled) { s.scaled = sc; applyClassStats(s, true); if (sc && !s.isBot) fx.spawnText(s.x, s.y - 64, '★ SCALED ★', '#ffd98a', { size: 20 }); }
    }
    function earn(s, amount) { s.scrap += amount; s.xp += amount; updateLevel(s); }
    function evolveOptions(s) {
      const t = classNode(s.classId).tier;
      const optsArr = childrenOf(s.classId);   // finals (tier 3) have no children -> null below
      if (!optsArr.length) return null;
      return { tier: t, gate: EVO_GATES[t], cost: EVO_COSTS[t], levelOk: s.level >= EVO_GATES[t], options: optsArr };
    }
    function chooseEvolution(s, i) {
      const e = evolveOptions(s);
      if (!e || !e.levelOk || !s.alive) return;
      const choice = e.options[i];
      if (!choice || s.scrap < e.cost) return;
      s.scrap -= e.cost; switchClass(s, choice.id);
    }
    function botMaybeEvolve(b) {
      const e = evolveOptions(b);
      if (!e || !e.levelOk || b.scrap < e.cost) return;
      chooseEvolution(b, Math.floor(Math.random() * e.options.length));
    }

    // ---- neutral-object field ----
    const af = cfg.farming.field;
    const TYPEBAG = (() => { const b = []; for (const k in af.weights) for (let i = 0; i < af.weights[k]; i++) b.push(k); return b; })();
    function pickType() { return TYPEBAG[Math.floor(Math.random() * TYPEBAG.length)]; }
    function densityAt(x, y) { const t = Math.min(1, Math.hypot(x - cfg.arena.width / 2, y - cfg.arena.height / 2) / (cfg.arena.width / 2)); return lerp(cfg.farming.densityAtCenter, cfg.farming.densityAtEdge, t); }
    // `plane` is bookkeeping only — the two rects are 8000px apart, so every distance check in the
    // game (capture, contact, hittables, MP culling) already separates them geometrically. It's
    // carried so a destroyed rock respawns into the field it came from.
    function addObject(type, x, y, plane) {
      const hp = cfg.farming[OBJDEF[type].hp];
      state.objects.push({ type, x, y, px: x, py: y, vx: 0, vy: 0, plane: plane | 0, radius: cfg.farming[OBJDEF[type].radius], hp, maxHp: hp, spin: Math.random() * TAU, spinRate: (Math.random() - 0.5) * 0.8, flash: 0, cracked: false, crackTimer: 0 });
    }
    // Hull rank (starter=0 … Titan apex=4) — drives progression scaling AND the rock-plow rule.
    function rankOf(s) {
      const n = classNode(s.classId);
      return Math.min(s.classId === 'starter' ? 0 : (n ? n.tier : 0), cfg.scaling.sizeByRank.length - 1);
    }
    // Pick the best of several valid edge spawns by counting real nearby farmables. This keeps
    // time-to-fun under ten seconds while respecting the shared, emergent economy.
    function edgeSpawn() {
      const sc = cfg.player.spawnFarmSearch;
      let best = edgeSpawnCandidate(), bestCount = -1;
      for (let i = 0; i < sc.attempts; i++) {
        const p = edgeSpawnCandidate(); let count = 0;
        for (const o of state.objects) if (o.type !== 'titan' && Math.hypot(o.x - p.x, o.y - p.y) <= sc.radius) count++;
        if (count > bestCount) { best = p; bestCount = count; if (count >= sc.minObjects) break; }
      }
      return best;
    }
    function spawnArenaObject() {
      const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
      for (let t = 0; t < 24; t++) { const x = Math.random() * cfg.arena.width, y = Math.random() * cfg.arena.height; if (Math.hypot(x - cx, y - cy) < af.pulsarClearRadius) continue; if (Math.random() <= densityAt(x, y)) { addObject(pickType(), x, y, 0); return; } }
      addObject(pickType(), Math.random() * cfg.arena.width, Math.random() * cfg.arena.height, 0);
    }
    function ejectMotes(x, y, count, valueEach, o) {
      o = o || {};
      const speed = o.speed != null ? o.speed : pk.moteDriftSpeed, life = o.life != null ? o.life : pk.moteLifeSec;
      for (let i = 0; i < count; i++) {
        const a = o.angle != null ? o.angle + (Math.random() - 0.5) * 2 * (o.spread || 0)   // directed cone (jet)
                : o.evenIndex != null ? (i / count) * TAU + Math.random() * 0.3
                : Math.random() * TAU;
        const sp = o.jet ? speed * (0.85 + Math.random() * 0.3) : speed;
        state.motes.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, value: valueEach, pulsar: !!o.pulsar, jet: !!o.jet });
      }
    }

    // ---- damage ----
    function damageObject(o, dmg, opts) {
      opts = opts || {};
      o.hp -= dmg * (o.cracked ? (1 + cfg.railship.armorCrack.damageAmp) : 1);
      o.flash = 0.12;
      if (opts.crack) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
      if (opts.knockback && o.type !== 'titan') { o.vx += (opts.dx || 0) * opts.knockback; o.vy += (opts.dy || 0) * opts.knockback; }
      fx.spawnParticles(o.x, o.y, cfg.fx.objectHitParticles, OBJDEF[o.type].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 190 });
      if (o.hp <= 0) breakObject(o);
    }
    function damageThrownRock(r, dmg, opts) {
      opts = opts || {};
      r.hp -= dmg;
      fx.spawnParticles(r.x, r.y, cfg.fx.hitParticles, (OBJDEF[r.rockType] || OBJDEF.asteroid).hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
      if (r.hp <= 0) r._broken = true;
    }
    function crackObject(o) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
    function breakObject(o) {
      const total = eco[OBJDEF[o.type].scrap], n = cfg.farming.motesPerObject[o.type];
      ejectMotes(o.x, o.y, n, total / n, o.type === 'titan' ? { life: 30, speed: 150, evenIndex: true } : undefined);
      fx.spawnParticles(o.x, o.y, cfg.fx.objectBreakParticles, OBJDEF[o.type].hue, { speed: 290, size: 3.3 });
      const idx = state.objects.indexOf(o); if (idx >= 0) state.objects.splice(idx, 1);
      if (!o.recycled) state.respawns.push(o.type === 'titan' ? { timer: cfg.farming.titans.respawnSec, titan: true } : { timer: cfg.farming.respawnSec });   // fragments are bonus matter, not part of the spawn budget
    }
    function damageShip(t, dmg, opts) {
      opts = opts || {};
      if (!t.alive || t.spawnProtect > 0) return;
      if (opts.source && opts.source.dmgMult) dmg *= opts.source.dmgMult;   // bigger ships hit harder
      if (t.braceTimer > 0) dmg *= (1 - cfg.hammerhead.brace.damageReduction);
      if (t.cracked) dmg *= (1 + cfg.railship.armorCrack.damageAmp);
      if (FAMILY[t.classId] === 'grav' && t.captured && t.captured.length > 0) {   // Gravitor Orbital Shield
        const os = cfg.gravitor.orbitalShield;
        if ((opts.source && isHighMomentum(opts.source)) || dmg >= os.heavyThreshold) { t.captured.pop(); dmg *= (1 - os.damageReduction); fx.spawnParticles(t.x, t.y, 14, '#b06bff', { speed: 220 }); }
      }
      if (FAMILY[t.classId] === 'flail' && t.orbActive && opts.source && isHighMomentum(opts.source)) {   // Flailship Orb Parry
        const op = cfg.flailship.orbParry, src = opts.source;
        if (Math.hypot(t.orbX - src.x, t.orbY - src.y) < (t.orbBlockRadius || 16) + src.radius + op.reach) {
          dmg *= (1 - op.ramDamageReduction);
          src.impX *= (1 - op.attackerVelocityReduction); src.impY *= (1 - op.attackerVelocityReduction);
          src.slow = Math.max(src.slow || 0, op.attackerSlow); src.slowTimer = Math.max(src.slowTimer || 0, op.attackerSlowSec);
          src.ramActive = 0; fx.spawnParticles(t.orbX, t.orbY, 16, '#ffd23c', { speed: 260 });
        }
      }
      if (opts.crack) { t.cracked = true; t.crackTimer = cfg.railship.armorCrack.baseDurationSec; }
      // (No percentage-of-maxHP damage cap: every weapon deals SET damage. The hammer ram's
      //  "can't execute an equal from full" property is enforced by its tuned numbers instead —
      //  see config.hammerhead.ram.damageMax.)
      // DEFLECTOR SHIELD: while it holds, the hull takes NO damage — every hit only bleeds the shield.
      if (t.shieldMax > 0 && t.shield > 0) {
        t.shield -= dmg; t.shieldHitTimer = t.shieldRegenDelay; t.shieldFlash = 0.14;
        recordShipDamage(opts.source, dmg); t.hitFlash = 0.16;
        const d = Math.hypot(opts.dx || 0, opts.dy || 0) || 1, ex = t.x + (opts.dx || 0) / d * t.radius, ey = t.y + (opts.dy || 0) / d * t.radius;
        fx.spawnParticles(ex, ey, 6, '#8fe3ff', { dir: Math.atan2(-(opts.dy || 0), -(opts.dx || 0)), spread: 1.4, speed: 220 });
        if (t.shield <= 0) {   // SHIELD DOWN — now it can actually be killed
          t.shield = 0; t.shieldFlash = 0.6;
          fx.spawnParticles(t.x, t.y, 46, '#bfefff', { speed: 420, size: 3.2 });
          fx.spawnText(t.x, t.y - t.radius - 20, 'SHIELD DOWN', '#bfefff', { size: t.isBot ? 15 : 20 });
        }
        return;
      }
      if (t.shieldMax > 0) t.shieldHitTimer = t.shieldRegenDelay;   // hull hits also stall the recharge
      t.hp -= dmg; recordShipDamage(opts.source, dmg); t.combatTimer = cfg.player.regen.delaySec; t.hitFlash = 0.16;
      if (opts.knockback) { t.impX += (opts.dx || 0) * opts.knockback; t.impY += (opts.dy || 0) * opts.knockback; }
      fx.spawnParticles(t.x, t.y, 6, '#ff8a8a', { speed: 150 });
      if (!t.isBot) fx.addShake(7, t.id);
      if (t.hp <= 0) killShip(t, opts.source);
    }
    function killShip(v, killer) {
      if (onKill) onKill(v, killer);   // before the drop: v.scrap/xp/isLeader still reflect the run
      const carried = v.scrap;
      v.alive = false; resetClassState(v);
      const drop = Math.floor(carried * eco.dropFractionOnDeath);
      v.scrap = carried - drop;
      if (drop > 0) { const n = Math.min(14, Math.max(1, drop)); ejectMotes(v.x, v.y, n, drop / n, { speed: 160 }); }
      fx.spawnParticles(v.x, v.y, cfg.fx.deathParticles, hueFor(v.classId), { speed: 340 });
      fx.spawnText(v.x, v.y - 34, 'WRECKED', '#ff6b6b', { size: v.isBot ? 14 : 22 });
      if (killer && killer !== v && killer.alive) {
        killer.kills = (killer.kills || 0) + 1;
        let bounty = carried * eco.killScrapFraction;
        if (v.isLeader) bounty *= cfg.leader.bountyScrapMultiplier;
        if (bounty > 0) { earn(killer, bounty); fx.spawnText(killer.x, killer.y - 30, '+' + Math.floor(bounty) + (v.isLeader ? ' BOUNTY' : ''), '#ffd98a', { size: 14 }); }
      }
      if (!v.isBot) fx.addShake(cfg.fx.screenShakeMax, v.id);
      v.respawnTimer = v.isBot ? cfg.bots.respawnDelaySec : cfg.player.respawnDelaySec;
    }
    function respawnShip(v) {
      v.alive = true;
      const s = edgeSpawn();
      v.x = s.x; v.y = s.y; v.px = v.x; v.py = v.y; v.vx = v.vy = v.impX = v.impY = 0;
      v.spawnProtect = cfg.player.spawnProtectionSec;
      if (!v.isBot) {
        v.classId = 'starter'; v.plane = 0;   // death drops a fallen Titan back into the normal arena
        v.scrap = cfg.player.scrapTrickleOnSpawn; v.xp = cfg.player.scrapTrickleOnSpawn;
        v.level = 1; v.scaled = false; v.isLeader = false;
        resetClassState(v);
      }
      applyClassStats(v, true);
      if (v.isBot) earn(v, cfg.player.scrapTrickleOnSpawn);
    }
    function lineBreak(s, count, x, y) { const bonus = eco.lineBreakBonusScrap + Math.max(0, count - 3); earn(s, bonus); s.heat = Math.max(0, s.heat - cfg.railship.lineBreakHeatRefund); if (!s.isBot) { fx.spawnText(x, y - 24, 'LINE BREAK +' + bonus, '#7be0ff', { size: 18 }); fx.addShake(6, s.id); } }

    function isHighMomentum(s) {
      if (!s || !s.isShip) return false;
      if (s.ramActive > 0) return true;
      const vx = (s.vx || 0) + (s.impX || 0), vy = (s.vy || 0) + (s.impY || 0);
      return (vx * vx + vy * vy) >= cfg.combat.highMomentumSpeed * cfg.combat.highMomentumSpeed;
    }
    const api = {
      config: cfg, state, fx, damageObject, crackObject, lineBreak, enemiesOf, isHighMomentum,
      damage(target, dmg, opts) {
        if (target.isShip) damageShip(target, dmg, opts);
        else if (target.isThrownRock) damageThrownRock(target, dmg, opts);
        else damageObject(target, dmg, opts);
      },
      hittables(ship) {
        const a = state.objects.concat();
        const en = enemiesOf(ship); for (const e of en) a.push(e);
        for (const pr of state.projectiles) if (pr.isThrownRock && !pr._broken && pr.team !== ship.team && (pr.plane | 0) === (ship.plane | 0)) a.push(pr);
        return a;
      },
      applyImpulse(s, vx, vy) { s.impX += vx; s.impY += vy; },
    };

    function updateLeader() {
      const bestByPlane = {};   // each plane crowns its own leader
      for (const s of state.ships) { if (!s.alive) continue; const pl = s.plane | 0; if (!bestByPlane[pl] || s.scrap > bestByPlane[pl].scrap) bestByPlane[pl] = s; }
      for (const s of state.ships) { const b = bestByPlane[s.plane | 0]; s.isLeader = (s === b && b && b.scrap >= cfg.leader.minScrapToCrown); }
    }

    function tickTimers(s, dt) {
      if (s.spawnProtect > 0) s.spawnProtect -= dt; if (s.hitFlash > 0) s.hitFlash -= dt;
      if (s.ventTimer > 0) s.ventTimer -= dt; if (s.abilityCd > 0) s.abilityCd -= dt;
      if (s.specialCd > 0) s.specialCd -= dt; if (s.contactCd > 0) s.contactCd -= dt;
      if (s.braceTimer > 0) s.braceTimer -= dt; if (s.ramActive > 0) s.ramActive -= dt;
      if (s.orbBurstTimer > 0) s.orbBurstTimer -= dt;
      if (s.shieldFlash > 0) s.shieldFlash -= dt;
      if (s.shieldMax > 0) {   // deflector recharges only after a lull — you must burst it down
        if (s.shieldHitTimer > 0) s.shieldHitTimer -= dt;
        else if (s.shield < s.shieldMax) s.shield = Math.min(s.shieldMax, s.shield + s.shieldRegenRate * dt);
      }
            if (s.slowTimer > 0) { s.slowTimer -= dt; if (s.slowTimer <= 0) s.slow = 0; }
      s.heat = Math.max(0, s.heat - cfg.railship.heat.decayPerSec * dt);
      if (s.cracked) { s.crackTimer -= dt; if (s.crackTimer <= 0) s.cracked = false; }
      const regen = cfg.player.regen;
      if (s.combatTimer > 0) s.combatTimer -= dt;
      else if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + regen.perSec * dt);
    }

    function simShip(s, dt, intent) {
      fxStamp(s.plane);   // attribute this ship's fx (beams/sparks/text) to its plane
      s.px = s.x; s.py = s.y;
      // Static Lash stun: frozen controls — no thrust, no fire, aim locked — until it wears off
      if ((s.stunTimer || 0) > 0) { s.stunTimer -= dt; intent = { moveX: 0, moveY: 0, aim: s.aim, aimDist: intent.aimDist || 1, firing: false, ability: false, special: false }; }
      s.aim = intent.aim;
      const fam = FAMILY[s.classId];
      let speedMul = 1;
      if (fam === 'rail' && s.charging) {
        if (s.classId === 'starbreak') { const c = Math.min(1, s.charge); speedMul = 1 - (1 - cfg.railship.mawRail.starbreakAnchorSpeedMult) * c * c; }   // siege anchor: near-standstill at full charge
        else { const m = cfg.railship.movementWhileCharging; speedMul = s.charge > 1 ? m.overcharge : s.charge <= 0.5 ? m.to50 : s.charge <= 0.9 ? m.to90 : m.to100; }
      }
      else if (fam === 'hammer' && s.ramWinding) speedMul = 0.4;
      if (s.slowTimer > 0) speedMul *= (1 - s.slow);
      const thrusting = intent.moveX !== 0 || intent.moveY !== 0;
      // Rail-family afterburner [Shift]: hard escape burn — kick + speed/accel boost, paid in heat.
      if (fam === 'rail') {
        const ab = cfg.railship.afterburner;
        if ((s.burnCd || 0) > 0) s.burnCd -= dt;
        if (intent.afterburner && (s.burnCd || 0) <= 0 && (s.burnTimer || 0) <= 0) {
          s.burnTimer = ab.durationSec; s.burnCd = ab.cooldownSec;
          s.heat = Math.min(cfg.railship.heat.max, (s.heat || 0) + ab.heatCost);
          const kx = thrusting ? intent.moveX : -Math.cos(s.aim), ky = thrusting ? intent.moveY : -Math.sin(s.aim);
          s.impX += kx * ab.kick; s.impY += ky * ab.kick;
          if (!s.isBot) fx.spawnText(s.x, s.y - 30, 'AFTERBURN', '#7fdcff', { size: 13 });
        }
        if ((s.burnTimer || 0) > 0) {
          s.burnTimer -= dt; speedMul *= ab.speedMult;
          fx.spawnParticles(s.x, s.y, 2, '#7fdcff', { dir: s.aim + Math.PI, spread: 0.7, speed: 260, life: 0.3 });
        }
      }
      // Cruise: sustained heading keeps the engines spooling past base speed; hard turns dump it.
      const cz = cfg.player.cruise;
      if (thrusting) {
        const dot = intent.moveX * (s.cruiseDX || 0) + intent.moveY * (s.cruiseDY || 0);
        s.cruise = dot >= cz.alignDot ? Math.min(1, (s.cruise || 0) + dt / cz.rampSec) : 0;
        s.cruiseDX = intent.moveX; s.cruiseDY = intent.moveY;
      } else s.cruise = Math.max(0, (s.cruise || 0) - cz.decayPerSec * dt);
      speedMul *= 1 + (s.cruise || 0) * (cz.maxMult - 1);
      const man = maneuverFor(s.radius);   // big hulls lumber (lower top speed + accel)
      const speed = cfg.player.baseSpeed * (s.classStats.speed || 1) * speedMul * man;
      // Inertia: thrust steers velocity toward the input direction; releasing coasts + drifts.
      const inr = cfg.player.inertia;
      const accel = inr.accelPerSec * man * ((s.burnTimer || 0) > 0 ? cfg.railship.afterburner.accelMult : 1);
      const k = Math.min(1, (thrusting ? accel : inr.coastDampPerSec) * dt);
      s.vx += (intent.moveX * speed - s.vx) * k; s.vy += (intent.moveY * speed - s.vy) * k;
      s.x += (s.vx + s.impX) * dt; s.y += (s.vy + s.impY) * dt;
      const dampRate = s.ramActive > 0 ? cfg.hammerhead.lunge.glideDampPerSec : cfg.player.impulseDampPerSec;
      const damp = Math.max(0, 1 - dampRate * dt); s.impX *= damp; s.impY *= damp;
      s.x = Math.max(s.radius, Math.min(cfg.arena.width - s.radius, s.x));
      s.y = Math.max(s.radius, Math.min(cfg.arena.height - s.radius, s.y));

      if (intent.firing || intent.ability || intent.special) s.combatTimer = cfg.player.regen.delaySec;
      if (intent.ability && s.abilityCd <= 0) s.abilityCd = PULSAR.resolveAbility(classNode(s.classId).ability).activate(api, s) || 0;
      if (intent.special && s.specialCd <= 0) s.specialCd = PULSAR.resolveSpecial(classNode(s.classId).special).activate(api, s) || 0;
      PULSAR.resolveWeapon(classNode(s.classId).weapon).update(api, s, dt, { firing: intent.firing, altFire: intent.altFire, aimDist: intent.aimDist });

      if (s.spawnProtect <= 0 && s.contactCd <= 0) {
        for (const o of state.objects) {
          const dx = s.x - o.x, dy = s.y - o.y, rr = s.radius + o.radius;
          if (dx * dx + dy * dy > rr * rr) continue;
          const d = Math.hypot(dx, dy) || 1;
          let dmg = cfg.farming.contactDamage[o.type];
          if (s.ramActive > 0) dmg *= (1 - cfg.hammerhead.lunge.selfDamageReduction);
          damageShip(s, dmg, { dx: dx / d, dy: dy / d, knockback: cfg.combat.knockbackBase, source: null });
          if (o.type !== 'titan') { o.vx -= (dx / d) * 80; o.vy -= (dy / d) * 80; } s.contactCd = cfg.farming.contactCooldownSec;
          break;
        }
      }
      fxStamp(-1);   // back to environmental attribution for anything outside a ship's update
    }

    const IDLE = { moveX: 0, moveY: 0, aim: 0, aimDist: 0, firing: false, ability: false, special: false };
    const botWorld = { ships: null, objects: state.objects, config: cfg, time: 0, arena: cfg.arena, familyOf: (id) => FAMILY[id] };
    function botStep(b, dt) {
      botMaybeEvolve(b);
      botWorld.ships = state.ships; botWorld.time = state.time;
      simShip(b, dt, PULSAR.Bots.intent(b, botWorld, dt));
    }

    // BLACK HOLE. Intermittent bipolar relativistic jet flings scrap far out along a slowly-
    // rotating axis. Timer is MP-synced (`pt`); axis derives from state.time so it's deterministic.
    function pulsarStep(dt) {
      state.pulsarTimer -= dt;
      if (state.pulsarTimer > 0) return;
      const P = cfg.arena.pulsar;
      state.pulsarTimer += P.jetIntervalSec;
      const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
      const ang = state.time * P.jetAxisDriftRadPerSec;
      const half = Math.floor(P.jetMotes / 2);
      const opt = { spread: P.jetSpreadRad, speed: P.jetSpeed, life: P.jetLifeSec, pulsar: true, jet: true };
      ejectMotes(cx, cy, half, P.jetScrapPerMote, Object.assign({ angle: ang }, opt));
      ejectMotes(cx, cy, P.jetMotes - half, P.jetScrapPerMote, Object.assign({ angle: ang + Math.PI }, opt));
      fx.spawnParticles(cx, cy, 24, '#cfe4ff', { dir: ang, spread: 0.16, speed: 760, life: 0.5 });
      fx.spawnParticles(cx, cy, 24, '#cfe4ff', { dir: ang + Math.PI, spread: 0.16, speed: 760, life: 0.5 });
    }
    // Gravity well + lethal event horizon, applied per living ship after it moves.
    function pulsarGravity(s, dt) {
      if ((s.plane | 0) !== 0) return;   // the pulsar lives in the normal arena; the Titan rect has no hole
      const P = cfg.arena.pulsar, cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
      const dx = cx - s.x, dy = cy - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < P.lethalRadius) {                       // crossed the horizon — gone
        fx.spawnParticles(s.x, s.y, 18, '#9fc2ff', { dir: Math.atan2(dy, dx), spread: 0.5, speed: 240, life: 0.35 });
        killShip(s, null);
        return;
      }
      if (d > P.pullRadius) return;
      const f = 1 - d / P.pullRadius;                 // 0 at the edge, 1 at the core
      const pull = P.pullMaxSpeed * f * f;            // px/sec inward — sharp ramp toward the hole
      s.x += (dx / d) * pull * dt; s.y += (dy / d) * pull * dt;
    }
    function simulateProjectiles(dt) {
      const harvest = cfg.gravitor.orbitalHarvestBonus;
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const pr = state.projectiles[i];
        fxStamp(pr.plane);   // hit sparks / break fx belong to the projectile's plane
        if (pr.homing) {   // HOMING MISSILE: steer toward the nearest same-plane enemy at a capped turn rate
          let tgt = null, td = 1e9;
          for (const s of state.ships) { if (!s.alive || s.team === pr.team || (s.plane | 0) !== (pr.plane | 0) || s.spawnProtect > 0) continue; const dd = (s.x - pr.x) ** 2 + (s.y - pr.y) ** 2; if (dd < td) { td = dd; tgt = s; } }
          if (tgt) {
            const want = Math.atan2(tgt.y - pr.y, tgt.x - pr.x); let cur = Math.atan2(pr.vy, pr.vx);
            let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
            const turn = (pr.turnRate || 2) * dt; cur += Math.max(-turn, Math.min(turn, da));
            const sp = pr.speed || Math.hypot(pr.vx, pr.vy); pr.vx = Math.cos(cur) * sp; pr.vy = Math.sin(cur) * sp;
          }
          fx.spawnParticles(pr.x, pr.y, 1, pr.color, { speed: 24, spread: Math.PI, life: 0.3, size: 3 });   // exhaust trail
        }
        pr.px = pr.x; pr.py = pr.y; pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
        let dead = pr.life <= 0 || pr._broken;
        if (!dead) {
          for (const s of state.ships) {
            if (!s.alive || !s.orbActive || s.team === pr.team || (s.plane | 0) !== (pr.plane | 0)) continue;
            const rr = pr.radius + s.orbBlockRadius;
            if ((pr.x - s.orbX) ** 2 + (pr.y - s.orbY) ** 2 <= rr * rr) { fx.spawnParticles(pr.x, pr.y, 6, '#ffe6a8', { speed: 160, life: 0.3 }); dead = true; break; }
          }
        }
        if (!dead) {
          let target = null;
          for (const s of state.ships) { if (!s.alive || s.team === pr.team || s.spawnProtect > 0 || (s.plane | 0) !== (pr.plane | 0)) continue; const rr = pr.radius + s.radius; if ((pr.x - s.x) ** 2 + (pr.y - s.y) ** 2 <= rr * rr) { target = s; break; } }
          if (!target) for (const o of state.objects) { const rr = pr.radius + o.radius; if ((pr.x - o.x) ** 2 + (pr.y - o.y) ** 2 <= rr * rr) { target = o; break; } }
          if (target) {
            const d = Math.hypot(pr.vx, pr.vy) || 1;
            const rockHit = pr.isThrownRock && target.isShip;   // gravitor boulders LAND — heavier knock, shake, debris
            api.damage(target, pr.damage, { dx: pr.vx / d, dy: pr.vy / d, knockback: rockHit ? 160 : 40, source: pr.owner });
            if (rockHit) { fx.spawnParticles(pr.x, pr.y, cfg.fx.breakParticles, (OBJDEF[pr.rockType] || OBJDEF.asteroid).hue, { speed: 300, size: 3 }); if (pr.owner && !pr.owner.isBot) fx.addShake(7, pr.owner.id); if (!target.isBot) fx.addShake(6, target.id); }
            if (pr.harvest && !target.isShip && target.hp <= 0 && pr.owner && pr.owner.alive) earn(pr.owner, harvest);
            if (--pr.pierceLeft <= 0) dead = true;
          }
        }
        if (!dead && (pr.x < 0 || pr.y < 0 || pr.x > cfg.arena.width || pr.y > cfg.arena.height)) dead = true;
        if (dead) {
          if (pr.isThrownRock) {
            fx.spawnParticles(pr.x, pr.y, cfg.fx.breakParticles, (OBJDEF[pr.rockType] || OBJDEF.asteroid).hue, { speed: 240 });
            // SHATTER RECYCLING: dying rocks sometimes leave a real capturable fragment —
            // the gravitor's volleys reseed the battlefield (for everyone). Pebbles don't.
            const rc = cfg.gravitor.recycle;
            if (pr.rockType !== 'pebble'
                && state.objects.length < rc.maxWorldObjects && Math.random() < rc.fragmentChance
                && pr.x > 60 && pr.y > 60 && pr.x < cfg.arena.width - 60 && pr.y < cfg.arena.height - 60) {
              const fr = Math.max(10, (pr.radius || 20) * rc.fragmentRadiusMult);
              state.objects.push({ type: 'debris', x: pr.x, y: pr.y, px: pr.x, py: pr.y, vx: pr.vx * 0.1, vy: pr.vy * 0.1,
                plane: pr.plane | 0,
                radius: fr, hp: cfg.farming.debrisHP, maxHp: cfg.farming.debrisHP, recycled: true,
                spin: Math.random() * TAU, spinRate: (Math.random() - 0.5) * 0.8, flash: 0, cracked: false, crackTimer: 0 });
            }
          }
          state.projectiles.splice(i, 1);
        }
      }
      fxStamp(-1);
    }
    function simulateObjects(dt) {
      for (const o of state.objects) {
        o.px = o.x; o.py = o.y; o.spin += o.spinRate * dt; o.x += o.vx * dt; o.y += o.vy * dt;
        const damp = Math.max(0, 1 - 4 * dt); o.vx *= damp; o.vy *= damp;
        if (o.flash > 0) o.flash -= dt; if (o.cracked) { o.crackTimer -= dt; if (o.crackTimer <= 0) o.cracked = false; }
      }
      for (let i = state.respawns.length - 1; i >= 0; i--) { const r = state.respawns[i]; r.timer -= dt; if (r.timer <= 0) { r.titan ? spawnTitan() : spawnArenaObject(); state.respawns.splice(i, 1); } }
    }
    function simulateMotes(dt) {
      for (let i = state.motes.length - 1; i >= 0; i--) {
        const m = state.motes[i]; m.px = m.x; m.py = m.y;
        let best = null, bd = pk.collectRadius;
        for (const s of state.ships) { if (!s.alive) continue; const d = Math.hypot(s.x - m.x, s.y - m.y); if (d < bd) { bd = d; best = s; } }
        if (best) {
          const d = Math.hypot(best.x - m.x, best.y - m.y) || 1;
          if (d <= best.radius + pk.moteRadius) { earn(best, m.value); state.motes.splice(i, 1); continue; }
          m.x += (best.x - m.x) / d * pk.vacuumSpeed * dt; m.y += (best.y - m.y) / d * pk.vacuumSpeed * dt;
        } else { const drag = m.jet ? pk.jetDrag : 1.6; m.vx *= (1 - drag * dt); m.vy *= (1 - drag * dt); m.x += m.vx * dt; m.y += m.vy * dt; }
        m.life -= dt; if (m.life <= 0) state.motes.splice(i, 1);
      }
    }

    function step(dt) {
      state.time += dt;
      pulsarStep(dt);
      for (const s of state.ships) tickTimers(s, dt);
      for (const s of state.ships) {
        if (!s.alive) { s.respawnTimer -= dt; if (s.respawnTimer <= 0) respawnShip(s); continue; }
        if (s.isBot) botStep(s, dt);
        else {
          simShip(s, dt, s._intent || IDLE);
          // consume one-shot edges — applied for exactly one tick, never re-triggered
          if (s._intent) s._intent.ability = s._intent.special = s._intent.afterburner = s._intent.altFire = false;
        }
        if (s.alive) pulsarGravity(s, dt);   // black-hole pull + lethal horizon (after movement)
      }
      updateLeader();
      simulateProjectiles(dt); simulateObjects(dt); simulateMotes(dt);
    }

    // ---- public API ----
    function getShip(id) { for (const s of state.ships) if (s.id === id) return s; return null; }
    function addShip(o) { o = o || {}; const sp = o.x == null ? edgeSpawn() : { x: o.x, y: o.y }; const s = makeShip({ id: o.id, isBot: o.isBot, team: o.team != null ? o.team : nextId, classId: o.classId, x: sp.x, y: sp.y, aim: o.aim, plane: o.plane, skin: o.skin }); applyClassStats(s, true); state.ships.push(s); return s; }
    function removeShip(id) { for (let i = 0; i < state.ships.length; i++) if (state.ships[i].id === id) { state.ships.splice(i, 1); return; } }
    // Some bots spawn wearing a random livery (advertises the shop; render-only, no stats).
    function randomBotSkin() {
      const cos = window.PULSAR.cosmetics;
      if (!cos || Math.random() >= ((cfg.cosmetics && cfg.cosmetics.botSkinChance) || 0)) return null;
      return cos.skins[1 + Math.floor(Math.random() * (cos.skins.length - 1))].id;   // any non-default
    }
    function spawnBots(n) {
      n = n != null ? n : cfg.bots.count;
      for (let i = 0; i < n; i++) { const cls = ['railship', 'hammerhead', 'gravitor', 'flailship'][Math.floor(Math.random() * 4)]; addShip({ classId: cls, isBot: true, aim: Math.random() * TAU, skin: randomBotSkin() }); }
    }
    function clearBots() { for (let i = state.ships.length - 1; i >= 0; i--) if (state.ships[i].isBot) state.ships.splice(i, 1); }
    function populateField() { for (let i = 0; i < af.count; i++) spawnArenaObject(); for (let i = 0; i < cfg.farming.titans.count; i++) spawnTitan(); }
    // TITANS: center-biased landmark placement — rejection-sample toward mid-map, keep them
    // apart from each other and off the pulsar core. Immovable mountains; see config note.
    function spawnTitan() {
      const T = cfg.farming.titans, cx = cfg.arena.width / 2, cy = cfg.arena.height / 2, half = cfg.arena.width / 2;
      for (let t = 0; t < 60; t++) {
        const x = 300 + Math.random() * (cfg.arena.width - 600), y = 300 + Math.random() * (cfg.arena.height - 600);
        const d = Math.hypot(x - cx, y - cy);
        if (d < T.minDistFromPulsar) continue;
        if (Math.random() > Math.pow(1 - Math.min(1, d / half), T.centerBias)) continue;   // center bias
        let crowded = false;
        for (const o of state.objects) if (o.type === 'titan' && Math.hypot(o.x - x, o.y - y) < T.minSeparation) { crowded = true; break; }
        if (crowded) continue;
        addObject('titan', x, y);
        return;
      }
    }

    populateField();

    return {
      state, api, config: cfg, telemetry,
      FAMILY, EVOLVE_BLURB, classNode, hueFor,
      addShip, removeShip, getShip, spawnBots, clearBots,
      setIntent(id, intent) {
        const s = getShip(id); if (!s) return;
        // One-shot edge flags LATCH until a sim tick consumes them (see step). A 60Hz sender can
        // deliver two packets between ticks — a plain replace drops the first packet's edge, which
        // made edge-driven abilities (Twinmaul lash/sync-throw, gravitor launch, afterburner)
        // randomly dead in MP. Level fields (move/aim/firing) still just take the newest value.
        const prev = s._intent;
        if (prev) {
          intent.ability = intent.ability || prev.ability;
          intent.special = intent.special || prev.special;
          intent.afterburner = intent.afterburner || prev.afterburner;
          intent.altFire = intent.altFire || prev.altFire;
        }
        s._intent = intent;
      },
      step,
      enemiesOf, evolveOptions, chooseEvolution, applyClassStats, xpForLevel,
      earn,                                  // for admin/level cheats
      countBots() { let n = 0; for (const s of state.ships) if (s.isBot) n++; return n; },
    };
  };
})();
