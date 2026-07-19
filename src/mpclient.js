// PULSAR.io — MP (authoritative thin client). Phase 5 Step 2.
// When the page is served by the AUTHORITATIVE server (mpserver.js injects window.__PULSAR_AUTH__),
// the client stops simulating: it sends INPUT INTENT and renders the world the server broadcasts.
// This is the cheat-resistant shared-world path that supersedes the relay (src/net.js).
//
// REMOTE ships are interpolated: drawn ~interpMs in the past (scaled to the server's snapshot
// rate, from the welcome message) so snapshots look smooth at any rate.
// YOUR OWN ship is PREDICTED: its movement (inertia/cruise/afterburner — all input-driven, hence
// predictable) is simulated locally the instant input happens, so control feels like single-player.
// Weapons/damage/economy stay server-side. Every intent send carries a sequence number; snapshots
// echo the last seq the server received (`aq`), and the client reconciles: it compares the server's
// position against where prediction said we were at that seq, shifts the SIMULATION by the error,
// and hides the shift behind a decaying VIEW OFFSET (snap the sim, smooth the presentation).
// Teleport-grade errors (respawn, Static Lash) snap outright.
window.PULSAR = window.PULSAR || {};

window.PULSAR.MP = (function () {
  const AUTH = typeof window !== 'undefined' && !!window.__PULSAR_AUTH__
    && !/\bsolo\b/.test((typeof location !== 'undefined' && location.search) || '');   // ?solo = force local SP even when served by mpserver
  const TAU = Math.PI * 2;
  const SEND_HZ = 60;                 // intent send rate (a click reaches the server within ~16ms)
  let interpMs = 40;                 // render this far in the past (≈2.5 snapshot intervals; set from the welcome's hz)

  let ws = null, connected = false, myId = 0, arena = null;
  let getIntent = null, myName = '', onKillCb = null;
  let sendAcc = 0;
  const buffer = [];                  // [{ recv, snap }] oldest→newest; snap = server 't' message
  // SERVER-CLOCK interpolation: proxies (tunnels) deliver packets in CLUMPS — timing playback
  // off arrival times makes motion run fast-slow-fast (the "unplayable jitter"). Instead we
  // estimate the clock offset (arrival − server tm; min-tracked = fastest path, with a slow
  // upward creep so a genuinely slower route re-converges) and interpolate on the SERVER
  // timeline, where snapshots are perfectly evenly spaced. Lateness above the floor is the
  // real jitter measure and sizes the interp buffer.
  let serverHz = 60, jitterMs = 0, clockOff = null;
  // Session token: rides every join so a reconnect within the server's grace window reattaches
  // the SAME ship (a tunnel blip no longer costs your run). Fresh per page load.
  const TOKEN = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  const remotes = [];                 // view-ships for OTHER players (game.js appends after `p`)
  const byId = new Map();             // id → view-ship (persists across frames for interpolation)

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const lerp = (a, b, t) => a + (b - a) * t;
  function alerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * t; }

  // Full default field set so ships.js hull models + drawClassExtras never read undefined → NaN.
  function makeView(id) {
    return {
      isShip: true, isRemote: true, netId: id, id, team: id,
      classId: 'starter', name: '', skin: null, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, impX: 0, impY: 0,
      aim: 0, radius: 16, hp: 100, maxHp: 100, scrap: 0, xp: 0, level: 1, kills: 0,
      alive: true, isLeader: false, scaled: false, spawnProtect: 0, hitFlash: 0,
      charge: 0, charging: false, chargeFullTimer: 0, heat: 0, ventTimer: 0,
      beamRamp: 0, beamTimer: 0, beamPower: 0, beamWidth: 0,
      ramWinding: false, ramCharge: 0, ramActive: 0,
      captured: [], orbSpin: 0, orbAngle: 0, orbRadius: 0, orbX: 0, orbY: 0, orbX2: null, orbY2: null,
      orbSelfSpin: 0, orbSelfSpin2: 0, orbState: 'trail', flingPower: 0, spinFrac: 0,
      orbActive: false, orbBlockRadius: 0, combatTimer: 0, slow: 0, slowTimer: 0, burnTimer: 0, cracked: false,
    };
  }

  // Copy the discrete (boolean/step) fields from a snapshot ship `s` onto a view-ship `v`.
  function applyDiscrete(v, s) {
    v.classId = s.c; v.radius = s.r; v.hp = s.hp; v.maxHp = s.mh; v.scrap = s.scr; v.xp = s.xp || 0;
    v.level = s.lvl; v.kills = s.k || 0; v.team = s.team; v.alive = s.al !== 0; v.isLeader = !!s.ld; v.isBot = !!s.bt; v.plane = s.pl || 0;
    v.spawnProtect = s.sp ? 1 : 0; v.hitFlash = s.hf ? 0.16 : 0;
    v.shield = s.shd || 0; v.shieldMax = s.shm || 0; v.shieldFlash = s.shf ? 0.14 : 0;
    v.charging = !!s.cg; v.beamTimer = s.bt ? 0.1 : 0;
    v.orbState = s.os || 'trail';
    v.ramWinding = !!s.rw; v.ramActive = s.ra ? 1 : 0;
    // Held gravitor rocks: the count is authoritative; fake the shapes locally (as the relay did).
    const n = s.cap || 0;
    if (v.captured.length !== n) { v.captured.length = 0; for (let i = 0; i < n; i++) v.captured.push({ type: 'asteroid', radius: 36 }); }
  }
  // Continuous numeric fields — LERPED between the bracketing snapshots so hull animations
  // (capacitor rings, drum spin, ram heat, mace momentum) run at render rate, never snapshot rate.
  function lerpCont(v, p0, s, t) {
    v.charge = lerp(p0.ch || 0, s.ch || 0, t);
    v.heat = lerp(p0.ht || 0, s.ht || 0, t);
    v.ventTimer = lerp(p0.vt || 0, s.vt || 0, t);
    v.chargeFullTimer = lerp(p0.cft || 0, s.cft || 0, t);
    v.beamRamp = lerp(p0.br || 0, s.br || 0, t);
    v.beamPower = lerp(p0.bp || 0, s.bp || 0, t);
    v.ramCharge = lerp(p0.rc || 0, s.rc || 0, t);
    v.spinFrac = lerp(p0.sf || 0, s.sf || 0, t);
    v.flingPower = lerp(p0.fp || 0, s.fp || 0, t);
    v.orbSpin = lerp(p0.osp || 0, s.osp || 0, t);
    v.orbSelfSpin = lerp(p0.oss || 0, s.oss || 0, t);
    v.orbSelfSpin2 = lerp(p0.oss2 || 0, s.oss2 || 0, t);
    v.orbAngle = lerp(p0.oa || 0, s.oa || 0, t);
    v.orbRadius = lerp(p0.orad || 0, s.orad || 0, t);
  }

  // ---- client-side prediction (own ship, movement only) -----------------------
  const cfg = () => PULSAR.config;
  const RAILS = new Set(['railship', 'helion', 'starPiercer', 'supernova', 'starbreak']);   // afterburner-capable (mirrors game.js FAMILY)
  const SNAP_DIST = 200;              // reconcile error beyond this = teleport (respawn/lash) → snap
  const DEAD_ZONE = 26;               // px — errors below this are PATH-LATENCY noise, not desync:
                                      // over a jittery route the server's answer wobbles ±v·Δlatency
                                      // around the truth; correcting toward each phantom made the
                                      // ship visibly bounce ("moves side to side"). Real desyncs
                                      // (knockback/collision/stun) blow well past this and correct.
  const VIEW_DECAY = 9;               // /s — how fast a correction's view offset melts away
  const pred = { ready: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, impX: 0, impY: 0, aim: 0,
    cruise: 0, cruiseDX: 0, cruiseDY: 0, burnTimer: 0, burnCd: 0, viewX: 0, viewY: 0 };
  let seq = 0;
  const history = new Map();          // seq → {x,y} predicted position at send time

  // One movement tick for our own ship — a faithful mirror of simShip's MOVEMENT half
  // (sim.js:298-343). Speed multipliers read server-synced flags off `p` (charging/ramWinding);
  // slow/stun aren't synced and are absorbed by reconciliation instead.
  function predict(p, intent, dt) {
    const C = cfg();
    if (!p || !p.alive) { pred.ready = false; return; }
    // Belt-and-braces: a missing intent used to throw here and kill the whole session (an
    // uncaught TypeError stops the rAF loop dead). Coasting on the ship's own heading is always
    // a safe read of "no input this tick".
    if (!intent) intent = { moveX: 0, moveY: 0, aim: p.aim, afterburner: false };
    if (!pred.ready) {
      pred.ready = true; pred.x = p.x; pred.y = p.y; pred.vx = 0; pred.vy = 0; pred.impX = 0; pred.impY = 0;
      pred.cruise = 0; pred.cruiseDX = 0; pred.cruiseDY = 0; pred.burnTimer = 0; pred.burnCd = 0; pred.viewX = 0; pred.viewY = 0;
    }
    pred.px = pred.x; pred.py = pred.y;   // previous tick pos — render lerps px→x by the accumulator alpha
    pred.aim = intent.aim;
    const node = PULSAR.classes[p.classId] || PULSAR.classes.starter;
    const st = (C[node.configKey] && C[node.configKey].stats) || { speed: 1 };
    let speedMul = 1;
    if (p.charging) {
      if (p.classId === 'starbreak') { const c = Math.min(1, p.charge); speedMul = 1 - (1 - C.railship.mawRail.starbreakAnchorSpeedMult) * c * c; }   // siege anchor (matches sim)
      else { const m = C.railship.movementWhileCharging; speedMul = p.charge > 1 ? m.overcharge : p.charge <= 0.5 ? m.to50 : p.charge <= 0.9 ? m.to90 : m.to100; }
    }
    else if (p.ramWinding) speedMul = 0.4;
    const thrusting = intent.moveX !== 0 || intent.moveY !== 0;
    if (RAILS.has(p.classId)) {   // afterburner kick + boost are input-driven ⇒ predictable
      const ab = C.railship.afterburner;
      if (pred.burnCd > 0) pred.burnCd -= dt;
      if (intent.afterburner && pred.burnCd <= 0 && pred.burnTimer <= 0) {
        pred.burnTimer = ab.durationSec; pred.burnCd = ab.cooldownSec;
        const kx = thrusting ? intent.moveX : -Math.cos(pred.aim), ky = thrusting ? intent.moveY : -Math.sin(pred.aim);
        pred.impX += kx * ab.kick; pred.impY += ky * ab.kick;
      }
      if (pred.burnTimer > 0) { pred.burnTimer -= dt; speedMul *= ab.speedMult; }
    }
    const cz = C.player.cruise;
    if (thrusting) {
      const dot = intent.moveX * pred.cruiseDX + intent.moveY * pred.cruiseDY;
      pred.cruise = dot >= cz.alignDot ? Math.min(1, pred.cruise + dt / cz.rampSec) : 0;
      pred.cruiseDX = intent.moveX; pred.cruiseDY = intent.moveY;
    } else pred.cruise = Math.max(0, pred.cruise - cz.decayPerSec * dt);
    speedMul *= 1 + pred.cruise * (cz.maxMult - 1);
    // maneuver taper by hull size (matches sim.maneuverFor) so big-ship prediction stays in sync
    const mn = C.scaling.maneuver, br = C.player.baseRadius;
    const man = Math.max(mn.minMult, Math.min(1, 1 - (1 - mn.minMult) * (p.radius - br) / Math.max(1, mn.fullSizeRadius - br)));
    const speed = C.player.baseSpeed * (st.speed || 1) * speedMul * man;
    const inr = C.player.inertia;
    const accel = inr.accelPerSec * man * (pred.burnTimer > 0 ? C.railship.afterburner.accelMult : 1);
    const k = Math.min(1, (thrusting ? accel : inr.coastDampPerSec) * dt);
    pred.vx += (intent.moveX * speed - pred.vx) * k; pred.vy += (intent.moveY * speed - pred.vy) * k;
    pred.x += (pred.vx + pred.impX) * dt; pred.y += (pred.vy + pred.impY) * dt;
    // Black-hole pull (matches sim.pulsarGravity) so prediction doesn't fight the server near the core.
    const P = C.arena.pulsar, gx = C.arena.width / 2 - pred.x, gy = C.arena.height / 2 - pred.y, gd = Math.hypot(gx, gy) || 1;
    if (gd <= P.pullRadius && gd > P.lethalRadius) { const f = 1 - gd / P.pullRadius, pull = P.pullMaxSpeed * f * f; pred.x += (gx / gd) * pull * dt; pred.y += (gy / gd) * pull * dt; }
    const dampRate = p.ramActive > 0 ? C.hammerhead.lunge.glideDampPerSec : C.player.impulseDampPerSec;
    const damp = Math.max(0, 1 - dampRate * dt); pred.impX *= damp; pred.impY *= damp;
    pred.x = Math.max(p.radius, Math.min(C.arena.width - p.radius, pred.x));
    pred.y = Math.max(p.radius, Math.min(C.arena.height - p.radius, pred.y));
    // melt the presentation offset left by past corrections
    const vk = Math.min(1, VIEW_DECAY * dt);
    pred.viewX -= pred.viewX * vk; pred.viewY -= pred.viewY * vk;
  }

  // Reconcile our prediction against the server's acked state for our own ship.
  function reconcile(s, ack) {
    if (!pred.ready) return;
    const h = ack != null ? history.get(ack) : null;
    const ex = s.x - (h ? h.x : pred.x), ey = s.y - (h ? h.y : pred.y);
    const d = Math.hypot(ex, ey);
    // dead zone scales with speed: phantom error ≈ v·Δlatency, so a fast ship needs a wider
    // tolerance for the same path jitter (fixed 26px was getting punched through at speed)
    const dz = DEAD_ZONE + 0.12 * Math.hypot(pred.vx, pred.vy);
    if (d > SNAP_DIST) {                       // teleport-grade: adopt server state outright
      pred.x = pred.px = s.x; pred.y = pred.py = s.y; pred.impX = s.ix || 0; pred.impY = s.iy || 0;
      pred.viewX = 0; pred.viewY = 0;
    } else if (d > dz) {                       // real desync: correct (sim snaps, view melts)
      pred.x += ex; pred.y += ey;
      pred.px += ex; pred.py += ey;            // (shift the lerp pair together — no sub-tick smear)
      pred.viewX += ex; pred.viewY += ey;
      // adopt server impulses that exceed ours — the knockback we couldn't predict
      const si = Math.hypot(s.ix || 0, s.iy || 0), pi = Math.hypot(pred.impX, pred.impY);
      if (si > pi + 20) { pred.impX = s.ix || 0; pred.impY = s.iy || 0; }
    } else if (d > 0.01) {
      // sub-threshold: latency lead, not desync. Bleed 2% toward server truth so slow drift
      // can never accumulate — ≤0.5px/snapshot, invisible — and keep the view offset out of it.
      pred.x += ex * 0.02; pred.y += ey * 0.02;
      pred.px += ex * 0.02; pred.py += ey * 0.02;
    }
    if (ack != null) for (const k of history.keys()) if (k <= ack) history.delete(k);
    while (history.size > 128) history.delete(history.keys().next().value);   // stray-seq safety cap
  }

  // ---- network ---------------------------------------------------------------
  function send(obj) { if (connected) try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  // Equipped cosmetic livery rides the join so other pilots see it (server validates the id).
  function mySkin() { return (window.PULSAR && PULSAR.Profile) ? (PULSAR.Profile.get().skin || '') : ''; }
  // Viewport (CSS px) rides the join: the server scales its interest-culling box to what this
  // client can actually SEE. A zoomed-out Titan on a big monitor sees ±2500px+, and the old fixed
  // ±1400-1600 boxes ended mid-screen — rocks/fx/ship-state popped in and out of existence in
  // plain view, snapshot-quantized (the Titan-plane "strobe").
  function myView() { return { vw: Math.round(window.innerWidth || 1600), vh: Math.round(window.innerHeight || 900) }; }
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => { connected = true; send(Object.assign({ t: 'join', name: myName || '', tk: TOKEN, skin: mySkin() }, myView())); };
    ws.onclose = () => { connected = false; buffer.length = 0; remotes.length = 0; byId.clear(); objView.clear(); lastSyncAt = 0; clockOff = null; jitterMs = 0; pred.ready = false; history.clear(); setTimeout(connect, 1500); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') { myId = m.id; arena = m.arena; serverHz = m.hz || 60; interpMs = Math.max(40, Math.round(2500 / serverHz)); }
      else if (m.t === 't') ingest(m);
      else if (m.t === 'kill') { if (onKillCb) onKillCb(m.kn || null, m.vn || 'Ship', !!m.ld); }
    };
  }

  // Ingest a snapshot: buffer it for interpolation, retain the object field, replay its FX ONCE.
  function ingest(snap) {
    const t0 = now();
    buffer.push({ recv: t0, snap });
    while (buffer.length > 60) buffer.shift();
    // clock offset: min-track (fastest observed path) with a slow creep upward; this frame's
    // LATENESS above that floor is genuine delivery jitter and sizes the buffer depth.
    const off = t0 - snap.tm * 1000;
    if (clockOff == null || off < clockOff) clockOff = off;
    else clockOff += 0.005 * (off - clockOff);
    const late = Math.max(0, off - clockOff);
    jitterMs = jitterMs * 0.95 + late * 0.05;
    interpMs = Math.min(200, Math.round(Math.max(40, 2500 / serverHz) + 2.5 * jitterMs + 8));
    if (snap.ob) applyObjFrame(snap);
    // reconcile our own prediction against this (newest) authoritative state
    for (const s of snap.sh) {
      if (s.id !== myId) continue;
      if (s.al === 0) pred.ready = false;    // dead: stop predicting (death cam follows server)
      else reconcile(s, snap.ack != null ? snap.ack : (snap.aq ? snap.aq[myId] : null));
      break;
    }
    replayFx(snap.ev);
  }
  function replayFx(ev) {
    if (!ev || !ev.length || !PULSAR.Fx) return;
    const Fx = PULSAR.Fx;
    for (const e of ev) {
      switch (e[0]) {
        case 'p': Fx.spawnParticles(e[1], e[2], e[3], e[4], typeof e[5] === 'object' ? e[5] : undefined); break;
        case 'b': Fx.spawnBeam(e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8]); break;
        case 't': Fx.spawnText(e[1], e[2], e[3], e[4], { size: e[5] }); break;
        case 's': if (e[2] === myId) Fx.addShake(e[1]); break;   // shake only for our own ship
      }
    }
  }

  // ---- interpolation + state reconstruction ----------------------------------
  // Find the two snapshots bracketing the wanted SERVER time; return { a, b, t }.
  // Server timestamps are evenly spaced regardless of how the network clumped delivery.
  function bracket() {
    if (!buffer.length || clockOff == null) return null;
    const wantTm = (now() - clockOff - interpMs) / 1000;
    let a = buffer[0], b = buffer[0];
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].snap.tm <= wantTm) { a = buffer[i]; b = buffer[i + 1] || buffer[i]; }
    }
    const span = b.snap.tm - a.snap.tm;
    const t = span > 0 ? Math.max(0, Math.min(1, (wantTm - a.snap.tm) / span)) : 0;
    return { a: a.snap, b: b.snap, t, dt: span };
  }

  // Rebuild game.js's render `state` + the player object `p` from interpolated server state.
  // Everything position-like is interpolated CONTINUOUSLY at render time (px == x for entities the
  // client can't sub-tick further); the clock is interpolated too, so time-driven animations
  // (hull models, spins, fades, pulsar) run at render rate, never at snapshot rate.
  let lastSyncAt = 0;
  const objView = new Map();   // id → persistent render object, spun locally between object frames
  function syncState(state, p) {
    const br = bracket();
    if (!br) return;
    const { a, b, t, dt } = br;
    const tNow = now();
    const frameDt = lastSyncAt ? Math.min(0.1, (tNow - lastSyncAt) / 1000) : 1 / 60;
    lastSyncAt = tNow;
    const disp = b;                                   // discrete fields from the newer frame
    state.time = lerp(a.tm, b.tm, t);                 // continuous clock (never steps at snapshot rate)
    state.pulsarTimer = b.pt > a.pt ? b.pt : lerp(a.pt, b.pt, t);   // countdown; jump on pulse reset

    // index the older frame's ships by id so we can interpolate position
    const prev = new Map();
    for (const s of a.sh) prev.set(s.id, s);

    remotes.length = 0;
    const seen = new Set();
    for (const s of disp.sh) {
      seen.add(s.id);
      const mine = s.id === myId;
      let v = mine ? p : byId.get(s.id);
      if (!v && !mine) { v = makeView(s.id); byId.set(s.id, v); }
      const p0 = prev.get(s.id) || s;
      applyDiscrete(v, s);
      lerpCont(v, p0, s, t);
      if (mine && pred.ready) {
        // OWN ship: predicted position (instant input) + view offset (smoothed corrections);
        // aim is the local mouse angle, not the interpolated echo. px/x differ by one sim tick
        // so the render's accumulator alpha gives sub-tick smoothness on high-refresh displays.
        v.px = pred.px - pred.viewX; v.x = pred.x - pred.viewX;
        v.py = pred.py - pred.viewY; v.y = pred.y - pred.viewY;
        v.aim = pred.aim; v.vx = pred.vx; v.vy = pred.vy;
      } else {
        const x = lerp(p0.x, s.x, t), y = lerp(p0.y, s.y, t);
        v.px = v.x = x; v.py = v.y = y;
        v.aim = alerp(p0.a, s.a, t);
        // derive velocity from the interpolated pair (engine flares read vx/vy) — free, no bandwidth
        v.vx = dt > 0 ? (s.x - p0.x) / Math.max(dt, 1 / SEND_HZ) : 0;
        v.vy = dt > 0 ? (s.y - p0.y) / Math.max(dt, 1 / SEND_HZ) : 0;
      }
      v.orbX = lerp(p0.ox, s.ox, t); v.orbY = lerp(p0.oy, s.oy, t);
      v.orbX2 = s.ox2 != null ? lerp(p0.ox2 != null ? p0.ox2 : s.ox2, s.ox2, t) : null;
      v.orbY2 = s.oy2 != null ? lerp(p0.oy2 != null ? p0.oy2 : s.oy2, s.oy2, t) : null;
      if (mine) v.isRemote = false;                   // own ship drives the camera/HUD; keep local name
      else { v.name = s.nm || ''; v.skin = s.sk || null; remotes.push(v); }
    }
    // drop view-ships that left
    for (const id of [...byId.keys()]) if (!seen.has(id)) byId.delete(id);

    // projectiles: id-matched lerp between the bracketing snapshots — no more 20Hz teleporting
    const prevPr = new Map();
    for (const q of a.pr) if (q.id != null) prevPr.set(q.id, q);
    state.projectiles.length = 0;
    for (const q of disp.pr) {
      const q0 = (q.id != null && prevPr.get(q.id)) || q;
      const x = lerp(q0.x, q.x, t), y = lerp(q0.y, q.y, t);
      state.projectiles.push({ x, y, px: x, py: y, radius: q.r, color: q.c, kind: q.k || '', rockType: q.rt || 'asteroid', spin: state.time * 2.4, damage: 0, pierceLeft: 1, team: -1, plane: q.pl || 0 });
    }
    // motes: same id-matched lerp (the vacuum curves read smoothly)
    const prevMo = new Map();
    for (const mo of a.mo) if (mo.id != null) prevMo.set(mo.id, mo);
    state.motes.length = 0;
    for (const mo of disp.mo) {
      const m0 = (mo.id != null && prevMo.get(mo.id)) || mo;
      const x = lerp(m0.x, mo.x, t), y = lerp(m0.y, mo.y, t);
      state.motes.push({ x, y, px: x, py: y, value: 0, pulsar: mo.p ? 1 : 0, life: 9 });
    }
    // objects: authoritative SLICES were merged into objView at ingest — here we just spin
    // them locally at their server spin rate and ease toward the latest authoritative position.
    state.objects.length = 0;
    const ek = Math.min(1, 10 * frameDt);
    for (const v of objView.values()) {
      v.spin += v.spinRate * frameDt;
      if (v.flash > 0) v.flash = Math.max(0, v.flash - frameDt);
      v.x += (v.tx - v.x) * ek; v.y += (v.ty - v.y) * ek;
      v.px = v.x; v.py = v.y;
      state.objects.push(v);
    }
  }

  // Merge one object frame into the persistent views. Frames are SLICES (ids where
  // id % obn === obi) so the bytes spread across snapshots instead of bursting; stale ids are
  // pruned per-slice, so destroyed/out-of-range rocks still disappear within one slice cycle.
  function applyObjFrame(snap) {
    const seen = new Set();
    for (const o of snap.ob) {
      seen.add(o.id);
      let v = objView.get(o.id);
      if (!v) { v = { type: o.t, x: o.x, y: o.y, px: o.x, py: o.y, radius: o.r, hp: 1, maxHp: 1, spin: o.sp || 0, spinRate: o.sr || 0, flash: 0, cracked: false, crackTimer: 0 }; objView.set(o.id, v); }
      v.type = o.t; v.tx = o.x; v.ty = o.y; v.spinRate = o.sr || 0; v.radius = o.r; v.cracked = !!o.cr;
      v.hp = o.h != null ? o.h : 1;                    // damage arc: hp as a fraction of maxHp==1
      // Hit flash latches on and decays locally in syncState. The latch MUST outlive one full
      // slice cycle (obn/snapHz = 6/20 = 0.3s): objects only refresh every ~300ms, so a 0.12s
      // latch made any rock under sustained fire STROBE at ~3Hz (on 0.12s, off 0.18s, relatch) —
      // in SP the sim re-sets flash at 60Hz and the same rock reads as continuously lit. A beam
      // parked on an asteroid should glow steadily, not blink like a hazard light.
      if (o.fl) v.flash = 0.34;
    }
    if (snap.obi != null) {
      const n = snap.obn || 6;
      for (const id of [...objView.keys()]) if (id % n === snap.obi && !seen.has(id)) objView.delete(id);
    } else {
      for (const id of [...objView.keys()]) if (!seen.has(id)) objView.delete(id);   // legacy full frame
    }
  }

  return {
    AUTH,
    get connected() { return connected; },
    get count() { return remotes.length; },
    get myId() { return myId; },
    get arena() { return arena; },
    remotes,
    init(opts) { getIntent = opts.getIntent; myName = opts.name || ''; onKillCb = opts.onKill || null; connect(); },
    // per sim tick: advance our own ship's predicted movement with the CURRENT tick's input
    predict,
    // per render frame: pull interpolated server state into the render buffers
    syncState,
    _pred: pred, _reconcile: reconcile,   // test hooks (tools/predtest.js)
    // per sim tick: throttle-send the current input intent to the server
    tick(dt) {
      if (!connected) return;
      sendAcc += dt;
      if (sendAcc >= 1 / SEND_HZ) {
        sendAcc = 0;
        if (getIntent) {
          seq++;
          send({ t: 'in', i: getIntent(), q: seq });
          if (pred.ready) history.set(seq, { x: pred.x, y: pred.y });   // where prediction says we are at this seq
        }
      }
    },
    sendEvolve(i) { send({ t: 'evolve', i: i | 0 }); },
    sendCommandeer() { send({ t: 'cmdr' }); },
    sendName(name) { myName = name || ''; send(Object.assign({ t: 'join', name: myName, tk: TOKEN, skin: mySkin() }, myView())); },
    sendAdmin(action) { send({ t: 'admin', a: action }); },   // dev cheats — server honors unless PULSAR_ADMIN=0
  };
})();
