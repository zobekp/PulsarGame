// PULSAR.io — WEAPON + ABILITY + SPECIAL BEHAVIOURS (data-driven hook registry)
// The engine calls weapon.update() every tick, ability.activate() / special.activate() on press.
// Behaviours act through `api`: damage via api.damage(target,...) over api.hittables(ship)
// (neutral rocks + ENEMY SHIPS), so the same code farms and fights. Bots drive these too.
//
// Phase 4 completes the tree: both branches of every family, through final, plus finals' specials.
window.PULSAR = window.PULSAR || {};

(function () {
  function hueFor(classId) {
    let v = PULSAR.classVisuals[classId];
    while (v && !v.hue && v.inherits) v = PULSAR.classVisuals[v.inherits];
    return (v && v.hue) || '#ffffff';
  }

  // ---- WEAPONS -------------------------------------------------------------
  const weapons = {

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
          life: c.projectileLifeSec, color: c.color, team: ship.team, owner: ship,
        });
        ship.fireTimer = c.fireCooldownSec;
      },
    },

    // RAILSHIP line — hold-charge hitscan beam, pierces N with falloff (neutral OR ship).
    chargeRail: {
      update(api, ship, dt, ctx) {
        const R = api.config.railship, ch = R.charge;
        if (ship.ventTimer > 0) { ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0; return; }
        if (ctx.firing) {
          ship.charging = true;
          let rate = dt / ch.timeToFullSec;
          if (ship.chargeBoostTimer > 0) { rate *= R.ventDash.chargeBoostMult; ship.chargeBoostTimer = Math.max(0, ship.chargeBoostTimer - dt); }
          ship.charge = Math.min(ch.overchargeCap, ship.charge + rate);
          // Hold at full charge and the core redlines; past overheatSec it BLOWS — all charge lost,
          // no shot, heat maxed, vent lockout. The risk that caps how long you can hold a big shot.
          if (ship.charge >= ch.lanceMax) {
            ship.chargeFullTimer = (ship.chargeFullTimer || 0) + dt;
            if (ship.chargeFullTimer >= ch.overheatSec) {
              ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0;
              ship.heat = R.heat.max; ship.ventTimer = ch.overheatVentSec;
              api.fx.spawnParticles(ship.x, ship.y, 32, '#ff4530', { speed: 340, life: 0.6 });
              if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
            }
          } else ship.chargeFullTimer = 0;
        } else if (ship.charging) {
          this.fire(api, ship);
          ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0;
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
        for (const t of api.hittables(ship)) {
          const along = (t.x - ox) * dx + (t.y - oy) * dy;
          if (along < 0 || along > maxRange) continue;
          const perp = Math.abs((t.x - ox) * -dy + (t.y - oy) * dx);
          if (perp <= halfWidth + t.radius) hits.push({ t, along });
        }
        hits.sort((a, b) => a.along - b.along);
        let pierced = 0, neutrals = 0;
        for (const h of hits) {
          if (pierced >= pierce) break;
          const fall = (h.t.isShip ? R.pierceFalloff.players : R.pierceFalloff.neutral);
          let d = dmg * fall[Math.min(pierced, fall.length - 1)];
          if (mods.closeRange && h.along < mods.closeRange) d *= mods.closeDamageMult;
          if (mods.perfectLineRangeFrac && h.along > maxRange * mods.perfectLineRangeFrac) d *= (1 + mods.perfectLineBonus);
          api.damage(h.t, d, { dx, dy, knockback: R.beam.knockback, crack: big, source: ship });
          // IMPULSE BREAK: a full/overcharge shot on a charger kills its momentum + interrupts the lunge.
          if (big && h.t.isShip && api.isHighMomentum && api.isHighMomentum(h.t)) {
            const ib = R.impulseBreak, strong = stage === 'overcharge';
            const vr = strong ? ib.overchargeVelocityReduction : ib.velocityReduction;
            h.t.impX *= (1 - vr); h.t.impY *= (1 - vr);
            h.t.slow = Math.max(h.t.slow || 0, ib.slow);
            h.t.slowTimer = Math.max(h.t.slowTimer || 0, strong ? ib.overchargeSlowDurationSec : ib.slowDurationSec);
            h.t.ramActive = 0; h.t.ramWinding = false; h.t.ramCharge = 0;   // cancel the charge state
            api.fx.spawnParticles(h.t.x, h.t.y, 12, '#9fe8ff', { speed: 220 });
          }
          pierced++; if (!h.t.isShip) neutrals++;
        }
        // Bigger charges throw a more powerful-looking beam (extra bloom layers, brighter core).
        const power = stage === 'overcharge' ? 1 : stage === 'lance' ? 0.7 : stage === 'focus' ? 0.35 : 0.1;
        api.fx.spawnBeam(ox, oy, ox + dx * maxRange, oy + dy * maxRange, hue, halfWidth, R.beam.visualSec, power);
        api.fx.spawnParticles(ox, oy, 6 + Math.round(power * 14), hue, { dir: ship.aim, spread: 0.6, speed: 260 + power * 220 });
        if (neutrals >= R.lineBreakThreshold) api.lineBreak(ship, neutrals, ox, oy);
        api.applyImpulse(ship, -dx * recoil, -dy * recoil);
        ship.heat = Math.min(heat.max, ship.heat + heatAdd);
        api.fx.addShake(ship.isBot ? 0 : Math.min(api.config.fx.screenShakeMax, recoil * 0.07));
      },
    },

    // HAMMERHEAD line — wind up, lunge; contact = momentum impact (neutral OR ship).
    hammerRam: {
      update(api, ship, dt, ctx) {
        const H = api.config.hammerhead;
        if (ship.ramCd > 0) ship.ramCd -= dt;
        if (ship.bodyCheckCd > 0) ship.bodyCheckCd -= dt;
        if (ship.ramActive > 0) {
          if (!ship.isBot) api.fx.spawnParticles(ship.x, ship.y, 2, hueFor(ship.classId), { speed: 24, life: 0.32, size: ship.radius * 0.42, spread: 0.8 });
          this.smash(api, ship, H); return;
        }
        // Wind up + lunge — gated by the dash cooldown so you can't ram-spam.
        if (ctx.firing && !(ship.ramCd > 0)) {
          ship.ramWinding = true;
          ship.ramCharge = Math.min(1, (ship.ramCharge || 0) + dt / H.lunge.chargeTimeSec);
        } else if (ship.ramWinding) {
          this.lunge(api, ship, H);
          ship.ramWinding = false; ship.ramCharge = 0;
        }
        // Between dashes the heavy hull still bashes enemies you make contact with.
        this.bodyCheck(api, ship, H);
      },
      bodyCheck(api, ship, H) {
        if (ship.bodyCheckCd > 0) return;
        const bc = H.bodyCheck;
        for (const e of api.enemiesOf(ship)) {
          if (e.spawnProtect > 0) continue;
          const dx = e.x - ship.x, dy = e.y - ship.y, rr = ship.radius + e.radius;
          if (dx * dx + dy * dy > rr * rr) continue;
          const d = Math.hypot(dx, dy) || 1;
          api.damage(e, bc.damage, { dx: dx / d, dy: dy / d, knockback: bc.knockback, source: ship });
          api.fx.spawnParticles(ship.x + dx * 0.5, ship.y + dy * 0.5, 6, hueFor(ship.classId), { speed: 140 });
          ship.bodyCheckCd = bc.cooldownSec;
          break;
        }
      },
      lunge(api, ship, H) {
        const c = ship.ramCharge || 0;
        ship.ramHitBase = c < 0.34 ? H.ram.tapBashDamage : c < 0.95 ? H.ram.chargedDamage : H.ram.overcommitDamage;
        ship.ramFull = c >= 0.95; ship.ramSlammed = false;
        const f = H.lunge.minLungeFactor + (1 - H.lunge.minLungeFactor) * c;
        ship.ramActive = H.lunge.durationSec * (0.55 + 0.45 * c);
        ship.ramCd = ship.ramActive + H.lunge.cooldownSec;   // can't dash again until the active phase + cooldown elapse
        ship.ramHitList = [];
        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);
        api.applyImpulse(ship, dx * H.lunge.speed * f, dy * H.lunge.speed * f);
        api.fx.spawnParticles(ship.x, ship.y, 8 + Math.round(c * 10), hueFor(ship.classId), { dir: ship.aim, spread: 0.5, speed: 220 + c * 160 });
        if (!ship.isBot) api.fx.addShake(5 + c * 7);
      },
      smash(api, ship, H) {
        const heavy = (ship.classId === 'maulbreaker' || ship.classId === 'worldsplitter');
        const reach = ship.radius * (heavy ? H.maulbreaker.frontHitboxMult : 1);
        const impact = ship.ramHitBase + Math.hypot(ship.impX, ship.impY) * H.ram.momentumMultiplier;
        const kb = api.config.combat.knockbackBase * (heavy ? H.maulbreaker.knockbackMult : 1);
        for (const t of api.hittables(ship)) {
          const rr = reach + t.radius;
          if ((ship.x - t.x) ** 2 + (ship.y - t.y) ** 2 > rr * rr) continue;
          if (ship.ramHitList.indexOf(t) >= 0) continue;
          ship.ramHitList.push(t);
          const d = Math.hypot(ship.x - t.x, ship.y - t.y) || 1;
          api.damage(t, impact, { dx: (t.x - ship.x) / d, dy: (t.y - ship.y) / d, knockback: kb, source: ship });
          if (ship.classId === 'worldsplitter' && ship.ramFull && !ship.ramSlammed) { ship.ramSlammed = true; this.shockwave(api, ship, H); }
        }
      },
      shockwave(api, ship, H) {
        const s = H.worldsplitterSlam;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ship.x, t.y - ship.y);
          if (d > s.radius) continue;
          api.damage(t, s.damage, { dx: (t.x - ship.x) / (d || 1), dy: (t.y - ship.y) / (d || 1), knockback: s.knockback, source: ship });
        }
        api.fx.spawnParticles(ship.x, ship.y, 28, hueFor(ship.classId), { speed: 360 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
      },
    },

    // GRAVITOR line — pull rocks (branch B also DRAGS/SLOWS enemies via the well).
    gravityWell: {
      update(api, ship, dt, ctx) {
        const G = api.config.gravitor;
        if (!ship.captured) ship.captured = [];
        ship.orbSpin = (ship.orbSpin || 0) + G.orbit.speed * dt;
        const drag = (ship.classId === 'singularity' || ship.classId === 'eventHorizon');
        if (drag) {                                   // tidalDrag passive: slow enemies in the well
          const td = G.tidalDrag, rad = G.well.pullRadius * td.radiusMult;
          for (const e of api.enemiesOf(ship)) {
            const d = Math.hypot(e.x - ship.x, e.y - ship.y);
            if (d > rad) continue;
            e.vx += ((ship.x - e.x) / (d || 1)) * td.pull * dt; e.vy += ((ship.y - e.y) / (d || 1)) * td.pull * dt;
            e.slow = Math.max(e.slow || 0, td.slow); e.slowTimer = Math.max(e.slowTimer || 0, 0.12);
          }
        }
        // ALL wells disrupt high-momentum chargers: extra inward pull + bleed the lunge + brief slow,
        // so a straight charge through the field bends and stalls (counterplay, not a root).
        const w = G.well;
        if (api.isHighMomentum) for (const e of api.enemiesOf(ship)) {
          if (!api.isHighMomentum(e)) continue;
          const dx = ship.x - e.x, dy = ship.y - e.y, d = Math.hypot(dx, dy);
          if (d > w.pullRadius) continue;
          e.vx += (dx / (d || 1)) * w.enemyPull * w.highMomentumPullMult * dt;
          e.vy += (dy / (d || 1)) * w.enemyPull * w.highMomentumPullMult * dt;
          e.impX *= (1 - w.highMomentumDamping); e.impY *= (1 - w.highMomentumDamping);
          e.slow = Math.max(e.slow || 0, w.highMomentumSlow); e.slowTimer = Math.max(e.slowTimer || 0, 0.15);
        }
        const cap = (G.launchByClass[ship.classId] || G.launchByClass.gravitor).cap;
        if (ship.captured.length >= cap) return;
        const need = cap - ship.captured.length, cands = [];
        for (const o of api.state.objects) { const d = Math.hypot(o.x - ship.x, o.y - ship.y); if (d < G.well.pullRadius) cands.push({ o, d }); }
        cands.sort((a, b) => a.d - b.d);
        for (let i = 0; i < Math.min(need, cands.length); i++) {
          const o = cands[i].o, d = cands[i].d || 1;
          o.vx += ((ship.x - o.x) / d) * G.capture.pullStrength * dt;
          o.vy += ((ship.y - o.y) / d) * G.capture.pullStrength * dt;
          if (d < ship.radius + G.orbit.radius + o.radius) {
            const idx = api.state.objects.indexOf(o); if (idx >= 0) api.state.objects.splice(idx, 1);
            ship.captured.push({ type: o.type, radius: o.radius });
            api.state.respawns.push({ timer: api.config.farming.respawnSec });
            api.fx.spawnParticles(ship.x, ship.y, 6, '#b06bff', { speed: 150 });
          }
        }
      },
    },

    // FLAILSHIP line — COMMANDED CHAIN ORB. A tethered orb that defends, then COMMITS on a throw:
    //   ORBIT ('orbit'): circles the hull as a defensive shield — low damage, punishes divers, and
    //          — like every state — intercepts enemy projectiles it touches.
    //   THROW: fire (when off cooldown) shoots the orb OUT to the aimed point ('out'), then it
    //          AUTO-RETURNS ('back') and a longish cooldown begins. It can't be held out.
    // Triggered off ctx.firing as a LEVEL + a cooldown gate, so bots use the same code path —
    // hold or tap, you get one throw per cooldown.
    wreckingOrb: {
      update(api, ship, dt, ctx) {
        const F = api.config.flailship, O = F.orb;
        const om = F.orbModByClass[ship.classId] || null;
        const reachMult = om ? om.radiusMult : 1, dmgMult = om ? om.dmgMult : 1;
        const lock = ship.orbLockTimer > 0;                 // Graviflail Orbit Lock pins to a wide orbit
        const orbitR = O.orbitRadius * reachMult * (lock ? (F.orbitLock.radiusMult || 1.6) : 1);
        const maxReach = O.maxReach * reachMult;
        if (ship.orbRadius == null) { ship.orbRadius = orbitR; ship.orbState = 'orbit'; ship.orbCd = 0; ship.orbHitGen = 0; }
        if (ship.orbCd > 0) ship.orbCd -= dt;

        // Launch: fire while resting + off cooldown shoots the orb out at FULL chain range along the
        // aim direction (the cursor sets direction, not distance). Locked at launch so it returns.
        if (ship.orbState === 'orbit' && !lock && ctx.firing && ship.orbCd <= 0) {
          ship.orbThrowDist = maxReach;
          ship.orbState = 'out'; ship.orbHitGen++;       // new pass — every target can be hit once on the way out
        }
        // Resolve the cycle: extend to full reach, hang briefly so the throw reads, then retract.
        if (ship.orbState === 'out') {
          ship.orbRadius += O.throwSpeed * dt;
          if (ship.orbRadius >= ship.orbThrowDist) { ship.orbRadius = ship.orbThrowDist; ship.orbState = 'hold'; ship.orbHang = O.apexHangSec; }
        } else if (ship.orbState === 'hold') {
          ship.orbHang -= dt;
          if (ship.orbHang <= 0) { ship.orbState = 'back'; ship.orbHitGen++; } // back pass can hit again
        } else if (ship.orbState === 'back') {
          ship.orbRadius -= O.recallSpeed * dt;
          if (ship.orbRadius <= orbitR) { ship.orbRadius = orbitR; ship.orbState = 'orbit'; ship.orbCd = O.throwCooldownSec; }
        } else {
          const dr = orbitR - ship.orbRadius, step = O.recallSpeed * dt;   // settle to orbit (handles lock radius change)
          ship.orbRadius += Math.abs(dr) <= step ? dr : (dr < 0 ? -step : step);
        }
        const thrown = ship.orbState === 'out' || ship.orbState === 'hold' || ship.orbState === 'back';

        // Angle: circle while resting; steer toward the cursor while airborne (lightly steerable).
        if (!thrown) {
          const burst = (ship.orbBurstTimer > 0 || lock) ? F.swingControl.burstSpeedMult : 1;
          ship.orbAngle = (ship.orbAngle || 0) + O.orbitSpeed * burst * dt;
        } else {
          let da = ship.aim - (ship.orbAngle || 0);
          da = Math.atan2(Math.sin(da), Math.cos(da));      // shortest arc toward aim
          ship.orbAngle = (ship.orbAngle || 0) + da * Math.min(1, O.sweepEase * dt);
        }
        const ox = ship.x + Math.cos(ship.orbAngle) * ship.orbRadius;
        const oy = ship.y + Math.sin(ship.orbAngle) * ship.orbRadius;
        ship.orbX = ox; ship.orbY = oy;
        ship.orbActive = true; ship.orbBlockRadius = O.tipRadius;   // shield: intercepts enemy shots

        // Damage by state: throw-out/hold (big committed hit) > throw-back (return sweep) > orbit (defensive).
        let dmg = (ship.orbState === 'back' ? O.recallDamage : (ship.orbState === 'out' || ship.orbState === 'hold') ? O.throwDamage : O.orbitDamage) * dmgMult;
        if (ship.powerSwingTimer > 0) dmg *= F.powerSwing.damageMult;
        for (const t of api.hittables(ship)) {
          const rr = O.tipRadius + t.radius;
          if ((ox - t.x) ** 2 + (oy - t.y) ** 2 > rr * rr) continue;
          // Thrown: gate per PASS (out, back) so a target takes the out-hit AND the return sweep.
          // Orbit: gate by time so one circling pass = one hit.
          if (thrown) { if (t._orbGen === ship.orbHitGen) continue; t._orbGen = ship.orbHitGen; }
          else { if (api.state.time - (t._orbHit || -9) < O.hitCooldownSec) continue; t._orbHit = api.state.time; }
          const d = Math.hypot(ox - t.x, oy - t.y) || 1;
          api.damage(t, dmg, { dx: (t.x - ox) / d, dy: (t.y - oy) / d, knockback: 60, source: ship });
        }
      },
    },
  };

  // ---- ABILITIES (Space) ---------------------------------------------------
  function launchRock(api, ship, rock, ang) {
    const G = api.config.gravitor, dx = Math.cos(ang), dy = Math.sin(ang);
    const ox = ship.x + dx * (ship.radius + G.orbit.radius), oy = ship.y + dy * (ship.radius + G.orbit.radius);
    let dmg = G.well.launchDamage;
    if (ship.classId === 'meteorist' || ship.classId === 'starfall') dmg *= (1 + G.momentumStrike.medThrowBonus);
    const hpKey = { asteroid: 'asteroidHP', crystal: 'crystalHP', debris: 'debrisHP' }[rock.type] || 'asteroidHP';
    const hp = (api.config.farming[hpKey] || 12) * G.thrownRockHpMult;   // tankier than a normal rock — shootable but takes a real hit
    api.state.projectiles.push({ x: ox, y: oy, px: ox, py: oy, vx: dx * G.well.launchSpeed, vy: dy * G.well.launchSpeed,
      radius: rock.radius || G.thrownRockRadius, rockType: rock.type, isThrownRock: true, hp, damage: dmg, pierceLeft: 3, life: 2.4, color: '#b06bff', kind: 'rock', harvest: true, team: ship.team, owner: ship });
    api.fx.spawnParticles(ox, oy, 8, '#b06bff', { dir: ang, spread: 0.4, speed: 220 });
  }

  const abilities = {
    ventDash: {
      activate(api, ship) {
        const v = api.config.railship.ventDash;
        api.applyImpulse(ship, -Math.cos(ship.aim) * v.dashSpeed, -Math.sin(ship.aim) * v.dashSpeed);
        ship.heat = Math.max(0, ship.heat - v.heatReduction);
        if (ship.charging) ship.charge *= v.chargePreserveFraction;   // keep most of the charge through the dash
        ship.chargeBoostTimer = v.chargeBoostSec;                     // and recharge faster right after
        api.fx.spawnParticles(ship.x, ship.y, 12, '#9fe8ff', { dir: ship.aim, spread: 1.1, speed: 320 });
        return v.cooldownSec;
      },
    },
    brace: {
      activate(api, ship) {
        const b = api.config.hammerhead.brace;
        ship.braceTimer = b.durationSec;
        api.fx.spawnParticles(ship.x, ship.y, 10, '#ffb27a', { speed: 120 });
        return b.cooldownSec;
      },
    },
    launchAsteroid: {
      activate(api, ship) {
        if (!ship.captured || ship.captured.length === 0) return 0;
        const lc = api.config.gravitor.launchByClass[ship.classId] || api.config.gravitor.launchByClass.gravitor;
        const n = Math.min(lc.per, ship.captured.length);
        for (let i = 0; i < n; i++) {
          const rock = ship.captured.pop();
          launchRock(api, ship, rock, ship.aim + (n > 1 ? (i - (n - 1) / 2) * 0.14 : 0));
        }
        return lc.cd;
      },
    },
    swingControl: {
      activate(api, ship) { const s = api.config.flailship.swingControl; ship.orbBurstTimer = s.durationSec; return s.cooldownSec; },
    },
    powerSwing: {
      activate(api, ship) { const s = api.config.flailship.powerSwing; ship.powerSwingTimer = s.durationSec; api.fx.spawnParticles(ship.x, ship.y, 12, '#ffd23c', { speed: 160 }); return s.cooldownSec; },
    },
    moonSlam: {
      activate(api, ship) {
        const m = api.config.flailship.moonSlam;
        const ox = ship.orbX != null ? ship.orbX : ship.x, oy = ship.orbY != null ? ship.orbY : ship.y;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ox, t.y - oy);
          if (d > 130) continue;
          api.damage(t, m.damage, { dx: (t.x - ox) / (d || 1), dy: (t.y - oy) / (d || 1), knockback: m.knockback, source: ship });
        }
        api.fx.spawnParticles(ox, oy, 24, '#ffd23c', { speed: 320 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
        return m.chargeSec + 2.5;
      },
    },
    // Graviflail: lock the orb into a wide, fast DEFENSIVE orbit for a few seconds.
    orbitLock: {
      activate(api, ship) { const o = api.config.flailship.orbitLock; ship.orbLockTimer = o.durationSec; api.fx.spawnParticles(ship.x, ship.y, 14, '#ffd23c', { speed: 200 }); return o.cooldownSec; },
    },
  };

  // ---- SPECIALS (E key — finals only) -------------------------------------
  const specials = {
    // Star Piercer: mark first enemy in aim line with a broken-core weak point (amplified damage for all).
    brokenCore: {
      activate(api, ship) {
        const R = api.config.railship, mods = R.evolveMods.starPiercer || {};
        const maxRange = R.beam.maxRange * (mods.rangeMult || 1.5);
        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);
        const ox = ship.x + dx * ship.radius, oy = ship.y + dy * ship.radius;
        let closest = null, closestAlong = Infinity;
        for (const e of api.enemiesOf(ship)) {
          const along = (e.x - ox) * dx + (e.y - oy) * dy;
          if (along < 0 || along > maxRange) continue;
          const perp = Math.abs((e.x - ox) * -dy + (e.y - oy) * dx);
          if (perp <= R.beam.halfWidth * 3 + e.radius && along < closestAlong) { closest = e; closestAlong = along; }
        }
        if (closest) {
          closest.cracked = true;
          closest.crackTimer = Math.max(closest.crackTimer, mods.brokenCoreMarkSec || 2.0);
          api.fx.spawnParticles(closest.x, closest.y, 18, '#ffb27a', { speed: 120, life: 0.6 });
          api.fx.spawnBeam(ox, oy, closest.x, closest.y, '#ffb27a', 2, 0.25);
        } else {
          api.fx.spawnBeam(ox, oy, ox + dx * maxRange, oy + dy * maxRange, '#ffb27a', 1, 0.15);
        }
        api.fx.spawnParticles(ship.x, ship.y, 8, '#ffb27a', { dir: ship.aim, spread: 0.3, speed: 280 });
        return 8.0;
      },
    },
    // Worldsplitter: on-demand shockwave burst at current position (no full ram required).
    worldsplitterSlam: {
      activate(api, ship) {
        const s = api.config.hammerhead.worldsplitterSlam;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ship.x, t.y - ship.y);
          if (d > s.radius) continue;
          api.damage(t, s.damage, { dx: (t.x - ship.x) / (d || 1), dy: (t.y - ship.y) / (d || 1), knockback: s.knockback, source: ship });
        }
        api.fx.spawnParticles(ship.x, ship.y, 32, hueFor(ship.classId), { speed: 380 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
        return 10.0;
      },
    },
    // Starfall: meteor barrage — dump all held rocks in a wide fan instantly.
    meteorVolley: {
      activate(api, ship) {
        if (!ship.captured || ship.captured.length === 0) return 0;
        const count = ship.captured.length;
        const spread = Math.min(Math.PI * 0.75, count * 0.11);
        for (let i = 0; i < count; i++) {
          const rock = ship.captured.pop();
          const angle = ship.aim - spread / 2 + (count > 1 ? (spread / (count - 1)) * i : 0);
          launchRock(api, ship, rock, angle);
        }
        api.fx.spawnParticles(ship.x, ship.y, 30, '#b06bff', { speed: 260 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax * 0.7);
        return 7.0;
      },
    },
    // Ironmoon: moon slam in the special slot (same move, independent cooldown from ability).
    moonSlam: {
      activate(api, ship) {
        const m = api.config.flailship.moonSlam;
        const ox = ship.orbX != null ? ship.orbX : ship.x, oy = ship.orbY != null ? ship.orbY : ship.y;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ox, t.y - oy);
          if (d > 130) continue;
          api.damage(t, m.damage, { dx: (t.x - ox) / (d || 1), dy: (t.y - oy) / (d || 1), knockback: m.knockback, source: ship });
        }
        api.fx.spawnParticles(ox, oy, 24, '#ffd23c', { speed: 320 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
        return m.chargeSec + 2.5;
      },
    },
    // Event Horizon: implode the well — yank in nearby enemies and detonate by rocks held.
    collapse: {
      activate(api, ship) {
        const c = api.config.gravitor.collapse, held = Math.max(1, (ship.captured || []).length);
        ship.captured = [];
        const radius = api.config.gravitor.well.pullRadius;
        for (const e of api.enemiesOf(ship)) {
          const d = Math.hypot(e.x - ship.x, e.y - ship.y);
          if (d > radius) continue;
          e.vx += ((ship.x - e.x) / (d || 1)) * 900; e.vy += ((ship.y - e.y) / (d || 1)) * 900;
          e.slow = Math.max(e.slow || 0, 0.6); e.slowTimer = Math.max(e.slowTimer || 0, c.dragDurationSec);
          api.damage(e, c.damagePerStoredAsteroid * held, { dx: 0, dy: 0, source: ship });
        }
        api.fx.spawnParticles(ship.x, ship.y, 36, '#b06bff', { speed: 60, life: 0.5 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
        return c.channelSec + 3.0;
      },
    },
    // Orbit Crusher: a spin-up crush burst — heavy AoE damage + pull around the hull.
    gravityCrush: {
      activate(api, ship) {
        const g = api.config.flailship.gravityCrush;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ship.x, t.y - ship.y);
          if (d > g.radius) continue;
          api.damage(t, g.dps, { dx: (t.x - ship.x) / (d || 1), dy: (t.y - ship.y) / (d || 1), knockback: 120, source: ship });
          if (t.isShip) { t.slow = Math.max(t.slow || 0, 0.3); t.slowTimer = Math.max(t.slowTimer || 0, 0.4); }
        }
        api.fx.spawnParticles(ship.x, ship.y, 30, '#ffd23c', { speed: 300 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax * 0.8);
        return 6.0;
      },
    },
  };

  window.PULSAR.weapons = weapons;
  window.PULSAR.abilities = abilities;
  window.PULSAR.specials = specials;
  window.PULSAR.weaponHue = hueFor;
  window.PULSAR.resolveWeapon = (key) => weapons[key] || { update() {} };
  window.PULSAR.resolveAbility = (key) => (key && abilities[key]) || { activate() { return 0; } };
  window.PULSAR.resolveSpecial = (key) => (key && specials[key]) || { activate() { return 0; } };
})();
