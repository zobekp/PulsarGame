// PULSAR.io — GAME (entry: state + fixed-timestep loop + sim + render orchestration)
// Phase 3 — Class skeleton + first branch each, on the Phase 1/2 core.
//   • You start as the Scout (popgun) and CHOOSE a family at level 3 via a non-blocking
//     overlay (press 1–4 / click) — game keeps running. Branch at 8, final form at 15.
//   • Four distinct weapon families (data/weapons.js), each with its own farming style.
//   • Per-class stats (hp / speed / size) + distinct silhouettes from data.
// Tunables in data/config.js. Sim stays coupled to input/render (Phase 5 does the server split).
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

  // which tree nodes are built this phase (branch A only; 2nd branches are Phase 4)
  const IMPLEMENTED = new Set(['starter', 'railship', 'lancer', 'starPiercer',
    'hammerhead', 'maulbreaker', 'worldsplitter', 'gravitor', 'meteorist', 'starfall',
    'flailship', 'chainmaul', 'ironmoon']);
  const FAMILY = {
    starter: 'dart',
    railship: 'rail', lancer: 'rail', starPiercer: 'rail',
    hammerhead: 'hammer', maulbreaker: 'hammer', worldsplitter: 'hammer',
    gravitor: 'grav', meteorist: 'grav', starfall: 'grav',
    flailship: 'flail', chainmaul: 'flail', ironmoon: 'flail',
  };

  // ---- world state -----------------------------------------------------------
  const state = {
    time: 0,
    pulsarTimer: cfg.arena.pulsarPulseIntervalSec,
    player: {
      classId: 'starter',
      x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y,
      vx: 0, vy: 0, impX: 0, impY: 0,
      aim: -Math.PI / 2,
      radius: cfg.player.baseRadius,
      maxHp: cfg.player.baseHP, hp: cfg.player.baseHP,
      classStats: { hp: 1, speed: 1, sizeMult: 1 },
      scrap: cfg.player.scrapTrickleOnSpawn, xp: cfg.player.scrapTrickleOnSpawn, level: 1,
      isLeader: false,
      spawnProtect: cfg.player.spawnProtectionSec,
      hitFlash: 0, contactCd: 0, abilityCd: 0,
      alive: true, respawnTimer: 0,
      // weapon/ability transient state (reset on class switch)
      charge: 0, charging: false, heat: 0, ventTimer: 0,
      ramWinding: false, ramCharge: 0, ramActive: 0, ramHitList: [],
      captured: [], orbSpin: 0, orbAngle: 0, orbRadius: null, orbX: SPAWN.x, orbY: SPAWN.y,
      orbBurstTimer: 0, powerSwingTimer: 0, braceTimer: 0, fireTimer: 0,
      _firePrev: false, _abilityPrev: false, _numPrev: [false, false, false, false],
    },
    projectiles: [], objects: [], motes: [], respawns: [],
  };
  const p = state.player;

  // ---- class identity / stats ------------------------------------------------
  function classNode(id) { return PULSAR.classes[id]; }
  function classTier() { return classNode(p.classId).tier; }
  function childrenOf(id) {
    const out = [];
    for (const k in PULSAR.classes) if (PULSAR.classes[k].parentId === id && IMPLEMENTED.has(k)) out.push(PULSAR.classes[k]);
    return out;
  }
  function applyClassStats(heal) {
    const ck = classNode(p.classId).configKey;
    const s = (cfg[ck] && cfg[ck].stats) ? cfg[ck].stats : { hp: 1, speed: 1, sizeMult: 1 };
    p.classStats = s;
    let r = cfg.player.baseRadius * (s.sizeMult || 1);
    let hpMax = cfg.player.baseHP * (s.hp || 1);
    if (p.isLeader) { r *= (1 + cfg.leader.hitboxBonus); hpMax *= (1 + cfg.leader.hpBonus); }
    p.radius = r; p.maxHp = hpMax;
    p.hp = heal ? hpMax : Math.min(p.hp, hpMax);
  }
  function resetClassState() {
    p.charge = 0; p.charging = false; p.heat = 0; p.ventTimer = 0;
    p.ramWinding = false; p.ramCharge = 0; p.ramActive = 0; p.ramHitList = [];
    p.captured = []; p.orbSpin = 0; p.orbAngle = 0; p.orbRadius = null; p.orbX = p.x; p.orbY = p.y;
    p.orbBurstTimer = 0; p.powerSwingTimer = 0; p.braceTimer = 0; p.fireTimer = 0; p.abilityCd = 0;
  }
  function switchClass(id) {
    p.classId = id;
    resetClassState();
    applyClassStats(true);
    Fx.spawnText(p.x, p.y - 48, 'EVOLVED → ' + classNode(id).displayName, '#7be0ff', { size: 18 });
    Fx.spawnParticles(p.x, p.y, 26, hueFor(id), { speed: 300 });
    Fx.addShake(9);
  }

  // ---- progression -----------------------------------------------------------
  function levelForXp(xp) { return xp <= 0 ? 1 : 1 + Math.floor(Math.pow(xp / eco.levelCurve.k, 1 / eco.levelCurve.exp)); }
  function xpForLevel(L) { return eco.levelCurve.k * Math.pow(L - 1, eco.levelCurve.exp); }
  function updateLevel() {
    const nl = levelForXp(p.xp);
    if (nl <= p.level) return;
    p.level = nl;
    if (p.alive) Fx.spawnText(p.x, p.y - 40, 'LEVEL ' + p.level, '#bfe9ff', { size: 16 });
    const leadNow = p.level >= eco.levelLeaderScaling;
    if (leadNow !== p.isLeader) {
      p.isLeader = leadNow; applyClassStats(true);
      if (leadNow && p.alive) Fx.spawnText(p.x, p.y - 64, '★ LEADER ★', '#ffd98a', { size: 20 });
    }
  }
  function earn(amount) { p.scrap += amount; p.xp += amount; updateLevel(); }

  // DEV/ADMIN: jump a level without farming. Grants ≥ enough XP for +1 level, and at least
  // a first-evolution's worth of carried scrap so the next gate is immediately affordable.
  function adminLevelUp() {
    if (!p.alive) return;
    const need = xpForLevel(p.level + 1) - p.xp + 1;
    earn(Math.max(need, EVO_COSTS[0]));
    Fx.spawnText(p.x, p.y - 52, 'ADMIN +LVL', '#ff9bf0', { size: 16 });
  }

  // available evolution at the current node (null if none / final form)
  function evolveOptions() {
    const t = classTier();
    if (t >= 3) return null;
    const opts = childrenOf(p.classId);
    if (!opts.length) return null;
    return { tier: t, gate: EVO_GATES[t], cost: EVO_COSTS[t], levelOk: p.level >= EVO_GATES[t], options: opts };
  }
  function chooseEvolution(i) {
    const e = evolveOptions();
    if (!e || !e.levelOk || !p.alive) return;
    const choice = e.options[i];
    if (!choice || p.scrap < e.cost) return;
    p.scrap -= e.cost;                 // SPEND = BANK (carried -> safe, locked-in progress)
    switchClass(choice.id);
  }

  // ---- neutral-object field (density gradient, arena-wide) -------------------
  const af = cfg.farming.field;
  const TYPEBAG = (() => { const b = []; for (const k in af.weights) for (let i = 0; i < af.weights[k]; i++) b.push(k); return b; })();
  function pickType() { return TYPEBAG[Math.floor(Math.random() * TYPEBAG.length)]; }
  function densityAt(x, y) {
    const t = Math.min(1, Math.hypot(x - cfg.arena.width / 2, y - cfg.arena.height / 2) / (cfg.arena.width / 2));
    return lerp(cfg.farming.densityAtCenter, cfg.farming.densityAtEdge, t);
  }
  function addObject(type, x, y) {
    const hp = cfg.farming[OBJDEF[type].hp];
    state.objects.push({ type, x, y, px: x, py: y, vx: 0, vy: 0, radius: cfg.farming[OBJDEF[type].radius],
      hp, maxHp: hp, spin: Math.random() * TAU, spinRate: (Math.random() - 0.5) * 0.8, flash: 0, cracked: false, crackTimer: 0, _orbHit: -9 });
  }
  function spawnArenaObject() {
    const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
    for (let t = 0; t < 24; t++) {
      const x = Math.random() * cfg.arena.width, y = Math.random() * cfg.arena.height;
      if (Math.hypot(x - cx, y - cy) < af.pulsarClearRadius) continue;
      if (Math.random() <= densityAt(x, y)) { addObject(pickType(), x, y); return; }
    }
    addObject(pickType(), Math.random() * cfg.arena.width, Math.random() * cfg.arena.height);
  }
  for (let i = 0; i < af.count; i++) spawnArenaObject();

  // ---- motes -----------------------------------------------------------------
  function ejectMotes(x, y, count, valueEach, opts) {
    opts = opts || {};
    const speed = opts.speed != null ? opts.speed : pk.moteDriftSpeed;
    const life = opts.life != null ? opts.life : pk.moteLifeSec;
    for (let i = 0; i < count; i++) {
      const a = opts.evenIndex != null ? (i / count) * TAU + Math.random() * 0.3 : Math.random() * TAU;
      state.motes.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, value: valueEach, pulsar: !!opts.pulsar });
    }
  }

  // ---- damage system ---------------------------------------------------------
  function damageObject(o, dmg, opts) {
    opts = opts || {};
    const amp = o.cracked ? (1 + cfg.railship.armorCrack.damageAmp) : 1;
    o.hp -= dmg * amp;
    o.flash = 0.12;
    if (opts.crack) crackObject(o, cfg.railship.armorCrack.baseDurationSec);
    if (opts.knockback) { o.vx += (opts.dx || 0) * opts.knockback; o.vy += (opts.dy || 0) * opts.knockback; }
    Fx.spawnParticles(o.x, o.y, cfg.fx.hitParticles, OBJDEF[o.type].hue, { dir: Math.atan2(opts.dy || 0, opts.dx || 0), spread: 1.5, speed: 170 });
    if (o.hp <= 0) breakObject(o);
  }
  function crackObject(o, dur) { o.cracked = true; o.crackTimer = Math.max(o.crackTimer, dur); }
  function breakObject(o) {
    const total = eco[OBJDEF[o.type].scrap], n = cfg.farming.motesPerObject[o.type];
    ejectMotes(o.x, o.y, n, total / n);
    Fx.spawnParticles(o.x, o.y, cfg.fx.breakParticles, OBJDEF[o.type].hue, { speed: 250 });
    Fx.addShake(3);
    const idx = state.objects.indexOf(o);
    if (idx >= 0) state.objects.splice(idx, 1);
    state.respawns.push({ timer: cfg.farming.respawnSec });
  }
  function lineBreak(count, x, y) {
    earn(eco.lineBreakBonusScrap);
    Fx.spawnText(x, y - 24, 'LINE BREAK +' + eco.lineBreakBonusScrap, '#7be0ff', { size: 18 });
    Fx.addShake(6);
  }
  const api = { config: cfg, state, fx: Fx, damageObject, crackObject, lineBreak,
    applyImpulse(ship, vx, vy) { ship.impX += vx; ship.impY += vy; } };

  // ---- player damage / death / respawn --------------------------------------
  function damagePlayer(dmg, dx, dy) {
    if (!p.alive || p.spawnProtect > 0) return;
    if (p.braceTimer > 0) dmg *= (1 - cfg.hammerhead.brace.damageReduction);
    p.hp -= dmg; p.hitFlash = 0.16;
    p.impX += dx * cfg.combat.knockbackBase; p.impY += dy * cfg.combat.knockbackBase;
    Fx.addShake(8); Fx.spawnParticles(p.x, p.y, 8, '#ff6b6b', { speed: 150 });
    if (p.hp <= 0) killPlayer();
  }
  function killPlayer() {
    p.alive = false; resetClassState();
    const drop = Math.floor(p.scrap * eco.dropFractionOnDeath);
    if (drop > 0) { p.scrap -= drop; const n = Math.min(14, Math.max(1, drop)); ejectMotes(p.x, p.y, n, drop / n, { speed: 150 }); }
    Fx.spawnParticles(p.x, p.y, cfg.fx.deathParticles, hueFor(p.classId), { speed: 340 });
    Fx.spawnText(p.x, p.y - 34, 'WRECKED', '#ff6b6b', { size: 22 });
    Fx.addShake(cfg.fx.screenShakeMax);
    p.respawnTimer = cfg.player.respawnDelaySec;
  }
  function respawnPlayer() {
    p.alive = true;
    p.x = SPAWN.x; p.y = SPAWN.y; p.px = p.x; p.py = p.y;
    p.vx = p.vy = p.impX = p.impY = 0;
    p.spawnProtect = cfg.player.spawnProtectionSec;
    applyClassStats(true);                 // keep class + leader scaling, back to full
    earn(cfg.player.scrapTrickleOnSpawn);
  }

  // ---- simulation ------------------------------------------------------------
  function simulate(dt) {
    state.time += dt;
    if (p.spawnProtect > 0) p.spawnProtect -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.ventTimer > 0) p.ventTimer -= dt;
    if (p.abilityCd > 0) p.abilityCd -= dt;
    if (p.contactCd > 0) p.contactCd -= dt;
    if (p.braceTimer > 0) p.braceTimer -= dt;
    if (p.ramActive > 0) p.ramActive -= dt;
    if (p.orbBurstTimer > 0) p.orbBurstTimer -= dt;
    if (p.powerSwingTimer > 0) p.powerSwingTimer -= dt;
    p.heat = Math.max(0, p.heat - cfg.railship.heat.decayPerSec * dt);

    pulsarPulse(dt);
    if (!p.alive) { p.respawnTimer -= dt; if (p.respawnTimer <= 0) respawnPlayer(); }
    else simulatePlayer(dt);
    simulateProjectiles(dt);
    simulateObjects(dt);
    simulateMotes(dt);
    Fx.update(dt);
  }

  function pulsarPulse(dt) {
    state.pulsarTimer -= dt;
    if (state.pulsarTimer > 0) return;
    state.pulsarTimer += cfg.arena.pulsarPulseIntervalSec;
    const cx = cfg.arena.width / 2, cy = cfg.arena.height / 2;
    ejectMotes(cx, cy, eco.pulsarMotesPerPulse, eco.pulsarScrapPerMote, { speed: pk.pulsarMoteSpeed, life: pk.pulsarMoteLifeSec, pulsar: true, evenIndex: 0 });
    Fx.spawnParticles(cx, cy, 18, '#dff0ff', { speed: 280 });
  }

  function simulatePlayer(dt) {
    p.px = p.x; p.py = p.y;
    p.aim = Math.atan2(Input.mouseY - Render.viewH / 2, Input.mouseX - Render.viewW / 2);

    // --- evolution number-key select (overlay is non-blocking) ---
    const e = evolveOptions();
    if (e && e.levelOk) {
      for (let i = 0; i < e.options.length; i++) {
        const down = Input.key('Digit' + (i + 1));
        if (down && !p._numPrev[i]) chooseEvolution(i);
        p._numPrev[i] = down;
      }
    }
    // --- UI click (admin button always; evolve buttons when shown) — eats the shot ---
    if (Input.firing && !p._firePrev) {
      for (const b of uiButtons) {
        if (Input.mouseX >= b.x && Input.mouseX <= b.x + b.w && Input.mouseY >= b.y && Input.mouseY <= b.y + b.h) { b.onClick(); p._suppressFire = true; break; }
      }
    }
    if (!Input.firing) p._suppressFire = false;
    p._firePrev = Input.firing;
    // admin level-up shortcut [L]
    const lDown = Input.key('KeyL');
    if (lDown && !p._adminPrev) adminLevelUp();
    p._adminPrev = lDown;

    // --- movement (per-family slow while charging/winding) ---
    const dir = Input.moveDir();
    const fam = FAMILY[p.classId];
    let speedMul = 1;
    if (fam === 'rail' && p.charging) {
      const m = cfg.railship.movementWhileCharging;
      speedMul = p.charge > 1.0 ? m.overcharge : p.charge <= 0.5 ? m.to50 : p.charge <= 0.9 ? m.to90 : m.to100;
    } else if (fam === 'hammer' && p.ramWinding) speedMul = 0.4;
    const speed = cfg.player.baseSpeed * (p.classStats.speed || 1) * speedMul;
    p.vx = dir.x * speed; p.vy = dir.y * speed;
    p.x += (p.vx + p.impX) * dt; p.y += (p.vy + p.impY) * dt;
    const damp = Math.max(0, 1 - cfg.player.impulseDampPerSec * dt);
    p.impX *= damp; p.impY *= damp;
    p.x = Math.max(p.radius, Math.min(cfg.arena.width - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(cfg.arena.height - p.radius, p.y));

    // --- ability (Space, edge-triggered) ---
    const abilityDown = Input.key('Space');
    if (abilityDown && !p._abilityPrev && p.abilityCd <= 0) {
      const ab = PULSAR.resolveAbility(classNode(p.classId).ability);
      p.abilityCd = ab.activate(api, p) || 0;
    }
    p._abilityPrev = abilityDown;

    // --- weapon (the family's behaviour owns charge/fire/orbit/pull) ---
    const firing = Input.firing && !p._suppressFire;
    PULSAR.resolveWeapon(classNode(p.classId).weapon).update(api, p, dt, { firing });

    // --- contact damage from rocks (offense while ramming; else it hurts) ---
    if (p.spawnProtect <= 0 && p.contactCd <= 0) {
      for (const o of state.objects) {
        const dx = p.x - o.x, dy = p.y - o.y, rr = p.radius + o.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        const d = Math.hypot(dx, dy) || 1;
        let dmg = cfg.farming.contactDamage[o.type];
        if (p.ramActive > 0) dmg *= (1 - cfg.hammerhead.lunge.selfDamageReduction);  // you're plowing
        damagePlayer(dmg, dx / d, dy / d);
        o.vx -= (dx / d) * 80; o.vy -= (dy / d) * 80;
        p.contactCd = cfg.farming.contactCooldownSec;
        break;
      }
    }
  }

  function simulateProjectiles(dt) {
    const harvestBonus = cfg.gravitor.orbitalHarvestBonus;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const pr = state.projectiles[i];
      pr.px = pr.x; pr.py = pr.y;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      let dead = pr.life <= 0;
      if (!dead) {
        for (const o of state.objects) {
          const rr = pr.radius + o.radius;
          if ((pr.x - o.x) ** 2 + (pr.y - o.y) ** 2 > rr * rr) continue;
          const d = Math.hypot(pr.vx, pr.vy) || 1;
          damageObject(o, pr.damage, { dx: pr.vx / d, dy: pr.vy / d, knockback: 40 });
          if (pr.harvest && o.hp <= 0) earn(harvestBonus);    // orbitalHarvest
          if (--pr.pierceLeft <= 0) dead = true;
          break;
        }
      }
      if (!dead && (pr.x < 0 || pr.y < 0 || pr.x > cfg.arena.width || pr.y > cfg.arena.height)) dead = true;
      if (dead) state.projectiles.splice(i, 1);
    }
  }

  function simulateObjects(dt) {
    for (const o of state.objects) {
      o.px = o.x; o.py = o.y; o.spin += o.spinRate * dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      const damp = Math.max(0, 1 - 4 * dt); o.vx *= damp; o.vy *= damp;
      if (o.flash > 0) o.flash -= dt;
      if (o.cracked) { o.crackTimer -= dt; if (o.crackTimer <= 0) o.cracked = false; }
    }
    for (let i = state.respawns.length - 1; i >= 0; i--) {
      state.respawns[i].timer -= dt;
      if (state.respawns[i].timer <= 0) { spawnArenaObject(); state.respawns.splice(i, 1); }
    }
  }

  function simulateMotes(dt) {
    for (let i = state.motes.length - 1; i >= 0; i--) {
      const m = state.motes[i];
      m.px = m.x; m.py = m.y;
      const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
      if (p.alive && d <= p.radius + pk.moteRadius) { earn(m.value); state.motes.splice(i, 1); continue; }
      if (p.alive && d <= pk.collectRadius) { m.x += (dx / d) * pk.vacuumSpeed * dt; m.y += (dy / d) * pk.vacuumSpeed * dt; }
      else { m.vx *= (1 - 1.6 * dt); m.vy *= (1 - 1.6 * dt); m.x += m.vx * dt; m.y += m.vy * dt; }
      m.life -= dt;
      if (m.life <= 0) state.motes.splice(i, 1);
    }
  }

  // ---- render ----------------------------------------------------------------
  let uiButtons = [];      // clickable HUD rects this frame: {x,y,w,h,onClick}
  function onScreen(x, y, pad) {
    return x > Render.camera.x - Render.viewW / 2 - pad && x < Render.camera.x + Render.viewW / 2 + pad
        && y > Render.camera.y - Render.viewH / 2 - pad && y < Render.camera.y + Render.viewH / 2 + pad;
  }
  function render(alpha) {
    const R = Render;
    const pxi = lerp(p.px, p.x, alpha), pyi = lerp(p.py, p.y, alpha);
    R.camera.x = pxi + Fx.shakeX(); R.camera.y = pyi + Fx.shakeY();
    R.beginFrame(); R.drawGrid(); R.drawPulsar(state.time);

    // BLOOM PASS
    R.setComposite('lighter');
    for (const o of state.objects) {
      if (!onScreen(o.x, o.y, o.radius + 40)) continue;
      R.glow(R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha)), o.radius * 1.5,
             R.hexToRgb(OBJDEF[o.type].hue), 0.2 + (o.flash > 0 ? 0.5 : 0) + (o.cracked ? 0.15 : 0));
    }
    for (const m of state.motes) {
      if (!onScreen(m.x, m.y, 30)) continue;
      R.glow(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius * 3, m.pulsar ? [200, 230, 255] : [255, 210, 120], m.pulsar ? 0.7 : 0.5);
    }
    for (const pr of state.projectiles) {
      R.glow(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 1.6 : 2.4), R.hexToRgb(pr.color), 0.85);
    }
    Fx.draw(R, alpha, lerp);
    if (p.alive) {
      const cx = R.sx(pxi), cy = R.sy(pyi), hue = R.hexToRgb(hueFor(p.classId));
      const threat = lerp(cfg.readability.threatBloomScale, cfg.readability.threatBloomMax, Math.min(1, p.scrap / cfg.readability.threatScrapForMax));
      const chargeGlow = p.charging ? 0.4 * Math.min(1.25, p.charge) : 0;
      R.glow(cx, cy, p.radius * (3.0 + chargeGlow) * cfg.readability.yourShipBloomScale * threat, hue, 0.45 + chargeGlow * 0.4);
      if (p.heat > cfg.railship.heat.max * 0.6 || p.ventTimer > 0) R.glow(cx, cy, p.radius * 2.4, [255, 120, 60], 0.25 + 0.4 * (p.heat / cfg.railship.heat.max));
    }

    // CORE PASS
    R.setComposite('source-over');
    for (const o of state.objects) {
      if (!onScreen(o.x, o.y, o.radius + 20)) continue;
      drawObject(R.ctx, o, R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha)));
    }
    for (const m of state.motes) {
      if (!onScreen(m.x, m.y, 20)) continue;
      R.solidCircle(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius, m.pulsar ? '#eaf4ff' : '#ffe6a8');
    }
    for (const pr of state.projectiles) R.solidCircle(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 0.8 : 0.6), pr.kind === 'rock' ? '#d9c2ff' : '#ffffff');
    if (p.alive) { drawClassExtras(R, R.sx(pxi), R.sy(pyi)); drawShip(R.ctx, R.sx(pxi), R.sy(pyi), p); }

    uiButtons = [];
    drawHud(); drawMinimap(); drawEvolveOverlay(); drawAdminButton();
  }

  // DEV/ADMIN button (top-right). Clicking it grants a level; the click is swallowed so it
  // doesn't also fire your weapon. Remove this block to ship.
  function drawAdminButton() {
    const ctx = Render.ctx, w = 150, h = 26, x = Render.viewW - w - 14, y = 14;
    ctx.fillStyle = 'rgba(58,18,58,0.75)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,140,230,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = '#ffb4ee';
    ctx.fillText('ADMIN ▸ +1 LVL  [L]', x + w / 2, y + 17);
    ctx.textAlign = 'left';
    uiButtons.push({ x, y, w, h, onClick: adminLevelUp });
  }

  // family-specific world-space extras (gravitor well + held rocks, flail chain + orb)
  function drawClassExtras(R, cx, cy) {
    const fam = FAMILY[p.classId], ctx = R.ctx;
    if (fam === 'grav') {
      const G = cfg.gravitor;
      ctx.strokeStyle = 'rgba(176,107,255,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, G.well.pullRadius * 0.25, 0, TAU); ctx.stroke();
      const cap = p.captured.length;
      for (let i = 0; i < cap; i++) {
        const a = p.orbSpin + i * (TAU / Math.max(1, cap));
        const rx = cx + Math.cos(a) * (p.radius + G.orbit.radius), ry = cy + Math.sin(a) * (p.radius + G.orbit.radius);
        R.setComposite('lighter'); R.glow(rx, ry, 16, [176, 107, 255], 0.5); R.setComposite('source-over');
        ctx.fillStyle = 'rgba(150,120,200,0.9)'; ctx.beginPath(); ctx.arc(rx, ry, 9, 0, TAU); ctx.fill();
      }
    } else if (fam === 'flail') {
      const ox = R.sx(p.orbX), oy = R.sy(p.orbY);
      ctx.strokeStyle = 'rgba(255,210,120,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke();
      R.setComposite('lighter'); R.glow(ox, oy, cfg.flailship.orb.tipRadius * 2.2, [255, 210, 120], 0.8); R.setComposite('source-over');
      ctx.fillStyle = '#ffe6a8'; ctx.beginPath(); ctx.arc(ox, oy, cfg.flailship.orb.tipRadius, 0, TAU); ctx.fill();
    }
  }

  // ---- ship silhouettes (distinct per family — readability rule #4) ----------
  function drawShip(ctx, x, y, p) {
    const r = p.radius, hue = hueFor(p.classId), fam = FAMILY[p.classId];
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.aim);
    if (p.spawnProtect > 0) {
      ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, TAU);
      ctx.strokeStyle = `rgba(190,233,255,${0.25 + 0.2 * Math.sin(state.time * 18)})`; ctx.lineWidth = 2; ctx.stroke();
    }
    const fill = p.hitFlash > 0 ? 'rgba(255,140,140,0.95)' : `${hue}e6`;
    if (fam === 'rail') drawSpear(ctx, r, p, fill);
    else if (fam === 'hammer') drawWedge(ctx, r, p, fill);
    else if (fam === 'grav') drawCrescent(ctx, r, p, fill);
    else if (fam === 'flail') drawRingedHull(ctx, r, p, fill);
    else drawDart(ctx, r, p, fill);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    if (p.isLeader) drawCrown(ctx, x, y, r);
  }
  function stroke(ctx) { ctx.strokeStyle = 'rgba(230,245,255,0.95)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  function drawDart(ctx, r, p, fill) {
    ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * 0.9, r * 0.85); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r * 0.9, -r * 0.85); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
  }
  function drawSpear(ctx, r, p, fill) {
    ctx.beginPath(); ctx.moveTo(r * 2.1, 0); ctx.lineTo(-r * 0.8, r * 0.7); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.8, -r * 0.7); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    if (p.charging) {
      const c = Math.min(1.25, p.charge);
      ctx.beginPath(); ctx.moveTo(r * 0.4, 0); ctx.lineTo(r * (2.1 + c * 0.8), 0);
      ctx.strokeStyle = c > 1.0 ? 'rgba(255,210,120,0.95)' : `rgba(255,255,255,${0.5 + 0.5 * c})`; ctx.lineWidth = 1.5 + c * 2.5; ctx.stroke();
    }
  }
  function drawWedge(ctx, r, p, fill) {
    ctx.beginPath(); ctx.moveTo(r * 1.3, r * 1.05); ctx.lineTo(r * 1.3, -r * 1.05); ctx.lineTo(-r * 1.0, -r * 0.45); ctx.lineTo(-r * 1.0, r * 0.45); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    if (p.ramWinding || p.ramActive > 0) {                 // windup / lunge telegraph at the nose
      const c = p.ramActive > 0 ? 1 : p.ramCharge;
      ctx.beginPath(); ctx.arc(r * 1.3, 0, r * (0.4 + 0.6 * c), 0, TAU);
      ctx.strokeStyle = `rgba(255,130,60,${0.5 + 0.4 * c})`; ctx.lineWidth = 2 + 2 * c; ctx.stroke();
    }
  }
  function drawCrescent(ctx, r, p, fill) {
    ctx.beginPath(); ctx.arc(0, 0, r, -1.1, 1.1); ctx.arc(r * 0.5, 0, r * 0.95, 1.0, -1.0, true); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
  }
  function drawRingedHull(ctx, r, p, fill) {
    ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fillStyle = fill; ctx.fill(); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.lineTo(r * 0.2, r * 0.5); ctx.lineTo(r * 0.2, -r * 0.5); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  }
  function drawCrown(ctx, x, y, r) {
    const w = r * 1.3, h = r * 0.8, top = y - r * 2.4;
    ctx.fillStyle = '#ffd98a'; ctx.beginPath();
    ctx.moveTo(x - w, top + h); ctx.lineTo(x - w, top); ctx.lineTo(x - w * 0.4, top + h * 0.55); ctx.lineTo(x, top - h * 0.35);
    ctx.lineTo(x + w * 0.4, top + h * 0.55); ctx.lineTo(x + w, top); ctx.lineTo(x + w, top + h); ctx.closePath(); ctx.fill();
  }

  // ---- neutral object shapes -------------------------------------------------
  function drawObject(ctx, o, x, y) {
    if (o.type === 'crystal') return drawShape(ctx, o, x, y, crystalPath, 'rgba(180,255,240,0.95)', 'rgba(94,234,212,0.55)', 'rgba(150,255,235,0.9)');
    if (o.type === 'debris') return drawShape(ctx, o, x, y, debrisPath, 'rgba(160,175,195,0.9)', 'rgba(75,85,100,0.85)', 'rgba(140,160,185,0.6)');
    return drawShape(ctx, o, x, y, asteroidPath, 'rgba(150,165,190,0.9)', 'rgba(70,80,98,0.9)', 'rgba(150,170,200,0.7)');
  }
  function drawShape(ctx, o, x, y, pathFn, hitFill, fill, strokeC) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.spin); pathFn(ctx, o.radius);
    ctx.fillStyle = o.flash > 0 ? hitFill : fill; ctx.fill(); ctx.strokeStyle = strokeC; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore(); objectOverlays(ctx, o, x, y);
  }
  function asteroidPath(ctx, r) { ctx.beginPath(); for (let i = 0; i <= 9; i++) { const a = (i / 9) * TAU, rr = r * (0.82 + 0.18 * Math.sin(a * 3 + 1.3) * Math.cos(a * 2)); const vx = Math.cos(a) * rr, vy = Math.sin(a) * rr; i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy); } ctx.closePath(); }
  function crystalPath(ctx, r) { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); }
  function debrisPath(ctx, r) { ctx.beginPath(); ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.3, r); ctx.closePath(); }
  function objectOverlays(ctx, o, x, y) {
    if (o.hp < o.maxHp) { ctx.beginPath(); ctx.arc(x, y, o.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (o.hp / o.maxHp)); ctx.strokeStyle = 'rgba(120,200,160,0.55)'; ctx.lineWidth = 2; ctx.stroke(); }
    if (o.cracked) { ctx.strokeStyle = `rgba(255,170,90,${0.5 + 0.3 * Math.sin(state.time * 14)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, o.radius + 9, 0, TAU); ctx.stroke(); }
  }

  // ---- HUD / overlay / minimap -----------------------------------------------
  let fps = 0, fpsAccum = 0, fpsFrames = 0;
  function bar(ctx, x, y, w, h, frac, fill) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = fill; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h); }
  function drawHud() {
    const ctx = Render.ctx, x = 16, w = 220, fam = FAMILY[p.classId];
    bar(ctx, x, 16, w, 10, p.hp / p.maxHp, '#7be0a0');
    if (fam === 'rail') {
      const hf = p.heat / cfg.railship.heat.max;
      bar(ctx, x, 30, w, 8, hf, p.ventTimer > 0 ? '#ff5b5b' : (hf > 0.7 ? '#ff9b3c' : '#ffd23c'));
      if (p.charging) bar(ctx, x, 40, w, 6, Math.min(1.25, p.charge) / 1.25, p.charge > 1 ? '#ffd98a' : '#bfe9ff');
    } else if (fam === 'hammer' && (p.ramWinding || p.ramActive > 0)) {
      bar(ctx, x, 30, w, 6, p.ramActive > 0 ? 1 : p.ramCharge, '#ff9b3c');
    }
    const cur = xpForLevel(p.level), nxt = xpForLevel(p.level + 1);
    bar(ctx, x, 50, w, 6, (p.xp - cur) / Math.max(1, nxt - cur), '#6aa9ff');

    ctx.textAlign = 'left';
    ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff';
    ctx.fillText(`${classNode(p.classId).displayName}  ·  LV ${p.level}${p.isLeader ? '  ★' : ''}`, x, 76);
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#ffd98a';
    ctx.fillText(`SCRAP ${Math.floor(p.scrap)}`, x, 94);
    ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = p.abilityCd > 0 ? 'rgba(160,190,220,0.4)' : '#7be0ff';
    const abilityName = classNode(p.classId).ability;
    ctx.fillText(abilityName ? (p.abilityCd > 0 ? `${abilityName} ${p.abilityCd.toFixed(1)}s` : `${abilityName} ready [Space]`) : 'no ability (Scout)', x, 112);
    ctx.fillStyle = 'rgba(160,190,220,0.5)';
    ctx.fillText(`${fps.toFixed(0)} fps · WASD · mouse · hold=fire · Space=ability`, x, 128);
    if (!p.alive) { ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ff8a8a'; ctx.fillText('WRECKED — respawning…', Render.viewW / 2, Render.viewH / 2 + 90); ctx.textAlign = 'left'; }
  }

  function drawEvolveOverlay() {
    const e = evolveOptions();
    if (!e || !e.levelOk || !p.alive) return;
    const ctx = Render.ctx;
    const bw = 250, bh = 30, gap = 8, n = e.options.length;
    const panelW = bw + 24, panelH = 44 + n * (bh + gap);
    const x0 = (Render.viewW - panelW) / 2, y0 = 70;
    ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.fillRect(x0, y0, panelW, panelH);
    ctx.strokeStyle = 'rgba(120,224,255,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, panelW, panelH);
    ctx.textAlign = 'center'; ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff';
    ctx.fillText(`EVOLVE — choose (cost ${e.cost} scrap)`, x0 + panelW / 2, y0 + 24);
    const afford = p.scrap >= e.cost;
    for (let i = 0; i < n; i++) {
      const bx = x0 + 12, by = y0 + 36 + i * (bh + gap);
      uiButtons.push({ x: bx, y: by, w: bw, h: bh, onClick: () => chooseEvolution(i) });
      ctx.fillStyle = afford ? 'rgba(120,224,255,0.14)' : 'rgba(120,140,160,0.10)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = afford ? 'rgba(120,224,255,0.5)' : 'rgba(120,140,160,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      ctx.textAlign = 'left'; ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = afford ? '#eaf6ff' : 'rgba(200,215,230,0.5)';
      ctx.fillText(`[${i + 1}]  ${e.options[i].displayName}`, bx + 12, by + 20);
    }
    if (!afford) { ctx.textAlign = 'center'; ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,180,120,0.8)'; ctx.fillText(`need ${e.cost - Math.floor(p.scrap)} more scrap`, x0 + panelW / 2, y0 + panelH - 8); }
    ctx.textAlign = 'left';
  }

  function drawMinimap() {
    const ctx = Render.ctx, size = 150, pad = 14;
    const x0 = Render.viewW - size - pad, y0 = Render.viewH - size - pad, sc = size / cfg.arena.width;
    ctx.fillStyle = 'rgba(8,12,20,0.6)'; ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = 'rgba(80,120,180,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, size, size);
    const px = x0 + (cfg.arena.width / 2) * sc, py = y0 + (cfg.arena.height / 2) * sc;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 2.5 + Math.max(0, Math.sin(state.time * (TAU / cfg.arena.pulsarPulseIntervalSec))), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,190,220,0.5)'; ctx.font = '400 9px system-ui, sans-serif'; ctx.fillText('PULSAR', px - 16, py - 5);
    const mx = x0 + p.x * sc, my = y0 + p.y * sc;
    ctx.fillStyle = p.isLeader ? '#ffd98a' : '#39d0ff'; ctx.beginPath(); ctx.arc(mx, my, 3, 0, TAU); ctx.fill();
    if (p.isLeader) { ctx.font = '700 10px system-ui, sans-serif'; ctx.fillText('★', mx + 4, my - 3); }
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
    applyClassStats(true);
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
