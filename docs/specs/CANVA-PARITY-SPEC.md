# Canva-Parity Canvas Interaction — Full Specification
(Compiled from: user's screen-recording of Canva, Canva's own help docs, and our app's current test video)

## Core UX Philosophy (why Canva feels "simple" despite having everything)

1. **Progressive disclosure, not walls of buttons.** Only ~6-9 controls show at once (in the floating toolbar). Everything else lives one click deeper (a side panel) or in "..." / right-click.
2. **Direct manipulation first.** Move/resize/rotate happen by dragging on canvas, never through a dialog.
3. **Same interaction language for every object type.** Selection box always looks the same; only the toolbar's *content* changes. User never has to learn a new pattern per object.
4. **Icons + tooltips, not labeled buttons**, once a user is past the first click.
5. **Everything reversible, nothing hidden behind a modal** unless it's a big action (export, share).

This is the bar for our app — not "add more buttons" but "same restraint with our full feature set behind it."

---

## 1. The Universal Floating Toolbar (appears above/near selection, ALWAYS)

Present for every object type, always in this relative order:
`Edit-mode-specific-controls | Position | Transparency | Effects/Animate (where relevant) | ⋯ More`

**Mini action cluster** (separate small floating pill, appears at the top-right corner of the selection box, distinct from the main toolbar):
`↻ (refresh/reset) · 😊 (comment/emoji reaction) · 🔒 (lock) · ⋯ (more)`

## 2. Per-Object-Type Toolbar Content

### Shape selected
`Edit | Fill color | Stroke/Line style | Corner radius | Effects | Animate | Position | Transparency | ⋯`

### Text selected (confirmed from our own frame capture)
`Font family | Size (− / +) | Font color | Bold | Italic | Underline | Case (Aa) | Line/paragraph spacing | Bullet list | Letter spacing | Effects | Position | Transparency`
- Double-click enters text-edit (cursor blinking) — same click enters edit for both shape-text-inside and pure text boxes.

### Image selected
`Edit photo (opens Crop/Filters/Adjust panel) | Crop | Flip (H/V) | Animate | Position | Transparency | ⋯`
- "Edit photo" opens a **deeper left-side panel**: filters, brightness/contrast/saturation sliders, "Background Remover" button (this is the AI feature — Wave 10 for us).

### Video selected
`Trim (handles on the clip itself, not a toolbar button) | Flip (H/V) | Playback (autoplay/loop toggle) | Volume (slider, click icon to reveal) | Edit photo (crop/filters, same as image) | Animate | Position | Transparency | ⋯`

### Audio selected
`Volume slider | Fade in/out | Trim handles (on the clip) | ⋯`

### Line/Connector selected
`Stroke style | Stroke width | Arrowhead style (start/end) | Color | Position | ⋯`
- Lines can be **drawn between two shapes** using the small "+" handles that appear at the 4 edge-midpoints of a selected shape (confirmed in our captured frame) — dragging from a "+" creates a connector line to whatever shape you drop it on, and the line stays attached if either shape moves. This is a flowchart/diagram feature — **optional/lower priority for us** unless we want diagram-style features.

### Frame selected (a placeholder shape that "holds" an image/video, croppable independent of content)
`Replace | Edit photo | Position | Transparency | ⋯`
- Distinct from a plain image: a Frame's border and its content crop independently — double-click a Frame's content to reposition the media *inside* the frame without moving the frame itself.

### Group selected
`Group actions | Ungroup | Position | ⋯` — the toolbar becomes generic (loses type-specific controls, since a group can mix types) EXCEPT if every member is the same type, in which case shared properties (e.g. all-shapes' fill) still show.

## 3. Right-Click Context Menu (confirmed from our capture)

**Universal (every type):**
```
Copy                    Ctrl+C
Copy style
Paste                   Ctrl+V
Duplicate               Ctrl+D
Delete                  Delete
──────────────
Layer ▸                 [Bring to front / Bring forward / Send backward / Send to back / Show layers]
Align to page ▸         [Left / Center / Right / Top / Middle / Bottom]
──────────────
Lock
Link
Comment
Alternative text (accessibility)
```
**Multi-select adds:** `Group`
**Group selected adds:** `Ungroup` (replaces `Group`)
**Clip on a timeline track adds:** `Speed ▸ / Reverse / Freeze frame / Cut / Link clips / Detach audio` — **only for video/audio clip types, never for image/shape/text**, per the bug we found.

## 4. The "Position" Panel (opens from toolbar's Position button)

Two tabs:
- **Arrange tab:** Align (left/center-h/right/top/center-v/bottom), Distribute (horizontal/vertical), Bring-to-front/forward/backward/send-to-back — same actions as the right-click Layer/Align submenus, just as clickable buttons instead of a nested menu.
- **Layers tab:** flat list of every layer on the current page/composition, drag-to-reorder, hover-for-options icon, grouped layers show a folder-style icon.

## 5. Multi-Select — Exact Visual Spec (this is our confirmed bug)

When 2+ objects are selected (not yet grouped):
1. **One outer dashed bounding box** around the full selection, with 8 handles (4 corner + 4 edge-midpoint).
2. **Each individual object ALSO keeps its own thin solid outline** inside that outer box.
3. **One shared rotate handle** below the outer box — rotates the whole selection as a unit.
4. **The mini action cluster appears above the outer box**, with a **"Group" quick-button** added to it.
5. Dragging any one of the selected objects moves **all** of them, preserving relative position.
6. Resizing via the outer box's corner handles scales **all** selected objects together, proportionally, from the shared bounding box.

**Our app currently:** shows none of steps 1-4 — only the shared rotate icon. This is the single highest-impact fix for "feeling professional."

## 6. Group vs Multi-Select — the distinction to preserve

- **Multi-select** = temporary, cleared on next click elsewhere, no undo-entry of its own.
- **Group** = a permanent layer (undo-able to create/ungroup), shows in the Layers panel as one entry, persists across saves/reloads.
- Editing one child inside an existing group (single click within, matching our already-fixed CV-022 behavior) must still show that ONE child's own handles, not the group's outer box — our CV-022 fix already does this correctly; just needs the outer group box to also render properly when the group itself (not a child) is selected, which the screenshot confirms already works.

## 7. Draw Tool — Canva's full tool set (ours currently has 3)

Canva's Drawing panel: **Pen, Highlighter, Marker, Eraser** (brush-based, removes ink strokes only — not "Magic Eraser," that's AI/Wave 10), plus a **stroke thickness slider**, **color swatch + custom color picker**, and **opacity slider** shared across all brush types. An eraser is essential — currently missing from ours entirely.

## 8. Known Confirmed Bugs (from our app's own test recording)

1. Multi-select shows **no bounding box at all** (see section 5) — Inspector correctly says "N selected" but canvas shows nothing.
2. Clip-only actions (Speed/Reverse/Freeze/Detach audio) appear in the right-click menu **even when an Image is part of the selection** — menu needs to intersect available actions across all selected types, not just show clip actions unconditionally.
3. Context toolbar's Fill/Stroke (shape), Font/Size/Color (text) controls are not live yet — only Position/Scale/Rotate/Flip/Opacity work.
4. No "Ungroup" in the right-click menu, only "Group."
5. Object scaling produces disproportionate/oversized results (reported, needs live repro to pin exact cause).
6. Re-dragging an already-imported media card from the library onto the canvas appears to re-import/duplicate the file in storage instead of referencing the existing one.
7. Distribute (built in W2-D) has no visible entry point in the UI — logic may exist but isn't exposed via toolbar/right-click/Position panel.

## 9. Priority Order for Building This (suggested)

1. Multi-select bounding box render (biggest visual-professionalism gap, and a real bug)
2. Fix clip-action-menu leaking onto non-clip types
3. Wire Fill/Stroke/Font/Color into the context toolbar (make the "working controls" claim actually true)
4. Add Ungroup to the menu
5. Add the Position panel (Arrange + Layers tabs) as a proper panel, replacing scattered right-click-only access
6. Draw tool: add Eraser + finalize the shared size/color/opacity controls
7. Real shape-editing (fill/stroke live, corner radius, boolean ops) — this unlocks item 3 fully
8. Fix scaling bug + duplicate-import-on-canvas-drag bug (pure bugs, no design decision needed)
