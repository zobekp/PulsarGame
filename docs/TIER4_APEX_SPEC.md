# TIER 4 — TITAN-CLASS APEX SHIPS (spec)

The capstone tier: one Titan per family, the true dreadnoughts of the galactic-war fantasy. Rare,
screen-dwarfing, telegraphed a mile off, and a moving objective the lobby forms temporary
alliances to bring down (the bounty/leader system already rewards this).

Design bar (same as the finals): a Titan adds a **new VERB** that weaponizes the family's core
tension one more step — never just stat mods. The scaling system already makes them physically
dwarf everything; the verb is what earns the slot.

---

## Progression & tree wiring

- **New gate:** `economy.levelApex = 30` (past `levelLeaderScaling 25`, so a Titan is already
  dreadnought-scaled, then the apex adds its verb + the biggest size rank).
- **Cost:** `economy.evolutionCosts.apex = 320` (class 30 → path 80 → final 160 → apex 320).
- **Engine:** `EVO_GATES` `[3,8,15] → [3,8,15,30]`; `EVO_COSTS` add `apex`. `IMPLEMENTED` +4 ids;
  `FAMILY` map +4; `EVOLVE_BLURB` +4.
- **Convergence (recommended):** the apex is offered to **either final** of its family, so a
  player is never locked out of tier 4 by a tier-2 branch pick. Since `parentId` is single, set
  each apex's `parentId` to the "signature" final and tweak `childrenOf(id)` to also return the
  family apex for ANY tier-3 of that family. (Alternative: give every final its own apex — 6 total.
  Not doing that now; Supernova/Event-Horizon would converge into the family Titan.)
- **Scaling arrays** must gain a 5th (rank-4) entry — `applyClassStats` already indexes by
  `node.tier`, clamped to array length. Proposed:
  ```
  sizeByRank:  [1.0, 1.5, 2.2, 3.1, 4.2]   // ~r67 base, ~r100 leader — a true dreadnought
  hpByRank:    [1.0, 2.0, 3.6, 6.0, 9.0]
  dmgByRank:   [1.0, 1.8, 3.0, 4.8, 6.5]
  rangeByRank: [1.0, 1.2, 1.45, 1.7, 2.0]
  ```

Each apex reuses its family weapon's existing infra (beam corridor query, ram sweep, gravity well,
orbiting-head physics) — the verb is a mode/extension, not a from-scratch system.

---

## 1. RAIL → "ZENITH"  (spinal lance)   ← Starbreak / Supernova
**Weapon `zenithLance` · ability none (Shift afterburner) · passive armorCrack · special `overload`**

