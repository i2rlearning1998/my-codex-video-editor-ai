// ROUND-C4: three Admin screens of the Owner App, served as /builder.js and
// loaded by admin.ts when the owner opens them: Readymade Styles (the
// builder), Brief fields (the field library editor) and Director limits.
// Plain DOM, no framework, types only from src (this file is transpiled on
// its own, like admin.ts). Every check runs on the Owner App's server
// (/api/styles, /api/fields), which uses the platform's own functions; the
// Director limits save through the same Platform Config path as every tab.
import type { AdminCtx } from './admin';
import type {
  PlatformConfig,
  Style,
  FieldBlock,
  VideoType,
} from '../../src/platform-config/schema';

type Lang = 'en' | 'hi';
const lang = (): Lang =>
  localStorage.getItem('owner.lang') === 'hi' ? 'hi' : 'en';

// Every string of these screens, English and Hindi (keyed).
const S = {
  stylesTitle: ['Readymade Styles', 'रेडीमेड स्टाइल'],
  stylesIntro: [
    'Make a Style, test it, publish it. People see only Published Styles; your own account also sees Draft and Tested ones.',
    'स्टाइल बनाएँ, टेस्ट करें, पब्लिश करें। लोग सिर्फ़ पब्लिश स्टाइल देखते हैं; आपका अपना अकाउंट ड्राफ़्ट और टेस्टेड भी देखता है।',
  ],
  filter: ['Show', 'दिखाएँ'],
  all: ['All', 'सभी'],
  draft: ['Draft', 'ड्राफ़्ट'],
  tested: ['Tested', 'टेस्टेड'],
  published: ['Published', 'पब्लिश'],
  newStyle: ['New Style', 'नया स्टाइल'],
  fromProject: ['Make a Style from a Project', 'प्रोजेक्ट से स्टाइल बनाएँ'],
  importStyle: [
    'Import a Style (.aive-style.zip)',
    'स्टाइल लाएँ (.aive-style.zip)',
  ],
  name: ['Name', 'नाम'],
  status: ['Status', 'स्थिति'],
  version: ['Version', 'वर्ज़न'],
  tests: ['Passed tests', 'पास टेस्ट'],
  order: ['Order', 'क्रम'],
  on: ['On', 'चालू'],
  plans: ['Plans', 'प्लान'],
  allPlans: ['Every plan', 'हर प्लान'],
  checks: ['Checks', 'जाँच'],
  edit: ['Edit', 'बदलें'],
  copy: ['Copy', 'कॉपी'],
  del: ['Delete', 'हटाएँ'],
  up: ['Up', 'ऊपर'],
  down: ['Down', 'नीचे'],
  exportStyle: ['Export', 'एक्सपोर्ट'],
  deletedTitle: ['Deleted', 'हटाए गए'],
  restore: ['Restore', 'वापस लाएँ'],
  noDeleted: ['Nothing was deleted.', 'कुछ भी हटाया नहीं गया।'],
  invalid: ['Does not pass its checks', 'जाँच में पास नहीं'],
  legacy: [
    "Uses the Director's form only (no template)",
    'सिर्फ़ डायरेक्टर का फ़ॉर्म (कोई टेम्पलेट नहीं)',
  ],
  override: ['Published with a reason', 'कारण के साथ पब्लिश'],
  back: ['Back to the list', 'सूची पर वापस'],
  basics: ['Basics', 'मूल बातें'],
  id: ['Id', 'Id'],
  nameEn: ['Name (English)', 'नाम (अंग्रेज़ी)'],
  nameHi: ['Name (Hindi)', 'नाम (हिंदी)'],
  blurbEn: ['Blurb (English)', 'परिचय (अंग्रेज़ी)'],
  blurbHi: ['Blurb (Hindi)', 'परिचय (हिंदी)'],
  cardArt: ['Card art (picture address)', 'कार्ड चित्र (पता)'],
  formats: ['Formats', 'फ़ॉर्मेट'],
  requires: [
    'Plan features it needs (comma separated)',
    'ज़रूरी प्लान फ़ीचर (कॉमा से अलग)',
  ],
  costMin: ['Cost from (credits)', 'कीमत से (क्रेडिट)'],
  costMax: ['Cost up to (credits)', 'कीमत तक (क्रेडिट)'],
  costPer: ['Per (unit)', 'प्रति (इकाई)'],
  sample: ['Sample', 'नमूना'],
  sampleVideo: ['Sample video (MP4 or WebM)', 'नमूना वीडियो (MP4 या WebM)'],
  samplePoster: ['Poster (PNG, JPEG or WebP)', 'पोस्टर (PNG, JPEG या WebP)'],
  posterNote: [
    'Upload the poster as a picture (picking a frame of the video is not available here).',
    'पोस्टर तस्वीर के रूप में अपलोड करें (यहाँ वीडियो से फ़्रेम चुनना उपलब्ध नहीं है)।',
  ],
  briefFields: ["The Style's Brief fields", 'स्टाइल के ब्रीफ़ फ़ील्ड'],
  addField: ['Add a field', 'फ़ील्ड जोड़ें'],
  inputs: ['What a person can start from', 'व्यक्ति किससे शुरू कर सकता है'],
  scriptRules: [
    'Script rules (what the planner reads)',
    'स्क्रिप्ट नियम (प्लानर यही पढ़ता है)',
  ],
  plannerReads: ['Exactly what the planner reads', 'प्लानर ठीक यही पढ़ता है'],
  looks: ['Looks (up to 4)', 'लुक (4 तक)'],
  addLook: ['Add a look', 'लुक जोड़ें'],
  palette: ['Colours', 'रंग'],
  headingFont: ['Heading font', 'हेडिंग फ़ॉन्ट'],
  bodyFont: ['Body font', 'बॉडी फ़ॉन्ट'],
  captionStyle: ['Caption style', 'कैप्शन स्टाइल'],
  kit: ['Graphics kit', 'ग्राफ़िक्स किट'],
  kitNotes: ['Notes', 'नोट्स'],
  kitBlocks: ['Blocks (from the editor)', 'ब्लॉक (एडिटर से)'],
  slots: ['Asset slots', 'एसेट स्लॉट'],
  addSlot: ['Add a slot', 'स्लॉट जोड़ें'],
  slotName: ['Slot', 'स्लॉट'],
  kind: ['Kind', 'प्रकार'],
  defaultValue: ['Default', 'डिफ़ॉल्ट'],
  route: ['Default route', 'डिफ़ॉल्ट तरीका'],
  labelEn: ['Label (English)', 'लेबल (अंग्रेज़ी)'],
  labelHi: ['Label (Hindi)', 'लेबल (हिंदी)'],
  madeBy: ['Can be made by', 'इससे बन सकता है'],
  noStudio: ['No Studio for this kind', 'इस प्रकार के लिए कोई स्टूडियो नहीं'],
  template: ['Plan template', 'प्लान टेम्पलेट'],
  addTemplate: ['Add a template', 'टेम्पलेट जोड़ें'],
  uploadJson: ['Upload .json', '.json अपलोड करें'],
  checkStyle: ['Check the Style', 'स्टाइल जाँचें'],
  showFilled: ['Show filled template', 'भरा हुआ टेम्पलेट दिखाएँ'],
  addMissing: ['Add the missing ones', 'छूटे हुए जोड़ें'],
  removeUnused: ['Remove the unused ones', 'बेकार वाले हटाएँ'],
  slotsFound: ['Slots in the template', 'टेम्पलेट में स्लॉट'],
  slotList: ['Slot list', 'स्लॉट सूची'],
  interview: ['Interview', 'इंटरव्यू'],
  maxQuestions: ['Most questions', 'अधिकतम सवाल'],
  creativeUpgrade: [
    'Offer extra ideas (the upgrade step)',
    'अतिरिक्त आइडिया दें',
  ],
  questions: ['Questions', 'सवाल'],
  followUps: ['Follow-ups a model may ask', 'मॉडल के फ़ॉलो-अप'],
  add: ['Add', 'जोड़ें'],
  remove: ['Remove', 'हटाएँ'],
  projectStyle: ['Project style defaults', 'प्रोजेक्ट स्टाइल डिफ़ॉल्ट'],
  graphics: ['Graphics', 'ग्राफ़िक्स'],
  voice: ['Voice', 'आवाज़'],
  music: ['Music', 'संगीत'],
  availability: ['Availability by plan', 'प्लान के अनुसार उपलब्धता'],
  availabilityNote: [
    'No plan ticked means every plan. A person on a plan not ticked sees the Style locked with Upgrade.',
    'कोई प्लान न चुनने का मतलब हर प्लान। बिना चुने प्लान वाले व्यक्ति को स्टाइल लॉक और अपग्रेड के साथ दिखेगा।',
  ],
  statusTests: ['Status and tests', 'स्थिति और टेस्ट'],
  moveTo: ['Move to', 'बदलें'],
  overrideReason: [
    'Reason to skip the rule (1 to 600 characters, kept and shown)',
    'नियम छोड़ने का कारण (1 से 600 अक्षर, रखा और दिखाया जाता है)',
  ],
  topic: ['Topic', 'विषय'],
  date: ['Date', 'तारीख'],
  passed: ['Passed', 'पास'],
  note: ['Note', 'नोट'],
  video: ['Video', 'वीडियो'],
  addTest: ['Add a test', 'टेस्ट जोड़ें'],
  saveTests: ['Save the tests', 'टेस्ट सहेजें'],
  history: ['Versions', 'वर्ज़न'],
  when: ['When', 'कब'],
  who: ['Who', 'किसने'],
  changed: ['What changed', 'क्या बदला'],
  preview: ['Preview', 'देखें'],
  rollback: ['Roll back to this', 'इस पर वापस जाएँ'],
  saveNote: [
    'A note for this version (optional)',
    'इस वर्ज़न के लिए नोट (वैकल्पिक)',
  ],
  save: ['Save', 'सहेजें'],
  saved: ['Saved. Version {v} is live.', 'सहेजा गया। वर्ज़न {v} लाइव है।'],
  demoted: [
    'The template or slots changed, so the Style is Tested again (its tests are kept).',
    'टेम्पलेट या स्लॉट बदले, इसलिए स्टाइल फिर से टेस्टेड है (टेस्ट रखे गए)।',
  ],
  account: ['My user account', 'मेरा यूज़र अकाउंट'],
  accountNote: [
    'The email of your own account in the panel. Only its Projects are ever listed here; saving asks for your password and code once.',
    'पैनल में आपके अपने अकाउंट का ईमेल। यहाँ सिर्फ़ उसी के प्रोजेक्ट दिखते हैं; सहेजने पर एक बार पासवर्ड और कोड पूछा जाता है।',
  ],
  noAccount: ['Not set', 'तय नहीं'],
  listProjects: ['List my Projects', 'मेरे प्रोजेक्ट दिखाएँ'],
  margin: [
    'Cost margin (percent on top of the approved cost)',
    'कीमत मार्जिन (मंज़ूर कीमत के ऊपर प्रतिशत)',
  ],
  makeDraft: ['Make a Draft Style', 'ड्राफ़्ट स्टाइल बनाएँ'],
  noPlan: ['(no plan)', '(कोई प्लान नहीं)'],
  importAs: ['Import as', 'ऐसे लाएँ'],
  asCopy: ['a copy', 'कॉपी'],
  asVersion: ['a new version of the existing one', 'मौजूदा का नया वर्ज़न'],
  keepTests: ['Keep the existing tests', 'मौजूदा टेस्ट रखें'],
  cancel: ['Cancel', 'रद्द करें'],
  checkResult: ['Check result', 'जाँच का नतीजा'],
  firstDraft: [
    'First draft (no model, no media)',
    'पहला ड्राफ़्ट (बिना मॉडल, बिना मीडिया)',
  ],
  scenes: ['scenes', 'सीन'],
  layout: ['Layout check', 'लेआउट जाँच'],
  layoutOk: ['No layout problems.', 'कोई लेआउट समस्या नहीं।'],
  frameSketch: [
    'Frame sample (a sketch of scene 1: its background and text, not a rendered frame)',
    'फ़्रेम नमूना (सीन 1 का स्केच: बैकग्राउंड और टेक्स्ट, असली रेंडर नहीं)',
  ],
  allGood: ['The Style passes its checks.', 'स्टाइल अपनी जाँच में पास है।'],
  // Brief fields
  fieldsTitle: ['Brief fields', 'ब्रीफ़ फ़ील्ड'],
  fieldsIntro: [
    'The blocks the Brief card asks for and the video types that use them. Saved as one step; the Director and Claude read it at once.',
    'ब्रीफ़ कार्ड जो ब्लॉक पूछता है और उन्हें इस्तेमाल करने वाले वीडियो प्रकार। एक कदम में सहेजा जाता है; डायरेक्टर और Claude तुरंत पढ़ते हैं।',
  ],
  blocks: ['Field blocks', 'फ़ील्ड ब्लॉक'],
  addBlock: ['Add a block', 'ब्लॉक जोड़ें'],
  helpEn: ['Help (English)', 'मदद (अंग्रेज़ी)'],
  helpHi: ['Help (Hindi)', 'मदद (हिंदी)'],
  type: ['Type', 'प्रकार'],
  optionsEn: [
    'Options (value=English label, one per line)',
    'विकल्प (मान=अंग्रेज़ी लेबल, हर लाइन में एक)',
  ],
  optionsHi: [
    'Options in Hindi (value=Hindi label, one per line)',
    'हिंदी विकल्प (मान=हिंदी लेबल, हर लाइन में एक)',
  ],
  example: ['Example answer', 'उदाहरण उत्तर'],
  youDecide: ['"You decide" allowed', '"आप तय करें" की अनुमति'],
  usedBy: ['Used by', 'इस्तेमाल करने वाले'],
  types: ['Video types', 'वीडियो प्रकार'],
  addType: ['Add a type', 'प्रकार जोड़ें'],
  keywords: [
    'Words that mark this type (comma separated)',
    'इस प्रकार के शब्द (कॉमा से अलग)',
  ],
  typeBlocks: [
    'Blocks in order (id, then * for required, then :group)',
    'क्रम में ब्लॉक (id, ज़रूरी के लिए *, फिर :group)',
  ],
  playbook: ['Playbook', 'प्लेबुक'],
  fallback: ['Fallback type', 'डिफ़ॉल्ट प्रकार'],
  previewTitle: ['Preview: the Brief card', 'झलक: ब्रीफ़ कार्ड'],
  sampleMessage: ['A first message', 'पहला संदेश'],
  prefilled: ['Pre-filled', 'पहले से भरा'],
  stillMissing: [
    'Still asked (required first)',
    'अभी पूछा जाएगा (ज़रूरी पहले)',
  ],
  saveFields: ['Save Brief fields', 'ब्रीफ़ फ़ील्ड सहेजें'],
  required: ['Required', 'ज़रूरी'],
  // Director limits
  limitsTitle: ['Director limits', 'डायरेक्टर सीमाएँ'],
  limitsIntro: [
    'Every Director setting that had no screen, in one place. Each value is checked against its range before it is saved.',
    'डायरेक्टर की हर सेटिंग जिसकी कोई स्क्रीन नहीं थी, एक जगह। सहेजने से पहले हर मान की सीमा जाँची जाती है।',
  ],
  rewrites: ['Plan rewrites per video', 'हर वीडियो में प्लान दोबारा लिखना'],
  memory: ['Memory and context', 'मेमोरी और संदर्भ'],
  refusals: [
    'Refusals (what is out of scope and what a person reads)',
    'मना करना (क्या दायरे से बाहर है और व्यक्ति क्या पढ़ता है)',
  ],
  refusalWhen: ['When', 'कब'],
  refusalReply: ['Reply (English)', 'जवाब (अंग्रेज़ी)'],
  refusalReplyHi: ['Reply (Hindi)', 'जवाब (हिंदी)'],
  refusalWords: ['Words (comma separated)', 'शब्द (कॉमा से अलग)'],
  globalQuestions: [
    "The Styles' interview questions",
    'स्टाइल के इंटरव्यू सवाल',
  ],
  moods: ['Style chat moods', 'स्टाइल चैट मूड'],
  moodWords: ['Words', 'शब्द'],
  fonts: [
    'Fonts the Style chat may name (comma separated)',
    'स्टाइल चैट के फ़ॉन्ट (कॉमा से अलग)',
  ],
  lines: ["Director's fixed lines", 'डायरेक्टर की तय लाइनें'],
  lineKey: ['Key', 'कुंजी'],
  otherDirector: [
    'Other Director settings and where they are edited',
    'डायरेक्टर की बाकी सेटिंग और कहाँ बदलें',
  ],
  saveLimits: ['Save Director limits', 'डायरेक्टर सीमाएँ सहेजें'],
  outOfRange: [
    '{field} must be between {min} and {max}.',
    '{field} {min} और {max} के बीच होना चाहिए।',
  ],
  library: ['Library manager', 'लाइब्रेरी मैनेजर'],
  web: ['Web search and page reading', 'वेब खोज और पेज पढ़ना'],
  webOn: [
    'Director and Claude may search the web',
    'डायरेक्टर और Claude वेब खोज सकते हैं',
  ],
  allowed: [
    'Only these sites (comma separated; empty: any)',
    'सिर्फ़ ये साइट (कॉमा से अलग; खाली: कोई भी)',
  ],
  blocked: [
    'Never these sites (comma separated)',
    'ये साइट कभी नहीं (कॉमा से अलग)',
  ],
  searchProvider: ['Search provider id', 'खोज प्रोवाइडर id'],
  layoutRules: ['Layout check', 'लेआउट जाँच'],
  assetRules: [
    'Where media comes from (default)',
    'मीडिया कहाँ से आए (डिफ़ॉल्ट)',
  ],
  assetOrder: [
    'Order (mine, library, stock, ai; comma separated)',
    'क्रम (mine, library, stock, ai; कॉमा से अलग)',
  ],
  licences: [
    'Licences a build may pick on its own (empty: any)',
    'लाइसेंस जो बिल्ड खुद चुन सके (खाली: कोई भी)',
  ],
  orderBad: [
    'The order lists mine, library, stock and ai, each once.',
    'क्रम में mine, library, stock और ai, हर एक एक बार।',
  ],
} as const;
type Key = keyof typeof S;
const t = (k: Key, vars: Record<string, string | number> = {}) =>
  S[k][lang() === 'hi' ? 1 : 0].replace(/\{(\w+)\}/g, (w, n: string) =>
    n in vars ? String(vars[n]) : w,
  );

