# Brief W2-CLAUDE: timeline interaction overhaul and clip time commands

Wave: 2 (Claude's first Wave 2 slice). Base: `main` at `78c9652` (merge of `w1.2`). End tag: `w2-claude`. Branch: `claude/wave-2-timeline-clips-mwy1f3` (session-assigned; replaces the `wave-2-<slug>` convention for this session).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

After this wave the owner can work the timeline like Clipchamp: the timeline never runs out of room, clips have obvious trim handles, every drag snaps with a visible guide line, a cross-track drag shows exactly where the clip will land, the track header has working Lock/Hide/Solo/Mute toggles, and all of it has keyboard equivalents. Clips also gain three non-destructive time commands (Speed, Reverse, Freeze frame) from both the timeline and canvas right-click menus, each undoable.

## 2. In scope (ledger IDs)

Prerequisite (blocking all proof): the `npm run verify` e2e step must run in this environment.

Part A, timeline interaction:

- TL-055 infinite timeline
- TL-056 dedicated trim handles
- TL-057 snapping with a visible guide (clip move/trim, playhead drag, marker drag)
- TL-058 cross-track drag ghost
- TL-059 track header Lock/Hide/Solo/Mute
- TL-060 keyboard equivalents
- TL-019 (existing Bug) right trim stops at the next clip and at the source end; TL-018 left trim limits are proven by the same test. Included because the trim-handle work owns this path.
- TL-044 (existing Todo) Up and Down jump the playhead to the previous or next cut; this is the keyboard equivalent of playhead snapping.

Part B, clip time commands (Time & Temporal Effect Engine subset):

- VID-015 speed, VID-016 reverse, VID-017 freeze frame.

## 3. Out of scope

Waveform rendering (TL-047), 3D and nested-timeline breadcrumbs (TL-052), custom track colours (TL-034 and track colour UI), track expand/collapse, snap toggle (TL-029), insert/overwrite rules and overlap prevention on move (TL-020, TL-030), auto-scroll while dragging (TL-015), lock blocking every edit path (TL-004, stays Bug), Cut/Copy/Paste, Replace, Detach Audio, Compound Clip, speed ramps and time remapping, media decoding of speed/reverse/freeze (VID-010 to VID-012 remain W6 with the media pipeline). No React migration.

## 4. Ledger Change Requests to apply first

Added (appended; no existing ID shifted), P0, W2, Todo: TL-055, TL-056, TL-057, TL-058, TL-059, TL-060 in the TL section; VID-015, VID-016, VID-017 in the VID section. Wave table W2 P0 102 → 111; total 485 → 494 (P0 297 → 306). Exact wording is in `docs/FEATURES.md`.

## 5. Contracts, schema and dependencies

- Schema stays 4. Speed uses the existing `clip.speed` field. Reverse and freeze frame are stored in the existing free-form `clip.metadata` record (`reversed: true`, `freezeFrame: <source seconds>`), validated at the command boundary and read defensively. A v4 editor that predates this wave preserves them untouched. Promote to first-class fields at the next authorized schema bump (expected v5 in Wave 6).
- New commands: `SET_CLIP_SPEED`, `SET_CLIP_REVERSED`, `SET_CLIP_FREEZE_FRAME`. All are synchronous, validated and refused on locked tracks, and go through the normal transaction and history path.
- Solo is transient session state (like selection). It creates no command, history, autosave or schema change. The render adapter receives an optional `soloTrackIds` projection.
- No frozen contract changes. No new dependencies.

## 6. Design notes

- **Infinite timeline:** span = max(content end, furthest point the user has scrolled to, visible end) + one viewport width of empty room, capped at 24 h. Scrolling within one viewport of the end, or zooming out, re-renders a longer ruler. The playhead stays clamped to the content end.
- **Trim handles:** each handle is 10 px wide inside the clip. It shows `ew-resize` and a visible grip bar when the clip is hovered or selected. The body keeps `grab`. Trim limits: never below one frame, never past the source media (asset duration, adjusted for speed and reverse), never into the previous or next clip on the same track.
- **Snapping:** the threshold is 8 CSS px. The frame grid comes first, then the nearest candidate: 0, content end, playhead, markers, other clips' edges. The guide is a 1 px accent line (`.timeline-snap`) over the ruler and every row, and it appears only while an edge is actually snapped. Snapping applies only once a drag passes 3 px, never on a plain click.
- **Ghost:** when a move's destination is another compatible track, the original clip stays in place, dimmed and dashed. A ghost (`.timeline-clip-ghost`) with the clip's name appears in the destination row at the preview time. Release commits exactly that; Escape restores.
- **Track header:** each toggle has `aria-pressed`, a pressed style (accent colour and soft background), a tooltip and a translated name. Hide means the track is not drawn. Solo means only soloed tracks' clips are drawn; unlinked legacy layers are unaffected. Mute stores state only, because no audio engine exists yet.
- **Keyboard (timeline focused):** Alt+←/→ nudges the selected clips by one frame (Shift for ten); Alt+↑/↓ moves them to the adjacent compatible, unlocked track; `[` / `]` trims the start or end to the playhead, clamped to the trim limits; ↑/↓ jumps the playhead to the previous or next cut or marker. These are listed in the shortcut sheet and palette as timeline-scoped commands, and each is one undo step.
- **Speed:** presets are 0.25×, 0.5×, 1×, 1.5×, 2× and 4×, offered in a submenu that opens in place with a Back item; the command range is 0.1–8. Duration = (sourceOut − sourceIn) / speed and the start is unchanged. Slowing a clip so that it runs into the next clip is refused with a message.
- **Reverse:** toggles. The source range and duration stay unchanged. Source time runs from sourceOut backwards. Trim and split map timeline edges to the correct source edge.
- **Freeze frame:** toggles. It holds the source frame under the playhead when the playhead is inside the clip, otherwise the clip's first displayed frame.
- **Badges** on the clip: `2×`, a reverse icon and a freeze icon, each with a translated tooltip.
- **Multi-selection:** Speed applies to every selected clip. Reverse and freeze set all selected clips to the opposite of "all already on".
- **Strings:** every new user-visible string is a translation key in `en.json` and `hi.json`.

## 7. Steps

1. Fix the e2e blocker; `npm run verify` green. Accept when the current suite passes.
2. LCR, this brief, backlog lines.
3. Core: time-effect helpers, trim bounds and retime maths, three commands, unit tests.
4. Timeline: infinite span, handles, snap guide (clip/playhead/marker), ghost, header toggles and solo, keyboard.
5. Menus (timeline and canvas) and registry for Part B, with badges.
6. Playwright tests per ID, the ledger and docs, the report, and the PR.

## 8. Required tests (Playwright, real mouse and keyboard, fixture `nle-example.json`)

- TL-055: scrolling to the right end repeatedly makes the ruler extend beyond the content end each time; zooming out keeps the ruler covering the viewport.
- TL-056: hovering a clip shows handles with `ew-resize`; dragging the left handle trims start and in-point.
- TL-057: a clip dragged within 8 px of another clip's edge shows `.timeline-snap` at that time and lands exactly on it; the same for a playhead drag and a marker drag.
- TL-058: dragging clip-c to Video 3 shows a ghost in the Video 3 row while clip-c stays dimmed in Video 2; release moves it in one undo step; Escape mid-drag leaves the project unchanged.
- TL-059: each toggle flips `aria-pressed`. Hide/Lock/Mute are undoable. Solo hides other tracks' clips on the canvas and creates no history.
- TL-060 and TL-044: every listed key, with undo.
- TL-019 and TL-018: trims stop at the neighbour and at the source edge (convert the `test.fail`).
- VID-015 to VID-017: the context-menu entry on both menus, the resulting state, the badge, and undo/redo round-trips.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report, patch and stat exist; the PR is open against `main`; the working tree is clean

## 10. Stop rules

Stop and report if any item needs a schema bump, a frozen-contract change or a new dependency. The same applies if Solo cannot be done without persisting it, or if the e2e step cannot run in a real Chromium-family browser.
