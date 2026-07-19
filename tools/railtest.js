// Headless test of RAIL PIERCING across the whole family (chargeRail / helionBeam / mawRail —
// and zenith + prism, which delegate to those).
// The contract (playtest round 2): the line PIERCES rocks and ships alike — nothing hard-blocks —
// but every thing already pierced makes the NEXT SHIP hit much cheaper (pierceFalloff.players,
// now steep: 1.0 / 0.4 / 0.18). Shooting a player through a boulder is a poke, not a snipe.
// Farming (neutral falloff, line breaks) is unaffected.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const cfg = global.PULSAR.config;
const R = cfg.railship, F = cfg.farming;
const DT = 1 / 60;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };

const world = global.PULSAR.createWorld({});
const api = world.api;
const clearAll = () => { world.state.objects.length = 0; };
const put = (type, x, y) => {
  const radius = F[type + 'Radius'], hp = F[type + 'HP'] * 1000;   // tanky: we measure hits, not breaks
  const o = { type, x, y, px: x, py: y, vx: 0, vy: 0, plane: 0, radius, hp, maxHp: hp,
    spin: 0, spinRate: 0, flash: 0, cracked: false, crackTimer: 0 };
  world.state.objects.push(o); return o;
};

// ---- the dials themselves ----
const PF = R.pierceFalloff.players;
check('cover no longer hard-blocks (coverMinRadius is data, not a wall)', typeof R.coverMinRadius === 'number' && R.pierceBlockRadius === undefined);
check('player falloff is STEEP (2nd target <= 45%, 3rd <= 25%)', PF[0] === 1 && PF[1] <= 0.45 && PF[2] <= 0.25, PF.join('/'));
check('farming falloff untouched', R.pierceFalloff.neutral.join('/') === '1/0.9/0.8/0.7');

// ---- shared rig: shooter at x=1000 aiming +X; optional blocker at 1200; victim ship at 1400 ----
function rig(shooterClass, blockerType) {
  clearAll();
  for (const s of [...world.state.ships]) world.removeShip(s.id);
  const shooter = world.addShip({ classId: shooterClass, isBot: false, x: 1000, y: 1000, aim: 0 });
  shooter.spawnProtect = 0; shooter.heat = 0; shooter.ventTimer = 0;
  const victim = world.addShip({ classId: 'railship', isBot: false, x: 1400, y: 1000, aim: Math.PI });
  victim.spawnProtect = 0; victim.maxHp = victim.hp = 100000;
  const rock = blockerType ? put(blockerType, 1200, 1000) : null;
  return { shooter, victim, rock };
}
function shoot(kind, shooterClass, blockerType) {
  const { shooter, victim, rock } = rig(shooterClass, blockerType);
  const hp0 = victim.hp, rockHp0 = rock ? rock.hp : 0;
  if (kind === 'charge') {
    shooter.charge = R.charge.overchargeCap;
    global.PULSAR.resolveWeapon('chargeRail').fire(api, shooter);
  } else if (kind === 'maw') {
    global.PULSAR.resolveWeapon('mawRail').fire(api, shooter, 1);
  } else if (kind === 'helion') {
    shooter.beamRamp = 1;
    world.setIntent(shooter.id, { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: true, ability: false, special: false });
    for (let i = 0; i < 60; i++) world.step(DT);
  }
  return { dmg: hp0 - victim.hp, rockDmg: rock ? rockHp0 - rock.hp : 0 };
}

// ---- every rail weapon PIERCES a boulder, at the steep behind-cover rate ----
for (const [kind, cls, label] of [
  ['charge', 'railship', 'railship (overcharge)'],
  ['maw', 'starPiercer', 'starPiercer maw'],
  ['maw', 'starbreak', 'starbreak maw'],
  ['maw', 'zenith', 'zenith (tier-4 maw)'],
  ['helion', 'helion', 'helion beam'],
  ['helion', 'supernova', 'supernova beam'],
  ['helion', 'prism', 'prism (tier-4 beam + sub-beams)'],
]) {
  const open = shoot(kind, cls, null).dmg;
  const behind = shoot(kind, cls, 'asteroid').dmg;
  const ratio = behind / open;
  check(`${label}: pierces the boulder (hits the ship behind)`, open > 0 && behind > 0, `${open.toFixed(1)} open, ${behind.toFixed(1)} behind`);
  check(`${label}: behind-cover hit pays the steep rate (~x${PF[1]})`, Math.abs(ratio - PF[1]) < 0.06, `ratio ${ratio.toFixed(2)}`);
}

