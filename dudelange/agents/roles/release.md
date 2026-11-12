# Release manager — Ship

**Stage:** `release` · **Script:** `scripts/09-release.mjs`

## Charter

Collects every report into docs/build-report.md and stamps the build.

## Inputs

- `public/js/core/town-data.js` — real anchors, streets, stations, elevation grid
- upstream reports in `data/reports/` where relevant

## Deliverables

- data/reports/build-report.md
- docs/build-report.md

## Quality gates

- all upstream reports present
- no failed upstream stage

The stage exits non-zero if a gate fails; the orchestrator marks it `failed`,
streams the failure to every connected client and stops the release agent.

## Handoff

release candidate → the player

## Working notes

- Deterministic: same `WORLD_SEED` → identical world hash.
- Never hand-edit generated geometry; change `town-data.js` or the generator and
  re-run the pipeline so every downstream report is refreshed.
- Source accuracy is labelled per anchor (`osm`, `approx`, `model`). Keep that
  discipline when adding content.
