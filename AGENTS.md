# AGENTS.md: permanent rules for the AI-Native Video Editor

This file supersedes the T3-era AGENTS.md (archived at `docs/archive/AGENTS.T3.md`). Read it fully at the start of every session.

## 0. The project in five lines

- A browser-first professional video and motion-graphics editor for YouTubers and teachers. Full-featured, from easy to advanced, in the spirit of Canva + Clipchamp + After Effects.
- Build order: the **complete manual editor first (Waves 0 to 9)**; **AI last (Wave 10)**. AI is not authorized before the owner says so.
- One engine, one Scene Graph, one Command Bus. Manual UI, shortcuts, templates and (later) AI all use the same semantic commands.
- The owner is not a programmer. He tests by hand in a browser. Your reports must therefore be plain, complete and honest.
- Quality is measured by `docs/FEATURES.md` (the Feature Ledger) and by real-browser tests, not by claims.

## 1. Authority order

When instructions conflict, the higher item wins. If a conflict is not resolved by a higher item, stop and report it.

1. This file.
2. `docs/PROCESS.md` (how work, reports and bugs are handled).
3. The current brief in `briefs/` (defines the scope of this session).
4. `docs/FEATURES.md` (definition of done, by ID).
5. `docs/DECISIONS.md` (approved technical and product decisions).
6. Contracts: `TRANSFORM_CONTRACT.md`, `TRANSFORM_INTERACTION_CONTRACT.md`, `ARCHITECTURE.md`.
7. `docs/specs/*` (vision and reference only; broader than the ledger; never a reason to build unlisted work).
8. Chat messages.

Obsolete and no longer binding (archived): "current approved scope is Tier 2.2.1", "timeline/playback not authorized", "inspector may edit only six fields", "libraries are presentation only", and any other Tier-era restriction. The ledger and the current brief define scope now.

## 2. Session protocol

**Start.** Read this file, `docs/PROCESS.md`, the brief, the ledger sections the brief names, `docs/STATUS.md` and `docs/DECISIONS.md`. Check the git branch and that the working tree is clean.

**Work.** Implement only the ledger IDs listed under "In scope" in the brief. Anything else you notice (missing features, ideas, bugs elsewhere) goes into `docs/BACKLOG_INBOX.md` as one line each. Do not build it and do not silently fix it.

**Loop.** Implement, run `npm run verify`, fix, repeat. Do not report until every in-scope P0 item is either `Verified` or explicitly listed as not done with a reason.

**End.** Update `docs/FEATURES.md` statuses, `docs/STATUS.md`, `docs/DECISIONS.md` (new decisions), and `CHANGELOG.md`. Write `reports/<Wave>.md` from `reports/TEMPLATE.md`. Create the review patch with `npm run patch -- <prevTag> <thisTag> <Wave>`. Tag the result. Stop. Never start the next wave.

Do not ask the owner questions in the middle of a session unless you are blocked. Otherwise decide, record the decision and its reason in the report, and continue.

## 3. Scope discipline

- One brief per session. One wave per brief. Do not "get ahead".
- Do not remove, rename or weaken existing working behavior.
- Do not change frozen contracts, schema, or core semantics unless the brief explicitly authorizes it.
- New runtime dependencies need a line in the report: name, version, size, reason, alternative considered. Approved by default: whatever `docs/DECISIONS.md` lists. Everything else needs the brief's permission.
- Do not reformat or refactor unrelated code.

## 4. Architecture rules (frozen; carried over and still binding)

- Exactly one editor engine, one canonical Scene Graph and one Command Bus. No parallel editable stores. No duplicate parent/child representations.
- UI never mutates canonical project state. Every mutation is a typed, runtime-validated semantic command. Related edits use one atomic transaction. Keep intentional undo/redo boundaries.
- Public state is read-only and runtime-frozen. Never expose mutable live snapshots or draft references.
- `src/core` stays independent of DOM, UI frameworks, storage APIs, rendering, networking and service clients.
- Follow `TRANSFORM_CONTRACT.md` and `TRANSFORM_INTERACTION_CONTRACT.md`. The renderer consumes `src/core/transforms.ts`; never duplicate transform math. `MOVE_LAYER` preserves stored local transforms. Transformed `UNGROUP` stays rejected.
- `engine.load` is a validated session boundary with cleared history. It is not a shortcut for ordinary edits.
- Capability commands use the same command, transaction, history and validation path. Handlers are synchronous and side-effect-free.
- `src/render` owns a replaceable, read-only render adapter without engine access. Render records are disposable projections.
- Session state (`src/ui/session.ts`) holds only transient UI state. Selection creates no commands, history or autosave. Never commit on pointermove; commit once on release; cancelled or no-op gestures create no history.
- Persistent project data is JSON-safe and explicitly versioned. Validate at command, import, migration and persistence boundaries. A schema change requires a version bump, consecutive migrations and regression fixtures. Preserve newer-version documents.
- Placeholders (effects, masks, audio tracks, transitions, keyframe interpolation) do not implement those systems until a brief builds them. Never claim otherwise.
- Assets are references and metadata in the project. Media bytes never go into project JSON or localStorage. Media bytes live in the media store (`src/media`, OPFS with IndexedDB fallback) behind an interface, outside `src/core`.
- Keep backup and recovery safety. Surface storage failures. Never overwrite an unsupported future-version primary save.

