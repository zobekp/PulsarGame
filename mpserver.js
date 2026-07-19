// PULSAR.io — AUTHORITATIVE SERVER (Phase 5). Zero-dependency.
// Runs the REAL simulation (src/sim.js) headlessly at a fixed tick, owns the whole world, and
// broadcasts snapshots. Clients send only INPUT INTENT and render what they're told — no client
// sim, no trusting clients. This is the cheat-resistant shared-world path that supersedes the relay.
//
//   node mpserver.js          # serves the game on http://<ip>:8080 AND runs the authority
//
// Step 1 status: server + snapshots verified headlessly. The thin client that renders these
// snapshots is wired in Step 2 (index.html switches from the relay to this).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- load the sim headlessly (shim the browser globals the modules expect) ----
global.window = global;
require('./data/config.js'); require('./data/classes.js'); require('./data/farming.js'); require('./data/visuals.js');
require('./data/cosmetics.js');   // skin catalog: validates client-sent skin ids + lets bots wear liveries
require('./src/weapons.js'); require('./src/bots.js'); require('./src/sim.js');

const cfg = global.PULSAR.config;
const TICK = 1 / 60;                 // authoritative sim step (matches SP's 60Hz — same tuned feel)
// PUBLIC MODE (PULSAR_PUBLIC=1): serve the minified dist/ build (no comments, mangled names —
// run `node tools/build-dist.js` first) and refuse admin cheats. Dev default: readable source +
// cheats on. PULSAR_ADMIN=0 disables cheats independently.
const PUBLIC = process.env.PULSAR_PUBLIC === '1';
const ALLOW_ADMIN = !PUBLIC && process.env.PULSAR_ADMIN !== '0';
// Snapshot rate: 60Hz everywhere by default — after interest-management culling the bandwidth
// is fine (~1.7Mbps/client worst case), and 30Hz measurably added input-feedback latency
// (playtested: "so laggy"). Clients read the rate from the welcome message either way;
// PULSAR_SNAP_HZ overrides if a constrained host ever needs it.
const SNAP_HZ = +process.env.PULSAR_SNAP_HZ || 60;
const OBJ_SLICES = 6;                // object field is split by id into N slices, one slice per snapshot —
                                     // every object still refreshes at SNAP_HZ/N, but the bytes spread
                                     // evenly instead of bursting a fat frame every Nth snapshot

// FX recorder — the sim emits cosmetic events; we forward them to clients to replay.
let fxEvents = [];
const fx = {
  spawnParticles(x, y, n, color, o) { fxEvents.push(['p', Math.round(x), Math.round(y), n, color, o || 0]); },
  spawnBeam(x1, y1, x2, y2, col, hw, life, pw) { fxEvents.push(['b', Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), col, hw, life, pw || 0]); },
  spawnText(x, y, text, color, o) { fxEvents.push(['t', Math.round(x), Math.round(y), text, color, (o && o.size) || 14]); },
  addShake(mag, shipId) { fxEvents.push(['s', mag, shipId || 0]); },   // client shakes only for its own ship
  update() {},
};

const world = global.PULSAR.createWorld({
  fx,
  // Kill events → killfeed on every client. Names: player-set name, else the class name.
  onKill(v, killer) {
    const nm = (s) => s ? (s.name || (global.PULSAR.classes[s.classId] || {}).displayName || 'Ship') : null;
    broadcast({ t: 'kill', kn: killer && killer !== v ? nm(killer) : null, vn: nm(v), ld: v.isLeader ? 1 : 0 });
  },
});
world.spawnBots(cfg.bots.count);     // bots fill the world until/with players; tune as desired

