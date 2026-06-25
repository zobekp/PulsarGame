# PULSAR.io — Class Spec

Qualitative design for all four families and their evolutions. **All numeric values live in
`data/config.js`**; the tree structure and behavior-hook keys live in `data/classes.js`. This
doc is the "why and how it feels" — read it with those two files open.

Each class must: feel different within 10 seconds, farm neutral objects in a distinct and
satisfying way, avoid generic bullet-spam, and have clear counterplay. Use placeholder shapes
(see `VISUAL_SPEC.md`) until sprites exist.

Global progression: starter ship → choose family (lvl 3) → choose branch (lvl 8) → final
evolution (lvl 15) → leader/dreadnought scaling (lvl 25+). Thresholds in config.

---

## Railship — precision sniper / line farmer / anti-large
*Lineage: the old Lance weapon. Star Piercer ≈ Railpiercer.*

**Fantasy:** a fragile precision ship that farms by lining up piercing rail shots, fights by
predicting movement, and threatens leaders with full-charge beams. A sniper, not a cannon tank.

**Primary — Charge Rail.** Hold to charge, release to fire a thin piercing beam. Charge stages
(Snap / Focus / Lance / Overcharge) trade damage, pierce, recoil, heat, and a movement-speed
penalty while charging. Overcharge is high-risk: big damage, big recoil, heavy heat, strong
warning visual, slow movement.

**Heat (not ammo).** A soft heat meter rises per shot and decays over time. High heat slows
charge rate, blocks overcharge, and can force a brief vent. No long hard-stuns.

**Ability — Vent Dash.** Short backward dash away from aim; sheds heat, escapes rushers, usable
mid-charge (cancels some charge as the cost).

**Passive — Armor Crack.** Full-charge+ hits mark a target vulnerable (bonus/amplified damage
for a short window); duration scales up against larger/leader targets if that data exists —
scaffold the scaling fn even before leader data is wired.

**Farming — Line Break.** One shot breaking 3+ neutral objects gives a bonus (scrap / heat
refund / `LINE BREAK` floating text). Makes farming itself skillful.

**Evolutions.** *Lancer* (pure sniper: longer range, thinner beam, stronger crack, weaker up
close; passive *Perfect Line* = bonus damage past 60% range). *Star Piercer* (anti-leader: huge
beam, strong feedback, *Broken Core* = full-charge vs a large/leader target exposes a weak point
others can punish).

**Counterplay:** fragile; punished by fast rushers and close-range chaos; slowed while charging.

---

## Hammerhead — rammer / bruiser / beginner aggression
*Lineage: new identity. Impact melee — must not invalidate the Flailship.*

**Fantasy:** a brute-force ramming ship that commits in a straight line, smashes enemies, and
punishes bad positioning. "I hit you with myself."

**Primary — Hammer Ram.** Hold to wind up, release to charge forward; collision deals impact
damage scaling with charge speed/distance. Missing leaves a brief, punishable recovery. States:
Tap Bash (cheap bump) / Charged Ram (commit) / Overcommit Slam (huge, poor steering, vulnerable).

**Ability — Brace** (or Brake Turn). Brace briefly cuts incoming damage/knockback so engaging
isn't suicidal; Brake Turn cancels momentum to redirect. Pick whichever fits the movement code.

**Passive — Momentum Damage.** Impact (and knockback) scale with velocity.

**Farming:** plow through neutral objects on a charge.

**Evolutions.** *Maulbreaker* (bigger front hitbox, more knockback, slower recovery; *Armor
Dent* = charged impact applies a brief slow / resist-down). *Worldsplitter* (raid-boss impact:
*Worldsplitter Slam* full-charge hit creates a shockwave — contact takes the real damage,
nearby ships get light knockback; strong telegraph, never a one-shot AoE).

**Counterplay:** predictable direction, bad turn rate mid-charge, vulnerable after a miss;
kited, rail-punished, disrupted by gravity wells.

---

## Gravitor — asteroid control / indirect / zone (two branches)
*Lineage: Nova. Collapse / Event Horizon == the old "pull-then-detonate." Not a drone/minion class.*

