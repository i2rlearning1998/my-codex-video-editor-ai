# Brief W1-CODEX: logic modules (i18n, commands, shortcuts, New Project)

Wave: 1 (Codex's half; Claude is building the new shell UI in parallel — do not touch layout/CSS). Base tag: `w0`. End tag: `w1-codex`.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 0. Budget rules (the owner has a weekly usage limit; follow strictly)

- Do NOT read `docs/specs/`, `HANDOFF.md`, `docs/reference/`, or the whole of `docs/FEATURES.md`. Only look up the ledger rows for the IDs named here.
- Build these as **standalone modules with minimal wiring** into the current T3 shell — enough to prove each one works with a real e2e test, not a polished UI. Claude is rebuilding the visual shell separately and will wire your modules into it; do not restyle or rearrange the existing layout.
- Run only the file you're testing while working; run the full `npm run verify` once at the end.
- One test per ledger ID; a test may carry several IDs.
- `reports/W1-CODEX.md`: max 50 lines — results table, "not tested" list, git info. No essays.
- Commit after every step.

## 1. Goal

Four independent logic pieces the new shell will consume: a translation runtime (English + Hindi), a command registry with a Ctrl+K palette, working global keyboard shortcuts (fixing today's "Undo only works with timeline focus" gap), and the New Project dialog's validation/creation logic. Existing canvas, timeline, undo, and autosave behavior must not change.

## 2. In scope (ledger IDs)

LOC-001, LOC-002, LOC-003, LOC-004, LOC-005, LOC-006, KEY-001, KEY-002, KEY-003, KEY-005, KEY-006, KEY-007, KEY-008, KEY-009, PRJ-001, PRJ-002, PRJ-003, PRJ-004, PRJ-005, PRJ-006.

## 3. Out of scope

Any visual redesign, new CSS, icons, fonts beyond the system default, the shell layout, panels, or Tier A/B items not listed above. Schema or core/engine changes. TL-004, TL-019 (Wave 2).

## 4. Steps

### Step 1: i18n runtime (LOC-001 to LOC-006)
- No third-party library. New folder `src/i18n/`:
  - `t(key, params?)`, `getLanguage()`, `setLanguage(code)`, `subscribe(fn)` for change notification (plain pub-sub; no React needed — Claude will wrap it in a hook later).
  - Dotted keys (`app.title`), `{name}` parameter substitution, plural forms as `key_one` / `key_other` chosen via `Intl.PluralRules`.
  - `formatNumber`, `formatDuration`, `formatDate` using `Intl` with the active locale.
  - `locales/en.json` and `locales/hi.json` with about 20 seed keys covering strings already visible in the current shell (menu labels, button labels, status messages such as "Saved locally."). A unit test checks `hi` has exactly the same keys as `en`.
  - Default language from `navigator.languages` when supported, else `en`; persisted in `localStorage` key `aive.language`; sets `document.documentElement.lang` and `dir`.
  - Missing key falls back to English and calls `console.warn` in development only (never in production — check `import.meta.env.DEV`).
- **Minimal wiring for proof only:** replace the existing hard-coded English strings in `src/ui/shell.ts` with `t(...)` calls (same DOM, same classes, same layout — text content only), and add a temporary language toggle button anywhere in the current top bar (Claude will move/restyle it later; just make it functional).
- Tests: unit tests for `t`, plurals, number/date formatting, fallback warning, key-parity check. One e2e test `[LOC-002][LOC-003][LOC-004]`: toggle language, confirm visible text changes (e.g. the Save button label), confirm `document.documentElement.lang` updates, reload and confirm the choice persisted. `[LOC-001]`: a unit/lint check that `src/ui/shell.ts` and any new module contain no hard-coded user-visible English string literals outside `locales/*.json` (grep-based check is fine — don't build a full lint plugin). `[LOC-005]`, `[LOC-006]`: unit tests.

### Step 2: command registry and palette (KEY-001, KEY-002)
- `src/commands/registry.ts`: a plain array/map of `{ id, labelKey, shortcut, isEnabled(context), run(context) }`. Register today's existing actions (Undo, Redo, Cut/Copy/Paste if they exist, Duplicate, Delete, Select all, Save, Split, Add marker — whatever already has a working handler in the current shell). Do not invent commands for features that don't exist yet.
- A minimal Ctrl+K palette: a plain modal-less overlay (simple `<div>` positioned centered, no design polish — Claude restyles it) with a text input, fuzzy-filters the registry by label, Enter runs the selected command, Esc closes. This is temporary UI; keep it in its own file (`src/ui/command-palette.ts`) so Claude can swap the markup without touching the logic.
- Tests: `[KEY-001]` unit test that every registered command has a translated label (from Step 1) and a working `run`. `[KEY-002]` e2e: press Ctrl+K, type part of a label, press Enter, confirm the command executed (e.g. running "Undo" after a canvas edit reverts it).

### Step 3: global shortcuts (KEY-003, KEY-005 to KEY-009)
- Move keyboard handling to a single `document`-level listener (`src/commands/shortcuts.ts`) that consults the registry, replacing any per-panel/per-element keydown handlers that currently limit Undo/Redo/Delete/etc. to one focused element.
- Rules: shortcuts never fire while `document.activeElement` is an input, textarea, or contenteditable. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y route to Undo/Redo from anywhere. Ctrl+S saves and calls `preventDefault()` (suppress the browser save dialog). Space toggles play/pause except while typing. Esc: cancel the current drag gesture if one is active, else close the topmost open overlay (palette or a dialog), else clear selection — in that priority order.
- Add a shortcut cheat-sheet: Ctrl+`/` opens a plain list (temporary markup, own file `src/ui/shortcut-sheet.ts`) of every registered command and its shortcut, pulled from the registry.
- Tests: one e2e file `e2e/shortcuts.spec.ts` — `[KEY-003]` Ctrl+Z undoes a canvas drag when focus is on the canvas AND when focus is elsewhere (e.g. after clicking a top-bar button); `[KEY-005]` Ctrl+S doesn't open the browser dialog and triggers a save; `[KEY-006]` typing in a text input does not trigger Delete/Split/etc.; `[KEY-007]` cheat sheet opens and lists at least Undo, Redo, Save; `[KEY-008]` Esc during an active canvas drag cancels it without moving the layer; Esc with the palette open closes the palette first; `[KEY-009]` Space toggles play/pause, and does not while a text input is focused.

### Step 4: New Project dialog logic (PRJ-001 to PRJ-006)
- `src/project/new-project.ts`: pure logic, no styling — a function `validateNewProject(input)` returning either the normalized project settings or field-level errors, and `createProjectFromSettings(settings)` that builds a project via the existing engine/session boundary (`engine.load`), following the current session-reset rules (no schema change).
- Rules to encode: aspect presets 16:9, 9:16, 1:1, 4:5, 2:3, 21:9, 4:3 and "custom"; resolution presets per aspect at 720p/1080p/1440p/4K equivalents; custom width/height must be even integers within a sane range (e.g. 16–7680); frame rate one of 24/25/30/50/60; background is a solid color or "transparent".
- **Minimal wiring for proof only:** a plain unstyled form (own file `src/ui/new-project-form.ts`) invoked from a temporary button in the current shell, calling the two functions above. Claude will replace this markup with the designed dialog.
- Tests: unit tests for `validateNewProject` covering every preset, custom size validation (rejects odd numbers and out-of-range), and frame rate validation. One e2e test `[PRJ-001][PRJ-002][PRJ-003][PRJ-004][PRJ-005][PRJ-006]`: open the temporary form, pick 9:16 + 1080p equivalent + 30fps + transparent background, submit, confirm via the read-only test hook that the new composition has the expected width/height/fps and a transparent background flag.

### Step 5: finish
1. `npm run verify` exits 0; `npm run ledger` exits 0.
2. Set the 19 in-scope IDs to `Verified`.
3. Update `docs/STATUS.md` (3 lines: what's done, what's temporary/to-be-restyled, what's next). Note in `docs/DECISIONS.md` (one line) that the palette/cheat-sheet/new-project-form markup in this wave is intentionally unstyled and will be replaced by Claude's shell work — do not let a future session "polish" it by accident.
4. `reports/W1-CODEX.md` (max 50 lines): results table, "not tested" section, git log, patch/stat.
5. Tag `w1-codex`, run `npm run patch -- w0 w1-codex W1-CODEX`. Stop.

## 5. Acceptance

- [ ] `npm run verify` and `npm run ledger` exit 0.
- [ ] All 19 IDs `Verified` with real Playwright tests (per-ID titles).
- [ ] i18n, commands, shortcuts, and new-project logic each live in their own files, importable independently of `src/ui/shell.ts`'s layout — so they can be re-wired into a new shell without changing their internals.
- [ ] No change to canvas/timeline/undo/autosave logic, schema, or frozen contracts.
- [ ] The temporary UI bits (palette, cheat sheet, new-project form, language toggle) are functionally correct but explicitly marked (in a code comment and in DECISIONS.md) as placeholder markup pending restyle.
- [ ] `reports/W1-CODEX.md`, `.patch`, `.stat.txt` exist; tag `w1-codex`; working tree clean.

## 6. Do not

Do not touch `src/style.css`, panel layout, icons, or anything Tier-A-shell-shaped. Do not build Export, media import, effects, or Wave 2+ items. Do not fix TL-004/TL-019.