// ---- snapshots ----
function shipSnap(s) {
  return { id: s.id, c: s.classId, nm: s.name || '', sk: s.skin || '', bt: s.isBot ? 1 : 0, x: Math.round(s.x), y: Math.round(s.y), a: +s.aim.toFixed(3), r: Math.round(s.radius),
    vx: Math.round(s.vx || 0), vy: Math.round(s.vy || 0), ix: Math.round(s.impX || 0), iy: Math.round(s.impY || 0),
    hp: Math.round(s.hp), mh: Math.round(s.maxHp), scr: Math.round(s.scrap), xp: Math.round(s.xp || 0), lvl: s.level, k: s.kills || 0, team: s.team,
    al: s.alive ? 1 : 0, ld: s.isLeader ? 1 : 0, sp: s.spawnProtect > 0 ? 1 : 0, hf: s.hitFlash > 0 ? 1 : 0, pl: s.plane || 0,
    shd: Math.round(s.shield || 0), shm: Math.round(s.shieldMax || 0), shf: s.shieldFlash > 0 ? 1 : 0,
    cg: s.charging ? 1 : 0, ch: +s.charge.toFixed(2), cft: +(s.chargeFullTimer || 0).toFixed(2), ht: Math.round(s.heat), vt: +(s.ventTimer || 0).toFixed(2),
    br: +(s.beamRamp || 0).toFixed(2), bt: s.beamTimer > 0 ? 1 : 0, bp: +(s.beamPower || 0).toFixed(2),
    ox: Math.round(s.orbX || s.x), oy: Math.round(s.orbY || s.y), orad: Math.round(s.orbRadius || 0), oa: +(s.orbAngle || 0).toFixed(2), osp: +(s.orbSpin || 0).toFixed(2),
    oss: +(s.orbSelfSpin || 0).toFixed(2), os: s.orbState || 'trail', fp: +(s.flingPower || 0).toFixed(2), sf: +(s.spinFrac || 0).toFixed(2),
    ox2: s.orbX2 != null ? Math.round(s.orbX2) : null, oy2: s.orbX2 != null ? Math.round(s.orbY2) : null, oss2: +(s.orbSelfSpin2 || 0).toFixed(2),
    rw: s.ramWinding ? 1 : 0, ra: s.ramActive > 0 ? 1 : 0, rc: +(s.ramCharge || 0).toFixed(2), cap: s.captured ? s.captured.length : 0 };
}
// Ships beyond view range only need what the minimap + leaderboard read — a third of the bytes.
// (Missing combat fields default safely to 0/false client-side.)
function shipSnapFar(s) {
  return { id: s.id, c: s.classId, nm: s.name || '', bt: s.isBot ? 1 : 0, team: s.team,
    x: Math.round(s.x), y: Math.round(s.y), a: +s.aim.toFixed(2), r: Math.round(s.radius),
    al: s.alive ? 1 : 0, ld: s.isLeader ? 1 : 0, scr: Math.round(s.scrap), pl: s.plane || 0 };
}
let snapN = 0, nextNid = 1;          // entity ids let the client interpolate between snapshots
const nid = (e) => e._nid || (e._nid = nextNid++);
// INTEREST MANAGEMENT — the arena is 6000² but a client sees ~1100px. Each client gets a
// PERSONAL snapshot: all ships (minimap) + all titans (landmarks), but projectiles/motes/fx/
// objects only within a box around their own ship. Cuts bandwidth ~10x, which is the difference
// between LAN-only and playable-over-the-internet.
const CULL = 1400, CULL_FX = 1600, CULL_OBJ = 1500;
const near = (x, y, s, r) => !s || (Math.abs(x - s.x) < r && Math.abs(y - s.y) < r);
// Interest boxes must COVER WHAT THE CLIENT SEES. The camera zooms out with hull size
// (cfg.view: zoom = clamp(shipTargetPx/radius)), so a Titan's visible half-extent is
// viewport/(2*zoom) — up to ~2600px+ on a big monitor, past the fixed 1400-1600 boxes. That made
// rocks/fx/ship-state pop in and out of existence in plain view, snapshot-quantized: the
// Titan-plane "strobe". Scale each client's culls to their reported viewport + their ship's zoom
// (floor = the legacy constants, so clients that sent no viewport behave exactly as before).
function cullFor(c, me) {
  if (!me || !(c.vw > 0)) return { ship: CULL, fx: CULL_FX, obj: CULL_OBJ };
  const V = cfg.view;
  const zoom = Math.max(V.minZoom, Math.min(V.baseZoom, V.shipTargetPx / (me.radius || cfg.player.baseRadius)));
  const half = Math.max(c.vw, c.vh || 0) / (2 * zoom);            // worst-axis visible half-extent (world px)
  const cap = 4200;                                                // sanity ceiling (dreadnought on a cinema display)
  return {
    ship: Math.min(cap, Math.max(CULL, half + 200)),
    fx: Math.min(cap, Math.max(CULL_FX, half + 300)),
    obj: Math.min(cap, Math.max(CULL_OBJ, half + 250)),
  };
}
function snapshotFor(c) {
  const st = world.state;
  const me = world.getShip(c.shipId);
  const cull = cullFor(c, me);
  const snap = { t: 't', tm: +st.time.toFixed(3), pt: +st.pulsarTimer.toFixed(3), ack: c.lastSeq || 0,
    sh: st.ships.map(s => (s.id === c.shipId || near(s.x, s.y, me, cull.ship)) ? shipSnap(s) : shipSnapFar(s)),
    pr: [], mo: [], ev: [] };
  for (const p of st.projectiles) if (near(p.x, p.y, me, cull.ship))
    snap.pr.push({ id: nid(p), x: Math.round(p.x), y: Math.round(p.y), r: p.radius, c: p.color, k: p.kind || '', rt: p.rockType || '', pl: p.plane || 0 });
  for (const m of st.motes) if (near(m.x, m.y, me, cull.ship))
    snap.mo.push({ id: nid(m), x: Math.round(m.x), y: Math.round(m.y), p: m.pulsar ? 1 : 0 });
  for (const e of fxEvents) {
    if (e[0] === 's') { if (e[2] === c.shipId) snap.ev.push(e); }                    // your shake only
    else if (near(e[1], e[2], me, cull.fx) || (e[0] === 'b' && near(e[3], e[4], me, cull.fx))) snap.ev.push(e);
  }
  // one object SLICE per snapshot (ids where id % OBJ_SLICES === obi) — client merges by id
  // and prunes stale ids per-slice, so destroyed/out-of-range objects still disappear
  snap.obi = snapN % OBJ_SLICES; snap.obn = OBJ_SLICES; snap.ob = [];
  for (const o of st.objects) {
    const id = nid(o);
    if (id % OBJ_SLICES !== snap.obi) continue;
    if (o.type === 'titan' || near(o.x, o.y, me, cull.obj))
      snap.ob.push({ id, t: o.type, x: Math.round(o.x), y: Math.round(o.y), r: o.radius, h: +(o.hp / o.maxHp).toFixed(2), cr: o.cracked ? 1 : 0, fl: o.flash > 0 ? 1 : 0, sp: +o.spin.toFixed(2), sr: +o.spinRate.toFixed(3) });
  }
  return snap;
}

