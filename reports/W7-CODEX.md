# Report: W7-CODEX audio engine (2026-09-28)

## 1. Summary

- Sound controls are in the existing left-rail Audio tab; select one audio/video clip first.
- Clip gain in dB, mute, pan, fade lengths and volume keys are undoable.
- Three-band EQ, compressor and target-LUFS normalization use the same graph in playback and export.
- Music clips can duck automatically under clips explicitly marked Speech.
- Schema stays 5; no new dependencies; one PR (#14), not merged.
- Pitch-preserving speed is NOT built. Speed still changes pitch.
- Numerical unit tests pass. Browser measurements await CI at this checkpoint; no listening was performed.

## 2. Scope and results

| ID | Result | Evidence / boundary |
|---|---|---|
| AUD-002 | Claimed, partial | `tests/audio-w7.test.ts`; browser panel spec. Gain, mute and clip-local dB keys implemented; master volume absent. Keys are not rebased by trim/split. |
| AUD-003 | Claimed, partial | Fade data and playback implemented; unit envelope tests and browser sample test. No timeline handles, as brief requires. |
| AUD-009 | Claimed | Native equal-power stereo panner; browser measured stereo graph/panel spec. |
| AUD-017 | Claimed | Explicit native speaker downmix; browser checks 5.1 center/surround coefficients and LFE omission. Mono/quad behavior follows Web Audio; 7.1 not promised. |
| AUD-015 | Claimed | Shared graph, browser rendered waveform comparisons (max sample error <1e-6; RMS error <1e-7 in A; seek error <1e-5 in C). No physical-output capture. Solo remains preview-only under D-064. |
| AUD-011 | Claimed | 997 Hz absolute LUFS calibration/gating unit tests; browser EQ ratio, compressor reduction, normalization target within 0.1 LU and parity specs. Not certified BS.1770/true-peak compliance. |
| AUD-012 | Claimed | Deterministic RMS detector/attack/hold/release unit tests; browser -12 dB duck-depth and waveform/seek parity specs. Explicit roles; no semantic voice classifier. |
| AUD-010 | Not built / deferred | D-208: self-written high-quality time stretching judged unreasonable within current synchronous whole-buffer architecture and unavailable listening validation. No pretend preservation switch. |

In-scope P0 items fully Verified: **0 of 3** at this checkpoint (AUD-002/003/015). Original feature-table rows are preserved under the owner's append-only instruction. W7 scope/status notes are appended, not duplicate rows or shifted IDs. Do not infer Verified from a stored implementation claim.

## 3. Checks

### Baseline

`npm run verify`: format/typecheck/build and `Tests 358 passed (358)`; browser launch fails:

```
Error: browserType.launch: Chromium distribution 'msedge' is not found at /opt/microsoft/msedge/msedge
```

`npx playwright install chromium` failed with `End of central directory record signature not found` / `Download failure, code=1`. No elevated execution requested; owner expressly permits CI proof.

### Part gates

- A: `npm run typecheck` exit 0; `Test Files 29 passed (29)`, `Tests 360 passed (360)`.
- B: `npm run typecheck` exit 0; `Test Files 30 passed (30)`, `Tests 362 passed (362)`.
- C: `npm run typecheck` exit 0; `Test Files 31 passed (31)`, `Tests 364 passed (364)`.
- Each part attempted `npx playwright test e2e/audio-w7.spec.ts --max-failures=1`; launch blocked as above. No browser test is claimed as a local pass.
- Browser specs: six W7 tests in `e2e/audio-w7.spec.ts`; real UI actions mutate the editor, read-only hook checks state, numerical tests render audio graphs without mutating the editor.
- Final local `npm run verify`: exit 1 at browser launch; format/typecheck/unit/build passed. Browser tests could not run; the runner's misleading pass tally for unexecuted tests is not counted as browser proof.
- Final unit/jsdom: `Test Files 31 passed (31)`, `Tests 364 passed (364)`.
- Build: `worker-DEzyN7-_.js 534.97 kB`; `index-CK5dVxxh.js 446.65 kB | gzip: 135.46 kB`; `built in 2.33s`.
- Separately: `assert-no-test-hook: OK (no __AIVE__ in production build)`.
- `npm run ledger -- --summary`: `Ledger: 506 items | Verified 155 | Claimed 10 | Todo 341`, `Ledger OK`. W7 Todo-row warnings are expected because existing rows are append-only.
- Append-only audit: FEATURES, STATUS and CHANGELOG each retain their exact original byte prefix. Only existing UI file touched is shell.ts (six mount/visibility/disposal lines); no dependencies/model-version edits.
- CI: one branch-run inspection pending; no CI success asserted yet.

## 4. Owner try-it scripts

Use Chrome/Edge and headphones. Start quiet. Each part uses real files you choose: a 10–30 second voice recording and a music recording in WAV or MP3. Import in Media; drag each media card to an empty compatible timeline row so both start at 0. Keep clips under five minutes. Any project edit pauses playback (existing behavior); press Play again. These steps were **not** run by Codex; no screenshots or listening claims are invented.

### W7-A — 8 steps

| # | Do this | Expect | ID | Ran / screenshot |
|---|---|---|---|---|
| 1 | Make a new project; import your voice file and drag its card onto the timeline. Play. | Original recording is audible. | AUD-002 | N / none |
| 2 | Select the voice clip, open left Audio (Sound panel), set Gain to -12 dB. Play again from start. | Quieter, approximately one quarter of the original amplitude. | AUD-002 | N / none |
| 3 | Click the Sound heading to leave the input, then Ctrl+Z; play. | Original volume returns in one undo step. | AUD-002 | N / none |
| 4 | Pan to -1, then +1, replaying each time. | Sound moves to the left then right headphone. Return pan to 0. | AUD-009 | N / none |
| 5 | Set Fade in to 1 s, Fade out to 1 s; replay from start through the end. | Smooth rise and fall. There are no timeline handles. | AUD-003 | N / none |
| 6 | Set Gain -18 at the start and press Set volume key; seek near 2 s, set Gain 0 and press Set volume key again. | Playback rises between the keys. Gain field changes are overridden while keys exist; Clear volume keys removes that envelope. | AUD-002 | N / none |
| 7 | Check Mute clip, replay; uncheck and save/reload. | Muted clip is silent; settings persist after reload. | AUD-002 | N / none |
| 8 | With solo off, export MP4/WebM and listen beside preview. Optionally import your known 5.1 WAV. | Same gain/pan/fades; 5.1 center/surround mix into stereo, LFE omitted. | AUD-015/017 | N / none |

### W7-B — 8 steps

| # | Do this | Expect | ID | Ran / screenshot |
|---|---|---|---|---|
| 1 | Keep your recording selected; Sound → Reset audio. Play once at comfortable volume. | Neutral reference. | AUD-011 | N / none |
| 2 | Set Low EQ to +6 dB, replay; then -6 dB. | Bass grows then reduces. Reset it to 0. | AUD-011 | N / none |
| 3 | Set Mid EQ +6 dB, then High EQ +6 dB separately. | Mid presence then brightness changes, depending on your file. Reset both. | AUD-011 | N / none |
| 4 | Enable Compressor; set threshold -30 dB, ratio 8. Replay a recording with loud/quiet speech. | Loud passages compress. Browser compressor makeup can affect overall level; it is not a limiter. | AUD-011 | N / none |
| 5 | Adjust attack/release, replay; use Ctrl+Z after leaving the input. | Controls and undo apply one step each. | AUD-011 | N / none |
| 6 | Reset audio; set Target LUFS -16 and press Measure and normalize. | A measured LUFS and gain adjustment appear. Peak-limited targets are explicitly reported. | AUD-011 | N / none |
| 7 | Play, then Ctrl+Z after leaving controls; replay. | Normalization is an undoable level change. Silence/very short files report an error. | AUD-011 | N / none |
| 8 | Normalize again, then change EQ. Export and listen. | Changing processing clears normalization; re-measure for a new target. Export uses the same processing. | AUD-011/015 | N / none |

### W7-C — 8 steps

| # | Do this | Expect | ID | Ran / screenshot |
|---|---|---|---|---|
| 1 | Import voice with clear pauses and music; place on separate overlapping tracks. | Both play. | AUD-012 | N / none |
| 2 | Select voice; Sound → Audio role → Speech. | Voice is the detector source, not automatically classified. | AUD-012 | N / none |
| 3 | Select music; Audio role → Music; check Duck music under speech. | Duck controls enable. | AUD-012 | N / none |
| 4 | Replay with default -12 dB reduction. | Music reduces during speech and returns during longer pauses. | AUD-012 | N / none |
| 5 | Change reduction to -6 dB and replay. | Less reduction under speech. | AUD-012 | N / none |
| 6 | Adjust threshold if soft words do not trigger; try slower release. | Detector sensitivity and return timing change. Background noise can trigger it. | AUD-012 | N / none |
| 7 | Mute the speech clip or its track; replay. Unmute and seek into the middle of a spoken passage. | Muted speech does not trigger; seeking recomputes the correct envelope position. | AUD-012 | N / none |
| 8 | Export with solo off; compare. If you change speed separately, listen to its pitch. | Ducking is in export. Speed STILL changes pitch; AUD-010 is deferred. | AUD-012/015/010 | N / none |

## 5. Deviations from the brief

- AUD-010 deferred using the brief's quality/complexity allowance. No schema or dependency added.
- Browser unavailable locally; owner-authorized CI fallback. No physical listening or owner-script completion claimed.
- AUD-002 master volume and AUD-003 handles excluded; clip keyframes fit metadata and were implemented.
- Existing ledger rows cannot be status-edited under append-only; appended scoped notes preserve IDs and history.
- Actual existing engine is `src/media/audio.ts`, not `src/audio/*`; new processing modules live in `src/audio` and existing engine/mixdown call them.
- Git CLI push lacks credentials. GitHub connector publishes ordinary non-forced commits; the local checkout is aligned to those published commits. No published history rewrite.

## 6. Decisions made

D-200–D-209 in `docs/DECISIONS.md`: scope/command storage, shared graph, environment proof, EQ/compressor order, K-weighted normalization and limits, normalization invalidation, detector and roles, pitch deferral, honest verification bounds.

## 7. Not tested, known gaps, risks

- No loudspeaker/headphone listening, Edge/Windows test, or physical live-output waveform capture here.
- Not a certified loudness meter; no oversampled true-peak meter/limiter. Multiple mixed clips can exceed peak headroom even if individually normalized.
- Whole audio files are decoded under the existing 512 MB compressed-file limit. Normalization and duck analysis are bounded to five-minute clips; no streaming/time-stretch worker.
- Volume keys are clip-local and follow moves; existing trims/splits do not rebase them. Fade lengths are relative to resulting clip boundaries. No keyframe timeline UI.
- Gain keys override the base Gain field while present. The field supplies new key values; Clear volume keys returns to static gain.
- Normalization is clip-only and measured without other Speech clips/duck reduction. Ducking may lower programme LUFS afterward. Normalization invalidates when processing/timing changes, but metadata retains the old measurement until reset/re-measure.
- Duck detection is an energy threshold over explicit Speech clips before EQ/compression; background noise/music in a Speech clip can trigger it. No semantic classifier.
- Detector uses mean channel power, not a full post-effect stereo sidechain; long timelines/many speech clips are not performance-qualified on the reference PC.
- Existing solo is preview-only; export ignores solo. Compare with solo off. Mute and processing are shared.
- Compressor/filters start fresh after seeking, so steady-state continuation is not promised identical to a new range render. Small compressor lookahead can affect onset timing.
- Explicit Web Audio speaker downmix covers known layouts; arbitrary multichannel layouts/7.1 not promised.
- No new dependency/license changes. English/Hindi panel labels are supplied; technical underlying validation errors can remain English.

## 8. Architecture and contract impact

- Schema: **5, unchanged**. No frozen contracts touched, no dependencies.
- Settings and commands: `src/audio/settings.ts`, registered on the existing capability command bus.
- Shared graph: `src/audio/graph.ts`; loudness/normalization: `loudness.ts`, `normalize.ts`; ducking: `ducking.ts`.
- New isolated panel and translation dictionary: `src/ui/sound-panel.ts`, `src/audio/strings.ts`.
- Existing audio engine and export mixdown use those modules.
- Protected UI: only six shell lines for import, mount, visibility, placeholder hiding and disposal. No inspector, timeline, canvas, styles, toolbar, menus or transform edits.
- Added three unit test files and one browser spec file.

## 9. Ledger and backlog

Existing ledger rows unchanged, append-only scoped status notes. No new AUD rows needed and no ID shifts. Three backlog entries cover time stretch, excluded/partial clip controls and advanced analysis.

## 10. Git

- Branch: `codex/w7-audio`; PR: https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/14 . Never merge before owner test.
- Main base: `9598be8227286ce2f4f381a67d896d744e7397f5`.
- A: `d0adf15641fac9e85c4ac0b87912a791929aafdb`.
- B: `8b757a16f6a2ffe6ab7d7206fb30ee3cda79f79b`.
- C / final: see progress checklist and PR history. No tag created (owner requested one branch/PR, acceptance first).
- Review diff is the single PR. No bulky self-referential patch artifact committed.

## Owner tick-list

| ID | OK / BUG / MISSING / CHANGE | One sentence |
|---|---|---|
| AUD-002 clip gain/mute/keys | | |
| AUD-003 fade playback | | |
| AUD-009 pan | | |
| AUD-017 stereo downmix | | |
| AUD-015 preview/export audio | | |
| AUD-011 EQ/compressor/normalize | | |
| AUD-012 ducking | | |
| AUD-010 deferred, pitch still changes | | |
