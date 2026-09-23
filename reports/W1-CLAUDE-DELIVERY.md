# Wave 1: combined delivery (Claude's shell + W1-CODEX, merged and tested)

This is **one integrated codebase**, not two things to merge — I took Codex's W1-CODEX work
(reports/W1-CODEX.md, .patch) and my own shell rebuild and combined them myself in my sandbox,
so Codex does not need to spend budget resolving conflicts. Everything below was tested
together, in real Chromium, against the actual project source.

## Why a merge was needed

Both W1-CODEX and my shell work started from the same `w0` tag and both rewrote large parts of
`src/ui/shell.ts` and touched `src/main.ts`. Applied separately, the patches would have
conflicted badly. I read Codex's full patch, extracted their new files, and hand-merged their
logic (i18n, commands, shortcuts, New Project) into my new layout, then re-tested everything.

## What I found and fixed while merging

- **A real bug I had introduced earlier**: in my first shell delivery, I had moved the real
  "Open project" file input into the Media panel and relabeled it "Import" — so clicking what
  looked like a media-import button would instead prompt to replace the whole project (and only
  accepted `.json`). Fixed: "Open project" is back in the File menu; the Media panel's "Import"
  is now an honest disabled placeholder with a tooltip.
- **An Escape-key conflict**: Codex's global shortcut dispatcher and my modal/menu components
  each handled Escape independently. If my modal or hamburger menu was open, the global handler
  (which runs first, in the capture phase) didn't know about them and would fall through to
  deselecting canvas layers instead of closing the modal. Fixed by registering my modal and
  menu into Codex's shared overlay stack (`temporary-overlay.ts`, one new small exported
  function, `registerExternalOverlay`) so Escape always closes whichever overlay is actually on
  top. A persistent modal's "Escape does nothing" contract still holds.
- **A one-way language toggle bug** in Codex's original temporary button (it always displayed
  "हिन्दी" regardless of the current language, so switching back to English had no visible
  label change). My version shows "हिन्दी" or "English" depending on the current state.
- **`canvas-interaction.ts` and `timeline.ts`**: I had read Codex's small, well-designed
  `externalKeyboard` patches for these files earlier but hadn't actually applied them — caught
  by the typechecker (wrong argument counts) and fixed.
- Styled Codex's three intentionally-unstyled temporary overlays (command palette, shortcut
  sheet, New Project form) using my design tokens, without touching their logic.

## Verified together (real Chromium, 29 automated checks)

| Check | Result |
|---|---|
| Fresh load: no console errors | PASS |
| Open/cancel/Esc on the project-replace modal | PASS (3) |
| Rename project, Undo, Esc-cancel | PASS (2) |
| Save-status pill (Saved → Unsaved → Saved) | PASS |
| Hamburger menu open/Esc/outside-click | PASS |
| About dialog | PASS |
| Left rail category switch | PASS |
| Right panel tabs + icon rail sync | PASS |
| Asset search filter | PASS |
| Drop overlay | PASS |
| Canvas select/deselect, drag+Undo | PASS (2) |
| Timeline Split, Duplicate | PASS (2) |
| Undo/Redo (drag = one step, Redo reapplies) | PASS |
| Playback Play/Stop | PASS |
| Inspector Position X edit + Undo | PASS |
| No overflow at 1024×768/1280×720/1440×900/1920×1080 | PASS |
| **Language switch**: toggles live, persists across reload, `<html lang>` updates | PASS |
| **Command palette** (Ctrl+K): opens, filters, Esc closes | PASS |
| **Command palette executes a command** (ran Undo from the palette) | PASS |
| **Shortcut sheet** (Ctrl+/): opens, lists shortcuts, Esc closes | PASS |
| **Global Ctrl+Z** works with focus outside the canvas/timeline (the old gap) | PASS |
| **Space** toggles playback globally | PASS |
| **Typing guard**: Space/shortcuts do nothing while renaming the project | PASS |
| New Project: invalid custom size shows a field error, form stays open | PASS |

**Not fully verified:**
- **CV-007 (corner-handle resize)**: as in my first report, my test harness's click coordinates
  for the small resize handle aren't quite precise enough to trigger the gesture reliably.
  Unrelated code, unchanged by this merge. Please re-check by hand.
