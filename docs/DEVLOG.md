# PULSAR.io — DEVLOG

Append-only session log. Newest entry on top. Every session ends with an entry: what changed,
files touched, new config, how to test, known limits, TODO hooks left. This is how context
survives between agents and sessions.

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
