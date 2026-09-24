# Brief W2-C: clipboard, linked audio/video, and the risky Claimed items

Wave: 2 (continuation). Base: PR #3 head `e275da1` (W2-B, unmerged). This session depends on the TL-020/TL-030 insert rule, so it stacks on the same branch and PR. End tag: `w2-c` (created at merge). Branch: `claude/wave-2-timeline-clips-mwy1f3`.
Authority: `AGENTS.md`, then this brief, then `docs/FEATURES.md`.

## 1. Goal

Clips can be cut, copied and pasted at the playhead; pasted clips land under the insert rule. Video and audio clips can be linked so they move, split, delete and copy together, then unlinked. Detaching audio from a video clip creates a separate audio clip in the data model, which will be audible once an audio engine exists. The eight "risky" Claimed items get real browser proof, or an honest Bug with a reproduction.

## 2. In scope (ledger IDs)

- Clipboard: TL-027.
- Link, unlink and detach audio: TL-032.
- Risky Claimed items: HIS-002, HIS-004, TL-017, CV-031, INS-002, INS-003, PRJ-012, CV-022, CV-011.

## 3. Out of scope

- The OS clipboard and pasting media from outside the app (CV-028).
- Audible playback of detached audio (VID-006, AUD-*, which need an audio engine).
- Replace (VID-009) and compound clips (TL-052).
- Linked trimming (trims stay per clip).
- Fixing any risky item that turns out to be broken: record it as Bug with a `test.fail`, as the owner instructed.

## 4. Ledger Change Requests to apply first

None. Every ID already exists.

## 5. Contracts, schema and dependencies

- Schema stays 4, following the D-033 pattern: the link and detach state live in `clip.metadata` and are validated at the command boundary.
  - `linkId: <id>` holds the link group.
  - `audioDetached: true` marks the video clip.
  - `detachedFrom: <clipId>` marks the audio clip.
- New commands, synchronous and refused on locked tracks: `SET_CLIP_LINK` and `SET_CLIP_AUDIO_DETACHED`.
- A detached audio clip needs an audio-typed asset, because the validator requires layer and asset types to match. Detach therefore adds a derived asset: `type: audio`, `source.kind: generated`, reference `audio-of:<videoAssetId>`, with the source's duration and no media bytes. It is created once per video asset and reused.
- No new dependencies and no frozen contracts touched.

## 6. Design notes

- **Clipboard:** in-app and transient. It is not saved and creates no history.
  - **Copy** (Ctrl+C) stores the selected clips (layer plus clip), including linked partners and their offsets from the earliest clip.
  - **Cut** (Ctrl+X) is Copy followed by Delete, as one undo step, and is refused on locked tracks.
  - **Paste** (Ctrl+V) places the group at the playhead with new IDs, keeping relative offsets and any links under a fresh link ID.
    - Target track: the selected clip's track if it is compatible (single-track clipboard); otherwise the original track if it is compatible and unlocked; otherwise a free or new compatible track.
    - Landing uses the TL-030 insert rule, and the pasted clips are selected.
    - Paste can repeat.
  - Available from the keyboard, the palette, the timeline clip menu and the canvas menu. The canvas menu's placeholder Cut, Copy and Paste become real.
- **Link** (two or more clips selected) gives all of them one new `linkId`. **Unlink** clears it for every clip in the selected clips' groups.
  - Linked clips move together in time (drag, Alt+←/→), split together at the playhead, delete together and copy together.
  - Only the dragged or selected clips change track; linked partners keep their own track.
  - Linked clips show a link badge.
- **Detach audio** (video clip on a video asset, not already detached) is one undo step. It:
  - adds the derived audio asset if missing;
  - creates an audio layer and an audio clip with the same timing, source range, speed and reverse;
  - puts that clip on a free audio track, or a new one;
  - marks the video clip `audioDetached`.

  The two clips are not linked afterwards (the Clipchamp convention); Link can join them.

## 7. Steps

1. Brief.
2. Core commands and metadata helpers, with unit tests.
3. Clipboard, link and detach logic in `editing.ts`, plus menus, registry and badges.
4. TL-027 and TL-032 Playwright tests.
5. Risky-item Playwright tests, with a `test.fail` for any that are broken.
6. Ledger, docs, report addendum, verify, then update the PR.

## 8. Required tests

- TL-027: copy, paste twice, cut, undo and redo, the insert push, and the canvas menu path.
- TL-032: link, then drag, split, delete and copy moving together; unlink; detach producing an audio clip, track and asset with matching timing; undo.
- Each risky ID: a test titled with its ID that proves its ledger sentence the way a user would do it.

## 9. Acceptance

- [ ] `npm run verify` exits 0
- [ ] Every in-scope ID is Verified or honestly Bug
- [ ] Report addendum written, PR #3 updated, working tree clean

## 10. Stop rules

Stop if any item needs a schema bump, a frozen-contract change or a new dependency. A broken risky item is recorded, not fixed.
