# PULSAR.io — Roadmap

Merged engine-feel-first sequencing (prove the game before the netcode) with the class spec's
implementation priorities. **Each phase ends playable.** Check boxes as you go; the current
phase is the one with unchecked boxes nearest the top. One session = advance one phase (or one
task within it), then update `DEVLOG.md`.

---

## Phase 0 — Skeleton  ▢ not started
Engine bones, no content depth.
- ▢ Fixed-timestep loop, decoupled render
- ▢ Movement (WASD + mouse aim) for one ship
- ▢ Additive-bloom render pipeline on black
- ▢ Data files load via `<script>` (`config`, `classes`, `farming`, `visuals` reachable)
- ▢ One starter weapon fires into empty space with honest VFX (bloom = hitbox)
- ▢ One breakable asteroid to shoot
- ▢ `DEVLOG.md` updated
**Done when:** I can move, aim, fire with correct neon VFX, and pop an asteroid at stable FPS.

## Phase 1 — Combat & farming feel  ▢
The most important phase — nail the core sensation before adding breadth.
- ▢ Damage system + honest hitboxes
- ▢ Asteroid/crystal/debris farming with scrap pickup + `LINE BREAK`-style feedback
- ▢ Hit feedback (flash, knockback, particles)
- ▢ Death → drop a chunk of carried scrap → respawn
- ▢ Railship built out fully (charge stages, heat, Vent Dash, Armor Crack scaffold)
**Done when:** farming feels good with the Railship and the charge/heat loop is satisfying.

## Phase 2 — World & economy  ▢
- ▢ Pulsar honeypot at center: pulse rhythm ejects decaying scrap motes
- ▢ Asteroid density interpolates sparse-core → dense-edge (emergent gradient)
- ▢ Scrap-as-currency: earning raises level; spending banks it; carried scrap is at risk
- ▢ Level thresholds gate evolution choices (3 / 8 / 15)
- ▢ Leader/bounty: carried-scrap glow, crown, minimap mark, double payout, bigger hitbox
**Done when:** the farm → spend-or-hoard → risk loop creates real "push my luck" tension with
no UI to explain.

## Phase 3 — Class skeleton + first branch each  ▢
- ▢ All 4 base classes selectable at level 3, data-driven from `classes.js`
- ▢ Placeholder visuals per class (distinct silhouettes)
- ▢ Class-specific stat multipliers applied
- ▢ One functional branch each, through final:
      Railship→Lancer→Star Piercer · Hammerhead→Maulbreaker→Worldsplitter ·
      Gravitor→Meteorist→Starfall · Flailship→Chainmaul→Ironmoon
- ▢ Each class farms neutral objects in its distinct way
**Done when:** every class feels different within 10 seconds and no class is bullet-spam.

## Phase 4 — Second branches + bots  ▢  ← the prove-it gate
- ▢ Gravitor→Singularity→Event Horizon · Flailship→Graviflail→Orbit Crusher
- ▢ Bots that farm, fight, contest the pulsar, react to telegraphs (difficulty in config)
- ▢ Tune the cross-class balance triangle
**Done when:** a match against bots is genuinely fun solo. **Do not build netcode until this
passes** — if it isn't fun here, multiplayer won't save it.

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
- ▢ Player can spawn and upgrade into each class
- ▢ Each class has a readable placeholder visual and feels different within 10s
- ▢ Neutral farming is fun with every class
- ▢ No class relies only on generic bullet spam
- ▢ Class data is organized so more classes can be added without touching engine logic
- ▢ Leader is powerful but has a bigger hitbox + is visibly marked (David-vs-Goliath holds)
