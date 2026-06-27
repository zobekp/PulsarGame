# PULSAR.io — DEVLOG

Append-only session log. Newest entry on top. Every session ends with an entry: what changed,
files touched, new config, how to test, known limits, TODO hooks left. This is how context
survives between agents and sessions.

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
