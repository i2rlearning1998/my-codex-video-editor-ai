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

// ------------------------------------------------------------ Appearance

const A = {
  title: ['Appearance', 'रूप-रंग'],
  intro: [
    'Every card, hero and empty state that can show a picture. Give one a picture or a short video (with its poster); a slot you never set shows what it shows today.',
    'हर कार्ड, हीरो और खाली हिस्सा जो तस्वीर दिखा सकता है। किसी को तस्वीर या छोटा वीडियो (पोस्टर के साथ) दें; जिसे आपने कभी नहीं बदला वह आज जैसा ही दिखेगा।',
  ],
  search: ['Find a slot', 'स्लॉट खोजें'],
  image: ['Picture', 'तस्वीर'],
  video: ['Video', 'वीडियो'],
  poster: ['Poster (needed with a video)', 'पोस्टर (वीडियो के साथ ज़रूरी)'],
  fit: ['Fit', 'फ़िट'],
  focus: [
    'Keep in view (click the picture)',
    'नज़र में रखें (तस्वीर पर क्लिक करें)',
  ],
  play: ['Video plays', 'वीडियो चले'],
  titleEn: ['Title (English, optional)', 'शीर्षक (अंग्रेज़ी, वैकल्पिक)'],
  titleHi: ['Title (Hindi)', 'शीर्षक (हिंदी)'],
  blurbEn: [
    'Short text (English, optional)',
    'छोटा टेक्स्ट (अंग्रेज़ी, वैकल्पिक)',
  ],
  blurbHi: ['Short text (Hindi)', 'छोटा टेक्स्ट (हिंदी)'],
  order: ['Order', 'क्रम'],
  hide: ['Hide this card', 'यह कार्ड छिपाएँ'],
  on: ['Use my picture', 'मेरी तस्वीर इस्तेमाल करें'],
  reset: ['Reset to today’s picture', 'आज वाली तस्वीर पर लौटें'],
  open: ['Open the page', 'पेज खोलें'],
  drop: ['Drop a picture or video here', 'यहाँ तस्वीर या वीडियो छोड़ें'],
  unused: ['Unused files', 'बिना इस्तेमाल की फ़ाइलें'],
  clean: ['Delete unused files', 'बिना इस्तेमाल की फ़ाइलें हटाएँ'],
  none: ['None.', 'कोई नहीं।'],
  save: ['Save Appearance', 'रूप-रंग सहेजें'],
  saved: [
    'Saved as config version {v}.',
    'कॉन्फ़िग वर्ज़न {v} के रूप में सहेजा।',
  ],
  set: ['set', 'बदला हुआ'],
} as const;
const ta = (k: keyof typeof A, vars: Record<string, string | number> = {}) =>
  A[k][lang() === 'hi' ? 1 : 0].replace(/\{(\w+)\}/g, (w, n: string) =>
    n in vars ? String(vars[n]) : w,
  );
interface AppearanceData {
  version: number;
  appearance: NonNullable<PlatformConfig['appearance']>;
  limits: { imageBytes: number; videoBytes: number };
  slots: { id: string; kind: string; page: string; label: string }[];
  unused: { file: string; bytes: number }[];
  unusedNote: string;
}
let lookDraft: { base: number; slots: Record<string, AppearanceSlot> } | null =
  null;
let lookQuery = '';

