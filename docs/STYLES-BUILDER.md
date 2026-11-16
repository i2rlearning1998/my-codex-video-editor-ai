# Readymade Styles: how to make one, test it, publish it and roll it back

This is for the owner. Everything here is done in the Owner App (`npm run owner`, then log in with your password and 2-step code). Steps that change what people see, delete something or undo a version ask for your password and code again.

## 1. Tell the Admin which user account is yours (once)

1. Admin › Readymade Styles › **My user account**: write the email of your own account in the panel and press Save.
2. Confirm with your password and code.

Only this account's Projects are ever listed when you make a Style from a Project. The same account also sees Draft and Tested Styles in the panel and through your Claude (marked "only you see it"). Every read of your Projects is written to the audit log.

## 2. Make the Style

You can start in two ways.

- **From a Project you made** (best): first make one good video with Claude (or in AI mode). Then Readymade Styles › **Make a Style from a Project** › List my Projects › **Make a Draft Style** next to the Video. The Draft gets:
  - the Video's plan as its template, with the topic, language, length, narration, voice, brand and every picture or clip turned into slots;
  - your Project's look as look 1;
  - the Video's code graphics in its kit;
  - Brief fields from the video type plus one per slot;
  - a cost range from the cost you approved plus your margin.
    A Video made by hand has no plan; the Admin says so and stops.
- **From nothing**: **New Style**, then fill the sections.

## 3. Edit it

Open it with **Edit**. One page, saved as one step with **Save** (you may write a note for the version):

- **Basics**: id, names and blurbs in English and Hindi, card art, formats, plan features it needs, cost range.
- **Sample**: upload a sample video (MP4 or WebM) and a poster (PNG, JPEG or WebP); a player shows it.
- **The Style's Brief fields**: add, edit, order and remove the questions a person answers.
- **What a person can start from**: photo, PDF, link, script.
- **Script rules**: what the planner reads, with a counter. The box below shows exactly what it reads.
- **Looks**: up to 4, each with English and Hindi names, 1 to 8 colours, fonts and caption style. A look without a real Hindi name gets a small warning (Hindi readers then see the English name).
- **Graphics kit**: notes and blocks from the editor's real list.
- **Asset slots**: name, kind, default, default route and labels. For pictures, clips and sounds it shows which Studio could make them.
- **Plan template**: paste the plan or upload a .json. The Admin lists the slots the template uses and the slot list, and offers **Add the missing ones** and **Remove the unused ones**. A plan that is not a Video Plan version 4 is refused with the reason.
- **Interview**, **Project style defaults**, **Availability by plan** (no plan ticked = every plan).

The three sample Styles have no template and say "Uses the Director's form only (no template)". **Add a template** starts one for them; nothing changes for people until you save.

## 4. Check it

Press **Check the Style**. It runs the checks, fills the template with the slots' defaults, builds a first draft with no AI model and no media (the same build a person's first video goes through), runs the layout check and shows a sketch of scene 1. **Show filled template** shows the plan with the defaults filled in.

## 5. Test it and publish it

1. Make real videos from it on different topics (with your own account) and add a **test** for each: topic, date, passed or not, a note and the Video. Save the tests. Tests are never deleted, only corrected.
2. **Move to Tested** needs at least one passed test.
3. **Move to Published** needs three passed tests on three different topics. If you want to publish anyway, write the reason in the box (1 to 600 characters); it is kept, shown in the list and written to the audit log.
4. A Style that fails its checks can never be Tested or Published.

After a save, the panel's Home and Styles page, the website's Styles and Claude's `list_styles` show the change on their next load (the server keeps the settings for up to 30 seconds). People see Published Styles only.

If you later change a Published Style's **template or slots**, it goes back to **Tested** and keeps its tests; publish it again when you have checked it. Changing texts, looks, art or order keeps it Published.

## 6. Versions, rollback, delete

- Every save is a version. **Versions** lists them with the date, who, the note and what changed. **Preview** shows one; **Roll back to this** makes a new version with that content (the history is never rewritten). A version that can no longer be read is refused and nothing changes.
- **Delete** hides the Style from everyone; Projects already made from it keep working. It stays in the **Deleted** list, where **Restore** brings it back as a Draft.
- **Copy** makes a Draft with a new id and no tests. **Up** and **Down** set the gallery order; **On** switches it on or off.

## 7. Move a Style between platforms

**Export** downloads `<id>.aive-style.zip` (the Style and its sample files). **Import a Style** reads one: a file from a newer platform version is refused with nothing changed; a Style with a script, or a link in a text people read, is refused. If the id already exists the Admin asks: import as a copy, or as a new version of the existing Style (tick "Keep the existing tests" to keep them). An imported Style is always a Draft.

## 8. Brief fields and Director limits

- **Brief fields** edits the field library: the blocks the Brief card asks for and the video types that use them. A block still used by a type or a Style cannot be deleted (the Admin says who uses it). The preview shows what a first message would already fill and what would still be asked. Every save is a version with rollback.
- **Director limits** edits plan rewrites, memory and attachment limits, refusals and their sentences, the Styles' interview questions, Style chat moods and fonts, the Director's fixed lines, web search, the layout check and where media comes from. A value outside its range is refused with the range.

Nothing in this guide ran against a real Claude, a real Supabase or a public address yet.
