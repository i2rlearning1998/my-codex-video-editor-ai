# Report: X-series, import code animations (Tiers A, B, C) and templates (X1 to X6) (2026-10-12)

## 1. Summary

- A code animation is now a layer (schema 8, one optional `code` field). It sits on a visual lane as a full-canvas transparent clip and takes every clip tool: move, trim, Fade, Speed, Reverse, Filters, Effects, Adjust colors, Transitions and Animate presets.
- Frames are baked in order into a lossless PNG cache (OPFS, with IndexedDB as the fallback), with memory and disk budgets, LRU, Draft/Full quality and partial playback. The preview and the export read the same frames. The clip shows "Rendering n %" with Cancel and Resume.
- Import comes from Media › Import › Import code animation, a dropped .json/.js/.mjs/.html file, or a paste. The source is classified as A (Composition Spec, one undo step), B (block) or C (free code). Errors are plain language (line, what, how to fix). The dialog shows the tier badge, a live thumbnail, the params and the duration. Edit code reuses the dialog.
- Animation settings in the right rail: one control per param. Blocks re-render as you change them; free code changes apply with Apply. Each change is one undo step.
- Code templates live in My Templates › Code animations: thumbnail, hover preview, click or drag to insert, rename, duplicate, delete with Restore, and export/import as .json.
- X5 merges Codex's sandboxed Tier C runtime unchanged and connects it. All ten reference samples run end to end. **Preview vs. Export frame max channel difference is 0/255 on all ten** (spec target 1/255, or 2/255 for WebGL).

## 2. Scope and results

| ID       | Result   | Evidence                                                                                                                       |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CODE-001 | Verified | e2e/x1-code-layer.spec.ts; tests/x1-code-layer.test.ts (schema 8, migration, command, validator)                               |
| CODE-002 | Verified | e2e/x1-code-layer.spec.ts (bake in order, cancel keeps frames, resume, Draft quality); tests/x1-code-layer.test.ts (key, LRU)  |
| CODE-003 | Verified | e2e/x1-code-layer.spec.ts (Export frame and the video export, Start/End range); e2e/x5-runtime.spec.ts (measured, see below)   |
| CODE-004 | Verified | e2e/x2-import.spec.ts (menu, drop, paste; A in new and current scene in one step; B; C; errors); tests/x2-import.test.ts       |
| CODE-005 | Verified | e2e/x2-import.spec.ts (badge, thumbnail, params, duration, limits, Edit code)                                                  |
| CODE-006 | Verified | e2e/x3-settings.spec.ts (B debounced re-render, C Apply, one step each)                                                        |
| CODE-007 | Verified | e2e/x3-settings.spec.ts (Fade, Reverse, Speed, a filter, an effect, Adjust colors, a transition: preview and exported frame)    |
| CODE-008 | Verified | e2e/x4-templates.spec.ts                                                                                                       |
| CODE-009 | Verified | e2e/x4-templates.spec.ts                                                                                                       |
| CODE-010 | Verified | e2e/x4-templates.spec.ts                                                                                                       |
| CODE-011 | Verified | e2e/x5-runtime.spec.ts (ten samples)                                                                                           |
| CODE-012 | Verified | e2e/x5-security.spec.ts ×3                                                                                                     |
| CODE-013 | Verified | e2e/x5-security.spec.ts                                                                                                        |

Measured on the ten reference samples. Setup: 1080p, 24 fps, 96 frames. Each sample also had a param change, Fade in 1 s and the Color shift effect applied, and was measured at 2 s. The preview is the editor canvas at 100 % zoom with an integral view offset; it is compared with the Export frame PNG. The video column is the WebM (VP9, lossy) middle frame of a 1.5 to 2.5 s export, compared with the same PNG.

| Sample          | WebGL | Preview vs. PNG max | Video vs. PNG mean |
| --------------- | ----- | ------------------- | ------------------ |
| particles       | no    | 0                   | 0.745              |
| three-scene     | yes   | 0                   | 0.412              |
| pixi-field      | yes   | 0                   | 0.161              |
| lottie-mark     | no    | 0                   | 0.343              |
| aurora          | no    | 0                   | 0.608              |
| shader          | yes   | 0                   | 0.519              |
| typography      | no    | 0                   | 0.216              |
| svg-infographic | no    | 0                   | 0.213              |
| chart           | no    | 0                   | 0.787              |
| parallax        | no    | 0                   | 0.756              |

