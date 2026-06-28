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

  // fight-time firing/ability/special decision per family (reads the bot's own weapon state)
  function fightFire(bot, fam, ed, world) {
    const o = { firing: false, ability: false, special: false };
    if (fam === 'rail') {
      o.firing = (bot.charge || 0) < 0.9;                          // charge, then release to fire
      o.ability = bot.heat > 70;                                   // vent dash to cool
    } else if (fam === 'hammer') {
      o.firing = ed > 110 && (bot.ramCharge || 0) < 0.98;          // wind while closing; release near
      o.ability = ed < 170 && rnd() < 0.04;                        // brace occasionally
    } else if (fam === 'grav') {
      o.firing = !bot.captured || bot.captured.length < 9;          // keep pulling
      o.ability = bot.captured && bot.captured.length > 0;          // hurl held rocks at the enemy
      o.special = (bot.classId === 'eventHorizon') && ed < 380;     // collapse
    } else if (fam === 'flail') {
      o.firing = ed < 330;                                          // hold = throw orb out at them (within chain reach)
      o.ability = ed < 210 && rnd() < 0.05;
      o.special = (bot.classId === 'orbitCrusher') && ed < 190;     // gravity crush
    } else {
      o.firing = ed < REACH.dart;                                   // starter popgun
    }
    return o;
  }

  function farmFire(bot, fam, rd) {
    const o = { firing: false, ability: false, special: false };
    if (fam === 'rail') o.firing = (bot.charge || 0) < 0.7;
    else if (fam === 'hammer') o.firing = rd > 90 && (bot.ramCharge || 0) < 0.9;
    else if (fam === 'grav') { o.firing = !bot.captured || bot.captured.length < 9; o.ability = bot.captured && bot.captured.length > 0; }
    else if (fam === 'flail') o.firing = rd < 300;                  // throw the orb at rocks in chain reach
    else o.firing = rd < REACH.dart;
    return o;
  }

  function intent(bot, world, dt) {
    const C = world.config.bots, fam = world.familyOf(bot.classId);
    const ai = bot.ai || (bot.ai = { state: 'farm', t: 0, dodge: 0, dodgeDir: 1, strafeDir: 1 });
    ai.t -= dt;

    let enemy = null, ed = 1e9, rock = null, rd = 1e9;
    for (const s of world.ships) if (s !== bot && s.alive && s.team !== bot.team) { const d = dist(bot, s); if (d < ed) { ed = d; enemy = s; } }
    for (const o of world.objects) { const d = dist(bot, o); if (d < rd) { rd = d; rock = o; } }

    if (ai.t <= 0) {
      ai.t = C.decisionSec; ai.strafeDir = rnd() < 0.5 ? 1 : -1;
      if (bot.hp < bot.maxHp * C.fleeHpFraction && enemy && ed < C.senseRange) ai.state = 'flee';
      else if (enemy && ed < C.engageRange && rnd() < C.aggression) ai.state = 'fight';
      else ai.state = 'farm';
    }
    if (!enemy && ai.state !== 'farm') ai.state = 'farm';

    // telegraph dodge: enemy charging/winding roughly down our bearing
    if (enemy && (enemy.charging || enemy.ramWinding) && ed < 720) {
      const ahead = Math.cos(enemy.aim) * (bot.x - enemy.x) + Math.sin(enemy.aim) * (bot.y - enemy.y);
      const off = Math.abs((bot.x - enemy.x) * -Math.sin(enemy.aim) + (bot.y - enemy.y) * Math.cos(enemy.aim));
      if (ahead > 0 && off < 130 && ai.dodge <= 0 && rnd() < C.telegraphDodgeChance) { ai.dodge = 0.5; ai.dodgeDir = rnd() < 0.5 ? 1 : -1; }
    }
    if (ai.dodge > 0) ai.dodge -= dt;

    let mvx = 0, mvy = 0, aimAng = bot.aim, aimDist = 1e9, fire = { firing: false, ability: false, special: false };
    const go = (tx, ty, sign) => { const a = Math.atan2(ty - bot.y, tx - bot.x) + (sign === 'side' ? Math.PI / 2 * ai.strafeDir : 0); const s = sign === 'away' ? -1 : 1; mvx = Math.cos(a) * s; mvy = Math.sin(a) * s; };

    if (ai.state === 'flee' && enemy) {
      go(enemy.x, enemy.y, 'away'); aimAng = ang(bot, enemy) + gauss(C.aimErrorRad); aimDist = ed;
      fire = fightFire(bot, fam, ed, world); fire.special = false;
    } else if (ai.state === 'fight' && enemy) {
      aimAng = ang(bot, enemy) + gauss(C.aimErrorRad); aimDist = ed;
      const pref = C.preferredRange[fam] || 400;
      if (ai.dodge > 0) go(enemy.x, enemy.y, 'side');
      else if (ed > pref * 1.1) go(enemy.x, enemy.y);
      else if (ed < pref * 0.7) go(enemy.x, enemy.y, 'away');
      else go(enemy.x, enemy.y, 'side');
      fire = fightFire(bot, fam, ed, world);
    } else {
      if (rock) {
        aimAng = ang(bot, rock) + gauss(C.aimErrorRad * 0.5); aimDist = rd;
        if (rd > REACH[fam] * 0.7) go(rock.x, rock.y);
        fire = farmFire(bot, fam, rd);
      } else { go(world.arena.width / 2, world.arena.height / 2); }   // drift to the pulsar
    }
    return { moveX: mvx, moveY: mvy, aim: aimAng, aimDist, firing: fire.firing, ability: fire.ability, special: fire.special };
  }

  return { intent };
})();