export async function appearanceScreen(ctx: Ctx): Promise<HTMLElement> {
  const data = await ctx.api<AppearanceData>('GET', q('/api/appearance'));
  if (!lookDraft || lookDraft.base !== data.version)
    lookDraft = { base: data.version, slots: clone(data.appearance.slots) };
  const d = lookDraft;
  const root = ctx.el('div', { class: 'stack', id: 'appearance-screen' });
  const blank = (): AppearanceSlot => ({
    fit: 'cover',
    focus: { x: 50, y: 50 },
    play: 'auto',
    enabled: true,
  });
  const list = ctx.el('div', { class: 'stack', id: 'appearance-list' });
  const draw = () => {
    list.replaceChildren();
    const pages = new Map<string, typeof data.slots>();
    for (const s of data.slots) {
      if (
        lookQuery &&
        !`${s.id} ${s.label}`.toLowerCase().includes(lookQuery.toLowerCase())
      )
        continue;
      pages.set(s.page, [...(pages.get(s.page) ?? []), s]);
    }
    for (const [page, slots] of pages)
      list.append(
        card(
          ctx,
          page,
          `appearance-page-${page.replace(/[^a-z0-9]+/gi, '-')}`,
          ctx.el(
            'a',
            { href: page, target: '_blank', rel: 'noopener' },
            ta('open'),
          ),
          ...slots.map((info) => slotCard(info)),
        ),
      );
  };
  const slotCard = (info: AppearanceData['slots'][number]) => {
    const s = d.slots[info.id];
    const box = ctx.el('div', {
      class: 'card slot-card',
      'data-slot-card': info.id,
    });
    const head = ctx.el(
      'div',
      { class: 'row' },
      ctx.el('strong', {}, info.label),
      ctx.el('code', {}, info.id),
      s
        ? ctx.el('span', { class: 'chip', 'data-slot-set': info.id }, ta('set'))
        : '',
    );
    box.append(head);
    // Drop a file on the card to upload it (2.5).
    box.ondragover = (e) => e.preventDefault();
    box.ondrop = async (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      try {
        const out = await upload(
          q(`/api/appearance/upload?name=${encodeURIComponent(f.name)}`),
          f,
        );
        const cur = (d.slots[info.id] ??= blank());
        if (out.kind === 'video') cur.video = out.url;
        else if (cur.video && !cur.poster) cur.poster = out.url;
        else cur.image = out.url;
        draw();
        say(ctx, out.url, true);
      } catch (err) {
        say(ctx, msg(err), false);
      }
    };
    if (!s) {
      box.append(
        ctx.el('p', { class: 'muted' }, ta('drop')),
        button(
          ctx,
          ta('on'),
          () => {
            d.slots[info.id] = blank();
            draw();
            return null;
          },
          { 'data-slot-start': info.id },
        ),
      );
      return box;
    }
    const preview = ctx.el('div', {
      class: 'slot-preview',
      'data-slot-preview': info.id,
    });
    const src = s.image || s.poster;
    if (src) {
      const img = ctx.el('img', { src, alt: '' });
      img.style.objectFit = s.fit;
      img.style.objectPosition = `${s.focus.x}% ${s.focus.y}%`;
      // The focus picker: a click sets where the picture stays in view.
      img.onclick = (e) => {
        const r = img.getBoundingClientRect();
        s.focus = {
          x: Math.round(((e.clientX - r.left) / r.width) * 100),
          y: Math.round(((e.clientY - r.top) / r.height) * 100),
        };
        draw();
      };
      preview.append(img);
    }
    const id = info.id.replace(/[^a-z0-9]+/gi, '-');
    box.append(
      preview,
      media(
        ctx,
        ta('image'),
        s.image ?? '',
        (v) => (v ? (s.image = v) : delete s.image),
        '/api/appearance/upload',
        'image',
        `slot-${id}-image`,
      ),
      media(
        ctx,
        ta('video'),
        s.video ?? '',
        (v) => (v ? (s.video = v) : delete s.video),
        '/api/appearance/upload',
        'video',
        `slot-${id}-video`,
      ),
      media(
        ctx,
        ta('poster'),
        s.poster ?? '',
        (v) => (v ? (s.poster = v) : delete s.poster),
        '/api/appearance/upload',
        'image',
        `slot-${id}-poster`,
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(
          ctx,
          ta('fit'),
          select(
            ctx,
            [
              ['cover', 'cover'],
              ['contain', 'contain'],
            ],
            s.fit,
            (v) => (s.fit = v as 'cover' | 'contain'),
          ),
        ),
        field(
          ctx,
          ta('play'),
          select(
            ctx,
            [
              ['auto', 'auto'],
              ['hover', 'hover'],
              ['still', 'still'],
            ],
            s.play,
            (v) => (s.play = v as AppearanceSlot['play']),
          ),
        ),
        ctx.el(
          'span',
          { class: 'muted', 'data-slot-focus': info.id },
          `${ta('focus')}: ${s.focus.x}%, ${s.focus.y}%`,
        ),
      ),
      texts(
        ctx,
        s.title,
        (v) => (v ? (s.title = v) : delete s.title),
        ['titleEn', 'titleHi'],
        `slot-${id}-title`,
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(
          ctx,
          ta('order'),
          input(
            ctx,
            s.order === undefined ? '' : String(s.order),
            (v) => {
              const n = Number(v);
              if (v.trim() && Number.isFinite(n)) s.order = n;
              else delete s.order;
            },
            { 'data-slot-order': info.id },
          ),
        ),
        field(
          ctx,
          ta('on'),
          check(ctx, s.enabled, (v) => (s.enabled = v), {
            'data-slot-on': info.id,
          }),
        ),
        field(
          ctx,
          ta('hide'),
          check(ctx, !!s.hide, (v) => (v ? (s.hide = true) : delete s.hide), {
            'data-slot-hide': info.id,
          }),
        ),
        button(
          ctx,
          ta('reset'),
          () => {
            delete d.slots[info.id];
            draw();
            return null;
          },
          { 'data-slot-reset': info.id },
        ),
      ),
    );
    return box;
  };
  draw();
  const searchBox = input(
    ctx,
    lookQuery,
    (v) => {
      lookQuery = v;
      draw();
    },
    { id: 'appearance-search', placeholder: ta('search') },
  );
  let note = '';
  root.append(
    ctx.el('h1', {}, ta('title')),
    ctx.el('p', { class: 'muted' }, ta('intro')),
    searchBox,
    list,
    card(
      ctx,
      ta('unused'),
      'appearance-unused',
      ...(data.unused.length
        ? data.unused.map((f) =>
            ctx.el(
              'div',
              { class: 'row', 'data-unused': f.file, title: data.unusedNote },
              `${data.unusedNote} `,
              f.file,
              ` (${Math.ceil(f.bytes / 1024)} KB)`,
            ),
          )
        : [ctx.el('p', { class: 'muted' }, ta('none'))]),
      button(
        ctx,
        ta('clean'),
        async () => {
          const out = await ctx.api<{ removed: string[] }>(
            'POST',
            q('/api/appearance/cleanup'),
            {},
          );
          ctx.refresh();
          return `${out.removed.length}`;
        },
        { id: 'appearance-clean' },
      ),
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('note'),
        input(ctx, '', (v) => (note = v), { id: 'appearance-note' }),
      ),
      button(
        ctx,
        ta('save'),
        async () => {
          const out = await ctx.api<{ version: number }>(
            'POST',
            q('/api/appearance'),
            {
              appearance: { ...data.appearance, slots: d.slots },
              note,
              baseVersion: d.base,
            },
          );
          lookDraft = null;
          ctx.refresh();
          return ta('saved', { v: out.version });
        },
        { id: 'appearance-save', class: 'primary' },
      ),
    ),
  );
  return root;
}

