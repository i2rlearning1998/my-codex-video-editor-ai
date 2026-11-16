# Report: Round C5, Website & Brand, Appearance, Features & access, Director and Claude parity (2026-11-16)

## 1. Summary

- The chat card's export now matches the editor's on every frame. Cause of RDC4-004: the card's export job got neither the scene cuts nor each scene's background, so it cut hard where the editor faded (D-477). FIX7-024 is a normal passing test (it took a sound an earlier test had scheduled for 2030; the product was right, D-478). The C3/C4 CI failures that were ours are fixed (D-479).
- **Website & Brand** (Admin): brand, colours, favicon, sections, showcase, header and footer links, banner, maintenance and legal pages, with versions, rollback and a conflict sentence for two tabs (D-480, D-481).
- **Appearance** (Admin): a picture or a short video for every card and hero of the panel and the website; a person who set nothing sees today's pages (D-482).
- **Features & access** (Admin): features on or off, rollout and beta, the plan grid with limits and archive, personal and group overrides with an end date, Who has this; one resolver for the server, the panel and Claude (D-483).
- **Parity**: a matrix ties every Director action to Claude's tools; three tools added (rewrite_plan, remove_extra_idea, use_video_style) (D-484).
- Built and verified: RDC5-001 to RDC5-030 (unit and Playwright tests named by id). Not built: listed in section 7. Nothing ran against a real Claude, a real Supabase or a public address.

## 2. Scope and results

| Part | Items | Status | Tests |
| --- | --- | --- | --- |
| 0.1 card vs editor export | per-frame sweep, cause, fix | Verified | RDC4-004, RDC5-001 (e2e/round-c4-export-compare.spec.ts) |
| 0.2 FIX7-024 | normal test | Verified | FIX7-024, RDC5-002 (e2e/lib-editor.spec.ts, whole file 14 passed) |
| 0.3 C4 CI | classified, ours fixed | Verified | RDC5-003 (P3U-027, P2R2-029/034, P3U-034, RDC2-022 re-run: 9 passed) |
| 1 Website & Brand | 1.1 to 1.9 | Verified | RDC5-004 to RDC5-015 |
| 2 Appearance | 2.1 to 2.7 | Verified | RDC5-016 to RDC5-022 |
| 3 Features & access | 3.1 to 3.6 | Verified | RDC5-023 to RDC5-026 |
| 4 Parity | 4.1 to 4.3, 4.5; 4.4 as a unit test | Verified (4.4 partly, section 5) | RDC5-027 to RDC5-029 |
| 6 Rough use | every item | Verified (list below) | RDC5-005 to RDC5-030 |

Part 6, item by item: video over limit RDC5-030; renamed .exe as .mp4 RDC5-009, RDC5-017; video without poster RDC5-010, RDC5-017; image with a script in its metadata RDC5-030; same file in two slots then one removed RDC5-018; slot for a deleted Style RDC5-018; two Admin tabs RDC5-008; banner end before start RDC5-005, RDC5-012; non-https banner link RDC5-005; maintenance mid-export and mid-edit RDC5-006, RDC5-015; maintenance and the owner's account RDC5-006, RDC5-014; emergency on RDC5-023 (Who has this says off; the work itself is refused by the existing emergency checks); rollout 0 and 100 RDC5-023; override ended a second ago RDC5-023; cohort of zero RDC5-023; plan feature unchecked with an override RDC5-024, RDC5-026; non-owner and logged-out on every new route RDC5-011; stale CSRF RDC5-011; Hindi empty RDC5-010; huge logo RDC5-009; reduced motion RDC5-020; data saving RDC5-021; offline panel: the existing panel tests without a server (p3u-sweep, p2-aurora) pass with the slot observer on.

## 3. Checks

LIMIT MODE: only the touched specs; no full e2e and no `npm run verify` (owner rule). Browser: Playwright Chromium (Linux sandbox).

