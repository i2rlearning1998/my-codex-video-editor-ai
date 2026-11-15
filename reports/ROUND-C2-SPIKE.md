# Round C2, Part 1: export card spike (15 Nov 2026)

**Question:** can a video be exported INSIDE the Claude chat, on the person's own device, by an MCP App card, with no other link, tab or page?

**Answer in the harness: yes.** Items 1 to 5 of the decision rule pass, so Part 4 is built as designed. Two things only a real Claude can prove are listed at the end (BLOCKED-EXTERNAL).

## How it was measured

- Test: `e2e/round-c2-spike.spec.ts` (ledger RDC2-001), raw numbers in `reports/round-c2/spike-*.json`.
- Claude was played by the official MCP SDK client (`@modelcontextprotocol/sdk` 1.32.2) in the test process. It called the dev-only tool `proof_export_card` over real Streamable HTTP (`POST /mcp`) on the real server (`server/app.ts`, in-process, memory store).
- The chat host was a harness page (`e2e/mcp-host/host.ts`) using the ext-apps `AppBridge` (`@modelcontextprotocol/ext-apps` 1.7.5). JSON-RPC went over postMessage; tool calls from the card went back to the server through the client.
- The card resource (`ui://aive/export-card.html`, `text/html;profile=mcp-app`) was served on a third origin (the "sandbox origin"). It used the CSP the MCP Apps specification (2026-01-26) tells hosts to apply: the default policy plus our server origin in `connectDomains` and `resourceDomains`. There is no `worker-src` and no `blob:`.
- The iframe had `sandbox="allow-scripts"`, then `sandbox="allow-scripts allow-same-origin"`. The specification says a real host uses the second.
- Browser: Playwright Chromium 153.0.8010.12 (Linux sandbox), not Google Chrome.
- The test video: 1080 x 1920 at 30 fps. It holds a 2 s video clip repeated end to end, a 440 Hz tone every 6 s and a moving shape. It is drawn and encoded with the editor's own export engine, at quality High.

## Results

