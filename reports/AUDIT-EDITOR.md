# AUDIT-EDITOR: every Todo and Claimed ledger row, with proof

Date: 2026-10-25. Branch `claude/fix-5` (PR #48). Owner scope: only the **Editor mode (Beginner view)** is completed now; 2D Animation, 3D Animation, view modes and pro features come later.

## How the audit was done

- The 327 rows that were `Todo` (292) or `Claimed` (35) when the audit started were read one by one.
- For each row the code was searched (file and function named in the table) and the behaviour was checked in the running app in Chromium 153 (the sandbox browser; it decodes H.264 and AAC, unlike the Chromium 141 of earlier waves). Probes were small Playwright scripts, deleted afterwards; what they saw is written in the Proof column ("probe: ...").
- **BUILT-WORKING** is claimed only with a passing Playwright test whose title names the row. Where an existing test already proves the row, the row's ID was added to that test's title (a test may carry several IDs). New tests are in `e2e/audit-editor.spec.ts`. These rows are now `Verified` in docs/FEATURES.md.
- **BUILT-PARTIAL** says exactly what is missing. **NOT-BUILT** names the search or probe that found nothing.
- **DEFERRED-LATER** is used only for the owner's list: 2D/3D animation features, view modes, ADV-001 to 008, pro colour CLR-002 to 009, project package and versions, UI language packs, brand kit, components, slide mode, CSV, and the AI wave. These rows are now `Deferred` (D-319).
- Things the owner believed were built and are **not**: ripple/slip/slide trim (TL-031), track height (TL-007), clip colour labels (TL-034, LYR-015), panel sizes persisting (LAY-005: only the timeline height persists), tab title (APP-017), main menu Edit group (APP-009). Things he believed were built and **are**: scene-to-scene "+" transition (TR-018), Filters and Effects tabs for a picture (FX-016, FX-017), marker shortcut M (TL-036), aspect-ratio change (CV-055, PRJ-025), long exports streaming to OPFS (EXP-010, not measured at 30 min), workers (export, captions, code bakes; REL-003 partial), frame cache (code layers only; REL-004 partial).

## Disabled controls: truly disabled, or stale?

Checked in the running app (probe of every button's `aria-disabled` and title) and against the code that would do the work.

| Control | In the app | Verdict |
|---|---|---|
| 3D Animation mode | disabled, "Planned for Phase 1" (test [ANI-021]) | Correct: 3D is not built (ADV-002, deferred) |
| Elements › 3D, Animations, Charts, Frames, Grids | disabled tiles (library-panel.ts PLANNED_TILES; tests [F2-003], [SHP-026]) | Correct: none of them is built |
| Rulers and guides (canvas menu › Guides) | disabled (test [CV-056]) | Correct: rulers are not built (CV-014 partial) |
| Comment (canvas menu › More) | disabled, "Needs your account" | Correct: needs accounts and collaboration (ADV-008) |
| Background remover, Magic eraser | disabled, "Needs the AI service" (toolbar and Edit image) | Correct (AI-007) |
| Smart crop, Expand (Crop panel) | disabled, "Needs the AI service" | Correct (AI-009) |
| Auto cut (clip menu) | disabled (test [TL-075]) | Correct for now; could run locally (AI-008, listed below) |
| AI wand (Player bar "AI tools") | disabled "Needs the AI service" (test [TL-073]) | Correct |
| Magic Write (Text panel) | disabled "needs the AI service" (test [FX5-005]) | Correct |
| Scene bar › Animate | disabled | Correct: scene animation is 2D animation (ANI-020, deferred) |
| **Scene bar › Transition** | was disabled "Planned for Phase 1" | **Stale**: scene-to-scene transitions are built (TR-018). Now live: adds or opens the transition into the next scene; disabled with "Add a second scene to add a transition" when there is none. Test [TR-018][CLR-001][FX-004] in e2e/audit-editor.spec.ts |
| **Edit image › Adjust, Filters** | were disabled "Planned for Phase 1" | **Stale**: Adjust colors and Filters are built in the right panel (CLR-001, FX-004). Now they open those sections. Same test |
| **Full-screen preview button** | worked, but its tooltip said "arrives in a later wave" | **Stale text**: now "Full-screen preview (Esc to leave)". Test [LAY-010] |

## AI wave 10, split as asked

- **(a) Needs the backend or an AI service** (cannot work before the Phase 1 server): AI-001 AI panel, AI-002 approvals and cost, AI-003 AI undo groups, AI-005 caption translation, AI-007 background removal, AI-009 auto reframe, AI-012 generated layouts, AI-013 provider proxy.
- **(b) Can work locally now**: AI-004 auto captions (offline Whisper already works, F2-090/FX1-010), AI-006 text to speech (works with the user's own key; the proxy comes later), AI-008 auto-cut silence (Web Audio levels), AI-010 scene detection (frame differences), AI-011 noise reduction (Reduce noise already works offline).
- All AI rows stay `Deferred`: D-001 says AI is not authorized before the owner says so.

## REALLY NEEDED NOW for the Editor, not built (Part B checklist)

Each item: why the Editor needs it, then the result. Ticked only when Done + Verified (a passing test with the ID) or Blocked with the reason.

<!-- NEEDED -->
(filled in by Part B)
<!-- /NEEDED -->

## Not needed now (moved out of the Editor scope)

Everything with verdict BUILT-PARTIAL or NOT-BUILT that is not in the checklist above: P1/P2 polish (history panel, J/K/L, layer thumbnails, stock filters, GIF and audio-only export, effect presets, pitch preservation, envelopes, beat markers, proxies, service worker), owner checks that need the reference PC (performance rows CV-032, TL-053, PB-012, FX-012, FX5-013, REL-005, REL-008, REL-009, EXP-010, MED-005), and rows superseded by a later design (track headers TL-003/005/040 by the lane menu, D-191; Inspector "nothing selected" by the canvas bar, LAY-041). They stay `Todo` or `Claimed` in the ledger with the reason in the table.

## The table

<!-- AUDIT-TABLE -->
Counts: BUILT-PARTIAL 90, NOT-BUILT 70, BUILT-WORKING 115, DEFERRED-LATER 52 (of 327).

| ID | Ledger status before | Verdict | Proof | What exactly to build |
|---|---|---|---|---|
| DEV-004 | Claimed | BUILT-PARTIAL | .github/workflows (verify job) exists; CI ran 629 e2e at 6d2a424 (D-316) but CI runs only when dispatched by hand, not on every push | Owner decision: CI trigger on push (costs Actions minutes); not editor work |
| DEV-012 | Todo | NOT-BUILT | No visual snapshot spec (grep toHaveScreenshot in e2e: none) | Not needed for the Editor (pixel tests cover layout) |
| APP-001 | Todo | BUILT-WORKING | src/brand (wordmarkHtml, one config) ; test [LAY-053] "the placeholder wordmark shows in the top bar..." now also tagged [APP-001] | Nothing |
| APP-002 | Todo | BUILT-PARTIAL | src/ui/shell.ts:417 #app-menu has File, View, Help, no Edit group; probe: Escape left the menu open (outside click closes it) | Edit group; Escape closes the menu |
| APP-003 | Todo | BUILT-WORKING | shell.ts #new-project; test [PRJ-001][PRJ-002]... "validate custom size and create a portrait project" (new-project.spec.ts) opens it from File; tagged [APP-003] | Nothing |
| APP-004 | Claimed | BUILT-PARTIAL | shell.ts:3284 #import + fixtures.openFixtureProject (used by 40+ specs); probe: an invalid file wrote its error only to the hidden status live region (no visible message) | Show the refusal as an error toast |
| APP-006 | Todo | NOT-BUILT | Only one project slot (src/persistence/local.ts LocalProjectStore, key ai-native-editor:project); grep openRecent: none | Projects list (recent first) |
| APP-007 | Todo | NOT-BUILT | No second project to delete (one slot) | Delete in the Projects list with confirm |
| APP-008 | Todo | NOT-BUILT | No duplicate project (one slot) | Duplicate in the Projects list |
| APP-009 | Todo | NOT-BUILT | No Edit group in #app-menu (shell.ts:417-438); the edits exist only as shortcuts and context menus | Edit group with live enabled state and shortcut hints |
| APP-010 | Todo | BUILT-PARTIAL | #app-menu View has palette, language, theme, brief, settings; no panel, grid, safe area or snapping toggles | View toggles: left panel, right panel, grid, safe areas, timeline snapping |
| APP-011 | Todo | BUILT-WORKING | shell.ts:434 Help group: Keyboard shortcuts, About, Copy debug report; new audit test [APP-011] | Nothing |
| APP-012 | Todo | BUILT-WORKING | shell.ts #project-name / #project-name-input; rename is outside history by owner decision D-136 (HIS-008); new audit test [APP-012] (Enter commits, Escape cancels) | Nothing |
| APP-013 | Todo | BUILT-PARTIAL | probe: #save-status-text shows "Unsaved changes" then "Saved locally."; no Saving state, no Error with Retry | Not needed now (cloud save in Part C shows its own states) |
| APP-014 | Todo | BUILT-PARTIAL | probe: after Delete the #undo title is still "Undo project command (Ctrl+Z)"; disabled state works | Tooltip names the step to undo or redo |
| APP-016 | Todo | BUILT-WORKING | src/ui/theme.ts (aive.theme); test [LAY-032] "...the choice is kept and applied before first paint" now also tagged [APP-016] | Nothing |
| APP-017 | Todo | NOT-BUILT | shell.ts:7137 document.title = t(app.title) only; probe: title stays "AI-Native" after a rename and an unsaved edit | Title "<name> • - AI-Native" with an unsaved mark |
| APP-018 | Todo | NOT-BUILT | grep beforeunload in src: none | Warn when closing with an autosave pending |
| APP-019 | Todo | NOT-BUILT | grep BroadcastChannel/locks in src/ui: none | Not needed now (one user, one tab); cloud save has its own version check |
| APP-020 | Todo | NOT-BUILT | No account slot in the top bar (grep avatar: none) | Part C makes the account slot live (Supabase Auth) |
| LAY-001 | Todo | BUILT-WORKING | H2 shell; tests [LAY-013][LAY-014] (h2-shell.spec.ts) at every window size, tagged [LAY-001] | Nothing |
| LAY-005 | Todo | BUILT-PARTIAL | Only the timeline height persists (aive.timelineHeight); left and right panel widths and collapse do not (grep localStorage in workspace.ts) | Persist panel widths and open/closed state |
| LAY-006 | Todo | NOT-BUILT | No dblclick handler on dividers (workspace.ts) | P2, not needed |
| LAY-007 | Todo | BUILT-WORKING | Superseded by the right rail (D-131, D-190): tabs by selection; test [LAY-035] tagged [LAY-007] | Nothing |
| LAY-009 | Todo | BUILT-WORKING | Player bar resize grip (LAY-048) and Collapse/Expand (TL-074); tests [LAY-048], [TL-074] tagged [LAY-009] | Nothing |
| LAY-010 | Todo | BUILT-WORKING | shell.ts:2232 #fullscreen-preview requests fullscreen on the stage (browser Esc exits); the tooltip said "arrives in a later wave" (stale, fixed in Part A); new audit test [LAY-010] | Nothing |
| LAY-011 | Todo | NOT-BUILT | No layout presets | P2, not needed |
| LAY-012 | Todo | DEFERRED-LATER | View modes (Beginner/Creator/Advanced): owner scope rule |  |
| LAY-017 | Todo | BUILT-WORKING | src/ui/components/modal.ts (focus trap, Esc, returns focus); new audit test [LAY-017] | Nothing |
| LAY-019 | Todo | BUILT-PARTIAL | Library panels have empty and error states (TPL-010 "a library that cannot load says so", LAY-060 empty Media); not every panel has a loading state | Not needed now |
| LAY-021 | Todo | BUILT-WORKING | src/ui/icons.ts one 24-unit line set; test [LAY-065] "no rendered icon is smaller than 16 px..." tagged [LAY-021] | Nothing |
| LAY-022 | Claimed | BUILT-PARTIAL | components/color-picker.ts: square, hue, hex, swatches, document colours, EyeDropper; no RGB, HSL or alpha entry (D-100) | Not needed for the Editor (hex covers it) |
| LAY-023 | Claimed | BUILT-PARTIAL | Number field, select, popover are shared (D-100); segmented controls, toggles, tabs and tooltips are separate modules | Not needed |
| LAY-025 | Todo | BUILT-PARTIAL | Canvas uses devicePixelRatio (CV-046 tests at 1.25 and 1.5); timeline and icons are DOM/SVG; not measured as a whole | Not needed |
| LAY-026 | Todo | BUILT-WORKING | Import overlay on file drag (MED-040 "a file dropped ... still hides the import overlay"); tests [MED-002], [MED-040] tagged [LAY-026] | Nothing |
| LOC-007 | Todo | BUILT-PARTIAL | tokens.css system font stack; Devanagari renders (TXT-025) but no per-language UI font loading | Not needed (system fonts cover Hindi) |
| LOC-008 | Todo | NOT-BUILT | No pseudo-locale (grep pseudo in src/i18n: none) | Not needed now |
| LOC-009 | Todo | BUILT-PARTIAL | src/i18n has en.json and hi.json and a registry; process not documented | Not needed now |
| LOC-010 | Todo | NOT-BUILT | No RTL UI language; dir is never set on the shell | D: UI language packs are later |
| LOC-011 | Todo | DEFERRED-LATER | UI language packs: owner scope rule |  |
| LOC-012 | Todo | DEFERRED-LATER | UI language packs (native digits): owner scope rule |  |
| KEY-004 | Todo | BUILT-WORKING | registry.ts edit(duplicate Ctrl+D, delete, cut Ctrl+X, copy Ctrl+C, paste Ctrl+V), select-all Ctrl+A; new audit test [KEY-004] | Nothing |
| KEY-010 | Todo | BUILT-WORKING | registry.ts edit(group Ctrl+G, ungroup Ctrl+Shift+G); probe: Ctrl+G gave "Group", Ctrl+Shift+G "Ungroup"; new audit test [KEY-010] | Nothing |
| KEY-011 | Todo | BUILT-PARTIAL | timeline.ts:2717 arrows/Home/End only while the timeline has focus, Shift = 10 frames (D-035); probe: on the canvas ArrowRight and End did not move the playhead | Global Left/Right (1 frame), Shift (1 s), Home/End when nothing is selected |
| KEY-012 | Todo | NOT-BUILT | probe: J, K, L, I, O do nothing | P1, not needed (Space plays) |
| KEY-013 | Todo | NOT-BUILT | No rebinding (grep rebind: none) | P1, not needed |
| KEY-014 | Todo | BUILT-WORKING | shortcuts.ts matches(): (ctrlKey // metaKey); test [KEY-005] etc. use Control; new audit test [KEY-014] presses Meta+Z | Nothing |
| KEY-015 | Todo | NOT-BUILT | probe: T, R, E do nothing; V only leaves draw mode (shell.ts:7115) | V select, T text, R rectangle, E ellipse |
| KEY-016 | Todo | BUILT-WORKING | canvas-menu.ts:127 ARRANGE_SHORTCUTS Ctrl+] / Ctrl+[; test [CV-026] tagged [KEY-016] | Nothing |
| PRJ-006 | Claimed | BUILT-WORKING | Transparent background was deferred (D-027); per-scene background (PRJ-024); test [CV-048][PRJ-006] passes; only solid colours by owner decision D-027 | Nothing |
| PRJ-007 | Todo | BUILT-PARTIAL | Canvas size keeps every layer where it is (CV-055, PRJ-025); no "scale to fit" choice | Canvas size › Scale content to fit |
| PRJ-008 | Todo | BUILT-WORKING | Superseded by the canvas bar (D-109, LAY-041): size, fps (PRJ-027) and background, each undoable; tests [LAY-041], [PRJ-027] tagged [PRJ-008] | Nothing |
| PRJ-009 | Claimed | BUILT-WORKING | persistence/local.ts Autosave (500 ms) + backup; new audit test [PRJ-009] (edit, reload, edit is there) | Nothing |
| PRJ-010 | Claimed | BUILT-PARTIAL | local.ts keeps a corrupt primary in :recovery and loads the backup; FutureSchemaError keeps the primary; no message is shown to the user | Folded into the recovery notice (PRJ-017) |
| PRJ-011 | Todo | BUILT-WORKING | core validator derives duration; empty scene 10 s ("0:00 / 0:10", TL-082); new audit test [PRJ-011] | Nothing |
| PRJ-015 | Todo | NOT-BUILT | Projects are in localStorage (local.ts), media in OPFS | Projects in IndexedDB |
| PRJ-016 | Todo | NOT-BUILT | No home screen or project list | Projects dialog: thumbnail, last edited, open, rename, duplicate, delete |
| PRJ-017 | Todo | NOT-BUILT | Backup restore is silent (local.ts load returns recovered=true; no dialog) | Recovery notice with the autosave time |
| PRJ-018 | Todo | DEFERRED-LATER | Named versions: owner scope rule (project package/versions) |  |
| PRJ-019 | Todo | DEFERRED-LATER | Project package: owner scope rule |  |
| MED-003 | Claimed | BUILT-WORKING | media/probe.ts; probe in Chromium 153 imported MP4 H.264+AAC, MOV and M4A; test [MED-003] passes (D-056 blocker gone: this Chromium decodes H.264) | Nothing |
| MED-005 | Todo | BUILT-PARTIAL | Bytes stay in OPFS; preview reads a File (streamed by the browser), export demuxes with Mediabunny from the file; not measured with a multi-GB file | Owner check on his PC with a big file |
| MED-008 | Todo | BUILT-PARTIAL | Type tabs, sort and search (MED-038, MED-009); no list view, no sort by duration/type | Not needed |
| MED-010 | Todo | BUILT-WORKING | Media menu Rename; test [MED-037] tagged [MED-010] | Nothing |
| MED-011 | Todo | BUILT-WORKING | Delete asks when media is used (MED-036 "media in use asks first"); test [MED-036] tagged [MED-011] | Nothing |
| MED-012 | Todo | NOT-BUILT | probe: hovering a video card adds no video element | P1, not needed |
| MED-016 | Todo | BUILT-PARTIAL | A single click adds at the playhead (MED-041); probe: a double-click added TWO layers | Double-click adds once |
| MED-017 | Todo | BUILT-WORKING | media-probe-info.ts; probe Details: dimensions, duration, codecs, fps, size, rotation, audio; test [F2-050] (Details shows the probe) tagged [MED-017] | Nothing |
| MED-020 | Todo | BUILT-WORKING | media-relink.ts Reconnect + Missing media placeholder; tests [F2-050], [MED-036] tagged [MED-020] | Nothing |
| MED-021 | Todo | BUILT-PARTIAL | probe: the VFR fixture imports, probe says fps 30 and "Variable frame rate No"; playback seeks by time (HTMLVideoElement); frame timing not measured | Not needed now; owner check |
| MED-022 | Todo | BUILT-WORKING | probe: rotation fixture reads 360 × 640 portrait; new audit test [MED-022] (layer box is portrait) | Nothing |
| MED-025 | Todo | BUILT-WORKING | Fingerprint ids (D-052); probe: re-import says "... is already in Project Media"; new audit test [MED-025] | Nothing |
| MED-026 | Todo | BUILT-PARTIAL | Folders (MED-038); no tags | Not needed |
| MED-027 | Todo | NOT-BUILT | No proxies | P1, later |
| MED-028 | Todo | BUILT-WORKING | stock-panel.ts Pixabay/Pexels; tests [F2-003], [FX1-003] tagged [MED-028] | Nothing |
| MED-029 | Todo | BUILT-WORKING | Pixabay videos; test [FX1-003] tagged [MED-029] | Nothing |
| MED-030 | Todo | BUILT-WORKING | Add downloads into Media; test [F2-003] tagged [MED-030] | Nothing |
| MED-031 | Todo | BUILT-WORKING | Keys in Settings (F2-001), friendly errors (F2-004, FX1-007), attribution (F2-003); tests tagged [MED-031] | Nothing |
| MED-032 | Todo | NOT-BUILT | No stock filters | P1, not needed |
| MED-033 | Todo | NOT-BUILT | No stock favourites | P2 |
| MED-034 | Todo | BUILT-WORKING | Record & create: camera, screen and camera, voiceover; test [F2-012][F2-013] tagged [MED-034] | Nothing |
| CV-005 | Todo | NOT-BUILT | transform-interaction.ts update(): Shift = proportional only; no axis constraint, no Alt duplicate | Shift constrains, Alt duplicates |
| CV-010 | Todo | NOT-BUILT | rotate gesture has no step snapping (transform-interaction.ts:402) | Shift snaps rotation to 15 degrees |
| CV-012 | Claimed | BUILT-WORKING | W × H chip while resizing and angle chip while rotating (D-115); test [CV-049] "resize cursors turn with the object and rotating shows an angle chip" tagged [CV-012] | Nothing |
| CV-014 | Claimed | BUILT-PARTIAL | Grid and safe areas built (CV-014/CV-015 test); Rulers and guides is disabled "Planned for Phase 1" (canvas-menu.ts:600) | Rulers are not needed for the Beginner editor |
| CV-017 | Claimed | BUILT-WORKING | Zoom % field with presets 25 to 400, Fit, Fill, 100%, Ctrl+wheel, Ctrl+=/-/0/1; test [CV-016][CV-017] passes | Nothing |
| CV-019 | Todo | NOT-BUILT | No checkerboard toggle | P1, not needed (no transparent background, D-027) |
| CV-020 | Todo | BUILT-PARTIAL | probe: layer menu has Duplicate, Copy, Delete, Clip›Cut, Layer order, Align, Style, Lock, More; Group/Ungroup for groups and multi; no Paste | Paste in the layer menu |
| CV-021 | Todo | BUILT-PARTIAL | probe: empty canvas menu: Paste, scenes, Canvas size, Guides (grid, safe areas); no Select all | Select all |
| CV-023 | Todo | BUILT-WORKING | Double-click enters a group (D-050); test [CV-022] tagged [CV-023] | Nothing |
| CV-024 | Todo | BUILT-WORKING | Lock (D-126) and Hide (LYR-006); tests [CV-051] and [CV-014][CV-015][LYR-006] tagged [CV-024] | Nothing |
| CV-027 | Todo | BUILT-PARTIAL | Flip H and V in the toolbar (context-toolbar.ts); no rotate 90 | Rotate 90 left/right |
| CV-028 | Todo | BUILT-PARTIAL | Paste offsets in place (TL-027); OS clipboard images are not imported (grep clipboardData.files: text editor only) | Not needed now |
| CV-029 | Todo | BUILT-WORKING | Cursors per handle angle (D-115); test [CV-049] "resize cursors turn with the object" tagged [CV-029] | Nothing |
| CV-030 | Todo | BUILT-WORKING | Handles in CSS px (D-125); test [CV-053] tagged [CV-030] | Nothing |
| CV-032 | Todo | BUILT-PARTIAL | Not measured with 100 layers | Owner check (performance on the reference PC) |
| CV-033 | Todo | NOT-BUILT | No preview quality setting | P1, not needed |
| CV-034 | Todo | BUILT-PARTIAL | Pointer events everywhere; touch and pen never tested | Not needed now |
| LYR-003 | Todo | BUILT-WORKING | scene-outliner.ts:887 Ctrl, :914 Shift range; new audit test [LYR-003] | Nothing |
| LYR-004 | Todo | BUILT-PARTIAL | Outliner drag moves layers in and out of collections (LYR-016); reordering by drag in the Layers tab (LYR-008); into and out of groups is not built | Not needed now (Group/Ungroup do it) |
| LYR-005 | Todo | BUILT-WORKING | scene-outliner.ts:996 dblclick and :1027 F2 rename; new audit test [LYR-005] | Nothing |
| LYR-007 | Todo | BUILT-WORKING | outliner-arrow folds rows (scene-outliner.ts:966); test [LYR-017] "a collapsed parent opens" tagged [LYR-007] | Nothing |
| LYR-009 | Todo | NOT-BUILT | Rows show type icons, not thumbnails | P1 |
| LYR-010 | Todo | BUILT-WORKING | outliner search (scene-outliner.ts:1046); test [LYR-017] "search keeps parents" tagged [LYR-010] | Nothing |
| LYR-011 | Todo | BUILT-PARTIAL | Outliner menu: Duplicate, Copy, Paste, Delete, Rename, Hide/Show all, Lock/Unlock all, Show in timeline; no Group, Ungroup, Select same type | Not needed (the canvas menu has them) |
| LYR-013 | Todo | NOT-BUILT | No ArrowUp/Down in the outliner onKey (scene-outliner.ts:1004) | P1 |
| LYR-014 | Todo | NOT-BUILT | No solo layer | P2 |
| LYR-015 | Todo | NOT-BUILT | No layer colour labels (owner thought it was built; timeline colours are by kind, TL-069) | P2 |
| TL-002 | Todo | BUILT-WORKING | Lanes are made by drops and the "+" lane line (TL-079, TL-089); tests tagged [TL-002] | Nothing |
| TL-003 | Todo | BUILT-PARTIAL | No track headers by design (V2, D-191); the lane menu has lock, hide, mute, solo and move | Superseded design; not needed |
| TL-005 | Todo | BUILT-PARTIAL | Move lane up/down from the lane menu (D-191); no drag handle | Superseded design |
| TL-006 | Todo | BUILT-PARTIAL | An emptied lane is removed (TL-076); no Delete lane with warning, no Duplicate lane | Not needed |
| TL-007 | Todo | NOT-BUILT | Fixed lane heights by group (timeline.ts:667 laneHeight 52/36/28); owner thought it was built | P1, not needed |
| TL-008 | Todo | BUILT-PARTIAL | timeline.ts:1165 ruler labels are seconds "0.125s", "1s", never mm:ss; no frame ticks | mm:ss (hh:mm:ss when long) and frame ticks |
| TL-010 | Todo | BUILT-WORKING | Playhead over all lanes (TL-090), handle (TL-072), snaps to edges and markers (TL-057); tests tagged [TL-010] | Nothing |
| TL-011 | Todo | BUILT-WORKING | Player bar timecode takes a typed time (TL-082); test [TL-082] tagged [TL-011] | Nothing |
| TL-013 | Todo | BUILT-PARTIAL | Zoom buttons, Fit and Ctrl+wheel at the pointer (timeline.ts:2738); no slider, no zoom to selection | Not needed (buttons + Fit) |
| TL-015 | Todo | BUILT-PARTIAL | Follows the playhead while playing (TL-091); marquee edge scroll (TL-103); no auto-scroll while dragging a clip | Not needed now |
| TL-022 | Todo | NOT-BUILT | split needs a selection (editing.ts contextActions) | Split with nothing selected cuts every unlocked clip under the playhead |
| TL-024 | Todo | NOT-BUILT | No Alt-drag copy on the timeline (timeline.ts altKey only for nudges) | Alt-drag copies clips |
| TL-026 | Todo | NOT-BUILT | No ripple delete (gap close exists, TL-071) | Ripple delete |
| TL-029 | Todo | NOT-BUILT | No magnet toggle; snapping is always on (D-037) | Snap toggle in the toolbar, on by default |
| TL-031 | Todo | NOT-BUILT | grep slip/slide/roll: none; owner thought it was built | P1, not needed for the Beginner editor |
| TL-033 | Todo | BUILT-WORKING | Enable / disable clip in the clip menu (editing.ts toggle-enabled); new audit test [TL-033] | Nothing |
| TL-034 | Todo | NOT-BUILT | Clips are coloured by kind (TL-069), no user colour labels; owner thought it was built | P2 |
| TL-036 | Todo | BUILT-WORKING | registry.ts edit(marker, M); probe: M added a marker at the playhead; new audit test [TL-036] | Nothing |
| TL-037 | Todo | BUILT-PARTIAL | Markers can be added and deleted (delete-marker); no rename, colour, next/previous jump or list | Rename, colour, delete, jump to next/previous, list |
| TL-038 | Todo | BUILT-WORKING | Manual Start/End range for playback and export (PB-016); test [PB-016] tagged [TL-038] | Nothing |
| TL-039 | Todo | BUILT-WORKING | Clip menu (J14, S1): Duplicate, Copy, Paste, Delete, Split, Rename, Clip› (Cut, Speed, Reverse, Freeze, Detach, Enable/disable, More options), Replace from the toolbar; test [TL-075] tagged [TL-039] | Nothing |
| TL-040 | Todo | BUILT-PARTIAL | Lane menu (D-191): lock, hide, mute, solo, move; no add above/below, rename, height | Superseded design |
| TL-041 | Todo | BUILT-PARTIAL | probe: empty lane and ruler menus offer Add marker (and Paste with a clipboard); no Set in/out, Clear markers | Folded into TL-037 (markers list/clear) |
| TL-042 | Todo | BUILT-WORKING | Player bar: Split, Duplicate, + Marker, zoom and Fit (TL-081); test [TL-081] tagged [TL-042] | Nothing |
| TL-043 | Todo | BUILT-WORKING | Empty timeline drop box (TL-102, TL-088); tests tagged [TL-043] | Nothing |
| TL-045 | Todo | BUILT-WORKING | Clip labels use text-overflow ellipsis inside the clip; new audit test [TL-045] at the smallest zoom | Nothing |
| TL-048 | Todo | BUILT-WORKING | In 2D Animation mode (D-130); test [ANI-004] tagged [TL-048] | Nothing |
| TL-049 | Todo | BUILT-PARTIAL | Fade presets and sliders in the right panel (AUD-020, LAY-037); no handles on the clip | Not needed (panel sliders) |
| TL-050 | Todo | NOT-BUILT | No envelope line on clips | P1 |
| TL-051 | Todo | BUILT-WORKING | A "+" at the cut adds a transition; its duration is set in the panel (TR-011, TR-013); tests tagged [TL-051] | Nothing |
| TL-052 | Todo | BUILT-WORKING | Nested clips: open and leave by the breadcrumb (F2-062, FX1-014); test [F2-062] tagged [TL-052] | Nothing |
| TL-053 | Todo | BUILT-PARTIAL | Not measured with 200 clips | Owner check |
| TL-054 | Todo | NOT-BUILT | Zoom and scroll are not remembered per scene | P2 |
| PB-003 | Todo | BUILT-WORKING | Previous/Next frame buttons (TL-081) and arrow keys in the timeline; new audit test [PB-003] | Nothing |
| PB-004 | Todo | BUILT-WORKING | First/Last frame (TL-082), Previous cut in the bar, cut jumps ↑/↓ (TL-060); new audit test [PB-004] | Nothing |
| PB-005 | Todo | BUILT-PARTIAL | Timecode reads "0:00 / 0:10" (TL-082), frames in the frame row (TL-087); not mm:ss.ff | Not needed (Clipchamp format chosen in T5) |
| PB-006 | Todo | NOT-BUILT | No loop control (probe: no element named loop) | Loop toggle (whole scene or Manual range) |
| PB-007 | Todo | NOT-BUILT | No preview speed selector | P1 |
| PB-008 | Todo | BUILT-WORKING | One session time (session.ts); new audit test [PB-008] (timeline, timecode, frame field agree) | Nothing |
| PB-012 | Todo | BUILT-PARTIAL | H.264 plays through HTMLVideoElement; 95 % at 1080p30 not measured on the reference PC | Owner check |
| PB-013 | Todo | BUILT-WORKING | Master volume, mute and meters (F2-020); test tagged [PB-013] | Nothing |
| PB-014 | Todo | BUILT-PARTIAL | Full-screen preview of the stage (LAY-010) with the browser's Esc; no minimal controls inside | Not needed now |
| INS-001 | Todo | BUILT-WORKING | Right rail sections by selection kind (D-131, LAY-035); nothing selected uses the canvas bar (LAY-041); tests tagged [INS-001] | Nothing |
| INS-005 | Todo | BUILT-WORKING | Anchor grid (QT-010); test tagged [INS-005] | Nothing |
| INS-008 | Todo | BUILT-PARTIAL | Reset in Adjust colors, Audio groups, Crop, Camera; no reset per Position field | Not needed |
| INS-011 | Todo | BUILT-WORKING | Rename in the outliner (F2) and the clip menu (Rename); covered by [LYR-005] audit test, tagged [INS-011] | Nothing |
| INS-012 | Todo | BUILT-PARTIAL | Multi-selection: X/Y move all, W/H read-only (D-105); no dash for mixed values | Not needed |
| INS-013 | Todo | BUILT-PARTIAL | Fields follow a drag live (CV-044); during playback not proven | Not needed now |
| INS-014 | Todo | BUILT-WORKING | Canvas bar (LAY-041) and scene bar (CV-048: background, scene length); tests tagged [INS-014] | Nothing |
| INS-015 | Todo | BUILT-WORKING | Sections fold and remember for the session (LAY-036); tagged [INS-015] | Nothing |
| INS-016 | Todo | BUILT-PARTIAL | Replace (VID-009) and details (MED-037); no loop, no fit mode | Fit mode via VID-004 |
| INS-017 | Todo | BUILT-PARTIAL | Copy style / Paste style (CV-039) copies the look, not geometry | Not needed |
| HIS-003 | Todo | BUILT-PARTIAL | Same as APP-014: disabled state right, the name of the next action missing | Folded into APP-014 |
| HIS-005 | Todo | NOT-BUILT | No History panel | P1 |
| HIS-006 | Todo | DEFERRED-LATER | Named checkpoints: versions, owner scope rule |  |
| TXT-005 | Todo | BUILT-PARTIAL | Text is edited on the canvas (TXT-003); tables in the inspector (F2-033); no text field for a text layer in the panel | Not needed (canvas editing) |
| TXT-006 | Todo | BUILT-PARTIAL | font-picker.ts: search, own face, recent, kinds (F2-030, FN3-028, FX1-017); no favourite fonts | Not needed |
| TXT-007 | Todo | BUILT-WORKING | Bundled offline fonts + downloaded Google fonts (F2-030); tagged [TXT-007] | Nothing |
| TXT-008 | Todo | BUILT-PARTIAL | Filter Devanagari (Hindi) only (font-picker.ts:214); no other scripts | Not needed now (Hindi first) |
| TXT-009 | Todo | BUILT-WORKING | Upload .woff2/.ttf (FN3-012); fonts stored in this browser (aive.fonts.uploaded); test tagged [TXT-009] | Nothing |
| TXT-010 | Claimed | BUILT-PARTIAL | Real weights (TXT-040); no variable font axes | Not needed |
| TXT-011 | Todo | BUILT-PARTIAL | Size field with slider and presets; no auto-fit text to box | Not needed |
| TXT-012 | Todo | BUILT-WORKING | Text colour (TXT-023) and gradient text (text-gradient.ts); tests [TXT-023] tagged [TXT-012] | Nothing |
| TXT-013 | Todo | BUILT-WORKING | text-gradient.ts + render/text-effects.ts; new audit test [TXT-013] | Nothing |
| TXT-018 | Claimed | BUILT-WORKING | Auto width, fixed width, fixed box with Auto height off (FN3-005, TXT-043, TXT-044); tests tagged [TXT-018] | Nothing |
| TXT-019 | Todo | BUILT-WORKING | Text effects with outline and shadow (FN3-027); tagged [TXT-019] | Nothing |
| TXT-020 | Todo | BUILT-WORKING | Text effects background, highlight and glow (FN3-027); tagged [TXT-020] | Nothing |
| TXT-021 | Todo | BUILT-PARTIAL | Curve bends text (FN3-008); no arbitrary path | P2 |
| TXT-022 | Todo | BUILT-WORKING | Text styles and 24 combinations (FN3-011, TXT-001); tagged [TXT-022] | Nothing |
| TXT-025 | Claimed | BUILT-PARTIAL | Devanagari proven (TXT-025 test); other Indic scripts and Arabic joining not proven | Not needed now (Hindi first) |
| TXT-026 | Todo | BUILT-PARTIAL | Direction RTL is a text setting (F2-030 test); mixed bidi editing not proven | Not needed now |
| TXT-027 | Todo | BUILT-PARTIAL | layout.ts uses Intl.Segmenter; Thai/CJK not proven | Not needed now |
| TXT-028 | Todo | BUILT-PARTIAL | Generic fallbacks in the font stack; no per-script chain proof | Not needed now |
| TXT-029 | Todo | BUILT-PARTIAL | Browser renders colour emoji in text; not proven in export | Not needed now |
| TXT-030 | Todo | BUILT-WORKING | Export pre-flight blocks missing fonts (EXP-008); fonts load before export (FN3-012); tagged [TXT-030] | Nothing |
| TXT-031 | Todo | BUILT-WORKING | One text engine for preview and export; test [FN3-008] tagged [TXT-031] | Nothing |
| TXT-032 | Todo | NOT-BUILT | No font licence list | P1 |
| TXT-033 | Todo | NOT-BUILT | No find and replace | P2 |
| TXT-034 | Todo | BUILT-WORKING | Spellcheck setting (FN3-030); tagged [TXT-034] | Nothing |
| TXT-035 | Claimed | BUILT-WORKING | Auto captions, style gallery, lane, SRT/VTT import and export, burned in as layers (F2-061, captions-ui.ts:947); tests tagged [TXT-035] | Nothing |
| SHP-007 | Todo | BUILT-PARTIAL | Shadow via text effects; shapes have no shadow/blur control except Effects › blur on the layer | Not needed |
| SHP-008 | Todo | NOT-BUILT | SVG imports as a picture, not vectors | P1 |
| SHP-009 | Todo | BUILT-PARTIAL | Elements: shapes, lines, arrows, stickers, icons (FX1-005, FX1-006); Frames, Grids, Charts, Animations, 3D tiles are disabled (truly not built) | Not needed now |
| SHP-010 | Todo | NOT-BUILT | Frames tile disabled (library-panel.ts:326, truly not built) | P1 |
| SHP-011 | Todo | BUILT-PARTIAL | Crop, flip, corners, border (VID-003, VID-018, CV-036); no drop shadow for pictures | Not needed |
| SHP-012 | Todo | NOT-BUILT | Animations tile disabled (library-panel.ts:326); a GIF draws as a still | P1 |
| SHP-014 | Todo | NOT-BUILT | No logo quick-add | P1 |
| SHP-016 | Todo | NOT-BUILT | Charts tile disabled | P2 |
| SHP-017 | Todo | NOT-BUILT | No Lottie import in Elements (only inside Tier C code) | P2 |
| SHP-023 | Todo | NOT-BUILT | No shape assist (D-111) | P1 |
| SHP-025 | Todo | BUILT-WORKING | Tables (F2-032); tagged [SHP-025] | Nothing |
| ANI-011 | Todo | DEFERRED-LATER | 2D animation feature (motion path) |  |
| ANI-012 | Todo | BUILT-PARTIAL | Typewriter preset (ANI-007, FN3-008); no per-word/line stagger | D: 2D animation |
| ANI-013 | Todo | DEFERRED-LATER | Graph editor: 2D animation |  |
| ANI-014 | Todo | DEFERRED-LATER | Time remap: 2D animation |  |
| ANI-015 | Todo | DEFERRED-LATER | Virtual camera is built for scenes (FN3-015) but the 2D camera layer is animation mode |  |
| ANI-016 | Todo | DEFERRED-LATER | Expressions: 2D animation |  |
| ANI-017 | Todo | DEFERRED-LATER | Copy keyframes between layers: 2D animation |  |
| ANI-018 | Todo | DEFERRED-LATER | Path trim: 2D animation |  |
| ANI-019 | Todo | DEFERRED-LATER | Particles: 2D animation |  |
| ANI-020 | Todo | DEFERRED-LATER | Scene animation: 2D animation (scene-bar Animate stays disabled, correctly) |  |
| VID-004 | Todo | NOT-BUILT | No fit mode (grep fitMode: none) | Fit, Fill, Stretch for pictures and videos |
| VID-007 | Todo | BUILT-WORKING | effect.blur-fill (src/fx/effects.ts); applying Blur fill draws the blurred copy; new audit test [VID-007] | Nothing |
| VID-008 | Todo | NOT-BUILT | A GIF imports as a still image | P1 |
| VID-013 | Todo | BUILT-WORKING | Chroma key with eyedropper, tolerance, softness (F2-042); tagged [VID-013] | Nothing |
| VID-014 | Todo | DEFERRED-LATER | Stabilization: ADV-level pro feature |  |
| FX-001 | Todo | BUILT-WORKING | Effects tile grid with thumbnails and hover animation (FX-017); tagged [FX-001] | Nothing |
| FX-002 | Todo | BUILT-PARTIAL | Click applies, several stack, None clears, a click toggles (FX-017); no reorder or copy of effects | Not needed |
| FX-003 | Todo | DEFERRED-LATER | Effect settings in the panel (FX-017); keyframable params are 2D animation (owner rule) |  |
| FX-005 | Todo | BUILT-WORKING | effect.blur and effect.blur-fill; FX-018 sweep; tagged [FX-005] | Nothing |
| FX-006 | Todo | BUILT-WORKING | Vignette, grain (filters/grade), glow; FX-018 sweep; tagged [FX-006] | Nothing |
| FX-007 | Todo | BUILT-PARTIAL | Glitch, chromatic aberration, pixelation, kaleidoscope, wave, halftone, duotone, radial exist; no invert, sepia, mirror, motion blur, RGB split as named | Not needed |
| FX-008 | Todo | BUILT-PARTIAL | Adjustment code exists (src/fx/adjustments.ts); no adjustment layer in the UI | Not needed |
| FX-009 | Todo | BUILT-WORKING | Effects on a nested clip (FN3-004) and groups; tagged [FX-009] | Nothing |
| FX-011 | Todo | BUILT-PARTIAL | Effects run on the GPU path with a CPU fallback notice (F2-042); context loss not tested | Not needed now |
| FX-012 | Todo | BUILT-PARTIAL | FX5-013 measured: targets missed for blur and chroma on the sandbox | Owner check on the GPU PC |
| FX-013 | Todo | NOT-BUILT | No effect presets | P2 |
| FX-014 | Todo | DEFERRED-LATER | Custom shader plugins: plugin API (ADV-004 class); test [FX-014] exists for the code-layer worker but plugins are later |  |
| TR-001 | Todo | BUILT-WORKING | Right Transition panel with drawn tiles (TR-017); tagged [TR-001] | Nothing |
| TR-002 | Todo | BUILT-WORKING | "+" at the cut, default 1 s (DEFAULT_TRANSITION), duration in the panel (TR-013); tagged [TR-002] | Nothing |
| TR-003 | Todo | BUILT-PARTIAL | crossfade, fade-black, fade-white, wipe/slide left and right, push, zoom (core/transitions.ts + FX library, TR-016); no slide up/down | Not needed |
| TR-005 | Todo | BUILT-WORKING | maxTransition clamps to what the clips allow (core/transitions.ts); covered by [TR-013] (sets its duration), tagged [TR-005] | Nothing |
| TR-006 | Todo | BUILT-PARTIAL | Swap and remove (TR-013); no "apply to all cuts on a track" | Not needed |
| TR-007 | Todo | BUILT-WORKING | Preview and export identical (TR-011, TR-016, FX-010); tagged [TR-007] | Nothing |
| TR-008 | Todo | NOT-BUILT | Audio is not crossfaded by a video transition | P1 |
| TR-009 | Todo | NOT-BUILT | Always centred on the cut (core/transitions.ts header comment) | P1 |
| MSK-001 | Claimed | BUILT-WORKING | Blend modes (F2-041, FX5-008); test [FX-004][FX-015][CLR-001][MSK-001] passes | Nothing |
| MSK-002 | Todo | BUILT-WORKING | More blend modes in the grouped list (FX5-008 "each mode once, grouped"); tagged [MSK-002] | Nothing |
| MSK-003 | Todo | BUILT-WORKING | Rectangle and ellipse masks with feather/invert (F2-040, F2-043); tagged [MSK-003] | Nothing |
| MSK-004 | Todo | DEFERRED-LATER | Bezier and animated masks: pro/animation |  |
| MSK-005 | Todo | BUILT-PARTIAL | Track matte code in src/render/adapter.ts and layer-effects.ts; not proven in the UI | Not needed now |
| MSK-006 | Todo | NOT-BUILT | No transparent export | P1 |
| CLR-001 | Claimed | BUILT-WORKING | Adjust colors sliders (FX-015); test [FX-004][FX-015][CLR-001][MSK-001] passes | Nothing |
| CLR-002 | Todo | DEFERRED-LATER | Pro colour: owner scope rule |  |
| CLR-003 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-004 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-005 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-006 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-007 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-008 | Todo | DEFERRED-LATER | Pro colour |  |
| CLR-009 | Todo | DEFERRED-LATER | Pro colour |  |
| AUD-001 | Todo | BUILT-WORKING | Audio lanes with waveforms (TL-047, MED-019); tagged [AUD-001] | Nothing |
| AUD-002 | Claimed | BUILT-WORKING | Volume 0 to 200 %, mute, volume keyframe, master volume (AUD-019, F2-020); tests pass, tagged | Nothing |
| AUD-004 | Todo | BUILT-WORKING | Detach audio (TL-032, VID-006); tagged [AUD-004] | Nothing |
| AUD-006 | Todo | BUILT-PARTIAL | Master meters while playing (F2-020); no per-track meters | Not needed |
| AUD-010 | Todo | NOT-BUILT | No pitch preservation (grep preservesPitch: none) | P1 |
| AUD-013 | Claimed | BUILT-WORKING | Built-in sound pack with clear generated licence (AUD-021); Stock music via providers; tagged [AUD-013] | Nothing |
| AUD-014 | Todo | NOT-BUILT | No envelope drawing | P1 |
| AUD-016 | Todo | NOT-BUILT | No beat detection | P2 |
| TPL-001 | Todo | BUILT-WORKING | Templates panel with categories, search, previews; a template makes a scene (TPL-011, TPL-014); tagged [TPL-001] | Nothing |
| TPL-002 | Todo | BUILT-WORKING | Starter Pack templates by category (TPL-010, TPL-014); tagged [TPL-002] | Nothing |
| TPL-003 | Todo | BUILT-PARTIAL | Save scene to My Templates (TPL-015); no template file import/export (code templates only) | Not needed now |
| TPL-004 | Todo | DEFERRED-LATER | Components: owner scope rule |  |
| TPL-005 | Todo | BUILT-WORKING | Nested clips with their own lanes, enter and exit (F2-062, FX1-014); tagged [TPL-005] | Nothing |
| TPL-006 | Todo | BUILT-PARTIAL | Media slots in compositions (src/composition/build.ts, F2-070); not in library templates | Not needed now |
| TPL-007 | Todo | DEFERRED-LATER | Brand kit: owner scope rule |  |
| TPL-008 | Todo | DEFERRED-LATER | Slide mode: owner scope rule |  |
| TPL-009 | Todo | DEFERRED-LATER | CSV variants: owner scope rule |  |
| EXP-010 | Todo | BUILT-PARTIAL | Streams to OPFS (D-064); a 30 minute export not measured | Owner check |
| EXP-011 | Todo | BUILT-PARTIAL | WebCodecs encode via Mediabunny with WebM fallback (D-064); hardware/software choice not documented | Not needed now |
| EXP-012 | Todo | BUILT-WORKING | WebM VP9 + Opus export is the sandbox path of [EXP-001] (D-065); tagged [EXP-012] | Nothing |
| EXP-013 | Todo | NOT-BUILT | No GIF export | P1 |
| EXP-014 | Todo | NOT-BUILT | No audio-only export | P1 |
| EXP-015 | Todo | BUILT-PARTIAL | Captions are layers and burn in; no watermark option | Not needed |
| EXP-016 | Todo | BUILT-PARTIAL | SRT and VTT export from captions (captions-ui.ts:963); no cover frame (Export frame PNG exists, EXP-009) | Not needed |
| EXP-017 | Todo | NOT-BUILT | No export queue | P2 |
| EXP-018 | Todo | NOT-BUILT | No PNG sequence | P2 |
| REL-002 | Todo | NOT-BUILT | No error boundary (grep window.onerror / error listener in src/ui: none) | Errors in the UI show a message and keep the project |
| REL-003 | Todo | BUILT-PARTIAL | Export, captions (FX3-002) and code bakes run in workers; waveforms and thumbnails decode on the main thread | Not needed now |
| REL-004 | Todo | BUILT-PARTIAL | PNG frame cache for code layers (D-219); ordinary frames are redrawn | Not needed now |
| REL-005 | Todo | BUILT-PARTIAL | Not measured | Owner check |
| REL-006 | Todo | NOT-BUILT | No service worker | P1 |
| REL-007 | Todo | NOT-BUILT | No browser check (grep unsupported-browser: none) | Message for unsupported browsers |
| REL-008 | Todo | BUILT-PARTIAL | Not measured | Owner check |
| REL-009 | Todo | BUILT-PARTIAL | Not measured | Owner check |
| ACC-001 | Todo | BUILT-PARTIAL | Menus, lists, fields work by keyboard; canvas objects need the mouse | Not needed now |
| ACC-002 | Todo | BUILT-PARTIAL | Roles on menus, dialogs, tree, rails (grep role=); not audited | Not needed now |
| ACC-003 | Todo | BUILT-WORKING | Token contrast unit test (D-119) and LAY-054 readability tests; tagged [ACC-003] | Nothing |
| ACC-004 | Todo | BUILT-WORKING | motion.ts prefers-reduced-motion (LAY-033, QT-016); tagged [ACC-004] | Nothing |
| ACC-005 | Todo | BUILT-PARTIAL | Live region for status (D-120); not every action announced | Not needed now |
| ACC-006 | Todo | NOT-BUILT | Not tested at 200 % zoom | P2 |
| QA-003 | Todo | NOT-BUILT | preflight.ts has no font, overflow or clipping checks (added as Todo by D-318) | P1, next slice |
| QT-013 | Claimed | BUILT-WORKING | AI chip in libraries; test [QT-014][QT-015][QT-012][QT-013] passes | Nothing |
| CP-010 | Claimed | BUILT-WORKING | Controls show what the layer has; tests [CP-009][CP-010], [CP-010][CP-012] pass | Nothing |
| F2-052 | Claimed | BUILT-WORKING | Plain import notes (media-probe-info.ts); the rotation fixture is shown upright; covered by [MED-003] and [F2-050]; tagged [F2-052] | Nothing |
| FX3-001 | Claimed | BUILT-WORKING | Claimed until a full verify (reports/FIX3.md); test [FX3-001] passes in this verify | Nothing |
| FX3-002 | Claimed | BUILT-WORKING | Claimed until a full verify; tests [FX3-002] pass | Nothing |
| FX3-003 | Claimed | BUILT-WORKING | Claimed until a full verify; tests [FX3-003] pass | Nothing |
| FX4-001 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-001] passes | Nothing |
| FX4-002 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-002] passes | Nothing |
| FX4-003 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-003] passes | Nothing |
| FX4-004 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-004] passes | Nothing |
| FX4-006 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-008] covers the model source; tagged | Nothing |
| FX4-007 | Claimed | BUILT-PARTIAL | src/speech model source setting is read by the downloader (aive.model-source); no test proves the download address and the runner host use it | Not needed for the Editor (offline captions setting) |
| FX4-008 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-008] passes | Nothing |
| FX4-009 | Claimed | BUILT-WORKING | Claimed until a full verify; [FX4-009] test passes | Nothing |
| FX4-010 | Claimed | BUILT-WORKING | Claimed until a full verify; test [FX4-010] passes | Nothing |
| FX5-013 | Claimed | BUILT-PARTIAL | Measured (FX5-013 tests); targets missed for blur, blur+glow and chroma on the sandbox (reports/PHASE0.md) | Owner check on the GPU PC |
| ADV-001 | Todo | DEFERRED-LATER | ADV: owner scope rule |  |
| ADV-002 | Todo | DEFERRED-LATER | ADV: 3D (the 3D Animation mode stays disabled, correctly) |  |
| ADV-003 | Todo | DEFERRED-LATER | ADV |  |
| ADV-004 | Todo | DEFERRED-LATER | ADV |  |
| ADV-005 | Todo | DEFERRED-LATER | ADV |  |
| ADV-006 | Todo | DEFERRED-LATER | ADV |  |
| ADV-007 | Todo | DEFERRED-LATER | ADV |  |
| ADV-008 | Todo | DEFERRED-LATER | ADV (Comment stays disabled: needs accounts; Phase 1 adds accounts but not collaboration) |  |
| AI-001 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs the AI service (backend proxy, D-011) |  |
| AI-002 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs the AI service |  |
| AI-003 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs the AI service (the Command Bus side exists) |  |
| AI-004 | Todo | DEFERRED-LATER (AI, can run locally now) | Works locally now: offline Whisper captions (F2-090, FX1-010) and Deepgram with a key; Indian languages via Sarvam keys |  |
| AI-005 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs a translation service |  |
| AI-006 | Todo | DEFERRED-LATER (AI, can run locally now) | Works now with the user's own key (FX1-009 Sarvam TTS); the proxy comes with the backend |  |
| AI-007 | Todo | DEFERRED-LATER (AI, needs the backend) | Background remover / Magic eraser: disabled "Needs the AI service" (correct) |  |
| AI-008 | Todo | DEFERRED-LATER (AI, can run locally now) | Auto cut silence could run locally (Web Audio levels); the clip menu Auto cut is disabled |  |
| AI-009 | Todo | DEFERRED-LATER (AI, needs the backend) | Smart crop / Expand: disabled "Needs the AI service" (correct); auto reframe needs a model |  |
| AI-010 | Todo | DEFERRED-LATER (AI, can run locally now) | Scene detection could run locally (frame differences) |  |
| AI-011 | Todo | DEFERRED-LATER (AI, can run locally now) | Reduce noise exists offline (F2-020 "Reduce noise") |  |
| AI-012 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs the AI service (Magic Write, AI wand disabled: correct) |  |
| AI-013 | Todo | DEFERRED-LATER (AI, needs the backend) | Needs the backend proxy (Phase 1 server first) |  |
<!-- /AUDIT-TABLE -->
