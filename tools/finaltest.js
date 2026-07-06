// Headless test for the three tier-3 finals: Supernova (Flare Nova), Starbreak (rift),
// Binary Star (tether). Also proves the evolution tree now reaches all three at lvl 15.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const P = global.PULSAR, cfg = P.config, DT = 1 / 60;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };
const world = P.createWorld({});
const clearNear = (x, y, r) => { const o = world.state.objects; for (let i = o.length - 1; i >= 0; i--) if (Math.hypot(o[i].x - x, o[i].y - y) < r) o.splice(i, 1); };
const idle = { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false, afterburner: false, altFire: false };

// ---- evolution tree reaches all three finals --------------------------------
for (const [parent, child] of [['helion', 'supernova'], ['starPiercer', 'starbreak'], ['twinmaul', 'binaryStar']]) {
  const s = world.addShip({ classId: parent });
  world.earn(s, 2000);                                     // level 15+, plenty of scrap
  const e = world.evolveOptions(s);
  const ok = e && e.levelOk && e.options.length === 1 && e.options[0].id === child;
  world.chooseEvolution(s, 0);
  check(`${parent} → ${child} at lvl 15`, ok && s.classId === child, `got ${s.classId}`);
  world.removeShip(s.id);
}

// ---- Supernova: Flare Nova scales with heat, clears it + the vent ----------
const nova = world.addShip({ classId: 'supernova', x: 3000, y: 3000 });
const dummy = world.addShip({ classId: 'railship', x: 3100, y: 3000 });
dummy.spawnProtect = 0; clearNear(3000, 3000, 500);
nova.heat = 80; nova.ventTimer = 1.0;
const hp0 = dummy.hp;
P.resolveSpecial('flareNova').activate(world.api, nova);
const N = cfg.helion.supernova;
const expect = (N.baseDamage + N.damagePerHeat * 80) * (1 - (100 / N.radius) * N.edgeFalloff);
check('nova damage scales with heat', Math.abs((hp0 - dummy.hp) - expect) < 1.5, `dealt ${(hp0 - dummy.hp).toFixed(1)} vs ${expect.toFixed(1)}`);
check('nova consumed heat + cleared vent', nova.heat === 0 && nova.ventTimer === 0);
nova.heat = 10;
const cdWeak = P.resolveSpecial('flareNova').activate(world.api, nova);
check('below minHeat: refused (short retry cd)', cdWeak < 1 && dummy.hp > 0);

// ---- Starbreak: blast leaves a rift that detonates the line after the delay -
const sb = world.addShip({ classId: 'starbreak', x: 1500, y: 1500, aim: 0 });
const tgt = world.addShip({ classId: 'hammerhead', x: 1900, y: 1500 });
tgt.spawnProtect = 0; tgt.combatTimer = 99;               // hold regen off for clean deltas
clearNear(1500, 1500, 1200);
const hpA = tgt.hp;
P.resolveWeapon('mawRail').fire(world.api, sb, 1.0);       // full-charge blast
const hpB = tgt.hp;
check('starbreak blast landed', hpA - hpB > 80, `blast dealt ${(hpA - hpB).toFixed(0)}`);
check('rift registered', sb.rifts && sb.rifts.length === 1);
world.setIntent(sb.id, idle);
for (let i = 0; i < Math.ceil(0.75 / DT); i++) world.step(DT);   // past delaySec
const riftDmg = hpB - tgt.hp;
check('rift detonated the corridor', riftDmg >= cfg.railship.mawRail.rift.damage * 0.9 && (!sb.rifts || sb.rifts.length === 0), `rift dealt ${riftDmg.toFixed(0)}`);

// ---- Binary Star: tether burns + drags an enemy crossing the line ----------
const bs = world.addShip({ classId: 'binaryStar', x: 4500, y: 4500, aim: 0 });
const vic = world.addShip({ classId: 'gravitor', x: 4508, y: 4500 });   // near ship center = mid-segment when heads oppose
vic.spawnProtect = 0; vic.combatTimer = 99;
clearNear(4500, 4500, 600);
world.setIntent(bs.id, Object.assign({}, idle, { firing: true, aim: 0 }));
const hpV = vic.hp;
for (let i = 0; i < Math.ceil(1.4 / DT); i++) {            // spin up: heads separate to opposite phase
  world.setIntent(bs.id, Object.assign({}, idle, { firing: true, aim: 0 }));
  world.setIntent(vic.id, idle);                           // victim holds still (tether pull may drag it)
  world.step(DT);
}
check('binaryStar has two heads', bs.maces && bs.maces.length === 2);
check('tether burned the crosser', hpV - vic.hp >= cfg.flailship.binaryStar.tether.damage, `tether dealt ${(hpV - vic.hp).toFixed(1)}`);

// ---- 30 sim-seconds of mixed-final bot lobby: nothing goes non-finite -------
world.state.ships.length = 0;
for (const c of ['supernova', 'starbreak', 'binaryStar', 'worldsplitter', 'starfall', 'eventHorizon'])
  world.addShip({ classId: c, isBot: true });
for (let i = 0; i < 1800; i++) world.step(DT);
let finite = true;
for (const s of world.state.ships) for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'aim', 'heat']) if (!Number.isFinite(s[k] || 0)) finite = false;
for (const pr of world.state.projectiles) if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y)) finite = false;
check('30s all-finals bot lobby: all state finite', finite);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
