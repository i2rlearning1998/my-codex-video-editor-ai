# Website & Brand: how to change the website and the brand

This is for the owner. Open the Owner App (`npm run owner`), log in with your password and 2-step code, and choose **Website & Brand**. Everything on the screen is saved together with **Save Website & Brand** (write a short note for the version). People see the change on their next page load.

## Brand

- **Brand name** and **Logo** (an https address, or **Upload** a PNG, JPEG, WebP or AVIF picture). Changing either asks for your password and code again.
- **Tab icon (favicon)**, **Tagline** in English and Hindi, **Default language**.
- **Colours**: a colour picker and the hex value for each colour; **Reset** puts one colour back. The preview shows the name, logo, tagline and colours together.

## Website sections and showcase

- Each section can be shown or hidden, moved **Up** or **Down**, **Copied** and **Removed**. Its kind, title and text (English and Hindi) and its steps or questions (one per line: English title | English text | Hindi title | Hindi text).
- **Preview** shows the draft sections before you save.
- **Showcase videos**: an MP4 or WebM video and its poster picture. A video always needs a poster.

## Header and footer

- **Header links**: label (English and Hindi), link (https:// or a page of this site such as `#/claude`), shown or not. With nothing set, the header has today's Connect Claude link.
- **Footer**: groups of links with a title, and a copyright line in English and Hindi. Published legal pages are linked in the footer by themselves.

## Banner

One line over the website, the panel or both: text (English and Hindi), an optional link, a colour, from and until dates. If people may close it, a closed banner stays closed until you change it (any change shows it again). An end before the start, or a link that is not https or this site, is refused.

## Maintenance

**Under maintenance** asks for your password and code. While it is on:

- the website and the panel show your message (empty: "We are making things better and will be back soon. Your work is safe.") and the time you are back;
- signing in still works, and your own accounts (Readymade Styles › My user account) and the Owner App are never locked out;
- the server refuses new saves with "We are updating the platform right now, so this cannot be saved yet. Nothing was lost. Please try again in a little while."; running exports finish; the editor keeps the person's work in their browser and sends it when you switch maintenance off.

## Legal pages

Add Privacy, Terms, Refund or your own page: a title and text in English and Hindi (plain paragraphs; https links become clickable). A page is shown at `/site/#/legal/<id>` and linked from the footer, sign-up and checkout only when **Published**. Every change is a new version with the date; the last 10 versions are kept, and **Roll back to this** (password and code) makes a new version with the old text.

## Safety

Texts are plain text: HTML or scripts are refused. Uploads are checked by their bytes, not their names (a renamed file is refused), with the size limit shown when a file is too big. Every save is a config version with a note, listed under **Versions** with **Roll back to this**. If two Admin tabs edit at once, the second save is refused: "Someone saved a newer version while you were editing. Reload to see it; your changes were not saved." A Hindi reader sees English where you wrote no Hindi; the screen lists those places.

Nothing in this guide ran against a real Supabase or a public address yet.
