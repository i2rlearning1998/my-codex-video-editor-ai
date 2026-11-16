// ROUND-C5: three Admin screens of the Owner App, served as /content.js and
// loaded by admin.ts when the owner opens them: Website & Brand, Appearance
// and Features & access. Plain DOM, no framework, types only from src (this
// file is transpiled on its own, like admin.ts and builder.ts). Every check
// runs on the Owner App's server (/api/site, /api/appearance, /api/access).
import type { AdminCtx } from './admin';
import type {
  AppearanceSlot,
  LText,
  PlatformConfig,
  SiteLink,
} from '../../src/platform-config/schema';

type Lang = 'en' | 'hi';
const lang = (): Lang =>
  localStorage.getItem('owner.lang') === 'hi' ? 'hi' : 'en';

// Every string of these screens, English and Hindi (keyed).
const S = {
  siteTitle: ['Website & Brand', 'वेबसाइट और ब्रांड'],
  siteIntro: [
    'Your brand, the website, its header and footer, a banner, maintenance and legal pages. Saved as one step; people see it on their next page load.',
    'आपका ब्रांड, वेबसाइट, हेडर और फ़ुटर, बैनर, मेंटेनेंस और कानूनी पेज। एक कदम में सहेजा जाता है; लोग अगली बार पेज खोलने पर देखते हैं।',
  ],
  brand: ['Brand', 'ब्रांड'],
  brandName: ['Brand name', 'ब्रांड का नाम'],
  logo: ['Logo (https address or upload)', 'लोगो (https पता या अपलोड)'],
  favicon: ['Tab icon (favicon)', 'टैब आइकन (फ़ेविकॉन)'],
  upload: ['Upload', 'अपलोड'],
  uploadVideo: ['Upload video', 'वीडियो अपलोड'],
  uploadPoster: ['Upload poster', 'पोस्टर अपलोड'],
  taglineEn: ['Tagline (English)', 'टैगलाइन (अंग्रेज़ी)'],
  taglineHi: ['Tagline (Hindi)', 'टैगलाइन (हिंदी)'],
  defaultLang: ['Default language', 'डिफ़ॉल्ट भाषा'],
  colours: ['Colours', 'रंग'],
  reset: ['Reset', 'रीसेट'],
  preview: ['Preview', 'झलक'],
  sections: ['Website sections', 'वेबसाइट सेक्शन'],
  addSection: ['Add a section', 'सेक्शन जोड़ें'],
  kind: ['Kind', 'प्रकार'],
  shown: ['Shown', 'दिखता है'],
  titleEn: ['Title (English)', 'शीर्षक (अंग्रेज़ी)'],
  titleHi: ['Title (Hindi)', 'शीर्षक (हिंदी)'],
  bodyEn: ['Text (English)', 'टेक्स्ट (अंग्रेज़ी)'],
  bodyHi: ['Text (Hindi)', 'टेक्स्ट (हिंदी)'],
  items: [
    'Steps or questions (one per line: English title | English text | Hindi title | Hindi text)',
    'कदम या सवाल (हर लाइन में: अंग्रेज़ी शीर्षक | अंग्रेज़ी टेक्स्ट | हिंदी शीर्षक | हिंदी टेक्स्ट)',
  ],
  up: ['Up', 'ऊपर'],
  down: ['Down', 'नीचे'],
  copy: ['Copy', 'कॉपी'],
  remove: ['Remove', 'हटाएँ'],
  showcase: ['Showcase videos', 'शोकेस वीडियो'],
  addShowcase: ['Add a video', 'वीडियो जोड़ें'],
  video: ['Video', 'वीडियो'],
  poster: ['Poster', 'पोस्टर'],
  nav: ['Header links', 'हेडर लिंक'],
  footer: ['Footer', 'फ़ुटर'],
  addLink: ['Add a link', 'लिंक जोड़ें'],
  addGroup: ['Add a link group', 'लिंक समूह जोड़ें'],
  labelEn: ['Label (English)', 'लेबल (अंग्रेज़ी)'],
  labelHi: ['Label (Hindi)', 'लेबल (हिंदी)'],
  link: [
    'Link (https:// or a page of this site)',
    'लिंक (https:// या इस साइट का पेज)',
  ],
  copyrightEn: ['Copyright line (English)', 'कॉपीराइट लाइन (अंग्रेज़ी)'],
  copyrightHi: ['Copyright line (Hindi)', 'कॉपीराइट लाइन (हिंदी)'],
  banner: ['Banner', 'बैनर'],
  bannerOn: ['Show the banner', 'बैनर दिखाएँ'],
  colour: ['Colour', 'रंग'],
  where: ['Where', 'कहाँ'],
  website: ['Website', 'वेबसाइट'],
  panel: ['Panel', 'पैनल'],
  editor: ['Editor', 'एडिटर'],
  start: ['From (date and time)', 'कब से (तारीख़ और समय)'],
  end: ['Until (date and time)', 'कब तक (तारीख़ और समय)'],
  dismissible: ['People can close it', 'लोग इसे बंद कर सकते हैं'],
  maintenance: ['Maintenance', 'मेंटेनेंस'],
  maintenanceOn: [
    'Under maintenance (asks for your password and code)',
    'मेंटेनेंस चालू (पासवर्ड और कोड माँगता है)',
  ],
  messageEn: [
    'Message (English; empty: the default)',
    'संदेश (अंग्रेज़ी; खाली: डिफ़ॉल्ट)',
  ],
  messageHi: ['Message (Hindi)', 'संदेश (हिंदी)'],
  backAt: ['Back at (shown as written)', 'कब लौटेंगे (जैसा लिखा वैसा दिखेगा)'],
  covers: ['Covers', 'किस पर लागू'],
  legal: ['Legal pages', 'कानूनी पेज'],
  addLegal: ['Add a page', 'पेज जोड़ें'],
  legalId: [
    'Page id (address /site/#/legal/<id>)',
    'पेज id (पता /site/#/legal/<id>)',
  ],
  published: [
    'Published (linked from the footer, sign-up and checkout)',
    'पब्लिश (फ़ुटर, साइन-अप और चेकआउट से लिंक)',
  ],
  legalVersions: ['Versions (last 10)', 'वर्ज़न (आख़िरी 10)'],
  rollback: ['Roll back to this', 'इस पर लौटें'],
  note: ['Note for this version', 'इस वर्ज़न के लिए नोट'],
  save: ['Save Website & Brand', 'वेबसाइट और ब्रांड सहेजें'],
  saved: [
    'Saved as config version {v}.',
    'कॉन्फ़िग वर्ज़न {v} के रूप में सहेजा।',
  ],
  versions: ['Versions', 'वर्ज़न'],
  hindiMissing: [
    'Hindi readers see English here (no Hindi written): {list}',
    'यहाँ हिंदी पाठकों को अंग्रेज़ी दिखेगी (हिंदी नहीं लिखी): {list}',
  ],
  draftPreview: [
    'Preview of the draft (not saved)',
    'ड्राफ़्ट की झलक (सहेजा नहीं)',
  ],
  rolledBack: [
    'Rolled back: config version {v}.',
    'वापस लौटाया: कॉन्फ़िग वर्ज़न {v}।',
  ],
} as const;
type Key = keyof typeof S;
const t = (k: Key, vars: Record<string, string | number> = {}) =>
  S[k][lang() === 'hi' ? 1 : 0].replace(/\{(\w+)\}/g, (w, n: string) =>
    n in vars ? String(vars[n]) : w,
  );

