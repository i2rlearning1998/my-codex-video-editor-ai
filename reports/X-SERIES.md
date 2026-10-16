# X-series: theme engine and thumbnails

## Done
- Branch `codex/theme-thumbs` from `claude/qt-series`; draft PR targets that branch; no merge.
- Core colour commits mark manual properties. Theme application uses explicit flags, clears overridden flags, and changes colours/backgrounds/fonts/current-label in one undo transaction. The old previous-colour heuristic and automatic payload-marker writes are removed.
- Async, serialized library-only theme save/rename/delete with required unique names; migration writes library data before removing legacy payload markers from current state and history. Engine mutation guard remains intact.
- Theme capture uses current scene colours/fonts and current theme motion metadata. Documented all UI replacement points, including the double Enter/blur rename path and empty-name copy fallback.
- Thumbnail module: OffscreenCanvas/hidden canvas, serial render queue, request sharing, cancellation, 5-second deadline, OPFS/IndexedDB content/size/frame cache, old-content invalidation, neutral placeholders. Added bounded recent-result memory cache and shared in-flight hashing after tests exposed late-hash duplicate renders.
- Library shape/background/text/template posters, theme palette/font, preset rectangle sampled with core easing, image/video decoding, audio waveform/icon, first-scene canonical project render and simple AI-spec scene conversion. Baked/live frame adapter handles code animations and complex compositions.
- No UI or e2e files modified; no dependency or schema changes; no full verify, full e2e or CI polling.

## Validation: measured results, not claims
- One focused task-1 invocation: `npx vitest run tests/themes tests/t1-themes.test.ts tests/core.test.ts tests/commands.test.ts`: **45 passed, 4 files**, 1.78 seconds.
- One task-2 invocation: `npx vitest run tests/thumbnails`: **10 passed, 2 failed, 1 file**, 1.15 seconds.
- Failed tests: `dedupes concurrent requests and never renders two queued items together` (3 renders versus 2), and `one aborted subscriber does not cancel another sharing its render` (2 renders versus 1). Async hashes completed independently after a fast first render had left the pending map. Fixed by sharing same-item in-flight hashes and retaining bounded completed results (64 entries / 8 MiB). Strengthened cancellation regression to abort while the other caller is still waiting, rather than after its completion.
- One `npm run typecheck`: **failed**, with recursive mutable-to-readonly render-source inference and unresolved AI-spec field union errors in `src/thumbnails/render.ts`. Fixed the validated projection boundary with explicit readonly types and runtime scalar guards. The second chained e2e TypeScript project did not run because the first compiler failed.
- Per the once-only limit, tests/typecheck were **not rerun after corrections**. Final thumbnail fixes are unverified; no green claim. `git diff --check` passed after corrections.

## Not done / integration limits
- UI wiring is the other agent's task. Existing UI still calls the deprecated marker writers (now fail with guidance); it must switch to the async library API before save/rename/delete works. Remove its copy-name fallback and guard rename Enter/blur against a second commit. Legacy marker lists must stop driving the catalogue.
- No browser proof, video decoding, real font loading or visual parity measurements. Canvas tests use fakes. Thumbnail text layout is a cheap single-line poster, not full rich-text parity.
- Motion/code needs a supplied baked poster/frame list or cooperative live provider with `revision`; no code runtime is launched internally. Complex AI-spec compositions with media/code/FX/cameras likewise need a provider. Unsupported preset tracks return placeholders. External fonts/assets require revision changes for cache invalidation.
- Caller-supplied live renderers must honour abort; the deadline cannot forcibly terminate an arbitrary JavaScript callback. Browser video decoding needs document support even when drawing uses OffscreenCanvas.
- Applying motion-style timing itself was not introduced; saved themes capture current theme motion metadata. Colours are captured deterministically from the first scene background, first text fill and first two distinct shape fills, with current-theme fallbacks.

## Exact APIs
- `src/core/manual-color.ts`: `markManualColor`, `clearManualColor`, `isManualColor`; core `SET_PROPERTY` accepts optional `colorSource: 'manual' | 'theme'`; `EditorEngine.removeLegacyThemeMarkers` is migration-only.
- `src/themes/library.ts`: `createThemeLibrary`, `listThemes`, `saveTheme`, `renameTheme`, `deleteTheme`, `migrateThemes`, `applyTheme`, `ThemeError`; types `ThemeLibrary`, `ThemeErrorCode`, `ApplyThemeOptions`, `ThemeApplyResult`.
- `src/themes/themes.ts`: retained palette APIs and `applyThemeCommands`; deprecated `saveThemeCommand`/`updateThemeCommands` reject marker writes. `projectThemes`/`encodeTheme`/`decodeTheme` remain legacy readers/codec and current-label access.
- `src/thumbnails/index.ts`: `getThumbnail`, `getPreviewFrames`, `createThumbnailService`, `thumbnailKey`, `thumbnailSize`, `placeholder`, `renderThumbnail`; types `ThumbnailItem`, `ThumbnailOptions`, `PreviewOptions`, `ThumbnailSize`, `ThumbnailCache`, `ThumbnailRender`, `RenderRequest`.
- Contracts: `docs/THEMES-API.md` and ten-line `docs/THUMBNAILS-API.md`.
