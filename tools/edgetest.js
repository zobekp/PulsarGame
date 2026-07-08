// Headless test for the server-side intent EDGE LATCH (sim.js setIntent/step).
// Reproduces the 60Hz race: an edge-carrying intent packet immediately overwritten by the next
// packet BEFORE any sim tick runs. Without the latch the edge dies and abilities never fire.
'use strict';
global.window = global;
require('../data/config.js'); require('../data/classes.js'); require('../data/farming.js'); require('../data/visuals.js');
require('../src/weapons.js'); require('../src/bots.js'); require('../src/sim.js');

const DT = 1 / 60;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };
const world = global.PULSAR.createWorld({});
const idle = () => ({ moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false, afterburner: false, altFire: false });

// hammer brace via ability edge that a second packet overwrites before the tick (the race)
// (was rail ventDash — the rail family's ability slot was removed in the fold/balance pass)
const ham = world.addShip({ classId: 'hammerhead' });
world.step(DT);                                    // settle
world.setIntent(ham.id, Object.assign(idle(), { ability: true }));
world.setIntent(ham.id, idle());                   // next packet lands before any tick ran
world.step(DT);
check('hammer brace fired despite overwrite', ham.braceTimer > 0 && ham.abilityCd > 0,
  `brace=${(ham.braceTimer || 0).toFixed(2)} cd=${(ham.abilityCd || 0).toFixed(2)}`);

// twinmaul Static Lash via special edge, same race
const twin = world.addShip({ classId: 'twinmaul' });
world.step(DT);                                    // settle (mace state init)
world.setIntent(twin.id, Object.assign(idle(), { special: true }));
world.setIntent(twin.id, idle());
world.step(DT);
check('twinmaul staticLash fired despite overwrite', twin.specialCd > 0, `cd=${(twin.specialCd || 0).toFixed(2)}`);

// consume-once: the latched edge is cleared after one tick — cooldown decays, never re-arms
const cd1 = twin.specialCd;
world.step(DT);
check('edge consumed exactly once (cd decays)', twin.specialCd > 0 && twin.specialCd < cd1, `cd ${cd1.toFixed(3)} → ${twin.specialCd.toFixed(3)}`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
