# PULSAR.io — Roadmap

Merged engine-feel-first sequencing (prove the game before the netcode) with the class spec's
implementation priorities. **Each phase ends playable.** Check boxes as you go; the current
phase is the one with unchecked boxes nearest the top. One session = advance one phase (or one
task within it), then update `DEVLOG.md`.

---

## Phase 0 — Skeleton  ✅ done (2026-06-25)
Engine bones, no content depth.
- ☑ Fixed-timestep loop, decoupled render
- ☑ Movement (WASD + mouse aim) for one ship
- ☑ Additive-bloom render pipeline on black
- ☑ Data files load via `<script>` (`config`, `classes`, `farming`, `visuals` reachable)
- ☑ One starter weapon fires into empty space with honest VFX (bloom = hitbox)
- ☑ One breakable asteroid to shoot
- ☑ `DEVLOG.md` updated
**Done when:** I can move, aim, fire with correct neon VFX, and pop an asteroid at stable FPS.

## Phase 1 — Combat & farming feel  ✅ done (2026-06-26)
The most important phase — nail the core sensation before adding breadth.
- ☑ Damage system + honest hitboxes (centralised `damageObject`; hitscan beam half-width == hitbox)
- ☑ Asteroid/crystal/debris farming with scrap pickup + `LINE BREAK` feedback
- ☑ Hit feedback (flash, knockback, particles, screen shake)
- ☑ Death → drop a chunk of carried scrap → respawn
- ☑ Railship built out fully (charge stages, heat→vent, Vent Dash, Armor Crack scaffold)
**Done when:** farming feels good with the Railship and the charge/heat loop is satisfying.
*Needs human playtest sign-off on feel — code-complete & smoke-tested.*

## Phase 2 — World & economy  ✅ done (2026-06-26)
- ☑ Pulsar honeypot at center: pulse rhythm ejects decaying scrap motes
- ☑ Asteroid density interpolates sparse-core → dense-edge (emergent gradient)
- ☑ Scrap-as-currency: earning raises level; spending banks it; carried scrap is at risk
- ☑ Level thresholds gate evolution choices (3 / 8 / 15)
- ☑ Leader/bounty: carried-scrap glow, crown, minimap mark, bigger hitbox · (double-payout
      bounty needs a killer → scaffolded for Phase 4 PvP)
**Done when:** the farm → spend-or-hoard → risk loop creates real "push my luck" tension with
no UI to explain. *Needs human playtest sign-off on the tension/curve — code-complete & smoke-tested.*

## Phase 3 — Class skeleton + first branch each  ✅ done (2026-06-26)
- ☑ All 4 base classes selectable at level 3, data-driven from `classes.js` (non-blocking overlay)
- ☑ Placeholder visuals per class (distinct silhouettes: dart/spear/wedge/crescent/ringed-orb)
- ☑ Class-specific stat multipliers applied (hp / speed / size from `config`)
- ☑ One functional branch each, through final:
      Railship→Lancer→Star Piercer · Hammerhead→Maulbreaker→Worldsplitter ·
      Gravitor→Meteorist→Starfall · Flailship→Chainmaul→Ironmoon
- ☑ Each class farms neutral objects in its distinct way (line / plow / hurl / sweep)
**Done when:** every class feels different within 10 seconds and no class is bullet-spam.
*Needs human playtest sign-off on per-class feel — code-complete & smoke-tested.*

## Phase 4 — Second branches + bots  ◐ code-complete (2026-06-27), feel-tuning pending  ← the prove-it gate
- ☑ Gravitor→Singularity→Event Horizon · Flailship→Graviflail→Orbit Crusher (both branches selectable)
- ☑ Bots that farm, fight, contest the pulsar, react to telegraphs (difficulty in `config.bots`)
- ◐ Tune the cross-class balance triangle — first-pass; needs real playtest
**Done when:** a match against bots is genuinely fun solo. **Do not build netcode until this
passes** — if it isn't fun here, multiplayer won't save it.
*Combat foundation + bots + branches are built & smoke-tested; the "genuinely fun" sign-off is
a human playtest call. Bots currently lean farm-heavy (1 kill / 25s in test) — `config.bots.aggression`
and ranges are the dials.*

## Phase 5 — Real multiplayer  ▢
- ▢ Authoritative Node + WebSocket server; client becomes a thin renderer of server state
- ▢ Reuse the deterministic sim from earlier phases; interpolation + basic lag handling
- ▢ Modularize here (the client/server split point)
**Done when:** two browsers fight on one shared server instance.

## Phase 6 — Meta & persistence  ▢
- ▢ End-of-life conversion of earned scrap → meta currency
- ▢ Unlock new classes / cosmetic VFX skins — OPTIONS ONLY, re-audit for raw-power leaks
- ▢ Upgrade-card system (encode cards as data)
- ▢ Persistence layer
**Done when:** unlocks expand the toolbox without breaking the shared power ceiling.

---

### Acceptance criteria (cross-cutting, from the class spec)
- ☑ Player can spawn and upgrade into each class (BOTH branches through final, as of Phase 4)
- ☑ Each class has a readable placeholder visual and feels different within 10s — *playtest TBD*
- ◐ Neutral farming is fun with every class — functional + distinct; "fun" needs playtest sign-off
- ☑ No class relies only on generic bullet spam (beam / lunge / thrown-rock / orbiting orb / drag / crush)
- ☑ Class data is organized so more classes can be added without touching engine logic
      (engine resolves `weapon`/`ability`/`special` keys via registries; adding = data row + behaviour entry)
- ☑ Leader is powerful but has a bigger hitbox + is visibly marked (David-vs-Goliath holds) — wired in Phase 2 (single-player); re-validate under PvP in Phase 4
