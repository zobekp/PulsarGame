// PULSAR.io — PLAYGROUND SERVER (zero-dependency, LAN-grade)
// Serves the game over HTTP *and* relays player state over WebSocket (RFC6455, text frames).
// Quick co-op/PvP: run `node server.js`, share your LAN IP, friends open http://<ip>:8080
//
// This is NOT authoritative and has no anti-cheat — each client owns its own ship and the
// server just relays. Perfect for messing around with friends; not built for scale.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };

// ---- static file server (so friends just open the URL — no separate web server) ----
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.end(data);
  });
});

// ---- minimal WebSocket (RFC6455) — handshake + text-frame relay ----
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let nextId = 1;
const clients = new Map(); // id -> socket

function send(sock, obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const len = json.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  try { sock.write(Buffer.concat([header, json])); } catch (e) { /* socket gone */ }
}
function broadcast(obj, exceptId) {
  for (const [id, sock] of clients) if (id !== exceptId) send(sock, obj);
}
function handle(id, msg) {
  if (msg.t === 'state') broadcast({ t: 'state', id, s: msg.s }, id);          // ship snapshot -> everyone else
  else if (msg.t === 'beam') broadcast({ t: 'beam', id, b: msg.b }, id);        // beam VFX -> everyone else
  else if (msg.t === 'proj') broadcast({ t: 'proj', id, p: msg.p }, id);        // projectile spawn -> everyone else
  else if (msg.t === 'hit') { const target = clients.get(msg.to); if (target) send(target, { t: 'hit', from: id, dmg: msg.dmg, crack: msg.crack }); } // damage -> the victim only
  else if (msg.t === 'kill') { const target = clients.get(msg.to); if (target) send(target, { t: 'kill', bounty: msg.bounty }); } // kill credit -> the killer only
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
    'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  const id = nextId++;
  clients.set(id, socket);
  send(socket, { t: 'welcome', id });
  console.log(`+ player ${id} joined (now ${clients.size})`);

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (true) {                                   // parse every complete frame the buffer holds
      if (buf.length < 2) break;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, offset = 2;
      if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); offset = 4; }
      else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); offset = 10; } // ignore >4GB
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) break;
      const opcode = buf[0] & 0x0f;
      let payload = buf.slice(offset + maskLen, offset + maskLen + len);
      if (masked) { const m = buf.slice(offset, offset + 4); const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      buf = buf.slice(offset + maskLen + len);
      if (opcode === 0x8) { socket.end(); return; }  // close
      if (opcode === 0x9 || opcode === 0xA) continue; // ping/pong — ignore
      if (opcode !== 0x1) continue;                   // only text frames
      let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
      handle(id, msg);
    }
  });
  function cleanup() { if (clients.delete(id)) { broadcast({ t: 'leave', id }); console.log(`- player ${id} left (now ${clients.size})`); } }
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

server.listen(PORT, () => {
  console.log(`\n  PULSAR playground running:`);
  console.log(`    you:      http://localhost:${PORT}`);
  console.log(`    friends:  http://<your-LAN-IP>:${PORT}   (find it with \`ipconfig\` / \`ifconfig\`)\n`);
});
