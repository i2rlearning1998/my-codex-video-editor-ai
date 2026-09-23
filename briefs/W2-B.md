# Brief W2-B: one clip model, locks, no overlaps, and Wave 2 proof debt

Wave: 2 (continuation; the roadmap's W3, Text and fonts, is a later session). Base: `main` at `fe92fc5` (merge of PR #2). End tag: `w2-b` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3` (session-assigned, restarted from `main`).
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Every layer the owner sees is a clip on a track. There are no legacy free-layer rows and no way to create one. A locked track blocks every edit to its clips, with visible feedback. Clips never overlap on a track: dropping or moving onto occupied time inserts the clip and pushes the later clips right, and a marker shows this before release. Eighteen Wave 2 items that were Claimed but unproven get real browser tests.

## 2. In scope (ledger IDs)

- Model: TL-001.
- Lock bug: TL-004.
- Overlaps: TL-020, TL-030.
- Proof debt (Claimed items to prove with Playwright): TL-009, TL-012, TL-014, TL-016, TL-023, TL-028, TL-035, PB-002, CV-002, CV-003, CV-006, CV-008, CV-009, CV-016, LYR-001, LYR-002, INS-009, INS-010.

## 3. Out of scope

- TL-027 (cut, copy and paste) and TL-032 (linking and detaching audio): next session, once TL-020 and TL-030 have landed.
- Group B "risky" Claimed items: HIS-002, HIS-004, TL-017, CV-031, INS-002, INS-003, PRJ-012, CV-022, CV-011.
- VID-006, VID-009 (need the media pipeline) and TL-052 (needs a schema decision).
- Text and fonts, the roadmap's W3.
- No schema bump. No wave-column moves.

## 4. Ledger Change Requests to apply first

- TL-003 and TL-005: Claimed → **Todo**, wording unchanged. The described drag handle, type icon, editable name and drag-to-reorder for tracks do not exist; tracks reorder with the ↑/↓ buttons only. Lock, eye, solo and mute are proven under TL-059. The wording stays because it still describes the wanted behaviour, so rewording would drop a requirement.
- The stale "Status now" line under the Waves table now points to `npm run ledger` instead of hard-coded counts.

## 5. Contracts, schema and dependencies

- Schema stays 4. TL-001 is enforced by creation paths and a one-time open conversion, not by the validator. This is the owner's decision in this session: "clip-first, no schema change".
- `DELETE_LAYER` refuses layers whose clip, or a descendant's clip, is on a locked track. This is a command-rule tightening; the schema is unchanged.
- No frozen contract changes and no new dependencies.

## 6. Design notes

- **Open conversion** (`adoptFreeLayers`, pure core function): every top-level layer without a clip gets one, keeping its current timing, on the first compatible, unlocked track with free time at that range; otherwise on a new track appended at the bottom. The track type follows the layer type:
  - text → Text track
  - shape or group → Graphics track (the `object` track type)
  - video or image → Video track
  - audio → Audio track

  Clips on nested (group child) layers are removed, and their timing is folded into the layer. It runs when a document is opened (browser save, file import) and for the built-in example. The status bar says how many layers were converted. The browser's previous save stays as the recovery backup (existing `:backup` behaviour).

- **Group children** live inside their group's clip. Their own timing is edited in the Inspector Timing tab, not as separate timeline rows. This is an accepted narrowing that follows from TL-001.
- **Creation paths** always produce a clip:
  - Canvas asset drop: clip on a compatible track with free time at the playhead, else a new track.
  - Duplicate: the copy lands right after the original on the same track, and later clips are pushed.
  - Group: a group clip spanning the children; the children's clips are removed and their timing folded in.
- **Insert rule (TL-030):** a clip moved or dropped onto occupied time on a track is inserted at that time. If it lands inside another clip, the insertion point snaps to that clip's nearer edge, so nothing is split. Every later clip on the track shifts right just enough. While dragging, the pushed clips preview at their new times and a vertical insertion marker (`.timeline-insert`) shows the insertion point. Keyboard Alt+←/→ nudges clamp at neighbours instead of pushing. Alt+↑/↓ and asset drops use the insert rule.
- **TL-020:** no edit path leaves two clips overlapping on a track, and none shrinks a clip below one frame.
- **Lock feedback (TL-004):** clips on locked tracks show a hatched, `not-allowed` style. Any refused edit raises the error toast added in W2-CLAUDE.

## 7. Steps

1. LCR, brief.
2. Core: adoption, insertion planning and the lock rule, with unit tests.
3. UI: load paths, creation paths, move gesture with push preview, lock styling.
4. Proof-debt Playwright tests, grouped by area.
5. Ledger, docs, report, verify, PR.

## 8. Required tests

- TL-001: open the built-in example and the NLE fixture plus a canvas drop; there are no `.timeline-row` legacy rows and every top-level layer has a clip.
- TL-004: convert the `test.fail`; Delete, drag, trim, split and keyboard edits on a locked track all leave it unchanged and show a toast.
- TL-020 and TL-030: a drag onto occupied time previews the push and the marker, commits as one undo step with no overlaps, and Escape cancels. Duplicate pushes. Alt+→ clamps.
- Each proof-debt ID: a test titled with its ID that proves the ledger sentence as a user would do it.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope P0 ID is Verified, or listed as not done with a reason
- [ ] Report written, PR open against `main`, working tree clean

## 10. Stop rules

Stop if TL-001 turns out to need a validator or schema change, if a proof-debt test reveals a bug whose fix is out of proportion (record it as `test.fail` and continue), or if the insert rule conflicts with a frozen contract.
