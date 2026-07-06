// PULSAR.io — GAME (entry: input → intent, world orchestration, render/HUD)
// Phase 5 — ONE simulation code path. The sim lives in src/sim.js (PULSAR.createWorld):
// single-player steps a local world; connected to mpserver.js the client goes thin
// (src/mpclient.js — send intent, render authoritative snapshots with prediction for
// your own ship). This file owns input, the render pipeline, and the HUD — no game rules.
// Tunables in data/config.js.
window.PULSAR = window.PULSAR || {};

(function () {
  const cfg = PULSAR.config;
  const eco = cfg.economy;
  const pk = cfg.pickups;
  const Input = PULSAR.Input;
  const Render = PULSAR.Render;
  const Fx = PULSAR.Fx;
  const hueFor = PULSAR.weaponHue;
  const TAU = Math.PI * 2;
  const DT = 1 / cfg.sim.tickRate;
  const lerp = (a, b, t) => a + (b - a) * t;

  const OBJDEF = {
    asteroid: { hp: 'asteroidHP', radius: 'asteroidRadius', scrap: 'scrapPerAsteroid', hue: '#6b7280' },
    crystal:  { hp: 'crystalHP',  radius: 'crystalRadius',  scrap: 'scrapPerCrystal',  hue: '#5eead4' },
    debris:   { hp: 'debrisHP',   radius: 'debrisRadius',   scrap: 'scrapPerDebris',   hue: '#7b8694' },
    titan:    { hp: 'titanHP',    radius: 'titanRadius',    scrap: 'scrapPerTitan',    hue: '#9aa7c2' },
  };
  const FAMILY = {
    starter: 'dart',
    railship: 'rail', helion: 'rail', starPiercer: 'rail', supernova: 'rail', starbreak: 'rail',
    hammerhead: 'hammer', maulbreaker: 'hammer', worldsplitter: 'hammer',
    gravitor: 'grav', meteorist: 'grav', starfall: 'grav', singularity: 'grav', eventHorizon: 'grav',
    flailship: 'flail', twinmaul: 'flail', binaryStar: 'flail',
  };
  const EVOLVE_BLURB = {
    railship: 'charge beam · heat · Vent Dash', hammerhead: 'wind-up lunge · Brace',
    gravitor: 'auto-pulls rocks · condenses PEBBLES when dry', flailship: 'SPIKED MACE — hold to SPIN UP, release to fling',
    helion: 'SUSTAIN BEAM — dmg ramps while held, heat compounds', starPiercer: 'SIEGE MAW — charge WIDENS the beam · BROKEN CORE [E]',
    maulbreaker: '+ram reach · +knockback', worldsplitter: 'full-lunge SHOCKWAVE · slam burst [E]',
    meteorist: 'holds 3 rocks · harder throws', starfall: 'hold 9, hurl 3, no cooldown · BARRAGE [E]',
    singularity: 'well SLOWS enemies (tidal drag)', eventHorizon: 'COLLAPSE the well [E]',
    twinmaul: 'TWO maces — LMB volley · RMB both at once · STATIC LASH [E]',
    supernova: 'FLARE NOVA [E] — dump ALL heat as a blast · clears vent lockout',
    starbreak: 'blasts tear a RIFT that detonates the line moments later',
    binaryStar: 'live TETHER between the maces — crossing it burns · garrote throws',
  };

  // ---- world (ONE code path: sim.js) ------------------------------------------
  // SP steps this world locally every tick — the exact PULSAR.createWorld the authoritative
  // server runs, so game.js and sim.js can never drift again. When connected to mpserver the
  // world is never stepped; it serves as the render container MP.syncState fills.
  const world = PULSAR.createWorld({
    fx: Fx,
    onKill(v, killer) {
      addKill(killer && killer !== v ? nameOf(killer) : null, nameOf(v), v.isLeader);
      if (v === p && gameStarted && PULSAR.Profile) {   // Phase 6: end-of-life converts earned scrap -> permanent cores
        const gained = PULSAR.Profile.bankRun(v.xp, v.scrap);
        if (gained > 0) Fx.spawnText(v.x, v.y - 52, '+' + gained + ' ◆ CORES', '#8fe9ff', { size: 16 });
      }
    },
  });
  const state = world.state;
  const p = world.addShip({ isBot: false, classId: 'starter' });
  // input edge-state lives on the player object (sim.js's factory doesn't create these)
  p._firePrev = false; p._abilityPrev = false; p._specialPrev = false; p._adminPrev = false;
  p._burnPrev = false; p._altPrev = false; p._suppressFire = false;
  p._numPrev = [false, false, false, false, false];
  if (!(PULSAR.MP && PULSAR.MP.AUTH)) world.spawnBots(cfg.bots.count);
  function toggleBots() { if (world.countBots()) world.clearBots(); else world.spawnBots(cfg.bots.count); }
  const allShips = () => {
    if (PULSAR.MP && PULSAR.MP.connected) { const a = [p]; const rs = PULSAR.MP.remotes; for (let i = 0; i < rs.length; i++) a.push(rs[i]); return a; }
    return state.ships;
  };

  // ---- class/progression helpers (render + controls only; the logic lives in sim.js) ---------
  function classNode(id) { return PULSAR.classes[id]; }
  function adminLevelUp() {
    if (!p.alive) return;
    if (PULSAR.MP && PULSAR.MP.connected) { PULSAR.MP.sendAdmin('levelUp'); return; }   // authority applies it; LEVEL text comes back via fx
    world.earn(p, Math.max(world.xpForLevel(p.level + 1) - p.xp + 1, eco.evolutionCosts.class));
    Fx.spawnText(p.x, p.y - 52, 'ADMIN +LVL', '#ff9bf0', { size: 16 });
  }

  // ---- title / name / killfeed ----------------------------------------------
  let gameStarted = false;
  const killFeed = [];
  function nameOf(s) { return s === p ? (p.name || 'YOU') : (s.name || classNode(s.classId).displayName); }
  function addKill(killer, victim, leader) { killFeed.push({ killer, victim, leader, t: state.time }); if (killFeed.length > 8) killFeed.shift(); }


  // ---- player input → intent (overlay/admin handled here; the world consumes it) ------------
  let uiButtons = [];
  function spControls(dt) {
    const e = world.evolveOptions(p);
    if (e && e.levelOk) for (let i = 0; i < e.options.length; i++) { const down = Input.key('Digit' + (i + 1)); if (down && !p._numPrev[i]) requestEvolve(i); p._numPrev[i] = down; }
    const prevFire = p._firePrev;
    if (Input.firing && !prevFire) for (const b of uiButtons) { if (Input.mouseX >= b.x && Input.mouseX <= b.x + b.w && Input.mouseY >= b.y && Input.mouseY <= b.y + b.h) { b.onClick(); p._suppressFire = true; break; } }
    if (!Input.firing) p._suppressFire = false; p._firePrev = Input.firing;
    const lDown = Input.key('KeyL'); if (lDown && !p._adminPrev) adminLevelUp(); p._adminPrev = lDown;

    const mdx = Input.mouseX - Render.viewW / 2, mdy = Input.mouseY - Render.viewH / 2;
    const dir = Input.moveDir();
    const isGrav = FAMILY[p.classId] === 'grav';
    const aDown = Input.key('Space'), aEdge = aDown && !p._abilityPrev; p._abilityPrev = aDown;
    const sDown = Input.key('KeyE'), sEdge = sDown && !p._specialPrev; p._specialPrev = sDown;
    const bDown = Input.key('ShiftLeft') || Input.key('ShiftRight'), bEdge = bDown && !p._burnPrev; p._burnPrev = bDown;
    const rDown = Input.altFiring, rEdge = rDown && !p._altPrev; p._altPrev = rDown;   // RMB: Twinmaul both-at-once
    const firing = Input.firing && !p._suppressFire;
    // Gravitor: pulling is passive (weapon always active under cap); left-click edge = launch.
    world.setIntent(p.id, { moveX: dir.x, moveY: dir.y, aim: Math.atan2(mdy, mdx), aimDist: Math.hypot(mdx, mdy),
      firing, ability: isGrav ? (firing && !prevFire) : aEdge, special: sEdge, afterburner: bEdge, altFire: rEdge });
  }

  // ---- thin-client control (authoritative MP) --------------------------------
  // Route an evolve request: to the server when authoritative, else apply locally.
  function requestEvolve(i) { if (PULSAR.MP && PULSAR.MP.connected) PULSAR.MP.sendEvolve(i); else world.chooseEvolution(p, i); }
  const IDLE_INTENT = { moveX: 0, moveY: 0, aim: 0, aimDist: 1, firing: false, ability: false, special: false, afterburner: false, altFire: false };
  let mpIntent = Object.assign({}, IDLE_INTENT);
  // Read input into `mpIntent` each tick. Continuous fields overwrite; edge actions LATCH (OR-in)
  // until consumed by a send, so a tap between 30Hz sends is never dropped.
  function mpControls(dt) {
    const e = world.evolveOptions(p);
    if (e && e.levelOk) for (let i = 0; i < e.options.length; i++) { const down = Input.key('Digit' + (i + 1)); if (down && !p._numPrev[i]) requestEvolve(i); p._numPrev[i] = down; }
    const prevFire = p._firePrev;
    if (Input.firing && !prevFire) for (const b of uiButtons) { if (Input.mouseX >= b.x && Input.mouseX <= b.x + b.w && Input.mouseY >= b.y && Input.mouseY <= b.y + b.h) { b.onClick(); p._suppressFire = true; break; } }
    if (!Input.firing) p._suppressFire = false; p._firePrev = Input.firing;
    const lDown = Input.key('KeyL'); if (lDown && !p._adminPrev) adminLevelUp(); p._adminPrev = lDown;   // [L] admin works online too
    const mdx = Input.mouseX - Render.viewW / 2, mdy = Input.mouseY - Render.viewH / 2;
    const dir = Input.moveDir(), isGrav = FAMILY[p.classId] === 'grav';
    const aDown = Input.key('Space'), aEdge = aDown && !p._abilityPrev; p._abilityPrev = aDown;
    const sDown = Input.key('KeyE'), sEdge = sDown && !p._specialPrev; p._specialPrev = sDown;
    const bDown = Input.key('ShiftLeft') || Input.key('ShiftRight'), bEdge = bDown && !p._burnPrev; p._burnPrev = bDown;
    const rDown = Input.altFiring, rEdge = rDown && !p._altPrev; p._altPrev = rDown;
    const firing = Input.firing && !p._suppressFire;
    mpIntent.moveX = dir.x; mpIntent.moveY = dir.y; mpIntent.aim = Math.atan2(mdy, mdx); mpIntent.aimDist = Math.hypot(mdx, mdy); mpIntent.firing = firing;
    if (firing && !prevFire) mpIntent.fireEdge = true;   // latch tap-fire so a click between sends never drops
    mpIntent.ability = mpIntent.ability || (isGrav ? (firing && !prevFire) : aEdge);
    mpIntent.special = mpIntent.special || sEdge;
    mpIntent.afterburner = mpIntent.afterburner || bEdge;
    mpIntent.altFire = mpIntent.altFire || rEdge;
    // per-TICK intent for local prediction (true edges, not the network latch)
    return { moveX: dir.x, moveY: dir.y, aim: mpIntent.aim, afterburner: bEdge };
  }
  // Called by MP.tick at send time: hand over a copy and clear the latched edges.
  function mpGetIntent() {
    const i = mpIntent, out = { moveX: i.moveX, moveY: i.moveY, aim: i.aim, aimDist: i.aimDist, firing: i.firing || !!i.fireEdge, ability: i.ability, special: i.special, afterburner: i.afterburner, altFire: i.altFire };
    i.ability = i.special = i.afterburner = i.altFire = false; i.fireEdge = false;
    return out;
  }
  function mpSimulate(dt) {
    if (gameStarted && p.alive) {
      const ti = mpControls(dt);
      PULSAR.MP.predict(p, ti, dt);            // own-ship movement, instant
    } else {
      mpIntent.moveX = mpIntent.moveY = 0; mpIntent.firing = mpIntent.ability = mpIntent.special = mpIntent.afterburner = mpIntent.altFire = false;
      PULSAR.MP.predict(p, { moveX: 0, moveY: 0, aim: p.aim, afterburner: false }, dt);   // coast/idle keeps pred aligned
    }
    PULSAR.MP.tick(dt);
    Fx.update(dt);   // replayed particles/beams/text age locally
  }

  // ---- simulation ------------------------------------------------------------
  // SP = step the local world (the same sim.js the server runs). MP = send intent, render snapshots.
  function simulate(dt) {
    const tDown = Input.key('KeyT');                        // [T] class tree — works in every mode, even dead
    if (tDown && !_treePrev) showTree = !showTree;
    _treePrev = tDown;
    if (PULSAR.MP && PULSAR.MP.connected) return mpSimulate(dt);
    if (!gameStarted) p.spawnProtect = Math.max(p.spawnProtect, 0.5);        // idle + safe behind the title
    if (gameStarted && p.alive) spControls(dt);
    else world.setIntent(p.id, { moveX: 0, moveY: 0, aim: p.aim, aimDist: 1, firing: false, ability: false, special: false, afterburner: false, altFire: false });
    world.step(dt);
    Fx.update(dt);
  }

  // ---- render ----------------------------------------------------------------
  function onScreen(x, y, pad) { return x > Render.camera.x - Render.viewW / 2 - pad && x < Render.camera.x + Render.viewW / 2 + pad && y > Render.camera.y - Render.viewH / 2 - pad && y < Render.camera.y + Render.viewH / 2 + pad; }
  function render(alpha) {
    const R = Render;
    if (PULSAR.MP && PULSAR.MP.connected) PULSAR.MP.syncState(state, p);   // authoritative: rebuild state from server (real alpha stays — own ship + fx use it for sub-tick smoothness)
    const pxi = lerp(p.px, p.x, alpha), pyi = lerp(p.py, p.y, alpha);
    R.camera.x = (p.alive ? pxi : p.x) + Fx.shakeX(); R.camera.y = (p.alive ? pyi : p.y) + Fx.shakeY();
    R.beginFrame(); R.drawGrid(); R.drawPulsar(state.time);

    // BLOOM PASS
    R.setComposite('lighter');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 40)) continue; R.glow(R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha)), o.radius * 1.5, R.hexToRgb(OBJDEF[o.type].hue), 0.2 + (o.flash > 0 ? 0.5 : 0) + (o.cracked ? 0.15 : 0)); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 30)) continue; R.glow(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius * 3, m.pulsar ? [200, 230, 255] : [255, 210, 120], m.pulsar ? 0.7 : 0.5); }
    for (const pr of state.projectiles) R.glow(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 1.6 : 2.4), R.hexToRgb(pr.color), 0.85);
    Fx.draw(R, alpha, lerp);
    for (const s of allShips()) { if (!s.alive || !onScreen(s.x, s.y, s.radius * 5)) continue; shipBloom(R, s, alpha, s === p); }

    // CORE PASS
    R.setComposite('source-over');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 20)) continue; drawObject(R.ctx, o, R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha))); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 20)) continue; R.solidCircle(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius, m.pulsar ? '#eaf4ff' : '#ffe6a8'); }
    for (const pr of state.projectiles) {
      const x = R.sx(lerp(pr.px, pr.x, alpha)), y = R.sy(lerp(pr.py, pr.y, alpha));
      if (pr.kind === 'rock') drawThrownRock(R.ctx, pr.rockType, pr.radius, x, y, (pr.spin || 0) + state.time * 2.4);
      else R.solidCircle(x, y, pr.radius * 0.6, '#ffffff');
    }
    for (const s of allShips()) {
      if (!s.alive || !onScreen(s.x, s.y, s.radius * 5)) continue;
      const sxi = R.sx(lerp(s.px, s.x, alpha)), syi = R.sy(lerp(s.py, s.y, alpha));
      drawClassExtras(R, s, sxi, syi);
      drawShip(R.ctx, sxi, syi, s, s === p);
      if (s !== p) drawEnemyTag(R.ctx, s, sxi, syi);
    }

    uiButtons = [];
    drawHud(); drawLeaderboard(); drawKillFeed(); drawMinimap(); drawEvolveOverlay(); drawDevPanel();
    if (showTree) drawClassTree();
  }

  // ---- class tree overlay [T] -------------------------------------------------
  // The whole evolution tree at a glance: live idling hull models, names, one-line blurbs,
  // connectors with the level gates, and your current class highlighted. Non-blocking —
  // the game keeps running behind it (same philosophy as the evolve overlay).
  let showTree = /\btree\b/.test(location.search);   // ?tree auto-opens (dev/screenshot hook)
  let _treePrev = false;
  function wrapText(ctx, text, maxW) {
    const words = String(text || '').split(' ');
    const lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  function drawClassTree() {
    const ctx = Render.ctx;
    ctx.fillStyle = 'rgba(4,6,12,0.86)'; ctx.fillRect(0, 0, Render.viewW, Render.viewH);   // dim the game
    const panelW = Math.min(Render.viewW - 30, 1360);
    const x0 = (Render.viewW - panelW) / 2, colW = panelW / 6;
    const rowH = 128, nodeH = 96, nodeW = colW - 14;
    const topY = Math.max(26, (Render.viewH - 570) / 2);
    const yFor = (row) => topY + 56 + row * rowH + nodeH / 2;
    const colCX = (c) => x0 + colW * (c + 0.5);
    ctx.textAlign = 'center';
    ctx.font = '800 20px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff';
    ctx.fillText('CLASS TREE', Render.viewW / 2, topY + 16);
    ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(160,190,220,0.6)';
    ctx.fillText('[T] to close', Render.viewW / 2, topY + 32);
    // node layout: [classId, column-center (in leaf-column units), row]
    // leaf columns: 0 rail-A · 1 rail-B · 2 hammer · 3 grav-A · 4 grav-B · 5 flail
    const NODES = [
      ['starter', 2.5, 0],
      ['railship', 0.5, 1], ['hammerhead', 2, 1], ['gravitor', 3.5, 1], ['flailship', 5, 1],
      ['helion', 0, 2], ['starPiercer', 1, 2], ['maulbreaker', 2, 2], ['meteorist', 3, 2], ['singularity', 4, 2], ['twinmaul', 5, 2],
      ['supernova', 0, 3], ['starbreak', 1, 3], ['worldsplitter', 2, 3], ['starfall', 3, 3], ['eventHorizon', 4, 3], ['binaryStar', 5, 3],
    ];
    const pos = new Map();
    for (const [id, c, row] of NODES) pos.set(id, { x: colCX(c), y: yFor(row) });
    // tier gate labels on the left margin
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(160,190,220,0.55)';
    ['LV 3', 'LV 8', 'LV 15'].forEach((g, i) => ctx.fillText(g, x0 + 2, yFor(i + 1) - nodeH / 2 - 8));
    // connectors parent → child
    ctx.strokeStyle = 'rgba(120,180,240,0.28)'; ctx.lineWidth = 1.4;
    for (const [id] of NODES) {
      const node = classNode(id); if (!node || !node.parentId) continue;
      const a = pos.get(node.parentId), b = pos.get(id); if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y + nodeH / 2 - 6); ctx.lineTo(b.x, b.y - nodeH / 2 + 2); ctx.stroke();
    }
    for (const [id] of NODES) {
      const pnt = pos.get(id), node = classNode(id);
      const bx = pnt.x - nodeW / 2, by = pnt.y - nodeH / 2;
      const isYou = p.classId === id;
      ctx.fillStyle = isYou ? 'rgba(28,58,88,0.94)' : 'rgba(12,20,34,0.94)';
      ctx.fillRect(bx, by, nodeW, nodeH);
      ctx.strokeStyle = isYou ? '#39d0ff' : 'rgba(90,130,180,0.45)'; ctx.lineWidth = isYou ? 2 : 1;
      ctx.strokeRect(bx, by, nodeW, nodeH);
      // live idling model (drums spin, cores pulse), clipped to the box top
      ctx.save();
      ctx.beginPath(); ctx.rect(bx + 1, by + 1, nodeW - 2, 40); ctx.clip();
      ctx.translate(pnt.x, by + 22); ctx.rotate(-0.35);
      PULSAR.Ships.draw(ctx, {
        classId: id, radius: 11, aim: 0, vx: 0, vy: 0, hitFlash: 0,
        charging: false, charge: 0, heat: 0, ventTimer: 0, ramWinding: false, ramCharge: 0,
        ramActive: 0, orbSpin: state.time * 2.2, orbSelfSpin: state.time * 2.2, captured: [], spawnProtect: 0,
      }, state.time);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = isYou ? '#9fe8ff' : '#eaf6ff';
      ctx.fillText(node.displayName + (isYou ? ' ◂ YOU' : ''), pnt.x, by + 54);
      ctx.font = '400 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(180,205,230,0.75)';
      const blurb = id === 'starter' ? 'spawn ship — farm to LV 3, then choose a family' : (EVOLVE_BLURB[id] || '');
      wrapText(ctx, blurb, nodeW - 10).forEach((ln, i) => ctx.fillText(ln, pnt.x, by + 67 + i * 11));
    }
    ctx.textAlign = 'left';
  }

  function shipBloom(R, s, alpha, isPlayer) {
    const cx = R.sx(lerp(s.px, s.x, alpha)), cy = R.sy(lerp(s.py, s.y, alpha)), hue = R.hexToRgb(hueFor(s.classId));
    const threat = lerp(cfg.readability.threatBloomScale, cfg.readability.threatBloomMax, Math.min(1, s.scrap / cfg.readability.threatScrapForMax));
    const chargeGlow = s.charging ? 0.4 * Math.min(1.25, s.charge) : 0;
    const tierBoost = (classNode(s.classId).tier - 1) * 0.06;
    const scale = isPlayer ? cfg.readability.yourShipBloomScale : 1.0;
    R.glow(cx, cy, s.radius * (3.0 + chargeGlow) * scale * threat, hue, (isPlayer ? 0.45 : 0.32) + chargeGlow * 0.4 + tierBoost);
    if (s.heat > cfg.railship.heat.max * 0.6 || s.ventTimer > 0) R.glow(cx, cy, s.radius * 2.4, [255, 120, 60], 0.22 + 0.4 * (s.heat / cfg.railship.heat.max));
    if ((s.burnTimer || 0) > 0) R.glow(cx, cy, s.radius * 3.4, [127, 220, 255], 0.55);   // afterburner flare
  }
  function drawEnemyTag(ctx, s, x, y) {
    if (s.name) { ctx.textAlign = 'center'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = s.isLeader ? '#ffd98a' : 'rgba(220,235,255,0.85)'; ctx.fillText(s.name, x, y - s.radius - 16); ctx.textAlign = 'left'; }
    if (s.hp < s.maxHp) { const w = s.radius * 2.2, hb = y - s.radius - 12; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - w / 2, hb, w, 3); ctx.fillStyle = s.isLeader ? '#ffd98a' : '#ff8a8a'; ctx.fillRect(x - w / 2, hb, w * Math.max(0, s.hp / s.maxHp), 3); }
  }

  // ---- ship silhouettes ------------------------------------------------------
  // Hull models live in src/ships.js (one per class, keyed by visuals.js silhouette).
  // This wrapper keeps the readability overlays: spawn shield, white YOU core,
  // cosmetic skin ring, leader crown.
  function drawShip(ctx, x, y, s, isPlayer) {
    const r = s.radius;
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.aim);
    if (s.spawnProtect > 0) { ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, TAU); ctx.strokeStyle = `rgba(190,233,255,${0.25 + 0.2 * Math.sin(state.time * 18)})`; ctx.lineWidth = 2; ctx.stroke(); }
    PULSAR.Ships.draw(ctx, s, state.time);
    ctx.restore();
    if (isPlayer) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();   // white core = you (readability)
      if (PULSAR.Profile && PULSAR.cosmetics) { const sk = PULSAR.cosmetics.skin(PULSAR.Profile.get().skin); if (sk && sk.id !== 'default') { ctx.beginPath(); ctx.arc(x, y, r * 1.75, 0, TAU); ctx.strokeStyle = sk.accent; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; } }   // cosmetic skin accent (no power)
    }
    if (s.isLeader) drawCrown(ctx, x, y, r);
  }
  function drawCrown(ctx, x, y, r) { const w = r * 1.3, h = r * 0.8, top = y - r * 2.4; ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(x - w, top + h); ctx.lineTo(x - w, top); ctx.lineTo(x - w * 0.4, top + h * 0.55); ctx.lineTo(x, top - h * 0.35); ctx.lineTo(x + w * 0.4, top + h * 0.55); ctx.lineTo(x + w, top); ctx.lineTo(x + w, top + h); ctx.closePath(); ctx.fill(); }

  function drawClassExtras(R, s, cx, cy) {
    const fam = FAMILY[s.classId], ctx = R.ctx;
    if (fam === 'grav') {
      const G = cfg.gravitor, drag = (s.classId === 'singularity' || s.classId === 'eventHorizon');
      ctx.strokeStyle = drag ? 'rgba(176,107,255,0.4)' : 'rgba(176,107,255,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, (drag ? G.well.pullRadius * G.tidalDrag.radiusMult : G.well.pullRadius) * 0.25, 0, TAU); ctx.stroke();
      const cap = s.captured.length;
      // Held rocks ride at full ASTEROID size AND keep their real neutral-object shape (asteroid/
      // crystal/debris) — just haloed by the well's purple pull. They're "transparent" while held
      // (not in the world → can't be destroyed, don't block damage), only breakable once shot.
      for (let i = 0; i < cap; i++) {
        const held = s.captured[i], type = held.type || 'asteroid', rr = held.radius || 18;
        const a = s.orbSpin + i * (TAU / Math.max(1, cap));
        const rx = cx + Math.cos(a) * (s.radius + G.orbit.radius), ry = cy + Math.sin(a) * (s.radius + G.orbit.radius);
        R.setComposite('lighter'); R.glow(rx, ry, rr * 1.5, [176, 107, 255], 0.4); R.setComposite('source-over');
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(s.orbSpin * 1.6 + i);
        (ROCK_PATH[type] || asteroidPath)(ctx, rr);
        ctx.fillStyle = ROCK_FILL[type] || ROCK_FILL.asteroid; ctx.fill();
        ctx.strokeStyle = 'rgba(210,190,255,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();   // purple well rim over the real shape
        ctx.restore();
      }
    } else if (fam === 'rail') {
      const RC = cfg.railship.charge, t = state.time;
      const full = s.charge >= RC.lanceMax;
      // BEFORE full: the cannon FEEDS — little energy orbs condense in a forward cone and get
      // pulled into the muzzle, falling faster as they close. Intake STOPS at full charge.
      if (s.charging && !full) {
        const ch = Math.min(1, s.charge), hue = [150, 232, 255];
        const aim = s.aim || 0;
        const mr = s.radius * (1.5 + 1.1 * ch);            // muzzle rides the extending barrel
        const mx = cx + Math.cos(aim) * mr, my = cy + Math.sin(aim) * mr;
        const Rmax = s.radius * (3.5 + 2.5 * ch);
        R.setComposite('lighter');
        for (let i = 0; i < 9; i++) {
          const phase = (t * (0.7 + 0.7 * ch) + i * 0.318) % 1;
          const frac = 1 - phase;                          // 1 = just spawned far out, 0 = swallowed
          const spread = Math.sin(i * 12.9898) * 1.25;     // stable per-orb cone angle (±~70°)
          const a = aim + spread * (0.35 + 0.65 * frac);   // cone tightens as the orb falls in
          const d = frac * frac * Rmax;                    // ease-in: accelerates toward the muzzle
          const x = mx + Math.cos(a) * d, y = my + Math.sin(a) * d;
          const al = ch * (0.25 + 0.65 * (1 - frac));
          const sz = (1.5 + 2.5 * (1 - frac)) * (0.8 + 0.5 * ch);
          R.glow(x, y, sz * 2.2, hue, al * 0.8);
          ctx.fillStyle = `rgba(255,255,255,${al})`;
          ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, TAU); ctx.fill();
        }
        R.setComposite('source-over');
      } else if (s.charging && full) {
        // AT full: intake stops; the core REDLINES — gold -> deep red over overheatSec, pulsing
        // faster as it nears the blowout. Sells "hold too long and you overheat".
        const hf = Math.min(1, (s.chargeFullTimer || 0) / RC.overheatSec);
        const col = [255, Math.round(190 - 150 * hf), Math.round(90 - 65 * hf)];
        const pulse = 0.6 + 0.4 * Math.sin(t * (8 + 26 * hf));
        R.setComposite('lighter');
        R.glow(cx, cy, s.radius * (3.0 + 2.6 * hf), col, (0.30 + 0.5 * hf) * pulse);
        if (hf > 0.45) { // crackling embers as it approaches blowout
          for (let i = 0; i < 5; i++) { const a = t * 7 + i * 1.7, rr = s.radius * (1.4 + 1.6 * Math.abs(Math.sin(t * 5 + i))); R.glow(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 5 * hf, [255, 90, 50], 0.7 * hf); }
        }
        R.setComposite('source-over');
      }
    } else if (fam === 'flail') {
      const O = cfg.flailship.orb, spin = s.spinFrac || 0;
      // local ships carry the full maces array; remote ships only sync head positions
      const heads = s.maces || [
        { x: s.orbX, y: s.orbY, selfSpin: s.orbSelfSpin || 0, state: s.orbState, flingPower: s.flingPower || 0 },
        ...(s.orbX2 != null ? [{ x: s.orbX2, y: s.orbY2, selfSpin: s.orbSelfSpin2 || 0, state: s.orbState, flingPower: s.flingPower || 0 }] : []),
      ];
      for (const h of heads) {
        if (h.x == null) continue;
        const ox = R.sx(h.x), oy = R.sy(h.y);
        const hot = Math.max(spin, (h.state === 'out' || h.state === 'back') ? (h.flingPower || 0) : 0);
        ctx.strokeStyle = 'rgba(255,210,120,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke();
        // momentum reads as light: the head burns brighter the faster it swings / flies
        R.setComposite('lighter'); R.glow(ox, oy, O.tipRadius * (2.2 + 1.6 * hot), [255, 210, 120], 0.55 + 0.45 * hot); R.setComposite('source-over');
        // spiked mace head, tumbling with its own spin
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(h.selfSpin || 0);
        ctx.fillStyle = hot > 0.6 ? '#fff3cf' : '#ffe6a8';
        for (let i = 0; i < O.spikes; i++) {
          const a = (i / O.spikes) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * O.tipRadius * 1.6, Math.sin(a) * O.tipRadius * 1.6);
          ctx.lineTo(Math.cos(a + 0.34) * O.tipRadius * 0.85, Math.sin(a + 0.34) * O.tipRadius * 0.85);
          ctx.lineTo(Math.cos(a - 0.34) * O.tipRadius * 0.85, Math.sin(a - 0.34) * O.tipRadius * 0.85);
          ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, O.tipRadius, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,30,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, O.tipRadius * 0.55, 0, TAU); ctx.stroke();   // forged core seam
        ctx.restore();
      }
      // BINARY STAR: the live tether between the heads — crackling segmented line,
      // hotter during a throw (the garrote). Works local (maces) AND remote (orbX/orbX2).
      if (s.classId === 'binaryStar' && heads.length > 1 && heads[1] && heads[1].x != null) {
        const x0 = R.sx(heads[0].x), y0 = R.sy(heads[0].y), x1 = R.sx(heads[1].x), y1 = R.sy(heads[1].y);
        const thrown = heads.some(h => h.state === 'out' || h.state === 'back');
        const hot = thrown ? 1 : 0.55;
        R.setComposite('lighter');
        ctx.strokeStyle = `rgba(255,240,170,${0.16 + 0.16 * hot})`; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const segs = 8, tdx = x1 - x0, tdy = y1 - y0, tlen = Math.hypot(tdx, tdy) || 1;
        const nx = -tdy / tlen, ny = tdx / tlen;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * hot})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let i = 1; i < segs; i++) {
          const u = i / segs, off = Math.sin(u * Math.PI * 3 + state.time * 21) * 3.5 * hot;
          ctx.lineTo(x0 + tdx * u + nx * off, y0 + tdy * u + ny * off);
        }
        ctx.lineTo(x1, y1); ctx.stroke();
        R.setComposite('source-over');
      }
    }
  }

  // ---- neutral object shapes -------------------------------------------------
  function drawObject(ctx, o, x, y) {
    if (o.type === 'crystal') return drawShape(ctx, o, x, y, crystalPath, 'rgba(180,255,240,0.95)', 'rgba(94,234,212,0.55)', 'rgba(150,255,235,0.9)');
    if (o.type === 'debris') return drawShape(ctx, o, x, y, debrisPath, 'rgba(160,175,195,0.9)', 'rgba(75,85,100,0.85)', 'rgba(140,160,185,0.6)');
    if (o.type === 'titan') {
      drawShape(ctx, o, x, y, titanPath, 'rgba(190,205,235,0.9)', 'rgba(52,60,78,0.97)', 'rgba(170,185,215,0.85)');
      // surface craters + a pale ridge line — a mountain, not a big pebble
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.spin);
      ctx.strokeStyle = 'rgba(130,145,175,0.4)'; ctx.lineWidth = 2;
      for (const [fx0, fy0, fr] of [[-0.35, -0.2, 0.22], [0.25, 0.3, 0.16], [0.1, -0.4, 0.12]]) {
        ctx.beginPath(); ctx.arc(fx0 * o.radius, fy0 * o.radius, fr * o.radius, 0, TAU); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-o.radius * 0.7, o.radius * 0.15); ctx.lineTo(o.radius * 0.6, -o.radius * 0.25);
      ctx.strokeStyle = 'rgba(160,175,205,0.35)'; ctx.stroke();
      ctx.restore();
      return;
    }
    return drawShape(ctx, o, x, y, asteroidPath, 'rgba(150,165,190,0.9)', 'rgba(70,80,98,0.9)', 'rgba(150,170,200,0.7)');
  }
  function drawShape(ctx, o, x, y, pathFn, hitFill, fill, strokeC) { ctx.save(); ctx.translate(x, y); ctx.rotate(o.spin); pathFn(ctx, o.radius); ctx.fillStyle = o.flash > 0 ? hitFill : fill; ctx.fill(); ctx.strokeStyle = strokeC; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); objectOverlays(ctx, o, x, y); }
  function asteroidPath(ctx, r) { ctx.beginPath(); for (let i = 0; i <= 9; i++) { const a = (i / 9) * TAU, rr = r * (0.82 + 0.18 * Math.sin(a * 3 + 1.3) * Math.cos(a * 2)); const vx = Math.cos(a) * rr, vy = Math.sin(a) * rr; i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy); } ctx.closePath(); }
  // shape + fill lookups for gravitor-held rocks (drawn with their real neutral-object silhouette)
  const ROCK_PATH = { asteroid: asteroidPath, crystal: crystalPath, debris: debrisPath, pebble: asteroidPath };
  const ROCK_FILL = { asteroid: 'rgba(150,165,190,0.92)', crystal: 'rgba(120,240,220,0.7)', debris: 'rgba(120,135,160,0.9)',
                      pebble: 'rgba(140,130,175,0.9)' };   // accreted dust: small, faintly violet
  // Thrown rocks stay rocks in flight: same silhouette as the neutral object they were,
  // tumbling, with the well's purple rim — never a generic circle bullet.
  function drawThrownRock(ctx, type, r, x, y, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    (ROCK_PATH[type] || asteroidPath)(ctx, r);
    ctx.fillStyle = ROCK_FILL[type] || ROCK_FILL.asteroid; ctx.fill();
    ctx.strokeStyle = 'rgba(210,190,255,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }
  function titanPath(ctx, r) { ctx.beginPath(); for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU, rr = r * (0.86 + 0.14 * Math.sin(a * 5 + 0.7) * Math.cos(a * 3 + 1.9)); const vx = Math.cos(a) * rr, vy = Math.sin(a) * rr; i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy); } ctx.closePath(); }
  function crystalPath(ctx, r) { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); }
  function debrisPath(ctx, r) { ctx.beginPath(); ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.3, r); ctx.closePath(); }
  function objectOverlays(ctx, o, x, y) {
    if (o.hp < o.maxHp) { ctx.beginPath(); ctx.arc(x, y, o.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (o.hp / o.maxHp)); ctx.strokeStyle = 'rgba(120,200,160,0.55)'; ctx.lineWidth = 2; ctx.stroke(); }
    if (o.cracked) { ctx.strokeStyle = `rgba(255,170,90,${0.5 + 0.3 * Math.sin(state.time * 14)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, o.radius + 9, 0, TAU); ctx.stroke(); }
  }

  // ---- HUD / overlay / minimap ----------------------------------------------
  let fps = 0, fpsAccum = 0, fpsFrames = 0;
  function bar(ctx, x, y, w, h, frac, fill) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = fill; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h); }
  function drawHud() {
    const ctx = Render.ctx, x = 16, w = 220, fam = FAMILY[p.classId];
    bar(ctx, x, 16, w, 10, p.hp / p.maxHp, '#7be0a0');
    if (fam === 'rail') { const hf = p.heat / cfg.railship.heat.max; bar(ctx, x, 30, w, 8, hf, p.ventTimer > 0 ? '#ff5b5b' : (hf > 0.7 ? '#ff9b3c' : '#ffd23c')); if (p.charging) bar(ctx, x, 40, w, 6, Math.min(1.25, p.charge) / 1.25, p.charge > 1 ? '#ffd98a' : '#bfe9ff'); }
    else if (fam === 'hammer' && (p.ramWinding || p.ramActive > 0)) bar(ctx, x, 30, w, 6, p.ramActive > 0 ? 1 : p.ramCharge, '#ff9b3c');
    const cur = world.xpForLevel(p.level), nxt = world.xpForLevel(p.level + 1); bar(ctx, x, 50, w, 6, (p.xp - cur) / Math.max(1, nxt - cur), '#6aa9ff');
    ctx.textAlign = 'left';
    ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff'; ctx.fillText(`${classNode(p.classId).displayName}  ·  LV ${p.level}${p.isLeader ? '  ★' : ''}`, x, 76);
    const coresTxt = PULSAR.Profile ? `   ◆ ${PULSAR.Profile.get().cores}` : '';
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = '#ffd98a'; ctx.fillText(`SCRAP ${Math.floor(p.scrap)}   ⚔ ${p.kills}${coresTxt}`, x, 94);
    const abil = classNode(p.classId).ability, spec = classNode(p.classId).special;
    const abilKey = fam === 'grav' ? '[click]' : '[Space]';
    ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = p.abilityCd > 0 ? 'rgba(160,190,220,0.4)' : '#7be0ff';
    ctx.fillText(abil ? (p.abilityCd > 0 ? `${abil} ${p.abilityCd.toFixed(1)}s` : `${abil} ready ${abilKey}`) : 'no ability (Scout)', x, 112);
    if (spec) { ctx.fillStyle = p.specialCd > 0 ? 'rgba(255,180,120,0.4)' : '#ffb27a'; ctx.fillText(p.specialCd > 0 ? `${spec} ${p.specialCd.toFixed(1)}s` : `${spec} ready [E]`, x, 128); }
    const fireHint = fam === 'grav' ? 'click=launch · auto-pulls rocks'
      : fam === 'flail' ? (p.classId === 'twinmaul' ? 'hold=SPIN · LMB=volley · RMB=BOTH · E=lash' : 'hold=SPIN UP · release=fling at cursor')
      : fam === 'rail' ? ((p.burnCd || 0) > 0 ? `hold=charge · Shift=burn ${p.burnCd.toFixed(1)}s` : 'hold=charge · Shift=AFTERBURN')
      : 'hold=fire · Space=ability';
    ctx.fillStyle = 'rgba(160,190,220,0.5)'; ctx.fillText(`${fps.toFixed(0)} fps · WASD · ${fireHint} · E=special · T=tree`, x, spec ? 144 : 128);
    if (PULSAR.MP && PULSAR.MP.AUTH) {
      const on = PULSAR.MP.connected;
      ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = on ? '#7be0a0' : 'rgba(255,180,120,0.8)';
      ctx.fillText(on ? `◉ MULTIPLAYER · ${PULSAR.MP.count + 1} players` : '◌ connecting…', x, spec ? 160 : 144);
    }
    if (!p.alive) { ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ff8a8a'; ctx.fillText('WRECKED — respawning…', Render.viewW / 2, Render.viewH / 2 + 90); ctx.textAlign = 'left'; }
  }
  function drawLeaderboard() {
    const ctx = Render.ctx, ranked = allShips().filter(s => s.alive).sort((a, b) => b.scrap - a.scrap).slice(0, 4);
    const x = Render.viewW - 164, y0 = 48;
    ctx.textAlign = 'left'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(160,190,220,0.7)'; ctx.fillText('LEADERBOARD', x, y0);
    ctx.font = '400 11px system-ui, sans-serif';
    ranked.forEach((s, i) => { ctx.fillStyle = s === p ? '#bfe9ff' : (s.isLeader ? '#ffd98a' : 'rgba(220,230,245,0.7)'); ctx.fillText(`${i + 1}. ${s === p ? 'YOU' : nameOf(s)}`, x, y0 + 16 + i * 14); ctx.textAlign = 'right'; ctx.fillText('' + Math.floor(s.scrap), x + 148, y0 + 16 + i * 14); ctx.textAlign = 'left'; });
  }
  function drawDevPanel() {
    const mp = PULSAR.MP && PULSAR.MP.connected;   // in MP the buttons send admin messages to the authority
    const ctx = Render.ctx, w = 150, h = 26, x = Render.viewW - w - 14;
    ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,140,230,0.55)';
    ctx.fillText('DEV', x + w, 10); ctx.textAlign = 'left';
    const btn = (y, label, fg, bg, border, onClick) => {
      ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = fg;
      ctx.fillText(label, x + w / 2, y + 17); ctx.textAlign = 'left';
      uiButtons.push({ x, y, w, h, onClick });
    };
    btn(16, 'ADMIN ▸ +1 LVL  [L]', '#ffb4ee', 'rgba(58,18,58,0.75)', 'rgba(255,140,230,0.7)', adminLevelUp);
    const on = mp ? PULSAR.MP.remotes.some(r => r.isBot) : world.countBots() > 0;
    btn(48, on ? 'BOTS: ON' : 'BOTS: OFF',
      on ? '#9fe8ff' : 'rgba(170,185,205,0.8)',
      on ? 'rgba(18,40,58,0.78)' : 'rgba(28,30,38,0.78)',
      on ? 'rgba(120,200,255,0.65)' : 'rgba(140,150,170,0.5)',
      mp ? () => PULSAR.MP.sendAdmin('bots') : toggleBots);
  }
  function drawEvolveOverlay() {
    const e = world.evolveOptions(p);
    if (!e || !e.levelOk || !p.alive) return;
    const ctx = Render.ctx, bw = 316, bh = 62, gap = 8, n = e.options.length;
    const panelW = bw + 24, panelH = 44 + n * (bh + gap), x0 = (Render.viewW - panelW) / 2, y0 = 70;
    ctx.fillStyle = 'rgba(8,12,20,0.82)'; ctx.fillRect(x0, y0, panelW, panelH); ctx.strokeStyle = 'rgba(120,224,255,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, panelW, panelH);
    ctx.textAlign = 'center'; ctx.font = '700 14px system-ui, sans-serif'; ctx.fillStyle = '#bfe9ff'; ctx.fillText(`EVOLVE — choose (cost ${e.cost} scrap)`, x0 + panelW / 2, y0 + 24);
    const afford = p.scrap >= e.cost;
    for (let i = 0; i < n; i++) {
      const bx = x0 + 12, by = y0 + 36 + i * (bh + gap); uiButtons.push({ x: bx, y: by, w: bw, h: bh, onClick: () => requestEvolve(i) });
      ctx.fillStyle = afford ? 'rgba(120,224,255,0.14)' : 'rgba(120,140,160,0.10)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = afford ? 'rgba(120,224,255,0.5)' : 'rgba(120,140,160,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      // Live hull preview: the actual model, idling — drums spin, cores pulse. Clipped to
      // its slot so long rail barrels don't spill over the text.
      ctx.save();
      ctx.beginPath(); ctx.rect(bx + 1, by + 1, 84, bh - 2); ctx.clip();
      ctx.translate(bx + 40, by + bh / 2); ctx.rotate(-0.35);
      PULSAR.Ships.draw(ctx, {
        classId: e.options[i].id, radius: 12, aim: 0, vx: 0, vy: 0, hitFlash: 0,
        charging: false, charge: 0, heat: 0, ventTimer: 0, ramWinding: false, ramCharge: 0,
        ramActive: 0, orbSpin: state.time * 2.2, captured: [], spawnProtect: 0,
      }, state.time);
      ctx.restore();
      if (!afford) { ctx.fillStyle = 'rgba(8,12,20,0.45)'; ctx.fillRect(bx + 1, by + 1, 84, bh - 2); }   // dim preview when unaffordable
      ctx.strokeStyle = 'rgba(120,224,255,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx + 85, by + 6); ctx.lineTo(bx + 85, by + bh - 6); ctx.stroke();
      ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = afford ? '#eaf6ff' : 'rgba(200,215,230,0.5)';
      ctx.fillText(`[${i + 1}] ${e.options[i].displayName}`, bx + 96, by + 26); ctx.font = '400 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(180,205,230,0.7)'; ctx.fillText(EVOLVE_BLURB[e.options[i].id] || '', bx + 96, by + 41);
    }
    if (!afford) { ctx.textAlign = 'center'; ctx.font = '400 11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,180,120,0.8)'; ctx.fillText(`need ${e.cost - Math.floor(p.scrap)} more scrap`, x0 + panelW / 2, y0 + panelH - 8); }
    ctx.textAlign = 'left';
  }
  function drawMinimap() {
    const ctx = Render.ctx, size = 150, pad = 14, x0 = Render.viewW - size - pad, y0 = Render.viewH - size - pad, sc = size / cfg.arena.width;
    ctx.fillStyle = 'rgba(8,12,20,0.6)'; ctx.fillRect(x0, y0, size, size); ctx.strokeStyle = 'rgba(80,120,180,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, size, size);
    const px = x0 + (cfg.arena.width / 2) * sc, py = y0 + (cfg.arena.height / 2) * sc;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 2.5 + Math.max(0, Math.sin(state.time * (TAU / cfg.arena.pulsarPulseIntervalSec))), 0, TAU); ctx.fill();
    // titan landmarks — the mountains you navigate by
    ctx.fillStyle = 'rgba(150,165,195,0.7)';
    for (const o of state.objects) if (o.type === 'titan') { ctx.beginPath(); ctx.arc(x0 + o.x * sc, y0 + o.y * sc, 3, 0, TAU); ctx.fill(); }
    // Each ship is a CLASS-COLOURED arrow pointing where it faces (you = cyan + ring, leader = gold rim).
    for (const s of allShips()) {
      if (!s.alive) continue;
      const mx = x0 + s.x * sc, my = y0 + s.y * sc, isMe = s === p, r = s.isLeader ? 4.6 : 3.4;
      ctx.save(); ctx.translate(mx, my); ctx.rotate(s.aim);
      ctx.fillStyle = isMe ? '#39d0ff' : hueFor(s.classId);
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.62); ctx.lineTo(-r * 0.7, -r * 0.62); ctx.closePath(); ctx.fill();
      if (s.isLeader) { ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
      if (isMe) { ctx.strokeStyle = 'rgba(57,208,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, r + 2.5, 0, TAU); ctx.stroke(); }
    }
  }
  function drawKillFeed() {
    const ctx = Render.ctx, x = Render.viewW - 16; let y = 132;
    ctx.textAlign = 'right'; ctx.font = '600 12px system-ui, sans-serif';
    for (let i = killFeed.length - 1; i >= 0; i--) {
      const k = killFeed[i], age = state.time - k.t;
      if (age > 6) continue;
      const a = Math.max(0, Math.min(1, (6 - age) / 1.5));
      const txt = k.killer ? `${k.killer}  ⚔  ${k.victim}` : `${k.victim}  ☠`;
      ctx.fillStyle = `rgba(${k.leader ? '255,210,120' : '230,160,150'},${0.9 * a})`;
      ctx.fillText(txt, x, y); y += 16;
    }
    ctx.textAlign = 'left';
  }

  // ---- loop ------------------------------------------------------------------
  let last = performance.now(), accumulator = 0;
  let lastRender = 0;
  function frame(now) {
    let frameTime = (now - last) / 1000; last = now;
    if (frameTime > cfg.sim.maxFrameTimeSec) frameTime = cfg.sim.maxFrameTimeSec;
    accumulator += frameTime;
    while (accumulator >= DT) { simulate(DT); accumulator -= DT; }
    fpsAccum += frameTime;
    // Render ceiling: skip paints past maxRenderFps (sim above already ran — nothing is lost).
    // The 0.5ms epsilon keeps timer jitter from halving the rate on displays AT the ceiling.
    if (now - lastRender >= 1000 / cfg.sim.maxRenderFps - 0.5) {
      lastRender = now;
      render(accumulator / DT);
      fpsFrames++;
    }
    if (fpsAccum >= 0.5) { fps = fpsFrames / fpsAccum; fpsAccum = 0; fpsFrames = 0; }
    requestAnimationFrame(frame);
  }
  function boot() {
    const canvas = document.getElementById('game');
    Render.init(canvas); Input.attach(canvas);
    if (PULSAR.MP && PULSAR.MP.AUTH) PULSAR.MP.init({
      name: p.name || '', getIntent: mpGetIntent,
      onKill: (killerName, victimName, leader) => addKill(killerName, victimName, leader),   // server kill events → killfeed
    });
    requestAnimationFrame(frame);
  }
  // Called by the title screen's PLAY button (index.html) — sets your name and drops you in.
  PULSAR.startGame = function (name) {
    p.name = (name || '').slice(0, 16).trim() || 'Player';
    gameStarted = true;
    p.spawnProtect = cfg.player.spawnProtectionSec;
    if (PULSAR.MP && PULSAR.MP.AUTH) PULSAR.MP.sendName(p.name);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
