# Brief W4-A: media import, browser media storage, thumbnails

Wave: 4, part A of three (W4-A import and storage, W4-B video and image on the canvas and in playback, W4-C audio). Base: PR #3 head `a965116` (W2-B, W2-C and the CV-022/CV-008 fixes, unmerged). End tag: `w4-a` (created at merge).
Branch: `claude/wave-2-timeline-clips-mwy1f3`, continuing PR #3.

- The owner asked to keep working on the same branch and PR.
- This session may push only to that branch.
- W4-A also depends on unmerged W2 code (the TL-017 fix sits in the W2 timeline). A separate branch would therefore be stacked on this one anyway.

Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

The owner can bring their own video, audio and image files into a project, using the Import button or by dropping files on the app. Each file shows up as a card in the Media tab, with a thumbnail, its name and its duration or type. The files are kept in the browser's own storage, so they are still there after a reload, and the project file keeps only references.

Cards can be dragged to the timeline or the canvas. Two known bugs in the same area are fixed:

- **MED-035:** the Media tab does not show the media cards.
- **TL-017:** dragging several clips to another track collapses them onto one track.

Seeing and hearing the imported media (decoding and playback) is W4-B and W4-C, not this part.

## 2. In scope (ledger IDs)

- Fixtures: DEV-008.
- Import: MED-001, MED-002, MED-003 (see the note in section 5), MED-004.
- Storage: MED-006.
- Media tab: MED-007, MED-009, MED-018, MED-035 (Bug).
- Using imported media: MED-013, MED-014 (Claimed), MED-015.
- Timeline bug: TL-017 (Bug).

## 3. Out of scope

- **Drawing media on the canvas and playing it back:** decoded video frames, image pixels, audio, and the related items (PB-009 to PB-012, VID-*, TL-046, TL-047). These belong to W4-B and W4-C. Until then, imported layers keep their current placeholder drawing.
- **More Media tab features:**
  - Streaming proof for multi-GB files (MED-005). Import is written to stream, but no large-file test is required, so the item stays Todo.
  - Asset details (MED-017) and waveforms (MED-019).
  - Relinking missing media (MED-020).
  - Metadata handling (MED-021 to MED-024).
  - Duplicate detection (MED-025).
- **Managing assets in the Media tab:** delete, rename, sort, list view, hover-scrub and double-click-to-add (MED-008, MED-010 to MED-012, MED-016).
- **Stock media:** Pixabay (MED-028 to MED-033).
- **Project storage in IndexedDB:** PRJ-015 to PRJ-017.
- **Garbage-collecting unused media bytes.** They stay in storage; this is a known gap.
- **The React shell migration (D-003).** It is not started here, see D-053.

## 4. Ledger Change Requests to apply first

None. Every ID already exists.

## 5. Contracts, schema and dependencies

**Schema stays 4.** The existing asset record already has what is needed:

- `source.kind: 'local'` with `reference: 'media/<fingerprint>'`
- `width`, `height` and `duration`
- JSON-safe metadata: `mimeType`, `size`, `fileName`, `lastModified`, `fingerprint`

**Media bytes and thumbnails** live in a new `src/media` module, outside `src/core`, as D-004 requires.

- It uses OPFS, with IndexedDB as the fallback.
- It never uses project JSON or localStorage.

**No new dependencies.**

**Fixture tooling:**

- The fixture files are generated once with a static ffmpeg binary taken from the `imageio-ffmpeg` wheel.
- That binary is a scratch tool. It is not a project dependency and is not committed.
- The generator script is committed so the pack can be rebuilt.

**MED-003 note:**

- The sandbox's Chromium 141 cannot decode H.264 or AAC; `canPlayType` returns an empty string for them.
- So MP4, MOV and M4A imports can only be proven in the owner's Chrome.
- The browser test proves WebM (VP9 and Opus), MP3, WAV, OGG, PNG, JPG, WebP, GIF and SVG, plus the clear message for an unsupported or corrupt file.
- MED-003 becomes Verified only if its whole sentence is proven; otherwise it stays Claimed and the report says exactly what is missing.

## 6. Design notes

**Import pipeline (per file, one at a time)**

1. Classify by MIME type, falling back to the extension. Anything that isn't video, audio or image is refused with a message naming the file.
2. Compute a fingerprint: SHA-256 of the byte size and three 1 MiB samples (start, middle and end), shown as 32 hex characters. The name and MIME type are not part of it. The whole file is never read into memory. The asset id is `media-<first 16 hex characters>`.
3. **Duplicates:** if the project already has that asset, it is selected in the Media tab and the owner is told it's already in the project. No second copy is made.
4. **Storage:** stream the file into the media store (`file.stream()` into an OPFS writable, or a Blob into IndexedDB). Report progress by bytes written.
5. **Probe** with a media element or `createImageBitmap`:
   - Video: duration, width, height.
   - Audio: duration.
   - Image: width and height.
   - Errors: a probe failure or timeout means "cannot be read by this browser", and the stored bytes are removed.
