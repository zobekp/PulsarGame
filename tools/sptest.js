// Headless test of the UNIFIED single-player path: game.js now drives the same
// PULSAR.createWorld the server runs. This exercises that world exactly as SP uses it —
// local player ship + bots, intent-driven, onKill hook, edge-band spawns, respawn reset.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const cfg = global.PULSAR.config;
const DT = 1 / 60;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };

const kills = [];
const world = global.PULSAR.createWorld({ onKill: (v, killer) => kills.push({ victim: v.classId, killer: killer ? killer.classId : null, leader: v.isLeader }) });
const p = world.addShip({ isBot: false, classId: 'starter' });
world.spawnBots(cfg.bots.count);

// edge-band spawns: every ship's distance to the nearest wall ∈ [spawnEdgeInset, edgeSafeMargin]
const A = cfg.arena;
const wallDist = (s) => Math.min(s.x, s.y, A.width - s.x, A.height - s.y);
let spawnsOk = true;
for (const s of world.state.ships) { const d = wallDist(s); if (d < A.spawnEdgeInset - 1 || d > A.edgeSafeMargin + 1) spawnsOk = false; }
check('all spawns in the edge band', spawnsOk, `player wallDist=${wallDist(p).toFixed(0)}`);

// drive the player like game.js does: thrust right + fire, 10 sim-seconds with bots alive
const sx = p.x;
for (let i = 0; i < 600; i++) {
  world.setIntent(p.id, { moveX: 1, moveY: 0, aim: 0, aimDist: 400, firing: true, ability: false, special: false, afterburner: false, altFire: false });
  world.step(DT);
}
check('player moved under intent', p.x - sx > 500 || p.x >= A.width - p.radius - 1, `dx=${(p.x - sx).toFixed(0)}`);

// no non-finite state anywhere after 10s of mixed sim
let finite = true;
for (const s of world.state.ships) for (const k of ['x', 'y', 'vx', 'vy', 'hp', 'aim']) if (!Number.isFinite(s[k])) finite = false;
check('all ship fields finite after 10s', finite);

// force-kill a bot with the player as source → onKill hook fires with attribution
const bot = world.state.ships.find(s => s.isBot && s.alive);
const nKills = kills.length;
world.api.damage(bot, 99999, { source: p });
check('onKill hook fired with killer attribution', kills.length === nKills + 1 && kills[kills.length - 1].killer === p.classId,
  JSON.stringify(kills[kills.length - 1] || null));

// player death → respawn resets to a fresh level-1 Scout in the edge band.
// (Idle the intent first — the drive phase's thrust would otherwise carry the respawned ship
// out of the band before we measure. And if bots killed us mid-drive, wait out that respawn
// and clear spawn protection so the force-kill actually lands.)
world.setIntent(p.id, { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false });
for (let i = 0; i < 1200 && !p.alive; i++) world.step(DT);
p.spawnProtect = 0;
world.earn(p, 500);   // give a level so the reset is observable
const lvlBefore = p.level;
world.api.damage(p, 99999, { source: bot });
check('player died', !p.alive && lvlBefore > 1, `lvl was ${lvlBefore}`);
for (let i = 0; i < 1200 && !p.alive; i++) world.step(DT);   // assert the instant it respawns
check('player respawned as fresh Scout in edge band', p.alive && p.level === 1 && p.classId === 'starter'
  && wallDist(p) >= A.spawnEdgeInset - 1 && wallDist(p) <= A.edgeSafeMargin + 1, `wallDist=${wallDist(p).toFixed(0)}`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