// ------------------------------------------------------------- helpers

type Ctx = AdminCtx;
const q = (_ctx: Ctx, url: string) =>
  `${url}${url.includes('?') ? '&' : '?'}lang=${lang()}`;
const say = (ctx: Ctx, text: string, ok: boolean) => {
  ctx.status.textContent = text;
  ctx.status.className = ok ? 'ok' : 'error';
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
function button(
  ctx: Ctx,
  label: string,
  run: () => Promise<string | void | null> | string | void | null,
  props: Record<string, string> = {},
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
  props: Record<string, string> = {},
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
  props: Record<string, string> = {},
) {
  const i = ctx.el('textarea', { rows: '4', ...props }) as HTMLTextAreaElement;
  i.value = value;
  i.oninput = () => set(i.value);
  return i;
}
function check(
  ctx: Ctx,
  value: boolean,
  set: (v: boolean) => void,
  props: Record<string, string> = {},
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
  props: Record<string, string> = {},
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
const card = (ctx: Ctx, title: string, ...kids: (Node | string)[]) =>
  ctx.el('section', { class: 'card' }, ctx.el('h2', {}, title), ...kids);
const sub = (ctx: Ctx, title: string, id: string, ...kids: (Node | string)[]) =>
  ctx.el(
    'details',
    { class: 'card', open: '', id },
    ctx.el('summary', {}, title),
    ...kids,
  );
function grid(
  ctx: Ctx,
  head: string[],
  rows: (Node | string)[][],
  id?: string,
) {
  return ctx.el(
    'table',
    id ? { id } : {},
    ctx.el(
      'thead',
      {},
      ctx.el('tr', {}, ...head.map((h) => ctx.el('th', {}, h))),
    ),
    ctx.el(
      'tbody',
      {},
      ...rows.map((r) =>
        ctx.el('tr', {}, ...r.map((c) => ctx.el('td', {}, c))),
      ),
    ),
  );
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const L = (en: string, hi = '') => (hi ? { en, hi } : { en });
const when = (iso: string) => new Date(iso).toLocaleString();
/** Reads a file the owner picked. */
const pickFile = (accept: string) =>
  new Promise<File | null>((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] ?? null);
    i.click();
  });
async function upload<T>(url: string, file: Blob, name: string): Promise<T> {
  const csrf = (
    (await (
      await fetch('/api/session', { credentials: 'same-origin' })
    ).json()) as {
      csrf: string;
    }
  ).csrf;
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrf,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
    },
    body: file,
  });
  const data = (await r.json()) as T & { error?: string; reauth?: boolean };
  if (!r.ok) {
    const e = new Error(data.error ?? 'Error') as Error & { reauth?: boolean };
    e.reauth = !!data.reauth;
    throw e;
  }
  return data;
}

// ------------------------------------------------------------------ Styles

interface Check {
  ok: boolean;
  errors: string[];
  warnings: string[];
  slots: {
    found: string[];
    missing: string[];
    unused: string[];
    messages: string[];
  } | null;
  legacy: boolean;
  passed: { n: number; m: number };
}
interface ListRow {
  style: Style;
  status: 'draft' | 'tested' | 'published';
  check: Check;
}
interface ListData {
  styles: ListRow[];
  deleted: { id: string; at: string; who: string; name: { en: string } }[];
  plans: { id: string; name: { en: string; hi?: string | undefined } }[];
  studios: { id: string; name: { en: string }; output: string }[];
  blocks: string[];
  account: { email: string; verifiedAt: string } | null;
}
let filter = 'all';
let editing: string | null = null;
let fromProject = false;