**Fantasy:** a gravity ship that opens a well, pulls nearby asteroids into orbit, and throws
them like meteors. Power comes from **map objects and physics**, not permanent summons.

**Core — Gravity Well.** Pulls neutral asteroids into a small orbit (limited capacity), lets you
launch them toward the cursor, gently slows enemies near center. Controls: hold-to-maintain /
click-to-launch / release-to-collapse, or a toggle variant — pick per input architecture.

**Passive — Orbital Harvest.** Asteroids killed by thrown asteroids yield extra scrap (satisfying
PvE).

**Branch A — Meteorist → Starfall (artillery).** More capacity, harder/faster launches, more
direct damage, weaker control. *Momentum Strike*: farther-thrown asteroids hit harder. *Starfall*:
stores 4–5 meteors, *Meteor Volley* rapid sequential launch (each dodgeable, visible startup).

**Branch B — Singularity → Event Horizon (control).** Stronger pull, better slow, less launch
damage. *Tidal Drag*: enemies near the well are gently pulled in. *Event Horizon*: *Collapse* the
well into an implosion — drags enemies, damage scales with stored asteroids, then ejects debris;
great for trapping leaders for others to punish. Visible, delayed, escapable; vulnerable while
channeling.

**Counterplay:** orbiting rocks can be destroyed pre-launch; well is visible; weak in open zones
with no asteroids; fast ships dodge meteors; rail pierces through orbiting rocks; rushed if caught
unloaded.

---

## Flailship — area melee / farming / anti-rush (two branches)
*Lineage: the orbiting flail from the first sketch + Tether zoning. Not a rammer —
"I drag a dangerous orbiting weapon around me."*

**Fantasy:** a ship with a heavy wrecking orb on a chain. Swing it through asteroids, block
space, punish anyone who gets close.

**Weapon — Wrecking Orb.** Orbits/trails the ship, damages on contact, has (simulated) momentum,
extends/retracts. **MVP physics:** fake it with an orbital anchor — orb follows a point rotating
around the player; movement influences orbit speed/angle; hold to widen radius, release to
retract; draw the chain as a line. Gets the fantasy without physics bugs.

**Passive — Momentum Hit.** Orb damage scales with orb speed.

**Farming:** one of the best — swing through clusters, extend for wide clears, retract for safety.

**Branch A — Chainmaul → Ironmoon (heavy).** Larger orb, longer chain, more momentum damage, more
commitment. *Power Swing*: orb briefly heavier/faster/stronger. *Ironmoon*: *Moon Slam* launches
the orb outward for big impact then retracts (big telegraph, dodgeable, weak to kiting).

**Branch B — Graviflail → Orbit Crusher (control).** Smoother/wider orbit, slight scrap pull,
better anti-rush, less burst. *Orbit Lock*: stable defensive orbit for a window. *Orbit Crusher*:
*Gravity Crush* spins the orb to damage nearby enemies and pull in small objects — area denial.

**Counterplay:** must close distance; loses to long-range kiting and precise rail shots.

---

## Upgrade cards / modifiers (if/when added)
Keep effects simple and readable. Universal: +Max HP, +Move Speed, +Damage, +Farming Damage,
+Cooldown Reduction, +Scrap Magnet, +Ability Duration, −Ability Cooldown. Class-specific cards
(Railship *Cleaner Barrel*/*Longshot*/*Core Crack*/*Recoil Skater*; Hammerhead *Heavier Head*/
*Better Brakes*/*Momentum Engine*; Gravitor *Wider Well*/*Dense Core*/*Clean Launch*/*Collapse
Core*; Flailship *Longer Chain*/*Heavier Orb*/*Fast Orbit*/*Orbit Guard*) — full list in the
original spec; encode as data when the card system exists.

## Build order (see ROADMAP.md for the merged, phased plan)
1. Class skeleton: definitions + tree + placeholder visuals + stat multipliers + selection.
2. One functional branch per class: Railship→Lancer→Star Piercer, Hammerhead→Maulbreaker→
   Worldsplitter, Gravitor→Meteorist→Starfall, Flailship→Chainmaul→Ironmoon.
3. Second branches: Gravitor→Singularity→Event Horizon, Flailship→Graviflail→Orbit Crusher.
