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
  // Plane attribution: newly-spawned fx are stamped with the current plane so the Titan plane and
  // the normal arena don't leak each other's beams/sparks/text. -1 = environmental (seen on all planes).
  let stamp = -1;
  function stampPlane(pl) { stamp = pl == null ? -1 : (pl | 0); }

  function reset() { particles.length = 0; beams.length = 0; texts.length = 0; shakeMag = 0; stamp = -1; }

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
        size: size * (0.7 + 0.6 * Math.random()), plane: stamp,
      });
    }
  }

  // a hitscan beam streak that fades over `life` seconds (render only).
  // `power` (0..1) scales the bloom flair so big charges LOOK powerful (hitbox is unchanged).
  // `fade` (optional): {fullFrac, minMult} tapers the beam's OPACITY from full over the first
  // fullFrac of its length down to minMult at the tip — the honest tell for range damage falloff.
  function spawnBeam(x1, y1, x2, y2, color, halfWidth, life, power, fade) {
    beams.push({ x1, y1, x2, y2, color, halfWidth, life, maxLife: life, power: power || 0, fade: fade || null, plane: stamp });
  }

  // floating combat text ("LINE BREAK", "+4")
  function spawnText(x, y, text, color, opts) {
    opts = opts || {};
    texts.push({
      x, y, text, color,
      size: opts.size || 14,
      vy: -cfg.floatTextRiseSpeed,
      life: cfg.floatTextLifeSec, maxLife: cfg.floatTextLifeSec, plane: stamp,
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

  function draw(R, alpha, lerp, viewPlane) {
    const ctx = R.ctx;
    // Only draw fx on the viewer's plane (or environmental, plane -1). viewPlane null = draw all.
    const show = (e) => viewPlane == null || e.plane === -1 || (e.plane | 0) === (viewPlane | 0);

    // beams + particles are additive glow
    R.setComposite('lighter');
    for (const b of beams) {
      if (!show(b)) continue;
      const t = b.life / b.maxLife;                  // 1 -> 0
      const rgb = R.hexToRgb(b.color);
      const x1 = R.sx(b.x1), y1 = R.sy(b.y1), x2 = R.sx(b.x2), y2 = R.sy(b.y2);
      const pw = b.power || 0;
      ctx.lineCap = 'round';
      // stroke style for a pass: solid rgba, OR (with b.fade) a length gradient that tapers
      // opacity from full to minMult past fullFrac — the visible range-falloff tell.
      const stroke = (cr, cg, cb, a) => {
        if (!b.fade) return `rgba(${cr},${cg},${cb},${a})`;
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(Math.min(0.98, b.fade.fullFrac), `rgba(${cr},${cg},${cb},${a})`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},${a * b.fade.minMult})`);
        return g;
      };
      // powerful shots get a wide outer haze under the beam
      if (pw > 0) {
        ctx.strokeStyle = stroke(rgb[0], rgb[1], rgb[2], 0.18 * pw * t);
        ctx.lineWidth = b.halfWidth * (3 + 5 * pw);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // soft wide pass (the honest hitbox thickness)
      ctx.strokeStyle = stroke(rgb[0], rgb[1], rgb[2], (0.35 + 0.3 * pw) * t);
      ctx.lineWidth = b.halfWidth * 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // bright thin core (thicker + fuller on big shots)
      ctx.strokeStyle = stroke(255, 255, 255, (0.9 + 0.1 * pw) * t);
      ctx.lineWidth = Math.max(1.5, b.halfWidth * (0.5 + 0.5 * pw));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    // Particles are the most numerous element (bursts of 18–36 per break/death). Draw them as
    // cheap additive solid circles — with 'lighter' compositing they still sum into a glow —
    // instead of a radial gradient each (a createRadialGradient per particle tanks the frame).
    const TAU = Math.PI * 2;
    for (const p of particles) {
      if (!show(p)) continue;
      const t = p.life / p.maxLife;
      const ix = R.sx(lerp(p.px, p.x, alpha)), iy = R.sy(lerp(p.py, p.y, alpha));
      const rgb = R.hexToRgb(p.color);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.75 * t})`;
      ctx.beginPath(); ctx.arc(ix, iy, p.size * (1.4 + t), 0, TAU); ctx.fill();
    }

    // text is crisp, on top
    R.setComposite('source-over');
    ctx.textAlign = 'center';
    const z = R.camera.zoom || 1;                 // counter-scale so text stays a constant screen size under view zoom
    for (const tx of texts) {
      if (!show(tx)) continue;
      const t = tx.life / tx.maxLife;
      const rgb = R.hexToRgb(tx.color);
      ctx.save(); ctx.translate(R.sx(tx.x), R.sy(tx.y)); ctx.scale(1 / z, 1 / z);
      ctx.font = `700 ${tx.size}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(1, t * 1.6)})`;
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }

  return { reset, spawnParticles, spawnBeam, spawnText, addShake, update, draw, shakeX, shakeY, stampPlane };
})();
