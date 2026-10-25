# Brief P1-QA: preflight before export (Phase 1, slice 2)

Owner: "Han shuru karo" (Oct 2026), next Phase 1 job.

## In scope

- QA-001, QA-002 (docs/FEATURES.md, section QA). QA-003 is added as Todo for the checks not built.

## Design (schema 9 unchanged, no dependencies)

- `src/export/preflight.ts`: pure `preflight(scenes, assets)` returns issues (empty scene, empty lane, outside canvas, low resolution, outside safe area) from the render adapter's resting geometry.
- The export dialog lists them (warnings never block the export) with a Show button; the shell opens the scene and selects the layer.

## Non-goals

- Missing fonts, text overflow, audio clipping (QA-003).
