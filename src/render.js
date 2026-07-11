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
  const TAU = Math.PI * 2;
  let canvas, ctx;
  let viewW = 0, viewH = 0;
  let dpr = 1;                          // device-pixel-ratio base transform (set in resize)
  const camera = { x: 0, y: 0, zoom: 1 };   // world point at screen centre + view zoom (<1 = wider)

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }

  function resize() {
    // Render at device pixel ratio for crisp neon, but cap it from the single tuning surface:
    // additive bloom is fill-rate bound, and excess supersampling must never cost the 60fps target.
    dpr = Math.min(window.devicePixelRatio || 1, cfg.sim.renderDprCap);
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

  // The WORLD pass draws under a canvas transform (centre → zoom → camera), so both positions
  // AND sizes scale by camera.zoom for free. sx/sy are therefore identity: pass world coords.
  function sx(wx) { return wx; }
  function sy(wy) { return wy; }

  // ---- frame scaffolding -----------------------------------------------------
  function beginFrame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // screen space for the background
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05060a';               // near-black, matches index.html
    ctx.fillRect(0, 0, viewW, viewH);
    // enter WORLD space: centre the camera, apply zoom (huge ships => smaller zoom => wider view)
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }
  // Leave world space — back to screen pixels for the HUD/overlays.
  function endWorld() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

  // Gravitational warp: space near the pulsar is dragged toward the singularity and swirled
  // (frame-drag). Used to bend the grid — returns SCREEN coords for a world point.
  const PWX = () => cfg.arena.width / 2, PWY = () => cfg.arena.height / 2;
  function warpR() { return cfg.arena.pulsarRadius * 4.4; }
  function warpPoint(wx, wy, time) {
    const px = PWX(), py = PWY();
    const dx = wx - px, dy = wy - py, d = Math.hypot(dx, dy), R = warpR();
    if (d > R || d < 0.5) return [sx(wx), sy(wy)];
    const f = 1 - d / R;                              // 0 at the influence edge, 1 at the core
    const swirl = f * f * (1.3 + time * 0.5);         // frame-drag — vanishes at the edge (no seam)
    const compress = 0.55 * f * f;                    // space contracts inward toward the hole
    const ca = Math.cos(swirl), sa = Math.sin(swirl), s = 1 - compress;
    const rx = (dx * ca - dy * sa) * s, ry = (dx * sa + dy * ca) * s;
    return [sx(px + rx), sy(py + ry)];
  }

  // Faint world grid so movement reads in otherwise-empty space. Drawn dim, additive. Near the
  // pulsar the grid is WARPED into the singularity (bent + swirled); elsewhere it's straight+fast.
  function drawGrid(time) {
    const step = 240;
    const hw = viewW / (2 * camera.zoom), hh = viewH / (2 * camera.zoom);   // visible world half-extents
    const lft = camera.x - hw - step, rgt = camera.x + hw + step;
    const top = camera.y - hh - step, bot = camera.y + hh + step;
    const x0 = Math.floor((camera.x - hw) / step) * step;
    const y0 = Math.floor((camera.y - hh) / step) * step;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(40,70,110,0.18)';
    ctx.lineWidth = 1 / camera.zoom;                  // keep hairline width on screen when zoomed out
    const R = warpR();
    const warpOnScreen = Math.abs(PWX() - camera.x) < hw + R && Math.abs(PWY() - camera.y) < hh + R;
    ctx.beginPath();
    if (!warpOnScreen) {
      for (let wx = x0; wx < rgt; wx += step) { ctx.moveTo(wx, top); ctx.lineTo(wx, bot); }
      for (let wy = y0; wy < bot; wy += step) { ctx.moveTo(lft, wy); ctx.lineTo(rgt, wy); }
    } else {
      const seg = step / 5;                            // subdivide so warped lines curve smoothly
      for (let wx = x0; wx < rgt; wx += step) {
        let first = true;
        for (let wy = top; wy <= bot; wy += seg) { const [X, Y] = warpPoint(wx, wy, time); first ? (ctx.moveTo(X, Y), first = false) : ctx.lineTo(X, Y); }
      }
      for (let wy = y0; wy < bot; wy += step) {
        let first = true;
        for (let wx = lft; wx <= rgt; wx += seg) { const [X, Y] = warpPoint(wx, wy, time); first ? (ctx.moveTo(X, Y), first = false) : ctx.lineTo(X, Y); }
      }
    }
    ctx.stroke();
    // Arena boundary (so you can see the edge of the field).
    ctx.strokeStyle = 'rgba(80,120,180,0.35)';
    ctx.lineWidth = 2 / camera.zoom;
    ctx.strokeRect(0, 0, cfg.arena.width, cfg.arena.height);
  }

  // The Pulsar as a BLACK HOLE: a dark event horizon rimmed by a thin photon ring and a faint
  // accretion swirl, firing intermittent bipolar RELATIVISTIC JETS of scrap along a slowly-
  // rotating axis. Jet timing/axis derive from `time` (matches the sim ⇒ MP-safe). Grid warp
  // around it is drawn in drawGrid.
  function drawPulsar(time) {
    const px = sx(cfg.arena.width / 2), py = sy(cfg.arena.height / 2);
    const R = cfg.arena.pulsarRadius, P = cfg.arena.pulsar, core = R * 0.42;
    const jetPhase = (time % P.jetIntervalSec) / P.jetIntervalSec;
    const jetFlash = Math.max(0, 1 - jetPhase * 6);    // bright flare right after a jet fires
    const jetBeam = Math.max(0, 1 - jetPhase * 2.1);   // the beams linger while motes streak out
    const jetAng = time * P.jetAxisDriftRadPerSec;
    // event horizon: a black core that occludes the warped grid behind it (source-over)
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createRadialGradient(px, py, core * 0.12, px, py, core);
    grad.addColorStop(0, '#000000'); grad.addColorStop(0.74, '#010207'); grad.addColorStop(1, 'rgba(8,13,28,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(px, py, core, 0, TAU); ctx.fill();
    // additive light around the hole
    ctx.globalCompositeOperation = 'lighter';
    // relativistic jets: two fading beams shooting out along the axis (drawn first, under the ring)
    if (jetBeam > 0.01) {
      for (const s of [0, Math.PI]) {
        const a = jetAng + s, len = R * (2.8 + 5.5 * (1 - jetBeam));   // grows as the pulse ages
        const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
        const g = ctx.createLinearGradient(px + Math.cos(a) * core, py + Math.sin(a) * core, ex, ey);
        g.addColorStop(0, `rgba(205,228,255,${0.55 * jetBeam})`); g.addColorStop(1, 'rgba(150,190,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2 + R * 0.16 * jetBeam;
        ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * core, py + Math.sin(a) * core); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    // faint accretion swirl (two dim sweeping arcs — the disk, kept subtle)
    for (let i = 0; i < 2; i++) {
      const rr = core + R * (0.10 + i * 0.16), a0 = time * (0.9 - i * 0.25) + i * 2.1;
      ctx.strokeStyle = `rgba(120,160,220,${0.22 - i * 0.07 + 0.2 * jetFlash})`;
      ctx.lineWidth = Math.max(1.5, R * (0.05 - i * 0.012));
      ctx.beginPath(); ctx.arc(px, py, rr, a0, a0 + 2.4); ctx.stroke();
    }
    // photon ring: thin hot ring hugging the horizon + a soft halo
    glow(px, py, R * 1.55, [90, 140, 220], 0.09 + 0.22 * jetFlash);
    ctx.strokeStyle = `rgba(220,235,255,${0.7 + 0.3 * jetFlash})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, core * 1.03, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    init, resize, beginFrame, endWorld, drawGrid, drawPulsar, glow, solidCircle,
    hexToRgb,
    setComposite(mode) { ctx.globalCompositeOperation = mode; },
    get ctx() { return ctx; },
    get viewW() { return viewW; },
    get viewH() { return viewH; },
    camera,
    sx, sy,
  };
})();