// ------------------------------------------------------------- helpers

type Ctx = AdminCtx;
type Props = Record<string, string>;
const q = (url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}lang=${lang()}`;
const say = (ctx: Ctx, text: string, ok: boolean) => {
  ctx.status.textContent = text;
  ctx.status.className = ok ? 'ok' : 'error';
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function button(
  ctx: Ctx,
  label: string,
  run: () => Promise<string | void | null> | string | void | null,
  props: Props = {},
) {
  const b = ctx.el('button', { type: 'button', ...props }, label);
  b.onclick = async () => {
    b.disabled = true;
    try {
      const done = await run();
      if (done) say(ctx, done, true);
    } catch (e) {
      say(ctx, msg(e), false);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function input(
  ctx: Ctx,
  value: string,
  set: (v: string) => void,
  props: Props = {},
) {
  const i = ctx.el('input', { type: 'text', ...props });
  i.value = value;
  i.oninput = () => set(i.value);
  return i;
}
function area(
  ctx: Ctx,
  value: string,
  set: (v: string) => void,
  props: Props = {},
) {
  const i = ctx.el('textarea', { rows: '3', ...props }) as HTMLTextAreaElement;
  i.value = value;
  i.oninput = () => set(i.value);
  return i;
}
function check(
  ctx: Ctx,
  value: boolean,
  set: (v: boolean) => void,
  props: Props = {},
) {
  const i = ctx.el('input', { type: 'checkbox', ...props });
  i.checked = value;
  i.onchange = () => set(i.checked);
  return i;
}
function select(
  ctx: Ctx,
  options: readonly (readonly [string, string])[],
  value: string,
  set: (v: string) => void,
  props: Props = {},
) {
  const s = ctx.el('select', props);
  for (const [v, label] of options) {
    const o = ctx.el('option', { value: v }, label);
    if (v === value) o.selected = true;
    s.append(o);
  }
  s.onchange = () => set(s.value);
  return s;
}
const field = (ctx: Ctx, label: string, el: HTMLElement) =>
  ctx.el('label', { class: 'field' }, label, el);
const card = (
  ctx: Ctx,
  title: string,
  id: string,
  ...kids: (Node | string)[]
) =>
  ctx.el(
    'details',
    { class: 'card', open: '', id },
    ctx.el('summary', {}, title),
    ...kids,
  );
/** English and Hindi inputs for one text. */
function texts(
  ctx: Ctx,
  value: LText | undefined,
  set: (v: LText | undefined) => void,
  labels: [Key, Key],
  id: string,
  multi = false,
) {
  let cur: LText = value ? { ...value } : { en: '' };
  const put = () =>
    set(cur.en.trim() || (cur.hi ?? '').trim() ? clone(cur) : undefined);
  const make = multi ? area : input;
  return ctx.el(
    'div',
    { class: 'row' },
    field(
      ctx,
      t(labels[0]),
      make(ctx, cur.en, (v) => ((cur = { ...cur, en: v }), put()), {
        id: `${id}-en`,
      }),
    ),
    field(
      ctx,
      t(labels[1]),
      make(
        ctx,
        cur.hi ?? '',
        (v) => {
          cur = { ...cur, hi: v };
          if (!v) delete cur.hi;
          put();
        },
        { id: `${id}-hi`, lang: 'hi' },
      ),
    ),
  );
}
/** Reads a file the owner picked. */
const pickFile = (accept: string) =>
  new Promise<File | null>((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
async function upload(
  url: string,
  file: Blob,
): Promise<{ url: string; kind: string }> {
  const csrf = (
    (await (
      await fetch('/api/session', { credentials: 'same-origin' })
    ).json()) as { csrf: string }
  ).csrf;
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrf,
      'content-type': 'application/octet-stream',
    },
    body: file,
  });
  const data = (await r.json()) as {
    url: string;
    kind: string;
    error?: string;
  };
  if (!r.ok) throw new Error(data.error ?? 'Error');
  return data;
}
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';
const VIDEO_ACCEPT = 'video/mp4,video/webm';
/** A URL field with an Upload button beside it. */
function media(
  ctx: Ctx,
  label: string,
  value: string,
  set: (v: string) => void,
  base: string,
  kind: 'image' | 'video',
  id: string,
) {
  const i = input(ctx, value, set, { id });
  const up = button(
    ctx,
    kind === 'video' ? t('uploadVideo') : t('upload'),
    async () => {
      const f = await pickFile(kind === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT);
      if (!f) return null;
      const out = await upload(
        q(`${base}?kind=${kind}&name=${encodeURIComponent(f.name)}`),
        f,
      );
      i.value = out.url;
      set(out.url);
      return out.url;
    },
    { 'data-upload': id },
  );
  return ctx.el('div', { class: 'row' }, field(ctx, label, i), up);
}
/** Moves an item one place in a list. */
const move = <T>(list: T[], i: number, by: number) => {
  const j = i + by;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
};

// ------------------------------------------------------- Website & Brand

interface SiteData {
  version: number;
  brand: PlatformConfig['brand'];
  site: PlatformConfig['site'];
  hindiMissing: string[];
  history: {
    version: number;
    at: string;
    who: string;
    note: string;
    changed: string[];
  }[];
  legalHistory: Record<string, { version: number; at: string; note: string }[]>;
}
const COLOR_DEFAULTS: Record<string, string> = {
  accent: '#7c5cff',
  accent2: '#22d3ee',
  gold: '#ffc247',
  bg: '#07070d',
  panel: '#0f0f1a',
  border: '#23233a',
  text: '#ecebf5',
  muted: '#9a98b5',
};
const KINDS = [
  'hero',
  'story',
  'showcase',
  'styles',
  'pricing',
  'faq',
  'text',
] as const;
let siteDraft: {
  base: number;
  brand: SiteData['brand'];
  site: SiteData['site'];
} | null = null;

export async function siteScreen(ctx: Ctx): Promise<HTMLElement> {
  const data = await ctx.api<SiteData>('GET', q('/api/site'));
  // A draft survives a redraw of this screen, never a newer save elsewhere.
  if (!siteDraft || siteDraft.base !== data.version)
    siteDraft = {
      base: data.version,
      brand: clone(data.brand),
      site: clone(data.site),
    };
  const d = siteDraft;
  const root = ctx.el('div', { class: 'stack', id: 'site-screen' });
  const redraw = () => ctx.refresh();

  // Brand (1.1)
  const brandPreview = ctx.el('div', { class: 'card', id: 'brand-preview' });
  const paintBrand = () => {
    // CSSOM, not style attributes: the Owner App's CSP allows no inline styles.
    const strip = ctx.el(
      'div',
      { class: 'row brand-preview-strip' },
      ...(d.brand.logoUrl
        ? [
            ctx.el('img', {
              src: d.brand.logoUrl,
              alt: '',
              class: 'brand-preview-logo',
            }),
          ]
        : []),
      ctx.el('span', { id: 'brand-preview-name' }, d.brand.name),
    );
    const pill = ctx.el(
      'span',
      { class: 'brand-preview-pill' },
      d.brand.tagline?.[lang()] ?? d.brand.tagline?.en ?? '',
    );
    strip.style.background = d.brand.colors.bg ?? '#07070d';
    strip.style.color = d.brand.colors.text ?? '#ffffff';
    pill.style.background = d.brand.colors.accent ?? '#7c5cff';
    strip.append(pill);
    brandPreview.replaceChildren(ctx.el('strong', {}, t('preview')), strip);
  };
  paintBrand();
  const colours = ctx.el('div', { class: 'stack', id: 'brand-colours' });
  for (const key of Object.keys({ ...COLOR_DEFAULTS, ...d.brand.colors })) {
    const value = d.brand.colors[key] ?? COLOR_DEFAULTS[key] ?? '#000000';
    const picker = ctx.el('input', { type: 'color', 'data-colour': key });
    picker.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
    const hex = ctx.el('input', {
      type: 'text',
      'data-colour-hex': key,
      size: '9',
    });
    hex.value = value;
    const set = (v: string) => {
      d.brand.colors[key] = v;
      paintBrand();
    };
    picker.oninput = () => {
      hex.value = picker.value;
      set(picker.value);
    };
    hex.oninput = () => {
      if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value;
      set(hex.value);
    };
    colours.append(
      ctx.el(
        'div',
        { class: 'row' },
        ctx.el('span', { class: 'colour-key' }, key),
        picker,
        hex,
        button(
          ctx,
          t('reset'),
          () => {
            const def = COLOR_DEFAULTS[key];
            if (def) {
              picker.value = def;
              hex.value = def;
              set(def);
            }
            return null;
          },
          { 'data-colour-reset': key },
        ),
      ),
    );
  }
  root.append(
    card(
      ctx,
      t('brand'),
      'site-brand',
      field(
        ctx,
        t('brandName'),
        input(ctx, d.brand.name, (v) => ((d.brand.name = v), paintBrand()), {
          id: 'brand-name',
        }),
      ),
      media(
        ctx,
        t('logo'),
        d.brand.logoUrl,
        (v) => ((d.brand.logoUrl = v), paintBrand()),
        '/api/site/upload',
        'image',
        'brand-logo',
      ),
      media(
        ctx,
        t('favicon'),
        d.brand.faviconUrl ?? '',
        (v) => {
          if (v) d.brand.faviconUrl = v;
          else delete d.brand.faviconUrl;
        },
        '/api/site/upload',
        'image',
        'brand-favicon',
      ),
      texts(
        ctx,
        d.brand.tagline,
        (v) => {
          if (v) d.brand.tagline = v;
          else delete d.brand.tagline;
          paintBrand();
        },
        ['taglineEn', 'taglineHi'],
        'brand-tagline',
      ),
      field(
        ctx,
        t('defaultLang'),
        select(
          ctx,
          [
            ['en', 'English'],
            ['hi', 'हिंदी'],
          ],
          d.brand.defaultLocale,
          (v) => (d.brand.defaultLocale = v as 'en' | 'hi'),
          { id: 'brand-locale' },
        ),
      ),
      ctx.el('h3', {}, t('colours')),
      colours,
      brandPreview,
    ),
  );

  // Sections (1.2)
  const sections = d.site.sections;
  const secList = ctx.el('div', { class: 'stack', id: 'site-sections' });
  sections.forEach((sec, i) => {
    const items = area(
      ctx,
      sec.items
        .map((it) =>
          [it.title.en, it.body.en, it.title.hi ?? '', it.body.hi ?? ''].join(
            ' | ',
          ),
        )
        .join('\n'),
      (v) => {
        sec.items = v
          .split('\n')
          .map((line) => line.split('|').map((x) => x.trim()))
          .filter((p) => p[0])
          .map(([te = '', be = '', th = '', bh = '']) => ({
            title: th ? { en: te, hi: th } : { en: te },
            body: bh ? { en: be, hi: bh } : { en: be },
          }));
      },
      { 'data-section-items': sec.id },
    );
    secList.append(
      ctx.el(
        'div',
        { class: 'card', 'data-section': sec.id },
        ctx.el(
          'div',
          { class: 'row' },
          ctx.el('strong', {}, sec.id),
          field(
            ctx,
            t('kind'),
            select(
              ctx,
              KINDS.map((k) => [k, k] as const),
              sec.kind,
              (v) => (sec.kind = v as typeof sec.kind),
            ),
          ),
          field(
            ctx,
            t('shown'),
            check(ctx, sec.enabled, (v) => (sec.enabled = v), {
              'data-section-on': sec.id,
            }),
          ),
          button(ctx, t('up'), () => (move(sections, i, -1), redraw(), null), {
            'data-section-up': sec.id,
          }),
          button(ctx, t('down'), () => (move(sections, i, 1), redraw(), null), {
            'data-section-down': sec.id,
          }),
          button(
            ctx,
            t('copy'),
            () => {
              const copy = clone(sec);
              let n = 2;
              while (sections.some((x) => x.id === `${sec.id}-${n}`)) n++;
              copy.id = `${sec.id}-${n}`;
              sections.splice(i + 1, 0, copy);
              redraw();
              return null;
            },
            { 'data-section-copy': sec.id },
          ),
          button(
            ctx,
            t('remove'),
            () => (sections.splice(i, 1), redraw(), null),
            { 'data-section-remove': sec.id },
          ),
        ),
        texts(
          ctx,
          sec.title,
          (v) => {
            if (v) sec.title = v;
            else delete sec.title;
          },
          ['titleEn', 'titleHi'],
          `section-${sec.id}-title`,
        ),
        texts(
          ctx,
          sec.body,
          (v) => {
            if (v) sec.body = v;
            else delete sec.body;
          },
          ['bodyEn', 'bodyHi'],
          `section-${sec.id}-body`,
          true,
        ),
        field(ctx, t('items'), items),
      ),
    );
  });
  // Section order follows the list (the website sorts by order).
  const preview = ctx.el('div', { class: 'card', id: 'site-preview' });
  root.append(
    card(
      ctx,
      t('sections'),
      'site-sections-card',
      secList,
      ctx.el(
        'div',
        { class: 'row' },
        button(
          ctx,
          t('addSection'),
          () => {
            let n = sections.length + 1;
            while (sections.some((x) => x.id === `text-${n}`)) n++;
            sections.push({
              id: `text-${n}`,
              kind: 'text',
              enabled: true,
              title: { en: '' },
              items: [],
              order: sections.length + 1,
            });
            redraw();
            return null;
          },
          { id: 'site-add-section' },
        ),
        button(
          ctx,
          t('preview'),
          () => {
            preview.replaceChildren(
              ctx.el('strong', {}, t('draftPreview')),
              ...sections
                .filter((s) => s.enabled)
                .map((s) =>
                  ctx.el(
                    'div',
                    { class: 'card', 'data-preview-section': s.id },
                    ctx.el(
                      'h3',
                      {},
                      (s.title?.[lang()] ?? s.title?.en ?? '') || s.kind,
                    ),
                    ctx.el('p', {}, s.body?.[lang()] ?? s.body?.en ?? ''),
                    ...s.items.map((it) =>
                      ctx.el('p', {}, `• ${it.title[lang()] ?? it.title.en}`),
                    ),
                  ),
                ),
            );
            return null;
          },
          { id: 'site-preview-button' },
        ),
      ),
      preview,
    ),
  );

  // Showcase (1.3)
  const show = d.site.showcase;
  root.append(
    card(
      ctx,
      t('showcase'),
      'site-showcase',
      ...show.map((sh, i) =>
        ctx.el(
          'div',
          { class: 'card', 'data-showcase': sh.id },
          texts(
            ctx,
            sh.title,
            (v) => (sh.title = v ?? { en: '' }),
            ['titleEn', 'titleHi'],
            `showcase-${sh.id}`,
          ),
          media(
            ctx,
            t('video'),
            sh.videoUrl,
            (v) => (sh.videoUrl = v),
            '/api/site/upload',
            'video',
            `showcase-${sh.id}-video`,
          ),
          media(
            ctx,
            t('poster'),
            sh.posterUrl,
            (v) => (sh.posterUrl = v),
            '/api/site/upload',
            'image',
            `showcase-${sh.id}-poster`,
          ),
          ctx.el(
            'div',
            { class: 'row' },
            button(ctx, t('up'), () => (move(show, i, -1), redraw(), null)),
            button(ctx, t('down'), () => (move(show, i, 1), redraw(), null)),
            button(ctx, t('remove'), () => (show.splice(i, 1), redraw(), null)),
          ),
        ),
      ),
      button(
        ctx,
        t('addShowcase'),
        () => {
          show.push({
            id: `video-${show.length + 1}-${Date.now().toString(36).slice(-4)}`,
            title: { en: '' },
            videoUrl: '',
            posterUrl: '',
          });
          redraw();
          return null;
        },
        { id: 'site-add-showcase' },
      ),
    ),
  );

  // Header and footer links (1.4)
  const linkRows = (list: SiteLink[], id: string) =>
    ctx.el(
      'div',
      { class: 'stack', id },
      ...list.map((l, i) =>
        ctx.el(
          'div',
          { class: 'row', 'data-link': `${id}-${i}` },
          field(
            ctx,
            t('labelEn'),
            input(ctx, l.label.en, (v) => (l.label = { ...l.label, en: v })),
          ),
          field(
            ctx,
            t('labelHi'),
            input(
              ctx,
              l.label.hi ?? '',
              (v) => (l.label = v ? { ...l.label, hi: v } : { en: l.label.en }),
            ),
          ),
          field(
            ctx,
            t('link'),
            input(ctx, l.href, (v) => (l.href = v), {
              'data-href': `${id}-${i}`,
            }),
          ),
          field(
            ctx,
            t('shown'),
            check(ctx, l.enabled, (v) => (l.enabled = v)),
          ),
          button(ctx, t('up'), () => (move(list, i, -1), redraw(), null)),
          button(ctx, t('remove'), () => (list.splice(i, 1), redraw(), null)),
        ),
      ),
      button(
        ctx,
        t('addLink'),
        () => {
          list.push({ label: { en: '' }, href: '#/', enabled: true });
          redraw();
          return null;
        },
        { 'data-add-link': id },
      ),
    );
  d.site.nav ??= [
    {
      label: { en: 'Connect Claude', hi: 'Claude जोड़ें' },
      href: '#/claude',
      enabled: true,
    },
  ];
  d.site.footer ??= { groups: [] };
  const footer = d.site.footer;
  root.append(
    card(ctx, t('nav'), 'site-nav', linkRows(d.site.nav, 'nav-links')),
    card(
      ctx,
      t('footer'),
      'site-footer-card',
      ...footer.groups.map((g, gi) =>
        ctx.el(
          'div',
          { class: 'card', 'data-footer-group': String(gi) },
          texts(
            ctx,
            g.title,
            (v) => (g.title = v ?? { en: '' }),
            ['titleEn', 'titleHi'],
            `footer-group-${gi}`,
          ),
          linkRows(g.links, `footer-links-${gi}`),
          button(
            ctx,
            t('remove'),
            () => (footer.groups.splice(gi, 1), redraw(), null),
          ),
        ),
      ),
      button(
        ctx,
        t('addGroup'),
        () => {
          footer.groups.push({ title: { en: '' }, links: [] });
          redraw();
          return null;
        },
        { id: 'site-add-footer-group' },
      ),
      texts(
        ctx,
        footer.copyright,
        (v) => {
          if (v) footer.copyright = v;
          else delete footer.copyright;
        },
        ['copyrightEn', 'copyrightHi'],
        'footer-copyright',
      ),
    ),
  );

  // Banner (1.5)
  const banner = (d.site.banner ??= {
    enabled: false,
    text: { en: '' },
    color: 'info',
    where: ['website'],
    dismissible: true,
    version: 1,
  });
  const whereBox = (list: string[], v: string, id: string) =>
    ctx.el(
      'label',
      { class: 'check' },
      check(
        ctx,
        list.includes(v),
        (on) => {
          const i = list.indexOf(v);
          if (on && i < 0) list.push(v);
          if (!on && i >= 0) list.splice(i, 1);
        },
        { id },
      ),
      ' ',
      t(v as Key),
    );
  const localDate = (iso: string | undefined) =>
    iso ? new Date(iso).toISOString().slice(0, 16) : '';
  const dateInput = (
    value: string | undefined,
    set: (v: string | undefined) => void,
    id: string,
  ) => {
    const i = ctx.el('input', { type: 'datetime-local', id });
    i.value = localDate(value);
    i.onchange = () =>
      set(i.value ? new Date(`${i.value}Z`).toISOString() : undefined);
    return i;
  };
  root.append(
    card(
      ctx,
      t('banner'),
      'site-banner-card',
      field(
        ctx,
        t('bannerOn'),
        check(ctx, banner.enabled, (v) => (banner.enabled = v), {
          id: 'banner-on',
        }),
      ),
      texts(
        ctx,
        banner.text,
        (v) => (banner.text = v ?? { en: '' }),
        ['bodyEn', 'bodyHi'],
        'banner-text',
      ),
      field(
        ctx,
        t('link'),
        input(
          ctx,
          banner.link ?? '',
          (v) => {
            if (v) banner.link = v;
            else delete banner.link;
          },
          { id: 'banner-link' },
        ),
      ),
      field(
        ctx,
        t('colour'),
        select(
          ctx,
          [
            ['info', 'info'],
            ['success', 'success'],
            ['warning', 'warning'],
            ['danger', 'danger'],
          ],
          banner.color,
          (v) => (banner.color = v as typeof banner.color),
          { id: 'banner-colour' },
        ),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        t('where'),
        whereBox(banner.where, 'website', 'banner-website'),
        whereBox(banner.where, 'panel', 'banner-panel'),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(
          ctx,
          t('start'),
          dateInput(
            banner.start,
            (v) => {
              if (v) banner.start = v;
              else delete banner.start;
            },
            'banner-start',
          ),
        ),
        field(
          ctx,
          t('end'),
          dateInput(
            banner.end,
            (v) => {
              if (v) banner.end = v;
              else delete banner.end;
            },
            'banner-end',
          ),
        ),
      ),
      field(
        ctx,
        t('dismissible'),
        check(ctx, banner.dismissible, (v) => (banner.dismissible = v), {
          id: 'banner-dismissible',
        }),
      ),
    ),
  );

  // Maintenance (1.6)
  const m = (d.site.maintenance ??= {
    on: false,
    covers: ['website', 'panel', 'editor'],
  });
  root.append(
    card(
      ctx,
      t('maintenance'),
      'site-maintenance',
      field(
        ctx,
        t('maintenanceOn'),
        check(ctx, m.on, (v) => (m.on = v), { id: 'maintenance-on' }),
      ),
      texts(
        ctx,
        m.message,
        (v) => {
          if (v) m.message = v;
          else delete m.message;
        },
        ['messageEn', 'messageHi'],
        'maintenance-message',
      ),
      field(
        ctx,
        t('backAt'),
        input(
          ctx,
          m.backAt ?? '',
          (v) => {
            if (v) m.backAt = v;
            else delete m.backAt;
          },
          { id: 'maintenance-back' },
        ),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        t('covers'),
        whereBox(m.covers, 'website', 'maintenance-website'),
        whereBox(m.covers, 'panel', 'maintenance-panel'),
        whereBox(m.covers, 'editor', 'maintenance-editor'),
      ),
    ),
  );

  // Legal pages (1.7)
  const legal = (d.site.legal ??= []);
  root.append(
    card(
      ctx,
      t('legal'),
      'site-legal',
      ...legal.map((p, i) =>
        ctx.el(
          'div',
          { class: 'card', 'data-legal': p.id },
          field(
            ctx,
            t('legalId'),
            input(ctx, p.id, (v) => (p.id = v), { 'data-legal-id': String(i) }),
          ),
          texts(
            ctx,
            p.title,
            (v) => (p.title = v ?? { en: '' }),
            ['titleEn', 'titleHi'],
            `legal-${i}-title`,
          ),
          texts(
            ctx,
            p.body,
            (v) => (p.body = v ?? { en: '' }),
            ['bodyEn', 'bodyHi'],
            `legal-${i}-body`,
            true,
          ),
          field(
            ctx,
            t('published'),
            check(ctx, p.published, (v) => (p.published = v), {
              'data-legal-published': p.id,
            }),
          ),
          ctx.el('p', { class: 'muted' }, `v${p.version} ${p.updated}`),
          ctx.el('strong', {}, t('legalVersions')),
          ...(data.legalHistory[p.id] ?? []).map((v) =>
            ctx.el(
              'div',
              { class: 'row', 'data-legal-version': `${p.id}-${v.version}` },
              `v${v.version} · ${new Date(v.at).toLocaleString()} · ${v.note}`,
              button(ctx, t('rollback'), async () => {
                const out = await ctx.guarded(() =>
                  ctx.api<{ version: number }>(
                    'POST',
                    q('/api/site/legal-rollback'),
                    {
                      id: p.id,
                      version: v.version,
                      baseVersion: d.base,
                    },
                  ),
                );
                if (!out) return null;
                siteDraft = null;
                redraw();
                return t('rolledBack', { v: out.version });
              }),
            ),
          ),
          button(ctx, t('remove'), () => (legal.splice(i, 1), redraw(), null)),
        ),
      ),
      button(
        ctx,
        t('addLegal'),
        () => {
          const free =
            ['privacy', 'terms', 'refund'].find(
              (x) => !legal.some((p) => p.id === x),
            ) ?? `page-${legal.length + 1}`;
          legal.push({
            id: free,
            title: { en: free[0]!.toUpperCase() + free.slice(1) },
            body: { en: '' },
            version: 1,
            updated: '',
            published: false,
          });
          redraw();
          return null;
        },
        { id: 'site-add-legal' },
      ),
    ),
  );

  // Hindi warning (1.9), save, versions
  let note = '';
  root.append(
    ...(data.hindiMissing.length
      ? [
          ctx.el(
            'p',
            { class: 'warning', id: 'site-hindi-missing' },
            t('hindiMissing', { list: data.hindiMissing.join(', ') }),
          ),
        ]
      : []),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('note'),
        input(ctx, '', (v) => (note = v), { id: 'site-note' }),
      ),
      button(
        ctx,
        t('save'),
        async () => {
          const out = await ctx.guarded(() =>
            ctx.api<{ version: number }>('POST', q('/api/site'), {
              brand: d.brand,
              site: d.site,
              note,
              baseVersion: d.base,
            }),
          );
          if (!out) return null;
          siteDraft = null;
          redraw();
          return t('saved', { v: out.version });
        },
        { id: 'site-save', class: 'primary' },
      ),
    ),
    card(
      ctx,
      t('versions'),
      'site-versions',
      ...data.history.map((v) =>
        ctx.el(
          'div',
          { class: 'row', 'data-site-version': String(v.version) },
          `v${v.version} · ${new Date(v.at).toLocaleString()} · ${v.who} · ${v.note || v.changed.join(', ')}`,
          button(ctx, t('rollback'), async () => {
            const out = await ctx.guarded(() =>
              ctx.api<{ version: number }>('POST', q('/api/site/rollback'), {
                version: v.version,
                baseVersion: d.base,
              }),
            );
            if (!out) return null;
            siteDraft = null;
            redraw();
            return t('rolledBack', { v: out.version });
          }),
        ),
      ),
    ),
  );
  return root;
}

export type { AppearanceSlot };

// Filled in Part 2 and Part 3 below.
export async function appearanceScreen(ctx: Ctx): Promise<HTMLElement> {
  return ctx.el('div', { id: 'appearance-screen' });
}
export async function accessScreen(ctx: Ctx): Promise<HTMLElement> {
  return ctx.el('div', { id: 'access-screen' });
}
