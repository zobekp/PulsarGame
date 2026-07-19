// Headless test of the GRAVITOR lineage's ammo economy + the Titan-plane debris field:
//   1. every grav class resolves a REAL launch profile (a missing launchByClass row silently
//      drops an apex to the tier-1 base profile — ascending must never be a downgrade)
//   2. the Titan plane carries debris, so grav has ammo/armour up there instead of being a victim
//   3. that debris is AMMO, NOT TERRAIN: Titan-class hulls plow through it (no contact damage,
//      so it can't chip them or stall regen), while smaller hulls still collide with rocks
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const cfg = global.PULSAR.config;
const G = cfg.gravitor, TP = cfg.titanPlane;
const OFF = TP.offsetX, W = cfg.arena.width, H = cfg.arena.height;
const DT = 1 / 60;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };

const world = global.PULSAR.createWorld({});

// ---- 1. no grav class silently falls back to the base profile ----
const GRAV_LINE = ['gravitor', 'meteorist', 'starfall', 'singularity', 'eventHorizon', 'cataclysm', 'devourer'];
for (const id of GRAV_LINE) check(`${id} has its own launch profile`, !!G.launchByClass[id], JSON.stringify(G.launchByClass[id] || null));

// ascending must be an UPGRADE on every axis (this is the bug that made apexes victims)
for (const [parent, apex] of [['starfall', 'cataclysm'], ['eventHorizon', 'devourer']]) {
  const p = G.launchByClass[parent], a = G.launchByClass[apex];
  check(`${parent} -> ${apex} is an upgrade, not a downgrade`, a.cap >= p.cap && a.per >= p.per && a.cd <= p.cd,
    `cap ${p.cap}->${a.cap}, per ${p.per}->${a.per}, cd ${p.cd}->${a.cd}`);
  check(`${apex} beats the base gravitor row it used to fall back to`,
    a.cap > G.launchByClass.gravitor.cap && a.cd < G.launchByClass.gravitor.cd);
}

// ---- 2. the Titan plane has a debris field ----
const titanRocks = world.state.objects.filter(o => (o.plane | 0) === 1);
const arenaRocks = world.state.objects.filter(o => (o.plane | 0) === 0);
check('Titan plane is seeded with debris', titanRocks.length >= TP.debris.count * 0.9, `${titanRocks.length} rocks`);
check('Titan debris sits inside the Titan rect', titanRocks.every(o => o.x >= OFF && o.x <= OFF + W && o.y >= 0 && o.y <= H));
check('the main farm field is untouched', arenaRocks.length >= cfg.farming.field.count * 0.9, `${arenaRocks.length} rocks`);

// ---- 3. a grav apex on the Titan plane actually ARMS ITSELF from the debris ----
// Plane 0's centre is the BLACK HOLE (lethal core + rocks cleared around it), so main-arena
// probes sit out in the calm farm band; the Titan rect has no hole, so centre is fine there.
const spot = (plane) => plane === 1 ? { x: OFF + W / 2, y: H / 2 } : { x: 1200, y: 1200 };

// Seed a deterministic ring of real rocks in reach. Ambient density is a dice roll (a cataclysm's
// 880px pull radius averages ~7 of the 110 seeded rocks — right at its cap), and THIS test asks
// "can grav arm itself from debris on this plane", not "did the field roll well". Field density
// itself is asserted separately above.
function armUp(classId, plane, seed) {
  const { x, y } = spot(plane);
  const s = world.addShip({ classId, isBot: false, plane, x, y });
  s.spawnProtect = 0;
  const added = [];
  for (let i = 0; i < seed; i++) {
    const a = (i / seed) * Math.PI * 2, rx = x + Math.cos(a) * 200, ry = y + Math.sin(a) * 200;
    const o = { type: 'asteroid', x: rx, y: ry, px: rx, py: ry, vx: 0, vy: 0, plane, radius: 22,
      hp: 40, maxHp: 40, spin: 0, spinRate: 0, flash: 0, cracked: false, crackTimer: 0 };
    world.state.objects.push(o); added.push(o);
  }
  world.setIntent(s.id, { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: true, ability: false, special: false });
  for (let i = 0; i < 360; i++) world.step(DT);   // 6s of holding the well open
  const held = s.captured.length, real = s.captured.filter(c => !c.pebble).length;
  world.removeShip(s.id);
  for (const o of added) { const i = world.state.objects.indexOf(o); if (i >= 0) world.state.objects.splice(i, 1); }
  return { held, real };
}
const capApex = G.launchByClass.cataclysm.cap;
const upThere = armUp('cataclysm', 1, capApex + 3);
check('cataclysm fills its rack from Titan-plane debris', upThere.held >= capApex, `${upThere.held}/${capApex} held`);
check('...with REAL rocks, not just dust pebbles', upThere.real >= capApex, `${upThere.real} real rocks`);
check('...beating the old rockless floor (accretion maxPebbles)', upThere.held > G.accretion.maxPebbles,
  `${upThere.held} vs ${G.accretion.maxPebbles} pebbles`);
