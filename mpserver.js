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
require('./src/weapons.js'); require('./src/bots.js'); require('./src/sim.js');

const cfg = global.PULSAR.config;
const TICK = 1 / 30;                 // authoritative sim step
const SNAP_HZ = 20;                  // snapshots per second
const OBJ_EVERY = 10;                // send the (mostly static) asteroid field every Nth snapshot

// FX recorder — the sim emits cosmetic events; we forward them to clients to replay.
let fxEvents = [];
const fx = {
  spawnParticles(x, y, n, color, o) { fxEvents.push(['p', Math.round(x), Math.round(y), n, color, o || 0]); },
  spawnBeam(x1, y1, x2, y2, col, hw, life, pw) { fxEvents.push(['b', Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), col, hw, life, pw || 0]); },
  spawnText(x, y, text, color, o) { fxEvents.push(['t', Math.round(x), Math.round(y), text, color, (o && o.size) || 14]); },
  addShake(mag, shipId) { fxEvents.push(['s', mag, shipId || 0]); },   // client shakes only for its own ship
  update() {},
};

const world = global.PULSAR.createWorld({ fx });
world.spawnBots(cfg.bots.count);     // bots fill the world until/with players; tune as desired

// ---- snapshots ----
function shipSnap(s) {
  return { id: s.id, c: s.classId, x: Math.round(s.x), y: Math.round(s.y), a: +s.aim.toFixed(3), r: Math.round(s.radius),
    hp: Math.round(s.hp), mh: Math.round(s.maxHp), scr: Math.round(s.scrap), lvl: s.level, k: s.kills || 0, team: s.team,
    al: s.alive ? 1 : 0, ld: s.isLeader ? 1 : 0, sp: s.spawnProtect > 0 ? 1 : 0, hf: s.hitFlash > 0 ? 1 : 0,
    cg: s.charging ? 1 : 0, ch: +s.charge.toFixed(2), cft: +(s.chargeFullTimer || 0).toFixed(2), ht: Math.round(s.heat), vt: +(s.ventTimer || 0).toFixed(2),
    ox: Math.round(s.orbX || s.x), oy: Math.round(s.orbY || s.y), orad: Math.round(s.orbRadius || 0), oa: +(s.orbAngle || 0).toFixed(2), osp: +(s.orbSpin || 0).toFixed(2),
    rw: s.ramWinding ? 1 : 0, ra: s.ramActive > 0 ? 1 : 0, rc: +(s.ramCharge || 0).toFixed(2), cap: s.captured ? s.captured.length : 0 };
}
let snapN = 0;
function snapshot() {
  const st = world.state;
  const snap = { t: 't', tm: +st.time.toFixed(2), pt: +st.pulsarTimer.toFixed(2),
    sh: st.ships.map(shipSnap),
    pr: st.projectiles.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), r: p.radius, c: p.color, k: p.kind || '' })),
    mo: st.motes.map(m => ({ x: Math.round(m.x), y: Math.round(m.y), p: m.pulsar ? 1 : 0 })),
    ev: fxEvents };
  if (snapN % OBJ_EVERY === 0) snap.ob = st.objects.map(o => ({ t: o.type, x: Math.round(o.x), y: Math.round(o.y), r: o.radius, cr: o.cracked ? 1 : 0, fl: o.flash > 0 ? 1 : 0, sp: +o.spin.toFixed(2) }));
  snapN++;
  fxEvents = [];
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
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]); if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => { if (err) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' }); res.end(data); });
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']; if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  const ship = world.addShip({ isBot: false, classId: 'starter' });
  clients.set(socket, { shipId: ship.id });
  wsSend(socket, { t: 'welcome', id: ship.id, arena: { w: cfg.arena.width, h: cfg.arena.height } });
  console.log(`+ player ship ${ship.id} (now ${clients.size})`);

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
      if (msg.t === 'in') { const c = clients.get(socket); if (c) world.setIntent(c.shipId, msg.i); }       // INPUT INTENT
      else if (msg.t === 'evolve') { const c = clients.get(socket); if (c) world.chooseEvolution(world.getShip(c.shipId), msg.i | 0); }
    }
  });
  function cleanup() { const c = clients.get(socket); if (c) { world.removeShip(c.shipId); clients.delete(socket); console.log(`- player ship ${c.shipId} (now ${clients.size})`); } }
  socket.on('close', cleanup); socket.on('error', cleanup);
});

// ---- fixed-tick authority loop ----
let acc = 0, last = Date.now(), snapAcc = 0;
setInterval(() => {
  const now = Date.now(); let frame = (now - last) / 1000; last = now;
  if (frame > 0.25) frame = 0.25; acc += frame;
  while (acc >= TICK) { world.step(TICK); acc -= TICK; }
  snapAcc += frame;
  if (snapAcc >= 1 / SNAP_HZ) { snapAcc = 0; if (clients.size) broadcast(snapshot()); }
}, 1000 / 60);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`\n  PULSAR authoritative server on http://localhost:${PORT}`);
  console.log(`  friends: http://<your-LAN-IP>:${PORT}\n`);
});
