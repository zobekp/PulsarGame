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

  function classNode(id) { return PULSAR.classes[id]; }
  function childrenOf(id) { const out = []; for (const k in PULSAR.classes) if (PULSAR.classes[k].parentId === id && IMPLEMENTED.has(k)) out.push(PULSAR.classes[k]); return out; }

  // A no-op FX sink (default if none injected) — every method is harmless.
  const NULL_FX = { spawnParticles() {}, spawnBeam() {}, spawnText() {}, addShake() {}, update() {} };

  PULSAR.createWorld = function (opts) {
    opts = opts || {};
    const fx = opts.fx || NULL_FX;
    const onRemoteHit = opts.onRemoteHit || null;   // (ship, dmg, opts) — relay bridge; null on the server
    let nextId = 1;

    const state = {
      time: 0, pulsarTimer: cfg.arena.pulsarPulseIntervalSec,
      ships: [], projectiles: [], objects: [], motes: [], respawns: [],
    };

    function randomSpawn() { return { x: 200 + Math.random() * (cfg.arena.width - 400), y: 200 + Math.random() * (cfg.arena.height - 400) }; }

    function makeShip(o) {
      return {
        id: o.id != null ? o.id : nextId++,
        isShip: true, isBot: !!o.isBot, team: o.team, classId: o.classId || 'starter',
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
        captured: [], orbSpin: 0, orbAngle: 0, orbRadius: null, orbX: o.x, orbY: o.y, orbState: 'orbit', orbCd: 0, orbHitGen: 0,
        orbBurstTimer: 0, powerSwingTimer: 0, braceTimer: 0, orbLockTimer: 0, fireTimer: 0,
        cracked: false, crackTimer: 0, combatTimer: 0,
        ai: o.isBot ? { state: 'farm', t: 0, dodge: 0, dodgeDir: 1, strafeDir: 1 } : null,
        _intent: null,
      };
    }

    const enemiesOf = (ship) => { const out = []; for (const s of state.ships) if (s !== ship && s.alive && s.team !== ship.team) out.push(s); return out; };

    // ---- class identity / stats ----
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
      s.charge = 0; s.charging = false; s.heat = 0; s.ventTimer = 0; s.chargeFullTimer = 0;
      s.ramWinding = false; s.ramCharge = 0; s.ramActive = 0; s.ramHitList = [];
      s.captured = []; s.orbSpin = 0; s.orbAngle = 0; s.orbRadius = null; s.orbX = s.x; s.orbY = s.y;
      s.orbState = 'orbit'; s.orbCd = 0;
      s.orbBurstTimer = 0; s.powerSwingTimer = 0; s.braceTimer = 0; s.orbLockTimer = 0; s.fireTimer = 0;
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
      if (t >= 3) return null;
      const optsArr = childrenOf(s.classId);
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
    function addObject(type, x, y) {
      const hp = cfg.farming[OBJDEF[type].hp];
      state.objects.push({ type, x, y, px: x, py: y, vx: 0, vy: 0, radius: cfg.farming[OBJDEF[type].radius], hp, maxHp: hp, spin: Math.random() * TAU, spinRate: (Math.random() - 0.5) * 0.8, flash: 0, cracked: false, crackTimer: 0, _orbHit: -9 });
    }
    function spawnArenaObject() {
      const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
      for (let t = 0; t < 24; t++) { const x = Math.random() * cfg.arena.width, y = Math.random() * cfg.arena.height; if (Math.hypot(x - cx, y - cy) < af.pulsarClearRadius) continue; if (Math.random() <= densityAt(x, y)) { addObject(pickType(), x, y); return; } }
      addObject(pickType(), Math.random() * cfg.arena.width, Math.random() * cfg.arena.height);
    }
    function ejectMotes(x, y, count, valueEach, o) {
      o = o || {};
      const speed = o.speed != null ? o.speed : pk.moteDriftSpeed, life = o.life != null ? o.life : pk.moteLifeSec;
      for (let i = 0; i < count; i++) { const a = o.evenIndex != null ? (i / count) * TAU + Math.random() * 0.3 : Math.random() * TAU; state.motes.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, value: valueEach, pulsar: !!o.pulsar }); }
    }

    // ---- damage ----
    function damageObject(o, dmg, opts) {
      opts = opts || {};
      o.hp -= dmg * (o.cracked ? (1 + cfg.railship.armorCrack.damageAmp) : 1);
      o.flash = 0.12;
      if (opts.crack) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
      if (opts.knockback) { o.vx += (opts.dx || 0) * opts.knockback; o.vy += (opts.dy || 0) * opts.knockback; }
      fx.spawnParticles(o.x, o.y, cfg.fx.hitParticles, OBJDEF[o.type].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
      if (o.hp <= 0) breakObject(o);
    }
    function damageThrownRock(r, dmg, opts) {
      opts = opts || {};
      r.hp -= dmg;
      fx.spawnParticles(r.x, r.y, cfg.fx.hitParticles, OBJDEF[r.rockType || 'asteroid'].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
      if (r.hp <= 0) r._broken = true;
    }
    function crackObject(o) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, cfg.railship.armorCrack.baseDurationSec); }
    function breakObject(o) {
      const total = eco[OBJDEF[o.type].scrap], n = cfg.farming.motesPerObject[o.type];
      ejectMotes(o.x, o.y, n, total / n);
      fx.spawnParticles(o.x, o.y, cfg.fx.breakParticles, OBJDEF[o.type].hue, { speed: 250 });
      const idx = state.objects.indexOf(o); if (idx >= 0) state.objects.splice(idx, 1);
      state.respawns.push({ timer: cfg.farming.respawnSec });
    }
    function damageShip(t, dmg, opts) {
      opts = opts || {};
      if (!t.alive || t.spawnProtect > 0) return;
      if (t.isRemote) { if (onRemoteHit) onRemoteHit(t, dmg, opts); t.hitFlash = 0.16; fx.spawnParticles(t.x, t.y, 6, '#ff8a8a', { speed: 150 }); return; }
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
      t.hp -= dmg; t.hitFlash = 0.16;
      if (opts.knockback) { t.impX += (opts.dx || 0) * opts.knockback; t.impY += (opts.dy || 0) * opts.knockback; }
      fx.spawnParticles(t.x, t.y, 6, '#ff8a8a', { speed: 150 });
      if (!t.isBot) fx.addShake(7, t.id);
      if (t.hp <= 0) killShip(t, opts.source);
    }
    function killShip(v, killer) {
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
      const s = v.isBot ? randomSpawn() : SPAWN;
      v.x = s.x; v.y = s.y; v.px = v.x; v.py = v.y; v.vx = v.vy = v.impX = v.impY = 0;
      v.spawnProtect = cfg.player.spawnProtectionSec;
      if (!v.isBot) {
        v.classId = 'starter';
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
        for (const pr of state.projectiles) if (pr.isThrownRock && !pr._broken && pr.team !== ship.team) a.push(pr);
        return a;
      },
      applyImpulse(s, vx, vy) { s.impX += vx; s.impY += vy; },
    };

    function updateLeader() {
      let best = null;
      for (const s of state.ships) if (s.alive && (!best || s.scrap > best.scrap)) best = s;
      for (const s of state.ships) s.isLeader = (s === best && best.scrap >= cfg.leader.minScrapToCrown);
    }

    function tickTimers(s, dt) {
      if (s.isRemote) return;
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

    const IDLE = { moveX: 0, moveY: 0, aim: 0, aimDist: 0, firing: false, ability: false, special: false };
    const botWorld = { ships: null, objects: state.objects, config: cfg, time: 0, arena: cfg.arena, familyOf: (id) => FAMILY[id] };
    function botStep(b, dt) {
      botMaybeEvolve(b);
      botWorld.ships = state.ships; botWorld.time = state.time;
      simShip(b, dt, PULSAR.Bots.intent(b, botWorld, dt));
    }

    function pulsarPulse(dt) {
      state.pulsarTimer -= dt;
      if (state.pulsarTimer > 0) return;
      state.pulsarTimer += cfg.arena.pulsarPulseIntervalSec;
      const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
      ejectMotes(cx, cy, eco.pulsarMotesPerPulse, eco.pulsarScrapPerMote, { speed: pk.pulsarMoteSpeed, life: pk.pulsarMoteLifeSec, pulsar: true, evenIndex: 0 });
      fx.spawnParticles(cx, cy, 18, '#dff0ff', { speed: 280 });
    }
    function simulateProjectiles(dt) {
      const harvest = cfg.gravitor.orbitalHarvestBonus;
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const pr = state.projectiles[i];
        pr.px = pr.x; pr.py = pr.y; pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
        let dead = pr.life <= 0 || pr._broken;
        if (!dead) {
          for (const s of state.ships) {
            if (!s.alive || !s.orbActive || s.team === pr.team) continue;
            const rr = pr.radius + s.orbBlockRadius;
            if ((pr.x - s.orbX) ** 2 + (pr.y - s.orbY) ** 2 <= rr * rr) { fx.spawnParticles(pr.x, pr.y, 6, '#ffe6a8', { speed: 160, life: 0.3 }); dead = true; break; }
          }
        }
        if (!dead) {
          let target = null;
          for (const s of state.ships) { if (!s.alive || s.team === pr.team || s.spawnProtect > 0) continue; const rr = pr.radius + s.radius; if ((pr.x - s.x) ** 2 + (pr.y - s.y) ** 2 <= rr * rr) { target = s; break; } }
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
          if (pr.isThrownRock) fx.spawnParticles(pr.x, pr.y, cfg.fx.breakParticles, OBJDEF[pr.rockType || 'asteroid'].hue, { speed: 240 });
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
        for (const s of state.ships) { if (!s.alive) continue; const d = Math.hypot(s.x - m.x, s.y - m.y); if (d < bd) { bd = d; best = s; } }
        if (best) {
          const d = Math.hypot(best.x - m.x, best.y - m.y) || 1;
          if (d <= best.radius + pk.moteRadius) { earn(best, m.value); state.motes.splice(i, 1); continue; }
          m.x += (best.x - m.x) / d * pk.vacuumSpeed * dt; m.y += (best.y - m.y) / d * pk.vacuumSpeed * dt;
        } else { m.vx *= (1 - 1.6 * dt); m.vy *= (1 - 1.6 * dt); m.x += m.vx * dt; m.y += m.vy * dt; }
        m.life -= dt; if (m.life <= 0) state.motes.splice(i, 1);
      }
    }

    function step(dt) {
      state.time += dt;
      pulsarPulse(dt);
      for (const s of state.ships) tickTimers(s, dt);
      for (const s of state.ships) {
        if (s.isRemote) continue;
        if (!s.alive) { s.respawnTimer -= dt; if (s.respawnTimer <= 0) respawnShip(s); continue; }
        if (s.isBot) botStep(s, dt);
        else simShip(s, dt, s._intent || IDLE);
      }
      updateLeader();
      simulateProjectiles(dt); simulateObjects(dt); simulateMotes(dt);
    }

    // ---- public API ----
    function getShip(id) { for (const s of state.ships) if (s.id === id) return s; return null; }
    function addShip(o) { o = o || {}; const sp = o.x == null ? (o.isBot ? randomSpawn() : SPAWN) : { x: o.x, y: o.y }; const s = makeShip({ id: o.id, isBot: o.isBot, team: o.team != null ? o.team : nextId, classId: o.classId, x: sp.x, y: sp.y, aim: o.aim }); applyClassStats(s, true); state.ships.push(s); return s; }
    function removeShip(id) { for (let i = 0; i < state.ships.length; i++) if (state.ships[i].id === id) { state.ships.splice(i, 1); return; } }
    function spawnBots(n) {
      n = n != null ? n : cfg.bots.count;
      for (let i = 0; i < n; i++) { const cls = ['railship', 'hammerhead', 'gravitor', 'flailship'][Math.floor(Math.random() * 4)]; const sp = randomSpawn(); addShip({ classId: cls, isBot: true, aim: Math.random() * TAU, x: sp.x, y: sp.y }); }
    }
    function clearBots() { for (let i = state.ships.length - 1; i >= 0; i--) if (state.ships[i].isBot) state.ships.splice(i, 1); }
    function populateField() { for (let i = 0; i < af.count; i++) spawnArenaObject(); }
    populateField();

    return {
      state, api, config: cfg,
      FAMILY, EVOLVE_BLURB, SPAWN, classNode, hueFor,
      addShip, removeShip, getShip, spawnBots, clearBots,
      setIntent(id, intent) { const s = getShip(id); if (s) s._intent = intent; },
      step,
      enemiesOf, evolveOptions, chooseEvolution, applyClassStats, xpForLevel,
      earn,                                  // for admin/level cheats
      countBots() { let n = 0; for (const s of state.ships) if (s.isBot) n++; return n; },
    };
  };
})();
