# UNDO-RULES.md: what Undo and Redo cover

Undo and Redo cover **project edits** only. A project edit changes what the
video looks like or how it is timed. The Command Bus records it as one step
(`engine.commands.transaction`).

**Library changes** add, rename or remove material the project can use. They go
through `engine.library` (D-136), which:

- applies the change at once;
- writes the same change into every Undo and Redo snapshot, so a later Undo
  never takes the media away again;
- adds no history step.

**Browser and session state** never touches the project.

Each rule below names its proof (a test title starting with the ledger ID).

## Undoable: project edits

| Action                                                                                     | Undoable | Why                                                                           | Proof                    |
| ------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------- | ------------------------ |
| Add, delete, duplicate, group, ungroup or reorder layers                                   | Yes      | Changes the design                                                            | HIS-001, HIS-002         |
| Move, resize, rotate, nudge, crop, flip; Inspector, Position and toolbar field edits       | Yes      | Changes the design. One step per gesture, on release                          | HIS-002, CV-004          |
| Text, styles, fill, stroke, gradient, corners, border, transparency, lock, alt text        | Yes      | Stored on the layer                                                           | CV-051, TXT-014          |
| Keyframes, animation presets, fades                                                        | Yes      | Changes the motion                                                            | ANI-004                  |
| Clips: place, move, trim, split, delete, speed, reverse, freeze, link, detach audio        | Yes      | Changes the timing                                                            | TL-020, VID-015          |
| **Placing media on the canvas or timeline**                                                | Yes      | The layer and its clip go back; the media stays in Project Media              | HIS-008                  |
| Tracks: add, delete, reorder, rename, mute, lock                                           | Yes      | Stored on the composition                                                     | TL-004                   |
| Scenes: add, duplicate, delete, rename, reorder, scene length                              | Yes      | Stored in the project                                                         | PRJ-013                  |
| Canvas size and background colour                                                          | Yes      | Stored in the project                                                         | CV-055                   |
| Library inserts: shapes, text styles, backgrounds, templates (replace, add or new scene)   | Yes      | One step; the template toast's Undo runs the same Undo                        | TPL-011, TPL-013         |
| Restore after a media Delete                                                               | n/a      | The toast's Restore button is how a delete is undone; it is not a history step | MED-036                  |

## Not undoable: library changes (`engine.library`)

| Action                               | Undoable | Why                                                                                                                                                               | Proof            |
| ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Import media (button, drop, Replace upload, signature upload) | No | Importing gathers material; it does not edit the video. Undoing a later edit must never make media vanish | HIS-008 |
| Rename media                         | No       | A label in Project Media, not part of the picture                                                                                                                 | MED-037          |
| Delete media                         | No       | Restore (8 s toast) brings it back; after that the stored files are removed for real, and a re-import brings it back                                             | MED-036          |
| Rename the project                   | No       | A file name, like saving under a new name                                                                                                                         | HIS-008          |

## Not undoable: browser and session state

| Action                                                                                | Undoable | Why                                                                     |
| ------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Media folders: create, rename, delete, move items in                                  | No       | Stored in this browser with the media metadata, not in the project      |
| Save to My Templates, saved signatures, library recently used, last template choice   | No       | Stored in this browser (`localStorage`), not in the project             |
| Theme, panel open or closed, panel widths, zoom, pan, hand tool                       | No       | View settings                                                           |
| Selection, entered group, mode (Editor or 2D Animation), draw mode, solo (D-034)      | No       | Transient session state; selection never creates history (AGENTS.md §4) |
| Export, Download selection, copy debug report                                         | No       | They read the project and write a file                                  |
