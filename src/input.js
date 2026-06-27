// PULSAR.io — INPUT (keyboard + mouse state)
// Thin polling layer: listeners just record state; the fixed-timestep sim READS this
// state each tick. No game logic here. Mouse is tracked in screen space; the sim
// converts to an aim angle relative to the (screen-centred) ship.
window.PULSAR = window.PULSAR || {};

window.PULSAR.Input = (function () {
  const keys = Object.create(null);   // physical code -> bool
  let mouseX = 0, mouseY = 0;
  let firing = false;                 // primary mouse button held

  // keys we own — stop the page from scrolling / button-activating on them
  const OWNED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  function attach(target) {
    addEventListener('keydown', (e) => { keys[e.code] = true; if (OWNED.has(e.code)) e.preventDefault(); });
    addEventListener('keyup',   (e) => { keys[e.code] = false; });
    // Drop held keys if focus leaves the window (avoids "stuck thrust").
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; });

    target.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
    target.addEventListener('mousedown', (e) => { if (e.button === 0) firing = true; });
    addEventListener('mouseup',   (e) => { if (e.button === 0) firing = false; });
    // Prevent the right-click menu so aiming/holding feels native later.
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // WASD -> normalised movement direction (length 0 or 1).
  function moveDir() {
    let x = 0, y = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    y -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  y += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) x += 1;
    if (x || y) { const m = Math.hypot(x, y); x /= m; y /= m; }
    return { x, y };
  }

  return {
    attach, moveDir,
    key(code) { return !!keys[code]; },   // raw key state (engine detects edges)
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get firing() { return firing; },
  };
})();