// ---- a titan is pierceable too (it just eats the first slot) ----
const tOpen = shoot('charge', 'railship', null).dmg, tBehind = shoot('charge', 'railship', 'titan').dmg;
check('a titan no longer blocks — pierced at the same steep rate', tBehind > 0 && Math.abs(tBehind / tOpen - PF[1]) < 0.06,
  `${tBehind.toFixed(1)} vs ${tOpen.toFixed(1)} open`);

// ---- the first rock still takes the full hit ----
check('the pierced rock still eats full damage', Math.abs(shoot('charge', 'railship', 'asteroid').rockDmg - R.charge.damage.overcharge) < 0.5,
  `${shoot('charge', 'railship', 'asteroid').rockDmg.toFixed(1)} into the rock`);

// ---- the rail fantasy: a LINE of ships, skewered with sharply decaying damage ----
(() => {
  clearAll();
  for (const s of [...world.state.ships]) world.removeShip(s.id);
  const shooter = world.addShip({ classId: 'railship', isBot: false, x: 1000, y: 1000, aim: 0 });
  shooter.spawnProtect = 0; shooter.heat = 0; shooter.ventTimer = 0;
  const line = [1120, 1240, 1360].map(x => {
    const v = world.addShip({ classId: 'railship', isBot: false, x, y: 1000, aim: Math.PI });
    v.spawnProtect = 0; v.maxHp = v.hp = 100000; return v;
  });
  const hp0 = line.map(v => v.hp);
  shooter.charge = R.charge.overchargeCap;
  global.PULSAR.resolveWeapon('chargeRail').fire(api, shooter);
  const d = line.map((v, i) => hp0[i] - v.hp);
  check('a line of 3 ships is fully skewered', d.every(x => x > 0), d.map(x => x.toFixed(0)).join(' / '));
  check('...with the steep ship-falloff applied in order',
    Math.abs(d[1] / d[0] - PF[1] / PF[0]) < 0.1 && Math.abs(d[2] / d[0] - PF[2] / PF[0]) < 0.1,
    `ratios ${(d[1] / d[0]).toFixed(2)}, ${(d[2] / d[0]).toFixed(2)}`);
})();

// ---- LINE BREAK works through boulders again (the round-1 wall killed it) ----
(() => {
  clearAll();
  for (const s of [...world.state.ships]) world.removeShip(s.id);
  const shooter = world.addShip({ classId: 'railship', isBot: false, x: 1000, y: 1000, aim: 0 });
  shooter.spawnProtect = 0; shooter.heat = 0; shooter.ventTimer = 0;
  put('asteroid', 1150, 1000); put('asteroid', 1250, 1000); put('asteroid', 1350, 1000);
  const scrap0 = shooter.scrap;
  shooter.charge = R.charge.overchargeCap;
  global.PULSAR.resolveWeapon('chargeRail').fire(api, shooter);
  check('LINE BREAK pays through a row of boulders', shooter.scrap - scrap0 >= cfg.economy.lineBreakBonusScrap,
    `+${(shooter.scrap - scrap0).toFixed(0)} scrap`);
})();

// ---- Prism sub-beams: cover attenuates (not blocks, not free) ----
(() => {
  clearAll();
  for (const s of [...world.state.ships]) world.removeShip(s.id);
  const shooter = world.addShip({ classId: 'prism', isBot: false, x: 1000, y: 1000, aim: Math.PI });   // main beam aims AWAY
  shooter.spawnProtect = 0; shooter.heat = 0; shooter.ventTimer = 0; shooter.beamRamp = 1;
  const covered = world.addShip({ classId: 'railship', isBot: false, x: 1400, y: 1000, aim: Math.PI });
  covered.spawnProtect = 0; covered.maxHp = covered.hp = 100000;
  put('asteroid', 1200, 1000);
  world.setIntent(shooter.id, { moveX: 0, moveY: 0, aim: Math.PI, aimDist: 1, firing: true, ability: false, special: false });
  const hp0 = covered.hp;
  for (let i = 0; i < 60; i++) world.step(DT);
  const dCovered = hp0 - covered.hp;
  // same rig, rock removed
  clearAll();
  covered.hp = covered.maxHp;
  const hp1 = covered.hp;
  for (let i = 0; i < 60; i++) world.step(DT);
  const dOpen = hp1 - covered.hp;
  const ratio = dCovered / dOpen;
  check('prism sub-beam tags a covered target (no hard LOS block)', dCovered > 0, `${dCovered.toFixed(1)} dmg`);
  check('...at the attenuated cover rate', Math.abs(ratio - PF[1]) < 0.08, `ratio ${ratio.toFixed(2)} vs ${PF[1]}`);
})();

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
