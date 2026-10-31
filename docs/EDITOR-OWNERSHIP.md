# EDITOR-OWNERSHIP.md: who owns what, and what Undo covers (D-347)

The editor is one part of a platform (website, user panel, admin app, cloud
storage, database). The editor edits ONE project. Everything else a panel shows
is a **library**, and libraries are never part of the project's history.

## Three owners

| Owner         | What it is                                                                                 | Reaches the editor as                                    | In Undo? |
| ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------- |
| Admin library | Owner catalog: Templates, Elements, Text, Audio, Themes, Draw and Record presets (D-329..) | Read-only cards, fetched and cached                      | Never    |
| User library  | The user's own: Media, My Templates (with saved Themes), AI compositions                   | Cards of THIS project; import from other projects on ask | Never    |
| Editor        | Scene, the canvas, timeline, right panel, Draw tools, keyframes, animation, colours        | Edits of the project document                            | Yes      |

Only a change that alters the picture or its timing is a history step. Putting
an item on the canvas is a step (the layers go back on Undo); adding, saving,
renaming, importing or deleting a library item is not (D-136, UNDO-RULES.md).

## Project-wise user libraries

Every user-library item belongs to one project (`projectId`):

- **Media:** the project's assets; bytes are stored once by fingerprint on the
  user's disk (OPFS) and shared; another project's media arrive by import.
- **My Templates and saved Themes:** the panel lists only this project's items.
  **Import Templates from your Cloud** opens a dialog (grouped by project,
  search, multi-select); the chosen items are COPIED into this project.
- **AI compositions:** the same. **Import AI templates from your AI libraries.**
  The card's status (Built, Needs assets, Not built) is computed from the
  scenes in the project, so Undo and Redo keep it true.
- A **new project is fresh**: nothing of another project's library or build
  state is shown.

An old item saved before projects existed joins the project that is open the
first time the editor starts after this change (once), so nothing a user saved
is lost from view. A reload without a saved project opens a new project, which
is fresh; the earlier project's items come back by import (or by reopening that
project).

## Storage and safety

- The project saves to this browser 0.5 s after each edit, keeps the last good
  copy, flushes on page hide, and is offered back after a crash (APP-018, PRJ-017).
- The media store reopens its connection and retries once when the browser closed
  it, and says "Opening media storage" for at most a few seconds, then retries.
- **Cloud sync** (top bar switch): a master switch and one switch per group
  (Project, Media, My Templates + Themes, AI compositions), each with its size.
  Turning it ON uploads what exists, then every new import or save follows.
  Until accounts exist (Phase 2) the target is a local stub with the same
  interface, and the editor says so.
- The **browser Back button** inside the editor opens "Save to cloud?" (Save,
  Don't save, Cancel). Closing the tab can only show the browser's own warning,
  so the local autosave is the net.

## Not in the editor

New project, Projects, Open project, Open example and the account live in the
user panel (Phase 2). Until it exists, the editor keeps them in its File menu
and each item is marked "moves to the user panel" in docs/FEATURES.md.

## Panel table

| Panel             | Owner                          | Panel lists                        | Undo can change it?                    |
| ----------------- | ------------------------------ | ---------------------------------- | -------------------------------------- |
| Templates         | Admin                          | Catalog cards                      | No                                     |
| Elements          | Admin                          | Catalog cards, browse tiles        | No                                     |
| Text              | Admin                          | Catalog text styles                | No                                     |
| Media             | User (project)                 | This project's media               | No (placing on canvas is)              |
| Draw              | Editor + Admin presets         | Tools, catalog shapes              | Only what is drawn                     |
| Scene             | Editor                         | This project's scenes              | Yes (scenes are in the project)        |
| Record and create | Editor + Admin                 | Recorder, voice, stock             | Only what is placed                    |
| Audio             | Admin                          | Catalog sounds                     | No                                     |
| AI                | User (project) + Admin presets | This project's compositions        | No; its status follows the canvas      |
| My Templates      | User (project)                 | This project's saved items, themes | No (a delete offers Restore, not Undo) |
| Theme             | Admin + user                   | Built-in, My themes (project)      | Applying a theme is; saving one is not |
