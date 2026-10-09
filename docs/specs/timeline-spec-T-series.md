# Timeline spec (T-series): Clipchamp-style lanes, playhead, scroll, frame range, outliner

Revision 2 (2026-10-09): owner decisions added after review: audio is a normal asset (section 1), the scenes panel STAYS but is redesigned as an outliner with collections (sections 8 and 12), reveal-in-timeline (section 13), one combined session (T + outliner + FX wiring).

Source: frame-by-frame review of three recordings: owner's tool (BUGs of my timeline, 623 s), Clipchamp first load (143 s), Clipchamp timeline demo (113 s). "Seen" = visible in frames. Dates 2026-10-09. This is the spec the T1/T2/T3 Claude Code prompts must follow.

## 1. Lane model (replaces the fixed typed lanes)
- A lane has NO fixed type, no name and no header. Its "kind" is derived from the clips in it. An empty lane accepts anything.
- Compatibility groups (a lane holds one group only):
  - V: video, image, annotation, sticker, background image, overlay object, GIF.
  - T: text, shape.
  - A: audio. Audio is a normal asset in every other respect: it may be dropped anywhere (above, between, below lanes, new lane) and into any lane that has only audio or is empty; it never shares a lane with V or T.
- Any asset may be placed in ANY position: above the top lane, between two lanes, below the bottom lane (each creates a new lane), or into an existing lane whose clips are the same group and where it fits.
- Different groups never share a lane. Hovering a lane with incompatible content shows a red blocked cursor and no purple highlight. The blocked cursor is also shown over the ruler.
- A lane that becomes empty after a drop/move is removed at once (seen in Clipchamp).
- Same-lane drops: drop on empty lane space places at that time with snapping to clip ends and the playhead (playhead turns pink when snapped); drop on a clip = Replace (pink/purple overlay with "Replace" label); drop at lane start inserts and ripples later clips. Gaps can be deleted ("Delete this gap" tooltip, trash icon).
- The "+" insertion line follows the pointer x and is a full-lane-width 3 px purple line with a circled "+" at its centre; never fixed at one x.
- The insertion line and the blocked icon must never show at the same time.

