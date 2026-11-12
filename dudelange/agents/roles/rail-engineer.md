# Rail engineer — Line 60a

**Stage:** `rail-engineer` · **Script:** `scripts/05-rail-engineer.mjs`

## Charter

Platforms, catenary, underpasses and the shuttle timetable between Bettembourg and Volmerange.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/rail.json
- simulated journey log

## Quality gates

- stops Burange → Ville → Centre → Usines
- full run < 15 min
- 4 tunnels / underpasses

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

station chainage + dwell timings → Systems, QA

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
