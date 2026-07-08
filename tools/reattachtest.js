// Headless test for the RECONNECT GRACE: drop the socket mid-run, reconnect with the same
// session token, and get the SAME ship back (level intact). A fresh token must get a new ship.
'use strict';
const net = require('net'), crypto = require('crypto');
const PORT = process.env.PORT || 8080;
let fails = 0;
const check = (n, c, i) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (i ? `  (${i})` : '')); if (!c) fails++; };

function encode(str) {
  const payload = Buffer.from(str, 'utf8'), len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) { header = Buffer.from([0x81, 0x80 | len]); }
  else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

// tiny WS client: connect, send join(+token), resolve on {welcome, ship level after a few snaps}
function session(token, actions) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(PORT, '127.0.0.1', () => {
      sock.write(`GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let handshook = false, buf = Buffer.alloc(0), myId = null, lvl = 1, snaps = 0;
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshook) {
        const idx = buf.indexOf('\r\n\r\n'); if (idx < 0) return;
        handshook = true; buf = buf.slice(idx + 4);
        sock.write(encode(JSON.stringify({ t: 'join', name: 'Reattach', tk: token })));
        if (actions.admin) for (let i = 0; i < actions.admin; i++) sock.write(encode(JSON.stringify({ t: 'admin', a: 'levelUp' })));
      }
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
        if (buf.length < off + len) break;
        const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
        let m; try { m = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
        if (m.t === 'welcome') myId = m.id;
        else if (m.t === 't') {
          snaps++;
          const me = m.sh.find(s => s.id === myId);
          if (me) lvl = me.lvl;
          if (snaps >= (actions.snaps || 10)) { sock.destroy(); resolve({ id: myId, lvl }); return; }
        }
      }
    });
    sock.on('error', reject);
    setTimeout(() => { sock.destroy(); reject(new Error('timeout')); }, 8000);
  });
}

(async () => {
  const tk = 'reattach-test-' + Math.random().toString(36).slice(2, 8);
  const a = await session(tk, { admin: 3, snaps: 12 });            // play + level up, then DROP
  check('first session got a ship + levels', a.id != null && a.lvl >= 3, `id=${a.id} lvl=${a.lvl}`);
  await new Promise(r => setTimeout(r, 800));                      // simulated blip, well inside the grace
  const b = await session(tk, { snaps: 6 });                       // reconnect, SAME token
  check('reconnect reattached the SAME ship', b.id === a.id && b.lvl >= a.lvl, `id=${b.id} lvl=${b.lvl}`);
  const c = await session('different-' + tk, { snaps: 6 });        // different token → new ship
  check('fresh token gets a NEW ship', c.id !== a.id, `id=${c.id}`);
  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
