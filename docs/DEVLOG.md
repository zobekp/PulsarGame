# PULSAR.io — DEVLOG

Append-only session log. Newest entry on top. Every session ends with an entry: what changed,
files touched, new config, how to test, known limits, TODO hooks left. This is how context
survives between agents and sessions.

---

## 2026-07-16 — Titan plane physically relocated (no more invisible rock destruction)
User report: Titans kept destroying farm rocks, and from the arena the destruction was
INVISIBLE (rocks popping with no visible cause) — because plane 1 was only a combat/view
FILTER over the same coordinates. Objects have no plane, so Titan fights consumed plane-0
rocks. Fix: **the Titan plane is now a physically separate rect** — same size, shifted
`config.titanPlane.offsetX` (14000) along +X, an 8000px void between the planes. Distance
now does what filters can't: nothing up there can touch the farm field, by construction.
- **sim.js:** `planeOffX(plane)` resolves every spatial rule per plane — `edgeSpawn(plane)`
  (Titan spawns land in the Titan rect; no farm-density search up there), movement clamps
  to the plane's own walls, projectile bounds per-plane (plane-1 bolts used to die instantly
  at `x > arena.width`), shatter-fragments reseed plane 0 only, `pulsarGravity` skips plane 1
  (no hole up there — Titans previously ate pull + lethal horizon from a hole they couldn't
  see). **Ascension teleports**: apex evolve adds the offset (px/py synced so MP interpolation
  doesn't streak the jump; arrive at a dead stop — matches the warp cinematic). Fallen
  Titans respawn plane-0 via the same path; bot respawns stay on their own plane.
- **bots.js:** rock targeting is plane-0-only (Titan bots used to pick a main-arena rock as
  their farm target — now unreachable by construction, they'd have wall-hugged); idle anchor
  is per-plane (Titans hover their own rect's center); black-hole avoidance plane-0-only.
- **render/game.js:** Titan rect gets its own gold-tinted boundary; minimap maps your plane's
  rect into the square (gold "TACTICAL / TITAN PLANE" header up there; hole + mountain
  landmarks drawn on plane 0 only).
**Files:** `data/config.js`, `src/sim.js`, `src/bots.js`, `src/render.js`, `src/game.js`,
`tools/planetest.js` (new). **Config:** `titanPlane.offsetX 14000`.
**How to test:** `node tools/planetest.js` — 12 checks: seeds/dreadnoughts spawn in the rect,
apex evolution teleports there at a dead stop, no pull at the rect center, plane-1 projectiles
fly within the rect, objects never leave the arena, an isolated Titan bot hunts its own rect
(not arena rocks), fallen Titan respawns plane-0. Plus sptest/finaltest/skintest/edgetest/
predtest/reattachtest ALL PASS.
**Known limits:** the solo-mode [L] admin cheat doesn't respond to synthetic (untrusted)
keyboard events in an unfocused tab — PRE-EXISTING (reproduced on the unmodified build),
unrelated to this change; MP admin works. Cross-plane fx are already plane-stamped; the
ascension cinematic hides the coordinate jump (background switches at jump start — acceptable
under the blackout).

## 2026-07-16 — Full cosmetics section: hull LIVERIES (14 skins, tiers, animated legendaries)
The old cosmetics were 7 accent colors that drew a ring. Skins are now full hull liveries — the
pre-launch monetization lever, still strictly options-only (VISUAL_SPEC readability channels are
untouchable: silhouette, shared rim, white YOU-core, and threat bloom survive every livery).
- **Catalog (`data/cosmetics.js`):** 14 skins across 4 rarity tiers (4 common / 4 rare / 4 epic /
  2 legendary), each a data row: `hull` retints the
  plating (body/plate shades derived), `accent` recolors greebles/running lights, `engine`
  recolors the flame, `fx` names an animated layer, `blurb` for the card. Existing 7 ids kept
  (profiles with old unlocks stay valid); `tiers` map exposes UI colors.
- **Renderer (`src/ships.js`):** `skinPalette(classHex, sk, time)` beside `palette()` — same
  cached-shades pipeline fed by the livery; `engine()` takes `P.engineRgb`. Animated legendaries
  rotate the hull hue (Prismatic = full cycle, Aurora = teal↔violet roll), quantized so the
  palette cache stays bounded. `Ships.draw` resolves `s.skin` → livery.
- **FX layers (`src/game.js` `drawSkinFx`):** ember = live sparks shed aft · void = dark
  breathing aura · chrome = specular glint sweep · aurora = twin offset-hue rings. Additive,
  dimmer than the rim, per-ship phase offset. Old accent ring removed (the hull IS the skin now).
- **Everyone sees your livery:** ships carry `skin` in the sim (`makeShip`/`addShip`); MP join
  sends the equipped id, the server VALIDATES it against the catalog (no client trust), and
  snapshots carry `sk` → remotes render it. Bots spawn wearing random liveries at
  `config.cosmetics.botSkinChance` (0.35) — the arena advertises the shop.
- **Hangar UI (`index.html`):** title-screen shop rebuilt — live animated hull previews (the real
  procedural renderer drawing a skinned railship on a per-card canvas, DPR-aware), tier-colored
  cards + labels, blurb tooltips, locked cards dimmed, can't-afford shake, unlock→equip flow on
  the existing cores wallet.
**Files:** `data/cosmetics.js`, `data/config.js`, `src/ships.js`, `src/game.js`, `src/sim.js`,
`src/mpclient.js`, `mpserver.js`, `index.html`, `tools/skintest.js` (new).
**Config:** `cosmetics.botSkinChance 0.35`. Costs live in the catalog rows (0→900 cores).
**How to test:** `node tools/skintest.js` (catalog integrity, unlock/equip flow, every class ×
skin draws clean — 336 combos, palette actually retints + animates, bot livery gating) + sptest +
finaltest. Verified in-browser: hangar renders 14 live previews, unlock spends cores, equipped
Aurora shows in-game with its rings; no console errors.
**Known limits / TODO:** per-class preview in the hangar (always shows a railship); fx layers
don't render inside the preview cards (palette animation does); pricing is a first guess — tune
against real core-earn rates; a "buy cores" IAP hook is deliberately NOT built (needs a human
decision on payments).

## 2026-07-11 — Commandeered Dreadnought fires at will (player input, not autofire)
The AI boss auto-fires; a player who commandeers the hull should choose when to shoot. `dreadnoughtGuns`
now takes `ctx` and gates on `ship.isBot || <input>`: **LMB (firing) → turret guns, RMB (altFire) →
homing missiles**. Turrets still auto-track the nearest foe; for a player they fire immediately (no
telegraph — `tel = 0.001` vs the bot's `telegraphSec`, which keeps the boss readable). Bots are
unchanged (`ship.isBot` short-circuits both gates). Takeover prompt now shows the control hint.
**Files:** `src/weapons.js`, `src/game.js`. **Verified:** headless — player idle fires nothing, LMB
fires only guns, RMB fires only missiles, the AI boss still autofires both; sptest + finaltest green.
## 2026-07-11 — Hammerhead ram: crowd-control, not an execute (no more one-shot)
The ram could flat one-shot (base impact × the rank `dmgMult` up to 6.5× blew past HP pools). Reworked
it into a hard CC hit: **high damage + strong knockback + a STUN, but capped so it can't oneshot a
healthy target.**
- **Anti-oneshot cap:** `damageShip` gained an `opts.capFrac` — the final post-mitigation hull damage
  can't exceed `capFrac × maxHp`. Applies to ships only (rocks route through `damageObject`, so the
  hammer still plows the field). A ram on a full-HP target now takes ~55%, never a kill; a *wounded*
  target (below the cap) can still be finished.
- **Stun + harder knock:** the ram `smash`, the body-check, and both worldsplitter shockwaves now set
  `t.stunTimer` (frozen controls, via the existing Static-Lash stun path) and knock via a new
  `ram.knockbackMult` (2.2×). Config `hammerhead.ram`: `stunSec 0.6`, `maxHpCapFrac 0.55`,
  `knockbackMult 2.2`, `bodyCheckStunSec 0.22`. Covers the whole family (hammerhead → maulbreaker →
  worldsplitter → juggernaut, which all delegate to `hammerRam`).

**Files:** `src/sim.js`, `src/weapons.js`, `data/config.js`. **Verified:** headless — a full
worldsplitter ram deals exactly 55% max HP (victim survives), stuns, and knocks (impulse ~272); a 30%
target still dies; rocks unaffected; sptest + finaltest green.
## 2026-07-11 — Commandeer the Dreadnought (press Y) + real boosters & hull detail
- **Take it over:** land the killing blow on the Dreadnought and a **"press [Y] to COMMANDEER its
  hull"** prompt flashes (7s window). Y turns your ship INTO a playable dreadnought — full 7000
  shield, six auto-tracking telegraph turrets, homing-missile pods, huge hull. You drive + aim; the
  turrets/missiles auto-engage the nearest foe (a walking fortress). Sim: `world.becomeDreadnought(id)`
  = `switchClass('dreadnought')` (stays on plane 1 — the slayer's already a Titan) + shield setup +
  FX. Wired: `onKill` arms `takeover` when the local player kills the boss; `[Y]` edge → SP
  `becomeDreadnought`, MP `sendCommandeer`. MP is authoritative — the server marks the slayer eligible
  for 7s in its `onKill` and only honours `cmdr` within that window (no client trust).
- **Real boosters:** the stern's four static "engine banks" are now live thrusters — a hot throat +
  a flame that ROARS longer with velocity (scaled to the boss's slow top speed so it actually shows).
- **More detail:** hangar-bay slit (recessed, faint interior glow), forward panel hatching, bow
  sensor masts with lit tips, a row of keel running lights, longitudinal armor strips.

**Files:** `src/sim.js`, `src/game.js`, `src/ships.js`, `src/mpclient.js`, `mpserver.js`.
**Verified:** headless — killing the boss fires `onKill` with the right killer; `becomeDreadnought`
turns a zenith into a dreadnought (302px, 7000 shield, hp 26k) whose turrets + missiles then fire;
model renders idle vs full-thrust boosters + the new greebles; sptest + finaltest green.
## 2026-07-11 — Dreadnought: deflector shield + homing missiles + polish
Made the boss a real fight: a shield you must break before it can die, homing missiles, and pretty VFX.
- **Deflector shield** (`dreadnought.shield` max 7000, regen 900/s after a 4.5s lull): a generic
  `shield`/`shieldMax`/`shieldRegen*`/`shieldHitTimer`/`shieldFlash` on every ship (0 unless set).
  In `damageShip`, while `shield > 0` the hull takes **zero** damage — every hit only bleeds the
  shield (with a cyan spark + `shieldFlash`); at 0 it breaks (burst + "SHIELD DOWN" text) and the hull
  becomes killable. Regen only stalls on damage, so you must **commit and burst it down** or it comes
  back. Regen ticked in `tickTimers`; set in `spawnDreadnought` + restored on respawn. The boss is now
  **immune to asteroid contact** (a Star Destroyer plows through rocks — also stops rocks nibbling the
  shield). MP: `shd`/`shm`/`shf` in the snapshot, hydrated client-side.
- **Homing missiles** (`dreadnought.missiles`): volleys of 3 slow-turning trackers on a 4.5s cadence.
  Generic projectile `homing` flag — the sim's projectile step steers `vx/vy` toward the nearest
  same-plane enemy at a capped `turnRate` (juke-able) and lays an exhaust trail.
- **Pretty:** `drawShield` (hex-shimmer bubble, faint fill, rim that flares white on a hit, brightness
  ∝ charge) drawn for any `shieldMax > 0` ship; `drawMissile` (oriented warhead + licking flame,
  velocity-oriented with a px→x fallback for MP). Bloom/particles carry the rest.

**Files:** `data/config.js`, `src/sim.js`, `src/weapons.js`, `src/game.js`, `mpserver.js`,
`src/mpclient.js`. **Verified:** headless — hull invulnerable while shielded (2000 dmg → 0 hull),
breaks at 7000 then hull takes damage, regens 900/s after a lull; 3 homing missiles that steer;
turret telegraph intact; models render (shield bubble + missiles); sptest + finaltest green.
## 2026-07-11 — Zenith point-defense → slow bolts (not hitscan); Devourer bolts far more dangerous
- **Zenith autoaim point-defense** was instant hitscan (`api.damage` + a beam streak). Now it fires a
  **slow cyan BOLT** (a real projectile, dodgeable) at the nearest foe. Config `railship.zenith.
  pointDefense` gained `projectileSpeed 340` / `projectileRadius 6` / `projectileLifeSec 2.2`, damage
  6→8, cadence 0.17s→0.34s (fewer, slower, dodgeable bolts). Verified: 6 bolts in flight, land on a
  stationary target (~364 dmg/3s), and a moving target dodges them.
- **Dreadnought bolts far more dangerous:** turret bolt damage `dreadnought.guns.damage` 2.4→16
  (≈16→104 per bolt after rank-4 dmgMult) + radius 11→12. They're telegraphed by the 0.9s red laser
  sight, so eating one should hurt — dodge the sight.

**Files:** `src/weapons.js`, `data/config.js`. **Verified:** headless — PD bolts are projectiles at
340px/s that hit & chip; Dreadnought bolt ≈104 (1495 dmg/10s to a stationary dummy); sptest +
finaltest green.

## 2026-07-11 — Fix: tier-4 apexes missing from game.js FAMILY (invisible maces/chains, dead controls)
**Bug:** Constellation's maces + chains didn't render on the Titan plane — and neither did any other
apex's class-extras. Root cause: `game.js` keeps its OWN `FAMILY` map (separate from `sim.js`'s) and
it was never updated for the six tier-4 apexes. So `FAMILY['constellation']` was `undefined`,
`drawClassExtras`'s `else if (fam === 'flail')` branch silently no-op'd (same for rail beam charge on
zenith/prism and the grav core on cataclysm/devourer), and grav-apex controls (`isGrav`) + the
family HUD bar were dead too.
**Fix:** added the apexes to `game.js` `FAMILY` (`zenith/prism→rail, juggernaut→hammer,
cataclysm/devourer→grav, constellation→flail`, plus `dreadnought`). One line, mirrors `sim.js`.

**Ascension cinematic reworked (per feedback):** dropped the Star-Wars radial star-streaks / white
lines. `drawWarp` is now CHARGE (engine glow + a soft plume swell behind the ship) → BLAST (fade to
black) → HOLD → FADE-IN, dur 1.9s. **Then reworked again (further feedback):** now draws the player's
ACTUAL hull — CHARGE boosters rev → **BLAST OFF** (the ship rockets off-heading with a hard engine
plume) → fade to black → **EXIT HYPERSPACE** (the ship streaks in with a drop-out flash and
DECELERATES to a dead stop at centre, motion-blur trail collapsing as it slows). Helpers
`drawWarpShip` (real hull, engines roaring via a temporary high velocity, scaled by camera zoom) +
`warpEngineTrail` (soft plume, not a hard line). The world render skips the player once the jump
starts (`warpHideMe`, t≥0.6) so the cinematic owns the hull; input locked for the whole cinematic and
held to the jump heading so the hand-off back to live control is seamless.
**Files:** `src/game.js`. **Verified:** mapping resolves for all six; syntax OK; sptest/finaltest
unaffected (render-only). The earlier chain-contrast change was real but couldn't show while the
whole flail branch was being skipped.

## 2026-07-11 — Dreadnought world-boss raster sprite
**What changed:** Created `DreadnoughtSprite.png`, a transparent top-down raster asset for the Titan-plane world boss. It follows the established boss spec: right-facing dagger hull, readable charcoal-steel plate ribs, red bridge/keel/edge lights, four blue stern engine banks, and exactly six large turret domes in three mirrored pairs.

**Asset:** `DreadnoughtSprite.png` — 1939×811 RGBA PNG (~2 MB), with transparent exterior and enough hull contrast to remain readable over the game's `#05060a` arena black. Generated on a flat chroma background, locally keyed to alpha, and validated by compositing over the real game background.

**Prompt intent:** polished hand-painted top-down sci-fi boss sprite; one ship only; orthographic; nose +X/right; no text, projectiles, beams, shadows, stars, or other ships.

**Known limit / TODO:** the current game still renders the Dreadnought procedurally in `src/ships.js`; this session creates the approved sprite asset only and does not replace or wire the runtime model.

---

## 2026-07-11 — Flail chains + ascension "jump to lightspeed" cinematic + Titan-plane briefing
- **Constellation chains:** the 4 maces *were* chained, but the chain (thin gold, α0.5) vanished on a
  big zoomed-out Titan under the huge hull. Now every flail chain draws a dark outline + bright gold
  core so it always reads (helps all flail classes).
- **Ascension cinematic (`game.js`):** crossing onto the Titan plane (detected via `p.plane` 0→1) now
  plays a ~1.7s "jump to lightspeed": **REV** (boosters spool — swelling engine bloom + converging
  speed lines) → **JUMP** (radial hyperspace streaks + a bright ship-lance rocketing off-heading +
  whiteout) → **ARRIVE** (whiteout bleeds off to reveal the Titan plane). Input is locked during
  REV+JUMP. Frame-rate-independent (shared `frameDt`, reused by the zoom easing).
- **Titan-plane briefing:** on arrival, a one-time panel explains the plane — only Titans fight here,
  hunt other apex Titans, slay the Dreadnought for a big bounty (watch its red laser sights), and
  dying drops you back to the arena as a Scout. Click to dismiss (game runs behind); cleared if you
  fall back to plane 0. Triggers only after `gameStarted`; re-arms on each fresh ascension.

**Files:** `src/game.js` only (render/UI). **Verified:** headless — chains now high-contrast;
warp phases (REV/JUMP/ARRIVE) + the briefing panel render as intended; sptest + finaltest green;
flail head counts unchanged (constellation still 4, dmg 6.5×). Sim untouched ⇒ MP authority unaffected;
the cinematic + guide are local-view only.

## 2026-07-11 — Flail rework (2/4 spiked maces) + Dreadnought turrets & telegraph + zoom easing
Three asks: the tier-4 flail was weak & dull, Binary Star's swords should revert to bigger spiked
balls, and the Dreadnought needed readable AI + obvious telegraphing turrets. Plus: ease the camera
zoom instead of snapping.

**Flail:**
- **Constellation (apex)** was delegating to `wreckingOrb` but the twin-gate excluded it ⇒ it played
  as a *single base mace at tier 4* (why it sucked). Now it swings **FOUR spiked maces**: generalised
  `wreckingOrb`'s head count (`HEADS = {twinmaul:2, binaryStar:2, constellation:4}`) + a per-class
  multiplier profile (`flailship.constellation.mace`). Full tier-4 scaling verified (dmgMult 6.5,
  rangeMult 2.0). Model gets **4 stern chain hardpoints** (`flailBody` `quad`).
- **Binary Star:** swords → **bigger spiked balls**. Removed the sword-draw branch; all flail heads
  now draw as spiked mace balls scaled by a per-class `headScale` (binaryStar 1.6, constellation 1.2).
  Config `binaryStar.blade` → `binaryStar.mace` (kept the stat multipliers; tether unchanged).
- Renamed all "sword/blade" copy across classes/visuals/blurbs to maces.

**Dreadnought:**
- **AI (was weird):** dedicated branch in `bots.js` — no farm/strafe/flee; it ponderously `swivel`s
  to face the nearest foe and creeps to a standoff, holding. Turrets fire on their own.
- **Turrets + telegraph:** `dreadnoughtGuns` rebuilt as **six independently-tracking turrets**
  (`dreadnought.turrets`: mounts/range/slew/cooldown/telegraphSec). Each slews its barrel onto the
  nearest foe, paints a **RED LASER SIGHT** for `telegraphSec` (0.9s dodge window) that brightens
  toward the shot, then fires one slow low-damage bolt down that line. Turret state (`ship.turrets`
  angle/tel/mount) drives the model, which draws obvious turret domes + barrels + the laser sights.
  Verified: 6 turrets track (531/600 frames on-target), telegraph cycles, ~18 staggered bolts/10s.

**Zoom easing:** `game.js` eases `camera.zoom` to its target with an exp time-constant
(`view.zoomSmoothTau` 0.07s, frame-rate-independent, dt-clamped) instead of snapping — a ~0.2s glide
on evolve/growth. First frame snaps so boot doesn't animate from 0.

**Files:** `src/weapons.js`, `src/ships.js`, `src/bots.js`, `src/game.js`, `src/sim.js`,
`data/config.js`, `data/classes.js`, `data/visuals.js`. **Verified:** headless — flail head counts
(1/2/2/4) + scaling; turret tracking/telegraph/fire; sptest + finaltest green; models render
(binaryStar 2 big balls, constellation 4 balls, dreadnought turrets + red sights). **Known limit:**
turret aim & the 4th+ mace only sync locally — remote MP dreadnoughts/constellations show a
simplified head/turret set. Not playtested live.

## 2026-07-11 — Titan-plane fx leak fix + the Dreadnought world boss
**Two asks:** (1) on the Titan plane you saw arena ships' *attacks* (beams/sparks/text) but not their
hulls; (2) add a scary Star-Destroyer dreadnought boss.

**FX plane leak (bug):** particles/beams/text are a single global pool drawn regardless of plane, so
an arena ship's rail beam/muzzle flash showed on the Titan plane even though its hull was correctly
plane-filtered. Fix: each fx entity is now **plane-stamped**. `Fx.stampPlane(p)` sets the attribution;
the sim stamps `s.plane` around each ship's update (`simShip`) and `pr.plane` around each projectile,
resetting to `-1` (environmental / all-planes) in between. `Fx.draw(R,α,lerp,viewPlane)` skips fx not
on the viewer's plane (−1 always shows). Sim calls go through a guarded `fxStamp` so older fx stubs
(test harnesses, `NULL_FX`) are unaffected. Screen shake was already `!isBot`-gated ⇒ no shake leak.

**Dreadnought (feature):** a colossal Star-Destroyer world boss that patrols the Titan plane.
- **Stats** (`config.dreadnought`): ≈200px radius (dwarfs a ≈62px apex), ≈14.7k HP (monstrously
  tanky), ≈30px/s crawl (`speed 0.16`), guns ≈15.6 dmg/bolt after scaling (deliberately weak).
- **Reward:** slaying it pays a flat **2500** XP+scrap bounty to the killer plus a mote shower from
  its 1200 carried scrap; **90s** respawn (an event, not fodder). Handled in `killShip`.
- **Model** (`ships.js` `dreadnought`): dark steel dagger hull, widening plate ribs, decks of lit
  windows, hunched command tower with a pulsing red bridge + twin sensor domes, blue engine banks,
  red edge-lights + underglow. The existing `pointDefense` addon (radius>34) gives it flak batteries.
- **Wiring:** off the evolution tree (no `parentId` ⇒ never an evolve option, not in `IMPLEMENTED`);
  `class` def + `visuals` row + `dreadnoughtGuns` weapon (auto-fires a slow broadside at same-plane
  foes). Seeded by `spawnDreadnought()` from `spawnTitans` (SP + MP server), `cfg.dreadnought.count`.

**Files:** `src/fx.js`, `src/sim.js`, `src/weapons.js`, `src/ships.js`, `src/game.js`,
`data/config.js`, `data/classes.js`, `data/visuals.js`. **Verified:** headless — boss spawns on
plane 1 at r=202/16.4k HP, dies to sustained fire paying +3100 XP with a 90s respawn, gun bolts do
15.6 vs a 995-HP apex; model renders as a menacing Star Destroyer dwarfing the fleet; sptest +
finaltest green. **Known limit:** in MP the fx replay path stamps environmental (−1), so an *ascended*
MP player could still see cross-plane fx — SP (the reported case) is fully fixed.

## 2026-07-11 — Titan plane: apexes ascend to their own playing field
**Why:** the tier-4 apexes are game-breakingly OP for the normal arena (that's by design — 4.2× size,
6.5× dmg). Rather than nerf them, the user wanted them to "exist on another playing field." So evolving
to an apex now **ascends** you out of the normal arena onto a **Titan plane** — dreadnoughts fight
dreadnoughts, and small ships never see or fight a Titan.
- **Model:** every ship carries `plane` (0 = arena, 1 = Titan). Asteroids/pulsar/scrap stay **shared
  environment** (a Titan farming an invisible rock is astronomically rare in a 6000² arena — not worth
  a second world). Only **ship-vs-ship combat + ship/projectile rendering + ladders** partition by plane.
- **Combat partition:** `enemiesOf` and the bot target loop filter same-plane; projectile-vs-ship
  collision (+ orb block, thrown-rock-as-target) checks `pr.plane` (tagged from the shooter at the two
  `projectiles.push` sites); leader crown is computed **per plane**.
- **Ascension:** `switchClass` to a tier-4 class sets `plane = 1` + an "ASCENDED → THE TITAN PLANE"
  cue + shake + fresh spawn-protection. **Death drops you back:** player respawn resets `plane = 0`
  (a fallen Titan starts over in the normal arena as a Scout). Bots keep their class+plane on respawn.
- **Seeding:** `world.spawnTitans(n)` seeds `cfg.bots.titanCount` (5) apex bots on plane 1 so an
  ascending player finds a fight already underway. Called in SP setup (game.js) + on the MP server.
- **View:** game.js render/leaderboard/minimap filter by the local player's plane (`myPlane`).
- **MP:** `plane` flows in the snapshot (`pl` on full + far ship packs, and on projectiles); mpclient
  hydrates it onto remotes and the local ship, so ascension syncs. Default 0 ⇒ existing MP unchanged.

**Files:** `src/sim.js`, `src/weapons.js`, `src/bots.js`, `src/game.js`, `src/mpclient.js`,
`mpserver.js`, `data/config.js`. **New config:** `bots.titanCount`.
**Verified:** headless run — 5 apex bots seed on plane 1, Starbreak→Zenith flips the player to plane 1,
600 steps of two planes fighting run finite, crown is per-plane; sptest + finaltest green.
**Known limits:** shared farm means a small-ship player *could* rarely see a rock break "on its own"
(invisible Titan) — unnoticeable in practice. Not playtested live. 3 apex verbs still delegate to
parents (Juggernaut/Cataclysm/Constellation).

## 2026-07-06 — SERVER-CLOCK interpolation ("the jitteriness is unplayable")
The remaining tunnel jitter was a real interp defect: the client timed playback off packet
ARRIVAL times, and proxies (HTTP/2/QUIC edges) deliver our 60Hz frames in CLUMPS — two frames
1ms apart that represent 16.7ms of sim time. Interpolating against arrival spacing plays motion
back fast-slow-fast: textbook jitter, invisible on LAN where delivery is even.
- Client now estimates the CLOCK OFFSET (arrival − snapshot `tm`; min-tracked = fastest observed
  path, slow upward creep so a genuinely slower route re-converges) and interpolates on the
  SERVER timeline, where snapshots are perfectly evenly spaced — delivery clumping stops
  mattering entirely. `bracket()` walks `snap.tm`, not recv times.
- Jitter is now measured as LATENESS above the clock-offset floor (semantically right) and sizes
  the interp buffer: interpMs = base + 2.5×latenessEMA + 8, cap 200ms.
- Own-ship DEAD ZONE now scales with speed (26 + 0.12·|v|): phantom error ≈ v·Δlatency, so a
  392px/s cruise needs ~73px of tolerance for the same path jitter that 26px covers at rest —
  the fixed zone was getting punched through at speed, re-introducing corrections mid-flight.
predtest 9/9 (desync case updated to clear the scaled zone); live-browser check clean vs the
server. HONEST LIMIT: quick tunnels are web proxies, not game transport — with these fixes they
should be genuinely playable, but a direct connection (LAN / port-forward / VPS) will always
beat them; that's transport physics, not code.

---

## 2026-07-06 — Prediction dead zone + reconnect grace ("bounces" / "I randomly disappeared")
Two tunnel-playtest reports, two root causes:
- *"Ship moves side to side"* — reconciliation was correcting toward PATH-LATENCY PHANTOMS: over
  a jittery route the server's acked position wobbles ±v·Δlatency around the truth, and we
  corrected toward every one, 60×/s. New DEAD ZONE (26px): sub-threshold errors are latency
  lead, not desync — 2% bleed only (drift-proof, invisible). Real desyncs (knockback/stun/
  collision) blow past it and correct as before; impulse adoption now rides only real
  corrections. predtest 9/9 incl. new jitter-immunity case (render moved 0.00px under 30
  phantom ±14px corrections).
- *"I randomly disappeared"* — quick-tunnel WebSockets BLIP. On a drop the client fell back to
  stepping the LOCAL SP world (whole universe silently swapped), then reconnected as a brand-new
  Scout (run lost). Fixes: (1) game.js mode-branches on MP.AUTH, not connected — a blip now
  FREEZES the last server view with a "◌ RECONNECTING — world paused" HUD line and never touches
  the local world; (2) RECONNECT GRACE server-side: each client sends a per-page-load session
  token in `join`; on disconnect the ship parks for 30s keyed by that token, and a rejoin
  reattaches the SAME ship — level/class/scrap intact. Untokened probes still clean up instantly.
  Ship creation moved from socket-open to join-time (welcome now follows join).
  Verified: tools/reattachtest.js — level-5 ship survives a drop+rejoin with the same id; a
  fresh token gets a new ship. wsprobe unchanged-green.

---

## 2026-07-06 — Tunnel latency pass ("still so laggy"): Nagle, bursts, adaptive buffer
Three real latency sources beyond the tunnel's inherent RTT, all fixed (this PC session):
- *NAGLE (the big one):* the WS upgrade socket never called `setNoDelay(true)` — the OS buffered
  our small 60Hz frames up to ~40-200ms waiting to coalesce. Invisible on loopback/LAN, brutal on
  any real path. Classic game-server bug; also benefits port-forward hosting.
- *Object-frame BURSTS:* the every-6th-snapshot full object frame (5-10KB) head-of-line-blocked
  the frames behind it. Objects now ship as per-snapshot SLICES (id % OBJ_SLICES === snapN %
  OBJ_SLICES) — same per-object refresh rate, bytes spread evenly. The client merges slices by id
  into objView at INGEST and prunes stale ids per-slice (destroyed rocks still vanish within one
  cycle). Measured: max snapshot 2.99KB vs ~10KB bursts before; avg 2.2KB @60Hz ≈ 1.0Mbps.
- *ADAPTIVE interp buffer:* interpMs = base (2.5 snapshot intervals) + 3× jitter-EMA of arrival
  gaps, capped 160ms — rough paths get a deeper buffer instead of rubber-banding; LAN stays at
  the 40ms base. Also reverted public mode 30Hz→60Hz (that "bandwidth saving" added ~60ms of real
  input-feedback latency — a bad trade post-culling; `PULSAR_SNAP_HZ` overrides if ever needed).
What remains on a tunnel is genuine route RTT (~20-60ms) — felt as fire-feedback delay only;
own movement stays instant via prediction. Direct hosting (LAN URL / router port-forward to
`http://<public-ip>:8080`) skips even that. Next lever if needed: binary/delta encoding.
Verified: wsprobe (now prints max snapshot size) + headless Chrome running the live MP client
against the server with the slice/jitter code — zero errors.

---

## 2026-07-11 — TIER 4: six Titan-class apexes (one per final, lvl 30)
**What changed:** added a whole new evolution tier — one apex per tier-3 final, gated at level 30
(cost 320), rank-4 scaling (`sizeByRank … 4.2`, dmg 6.5×, range 2.0× — the true dreadnoughts).
Directions came from the user (6-per-final; Zenith = spinal railgun + autoaim point-defense; verbs
locked per family).
- **Plumbing:** `economy.levelApex 30` + `evolutionCosts.apex 320`; `EVO_GATES`/`EVO_COSTS` gained a
  4th entry; `evolveOptions` cap lifted (`t >= 3` → `t >= 4`); scaling arrays extended to rank 4;
  `IMPLEMENTED`/`FAMILY`/`EVOLVE_BLURB` + 6; class rows in `classes.js`; visuals rows + models.
- **The six** (parent → apex): Starbreak→**Zenith**, Supernova→**Prism**, Worldsplitter→**Juggernaut**,
  Starfall→**Cataclysm**, Event Horizon→**Devourer**, Binary Star→**Constellation**. Distinct
  apex-scale models (family body + a signature flourish: Zenith wing turrets, Prism emitters,
  Devourer void-core + inward aura, etc.).
- **Verbs implemented now:** Zenith **autoaim point-defense** batteries (chip nearest enemy on a
  cooldown); Prism **auto-tracking sub-beams** (fan onto the nearest N foes while the beam ramps);
  Devourer **black-hole field** (pull enemies to a lethal core). Config: `railship.zenith`,
  `helion.prism`, `gravitor.devourer`.
- **Verbs still TODO (currently delegate to the parent weapon, so they play as scaled-up finals):**
  Juggernaut overrun/plow-through, Cataclysm orbital meteor barrage, Constellation blade-web/net.
  Marked with TODO in `weapons.js` + cues.

**Files:** `data/config.js`, `data/classes.js`, `data/visuals.js`, `src/sim.js`, `src/weapons.js`,
`src/ships.js`. **Verified:** every final evolves to its apex at lvl 30; all 6 weapons run finite;
all 6 models render; sptest/finaltest green. Sim-affecting ⇒ MP authority needs this build.
**Not playtested live** — a big new power tier; numbers are a first cut.

---

## 2026-07-11 — Fleet resprite to match the user's concept-art sheets (all four families)
**What changed:** the user added painterly concept-art sheets (`RailSprites.png`, `HammerheadSprite.png`,
`GravandFlailSprites.png`) — sleek white hulls with the family accent colours. Re-drew every family's
procedural model to match those designs in the game's flat-neon vector style, keeping each family's
charge/ability animations. Added a shared `fighterHull` helper (white body, swept accent-edged
wings, rear thrusters, canopy, running lights) so the three fighter families share a base.
- **Rail** (cyan): sleek fighter, swept wings, thin forward RAIL BARREL that telescopes out with
  charge, wrapped by a colour-shifting warm-up **helix** (blue→cyan→white→gold overcharge) + muzzle
  bloom. Maw classes (Star Piercer/Starbreak) carry TWIN rails + canard fins. (Replaces the previous
  Halcyon split-hull — the user's art supersedes it.)
- **Hammer** (orange): armored wedge + ram prow, now with the concept art's **twin forward cannons**
  on the upper/lower flanks. Ram wind-up (boost pods + molten edge) and Brace shield unchanged.
- **Gravitor** (purple): `gravShip` → sleek fighter with the big glowing gravity-core RING at the
  FRONT (was cradled out on prongs); grows + gains containment rings/vanes up the control branch,
  launch rail on the artillery branch. Core still brightens with loaded rocks.
- **Flail** (gold): `flailBody` → sleek gold fighter with chain hardpoints at the STERN where the
  mace/blade heads feed out (heads/swords still drawn in `game.js`); twin classes get two + the
  Binary Star tether manifold.

**Files:** `src/ships.js` (fighterHull + railBody/hammerBody/gravShip/flailBody), `data/visuals.js`.
Render-only. Verified every family + tier via headless renders against the concept sheets.
**Note:** flat-neon translation of painterly art — captures silhouette + signature + accent + the
animations, not the painted panel shading (that's the game's house style).

---

## 2026-07-10 — Rail line resprite: Halcyon split-hull + colour-shifting warm-up helix  *(superseded by the concept-art resprite above)*
**What changed:** rebuilt `railBody` (all rail classes) from the clamshell gun-pod into a sleek
**Halcyon-style starliner split down the middle**, with a **huge central cannon** poking out the
bow. The charge animation is unchanged (barrel telescopes out, folds shut on the fire cooldown),
but the two long hull halves now **split apart laterally** to reveal the cannon, and the capacitor
rings are replaced by a **double-HELIX coil** wrapping the barrel that "warms up" (brightens +
amplitude grows) and **shifts colour by charge level**: cold blue → cyan → white-hot at full →
gold at overcharge (`helixColor` ramp, driven by `chRaw` so overcharge reads). Breech heat-glow
replaces the vent slats. Muzzle bloom kept. Helion lens / Supernova corona / Starbreak rift-blades
still layer on top. Render-only.

**Files:** `src/ships.js` (`railBody`), `data/visuals.js` (cues). Verified across the whole rail
line at charge 0→1.25 (helix goes gold at overcharge; halves split; cannon telescopes).

**Open:** Zenith (tier-4 rail) redesign — user wants it to STAY the railgun + add autoaim
light-damage side cannons. Asking for the details before speccing/building.

---

## 2026-07-10 — Grab-bag pass: zoom-UI fix, VFX escalation, melee/bot tuning, juice
Worked the "what else needs work" list.
- **Zoom-UI readability (regression fix):** enemy name tags, HP bars (`drawEnemyTag`) and floating
  combat text (`fx.js`) drew in world space and shrank with the new camera zoom. Both now
  counter-scale by `1/zoom` so they stay a constant readable screen size while anchored above the
  (variably-sized) hull.
- **VFX escalation (Star Wars-ish):** big hulls (r>34) now bristle with **point-defense batteries**
  that flicker muzzle-flashes + short tracers (`ships.js pointDefense`, more guns on bigger ships),
  plus a wide size-scaled **power aura** in `shipBloom` so dreadnoughts loom.
- **Hammer proportions:** narrowed span + extended prow across the line so hammers read LONG, not
  wide (was the last family still wider-than-long).
- **MP prediction near the black hole:** predictor now applies the pulsar gravity pull (matches
  `sim.pulsarGravity`) so big/slow ships stop rubber-banding by the core.
- **Bots use the new reach:** bot fire/preferred range scale with `rangeMult`, so big hulls
  actually fight at their longer range.
- **Melee vs ranged nudge:** maneuver floor `minMult 0.62→0.70` so big brawlers can still close on
  kiters. Conservative — real melee/ranged balance still needs live playtest.
- **Gravitor juice:** thrown boulders that hit a ship now land heavy — 4× knockback, debris burst,
  screen shake. (A deeper Gravitor enjoyability rework is a DESIGN question — deliberately NOT
  guessed here to avoid another misread; needs your direction.)
- **Not-bugs confirmed:** the reconnect/reattach feature actually WORKS (a fresh server passes
  `reattachtest`; the earlier "failure" was a stale server on :8080). Leader/dreadnought scale is
  reachable (~2440 XP ≈ a few minutes). The earlier weapon-range scaling (a misread of "range") is
  left in as an on-theme keeper — say the word to revert.

**Files:** `src/game.js`, `src/fx.js`, `src/ships.js`, `src/sim.js`, `src/mpclient.js`,
`src/bots.js`, `data/config.js`. Render + light sim tuning. sptest/finaltest/predtest/edgetest/
scaletest all green.

---

## 2026-07-10 — Starbreak siege anchor: slows to a near standstill at full charge
**What changed:** Starbreak (tier-3 siege maw) now PLANTS itself as it charges — top speed tapers
to a near-standstill at full charge, turning it into a stationary siege platform (big commitment,
big payoff; and a fat target for counterplay). Ramps as `speedMult = 1 - (1 - anchor)·charge²`
(`railship.mawRail.starbreakAnchorSpeedMult 0.05`), so `charge²` keeps it mobile early in the
1.9s wind-up, then anchors it as the shot completes. Base rail + Star Piercer keep the old
`movementWhileCharging` curve — this is Starbreak-only.

**Files:** `data/config.js`, `src/sim.js` (charging-speed branch), `src/mpclient.js` (predictor
match — keeps big-ship prediction in sync). Verified: hold-fire + full thrust → ~200px/s at half
charge, ~15px/s at full (near standstill); finaltest/sptest/predtest green.

---

## 2026-07-10 — Camera zooms OUT with hull size (a dreadnought never fills the screen)
**Why:** with the new dreadnought scaling a big ship took up most of the screen — you couldn't see
the battle. Now the VIEW zooms out as your hull grows, so you always see the fight around you, and
bigger ships get a much larger view. (This is the "view range" the range request actually meant;
the earlier commit's weapon-range scaling was a misread — kept for now, easy to revert.)

**How:** the world pass now draws under a canvas transform (`beginFrame`: centre → `camera.zoom`
→ camera), so positions AND sizes scale by zoom for free; `sx/sy` became identity (world coords);
`endWorld()` resets to screen space for the HUD. `drawGrid` rewritten to world extents
(`viewW/(2·zoom)`) with hairline width held at `1/zoom`; `onScreen` culls against the zoomed
extent; the onboarding highlight projects to screen itself (it runs post-`endWorld`).
- `config.view {baseZoom 0.85, shipTargetPx 46, minZoom 0.32}`; per frame
  `zoom = clamp(min(baseZoom, shipTargetPx / yourRadius), minZoom, baseZoom)`.
- So a fighter (r16) sees ~0.85; a tier-3 (r47) ~0.85→ still capped; a leader dreadnought (r95)
  ~0.48 — a much wider battlefield. Relative scale is honest: a fighter sees a dreadnought as
  huge; a dreadnought sees fighters as ants.

**Files:** `data/config.js`, `src/render.js`, `src/game.js`. Render-only.
**Verified:** real render.js pipeline runs a full frame with no error (headless); a fighter-POV vs
dreadnought-POV render shows the zoom-out working with honest relative scale; sim tests green.

---

## 2026-07-10 — DREADNOUGHT SCALING: ships + hitboxes grow hard with progression
**Why:** whiffing shots is a barrier to playing on; making ships (and their HITBOXES) grow as you
evolve means you land more as you invest, AND unlocks the galactic-war fantasy — a maxed ship should
DWARF a fresh one (Revenge-of-the-Sith: dreadnoughts slug it out while fighters dart between them).

**New `config.scaling` block** (replaces `economy.tierGrowth`). Rank = starter 0 / base class 1 /
tier-2 2 / tier-3 3, plus a leader "dominance" bump:
- `sizeByRank [1, 1.5, 2.2, 3.1]` — radius == hitbox == drawn hull (× per-family sizeMult).
- `hpByRank [1, 2, 3.6, 6]` — tankier with size but sub-area (still killable by focused fire).
- `dmgByRank [1, 1.8, 3, 4.8]` — bigger guns hit harder (via new `s.dmgMult`, applied in
  `damageShip` to ALL ship damage — weapons, rams, specials).
- `rangeByRank [1, 1.2, 1.45, 1.7]` — bigger weapons REACH further (via new `s.rangeMult`):
  rail/helion/maw beam range, hammer lunge distance, flail chain reach + swing radius, gravitor
  field radius. A tier-3 rail reaches ~2210px (leader ~2870) vs the starter's 1300.
- `leaderSizeMult 1.5 / leaderHpMult 1.6 / leaderDmgMult 1.4` — a marked leader becomes a true
  dreadnought.
- `maneuver {fullSizeRadius 62, minMult 0.62}` — top-speed + accel taper with hull size, so capital
  ships LUMBER and fighters dance around them. Derived from radius (`maneuverFor`) so it's a pure
  function of a synced value ⇒ single-player and the MP predictor agree with no new sync.

**Measured (real radii):** starter r16 → base r22 → tier-2 r33 → tier-3 r47 → tier-3 leader ~r71
(worldsplitter leader ~r95). Dwarf ratio ~4× radius (~16× area); intra-rank TTK proxy stays ~1.06
(same-tier fights stay fair); a dreadnought needs ~3 hits to delete a fighter while a fighter needs
~70 to grind a dreadnought (David-vs-Goliath by design — evolve or dodge, don't trade).

**Files:** `data/config.js`, `src/sim.js` (`applyClassStats` + `maneuverFor` + `damageShip`),
`src/weapons.js` (per-family range via `s.rangeMult`), `src/mpclient.js` (predictor maneuver).
Models already draw in radius units, so they scale for free.

**Verified:** new `scaletest.js` (dwarf ratio, monotonic growth, TTK sanity, asymmetry, lumber) +
`sptest`/`finaltest`/`predtest`/`edgetest` green (finaltest updated: finals now over-kill fragile
dummies, so those tests use durable targets + account for `dmgMult`). Finals dueltest: all fights
resolve (≤2 timeouts).

**Known / follow-ups (NOT done):** ① Balance is a first cut — **needs human playtest**; the maneuver
penalty slightly favors ranged over melee finals (melee closes slower). ② VFX escalation (bigger =
"Star Wars" bloom/engine trails/turret fire) is only partly there (models scale; no new tier VFX
yet). ③ A camera that zooms out around big ships would sell the battle scale — deferred. ④ Deeper
mechanical changes the brief invited (capital-ship subsystems, point-defense, etc.) are open.

---

## 2026-07-10 — Fleet-wide capital-ship rollout: all families are crewed warships now
**What changed:** Applied the long-warship style across every family via a shared `capitalHull`
helper (`src/ships.js`) — a detailed hull with armor under-plate, keel + transverse plating, rows
of lit crew windows, dorsal spine, bridge + canopy, stern engine-nacelle cluster, and port/
starboard nav lights. Grows LONGER (not wider) and busier with tier.
- **Gravitor** (full rebuild): `crescentHull` retired → `gravShip` = long carrier that cradles the
  gravity core out ahead of the bow in containment prongs. Artillery branch adds a launch rail;
  control branch (singularity/eventHorizon) wraps a void core in counter-rotating rings + vanes.
- **Flail** (rebuild): `flailBody` → long salvage warship, winch drivetrain forward; Twinmaul gets
  twin counter-rotating drums, Binary Star bridges them with the tether manifold. Swords still
  drawn in `game.js`.
- **Rail** (in-style pass): kept the refined clamshell gun + fold animation; grew the little "tail
  craft" into a full rear crew hull (windows, spine, bridge canopy, twin nacelles, nav lights).
- **Hammer** (light touch, kept the design you liked): added crew windows + nav lights for fleet
  consistency.
Per-tier scale comes from new opts (`nacelles`/`windows`/`tier`/`armor`) plus the existing
`tierGrowth` radius. Render-only; no sim/config/hitbox change. Verified every family + tier via
headless renders (all draw without error).

**Still open:** the hitbox-honesty call (detailed hulls read larger than collision `r`; defaulted
to decorative). Hammer is the one family still noticeably wide (its ram identity) — could be
stretched longer if wanted.

---

## 2026-07-10 — Base ship reborn as a corvette + direction: LONGER, not wider (galactic-war scale)
**Direction locked:** ships should grow in LENGTH (capital-ship / dreadnought proportions), not
width, and read like crewed warships ("thousands aboard") — not the Asteroids arrowhead. Hammerhead
implementation is kept; it'll be re-proportioned longer as the style rolls out.

**What changed:** rebuilt the starter `dart` model (`src/ships.js`) into a small **corvette** — the
smallest real warship in the fleet, the seed the capital ships grow from:
- Slender hull (length ≫ beam, ~3.1r long) with a dark armor under-plate, transverse plating, and
  a keel line.
- Bridge superstructure block + canopy, dorsal spine, stern twin-nacelle engine cluster, forward
  sensor mast, and port/starboard (red/green) nav lights.
- Two rows of lit **windows** down the hull — the "decks full of crew" read.
Uses the shared detailing toolkit (`plate`/`line`/`light`/`canopy`/`nacelle`). Render-only.

**Next:** re-proportion the class families longer (Gravitor full rebuild; Rail/Flail in-style pass),
scaling each tier into a bigger, busier capital ship.

---

## 2026-07-10 — Detailed ship models: capital-ship overhaul (Hammerhead = flagship template)
**What changed:** Start of a big visual pass — ships become detailed "big spaceships" (layered
hulls, wings, engine nacelles, cockpits, greebling) that grow bigger + more complex each tier,
with ability animations. Built a shared **detailing toolkit** in `src/ships.js` (`plate`, `line`,
`light` running-lights, `canopy` cockpit, `nacelle` engine pod) and rebuilt the **Hammerhead
family** as the proof-of-style:
- Armored fuselage (base plate + shaped body + dorsal spine + panel lines), cockpit canopy, swept
  delta wings with bright leading edges + wingtip lights, clustered engine nacelles with hot
  throats, reinforcement struts into the ram prow.
- **Tier ramp** via new `hammerBody` opts `{nacelles, wings, armor, front, span, teeth, ridge}`:
  hammerhead (2 nacelles / 1 wing / armor 1) → maulbreaker (teeth prow, armor 2) → worldsplitter
  (3 nacelles / +canard wings / armor 3 / cleaving ridge). Combined with `tierGrowth` radius, each
  upgrade is visibly larger + busier.
- **Ability animations:** ram wind-up still slides the boost pods out + heats the prow edge molten
  (now with an additive glow); the **Brace** ability (`braceTimer`) now draws a hardened hex-shield
  shimmer over the hull.

**Files touched:** `src/ships.js` only (render-only; no sim/config/hitbox change).

**OPEN DECISIONS before rolling this across the other 3 families:**
1. **Hitbox honesty:** the detailed hull (wings ~1.5r, prow ~1.5r) now reads noticeably larger than
   the collision radius `r`. Options: keep it decorative (wings are cosmetic overhang), or grow the
   hitbox to match (a balance change). Defaulted to decorative — needs a call.
2. Rail is already "super refined" and Flail just got swords, so those get an *adaptation* (more
   greebles/wings/lights in-style), not a teardown; Gravitor gets the full treatment.

**How to test:** run the app, play Hammerhead line; hold ram to see pods deploy + prow go molten;
trigger Brace for the shield shimmer. Verify each evolution looks bigger + more complex.

---

## 2026-07-10 — Restore and enforce the 60 FPS presentation budget
**What changed:** Performance is now an explicit acceptance constraint. The fixed simulation remains 60Hz; rendering is deliberately capped at 60 FPS instead of attempting up to 360 FPS, which could waste 2–6× the frame budget on high-refresh displays after the UI pass.

- `sim.maxRenderFps` is now 60.
- Added `sim.renderDprCap: 1.25`; `src/render.js` reads it instead of hard-coding 1.5. This cuts the worst-case canvas pixel workload by roughly 31% while retaining light supersampling.
- The render scheduler now carries fractional timing remainder. A naive 60 FPS cap on a 144Hz display otherwise quantizes to 48 FPS because each render waits for three 6.94ms refresh intervals.
- The collapsible DEV tab now displays the rolling rendered FPS and turns red below 55, keeping future visual changes accountable.

**Files touched:** `data/config.js`, `src/render.js`, `src/game.js`.
**How to test:** play with DEV visible and confirm its FPS value holds near the display's 60 FPS target during farming, combat, evolution overlays, and pulsar effects. Simulation tests remain independent of render cadence.
**Known limit:** automated local-browser measurement was unavailable in this session because localhost browser access was blocked; the code-level safeguards and tests were applied, but the user should confirm the displayed live FPS on their hardware.

---

## 2026-07-10 — Hammerhead ram consistency: honest reach + swept collision
**What changed:** Kept Hammerhead's existing cursor snap, trajectory commitment, damage, cooldown, and travel distance. Increased only the active contact forgiveness: base Hammerhead reach is now `1.12×` hull radius and Maulbreaker/Worldsplitter `1.50×` (was `1.0×` / `1.4×`). The procedural hammer nose already visually covers this small extension.

**Collision correctness:** active rams now test a swept circle from the ship's previous fixed-tick position to its current position. A full lunge moves roughly 25px per 60Hz tick; endpoint-only collision could pass across a target without registering. The sweep fixes that tunneling without accepting genuinely distant near-misses.

**Files touched:** `data/config.js`, `src/weapons.js`, `tools/edgetest.js`.
**How to test:** `node tools/edgetest.js` includes a regression where the target lies between tick endpoints. Also test glancing live rams with Hammerhead and its evolved forms.
**Known limits:** this deliberately does not add steering, Brake Turn, extra damage, or any other Hammerhead feel change.

---

## 2026-07-10 — UI visual polish pass
**What changed:** Rebuilt the presentation layer into a cohesive sci-fi instrument-panel style without changing simulation or gameplay.

- **Title screen (`index.html`):** quieter gridded backdrop, tighter logo/input composition, glass entry panel, and properly dark cosmetic cards. The previous selector allowed the bright global PLAY-button style to overpower every skin card; skin-specific rules now win, leaving PLAY as the sole bright call to action.
- **Status HUD (`src/game.js`):** framed glass panel with clear class/level/scrap hierarchy and labeled HULL / EVOLUTION / HEAT-or-RAM bars. Multiplayer status is separated into a compact online indicator.
- **Ability dock:** bottom-center LMB / ability / special modules show key, action, and READY/cooldown state. Scout has correct POP GUN / THRUST labels; class-specific actions derive from the existing data keys.
- **Evolution overlay:** responsive card grid (2×2 for the four base families, side-by-side for branch choices), larger animated hull previews, role blurbs, affordability state, and clearer cost hierarchy.
- **Right rail:** leaderboard is a framed TOP PILOTS panel; kill-feed events receive compact dark backplates; dev controls remain enabled but live in a collapsible DEV drawer.
- **Minimap:** larger framed tactical display with crosshairs, corner brackets, and a labeled pulsar-center header.
- **Config:** new presentation-only `ui` block owns panel radius and primary HUD dimensions.

**How to test:** run `node mpserver.js`, open `http://localhost:8080`, inspect the title screen, then PLAY. Use the DEV level button to trigger the level-3 evolution grid. Confirm the bottom action dock matches the current class, DEV collapses/expands, and the minimap/leaderboard remain clear at 1280×720.

**Verified:** browser visual QA at 1280×720 on title and live match; no console warnings/errors. `node --check src/game.js`, `tools/sptest.js`, `tools/finaltest.js`, and `git diff --check` pass.

**Known limit:** HUD dimensions target desktop play; a dedicated compact/mobile layout remains deferred.

---

## 2026-07-09 — First balance pass: close-range access, artillery volume, siege coverage
**What changed:** Applied the first measured balance pass after repeated mirrored bot-duel samples. All changed gameplay numbers remain in `data/config.js`.

- **Flail / Binary Star:** `spinUpSec` 2.1→1.6 and `maxReach` 340→390 so the family can threaten before long range permanently resets spacing. Binary Star tether is more forgiving/active: half-width 12→16, damage 9→10, rehit 0.4→0.35.
- **Worldsplitter:** lunge duration 0.40→0.48 and charge steering 0.30→0.42. This targets connection reliability only; impact damage remains unchanged.
- **Starfall:** now holds five rocks, throws two, and has a 0.15s launch cadence (was 9 / 3 / zero cooldown), matching its dodgeable-artillery role.
- **Starbreak:** rift damage 55→45. The siege blast remains the payoff; missed-line coverage is less punishing.
- **Bot correctness:** Gravitor bots now use their own data-defined rock capacity instead of a hidden hard-coded cap of nine.
- **Telemetry:** `PULSAR.createWorld` now exposes non-networked resolved ship damage + hit counts. `tools/dueltest.js` reports average damage/hits for every pairing.
- **Combat correction:** receiving ship damage now resets the target's existing regeneration delay. This was required before interpreting telemetry: prior duels could record hundreds of beam damage without a kill because an idle target regenerated through the pressure.

**How to test:** run `node tools/dueltest.js` for final forms and `node tools/dueltest.js railship hammerhead gravitor flailship` for bases. Confirm all conclusions through human play before another tuning pass; bot duels are a regression signal, not a replacement for skilled PvP.

---

## 2026-07-09 — Balance controls retained + duel sampler
**What changed:** Kept the in-match DEV panel enabled for the balance build (`onboarding.showDevPanel: true`), preserving the instant level-up button and bot toggle. Added `tools/dueltest.js`, a headless bot-versus-bot sampler for the four base forms, six tier-2 forms, or six finals. It puts both ships into the same shared-rock setup, removes spawn protection, then reports first-kill results over 12 mirrored-start rounds per pairing.

**How to test:** start `node mpserver.js`; the top-right `ADMIN ▸ +1 LVL [L]` and `BOTS` controls are visible. Run `node tools/dueltest.js` for finals, or pass class ids, for example `node tools/dueltest.js railship hammerhead gravitor flailship`.

**Known limits:** duel output is a bot-pilot regression signal, not a substitute for skilled human PvP. It is particularly useful for spotting systemic failures (for example, a class losing every ranged matchup), but tuning should be confirmed through live manual play before numbers ship.

---

## 2026-07-09 — First-minute clarity & farming readability pass
**What changed:** Improved the opening play loop without introducing scripted objectives or player-private loot. Fresh lives now sample existing calm-edge spawn points and choose one with nearby shared farmables; a local, temporary guide highlights the nearest on-screen neutral and says `BREAK ROCKS → COLLECT SCRAP` until the first collection (or 12 seconds). The guide is render-only and never changes simulation state.

**Files touched:** `data/config.js`, `src/sim.js`, `src/game.js`.
- **Spawn-to-action:** `player.spawnFarmSearch` tunes candidate count, target radius, and minimum nearby shared objects. `sim.js` scores real world objects after field population, so this is authoritative and works identically in single-player and multiplayer.
- **Farming feedback:** neutral hits emit a denser directed spark burst; breaks emit a larger burst. Damaged neutral objects now show a brighter health arc and visible surface fracture. All new VFX counts remain in `config.fx`.
- **Navigation & UI:** the pulsar marker and local player arrow are clearer on a slightly larger minimap. The normal HUD no longer shows FPS; the developer admin panel is gated by `onboarding.showDevPanel` (default `false`).

**How to test:** run `node mpserver.js`, open `http://localhost:8080`, press PLAY. A farmable should be nearby and briefly marked; break it and collect a mote to dismiss the guide. Verify the pulsar is obvious on the minimap, the DEV controls are absent, and damaged rocks visibly crack.

**Known limits / TODO hooks:** this is presentation and spawn selection only; sustained combat/balance still needs human two-browser playtest sign-off for Phase 5. The local guide does not create or reserve resources, by design.

---

## 2026-07-06 — Pulsar is now a BLACK HOLE: pulls ships in, lethal core, relativistic scrap jets
**Why:** iterate on the pulsar again — it should read as a black hole, PULL ships toward it, KILL
anything that touches the singularity, and shoot scrap out in intermittent relativistic JETS
(replacing the radial firehose from the entry below, which this supersedes).

**Gameplay (`src/sim.js`, `data/config.js`):** new `arena.pulsar` block.
- **Gravity well** (`pulsarGravity`, per ship after it moves): a direct positional pull toward the
  core, `pullMaxSpeed·f²` where `f = 1 - d/pullRadius`. Peak 340 px/s > baseSpeed 280 ⇒ escapable
  at range, inescapable near the core.
- **Lethal event horizon:** `d < lethalRadius (55)` ⇒ `killShip(s, null)` (no killer, normal drop).
- **Relativistic jets** (`pulsarStep`): every `jetIntervalSec (6.5)`, a bipolar jet ejects
  `jetMotes (16)` at `jetSpeed (950)` in a narrow cone along an axis that = `time·drift`
  (deterministic ⇒ MP-safe). Jet motes get low drag (`pickups.jetDrag 0.25`) so they streak
  ~1700px out before fading — collect them along the stream, away from the deadly core.
- `ejectMotes` gained a directed `{angle, spread, jet}` mode. Old radial `pulsarPulse` +
  `economy.pulsar*` / `pickups.pulsarMote*` / `arena.pulsarPulseIntervalSec` removed.

**Bots (`src/bots.js`):** idle bots now drift to a SAFE RING (0.85·pullRadius), not dead center;
plus a danger-band avoidance push (inside `dangerRadius 340`) so they don't get dragged in.
Smoke-tested: 0 core-deaths across 6 bots over 30s.

**Visual (`src/render.js`, `src/game.js` minimap):** `drawPulsar` rebuilt as a black hole — dark
event-horizon core, thin photon ring, faint accretion swirl, and two fading JET beams along the
axis on the beat. The grid warp (drawGrid) stays as the visible gravity well. Minimap marker is
now a dark core + bright ring. All jet timing/axis derive from `time`, matching the sim.

**Verified:** headless mechanics test (ship dies on horizon; passive ship pulled 300→99; thrusting
escapes at range; jet fires 16 motes that streak 1678px; bots don't feed the hole; all finite) +
existing `tools/sptest.js` still green. **MP:** `pt`/`tm` already synced; jet motes stream from the
server. Client prediction doesn't model the pull, so expect minor snap near the core in MP —
acceptable for now, note for later. Numbers are all tunable in `arena.pulsar`.

---

## 2026-07-06 — The Pulsar becomes a SINGULARITY (warps space) + a scrap firehose  *(superseded by the black-hole entry above)*
**Why:** the pulsar was still the Phase-0 placeholder (two glows + a white dot) and ejected only
32 scrap/pulse — "no real incentive to be there." Goal: make it LOOK like a singularity warping
space, and make the center the richest, most contested spot.

**Visual (`src/render.js`):**
- `drawPulsar` rebuilt: dark event-horizon core (radial-gradient black, occludes the grid),
  a rotating multi-arc accretion disk, a hot photon ring, a breathing halo, and a pulse
  shockwave ring that flares on the eject beat. All additive except the core.
- `drawGrid(time)` now WARPS the grid near the pulsar: `warpPoint` drags each grid vertex toward
  the core and swirls it (frame-drag), vanishing at the influence edge (radius = 4.4×pulsarRadius)
  so there's no seam. Lines are subdivided only when the warp is on-screen; otherwise the fast
  straight grid is drawn. `game.js` passes `state.time` into `drawGrid`.

**Economy (`data/config.js`, `src/sim.js`):** `pulsarMotesPerPulse` 8→18 and `pulsarScrapPerMote`
4→5 — 90 scrap/pulse (~22/s at the 4s cadence, was 8/s). Motes still damp-pool near the core, so
you must actually HOLD the center to collect. Pulse FX burst enlarged (40 particles) to sell the
eruption.

**Files touched:** `src/render.js`, `src/game.js`, `src/sim.js`, `data/config.js`, `data/visuals.js`.
Economy change is sim-affecting ⇒ MP authority needs this build. The grid warp is render-only.
**Not yet playtested live** — watch for center-camping (bounty/pulse-scatter are the brakes);
the scrap numbers are tunable in `economy`.

**Follow-up idea (not built):** a telegraphed "supercharge" jackpot every N pulses to create a
rush moment — deferred to keep this focused; say the word.

---

## 2026-07-06 — Binary Star (flail final): maces become BLADES — faster, longer, harder
**What changed:** the tier-3 flail final's two mace heads are now whirling BLADE rotors. New
`flailship.binaryStar.blade` config {spinMult 1.4, reachMult 1.35, dmgMult 1.4, sizeMult 1.3}.
In `wreckingOrb.update` (`src/weapons.js`), Binary Star derives its orb stats by multiplying
`F.orb` — faster swing (spinSpeed + releaseSweep), longer reach (spinRadius + maxReach), more
damage (spin/fling/trail), and a bigger head. **Still blocks projectiles** — `orbBlockRadius`
scales with the enlarged `tipRadius`, so the block is preserved and slightly wider. Twinmaul and
base Flailship are unchanged (multipliers gate on classId === 'binaryStar').

**Visual:** `src/game.js` flail head-draw now branches — Binary Star draws an energized SWORD per
head (tapered blade + fuller, crossguard, wrapped grip, pommel; steel whitens + edge glows with
swing speed) instead of the spiked ball. The blade points OUTWARD along its chain (rotates by the
ship→head angle, not selfSpin) so it reads as a sword slashing around the ship. All other flail
classes keep the mace. Works local and remote (drives off orbX/head positions). Tether unchanged.
*(First cut was a 3-blade rotor; swapped to swords per feedback.)*

**Files touched:** `data/config.js`, `data/classes.js`, `data/visuals.js`, `src/weapons.js`,
`src/game.js`. Sim-affecting (damage/reach/speed) ⇒ MP authority needs this build. **Not yet
playtested live** — the blade multipliers are a starting point; tune in `binaryStar.blade`.

---

## 2026-07-06 — Rail visual: removed the opening maw-jaw tip (Star Piercer / Starbreak)
**What changed:** the siege classes' muzzle had twin jaws that HINGED OPEN with charge. Now that
the whole clamshell shell opens, a separately-opening tip read as doubly-opening and looked wrong.
Removed the jaw geometry from `railBody` (`src/ships.js`); the siege charge is now told purely by
the extending rail + a swelling essence core that condenses at the muzzle (kept from the old maw
block, enlarged slightly so it still reads as "siege"). Base railship/helion unchanged.

**Cleanup:** the `mawOpen` model option and the numeric `prong` value are gone — `prong` is now
just a truthy flag (siege muzzle + maw recycle fold time). Starbreak's rift-dash offset adjusted
since the jaws no longer add length. Cues in `data/visuals.js` updated (no more "maw opens/jaws").

**Files touched:** `src/ships.js`, `data/visuals.js`. Render-only, MP-safe.

---

## 2026-07-06 — Rail balance pass: range falloff (+ visible beam fade), Vent Dash removed
**Why:** rail could 2-tap a flail from the edge of the screen — a range it couldn't answer — and
had two escapes (Space Vent Dash + Shift Afterburner) making it slippery on top of that. Goal:
tame the cross-map burst and thin the escape density WITHOUT dulling what makes rail fun (the
point-blank snap still hits hard). Player-directed; afterburner stays, projectile idea parked.

**What changed:**
- **Range damage falloff (vs ships only).** New `railship.beam.rangeFalloff {fullRangeFrac:0.30,
  minMult:0.35}`. Full damage out to ~390px (where a flail/hammer can actually close), then linear
  down to 35% at the 1300px tip. Applied in `chargeRail.fire` (`src/weapons.js`); neutral farming /
  line-break is untouched. Overcharge at the tip is now 24 (was 70), lance 15 (was 42) — a poke,
  not a delete; point-blank is unchanged. Numbers are a starting point, tune in playtest.
- **Beam opacity fade** matches the damage curve: `fx.spawnBeam` takes an optional `fade`
  {fullFrac, minMult} that tapers the stroke opacity along the beam via a length gradient
  (`src/fx.js`). Only the base rail passes it, so its shots visibly weaken toward the tip — an
  honest tell. Other beams (helion/maw/rift) draw solid as before.
- **Vent Dash removed** from all five rail classes (`ability: null` in `data/classes.js`). Rail
  now keeps ONLY the Shift afterburner as an escape, and has NO active heat shed — heat is pure
  passive decay (22/s), so sustained fire self-limits harder. HUD no-ability fallback reads
  "no active ability" (`src/game.js`).

**Not touched (deliberately):** maw (Star Piercer/Starbreak) and helion beams keep flat damage —
falloff is base-rail-only for now (the reported 2-tap culprit). Projectile-vs-hitscan parked.
Gravitor enjoyability pass is the next item.

**Dead code left (harmless):** `ventDash` ability def + config block remain but nothing binds them;
`chargeRail`'s `chargeBoostTimer` branch is now unreachable; rail bots still press ability when hot
(`bots.js:34`) — a no-op that correctly gives them the same heat wall as the player.

**Files touched:** `data/config.js`, `data/classes.js`, `src/weapons.js`, `src/fx.js`, `src/game.js`.
Sim-affecting (damage numbers), so MP authority must run this build too. **Not yet playtested in a
live match** — verify rail still feels good up close and can't cheese from range.

---

## 2026-07-06 — Rail family: shell folds shut smoothly after firing (reset by fold-end)
**What changed:** `railBody` in `src/ships.js` now separates ENERGY from MECHANICAL deployment.
Energy (`ch`, from charge/beam ramp) still drives the glow — capacitor rings, energy sleeve,
muzzle bloom, essence core — and drops to 0 the instant the shot leaves. A new render-only
deployment value (`dep`, persisted on the ship as `s._railDeploy`, eased off the sim clock)
drives the mechanical geometry: the clamshell halves (`open`), barrel telescope length (`bl`),
and maw jaws. `dep` snaps OPEN to track charge with no lag, but after firing it **eases shut over
foldSec** rather than snapping — the shell closes and the barrel retracts together, finishing
EXACTLY as the gun's fire cooldown expires (closed shell == ready again). `foldSec` is the class's
real post-fire lockout, read from config: the maw classes (Star Piercer / Starbreak) use their
explicit `mawRail.recycleSec` (1.4s); the base rail and beam classes have no discrete cooldown, so
they use `charge.timeToFullSec` (1.05s, the recharge-to-ready). Re-charging mid-fold just re-opens
it (charge overrides the fold). Helion/Supernova lens position now rides `dep` too, so it stays
glued to the retracting muzzle instead of jumping back. (Per-frame close rate is clamped so a
tab-out pause can't skip the animation; at any normal framerate it lands on foldSec exactly.)

**Files touched:** `src/ships.js` only. Render-only; persists `_railDeploy`/`_railT` on the ship
object (local, bots, and MP `byId` view-ships all persist across frames — verified). MP-safe.

**How to test:** open `index.html`, Railship, hold+release LMB — the shell should fold shut and
the barrel retract slowly over the full ~1.05s recharge window into the sealed pod, landing closed
right as the gun is ready again. Verified with a headless 60fps-stepped fire sequence: dep eases
1.00 → 0 linearly, hitting ~0.5 at the halfway mark and exactly 0 at +1.05s.

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
*(Resolved 2026-07-06 — see the fold-up entry above.)*

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
