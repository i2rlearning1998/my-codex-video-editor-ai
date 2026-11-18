// ROUND-C5: the Owner App's Website & Brand, Appearance and Features & access
// routes (/api/site, /api/appearance, /api/access). Behind the owner's login
// and CSRF check like every /api route; every change is audited; changes
// that are dangerous (maintenance on, the brand's name or logo, a rollback,
// a personal override) need a fresh password and code. Config changes go
// through the admin bridge's config save and publish, the same path as every
// Admin tab, so the website, the panel and Claude see them with no redeploy.
// A save names the version it was edited from; a newer live version refuses
// it with the config-conflict sentence (two Admin tabs).
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  LIMIT_KEYS,
  checkOverride,
  type AccessOverride,
  type AccessRules,
  c5,
  checkSiteContent,
  hindiMissing,
  parseConfig,
  type PlatformConfig,
} from '../../src/platform-config';
import {
  checkAppearance,
  usedMedia,
  APPEARANCE_LIMITS,
} from '../../src/panel/appearance-data';
import { allSlots } from '../../src/panel/appearance';
import {
  HttpFail,
  type StyleBook,
  type StyleReply,
  type StyleRequest,
} from './styles';
import type { AdminBridge } from './admin-bridge';

export interface ContentDeps {
  readonly admin: AdminBridge;
  readonly book: StyleBook;
  readonly now: () => number;
  readonly outDir: string;
  readonly catalogUrl: string;
}

