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
  // A space gun with a ship attached. At rest the weapon hides inside a sealed
  // clamshell cowl — the sprite reads as a sleek closed gun pod with a small tail
  // craft bolted on. Charging SPLITS the shell open and the inner rail telescopes
  // out, growing longer and brighter until the shot. The furnace branch (Helion /
  // Supernova) drives the same reveal with beam ramp instead of charge.
  function railBody(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    // reveal driver: charge (held past full = overcharge) or beam ramp
    const chRaw = o.useRamp ? (s.beamRamp || 0)
                : Math.max(s.charging ? (s.charge || 0) : 0,
                           (s.beamTimer || 0) > 0 ? (s.beamPower || 0) : 0);
    const ch = Math.min(1, chRaw);
    const open = Math.min(1, ch * 1.5);           // shell snaps open early...
    const bl = (o.len + (o.ext || 0) * ch) * r;   // ...then the barrel keeps growing
    const bh = o.barrel * r;

    // --- tail craft: the small ship attached to the back of the gun
    engine(ctx, s, -1.15 * r, 0, 0.32 * r, P, t);
    poly(ctx, [[-0.30 * r, 0.16 * r], [-1.05 * r, o.back * r], [-1.15 * r, 0.10 * r]]);
    fillStroke(ctx, plateFill, 1.2);
    poly(ctx, [[-0.30 * r, -0.16 * r], [-1.05 * r, -o.back * r], [-1.15 * r, -0.10 * r]]);
    fillStroke(ctx, plateFill, 1.2);
    poly(ctx, [[-0.20 * r, 0.30 * r], [-1.15 * r, 0.20 * r], [-1.15 * r, -0.20 * r], [-0.20 * r, -0.30 * r]]);
    fillStroke(ctx, bodyFill);
    ctx.fillStyle = 'rgba(235,245,255,0.85)';
    ctx.beginPath(); ctx.arc(-0.50 * r, 0, 0.10 * r, 0, TAU); ctx.fill();   // cockpit: the pilot rides the gun
    // heat vents: tail slats, cold-dim -> molten as heat rises; venting = red pulse
    const heatMax = (PULSAR.config.railship && PULSAR.config.railship.heat.max) || 100;
    const hf = Math.min(1, (s.heat || 0) / heatMax);
    const venting = (s.ventTimer || 0) > 0;
    for (let i = 0; i < 3; i++) {
      const vx = -0.62 * r - i * 0.17 * r;
      const a = venting ? 0.55 + 0.4 * Math.sin(t * 22) : 0.15 + 0.75 * hf;
      ctx.strokeStyle = `rgba(255,${Math.round(190 - 130 * Math.max(hf, venting ? 1 : 0))},90,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(vx, 0.22 * r); ctx.lineTo(vx, -0.22 * r); ctx.stroke();
    }

    // --- the gun itself (hidden under the cowl until the shell opens)
    // breech block
    ctx.fillStyle = plateFill;
    ctx.fillRect(-0.30 * r, -bh * 1.6, 0.55 * r, bh * 3.2);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.2;
    ctx.strokeRect(-0.30 * r, -bh * 1.6, 0.55 * r, bh * 3.2);
    // main barrel + thinner telescoping forward section (the "gun gets longer" read)
    const seg = o.len * r * 0.7;
    ctx.fillStyle = plateFill;
    ctx.fillRect(0.25 * r, -bh, seg - 0.25 * r, bh * 2);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.2;
    ctx.strokeRect(0.25 * r, -bh, seg - 0.25 * r, bh * 2);
    ctx.fillStyle = bodyFill;
    ctx.fillRect(seg, -bh * 0.72, bl - seg, bh * 1.44);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.1;
    ctx.strokeRect(seg, -bh * 0.72, bl - seg, bh * 1.44);
    // muzzle collar
    ctx.fillStyle = plateFill;
    ctx.fillRect(bl - 0.10 * r, -bh * 1.25, 0.14 * r, bh * 2.5);
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.1;
    ctx.strokeRect(bl - 0.10 * r, -bh * 1.25, 0.14 * r, bh * 2.5);
    // twin accelerator rails: brighten and thicken as the charge builds
    ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.35 + 0.65 * ch})`;
    ctx.lineWidth = 1.1 + 1.6 * ch;
    ctx.beginPath();
    ctx.moveTo(0.25 * r, -bh * 0.5); ctx.lineTo(bl, -bh * 0.4);
    ctx.moveTo(0.25 * r, bh * 0.5); ctx.lineTo(bl, bh * 0.4);
    ctx.stroke();
    // capacitor rings ride the growing barrel, lighting front-to-back with charge
    for (let i = 0; i < o.rings; i++) {
      const rx = 0.35 * r + (i + 1) * (bl - 0.55 * r) / (o.rings + 1);
      const lit = ch > (i + 0.5) / o.rings;
      ctx.strokeStyle = lit ? 'rgba(255,255,255,0.95)' : P.dim;
      ctx.lineWidth = lit ? 2.2 : 1.4;
      ctx.beginPath(); ctx.moveTo(rx, -bh * 1.55); ctx.lineTo(rx, bh * 1.55); ctx.stroke();
      if (lit) { ctx.strokeStyle = P.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rx, 0, bh * 1.9, 0, TAU); ctx.stroke(); }
    }
    // energy sleeve + muzzle bloom: the whole gun brightens as the shot condenses
    if (ch > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.10 + 0.25 * ch})`;
      ctx.fillRect(0.2 * r, -bh * 1.8, bl - 0.2 * r, bh * 3.6);
      if (!o.prong) {
        ctx.beginPath(); ctx.arc(bl + 0.06 * r, 0, r * (0.06 + 0.26 * ch), 0, TAU);
        ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.30 + 0.45 * ch})`; ctx.fill();
        ctx.beginPath(); ctx.arc(bl + 0.06 * r, 0, r * (0.03 + 0.12 * ch), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.55 * ch})`; ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // overcharge (held past full): golden shimmer along the extended rail
    if (!o.useRamp && chRaw > 1.0) {
      ctx.strokeStyle = 'rgba(255,210,120,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(0.2 * r, -bh * 1.1, bl - 0.2 * r, bh * 2.2);
    }
    // muzzle fork: twin jaws where the beam forms. With o.mawOpen the jaws HINGE OPEN as
    // charge builds (or hold open while the beam is lit) — the maw's gape IS the beam width.
    if (o.prong) {
      const py = o.prong * r * (1 + ch * (o.mawOpen || 0));
      poly(ctx, [[bl - 0.15 * r, -bh], [bl + 0.85 * r, -py], [bl + 0.85 * r, -py + 0.12 * r], [bl, 0]]);
      fillStroke(ctx, plateFill, 1.2);
      poly(ctx, [[bl - 0.15 * r, bh], [bl + 0.85 * r, py], [bl + 0.85 * r, py - 0.12 * r], [bl, 0]]);
      fillStroke(ctx, plateFill, 1.2);
      if (o.mawOpen && ch > 0.05) {
        // essence core condensing in the open maw — the "shot about to exist"
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(bl + 0.45 * r, 0, r * (0.10 + 0.34 * ch), 0, TAU);
        ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.35 + 0.45 * ch})`; ctx.fill();
        ctx.beginPath(); ctx.arc(bl + 0.45 * r, 0, r * (0.05 + 0.16 * ch), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * ch})`; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // --- clamshell cowl, drawn LAST so it hides the gun when sealed. Both halves
    // lift laterally and flare outward on a rear hinge as the shell opens.
    const hingeX = -0.35 * r;
    const lift = open * (o.cowlGap || 0.55) * r;
    const cLen = (o.len * 0.95 + 0.35) * r;       // hinge -> cowl tip
    for (const sgn of [1, -1]) {
      ctx.save();
      ctx.translate(hingeX, sgn * lift);
      ctx.rotate(sgn * open * 0.15);
      poly(ctx, [[cLen, sgn * 0.02 * r], [cLen * 0.60, sgn * 0.28 * r], [0.15 * r, sgn * 0.42 * r],
                 [0, sgn * 0.30 * r], [0, sgn * 0.035 * r]]);
      fillStroke(ctx, bodyFill, 1.3);
      // accent rake along the shell — the closed pod still reads as a weapon
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cLen * 0.88, sgn * 0.07 * r); ctx.lineTo(0.22 * r, sgn * 0.34 * r); ctx.stroke();
      ctx.restore();
    }
    // seam flash: light knifing out of the crack as the shell first splits
    if (open > 0.02 && open < 0.95) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${open * (1 - open) * 2.2})`;
      ctx.lineWidth = 1.5 + 3 * open;
      ctx.beginPath(); ctx.moveTo(hingeX, 0); ctx.lineTo(hingeX + cLen, 0); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
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
    // Deploy-out boost jets: THE windup telegraph. As the ram charges, lateral booster pods
    // slide straight OUT from the flanks on a strut and light up yellow -> deep red toward
    // full commit; they stay extended and blazing through the lunge. Crucially the pods stay
    // axis-aligned — their exhaust points dead astern, same as the main thrusters, so all the
    // thrust drives the ram FORWARD. Pure visual — mechanics unchanged. Drawn before the hull.
    if (c > 0.03) {
      const jg = Math.round(205 - 150 * c), jb = Math.round(100 - 80 * c);   // yellow -> red
      const flick = 0.8 + 0.35 * Math.sin(t * 27);
      for (const sgn of [1, -1]) {
        const baseY = 0.46 * r * o.span * sgn;             // hull flank at the pod station
        const outY = baseY + (0.12 + 0.30 * c) * r * sgn;  // slides out as charge builds
        // deploy strut: hull -> pod, so the pod reads as extended rather than floating
        ctx.strokeStyle = plateFill; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-0.30 * r, baseY); ctx.lineTo(-0.30 * r, outY); ctx.stroke();
        ctx.save();
        ctx.translate(-0.30 * r, outY);                    // NO rotation — burn stays astern
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

    // Railship: the base pattern — sealed gun pod at rest; charging splits the shell
    // and the rail telescopes out to nearly double length at full charge.
    railship(ctx, r, s, P, t)    { railBody(ctx, r, s, P, t, { len: 1.35, ext: 1.05, back: 0.62, barrel: 0.16, rings: 2 }); },
    // Helion: the shell opens on beam ramp; short heavy barrel extends into a focusing
    // LENS RING that glows with the ramp — a solar furnace, not a sniper rifle.
    helion(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.05, ext: 0.5, back: 0.68, barrel: 0.19, rings: 2, useRamp: true });
      const ramp = Math.min(1, s.beamRamp || 0), lx = (1.05 + 0.5 * ramp) * r + 0.28 * r;
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
    // Star Piercer: siege pod — heavier shell, wider split, jaws hinge open at the
    // muzzle of the extending rail.
    starPiercer(ctx, r, s, P, t) { railBody(ctx, r, s, P, t, { len: 1.55, ext: 0.95, back: 0.80, barrel: 0.21, rings: 3, prong: 0.34, mawOpen: 1.6, cowlGap: 0.62 }); },
    // Supernova: the furnace gone critical — oversized lens, and a CORONA ring around the
    // whole hull that burns brighter as HEAT builds (the nova you're owed). Prominence arcs
    // grow agitated as the bar fills.
    supernova(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.05, ext: 0.55, back: 0.75, barrel: 0.21, rings: 3, useRamp: true, cowlGap: 0.62 });
      const ramp = Math.min(1, s.beamRamp || 0), lx = (1.05 + 0.55 * ramp) * r + 0.32 * r;
      const heatMax = (PULSAR.config.railship && PULSAR.config.railship.heat.max) || 100;
      const hf = Math.min(1, (s.heat || 0) / heatMax);
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(lx, 0, r * 0.52, 0, TAU);
      ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.5 + 0.5 * ramp})`;
      ctx.lineWidth = 2.5 + 3 * ramp; ctx.stroke();
      if (ramp > 0.02) {
        ctx.beginPath(); ctx.arc(lx, 0, r * (0.12 + 0.24 * ramp), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * ramp})`; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * (1.55 + 0.10 * Math.sin(t * 3)), 0, TAU);
      ctx.strokeStyle = `rgba(255,${Math.round(200 - 130 * hf)},90,${0.10 + 0.55 * hf})`;
      ctx.lineWidth = 1.5 + 3.5 * hf; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = t * (0.7 + 1.6 * hf) + (i / 3) * TAU;
        ctx.beginPath(); ctx.arc(0, 0, r * (1.7 + 0.22 * Math.sin(t * 5 + i * 2)), a, a + 0.5 + 0.5 * hf);
        ctx.strokeStyle = `rgba(255,${Math.round(190 - 120 * hf)},110,${0.15 + 0.45 * hf})`;
        ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    // Starbreak: heavier siege chassis — dorsal rift-blades with shimmering edges (space is
    // thin around this ship), and faint rift dashes flicker ahead of the maw as it charges.
    starbreak(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.75, ext: 1.30, back: 0.95, barrel: 0.23, rings: 4, prong: 0.42, mawOpen: 1.8, cowlGap: 0.68 });
      const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
      for (const sgn of [1, -1]) {
        poly(ctx, [[0.15 * r, 0.42 * r * sgn], [-0.25 * r, 1.05 * r * sgn], [-0.65 * r, 0.95 * r * sgn], [-0.55 * r, 0.38 * r * sgn]]);
        fillStroke(ctx, plateFill, 1.2);
        ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.4 + 0.3 * Math.sin(t * 9 + sgn)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-0.25 * r, 1.05 * r * sgn); ctx.lineTo(-0.65 * r, 0.95 * r * sgn); ctx.stroke();
      }
      const c = s.charging ? Math.min(1, s.charge || 0) : 0;
      if (c > 0.15) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.25 * c})`; ctx.lineWidth = 1.3;
        const muzzle = 1.75 + 1.30 * c + 0.85;    // extended rail + jaws
        for (let i = 0; i < 4; i++) {
          const x0 = (muzzle + 0.35 + i * 0.55 + 0.2 * Math.sin(t * 11 + i)) * r;
          ctx.beginPath(); ctx.moveTo(x0, -0.3 * r * c); ctx.lineTo(x0, 0.3 * r * c); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

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
    // Binary Star: Twinmaul's drums bridged by an energized tether manifold — the hull
    // advertises that the space BETWEEN the heads is the weapon.
    binaryStar(ctx, r, s, P, t) {
      MODELS.twinmaul(ctx, r, s, P, t);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,240,170,0.8)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, -0.38 * r); ctx.lineTo(0, 0.38 * r); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      const w = 0.10 * r * Math.sin(t * 23);
      ctx.beginPath(); ctx.moveTo(0, -0.38 * r); ctx.quadraticCurveTo(w, 0, 0, 0.38 * r); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
      for (const sgn of [1, -1]) {
        poly(ctx, [[0.14 * r, 0.38 * r * sgn], [0, 0.52 * r * sgn], [-0.14 * r, 0.38 * r * sgn], [0, 0.24 * r * sgn]]);
        fillStroke(ctx, plateFill, 1.1);
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
