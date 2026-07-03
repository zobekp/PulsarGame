// Headless raw-WS probe for mpserver.js — verifies join + intent + extended snapshot.
// No deps: hand-rolls the client handshake + frame masking. Node 18 (no global WebSocket).
'use strict';
const net = require('net'), crypto = require('crypto');
const PORT = process.env.PORT || 8090;

function encode(str) {                       // client→server frames MUST be masked
  const payload = Buffer.from(str, 'utf8'), len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

const key = crypto.randomBytes(16).toString('base64');
const sock = net.connect(PORT, '127.0.0.1', () => {
  sock.write(`GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
});

let handshook = false, buf = Buffer.alloc(0), snaps = 0, myId = null, firstX = null, moved = false;
let sentSeq = 0, lastAck = null;
sock.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (!handshook) {
    const idx = buf.indexOf('\r\n\r\n');
    if (idx < 0) return;
    handshook = true; buf = buf.slice(idx + 4);
    sock.write(encode(JSON.stringify({ t: 'join', name: 'Probe' })));
    sock.write(encode(JSON.stringify({ t: 'in', i: { moveX: 1, moveY: 0, aim: 0, aimDist: 500, firing: true, ability: false, special: false }, q: ++sentSeq })));
  }
  // decode server frames (unmasked)
  while (buf.length >= 2) {
    let len = buf[1] & 0x7f, off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
    if (buf.length < off + len) break;
    const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
    let m; try { m = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
    if (m.t === 'welcome') { myId = m.id; console.log('welcome id=', myId, 'arena=', JSON.stringify(m.arena)); }
    else if (m.t === 't') {
      snaps++;
      if (m.aq && m.aq[myId] != null) lastAck = m.aq[myId];
      // keep sending intent so the ship keeps moving
      sock.write(encode(JSON.stringify({ t: 'in', i: { moveX: 1, moveY: 0, aim: 0, aimDist: 500, firing: true }, q: ++sentSeq })));
      const me = m.sh.find(s => s.id === myId);
      if (me) {
        if (firstX == null) { firstX = me.x; console.log('first snapshot: ships=', m.sh.length, 'proj=', m.pr.length, 'motes=', m.mo.length, 'hasObjects=', !!m.ob); }
        if (me.x - firstX > 5) moved = true;
      }
      if (snaps === 1 && me) {
        const keys = Object.keys(me).sort().join(',');
        console.log('my ship keys:', keys);
        const need = ['nm','xp','br','bt','bp','oss','oss2','os','fp','sf','ox2','oy2','vx','vy','ix','iy'];
        const missing = need.filter(k => !(k in me));
        console.log('extended-field check:', missing.length ? 'MISSING ' + missing.join(',') : 'ALL PRESENT');
        console.log('sample:', JSON.stringify({ id: me.id, nm: me.nm, c: me.c, hp: me.hp, x: me.x, y: me.y, al: me.al }));
      }
      if (snaps >= 30) {
        const ackOk = lastAck != null && lastAck > 0 && lastAck <= sentSeq;
        console.log(`ack check: lastAck=${lastAck} sentSeq=${sentSeq} → ${ackOk ? 'OK' : 'FAIL'}`);
        console.log(`RESULT: received ${snaps} snapshots; my ship moved under intent = ${moved}`);
        sock.end(); process.exit(ackOk && moved ? 0 : 1);
      }
    }
  }
});
sock.on('error', (e) => { console.error('probe error:', e.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT — no result'); process.exit(1); }, 8000);
