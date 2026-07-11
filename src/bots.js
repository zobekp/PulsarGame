// PULSAR.io — BOTS (Phase 4 AI). Produces an INTENT each tick — {moveX,moveY,aim,firing,
// ability,special} — that the engine feeds to the SAME data-driven weapons the player uses.
// Free-for-all: every ship is its own team. Heuristic, not optimal — just active and threatening.
window.PULSAR = window.PULSAR || {};

window.PULSAR.Bots = (function () {
  const rnd = Math.random;
  const gauss = (s) => (rnd() + rnd() + rnd() - 1.5) * s;          // ~N(0, s)
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  // how close a family wants to be to its target to start shooting
  const REACH = { rail: 1100, hammer: 320, grav: 440, flail: 180, dart: 900 };
  // per-class overrides where the weapon's real range differs from the family default
  // (helion's beam is short; without this the bot parks out of range and farms NOTHING)
  // (starPiercer could blast from 900 — but broken rocks pay in MOTES, and motes only vacuum
  //  to nearby ships. Farm close enough to collect what you shatter.)
  const REACH_CLASS = { helion: 620, supernova: 620, starPiercer: 520, starbreak: 520 };
  // tier-3 finals play like their tier-2 parents (same weapon) — group them for the checks below
  const SUSTAIN = (id) => id === 'helion' || id === 'supernova';
  const SIEGE = (id) => id === 'starPiercer' || id === 'starbreak';
  const TWIN = (id) => id === 'twinmaul' || id === 'binaryStar';
  const reachOf = (bot, fam) => REACH_CLASS[bot.classId] || REACH[fam];

  // fight-time firing/ability/special decision per family (reads the bot's own weapon state)
  function fightFire(bot, fam, ed, world) {
    const o = { firing: false, ability: false, special: false };
    if (fam === 'rail') {
      if (SUSTAIN(bot.classId))                                    // hold the beam, respect the heat bar + its shorter range
        o.firing = (bot.heat || 0) < 78 && ed < world.config.helion.beam.range * 0.95;
      else if (SIEGE(bot.classId))                                 // charge the maw, release near full; hands off while lit
        o.firing = (bot.beamTimer || 0) <= 0 && (bot.charge || 0) < 0.95;
      else o.firing = (bot.charge || 0) < 0.9;                     // base rail: charge, then release
      o.ability = bot.heat > 70;                                   // vent dash to cool
      o.special = bot.classId === 'supernova' && (bot.heat || 0) > 65 && ed < world.config.helion.supernova.radius * 0.9;   // nova when hot + dived
    } else if (fam === 'hammer') {
      o.firing = ed > 110 && (bot.ramCharge || 0) < 0.98;          // wind while closing; release near
      o.ability = ed < 170 && rnd() < 0.04;                        // brace occasionally
    } else if (fam === 'grav') {
      const launch = world.config.gravitor.launchByClass[bot.classId] || world.config.gravitor.launchByClass.gravitor;
      o.firing = !bot.captured || bot.captured.length < launch.cap; // keep pulling until THIS class's capacity
      o.ability = bot.captured && bot.captured.length > 0;          // hurl held rocks at the enemy
      o.special = (bot.classId === 'eventHorizon') && ed < 380;     // collapse
    } else if (fam === 'flail') {
      // wind the mace while closing; let go (stop firing) to FLING once it's fast + in reach
      const reach = world.config.flailship.orb.maxReach;
      o.firing = bot.orbState === 'spin' ? !((bot.spinFrac || 0) > 0.85 && ed < reach * 0.95)
                                         : ed < 700;
      o.ability = ed < 210 && rnd() < 0.05;
      o.special = TWIN(bot.classId) && ed < 200;                    // static lash when they dive the maces
    } else {
      o.firing = ed < REACH.dart;                                   // starter popgun
    }
    return o;
  }

  function farmFire(bot, fam, rd) {
    const o = { firing: false, ability: false, special: false };
    if (fam === 'rail') {
      if (SUSTAIN(bot.classId)) o.firing = (bot.heat || 0) < 60 && rd < 600;
      else if (SIEGE(bot.classId)) o.firing = (bot.beamTimer || 0) <= 0 && (bot.charge || 0) < 0.6;
      else o.firing = (bot.charge || 0) < 0.7;
    }
    else if (fam === 'hammer') o.firing = rd > 90 && (bot.ramCharge || 0) < 0.9;
    else if (fam === 'grav') {
      const launch = PULSAR.config.gravitor.launchByClass[bot.classId] || PULSAR.config.gravitor.launchByClass.gravitor;
      o.firing = !bot.captured || bot.captured.length < launch.cap; o.ability = bot.captured && bot.captured.length > 0;
    }
    else if (fam === 'flail') {
      // spin to ~half momentum, then fling at the rock cluster
      const reach = bot.orbState === 'spin' ? PULSAR.config.flailship.orb.maxReach : 0;
      o.firing = bot.orbState === 'spin' ? !((bot.spinFrac || 0) > 0.5 && rd < reach * 0.85) : rd < 450;
    }
    else o.firing = rd < REACH.dart;
    return o;
  }

  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Human-ish perception: the bot tracks a periodically-refreshed SNAPSHOT of the enemy,
  // not the live position. Between refreshes it aims at stale data (so strafing works on
  // it like on a person), the error is rolled per-glimpse and grows with range, and a
  // freshly-noticed target gets a hold-fire "acquire" beat before the bot opens up.
  function perceive(bot, ai, enemy, C, dt) {
    ai.react -= dt; ai.acquire -= dt;
    if (ai.target !== enemy) { ai.target = enemy; ai.acquire = C.acquireSec / ai.skill; ai.react = 0; }
    if (ai.react <= 0) {
      ai.react = (C.reactionSec / ai.skill) * (0.7 + 0.6 * rnd());
      const err = (C.aimErrorRad / ai.skill) * (0.5 + dist(bot, enemy) / 700);
      ai.seenA = ang(bot, enemy) + gauss(err);
      ai.seenD = dist(bot, enemy);
    }
  }
  // Mouse, not turret: swivel current aim toward the desired angle at a capped rate.
  function swivel(ai, want, maxRate, dt) {
    const d = wrapA(want - ai.aimCur), m = maxRate * dt;
    ai.aimCur = wrapA(ai.aimCur + (d > m ? m : d < -m ? -m : d));
    return ai.aimCur;
  }

  function intent(bot, world, dt) {
    const C = world.config.bots, fam = world.familyOf(bot.classId);
    // Bots.js OWNS this state shape — init if missing OR stale (a factory-made ai without the
    // perception fields would feed undefined into the math and NaN the whole ship).
    const ai = (bot.ai && bot.ai.skill != null) ? bot.ai : (bot.ai = { state: 'farm', t: 0, dodge: 0, dodgeDir: 1, strafeDir: 1,
      skill: C.skillMin + rnd() * (C.skillMax - C.skillMin),        // rolled once per bot — the lobby gets a spread of "players"
      target: null, react: 0, acquire: 0, seenA: bot.aim || 0, seenD: 600, aimCur: bot.aim || 0 });
    ai.t -= dt;

    let enemy = null, ed = 1e9, rock = null, rd = 1e9;
    for (const s of world.ships) if (s !== bot && s.alive && s.team !== bot.team) { const d = dist(bot, s); if (d < ed) { ed = d; enemy = s; } }
    for (const o of world.objects) { if (o.type === 'titan') continue; const d = dist(bot, o); if (d < rd) { rd = d; rock = o; } }   // bots farm rocks, not mountains

    if (ai.t <= 0) {
      ai.t = C.decisionSec; ai.strafeDir = rnd() < 0.5 ? 1 : -1;
      if (bot.hp < bot.maxHp * C.fleeHpFraction && enemy && ed < C.senseRange) ai.state = 'flee';
      else if (enemy && ed < C.engageRange && rnd() < C.aggression) ai.state = 'fight';
      else ai.state = 'farm';
    }
    if (!enemy && ai.state !== 'farm') { ai.state = 'farm'; ai.target = null; }

    // telegraph dodge: enemy charging/winding roughly down our bearing
    if (enemy && (enemy.charging || enemy.ramWinding) && ed < 720) {
      const ahead = Math.cos(enemy.aim) * (bot.x - enemy.x) + Math.sin(enemy.aim) * (bot.y - enemy.y);
      const off = Math.abs((bot.x - enemy.x) * -Math.sin(enemy.aim) + (bot.y - enemy.y) * Math.cos(enemy.aim));
      if (ahead > 0 && off < 130 && ai.dodge <= 0 && rnd() < C.telegraphDodgeChance) { ai.dodge = 0.5; ai.dodgeDir = rnd() < 0.5 ? 1 : -1; }
    }
    if (ai.dodge > 0) ai.dodge -= dt;

    let mvx = 0, mvy = 0, aimAng = bot.aim, aimDist = 1e9, fire = { firing: false, ability: false, special: false };
    const go = (tx, ty, sign) => { const a = Math.atan2(ty - bot.y, tx - bot.x) + (sign === 'side' ? Math.PI / 2 * ai.strafeDir : 0); const s = sign === 'away' ? -1 : 1; mvx = Math.cos(a) * s; mvy = Math.sin(a) * s; };
    const turnRate = C.aimTurnRadPerSec * (0.75 + 0.5 * ai.skill);
    // hold fire when the target is past honest range or still being acquired
    // (grav keeps passively pulling rocks; flail keeps its spin-up going — neither is a shot)
    const rm = bot.rangeMult || 1;   // bigger hulls reach + engage further (matches weapon range scaling)
    const gate = (f, d) => { if (d > (C.fireRange[fam] || 700) * rm || ai.acquire > 0) { f.firing = (fam === 'grav' || fam === 'flail') && f.firing; f.ability = false; f.special = false; } return f; };

    if (ai.state === 'flee' && enemy) {
      perceive(bot, ai, enemy, C, dt);
      go(enemy.x, enemy.y, 'away'); aimAng = swivel(ai, ai.seenA, turnRate, dt); aimDist = ai.seenD;
      fire = gate(fightFire(bot, fam, ed, world), ed); fire.special = false;
    } else if (ai.state === 'fight' && enemy) {
      perceive(bot, ai, enemy, C, dt);
      aimAng = swivel(ai, ai.seenA, turnRate, dt); aimDist = ai.seenD;
      const pref = (C.preferredRange[fam] || 400) * rm;   // big ships hold their fights at longer range
      if (ai.dodge > 0) go(enemy.x, enemy.y, 'side');
      else if (ed > pref * 1.1) go(enemy.x, enemy.y);
      else if (ed < pref * 0.7) go(enemy.x, enemy.y, 'away');
      else go(enemy.x, enemy.y, 'side');
      fire = gate(fightFire(bot, fam, ed, world), ed);
    } else {
      ai.target = null;
      if (rock) {
        // rocks don't dodge — direct aim (small wobble), but still swivel like a hand on a mouse
        aimAng = swivel(ai, ang(bot, rock) + gauss(C.aimErrorRad * 0.4), turnRate, dt); aimDist = rd;
        if (rd > reachOf(bot, fam) * 0.7) go(rock.x, rock.y);
        fire = farmFire(bot, fam, rd);
      } else {
        // hover near the black hole (where the action + jets are) but OUTSIDE its pull, not into it
        const bcx = world.arena.width / 2, bcy = world.arena.height / 2;
        const ba = Math.atan2(bot.y - bcy, bot.x - bcx);
        const safe = (world.arena.pulsar ? world.arena.pulsar.pullRadius : 900) * 0.85;
        go(bcx + Math.cos(ba) * safe, bcy + Math.sin(ba) * safe);
      }
    }
    // BLACK-HOLE AVOIDANCE: if inside the danger band, blend an outward push into the heading so
    // bots don't get dragged across the lethal horizon (no feeding the hole).
    const BH = world.arena.pulsar;
    if (BH) {
      const bcx = world.arena.width / 2, bcy = world.arena.height / 2;
      const bdx = bot.x - bcx, bdy = bot.y - bcy, bd = Math.hypot(bdx, bdy) || 1;
      if (bd < BH.dangerRadius) {
        const w = 1 - bd / BH.dangerRadius;                 // stronger the closer to the core
        mvx += (bdx / bd) * w * 3.0; mvy += (bdy / bd) * w * 3.0;
        const m = Math.hypot(mvx, mvy); if (m > 1) { mvx /= m; mvy /= m; }
      }
    }
    return { moveX: mvx, moveY: mvy, aim: aimAng, aimDist, firing: fire.firing, ability: fire.ability, special: fire.special,
      afterburner: ai.state === 'flee' && fam === 'rail',     // rail bots burn to disengage, like a player would
      altFire: TWIN(bot.classId) && bot.orbState === 'spin' && (bot.spinFrac || 0) > 0.85 && ai.state === 'fight' && ed < 300 };  // twin bots dump both up close
  }

  return { intent };
})();
