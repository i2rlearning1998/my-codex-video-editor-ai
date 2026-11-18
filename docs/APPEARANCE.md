# Appearance: pictures and videos on cards and heroes

This is for the owner. Owner App › **Appearance**.

Every card, hero, banner and empty state of the panel and the website that can show a picture is a **slot** with an id, for example `hero:credits`, `style:<id>`, `studio:<id>`, `plan:<id>`, `learn:<id>` or `topup:<id>`. A slot you never set shows exactly what it shows today.

- **Find a slot** with the search box. Slots are grouped by the page they are on; **Open the page** opens it.
- **Use my picture** starts a slot. Then give it a **Picture**, or a **Video** with its **Poster** (a video always needs a poster): an https address, **Upload**, or drop a file on the slot.
- **Fit** (cover or contain); click the picture to choose the part that stays in view.
- **Video plays**: auto (while on screen), hover, or still (poster only). With reduced motion, Animations Off or data saving, only the poster shows. A file that cannot be loaded falls back to today's picture.
- Optional **Title** and **Short text** in English and Hindi, an **Order**, **Hide this card**, and **Reset to today's picture**.
- **Save Appearance** saves one config version. Limits: pictures up to 2 MB, videos up to 25 MB (the `appearance.limits` setting changes them).
- **Unused files** lists files uploaded here that nothing uses any more ("Nothing in the platform uses this picture any more."). **Delete unused files** removes only those; catalog files and Style samples are never touched.

A Style's card picture, in order: its Appearance slot, its sample poster, its card art, then the drawn poster.

People's own Projects, Videos and files, number cards and forms are not slots; a test checks that every other card is one.
