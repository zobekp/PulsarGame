// PULSAR.io — WEAPON + ABILITY BEHAVIOURS (data-driven hook registry)
// data/classes.js gives each ship `weapon` / `ability` STRING KEYS. The engine never
// branches on class — it calls weapon.update() every tick and ability.activate() on press.
// Each behaviour owns its own state on the ship and acts through the `api` (damage/fx/
// impulse/object helpers), so collision + damage stay centralised in game.js.
//
// Phase 3 implements all four families through their first branch to final:
//   chargeRail  (Railship → Lancer → Star Piercer)      — hold-charge hitscan beam
//   hammerRam   (Hammerhead → Maulbreaker → Worldsplitter) — wind-up lunge, momentum impact
//   gravityWell (Gravitor → Meteorist → Starfall)       — pull rocks into orbit, hurl them
//   wreckingOrb (Flailship → Chainmaul → Ironmoon)      — chained orbiting orb, area melee
// plus the starter popgun. Second branches (Singularity/Graviflail lines) are Phase 4 stubs.
window.PULSAR = window.PULSAR || {};

(function () {
  // resolve a class's display hue, following visuals `inherits` (lancer→railship, etc.)
  function hueFor(classId) {
    let v = PULSAR.classVisuals[classId];
    while (v && !v.hue && v.inherits) v = PULSAR.classVisuals[v.inherits];
    return (v && v.hue) || '#ffffff';
  }

  // ---- WEAPONS -------------------------------------------------------------
  const weapons = {

    // Starter auto gun. Honest VFX: projectile bloom radius == collision radius.
    popgun: {
      update(api, ship, dt, ctx) {
        ship.fireTimer = (ship.fireTimer || 0) - dt;
        if (!ctx.firing || ship.fireTimer > 0) return;
        const c = api.config.popgun, nose = ship.radius + c.projectileRadius;
        api.state.projectiles.push({
          x: ship.x + Math.cos(ship.aim) * nose, y: ship.y + Math.sin(ship.aim) * nose,
          px: ship.x + Math.cos(ship.aim) * nose, py: ship.y + Math.sin(ship.aim) * nose,
          vx: Math.cos(ship.aim) * c.projectileSpeed, vy: Math.sin(ship.aim) * c.projectileSpeed,
          radius: c.projectileRadius, damage: c.damage, pierceLeft: c.pierce,
          life: c.projectileLifeSec, color: c.color,
        });
        ship.fireTimer = c.fireCooldownSec;
      },
    },

    // RAILSHIP — hold to charge (snap/focus/lance/overcharge), release a hitscan beam that
    // pierces N objects with falloff. Heat builds; overheat forces a vent lock. Lancer/Star
    // Piercer tune range/width/damage + perfectLine. Farming style: line them up (LINE BREAK).
    chargeRail: {
      update(api, ship, dt, ctx) {
        const R = api.config.railship;
        if (ship.ventTimer > 0) { ship.charging = false; ship.charge = 0; return; }
        if (ctx.firing) {
          ship.charging = true;
          ship.charge = Math.min(R.charge.overchargeCap, ship.charge + dt / R.charge.timeToFullSec);
        } else if (ship.charging) {
          this.fire(api, ship);
          ship.charging = false; ship.charge = 0;
          if (ship.heat >= R.heat.max && R.heat.ventStateAtMax) ship.ventTimer = R.heat.ventStateSec;
        }
      },
      fire(api, ship) {
        const R = api.config.railship, ch = R.charge, heat = R.heat;
        const mods = R.evolveMods[ship.classId] || {};
        const hue = hueFor(ship.classId);
        let stage = ship.charge <= ch.snapMax ? 'snap' : ship.charge <= ch.focusMax ? 'focus'
                  : ship.charge <= ch.lanceMax ? 'lance' : 'overcharge';
        let dmg = ch.damage[stage];
        const big = (stage === 'lance' || stage === 'overcharge');
        if (big && mods.fullChargeDamageMult) dmg *= mods.fullChargeDamageMult;
        const pierce = ch.pierce[stage], recoil = ch.recoil[stage];
        const heatAdd = { snap: heat.tapShot, focus: heat.halfCharge, lance: heat.fullCharge, overcharge: heat.overcharge }[stage];
        const maxRange = R.beam.maxRange * (mods.rangeMult || 1);
        const halfWidth = R.beam.halfWidth * (mods.beamWidthMult || 1);

        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);
        const ox = ship.x + dx * ship.radius, oy = ship.y + dy * ship.radius;
        const hits = [];
        for (const o of api.state.objects) {
          const along = (o.x - ox) * dx + (o.y - oy) * dy;
          if (along < 0 || along > maxRange) continue;
          const perp = Math.abs((o.x - ox) * -dy + (o.y - oy) * dx);
          if (perp <= halfWidth + o.radius) hits.push({ o, along });
        }
        hits.sort((a, b) => a.along - b.along);
        const falloff = R.pierceFalloff.neutral;
        let pierced = 0;
        for (const h of hits) {
          if (pierced >= pierce) break;
          let d = dmg * falloff[Math.min(pierced, falloff.length - 1)];
          if (mods.closeRange && h.along < mods.closeRange) d *= mods.closeDamageMult;
          if (mods.perfectLineRangeFrac && h.along > maxRange * mods.perfectLineRangeFrac) d *= (1 + mods.perfectLineBonus);
          api.damageObject(h.o, d, { dx, dy, knockback: R.beam.knockback, crack: big });
          pierced++;
        }
        api.fx.spawnBeam(ox, oy, ox + dx * maxRange, oy + dy * maxRange, hue, halfWidth, R.beam.visualSec);
        api.fx.spawnParticles(ox, oy, 6, hue, { dir: ship.aim, spread: 0.6, speed: 260 });
        if (pierced >= R.lineBreakThreshold) api.lineBreak(pierced, ox, oy);
        api.applyImpulse(ship, -dx * recoil, -dy * recoil);
        ship.heat = Math.min(heat.max, ship.heat + heatAdd);
        api.fx.addShake(Math.min(api.config.fx.screenShakeMax, recoil * 0.07));
      },
    },

    // HAMMERHEAD — hold to wind up, release to LUNGE forward; contact during the lunge is the
    // hit (impact = base + lunge-speed × momentum). While lunging you shrug off rocks (you're
    // the aggressor). Farming style: plow straight through clusters. Worldsplitter full-lunge
    // hit emits a shockwave.
    hammerRam: {
      update(api, ship, dt, ctx) {
        const H = api.config.hammerhead;
        if (ship.ramActive > 0) { this.smash(api, ship, H); return; }
        if (ctx.firing) {
          ship.ramWinding = true;
          ship.ramCharge = Math.min(1, (ship.ramCharge || 0) + dt / H.lunge.chargeTimeSec);
        } else if (ship.ramWinding) {
          this.lunge(api, ship, H);
          ship.ramWinding = false; ship.ramCharge = 0;
        }
      },
      lunge(api, ship, H) {
        const c = ship.ramCharge || 0;
        ship.ramHitBase = c < 0.34 ? H.ram.tapBashDamage : c < 0.95 ? H.ram.chargedDamage : H.ram.overcommitDamage;
        ship.ramFull = c >= 0.95;
        ship.ramSlammed = false;
        ship.ramActive = H.lunge.durationSec;
        ship.ramHitList = [];
        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);
        api.applyImpulse(ship, dx * H.lunge.speed, dy * H.lunge.speed);
        api.fx.spawnParticles(ship.x, ship.y, 12, hueFor(ship.classId), { dir: ship.aim, spread: 0.5, speed: 280 });
        api.fx.addShake(6 + c * 6);
      },
      smash(api, ship, H) {
        const heavy = (ship.classId === 'maulbreaker' || ship.classId === 'worldsplitter');
        const reach = ship.radius * (heavy ? H.maulbreaker.frontHitboxMult : 1);
        const speed = Math.hypot(ship.impX, ship.impY);
        const impact = ship.ramHitBase + speed * H.ram.momentumMultiplier;
        const kb = api.config.combat.knockbackBase * (heavy ? H.maulbreaker.knockbackMult : 1);
        for (const o of api.state.objects) {
          const rr = reach + o.radius;
          if ((ship.x - o.x) ** 2 + (ship.y - o.y) ** 2 > rr * rr) continue;
          if (ship.ramHitList.indexOf(o) >= 0) continue;
          ship.ramHitList.push(o);
          const d = Math.hypot(ship.x - o.x, ship.y - o.y) || 1;
          api.damageObject(o, impact, { dx: (o.x - ship.x) / d, dy: (o.y - ship.y) / d, knockback: kb });
          if (ship.classId === 'worldsplitter' && ship.ramFull && !ship.ramSlammed) {
            ship.ramSlammed = true; this.shockwave(api, ship, H);
          }
        }
      },
      shockwave(api, ship, H) {
        const s = H.worldsplitterSlam;
        for (const o of api.state.objects) {
          const d = Math.hypot(o.x - ship.x, o.y - ship.y);
          if (d > s.radius) continue;
          api.damageObject(o, s.damage, { dx: (o.x - ship.x) / (d || 1), dy: (o.y - ship.y) / (d || 1), knockback: s.knockback });
        }
        api.fx.spawnParticles(ship.x, ship.y, 28, hueFor(ship.classId), { speed: 360 });
        api.fx.addShake(api.config.fx.screenShakeMax);
      },
    },

    // GRAVITOR — hold fire to PULL the nearest rock into orbit (capacity-limited); press the
    // ability to HURL a held rock at the cursor. Thrown rocks smash other rocks (orbitalHarvest
    // pays bonus scrap). Farming style: indirect — turn the field against itself.
    gravityWell: {
      update(api, ship, dt, ctx) {
        const G = api.config.gravitor;
        if (!ship.captured) ship.captured = [];
        ship.orbSpin = (ship.orbSpin || 0) + G.orbit.speed * dt;
        const cap = (ship.classId === 'meteorist' || ship.classId === 'starfall') ? G.meteorist.capacity : G.well.asteroidCapacity;
        if (!ctx.firing || ship.captured.length >= cap) return;
        let best = null, bd = G.well.pullRadius;
        for (const o of api.state.objects) {
          const d = Math.hypot(o.x - ship.x, o.y - ship.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return;
        const dx = ship.x - best.x, dy = ship.y - best.y, d = Math.hypot(dx, dy) || 1;
        best.vx += (dx / d) * G.capture.pullStrength * dt;
        best.vy += (dy / d) * G.capture.pullStrength * dt;
        if (d < ship.radius + G.orbit.radius + best.radius) {
          const idx = api.state.objects.indexOf(best);
          if (idx >= 0) api.state.objects.splice(idx, 1);
          ship.captured.push({ type: best.type, radius: best.radius });
          api.state.respawns.push({ timer: api.config.farming.respawnSec });   // conserve population
          api.fx.spawnParticles(ship.x, ship.y, 8, '#b06bff', { speed: 160 });
        }
      },
    },

    // FLAILSHIP — a chained orb perpetually orbits the hull; hold fire to extend its reach.
    // Contact is the hit (damage scales with the orb's tip speed). Farming style: sweep through
    // clusters; one pass = one hit per rock. Chainmaul = bigger/harder orb, Ironmoon = moon slam.
    wreckingOrb: {
      update(api, ship, dt, ctx) {
        const F = api.config.flailship;
        const cm = (ship.classId === 'chainmaul' || ship.classId === 'ironmoon') ? F.chainmaul : null;
        const rMin = F.orb.radiusMin * (cm ? cm.orbRadiusMult : 1);
        const rMax = F.orb.radiusMax * (cm ? cm.orbRadiusMult : 1);
        const target = ctx.firing ? rMax : rMin;
        ship.orbRadius = ship.orbRadius == null ? rMin : ship.orbRadius + (target - ship.orbRadius) * Math.min(1, 6 * dt);
        const spd = F.orb.orbitSpeed * (ship.orbBurstTimer > 0 ? F.swingControl.burstSpeedMult : 1);
        ship.orbAngle = (ship.orbAngle || 0) + spd * dt;
        const ox = ship.x + Math.cos(ship.orbAngle) * ship.orbRadius;
        const oy = ship.y + Math.sin(ship.orbAngle) * ship.orbRadius;
        ship.orbX = ox; ship.orbY = oy;
        let dmg = F.orb.contactDamage * (cm ? cm.contactDamageMult : 1) + (spd * ship.orbRadius) * F.orb.momentumMultiplier;
        if (ship.powerSwingTimer > 0) dmg *= F.powerSwing.damageMult;
        for (const o of api.state.objects) {
          const rr = F.orb.tipRadius + o.radius;
          if ((ox - o.x) ** 2 + (oy - o.y) ** 2 > rr * rr) continue;
          if (api.state.time - (o._orbHit || -9) < F.orb.hitCooldownSec) continue;
          o._orbHit = api.state.time;
          const d = Math.hypot(ox - o.x, oy - o.y) || 1;
          api.damageObject(o, dmg, { dx: (o.x - ox) / d, dy: (o.y - oy) / d, knockback: 60 });
        }
      },
    },
  };

  // ---- ABILITIES -----------------------------------------------------------
  function launchRock(api, ship, rock, ang) {
    const G = api.config.gravitor;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const ox = ship.x + dx * (ship.radius + G.orbit.radius), oy = ship.y + dy * (ship.radius + G.orbit.radius);
    let dmg = G.well.launchDamage;
    if (ship.classId === 'meteorist' || ship.classId === 'starfall') dmg *= (1 + G.momentumStrike.medThrowBonus);
    api.state.projectiles.push({
      x: ox, y: oy, px: ox, py: oy,
      vx: dx * G.well.launchSpeed, vy: dy * G.well.launchSpeed,
      radius: G.thrownRockRadius, damage: dmg, pierceLeft: 3, life: 2.4,
      color: '#b06bff', kind: 'rock', harvest: true,
    });
    api.fx.spawnParticles(ox, oy, 8, '#b06bff', { dir: ang, spread: 0.4, speed: 220 });
    api.fx.addShake(5);
  }

  const abilities = {
    // Railship: backward burst that sheds heat and bleeds charge.
    ventDash: {
      activate(api, ship) {
        const v = api.config.railship.ventDash;
        api.applyImpulse(ship, -Math.cos(ship.aim) * v.dashSpeed, -Math.sin(ship.aim) * v.dashSpeed);
        ship.heat = Math.max(0, ship.heat - v.heatReduction);
        if (ship.charging) ship.charge = Math.max(0, ship.charge - v.chargePenaltyFraction);
        api.fx.spawnParticles(ship.x, ship.y, 12, '#9fe8ff', { dir: ship.aim, spread: 1.1, speed: 320 });
        api.fx.addShake(6);
        return v.cooldownSec;
      },
    },
    // Hammerhead: brief damage-reduction window after committing.
    brace: {
      activate(api, ship) {
        const b = api.config.hammerhead.brace;
        ship.braceTimer = b.durationSec;
        api.fx.spawnParticles(ship.x, ship.y, 10, '#ffb27a', { speed: 120 });
        return b.cooldownSec;
      },
    },
    // Gravitor: hurl held rock(s) at the cursor. Starfall dumps the whole volley as a fan.
    launchAsteroid: {
      activate(api, ship) {
        if (!ship.captured || ship.captured.length === 0) return 0;   // nothing to launch
        const G = api.config.gravitor;
        const isStarfall = ship.classId === 'starfall';
        const n = isStarfall ? ship.captured.length : 1;
        for (let i = 0; i < n; i++) {
          const rock = ship.captured.pop();
          const spread = isStarfall ? (i - (n - 1) / 2) * 0.12 : 0;
          launchRock(api, ship, rock, ship.aim + spread);
        }
        return G.well.cooldownSec;
      },
    },
    // Flailship base: brief orb speed burst.
    swingControl: {
      activate(api, ship) {
        const s = api.config.flailship.swingControl;
        ship.orbBurstTimer = s.durationSec;
        api.fx.addShake(3);
        return s.cooldownSec;
      },
    },
    // Chainmaul: damage-amp window on the orb.
    powerSwing: {
      activate(api, ship) {
        const s = api.config.flailship.powerSwing;
        ship.powerSwingTimer = s.durationSec;
        api.fx.spawnParticles(ship.x, ship.y, 12, '#ffd23c', { speed: 160 });
        return s.cooldownSec;
      },
    },
    // Ironmoon: slam — big AoE burst at the orb's current position.
    moonSlam: {
      activate(api, ship) {
        const m = api.config.flailship.moonSlam;
        const ox = ship.orbX != null ? ship.orbX : ship.x, oy = ship.orbY != null ? ship.orbY : ship.y;
        const radius = 130;
        for (const o of api.state.objects) {
          const d = Math.hypot(o.x - ox, o.y - oy);
          if (d > radius) continue;
          api.damageObject(o, m.damage, { dx: (o.x - ox) / (d || 1), dy: (o.y - oy) / (d || 1), knockback: m.knockback });
        }
        api.fx.spawnParticles(ox, oy, 24, '#ffd23c', { speed: 320 });
        api.fx.addShake(api.config.fx.screenShakeMax);
        return m.chargeSec + 2.5;     // slam cooldown (chargeSec placeholder + recovery)
      },
    },
  };

  // ---- resolvers (the only place keys become behaviour) --------------------
  window.PULSAR.weapons = weapons;
  window.PULSAR.abilities = abilities;
  window.PULSAR.weaponHue = hueFor;

  window.PULSAR.resolveWeapon = function (key) {
    return weapons[key] || { update() { /* TODO: 2nd-branch weapons (Phase 4) — no-op */ } };
  };
  window.PULSAR.resolveAbility = function (key) {
    return (key && abilities[key]) || { activate() { return 0; } };
  };
})();
