# AGENTS.md — PULSAR.io

Portable instructions for any coding agent (Antigravity, Claude Code, Cursor, etc.).

## Read first, in this order
1. `docs/DESIGN.md` — canonical source of truth (pillars, economy, spatial model, architecture).
2. `docs/CLASSES.md` — the four ship classes and their evolutions.
3. `docs/ROADMAP.md` — the phased build plan. Work the current phase only.
4. `docs/VISUAL_SPEC.md` — readability rules + placeholder visuals (when doing render work).

## Non-negotiables
- **Canvas 2D, vanilla JS, no framework, no build step** through prototype phases. Data files
  load as plain `<script>` tags (they attach to a global `PULSAR` namespace).
- **`data/config.js` is the ONE tuning surface.** No gameplay constant hard-coded in logic.
- **Data-driven content.** Classes/objects/visuals live in `data/*.js`; behavior is resolved by
  the string keys on each class (`weapon`/`ability`/`passive`/`special`). Adding content = data.
- **Never leave the game broken.** Each phase ends playable.
- **Scaffold missing systems with TODO hooks** instead of faking them or blocking.

## Session protocol
- Build ONLY the current phase/task from `ROADMAP.md`. Don't pull future work forward.
- Keep new numbers in `config.js` with an intent comment.
- End every session by appending to `docs/DEVLOG.md`: what changed, files touched, new config,
  how to test, known limits, TODO hooks left.
- Surface architectural forks to the human instead of silently choosing — especially anything
  affecting fixed-timestep determinism (needed for Phase 5 netcode) or the data-driven boundary.

## Where things live
```
index.html        loader + (future) game entry
data/config.js    all tunable numbers
data/classes.js   evolution tree (data + behavior-hook keys)
data/farming.js   neutral objects + pulsar
data/visuals.js   placeholder silhouettes + readability constants
docs/             DESIGN (canonical), CLASSES, VISUAL_SPEC, ROADMAP, DEVLOG
```
