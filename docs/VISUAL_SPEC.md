# PULSAR.io — Visual Spec

Neon-on-black, additive bloom, **procedural** (no raster sprites). The renderer draws each
ship from its `data/visuals.js` row. A new class = one visual row + one accent-draw function.
Numbers with gameplay stakes live in `config.readability`.

## Readability rules (these have gameplay stakes — do not let them emerge by accident)
1. **Your ship is always the brightest thing on screen** — highest bloom + a pure-white core
   ring nobody else gets. Your eye finds you instantly in chaos.
2. **Threat is brightness, not just color** — higher carried-scrap / higher-level / leader ships
   glow harder and bigger (ties to bounty: the rich literally shine). Low threat reads dim.
3. **Enemy specials/ults desaturate the background** for a beat so they're unmissable —
   telegraph as a screen state, not just a local effect.
4. **Three independent signal channels, never overloaded:** hue = team · silhouette + aura =
   class · brightness = threat. A player should name an enemy's class in under half a second
   from silhouette alone, even blurred. If two classes read the same at a glance, the spec failed.

## Base form (the template every class modifies)
Shared core so classes read as variations on a recognizable body: a small filled circle (body)
with a thin bright ring, a bright facing-spoke pointing at the aim vector (how you read where
someone will fire), and an additive bloom behind it whose intensity = threat.

## Per-class silhouette + cues (placeholders until sprites)
- **Railship** — long narrow **spear/triangle**; front spine glows while charging; beam-line
  trail on fire; recoil kick; heat-vent glow when hot. *Star Piercer*: huge beam + weak-point
  marker on cracked leaders.
- **Hammerhead** — wide reinforced **wedge**, heavy nose; windup particles at the front; impact
  **shockwave ring**; spark burst on collision. *Worldsplitter*: big charge telegraph.
- **Gravitor** — round/**crescent** body with a visible **gravity-well circle**; asteroids
  orbiting the core; launch trail on thrown rocks; *Event Horizon* collapse implosion.
- **Flailship** — ship + **chained orb**; chain drawn as a simple line; orb motion trail; wider
  arc when extended; *Graviflail/Orbit Crusher* show a stable orbit ring.

## Leader overlay
Bigger body, crown glyph, brighter bloom, minimap mark — and a visibly **bigger hitbox**. Power
must look like power, and the larger silhouette is the honest tell that it's now easier to hit.

## Neutral objects
Dim and desaturated so PvE never reads as PvP: asteroids (grey blobs), crystals (faint teal
shards, the high-yield seek), debris (small fragments), wreckage (large chunks). The **pulsar**
is the brightest fixed object on the map — a white, pulsing star, the literal and visual center.

## What the human owns (don't auto-generate)
The accent-shape geometry, the final palette lock, and the readability rules above as hard
requirements — propose, but they get signed off, not optimized away.

> Sequencing: don't build the procedural renderer until Phase 1 has nailed how a single ship
> and one hit feel. The base form is the template everything inherits — it must feel right first.
