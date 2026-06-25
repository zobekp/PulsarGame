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

  starter: { hue: "#9fb3c8", silhouette: "smallTriangle",
             accent: "none", note: "Tiny neutral dart." },

  // Railship — long narrow spear; glowing front spine while charging; beam-line trail.
  railship: { hue: "#39d0ff", silhouette: "spear",
              accent: "frontSpineGlow",
              cues: ["charge glow ramps on the nose", "beam-line trail on fire",
                     "recoil kick", "heat-vent glow when hot"] },
  lancer:      { inherits: "railship", silhouette: "thinSpear" },
  starPiercer: { inherits: "railship", silhouette: "longSpear",
                 cues: ["huge beam", "screen-shake on full charge",
                        "weak-point marker on cracked leaders"] },

  // Hammerhead — wide reinforced front; heavy nose; impact shockwave ring.
  hammerhead: { hue: "#ff7a3c", silhouette: "wedge",
                accent: "heavyNose",
                cues: ["windup particles at front", "shockwave ring on impact",
                       "spark burst on collision"] },
  maulbreaker:  { inherits: "hammerhead", silhouette: "broadWedge" },
  worldsplitter:{ inherits: "hammerhead", silhouette: "massiveWedge",
                  cues: ["big charge telegraph", "shockwave on full-charge hit"] },

  // Gravitor — round/crescent body with a visible gravity-well circle + orbiting rocks.
  gravitor: { hue: "#b06bff", silhouette: "crescent",
              accent: "gravityCore",
              cues: ["visible well circle", "asteroids orbiting the core",
                     "launch trail on thrown rocks"] },
  meteorist:   { inherits: "gravitor", silhouette: "crescentHeavy" },
  starfall:    { inherits: "gravitor", silhouette: "crescentHeavy",
                 cues: ["volley startup flash"] },
  singularity: { inherits: "gravitor", silhouette: "crescentWide" },
  eventHorizon:{ inherits: "gravitor", silhouette: "crescentWide",
                 cues: ["collapse implosion effect", "strong drag field"] },

  // Flailship — ship + chained orb; chain drawn as a line; orb trail while swinging.
  flailship: { hue: "#ffd23c", silhouette: "ringedHull",
               accent: "chainedOrb",
               cues: ["chain line ship->orb", "orb motion trail",
                      "wider arc when extended"] },
  chainmaul:   { inherits: "flailship", silhouette: "ringedHull",
                 cues: ["larger orb"] },
  ironmoon:    { inherits: "flailship", silhouette: "ringedHull",
                 cues: ["massive orb", "slam launch + retract"] },
  graviflail:  { inherits: "flailship", silhouette: "ringedHull",
                 cues: ["stable defensive orbit ring"] },
  orbitCrusher:{ inherits: "flailship", silhouette: "ringedHull",
                 cues: ["spinning crush field", "small objects pulled in"] },
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