- **New Project end-to-end creation**: I confirmed this works correctly in an isolated manual
  run (fill form → submit → native "Replace project?" confirm → new 1080×1920 project created),
  but my repeatable automated test for it is flaky — Playwright's native-dialog handling
  doesn't play well with my particular test harness when a `window.confirm()` fires mid-test.
  This is a test-tooling limitation, not a sign of an app bug; still, please re-verify by hand
  and consider that `new-project-form.ts` uses `window.confirm()` (native) while the rest of the
  app now uses the styled `confirmDialog()` — a small consistency follow-up, not a blocker.
- TL-004/TL-019/REL-001 status unchanged (TL-004/TL-019 are Wave 2 work; REL-001 was fixed in my
  first delivery).
- `npm run build` (Vite) still could not run in my sandbox (Windows-only `node_modules` here,
  no Linux rollup binary). `tsc --noEmit` is clean; my own no-bundler build runs the merged app
  correctly with zero console errors across 29 checks, but Codex should run the real
  `npm run build` and `npm run verify` for the first authoritative pass.
- I did not re-run Codex's own Vitest/Playwright suites (`tests/i18n.test.ts`,
  `tests/commands.test.ts`, `tests/new-project.test.ts`, `e2e/i18n.spec.ts`, etc.) — some of
  their e2e tests assert against the *old* shell markup (e.g. selectors for the temporary
  top-actions buttons they added, which no longer exist now that those actions live in my
  hamburger menu) and will need small selector updates. This is expected and listed below.

## Files in this zip (26 total — every file needed for Wave 1, ready to copy over the repo)

New (14): `src/ui/tokens.css`, `src/ui/icons.ts`, `src/ui/components/modal.ts`,
`src/ui/components/toast.ts`, `public/favicon.svg`, `src/i18n/index.ts`,
`src/i18n/locales/en.json`, `src/i18n/locales/hi.json`, `src/commands/registry.ts`,
`src/commands/shortcuts.ts`, `src/project/new-project.ts`, `src/ui/new-project-form.ts`,
`src/ui/command-palette.ts`, `src/ui/shortcut-sheet.ts`, `src/ui/temporary-overlay.ts`.

Modified (12): `index.html`, `src/style.css`, `src/ui/shell.ts`, `src/ui/workspace.ts`,
`src/ui/inspector.ts`, `src/ui/timeline.ts`, `src/ui/canvas-interaction.ts`,
`src/core/model.ts`, `src/core/commands.ts`, `src/main.ts`, `src/persistence/local.ts`.

## Integration steps for Codex

1. Copy every file in this zip over the same path in the repo. This supersedes both my earlier
   `w1-shell-delivery.zip` and the shell/main.ts/canvas-interaction.ts/timeline.ts parts of your
   own `W1-CODEX.patch` — do not apply that patch on top of this; these files already contain
   everything from it plus the merge. Your other new files not touched here
   (`tests/*.test.ts`, `e2e/*.spec.ts`, `docs/`, `briefs/`) are untouched by me and should be
   kept as-is.
2. `npm ci && npm run build` — first real Vite build of this combined code.
3. `npm run check` (typecheck/unit/jsdom).
4. `npm run e2e` — expect some of your own new e2e specs to fail on stale selectors, since the
   temporary top-actions buttons you added (`#new-project`, `#open-palette`, `#open-shortcuts`,
   `#language-toggle` as a direct child of `.top-actions`) now live inside my hamburger menu
   with the same **ids**, just different **DOM location** (`#app-menu` → open via `#menu-trigger`
   first). Any e2e test that clicks these ids directly should still work; any test that assumed
   the OLD unstyled palette/sheet/form markup classes (not ids) may need small updates for the
   new CSS classes I added (structure/ids are unchanged, only visual styling).
5. Consider replacing `new-project-form.ts`'s single `window.confirm()` call with the app's
   `confirmDialog()` (from `src/ui/components/modal.ts`) for visual consistency — low risk,
   not done here to avoid touching your tested logic without running your test suite myself.
6. Re-verify CV-007 and the New Project end-to-end flow by hand (see "Not fully verified" above).
7. Update `docs/FEATURES.md` and `docs/STATUS.md` for the combined Wave 1 scope once your suite
   passes.