- In-scope items: CODE-001 to CODE-013 are all Verified (P1, W8 by LCR).
- Not done: the media slots, effects, transitions and camera moves of a Composition Spec (Tier A) are not built in the plan adapter. They are named in a warning toast, never silently dropped (D-233). There is also no live, unbaked render while scrubbing (the spec's "may").

## 3. Checks

- `npm run verify` (Node 20.20.0, CI's major; under the sandbox's default Node 22 the two `tests/blocks/worker.test.ts` tests from main fail before e2e, on main too):
  - Run 1: unit and build green; e2e 440 passed, 20 failed. 19 were Codex's `e2e/freecode-gallery.spec.ts`: the gallery page had no favicon link, so the console guard caught the browser's `/favicon.ico` 404. 1 was `e2e/new-project.spec.ts`, which still asserted schema 7. Fixed in eb90597; those 20 then passed alone.
  - Run 2 (the one rerun): **exit 1**. Format, typecheck and build passed; unit and jsdom 802 passed in 72 files; e2e **459 passed, 1 failed** (46.4 min, one worker).
- The one failure is TL-103 (the V7 marquee auto-scroll), which this series does not touch: one sample stepped 40 px against a 39.6 px limit. It passed in run 1 and passes 5 of 5 alone (`--repeat-each=5`). It is a sandbox timing flake, recorded here and not hidden; the PR stays draft because the full run was not green.
- E2E browser: Chromium 141.0.7390.37 (sandbox fallback, D-030).
- Test hook: `assert-no-test-hook: OK (no __AIVE__ in production build)`.
- Ledger (run on its own, because verify stops at the e2e failure): `Ledger: 697 items | Verified 380 | Claimed 16 | Todo 299 | Dropped 2` · `Ledger OK`.
- CI: not polled (owner rule).

## 4. Try-it script for the owner (about 10 minutes)

| #   | Do this                                                                                     | Expect                                                                                      | ID                 | Claude ran it (Y/N) | Screenshot  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ | ------------------- | ----------- |
| 1   | New project; Media › Import (chevron) › Import code animation; paste `src/freecode/samples/chart.txt` | Tier C badge, a thumbnail, params and the duration                                  | CODE-004, CODE-005 | Y (e2e)             | test output |
| 2   | Add to timeline                                                                             | A clip with "Rendering n %", then the chart plays                                           | CODE-002, CODE-011 | Y (e2e)             | test output |
| 3   | Select it, right rail › Animation settings, change a param, Apply                          | It re-renders; Ctrl+Z undoes it in one step                                                 | CODE-006           | Y (e2e)             | test output |
| 4   | Fade in, an effect, Speed 2x                                                                | The code layer fades, takes the effect, plays faster                                        | CODE-007           | Y (e2e)             | test output |
| 5   | Export › Save frame / export a short range                                                  | Same picture as the canvas                                                                  | CODE-003, CODE-011 | Y (e2e, measured)   | test output |
| 6   | Paste `while (true) {}` code                                                                | The dialog stops it with a budget message; the editor keeps working                         | CODE-012           | Y (e2e)             | test output |
| 7   | Paste a JSON with a missing comma                                                           | "Line n: … Fix: …"                                                                          | CODE-004           | Y (e2e)             | test output |
| 8   | Import with Save as template on; Templates › Code animations; hover the card                | A thumbnail; hover plays a short preview                                                    | CODE-008           | Y (e2e)             | test output |
| 9   | Reload, new project, click the card                                                         | The code layer is inserted at the playhead and renders                                      | CODE-013           | Y (e2e)             | test output |
| 10  | Right-click the card: Rename, Duplicate, Delete then Restore, Export                        | Each works; the .json imports back                                                          | CODE-009           | Y (e2e)             | test output |
| 11  | Scene category                                                                              | The code layer has a code icon; eye and lock work                                           | CODE-010           | Y (e2e)             | test output |

## 5. Deviations from the brief

- Quality (Full/Draft) is transient session state per layer and is not saved. Schema 8 authorises one field only (D-219). Export always uses Full.
- The Tier A adapter builds layers, text, shapes, keyframes and code blocks. Media slots, effects, transitions and camera moves are named in a warning, not built (D-233).
- The sandboxed runtime is used unchanged; a 20-minute session budget covers one bake (D-236). One line was added to Codex's `freecode-gallery/index.html` (a favicon link) so his gallery e2e passes the console guard.

## 6. Decisions made

D-218, D-219 and D-231 to D-236 in docs/DECISIONS.md (D-220 to D-230 are used inside docs/CODE-LAYER.md, docs/AI-SPEC.md and Codex's report).

## 7. Not tested, known gaps, risks

- Real Chrome or Edge were not used. The sandbox has Chromium 141 (D-030), so MP4/H.264 export of code layers was not run (WebM only). CI was not polled (owner rule).
- The preview-equals-export measurement was taken on a blank project, at 100 % zoom with an integral offset. At other zooms the editor resamples the frame, which is expected.
- Pre-existing and independent of code layers (backlog):
  - Noise and spatial effects (Vaporwave up to 63/255) are computed at the scratch canvas size, so the preview differs from the export.
  - Rotated vector shapes anti-alias differently in the view and the export (up to 31/255).
- `tests/blocks/worker.test.ts` (2 tests, from main) fails on this sandbox's Node 22, on main too. CI uses Node 20.
- No live render while scrubbing: an unbaked frame shows the nearest baked one.
- WebGL bakes are slow in the sandbox (software GL, about 10 minutes per 96-frame sample). They were not measured on the reference GPU.
- A cancelled stateful bake replays from frame 0 on Resume without rewriting the frames already stored.

## 8. Architecture and contract impact

- Schema version: 7 → 8 (one optional layer field `code`, identity migration, fixture `tests/fixtures/projects/v7-rotated.json`).
- New dependencies: none. `src/freecode` (Codex, unchanged) brings its own vendored libraries.
- New core command: `SET_LAYER_CODE`. `clipSourceDuration` reads a code layer's duration.
- Files added: src/code-layer/*, src/ui/code-import-dialog.ts, code-params.ts, code-templates.ts, e2e/x1 to x5 specs, tests/x1 and x2.
- Contracts touched: none.

## 9. Ledger and backlog

- LCR applied: a CODE section, CODE-001 to CODE-013, all Verified.
- Added to docs/BACKLOG_INBOX.md: 3 (effects at output size, rotated edges, live scrub render).

## 10. Git

- Branch `claude/x-series`, draft PR #28 to `claude/v7-series` (still draft: the final full verify had one flaky failure). One commit per part (X1 to X5, docs, the verify fixes).

## Owner tick-list (owner fills this in and sends it to Claude)

| ID  | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --------------------------- | ------------ |
|     |                             |              |
