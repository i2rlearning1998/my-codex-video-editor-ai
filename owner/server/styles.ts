// ROUND-C4: the Readymade Styles builder and the Brief fields editor on the
// Owner App's server. Every route sits behind the owner's login and CSRF
// check (app.ts); changes are audited; delete, rollback, import, publishing
// and the owner's account setting need a fresh password and code. Styles
// and the field library live in Platform Config (saved and published
// through the admin bridge, the same path as every Admin save); the version
// history, the deleted Styles and the owner's account live in the Owner
// App's own store (a JSON file in its data folder), never in Platform Config.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import {
  parseConfig,
  styleSchema,
  type PlatformConfig,
  type Style,
} from '../../src/platform-config';
import {
  applySave,
  blockUsers,
  bt,
  canMove,
  changedFields,
  checkFieldLibrary,
  copyStyle,
  draftStyleFromVideo,
  filledTemplate,
  lookWarnings,
  passedTopics,
  readStyleFile,
  readTemplate,
  slotReport,
  statusOf,
  styleFile,
  unknownKitBlocks,
  type Lang,
  type Status,
} from '../../src/director/style-builder';
import { validateStyle } from '../../src/director/style-check';
import {
  classifyType,
  fillFromText,
  missingRequired,
  remaining,
  type Library,
} from '../../src/director/field-library';
import { blocks as starterBlocks } from '../../src/blocks/starters';
import { graphicsBlocks } from '../../src/blocks/graphics';
import { buildVideoFromPlan, validatePlan } from '../../src/video-plan';
import { checkLayout } from '../../src/video-plan/layout-check';
import type { AdminBridge } from './admin-bridge';

/** The editor's real block catalog (the kit picker's list). */
export const BLOCK_CATALOG: readonly string[] = [
  ...starterBlocks.map((b) => b.id),
  ...graphicsBlocks.map((b) => b.id),
];
/** Versions kept per Style (and for the field library). */
export const HISTORY_LIMIT = 30;
/** Sample files: the catalog media limits (the gate's), plain errors. */
const SAMPLE_TYPES: Record<string, { kind: 'video' | 'poster'; mime: string }> =
  {
    mp4: { kind: 'video', mime: 'video/mp4' },
    webm: { kind: 'video', mime: 'video/webm' },
    png: { kind: 'poster', mime: 'image/png' },
    jpg: { kind: 'poster', mime: 'image/jpeg' },
    jpeg: { kind: 'poster', mime: 'image/jpeg' },
    webp: { kind: 'poster', mime: 'image/webp' },
  };
export const SAMPLE_LIMIT = {
  video: 500 * 1024 * 1024,
  poster: 20 * 1024 * 1024,
};

export interface Version {
  readonly version: number;
  readonly at: string;
  readonly who: string;
  readonly note: string;
  readonly changed: string[];
  /** The full content of this version (a Style, or the field library). */
  readonly snapshot: unknown;
}
interface Book {
  /** `style:<id>` and `fields` to their versions, oldest first. */
  history: Record<string, Version[]>;
  deleted: Record<string, { at: string; who: string; snapshot: Style }>;
  account: { email: string; verifiedAt: string } | null;
}

