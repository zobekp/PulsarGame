// PULSAR.io — NET (playground multiplayer client). LAN-grade, NOT authoritative.
// Each client owns its own ship; we broadcast a compact snapshot at SEND_HZ and route damage as
// 'hit' events (the attacker computes the hit; the victim applies it to its own HP). Remote ships
// are rendered + targetable but never simulated locally — their owner drives them.
//
// Activates only when the page is SERVED over http(s) (i.e. opened from server.js) and not ?solo.
// Opened from file:// — or served by something that isn't the relay — stays single-player.
//
// Known playground limits: neutral asteroids/pulsar are local per client (not synced); thrown
// gravitor rocks aren't visualised on other screens (their damage still lands via hit events);
// rail beams ARE relayed. Good enough to mess around and fight with friends.
window.PULSAR = window.PULSAR || {};
window.PULSAR.Net = (function () {
  const SEND_HZ = 20;
  const MULTIPLAYER = /^https?:/.test(location.protocol) && !/\bsolo\b/.test(location.search);

  let ws = null, myId = 0, connected = false, sendAcc = 0, onHit = null, onKill = null, rawBeam = null;
  const remotes = [];           // remote ship objects (rendered + targetable via allShips)
  const byId = new Map();        // netId -> remote ship
  const ghosts = [];             // render-only projectiles from other players (dead-reckoned)

  function syncCaptured(r, n) { if (r.captured.length !== n) { r.captured.length = 0; for (let i = 0; i < n; i++) r.captured.push({ type: 'asteroid', radius: 36 }); } }

  function applyState(id, s) {
    let r = byId.get(id);
    if (!r) {
      r = { isShip: true, isRemote: true, netId: id, team: id,   // unique team => FFA vs everyone
        classId: s.c, x: s.x, y: s.y, px: s.x, py: s.y, netX: s.x, netY: s.y, vx: 0, vy: 0,
        orbAngle: 0, orbSpin: 0, hitFlash: 0, cracked: false, captured: [], classStats: { speed: 1 },
        abilityCd: 0, specialCd: 0, chargeFullTimer: 0, kills: 0, xp: 0 };
      byId.set(id, r); remotes.push(r);
    }
    r.classId = s.c; r.netX = s.x; r.netY = s.y; r.aim = s.a; r.radius = s.r; r.name = s.nm || '';
    r.hp = s.hp; r.maxHp = s.mh; r.scrap = s.scr || 0; r.level = s.lvl || 1;
    r.alive = s.al !== 0; r.isLeader = !!s.ld; r.spawnProtect = s.sp ? 1 : 0;
    r.charging = !!s.cg; r.charge = s.ch || 0; r.heat = s.ht || 0; r.ventTimer = s.vt || 0;
    r.orbRadius = s.orad || 0; if (s.ox != null) { r.orbX = s.ox; r.orbY = s.oy; }
    if (s.ox2 != null) { r.orbX2 = s.ox2; r.orbY2 = s.oy2; } else { r.orbX2 = null; }
    r.ramWinding = !!s.rw; r.ramActive = s.ra ? 1 : 0; r.ramCharge = s.rc || 0;
    syncCaptured(r, s.cap || 0);
  }
  function removeRemote(id) { const r = byId.get(id); if (!r) return; byId.delete(id); const i = remotes.indexOf(r); if (i >= 0) remotes.splice(i, 1); }

  function snapshot(p) {
    return { c: p.classId, nm: p.name || '', x: Math.round(p.x), y: Math.round(p.y), a: +p.aim.toFixed(3), r: Math.round(p.radius),
      hp: Math.round(p.hp), mh: Math.round(p.maxHp), scr: Math.round(p.scrap), lvl: p.level,
      al: p.alive ? 1 : 0, ld: p.isLeader ? 1 : 0, sp: p.spawnProtect > 0 ? 1 : 0,
      cg: p.charging ? 1 : 0, ch: +p.charge.toFixed(2), ht: Math.round(p.heat), vt: +(p.ventTimer || 0).toFixed(2),
      ox: Math.round(p.orbX), oy: Math.round(p.orbY), orad: Math.round(p.orbRadius || 0),
      ox2: p.orbX2 != null ? Math.round(p.orbX2) : undefined, oy2: p.orbY2 != null ? Math.round(p.orbY2) : undefined,
      rw: p.ramWinding ? 1 : 0, ra: p.ramActive > 0 ? 1 : 0, rc: +(p.ramCharge || 0).toFixed(2),
      cap: p.captured ? p.captured.length : 0 };
  }
  function sendBeam(x1, y1, x2, y2, col, hw, life, pw) {
    if (connected) ws.send(JSON.stringify({ t: 'beam', b: { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), col, hw, life, pw } }));
  }
  function sendProjectile(pr) {
    if (connected) ws.send(JSON.stringify({ t: 'proj', p: { x: Math.round(pr.x), y: Math.round(pr.y), vx: Math.round(pr.vx), vy: Math.round(pr.vy), r: pr.radius, col: pr.color, k: pr.kind || '', rt: pr.rockType || '', life: +(pr.life || 1.5).toFixed(2) } }));
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => { connected = true; };
    ws.onclose = () => { connected = false; for (const id of [...byId.keys()]) removeRemote(id); setTimeout(connect, 1500); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'welcome') myId = m.id;
      else if (m.t === 'state') applyState(m.id, m.s);
      else if (m.t === 'leave') removeRemote(m.id);
      else if (m.t === 'hit') { if (onHit) onHit(m.dmg, { crack: m.crack }, m.from); }
      else if (m.t === 'kill') { if (onKill) onKill(m.bounty, m.vn); }
      else if (m.t === 'beam') { const b = m.b; rawBeam.call(PULSAR.Fx, b.x1, b.y1, b.x2, b.y2, b.col, b.hw, b.life, b.pw); }
      else if (m.t === 'proj') { const q = m.p; ghosts.push({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: q.r, col: q.col, kind: q.k, rockType: q.rt || 'asteroid', life: q.life }); }
    };
  }

  return {
    MULTIPLAYER, remotes, ghosts,
    get connected() { return connected; },
    get count() { return remotes.length; },
    // Called from boot. onHit(dmg, opts, killerId) applies an incoming hit; onKill(bounty) credits a kill.
    init(opts) {
      onHit = opts.onHit; onKill = opts.onKill;
      rawBeam = PULSAR.Fx.spawnBeam;                 // capture the real beam fn, then relay local beams
      PULSAR.Fx.spawnBeam = function (x1, y1, x2, y2, col, hw, life, pw) {
        rawBeam.call(PULSAR.Fx, x1, y1, x2, y2, col, hw, life, pw);
        if (connected) sendBeam(x1, y1, x2, y2, col, hw, life, pw);
      };
      connect();
    },
    // per SIM TICK: ease remotes toward latest authoritative pos, advance ghost shots, send snapshot.
    step(p, dt) {
      const k = Math.min(1, 16 * dt);
      for (const r of remotes) {
        r.px = r.x; r.py = r.y;
        r.x += (r.netX - r.x) * k; r.y += (r.netY - r.y) * k;
        if (r.hitFlash > 0) r.hitFlash -= dt;
        r.orbSpin += 2.6 * dt;
      }
      for (let i = ghosts.length - 1; i >= 0; i--) { const g = ghosts[i]; g.x += g.vx * dt; g.y += g.vy * dt; g.life -= dt; if (g.life <= 0) ghosts.splice(i, 1); }
      if (!connected) return;
      sendAcc += dt;
      if (sendAcc >= 1 / SEND_HZ) { sendAcc = 0; ws.send(JSON.stringify({ t: 'state', s: snapshot(p) })); }
    },
    sendHit(targetNetId, dmg, opts) { if (connected) ws.send(JSON.stringify({ t: 'hit', to: targetNetId, dmg, crack: !!(opts && opts.crack) })); },
    sendKill(killerNetId, bounty, victimName) { if (connected) ws.send(JSON.stringify({ t: 'kill', to: killerNetId, bounty, vn: victimName || '' })); },
    nameOf(id) { const r = byId.get(id); return r ? r.name : null; },
    sendProjectile,
  };
})();