The ultimate siege platform: the whole ship IS the gun. New verb — **SPINAL LANCE**: from a full
siege-anchor (Starbreak's plant), hold fire to project a *continuous* devastating beam that you can
only slowly SWEEP (aim turn-rate hard-capped while firing) — you carve a line across a whole
quadrant. Where Starbreak fires one committed blast, Zenith is a sustained, steerable death-ray:
rooted, heat-hungry, and it melts anything on the line.

- Reuses: `beamHits` corridor query, the heat/vent system, the Starbreak siege-anchor movement.
- **Special `overload`:** dump the entire heat bar into a one-tick apocalypse pulse down the lance
  (damage ∝ heat spent), then a vent lockout — the Supernova nova reborn as a lance discharge.
- Config `railship.zenithLance`: `dpsBase 90, dpsMax 260` (ramps like Helion but harder),
  `range 1800` (× rangeMult ≈ 3600 for a leader — spinal weapons out-range everything),
  `halfWidth 22`, `pierce 12`, `turnRateWhileFiring 0.5 rad/s` (slow sweep — placement is the
  skill), `heatPerSec 34`, `overheatVentSec 3`.
- **Model `zenith`:** a colossal spinal railgun — elongated hull built entirely around the barrel,
  dorsal rift-blades from Starbreak scaled up, heavy capacitor banks glowing down the length.

## 2. HAMMER → "JUGGERNAUT"  (freight-train ram)   ← Worldsplitter
**Weapon `juggernautRam` · ability brace · passive momentumDamage · special `tremor`**

Momentum made unstoppable. New verb — **OVERRUN**: not a discrete lunge but a *spool*. Hold to
build sustained forward velocity (ties into the cruise mechanic); once committed you plow THROUGH
everything in a corridor — no stopping on the first hit — dragging a shockwave wake and hurling
ships aside. The longer you hold a straight heading the faster and more lethal you get; turning
bleeds it. A dreadnought battering ram that can't corner but flattens anything in a straight line.

- Reuses: `hammerRam` sweep collision + `momentumDamage`, extended so the active phase persists and
  re-hits distinct targets along the path; cruise for the spool.
- **Special `tremor`:** a radial shockwave that ripples out as you plow (knockback + stagger),
  turning the charge into an area event, not just a line.
- Config `hammerhead.juggernaut`: `spoolSec 1.4` (to full overrun), `overrunSpeed 1400`,
  `overrunMaxSec 2.2` (how long the plow lasts), `corridorWidth 1.4×radius`,
  `throughPierce ∞` (hits all distinct ships in the lane), `turnBleed` (hard turn ends it early).
- **Model `juggernaut`:** a massive armored battering prow on a long reinforced hull, 4 engine
  nacelles, hazard-striped ram face, the whole ship leaning into the charge.

## 3. GRAVITOR → "CATACLYSM"  (orbital bombardment)   ← Starfall  [artillery, per direction]
**Weapon `cataclysm` · ability launchAsteroid · passive orbitalHarvest · special `apocalypse`**

Artillery taken to its extreme: indirect fire from orbit. New verb — **BARRAGE**: mark a target
AREA at the cursor and a rain of meteors falls from off-screen onto it, each a telegraphed shadow
→ area-damage impact. Not line-of-sight — you arc over cover and deny whole zones. The captured
rocks (Starfall's ammo) FEED the barrage: more stored = a denser rain.

- Reuses: the gravity-well rock capture as the ammo economy; a new "falling meteor" projectile
  (spawns above the mark, telegraph shadow, lands after a delay, AoE on impact).
- **Special `apocalypse`:** one screen-wide carpet bombardment — the whole visible arena around the
  target takes a saturating strike (consumes all stored rocks; long cooldown).
- Config `gravitor.cataclysm`: `barrageMeteors 6` (+1 per stored rock, cap 12), `markToImpactSec
  0.7` (dodge window), `impactRadius 90`, `impactDamage 34`, `cadenceSec 0.9`, `range 1500`.
- **Model `cataclysm`:** an artillery dreadnought — the crescent grown into a battery of vertical
  launch silos around the gravity core, which pulses as it feeds the guns.

## 4. FLAIL → "CONSTELLATION"  (blade web)   ← Binary Star
**Weapon `constellation` · ability swingControl · passive momentumHit · special `collapse`**

"The space between the weapons is the weapon" — maxed. New verb — **BLADE WEB**: not two swords but
a RING of N tethered blades orbiting you, linked by live tethers into a lethal cat's-cradle;
anything inside the ring takes ticking damage and is dragged. Hold to spin/expand the ring, then
CAST it outward as an expanding net that ensnares an area and retracts, hauling caught enemies in.

- Reuses: `wreckingOrb` head physics + the Binary Star tether (extended from a line between 2 heads
  to a polygon web between N heads); `staticLash` as a lash pulse per blade.
- **Special `collapse`:** snap the web shut — every enemy caught inside is garrotted to the center
  and takes a burst (the Twinmaul/Binary-Star lash escalated into an area execute).
- Config `flailship.constellation`: `blades 5`, `ringRadius 0.9×maxReach`, `webDamage 12/tick`,
  `webRehit 0.35`, `castReach +40%`, `spinUpSec 1.4`.
- **Model `constellation`:** a central hub with a visible halo of blade emitters; the swords draw
  in `game.js` as a rotating ring, tethers webbing between adjacent blades.

---

## Build order (if approved)
1. Progression plumbing: `levelApex`, `evolutionCosts.apex`, `EVO_GATES/COSTS`, extend scaling
   arrays, `childrenOf` convergence, `IMPLEMENTED`/`FAMILY`/`EVOLVE_BLURB`, evolve-overlay support.
2. One vertical slice first (recommend **Cataclysm** — the new "falling meteor" projectile is the
   most novel and self-contained) → prove the tier end-to-end, then the other three.
3. Each: `data/classes.js` row, `data/config.js` block, `data/visuals.js` row + cues,
   `src/weapons.js` behavior, `src/ships.js` model, headless render + `finaltest`-style checks.