export class StyleBook {
  readonly #file: string;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.#file = path.join(dataDir, 'styles-book.json');
  }
  read(): Book {
    if (!existsSync(this.#file))
      return { history: {}, deleted: {}, account: null };
    return JSON.parse(readFileSync(this.#file, 'utf8')) as Book;
  }
  write(b: Book) {
    writeFileSync(this.#file, JSON.stringify(b, null, 1));
  }
  push(key: string, v: Version) {
    const b = this.read();
    b.history[key] = [...(b.history[key] ?? []), v].slice(-HISTORY_LIMIT);
    this.write(b);
  }
  versions(key: string): Version[] {
    return this.read().history[key] ?? [];
  }
}

export class HttpFail extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface StylesDeps {
  readonly admin: AdminBridge;
  readonly book: StyleBook;
  readonly now: () => number;
  /** The catalog folder and its public address (the sample files). */
  readonly outDir: string;
  readonly catalogUrl: string;
}

/** One request to the builder, already past login and CSRF. */
export interface StyleRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly body: () => Promise<Record<string, unknown>>;
  readonly raw: () => Promise<Buffer>;
  readonly who: string;
  readonly lang: Lang;
  /** Throws unless the owner confirmed the password and code lately. */
  readonly fresh: (action: string, target?: string) => void;
  readonly log: (
    action: string,
    target?: string,
    detail?: string,
    ok?: boolean,
  ) => void;
}
export type StyleReply =
  | { kind: 'json'; status: number; body: unknown }
  | { kind: 'file'; name: string; type: string; bytes: Buffer };

const json = (body: unknown, status = 200): StyleReply => ({
  kind: 'json',
  status,
  body,
});
const str = (v: unknown, max = 600) =>
  typeof v === 'string' ? v.slice(0, max) : '';

export function createStyleRoutes(d: StylesDeps) {
  async function config(): Promise<{
    version: number;
    config: PlatformConfig;
  }> {
    const r = await d.admin.call('GET', '/v1/config', undefined, 'owner');
    if (r.status !== 200)
      throw new HttpFail(502, 'The settings could not be read.');
    return JSON.parse(r.body) as { version: number; config: PlatformConfig };
  }
  async function publish(next: PlatformConfig, note: string, who: string) {
    const r = await d.admin.call(
      'POST',
      '/v1/config',
      JSON.stringify({ config: next, note: note.slice(0, 200), publish: true }),
      who,
    );
    if (r.status !== 200) {
      const e = JSON.parse(r.body) as { error?: { message?: string } };
      throw new HttpFail(400, e.error?.message ?? 'The settings were refused.');
    }
    return (JSON.parse(r.body) as { version: number }).version;
  }
  const report = (s: Style, c: PlatformConfig, lang: Lang) => {
    const check = validateStyle(s);
    const unknown = unknownKitBlocks(s, BLOCK_CATALOG);
    return {
      ok: check.ok && !unknown.length,
      errors: [
        ...check.errors,
        ...unknown.map(
          (b) =>
            `The kit names the block "${b}", which the editor does not have.`,
        ),
      ],
      warnings: lookWarnings(s, lang),
      slots: s.planTemplate
        ? slotReport(s.planTemplate, s.slots ?? [], lang)
        : null,
      legacy: s.status === undefined && !s.planTemplate,
      passed: passedTopics(s),
      plans: c.plans.map((p) => p.id),
    };
  };
  const findStyle = (c: PlatformConfig, id: string) => {
    const s = c.styles.find((x) => x.id === id);
    if (!s) throw new HttpFail(404, 'There is no Style with that id.');
    return s;
  };
  /** Saves one Style into the config, with its version in the history. */
  async function saveStyle(
    req: StyleRequest,
    c: PlatformConfig,
    prev: Style | null,
    next: Style,
    note: string,
    action: string,
  ) {
    const { style, changed, demoted } = applySave(prev, next);
    const out: PlatformConfig = JSON.parse(JSON.stringify(c)) as PlatformConfig;
    const i = out.styles.findIndex((x) => x.id === (prev?.id ?? style.id));
    if (i >= 0) out.styles[i] = style;
    else out.styles.push(style);
    const v = await publish(
      out,
      `Style ${style.id}: ${note || action}`,
      req.who,
    );
    d.book.push(`style:${style.id}`, {
      version: style.version ?? 1,
      at: new Date(d.now()).toISOString(),
      who: req.who,
      note: note.slice(0, 200),
      changed,
      snapshot: style,
    });
    req.log(`style ${action}`, style.id, `v${style.version} config ${v}`);
    return { style, changed, demoted, configVersion: v };
  }
  const parseStyle = (v: unknown): Style => {
    const r = styleSchema.safeParse(v);
    if (!r.success)
      throw new HttpFail(
        400,
        r.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || 'Style'}: ${i.message}`)
          .join('; '),
      );
    return r.data;
  };

  /** "Check the Style": checks, the filled template, a first draft, layout. */
  async function checkStyle(s: Style, c: PlatformConfig, lang: Lang) {
    const r = report(s, c, lang);
    const filled = filledTemplate(s);
    if (!filled)
      return {
        ...r,
        filled: null,
        draft: null,
        sketch: '',
        note:
          lang === 'hi'
            ? 'इस स्टाइल में टेम्पलेट नहीं है: यह सिर्फ़ डायरेक्टर का फ़ॉर्म इस्तेमाल करता है।'
            : "This Style has no template: it uses the Director's form only.",
      };
    // The same path start_video_from_style uses: the template filled, then
    // the headless build with no model and no media.
    const built = await buildVideoFromPlan(filled, {
      resolve: { local: () => [], stock: async () => [] },
      importCandidate: async () => {
        throw new Error('No media in a check.');
      },
    });
    const v = validatePlan(filled);
    const layout =
      v.ok && v.plan
        ? checkLayout(v.plan, c.director.layout as never).map(
            (f) => `${f.where}: ${f.text} ${f.fix}`,
          )
        : [];
    const comps = (
      built.project as { compositions?: { name?: string }[] } | null
    )?.compositions;
    return {
      ...r,
      filled,
      draft: built.project
        ? {
            scenes: comps?.length ?? 0,
            names: (comps ?? []).map((x) => x.name ?? ''),
            warnings: built.warnings.slice(0, 10),
          }
        : { scenes: 0, names: [], errors: built.errors.slice(0, 10) },
      layout,
      sketch: sketch(v.ok && v.plan ? (v.plan as never) : null),
    };
  }

  async function fieldsSave(
    req: StyleRequest,
    c: PlatformConfig,
    lib: Library,
    note: string,
  ) {
    const errors = checkFieldLibrary(
      lib,
      Object.keys(c.director.playbooks ?? {}),
    );
    if (errors.length) throw new HttpFail(400, errors.join(' '));
    const out: PlatformConfig = JSON.parse(JSON.stringify(c)) as PlatformConfig;
    out.director.fieldLibrary = lib;
    const changed = changedFields(c.director.fieldLibrary, lib);
    const v = await publish(out, `Brief fields: ${note || 'save'}`, req.who);
    const prev = d.book.versions('fields');
    d.book.push('fields', {
      version: (prev.at(-1)?.version ?? 0) + 1,
      at: new Date(d.now()).toISOString(),
      who: req.who,
      note: note.slice(0, 200),
      changed,
      snapshot: lib,
    });
    req.log('fields save', 'fieldLibrary', `config ${v}`);
    return { configVersion: v, changed };
  }

  return async function route(req: StyleRequest): Promise<StyleReply | null> {
    const { method, path: p, lang } = req;
    const r = `${method} ${p}`;
    // ---------------------------------------------------------- list
    if (r === 'GET /api/styles') {
      const { config: c } = await config();
      const book = d.book.read();
      return json({
        styles: [...c.styles]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            style: s,
            status: statusOf(s),
            check: report(s, c, lang),
          })),
        deleted: Object.entries(book.deleted).map(([id, x]) => ({
          id,
          at: x.at,
          who: x.who,
          name: x.snapshot.name,
        })),
        plans: c.plans.map((p) => ({ id: p.id, name: p.name })),
        studios: c.studios
          .filter((s) => s.enabled)
          .map((s) => ({ id: s.id, name: s.name, output: s.output })),
        blocks: BLOCK_CATALOG,
        account: book.account,
      });
    }
    const one = /^\/api\/styles\/([A-Za-z][A-Za-z0-9-]{0,47})$/.exec(p);
    if (method === 'GET' && one && one[1] !== 'from-project') {
      const { config: c } = await config();
      const s = findStyle(c, one[1]!);
      return json({
        style: s,
        check: report(s, c, lang),
        history: d.book
          .versions(`style:${s.id}`)
          .map(({ snapshot: _s, ...v }) => v),
      });
    }
    const ver =
      /^\/api\/styles\/([A-Za-z][A-Za-z0-9-]{0,47})\/versions\/(\d+)$/.exec(p);
    if (method === 'GET' && ver) {
      const v = d.book
        .versions(`style:${ver[1]}`)
        .find((x) => x.version === Number(ver[2]));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      return json(v);
    }
    // ---------------------------------------------------------- saves
    if (r === 'POST /api/styles/save') {
      const b = await req.body();
      const { config: c } = await config();
      const next = parseStyle(b.style);
      const isNew = b.isNew === true;
      const prev =
        c.styles.find((x) => x.id === (str(b.id, 48) || next.id)) ?? null;
      if (isNew && c.styles.some((x) => x.id === next.id))
        throw new HttpFail(
          409,
          `A Style with the id "${next.id}" already exists.`,
        );
      if (!isNew && !prev)
        throw new HttpFail(404, 'There is no Style with that id.');
      if (prev && prev.id !== next.id && c.styles.some((x) => x.id === next.id))
        throw new HttpFail(
          409,
          `A Style with the id "${next.id}" already exists.`,
        );
      // A status change is a move with its own rules (and a fresh code).
      const from = prev ? statusOf(prev) : 'draft';
      const to = statusOf(next);
      let style: Style = next;
      if (isNew && next.status === undefined)
        style = { ...next, status: 'draft' };
      if (
        prev &&
        (prev.status !== next.status || isNew) &&
        to !== 'draft' &&
        to !== from
      ) {
        req.fresh('style status', next.id);
        const m = canMove(
          { ...next, status: prev?.status },
          to,
          str(b.override),
          lang,
        );
        if (!m.ok) throw new HttpFail(400, m.message);
      }
      // Tests are added or corrected, never removed by a save.
      if (prev && (next.tests?.length ?? 0) < (prev.tests?.length ?? 0))
        throw new HttpFail(
          400,
          'Test records cannot be deleted; correct them instead.',
        );
      const unknown = unknownKitBlocks(style, BLOCK_CATALOG);
      if (unknown.length)
        throw new HttpFail(
          400,
          `The kit names blocks the editor does not have: ${unknown.join(', ')}.`,
        );
      const out = await saveStyle(
        req,
        c,
        prev,
        style,
        str(b.note, 200),
        isNew ? 'new' : 'save',
      );
      return json({
        ...out,
        check: report(out.style, (await config()).config, lang),
      });
    }
    if (r === 'POST /api/styles/status') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      const to = str(b.to, 20) as Status;
      if (!['draft', 'tested', 'published'].includes(to))
        throw new HttpFail(400, 'Say Draft, Tested or Published.');
      req.fresh('style status', s.id);
      const override = str(b.override, 2000);
      const m = canMove(s, to, override, lang);
      if (!m.ok) {
        req.log('style status', s.id, `refused: ${to}`, false);
        throw new HttpFail(400, m.message, { check: report(s, c, lang) });
      }
      const next: Style = {
        ...s,
        status: to,
        ...(override.trim() ? { publishOverride: override.trim() } : {}),
      };
      const out = await saveStyle(
        req,
        c,
        s,
        next,
        `status ${to}`,
        `status ${to}`,
      );
      if (override.trim())
        req.log('style override', s.id, override.trim().slice(0, 300));
      return json(out);
    }
    if (r === 'POST /api/styles/tests') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      const tests = parseStyle({ ...s, tests: b.tests }).tests ?? [];
      if (tests.length < (s.tests?.length ?? 0))
        throw new HttpFail(
          400,
          'Test records cannot be deleted; correct them instead.',
        );
      const out = await saveStyle(req, c, s, { ...s, tests }, 'tests', 'tests');
      return json(out);
    }
    if (r === 'POST /api/styles/copy') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      const copy = copyStyle(
        s,
        c.styles.map((x) => x.id),
      );
      const out = await saveStyle(
        req,
        c,
        null,
        { ...copy, order: s.order + 0.5 },
        'copy',
        'copy',
      );
      return json(out);
    }
    if (r === 'POST /api/styles/move') {
      const b = await req.body();
      const { config: c } = await config();
      const list = [...c.styles].sort((a, b) => a.order - b.order);
      const i = list.findIndex((x) => x.id === str(b.id, 48));
      if (i < 0) throw new HttpFail(404, 'There is no Style with that id.');
      const j = b.dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return json({ moved: false });
      [list[i], list[j]] = [list[j]!, list[i]!];
      const out: PlatformConfig = JSON.parse(
        JSON.stringify(c),
      ) as PlatformConfig;
      out.styles = out.styles.map((x) => ({
        ...x,
        order: list.findIndex((y) => y.id === x.id) * 10,
      }));
      const v = await publish(out, `Style order`, req.who);
      req.log('style order', str(b.id, 48), `config ${v}`);
      return json({ moved: true, configVersion: v });
    }
    if (r === 'POST /api/styles/enable') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      const out = await saveStyle(
        req,
        c,
        s,
        { ...s, enabled: b.enabled === true },
        b.enabled === true ? 'enabled' : 'disabled',
        'enable',
      );
      return json(out);
    }
    if (r === 'POST /api/styles/delete') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      req.fresh('style delete', s.id);
      const out: PlatformConfig = JSON.parse(
        JSON.stringify(c),
      ) as PlatformConfig;
      out.styles = out.styles.filter((x) => x.id !== s.id);
      const v = await publish(out, `Style ${s.id} deleted`, req.who);
      const book = d.book.read();
      book.deleted[s.id] = {
        at: new Date(d.now()).toISOString(),
        who: req.who,
        snapshot: s,
      };
      d.book.write(book);
      req.log('style delete', s.id, `config ${v}`);
      return json({
        deleted: s.id,
        configVersion: v,
        note: bt('delete-warning', {}, lang),
      });
    }
    if (r === 'POST /api/styles/restore') {
      const b = await req.body();
      const id = str(b.id, 48);
      const book = d.book.read();
      const gone = book.deleted[id];
      if (!gone)
        throw new HttpFail(404, 'That Style is not in the Deleted list.');
      const { config: c } = await config();
      if (c.styles.some((x) => x.id === id))
        throw new HttpFail(409, `A Style with the id "${id}" already exists.`);
      req.fresh('style restore', id);
      const out = await saveStyle(
        req,
        c,
        null,
        { ...gone.snapshot, status: 'draft' },
        'restored',
        'restore',
      );
      const fresh = d.book.read();
      delete fresh.deleted[id];
      d.book.write(fresh);
      return json(out);
    }
    if (r === 'POST /api/styles/rollback') {
      const b = await req.body();
      const { config: c } = await config();
      const s = findStyle(c, str(b.id, 48));
      const v = d.book
        .versions(`style:${s.id}`)
        .find((x) => x.version === Number(b.version));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      req.fresh('style rollback', s.id);
      const parsed = styleSchema.safeParse(v.snapshot);
      if (!parsed.success || parsed.data.id !== s.id) {
        req.log('style rollback', s.id, `refused v${v.version}`, false);
        throw new HttpFail(400, bt('rollback-bad', {}, lang));
      }
      // A NEW version with the old content; the history is never rewritten.
      // A rollback keeps the tests the Style has now (they are never lost).
      const out = await saveStyle(
        req,
        c,
        s,
        { ...parsed.data, tests: s.tests ?? parsed.data.tests ?? [] },
        `rolled back to version ${v.version}`,
        'rollback',
      );
      return json(out);
    }
    // -------------------------------------------------------- checks
    if (r === 'POST /api/styles/check') {
      const b = await req.body();
      const { config: c } = await config();
      return json(await checkStyle(parseStyle(b.style), c, lang));
    }
    if (r === 'POST /api/styles/template') {
      // Reads a pasted or uploaded template and reports its slots.
      const b = await req.body();
      const t = readTemplate(str(b.text, 2_000_000), lang);
      if (!t.ok) throw new HttpFail(400, t.message);
      const slots = Array.isArray(b.slots)
        ? (b.slots as { name: string }[])
        : [];
      return json({
        template: t.template,
        slots: slotReport(t.template, slots, lang),
      });
    }
    // ------------------------------------------------ export, import, sample
    const exp = /^\/api\/styles\/([A-Za-z][A-Za-z0-9-]{0,47})\/export$/.exec(p);
    if (method === 'GET' && exp) {
      const { config: c } = await config();
      const s = findStyle(c, exp[1]!);
      const files: { name: string; bytes: Buffer }[] = [
        {
          name: 'style.json',
          bytes: Buffer.from(JSON.stringify(styleFile(s), null, 1)),
        },
      ];
      for (const [k, url] of Object.entries(s.sample ?? {})) {
        const local = sampleFile(url);
        if (local)
          files.push({
            name: `sample/${k}${path.extname(local)}`,
            bytes: readFileSync(local),
          });
      }
      req.log('style export', s.id);
      return {
        kind: 'file',
        name: `${s.id}.aive-style.zip`,
        type: 'application/zip',
        bytes: zipStored(files),
      };
    }
    if (r === 'POST /api/styles/import') {
      req.fresh('style import');
      const bytes = await req.raw();
      const files = readZip(bytes);
      const text = files.get('style.json');
      if (!text) throw new HttpFail(400, 'The file holds no style.json.');
      const read = readStyleFile(text.toString('utf8'), lang);
      if (!read.ok) {
        req.log('style import', undefined, 'refused', false);
        throw new HttpFail(400, read.message);
      }
      const { config: c } = await config();
      let style = read.style;
      const mode = req.query.get('mode');
      const clash = c.styles.find((x) => x.id === style.id);
      if (clash && mode !== 'copy' && mode !== 'version')
        throw new HttpFail(409, bt('import-clash', {}, lang), { clash: true });
      // Sample files travel in the zip; they are stored like an upload.
      const sample: Record<string, string> = {};
      for (const [name, data] of files)
        if (name.startsWith('sample/')) {
          const kind = name.slice(7).split('.')[0]!;
          if (kind === 'video' || kind === 'poster')
            sample[kind] = storeSample(name, data).url;
        }
      if (Object.keys(sample).length === 2)
        style = {
          ...style,
          sample: sample as { video: string; poster: string },
        };
      const keepTests =
        mode === 'version' && req.query.get('keepTests') === '1';
      if (clash && mode === 'copy') {
        const copy = copyStyle(
          style,
          c.styles.map((x) => x.id),
        );
        const out = await saveStyle(
          req,
          c,
          null,
          copy,
          'imported as a copy',
          'import',
        );
        return json(out);
      }
      const next: Style = {
        ...style,
        status: 'draft',
        tests: keepTests ? (clash?.tests ?? []) : [],
      };
      if (!keepTests)
        delete (next as { publishOverride?: string }).publishOverride;
      const out = await saveStyle(
        req,
        c,
        clash ?? null,
        next,
        clash ? 'imported as a new version' : 'imported',
        'import',
      );
      return json(out);
    }
    if (r === 'POST /api/styles/sample') {
      const name = decodeURIComponent(req.query.get('name') ?? '');
      const id = req.query.get('id') ?? '';
      const ext = path.extname(name).slice(1).toLowerCase();
      const t = SAMPLE_TYPES[ext];
      if (!t)
        throw new HttpFail(
          415,
          'A sample is an MP4 or WebM video, or a PNG, JPEG or WebP poster.',
        );
      const bytes = await req.raw();
      if (bytes.length > SAMPLE_LIMIT[t.kind])
        throw new HttpFail(
          413,
          `A sample ${t.kind} may be up to ${Math.round(SAMPLE_LIMIT[t.kind] / 1024 / 1024)} MB.`,
        );
      if (!sniff(bytes, ext))
        throw new HttpFail(415, `This file is not a real .${ext} file.`);
      const stored = storeSample(name, bytes);
      req.log('style sample', id, stored.url);
      return json({ kind: t.kind, url: stored.url });
    }
    // ------------------------------------------- the owner's account (2.1)
    if (r === 'POST /api/styles/account') {
      const b = await req.body();
      const email = str(b.email, 200).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new HttpFail(400, 'Write the email of your user account.');
      req.fresh('style account', email);
      const book = d.book.read();
      book.account = { email, verifiedAt: new Date(d.now()).toISOString() };
      d.book.write(book);
      // The same account sees Draft and Tested Styles in the panel and Claude.
      const { config: c } = await config();
      if (!c.workspace.ownerEmails.includes(email)) {
        const out: PlatformConfig = JSON.parse(
          JSON.stringify(c),
        ) as PlatformConfig;
        out.workspace.ownerEmails = [...out.workspace.ownerEmails, email].slice(
          0,
          20,
        );
        await publish(out, 'My user account', req.who);
      }
      req.log('style account', email);
      return json({ account: book.account });
    }
    if (r === 'GET /api/styles/from-project') {
      const account = d.book.read().account;
      if (!account)
        throw new HttpFail(
          400,
          'Set your user account first (Admin › My user account).',
        );
      const q = new URLSearchParams({ email: account.email });
      const project = req.query.get('project');
      const video = req.query.get('video');
      const target =
        project && video
          ? `/v1/admin/mcp/owner-video?${q}&project=${encodeURIComponent(project)}&video=${encodeURIComponent(video)}`
          : `/v1/admin/mcp/owner-projects?${q}`;
      const reply = await d.admin.call('GET', target, undefined, req.who);
      req.log(
        'style read-project',
        project && video ? `${project}/${video}` : 'projects',
        `status ${reply.status}`,
        reply.status < 400,
      );
      return json(JSON.parse(reply.body), reply.status);
    }
    if (r === 'POST /api/styles/from-project') {
      const account = d.book.read().account;
      if (!account)
        throw new HttpFail(
          400,
          'Set your user account first (Admin › My user account).',
        );
      const b = await req.body();
      const q = new URLSearchParams({
        email: account.email,
        project: str(b.project, 80),
        video: str(b.video, 80),
      });
      const reply = await d.admin.call(
        'GET',
        `/v1/admin/mcp/owner-video?${q}`,
        undefined,
        req.who,
      );
      req.log(
        'style read-project',
        `${str(b.project, 80)}/${str(b.video, 80)}`,
        `status ${reply.status}`,
        reply.status < 400,
      );
      if (reply.status !== 200)
        return json(JSON.parse(reply.body), reply.status);
      const src = JSON.parse(reply.body) as {
        project: { name: string; style: Record<string, unknown> | null };
        video: {
          name: string;
          plan: unknown;
          cost: number | null;
          videoType: string;
        };
        graphics: {
          id: string;
          tier: string;
          name: string;
          summary: string;
          source: string;
          meta: Record<string, unknown>;
        }[];
      };
      const { config: c } = await config();
      let id = (str(b.id, 48) || slugOf(src.video.name)).slice(0, 48);
      for (let i = 2; c.styles.some((x) => x.id === id); i++)
        id = `${slugOf(src.video.name).slice(0, 40)}-${i}`;
      const made = draftStyleFromVideo(
        c,
        {
          plan: src.video.plan,
          name: src.video.name,
          style: src.project.style as never,
          cost: src.video.cost,
          graphics: src.graphics,
          videoType: src.video.videoType,
        },
        id,
        Math.max(0, Math.min(5, Number(b.margin ?? 0.2) || 0)),
      );
      if (!made.ok) throw new HttpFail(400, made.message);
      const out = await saveStyle(
        req,
        c,
        null,
        made.style,
        `from the Video "${src.video.name}"`,
        'from-project',
      );
      return json(out);
    }
    // ----------------------------------------------------- Brief fields (3)
    if (r === 'GET /api/fields') {
      const { config: c } = await config();
      const lib = c.director.fieldLibrary;
      return json({
        library: lib,
        playbooks: Object.keys(c.director.playbooks ?? {}),
        users: Object.fromEntries(
          lib.blocks.map((b) => [b.id, blockUsers(lib, c.styles, b.id)]),
        ),
        errors: checkFieldLibrary(lib, Object.keys(c.director.playbooks ?? {})),
        history: d.book.versions('fields').map(({ snapshot: _s, ...v }) => v),
      });
    }
    if (r === 'POST /api/fields/save') {
      const b = await req.body();
      const { config: c } = await config();
      const lib = b.library as Library;
      // A block in use cannot be deleted: name who uses it.
      const gone = c.director.fieldLibrary.blocks
        .map((x) => x.id)
        .filter((id) => !lib?.blocks?.some((x) => x.id === id));
      for (const id of gone) {
        const users = blockUsers(
          { ...lib, blocks: lib.blocks ?? [] } as Library,
          c.styles,
          id,
        );
        if (users.length)
          throw new HttpFail(
            400,
            `The block "${id}" is still used by ${users.join(', ')}, so it cannot be deleted.`,
          );
      }
      const parsed = parseConfig({
        ...c,
        director: { ...c.director, fieldLibrary: lib },
      });
      if (!parsed.ok)
        throw new HttpFail(400, parsed.errors.slice(0, 5).join('; '));
      return json(
        await fieldsSave(
          req,
          c,
          parsed.config.director.fieldLibrary,
          str(b.note, 200),
        ),
      );
    }
    if (r === 'POST /api/fields/preview') {
      // The panel's own functions: the type, what is filled, what is missing.
      const b = await req.body();
      const lib =
        (b.library as Library | undefined) ??
        (await config()).config.director.fieldLibrary;
      const type =
        lib.types.find((t) => t.id === str(b.type, 48)) ??
        classifyType(lib, str(b.text, 4000));
      const values = fillFromText(lib, type, str(b.text, 4000));
      return json({
        type: type.id,
        filled: values,
        missing: missingRequired(lib, type, values).map((x) => x.id),
        asks: remaining(lib, type, values).map((x) => ({
          id: x.block.id,
          label: x.block.label,
          required: x.required,
          type: x.block.type,
          options: x.block.options,
        })),
      });
    }
    const fv = /^\/api\/fields\/versions\/(\d+)$/.exec(p);
    if (method === 'GET' && fv) {
      const v = d.book
        .versions('fields')
        .find((x) => x.version === Number(fv[1]));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      return json(v);
    }
    if (r === 'POST /api/fields/rollback') {
      const b = await req.body();
      const v = d.book
        .versions('fields')
        .find((x) => x.version === Number(b.version));
      if (!v) throw new HttpFail(404, 'There is no such version.');
      req.fresh('fields rollback');
      const { config: c } = await config();
      const parsed = parseConfig({
        ...c,
        director: { ...c.director, fieldLibrary: v.snapshot },
      });
      if (!parsed.ok) throw new HttpFail(400, bt('rollback-bad', {}, lang));
      return json(
        await fieldsSave(
          req,
          c,
          parsed.config.director.fieldLibrary,
          `rolled back to version ${v.version}`,
        ),
      );
    }
    return null;
  };

  function storeSample(name: string, bytes: Buffer) {
    const ext = path.extname(name).slice(1).toLowerCase() || 'bin';
    const sha = createHash('sha256').update(bytes).digest('hex');
    const dir = path.join(d.outDir, 'files');
    mkdirSync(dir, { recursive: true });
    const file = `${sha}.${ext}`;
    writeFileSync(path.join(dir, file), bytes);
    return { url: `${d.catalogUrl.replace(/\/$/, '')}/files/${file}` };
  }
  function sampleFile(url: string): string | null {
    const m = /\/files\/([0-9a-f]{64}\.[a-z0-9]{2,5})$/.exec(url);
    if (!m) return null;
    const f = path.join(d.outDir, 'files', m[1]!);
    return existsSync(f) ? f : null;
  }
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, 's$1')
    .slice(0, 48) || 'style';

/** The first bytes of each kind of sample (a renamed file is refused). */
function sniff(b: Buffer, ext: string): boolean {
  if (ext === 'png') return b.subarray(0, 4).toString('hex') === '89504e47';
  if (ext === 'jpg' || ext === 'jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (ext === 'webp')
    return (
      b.subarray(0, 4).toString() === 'RIFF' &&
      b.subarray(8, 12).toString() === 'WEBP'
    );
  if (ext === 'webm') return b.subarray(0, 4).toString('hex') === '1a45dfa3';
  if (ext === 'mp4') return b.subarray(4, 8).toString() === 'ftyp';
  return false;
}

/** A sketch of the first scene: its background and text boxes (not a render). */
function sketch(
  plan: {
    meta: { aspect: string };
    scenes: {
      background?: string;
      layers: { kind?: string; text?: string }[];
    }[];
    feel?: { palette?: { background?: string } };
  } | null,
): string {
  if (!plan?.scenes[0]) return '';
  const [w, h] =
    plan.meta.aspect === '9:16'
      ? [90, 160]
      : plan.meta.aspect === '1:1'
        ? [120, 120]
        : [160, 90];
  const bg =
    plan.scenes[0].background ?? plan.feel?.palette?.background ?? '#101219';
  const safe = (x: string) => x.replace(/[<>&"]/g, '');
  const texts = plan.scenes[0].layers.filter((l) => l.text).slice(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}"><rect width="${w}" height="${h}" fill="${/^#[0-9a-f]{6}$/i.test(bg) ? bg : '#101219'}"/>${texts
    .map(
      (l, i) =>
        `<text x="${w / 2}" y="${h / 2 + (i - texts.length / 2) * 10 + 5}" font-size="7" fill="#fff" text-anchor="middle">${safe(l.text!.slice(0, 40))}</text>`,
    )
    .join('')}</svg>`;
}

// ------------------------------------------------------------ the zip file

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** A stored (uncompressed) zip; no dependency. */
export function zipStored(files: { name: string; bytes: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const crc = crc32(f.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.bytes.length, 18);
    local.writeUInt32LE(f.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, f.bytes);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(f.bytes.length, 20);
    c.writeUInt32LE(f.bytes.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
/** Reads a zip's files (stored or deflated), or a bare style.json. */
export function readZip(b: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (b[0] === 0x7b) {
    out.set('style.json', b);
    return out;
  }
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new HttpFail(400, 'This is not a .aive-style.zip file.');
  const count = b.readUInt16LE(end + 10);
  let at = b.readUInt32LE(end + 16);
  for (let i = 0; i < count && i < 20; i++) {
    if (b.readUInt32LE(at) !== 0x02014b50) break;
    const method = b.readUInt16LE(at + 10);
    const size = b.readUInt32LE(at + 20);
    const nameLen = b.readUInt16LE(at + 28);
    const extra = b.readUInt16LE(at + 30);
    const comment = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.subarray(at + 46, at + 46 + nameLen).toString();
    const lName = b.readUInt16LE(local + 26);
    const lExtra = b.readUInt16LE(local + 28);
    const data = b.subarray(
      local + 30 + lName + lExtra,
      local + 30 + lName + lExtra + size,
    );
    if (!name.includes('..'))
      out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at += 46 + nameLen + extra + comment;
  }
  return out;
}
