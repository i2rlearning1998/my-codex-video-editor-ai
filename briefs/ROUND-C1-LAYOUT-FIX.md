LIMIT MODE

- One session, one run, no sub-agents. Do NOT run the full e2e suite or `npm run verify` locally. Run only: format check, typecheck, unit tests, build, and the specs named in this prompt (editor-guard, round-b-shell, and the specs of rows you change). The full suite runs on GitHub CI by itself.
- CI: do NOT wait for it. The full suite takes about 1.5 hours. Look at the status once, right after the push. If it is still running, write "CI running" in the report and stop. No polling, no wakeups.
- Draft PR only, never merge. No restyling, no unrequested features. Every item DONE with proof or BLOCKED with an outside reason.
- Never refresh or edit a golden file to make a test pass. If the editor differs from the golden, fix the code, or list it for the owner.

BRANCH: `claude/round-c1-power` (PR #54). Save this prompt as briefs/ROUND-C1-LAYOUT-FIX.md.

THE OWNER'S DECISION (binding, overrides the Round B brief where it disagrees)
The Editor is exactly what it was before AI mode existed (Round A's editor): same buttons, menus, panels, shortcuts, layout. AI mode is the same editor (same canvas, timeline, engine, history) with other OPTIONS: in AI mode the AI options show, in Editor mode the manual ones show. All AI work (Brief, Plan, chat, memory, Style, Director) happens inside AI mode only. The one and only thing AI-related that the Editor may show is ONE separate toggle "Editor | AI" to enter AI mode. No "Ask Director" anywhere in the Editor. This replaces the Round B line "Ask Director in Editor mode (top-bar button and canvas menu entry)".

PROTECTED (never delete, move, rename or restyle; the Editor guard must prove it)
The Editor's left rail category "AI" and everything inside it stay exactly as in Round A: the Creator Packs, the AI-made templates, My library, Video plans, Briefs, Import, Styles, Review & swap launched from it, and every button, tab and list in that panel. Also "My Templates" and "Theme". They are manual-editor features that the user can also use by hand. They are NOT the new AI mode. Part R removes ONLY the things listed in it by name; it never touches a rail category or its panel. If anything in the rail or its panels would change, STOP and list it for the owner.

PART R Remove everything AI from the Editor side except the toggle

1. Remove: the top-bar `#ask-director` button (shell.ts), the canvas-menu entry (canvas-menu.ts), the `ask-director` command (commands/registry.ts), its owner-menu switch entry (library-client/controls.ts), its CSS (style.css, ai-mode.css), its strings (en.json, hi.json), its tests (e2e/round-b-shell.spec.ts, tests/commands.test.ts: change them, do not weaken what remains).
   Keep "Ask Director about this scene" if it lives inside AI mode's own scene ribbon (that is AI mode UI).
2. Ledger: RDB-012's "Ask Director in Editor mode" part and any other row about it: set the part Dropped with the reason "owner decision 2026-11-15: no AI buttons in Editor mode" in docs/DECISIONS.md (new number); keep the other parts of those rows Verified by their tests.
3. The shortcut/palette command `ai-mode` stays as the toggle's registered command.

PART T The toggle
Take the AI button out of the existing mode switch (Editor | 2D Animation | 3D Animation stays exactly as it was in Round A: same group, same order, same look). Add ONE separate two-segment control "Editor | AI", same look and size as the existing mode switch, with an accessible name and a tooltip. Place it in the top bar apart from the mode switch, where it disturbs the existing controls least (choose, then say where in the report). In AI mode the same toggle is shown, and "Editor" returns. Nothing else AI-related is added to the editor top bar.

PART S Undo every other Editor-side change since Round A
Restore Round A's rules for: the top bar grid columns, `.topbar-start` clipping, `.mode-switch button` nowrap, the status line ("Saved locally") hidden below 900 px, the 767 px rule for Ask Director, the top bar gap at 899 px. Use `git diff origin/claude/round-a-panel -- src/style.css` and revert every hunk that applies to Editor mode (keep only what AI mode needs and the toggle). If the old Round A top bar overlaps at some small width (for example 820 px with wide fonts) after this, do not fix it: list it in the report as "Round A behaviour" for the owner. The toggle must fit without squeezing the existing controls at 1024 px and wider; below that, say what happens.

BUG L1 After a visit to AI mode the editor layout is broken (Round B, commit 57a89cf)
Cause, already confirmed in a browser: src/ui/shell.ts syncLayout writes `shellRoot.dataset.layout = session.layout`, overwriting the responsive value ('wide' | 'medium' | 'narrow' | 'phone') that src/ui/workspace.ts paint() writes; style.css uses [data-layout='wide'|'medium']. Removing that line alone returns the editor to its exact start geometry at 1920, 1440, 1280 and 1024, also after a resize while in AI mode, and leaves AI mode's layout unchanged. Do that: AI mode is marked only by the class `ai-layout`; data-layout belongs to workspace.ts alone. Check 390 and 700 px as well.

BUG L2 Review video plan opens in the Scene category
Cause: `openReview` (the AI host in shell.ts) does session.setLayout('editor') then openPlanReview; the side-panel host overlays whichever rail category is active. Before Round B it opened from the AI category (AI > Video plans) and its back arrow returned there.
Fix: select the AI category and open the left panel before the review opens, for this caller and every other caller of openPlanReview; the back arrow returns to the AI category's list; the review does not follow a switch to another category.

PART G EDITOR GUARD (permanent)

1. Make a git worktree of `origin/claude/round-a-panel` (the Editor before AI mode). With a Playwright script on that code record e2e/editor-guard.golden.json:
   a. Boxes [x, y, w, h] (rounded) and visibility of .topbar, #rail-left, .library, .preview-panel, .inspector, #rail-right, .timeline, .statusbar, #composition-canvas, and the data-layout value, at 1920x940, 1440x900, 1280x800, 1024x768 and 390x844, in these states: fresh; each rail category (Templates, Elements, Text, Media, Draw, Scene, Record, Audio, AI, MyTemplates, Theme); left panel collapsed; right panel collapsed; timeline collapsed and expanded; 2D Animation mode and back; a layer selected; a project with several scenes.
   b. The LISTS of labels (text and ids) of: the top bar controls, the hamburger menu, the canvas right-click menu (with a layer selected and with nothing), the command palette, each rail category's panel (every button, tab, heading, label and input placeholder in it), the right panel's tabs, the timeline toolbar, the context toolbar, and the keyboard shortcut list.
2. e2e/editor-guard.spec.ts (ID RDC1-100) compares the current code to the golden: boxes within 2 px; lists equal. The ONLY allowed differences are written in the spec's header comment, exactly: the new "Editor | AI" toggle element and the `ai-mode` palette command; the removed editor chat button (owner decision: chat lives in AI mode); and the horizontal shift of top bar controls caused by the toggle's width (list each shift in the report). Any other difference is a bug: fix the code; if you think it is intended, STOP and list it for the owner. The Editor's menus, canvas menu, palette and panels are compared item by item with the golden of Round A, including the whole "AI", "My Templates" and "Theme" rail categories and their panels. The only new things allowed are the toggle and the `ai-mode` palette command. Nothing may be missing.
3. Scenarios not in Round A: Editor to AI to Editor; resize while in AI then back; reload while in AI then switch back; a Video built in AI mode then back to Editor; the Home link that opens a Video with ?ai=1 then back; five round trips in a row. After every return the boxes and lists equal the golden.
4. RDC1-102: after every return from AI mode the editor's own actions still work (click-select a layer, drag it, undo, a shortcut, play and pause, seek, the canvas menu), same as a fresh editor.

PART L3 Collisions
Search src/ for every place two parts write the same DOM attribute, class or CSS custom property (data-layout, classList on .editor-shell, --left-col, --left-panel...). List each in the report as safe or fixed.

PART L4 Performance (read only unless it fails)
Measure one state change with a 400-layer project and a heavy library item pending (scheduleFull/usesAsset in shell.ts stringifies the compositions on each state change). If over 4 ms, replace it with a set of used asset ids kept from the change events, keeping the behaviour (instant insert from the poster, full file swapped in without moving).

FINISH

- Ledger rows RDC1-100 to RDC1-103, docs/DECISIONS.md, docs/STATUS.md, CHANGELOG.md, a short section in reports/ROUND-C1.md: which specs were run, that the full suite was not run locally, and that CI was running or its status at the push.
- Push, look at CI status once, report in plain words and stop.

CHECKLIST
[ ] R Ask Director gone from topbar, canvas menu, palette, switch, CSS, strings, tests [ ] T separate Editor | AI toggle, mode switch as Round A [ ] S other top bar changes reverted [ ] PROTECTED AI, My Templates and Theme rail categories untouched (proved by the guard) [ ] L1 one line removed, 5 sizes + resize + reload [ ] L2 review only in the AI category, all callers [ ] G golden recorded from Round A [ ] G boxes and lists guard [ ] G AI round trips [ ] G actions-after-return [ ] L3 listed [ ] L4 measured [ ] report, ledger, decisions [ ] CI status looked at once