export async function stylesScreen(ctx: Ctx): Promise<HTMLElement> {
  const data = await ctx.api<ListData>('GET', q(ctx, '/api/styles'));
  if (editing !== null) return editScreen(ctx, data, editing);
  if (fromProject) return fromProjectScreen(ctx, data);
  const rows = data.styles.filter(
    (r) => filter === 'all' || r.status === filter,
  );
  const planName = (id: string) =>
    data.plans.find((p) => p.id === id)?.name[lang()] ??
    data.plans.find((p) => p.id === id)?.name.en ??
    id;
  const list = grid(
    ctx,
    [
      '',
      t('name'),
      t('status'),
      t('version'),
      t('tests'),
      t('order'),
      t('on'),
      t('plans'),
      t('checks'),
      '',
    ],
    rows.map((r) => {
      const s = r.style;
      const art = s.cardArt
        ? ctx.el('img', { src: s.cardArt, alt: '', width: '48', height: '27' })
        : ctx.el('span', { class: 'muted' }, '—');
      const statusChip = ctx.el(
        'span',
        { class: 'chip', 'data-status': r.status },
        r.check.legacy ? `${t(r.status)} · ${t('legacy')}` : t(r.status),
      );
      const warn = r.check.ok
        ? ctx.el('span', { class: 'ok', 'data-valid': s.id }, '✓')
        : ctx.el(
            'span',
            {
              class: 'error',
              'data-invalid': s.id,
              title: r.check.errors.join('\n'),
              role: 'img',
              'aria-label': t('invalid'),
            },
            '⚠',
          );
      const actions = ctx.el(
        'div',
        { class: 'bar' },
        button(
          ctx,
          t('edit'),
          () => {
            editing = s.id;
            ctx.refresh();
          },
          { 'data-edit': s.id },
        ),
        button(
          ctx,
          t('copy'),
          async () => {
            const out = await ctx.api<{ style: Style }>(
              'POST',
              q(ctx, '/api/styles/copy'),
              { id: s.id },
            );
            ctx.refresh();
            return out.style.id;
          },
          { 'data-copy': s.id },
        ),
        button(
          ctx,
          t('up'),
          async () => {
            await ctx.api('POST', q(ctx, '/api/styles/move'), {
              id: s.id,
              dir: 'up',
            });
            ctx.refresh();
          },
          { 'data-up': s.id },
        ),
        button(
          ctx,
          t('down'),
          async () => {
            await ctx.api('POST', q(ctx, '/api/styles/move'), {
              id: s.id,
              dir: 'down',
            });
            ctx.refresh();
          },
          { 'data-down': s.id },
        ),
        ctx.el(
          'a',
          {
            class: 'button',
            href: q(ctx, `/api/styles/${s.id}/export`),
            download: `${s.id}.aive-style.zip`,
            'data-export': s.id,
          },
          t('exportStyle'),
        ),
        button(
          ctx,
          t('del'),
          async () => {
            if (
              !confirm(
                t('stylesTitle') +
                  ': ' +
                  S.del[lang() === 'hi' ? 1 : 0] +
                  '?\n' +
                  deleteWarning(),
              )
            )
              return null;
            const out = await ctx.guarded(() =>
              ctx.api<{ note: string }>('POST', q(ctx, '/api/styles/delete'), {
                id: s.id,
              }),
            );
            if (!out) return null;
            ctx.refresh();
            return out.note;
          },
          { 'data-delete': s.id },
        ),
      );
      const on = check(
        ctx,
        s.enabled,
        async (v) => {
          try {
            await ctx.api('POST', q(ctx, '/api/styles/enable'), {
              id: s.id,
              enabled: v,
            });
            ctx.refresh();
          } catch (e) {
            say(ctx, msg(e), false);
          }
        },
        { 'data-enable': s.id },
      );
      return [
        art,
        ctx.el(
          'span',
          {},
          s.name[lang()] ?? s.name.en,
          s.publishOverride
            ? ctx.el(
                'small',
                { class: 'muted', 'data-override': s.id },
                ` (${t('override')}: ${s.publishOverride})`,
              )
            : '',
        ),
        statusChip,
        String(s.version ?? 1),
        `${r.check.passed.n} / ${r.check.passed.m}`,
        String(s.order),
        on,
        s.plans?.length ? s.plans.map(planName).join(', ') : t('allPlans'),
        warn,
        actions,
      ];
    }),
    'st-list',
  );
  // Each row carries its Style's id.
  list
    .querySelectorAll('tbody tr')
    .forEach((tr, i) => tr.setAttribute('data-style-row', rows[i]!.style.id));
  const filterBox = select(
    ctx,
    [
      ['all', t('all')],
      ['draft', t('draft')],
      ['tested', t('tested')],
      ['published', t('published')],
    ],
    filter,
    (v) => {
      filter = v;
      ctx.refresh();
    },
    { id: 'st-filter' },
  );
  const accountBox = input(ctx, data.account?.email ?? '', () => {}, {
    id: 'st-account',
    type: 'email',
  }) as HTMLInputElement;
  const deleted = data.deleted.length
    ? grid(
        ctx,
        [t('name'), t('when'), t('who'), ''],
        data.deleted.map((x) => [
          x.name.en,
          when(x.at),
          x.who,
          button(
            ctx,
            t('restore'),
            async () => {
              const out = await ctx.guarded(() =>
                ctx.api('POST', q(ctx, '/api/styles/restore'), { id: x.id }),
              );
              if (!out) return null;
              ctx.refresh();
              return x.id;
            },
            { 'data-restore': x.id },
          ),
        ]),
        'st-deleted',
      )
    : ctx.el('p', { class: 'muted', id: 'st-deleted' }, t('noDeleted'));
  return ctx.el(
    'div',
    { id: 'styles-tab' },
    card(
      ctx,
      t('stylesTitle'),
      ctx.el('p', { class: 'muted' }, t('stylesIntro')),
      ctx.el(
        'div',
        { class: 'bar' },
        field(ctx, t('filter'), filterBox),
        button(
          ctx,
          t('newStyle'),
          () => {
            editing = '';
            ctx.refresh();
          },
          { id: 'st-new', class: 'primary' },
        ),
        button(
          ctx,
          t('fromProject'),
          () => {
            fromProject = true;
            ctx.refresh();
          },
          { id: 'st-from' },
        ),
        button(
          ctx,
          t('importStyle'),
          async () => {
            const f = await pickFile('.zip,.json');
            if (!f) return null;
            return importStyle(ctx, f);
          },
          { id: 'st-import' },
        ),
      ),
      list,
    ),
    card(
      ctx,
      t('account'),
      ctx.el('p', { class: 'muted' }, t('accountNote')),
      ctx.el(
        'div',
        { class: 'bar' },
        field(ctx, t('account'), accountBox),
        button(
          ctx,
          t('save'),
          async () => {
            const out = await ctx.guarded(() =>
              ctx.api<{ account: { email: string } }>(
                'POST',
                q(ctx, '/api/styles/account'),
                { email: accountBox.value },
              ),
            );
            if (!out) return null;
            ctx.refresh();
            return out.account.email;
          },
          { id: 'st-account-save' },
        ),
      ),
    ),
    card(ctx, t('deletedTitle'), deleted),
  );
}
const deleteWarning = () =>
  lang() === 'hi'
    ? 'यह स्टाइल हटाने पर यह सबसे छिप जाएगा। इससे बने प्रोजेक्ट चलते रहेंगे। आप इसे "हटाए गए" सूची से वापस ला सकते हैं।'
    : 'Deleting this Style hides it from everyone. Projects already made from it keep working. You can restore it from the Deleted list.';

async function importStyle(
  ctx: Ctx,
  f: File,
  mode = '',
): Promise<string | null> {
  try {
    const out = await ctx.guarded(() =>
      upload<{ style: Style }>(
        q(ctx, `/api/styles/import${mode}`),
        f,
        f.name,
      ).catch((e: Error & { reauth?: boolean }) => {
        if (e.reauth)
          throw Object.assign(new Error(e.message), {
            reauth: true,
            status: 403,
          });
        throw e;
      }),
    );
    if (!out) return null;
    ctx.refresh();
    return out.style.id;
  } catch (e) {
    const text = msg(e);
    if (!/already exists/.test(text) && !/पहले से है/.test(text)) throw e;
    // The id clash: ask, never overwrite silently.
    return new Promise((resolve) => {
      const keep = ctx.el('input', { type: 'checkbox', id: 'st-import-keep' });
      const dialog = ctx.el(
        'dialog',
        { id: 'st-import-clash' },
        ctx.el('p', {}, text),
        field(ctx, t('keepTests'), keep),
        ctx.el(
          'div',
          { class: 'bar' },
          button(
            ctx,
            t('asCopy'),
            async () => {
              dialog.remove();
              resolve(await importStyle(ctx, f, '?mode=copy'));
            },
            { id: 'st-import-copy' },
          ),
          button(
            ctx,
            t('asVersion'),
            async () => {
              dialog.remove();
              resolve(
                await importStyle(
                  ctx,
                  f,
                  `?mode=version${keep.checked ? '&keepTests=1' : ''}`,
                ),
              );
            },
            { id: 'st-import-version' },
          ),
          button(ctx, t('cancel'), () => {
            dialog.remove();
            resolve(null);
          }),
        ),
      ) as HTMLDialogElement;
      document.body.append(dialog);
      dialog.showModal();
    });
  }
}

// -------------------------------------------------------------- the editor

const blankStyle = (): Style =>
  ({
    id: 'new-style',
    name: { en: 'New Style', hi: 'नया स्टाइल' },
    blurb: { en: '', hi: '' },
    playbook: '',
    playbookText: '',
    enabled: true,
    status: 'draft',
    cardArt: '',
    formats: ['16:9'],
    requires: [],
    brief: { fields: [], groups: [] },
    interview: {
      maxQuestions: 5,
      questions: [],
      creativeUpgrade: true,
      followUps: [],
    },
    order: 100,
    version: 1,
    slots: [],
    inputs: [],
    looks: [],
    kit: { notes: '', blocks: [] },
    tests: [],
  }) as unknown as Style;
const TEMPLATE_STARTER = {
  format: 'video-plan',
  version: 4,
  meta: { title: '{{topic}}', language: 'en', aspect: '16:9', fps: 30 },
  captions: { enabled: false },
  scenes: [
    {
      id: 'open',
      title: '{{topic}}',
      narration: 'A short video about {{topic}}.',
      durationHint: 4,
      notes: 'method:library',
      layers: [{ id: 't', kind: 'title', text: '{{topic}}', anchor: 'center' }],
    },
  ],
};