- Typecheck: `tsc --noEmit` and `tsc --noEmit -p tsconfig.e2e.json`: no errors.
- Unit (Vitest): tests/server, round-c2 to round-c5, security, p3, director: 51 + files, all passed at the last run of each part (Part 3 run: 246 passed, 2 skipped; Part 4 run: 133 passed).
- e2e (Playwright) touched specs: round-c4-export-compare 1 passed; lib-editor 14 passed; export 13 passed; p3u-site, p2-aurora, round-c2-export, p3u-sweep 9 passed; round-c5-site 3 passed; round-c5-appearance 4 passed; p2-aurora, p3u-sweep, round-c4-panel, p3u-site 11 passed; round-c5-access 2 passed (3 repeats, 6 passed); editor-guard 5 passed (protected Editor unchanged).
- `npm run ledger`: Ledger OK. `npm run build`: passed with the bundle check.
- Bundle: editor first load **5,994,682 bytes** (C4: 5,994,353; +329 bytes, the editor's maintenance check before a cloud save).

### 0.1 measured: card export vs editor export (reports/round-c5/export-compare.json)

Before the fix, every one of the 96 frames (4 s at 24 fps, read at each frame's centre, both scaled to 180 x 320): frames 0 to 41 and 54 to 95 agreed (mean under 0.3/255, the rest from a 720 vs 1080 export size); frames 42 to 53 (the 0.5 s around the scene cut) differed up to a mean of 12.8/255 with 24% of pixels over 8, and the best match was two frames earlier before the cut and two later after it: the card had no transition. After the fix, with the editor exported at the card's 720p: every frame's mean is 0 and no pixel differs.

## 4. Try-it script for the owner (about 10 minutes)

1. `npm run owner`, log in, open **Website & Brand**. Change the tagline (English and Hindi) and the accent colour; press **Reset** on another colour. The preview follows. (RDC5-012)
2. Switch on the banner with a text, a link `#/styles`, From after Until: Save says "Banner: the end must be after the start." Clear the dates and save. (RDC5-005)
3. **Add a page** (Privacy), write two paragraphs with an https link, tick Published, save with a note. The version is listed. (RDC5-007)
4. Open the website: the banner shows; close it and reload: it stays closed. The footer links Privacy; the page shows the date, the version and a clickable link. (RDC5-013)
5. Back in Admin, tick **Under maintenance**, save: your password and code are asked. The website and a normal account's panel show your message; your own account still opens the panel. Untick it. (RDC5-014)
6. Open **Appearance**, search "credits", **Use my picture**, upload a picture, click it to set the focus, save. Open Credits & Plan in the panel: the hero shows it. (RDC5-019, RDC5-020)
7. Give a Style slot a short video and a poster; with your system's reduced motion on, only the poster shows. (RDC5-020)
8. Open **Features & access**: set Brand Kit's share of people to 25 and save; tick Brand Kit for the free plan and save. (RDC5-025)
9. Add an override for one free account's email: Brand Kit on, with a note and an end in one hour (the code is asked). That person's Brand Kit opens at the next load. (RDC5-024, RDC5-026)
10. **Who has this?** for Brand Kit: the person is listed with your note as the reason. (RDC5-024)
11. In Claude, make a plan, then ask for a cheaper version: Claude uses rewrite_plan and tells you the rewrites left. (RDC5-028)

Steps 1 to 10 were run by the tests (screenshots in reports/round-c5/screens: website-brand.png, site-banner-footer.png, site-maintenance.png, panel-banner.png, appearance.png, panel-credits-slot.png, panel-style-video.png, access.png, panel-brand-override.png). Step 11 ran through the connector SDK in tests, not a real Claude.

## 5. Deviations from the brief

- 4.4: the same-work comparison is a unit test (the Director's builder and the connector's build of one plan, compared with an allow-list), not a Playwright run through AI mode (BACKLOG).
- 2.5: drag-and-drop is a file dropped on a slot card; reordering is by the Order field (BACKLOG).
- 1.2: the preview of the sections is drawn in the Admin, not on the real website (BACKLOG).
- Screenshots: the new Admin screens and five panel or website views after the change; no separate "before" shots (with nothing set the pages are unchanged, which the existing specs prove).
- Uploaded files on this computer are served by the local catalog over http on 127.0.0.1; `safeHref` accepts that loopback address only.

## 6. Decisions made

D-477 to D-485 in docs/DECISIONS.md.

## 7. Not tested, known gaps, risks

- Nothing ran against a real Claude, a real Supabase or a public address; the `access_rules` migration is written, not run.
- The emergency switch shows features as off in Who has this; the work itself is refused by the existing emergency checks, not by the feature resolver.
- An override for a limit reaches the server's checks; the panel shows the server's limits at its next load.
- The full e2e suite and `npm run verify` were not run (LIMIT MODE); CI is checked once after the last push.

### The C5 texts in Hindi (for the owner to read)

| Id | Hindi |
| --- | --- |
| maintenance-default | हम चीज़ें बेहतर बना रहे हैं और जल्द लौटेंगे। आपका काम सुरक्षित है। |
| maintenance-refused | हम अभी प्लेटफ़ॉर्म अपडेट कर रहे हैं, इसलिए यह अभी सेव नहीं हो सकता। कुछ भी खोया नहीं है। कृपया थोड़ी देर बाद फिर कोशिश करें। |
| upload-too-big | यह फ़ाइल {size} की है। यहाँ सीमा {limit} है। |
| upload-wrong-type | इस तरह की फ़ाइल यहाँ इस्तेमाल नहीं हो सकती। {types} इस्तेमाल करें। |
| video-needs-poster | वीडियो लोड होते समय दिखाने के लिए एक तस्वीर चाहिए। एक पोस्टर जोड़ें। |
| slot-unused | प्लेटफ़ॉर्म में अब कुछ भी इस तस्वीर का इस्तेमाल नहीं करता। |
| override-note-required | एक छोटा नोट लिखें कि इस व्यक्ति को यह क्यों मिल रहा है, ताकि बाद में आपको याद रहे। |
| override-expired | यह ओवरराइड ख़त्म हो गया है और अब इस्तेमाल नहीं होता। |
| who-has-this-plan | {plan} प्लान में शामिल है। |
| who-has-this-off | अभी सबके लिए बंद है। |
| who-has-this-rollout | उस समूह में है जिसे यह पहले मिलता है ({percent} प्रतिशत)। |
| who-has-this-not-yet | अभी उस समूह में नहीं है जिसे यह मिलता है। |
| feature-locked | यह आपके प्लान का हिस्सा नहीं है। |
| config-conflict | आपके एडिट करते समय किसी ने नया वर्ज़न सेव कर दिया। उसे देखने के लिए रीलोड करें; आपके बदलाव सेव नहीं हुए। |

### Director to Claude

docs/PARITY.md is the generated table (every message kind, asset choice, plan-card action, Style chat reply and Director step, with Claude's tools). Added for the gaps: rewrite_plan, remove_extra_idea, use_video_style. Brand Kit in get_brief_fields and the Style's looks were already there (C3). For a hand-edited layer, the Director asks per layer; edit_video refuses any change made since read_video (stricter).

## 8. Architecture and contract impact

Schema 9 and src/core unchanged. Platform Config: additive optional fields only (section in docs/PLATFORM-CONFIG.md). MCP: three tools added; no tool name or input changed. Server: Store gains `accessRules` and `saveAccessRules`; three admin-surface routes (`/v1/admin/access`, `/v1/admin/access/who`); public `GET /v1/maintenance`; `/v1/me` adds `features` and `limits`. Owner App: `/api/site`, `/api/appearance`, `/api/access` behind the same login, CSRF, re-authentication and audit; a fourth UI module `/content.js`. No new dependencies.

## 9. Ledger and backlog

Ledger: RDC5-001 to RDC5-030 added (Verified); RDC4-004 and FIX7-024 now Verified. Backlog: five lines in docs/BACKLOG_INBOX.md (Round C5).

## 10. Git

Branch `claude/round-c5-admin-content`, draft PR to `claude/round-c4-styles-builder`. Commits per part (Part 0, 1, 2, 3, 4 and this report).

## Owner tick-list

| Step | OK / BUG / MISSING / CHANGE | Note |
| --- | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |
| 4 |  |  |
| 5 |  |  |
| 6 |  |  |
| 7 |  |  |
| 8 |  |  |
| 9 |  |  |
| 10 |  |  |
| 11 |  |  |