// ---- minimal WebSocket (shared with the relay; see server.js for notes) ----
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Map();           // socket -> { shipId }
function wsSend(sock, obj) {
  const json = Buffer.from(JSON.stringify(obj)), len = json.length; let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  try { sock.write(Buffer.concat([header, json])); } catch (e) {}
}
function broadcast(obj) { for (const sock of clients.keys()) wsSend(sock, obj); }

// ---- static file server ----
// Serves ONLY what the game client needs — never docs/, tools/, .git/, or this file.
// In public mode the root is the minified dist/ build.
const ROOT = PUBLIC ? path.join(__dirname, 'dist') : __dirname;
if (PUBLIC && !fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('PULSAR_PUBLIC=1 but dist/ is missing — run: node tools/build-dist.js');
  process.exit(1);
}
const SERVABLE = /^\/(index\.html|(data|src)\/[\w.-]+\.js)$/;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]); if (urlPath === '/') urlPath = '/index.html';
  if (!SERVABLE.test(urlPath)) { res.writeHead(404); return res.end('not found'); }
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[path.extname(filePath)] || 'application/octet-stream';
    // Tell the client it's talking to the AUTHORITATIVE server (not the relay) so it loads the
    // thin-client path instead of net.js. Injected as an early global before any engine script runs.
    if (path.basename(filePath) === 'index.html') {
      data = Buffer.from(data.toString('utf8').replace('<head>', '<head>\n<script>window.__PULSAR_AUTH__=true;</script>'));
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache, no-store, must-revalidate' }); res.end(data);
  });
});

