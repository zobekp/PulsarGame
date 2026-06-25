# PULSAR.io — Design (Canonical Source of Truth)

> This is the one design doc. `AGENTS.md` and `CLAUDE.md` point here. If anything
> conflicts, this file wins. Class detail lives in `CLASSES.md`; visuals in `VISUAL_SPEC.md`;
> the build plan in `ROADMAP.md`; all tunable numbers in `data/config.js`.

## What this is
A real-time PvP browser `.io` **spaceship arena**. Neon-on-black, additive bloom,
Terraria-grade weapon VFX, boss-fight intensity. Four ship classes that **evolve** as you
level (base → upgrade → final). A literal **pulsar** at map center is the richest scrap
source and the PvP draw; calm asteroid fields at the edges are safe farming. The risk
gradient is **emergent** from where value sits — no authored zones or rings.

Design philosophy: **emergent, not authored; simplicity is the .io edge.** One honeypot at
center + dense edges produces the gradient, the new-player safety, and the action focus for
free. Resist adding capture points, lanes, or authored structure.

## Non-negotiable pillars
1. **Time-to-fun < 10s** — spawn, move, smash a nearby asteroid, collect scrap, see progress
   toward an upgrade, notice a leader. Acting, not menuing, within 10 seconds.
2. **Honest VFX = hitbox** — a weapon's bloom/telegraph matches its real damage area. Heavy
   attacks have visible windups so opponents get counterplay.
3. **Readability over complexity** — you should understand what killed you. Distinct
   silhouette, distinct weapon behavior, distinct visuals, clear counterplay per class.
4. **David vs. Goliath** — a weaker player can always threaten a leader through skill,
   timing, positioning. Leaders get power AND vulnerability (bigger hitbox, bounty mark,
   anti-large tools). No pure stat-check snowballing.
5. **Options, not stats (meta)** — any persistent unlocks expand the toolbox (classes,
   cosmetics), never raw power. Day-1 and 200-hour players share an identical ceiling.
6. **Data-driven** — classes, world objects, visuals, and every number live in `data/*.js`.
   Adding content or rebalancing = editing data, never engine code.

## Class system (overview — full detail in CLASSES.md)
Four families on an evolution tree. Weapon + ability + identity are **fused** into the ship
(no separate weapon/armor axis). You pick a family at level 3, a branch at level 8, a final
form at level 15.

```
Railship   → Lancer       → Star Piercer            (precision sniper / anti-large)
Hammerhead → Maulbreaker  → Worldsplitter           (rammer / bruiser)
Gravitor   → Meteorist    → Starfall                (asteroid artillery)
           → Singularity  → Event Horizon           (gravity control / zone)
Flailship  → Chainmaul    → Ironmoon                (heavy wrecking orb)
           → Graviflail   → Orbit Crusher           (orbit control / area denial)
```

Lineage (this evolved from earlier abstract-weapon designs, it isn't a reset): Railship←Lance,
Gravitor←Nova (Collapse/Event Horizon == the old "pull-then-detonate"), Flailship←the orbiting
flail + Tether zoning, Hammerhead is new. Cross-class triangle in `data/classes.js` — no class
is universally good.

## Economy & death model (greed loop)
Single currency: **scrap**. Earning it (farming neutral objects, the pulsar, kills) raises
your **level**, which gates evolutions. Scrap is also the thing you **carry and risk**:

- **Spend = bank.** Spending scrap on an evolution/upgrade locks that progress in — it's safe.
- **Carry = risk.** Unspent carried scrap is droppable. Die and you drop ~50% of it (config),
  your killer collects a share. Your level/evolution is never lost — only loose scrap.
- **The live decision, every second:** spend incrementally to stay safe-but-slow, or hoard
  toward your next evolution and risk the pile. Greed is both the reward and the risk.

Snowball brakes: bounty scales with carried scrap (rich = brighter + on minimap + double
payout when killed); diminishing returns farming far below your level; spawn protection +
a tiny scrap trickle so fresh players act immediately.

## Spatial model
Uniform open field, no rings. **Pulsar at center** ejects scrap motes on a rhythm — richest
value, densest PvP. **Asteroid density** interpolates from sparse-at-core to dense-at-edge,
so the calm farm is the rim and the contested prize is the middle. Players self-sort by
greed; the map applies pressure without a single authored zone.

## Leader / David-vs-Goliath
At leader scaling a player gains HP, size, intimidating visuals — and a bigger hitbox, a
crown/minimap mark, a bounty, worse turn rate, and heightened vulnerability to anti-large
class tools (Railship Armor Crack/Broken Core, Hammerhead crack-on-impact, Gravitor trap,
Flailship reliable-hit-on-big-target). Prefer hitbox + visibility over flat damage multipliers.

## Tech & architecture (rules, not suggestions)
- **Canvas 2D, vanilla JS, no framework, no build step** through the prototype phases.
  Data files load as plain `<script>` tags before the engine. Single `index.html` is fine
  until netcode (Phase 5) forces a client/server split — modularize there.
- **Data-driven everything.** `data/config.js` is the ONE tuning surface — no gameplay
  constant hard-coded in logic. `data/classes.js` is the evolution tree. Behavior is resolved
  by string keys (`weapon`/`ability`/`passive`/`special`) the engine looks up.
- **Fixed timestep** sim decoupled from render; determinism matters for later netcode — no
  frame-rate dependence in movement or cooldowns.
- **Never leave the game broken.** Each phase ends playable. If a change can't finish cleanly,
  leave the prior phase intact and note it in `DEVLOG.md`.
- **Scaffold missing systems with TODO hooks**, don't fake them and don't block. Add a
  function stub where full behavior needs a system that doesn't exist yet.

## Session protocol (every agent, every session)
1. Read this file, then `CLASSES.md` and `ROADMAP.md`. Check the current phase.
2. Build ONLY the named phase/task. Don't pull future work forward.
3. Keep all new numbers in `config.js` with an intent comment.
4. End by updating `DEVLOG.md`: what changed, files touched, new config, how to test, known
   limits, TODO hooks left. This is how context survives between sessions.
5. Surface architectural forks instead of silently picking — especially anything touching
   determinism or the data-driven boundary.

## Known risks to design against (not discover in playtest)
- **Readability in chaos** — many ships + overlapping bloom + specials on black. Keep the
  three signal channels independent (hue=team, silhouette=class, brightness=threat); your
  ship always brightest with a white core; enemy specials desaturate the background.
- **TTK & dodge economy** — the single dial deciding twitchy vs grindy. TTK must stay long
  enough that VFX tells matter. It's in `config.combat`.
- **Pulsar camping** — a dominant player choking the center. Mitigated by pulse-scatter
  (value spreads) + bounty (camper is marked and hunted). Tuning problem, not structural.
- **Snowballing** — bounty + diminishing returns + spawn protection are the brakes; if a
  leader feels unstoppable that's a balance bug, fix in data first.
