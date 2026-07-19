// Deterministic match-flow regression for Phase 4 bot feel. This checks the AI behaviors that
// make encounters catch without pretending that headless telemetry can certify human fun.
'use strict';

let seed = 0x51a7f00d;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const P = global.PULSAR, cfg = P.config, DT = 1 / cfg.sim.tickRate;
let fails = 0;
const check = (name, condition, info) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
  if (!condition) fails++;
};

// An opponent in the awareness band should pull a farmer toward combat, even though it is still
// outside engageRange. Removing rocks makes the old safe-ring drift easy to distinguish.
const pursuit = P.createWorld({});
pursuit.state.objects.length = 0;
const pa = pursuit.addShip({ classId: 'railship', isBot: true, x: 2500, y: 3000, aim: 0 });
const pb = pursuit.addShip({ classId: 'hammerhead', isBot: true, x: 3400, y: 3000, aim: Math.PI });
pa.spawnProtect = pb.spawnProtect = 0;
const pursuitStart = Math.hypot(pa.x - pb.x, pa.y - pb.y);
for (let i = 0; i < cfg.sim.tickRate * 2; i++) pursuit.step(DT);
const pursuitEnd = Math.hypot(pa.x - pb.x, pa.y - pb.y);
check('bots pursue through the awareness band', pursuitEnd < pursuitStart - 180,
  `separation ${Math.round(pursuitStart)} -> ${Math.round(pursuitEnd)}`);

// Once acquired, a nearby living target should not be forgotten because of a fresh aggression
// coin flip. Hold positions fixed and sample many decision windows to isolate state selection.
const sticky = P.createWorld({});
sticky.state.objects.length = 0;
const sa = sticky.addShip({ classId: 'railship', isBot: true, x: 2700, y: 3000, aim: 0 });
sticky.addShip({ classId: 'gravitor', isBot: true, x: 3200, y: 3000, aim: Math.PI });
const stickyBotWorld = {
  ships: sticky.state.ships, objects: sticky.state.objects, config: cfg, arena: cfg.arena,
  familyOf: id => sticky.FAMILY[id],
};
let committed = false, dropped = 0;
for (let i = 0; i < cfg.sim.tickRate * 8; i++) {
  P.Bots.intent(sa, stickyBotWorld, DT);
  if (sa.ai.state === 'fight') committed = true;
  else if (committed && sa.ai.state === 'farm') dropped++;
}
check('committed fights do not randomly drop back to farming', committed && dropped === 0,
  `farm drops after commit=${dropped}`);

// Final-form flails have rank-scaled chains. Their release decision must use that same reach;
// otherwise Binary Star holds its preferred range outside the old base-chain release threshold.
const flailWorld = P.createWorld({});
flailWorld.state.objects.length = 0;
const binary = flailWorld.addShip({ classId: 'binaryStar', isBot: true, x: 2600, y: 3000, aim: 0 });
const target = flailWorld.addShip({ classId: 'railship', isBot: false, x: 3000, y: 3000, aim: Math.PI });
const flailBotWorld = {
  ships: flailWorld.state.ships, objects: flailWorld.state.objects, config: cfg, arena: cfg.arena,
  familyOf: id => flailWorld.FAMILY[id],
};
P.Bots.intent(binary, flailBotWorld, DT); // initialize the AI-owned state shape
Object.assign(binary.ai, { state: 'fight', t: 1, target, acquire: 0, react: 1, seenA: 0, seenD: 400, aimCur: 0 });
binary.orbState = 'spin'; binary.spinFrac = 0.9;
const flailIntent = P.Bots.intent(binary, flailBotWorld, DT);
check('rank-scaled flail releases at its real combat reach', flailIntent.firing === false,
  `distance=400 scaled reach=${Math.round(cfg.flailship.orb.maxReach * binary.rangeMult)}`);

// Flail is the anti-rush family. Its bot should answer a visible Hammerhead windup with the
// same tools a player has: accelerate the spin-up, then retain the defensive orbit at impact.
const counterWorld = P.createWorld({});
counterWorld.state.objects.length = 0;
const flail = counterWorld.addShip({ classId: 'flailship', isBot: true, x: 2700, y: 3000, aim: 0 });
const hammer = counterWorld.addShip({ classId: 'hammerhead', isBot: true, x: 3000, y: 3000, aim: Math.PI });
const counterBotWorld = {
  ships: counterWorld.state.ships, objects: counterWorld.state.objects, config: cfg, arena: cfg.arena,
  familyOf: id => counterWorld.FAMILY[id],
};
P.Bots.intent(flail, counterBotWorld, DT);
Object.assign(flail.ai, { state: 'fight', t: 1, target: hammer, acquire: 0, react: 1, seenA: 0, seenD: 300, aimCur: 0 });
flail.orbState = 'spin'; flail.spinFrac = 0.3; hammer.ramWinding = true;
const spinUpIntent = P.Bots.intent(flail, counterBotWorld, DT);
flail.spinFrac = 0.9;
const holdIntent = P.Bots.intent(flail, counterBotWorld, DT);
check('flail bot counters a telegraphed ram with its spinning mace', spinUpIntent.ability && holdIntent.firing,
  `spin-up ability=${spinUpIntent.ability} hold spin=${holdIntent.firing}`);

// Run representative full lobbies and report coarse pacing. The threshold is intentionally broad:
// this catches dead/passive combat while leaving balance judgments to live play.
let kills = 0, damage = 0, fightSamples = 0, huntSamples = 0, botSamples = 0;
const rounds = 3, secondsPerRound = 90;
for (let round = 0; round < rounds; round++) {
  seed = 0x51a7f00d + round * 997;
  const world = P.createWorld({ onKill(v, killer) { if (v.isBot && killer && killer.isBot) kills++; } });
  world.spawnBots(cfg.bots.count);
  for (let tick = 0; tick < secondsPerRound * cfg.sim.tickRate; tick++) {
    world.step(DT);
    if (tick % cfg.sim.tickRate === 0) for (const bot of world.state.ships) {
      if (!bot.isBot || !bot.alive || (bot.plane | 0) !== 0) continue;
      botSamples++;
      if (bot.ai && bot.ai.state === 'fight') fightSamples++;
      if (bot.ai && bot.ai.state === 'hunt') huntSamples++;
    }
  }
  damage += Object.values(world.telemetry.damageToShips).reduce((sum, value) => sum + value, 0);
}
const activeShare = botSamples ? (fightSamples + huntSamples) / botSamples : 0;
check('full bot lobbies produce sustained combat', kills >= 3 && damage >= 1000,
  `${kills} kills, ${Math.round(damage)} damage over ${rounds * secondsPerRound}s`);
check('bots spend a meaningful share of match time contesting', activeShare >= 0.08,
  `${(activeShare * 100).toFixed(1)}% hunt/fight samples`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