## 2. Empty timeline and ghost lanes (Clipchamp exact)
- Empty project: no ruler, no playhead, no Add text/Add video/Add audio lanes. One dark lane (~52 px at 1920 wide) spanning the width, left ~50% a dashed box with a faded filmstrip and a ghost thumbnail card with a hand cursor, plus bold grey "Drag & drop media here" under it. Transport buttons disabled and grey.
- While dragging over the timeline the illustration and hint vanish, the dashed box shows a "+" and turns solid purple on hover.
- After the FIRST clip exists (exactly one lane): ruler and playhead appear; two dashed ghost lanes appear: "T + Add text" above and "♪ + Add audio" below (~28 px tall, 8 px gaps). Hover on a ghost lane: purple dashed outline and "HIDE" label. They are guidance only: any asset can be dropped in them, and dropping creates a normal lane.
- Ghost lanes are hidden when there are 2 or more real lanes, and while a dragged item hovers their slot (a small dashed purple block of the clip's width shows instead, "new lane here").
- Back to empty (all deleted) returns to the empty state above.

## 3. Playhead, ruler
- Playhead: white pin handle on the ruler, 2-3 px line through all lanes, drawn on top of clips and of any sticky element. Hover over ruler: grey hairline + dark time pill.
- Selected clip: purple band over its range in the ruler with a duration chip ("45.41s"). The band and chip follow the drag in REAL TIME (bug now: they jump after drop).
- Zoom controls bottom-right: zoom out, zoom in, fit, expand. Zoom animates ~1 s.

## 4. Paging while playing when zoomed (verified in Clipchamp)
- When the playhead reaches ~90-95% of the visible width, the view jumps (no animation) so that the new left edge = playhead time (advance ≈ one viewport minus a little); the playhead reappears at the left edge and keeps moving. It never leaves the screen. Skip-to-start returns the view to the first page. Unzoomed: no scrolling needed.

## 5. Horizontal scroll range (CORRECTED from owner's wording)
- Clipchamp is not limited exactly to the last clip: content width = max(project length, viewport) + viewport/2. At max scroll the project end sits at the viewport centre. Range grows as clips are added. No auto-extend beyond that; remove the current D-036 "infinite" behaviour (end + one viewport and growing). Zoom-out disabled at fit.

## 6. Vertical layout and panel resize
- The lane group is vertically centred in the area under the ruler when the timeline panel is taller than the lanes; ruler, zoom controls and scrollbar stay pinned.
- When the panel is shorter than the lanes: first lane at top, the rest scroll with the mouse wheel inside the timeline (owner requirement; not shown in the video, so implement as stated).
- Resize handle = top edge of the panel (purple line on hover, ns-resize cursor). The preview must not collapse to a thin strip (keep a minimum preview height) and resizing must not change the preview zoom value unexpectedly.

## 7. Layout of rail and panels
- Left category rail is full height (from under the top bar to the bottom). A category panel opens beside the rail with animation; the timeline slides to the right with the canvas (timeline never goes under the rail or panel).
- The open/close (collapse) button for the left panel lives inside that panel's header (right edge); the right panel's inside the right panel. Remove the two toggles from the top bar.
- On first load: Media category panel open (not Scene). New project canvas default white.
- Media panel empty state: Clipchamp-style illustration above "No media yet"/import hint; remove the current icon.
- Right panel: not shown at all when the project is empty (no "Nothing selected" panel). It appears when a clip is selected and disappears on deselect.

## 8. Left "Layers" panel (the old sticky scenes panel) - KEEP, redesign
- Owner decision: do NOT remove it and do NOT copy Blender's thin channel strip. It keeps mute / lock / hide per asset. Redesign layout and UI as the outliner in section 12.
- It is a normal panel column to the left of the lane area, NOT an overlay: it never covers, crops or hides lanes or clips, horizontal timeline scroll happens only inside the lane area, and the playhead handle/placeholder lanes never overlap it. Full height of the timeline panel, resizable by dragging its right edge (default ~220 px, min 160, max 360), collapsible with a button in its own header (section 7).
- Names must be fully readable: row height >= 28 px, icons >= 16 px, panel width auto-fits the longest name up to the max; only beyond the max does a name truncate with an ellipsis and a tooltip with the full name. Names are editable (double-click) and default to "Video 1", "Text 2", "Audio 1" ...
- The lanes themselves still have no header/labels.

## 9. Frame range panel (Blender behaviour, Clipchamp-free)
- Fields: Current, Start, End. Wide enough for 5 digits (today ~24 px, clipped "3I"), single consistent control style: one pair of ‹ › step buttons per field, no stacked up/down arrows; label above or beside; Blender-like compact bar (screenshots in owner's PDF p.6).
- Start/End define the active range. Outside it, the ruler AND every lane/clip area is dimmed (darker); inside normal. (Bug: only the ruler dims today.)
- First-frame / last-frame transport buttons jump to Start / End (bug: jump to 1 and to the project end). Must keep working after clips are added (bug: End ignored when a new clip is added).
- Play starts from Start, loops within the range and stops/wraps at End (play already does this).
- Playhead may be placed outside the range (like Blender); it is shown in a distinct colour beyond End.
- Defaults: Start 1 (or 0 as today), End = project end until user edits; user-set values persist.

## 10. Other defects found in the owner-tool recording (to fix in the same series)
1. A shape dropped while hovering "Add video" lands in a new top lane, not where hovered (0:15).
2. Text hovered over video/audio lanes shows purple highlight AND blocked cursor (should be red/blocked only).
3. Video dropped on a lane's top-edge insert line creates nothing (4:34-4:39).
4. Insert line and blocked icon at the same time (2:09, 2:12, 2:24).
5. Dragging into the top zone reorders lanes instead of creating a lane (2:49, 2:59).
6. Insert "+" always at x≈715 instead of following the pointer.
7. Selected-clip ruler band/chip not following drag.
8. Header/sticky panel overlaps and crops clips on scroll (7:59-8:15); placeholder lanes and 0s playhead handle overlap the header.
9. Playhead line in the empty state is only ~10 px and goes behind lanes.
10. Clipped inputs (End "3I", Start "5."); tiny header icons; clipped right-rail labels ("Transiti...", "Adjust c..."); clipped last ruler label; tooltips covering clip labels ("Trim st...").
11. The "+" join button overlaps clip edges (1:15, 1:23).
12. Drop-target highlight lags one lane behind the pointer (0:40).
13. Stray purple focus border around the timeline panel (1:57, 6:54).
14. Chip says "Bold heading" but the created clip is named "Add a heading".
15. Timeline panel resize shrinks the preview to a thin strip and the zoom % changes (42, 33, 32...).
16. Playhead can be outside range without clamping, turns red beyond End (check intended).
17. Zoomed play: playhead runs off the right edge and nothing follows (8:28).
18. Scroll goes far beyond the last clip; clips slide under the header (8:01).

## 11. Not covered by the videos (needs owner test or decision)
- No audio file is dragged in any recording: audio lane rules come from the owner's written rules only.
- Clipchamp text/shape lane rules are not shown in video; they follow the owner's PDF.
- Short-panel vertical scroll is not shown in Clipchamp's video.
- In the first-load video Clipchamp's canvas is black; the owner explicitly wants our default canvas white.

## 12. Outliner and collections (Blender-inspired, organisation only)
- The Layers panel is a tree like Blender's Outliner. Root: "Scene Collection" (one per scene/composition, named after the scene). Under it: assets (every layer/clip) and user collections, nested to any depth.
- Collections: New collection button; rename (double-click, F2), delete (assets inside move to the parent, never deleted), nest by drag, collapse/expand with a disclosure arrow, drag assets into/out of collections and reorder inside the outliner. Each scene has its own tree. Default state: all assets directly under the Scene Collection in the order they were added.
- STRICTLY organisational: collections are NOT groups. Moving an asset between collections or reordering rows must not change canvas stacking order, positions, transforms, layouts, timeline lanes, timing or export in any way, and must not create groups or alter group structure. No command that touches the Scene Graph geometry. Persisted per scene (schema 6 `outliner`, see the brief), part of undo/redo, survives save/load/export-import.
- Row contents: disclosure arrow (collections), type icon, full name, then eye (hide), lock, mute (audio/video) shown on hover and when active; a hidden/locked/muted state shows a persistent small icon. Visibility/lock/mute per asset use the existing commands. A collection's eye/lock/mute applies to its assets as one undoable step (a shortcut, not a group).
- Selection sync, both directions: click row = select on canvas and in timeline (Shift/Ctrl multi-select, a collection row selects all assets inside); selecting on canvas or in timeline highlights the row, expands its parent collections and scrolls the outliner to it.

## 13. Reveal in timeline
- Whenever an asset is selected from the canvas, the outliner, or elsewhere, the timeline scrolls vertically so that the asset's lane is fully visible, and horizontally to bring the clip into view if it is off-screen (clip start at about 10% of the viewport width) - without moving the playhead or changing zoom. If already fully visible, do not scroll. Animate 150-200 ms; never fight an active user scroll or drag.