async function editScreen(
  ctx: Ctx,
  data: ListData,
  id: string,
): Promise<HTMLElement> {
  const isNew = id === '';
  const loaded = isNew
    ? {
        style: blankStyle(),
        check: null as Check | null,
        history: [] as {
          version: number;
          at: string;
          who: string;
          note: string;
          changed: string[];
        }[],
      }
    : await ctx.api<{
        style: Style;
        check: Check;
        history: {
          version: number;
          at: string;
          who: string;
          note: string;
          changed: string[];
        }[];
      }>('GET', q(ctx, `/api/styles/${id}`));
  const st = clone(loaded.style) as Style & Record<string, unknown>;
  const result = ctx.el('div', { id: 'st-result' });
  const showCheck = (
    c: Check & {
      filled?: unknown;
      draft?: { scenes: number; names: string[]; errors?: string[] } | null;
      layout?: string[];
      sketch?: string;
      note?: string;
    },
  ) => {
    result.replaceChildren(
      ctx.el('h3', {}, t('checkResult')),
      c.ok
        ? ctx.el('p', { class: 'ok', id: 'st-check-ok' }, t('allGood'))
        : ctx.el(
            'ul',
            { class: 'error', id: 'st-errors' },
            ...c.errors.map((e) => ctx.el('li', {}, e)),
          ),
      ...(c.warnings.length
        ? [
            ctx.el(
              'ul',
              { class: 'muted', id: 'st-warnings' },
              ...c.warnings.map((e) => ctx.el('li', {}, e)),
            ),
          ]
        : []),
      ...(c.note ? [ctx.el('p', { class: 'muted' }, c.note)] : []),
      ...(c.draft
        ? [
            ctx.el('h4', {}, t('firstDraft')),
            ctx.el(
              'p',
              { id: 'st-draft' },
              c.draft.errors?.length
                ? c.draft.errors.join(' ')
                : `${c.draft.scenes} ${t('scenes')}: ${c.draft.names.join(', ')}`,
            ),
          ]
        : []),
      ...(c.layout
        ? [
            ctx.el('h4', {}, t('layout')),
            ctx.el(
              'p',
              { id: 'st-layout' },
              c.layout.length ? c.layout.join(' ') : t('layoutOk'),
            ),
          ]
        : []),
      ...(c.sketch
        ? [
            ctx.el('h4', {}, t('frameSketch')),
            Object.assign(
              ctx.el('img', { id: 'st-sketch', alt: t('frameSketch') }),
              {
                src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.sketch)}`,
              },
            ),
          ]
        : []),
    );
  };
  if (loaded.check) showCheck(loaded.check);
  const L2 = (
    o: { en: string; hi?: string | undefined } | undefined,
    k: 'en' | 'hi',
    v: string,
  ) => ({ ...(o ?? { en: '' }), [k]: v });
  // ------------------------------------------------------------- basics
  const formats = (['16:9', '9:16', '1:1', '4:5'] as const).map((f) =>
    field(
      ctx,
      f,
      check(
        ctx,
        st.formats.includes(f),
        (v) => {
          st.formats = v
            ? [...new Set([...st.formats, f])]
            : st.formats.filter((x) => x !== f);
        },
        { 'data-format': f },
      ),
    ),
  );
  const basics = sub(
    ctx,
    t('basics'),
    'st-basics',
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('id'),
        input(ctx, st.id, (v) => (st.id = v.trim()), { id: 'st-id' }),
      ),
      field(
        ctx,
        t('nameEn'),
        input(
          ctx,
          st.name.en,
          (v) => (st.name = L2(st.name, 'en', v) as Style['name']),
          { id: 'st-name-en' },
        ),
      ),
      field(
        ctx,
        t('nameHi'),
        input(
          ctx,
          st.name.hi ?? '',
          (v) => (st.name = L2(st.name, 'hi', v) as Style['name']),
          { id: 'st-name-hi' },
        ),
      ),
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('blurbEn'),
        area(
          ctx,
          st.blurb.en,
          (v) => (st.blurb = L2(st.blurb, 'en', v) as Style['blurb']),
          { id: 'st-blurb-en', rows: '2' },
        ),
      ),
      field(
        ctx,
        t('blurbHi'),
        area(
          ctx,
          st.blurb.hi ?? '',
          (v) => (st.blurb = L2(st.blurb, 'hi', v) as Style['blurb']),
          { id: 'st-blurb-hi', rows: '2' },
        ),
      ),
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('cardArt'),
        input(ctx, st.cardArt, (v) => (st.cardArt = v.trim()), {
          id: 'st-art',
        }),
      ),
      field(
        ctx,
        t('requires'),
        input(
          ctx,
          st.requires.join(', '),
          (v) =>
            (st.requires = v
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)),
          { id: 'st-requires' },
        ),
      ),
    ),
    ctx.el(
      'div',
      { class: 'row' },
      ctx.el('span', {}, t('formats')),
      ...formats,
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('costMin'),
        input(
          ctx,
          String(st.priceHint?.min ?? ''),
          (v) =>
            (st.priceHint = {
              min: Number(v) || 0,
              max: st.priceHint?.max ?? 0,
              per: st.priceHint?.per ?? 'video',
            }),
          { id: 'st-cost-min', type: 'number' },
        ),
      ),
      field(
        ctx,
        t('costMax'),
        input(
          ctx,
          String(st.priceHint?.max ?? ''),
          (v) =>
            (st.priceHint = {
              min: st.priceHint?.min ?? 0,
              max: Number(v) || 0,
              per: st.priceHint?.per ?? 'video',
            }),
          { id: 'st-cost-max', type: 'number' },
        ),
      ),
      field(
        ctx,
        t('costPer'),
        input(
          ctx,
          st.priceHint?.per ?? 'video',
          (v) =>
            (st.priceHint = {
              min: st.priceHint?.min ?? 0,
              max: st.priceHint?.max ?? 0,
              per: v,
            }),
          { id: 'st-cost-per' },
        ),
      ),
    ),
  );
  // ------------------------------------------------------------- sample
  const player = ctx.el('div', { id: 'st-sample-preview' });
  const drawSample = () =>
    player.replaceChildren(
      ...(st.sample?.video
        ? [
            Object.assign(ctx.el('video', { controls: '', width: '320' }), {
              src: st.sample.video,
              poster: st.sample.poster,
            }),
          ]
        : []),
    );
  drawSample();
  const sampleUp = (kind: 'video' | 'poster', accept: string) =>
    button(
      ctx,
      kind === 'video' ? t('sampleVideo') : t('samplePoster'),
      async () => {
        const f = await pickFile(accept);
        if (!f) return null;
        const out = await upload<{ url: string }>(
          q(
            ctx,
            `/api/styles/sample?id=${encodeURIComponent(st.id)}&name=${encodeURIComponent(f.name)}`,
          ),
          f,
          f.name,
        );
        st.sample = {
          video: st.sample?.video ?? '',
          poster: st.sample?.poster ?? '',
          [kind]: out.url,
        };
        drawSample();
        return out.url;
      },
      { id: `st-sample-${kind}` },
    );
  const sample = sub(
    ctx,
    t('sample'),
    'st-sample',
    ctx.el(
      'div',
      { class: 'bar' },
      sampleUp('video', 'video/mp4,video/webm'),
      sampleUp('poster', 'image/png,image/jpeg,image/webp'),
    ),
    ctx.el('p', { class: 'muted' }, t('posterNote')),
    player,
  );
  // ------------------------------------------------------------ fields
  const briefBox = ctx.el('div', { id: 'st-brief' });
  const drawBrief = () =>
    briefBox.replaceChildren(
      fieldRows(
        ctx,
        st.brief.fields as unknown as Row[],
        'st-field',
        drawBrief,
      ),
      button(
        ctx,
        t('addField'),
        () => {
          (st.brief.fields as unknown as Row[]).push({
            id: `field-${st.brief.fields.length + 1}`,
            label: { en: '' },
            type: 'text',
            required: false,
            options: [],
          });
          drawBrief();
        },
        { id: 'st-field-add' },
      ),
    );
  drawBrief();
  // ------------------------------------------------------------ inputs
  const inputs = (['photo', 'pdf', 'link', 'script'] as const).map((k) =>
    field(
      ctx,
      k,
      check(
        ctx,
        (st.inputs ?? []).includes(k),
        (v) => {
          st.inputs = v
            ? [...new Set([...(st.inputs ?? []), k])]
            : (st.inputs ?? []).filter((x) => x !== k);
        },
        { 'data-input': k },
      ),
    ),
  );
  // ------------------------------------------------------------- rules
  const reads = ctx.el('pre', { id: 'st-rules-preview' }, st.playbookText);
  const counter = ctx.el(
    'small',
    { class: 'muted', id: 'st-rules-count' },
    `${st.playbookText.length} / 8000`,
  );
  const rules = sub(
    ctx,
    t('scriptRules'),
    'st-rules',
    area(
      ctx,
      st.playbookText,
      (v) => {
        st.playbookText = v;
        counter.textContent = `${v.length} / 8000`;
        counter.className = v.length > 8000 ? 'error' : 'muted';
        reads.textContent = v;
      },
      { id: 'st-rules-text', rows: '6' },
    ),
    counter,
    ctx.el('h4', {}, t('plannerReads')),
    reads,
  );
  // ------------------------------------------------------------- looks
  const looksBox = ctx.el('div', { id: 'st-looks' });
  const drawLooks = () => {
    const looks = (st.looks ??= []);
    looksBox.replaceChildren(
      ...looks.map((l, i) =>
        ctx.el(
          'div',
          { class: 'row card compact', 'data-look': String(i) },
          field(
            ctx,
            t('id'),
            input(ctx, l.id, (v) => (l.id = v.trim()), {
              id: `st-look-id-${i}`,
            }),
          ),
          field(
            ctx,
            t('nameEn'),
            input(
              ctx,
              l.name.en,
              (v) => (l.name = L2(l.name, 'en', v) as typeof l.name),
              { id: `st-look-en-${i}` },
            ),
          ),
          field(
            ctx,
            t('nameHi'),
            input(
              ctx,
              l.name.hi ?? '',
              (v) => (l.name = L2(l.name, 'hi', v) as typeof l.name),
              { id: `st-look-hi-${i}` },
            ),
          ),
          field(
            ctx,
            t('palette'),
            ctx.el(
              'span',
              { class: 'bar' },
              ...l.palette.map((c, j) => {
                const p = ctx.el('input', {
                  type: 'color',
                  'data-colour': `${i}-${j}`,
                });
                p.value = c;
                p.oninput = () => (l.palette[j] = p.value);
                return p;
              }),
              button(ctx, '+', () => {
                if (l.palette.length < 8) l.palette.push('#ffffff');
                drawLooks();
              }),
              button(ctx, '−', () => {
                if (l.palette.length > 1) l.palette.pop();
                drawLooks();
              }),
            ),
          ),
          field(
            ctx,
            t('headingFont'),
            input(ctx, l.headingFont, (v) => (l.headingFont = v), {
              id: `st-look-head-${i}`,
            }),
          ),
          field(
            ctx,
            t('bodyFont'),
            input(ctx, l.bodyFont, (v) => (l.bodyFont = v), {
              id: `st-look-body-${i}`,
            }),
          ),
          field(
            ctx,
            t('captionStyle'),
            input(ctx, l.captionStyle, (v) => (l.captionStyle = v), {
              id: `st-look-cap-${i}`,
            }),
          ),
          !l.name.hi?.trim() || l.name.hi === l.name.en
            ? ctx.el(
                'small',
                { class: 'muted', 'data-look-warning': String(i) },
                lookNoHindi(),
              )
            : '',
          button(ctx, t('remove'), () => {
            looks.splice(i, 1);
            drawLooks();
          }),
        ),
      ),
      looks.length < 4
        ? button(
            ctx,
            t('addLook'),
            () => {
              looks.push({
                id: `look-${looks.length + 1}`,
                name: { en: `Look ${looks.length + 1}` },
                palette: ['#101219', '#ffffff', '#6d5efc'],
                headingFont: 'Inter',
                bodyFont: 'Inter',
                captionStyle: 'clean',
              });
              drawLooks();
            },
            { id: 'st-look-add' },
          )
        : '',
    );
  };
  drawLooks();
  // --------------------------------------------------------------- kit
  const kit = (st.kit ??= { notes: '', blocks: [] });
  const kitPick = ctx.el('select', {
    multiple: '',
    id: 'st-kit-blocks',
    size: '6',
  });
  for (const b of [
    ...new Set([...data.blocks, ...(kit.items ?? []).map((x) => x.id)]),
  ]) {
    const o = ctx.el('option', { value: b }, b);
    if (kit.blocks.includes(b)) o.selected = true;
    kitPick.append(o);
  }
  kitPick.onchange = () =>
    (kit.blocks = [...kitPick.selectedOptions].map((o) => o.value));
  const kitCard = sub(
    ctx,
    t('kit'),
    'st-kit',
    field(
      ctx,
      t('kitNotes'),
      area(ctx, kit.notes, (v) => (kit.notes = v), {
        id: 'st-kit-notes',
        rows: '2',
      }),
    ),
    field(ctx, t('kitBlocks'), kitPick),
  );
  // ------------------------------------------------------------- slots
  const slotsBox = ctx.el('div', { id: 'st-slots' });
  const studioFor = (kind: string) => {
    const out =
      kind === 'image'
        ? 'image'
        : kind === 'video'
          ? 'video'
          : kind === 'audio'
            ? 'audio'
            : null;
    if (!out) return '';
    const s = data.studios.filter((x) => x.output === out);
    return s.length ? s.map((x) => x.name.en).join(', ') : t('noStudio');
  };
  const drawSlots = () => {
    const slots = (st.slots ??= []);
    slotsBox.replaceChildren(
      grid(
        ctx,
        [
          t('slotName'),
          t('kind'),
          t('defaultValue'),
          t('route'),
          t('labelEn'),
          t('labelHi'),
          t('madeBy'),
          '',
        ],
        slots.map((sl, i) => [
          input(ctx, sl.name, (v) => (sl.name = v.trim()), {
            id: `st-slot-name-${i}`,
          }),
          select(
            ctx,
            ['text', 'image', 'video', 'audio', 'choice'].map(
              (x) => [x, x] as const,
            ),
            sl.kind,
            (v) => {
              sl.kind = v as typeof sl.kind;
              drawSlots();
            },
            { id: `st-slot-kind-${i}` },
          ),
          input(ctx, sl.default, (v) => (sl.default = v), {
            id: `st-slot-default-${i}`,
          }),
          select(
            ctx,
            ['make', 'upload', 'prompt', 'library', 'later'].map(
              (x) => [x, x] as const,
            ),
            sl.route,
            (v) => (sl.route = v as typeof sl.route),
            { id: `st-slot-route-${i}` },
          ),
          input(
            ctx,
            sl.label?.en ?? '',
            (v) => (sl.label = L2(sl.label, 'en', v) as typeof sl.label),
            { id: `st-slot-en-${i}` },
          ),
          input(
            ctx,
            sl.label?.hi ?? '',
            (v) => (sl.label = L2(sl.label, 'hi', v) as typeof sl.label),
            { id: `st-slot-hi-${i}` },
          ),
          ctx.el('small', { 'data-slot-studio': sl.name }, studioFor(sl.kind)),
          button(ctx, t('remove'), () => {
            slots.splice(i, 1);
            drawSlots();
          }),
        ]),
        'st-slot-table',
      ),
      button(
        ctx,
        t('addSlot'),
        () => {
          slots.push({
            name: `slot-${slots.length + 1}`,
            kind: 'text',
            default: '',
            route: 'later',
          });
          drawSlots();
        },
        { id: 'st-slot-add' },
      ),
    );
  };
  drawSlots();
  // ---------------------------------------------------------- template
  const tplText = ctx.el('textarea', {
    id: 'st-template',
    rows: '12',
  }) as HTMLTextAreaElement;
  tplText.value = st.planTemplate
    ? JSON.stringify(st.planTemplate, null, 2)
    : '';
  const slotView = ctx.el('div', { id: 'st-slot-report' });
  const readTpl = async () => {
    if (!tplText.value.trim()) {
      delete (st as { planTemplate?: unknown }).planTemplate;
      slotView.replaceChildren();
      return null;
    }
    const r = await ctx.api<{
      template: Record<string, unknown>;
      slots: {
        found: string[];
        missing: string[];
        unused: string[];
        messages: string[];
      };
    }>('POST', q(ctx, '/api/styles/template'), {
      text: tplText.value,
      slots: st.slots ?? [],
    });
    st.planTemplate = r.template;
    slotView.replaceChildren(
      ctx.el(
        'p',
        {},
        `${t('slotsFound')}: ${r.slots.found.join(', ') || '—'} · ${t('slotList')}: ${(st.slots ?? []).map((s) => s.name).join(', ') || '—'}`,
      ),
      ...(r.slots.messages.length
        ? [
            ctx.el(
              'ul',
              { class: 'error', id: 'st-slot-messages' },
              ...r.slots.messages.map((m) => ctx.el('li', {}, m)),
            ),
          ]
        : []),
    );
    return r.slots;
  };
  const legacy = !isNew && st.status === undefined && !st.planTemplate;
  const tplCard = sub(
    ctx,
    t('template'),
    'st-template-card',
    legacy ? ctx.el('p', { class: 'muted', id: 'st-legacy' }, t('legacy')) : '',
    legacy
      ? button(
          ctx,
          t('addTemplate'),
          () => {
            tplText.value = JSON.stringify(TEMPLATE_STARTER, null, 2);
            tplText.focus();
          },
          { id: 'st-add-template' },
        )
      : '',
    tplText,
    ctx.el(
      'div',
      { class: 'bar' },
      button(
        ctx,
        t('uploadJson'),
        async () => {
          const f = await pickFile('.json,application/json');
          if (!f) return null;
          tplText.value = await f.text();
          await readTpl();
          return f.name;
        },
        { id: 'st-template-upload' },
      ),
      button(
        ctx,
        t('addMissing'),
        async () => {
          const r = await readTpl();
          for (const n of r?.missing ?? [])
            (st.slots ??= []).push({
              name: n,
              kind: 'text',
              default: n,
              route: 'later',
            });
          drawSlots();
          await readTpl();
        },
        { id: 'st-slots-add-missing' },
      ),
      button(
        ctx,
        t('removeUnused'),
        async () => {
          const r = await readTpl();
          st.slots = (st.slots ?? []).filter(
            (s) => !(r?.unused ?? []).includes(s.name),
          );
          drawSlots();
          await readTpl();
        },
        { id: 'st-slots-remove-unused' },
      ),
      button(
        ctx,
        t('checkStyle'),
        async () => {
          await readTpl();
          showCheck(
            await ctx.api('POST', q(ctx, '/api/styles/check'), { style: st }),
          );
        },
        { id: 'st-check' },
      ),
      button(
        ctx,
        t('showFilled'),
        async () => {
          await readTpl();
          const c = await ctx.api<{ filled: unknown }>(
            'POST',
            q(ctx, '/api/styles/check'),
            { style: st },
          );
          result.replaceChildren(
            ctx.el(
              'pre',
              { id: 'st-filled' },
              JSON.stringify(c.filled, null, 2),
            ),
          );
        },
        { id: 'st-show-filled' },
      ),
    ),
    slotView,
  );
  // ---------------------------------------------------------- interview
  const iv = st.interview;
  const ivBox = ctx.el('div', { id: 'st-interview-list' });
  const drawIv = () =>
    ivBox.replaceChildren(
      ctx.el('h4', {}, t('questions')),
      ...iv.questions.map((x, i) =>
        ctx.el(
          'div',
          { class: 'row' },
          input(ctx, x.id, (v) => (x.id = v), { id: `st-q-id-${i}` }),
          input(
            ctx,
            x.ask.en,
            (v) => (x.ask = L2(x.ask, 'en', v) as typeof x.ask),
            { id: `st-q-en-${i}` },
          ),
          input(
            ctx,
            x.ask.hi ?? '',
            (v) => (x.ask = L2(x.ask, 'hi', v) as typeof x.ask),
            { id: `st-q-hi-${i}` },
          ),
          button(ctx, t('remove'), () => {
            iv.questions.splice(i, 1);
            drawIv();
          }),
        ),
      ),
      button(
        ctx,
        t('add'),
        () => {
          iv.questions.push({
            id: `q${iv.questions.length + 1}`,
            ask: { en: '' },
            answers: [],
            allowFreeText: true,
            order: iv.questions.length,
          });
          drawIv();
        },
        { id: 'st-q-add' },
      ),
      ctx.el('h4', {}, t('followUps')),
      ...iv.followUps.map((x, i) =>
        ctx.el(
          'div',
          { class: 'row' },
          input(ctx, x.id, (v) => (x.id = v), {}),
          input(
            ctx,
            x.ask.en,
            (v) => (x.ask = L2(x.ask, 'en', v) as typeof x.ask),
            {},
          ),
          input(
            ctx,
            x.ask.hi ?? '',
            (v) => (x.ask = L2(x.ask, 'hi', v) as typeof x.ask),
            {},
          ),
          button(ctx, t('remove'), () => {
            iv.followUps.splice(i, 1);
            drawIv();
          }),
        ),
      ),
      button(ctx, t('add'), () => {
        iv.followUps.push({
          id: `f${iv.followUps.length + 1}`,
          ask: { en: '' },
        });
        drawIv();
      }),
    );
  drawIv();
  const interview = sub(
    ctx,
    t('interview'),
    'st-interview',
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('maxQuestions'),
        input(
          ctx,
          String(iv.maxQuestions),
          (v) =>
            (iv.maxQuestions = Math.max(
              0,
              Math.min(20, Math.trunc(Number(v) || 0)),
            )),
          { id: 'st-max-q', type: 'number' },
        ),
      ),
      field(
        ctx,
        t('creativeUpgrade'),
        check(ctx, iv.creativeUpgrade, (v) => (iv.creativeUpgrade = v), {
          id: 'st-upgrade',
        }),
      ),
    ),
    ivBox,
  );
  // ------------------------------------------------------ project style
  const ps = (st.projectStyle ??= {
    palette: [],
    headingFont: '',
    bodyFont: '',
    captionStyle: '',
  });
  const projectStyle = sub(
    ctx,
    t('projectStyle'),
    'st-project-style',
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('palette'),
        input(
          ctx,
          ps.palette.join(', '),
          (v) =>
            (ps.palette = v
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)),
          { id: 'st-ps-palette' },
        ),
      ),
      field(
        ctx,
        t('headingFont'),
        input(ctx, ps.headingFont, (v) => (ps.headingFont = v), {
          id: 'st-ps-head',
        }),
      ),
      field(
        ctx,
        t('bodyFont'),
        input(ctx, ps.bodyFont, (v) => (ps.bodyFont = v), { id: 'st-ps-body' }),
      ),
      field(
        ctx,
        t('captionStyle'),
        input(ctx, ps.captionStyle, (v) => (ps.captionStyle = v), {
          id: 'st-ps-cap',
        }),
      ),
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(
        ctx,
        t('graphics'),
        input(
          ctx,
          ps.graphics?.en ?? '',
          (v) => (ps.graphics = v ? L(v) : undefined),
          { id: 'st-ps-graphics' },
        ),
      ),
      field(
        ctx,
        t('voice'),
        input(
          ctx,
          ps.voice?.en ?? '',
          (v) => (ps.voice = v ? L(v) : undefined),
          { id: 'st-ps-voice' },
        ),
      ),
      field(
        ctx,
        t('music'),
        input(
          ctx,
          ps.music?.en ?? '',
          (v) => (ps.music = v ? L(v) : undefined),
          { id: 'st-ps-music' },
        ),
      ),
      field(
        ctx,
        t('scriptRules'),
        input(
          ctx,
          ps.scriptRules?.en ?? '',
          (v) => (ps.scriptRules = v ? L(v) : undefined),
          { id: 'st-ps-rules' },
        ),
      ),
    ),
  );
  // ------------------------------------------------------- availability
  const availability = sub(
    ctx,
    t('availability'),
    'st-availability',
    ctx.el('p', { class: 'muted' }, t('availabilityNote')),
    ctx.el(
      'div',
      { class: 'row' },
      ...data.plans.map((p) =>
        field(
          ctx,
          p.name[lang()] ?? p.name.en,
          check(
            ctx,
            (st.plans ?? []).includes(p.id),
            (v) => {
              st.plans = v
                ? [...new Set([...(st.plans ?? []), p.id])]
                : (st.plans ?? []).filter((x) => x !== p.id);
            },
            { 'data-plan': p.id },
          ),
        ),
      ),
    ),
  );
  // --------------------------------------------------- status and tests
  const overrideBox = area(ctx, st.publishOverride ?? '', () => {}, {
    id: 'st-override',
    rows: '2',
    maxlength: '600',
  }) as HTMLTextAreaElement;
  const testsBox = ctx.el('div', { id: 'st-tests' });
  const drawTests = () => {
    const tests = (st.tests ??= []);
    testsBox.replaceChildren(
      grid(
        ctx,
        [t('topic'), t('date'), t('passed'), t('note'), t('video')],
        tests.map((x, i) => [
          input(ctx, x.topic, (v) => (x.topic = v), {
            id: `st-test-topic-${i}`,
          }),
          input(ctx, x.date, (v) => (x.date = v), {
            id: `st-test-date-${i}`,
            type: 'date',
          }),
          check(ctx, x.passed, (v) => (x.passed = v), {
            id: `st-test-passed-${i}`,
          }),
          input(ctx, x.note ?? '', (v) => (x.note = v), {
            id: `st-test-note-${i}`,
          }),
          input(ctx, x.videoId ?? '', (v) => (x.videoId = v), {
            id: `st-test-video-${i}`,
          }),
        ]),
        'st-test-table',
      ),
      button(
        ctx,
        t('addTest'),
        () => {
          tests.push({
            topic: '',
            date: new Date().toISOString().slice(0, 10),
            passed: true,
          });
          drawTests();
        },
        { id: 'st-test-add' },
      ),
      isNew
        ? ''
        : button(
            ctx,
            t('saveTests'),
            async () => {
              const out = await ctx.api<{ style: Style }>(
                'POST',
                q(ctx, '/api/styles/tests'),
                { id: st.id, tests: st.tests },
              );
              editing = out.style.id;
              ctx.refresh();
              return t('saved', { v: out.style.version ?? 1 });
            },
            { id: 'st-tests-save' },
          ),
    );
  };
  drawTests();
  const mover = (to: 'draft' | 'tested' | 'published') =>
    button(
      ctx,
      `${t('moveTo')} ${t(to)}`,
      async () => {
        const out = await ctx.guarded(() =>
          ctx.api<{ style: Style }>('POST', q(ctx, '/api/styles/status'), {
            id: st.id,
            to,
            override: overrideBox.value,
          }),
        );
        if (!out) return null;
        ctx.refresh();
        return t('saved', { v: out.style.version ?? 1 });
      },
      { id: `st-to-${to}` },
    );
  const status = sub(
    ctx,
    t('statusTests'),
    'st-status',
    ctx.el(
      'p',
      {},
      `${t('status')}: `,
      ctx.el(
        'strong',
        { id: 'st-status-now' },
        t((st.status ?? 'published') as 'draft'),
      ),
    ),
    isNew
      ? ''
      : ctx.el(
          'div',
          { class: 'bar' },
          mover('draft'),
          mover('tested'),
          mover('published'),
        ),
    field(ctx, t('overrideReason'), overrideBox),
    testsBox,
  );
  // ------------------------------------------------------------ history
  const history = isNew
    ? ''
    : sub(
        ctx,
        t('history'),
        'st-history',
        grid(
          ctx,
          [t('version'), t('when'), t('who'), t('note'), t('changed'), ''],
          loaded.history
            .slice()
            .reverse()
            .map((v) => [
              String(v.version),
              when(v.at),
              v.who,
              v.note,
              v.changed.join(', '),
              ctx.el(
                'div',
                { class: 'bar' },
                button(
                  ctx,
                  t('preview'),
                  async () => {
                    const full = await ctx.api<{ snapshot: unknown }>(
                      'GET',
                      q(ctx, `/api/styles/${st.id}/versions/${v.version}`),
                    );
                    result.replaceChildren(
                      ctx.el(
                        'pre',
                        { id: 'st-version-preview' },
                        JSON.stringify(full.snapshot, null, 2),
                      ),
                    );
                  },
                  { 'data-preview': String(v.version) },
                ),
                button(
                  ctx,
                  t('rollback'),
                  async () => {
                    const out = await ctx.guarded(() =>
                      ctx.api<{ style: Style }>(
                        'POST',
                        q(ctx, '/api/styles/rollback'),
                        { id: st.id, version: v.version },
                      ),
                    );
                    if (!out) return null;
                    ctx.refresh();
                    return t('saved', { v: out.style.version ?? 1 });
                  },
                  { 'data-rollback': String(v.version) },
                ),
              ),
            ]),
          'st-history-table',
        ),
      );
  // --------------------------------------------------------------- save
  const note = input(ctx, '', () => {}, {
    id: 'st-note',
    maxlength: '200',
  }) as HTMLInputElement;
  const save = button(
    ctx,
    t('save'),
    async () => {
      if (tplText.value.trim()) await readTpl();
      else delete (st as { planTemplate?: unknown }).planTemplate;
      if (!st.slots?.length && !st.planTemplate)
        delete (st as { slots?: unknown }).slots;
      if (!st.looks?.length) delete (st as { looks?: unknown }).looks;
      if (!st.plans?.length) delete (st as { plans?: unknown }).plans;
      const out = await ctx.guarded(() =>
        ctx.api<{ style: Style; demoted: boolean; check: Check }>(
          'POST',
          q(ctx, '/api/styles/save'),
          {
            style: st,
            id: isNew ? '' : id,
            isNew,
            note: note.value,
            override: overrideBox.value,
          },
        ),
      );
      if (!out) return null;
      editing = out.style.id;
      ctx.refresh();
      return `${t('saved', { v: out.style.version ?? 1 })}${out.demoted ? ` ${t('demoted')}` : ''}`;
    },
    { id: 'st-save', class: 'primary' },
  );
  return ctx.el(
    'div',
    { id: 'style-editor', 'data-editing': st.id },
    ctx.el(
      'div',
      { class: 'bar' },
      button(
        ctx,
        t('back'),
        () => {
          editing = null;
          ctx.refresh();
        },
        { id: 'st-back' },
      ),
      ctx.el('h2', { class: 'grow' }, st.name[lang()] ?? st.name.en),
    ),
    basics,
    sample,
    sub(ctx, t('briefFields'), 'st-brief-card', briefBox),
    sub(
      ctx,
      t('inputs'),
      'st-inputs',
      ctx.el('div', { class: 'row' }, ...inputs),
    ),
    rules,
    sub(ctx, t('looks'), 'st-looks-card', looksBox),
    kitCard,
    sub(ctx, t('slots'), 'st-slots-card', slotsBox),
    tplCard,
    interview,
    projectStyle,
    availability,
    status,
    history,
    card(ctx, t('save'), field(ctx, t('saveNote'), note), save),
    result,
  );
}
const lookNoHindi = () =>
  lang() === 'hi'
    ? 'इस लुक का अभी कोई हिंदी नाम नहीं है; हिंदी पढ़ने वालों को अंग्रेज़ी नाम दिखेगा।'
    : 'This look has no Hindi name yet; people who read Hindi will see the English name.';

// --------------------------------------------- a Style from a Project (2)

async function fromProjectScreen(
  ctx: Ctx,
  data: ListData,
): Promise<HTMLElement> {
  const back = button(
    ctx,
    t('back'),
    () => {
      fromProject = false;
      ctx.refresh();
    },
    { id: 'fp-back' },
  );
  if (!data.account)
    return card(
      ctx,
      t('fromProject'),
      back,
      ctx.el(
        'p',
        { class: 'error', id: 'fp-no-account' },
        `${t('account')}: ${t('noAccount')}. ${t('accountNote')}`,
      ),
    );
  const box = ctx.el('div', { id: 'fp-projects' });
  const margin = input(ctx, '20', () => {}, {
    id: 'fp-margin',
    type: 'number',
  }) as HTMLInputElement;
  const list = button(
    ctx,
    t('listProjects'),
    async () => {
      const r = await ctx.api<{
        projects: {
          id: string;
          name: string;
          videos: { id: string; name: string; hasPlan: boolean }[];
        }[];
      }>('GET', q(ctx, '/api/styles/from-project'));
      box.replaceChildren(
        ...r.projects.map((p) =>
          ctx.el(
            'div',
            { class: 'card compact', 'data-project': p.id },
            ctx.el('h3', {}, p.name),
            ...p.videos.map((v) =>
              ctx.el(
                'div',
                { class: 'bar' },
                ctx.el(
                  'span',
                  { class: 'grow' },
                  v.hasPlan ? v.name : `${v.name} ${t('noPlan')}`,
                ),
                button(
                  ctx,
                  t('makeDraft'),
                  async () => {
                    const out = await ctx.api<{ style: Style }>(
                      'POST',
                      q(ctx, '/api/styles/from-project'),
                      {
                        project: p.id,
                        video: v.id,
                        margin: (Number(margin.value) || 0) / 100,
                      },
                    );
                    fromProject = false;
                    editing = out.style.id;
                    ctx.refresh();
                    return out.style.id;
                  },
                  { 'data-from-video': v.id },
                ),
              ),
            ),
          ),
        ),
      );
    },
    { id: 'fp-list' },
  );
  return card(
    ctx,
    t('fromProject'),
    back,
    ctx.el('p', { class: 'muted' }, `${t('account')}: ${data.account.email}`),
    field(ctx, t('margin'), margin),
    list,
    box,
  );
}

// ----------------------------------------------- one field-row editor (1.2, 3)

interface Row {
  id: string;
  label: { en: string; hi?: string | undefined };
  help?: { en: string; hi?: string | undefined };
  type: string;
  required?: boolean;
  youDecide?: boolean;
  options: { value: string; label: { en: string; hi?: string | undefined } }[];
  example?: { en: string; hi?: string | undefined } | undefined;
  default?: unknown;
}
const optText = (r: Row, k: 'en' | 'hi') =>
  r.options.map((o) => `${o.value}=${o.label[k] ?? ''}`).join('\n');
function parseOpts(r: Row, k: 'en' | 'hi', text: string) {
  const lines = text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const next = lines.map((line) => {
    const [value, ...rest] = line.split('=');
    const v = (value ?? '').trim();
    const old = r.options.find((o) => o.value === v);
    return {
      value: v,
      label: { ...(old?.label ?? { en: v }), [k]: rest.join('=').trim() || v },
    };
  });
  if (k === 'en') r.options = next;
  else
    r.options = r.options.map((o) => ({
      ...o,
      label: {
        ...o.label,
        hi: next.find((x) => x.value === o.value)?.label.hi ?? o.label.hi ?? '',
      },
    }));
}
/** The same field editor for a Style's Brief fields and the field blocks. */
function fieldRows(
  ctx: Ctx,
  rows: Row[],
  prefix: string,
  redraw: () => void,
  users: Record<string, string[]> = {},
) {
  const types: [string, string][] =
    prefix === 'st-field'
      ? [
          'text',
          'longtext',
          'number',
          'choice',
          'multi',
          'toggle',
          'file',
          'url',
        ].map((x) => [x, x])
      : ['text', 'longtext', 'choice', 'file', 'link'].map((x) => [x, x]);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    redraw();
  };
  return ctx.el(
    'div',
    { id: `${prefix}-rows` },
    ...rows.map((r, i) =>
      ctx.el(
        'div',
        { class: 'card compact', [`data-${prefix}`]: r.id },
        ctx.el(
          'div',
          { class: 'row' },
          field(
            ctx,
            t('id'),
            input(ctx, r.id, (v) => (r.id = v.trim()), {
              id: `${prefix}-id-${i}`,
            }),
          ),
          field(
            ctx,
            t('labelEn'),
            input(ctx, r.label.en, (v) => (r.label = { ...r.label, en: v }), {
              id: `${prefix}-en-${i}`,
            }),
          ),
          field(
            ctx,
            t('labelHi'),
            input(
              ctx,
              r.label.hi ?? '',
              (v) => (r.label = { ...r.label, hi: v }),
              { id: `${prefix}-hi-${i}` },
            ),
          ),
          field(
            ctx,
            t('type'),
            select(
              ctx,
              types,
              r.type,
              (v) => {
                r.type = v;
                redraw();
              },
              { id: `${prefix}-type-${i}` },
            ),
          ),
        ),
        ctx.el(
          'div',
          { class: 'row' },
          field(
            ctx,
            t('helpEn'),
            input(
              ctx,
              r.help?.en ?? '',
              (v) => (r.help = { ...(r.help ?? { en: '' }), en: v }),
              { id: `${prefix}-help-en-${i}` },
            ),
          ),
          field(
            ctx,
            t('helpHi'),
            input(
              ctx,
              r.help?.hi ?? '',
              (v) => (r.help = { ...(r.help ?? { en: '' }), hi: v }),
              { id: `${prefix}-help-hi-${i}` },
            ),
          ),
          ...(prefix === 'st-field'
            ? [
                field(
                  ctx,
                  t('required'),
                  check(ctx, !!r.required, (v) => (r.required = v), {
                    id: `${prefix}-required-${i}`,
                  }),
                ),
              ]
            : [
                field(
                  ctx,
                  t('youDecide'),
                  check(ctx, r.youDecide !== false, (v) => (r.youDecide = v), {
                    id: `${prefix}-you-${i}`,
                  }),
                ),
                field(
                  ctx,
                  t('example'),
                  input(
                    ctx,
                    r.example?.en ?? '',
                    (v) => (r.example = v ? { en: v } : undefined),
                    { id: `${prefix}-example-${i}` },
                  ),
                ),
                field(
                  ctx,
                  t('defaultValue'),
                  input(
                    ctx,
                    typeof r.default === 'string' ? r.default : '',
                    (v) => (r.default = v || undefined),
                    { id: `${prefix}-default-${i}` },
                  ),
                ),
              ]),
        ),
        r.type === 'choice' || r.type === 'multi'
          ? ctx.el(
              'div',
              { class: 'row' },
              field(
                ctx,
                t('optionsEn'),
                area(ctx, optText(r, 'en'), (v) => parseOpts(r, 'en', v), {
                  id: `${prefix}-opts-en-${i}`,
                  rows: '3',
                }),
              ),
              field(
                ctx,
                t('optionsHi'),
                area(ctx, optText(r, 'hi'), (v) => parseOpts(r, 'hi', v), {
                  id: `${prefix}-opts-hi-${i}`,
                  rows: '3',
                }),
              ),
            )
          : '',
        users[r.id]?.length
          ? ctx.el(
              'small',
              { class: 'muted', 'data-users': r.id },
              `${t('usedBy')}: ${users[r.id]!.join(', ')}`,
            )
          : '',
        ctx.el(
          'div',
          { class: 'bar' },
          button(ctx, t('up'), () => move(i, -1)),
          button(ctx, t('down'), () => move(i, 1)),
          button(
            ctx,
            t('copy'),
            () => {
              rows.splice(i + 1, 0, { ...clone(r), id: `${r.id}-copy` });
              redraw();
            },
            { id: `${prefix}-copy-${i}` },
          ),
          button(
            ctx,
            t('remove'),
            () => {
              rows.splice(i, 1);
              redraw();
            },
            { id: `${prefix}-remove-${i}` },
          ),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------ Brief fields

let fieldsDraft: {
  blocks: FieldBlock[];
  types: VideoType[];
  fallbackType: string;
} | null = null;

export async function fieldsScreen(ctx: Ctx): Promise<HTMLElement> {
  const data = await ctx.api<{
    library: { blocks: FieldBlock[]; types: VideoType[]; fallbackType: string };
    playbooks: string[];
    users: Record<string, string[]>;
    errors: string[];
    history: {
      version: number;
      at: string;
      who: string;
      note: string;
      changed: string[];
    }[];
  }>('GET', q(ctx, '/api/fields'));
  const lib = (fieldsDraft = clone(data.library));
  const blocksBox = ctx.el('div', { id: 'fl-blocks' });
  const drawBlocks = () =>
    blocksBox.replaceChildren(
      fieldRows(
        ctx,
        lib.blocks as unknown as Row[],
        'fl-block',
        drawBlocks,
        data.users,
      ),
      button(
        ctx,
        t('addBlock'),
        () => {
          lib.blocks.push({
            id: `block-${lib.blocks.length + 1}`,
            label: { en: '' },
            type: 'text',
            options: [],
            hints: {},
            youDecide: true,
          } as FieldBlock);
          drawBlocks();
        },
        { id: 'fl-block-add' },
      ),
    );
  drawBlocks();
  const typesBox = ctx.el('div', { id: 'fl-types' });
  const blocksText = (ty: VideoType) =>
    ty.blocks
      .map(
        (b) => `${b.id}${b.required ? '*' : ''}${b.group ? `:${b.group}` : ''}`,
      )
      .join(', ');
  const parseBlocks = (ty: VideoType, v: string) =>
    (ty.blocks = v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const [head, group] = x.split(':');
        const id = (head ?? '').replace(/\*$/, '').trim();
        return {
          id,
          required: (head ?? '').endsWith('*'),
          ...(group?.trim() ? { group: group.trim() } : {}),
        };
      }));
  const drawTypes = () =>
    typesBox.replaceChildren(
      ...lib.types.map((ty, i) =>
        ctx.el(
          'div',
          { class: 'card compact', 'data-type': ty.id },
          ctx.el(
            'div',
            { class: 'row' },
            field(
              ctx,
              t('id'),
              input(ctx, ty.id, (v) => (ty.id = v.trim()), {
                id: `fl-type-id-${i}`,
              }),
            ),
            field(
              ctx,
              t('nameEn'),
              input(ctx, ty.name.en, (v) => (ty.name = { ...ty.name, en: v }), {
                id: `fl-type-en-${i}`,
              }),
            ),
            field(
              ctx,
              t('nameHi'),
              input(
                ctx,
                ty.name.hi ?? '',
                (v) => (ty.name = { ...ty.name, hi: v }),
                { id: `fl-type-hi-${i}` },
              ),
            ),
            field(
              ctx,
              t('playbook'),
              select(
                ctx,
                [
                  ['', '—'],
                  ...data.playbooks.map((p) => [p, p] as [string, string]),
                ],
                ty.playbook ?? '',
                (v) => {
                  if (v) ty.playbook = v;
                  else delete ty.playbook;
                },
                { id: `fl-type-playbook-${i}` },
              ),
            ),
          ),
          field(
            ctx,
            t('typeBlocks'),
            input(ctx, blocksText(ty), (v) => parseBlocks(ty, v), {
              id: `fl-type-blocks-${i}`,
            }),
          ),
          field(
            ctx,
            t('keywords'),
            input(
              ctx,
              ty.keywords.join(', '),
              (v) =>
                (ty.keywords = v
                  .split(',')
                  .map((x) => x.trim().toLowerCase())
                  .filter((x) => x.length >= 2)),
              { id: `fl-type-words-${i}` },
            ),
          ),
          ctx.el(
            'div',
            { class: 'bar' },
            button(
              ctx,
              t('copy'),
              () => {
                lib.types.splice(i + 1, 0, {
                  ...clone(ty),
                  id: `${ty.id}-copy`,
                });
                drawTypes();
              },
              { id: `fl-type-copy-${i}` },
            ),
            button(
              ctx,
              t('remove'),
              () => {
                lib.types.splice(i, 1);
                drawTypes();
              },
              { id: `fl-type-remove-${i}` },
            ),
          ),
        ),
      ),
      button(
        ctx,
        t('addType'),
        () => {
          lib.types.push({
            id: `type-${lib.types.length + 1}`,
            name: { en: '' },
            keywords: [],
            blocks: [{ id: lib.blocks[0]?.id ?? 'topic', required: true }],
          });
          drawTypes();
        },
        { id: 'fl-type-add' },
      ),
    );
  drawTypes();
  const fallback = input(
    ctx,
    lib.fallbackType,
    (v) => (lib.fallbackType = v.trim()),
    { id: 'fl-fallback' },
  );
  // The live Brief card, by the panel's own functions (on the server).
  const sampleText = area(ctx, '', () => {}, {
    id: 'fl-sample',
    rows: '2',
  }) as HTMLTextAreaElement;
  const typePick = select(
    ctx,
    [['', '—'], ...lib.types.map((x) => [x.id, x.name.en] as [string, string])],
    '',
    () => {},
    { id: 'fl-preview-type' },
  );
  const card2 = ctx.el('div', { id: 'fl-preview-card' });
  const previewBtn = button(
    ctx,
    t('preview'),
    async () => {
      const r = await ctx.api<{
        type: string;
        filled: Record<string, string>;
        missing: string[];
        asks: {
          id: string;
          label: { en: string; hi?: string | undefined };
          required: boolean;
        }[];
      }>('POST', q(ctx, '/api/fields/preview'), {
        library: lib,
        type: typePick.value,
        text: sampleText.value,
      });
      card2.replaceChildren(
        ctx.el(
          'p',
          {},
          `${t('type')}: `,
          ctx.el('strong', { id: 'fl-preview-type-out' }, r.type),
        ),
        ctx.el('h4', {}, t('prefilled')),
        ctx.el(
          'ul',
          { id: 'fl-prefilled' },
          ...Object.entries(r.filled).map(([k, v]) =>
            ctx.el('li', { 'data-filled': k }, `${k}: ${v.slice(0, 80)}`),
          ),
        ),
        ctx.el('h4', {}, t('stillMissing')),
        ctx.el(
          'ul',
          { id: 'fl-asks' },
          ...r.asks.map((a) =>
            ctx.el(
              'li',
              { 'data-ask': a.id },
              `${a.label[lang()] ?? a.label.en}${a.required ? ' *' : ''}`,
            ),
          ),
        ),
      );
    },
    { id: 'fl-preview' },
  );
  const note = input(ctx, '', () => {}, {
    id: 'fl-note',
    maxlength: '200',
  }) as HTMLInputElement;
  return ctx.el(
    'div',
    { id: 'fields-tab' },
    card(
      ctx,
      t('fieldsTitle'),
      ctx.el('p', { class: 'muted' }, t('fieldsIntro')),
      ...(data.errors.length
        ? [
            ctx.el(
              'ul',
              { class: 'error' },
              ...data.errors.map((e) => ctx.el('li', {}, e)),
            ),
          ]
        : []),
    ),
    sub(ctx, t('blocks'), 'fl-blocks-card', blocksBox),
    sub(
      ctx,
      t('types'),
      'fl-types-card',
      typesBox,
      field(ctx, t('fallback'), fallback),
    ),
    sub(
      ctx,
      t('previewTitle'),
      'fl-preview-box',
      field(ctx, t('type'), typePick),
      field(ctx, t('sampleMessage'), sampleText),
      previewBtn,
      card2,
    ),
    sub(
      ctx,
      t('history'),
      'fl-history',
      grid(
        ctx,
        [t('version'), t('when'), t('who'), t('note'), t('changed'), ''],
        data.history
          .slice()
          .reverse()
          .map((v) => [
            String(v.version),
            when(v.at),
            v.who,
            v.note,
            v.changed.join(', '),
            button(
              ctx,
              t('rollback'),
              async () => {
                const out = await ctx.guarded(() =>
                  ctx.api('POST', q(ctx, '/api/fields/rollback'), {
                    version: v.version,
                  }),
                );
                if (!out) return null;
                ctx.refresh();
                return String(v.version);
              },
              { 'data-rollback': String(v.version) },
            ),
          ]),
        'fl-history-table',
      ),
    ),
    card(
      ctx,
      t('save'),
      field(ctx, t('saveNote'), note),
      button(
        ctx,
        t('saveFields'),
        async () => {
          const out = await ctx.guarded(() =>
            ctx.api<{ configVersion: number }>(
              'POST',
              q(ctx, '/api/fields/save'),
              { library: fieldsDraft, note: note.value },
            ),
          );
          if (!out) return null;
          ctx.refresh();
          return t('saved', { v: out.configVersion });
        },
        { id: 'fl-save', class: 'primary' },
      ),
    ),
  );
}

// --------------------------------------------------------- Director limits

/** One number with its schema range, refused with a plain sentence. */
function ranged(
  ctx: Ctx,
  label: string,
  value: number,
  min: number,
  max: number,
  id: string,
  int = true,
) {
  const i = ctx.el('input', {
    type: 'number',
    id,
    min: String(min),
    max: String(max),
    step: int ? '1' : 'any',
  });
  i.value = String(value);
  const read = () => {
    const n = Number(i.value);
    if (
      !Number.isFinite(n) ||
      n < min ||
      n > max ||
      (int && !Number.isInteger(n))
    )
      throw new Error(t('outOfRange', { field: label, min, max }));
    return n;
  };
  return { el: field(ctx, `${label} (${min}–${max})`, i), read };
}

export async function limitsScreen(
  ctx: Ctx,
  save: (c: PlatformConfig, note: string) => Promise<string>,
): Promise<HTMLElement> {
  const live = await ctx.api<{ version: number; config: PlatformConfig }>(
    'GET',
    '/api/admin/config',
  );
  const c = clone(live.config);
  const d = c.director;
  const cx = d.context;
  const rw = ranged(
    ctx,
    t('rewrites'),
    d.rewritesPerVideo,
    0,
    50,
    'dl-rewrites',
  );
  const ctxFields = [
    ['budgetTokens', 'Budget (tokens)', 300, 200000, true],
    ['lastTurns', 'Turns read word for word', 1, 60, true],
    ['keepTurns', 'Turns a chat keeps', 2, 200, true],
    ['maxSummaryChars', 'Summary (characters)', 100, 8000, true],
    ['maxProjectFacts', 'Project facts', 1, 500, true],
    ['maxSheetEntries', 'Video sheet entries', 5, 500, true],
    ['maxFileNotes', 'File notes', 1, 100, true],
    ['maxNoteChars', 'File note (characters)', 40, 4000, true],
    ['maxChatsPerVideo', 'Chats per video', 1, 200, true],
    ['maxAttachmentMb', 'Largest attachment (MB)', 0.1, 500, false],
  ] as const;
  const ctxInputs = ctxFields.map(([k, label, min, max, int]) => ({
    k,
    f: ranged(ctx, label, cx[k], min, max, `dl-${k}`, int),
  }));
  // Refusals.
  const refBox = ctx.el('div', { id: 'dl-refusals' });
  const drawRef = () =>
    refBox.replaceChildren(
      ...d.refusals.map((r, i) =>
        ctx.el(
          'div',
          { class: 'card compact', 'data-refusal': r.id },
          ctx.el(
            'div',
            { class: 'row' },
            field(
              ctx,
              t('id'),
              input(ctx, r.id, (v) => (r.id = v.trim()), {
                id: `dl-ref-id-${i}`,
              }),
            ),
            field(
              ctx,
              t('refusalWhen'),
              input(ctx, r.when.en, (v) => (r.when = { ...r.when, en: v }), {
                id: `dl-ref-when-${i}`,
              }),
            ),
            field(
              ctx,
              t('refusalWords'),
              input(
                ctx,
                r.keywords.join(', '),
                (v) =>
                  (r.keywords = v
                    .split(',')
                    .map((x) => x.trim().toLowerCase())
                    .filter((x) => x.length >= 2)),
                { id: `dl-ref-words-${i}` },
              ),
            ),
          ),
          ctx.el(
            'div',
            { class: 'row' },
            field(
              ctx,
              t('refusalReply'),
              area(ctx, r.reply.en, (v) => (r.reply = { ...r.reply, en: v }), {
                id: `dl-ref-reply-${i}`,
                rows: '2',
              }),
            ),
            field(
              ctx,
              t('refusalReplyHi'),
              area(
                ctx,
                r.reply.hi ?? '',
                (v) => (r.reply = { ...r.reply, hi: v }),
                { id: `dl-ref-reply-hi-${i}`, rows: '2' },
              ),
            ),
          ),
          button(ctx, t('remove'), () => {
            d.refusals.splice(i, 1);
            drawRef();
          }),
        ),
      ),
      button(
        ctx,
        t('add'),
        () => {
          d.refusals.push({
            id: `refusal-${d.refusals.length + 1}`,
            when: { en: '' },
            reply: { en: '' },
            keywords: [],
          });
          drawRef();
        },
        { id: 'dl-ref-add' },
      ),
    );
  drawRef();
  // The Styles' interview questions (global list per Style is long; one box each).
  const ivBox = ctx.el('div', { id: 'dl-interview' });
  for (const [si, st] of c.styles.entries()) {
    ivBox.append(
      ctx.el('h4', {}, st.name.en),
      ...st.interview.questions.map((qq, i) =>
        ctx.el(
          'div',
          { class: 'row' },
          field(
            ctx,
            qq.id,
            input(ctx, qq.ask.en, (v) => (qq.ask = { ...qq.ask, en: v }), {
              id: `dl-q-${si}-${i}`,
            }),
          ),
          field(
            ctx,
            `${qq.id} (हिंदी)`,
            input(
              ctx,
              qq.ask.hi ?? '',
              (v) => (qq.ask = { ...qq.ask, hi: v }),
              { id: `dl-q-hi-${si}-${i}` },
            ),
          ),
        ),
      ),
      ...st.interview.followUps.map((qq, i) =>
        ctx.el(
          'div',
          { class: 'row' },
          field(
            ctx,
            `${qq.id} (${t('followUps')})`,
            input(ctx, qq.ask.en, (v) => (qq.ask = { ...qq.ask, en: v }), {
              id: `dl-f-${si}-${i}`,
            }),
          ),
        ),
      ),
    );
  }
  // Style chat moods and fonts.
  const sc = d.styleChat;
  const moodBox = ctx.el('div', { id: 'dl-moods' });
  const drawMoods = () =>
    moodBox.replaceChildren(
      ...sc.moods.map((m, i) =>
        ctx.el(
          'div',
          { class: 'row', 'data-mood': m.id },
          field(
            ctx,
            t('id'),
            input(ctx, m.id, (v) => (m.id = v.trim()), {
              id: `dl-mood-id-${i}`,
            }),
          ),
          field(
            ctx,
            t('moodWords'),
            input(
              ctx,
              m.words.join(', '),
              (v) =>
                (m.words = v
                  .split(',')
                  .map((x) => x.trim().toLowerCase())
                  .filter(Boolean)),
              { id: `dl-mood-words-${i}` },
            ),
          ),
          field(
            ctx,
            t('palette'),
            input(
              ctx,
              m.palette.join(', '),
              (v) =>
                (m.palette = v
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)),
              { id: `dl-mood-palette-${i}` },
            ),
          ),
          button(ctx, t('remove'), () => {
            sc.moods.splice(i, 1);
            drawMoods();
          }),
        ),
      ),
      button(
        ctx,
        t('add'),
        () => {
          sc.moods.push({
            id: `mood-${sc.moods.length + 1}`,
            words: ['word'],
            palette: ['#101219', '#ffffff'],
          });
          drawMoods();
        },
        { id: 'dl-mood-add' },
      ),
    );
  drawMoods();
  const fonts = input(
    ctx,
    sc.fonts.join(', '),
    (v) =>
      (sc.fonts = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    { id: 'dl-fonts' },
  );
  // Director's fixed lines.
  const linesBox = ctx.el('div', { id: 'dl-lines' });
  const lineKey = input(ctx, '', () => {}, {
    id: 'dl-line-key',
  }) as HTMLInputElement;
  const drawLines = () =>
    linesBox.replaceChildren(
      ...Object.entries(d.lines).map(([k, v]) =>
        ctx.el(
          'div',
          { class: 'row', 'data-line': k },
          ctx.el('strong', {}, k),
          field(
            ctx,
            'English',
            input(ctx, v.en, (x) => (d.lines[k] = { ...d.lines[k]!, en: x }), {
              id: `dl-line-en-${k}`,
            }),
          ),
          field(
            ctx,
            'हिंदी',
            input(
              ctx,
              v.hi ?? '',
              (x) => (d.lines[k] = { ...d.lines[k]!, hi: x }),
              { id: `dl-line-hi-${k}` },
            ),
          ),
          button(ctx, t('remove'), () => {
            delete d.lines[k];
            drawLines();
          }),
        ),
      ),
      ctx.el(
        'div',
        { class: 'row' },
        field(ctx, t('lineKey'), lineKey),
        button(
          ctx,
          t('add'),
          () => {
            const k = lineKey.value.trim();
            if (!k) return null;
            d.lines[k] ??= { en: '' };
            drawLines();
            return null;
          },
          { id: 'dl-line-add' },
        ),
      ),
    );
  drawLines();
  // Web, layout and assets: the director.* parts that had no screen.
  const web = d.web;
  const webOn = check(ctx, web.enabled, (v) => (web.enabled = v), {
    id: 'dl-web-on',
  });
  const allowed = input(
    ctx,
    web.allowedDomains.join(', '),
    (v) =>
      (web.allowedDomains = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    { id: 'dl-web-allowed' },
  );
  const blocked = input(
    ctx,
    web.blockedDomains.join(', '),
    (v) =>
      (web.blockedDomains = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    { id: 'dl-web-blocked' },
  );
  const webNums = [
    ranged(ctx, 'Pages per video', web.pagesPerVideo, 0, 100, 'dl-web-pages'),
    ranged(
      ctx,
      'Bytes per page',
      web.bytesPerPage,
      1024,
      4 * 1024 * 1024,
      'dl-web-bytes',
    ),
    ranged(
      ctx,
      'Characters per page',
      web.charsPerPage,
      200,
      100000,
      'dl-web-chars',
    ),
    ranged(
      ctx,
      'Credits per page',
      web.costPerPage,
      0,
      1000,
      'dl-web-cost-page',
      false,
    ),
    ranged(
      ctx,
      'Credits per search',
      web.costPerSearch,
      0,
      1000,
      'dl-web-cost-search',
      false,
    ),
  ] as const;
  const searchProvider = input(
    ctx,
    web.searchProvider,
    (v) => (web.searchProvider = v.trim()),
    { id: 'dl-web-provider' },
  );
  const lay = d.layout;
  const layNums = [
    ranged(ctx, 'Safe area, sides (%)', lay.safeX, 0, 25, 'dl-safe-x', false),
    ranged(
      ctx,
      'Safe area, top and bottom (%)',
      lay.safeY,
      0,
      25,
      'dl-safe-y',
      false,
    ),
    ranged(
      ctx,
      'Least text contrast',
      lay.minContrast,
      1,
      21,
      'dl-contrast',
      false,
    ),
  ] as const;
  const as = d.assets;
  const order = input(ctx, as.order.join(', '), () => {}, {
    id: 'dl-assets-order',
  }) as HTMLInputElement;
  const aiImg = ranged(
    ctx,
    'AI pictures per video',
    as.aiImagesMax,
    0,
    100,
    'dl-ai-images',
  );
  const aiVid = ranged(
    ctx,
    'AI videos per video',
    as.aiVideosMax,
    0,
    20,
    'dl-ai-videos',
  );
  const lic = input(
    ctx,
    as.licences.join(', '),
    (v) =>
      (as.licences = v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
    { id: 'dl-licences' },
  );
  // Where every other director.* setting is edited.
  const elsewhere: [string, string][] = [
    ['persona, limits, tools', 'Director rules'],
    [
      'research, rulebook, playbooks, creatorPlaybook, authoring',
      'Rules & Playbooks',
    ],
    [
      'web, layout, assets, context, rewritesPerVideo, refusals, styleChat, lines',
      'Director limits (this page)',
    ],
    [
      'interview questions and follow-ups',
      'Director limits (this page) and Readymade Styles',
    ],
    ['fieldLibrary', 'Brief fields'],
    ['roles', 'AI Providers & Models'],
    [
      'prompts, greeting, creativeUpgrade, estimate, scope, methodOrder, budget, reveal',
      'Platform Config',
    ],
  ];
  return ctx.el(
    'div',
    { id: 'limits-tab' },
    card(
      ctx,
      t('limitsTitle'),
      ctx.el('p', { class: 'muted' }, t('limitsIntro')),
      ctx.el('div', { class: 'row' }, rw.el),
    ),
    sub(
      ctx,
      t('memory'),
      'dl-memory',
      ctx.el('div', { class: 'row' }, ...ctxInputs.map((x) => x.f.el)),
    ),
    sub(ctx, t('refusals'), 'dl-refusals-card', refBox),
    sub(ctx, t('globalQuestions'), 'dl-interview-card', ivBox),
    sub(
      ctx,
      t('moods'),
      'dl-moods-card',
      moodBox,
      field(ctx, t('fonts'), fonts),
    ),
    sub(ctx, t('lines'), 'dl-lines-card', linesBox),
    sub(
      ctx,
      t('web'),
      'dl-web',
      ctx.el(
        'div',
        { class: 'row' },
        field(ctx, t('webOn'), webOn),
        field(ctx, t('allowed'), allowed),
        field(ctx, t('blocked'), blocked),
        field(ctx, t('searchProvider'), searchProvider),
      ),
      ctx.el('div', { class: 'row' }, ...webNums.map((x) => x.el)),
    ),
    sub(
      ctx,
      t('layoutRules'),
      'dl-layout',
      ctx.el('div', { class: 'row' }, ...layNums.map((x) => x.el)),
    ),
    sub(
      ctx,
      t('assetRules'),
      'dl-assets',
      ctx.el(
        'div',
        { class: 'row' },
        field(ctx, t('assetOrder'), order),
        aiImg.el,
        aiVid.el,
        field(ctx, t('licences'), lic),
      ),
    ),
    sub(
      ctx,
      t('otherDirector'),
      'dl-elsewhere',
      grid(ctx, ['director.*', 'Admin'], elsewhere, 'dl-elsewhere-table'),
    ),
    button(
      ctx,
      t('saveLimits'),
      async () => {
        d.rewritesPerVideo = rw.read();
        for (const x of ctxInputs)
          (cx as Record<string, number>)[x.k] = x.f.read();
        [
          web.pagesPerVideo,
          web.bytesPerPage,
          web.charsPerPage,
          web.costPerPage,
          web.costPerSearch,
        ] = webNums.map((x) => x.read()) as [
          number,
          number,
          number,
          number,
          number,
        ];
        [lay.safeX, lay.safeY, lay.minContrast] = layNums.map((x) =>
          x.read(),
        ) as [number, number, number];
        as.aiImagesMax = aiImg.read();
        as.aiVideosMax = aiVid.read();
        const ord = order.value
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (
          !ord.length ||
          ord.some((x) => !['mine', 'library', 'stock', 'ai'].includes(x)) ||
          new Set(ord).size !== ord.length
        )
          throw new Error(t('orderBad'));
        as.order = ord as typeof as.order;
        const done = await save(c, 'director limits');
        ctx.refresh();
        return done;
      },
      { id: 'dl-save', class: 'primary' },
    ),
  );
}
