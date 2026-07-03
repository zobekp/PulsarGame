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

  // Railship — a gun with a ship attached: dominant barrel, twin accelerator rails,
  // capacitor rings that light front-to-back with charge, rear heat vents.
  railship: { hue: "#39d0ff", silhouette: "railship",
              accent: "frontSpineGlow",
              cues: ["capacitor rings light with charge", "beam-line trail on fire",
                     "recoil kick", "heat-vent slats glow when hot"] },
  helion:      { inherits: "railship", silhouette: "helion",
                 note: "Solar-furnace rail: short barrel into a focusing lens ring that " +
                       "glows hotter as the beam ramps.",
                 cues: ["lens ring brightens with ramp", "continuous beam", "heavy vent glow"] },
  starPiercer: { inherits: "railship", silhouette: "starPiercer",
                 note: "Siege maw: twin jaws that OPEN wider with charge — maw width IS the " +
                       "beam width. No charge-line; the tell is the intake + the open maw.",
                 cues: ["maw opens with charge", "essence intake while charging",
                        "ONE instant devastating blast", "weak-point marker on cracked leaders"] },

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
  pulsar:   { hue: "#ffffff", shape: "star", pulsingBloom: true,
              note: "Brightest fixed object on the map — the literal & visual center." },
};
