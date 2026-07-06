# PULSAR.io — DEVLOG

Append-only session log. Newest entry on top. Every session ends with an entry: what changed,
files touched, new config, how to test, known limits, TODO hooks left. This is how context
survives between agents and sessions.

---

## 2026-07-06 — Hammer family: boost pods deploy straight, exhaust points astern
**What changed:** The hammer windup telegraph (`hammerBody` in `src/ships.js`) had its fold-out
booster pods **hinging** outward with charge — which rotated the whole pod so the exhaust flames
aimed diagonally out to the sides (nonsensical: side-thrust wouldn't drive a forward ram). Now the
pods **slide straight out** from the flanks on a short deploy strut and stay **axis-aligned**, so
their burn points dead astern — same direction as the main thrusters — and all the thrust drives
the ram FORWARD. Slide distance + burn color (yellow→red) still scale with charge.

**Files touched:** `src/ships.js` (`hammerBody` boost-jet block only). Pure visual; drives off the
existing `ramWinding`/`ramCharge`/`ramActive` fields, MP-safe. Verified across hammerhead /
maulbreaker / worldsplitter at charge 0→1.

---

## 2026-07-06 — Rail family resprite: clamshell gun pods (a GUN with a ship attached)
**What changed:** `railBody` in `src/ships.js` rebuilt around a new concept. At rest every rail
class is a **sealed clamshell gun pod** — the weapon is hidden inside a sleek two-half cowl, with
a small tail craft (fins, engine, cockpit dot, heat-vent slats) bolted to the back. Charging
**splits the shell open** (halves lift laterally + flare on a rear hinge) and the inner rail
**telescopes out** — barrel gets longer AND brighter as charge builds (energy sleeve, thickening
accelerator rails, muzzle bloom, capacitor rings riding the growing barrel). Seam flash knifes
out of the crack as the shell first opens. The old charge-lance aim line is gone; the extending
barrel + rings + maw are the telegraph now.

**Per class:** Railship extends ~1.35r→2.4r with gold overcharge shimmer past full. Helion /
Supernova open on **beam ramp** (`useRamp`), lens ring rides the extending muzzle. Star Piercer /
Starbreak keep the hinging maw jaws at the (now moving) muzzle, wider cowl split; Starbreak's
rift dashes track the extended muzzle instead of a fixed offset.

**Also:** the old charge intake aura (12 streaks spiraling around the whole hull + pulsing ring,
`game.js` rail-family overlay) is replaced by a **muzzle feed**: little energy orbs condense in a
forward cone ahead of the cannon and accelerate into the muzzle as charge builds. Front-only —
nothing orbits the hull anymore. The full-charge redline glow is unchanged.

**Files touched:** `src/ships.js` (railBody + 5 rail models), `src/game.js` (rail charge intake),
`data/visuals.js` (rail cues/notes).
Pure visual — no sim/config changes, MP-safe (draws off existing snapshot fields:
charge/charging/beamRamp/beamTimer/beamPower/heat/ventTimer).

**How to test:** open `index.html`, pick Railship: idle = closed pod; hold LMB = shell splits,
barrel telescopes + brightens, gold shimmer on overcharge hold. Helion/Supernova: shell opens as
the beam ramps. Star Piercer/Starbreak: jaws gape at the end of the extended rail.

**Known limits:** shell open/close snaps with the charge value (no eased shut animation after
firing — charge drop closes it in one frame; looks like recoil-slam, acceptable for now).

---

## 2026-07-02 — TIER-3 FINALS: Supernova, Starbreak, Binary Star (the tree is complete)
**What changed:** The three empty lvl-15 slots are filled — every family now branches to a real
final. Design bar (set when Lancer was retired): a final adds a NEW VERB on the tier-2 identity,
never stat mods. Each one weaponizes its class's core tension. First feature built entirely on
the unified sim: one implementation, SP + MP identical.

- **SUPERNOVA (Helion final):** same ramping beam; the heat bar becomes ammunition. [E] **Flare
  Nova** (`flareNova` special, `config.helion.supernova`): dumps ALL current heat as an expanding
  blast — damage `base + perHeat×heat` with rim falloff, big knockback, and it CLEARS a vent
  lockout (the fuse becomes the panic button). <minHeat refuses with a short retry cd. Spent heat
  is spent beam uptime; enemies can pressure the bar to force a weak nova. Hull: oversized lens +
  a CORONA ring that burns brighter with heat + prominence arcs (ships.js `supernova`).
- **STARBREAK (Star Piercer final):** blasts fired at ≥`rift.minCharge` tear a RIFT along the
  whole shot line (`mawRail` fire → `ship.rifts`, ticked in `tickRifts` — even during vent):
  simmering beam pulses that quicken, then the corridor DETONATES (`rift.damage` to everything
  in it, no pierce cap — it's a zone; perpendicular knockback shoves victims OFF the line).
  A miss is area denial now. `rift.maxActive` caps stacking; rifts fizzle on death
  (resetClassState). Visuals ride existing fx beams → MP-relayed for free. Keeps Broken Core.
- **BINARY STAR (Twinmaul final):** `wreckingOrb` twin check now includes it (two heads, same
  volley/sync controls, Static Lash kept). NEW: a live TETHER between the heads
  (`config.flailship.binaryStar.tether`) — enemies crossing the segment (8-92% of it; the ends
  belong to the maces) take gated ticking damage and are DRAGGED onto the wire; both amplify
  while heads are in flight (`thrownDmgMult`/`thrownPullMult`) — the synced RMB throw is the
  garrote. Per-attacker touch map (same postmortem lesson as the orb gates). Render: crackling
  segmented tether in drawClassExtras, local AND remote (orbX/orbX2 already in the snapshot —
  zero protocol changes needed). Hull: twinmaul + energized bridge manifold.
- **Plumbing:** classes.js nodes (+ TODOs removed), visuals.js rows, IMPLEMENTED/FAMILY/
  EVOLVE_BLURB in sim.js + game.js mirrors, mpclient RAILS set (afterburner prediction for the
  rail finals), bots (REACH_CLASS + SUSTAIN/SIEGE/TWIN groupings so finals inherit their
  parent's brain; supernova bots nova when hot + dived).

**Verified headlessly:** `tools/finaltest.js` (new) 12/12 — all three evolutions reachable at
lvl 15, nova damage exactly matches the formula (70.9 predicted/dealt) + clears heat/vent +
refuses below minHeat, starbreak blast 120 then rift detonation 63 after the delay, binaryStar
spins two heads + tether burns a crosser, and a 30s all-finals bot lobby stays finite.
Full regression: sptest/edgetest/predtest green (sptest hardened against two flaky assertions —
bot-kill during the drive phase + leftover thrust intent drifting the respawned ship out of the
edge band before measurement; both were test bugs, not sim bugs). Headless Chrome boots SP clean.

**Known limits / TODO:** numbers are first-pass — duel-ladder + farm-rate passes for the three
finals haven't run yet (fold into the next balance session; rail family was already flagged
overtuned). Bots don't lead the rift (they never aim where an enemy WILL be). Hammer branch B
is now the only structural gap in the tree.

**Follow-up (2026-07-06) — INTEREST MANAGEMENT ("mad laggy" tunnel fix):** first public playtest
through a Cloudflare quick-tunnel was unplayable — snapshots shipped the ENTIRE arena (330
objects, 120 motes, all fx) to every client at 60Hz ≈ 5-6Mbps each, saturating home upload.
Fixes, all in mpserver + mpclient:
- *Per-client CULLED snapshots* (`snapshotFor(c)`): projectiles/motes/fx/objects only within a
  box around the client's ship (CULL 1400 / fx 1600 / obj 1500 — view is ~1100px, pop-in stays
  off-screen). Titans always (minimap landmarks). Shake events now only go to their owner.
- *Far-ship slim records* (`shipSnapFar`): ships beyond view range send only what the minimap +
  leaderboard read (~1/3 the bytes); full combat detail within range + always for your own ship
  (prediction needs it). Missing fields default safely client-side.
- *Ack is per-client scalar* (`ack`) instead of the broadcast `aq` map.
- *Public mode runs 30Hz snapshots*; the welcome message carries `hz` and the client scales its
  interp delay (`interpMs = max(40, 2500/hz)`). Dev stays 60Hz.
- *Leak fix:* fxEvents accumulated unboundedly while zero clients were connected (pre-existing).
Measured via wsprobe (now prints avg snapshot size × actual rate; worst-case dense edge band):
dev 60Hz ≈ 1.7Mbps, public 30Hz ≈ 0.8Mbps per client — ~7x less than before. Next lever if
still needed: binary/delta encoding (JSON keys are most of the remaining bytes).

**Follow-up (2026-07-06) — PUBLIC deployment mode (play it, don't read it):** client JS can never
be truly hidden (the browser downloads it), so the public build ships MINIFIED+MANGLED code and
the readable source stays in the private GitHub repo. `tools/build-dist.js` (deploy-only; dev
stays no-build) terser-minifies every script index.html loads into `dist/` (247kb→115kb, zero
comments — the design-note comments are half the IP and they're gone). `PULSAR_PUBLIC=1 node
mpserver.js` serves dist/ AND hard-disables admin cheats. The static server now has an ALLOWLIST
in every mode (`/index.html`, `/data|src/*.js` only) — it previously served docs/, tools/, .git/,
and mpserver.js itself to anyone who asked. Verified: game plays through the public server
(probe moves, acks ok), admin refused (lvl stayed 1), all sensitive paths 404. Public URL: run
`cloudflared tunnel --url http://localhost:8080` (installed via winget; free quick-tunnel, no
account) — or a real Node host later. dist/ is gitignored (rebuilt per deploy).

**Follow-up (same session) — CLASS TREE overlay [T]:** full evolution tree at a glance — live
idling hull models (same posed-ship trick as the evolve previews), display names, EVOLVE_BLURB
one-liners (wrapped), parent→child connectors, LV 3/8/15 gate labels, and your current class
highlighted (◂ YOU). Toggles with [T] in every mode (SP/MP/dead); non-blocking — the game runs
behind the dim. `?tree` query param skips the title and auto-opens it (dev/screenshot hook — used
to verify the layout headlessly; screenshot confirmed all 17 nodes render). `drawClassTree` +
`wrapText` in game.js; HUD hint line mentions T.

**Follow-up (same session) — dev panel works ONLINE:** the admin panel now shows in MP and its
buttons send `{t:'admin', a:'levelUp'|'bots'}` to the authority, which applies them server-side
(`world.earn` for +1 LVL — [L] key wired in mpControls too; bots toggle spawns/clears the
server's bots for everyone). Snapshot ships carry `bt` (isBot) so the BOTS label reflects server
state. Cheats are honored by default (dev/LAN server); set `PULSAR_ADMIN=0` on the server to
refuse them before hosting anything serious. Verified via wsprobe: 3× levelUp over the wire →
lvl 5 in the next snapshots.

---

## 2026-07-02 — Phase 5 Step 3: ONE CODE PATH — SP runs sim.js, relay retired, killfeed in MP
**What changed:** The unification the roadmap has demanded since Phase 5 began. `game.js` no longer
contains a simulation: single-player creates a local `PULSAR.createWorld` (the EXACT sim the
authoritative server runs) and steps it; game.js is now input→intent + render/HUD only (~380 lines of
duplicated sim deleted). Every future gameplay change lands in sim.js ONCE and applies to SP and MP
identically — the "changed in BOTH game.js and sim.js" era is over.

- **`src/sim.js`:** gained `edgeSpawn()` (the outer-band spawn rule game.js had; now applies to
  players AND bots, spawns AND respawns, SP and MP — the old fixed/random spawns are gone), an
  `opts.onKill(victim, killer)` hook (fired at kill time, before the scrap drop, so scrap/xp/leader
  are still intact), and lost the relay bridge (`onRemoteHit`, all `isRemote` guards).
- **`src/game.js`:** world glue at boot (createWorld + addShip player + spawnBots unless MP-auth);
  `spControls` reads input and calls `world.setIntent` (the edge-latch from the race fix applies to
  SP identically); `simulate` = controls + `world.step` + Fx aging; killfeed + Profile core-banking
  moved into the world's onKill hook; admin/evolve/HUD go through world.* helpers. All rendering
  unchanged. Relay code paths (ghosts, Net HUD, onHit bridge, bots-in-relay) deleted.
- **Relay RETIRED:** `server.js` + `src/net.js` deleted; index.html loads `src/sim.js` (after
  weapons/bots — it reads `weaponHue` at load) and drops net.js. `?solo` still works: mpclient's
  AUTH check respects it, forcing local SP even when served by mpserver.
- **Killfeed in MP (the missing Step-2 piece):** mpserver passes `onKill` → broadcasts
  `{t:'kill', kn, vn, ld}` (names: player name or class displayName); mpclient routes it to game.js
  `addKill` → the same killfeed UI. SP gets identical feeds from the local world's hook — INCLUDING
  bot-vs-bot kills, which the old game.js feed already had, and remote-vs-remote kills in MP, which
  the relay never delivered.

**Verified headlessly:** `tools/sptest.js` (new) exercises the unified SP path 6/6 — edge-band
spawns (all ships), intent-driven movement, all-finite state after 10 sim-seconds with bots,
onKill attribution, death→fresh-Scout respawn in the edge band. edgetest 3/3 + predtest 8/8 still
green. Headless Chrome (--dump-dom, 6s virtual time) boots the SP page with ZERO runtime errors.
Live mpserver probe: ack tracking OK, movement OK, no net.js served, sim.js served. Ships now
edge-spawn in MP too (was fixed/random — free consistency win from unification).

**Files:** `src/sim.js`, `src/game.js`, `src/mpclient.js`, `mpserver.js`, `index.html`,
`tools/sptest.js` (new); DELETED `server.js`, `src/net.js`.
**Known limits / TODO:** killfeed names in MP are class names for bots (fine) and player-set names
for humans; no kill-assist logic. The two-browser sign-off remains the Phase 5 gate. Muzzle
prediction (own shots appear ~70-90ms late) and delta/binary snapshot encoding for internet play
are the remaining netcode niceties.

---

## 2026-07-02 — Phase 5 Step 2c: render-rate visuals in MP ("looks like 30hz" fix)
**What changed:** Movement felt right after prediction, but the WORLD still looked snapshot-stepped.
Root causes (none of them the server rate): `state.time` was taken raw from snapshots, so every
time-driven animation (hull models, engine flicker, spins, fades, pulsar pulse) stepped at 20Hz;
projectiles + motes weren't interpolated at all; object spin only updated every 10th snapshot; and
the own ship had no sub-tick interpolation on high-refresh displays.

- **Continuous clock:** `state.time` (+ pulsarTimer) is now LERPED between the bracketing snapshots —
  animations run at render rate, period.
- **Entity ids → interpolation:** the server stamps `_nid` ids on projectiles/motes/objects
  (`nid()` in mpserver.js); the client id-matches across the bracket pair and lerps positions.
  Thrown rocks also carry `rt` (rockType) again so they keep their real silhouette.
- **Objects spin locally:** object frames now include `sr` (spinRate); the client keeps PERSISTENT
  per-id view objects that advance spin every frame and ease toward the (slow) authoritative
  positions — no more 0.5s stutter-rotation, and no per-frame allocation for ~330 rocks.
- **Own-ship sub-tick:** `pred` tracks px/py per tick; game.js passes the REAL accumulator alpha
  through again (was forced to 1), so 144/240Hz displays get sub-tick lerp on your hull and on FX
  particles. Reconcile shifts the px/x pair together (no smear); snaps reset both.
- **Server tick 30→60Hz** (`TICK` in mpserver.js): matches the SP sim clock exactly — same tuned
  feel, finer combat granularity, ~2× sim CPU (trivial). SNAP_HZ stays 20 — with full interpolation
  the snapshot rate is visually irrelevant; only bandwidth would change.

**Verified:** predtest 8/8 still green, wsprobe vs live 60Hz server: ack tracking OK, ship moves,
extended fields present. node --check clean on all three touched files.
**Files:** `mpserver.js`, `src/mpclient.js`, `src/game.js`.
**Known limits:** motes/projectiles still rebuild per render frame (~120 small allocs/frame — watch
for GC hitches, pool if seen); object drift between authoritative frames is eased, not exact.

**Follow-up (same session) — user playtest: "still 20Hz, no asteroid hp, unbearable fire lag":**
- *Ship ANIM FIELDS were still snapshot-stepped* — positions interpolated but charge/heat/orbSpin/
  spinFrac/ramCharge/beamRamp etc. came raw from the newest snapshot. New `lerpCont()` lerps all 14
  continuous numerics between the bracket pair; `applyDiscrete` keeps only booleans/steps.
- *Fire latency stack was ~200ms*: 30Hz intent send (≤33ms) + 20Hz snapshots (≤50ms) + 100ms interp
  delay. Now **SNAP_HZ 60** + **SEND_HZ 60** + **INTERP_MS 40** → ~70-90ms click-to-visible on
  localhost. Bandwidth ≈3× (~roughly 0.5-1MB/s per client, JSON) — fine for LAN; internet play will
  want delta/binary encoding (future work).
- *Tap-fire could drop entirely* — `firing` was overwritten (not latched) between sends; a full
  click inside one send window vanished. New `fireEdge` latch ORs into the next send's `firing`.
- *Asteroid hp arc never drew* — client rebuilt objects with hp==maxHp. Object frames now carry
  `h` (hp fraction, OBJ_EVERY 10→6 ⇒ 10Hz), and object hit-flash latches on + decays locally.

**Follow-up 2 — "abilities on twinmaul aren't working" (MP edge race):** edge-triggered intents
(ability/special/afterburner/altFire) are one-tick pulses from the client, but `setIntent` REPLACED
the pending intent — at 60Hz send vs 60Hz tick on independent clocks, two packets routinely land
between ticks and the second (edge=false) killed the first's edge before any tick consumed it.
Twinmaul (Space/E/RMB — all edges) read as fully broken; gravitor click-launch + afterburner had the
same race. FIX in `sim.js`: `setIntent` now ORs unconsumed edge flags from the previous pending
intent, and `step()` clears them after exactly one tick (level fields still take the newest value;
guarded so the shared IDLE object is never mutated). Verified: `tools/edgetest.js` (new) reproduces
the overwrite race headlessly — ventDash + staticLash both fire despite it, and the cd decays
(consume-once) instead of re-arming.

---

## 2026-07-02 — Phase 5 Step 2b: CLIENT-SIDE PREDICTION (the snappiness fix) + Node installed
**What changed:** The thin client's input lag (own ship rendered ~100ms in the past — reported as "game
lost all snappyness") is fixed with movement prediction + seq-ack reconciliation. Your own ship now
simulates its MOVEMENT locally the instant input happens (single-player feel); weapons/damage/economy
stay server-authoritative. Remote ships stay interpolated as before.

- **Protocol:** `{t:'in'}` now carries `q` (input sequence number); the server stores the last seq
  received per client and broadcasts an ack map `aq: {shipId: seq}` in every snapshot. `shipSnap` gained
  `vx/vy/ix/iy` (velocity + impulse) so the client can adopt server-side knockback.
- **`src/mpclient.js` — `predict(p, intent, dt)`:** faithful mirror of simShip's movement half
  (inertia, cruise, arena clamp, rail afterburner kick/boost — all input-driven ⇒ predictable; speed
  multipliers read server-synced flags: charging/ramWinding). Called every sim tick from game.js.
  Each intent send records the predicted position under its seq (`history`).
- **Reconciliation ("snap the sim, smooth the presentation"):** on each snapshot, compare server pos
  against `history[ack]`; shift the prediction by the error AND add the same shift to a VIEW OFFSET,
  so the rendered position doesn't move at the correction instant — the offset then melts at 9/s.
  Errors > 200px (respawn, Static Lash yank) snap outright. Server impulses that exceed ours are
  adopted (unpredicted knockback transfers). Own ship renders at `pred - viewOffset` with local mouse
  aim (instant); death hands the camera back to server interpolation until respawn.
- **`src/game.js`:** `mpControls` now returns a per-TICK intent (true edges — the network latch would
  double-fire the afterburner kick); `mpSimulate` calls `MP.predict` with it every fixed tick.

**Verified headlessly:** `tools/predtest.js` (new, node) — 8/8: cruise cap 391.9 vs the sim's verified
392 px/s @3s (movement mirror is faithful), reconcile shifts sim without moving the rendered pos, view
offset melts <1s, 500px error snaps clean, afterburner kick+cooldown predicted, 400-impulse knockback
adopted. `tools/wsprobe.js` extended: ack echo tracked sent seq against a live server (lastAck=30 /
sentSeq=31 mid-flight), `vx/ix` fields present, intent still moves the ship. All files node --check clean.

**Also:** Node.js LTS v24.18.0 installed on this PC via winget (`C:\Program Files\nodejs\`) — `node
mpserver.js` now works in any fresh terminal. `.claude/launch.json` updated to the real Node.

**Known limits / TODO hooks:**
- Prediction is MOVEMENT-only by design: dash/lunge impulses from abilities land via impulse-adoption a
  snapshot late; stun/slow aren't predicted (absorbed by correction). If hammer lunge feels mushy over
  real internet, predict it next (it's input-driven too).
- Continuous-intent timing means the server integrates an acked intent slightly past the client's
  history stamp — shows as a small (<15px) steady correction while moving, hidden by the view-offset
  melt. If wobble is ever visible, add a dead-zone before correcting.
- Flail mace/gravitor rocks around YOUR ship are still server-interpolated → chain anchors to a hull
  that's now ~RTT ahead; watch for visible stretch when playing flail online.
- Still open from Step 2: SP on sim.js (one code path), retire relay, killfeed in MP, per-entity
  projectile interpolation.

---

## 2026-07-02 — Phase 5 Step 2: authoritative THIN CLIENT (interpolation, no prediction yet)
**What changed:** Wired the browser to the authoritative server built in Step 1. When the page is served
by `mpserver.js`, the client stops simulating and renders the world the server broadcasts — the
cheat-resistant shared-world path. Single-player + the old relay are untouched (fall-through when the
auth marker is absent). Server side verified end-to-end headlessly; the two-tab in-browser sign-off is
the remaining gate (can't be done headlessly — the screenshot tool won't capture a continuous-rAF canvas).

- **`src/mpclient.js` (new) — `PULSAR.MP`:** activates on `window.__PULSAR_AUTH__`. Connects `/ws`, sends
  `{t:'join',name}` + `{t:'in',i:intent}` (throttled 30Hz) + `{t:'evolve',i}`. Buffers 20Hz snapshots and
  SNAPSHOT-INTERPOLATES: renders `INTERP_MS=100ms` in the past, lerping ship x/y/aim/orb positions between
  the two bracketing snapshots. Rebuilds game.js's render `state` (ships/projectiles/motes/objects) with
  `px==x` so game.js's own render-interp is a no-op. Derives vx/vy from the interpolated pair (free engine
  flares), fakes gravitor `captured` shapes from the count (as the relay did), replays server FX events
  ONCE on ingest (screen-shake only for your own ship). Own ship is mutated onto the existing `p` (keeps
  local name + drives camera/HUD); others go in `MP.remotes`.
- **`mpserver.js`:** `shipSnap` extended with the fields the existing renderer needs — `nm` (name), `xp`,
  flail second head `ox2/oy2` + `oss/oss2` (orbSelfSpin), `os` (orbState), `fp` (flingPower), `sf`
  (spinFrac), and rail `br/bt/bp` (beamRamp/beamTimer/beamPower for Helion/Star Piercer hull cues). New
  `{t:'join',name}` handler stores `ship.name`. When serving `index.html` it injects
  `<script>window.__PULSAR_AUTH__=true</script>` so the client picks the thin-client path over the relay.
- **`src/game.js`:** mode-branches WITHOUT disturbing SP. `allShips()`, `simulate()`, `render()` short-circuit
  to the MP path when `MP.connected`: `simulate` → `mpSimulate` (read input into a latched intent, send via
  `MP.tick`, age FX locally — NO local sim); `render` → `MP.syncState(state,p)` first, then the unchanged
  draw path. Input read + intent build extracted to `mpControls`/`mpGetIntent` (edge actions LATCH until a
  send consumes them, so a tap between 30Hz sends is never dropped). Evolve routed through `requestEvolve`
  (→ server in MP, local in SP). Dev panel (admin/bots) hidden in MP; HUD shows `◉ AUTHORITATIVE · N players`.
- **`index.html`:** loads `src/mpclient.js` (after net.js, before game.js).

**How to run (needs Node — see Known limits):** `node mpserver.js` → open `http://localhost:8080` in TWO
tabs/browsers → PLAY in each. Both should see the SAME asteroid field + each other's ships moving, fighting,
farming, evolving, dying — one shared authoritative world. SP unchanged: open `index.html` (file://) or
`node server.js` (relay) as before.

**Verified headlessly:** all files parse (node --check). Raw-WS probe (`tools/wsprobe.js`, no deps) against
a live `mpserver.js`: `welcome`+arena received, `join` applied (name rides `nm`), input intent MOVED the
ship, 20Hz snapshots carry ALL extended renderer fields, full world (ships+projectiles+motes+objects).
Server injects the auth marker + serves mpclient.js (confirmed over HTTP).

**Known limits / TODO hooks:**
- **NO client-side prediction yet.** Own ship is interpolated like everyone else → input shows ~interp +
  RTT/2 of lag. Next step: predict own ship locally (re-run `sim.js`) + reconcile against snapshots — needs
  an INPUT SEQUENCE NUMBER added to the `{t:'in'}` protocol (server echoes last-processed seq). This is the
  meaty netcode and the main remaining feel gap.
- **Projectiles/motes aren't interpolated** (no ids in the snapshot) — rendered at the latest snapshot, so
  fast projectiles step at 20Hz. Add per-entity ids to interpolate if it reads badly.
- **Killfeed is empty in MP** (no kill events relayed; you still see the server's WRECKED float-text via FX).
- **SP still runs game.js's own sim**, not `sim.js` — the "one code path" unification + retiring the relay
  (`server.js`/`net.js`) are still open Step-2 cleanup.
- **Node isn't installed on this Windows PC's PATH.** This session ran `mpserver.js` via a Node bundled with
  Adobe; a real `node` install is needed to run the authoritative server normally. SP needs no Node.
- `tools/wsprobe.js` (new) is a keepable headless server smoke-test; `.claude/launch.json` added for the
  preview runner.

---

## 2026-07-02 — Ship model pass: unique procedural hulls for all 17 classes
**What changed:** Replaced the placeholder single-polygon silhouettes (spear/wedge/crescent/circle)
with hand-built multi-part vector hull models — one per class/evolution — in a new module
`src/ships.js` (`PULSAR.Ships.draw`). Every hull is designed to SHOW its weapon:
- **Rail family:** a gun with a ship attached — dominant barrel with twin accelerator rails,
  capacitor rings that light front-to-back with charge, rear heat-vent slats that go molten with
  heat (red-pulse while venting). Lancer = longer/thinner needle w/ 3 rings; Star Piercer = heavy
  fork muzzle (beam forms between twin prongs).
- **Hammer family:** all mass forward — bolted ram slab with rivets on a stubby tug body, oversized
  engine pods. Ram face heats orange→white-hot with windup. Maulbreaker = serrated 4-tooth face +
  armor; Worldsplitter = anvil head w/ central cleaving ridge, hazard chevrons, triple engines.
- **Grav family:** C-shaped annular hull wrapping an exposed gravity core, mouth forward, engine
  pod aft. Artillery branch (bright reactor core that brightens per loaded rock, horn launcher
  rails; Starfall adds a central launch rail splitting the mouth). Control branch closes the C
  into a containment ring around a VOID core (black center, hot rim, rotating accretion arc);
  Event Horizon adds a counter-rotating broken outer ring + field vanes.
- **Flail family:** a working tug — hex hull, front chain-guide yoke, central winch drum whose
  spokes rotate with `orbSpin` (visible drivetrain). Chainmaul = bolted shoulder armor, 4-spoke
  drum; Ironmoon = rear counterweight block; Graviflail/Orbit Crusher = round hull + 1/2 orbit
  guide rings with ticks riding the orb spin.
- All ships: hue-derived 3-shade palette (dark body / plate / accent + shared bright rim),
  additive engine flare scaled by actual velocity, hit-flash overrides, everything in units of
  `s.radius` so leader growth scales free. Charge lance + ram telegraph cues preserved.

**Files touched:** `src/ships.js` (new), `src/game.js` (drawShip now delegates; old SIL table +
drawSpear/Wedge/Crescent/RingedHull/Dart deleted; tier pips dropped — each evolution now has a
unique silhouette so pips were redundant), `data/visuals.js` (one unique `silhouette` model key
per class + design notes), `index.html` (loads `src/ships.js` after weapons.js — it reads
`PULSAR.weaponHue` + `classVisuals` at draw time).

**New config:** none — visual constants live in the models (visuals aren't gameplay tuning).

**How to test:** open `index.html`, play; evolve through each family (dev panel +1 LVL) and watch
the functional cues: rail capacitor rings while holding fire, ram face heat during windup, grav
core brighten as rocks load, flail drum spokes spinning with the orb. Verified headlessly:
all-17-model gallery screenshot (no draw errors, mid-charge/windup/loaded states) + live game
runs 59fps with bots.

**Known limits / TODO hooks:** remote MP ships render fully (all cue fields are in the net
snapshot). Skin accent is still just a ring; per-model accent recolor would be a cheap cosmetic
upgrade.

**Follow-up (same day):** evolve overlay now previews the hull models + spawns randomized to
the edge band.
- *Evolve previews:* choice buttons grew to 62px with a live `PULSAR.Ships.draw` render on the
  left (idling model — drums spin, cores pulse; clipped to its slot so rail barrels don't spill
  into the text; dimmed when unaffordable). `src/game.js drawEvolveOverlay`.
- *Edge spawns:* fixed player spawn + anywhere-bot-spawn replaced by `edgeSpawn()` — random side,
  random position along it, at a depth between `arena.spawnEdgeInset` (new config, 250) and the
  existing `arena.edgeSafeMargin` (800). Every fresh life starts in the calm outer asteroid band
  for farming, never at the pulsar brawl. Applies to initial spawn, player respawn, bot spawns.
- *Thrown rocks stay rocks:* gravitor-launched rocks were rendered as generic circle bullets in
  flight. Now `drawThrownRock()` (game.js) draws them with their real neutral-object silhouette
  (`ROCK_PATH[rockType]`), tumbling (visual-only `spin` phase set in `launchRock`), with the
  well's purple rim + existing glow. MP: `rockType` now rides the proj message (`rt`) so remote
  ghosts keep their shape too (`net.js`).
- *Gravitor vs melee rebalance:* removed the well's high-momentum disruption (extra pull +
  momentum damping + slow on chargers) — it let a gravitor keep a Hammerhead away FOREVER.
  Replaced with **orbit contact damage**: touching an orbiting rock deals the same damage that
  rock would as a projectile (`well.launchDamage`, incl. the Meteorist/Starfall momentumStrike
  bonus), knocks back, and SHATTERS the rock. New config `gravitor.orbitContact`
  { knockback, rehitSec } — rehit grace means a dive costs ~1-2 rocks of HP, not the whole ring
  in one frame. A committed rusher now gets through, paying HP; the gravitor spends its ammo
  defending. Config keys `well.highMomentumPullMult/Damping/Slow` deleted (dead).
  Unit-tested in node with a stubbed api (damage value, rock consumption, rehit grace, range,
  meteorist bonus). `src/weapons.js gravityWell.update`, `data/config.js`.
- *Human-like bot aim (no more offscreen aimbot):* bots now track a periodically-refreshed
  SNAPSHOT of their target instead of its live position (`perceive()` — refresh every
  `bots.reactionSec ÷ skill`, aim error rolled per-glimpse and growing with range), swivel their
  aim at a capped rate like a mouse hand (`swivel()`, `bots.aimTurnRadPerSec`), hold fire for
  `bots.acquireSec` when they pick up a fresh target, and never open fire beyond
  `bots.fireRange[family]` (~a screen — you always see who is shooting you). Each bot rolls a
  `skill` (skillMin..skillMax) once, scaling reaction/error/swivel, so the lobby feels like a
  spread of players. `engageRange` 880→700. Unit-tested in node (no flicks, stale tracking,
  range gate, acquire pause, swivel convergence). `src/bots.js`, `data/config.js`.
- *Inertia:* movement is now acceleration-based instead of velocity-set. Thrust steers velocity
  toward the input direction at `player.inertia.accelPerSec` (7.5 → ~0.4s to full speed);
  releasing coasts with `coastDampPerSec` (3.2 → ~0.2s velocity half-life, ~1s of visible
  drift). Changed in BOTH `game.js simShip` and the authoritative `sim.js simShip` (same lines,
  determinism boundary intact). Knockback/dash impulses (`impX/impY`) and the hammer lunge are
  untouched — they were already momentum-based. Side effects that now feel right for free:
  engine flares show drift (they read real vx/vy), Hammerhead momentum damage includes coast
  speed, and bots inherit the same physics.
- *FIX — flail-orb instakill with multiple flailships:* the orb's hit gates lived ON THE TARGET
  (`t._orbGen`, `t._orbHit`) and were shared by every flailship. Two overlapping orbs alternately
  reset each other's gate, so a target inside two orbs took damage nearly EVERY TICK — with bots
  on (≈2 flail bots farming the same dense edge band) asteroids and players melted instantly.
  (Reported as "gravity crush"; the special was innocent.) Gates now live on the ATTACKER:
  `ship.orbPassHits` (Set, cleared per out/back pass) + `ship.orbTouch` (Map target→time for the
  orbit tick gate, pruned past 48 entries). Dead fields `_orbHit`/`orbHitGen` removed from object/
  ship factories in game.js + sim.js. Regression-tested in node: 2 ships parked on one target for
  2s = 12 orbit hits (was ~240); 2 full throw cycles through a target = exactly 4 hits (out+back
  × 2 ships). `src/weapons.js wreckingOrb`.
- *Physics: cruise (sustained acceleration):* hold one heading and the engines keep spooling —
  speed ramps from base toward `base × cruise.maxMult` (1.4) over `rampSec` (2.4s). Swinging the
  input past ~53° (`alignDot` 0.6) dumps the bonus instantly, so top speed is a commitment;
   8-way diagonal adjustments (45°) keep it. Coasting decays it. New `player.cruise` config;
  same code in `game.js` + `sim.js` simShip. Verified in the headless sim world: 392 px/s after
  3s straight (exactly the cap), 0 after a 90° turn.
- *Railship afterburner [Shift]:* rail-family escape burn — instant impulse kick (260) along the
  move direction (or backward off aim if standing still), then 0.9s of ×1.9 speed with ×2.2
  acceleration; costs +30 heat (dumps it INTO the gun — escape now or shoot now, pick one) on a
  5s cooldown. New `railship.afterburner` config; Shift edge in playerStep; rail HUD hint shows
  ready/cooldown; cyan flare bloom + trail particles; rail BOTS burn when fleeing. Verified
  headless-sim: +30 heat, 576 px/s mid-burn, hammerhead ignores the intent.
- *FIX — NaN cascade with bots on (invisible constant damage, immortal ships, endless shake):*
  the ship factories in game.js/sim.js pre-created `bot.ai` with the OLD field shape, so the new
  bots.js `bot.ai || (...)` init never ran → `ai.skill` undefined → aim error NaN → `intent.aim`
  NaN → ship aim/velocity/orb position all NaN. A NaN-positioned flail orb passes NO distance
  check ("> r² is false"), so it hit EVERY hittable on the map each gate window — the invisible
  constant damage + permanent screen shake — while NaN hp made ships unkillable ("immortal
  flailship"). Fix: bots.js owns the ai shape and re-inits if missing OR stale
  (`bot.ai.skill == null`); both factories now set `ai: null`. LESSON: lazy `x || (x = init)`
  breaks silently when another module pre-creates a stale `x` — keep single ownership.
  Verified: 2 sim-minutes × 6 bots = 0 unexplained player-damage events, 0 non-finite fields,
  bots evolve and die normally.
- *RAIL BRANCH REDESIGN (user direction: tier-2s weren't novel enough):* Lancer is RETIRED;
  the railship now branches at lvl 8 into two genuinely different weapons:
  - **Helion** (branch A, new class + `helionBeam` weapon + `config.helion`): continuous beam
    whose damage RAMPS 24→82 dps over 2.6s on-trigger; heat cost accelerates with the ramp
    (net −10/s at ramp 0, +24/s at full — ~5.8s of sustained beam force-vents). Fully-ramped
    beam applies Armor Crack. Reuses the rail chassis systems (charge bar = ramp, charge
    move-slow, vents, afterburner). Model: short barrel into a focusing LENS RING that glows
    white-hot with ramp.
  - **Star Piercer** (moved tier 3→2, reworked: `mawRail` weapon + `railship.mawRail` config):
    siege railgun. 1.9s charge OPENS the maw — jaw gape == beam half-width (10→34px with
    charge); release fires ONE sustained steerable wide beam for 0.85s ticking 55→170 dps
    (Last-Prism-style burst), then a 1.5s recycle + heat. Redline/blowout rules still apply at
    full hold. NO charge-lance telegraph — the tells are the essence intake (existing rail
    charging FX) + the visibly opening maw + condensing core (new in ships.js `mawOpen`).
  - Both weapons share a new `beamHits()` corridor helper; beam visuals use throttled
    `fx.spawnBeam` (every 2nd tick, 0.1s life) so they read continuous AND relay to MP at 30/s.
  - Tier-3 finals for both branches are TODO (childrenOf returns none at lvl 15).
  - Touched: classes.js, config.js (helion block, mawRail block, evolveMods emptied),
    weapons.js, ships.js (helion model, mawOpen prongs, noLance), visuals.js, bots.js
    (per-class rail firing), game.js+sim.js (IMPLEMENTED/FAMILY/blurbs/resetClassState).
  - Verified headless: dps ramp 18→76/s, force-vent at 5.8s, maw width 34 at full charge,
    full beam ≈148 dmg (theory 145), recycle blocks refire, 5-min mixed-bot lobby with both
    classes = zero non-finite state; model gallery renders idle/30/70/100%/firing states.
- *Render ceiling:* `sim.maxRenderFps: 360` — frame() now skips paints past the cap (0.5ms
  epsilon so displays AT the cap aren't half-skipped by timer jitter). Sim ticks are
  untouched (fixed-timestep loop runs before the gate); fps counter now counts RENDERED
  frames. rAF is vsync-bound, so this only bites on 360Hz+ displays.
- *TITAN ASTEROIDS — landmark obstacles (user direction):* new neutral type `titan`:
  r170 (≈10× a ship), 9000hp (idealized max-DPS kill ≈ 1.6min; real ships with vent/recycle
  downtime = several minutes), payout `scrapPerTitan` 950 ≈ LEVEL 15 IN ONE KILL, delivered
  as a wide 48-mote fountain with 30s life (the jackpot survives your approach). 7 spawn per
  world, CENTER-BIASED placement (rejection sampling, `titans.centerBias`; median distance
  from center 1565 vs 1963 pre-fix — the fix: accept prob is (1-d/half)^bias, NOT ^(1/bias)),
  ≥900px separation, clear of the pulsar core, 5-min respawn on their own clock. They are
  terrain: immovable (no knockback, no contact shove), can't be gravity-captured, block
  beams/rocks by being hittable, bots ignore them when farming, and they show as gray
  landmark dots on the minimap. Render: craggy 14-vert silhouette + craters + ridge line
  (game.js `titanPath`). Config in `farming.titans` + titanHP/titanRadius/scrapPerTitan/
  motesPerObject.titan/contactDamage.titan (14 — ramming a mountain hurts). Verified
  headless: 7 spawn, min separation 1179, immovable under sustained fire, kill+collect =
  950 scrap in one run. KNOWN LIMIT: a titan counts toward rail LINE BREAK pierce counts
  (it's a neutral hit) — minor free bonus when shooting through rocks into a titan.
- *GRAVITOR anti-sitting-duck (user: "relying on asteroids is inherently sucky"):* the identity
  stays (terrain = ammo) but the well now guarantees a FLOOR. (1) **Dust Accretion**
  (`gravitor.accretion`): when below capacity with NOTHING capturable inside pullRadius, the
  well condenses a pebble every 3.2s (max 2 held). Pebbles are visually small (violet-grey),
  hit for ×0.55 on both throws AND orbit-contact — real rocks stay strictly better, so
  terrain still matters; you are just never disarmed. (2) **Shatter Recycling**
  (`gravitor.recycle`): a thrown non-pebble rock that dies leaves a real capturable debris
  fragment 50% of the time (radius ×0.6) — volleys reseed the battlefield for everyone.
  Guards: fragments only spawn under `maxWorldObjects` (380) AND carry `recycled: true` so
  breakObject skips the respawn schedule for them (without both, world object count crept
  320→464/5min; with them it is bounded at 368/6min). Also hardened `OBJDEF[rockType].hue`
  lookups against unknown types. Verified headless: 2 pebbles accrete in 7.5s of empty space,
  pebble throw = exactly 13.2 dmg, pebble orbit-contact scaled, 9 fragments from 30 expired
  throws, zero non-finite in a 6-min lobby. CLASSES.md updated.
- *FLAIL TREE REBUILT — Twinmaul (user direction):* chainmaul/ironmoon/graviflail/orbitCrusher
  are REMOVED (nodes, configs `orbModByClass`/`chainmaul`/`powerSwing`/`moonSlam`/`orbitLock`/
  `gravityCrush`, abilities/specials, ship models, visuals rows, blurbs, dead ship fields).
  One lvl-8 upgrade: **Twinmaul** — TWO maces on two chains. `wreckingOrb` generalized to an
  N-head state machine (`ship.maces[]`, per-head trail/spin/windup/out/back + per-head
  attacker-side hit gates; shared spin momentum; heads spin 180° apart). Release modes:
  **LMB** = natural hammer-throw windup — opposite phases cross the aim line ~250ms apart, a
  rapid one-two volley for free; **RMB (new input: `Input.altFiring`, `intent.altFire`,
  threaded through both simShip weapon ctxs)** = forced synchronized windup
  (`twin.syncWindupSec`) — both release within 0ms. Per-head dmg ×`twin.dmgMult` (0.8).
  Special [E] **Static Lash** (`staticLash` config): stun pulse of `radius` 150 around EACH
  mace head — hard-stun 0.7s (new `stunTimer`: simShip freezes intent in BOTH sims), wipes
  charge-ups (rail charge, ram windup, beam ramp, spin momentum), locks ability+special 2s,
  10 dmg, 9s cd. Render: per-head chains/spiked heads (remote MP ships sync a second head via
  `ox2/oy2`); twinmaul model = doubled counter-rotating winch drums. Verified headless: 2
  heads trail behind, 180° spin phase, LMB stagger 250ms, RMB gap 0ms, lash stuns+scrambles a
  0.63-charge rail (charge→0, abilityCd→2s, frozen 0.5s), 5-min mixed lobby zero non-finite,
  duels: twinmaul>flailship 3-1, 7-5 vs maulbreaker. Tier-3 final: TODO.
- *Playtest round 2 (post-redesigns) + two bot fixes:* FFA 3×6min: rail K/D 2.50 (peak Lv29),
  hammer 2.13 (xp king), gravitor 0.52, flail 0.45 (38 deaths, capped Lv17). Tier-1 duels:
  rail unbeaten (16-0 grav, 15-0 flail); the mace rework fixed flail 1v1s (12-4 vs hammer,
  11-5 vs grav). Tier-2 grid: helion 5-5 starPiercer (balanced pair) but both stomp every
  non-rail tier-2 ~10-0; singularity 10-0 vs both flail-2s; graviflail = worst class in the
  game (1 win / 50 bouts). Farm/2min: gravitor 441, helion 379, flail 300, chainmaul 266,
  graviflail 256, rail 141, starPiercer 104, hammer 17. BOT FIXES: (1) `REACH_CLASS`
  per-class farm-approach override — helion parked at the rail family's 770px approach with
  a 680px beam and farmed literally 1 scrap/2min (now 379); (2) starPiercer farmed at 700px
  and never collected the MOTES its blasts dropped (motes only vacuum to nearby ships) —
  approach 520 (now 104). Conclusions logged in session notes: rail family overtuned across
  the board; hammer still can't farm; flail fine 1v1 but dies in crowds + hard-countered
  0-15 by rail + its tier-2s are stat-mods with no identity.
- *Hammer windup telegraph — fold-out boost jets (visual only, mechanics unchanged):* during
  ram windup, lateral booster pods hinge outward from the flanks (deploy angle scales with
  ramCharge) and their burn shifts yellow → deep red with charge, staying splayed + blazing
  through the lunge. Drawn under the hull so pods emerge from beneath it; flame length,
  alpha, and hinge angle all keyed to the same charge value the telegraph ring uses.
  All hammer-family models get it (shared `hammerBody`). The old orange telegraph RING at the
  ram face is REMOVED — the jets + the molten ram edge are the windup read now (still two
  charge-scaled tells, so counterplay keeps its warning). `src/ships.js`. Verified via
  state-gallery screenshot at 0/30/70/100%/lunge.
- *FLAIL REDESIGN — Momentum Mace (user direction):* the Commanded Chain Orb cycle is replaced.
  New states in `wreckingOrb`: **trail** (rest: spiked mace drags behind the hull on a slack
  chain — light contact damage), **spin** (hold fire: radial momentum ramps 0→1 over
  `spinUpSec` 2.1s; swing speed 3→11.5 rad/s and contact damage 9→30 scale with it),
  **out/back** (release: FLING at the cursor — cast speed 520→1800 px/s AND damage 20→88
  scale with banked momentum; same 340 maxReach; return sweep hits for 55%). Old
  orbit/throw-cooldown keys deleted from `flailship.orb`; new momentum keys added. Ability
  compat: swingControl burst = faster spin-up; powerSwing multiplies swing/fling damage;
  Orbit Lock = sustains the spin hands-free (+wider circle). Mace head is now SPIKED
  (7 spikes, tumbling with own rotation) and burns brighter with momentum (game.js flail
  extras). Bots wind up while closing and release at >85% momentum in reach; the fire-range
  gate lets flail (like grav) keep spinning beyond shot range. Verified headless-sim: trail
  rests behind hull, momentum 0.48@1s / 1.0@2.1s, full fling = 111 dmg @ exactly 340 reach,
  tap fling = 12 dmg; posed-remote screenshot shows trail + full-spin renders. CLASSES.md
  updated. *Follow-up:* release no longer snaps the head to the aim line — new `windup` state
  (hammer-throw): the mace keeps swinging in its spin direction (min `releaseSweepRadPerSec`
  13) until it CROSSES the cursor line, then lets go. Verified: worst case (mace behind, aim
  ahead) max per-tick head movement is 30px — smooth arc, no 148px teleport.
  *Follow-up 3 — flight trail:* the thrown mace now sheds a dissolving wake (1 particle/tick
  through out+back via fx.spawnParticles; life & size scale with flingPower — hotter throws
  burn a longer, brighter trail; fades by particle lifetime).
- *STAR PIERCER re-rework (user: Helion was getting mogged; SP should be ONE quick, far more
  powerful, uncorrectable beam):* the 0.85s sustained/steerable beam is gone. `mawRail` now
  fires ONE instantaneous hitscan blast the frame you release — direction locked at that
  instant, not steerable after; the lingering flash is render-only (`beamVisualSec` 0.22).
  Damage 40→120 by charge (deliberately just UNDER a tier-2 rail's ~133hp — devastating,
  never a full-HP one-shot; the original 140 one-shot Helions and went 22-2 in duels),
  range 980→900, recycle 1.4s, recoil scales with charge, keeps pierce-6/falloff/crack and
  gains LINE BREAK on 3+ neutrals. Helion range 640→680. Duel ladder while tuning:
  140dmg = 2-22 (SP one-shots) → 120dmg/1.8s = 20-4 (over-corrected) → 120dmg/1.4s = 16-8
  helion in BOT duels — accepted, since bots cannot flick-aim and systematically undervalue
  instant hitscan; expect ~even in human hands. Verified: full blast = exactly 140 (pre-nerf
  math check) in the release tick, 0 damage after, aim-flick post-release hits nothing.
  *Follow-up 2 — real mace flight physics:* the fling is now an outward SPIRAL, not a straight
  ray. The head conserves angular momentum in flight (ω(r) = w0·(r0/r)², chain paying out at
  constant v, midpoint-integrated), and release happens dPhi = w0·r0·(R−r0)/(v·R) BEFORE the
  aim line so the spiral lands exactly on the cursor at full reach (sub-tick snap at the
  release point). Verified at 3 momentum levels: 30-51px of visible arc, lands within 0.3° of
  the cursor, motion stays ≤33px/tick. NOTE: tier-2/3 flail upgrades still ride the same weapon via orbModByClass —
  bespoke upgrade mechanics are the next content slot (ideas pitched to the user).
- *Verified headlessly:* screenshot shows the LV-3 evolve panel with all four family previews
  rendering, players/bots spawning on the map rim (minimap), and in-flight asteroid/crystal/
  debris keeping their silhouettes (ghost-injection harness). NOTE for future headless testing:
  in Chrome `--screenshot --virtual-time-budget` mode, synthetic KeyboardEvent/MouseEvent
  dispatch does NOT reach listeners and timers fast-forward out of sync with the rAF-driven sim —
  stub `PULSAR.Input.key` (deriving state from query count) instead of dispatching events.

---

## 2026-07-02 — Phase 6 Step 1: meta currency + persistence + cosmetic unlocks
**What changed:** First slice of Phase 6 (meta & persistence). Complete loop, options-only, no power
creep. Verified headlessly with a localStorage shim (bank → too-poor → buy → equip → persists).

- **`src/profile.js`** — `PULSAR.Profile`: localStorage-backed profile (name, cores, unlocked/equipped
  skins, lifetime stats: runs/bestScrap/totalCores). Node-safe (in-memory fallback) so meta logic is
  testable. Methods: `bankRun(earnedScrap, bestScrap)`, `unlock(id, cost)`, `equip(id)`, `setName`.
- **End-of-life cores:** `killShip` — when the player dies, `bankRun(p.xp, carried)` converts a share
  of the run's EARNED scrap (`config.meta.coreRate` 0.10) into permanent cores + a `+N ◆ CORES` popup.
- **`data/cosmetics.js`** — 7 accent skins (40–360 cores). Purely decorative: a cosmetic accent RING
  around your hull (`drawShip`), does NOT touch class hue or the white "you" core (readability intact).
- **Shop UI (`index.html` title screen):** core balance + swatch grid; click to buy (if affordable) +
  equip; equipped highlighted. Name now stored via Profile. HUD shows `◆ cores` next to scrap.

**New config:** `meta.coreRate: 0.10`.
**Files:** `data/config.js`, `data/cosmetics.js` (new), `src/profile.js` (new), `src/game.js`, `index.html`.
**How to test:** reload. Title → buy/equip a skin (start with 0 cores; die a few runs to earn). Accent
ring shows on your ship; balance persists across sessions.
**Deferred (next Phase 6 steps):** upgrade-card system (power-sensitive — design the data + shared-
ceiling constraint carefully); syncing equipped skin to other players in MP (skin is local-only now);
unlockable classes (all classes currently always available — keep cosmetics-only for now).

---

## 2026-07-01 — MP lobby polish: title screen, killfeed, class minimap, bots-in-MP, held-rock shapes
**What changed (all client-side, live relay game):**
- **Bots in multiplayer:** bots now stay as filler in MP and only clear once the lobby exceeds 10
  real players (`1 + Net.count > 10`); they respawn if it drops back under. (Relay caveat: bots run
  per-client, not synced — real players are synced, bots are local filler.)
- **Title screen (`index.html`):** neon PULSAR.io logo + name input (remembered via localStorage) +
  PLAY. Game runs idle+invulnerable behind it until PLAY. `PULSAR.startGame(name)` sets `p.name`,
  flips `gameStarted`, gives spawn protection. Name typing is `stopPropagation`'d so it doesn't drive
  the ship. `gameStarted` gates `playerStep` + `damageShip(p)`.
- **Killfeed:** top-right `Killer ⚔ Victim` (gold if leader, `☠` self-wreck), fades after 6s. Fed by
  local `killShip`, plus MP player-kills via the relay (`sendKill` now carries victim name; `onKill`
  posts it; death-by-player looks up the killer via `Net.nameOf`).
- **Minimap shows classes:** ships are class-COLOURED arrows pointing at their aim (you = cyan+ring,
  leader = gold rim) instead of uniform dots; iterates `allShips()` so remotes show too.
- **Nametags:** player names render above ships + in the leaderboard (`nameOf`).
- **Held gravitor rocks keep their real shape:** drawn with `asteroidPath`/`crystalPath`/`debrisPath`
  (tumbling, purple well halo) instead of plain circles. `ROCK_PATH`/`ROCK_FILL` maps by type.
- **Net (`net.js`):** snapshot carries `nm` (name); remotes get `.name`; `sendKill(id,bounty,victim)`
  + `nameOf(id)` lookup.

**Files:** `src/game.js`, `src/net.js`, `index.html`.
**How to test:** reload (no-cache on). Title → name → PLAY. Minimap arrows coloured by class; killfeed
on kills; Gravitor-held rocks look like real asteroids/crystals/debris. In MP, bots persist up to 10 players.
**Known limits:** killfeed of remote-vs-remote kills isn't relayed (only kills involving you); bots
unsynced in MP. Phase 5 Step 2 (authoritative thin client on sim.js/mpserver.js) still pending.

---

## 2026-06-30 — Balance: counterplay vs Hammerhead, wider rail beam, ram cooldown + body-check
**What changed:** Hammerhead was the only class with real agency (~50% of kills in headless matches).
Patch philosophy: bring others UP with matchup-specific counterplay, NOT global stat inflation, and
add pacing/identity to Hammerhead rather than gutting it. All values configurable; applied to BOTH
`game.js` (live) and `sim.js` (Phase 5) so they don't drift.

**Shared concept — high-momentum targets (`api.isHighMomentum`):** true if a ship is ramming OR its
intent+impulse velocity ≥ `combat.highMomentumSpeed` (430; walk is 280). Drives all anti-charge tools;
nothing hardcoded to Hammerhead.

**Railship (survive/punish the charge):**
- IMPULSE BREAK — full/overcharge beam on a high-momentum target cuts its momentum (impX/impY ×0.45,
  ×0.25 overcharge), slows re-accel, and CANCELS the ram/charge state. (`railship.impulseBreak`)
- VENT DASH — preserves 60% of charge (was a flat −0.25), +20% distance (dashSpeed 820→984), +0.4s
  faster-recharge after. (`railship.ventDash`)
- LINE BREAK now also vents 20 heat + scales the bonus with objects broken.
- Beam WIDER: `beam.halfWidth` 9→14; Lancer/Star Piercer width mults 0.70→0.82 / 0.60→0.72 so the
  precision branches stay hittable (player feedback: "can't hit any shots").

**Gravitor (disrupt the charge path):**
- WELL DISRUPTION — every gravitor's well adds extra inward pull + momentum damping + brief slow to
  high-momentum targets (straight charges bend/stall). (`gravitor.well.highMomentum*`)
- ORBITAL SHIELD — spends one orbiting rock to soak a heavy/charged hit (−55%). (`gravitor.orbitalShield`)

**Flailship (parry the ram):**
- ORB PARRY — orb positioned near a charging attacker softens the ram (−55%) + bleeds attacker
  momentum (×0.4) + slows + cancels their lunge. (`flailship.orbParry`)
- Recall speed 1250→1500 (+20%).

**Hammerhead (pacing + identity, per request):**
- DASH COOLDOWN — after a lunge, `ramCd` = active phase + `lunge.cooldownSec` (1.2s); winding gated
  until it clears → no ram-spam. (Fixed a guard bug: uninitialized `ramCd` read as on-cooldown.)
- BODY-CHECK — between dashes the hull bashes enemies on contact for `bodyCheck.damage` (12) on a
  0.6s gate, so it still threatens off-cooldown. (`hammerhead.bodyCheck`)

**Infra:** `server.js` + `mpserver.js` now send `Cache-Control: no-cache` — browsers were serving
stale JS, which had hidden several patches (the cooldown "not working" was really a cached old file).

**Playtest (headless, 4×3-min, 8 bots):** Hammer kill-share ~50% → 31%. Grav rose to ~34% (Orbital
Shield + well damping are automatic, so bots benefit; watch for over-tuning). Rail/Flail still low in
BOT data (18/17%) by design — their counterplay is skill-expressed; judge from human play.

**How to test:** hard-refresh once (⌘+Shift+R) after the cache fix. Rail full-charge stops a ram;
Vent-dash keeps charge. Gravitor with rocks tanks a ram (one pops). Flail orb between you+charger
parries. Hammerhead can't re-dash for ~1.6s but body-checks for 12 on contact.

**Known risks / next:** Gravitor may be slightly strong (auto shield); human-test the skill-based
rail/flail tools; then consider non-minimal spec items (Impact Counter, Crushing Return, Broken Core
upgrade). Verified each mechanic + the matchups headlessly via sim.js.

---

## 2026-06-27 — Flail/rail/gravitor feel, multiplayer (relay), Phase 5 Step 1 (sim split)
**What changed:** Big session. Class-feel polish, then online multiplayer (a quick relay), then the
start of authoritative Phase 5 (headless sim extraction) — done STAGED to keep a working build.

**Flailship — Commanded Chain Orb (`weapons.js` `wreckingOrb`, `config.flailship.orb`):** replaced
the passive orbit with a 3-state weapon. ORBIT (rest): defensive shield, low damage, blocks enemy
projectiles it touches (`orbActive`/`orbBlockRadius`, intercepted in `simulateProjectiles`). THROW:
fire shoots the orb out to FULL `maxReach` along aim, hangs briefly (`apexHangSec`), AUTO-returns —
can't be held out. Per-pass hit gating (`orbHitGen`) so a target takes the out-hit AND the return
sweep. `throwCooldownSec` 1.4s, `throwDamage` 72 / `recallDamage` 44. Orbit Lock pins it to a wide
orbit. Ironmoon ability/special un-duplicated: Space=powerSwing, E=moonSlam.

**Railship:** beam `halfWidth` 7→9 (honest hitbox = wider). Hold at full charge → core redlines
(gold→red over `overheatSec` 8s) then OVERHEATS: dumps charge, maxes heat, vents (`overheatVentSec`).
Charge intake animation stops at full. Beams render extra bloom by charge stage (`fx.spawnBeam` power
arg). Energy-intake charge animation added in `drawClassExtras`.

**Gravitor rocks:** held rocks ride at full ASTEROID size and are "transparent" (not in world →
can't be destroyed, don't block). Launched rocks keep real radius + are DESTRUCTIBLE in flight
(`isThrownRock`, HP = `thrownRockHpMult` 2.5× normal, in `hittables` for enemies, shatter on
death/miss). Durability pass earlier: `baseHP` 100→130, hammerhead 1.15→1.50.

**Dev panel (`game.js` `drawDevPanel`):** top-right ADMIN button became a panel with a BOTS: ON/OFF
toggle (`spawnBots`/`toggleBots`); hidden in MP.

**Multiplayer — relay (LIVE, playable): `server.js` (zero-dep HTTP+WS), `src/net.js`.** Client-
authoritative LAN/online PvP: 20Hz ship snapshots, beams + projectiles relayed as ghosts, damage as
routed 'hit' events, kill attribution + bounty. Bots clear on connect. `game.js` hooks: `allShips()`
includes `Net.remotes`, `damageShip` routes remote hits, `tickTimers` skips remotes, HUD MP line.
Host: `node server.js`; same-WiFi friend → `http://<LAN-ip>:8080`; internet → `cloudflared tunnel
--url http://localhost:8080`.

**Phase 5 Step 1 — authoritative split (NEW, verified headlessly, NOT yet wired to client):**
- `src/sim.js` — the ENTIRE simulation as `PULSAR.createWorld({ fx })`: headless, no DOM/render/input,
  FX injected, no "local player" (ships driven by set intents). Faithful extraction of game.js's sim.
- `mpserver.js` — zero-dep AUTHORITATIVE server: runs sim.js at 30Hz, owns the world, broadcasts 20Hz
  snapshots (ships/projectiles/motes/fx-events; objects throttled every 10th). Clients send only intent.
- Verified in Node: world spawns/moves/fires/damages/farms/evolves/respawns; server end-to-end (client
  intent → server sim → snapshot moved the ship). `index.html` does NOT load sim.js, so the live
  SP/relay game is untouched.

**How to test:** SP/relay unchanged — open `index.html` or `node server.js`. Phase 5 server:
`node mpserver.js` (client renderer is Step 2).

**Known limits / TODO — Phase 5 Step 2 (next):** make `game.js` a thin client when connected to
mpserver — send intent, render snapshots w/ interpolation, replay fx events, derive own screen-shake;
SP also runs sim.js (one code path); retire the relay (`server.js`/`net.js`). Co-dependent with a live
server → must be tested in-browser (two tabs). Relay limits remain meanwhile: cheatable, asteroids
local per client.

---

## 2026-06-27 — Phase 4 feel pass: specials wired, controls, regen, durability, render perf
**What changed:** Tuning/feel session on the Phase 4 build (still the prove-it gate — no netcode).
Closed gaps that made the game read as unfinished and fixed the Chrome framerate.

**Finals' specials — the 4 missing ones now fire (`src/weapons.js`):** `brokenCore` (Star Piercer:
mark first enemy in aim-line with a weak point), `worldsplitterSlam` (Worldsplitter: on-demand
shockwave burst, no full ram needed), `meteorVolley` (Starfall: dump all held rocks in a fan),
`moonSlam` (Ironmoon: orb slam on its own cooldown). Previously these keys resolved to the no-op
special stub, so right-click did nothing for those classes. `collapse`/`gravityCrush` already worked.

**Controls (`src/input.js`, `src/game.js`):**
- Special moved off right-click to the **E key** (RMB tracking + `contextmenu` plumbing removed).
- **Gravitor pulling is now passive** — the well auto-pulls whenever under cap (removed the
  `!ctx.firing` gate in `gravityWell.update`); there's no game state where a gravitor doesn't want
  rocks. Left-click edge = launch (the ability slot, gravitor-only remap in `playerStep`). HUD/blurbs
  updated; bot intent unaffected (their `firing`/`ability` flags still drive the same behaviours).

**Passive regen (`config.player.regen`, `tickTimers`/`simShip`):** `combatTimer` resets to
`regen.delaySec` (5s) on any firing/ability/special intent; once it drains, heal `regen.perSec`
(18/s, flat). Applies to player AND bots via the shared sim. Gravitor passive-pull alone doesn't
reset it (not an intent slot), so idle-farming a gravitor still regens.

**Durability bump (`data/config.js`):** `baseHP` 100→130 (global +30%); `hammerhead.stats.hp`
1.15→1.50 so the dive-in bruiser lineage is notably tankier (Worldsplitter 161→273 effective).
`tierGrowth` already makes finals tankiest within a family, so "extensions get the most" falls out.

**Bots turned up (`config.bots`):** `aggression` .65→.88, `engageRange` 680→880, `senseRange`
950→1150, `fleeHpFraction` .30→.20, `aimErrorRad` .10→.07, `decisionSec` .30→.25. Addresses the
farm-heavy (1 kill/25s) note from the last session — left non-zero aim error + a flee threshold so
they're beatable, not aimbots.

**Render perf — Chrome 30→60fps (`src/render.js`):** `glow()` was calling `createRadialGradient`
+ fill PER glow PER frame (50–150/frame), which Chrome rasterizes on the CPU far slower than
Firefox — that was the 30-vs-60 split. Now bakes one glow sprite per colour into an offscreen
canvas once, then `drawImage`s it (GPU, cheap). `globalAlpha=intensity` makes it pixel-identical to
the old gradient. Cache is bounded (~20 colours).

**New config:** `player.regen {delaySec, perSec}`; changed `player.baseHP`, `hammerhead.stats.hp`,
and the `bots` block (see above).

**How to test:** open `index.html`. Evolve to each final (ADMIN +1 LVL [L] to rush levels) and
press **E** — every final now has a working special. Gravitor: rocks auto-pull, left-click launches.
Stop shooting ~5s and watch HP refill. Confirm Chrome holds 60fps (top-left counter). Bots should
contest and kill noticeably more.

**Known limits / TODO hooks:** the 4 new specials fire for the PLAYER only — bot intent
(`fightFire` in `bots.js`) still only triggers `collapse`/`gravityCrush`; wire the rest if bots on
those finals should use them. "Genuinely fun" sign-off is still a human playtest call (the Phase 4
gate). Balance triangle + regen rate + durability are all first-pass dials.

---

## 2026-06-27 — Phase 4: Second branches + BOTS (the prove-it gate)
**What changed:** The game is a match now. Player and bots are the **same `ship` entity**, driven
by an INTENT ({moveX,moveY,aim,firing,ability,special}) through the **same data weapons** — so
combat is symmetric and bots are first-class. Free-for-all; everything that shoots can hit
everything else.

**Combat foundation (the big refactor):**
- Generalized the player into `makeShip()` (player = team 0; N bots = unique teams). `state.bots`,
  `allShips()`, `enemiesOf(ship)`.
- Unified damage: `api.damage(target,…)` dispatches to `damageObject` (rocks) or `damageShip`
  (ships) over `api.hittables(ship)` = neutrals + enemy ships. Weapons now hit ships: rail beam
  pierces ships (uses `pierceFalloff.players`), ram/orb/shockwave/thrown-rock all land on ships,
  projectiles carry `team`. Ships can be Armor-Cracked.
- Ship death → drop ½ carried as motes → **killer collects `killScrapFraction`** (×`bountyScrapMultiplier`
  if victim was the leader) → respawn (player at base, bots at random). Motes are vacuumed by ANY ship.
- Per-ship sim split into `simShip(ship, dt, intent)` (movement/ability/special/weapon/contact) +
  `tickTimers`. Player builds intent from input; bots from AI. (This is the clean input boundary we
  deferred — it arrived naturally with bots; Phase 5 still owns the render/server split.)

**Bots (`src/bots.js`):** `PULSAR.Bots.intent(bot, world, dt)` — farm nearest rock / hunt+kite at a
family-specific preferred range / flee at low HP / drift to the pulsar; dodge a detected charge or
lunge aimed at them; per-family fire logic (rail charges-then-releases, hammer winds-then-lunges,
gravitor pulls-then-hurls, flail extends orb). Bots earn, level, and **auto-evolve** down a random
branch. All knobs in `config.bots` (count, aggression, ranges, aim error, dodge chance).

**Second branches + finals' specials (right-click):**
- **Gravitor→Singularity→Event Horizon** — `tidalDrag` passive: the well now SLOWS + drags enemy
  ships inside it; **Collapse** special implodes the well (yank + damage scaled by held rocks).
- **Flailship→Graviflail→Orbit Crusher** — **Orbit Lock** ability (wide fast defensive orbit);
  **Gravity Crush** special (AoE damage + slow burst). `orbModByClass` drives per-class orb reach/damage.
- Both second branches added to `IMPLEMENTED`, so the level-8 EVOLVE overlay now offers a **real
  branch choice** (e.g. Gravitor → Meteorist *or* Singularity), each with a one-line blurb. New
  right-click **special** input (`Input.special`); `resolveSpecial()` registry.

**Leader/bounty (multi-ship):** the global leader = top-scrap alive ship (crown + minimap gold +
double bounty when killed). Level-25 "scaling" (bigger hitbox + HP) is separate (`s.scaled`).
HUD gained a **leaderboard** (top 4 by scrap), your kill count, enemy HP bars, and a special-cooldown line.

**How to test:** open **http://localhost:8080/** (hard-reload). You now spawn into a 6-bot
free-for-all. Farm up, evolve, and actually fight — bots shoot back, kite, dodge your charge, and
chase the leader for the bounty. Try Gravitor's branch fork at LV8 (Meteorist artillery vs
Singularity drag-control), and a final's right-click special. Headless match test (25s of bot-vs-bot)
passes 10 checks: combat damage, kills, deaths, leveling, leader crown, branch-B reachable, both
specials + the rail beam damage enemy ships, no exceptions.

**Known limits / TODO hooks (this is the gate — needs YOUR playtest):**
- **Balance/feel unproven by a human.** Bots lean farm-heavy in testing (~1 kill / 25s). Dials:
  `config.bots.aggression`, `engageRange`, `preferredRange`, `aimErrorRad`. The cross-class triangle
  is first-pass.
- **No spatial partitioning** — combat/targeting is O(ships × (objects+ships)) per tick. Fine for
  ~7 ships + 320 rocks; revisit with a grid if bot count climbs (also the Phase 5 scale concern).
- Bot AI is heuristic (no path-finding/LoS; they can wall-hug or over-commit). Telegraph dodge is a
  coin-flip sidestep, not true prediction.
- Specials are functional but conservatively tuned; brokenCore (Star Piercer) is still a flag only.

**Next:** Phase 5 — real multiplayer (authoritative server, client becomes a thin renderer). Per the
roadmap, gated on this phase being *fun* — get hands on it first. Do NOT start until asked.

---

## 2026-06-27 — Feel/perf pass: fps, Gravitor overhaul, Hammerhead glide
**Perf — fix the "feels like 30fps":** additive bloom is fill-rate bound and we were (1) rendering
at DPR 2 (4× pixels on retina) and (2) creating a `createRadialGradient` per *particle* — bursts of
18–36 per break/death meant hundreds of gradient allocations per frame during action. Fixes:
`render.js` caps DPR at **1.5**; `fx.js` draws particles as **cheap additive solid circles** (they
still sum into a glow under 'lighter'). Object/mote glows still use gradients but are bounded (~25/
frame after culling). Can't measure fps headlessly — if it's still rough, next levers are DPR 1.0
and fewer particles.

**Gravitor overhaul (it felt bad):** pull now sucks the nearest rocks **in parallel** (whole
magazine fills fast) at a stronger `capture.pullStrength`; bigger `pullRadius`, faster `launchSpeed`,
more `launchDamage`. Capacity + launch are per-tier via `gravitor.launchByClass`:
Gravitor **3** held / 1 per press / 0.45s cd · Meteorist **6** / 2 / 0.22s · **Starfall 9 held,
3 per press, NO cooldown** (tap as fast as you can — re-fires instantly). Removed the old single
`well.asteroidCapacity` / `well.cooldownSec` / `meteorVolley`.

**Hammerhead glide now reads:** bumped `lunge.speed` 980→1500, duration 0.34→0.40, lower
`minLungeFactor`/`glideDampPerSec`, and added a **motion trail** during the lunge. Measured
**tap 119px → full 541px** (was 81→294) — a full wind-up is now an unmistakable ~540px charge.

Smoke-tested: hammer distance scaling + Gravitor per-tier hold/launch/cooldown all pass.

---

## 2026-06-27 — Phase 3 polish: make evolutions READ as power
**Why:** within-family upgrades (Railship→Lancer→Star Piercer, etc.) applied real but
*imperceptible* changes — same silhouette, same hp/size, numeric weapon buffs you can't feel on
1-hit rocks with no enemies. Player (correctly) felt "upgrades aren't changing anything."

**What changed (all visual/feedback, no new systems):**
- **Per-tier hull growth** — `economy.tierGrowth` ({radius:0.14, hp:0.20}/step) applied in
  `applyClassStats` by class tier. Upgrade=+1 step, final=+2. Rail line now 14.7r/85hp →
  16.8r/102hp → 18.8r/119hp; Hammer line grows into a 26r/161hp dreadnought. You visibly grow.
- **Per-tier silhouettes wired** — the distinct shapes already in `visuals.js` are now drawn:
  spear→thinSpear→longSpear, wedge→broadWedge→massiveWedge, crescent→crescentHeavy. Plus **tier
  pips** on the hull and tier rings on the flail orbit. A Lancer no longer looks like a Railship.
- **"What you gained" readout** — `EVOLVE_BLURB` line on evolve (e.g. "full-lunge SHOCKWAVE",
  "VOLLEY — hurl them all"), under the EVOLVED → Name flash. Higher tiers also glow a touch harder.

**Note:** the numeric weapon buffs (range/damage/capacity) were already correct and still mostly
only *matter* against a target — they'll come alive with bots in Phase 4. This pass fixes the
*legibility* of evolving, which was the actual gap. Smoke-tested (growth + distinct silhouettes
per tier across families). `config.economy.evolutionTierBonus` removed (replaced by `tierGrowth`).

**Also — Hammerhead windup now scales dash distance.** Previously the wind-up only scaled
*damage*; the lunge speed/duration were constant, so a long charge and a tap dashed the same
distance (unintuitive). Now windup scales lunge speed (`lunge.minLungeFactor`→1.0) and glide time,
and drag is low mid-lunge (`lunge.glideDampPerSec`) so the ship carries momentum: measured **tap
81px → half 174px → full 294px**, monotonic. Hold longer = bigger hit AND longer charge.

---

## 2026-06-26 — Phase 3: Class skeleton + first branch each (four families playable)
**What changed:** The class system is real. You start as the **Scout** (popgun) and choose a
family at level 3, then branch at 8 and reach a final form at 15 — each family a distinct weapon,
ability, silhouette, stat line, and farming verb. This replaces the Phase 2 placeholder tier-bump
(`tryEvolve`) with an actual data-driven class choice.

**Evolution UX (human-chosen): non-blocking overlay.** At a gate a compact panel appears at top
center listing the available children from `classes.js`; the game keeps running and you press
**1–N** (or click a button) to pick. Choosing **spends** the `evolutionCosts` (banks it) and
switches class. Below a gate the overlay shows "need N more scrap." Options are filtered to an
`IMPLEMENTED` set (branch A only; the Singularity/Graviflail second branches are Phase 4).

**The four families (data/weapons.js, resolved by string key — engine never branches on class):**
- **Railship → Lancer → Star Piercer** — `chargeRail`: hold-charge hitscan **beam**, pierces N
  with falloff, heat→vent, Vent Dash. Lancer/Star Piercer tune range/width/damage + perfectLine.
  Farm verb: **line them up** (LINE BREAK).
- **Hammerhead → Maulbreaker → Worldsplitter** — `hammerRam`: wind up, **lunge**; contact =
  impact (base + lunge-speed × momentum); you shrug off rocks mid-lunge. `brace` ability.
  Worldsplitter full-lunge → shockwave. Farm verb: **plow through**.
- **Gravitor → Meteorist → Starfall** — `gravityWell`: hold to **pull** rocks into orbit
  (capacity 2/3), `launchAsteroid` ability **hurls** them at the cursor; thrown rocks smash other
  rocks for **orbitalHarvest** bonus. Starfall dumps the whole volley. Farm verb: **turn the field
  on itself**.
- **Flailship → Chainmaul → Ironmoon** — `wreckingOrb`: a chained orb perpetually **orbits**;
  hold to extend reach; damage scales with tip speed; per-object hit-cooldown so one pass = one
  hit. `swingControl`→`powerSwing`→`moonSlam` abilities. Farm verb: **sweep clusters**.

**Architecture:** weapons moved to a per-tick `update(api, ship, dt, {firing})` interface (each
behaviour owns its state on the ship + acts through the `api`); abilities keep `activate()`.
Engine calls `resolveWeapon(classNode.weapon).update(...)` and `resolveAbility(classNode.ability)`
— adding a class is a data row + a registry entry, no engine edit. Per-class stats via
`config[configKey].stats` (hp/speed/**sizeMult** → distinct hitboxes); distinct silhouettes drawn
by `FAMILY[classId]`; gravitor's held rocks + flail's chain/orb rendered in world space.

**Config added:** `stats.sizeMult` per family; `railship.evolveMods` (Lancer/Star Piercer);
`hammerhead.lunge`/`maulbreaker`/`worldsplitterSlam`; `gravitor.orbit`/`capture`/`thrownRockRadius`/
`orbitalHarvestBonus`/`meteorist`/`meteorVolley`; `flailship.orb.tipRadius`/`hitCooldownSec`/
`swingControl`/`chainmaul`.

**How to test:** open **http://localhost:8080/** (hard-reload). Farm as the Scout to **LV 3**, then
the EVOLVE panel appears — press **1–4** to pick a family (you'll see the silhouette + feel change
immediately). Each plays differently: Railship charges a piercing beam, Hammerhead winds up and
lunges through rocks, Gravitor pulls a rock then Space-hurls it through others, Flailship's orb
sweeps clusters. Hit **LV 8 / 15** to branch and reach a final form. Headless smoke test asserts
all 14 behaviours (gated selection spends scrap, distinct stats, every family farms, finals
reachable, no-throw across class switches).

**Known limits / TODO hooks:**
- **Per-class FEEL not human-playtested** — the headline deliverable ("different within 10s, no
  bullet-spam") is structurally met and smoke-tested, but balance/juice across the four wants your
  hands on it. Numbers are first-pass in `config`.
- **Branch B not built** — Singularity/Event Horizon, Graviflail/Orbit Crusher resolve to no-op
  weapon stubs (Phase 4). The overlay simply doesn't offer them yet.
- **Specials are light** — `brokenCore` (Star Piercer weak-point) is a config flag only; Worldsplitter
  shockwave + Starfall volley + Ironmoon slam are functional but tuned conservatively.
- **Hammerhead `turnRateDuringCharge` unused** — aim is instant (mouse); no steering limit yet.
- No PvP/bots, so class-vs-class triangle is untested (Phase 4).

**Next:** Phase 4 — second branches + bots (the prove-it gate). Do NOT start until asked.

---

## 2026-06-26 — Phase 2: World & economy (greed loop live)
**What changed:** Layered the world + economy onto the Phase 1 Railship core. The map is now a
real place with a working honeypot, an emergent risk gradient, leveling, banked evolutions, and
leader/threat legibility. All in `data/config.js` + `src/game.js` (no new files).

**Decisions / how each pillar landed:**
- **Functional pulsar** — a pulse every `arena.pulsarPulseIntervalSec` ejects
  `economy.pulsarMotesPerPulse` bright motes (worth `pulsarScrapPerMote` each) that fan out and
  decay (`pickups.pulsarMote*`). Richest, fastest scrap → the center is the draw. It does NOT
  burn you; the "high-risk" is emergent PvP convergence (Phase 4) — left honest, not faked.
- **Density gradient** — rocks are placed arena-wide by **rejection sampling weighted by
  `densityAt()`** (`densityAtCenter 0.4` → `densityAtEdge 1.0`), core kept clear. Rim = dense
  calm farm, core = sparse. Smoke test: 231 objects in the outer band vs 11 in the inner third.
  Population is conserved (break → 8s respawn → re-sample), capped at `farming.field.count`.
- **Scrap-as-currency** — split into **carried scrap** (wallet, dropped on death, spent to
  evolve) and **xp = cumulative earned** (only grows → `level`). `earn()` feeds both. Level from
  `levelForXp()` (`economy.levelCurve`: L3≈28xp, L8≈265, L15≈880, L25≈2360).
- **Evolution gates (3/8/15)** — press **E** when `level ≥ gate` AND `carried ≥ cost`
  (`evolutionCosts`). Spending **banks** it: carried drops, `evolutionTier`++, hull grows
  (`evolutionTierBonus`, a PLACEHOLDER bump), heal to full. The actual family/branch/final
  CHOICE UI + real class stats are deliberately deferred to Phase 3 (TODO hook in `tryEvolve`).
- **Leader / David-vs-Goliath** — threat-glow scales your bloom with carried scrap
  (`readability.threatScrapForMax`); at `levelLeaderScaling` (25) you gain `leader.hpBonus` +
  `leader.hitboxBonus` (the bigger-target tell), a **crown** glyph, and a **minimap** mark.
  Minimap (bottom-right) shows the pulsar + your position for navigating the 6000² arena.

**Scale decision (recorded):** human chose to **defer the netcode/sim-split to Phase 5**. We are
knowingly leaving the sim coupled to Input/Render and using `Math.random()` directly; the clean
input-intent boundary + seeded RNG happen at the Phase 5 server split, not now.

**Config added:** `economy.levelCurve` / `evolutionTierBonus`, `readability.threatScrapForMax`,
`pickups.pulsarMoteSpeed`/`pulsarMoteLifeSec`, and `farming.field` reshaped to
`{count, weights, pulsarClearRadius}` (arena-wide gradient).

**How to test:** open **http://localhost:8080/** (hard-reload). You spawn on the calm dense rim;
fly **up toward the pulsar** (use the minimap) and watch rocks thin out as you near the center,
where the pulse showers bright motes — vacuum them fast before they decay. Farm to **LV 3**, hold
**E** to bank a tier (hull grows, scrap spent = safe), then notice your ship glows brighter as
you hoard carried scrap. Die (ram a rock) and you drop ~half your *carried* scrap but keep your
level + banked tiers. Headless smoke test asserts all 16 behaviours (gradient, pulse, leveling,
evolve-spend-bank, leader hitbox) pass.

**Known limits / TODO hooks:**
- **Feel/curve not human-playtested** — level curve, pulse richness, evolve costs are first-pass.
  The real "done when" (push-my-luck tension) needs your hands on it.
- **No bounty payout yet** — `killScrapFraction` / `bountyScrapMultiplier` only pay out when a
  *killer* exists (PvP/bots, Phase 4). Dropped scrap is currently just re-collectible by you.
- **`leader.turnRatePenalty` unused** — aim is instant (mouse), so there's no turn rate to
  penalise until a steering-limited ship exists (Hammerhead). Wired in config, applied later.
- Re-collecting your own death-drop re-counts as xp (minor; acceptable pre-PvP).
- Single-player so you're trivially the "leader"; the contest that makes the crown meaningful
  arrives with bots (Phase 4).

**Next:** Phase 3 — class skeleton + first branch each (all 4 base classes selectable at level 3,
data-driven; this is where `tryEvolve` becomes a real class choice). Do NOT start until asked.

---

## 2026-06-26 — Phase 1: Combat & farming feel (Railship playable)
**What changed:** Built the whole Phase 1 core-feel layer. You now pilot the **Railship**
(class selection is Phase 3, so it's wired directly to nail the sensation first) with a full
charge→heat→vent loop, an asteroid/crystal/debris farm, honest hitboxes, hit feedback, and a
death→drop→respawn loop. Also did the requested pickup tweak: **proximity alone now vacuums
scrap** — get within `pickups.collectRadius` and motes fly to you.

**Files created:**
- `src/fx.js` — `PULSAR.Fx`: transient feel (particles, beam streaks, floating combat text,
  screen shake). Updated in the FIXED step (frame-rate independent), interpolated on draw.

**Files changed:**
- `src/weapons.js` — rewritten around an `api` service object (so collision/damage stay
  centralised in game.js). Weapons now declare a `mode` (`'auto'` | `'charge'`). Implemented
  **`chargeRail`** (hold→charge through snap/focus/lance/overcharge, release → a HITSCAN BEAM
  that pierces N objects with falloff; honest VFX: `beam.halfWidth` IS the hitbox half-width;
  3+ neutral hits = LINE BREAK) and the **`ventDash`** ability (backward burst, sheds heat,
  bleeds charge). Added `PULSAR.abilities` + `resolveAbility` (stub for the rest).
- `src/game.js` — major rework: object FIELD (asteroid/crystal/debris) with timed respawn;
  centralised damage system (`damageObject`/`crackObject`/`breakObject`/`lineBreak`); player
  HP + contact damage from rocks (the death trigger) + impulse model (recoil/dash/knockback
  all bleed off via `player.impulseDampPerSec`); death → drop `dropFractionOnDeath` of carried
  scrap as motes → respawn at full HP with spawn protection; charge-aware movement slowdown;
  Vent Dash on **Space** (edge-triggered); distinct procedural shapes per object; **Armor
  Crack** rendered as a scaffold marker on rocks; HUD with HP / heat / charge bars + dash CD.
- `src/input.js` — added `key(code)` accessor + `preventDefault` on owned keys (Space/arrows).
- `data/config.js` — new tunables (all commented): `railship.charge.timeToFullSec` &
  `overchargeCap`, `railship.beam`, `railship.ventDash` dash params, `fx` block, farming
  `crystalRadius`/`debrisRadius`/`contactDamage`/`field`/`motesPerObject`, `player`
  `impulseDampPerSec` & `respawnDelaySec`, and the widened `pickups.collectRadius` (46→150).

**How to test:** server already running — open **http://localhost:8080/** (static
`python3 -m http.server 8080` from the project root; the other repos' servers on 8000/8001/8095
are unrelated and left alone). You should: fly the Railship (WASD + mouse), **hold** to charge
and watch the nose spine brighten + movement slow, **release** to fire a piercing rail beam
(the glow thickness is the hitbox); pop asteroids/crystals/debris, get a **LINE BREAK** popup
when one shot tags 3+, and vacuum the scrap by getting near it; overheat to force a vent;
**Space** to Vent Dash (sheds heat, kicks you back); ram a rock enough to get **WRECKED**,
drop ~50% of carried scrap, and respawn with a spawn-protection shimmer. A headless smoke test
(mocked DOM + seeded RNG) asserts all 13 of these behaviours pass with no exceptions.

**Known limits / TODO hooks:**
- Feel is **code-complete but not human-playtested** — TTK/charge-time/heat numbers are first-
  pass guesses in `config`; tune against real play (that's the actual "done when").
- Armor Crack is a scaffold: it marks & amplifies damage on **rocks** so it's visible/testable,
  but the real anti-large target (leaders/players, duration-scales-with-size) is Phase 2+.
- Only the Railship is built; other weapon/ability keys still resolve to no-op stubs.
- Density field is flat (a scatter around spawn) — sparse-core→dense-edge interpolation + the
  functional pulsar are Phase 2. Death has no killer yet (no PvP/bots) so no bounty payout.
- Movement is still instant-velocity + impulse kicks (no thrust inertia) — revisit if it reads
  too arcadey in playtest.

**Next:** Phase 2 — world & economy (functional pulsar honeypot, density gradient, level/
evolution gates, leader/bounty). Do NOT start until asked.

---

## 2026-06-25 — Phase 0: Skeleton (engine bones, playable)
**What changed:** Built Phase 0 from the scaffold — the game now runs. Fixed-timestep sim
decoupled from an interpolated render, WASD + mouse-aim movement, the additive-bloom pipeline
on black, the starter weapon firing with honest VFX, and one breakable asteroid that drops
collectible scrap. Stops exactly at the Phase 0 line — no class system, no economy depth.

**Files created:**
- `src/input.js` — `PULSAR.Input`: keyboard/mouse polling layer (no game logic). WASD → a
  normalised move dir; mouse tracked in screen space; clears held keys on window blur.
- `src/render.js` — `PULSAR.Render`: additive-bloom pipeline. Two passes — a `'lighter'`
  bloom pass (soft radial gradients) and a crisp core pass. Camera follows player; DPR-aware
  resize; faint world grid + arena border + a **decorative** centre pulsar (visual landmark
  only — the functional honeypot is Phase 2).
- `src/weapons.js` — `PULSAR.weapons` + `PULSAR.resolveWeapon(key)`: the data-driven behaviour
  seam. The engine never branches on class; it resolves the `weapon` string key from
  `classes.js`. Only `popgun` is implemented; every other key falls through to a safe no-op
  TODO stub so the game never breaks before those weapons land.
- `src/game.js` — entry point: world state, the fixed-timestep loop, `simulate(dt)`, and the
  interpolated `render(alpha)` + procedural ship/asteroid/HUD drawing.

**Files touched:** `index.html` (placeholder title removed; loads the four `src/` scripts after
the data layer). `data/config.js` (new tuning blocks — see below).

**New config (all in `data/config.js`, the one tuning surface):**
- `sim` — `tickRate: 60`, `maxFrameTimeSec: 0.25`. The determinism clock. Movement/cooldowns
  integrate by `1/tickRate`, never real frame time (proven frame-rate-independent in test).
- `popgun` — starter weapon. **`projectileRadius` is read by BOTH render (bloom) and collision
  (hitbox)** — that single number is the honest-VFX promise made literal.
- `pickups` — scrap-mote drift/vacuum/collect tuning (minimal Phase 0 drop loop).
- `farming.asteroidRadius` (render == collision), `farming.motesPerAsteroid`.

**How to test:** open `index.html` in a browser. You should: see your bright white-cored ship
at screen centre on black with neon bloom; move with WASD; aim the facing-spoke with the mouse;
hold/click to fire cyan tracers (the glow you see *is* the hitbox); pop the nearby asteroid
in ~3 hits; watch it eject scrap motes you vacuum by flying over them (HUD SCRAP rises). FPS
shows top-left. A headless smoke test (`vm`-mocked DOM, seeded RNG) confirmed the whole loop:
movement = 179px over 0.64s @280px/s (≈ frame-rate independent), asteroid breaks, motes drop,
collection raises scrap — no exceptions.

**Known limits / TODO hooks:**
- Centre pulsar is **visual only** — no pulse rhythm / motes / bounty draw yet (Phase 2).
- `resolveWeapon` returns a no-op stub for `chargeRail` / `hammerRam` / `gravityWell` /
  `wreckingOrb` — real behaviours are Phases 1–4.
- Only one asteroid (per the Phase 0 spec); no damage-to-player, no death/respawn of the
  player, no crystals/debris/wreckage, no density field — all Phase 1+.
- Movement is instant velocity (= baseSpeed), no accel/inertia yet — keeps Phase 0 honest and
  config minimal; revisit feel in Phase 1.

**Next:** Phase 1 — combat & farming feel (damage + honest hitboxes, hit feedback, scrap
pickup + LINE BREAK feedback, death-drop loop, Railship built out). Do NOT start until asked.

---

## 2026-06-25 — Project organized + design reconciled (scaffold only, no game code yet)
**What changed:** Set up the repo for serious development and reconciled the design after a
pivot from abstract energy-weapons to a spaceship class system.

**Decisions locked:**
- **Class system:** four ship families on an evolution tree (Railship / Hammerhead / Gravitor /
  Flailship), replacing the earlier weapon × armor-set matrix. Weapon+ability+identity are fused
  into the ship. Lineage preserved (Railship←Lance, Gravitor←Nova, Flailship←orbiting flail).
- **Economy:** scrap-leveling **with** the greed loop — spending banks progress, carried scrap is
  droppable, die and lose ~50% of unspent scrap; level/evolution never lost.
- **Spatial:** keep the **pulsar honeypot** at center (rich, contested) with calm asteroid edges;
  emergent gradient, no authored rings.

**Files created:** `data/config.js` (the one tuning surface), `data/classes.js` (evolution tree),
`data/farming.js` (neutral objects + pulsar), `data/visuals.js` (placeholders + readability),
`docs/DESIGN.md` (canonical), `docs/CLASSES.md`, `docs/VISUAL_SPEC.md`, `docs/ROADMAP.md`,
`AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `index.html` (loader stub).

**State:** no game logic yet. `index.html` is a placeholder that loads the data files and draws a
title. Phase 0 is the next task.

**How to test:** open `index.html` in a browser — you should see the title screen and no console
errors (data files loaded).

**Known limits / TODO hooks:** all `weapon`/`ability`/`passive`/`special` keys in `classes.js`
need behavior functions (Phases 1–4). Leader-scaling data (size/level) referenced by Armor Crack
scaling isn't wired yet — scaffold the scaling fn now, feed real data in Phase 2.

**Next:** Phase 0 — skeleton (loop, movement, bloom pipeline, one weapon, one asteroid).
