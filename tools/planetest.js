// Headless test of the PHYSICALLY SEPARATE Titan plane: plane 1 is its own rect at
// config.titanPlane.offsetX, so Titans can never touch (or invisibly destroy) the normal
// arena's farm rocks. Covers: ascension teleport, per-plane spawns/clamps/projectile
// bounds, no pulsar pull up there, Titan bots ignoring rocks, and fallen-Titan respawn.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../data/cosmetics.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const cfg = global.PULSAR.config;
const DT = 1 / 60;
const OFF = cfg.titanPlane.offsetX, W = cfg.arena.width, H = cfg.arena.height;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };
const inTitanRect = (s) => s.x >= OFF && s.x <= OFF + W && s.y >= 0 && s.y <= H;

const world = global.PULSAR.createWorld({});
const idle = { moveX: 0, moveY: 0, aim: 0, firing: false, ability: false, special: false };

// ---- config sanity: the void between the rects must be uncrossable by anything ----
check('titan rect far from the arena', OFF >= W + 2000, `gap=${OFF - W}`);

// ---- titans + dreadnought all seed inside the Titan rect ----
world.spawnTitans(4);
const upThere = world.state.ships.filter(s => (s.plane | 0) === 1);
check('titan-plane seeds spawn in the titan rect', upThere.length >= 4 && upThere.every(inTitanRect),
  `n=${upThere.length}`);

// ---- ascension: apex evolution teleports the hull into the titan rect ----
const p = world.addShip({ isBot: false, classId: 'railship' });
world.setIntent(p.id, idle);
let hops = 0;
while (world.classNode(p.classId).tier < 4 && hops++ < 6) { world.earn(p, 60000); world.chooseEvolution(p, 0); }
check('player reached an apex', world.classNode(p.classId).tier >= 4, p.classId);
check('ascension teleported into the titan rect', (p.plane | 0) === 1 && inTitanRect(p),
  `x=${Math.round(p.x)} plane=${p.plane}`);
check('arrival at a dead stop, px/py synced', p.vx === 0 && p.vy === 0 && p.px === p.x && p.py === p.y);

// ---- no pulsar pull / lethal horizon on the titan plane ----
p.x = p.px = OFF + W / 2; p.y = p.py = H / 2;   // dead center of the titan rect
for (let i = 0; i < 300; i++) world.step(DT);
check('no pull at titan-rect center (5s stationary)', p.alive && Math.abs(p.x - (OFF + W / 2)) < 1 && Math.abs(p.y - H / 2) < 1,
  `drift=${Math.round(Math.hypot(p.x - (OFF + W / 2), p.y - H / 2))}`);

// ---- plane-1 projectiles live inside the titan rect (old bounds would kill them instantly) ----
for (let i = 0; i < 240 && !world.state.projectiles.some(pr => (pr.plane | 0) === 1); i++) world.step(DT);
const tBolts = world.state.projectiles.filter(pr => (pr.plane | 0) === 1);
check('titan-plane projectiles exist + fly within the rect', tBolts.length > 0 && tBolts.every(pr => pr.x >= OFF - 1 && pr.x <= OFF + W + 1),
  `bolts=${tBolts.length}`);

// ---- objects (farm rocks) all live in the normal arena rect ----
for (let i = 0; i < 300; i++) world.step(DT);
check('every object stays in the normal arena', world.state.objects.every(o => o.x >= 0 && o.x <= W),
  `objects=${world.state.objects.length}`);

// ---- titan bots ignore rocks: lone titan idles toward its own rect's center ----
world.clearBots();
const lone = world.state.ships.find(s => (s.plane | 0) === 1 && s.isBot);
check('clearBots left no titan bots', !lone);
world.spawnTitans(1);
// isolate ONE apex bot: spawnTitans also seeds dreadnoughts, and a nearby foe would make
// the bot fight instead of idling — remove everything else on the plane for determinism
const tb = world.state.ships.find(s => s.isBot && (s.plane | 0) === 1 && s.classId !== 'dreadnought');
for (const s of [...world.state.ships]) if (s.isBot && (s.plane | 0) === 1 && s !== tb) world.removeShip(s.id);
if (tb) {
  const d0 = Math.hypot(tb.x - (OFF + W / 2), tb.y - H / 2);
  for (let i = 0; i < 360; i++) world.step(DT);
  const d1 = Math.hypot(tb.x - (OFF + W / 2), tb.y - H / 2);
  check('titan bot hunts its own rect (not arena rocks)', inTitanRect(tb) && d1 < d0 - 200,
    `center-dist ${Math.round(d0)} -> ${Math.round(d1)}`);
} else check('titan bot spawned for idle test', false);

// ---- a fallen Titan respawns as a Scout back in the NORMAL arena ----
world.api.damage(p, 999999, { source: tb || null });
check('titan player died', !p.alive);
for (let i = 0; i < 1200 && !p.alive; i++) world.step(DT);
check('fallen titan respawns in the normal arena', p.alive && (p.plane | 0) === 0 && p.classId === 'starter'
  && p.x >= 0 && p.x <= W, `x=${Math.round(p.x)} plane=${p.plane} cls=${p.classId}`);

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
