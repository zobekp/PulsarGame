# PULSAR.io — DEVLOG

Append-only session log. Newest entry on top. Every session ends with an entry: what changed,
files touched, new config, how to test, known limits, TODO hooks left. This is how context
survives between agents and sessions.

---

## 2026-06-25 — Project organized + design reconciled (scaffold only, no game code yet)
**What changed:** Set up the repo for serious development and reconciled the design after a
pivot from abstract energy-weapons to a spaceship class system.

**Decisions locked:**
- **Class system:** four ship families on an evolution tree (Railship / Hammerhead / Gravitor /
  Flailship), replacing the earlier weapon × armor-set matrix. Weapon+ability+identity are fused
  into the ship. Lineage preserved (Railship←Lance, Gravitor←Nova, Flailship←orbiting flail).
- **Economy:** scrap-leveling **with** the greed loop — spending banks progress, carried scrap is
  droppable, die and lose ~50% of unspent scrap; level/evolution never lost.
- **Spatial:** keep the **pulsar honeypot** at center (rich, contested) with calm asteroid edges;
  emergent gradient, no authored rings.

**Files created:** `data/config.js` (the one tuning surface), `data/classes.js` (evolution tree),
`data/farming.js` (neutral objects + pulsar), `data/visuals.js` (placeholders + readability),
`docs/DESIGN.md` (canonical), `docs/CLASSES.md`, `docs/VISUAL_SPEC.md`, `docs/ROADMAP.md`,
`AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`, `index.html` (loader stub).

**State:** no game logic yet. `index.html` is a placeholder that loads the data files and draws a
title. Phase 0 is the next task.

**How to test:** open `index.html` in a browser — you should see the title screen and no console
errors (data files loaded).

**Known limits / TODO hooks:** all `weapon`/`ability`/`passive`/`special` keys in `classes.js`
need behavior functions (Phases 1–4). Leader-scaling data (size/level) referenced by Armor Crack
scaling isn't wired yet — scaffold the scaling fn now, feed real data in Phase 2.

**Next:** Phase 0 — skeleton (loop, movement, bloom pipeline, one weapon, one asteroid).
