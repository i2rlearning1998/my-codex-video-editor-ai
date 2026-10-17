# New AI video (the brief form)

The editor's beginners describe a video and let Claude build it. The brief form turns what they know into one structured brief for Claude chat. The one rule: **whatever the user fills is a hard requirement (LOCKED); whatever is left empty is FREE (the AI decides).**

## Where

- AI category › **New AI video** (the wide button above Import and Copy AI brief).
- A style card's "+" or click (**Use this style**): the form opens with that style chosen.
- AI › Briefs: a saved brief's "+" or click reopens the form prefilled.

## Sections

- **A. What:** style cards or "No style - you decide"; topic (recommended, a soft hint only); language; length (Auto or seconds); aspect; fps; platform.
- **B. Content I can give:** script (use exactly, or improve it); voice-over (file name, and a transcript pasted or "please transcribe"); topic only; my recorded video (file name, add motion graphics); notes, PDFs or links.
- **C. References:** reference images and videos, logo (file names), brand colours (pickers), fonts.
- **D. Freedom:** Strict, Guided (the default when nothing is chosen) or Free, and lock chips for the script, style, colours and length.
- **E. Assets:** the editor library and stock come first, always; AI-generated images and videos are allowed only as a last resort and only as many as the form says (default 0); "Use only my files".
- **F. Voice and music:** voice (my voice-over, AI voice later, none); music (none, library, my file).
- **G. Extra notes.**

Nothing blocks: hints are soft, and Copy brief always works. The footer counts the locked and free fields.

## Files

The form never reads a file. "Choose" only fills in the file names; their names and kinds are kept, and the footer says "Attach these files in the Claude chat: name (kind), ..." with a Copy file list button. The same line ends the BRIEF section.

## The copied block (`src/ai-brief`)

With a style chosen or any field filled, Copy brief (and Copy AI brief) produce one block, in this order:

1. The task header: "You are the creator for the AI-Native Video Editor. Build the whole video as Creator Pack(s). Reply with pack text only, no explanations."
2. `=== BRIEF ===`: LOCKED (each filled field), FREE (each empty field, once, on one line), the asset rule and the files to attach.
3. `=== STYLE ===`: the chosen style in full.
4. PROJECT: the open scene's facts.
5. LIBRARY: ids and labels by kind, then the stock providers ("none installed (use the editor library)": no stock provider exists yet).
6. RULES: from docs/CREATOR-PACK-AUTHORING.md, under 3,000 words.

The block stays under 60 KB: labels are dropped first ("ids only, labels dropped" in the header), then each kind's list is halved until it fits. The output is deterministic. With the form empty, Copy AI brief is the T2 brief, unchanged (docs/AI-BRIEF.md).

## My briefs

Save as My brief asks for a name (the topic by default) and keeps the form's values in My library (the media store, key `brief/<id>`; OPFS with an IndexedDB fallback), never in the project and never as an undo step. AI › Briefs lists them with the shared "⋯" menu: Rename, Open, Duplicate, Export (the brief text as `.brief.txt`), Move to folder, Details, Delete (with Restore).

## Tests

`tests/b1-brief.test.ts` (LOCKED and FREE, empty form, the 60 KB budget, a snapshot, the file list) and `e2e/b1-styles.spec.ts` (B1-001 to B1-003).
