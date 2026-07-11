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

  // ---- detailing toolkit (shared by the capital-ship models) ----------------
  // A filled polygon with the shared bright rim. Pass any fill; keeps the readable outline.
  function plate(ctx, pts, fill, lw) { poly(ctx, pts); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = RIM; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
  // Thin accent/panel line (hull greebling).
  function line(ctx, ax, ay, bx, by, style, lw) { ctx.strokeStyle = style; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  // A small running light: a bright dot with a soft additive halo.
  function light(ctx, x, y, rgb, rad) {
    rad = rad || 2.4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(x, y, rad * 2.3, 0, TAU); ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU);
    ctx.fillStyle = `rgba(${Math.min(255, rgb[0] + 90)},${Math.min(255, rgb[1] + 90)},${Math.min(255, rgb[2] + 90)},0.95)`; ctx.fill();
  }
  // Tinted cockpit canopy (an elongated glass blister with a highlight).
  function canopy(ctx, x, y, w, h, P) {
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, TAU);
    ctx.fillStyle = `rgba(${Math.round(P.rgb[0] * 0.5 + 120)},${Math.round(P.rgb[1] * 0.5 + 140)},${Math.round(P.rgb[2] * 0.5 + 160)},0.9)`; ctx.fill();
    ctx.strokeStyle = RIM; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + w * 0.18, y - h * 0.2, w * 0.42, h * 0.4, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();          // glass highlight
  }
  // Engine nacelle: an armored pod with a hot inner throat + honest thrust flare. The throat
  // (flare origin) sits at (throatX, y); the pod body extends +x toward the hull by podLen.
  function nacelle(ctx, s, throatX, y, w, podLen, P, t, plateFill) {
    plate(ctx, [[throatX, y - w * 0.5], [throatX + podLen, y - w * 0.4], [throatX + podLen, y + w * 0.4], [throatX, y + w * 0.5]], plateFill, 1.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.arc(throatX + w * 0.12, y, w * 0.32, 0, TAU);
    ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},0.6)`; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    engine(ctx, s, throatX, y, w * 0.85, P, t);
  }

  // Long capital-ship hull shared by the families: armor under-plate, plated spindle hull, keel +
  // transverse plating, rows of lit crew windows ("thousands aboard"), dorsal spine, bridge +
  // canopy, stern engine cluster, port/starboard nav lights, optional sensor mast. Grows LONGER
  // (not wider) and busier with tier. The family mounts its weapon on top. Returns the hull poly.
  // o = { nose, stern, beam, beamX, nacelles, windows, winY, bridgeX(null=none), mast, tier }
  function capitalHull(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    const darkFill = `rgba(${Math.round(P.rgb[0] * 0.18 + 6)},${Math.round(P.rgb[1] * 0.18 + 7)},${Math.round(P.rgb[2] * 0.18 + 11)},0.97)`;
    const nose = o.nose * r, stern = o.stern * r, beam = o.beam * r, beamX = (o.beamX != null ? o.beamX : o.nose * 0.1) * r;
    const tier = o.tier || 1, ww = Math.max(0.9, 0.055 * r);
    // stern engine cluster
    const en = o.nacelles || 2, ew = (en > 2 ? 0.17 : 0.22) * r;
    for (let i = 0; i < en; i++) { const ey = (i - (en - 1) / 2) * (beam * 1.6 / en); nacelle(ctx, s, stern - 0.02 * r, ey, ew, 0.3 * r, P, t, plateFill); }
    // hull spindle: under-plate (peeks at the flanks) then the body
    const hull = [[nose, 0], [nose * 0.6, beam * 0.55], [beamX, beam], [stern * 0.72, beam * 0.86], [stern, beam * 0.5],
                  [stern, -beam * 0.5], [stern * 0.72, -beam * 0.86], [beamX, -beam], [nose * 0.6, -beam * 0.55]];
    ctx.save(); ctx.scale(1.05, 1.14); plate(ctx, hull, darkFill, 1.4); ctx.restore();
    plate(ctx, hull, bodyFill, 1.6);
    // keel + transverse plating (denser on higher tiers)
    line(ctx, nose * 0.92, 0, stern * 0.9, 0, P.dim, 1);
    const plates = 3 + tier;
    for (let i = 1; i <= plates; i++) { const px = stern * 0.75 + (nose * 0.75 - stern * 0.75) * (i / (plates + 1)); line(ctx, px, beam * 0.72, px, -beam * 0.72, P.dim, 1); }
    // rows of lit crew windows
    const winY = (o.winY != null ? o.winY : o.beam * 0.55) * r, nW = o.windows || 7;
    for (const sgn of [1, -1]) for (let i = 0; i < nW; i++) { const x = stern * 0.6 + (nose * 0.55 - stern * 0.6) * (i / (nW - 1)); light(ctx, x, winY * sgn, [255, 236, 178], ww); }
    // dorsal spine
    plate(ctx, [[nose * 0.58, beam * 0.22], [stern * 0.82, beam * 0.2], [stern * 0.82, -beam * 0.2], [nose * 0.58, -beam * 0.22]], plateFill, 1.1);
    // bridge superstructure + canopy
    if (o.bridgeX != null) {
      const bx = o.bridgeX * r;
      plate(ctx, [[bx + 0.34 * r, beam * 0.44], [bx - 0.3 * r, beam * 0.6], [bx - 0.3 * r, -beam * 0.6], [bx + 0.34 * r, -beam * 0.44]], plateFill, 1.3);
      canopy(ctx, bx + 0.04 * r, 0, 0.5 * beam, 0.34 * beam, P);
    }
    // nav lights + optional forward sensor mast
    light(ctx, beamX, beam, [255, 80, 80], Math.max(1.2, 0.075 * r));
    light(ctx, beamX, -beam, [90, 255, 130], Math.max(1.2, 0.075 * r));
    if (o.mast) { line(ctx, nose, 0, nose + 0.28 * r, 0, P.accent, 1.4); light(ctx, nose + 0.28 * r, 0, P.rgb, Math.max(1.1, 0.06 * r)); }
    return hull;
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
    // ENERGY level: charge (held past full = overcharge) or beam ramp. Drives the GLOW —
    // capacitor rings, energy sleeve, muzzle bloom, essence core — and drops to 0 the instant
    // the shot leaves (the energy is spent).
    const chRaw = o.useRamp ? (s.beamRamp || 0)
                : Math.max(s.charging ? (s.charge || 0) : 0,
                           (s.beamTimer || 0) > 0 ? (s.beamPower || 0) : 0);
    const ch = Math.min(1, chRaw);
    // MECHANICAL deployment (0 = folded shut, 1 = fully extended). Snaps OPEN to track the
    // charge, but after firing it FOLDS SHUT smoothly over foldSec instead of snapping — the
    // clamshell closes and the barrel retracts together, finishing EXACTLY as the gun's fire
    // cooldown expires (a closed shell == ready to fire again). Render-only, eased off the sim
    // clock `t` (persists on the ship object). foldSec is the class's real post-fire lockout:
    // the maw classes have an explicit recycle cooldown; the base/beam rails have no discrete
    // cooldown, so we use their recharge-to-ready time instead.
    const RC = (PULSAR.config && PULSAR.config.railship) || {};
    const foldSec = o.prong ? ((RC.mawRail && RC.mawRail.recycleSec) || 1.4)
                            : ((RC.charge && RC.charge.timeToFullSec) || 1.05);
    let dep = s._railDeploy;
    if (dep == null) dep = ch;
    else if (ch >= dep) dep = ch;                 // opening tracks the charge with no lag
    else dep = Math.max(ch, dep - Math.min(0.1, Math.max(0, t - (s._railT || t))) / foldSec);
    s._railDeploy = dep; s._railT = t;
    const open = Math.min(1, dep * 1.5);          // clamshell halves ride the deployment
    const bl = (o.len + (o.ext || 0) * dep) * r;  // barrel telescopes out/in with deployment
    const bh = o.barrel * r;

    // --- rear hull: a proper warship crew section behind the gun (grows with tier via o.rings)
    const darkFill = `rgba(${Math.round(P.rgb[0] * 0.18 + 6)},${Math.round(P.rgb[1] * 0.18 + 7)},${Math.round(P.rgb[2] * 0.18 + 11)},0.97)`;
    const stern = -1.8 * r, back = o.back * r;
    for (const ey of [-0.16 * r, 0.16 * r]) nacelle(ctx, s, stern, ey, 0.18 * r, 0.32 * r, P, t, plateFill);
    const rear = [[-0.15 * r, 0.34 * r], [-0.95 * r, back * 0.92], [stern, 0.17 * r], [stern, -0.17 * r], [-0.95 * r, -back * 0.92], [-0.15 * r, -0.34 * r]];
    ctx.save(); ctx.scale(1.04, 1.12); plate(ctx, rear, darkFill, 1.3); ctx.restore();
    plate(ctx, rear, bodyFill, 1.5);
    const nW = 3 + o.rings;
    for (const sgn of [1, -1]) for (let i = 0; i < nW; i++) { const x = stern * 0.82 + (-0.25 * r - stern * 0.82) * (i / (nW - 1)); light(ctx, x, 0.17 * r * sgn, [255, 236, 178], Math.max(0.9, 0.05 * r)); }
    plate(ctx, [[-0.2 * r, 0.08 * r], [-1.55 * r, 0.07 * r], [-1.55 * r, -0.07 * r], [-0.2 * r, -0.07 * r]], plateFill, 1.0);   // spine
    canopy(ctx, -0.46 * r, 0, 0.13 * r, 0.09 * r, P);
    light(ctx, -0.92 * r, back * 0.86, [255, 80, 80], Math.max(1.1, 0.06 * r));
    light(ctx, -0.92 * r, -back * 0.86, [90, 255, 130], Math.max(1.1, 0.06 * r));
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
    // Siege muzzle (maw classes): the tip no longer HINGES OPEN — the whole clamshell already
    // does that, so a separately-opening tip read as doubly-opening and looked wrong. Instead
    // the charge condenses as an essence core that swells at the muzzle: the "shot about to
    // exist", growing with charge (this IS the siege tell now).
    if (o.prong && ch > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(bl + 0.10 * r, 0, r * (0.10 + 0.40 * ch), 0, TAU);
      ctx.fillStyle = `rgba(${P.rgb[0]},${P.rgb[1]},${P.rgb[2]},${0.35 + 0.45 * ch})`; ctx.fill();
      ctx.beginPath(); ctx.arc(bl + 0.10 * r, 0, r * (0.05 + 0.18 * ch), 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * ch})`; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
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
  // A heavy assault GUNSHIP: an armored fuselage with swept wings and clustered engine
  // nacelles, all mass leaning into a reinforced ram prow (the weapon). Each tier is bigger
  // and more complex — more nacelles, more wings, heavier armor. o = { front, span, teeth,
  // ridge, nacelles, wings, armor(1..3) }.
  function hammerBody(ctx, r, s, P, t, o) {
    const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    const darkFill = `rgba(${Math.round(P.rgb[0] * 0.18 + 6)},${Math.round(P.rgb[1] * 0.18 + 7)},${Math.round(P.rgb[2] * 0.18 + 11)},0.97)`;
    const c = s.ramActive > 0 ? 1 : (s.ramWinding ? (s.ramCharge || 0) : 0);
    const sp = o.span * r, f = o.front * r, armor = o.armor || 1;

    // --- (1) ram-windup boost pods: slide OUT from the flanks, exhaust dead astern (drawn under)
    if (c > 0.03) {
      const jg = Math.round(205 - 150 * c), jb = Math.round(100 - 80 * c);
      const flick = 0.8 + 0.35 * Math.sin(t * 27);
      for (const sgn of [1, -1]) {
        const baseY = 0.5 * sp * sgn, outY = baseY + (0.14 + 0.34 * c) * r * sgn;
        line(ctx, -0.30 * r, baseY, -0.30 * r, outY, plateFill, 3.5);      // deploy strut
        ctx.save(); ctx.translate(-0.30 * r, outY);
        plate(ctx, [[0.36 * r, -0.10 * r], [-0.44 * r, -0.15 * r], [-0.54 * r, 0], [-0.44 * r, 0.15 * r], [0.36 * r, 0.10 * r]], plateFill, 1.1);
        ctx.globalCompositeOperation = 'lighter';
        const fl = r * (0.55 + 1.25 * c) * flick;
        poly(ctx, [[-0.5 * r, -0.2 * r], [-0.5 * r, 0.2 * r], [-0.5 * r - fl * 1.15, 0]]);
        ctx.fillStyle = `rgba(255,${Math.round(jg * 0.7)},${jb},${0.28 + 0.3 * c})`; ctx.fill();
        poly(ctx, [[-0.52 * r, -0.12 * r], [-0.52 * r, 0.12 * r], [-0.52 * r - fl, 0]]);
        ctx.fillStyle = `rgba(255,${jg},${jb},${0.65 + 0.35 * c})`; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }
    }

    // --- (2) engine nacelles clustered at the stern
    const en = o.nacelles, ew = (en > 2 ? 0.30 : 0.36) * r;
    for (let i = 0; i < en; i++) {
      const ey = (i - (en - 1) / 2) * (en > 2 ? 0.62 : 0.66) * r * (o.span / 1.05);
      nacelle(ctx, s, -1.35 * r, ey, ew, 0.5 * r, P, t, plateFill);
    }
    // rear thruster deck tying the nacelles to the hull
    plate(ctx, [[-0.55 * r, 0.42 * sp], [-0.9 * r, 0.34 * sp], [-0.9 * r, -0.34 * sp], [-0.55 * r, -0.42 * sp]], darkFill, 1.2);

    // --- (3) swept wings (extra canard pair on the heaviest tier)
    const wingPairs = o.wings || 1;
    for (let w = 0; w < wingPairs; w++) {
      const back = w === 0;                              // main wing sweeps back; canard forward
      for (const sgn of [1, -1]) {
        if (back) {
          // main wing: broad delta swept back+out from the shoulder, tip well clear of the hull
          plate(ctx, [[0.3 * r, 0.48 * sp * sgn], [0.05 * r, 1.42 * r * sgn], [-0.78 * r, 1.5 * r * sgn], [-0.62 * r, 0.44 * sp * sgn]], plateFill, 1.3);
          line(ctx, 0.28 * r, 0.5 * sp * sgn, 0.02 * r, 1.4 * r * sgn, P.accent, 1.8);        // bright leading edge
          line(ctx, -0.2 * r, 0.9 * r * sgn, -0.6 * r, 1.1 * r * sgn, P.dim, 1);              // panel crease
          light(ctx, -0.72 * r, 1.44 * r * sgn, P.rgb, 2.4);                                  // wingtip light
        } else {
          // canard: forward fin near the prow (heaviest tier only)
          plate(ctx, [[0.78 * r, 0.32 * sp * sgn], [1.08 * r, 0.98 * r * sgn], [0.72 * r, 1.02 * r * sgn], [0.5 * r, 0.4 * sp * sgn]], plateFill, 1.2);
          line(ctx, 0.78 * r, 0.34 * sp * sgn, 1.06 * r, 0.96 * r * sgn, P.accent, 1.5);
          light(ctx, 0.96 * r, 0.98 * r * sgn, P.rgb, 2.0);
        }
      }
    }

    // --- (4) hull: base armor plate under a shaped fuselage, with a dorsal spine + paneling
    plate(ctx, [[0.66 * r, 0.64 * sp], [0.66 * r, -0.64 * sp], [-0.6 * r, -0.5 * sp], [-1.0 * r, -0.3 * sp], [-1.0 * r, 0.3 * sp], [-0.6 * r, 0.5 * sp]], darkFill, 1.5);
    plate(ctx, [[0.6 * r, 0.56 * sp], [0.6 * r, -0.56 * sp], [-0.56 * r, -0.44 * sp], [-0.92 * r, -0.26 * sp], [-0.92 * r, 0.26 * sp], [-0.56 * r, 0.44 * sp]], bodyFill, 1.5);
    // panel lines
    line(ctx, 0.5 * r, 0.28 * sp, -0.85 * r, 0.2 * sp, P.dim, 1);
    line(ctx, 0.5 * r, -0.28 * sp, -0.85 * r, -0.2 * sp, P.dim, 1);
    // dorsal spine
    plate(ctx, [[0.52 * r, 0.15 * sp], [-0.85 * r, 0.11 * sp], [-0.85 * r, -0.11 * sp], [0.52 * r, -0.15 * sp]], plateFill, 1.2);
    for (let i = 0; i < 2 + armor; i++) { const px = 0.4 * r - i * 0.32 * r; line(ctx, px, 0.13 * sp, px, -0.13 * sp, P.dim, 1); }
    // heavier tiers carry extra dorsal greeble blocks
    if (armor >= 2) for (const sgn of [1, -1]) plate(ctx, [[-0.2 * r, 0.24 * sp * sgn], [-0.5 * r, 0.24 * sp * sgn], [-0.5 * r, 0.36 * sp * sgn], [-0.2 * r, 0.36 * sp * sgn]], darkFill, 1);
    canopy(ctx, 0.34 * r, 0, 0.2 * r, 0.13 * r, P);
    // crew windows + port/starboard nav lights (fleet consistency)
    for (const sgn of [1, -1]) for (let i = 0; i < 4 + armor; i++) light(ctx, -0.8 * r + i * 0.28 * r, 0.32 * sp * sgn, [255, 236, 178], Math.max(0.9, 0.05 * r));
    light(ctx, 0.55 * r, 0.6 * sp, [255, 80, 80], Math.max(1.1, 0.06 * r));
    light(ctx, 0.55 * r, -0.6 * sp, [90, 255, 130], Math.max(1.1, 0.06 * r));

    // --- (5) ram prow: reinforcement struts + heavy armor face (the weapon)
    for (const sgn of [1, -1]) line(ctx, 0.55 * r, 0.42 * sp * sgn, f * 0.86, 0.7 * sp * sgn, plateFill, 3);
    if (o.teeth) {
      const pts = [[0.55 * r, sp], [f, sp]];
      for (let i = 0; i < o.teeth; i++) { const y1 = sp - (i + 0.35) * (2 * sp) / o.teeth, y2 = sp - (i + 1) * (2 * sp) / o.teeth; pts.push([f + 0.16 * r, y1], [f, y2]); }
      pts.push([0.55 * r, -sp]); plate(ctx, pts, plateFill, 1.7);
    } else {
      plate(ctx, [[0.55 * r, sp], [f, sp * 0.9], [f + 0.12 * r, 0], [f, -sp * 0.9], [0.55 * r, -sp]], plateFill, 1.7);
    }
    // rivets down the face
    ctx.fillStyle = 'rgba(235,245,255,0.8)';
    for (let i = 0; i < 3 + armor; i++) { const ry = (i - (2 + armor) / 2) * sp * (1.6 / (3 + armor)); ctx.beginPath(); ctx.arc(0.74 * r, ry, 0.06 * r, 0, TAU); ctx.fill(); }
    // molten leading edge — heats orange -> white-hot with the ram windup
    const edgeX = f + (o.teeth ? 0.16 * r : 0.12 * r);
    ctx.strokeStyle = c > 0 ? `rgba(255,${Math.round(150 + 105 * c)},${Math.round(60 + 160 * c)},${0.5 + 0.5 * c})` : P.dim;
    ctx.lineWidth = 2 + 3 * c;
    ctx.beginPath(); ctx.moveTo(edgeX, -sp * 0.86); ctx.lineTo(edgeX, sp * 0.86); ctx.stroke();
    if (c > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,${Math.round(140 + 100 * c)},60,${0.4 * c})`; ctx.lineWidth = 4 + 8 * c; ctx.beginPath(); ctx.moveTo(edgeX, -sp * 0.86); ctx.lineTo(edgeX, sp * 0.86); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
    // cleaving ridge (Worldsplitter)
    if (o.ridge) {
      plate(ctx, [[f, 0.2 * r], [f + o.ridge * r, 0], [f, -0.2 * r]], plateFill, 1.4);
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(f - 0.3 * r, sp * 0.5); ctx.lineTo(f - 0.06 * r, sp * 0.22);
      ctx.moveTo(f - 0.3 * r, -sp * 0.5); ctx.lineTo(f - 0.06 * r, -sp * 0.22); ctx.stroke();
    }

    // --- (6) BRACE ability: hardened hex shield shimmer over the hull
    const brace = Math.min(1, (s.braceTimer || 0) / 0.5);
    if (brace > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,${Math.round(160 + 60 * brace)},110,${0.35 * brace + 0.15 * Math.sin(t * 18)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const hr = 1.15 * r;
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + t * 0.4; const X = Math.cos(a) * hr, Y = Math.sin(a) * hr * o.span; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ============================ GRAV FAMILY ===================================
  // A long carrier that cradles an exposed gravity core out ahead of the bow. Artillery branch
  // adds a launch rail; control branch wraps a void core in containment rings + field vanes.
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
  // Gravitor as a long warship that CRADLES its gravity core out ahead of the bow in a pair of
  // containment prongs. Artillery branch grows a launch rail through the cradle; control branch
  // wraps the (void) core in counter-rotating containment rings + field vanes.
  function gravShip(ctx, r, s, P, t, o) {
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    if (o.vanes) fieldVanes(ctx, r, P, t, o.vanes, 1.35);
    capitalHull(ctx, r, s, P, t, { nose: 0.95, stern: -1.6, beam: 0.36, beamX: -0.3, nacelles: o.nacelles, windows: o.windows, bridgeX: -0.3, tier: o.tier });
    const cx = o.coreX * r;
    // forward containment cradle: two prongs from the bow reaching around the core
    for (const sgn of [1, -1]) {
      plate(ctx, [[0.82 * r, 0.16 * r * sgn], [cx + 0.34 * r, 0.4 * r * sgn], [cx + 0.02 * r, 0.14 * r * sgn], [0.82 * r, 0.02 * r * sgn]], plateFill, 1.2);
      line(ctx, cx + 0.34 * r, 0.4 * r * sgn, cx + 0.52 * r, 0.32 * r * sgn, P.accent, 1.5);   // emitter tip
      if (o.horn) light(ctx, cx + 0.52 * r, 0.32 * r * sgn, P.rgb, Math.max(1.2, 0.07 * r));
    }
    if (o.launchRail) plate(ctx, [[0.7 * r, 0.09 * r], [cx + 0.75 * r, 0], [0.7 * r, -0.09 * r]], plateFill, 1.2);  // volley rail
    if (o.ringN) { ctx.strokeStyle = P.dim; ctx.lineWidth = 1.7; for (let i = 0; i < o.ringN; i++) { const a0 = -t * 0.5 + (i / o.ringN) * TAU; ctx.beginPath(); ctx.arc(cx, 0, (o.coreR + 0.28 + i * 0.14) * r, a0, a0 + 1.6); ctx.stroke(); } }
    gravCore(ctx, r, s, P, t, { coreX: o.coreX, coreR: o.coreR, voidCore: o.voidCore });
  }

  // ============================ FLAIL FAMILY ==================================
  // A working tug: hex hull, front chain-guide yoke, and a big winch drum whose
  // spokes spin with the orb — the machine that swings the wrecking ball.
  // spokes spin with the orb — the machine that swings the wrecking ball. Now a long salvage
  // WARSHIP with the winch drivetrain mounted forward; the heads/swords are drawn in game.js.
  function flailBody(ctx, r, s, P, t, o) {
    const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
    capitalHull(ctx, r, s, P, t, { nose: 0.95, stern: -1.7, beam: 0.42, beamX: -0.25, nacelles: o.nacelles || 2, windows: o.windows || 8, bridgeX: -0.45, tier: o.tier });
    // chain-guide yoke at the bow (twin prongs the chain feeds through)
    for (const sgn of [1, -1]) plate(ctx, [[0.85 * r, 0.15 * r * sgn], [1.4 * r, 0.3 * r * sgn], [0.95 * r, 0.44 * r * sgn]], plateFill, 1.1);
    if (o.shoulders) for (const sgn of [1, -1]) {   // armored winch cheeks
      plate(ctx, [[0.72 * r, 0.4 * r * sgn], [0.36 * r, 0.72 * r * sgn], [-0.05 * r, 0.7 * r * sgn], [0.1 * r, 0.36 * r * sgn]], plateFill, 1.2);
      ctx.fillStyle = 'rgba(235,245,255,0.7)'; ctx.beginPath(); ctx.arc(0.28 * r, 0.55 * r * sgn, 0.05 * r, 0, TAU); ctx.fill();
    }
    // winch drum(s) — the drivetrain, spinning with the orb (twin drums counter-rotate)
    const dr = (o.drum || 0.4) * r, dx = 0.42 * r;
    const drums = o.twin ? [0.42 * r, -0.42 * r] : [0];
    drums.forEach((dy, idx) => {
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fillStyle = plateFill; ctx.fill();
      ctx.strokeStyle = RIM; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
      const spin = o.twin ? (idx === 0 ? (s.orbSelfSpin || 0) : -(s.orbSelfSpin2 != null ? s.orbSelfSpin2 : (s.orbSelfSpin || 0))) : (s.orbSpin || 0);
      for (let i = 0; i < 3; i++) { const a0 = spin + (i / 3) * TAU; ctx.beginPath(); ctx.moveTo(dx + Math.cos(a0) * dr * 0.25, dy + Math.sin(a0) * dr * 0.25); ctx.lineTo(dx + Math.cos(a0) * dr * 0.9, dy + Math.sin(a0) * dr * 0.9); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(dx, dy, dr * 0.2, 0, TAU); ctx.fill();
    });
    // binaryStar: energized tether manifold bridging the two drums
    if (o.tether) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,240,170,0.8)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(dx, -0.42 * r); ctx.lineTo(dx, 0.42 * r); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      const w = 0.1 * r * Math.sin(t * 23);
      ctx.beginPath(); ctx.moveTo(dx, -0.42 * r); ctx.quadraticCurveTo(dx + w, 0, dx, 0.42 * r); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---- model registry (visuals.js `silhouette` names -> draw fns) ------------
  const MODELS = {
    // Starter: a small CORVETTE — the smallest real warship in the fleet. Long slender hull
    // (length >> beam), a bridge superstructure, a stern engine cluster, and rows of lit windows
    // so it reads as a crewed vessel, not an arrowhead. The seed the capital ships grow from.
    dart(ctx, r, s, P, t) {
      const bodyFill = s.hitFlash > 0 ? FLASH.body : P.body;
      const plateFill = s.hitFlash > 0 ? FLASH.plate : P.plate;
      const darkFill = `rgba(${Math.round(P.rgb[0] * 0.18 + 6)},${Math.round(P.rgb[1] * 0.18 + 7)},${Math.round(P.rgb[2] * 0.18 + 11)},0.97)`;
      // slender hull outline (bow at +x, blunt stern at -x)
      const hull = [[1.7 * r, 0], [0.95 * r, 0.2 * r], [0.15 * r, 0.32 * r], [-1.05 * r, 0.27 * r],
                    [-1.4 * r, 0.15 * r], [-1.4 * r, -0.15 * r], [-1.05 * r, -0.27 * r], [0.15 * r, -0.32 * r], [0.95 * r, -0.2 * r]];
      // stern engine cluster (twin nacelles)
      for (const ey of [-0.14 * r, 0.14 * r]) nacelle(ctx, s, -1.48 * r, ey, 0.2 * r, 0.32 * r, P, t, plateFill);
      // dark armor under-plate (slightly larger, peeks at the flanks) then the hull body
      ctx.save(); ctx.scale(1.05, 1.16); plate(ctx, hull, darkFill, 1.3); ctx.restore();
      plate(ctx, hull, bodyFill, 1.5);
      // transverse plating + a couple of hull seams
      for (const px of [0.55 * r, 0.0, -0.6 * r]) line(ctx, px, 0.26 * r, px, -0.26 * r, P.dim, 1);
      line(ctx, 1.6 * r, 0, -1.3 * r, 0, P.dim, 1);                       // keel line
      // rows of lit windows — the "decks full of crew" read
      for (const sgn of [1, -1]) for (let i = 0; i < 7; i++) light(ctx, -0.85 * r + i * 0.27 * r, 0.18 * r * sgn, [255, 236, 178], 1.1);
      // dorsal spine + bridge superstructure with a canopy
      plate(ctx, [[1.0 * r, 0.07 * r], [-1.15 * r, 0.06 * r], [-1.15 * r, -0.06 * r], [1.0 * r, -0.06 * r]], plateFill, 1.1);
      plate(ctx, [[0.55 * r, 0.14 * r], [-0.12 * r, 0.19 * r], [-0.12 * r, -0.19 * r], [0.55 * r, -0.14 * r]], plateFill, 1.3);
      canopy(ctx, 0.26 * r, 0, 0.17 * r, 0.1 * r, P);
      // bright prow rake + a forward sensor mast
      line(ctx, 1.68 * r, 0, 0.95 * r, 0.2 * r, P.accent, 1.5);
      line(ctx, 1.68 * r, 0, 0.95 * r, -0.2 * r, P.accent, 1.5);
      line(ctx, 1.7 * r, 0, 2.0 * r, 0, P.accent, 1.3); light(ctx, 2.0 * r, 0, P.rgb, 1.3);
      // port/starboard navigation lights
      light(ctx, 0.12 * r, 0.31 * r, [255, 80, 80], 1.5);
      light(ctx, 0.12 * r, -0.31 * r, [90, 255, 130], 1.5);
    },

    // Railship: the base pattern — sealed gun pod at rest; charging splits the shell
    // and the rail telescopes out to nearly double length at full charge.
    railship(ctx, r, s, P, t)    { railBody(ctx, r, s, P, t, { len: 1.35, ext: 1.05, back: 0.62, barrel: 0.16, rings: 2 }); },
    // Helion: the shell opens on beam ramp; short heavy barrel extends into a focusing
    // LENS RING that glows with the ramp — a solar furnace, not a sniper rifle.
    helion(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.05, ext: 0.5, back: 0.68, barrel: 0.19, rings: 2, useRamp: true });
      const ramp = Math.min(1, s.beamRamp || 0), dep = s._railDeploy != null ? s._railDeploy : ramp;
      const lx = (1.05 + 0.5 * dep) * r + 0.28 * r;   // lens rides the retracting muzzle
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
    starPiercer(ctx, r, s, P, t) { railBody(ctx, r, s, P, t, { len: 1.55, ext: 0.95, back: 0.80, barrel: 0.21, rings: 3, prong: true, cowlGap: 0.62 }); },
    // Supernova: the furnace gone critical — oversized lens, and a CORONA ring around the
    // whole hull that burns brighter as HEAT builds (the nova you're owed). Prominence arcs
    // grow agitated as the bar fills.
    supernova(ctx, r, s, P, t) {
      railBody(ctx, r, s, P, t, { len: 1.05, ext: 0.55, back: 0.75, barrel: 0.21, rings: 3, useRamp: true, cowlGap: 0.62 });
      const ramp = Math.min(1, s.beamRamp || 0), dep = s._railDeploy != null ? s._railDeploy : ramp;
      const lx = (1.05 + 0.55 * dep) * r + 0.32 * r;   // lens rides the retracting muzzle
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
      railBody(ctx, r, s, P, t, { len: 1.75, ext: 1.30, back: 0.95, barrel: 0.23, rings: 4, prong: true, cowlGap: 0.68 });
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
        const muzzle = 1.75 + 1.30 * c;           // extended rail tip (jaws removed)
        for (let i = 0; i < 4; i++) {
          const x0 = (muzzle + 0.55 + i * 0.55 + 0.2 * Math.sin(t * 11 + i)) * r;
          ctx.beginPath(); ctx.moveTo(x0, -0.3 * r * c); ctx.lineTo(x0, 0.3 * r * c); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

    // Hammerhead line grows tier by tier: more nacelles, more wings, heavier armor + prow.
    hammerhead(ctx, r, s, P, t)    { hammerBody(ctx, r, s, P, t, { front: 1.6, span: 0.86, teeth: 0, nacelles: 2, wings: 1, armor: 1 }); },
    maulbreaker(ctx, r, s, P, t)   { hammerBody(ctx, r, s, P, t, { front: 1.75, span: 1.04, teeth: 4, nacelles: 2, wings: 1, armor: 2 }); },
    worldsplitter(ctx, r, s, P, t) { hammerBody(ctx, r, s, P, t, { front: 1.9, span: 1.3, teeth: 0, nacelles: 3, wings: 2, armor: 3, ridge: 0.45 }); },

    // Gravitor line: a long carrier that cradles a gravity core out front. Each tier is bigger —
    // more nacelles + windows, bigger core, then the control branch's containment rings/vanes.
    gravitor(ctx, r, s, P, t)  { gravShip(ctx, r, s, P, t, { coreX: 1.5, coreR: 0.30, nacelles: 2, windows: 7, horn: true, tier: 1 }); },
    meteorist(ctx, r, s, P, t) { gravShip(ctx, r, s, P, t, { coreX: 1.55, coreR: 0.34, nacelles: 2, windows: 8, horn: true, tier: 2 }); },
    starfall(ctx, r, s, P, t)  { gravShip(ctx, r, s, P, t, { coreX: 1.5, coreR: 0.36, nacelles: 3, windows: 9, horn: true, launchRail: true, tier: 2 }); },
    singularity(ctx, r, s, P, t)  { gravShip(ctx, r, s, P, t, { coreX: 1.4, coreR: 0.36, nacelles: 2, windows: 8, voidCore: true, vanes: 3, ringN: 2, tier: 2 }); },
    eventHorizon(ctx, r, s, P, t) { gravShip(ctx, r, s, P, t, { coreX: 1.35, coreR: 0.42, nacelles: 3, windows: 10, voidCore: true, vanes: 4, ringN: 3, tier: 3 }); },

    // Flail line: a long salvage warship, winch drivetrain forward. Twinmaul doubles the drums;
    // Binary Star bridges them with the energized tether manifold. Each tier grows.
    flailship(ctx, r, s, P, t) { flailBody(ctx, r, s, P, t, { drum: 0.4, nacelles: 2, windows: 8, tier: 1 }); },
    twinmaul(ctx, r, s, P, t)  { flailBody(ctx, r, s, P, t, { twin: true, drum: 0.34, shoulders: true, nacelles: 2, windows: 9, tier: 2 }); },
    binaryStar(ctx, r, s, P, t) { flailBody(ctx, r, s, P, t, { twin: true, drum: 0.34, shoulders: true, tether: true, nacelles: 3, windows: 10, tier: 3 }); },
  };

  function modelFor(classId) {
    const v = PULSAR.classVisuals[classId];
    return (v && MODELS[v.silhouette]) || MODELS.dart;
  }

  // Capital-ship point-defense: big hulls bristle with anti-fighter batteries that flicker fire —
  // a "this thing is a warship" tell that escalates with size (more guns, faster on the biggest).
  function pointDefense(ctx, r, t) {
    const n = r > 60 ? 7 : r > 44 ? 5 : 4;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + i * 1.7 + Math.sin(t * 0.6 + i) * 0.4;    // battery sweeps its arc
      if (Math.sin(t * 9 + i * 5.1) < 0.25) continue;                     // rapid, staggered bursts
      const ex = Math.cos(a), ey = Math.sin(a), bx = ex * r * 0.82, by = ey * r * 0.5;   // battery at the hull edge
      ctx.fillStyle = 'rgba(255,228,150,0.5)'; ctx.beginPath(); ctx.arc(bx, by, Math.max(3, r * 0.075), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,250,215,0.98)'; ctx.beginPath(); ctx.arc(bx, by, Math.max(1.5, r * 0.032), 0, TAU); ctx.fill();
      const tl = r * (0.3 + 0.45 * ((t * 5 + i) % 1));                     // brief outward tracer
      ctx.strokeStyle = 'rgba(255,240,185,0.6)'; ctx.lineWidth = Math.max(1, r * 0.016);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ex * tl, by + ey * tl * 0.62); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Entry point. ctx must already be translated to the ship and rotated by aim.
  function draw(ctx, s, time) {
    const hue = PULSAR.weaponHue(s.classId);
    modelFor(s.classId)(ctx, s.radius, s, palette(hue), time);
    if (s.radius > 34) pointDefense(ctx, s.radius, time);   // tier-2+ hulls get active gun batteries
  }

  return { draw };
})();