const downThere = armUp('starfall', 0, G.launchByClass.starfall.cap + 3);
check('grav still arms itself in the main arena (unchanged)', downThere.held >= G.launchByClass.starfall.cap, `${downThere.held} held`);
// the AMBIENT Titan field (no seeding) must also be able to feed an apex — density sanity
const ambient = (() => {
  const pullR = G.well.pullRadius * cfg.scaling.rangeByRank[4], cx = OFF + W / 2, cy = H / 2;
  return world.state.objects.filter(o => (o.plane | 0) === 1 && Math.hypot(o.x - cx, o.y - cy) <= pullR).length;
})();
check('ambient Titan debris is dense enough to feed an apex well', ambient >= 2, `${ambient} rocks in an 880px pull radius`);

// ---- 4. debris is AMMO, not TERRAIN: Titan hulls plow, smaller hulls don't ----
function contactDamageOver(classId, plane, secs) {
  const { x, y } = spot(plane);
  const s = world.addShip({ classId, isBot: false, plane, x, y });
  s.spawnProtect = 0; s.hp = s.maxHp;
  // park a rock exactly on the hull every tick so contact is guaranteed if it can happen at all
  const rock = { type: 'asteroid', x: s.x, y: s.y, px: s.x, py: s.y, vx: 0, vy: 0, plane, radius: 26,
    hp: 999, maxHp: 999, spin: 0, spinRate: 0, flash: 0, cracked: false, crackTimer: 0 };
  world.state.objects.push(rock);
  world.setIntent(s.id, { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false });
  for (let i = 0; i < secs * 60; i++) { rock.x = s.x; rock.y = s.y; world.step(DT); }
  const lost = s.maxHp - s.hp;
  const idx = world.state.objects.indexOf(rock); if (idx >= 0) world.state.objects.splice(idx, 1);
  world.removeShip(s.id);
  return lost;
}
const plowApex = contactDamageOver('cataclysm', 1, 3), plowBoss = contactDamageOver('dreadnought', 1, 3);
// NB: the tier-3 probe must NOT be a gravitor — a grav well passively CAPTURES a touching rock
// (config: "auto-pulls rocks") before it can ever deal contact damage. Use the hammer final.
const hitFighter = contactDamageOver('railship', 0, 3), hitFinal = contactDamageOver('worldsplitter', 0, 3);
check('Titan-class (cataclysm) PLOWS through rocks — zero contact damage', plowApex === 0, `${plowApex} dmg`);
check('Dreadnought still plows (same rule, no special case)', plowBoss === 0, `${plowBoss} dmg`);
check('a fighter (railship) still collides with rocks', hitFighter > 0, `${hitFighter.toFixed(0)} dmg`);
check('a tier-3 final (worldsplitter) still collides — plow is Titan-only', hitFinal > 0, `${hitFinal.toFixed(0)} dmg`);

// ---- 5. plowing means a Titan's regen is never stalled by rubble ----
const t = world.addShip({ classId: 'devourer', isBot: false, plane: 1, x: OFF + W / 2, y: H / 2 });
t.spawnProtect = 0; t.hp = t.maxHp * 0.5; t.combatTimer = 0;
const rock2 = { type: 'asteroid', x: t.x, y: t.y, px: t.x, py: t.y, vx: 0, vy: 0, plane: 1, radius: 26,
  hp: 999, maxHp: 999, spin: 0, spinRate: 0, flash: 0, cracked: false, crackTimer: 0 };
world.state.objects.push(rock2);
world.setIntent(t.id, { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false });
const hp0 = t.hp;
for (let i = 0; i < 180; i++) { rock2.x = t.x; rock2.y = t.y; world.step(DT); }
check('a Titan sitting IN rubble still regens (rocks never stall it)', t.hp > hp0, `${hp0.toFixed(0)} -> ${t.hp.toFixed(0)} hp`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