const json = (body: unknown, status = 200): StyleReply => ({
  kind: 'json',
  status,
  body,
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Legal page versions kept (1.7). */
export const LEGAL_HISTORY = 10;

/** Upload kinds: pictures (no SVG) and videos, checked by their first bytes. */
const KINDS: Record<string, { kind: 'image' | 'video'; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
};
/** The real kind of a file from its first bytes (a renamed file is caught). */
export function sniffKind(b: Buffer): string | null {
  if (b.subarray(0, 4).toString('hex') === '89504e47') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (
    b.subarray(0, 4).toString() === 'RIFF' &&
    b.subarray(8, 12).toString() === 'WEBP'
  )
    return 'webp';
  if (b.subarray(4, 8).toString() === 'ftyp') {
    const brand = b.subarray(8, 12).toString();
    return brand === 'avif' || brand === 'avis' ? 'avif' : 'mp4';
  }
  if (b.subarray(0, 4).toString('hex') === '1a45dfa3') return 'webm';
  return null;
}
const mb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`
    : `${Math.ceil(n / 1024)} KB`;

export function createContentRoutes(d: ContentDeps) {
  async function live(): Promise<{ version: number; config: PlatformConfig }> {
    const r = await d.admin.call('GET', '/v1/config', undefined, 'owner');
    if (r.status !== 200)
      throw new HttpFail(502, 'The settings could not be read.');
    return JSON.parse(r.body) as { version: number; config: PlatformConfig };
  }
  /** Publishes a config; refused when it was edited from an older version. */
  async function publish(
    req: StyleRequest,
    base: number | null,
    next: PlatformConfig,
    note: string,
  ) {
    const now = await live();
    if (base !== null && base !== now.version)
      throw new HttpFail(409, c5('config-conflict', req.lang), {
        code: 'config-conflict',
        live: now.version,
      });
    const parsed = parseConfig(next);
    if (!parsed.ok)
      throw new HttpFail(400, parsed.errors.slice(0, 5).join(' '));
    const r = await d.admin.call(
      'POST',
      '/v1/config',
      JSON.stringify({
        config: parsed.config,
        note: note.slice(0, 200),
        publish: true,
      }),
      req.who,
    );
    if (r.status !== 200) {
      const e = JSON.parse(r.body) as { error?: { message?: string } };
      throw new HttpFail(400, e.error?.message ?? 'The settings were refused.');
    }
    return (JSON.parse(r.body) as { version: number }).version;
  }
  const baseOf = (b: Record<string, unknown>) =>
    typeof b.baseVersion === 'number' ? b.baseVersion : null;
  const noteOf = (b: Record<string, unknown>) =>
    typeof b.note === 'string' ? b.note.slice(0, 200) : '';

  function store(bytes: Buffer, ext: string) {
    const sha = createHash('sha256').update(bytes).digest('hex');
    const dir = path.join(d.outDir, 'files');
    mkdirSync(dir, { recursive: true });
    const file = `${sha}.${ext}`;
    writeFileSync(path.join(dir, file), bytes);
    return `${d.catalogUrl.replace(/\/$/, '')}/files/${file}`;
  }
  /** Checks an upload: kind by its bytes, size by the owner's limits. */
  function checkUpload(
    req: StyleRequest,
    bytes: Buffer,
    name: string,
    allow: 'image' | 'video' | 'any',
    limits: { imageBytes: number; videoBytes: number },
  ) {
    const ext = path.extname(name).slice(1).toLowerCase();
    const real = sniffKind(bytes);
    const types =
      allow === 'image'
        ? 'PNG, JPEG, WebP or AVIF'
        : allow === 'video'
          ? 'MP4 or WebM'
          : 'PNG, JPEG, WebP, AVIF, MP4 or WebM';
    const t = real ? KINDS[real] : undefined;
    const claimed = KINDS[ext === 'jpeg' ? 'jpg' : ext];
    // The bytes decide; a name that says another kind is refused too.
    if (
      !t ||
      !claimed ||
      claimed.kind !== t.kind ||
      (allow !== 'any' && t.kind !== allow)
    )
      throw new HttpFail(415, c5('upload-wrong-type', req.lang, { types }));
    const limit = t.kind === 'image' ? limits.imageBytes : limits.videoBytes;
    if (bytes.length > limit)
      throw new HttpFail(
        413,
        c5('upload-too-big', req.lang, {
          size: mb(bytes.length),
          limit: mb(limit),
        }),
      );
    return { kind: t.kind, url: store(bytes, real!) };
  }

  // ------------------------------------------------------ Website & Brand
  async function siteRoute(req: StyleRequest): Promise<StyleReply | null> {
    const r = `${req.method} ${req.path}`;
    if (r === 'GET /api/site') {
      const { version, config } = await live();
      return json({
        version,
        brand: config.brand,
        site: config.site,
        hindiMissing: hindiMissing(config),
        history: d.book
          .versions('site')
          .map((v) => ({
            version: v.version,
            at: v.at,
            who: v.who,
            note: v.note,
            changed: v.changed,
          }))
          .reverse(),
        legalHistory: Object.fromEntries(
          (config.site.legal ?? []).map((p) => [
            p.id,
            d.book
              .versions(`legal:${p.id}`)
              .map((v) => ({ version: v.version, at: v.at, note: v.note }))
              .reverse(),
          ]),
        ),
      });
    }
    if (r === 'POST /api/site') {
      const b = await req.body();
      const { config: c } = await live();
      const next = clone(c);
      if (b.brand) next.brand = b.brand as PlatformConfig['brand'];
      if (b.site) next.site = b.site as PlatformConfig['site'];
      const parsed = parseConfig(next);
      if (!parsed.ok)
        throw new HttpFail(400, parsed.errors.slice(0, 5).join(' '));
      const out = parsed.config;
      const errors = checkSiteContent(out);
      if (errors.length) throw new HttpFail(400, errors.slice(0, 8).join(' '));
      // Dangerous changes ask for the password and code again (1.8).
      const dangerous: string[] = [];
      if (out.site.maintenance?.on && !c.site.maintenance?.on)
        dangerous.push('maintenance on');
      if (out.brand.name !== c.brand.name) dangerous.push('brand name');
      if (out.brand.logoUrl !== c.brand.logoUrl) dangerous.push('logo');
      if (dangerous.length) req.fresh('site save', dangerous.join(', '));
      // A changed banner shows again to people who closed it.
      if (out.site.banner && !same(out.site.banner, c.site.banner))
        out.site.banner.version = (c.site.banner?.version ?? 0) + 1;
      // A changed legal page gets a new version and date; the last 10 are kept.
      const today = new Date(d.now()).toISOString().slice(0, 10);
      for (const p of out.site.legal ?? []) {
        const old = (c.site.legal ?? []).find((x) => x.id === p.id);
        if (!old || !same([old.title, old.body], [p.title, p.body])) {
          p.version = (old?.version ?? 0) + 1;
          p.updated = today;
          legalPush(p.id, p, req.who, noteOf(b));
        }
      }
      const changed = [
        ...(same(c.brand, out.brand) ? [] : ['brand']),
        ...(
          [
            'sections',
            'showcase',
            'nav',
            'footer',
            'banner',
            'maintenance',
            'legal',
          ] as const
        ).filter((k) => !same(c.site[k], out.site[k])),
      ];
      const version = await publish(
        req,
        baseOf(b),
        out,
        `Website & Brand: ${noteOf(b) || changed.join(', ') || 'save'}`,
      );
      sitePush(out, req.who, noteOf(b), changed);
      req.log('site save', changed.join(','), `config ${version}`);
      return json({ version, changed, hindiMissing: hindiMissing(out) });
    }
    if (r === 'POST /api/site/rollback') {
      const b = await req.body();
      const v = d.book
        .versions('site')
        .find((x) => x.version === Number(b.version));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      req.fresh('site rollback', `v${v.version}`);
      const { config: c } = await live();
      const snap = v.snapshot as {
        brand: PlatformConfig['brand'];
        site: PlatformConfig['site'];
      };
      const next = { ...clone(c), brand: snap.brand, site: snap.site };
      const version = await publish(
        req,
        baseOf(b),
        next,
        `Website & Brand: rolled back to version ${v.version}`,
      );
      sitePush(next, req.who, `rolled back to version ${v.version}`, [
        'rollback',
      ]);
      req.log('site rollback', `v${v.version}`, `config ${version}`);
      return json({ version });
    }
    if (r === 'POST /api/site/legal-rollback') {
      const b = await req.body();
      const id = String(b.id ?? '');
      const v = d.book
        .versions(`legal:${id}`)
        .find((x) => x.version === Number(b.version));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      req.fresh('legal rollback', `${id} v${v.version}`);
      const { config: c } = await live();
      const next = clone(c);
      const snap = v.snapshot as NonNullable<
        PlatformConfig['site']['legal']
      >[number];
      const list = next.site.legal ?? [];
      const i = list.findIndex((p) => p.id === id);
      const page = {
        ...snap,
        version: (list[i]?.version ?? snap.version) + 1,
        updated: new Date(d.now()).toISOString().slice(0, 10),
      };
      if (i >= 0) list[i] = page;
      else list.push(page);
      next.site.legal = list;
      const version = await publish(
        req,
        baseOf(b),
        next,
        `Legal ${id}: rolled back to version ${v.version}`,
      );
      legalPush(id, page, req.who, `rolled back to version ${v.version}`);
      req.log('legal rollback', id, `config ${version}`);
      return json({ version });
    }
    if (r === 'POST /api/site/upload') {
      const name = decodeURIComponent(req.query.get('name') ?? '');
      const kind = req.query.get('kind') ?? 'image';
      const { config: c } = await live();
      const limits = c.appearance?.limits ?? APPEARANCE_LIMITS;
      const out = checkUpload(
        req,
        await req.raw(),
        name,
        kind === 'video' ? 'video' : 'image',
        limits,
      );
      req.log('site upload', kind, out.url);
      return json(out);
    }
    return null;
  }
  function sitePush(
    c: PlatformConfig,
    who: string,
    note: string,
    changed: string[],
  ) {
    const prev = d.book.versions('site');
    d.book.push('site', {
      version: (prev.at(-1)?.version ?? 0) + 1,
      at: new Date(d.now()).toISOString(),
      who,
      note,
      changed,
      snapshot: { brand: c.brand, site: c.site },
    });
  }
  function legalPush(id: string, page: unknown, who: string, note: string) {
    const key = `legal:${id}`;
    const prev = d.book.versions(key);
    const b = d.book.read();
    b.history[key] = [
      ...prev,
      {
        version: (page as { version: number }).version,
        at: new Date(d.now()).toISOString(),
        who,
        note,
        changed: ['legal'],
        snapshot: page,
      },
    ].slice(-LEGAL_HISTORY);
    d.book.write(b);
  }

  // ------------------------------------------------------------ Appearance
  async function appearanceRoute(
    req: StyleRequest,
  ): Promise<StyleReply | null> {
    const r = `${req.method} ${req.path}`;
    if (r === 'GET /api/appearance') {
      const { version, config } = await live();
      return json({
        version,
        appearance: config.appearance ?? { slots: {} },
        limits: config.appearance?.limits ?? APPEARANCE_LIMITS,
        slots: allSlots(config),
        unused: unusedFiles(config),
        unusedNote: c5('slot-unused', req.lang),
      });
    }
    if (r === 'POST /api/appearance') {
      const b = await req.body();
      const { config: c } = await live();
      const next = clone(c);
      next.appearance = b.appearance as PlatformConfig['appearance'];
      const parsed = parseConfig(next);
      if (!parsed.ok)
        throw new HttpFail(400, parsed.errors.slice(0, 5).join(' '));
      const errors = checkAppearance(parsed.config, req.lang);
      if (errors.length) throw new HttpFail(400, errors.slice(0, 8).join(' '));
      const version = await publish(
        req,
        baseOf(b),
        parsed.config,
        `Appearance: ${noteOf(b) || 'save'}`,
      );
      req.log('appearance save', '', `config ${version}`);
      return json({ version, unused: unusedFiles(parsed.config) });
    }
    if (r === 'POST /api/appearance/upload') {
      const name = decodeURIComponent(req.query.get('name') ?? '');
      const { config: c } = await live();
      const out = checkUpload(
        req,
        await req.raw(),
        name,
        'any',
        c.appearance?.limits ?? APPEARANCE_LIMITS,
      );
      req.log('appearance upload', out.kind, out.url);
      return json(out);
    }
    if (r === 'POST /api/appearance/cleanup') {
      const { config: c } = await live();
      const gone = unusedFiles(c);
      for (const f of gone) unlinkSync(path.join(d.outDir, 'files', f.file));
      req.log('appearance cleanup', '', `${gone.length} files`);
      return json({ removed: gone.map((f) => f.file) });
    }
    return null;
  }
  /**
   * Files uploaded here that nothing in the config uses any more. Only
   * files this screen stored (by the index in the book) are ever listed,
   * so catalog items and Style samples are never touched.
   */
  function unusedFiles(c: PlatformConfig) {
    const dir = path.join(d.outDir, 'files');
    if (!existsSync(dir)) return [];
    // A slot of a Style (or Studio, plan...) that no longer exists uses nothing.
    const known = new Set(allSlots(c).map((x) => x.id));
    const slots = Object.fromEntries(
      Object.entries(c.appearance?.slots ?? {}).filter(([id]) => known.has(id)),
    );
    const used = usedMedia({
      ...c,
      appearance: { ...(c.appearance ?? {}), slots },
    } as PlatformConfig);
    const mine = new Set(
      (d.book.read() as { uploads?: string[] }).uploads ?? [],
    );
    return readdirSync(dir)
      .filter(
        (f) => mine.has(f) && ![...used].some((u) => u.endsWith(`/files/${f}`)),
      )
      .map((f) => ({ file: f, bytes: statSync(path.join(dir, f)).size }));
  }
  function remember(url: string) {
    const f = url.split('/files/')[1];
    if (!f) return;
    const b = d.book.read() as ReturnType<StyleBook['read']> & {
      uploads?: string[];
    };
    b.uploads = [...new Set([...(b.uploads ?? []), f])];
    d.book.write(b);
  }

  // ---------------------------------------------------- Features & access
  async function bridge<T>(
    method: string,
    p: string,
    body: unknown,
    who: string,
  ) {
    const r = await d.admin.call(
      method,
      p,
      body === undefined ? undefined : JSON.stringify(body),
      who,
    );
    const parsed = JSON.parse(r.body || '{}') as T & {
      error?: { message?: string };
    };
    if (r.status !== 200)
      throw new HttpFail(
        r.status === 403 ? 403 : 502,
        parsed.error?.message ?? 'The admin service refused.',
      );
    return parsed;
  }
  const rulesOf = async (who: string) =>
    (
      await bridge<{ rules: AccessRules }>(
        'GET',
        '/v1/admin/access',
        undefined,
        who,
      )
    ).rules;
  const saveRules = (
    rules: AccessRules,
    who: string,
    what: string,
    note: string,
  ) => bridge('POST', '/v1/admin/access', { rules, what, note }, who);
  const peopleOf = async (who: string, feature = '-') =>
    bridge<{
      people: {
        userId: string;
        email: string;
        plan: string;
        on: boolean;
        why: string;
      }[];
      count: number;
    }>('POST', '/v1/admin/access/who', { feature, lang: 'en' }, who);
  /** The feature list: the owner's registry, plus every plan feature he has not described. */
  const featuresOf = (c: PlatformConfig) => {
    const known = new Map((c.features ?? []).map((f) => [f.key, f]));
    for (const p of c.plans)
      for (const k of p.features)
        if (!known.has(k))
          known.set(k, {
            key: k,
            label: { en: k },
            gates: [],
            on: true,
            beta: false,
            rollout: 100,
          });
    return [...known.values()];
  };

  async function accessRoute(req: StyleRequest): Promise<StyleReply | null> {
    const r = `${req.method} ${req.path}`;
    if (r === 'GET /api/access') {
      const { version, config } = await live();
      const rules = await rulesOf(req.who);
      const now = d.now();
      return json({
        version,
        plans: config.plans,
        features: featuresOf(config),
        limits: LIMIT_KEYS,
        cohorts: rules.cohorts,
        overrides: rules.overrides.map((o) => ({
          ...o,
          expired: !!o.expiresAt && Date.parse(o.expiresAt) <= now,
        })),
        expiredText: c5('override-expired', req.lang),
      });
    }
    if (r === 'POST /api/access/plans') {
      const b = await req.body();
      const { config: c } = await live();
      const plans = b.plans as PlatformConfig['plans'];
      if (!Array.isArray(plans) || !plans.length)
        throw new HttpFail(400, 'Keep at least one plan.');
      const gone = c.plans.filter((p) => !plans.some((x) => x.id === p.id));
      if (gone.length) {
        const people = (await peopleOf(req.who)).people;
        for (const p of gone) {
          const n = people.filter((x) => x.plan === p.id).length;
          if (n)
            throw new HttpFail(
              400,
              `The plan ${p.id} has ${n} people, so it cannot be deleted. Archive it instead: it takes no new people and its people keep it.`,
            );
        }
      }
      const next = { ...clone(c), plans };
      const version = await publish(
        req,
        baseOf(b),
        next,
        `Plans: ${noteOf(b) || 'save'}`,
      );
      req.log(
        'access plans',
        plans.map((p) => p.id).join(','),
        `config ${version}`,
      );
      return json({ version });
    }
    if (r === 'POST /api/access/features') {
      const b = await req.body();
      const { config: c } = await live();
      const next = {
        ...clone(c),
        features: b.features as PlatformConfig['features'],
      };
      const version = await publish(
        req,
        baseOf(b),
        next,
        `Features: ${noteOf(b) || 'save'}`,
      );
      req.log('access features', '', `config ${version}`);
      return json({ version });
    }
    if (r === 'POST /api/access/override') {
      const b = await req.body();
      const rules = await rulesOf(req.who);
      if (typeof b.remove === 'string') {
        req.fresh('access override remove', b.remove);
        rules.overrides = rules.overrides.filter((o) => o.id !== b.remove);
        await saveRules(rules, req.who, `remove ${b.remove}`, '');
        req.log('access override remove', b.remove);
        return json({ ok: true });
      }
      const o = { ...((b.override ?? {}) as Partial<AccessOverride>) };
      // A person is named by email in the Admin; the rule keeps their id.
      if (o.who?.includes('@')) {
        const email = o.who.trim().toLowerCase();
        const found = (await peopleOf(req.who)).people.find(
          (x) => x.email.toLowerCase() === email,
        );
        if (!found)
          throw new HttpFail(404, 'No account with that email was found.');
        (o as { who: string }).who = found.userId;
      }
      const errors = checkOverride(o, req.lang);
      if (errors.length) throw new HttpFail(400, errors.join(' '));
      if (o.feature) {
        const { config: c } = await live();
        if (!featuresOf(c).some((f) => f.key === o.feature))
          throw new HttpFail(400, 'There is no feature with that key.');
      }
      req.fresh('access override', `${o.who} ${o.feature ?? o.limit}`);
      const full: AccessOverride = {
        id: `ov-${createHash('sha256')
          .update(`${d.now()}${JSON.stringify(o)}`)
          .digest('hex')
          .slice(0, 12)}`,
        who: String(o.who),
        ...(o.feature ? { feature: o.feature, on: !!o.on } : {}),
        ...(o.limit ? { limit: o.limit, value: o.value ?? null } : {}),
        ...(o.expiresAt
          ? { expiresAt: new Date(o.expiresAt).toISOString() }
          : {}),
        note: String(o.note).slice(0, 300),
        by: req.who,
        at: new Date(d.now()).toISOString(),
      };
      rules.overrides.push(full);
      await saveRules(rules, req.who, `override ${full.who}`, full.note);
      req.log(
        'access override',
        full.who,
        `${full.feature ?? full.limit} ${full.note}`,
      );
      return json({ override: full });
    }
    if (r === 'POST /api/access/cohort') {
      const b = await req.body();
      const rules = await rulesOf(req.who);
      if (typeof b.remove === 'string') {
        rules.cohorts = rules.cohorts.filter((x) => x.id !== b.remove);
        rules.overrides = rules.overrides.filter(
          (o) => o.who !== `cohort:${b.remove}`,
        );
        await saveRules(rules, req.who, `cohort remove ${b.remove}`, '');
        req.log('access cohort remove', b.remove);
        return json({ ok: true });
      }
      const id = String(b.id ?? '').trim();
      if (!/^[a-z][a-z0-9-]{0,40}$/.test(id))
        throw new HttpFail(
          400,
          'A group id is small letters, digits and dashes.',
        );
      const emails = [
        ...new Set(
          String(b.emails ?? '')
            .split(/[\s,;]+/)
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (bad.length)
        throw new HttpFail(
          400,
          `These are not emails: ${bad.slice(0, 5).join(', ')}.`,
        );
      if (emails.length > 500)
        throw new HttpFail(400, 'A group holds up to 500 emails.');
      const cohort = { id, name: String(b.name ?? id).slice(0, 80), emails };
      rules.cohorts = [...rules.cohorts.filter((x) => x.id !== id), cohort];
      await saveRules(rules, req.who, `cohort ${id}`, '');
      req.log('access cohort', id, `${emails.length} emails`);
      return json({ cohort });
    }
    if (r === 'GET /api/access/who') {
      const feature = req.query.get('feature') ?? '';
      const r2 = await bridge<{ people: unknown[]; count: number }>(
        'POST',
        '/v1/admin/access/who',
        { feature, lang: req.lang },
        req.who,
      );
      return json(r2);
    }
    return null;
  }

  return async function route(req: StyleRequest): Promise<StyleReply | null> {
    const out = req.path.startsWith('/api/site')
      ? await siteRoute(req)
      : req.path.startsWith('/api/appearance')
        ? await appearanceRoute(req)
        : req.path.startsWith('/api/access')
          ? await accessRoute(req)
          : null;
    // Every upload is remembered, so its file can be cleaned up when unused.
    if (
      out?.kind === 'json' &&
      out.status === 200 &&
      /\/upload$/.test(req.path)
    )
      remember((out.body as { url: string }).url);
    return out;
  };
}
