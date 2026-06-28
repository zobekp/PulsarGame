// PULSAR.io — RENDER (additive-bloom pipeline on black)
// Neon-on-black, procedural, no sprites. The look is built from two passes:
//   1) BLOOM pass  — soft radial gradients drawn with 'lighter' (additive) compositing,
//      so overlapping light sums toward white the way real glow does.
//   2) CORE pass   — crisp bright centres drawn normally on top.
// Readability rules with gameplay stakes live in config.readability; this module obeys
// them (your ship = brightest + white core; bloom radius == hitbox for honest VFX).
window.PULSAR = window.PULSAR || {};

window.PULSAR.Render = (function () {
  const cfg = PULSAR.config;
  let canvas, ctx;
  let viewW = 0, viewH = 0;
  const camera = { x: 0, y: 0 };       // world point at screen centre

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }

  function resize() {
    // Render at device pixel ratio for crisp neon, but cap it: on a retina screen DPR 2 means
    // 4× the pixels to fill, and additive bloom is fill-rate bound — capping keeps 60fps.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    viewW = innerWidth; viewH = innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- colour helpers --------------------------------------------------------
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // ---- additive bloom primitive ---------------------------------------------
  // Draw a soft glow of given radius. The bright inner ~half is the "true" extent —
  // for projectiles we pass radius == hitbox so the glow you see IS the collision area.
  //
  // Performance: a fresh createRadialGradient + fill PER glow per frame rasterizes on the
  // CPU and tanks Chrome (Firefox's gradient path is faster — that's the 30-vs-60 split).
  // Instead bake one glow sprite per colour ONCE, then drawImage it (GPU-accelerated, cheap).
  // The sprite holds the gradient at intensity 1.0; globalAlpha multiplies source alpha
  // uniformly, so drawing with globalAlpha=intensity is pixel-identical to the old gradient.
  const GLOW_R = 80;                          // reference sprite radius (px); soft glow upscales cleanly
  const glowCache = new Map();                // colour key -> offscreen canvas
  function glowSprite(rgb) {
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let spr = glowCache.get(key);
    if (spr) return spr;
    spr = document.createElement('canvas');
    spr.width = spr.height = GLOW_R * 2;
    const s = spr.getContext('2d');
    const g = s.createRadialGradient(GLOW_R, GLOW_R, 0, GLOW_R, GLOW_R, GLOW_R);
    const [r, gg, b] = rgb;
    g.addColorStop(0.0, `rgba(${r},${gg},${b},1)`);
    g.addColorStop(0.45, `rgba(${r},${gg},${b},0.35)`);
    g.addColorStop(1.0, `rgba(${r},${gg},${b},0)`);
    s.fillStyle = g;
    s.fillRect(0, 0, GLOW_R * 2, GLOW_R * 2);
    glowCache.set(key, spr);
    return spr;
  }
  function glow(sx, sy, radius, rgb, intensity) {
    ctx.globalAlpha = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    ctx.drawImage(glowSprite(rgb), sx - radius, sy - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function solidCircle(sx, sy, radius, style) {
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // world -> screen (camera centred on the view)
  function sx(wx) { return wx - camera.x + viewW / 2; }
  function sy(wy) { return wy - camera.y + viewH / 2; }

  // ---- frame scaffolding -----------------------------------------------------
  function beginFrame() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060a';               // near-black, matches index.html
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // Faint world grid so movement reads in otherwise-empty space. Drawn dim, additive.
  function drawGrid() {
    const step = 240;
    const x0 = Math.floor((camera.x - viewW / 2) / step) * step;
    const y0 = Math.floor((camera.y - viewH / 2) / step) * step;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(40,70,110,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let wx = x0; wx < camera.x + viewW / 2 + step; wx += step) {
      ctx.moveTo(sx(wx), 0); ctx.lineTo(sx(wx), viewH);
    }
    for (let wy = y0; wy < camera.y + viewH / 2 + step; wy += step) {
      ctx.moveTo(0, sy(wy)); ctx.lineTo(viewW, sy(wy));
    }
    ctx.stroke();
    // Arena boundary (so you can see the edge of the 6000² field).
    ctx.strokeStyle = 'rgba(80,120,180,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(0), sy(0), cfg.arena.width, cfg.arena.height);
  }

  // Decorative pulsar landmark at map centre. VISUAL ONLY in Phase 0 — the functional
  // honeypot (pulse rhythm, motes, bounty draw) is Phase 2. Kept as an orientation anchor.
  function drawPulsar(time) {
    const px = cfg.arena.width / 2, py = cfg.arena.height / 2;
    const pulse = 0.5 + 0.5 * Math.sin(time * (Math.PI * 2) / cfg.arena.pulsarPulseIntervalSec);
    const rgb = [200, 225, 255];
    ctx.globalCompositeOperation = 'lighter';
    glow(sx(px), sy(py), cfg.arena.pulsarRadius * (1.4 + 0.25 * pulse), rgb, 0.18 + 0.10 * pulse);
    glow(sx(px), sy(py), cfg.arena.pulsarRadius * 0.5, rgb, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    solidCircle(sx(px), sy(py), 10, 'rgba(255,255,255,0.95)');
  }

  return {
    init, resize, beginFrame, drawGrid, drawPulsar, glow, solidCircle,
    hexToRgb,
    setComposite(mode) { ctx.globalCompositeOperation = mode; },
    get ctx() { return ctx; },
    get viewW() { return viewW; },
    get viewH() { return viewH; },
    camera,
    sx, sy,
  };
})();