## 5. UI rules (apply from Wave 1)

- React + TypeScript for panels, dialogs, menus and inspector (see D-003). `src/core` stays framework-free. Canvas and timeline drawing may stay imperative or canvas-based for performance. Bind the engine and session to React with `useSyncExternalStore`; add no second state store.
- Every user-visible string is a translation key. No hard-coded UI text (a test enforces this from Wave 1).
- Design tokens only; no hard-coded colors, spacing or font sizes in components. Line icons from the single icon set.
- Every icon-only control has an accessible name and a tooltip with its shortcut. Every action is a registered command (Wave 1 onward), reachable from menu, shortcut and palette where applicable.
- Every panel has empty, loading and error states. No raw floating-point numbers in the UI.
- Match the approved target look (dark navy surface, indigo accent, rounded cards, line icons). "Same feel", not pixel copy. Branding is temporary and lives in one config file.

## 6. Testing rules

- Three layers: Vitest unit tests for core logic; Vitest/jsdom tests for isolated UI logic; **Playwright end-to-end tests in real Chrome or Edge for every user-visible behavior**.
- jsdom tests never count as proof of user-visible behavior. Only Playwright tests do.
- E2E tests act like a user: real mouse and keyboard (`page.mouse`, `locator.click`, `page.keyboard`). HTML5 drag and drop may use `dragTo` or dispatched drag events. Never call engine commands from a test to simulate a user action.
- Assertions on internal state use only the read-only test hook (`window.__AIVE__`). It is dev/test only and must never be mutating.
- Every e2e test title starts with its ledger ID in brackets, e.g. `[TL-020] split at playhead...`. One test may carry several IDs. `npm run ledger` enforces the mapping.
- No fixed sleeps. Use web-first assertions, `expect.poll`, `toPass`. Flaky tests are fixed, not retried into passing.
- The console-error guard is on for every test. Do not add exceptions without a written reason in the test file.
- A known unfixed bug is recorded as `test.fail('[ID] ...')` with the reproduction. A bug being fixed gets a normal failing test first, then the fix.
- Every bug fix adds a regression test that names the ledger ID.
- `npm run verify` is the only definition of green. It runs format check, typecheck, unit tests, build, e2e, hook assertion and ledger validation.
- If the sandbox blocks launching the browser, request elevated execution. If it is still blocked, report exactly what was blocked and stop. Never skip e2e silently.

## 7. Reporting honesty rules

- Use `reports/TEMPLATE.md`. Never omit a section. "None" is allowed only where the template says so.
- Do not write "complete", "fully working" or "all features" unless the named ledger IDs are `Verified`.
- Report test counts by layer (unit, jsdom, e2e) and the browser and version used for e2e.
- List what you did **not** test. An empty "not tested" section is treated as a red flag.
- Never mark an item `Verified` without a passing test that names it. Never hide a failing item; mark it `Bug` with a `test.fail` reproduction and describe it in the report.
- Distinguish clearly: built and verified, built but unverified, not built.
- Include the owner try-it script and state which steps you ran yourself in the browser, with screenshot paths.

## 8. Git rules

- Wave 0 works on `main`. From Wave 1 on, use branch `wave-<n>-<slug>` and merge after the owner accepts.
- Small logical commits. Message: `type(scope): summary [IDs]`, e.g. `feat(timeline): ripple delete [TL-023]`.
- Tag at the end of every wave: `w0`, `w1`, and so on. The review patch for wave N is `git diff w(N-1)..wN`; for Wave 0 the base is tag `m0`.
- No force push. No history rewriting. Never commit secrets or `.env*` files. The Pixabay key lives in `.env.local` (ignored).
- End every session with a clean working tree.

## 9. Environment notes (Windows, PowerShell)

- Paths contain spaces: quote them. Do not assume POSIX globs.
- The default npm on the machine may be 9.x; the project needs npm 10+. `npx --yes npm@10 <cmd>` is the known workaround. Node is 20.5.0 locally; report the minimum Node that Playwright and other tooling actually need. Do not upgrade Node silently.
- Reference machine for performance: AMD Ryzen 9 7900X, RTX 3070 Ti 8 GB, 16 GB RAM. Baseline media is 1080p; 4K is a stress case.
- Git may report "dubious ownership" inside the sandbox. Use the process-local `git -c safe.directory=<path>` override. Never change global git config.

## 10. Stop conditions

Stop and report (do not improvise) when:

- a brief requires changing a frozen contract or the schema without saying so;
- two authoritative documents conflict;
- a required tool or permission is blocked;
- an in-scope ledger item is ambiguous enough that two reasonable readings would produce different behavior (pick the safer reading, record it, and continue if it does not change the architecture; otherwise stop).
