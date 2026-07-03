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

**Evolutions (branch at lvl 8 — two different WEAPONS, not stat mods).**
*Helion* (sustain): the rail reforged into a solar furnace — a continuous beam whose damage
ramps the longer it stays on target, with a heat cost that accelerates alongside it; ramp-0 is
heat-sustainable, full fury forces a vent in seconds. Fully-ramped beam applies Armor Crack.
*Star Piercer* (siege): long-charge railgun whose maw visibly OPENS with charge — jaw gape IS
beam width. Release fires ONE instantaneous, far heavier blast — all damage lands the frame you let go,
along the aim you committed to (fired, not steered; a miss wastes the recycle). No charge-line telegraph: the tells are the essence intake and the open
maw. Keeps *Broken Core* (full-charge vs leader exposes a weak point). Tier-3 finals for both
branches: TODO.

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

**Dust Accretion (anti-sitting-duck floor).** When the well is below capacity with nothing
capturable in range, it condenses a small PEBBLE from dust every few seconds (max 2 held).
Pebbles hit for ~55% — real asteroids stay strictly better, so terrain still matters, but a
gravitor is never fully disarmed in open space.

**Shatter Recycling.** A thrown rock that dies has a coin-flip chance to leave a real debris
fragment where it broke — volleys partially reseed the battlefield (for everyone; capped so
the map never floods).

**Counterplay:** orbiting rocks can be destroyed pre-launch; well is visible; WEAKER (not
helpless) in open zones — pebbles are a floor, not a substitute; fast ships dodge meteors;
rail pierces through orbiting rocks; rushed if caught unloaded.

---

## Flailship — area melee / farming / anti-rush (two branches)
*Lineage: the orbiting flail from the first sketch + Tether zoning. Not a rammer —
"I drag a dangerous orbiting weapon around me."*

**Fantasy:** a ship with a heavy wrecking orb on a chain. Swing it through asteroids, block
space, punish anyone who gets close.

**Weapon — Momentum Mace.** A spiked mace that TRAILS behind the ship at rest on a slack chain
(light contact damage). HOLD fire to engage **radial momentum**: the mace swings around the
hull, faster and faster (contact damage scales with spin). RELEASE to **fling** it at the
cursor — cast speed AND payload scale with the momentum banked; same max chain reach; the mace
sweeps damage on the return too. A panic tap is a slow weak lob; a full spin-up is a
cannonball. Blocks enemy shots in every state.

**Passive — Momentum Hit.** Orb damage scales with orb speed.

**Farming:** one of the best — swing through clusters, extend for wide clears, retract for safety.

**Upgrade (lvl 8) — Twinmaul.** Two maces on two chains, spinning in opposite phase off a
doubled winch. LMB release: the hammer-throw physics stagger the heads into a rapid one-two
volley at the cursor. RMB: a forced synchronized windup hurls BOTH at once. Special [E]
*Static Lash*: a stun pulse around EACH mace head — briefly hard-stuns victims, scrambles
whatever they were winding up (rail charge, ram windup, beam ramp, spin momentum), and locks
their ability/special for a beat. The radius is around the maces, not the ship: where your
heads are IS the ability. Per-head damage is trimmed so the pair lands ~1.6x a single mace.
Tier-3 final: TODO.

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
