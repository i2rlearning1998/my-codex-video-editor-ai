// P4 Part 3: the Admin screens of the Owner App. Loaded on demand by app.ts
// (a second module, served at /admin.js). Plain DOM, no framework. Every call
// goes through /api/admin/*, which only answers after the owner's own login;
// money, keys, settings and emergency actions ask for a fresh code first.
// The screens read and write the same Platform Config the gateway serves, so
// nothing here is a second source of truth.
import type {
  BriefField,
  Model,
  Studio,
  Plan,
  PlatformConfig,
  Provider,
} from '../../src/platform-config/schema';

export type AdminTab =
  | 'dashboard'
  | 'providers'
  | 'users'
  | 'plans'
  | 'flags'
  | 'director'
  | 'studios'
  | 'workspace'
  | 'engines'
  | 'gateway'
  | 'emergency'
  | 'config';

export const ADMIN_TABS: readonly AdminTab[] = [
  'dashboard',
  'providers',
  'users',
  'plans',
  'flags',
  'director',
  'studios',
  'workspace',
  'engines',
  'gateway',
  'emergency',
  'config',
];
export const ADMIN_LABELS: Record<AdminTab, { en: string; hi: string }> = {
  dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  providers: { en: 'AI Providers & Models', hi: 'AI प्रोवाइडर और मॉडल' },
  users: { en: 'Users', hi: 'यूज़र' },
  plans: { en: 'Plans & Credits', hi: 'प्लान और क्रेडिट' },
  flags: { en: 'Feature flags', hi: 'फीचर फ्लैग' },
  director: { en: 'Director rules', hi: 'डायरेक्टर नियम' },
  studios: { en: 'Studio tools & forms', hi: 'स्टूडियो टूल और फ़ॉर्म' },
  workspace: { en: 'Projects & Styles', hi: 'प्रोजेक्ट और स्टाइल' },
  engines: { en: 'Stock & offline engines', hi: 'स्टॉक और ऑफलाइन इंजन' },
  gateway: { en: 'Admin audit', hi: 'एडमिन ऑडिट' },
  emergency: { en: 'Emergency switch', hi: 'इमरजेंसी स्विच' },
  config: { en: 'Platform Config', hi: 'प्लेटफॉर्म कॉन्फ़िग' },
};

type Props = Partial<Record<string, string>>;
export interface AdminCtx {
  el: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Props,
    ...children: (Node | string)[]
  ) => HTMLElementTagNameMap[K];
  api: <T>(method: string, url: string, body?: unknown) => Promise<T>;
  /** Runs a dangerous action; asks for the password and code if needed. */
  guarded: <T>(run: () => Promise<T>) => Promise<T | null>;
  status: HTMLElement;
  /** Draws the current screen again. */
  refresh: () => void;
}

interface KeyInfo {
  name: string;
  provider: string;
  set: boolean;
  hint: string | null;
  lastTest: { ok: boolean; at: string; message: string } | null;
}
interface UserRow {
  userId: string;
  email: string;
  planId: string;
  credits: number;
  flags: string[];
  suspended: boolean;
  createdAt: string;
  lastSeenAt: string | null;
}
interface UserDetail extends UserRow {
  ledger: { key: string; delta: number; reason: string; at: string }[];
  payments: {
    paymentId: string;
    provider: string;
    amount: { currency: string; amountMinor: number };
    status: string;
    at: string;
  }[];
}
interface Emergency {
  aiOff: boolean;
  signupsOff: boolean;
  paymentsOff: boolean;
  message: { en: string; hi?: string };
}

export async function adminScreen(
  tab: AdminTab,
  ctx: AdminCtx,
): Promise<HTMLElement> {
  switch (tab) {
    case 'dashboard':
      return dashboard(ctx);
    case 'providers':
      return providers(ctx);
    case 'users':
      return users(ctx);
    case 'plans':
      return plans(ctx);
    case 'flags':
      return flags(ctx);
    case 'director':
      return director(ctx);
    case 'studios':
      return studios(ctx);
    case 'workspace':
      return workspace(ctx);
    case 'engines':
      return engines(ctx);
    case 'gateway':
      return gatewayAudit(ctx);
    case 'emergency':
      return emergency(ctx);
    case 'config':
      return rawConfig(ctx);
  }
}

