# C2 engines progress

## Task 0 — done
- Initial C1 `npm run typecheck`: passed, including both configured TypeScript projects. The C1 key-field typing correction is now verified.
- Thumbnail flake: `getPreviewFrames` launched every hash concurrently. Web Crypto digest completion order could enqueue frame 2 before frame 1; the hover timing test correctly expected increasing time, and stateful providers also need that order. Changed the service to await each frame before requesting the next; assertions were not weakened.
- Ten explicit independent `npx vitest run tests/thumbnails` invocations: **12 passed / 0 failed each**, 120 passing executions total. No retries-to-green, polling or e2e. Existing `samples distinct hover times and caps frame count` is the regression.

## Tasks 1–4
In progress; subsequent task commits update this report. UI/CSS files remain untouched.
