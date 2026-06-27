// PULSAR.io — FX (transient feel: particles, beam streaks, floating text, screen shake)
// All cosmetic, but updated in the FIXED sim step so it's frame-rate independent and
// interpolated on draw like everything else. Tunables live in config.fx. The engine and
// weapons push effects here; Render never owns transient state.
window.PULSAR = window.PULSAR || {};

window.PULSAR.Fx = (function () {
  const cfg = PULSAR.config.fx;
  const particles = [];
  const beams = [];
  const texts = [];
  let shakeMag = 0, shakePhase = 0;

  function reset() { particles.length = 0; beams.length = 0; texts.length = 0; shakeMag = 0; }

  // burst of sparks from (x,y). opts: {speed, life, spread, dir, size, color}
  function spawnParticles(x, y, count, color, opts) {
    opts = opts || {};
    const speed = opts.speed != null ? opts.speed : 190;
    const life = opts.life != null ? opts.life : cfg.particleLifeSec;
    const spread = opts.spread != null ? opts.spread : Math.PI * 2;
    const dir = opts.dir || 0;
    const size = opts.size != null ? opts.size : 2.6;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + 0.6 * Math.random());
      particles.push({
        x, y, px: x, py: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life, maxLife: life, color,
        size: size * (0.7 + 0.6 * Math.random()),
      });
    }
  }

  // a hitscan beam streak that fades over `life` seconds (render only)
  function spawnBeam(x1, y1, x2, y2, color, halfWidth, life) {
    beams.push({ x1, y1, x2, y2, color, halfWidth, life, maxLife: life });
  }

  // floating combat text ("LINE BREAK", "+4")
  function spawnText(x, y, text, color, opts) {
    opts = opts || {};
    texts.push({
      x, y, text, color,
      size: opts.size || 14,
      vy: -cfg.floatTextRiseSpeed,
      life: cfg.floatTextLifeSec, maxLife: cfg.floatTextLifeSec,
    });
  }

  function addShake(mag) { shakeMag = Math.min(cfg.screenShakeMax, shakeMag + mag); }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 3 * dt); p.vy *= (1 - 3 * dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt;
      if (beams[i].life <= 0) beams.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y += t.vy * dt;
      t.life -= dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    if (shakeMag > 0) shakeMag = Math.max(0, shakeMag - cfg.screenShakeDecayPerSec * dt);
    shakePhase += dt * 47;
  }

  // camera-shake offset (deterministic, no RNG in render)
  function shakeX() { return Math.sin(shakePhase) * shakeMag; }
  function shakeY() { return Math.cos(shakePhase * 1.27) * shakeMag; }

  function draw(R, alpha, lerp) {
    const ctx = R.ctx;

    // beams + particles are additive glow
    R.setComposite('lighter');
    for (const b of beams) {
      const t = b.life / b.maxLife;                  // 1 -> 0
      const rgb = R.hexToRgb(b.color);
      const x1 = R.sx(b.x1), y1 = R.sy(b.y1), x2 = R.sx(b.x2), y2 = R.sy(b.y2);
      ctx.lineCap = 'round';
      // soft wide pass (the honest hitbox thickness)
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.35 * t})`;
      ctx.lineWidth = b.halfWidth * 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // bright thin core
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * t})`;
      ctx.lineWidth = Math.max(1.5, b.halfWidth * 0.5);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const p of particles) {
      const t = p.life / p.maxLife;
      const ix = R.sx(lerp(p.px, p.x, alpha)), iy = R.sy(lerp(p.py, p.y, alpha));
      R.glow(ix, iy, p.size * 2.4, R.hexToRgb(p.color), 0.6 * t);
      R.solidCircle(ix, iy, p.size * 0.6 * t, '#ffffff');
    }

    // text is crisp, on top
    R.setComposite('source-over');
    ctx.textAlign = 'center';
    for (const tx of texts) {
      const t = tx.life / tx.maxLife;
      const rgb = R.hexToRgb(tx.color);
      ctx.font = `700 ${tx.size}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(1, t * 1.6)})`;
      ctx.fillText(tx.text, R.sx(tx.x), R.sy(tx.y));
    }
    ctx.textAlign = 'left';
  }

  return { reset, spawnParticles, spawnBeam, spawnText, addShake, update, draw, shakeX, shakeY };
})();
