# PULSAR.io

A real-time PvP browser `.io` spaceship arena. Neon-on-black, Terraria-grade weapon VFX, four
ship classes that evolve as you level, a central **pulsar** honeypot for the fights and calm
asteroid edges for farming. Greed economy: spend scrap to bank progress, carry it and risk
dropping it. Built to be developed incrementally by coding agents against a versioned spec.

## Run
No build step. Open `index.html` in a browser. (A static server like `python3 -m http.server`
avoids any local-file restrictions.)

## Structure
```
index.html        loader + (future) game entry
data/
  config.js       THE tuning surface — every balance number, nothing hard-coded elsewhere
  classes.js      evolution tree as data (4 families, branches, behavior-hook keys)
  farming.js      neutral objects + the pulsar
  visuals.js      procedural placeholder silhouettes + readability constants
docs/
  DESIGN.md       canonical source of truth
  CLASSES.md      per-class design detail
  VISUAL_SPEC.md  readability rules + placeholder visuals
  ROADMAP.md      phased build plan with acceptance criteria
  DEVLOG.md       session-by-session change log
AGENTS.md         portable agent instructions (Antigravity, Cursor, etc.)
CLAUDE.md         pointer for Claude Code
```

## Working with agents
Canonical context is `docs/DESIGN.md`; `AGENTS.md` and `CLAUDE.md` point to it so you never
maintain the design twice. Each session: tell the agent which `ROADMAP.md` phase to build, it
builds only that, then logs to `docs/DEVLOG.md`. Tooling-agnostic — works the same whether the
model is Claude (in Claude Code or via API inside Antigravity), Gemini, or anything else.

## Core principles
Emergent over authored · simplicity is the .io edge · honest VFX (bloom = hitbox) · readability
over complexity · David-vs-Goliath (leaders are strong but bigger targets) · options not stats ·
everything data-driven · never leave the game broken.

## Status
Scaffold + reconciled design complete. No game logic yet — **Phase 0** is next. See
`docs/ROADMAP.md`.
