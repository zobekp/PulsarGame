// PULSAR.io — VISUALS (placeholder silhouettes + readability rules)
// Procedural, neon-on-black, additive bloom. NO raster sprites. A class is drawn from
// its data row here. Adding a class = one row + one accent-draw fn the renderer calls.
// Readability constants live in config.readability (gameplay-stakes) — referenced here.
window.PULSAR = window.PULSAR || {};

// Three INDEPENDENT signal channels — never overload one:
//   hue        = team
//   silhouette = class identity (the shape below)
//   brightness = threat (carried scrap / level; YOU are always brightest + white core)
window.PULSAR.classVisuals = {

  // `silhouette` names a hull model in src/ships.js — every class has a unique one,
  // built so the shape itself explains the weapon (barrels charge, plates brace,
  // cores glow, drums spin). Adding a class = one row here + one model there.

  starter: { hue: "#9fb3c8", silhouette: "dart",
             accent: "none", note: "Tiny neutral dart with a cockpit dot." },

  // Railship — a sleek white/cyan fighter (concept art) with swept accent-edged wings and a thin
  // forward RAIL BARREL. Charging telescopes the barrel out and warms up a double-HELIX coil that
  // shifts colour by charge (blue → cyan → white → gold overcharge). Maw classes carry twin rails.
  railship: { hue: "#39d0ff", silhouette: "railship",
              accent: "frontSpineGlow",
              cues: ["sleek fighter, swept wings, forward rail barrel", "barrel telescopes out with charge",
                     "helix coil warms up + shifts colour by charge (blue→cyan→white→gold)",
                     "muzzle bloom at the tip", "breech glows red when hot"] },
  helion:      { inherits: "railship", silhouette: "helion",
                 note: "Solar-furnace pod: the shell opens on BEAM RAMP and the barrel extends " +
                       "into a focusing lens ring that glows hotter as the beam ramps.",
                 cues: ["shell opens + barrel extends with ramp", "lens ring brightens",
                        "continuous beam", "heavy vent glow"] },
  starPiercer: { inherits: "railship", silhouette: "starPiercer",
                 note: "Siege pod: wider, heavier shell split; the extending rail condenses a " +
                       "swelling essence core at the muzzle — the siege charge about to fire.",
                 cues: ["shell splits + rail extends with charge", "essence core swells at the muzzle",
                        "ONE instant devastating blast", "weak-point marker on cracked leaders"] },
  supernova:   { inherits: "railship", silhouette: "supernova",
                 note: "The furnace gone critical: shell opens on ramp into an oversized lens, " +
                       "plus a CORONA ring around the hull that burns brighter as heat builds.",
                 cues: ["corona brightens with HEAT (the nova you're owed)", "prominence arcs lick off the ring",
                        "FLARE NOVA blast ring on [E]"] },
  starbreak:   { inherits: "railship", silhouette: "starbreak",
                 note: "Heaviest shell, longest telescope, dorsal rift-blades — space is thin " +
                       "around this ship. Its blast scar lingers and detonates.",
                 cues: ["full rail extension + big essence core at max charge",
                        "lingering RIFT scar on the shot line", "scar pulses faster, then collapses"] },

  // Hammerhead — all mass forward: bolted ram slab, stubby tug body, oversized engines.
  hammerhead: { hue: "#ff7a3c", silhouette: "hammerhead",
                accent: "heavyNose",
                cues: ["ram face heats orange->white with windup", "shockwave ring on impact",
                       "spark burst on collision"] },
  maulbreaker:  { inherits: "hammerhead", silhouette: "maulbreaker",
                  note: "Serrated maul face, armored cheeks." },
  worldsplitter:{ inherits: "hammerhead", silhouette: "worldsplitter",
                  note: "Anvil head with a central cleaving ridge + hazard chevrons.",
                  cues: ["big charge telegraph", "shockwave on full-charge hit"] },

  // Gravitor — crescent hull cradling an exposed gravity core in its mouth.
  gravitor: { hue: "#b06bff", silhouette: "gravitor",
              accent: "gravityCore",
              cues: ["core brightens as rocks are loaded", "asteroids orbiting the hull",
                     "launch trail on thrown rocks"] },
  meteorist:   { inherits: "gravitor", silhouette: "meteorist",
                 note: "Launcher rails grow from the crescent horns." },
  starfall:    { inherits: "gravitor", silhouette: "starfall",
                 note: "Central launch rail splits the mouth — a volley battery.",
                 cues: ["volley startup flash"] },
  singularity: { inherits: "gravitor", silhouette: "singularity",
                 note: "Hull closes toward a ring around a VOID core (black, hot rim)." },
  eventHorizon:{ inherits: "gravitor", silhouette: "eventHorizon",
                 note: "Near-full ring + broken outer containment ring, counter-rotating.",
                 cues: ["collapse implosion effect", "strong drag field"] },

  // Flailship — a working tug: hex hull, chain-guide yoke, winch drum whose spokes
  // spin with the orb. The drivetrain that swings the wrecking ball is visible.
  flailship: { hue: "#ffd23c", silhouette: "flailship",
               accent: "chainedOrb",
               cues: ["chain line ship->orb", "drum spokes spin with the orb",
                      "wider arc when extended"] },
  twinmaul:    { inherits: "flailship", silhouette: "twinmaul",
                 note: "The drivetrain doubled: armored shoulders + TWO counter-rotating " +
                       "winch drums, one per chain.",
                 cues: ["two chained maces, opposite phase", "LMB volley staggers, RMB both at once",
                        "STATIC LASH stun flash around the heads"] },
  binaryStar:  { inherits: "flailship", silhouette: "binaryStar",
                 note: "Twinmaul's drums bridged by an energized tether manifold; the maces are " +
                       "now energized SWORDS — faster, longer reach, heavier hits (still block " +
                       "shots). The blades AND the space between them are the weapon.",
                 cues: ["twin SWORDS (was mace heads), blades point outward on their chains",
                        "steel whitens + edges glow as they swing faster",
                        "live crackling TETHER between the two swords",
                        "tether burns hotter during a synced throw (the garrote)",
                        "enemies dragged onto the wire"] },

  // ===== TIER-4 TITAN-CLASS APEXES =====
  zenith:       { inherits: "railship", silhouette: "zenith",
                  note: "Spinal siege railgun + autoaim point-defense turrets on the wings.",
                  cues: ["biggest maw rail, twin barrels + helix", "point-defense turrets pulse at nearby foes"] },
  prism:        { inherits: "railship", silhouette: "prism",
                  note: "The ramping beam splits into auto-tracking sub-beams; three forward prism emitters.",
                  cues: ["main ramping beam + fan of sub-beams onto multiple targets"] },
  juggernaut:   { inherits: "hammerhead", silhouette: "juggernaut",
                  note: "The heaviest ram cruiser — plows through everything in a straight line.",
                  cues: ["massive ram prow", "boost pods + molten edge on the overrun"] },
  cataclysm:    { inherits: "gravitor", silhouette: "cataclysm",
                  note: "Artillery dreadnought — orbital meteor barrage on a marked zone.",
                  cues: ["huge core + launch rails", "meteor rain (WIP)"] },
  devourer:     { inherits: "gravitor", silhouette: "devourer",
                  note: "A walking black hole — void core pulls enemies in; the core is lethal.",
                  cues: ["void core + containment rings", "inward gravity aura pulls foes to the lethal centre"] },
  constellation:{ inherits: "flailship", silhouette: "constellation",
                  note: "A ring of tethered blades — a lethal web you cast as an ensnaring net.",
                  cues: ["twin swords + tether (ring/web WIP)"] },
};

// Leader/crowned overlay (David-vs-Goliath legibility): bigger body, crown glyph,
// brighter bloom, AND a visibly bigger hitbox so the threat reads as also-a-target.
window.PULSAR.leaderVisual = {
  crownGlyph: true, bloomScale: 2.2, showOnMinimap: true,
  note: "Power must LOOK like power — and the larger silhouette is the honest tell " +
        "that it's now easier to hit.",
};

// Neutral objects: dim, desaturated, clearly non-threatening so PvE never reads as PvP.
window.PULSAR.objectVisuals = {
  asteroid: { hue: "#6b7280", shape: "blob" },
  crystal:  { hue: "#5eead4", shape: "shard", faintGlow: true },
  debris:   { hue: "#4b5563", shape: "fragment" },
  wreckage: { hue: "#6b7280", shape: "bigBlob" },
  pulsar:   { hue: "#ffffff", shape: "blackhole", pulsingBloom: true,
              note: "A BLACK HOLE at map center: dark event horizon + photon ring, WARPS the grid " +
                    "around it (frame-drag swirl), PULLS ships toward the core (touch it = death), " +
                    "and fires intermittent bipolar RELATIVISTIC JETS of scrap along a rotating axis." },
};
