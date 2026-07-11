// Repeatable-ish bot duel sampler for balance conversations. It is not a replacement for human
// playtests: it compares the current bot piloting of each final form under identical conditions.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const P = global.PULSAR, cfg = P.config, DT = 1 / 60;
const CLASSES = process.argv.slice(2).length ? process.argv.slice(2) : ['supernova', 'starbreak', 'worldsplitter', 'starfall', 'eventHorizon', 'binaryStar'];
const ROUNDS = 12, MAX_TICKS = 60 * 35;
const oldBots = Object.assign({}, cfg.bots);
Object.assign(cfg.bots, { aggression: 1, senseRange: 2000, engageRange: 2000, fleeHpFraction: 0, acquireSec: 0.08 });

function duel(aId, bId) {
  let killer = null;
  const world = P.createWorld({ onKill(v, k) { killer = k && k.classId; } });
  // Put ordinary shared rocks between and around the fighters. Gravitors need real terrain;
  // no private rocks are created and every other class can use/break the same field.
  let n = 0;
  for (const o of world.state.objects) {
    if (o.type === 'titan') continue;
    const col = n % 4, row = Math.floor(n / 4) % 3;
    o.x = o.px = 1500 + (col - 1.5) * 105;
    o.y = o.py = 1500 + (row - 1) * 115;
    o.vx = o.vy = 0; n++;
    if (n >= 12) break;
  }
  const a = world.addShip({ classId: aId, isBot: true, x: 1160, y: 1500, aim: 0 });
  const b = world.addShip({ classId: bId, isBot: true, x: 1840, y: 1500, aim: Math.PI });
  a.spawnProtect = b.spawnProtect = 0;
  for (let tick = 0; tick < MAX_TICKS && !killer; tick++) world.step(DT);
  return { winner: killer || 'timeout', telemetry: world.telemetry };
}

const wins = Object.fromEntries(CLASSES.map(id => [id, 0]));
const timeouts = Object.fromEntries(CLASSES.map(id => [id, 0]));
for (let i = 0; i < CLASSES.length; i++) {
  for (let j = i + 1; j < CLASSES.length; j++) {
    const a = CLASSES[i], b = CLASSES[j], row = { [a]: 0, [b]: 0, timeout: 0, damage: { [a]: 0, [b]: 0 }, hits: { [a]: 0, [b]: 0 } };
    for (let r = 0; r < ROUNDS; r++) {
      const result = duel(r % 2 ? b : a, r % 2 ? a : b), winner = result.winner;
      for (const id of [a, b]) { row.damage[id] += result.telemetry.damageToShips[id] || 0; row.hits[id] += result.telemetry.shipHits[id] || 0; }
      if (winner === a || winner === b) { row[winner]++; wins[winner]++; }
      else { row.timeout++; timeouts[a]++; timeouts[b]++; }
    }
    console.log(`${a} vs ${b}: ${a} ${row[a]} — ${row[b]} ${b}${row.timeout ? ` (${row.timeout} timeout)` : ''} | avg dmg/hit: ${a} ${Math.round(row.damage[a] / ROUNDS)}/${(row.hits[a] / ROUNDS).toFixed(1)}, ${b} ${Math.round(row.damage[b] / ROUNDS)}/${(row.hits[b] / ROUNDS).toFixed(1)}`);
  }
}
console.log('\nTOTAL WINS');
for (const id of CLASSES) console.log(`${id}: ${wins[id]} wins, ${timeouts[id]} timeouts`);
Object.assign(cfg.bots, oldBots);
