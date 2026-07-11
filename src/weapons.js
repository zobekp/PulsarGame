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

  // Shared beam corridor query: everything hittable within `halfWidth` of the ray, sorted
  // near-to-far. Used by the continuous beams (helion / maw); chargeRail keeps its own.
  function beamHits(api, ship, ox, oy, dx, dy, range, halfWidth) {
    const hits = [];
    for (const t of api.hittables(ship)) {
      const along = (t.x - ox) * dx + (t.y - oy) * dy;
      if (along < 0 || along > range) continue;
      const perp = Math.abs((t.x - ox) * -dy + (t.y - oy) * dx);
      if (perp <= halfWidth + t.radius) hits.push({ t, along });
    }
    hits.sort((a, b) => a.along - b.along);
    return hits;
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
        const maxRange = R.beam.maxRange * (mods.rangeMult || 1) * (ship.rangeMult || 1);   // bigger hull reaches further
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
        // Range damage falloff vs SHIPS (neutral farming/line-break is unaffected): full to
        // fullRangeFrac of range, then linear down to minMult at the tip. Kills the cross-map 2-tap.
        const rf = R.beam.rangeFalloff, rfFull = rf.fullRangeFrac * maxRange;
        const rangeMult = (along) => along <= rfFull ? 1
          : 1 - (1 - rf.minMult) * Math.min(1, (along - rfFull) / (maxRange - rfFull));
        let pierced = 0, neutrals = 0;
        for (const h of hits) {
          if (pierced >= pierce) break;
          const fall = (h.t.isShip ? R.pierceFalloff.players : R.pierceFalloff.neutral);
          let d = dmg * fall[Math.min(pierced, fall.length - 1)];
          if (h.t.isShip) d *= rangeMult(h.along);
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
        api.fx.spawnBeam(ox, oy, ox + dx * maxRange, oy + dy * maxRange, hue, halfWidth, R.beam.visualSec, power,
                         { fullFrac: rf.fullRangeFrac, minMult: rf.minMult });   // opacity fades to show the damage falloff
        api.fx.spawnParticles(ox, oy, 6 + Math.round(power * 14), hue, { dir: ship.aim, spread: 0.6, speed: 260 + power * 220 });
        if (neutrals >= R.lineBreakThreshold) api.lineBreak(ship, neutrals, ox, oy);
        api.applyImpulse(ship, -dx * recoil, -dy * recoil);
        ship.heat = Math.min(heat.max, ship.heat + heatAdd);
        api.fx.addShake(ship.isBot ? 0 : Math.min(api.config.fx.screenShakeMax, recoil * 0.07));
      },
    },

    // HELION (rail branch A) — continuous beam, damage RAMPS while held, heat compounds.
    // Reuses the rail chassis systems: s.charging/charge drive the HUD bar, movement slow,
    // bloom and capacitor-ring visuals; heat/vent are the same meter the family shares.
    helionBeam: {
      update(api, ship, dt, ctx) {
        const B = api.config.helion.beam, R = api.config.railship;
        if (ship.ventTimer > 0) { ship.beamRamp = 0; ship.charging = false; ship.charge = 0; return; }
        if (!ctx.firing) {
          ship.beamRamp = Math.max(0, (ship.beamRamp || 0) - B.rampDownPerSec * dt);
          ship.charging = false; ship.charge = 0;
          return;
        }
        const ramp = ship.beamRamp = Math.min(1, (ship.beamRamp || 0) + dt / B.rampSec);
        ship.charging = true; ship.charge = ramp;
        // heat accelerates with the ramp; maxing the bar force-vents (greed's fuse)
        ship.heat = Math.min(R.heat.max, ship.heat + (B.heatPerSecBase + (B.heatPerSecMax - B.heatPerSecBase) * ramp) * dt);
        if (ship.heat >= R.heat.max) {
          ship.ventTimer = B.overheatVentSec; ship.beamRamp = 0; ship.charging = false; ship.charge = 0;
          api.fx.spawnParticles(ship.x, ship.y, 24, '#ff4530', { speed: 300, life: 0.5 });
          if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax * 0.7);
          return;
        }
        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);
        const ox = ship.x + dx * ship.radius, oy = ship.y + dy * ship.radius;
        const dps = B.dpsBase + (B.dpsMax - B.dpsBase) * ramp;
        const range = B.range * (ship.rangeMult || 1);   // bigger hull reaches further
        const hits = beamHits(api, ship, ox, oy, dx, dy, range, B.halfWidth);
        let pierced = 0, end = range;
        for (const h of hits) {
          if (pierced >= B.pierce) break;
          const fall = h.t.isShip ? R.pierceFalloff.players : R.pierceFalloff.neutral;
          api.damage(h.t, dps * fall[Math.min(pierced, fall.length - 1)] * dt,
            { dx, dy, knockback: 0, crack: ramp >= B.crackAtRamp, source: ship });
          pierced++;
          if (pierced >= B.pierce) end = h.along;   // beam honestly stops at its last victim
        }
        // continuous beam visual — every 2nd tick (short life overlaps into a solid beam,
        // and halves the MP relay chatter)
        if ((ship._beamTick = (ship._beamTick || 0) + 1) % 2 === 0)
          api.fx.spawnBeam(ox, oy, ox + dx * end, oy + dy * end, hueFor(ship.classId),
            B.halfWidth * (0.8 + 0.8 * ramp), 0.1, 0.12 + 0.55 * ramp);
      },
    },

    // STAR PIERCER (rail branch B) — siege maw. Long charge OPENS the cannon (width of the
    // maw == width of the blast); release fires ONE instantaneous blast — all the damage
    // lands the frame you let go, along the aim you committed to. Fired, NOT steered: a
    // miss wastes the whole recycle. Redline rules still apply at full hold.
    mawRail: {
      update(api, ship, dt, ctx) {
        const R = api.config.railship, M = R.mawRail, ch = R.charge;
        if (ship.fireTimer > 0) ship.fireTimer -= dt;
        if ((ship.beamTimer || 0) > 0) ship.beamTimer -= dt;   // render-only: jaws stay open through the flash
        this.tickRifts(api, ship, dt);                          // Starbreak scars detonate even mid-vent
        if (ship.ventTimer > 0) { ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0; return; }

        if (ctx.firing && ship.fireTimer <= 0) {               // ---- charging: the maw opens
          ship.charging = true;
          ship.charge = Math.min(1, ship.charge + dt / M.chargeTimeSec);
          if (ship.charge >= 1) {                              // same redline/blowout rule as the base rail
            ship.chargeFullTimer = (ship.chargeFullTimer || 0) + dt;
            if (ship.chargeFullTimer >= ch.overheatSec) {
              ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0;
              ship.heat = R.heat.max; ship.ventTimer = ch.overheatVentSec;
              api.fx.spawnParticles(ship.x, ship.y, 32, '#ff4530', { speed: 340, life: 0.6 });
              if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
            }
          } else ship.chargeFullTimer = 0;
        } else if (ship.charging) {                            // ---- release: the blast happens NOW
          const c = ship.charge;
          ship.charging = false; ship.charge = 0; ship.chargeFullTimer = 0;
          if (c >= M.minChargeToFire) this.fire(api, ship, c);
        }
      },
      fire(api, ship, c) {
        const R = api.config.railship, M = R.mawRail;
        const w = M.minHalfWidth + (M.maxHalfWidth - M.minHalfWidth) * c;
        const dmg = M.damageAtMin + (M.damageAtFull - M.damageAtMin) * c;
        const dx = Math.cos(ship.aim), dy = Math.sin(ship.aim);        // locked at this instant
        const ox = ship.x + dx * ship.radius, oy = ship.y + dy * ship.radius;
        const range = M.range * (ship.rangeMult || 1);   // bigger siege hull reaches further
        const hits = beamHits(api, ship, ox, oy, dx, dy, range, w);
        let pierced = 0, neutrals = 0;
        for (const h of hits) {
          if (pierced >= M.pierce) break;
          const fall = h.t.isShip ? R.pierceFalloff.players : R.pierceFalloff.neutral;
          api.damage(h.t, dmg * fall[Math.min(pierced, fall.length - 1)],
            { dx, dy, knockback: R.beam.knockback * (1 + c), crack: c >= M.crackAtCharge, source: ship });
          pierced++; if (!h.t.isShip) neutrals++;
        }
        if (neutrals >= R.lineBreakThreshold) api.lineBreak(ship, neutrals, ox, oy);
        api.fx.spawnBeam(ox, oy, ox + dx * range, oy + dy * range, hueFor(ship.classId), w, M.beamVisualSec, 0.6 + 0.4 * c);
        api.fx.spawnParticles(ox + dx * ship.radius, oy + dy * ship.radius, 10 + Math.round(c * 18),
          hueFor(ship.classId), { dir: ship.aim, spread: 0.5, speed: 320 + c * 260 });
        api.applyImpulse(ship, -dx * M.recoil * c, -dy * M.recoil * c);
        ship.beamTimer = M.beamVisualSec; ship.beamPower = c; ship.beamWidth = w;   // render: jaws + flash
        ship.fireTimer = M.recycleSec;
        ship.heat = Math.min(R.heat.max, ship.heat + M.heatCost * c);
        if (ship.heat >= R.heat.max && R.heat.ventStateAtMax) ship.ventTimer = R.heat.ventStateSec;
        if (!ship.isBot) api.fx.addShake(Math.min(api.config.fx.screenShakeMax, 5 + c * 9));
        // STARBREAK: a strong-enough blast tears a RIFT along the whole shot line — it simmers,
        // then collapses and detonates the corridor (see tickRifts). A miss becomes area denial.
        const RF = M.rift;
        if (RF && ship.classId === 'starbreak' && c >= RF.minCharge) {
          const rifts = ship.rifts || (ship.rifts = []);
          if (rifts.length >= RF.maxActive) rifts.shift();
          rifts.push({ ox, oy, dx, dy, len: range, t: RF.delaySec, vt: 0 });
        }
      },
      tickRifts(api, ship, dt) {
        if (!ship.rifts || !ship.rifts.length) return;
        const M = api.config.railship.mawRail, RF = M.rift, hue = hueFor(ship.classId);
        for (let i = ship.rifts.length - 1; i >= 0; i--) {
          const rf = ship.rifts[i];
          rf.t -= dt;
          // simmering scar: rapid short-lived beam pulses that brighten toward the collapse
          if ((rf.vt += dt) >= 0.07) {
            rf.vt = 0;
            const near = 1 - Math.max(0, rf.t) / RF.delaySec;
            api.fx.spawnBeam(rf.ox, rf.oy, rf.ox + rf.dx * rf.len, rf.oy + rf.dy * rf.len,
              hue, RF.halfWidth * (0.3 + 0.4 * near), 0.09, 0.15 + 0.35 * near);
          }
          if (rf.t > 0) continue;
          // collapse: everything in the corridor takes the detonation (no pierce cap — it's a zone)
          const hits = beamHits(api, ship, rf.ox, rf.oy, rf.dx, rf.dy, rf.len, RF.halfWidth);
          for (const h of hits) {
            const perpSign = ((h.t.x - rf.ox) * -rf.dy + (h.t.y - rf.oy) * rf.dx) >= 0 ? 1 : -1;
            api.damage(h.t, RF.damage, { dx: -rf.dy * perpSign, dy: rf.dx * perpSign, knockback: RF.knockback, source: ship });
          }
          api.fx.spawnBeam(rf.ox, rf.oy, rf.ox + rf.dx * rf.len, rf.oy + rf.dy * rf.len, hue, RF.halfWidth, 0.28, 0.95);
          for (let k = 0; k < 8; k++) {
            const along = (k + 0.5) / 8 * rf.len;
            api.fx.spawnParticles(rf.ox + rf.dx * along, rf.oy + rf.dy * along, 5, hue, { speed: 200, life: 0.4 });
          }
          if (!ship.isBot) api.fx.addShake(6);
          ship.rifts.splice(i, 1);
        }
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
        const rm = ship.rangeMult || 1;   // bigger hull lunges further
        api.applyImpulse(ship, dx * H.lunge.speed * f * rm, dy * H.lunge.speed * f * rm);
        api.fx.spawnParticles(ship.x, ship.y, 8 + Math.round(c * 10), hueFor(ship.classId), { dir: ship.aim, spread: 0.5, speed: 220 + c * 160 });
        if (!ship.isBot) api.fx.addShake(5 + c * 7);
      },
      smash(api, ship, H) {
        const heavy = (ship.classId === 'maulbreaker' || ship.classId === 'worldsplitter');
        const reach = ship.radius * (heavy ? H.maulbreaker.frontHitboxMult : H.lunge.hitboxMult);
        const impact = ship.ramHitBase + Math.hypot(ship.impX, ship.impY) * H.ram.momentumMultiplier;
        const kb = api.config.combat.knockbackBase * (heavy ? H.maulbreaker.knockbackMult : 1);
        for (const t of api.hittables(ship)) {
          const rr = reach + t.radius;
          // Swept circle from the previous to current fixed-tick position. At full speed the ram
          // moves ~25px/tick; checking only the endpoint could skip a visually direct collision.
          const ax = ship.px, ay = ship.py, vx = ship.x - ax, vy = ship.y - ay, len2 = vx * vx + vy * vy;
          const u = len2 > 0 ? Math.max(0, Math.min(1, ((t.x - ax) * vx + (t.y - ay) * vy) / len2)) : 1;
          const cx = ax + vx * u, cy = ay + vy * u;
          if ((cx - t.x) ** 2 + (cy - t.y) ** 2 > rr * rr) continue;
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
        const pullR = G.well.pullRadius * (ship.rangeMult || 1);   // bigger hull => wider gravity field
        if (!ship.captured) ship.captured = [];
        ship.orbSpin = (ship.orbSpin || 0) + G.orbit.speed * dt;
        const drag = (ship.classId === 'singularity' || ship.classId === 'eventHorizon');
        if (drag) {                                   // tidalDrag passive: slow enemies in the well
          const td = G.tidalDrag, rad = pullR * td.radiusMult;
          for (const e of api.enemiesOf(ship)) {
            const d = Math.hypot(e.x - ship.x, e.y - ship.y);
            if (d > rad) continue;
            e.vx += ((ship.x - e.x) / (d || 1)) * td.pull * dt; e.vy += ((ship.y - e.y) / (d || 1)) * td.pull * dt;
            e.slow = Math.max(e.slow || 0, td.slow); e.slowTimer = Math.max(e.slowTimer || 0, 0.12);
          }
        }
        // Orbiting rocks are a melee HAZARD, not a force field. No momentum stall: a rusher
        // who dives the well gets in, but any orbiting rock he touches hits like a thrown one
        // (same damage) and shatters. Per-enemy rehit grace so a dive costs rocks-worth of HP,
        // not the entire ring in one frame.
        const oc = G.orbitContact, orbR = ship.radius + G.orbit.radius;
        if (ship.captured.length > 0) for (const e of api.enemiesOf(ship)) {
          if (e._rockHitCd > 0) { e._rockHitCd -= dt; continue; }
          const d = Math.hypot(e.x - ship.x, e.y - ship.y);
          if (d > orbR + e.radius + 30) continue;
          const n = ship.captured.length;
          for (let i = n - 1; i >= 0; i--) {
            const rock = ship.captured[i], a = ship.orbSpin + i * (Math.PI * 2 / n);   // must match render placement
            const rx = ship.x + Math.cos(a) * orbR, ry = ship.y + Math.sin(a) * orbR;
            const rr = (rock.radius || 18) + e.radius, ddx = e.x - rx, ddy = e.y - ry;
            if (ddx * ddx + ddy * ddy > rr * rr) continue;
            let dmg = G.well.launchDamage;                 // same hit as if this rock were launched
            if (ship.classId === 'meteorist' || ship.classId === 'starfall') dmg *= (1 + G.momentumStrike.medThrowBonus);
            if (rock.pebble) dmg *= G.accretion.pebbleDamageMult;
            const dd = Math.hypot(ddx, ddy) || 1;
            api.damage(e, dmg, { dx: ddx / dd, dy: ddy / dd, knockback: oc.knockback, source: ship });
            ship.captured.splice(i, 1);
            e._rockHitCd = oc.rehitSec;
            api.fx.spawnParticles(rx, ry, 12, '#b06bff', { speed: 230 });
            break;                                          // one rock per enemy per contact
          }
        }
        const cap = (G.launchByClass[ship.classId] || G.launchByClass.gravitor).cap;
        if (ship.captured.length >= cap) { ship.accretionT = 0; return; }
        const need = cap - ship.captured.length, cands = [];
        for (const o of api.state.objects) { if (o.type === 'titan') continue; const d = Math.hypot(o.x - ship.x, o.y - ship.y); if (d < pullR) cands.push({ o, d }); }   // titans are mountains, not ammo
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
        // DUST ACCRETION: nothing capturable in range -> the well condenses a pebble from
        // dust. Weak floor ammo — never disarmed in open space, but real rocks stay better.
        if (cands.length === 0) {
          const A = G.accretion;
          const pebbles = ship.captured.reduce((n, c) => n + (c.pebble ? 1 : 0), 0);
          if (pebbles < A.maxPebbles) {
            ship.accretionT = (ship.accretionT || 0) + dt;
            if (ship.accretionT >= A.intervalSec) {
              ship.accretionT = 0;
              ship.captured.push({ type: 'pebble', radius: A.pebbleRadius, pebble: true });
              api.fx.spawnParticles(ship.x, ship.y, 8, '#9a8fc8', { speed: 90, life: 0.5 });
            }
          }
        } else ship.accretionT = 0;
      },
    },

    // FLAILSHIP line — MOMENTUM MACE(S). At rest each spiked mace TRAILS behind the hull on a
    // slack chain. HOLD fire: radial momentum — the maces swing around the ship, faster and
    // faster (Twinmaul's pair spins in opposite phase). RELEASE (LMB): hammer-throw windup —
    // each head lets go as it crosses the cursor line, so a twin's heads naturally stagger
    // into a rapid one-two volley. ALT-FIRE (RMB): forced synchronized windup — BOTH heads
    // whip onto the line together and fling at once. Blocks enemy shots in every state.
    wreckingOrb: {
      update(api, ship, dt, ctx) {
        const F = api.config.flailship;
        // Binary Star (final): maces are BLADES — swing faster, reach further, hit harder, and a
        // bigger block radius. Derive an orb config with the blade multipliers over F.orb.
        let O = F.orb;
        const b = ship.classId === 'binaryStar' && F.binaryStar && F.binaryStar.blade;
        if (b) O = Object.assign({}, F.orb, {
          spinSpeedMin: F.orb.spinSpeedMin * b.spinMult, spinSpeedMax: F.orb.spinSpeedMax * b.spinMult,
          releaseSweepRadPerSec: F.orb.releaseSweepRadPerSec * b.spinMult,
          spinRadius: F.orb.spinRadius * b.reachMult, maxReach: F.orb.maxReach * b.reachMult,
          spinDamageMin: F.orb.spinDamageMin * b.dmgMult, spinDamageMax: F.orb.spinDamageMax * b.dmgMult,
          flingDamageMin: F.orb.flingDamageMin * b.dmgMult, flingDamageMax: F.orb.flingDamageMax * b.dmgMult,
          trailDamage: F.orb.trailDamage * b.dmgMult, tipRadius: F.orb.tipRadius * b.sizeMult,
        });
        // bigger hull => longer chain: the mace/blade reaches + swings wider as the ship grows
        const rm = ship.rangeMult || 1;
        if (rm !== 1) O = Object.assign({}, O, { maxReach: O.maxReach * rm, spinRadius: O.spinRadius * rm, trailDistance: O.trailDistance * rm });
        const twin = ship.classId === 'twinmaul' || ship.classId === 'binaryStar';
        const nHeads = twin ? 2 : 1;
        const dmgMult = twin ? F.twin.dmgMult : 1;
        if (!ship.maces || ship.maces.length !== nHeads) {
          ship.maces = [];
          for (let i = 0; i < nHeads; i++) ship.maces.push({
            state: 'trail', angle: ship.aim + Math.PI + (i - (nHeads - 1) / 2) * 0.7,
            radius: O.trailDistance, x: ship.x, y: ship.y, selfSpin: i * 1.3,
            flingPower: 0, flingW: 0, flingR0: 1, syncW: 0,
            passHits: new Set(), touch: new Map(),
          });
          ship.spinFrac = 0; ship.orbCd = 0;
        }
        if (ship.orbCd > 0) ship.orbCd -= dt;
        const spinBoost = ship.orbBurstTimer > 0 ? F.swingControl.burstSpeedMult : 1;
        const M = ship.maces;
        const allTrail = M.every(m => m.state === 'trail');
        const anySpin = M.some(m => m.state === 'spin');

        // engage: from full rest, holding fire spins ALL heads up, evenly phased
        if (allTrail && ctx.firing && ship.orbCd <= 0) {
          const base = Math.atan2(M[0].y - ship.y, M[0].x - ship.x);   // pick up where head 0 hangs
          M.forEach((m, i) => { m.state = 'spin'; m.angle = base + i * (Math.PI * 2 / nHeads); });
        }
        if (anySpin) {
          ship.spinFrac = Math.min(1, (ship.spinFrac || 0) + (dt / O.spinUpSec) * spinBoost);
          if (!ctx.firing || ctx.altFire) {
            // release: every spinning head banks the momentum and enters windup.
            // LMB: natural sweep — opposite phases cross the aim line at different times
            //      (the rapid-succession volley falls out of the physics for free).
            // RMB: forced sweep speed so ALL heads reach their release points together.
            const p = ship.spinFrac; ship.spinFrac = 0;
            for (const m of M) if (m.state === 'spin') {
              m.state = 'windup'; m.flingPower = p;
              m.syncW = 0;
              if (ctx.altFire) {
                const w = Math.max(O.spinSpeedMin + (O.spinSpeedMax - O.spinSpeedMin) * p, O.releaseSweepRadPerSec);
                const v = O.flingSpeedMin + (O.flingSpeedMax - O.flingSpeedMin) * p;
                const dPhi = w * m.radius * (O.maxReach - m.radius) / (v * O.maxReach);
                let da = (ship.aim - dPhi - m.angle) % (Math.PI * 2);
                if (da < 0) da += Math.PI * 2;
                m.syncW = Math.max(w, da / Math.max(0.05, F.twin.syncWindupSec));
              }
            }
          }
        }

        ship.orbActive = true; ship.orbBlockRadius = O.tipRadius;   // shield: intercepts enemy shots
        for (const m of M) {
          let dmg = 0, thrown = false;
          if (m.state === 'trail') {
            // slack chain: tuck in behind the hull (behind velocity if moving, else aim);
            // multiple heads hang splayed so they don't overlap
            const sp = Math.hypot(ship.vx || 0, ship.vy || 0);
            const ba = Math.atan2(sp > 40 ? -ship.vy : -Math.sin(ship.aim), sp > 40 ? -ship.vx : -Math.cos(ship.aim))
                     + (M.indexOf(m) - (nHeads - 1) / 2) * 0.55;
            const tx = ship.x + Math.cos(ba) * (ship.radius + O.trailDistance);
            const ty = ship.y + Math.sin(ba) * (ship.radius + O.trailDistance);
            const k = Math.min(1, O.trailFollowPerSec * dt);
            m.x += (tx - m.x) * k; m.y += (ty - m.y) * k;
            m.radius = Math.hypot(m.x - ship.x, m.y - ship.y);
            m.angle = Math.atan2(m.y - ship.y, m.x - ship.x);
            m.selfSpin += 2.5 * dt;
            dmg = O.trailDamage * dmgMult;
          } else if (m.state === 'spin') {
            const w = O.spinSpeedMin + (O.spinSpeedMax - O.spinSpeedMin) * ship.spinFrac;
            m.angle += w * dt;
            m.radius += (O.spinRadius - m.radius) * Math.min(1, 6 * dt);
            m.selfSpin += w * 1.6 * dt;
            dmg = (O.spinDamageMin + (O.spinDamageMax - O.spinDamageMin) * ship.spinFrac) * dmgMult;
          } else if (m.state === 'windup') {
            // hammer-throw release: sweep to dPhi BEFORE the aim line, then let go — the
            // conserved-momentum spiral lands on the cursor at full reach (see 'out').
            const wNat = Math.max(O.spinSpeedMin + (O.spinSpeedMax - O.spinSpeedMin) * m.flingPower, O.releaseSweepRadPerSec);
            const w = Math.max(wNat, m.syncW || 0);
            const v = O.flingSpeedMin + (O.flingSpeedMax - O.flingSpeedMin) * m.flingPower;
            const dPhi = wNat * m.radius * (O.maxReach - m.radius) / (v * O.maxReach);
            let da = (ship.aim - dPhi - m.angle) % (Math.PI * 2);
            if (da < 0) da += Math.PI * 2;
            const step = w * dt;
            if (da <= step) {
              m.angle = ship.aim - dPhi;                  // sub-tick correction: exact release point
              m.state = 'out'; m.passHits.clear();
              m.flingW = wNat; m.flingR0 = m.radius;      // flight keeps the NATURAL momentum
              api.fx.spawnParticles(m.x, m.y, 6 + Math.round(m.flingPower * 10), '#ffd23c',
                { dir: m.angle + Math.PI / 2, spread: 0.5, speed: 260 + 300 * m.flingPower });
            } else m.angle += step;
            m.selfSpin += w * 1.6 * dt;
            dmg = (O.spinDamageMin + (O.spinDamageMax - O.spinDamageMin) * m.flingPower) * dmgMult;
          } else if (m.state === 'out') {
            thrown = true;
            // conserved angular momentum: outward SPIRAL (midpoint-integrated), not a bullet
            const vFling = O.flingSpeedMin + (O.flingSpeedMax - O.flingSpeedMin) * m.flingPower;
            m.angle += m.flingW * (m.flingR0 / (m.radius + vFling * dt / 2)) ** 2 * dt;
            m.radius += vFling * dt;
            if (m.radius >= O.maxReach) { m.radius = O.maxReach; m.state = 'back'; m.passHits.clear(); }
            m.selfSpin += 14 * dt;
            dmg = (O.flingDamageMin + (O.flingDamageMax - O.flingDamageMin) * m.flingPower) * dmgMult;
            api.fx.spawnParticles(m.x, m.y, 1, '#ffd23c',
              { speed: 16, spread: Math.PI, life: 0.28 + 0.3 * m.flingPower, size: O.tipRadius * (0.4 + 0.35 * m.flingPower) });
          } else {                                        // 'back' — the return sweep
            thrown = true;
            m.radius -= O.recallSpeed * dt;
            if (m.radius <= ship.radius + O.trailDistance) {
              m.state = 'trail';
              if (M.every(x => x.state === 'trail' || x === m)) ship.orbCd = O.rethrowDelaySec;
            }
            m.selfSpin += 8 * dt;
            dmg = (O.flingDamageMin + (O.flingDamageMax - O.flingDamageMin) * m.flingPower) * O.recallDamageFrac * dmgMult;
            api.fx.spawnParticles(m.x, m.y, 1, '#ffd23c',
              { speed: 14, spread: Math.PI, life: 0.22 + 0.2 * m.flingPower, size: O.tipRadius * 0.35 });
          }
          if (m.state !== 'trail') {
            m.x = ship.x + Math.cos(m.angle) * m.radius;
            m.y = ship.y + Math.sin(m.angle) * m.radius;
          }
          // per-head hit gates on the ATTACKER (see the shared-gate instakill postmortem)
          for (const t of api.hittables(ship)) {
            const rr = O.tipRadius + t.radius;
            if ((m.x - t.x) ** 2 + (m.y - t.y) ** 2 > rr * rr) continue;
            if (thrown) { if (m.passHits.has(t)) continue; m.passHits.add(t); }
            else {
              if (api.state.time - (m.touch.get(t) || -9) < O.hitCooldownSec) continue;
              m.touch.set(t, api.state.time);
              if (m.touch.size > 48) { const cut = api.state.time - O.hitCooldownSec; for (const [k, v] of m.touch) if (v < cut) m.touch.delete(k); }
            }
            const d = Math.hypot(m.x - t.x, m.y - t.y) || 1;
            api.damage(t, dmg, { dx: (t.x - m.x) / d, dy: (t.y - m.y) / d,
              knockback: 40 + 90 * (m.flingPower || ship.spinFrac || 0), source: ship });
          }
        }
        // BINARY STAR: a live energy tether links the two heads. Anything crossing the line
        // between them takes ticking damage and is DRAGGED onto it; while the heads are in
        // flight (a synced RMB throw especially) both effects amplify — the garrote.
        const BS = F.binaryStar;
        if (BS && ship.classId === 'binaryStar' && nHeads > 1) {
          const T = BS.tether, m0 = M[0], m1 = M[1];
          const sx = m1.x - m0.x, sy = m1.y - m0.y, segLen2 = sx * sx + sy * sy;
          if (segLen2 > 400) {                                  // heads apart — the tether is live
            const anyThrown = M.some(m => m.state === 'out' || m.state === 'back');
            const dmgT = T.damage * (anyThrown ? T.thrownDmgMult : 1) * dmgMult;
            const pull = T.pull * (anyThrown ? T.thrownPullMult : 1);
            const touch = ship.tetherTouch || (ship.tetherTouch = new Map());
            for (const e of api.enemiesOf(ship)) {
              const u = ((e.x - m0.x) * sx + (e.y - m0.y) * sy) / segLen2;
              if (u < 0.08 || u > 0.92) continue;               // head ends belong to the maces themselves
              const px = m0.x + sx * u, py = m0.y + sy * u;
              const d = Math.hypot(e.x - px, e.y - py);
              if (d > T.halfWidth + e.radius) continue;
              e.vx += ((px - e.x) / (d || 1)) * pull * dt;      // garrote drag onto the wire
              e.vy += ((py - e.y) / (d || 1)) * pull * dt;
              if (api.state.time - (touch.get(e) || -9) >= T.rehitSec) {
                touch.set(e, api.state.time);
                api.damage(e, dmgT, { dx: (e.x - px) / (d || 1), dy: (e.y - py) / (d || 1), knockback: 0, source: ship });
                api.fx.spawnParticles(px, py, 6, '#fff3a0', { speed: 160, life: 0.3 });
              }
            }
            if (touch.size > 32) { const cut = api.state.time - T.rehitSec * 3; for (const [k, v] of touch) if (v < cut) touch.delete(k); }
          }
        }
        // ship-level mirrors: head 0 feeds the net snapshot, bots, and single-orb consumers
        ship.orbX = M[0].x; ship.orbY = M[0].y; ship.orbState = M[0].state;
        ship.orbSelfSpin = M[0].selfSpin; ship.orbRadius = M[0].radius; ship.flingPower = M[0].flingPower;
        if (nHeads > 1) { ship.orbX2 = M[1].x; ship.orbY2 = M[1].y; ship.orbSelfSpin2 = M[1].selfSpin; }
      },
    },
  };

  // ---- ABILITIES (Space) ---------------------------------------------------
  function launchRock(api, ship, rock, ang) {
    const G = api.config.gravitor, dx = Math.cos(ang), dy = Math.sin(ang);
    const ox = ship.x + dx * (ship.radius + G.orbit.radius), oy = ship.y + dy * (ship.radius + G.orbit.radius);
    let dmg = G.well.launchDamage;
    if (ship.classId === 'meteorist' || ship.classId === 'starfall') dmg *= (1 + G.momentumStrike.medThrowBonus);
    if (rock.pebble || rock.type === 'pebble') dmg *= G.accretion.pebbleDamageMult;   // dust floor, not a free asteroid
    const hpKey = { asteroid: 'asteroidHP', crystal: 'crystalHP', debris: 'debrisHP', pebble: 'debrisHP' }[rock.type] || 'asteroidHP';
    const hp = (api.config.farming[hpKey] || 12) * G.thrownRockHpMult;   // tankier than a normal rock — shootable but takes a real hit
    api.state.projectiles.push({ x: ox, y: oy, px: ox, py: oy, vx: dx * G.well.launchSpeed, vy: dy * G.well.launchSpeed,
      radius: rock.radius || G.thrownRockRadius, rockType: rock.type, isThrownRock: true, hp, damage: dmg, pierceLeft: 3, life: 2.4, color: '#b06bff', kind: 'rock', harvest: true, team: ship.team, owner: ship,
      spin: Math.random() * Math.PI * 2 });   // visual-only tumble phase (render adds time-based rotation)
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
    // Twinmaul: STATIC LASH — a stun pulse around EACH mace head. Scrambles whatever the
    // victims were winding up (rail charge, ram windup, beam ramp, spin momentum), locks
    // their ability/special for a beat, and hard-stuns briefly. Radius is around the MACES,
    // not the ship — where your heads are IS the ability.
    staticLash: {
      activate(api, ship) {
        const S = api.config.flailship.staticLash;
        const heads = ship.maces || [{ x: ship.orbX != null ? ship.orbX : ship.x, y: ship.orbY != null ? ship.orbY : ship.y }];
        let hit = 0;
        for (const e of api.enemiesOf(ship)) {
          let near = false;
          for (const h of heads) if (Math.hypot(e.x - h.x, e.y - h.y) <= S.radius) { near = true; break; }
          if (!near) continue;
          e.stunTimer = Math.max(e.stunTimer || 0, S.stunSec);
          e.charge = 0; e.charging = false; e.chargeFullTimer = 0;      // rail charge gone
          e.ramWinding = false; e.ramCharge = 0;                        // ram windup gone
          e.beamRamp = 0; e.spinFrac = 0;                               // beam ramp / spin momentum gone
          e.abilityCd = Math.max(e.abilityCd || 0, S.abilityLockSec);   // abilities locked out
          e.specialCd = Math.max(e.specialCd || 0, S.abilityLockSec);
          api.damage(e, S.damage, { dx: 0, dy: 0, source: ship });
          api.fx.spawnParticles(e.x, e.y, 14, '#fff3a0', { speed: 200, life: 0.4 });
          api.fx.spawnText(e.x, e.y - 30, 'SCRAMBLED', '#fff3a0', { size: 12 });
          hit++;
        }
        for (const h of heads) api.fx.spawnParticles(h.x, h.y, 16, '#fff3a0', { speed: 260, life: 0.35 });
        if (!ship.isBot && hit) api.fx.addShake(api.config.fx.screenShakeMax * 0.5);
        return S.cooldownSec;
      },
    },
    // Supernova: FLARE NOVA — dump the ENTIRE heat bar as an expanding blast. Damage scales
    // with heat spent; falls off toward the rim; clears a vent lockout (the fuse becomes the
    // weapon). Spent heat is spent beam uptime — always a trade, and enemies can pressure the
    // bar to force a weak, early nova.
    flareNova: {
      activate(api, ship) {
        const N = api.config.helion.supernova;
        const heat = ship.heat || 0;
        if (heat < N.minHeat) { api.fx.spawnText(ship.x, ship.y - 30, 'NEED HEAT', '#ffb27a', { size: 12 }); return 0.6; }
        const dmg = N.baseDamage + N.damagePerHeat * heat;
        for (const t of api.hittables(ship)) {
          const d = Math.hypot(t.x - ship.x, t.y - ship.y);
          if (d > N.radius) continue;
          const fall = 1 - (d / N.radius) * N.edgeFalloff;
          api.damage(t, dmg * fall, { dx: (t.x - ship.x) / (d || 1), dy: (t.y - ship.y) / (d || 1), knockback: N.knockback, source: ship });
        }
        ship.heat = 0; ship.ventTimer = 0;                     // the nova IS the vent
        api.fx.spawnParticles(ship.x, ship.y, 42, '#ffd27a', { speed: N.radius * 1.8, life: 0.55 });
        api.fx.spawnParticles(ship.x, ship.y, 22, '#ffffff', { speed: N.radius * 1.2, life: 0.4 });
        api.fx.spawnText(ship.x, ship.y - 40, 'FLARE NOVA', '#ffd27a', { size: 15 });
        if (!ship.isBot) api.fx.addShake(api.config.fx.screenShakeMax);
        return N.cooldownSec;
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