6. **Add to the project** with one `ADD_ASSET` transaction per file, labelled "Import media", so each import is undoable.
   - Undo removes only the reference. The bytes stay, so Redo works.
7. **Thumbnails** are generated asynchronously after the asset is added, and stored in the media store as `thumbs/<fingerprint>`.
   - Video: a frame near 10% of the duration, capped at 1 s.
   - Image: the image scaled down.
   - Audio: no thumbnail; the card shows an audio icon. Waveforms are MED-019.

**Progress and cancel (MED-004)**

- An import row at the top of the Media tab shows the file name, a percentage and a Cancel button.
- Cancel stops the current file, deletes its partial bytes and skips the rest of the batch.
- Files that finished before the cancel stay imported, because each file is its own undo step.

**Media tab (MED-035, MED-007, MED-009)**

- The card grid lives in its own container, which is shown only on the Media tab. Other tabs no longer show the cards.
- Each card shows:
  - its thumbnail;
  - its name;
  - a badge: the duration as m:ss for video and audio, or "Image";
  - a loading state while its thumbnail is being made.
- Cards are draggable as before (`application/x-editor-asset`).
- **States:**
  - Empty: "No media yet", with Import and drop hints.
  - Error, when the media store is unavailable: a message.
- **Search** filters cards by name, as you type.

**OS drop (MED-002)**

- Files dropped anywhere on the app are imported, and the Media tab opens.
- The existing drop overlay stays.

**Using imported media (MED-013 to MED-015)**

- Dropping a card on a track creates a clip at the drop time, using the insert rule. It uses the asset's duration, or 5 s for images.
- Dropping a card on the canvas creates a layer centred on the drop point. Images and videos get their own size, scaled down to fit inside the composition if they are larger.
- A locked or incompatible track refuses the drop with a toast.

**TL-017 (D-054)**

- A cross-track drag of several clips moves every dragged clip by the same number of tracks in display order.
- If any clip's target track would be missing, locked or incompatible, no clip changes track; they still move in time.
- Linked followers keep their own tracks (D-048).
- A ghost is shown on each clip's own target track.

**Other**

- All UI text uses translation keys (English and Hindi), and every icon-only control has a label.
- The UI follows the existing imperative DOM shell (see D-053).

## 7. Steps

1. Write this brief. Commit the TL-017 fix with its regression test.
2. Build the fixture pack and its manifest, plus a project fixture built through engine commands, with a unit test that rebuilds and compares it (DEV-008).
3. Build `src/media`: the store interface with OPFS, IndexedDB and in-memory versions; the fingerprint; the probe; thumbnails; and the import pipeline. Add unit tests.
4. Build the Media tab UI: the card grid, the import row, the Import button, the OS drop, the empty and error states, and translations.
5. Size canvas drops from the asset.
6. Write the Playwright tests for every in-scope ID.
7. Update the ledger and docs, write the report, run a full verify, push, and update the PR.

## 8. Required tests

- **DEV-008:** the manifest lists every file with its size, type and generator settings. A unit test rebuilds the media project fixture through engine commands and compares it with the committed file.
- **MED-001:** Import button, then the file chooser, then pick a WebM, a WAV and a PNG. Three cards appear.
- **MED-002:** dropping real `File` objects (built from the fixture bytes) on the app imports them.
- **MED-003:** each browser-decodable fixture type imports. A text file and a corrupt `.mp4` each show a clear message, with no console error and no asset added.
- **MED-004:** under a simulated slow disk (an init script slows `FileSystemWritableFileStream.write`), the progress row appears and Cancel leaves no asset and no stored bytes.
- **MED-006:** after import and a reload, the cards and thumbnails are still there. The saved project JSON contains no `data:` URIs or media bytes, only `media/<fingerprint>` references. The bytes exist in OPFS.
- **MED-007 and MED-018:** the card shows a thumbnail (a decoded, non-empty image), the name and a duration badge. The thumbnail is stored and, after a reload, is read back rather than regenerated.
- **MED-009:** search narrows the cards and clearing it restores them.
- **MED-013 and MED-014:** dragging an imported card to a track creates a clip at the drop time with the asset's duration. A locked or incompatible track refuses with a toast.
- **MED-015:** dragging an imported image card to the canvas creates a layer at the drop point with the image's aspect ratio.
- **MED-035:** the Media tab shows the cards, and the Graphics tab does not.
- **TL-017:** a two-track selection dragged down one track keeps its offset. An impossible shift changes no tracks.
- **IndexedDB fallback:** the same import and reload flow works when OPFS is missing, using an init script that removes `navigator.storage.getDirectory`.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report addendum written, PR #3 updated, working tree clean

## 10. Stop rules

Stop and report if any of these happens:

- the import needs a schema change or a new runtime dependency;
- OPFS and IndexedDB both fail in the sandbox browser;
- a frozen contract would need to change.
