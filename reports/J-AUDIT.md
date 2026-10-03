# J-AUDIT: right panel, menus and toolbar before the J-series

Base: `claude/i-series` at 63a8292 (PR #16, open). Written before any J-series change. Targets are the brief's J14 (right-click menus) and J15 (right-panel sections), and the owner's reference `docs/reference/clipchamp-panels-and-menus.pdf`.

Legend:
- **exists**: the target item works today.
- **partial**: something close works but is missing part of the target.
- **missing**: nothing does it today.

## 1. Right panel today (I4, `src/ui/right-panel.ts`)

The rail shows these tabs. The first tab is named after the selection.

| Selection | Tabs (rail order) | First tab content |
| --- | --- | --- |
| Nothing | Canvas, Captions (planned W8), Transitions (planned W6) | Canvas size presets and Custom; background colour (project-wide); Scene length |
| Video | Video, Speed, Audio, Fade, Animate, Effects (planned W6), Adjust colors | Crop, Flip, Corners, then folded Position and size, Timing, Details |
| Image | Image, Animate, Effects (planned), Adjust colors, Filters (planned W6) | Crop, Flip, Corners, Border, plus the Inspector accordions |
| Shape | Shape, Animate, Effects (planned), Adjust colors | Colour, Outline (stroke popover builder), Corners, Combine (Union, Subtract, Intersect, Exclude) |
| Drawing | Drawing, Animate, Effects (planned), Adjust colors | Ink colour |
| Text | Text, Animate, Effects (planned), Adjust colors | Font, size, B I U S, uppercase, align, colour; Advanced (Spacing popover: weight, line height, letter and paragraph spacing, case, anchor) |
| Audio | Audio, Speed, Fade (planned AUD-003 W7) | Volume (planned W7), track mute, Detach audio |
| Group | Group, Animate | Group, Ungroup, Align (six edges) |
| Several | Arrange | Group, Ungroup, Align, Distribute |

Each tab's content:
- **Speed:** presets 0.25x to 4x, Reverse, Freeze frame.
- **Fade:** fade in and fade out in seconds (number field with a slider).
- **Animate:** a button that opens the Animate side panel (in, out, loop, Ken Burns presets), and "Open 2D Animation".
- **Adjust colors:** Transparency works. Exposure, Contrast, Saturation, Temperature, Blend mode and Reset are planned (CLR-001, MSK-001).
- **Inspector accordions:** Position and size, Timing and Details sit at the bottom of every first tab (I4, D-148).

## 2. Right panel: J15 target against today

| Type | Target section | Today | Notes |
| --- | --- | --- | --- |
| Video | Auto captions | missing | Honest disabled state (W8, TXT-035) |
| Video | Audio | partial | Detach works; volume is planned. The audio engine is in PR #14 |
| Video | Fade | exists | Seconds with sliders |
| Video | Filters | missing | Planned tab; no filter engine |
| Video | Effects | missing | Planned tab; no effect engine |
| Video | Adjust colors | partial | Transparency only |
| Video | Speed | partial | Presets only; target is a slider (0.1x to 16x ticks) plus a field |
| Image | Fade | partial | Works for images, but lives in the Animate panel, not the image's tabs |
| Image | Filters, Effects | missing | Planned |
| Image | Adjust colors | partial | Transparency only |
| Shape | Shape | exists | Fill, Outline settings, Corners |
| Shape | Animate | partial | Opens the Animate side panel; target is a preset grid in the panel |
| Shape | Effects | missing | Planned |
| Shape | Adjust colors | partial | Transparency only |
| Text | Text | partial | Font, size, B I U S, align, colour. Target adds weight, plus Outline and Shadow in Advanced |
| Text | Animate | partial | Opens the Animate side panel; target is a preset grid in the panel |
| Text | Effects | missing | Planned |
| Text | Adjust colors | partial | Transparency only |
| Transition | Transition section | missing | J12 |
| Panel header | Title, count badge, collapse | partial | Title only |

## 3. Today's right-panel capabilities with no slot in J15 (must stay reachable, rule 7)

| Capability | New home in J15 |
| --- | --- |
| Crop, Flip, Corners, Border (image, video) | "Advanced" group in Adjust colors |
| Canvas tab: size, background, scene length (nothing selected) | Kept as the Canvas section |
| Group or Arrange tab: Group, Ungroup, Align, Distribute | Kept as the Group or Arrange section |
| Drawing tab: ink colour | Kept as the Drawing section |
| Audio clip tab: mute, Detach | Kept as the Audio section |
| Combine (boolean shapes) | Shape section, Advanced group |
| Inspector accordions (Position and size, Timing, Details) | Advanced group of the first section |
| Reverse and Freeze frame (Speed tab) | Speed section |
| Spacing popover (weight, line and paragraph spacing, case, anchor) | Text section, Advanced group |
| Open 2D Animation (Animate tab) | Animate section |

## 4. Timeline right-click menu today (`contextActions`, `src/ui/timeline.ts`)

- **On a clip:** Split (when the playhead is inside), Duplicate, Delete (not on locked layers), Enable / disable clip, Speed › (presets), Reverse, Freeze frame (video and audio only), Cut, Copy, Paste (when the clipboard has items), Link clips, Unlink, Detach audio (video with audio), Group (several), Ungroup.
- **On a keyframe:** easing presets, Copy, Paste, Duplicate, Delete.
- **On a marker:** Delete marker.
- **On empty space:** Add marker, Paste.

## 5. J14 target against today

| Type | Target item | Today |
| --- | --- | --- |
| Video | Duplicate (Ctrl+D) | exists (no shortcut shown) |
| Video | Copy, Paste, Delete | exists (no shortcuts shown) |
| Video | Split (S) | exists |
| Video | Freeze frame (F) | exists (no F shortcut) |
| Video | Edit duration | missing |
| Video | Rename | missing on the timeline (the Inspector has a name field) |
| Video | Audio › Mute, Detach | partial: Detach exists, mute is per track only |
| Video | Auto cut | missing: disabled, AI W10 |
| Video | More options | missing |
| Image | Duplicate, Copy, Paste, Delete, Split | exists |
| Image | Edit duration, Rename, More options | missing |
| Shape, Text | Duplicate, Copy, Paste, Delete, Split | exists |
| Shape, Text | Edit duration, More options | missing |

These existing items have no J14 slot and stay in the menu after a divider (rule 7): Cut, Enable / disable, Speed ›, Reverse, Link, Unlink, Group, Ungroup, Add marker, keyframe items, Delete marker.

## 6. Canvas right-click menu today (`src/ui/canvas-menu.ts`)

- **On an element:**
  - Edit items from `contextActions`: Duplicate, Delete, Cut, Copy, Paste, Speed, Reverse and Freeze.
  - Arrange › forward, backward, to front, to back.
  - Align › six edges, Relative to canvas.
  - Combine shapes › Union, Subtract, Intersect, Exclude.
  - Copy style, Paste style, Lock or Unlock, Hide (planned).
  - Show element timing, Alternative text, Set image as background, Resize canvas to selection.
  - Download selection, Info, Comment (planned).
- **On empty canvas:**
  - Paste.
  - Add scene, Duplicate scene, Delete scene.
  - Save as template.
  - Canvas size › presets and Custom.
  - Guides › Off; Grid, Rulers and Safe areas are planned.

The canvas menu is not changed by J14 (J14 is the timeline clip menu). J6 fixes three of its items: Show element timing, Alternative text and Resize canvas to selection.

## 7. Features with no Clipchamp equivalent (kept)

The keep rule (AGENTS.md section 3, brief rule 7) covers all of these:
- **Tracks:**
  - lock, hide, solo and mute toggles;
  - track reorder (up and down);
  - legacy layer rows for layers without clips.
- **Clips and markers:**
  - link and unlink;
  - markers;
  - keyframe diamonds and their menu (2D Animation).
- **Canvas editing:**
  - the canvas boolean Combine;
  - Copy and Paste style;
  - Lock;
  - Set image as background;
  - Download selection.
- **Scenes and templates:**
  - the scenes board;
  - the scene strip;
  - My Templates.

## 8. Findings from this audit (fixed in J1, J2 and J6)

- **Background colour:** it is one project setting (`settings.backgroundColor`), so every scene shares it.
- **Canvas size:** it applies to every scene (`canvasSizeCommands` loops over all compositions) and rewrites every layer's position (D-123).
- **Undo:** it does not switch scenes, so undoing an edit in another scene changes nothing visible.
- **Gradient fill:** switching Solid, Linear and Radial rebuilds the stops from `fill` and loses the previous stops.
