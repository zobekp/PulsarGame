// PULSAR.io — GAME (entry: state + fixed-timestep loop + sim + render orchestration)
// Phase 4 — Second branches + BOTS (the prove-it gate). Player and bots are the same `ship`
// entity, driven by an INTENT and the same data weapons; combat is symmetric (weapons hit
// enemy ships, not just rocks). Free-for-all; leader = top scrap (crown + bounty). Both
// evolution branches of every family are selectable through final.
// Tunables in data/config.js. Sim still coupled to input/render (Phase 5 = server split).
window.PULSAR = window.PULSAR || {};

(function () {
  const cfg = PULSAR.config;
  const eco = cfg.economy;
  const pk = cfg.pickups;
  const Input = PULSAR.Input;
  const Render = PULSAR.Render;
  const Fx = PULSAR.Fx;
  const hueFor = PULSAR.weaponHue;
  const TAU = Math.PI * 2;
  const DT = 1 / cfg.sim.tickRate;
  const lerp = (a, b, t) => a + (b - a) * t;

  const OBJDEF = {
    asteroid: { hp: 'asteroidHP', radius: 'asteroidRadius', scrap: 'scrapPerAsteroid', hue: '#6b7280' },
    crystal:  { hp: 'crystalHP',  radius: 'crystalRadius',  scrap: 'scrapPerCrystal',  hue: '#5eead4' },
    debris:   { hp: 'debrisHP',   radius: 'debrisRadius',   scrap: 'scrapPerDebris',   hue: '#7b8694' },
  };
  const EVO_GATES = [eco.levelChooseClass, eco.levelChoosePath, eco.levelFinalEvolution];
  const EVO_COSTS = [eco.evolutionCosts.class, eco.evolutionCosts.path, eco.evolutionCosts.final];
  const SPAWN = { x: cfg.arena.width / 2, y: cfg.arena.height * 0.80 };

  const IMPLEMENTED = new Set(['starter', 'railship', 'lancer', 'starPiercer',
    'hammerhead', 'maulbreaker', 'worldsplitter', 'gravitor', 'meteorist', 'starfall',
    'singularity', 'eventHorizon', 'flailship', 'chainmaul', 'ironmoon', 'graviflail', 'orbitCrusher']);
  const FAMILY = {
    starter: 'dart',
    railship: 'rail', lancer: 'rail', starPiercer: 'rail',
    hammerhead: 'hammer', maulbreaker: 'hammer', worldsplitter: 'hammer',
    gravitor: 'grav', meteorist: 'grav', starfall: 'grav', singularity: 'grav', eventHorizon: 'grav',
    flailship: 'flail', chainmaul: 'flail', ironmoon: 'flail', graviflail: 'flail', orbitCrusher: 'flail',
  };
  const EVOLVE_BLURB = {
    railship: 'charge beam · heat · Vent Dash', hammerhead: 'wind-up lunge · Brace',
    gravitor: 'auto-pulls rocks · click to launch', flailship: 'chain orb — throw it out, it returns',
    lancer: '+range · +charge dmg · thinner beam', starPiercer: 'huge beam · BROKEN CORE mark [E]',
    maulbreaker: '+ram reach · +knockback', worldsplitter: 'full-lunge SHOCKWAVE · slam burst [E]',
    meteorist: 'holds 3 rocks · harder throws', starfall: 'hold 9, hurl 3, no cooldown · BARRAGE [E]',
    singularity: 'well SLOWS enemies (tidal drag)', eventHorizon: 'COLLAPSE the well [E]',
    chainmaul: 'bigger, harder orb', ironmoon: 'Power Swing [Space] · MOON SLAM [E]',
    graviflail: 'defensive Orbit Lock [Space]', orbitCrusher: 'GRAVITY CRUSH [E]',
  };

  // ---- ship factory (player AND bots) ---------------------------------------
  function makeShip(o) {
    return {
      isShip: true, isBot: !!o.isBot, team: o.team, classId: o.classId,
      x: o.x, y: o.y, px: o.x, py: o.y, vx: 0, vy: 0, impX: 0, impY: 0,
      aim: o.aim != null ? o.aim : -Math.PI / 2,
      radius: cfg.player.baseRadius, maxHp: cfg.player.baseHP, hp: cfg.player.baseHP,
      classStats: { hp: 1, speed: 1, sizeMult: 1 },
      scrap: cfg.player.scrapTrickleOnSpawn, xp: cfg.player.scrapTrickleOnSpawn, level: 1,
      isLeader: false, scaled: false, kills: 0,
      spawnProtect: cfg.player.spawnProtectionSec, hitFlash: 0, contactCd: 0, abilityCd: 0, specialCd: 0,
      slow: 0, slowTimer: 0, alive: true, respawnTimer: 0,
      charge: 0, charging: false, heat: 0, ventTimer: 0, chargeFullTimer: 0,
      ramWinding: false, ramCharge: 0, ramActive: 0, ramHitList: [], ramHitBase: 0, ramFull: false, ramSlammed: false,
      captured: [], orbSpin: 0, orbAngle: 0, orbRadius: null, orbX: o.x, orbY: o.y,
      orbBurstTimer: 0, powerSwingTimer: 0, braceTimer: 0, orbLockTimer: 0, fireTimer: 0,
      cracked: false, crackTimer: 0, combatTimer: 0,
      ai: o.isBot ? { state: 'farm', t: 0, dodge: 0, dodgeDir: 1, strafeDir: 1 } : null,
      _firePrev: false, _abilityPrev: false, _specialPrev: false, _adminPrev: false, _suppressFire: false,
      _numPrev: [false, false, false, false, false],
    };
  }

  // ---- world state -----------------------------------------------------------
  const state = {
    time: 0, pulsarTimer: cfg.arena.pulsarPulseIntervalSec,
    player: null, bots: [], projectiles: [], objects: [], motes: [], respawns: [],
  };
  state.player = makeShip({ classId: 'starter', x: SPAWN.x, y: SPAWN.y, team: 0, isBot: false });
  const p = state.player;
  function randomSpawn() { return { x: 200 + Math.random() * (cfg.arena.width - 400), y: 200 + Math.random() * (cfg.arena.height - 400) }; }
  function spawnBots() {
    for (let i = 0; i < cfg.bots.count; i++) {
      const cls = ['railship', 'hammerhead', 'gravitor', 'flailship'][Math.floor(Math.random() * 4)];
      const s = randomSpawn();
      const b = makeShip({ classId: cls, x: s.x, y: s.y, team: i + 1, isBot: true, aim: Math.random() * TAU });
      applyClassStats(b, true);
      state.bots.push(b);
    }
  }
  function toggleBots() { if (state.bots.length) state.bots.length = 0; else spawnBots(); }
  spawnBots();
  const allShips = () => { const a = [p]; for (const b of state.bots) a.push(b); const rs = PULSAR.Net.remotes; for (let i = 0; i < rs.length; i++) a.push(rs[i]); return a; };
  function enemiesOf(ship) { const out = []; for (const s of allShips()) if (s !== ship && s.alive && s.team !== ship.team) out.push(s); return out; }

  // ---- class identity / stats ------------------------------------------------
  function classNode(id) { return PULSAR.classes[id]; }
  function childrenOf(id) { const out = []; for (const k in PULSAR.classes) if (PULSAR.classes[k].parentId === id && IMPLEMENTED.has(k)) out.push(PULSAR.classes[k]); return out; }
  function applyClassStats(s, heal) {
    const node = classNode(s.classId);
    const st = (cfg[node.configKey] && cfg[node.configKey].stats) ? cfg[node.configKey].stats : { hp: 1, speed: 1, sizeMult: 1 };
    s.classStats = st;
    const tierStep = Math.max(0, node.tier - 1), g = eco.tierGrowth;
    let r = cfg.player.baseRadius * (st.sizeMult || 1) * (1 + tierStep * g.radius);
    let hpMax = cfg.player.baseHP * (st.hp || 1) * (1 + tierStep * g.hp);
    if (s.scaled) { r *= (1 + cfg.leader.hitboxBonus); hpMax *= (1 + cfg.leader.hpBonus); }
    s.radius = r; s.maxHp = hpMax; s.hp = heal ? hpMax : Math.min(s.hp, hpMax);
  }
  function resetClassState(s) {
    s.charge = 0; s.charging = false; s.heat = 0; s.ventTimer = 0;
    s.ramWinding = false; s.ramCharge = 0; s.ramActive = 0; s.ramHitList = [];
    s.captured = []; s.orbSpin = 0; s.orbAngle = 0; s.orbRadius = null; s.orbX = s.x; s.orbY = s.y;
    s.orbBurstTimer = 0; s.powerSwingTimer = 0; s.braceTimer = 0; s.orbLockTimer = 0; s.fireTimer = 0;
  }
  function switchClass(s, id) {
    s.classId = id; resetClassState(s); applyClassStats(s, true);
    Fx.spawnText(s.x, s.y - 52, (s === p ? 'EVOLVED → ' : '') + classNode(id).displayName, '#7be0ff', { size: s === p ? 19 : 13 });
    if (s === p && EVOLVE_BLURB[id]) Fx.spawnText(s.x, s.y - 32, EVOLVE_BLURB[id], '#cfeaff', { size: 12 });
    Fx.spawnParticles(s.x, s.y, 30, hueFor(id), { speed: 320 });
    if (s === p) Fx.addShake(11);
  }

  // ---- progression -----------------------------------------------------------
  function levelForXp(xp) { return xp <= 0 ? 1 : 1 + Math.floor(Math.pow(xp / eco.levelCurve.k, 1 / eco.levelCurve.exp)); }
  function xpForLevel(L) { return eco.levelCurve.k * Math.pow(L - 1, eco.levelCurve.exp); }
  function updateLevel(s) {
    const nl = levelForXp(s.xp);
    if (nl <= s.level) return;
    s.level = nl;
    if (s === p && s.alive) Fx.spawnText(s.x, s.y - 40, 'LEVEL ' + s.level, '#bfe9ff', { size: 16 });
    const sc = s.level >= eco.levelLeaderScaling;
    if (sc !== s.scaled) { s.scaled = sc; applyClassStats(s, true); if (sc && s === p) Fx.spawnText(s.x, s.y - 64, '★ SCALED ★', '#ffd98a', { size: 20 }); }
  }
  function earn(s, amount) { s.scrap += amount; s.xp += amount; updateLevel(s); }
  function adminLevelUp() { if (!p.alive) return; earn(p, Math.max(xpForLevel(p.level + 1) - p.xp + 1, EVO_COSTS[0])); Fx.spawnText(p.x, p.y - 52, 'ADMIN +LVL', '#ff9bf0', { size: 16 }); }

  function evolveOptions(s) {
    const t = classNode(s.classId).tier;
    if (t >= 3) return null;
    const opts = childrenOf(s.classId);
    if (!opts.length) return null;
    return { tier: t, gate: EVO_GATES[t], cost: EVO_COSTS[t], levelOk: s.level >= EVO_GATES[t], options: opts };
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

  // ---- neutral-object field --------------------------------------------------
  const af = cfg.farming.field;
  const TYPEBAG = (() => { const b = []; for (const k in af.weights) for (let i = 0; i < af.weights[k]; i++) b.push(k); return b; })();
  function pickType() { return TYPEBAG[Math.floor(Math.random() * TYPEBAG.length)]; }
  function densityAt(x, y) { const t = Math.min(1, Math.hypot(x - cfg.arena.width / 2, y - cfg.arena.height / 2) / (cfg.arena.width / 2)); return lerp(cfg.farming.densityAtCenter, cfg.farming.densityAtEdge, t); }
  function addObject(type, x, y) {
    const hp = cfg.farming[OBJDEF[type].hp];
    state.objects.push({ type, x, y, px: x, py: y, vx: 0, vy: 0, radius: cfg.farming[OBJDEF[type].radius], hp, maxHp: hp, spin: Math.random() * TAU, spinRate: (Math.random() - 0.5) * 0.8, flash: 0, cracked: false, crackTimer: 0, _orbHit: -9 });
  }
  function spawnArenaObject() {
    const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
    for (let t = 0; t < 24; t++) { const x = Math.random() * cfg.arena.width, y = Math.random() * cfg.arena.height; if (Math.hypot(x - cx, y - cy) < af.pulsarClearRadius) continue; if (Math.random() <= densityAt(x, y)) { addObject(pickType(), x, y); return; } }
    addObject(pickType(), Math.random() * cfg.arena.width, Math.random() * cfg.arena.height);
  }
  for (let i = 0; i < af.count; i++) spawnArenaObject();

  function ejectMotes(x, y, count, valueEach, opts) {
    opts = opts || {};
    const speed = opts.speed != null ? opts.speed : pk.moteDriftSpeed, life = opts.life != null ? opts.life : pk.moteLifeSec;
    for (let i = 0; i < count; i++) { const a = opts.evenIndex != null ? (i / count) * TAU + Math.random() * 0.3 : Math.random() * TAU; state.motes.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, value: valueEach, pulsar: !!opts.pulsar }); }
  }

  // ---- damage (neutrals + ships) --------------------------------------------
  function damageObject(o, dmg, opts) {
    opts = opts || {};
    o.hp -= dmg * (o.cracked ? (1 + cfg.railship.armorCrack.damageAmp) : 1);
    o.flash = 0.12;
    if (opts.crack) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
    if (opts.knockback) { o.vx += (opts.dx || 0) * opts.knockback; o.vy += (opts.dy || 0) * opts.knockback; }
    Fx.spawnParticles(o.x, o.y, cfg.fx.hitParticles, OBJDEF[o.type].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
    if (o.hp <= 0) breakObject(o);
  }
  // A LAUNCHED rock is a destructible projectile (tankier than a normal asteroid). Enemies can
  // shoot it down mid-flight; when it dies it shatters (handled on removal in simulateProjectiles).
  function damageThrownRock(r, dmg, opts) {
    opts = opts || {};
    r.hp -= dmg;
    Fx.spawnParticles(r.x, r.y, cfg.fx.hitParticles, OBJDEF[r.rockType || 'asteroid'].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
    if (r.hp <= 0) r._broken = true;
  }
  function crackObject(o) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
  function breakObject(o) {
    const total = eco[OBJDEF[o.type].scrap], n = cfg.farming.motesPerObject[o.type];
    ejectMotes(o.x, o.y, n, total / n);
    Fx.spawnParticles(o.x, o.y, cfg.fx.breakParticles, OBJDEF[o.type].hue, { speed: 250 });
    const idx = state.objects.indexOf(o); if (idx >= 0) state.objects.splice(idx, 1);
    state.respawns.push({ timer: cfg.farming.respawnSec });
  }
  function damageShip(t, dmg, opts) {
    opts = opts || {};
    if (t === p && !gameStarted) return;   // invulnerable on the title screen
    if (!t.alive || t.spawnProtect > 0) return;
    if (t.isRemote) {   // PvP: the owner is authoritative for its HP — route the hit, show local feedback
      PULSAR.Net.sendHit(t.netId, dmg, opts);
      t.hitFlash = 0.16; Fx.spawnParticles(t.x, t.y, 6, '#ff8a8a', { speed: 150 });
      return;
    }
    if (t.braceTimer > 0) dmg *= (1 - cfg.hammerhead.brace.damageReduction);
    if (t.cracked) dmg *= (1 + cfg.railship.armorCrack.damageAmp);
    // Gravitor Orbital Shield — spend an orbiting rock to soak a heavy or high-momentum hit.
    if (FAMILY[t.classId] === 'grav' && t.captured && t.captured.length > 0) {
      const os = cfg.gravitor.orbitalShield;
      if ((opts.source && isHighMomentum(opts.source)) || dmg >= os.heavyThreshold) {
        t.captured.pop(); dmg *= (1 - os.damageReduction);
        Fx.spawnParticles(t.x, t.y, 14, '#b06bff', { speed: 220 });
      }
    }
    // Flailship Orb Parry — orb between you and a charging attacker softens the ram + bleeds momentum.
    if (FAMILY[t.classId] === 'flail' && t.orbActive && opts.source && isHighMomentum(opts.source)) {
      const op = cfg.flailship.orbParry, src = opts.source;
      if (Math.hypot(t.orbX - src.x, t.orbY - src.y) < (t.orbBlockRadius || 16) + src.radius + op.reach) {
        dmg *= (1 - op.ramDamageReduction);
        src.impX *= (1 - op.attackerVelocityReduction); src.impY *= (1 - op.attackerVelocityReduction);
        src.slow = Math.max(src.slow || 0, op.attackerSlow); src.slowTimer = Math.max(src.slowTimer || 0, op.attackerSlowSec);
        src.ramActive = 0;
        Fx.spawnParticles(t.orbX, t.orbY, 16, '#ffd23c', { speed: 260 });
      }
    }
    if (opts.crack) { t.cracked = true; t.crackTimer = cfg.railship.armorCrack.baseDurationSec; }
    t.hp -= dmg; t.hitFlash = 0.16;
    if (opts.knockback) { t.impX += (opts.dx || 0) * opts.knockback; t.impY += (opts.dy || 0) * opts.knockback; }
    Fx.spawnParticles(t.x, t.y, 6, '#ff8a8a', { speed: 150 });
    if (t === p) Fx.addShake(7);
    if (t.hp <= 0) killShip(t, opts.source);
  }
  // ---- title / name / killfeed ----------------------------------------------
  let gameStarted = false;
  const killFeed = [];
  function nameOf(s) { return s === p ? (p.name || 'YOU') : (s.name || classNode(s.classId).displayName); }
  function addKill(killer, victim, leader) { killFeed.push({ killer, victim, leader, t: state.time }); if (killFeed.length > 8) killFeed.shift(); }

  function killShip(v, killer) {
    const carried = v.scrap;
    addKill(killer && killer !== v ? nameOf(killer) : null, nameOf(v), v.isLeader);
    v.alive = false; resetClassState(v);
    const drop = Math.floor(carried * eco.dropFractionOnDeath);
    v.scrap = carried - drop;
    if (drop > 0) { const n = Math.min(14, Math.max(1, drop)); ejectMotes(v.x, v.y, n, drop / n, { speed: 160 }); }
    Fx.spawnParticles(v.x, v.y, cfg.fx.deathParticles, hueFor(v.classId), { speed: 340 });
    Fx.spawnText(v.x, v.y - 34, 'WRECKED', '#ff6b6b', { size: v === p ? 22 : 14 });
    if (killer && killer !== v && killer.alive) {
      killer.kills = (killer.kills || 0) + 1;
      let bounty = carried * eco.killScrapFraction;
      if (v.isLeader) bounty *= cfg.leader.bountyScrapMultiplier;
      if (bounty > 0) { earn(killer, bounty); Fx.spawnText(killer.x, killer.y - 30, '+' + Math.floor(bounty) + (v.isLeader ? ' BOUNTY' : ''), '#ffd98a', { size: 14 }); }
    }
    if (v === p) Fx.addShake(cfg.fx.screenShakeMax);
    v.respawnTimer = v.isBot ? cfg.bots.respawnDelaySec : cfg.player.respawnDelaySec;
  }
  function respawnShip(v) {
    v.alive = true;
    const s = v.isBot ? randomSpawn() : SPAWN;
    v.x = s.x; v.y = s.y; v.px = v.x; v.py = v.y; v.vx = v.vy = v.impX = v.impY = 0;
    v.spawnProtect = cfg.player.spawnProtectionSec;
    if (!v.isBot) {
      // PLAYER death resets you to a fresh level-1 Scout (overrides DESIGN.md's "level never
      // lost" — deliberate, per request). Bots keep their progress on respawn.
      v.classId = 'starter';
      v.scrap = cfg.player.scrapTrickleOnSpawn; v.xp = cfg.player.scrapTrickleOnSpawn;
      v.level = 1; v.scaled = false; v.isLeader = false;
      resetClassState(v);
    }
    applyClassStats(v, true);
    if (v.isBot) earn(v, cfg.player.scrapTrickleOnSpawn);
  }
  function lineBreak(s, count, x, y) { const bonus = eco.lineBreakBonusScrap + Math.max(0, count - 3); earn(s, bonus); s.heat = Math.max(0, s.heat - cfg.railship.lineBreakHeatRefund); if (s === p) { Fx.spawnText(x, y - 24, 'LINE BREAK +' + bonus, '#7be0ff', { size: 18 }); Fx.addShake(6); } }

  // A target is "high-momentum" if it's ramming or moving (intent + impulse) at/above the threshold.
  // Used by the anti-charge counterplay so it punishes reckless engages, not normal movement.
  function isHighMomentum(s) {
    if (!s || !s.isShip) return false;
    if (s.ramActive > 0) return true;
    const vx = (s.vx || 0) + (s.impX || 0), vy = (s.vy || 0) + (s.impY || 0);
    return (vx * vx + vy * vy) >= cfg.combat.highMomentumSpeed * cfg.combat.highMomentumSpeed;
  }
  const api = {
    config: cfg, state, fx: Fx, damageObject, crackObject, lineBreak, enemiesOf, isHighMomentum,
    damage(target, dmg, opts) {
      if (target.isShip) damageShip(target, dmg, opts);
      else if (target.isThrownRock) damageThrownRock(target, dmg, opts);
      else damageObject(target, dmg, opts);
    },
    // Hittable set = neutral rocks + enemy ships + enemies' LIVE thrown rocks (shootable in flight).
    hittables(ship) {
      const a = state.objects.concat();
      const en = enemiesOf(ship); for (const e of en) a.push(e);
      for (const pr of state.projectiles) if (pr.isThrownRock && !pr._broken && pr.team !== ship.team) a.push(pr);
      return a;
    },
    applyImpulse(s, vx, vy) { s.impX += vx; s.impY += vy; },
  };

  function updateLeader() {
    let best = null;
    for (const s of allShips()) if (s.alive && (!best || s.scrap > best.scrap)) best = s;
    for (const s of allShips()) s.isLeader = (s === best && best.scrap >= cfg.leader.minScrapToCrown);
  }

  // ---- per-ship sim ----------------------------------------------------------
  function tickTimers(s, dt) {
    if (s.isRemote) return;   // remote players are driven by the network, not the local sim
    if (s.spawnProtect > 0) s.spawnProtect -= dt; if (s.hitFlash > 0) s.hitFlash -= dt;
    if (s.ventTimer > 0) s.ventTimer -= dt; if (s.abilityCd > 0) s.abilityCd -= dt;
    if (s.specialCd > 0) s.specialCd -= dt; if (s.contactCd > 0) s.contactCd -= dt;
    if (s.braceTimer > 0) s.braceTimer -= dt; if (s.ramActive > 0) s.ramActive -= dt;
    if (s.orbBurstTimer > 0) s.orbBurstTimer -= dt; if (s.powerSwingTimer > 0) s.powerSwingTimer -= dt;
    if (s.orbLockTimer > 0) s.orbLockTimer -= dt;
    if (s.slowTimer > 0) { s.slowTimer -= dt; if (s.slowTimer <= 0) s.slow = 0; }
    s.heat = Math.max(0, s.heat - cfg.railship.heat.decayPerSec * dt);
    if (s.cracked) { s.crackTimer -= dt; if (s.crackTimer <= 0) s.cracked = false; }
    const regen = cfg.player.regen;
    if (s.combatTimer > 0) s.combatTimer -= dt;
    else if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + regen.perSec * dt);
  }

  function simShip(s, dt, intent) {
    s.px = s.x; s.py = s.y; s.aim = intent.aim;
    const fam = FAMILY[s.classId];
    let speedMul = 1;
    if (fam === 'rail' && s.charging) { const m = cfg.railship.movementWhileCharging; speedMul = s.charge > 1 ? m.overcharge : s.charge <= 0.5 ? m.to50 : s.charge <= 0.9 ? m.to90 : m.to100; }
    else if (fam === 'hammer' && s.ramWinding) speedMul = 0.4;
    if (s.slowTimer > 0) speedMul *= (1 - s.slow);
    const speed = cfg.player.baseSpeed * (s.classStats.speed || 1) * speedMul;
    s.vx = intent.moveX * speed; s.vy = intent.moveY * speed;
    s.x += (s.vx + s.impX) * dt; s.y += (s.vy + s.impY) * dt;
    const dampRate = s.ramActive > 0 ? cfg.hammerhead.lunge.glideDampPerSec : cfg.player.impulseDampPerSec;
    const damp = Math.max(0, 1 - dampRate * dt); s.impX *= damp; s.impY *= damp;
    s.x = Math.max(s.radius, Math.min(cfg.arena.width - s.radius, s.x));
    s.y = Math.max(s.radius, Math.min(cfg.arena.height - s.radius, s.y));

    if (intent.firing || intent.ability || intent.special) s.combatTimer = cfg.player.regen.delaySec;
    if (intent.ability && s.abilityCd <= 0) s.abilityCd = PULSAR.resolveAbility(classNode(s.classId).ability).activate(api, s) || 0;
    if (intent.special && s.specialCd <= 0) s.specialCd = PULSAR.resolveSpecial(classNode(s.classId).special).activate(api, s) || 0;
    PULSAR.resolveWeapon(classNode(s.classId).weapon).update(api, s, dt, { firing: intent.firing, aimDist: intent.aimDist });

    if (s.spawnProtect <= 0 && s.contactCd <= 0) {
      for (const o of state.objects) {
        const dx = s.x - o.x, dy = s.y - o.y, rr = s.radius + o.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.hypot(dx, dy) || 1;
        let dmg = cfg.farming.contactDamage[o.type];
        if (s.ramActive > 0) dmg *= (1 - cfg.hammerhead.lunge.selfDamageReduction);
        damageShip(s, dmg, { dx: dx / d, dy: dy / d, knockback: cfg.combat.knockbackBase, source: null });
        o.vx -= (dx / d) * 80; o.vy -= (dy / d) * 80; s.contactCd = cfg.farming.contactCooldownSec;
        break;
      }
    }
  }

  // ---- player input → intent (overlay/admin handled here) -------------------
  let uiButtons = [];
  function playerStep(dt) {
    const e = evolveOptions(p);
    if (e && e.levelOk) for (let i = 0; i < e.options.length; i++) { const down = Input.key('Digit' + (i + 1)); if (down && !p._numPrev[i]) chooseEvolution(p, i); p._numPrev[i] = down; }
    const prevFire = p._firePrev;
    if (Input.firing && !prevFire) for (const b of uiButtons) { if (Input.mouseX >= b.x && Input.mouseX <= b.x + b.w && Input.mouseY >= b.y && Input.mouseY <= b.y + b.h) { b.onClick(); p._suppressFire = true; break; } }
    if (!Input.firing) p._suppressFire = false; p._firePrev = Input.firing;
    const lDown = Input.key('KeyL'); if (lDown && !p._adminPrev) adminLevelUp(); p._adminPrev = lDown;

    const mdx = Input.mouseX - Render.viewW / 2, mdy = Input.mouseY - Render.viewH / 2;
    const aim = Math.atan2(mdy, mdx), aimDist = Math.hypot(mdx, mdy); // world == screen scale (camera on ship)
    const dir = Input.moveDir();
    const isGrav = FAMILY[p.classId] === 'grav';
    const aDown = Input.key('Space'), aEdge = aDown && !p._abilityPrev; p._abilityPrev = aDown;
    const sDown = Input.key('KeyE'), sEdge = sDown && !p._specialPrev; p._specialPrev = sDown;
    // Gravitor: pulling is passive (weapon always active under cap); left-click edge = launch.
    const abilityIntent = isGrav ? (Input.firing && !prevFire && !p._suppressFire) : aEdge;
    simShip(p, dt, { moveX: dir.x, moveY: dir.y, aim, aimDist, firing: Input.firing && !p._suppressFire, ability: abilityIntent, special: sEdge });
  }
  const botWorld = { ships: null, objects: state.objects, config: cfg, time: 0, arena: cfg.arena, familyOf: (id) => FAMILY[id] };
  function botStep(b, dt) {
    botMaybeEvolve(b);
    botWorld.ships = allShips(); botWorld.time = state.time;
    simShip(b, dt, PULSAR.Bots.intent(b, botWorld, dt));
  }

  // ---- simulation ------------------------------------------------------------
  function simulate(dt) {
    state.time += dt;
    pulsarPulse(dt);
    for (const s of allShips()) tickTimers(s, dt);
    if (!gameStarted) p.spawnProtect = Math.max(p.spawnProtect, 0.5);        // idle + safe behind the title
    else if (!p.alive) { p.respawnTimer -= dt; if (p.respawnTimer <= 0) respawnShip(p); } else playerStep(dt);
    for (const b of state.bots) { if (!b.alive) { b.respawnTimer -= dt; if (b.respawnTimer <= 0) respawnShip(b); } else botStep(b, dt); }
    if (PULSAR.Net.connected) {
      // Bots stay in multiplayer as filler; they only clear once the lobby exceeds 10 real players.
      const players = 1 + PULSAR.Net.count;
      if (players > 10) { if (state.bots.length) state.bots.length = 0; }
      else if (state.bots.length === 0) spawnBots();
      for (const pr of state.projectiles) if (!pr._netSent && pr.owner === p) { pr._netSent = true; PULSAR.Net.sendProjectile(pr); } // show our shots on their screens
      PULSAR.Net.step(p, dt);
    }
    updateLeader();
    simulateProjectiles(dt); simulateObjects(dt); simulateMotes(dt); Fx.update(dt);
  }
  function pulsarPulse(dt) {
    state.pulsarTimer -= dt;
    if (state.pulsarTimer > 0) return;
    state.pulsarTimer += cfg.arena.pulsarPulseIntervalSec;
    const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
    ejectMotes(cx, cy, eco.pulsarMotesPerPulse, eco.pulsarScrapPerMote, { speed: pk.pulsarMoteSpeed, life: pk.pulsarMoteLifeSec, pulsar: true, evenIndex: 0 });
    Fx.spawnParticles(cx, cy, 18, '#dff0ff', { speed: 280 });
  }
  function simulateProjectiles(dt) {
    const harvest = cfg.gravitor.orbitalHarvestBonus;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const pr = state.projectiles[i];
      pr.px = pr.x; pr.py = pr.y; pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      let dead = pr.life <= 0 || pr._broken;   // _broken = shot down by an enemy this tick
      if (!dead) {
        // Flailship's chain orb intercepts enemy shots its hitbox physically touches (honest-VFX
        // shield — naturally blocks "some" since the orb is small and moving). Works in every orb
        // state: orbiting close OR thrown out in front of you.
        for (const s of allShips()) {
          if (!s.alive || !s.orbActive || s.team === pr.team) continue;
          const rr = pr.radius + s.orbBlockRadius;
          if ((pr.x - s.orbX) ** 2 + (pr.y - s.orbY) ** 2 <= rr * rr) { Fx.spawnParticles(pr.x, pr.y, 6, '#ffe6a8', { speed: 160, life: 0.3 }); dead = true; break; }
        }
      }
      if (!dead) {
        let target = null;
        for (const s of allShips()) { if (!s.alive || s.team === pr.team || s.spawnProtect > 0) continue; const rr = pr.radius + s.radius; if ((pr.x - s.x) ** 2 + (pr.y - s.y) ** 2 <= rr * rr) { target = s; break; } }
        if (!target) for (const o of state.objects) { const rr = pr.radius + o.radius; if ((pr.x - o.x) ** 2 + (pr.y - o.y) ** 2 <= rr * rr) { target = o; break; } }
        if (target) {
          const d = Math.hypot(pr.vx, pr.vy) || 1;
          api.damage(target, pr.damage, { dx: pr.vx / d, dy: pr.vy / d, knockback: 40, source: pr.owner });
          if (pr.harvest && !target.isShip && target.hp <= 0 && pr.owner && pr.owner.alive) earn(pr.owner, harvest);
          if (--pr.pierceLeft <= 0) dead = true;
        }
      }
      if (!dead && (pr.x < 0 || pr.y < 0 || pr.x > cfg.arena.width || pr.y > cfg.arena.height)) dead = true;
      if (dead) {
        // Thrown rocks shatter when they die — on impact, when shot down, or after missing.
        if (pr.isThrownRock) Fx.spawnParticles(pr.x, pr.y, cfg.fx.breakParticles, OBJDEF[pr.rockType || 'asteroid'].hue, { speed: 240 });
        state.projectiles.splice(i, 1);
      }
    }
  }
  function simulateObjects(dt) {
    for (const o of state.objects) {
      o.px = o.x; o.py = o.y; o.spin += o.spinRate * dt; o.x += o.vx * dt; o.y += o.vy * dt;
      const damp = Math.max(0, 1 - 4 * dt); o.vx *= damp; o.vy *= damp;
      if (o.flash > 0) o.flash -= dt; if (o.cracked) { o.crackTimer -= dt; if (o.crackTimer <= 0) o.cracked = false; }
    }
    for (let i = state.respawns.length - 1; i >= 0; i--) { state.respawns[i].timer -= dt; if (state.respawns[i].timer <= 0) { spawnArenaObject(); state.respawns.splice(i, 1); } }
  }
  function simulateMotes(dt) {
    for (let i = state.motes.length - 1; i >= 0; i--) {
      const m = state.motes[i]; m.px = m.x; m.py = m.y;
      let best = null, bd = pk.collectRadius;
      for (const s of allShips()) { if (!s.alive) continue; const d = Math.hypot(s.x - m.x, s.y - m.y); if (d < bd) { bd = d; best = s; } }
      if (best) {
        const d = Math.hypot(best.x - m.x, best.y - m.y) || 1;
        if (d <= best.radius + pk.moteRadius) { earn(best, m.value); state.motes.splice(i, 1); continue; }
        m.x += (best.x - m.x) / d * pk.vacuumSpeed * dt; m.y += (best.y - m.y) / d * pk.vacuumSpeed * dt;
      } else { m.vx *= (1 - 1.6 * dt); m.vy *= (1 - 1.6 * dt); m.x += m.vx * dt; m.y += m.vy * dt; }
      m.life -= dt; if (m.life <= 0) state.motes.splice(i, 1);
    }
  }

  // ---- render ----------------------------------------------------------------
  function onScreen(x, y, pad) { return x > Render.camera.x - Render.viewW / 2 - pad && x < Render.camera.x + Render.viewW / 2 + pad && y > Render.camera.y - Render.viewH / 2 - pad && y < Render.camera.y + Render.viewH / 2 + pad; }
  function render(alpha) {
    const R = Render;
    const pxi = lerp(p.px, p.x, alpha), pyi = lerp(p.py, p.y, alpha);
    R.camera.x = (p.alive ? pxi : p.x) + Fx.shakeX(); R.camera.y = (p.alive ? pyi : p.y) + Fx.shakeY();
    R.beginFrame(); R.drawGrid(); R.drawPulsar(state.time);

    // BLOOM PASS
    R.setComposite('lighter');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 40)) continue; R.glow(R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha)), o.radius * 1.5, R.hexToRgb(OBJDEF[o.type].hue), 0.2 + (o.flash > 0 ? 0.5 : 0) + (o.cracked ? 0.15 : 0)); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 30)) continue; R.glow(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius * 3, m.pulsar ? [200, 230, 255] : [255, 210, 120], m.pulsar ? 0.7 : 0.5); }
    for (const pr of state.projectiles) R.glow(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 1.6 : 2.4), R.hexToRgb(pr.color), 0.85);
    for (const g of PULSAR.Net.ghosts) R.glow(R.sx(g.x), R.sy(g.y), g.r * (g.kind === 'rock' ? 1.6 : 2.4), R.hexToRgb(g.col), 0.85);
    Fx.draw(R, alpha, lerp);
    for (const s of allShips()) { if (!s.alive || !onScreen(s.x, s.y, s.radius * 5)) continue; shipBloom(R, s, alpha, s === p); }

    // CORE PASS
    R.setComposite('source-over');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 20)) continue; drawObject(R.ctx, o, R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha))); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 20)) continue; R.solidCircle(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius, m.pulsar ? '#eaf4ff' : '#ffe6a8'); }
    for (const pr of state.projectiles) R.solidCircle(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 0.8 : 0.6), pr.kind === 'rock' ? '#d9c2ff' : '#ffffff');
    for (const g of PULSAR.Net.ghosts) R.solidCircle(R.sx(g.x), R.sy(g.y), g.r * (g.kind === 'rock' ? 0.8 : 0.6), g.kind === 'rock' ? '#d9c2ff' : '#ffffff');
    for (const s of allShips()) {
      if (!s.alive || !onScreen(s.x, s.y, s.radius * 5)) continue;
      const sxi = R.sx(lerp(s.px, s.x, alpha)), syi = R.sy(lerp(s.py, s.y, alpha));
      drawClassExtras(R, s, sxi, syi);
      drawShip(R.ctx, sxi, syi, s, s === p);
      if (s !== p) drawEnemyTag(R.ctx, s, sxi, syi);
    }

    uiButtons = [];
    drawHud(); drawLeaderboard(); drawKillFeed(); drawMinimap(); drawEvolveOverlay(); drawDevPanel();
  }

  function shipBloom(R, s, alpha, isPlayer) {
    const cx = R.sx(lerp(s.px, s.x, alpha)), cy = R.sy(lerp(s.py, s.y, alpha)), hue = R.hexToRgb(hueFor(s.classId));
    const threat = lerp(cfg.readability.threatBloomScale, cfg.readability.threatBloomMax, Math.min(1, s.scrap / cfg.readability.threatScrapForMax));
    const chargeGlow = s.charging ? 0.4 * Math.min(1.25, s.charge) : 0;
    const tierBoost = (classNode(s.classId).tier - 1) * 0.06;
    const scale = isPlayer ? cfg.readability.yourShipBloomScale : 1.0;
    R.glow(cx, cy, s.radius * (3.0 + chargeGlow) * scale * threat, hue, (isPlayer ? 0.45 : 0.32) + chargeGlow * 0.4 + tierBoost);
    if (s.heat > cfg.railship.heat.max * 0.6 || s.ventTimer > 0) R.glow(cx, cy, s.radius * 2.4, [255, 120, 60], 0.22 + 0.4 * (s.heat / cfg.railship.heat.max));
  }
  function drawEnemyTag(ctx, s, x, y) {
    if (s.name) { ctx.textAlign = 'center'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = s.isLeader ? '#ffd98a' : 'rgba(220,235,255,0.85)'; ctx.fillText(s.name, x, y - s.radius - 16); ctx.textAlign = 'left'; }
    if (s.hp < s.maxHp) { const w = s.radius * 2.2, hb = y - s.radius - 12; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - w / 2, hb, w, 3); ctx.fillStyle = s.isLeader ? '#ffd98a' : '#ff8a8a'; ctx.fillRect(x - w / 2, hb, w * Math.max(0, s.hp / s.maxHp), 3); }
  }

  // ---- ship silhouettes ------------------------------------------------------
  const SIL = {
    smallTriangle: { k: 'dart' },
    spear: { k: 'spear', len: 2.1, back: 0.7 }, thinSpear: { k: 'spear', len: 2.6, back: 0.52 }, longSpear: { k: 'spear', len: 3.1, back: 0.42 },
    wedge: { k: 'wedge', front: 1.3, span: 1.05 }, broadWedge: { k: 'wedge', front: 1.42, span: 1.4 }, massiveWedge: { k: 'wedge', front: 1.55, span: 1.75 },
    crescent: { k: 'crescent', t: 1.0 }, crescentHeavy: { k: 'crescent', t: 1.35 }, crescentWide: { k: 'crescent', t: 1.55 },
    ringedHull: { k: 'ringed' },
  };
  function silFor(id) { const v = PULSAR.classVisuals[id]; return (v && SIL[v.silhouette]) || SIL.spear; }
  function drawShip(ctx, x, y, s, isPlayer) {
    const r = s.radius, hue = hueFor(s.classId), sil = silFor(s.classId), tier = classNode(s.classId).tier;
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.aim);
    if (s.spawnProtect > 0) { ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, TAU); ctx.strokeStyle = `rgba(190,233,255,${0.25 + 0.2 * Math.sin(state.time * 18)})`; ctx.lineWidth = 2; ctx.stroke(); }
    const fill = s.hitFlash > 0 ? 'rgba(255,140,140,0.95)' : `${hue}e6`;
    if (sil.k === 'spear') drawSpear(ctx, r, s, fill, sil);
    else if (sil.k === 'wedge') drawWedge(ctx, r, s, fill, sil);
    else if (sil.k === 'crescent') drawCrescent(ctx, r, s, fill, sil);
    else if (sil.k === 'ringed') drawRingedHull(ctx, r, s, fill, tier);
    else drawDart(ctx, r, s, fill);
    if (tier >= 2) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < tier - 1; i++) { ctx.beginPath(); ctx.arc(-r * 0.2, (i - (tier - 2) / 2) * r * 0.5, r * 0.13, 0, TAU); ctx.fill(); } }
    ctx.restore();
    if (isPlayer) { ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    if (s.isLeader) drawCrown(ctx, x, y, r);
  }
  function stroke(ctx) { ctx.strokeStyle = 'rgba(230,245,255,0.95)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  function drawDart(ctx, r, s, fill) { ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * 0.9, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r * 0.9, -r * 0.85); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); stroke(ctx); }
  function drawSpear(ctx, r, s, fill, sil) {
    ctx.beginPath(); ctx.moveTo(r * sil.len, 0); ctx.lineTo(-r * 0.8, r * sil.back); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * sil.back); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    if (s.charging) { const c = Math.min(1.25, s.charge); ctx.beginPath(); ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * (sil.len + c * 0.8), 0); ctx.strokeStyle = c > 1.0 ? 'rgba(255,210,120,0.95)' : `rgba(255,255,255,${0.5 + 0.5 * c})`; ctx.lineWidth = 1.5 + c * 2.5; ctx.stroke(); }
  }
  function drawWedge(ctx, r, s, fill, sil) {
    ctx.beginPath(); ctx.moveTo(r * sil.front, r * sil.span); ctx.lineTo(r * sil.front, -r * sil.span); ctx.lineTo(-r * 1.0, -r * sil.span * 0.43); ctx.lineTo(-r * 1.0, r * sil.span * 0.43); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    if (s.ramWinding || s.ramActive > 0) { const c = s.ramActive > 0 ? 1 : s.ramCharge; ctx.beginPath(); ctx.arc(r * sil.front, 0, r * (0.4 + 0.6 * c), 0, TAU); ctx.strokeStyle = `rgba(255,130,60,${0.5 + 0.4 * c})`; ctx.lineWidth = 2 + 2 * c; ctx.stroke(); }
  }
  function drawCrescent(ctx, r, s, fill, sil) { const off = r * (0.5 + (sil.t - 1) * 0.3), ir = r * (0.95 - (sil.t - 1) * 0.28); ctx.beginPath(); ctx.arc(0, 0, r, -1.1, 1.1); ctx.arc(off, 0, ir, 1.0, -1.0, true); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); stroke(ctx); }
  function drawRingedHull(ctx, r, s, fill, tier) {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.lineTo(r * 0.2, r * 0.5); ctx.lineTo(r * 0.2, -r * 0.5); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    for (let i = 0; i < (tier || 1); i++) { ctx.beginPath(); ctx.arc(0, 0, r * (1.2 + i * 0.22), 0, TAU); ctx.strokeStyle = `rgba(255,210,120,${0.4 - i * 0.08})`; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function drawCrown(ctx, x, y, r) { const w = r * 1.3, h = r * 0.8, top = y - r * 2.4; ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(x - w, top + h); ctx.lineTo(x - w, top); ctx.lineTo(x - w * 0.4, top + h * 0.55); ctx.lineTo(x, top - h * 0.35); ctx.lineTo(x + w * 0.4, top + h * 0.55); ctx.lineTo(x + w, top); ctx.lineTo(x + w, top + h); ctx.closePath(); ctx.fill(); }

  function drawClassExtras(R, s, cx, cy) {
    const fam = FAMILY[s.classId], ctx = R.ctx;
    if (fam === 'grav') {
      const G = cfg.gravitor, drag = (s.classId === 'singularity' || s.classId === 'eventHorizon');
      ctx.strokeStyle = drag ? 'rgba(176,107,255,0.4)' : 'rgba(176,107,255,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, (drag ? G.well.pullRadius * G.tidalDrag.radiusMult : G.well.pullRadius) * 0.25, 0, TAU); ctx.stroke();
      const cap = s.captured.length;
      // Held rocks ride at full ASTEROID size AND keep their real neutral-object shape (asteroid/
      // crystal/debris) — just haloed by the well's purple pull. They're "transparent" while held
      // (not in the world → can't be destroyed, don't block damage), only breakable once shot.
      for (let i = 0; i < cap; i++) {
        const held = s.captured[i], type = held.type || 'asteroid', rr = held.radius || 18;
        const a = s.orbSpin + i * (TAU / Math.max(1, cap));
        const rx = cx + Math.cos(a) * (s.radius + G.orbit.radius), ry = cy + Math.sin(a) * (s.radius + G.orbit.radius);
        R.setComposite('lighter'); R.glow(rx, ry, rr * 1.5, [176, 107, 255], 0.4); R.setComposite('source-over');
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(s.orbSpin * 1.6 + i);
        (ROCK_PATH[type] || asteroidPath)(ctx, rr);
        ctx.fillStyle = ROCK_FILL[type] || ROCK_FILL.asteroid; ctx.fill();
        ctx.strokeStyle = 'rgba(210,190,255,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();   // purple well rim over the real shape
        ctx.restore();
      }
    } else if (fam === 'rail') {
      const RC = cfg.railship.charge, t = state.time;
      const full = s.charge >= RC.lanceMax;
      // BEFORE full: the ship DRAINS energy from the space around it — streaks spiral inward and
      // brighten as they fall toward the hull. The intake STOPS once full charge is reached.
      if (s.charging && !full) {
        const ch = Math.min(1, s.charge), hue = [150, 232, 255];
        const Rmax = s.radius * (4.5 + 3.0 * ch);
        R.setComposite('lighter');
        ctx.lineCap = 'round';
        for (let i = 0; i < 12; i++) {
          const phase = (t * (0.55 + 0.6 * ch) + i / 12) % 1;
          const frac = 1 - phase;
          const a = (i / 12) * TAU + (1 - frac) * 1.7 + t * 0.25;
          const r = s.radius * 0.5 + frac * Rmax;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          const tr = r + Rmax * 0.16, tx = cx + Math.cos(a + 0.16) * tr, ty = cy + Math.sin(a + 0.16) * tr;
          const al = ch * (0.18 + 0.55 * (1 - frac));
          ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${al})`;
          ctx.lineWidth = 1 + 1.6 * (1 - frac) * ch;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
          R.glow(x, y, (2 + 3 * (1 - frac)) * (0.7 + ch * 0.5), hue, al * 0.8);
        }
        const ring = Rmax * (0.7 + 0.3 * Math.sin(t * 6));
        ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${0.12 * ch})`;
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke();
        R.setComposite('source-over');
      } else if (s.charging && full) {
        // AT full: intake stops; the core REDLINES — gold -> deep red over overheatSec, pulsing
        // faster as it nears the blowout. Sells "hold too long and you overheat".
        const hf = Math.min(1, (s.chargeFullTimer || 0) / RC.overheatSec);
        const col = [255, Math.round(190 - 150 * hf), Math.round(90 - 65 * hf)];
        const pulse = 0.6 + 0.4 * Math.sin(t * (8 + 26 * hf));
        R.setComposite('lighter');
        R.glow(cx, cy, s.radius * (3.0 + 2.6 * hf), col, (0.30 + 0.5 * hf) * pulse);
        if (hf > 0.45) { // crackling embers as it approaches blowout
          for (let i = 0; i < 5; i++) { const a = t * 7 + i * 1.7, rr = s.radius * (1.4 + 1.6 * Math.abs(Math.sin(t * 5 + i))); R.glow(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 5 * hf, [255, 90, 50], 0.7 * hf); }
        }
        R.setComposite('source-over');
      }
    } else if (fam === 'flail') {
      const ox = R.sx(s.orbX), oy = R.sy(s.orbY);
      ctx.strokeStyle = s.orbLockTimer > 0 ? 'rgba(255,230,150,0.8)' : 'rgba(255,210,120,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke();
      R.setComposite('lighter'); R.glow(ox, oy, cfg.flailship.orb.tipRadius * 2.2, [255, 210, 120], 0.8); R.setComposite('source-over');
      ctx.fillStyle = '#ffe6a8'; ctx.beginPath(); ctx.arc(ox, oy, cfg.flailship.orb.tipRadius, 0, TAU); ctx.fill();
    }
  }

  // ---- neutral object shapes -------------------------------------------------
  function drawObject(ctx, o, x, y) {
    if (o.type === 'crystal') return drawShape(ctx, o, x, y, crystalPath, 'rgba(180,255,240,0.95)', 'rgba(94,234,212,0.55)', 'rgba(150,255,235,0.9)');
    if (o.type === 'debris') return drawShape(ctx, o, x, y, debrisPath, 'rgba(160,175,195,0.9)', 'rgba(75,85,100,0.85)', 'rgba(140,160,185,0.6)');
    return drawShape(ctx, o, x, y, asteroidPath, 'rgba(150,165,190,0.9)', 'rgba(70,80,98,0.9)', 'rgba(150,170,200,0.7)');
  }
  function drawShape(ctx, o, x, y, pathFn, hitFill, fill, strokeC) { ctx.save(); ctx.translate(x, y); ctx.rotate(o.spin); pathFn(ctx, o.radius); ctx.fillStyle = o.flash > 0 ? hitFill : fill; ctx.fill(); ctx.strokeStyle = strokeC; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); objectOverlays(ctx, o, x, y); }
  function asteroidPath(ctx, r) { ctx.beginPath(); for (let i = 0; i <= 9; i++) { const a = (i / 9) * TAU, rr = r * (0.82 + 0.18 * Math.sin(a * 3 + 1.3) * Math.cos(a * 2)); const vx = Math.cos(a) * rr, vy = Math.sin(a) * rr; i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy); } ctx.closePath(); }
  // shape + fill lookups for gravitor-held rocks (drawn with their real neutral-object silhouette)
  const ROCK_PATH = { asteroid: asteroidPath, crystal: crystalPath, debris: debrisPath };
  const ROCK_FILL = { asteroid: 'rgba(150,165,190,0.92)', crystal: 'rgba(120,240,220,0.7)', debris: 'rgba(120,135,160,0.9)' };
  function crystalPath(ctx, r) { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); }
  function debrisPath(ctx, r) { ctx.beginPath(); ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.3, r); ctx.closePath(); }
  function objectOverlays(ctx, o, x, y) {
    if (o.hp < o.maxHp) { ctx.beginPath(); ctx.arc(x, y, o.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (o.hp / o.maxHp)); ctx.strokeStyle = 'rgba(120,200,160,0.55)'; ctx.lineWidth = 2; ctx.stroke(); }
    if (o.cracked) { ctx.strokeStyle = `rgba(255,170,90,${0.5 + 0.3 * Math.sin(state.time * 14)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, o.radius + 9, 0, TAU); ctx.stroke(); }
  }

  // ---- HUD / overlay / minimap ----------------------------------------------
  let fps = 0, fpsAccum = 0, fpsFrames = 0;
  function bar(ctx, x, y, w, h, frac, fill) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = fill; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h); }
  function drawHud() {
    const ctx = Render.ctx, x = 16, w = 220, fam = FAMILY[p.classId];
    bar(ctx, x, 16, w, 10, p.hp / p.maxHp, '#7be0a0');
    if (fam === 'rail') { const hf = p.heat / cfg.railship.heat.max; bar(ctx, x, 30, w, 8, hf, p.ventTimer > 0 ? '#ff5b5b' : (hf > 0.7 ? '#ff9b3c' : '#ffd23c')); if (p.charging) bar(ctx, x, 40, w, 6, Math.min(1.25, p.charge) / 1.25, p.charge > 1 ? '#ffd98a' : '#bfe9ff'); }
    else if (fam === 'hammer' && (p.ramWinding || p.ramActive > 0)) bar(ctx, x, 30, w, 6, p.ramActive > 0 ? 1 : p.ramCharge, '#ff9b3c');
    const cur = xpForLevel(p.level), nxt = xpForLevel(p.level + 1); bar(ctx, x, 50, w, 6, (p.xp - cur) / Math.max(1, nxt - cur), '#6aa9ff');
    ctx.textAlign = 'left';
    ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff'; ctx.fillText(`${classNode(p.classId).displayName}  ·  LV ${p.level}${p.isLeader ? '  ★' : ''}`, x, 76);
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#ffd98a'; ctx.fillText(`SCRAP ${Math.floor(p.scrap)}   ⚔ ${p.kills}`, x, 94);
    const abil = classNode(p.classId).ability, spec = classNode(p.classId).special;
    const abilKey = fam === 'grav' ? '[click]' : '[Space]';
    ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = p.abilityCd > 0 ? 'rgba(160,190,220,0.4)' : '#7be0ff';
    ctx.fillText(abil ? (p.abilityCd > 0 ? `${abil} ${p.abilityCd.toFixed(1)}s` : `${abil} ready ${abilKey}`) : 'no ability (Scout)', x, 112);
    if (spec) { ctx.fillStyle = p.specialCd > 0 ? 'rgba(255,180,120,0.4)' : '#ffb27a'; ctx.fillText(p.specialCd > 0 ? `${spec} ${p.specialCd.toFixed(1)}s` : `${spec} ready [E]`, x, 128); }
    const fireHint = fam === 'grav' ? 'click=launch · auto-pulls rocks'
      : fam === 'flail' ? 'click=throw orb (auto-returns)'
      : 'hold=fire · Space=ability';
    ctx.fillStyle = 'rgba(160,190,220,0.5)'; ctx.fillText(`${fps.toFixed(0)} fps · WASD · ${fireHint} · E=special`, x, spec ? 144 : 128);
    if (PULSAR.Net.MULTIPLAYER) {
      const on = PULSAR.Net.connected;
      ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = on ? '#7be0a0' : 'rgba(255,180,120,0.8)';
      ctx.fillText(on ? `◉ MULTIPLAYER · ${PULSAR.Net.count + 1} players` : '◌ connecting…', x, spec ? 160 : 144);
    }
    if (!p.alive) { ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ff8a8a'; ctx.fillText('WRECKED — respawning…', Render.viewW / 2, Render.viewH / 2 + 90); ctx.textAlign = 'left'; }
  }
  function drawLeaderboard() {
    const ctx = Render.ctx, ranked = allShips().filter(s => s.alive).sort((a, b) => b.scrap - a.scrap).slice(0, 4);
    const x = Render.viewW - 164, y0 = 48;
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(160,190,220,0.7)'; ctx.fillText('LEADERBOARD', x, y0);
    ctx.font = '400 11px system-ui, sans-serif';
    ranked.forEach((s, i) => { ctx.fillStyle = s === p ? '#bfe9ff' : (s.isLeader ? '#ffd98a' : 'rgba(220,230,245,0.7)'); ctx.fillText(`${i + 1}. ${s === p ? 'YOU' : nameOf(s)}`, x, y0 + 16 + i * 14); ctx.textAlign = 'right'; ctx.fillText('' + Math.floor(s.scrap), x + 148, y0 + 16 + i * 14); ctx.textAlign = 'left'; });
  }
  function drawDevPanel() {
    const ctx = Render.ctx, w = 150, h = 26, x = Render.viewW - w - 14;
    ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,140,230,0.55)';
    ctx.fillText('DEV', x + w, 10); ctx.textAlign = 'left';
    const btn = (y, label, fg, bg, border, onClick) => {
      ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = fg;
      ctx.fillText(label, x + w / 2, y + 17); ctx.textAlign = 'left';
      uiButtons.push({ x, y, w, h, onClick });
    };
    btn(16, 'ADMIN ▸ +1 LVL  [L]', '#ffb4ee', 'rgba(58,18,58,0.75)', 'rgba(255,140,230,0.7)', adminLevelUp);
    // Bot toggle (single-player only — in multiplayer the world is players, bots stay off).
    if (!PULSAR.Net.connected) {
      const on = state.bots.length > 0;
      btn(48, on ? 'BOTS: ON' : 'BOTS: OFF',
        on ? '#9fe8ff' : 'rgba(170,185,205,0.8)',
        on ? 'rgba(18,40,58,0.78)' : 'rgba(28,30,38,0.78)',
        on ? 'rgba(120,200,255,0.65)' : 'rgba(140,150,170,0.5)', toggleBots);
    }
  }
  function drawEvolveOverlay() {
    const e = evolveOptions(p);
    if (!e || !e.levelOk || !p.alive) return;
    const ctx = Render.ctx, bw = 270, bh = 30, gap = 8, n = e.options.length;
    const panelW = bw + 24, panelH = 44 + n * (bh + gap), x0 = (Render.viewW - panelW) / 2, y0 = 70;
    ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.fillRect(x0, y0, panelW, panelH); ctx.strokeStyle = 'rgba(120,224,255,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, panelW, panelH);
    ctx.textAlign = 'center'; ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff'; ctx.fillText(`EVOLVE — choose (cost ${e.cost} scrap)`, x0 + panelW / 2, y0 + 24);
    const afford = p.scrap >= e.cost;
    for (let i = 0; i < n; i++) {
      const bx = x0 + 12, by = y0 + 36 + i * (bh + gap); uiButtons.push({ x: bx, y: by, w: bw, h: bh, onClick: () => chooseEvolution(p, i) });
      ctx.fillStyle = afford ? 'rgba(120,224,255,0.14)' : 'rgba(120,140,160,0.10)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = afford ? 'rgba(120,224,255,0.5)' : 'rgba(120,140,160,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = afford ? '#eaf6ff' : 'rgba(200,215,230,0.5)';
      ctx.fillText(`[${i + 1}] ${e.options[i].displayName}`, bx + 10, by + 13); ctx.font = '400 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(180,205,230,0.7)'; ctx.fillText(EVOLVE_BLURB[e.options[i].id] || '', bx + 10, by + 25);
    }
    if (!afford) { ctx.textAlign = 'center'; ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,180,120,0.8)'; ctx.fillText(`need ${e.cost - Math.floor(p.scrap)} more scrap`, x0 + panelW / 2, y0 + panelH - 8); }
    ctx.textAlign = 'left';
  }
  function drawMinimap() {
    const ctx = Render.ctx, size = 150, pad = 14, x0 = Render.viewW - size - pad, y0 = Render.viewH - size - pad, sc = size / cfg.arena.width;
    ctx.fillStyle = 'rgba(8,12,20,0.6)'; ctx.fillRect(x0, y0, size, size); ctx.strokeStyle = 'rgba(80,120,180,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, size, size);
    const px = x0 + (cfg.arena.width / 2) * sc, py = y0 + (cfg.arena.height / 2) * sc;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 2.5 + Math.max(0, Math.sin(state.time * (TAU / cfg.arena.pulsarPulseIntervalSec))), 0, TAU); ctx.fill();
    // Each ship is a CLASS-COLOURED arrow pointing where it faces (you = cyan + ring, leader = gold rim).
    for (const s of allShips()) {
      if (!s.alive) continue;
      const mx = x0 + s.x * sc, my = y0 + s.y * sc, isMe = s === p, r = s.isLeader ? 4.6 : 3.4;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(s.aim);
      ctx.fillStyle = isMe ? '#39d0ff' : hueFor(s.classId);
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.62); ctx.lineTo(-r * 0.7, -r * 0.62); ctx.closePath(); ctx.fill();
      if (s.isLeader) { ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
      if (isMe) { ctx.strokeStyle = 'rgba(57,208,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, r + 2.5, 0, TAU); ctx.stroke(); }
    }
  }
  function drawKillFeed() {
    const ctx = Render.ctx, x = Render.viewW - 16; let y = 132;
    ctx.textAlign = 'right'; ctx.font = '600 12px system-ui, sans-serif';
    for (let i = killFeed.length - 1; i >= 0; i--) {
      const k = killFeed[i], age = state.time - k.t;
      if (age > 6) continue;
      const a = Math.max(0, Math.min(1, (6 - age) / 1.5));
      const txt = k.killer ? `${k.killer}  ⚔  ${k.victim}` : `${k.victim}  ☠`;
      ctx.fillStyle = `rgba(${k.leader ? '255,210,120' : '230,160,150'},${0.9 * a})`;
      ctx.fillText(txt, x, y); y += 16;
    }
    ctx.textAlign = 'left';
  }

  // ---- loop ------------------------------------------------------------------
  let last = performance.now(), accumulator = 0;
  function frame(now) {
    let frameTime = (now - last) / 1000; last = now;
    if (frameTime > cfg.sim.maxFrameTimeSec) frameTime = cfg.sim.maxFrameTimeSec;
    accumulator += frameTime;
    while (accumulator >= DT) { simulate(DT); accumulator -= DT; }
    render(accumulator / DT);
    fpsAccum += frameTime; fpsFrames++;
    if (fpsAccum >= 0.5) { fps = fpsFrames / fpsAccum; fpsAccum = 0; fpsFrames = 0; }
    requestAnimationFrame(frame);
  }
  function boot() {
    const canvas = document.getElementById('game');
    Render.init(canvas); Input.attach(canvas);
    applyClassStats(p, true);
    if (PULSAR.Net.MULTIPLAYER) PULSAR.Net.init({
      // Incoming hit from another player: apply locally; if it kills us, credit + bounty the killer.
      onHit: (dmg, opts, killerId) => {
        if (!p.alive || !gameStarted) return;
        const carried = p.scrap, wasLeader = p.isLeader;
        damageShip(p, dmg, { crack: opts.crack });
        if (!p.alive && killerId) {
          let b = carried * eco.killScrapFraction; if (wasLeader) b *= cfg.leader.bountyScrapMultiplier;
          PULSAR.Net.sendKill(killerId, Math.floor(b), p.name || 'Player');
          addKill(PULSAR.Net.nameOf(killerId) || 'Player', p.name || 'YOU', wasLeader);
        }
      },
      // We killed a player: bank the bounty, tally the kill, post the feed.
      onKill: (bounty, victimName) => { if (!p.alive) return; p.kills = (p.kills || 0) + 1; if (bounty > 0) earn(p, bounty); Fx.spawnText(p.x, p.y - 30, '+' + bounty + ' KILL', '#ffd98a', { size: 14 }); addKill(p.name || 'YOU', victimName || 'Player', false); },
    });
    requestAnimationFrame(frame);
  }
  // Called by the title screen's PLAY button (index.html) — sets your name and drops you in.
  PULSAR.startGame = function (name) {
    p.name = (name || '').slice(0, 16).trim() || 'Player';
    gameStarted = true;
    p.spawnProtect = cfg.player.spawnProtectionSec;
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
