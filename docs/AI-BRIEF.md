# Copy AI brief

- Where: main menu › Copy AI brief, and the AI category's header button.
- What: one plain-text block for Claude chat, under 40 KB, in this order: the task header (reply with one pack text), the project's facts (canvas size and ratio, fps, length, current theme), the library index, the authoring rules, and an optional `REQUEST:` line from the dialog's "What do you want?" box.
- The library index lists ids and one-line labels grouped by every Creator Pack kind the schema accepts (`ITEM_KINDS`, read from `src/creator-pack/schemas.ts`): built-in library items, My library (Creator Pack items), My Templates code animations, themes, and FX ids (adjust, filter, effect, transition). Blocks, Animate presets and fonts follow. No sources.
- The rules come from `docs/CREATOR-PACK-AUTHORING.md` (everything before the examples, the theme notes and the quality gate), JSON examples left out, at most 3,000 words.
- It is built from live registries at click time (`src/ai-brief/brief.ts`, `buildAiBrief`), so it never goes stale. Above 40 KB the longest kinds are cut with "... n more".
- A toast says "AI brief copied (N items listed)". When the clipboard is blocked, the text shows in a read-only box with a Copy button.
- Tests: `tests/t2-ai-brief.test.ts` (every kind listed, size limit) and `e2e/t2-ai-brief.spec.ts` (QT-022).
- Paste the reply into Media › Import › Import creator pack; checks run on their own and the result card opens the AI category.
- B1: with a style chosen or the New AI video form filled, the block becomes the creator brief (docs/BRIEF-FORM.md), under 60 KB; with nothing filled it is unchanged.
