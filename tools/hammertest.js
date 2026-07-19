// Headless test of the HAMMERHEAD lineage's ram damage: it must be SET damage (a knowable
// number, never a share of the target's max HP) that scales LINEARLY with charge time —
// across hammerhead -> maulbreaker -> worldsplitter.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const cfg = global.PULSAR.config;
const H = cfg.hammerhead, R = H.ram;
const HAM = global.PULSAR.resolveWeapon('hammerRam');
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };
const near = (a, b) => Math.abs(a - b) < 0.01;

const world = global.PULSAR.createWorld({});

// ---- no percentage-damage machinery survives anywhere ----
check('config has set damage fields (no % cap / momentum term)',
  R.damageMin != null && R.damageMax != null && R.maxHpCapFrac === undefined && R.momentumMultiplier === undefined);
check('no capFrac left in the codebase', !/capFrac/.test(
  require('fs').readFileSync(require('path').join(__dirname, '../src/sim.js'), 'utf8') +
  require('fs').readFileSync(require('path').join(__dirname, '../src/weapons.js'), 'utf8')));

// ---- damage scales LINEARLY with charge time ----
function baseAtCharge(c, cls) {
  const s = world.addShip({ classId: cls || 'hammerhead', x: 2000, y: 2000, aim: 0 });
  s.ramCd = 0; s.ramCharge = c;
  HAM.lunge(world.api, s, H);
  const b = s.ramHitBase;
  world.removeShip(s.id);
  return b;
}
const d0 = baseAtCharge(0), dq = baseAtCharge(0.25), dh = baseAtCharge(0.5), d1 = baseAtCharge(1);
check('tap (charge 0) == damageMin', near(d0, R.damageMin), `${d0}`);
check('full wind-up (charge 1) == damageMax', near(d1, R.damageMax), `${d1}`);
check('half charge == exact midpoint (linear)', near(dh, (R.damageMin + R.damageMax) / 2), `${dh.toFixed(1)}`);
check('quarter charge == exact quarter-point (linear)', near(dq, R.damageMin + (R.damageMax - R.damageMin) * 0.25), `${dq.toFixed(1)}`);
check('damage strictly increases with charge time', d0 < dq && dq < dh && dh < d1, `${d0} < ${dq.toFixed(1)} < ${dh.toFixed(1)} < ${d1}`);

// ---- the whole lineage rams by the same set, charge-scaled rule ----
for (const cls of ['hammerhead', 'maulbreaker', 'worldsplitter']) {
  const lo = baseAtCharge(0, cls), hi = baseAtCharge(1, cls);
  check(`${cls}: set damage, scales with charge`, near(lo, R.damageMin) && near(hi, R.damageMax), `${lo} -> ${hi}`);
}

// ---- damage is SET: identical regardless of the victim's max HP (the old cap made it a %) ----
function ramDamageVsMaxHp(maxHp, charge) {
  const hammer = world.addShip({ classId: 'hammerhead', x: 1050, y: 1000, aim: 0 });
  const target = world.addShip({ classId: 'railship', x: 1015, y: 1000, aim: Math.PI });
  target.spawnProtect = 0; target.maxHp = maxHp; target.hp = maxHp;
  hammer.ramCd = 0; hammer.ramCharge = charge;
  HAM.lunge(world.api, hammer, H);
  hammer.x = 1050; hammer.y = 1000; hammer.px = 980; hammer.py = 1000;   // sweep across the target
  hammer.ramActive = 0.1; hammer.ramHitList = [];
  HAM.smash(world.api, hammer, H);
  const dealt = maxHp - target.hp, mult = hammer.dmgMult;
  world.removeShip(hammer.id); world.removeShip(target.id);
  return { dealt, mult };
}
const small = ramDamageVsMaxHp(300, 1), big = ramDamageVsMaxHp(8000, 1);
check('SET damage: identical vs a 300hp and an 8000hp target', near(small.dealt, big.dealt),
  `${small.dealt.toFixed(1)} vs ${big.dealt.toFixed(1)}`);
check('lands damageMax x rank mult exactly (no % of maxHP)', near(small.dealt, R.damageMax * small.mult),
  `${small.dealt.toFixed(1)} == ${R.damageMax} x ${small.mult}`);
const tapHit = ramDamageVsMaxHp(300, 0);
check('tap ram lands damageMin x rank mult', near(tapHit.dealt, R.damageMin * tapHit.mult), `${tapHit.dealt.toFixed(1)}`);
check('full ram hits much harder than a tap', small.dealt > tapHit.dealt * 3, `${tapHit.dealt.toFixed(1)} -> ${small.dealt.toFixed(1)}`);

// ---- tuning intent: a full ram can't execute a SAME-RANK peer from full HP ----
for (const cls of ['hammerhead', 'maulbreaker', 'worldsplitter']) {
  const atk = world.addShip({ classId: cls, x: 1050, y: 1000, aim: 0 });
  const vic = world.addShip({ classId: cls, x: 1015, y: 1000, aim: Math.PI });
  vic.spawnProtect = 0;
  const full = vic.maxHp;
  atk.ramCd = 0; atk.ramCharge = 1; HAM.lunge(world.api, atk, H);
  atk.x = 1050; atk.y = 1000; atk.px = 980; atk.py = 1000; atk.ramActive = 0.1; atk.ramHitList = [];
  HAM.smash(world.api, atk, H);
  const frac = (full - vic.hp) / full;
  check(`${cls}: full ram is CC not an execute vs an equal`, vic.alive && frac > 0.2 && frac < 0.6,
    `${Math.round(frac * 100)}% of a peer's HP`);
  world.removeShip(atk.id); world.removeShip(vic.id);
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
