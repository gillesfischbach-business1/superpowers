# Agent roles — Diddeleng build environment

Nine agents own the build. They are *not* chat personas: each one runs a real
Node script against the same deterministic world the browser renders, writes a
machine-readable report to `data/reports/`, and can fail the gate.

```
cartographer → geologist → urbanist → architect → rail-engineer
      ↘ retail-hospitality → systems → qa → release
```

| Agent | Script | Report | Gate (short) |
|---|---|---|---|
| Cartographer | `scripts/01-cartographer.mjs` | `cartographer.json` | station order, anchors in bbox |
| Geologist | `scripts/02-geologist.mjs` | `geologist.json` | summit heights, no NaN |
| Urbanist | `scripts/03-urbanist.mjs` | `urbanist.json` | density, rail/park clear |
| Architect | `scripts/04-architect.mjs` | `architect.json` | interiors complete |
| Rail engineer | `scripts/05-rail-engineer.mjs` | `rail.json` | 4 stops in order, journey time |
| Retail & hospitality | `scripts/06-retail-hospitality.mjs` | `retail.json` | shops + menus stocked |
| Systems | `scripts/07-systems.mjs` | `systems.json` | determinism, saves, collisions |
| QA | `scripts/08-qa.mjs` | `qa.json` | reachability, perf budget |
| Release | `scripts/09-release.mjs` | `build-report.md` | everything upstream green |

Run everything:

```bash
npm run pipeline          # all stages
npm run pipeline:qa       # QA + release only
```

…or from the in-game panel (`P`) / the dashboard at `/agents`.
