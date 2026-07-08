// Headless unit test for the client-side prediction in src/mpclient.js.
// Verifies the movement mirror matches the sim's known behavior (cruise cap 392 px/s @ 3s),
// reconciliation shifts the sim without moving the rendered position, view-offset melt,
// teleport snap, afterburner kick prediction, and server-knockback adoption.
'use strict';
global.window = global;
global.performance = { now: () => 0 };
global.location = { protocol: 'http:', host: 'localhost' };
require('../data/config.js');
require('../data/classes.js');
require('../src/mpclient.js');

const MP = global.PULSAR.MP;
const pred = MP._pred;
const DT = 1 / 60;
let fails = 0;
const check = (name, cond, info) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (info ? `  (${info})` : '')); if (!cond) fails++; };

// 1) cruise ramp — 3s of straight thrust must hit the verified sim cap (280 × 1.4 = 392 px/s)
const p = { alive: true, classId: 'starter', charging: false, charge: 0, ramWinding: false, ramActive: 0, radius: 16, x: 1000, y: 1000, aim: 0 };
for (let i = 0; i < 180; i++) MP.predict(p, { moveX: 1, moveY: 0, aim: 0, afterburner: false }, DT);
check('cruise top speed ≈ 392 px/s after 3s', Math.abs(pred.vx - 392) < 6, 'vx=' + pred.vx.toFixed(1));

// 2) real-desync reconcile — sim adopts the error, rendered position doesn't move at the instant
// of correction (error must clear the SPEED-SCALED dead zone: ship is at ~392px/s here → dz≈73)
const simBefore = pred.x, renderedBefore = pred.x - pred.viewX;
MP._reconcile({ x: pred.x + 120, y: pred.y, ix: 0, iy: 0 }, null);
check('sim adopts server error', Math.abs(pred.x - (simBefore + 120)) < 0.01);
check('rendered pos unchanged at correction instant', Math.abs((pred.x - pred.viewX) - renderedBefore) < 0.01);
for (let i = 0; i < 60; i++) MP.predict(p, { moveX: 0, moveY: 0, aim: 0, afterburner: false }, DT);
check('view offset melts to ~0 within 1s', Math.abs(pred.viewX) < 2, 'viewX=' + pred.viewX.toFixed(2));

// 3) teleport-grade error snaps outright (no lingering offset)
MP._reconcile({ x: pred.x + 500, y: pred.y, ix: 0, iy: 0 }, null);
check('big error snaps, zero view offset', pred.viewX === 0 && pred.viewY === 0);

// 4) rail afterburner kick is predicted locally (input-driven impulse)
const rail = { alive: true, classId: 'railship', charging: false, charge: 0, ramWinding: false, ramActive: 0, radius: 16, x: 2000, y: 2000, aim: 0 };
pred.ready = false;
MP.predict(rail, { moveX: 1, moveY: 0, aim: 0, afterburner: true }, DT);
check('afterburner kick applied', Math.abs(pred.impX) > 100, 'impX=' + pred.impX.toFixed(0));
check('afterburner cooldown running', pred.burnCd > 4, 'cd=' + pred.burnCd.toFixed(1));

// 5) server knockback (impulse we couldn't predict) is adopted alongside a real correction
MP._reconcile({ x: pred.x + 60, y: pred.y, ix: 400, iy: 0 }, null);   // 60px error = real desync
check('server knockback adopted', Math.abs(pred.impX - 400) < 0.01, 'impX=' + pred.impX.toFixed(0));

// 6) DEAD ZONE: sub-threshold errors are path-latency jitter, not desync — the rendered
// position must hold still while phantom ±14px corrections hammer it (the tunnel "bounce" bug)
const r0 = pred.x - pred.viewX;
for (let i = 0; i < 30; i++) MP._reconcile({ x: pred.x + (i % 2 ? 14 : -14), y: pred.y, ix: 0, iy: 0 }, null);
check('dead zone: ±14px jitter leaves the render still', Math.abs((pred.x - pred.viewX) - r0) < 3,
  `moved ${Math.abs((pred.x - pred.viewX) - r0).toFixed(2)}px over 30 phantom corrections`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