// ---------------------------------------------------- Features & access

const F = {
  title: ['Features & access', 'फ़ीचर और एक्सेस'],
  intro: [
    'Switch a feature on or off for everyone, try it with a share of people first, give it to plans, or give one person or a group a feature or a limit for a while.',
    'किसी फ़ीचर को सबके लिए चालू या बंद करें, पहले कुछ लोगों पर आज़माएँ, प्लान में दें, या किसी व्यक्ति या समूह को कुछ समय के लिए फ़ीचर या सीमा दें।',
  ],
  features: ['Features', 'फ़ीचर'],
  key: ['Key', 'कुंजी'],
  on: ['On for everyone', 'सबके लिए चालू'],
  beta: ['Beta (only the group below)', 'बीटा (सिर्फ़ नीचे वाला समूह)'],
  rollout: ['Share of people (%)', 'लोगों का हिस्सा (%)'],
  gates: ['What it gates', 'यह किसे रोकता है'],
  saveFeatures: ['Save features', 'फ़ीचर सहेजें'],
  plans: ['Plans', 'प्लान'],
  archived: ['Archived', 'संग्रहित'],
  copyPlan: ['Copy a plan', 'प्लान कॉपी करें'],
  savePlans: ['Save plans', 'प्लान सहेजें'],
  remove: ['Remove', 'हटाएँ'],
  overrides: ['Personal and group overrides', 'व्यक्तिगत और समूह ओवरराइड'],
  who: [
    'Person (email) or group (cohort:id)',
    'व्यक्ति (ईमेल) या समूह (cohort:id)',
  ],
  what: ['Feature or limit', 'फ़ीचर या सीमा'],
  value: [
    'On / Off, or the limit (empty: no limit)',
    'चालू / बंद, या सीमा (खाली: कोई सीमा नहीं)',
  ],
  until: ['Until (empty: no end)', 'कब तक (खाली: कोई अंत नहीं)'],
  note: ['Note (why)', 'नोट (क्यों)'],
  add: ['Add the override', 'ओवरराइड जोड़ें'],
  cohorts: ['Groups (cohorts)', 'समूह'],
  cohortId: ['Group id', 'समूह id'],
  cohortName: ['Name', 'नाम'],
  emails: [
    'Emails (up to 500; paste or import a file)',
    'ईमेल (500 तक; चिपकाएँ या फ़ाइल लाएँ)',
  ],
  importFile: ['Import a list', 'सूची लाएँ'],
  saveCohort: ['Save the group', 'समूह सहेजें'],
  whoHas: ['Who has this?', 'यह किसके पास है?'],
  show: ['Show', 'दिखाएँ'],
  count: ['{n} people have it.', '{n} लोगों के पास है।'],
  saved: [
    'Saved as config version {v}.',
    'कॉन्फ़िग वर्ज़न {v} के रूप में सहेजा।',
  ],
  done: ['Done.', 'हो गया।'],
} as const;
const tf = (k: keyof typeof F, vars: Record<string, string | number> = {}) =>
  F[k][lang() === 'hi' ? 1 : 0].replace(/\{(\w+)\}/g, (w, n: string) =>
    n in vars ? String(vars[n]) : w,
  );