| # | Question | `allow-scripts` only | `allow-scripts allow-same-origin` |
| --- | --- | --- | --- |
| 1a | WebCodecs present | yes | yes |
| 1b | Encoders | H.264 yes, AAC **no**, VP9 yes, Opus yes | the same |
| 1c | Worker from a blob URL | refused (the CSP has no `blob:`) | refused |
| 1d | Worker from our origin | refused: "cannot be accessed from origin 'null'" | refused: a worker must be same-origin with the page |
| 1e | OPFS | unavailable (SecurityError) | available |
| 1f | IndexedDB | unavailable (SecurityError) | available |
| 2a | Engine bundle loads under the CSP and CORS | yes: card.js 36 B, chunks 624,264 B + 563,918 B (1.19 MB decoded) | yes, the same |
| 2b | 1080p media file loads | yes: the 499,480-byte 1080p H.264 file arrived in 8 ms, was decoded and drawn (reports/round-c2/spike-h264-frame.png) | yes |
| 5 | `<video>` with a blob URL | refused (the CSP's `media-src` has no `blob:`) | refused |
| 5 | `<video>` with a data URL | plays | plays |

Because no worker can start, the card renders in the page. `src/export/client.ts` gained an opt-in `inPage` path. The frame loop moved unchanged into `src/export/render-job.ts`, which the editor's worker and the card both run (D-437).

Containers: MP4 needs H.264 and AAC. This Chromium has no AAC encoder, so every spike file is WebM (VP9 + Opus). Branded Chrome on Windows has both, which the existing CI job `export-mp4` proves for the editor (D-065). The card uses the same rule, so in the owner's Chrome the card should produce MP4. That is not measured here.

### 3. Render time and size (sandbox `allow-scripts allow-same-origin` unless noted)

| Length | Render time | File | Heap before → after |
| --- | --- | --- | --- |
| 10 s (scripts only) | 4.9 s | 6.34 MB WebM | 8.7 → 31.8 MB |
| 10 s | 5.4 s | 6.34 MB WebM | 17.4 → 37.9 MB |
| 10 s, 1080p H.264 source | 6.8 s | 6.73 MB WebM | n/a |
| 60 s | 31.6 s | 38.4 MB WebM | 17.5 → 170 MB |
| 120 s | 69.0 s | 76.8 MB WebM | 17.7 → 326 MB |

Roughly half real time at 1080 x 1920 in this sandbox (about 640 KB of file per second at High).

### 4. `app.downloadFile` with base64

| Size | Arrived at the host | Time | Heap growth in the card |
| --- | --- | --- | --- |
| 1 MB | yes | 20 ms | ~0 |
| 10 MB | yes | 105–173 ms | 26–52 MB |
| 50 MB | yes | 750–852 ms | 109–223 MB |
| 100 MB | yes | 1.6–2.1 s | 192–437 MB |

The largest tried, 100 MB, worked. Base64 makes the text 4/3 of the file. A 120 s file (76.8 MB) becomes 102 M characters, and the card's heap grows by about 2.5 to 5.7 times the file while it sends it. The harness host only counted the characters; a real host also has to save them.

### 6. Hidden or scrolled away mid-render

| Case | Frames rendered in 5 s |
| --- | --- |
| Card iframe `display: none` | 313 (no stall) |
| Page scrolled 5,000 px so the card is off screen | 327 (no stall) |

The render loop waits on the encoder, not on animation frames, so it does not stall. **Not measured:** the whole browser tab in the background, or the phone screen locked. Browsers throttle background tabs, and a phone may suspend the page. The card shows "Keep this card on screen; the video renders on this device" when the page becomes hidden.

### 7. `getHostCapabilities()?.downloadFile`

With a host that does not offer it, the Download button shows: "This app cannot save files from here. Press and hold the video (or right-click it) to save it." No link and no new tab are opened (test RDC2-001, "a host without downloadFile").

### 8. Sample frames back to Claude

Both paths work in the harness:
- The card draws 6 PNG frames (360 px wide) from the finished file. It sends them with the app-only tool `submit_frames`; `get_frames` then returns 6 image content blocks to Claude (measured: 6).
- `app.updateModelContext` with an image was accepted by the harness host. That proves only that the bridge carries it. Whether a real host passes it to the model is unproven.

Part 4 uses `submit_frames` then `get_frames`. That path does not depend on host support for model context.

## Decision

Items 1 to 5 pass: the card can encode (VP9 + Opus here, MP4 where Chrome has AAC), the engine and the media load under the host CSP, a 120 s 1080 x 1920 video renders in about 69 s, and a data-URL `<video>` plays it. **Part 4 is built as designed**, with these limits from the numbers above:
- `mcp.exportMaxSeconds` defaults to 120 s, the longest measured. A longer video is refused with a plain sentence and the options. Nothing is shortened silently.
- The file cap is 100 MB, the largest download measured. A longer or heavier export is refused before it starts if its estimate passes the cap.
- The player uses a data URL, because blob URLs are refused by the CSP.
- The card renders in the page; the editor keeps its worker.

## BLOCKED-EXTERNAL (only a real Claude can prove these)

1. **The card inside real claude.ai:** the real host's CSP, sandbox origin, `downloadFile` support and the size it accepts.
2. **The card on a phone (Claude mobile):** memory for a 120 s file, rendering while the screen is on, and saving the file.

Owner try-it for both:
1. On the computer that runs the server: `npm run build`, then `MCP_DEV_TOKEN=<any 32 characters> LOCAL_AUTH_SECRET=<any long text> npm run server`.
2. In a second terminal: `cloudflared tunnel --url http://127.0.0.1:4400`, and copy the https address it prints.
3. Start the server again with `MCP_PUBLIC_URL=<that address>` added, so the card loads from the tunnel.
4. Owner App › Platform Config › MCP: turn on "Proof tools" and publish.
5. claude.ai › Settings › Connectors › Add custom connector › address `<that address>/mcp`. Allow on the consent page, signed in to the panel.
6. In a new chat: "Use proof_export_card with 10 seconds". The card should render, play and offer Download. Then ask Claude to "look at the frames": it calls get_frames and describes 6 pictures.
7. Repeat on the phone app with 60 seconds.
