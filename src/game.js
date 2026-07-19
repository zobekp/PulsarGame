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
    // TIER-4 apexes — MUST be here or their class-extras (maces/chains, beam charge, grav core) and
    // family HUD/controls silently no-op (undefined family). Mirrors src/sim.js FAMILY.
  };
  const EVOLVE_BLURB = {
    railship: 'charge beam · heat · Vent Dash', hammerhead: 'wind-up lunge · Brace',
    gravitor: 'auto-pulls rocks · condenses PEBBLES when dry', flailship: 'SPIKED MACE — hold to SPIN UP, release to fling',
    helion: 'SUSTAIN BEAM — dmg ramps while held, heat compounds', starPiercer: 'SIEGE MAW — charge WIDENS the beam · BROKEN CORE [E]',
    maulbreaker: '+ram reach · +knockback', worldsplitter: 'full-lunge SHOCKWAVE · slam burst [E]',
    meteorist: 'holds 3 rocks · harder throws', starfall: 'holds 5 rocks · hurls 2 · BARRAGE [E]',
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
  let onboardingStartXp = 0, onboardingStartTime = 0;
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
    if (!PULSAR.MP.connected) { Fx.update(dt); return; }   // connection blip: freeze in place, HUD shows reconnecting
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
    // MODE, not connection state: in authoritative mode a WS blip must FREEZE the server view
    // and reconnect — never silently fall back to stepping the local SP world (that swapped the
    // whole universe mid-game, then reconnected you as a fresh ship: "I randomly disappeared").
    if (PULSAR.MP && PULSAR.MP.AUTH) return mpSimulate(dt);
    if (!gameStarted) p.spawnProtect = Math.max(p.spawnProtect, 0.5);        // idle + safe behind the title
    if (gameStarted && p.alive) spControls(dt);
    else world.setIntent(p.id, { moveX: 0, moveY: 0, aim: p.aim, aimDist: 1, firing: false, ability: false, special: false, afterburner: false, altFire: false });
    world.step(dt);
    Fx.update(dt);
  }

  // ---- render ----------------------------------------------------------------
  let lastFrameT = 0;        // wall-clock of the last frame (frame-rate-independent zoom timing)
  function onScreen(x, y, pad) {
    const hw = Render.viewW / (2 * Render.camera.zoom), hh = Render.viewH / (2 * Render.camera.zoom);
    return x > Render.camera.x - hw - pad && x < Render.camera.x + hw + pad && y > Render.camera.y - hh - pad && y < Render.camera.y + hh + pad;
  }
  function render(alpha) {
    const R = Render;
    if (PULSAR.MP && PULSAR.MP.connected) PULSAR.MP.syncState(state, p);   // authoritative: rebuild state from server (real alpha stays — own ship + fx use it for sub-tick smoothness)
    const myPlane = p.plane | 0;   // Titan-plane view partition: only draw entities sharing your plane
    const pxi = lerp(p.px, p.x, alpha), pyi = lerp(p.py, p.y, alpha);
    R.camera.x = (p.alive ? pxi : p.x) + Fx.shakeX(); R.camera.y = (p.alive ? pyi : p.y) + Fx.shakeY();
    const nowT = performance.now();
    const frameDt = Math.min(0.1, (nowT - (lastFrameT || nowT)) / 1000); lastFrameT = nowT;
    // ASCENSION: the moment you cross onto the Titan plane, play a "jump to lightspeed" cinematic,
    // then a one-time briefing on arrival. (plane is authoritative — set in the sim on apex evolve.)
    // Zoom OUT as your hull grows so a dreadnought never fills the screen (you always see the fight).
    // Ease to the target so an evolve/growth glides the camera out over ~0.2s instead of snapping.
    const V = cfg.view;
    const targetZoom = Math.max(V.minZoom, Math.min(V.baseZoom, V.shipTargetPx / p.radius));
    if (!R.camera.zoom) R.camera.zoom = targetZoom;   // first frame / boot: snap, don't animate from 0
    else R.camera.zoom += (targetZoom - R.camera.zoom) * (1 - Math.exp(-frameDt / V.zoomSmoothTau));
    R.beginFrame(); R.drawGrid(state.time); R.drawPulsar(state.time);

    // BLOOM PASS
    R.setComposite('lighter');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 40)) continue; R.glow(R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha)), o.radius * 1.5, R.hexToRgb(OBJDEF[o.type].hue), 0.2 + (o.flash > 0 ? 0.5 : 0) + (o.cracked ? 0.15 : 0)); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 30)) continue; R.glow(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius * 3, m.pulsar ? [200, 230, 255] : [255, 210, 120], m.pulsar ? 0.7 : 0.5); }
    for (const pr of state.projectiles) { if ((pr.plane | 0) !== myPlane) continue; R.glow(R.sx(lerp(pr.px, pr.x, alpha)), R.sy(lerp(pr.py, pr.y, alpha)), pr.radius * (pr.kind === 'rock' ? 1.6 : 2.4), R.hexToRgb(pr.color), 0.85); }
    Fx.draw(R, alpha, lerp, myPlane);
    for (const s of allShips()) { if (!s.alive || (s.plane | 0) !== myPlane || !onScreen(s.x, s.y, s.radius * 5)) continue; shipBloom(R, s, alpha, s === p); }

    // CORE PASS
    R.setComposite('source-over');
    for (const o of state.objects) { if (!onScreen(o.x, o.y, o.radius + 20)) continue; drawObject(R.ctx, o, R.sx(lerp(o.px, o.x, alpha)), R.sy(lerp(o.py, o.y, alpha))); }
    for (const m of state.motes) { if (!onScreen(m.x, m.y, 20)) continue; R.solidCircle(R.sx(lerp(m.px, m.x, alpha)), R.sy(lerp(m.py, m.y, alpha)), pk.moteRadius, m.pulsar ? '#eaf4ff' : '#ffe6a8'); }
    for (const pr of state.projectiles) {
      if ((pr.plane | 0) !== myPlane) continue;
      const x = R.sx(lerp(pr.px, pr.x, alpha)), y = R.sy(lerp(pr.py, pr.y, alpha));
      if (pr.kind === 'rock') drawThrownRock(R.ctx, pr.rockType, pr.radius, x, y, (pr.spin || 0) + state.time * 2.4);
      else if (pr.kind === 'missile') drawMissile(R.ctx, pr, x, y);
      else R.solidCircle(x, y, pr.radius * 0.6, '#ffffff');
    }
    for (const s of allShips()) {
      if (!s.alive || (s.plane | 0) !== myPlane || !onScreen(s.x, s.y, s.radius * 5)) continue;
      const sxi = R.sx(lerp(s.px, s.x, alpha)), syi = R.sy(lerp(s.py, s.y, alpha));
      drawClassExtras(R, s, sxi, syi);
      drawShip(R.ctx, sxi, syi, s, s === p);
      if (s.shieldMax > 0 && s.shield > 0) drawShield(R.ctx, s, sxi, syi);
      if (s !== p) drawEnemyTag(R.ctx, s, sxi, syi);
    }

    R.endWorld();   // <-- leave world/zoom space; everything below is screen-space HUD
    uiButtons = [];
    drawOnboardingGuide();
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
    // capital-ship presence: a wide, dim power aura that grows with hull size (dreadnoughts loom)
    const sizeBoost = Math.min(1, (s.radius - cfg.player.baseRadius) / 55);
    if (sizeBoost > 0.05) R.glow(cx, cy, s.radius * 4.6 * scale, hue, 0.05 + 0.15 * sizeBoost);
    R.glow(cx, cy, s.radius * (3.0 + chargeGlow) * scale * threat, hue, (isPlayer ? 0.45 : 0.32) + chargeGlow * 0.4 + tierBoost + 0.12 * sizeBoost);
    if (s.heat > cfg.railship.heat.max * 0.6 || s.ventTimer > 0) R.glow(cx, cy, s.radius * 2.4, [255, 120, 60], 0.22 + 0.4 * (s.heat / cfg.railship.heat.max));
    if ((s.burnTimer || 0) > 0) R.glow(cx, cy, s.radius * 3.4, [127, 220, 255], 0.55);   // afterburner flare
  }
  function drawEnemyTag(ctx, s, x, y) {
    // Drawn in the world pass (under view zoom): counter-scale so tags + HP bars stay a constant,
    // readable screen size while sitting a constant gap above the (variably-sized) hull.
    const z = Render.camera.zoom || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 / z, 1 / z);
    const above = s.radius * z + 14;
    if (s.name) { ctx.textAlign = 'center'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = s.isLeader ? '#ffd98a' : 'rgba(220,235,255,0.85)'; ctx.fillText(s.name, 0, -above - 6); ctx.textAlign = 'left'; }
    if (s.hp < s.maxHp) { const w = Math.max(28, s.radius * 2.2 * z); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-w / 2, -above, w, 3); ctx.fillStyle = s.isLeader ? '#ffd98a' : '#ff8a8a'; ctx.fillRect(-w / 2, -above, w * Math.max(0, s.hp / s.maxHp), 3); }
    ctx.restore();
  }

  // ---- ship silhouettes ------------------------------------------------------
  // Hull models live in src/ships.js (one per class, keyed by visuals.js silhouette).
  // This wrapper keeps the readability overlays: spawn shield, white YOU core, leader crown.
  // Skins (data/cosmetics.js) retint the hull inside Ships.draw and may add an FX layer here —
  // they never touch the readability channels (silhouette / rim / white core / threat bloom).
  function drawShip(ctx, x, y, s, isPlayer) {
    const r = s.radius;
    if (isPlayer && PULSAR.Profile) s.skin = PULSAR.Profile.get().skin;   // your equipped livery (SP ship + MP own view-ship)
    const sk = (s.skin && PULSAR.cosmetics) ? PULSAR.cosmetics.skin(s.skin) : null;
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.aim);
    if (s.spawnProtect > 0) { ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, TAU); ctx.strokeStyle = `rgba(190,233,255,${0.25 + 0.2 * Math.sin(state.time * 18)})`; ctx.lineWidth = 2; ctx.stroke(); }
    PULSAR.Ships.draw(ctx, s, state.time);
    if (sk && sk.fx) drawSkinFx(ctx, s, sk.fx);            // cosmetic flair, dimmer than the rim
    ctx.restore();
    if (isPlayer) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();   // white core = you (readability)
    }
    if (s.isLeader) drawCrown(ctx, x, y, r);
  }

  // ---- cosmetic skin FX layers — additive flair around the hull (render-only). Drawn inside
  // the rotated ship frame (+x = nose). Per-ship phase so a lobby of same-skin ships won't sync.
  function drawSkinFx(ctx, s, fx) {
    const r = s.radius, t = state.time, ph = (s.id || 0) * 0.61;
    ctx.globalCompositeOperation = 'lighter';
    if (fx === 'ember') {                    // live sparks shed off the stern, drifting aft
      for (let i = 0; i < 5; i++) {
        const f = (t * (0.55 + 0.11 * i) + ph + i * 0.37) % 1;
        const a = (1 - f) * 0.55, sway = Math.sin(t * 3 + i * 2.1) * r * 0.3;
        ctx.fillStyle = `rgba(255,${150 + i * 18},60,${a})`;
        ctx.beginPath(); ctx.arc(-r * (0.7 + f * 1.6), sway, Math.max(0.8, r * 0.055 * (1 - f)), 0, TAU); ctx.fill();
      }
    } else if (fx === 'void') {              // dark breathing aura
      const b = 0.16 + 0.1 * Math.sin(t * 2.2 + ph);
      ctx.strokeStyle = `rgba(150,70,255,${b})`; ctx.lineWidth = r * 0.22;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(60,20,110,${b * 1.6})`; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.7 + Math.sin(t * 2.2 + ph) * r * 0.12, 0, TAU); ctx.stroke();
    } else if (fx === 'chrome') {            // specular glint sweeping the hull
      ctx.save(); ctx.rotate((t * 0.8 + ph) % TAU);
      const g = ctx.createLinearGradient(-r, 0, r, 0);
      g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(0.58, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    } else if (fx === 'aurora') {            // twin polar rings, offset hues
      const hue = 205 + 65 * Math.sin(t * 0.85);
      ctx.strokeStyle = `hsla(${hue},85%,70%,0.20)`; ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `hsla(${hue + 90},85%,72%,0.14)`; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.65, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
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
      // heavier finals carry bigger spiked maces — scale the drawn head to match its hitbox
      const headScale = s.classId === 'binaryStar' ? cfg.flailship.binaryStar.mace.sizeMult : 1;
      const tip = O.tipRadius * headScale;
      // local ships carry the full maces array; remote ships only sync head positions
      const heads = s.maces || [
        { x: s.orbX, y: s.orbY, selfSpin: s.orbSelfSpin || 0, state: s.orbState, flingPower: s.flingPower || 0 },
        ...(s.orbX2 != null ? [{ x: s.orbX2, y: s.orbY2, selfSpin: s.orbSelfSpin2 || 0, state: s.orbState, flingPower: s.flingPower || 0 }] : []),
      ];
      for (const h of heads) {
        if (h.x == null) continue;
        const ox = R.sx(h.x), oy = R.sy(h.y);
        const hot = Math.max(spin, (h.state === 'out' || h.state === 'back') ? (h.flingPower || 0) : 0);
        // CHAIN: dark outline + bright core so it always reads (thin gold vanished on big zoomed-out titans)
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(28,20,6,0.9)'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke();
        ctx.strokeStyle = `rgba(255,222,150,${0.8 + 0.2 * hot})`; ctx.lineWidth = 2.1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oy); ctx.stroke();
        // momentum reads as light: the head burns brighter the faster it swings / flies
        R.setComposite('lighter'); R.glow(ox, oy, tip * (2.2 + 1.6 * hot), [255, 210, 120], 0.55 + 0.45 * hot); R.setComposite('source-over');
        ctx.save(); ctx.translate(ox, oy);
        // SPIKED MACE head (ball), tumbling with its own spin — bigger on the heavy finals
        ctx.rotate(h.selfSpin || 0);
        ctx.fillStyle = hot > 0.6 ? '#fff3cf' : '#ffe6a8';
        for (let i = 0; i < O.spikes; i++) {
          const a = (i / O.spikes) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * tip * 1.6, Math.sin(a) * tip * 1.6);
          ctx.lineTo(Math.cos(a + 0.34) * tip * 0.85, Math.sin(a + 0.34) * tip * 0.85);
          ctx.lineTo(Math.cos(a - 0.34) * tip * 0.85, Math.sin(a - 0.34) * tip * 0.85);
          ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, tip, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,30,0.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, tip * 0.55, 0, TAU); ctx.stroke();   // forged core seam
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
  // Homing missile: an oriented dart with a warhead glow + a licking exhaust flame.
  function drawMissile(ctx, pr, x, y) {
    const r = pr.radius, vx = pr.vx != null ? pr.vx : (pr.x - pr.px), vy = pr.vy != null ? pr.vy : (pr.y - pr.py), ang = Math.atan2(vy, vx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    const fl = 2.2 + 0.7 * Math.sin(state.time * 40 + x);
    ctx.fillStyle = 'rgba(255,170,70,0.85)'; ctx.beginPath();
    ctx.moveTo(-r * 1.0, -r * 0.42); ctx.lineTo(-r * fl, 0); ctx.lineTo(-r * 1.0, r * 0.42); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffd9ab'; ctx.beginPath();          // body
    ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r * 0.9, -r * 0.55); ctx.lineTo(-r * 0.9, r * 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,30,0.9)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff3dd'; ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.42, 0, TAU); ctx.fill();   // warhead glint
    ctx.restore();
  }
  // Deflector shield bubble: hex-shimmer ring + faint fill; flares white on a hit, brightness ∝ charge.
  function drawShield(ctx, s, cx, cy) {
    const r = s.radius * 1.16, frac = Math.max(0, Math.min(1, s.shield / s.shieldMax)), t = state.time;
    const flash = Math.max(0, s.shieldFlash || 0);
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);   // faint interior fill
    g.addColorStop(0, 'rgba(70,150,220,0)'); g.addColorStop(1, `rgba(90,185,255,${0.05 + 0.16 * flash})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(150,225,255,${0.14 + 0.18 * frac + 0.6 * flash})`; ctx.lineWidth = 2.5 + 7 * flash;   // rim
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    const N = 40;                                          // shimmering hex-facet ring
    ctx.strokeStyle = `rgba(180,235,255,${0.10 + 0.16 * frac + 0.45 * flash})`; ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, rr = r * (1 + 0.022 * Math.sin(a * 7 + t * 2.2)); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  }
  function titanPath(ctx, r) { ctx.beginPath(); for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU, rr = r * (0.86 + 0.14 * Math.sin(a * 5 + 0.7) * Math.cos(a * 3 + 1.9)); const vx = Math.cos(a) * rr, vy = Math.sin(a) * rr; i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy); } ctx.closePath(); }
  function crystalPath(ctx, r) { ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.7, 0); ctx.closePath(); }
  function debrisPath(ctx, r) { ctx.beginPath(); ctx.moveTo(-r, -r * 0.4); ctx.lineTo(r * 0.6, -r); ctx.lineTo(r, r * 0.5); ctx.lineTo(-r * 0.3, r); ctx.closePath(); }
  function objectOverlays(ctx, o, x, y) {
    if (o.hp < o.maxHp) {
      const hurt = 1 - o.hp / o.maxHp;
      ctx.beginPath(); ctx.arc(x, y, o.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (o.hp / o.maxHp)); ctx.strokeStyle = `rgba(160,225,205,${0.55 + hurt * 0.3})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.spin);
      ctx.strokeStyle = `rgba(225,240,255,${0.28 + hurt * 0.52})`; ctx.lineWidth = 1 + hurt * 1.2;
      ctx.beginPath(); ctx.moveTo(-o.radius * 0.55, -o.radius * 0.2); ctx.lineTo(-o.radius * 0.1, 0); ctx.lineTo(o.radius * 0.18, o.radius * 0.37); ctx.lineTo(o.radius * 0.48, o.radius * 0.52); ctx.stroke();
      ctx.restore();
    }
    if (o.cracked) { ctx.strokeStyle = `rgba(255,170,90,${0.5 + 0.3 * Math.sin(state.time * 14)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, o.radius + 9, 0, TAU); ctx.stroke(); }
  }

  // ---- HUD / overlay / minimap ----------------------------------------------
  let fps = 0, fpsAccum = 0, fpsFrames = 0;
  let devOpen = true;
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function panel(ctx, x, y, w, h, accent) {
    roundRect(ctx, x, y, w, h, cfg.ui.panelRadius); ctx.fillStyle = 'rgba(6,11,21,0.82)'; ctx.fill();
    ctx.strokeStyle = accent || 'rgba(91,151,205,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = accent || 'rgba(91,151,205,0.35)'; ctx.fillRect(x + 12, y, Math.max(24, w * 0.22), 1.5);
  }
  function bar(ctx, x, y, w, h, frac, fill, label, value) {
    frac = Math.max(0, Math.min(1, frac)); roundRect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(210,230,255,0.09)'; ctx.fill();
    if (frac > 0) { roundRect(ctx, x, y, Math.max(h, w * frac), h, h / 2); ctx.fillStyle = fill; ctx.fill(); }
    if (label) { ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(190,215,238,0.65)'; ctx.fillText(label, x, y - 4); ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(225,240,255,0.78)'; ctx.fillText(value || '', x + w, y - 4); ctx.textAlign = 'left'; }
  }
  function drawOnboardingGuide() {
    if (!gameStarted || p.xp > onboardingStartXp || state.time - onboardingStartTime > cfg.onboarding.promptSec) return;
    let target = null, best = cfg.onboarding.targetSearchRadius;
    for (const o of state.objects) {
      if (o.type === 'titan') continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) { best = d; target = o; }
    }
    const ctx = Render.ctx, fade = Math.min(1, (cfg.onboarding.promptSec - (state.time - onboardingStartTime)) / 1.5);
    if (target && onScreen(target.x, target.y, target.radius + 30)) {
      // runs in screen space (after endWorld): project the world target through camera + zoom
      const z = Render.camera.zoom;
      const x = (target.x - Render.camera.x) * z + Render.viewW / 2, y = (target.y - Render.camera.y) * z + Render.viewH / 2;
      const ring = (target.radius + 12 + Math.sin(state.time * TAU * cfg.onboarding.targetRingPulsePerSec) * 2) * z;
      Render.setComposite('lighter'); Render.glow(x, y, ring * 2.1, [123, 224, 255], 0.32 * fade); Render.setComposite('source-over');
      ctx.strokeStyle = `rgba(150,235,255,${0.85 * fade})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ring, 0, TAU); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = `rgba(210,240,255,${0.92 * fade})`;
    ctx.fillText(target ? 'BREAK ROCKS  →  COLLECT SCRAP' : 'FIND ROCKS  →  COLLECT SCRAP', Render.viewW / 2, Render.viewH - cfg.ui.abilitySlotHeight - 31);
    ctx.textAlign = 'left';
  }
  function drawHud() {
    const ctx = Render.ctx, x = 14, y = 14, w = cfg.ui.statusWidth, fam = FAMILY[p.classId], node = classNode(p.classId);
    panel(ctx, x, y, w, 126, 'rgba(105,205,245,0.48)');
    ctx.textAlign = 'left'; ctx.font = '800 15px system-ui, sans-serif'; ctx.fillStyle = '#e9f7ff'; ctx.fillText(node.displayName.toUpperCase(), x + 14, y + 23);
    ctx.font = '700 10px system-ui, sans-serif'; ctx.fillStyle = '#72d9ff'; ctx.fillText(`LEVEL ${p.level}${p.isLeader ? '  ·  ★ LEADER' : ''}`, x + 14, y + 39);
    ctx.textAlign = 'right'; ctx.font = '800 17px system-ui, sans-serif'; ctx.fillStyle = '#ffd98a'; ctx.fillText(Math.floor(p.scrap), x + w - 14, y + 25);
    ctx.font = '700 8px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,217,138,.65)'; ctx.fillText('SCRAP', x + w - 14, y + 38); ctx.textAlign = 'left';
    bar(ctx, x + 14, y + 57, w - 28, 9, p.hp / p.maxHp, '#70e0a2', 'HULL', `${Math.ceil(p.hp)} / ${Math.ceil(p.maxHp)}`);
    const cur = world.xpForLevel(p.level), nxt = world.xpForLevel(p.level + 1);
    bar(ctx, x + 14, y + 83, w - 28, 7, (p.xp - cur) / Math.max(1, nxt - cur), '#5e9cff', 'EVOLUTION', `${Math.floor(p.xp - cur)} / ${Math.ceil(nxt - cur)}`);
    if (fam === 'rail') { const hf = p.heat / cfg.railship.heat.max; bar(ctx, x + 14, y + 108, w - 28, 6, hf, p.ventTimer > 0 ? '#ff5b5b' : (hf > 0.7 ? '#ff8b42' : '#f5c451'), 'HEAT', `${Math.round(hf * 100)}%`); }
    else if (fam === 'hammer') bar(ctx, x + 14, y + 108, w - 28, 6, p.ramActive > 0 ? 1 : p.ramCharge || 0, '#ff9955', 'RAM CHARGE', p.ramActive > 0 ? 'COMMITTED' : `${Math.round((p.ramCharge || 0) * 100)}%`);
    else { ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(170,200,225,.6)'; ctx.fillText(`⚔ ${p.kills} KILLS`, x + 14, y + 113); if (PULSAR.Profile) ctx.fillText(`◆ ${PULSAR.Profile.get().cores} CORES`, x + 92, y + 113); }
    drawAbilityDock(fam, node);
    if (PULSAR.MP && PULSAR.MP.AUTH) {
      const on = PULSAR.MP.connected;
      ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = on ? '#7be0a0' : 'rgba(255,180,120,0.8)';
      ctx.fillText(on ? `● ONLINE  ·  ${PULSAR.MP.count + 1} PILOTS` : (gameStarted ? '○ RECONNECTING — PAUSED' : '○ CONNECTING'), x + 14, y + 151);
    }
    if (!p.alive) { ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ff8a8a'; ctx.fillText('WRECKED — respawning…', Render.viewW / 2, Render.viewH / 2 + 90); ctx.textAlign = 'left'; }
  }
  function drawAbilityDock(fam, node) {
    const ctx = Render.ctx, slotW = cfg.ui.abilitySlotWidth, h = cfg.ui.abilitySlotHeight;
    const primary = fam === 'dart' ? ['LMB', 'POP GUN', 0, '#69d8ff']
      : fam === 'grav' ? ['LMB', 'LAUNCH ROCK', 0, '#8f7cff']
      : fam === 'flail' ? ['LMB', 'MOMENTUM FLING', 0, '#ffd56a']
      : fam === 'rail' ? ['LMB', p.classId === 'helion' || p.classId === 'supernova' ? 'SUSTAIN BEAM' : 'CHARGE RAIL', p.ventTimer || 0, '#69d8ff']
      : ['LMB', 'HAMMER RAM', p.ramActive || 0, '#ff9955'];
    const ability = fam === 'dart' ? ['WASD', 'THRUST', 0, '#67e8d0']
      : node.ability ? [fam === 'grav' ? 'CLICK' : 'SPACE', String(node.ability).replace(/([A-Z])/g, ' $1').toUpperCase(), p.abilityCd || 0, '#67e8d0']
      : fam === 'rail' ? ['SHIFT', 'AFTERBURN', p.burnCd || 0, '#67e8d0'] : ['SPACE', 'MANEUVER', p.abilityCd || 0, '#67e8d0'];
    const special = node.special ? ['E', String(node.special).replace(/([A-Z])/g, ' $1').toUpperCase(), p.specialCd || 0, '#ffaf70'] : ['T', 'CLASS TREE', 0, '#9fb8d5'];
    const slots = [primary, ability, special], total = slots.length * slotW + (slots.length - 1) * 8, x0 = (Render.viewW - total) / 2, y = Render.viewH - h - 14;
    slots.forEach((s, i) => {
      const x = x0 + i * (slotW + 8), cd = s[2]; panel(ctx, x, y, slotW, h, cd > 0 ? 'rgba(90,110,140,.3)' : s[3]);
      ctx.fillStyle = 'rgba(215,235,250,.08)'; roundRect(ctx, x + 8, y + 9, 36, 36, 7); ctx.fill(); ctx.strokeStyle = s[3]; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = cd > 0 ? 'rgba(170,190,210,.48)' : '#ecf9ff'; ctx.fillText(s[0], x + 26, y + 31);
      ctx.textAlign = 'left'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = cd > 0 ? 'rgba(165,185,205,.45)' : '#dff5ff'; ctx.fillText(s[1], x + 52, y + 24);
      ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = cd > 0 ? 'rgba(255,175,112,.72)' : 'rgba(120,235,195,.82)'; ctx.fillText(cd > 0 ? `${cd.toFixed(1)}s` : 'READY', x + 52, y + 39);
    });
    ctx.textAlign = 'left';
  }
  function drawLeaderboard() {
    const mp = p.plane | 0, ctx = Render.ctx, ranked = allShips().filter(s => s.alive && (s.plane | 0) === mp).sort((a, b) => b.scrap - a.scrap).slice(0, 4);
    const w = 190, x = Render.viewW - w - 14, y0 = 14; panel(ctx, x, y0, w, 104, 'rgba(110,170,220,.32)');
    ctx.textAlign = 'left'; ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(155,195,225,0.62)'; ctx.fillText('TOP PILOTS', x + 12, y0 + 18);
    ctx.font = '600 10px system-ui, sans-serif';
    ranked.forEach((s, i) => {
      const yy = y0 + 37 + i * 16; if (s === p) { ctx.fillStyle = 'rgba(80,190,235,.10)'; ctx.fillRect(x + 7, yy - 11, w - 14, 15); }
      ctx.fillStyle = s === p ? '#bfe9ff' : (s.isLeader ? '#ffd98a' : 'rgba(205,220,238,0.68)'); ctx.fillText(`${i + 1}`, x + 12, yy); ctx.fillText(s === p ? 'YOU' : nameOf(s), x + 29, yy);
      ctx.textAlign = 'right'; ctx.fillText('' + Math.floor(s.scrap), x + w - 12, yy); ctx.textAlign = 'left';
    });
  }
  function drawDevPanel() {
    if (!cfg.onboarding.showDevPanel) return;
    const mp = PULSAR.MP && PULSAR.MP.connected;   // in MP the buttons send admin messages to the authority
    const ctx = Render.ctx, w = 166, h = 27, x = Render.viewW - w - 14, tabY = 124;
    const tabW = 70, fpsOk = fps >= 55; panel(ctx, Render.viewW - tabW - 14, tabY, tabW, 23, fpsOk ? 'rgba(120,225,175,.38)' : 'rgba(255,110,110,.55)');
    ctx.textAlign = 'center'; ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = fpsOk ? '#8ee8b8' : '#ff8f8f'; ctx.fillText(`${devOpen ? 'DEV ×' : 'DEV +'}  ${Math.round(fps)}`, Render.viewW - tabW / 2 - 14, tabY + 15); ctx.textAlign = 'left';
    uiButtons.push({ x: Render.viewW - tabW - 14, y: tabY, w: tabW, h: 23, onClick: () => { devOpen = !devOpen; } });
    if (!devOpen) return;
    panel(ctx, x, tabY + 29, w, 70, 'rgba(255,140,230,.3)');
    const btn = (y, label, fg, bg, border, onClick) => {
      roundRect(ctx, x + 7, y, w - 14, h, 6); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = fg;
      ctx.fillText(label, x + w / 2, y + 17); ctx.textAlign = 'left';
      uiButtons.push({ x: x + 7, y, w: w - 14, h, onClick });
    };
    btn(tabY + 36, '+1 LEVEL  [L]', '#ffb4ee', 'rgba(58,18,58,0.75)', 'rgba(255,140,230,0.55)', adminLevelUp);
    const on = mp ? PULSAR.MP.remotes.some(r => r.isBot) : world.countBots() > 0;
    btn(tabY + 66, on ? 'BOTS  ON' : 'BOTS  OFF',
      on ? '#9fe8ff' : 'rgba(170,185,205,0.8)',
      on ? 'rgba(18,40,58,0.78)' : 'rgba(28,30,38,0.78)',
      on ? 'rgba(120,200,255,0.65)' : 'rgba(140,150,170,0.5)',
      mp ? () => PULSAR.MP.sendAdmin('bots') : toggleBots);
  }
  function drawEvolveOverlay() {
    const e = world.evolveOptions(p);
    if (!e || !e.levelOk || !p.alive) return;
    const ctx = Render.ctx, n = e.options.length, cols = n > 2 ? 2 : n, rows = Math.ceil(n / cols), bw = 300, bh = 96, gap = 10;
    const panelW = cols * bw + (cols - 1) * gap + 28, panelH = 62 + rows * bh + (rows - 1) * gap + 18, x0 = (Render.viewW - panelW) / 2, y0 = 64;
    panel(ctx, x0, y0, panelW, panelH, 'rgba(120,224,255,.6)');
    ctx.textAlign = 'left'; ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(140,205,235,.68)'; ctx.fillText('EVOLUTION AVAILABLE', x0 + 16, y0 + 20);
    ctx.font = '800 18px system-ui, sans-serif'; ctx.fillStyle = '#eaf8ff'; ctx.fillText('CHOOSE YOUR NEXT FORM', x0 + 16, y0 + 42);
    ctx.textAlign = 'right'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#ffd98a'; ctx.fillText(`${e.cost} SCRAP`, x0 + panelW - 16, y0 + 31); ctx.textAlign = 'left';
    const afford = p.scrap >= e.cost;
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols), bx = x0 + 14 + col * (bw + gap), by = y0 + 56 + row * (bh + gap); uiButtons.push({ x: bx, y: by, w: bw, h: bh, onClick: () => requestEvolve(i) });
      roundRect(ctx, bx, by, bw, bh, 8); ctx.fillStyle = afford ? 'rgba(16,35,52,0.94)' : 'rgba(12,19,29,0.88)'; ctx.fill(); ctx.strokeStyle = afford ? 'rgba(120,224,255,0.48)' : 'rgba(110,130,150,0.22)'; ctx.stroke();
      // Live hull preview: the actual model, idling — drums spin, cores pulse. Clipped to
      // its slot so long rail barrels don't spill over the text.
      ctx.save();
      ctx.beginPath(); ctx.rect(bx + 1, by + 1, 92, bh - 2); ctx.clip();
      ctx.translate(bx + 45, by + bh / 2); ctx.rotate(-0.35);
      PULSAR.Ships.draw(ctx, {
        classId: e.options[i].id, radius: 15, aim: 0, vx: 0, vy: 0, hitFlash: 0,
        charging: false, charge: 0, heat: 0, ventTimer: 0, ramWinding: false, ramCharge: 0,
        ramActive: 0, orbSpin: state.time * 2.2, captured: [], spawnProtect: 0,
      }, state.time);
      ctx.restore();
      if (!afford) { ctx.fillStyle = 'rgba(5,8,14,0.52)'; ctx.fillRect(bx + 1, by + 1, 92, bh - 2); }
      ctx.strokeStyle = 'rgba(120,224,255,0.18)'; ctx.beginPath(); ctx.moveTo(bx + 94, by + 10); ctx.lineTo(bx + 94, by + bh - 10); ctx.stroke();
      ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = afford ? '#72dfff' : 'rgba(140,165,185,.4)'; ctx.fillText(`[${i + 1}]  SELECT FORM`, bx + 108, by + 22);
      ctx.font = '800 15px system-ui, sans-serif'; ctx.fillStyle = afford ? '#edfaff' : 'rgba(200,215,230,0.46)'; ctx.fillText(e.options[i].displayName.toUpperCase(), bx + 108, by + 43);
      ctx.font = '500 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(175,205,228,0.68)';
      const blurb = EVOLVE_BLURB[e.options[i].id] || ''; ctx.fillText(blurb.length > 34 ? blurb.slice(0, 34) + '…' : blurb, bx + 108, by + 62);
      ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = afford ? 'rgba(125,230,195,.8)' : 'rgba(255,175,112,.66)'; ctx.fillText(afford ? 'READY TO EVOLVE' : `NEED ${e.cost - Math.floor(p.scrap)} SCRAP`, bx + 108, by + 81);
    }
    ctx.textAlign = 'left';
  }
  function drawMinimap() {
    const ctx = Render.ctx, size = cfg.ui.minimapSize, pad = 14, x0 = Render.viewW - size - pad, y0 = Render.viewH - size - pad, sc = size / cfg.arena.width;
    panel(ctx, x0 - 7, y0 - 24, size + 14, size + 31, 'rgba(95,155,210,.36)');
    ctx.font = '800 8px system-ui, sans-serif'; ctx.fillStyle = 'rgba(145,190,220,.62)';
    ctx.fillText('TACTICAL  /  PULSAR CENTER', x0, y0 - 9);
    ctx.fillStyle = 'rgba(5,10,19,0.78)'; ctx.fillRect(x0, y0, size, size); ctx.strokeStyle = 'rgba(80,120,180,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, size, size);
    ctx.strokeStyle = 'rgba(90,145,190,.12)'; ctx.beginPath(); ctx.moveTo(x0 + size / 2, y0); ctx.lineTo(x0 + size / 2, y0 + size); ctx.moveTo(x0, y0 + size / 2); ctx.lineTo(x0 + size, y0 + size / 2); ctx.stroke();
    // black hole marker: dark core + bright ring that flares on the jet beat
    const px = x0 + (cfg.arena.width / 2) * sc, py = y0 + (cfg.arena.height / 2) * sc;
    const jf = Math.max(0, 1 - ((state.time % cfg.arena.pulsar.jetIntervalSec) / cfg.arena.pulsar.jetIntervalSec) * 6);
    ctx.fillStyle = '#04060c'; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(220,240,255,${0.75 + 0.25 * jf})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(px, py, 4.8 + jf * 2, 0, TAU); ctx.stroke();
    // titan landmarks — the mountains you navigate by
    ctx.fillStyle = 'rgba(150,165,195,0.7)';
    for (const o of state.objects) if (o.type === 'titan') { ctx.beginPath(); ctx.arc(x0 + o.x * sc, y0 + o.y * sc, 3, 0, TAU); ctx.fill(); }
    // Each ship is a CLASS-COLOURED arrow pointing where it faces (you = cyan + ring, leader = gold rim).
    for (const s of allShips()) {
      if (!s.alive) continue;
      const mx = x0 + s.x * sc, my = y0 + s.y * sc, isMe = s === p, r = s.isLeader ? 5.2 : (isMe ? 4.2 : 3.5);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(s.aim);
      ctx.fillStyle = isMe ? '#39d0ff' : hueFor(s.classId);
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.62); ctx.lineTo(-r * 0.7, -r * 0.62); ctx.closePath(); ctx.fill();
      if (s.isLeader) { ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
      if (isMe) { ctx.strokeStyle = 'rgba(57,208,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, r + 2.5, 0, TAU); ctx.stroke(); }
    }
    // crisp corner brackets make the map read as an instrument, not another world object
    ctx.strokeStyle = 'rgba(130,210,245,.7)'; ctx.lineWidth = 1.5; const c = 11;
    ctx.beginPath(); ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0); ctx.moveTo(x0 + size - c, y0); ctx.lineTo(x0 + size, y0); ctx.lineTo(x0 + size, y0 + c); ctx.moveTo(x0, y0 + size - c); ctx.lineTo(x0, y0 + size); ctx.lineTo(x0 + c, y0 + size); ctx.moveTo(x0 + size - c, y0 + size); ctx.lineTo(x0 + size, y0 + size); ctx.lineTo(x0 + size, y0 + size - c); ctx.stroke();
  }
  function drawKillFeed() {
    const ctx = Render.ctx, x = Render.viewW - 16; let y = devOpen && cfg.onboarding.showDevPanel ? 238 : 164;
    ctx.textAlign = 'right'; ctx.font = '700 10px system-ui, sans-serif';
    for (let i = killFeed.length - 1; i >= 0; i--) {
      const k = killFeed[i], age = state.time - k.t;
      if (age > 6) continue;
      const a = Math.max(0, Math.min(1, (6 - age) / 1.5));
      const txt = k.killer ? `${k.killer}  ⚔  ${k.victim}` : `${k.victim}  ☠`;
      const tw = ctx.measureText(txt).width; roundRect(ctx, x - tw - 14, y - 12, tw + 12, 18, 5); ctx.fillStyle = `rgba(8,12,20,${0.65 * a})`; ctx.fill();
      ctx.fillStyle = `rgba(${k.leader ? '255,210,120' : '230,160,150'},${0.9 * a})`;
      ctx.fillText(txt, x - 6, y); y += 21;
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
    // Render at a stable configured ceiling while carrying timing remainder. Resetting the clock
    // to `now` quantizes 60fps to 48fps on 144Hz displays; carrying the remainder avoids that.
    const renderInterval = 1000 / cfg.sim.maxRenderFps, sinceRender = now - lastRender;
    if (sinceRender >= renderInterval - 0.5) {
      lastRender = now - (sinceRender % renderInterval);
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
    onboardingStartXp = p.xp; onboardingStartTime = state.time;
    p.spawnProtect = cfg.player.spawnProtectionSec;
    if (PULSAR.MP && PULSAR.MP.AUTH) PULSAR.MP.sendName(p.name);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