type Plan = PlatformConfig['plans'][number];
type Feature = NonNullable<PlatformConfig['features']>[number];
interface AccessData {
  version: number;
  plans: Plan[];
  features: Feature[];
  limits: string[];
  cohorts: { id: string; name: string; emails: string[] }[];
  overrides: {
    id: string;
    who: string;
    feature?: string;
    on?: boolean;
    limit?: string;
    value?: number | null;
    expiresAt?: string;
    note: string;
    expired: boolean;
  }[];
  expiredText: string;
}
let accessDraft: { base: number; plans: Plan[]; features: Feature[] } | null =
  null;
let accessRenders = 0;
const overrideDraft = { who: '', what: '', value: '', until: '', note: '' };
const cohortDraft = { id: '', name: '', emails: '' };

export async function accessScreen(ctx: Ctx): Promise<HTMLElement> {
  const data = await ctx.api<AccessData>('GET', q('/api/access'));
  if (!accessDraft || accessDraft.base !== data.version)
    accessDraft = {
      base: data.version,
      plans: clone(data.plans),
      features: clone(data.features),
    };
  const d = accessDraft;
  const root = ctx.el('div', {
    class: 'stack',
    id: 'access-screen',
    // Counts redraws (tests wait for the one after a save).
    'data-render': String(++accessRenders),
  });
  // Features (3.1).
  const featRows = d.features.map((f) =>
    ctx.el(
      'tr',
      { 'data-feature': f.key },
      ctx.el('td', {}, ctx.el('code', {}, f.key)),
      ctx.el(
        'td',
        {},
        input(ctx, f.label.en, (v) => (f.label = { ...f.label, en: v })),
      ),
      ctx.el(
        'td',
        {},
        input(
          ctx,
          f.label.hi ?? '',
          (v) => (f.label = v ? { ...f.label, hi: v } : { en: f.label.en }),
          { lang: 'hi' },
        ),
      ),
      ctx.el(
        'td',
        {},
        check(ctx, f.on, (v) => (f.on = v), { 'data-feature-on': f.key }),
      ),
      ctx.el(
        'td',
        {},
        check(ctx, f.beta, (v) => (f.beta = v), { 'data-feature-beta': f.key }),
      ),
      ctx.el(
        'td',
        {},
        input(
          ctx,
          String(f.rollout),
          (v) => {
            const n = Math.round(Number(v));
            if (Number.isFinite(n)) f.rollout = Math.max(0, Math.min(100, n));
          },
          { 'data-feature-rollout': f.key, size: '4' },
        ),
      ),
      ctx.el(
        'td',
        {},
        input(
          ctx,
          f.gates.join(', '),
          (v) =>
            (f.gates = v
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)),
        ),
      ),
    ),
  );
  const table = (head: string[], rows: HTMLElement[], id: string) =>
    ctx.el(
      'table',
      { id },
      ctx.el(
        'thead',
        {},
        ctx.el('tr', {}, ...head.map((h) => ctx.el('th', {}, h))),
      ),
      ctx.el('tbody', {}, ...rows),
    );
  root.append(
    ctx.el('h1', {}, tf('title')),
    ctx.el('p', { class: 'muted' }, tf('intro')),
    card(
      ctx,
      tf('features'),
      'access-features',
      table(
        [
          tf('key'),
          'English',
          'हिंदी',
          tf('on'),
          tf('beta'),
          tf('rollout'),
          tf('gates'),
        ],
        featRows,
        'feature-table',
      ),
      button(
        ctx,
        tf('saveFeatures'),
        async () => {
          const out = await ctx.api<{ version: number }>(
            'POST',
            q('/api/access/features'),
            {
              features: d.features,
              baseVersion: d.base,
            },
          );
          accessDraft = null;
          ctx.refresh();
          return tf('saved', { v: out.version });
        },
        { id: 'access-save-features', class: 'primary' },
      ),
    ),
  );
  // Plans: features by plan and labelled limits (3.2).
  const planHead = ['', ...d.plans.map((p) => p.id)];
  const grid = d.features.map((f) =>
    ctx.el(
      'tr',
      {},
      ctx.el('td', {}, f.label[lang()] ?? f.label.en),
      ...d.plans.map((p) =>
        ctx.el(
          'td',
          {},
          check(
            ctx,
            p.features.includes(f.key),
            (v) => {
              p.features = v
                ? [...new Set([...p.features, f.key])]
                : p.features.filter((x) => x !== f.key);
            },
            { 'data-plan-feature': `${p.id}:${f.key}` },
          ),
        ),
      ),
    ),
  );
  const limits = data.limits.map((k) =>
    ctx.el(
      'tr',
      {},
      ctx.el('td', {}, k),
      ...d.plans.map((p) => {
        const cur = (p.limits as Record<string, number | null>)[k];
        return ctx.el(
          'td',
          {},
          input(
            ctx,
            cur === null || cur === undefined ? '' : String(cur),
            (v) => {
              const n = Number(v);
              (p.limits as Record<string, number | null>)[k] =
                v.trim() === ''
                  ? null
                  : Number.isFinite(n)
                    ? Math.round(n)
                    : (cur ?? null);
            },
            { 'data-plan-limit': `${p.id}:${k}`, size: '7' },
          ),
        );
      }),
    ),
  );
  const archive = ctx.el(
    'tr',
    {},
    ctx.el('td', {}, tf('archived')),
    ...d.plans.map((p) =>
      ctx.el(
        'td',
        {},
        check(
          ctx,
          !!p.archived,
          (v) => (v ? (p.archived = true) : delete p.archived),
          { 'data-plan-archived': p.id },
        ),
      ),
    ),
  );
  const removers = ctx.el(
    'tr',
    {},
    ctx.el('td', {}, ''),
    ...d.plans.map((p, i) =>
      ctx.el(
        'td',
        {},
        button(
          ctx,
          tf('remove'),
          () => (d.plans.splice(i, 1), ctx.refresh(), null),
          { 'data-plan-remove': p.id },
        ),
      ),
    ),
  );
  root.append(
    card(
      ctx,
      tf('plans'),
      'access-plans',
      table(planHead, [...grid, ...limits, archive, removers], 'plan-grid'),
      ctx.el(
        'div',
        { class: 'row' },
        button(
          ctx,
          tf('copyPlan'),
          () => {
            const from = d.plans[0]!;
            let n = 2;
            while (d.plans.some((p) => p.id === `${from.id}-${n}`)) n++;
            d.plans.push({
              ...clone(from),
              id: `${from.id}-${n}`,
              name: { en: `${from.name.en} ${n}` },
            });
            ctx.refresh();
            return null;
          },
          { id: 'access-copy-plan' },
        ),
        button(
          ctx,
          tf('savePlans'),
          async () => {
            const out = await ctx.api<{ version: number }>(
              'POST',
              q('/api/access/plans'),
              {
                plans: d.plans,
                baseVersion: d.base,
              },
            );
            accessDraft = null;
            ctx.refresh();
            return tf('saved', { v: out.version });
          },
          { id: 'access-save-plans', class: 'primary' },
        ),
      ),
    ),
  );
  // Overrides (3.3).
  // Typed values survive a redraw of this screen (a save elsewhere on it).
  const form = overrideDraft;
  const whats = [
    ...d.features.map((f) => [`feature:${f.key}`, f.key] as const),
    ...data.limits.map((l) => [`limit:${l}`, `${l} (limit)`] as const),
  ];
  if (!whats.some((w) => w[0] === form.what)) form.what = whats[0]?.[0] ?? '';
  root.append(
    card(
      ctx,
      tf('overrides'),
      'access-overrides',
      ...data.overrides.map((o) =>
        ctx.el(
          'div',
          { class: `row${o.expired ? ' muted' : ''}`, 'data-override': o.id },
          `${o.who} · ${o.feature ? `${o.feature} ${o.on ? 'on' : 'off'}` : `${o.limit} = ${o.value ?? '∞'}`} · ${o.expiresAt ? new Date(o.expiresAt).toLocaleString() : '∞'} · ${o.note}`,
          o.expired
            ? ctx.el(
                'span',
                { class: 'chip', 'data-override-expired': o.id },
                data.expiredText,
              )
            : '',
          button(
            ctx,
            tf('remove'),
            async () => {
              const out = await ctx.guarded(() =>
                ctx.api('POST', q('/api/access/override'), { remove: o.id }),
              );
              if (!out) return null;
              ctx.refresh();
              return tf('done');
            },
            { 'data-override-remove': o.id },
          ),
        ),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(
          ctx,
          tf('who'),
          input(ctx, form.who, (v) => (form.who = v), { id: 'override-who' }),
        ),
        field(
          ctx,
          tf('what'),
          select(ctx, whats, form.what, (v) => (form.what = v), {
            id: 'override-what',
          }),
        ),
        field(
          ctx,
          tf('value'),
          input(ctx, form.value, (v) => (form.value = v), {
            id: 'override-value',
          }),
        ),
        field(
          ctx,
          tf('until'),
          (() => {
            const i = ctx.el('input', {
              type: 'datetime-local',
              id: 'override-until',
            });
            i.onchange = () =>
              (form.until = i.value
                ? new Date(`${i.value}Z`).toISOString()
                : '');
            return i;
          })(),
        ),
        field(
          ctx,
          tf('note'),
          input(ctx, form.note, (v) => (form.note = v), {
            id: 'override-note',
          }),
        ),
        button(
          ctx,
          tf('add'),
          async () => {
            const [kind, key] = form.what.split(':') as [string, string];
            const v = form.value.trim().toLowerCase();
            const override = {
              who: form.who.trim(),
              note: form.note,
              ...(form.until ? { expiresAt: form.until } : {}),
              ...(kind === 'feature'
                ? {
                    feature: key,
                    on: v === 'on' || v === 'चालू' || v === 'true',
                  }
                : { limit: key, value: v === '' ? null : Number(v) }),
            };
            const out = await ctx.guarded(() =>
              ctx.api('POST', q('/api/access/override'), { override }),
            );
            if (!out) return null;
            Object.assign(form, { who: '', value: '', until: '', note: '' });
            ctx.refresh();
            return tf('done');
          },
          { id: 'override-add', class: 'primary' },
        ),
      ),
    ),
  );
  // Cohorts (3.4).
  const co = cohortDraft;
  const emailsBox = area(ctx, co.emails, (v) => (co.emails = v), {
    id: 'cohort-emails',
    rows: '4',
  });
  root.append(
    card(
      ctx,
      tf('cohorts'),
      'access-cohorts',
      ...data.cohorts.map((c) =>
        ctx.el(
          'div',
          { class: 'row', 'data-cohort': c.id },
          `${c.id} · ${c.name} · ${c.emails.length}`,
          button(ctx, tf('remove'), async () => {
            await ctx.api('POST', q('/api/access/cohort'), { remove: c.id });
            ctx.refresh();
            return tf('done');
          }),
        ),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(
          ctx,
          tf('cohortId'),
          input(ctx, co.id, (v) => (co.id = v), { id: 'cohort-id' }),
        ),
        field(
          ctx,
          tf('cohortName'),
          input(ctx, co.name, (v) => (co.name = v), { id: 'cohort-name' }),
        ),
      ),
      field(ctx, tf('emails'), emailsBox),
      ctx.el(
        'div',
        { class: 'row' },
        button(
          ctx,
          tf('importFile'),
          async () => {
            const f = await pickFile('.txt,.csv,text/plain,text/csv');
            if (!f) return null;
            co.emails = await f.text();
            emailsBox.value = co.emails;
            return null;
          },
          { id: 'cohort-import' },
        ),
        button(
          ctx,
          tf('saveCohort'),
          async () => {
            await ctx.api('POST', q('/api/access/cohort'), co);
            Object.assign(co, { id: '', name: '', emails: '' });
            ctx.refresh();
            return tf('done');
          },
          { id: 'cohort-save', class: 'primary' },
        ),
      ),
    ),
  );
  // Who has this? (3.5)
  const whoOut = ctx.el('div', { class: 'stack', id: 'who-result' });
  let whoKey = d.features[0]?.key ?? '';
  root.append(
    card(
      ctx,
      tf('whoHas'),
      'access-who',
      ctx.el(
        'div',
        { class: 'row' },
        select(
          ctx,
          d.features.map((f) => [f.key, f.key] as const),
          whoKey,
          (v) => (whoKey = v),
          { id: 'who-feature' },
        ),
        button(
          ctx,
          tf('show'),
          async () => {
            const r = await ctx.api<{
              people: { email: string; on: boolean; why: string }[];
              count: number;
            }>(
              'GET',
              q(`/api/access/who?feature=${encodeURIComponent(whoKey)}`),
            );
            whoOut.replaceChildren(
              ctx.el('p', { id: 'who-count' }, tf('count', { n: r.count })),
              ...r.people.map((p) =>
                ctx.el(
                  'div',
                  { class: 'row', 'data-who': p.email },
                  `${p.email || '—'} · ${p.on ? '✓' : '✗'} · ${p.why}`,
                ),
              ),
            );
            return null;
          },
          { id: 'who-show' },
        ),
      ),
      whoOut,
    ),
  );
  return root;
}
