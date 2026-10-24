# Draw palette: how Canva's whiteboard tools work (FIX5 C4)

Sources read (one web search, 24 Oct): Canva Help, "Brainstorm and collaborate visually with Canva Whiteboards" (canva.com/help/expand-to-whiteboard) and Canva's "Add and connect lines to elements" help page. Canva's pages are thin on interaction detail, so most behaviour below is marked **assumed**: it follows common whiteboard practice and Canva's visible UI, not a sentence we could cite.

| Topic                      | Finding                                                                                                                        | Status                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Tools offered              | Draw, shapes, lines, sticky notes, text and tables sit together as whiteboard tools.                                           | Confirmed (help page) |
| Shortcuts                  | S adds a sticky note, C a circle, R a square, L a line.                                                                        | Confirmed (help page) |
| Where lines come from      | Press L, pick Line in Elements, or the Line icon under Tools. A line's end can be dragged to a shape's border and snaps to it. | Confirmed             |
| Flyout of choices per tool | Each tool offers more than one kind (shape types, line styles, note colours, text styles) before placing.                      | Assumed               |
| The choice stays active    | The last chosen kind is what the next placement uses.                                                                          | Assumed               |
| Click versus drag          | A click places the default size, a drag draws the size.                                                                        | Assumed               |
| Preview while placing      | A ghost or dashed frame follows the pointer.                                                                                   | Assumed               |
| After placing              | The tool returns to Select; Esc cancels.                                                                                       | Assumed               |
| Tables                     | Added from Elements (a rows by columns picker); a toolbar button is not documented.                                            | Unconfirmed           |

## What this editor does (D-302)

- Every placing tool (Shape, Line, Sticky note, Text, Table) opens a flyout of choices first. The choice stays selected in the flyout until changed.
- Click places the default size centred on the pointer; drag draws the size; a dashed ghost at the default size follows the pointer. The shape is placed on release only, as one undo step. Esc cancels a drag; with no drag, Esc puts the tool away. After placing, the palette returns to Select.
- Shape: rectangle, rounded rectangle, ellipse, then every shape in the library (triangle, diamond, polygons, stars, blobs). Library shapes keep their own size on a click and are scaled to the dragged box on a drag.
- Line: line, dashed, dotted, arrow, double arrow. **Curved and elbow connectors are not built** (the engine has no connector layer); a line does not snap to shapes.
- Sticky note: six colours. Text: text box, heading, subheading, body, then saved text from My Templates and the older saved text styles. Table: an 8 by 8 size picker that uses the Elements table insert.