// ---------------------------------------------------------------- helpers

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function say(ctx: AdminCtx, text: string, ok: boolean) {
  ctx.status.textContent = text;
  ctx.status.className = ok ? 'ok' : 'error';
}
/** A button that runs `run`, shows the outcome in the status line. */
function action(
  ctx: AdminCtx,
  label: string,
  run: () => Promise<string | null | void>,
  props: Props = {},
) {
  const b = ctx.el('button', { type: 'button', ...props }, label);
  b.onclick = async () => {
    b.disabled = true;
    try {
      const done = await run();
      if (done) say(ctx, done, true);
    } catch (error) {
      say(ctx, message(error), false);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function field(ctx: AdminCtx, label: string, input: HTMLElement) {
  return ctx.el('label', { class: 'field' }, label, input);
}
function text(ctx: AdminCtx, value: string, id?: string, type = 'text') {
  const i = ctx.el('input', { type, ...(id ? { id } : {}) });
  i.value = value;
  return i;
}
function num(ctx: AdminCtx, value: number | null, id?: string) {
  const i = ctx.el('input', {
    type: 'number',
    step: 'any',
    ...(id ? { id } : {}),
  });
  i.value = value === null ? '' : String(value);
  return i;
}
function tick(ctx: AdminCtx, value: boolean, id?: string) {
  const i = ctx.el('input', { type: 'checkbox', ...(id ? { id } : {}) });
  i.checked = value;
  return i;
}
function pick(
  ctx: AdminCtx,
  options: readonly (readonly [string, string])[],
  value: string,
  id?: string,
) {
  const s = ctx.el('select', id ? { id } : {});
  for (const [v, label] of options) {
    const o = ctx.el('option', { value: v }, label);
    if (v === value) o.selected = true;
    s.append(o);
  }
  return s;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : '—';
const money = (m: { currency: string; amountMinor: number }) =>
  `${(m.amountMinor / 100).toFixed(2)} ${m.currency}`;

async function loadConfig(ctx: AdminCtx) {
  return ctx.api<{ version: number; config: PlatformConfig }>(
    'GET',
    '/api/admin/config',
  );
}
/** Saves a changed copy of the config and publishes it (asks for the code). */
async function saveConfig(
  ctx: AdminCtx,
  config: PlatformConfig,
  note: string,
): Promise<string> {
  const out = await ctx.guarded(() =>
    ctx.api<{ version: number }>('POST', '/api/admin/config', {
      config,
      note,
      publish: true,
    }),
  );
  if (!out) throw new Error('Not saved: the confirmation was cancelled.');
  return `Saved. Settings version ${out.version} is live.`;
}
/** Saves, then redraws so the screen shows what the server accepted. */
function saveButton(
  ctx: AdminCtx,
  label: string,
  build: () => PlatformConfig | Promise<PlatformConfig>,
  note: string,
  id?: string,
) {
  return action(
    ctx,
    label,
    async () => {
      const done = await saveConfig(ctx, await build(), note);
      ctx.refresh();
      return done;
    },
    { class: 'primary', ...(id ? { id } : {}) },
  );
}
const card = (ctx: AdminCtx, title: string, ...children: (Node | string)[]) =>
  ctx.el('section', { class: 'card' }, ctx.el('h2', {}, title), ...children);
const note = (ctx: AdminCtx, s: string) => ctx.el('p', { class: 'muted' }, s);
function table(
  ctx: AdminCtx,
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

// -------------------------------------------------------------- dashboard

async function dashboard(ctx: AdminCtx) {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const q = `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const body = ctx.el('div', {});
  let m: {
    revenue: { currency: string; amountMinor: number }[];
    creditsSold: number;
    creditsSpent: number;
    providerCostUsd: number | null;
    newUsers: number;
    activeUsers: number;
    byModel: {
      modelId: string;
      calls: number;
      costUsd: number | null;
      credits: number;
    }[];
  } | null = null;
  let problem = '';
  try {
    m = await ctx.api('GET', `/api/admin/metrics${q}`);
  } catch (error) {
    problem = message(error);
  }
  const em = await ctx.api<Emergency>('GET', '/api/admin/emergency');
  const switches = [
    em.aiOff && 'AI is OFF',
    em.signupsOff && 'Sign-ups are OFF',
    em.paymentsOff && 'Payments are OFF',
  ].filter(Boolean);
  body.append(
    ctx.el(
      'p',
      { id: 'dash-emergency', class: switches.length ? 'error' : 'ok' },
      switches.length
        ? switches.join(' · ')
        : 'All switches are on: the platform is running normally.',
    ),
  );
  if (!m) {
    body.append(note(ctx, `No numbers yet. ${problem}`));
  } else {
    const stat = (label: string, value: string) =>
      ctx.el(
        'div',
        { class: 'stat' },
        ctx.el('strong', {}, value),
        ctx.el('span', {}, label),
      );
    body.append(
      ctx.el(
        'div',
        { class: 'stats', id: 'dash-stats' },
        stat(
          'Revenue (30 days)',
          m.revenue.length ? m.revenue.map(money).join(' + ') : '0',
        ),
        stat('Credits sold', String(m.creditsSold)),
        stat('Credits spent', String(m.creditsSpent)),
        stat(
          'Provider cost (USD)',
          m.providerCostUsd === null ? 'unknown' : m.providerCostUsd.toFixed(2),
        ),
        stat('New people', String(m.newUsers)),
        stat('Active people', String(m.activeUsers)),
      ),
      table(
        ctx,
        ['Model', 'Calls', 'Credits', 'Cost (USD)'],
        m.byModel.map((r) => [
          r.modelId,
          String(r.calls),
          String(r.credits),
          r.costUsd === null ? '—' : r.costUsd.toFixed(4),
        ]),
        'dash-models',
      ),
    );
  }
  return card(ctx, ADMIN_LABELS.dashboard.en, body);
}

// ------------------------------------------------- providers and models

const SLOT_KIND: Record<string, Model['kind'][]> = {
  text: ['text'],
  audio: ['voice', 'music', 'stt'],
  image: ['image'],
  video: ['video'],
  captions: ['stt'],
  pack: ['text'],
};
interface Slot {
  role: string;
  label: string;
  kinds: Model['kind'][];
  needJson: boolean;
}
/** Every place a model can be chosen. Nothing is chosen for the owner. */
function slotsOf(c: PlatformConfig): Slot[] {
  const out: Slot[] = [
    {
      role: c.director.roles.plan,
      label: 'Director: writes the video plan',
      kinds: ['text'],
      needJson: true,
    },
    {
      role: c.director.roles.interview,
      label: 'Director: interview questions',
      kinds: ['text'],
      needJson: false,
    },
    {
      role: c.director.roles.write,
      label: 'Director: chat and writing',
      kinds: ['text'],
      needJson: false,
    },
    {
      role: 'editor-chat',
      label: 'Editor chat',
      kinds: ['text'],
      needJson: true,
    },
  ];
  for (const s of c.studios) {
    const have = out.find((x) => x.role === s.role);
    if (have) have.label += ` + ${s.name.en}`;
    else
      out.push({
        role: s.role,
        label: `Studio: ${s.name.en}`,
        kinds: SLOT_KIND[s.output] ?? ['text'],
        needJson: false,
      });
  }
  return out;
}
const capable = (m: Model, s: Slot) =>
  s.kinds.includes(m.kind) && (!s.needJson || m.capabilities.json);
const tags = (m: Model) =>
  [
    m.kind,
    m.tier,
    ...Object.entries(m.capabilities)
      .filter(([, on]) => on)
      .map(([k]) => k),
  ].join(' · ');

async function providers(ctx: AdminCtx) {
  const live = await loadConfig(ctx);
  const c = live.config;
  const keys = (await ctx.api<{ keys: KeyInfo[] }>('GET', '/api/admin/keys'))
    .keys;
  const root = ctx.el('div', {});
  root.append(
    note(
      ctx,
      'Nothing is chosen for you. Add a provider, put its key in the vault (it is encrypted on the server and never shown again), add its models, then choose which model serves each job below.',
    ),
  );

  // ---- providers
  const list = ctx.el('div', { id: 'providers' });
  for (const p of c.providers) {
    const info = keys.find((k) => k.name === p.keyRef);
    const name = text(ctx, p.name);
    const kind = pick(
      ctx,
      [...kindsOf()].map((k) => [k, k] as const),
      p.kind,
    );
    const url = text(ctx, p.baseUrl ?? '');
    const ref = text(ctx, p.keyRef);
    const on = tick(ctx, p.enabled);
    const keyInput = text(ctx, '', undefined, 'password');
    keyInput.setAttribute('autocomplete', 'off');
    keyInput.setAttribute('placeholder', 'Paste the key');
    const used = c.models.filter((m) => m.providerId === p.id).length;
    list.append(
      ctx.el(
        'div',
        { class: 'row card', 'data-provider': p.id },
        field(ctx, 'Name', name),
        field(ctx, 'Type', kind),
        field(ctx, 'Address (OpenAI-compatible or own server)', url),
        field(ctx, 'Key name', ref),
        field(ctx, 'On', on),
        saveButton(
          ctx,
          'Save provider',
          () => {
            const next = clone(c);
            const q = next.providers.find((x) => x.id === p.id)!;
            q.name = name.value.trim();
            q.kind = kind.value as Provider['kind'];
            q.keyRef = ref.value.trim();
            q.enabled = on.checked;
            if (url.value.trim()) q.baseUrl = url.value.trim();
            else delete q.baseUrl;
            return next;
          },
          `provider ${p.id}`,
        ),
        p.kind === 'mock'
          ? note(ctx, 'Offline test provider: it needs no key.')
          : ctx.el(
              'div',
              { class: 'bar' },
              ctx.el(
                'span',
                { class: info?.set ? 'ok' : 'muted', 'data-key-state': p.id },
                info?.set
                  ? `Key saved (…${info.hint ?? '****'})`
                  : 'No key yet',
              ),
              keyInput,
              action(
                ctx,
                'Save key',
                async () => {
                  const done = await ctx.guarded(() =>
                    ctx.api('PUT', '/api/admin/keys', {
                      name: p.keyRef,
                      value: keyInput.value,
                      reason: `Key set for ${p.name}`,
                    }),
                  );
                  keyInput.value = '';
                  if (!done) return 'The key was not saved.';
                  ctx.refresh();
                  return 'Key saved in the vault.';
                },
                { 'data-act': 'key-save' },
              ),
              action(
                ctx,
                'Test',
                async () => {
                  const out = await ctx.guarded(() =>
                    ctx.api<{ lastTest: { ok: boolean; message: string } }>(
                      'POST',
                      '/api/admin/keys',
                      { name: p.keyRef },
                    ),
                  );
                  if (!out) return 'Test cancelled.';
                  say(ctx, out.lastTest.message, out.lastTest.ok);
                },
                { 'data-act': 'key-test' },
              ),
              action(ctx, 'Remove key', async () => {
                const done = await ctx.guarded(() =>
                  ctx.api('DELETE', '/api/admin/keys', {
                    name: p.keyRef,
                    reason: `Key removed for ${p.name}`,
                  }),
                );
                if (!done) return 'Not removed.';
                ctx.refresh();
                return 'Key removed.';
              }),
            ),
        info?.lastTest
          ? note(
              ctx,
              `Last test ${when(info.lastTest.at)}: ${info.lastTest.message}`,
            )
          : '',
        used === 0
          ? saveButton(
              ctx,
              'Delete provider',
              () => {
                const next = clone(c);
                next.providers = next.providers.filter((x) => x.id !== p.id);
                return next;
              },
              `delete provider ${p.id}`,
            )
          : '',
      ),
    );
  }
  // add a provider
  const nName = text(ctx, '', 'new-provider-name');
  const nKind = pick(
    ctx,
    [...kindsOf()].filter((k) => k !== 'mock').map((k) => [k, k] as const),
    'openai-compatible',
    'new-provider-kind',
  );
  const nUrl = text(ctx, '', 'new-provider-url');
  const nRef = text(ctx, '', 'new-provider-key');
  nName.oninput = () => {
    if (!nRef.dataset.touched)
      nRef.value = (
        slug(nName.value).replace(/-/g, '_').toUpperCase() + '_API_KEY'
      ).replace(/^_/, '');
  };
  nRef.oninput = () => (nRef.dataset.touched = '1');
  root.append(
    card(
      ctx,
      'Providers',
      list,
      ctx.el(
        'div',
        { class: 'row', id: 'add-provider' },
        field(ctx, 'Name', nName),
        field(ctx, 'Type', nKind),
        field(ctx, 'Address (needed for OpenAI-compatible)', nUrl),
        field(ctx, 'Key name (letters, numbers, _)', nRef),
        saveButton(
          ctx,
          'Add provider',
          () => {
            const next = clone(c);
            const id = slug(nName.value) || 'provider';
            if (next.providers.some((x) => x.id === id))
              throw new Error('A provider with that name exists.');
            if (nKind.value === 'openai-compatible' && !nUrl.value.trim())
              throw new Error(
                'An OpenAI-compatible provider needs its address.',
              );
            next.providers.push({
              id,
              name: nName.value.trim(),
              kind: nKind.value as Provider['kind'],
              enabled: true,
              keyRef: nRef.value.trim(),
              ...(nUrl.value.trim() ? { baseUrl: nUrl.value.trim() } : {}),
            });
            return next;
          },
          'add provider',
          'add-provider-save',
        ),
      ),
    ),
  );

  // ---- models
  const mrows = ctx.el('div', { id: 'models' });
  for (const m of c.models) {
    const name = text(ctx, m.name.en);
    const pm = text(ctx, m.providerModel);
    const prov = pick(
      ctx,
      c.providers.map((p) => [p.id, p.name] as const),
      m.providerId,
    );
    const kind = pick(
      ctx,
      MODEL_KINDS.map((k) => [k, k] as const),
      m.kind,
    );
    const tier = pick(
      ctx,
      [
        ['fast', 'fast'],
        ['balanced', 'balanced'],
        ['best', 'best'],
      ],
      m.tier,
    );
    const json = tick(ctx, m.capabilities.json);
    const tools = tick(ctx, m.capabilities.tools);
    const vision = tick(ctx, m.capabilities.vision);
    const ctxTokens = num(ctx, m.contextTokens);
    const inP = num(ctx, m.price.inputPerMTok);
    const outP = num(ctx, m.price.outputPerMTok);
    const img = num(ctx, m.price.perImage);
    const sec = num(ctx, m.price.perSecond);
    const min = num(ctx, m.price.perMinute);
    const margin = num(ctx, m.creditMargin);
    const on = tick(ctx, m.enabled);
    mrows.append(
      ctx.el(
        'details',
        { class: 'card', 'data-model': m.id },
        ctx.el(
          'summary',
          {},
          `${m.name.en} (${c.providers.find((p) => p.id === m.providerId)?.name ?? m.providerId}) — ${tags(m)}${m.enabled ? '' : ' — off'}`,
        ),
        ctx.el(
          'div',
          { class: 'row' },
          field(ctx, 'Name', name),
          field(ctx, "The provider's model name", pm),
          field(ctx, 'Provider', prov),
          field(ctx, 'Kind', kind),
          field(ctx, 'Tier', tier),
          field(ctx, 'Gives JSON answers', json),
          field(ctx, 'Can call tools', tools),
          field(ctx, 'Understands pictures', vision),
          field(ctx, 'Context size (tokens)', ctxTokens),
          field(ctx, 'USD per million input tokens', inP),
          field(ctx, 'USD per million output tokens', outP),
          field(ctx, 'USD per image', img),
          field(ctx, 'USD per second', sec),
          field(ctx, 'USD per minute', min),
          field(ctx, 'Credit margin (1 = at cost)', margin),
          field(ctx, 'On', on),
          saveButton(
            ctx,
            'Save model',
            () => {
              const next = clone(c);
              const q = next.models.find((x) => x.id === m.id)!;
              q.name = { ...q.name, en: name.value.trim() };
              q.providerModel = pm.value.trim();
              q.providerId = prov.value;
              q.kind = kind.value as Model['kind'];
              q.tier = tier.value as Model['tier'];
              q.capabilities = {
                json: json.checked,
                tools: tools.checked,
                vision: vision.checked,
              };
              q.contextTokens = Number(ctxTokens.value) || 0;
              q.price = {
                inputPerMTok: Number(inP.value) || 0,
                outputPerMTok: Number(outP.value) || 0,
                perImage: Number(img.value) || 0,
                perSecond: Number(sec.value) || 0,
                perMinute: Number(min.value) || 0,
              };
              q.creditMargin = Math.max(1, Number(margin.value) || 1);
              q.samplePrice = false;
              q.enabled = on.checked;
              return next;
            },
            `model ${m.id}`,
          ),
          saveButton(
            ctx,
            'Delete model',
            () => {
              const next = clone(c);
              next.models = next.models.filter((x) => x.id !== m.id);
              for (const r of Object.keys(next.assignments))
                if (next.assignments[r] === m.id) delete next.assignments[r];
              return next;
            },
            `delete model ${m.id}`,
          ),
        ),
      ),
    );
  }
  const mName = text(ctx, '', 'new-model-name');
  const mPm = text(ctx, '', 'new-model-id');
  const mProv = pick(
    ctx,
    c.providers.map((p) => [p.id, p.name] as const),
    c.providers.at(-1)?.id ?? '',
    'new-model-provider',
  );
  const mKind = pick(
    ctx,
    MODEL_KINDS.map((k) => [k, k] as const),
    'text',
    'new-model-kind',
  );
  const mJson = tick(ctx, false, 'new-model-json');
  const mTools = tick(ctx, false);
  const mVision = tick(ctx, false);
  root.append(
    card(
      ctx,
      'Models',
      note(
        ctx,
        'Tick what each model can really do: only models that can do a job are offered for it below. Prices you enter replace the sample prices.',
      ),
      mrows,
      ctx.el(
        'div',
        { class: 'row', id: 'add-model' },
        field(ctx, 'Name', mName),
        field(ctx, "The provider's model name", mPm),
        field(ctx, 'Provider', mProv),
        field(ctx, 'Kind', mKind),
        field(ctx, 'Gives JSON answers', mJson),
        field(ctx, 'Can call tools', mTools),
        field(ctx, 'Understands pictures', mVision),
        saveButton(
          ctx,
          'Add model',
          () => {
            const next = clone(c);
            const id = slug(mName.value) || 'model';
            if (next.models.some((x) => x.id === id))
              throw new Error('A model with that name exists.');
            if (!mProv.value) throw new Error('Add a provider first.');
            next.models.push({
              id,
              providerId: mProv.value,
              providerModel: mPm.value.trim(),
              kind: mKind.value as Model['kind'],
              name: { en: mName.value.trim() },
              tier: 'balanced',
              capabilities: {
                json: mJson.checked,
                tools: mTools.checked,
                vision: mVision.checked,
              },
              contextTokens: 0,
              price: {
                inputPerMTok: 0,
                outputPerMTok: 0,
                perImage: 0,
                perSecond: 0,
                perMinute: 0,
              },
              creditMargin: 1,
              roles: [],
              requires: [],
              enabled: true,
              recommendedForDirector: false,
              tested: false,
              samplePrice: true,
              params: [],
              order: next.models.length,
            });
            return next;
          },
          'add model',
          'add-model-save',
        ),
      ),
    ),
  );

  // ---- assignment table
  const slots = slotsOf(c);
  const grid = ctx.el('div', { id: 'assignments' });
  const controls: {
    slot: Slot;
    main: HTMLSelectElement;
    others: Map<string, HTMLInputElement>;
  }[] = [];
  for (const s of slots) {
    const options = c.models.filter((m) => capable(m, s));
    const main = pick(
      ctx,
      [
        ['', '— not chosen yet —'] as const,
        ...options.map((m) => [m.id, `${m.name.en} · ${tags(m)}`] as const),
      ],
      c.assignments[s.role] ?? '',
    );
    main.setAttribute('data-slot', s.role);
    const others = new Map<string, HTMLInputElement>();
    const alsoBox = ctx.el('div', { class: 'bar' });
    for (const m of options) {
      const box = tick(
        ctx,
        m.roles.includes(s.role) && c.assignments[s.role] !== m.id,
      );
      others.set(m.id, box);
      alsoBox.append(ctx.el('label', {}, box, ` ${m.name.en}`));
    }
    const wrongOnes = c.models.filter(
      (m) => m.roles.includes(s.role) && !capable(m, s),
    );
    grid.append(
      ctx.el(
        'div',
        { class: 'row card', 'data-role': s.role },
        ctx.el('strong', {}, s.label),
        field(ctx, 'Main model', main),
        options.length
          ? ctx.el(
              'div',
              {},
              ctx.el('small', {}, 'Also offered to people who pick a model:'),
              alsoBox,
            )
          : note(ctx, 'No model can do this yet. Add one above.'),
        wrongOnes.length
          ? note(
              ctx,
              `Cannot do this job, will be removed on save: ${wrongOnes.map((m) => m.name.en).join(', ')}`,
            )
          : '',
      ),
    );
    controls.push({ slot: s, main, others });
  }
  root.append(
    card(
      ctx,
      'Which model does which job',
      note(
        ctx,
        'Each list only shows models that can do the job (the right kind, and JSON answers where the job needs them).',
      ),
      grid,
      saveButton(
        ctx,
        'Save assignments',
        () => {
          const next = clone(c);
          for (const { slot, main, others } of controls) {
            const chosen = new Set<string>();
            if (main.value) chosen.add(main.value);
            for (const [id, box] of others) if (box.checked) chosen.add(id);
            for (const m of next.models) {
              const has = m.roles.includes(slot.role);
              const want = chosen.has(m.id);
              if (want && !has) m.roles.push(slot.role);
              if (!want && has)
                m.roles = m.roles.filter((r) => r !== slot.role);
            }
            if (main.value) next.assignments[slot.role] = main.value;
            else delete next.assignments[slot.role];
          }
          return next;
        },
        'model assignments',
        'assignments-save',
      ),
    ),
  );
  return root;
}
const MODEL_KINDS = [
  'text',
  'image',
  'video',
  'voice',
  'music',
  'stt',
] as const;
function kindsOf(): readonly Provider['kind'][] {
  return [
    'anthropic',
    'openai',
    'google',
    'xai',
    'openai-compatible',
    'elevenlabs',
    'video-jobs',
    'mock',
  ];
}

// ------------------------------------------------------------------ users

async function users(ctx: AdminCtx) {
  const search = text(ctx, '', 'user-search');
  const out = ctx.el('div', { id: 'user-list' });
  const detail = ctx.el('div', { id: 'user-detail' });
  const load = async () => {
    const q = search.value.trim()
      ? `?search=${encodeURIComponent(search.value.trim())}`
      : '';
    const page = await ctx.api<{ rows: UserRow[]; next: string | null }>(
      'GET',
      `/api/admin/users${q}`,
    );
    out.replaceChildren(
      page.rows.length === 0
        ? note(ctx, 'Nobody matches.')
        : table(
            ctx,
            ['Email', 'Plan', 'Credits', 'Flags', 'Status', 'Last seen', ''],
            page.rows.map((r) => [
              r.email,
              r.planId,
              String(r.credits),
              r.flags.join(', '),
              r.suspended ? 'suspended' : 'ok',
              when(r.lastSeenAt),
              action(ctx, 'Open', async () => show(r.userId), {
                'data-user': r.userId,
              }),
            ]),
          ),
    );
  };
  const config = (await loadConfig(ctx)).config;
  const show = async (id: string) => {
    const u = await ctx.api<UserDetail>(
      'GET',
      `/api/admin/users/${encodeURIComponent(id)}`,
    );
    const delta = num(ctx, 0, 'credit-delta');
    const reason = text(ctx, '', 'user-reason');
    reason.setAttribute('placeholder', 'Why (kept in the audit log)');
    const plan = pick(
      ctx,
      config.plans.map((p) => [p.id, p.name.en] as const),
      u.planId,
      'user-plan',
    );
    const flag = text(ctx, '', 'user-flag');
    const needReason = () => {
      if (!reason.value.trim()) throw new Error('Write a reason first.');
      return reason.value.trim();
    };
    const go = async (path: string, body: unknown, done: string) => {
      const r = await ctx.guarded(() =>
        ctx.api(
          'POST',
          `/api/admin/users/${encodeURIComponent(id)}/${path}`,
          body,
        ),
      );
      if (r === null) return 'Cancelled.';
      await load();
      await show(id);
      return done;
    };
    detail.replaceChildren(
      card(
        ctx,
        u.email,
        ctx.el(
          'p',
          {},
          `Plan ${u.planId} · ${u.credits} credits · ${u.suspended ? 'SUSPENDED' : 'active'} · joined ${when(u.createdAt)}`,
        ),
        ctx.el(
          'div',
          { class: 'row' },
          field(ctx, 'Reason', reason),
          field(ctx, 'Add or take credits (use − to take)', delta),
          action(
            ctx,
            'Change credits',
            () =>
              go(
                'credits',
                {
                  delta: Math.trunc(Number(delta.value)),
                  reason: needReason(),
                  requestId: crypto.randomUUID(),
                },
                'Credits changed.',
              ),
            { 'data-act': 'credits' },
          ),
          field(ctx, 'Plan', plan),
          action(
            ctx,
            'Change plan',
            () =>
              go(
                'plan',
                { planId: plan.value, reason: needReason() },
                'Plan changed.',
              ),
            { 'data-act': 'plan' },
          ),
          action(
            ctx,
            u.suspended ? 'Unsuspend' : 'Suspend',
            () =>
              go(
                'suspension',
                { suspended: !u.suspended, reason: needReason() },
                u.suspended ? 'Back to active.' : 'Suspended.',
              ),
            { 'data-act': 'suspend' },
          ),
          field(ctx, 'Feature flag', flag),
          action(ctx, 'Turn flag on', () =>
            go('flags', { flag: flag.value.trim(), on: true }, 'Flag on.'),
          ),
          action(ctx, 'Turn flag off', () =>
            go('flags', { flag: flag.value.trim(), on: false }, 'Flag off.'),
          ),
        ),
        ctx.el('h3', {}, 'Credit history'),
        table(
          ctx,
          ['When', 'Change', 'Reason'],
          u.ledger
            .slice(-30)
            .reverse()
            .map((l) => [when(l.at), String(l.delta), l.reason]),
        ),
        ctx.el('h3', {}, 'Payments'),
        table(
          ctx,
          ['When', 'Provider', 'Amount', 'Status', ''],
          u.payments.map((p) => [
            when(p.at),
            p.provider,
            money(p.amount),
            p.status,
            p.status === 'paid'
              ? action(ctx, 'Refund in full', async () => {
                  const why = needReason();
                  const r = await ctx.guarded(() =>
                    ctx.api('POST', '/api/admin/refunds', {
                      paymentId: p.paymentId,
                      amountMinor: null,
                      reason: why,
                      revokeCredits: true,
                      requestId: crypto.randomUUID(),
                    }),
                  );
                  if (r === null) return 'Cancelled.';
                  await show(id);
                  return 'Refunded; the credits it gave were taken back.';
                })
              : '',
          ]),
        ),
      ),
    );
  };
  const go = action(ctx, 'Search', async () => load(), {
    id: 'user-search-go',
  });
  await load();
  return card(
    ctx,
    ADMIN_LABELS.users.en,
    ctx.el('div', { class: 'bar' }, search, go),
    out,
    detail,
  );
}

// ------------------------------------------------------------------ plans

async function plans(ctx: AdminCtx) {
  const live = await loadConfig(ctx);
  const c = live.config;
  const root = ctx.el('div', { id: 'plans' });
  root.append(
    note(
      ctx,
      'Prices, monthly credits and limits. People see the change on their next page load. Save asks for your code.',
    ),
  );
  const forms: { id: string; read: (p: Plan) => void }[] = [];
  for (const p of c.plans) {
    const name = text(ctx, p.name.en);
    const priceInr = num(ctx, p.price.inr);
    const priceUsd = num(ctx, p.price.usd);
    const credits = num(ctx, p.monthlyCredits);
    const storage = num(ctx, p.limits.storageMb);
    const exportsPerMonth = num(ctx, p.limits.exportsPerMonth);
    const height = num(ctx, p.limits.maxExportHeight);
    const projects = num(ctx, p.limits.projects);
    const calls = num(ctx, p.limits.callsPerMinute);
    const perDay = num(ctx, p.limits.creditsPerDay);
    const features = text(ctx, p.features.join(', '));
    const watermark = tick(ctx, p.watermark);
    const isPublic = tick(ctx, p.public);
    const orNull = (i: HTMLInputElement) =>
      i.value.trim() === '' ? null : Math.max(0, Math.trunc(Number(i.value)));
    forms.push({
      id: p.id,
      read: (q) => {
        q.name = { ...q.name, en: name.value.trim() };
        q.price = {
          inr: Math.max(0, Number(priceInr.value) || 0),
          usd: Math.max(0, Number(priceUsd.value) || 0),
        };
        q.monthlyCredits = Math.max(0, Math.trunc(Number(credits.value)));
        q.limits.storageMb = Math.max(0, Math.trunc(Number(storage.value)));
        q.limits.exportsPerMonth = orNull(exportsPerMonth);
        q.limits.maxExportHeight = Math.max(
          144,
          Math.trunc(Number(height.value)),
        );
        q.limits.projects = orNull(projects);
        q.limits.callsPerMinute = Math.max(1, Math.trunc(Number(calls.value)));
        q.limits.creditsPerDay = orNull(perDay);
        q.features = features.value
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        q.watermark = watermark.checked;
        q.public = isPublic.checked;
      },
    });
    root.append(
      ctx.el(
        'details',
        { class: 'card', 'data-plan': p.id },
        ctx.el(
          'summary',
          {},
          `${p.name.en} — INR ${p.price.inr} / USD ${p.price.usd} — ${p.monthlyCredits} credits`,
        ),
        ctx.el(
          'div',
          { class: 'row' },
          field(ctx, 'Name', name),
          field(ctx, 'Price (INR)', priceInr),
          field(ctx, 'Price (USD)', priceUsd),
          field(ctx, 'Credits each month', credits),
          field(ctx, 'Cloud space (MB)', storage),
          field(ctx, 'Exports each month (empty: no cap)', exportsPerMonth),
          field(ctx, 'Highest export height (px)', height),
          field(ctx, 'Projects (empty: no cap)', projects),
          field(ctx, 'AI calls per minute', calls),
          field(ctx, 'Credits per day (empty: no cap)', perDay),
          field(ctx, 'Features (comma separated)', features),
          field(ctx, 'Watermark on exports', watermark),
          field(ctx, 'Shown on the website', isPublic),
        ),
      ),
    );
  }
  root.append(
    saveButton(
      ctx,
      'Save plans',
      () => {
        const next = clone(c);
        for (const f of forms) f.read(next.plans.find((p) => p.id === f.id)!);
        return next;
      },
      'plans and credits',
      'plans-save',
    ),
  );
  const rate = num(ctx, c.creditRate, 'credit-rate');
  root.append(
    card(
      ctx,
      'Credit rate',
      note(
        ctx,
        "How many credits one USD of provider cost becomes (before each model's margin).",
      ),
      field(ctx, 'Credits per USD', rate),
      saveButton(
        ctx,
        'Save credit rate',
        () => {
          const next = clone(c);
          next.creditRate = Math.max(0, Number(rate.value) || 0);
          return next;
        },
        'credit rate',
      ),
    ),
  );
  return card(ctx, ADMIN_LABELS.plans.en, root);
}

// ------------------------------------------------------------------ flags

async function flags(ctx: AdminCtx) {
  const rows = await ctx.api<
    { flag: string; description: string; users: number }[]
  >('GET', '/api/admin/flags');
  return card(
    ctx,
    ADMIN_LABELS.flags.en,
    note(
      ctx,
      'A flag is switched on or off for one person in Users. This list shows every flag in use and how many people have it.',
    ),
    rows.length
      ? table(
          ctx,
          ['Flag', 'People'],
          rows.map((r) => [r.flag, String(r.users)]),
          'flags',
        )
      : note(ctx, 'No flag is in use yet.'),
  );
}

// --------------------------------------------------------------- director

async function director(ctx: AdminCtx) {
  const c = (await loadConfig(ctx)).config;
  const d = c.director;
  const persona = ctx.el('textarea', { id: 'director-persona', rows: '4' });
  persona.value = d.persona.en;
  const scenes = num(ctx, d.limits.maxScenes, 'limit-scenes');
  const sceneSec = num(ctx, d.limits.maxSceneSeconds);
  const narr = num(ctx, d.limits.maxNarrationChars);
  const outTok = num(ctx, d.limits.planOutputTokens);
  const toolBoxes = d.tools.map((t) => ({
    t,
    on: tick(ctx, t.enabled),
    approve: tick(ctx, t.needsApproval),
  }));
  const chatOn = tick(ctx, c.p3.chat.enabled, 'chat-on');
  const chatMax = num(ctx, c.p3.chat.maxMessagesPerDay, 'chat-max');
  return card(
    ctx,
    ADMIN_LABELS.director.en,
    note(
      ctx,
      'What Director may do, how big a plan can be, and the editor chat. Which model plans and writes is chosen in AI Providers & Models.',
    ),
    field(ctx, 'How Director talks (persona)', persona),
    ctx.el(
      'div',
      { class: 'row' },
      field(ctx, 'Most scenes in a plan', scenes),
      field(ctx, 'Longest scene (seconds)', sceneSec),
      field(ctx, 'Longest narration (characters)', narr),
      field(ctx, 'Plan answer size (tokens)', outTok),
    ),
    ctx.el('h3', {}, 'Tools Director may use'),
    table(
      ctx,
      ['Tool', 'On', 'Asks the person first'],
      toolBoxes.map((b) => [b.t.id, b.on, b.approve]),
      'director-tools',
    ),
    ctx.el('h3', {}, 'Editor chat'),
    ctx.el(
      'div',
      { class: 'row' },
      field(ctx, 'Editor chat is on', chatOn),
      field(ctx, 'Messages per person per day', chatMax),
    ),
    saveButton(
      ctx,
      'Save Director rules',
      () => {
        const next = clone(c);
        next.director.persona = { ...next.director.persona, en: persona.value };
        next.director.limits.maxScenes = Math.max(
          1,
          Math.trunc(Number(scenes.value)),
        );
        next.director.limits.maxSceneSeconds = Math.max(
          1,
          Number(sceneSec.value),
        );
        next.director.limits.maxNarrationChars = Math.max(
          20,
          Math.trunc(Number(narr.value)),
        );
        next.director.limits.planOutputTokens = Math.max(
          500,
          Math.trunc(Number(outTok.value)),
        );
        for (const b of toolBoxes) {
          const t = next.director.tools.find((x) => x.id === b.t.id)!;
          t.enabled = b.on.checked;
          t.needsApproval = b.approve.checked;
        }
        next.p3.chat.enabled = chatOn.checked;
        next.p3.chat.maxMessagesPerDay = Math.max(
          1,
          Math.trunc(Number(chatMax.value)),
        );
        return next;
      },
      'director rules',
      'director-save',
    ),
  );
}

// -------------------------------------------------------------- workspace

async function workspace(ctx: AdminCtx) {
  const c = (await loadConfig(ctx)).config;
  const w = c.workspace;
  const trash = num(ctx, w.trashDays, 'ws-trash');
  const styleChat = tick(ctx, w.styleChat, 'ws-style-chat');
  const credits = num(ctx, w.styleCreation.credits, 'ws-style-credits');
  const requires = text(
    ctx,
    w.styleCreation.requires.join(', '),
    'ws-style-requires',
  );
  const perPlan = c.plans.map((p) => ({
    p,
    max: num(ctx, w.maxProjectsPerStyle[p.id] ?? null),
    director: tick(
      ctx,
      (w.startOptions[p.id] ?? ['director', 'blank']).includes('director'),
    ),
    blank: tick(
      ctx,
      (w.startOptions[p.id] ?? ['director', 'blank']).includes('blank'),
    ),
  }));
  return card(
    ctx,
    ADMIN_LABELS.workspace.en,
    note(ctx, 'How projects, Styles and the Trash behave for people.'),
    ctx.el(
      'div',
      { class: 'row' },
      field(ctx, 'Days a deleted project waits in the Trash', trash),
      field(ctx, 'Style chat is on', styleChat),
      field(ctx, 'Credits one "Save to your styles" costs (0: free)', credits),
      field(
        ctx,
        'Plan features needed to save a Style (empty: every plan)',
        requires,
      ),
    ),
    table(
      ctx,
      [
        'Plan',
        'Most projects in one Style (empty: no cap)',
        'Can start with Director',
        'Can start blank',
      ],
      perPlan.map((r) => [r.p.name.en, r.max, r.director, r.blank]),
      'ws-plans',
    ),
    saveButton(
      ctx,
      'Save',
      () => {
        const next = clone(c);
        next.workspace.trashDays = Math.max(0, Math.trunc(Number(trash.value)));
        next.workspace.styleChat = styleChat.checked;
        next.workspace.styleCreation.credits = Math.max(
          0,
          Math.trunc(Number(credits.value)),
        );
        next.workspace.styleCreation.requires = requires.value
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        next.workspace.maxProjectsPerStyle = {};
        next.workspace.startOptions = {};
        for (const r of perPlan) {
          if (r.max.value.trim() !== '')
            next.workspace.maxProjectsPerStyle[r.p.id] = Math.max(
              0,
              Math.trunc(Number(r.max.value)),
            );
          const opts: ('director' | 'blank')[] = [];
          if (r.director.checked) opts.push('director');
          if (r.blank.checked) opts.push('blank');
          if (opts.length === 0)
            throw new Error(`${r.p.name.en} needs at least one way to start.`);
          if (opts.length < 2) next.workspace.startOptions[r.p.id] = opts;
        }
        return next;
      },
      'projects and styles',
      'workspace-save',
    ),
  );
}

// ---------------------------------------------------------------- engines

async function engines(ctx: AdminCtx) {
  const c = (await loadConfig(ctx)).config;
  const keys = (await ctx.api<{ keys: KeyInfo[] }>('GET', '/api/admin/keys'))
    .keys;
  const special = c.providers.filter(
    (p) => p.kind === 'elevenlabs' || p.kind === 'video-jobs',
  );
  return card(
    ctx,
    ADMIN_LABELS.engines.en,
    note(
      ctx,
      "Stock pictures, videos and sounds come from your signed Library (Library tab), so people need no stock key. Offline speech and captions (Whisper) run inside each person's browser and need no server key.",
    ),
    ctx.el('h3', {}, 'Voice and video services on the server'),
    special.length
      ? table(
          ctx,
          ['Service', 'Type', 'Key'],
          special.map((p) => [
            p.name,
            p.kind,
            keys.find((k) => k.name === p.keyRef)?.set ? 'saved' : 'no key yet',
          ]),
          'engines',
        )
      : note(
          ctx,
          'No voice or video service is added yet. Add one under AI Providers & Models.',
        ),
  );
}

// ------------------------------------------------------------ admin audit

async function gatewayAudit(ctx: AdminCtx) {
  const data = await ctx.api<{
    rows: {
      seq: number;
      at: string;
      actor: string;
      action: string;
      target: string;
      detail: Record<string, unknown>;
    }[];
    chainOk: boolean;
  }>('GET', '/api/admin/audit');
  return card(
    ctx,
    ADMIN_LABELS.gateway.en,
    ctx.el(
      'p',
      { id: 'gateway-audit-state', class: data.chainOk ? 'ok' : 'error' },
      data.chainOk
        ? 'The admin audit chain is intact.'
        : 'The admin audit chain does NOT verify.',
    ),
    table(
      ctx,
      ['#', 'When', 'Who', 'Action', 'Target', 'Detail'],
      data.rows
        .slice()
        .reverse()
        .slice(0, 200)
        .map((r) => [
          String(r.seq),
          when(r.at),
          r.actor,
          r.action,
          r.target,
          JSON.stringify(r.detail),
        ]),
      'gateway-audit',
    ),
  );
}

// -------------------------------------------------------------- emergency

async function emergency(ctx: AdminCtx) {
  const e = await ctx.api<Emergency>('GET', '/api/admin/emergency');
  const ai = tick(ctx, e.aiOff, 'em-ai');
  const signups = tick(ctx, e.signupsOff, 'em-signups');
  const payments = tick(ctx, e.paymentsOff, 'em-payments');
  const msg = text(ctx, e.message.en, 'em-message');
  const reason = text(ctx, '', 'em-reason');
  return card(
    ctx,
    ADMIN_LABELS.emergency.en,
    note(
      ctx,
      'Stops things at once for everyone. Credits are not touched. Turn a switch off again to resume.',
    ),
    ctx.el(
      'div',
      { class: 'row' },
      field(ctx, 'Stop every AI call', ai),
      field(ctx, 'Stop new sign-ups', signups),
      field(ctx, 'Stop payments and top-ups', payments),
      field(ctx, 'Sentence people see', msg),
      field(ctx, 'Why (kept in the audit log)', reason),
    ),
    action(
      ctx,
      'Apply',
      async () => {
        if (!reason.value.trim()) throw new Error('Write a reason first.');
        const r = await ctx.guarded(() =>
          ctx.api('POST', '/api/admin/emergency', {
            aiOff: ai.checked,
            signupsOff: signups.checked,
            paymentsOff: payments.checked,
            message: {
              en: msg.value || 'The service is paused for a short time.',
            },
            reason: reason.value.trim(),
            requestId: crypto.randomUUID(),
          }),
        );
        if (r === null) return 'Cancelled.';
        ctx.refresh();
        return 'Applied.';
      },
      { class: 'primary', id: 'em-apply' },
    ),
  );
}

// ----------------------------------------------------------- raw config

async function rawConfig(ctx: AdminCtx) {
  const live = await loadConfig(ctx);
  const box = ctx.el('textarea', {
    id: 'config-json',
    rows: '28',
    spellcheck: 'false',
  });
  box.value = JSON.stringify(live.config, null, 2);
  return card(
    ctx,
    ADMIN_LABELS.config.en,
    note(
      ctx,
      `Version ${live.version}. The whole Platform Config as text, for anything the screens above do not cover. The server checks it before it goes live; nothing wrong can be published.`,
    ),
    box,
    saveButton(
      ctx,
      'Save and publish',
      () => {
        try {
          return JSON.parse(box.value) as PlatformConfig;
        } catch {
          throw new Error('That is not valid JSON.');
        }
      },
      'platform config (text editor)',
      'config-save',
    ),
  );
}

// ----------------------------------------------------- studio tools & forms

const FIELD_TYPE_LIST = [
  'text',
  'longtext',
  'choice',
  'multi',
  'toggle',
  'number',
  'slider',
  'color',
  'file',
  'voice',
] as const;
/** A field as the screen edits it: a Studio input (brief field) or a model parameter. */
interface EditableField {
  id: string;
  type: string;
  label: { en: string; hi?: string };
  required?: boolean;
  options?: { value: string; label: { en: string; hi?: string } }[];
  default?: string | number | boolean | string[];
  group?: string;
  order?: number;
}
const optionsText = (f: EditableField) =>
  (f.options ?? []).map((o) => `${o.value}=${o.label.en}`).join(', ');
function parseOptions(
  value: string,
  before: EditableField['options'] = [],
): NonNullable<EditableField['options']> {
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [v, ...rest] = x.split('=');
      const value = (v ?? '').trim();
      const label = rest.join('=').trim() || value;
      const old = before.find((o) => o.value === value);
      return {
        ...(old ?? {}),
        value,
        label: { ...(old?.label ?? {}), en: label },
      };
    });
}
const defaultText = (f: EditableField) =>
  f.default === undefined
    ? ''
    : Array.isArray(f.default)
      ? f.default.join(',')
      : String(f.default);
function typedDefault(f: EditableField, v: string): EditableField['default'] {
  if (v.trim() === '') return undefined;
  if (f.type === 'number' || f.type === 'slider') return Number(v);
  if (f.type === 'toggle') return v === 'true';
  if (f.type === 'multi')
    return v
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return v;
}
/**
 * A table of fields the owner can edit (label, kind, required, default,
 * options, where it sits) and, for Studio inputs, add to or remove. `read()`
 * returns the edited list; an id never changes (saved work refers to it).
 */
function fieldEditor(
  ctx: AdminCtx,
  fields: readonly EditableField[],
  opts: { canAdd: boolean; params: boolean; idPrefix: string },
) {
  type Row = {
    f: EditableField;
    label: HTMLInputElement;
    type: HTMLSelectElement;
    required: HTMLInputElement;
    def: HTMLInputElement;
    options: HTMLInputElement;
    group: HTMLSelectElement | null;
    removed: boolean;
    tr: HTMLTableRowElement;
  };
  const rows: Row[] = [];
  const body = ctx.el('tbody', {});
  const draw = (f: EditableField, isNew = false) => {
    const label = text(ctx, f.label.en);
    const type = pick(
      ctx,
      FIELD_TYPE_LIST.concat(
        opts.params ? (['aspect', 'style-card', 'seed'] as never) : [],
      ).map((x) => [x, x] as const),
      f.type,
    );
    if (!isNew && opts.params) type.disabled = true;
    const required = tick(ctx, !!f.required);
    const def = text(ctx, defaultText(f));
    const options = text(ctx, optionsText(f));
    const group = opts.params
      ? pick(
          ctx,
          [
            ['basic', 'Always shown'],
            ['advanced', 'Under More options'],
          ],
          f.group ?? 'basic',
        )
      : null;
    const remove = ctx.el(
      'button',
      { type: 'button', 'data-act': 'remove-field' },
      'Remove',
    );
    const tr = ctx.el(
      'tr',
      { 'data-field-id': f.id },
      ctx.el('td', {}, ctx.el('code', {}, f.id)),
      ctx.el('td', {}, label),
      ctx.el('td', {}, type),
      ctx.el('td', {}, required),
      ctx.el('td', {}, def),
      ctx.el('td', {}, options),
      ...(group ? [ctx.el('td', {}, group)] : []),
      ctx.el('td', {}, opts.canAdd || isNew ? remove : ''),
    );
    const row: Row = {
      f,
      label,
      type,
      required,
      def,
      options,
      group,
      removed: false,
      tr,
    };
    remove.onclick = () => {
      row.removed = true;
      tr.hidden = true;
    };
    rows.push(row);
    body.append(tr);
  };
  for (const f of fields) draw(f);
  const head = [
    'Field',
    'Label',
    'Kind',
    'Needed',
    'Starts as',
    'Choices (value=Label, …)',
  ]
    .concat(opts.params ? ['Shown'] : [])
    .concat(['']);
  const addLabel = text(ctx, '', `${opts.idPrefix}-new-label`);
  const addType = pick(
    ctx,
    FIELD_TYPE_LIST.map((x) => [x, x] as const),
    'text',
  );
  const add = opts.canAdd
    ? ctx.el(
        'div',
        { class: 'bar' },
        addLabel,
        addType,
        ctx.el(
          'button',
          {
            type: 'button',
            'data-act': 'add-field',
            id: `${opts.idPrefix}-add`,
          },
          'Add a field',
        ),
      )
    : null;
  if (add) {
    (add.lastElementChild as HTMLButtonElement).onclick = () => {
      const name = addLabel.value.trim();
      if (!name) return say(ctx, 'Name the new field first.', false);
      let id = slug(name).replace(/-/g, '_') || 'field';
      while (rows.some((r) => r.f.id === id)) id += '_2';
      const f: EditableField = {
        id,
        type: addType.value,
        label: { en: name },
        required: false,
        options: [],
      };
      draw(f, true);
      addLabel.value = '';
    };
  }
  return {
    el: ctx.el(
      'div',
      {},
      ctx.el(
        'table',
        {},
        ctx.el(
          'thead',
          {},
          ctx.el('tr', {}, ...head.map((x) => ctx.el('th', {}, x))),
        ),
        body,
      ),
      add ?? '',
    ),
    read(): EditableField[] {
      const out: EditableField[] = [];
      let order = 0;
      for (const r of rows) {
        if (r.removed) continue;
        const next: EditableField = {
          ...r.f,
          type: r.type.value,
          label: { ...r.f.label, en: r.label.value.trim() || r.f.id },
          required: r.required.checked,
          options: parseOptions(r.options.value, r.f.options),
          order: ++order,
        };
        if (r.group) next.group = r.group.value;
        const d = typedDefault(next, r.def.value);
        if (d === undefined) delete next.default;
        else next.default = d;
        out.push(next);
      }
      return out;
    },
  };
}

async function studios(ctx: AdminCtx) {
  const live = await loadConfig(ctx);
  const c = live.config;
  const root = ctx.el('div', { id: 'studios' });
  root.append(
    note(
      ctx,
      'What each Studio tool asks the person. The starting fields are samples; edit them here and the panel shows the change at once. Tools in one family (such as Voice) are tabs of one tool.',
    ),
  );
  const editors: {
    studio: Studio;
    on: HTMLInputElement;
    name: HTMLInputElement;
    requires: HTMLInputElement;
    fields: ReturnType<typeof fieldEditor>;
  }[] = [];
  for (const s of c.studios) {
    const on = tick(ctx, s.enabled);
    const name = text(ctx, s.name.en);
    const requires = text(ctx, s.requires.join(', '));
    const fields = fieldEditor(ctx, s.inputs as EditableField[], {
      canAdd: true,
      params: false,
      idPrefix: `studio-${s.id}`,
    });
    editors.push({ studio: s, on, name, requires, fields });
    root.append(
      ctx.el(
        'details',
        { class: 'card', 'data-studio': s.id },
        ctx.el(
          'summary',
          {},
          `${s.name.en}${s.family ? ` (tab of ${s.familyName?.en ?? s.family})` : ''}${s.enabled ? '' : ' (off)'} — makes ${s.output}`,
        ),
        ctx.el(
          'div',
          { class: 'row' },
          field(ctx, 'On', on),
          field(ctx, 'Name', name),
          field(ctx, 'Plan features needed (comma separated)', requires),
        ),
        fields.el,
      ),
    );
  }
  // The parameters a model declares (they decide the Studio form when a
  // model is chosen). Existing ones can be edited; the provider decides which
  // exist.
  const modelEditors: { id: string; fields: ReturnType<typeof fieldEditor> }[] =
    [];
  const modelBox = ctx.el('div', { id: 'model-forms' });
  for (const m of c.models.filter((x) => x.params.length > 0)) {
    const fields = fieldEditor(ctx, m.params as unknown as EditableField[], {
      canAdd: false,
      params: true,
      idPrefix: `model-${m.id}`,
    });
    modelEditors.push({ id: m.id, fields });
    modelBox.append(
      ctx.el(
        'details',
        { class: 'card', 'data-model-form': m.id },
        ctx.el('summary', {}, `${m.name.en}: ${m.params.length} fields`),
        fields.el,
      ),
    );
  }
  root.append(
    card(
      ctx,
      'Model forms',
      note(
        ctx,
        'When the chosen model declares its own fields, the person sees those (Basic and Pro).',
      ),
      modelBox,
    ),
    saveButton(
      ctx,
      'Save Studio forms',
      () => {
        const next = clone(c);
        for (const e of editors) {
          const t = next.studios.find((x) => x.id === e.studio.id)!;
          t.enabled = e.on.checked;
          t.name = { ...t.name, en: e.name.value.trim() || t.name.en };
          t.requires = e.requires.value
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
          t.inputs = e.fields.read() as unknown as BriefField[];
        }
        for (const e of modelEditors) {
          const m = next.models.find((x) => x.id === e.id)!;
          m.params = e.fields.read() as unknown as typeof m.params;
        }
        return next;
      },
      'studio forms',
      'studios-save',
    ),
  );
  return card(ctx, ADMIN_LABELS.studios.en, root);
}