// RECONNECT GRACE: a dropped socket (tunnels blip!) parks its ship for 30s keyed by the client's
// session token; rejoining with the same token reattaches the SAME ship — no progress loss
// ("I randomly disappeared" = a WS blip silently handing the player a fresh Scout).
const pendingReattach = new Map();   // token -> { shipId, timer }
const REATTACH_GRACE_MS = 30000;
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']; if (!key) { socket.destroy(); return; }
  socket.setNoDelay(true);   // game traffic: never let Nagle buffer small frames (adds 40-200ms off-LAN)
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  // ship is created (or reattached) when the client's `join` arrives, carrying the session token
  clients.set(socket, { shipId: null, lastSeq: 0, token: null });

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {
      if (buf.length < 2) break;
      const masked = (buf[1] & 0x80) !== 0; let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
      const mlen = masked ? 4 : 0; if (buf.length < off + mlen + len) break;
      const opcode = buf[0] & 0x0f; let payload = buf.slice(off + mlen, off + mlen + len);
      if (masked) { const m = buf.slice(off, off + 4); const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      buf = buf.slice(off + mlen + len);
      if (opcode === 0x8) { socket.end(); return; }
      if (opcode !== 0x1) continue;
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
      if (msg.t === 'in') { const c = clients.get(socket); if (c) { world.setIntent(c.shipId, msg.i); if (msg.q != null) c.lastSeq = msg.q >>> 0; } }   // INPUT INTENT (+ prediction seq)
      else if (msg.t === 'evolve') { const c = clients.get(socket); if (c && c.shipId != null) world.chooseEvolution(world.getShip(c.shipId), msg.i | 0); }
      else if (msg.t === 'join') {
        const c = clients.get(socket); if (!c) continue;
        if (c.shipId == null) {                                    // first join on this socket: create or reattach
          const tk = typeof msg.tk === 'string' ? msg.tk.slice(0, 32) : null;
          const pend = tk && pendingReattach.get(tk);
          if (pend && world.getShip(pend.shipId)) {                // same session back within the grace window
            clearTimeout(pend.timer); pendingReattach.delete(tk);
            c.shipId = pend.shipId;
            console.log(`~ player ship ${c.shipId} reattached (now ${clients.size})`);
          } else {
            c.shipId = world.addShip({ isBot: false, classId: 'starter' }).id;
            console.log(`+ player ship ${c.shipId} (now ${clients.size})`);
          }
          c.token = tk;
          wsSend(socket, { t: 'welcome', id: c.shipId, hz: SNAP_HZ, arena: { w: cfg.arena.width, h: cfg.arena.height } });
        }
        const sh = world.getShip(c.shipId);
        if (sh) {
          sh.name = String(msg.name || '').slice(0, 16);
          // Cosmetic livery: accept only ids that exist in the catalog (no client trust).
          const skid = String(msg.skin || '').slice(0, 24);
          sh.skin = (skid && global.PULSAR.cosmetics && global.PULSAR.cosmetics.skins.some(k => k.id === skid)) ? skid : null;
        }
        // Viewport (CSS px, clamped): sizes this client's interest-culling box to what they can
        // actually SEE once zoom-out is applied (see cullFor). Absent/garbage -> legacy constants.
        c.vw = Math.max(0, Math.min(3840, msg.vw | 0));
        c.vh = Math.max(0, Math.min(2400, msg.vh | 0));
      }
      else if (msg.t === 'admin' && ALLOW_ADMIN) {   // dev panel cheats, applied by the authority
        const c = clients.get(socket); if (!c) continue;
        const sh = world.getShip(c.shipId);
        if (msg.a === 'levelUp' && sh && sh.alive)
          world.earn(sh, Math.max(world.xpForLevel(sh.level + 1) - sh.xp + 1, cfg.economy.evolutionCosts.class));
        else if (msg.a === 'bots') { if (world.countBots()) world.clearBots(); else world.spawnBots(cfg.bots.count); }
      }
    }
  });
  function cleanup() {
    const c = clients.get(socket); if (!c) return;
    clients.delete(socket);
    if (c.shipId == null) return;
    if (c.token) {                                   // park the ship for the reattach grace window
      const old = pendingReattach.get(c.token); if (old) clearTimeout(old.timer);
      const shipId = c.shipId, token = c.token;
      const timer = setTimeout(() => { pendingReattach.delete(token); world.removeShip(shipId); console.log(`- player ship ${shipId} expired (grace over)`); }, REATTACH_GRACE_MS);
      pendingReattach.set(token, { shipId, timer });
      console.log(`- player ship ${shipId} detached (${REATTACH_GRACE_MS / 1000}s grace, now ${clients.size})`);
    } else {
      world.removeShip(c.shipId);
      console.log(`- player ship ${c.shipId} (now ${clients.size})`);
    }
  }
  socket.on('close', cleanup); socket.on('error', cleanup);
});

// ---- fixed-tick authority loop ----
let acc = 0, last = Date.now(), snapAcc = 0;
setInterval(() => {
  const now = Date.now(); let frame = (now - last) / 1000; last = now;
  if (frame > 0.25) frame = 0.25; acc += frame;
  while (acc >= TICK) { world.step(TICK); acc -= TICK; }
  snapAcc += frame;
  if (snapAcc >= 1 / SNAP_HZ) {
    snapAcc = 0;
    for (const [sock, c] of clients) if (c.shipId != null) wsSend(sock, snapshotFor(c));   // personal culled snapshots
    snapN++;
    fxEvents = [];   // always drain — with zero clients these used to accumulate forever
  }
}, 1000 / 60);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n  PULSAR authoritative server on http://localhost:${PORT}`);
  console.log(`  friends: http://<your-LAN-IP>:${PORT}\n`);
});
