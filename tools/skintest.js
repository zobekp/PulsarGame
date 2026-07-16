// Headless test of the COSMETICS layer: catalog integrity, profile unlock/equip flow,
// skin-aware hull palettes (every skin x every class draws without throwing), and
// bot livery assignment. Render calls run against a no-op Proxy canvas context.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../data/cosmetics.js');
require('../src/profile.js'); require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');
require('../src/ships.js');

const cfg = global.PULSAR.config;
const COS = global.PULSAR.cosmetics;
const P = global.PULSAR.Profile;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };

// ---- catalog integrity ----
const HEX = /^#[0-9a-f]{6}$/i, FX = [null, 'ember', 'void', 'chrome', 'prism', 'aurora'];
const ids = COS.skins.map(s => s.id);
check('catalog has 14 skins', COS.skins.length === 14, `n=${COS.skins.length}`);
check('skin ids unique', new Set(ids).size === ids.length);
check('default first, free, common', COS.skins[0].id === 'default' && COS.skins[0].cost === 0 && COS.skins[0].tier === 'common');
check('all colors valid + tiers/fx known', COS.skins.every(s =>
  (s.hull === null || HEX.test(s.hull)) && HEX.test(s.accent) && (s.engine === null || HEX.test(s.engine)) &&
  COS.tiers[s.tier] && FX.indexOf(s.fx) >= 0));
check('costs ascend with catalog order', COS.skins.every((s, i) => i === 0 || s.cost >= COS.skins[i - 1].cost));
check('skin() resolves + falls back to default', COS.skin('void').id === 'void' && COS.skin('nope').id === 'default');

// ---- profile unlock/equip flow (Node = in-memory profile) ----
const prof = P.get();
check('fresh profile: default equipped + owned', prof.skin === 'default' && P.isUnlocked('default'));
check('unlock refused when poor', !P.unlock('solar', 240) && !P.isUnlocked('solar'));
prof.cores = 1000;
check('unlock spends cores', P.unlock('solar', 240) && prof.cores === 760 && P.isUnlocked('solar'));
check('equip owned skin', P.equip('solar') && prof.skin === 'solar');
check('equip refused when locked', !P.equip('prism') && prof.skin === 'solar');
check('re-unlock owned is free', P.unlock('solar', 240) && prof.cores === 760);

// ---- renderer: every skin x every class draws without throwing ----
function mockCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) { return t[k] !== undefined ? t[k] : function () { return grad; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function stubShip(cls, skin) {
  return { classId: cls, radius: 20, skin, vx: 100, vy: 0, aim: 0, alive: true,
    charge: 0.4, charging: true, chargeFullTimer: 0, heat: 20, ventTimer: 0, hitFlash: 0,
    captured: [], turrets: [], shield: 0, shieldMax: 0, shieldFlash: 0, level: 5, id: 1,
    stunTimer: 0, spawnProtect: 0 };
}
const classIds = Object.keys(global.PULSAR.classes);
let drew = 0, drawErr = null;
for (const cls of classIds) for (const sk of COS.skins) {
  try { global.PULSAR.Ships.draw(mockCtx(), stubShip(cls, sk.id), 1.25); drew++; }
  catch (e) { drawErr = drawErr || `${cls}/${sk.id}: ${e.message}`; }
}
check('every class x skin draws clean', !drawErr, drawErr || `${drew} combos`);

// ---- skinned palette actually differs from the class palette ----
function fillsFor(skinId, time) {
  const seen = [];
  const ctx = new Proxy({}, {
    get(t, k) { return t[k] !== undefined ? t[k] : function () { return { addColorStop() {} }; }; },
    set(t, k, v) { if (k === 'fillStyle' && typeof v === 'string') seen.push(v); t[k] = v; return true; },
  });
  global.PULSAR.Ships.draw(ctx, stubShip('railship', skinId), time || 1);
  return seen.join('|');
}
check('crimson livery retints the hull', fillsFor('crimson') !== fillsFor('default'));
check('prism livery animates over time', fillsFor('prism', 1) !== fillsFor('prism', 4));

// ---- bot liveries (config-gated, validated ids) ----
const world = global.PULSAR.createWorld({});
const orig = cfg.cosmetics.botSkinChance;
cfg.cosmetics.botSkinChance = 1;
world.spawnBots(6);
const bots = world.state.ships.filter(s => s.isBot);
check('botSkinChance=1: every bot wears a catalog skin', bots.length === 6 && bots.every(b => b.skin && b.skin !== 'default' && ids.indexOf(b.skin) > 0));
cfg.cosmetics.botSkinChance = 0;
world.clearBots(); world.spawnBots(4);
check('botSkinChance=0: bots spawn bare', world.state.ships.filter(s => s.isBot).every(b => !b.skin));
cfg.cosmetics.botSkinChance = orig;

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
