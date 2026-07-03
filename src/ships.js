// PULSAR.io — SHIPS (procedural hull models)
// One hand-built vector model per class/evolution, drawn in the CORE pass (source-over).
// Design rule: the hull must SHOW the weapon — rail barrels charge, ram plates brace,
// gravity cores glow, winch drums spin. Silhouette stays the class-identity channel
// (VISUAL_SPEC): every model keeps its family's read (spear / wedge / crescent / drum)
// while each evolution earns a unique outline.
//
// Coordinate convention: ctx is already translated to the ship and rotated by aim,
// so +x is the nose. All geometry is in units of s.radius (leader growth scales free).
window.PULSAR = window.PULSAR || {};

window.PULSAR.Ships = (function () {
  const TAU = Math.PI * 2;
  const RIM = 'rgba(230,245,255,0.95)';        // shared bright rim stroke (readability)

  // ---- palette: derive body/plate/accent shades from the class hue, cached ----
  const palCache = new Map();
  function palette(hex) {
    let P = palCache.get(hex);
    if (P) return P;
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    P = {
      rgb: [r, g, b],
      body: `rgba(${Math.round(r * 0.30 + 10)},${Math.round(g * 0.30 + 12)},${Math.round(b * 0.30 + 18)},0.96)`,
      plate: `rgba(${Math.round(r * 0.58 + 6)},${Math.round(g * 0.58 + 6)},${Math.round(b * 0.58 + 10)},0.96)`,
      accent: `rgba(${r},${g},${b},0.95)`,
      dim: `rgba(${r},${g},${b},0.38)`,
      glow: `rgba(${r},${g},${b},0.20)`,
    };
    palCache.set(hex, P);
    return P;
  }
  const FLASH = { body: 'rgba(255,120,120,0.95)', plate: 'rgba(255,150,150,0.95)' };  // hit feedback overrides

  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function fillStroke(ctx, fill, lw) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = RIM; ctx.lineWidth = lw || 1.5; ctx.stroke();
  }

  // Engine flare: additive, scales with actual speed so thrust is honest telemetry.
  function engine(ctx, s, x, y, w, P, t) {
    const sp = Math.min(1, Math.hypot(s.vx || 0, s.vy || 0) / 260);
    const flick = 0.85 + 0.3 * Math.sin(t * 31 + y * 7);
    const len = w * (1.1 + 2.6 * sp) * flick;
    ctx.save(); ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    poly(ctx, [[0, -w * 0.5], [0, w * 0.5], [-len, 0]]);
    ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.30 + 0.45 * sp})`; ctx.fill();
    poly(ctx, [[0, -w * 0.26], [0, w * 0.26], [-len * 0.55, 0]]);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.45 * sp})`; ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ============================ RAIL FAMILY ==================================
  // A gun that happens to have a ship attached. The barrel dominates; capacitor
  // rings light up front-to-back as charge builds; rear vents glow with heat.
  function railBody(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    // rear fins (swept back — a braced firing platform, not a dogfighter)
    poly(ctx, [[-0.15 * r, 0.20 * r], [-1.0 * r, o.back * r], [-0.55 * r, 0.12 * r]]);
    fillStroke(ctx, plateFill, 1.2);
    poly(ctx, [[-0.15 * r, -0.20 * r], [-1.0 * r, -o.back * r], [-0.55 * r, -0.12 * r]]);
    fillStroke(ctx, plateFill, 1.2);
    // fuselage: narrow elongated hex hugging the barrel
    poly(ctx, [[0.9 * r, 0], [0.25 * r, 0.40 * r], [-0.8 * r, 0.30 * r], [-0.95 * r, 0],
               [-0.8 * r, -0.30 * r], [0.25 * r, -0.40 * r]]);
    fillStroke(ctx, bodyFill);
    // heat vents: three rear slats, cold-dim -> molten as heat rises; venting = red pulse
    const heatMax = (PULSAR.config.railship && PULSAR.config.railship.heat.max) || 100;
    const hf = Math.min(1, (s.heat || 0) / heatMax);
    const venting = (s.ventTimer || 0) > 0;
    for (let i = 0; i < 3; i++) {
      const vx = -0.45 * r - i * 0.18 * r;
      const a = venting ? 0.55 + 0.4 * Math.sin(t * 22) : 0.15 + 0.75 * hf;
      ctx.strokeStyle = `rgba(255,${Math.round(190 - 130 * Math.max(hf, venting ? 1 : 0))},90,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(vx, 0.24 * r); ctx.lineTo(vx, -0.24 * r); ctx.stroke();
    }
    // barrel: the identity. Twin accelerator rails as bright edge lines.
    const bl = o.len * r, bh = o.barrel * r;
    ctx.fillStyle = plateFill;
    ctx.fillRect(-0.2 * r, -bh, bl + 0.2 * r, bh * 2);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.3;
    ctx.strokeRect(-0.2 * r, -bh, bl + 0.2 * r, bh * 2);
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-0.15 * r, -bh * 0.55); ctx.lineTo(bl, -bh * 0.55);
    ctx.moveTo(-0.15 * r, bh * 0.55); ctx.lineTo(bl, bh * 0.55);
    ctx.stroke();
    // capacitor rings: light sequentially with charge (front sight of "almost ready")
    const ch = s.charging ? Math.min(1, s.charge || 0) : 0;
    for (let i = 0; i < o.rings; i++) {
      const rx = r * (0.35 + (i + 1) * (o.len - 0.55) / (o.rings + 1));
      const lit = ch > (i + 0.5) / o.rings;
      ctx.strokeStyle = lit ? 'rgba(255,255,255,0.95)' : P.dim;
      ctx.lineWidth = lit ? 2.2 : 1.4;
      ctx.beginPath(); ctx.moveTo(rx, -bh * 1.55); ctx.lineTo(rx, bh * 1.55); ctx.stroke();
      if (lit) { ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rx, 0, bh * 1.9, 0, TAU); ctx.stroke(); }
    }
    // muzzle fork: twin jaws where the beam forms. With o.mawOpen the jaws HINGE OPEN as
    // charge builds (or hold open while the beam is lit) — the maw's gape IS the beam width.
    if (o.prong) {
      const open = o.mawOpen ? Math.max(s.charging ? Math.min(1, s.charge || 0) : 0,
                                        (s.beamTimer || 0) > 0 ? (s.beamPower || 0) : 0) : 0;
      const py = o.prong * r * (1 + open * (o.mawOpen || 0));
      poly(ctx, [[bl - 0.15 * r, -bh], [bl + 0.85 * r, -py], [bl + 0.85 * r, -py + 0.12 * r], [bl, 0]]);
      fillStroke(ctx, plateFill, 1.2);
      poly(ctx, [[bl - 0.15 * r, bh], [bl + 0.85 * r, py], [bl + 0.85 * r, py - 0.12 * r], [bl, 0]]);
      fillStroke(ctx, plateFill, 1.2);
      if (o.mawOpen && open > 0.05) {
        // essence core condensing in the open maw — the "shot about to exist"
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(bl + 0.45 * r, 0, r * (0.10 + 0.34 * open), 0, TAU);
        ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.35 + 0.45 * open})`; ctx.fill();
        ctx.beginPath(); ctx.arc(bl + 0.45 * r, 0, r * (0.05 + 0.16 * open), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * open})`; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // charge lance: growing aim-line from the muzzle (base rail only — the maw classes
    // telegraph with the opening jaws + essence intake instead)
    if (s.charging && !o.noLance) {
      const c = Math.min(1.25, s.charge || 0);
      const x0 = o.prong ? bl + 0.85 * r : bl;
      ctx.beginPath(); ctx.moveTo(0.4 * r, 0); ctx.lineTo(x0 + c * 0.8 * r, 0);
      ctx.strokeStyle = c > 1.0 ? 'rgba(255,210,120,0.95)' : `rgba(255,255,255,${0.5 + 0.5 * c})`;
      ctx.lineWidth = 1.5 + c * 2.5; ctx.stroke();
    }
    engine(ctx, s, -0.9 * r, 0, 0.34 * r, P, t);
  }

  // =========================== HAMMER FAMILY =================================
  // All mass forward. A separate ram slab bolted to a stubby tug of a body,
  // pushed by oversized engines — the ship IS the projectile.
  function hammerBody(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    const c = s.ramActive > 0 ? 1 : (s.ramWinding ? (s.ramCharge || 0) : 0);
    // engines first (behind the hull)
    const en = o.engines, ew = 0.34 * r;
    for (let i = 0; i < en; i++) {
      const ey = (i - (en - 1) / 2) * 0.52 * r * (o.span / 1.05);
      ctx.fillStyle = plateFill; ctx.fillRect(-1.25 * r, ey - ew * 0.55, 0.3 * r, ew * 1.1);
      ctx.strokeStyle = RIM; ctx.lineWidth = 1.1; ctx.strokeRect(-1.25 * r, ey - ew * 0.55, 0.3 * r, ew * 1.1);
      engine(ctx, s, -1.25 * r, ey, ew, P, t);
    }
    // Fold-out boost jets: THE windup telegraph. As the ram charges, lateral booster pods
    // hinge outward from the flanks and their burn shifts yellow -> deep red toward full
    // commit; they stay splayed and blazing through the lunge. Pure visual — mechanics
    // unchanged. Drawn before the hull so the pods emerge from under it.
    if (c > 0.03) {
      const jg = Math.round(205 - 150 * c), jb = Math.round(100 - 80 * c);   // yellow -> red
      const flick = 0.8 + 0.35 * Math.sin(t * 27);
      for (const sgn of [1, -1]) {
        ctx.save();
        ctx.translate(-0.30 * r, 0.52 * r * o.span * sgn);
        ctx.rotate(sgn * (0.22 + 0.85 * c));               // hinge outward with charge
        poly(ctx, [[0.34 * r, -0.09 * r], [-0.42 * r, -0.14 * r], [-0.52 * r, 0],
                   [-0.42 * r, 0.14 * r], [0.34 * r, 0.09 * r]]);
        fillStroke(ctx, plateFill, 1.1);
        ctx.strokeStyle = `rgba(255,${jg},${jb},${0.5 + 0.5 * c})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-0.1 * r, -0.1 * r); ctx.lineTo(-0.1 * r, 0.1 * r); ctx.stroke();  // heat seam
        ctx.globalCompositeOperation = 'lighter';
        const fl = r * (0.55 + 1.25 * c) * flick;          // burn grows + reddens with charge
        poly(ctx, [[-0.48 * r, -0.2 * r], [-0.48 * r, 0.2 * r], [-0.48 * r - fl * 1.15, 0]]);   // outer haze
        ctx.fillStyle = `rgba(255,${Math.round(jg * 0.7)},${jb},${0.28 + 0.3 * c})`; ctx.fill();
        poly(ctx, [[-0.5 * r, -0.13 * r], [-0.5 * r, 0.13 * r], [-0.5 * r - fl, 0]]);
        ctx.fillStyle = `rgba(255,${jg},${jb},${0.65 + 0.35 * c})`; ctx.fill();
        poly(ctx, [[-0.5 * r, -0.06 * r], [-0.5 * r, 0.06 * r], [-0.5 * r - fl * 0.5, 0]]);
        ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.45 * c})`; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }
    }
    // body: trapezoid narrowing to the rear — everything leans into the plate
    poly(ctx, [[0.6 * r, 0.62 * r * o.span], [0.6 * r, -0.62 * r * o.span],
               [-1.0 * r, -0.34 * r * o.span], [-1.0 * r, 0.34 * r * o.span]]);
    fillStroke(ctx, bodyFill);
    // ram plate: dark slab with a molten leading edge when committed
    const f = o.front * r, sp = o.span * r;
    if (o.teeth) {
      const pts = [[0.55 * r, sp], [f, sp]];
      for (let i = 0; i < o.teeth; i++) {         // serrated maul face
        const y1 = sp - (i + 0.35) * (2 * sp) / o.teeth, y2 = sp - (i + 1) * (2 * sp) / o.teeth;
        pts.push([f + 0.16 * r, y1], [f, y2]);
      }
      pts.push([0.55 * r, -sp]);
      poly(ctx, pts);
    } else {
      poly(ctx, [[0.55 * r, sp], [f, sp * 0.92], [f, -sp * 0.92], [0.55 * r, -sp]]);
    }
    fillStroke(ctx, plateFill, 1.7);
    // leading edge heats with windup (orange -> white-hot at full commit)
    ctx.strokeStyle = c > 0 ? `rgba(255,${Math.round(150 + 105 * c)},${Math.round(60 + 160 * c)},${0.5 + 0.5 * c})`
                            : P.dim;
    ctx.lineWidth = 2 + 2.5 * c;
    ctx.beginPath(); ctx.moveTo(f + (o.teeth ? 0.16 * r : 0), -sp * 0.88); ctx.lineTo(f + (o.teeth ? 0.16 * r : 0), sp * 0.88); ctx.stroke();
    // rivets: the "bolted-on armor" tell
    ctx.fillStyle = 'rgba(235,245,255,0.75)';
    for (let i = 0; i < 3; i++) {
      const ry = (i - 1) * sp * 0.6;
      ctx.beginPath(); ctx.arc(0.72 * r, ry, 0.07 * r, 0, TAU); ctx.fill();
    }
    // cleaving ridge (Worldsplitter): a central blade that lands the shockwave
    if (o.ridge) {
      poly(ctx, [[f, 0.18 * r], [f + o.ridge * r, 0], [f, -0.18 * r]]);
      fillStroke(ctx, plateFill, 1.4);
      // hazard chevrons on the face
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(f - 0.28 * r, sp * 0.55); ctx.lineTo(f - 0.05 * r, sp * 0.25);
      ctx.moveTo(f - 0.28 * r, -sp * 0.55); ctx.lineTo(f - 0.05 * r, -sp * 0.25);
      ctx.stroke();
    }
    // (the old front telegraph ring is gone — the fold-out jets + molten ram edge ARE the
    // windup read now; counterplay still has two charge-scaled tells)
  }

  // ============================ GRAV FAMILY ===================================
  // A C-shaped annular hull wrapping an exposed gravity core, mouth open forward.
  // Artillery branch grows launcher rails from the horns; control branch closes
  // the C toward a full containment ring around a void core.
  function crescentHull(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const gap = o.gap, ir = o.inner * r;          // mouth half-angle + inner radius
    // engine pod bolted to the back of the ring
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    ctx.fillStyle = plateFill;
    ctx.fillRect(-1.25 * r, -0.26 * r, 0.35 * r, 0.52 * r);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.2; ctx.strokeRect(-1.25 * r, -0.26 * r, 0.35 * r, 0.52 * r);
    engine(ctx, s, -1.25 * r, 0, 0.34 * r, P, t);
    // the C hull itself
    ctx.beginPath();
    ctx.arc(0, 0, r, gap, TAU - gap);
    ctx.arc(0, 0, ir, TAU - gap, gap, true);
    ctx.closePath();
    fillStroke(ctx, bodyFill);
    // horn emitters: forward prongs at the mouth tips — where the field projects from
    if (o.horn) {
      const rm = (r + ir) / 2, hw = (r - ir) * 0.5;
      for (const sgn of [1, -1]) {
        const hx = Math.cos(gap) * rm, hy = Math.sin(gap) * rm * sgn;
        poly(ctx, [[hx - hw * 0.2, hy - hw * sgn], [hx + o.horn * r, hy * 0.55], [hx - hw * 0.2, hy + hw * sgn]]);
        fillStroke(ctx, plateFill, 1.2);
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(hx + o.horn * r, hy * 0.55); ctx.lineTo(hx + (o.horn + 0.22) * r, hy * 0.48); ctx.stroke();
      }
    }
  }
  function gravCore(ctx, r, s, P, t, o) {
    const cap = (s.captured && s.captured.length) || 0;
    const cx = o.coreX * r, cr = o.coreR * r;
    if (o.voidCore) {
      // control branch: a contained singularity — black center, hot rim
      ctx.beginPath(); ctx.arc(cx, 0, cr, 0, TAU); ctx.fillStyle = '#07040d'; ctx.fill();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2 + 0.6 * Math.sin(t * 5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, 0, cr * (0.62 + 0.06 * Math.sin(t * 7)), t * 2.2, t * 2.2 + 4.4); ctx.stroke();  // accretion arc
    } else {
      // artillery branch: bright reactor — brightens as ammo (rocks) is loaded
      const g = 0.45 + 0.14 * cap + 0.08 * Math.sin(t * 4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(cx, 0, cr * 1.6, 0, TAU);
      ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${g * 0.35})`; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(cx, 0, cr, 0, TAU); ctx.fillStyle = P.accent; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, 0, cr * 0.45, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${Math.min(1, g)})`; ctx.fill();
      ctx.strokeStyle = RIM; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, 0, cr, 0, TAU); ctx.stroke();
    }
  }
  function fieldVanes(ctx, r, P, t, n, rad) {
    // slow-rotating field vanes: "this ship bends space" idle motion
    ctx.strokeStyle = P.dim; ctx.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      const a0 = t * 0.8 + (i / n) * TAU;
      ctx.beginPath(); ctx.arc(0, 0, rad * r, a0, a0 + 0.7); ctx.stroke();
    }
  }

  // ============================ FLAIL FAMILY ==================================
  // A working tug: hex hull, front chain-guide yoke, and a big winch drum whose
  // spokes spin with the orb — the machine that swings the wrecking ball.
  function flailBody(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    const k = o.scale || 1;
    engine(ctx, s, -1.0 * r * k, 0, 0.4 * r, P, t);
    if (o.counterweight) {                        // Ironmoon: rear ballast block
      ctx.fillStyle = plateFill;
      ctx.fillRect(-1.35 * r, -0.5 * r, 0.45 * r, 1.0 * r);
      ctx.strokeStyle = RIM; ctx.lineWidth = 1.3; ctx.strokeRect(-1.35 * r, -0.5 * r, 0.45 * r, 1.0 * r);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-1.28 * r, 0.3 * r); ctx.lineTo(-0.97 * r, -0.3 * r); ctx.stroke();
    }
    if (o.round) {
      ctx.beginPath(); ctx.arc(0, 0, 0.95 * r * k, 0, TAU); fillStroke(ctx, bodyFill);
    } else {
      poly(ctx, [[1.05 * r * k, 0], [0.5 * r * k, 0.85 * r * k], [-0.6 * r * k, 0.85 * r * k],
                 [-0.95 * r * k, 0], [-0.6 * r * k, -0.85 * r * k], [0.5 * r * k, -0.85 * r * k]]);
      fillStroke(ctx, bodyFill);
    }
    if (o.shoulders) {                            // Chainmaul: bolted armor cheeks
      for (const sgn of [1, -1]) {
        poly(ctx, [[0.55 * r, 0.55 * r * sgn], [0.15 * r, 0.95 * r * sgn], [-0.55 * r, 0.95 * r * sgn], [-0.35 * r, 0.55 * r * sgn]]);
        fillStroke(ctx, plateFill, 1.2);
        ctx.fillStyle = 'rgba(235,245,255,0.7)';
        ctx.beginPath(); ctx.arc(-0.1 * r, 0.75 * r * sgn, 0.06 * r, 0, TAU); ctx.fill();
      }
    }
    // guide rings (control branch): the visible promise of a stable orbit
    if (o.rings) {
      for (let i = 0; i < o.rings; i++) {
        const rr = (1.22 + i * 0.24) * r;
        ctx.strokeStyle = i === 0 ? P.dim : P.glow; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
        for (let j = 0; j < 4; j++) {             // tick marks ride the orb spin
          const a0 = (s.orbSpin || 0) * (i % 2 ? -0.8 : 1) + (j / 4) * TAU;
          ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 0.16); ctx.stroke();
        }
      }
    }
    // chain-guide yoke: twin prongs the chain feeds through
    for (const sgn of [1, -1]) {
      poly(ctx, [[0.9 * r * k, 0.16 * r * sgn], [1.35 * r * k, 0.30 * r * sgn], [0.95 * r * k, 0.42 * r * sgn]]);
      fillStroke(ctx, plateFill, 1.1);
    }
    // winch drum + spokes (rotate with the orb — the drivetrain is visible)
    const dr = (o.drum || 0.45) * r;
    ctx.beginPath(); ctx.arc(0, 0, dr, 0, TAU); ctx.fillStyle = plateFill; ctx.fill();
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
    const spokes = o.spokes || 3;
    for (let i = 0; i < spokes; i++) {
      const a0 = (s.orbSpin || 0) + (i / spokes) * TAU;
      ctx.beginPath(); ctx.moveTo(Math.cos(a0) * dr * 0.25, Math.sin(a0) * dr * 0.25);
      ctx.lineTo(Math.cos(a0) * dr * 0.9, Math.sin(a0) * dr * 0.9); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, dr * 0.2, 0, TAU); ctx.fill();
  }

  // ---- model registry (visuals.js `silhouette` names -> draw fns) ------------
  const MODELS = {
    // Starter: tiny neutral dart with a cockpit dot — deliberately plain.
    dart(ctx, r, s, P, t) {
      const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
      engine(ctx, s, -0.62 * r, 0, 0.34 * r, P, t);
      poly(ctx, [[1.45 * r, 0], [-0.75 * r, 0.72 * r], [-0.45 * r, 0], [-0.75 * r, -0.72 * r]]);
      fillStroke(ctx, bodyFill);
      ctx.fillStyle = 'rgba(235,245,255,0.85)';
      ctx.beginPath(); ctx.arc(0.35 * r, 0, 0.16 * r, 0, TAU); ctx.fill();
    },

    railship(ctx, r, s, P, t)    { railBody(ctx, r, s, P, t, { len: 2.1, back: 0.72, barrel: 0.15, rings: 2 }); },
    // Helion: short heavy barrel ending in a focusing LENS RING that glows with the beam
    // ramp — a solar furnace, not a sniper rifle.
    helion(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.7, back: 0.78, barrel: 0.18, rings: 2, noLance: true });
      const ramp = s.beamRamp || 0, lx = 1.7 * r + 0.28 * r;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(lx, 0, r * 0.42, 0, TAU);
      ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.45 + 0.5 * ramp})`;
      ctx.lineWidth = 2 + 2.5 * ramp; ctx.stroke();
      if (ramp > 0.02) {
        ctx.beginPath(); ctx.arc(lx, 0, r * (0.10 + 0.20 * ramp), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * ramp})`; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // three focusing vanes around the lens, tilting in as the ramp climbs
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + t * 0.6 * ramp;
        ctx.beginPath(); ctx.arc(lx, 0, r * (0.6 - 0.1 * ramp), a, a + 0.9); ctx.stroke();
      }
    },
    starPiercer(ctx, r, s, P, t) { railBody(ctx, r, s, P, t, { len: 2.4, back: 0.9, barrel: 0.2, rings: 3, prong: 0.34, mawOpen: 1.6, noLance: true }); },

    hammerhead(ctx, r, s, P, t)    { hammerBody(ctx, r, s, P, t, { front: 1.3, span: 1.05, teeth: 0, engines: 2 }); },
    maulbreaker(ctx, r, s, P, t)   { hammerBody(ctx, r, s, P, t, { front: 1.42, span: 1.4, teeth: 4, engines: 2 }); },
    worldsplitter(ctx, r, s, P, t) { hammerBody(ctx, r, s, P, t, { front: 1.5, span: 1.75, teeth: 0, engines: 3, ridge: 0.45 }); },

    gravitor(ctx, r, s, P, t) {
      crescentHull(ctx, r, s, P, t, { gap: 0.85, inner: 0.52, horn: 0.35 });
      gravCore(ctx, r, s, P, t, { coreX: 0.10, coreR: 0.30 });
    },
    meteorist(ctx, r, s, P, t) {
      crescentHull(ctx, r, s, P, t, { gap: 0.72, inner: 0.44, horn: 0.6 });
      gravCore(ctx, r, s, P, t, { coreX: 0.10, coreR: 0.34 });
    },
    starfall(ctx, r, s, P, t) {
      crescentHull(ctx, r, s, P, t, { gap: 0.72, inner: 0.44, horn: 0.75 });
      // central launch rail splitting the mouth: the volley thrower
      const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
      poly(ctx, [[0.1 * r, 0.10 * r], [1.6 * r, 0], [0.1 * r, -0.10 * r]]);
      fillStroke(ctx, plateFill, 1.2);
      gravCore(ctx, r, s, P, t, { coreX: 0.0, coreR: 0.36 });
    },
    singularity(ctx, r, s, P, t) {
      fieldVanes(ctx, r, P, t, 3, 1.3);
      crescentHull(ctx, r, s, P, t, { gap: 0.38, inner: 0.55 });
      gravCore(ctx, r, s, P, t, { coreX: 0, coreR: 0.36, voidCore: true });
    },
    eventHorizon(ctx, r, s, P, t) {
      fieldVanes(ctx, r, P, t, 4, 1.55);
      // outer broken containment ring, slowly counter-rotating
      ctx.strokeStyle = P.dim; ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        const a0 = -t * 0.5 + (i / 3) * TAU;
        ctx.beginPath(); ctx.arc(0, 0, 1.32 * r, a0, a0 + 1.5); ctx.stroke();
      }
      crescentHull(ctx, r, s, P, t, { gap: 0.14, inner: 0.58 });
      gravCore(ctx, r, s, P, t, { coreX: 0, coreR: 0.42, voidCore: true });
    },

    flailship(ctx, r, s, P, t)    { flailBody(ctx, r, s, P, t, { drum: 0.45, spokes: 3 }); },
    // Twinmaul: the drivetrain doubled — bulkier hull with armored shoulders and TWO winch
    // drums side by side, spokes counter-rotating (one per chain).
    twinmaul(ctx, r, s, P, t) {
      flailBody(ctx, r, s, P, t, { scale: 1.08, drum: 0, spokes: 0, shoulders: true });
      const plateFill = s.hitFlash > 0 ? 'rgba(255,150,150,0.95)' : P.plate;
      for (const sgn of [1, -1]) {
        const dy = 0.38 * r * sgn, dr = 0.38 * r;
        ctx.beginPath(); ctx.arc(0, dy, dr, 0, TAU); ctx.fillStyle = plateFill; ctx.fill();
        ctx.strokeStyle = RIM; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
        const spin = (sgn > 0 ? (s.orbSelfSpin || 0) : -(s.orbSelfSpin2 != null ? s.orbSelfSpin2 : (s.orbSelfSpin || 0)));
        for (let i = 0; i < 3; i++) {
          const a0 = spin + (i / 3) * TAU;
          ctx.beginPath(); ctx.moveTo(Math.cos(a0) * dr * 0.25, dy + Math.sin(a0) * dr * 0.25);
          ctx.lineTo(Math.cos(a0) * dr * 0.9, dy + Math.sin(a0) * dr * 0.9); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(0, dy, dr * 0.2, 0, TAU); ctx.fill();
      }
    },
  };

  function modelFor(classId) {
    const v = PULSAR.classVisuals[classId];
    return (v && MODELS[v.silhouette]) || MODELS.dart;
  }

  // Entry point. ctx must already be translated to the ship and rotated by aim.
  function draw(ctx, s, time) {
    const hue = PULSAR.weaponHue(s.classId);
    modelFor(s.classId)(ctx, s.radius, s, palette(hue), time);
  }

  return { draw };
})();
